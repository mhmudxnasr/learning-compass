import { Hono } from 'hono'
import { Bindings, safeError, isNonEmptyStr } from '../lib'
import { createInboxCapture } from '../services/capture'
import { buildLearningBalance } from '../services/learning-balance'

const app = new Hono<{ Bindings: Bindings }>()
const sqliteTime = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ')

type AgentMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * The agent API is an intentionally boring adapter over the public product API.
 * Keeping the allow-list here prevents an agent token from becoming arbitrary
 * SQL or an arbitrary outbound HTTP proxy while still making the whole site
 * discoverable and operable from Hermes, Claude Code, Codex, or any HTTP agent.
 */
const CAPABILITIES = [
  ['GET', '/agent/context', 'Read the compact taste and learning context.'],
  ['GET', '/agent/system', 'Read the user-visible runtime, storage, schedule, and service inventory.'],
  ['GET', '/dashboard/briefing', 'Read Momentum, active Queue files, weekly progress, and current insight.'],
  ['GET', '/capture', 'Read the unlimited Inbox.'],
  ['POST', '/capture', 'Capture a URL, text, or artifact into Inbox.'],
  ['GET', '/capture/feeds', 'Read RSS and Atom subscriptions.'],
  ['GET', '/capture/feeds/:id/entries', 'Read every article imported from one feed, paginated.'],
  ['POST', '/capture/feeds', 'Subscribe to an RSS or Atom feed and import its latest entries; optional limit caps the initial import.'],
  ['POST', '/capture/feeds/sync', 'Check every enabled web feed for new Inbox articles; optional limit caps entries per feed.'],
  ['POST', '/capture/feeds/:id/sync', 'Check one web feed for new Inbox articles; optional limit caps imported entries.'],
  ['DELETE', '/capture/feeds/:id', 'Unsubscribe from a web feed without deleting captured articles.'],
  ['GET', '/capture/queue', 'Read the active queue.'],
  ['POST', '/capture/:id/triage', 'Queue or exclude an Inbox item; queue cap is enforced.'],
  ['POST', '/capture/:id/visualise', 'Ask Hermes to create a Lite Visual HTML/PDF companion for a queued link.'],
  ['GET', '/capture/:id', 'Read one capture.'],
  ['GET', '/capture/:id/record', 'Read the canonical source record with exact feedback, extracted note sections, jobs, proposals, files, recall, sessions, memory influence, and outcome.'],
  ['GET', '/compass/pick', 'Read the newest active ready/started Compass Pick; multiple concurrent picks may exist.'],
  ['POST', '/compass/picks', 'Submit 3–8 candidates for server-owned adaptive Compass Pick selection while queued/in-progress Queue count is below five; does not auto-start.'],
  ['POST', '/compass/evaluate', 'Dry-run v1 and v2 scoring for 3–8 candidates without creating a pick.'],
  ['POST', '/compass/pick/:id/candidates', 'Expand an abstained Compass Pick with additional candidates and rescore the complete set up to eight.'],
  ['POST', '/compass/pick/:id/start', 'Explicitly start any ready Compass Pick through the normal Queue/session workflow; the five-item cap is enforced.'],
  ['POST', '/compass/pick/:id/feedback', 'Record explicit Compass Pick outcome, rating, reason tags, and reflection.'],
  ['GET', '/recommendations/list', 'Search and filter recommendation history.'],
  ['GET', '/feedback/context', 'Read all archived feedback with the current profile and knowledge nodes for evidence-based learning.'],
  ['POST', '/recommendations/push', 'Create or update a recommendation with deduplication.'],
  ['POST', '/recommendations/action', 'Change status, rating, review, consumed date, or register an item-specific NotebookLM URL.'],
  ['POST', '/recommendations/map', 'Attach one or more completed sources to an existing knowledge-map branch.'],
  ['POST', '/recommendations/delete', 'Delete a recommendation.'],
  ['POST', '/recommendations/undo', 'Undo a reversible recommendation deletion.'],
  ['GET', '/brain/profile', 'Read profile, priorities, patterns, blacklist, and audit history.'],
  ['POST', '/brain/profile', 'Edit any editable profile field.'],
  ['GET', '/brain/profile/intelligence', 'Read typed profile assertions, health, and reversible revisions.'],
  ['PUT', '/brain/profile/assertions/:key', 'Create or replace a typed profile assertion as an explicit user edit.'],
  ['POST', '/brain/profile/revisions/:id/revert', 'Undo one typed profile revision.'],
  ['POST', '/brain/priorities', 'Replace priorities.'],
  ['GET', '/brain/tree', 'Read the knowledge tree.'],
  ['POST', '/brain/node', 'Create a knowledge node.'],
  ['PUT', '/brain/node/:id', 'Edit a knowledge node.'],
  ['DELETE', '/brain/node/:id', 'Delete a leaf knowledge node.'],
  ['POST', '/brain/pattern/strength', 'Promote or demote a pattern.'],
  ['POST', '/brain/contradiction/resolve', 'Resolve a contradiction.'],
  ['GET', '/knowledge/graph', 'Read the evidence-backed graph.'],
  ['GET', '/notes', 'Read structured notes and sections.'],
  ['POST', '/notes', 'Create a structured note.'],
  ['PUT', '/notes/:id', 'Edit a note and its sections.'],
  ['DELETE', '/notes/:id', 'Delete a note and sections.'],
  ['POST', '/notes/:id/process', 'Queue confirmation-gated feedback processing for a personal reflection.'],
  ['GET', '/sessions', 'Read learning sessions.'],
  ['POST', '/sessions/start', 'Start an external learning session.'],
  ['POST', '/sessions/:id/return', 'Return, reflect, and optionally complete a session.'],
  ['DELETE', '/sessions/:id', 'Delete an incomplete session.'],
  ['GET', '/srs/drafts', 'Read editable SRS drafts.'],
  ['PUT', '/srs/drafts/:id', 'Edit an SRS draft.'],
  ['POST', '/srs/drafts/:id/approve', 'Approve an SRS draft into review.'],
  ['POST', '/srs/drafts/:id/reject', 'Reject an SRS draft.'],
  ['DELETE', '/srs/drafts/:id', 'Delete a draft.'],
  ['GET', '/learning/srs/cards', 'Read every active recall card.'],
  ['DELETE', '/learning/srs/cards/:id', 'Delete an active recall card.'],
  ['GET', '/learning/core/integrity/health', 'Read canonical relationship integrity and quarantined legacy records.'],
  ['GET', '/learning/core/threads', 'Read Learning Threads.'],
  ['GET', '/learning/core/weekly', 'Read the weekly closure review for stale Threads, cognitive loops, and due recall.'],
  ['GET', '/learning/core/counterevidence', 'Find important Thread Units without contradiction or qualification evidence.'],
  ['POST', '/learning/core/threads', 'Create a purpose-first Learning Thread with evidence requirements.'],
  ['GET', '/learning/core/threads/:id', 'Read a Thread workspace, sources, units, requirements, and evidence.'],
  ['GET', '/learning/core/threads/:id/export', 'Export a complete evidence packet as JSON or Markdown.'],
  ['PATCH', '/learning/core/threads/:id', 'Edit a Thread or its final synthesis.'],
  ['POST', '/learning/core/threads/:id/status', 'Activate, pause, or abandon a Thread.'],
  ['POST', '/learning/core/threads/:id/sources', 'Attach a source to a Thread with an explicit role.'],
  ['DELETE', '/learning/core/threads/:id/sources/:sourceId', 'Remove a source from a Thread without deleting it.'],
  ['POST', '/learning/core/threads/:id/verify', 'Verify a Thread only after synthesis and evidence gates are satisfied.'],
  ['GET', '/learning/core/units', 'Read atomic anchored Learning Units.'],
  ['POST', '/learning/core/units', 'Create an anchored Learning Unit.'],
  ['POST', '/learning/core/units/:id/relations', 'Create a typed relationship between Learning Units.'],
  ['POST', '/learning/core/evidence', 'Record retrieval, explanation, transfer, application, decision, or artifact evidence.'],
  ['GET', '/learning/core/consolidation/open', 'Read open cognitive loops.'],
  ['GET', '/learning/core/consolidation/:sourceId', 'Read one source consolidation run and its steps.'],
  ['POST', '/learning/core/consolidation/:id/retry', 'Retry a repair-required consolidation run.'],
  ['POST', '/learning/core/consolidation/:id/waive', 'Explicitly waive a consolidation run with a reason.'],
  ['GET', '/feedback/proposals', 'Read pending and reviewed Hermes change proposals.'],
  ['POST', '/feedback/record', 'Resolve or capture a source, preserve feedback verbatim, update completion and rating, create idempotent analysis/extraction work, and return one exact receipt.'],
  ['POST', '/feedback/proposals/:id/approve', 'Approve a proposed profile or map change for Hermes application.'],
  ['POST', '/feedback/proposals/:id/apply', 'Policy-check and automatically apply a Hermes profile proposal.'],
  ['POST', '/feedback/proposals/:id/revert', 'Revert one applied proposal and its typed profile revision.'],
  ['POST', '/feedback/proposals/:id/reject', 'Reject a proposed profile or map change.'],
  ['GET', '/collections', 'Read collections.'],
  ['POST', '/collections', 'Create a collection.'],
  ['DELETE', '/collections/:id', 'Delete a collection and its item links.'],
  ['POST', '/collections/:id/items', 'Add or replace a collection item.'],
  ['DELETE', '/collections/:id/items/:recommendation_id', 'Remove a collection item.'],
  ['GET', '/artifacts', 'Read R2 artifact metadata and pairs.'],
  ['POST', '/artifacts', 'Upload an HTML, PDF, or other source artifact.'],
  ['POST', '/artifacts/:id/process', 'Queue idempotent note extraction.'],
  ['DELETE', '/artifacts/:id', 'Delete an artifact and its R2 object.'],
  ['GET', '/settings', 'Read settings.'],
  ['PUT', '/settings/:key', 'Edit one setting.'],
  ['GET', '/dashboard/layout', 'Read dashboard layout.'],
  ['PUT', '/dashboard/layout', 'Edit dashboard layout.'],
  ['GET', '/agent/jobs', 'Read durable jobs.'],
  ['GET', '/agent/jobs/health', 'Read Hermes job queue health and stale lease counts.'],
  ['POST', '/agent/jobs/:id/claim', 'Claim a leased job.'],
  ['POST', '/agent/jobs/:id/complete', 'Complete a leased job with structured output.'],
  ['POST', '/agent/jobs/:id/fail', 'Fail a leased job with retryable error.'],
  ['POST', '/agent/jobs/:id/replay', 'Replay a failed or dead-lettered job from a clean attempt.'],
  ['POST', '/agent/jobs/:id/heartbeat', 'Renew long-running discovery job lease.'],
  ['GET', '/agent/memory', 'Browse and search Hermes memories with evidence and recommendation influence links.'],
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

/**
 * GET /agent/context
 * Token-optimized, prompt-ready snapshot for AI agents (Gemini, Claude, Hermes, taste-mapper).
 * Combines Profile, Mega Priorities, Active Queue, Neglected Branches, and Learning Gaps in 1 call.
 */
app.get('/context', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  
  let profile: any = null
  let priorities: any = { results: [] }
  let activeQueue: any = { results: [] }
  let neglected: any = { results: [] }
  let gaps: any = { results: [] }
  let mastered: any = { results: [] }
  let blindSpots: any = { results: [] }
  let blacklist: any = { results: [] }
  let creatorTrust: any = { results: [] }
  let tasteVectors: any = { results: [] }
  let reflections: any = { results: [] }
  let profileAssertions: any = { results: [] }
  let learningBalance: any = null

  try { profile = await DB.prepare('SELECT identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, patterns_summary_json FROM profile WHERE id = 1').first<any>() } catch {}
  try { priorities = await DB.prepare('SELECT rank, branch_id, label, rationale FROM priorities ORDER BY rank ASC LIMIT 10').all() } catch {}
  try { activeQueue = await DB.prepare("SELECT r.id, r.video_title, r.creator, r.content_type, r.why_this, r.video_url FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress') ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 5").all() } catch {}
  try {
    neglected = await DB.prepare(`
      SELECT t.id, t.label, t.super_category, MAX(r.consumed_date) as last_consumed
      FROM tree_nodes t
      LEFT JOIN recommendations r ON r.dedup_key LIKE (t.id || '-%') AND r.status = 'consumed'
      WHERE t.type IN ('branch', 'category')
      GROUP BY t.id
      HAVING last_consumed IS NULL OR last_consumed < date('now', '-30 days')
      ORDER BY last_consumed ASC
      LIMIT 5
    `).all()
  } catch {}
  try {
    gaps = await DB.prepare(`
      SELECT COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'general') as topic,
             COUNT(*) as consumed_count,
             AVG(CASE WHEN user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastery_rate
      FROM recommendations
      WHERE status = 'consumed' AND dedup_key IS NOT NULL AND dedup_key != ''
      GROUP BY topic
      HAVING mastery_rate < 0.6 OR consumed_count < 2
      LIMIT 5
    `).all()
  } catch {}
  try { mastered = await DB.prepare('SELECT id, kind, label, author, rating FROM mastered ORDER BY mastered_at DESC').all() } catch {}
  try {
    blindSpots = await DB.prepare(`
      SELECT n.id, n.label, n.super_category
      FROM tree_nodes n
      LEFT JOIN recommendation_meta m ON m.branch_id = n.id
      LEFT JOIN recommendations r ON r.id = m.recommendation_id AND r.status = 'consumed'
      WHERE n.type IN ('branch', 'leaf')
      GROUP BY n.id
      HAVING COUNT(r.id) = 0
      LIMIT 15
    `).all()
  } catch {}
  try { blacklist = await DB.prepare('SELECT name, work, reason, severity FROM blacklist ORDER BY severity ASC').all() } catch {}
  try {
    creatorTrust = await DB.prepare(`
      SELECT creator, ROUND(AVG(COALESCE(user_score, CASE user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END)), 2) as avg_score
      FROM recommendations
      WHERE creator IS NOT NULL AND creator != '' AND status = 'consumed'
      GROUP BY creator
      ORDER BY avg_score DESC
      LIMIT 15
    `).all()
  } catch {}
  try { tasteVectors = await DB.prepare('SELECT topic, affinity_score FROM taste_vectors ORDER BY affinity_score DESC LIMIT 15').all() } catch {}
  try { reflections = await DB.prepare("SELECT reflection FROM learning_sessions WHERE reflection IS NOT NULL AND reflection != '' ORDER BY completed_at DESC LIMIT 5").all() } catch {}
  try { profileAssertions = await DB.prepare("SELECT assertion_key,category,scope,value_json,weight,confidence,status,source_kind,version,updated_at FROM profile_assertions WHERE status IN ('active','hypothesis') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,confidence DESC,updated_at DESC LIMIT 100").all() } catch {}
  try {
    const balance = await buildLearningBalance(DB, 90)
    const branches = balance.branches || []
    const compact = (state: string) => branches.filter((branch: any) => branch.state === state).sort((a: any, b: any) => Number(b.attention_share || 0) - Number(a.attention_share || 0)).slice(0, 8)
    learningBalance = {
      window_days: balance.window_days,
      unmapped_count: balance.portfolio?.unmapped_count || 0,
      attention_by_r1: branches.filter((branch: any) => branch.round === 'R1').sort((a: any, b: any) => Number(b.attention_share || 0) - Number(a.attention_share || 0)).slice(0, 12).map((branch: any) => ({ id: branch.id, label: branch.label, attention_share: branch.attention_share, priority_share: branch.priority_share })),
      overfocused_branches: compact('over-focused').map((branch: any) => ({ id: branch.id, label: branch.label, attention_share: branch.attention_share, priority_share: branch.priority_share, reasons: branch.reasons })),
      at_risk_branches: compact('at-risk').map((branch: any) => ({ id: branch.id, label: branch.label, round: branch.round, last_consumed_at: branch.last_consumed_at, srs_due: branch.srs_due, recall_strength: branch.recall_strength, reasons: branch.reasons })),
      weakly_consolidated_branches: compact('exposed').map((branch: any) => ({ id: branch.id, label: branch.label, round: branch.round, consumed_count: branch.consumed_count, reasons: branch.reasons })),
      uncovered_branches: compact('uncovered').map((branch: any) => ({ id: branch.id, label: branch.label, round: branch.round, priority_rank: branch.priority_rank })),
    }
  } catch {}

  let identityParsed = null
  let patternsParsed = null
  try { if (profile?.identity_json) identityParsed = JSON.parse(profile.identity_json) } catch {}
  try { if (profile?.patterns_summary_json) patternsParsed = JSON.parse(profile.patterns_summary_json) } catch {}

  const noteAnchors = (reflections?.results || [])
    .map((r: any) => (r.reflection || '').trim())
    .filter((t: string) => t.length > 5)
    .slice(0, 5)
    .map((t: string) => (t.length > 180 ? t.slice(0, 180) + '...' : t))

  return c.json({
    timestamp: new Date().toISOString(),
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
    active_queue: activeQueue?.results || [],
    neglected_branches: neglected?.results || [],
    learning_gaps: gaps?.results || [],
    mastered: mastered?.results || [],
    blind_spots: blindSpots?.results || [],
    blacklist: blacklist?.results || [],
    creator_trust: creatorTrust?.results || [],
    taste_vectors: tasteVectors?.results || [],
    recent_note_anchors: noteAnchors,
    learning_balance: learningBalance,
  })
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
  const memories = (rows.results || []).map((row: any) => {
    let value: any = null; let evidence: any[] = []
    try { value = JSON.parse(row.value_json || 'null') } catch {}
    try { evidence = JSON.parse(row.evidence_json || '[]') } catch {}
    return { ...row, value, evidence, value_json: undefined, evidence_json: undefined, influences: evidence.filter((item) => item.recommendation_id) }
  })
  return c.json({ memories })
})

app.post('/memory', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const memoryKey = String(body.memory_key || '').trim().slice(0, 180)
  const memoryKind = String(body.memory_kind || '').trim()
  const source = String(body.source || '').trim().slice(0, 180)
  const confidence = Math.max(0, Math.min(1, Number(body.confidence ?? 0.5)))
  if (!memoryKey || !source || body.value === undefined) return c.json({ error: 'memory_key, value, and source are required' }, 400)
  if (!['durable', 'episodic', 'working', 'rejection', 'hypothesis'].includes(memoryKind)) return c.json({ error: 'invalid memory_kind' }, 400)
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

app.get('/capabilities', (c) => c.json({
  version: '2026-08-09',
  protocol: 'taste-map-agent-http/1',
  description: 'Complete allow-listed control surface for the Learning Compass website.',
  authentication: 'Writes require x-api-token when API_TOKEN is configured.',
  safety: ['No arbitrary SQL or outbound proxy.', 'Product validation and invariants remain active.', 'Every agent mutation is audit logged.'],
  capabilities: CAPABILITIES.map(([method, path, description]) => ({ method, path, description })),
}))

app.get('/system', async (c) => {
  const DB = c.env.DB
  const [lastSearchSync, feedCount, sourceCount, noteCount, artifactCount, jobCount] = await Promise.all([
    DB.prepare("SELECT value FROM kv_store WHERE key='fts_last_sync'").first<{ value: string }>(),
    DB.prepare('SELECT COUNT(*) count FROM feed_sources WHERE enabled=1').first<{ count: number }>(),
    DB.prepare("SELECT COUNT(*) count FROM recommendations WHERE deleted_at IS NULL").first<{ count: number }>(),
    DB.prepare('SELECT COUNT(*) count FROM notes').first<{ count: number }>(),
    DB.prepare('SELECT COUNT(*) count FROM artifacts').first<{ count: number }>(),
    DB.prepare("SELECT COUNT(*) count FROM agent_jobs WHERE status IN ('pending','running','retry')").first<{ count: number }>(),
  ])
  return c.json({
    status: 'active',
    service: 'Learning Compass Worker',
    environment: 'Cloudflare edge',
    timezone: 'Africa/Cairo',
    protocol: 'taste-map-agent-http/1',
    storage: [
      { name: 'D1', purpose: 'Canonical sources, Threads, notes, recall, settings, jobs, and audit history', status: 'connected' },
      { name: 'R2', purpose: 'PDF, HTML, transcript, and generated companion files', status: c.env.ARTIFACTS ? 'connected' : 'unavailable' },
      { name: 'Browser', purpose: 'Local preferences and recoverable offline mutations', status: 'client managed' },
    ],
    schedule: [{
      id: 'worker-maintenance',
      cron: '0 */6 * * *',
      cadence: 'Every 6 hours',
      timezone: 'UTC',
      responsibilities: ['Refresh enabled RSS/Atom feeds', 'Deliver due reminders', 'Synchronize search indexes', 'Surface neglected knowledge branches', 'Expire reversible undo windows'],
      last_search_sync: lastSearchSync?.value || null,
    }],
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
    },
    safety: ['No arbitrary SQL', 'No arbitrary outbound proxy', 'Validated mutations only', 'Agent mutations are audit logged'],
  })
})

app.get('/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: { title: 'Learning Compass Agent API', version: '2026-08-09' },
  servers: [{ url: new URL(c.req.url).origin }],
  paths: CAPABILITIES.reduce<Record<string, Record<string, unknown>>>((paths, [method, path, description]) => {
    const operation = method.toLowerCase()
    const entry = paths[path] || (paths[path] = {})
    entry[operation] = { operationId: `${operation}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`, description, responses: { '200': { description: 'JSON response' } } }
    return paths
  }, {}),
}))

/** Execute one existing site API operation without exposing an arbitrary proxy. */
app.post('/request', async (c) => {
  const { DB } = c.env
  try {
    const input = await c.req.json<{ method?: AgentMethod; path?: string; body?: unknown; headers?: Record<string, string> }>()
    const method = String(input.method || 'GET').toUpperCase() as AgentMethod
    const rawPath = String(input.path || '')
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !isAllowedAgentRequest(method, path)) {
      await logAgentAction(DB, c, `${method} ${path}`, input.body, 'denied')
      return c.json({ error: 'operation_not_allowed', message: 'Use GET /agent/capabilities for the allow-listed site API.' }, 403)
    }
    const headers = new Headers({ accept: 'application/json' })
    const token = c.req.header('x-api-token')
    if (token) headers.set('x-api-token', token)
    const agentName = c.req.header('x-agent-name')
    if (agentName) headers.set('x-agent-name', agentName)
    if (method !== 'GET' && method !== 'DELETE') {
      headers.set('content-type', 'application/json')
      headers.set('x-agent-request', 'true')
    }
    const response = await fetch(new URL(path, c.req.url), {
      method,
      headers,
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(input.body ?? {}),
    })
    const text = await response.text()
    let payload: unknown = text
    try { payload = text ? JSON.parse(text) : null } catch { /* preserve non-JSON responses */ }
    await logAgentAction(DB, c, `${method} ${path}`, input.body, String(response.status))
    return c.json({ ok: response.ok, status: response.status, data: payload }, response.status as any)
  } catch (err) {
    await logAgentAction(DB, c, 'agent_request', null, 'error')
    return c.json(safeError('Agent request failed')(err), 400)
  }
})

/**
 * GET /agent/tools
 * Tool declarations format for Model Context Protocol (MCP) or OpenAI function calling.
 */
app.get('/tools', (c) => {
  return c.json({
    tools: [
      {
        name: 'get_agent_context',
        description: 'Fetch Mahmood taste profile, top priorities, active recommendations, and neglected learning branches.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'push_recommendation',
        description: 'Push a candidate video, paper, or article to Mahmood queue with justification.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL of the content' },
            title: { type: 'string', description: 'Title of the content' },
            creator: { type: 'string', description: 'Author or creator name' },
            content_type: { type: 'string', enum: ['video', 'paper', 'article', 'book'] },
            why_this: { type: 'string', description: 'Why this content fits Mahmood taste and priorities' }
          },
          required: ['url', 'title', 'why_this']
        }
      },
      {
        name: 'validate_content_fit',
        description: 'Check if a topic or URL matches Mahmood core filter rules and anti-patterns.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            topic: { type: 'string' },
            creator: { type: 'string' }
          },
          required: ['title']
        }
      },
      {
        name: 'log_learning_session',
        description: 'Log topics studied today into the daily learning journal.',
        parameters: {
          type: 'object',
          properties: {
            topics: { type: 'string', description: 'Comma separated list of topics studied' },
            date: { type: 'string', description: 'YYYY-MM-DD format (optional)' }
          },
          required: ['topics']
        }
      }
      ,{
        name: 'list_capabilities',
        description: 'List every allow-listed website operation available to this agent, including reads, creates, edits, deletes, processing, analytics, jobs, and undo.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'site_request',
        description: 'Execute one allow-listed Learning Compass website API operation. Use list_capabilities first when unsure. Product validation, queue limits, SRS approval rules, and audit logging remain active.',
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            path: { type: 'string', description: 'Absolute site API path from /agent/capabilities.' },
            body: { type: 'object', description: 'JSON body required by the selected operation.' }
          },
          required: ['method', 'path']
        }
      }
    ]
  })
})

/**
 * POST /agent/tool-call
 * Unified execution handler for LLM tool invocations.
 */
app.post('/tool-call', async (c) => {
  const { DB } = c.env
  try {
    const { name, arguments: args } = await c.req.json<{ name: string; arguments: any }>()
    if (!name) return c.json({ error: 'tool name required' }, 400)

    if (name === 'get_agent_context') {
      const headers: Record<string, string> = {}
      const token = c.req.header('x-api-token')
      if (token) headers['x-api-token'] = token
      const res = await fetch(new URL('/agent/context', c.req.url).toString(), { headers })
      return c.json(await res.json())
    }

    if (name === 'list_capabilities') return c.json({ capabilities: CAPABILITIES.map(([method, path, description]) => ({ method, path, description })) })

    if (name === 'site_request') {
      const response = await fetch(new URL('/agent/request', c.req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-token': c.req.header('x-api-token') || '', 'x-agent-name': c.req.header('x-agent-name') || 'tool-call' },
        body: JSON.stringify(args || {}),
      })
      return c.json(await response.json(), response.status as any)
    }

    if (name === 'push_recommendation') {
      const { url, title, creator, content_type, why_this } = args || {}
      if (!url || !title || !why_this) return c.json({ error: 'missing required fields: url, title, why_this' }, 400)

      const capture = await createInboxCapture(DB, { source: url, title })
      await DB.prepare(`UPDATE recommendations SET creator=COALESCE(?,creator),content_type=COALESCE(?,content_type),why_this=?,updated_at=datetime('now') WHERE id=?`).bind(creator || null, content_type || null, why_this, capture.id).run()
      return c.json({ ok: true, recommendation_id: capture.id, status: capture.duplicate ? 'already in Inbox' : 'captured to Inbox' })
    }

    if (name === 'validate_content_fit') {
      const { title, creator } = args || {}
      const blacklist = await DB.prepare('SELECT name, reason FROM blacklist').all<any>()
      const matches = (blacklist.results || []).filter((b: any) => 
        (title && title.toLowerCase().includes(b.name.toLowerCase())) ||
        (creator && creator.toLowerCase().includes(b.name.toLowerCase()))
      )
      
      if (matches.length > 0) {
        return c.json({ fit: false, reason: `Matches blacklisted term: ${matches[0].name} (${matches[0].reason || 'no reason'})` })
      }
      return c.json({ fit: true, reason: 'Passed blacklist filters and aligns with active profile.' })
    }

    if (name === 'log_learning_session') {
      const { topics, date } = args || {}
      if (!topics) return c.json({ error: 'topics required' }, 400)
      const logDate = date || new Date().toISOString().split('T')[0]
      await DB.prepare(`
        INSERT INTO learning_log (date, count, topics) VALUES (?, 1, ?)
        ON CONFLICT(date) DO UPDATE SET count = count + 1, topics = learning_log.topics || ', ' || ?
      `).bind(logDate, topics, topics).run()

      return c.json({ ok: true, date: logDate, logged_topics: topics })
    }

    return c.json({ error: `Unknown tool: ${name}` }, 404)
  } catch (err) {
    return c.json(safeError('Tool call failed')(err), 500)
  }
})

/**
 * POST /agent/validate-fit
 * Quick endpoint for AI filters before queuing new items.
 */
app.post('/validate-fit', async (c) => {
  const { DB } = c.env
  try {
    const { title, creator, url } = await c.req.json<{ title?: string; creator?: string; url?: string }>()
    if (!title && !url) return c.json({ error: 'title or url required' }, 400)

    const blacklist = await DB.prepare('SELECT name, reason FROM blacklist').all<any>()
    const searchStr = `${title || ''} ${creator || ''} ${url || ''}`.toLowerCase()
    
    for (const item of (blacklist.results || [])) {
      if (searchStr.includes(item.name.toLowerCase())) {
        return c.json({ fit: false, reason: `Matches blacklist: ${item.name} (${item.reason || 'restricted'})` })
      }
    }

    return c.json({ fit: true, reason: 'Passes core quality filters' })
  } catch (err) {
    return c.json(safeError('Validation failed')(err), 500)
  }
})

export default app
