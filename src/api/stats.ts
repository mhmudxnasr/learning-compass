import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const allLimit = Math.min(Math.max(parseInt(c.req.query('all_limit') || '100'), 1), 1000)
  const allOffset = Math.max(parseInt(c.req.query('all_offset') || '0'), 0)
  try {
    const [
      total,
      byStatus,
      byRating,
      byMonth,
      topCreators,
      recentConsumed,
      activeItems,
      bundles,
      allEntries,
      htmlVault,
    ] = await Promise.all([
      DB.prepare('SELECT COUNT(*) as c FROM recommendations').first<{ c: number }>(),
      DB.prepare('SELECT status, COUNT(*) as c FROM recommendations GROUP BY status').all<{ status: string, c: number }>(),
      DB.prepare("SELECT user_rating, COUNT(*) as c FROM recommendations WHERE status='consumed' AND user_rating != 'unset' AND user_rating != '' GROUP BY user_rating ORDER BY c DESC").all<{ user_rating: string, c: number }>(),
      DB.prepare("SELECT substr(consumed_date,1,7) as m, COUNT(*) as c FROM recommendations WHERE status='consumed' AND consumed_date != 'unset' GROUP BY m ORDER BY m ASC").all<{ m: string, c: number }>(),
      DB.prepare("SELECT creator, COUNT(*) as c FROM recommendations WHERE creator IS NOT NULL AND creator != '' GROUP BY creator ORDER BY c DESC LIMIT 15").all<{ creator: string, c: number }>(),
      DB.prepare("SELECT video_title, creator, user_rating, user_review, consumed_date FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 25").all(),
      DB.prepare("SELECT video_title, creator, why_this, created_at FROM recommendations WHERE status='active' ORDER BY created_at DESC LIMIT 25").all(),
      DB.prepare("SELECT synergy_bundle_id, COUNT(*) as c FROM recommendations WHERE synergy_bundle_id != 'unset' GROUP BY synergy_bundle_id ORDER BY c DESC").all<{ synergy_bundle_id: string, c: number }>(),
      DB.prepare('SELECT video_title, creator, status, user_rating, user_review, why_this, synergy_bundle_id, content_type, created_at FROM recommendations ORDER BY created_at ASC LIMIT ? OFFSET ?').bind(allLimit, allOffset).all(),
      DB.prepare('SELECT id, filename, created_at, length(content) as size FROM html_files ORDER BY created_at DESC').all(),
    ])

    const s: Record<string, number> = {}
    for (const r of (byStatus?.results || [])) s[r.status] = r.c

    return c.json({
      total: total?.c || 0,
      byStatus: s,
      ratingDistribution: byRating?.results || [],
      consumptionByMonth: byMonth?.results || [],
      topCreators: topCreators?.results || [],
      recentConsumed: recentConsumed?.results || [],
      activeItems: activeItems?.results || [],
      bundles: bundles?.results || [],
      allEntries: allEntries?.results || [],
      allEntriesLimit: allLimit,
      allEntriesOffset: allOffset,
      htmlVault: htmlVault?.results || []
    })
  } catch (err) {
    return c.json(safeError('Stats failed')(err), 500)
  }
})

export default app
