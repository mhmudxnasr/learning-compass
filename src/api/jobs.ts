import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { loadSettings } from '../services/settings'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  const status = c.req.query('status') || 'pending'
  const rows = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,attempts,created_at,updated_at,error FROM agent_jobs WHERE status=? ORDER BY created_at LIMIT 25`).bind(status).all<any>()
  return c.json({ jobs: (rows.results || []).map((row) => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), payload_json: undefined })) })
})

app.post('/:id/claim', async (c) => {
  const body: { worker?: string } = await c.req.json<{ worker?: string }>().catch(() => ({}))
  const worker = body.worker || 'hermes-taste-map'
  await c.env.DB.prepare(`UPDATE agent_jobs SET status=CASE WHEN attempts<3 THEN 'retry' ELSE 'failed' END,error='Lease expired',lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE status='running' AND lease_expires_at<datetime('now')`).run()
  const result = await c.env.DB.prepare(`UPDATE agent_jobs SET status='running',lease_owner=?,lease_expires_at=datetime('now','+5 minutes'),attempts=attempts+1,updated_at=datetime('now') WHERE id=? AND status IN ('pending','retry')`).bind(worker, c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'job unavailable' }, 409)
  const job = await c.env.DB.prepare(`SELECT * FROM agent_jobs WHERE id=?`).bind(c.req.param('id')).first<any>()
  return c.json({ job: { ...job, payload: JSON.parse(job.payload_json || '{}') } })
})

app.post('/:id/complete', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>()
    const job = await DB.prepare(`SELECT * FROM agent_jobs WHERE id=? AND status='running' AND (lease_expires_at IS NULL OR lease_expires_at>=datetime('now'))`).bind(c.req.param('id')).first<any>()
    if (!job) return c.json({ error: 'job unavailable' }, 409)
    const statements: D1PreparedStatement[] = []
    if (body.note) {
      const note = body.note
      const noteId = note.id || `note_${crypto.randomUUID()}`
      statements.push(DB.prepare(`INSERT OR REPLACE INTO notes (id,recommendation_id,title,kind,branch_id,source_url,source_artifact_id,status,updated_at) VALUES (?,?,?,?,?,?,?,'draft',datetime('now'))`).bind(noteId, note.recommendation_id || null, note.title, note.kind || 'guide', note.branch_id || null, note.source_url || null, note.source_artifact_id || null))
      for (const [index, section] of (note.sections || []).entries()) statements.push(DB.prepare(`INSERT OR REPLACE INTO note_sections (id,note_id,section_key,label,content,direction,position,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`).bind(`${noteId}_${section.section_key}`, noteId, section.section_key, section.label, section.content || '', section.direction || 'auto', index))
      const settings = await loadSettings(DB)
      const payload = JSON.parse(job.payload_json || '{}')
      const score = Number(payload.rating || 0)
      if (settings.srs_drafts.enabled && score >= settings.srs_drafts.minimum_rating) {
        for (const draft of body.srs_drafts || []) statements.push(DB.prepare(`INSERT INTO srs_drafts (id,recommendation_id,note_id,question,answer,topic) VALUES (?,?,?,?,?,?)`).bind(`draft_${crypto.randomUUID()}`, note.recommendation_id || null, noteId, draft.question, draft.answer, draft.topic || note.branch_id || 'general'))
      }
    }
    statements.push(DB.prepare(`UPDATE agent_jobs SET status='completed',result_json=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(body), job.id))
    await DB.batch(statements)
    return c.json({ ok: true })
  } catch (error) { return c.json(safeError('Job completion failed')(error), 500) }
})

app.post('/:id/fail', async (c) => {
  const body: { error?: string } = await c.req.json<{ error?: string }>().catch(() => ({}))
  await c.env.DB.prepare(`UPDATE agent_jobs SET status=CASE WHEN attempts<3 THEN 'retry' ELSE 'failed' END,error=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind((body.error || 'Hermes job failed').slice(0, 1000), c.req.param('id')).run()
  return c.json({ ok: true })
})

export default app
