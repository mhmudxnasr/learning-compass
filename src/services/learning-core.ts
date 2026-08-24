export type LearningDisposition = 'undecided' | 'retain' | 'apply' | 'reference' | 'drop'

const makeId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

export function normalizeDisposition(value: unknown): LearningDisposition {
  const normalized = String(value || '').trim().toLowerCase()
  if (['retain', 'apply', 'reference', 'drop', 'undecided'].includes(normalized)) return normalized as LearningDisposition
  return 'undecided'
}

type LearningEventInput = {
  eventType: string
  actorType: 'user' | 'system' | 'agent'
  evidenceWeight?: number
  idempotencyKey: string
  threadId?: string | null
  recommendationId?: string | null
  unitId?: string | null
  sessionId?: string | null
  evidenceId?: string | null
  pickId?: string | null
  reasonCode?: string | null
  signalScope?: 'none' | 'eligibility' | 'utility' | 'both'
  signalValue?: number | null
  explicit?: boolean
  origin?: string
  payload?: unknown
}

export function buildLearningEventStatement(DB: D1Database, input: LearningEventInput) {
  return DB.prepare(`INSERT OR IGNORE INTO learning_events
    (id,idempotency_key,event_type,actor_type,evidence_weight,thread_id,recommendation_id,unit_id,session_id,evidence_id,pick_id,reason_code,signal_scope,signal_value,is_explicit,origin,payload_json,schema_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,2)`).bind(
      makeId('event'), input.idempotencyKey, input.eventType, input.actorType,
      Math.max(0, Number(input.evidenceWeight || 0)), input.threadId || null,
      input.recommendationId || null, input.unitId || null, input.sessionId || null,
      input.evidenceId || null, input.pickId || null, input.reasonCode || null,
      input.signalScope || 'none', input.signalValue == null ? null : Number(input.signalValue),
      input.explicit ? 1 : 0, input.origin || 'learning_core', JSON.stringify(input.payload || {}),
    )
}

export async function recordLearningEvent(DB: D1Database, input: LearningEventInput) {
  await buildLearningEventStatement(DB, input).run()
}

export async function createConsolidationRun(DB: D1Database, input: {
  recommendationId: string
  sessionId: string
  threadId?: string | null
  disposition: LearningDisposition
  extractionJobId?: string | null
}) {
  const existing = await DB.prepare(`SELECT id,state FROM consolidation_runs WHERE session_id=?`).bind(input.sessionId).first<{ id: string; state: string }>()
  if (existing) {
    // Feedback can be clarified after the first submission. Keep the run and
    // its idempotency, but make the latest explicit disposition canonical.
    await DB.batch([
      DB.prepare(`UPDATE consolidation_runs SET disposition=?,updated_at=datetime('now') WHERE id=?`).bind(input.disposition, existing.id),
      DB.prepare(`DELETE FROM source_learning_dispositions WHERE recommendation_id=? AND COALESCE(thread_id,'')=COALESCE(?,'')`).bind(input.recommendationId, input.threadId || null),
      DB.prepare(`INSERT INTO source_learning_dispositions (recommendation_id,thread_id,disposition) VALUES (?,?,?)`).bind(input.recommendationId, input.threadId || null, input.disposition),
    ])
    return { ...existing, disposition: input.disposition }
  }
  const runId = makeId('consolidation')
  const needsKnowledge = input.disposition === 'retain' || input.disposition === 'apply'
  const terminalState = needsKnowledge ? 'queued' : 'closed'
  const steps: Array<[string, number, string, number, string | null]> = [
    ['preserve_reflection', 1, 'completed', 1, null],
    ['extract_source', 2, needsKnowledge ? 'pending' : 'waived', needsKnowledge ? 1 : 0, 'preserve_reflection'],
    ['validate_anchors', 3, needsKnowledge ? 'pending' : 'waived', needsKnowledge ? 1 : 0, 'extract_source'],
    ['create_units', 4, needsKnowledge ? 'pending' : 'waived', needsKnowledge ? 1 : 0, 'validate_anchors'],
    ['prepare_recall', 5, 'waived', 0, 'create_units'],
    ['attach_map', 6, needsKnowledge ? 'pending' : 'waived', 0, 'create_units'],
    ['verify_record', 7, needsKnowledge ? 'pending' : 'completed', 1, needsKnowledge ? 'create_units' : 'preserve_reflection'],
  ]
  const statements: D1PreparedStatement[] = [
    DB.prepare(`INSERT INTO consolidation_runs (id,recommendation_id,thread_id,session_id,disposition,state,completed_at) VALUES (?,?,?,?,?,?,CASE WHEN ?='closed' THEN datetime('now') END)`).bind(runId, input.recommendationId, input.threadId || null, input.sessionId, input.disposition, terminalState, terminalState),
    DB.prepare(`DELETE FROM source_learning_dispositions WHERE recommendation_id=? AND COALESCE(thread_id,'')=COALESCE(?,'')`).bind(input.recommendationId, input.threadId || null),
    DB.prepare(`INSERT INTO source_learning_dispositions (recommendation_id,thread_id,disposition) VALUES (?,?,?)`).bind(input.recommendationId, input.threadId || null, input.disposition),
  ]
  for (const [key, position, status, required, dependency] of steps) {
    statements.push(DB.prepare(`INSERT INTO consolidation_steps (id,run_id,step_key,position,status,required,depends_on_step,agent_job_id,completed_at) VALUES (?,?,?,?,?,?,?,?,CASE WHEN ? IN ('completed','waived') THEN datetime('now') END)`).bind(`${runId}_${key}`, runId, key, position, status, required, dependency, key === 'extract_source' ? input.extractionJobId || null : null, status))
  }
  await DB.batch(statements)
  if (input.extractionJobId) await DB.prepare(`UPDATE agent_jobs SET recommendation_id=?,trigger_kind='explicit_user_action',workflow_run_id=?,workflow_step='extract_source' WHERE id=?`).bind(input.recommendationId, runId, input.extractionJobId).run()
  return { id: runId, state: terminalState }
}

export async function advanceConsolidationForExtraction(DB: D1Database, jobId: string, result: unknown) {
  const job = await DB.prepare(`SELECT workflow_run_id,recommendation_id,payload_json FROM agent_jobs WHERE id=?`).bind(jobId).first<{ workflow_run_id: string | null; recommendation_id: string | null; payload_json: string | null }>()
  let runId = job?.workflow_run_id || null
  if (!runId) {
    let recommendationId = job?.recommendation_id || null
    if (!recommendationId) { try { recommendationId = JSON.parse(job?.payload_json || '{}').recommendation_id || null } catch {} }
    if (recommendationId) runId = (await DB.prepare(`SELECT id FROM consolidation_runs WHERE recommendation_id=? AND state NOT IN ('closed','waived') ORDER BY requested_at DESC LIMIT 1`).bind(recommendationId).first<{ id: string }>())?.id || null
  }
  if (!runId) return
  await DB.batch([
    DB.prepare(`UPDATE consolidation_steps SET status='completed',result_json=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=? AND step_key='extract_source'`).bind(JSON.stringify(result || {}), runId),
    DB.prepare(`UPDATE consolidation_steps SET status='completed',completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=? AND step_key IN ('validate_anchors','create_units','verify_record')`).bind(runId),
    DB.prepare(`UPDATE consolidation_steps SET status='waived',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE run_id=? AND step_key='prepare_recall'`).bind(runId),
    DB.prepare(`UPDATE consolidation_steps SET status='waived',completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=? AND step_key='attach_map' AND status='pending'`).bind(runId),
    DB.prepare(`UPDATE consolidation_runs SET state='closed',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(runId),
  ])
}

export async function failConsolidationForJob(DB: D1Database, jobId: string, error: string, terminal: boolean) {
  const job = await DB.prepare(`SELECT workflow_run_id,workflow_step FROM agent_jobs WHERE id=?`).bind(jobId).first<any>()
  if (!job?.workflow_run_id) return
  await DB.prepare(`UPDATE consolidation_steps SET status=?,error=?,updated_at=datetime('now') WHERE run_id=? AND step_key=?`).bind(terminal ? 'failed' : 'pending', error, job.workflow_run_id, job.workflow_step || 'extract_source').run()
  if (terminal) await DB.prepare(`UPDATE consolidation_runs SET state='repair_required',failure_reason=?,updated_at=datetime('now') WHERE id=?`).bind(error, job.workflow_run_id).run()
}
