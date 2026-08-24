import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { cached } from '../cache'

const app = new Hono<{ Bindings: Bindings }>()

const firstOr = async (stmt: D1PreparedStatement, fallback: any = null) => {
  try { return await stmt.first<any>() }
  catch { return fallback }
}
const allOr = async (stmt: D1PreparedStatement) => {
  try { return await stmt.all<any>() }
  catch { return { results: [] as any[] } }
}

app.get('/briefing', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')

  try {
    const data = await cached('home.briefing', 30000, async () => {
      const today = new Date().toISOString().split('T')[0]
      const [next, due, total, active, consumed, todayLog, streak, growth, recent] = await Promise.all([
        firstOr(DB.prepare("SELECT id, video_title, creator, content_type, video_url, why_this, status, user_rating, consumed_date, created_at FROM recommendations WHERE status = 'active' AND COALESCE(content_type, '') != 'book' ORDER BY created_at DESC LIMIT 1")),
        firstOr(DB.prepare("SELECT COUNT(*) as c FROM srs_cards WHERE due_at <= date('now')"), { c: 0 }),
        firstOr(DB.prepare('SELECT COUNT(*) as c FROM recommendations'), { c: 0 }),
        firstOr(DB.prepare("SELECT COUNT(*) as c FROM recommendations WHERE status = 'active' AND COALESCE(content_type, '') != 'book'"), { c: 0 }),
        firstOr(DB.prepare("SELECT COUNT(*) as c FROM recommendations WHERE status = 'consumed'"), { c: 0 }),
        firstOr(DB.prepare('SELECT count, topics FROM learning_log WHERE date = ?').bind(today)),
        firstOr(DB.prepare(`
          WITH RECURSIVE dates(d) AS (
            SELECT date('now')
            UNION ALL SELECT date(d, '-1 day') FROM dates WHERE d > date('now', '-365 days')
          )
          SELECT COUNT(*) as streak FROM dates d
          WHERE EXISTS (SELECT 1 FROM learning_log WHERE date = d.d)
            AND d.d >= COALESCE((SELECT date(MAX(date), '+1 day') FROM learning_log l1
              WHERE NOT EXISTS (SELECT 1 FROM learning_log l2 WHERE date(l2.date, '+1 day') = l1.date)), '1970-01-01')
        `), { streak: 0 }),
        allOr(DB.prepare("SELECT substr(consumed_date, 1, 7) as month, COUNT(*) as count FROM recommendations WHERE status = 'consumed' AND consumed_date IS NOT NULL AND consumed_date != 'unset' GROUP BY month ORDER BY month ASC LIMIT 24")),
        allOr(DB.prepare("SELECT id, video_title, creator, content_type, why_this, status, user_rating, consumed_date, updated_at FROM recommendations WHERE status = 'active' AND COALESCE(content_type, '') != 'book' ORDER BY created_at DESC LIMIT 3")),
      ])

      return {
        next_action: due?.c > 0 ? 'review' : next ? 'continue' : 'curate',
        next_item: next || null,
        due_reviews: due?.c || 0,
        total_count: total?.c || 0,
        queue_count: active?.c || 0,
        consumed_count: consumed?.c || 0,
        today: { count: todayLog?.count || 0, topics: todayLog?.topics || '' },
        streak: streak?.streak || 0,
        growth: growth.results || [],
        suggestions: recent.results || [],
        recent: recent.results || [],
      }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Home briefing failed')(err), 500)
  }
})

export default app
