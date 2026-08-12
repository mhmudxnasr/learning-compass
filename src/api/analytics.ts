import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { cached } from '../cache'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * GET /analytics/recommendations
 * Computes recommendation quality metrics for the specified period.
 */
app.get('/recommendations', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const days = Math.min(Math.max(parseInt(c.req.query('days') || '30'), 7), 365)
  const since = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]
  try {
    const data = await cached(`analytics.recs.${days}`, 120000, async () => {
      const [consumed, rejected, ratings, lanes, formats, timeToConsume, resurfacing, exploration] = await Promise.all([
        // Accept rate
        DB.prepare(`SELECT COUNT(*) c FROM recommendations WHERE status='consumed' AND consumed_date>=?`).bind(since).first<{ c: number }>(),
        DB.prepare(`SELECT COUNT(*) c FROM recommendations WHERE status='rejected' AND updated_at>=?`).bind(since).first<{ c: number }>(),
        // Rating distribution
        DB.prepare(`SELECT user_rating, COUNT(*) c FROM recommendations WHERE status='consumed' AND consumed_date>=? AND user_rating NOT IN ('unset','') GROUP BY user_rating`).bind(since).all<{ user_rating: string; c: number }>(),
        // Lane balance
        DB.prepare(`SELECT p.strategy, COUNT(*) c FROM compass_picks p JOIN recommendations r ON r.id=p.recommendation_id WHERE r.status='consumed' AND r.consumed_date>=? GROUP BY p.strategy`).bind(since).all<{ strategy: string; c: number }>(),
        // Format diversity (Shannon entropy)
        DB.prepare(`SELECT content_type, COUNT(*) c FROM recommendations WHERE status='consumed' AND consumed_date>=? AND content_type IS NOT NULL GROUP BY content_type`).bind(since).all<{ content_type: string; c: number }>(),
        // Average time to consume
        DB.prepare(`SELECT AVG(julianday(consumed_date) - julianday(COALESCE(activated_at, created_at))) avg_days FROM recommendations WHERE status='consumed' AND consumed_date>=? AND consumed_date IS NOT NULL`).bind(since).first<{ avg_days: number | null }>(),
        // Resurfacing recall rate
        DB.prepare(`SELECT COUNT(CASE WHEN resolved_at IS NOT NULL THEN 1 END) resolved, COUNT(*) total FROM resurfacing WHERE due_at>=? AND due_at<=date('now')`).bind(since).first<{ resolved: number; total: number }>(),
        // Exploration picks
        DB.prepare(`SELECT COUNT(CASE WHEN p.strategy IN ('bridge','challenge') THEN 1 END) exploration, COUNT(*) total FROM compass_picks p JOIN recommendations r ON r.id=p.recommendation_id WHERE r.status='consumed' AND r.consumed_date>=?`).bind(since).first<{ exploration: number; total: number }>(),
      ])

      const consumedCount = consumed?.c || 0
      const rejectedCount = rejected?.c || 0
      const totalDecisions = consumedCount + rejectedCount
      const acceptRate = totalDecisions > 0 ? Math.round((consumedCount / totalDecisions) * 1000) / 1000 : null

      // Rating distribution
      const ratingDist: Record<string, number> = {}
      for (const row of ratings.results || []) ratingDist[row.user_rating] = row.c

      // Avg rating
      const ratingValues: Record<string, number> = { love: 10, like: 8, meh: 5, dislike: 2 }
      let ratingSum = 0, ratingCount = 0
      for (const [rating, count] of Object.entries(ratingDist)) {
        if (ratingValues[rating] !== undefined) { ratingSum += ratingValues[rating] * count; ratingCount += count }
      }
      const avgRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : null

      // Lane balance
      const laneBalance: Record<string, number> = {}
      const laneTotal = (lanes.results || []).reduce((sum, row) => sum + row.c, 0)
      for (const row of lanes.results || []) laneBalance[row.strategy] = laneTotal > 0 ? Math.round((row.c / laneTotal) * 1000) / 1000 : 0

      // Format diversity (Shannon entropy)
      const formatCounts = (formats.results || []).map(row => row.c)
      const formatTotal = formatCounts.reduce((sum, c) => sum + c, 0)
      let formatEntropy = 0
      if (formatTotal > 0) {
        for (const count of formatCounts) {
          const p = count / formatTotal
          if (p > 0) formatEntropy -= p * Math.log2(p)
        }
      }
      formatEntropy = Math.round(formatEntropy * 1000) / 1000

      // Resurfacing recall
      const resurfacingRecall = (resurfacing?.total || 0) > 0 ? Math.round(((resurfacing?.resolved || 0) / resurfacing!.total) * 1000) / 1000 : null

      // Exploration rate
      const explorationRate = (exploration?.total || 0) > 0 ? Math.round(((exploration?.exploration || 0) / exploration!.total) * 1000) / 1000 : null

      return {
        period_days: days,
        since,
        accept_rate: acceptRate,
        avg_rating: avgRating,
        rating_distribution: ratingDist,
        lane_balance: laneBalance,
        format_diversity_entropy: formatEntropy,
        avg_time_to_consume_days: timeToConsume?.avg_days != null ? Math.round(timeToConsume.avg_days * 10) / 10 : null,
        resurfacing_recall_rate: resurfacingRecall,
        exploration_rate: explorationRate,
        total_consumed: consumedCount,
        total_rejected: rejectedCount,
        total_decisions: totalDecisions,
        format_breakdown: Object.fromEntries((formats.results || []).map(row => [row.content_type, row.c])),
        targets: {
          accept_rate: '> 0.60',
          avg_rating: '~7.0',
          lane_balance: '~50/30/20 fit/bridge/challenge',
          format_diversity_entropy: '> 1.5 bits',
          avg_time_to_consume_days: '< 14',
          resurfacing_recall_rate: '> 0.40',
        },
      }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Analytics failed')(err), 500)
  }
})

/**
 * POST /analytics/snapshot
 * Saves the current metrics as a snapshot for historical tracking.
 */
app.post('/snapshot', async (c) => {
  const { DB } = c.env
  try {
    const token = c.req.header('x-api-token')
    const headers: Record<string, string> = {}
    if (token) headers['x-api-token'] = token
    const metricsRes = await fetch(new URL('/analytics/recommendations?days=30', c.req.url).toString(), { headers })
    const metrics = await metricsRes.json<any>()
    const id = `snap_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
    const today = new Date().toISOString().split('T')[0]
    await DB.prepare(`INSERT INTO analytics_snapshots (id,snapshot_date,period_days,accept_rate,avg_rating,rating_distribution_json,lane_balance_json,format_diversity,avg_time_to_consume_days,resurfacing_recall_rate,total_consumed,total_rejected,exploration_rate) VALUES (?,?,30,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, today, metrics.accept_rate, metrics.avg_rating, JSON.stringify(metrics.rating_distribution), JSON.stringify(metrics.lane_balance), metrics.format_diversity_entropy, metrics.avg_time_to_consume_days, metrics.resurfacing_recall_rate, metrics.total_consumed, metrics.total_rejected, metrics.exploration_rate).run()
    return c.json({ ok: true, id, snapshot_date: today })
  } catch (err) {
    return c.json(safeError('Snapshot failed')(err), 500)
  }
})

/**
 * GET /analytics/snapshots
 * Returns historical snapshots.
 */
app.get('/snapshots', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '52'), 1), 200)
  try {
    const rows = await DB.prepare('SELECT * FROM analytics_snapshots ORDER BY snapshot_date DESC LIMIT ?').bind(limit).all<any>()
    return c.json({ snapshots: rows.results || [] })
  } catch (err) {
    return c.json(safeError('Snapshots failed')(err), 500)
  }
})

/**
 * GET /analytics/session
 * Returns the current session context (last 10 consumed items).
 */
app.get('/session', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const recent = await DB.prepare(`
      SELECT r.id, r.video_title title, r.content_type format, r.creator,
             r.consumed_date, r.user_rating, m.branch_id topic,
             ROUND(julianday(r.consumed_date) - julianday(COALESCE(r.activated_at, r.created_at)), 1) engagement_days
      FROM recommendations r
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.status='consumed' AND r.consumed_date IS NOT NULL
      ORDER BY r.consumed_date DESC
      LIMIT 10
    `).all<any>()

    const items = recent.results || []
    // Format fatigue: count format repetitions in last 5
    const last5Formats = items.slice(0, 5).map(i => i.format).filter(Boolean)
    const formatCounts: Record<string, number> = {}
    for (const f of last5Formats) formatCounts[f] = (formatCounts[f] || 0) + 1
    const fatigued = Object.entries(formatCounts).filter(([, count]) => count >= 3).map(([format]) => format)

    // Topic saturation: same branch 3+ times in last 5
    const last5Topics = items.slice(0, 5).map(i => i.topic).filter(Boolean)
    const topicCounts: Record<string, number> = {}
    for (const t of last5Topics) topicCounts[t] = (topicCounts[t] || 0) + 1
    const saturated = Object.entries(topicCounts).filter(([, count]) => count >= 3).map(([topic]) => topic)

    return c.json({
      recent_consumption: items,
      format_fatigue: fatigued,
      topic_saturation: saturated,
      session_size: items.length,
      suggestion: fatigued.length ? `Consider non-${fatigued.join('/')} formats` : saturated.length ? `Consider topics outside ${saturated.join('/')}` : null,
    })
  } catch (err) {
    return c.json(safeError('Session context failed')(err), 500)
  }
})

/**
 * GET /analytics/compass/full-context
 * Batch context endpoint — returns everything an agent needs in a single call.
 */
app.get('/compass/full-context', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const [active, consumed, taste, mastered, blacklist, session, profile, threads] = await Promise.all([
      DB.prepare(`SELECT id,video_title,content_type,creator,status,created_at FROM recommendations WHERE status='active' ORDER BY created_at DESC`).all<any>(),
      DB.prepare(`SELECT id,video_title,content_type,creator,user_rating,consumed_date FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 50`).all<any>(),
      DB.prepare(`SELECT topic,affinity_score FROM taste_vectors ORDER BY affinity_score DESC`).all<any>(),
      DB.prepare(`SELECT label,author FROM mastered`).all<any>(),
      DB.prepare(`SELECT name,work,reason FROM blacklist`).all<any>(),
      DB.prepare(`SELECT r.id,r.video_title title,r.content_type format,r.creator,r.consumed_date,m.branch_id topic FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='consumed' AND r.consumed_date IS NOT NULL ORDER BY r.consumed_date DESC LIMIT 10`).all<any>(),
      DB.prepare(`SELECT assertion_key,category,value_json,confidence,status FROM profile_assertions WHERE status='active' ORDER BY confidence DESC`).all<any>(),
      DB.prepare(`SELECT id,title,guiding_question,status,priority FROM learning_threads WHERE status NOT IN ('verified','abandoned') ORDER BY priority DESC,updated_at DESC`).all<any>(),
    ])
    return c.json({
      active_items: active.results || [],
      recent_consumed: consumed.results || [],
      taste_vectors: taste.results || [],
      mastered: mastered.results || [],
      blacklist: blacklist.results || [],
      session_context: session.results || [],
      profile_assertions: profile.results || [],
      active_threads: threads.results || [],
    })
  } catch (err) {
    return c.json(safeError('Full context failed')(err), 500)
  }
})

export default app
