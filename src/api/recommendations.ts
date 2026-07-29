import { Hono } from 'hono'
import { Bindings, Recommendation, VALID_STATUS, VALID_RATINGS, isValidUrl, isNonEmptyStr, safeError, normalizeRating, deriveDedupKey, normalizeUrlForDedup } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/active', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const res = await DB.prepare(
      `SELECT * FROM recommendations WHERE status = 'active' ORDER BY created_at DESC`
    ).all<Recommendation>()
    return c.json({ recommendations: res.results || [] })
  } catch (err) {
    return c.json(safeError('Active failed')(err), 500)
  }
})

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
  const source = c.req.query('source')

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
  if (source) {
    if (source !== 'feed' && source !== 'manual') return c.json({ error: 'invalid source' }, 400)
    where.push(source === 'feed'
      ? 'EXISTS (SELECT 1 FROM feed_entries fe WHERE fe.recommendation_id = recommendations.id)'
      : 'NOT EXISTS (SELECT 1 FROM feed_entries fe WHERE fe.recommendation_id = recommendations.id)')
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
    c.header('Content-Range', `items ${offset}-${offset + (rows.results?.length || 0)}/${countRow?.c || 0}`)
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
  const dedupKeys: string[] = []

  try {
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue
      if (!isNonEmptyStr(item.video_title, 500)) continue
      if (!isValidUrl(item.video_url)) continue
      if (item.status && !VALID_STATUS.has(item.status)) continue
      const norm = normalizeRating(item.user_rating)
      if (item.user_rating != null && item.user_rating !== '' && norm.rating === 'unset') continue

      const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const cleanUrl = normalizeUrlForDedup(item.video_url)
      const dedupItem = { ...item, video_url: cleanUrl }
      const dedupKey = deriveDedupKey(dedupItem)

      stmts.push(
        DB.prepare(
          `INSERT INTO recommendations (
            id, video_title, creator, content_type, video_url, why_this, verified, status,
            user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(dedup_key) DO UPDATE SET
            video_title = excluded.video_title,
            creator = excluded.creator,
            content_type = excluded.content_type,
            video_url = excluded.video_url,
            why_this = excluded.why_this,
            verified = excluded.verified,
            status = excluded.status,
            user_rating = excluded.user_rating,
            user_score = excluded.user_score,
            user_review = excluded.user_review,
            synergy_bundle_id = excluded.synergy_bundle_id,
            consumed_date = excluded.consumed_date,
            updated_at = datetime('now')`
        ).bind(
          id,
          item.video_title,
          item.creator || null,
          item.content_type || null,
          cleanUrl,
          item.why_this || null,
          item.verified || today,
          item.status || 'active',
          norm.rating,
          norm.score,
          item.user_review || null,
          dedupKey,
          item.synergy_bundle_id || null,
          item.consumed_date || null
        )
      )
      dedupKeys.push(dedupKey)
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 })
    await DB.batch(stmts)
    for (const dedupKey of dedupKeys) {
      const row = await DB.prepare(`SELECT id FROM recommendations WHERE dedup_key=?`).bind(dedupKey).first<{ id: string }>()
      if (row) await DB.prepare(`INSERT OR IGNORE INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json,updated_at) VALUES (?,'inbox',?,datetime('now'))`).bind(row.id, JSON.stringify({ imported: true })).run()
    }
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
  // DATA QUALITY: consuming requires a review, but only when transitioning TO consumed
  // (moved after ids resolve, below)
  const norm = normalizeRating(body.user_rating)
  if (body.user_rating != null && String(body.user_rating) !== '' && norm.rating === 'unset') {
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

  // DATA QUALITY: review required when transitioning TO consumed (not for already-consumed items)
  if (body.status === 'consumed') {
    const review = (body.user_review || '').trim()
    // only check single-id updates (batch skip for simplicity)
    const currentStatus = ids.length === 1
      ? await DB.prepare('SELECT status FROM recommendations WHERE id = ?').bind(ids[0]).first()
      : null
    const wasConsumed = currentStatus && currentStatus.status === 'consumed'
    if (!wasConsumed && review.length < 3) {
      return c.json({ error: 'A review is required to mark consumed (min 3 chars).' }, 400)
    }
  }

  const consumedDate = body.status === 'consumed'
    ? (body.consumed_date || new Date().toISOString().split('T')[0])
    : null

  try {
    const stmts = ids.map(id => DB.prepare(
      `UPDATE recommendations
       SET status = ?,
           user_rating = COALESCE(?, user_rating),
           user_score = COALESCE(?, user_score),
           user_review = COALESCE(?, user_review),
           consumed_date = COALESCE(?, consumed_date),
           updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      body.status,
      norm.rating === 'unset' ? null : norm.rating,
      norm.score,
      body.user_review || null,
      consumedDate,
      id
    ))
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50))

    // MEMORY: on consume, schedule spaced resurfaces + detect contradictions
    if (body.status === 'consumed') {
      for (const id of ids) {
        try { await scheduleResurfacing(DB, id) } catch (e) { console.warn('resurface sched failed', e) }
        try { await detectContradiction(DB, id) } catch (e) { console.warn('contradiction detect failed', e) }
      }
    }
  } catch (err) {
    return c.json(safeError('Action failed')(err), 500)
  }

  return c.json({ ok: true, count: ids.length })
})

app.post('/delete', async (c) => {
  const { DB } = c.env
  let body: { id: string; undo?: boolean }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return c.json({ error: 'id required' }, 400)
  if (!isNonEmptyStr(body.id, 100)) return c.json({ error: 'id required' }, 400)

  try {
    if (body.undo) {
      const row = await DB.prepare('SELECT * FROM recommendations WHERE id = ?').bind(body.id).first<any>()
      if (!row) return c.json({ error: 'not found' }, 404)
      await DB.batch([
        DB.prepare("INSERT OR REPLACE INTO undo_queue (id, table_name, row_id, snapshot_json, expires_at) VALUES (?, 'recommendations', ?, ?, datetime('now', '+30 seconds'))")
          .bind(body.id, body.id, JSON.stringify(row)),
        DB.prepare('DELETE FROM recommendations WHERE id = ?').bind(body.id),
      ])
    } else {
      await DB.prepare('DELETE FROM recommendations WHERE id = ?').bind(body.id).run()
    }
    return c.json({ ok: true })
  } catch (err) { return c.json(safeError('Delete failed')(err), 500) }
})

app.post('/undo', async (c) => {
  const { DB } = c.env
  let body: { id: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return c.json({ error: 'id required' }, 400)

  try {
    const row = await DB.prepare('SELECT * FROM undo_queue WHERE id = ? AND expires_at > datetime(\'now\')').bind(body.id).first<any>()
    if (!row) return c.json({ error: 'nothing to undo or expired' }, 404)

    if (row.table_name === 'recommendations') {
      const snap = JSON.parse(row.snapshot_json)
      await DB.prepare(`INSERT OR REPLACE INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(snap.id, snap.video_title, snap.creator, snap.content_type, snap.video_url, snap.why_this, snap.verified, snap.status, snap.user_rating, snap.user_score, snap.user_review, snap.dedup_key, snap.synergy_bundle_id, snap.consumed_date).run()
    }
    await DB.prepare('DELETE FROM undo_queue WHERE id = ?').bind(body.id).run()
    return c.json({ ok: true })
  } catch (err) { return c.json(safeError('Undo failed')(err), 500) }
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

// ---------- MEMORY: spaced resurfacing ----------
// On consume, schedule three review stages (30/90/180 days). If a row already
// exists for this recommendation we leave it (don't double-schedule).
async function scheduleResurfacing(DB: any, recId: string) {
  const existing = await DB.prepare('SELECT id FROM resurfacing WHERE recommendation_id = ? AND resolved_at IS NULL LIMIT 1').bind(recId).first()
  if (existing) return
  const stages = ['30d', '90d', '180d']
  const offsets = [30, 90, 180]
  const stmts = stages.map((stage, i) =>
    DB.prepare(
      `INSERT INTO resurfacing (recommendation_id, stage, due_at, notes)
       VALUES (?, ?, date('now', '+' || ? || ' days'), ?)`
    ).bind(recId, stage, offsets[i], 'auto-scheduled on consume')
  )
  await DB.batch(stmts)
}

// ---------- MEMORY: contradiction detection ----------
async function detectContradiction(DB: any, recId: string) {
  const me = await DB.prepare('SELECT id, dedup_key, user_rating, user_review, video_title FROM recommendations WHERE id = ?').bind(recId).first()
  if (!me || !me.dedup_key) return
  const myBranch = me.dedup_key.split('-')[0]
  if (!myBranch || myBranch === 'yt' || myBranch === 'book' || myBranch === 'key') return
  const opposite = me.user_rating === 'love' || me.user_rating === 'like'
    ? ['meh', 'dislike']
    : me.user_rating === 'dislike' || me.user_rating === 'meh'
      ? ['love', 'like']
      : []
  if (!opposite.length) return
  const others = await DB.prepare(
    `SELECT id, dedup_key, user_rating, video_title
     FROM recommendations
     WHERE status = 'consumed' AND id != ? AND user_rating IN ('love','like','meh','dislike')
       AND substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) = ?`
  ).bind(recId, myBranch).all()
  for (const o of (others.results || [])) {
    if (!opposite.includes(o.user_rating)) continue
    const tid = [me.id, o.id].sort().join('::')
    const exists = await DB.prepare('SELECT id FROM contradictions WHERE id = ?').bind(tid).first()
    if (exists) continue
    await DB.prepare(
      `INSERT OR IGNORE INTO contradictions (id, source_a, source_b, topic, tension, detected_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      tid, me.id, o.id, myBranch,
      `Consumed "${me.video_title}" as ${me.user_rating} but "${o.video_title}" as ${o.user_rating} under branch ${myBranch}.`
    ).run()
  }
}

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
