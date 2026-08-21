import { Hono } from 'hono'
import { queueDecision } from '../domain'
import { Bindings, safeError } from '../lib'
import { createCapture } from '../services/capture'
import { addFeed, syncAllFeeds, syncFeed } from '../services/rss'
import { recordRecommendationSignal } from '../services/intelligence-v2'
import { displayRound } from '../services/branch-rounds'
import { loadCaptureQueue } from '../services/capture-queue'
import { selectLearningSourceRenditions } from '../services/learning-material-renditions'
import { LITE_VISUAL_CHECKPOINT_REQUIREMENTS, LITE_VISUAL_SOURCE_EXTRACTION_SCHEMA, LITE_VISUAL_STAGES, LITE_VISUAL_WORKFLOW_CONTRACT, LITE_VISUAL_WORKFLOW_VERSION, resolveLiteVisualResume } from '../services/lite-visual-workflow'

import { activateWaitingRun } from './discovery'

const app = new Hono<{ Bindings: Bindings }>()

const feedImportLimit = (value: unknown) => {
  if (value === undefined) return undefined
  const limit = Number(value)
  return Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : null
}

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
    const result = await createCapture(DB, { source, title: body.title, artifact })
    return c.json({ ok: true, ...result, state: result.duplicate ? undefined : 'captured' }, result.duplicate ? 200 : 201)
  } catch (error) { return c.json(safeError('Capture failed')(error), 500) }
})

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.tags_json,m.source_metadata_json,
    json_extract(m.source_metadata_json,'$.resurface_at') resurface_at,
    (SELECT fs.title FROM feed_entries fe JOIN feed_sources fs ON fs.id=fe.feed_id WHERE fe.recommendation_id=r.id LIMIT 1) feed_title
    FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.status='active' AND m.learning_state='captured'
    ORDER BY CASE WHEN json_extract(m.source_metadata_json,'$.resurface_at') IS NOT NULL AND datetime(json_extract(m.source_metadata_json,'$.resurface_at'))<=datetime('now') THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`).all()
  return c.json({ items: rows.results || [] })
})

app.get('/queue', async (c) => {
  const items = await loadCaptureQueue(c.env.DB)
  return c.json({ items, count: items.length, cap: 5 })
})

app.get('/feeds', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT fs.*,COUNT(fe.guid) entry_count
    FROM feed_sources fs LEFT JOIN feed_entries fe ON fe.feed_id=fs.id
    GROUP BY fs.id ORDER BY fs.created_at DESC`).all()
  return c.json({ feeds: rows.results || [] })
})

app.get('/feeds/:id/entries', async (c) => {
  const feedId = c.req.param('id')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 200)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  if (feedId === 'all') {
    const [rows, count] = await Promise.all([
      c.env.DB.prepare(`SELECT r.*,fe.guid,fe.published_at,fe.created_at feed_imported_at,fs.title feed_title,fs.id feed_id
        FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id
        JOIN feed_sources fs ON fs.id=fe.feed_id
        WHERE (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL
        ORDER BY COALESCE(fe.published_at,fe.created_at) DESC LIMIT ? OFFSET ?`).bind(limit, offset).all(),
      c.env.DB.prepare(`SELECT COUNT(*) count FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id WHERE (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL`).first<{ count: number }>(),
    ])
    return c.json({ feed: { id: 'all', title: 'All Subscribed Sources', feed_url: 'All feeds' }, items: rows.results || [], total: count?.count || 0, limit, offset })
  }
  const feed = await c.env.DB.prepare('SELECT id,title,feed_url,site_url,last_checked_at FROM feed_sources WHERE id=?').bind(feedId).first<any>()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT r.*,fe.guid,fe.published_at,fe.created_at feed_imported_at,fs.title feed_title,fs.id feed_id
      FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id
      JOIN feed_sources fs ON fs.id=fe.feed_id
      WHERE fe.feed_id=? AND (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL
      ORDER BY COALESCE(fe.published_at,fe.created_at) DESC LIMIT ? OFFSET ?`).bind(feed.id, limit, offset).all(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id WHERE fe.feed_id=? AND (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL`).bind(feed.id).first<{ count: number }>(),
  ])
  return c.json({ feed, items: rows.results || [], total: count?.count || 0, limit, offset })
})

app.post('/feeds', async (c) => {
  try {
    const body = await c.req.json<{ url?: string; limit?: number }>()
    if (!body.url?.trim()) return c.json({ error: 'feed URL required' }, 400)
    const limit = feedImportLimit(body.limit)
    if (limit === null) return c.json({ error: 'limit must be a number from 1 to 20' }, 400)
    return c.json({ ok: true, ...(await addFeed(c.env.DB, body.url, limit)) }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not subscribe to feed'
    return c.json({ error: message }, /already subscribed/.test(message) ? 409 : 400)
  }
})

app.post('/feeds/sync', async (c) => {
  const body: { limit?: number } = await c.req.json<{ limit?: number }>().catch(() => ({}))
  const limit = feedImportLimit(body.limit)
  if (limit === null) return c.json({ error: 'limit must be a number from 1 to 20' }, 400)
  const results = await syncAllFeeds(c.env.DB, limit)
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
  const body: { limit?: number } = await c.req.json<{ limit?: number }>().catch(() => ({}))
  const limit = feedImportLimit(body.limit)
  if (limit === null) return c.json({ error: 'limit must be a number from 1 to 20' }, 400)
  try { return c.json({ ok: true, ...(await syncFeed(c.env.DB, feed, limit)) }) }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Feed check failed' }, 400) }
})

app.delete('/feeds/:id/entries/:recId', async (c) => {
  const feedId = c.req.param('id')
  const recId = c.req.param('recId')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM feed_entries WHERE feed_id=? AND recommendation_id=?').bind(feedId, recId),
    c.env.DB.prepare(`UPDATE recommendations SET status='deleted',deleted_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(recId),
    c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='excluded',updated_at=datetime('now') WHERE recommendation_id=?`).bind(recId),
  ])
  return c.json({ ok: true })
})

app.delete('/feeds/:id/entries', async (c) => {
  const feedId = c.req.param('id')
  if (feedId === 'all') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE recommendations SET status='deleted',deleted_at=datetime('now'),updated_at=datetime('now') WHERE id IN (SELECT recommendation_id FROM feed_entries)`),
      c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='excluded',updated_at=datetime('now') WHERE recommendation_id IN (SELECT recommendation_id FROM feed_entries)`),
      c.env.DB.prepare('DELETE FROM feed_entries'),
    ])
    return c.json({ ok: true })
  }
  const feed = await c.env.DB.prepare('SELECT id FROM feed_sources WHERE id=?').bind(feedId).first()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE recommendations SET status='deleted',deleted_at=datetime('now'),updated_at=datetime('now') WHERE id IN (SELECT recommendation_id FROM feed_entries WHERE feed_id=?)`).bind(feedId),
    c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='excluded',updated_at=datetime('now') WHERE recommendation_id IN (SELECT recommendation_id FROM feed_entries WHERE feed_id=?)`).bind(feedId),
    c.env.DB.prepare('DELETE FROM feed_entries WHERE feed_id=?').bind(feedId),
  ])
  return c.json({ ok: true })
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
  const body: { action?: 'queue' | 'exclude'; thread_id?: string; override_queue_cap?: boolean; reason?: string } = await c.req.json().catch(() => ({}))
  const item = await c.env.DB.prepare(`SELECT r.id,r.video_url,r.video_title,m.branch_id,n.id branch_exists,n.label branch_label,n.status branch_status
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    LEFT JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=?`).bind(c.req.param('id')).first<any>()
  if (!item) return c.json({ error: 'not found' }, 404)
  if (body.action === 'exclude') {
    const exclusionReason = String(body.reason || 'capture_exclusion').trim().slice(0, 120) || 'capture_exclusion'
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE recommendations SET status='rejected',updated_at=datetime('now') WHERE id=?`).bind(c.req.param('id')),
      c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='excluded',updated_at=datetime('now') WHERE recommendation_id=?`).bind(c.req.param('id')),
      c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,branch_id,outcome_status,rejection_reason,evaluated_at)
        SELECT ?,r.id,r.creator,r.content_type,m.branch_id,'rejected',?,datetime('now') FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?
        ON CONFLICT(recommendation_id) DO UPDATE SET outcome_status='rejected',rejection_reason=COALESCE(excluded.rejection_reason,recommendation_outcomes.rejection_reason),evaluated_at=datetime('now')`).bind(`outcome_${c.req.param('id')}`, exclusionReason, c.req.param('id')),
    ])
    await recordRecommendationSignal(c.env.DB, {
      idempotencyKey: `capture-excluded:${c.req.param('id')}`,
      eventType: 'administrative_exclusion',
      recommendationId: c.req.param('id'),
      actorType: 'user',
      signalScope: 'none',
      explicit: false,
      origin: 'administrative_exclusion',
      payload: { surface: 'source_record', rejection_reason: exclusionReason },
    })
    try { await activateWaitingRun(c.env.DB) } catch {}
    return c.json({ ok: true, state: 'excluded' })
  }
  if (body.action !== 'queue') return c.json({ error: 'action must be queue or exclude' }, 400)
  if (!item.branch_id || !item.branch_exists) {
    return c.json({ error: 'branch_mapping_required', message: 'Map this source to a verified knowledge branch before adding it to Queue.' }, 409)
  }
  if (item.branch_id && String(item.branch_status || '').toLowerCase() === 'pruned') {
    return c.json({
      error: 'pruned_branch_conflict',
      branch_id: item.branch_id,
      branch_label: item.branch_label || item.branch_id,
      message: `This source is mapped to the pruned branch “${item.branch_label || item.branch_id}”. Review the branch mapping before adding it to Queue.`,
    }, 409)
  }
  const thread = body.thread_id
    ? await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=? AND superseded_at IS NULL AND status NOT IN ('verified','abandoned')`).bind(body.thread_id).first<{ id: string }>()
    : null
  if (body.thread_id && !thread) return c.json({ error: 'learning_thread_not_found' }, 404)
  const active = await c.env.DB.prepare(`SELECT COUNT(*) c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<{ c: number }>()
  const decision = queueDecision(active?.c || 0, body.override_queue_cap === true)
  if (!decision.allowed) return c.json({ error: 'queue_full', ...decision }, 409)
  const result = await c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,updated_at)
    SELECT ?,'queued',datetime('now')
    WHERE ?=1 OR (SELECT COUNT(*) FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress'))<5
    ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='queued',updated_at=datetime('now')`).bind(c.req.param('id'), body.override_queue_cap === true ? 1 : 0).run()
  if (!result.meta.changes) return c.json({ error: 'queue_full', ...queueDecision(5, false) }, 409)
  if (thread) {
    await c.env.DB.prepare(`INSERT INTO thread_sources (thread_id,recommendation_id,role,status) VALUES (?,?,'supporting','active') ON CONFLICT(thread_id,recommendation_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(thread.id,c.req.param('id')).run()
  }
  return c.json({ ok: true, state: 'queued', ...(thread ? { thread_id: thread.id } : {}), ...decision })
})

// Apply a reviewed, high-confidence branch classification before or during Queue work.
// Metadata-only: this does not claim the source was consumed or learned.
app.post('/:id/branch-map', async (c) => {
  try {
    const body = await c.req.json<{ branch_id?: string; confidence?: string; reason?: string }>().catch(() => ({} as any))
    const confidence = String(body.confidence || '').toLowerCase()
    if (confidence !== 'high') return c.json({ error: 'only high-confidence mappings may be applied automatically' }, 422)
    const item = await c.env.DB.prepare("SELECT r.id,m.learning_state FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=? AND r.status='active'").bind(c.req.param('id')).first<any>()
    if (!item) return c.json({ error: 'active recommendation not found' }, 404)
    if (!['captured','queued','in_progress'].includes(String(item.learning_state || 'captured'))) return c.json({ error: 'item is not an active source or Queue item' }, 409)
    const branch = await c.env.DB.prepare("SELECT id,label,status FROM tree_nodes WHERE id=? AND type IN ('root','category','branch','leaf')").bind(String(body.branch_id || '')).first<any>()
    if (!branch) return c.json({ error: 'branch not found' }, 404)
    if (String(branch.status || '').toLowerCase() === 'pruned') return c.json({ error: 'cannot map to a pruned branch', branch_id: branch.id }, 409)
    const mappingSource = String(c.req.header('x-agent-name') || 'user_review').trim().slice(0, 100) || 'user_review'
    await c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,branch_id,source_metadata_json,updated_at) VALUES (?,?,json_object('branch_mapping_confidence',?,'branch_mapping_reason',?,'branch_mapping_source',?),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET branch_id=excluded.branch_id, source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json), updated_at=datetime('now')`).bind(item.id, branch.id, confidence, String(body.reason || '').slice(0, 500), mappingSource).run()
    return c.json({ ok: true, recommendation_id: item.id, branch_id: branch.id, branch_label: branch.label, confidence })
  } catch (err) { return c.json(safeError('Queue branch mapping failed')(err), 500) }
})

app.post('/:id/visualise', async (c) => {
  const item = await c.env.DB.prepare(`SELECT r.id,r.video_url,r.video_title,r.creator,r.content_type,m.source_metadata_json
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.id=? AND r.status='active'`).bind(c.req.param('id')).first<any>()
  if (!item) return c.json({ error: 'not found' }, 404)
  let sourceMetadata: Record<string, any> = {}
  try { sourceMetadata = JSON.parse(item.source_metadata_json || '{}') } catch {}
  const sourceArtifactId = sourceMetadata.artifact_id || null
  if (!item.video_url && !sourceArtifactId) return c.json({ error: 'source URL or source artifact required' }, 400)
  const artifactRows = await c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,created_at FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id')=? ORDER BY created_at DESC`).bind(item.id).all<any>()
  const ready = selectLearningSourceRenditions(artifactRows.results || []).get(item.id)
  if (ready?.html && ready?.pdf) {
    const metadata = (ready.html.metadata || {}) as Record<string, unknown>
    if (metadata.workflow_contract === 'lite-visual-linear/v4' && metadata.publication_state === 'ready') {
      return c.json({ ok: true, status: 'ready', recommendation_id: item.id, pair_id: metadata.pair_id || null, companion: { primary: { role: 'html', id: ready.html.id }, secondary: { role: 'pdf', id: ready.pdf.id } } })
    }
  }
  const idempotencyKey = `visualise-source:${item.id}`
  const workflowRunId = `lv_${crypto.randomUUID()}`
  const jobPayload = {
    recommendation_id: item.id,
    source_url: item.video_url || null,
    source_artifact_id: sourceArtifactId,
    source_type: item.content_type || 'article',
    title: item.video_title,
    creator: item.creator || null,
    expected_roles: ['html', 'pdf'],
    workflow_version: LITE_VISUAL_WORKFLOW_VERSION,
    workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
    canonical_body: 'semantic-html',
    authoring_skills: ['intent', 'frontend-design'],
    asset_policy: 'code-only',
    allowed_rendering: ['semantic-html', 'source-specific-css', 'native-table', 'native-equation', 'minimal-inline-svg'],
    forbidden_rendering: ['template', 'preset-theme', 'preset-palette', 'mind-map', 'raster-image', 'generated-image', 'external-image-agent', 'interactive-widget'],
    notes_extraction: 'manual_only',
    stages: [...LITE_VISUAL_STAGES],
    source_extraction: { schema: LITE_VISUAL_SOURCE_EXTRACTION_SCHEMA, command: '/home/mahmud/.hermes/skills/lite-visual/scripts/extract_source.py', output: 'source.txt', manifest: 'source-extraction.json', complete_status: 'complete' },
    checkpoint_requirements: LITE_VISUAL_CHECKPOINT_REQUIREMENTS,
    cache: { source: 'source_checksum', extraction: 'source_checksum+extractor_version' },
    recovery: { checkpoint_endpoint: '', resume_from: 'workflow_step' },
    ...(item.content_type === 'book' ? {
      companion_mode: 'chapter_reading_companion',
      book_mode: true,
      chapter_outputs: true,
      chapter_artifact_contract: { metadata: ['chapter_key', 'chapter_title', 'chapter_number', 'pair_id', 'role'] },
    } : {}),
  }
  const existing = await c.env.DB.prepare(`SELECT id,status,workflow_step,workflow_run_id,payload_json FROM agent_jobs WHERE idempotency_key=?`).bind(idempotencyKey).first<{ id: string; status: string; workflow_step?: string | null; workflow_run_id?: string | null; payload_json?: string | null }>()
  if (existing && ['pending', 'retry', 'running'].includes(existing.status)) return c.json({ ok: true, status: existing.status === 'running' ? 'working' : 'queued', job_status: existing.status, workflow_step: existing.workflow_step || 'resolve_source', job_id: existing.id, recommendation_id: item.id }, 202)
  const jobId = existing?.id || `job_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
  jobPayload.recovery.checkpoint_endpoint = `/agent/jobs/${jobId}/checkpoint`
  if (existing) {
    let previousPayload: Record<string, unknown> = {}
    try { previousPayload = JSON.parse(existing.payload_json || '{}') } catch {}
    const resume = resolveLiteVisualResume(previousPayload, existing.workflow_step)
    const nextWorkflowRunId = resume.is_current && existing.workflow_run_id ? existing.workflow_run_id : workflowRunId
    await c.env.DB.prepare(`UPDATE agent_jobs SET status='retry',attempts=0,error=NULL,result_json=json_object('resume_from',?),lease_owner=NULL,lease_expires_at=NULL,workflow_step=?,payload_json=?,recommendation_id=?,trigger_kind='explicit_user_action',workflow_run_id=?,updated_at=datetime('now') WHERE id=?`).bind(resume.resume_from, resume.resume_from, JSON.stringify(jobPayload), item.id, nextWorkflowRunId, existing.id).run()
    return c.json({ ok: true, status: 'queued', job_status: 'retry', resume_from: resume.resume_from, upgraded_workflow: !resume.is_current, job_id: existing.id, recommendation_id: item.id }, 202)
  }
  await c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind,workflow_run_id,workflow_step) VALUES (?,'visualise_source',?,?,?,'explicit_user_action',?,'resolve_source')`).bind(jobId, JSON.stringify({
  ...jobPayload,
  }), idempotencyKey, item.id, workflowRunId).run()
  return c.json({ ok: true, status: 'queued', job_id: jobId, recommendation_id: item.id }, 202)
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT r.*, m.learning_state, m.branch_id, m.tags_json, m.source_metadata_json
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`).bind(c.req.param('id')).first()
  return row ? c.json({ item: row }) : c.json({ error: 'not found' }, 404)
})

app.get('/:id/record', async (c) => {
  const recommendationId = c.req.param('id')
  const item = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.tags_json,m.source_metadata_json,m.progress_percent,m.estimated_minutes,
    COALESCE(n.label, r.branch) branch_label,
    COALESCE(n.status, 'love') branch_status,
    COALESCE(n.round_label, r.round) round_label
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=?`).bind(recommendationId).first<any>()
  if (!item) return c.json({ error: 'not found' }, 404)
  const [sessions, notes, sections, artifacts, drafts, cards, outcome, memories, proposals, jobs, threads, units, anchors, annotations, relations, consolidation, disposition] = await Promise.all([
    c.env.DB.prepare(`SELECT id,status,intent,reflection,thread_id,target_kind,target_artifact_id,started_at,returned_at,completed_at,duration_seconds FROM learning_sessions WHERE recommendation_id=? ORDER BY started_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT n.id,n.recommendation_id,n.title,n.kind,n.status,n.revision,n.source_url,n.source_artifact_id,n.provenance_json,n.updated_at
      FROM notes n WHERE n.recommendation_id=? ORDER BY n.updated_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT s.note_id,s.section_key,s.label,s.content,s.direction,s.position FROM note_sections s JOIN notes n ON n.id=s.note_id WHERE n.recommendation_id=? ORDER BY s.note_id,s.position`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT a.id,a.filename,a.media_type,a.r2_key,a.size_bytes,a.metadata_json,a.created_at,r.notebook_url
      FROM artifacts a LEFT JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id')
      WHERE json_extract(a.metadata_json,'$.recommendation_id')=?
         OR a.id=json_extract((SELECT source_metadata_json FROM recommendation_meta WHERE recommendation_id=?),'$.artifact_id')
      ORDER BY a.created_at DESC`).bind(recommendationId,recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT id,question,answer,topic,status,unit_id,thread_id,provenance_json,created_at FROM srs_drafts WHERE recommendation_id=? ORDER BY created_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT id,question,answer,topic,due_at,repetitions,interval_days,ease_factor,unit_id,thread_id,scheduler_version FROM srs_cards WHERE recommendation_id=? ORDER BY due_at`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT * FROM recommendation_outcomes WHERE recommendation_id=?`).bind(recommendationId).first<any>(),
    c.env.DB.prepare(`SELECT id,memory_key,memory_kind,value_json,confidence,source,status,evidence_json,updated_at FROM hermes_memory WHERE evidence_json LIKE ? ORDER BY updated_at DESC`).bind(`%${recommendationId}%`).all<any>(),
    c.env.DB.prepare(`SELECT id,status,change_type,target_label,current_json,proposed_json,evidence,reasoning,confidence,created_at,applied_at FROM feedback_proposals WHERE recommendation_id=? ORDER BY created_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT id,job_type,status,error,created_at,updated_at,result_json FROM agent_jobs WHERE json_extract(payload_json,'$.recommendation_id')=? ORDER BY created_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT t.id,t.title,t.thread_type,t.guiding_question,t.definition_of_done,t.status,ts.role,ts.expected_contribution FROM thread_sources ts JOIN learning_threads t ON t.id=ts.thread_id WHERE ts.recommendation_id=? AND ts.status!='removed' ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END,t.updated_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT * FROM learning_units WHERE recommendation_id=? ORDER BY updated_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT a.* FROM unit_anchors a JOIN learning_units u ON u.id=a.unit_id WHERE u.recommendation_id=? ORDER BY a.created_at`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT * FROM source_annotations WHERE recommendation_id=? AND status='active' ORDER BY created_at DESC LIMIT 200`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT ur.* FROM unit_relations ur JOIN learning_units u ON u.id=ur.source_unit_id WHERE u.recommendation_id=? ORDER BY ur.created_at`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT * FROM consolidation_runs WHERE recommendation_id=? ORDER BY requested_at DESC LIMIT 1`).bind(recommendationId).first<any>(),
    c.env.DB.prepare(`SELECT * FROM source_learning_dispositions WHERE recommendation_id=? ORDER BY updated_at DESC LIMIT 1`).bind(recommendationId).first<any>(),
  ])
  const noteSections = new Map<string, any[]>()
  for (const section of sections.results || []) noteSections.set(section.note_id, [...(noteSections.get(section.note_id) || []), section])
  const parseList = (value: any) => { try { return JSON.parse(value || '[]') } catch { return [] } }
  const noteRows = (notes.results || []).map((note: any) => ({ ...note, provenance: parseList(note.provenance_json), provenance_json: undefined, sections: noteSections.get(note.id) || [] }))
  const parseJson = (value: string | null) => { try { return value ? JSON.parse(value) : null } catch { return null } }
  const memoryInfluences = (memories.results || []).map((row: any) => { let evidence: any[] = []; try { evidence = JSON.parse(row.evidence_json || '[]') } catch {}; return { ...row, value: (() => { try { return JSON.parse(row.value_json || 'null') } catch { return null } })(), evidence: evidence.filter((item) => item.recommendation_id === recommendationId), value_json: undefined, evidence_json: undefined } })
  const anchorsByUnit = new Map<string, any[]>()
  for (const anchor of anchors.results || []) anchorsByUnit.set(anchor.unit_id, [...(anchorsByUnit.get(anchor.unit_id) || []), anchor])
  const relationsByUnit = new Map<string, any[]>()
  for (const relation of relations.results || []) relationsByUnit.set(relation.source_unit_id, [...(relationsByUnit.get(relation.source_unit_id) || []), relation])
  const annotationRows = (annotations.results || []).map((annotation: any) => ({ ...annotation, selector: parseJson(annotation.selector_json) || {}, selector_json: undefined }))
  const unitRows = (units.results || []).map((unit: any) => ({ ...unit, anchors: anchorsByUnit.get(unit.id) || [], relations: relationsByUnit.get(unit.id) || [] }))
  const consolidationSteps = consolidation ? await c.env.DB.prepare(`SELECT * FROM consolidation_steps WHERE run_id=? ORDER BY position`).bind(consolidation.id).all<any>() : { results: [] }
  const cardRows = (cards.results || []).map((card: any) => ({ ...card }))
  const today = new Date().toISOString().slice(0, 10)
  const artifactsRows = artifacts.results || []
  const selectedCompanions = selectLearningSourceRenditions(artifactsRows).get(recommendationId) || {}
  const directLegacyArtifacts = artifactsRows.filter((artifact: any) => {
    const metadata = parseJson(artifact.metadata_json) || {}
    return !metadata.recommendation_id && !metadata.pair_id
  })
  const htmlArtifact = selectedCompanions.html || directLegacyArtifacts.find((artifact: any) => /html/.test(String(artifact.media_type || '')) || String(artifact.filename || '').toLowerCase().endsWith('.html')) || null
  const pdfArtifact = selectedCompanions.pdf || directLegacyArtifacts.find((artifact: any) => /pdf/.test(String(artifact.media_type || '')) || String(artifact.filename || '').toLowerCase().endsWith('.pdf')) || null
  const cardCount = cardRows.length
  const dueCount = cardRows.filter((card: any) => card.due_at && String(card.due_at) <= today).length
  const noteCount = (notes.results || []).length
  const branchLabel = item.branch_label || item.branch
  const branchId = item.branch_id || branchLabel
  const roundLabel = item.round_label || item.round
  const round = displayRound({ round_label: roundLabel, id: branchId }, { consumed: item.status === 'consumed' ? 1 : 0, notes: noteCount, cards: cardCount, due: dueCount, recallStrength: null })
  const branchInfo = branchLabel ? { id: branchId, label: branchLabel, round: roundLabel || round, status: String(item.branch_status || '').trim().toLowerCase() || 'love' } : null
  const companions = { html: htmlArtifact ? { id: htmlArtifact.id, filename: htmlArtifact.filename, size_bytes: htmlArtifact.size_bytes } : null, pdf: pdfArtifact ? { id: pdfArtifact.id, filename: pdfArtifact.filename, size_bytes: pdfArtifact.size_bytes } : null }
  const companionMetadata = htmlArtifact ? parseJson(htmlArtifact.metadata_json) || {} : {}
  const companion = htmlArtifact && pdfArtifact ? { status: 'ready', pair_id: companionMetadata.pair_id || null, primary: { role: 'html', ...companions.html }, secondary: { role: 'pdf', ...companions.pdf } } : { status: 'not_ready', pair_id: null, primary: null, secondary: null }

  const bookChapters = item.content_type === 'book'
    ? await c.env.DB.prepare(`SELECT chapter_key,chapter_title,position,completed_at FROM book_visual_chapters WHERE recommendation_id=? ORDER BY position,chapter_key`).bind(recommendationId).all<any>()
    : { results: [] }
  const chapterList: any[] = []
  for (const row of bookChapters.results || []) {
    chapterList.push({
      key: row.chapter_key,
      title: row.chapter_title,
      number: row.position,
      completed: Boolean(row.completed_at),
      completed_at: row.completed_at,
      html: null,
      pdf: null,
    })
  }
  for (const art of artifactsRows) {
    const meta = parseJson(art.metadata_json) || {}
    if (meta.chapter_key) {
      let ch = chapterList.find((c) => c.key === meta.chapter_key)
      if (!ch) {
        ch = { key: meta.chapter_key, title: meta.chapter_title || meta.chapter_key, number: meta.chapter_number || null, completed: false, completed_at: null, html: null, pdf: null }
        chapterList.push(ch)
      }
      if (meta.role === 'html' || meta.role === 'pdf') {
        ch[meta.role] = { id: art.id, filename: art.filename, size_bytes: art.size_bytes }
      }
    }
  }
  const visualObj = item.content_type === 'book'
    ? { status: chapterList.length > 0 ? 'ready' : 'not_started', chapters: chapterList }
    : companion

  return c.json({
    item: { ...item, branch: branchInfo, round: roundLabel || round, branch_label: branchLabel, branch_status: item.branch_status || 'love', round_label: roundLabel, visual: visualObj },
    sessions: sessions.results || [],
    threads: threads.results || [],
    annotations: annotationRows,
    learning_units: unitRows,
    disposition: disposition || null,
    consolidation: consolidation ? { ...consolidation, steps: consolidationSteps.results || [] } : null,
    notes: noteRows,
    artifacts: artifactsRows,
    companion,
    companions,
    visual: visualObj,
    book_chapters: chapterList,
    srs: { drafts: (drafts.results || []).map((draft: any) => ({ ...draft, provenance: parseList(draft.provenance_json), provenance_json: undefined })), cards: cardRows, recall_summary: { count: cardCount, due: dueCount } },
    outcome: outcome || null,
    memory_influences: memoryInfluences,
    proposals: (proposals.results || []).map((proposal: any) => ({ ...proposal, current: parseJson(proposal.current_json), proposed: parseJson(proposal.proposed_json), current_json: undefined, proposed_json: undefined })),
    jobs: (jobs.results || []).map((job: any) => ({ ...job, result: parseJson(job.result_json), result_json: undefined })),
  })
})

export default app
