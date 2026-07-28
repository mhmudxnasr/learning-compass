import { Hono } from 'hono'
import { Bindings, safeError, isNonEmptyStr } from '../lib'
import { cached } from '../cache'

const app = new Hono<{ Bindings: Bindings }>()

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
        COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'general') as topic,
        COUNT(*) as total_consumed,
        SUM(CASE WHEN user_rating = 'love' THEN 5 WHEN user_rating = 'like' THEN 3 WHEN user_rating = 'meh' THEN 1 WHEN user_rating = 'dislike' THEN -2 ELSE 0 END) as total_points,
        MAX(consumed_date) as last_consumed
      FROM recommendations
      WHERE status = 'consumed' AND dedup_key IS NOT NULL AND dedup_key != ''
      GROUP BY topic
    `).all<any>()

    const priorities = await DB.prepare('SELECT rank, branch_id FROM priorities ORDER BY rank ASC').all<any>()
    const priorityMap = new Map<string, number>()
    for (const p of (priorities.results || [])) {
      priorityMap.set(p.branch_id, Math.max(1, 10 - p.rank))
    }

    const vectors = (rawScores.results || []).map((r: any) => {
      const topic = r.topic
      const baseScore = r.total_consumed > 0 ? (r.total_points / r.total_consumed) : 1.0
      const pWeight = priorityMap.get(topic) || 1.0
      const affinity = parseFloat((baseScore * (1 + (pWeight * 0.1))).toFixed(2))
      return {
        topic,
        affinity_score: affinity,
        total_consumed: r.total_consumed,
        last_consumed: r.last_consumed,
        priority_boost: pWeight
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
    const active = await DB.prepare("SELECT * FROM recommendations WHERE status = 'active' ORDER BY created_at DESC").all<any>()
    const vectorsRes = await fetch(new URL('/taste/vector', c.req.url).toString(), { headers: c.req.raw.headers })
    const vectorData = await vectorsRes.json<any>()
    const vMap = new Map<string, number>()
    for (const v of (vectorData.vectors || [])) {
      vMap.set(v.topic, v.affinity_score)
    }

    const reranked = (active.results || []).map((item: any) => {
      const topic = item.dedup_key ? item.dedup_key.split('-')[0] : 'general'
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
