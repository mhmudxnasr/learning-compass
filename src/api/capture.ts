import { Hono } from 'hono'
import { queueDecision } from '../domain'
import { Bindings, safeError } from '../lib'
import { createInboxCapture } from '../services/capture'
import { addFeed, syncAllFeeds, syncFeed } from '../services/rss'

const app = new Hono<{ Bindings: Bindings }>()

app.post('/', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<{ source: string; title?: string; artifact_id?: string; override_queue_cap?: boolean }>()
    const source = String(body.source || '').trim()
    if (!source) return c.json({ error: 'source required' }, 400)

    const artifact = body.artifact_id
      ? await DB.prepare(`SELECT id,filename,media_type,r2_key FROM artifacts WHERE id=?`).bind(body.artifact_id).first<any>()
      : null
    if (body.artifact_id && !artifact) return c.json({ error: 'artifact not found' }, 404)
    const result = await createInboxCapture(DB, { source, title: body.title, artifact })
    return c.json({ ok: true, ...result, state: result.duplicate ? undefined : 'inbox' }, result.duplicate ? 200 : 201)
  } catch (error) { return c.json(safeError('Capture failed')(error), 500) }
})

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.tags_json,m.source_metadata_json,
    (SELECT fs.title FROM feed_entries fe JOIN feed_sources fs ON fs.id=fe.feed_id WHERE fe.recommendation_id=r.id LIMIT 1) feed_title
    FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.status='active' AND m.learning_state='inbox' ORDER BY r.created_at DESC LIMIT 200`).all()
  return c.json({ items: rows.results || [] })
})

app.get('/queue', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.priority_rank,m.progress_percent FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress') ORDER BY COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 50`).all()
  return c.json({ items: rows.results || [], count: rows.results?.length || 0, cap: 5 })
})

app.get('/feeds', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT fs.*,COUNT(fe.guid) entry_count
    FROM feed_sources fs LEFT JOIN feed_entries fe ON fe.feed_id=fs.id
    GROUP BY fs.id ORDER BY fs.created_at DESC`).all()
  return c.json({ feeds: rows.results || [] })
})

app.get('/feeds/:id/entries', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 200)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  const feed = await c.env.DB.prepare('SELECT id,title,feed_url FROM feed_sources WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT r.*,fe.guid,fe.published_at,fe.created_at feed_imported_at
      FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id
      WHERE fe.feed_id=? ORDER BY COALESCE(fe.published_at,fe.created_at) DESC LIMIT ? OFFSET ?`).bind(feed.id, limit, offset).all(),
    c.env.DB.prepare('SELECT COUNT(*) count FROM feed_entries WHERE feed_id=?').bind(feed.id).first<{ count: number }>(),
  ])
  return c.json({ feed, items: rows.results || [], total: count?.count || 0, limit, offset })
})

app.post('/feeds', async (c) => {
  try {
    const body = await c.req.json<{ url?: string }>()
    if (!body.url?.trim()) return c.json({ error: 'feed URL required' }, 400)
    return c.json({ ok: true, ...(await addFeed(c.env.DB, body.url)) }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not subscribe to feed'
    return c.json({ error: message }, /already subscribed/.test(message) ? 409 : 400)
  }
})

app.post('/feeds/sync', async (c) => {
  const results = await syncAllFeeds(c.env.DB)
  return c.json({
    ok: true,
    imported: results.reduce((sum, item: any) => sum + (item.imported || 0), 0),
    errors: results.filter((item: any) => item.error),
    results,
  })
})

app.post('/feeds/:id/sync', async (c) => {
  const feed = await c.env.DB.prepare(`SELECT id,feed_url,title,site_url,etag,last_modified FROM feed_sources WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  try { return c.json({ ok: true, ...(await syncFeed(c.env.DB, feed)) }) }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Feed check failed' }, 400) }
})

app.delete('/feeds/:id', async (c) => {
  const feed = await c.env.DB.prepare('SELECT id FROM feed_sources WHERE id=?').bind(c.req.param('id')).first()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM feed_entries WHERE feed_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM feed_sources WHERE id=?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})

app.post('/:id/triage', async (c) => {
  const body: { action?: 'queue' | 'exclude'; override_queue_cap?: boolean } = await c.req.json().catch(() => ({}))
  const item = await c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=?`).bind(c.req.param('id')).first()
  if (!item) return c.json({ error: 'not found' }, 404)
  if (body.action === 'exclude') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE recommendations SET status='rejected',updated_at=datetime('now') WHERE id=?`).bind(c.req.param('id')),
      c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='excluded',updated_at=datetime('now') WHERE recommendation_id=?`).bind(c.req.param('id')),
    ])
    return c.json({ ok: true, state: 'excluded' })
  }
  if (body.action !== 'queue') return c.json({ error: 'action must be queue or exclude' }, 400)
  const active = await c.env.DB.prepare(`SELECT COUNT(*) c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<{ c: number }>()
  const decision = queueDecision(active?.c || 0, body.override_queue_cap === true)
  if (!decision.allowed) return c.json({ error: 'queue_full', ...decision }, 409)
  const result = await c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,updated_at)
    SELECT ?,'queued',datetime('now')
    WHERE ?=1 OR (SELECT COUNT(*) FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress'))<5
    ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='queued',updated_at=datetime('now')`).bind(c.req.param('id'), body.override_queue_cap === true ? 1 : 0).run()
  if (!result.meta.changes) return c.json({ error: 'queue_full', ...queueDecision(5, false) }, 409)
  return c.json({ ok: true, state: 'queued', ...decision })
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT r.*, m.learning_state, m.branch_id, m.tags_json, m.source_metadata_json
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`).bind(c.req.param('id')).first()
  return row ? c.json({ item: row }) : c.json({ error: 'not found' }, 404)
})

export default app
