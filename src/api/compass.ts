import { Hono } from 'hono'
import { safeError, normalizeRating, type Bindings } from '../lib'
import { createInboxCapture } from '../services/capture'
import { calibratedConfidence, canonicalizeUrl, deriveCandidateFeatures, pairwiseDominance, semanticSimilarity, serverScore, urlOf, type CompassContext, type SourceCheck } from '../compass-scoring'

const app = new Hono<{ Bindings: Bindings }>()
const STRATEGIES = new Set(['fit', 'bridge', 'challenge'])
type ScoredCandidate = { item: any; index: number; features: ReturnType<typeof deriveCandidateFeatures>; score: number; baseScore: number; dominance: number; uncertainty: number; sourceCheck: SourceCheck }
type PreparedCandidate = { item: any; index: number; features: ReturnType<typeof deriveCandidateFeatures>; url: string; sourceCheck: SourceCheck }

const checkSource = async (item: any): Promise<SourceCheck> => {
  const url = urlOf(item)
  if (!url) return { status: 'invalid' }
  const host = new URL(url).hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host.includes(':') || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return { status: 'invalid' }
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(3500), headers: { 'user-agent': 'LearningCompassVerifier/1.0' } })
    const result = { http_status: response.status, final_url: canonicalizeUrl(response.url || url) }
    if (response.status === 404 || response.status === 410) {
      const retry = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(2500), headers: { 'user-agent': 'LearningCompassVerifier/1.0', range: 'bytes=0-0' } })
      const retried = { http_status: retry.status, final_url: canonicalizeUrl(retry.url || url) }
      if (retry.ok) return { status: 'verified', ...retried }
      if ([401, 403, 405, 429].includes(retry.status)) return { status: 'restricted', ...retried }
      return { status: 'unavailable', ...retried }
    }
    if (response.ok) return { status: 'verified', ...result }
    if ([401, 403, 405, 429].includes(response.status)) return { status: 'restricted', ...result }
    return { status: 'unknown', ...result }
  } catch { return { status: 'unknown' } }
}

const loadCompassContext = async (DB: D1Database): Promise<CompassContext> => {
  const [history, mastered, blacklist, trust, vectors, priorities, formats, recent] = await Promise.all([
    DB.prepare(`SELECT video_url,video_title,creator,status FROM recommendations WHERE status IN ('consumed','active','rejected') LIMIT 2000`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT label,author FROM mastered`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT name,work FROM blacklist`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT creator,COUNT(*) sample_count,AVG(COALESCE(actual_score,CASE outcome_status WHEN 'rejected' THEN 2 WHEN 'abandoned' THEN 3 END)) average_score FROM recommendation_outcomes WHERE creator IS NOT NULL AND outcome_status IN ('consumed','rejected','abandoned') GROUP BY creator`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT topic,affinity_score FROM taste_vectors`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT COALESCE(label,branch_id) topic FROM priorities ORDER BY rank`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT LOWER(COALESCE(format,'unknown')) format,COUNT(*) sample_count,AVG(COALESCE(actual_score,CASE outcome_status WHEN 'rejected' THEN 2 WHEN 'abandoned' THEN 3 END)) average_score FROM recommendation_outcomes WHERE outcome_status IN ('consumed','rejected','abandoned') GROUP BY LOWER(COALESCE(format,'unknown'))`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT LOWER(COALESCE(format,'unknown')) format FROM recommendation_outcomes WHERE outcome_status='consumed' ORDER BY COALESCE(consumed_at,evaluated_at) DESC LIMIT 5`).all<any>().catch(() => ({ results: [] })),
  ])
  const terms = [...(mastered.results || []), ...(blacklist.results || [])]
    .flatMap((row: any) => [row.label, row.author, row.work, row.name])
    .map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.length >= 4)
  return {
    knownSources: (history.results || []).map((row: any) => ({ url: row.video_url || '', title: row.video_title || '', creator: row.creator || '', status: row.status || '' })),
    blockedEntities: [...new Set(terms)],
    creatorTrust: new Map((trust.results || []).map((row: any) => [String(row.creator).trim().toLowerCase(), { average: Number(row.average_score || 5), count: Number(row.sample_count || 0) }])),
    topicAffinities: new Map((vectors.results || []).map((row: any) => [String(row.topic).toLowerCase(), Number(row.affinity_score)])),
    priorityTopics: new Set((priorities.results || []).map((row: any) => String(row.topic || '').trim().toLowerCase()).filter(Boolean)),
    formatOutcomes: new Map((formats.results || []).map((row: any) => [String(row.format), { average: Number(row.average_score || 5), count: Number(row.sample_count || 0) }])),
    recentFormats: (recent.results || []).map((row: any) => String(row.format)),
  }
}

async function currentPick(DB: D1Database) {
  // Repair completion through shared feedback/session routes before reading
  // or enforcing the one-active-pick invariant.
  await DB.prepare(`
    UPDATE compass_picks
    SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now')
    WHERE status IN ('ready','started') AND recommendation_id IN (
      SELECT id FROM recommendations WHERE status IN ('consumed','rejected')
    )
  `).run()
  return DB.prepare(`
    SELECT p.*, r.video_title, r.creator, r.content_type, r.video_url, r.why_this
    FROM compass_picks p LEFT JOIN recommendations r ON r.id=p.recommendation_id
    WHERE p.status IN ('ready','started') AND COALESCE(r.status,'active') NOT IN ('consumed','rejected')
    ORDER BY p.created_at DESC LIMIT 1
  `).first<any>()
}

app.get('/pick', async (c) => {
  try {
    const pick = await currentPick(c.env.DB)
    if (!pick) return c.json({ pick: null })
    const candidates = await c.env.DB.prepare(`SELECT id,title,creator,format,source_class,score,uncertainty,is_verified,is_winner FROM compass_candidates WHERE pick_id=? ORDER BY score DESC`).bind(pick.id).all<any>()
    return c.json({ pick: { ...pick, rationale: JSON.parse(pick.rationale_json || '{}'), candidates: candidates.results || [] } })
  } catch (err) { return c.json(safeError('Failed to read Compass Pick')(err), 500) }
})

/** Hermes submits 3-8 candidates; the Worker owns scoring, selection, and abstention. */
app.post('/picks', async (c) => {
  try {
    const body = await c.req.json<any>()
    const strategy = String(body.strategy || 'fit')
    const candidates = Array.isArray(body.candidates) ? body.candidates : []
    if (!STRATEGIES.has(strategy)) return c.json({ error: 'strategy must be fit, bridge, or challenge' }, 400)
    if (candidates.length < 3 || candidates.length > 8) return c.json({ error: 'adaptive search accepts 3 to 8 candidates' }, 400)
    if (await currentPick(c.env.DB)) return c.json({ error: 'unresolved Compass Pick already exists' }, 409)
    const context = await loadCompassContext(c.env.DB)
    const sourceChecks = await Promise.all(candidates.map(checkSource))
    const submittedKeys = new Set<string>()
    const prepared: PreparedCandidate[] = candidates.map((item: any, index: number) => {
      const sourceCheck = sourceChecks[index]
      const features = deriveCandidateFeatures(item, context, sourceCheck)
      const url = urlOf(item)
      const duplicate = submittedKeys.has(url) || candidates.slice(0, index).some((other: any) => semanticSimilarity(`${item.title || ''} ${item.creator || ''}`, `${other.title || ''} ${other.creator || ''}`) >= .88)
      if (duplicate) { features._hard_excluded = true; features._exclusion_reason = 'duplicate_submission' }
      if (url) submittedKeys.add(url)
      return { item, index, features, url, sourceCheck }
    })
    const eligibleFeatures = prepared.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded).map((entry) => entry.features)
    const scored: ScoredCandidate[] = prepared.map(({ item, index, features, sourceCheck }) => {
      const baseScore = serverScore(features, strategy)
      const dominance = pairwiseDominance(features, eligibleFeatures)
      const score = baseScore * .90 + dominance * .10
      const uncertainty = Math.max(0, Math.min(1, .48 - Number(features.evidence_quality) * .18 + (sourceCheck.status === 'unknown' ? .14 : 0) + (features._hard_excluded ? .30 : 0)))
      return { item, index, features, score, baseScore, dominance, uncertainty, sourceCheck }
    }).sort((a, b) => b.score - a.score)
    const eligible = scored.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded)
    const ranked = eligible.length ? eligible : scored
    const winner = ranked[0]
    const second = ranked[1]
    const margin = second ? winner.score - second.score : 0
    const verified = Boolean(winner.features._valid_url && winner.features._has_identity && Number(winner.features.evidence_quality) >= .70 && !['invalid','unavailable'].includes(winner.sourceCheck.status))
    const confidence = calibratedConfidence(winner.score, winner.uncertainty, margin, winner.dominance)
    const weak = eligible.length < 2 || !winner
    const confident = !weak && verified && winner.score >= .68 && confidence >= .67
    const requestId = String(body.request_id || crypto.randomUUID())
    const pickId = `pick_${crypto.randomUUID()}`
    const status = confident ? 'ready' : 'abstained'
    const abstentionReason = !eligible.length ? 'all_candidates_ineligible'
        : eligible.length < 2 ? 'not_enough_eligible_candidates'
      : !verified ? 'winner_not_verifiable'
        : winner.score < .68 ? 'winner_below_score_threshold'
          : confidence < .67 ? 'insufficient_calibrated_confidence' : 'candidate_set_not_usable'
    let recommendationId: string | null = null
    if (confident) {
      const capture = await createInboxCapture(c.env.DB, { source: urlOf(winner.item), title: String(winner.item.title) })
      recommendationId = capture.id
      const rationale = winner.item.why_this || (typeof winner.item.evidence === 'string' ? winner.item.evidence : null)
      await c.env.DB.prepare(`UPDATE recommendations SET creator=?,content_type=?,why_this=? WHERE id=?`).bind(winner.item.creator || null, winner.item.format || winner.item.source_class || null, rationale, recommendationId).run()
      await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='compass_pick',source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),updated_at=datetime('now') WHERE recommendation_id=?`).bind(JSON.stringify({ compass_pick_id: pickId, strategy }), recommendationId).run()
      await c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,source_class,format,creator,predicted_score,predicted_confidence,predicted_components_json,outcome_status) VALUES (?,?,?,?,?,?,?,?, 'active') ON CONFLICT(recommendation_id) DO UPDATE SET predicted_score=excluded.predicted_score,predicted_confidence=excluded.predicted_confidence,predicted_components_json=excluded.predicted_components_json,evaluated_at=datetime('now')`).bind(`outcome_${recommendationId}`, recommendationId, winner.item.source_class || null, winner.item.format || null, winner.item.creator || null, winner.score * 10, confidence, JSON.stringify(winner.features)).run()
    }
    await c.env.DB.prepare(`INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count,search_rounds,stop_reason,confidence,margin,rationale_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(pickId, requestId, strategy, status, recommendationId, scored.length, scored.length > 3 ? 2 : 1, confident ? 'winner_confident' : abstentionReason, confidence, margin, JSON.stringify({ why_this: winner.item.why_this || '', why_now: winner.item.why_now || '', expected_learning: winner.item.expected_learning || '', cost: winner.item.cost || null, score: winner.score, confidence, uncertainty: winner.uncertainty, score_breakdown: winner.features, source_check: winner.sourceCheck, abstention_reason: confident ? null : abstentionReason, exclusions: scored.filter((entry) => entry.features._hard_excluded).map((entry) => ({ title: entry.item.title, reason: entry.features._exclusion_reason })) })).run()
    for (const entry of scored) {
      await c.env.DB.prepare(`INSERT INTO compass_candidates (id,pick_id,canonical_url,title,creator,format,source_class,features_json,evidence_json,score,uncertainty,is_verified,is_winner) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(`cc_${crypto.randomUUID()}`, urlOf(entry.item), String(entry.item.title), entry.item.creator || null, entry.item.format || null, entry.item.source_class || null, JSON.stringify(entry.features), JSON.stringify(entry.item.evidence || entry.item.rationale || {}), entry.score, entry.uncertainty, entry.features._valid_url && entry.features._has_identity && Number(entry.features.evidence_quality) >= .70 && !['invalid','unavailable'].includes(entry.sourceCheck.status) ? 1 : 0, entry === winner ? 1 : 0).run()
    }
    return c.json({ ok: true, status, pick_id: pickId, recommendation_id: recommendationId, candidate_count: scored.length, eligible_count: eligible.length, score: winner.score, confidence, margin, source_check: winner.sourceCheck.status, abstention_reason: confident ? null : abstentionReason })
  } catch (err) { return c.json(safeError('Failed to create Compass Pick')(err), 500) }
})

app.post('/pick/:id/start', async (c) => {
  try {
    const pick = await c.env.DB.prepare(`SELECT * FROM compass_picks WHERE id=? AND status='ready'`).bind(c.req.param('id')).first<any>()
    if (!pick || !pick.recommendation_id) return c.json({ error: 'ready Compass Pick not found' }, 404)
    const active = await c.env.DB.prepare(`SELECT COUNT(*) c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<any>().catch(() => ({ c: 5 }))
    if (Number(active?.c || 0) >= 5) return c.json({ error: 'queue capacity reached' }, 409)
    const sessionId = `session_${crypto.randomUUID()}`
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE compass_picks SET status='started',updated_at=datetime('now') WHERE id=? AND status='ready'`).bind(pick.id),
      c.env.DB.prepare(`UPDATE recommendations SET status='active',updated_at=datetime('now') WHERE id=?`).bind(pick.recommendation_id),
      c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='queued',updated_at=datetime('now') WHERE recommendation_id=?`).bind(pick.recommendation_id),
      c.env.DB.prepare(`INSERT INTO learning_sessions (id,recommendation_id,status,intent,started_at) VALUES (?,?, 'active', ?, datetime('now'))`).bind(sessionId, pick.recommendation_id, 'Compass Pick'),
    ])
    return c.json({ ok: true, pick_id: pick.id, recommendation_id: pick.recommendation_id, session_id: sessionId })
  } catch (err) { return c.json(safeError('Failed to start Compass Pick')(err), 500) }
})

app.post('/pick/:id/feedback', async (c) => {
  try {
    const body = await c.req.json<any>()
    const pick = await c.env.DB.prepare(`SELECT * FROM compass_picks WHERE id=? AND status IN ('ready','started')`).bind(c.req.param('id')).first<any>()
    if (!pick) return c.json({ error: 'active Compass Pick not found' }, 404)
    const outcome = String(body.outcome || 'declined')
    if (!['started','completed','declined','abandoned'].includes(outcome)) return c.json({ error: 'invalid outcome' }, 400)
    const rating = normalizeRating(body.score)
    const nextStatus = outcome === 'completed' ? 'resolved' : outcome === 'declined' ? 'declined' : outcome === 'abandoned' ? 'resolved' : 'started'
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO compass_feedback (id,pick_id,recommendation_id,outcome,score,reason_tags_json,reflection) VALUES (?,?,?,?,?,?,?)`).bind(`cf_${crypto.randomUUID()}`, pick.id, pick.recommendation_id, outcome, rating.score, JSON.stringify(Array.isArray(body.reason_tags) ? body.reason_tags.slice(0, 8) : []), body.reflection || null),
      c.env.DB.prepare(`UPDATE compass_picks SET status=?,updated_at=datetime('now'),resolved_at=CASE WHEN ? IN ('resolved','declined') THEN datetime('now') ELSE resolved_at END WHERE id=?`).bind(nextStatus, nextStatus, pick.id),
      ...(pick.recommendation_id ? [c.env.DB.prepare(`UPDATE recommendation_outcomes SET outcome_status=?,actual_score=COALESCE(?,actual_score),evaluated_at=datetime('now') WHERE recommendation_id=?`).bind(outcome === 'completed' ? 'consumed' : outcome === 'declined' ? 'rejected' : outcome === 'abandoned' ? 'abandoned' : 'active', rating.score, pick.recommendation_id)] : []),
    ])
    return c.json({ ok: true, pick_id: pick.id, status: nextStatus })
  } catch (err) { return c.json(safeError('Failed to record Compass feedback')(err), 500) }
})

export default app
