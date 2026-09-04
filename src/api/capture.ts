import { Hono } from 'hono'
import { queueDecision } from '../domain'
import { Bindings, redactSensitiveText, safeError } from '../lib'
import { createCapture } from '../services/capture'
import { addFeed, syncAllFeeds, syncFeed } from '../services/rss'
import { recordRecommendationSignal } from '../services/intelligence-v2'
import { loadCaptureQueue } from '../services/capture-queue'
import { selectLearningSourceRenditions } from '../services/learning-material-renditions'
import { projectBook } from '../services/book-projection'
import { normalizeQualityAssurance } from '../artifact-metadata'
import { deliveryContextFromQuery, resolveDeliveryContext } from '../services/delivery-context'
import { LITE_VISUAL_CHECKPOINT_REQUIREMENTS, LITE_VISUAL_SOURCE_EXTRACTION_SCHEMA, LITE_VISUAL_STAGES, LITE_VISUAL_WORKFLOW_CONTRACT, LITE_VISUAL_WORKFLOW_VERSION, resolveLiteVisualResume } from '../services/lite-visual-workflow'
import { createPersonalLibraryItem, loadPersonalLibrary, loadPersonalLibraryItem, PERSONAL_ITEM_STATES, PERSONAL_ITEM_TYPES, updatePersonalLibraryItem, type PersonalItemState, type PersonalItemType, type PersonalLibraryInput } from '../services/personal-library'

import { activateWaitingRun } from './discovery'

const app = new Hono<{ Bindings: Bindings }>()

const withoutLegacyRound = (row: any) => {
  const { round: _legacyRound, round_label: _legacyRoundLabel, ...item } = row
  return item
}

const feedImportLimit = (value: unknown) => {
  if (value === undefined) return undefined
  const limit = Number(value)
  return Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : null
}

app.post('/', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<{ source: string; title?: string; artifact_id?: string; branch_id?: string; branch_reason?: string; override_queue_cap?: boolean }>()
    const source = String(body.source || '').trim()
    if (!source) return c.json({ error: 'source required' }, 400)

    const artifact = body.artifact_id
      ? await DB.prepare(`SELECT id,filename,media_type,r2_key FROM artifacts WHERE id=?`).bind(body.artifact_id).first<any>()
      : null
    if (body.artifact_id && !artifact) return c.json({ error: 'artifact not found' }, 404)
    const branchId = String(body.branch_id || '').trim()
    if (!branchId) return c.json({ error: 'branch_id required' }, 400)
    const branch = branchId
      ? await DB.prepare("SELECT n.id,n.label,n.status,n.super_category FROM tree_nodes n WHERE n.id=? AND n.type='branch' AND (n.parent_id='root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id=n.parent_id AND p.type='category'))").bind(branchId).first<any>()
      : null
    if (branchId && !branch) return c.json({ error: 'branch not found' }, 404)
    if (String(branch?.status || '').toLowerCase() === 'pruned') return c.json({ error: 'cannot capture to a pruned branch', branch_id: branch.id }, 409)
    const result = await createCapture(DB, {
      source,
      title: body.title,
      artifact,
      ...(branch ? { branch: {
        id: branch.id,
        confidence: 'high',
        reason: String(body.branch_reason || '').slice(0, 500),
        source: String(c.req.header('x-agent-name') || 'user_capture').trim().slice(0, 100) || 'user_capture',
      } } : {}),
    })
    if ('branchConflict' in result) return c.json({ error: 'branch_mapping_conflict', recommendation_id: result.id, existing_branch_id: result.branchConflict }, 409)
    return c.json({
      ok: true,
      ...result,
      state: result.duplicate ? undefined : 'captured',
      ...(branch ? { branch: { id: branch.id, label: branch.label, status: branch.status, super_category: branch.super_category } } : {}),
    }, result.duplicate ? 200 : 201)
  } catch (error) { return c.json(safeError('Capture failed')(error), 500) }
})

app.get('/personal', async (c) => {
  const itemType = String(c.req.query('item_type') || '').trim()
  const state = String(c.req.query('state') || '').trim()
  if (itemType && !PERSONAL_ITEM_TYPES.includes(itemType as PersonalItemType)) return c.json({ error: 'unsupported item_type' }, 400)
  if (state && !PERSONAL_ITEM_STATES.includes(state as PersonalItemState)) return c.json({ error: 'unsupported state' }, 400)
  try {
    return c.json(await loadPersonalLibrary(c.env.DB, {
      q: c.req.query('q'),
      item_type: itemType,
      state,
      limit: Number(c.req.query('limit') || 200),
      offset: Number(c.req.query('offset') || 0),
    }))
  } catch (error) {
    return c.json(safeError('Personal library could not be loaded')(error), 500)
  }
})

app.get('/personal/:id', async (c) => {
  try {
    const item = await loadPersonalLibraryItem(c.env.DB, c.req.param('id'))
    return item ? c.json({ item }) : c.json({ error: 'personal item not found' }, 404)
  } catch (error) {
    return c.json(safeError('Personal item could not be loaded')(error), 500)
  }
})

app.post('/personal', async (c) => {
  try {
    const body = await c.req.json<PersonalLibraryInput>()
    const result = await createPersonalLibraryItem(c.env.DB, body)
    if (!result.ok) return c.json({ error: result.error, ...('recommendation_id' in result ? { recommendation_id: result.recommendation_id } : {}) }, result.status as 400 | 409)
    return c.json({ ok: true, item: result.item }, 201)
  } catch (error) {
    return c.json(safeError('Personal item could not be saved')(error), 500)
  }
})

app.patch('/personal/:id', async (c) => {
  try {
    const body = await c.req.json<PersonalLibraryInput>()
    const result = await updatePersonalLibraryItem(c.env.DB, c.req.param('id'), body)
    if (!result.ok) return c.json({
      error: result.error,
      ...('message' in result ? { message: result.message } : {}),
      ...('recommendation_id' in result ? { recommendation_id: result.recommendation_id } : {}),
      ...('replacement_endpoint' in result ? { replacement_endpoint: result.replacement_endpoint } : {}),
    }, result.status as 400 | 404 | 409)
    return c.json({ ok: true, item: result.item })
  } catch (error) {
    return c.json(safeError('Personal item could not be updated')(error), 500)
  }
})

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.tags_json,m.source_metadata_json,
    json_extract(m.source_metadata_json,'$.resurface_at') resurface_at,
    (SELECT fs.title FROM feed_entries fe JOIN feed_sources fs ON fs.id=fe.feed_id WHERE fe.recommendation_id=r.id LIMIT 1) feed_title
    FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.status='active' AND m.learning_state='captured'
    ORDER BY CASE WHEN json_extract(m.source_metadata_json,'$.resurface_at') IS NOT NULL AND datetime(json_extract(m.source_metadata_json,'$.resurface_at'))<=datetime('now') THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`).all()
  return c.json({ items: (rows.results || []).map(withoutLegacyRound) })
})

app.get('/queue', async (c) => {
  const delivery = await resolveDeliveryContext(c.env.DB, deliveryContextFromQuery((key) => c.req.query(key)))
  const matchesOnly = c.req.query('matches_only') === 'true'
  const items = await loadCaptureQueue(c.env.DB, 50, delivery, matchesOnly)
  return c.json({ items, count: items.length, cap: 5, matches_only: matchesOnly, delivery_context: delivery, receipt: { order: 'unchanged', filtering: matchesOnly ? 'explicit_matches_only' : 'none', all_items_visible: !matchesOnly } })
})

app.get('/feeds', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT fs.*,n.label branch_label,n.status branch_status,COUNT(fe.guid) entry_count
    FROM feed_sources fs
    LEFT JOIN tree_nodes n ON n.id=fs.branch_id
    LEFT JOIN feed_entries fe ON fe.feed_id=fs.id
    GROUP BY fs.id ORDER BY fs.created_at DESC`).all()
  return c.json({ feeds: rows.results || [] })
})

app.get('/feeds/:id/entries', async (c) => {
  const feedId = c.req.param('id')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 200)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)
  if (feedId === 'all') {
    const [rows, count] = await Promise.all([
      c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,n.label branch_label,n.status branch_status,fe.guid,fe.published_at,fe.created_at feed_imported_at,fs.title feed_title,fs.id feed_id
        FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id
        JOIN feed_sources fs ON fs.id=fe.feed_id
        JOIN recommendation_meta m ON m.recommendation_id=r.id
        LEFT JOIN tree_nodes n ON n.id=m.branch_id
        WHERE (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL
        ORDER BY COALESCE(fe.published_at,fe.created_at) DESC LIMIT ? OFFSET ?`).bind(limit, offset).all(),
      c.env.DB.prepare(`SELECT COUNT(*) count FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id WHERE (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL`).first<{ count: number }>(),
    ])
    return c.json({ feed: { id: 'all', title: 'All Subscribed Sources', feed_url: 'All feeds' }, items: (rows.results || []).map(withoutLegacyRound), total: count?.count || 0, limit, offset })
  }
  const feed = await c.env.DB.prepare(`SELECT fs.id,fs.title,fs.feed_url,fs.site_url,fs.last_checked_at,fs.branch_id,n.label branch_label,n.status branch_status
    FROM feed_sources fs LEFT JOIN tree_nodes n ON n.id=fs.branch_id WHERE fs.id=?`).bind(feedId).first<any>()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,n.label branch_label,n.status branch_status,fe.guid,fe.published_at,fe.created_at feed_imported_at,fs.title feed_title,fs.id feed_id
      FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id
      JOIN feed_sources fs ON fs.id=fe.feed_id
      JOIN recommendation_meta m ON m.recommendation_id=r.id
      LEFT JOIN tree_nodes n ON n.id=m.branch_id
      WHERE fe.feed_id=? AND (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL
      ORDER BY COALESCE(fe.published_at,fe.created_at) DESC LIMIT ? OFFSET ?`).bind(feed.id, limit, offset).all(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM feed_entries fe JOIN recommendations r ON r.id=fe.recommendation_id WHERE fe.feed_id=? AND (r.status IS NULL OR r.status != 'deleted') AND r.deleted_at IS NULL`).bind(feed.id).first<{ count: number }>(),
  ])
  return c.json({ feed, items: (rows.results || []).map(withoutLegacyRound), total: count?.count || 0, limit, offset })
})

app.post('/feeds', async (c) => {
  try {
    const body = await c.req.json<{ url?: string; branch_id?: string; limit?: number }>()
    if (!body.url?.trim()) return c.json({ error: 'feed URL required' }, 400)
    const branchId = String(body.branch_id || '').trim()
    if (!branchId) return c.json({ error: 'branch_id required' }, 400)
    const branch = await c.env.DB.prepare("SELECT n.id,n.label,n.status FROM tree_nodes n WHERE n.id=? AND n.type='branch' AND (n.parent_id='root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id=n.parent_id AND p.type='category'))").bind(branchId).first<any>()
    if (!branch) return c.json({ error: 'branch not found' }, 404)
    if (String(branch.status || '').toLowerCase() === 'pruned') return c.json({ error: 'cannot subscribe to a pruned branch', branch_id: branch.id }, 409)
    const limit = feedImportLimit(body.limit)
    if (limit === null) return c.json({ error: 'limit must be a number from 1 to 20' }, 400)
    return c.json({ ok: true, ...(await addFeed(c.env.DB, body.url, { id: branch.id, label: branch.label }, limit)) }, 201)
  } catch (error) {
    const message = error instanceof Error ? redactSensitiveText(error, 500) : 'Could not subscribe to feed'
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
    branch_conflicts: results.reduce((sum, item: any) => sum + (item.branch_conflicts || 0), 0),
    errors: results.filter((item: any) => item.error),
    results,
  })
})

app.post('/feeds/:id/sync', async (c) => {
  const feed = await c.env.DB.prepare(`SELECT id,feed_url,title,site_url,etag,last_modified,branch_id FROM feed_sources WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!feed) return c.json({ error: 'feed not found' }, 404)
  const body: { limit?: number } = await c.req.json<{ limit?: number }>().catch(() => ({}))
  const limit = feedImportLimit(body.limit)
  if (limit === null) return c.json({ error: 'limit must be a number from 1 to 20' }, 400)
  try { return c.json({ ok: true, ...(await syncFeed(c.env.DB, feed, limit)) }) }
  catch (error) { return c.json({ error: error instanceof Error ? redactSensitiveText(error, 500) : 'Feed check failed' }, 400) }
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
  const body: { action?: 'queue' | 'exclude' | 'dequeue'; thread_id?: string; override_queue_cap?: boolean; reason?: string } = await c.req.json().catch(() => ({}))
  const item = await c.env.DB.prepare(`SELECT r.id,r.video_url,r.video_title,r.content_type,r.why_this,r.status,r.deleted_at,m.learning_state,m.branch_id,n.id branch_exists,n.label branch_label,n.status branch_status
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
  if (body.action === 'dequeue') {
    if (item.status !== 'active' || item.deleted_at || !['queued', 'in_progress'].includes(String(item.learning_state || ''))) {
      return c.json({ error: 'item is not an active Queue commitment' }, 409)
    }
    const result = await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='captured',updated_at=datetime('now')
      WHERE recommendation_id=? AND learning_state IN ('queued','in_progress')
        AND EXISTS (SELECT 1 FROM recommendations r WHERE r.id=recommendation_meta.recommendation_id AND r.status='active' AND r.deleted_at IS NULL)`).bind(c.req.param('id')).run()
    if (!result.meta.changes) return c.json({ error: 'item is not an active Queue commitment' }, 409)
    return c.json({ ok: true, state: 'captured' })
  }
  if (body.action !== 'queue') return c.json({ error: 'action must be queue, dequeue, or exclude' }, 400)
  if (item.content_type === 'book') {
    return c.json({ error: 'books_separate_from_queue', message: 'Books are tracked separately in the Books room and cannot be added to Queue.' }, 400)
  }
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
  const active = await c.env.DB.prepare(`SELECT COUNT(*) c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(r.content_type, '') != 'book' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<{ c: number }>()
  const decision = queueDecision(active?.c || 0, body.override_queue_cap === true)
  if (!decision.allowed) return c.json({ error: 'queue_full', ...decision }, 409)
  const expectedContribution = String(item.why_this || '').trim().slice(0, 1000)
    || `Queued as supporting material for this Thread: ${String(item.video_title || item.id).trim().slice(0, 900)}.`
  const threadEligibility = thread ? `AND EXISTS (
      SELECT 1 FROM learning_threads placement_thread
      JOIN recommendation_meta placement_meta ON placement_meta.recommendation_id=?
      JOIN recommendations placement_source ON placement_source.id=placement_meta.recommendation_id
        AND placement_source.deleted_at IS NULL AND placement_source.status='active'
      JOIN tree_nodes placement_branch ON placement_branch.id=placement_meta.branch_id
        AND placement_branch.type IN ('branch','leaf') AND lower(COALESCE(placement_branch.status,''))!='pruned'
      JOIN tree_nodes placement_domain ON placement_domain.id=placement_branch.super_category
        AND placement_domain.type='category' AND lower(COALESCE(placement_domain.status,''))!='pruned'
      WHERE placement_thread.id=? AND placement_thread.superseded_at IS NULL
        AND placement_thread.status NOT IN ('verified','abandoned')
    )` : ''
  const queueStatement = c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,updated_at)
    SELECT ?,'queued',datetime('now')
    WHERE (?=1 OR (SELECT COUNT(*) FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(r.content_type, '') != 'book' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress'))<5)
      ${threadEligibility}
    ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='queued',updated_at=datetime('now')`).bind(
      c.req.param('id'), body.override_queue_cap === true ? 1 : 0,
      ...(thread ? [c.req.param('id'), thread.id] : []),
    )
  const committed = thread
    ? await c.env.DB.batch([
      queueStatement,
      c.env.DB.prepare(`INSERT INTO thread_sources (thread_id,recommendation_id,role,expected_contribution,position,status)
        SELECT placement_thread.id,placement_meta.recommendation_id,'supporting',?,
          COALESCE((SELECT MAX(existing.position)+1 FROM thread_sources existing WHERE existing.thread_id=placement_thread.id AND existing.status!='removed'),0),'active'
        FROM learning_threads placement_thread
        JOIN recommendation_meta placement_meta ON placement_meta.recommendation_id=? AND placement_meta.learning_state='queued'
        JOIN recommendations placement_source ON placement_source.id=placement_meta.recommendation_id
          AND placement_source.deleted_at IS NULL AND placement_source.status='active'
        JOIN tree_nodes placement_branch ON placement_branch.id=placement_meta.branch_id
          AND placement_branch.type IN ('branch','leaf') AND lower(COALESCE(placement_branch.status,''))!='pruned'
        JOIN tree_nodes placement_domain ON placement_domain.id=placement_branch.super_category
          AND placement_domain.type='category' AND lower(COALESCE(placement_domain.status,''))!='pruned'
        WHERE placement_thread.id=? AND placement_thread.superseded_at IS NULL
          AND placement_thread.status NOT IN ('verified','abandoned')
        ON CONFLICT(thread_id,recommendation_id) DO UPDATE SET
          status='active',
          position=CASE WHEN thread_sources.status='removed' THEN excluded.position ELSE thread_sources.position END,
          expected_contribution=CASE
            WHEN TRIM(COALESCE(thread_sources.expected_contribution,''))='' THEN excluded.expected_contribution
            ELSE thread_sources.expected_contribution
          END,
          updated_at=datetime('now')`).bind(expectedContribution, c.req.param('id'), thread.id),
    ])
    : [await queueStatement.run()]
  if (!committed[0]?.meta.changes) return c.json({ error: 'queue_full_or_source_ownership_changed', message: 'Queue capacity, source ownership, or the selected Thread changed. Reload and try again.', ...queueDecision(5, false) }, 409)
  if (thread && committed[1]?.meta.changes !== 1) return c.json({ error: 'thread_source_attachment_conflict', message: 'The Queue commitment was saved, but the Thread placement could not be verified. Reload the source before retrying.' }, 409)
  return c.json({ ok: true, state: 'queued', ...(thread ? { thread_id: thread.id } : {}), ...decision })
})

// Apply a reviewed, high-confidence branch classification to an existing source.
// Metadata-only: this does not claim the source was consumed or learned.
app.post('/:id/branch-map', async (c) => {
  try {
    const body = await c.req.json<{ branch_id?: string; confidence?: string; reason?: string }>().catch(() => ({} as any))
    const confidence = String(body.confidence || '').toLowerCase()
    if (confidence !== 'high') return c.json({ error: 'only high-confidence mappings may be applied automatically' }, 422)
    const item = await c.env.DB.prepare("SELECT r.id,m.learning_state FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=? AND r.status IN ('active','consumed','rejected')").bind(c.req.param('id')).first<any>()
    if (!item) return c.json({ error: 'recommendation not found' }, 404)
    if (!['captured','queued','in_progress','completed','excluded'].includes(String(item.learning_state || 'captured'))) return c.json({ error: 'item is not a mappable source' }, 409)
    const branch = await c.env.DB.prepare("SELECT id,label,status FROM tree_nodes WHERE id=? AND type IN ('root','category','branch','leaf')").bind(String(body.branch_id || '')).first<any>()
    if (!branch) return c.json({ error: 'branch not found' }, 404)
    if (String(branch.status || '').toLowerCase() === 'pruned') return c.json({ error: 'cannot map to a pruned branch', branch_id: branch.id }, 409)
    const mappingSource = String(c.req.header('x-agent-name') || 'user_review').trim().slice(0, 100) || 'user_review'
    await c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,branch_id,source_metadata_json,updated_at) VALUES (?,?,json_object('branch_mapping_confidence',?,'branch_mapping_reason',?,'branch_mapping_source',?),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET branch_id=excluded.branch_id, source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json), updated_at=datetime('now')`).bind(item.id, branch.id, confidence, String(body.reason || '').slice(0, 500), mappingSource).run()
    return c.json({ ok: true, recommendation_id: item.id, branch_id: branch.id, branch_label: branch.label, confidence })
  } catch (err) { return c.json(safeError('Queue branch mapping failed')(err), 500) }
})

app.post('/:id/visualise', async (c) => {
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const forceRevision = body.force_revision === true
  const item = await c.env.DB.prepare(`SELECT r.id,r.video_url,r.video_title,r.creator,r.content_type,m.source_metadata_json
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.id=? AND r.status IN ('active','consumed') AND r.deleted_at IS NULL`).bind(c.req.param('id')).first<any>()
  if (!item) return c.json({ error: 'not found' }, 404)
  let sourceMetadata: Record<string, any> = {}
  try { sourceMetadata = JSON.parse(item.source_metadata_json || '{}') } catch {}
  const sourceArtifactId = sourceMetadata.artifact_id || null
  if (!item.video_url && !sourceArtifactId) return c.json({ error: 'source URL or source artifact required' }, 400)
  const artifactRows = await c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,created_at FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id')=? ORDER BY created_at DESC`).bind(item.id).all<any>()
  const ready = selectLearningSourceRenditions(artifactRows.results || []).get(item.id)
  let currentPairId: string | null = null
  if (ready?.html && ready?.pdf) {
    const metadata = (ready.html.metadata || {}) as Record<string, unknown>
    if (metadata.workflow_contract === 'lite-visual-linear/v4' && metadata.publication_state === 'ready') {
      const pairId = String(metadata.pair_id || '')
      currentPairId = pairId || null
      if (!forceRevision) return c.json({ ok: true, status: 'ready', recommendation_id: item.id, pair_id: pairId || null, companion: { primary: { role: 'html', id: ready.html.id }, secondary: { role: 'pdf', id: ready.pdf.id } } })
      if (!pairId || body.supersedes_pair_id !== pairId) return c.json({ error: 'ready_pair_revision_precondition_failed', pair_id: pairId || null }, 409)
    }
  }
  if (forceRevision && (!currentPairId || body.supersedes_pair_id !== currentPairId)) return c.json({ error: 'ready_pair_revision_precondition_failed', pair_id: currentPairId }, 409)
  const workflowRunId = `lv_${crypto.randomUUID()}`
  const revisionIdempotencyPrefix = `visualise-source:${item.id}:revision:`
  const idempotencyKey = forceRevision ? `${revisionIdempotencyPrefix}${workflowRunId}` : `visualise-source:${item.id}`
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
    ...(forceRevision ? { revision_of_pair_id: String(body.supersedes_pair_id) } : {}),
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
  const existing = forceRevision
    ? await c.env.DB.prepare(`SELECT id,status,workflow_step,workflow_run_id,payload_json FROM agent_jobs
        WHERE job_type='visualise_source' AND recommendation_id=? AND status IN ('pending','retry','running','awaiting_activation')
          AND json_extract(payload_json,'$.revision_of_pair_id')=? AND json_extract(payload_json,'$.workflow_contract')=?
          AND instr(idempotency_key,?)=1 ORDER BY created_at DESC LIMIT 1`).bind(item.id, currentPairId, LITE_VISUAL_WORKFLOW_CONTRACT, revisionIdempotencyPrefix).first<{ id: string; status: string; workflow_step?: string | null; workflow_run_id?: string | null; payload_json?: string | null }>()
    : await c.env.DB.prepare(`SELECT id,status,workflow_step,workflow_run_id,payload_json FROM agent_jobs WHERE idempotency_key=?`).bind(idempotencyKey).first<{ id: string; status: string; workflow_step?: string | null; workflow_run_id?: string | null; payload_json?: string | null }>()
  if (existing && ['pending', 'retry', 'running', 'awaiting_activation'].includes(existing.status)) {
    const status = existing.status === 'running' ? 'working' : existing.status === 'awaiting_activation' ? 'awaiting_activation' : 'queued'
    return c.json({ ok: true, status, job_status: existing.status, workflow_step: existing.workflow_step || 'resolve_source', job_id: existing.id, recommendation_id: item.id }, 202)
  }
  const jobId = !forceRevision && existing ? existing.id : `job_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
  jobPayload.recovery.checkpoint_endpoint = `/agent/jobs/${jobId}/checkpoint`
  if (!forceRevision && existing) {
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
  if (!row) return c.json({ error: 'not found' }, 404)
  const { round: _legacyRound, ...item } = row as any
  return c.json({ item })
})

app.get('/:id/record', async (c) => {
  const recommendationId = c.req.param('id')
  const item = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.tags_json,m.source_metadata_json,m.progress_percent,m.estimated_minutes,
    n.id verified_branch_id,n.label verified_branch_label,n.status verified_branch_status,n.super_category verified_branch_domain
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=?`).bind(recommendationId).first<any>()
  if (!item) return c.json({ error: 'not found' }, 404)
  const [sessions, notes, sections, artifacts, drafts, cards, outcome, memories, proposals, jobs, threads, units, anchors, annotations, relations, consolidation, disposition, feedbackRows, canonMembershipRows, personalItem] = await Promise.all([
    c.env.DB.prepare(`SELECT id,status,intent,reflection,thread_id,target_kind,target_artifact_id,started_at,returned_at,completed_at,duration_seconds FROM learning_sessions WHERE recommendation_id=? ORDER BY started_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT n.id,n.recommendation_id,n.title,n.kind,n.status,n.revision,n.source_url,n.source_artifact_id,n.provenance_json,n.updated_at
      FROM notes n WHERE n.recommendation_id=? ORDER BY n.updated_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT s.note_id,s.section_key,s.label,s.content,s.direction,s.position FROM note_sections s JOIN notes n ON n.id=s.note_id WHERE n.recommendation_id=? ORDER BY s.note_id,s.position`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT a.id,a.filename,a.media_type,a.r2_key,a.size_bytes,a.metadata_json,a.created_at,r.notebook_url
      FROM artifacts a LEFT JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id')
       WHERE (json_extract(a.metadata_json,'$.recommendation_id')=?
          OR a.id=json_extract((SELECT source_metadata_json FROM recommendation_meta WHERE recommendation_id=?),'$.artifact_id'))
         AND COALESCE(json_extract(a.metadata_json,'$.publication_state'),'ready')!='staged'
      ORDER BY a.created_at DESC`).bind(recommendationId,recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT id,question,answer,topic,status,unit_id,thread_id,provenance_json,created_at FROM srs_drafts WHERE recommendation_id=? ORDER BY created_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT id,question,answer,topic,due_at,repetitions,interval_days,ease_factor,unit_id,thread_id,scheduler_version,repair_status,paused_at,retired_at FROM srs_cards WHERE recommendation_id=? ORDER BY due_at`).bind(recommendationId).all<any>(),
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
    c.env.DB.prepare(`SELECT cf.id,cf.pick_id,cf.outcome,cf.score,cf.reason_tags_json,cf.reflection,cf.exposure_json,cf.structured_json,cf.disposition,cf.created_at,p.strategy lane,p.thread_id
      FROM compass_feedback cf LEFT JOIN compass_picks p ON p.id=cf.pick_id
      WHERE cf.recommendation_id=? ORDER BY cf.created_at DESC`).bind(recommendationId).all<any>(),
    c.env.DB.prepare(`SELECT e.id entry_id,e.role,d.id domain_id,d.slug domain_slug,d.title domain_title,d.boundary domain_boundary
      FROM canon_entries e JOIN canon_domains d ON d.id=e.domain_id
      WHERE e.recommendation_id=?
      ORDER BY d.sort_order,d.title,CASE e.role WHEN 'foundation' THEN 0 WHEN 'representative' THEN 1 ELSE 2 END`).bind(recommendationId).all<any>(),
    loadPersonalLibraryItem(c.env.DB, recommendationId),
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
  const feedback = (feedbackRows.results || []).map((row: any) => {
    const { round: _legacyRound, round_label: _legacyRoundLabel, ...exposure } = parseJson(row.exposure_json) || {}
    return {
      ...row,
      reason_tags: parseJson(row.reason_tags_json) || [],
      exposure,
      structured: parseJson(row.structured_json) || {},
      reason_tags_json: undefined,
      exposure_json: undefined,
      structured_json: undefined,
    }
  })
  const unitRows = (units.results || []).map((unit: any) => ({ ...unit, anchors: anchorsByUnit.get(unit.id) || [], relations: relationsByUnit.get(unit.id) || [] }))
  const consolidationSteps = consolidation ? await c.env.DB.prepare(`SELECT * FROM consolidation_steps WHERE run_id=? ORDER BY position`).bind(consolidation.id).all<any>() : { results: [] }
  const cardRows = (cards.results || []).map((card: any) => ({ ...card }))
  const today = new Date().toISOString().slice(0, 10)
  const artifactsRows = (artifacts.results || []).map((artifact: any) => ({
    ...artifact,
    quality_assurance: normalizeQualityAssurance(parseJson(artifact.metadata_json) || {}),
  }))
  const selectedCompanions = selectLearningSourceRenditions(artifactsRows).get(recommendationId) || {}
  const directLegacyArtifacts = artifactsRows.filter((artifact: any) => {
    const metadata = parseJson(artifact.metadata_json) || {}
    return !metadata.recommendation_id && !metadata.pair_id
  })
  const htmlArtifact = selectedCompanions.html || directLegacyArtifacts.find((artifact: any) => /html/.test(String(artifact.media_type || '')) || String(artifact.filename || '').toLowerCase().endsWith('.html')) || null
  const pdfArtifact = selectedCompanions.pdf || directLegacyArtifacts.find((artifact: any) => /pdf/.test(String(artifact.media_type || '')) || String(artifact.filename || '').toLowerCase().endsWith('.pdf')) || null
  const cardCount = cardRows.length
  const dueCount = cardRows.filter((card: any) => card.repair_status === 'active' && card.due_at && String(card.due_at) <= today).length
  const branchVerified = Boolean(item.verified_branch_id) && String(item.verified_branch_status || '').toLowerCase() !== 'pruned'
  const branchLabel = branchVerified ? item.verified_branch_label : String(item.branch || '').trim() || null
  const branchId = branchVerified ? item.verified_branch_id : null
  const branchInfo = branchLabel ? { id: branchId, label: branchLabel, status: branchVerified ? String(item.verified_branch_status || '').trim().toLowerCase() : null, super_category: branchVerified ? item.verified_branch_domain || null : null, verified: branchVerified, linkable: branchVerified } : null
  const companions = { html: htmlArtifact ? { id: htmlArtifact.id, filename: htmlArtifact.filename, size_bytes: htmlArtifact.size_bytes } : null, pdf: pdfArtifact ? { id: pdfArtifact.id, filename: pdfArtifact.filename, size_bytes: pdfArtifact.size_bytes } : null }
  const companionMetadata = htmlArtifact ? parseJson(htmlArtifact.metadata_json) || {} : {}
  const companion = htmlArtifact && pdfArtifact ? { status: 'ready', pair_id: companionMetadata.pair_id || null, primary: { role: 'html', ...companions.html }, secondary: { role: 'pdf', ...companions.pdf } } : { status: 'not_ready', pair_id: null, primary: null, secondary: null }

  const bookChapters = item.content_type === 'book'
    ? await c.env.DB.prepare(`SELECT chapter_key,chapter_title,position,completed_at FROM book_visual_chapters WHERE recommendation_id=? ORDER BY position,chapter_key`).bind(recommendationId).all<any>()
    : { results: [] }
  const bookProjection = item.content_type === 'book'
    ? projectBook(item, bookChapters.results || [], artifactsRows)
    : null
  if (bookProjection) {
    const primary = await c.env.DB.prepare(`SELECT r.id FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.content_type='book' AND (r.status IS NULL OR r.status!='deleted') AND r.deleted_at IS NULL
        AND json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_primary')=1
        AND json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_reading_state')='reading'
      ORDER BY r.updated_at DESC,r.created_at DESC,r.id DESC LIMIT 1`).first<{ id: string }>()
    bookProjection.is_primary = String(primary?.id || '') === recommendationId
  }
  const visualObj = bookProjection?.visual || companion
  const { round: _legacyRound, verified_round_label: _legacyVerifiedRound, ...itemOutput } = item

  return c.json({
    item: { ...itemOutput, ...(bookProjection || {}), branch: branchInfo, branch_label: branchLabel, branch_status: branchInfo?.status || null, canon_memberships: canonMembershipRows.results || [], visual: visualObj },
    personal_item: personalItem,
    sessions: sessions.results || [],
    threads: threads.results || [],
    annotations: annotationRows,
    learning_units: unitRows,
    disposition: disposition || null,
    feedback,
    consolidation: consolidation ? { ...consolidation, steps: consolidationSteps.results || [] } : null,
    notes: noteRows,
    artifacts: artifactsRows,
    companion,
    companions,
    visual: visualObj,
    book_chapters: bookProjection?.visual.chapters || [],
    ...(bookProjection ? { reading_state: bookProjection.reading_state, queue_state: bookProjection.queue_state, progress: bookProjection.progress, next_chapter: bookProjection.next_chapter } : {}),
    canon_memberships: canonMembershipRows.results || [],
    srs: { drafts: (drafts.results || []).map((draft: any) => ({ ...draft, provenance: parseList(draft.provenance_json), provenance_json: undefined })), cards: cardRows, recall_summary: { count: cardCount, due: dueCount } },
    outcome: outcome || null,
    memory_influences: memoryInfluences,
    proposals: (proposals.results || []).map((proposal: any) => ({ ...proposal, current: parseJson(proposal.current_json), proposed: parseJson(proposal.proposed_json), current_json: undefined, proposed_json: undefined })),
    jobs: (jobs.results || []).map((job: any) => ({ ...job, result: parseJson(job.result_json), result_json: undefined })),
  })
})

export default app
