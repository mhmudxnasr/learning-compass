type DBLike = D1Database

const rows = async (db: DBLike, sql: string, ...args: any[]) => (await db.prepare(sql).bind(...args).all<any>()).results || []
const first = async (db: DBLike, sql: string, ...args: any[]) => await db.prepare(sql).bind(...args).first<any>()
const scoreSql = `COALESCE(user_score, CASE user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END)`

export async function hermesWeeklyReport(db: DBLike, now = new Date()) {
  const end = now.toISOString()
  const sqlTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')
  const sinceDate = sqlTime(new Date(now.getTime() - 7 * 86400000))
  const priorSince = sqlTime(new Date(now.getTime() - 14 * 86400000))
  const [quality, abandoned, creators, formats, currentDrift, priorDrift] = await Promise.all([
    first(db, `SELECT COUNT(*) total,SUM(CASE WHEN outcome_status='consumed' THEN 1 ELSE 0 END) consumed,SUM(CASE WHEN outcome_status='rejected' THEN 1 ELSE 0 END) rejected,SUM(CASE WHEN outcome_status IN ('abandoned','deleted') THEN 1 ELSE 0 END) abandoned,ROUND(AVG(CASE WHEN predicted_score IS NOT NULL AND actual_score IS NOT NULL THEN ABS(predicted_score-actual_score) END),2) prediction_error FROM recommendation_outcomes WHERE COALESCE(evaluated_at,created_at)>=?`, sinceDate),
    rows(db, `SELECT COALESCE(source_class,'unknown') source_class,COUNT(*) count FROM recommendation_outcomes WHERE outcome_status IN ('abandoned','deleted') AND COALESCE(evaluated_at,created_at)>=? GROUP BY source_class ORDER BY count DESC`, sinceDate),
    rows(db, `SELECT creator,COUNT(*) total,ROUND(AVG(${scoreSql}),2) average_score FROM recommendations WHERE status='consumed' AND consumed_date>=? AND creator IS NOT NULL AND creator!='' GROUP BY creator HAVING total>=1 ORDER BY average_score DESC,total DESC LIMIT 10`, sinceDate.slice(0, 10)),
    rows(db, `SELECT COALESCE(content_type,'unknown') format,COUNT(*) total,ROUND(AVG(${scoreSql}),2) average_score FROM recommendations WHERE status='consumed' AND consumed_date>=? GROUP BY content_type ORDER BY average_score DESC,total DESC`, sinceDate.slice(0, 10)),
    rows(db, `SELECT COALESCE(branch_id,'unmapped') branch,ROUND(AVG(score),2) average_score,COUNT(*) count FROM rating_events WHERE created_at>=? GROUP BY branch_id`, sinceDate),
    rows(db, `SELECT COALESCE(branch_id,'unmapped') branch,ROUND(AVG(score),2) average_score,COUNT(*) count FROM rating_events WHERE created_at>=? AND created_at<? GROUP BY branch_id`, priorSince, sinceDate),
  ])
  const prior = new Map(priorDrift.map((item: any) => [item.branch, Number(item.average_score || 0)]))
  const tasteDrift = currentDrift.map((item: any) => ({ ...item, change: Math.round((Number(item.average_score || 0) - (prior.get(item.branch) || 0)) * 100) / 100 }))
  const total = Number(quality?.total || 0)
  return {
    period: { since: sinceDate, until: end },
    accuracy: { ...quality, total, completion_rate: total ? Math.round((Number(quality?.consumed || 0) / total) * 100) : null, prediction_error: quality?.prediction_error == null ? null : Number(quality.prediction_error) },
    abandoned_sources: abandoned,
    best_creators: creators,
    best_formats: formats,
    taste_drift: tasteDrift,
  }
}

export function hermesEvaluatorCandidates(report: Awaited<ReturnType<typeof hermesWeeklyReport>>) {
  return [
    ...report.best_formats
      .filter((item: any) => Number(item.total) >= 3 && Number(item.average_score) < 6)
      .map((item: any) => ({
        change_type: 'quality_rule',
        label: `format:${item.format}`,
        proposed: { kind: 'format_guardrail', format: item.format, action: 'deprioritize', average_score: Number(item.average_score), sample_size: Number(item.total) },
        reason: `${item.format} averaged ${item.average_score}/10 across ${item.total} consumed items.`,
      })),
    ...report.best_creators
      .filter((item: any) => Number(item.total) >= 3 && Number(item.average_score) >= 8)
      .map((item: any) => ({
        change_type: 'pattern_hypothesis',
        label: `creator:${item.creator}`,
        proposed: { kind: 'creator_preference', creator: item.creator, action: 'prefer', average_score: Number(item.average_score), sample_size: Number(item.total) },
        reason: `${item.creator} averaged ${item.average_score}/10 across ${item.total} consumed items.`,
      })),
  ]
}

export async function createHermesEvaluatorProposals(db: DBLike, now = new Date()) {
  const report = await hermesWeeklyReport(db, now)
  const proposals: any[] = []
  const candidates = hermesEvaluatorCandidates(report)
  for (const candidate of candidates) {
    const id = `eval_${report.period.since.slice(0, 10)}_${candidate.label.replace(/[^a-z0-9]+/gi, '_').slice(0, 100)}`
    const existing = await first(db, `SELECT id FROM feedback_proposals WHERE id=?`, id)
    if (existing) continue
    const fingerprint = ['', '', candidate.change_type, candidate.label, JSON.stringify(candidate.proposed)].join('|').toLowerCase().replace(/\s+/g, ' ').slice(0, 1800)
    await db.prepare(`INSERT OR IGNORE INTO feedback_proposals (id,change_type,target_label,current_json,proposed_json,evidence,reasoning,confidence,status,fingerprint) VALUES (?,?,?,?,?,?,?,?, 'pending',?)`)
      .bind(id, candidate.change_type, candidate.label, '{}', JSON.stringify(candidate.proposed), JSON.stringify(report), candidate.reason, 0.8, fingerprint).run()
    proposals.push({ id, change_type: candidate.change_type, target_label: candidate.label, reasoning: candidate.reason })
  }
  if (proposals.length) await db.prepare(`INSERT INTO update_log (kind,summary,details_json) VALUES ('system',?,?)`).bind(`Hermes evaluator created ${proposals.length} review proposals`, JSON.stringify({ period: report.period, proposals })).run()
  return { report, proposals }
}

export async function backfillHermesIntelligence(db: DBLike, dryRun = true) {
  const [missingCards, missingOutcomes, consumedBranches, creators, contradictionCandidates] = await Promise.all([
    first(db, `SELECT COUNT(*) count FROM srs_drafts d WHERE d.status='approved' AND NOT EXISTS (SELECT 1 FROM srs_cards c WHERE c.question=d.question AND c.answer=d.answer)`),
    first(db, `SELECT COUNT(*) count FROM recommendations r LEFT JOIN recommendation_outcomes o ON o.recommendation_id=r.id WHERE o.id IS NULL`),
    rows(db, `SELECT COALESCE(m.branch_id,substr(r.dedup_key,1,instr(r.dedup_key||'-','-')-1),'unmapped') topic,COUNT(*) count,ROUND(AVG(${scoreSql}),2) average_score,MAX(r.consumed_date) last_consumed_at FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='consumed' GROUP BY topic`),
    rows(db, `SELECT creator,COUNT(*) total,ROUND(AVG(${scoreSql}),2) average_score,MAX(consumed_date) last_feedback_at FROM recommendations WHERE status='consumed' AND creator IS NOT NULL AND creator!='' GROUP BY creator`),
    rows(db, `SELECT a.id source_a,b.id source_b,COALESCE(ma.branch_id,substr(a.dedup_key,1,instr(a.dedup_key||'-','-')-1),'unmapped') topic FROM recommendations a JOIN recommendations b ON a.id<b.id LEFT JOIN recommendation_meta ma ON ma.recommendation_id=a.id WHERE a.status='consumed' AND b.status='consumed' AND COALESCE(ma.branch_id,substr(a.dedup_key,1,instr(a.dedup_key||'-','-')-1))=COALESCE((SELECT mb.branch_id FROM recommendation_meta mb WHERE mb.recommendation_id=b.id),substr(b.dedup_key,1,instr(b.dedup_key||'-','-')-1)) LIMIT 200`),
  ])
  const summary: any = { dry_run: dryRun, missing_srs_cards: Number(missingCards?.count || 0), missing_outcomes: Number(missingOutcomes?.count || 0), taste_vectors: consumedBranches.length, creator_trust: creators.length, contradiction_candidates: contradictionCandidates.length, inserted: { srs_cards: 0, outcomes: 0, taste_vectors: 0, creator_trust: 0, contradictions: 0 } }
  if (dryRun) return summary

  const drafts = await rows(db, `SELECT d.* FROM srs_drafts d WHERE d.status='approved' AND NOT EXISTS (SELECT 1 FROM srs_cards c WHERE c.question=d.question AND c.answer=d.answer) LIMIT 500`)
  for (const d of drafts) { const result = await db.prepare(`INSERT OR IGNORE INTO srs_cards (id,recommendation_id,question,answer,topic) VALUES (?,?,?,?,?)`).bind(`backfill_card_${d.id}`, d.recommendation_id || null, d.question, d.answer, d.topic || 'general').run(); summary.inserted.srs_cards += result.meta.changes || 0 }
  const recs = await rows(db, `SELECT r.id,r.creator,r.content_type,r.status,r.user_score,r.user_rating,r.consumed_date,m.branch_id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN recommendation_outcomes o ON o.recommendation_id=r.id WHERE o.id IS NULL LIMIT 1000`)
  for (const r of recs) { const actual = r.user_score ?? ({ love: 10, like: 8, meh: 5, dislike: 2 } as any)[r.user_rating] ?? null; const result = await db.prepare(`INSERT OR IGNORE INTO recommendation_outcomes (id,recommendation_id,creator,format,branch_id,outcome_status,actual_score,consumed_at,evaluated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(`outcome_${r.id}`, r.id, r.creator || null, r.content_type || null, r.branch_id || null, r.status === 'consumed' ? 'consumed' : r.status === 'rejected' ? 'rejected' : 'active', actual, r.consumed_date || null).run(); summary.inserted.outcomes += result.meta.changes || 0 }
  for (const v of consumedBranches) { await db.prepare(`INSERT INTO taste_vectors (topic,affinity_score,consumption_count,last_consumed_at,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(topic) DO UPDATE SET affinity_score=excluded.affinity_score,consumption_count=excluded.consumption_count,last_consumed_at=excluded.last_consumed_at,updated_at=datetime('now')`).bind(v.topic, Number(v.average_score || 0) / 2, Number(v.count || 0), v.last_consumed_at).run(); summary.inserted.taste_vectors++ }
  for (const creator of creators) { const trust = Math.round((Number(creator.average_score || 0) * .7 + Math.min(Number(creator.total || 0), 10) * .3) * 10) / 10; await db.prepare(`INSERT INTO creator_trust (creator,total,average_score,trust_index,last_feedback_at,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(creator) DO UPDATE SET total=excluded.total,average_score=excluded.average_score,trust_index=excluded.trust_index,last_feedback_at=excluded.last_feedback_at,updated_at=datetime('now')`).bind(creator.creator, creator.total, creator.average_score, trust, creator.last_feedback_at).run(); summary.inserted.creator_trust++ }
  for (const pair of contradictionCandidates) { const result = await db.prepare(`INSERT OR IGNORE INTO contradictions (id,source_a,source_b,topic,tension) VALUES (?,?,?,?,?)`).bind(`backfill_${pair.source_a}_${pair.source_b}`, pair.source_a, pair.source_b, pair.topic, 'Same learning branch; review for conflicting claims.').run(); summary.inserted.contradictions += result.meta.changes || 0 }
  await db.prepare(`INSERT INTO update_log (kind,summary,details_json) VALUES ('system',?,?)`).bind('Hermes intelligence backfill completed', JSON.stringify(summary)).run()
  return summary
}
