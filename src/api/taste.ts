import { Hono } from 'hono'
import { Bindings, safeError, isNonEmptyStr } from '../lib'
import { cached } from '../cache'
import { computeDecayedAffinity } from '../domain'

const app = new Hono<{ Bindings: Bindings }>()

// Use one conservative key everywhere taste evidence is grouped. Raw labels stay
// in source records; this only prevents @handles, URLs, and punctuation variants
// from fragmenting a single signal.
export function canonicalTasteIdentity(value: unknown, fallback = 'general') {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return fallback
  const withoutUrl = raw.replace(/^https?:\/\/(?:www\.)?/, '').replace(/^www\./, '').split('/')[0]
  const normalized = withoutUrl.replace(/^@+/, '').replace(/[_\-]+/g, ' ').replace(/[^\p{L}\p{N}\s.&']/gu, ' ').replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

export function tasteEvidence(sampleCount: number, lastConsumed?: string | null) {
  const count = Math.max(0, Number(sampleCount || 0))
  const recency = computeDecayedAffinity(1, lastConsumed || null)
  const sampleConfidence = Math.min(1, count / 5)
  const confidence = Math.round(sampleConfidence * (recency.decayedAffinity || 0) * 100) / 100
  return { sample_count: count, minimum_sample: 3, evidence_status: count >= 3 ? 'usable' : 'insufficient', confidence, stale_days: recency.staleDays }
}

/**
 * GET /brain/taste-vector
 * Compute dynamic affinity scores per topic based on user ratings (love=5, like=3, meh=1, dislike=-2)
 * blended with mega-priority weights.
 */
app.get('/vector', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const data = await cached('taste.vector', 60000, async () => {
    const rawScores = await DB.prepare(`
      SELECT
        COALESCE(m.branch_id, 'unmapped') as topic,
        COUNT(*) as total_consumed,
        SUM(CASE WHEN user_rating = 'love' THEN 5 WHEN user_rating = 'like' THEN 3 WHEN user_rating = 'meh' THEN 1 WHEN user_rating = 'dislike' THEN -2 ELSE 0 END) as total_points,
        MAX(consumed_date) as last_consumed
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.status = 'consumed' AND (r.user_score IS NOT NULL OR r.user_rating IN ('love','like','meh','dislike'))
      GROUP BY topic
    `).all<any>()

    const priorities = await DB.prepare('SELECT rank, branch_id FROM priorities ORDER BY rank ASC').all<any>()
    const priorityMap = new Map<string, number>()
    for (const p of (priorities.results || [])) {
      priorityMap.set(canonicalTasteIdentity(p.branch_id), Math.max(1, 10 - p.rank))
    }

    const grouped = new Map<string, any>()
    for (const row of rawScores.results || []) {
      const topic = canonicalTasteIdentity(row.topic)
      const current = grouped.get(topic) || { topic, total_consumed: 0, total_points: 0, last_consumed: null }
      current.total_consumed += Number(row.total_consumed || 0)
      current.total_points += Number(row.total_points || 0)
      if (!current.last_consumed || String(row.last_consumed || '') > current.last_consumed) current.last_consumed = row.last_consumed
      grouped.set(topic, current)
    }
    const vectors = [...grouped.values()].map((r: any) => {
      const topic = r.topic
      const baseScore = r.total_consumed > 0 ? (r.total_points / r.total_consumed) : 1.0
      const pWeight = priorityMap.get(topic) || 1.0
      const rawAffinity = baseScore * (1 + (pWeight * 0.1))
      const decay = computeDecayedAffinity(rawAffinity, r.last_consumed)
      return {
        topic,
        affinity_score: parseFloat(decay.decayedAffinity.toFixed(2)),
        raw_affinity_score: parseFloat(rawAffinity.toFixed(2)),
        total_consumed: r.total_consumed,
        last_consumed: r.last_consumed,
        priority_boost: pWeight,
        ...tasteEvidence(r.total_consumed, r.last_consumed),
      }
    })

    return { vectors }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Taste vector calculation failed')(err), 500)
  }
})

/**
 * POST /brain/taste-rerank
 * Rerank candidate queue recommendations based on current taste affinity scores & priority rank.
 */
app.post('/rerank', async (c) => {
  const { DB } = c.env
  try {
    const active = await DB.prepare("SELECT r.*,m.branch_id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status = 'active' ORDER BY r.created_at DESC").all<any>()
    const headers: Record<string, string> = {}
    const token = c.req.header('x-api-token')
    if (token) headers['x-api-token'] = token
    const vectorsRes = await fetch(new URL('/taste/vector', c.req.url).toString(), { headers })
    const vectorData = await vectorsRes.json<any>()
    const vMap = new Map<string, number>()
    for (const v of (vectorData.vectors || [])) {
      vMap.set(v.topic, v.affinity_score)
    }

    const reranked = (active.results || []).map((item: any) => {
      const topic = canonicalTasteIdentity(item.branch_id, 'unmapped')
      const affinity = vMap.get(topic) || 1.0
      const score = affinity * (item.why_this ? 1.2 : 1.0)
      return { ...item, topic, rank_score: parseFloat(score.toFixed(2)) }
    }).sort((a, b) => b.rank_score - a.rank_score)

    return c.json({ items: reranked, count: reranked.length })
  } catch (err) {
    return c.json(safeError('Rerank failed')(err), 500)
  }
})

export default app
