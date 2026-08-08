import { Hono } from 'hono'
import { adaptAndNormalizeWeights, computeDecayedAffinity } from '../domain'
import { Bindings, safeError } from '../lib'
import { backfillHermesIntelligence, createHermesEvaluatorProposals, hermesWeeklyReport } from '../services/hermes-intelligence'
import { canonicalTasteIdentity, tasteEvidence } from './taste'

const app = new Hono<{ Bindings: Bindings }>()
const all = async (statement: D1PreparedStatement) => (await statement.all<any>()).results || []
const allOr = async (statement: D1PreparedStatement) => { try { return await all(statement) } catch { return [] } }

app.get('/knowledge/graph', async (c) => {
  const [nodes, explicit, hierarchy] = await Promise.all([
    all(c.env.DB.prepare(`SELECT id,type,label,super_category,parent_id,status,round_label,meta_json FROM tree_nodes ORDER BY type,label LIMIT 1500`)),
    allOr(c.env.DB.prepare(`SELECT id,source_id,target_id,relation_type,evidence_json,confidence FROM knowledge_edges ORDER BY confidence DESC LIMIT 1000`)),
    all(c.env.DB.prepare(`SELECT 'parent-'||id id,parent_id source_id,id target_id,'hierarchy' relation_type,'[]' evidence_json,1 confidence FROM tree_nodes WHERE parent_id IS NOT NULL`)),
  ])
  return c.json({ nodes, edges: [...hierarchy, ...explicit] })
})

app.get('/knowledge/blind-spots', async (c) => {
  const gaps = await all(c.env.DB.prepare(`SELECT n.id,n.label,n.super_category,n.status,COUNT(r.id) consumed_count
    FROM tree_nodes n
    LEFT JOIN recommendation_meta m ON m.branch_id=n.id
    LEFT JOIN recommendations r ON r.id=m.recommendation_id AND r.status='consumed'
    WHERE n.type IN ('branch','leaf') GROUP BY n.id HAVING consumed_count=0 ORDER BY n.super_category,n.label`))
  return c.json({ blind_spots: gaps, count: gaps.length })
})

app.get('/learning/health', async (c) => {
  const branches = await all(c.env.DB.prepare(`SELECT COALESCE(m.branch_id, substr(r.dedup_key,1,instr(r.dedup_key||'-','-')-1),'unmapped') branch,COUNT(*) total,SUM(CASE WHEN r.status='consumed' THEN 1 ELSE 0 END) consumed,MAX(r.consumed_date) last_activity FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id GROUP BY branch ORDER BY total DESC`))
  const health = branches.map((row: any) => ({ ...row, health: !row.last_activity ? 'neglected' : row.consumed >= 3 ? 'healthy' : 'growing' }))
  return c.json({ health, healthy: health.filter((row: any) => row.health === 'healthy').length, neglected: health.filter((row: any) => row.health === 'neglected').length })
})

app.get('/taste/dna', async (c) => {
  const [vectors, ratings, categories] = await Promise.all([
    all(c.env.DB.prepare(`SELECT topic,affinity_score,consumption_count,last_consumed_at FROM taste_vectors ORDER BY affinity_score DESC`)),
    all(c.env.DB.prepare(`SELECT user_rating,COUNT(*) count FROM recommendations WHERE status='consumed' GROUP BY user_rating`)),
    all(c.env.DB.prepare(`SELECT content_type,COUNT(*) count FROM recommendations GROUP BY content_type`)),
  ])
  const merged = new Map<string, any>()
  for (const item of vectors) {
    const topic = canonicalTasteIdentity(item.topic)
    const current = merged.get(topic) || { topic, affinity_score: 0, consumption_count: 0, last_consumed_at: null }
    current.affinity_score += Number(item.affinity_score || 0)
    current.consumption_count += Number(item.consumption_count || 0)
    if (!current.last_consumed_at || String(item.last_consumed_at || '') > current.last_consumed_at) current.last_consumed_at = item.last_consumed_at
    merged.set(topic, current)
  }
  const normalized = [...merged.values()].map((item: any) => ({ ...item, ...computeDecayedAffinity(Number(item.affinity_score || 0), item.last_consumed_at), ...tasteEvidence(item.consumption_count, item.last_consumed_at) }))
  const activeVectors = normalized.filter((item: any) => Number(item.affinity_score) !== 0 && item.evidence_status === 'usable')
  return c.json({ vectors: normalized, ratings, categories, interest: activeVectors.length, diversity: categories.length, momentum: activeVectors.filter((item: any) => item.last_consumed_at).length })
})

app.get('/analytics/creator-trust', async (c) => {
  const creators = await all(c.env.DB.prepare(`SELECT creator,user_score,user_rating,consumed_date,updated_at FROM recommendations WHERE creator IS NOT NULL AND creator!='' AND status='consumed' AND (user_score IS NOT NULL OR user_rating IN ('love','like','meh','dislike'))`))
  const grouped = new Map<string, any>()
  for (const row of creators) {
    const creator = canonicalTasteIdentity(row.creator, '')
    if (!creator) continue
    const score = row.user_score == null ? ({ love: 10, like: 8, meh: 5, dislike: 2 } as Record<string, number>)[row.user_rating] : Number(row.user_score)
    if (!Number.isFinite(score)) continue
    const current = grouped.get(creator) || { creator, total: 0, sum: 0, loves: 0, last_feedback_at: null }
    current.total += 1; current.sum += score; current.loves += row.user_rating === 'love' ? 1 : 0
    if (!current.last_feedback_at || String(row.consumed_date || row.updated_at || '') > current.last_feedback_at) current.last_feedback_at = row.consumed_date || row.updated_at
    grouped.set(creator, current)
  }
  const result = [...grouped.values()].map((row) => {
    const average_score = row.sum / row.total
    const shrunk_score = (row.sum + 15) / (row.total + 3)
    const evidence = tasteEvidence(row.total, row.last_feedback_at)
    return { creator: row.creator, total: row.total, loves: row.loves, average_score: Math.round(average_score * 100) / 100, shrunk_score: Math.round(shrunk_score * 100) / 100, trust_index: Math.round(shrunk_score * evidence.confidence * 10) / 10, last_feedback_at: row.last_feedback_at, ...evidence }
  }).sort((a, b) => b.trust_index - a.trust_index || b.total - a.total)
  return c.json({ creators: result })
})

app.get('/analytics/taste-drift', async (c) => {
  const events = await all(c.env.DB.prepare(`SELECT substr(created_at,1,7) month,COALESCE(branch_id,'unmapped') branch,ROUND(AVG(score),2) average_score,COUNT(*) count FROM rating_events GROUP BY month,branch ORDER BY month`))
  return c.json({ events })
})
app.get('/analytics/heatmaps', async (c) => {
  const days = await all(c.env.DB.prepare(`SELECT date,count,topics FROM learning_log ORDER BY date DESC LIMIT 366`))
  return c.json({ days, active_days: days.filter((day: any) => day.count > 0).length })
})
app.get('/analytics/forecast', async (c) => {
  const [due7, due30, cards, gaps] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now','+7 days')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now','+30 days')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM tree_nodes WHERE type IN ('branch','leaf')`).first<any>(),
  ])
  return c.json({ due_next_7_days: due7?.count || 0, due_next_30_days: due30?.count || 0, total_cards: cards?.count || 0, mapped_topics: gaps?.count || 0 })
})

// Hermes control surface: one compact read model for operations, quality, memory, and drift.
app.get('/analytics/hermes', async (c) => {
  const { DB } = c.env
  try {
    const calibrationRows = await allOr(DB.prepare(`SELECT o.predicted_score,o.actual_score,o.format,o.creator,p.strategy
      FROM recommendation_outcomes o LEFT JOIN compass_picks p ON p.recommendation_id=o.recommendation_id
      WHERE o.actual_score IS NOT NULL`))
    const [jobCounts, stale, retryQueue, deadLetters, quality, qualityByFormat, memory, alerts, failures, weights, proposals, compassPriors, compassWeights] = await Promise.all([
      DB.prepare(`SELECT status,COUNT(*) count FROM agent_jobs GROUP BY status`).all<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM agent_jobs WHERE status='running' AND lease_expires_at < datetime('now')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM agent_job_retries WHERE dead_lettered_at IS NULL AND next_attempt_at > datetime('now')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM agent_job_retries WHERE dead_lettered_at IS NOT NULL`).first<any>(),
      DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN outcome_status='consumed' THEN 1 ELSE 0 END) consumed, SUM(CASE WHEN outcome_status='rejected' THEN 1 ELSE 0 END) rejected, SUM(CASE WHEN outcome_status IN ('deleted','abandoned') THEN 1 ELSE 0 END) abandoned, ROUND(AVG(actual_score),2) average_actual, ROUND(AVG(CASE WHEN predicted_score IS NOT NULL AND actual_score IS NOT NULL THEN ABS(predicted_score-actual_score) END),2) prediction_error FROM recommendation_outcomes`).first<any>(),
      DB.prepare(`SELECT COALESCE(format,'unknown') format,COUNT(*) total,SUM(CASE WHEN outcome_status='consumed' THEN 1 ELSE 0 END) consumed,SUM(CASE WHEN outcome_status='rejected' THEN 1 ELSE 0 END) rejected,ROUND(AVG(actual_score),2) average_actual,ROUND(AVG(CASE WHEN predicted_score IS NOT NULL AND actual_score IS NOT NULL THEN ABS(predicted_score-actual_score) END),2) prediction_error FROM recommendation_outcomes GROUP BY format ORDER BY total DESC`).all<any>(),
      DB.prepare(`SELECT memory_kind, status, COUNT(*) count FROM hermes_memory GROUP BY memory_kind,status ORDER BY memory_kind,status`).all<any>(),
      DB.prepare(`SELECT id,kind,severity,title,body,created_at FROM hermes_alerts WHERE acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 12`).all<any>(),
      DB.prepare(`SELECT id,job_type,attempts,error,updated_at FROM agent_jobs WHERE status='failed' ORDER BY updated_at DESC LIMIT 12`).all<any>(),
      DB.prepare(`SELECT dimension,current_weight,baseline_weight,evidence_count,updated_at FROM engine_weights ORDER BY current_weight DESC`).all<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending'`).first<any>(),
      DB.prepare(`SELECT strategy,alpha,beta,explicit_evidence_count,updated_at FROM compass_strategy_priors ORDER BY strategy`).all<any>().catch(() => ({ results: [] })),
      DB.prepare(`SELECT strategy,dimension,current_weight,baseline_weight,evidence_count,updated_at FROM compass_feature_weights ORDER BY strategy,current_weight DESC`).all<any>().catch(() => ({ results: [] })),
    ])
    const statuses: Record<string, number> = {}
    for (const row of jobCounts.results || []) statuses[row.status] = Number(row.count || 0)
    const summarizeCalibration = (key: 'strategy' | 'format' | 'creator') => {
      const groups = new Map<string, { rated: number; paired: number; error: number }>()
      for (const row of calibrationRows) {
        const value = key === 'creator' ? canonicalTasteIdentity(row[key], 'unknown') : String(row[key] || 'unknown').toLowerCase()
        const group = groups.get(value) || { rated: 0, paired: 0, error: 0 }
        group.rated += 1
        if (row.predicted_score != null) { group.paired += 1; group.error += Math.abs(Number(row.predicted_score) - Number(row.actual_score)) }
        groups.set(value, group)
      }
      return [...groups.entries()].map(([label, group]) => ({ [key]: label, rated_outcomes: group.rated, predicted_and_rated_outcomes: group.paired, coverage_percent: group.rated ? Math.round(group.paired / group.rated * 100) : 0, mae: group.paired ? Math.round(group.error / group.paired * 100) / 100 : null, evidence_status: group.paired >= 5 ? 'usable' : 'insufficient' }))
    }
    const paired = calibrationRows.filter((row: any) => row.predicted_score != null)
    const calibration = {
      rated_outcomes: calibrationRows.length,
      predicted_and_rated_outcomes: paired.length,
      coverage_percent: calibrationRows.length ? Math.round(paired.length / calibrationRows.length * 100) : 0,
      mae: paired.length ? Math.round(paired.reduce((sum: number, row: any) => sum + Math.abs(Number(row.predicted_score) - Number(row.actual_score)), 0) / paired.length * 100) / 100 : null,
      evidence_status: paired.length >= 5 ? 'usable' : 'insufficient',
      by_strategy: summarizeCalibration('strategy'), by_format: summarizeCalibration('format'), by_creator: summarizeCalibration('creator'),
    }
    return c.json({
      checked_at: new Date().toISOString(),
      jobs: { statuses, stale_running: Number(stale?.count || 0), delayed_retries: Number(retryQueue?.count || 0), dead_letters: Number(deadLetters?.count || 0), recent_failures: failures.results || [] },
      quality: { ...(quality || {}), completion_rate: Number(quality?.consumed || 0) + Number(quality?.rejected || 0) + Number(quality?.abandoned || 0) ? Math.round((Number(quality?.consumed || 0) / (Number(quality?.consumed || 0) + Number(quality?.rejected || 0) + Number(quality?.abandoned || 0))) * 100) : null, abandonment_rate: Number(quality?.total || 0) ? Math.round((Number(quality?.abandoned || 0) / Number(quality.total)) * 100) : null, by_format: qualityByFormat.results || [] },
      memory: { entries: memory.results || [], active: (memory.results || []).filter((row: any) => row.status === 'active').reduce((sum: number, row: any) => sum + Number(row.count || 0), 0) },
      alerts: alerts.results || [],
      engine_weights: weights.results || [],
      compass_learning: { strategies: compassPriors.results || [], feature_weights: compassWeights.results || [], calibration },
      pending_proposals: Number(proposals?.count || 0),
    })
  } catch (error) {
    return c.json(safeError('Hermes analytics failed')(error), 500)
  }
})

app.post('/analytics/hermes/recalibrate', async (c) => {
  const { DB } = c.env
  try {
    const outcomes = await DB.prepare(`SELECT actual_score,predicted_components_json FROM recommendation_outcomes WHERE actual_score IS NOT NULL AND predicted_components_json IS NOT NULL AND predicted_components_json!='{}'`).all<any>()
    const sample = outcomes.results || []
    if (sample.length < 5) return c.json({ error: 'insufficient_evidence', message: `At least 5 rated discovery outcomes are required; found ${sample.length}.` }, 409)
    const dimensions = ['frontier_potential', 'info_gain', 'personal_pull', 'real_life_relevance', 'source_quality', 'format_exploration']
    const deltas: Record<string, number> = {}
    for (const dimension of dimensions) {
      let signal = 0
      for (const row of sample) {
        let components: any = {}
        try { components = JSON.parse(row.predicted_components_json || '{}') } catch {}
        const component = Math.max(0, Math.min(1, Number(components[dimension] ?? 0.5)))
        signal += component * ((Number(row.actual_score) - 5) / 5)
      }
      // Slow, bounded adaptation. The feedback loop must be evidence-led, never twitchy.
      deltas[dimension] = Math.max(-0.01, Math.min(0.01, (signal / sample.length) * 0.03))
    }
    const current = (await DB.prepare(`SELECT id,dimension,baseline_weight,current_weight,evidence_count,audit_history_json FROM engine_weights`).all<any>()).results || []
    const updated = adaptAndNormalizeWeights(current, deltas)
    await DB.batch(updated.map((item: any) => {
      let history: any[] = []
      try { history = JSON.parse(current.find((row: any) => row.id === item.id)?.audit_history_json || '[]') } catch {}
      history.push({ source: 'recommendation_outcomes', sample_size: sample.length, delta: deltas[item.dimension], at: new Date().toISOString() })
      return DB.prepare(`UPDATE engine_weights SET current_weight=?,evidence_count=?,audit_history_json=?,updated_at=datetime('now') WHERE id=?`).bind(item.current_weight, item.evidence_count, JSON.stringify(history.slice(-20)), item.id)
    }).concat([DB.prepare(`INSERT INTO update_log (kind,summary,details_json) VALUES ('system',?,?)`).bind(`Hermes recalibrated discovery weights from ${sample.length} rated outcomes`, JSON.stringify({ deltas, sample_size: sample.length }))]))
    return c.json({ ok: true, sample_size: sample.length, deltas, weights: updated })
  } catch (error) {
    return c.json(safeError('Hermes recalibration failed')(error), 500)
  }
})

app.get('/analytics/hermes/weekly', async (c) => {
  try { return c.json(await hermesWeeklyReport(c.env.DB)) }
  catch (error) { return c.json(safeError('Hermes weekly evaluator failed')(error), 500) }
})

app.post('/analytics/hermes/evaluate', async (c) => {
  try { return c.json({ ok: true, ...(await createHermesEvaluatorProposals(c.env.DB)) }) }
  catch (error) { return c.json(safeError('Hermes evaluator failed')(error), 500) }
})

app.post('/analytics/hermes/backfill', async (c) => {
  try {
    const body = await c.req.json<{ dry_run?: boolean }>().catch((): { dry_run?: boolean } => ({}))
    return c.json({ ok: true, ...(await backfillHermesIntelligence(c.env.DB, body.dry_run !== false)) })
  } catch (error) { return c.json(safeError('Hermes backfill failed')(error), 500) }
})

export default app
