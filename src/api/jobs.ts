import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()
const hasArabic = (value: string) => /[\u0600-\u06ff]/.test(value)
const hasLatin = (value: string) => /[A-Za-z]/.test(value)
const workerFrom = (c: any, body: any) => String(body?.worker || c.req.header('x-hermes-worker') || '').trim().slice(0, 120)

app.get('/', async (c) => {
  const status = c.req.query('status') || 'pending'
  const rows = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,attempts,created_at,updated_at,error FROM agent_jobs WHERE status=? ORDER BY created_at LIMIT 25`).bind(status).all<any>()
  return c.json({ jobs: (rows.results || []).map((row) => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), payload_json: undefined })) })
})

app.get('/active', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,result_json,attempts,error,created_at,updated_at FROM agent_jobs WHERE status IN ('pending','running','retry') OR (status IN ('completed','failed','cancelled') AND datetime(updated_at) >= datetime('now', '-2 hours')) ORDER BY updated_at DESC LIMIT 50`).all<any>()
  return c.json({ jobs: (rows.results || []).map((row) => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), result: row.result_json ? JSON.parse(row.result_json) : null, payload_json: undefined, result_json: undefined })) })
})

app.get('/health', async (c) => {
  const [counts, stale, oldest, recentFailures] = await Promise.all([
    c.env.DB.prepare(`SELECT status, COUNT(*) AS count FROM agent_jobs GROUP BY status`).all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_jobs WHERE status='running' AND lease_expires_at < datetime('now')`).first<any>(),
    c.env.DB.prepare(`SELECT MIN(created_at) AS created_at FROM agent_jobs WHERE status IN ('pending','retry')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_jobs WHERE status='failed' AND datetime(updated_at) >= datetime('now','-24 hours')`).first<any>(),
  ])
  const status: Record<string, number> = {}
  for (const row of counts.results || []) status[row.status] = Number(row.count || 0)
  return c.json({
    ok: Number(stale?.count || 0) === 0,
    status,
    stale_running: Number(stale?.count || 0),
    oldest_pending: oldest?.created_at || null,
    failed_last_24h: Number(recentFailures?.count || 0),
    checked_at: new Date().toISOString(),
  })
})

app.get('/:id', async (c) => {
  const job = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,result_json,attempts,error,created_at,updated_at FROM agent_jobs WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!job) return c.json({ error: 'job not found' }, 404)
  return c.json({ job: { ...job, payload: JSON.parse(job.payload_json || '{}'), result: job.result_json ? JSON.parse(job.result_json) : null, payload_json: undefined, result_json: undefined } })
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

app.post('/:id/heartbeat', async (c) => {
  const body = await c.req.json<{ worker?: string }>().catch(() => ({}))
  const worker = workerFrom(c, body)
  if (!worker) return c.json({ error: 'worker identity required' }, 400)
  const result = await c.env.DB.prepare(
    `UPDATE agent_jobs SET lease_expires_at=datetime('now','+5 minutes'), updated_at=datetime('now') WHERE id=? AND status='running' AND lease_owner=?`
  ).bind(c.req.param('id'), worker).run()
  if (!result.meta.changes) return c.json({ error: 'job unavailable for heartbeat' }, 409)
  return c.json({ ok: true, lease_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
})

app.post('/:id/complete', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>()
    const worker = workerFrom(c, body)
    if (!worker) return c.json({ error: 'worker identity required' }, 400)
    const job = await DB.prepare(`SELECT * FROM agent_jobs WHERE id=? AND status='running' AND lease_owner=? AND (lease_expires_at IS NULL OR lease_expires_at>=datetime('now'))`).bind(c.req.param('id'), worker).first<any>()
    if (!job) return c.json({ error: 'job unavailable' }, 409)
    const payload = JSON.parse(job.payload_json || '{}')
    if (job.job_type === 'process_feedback' && (!Array.isArray(body.proposals) || body.proposals.length === 0)) {
      return c.json({ error: 'feedback processing must return at least one reviewable proposal' }, 400)
    }
    if (job.job_type === 'process_feedback' && (body.note || body.srs_drafts?.length)) {
      return c.json({ error: 'Taste Mapper may propose changes but Notes Extractor exclusively owns source notes and recall drafts' }, 400)
    }
    const statements: D1PreparedStatement[] = []
    if (body.note) {
      const note = body.note
      if (job.job_type === 'extract_notes' && note.kind === 'reflection') return c.json({ error: 'extracted source notes must not replace personal reflections' }, 400)
      if (job.job_type === 'extract_notes') {
        const required = ['foundation', 'case_studies', 'exploitation', 'defense']
        const sections = Array.isArray(note.sections) ? note.sections : []
        const missing = required.filter((key) => !sections.some((section: any) => section.section_key === key && String(section.content || '').trim()))
        const incomplete = sections.filter((section: any) => required.includes(section.section_key) && (!hasLatin(String(section.content || '')) || !hasArabic(String(section.content || '')))).map((section: any) => section.section_key)
        if (missing.length || incomplete.length) return c.json({ error: 'Notes Extractor must return complete bilingual English and Egyptian Arabic sections', missing, incomplete }, 400)
      }
      const noteId = note.id || `note_${crypto.randomUUID()}`
      statements.push(DB.prepare(`INSERT OR REPLACE INTO notes (id,recommendation_id,title,kind,branch_id,source_url,source_artifact_id,status,updated_at) VALUES (?,?,?,?,?,?,?,'draft',datetime('now'))`).bind(noteId, note.recommendation_id || null, note.title, note.kind || 'guide', note.branch_id || null, note.source_url || null, note.source_artifact_id || null))
      for (const [index, section] of (note.sections || []).entries()) statements.push(DB.prepare(`INSERT OR REPLACE INTO note_sections (id,note_id,section_key,label,content,direction,position,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`).bind(`${noteId}_${section.section_key}`, noteId, section.section_key, section.label, section.content || '', section.direction || 'auto', index))
      const score = Number(payload.rating || 0)
      if (score >= 7) {
        for (const draft of body.srs_drafts || []) statements.push(DB.prepare(`INSERT INTO srs_drafts (id,recommendation_id,note_id,question,answer,topic) VALUES (?,?,?,?,?,?)`).bind(`draft_${crypto.randomUUID()}`, note.recommendation_id || null, noteId, draft.question, draft.answer, draft.topic || note.branch_id || 'general'))
      }
    }
    if (body.reflection?.content?.trim()) {
      const recommendationId = body.reflection.recommendation_id || payload.recommendation_id
      if (!recommendationId) return c.json({ error: 'handwritten reflection requires recommendation_id' }, 400)
      const existing = await DB.prepare(`SELECT n.id,n.title,s.content FROM notes n LEFT JOIN note_sections s ON s.note_id=n.id AND s.section_key='reaction' WHERE n.recommendation_id=? AND n.kind='reflection' ORDER BY n.updated_at DESC LIMIT 1`).bind(recommendationId).first<any>()
      const reflectionId = existing?.id || `reflection_${recommendationId}`
      const handwriting = String(body.reflection.content).trim()
      const combined = existing?.content?.includes(handwriting)
        ? existing.content
        : [existing?.content, `Handwritten PDF notes\n${handwriting}`].filter(Boolean).join('\n\n')
      if (!existing) {
        statements.push(DB.prepare(`INSERT INTO notes (id,recommendation_id,title,kind,source_url,status) VALUES (?,?,?,?,?,'draft')`).bind(reflectionId, recommendationId, body.reflection.title || 'Handwritten reflection', 'reflection', body.reflection.source_url || payload.source_url || null))
        for (const [position, [sectionKey, label, content]] of [
          ['reaction', 'Reaction', combined],
          ['foundation', 'Foundation', ''],
          ['case_studies', 'Case Studies', ''],
          ['exploitation', 'Exploitation', ''],
          ['defense', 'Defense', ''],
        ].entries()) statements.push(DB.prepare(`INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`).bind(`${reflectionId}_${sectionKey}`, reflectionId, sectionKey, label, content, 'auto', position))
      } else {
        statements.push(DB.prepare(`UPDATE note_sections SET content=?,updated_at=datetime('now') WHERE note_id=? AND section_key='reaction'`).bind(combined, reflectionId))
        statements.push(DB.prepare(`UPDATE notes SET revision=revision+1,updated_at=datetime('now') WHERE id=?`).bind(reflectionId))
      }
      statements.push(DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(`job_${crypto.randomUUID()}`, JSON.stringify({
        recommendation_id: recommendationId,
        note_id: reflectionId,
        reflection: handwriting,
        rating: payload.rating || null,
        source: 'handwritten_pdf',
        review_required: true,
      }), `handwriting-feedback:${job.id}`))
    }
    for (const proposal of body.proposals || []) {
      if (!proposal.change_type || !proposal.target_label || proposal.proposed === undefined) return c.json({ error: 'proposal requires change_type, target_label, and proposed' }, 400)
      statements.push(DB.prepare(`INSERT INTO feedback_proposals (id,recommendation_id,note_id,job_id,change_type,target_label,current_json,proposed_json,evidence,reasoning,confidence) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
        proposal.id || `proposal_${crypto.randomUUID()}`,
        payload.recommendation_id || null,
        payload.note_id || null,
        job.id,
        String(proposal.change_type).slice(0, 80),
        String(proposal.target_label).slice(0, 200),
        proposal.current === undefined ? null : JSON.stringify(proposal.current),
        JSON.stringify(proposal.proposed),
        String(proposal.evidence || '').slice(0, 4000) || null,
        String(proposal.reasoning || '').slice(0, 4000) || null,
        Math.max(0, Math.min(1, Number(proposal.confidence ?? 0.5))),
      ))
    }
    if (job.job_type === 'apply_feedback_proposal' && payload.proposal_id) {
      statements.push(DB.prepare(`UPDATE feedback_proposals SET status='applied',applied_at=datetime('now') WHERE id=? AND status='approved'`).bind(payload.proposal_id))
    }
    statements.push(DB.prepare(`UPDATE agent_jobs SET status='completed',result_json=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(body), job.id))
    await DB.batch(statements)
    return c.json({ ok: true })
  } catch (error) { return c.json(safeError('Job completion failed')(error), 500) }
})

app.post('/:id/fail', async (c) => {
  const body: { error?: string; worker?: string } = await c.req.json<{ error?: string; worker?: string }>().catch(() => ({}))
  const worker = workerFrom(c, body)
  if (!worker) return c.json({ error: 'worker identity required' }, 400)
  const result = await c.env.DB.prepare(`UPDATE agent_jobs SET status=CASE WHEN attempts<3 THEN 'retry' ELSE 'failed' END,error=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='running' AND lease_owner=?`).bind((body.error || 'Hermes job failed').slice(0, 1000), c.req.param('id'), worker).run()
  if (!result.meta.changes) return c.json({ error: 'job unavailable for failure report' }, 409)
  return c.json({ ok: true })
})

app.post('/:id/cancel', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE agent_jobs SET status='cancelled',error='Cancelled by user',lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('pending','running','retry')`).bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'job not cancellable or not found' }, 409)
  return c.json({ ok: true, status: 'cancelled' })
})

export default app
