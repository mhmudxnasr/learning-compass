import { Hono } from 'hono'
import { safeError, normalizeRating, type Bindings } from '../lib'
import { createInboxCapture } from '../services/capture'

const app = new Hono<{ Bindings: Bindings }>()
const STRATEGIES = new Set(['fit', 'bridge', 'challenge'])
const clamp = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

function serverScore(features: Record<string, unknown>) {
  const weights: Record<string, number> = {
    topic_value: .25, personal_relevance: .20, source_quality: .20,
    information_gain: .15, novelty: .10, format_fit: .10,
  }
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + clamp(features[key], .5) * weight, 0)
  const friction = clamp(features.friction, 0)
  return Math.max(0, Math.min(1, score - friction * .10))
}

async function currentPick(DB: D1Database) {
  return DB.prepare(`
    SELECT p.*, r.video_title, r.creator, r.content_type, r.video_url, r.why_this
    FROM compass_picks p LEFT JOIN recommendations r ON r.id=p.recommendation_id
    WHERE p.status IN ('ready','started') ORDER BY p.created_at DESC LIMIT 1
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
    const scored = candidates.map((item: any, index: number) => {
      const features = { ...(item.features || {}) }
      const score = serverScore(features)
      const uncertainty = clamp(item.uncertainty, .5)
      return { item, index, features, score, uncertainty }
    }).sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    const winner = scored[0]
    const second = scored[1]
    const margin = winner.score - second.score
    const verified = Boolean(winner.item.verified_url || winner.item.is_verified)
    const confident = verified && winner.score >= .70 && margin >= .06
    const requestId = String(body.request_id || crypto.randomUUID())
    const pickId = `pick_${crypto.randomUUID()}`
    const status = confident ? 'ready' : 'abstained'
    let recommendationId: string | null = null
    if (confident) {
      const capture = await createInboxCapture(c.env.DB, { source: String(winner.item.url || winner.item.canonical_url), title: String(winner.item.title) })
      recommendationId = capture.id
      await c.env.DB.prepare(`UPDATE recommendations SET creator=?,content_type=?,why_this=? WHERE id=?`).bind(winner.item.creator || null, winner.item.format || winner.item.source_class || null, winner.item.why_this || null, recommendationId).run()
      await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='compass_pick',source_metadata_json=?,updated_at=datetime('now') WHERE recommendation_id=?`).bind(JSON.stringify({ compass_pick_id: pickId, strategy }), recommendationId).run()
    }
    await c.env.DB.prepare(`INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count,search_rounds,stop_reason,confidence,margin,rationale_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(pickId, requestId, strategy, status, recommendationId, scored.length, scored.length > 3 ? 2 : 1, confident ? 'winner_confident' : 'insufficient_confidence', winner.score, margin, JSON.stringify({ why_this: winner.item.why_this || '', why_now: winner.item.why_now || '', expected_learning: winner.item.expected_learning || '', cost: winner.item.cost || null, uncertainty: winner.uncertainty })).run()
    for (const entry of scored) {
      await c.env.DB.prepare(`INSERT INTO compass_candidates (id,pick_id,canonical_url,title,creator,format,source_class,features_json,evidence_json,score,uncertainty,is_verified,is_winner) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(`cc_${crypto.randomUUID()}`, pickId, String(entry.item.url || entry.item.canonical_url), String(entry.item.title), entry.item.creator || null, entry.item.format || null, entry.item.source_class || null, JSON.stringify(entry.features), JSON.stringify(entry.item.evidence || {}), entry.score, entry.uncertainty, Boolean(entry.item.verified_url || entry.item.is_verified) ? 1 : 0, entry === winner ? 1 : 0).run()
    }
    return c.json({ ok: true, status, pick_id: pickId, recommendation_id: recommendationId, candidate_count: scored.length, score: winner.score, margin })
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
    ])
    return c.json({ ok: true, pick_id: pick.id, status: nextStatus })
  } catch (err) { return c.json(safeError('Failed to record Compass feedback')(err), 500) }
})

export default app
