import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { buildLearningBalance } from '../services/learning-balance'
import { compileMemoryContext, isMemoryOwnershipAllowed, isMemoryTaskKind, writeMemoryEvidence } from '../services/memory-context'
import { loadCaptureQueue } from '../services/capture-queue'
import { loadHermesBrief } from '../services/agent-briefing'
import { AGENT_CONTRACT_VERSION, AGENT_PROTOCOL, type AgentMethod, buildAgentOpenApi, buildCapabilityCatalog, resolveCapabilityReadbacks } from '../services/agent-capabilities'
import { MAINTENANCE_CRON, runMaintenance } from '../services/maintenance'
import { loadOperationalHealth } from '../services/operational-health'

const app = new Hono<{ Bindings: Bindings }>()
const sqliteTime = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ')

/**
 * The agent API is an intentionally boring adapter over the public product API.
 * Keeping the allow-list here prevents an agent token from becoming arbitrary
 * SQL or an arbitrary outbound HTTP proxy while still making the whole site
 * discoverable and operable from Hermes, Claude Code, Codex, or any HTTP agent.
 */
const CAPABILITIES = [
  ['GET', '/agent/context', 'Read the compact taste and learning context.'],
  ['GET', '/agent/briefing', 'Read the deterministic next-action brief shared with the Home workspace.'],
  ['GET', '/agent/activity', 'Read recent Hermes receipts, audit events, and operational status.'],
  ['GET', '/agent/system', 'Read the user-visible runtime, storage, schedule, recovery, and service inventory.'],
  ['GET', '/health/ready', 'Read canonical production readiness across storage, integrity, jobs, maintenance, and recovery.'],
  ['POST', '/agent/maintenance/run', 'Run the configured maintenance workflow on demand and persist a task-level receipt.'],
  ['GET', '/dashboard/briefing', 'Read Momentum, active Queue files, weekly progress, and current insight.'],
  ['GET', '/capture', 'Read captured source records.'],
  ['POST', '/capture', 'Save a URL, text, or artifact as a source record.'],
  ['GET', '/capture/feeds', 'Read RSS and Atom subscriptions.'],
  ['GET', '/capture/feeds/:id/entries', 'Read every article imported from one feed, paginated.'],
  ['POST', '/capture/feeds', 'Subscribe to an RSS or Atom feed and import its latest entries; optional limit caps the initial import.'],
  ['POST', '/capture/feeds/sync', 'Check every enabled web feed for new Inbox articles; optional limit caps entries per feed.'],
  ['POST', '/capture/feeds/:id/sync', 'Check one web feed for new Inbox articles; optional limit caps imported entries.'],
  ['DELETE', '/capture/feeds/:id', 'Unsubscribe from a web feed without deleting captured articles.'],
  ['GET', '/capture/queue', 'Read the active queue.'],
  ['POST', '/capture/:id/triage', 'Queue, neutrally remove from Queue, or exclude a captured source; queue cap is enforced.'],
  ['POST', '/capture/:id/visualise', 'Ask Hermes to create a Lite Visual HTML/PDF companion for a queued link.'],
  ['GET', '/capture/:id', 'Read one capture.'],
  ['GET', '/capture/:id/record', 'Read the canonical source record with exact feedback, extracted note sections, jobs, proposals, files, recall, sessions, memory influence, and outcome.'],
  ['GET', '/compass/pick', 'Read the newest active ready/started Compass Pick; multiple concurrent picks may exist.'],
  ['GET', '/compass/context', 'Read the bounded canonical Thread, profile, exclusions, history, and candidate contract before Hermes researches recommendation candidates.'],
  ['POST', '/compass/semantic/index', 'Explicitly index changed Learning Compass sources, Threads, Notes, and Units into the private semantic retrieval index; no recommendation is created.'],
  ['POST', '/compass/picks', 'Submit 3–24 candidates for server-owned adaptive Compass Pick selection while queued/in-progress Queue count is below five; does not auto-start.'],
  ['POST', '/compass/evaluate', 'Dry-run v1 and v2 scoring for 3–24 candidates without creating a pick.'],
  ['POST', '/compass/pick/:id/candidates', 'Expand an abstained Compass Pick with additional candidates and rescore the complete set up to eight.'],
  ['POST', '/compass/pick/:id/start', 'Explicitly start any ready Compass Pick through the normal Queue/session workflow; the five-item cap is enforced.'],
  ['POST', '/compass/pick/:id/feedback', 'Record explicit Compass Pick outcome, rating, reason tags, and reflection.'],
  ['GET', '/recommendations/list', 'Search and filter recommendation history.'],
  ['GET', '/feedback/context', 'Read all archived feedback with the current profile and knowledge nodes for evidence-based learning.'],
  ['POST', '/recommendations/push', 'Create or update a recommendation with deduplication.'],
  ['POST', '/recommendations/action', 'Change status, rating, review, consumed date, or register an item-specific NotebookLM URL.'],
  ['PATCH', '/recommendations/:id/source-url', 'Replace the preferred Original source URL while preserving the previous archive URL.'],
  ['GET', '/recommendations/books', 'Read the unified Books workspace projection, including personal state, normalized chapters, progress, next action, and book-scoped file links.'],
  ['POST', '/recommendations/books/:id/reading-state', 'Set personal saved, reading, or finished state without changing Queue commitment; primary true explicitly pins one Reading book.'],
  ['POST', '/recommendations/books/:id/chapters', 'Register or update book-scoped chapter metadata without creating artifacts.'],
  ['POST', '/recommendations/books/:id/chapters/:chapterKey/complete', 'Mark one book-scoped chapter complete or incomplete.'],
  ['POST', '/recommendations/map', 'Attach one or more completed sources to an existing knowledge-map branch.'],
  ['POST', '/recommendations/delete', 'Delete a recommendation.'],
  ['DELETE', '/recommendations/:id/permanent', 'Irreversibly delete an archived recommendation and linked learning history/artifacts.'],
  ['POST', '/recommendations/undo', 'Undo a reversible recommendation deletion.'],
  ['GET', '/brain/profile', 'Read profile, priorities, patterns, blacklist, and audit history.'],
  ['POST', '/brain/profile', 'Edit any editable profile field.'],
  ['GET', '/brain/profile/intelligence', 'Read typed profile assertions, health, and reversible revisions.'],
  ['PUT', '/brain/profile/assertions/:key', 'Create or replace a typed profile assertion as an explicit user edit.'],
  ['POST', '/brain/profile/revisions/:id/revert', 'Undo one typed profile revision.'],
  ['GET', '/brain/branch-deck', 'Read the personal top-level branch index, category index, status, round, and linked activity.'],
  ['POST', '/brain/branch-swipe', 'Activate, pause, prioritize, archive, add, edit, or undo a personal branch.'],
  ['POST', '/brain/branch-suggest', 'Request review-before-commit new-branch ideas grounded in live Compass context; nothing is written.'],
  ['POST', '/brain/priorities', 'Replace priorities.'],
  ['GET', '/brain/tree', 'Read the knowledge tree.'],
  ['POST', '/brain/node', 'Create a knowledge node.'],
  ['PUT', '/brain/node/:id', 'Edit a knowledge node.'],
  ['DELETE', '/brain/node/:id', 'Delete a leaf knowledge node.'],
  ['POST', '/brain/pattern/strength', 'Promote or demote a pattern.'],
  ['POST', '/brain/contradiction/resolve', 'Resolve a contradiction.'],
  ['GET', '/brain/resurfacing', 'Read the bounded daily resurfacing item with canonical branch and domain context.'],
  ['PATCH', '/brain/resurfacing/:recommendationId/preference', 'Explicitly star or unstar one consumed source for resurfacing priority.'],
  ['POST', '/brain/resurfacing/presentations', 'Record one source presentation idempotently for the current Cairo day.'],
  ['POST', '/brain/resurfacing/:eventId/action', 'Mark a resurfaced source reviewed, snoozed, or dismissed without changing learning progression.'],
  ['GET', '/knowledge/graph', 'Read the evidence-backed graph.'],
  ['GET', '/notes', 'Read structured notes and sections.'],
  ['GET', '/notes/:id', 'Read one note dossier with anchored Units, meaningful backlinks, recall, and progressive distillation.'],
  ['POST', '/notes', 'Create a structured note owned by a source, Thread (thread_id), or exact Level (stage_id); a note cannot belong directly to both Thread and Level.'],
  ['POST', '/notes/:id/distillation/highlights', 'Explicitly retain one checksum-bound claim from the current note text.'],
  ['POST', '/notes/:id/distillation/syntheses', 'Append one user-authored concise synthesis revision without rewriting the note.'],
  ['POST', '/notes/:id/distillation/highlights/:highlightId/promote', 'Explicitly promote a retained claim into one anchored Learning Unit.'],
  ['PUT', '/notes/:id', 'Edit a note and its sections.'],
  ['DELETE', '/notes/:id', 'Delete a note and sections.'],
  ['POST', '/notes/:id/process', 'Queue confirmation-gated feedback processing for a personal reflection.'],
  ['GET', '/notes/hub', 'Read notes directly owned by a Learning Thread (thread_id) or exact Level (stage_id).'],
  ['GET', '/sessions', 'Read learning sessions.'],
  ['POST', '/sessions/start', 'Start an external learning session.'],
  ['POST', '/sessions/:id/return', 'Return, reflect, and optionally complete a session.'],
  ['DELETE', '/sessions/:id', 'Delete an incomplete session.'],
  ['GET', '/srs/drafts', 'Read editable SRS drafts globally or directly owned by one Thread (thread_id) or Level (stage_id).'],
  ['PUT', '/srs/drafts/:id', 'Edit an SRS draft.'],
  ['POST', '/srs/drafts/:id/approve', 'Approve an SRS draft into review.'],
  ['POST', '/srs/drafts/:id/reject', 'Reject an SRS draft.'],
  ['DELETE', '/srs/drafts/:id', 'Delete a draft.'],
  ['GET', '/learning/srs/cards', 'Read active recall cards globally or directly owned by one Thread (thread_id) or Level (stage_id).'],
  ['GET', '/learning/srs/cards/:id', 'Read one exact recall card, including cards that are not due.'],
  ['POST', '/learning/srs/create', 'Create one learner-authored recall card owned by a Thread (thread_id) or exact Level (stage_id).'],
  ['POST', '/learning/srs/review', 'Record a learner-confirmed recall grade and update its schedule and review history.'],
  ['DELETE', '/learning/srs/cards/:id', 'Delete an active recall card.'],
  ['GET', '/learning/core/integrity/health', 'Read canonical relationship integrity and quarantined legacy records.'],
  ['GET', '/learning/core/hub', 'Read the Learning Hub with path progress and the current stage for every deliberate learning path.'],
  ['GET', '/learning/core/threads', 'Read Learning Threads.'],
  ['GET', '/learning/core/threads/:id/path', 'Read one complete Learning Thread workspace: direct lesson completion plus each Level and its lessons, notes, files, recall cards, projects, and sources.'],
  ['GET', '/learning/core/canon', 'Browse the evergreen three-book Canon by domain, curation state, validation state, family, or book search.'],
  ['GET', '/learning/core/canon/domains/:id', 'Read one Canon domain with its three role-based book dossiers and replacement history.'],
  ['GET', '/learning/core/canon/entries/:id', 'Read one exact Canon book selection and its linked source state.'],
  ['POST', '/learning/core/canon/domains', 'Create a Canon family or domain connected to a verified non-pruned knowledge branch.'],
  ['PATCH', '/learning/core/canon/domains/:id', 'Edit a Canon domain boundary, branch, curation state, or field-test state.'],
  ['PUT', '/learning/core/canon/domains/:id/entries/:role', 'Create or replace one Foundation, Representative, or Boundary selection while preserving replacement history.'],
  ['POST', '/learning/core/canon/entries/:id/capture', 'Explicitly save one Canon book as a source and inherit the domain branch.'],
  ['POST', '/learning/core/canon/domains/:id/thread', 'Explicitly start a normal finite Learning Thread from one Canon domain.'],
  ['POST', '/learning/core/threads/:id/stages/:stageId/start', 'Start an available Learning Hub stage and make its next action explicit.'],
  ['GET', '/learning/core/weekly', 'Read the weekly closure review for stale Threads, cognitive loops, and due recall.'],
  ['GET', '/learning/core/counterevidence', 'Find important Thread Units without contradiction or qualification evidence.'],
  ['POST', '/learning/core/threads', 'Create a purpose-first Learning Thread; deep Hub paths must include an interview brief in the Thread context.'],
  ['GET', '/learning/core/threads/:id', 'Read a Thread workspace, direct lesson state, sources, Units, and optional project context.'],
  ['GET', '/learning/core/threads/:id/export', 'Export a complete Thread packet as JSON or Markdown.'],
  ['PATCH', '/learning/core/threads/:id', 'Edit a Thread or its final synthesis.'],
  ['POST', '/learning/core/threads/:id/status', 'Activate, pause, or abandon a Thread.'],
  ['POST', '/learning/core/threads/:id/sources', 'Attach a source to a Thread with an explicit role.'],
  ['POST', '/learning/core/threads/:id/stages', 'Add a staged curriculum level to a Learning Hub path.'],
  ['PATCH', '/learning/core/threads/:id/stages/:stageId', 'Edit a Learning Thread Level definition and order; direct lesson completion owns progression.'],
  ['POST', '/learning/core/threads/:id/stages/:stageId/sources', 'Assign a source to an existing Learning Hub stage with a foundation, case, companion, counterevidence, or reference role; source-fill work preserves the path structure.'],
  ['POST', '/learning/core/threads/:id/stages/:stageId/lessons', 'Create one authored lesson inside an existing Learning Thread level.'],
  ['PATCH', '/learning/core/threads/:id/lessons/:lessonId', 'Update lesson orientation, content, or self-directed completion state.'],
  ['POST', '/learning/core/threads/:id/lessons/:lessonId/sources', 'Attach one verified study source directly to a course lesson.'],
  ['PATCH', '/learning/core/threads/:id/projects/:projectId', 'Update optional Thread project metadata; projects do not affect progression.'],
  ['DELETE', '/learning/core/threads/:id/sources/:sourceId', 'Remove a source from a Thread without deleting it.'],
  ['DELETE', '/learning/core/threads/:id', 'Irreversibly delete one exact Learning Thread after explicit confirmation.'],
  ['GET', '/learning/core/units', 'Read atomic anchored Learning Units.'],
  ['GET', '/learning/core/units/:id', 'Read one anchored Learning Unit with incoming and outgoing explained relationships.'],
  ['POST', '/learning/core/units', 'Create an anchored Learning Unit.'],
  ['POST', '/learning/core/units/:id/relations', 'Create a typed relationship between Learning Units.'],
  ['GET', '/learning/core/contradictions', 'Read anchored Unit contradictions by review state.'],
  ['PATCH', '/learning/core/contradictions/:id', 'Accept, resolve, or dismiss one anchored contradiction while preserving its claims and sources.'],
  ['GET', '/annotations', 'Read source-anchored passage annotations with durable locators.'],
  ['POST', '/annotations', 'Create a source-anchored passage annotation in the canonical evidence ledger.'],
  ['GET', '/annotations/:id', 'Read one source annotation and its linked derivations.'],
  ['POST', '/annotations/:id/archive', 'Archive an annotation without deleting its evidence history.'],
  ['GET', '/learning/core/consolidation/open', 'Read open cognitive loops.'],
  ['GET', '/learning/core/consolidation/:sourceId', 'Read one source consolidation run and its steps.'],
  ['POST', '/learning/core/consolidation/:id/retry', 'Retry a repair-required consolidation run.'],
  ['POST', '/learning/core/consolidation/:id/waive', 'Explicitly waive a consolidation run with a reason.'],
  ['POST', '/learning/core/consolidation/:id/reconcile', 'Close a complete stranded consolidation or recreate and link its missing extraction job.'],
  ['GET', '/feedback/proposals', 'Read pending and reviewed Hermes change proposals.'],
  ['POST', '/feedback/record', 'Resolve or capture a source, preserve feedback verbatim, update completion and rating, create idempotent analysis/extraction work, and return one exact receipt.'],
  ['POST', '/feedback/proposals/:id/approve', 'Approve a proposed profile or map change for Hermes application.'],
  ['POST', '/feedback/proposals/:id/apply', 'Policy-check and automatically apply a Hermes profile proposal.'],
  ['POST', '/feedback/proposals/:id/revert', 'Revert one applied proposal and its typed profile revision.'],
  ['POST', '/feedback/proposals/:id/reject', 'Reject a proposed profile or map change.'],
  ['GET', '/artifacts', 'Read R2 artifact metadata and pairs.'],
  ['POST', '/artifacts', 'Upload an HTML, PDF, or other source artifact.'],
  ['POST', '/artifacts/:id/process', 'Queue idempotent note extraction.'],
  ['DELETE', '/artifacts/:id', 'Delete an artifact and its R2 object.'],
  ['GET', '/artifacts/hub', 'Read file metadata directly owned by a Learning Thread (thread_id) or exact Level (stage_id).'],
  ['GET', '/settings', 'Read settings.'],
  ['PUT', '/settings/:key', 'Edit one setting.'],
  ['GET', '/dashboard/layout', 'Read dashboard layout.'],
  ['PUT', '/dashboard/layout', 'Edit dashboard layout.'],
  ['GET', '/agent/jobs', 'Read durable jobs.'],
  ['GET', '/agent/jobs/health', 'Read Hermes job queue health, overdue retries, and stale lease counts.'],
  ['POST', '/agent/jobs/reconcile', 'Dry-run or apply conservative reconciliation of visual jobs against canonical sources and complete R2 pairs.'],
  ['POST', '/agent/jobs/:id/claim', 'Claim a leased job.'],
  ['POST', '/agent/jobs/:id/checkpoint', 'Advance one resumable workflow to its next declared step.'],
  ['POST', '/agent/jobs/:id/complete', 'Complete a leased job with structured output.'],
  ['POST', '/agent/jobs/:id/fail', 'Fail a leased job with retryable error.'],
  ['POST', '/agent/jobs/:id/replay', 'Replay a failed or dead-lettered job from a clean attempt.'],
  ['POST', '/agent/jobs/:id/cancel', 'Cancel a pending or retrying job and clear its lease.'],
  ['POST', '/agent/jobs/:id/heartbeat', 'Renew long-running discovery job lease.'],
  ['GET', '/agent/memory', 'Browse and search Hermes memories with evidence and recommendation influence links.'],
  ['GET', '/agent/memory/context', 'Compile a bounded, task-specific memory packet with a retrieval receipt.'],
  ['POST', '/agent/memory', 'Write a guarded Hermes memory entry with provenance and confidence.'],
  ['POST', '/agent/memory/:id/approve', 'Approve one Hermes memory for active use.'],
  ['POST', '/agent/memory/:id/expire', 'Expire one Hermes memory.'],
  ['POST', '/agent/memory/:id/resolve', 'Supersede or reject one Hermes memory entry.'],
  ['POST', '/agent/alerts/:id/ack', 'Acknowledge one Hermes operational alert.'],
  ['GET', '/discovery/state', 'Read active discovery, gate state, frontier, and current research job.'],
  ['GET', '/discovery/context', 'Token-efficient complete engine context for Hermes.'],
  ['GET', '/discovery/drift-check', 'Audit API, skill version/hash, and active Hermes workflow alignment.'],
  ['POST', '/discovery/runs', 'Create one research mission after enforcing the hard feedback gate.'],
  ['POST', '/discovery/runs/:id/candidates', 'Batch-store structured researched candidates.'],
  ['POST', '/discovery/runs/:id/select', 'Store the winner and decision receipt.'],
  ['POST', '/discovery/runs/:id/activate', 'Capture through Inbox, promote through normal Queue validation, and start the linked session.'],
  ['POST', '/discovery/runs/:id/interview', 'Record feedback questions and answers.'],
  ['POST', '/discovery/runs/:id/resolve', 'Atomically apply resolved evidence, bounded weights, branch mutations, and the learning receipt.'],
  ['GET', '/discovery/revisions/pending', 'Fetch staged skill revisions for host-side Hermes synchronization.'],
  ['POST', '/discovery/revisions/:id/confirm', 'Confirm host-side application of a staged skill revision.'],
  ['POST', '/ai/enhance', 'Enhance or repair a recommendation using taste context.'],
  ['POST', '/ai/enhance/why', 'Generate or improve recommendation rationale.'],
  ['GET', '/search', 'Search site content.'],
  ['GET', '/search/evidence', 'Search source-anchored evidence and return durable locators plus linked learning units.'],
  ['GET', '/taste/vector', 'Read taste vectors.'],
  ['GET', '/learning/health', 'Read learning health.'],
  ['GET', '/learning/balance', 'Read attention balance, branch coverage, retention signals, and unmapped sources.'],
  ['GET', '/analytics/creator-trust', 'Read creator trust analytics.'],
  ['GET', '/analytics/taste-drift', 'Read taste drift analytics.'],
  ['GET', '/analytics/heatmaps', 'Read learning heatmaps.'],
  ['GET', '/analytics/forecast', 'Read forecast analytics.'],
  ['GET', '/analytics/hermes', 'Read Hermes operations, quality, memory, alerts, and engine metrics.'],
  ['POST', '/analytics/hermes/recalibrate', 'Apply conversation-bound, slow, evidence-gated recommendation weight recalibration.'],
  ['GET', '/analytics/hermes/engine', 'Read v2 shadow-rollout gates and current engine mode.'],
  ['POST', '/analytics/hermes/engine/activate', 'Switch from shadow to v2 only after every evidence gate passes.'],
  ['POST', '/analytics/hermes/engine/rollback', 'Return recommendation serving to shadow mode with a receipt.'],
  ['GET', '/analytics/hermes/repair', 'Preview deterministic recommendation and profile history repair.'],
  ['POST', '/analytics/hermes/repair', 'Apply a conversation-bound, snapshot-guarded deterministic history repair.'],
  ['GET', '/analytics/hermes/improvements', 'Read self-improvement run receipts and rollback status.'],
  ['POST', '/analytics/hermes/improvements', 'Open a conversation-bound self-improvement run.'],
  ['POST', '/analytics/hermes/improvements/:id/complete', 'Record validated application or deployment of a self-improvement run.'],
  ['POST', '/analytics/hermes/improvements/:id/revert', 'Record rollback of an applied or deployed self-improvement run.'],
  ['GET', '/notifications', 'Read browser and Telegram reminder controls and delivery history.'],
  ['GET', '/notifications/vapid', 'Read browser push configuration status.'],
  ['POST', '/notifications/push/subscribe', 'Enable browser reminder delivery for this device.'],
  ['DELETE', '/notifications/push/:id', 'Disable browser reminder delivery for this device.'],
  ['POST', '/notifications/telegram', 'Enable or disable Telegram reminder delivery.'],
  ['POST', '/notifications/test', 'Send and record a reminder delivery test.'],
  ['GET', '/analytics/hermes/weekly', 'Read the weekly Hermes evaluator report.'],
  ['POST', '/analytics/hermes/evaluate', 'Create conversation-bound reviewable evaluator proposals from weekly evidence.'],
  ['POST', '/analytics/hermes/backfill', 'Dry-run or conversation-bound apply of missing intelligence records.'],
  ['GET', '/notebooklm/health', 'Read NotebookLM broker, grounding, fallback, and session health.'],
  ['POST', '/notebooklm/health', 'Record a NotebookLM broker heartbeat and grounding result.'],
  ['POST', '/notebooklm/recover', 'Record a NotebookLM session recovery request.'],
  ['GET', '/notebooklm/learning/receipts', 'Read the latest NotebookLM source indexing, focused output plan, and provider artifact receipts for one source.'],
  ['POST', '/notebooklm/learning/route', 'Create a focused source-grounded NotebookLM output plan after source indexing is verified.'],
  ['POST', '/notebooklm/learning/receipts', 'Record truthful NotebookLM source or provider artifact lifecycle evidence without changing learning progress.'],
] as const

const CAPABILITY_PATTERNS = CAPABILITIES.map(([method, path]) => ({
  method,
  regex: new RegExp('^' + path.replace(/:[^/]+/g, '[^/]+') + '(?:\\?.*)?$'),
}))

function isAllowedAgentRequest(method: string, path: string) {
  return CAPABILITY_PATTERNS.some((item) => item.method === method && item.regex.test(path))
}

async function logAgentAction(DB: any, c: any, action: string, payload: unknown, status: string) {
  try {
    const agent = c.req.header('x-agent-name') || c.req.header('user-agent') || 'unknown-agent'
    await DB.prepare('INSERT INTO agent_logs (agent_name, action, payload_json, status) VALUES (?, ?, ?, ?)')
      .bind(agent.slice(0, 120), action.slice(0, 200), JSON.stringify(payload ?? null).slice(0, 20000), status.slice(0, 40)).run()
  } catch { /* audit failure must not break the product request */ }
}

async function persistAgentReceipt(DB: any, c: any, receipt: any, statusCode: number, verified: boolean) {
  try {
    const agent = c.req.header('x-agent-name') || c.req.header('user-agent') || 'unknown-agent'
    await DB.prepare(`INSERT INTO agent_receipts
      (id,request_id,agent_name,intent,target,status_code,verified,receipt_json)
      VALUES (?,?,?,?,?,?,?,?)`).bind(
      `receipt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      c.req.header('x-request-id') || null,
      agent.slice(0, 120),
      String(receipt?.intent || 'unknown').slice(0, 40),
      String(receipt?.target || '').slice(0, 500),
      statusCode,
      verified ? 1 : 0,
      JSON.stringify(receipt).slice(0, 100000),
    ).run()
  } catch { /* receipt persistence must not turn a committed mutation into a failure */ }
}

app.get('/briefing', async (c) => {
  c.header('Cache-Control', 'no-store')
  try {
    return c.json(await loadHermesBrief(c.env.DB))
  } catch (error) {
    return c.json(safeError('Hermes briefing unavailable')(error), 503)
  }
})

app.get('/activity', async (c) => {
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || 20)))
  const [receipts, logs, jobs, proposals] = await Promise.all([
    c.env.DB.prepare(`SELECT id,request_id,agent_name,intent,target,status_code,verified,receipt_json,created_at
      FROM agent_receipts ORDER BY created_at DESC LIMIT ?`).bind(limit).all<any>(),
    c.env.DB.prepare(`SELECT id,ts,agent_name,action,status FROM agent_logs ORDER BY ts DESC LIMIT ?`).bind(limit).all<any>(),
    c.env.DB.prepare(`SELECT id,job_type,status,error,attempts,created_at,updated_at FROM agent_jobs
      WHERE status IN ('pending','running','retry','failed','dead_letter') ORDER BY updated_at DESC LIMIT ?`).bind(limit).all<any>(),
    c.env.DB.prepare(`SELECT id,change_type AS proposal_type,status,created_at,reviewed_at,applied_at,
      COALESCE(applied_at,reviewed_at,created_at) AS updated_at FROM feedback_proposals
      WHERE status IN ('pending','approved','applied','rejected')
      ORDER BY COALESCE(applied_at,reviewed_at,created_at) DESC LIMIT ?`).bind(limit).all<any>(),
  ])
  const parsedReceipts = (receipts.results || []).map((row: any) => {
    let receipt: any = null
    try { receipt = JSON.parse(row.receipt_json || '{}') } catch { receipt = { blocker: { message: 'Receipt payload could not be decoded.' } } }
    return { ...row, verified: Boolean(row.verified), receipt, receipt_json: undefined }
  })
  return c.json({
    as_of: new Date().toISOString(),
    receipts: parsedReceipts,
    audit_events: logs.results || [],
    jobs: jobs.results || [],
    proposals: proposals.results || [],
    health: {
      active_jobs: (jobs.results || []).filter((row: any) => ['pending', 'running', 'retry'].includes(row.status)).length,
      failed_jobs: (jobs.results || []).filter((row: any) => ['failed', 'dead_letter'].includes(row.status)).length,
      pending_proposals: (proposals.results || []).filter((row: any) => row.status === 'pending').length,
    },
  })
})

/** Token-efficient canonical state with explicit per-section health. */
app.get('/context', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const asOf = new Date().toISOString()
  const sectionHealth: Record<string, { status: 'ok' | 'degraded'; as_of: string; error?: string }> = {}
  const load = async <T>(name: string, fallback: T, operation: () => Promise<T>): Promise<T> => {
    try {
      const value = await operation()
      sectionHealth[name] = { status: 'ok', as_of: asOf }
      return value
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sectionHealth[name] = { status: 'degraded', as_of: asOf, error: message.slice(0, 300) }
      return fallback
    }
  }

  const profile = await load<any>('profile', null, () => DB.prepare('SELECT identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, patterns_summary_json FROM profile WHERE id = 1').first<any>())
  const priorities = await load<any>('priorities', { results: [] }, () => DB.prepare('SELECT rank, branch_id, label, rationale FROM priorities ORDER BY rank ASC LIMIT 10').all())
  const activeQueue = await load<any[]>('active_queue', [], () => loadCaptureQueue(DB, 50))
  const brief = await load<any>('brief', null, () => loadHermesBrief(DB))
  const profileAssertions = await load<any>('profile_assertions', { results: [] }, () => DB.prepare("SELECT assertion_key,category,scope,value_json,weight,confidence,status,source_kind,version,updated_at FROM profile_assertions WHERE status IN ('active','hypothesis') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,confidence DESC,updated_at DESC LIMIT 100").all())
  const gaps = await load<any>('learning_gaps', { results: [] }, () => Promise.resolve({ results: [] }))
  const completedThreads = await load<any>('completed_threads', { results: [] }, () => DB.prepare(`
    SELECT id,title,thread_type,guiding_question,definition_of_done,final_synthesis,completed_at
    FROM learning_threads WHERE status='verified' ORDER BY COALESCE(completed_at,updated_at) DESC LIMIT 50`).all())
  let neglected: any = { results: [] }
  let mastered: any = { results: [] }
  let blindSpots: any = { results: [] }
  let blacklist: any = { results: [] }
  let creatorTrust: any = { results: [] }
  let tasteVectors: any = { results: [] }
  let reflections: any = { results: [] }
  let learningBalance: any = null

  neglected = await load<any>('neglected_branches', { results: [] }, async () => {
    // Neglected = no consumed source mapped to the branch (recommendation_meta.branch_id,
    // the canonical linkage written by POST /recommendations/map) and no legacy
    // dedup_key-prefix consumption in the window.
    return DB.prepare(`
      SELECT t.id, t.label, t.super_category,
             MAX(COALESCE(dm.last_consumed, dr.last_consumed)) as last_consumed
      FROM tree_nodes t
      LEFT JOIN (
        SELECT m.branch_id AS branch, MAX(r.consumed_date) AS last_consumed
        FROM recommendation_meta m
        JOIN recommendations r ON r.id = m.recommendation_id AND r.status = 'consumed'
        WHERE m.branch_id IS NOT NULL AND m.branch_id != ''
        GROUP BY m.branch_id
      ) dm ON dm.branch = t.id
      LEFT JOIN (
        SELECT r.dedup_key AS branch, MAX(r.consumed_date) AS last_consumed
        FROM recommendations r
        WHERE r.status = 'consumed' AND r.dedup_key IS NOT NULL AND r.dedup_key != ''
        GROUP BY r.dedup_key
      ) dr ON dr.branch = t.id OR dr.branch LIKE (t.id || '-%')
      WHERE t.type IN ('branch', 'category')
      GROUP BY t.id
      HAVING MAX(COALESCE(dm.last_consumed, dr.last_consumed)) IS NULL
         OR MAX(COALESCE(dm.last_consumed, dr.last_consumed)) < date('now', '-30 days')
      ORDER BY MAX(COALESCE(dm.last_consumed, dr.last_consumed)) ASC
      LIMIT 5
    `).all()
  })
  mastered = await load<any>('mastered', { results: [] }, () => DB.prepare('SELECT id, kind, label, author, rating FROM mastered ORDER BY mastered_at DESC').all())
  blindSpots = await load<any>('blind_spots', { results: [] }, () => DB.prepare(`
      SELECT n.id, n.label, n.super_category
      FROM tree_nodes n
      LEFT JOIN recommendation_meta m ON m.branch_id = n.id
      LEFT JOIN recommendations r ON r.id = m.recommendation_id AND r.status = 'consumed'
      WHERE n.type IN ('branch', 'leaf')
      GROUP BY n.id
      HAVING COUNT(r.id) = 0
      LIMIT 15
    `).all())
  blacklist = await load<any>('blacklist', { results: [] }, () => DB.prepare('SELECT name, work, reason, severity FROM blacklist ORDER BY severity ASC').all())
  creatorTrust = await load<any>('creator_trust', { results: [] }, () => DB.prepare(`
      SELECT creator, ROUND(AVG(COALESCE(user_score, CASE user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END)), 2) as avg_score
      FROM recommendations
      WHERE creator IS NOT NULL AND creator != '' AND status = 'consumed'
      GROUP BY creator
      ORDER BY avg_score DESC
      LIMIT 15
    `).all())
  tasteVectors = await load<any>('taste_vectors', { results: [] }, () => DB.prepare('SELECT topic, affinity_score FROM taste_vectors ORDER BY affinity_score DESC LIMIT 15').all())
  reflections = await load<any>('recent_note_anchors', { results: [] }, () => DB.prepare("SELECT reflection FROM learning_sessions WHERE reflection IS NOT NULL AND reflection != '' ORDER BY completed_at DESC LIMIT 5").all())
  learningBalance = await load<any>('learning_balance', null, async () => {
    const balance = await buildLearningBalance(DB, 90)
    const branches = balance.branches || []
    const compact = (state: string) => branches.filter((branch: any) => branch.state === state).sort((a: any, b: any) => Number(b.attention_share || 0) - Number(a.attention_share || 0)).slice(0, 8)
    return {
      window_days: balance.window_days,
      unmapped_count: balance.portfolio?.unmapped_count || 0,
      attention_by_r1: branches.filter((branch: any) => branch.round === 'R1').sort((a: any, b: any) => Number(b.attention_share || 0) - Number(a.attention_share || 0)).slice(0, 12).map((branch: any) => ({ id: branch.id, label: branch.label, attention_share: branch.attention_share, priority_share: branch.priority_share })),
      overfocused_branches: compact('over-focused').map((branch: any) => ({ id: branch.id, label: branch.label, attention_share: branch.attention_share, priority_share: branch.priority_share, reasons: branch.reasons })),
      at_risk_branches: compact('at-risk').map((branch: any) => ({ id: branch.id, label: branch.label, round: branch.round, last_consumed_at: branch.last_consumed_at, srs_due: branch.srs_due, recall_strength: branch.recall_strength, reasons: branch.reasons })),
      weakly_consolidated_branches: compact('exposed').map((branch: any) => ({ id: branch.id, label: branch.label, round: branch.round, consumed_count: branch.consumed_count, reasons: branch.reasons })),
      uncovered_branches: compact('uncovered').map((branch: any) => ({ id: branch.id, label: branch.label, round: branch.round, priority_rank: branch.priority_rank })),
    }
  })

  let identityParsed = null
  let patternsParsed = null
  try { if (profile?.identity_json) identityParsed = JSON.parse(profile.identity_json) } catch {}
  try { if (profile?.patterns_summary_json) patternsParsed = JSON.parse(profile.patterns_summary_json) } catch {}

  const noteAnchors = (reflections?.results || [])
    .map((r: any) => (r.reflection || '').trim())
    .filter((t: string) => t.length > 5)
    .slice(0, 5)
    .map((t: string) => (t.length > 180 ? t.slice(0, 180) + '...' : t))

  const requiredUnavailable = ['active_queue', 'learning_gaps', 'learning_balance'].some((name) => sectionHealth[name]?.status === 'degraded')
  const payload = {
    timestamp: asOf,
    context_version: AGENT_CONTRACT_VERSION,
    health: {
      status: requiredUnavailable ? 'unavailable' : Object.values(sectionHealth).some((section) => section.status === 'degraded') ? 'degraded' : 'healthy',
      sections: sectionHealth,
    },
    curator: 'Mahmood',
    profile: {
      core_filter: profile?.core_filter || null,
      identity: identityParsed,
      patterns: patternsParsed,
      model_version: 'profile_v2',
      assertions: (profileAssertions?.results || []).map((assertion: any) => {
        let value: any = assertion.value_json
        try { value = JSON.parse(assertion.value_json) } catch {}
        return { ...assertion, value, value_json: undefined }
      }),
    },
    priorities: priorities?.results || [],
    active_queue: activeQueue,
    brief,
    neglected_branches: neglected?.results || [],
    learning_gaps: gaps?.results || [],
    completed_threads: completedThreads?.results || [],
    legacy_mastered: mastered?.results || [],
    blind_spots: blindSpots?.results || [],
    blacklist: blacklist?.results || [],
    creator_trust: creatorTrust?.results || [],
    taste_vectors: tasteVectors?.results || [],
    recent_note_anchors: noteAnchors,
    learning_balance: learningBalance,
  }
  return c.json(payload, requiredUnavailable ? 503 : 200)
})

app.get('/memory', async (c) => {
  const kind = c.req.query('kind')
  const requestedStatus = c.req.query('status')
  const status = requestedStatus || 'active'
  const q = (c.req.query('q') || '').trim().slice(0, 120)
  const recommendationId = c.req.query('recommendation_id')
  await c.env.DB.prepare(`UPDATE hermes_memory SET status='expired',updated_at=datetime('now') WHERE status IN ('active','approved') AND expires_at IS NOT NULL AND expires_at<=datetime('now')`).run()
  const clauses: string[] = []
  const binds: any[] = []
  if (status === 'active' && !requestedStatus) clauses.push("status IN ('active','approved')")
  else if (status !== 'all') { clauses.push('status=?'); binds.push(status) }
  if (kind) { clauses.push('memory_kind=?'); binds.push(kind) }
  if (q) { clauses.push('(memory_key LIKE ? OR source LIKE ? OR value_json LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  if (recommendationId) clauses.push('evidence_json LIKE ?'), binds.push(`%${recommendationId}%`)
  const query = c.env.DB.prepare(`SELECT * FROM hermes_memory ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 200`).bind(...binds)
  const rows = await query.all<any>()
  const memoryIds = (rows.results || []).map((row: any) => row.id)
  let relationalEvidence = new Map<string, any[]>()
  if (memoryIds.length) {
    try {
      const evidenceRows = await c.env.DB.prepare(`SELECT memory_id,evidence_type,recommendation_id,thread_id,unit_id,learning_event_id,source_ref,quote,reason,confidence,created_at FROM memory_evidence WHERE memory_id IN (${memoryIds.map(() => '?').join(',')}) ORDER BY created_at DESC`).bind(...memoryIds).all<any>()
      for (const item of evidenceRows.results || []) relationalEvidence.set(item.memory_id, [...(relationalEvidence.get(item.memory_id) || []), item])
    } catch { /* compatibility before migration */ }
  }
  const memories = (rows.results || []).map((row: any) => {
    let value: any = null; let evidence: any[] = []
    try { value = JSON.parse(row.value_json || 'null') } catch {}
    try { evidence = JSON.parse(row.evidence_json || '[]') } catch {}
    if (relationalEvidence.has(row.id)) evidence = relationalEvidence.get(row.id) || evidence
    return { ...row, value, evidence, value_json: undefined, evidence_json: undefined, influences: evidence.filter((item) => item.recommendation_id) }
  })
  return c.json({ memories })
})

app.get('/memory/context', async (c) => {
  const taskKind = c.req.query('task_kind') || ''
  if (!isMemoryTaskKind(taskKind)) return c.json({ error: 'task_kind must be recommendation, feedback, learning, or self_evolution' }, 400)
  const context = await compileMemoryContext(c.env.DB, {
    taskKind,
    query: c.req.query('q') || '',
    recommendationId: c.req.query('recommendation_id'),
    threadId: c.req.query('thread_id'),
    conversationId: c.req.query('conversation_id'),
    requestId: c.req.header('x-request-id') || undefined,
    limit: Number(c.req.query('limit') || 12),
  })
  return c.json(context)
})

app.post('/memory', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const memoryKey = String(body.memory_key || '').trim().slice(0, 180)
  const memoryKind = String(body.memory_kind || '').trim()
  const source = String(body.source || '').trim().slice(0, 180)
  const confidence = Math.max(0, Math.min(1, Number(body.confidence ?? 0.5)))
  if (!memoryKey || !source || body.value === undefined) return c.json({ error: 'memory_key, value, and source are required' }, 400)
  if (!['durable', 'episodic', 'working', 'rejection', 'hypothesis'].includes(memoryKind)) return c.json({ error: 'invalid memory_kind' }, 400)
  if (!isMemoryOwnershipAllowed(memoryKey)) return c.json({ error: 'memory_key belongs to profile or live learning state; use its canonical API instead' }, 409)
  if (memoryKind === 'durable' && confidence < 0.7) return c.json({ error: 'durable memory requires confidence >= 0.7' }, 400)
  const existing = await c.env.DB.prepare(`SELECT id FROM hermes_memory WHERE memory_key=? AND status='active' ORDER BY updated_at DESC LIMIT 1`).bind(memoryKey).first<any>()
  const id = `mem_${crypto.randomUUID()}`
  const expiry = body.expires_at ? String(body.expires_at).replace('T', ' ').replace('Z', '').slice(0, 19) : (memoryKind === 'working' || memoryKind === 'hypothesis' ? sqliteTime(30 * 86400000) : null)
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 20).map((item: any) => ({
    recommendation_id: item.recommendation_id ? String(item.recommendation_id).slice(0, 120) : undefined,
    source: item.source ? String(item.source).slice(0, 500) : undefined,
    quote: item.quote ? String(item.quote).slice(0, 1000) : undefined,
    reason: item.reason ? String(item.reason).slice(0, 500) : undefined,
    confidence: item.confidence == null ? undefined : Math.max(0, Math.min(1, Number(item.confidence))),
  })) : []
  if (['durable', 'hypothesis'].includes(memoryKind) && !evidence.length) return c.json({ error: 'validated memory requires evidence' }, 400)
  const statements: D1PreparedStatement[] = []
  if (existing) statements.push(c.env.DB.prepare(`UPDATE hermes_memory SET status='superseded',updated_at=datetime('now') WHERE id=?`).bind(existing.id))
  statements.push(c.env.DB.prepare(`INSERT INTO hermes_memory (id,memory_key,memory_kind,value_json,confidence,source,status,supersedes_id,expires_at,evidence_json) VALUES (?,?,?,?,?,?,'active',?,?,?)`)
    .bind(id, memoryKey, memoryKind, JSON.stringify(body.value).slice(0, 12000), confidence, source, existing?.id || null, expiry, JSON.stringify(evidence).slice(0, 16000)))
  await c.env.DB.batch(statements)
  await writeMemoryEvidence(c.env.DB, id, evidence)
  return c.json({ ok: true, id, superseded_id: existing?.id || null, expires_at: expiry }, 201)
})

app.post('/memory/:id/approve', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE hermes_memory SET status='approved',updated_at=datetime('now') WHERE id=? AND status IN ('active','approved')`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true, status: 'approved' }) : c.json({ error: 'memory not found' }, 404)
})

app.post('/memory/:id/expire', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE hermes_memory SET status='expired',updated_at=datetime('now') WHERE id=? AND status IN ('active','approved')`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true, status: 'expired' }) : c.json({ error: 'active memory not found' }, 404)
})

app.post('/memory/:id/resolve', async (c) => {
  const body: { status?: 'superseded' | 'rejected' } = await c.req.json<{ status?: 'superseded' | 'rejected' }>().catch(() => ({} as { status?: 'superseded' | 'rejected' }))
  if (!body.status || !['superseded', 'rejected'].includes(body.status)) return c.json({ error: 'status must be superseded or rejected' }, 400)
  const result = await c.env.DB.prepare(`UPDATE hermes_memory SET status=?,updated_at=datetime('now') WHERE id=? AND status='active'`).bind(body.status, c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true, status: body.status }) : c.json({ error: 'active memory not found' }, 404)
})

app.post('/alerts/:id/ack', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE hermes_alerts SET acknowledged_at=datetime('now') WHERE id=? AND acknowledged_at IS NULL`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'open alert not found' }, 404)
})

app.get('/capabilities', (c) => {
  const filters = {
    domain: c.req.query('domain'),
    intent: c.req.query('intent'),
    method: c.req.query('method'),
    q: c.req.query('q'),
  }
  const catalog = buildCapabilityCatalog(CAPABILITIES, filters)
  const summary = c.req.query('view') === 'summary'
  const capabilities = summary
    ? catalog.map(({ method, path, description, domain, intent, risk, reversible }) => ({ method, path, description, domain, intent, risk, reversible }))
    : catalog
  return c.json({
    version: AGENT_CONTRACT_VERSION,
    protocol: AGENT_PROTOCOL,
    description: 'Structured allow-listed control surface for Learning Compass.',
    authentication: 'Writes require x-api-token when API_TOKEN is configured.',
    filters,
    view: summary ? 'summary' : 'full',
    total: CAPABILITIES.length,
    returned: capabilities.length,
    safety: ['No arbitrary SQL or outbound proxy.', 'Product validation and invariants remain active.', 'Every mutation supports idempotency and is audit logged.'],
    capabilities,
  })
})

app.post('/maintenance/run', async (c) => {
  const receipt = await runMaintenance(c.env, 'manual')
  return c.json({ ok: receipt.ok, receipt }, receipt.ok ? 200 : 500)
})

app.get('/system', async (c) => {
  const DB = c.env.DB
  const [health, feedCount, sourceCount, noteCount, artifactCount, jobCount, annotationCount, receiptCount] = await Promise.all([
    loadOperationalHealth(c.env),
    DB.prepare('SELECT COUNT(*) count FROM feed_sources WHERE enabled=1').first<{ count: number }>(),
    DB.prepare("SELECT COUNT(*) count FROM recommendations WHERE deleted_at IS NULL").first<{ count: number }>(),
    DB.prepare('SELECT COUNT(*) count FROM notes').first<{ count: number }>(),
    DB.prepare('SELECT COUNT(*) count FROM artifacts').first<{ count: number }>(),
    DB.prepare("SELECT COUNT(*) count FROM agent_jobs WHERE status IN ('pending','running','retry')").first<{ count: number }>(),
    DB.prepare("SELECT COUNT(*) count FROM source_annotations WHERE status='active'").first<{ count: number }>(),
    DB.prepare('SELECT COUNT(*) count FROM agent_receipts').first<{ count: number }>(),
  ])
  return c.json({
    status: health.status,
    ready: health.ok,
    service: 'Learning Compass Worker',
    environment: 'Cloudflare edge',
    timezone: 'Africa/Cairo',
    protocol: AGENT_PROTOCOL,
    contract_version: AGENT_CONTRACT_VERSION,
    storage: [
      { name: 'D1', purpose: 'Canonical sources, Threads, notes, recall, settings, jobs, and audit history', status: health.storage.d1 ? 'connected' : 'unavailable' },
      { name: 'R2', purpose: 'PDF, HTML, transcript, and generated companion files', status: health.storage.r2 ? 'connected' : 'unavailable' },
      { name: 'Browser', purpose: 'Local preferences and recoverable offline mutations', status: 'client managed' },
    ],
    schedule: [{
      id: 'worker-maintenance',
      cron: MAINTENANCE_CRON,
      cadence: 'Every 6 hours',
      timezone: 'UTC',
      responsibilities: ['Refresh enabled RSS/Atom feeds', 'Deliver due reminders', 'Synchronize search indexes', 'Surface neglected knowledge branches', 'Expire reversible undo windows'],
      last_run: health.maintenance?.last_run || null,
      last_success: health.maintenance?.last_success || null,
      last_search_sync: health.maintenance?.last_search_sync || null,
      status: health.maintenance?.ok ? 'healthy' : 'stale',
    }],
    recovery: health.recovery,
    operational_health: health,
    on_demand_only: [
      'Hermes job execution',
      'Learning Thread closure and verification',
      'Recommendations and Compass Picks',
      'Lite Visual and NotebookLM generation',
      'Hermes self-improvement and deployment',
    ],
    counts: {
      active_feeds: Number(feedCount?.count || 0),
      sources: Number(sourceCount?.count || 0),
      notes: Number(noteCount?.count || 0),
      artifacts: Number(artifactCount?.count || 0),
      active_jobs: Number(jobCount?.count || 0),
      active_annotations: Number(annotationCount?.count || 0),
      agent_receipts: Number(receiptCount?.count || 0),
    },
    authentication: c.env.REQUIRE_API_AUTH === 'true' ? 'All API routes require x-api-token when private mode is enabled.' : c.env.API_TOKEN ? 'Writes require x-api-token; private read mode is disabled.' : 'Local/open mode: configure REQUIRE_API_AUTH=true and API_TOKEN for private deployment.',
    safety: ['No arbitrary SQL', 'No arbitrary outbound proxy', 'Validated mutations only', 'Agent mutations are audit logged', 'Receipts persist canonical before/after verification'],
  })
})

app.get('/openapi.json', (c) => c.json(buildAgentOpenApi(new URL(c.req.url).origin, CAPABILITIES)))

/** Execute one existing site API operation with bounded preflight, idempotency, and verification. */
app.post('/request', async (c) => {
  const { DB } = c.env
  type Assertion = { path?: string; field?: string; equals?: unknown }
  const readField = (value: any, field?: string) => field ? field.split('.').reduce((current, key) => current == null ? undefined : current[key], value) : value
  const readTarget = async (path: string, token: string | undefined, agentName: string | undefined) => {
    const normalized = path.startsWith('/') ? path : `/${path}`
    if (!isAllowedAgentRequest('GET', normalized)) throw new Error(`verification path is not allow-listed: ${normalized}`)
    const headers = new Headers({ accept: 'application/json' })
    if (token) headers.set('x-api-token', token)
    if (agentName) headers.set('x-agent-name', agentName)
    const response = await fetch(new URL(normalized, c.req.url), { headers })
    const text = await response.text()
    let data: any = text
    try { data = text ? JSON.parse(text) : null } catch {}
    if (!response.ok) throw new Error(`verification read failed: GET ${normalized} returned ${response.status}`)
    return { path: normalized, status: response.status, data }
  }
  const assertTarget = (snapshot: any, assertion: Assertion | undefined, phase: string) => {
    if (!assertion || !Object.prototype.hasOwnProperty.call(assertion, 'equals')) return
    const actual = readField(snapshot?.data, assertion.field)
    if (JSON.stringify(actual) !== JSON.stringify(assertion.equals)) {
      const error: any = new Error(`${phase} assertion failed at ${assertion.field || '<root>'}`)
      error.code = 'assertion_failed'
      error.actual = actual
      error.expected = assertion.equals
      throw error
    }
  }
  try {
    const input = await c.req.json<{
      method?: AgentMethod
      path?: string
      body?: any
      dry_run?: boolean
      confirm?: boolean
      idempotency_key?: string
      precondition?: Assertion
      verify?: Assertion
    }>()
    const method = String(input.method || 'GET').toUpperCase() as AgentMethod
    const rawPath = String(input.path || '')
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    const patternIndex = CAPABILITY_PATTERNS.findIndex((item) => item.method === method && item.regex.test(path))
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || patternIndex < 0) {
      await logAgentAction(DB, c, `${method} ${path}`, input.body, 'denied')
      return c.json({ error: 'operation_not_allowed', message: 'Use filtered GET /agent/capabilities for the allow-listed site API.' }, 403)
    }
    const capability = buildCapabilityCatalog([CAPABILITIES[patternIndex]])[0]
    const capabilityKey = `${capability.method} ${capability.path}`
    const mutation = method !== 'GET'
    const idempotencyKey = String(input.idempotency_key || '').trim()
    if (mutation && !input.dry_run && (!idempotencyKey || idempotencyKey.length > 120)) {
      return c.json({ error: 'idempotency_key required for agent mutations and must be at most 120 characters' }, 400)
    }
    if (mutation && !input.dry_run && capability.explicit_confirmation_required && input.confirm !== true) {
      return c.json({ error: 'explicit confirmation required', risk: capability.risk, dry_run_available: true }, 409)
    }
    const requiredPreconditionPaths = resolveCapabilityReadbacks(capabilityKey, capability.precondition_path, capability.path, path, input.body)
    if (mutation && capability.risk === 'high' && !input.dry_run) {
      const hasExpected = input.precondition && typeof input.precondition.field === 'string' && input.precondition.field.length > 0 && Object.prototype.hasOwnProperty.call(input.precondition, 'equals')
      if (!hasExpected || requiredPreconditionPaths.length !== 1 || input.precondition?.path !== requiredPreconditionPaths[0]) {
        return c.json({
          error: 'high-risk mutations require an exact-target read precondition with field and expected value',
          risk: capability.risk,
          required_precondition_path: requiredPreconditionPaths[0] || capability.precondition_path,
        }, 409)
      }
    }

    const plannedVerificationPaths = input.verify?.path
      ? [input.verify.path]
      : resolveCapabilityReadbacks(capabilityKey, capability.verification_path, capability.path, path, input.body)
    if (input.dry_run) {
      return c.json({
        ok: true,
        dry_run: true,
        intent: capability.intent,
        target: path,
        impact: {
          method,
          domain: capability.domain,
          risk: capability.risk,
          reversible: capability.reversible,
          preconditions: capability.preconditions,
          precondition_path: requiredPreconditionPaths[0] || capability.precondition_path,
          verification_paths: plannedVerificationPaths.length ? plannedVerificationPaths : capability.verification_path,
          required_fields: capability.required_fields,
        },
        blocker: null,
      })
    }

    const token = c.req.header('x-api-token')
    const agentName = c.req.header('x-agent-name')
    let before: any = null
    if (input.precondition?.path) {
      before = await readTarget(input.precondition.path, token, agentName)
      assertTarget(before, input.precondition, 'precondition')
    } else if (plannedVerificationPaths.length && mutation) {
      const snapshots = await Promise.all(plannedVerificationPaths.map((verificationPath) => readTarget(verificationPath, token, agentName)))
      before = snapshots.length === 1 ? snapshots[0] : snapshots
    }

    const headers = new Headers({ accept: 'application/json' })
    if (token) headers.set('x-api-token', token)
    if (agentName) headers.set('x-agent-name', agentName)
    if (idempotencyKey) headers.set('x-client-mutation-id', idempotencyKey)
    if (mutation && method !== 'DELETE') {
      headers.set('content-type', 'application/json')
      headers.set('x-agent-request', 'true')
    }
    const response = await fetch(new URL(path, c.req.url), {
      method,
      headers,
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(input.body ?? {}),
    })
    const text = await response.text()
    let payload: any = text
    try { payload = text ? JSON.parse(text) : null } catch {}
    await logAgentAction(DB, c, `${method} ${path}`, { body: input.body, idempotency_key: idempotencyKey || null }, String(response.status))

    let after: any = null
    let verificationBlocker: any = null
    const verificationPaths = input.verify?.path
      ? [input.verify.path]
      : resolveCapabilityReadbacks(capabilityKey, capability.verification_path, capability.path, path, input.body, payload)
    if (response.ok) {
      if (capability.verification_path && !verificationPaths.length) {
        verificationBlocker = { code: 'verification_unresolved', message: 'Mutation committed but the declared readback target could not be resolved.', mutation_committed: true }
      } else if (verificationPaths.length) {
        try {
          const snapshots = await Promise.all(verificationPaths.map((verificationPath) => readTarget(verificationPath, token, agentName)))
          after = snapshots.length === 1 ? snapshots[0] : snapshots
          if (input.verify) assertTarget(snapshots[0], input.verify, 'verification')
        } catch (verificationError: any) {
          verificationBlocker = {
            code: verificationError?.code || 'verification_failed',
            message: verificationError?.message || 'Post-mutation verification failed.',
            mutation_committed: true,
            ...(verificationError?.expected !== undefined ? { expected: verificationError.expected, actual: verificationError.actual } : {}),
          }
        }
      }
    }
    const verificationEvidence = Array.isArray(after) ? after : after ? [after] : []
    const receipt = {
      intent: capability.intent,
      target: path,
      before,
      mutation_or_job: { method, status: response.status, mutation_committed: response.ok, idempotency_key: idempotencyKey || null, data: payload },
      after,
      evidence: [
        { kind: 'allow_list', capability: capabilityKey },
        ...(idempotencyKey ? [{ kind: 'idempotency', key: idempotencyKey }] : []),
        ...verificationEvidence.map((snapshot: any) => ({ kind: 'verification_read', path: snapshot.path, status: snapshot.status })),
      ],
      blocker: response.ok ? verificationBlocker : payload,
    }
    const verified = response.ok && !verificationBlocker
    await persistAgentReceipt(DB, c, receipt, response.status, verified)
    return c.json({ ok: response.ok, verified, status: response.status, data: payload, receipt }, response.status as any)
  } catch (err: any) {
    await logAgentAction(DB, c, 'agent_request', null, err?.code || 'error')
    if (err?.code === 'assertion_failed') return c.json({ error: err.code, message: err.message, expected: err.expected, actual: err.actual }, 409)
    return c.json(safeError('Agent request failed')(err), 400)
  }
})

/**
 * GET /agent/tools
 * Tool declarations format for Model Context Protocol (MCP) or OpenAI function calling.
 */
app.get('/tools', (c) => {
  return c.json({
    version: AGENT_CONTRACT_VERSION,
    protocol: AGENT_PROTOCOL,
    tools: [
      {
        name: 'list_capabilities',
        description: 'Search the structured allow-listed Learning Compass operations by domain, intent, method, or text.',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            intent: { type: 'string', enum: ['read', 'create', 'update', 'delete', 'undo', 'verify', 'process'] },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            q: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'site_request',
        description: 'Dry-run or execute one allow-listed operation with mandatory mutation idempotency, optional optimistic precondition, explicit high-risk confirmation, verification reread, and a canonical receipt.',
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            path: { type: 'string', description: 'Concrete absolute path returned by list_capabilities.' },
            body: { type: 'object' },
            dry_run: { type: 'boolean' },
            confirm: { type: 'boolean' },
            idempotency_key: { type: 'string', maxLength: 120 },
            precondition: { type: 'object', properties: { path: { type: 'string' }, field: { type: 'string' }, equals: {} }, required: ['path'] },
            verify: { type: 'object', properties: { path: { type: 'string' }, field: { type: 'string' }, equals: {} }, required: ['path'] },
          },
          required: ['method', 'path'],
          additionalProperties: false,
        },
      },
    ],
  })
})

/**
 * POST /agent/tool-call
 * Unified execution handler for LLM tool invocations.
 */
app.post('/tool-call', async (c) => {
  try {
    const { name, arguments: args } = await c.req.json<{ name: string; arguments: any }>()
    if (!name) return c.json({ error: 'tool name required' }, 400)

    if (name === 'list_capabilities') {
      const filters = { domain: args?.domain, intent: args?.intent, method: args?.method, q: args?.q }
      const capabilities = buildCapabilityCatalog(CAPABILITIES, filters)
      return c.json({ version: AGENT_CONTRACT_VERSION, total: CAPABILITIES.length, returned: capabilities.length, capabilities })
    }

    if (name === 'site_request') {
      const response = await fetch(new URL('/agent/request', c.req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-token': c.req.header('x-api-token') || '', 'x-agent-name': c.req.header('x-agent-name') || 'tool-call' },
        body: JSON.stringify(args || {}),
      })
      return c.json(await response.json(), response.status as any)
    }

    return c.json({ error: `Unknown tool: ${name}` }, 404)
  } catch (err) {
    return c.json(safeError('Tool call failed')(err), 500)
  }
})

export default app
