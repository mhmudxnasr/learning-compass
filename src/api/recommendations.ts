import { Hono } from 'hono'
import { Bindings, Recommendation, VALID_STATUS, VALID_RATINGS, isValidUrl, isNonEmptyStr, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/list', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const status = c.req.query('status')
  const q = c.req.query('q')
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 200)
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)
  const contentType = c.req.query('content_type')
  const rating = c.req.query('rating')
  const creator = c.req.query('creator')
  const since = c.req.query('since')

  const where: string[] = []
  const bindings: (string | number)[] = []

  if (status) {
    if (!VALID_STATUS.has(status)) return c.json({ error: 'invalid status' }, 400)
    where.push('status = ?')
    bindings.push(status)
  }
  if (contentType) {
    where.push('content_type = ?')
    bindings.push(contentType)
  }
  if (rating) {
    if (!VALID_RATINGS.has(rating)) return c.json({ error: 'invalid rating' }, 400)
    where.push('user_rating = ?')
    bindings.push(rating)
  }
  if (creator) {
    where.push('creator LIKE ?')
    bindings.push(`%${creator}%`)
  }
  if (since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return c.json({ error: 'invalid since date' }, 400)
    where.push('created_at >= ?')
    bindings.push(since)
  }
  if (q) {
    where.push('(video_title LIKE ? OR creator LIKE ? OR why_this LIKE ?)')
    const like = `%${q}%`
    bindings.push(like, like, like)
  }

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''

  try {
    const [rows, countRow] = await Promise.all([
      DB.prepare(`SELECT * FROM recommendations${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset).all<Recommendation>(),
      DB.prepare(`SELECT COUNT(*) as c FROM recommendations${whereClause}`)
        .bind(...bindings).first<{ c: number }>()
    ])
    return c.json({ recommendations: rows.results, total: countRow?.c || 0, limit, offset })
  } catch (err) {
    return c.json(safeError('List failed')(err), 500)
  }
})

app.post('/push', async (c) => {
  const { DB } = c.env
  let body: Partial<Recommendation> | Partial<Recommendation>[]

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const items = Array.isArray(body) ? body : [body]
  const today = new Date().toISOString().split('T')[0]
  const stmts: D1PreparedStatement[] = []

  try {
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue
      if (!isNonEmptyStr(item.video_title, 500)) continue
      if (!isValidUrl(item.video_url)) continue
      if (item.status && !VALID_STATUS.has(item.status)) continue
      if (item.user_rating && !VALID_RATINGS.has(item.user_rating)) continue

      const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const dedupKey = item.dedup_key || `key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      stmts.push(
        DB.prepare(
          `INSERT INTO recommendations (
            id, video_title, creator, content_type, video_url, why_this, verified, status,
            user_rating, user_review, dedup_key, synergy_bundle_id, consumed_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(dedup_key) DO UPDATE SET
            video_title = excluded.video_title,
            creator = excluded.creator,
            content_type = excluded.content_type,
            video_url = excluded.video_url,
            why_this = excluded.why_this,
            verified = excluded.verified,
            status = excluded.status,
            user_rating = excluded.user_rating,
            user_review = excluded.user_review,
            synergy_bundle_id = excluded.synergy_bundle_id,
            consumed_date = excluded.consumed_date`
        ).bind(
          id,
          item.video_title,
          item.creator || null,
          item.content_type || null,
          item.video_url,
          item.why_this || null,
          item.verified || today,
          item.status || 'active',
          item.user_rating || 'unset',
          item.user_review || null,
          dedupKey,
          item.synergy_bundle_id || null,
          item.consumed_date || null
        )
      )
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 })
    await DB.batch(stmts)
  } catch (err) {
    return c.json(safeError('Push failed')(err), 500)
  }

  return c.json({ ok: true, count: stmts.length })
})

app.post('/action', async (c) => {
  const { DB } = c.env
  let body: {
    id?: string
    ids?: string[]
    status: 'active' | 'consumed' | 'rejected'
    user_rating?: string
    user_review?: string
    consumed_date?: string
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!body.status) {
    return c.json({ error: 'status required' }, 400)
  }
  if (!VALID_STATUS.has(body.status)) {
    return c.json({ error: 'invalid status' }, 400)
  }
  if (body.user_rating && !VALID_RATINGS.has(body.user_rating)) {
    return c.json({ error: 'invalid rating' }, 400)
  }
  if (body.user_review && !isNonEmptyStr(body.user_review, 5000)) {
    return c.json({ error: 'review too long' }, 400)
  }

  const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (ids.length === 0) return c.json({ error: 'id or ids required' }, 400)
  for (const id of ids) {
    if (!isNonEmptyStr(id, 100)) return c.json({ error: 'invalid id' }, 400)
  }

  const consumedDate = body.status === 'consumed'
    ? (body.consumed_date || new Date().toISOString().split('T')[0])
    : null

  try {
    const stmts = ids.map(id => DB.prepare(
      `UPDATE recommendations
       SET status = ?,
           user_rating = COALESCE(?, user_rating),
           user_review = COALESCE(?, user_review),
           consumed_date = COALESCE(?, consumed_date)
       WHERE id = ?`
    ).bind(
      body.status,
      body.user_rating || null,
      body.user_review || null,
      consumedDate,
      id
    ))
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50))
  } catch (err) {
    return c.json(safeError('Action failed')(err), 500)
  }

  return c.json({ ok: true, count: ids.length })
})

app.post('/delete', async (c) => {
  const { DB } = c.env
  let body: { id: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (!body.id) {
    return c.json({ error: 'id required' }, 400)
  }
  if (!isNonEmptyStr(body.id, 100)) {
    return c.json({ error: 'id required' }, 400)
  }
  try {
    await DB.prepare('DELETE FROM recommendations WHERE id = ?').bind(body.id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Delete failed')(err), 500)
  }
})

// Fuzzy match a string against blacklist entries. Powers live-check in push sheet.
app.get('/check-blacklist', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const q = (c.req.query('q') || '').trim()
  if (!q || q.length < 2) return c.json({ matches: [] })
  const like = `%${q}%`
  try {
    const res = await DB.prepare(
      `SELECT id, name, work, reason, severity FROM blacklist
       WHERE name LIKE ? OR work LIKE ?
       ORDER BY severity ASC LIMIT 8`
    ).bind(like, like).all<any>()
    return c.json({ matches: res.results || [] })
  } catch (err) {
    return c.json(safeError('Blacklist check failed')(err), 500)
  }
})

app.get('/export', async (c) => {
  const { DB } = c.env
  const format = c.req.query('format') || 'json'
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '500'), 1), 5000)
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)
  try {
    const result = await DB.prepare('SELECT * FROM recommendations ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all<Recommendation>()
    const items = result.results || []

    if (format === 'md') {
      const header = '| Title | Creator | URL | Why | Status | Rating | Review | Tags |\n| --- | --- | --- | --- | --- | --- | --- | --- |'
      const rows = items.map(i =>
        `| ${i.video_title} | ${i.creator || ''} | ${i.video_url} | ${i.why_this || ''} | ${i.status} | ${i.user_rating || ''} | ${i.user_review || ''} | ${i.synergy_bundle_id || ''} |`
      ).join('\n')
      return new Response(header + '\n' + rows, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="taste-map-export.md"' }
      })
    }
    return c.json({ exported_at: new Date().toISOString(), total: items.length, limit, offset, recommendations: items })
  } catch (err) {
    return c.json(safeError('Export failed')(err), 500)
  }
})

export default app
