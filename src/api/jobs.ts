import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { advanceConsolidationForExtraction, failConsolidationForJob } from '../services/learning-core'
import { applyFeedbackProposal } from '../services/intelligence-v2'
import { validateLiteVisualCheckpointEvidence } from '../services/lite-visual-workflow'
import { SOURCE_NOTE_CONTRACT, validateSourceNoteCompletion } from '../services/note-extraction'

const app = new Hono<{ Bindings: Bindings }>()
const sqliteTime = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ')
const workerFrom = (c: any, body: any) => String(body?.worker || c.req.header('x-hermes-worker') || '').trim().slice(0, 120)
const proposalFingerprint = (recommendationId: unknown, noteId: unknown, proposal: any) => [recommendationId || '', noteId || '', proposal.change_type || '', proposal.target_label || '', JSON.stringify(proposal.proposed)].join('|').toLowerCase().replace(/\s+/g, ' ').slice(0, 1800)

app.get('/', async (c) => {
  const status = c.req.query('status') || 'pending'
  const rows = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,recommendation_id,trigger_kind,workflow_run_id,workflow_step,attempts,created_at,updated_at,error FROM agent_jobs WHERE status=? ORDER BY created_at LIMIT 25`).bind(status).all<any>()
  return c.json({ jobs: (rows.results || []).map((row) => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), payload_json: undefined })) })
})

app.get('/active', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,result_json,attempts,error,created_at,updated_at FROM agent_jobs WHERE status IN ('pending','running','retry') OR (status IN ('completed','failed','cancelled') AND datetime(updated_at) >= datetime('now', '-2 hours')) ORDER BY updated_at DESC LIMIT 50`).all<any>()
  return c.json({ jobs: (rows.results || []).map((row) => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), result: row.result_json ? JSON.parse(row.result_json) : null, payload_json: undefined, result_json: undefined })) })
})

app.get('/health', async (c) => {
  const [counts, stale, oldest, recentFailures, delayed, deadLetters] = await Promise.all([
    c.env.DB.prepare(`SELECT status, COUNT(*) AS count FROM agent_jobs GROUP BY status`).all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_jobs WHERE status='running' AND lease_expires_at < datetime('now')`).first<any>(),
    c.env.DB.prepare(`SELECT MIN(created_at) AS created_at FROM agent_jobs WHERE status IN ('pending','retry')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_jobs WHERE status='failed' AND datetime(updated_at) >= datetime('now','-24 hours')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_job_retries WHERE dead_lettered_at IS NULL AND next_attempt_at > datetime('now')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_job_retries WHERE dead_lettered_at IS NOT NULL`).first<any>(),
  ])
  const status: Record<string, number> = {}
  for (const row of counts.results || []) status[row.status] = Number(row.count || 0)
  return c.json({
    ok: Number(stale?.count || 0) === 0,
    status,
    stale_running: Number(stale?.count || 0),
    oldest_pending: oldest?.created_at || null,
    failed_last_24h: Number(recentFailures?.count || 0),
    delayed_retries: Number(delayed?.count || 0),
    dead_letters: Number(deadLetters?.count || 0),
    checked_at: new Date().toISOString(),
  })
})

app.get('/:id', async (c) => {
  const job = await c.env.DB.prepare(`SELECT id,job_type,status,payload_json,result_json,recommendation_id,trigger_kind,workflow_run_id,workflow_step,attempts,error,created_at,updated_at FROM agent_jobs WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!job) return c.json({ error: 'job not found' }, 404)
  return c.json({ job: { ...job, payload: JSON.parse(job.payload_json || '{}'), result: job.result_json ? JSON.parse(job.result_json) : null, payload_json: undefined, result_json: undefined } })
})

app.post('/:id/claim', async (c) => {
  const body: { worker?: string } = await c.req.json<{ worker?: string }>().catch(() => ({}))
  const worker = body.worker || 'hermes-taste-map'
  const expired = await c.env.DB.prepare(`SELECT id,attempts FROM agent_jobs WHERE status='running' AND lease_expires_at<datetime('now')`).all<any>()
  for (const item of expired.results || []) {
    const terminal = Number(item.attempts || 0) >= 3
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE agent_jobs SET status=?,error='Lease expired',lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(terminal ? 'failed' : 'retry', item.id),
      c.env.DB.prepare(`INSERT INTO agent_job_retries (job_id,next_attempt_at,retry_count,dead_lettered_at,last_error,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(job_id) DO UPDATE SET next_attempt_at=excluded.next_attempt_at,retry_count=agent_job_retries.retry_count+1,dead_lettered_at=excluded.dead_lettered_at,last_error=excluded.last_error,updated_at=datetime('now')`).bind(item.id, terminal ? null : sqliteTime(120000), 1, terminal ? sqliteTime() : null, 'Lease expired'),
    ])
    if (terminal) await c.env.DB.prepare(`INSERT INTO hermes_alerts (id,kind,severity,title,body,fingerprint) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM hermes_alerts WHERE fingerprint=? AND acknowledged_at IS NULL)`).bind(`alert_${crypto.randomUUID()}`, 'dead_letter', 'critical', 'Hermes job moved to dead letter', `Job ${item.id} exhausted its lease attempts.`, `dead_letter:${item.id}`, `dead_letter:${item.id}`).run()
  }
  const result = await c.env.DB.prepare(`UPDATE agent_jobs SET status='running',lease_owner=?,lease_expires_at=datetime('now','+5 minutes'),attempts=attempts+1,updated_at=datetime('now') WHERE id=? AND status IN ('pending','retry') AND (status='pending' OR NOT EXISTS (SELECT 1 FROM agent_job_retries r WHERE r.job_id=agent_jobs.id AND r.dead_lettered_at IS NULL AND r.next_attempt_at IS NOT NULL AND r.next_attempt_at>datetime('now')))`).bind(worker, c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'job unavailable' }, 409)
  await c.env.DB.prepare(`INSERT OR IGNORE INTO agent_job_retries (job_id) VALUES (?)`).bind(c.req.param('id')).run()
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

app.post('/:id/checkpoint', async (c) => {
  const body = await c.req.json<{ worker?: string; step?: string; evidence?: Record<string, unknown> }>().catch(() => ({} as { worker?: string; step?: string; evidence?: Record<string, unknown> }))
  const worker = workerFrom(c, body)
  const step = String(body.step || '').trim()
  if (!worker || !step) return c.json({ error: 'worker and next workflow step are required' }, 400)
  const job = await c.env.DB.prepare(`SELECT id,job_type,status,lease_owner,lease_expires_at,payload_json,result_json,workflow_step FROM agent_jobs WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!job || job.status !== 'running' || job.lease_owner !== worker || job.lease_expires_at && job.lease_expires_at < sqliteTime()) return c.json({ error: 'job unavailable for checkpoint' }, 409)
  let payload: any = {}
  let result: any = {}
  try { payload = JSON.parse(job.payload_json || '{}') } catch {}
  try { result = JSON.parse(job.result_json || '{}') } catch {}
  const stages = Array.isArray(payload.stages) ? payload.stages.map(String) : []
  const currentIndex = stages.indexOf(String(job.workflow_step || stages[0] || ''))
  const nextIndex = stages.indexOf(step)
  if (nextIndex < 0) return c.json({ error: 'workflow step is not declared by this job', step }, 400)
  if (currentIndex >= 0 && (nextIndex < currentIndex || nextIndex > currentIndex + 1)) return c.json({ error: 'workflow steps must advance linearly', current: job.workflow_step, requested: step }, 409)
  const evidence = body.evidence && typeof body.evidence === 'object' ? body.evidence : {}
  if (job.job_type === 'visualise_source') {
    const failures = validateLiteVisualCheckpointEvidence(step, evidence)
    if (failures.length) return c.json({ error: 'lite_visual_checkpoint_evidence_invalid', step, failures }, 422)
  }
  const checkpoints = Array.isArray(result.checkpoints) ? result.checkpoints : []
  const checkpoint = { step, evidence, recorded_at: new Date().toISOString() }
  const merged = { ...result, resume_from: step, checkpoints: [...checkpoints.filter((item: any) => item?.step !== step), checkpoint] }
  await c.env.DB.prepare(`UPDATE agent_jobs SET workflow_step=?,result_json=?,lease_expires_at=datetime('now','+5 minutes'),updated_at=datetime('now') WHERE id=? AND status='running' AND lease_owner=?`).bind(step, JSON.stringify(merged), job.id, worker).run()
  return c.json({ ok: true, workflow_step: step, resume_from: step })
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
    if (job.job_type === 'extract_notes' && payload.output_contract === SOURCE_NOTE_CONTRACT) {
      const failures = validateSourceNoteCompletion(payload, body)
      if (failures.length) return c.json({ error: 'source_note_quality_gate_failed', contract: SOURCE_NOTE_CONTRACT, failures }, 422)
    }
    if (job.job_type === 'extract_notes' && payload.output_contract === 'learning_units_v1' && (!Array.isArray(body.learning_units) || body.learning_units.length === 0)) {
      return c.json({ error: 'learning_units_v1 extraction must return at least one anchored learning unit' }, 400)
    }
    if (job.job_type === 'process_feedback' && (!Array.isArray(body.proposals) || body.proposals.length === 0) && !body.no_change) {
      return c.json({ error: 'feedback processing must return proposals or an evidence-backed no_change decision' }, 400)
    }
    if (job.job_type === 'process_feedback' && (body.note || body.srs_drafts?.length)) {
      return c.json({ error: 'Taste Mapper may propose changes but Notes Extractor exclusively owns source notes and recall drafts' }, 400)
    }
    if (job.job_type === 'visualise_source') {
      if (job.workflow_step !== 'verify_record') return c.json({ error: 'Lite Visual must reach verify_record before completion', workflow_step: job.workflow_step }, 409)
      if (!String(body.pair_id || '').startsWith('lv-') || !body.html_artifact_id || !body.pdf_artifact_id || body.validation_status !== 'passed') return c.json({ error: 'Lite Visual completion requires one verified atomic HTML/PDF pair' }, 400)
    }
    const statements: D1PreparedStatement[] = []
    const conversationId = payload.conversation_id || `feedback-job:${job.id}`
    let payloadThreadId = String(payload.thread_id || '').trim().slice(0, 120) || null
    if (payloadThreadId && !(await DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(payloadThreadId).first())) payloadThreadId = null
    if (job.job_type === 'process_feedback' && body.no_change && (!Array.isArray(body.proposals) || !body.proposals.length)) {
      statements.push(DB.prepare(`INSERT OR REPLACE INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json,after_json,validation_json,completed_at,updated_at) VALUES (?,?,?,'profile','low','validated',?,?,?,? ,?,datetime('now'),datetime('now'))`).bind(
        `improvement_${job.id}`, conversationId, 'conversation_feedback', Math.max(0, Math.min(1, Number(body.no_change.confidence ?? 1))), JSON.stringify(body.no_change.evidence || []), JSON.stringify({ job_id: job.id }), JSON.stringify({ changed: false, reason: String(body.no_change.reason || 'No durable profile change warranted').slice(0, 2000) }), JSON.stringify({ policy_version: 'profile_v2', no_change: true }),
      ))
    }
    if (body.note) {
      const note = body.note
      if (job.job_type === 'extract_notes' && note.kind === 'reflection') return c.json({ error: 'extracted source notes must not replace personal reflections' }, 400)
      if (job.job_type === 'extract_notes') {
        const sections = Array.isArray(note.sections) ? note.sections : []
        const incomplete = sections.map((section: any, index: number) => ({ index, section })).filter(({ section }: any) => !String(section.section_key || '').trim() || !String(section.label || '').trim() || !String(section.content || '').trim()).map(({ index }: any) => index)
        if (!sections.length || incomplete.length) return c.json({ error: 'Notes Extractor must return one or more complete source-shaped sections', incomplete }, 400)
      }
      const noteId = note.id || `note_${crypto.randomUUID()}`
      const levelId = String(note.stage_id || payload.stage_id || '').trim().slice(0, 120) || null
      let ownerThreadId = String(note.thread_id || payloadThreadId || '').trim().slice(0, 120) || null
      if (levelId) {
        const level = await DB.prepare(`SELECT thread_id FROM learning_path_stages WHERE id=?`).bind(levelId).first<any>()
        if (!level) return c.json({ error: 'learning_level_not_found', stage_id: levelId }, 409)
        if (ownerThreadId && ownerThreadId !== level.thread_id) return c.json({ error: 'learning_scope_mismatch', thread_id: ownerThreadId, stage_id: levelId }, 409)
        ownerThreadId = level.thread_id
      }
      const provenance = Array.isArray(note.provenance) ? note.provenance.slice(0, 20).map((item: any) => ({ annotation_id: String(item.annotation_id || '').slice(0, 120), reason: String(item.reason || '').slice(0, 500), confidence: item.confidence == null ? null : Math.max(0, Math.min(1, Number(item.confidence))) })).filter((item: any) => item.annotation_id) : []
      const extraction = payload.output_contract === SOURCE_NOTE_CONTRACT ? body.extraction : null
      statements.push(DB.prepare(`INSERT OR REPLACE INTO notes (id,recommendation_id,title,kind,branch_id,source_url,source_artifact_id,status,provenance_json,thread_id,stage_id,abstract,extraction_contract,source_word_count,note_word_count,source_hash,extraction_adapter,coverage_status,updated_at) VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(noteId, note.recommendation_id || null, note.title, note.kind || 'guide', note.branch_id || null, note.source_url || null, note.source_artifact_id || null, JSON.stringify(provenance), levelId ? null : ownerThreadId, levelId, String(note.abstract || '').trim() || null, extraction?.contract || null, extraction?.source_word_count || null, extraction?.note_word_count || null, extraction?.source_hash || null, extraction?.adapter || null, extraction?.coverage_status || null))
      for (const [index, section] of (note.sections || []).entries()) statements.push(DB.prepare(`INSERT OR REPLACE INTO note_sections (id,note_id,section_key,label,content,direction,position,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`).bind(`${noteId}_${section.section_key}`, noteId, section.section_key, section.label, section.content || '', section.direction || 'auto', index))
      const retain = payload.disposition === 'retain' || payload.disposition === 'apply' || (!payload.disposition && Number(payload.rating || 0) >= 7)
      if (retain) {
        for (const [draftIndex, draft] of (body.srs_drafts || []).entries()) {
          const provenance = Array.isArray(draft.provenance) ? draft.provenance.slice(0, 20).map((item: any) => ({ annotation_id: String(item.annotation_id || '').slice(0, 120), reason: String(item.reason || '').slice(0, 500), confidence: item.confidence == null ? null : Math.max(0, Math.min(1, Number(item.confidence))) })).filter((item: any) => item.annotation_id) : []
          const draftId = String(draft.id || `draft_${job.id}_${draftIndex + 1}`).slice(0, 160)
          statements.push(DB.prepare(`INSERT OR REPLACE INTO srs_drafts (id,recommendation_id,note_id,question,answer,topic,unit_id,thread_id,stage_id,provenance_json,card_type,source_anchor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(draftId, note.recommendation_id || null, noteId, draft.question, draft.answer, draft.topic || note.branch_id || 'general', draft.unit_id || null, ownerThreadId, levelId, JSON.stringify(provenance), draft.card_type || null, draft.source_anchor || null))
        }
      }
    }
    if (job.job_type === 'extract_notes' && Array.isArray(body.learning_units)) {
      const allowedTypes = new Set(['claim','concept','method','example','question','application','counterclaim'])
      for (const [index, unit] of body.learning_units.slice(0, 100).entries()) {
        const unitType = String(unit.unit_type || '').trim()
        const statement = String(unit.statement || '').trim().slice(0, 12000)
        const anchors = Array.isArray(unit.anchors) ? unit.anchors.slice(0, 20) : []
        if (!allowedTypes.has(unitType) || !statement) return c.json({ error: 'learning unit requires valid unit_type and statement', index }, 400)
        if (['claim','method','counterclaim'].includes(unitType) && !anchors.length) return c.json({ error: 'claim-like learning units require anchors', index }, 400)
        const unitId = unit.id || `unit_${job.id}_${index + 1}`
        const semanticKey = String(unit.semantic_key || `${unitType}:${statement.toLowerCase().replace(/\s+/g, ' ').slice(0, 200)}`)
        statements.push(DB.prepare(`INSERT OR IGNORE INTO learning_units (id,unit_type,statement,user_synthesis,stance,confidence,recommendation_id,source_artifact_id,source_revision_checksum,created_by,status,semantic_key) VALUES (?,?,?,?,?,?,?,?,?,'extractor','draft',?)`).bind(unitId, unitType, statement, String(unit.user_synthesis || '').trim() || null, ['accept','question','reject','uncertain'].includes(unit.stance) ? unit.stance : 'uncertain', Math.max(0, Math.min(1, Number(unit.confidence ?? .5))), payload.recommendation_id || null, unit.source_artifact_id || payload.source_artifact_id || null, unit.source_revision_checksum || null, semanticKey))
        for (const [anchorIndex, anchor] of anchors.entries()) {
          const anchorType = ['page','timestamp','section','quote','url_fragment','user_observation'].includes(anchor.anchor_type) ? anchor.anchor_type : 'section'
          const locator = String(anchor.locator || '').trim().slice(0, 1000)
          if (!locator || !payload.recommendation_id) return c.json({ error: 'learning unit anchor requires locator and recommendation_id', index, anchor_index: anchorIndex }, 400)
          statements.push(DB.prepare(`INSERT OR IGNORE INTO unit_anchors (id,unit_id,recommendation_id,artifact_id,annotation_id,anchor_type,locator,excerpt,checksum) VALUES (?,?,?,?,?,?,?,?,?)`).bind(`anchor_${job.id}_${index + 1}_${anchorIndex + 1}`, unitId, payload.recommendation_id, anchor.artifact_id || payload.source_artifact_id || null, anchor.annotation_id || null, anchorType, locator, String(anchor.excerpt || '').slice(0, 4000) || null, anchor.checksum || null))
        }
        if (payloadThreadId) statements.push(DB.prepare(`INSERT OR IGNORE INTO thread_units (thread_id,unit_id,role,importance,position) VALUES (?,?,?,?,?)`).bind(payloadThreadId, unitId, ['core','supporting','counterevidence','application'].includes(unit.role) ? unit.role : 'supporting', Math.max(0, Math.min(1, Number(unit.importance ?? .5))), index))
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
        statements.push(DB.prepare(`INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,0)`).bind(`${reflectionId}_reaction`, reflectionId, 'reaction', 'My reflection', combined, 'auto'))
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
    const proposalIds: string[] = []
    const improvementRunId = (body.proposals || []).length ? `improvement_${job.id}` : null
    if (improvementRunId) statements.push(DB.prepare(`INSERT OR IGNORE INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json) VALUES (?,?,?,'profile','low','observed',?,?,?)`).bind(
      improvementRunId, conversationId, 'conversation_feedback', Math.max(0, Math.min(1, Number(body.proposals.reduce((max: number, item: any) => Math.max(max, Number(item.confidence || 0)), 0)))), JSON.stringify([{ job_id: job.id, recommendation_id: payload.recommendation_id || null }]), JSON.stringify({ job_id: job.id }),
    ))
    for (const proposal of body.proposals || []) {
      if (!proposal.change_type || !proposal.target_label || proposal.proposed === undefined) return c.json({ error: 'proposal requires change_type, target_label, and proposed' }, 400)
      const proposalId = proposal.id || `proposal_${crypto.randomUUID()}`
      proposalIds.push(proposalId)
      const evidence = Array.isArray(proposal.evidence) ? proposal.evidence.slice(0, 20) : proposal.evidence ? [{ source: 'agent', quote: String(proposal.evidence).slice(0, 4000) }] : []
      if (payload.reflection) evidence.unshift({ kind: 'user_statement', direct_user_statement: true, recommendation_id: payload.recommendation_id || null, quote: String(payload.reflection).slice(0, 4000) })
      statements.push(DB.prepare(`INSERT OR IGNORE INTO feedback_proposals (id,recommendation_id,note_id,job_id,change_type,target_label,current_json,proposed_json,evidence,reasoning,confidence,fingerprint,conversation_id,improvement_run_id,layer,risk_level,evidence_json,policy_version,target_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        proposalId,
        payload.recommendation_id || null,
        payload.note_id || null,
        job.id,
        String(proposal.change_type).slice(0, 80),
        String(proposal.target_label).slice(0, 200),
        proposal.current === undefined ? null : JSON.stringify(proposal.current),
        JSON.stringify(proposal.proposed),
        typeof proposal.evidence === 'string' ? String(proposal.evidence).slice(0, 4000) : proposal.evidence ? JSON.stringify(proposal.evidence).slice(0, 4000) : null,
        String(proposal.reasoning || '').slice(0, 4000) || null,
        Math.max(0, Math.min(1, Number(proposal.confidence ?? 0.5))),
        proposalFingerprint(payload.recommendation_id, payload.note_id, proposal),
        conversationId,
        improvementRunId,
        String(proposal.layer || 'profile').slice(0, 40),
        String(proposal.risk_level || 'low').slice(0, 20),
        JSON.stringify(evidence),
        'profile_v2',
        proposal.target_version == null ? null : Number(proposal.target_version),
      ))
    }
    statements.push(DB.prepare(`UPDATE agent_jobs SET status='completed',result_json=?,error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(body), job.id))
    await DB.batch(statements)
    if (job.job_type === 'extract_notes') await advanceConsolidationForExtraction(DB, job.id, body)
    const automation = await DB.prepare(`SELECT value_json FROM user_settings WHERE setting_key='profile_automation'`).first<any>().catch(() => null)
    let automatic = true
    try { automatic = JSON.parse(automation?.value_json || '{}').mode !== 'manual' } catch {}
    const autoApplied: any[] = []
    if (automatic) for (const proposalId of proposalIds) autoApplied.push(await applyFeedbackProposal(DB, proposalId, 'hermes_auto'))
    if (job.job_type === 'apply_feedback_proposal' && payload.proposal_id) autoApplied.push(await applyFeedbackProposal(DB, payload.proposal_id, 'hermes_auto'))
    return c.json({ ok: true, proposals: { created: proposalIds, auto_applied: autoApplied } })
  } catch (error) { return c.json(safeError('Job completion failed')(error), 500) }
})

app.post('/:id/fail', async (c) => {
  const body: { error?: string; worker?: string } = await c.req.json<{ error?: string; worker?: string }>().catch(() => ({}))
  const worker = workerFrom(c, body)
  if (!worker) return c.json({ error: 'worker identity required' }, 400)
  const error = (body.error || 'Hermes job failed').slice(0, 1000)
  const job = await c.env.DB.prepare(`SELECT attempts FROM agent_jobs WHERE id=? AND status='running' AND lease_owner=?`).bind(c.req.param('id'), worker).first<any>()
  if (!job) return c.json({ error: 'job unavailable for failure report' }, 409)
  const terminal = Number(job.attempts || 0) >= 3
  const result = await c.env.DB.prepare(`UPDATE agent_jobs SET status=?,error=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='running' AND lease_owner=?`).bind(terminal ? 'failed' : 'retry', error, c.req.param('id'), worker).run()
  if (!result.meta.changes) return c.json({ error: 'job unavailable for failure report' }, 409)
  const delay = Number(job.attempts || 0) <= 1 ? 30 : Number(job.attempts || 0) === 2 ? 120 : 300
  await c.env.DB.prepare(`INSERT INTO agent_job_retries (job_id,next_attempt_at,retry_count,dead_lettered_at,last_error,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(job_id) DO UPDATE SET next_attempt_at=excluded.next_attempt_at,retry_count=agent_job_retries.retry_count+1,dead_lettered_at=excluded.dead_lettered_at,last_error=excluded.last_error,updated_at=datetime('now')`).bind(c.req.param('id'), terminal ? null : sqliteTime(delay * 1000), 1, terminal ? sqliteTime() : null, error).run()
  if (terminal) await c.env.DB.prepare(`INSERT INTO hermes_alerts (id,kind,severity,title,body,fingerprint) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM hermes_alerts WHERE fingerprint=? AND acknowledged_at IS NULL)`).bind(`alert_${crypto.randomUUID()}`, 'dead_letter', 'critical', 'Hermes job failed permanently', `${c.req.param('id')}: ${error}`, `dead_letter:${c.req.param('id')}`, `dead_letter:${c.req.param('id')}`).run()
  await failConsolidationForJob(c.env.DB, c.req.param('id'), error, terminal)
  return c.json({ ok: true })
})

app.post('/:id/replay', async (c) => {
  const job = await c.env.DB.prepare(`SELECT id,status FROM agent_jobs WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!job) return c.json({ error: 'job not found' }, 404)
  if (job.status !== 'failed') return c.json({ error: 'only failed jobs can be replayed' }, 409)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE agent_jobs SET status='pending',attempts=0,error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(job.id),
    c.env.DB.prepare(`INSERT INTO agent_job_retries (job_id,next_attempt_at,retry_count,dead_lettered_at,last_error,updated_at) VALUES (?,NULL,0,NULL,NULL,datetime('now')) ON CONFLICT(job_id) DO UPDATE SET next_attempt_at=NULL,retry_count=0,dead_lettered_at=NULL,last_error=NULL,updated_at=datetime('now')`).bind(job.id),
  ])
  return c.json({ ok: true, status: 'pending' })
})

app.post('/:id/cancel', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE agent_jobs SET status='cancelled',error='Cancelled by user',lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('pending','retry')`).bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'job not cancellable or not found' }, 409)
  return c.json({ ok: true, status: 'cancelled' })
})

export default app
