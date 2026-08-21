import { Hono } from 'hono'
import type { Bindings } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()
const locatorTypes = new Set(['web', 'pdf', 'video', 'epub', 'artifact', 'text'])
const clean = (value: unknown, max = 4000) => String(value || '').trim().slice(0, max)
const parseJson = (value: unknown, fallback: any = {}) => {
  try { return JSON.parse(String(value || '')) } catch { return fallback }
}
const makeId = () => `annotation_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

async function withDerivations(DB: Bindings['DB'], row: any) {
  if (!row) return null
  const [units, notes, drafts] = await Promise.all([
    DB.prepare(`SELECT u.id,u.unit_type,u.statement,u.status,u.confidence
      FROM unit_anchors a JOIN learning_units u ON u.id=a.unit_id
      WHERE a.annotation_id=? ORDER BY u.updated_at DESC`).bind(row.id).all<any>(),
    DB.prepare(`SELECT id,title,kind,status,provenance_json FROM notes WHERE provenance_json LIKE ? ORDER BY updated_at DESC LIMIT 50`).bind(`%${row.id}%`).all<any>(),
    DB.prepare(`SELECT id,question,answer,status,provenance_json FROM srs_drafts WHERE provenance_json LIKE ? ORDER BY updated_at DESC LIMIT 50`).bind(`%${row.id}%`).all<any>(),
  ])
  return {
    ...row,
    selector: parseJson(row.selector_json),
    selector_json: undefined,
    derivations: {
      units: units.results || [],
      notes: (notes.results || []).map((item: any) => ({ ...item, provenance: parseJson(item.provenance_json, []), provenance_json: undefined })),
      recall_drafts: (drafts.results || []).map((item: any) => ({ ...item, provenance: parseJson(item.provenance_json, []), provenance_json: undefined })),
    },
  }
}

app.get('/', async (c) => {
  const recommendationId = clean(c.req.query('recommendation_id'), 120)
  const threadId = clean(c.req.query('thread_id'), 120)
  const branchId = clean(c.req.query('branch_id'), 120)
  const status = c.req.query('status') === 'archived' ? 'archived' : 'active'
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') || 50)))
  const clauses = ['status=?']
  const binds: any[] = [status]
  if (recommendationId) { clauses.push('recommendation_id=?'); binds.push(recommendationId) }
  if (threadId) { clauses.push('thread_id=?'); binds.push(threadId) }
  if (branchId) { clauses.push('branch_id=?'); binds.push(branchId) }
  const rows = await c.env.DB.prepare(`SELECT * FROM source_annotations WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`).bind(...binds, limit).all<any>()
  return c.json({ annotations: await Promise.all((rows.results || []).map((row: any) => withDerivations(c.env.DB, row))) })
})

app.post('/', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const recommendationId = clean(body.recommendation_id, 120)
  const locatorType = clean(body.locator_type, 20)
  const quote = clean(body.quote, 6000)
  if (!recommendationId || !locatorTypes.has(locatorType) || !quote) return c.json({ error: 'recommendation_id, locator_type, and quote are required' }, 400)

  const [source, artifact, thread, branch] = await Promise.all([
    c.env.DB.prepare(`SELECT id,video_url FROM recommendations WHERE id=? AND deleted_at IS NULL`).bind(recommendationId).first<any>(),
    body.artifact_id ? c.env.DB.prepare(`SELECT id FROM artifacts WHERE id=?`).bind(clean(body.artifact_id, 120)).first<any>() : Promise.resolve(null),
    body.thread_id ? c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=? AND superseded_at IS NULL`).bind(clean(body.thread_id, 120)).first<any>() : Promise.resolve(null),
    body.branch_id ? c.env.DB.prepare(`SELECT id,status FROM tree_nodes WHERE id=? AND type IN ('branch','category','leaf')`).bind(clean(body.branch_id, 120)).first<any>() : Promise.resolve(null),
  ])
  if (!source) return c.json({ error: 'source not found' }, 404)
  if (body.artifact_id && !artifact) return c.json({ error: 'artifact not found' }, 404)
  if (body.thread_id && !thread) return c.json({ error: 'thread not found' }, 404)
  if (body.branch_id && !branch) return c.json({ error: 'branch not found' }, 404)
  if (branch?.status === 'pruned') return c.json({ error: 'pruned_branch_conflict' }, 409)

  const metadata = body.selector && typeof body.selector === 'object' && !Array.isArray(body.selector) ? body.selector : {}
  const id = clean(body.id, 120) || makeId()
  await c.env.DB.prepare(`INSERT INTO source_annotations
    (id,recommendation_id,artifact_id,thread_id,branch_id,locator_type,selector_json,quote,context_before,context_after,language,source_checksum,created_by,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`).bind(
    id, recommendationId, body.artifact_id ? clean(body.artifact_id, 120) : null, body.thread_id ? clean(body.thread_id, 120) : null,
    body.branch_id ? clean(body.branch_id, 120) : null, locatorType, JSON.stringify(metadata).slice(0, 12000), quote,
    clean(body.context_before, 2000) || null, clean(body.context_after, 2000) || null, clean(body.language, 40) || null,
    clean(body.source_checksum, 160) || null, ['agent', 'system'].includes(body.created_by) ? body.created_by : 'user',
  ).run()
  const row = await c.env.DB.prepare('SELECT * FROM source_annotations WHERE id=?').bind(id).first<any>()
  return c.json({ ok: true, annotation: await withDerivations(c.env.DB, row) }, 201)
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM source_annotations WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'annotation not found' }, 404)
  return c.json({ annotation: await withDerivations(c.env.DB, row) })
})

app.post('/:id/archive', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE source_annotations SET status='archived',updated_at=datetime('now') WHERE id=? AND status='active'`).bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'active annotation not found' }, 404)
  const row = await c.env.DB.prepare('SELECT * FROM source_annotations WHERE id=?').bind(c.req.param('id')).first<any>()
  return c.json({ ok: true, annotation: await withDerivations(c.env.DB, row) })
})

export default app
