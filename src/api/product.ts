import { Hono } from 'hono'
import { Bindings, normalizeRating, safeError } from '../lib'
import { defaultSettings, loadSettings, normalizeSettings, type TasteMapSettings } from '../services/settings'
import { createInboxCapture } from '../services/capture'
import { activateWaitingRun } from './discovery'
import { loadFeedbackContext } from '../services/feedback-context'
import { createConsolidationRun, normalizeDisposition, recordLearningEvent } from '../services/learning-core'
import { applyFeedbackProposal, revertFeedbackProposal, syncRecommendationFeedbackSignals } from '../services/intelligence-v2'

const app = new Hono<{ Bindings: Bindings }>()
const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`

type StructuredFeedback = {
  completion_state: 'completed' | 'in_progress' | 'stopped'
  reason_tags: string[]
  expected: string | null
  actual: string | null
  effort: 'light' | 'moderate' | 'deep' | null
  length_minutes: number | null
}

function structuredFeedback(body: any, fallbackComplete = false): StructuredFeedback {
  const completion_state = ['completed', 'in_progress', 'stopped'].includes(body.completion_state)
    ? body.completion_state
    : fallbackComplete || body.complete === true ? 'completed' : 'in_progress'
  const reason_tags: string[] = Array.isArray(body.reason_tags)
    ? [...new Set<string>(body.reason_tags.map((tag: unknown) => String(tag).trim().toLowerCase()).filter((tag: string) => /^[a-z0-9][a-z0-9 _-]{0,39}$/.test(tag)))].slice(0, 8)
    : []
  const text = (value: unknown) => { const result = String(value || '').trim().slice(0, 2000); return result || null }
  const effort = ['light', 'moderate', 'deep'].includes(body.effort) ? body.effort : null
  const rawLength = Number(body.length_minutes)
  return { completion_state, reason_tags, expected: text(body.expected), actual: text(body.actual), effort, length_minutes: Number.isFinite(rawLength) && rawLength >= 0 && rawLength <= 100000 ? Math.round(rawLength) : null }
}

function feedbackMetadata(feedback: StructuredFeedback, score: number | null) {
  return { learning_feedback: { ...feedback, score, recorded_at: new Date().toISOString() } }
}

app.get('/sessions', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT s.*, r.video_title, r.creator, r.video_url FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id ORDER BY s.started_at DESC LIMIT 100`).all()
  return c.json({ sessions: rows.results || [] })
})
app.get('/feedback/context', async (c) => {
  try { return c.json(await loadFeedbackContext(c.env.DB)) }
  catch (error) { return c.json(safeError('Feedback context failed')(error), 500) }
})
app.post('/sessions/start', async (c) => {
  const body = await c.req.json<{ recommendation_id: string; intent?: string; thread_id?: string; target_kind?: string; target_artifact_id?: string }>()
  if (!body.recommendation_id) return c.json({ error: 'recommendation_id required' }, 400)
  const recommendation = await c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=? AND status='active'`).bind(body.recommendation_id).first()
  if (!recommendation) return c.json({ error: 'active recommendation not found' }, 404)
  const targetKind = ['original', 'html', 'pdf', 'notebooklm', 'artifact'].includes(body.target_kind || '') ? body.target_kind! : 'original'
  const activeThread = body.thread_id
    ? await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=? AND status NOT IN ('verified','abandoned')`).bind(body.thread_id).first<{ id: string }>()
    : await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE status='active' ORDER BY priority DESC,updated_at DESC LIMIT 1`).first<{ id: string }>()
  const threadId = activeThread?.id || null
  if (body.thread_id || threadId) {
    const thread = activeThread
    if (!thread) return c.json({ error: 'open learning thread not found' }, 404)
    await c.env.DB.prepare(`INSERT INTO thread_sources (thread_id,recommendation_id,role,status) VALUES (?,?,'supporting','active') ON CONFLICT(thread_id,recommendation_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(threadId, body.recommendation_id).run()
  }
  const existing = await c.env.DB.prepare(`SELECT id FROM learning_sessions WHERE recommendation_id=? AND status IN ('active','returned') AND (? IS NULL OR thread_id=?) ORDER BY started_at DESC LIMIT 1`).bind(body.recommendation_id, threadId, threadId).first<{ id: string }>()
  if (existing) {
    await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='in_progress',last_opened_at=datetime('now'),updated_at=datetime('now') WHERE recommendation_id=?`).bind(body.recommendation_id).run()
    return c.json({ ok: true, session_id: existing.id, resumed: true })
  }
  const sessionId = id('session')
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO learning_sessions (id,recommendation_id,intent,thread_id,target_kind,target_artifact_id) VALUES (?,?,?,?,?,?)`).bind(sessionId, body.recommendation_id, body.intent || null, threadId, targetKind, body.target_artifact_id || null),
    c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,started_at,last_opened_at) VALUES (?,'in_progress',datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='in_progress',last_opened_at=datetime('now')`).bind(body.recommendation_id),
  ])
  await recordLearningEvent(c.env.DB, { eventType: 'session_started', actorType: 'user', idempotencyKey: `core-session-started:${sessionId}`, threadId, recommendationId: body.recommendation_id, sessionId, payload: { target_kind: targetKind } })
  return c.json({ ok: true, session_id: sessionId, thread_id: threadId, target_kind: targetKind }, 201)
})
app.post('/feedback/record', async (c) => {
  type FeedbackBody = { recommendation_id?: string; source_url?: string; title?: string; thread_id?: string; feedback?: string; rating?: number | string; score?: number | string; disposition?: string; complete?: boolean; completion_state?: StructuredFeedback['completion_state']; reason_tags?: string[]; expected?: string; actual?: string; effort?: StructuredFeedback['effort']; length_minutes?: number | string }
  const body: FeedbackBody = await c.req.json<FeedbackBody>().catch(() => ({} as FeedbackBody))
  const feedback = String(body.feedback || '').trim().slice(0, 10000)
  if (!feedback) return c.json({ error: 'feedback required' }, 400)
  const rating = normalizeRating(body.score ?? body.rating)
  const structured = structuredFeedback(body, body.complete === true || rating.score !== null)
  const complete = structured.completion_state === 'completed'
  const disposition = normalizeDisposition(body.disposition, rating.score)
  let recommendation = body.recommendation_id
    ? await c.env.DB.prepare(`SELECT * FROM recommendations WHERE id=?`).bind(body.recommendation_id).first<any>()
    : null
  if (!recommendation && body.source_url) recommendation = await c.env.DB.prepare(`SELECT * FROM recommendations WHERE video_url=? ORDER BY updated_at DESC LIMIT 1`).bind(body.source_url.trim()).first<any>()
  if (!recommendation && body.title) recommendation = await c.env.DB.prepare(`SELECT * FROM recommendations WHERE video_title=? ORDER BY updated_at DESC LIMIT 1`).bind(body.title.trim()).first<any>()
  if (!recommendation) {
    const source = body.source_url?.trim() || body.title?.trim()
    if (!source) return c.json({ error: 'recommendation_id, source_url, or exact title required' }, 400)
    const captured = await createInboxCapture(c.env.DB, { source, title: body.title })
    recommendation = await c.env.DB.prepare(`SELECT * FROM recommendations WHERE id=?`).bind(captured.id).first<any>()
  }
  if (!recommendation) return c.json({ error: 'source could not be resolved' }, 404)

  let session = await c.env.DB.prepare(`SELECT * FROM learning_sessions WHERE recommendation_id=? ORDER BY CASE WHEN status IN ('active','returned') THEN 0 ELSE 1 END, started_at DESC LIMIT 1`).bind(recommendation.id).first<any>()
  const sessionId = session?.id || id('session')
  const reflectionNote = await c.env.DB.prepare(`SELECT id,revision FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`).bind(recommendation.id).first<{ id: string; revision: number }>()
  const reflectionNoteId = reflectionNote?.id || `reflection_${recommendation.id}`
  const revision = Number(reflectionNote?.revision || 0) + 1
  const feedbackJobId = id('job')
  const settings = await loadSettings(c.env.DB)
  const extractionJobId = complete && (disposition === 'retain' || disposition === 'apply') && settings.srs_drafts.auto_extract ? id('job') : null
  const statements: D1PreparedStatement[] = []
  if (!session) statements.push(c.env.DB.prepare(`INSERT INTO learning_sessions (id,recommendation_id,intent,status,returned_at,completed_at,reflection,thread_id) VALUES (?,?,? ,?,datetime('now'),CASE WHEN ? THEN datetime('now') ELSE NULL END,?,?)`).bind(sessionId, recommendation.id, 'Feedback recorded through Hermes', complete ? 'completed' : 'returned', complete ? 1 : 0, feedback, body.thread_id || null))
  else statements.push(c.env.DB.prepare(`UPDATE learning_sessions SET reflection=?,returned_at=datetime('now'),status=?,completed_at=CASE WHEN ? THEN COALESCE(completed_at,datetime('now')) ELSE completed_at END WHERE id=?`).bind(feedback, complete ? 'completed' : 'returned', complete ? 1 : 0, sessionId))
  if (!reflectionNote) {
    statements.push(c.env.DB.prepare(`INSERT INTO notes (id,recommendation_id,title,kind,source_url,status,revision) VALUES (?,?,?,?,?,'draft',1)`).bind(reflectionNoteId, recommendation.id, recommendation.video_title || body.title || 'Learning reflection', 'reflection', recommendation.video_url || body.source_url || null))
    for (const [position, [sectionKey, label, content]] of [['reaction', 'Reaction', feedback], ['foundation', 'Foundation', ''], ['case_studies', 'Case Studies', ''], ['exploitation', 'Exploitation', ''], ['defense', 'Defense', '']].entries()) statements.push(c.env.DB.prepare(`INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,'auto',?)`).bind(`${reflectionNoteId}_${sectionKey}`, reflectionNoteId, sectionKey, label, content, position))
  } else {
    statements.push(c.env.DB.prepare(`UPDATE notes SET revision=?,updated_at=datetime('now') WHERE id=?`).bind(revision, reflectionNoteId))
    statements.push(c.env.DB.prepare(`UPDATE note_sections SET content=?,updated_at=datetime('now') WHERE note_id=? AND section_key='reaction'`).bind(feedback, reflectionNoteId))
  }
  statements.push(c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,source_metadata_json,last_opened_at,updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),last_opened_at=datetime('now'),updated_at=datetime('now')`).bind(recommendation.id, complete ? 'completed' : 'in_progress', complete ? 100 : 50, JSON.stringify(feedbackMetadata(structured, rating.score))))
  statements.push(c.env.DB.prepare(`UPDATE recommendations SET status=CASE WHEN ? THEN 'consumed' ELSE status END,consumed_date=CASE WHEN ? THEN COALESCE(consumed_date,date('now')) ELSE consumed_date END,user_rating=COALESCE(?,user_rating),user_score=COALESCE(?,user_score),user_review=?,updated_at=datetime('now') WHERE id=?`).bind(complete ? 1 : 0, complete ? 1 : 0, rating.rating, rating.score, feedback, recommendation.id))
  if (complete) statements.push(c.env.DB.prepare(`UPDATE compass_picks SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now') WHERE recommendation_id=? AND status IN ('ready','started')`).bind(recommendation.id))
  if (complete) statements.push(c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,actual_score,outcome_status,consumed_at,evaluated_at) VALUES (?,?,?,?,?,'consumed',date('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),outcome_status='consumed',consumed_at=COALESCE(recommendation_outcomes.consumed_at,excluded.consumed_at),evaluated_at=datetime('now')`).bind(`outcome_${recommendation.id}`, recommendation.id, recommendation.creator || null, recommendation.content_type || null, rating.score))
  statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'process_feedback',?,?,?,'explicit_user_action') ON CONFLICT(idempotency_key) DO NOTHING`).bind(feedbackJobId, JSON.stringify({ recommendation_id: recommendation.id, session_id: sessionId, thread_id: body.thread_id || null, note_id: reflectionNoteId, reflection: feedback, rating: rating.score, disposition, ...structured, review_required: true, feedback_context_endpoint: '/feedback/context', feedback_context_scope: 'all_archived_feedback_profile_and_nodes' }), `feedback:${reflectionNoteId}:${revision}`, recommendation.id))
  if (extractionJobId) statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'extract_notes',?,?,?,'explicit_user_action') ON CONFLICT(idempotency_key) DO NOTHING`).bind(extractionJobId, JSON.stringify({ recommendation_id: recommendation.id, session_id: sessionId, thread_id: body.thread_id || null, reflection_note_id: reflectionNoteId, reflection: feedback, rating: rating.score, disposition, source_url: recommendation.video_url || body.source_url || null, output_contract: 'learning_units_v1' }), `extract:${reflectionNoteId}:${revision}`, recommendation.id))
  await c.env.DB.batch(statements)
  const consolidation = complete ? await createConsolidationRun(c.env.DB, { recommendationId: recommendation.id, sessionId, threadId: body.thread_id || session?.thread_id || null, disposition, extractionJobId }) : null
  await recordLearningEvent(c.env.DB, { eventType: 'reflection_submitted', actorType: 'user', evidenceWeight: 1, idempotencyKey: `feedback-reflection:${reflectionNoteId}:${revision}`, threadId: body.thread_id || session?.thread_id || null, recommendationId: recommendation.id, sessionId, payload: { disposition, completion_state: structured.completion_state } })
  const outcome = await syncRecommendationFeedbackSignals(c.env.DB, {
    recommendationId: recommendation.id,
    sourceKey: `feedback:${reflectionNoteId}:${revision}`,
    threadId: body.thread_id || session?.thread_id || null,
    rating: rating.score,
    disposition: body.disposition ? disposition : null,
    completed: complete,
    reflection: feedback,
  })
  return c.json({
    ok: true,
    source: { id: recommendation.id, title: recommendation.video_title, url: recommendation.video_url },
    preserved_feedback: feedback,
    rating: rating.score,
    disposition,
    completion_state: structured.completion_state,
    structured_feedback: { ...structured, score: rating.score },
    feedback_job: feedbackJobId,
    extraction_job: extractionJobId,
    extraction_skip_reason: extractionJobId ? null : complete ? 'disposition_does_not_require_consolidation' : 'source_not_completed',
    consolidation,
    learning_outcome: outcome,
    // Keep the source identity in the typed Library route; Learn notes is a
    // collection view and cannot resolve the legacy source query reliably.
    source_page: `/#/library/source/${encodeURIComponent(recommendation.id)}?from=learn`,
  })
})
app.post('/sessions/:id/return', async (c) => {
  const body: { reflection?: string; complete?: boolean; rating?: number | string; score?: number | string; disposition?: string; auto_enqueue?: boolean; completion_state?: StructuredFeedback['completion_state']; reason_tags?: string[]; expected?: string; actual?: string; effort?: StructuredFeedback['effort']; length_minutes?: number | string } = await c.req.json<any>().catch(() => ({}))
  const session = await c.env.DB.prepare(`SELECT s.*, r.video_title, r.video_url, r.creator, r.content_type FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.id=?`).bind(c.req.param('id')).first<any>()
  if (!session) return c.json({ error: 'session not found' }, 404)
  const reflection = String(body.reflection || '').trim().slice(0, 10000)
  const rating = normalizeRating(body.score ?? body.rating)
  const structured = structuredFeedback(body, body.complete === true)
  const complete = structured.completion_state === 'completed'
  const disposition = normalizeDisposition(body.disposition, rating.score)
  let reflectionNoteId: string | null = null
  let reflectionNoteCreated = false
  const wasCompleted = session.status === 'completed'
  const statements = [
    c.env.DB.prepare(`UPDATE learning_sessions SET returned_at=datetime('now'),reflection=?,status=?,completed_at=CASE WHEN ? THEN datetime('now') ELSE completed_at END WHERE id=?`).bind(reflection || null, complete ? 'completed' : 'returned', complete ? 1 : 0, session.id),
    c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,source_metadata_json,last_opened_at,updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),last_opened_at=datetime('now'),updated_at=datetime('now')`).bind(session.recommendation_id, complete ? 'completed' : 'in_progress', complete ? 100 : 50, JSON.stringify(feedbackMetadata(structured, rating.score))),
  ]
  if (reflection && session.recommendation_id) {
    const existingNote = await c.env.DB.prepare(`SELECT id,revision FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`).bind(session.recommendation_id).first<{ id: string; revision: number }>()
    reflectionNoteId = existingNote?.id || `reflection_${session.recommendation_id}`
    if (!existingNote) {
      reflectionNoteCreated = true
      const sections = [
        ['reaction', 'Reaction', reflection],
        ['foundation', 'Foundation', ''],
        ['case_studies', 'Case Studies', ''],
        ['exploitation', 'Exploitation', ''],
        ['defense', 'Defense', ''],
      ]
      statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO notes (id,recommendation_id,title,kind,source_url,status) VALUES (?,?,?,?,?,?)`).bind(reflectionNoteId, session.recommendation_id, session.video_title || 'Learning reflection', 'reflection', session.video_url || null, 'draft'))
      for (const [position, [sectionKey, label, content]] of sections.entries()) {
        statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`).bind(`${reflectionNoteId}_${sectionKey}`, reflectionNoteId, sectionKey, label, content, 'auto', position))
      }
    } else {
      statements.push(c.env.DB.prepare(`UPDATE note_sections SET content=?,updated_at=datetime('now') WHERE note_id=? AND section_key='reaction'`).bind(reflection, reflectionNoteId))
      statements.push(c.env.DB.prepare(`UPDATE notes SET revision=revision+1,updated_at=datetime('now') WHERE id=?`).bind(reflectionNoteId))
    }
  }
  if (complete) {
    statements.push(c.env.DB.prepare(`UPDATE recommendations SET status='consumed',consumed_date=date('now'),user_rating=?,user_score=?,user_review=?,updated_at=datetime('now') WHERE id=?`).bind(rating.rating, rating.score, reflection || null, session.recommendation_id))
    statements.push(c.env.DB.prepare(`UPDATE compass_picks SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now') WHERE recommendation_id=? AND status IN ('ready','started')`).bind(session.recommendation_id))
  }
  if (complete && !wasCompleted && rating.score !== null) statements.push(c.env.DB.prepare(`INSERT INTO rating_events (recommendation_id,rating,score,created_at) VALUES (?,?,?,datetime('now'))`).bind(session.recommendation_id, rating.rating, rating.score))
  if (complete) statements.push(c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,actual_score,outcome_status,consumed_at,evaluated_at) VALUES (?,?,?,?,?,'consumed',date('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),outcome_status='consumed',consumed_at=excluded.consumed_at,evaluated_at=datetime('now')`).bind(`outcome_${session.recommendation_id}`, session.recommendation_id, session.creator || null, session.content_type || null, rating.score))
  let feedbackJobId: string | null = null
  let extractionJobId: string | null = null
  if (complete) {
    const isFeedItem = session.recommendation_id ? await c.env.DB.prepare(`SELECT 1 FROM feed_entries WHERE recommendation_id=?`).bind(session.recommendation_id).first() : null
    const settings = await loadSettings(c.env.DB)
    const knowledgeRequested = disposition === 'retain' || disposition === 'apply'
    const allowJobs = knowledgeRequested || (!isFeedItem && (body.auto_enqueue === true || settings.srs_drafts.auto_extract === true))
    if (allowJobs) {
      feedbackJobId = id('job')
      statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'process_feedback',?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(feedbackJobId, JSON.stringify({ recommendation_id: session.recommendation_id, session_id: session.id, note_id: reflectionNoteId, reflection, rating: rating.score, disposition, ...structured, review_required: true, feedback_context_endpoint: '/feedback/context', feedback_context_scope: 'all_archived_feedback_profile_and_nodes' }), `session-feedback:${session.id}`, session.recommendation_id, 'explicit_user_action'))
      if (knowledgeRequested && (body.auto_enqueue === true || settings.srs_drafts.auto_extract === true)) {
        extractionJobId = id('job')
        statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'extract_notes',?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(extractionJobId, JSON.stringify({
          recommendation_id: session.recommendation_id,
          session_id: session.id,
          thread_id: session.thread_id || null,
          reflection_note_id: reflectionNoteId,
          reflection,
          rating: rating.score,
          disposition,
          source_url: session.video_url || null,
          handwritten_annotations_are_reflection: true,
          output_contract: 'learning_units_v1',
        }), `session-extract:${session.id}`, session.recommendation_id, 'explicit_user_action'))
      }
    }
  } else if (reflection && reflectionNoteId) {
    const revision = Number((await c.env.DB.prepare(`SELECT revision FROM notes WHERE id=?`).bind(reflectionNoteId).first<{ revision: number }>())?.revision || 0) + (reflectionNoteCreated ? 0 : 1)
    statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(id('job'), JSON.stringify({ recommendation_id: session.recommendation_id, session_id: session.id, note_id: reflectionNoteId, reflection, rating: rating.score, ...structured, review_required: true, source: 'in_progress_reflection', feedback_context_endpoint: '/feedback/context', feedback_context_scope: 'all_archived_feedback_profile_and_nodes' }), `feedback:${reflectionNoteId}:${Math.max(1, revision)}`))
  }
  await c.env.DB.batch(statements)
  let consolidation: { id: string; state: string } | null = null
  if (complete) {
    consolidation = await createConsolidationRun(c.env.DB, { recommendationId: session.recommendation_id, sessionId: session.id, threadId: session.thread_id || null, disposition, extractionJobId })
    await recordLearningEvent(c.env.DB, { eventType: 'reflection_submitted', actorType: 'user', evidenceWeight: reflection ? 1 : .25, idempotencyKey: `reflection-submitted:${session.id}`, threadId: session.thread_id || null, recommendationId: session.recommendation_id, sessionId: session.id, payload: { disposition, completion_state: structured.completion_state } })
    try { await activateWaitingRun(c.env.DB) } catch {}
  }
  const outcome = await syncRecommendationFeedbackSignals(c.env.DB, {
    recommendationId: session.recommendation_id,
    sourceKey: `session-feedback:${session.id}`,
    threadId: session.thread_id || null,
    rating: rating.score,
    disposition: body.disposition ? disposition : null,
    completed: complete,
    reflection,
  })
  return c.json({ ok: true, status: complete ? 'completed' : 'returned', completion_state: structured.completion_state, disposition, structured_feedback: { ...structured, score: rating.score }, reflection_note_id: reflectionNoteId, reflection_note_created: reflectionNoteCreated, recall_eligible: complete && (disposition === 'retain' || disposition === 'apply'), srs_eligible: complete && (disposition === 'retain' || disposition === 'apply'), feedback_job_id: feedbackJobId, extraction_job_id: extractionJobId, consolidation, learning_outcome: outcome })
})
app.delete('/sessions/:id', async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM learning_sessions WHERE id=? AND status NOT IN ('completed')").bind(c.req.param('id')).run()
  if (result.meta.changes) {
    try { await activateWaitingRun(c.env.DB) } catch {}
  }
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'session not found or completed' }, 404)
})

app.get('/collections', async (c) => {
  const scope = c.req.query('scope')
  const rows = scope ? await c.env.DB.prepare(`SELECT c.*, COUNT(ci.recommendation_id) item_count FROM collections c LEFT JOIN collection_items ci ON ci.collection_id=c.id WHERE c.scope=? GROUP BY c.id ORDER BY c.updated_at DESC`).bind(scope).all() : await c.env.DB.prepare(`SELECT c.*, COUNT(ci.recommendation_id) item_count FROM collections c LEFT JOIN collection_items ci ON ci.collection_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC`).all()
  return c.json({ collections: rows.results || [] })
})
app.post('/collections', async (c) => {
  const body = await c.req.json<{ name: string; description?: string; scope?: string }>()
  if (!body.name?.trim()) return c.json({ error: 'name required' }, 400)
  const collectionId = id('collection')
  await c.env.DB.prepare(`INSERT INTO collections (id,name,description,scope) VALUES (?,?,?,?)`).bind(collectionId, body.name.trim(), body.description || null, body.scope || 'curate').run()
  return c.json({ ok: true, id: collectionId }, 201)
})
app.post('/collections/:id/items', async (c) => {
  const body = await c.req.json<{ recommendation_id: string; position?: number }>()
  await c.env.DB.prepare(`INSERT OR REPLACE INTO collection_items (collection_id,recommendation_id,position) VALUES (?,?,?)`).bind(c.req.param('id'), body.recommendation_id, body.position || 0).run()
  return c.json({ ok: true })
})
app.delete('/collections/:id/items/:recommendation_id', async (c) => {
  await c.env.DB.prepare('DELETE FROM collection_items WHERE collection_id=? AND recommendation_id=?').bind(c.req.param('id'), c.req.param('recommendation_id')).run()
  return c.json({ ok: true })
})
app.delete('/collections/:id', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM collection_items WHERE collection_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM collections WHERE id=?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})

async function hubNotes(db: D1Database, scope: { thread_id?: string; stage_id?: string }) {
  const rows = scope.thread_id
    ? await db.prepare(`SELECT * FROM notes WHERE thread_id=? ORDER BY updated_at DESC LIMIT 200`).bind(scope.thread_id).all<any>()
    : scope.stage_id
      ? await db.prepare(`SELECT * FROM notes WHERE stage_id=? ORDER BY updated_at DESC LIMIT 200`).bind(scope.stage_id).all<any>()
      : await db.prepare(`SELECT * FROM notes WHERE thread_id IS NOT NULL OR stage_id IS NOT NULL ORDER BY updated_at DESC LIMIT 200`).all<any>()
  const notes = rows.results || []
  if (!notes.length) return []
  const placeholders = notes.map(() => '?').join(',')
  const sections = await db.prepare(`SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${placeholders}) ORDER BY note_id,position`).bind(...notes.map((note: any) => note.id)).all<any>()
  const byNote = new Map<string, any[]>()
  for (const section of sections.results || []) byNote.set(section.note_id, [...(byNote.get(section.note_id) || []), section])
  return notes.map((note: any) => ({ ...note, sections: byNote.get(note.id) || [] }))
}
app.get('/notes', async (c) => {
  const kind = c.req.query('kind')
  const notes = kind ? await c.env.DB.prepare(`SELECT * FROM notes WHERE kind=? ORDER BY updated_at DESC LIMIT 200`).bind(kind).all<any>() : await c.env.DB.prepare(`SELECT * FROM notes ORDER BY updated_at DESC LIMIT 200`).all<any>()
  const rows = notes.results || []
  if (!rows.length) return c.json({ notes: [] })
  const placeholders = rows.map(() => '?').join(',')
  const sections = await c.env.DB.prepare(`SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${placeholders}) ORDER BY note_id,position`).bind(...rows.map((note) => note.id)).all<any>()
  const byNote = new Map<string, any[]>()
  for (const section of sections.results || []) byNote.set(section.note_id, [...(byNote.get(section.note_id) || []), section])
  const output = rows.map((note) => ({ ...note, sections: byNote.get(note.id) || [] }))
  return c.json({ notes: output })
})
app.get('/notes/hub', async (c) => {
  const threadId = c.req.query('thread_id') || ''
  const stageId = c.req.query('stage_id') || ''
  const notes = await hubNotes(c.env.DB, { thread_id: threadId || undefined, stage_id: stageId || undefined })
  return c.json({ notes })
})
app.post('/notes', async (c) => {
  const body = await c.req.json<any>()
  if (!body.title?.trim()) return c.json({ error: 'title required' }, 400)
  const threadId = String(body.thread_id || '').trim().slice(0, 120) || null
  const stageId = String(body.stage_id || '').trim().slice(0, 120) || null
  if (threadId && stageId) return c.json({ error: 'note cannot belong to both a path and a stage' }, 400)
  if (threadId) {
    const thread = await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(threadId).first()
    if (!thread) return c.json({ error: 'thread not found' }, 400)
  }
  if (stageId) {
    const stage = await c.env.DB.prepare(`SELECT id FROM learning_path_stages WHERE id=?`).bind(stageId).first()
    if (!stage) return c.json({ error: 'stage not found' }, 400)
  }
  const noteId = body.id || id('note')
  const statements = [c.env.DB.prepare(`INSERT INTO notes (id,recommendation_id,title,kind,branch_id,source_url,status,thread_id,stage_id) VALUES (?,?,?,?,?,?,?,?,?)`).bind(noteId, body.recommendation_id || null, body.title.trim(), body.kind || 'note', body.branch_id || null, body.source_url || null, body.status || 'draft', threadId, stageId)]
  for (const [index, section] of (body.sections || []).entries()) statements.push(c.env.DB.prepare(`INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`).bind(id('section'), noteId, section.section_key, section.label, section.content || '', section.direction || 'auto', index))
  await c.env.DB.batch(statements)
  return c.json({ ok: true, id: noteId }, 201)
})
app.put('/notes/:id', async (c) => {
  const body = await c.req.json<any>()
  const statements = [c.env.DB.prepare(`UPDATE notes SET title=COALESCE(?,title), branch_id=COALESCE(?,branch_id), revision=revision+1, updated_at=datetime('now') WHERE id=?`).bind(body.title || null, body.branch_id || null, c.req.param('id'))]
  for (const section of body.sections || []) statements.push(c.env.DB.prepare(`UPDATE note_sections SET content=?,direction=?,updated_at=datetime('now') WHERE note_id=? AND section_key=?`).bind(section.content || '', section.direction || 'auto', c.req.param('id'), section.section_key))
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})
app.delete('/notes/:id', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM note_sections WHERE note_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM notes WHERE id=?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})
app.post('/notes/:id/process', async (c) => {
  const note = await c.env.DB.prepare(`SELECT * FROM notes WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!note) return c.json({ error: 'not found' }, 404)
  const recommendation = note.recommendation_id ? await c.env.DB.prepare(`SELECT user_score,video_url FROM recommendations WHERE id=?`).bind(note.recommendation_id).first<any>() : null
  if (note.kind !== 'reflection') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE notes SET status='processing',updated_at=datetime('now') WHERE id=?`).bind(note.id),
      c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'extract_notes',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(id('job'), JSON.stringify({ note_id: note.id, recommendation_id: note.recommendation_id, source_url: note.source_url || recommendation?.video_url || null, rating: Number(recommendation?.user_score || 0), reprocess_note_id: note.id, full_bilingual: true }), `extract-reprocess:${note.id}:${note.revision}`),
    ])
    return c.json({ ok: true, status: 'processing', kind: 'source' }, 202)
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE notes SET status='processing',updated_at=datetime('now') WHERE id=?`).bind(note.id),
    c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(id('job'), JSON.stringify({ note_id: note.id, recommendation_id: note.recommendation_id, reflection: true, full_profile_update: true, update_all_taste_elements: true, review_required: true, source: 'reflection_button', feedback_context_endpoint: '/feedback/context', feedback_context_scope: 'all_archived_feedback_profile_and_nodes' }), `feedback:${note.id}:${note.revision}`),
  ])
  return c.json({ ok: true, status: 'processing' }, 202)
})

app.get('/srs/drafts', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT d.*,
      COALESCE(
        (SELECT title FROM notes WHERE id = d.note_id LIMIT 1),
        (SELECT title FROM notes WHERE recommendation_id = d.recommendation_id AND d.recommendation_id IS NOT NULL LIMIT 1),
        (SELECT video_title FROM recommendations WHERE id = d.recommendation_id AND d.recommendation_id IS NOT NULL LIMIT 1),
        'Direct Draft'
      ) as source_title,
      COALESCE(
        d.branch,
        (SELECT branch_id FROM notes WHERE id = d.note_id LIMIT 1),
        d.topic,
        'General'
      ) as branch
    FROM srs_drafts d
    ORDER BY d.created_at DESC
    LIMIT 200
  `).all()
  return c.json({ drafts: rows.results || [] })
})
app.get('/learning/srs/cards', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT c.*,
      COALESCE(
        (SELECT title FROM notes WHERE id = c.note_id LIMIT 1),
        (SELECT title FROM notes WHERE recommendation_id = c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1),
        (SELECT video_title FROM recommendations WHERE id = c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1),
        'Direct Card'
      ) as source_title,
      COALESCE(
        c.branch,
        (SELECT branch_id FROM notes WHERE id = c.note_id LIMIT 1),
        c.topic,
        'General'
      ) as branch,
      COALESCE(c.note_id, (SELECT id FROM notes WHERE recommendation_id = c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1)) as note_id
    FROM srs_cards c
    ORDER BY c.due_at ASC, c.topic, c.question
    LIMIT 500
  `).all()
  return c.json({ cards: rows.results || [] })
})
app.delete('/learning/srs/cards/:id', async (c) => {
  const result = await c.env.DB.prepare(`DELETE FROM srs_cards WHERE id=?`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'card not found' }, 404)
})
app.put('/srs/drafts/:id', async (c) => {
  const body = await c.req.json<any>()
  await c.env.DB.prepare(`UPDATE srs_drafts SET question=COALESCE(?,question),answer=COALESCE(?,answer),topic=COALESCE(?,topic),branch=COALESCE(?,branch),updated_at=datetime('now') WHERE id=?`).bind(body.question || null, body.answer || null, body.topic || null, body.branch || null, c.req.param('id')).run()
  return c.json({ ok: true })
})
app.post('/srs/drafts/:id/approve', async (c) => {
  const draft = await c.env.DB.prepare(`SELECT * FROM srs_drafts WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!draft) return c.json({ error: 'not found' }, 404)
  const approved = await c.env.DB.prepare(`UPDATE srs_drafts SET status='approved',updated_at=datetime('now') WHERE id=? AND status='draft'`).bind(draft.id).run()
  if (!approved.meta.changes) return c.json({ error: 'draft already processed' }, 409)
  await c.env.DB.prepare(`INSERT INTO srs_cards (id,recommendation_id,note_id,question,answer,topic,branch,due_at,unit_id,thread_id,scheduler_version) VALUES (?,?,?,?,?,?,?,date('now'),?,?,'fsrs-6-ts-fsrs-5.4.1')`).bind(id('card'), draft.recommendation_id, draft.note_id || null, draft.question, draft.answer, draft.topic, draft.branch || null, draft.unit_id || null, draft.thread_id || null).run()
  return c.json({ ok: true })
})
app.post('/srs/drafts/:id/reject', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE srs_drafts SET status='rejected',updated_at=datetime('now') WHERE id=? AND status='draft'`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'draft not found' }, 404)
})
app.delete('/srs/drafts/:id', async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM srs_drafts WHERE id=?").bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'draft not found' }, 404)
})

app.get('/feedback/proposals', async (c) => {
  const status = c.req.query('status')
  const rows = status
    ? await c.env.DB.prepare(`SELECT fp.*,r.video_title FROM feedback_proposals fp LEFT JOIN recommendations r ON r.id=fp.recommendation_id WHERE fp.status=? ORDER BY fp.created_at DESC LIMIT 200`).bind(status).all<any>()
    : await c.env.DB.prepare(`SELECT fp.*,r.video_title FROM feedback_proposals fp LEFT JOIN recommendations r ON r.id=fp.recommendation_id ORDER BY fp.created_at DESC LIMIT 200`).all<any>()
  return c.json({
    proposals: (rows.results || []).map((row) => ({
      ...row,
      current: row.current_json ? JSON.parse(row.current_json) : null,
      proposed: JSON.parse(row.proposed_json),
      evidence_items: (() => { try { return JSON.parse(row.evidence_json || '[]') } catch { return [] } })(),
      validation: (() => { try { return JSON.parse(row.validation_json || '{}') } catch { return {} } })(),
      deployment: (() => { try { return JSON.parse(row.deployment_json || '{}') } catch { return {} } })(),
      current_json: undefined,
      proposed_json: undefined,
      evidence_json: undefined,
      validation_json: undefined,
      deployment_json: undefined,
    })),
  })
})
app.post('/feedback/proposals/:id/approve', async (c) => {
  const result = await applyFeedbackProposal(c.env.DB, c.req.param('id'), 'user')
  if (!result.ok) return c.json(result, result.error === 'pending_proposal_not_found' ? 404 : result.error === 'unsupported_proposal_type' ? 422 : 409)
  return c.json({ ...result, applied_immediately: true })
})
app.post('/feedback/proposals/:id/apply', async (c) => {
  const result = await applyFeedbackProposal(c.env.DB, c.req.param('id'), 'hermes_auto')
  if (!result.ok) return c.json(result, result.error === 'pending_proposal_not_found' ? 404 : result.error === 'unsupported_proposal_type' ? 422 : 409)
  return c.json({ ...result, applied_immediately: true })
})
app.post('/feedback/proposals/:id/revert', async (c) => {
  const result = await revertFeedbackProposal(c.env.DB, c.req.param('id'), 'user')
  return result.ok ? c.json(result) : c.json(result, 404)
})
app.post('/feedback/proposals/:id/reject', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE feedback_proposals SET status='rejected',reviewed_at=datetime('now') WHERE id=? AND status='pending'`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true, status: 'rejected' }) : c.json({ error: 'pending proposal not found' }, 404)
})

app.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT setting_key,value_json,updated_at FROM user_settings`).all<any>()
  const settings: Record<string, unknown> = {}
  for (const row of rows.results || []) { try { settings[row.setting_key] = JSON.parse(row.value_json) } catch { settings[row.setting_key] = row.value_json } }
  return c.json({ settings, resolved: await loadSettings(c.env.DB), defaults: defaultSettings })
})
app.put('/settings/:key', async (c) => {
  try {
    const key = c.req.param('key') as keyof TasteMapSettings
    if (!['appearance', 'learning', 'srs_drafts', 'ai_curation', 'profile_proposals', 'profile_automation', 'recommendation_engine', 'atlas'].includes(key)) return c.json({ error: 'unknown settings key' }, 400)
    const current = await loadSettings(c.env.DB)
    const value = await c.req.json()
    const resolved = normalizeSettings({ ...current, [key]: { ...(current[key] as Record<string, unknown>), ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) } })
    await c.env.DB.prepare(`INSERT INTO user_settings (setting_key,value_json) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`).bind(key, JSON.stringify(resolved[key])).run()
    return c.json({ ok: true, key, value: resolved[key], resolved })
  } catch (error) { return c.json(safeError('Settings update failed')(error), 500) }
})

export default app
