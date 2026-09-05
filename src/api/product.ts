import { Hono } from 'hono'
import { Bindings, normalizeRating, safeError } from '../lib'
import { withRecallBranches } from '../services/recall-branches'
import { defaultSettings, loadSettings, normalizeSettings, type TasteMapSettings } from '../services/settings'
import { createCapture } from '../services/capture'
import { activateWaitingRun } from './discovery'
import { loadFeedbackContext } from '../services/feedback-context'
import { createConsolidationRun, normalizeDisposition, recordLearningEvent } from '../services/learning-core'
import {
  applyFeedbackProposal,
  revertFeedbackProposal,
  syncRecommendationFeedbackSignals,
} from '../services/intelligence-v2'
import { resolveLearningScope } from '../services/learning-scope'
import {
  feedbackLifecycle,
  feedbackMetadata,
  normalizeStructuredFeedback,
  type FeedbackCompletionState,
  type FeedbackEffort,
} from '../services/feedback'
import { loadNormalizedUnitRelations } from '../services/cross-branch-bridges'
import {
  appendSynthesisRevision,
  createClaimHighlight,
  loadNoteDistillation,
  promoteHighlightToUnit,
} from '../services/note-distillation'
import { validateArabicRecall } from '../services/recall-language'
import { loadSourceAnnotationEvidence, SourceAnnotationEvidenceError } from '../services/source-annotation-evidence'

const app = new Hono<{ Bindings: Bindings }>()
const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`

app.get('/sessions', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.*, r.video_title, r.creator, r.video_url FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id ORDER BY s.started_at DESC LIMIT 100`,
  ).all()
  return c.json({ sessions: rows.results || [] })
})
app.get('/feedback/context', async (c) => {
  try {
    return c.json(await loadFeedbackContext(c.env.DB))
  } catch (error) {
    return c.json(safeError('Feedback context failed')(error), 500)
  }
})
app.post('/sessions/start', async (c) => {
  const body = await c.req.json<{
    recommendation_id: string
    intent?: string
    thread_id?: string
    target_kind?: string
    target_artifact_id?: string
  }>()
  if (!body.recommendation_id) return c.json({ error: 'recommendation_id required' }, 400)
  const recommendation = await c.env.DB.prepare(
    `SELECT id,video_title,why_this FROM recommendations WHERE id=? AND status='active' AND deleted_at IS NULL`,
  )
    .bind(body.recommendation_id)
    .first<any>()
  if (!recommendation) return c.json({ error: 'active recommendation not found' }, 404)
  const targetKind = ['original', 'html', 'pdf', 'notebooklm', 'artifact'].includes(body.target_kind || '')
    ? body.target_kind!
    : 'original'
  const activeThread = body.thread_id
    ? await c.env.DB.prepare(
        `SELECT id FROM learning_threads WHERE id=? AND superseded_at IS NULL AND status NOT IN ('verified','abandoned')`,
      )
        .bind(body.thread_id)
        .first<{ id: string }>()
    : await c.env.DB.prepare(
        `SELECT id FROM learning_threads WHERE superseded_at IS NULL AND status='active' ORDER BY priority DESC,updated_at DESC LIMIT 1`,
      ).first<{ id: string }>()
  const threadId = activeThread?.id || null
  if (body.thread_id || threadId) {
    const thread = activeThread
    if (!thread) return c.json({ error: 'open learning thread not found' }, 404)
    const expectedContribution =
      [body.intent, recommendation.why_this]
        .map((value) => String(value || '').trim())
        .find(Boolean)
        ?.slice(0, 1000) ||
      `Opened as supporting material for this Thread in an explicit learning session: ${String(
        recommendation.video_title || recommendation.id,
      )
        .trim()
        .slice(0, 840)}.`
    const placement = await c.env.DB.prepare(
      `INSERT INTO thread_sources (thread_id,recommendation_id,role,expected_contribution,position,status)
      SELECT placement_thread.id,placement_meta.recommendation_id,'supporting',?,
        COALESCE((SELECT MAX(existing.position)+1 FROM thread_sources existing WHERE existing.thread_id=placement_thread.id AND existing.status!='removed'),0),'active'
      FROM learning_threads placement_thread
      JOIN recommendation_meta placement_meta ON placement_meta.recommendation_id=?
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
        updated_at=datetime('now')`,
    )
      .bind(expectedContribution, body.recommendation_id, threadId)
      .run()
    if (placement.meta.changes !== 1)
      return c.json(
        {
          error: 'thread_source_attachment_conflict',
          message:
            'The source no longer has a valid canonical branch and domain for this Thread. Reload it before starting a learning session.',
        },
        409,
      )
  }
  const existing = await c.env.DB.prepare(
    `SELECT id FROM learning_sessions WHERE recommendation_id=? AND status IN ('active','returned') AND (? IS NULL OR thread_id=?) ORDER BY started_at DESC LIMIT 1`,
  )
    .bind(body.recommendation_id, threadId, threadId)
    .first<{ id: string }>()
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE recommendation_meta SET learning_state='in_progress',last_opened_at=datetime('now'),updated_at=datetime('now') WHERE recommendation_id=?`,
    )
      .bind(body.recommendation_id)
      .run()
    return c.json({ ok: true, session_id: existing.id, resumed: true })
  }
  const sessionId = id('session')
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO learning_sessions (id,recommendation_id,intent,thread_id,target_kind,target_artifact_id) VALUES (?,?,?,?,?,?)`,
    ).bind(
      sessionId,
      body.recommendation_id,
      body.intent || null,
      threadId,
      targetKind,
      body.target_artifact_id || null,
    ),
    c.env.DB.prepare(
      `INSERT INTO recommendation_meta (recommendation_id,learning_state,started_at,last_opened_at) VALUES (?,'in_progress',datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='in_progress',last_opened_at=datetime('now')`,
    ).bind(body.recommendation_id),
  ])
  await recordLearningEvent(c.env.DB, {
    eventType: 'session_started',
    actorType: 'user',
    idempotencyKey: `core-session-started:${sessionId}`,
    threadId,
    recommendationId: body.recommendation_id,
    sessionId,
    payload: { target_kind: targetKind },
  })
  return c.json({ ok: true, session_id: sessionId, thread_id: threadId, target_kind: targetKind }, 201)
})
app.post('/feedback/record', async (c) => {
  type FeedbackBody = {
    recommendation_id?: string
    source_url?: string
    title?: string
    thread_id?: string
    branch_id?: string
    feedback?: string
    rating?: number | string
    score?: number | string
    disposition?: string
    complete?: boolean
    completion_state?: FeedbackCompletionState
    reason_tags?: string[]
    expected?: string
    actual?: string
    effort?: FeedbackEffort
    length_minutes?: number | string
  }
  const body: FeedbackBody = await c.req.json<FeedbackBody>().catch(() => ({}) as FeedbackBody)
  const feedback = String(body.feedback || '')
    .trim()
    .slice(0, 10000)
  if (!feedback) return c.json({ error: 'feedback required' }, 400)
  const rating = normalizeRating(body.score ?? body.rating)
  const structured = normalizeStructuredFeedback(
    body,
    body.complete === true || rating.score !== null ? 'completed' : 'in_progress',
  )
  if (structured.completion_state === 'stopped' && structured.reason_tags.length === 0)
    return c.json({ error: 'stopped_reason_required' }, 400)
  const lifecycle = feedbackLifecycle(structured.completion_state)
  const { complete, stopped } = lifecycle
  const disposition = normalizeDisposition(body.disposition)
  const requestedBranchId = String(body.branch_id || '').trim() || null
  const requestedBranch = requestedBranchId
    ? await c.env.DB.prepare(
        "SELECT id,label,status FROM tree_nodes WHERE id=? AND type IN ('root','category','branch','leaf')",
      )
        .bind(requestedBranchId)
        .first<{ id: string; label: string; status: string }>()
    : null
  if (requestedBranchId && !requestedBranch)
    return c.json({ error: 'branch not found', branch_id: requestedBranchId }, 404)
  if (requestedBranch && String(requestedBranch.status || '').toLowerCase() === 'pruned')
    return c.json({ error: 'cannot map to a pruned branch', branch_id: requestedBranch.id }, 409)
  let recommendation = body.recommendation_id
    ? await c.env.DB.prepare(`SELECT * FROM recommendations WHERE id=?`).bind(body.recommendation_id).first<any>()
    : null
  if (!recommendation && body.source_url)
    recommendation = await c.env.DB.prepare(
      `SELECT * FROM recommendations WHERE video_url=? ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(body.source_url.trim())
      .first<any>()
  if (!recommendation && body.title)
    recommendation = await c.env.DB.prepare(
      `SELECT * FROM recommendations WHERE video_title=? ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(body.title.trim())
      .first<any>()
  if (!recommendation) {
    const source = body.source_url?.trim() || body.title?.trim()
    if (!source) return c.json({ error: 'recommendation_id, source_url, or exact title required' }, 400)
    const captured = await createCapture(c.env.DB, {
      source,
      title: body.title,
      ...(requestedBranch
        ? {
            branch: {
              id: requestedBranch.id,
              confidence: 'high',
              reason: 'Explicit branch supplied with feedback',
              source: 'feedback_record',
            },
          }
        : {}),
    })
    recommendation = await c.env.DB.prepare(`SELECT * FROM recommendations WHERE id=?`).bind(captured.id).first<any>()
  }
  if (!recommendation) return c.json({ error: 'source could not be resolved' }, 404)
  const existingMeta = await c.env.DB.prepare(`SELECT branch_id FROM recommendation_meta WHERE recommendation_id=?`)
    .bind(recommendation.id)
    .first<{ branch_id: string | null }>()
  if (requestedBranchId && existingMeta?.branch_id && existingMeta.branch_id !== requestedBranchId) {
    return c.json(
      {
        error: 'branch_conflict',
        recommendation_id: recommendation.id,
        existing_branch_id: existingMeta.branch_id,
        requested_branch_id: requestedBranchId,
      },
      409,
    )
  }

  const session = await c.env.DB.prepare(
    `SELECT * FROM learning_sessions WHERE recommendation_id=? ORDER BY CASE WHEN status IN ('active','returned') THEN 0 ELSE 1 END, started_at DESC LIMIT 1`,
  )
    .bind(recommendation.id)
    .first<any>()
  const sessionId = session?.id || id('session')
  const reflectionNote = await c.env.DB.prepare(
    `SELECT id,revision FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(recommendation.id)
    .first<{ id: string; revision: number }>()
  const reflectionNoteId = reflectionNote?.id || `reflection_${recommendation.id}`
  const revision = Number(reflectionNote?.revision || 0) + 1
  const feedbackJobId = id('job')
  const extractionJobId = complete && (disposition === 'retain' || disposition === 'apply') ? id('job') : null
  const statements: D1PreparedStatement[] = []
  if (!session)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO learning_sessions (id,recommendation_id,intent,status,returned_at,completed_at,reflection,thread_id) VALUES (?,?,? ,?,datetime('now'),CASE WHEN ? THEN datetime('now') ELSE NULL END,?,?)`,
      ).bind(
        sessionId,
        recommendation.id,
        'Feedback recorded through Hermes',
        lifecycle.sessionStatus,
        complete ? 1 : 0,
        feedback,
        body.thread_id || null,
      ),
    )
  else
    statements.push(
      c.env.DB.prepare(
        `UPDATE learning_sessions SET reflection=?,returned_at=datetime('now'),status=?,completed_at=CASE WHEN ? THEN COALESCE(completed_at,datetime('now')) ELSE completed_at END WHERE id=?`,
      ).bind(feedback, lifecycle.sessionStatus, complete ? 1 : 0, sessionId),
    )
  if (!reflectionNote) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO notes (id,recommendation_id,title,kind,source_url,status,revision) VALUES (?,?,?,?,?,'draft',1)`,
      ).bind(
        reflectionNoteId,
        recommendation.id,
        recommendation.video_title || body.title || 'Learning reflection',
        'reflection',
        recommendation.video_url || body.source_url || null,
      ),
    )
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,'auto',0)`,
      ).bind(`${reflectionNoteId}_reaction`, reflectionNoteId, 'reaction', 'My reflection', feedback),
    )
  } else {
    statements.push(
      c.env.DB.prepare(`UPDATE notes SET revision=?,updated_at=datetime('now') WHERE id=?`).bind(
        revision,
        reflectionNoteId,
      ),
    )
    statements.push(
      c.env.DB.prepare(
        `UPDATE note_sections SET content=?,updated_at=datetime('now') WHERE note_id=? AND section_key='reaction'`,
      ).bind(feedback, reflectionNoteId),
    )
  }
  const feedbackMetadataJson = JSON.stringify({
    ...feedbackMetadata(structured, rating.score, { disposition, source: 'feedback_record' }),
    ...(requestedBranch
      ? {
          branch_mapping_confidence: 'high',
          branch_mapping_reason: 'Explicit branch supplied with feedback',
          branch_mapping_source: 'feedback_record',
        }
      : {}),
  })
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,branch_id,source_metadata_json,last_opened_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,branch_id=COALESCE(recommendation_meta.branch_id,excluded.branch_id),source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),last_opened_at=datetime('now'),updated_at=datetime('now')`,
    ).bind(
      recommendation.id,
      lifecycle.learningState,
      lifecycle.progressPercent,
      requestedBranchId,
      feedbackMetadataJson,
    ),
  )
  statements.push(
    c.env.DB.prepare(
      `UPDATE recommendations SET status=CASE WHEN ?='consumed' THEN 'consumed' WHEN ?='rejected' THEN 'rejected' ELSE status END,consumed_date=CASE WHEN ? THEN COALESCE(consumed_date,date('now')) ELSE consumed_date END,user_rating=COALESCE(?,user_rating),user_score=COALESCE(?,user_score),user_review=?,updated_at=datetime('now') WHERE id=?`,
    ).bind(
      lifecycle.recommendationStatus,
      lifecycle.recommendationStatus,
      complete ? 1 : 0,
      rating.rating,
      rating.score,
      feedback,
      recommendation.id,
    ),
  )
  if (complete || stopped)
    statements.push(
      c.env.DB.prepare(
        `UPDATE compass_picks SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now') WHERE recommendation_id=? AND status IN ('ready','started')`,
      ).bind(recommendation.id),
    )
  if (complete)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,actual_score,outcome_status,consumed_at,evaluated_at) VALUES (?,?,?,?,?,'consumed',date('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),outcome_status='consumed',consumed_at=COALESCE(recommendation_outcomes.consumed_at,excluded.consumed_at),evaluated_at=datetime('now')`,
      ).bind(
        `outcome_${recommendation.id}`,
        recommendation.id,
        recommendation.creator || null,
        recommendation.content_type || null,
        rating.score,
      ),
    )
  if (stopped)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,outcome_status,rejection_reason,evaluated_at) VALUES (?,?,?,?,'rejected',?,datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET outcome_status='rejected',rejection_reason=excluded.rejection_reason,evaluated_at=datetime('now')`,
      ).bind(
        `outcome_${recommendation.id}`,
        recommendation.id,
        recommendation.creator || null,
        recommendation.content_type || null,
        structured.reason_tags[0],
      ),
    )
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'process_feedback',?,?,?,'explicit_user_action') ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(
      feedbackJobId,
      JSON.stringify({
        recommendation_id: recommendation.id,
        session_id: sessionId,
        thread_id: body.thread_id || null,
        note_id: reflectionNoteId,
        reflection: feedback,
        rating: rating.score,
        disposition,
        ...structured,
        review_required: true,
        feedback_context_endpoint: '/feedback/context',
        feedback_context_scope: 'all_archived_feedback_profile_and_nodes',
      }),
      `feedback:${reflectionNoteId}:${revision}`,
      recommendation.id,
    ),
  )
  if (extractionJobId)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'extract_notes',?,?,?,'explicit_user_action') ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        extractionJobId,
        JSON.stringify({
          recommendation_id: recommendation.id,
          session_id: sessionId,
          thread_id: body.thread_id || null,
          reflection_note_id: reflectionNoteId,
          reflection: feedback,
          rating: rating.score,
          disposition,
          source_url: recommendation.video_url || body.source_url || null,
          output_contract: 'source_note_v2',
        }),
        `extract:${reflectionNoteId}:${revision}`,
        recommendation.id,
      ),
    )
  await c.env.DB.batch(statements)
  const consolidation = complete
    ? await createConsolidationRun(c.env.DB, {
        recommendationId: recommendation.id,
        sessionId,
        threadId: body.thread_id || session?.thread_id || null,
        disposition,
        extractionJobId,
      })
    : null
  await recordLearningEvent(c.env.DB, {
    eventType: 'reflection_submitted',
    actorType: 'user',
    evidenceWeight: 1,
    idempotencyKey: `feedback-reflection:${reflectionNoteId}:${revision}`,
    threadId: body.thread_id || session?.thread_id || null,
    recommendationId: recommendation.id,
    sessionId,
    explicit: true,
    origin: 'learning_feedback',
    payload: {
      reflection: feedback,
      rating: rating.score,
      disposition,
      structured_feedback: structured,
      source: 'feedback_record',
    },
  })
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
    extraction_skip_reason: extractionJobId
      ? null
      : complete
        ? 'disposition_does_not_require_consolidation'
        : stopped
          ? 'source_stopped'
          : 'source_not_completed',
    receipt: {
      status: 'recorded',
      analysis: 'queued',
      notes: extractionJobId ? 'queued' : 'not_requested',
      neutral: structured.reason_tags.includes('not_now'),
    },
    consolidation,
    learning_outcome: outcome,
    // Keep the source identity in the typed Library route; Learn notes is a
    // collection view and cannot resolve the legacy source query reliably.
    source_page: `/#/library/source/${encodeURIComponent(recommendation.id)}?from=learn`,
  })
})
app.post('/sessions/:id/return', async (c) => {
  const body: {
    reflection?: string
    complete?: boolean
    rating?: number | string
    score?: number | string
    disposition?: string
    completion_state?: FeedbackCompletionState
    reason_tags?: string[]
    expected?: string
    actual?: string
    effort?: FeedbackEffort
    length_minutes?: number | string
  } = await c.req.json<any>().catch(() => ({}))
  const session = await c.env.DB.prepare(
    `SELECT s.*, r.video_title, r.video_url, r.creator, r.content_type FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!session) return c.json({ error: 'session not found' }, 404)
  const reflection = String(body.reflection || '')
    .trim()
    .slice(0, 10000)
  const rating = normalizeRating(body.score ?? body.rating)
  const structured = normalizeStructuredFeedback(body, body.complete === true ? 'completed' : 'in_progress')
  if (structured.completion_state === 'stopped' && structured.reason_tags.length === 0)
    return c.json({ error: 'stopped_reason_required' }, 400)
  const lifecycle = feedbackLifecycle(structured.completion_state)
  const { complete, stopped } = lifecycle
  const disposition = normalizeDisposition(body.disposition)
  let reflectionNoteId: string | null = null
  let reflectionNoteCreated = false
  let reflectionRevision = 0
  const wasCompleted = session.status === 'completed'
  const statements = [
    c.env.DB.prepare(
      `UPDATE learning_sessions SET returned_at=datetime('now'),reflection=?,status=?,completed_at=CASE WHEN ? THEN datetime('now') ELSE completed_at END WHERE id=?`,
    ).bind(reflection || null, lifecycle.sessionStatus, complete ? 1 : 0, session.id),
    c.env.DB.prepare(
      `INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,source_metadata_json,last_opened_at,updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),last_opened_at=datetime('now'),updated_at=datetime('now')`,
    ).bind(
      session.recommendation_id,
      lifecycle.learningState,
      lifecycle.progressPercent,
      JSON.stringify(feedbackMetadata(structured, rating.score, { disposition, source: 'session_return' })),
    ),
  ]
  if (reflection && session.recommendation_id) {
    const existingNote = await c.env.DB.prepare(
      `SELECT id,revision FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(session.recommendation_id)
      .first<{ id: string; revision: number }>()
    reflectionNoteId = existingNote?.id || `reflection_${session.recommendation_id}`
    reflectionRevision = Number(existingNote?.revision || 0) + 1
    if (!existingNote) {
      reflectionNoteCreated = true
      const sections = [['reaction', 'My reflection', reflection]]
      statements.push(
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO notes (id,recommendation_id,title,kind,source_url,status) VALUES (?,?,?,?,?,?)`,
        ).bind(
          reflectionNoteId,
          session.recommendation_id,
          session.video_title || 'Learning reflection',
          'reflection',
          session.video_url || null,
          'draft',
        ),
      )
      for (const [position, [sectionKey, label, content]] of sections.entries()) {
        statements.push(
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`,
          ).bind(`${reflectionNoteId}_${sectionKey}`, reflectionNoteId, sectionKey, label, content, 'auto', position),
        )
      }
    } else {
      statements.push(
        c.env.DB.prepare(
          `UPDATE note_sections SET content=?,updated_at=datetime('now') WHERE note_id=? AND section_key='reaction'`,
        ).bind(reflection, reflectionNoteId),
      )
      statements.push(
        c.env.DB.prepare(`UPDATE notes SET revision=revision+1,updated_at=datetime('now') WHERE id=?`).bind(
          reflectionNoteId,
        ),
      )
    }
  }
  if (complete) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE recommendations SET status='consumed',consumed_date=date('now'),user_rating=?,user_score=?,user_review=?,updated_at=datetime('now') WHERE id=?`,
      ).bind(rating.rating, rating.score, reflection || null, session.recommendation_id),
    )
    statements.push(
      c.env.DB.prepare(
        `UPDATE compass_picks SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now') WHERE recommendation_id=? AND status IN ('ready','started')`,
      ).bind(session.recommendation_id),
    )
  }
  if (stopped) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE recommendations SET status='rejected',user_rating=COALESCE(?,user_rating),user_score=COALESCE(?,user_score),user_review=?,updated_at=datetime('now') WHERE id=?`,
      ).bind(rating.rating, rating.score, reflection || null, session.recommendation_id),
    )
    statements.push(
      c.env.DB.prepare(
        `UPDATE compass_picks SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now') WHERE recommendation_id=? AND status IN ('ready','started')`,
      ).bind(session.recommendation_id),
    )
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,outcome_status,rejection_reason,evaluated_at) VALUES (?,?,?,?,'rejected',?,datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET outcome_status='rejected',rejection_reason=excluded.rejection_reason,evaluated_at=datetime('now')`,
      ).bind(
        `outcome_${session.recommendation_id}`,
        session.recommendation_id,
        session.creator || null,
        session.content_type || null,
        structured.reason_tags[0],
      ),
    )
  }
  if (complete && !wasCompleted && rating.score !== null)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO rating_events (recommendation_id,rating,score,created_at) VALUES (?,?,?,datetime('now'))`,
      ).bind(session.recommendation_id, rating.rating, rating.score),
    )
  if (complete)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,actual_score,outcome_status,consumed_at,evaluated_at) VALUES (?,?,?,?,?,'consumed',date('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),outcome_status='consumed',consumed_at=excluded.consumed_at,evaluated_at=datetime('now')`,
      ).bind(
        `outcome_${session.recommendation_id}`,
        session.recommendation_id,
        session.creator || null,
        session.content_type || null,
        rating.score,
      ),
    )
  let feedbackJobId: string | null = null
  let extractionJobId: string | null = null
  if (complete || stopped) {
    const knowledgeRequested = disposition === 'retain' || disposition === 'apply'
    feedbackJobId = id('job')
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'process_feedback',?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        feedbackJobId,
        JSON.stringify({
          recommendation_id: session.recommendation_id,
          session_id: session.id,
          note_id: reflectionNoteId,
          reflection,
          rating: rating.score,
          disposition,
          ...structured,
          review_required: true,
          feedback_context_endpoint: '/feedback/context',
          feedback_context_scope: 'all_archived_feedback_profile_and_nodes',
        }),
        `session-feedback:${session.id}`,
        session.recommendation_id,
        'explicit_user_action',
      ),
    )
    if (complete && knowledgeRequested) {
      extractionJobId = id('job')
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'extract_notes',?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
        ).bind(
          extractionJobId,
          JSON.stringify({
            recommendation_id: session.recommendation_id,
            session_id: session.id,
            thread_id: session.thread_id || null,
            reflection_note_id: reflectionNoteId,
            reflection,
            rating: rating.score,
            disposition,
            source_url: session.video_url || null,
            handwritten_annotations_are_reflection: true,
            output_contract: 'source_note_v2',
          }),
          `session-extract:${session.id}`,
          session.recommendation_id,
          'explicit_user_action',
        ),
      )
    }
  } else if (reflection && reflectionNoteId) {
    const revision =
      Number(
        (
          await c.env.DB.prepare(`SELECT revision FROM notes WHERE id=?`)
            .bind(reflectionNoteId)
            .first<{ revision: number }>()
        )?.revision || 0,
      ) + (reflectionNoteCreated ? 0 : 1)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        id('job'),
        JSON.stringify({
          recommendation_id: session.recommendation_id,
          session_id: session.id,
          note_id: reflectionNoteId,
          reflection,
          rating: rating.score,
          ...structured,
          review_required: true,
          source: 'in_progress_reflection',
          feedback_context_endpoint: '/feedback/context',
          feedback_context_scope: 'all_archived_feedback_profile_and_nodes',
        }),
        `feedback:${reflectionNoteId}:${Math.max(1, revision)}`,
      ),
    )
  }
  await c.env.DB.batch(statements)
  let consolidation: { id: string; state: string } | null = null
  if (complete) {
    consolidation = await createConsolidationRun(c.env.DB, {
      recommendationId: session.recommendation_id,
      sessionId: session.id,
      threadId: session.thread_id || null,
      disposition,
      extractionJobId,
    })
  }
  if (complete || stopped)
    try {
      await activateWaitingRun(c.env.DB)
    } catch {}
  await recordLearningEvent(c.env.DB, {
    eventType: 'reflection_submitted',
    actorType: 'user',
    evidenceWeight: reflection ? 1 : 0.25,
    idempotencyKey: `reflection-submitted:${session.id}:${reflectionRevision || (complete ? 'completed' : 'returned')}`,
    threadId: session.thread_id || null,
    recommendationId: session.recommendation_id,
    sessionId: session.id,
    explicit: true,
    origin: 'learning_feedback',
    payload: {
      reflection: reflection || null,
      rating: rating.score,
      disposition,
      structured_feedback: structured,
      source: 'session_return',
    },
  })
  const outcome = await syncRecommendationFeedbackSignals(c.env.DB, {
    recommendationId: session.recommendation_id,
    sourceKey: `session-feedback:${session.id}`,
    threadId: session.thread_id || null,
    rating: rating.score,
    disposition: body.disposition ? disposition : null,
    completed: complete,
    reflection,
  })
  return c.json({
    ok: true,
    status: complete ? 'completed' : 'returned',
    completion_state: structured.completion_state,
    disposition,
    structured_feedback: { ...structured, score: rating.score },
    reflection_note_id: reflectionNoteId,
    reflection_note_created: reflectionNoteCreated,
    recall_eligible: false,
    srs_eligible: false,
    feedback_job_id: feedbackJobId,
    extraction_job_id: extractionJobId,
    receipt: {
      status: 'recorded',
      analysis: feedbackJobId ? 'queued' : 'not_requested',
      notes: extractionJobId ? 'queued' : 'not_requested',
      neutral: structured.reason_tags.includes('not_now'),
    },
    consolidation,
    learning_outcome: outcome,
  })
})
app.delete('/sessions/:id', async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM learning_sessions WHERE id=? AND status NOT IN ('completed')")
    .bind(c.req.param('id'))
    .run()
  if (result.meta.changes) {
    try {
      await activateWaitingRun(c.env.DB)
    } catch {}
  }
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'session not found or completed' }, 404)
})

async function hubNotes(db: D1Database, scope: { thread_id?: string; stage_id?: string }) {
  const rows = scope.thread_id
    ? await db
        .prepare(`SELECT * FROM notes WHERE thread_id=? ORDER BY updated_at DESC LIMIT 200`)
        .bind(scope.thread_id)
        .all<any>()
    : scope.stage_id
      ? await db
          .prepare(`SELECT * FROM notes WHERE stage_id=? ORDER BY updated_at DESC LIMIT 200`)
          .bind(scope.stage_id)
          .all<any>()
      : await db
          .prepare(
            `SELECT * FROM notes WHERE thread_id IS NOT NULL OR stage_id IS NOT NULL ORDER BY updated_at DESC LIMIT 200`,
          )
          .all<any>()
  const notes = rows.results || []
  if (!notes.length) return []
  const placeholders = notes.map(() => '?').join(',')
  const sections = await db
    .prepare(
      `SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${placeholders}) ORDER BY note_id,position`,
    )
    .bind(...notes.map((note: any) => note.id))
    .all<any>()
  const byNote = new Map<string, any[]>()
  for (const section of sections.results || [])
    byNote.set(section.note_id, [...(byNote.get(section.note_id) || []), section])
  return notes.map((note: any) => ({
    ...note,
    provenance: (() => {
      try {
        return JSON.parse(note.provenance_json || '[]')
      } catch {
        return []
      }
    })(),
    provenance_json: undefined,
    sections: byNote.get(note.id) || [],
  }))
}

const normalizeNoteProvenance = (value: unknown) =>
  Array.isArray(value)
    ? value
        .slice(0, 20)
        .map((item: any) => ({
          annotation_id: String(item.annotation_id || '')
            .trim()
            .slice(0, 120),
          reason: String(item.reason || '')
            .trim()
            .slice(0, 500),
          confidence: item.confidence == null ? null : Math.max(0, Math.min(1, Number(item.confidence))),
        }))
        .filter((item: any) => item.annotation_id)
    : null

async function validateNoteProvenance(
  DB: D1Database,
  provenance: Array<{ annotation_id: string }> | null,
  owner: { recommendation_id?: string | null; branch_id?: string | null; thread_id?: string | null },
) {
  if (!provenance?.length) return null
  const recommendationId = String(owner.recommendation_id || '').trim()
  if (!recommendationId)
    return {
      error: 'annotation_source_required',
      message: 'Anchored note provenance requires its canonical source.',
      status: 400 as const,
    }
  const ids = [...new Set(provenance.map((item) => item.annotation_id))]
  try {
    await Promise.all(
      ids.map((annotationId) =>
        loadSourceAnnotationEvidence(DB, annotationId, {
          recommendationId,
          branchId: owner.branch_id,
          threadId: owner.thread_id,
        }),
      ),
    )
  } catch (error) {
    if (error instanceof SourceAnnotationEvidenceError)
      return { error: error.code, message: error.message, status: error.status }
    throw error
  }
  return null
}
app.get('/notes', async (c) => {
  const kind = c.req.query('kind')
  const notes = kind
    ? await c.env.DB.prepare(
        `SELECT n.*, b.id resolved_branch_id,b.label resolved_branch_label,r.branch as rec_branch, r.content_type as rec_content_type, r.video_title as rec_title FROM notes n LEFT JOIN recommendations r ON n.recommendation_id = r.id LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes b ON b.id=COALESCE(n.branch_id,m.branch_id,r.branch) WHERE n.kind=? ORDER BY n.updated_at DESC LIMIT 200`,
      )
        .bind(kind)
        .all<any>()
    : await c.env.DB.prepare(
        `SELECT n.*, b.id resolved_branch_id,b.label resolved_branch_label,r.branch as rec_branch, r.content_type as rec_content_type, r.video_title as rec_title FROM notes n LEFT JOIN recommendations r ON n.recommendation_id = r.id LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes b ON b.id=COALESCE(n.branch_id,m.branch_id,r.branch) ORDER BY n.updated_at DESC LIMIT 200`,
      ).all<any>()
  const rows = notes.results || []
  if (!rows.length) return c.json({ notes: [] })
  const placeholders = rows.map(() => '?').join(',')
  const sections = await c.env.DB.prepare(
    `SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${placeholders}) ORDER BY note_id,position`,
  )
    .bind(...rows.map((note) => note.id))
    .all<any>()
  const byNote = new Map<string, any[]>()
  for (const section of sections.results || [])
    byNote.set(section.note_id, [...(byNote.get(section.note_id) || []), section])
  const output = rows.map((note) => ({
    ...note,
    branch_id: note.resolved_branch_id || note.branch_id || null,
    branch_label: note.resolved_branch_label || null,
    resolved_branch_id: undefined,
    resolved_branch_label: undefined,
    content_type: note.rec_content_type || null,
    source_url: note.source_url || note.rec_video_url || null,
    provenance: (() => {
      try {
        return JSON.parse(note.provenance_json || '[]')
      } catch {
        return []
      }
    })(),
    provenance_json: undefined,
    sections: byNote.get(note.id) || [],
  }))
  return c.json({ notes: output })
})
app.get('/notes/hub', async (c) => {
  const threadId = c.req.query('thread_id') || ''
  const stageId = c.req.query('stage_id') || ''
  const notes = await hubNotes(c.env.DB, { thread_id: threadId || undefined, stage_id: stageId || undefined })
  return c.json({ notes })
})
app.get('/notes/:id', async (c) => {
  const noteId = c.req.param('id')
  const note = await c.env.DB.prepare(
    `SELECT n.*, b.id resolved_branch_id,b.label resolved_branch_label,r.branch as rec_branch, r.content_type as rec_content_type, r.video_title as rec_title, r.video_url as rec_video_url, json_extract(m.source_metadata_json,'$.raw_source') as rec_source_url, COALESCE(n.thread_id,l.thread_id) as owner_thread_id FROM notes n LEFT JOIN recommendations r ON n.recommendation_id = r.id LEFT JOIN recommendation_meta m ON m.recommendation_id = n.recommendation_id LEFT JOIN tree_nodes b ON b.id=COALESCE(n.branch_id,m.branch_id,r.branch) LEFT JOIN thread_lessons l ON l.id=n.lesson_id WHERE n.id=?`,
  )
    .bind(noteId)
    .first<any>()
  if (!note) return c.json({ error: 'not found' }, 404)

  const [sections, related, units, drafts, cards] = await Promise.all([
    c.env.DB.prepare(
      `SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id=? ORDER BY position`,
    )
      .bind(noteId)
      .all<any>(),
    note.recommendation_id
      ? c.env.DB.prepare(
          `SELECT id,title,kind,status,updated_at FROM notes WHERE recommendation_id=? AND id<>? ORDER BY CASE kind WHEN 'reflection' THEN 0 WHEN 'guide' THEN 1 ELSE 2 END,updated_at DESC`,
        )
          .bind(note.recommendation_id, noteId)
          .all<any>()
      : Promise.resolve({ results: [] } as any),
    c.env.DB.prepare(
      `SELECT * FROM learning_units WHERE note_id=? AND status IN ('draft','accepted') ORDER BY created_at,id`,
    )
      .bind(noteId)
      .all<any>()
      .catch(() =>
        note.recommendation_id
          ? c.env.DB.prepare(
              `SELECT * FROM learning_units WHERE recommendation_id=? AND status NOT IN ('deleted','quarantined') ORDER BY created_at,id`,
            )
              .bind(note.recommendation_id)
              .all<any>()
          : Promise.resolve({ results: [] } as any),
      ),
    c.env.DB.prepare(
      `SELECT d.*,u.statement unit_statement,u.unit_type FROM srs_drafts d LEFT JOIN learning_units u ON u.id=d.unit_id WHERE d.note_id=? ORDER BY d.created_at DESC`,
    )
      .bind(noteId)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT card.*,u.statement unit_statement,u.unit_type FROM srs_cards card LEFT JOIN learning_units u ON u.id=card.unit_id WHERE card.note_id=? ORDER BY card.due_at,card.question`,
    )
      .bind(noteId)
      .all<any>(),
  ])

  const relatedRows = related.results || []
  const relatedSections = new Map<string, any[]>()
  if (relatedRows.length) {
    const placeholders = relatedRows.map(() => '?').join(',')
    const rows = await c.env.DB.prepare(
      `SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${placeholders}) ORDER BY note_id,position`,
    )
      .bind(...relatedRows.map((row: any) => row.id))
      .all<any>()
    for (const section of rows.results || [])
      relatedSections.set(section.note_id, [...(relatedSections.get(section.note_id) || []), section])
  }

  const unitRows = units.results || []
  const anchorsByUnit = new Map<string, any[]>()
  if (unitRows.length) {
    const placeholders = unitRows.map(() => '?').join(',')
    const rows = await c.env.DB.prepare(
      `SELECT unit_id,anchor_type,locator,excerpt FROM unit_anchors WHERE unit_id IN (${placeholders}) ORDER BY unit_id,rowid`,
    )
      .bind(...unitRows.map((row: any) => row.id))
      .all<any>()
    for (const anchor of rows.results || [])
      anchorsByUnit.set(anchor.unit_id, [...(anchorsByUnit.get(anchor.unit_id) || []), anchor])
  }
  const relationGroups = await Promise.all(
    unitRows.map((unit: any) => loadNormalizedUnitRelations(c.env.DB, unit.id)),
  ).catch(() => [])
  const relations = relationGroups.flat()
  const backlinks = relations.filter(
    (relation: any) => relation.direction === 'incoming' && relation.counterpart.note_id !== noteId,
  )

  const output = {
    ...note,
    branch_id: note.resolved_branch_id || note.branch_id || null,
    branch_label: note.resolved_branch_label || null,
    resolved_branch_id: undefined,
    resolved_branch_label: undefined,
    content_type: note.rec_content_type || null,
    source_url: note.source_url || note.rec_video_url || note.rec_source_url || null,
    provenance: (() => {
      try {
        return JSON.parse(note.provenance_json || '[]')
      } catch {
        return []
      }
    })(),
    provenance_json: undefined,
    sections: sections.results || [],
  }
  const distillation = await loadNoteDistillation(c.env.DB, noteId).catch(() => null)
  return c.json({
    note: output,
    related_notes: relatedRows.map((row: any) => ({ ...row, sections: relatedSections.get(row.id) || [] })),
    units: unitRows.map((unit: any) => ({ ...unit, anchors: anchorsByUnit.get(unit.id) || [] })),
    relations,
    backlinks,
    recall: { drafts: drafts.results || [], cards: cards.results || [] },
    distillation,
  })
})
app.post('/notes/:id/distillation/highlights', async (c) => {
  const result = await createClaimHighlight(c.env.DB, c.req.param('id'), await c.req.json<any>().catch(() => ({})))
  return 'error' in result
    ? c.json({ error: result.error }, result.status)
    : c.json({ ok: true, highlight: result }, 201)
})
app.post('/notes/:id/distillation/syntheses', async (c) => {
  const result = await appendSynthesisRevision(c.env.DB, c.req.param('id'), await c.req.json<any>().catch(() => ({})))
  return 'error' in result
    ? c.json({ error: result.error }, result.status)
    : c.json({ ok: true, synthesis: result }, 201)
})
app.post('/notes/:id/distillation/highlights/:highlightId/promote', async (c) => {
  const result = await promoteHighlightToUnit(c.env.DB, c.req.param('id'), c.req.param('highlightId'))
  return 'error' in result
    ? c.json({ error: result.error }, result.status)
    : c.json({ ok: true, unit: result }, result.duplicate ? 200 : 201)
})
app.post('/notes', async (c) => {
  const body = await c.req.json<any>()
  if (!body.title?.trim()) return c.json({ error: 'title required' }, 400)
  const threadId =
    String(body.thread_id || '')
      .trim()
      .slice(0, 120) || null
  const stageId =
    String(body.stage_id || '')
      .trim()
      .slice(0, 120) || null
  const lessonId =
    String(body.lesson_id || '')
      .trim()
      .slice(0, 120) || null
  let ownerThreadId = threadId
  if ([threadId, stageId, lessonId].filter(Boolean).length > 1)
    return c.json({ error: 'note must have exactly one learning owner' }, 400)
  if (threadId || stageId || lessonId) {
    try {
      const scope = await resolveLearningScope(
        c.env.DB,
        threadId
          ? { kind: 'thread', id: threadId }
          : stageId
            ? { kind: 'level', id: stageId }
            : { kind: 'lesson', id: lessonId! },
      )
      ownerThreadId = scope.threadId
    } catch (error: any) {
      return c.json(
        { error: error?.code || 'invalid_scope', message: error?.message || 'Invalid learning scope.' },
        400,
      )
    }
  }
  const noteId = body.id || id('note')
  const provenance = normalizeNoteProvenance(body.provenance) || []
  const provenanceError = await validateNoteProvenance(c.env.DB, provenance, {
    recommendation_id: body.recommendation_id,
    branch_id: body.branch_id,
    thread_id: ownerThreadId,
  })
  if (provenanceError)
    return c.json({ error: provenanceError.error, message: provenanceError.message }, provenanceError.status)
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO notes (id,recommendation_id,title,kind,branch_id,source_url,status,thread_id,stage_id,lesson_id,provenance_json,abstract) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      noteId,
      body.recommendation_id || null,
      body.title.trim(),
      body.kind || 'note',
      body.branch_id || null,
      body.source_url || null,
      body.status || 'draft',
      threadId,
      stageId,
      lessonId,
      JSON.stringify(provenance),
      String(body.abstract || '').trim() || null,
    ),
  ]
  for (const [index, section] of (body.sections || []).entries())
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`,
      ).bind(
        id('section'),
        noteId,
        section.section_key,
        section.label,
        section.content || '',
        section.direction || 'auto',
        index,
      ),
    )
  await c.env.DB.batch(statements)
  return c.json({ ok: true, id: noteId }, 201)
})
app.put('/notes/:id', async (c) => {
  const body = await c.req.json<any>()
  const existing = await c.env.DB.prepare(
    `SELECT n.id,n.recommendation_id,n.branch_id,COALESCE(n.thread_id,s.thread_id,l.thread_id) owner_thread_id
    FROM notes n LEFT JOIN learning_path_stages s ON s.id=n.stage_id LEFT JOIN thread_lessons l ON l.id=n.lesson_id WHERE n.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!existing) return c.json({ error: 'not found' }, 404)
  const provenance = normalizeNoteProvenance(body.provenance)
  const provenanceError = await validateNoteProvenance(c.env.DB, provenance, {
    recommendation_id: existing.recommendation_id,
    branch_id: body.branch_id || existing.branch_id,
    thread_id: existing.owner_thread_id,
  })
  if (provenanceError)
    return c.json({ error: provenanceError.error, message: provenanceError.message }, provenanceError.status)
  const statements = [
    c.env.DB.prepare(
      `UPDATE notes SET title=COALESCE(?,title),branch_id=COALESCE(?,branch_id),source_url=COALESCE(?,source_url),abstract=COALESCE(?,abstract),provenance_json=COALESCE(?,provenance_json),revision=revision+1,updated_at=datetime('now') WHERE id=?`,
    ).bind(
      body.title || null,
      body.branch_id || null,
      body.source_url || null,
      body.abstract || null,
      provenance ? JSON.stringify(provenance) : null,
      c.req.param('id'),
    ),
  ]
  if (Array.isArray(body.sections)) {
    const keys = body.sections.map((section: any) => String(section.section_key || '').trim()).filter(Boolean)
    if (keys.length)
      statements.push(
        c.env.DB.prepare(
          `DELETE FROM note_sections WHERE note_id=? AND section_key NOT IN (${keys.map(() => '?').join(',')})`,
        ).bind(c.req.param('id'), ...keys),
      )
    else statements.push(c.env.DB.prepare(`DELETE FROM note_sections WHERE note_id=?`).bind(c.req.param('id')))
    for (const [position, section] of body.sections.entries()) {
      const sectionKey = String(section.section_key || `section_${position + 1}`).slice(0, 120)
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(note_id,section_key) DO UPDATE SET label=excluded.label,content=excluded.content,direction=excluded.direction,position=excluded.position,updated_at=datetime('now')`,
        ).bind(
          `${c.req.param('id')}_${sectionKey}`,
          c.req.param('id'),
          sectionKey,
          String(section.label || 'Note').trim() || 'Note',
          section.content || '',
          section.direction || 'auto',
          position,
        ),
      )
    }
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})
app.delete('/notes/:id', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE learning_units SET note_id=NULL WHERE note_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM note_sections WHERE note_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM notes WHERE id=?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})
app.post('/notes/:id/process', async (c) => {
  const note = await c.env.DB.prepare(`SELECT * FROM notes WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!note) return c.json({ error: 'not found' }, 404)
  const recommendation = note.recommendation_id
    ? await c.env.DB.prepare(`SELECT user_score,video_url FROM recommendations WHERE id=?`)
        .bind(note.recommendation_id)
        .first<any>()
    : null
  if (note.kind !== 'reflection') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE notes SET status='processing',updated_at=datetime('now') WHERE id=?`).bind(note.id),
      c.env.DB.prepare(
        `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'extract_notes',?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        id('job'),
        JSON.stringify({
          note_id: note.id,
          recommendation_id: note.recommendation_id,
          source_url: note.source_url || recommendation?.video_url || null,
          rating: Number(recommendation?.user_score || 0),
          reprocess_note_id: note.id,
          output_contract: 'source_note_v2',
          note_language: 'en',
          preserve_source_language_quotes: true,
        }),
        `extract-reprocess:${note.id}:${note.revision}`,
      ),
    ])
    return c.json({ ok: true, status: 'processing', kind: 'source' }, 202)
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE notes SET status='processing',updated_at=datetime('now') WHERE id=?`).bind(note.id),
    c.env.DB.prepare(
      `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(
      id('job'),
      JSON.stringify({
        note_id: note.id,
        recommendation_id: note.recommendation_id,
        reflection: true,
        full_profile_update: true,
        update_all_taste_elements: true,
        review_required: true,
        source: 'reflection_button',
        feedback_context_endpoint: '/feedback/context',
        feedback_context_scope: 'all_archived_feedback_profile_and_nodes',
      }),
      `feedback:${note.id}:${note.revision}`,
    ),
  ])
  return c.json({ ok: true, status: 'processing' }, 202)
})

app.get('/srs/drafts', async (c) => {
  const threadId = String(c.req.query('thread_id') || '').trim()
  const stageId = String(c.req.query('stage_id') || '').trim()
  if (threadId && stageId) return c.json({ error: 'Choose either a Thread or a Level scope.' }, 400)
  const where = threadId ? 'WHERE d.thread_id=? AND d.stage_id IS NULL' : stageId ? 'WHERE d.stage_id=?' : ''
  const statement = c.env.DB.prepare(`
    SELECT d.*,u.statement AS unit_statement,u.unit_type,
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
      ) as branch,
      COALESCE(d.source_anchor,(SELECT locator FROM unit_anchors WHERE unit_id=d.unit_id ORDER BY rowid LIMIT 1)) AS source_anchor
    FROM srs_drafts d
    LEFT JOIN learning_units u ON u.id=d.unit_id
    ${where}
    ORDER BY d.created_at DESC
    LIMIT 200
  `)
  const rows = await (threadId || stageId ? statement.bind(threadId || stageId) : statement).all()
  return c.json({ drafts: await withRecallBranches(c.env.DB, rows.results || []) })
})
app.get('/learning/srs/cards', async (c) => {
  const threadId = String(c.req.query('thread_id') || '').trim()
  const stageId = String(c.req.query('stage_id') || '').trim()
  if (threadId && stageId) return c.json({ error: 'Choose either a Thread or a Level scope.' }, 400)
  const where = threadId ? 'WHERE c.thread_id=? AND c.stage_id IS NULL' : stageId ? 'WHERE c.stage_id=?' : ''
  const statement = c.env.DB.prepare(`
    SELECT c.*,u.statement AS unit_statement,u.unit_type,
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
      COALESCE(c.note_id, (SELECT id FROM notes WHERE recommendation_id = c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1)) as note_id,
      COALESCE(c.annotation_id,(SELECT a.annotation_id FROM unit_anchors a JOIN source_annotations sa ON sa.id=a.annotation_id AND sa.status='active' WHERE a.unit_id=c.unit_id AND a.annotation_id IS NOT NULL ORDER BY a.rowid LIMIT 1)) AS annotation_id,
      COALESCE(c.source_anchor,(SELECT locator FROM unit_anchors WHERE unit_id=c.unit_id ORDER BY rowid LIMIT 1),(SELECT quote FROM source_annotations WHERE id=c.annotation_id AND status='active' LIMIT 1)) AS source_anchor
    FROM srs_cards c
    LEFT JOIN learning_units u ON u.id=c.unit_id
    ${where}
    ORDER BY c.due_at ASC, c.topic, c.question
    LIMIT 500
  `)
  const rows = await (threadId || stageId ? statement.bind(threadId || stageId) : statement).all()
  return c.json({ cards: await withRecallBranches(c.env.DB, rows.results || []) })
})
app.delete('/learning/srs/cards/:id', async (c) => {
  const result = await c.env.DB.prepare(`DELETE FROM srs_cards WHERE id=?`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'card not found' }, 404)
})
app.put('/srs/drafts/:id', async (c) => {
  const body = await c.req.json<any>()
  const draft = await c.env.DB.prepare(`SELECT question,answer FROM srs_drafts WHERE id=?`)
    .bind(c.req.param('id'))
    .first<any>()
  if (!draft) return c.json({ error: 'draft not found' }, 404)
  const languageError = validateArabicRecall(body.question || draft.question, body.answer || draft.answer)
  if (languageError) return c.json({ error: 'recall_language_required', message: languageError }, 400)
  await c.env.DB.prepare(
    `UPDATE srs_drafts SET question=COALESCE(?,question),answer=COALESCE(?,answer),topic=COALESCE(?,topic),branch=COALESCE(?,branch),card_type=COALESCE(?,card_type),source_anchor=COALESCE(?,source_anchor),updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      body.question || null,
      body.answer || null,
      body.topic || null,
      body.branch || null,
      body.card_type || null,
      body.source_anchor || null,
      c.req.param('id'),
    )
    .run()
  return c.json({ ok: true })
})
app.post('/srs/drafts/:id/approve', async (c) => {
  const draft = await c.env.DB.prepare(`SELECT * FROM srs_drafts WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!draft) return c.json({ error: 'not found' }, 404)
  const languageError = validateArabicRecall(draft.question, draft.answer)
  if (languageError) return c.json({ error: 'recall_language_required', message: languageError }, 400)
  const approved = await c.env.DB.prepare(
    `UPDATE srs_drafts SET status='approved',updated_at=datetime('now') WHERE id=? AND status='draft'`,
  )
    .bind(draft.id)
    .run()
  if (!approved.meta.changes) return c.json({ error: 'draft already processed' }, 409)
  await c.env.DB.prepare(
    `INSERT INTO srs_cards (id,recommendation_id,note_id,question,answer,topic,branch,due_at,unit_id,thread_id,stage_id,scheduler_version,card_type,source_anchor) VALUES (?,?,?,?,?,?,?,date('now'),?,?,?,'fsrs-6-ts-fsrs-5.4.1',?,?)`,
  )
    .bind(
      id('card'),
      draft.recommendation_id,
      draft.note_id || null,
      draft.question,
      draft.answer,
      draft.topic,
      draft.branch || null,
      draft.unit_id || null,
      draft.thread_id || null,
      draft.stage_id || null,
      draft.card_type || null,
      draft.source_anchor || null,
    )
    .run()
  return c.json({ ok: true })
})
app.post('/srs/drafts/:id/reject', async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE srs_drafts SET status='rejected',updated_at=datetime('now') WHERE id=? AND status='draft'`,
  )
    .bind(c.req.param('id'))
    .run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'draft not found' }, 404)
})
app.delete('/srs/drafts/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM srs_drafts WHERE id=?').bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'draft not found' }, 404)
})

app.get('/feedback/proposals', async (c) => {
  const status = c.req.query('status')
  const rows = status
    ? await c.env.DB.prepare(
        `SELECT fp.*,r.video_title FROM feedback_proposals fp LEFT JOIN recommendations r ON r.id=fp.recommendation_id WHERE fp.status=? ORDER BY fp.created_at DESC LIMIT 200`,
      )
        .bind(status)
        .all<any>()
    : await c.env.DB.prepare(
        `SELECT fp.*,r.video_title FROM feedback_proposals fp LEFT JOIN recommendations r ON r.id=fp.recommendation_id ORDER BY fp.created_at DESC LIMIT 200`,
      ).all<any>()
  return c.json({
    proposals: (rows.results || []).map((row) => ({
      ...row,
      current: row.current_json ? JSON.parse(row.current_json) : null,
      proposed: JSON.parse(row.proposed_json),
      evidence_items: (() => {
        try {
          return JSON.parse(row.evidence_json || '[]')
        } catch {
          return []
        }
      })(),
      validation: (() => {
        try {
          return JSON.parse(row.validation_json || '{}')
        } catch {
          return {}
        }
      })(),
      deployment: (() => {
        try {
          return JSON.parse(row.deployment_json || '{}')
        } catch {
          return {}
        }
      })(),
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
  if (!result.ok)
    return c.json(
      result,
      result.error === 'pending_proposal_not_found' ? 404 : result.error === 'unsupported_proposal_type' ? 422 : 409,
    )
  return c.json({ ...result, applied_immediately: true })
})
app.post('/feedback/proposals/:id/apply', async (c) => {
  const result = await applyFeedbackProposal(c.env.DB, c.req.param('id'), 'hermes_auto')
  if (!result.ok)
    return c.json(
      result,
      result.error === 'pending_proposal_not_found' ? 404 : result.error === 'unsupported_proposal_type' ? 422 : 409,
    )
  return c.json({ ...result, applied_immediately: true })
})
app.post('/feedback/proposals/:id/revert', async (c) => {
  const result = await revertFeedbackProposal(c.env.DB, c.req.param('id'), 'user')
  return result.ok ? c.json(result) : c.json(result, 404)
})
app.post('/feedback/proposals/:id/reject', async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE feedback_proposals SET status='rejected',reviewed_at=datetime('now') WHERE id=? AND status='pending'`,
  )
    .bind(c.req.param('id'))
    .run()
  return result.meta.changes
    ? c.json({ ok: true, status: 'rejected' })
    : c.json({ error: 'pending proposal not found' }, 404)
})

app.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT setting_key,value_json,updated_at FROM user_settings`).all<any>()
  const settings: Record<string, unknown> = {}
  for (const row of rows.results || []) {
    try {
      settings[row.setting_key] = JSON.parse(row.value_json)
    } catch {
      settings[row.setting_key] = row.value_json
    }
  }
  return c.json({ settings, resolved: await loadSettings(c.env.DB), defaults: defaultSettings })
})
app.put('/settings/:key', async (c) => {
  try {
    const key = c.req.param('key') as keyof TasteMapSettings
    if (
      ![
        'appearance',
        'learning',
        'srs_drafts',
        'ai_curation',
        'profile_proposals',
        'profile_automation',
        'recommendation_engine',
        'delivery_context',
        'atlas',
      ].includes(key)
    )
      return c.json({ error: 'unknown settings key' }, 400)
    const current = await loadSettings(c.env.DB)
    const value = await c.req.json<any>()
    if (key === 'recommendation_engine' && value?.mode && value.mode !== current.recommendation_engine.mode) {
      return c.json(
        {
          error: 'engine_rollout_managed',
          message:
            'Use /analytics/hermes/engine/activate or /analytics/hermes/engine/rollback so rollout gates and receipts cannot be bypassed.',
          current: current.recommendation_engine,
        },
        409,
      )
    }
    const resolved = normalizeSettings({
      ...current,
      [key]: {
        ...(current[key] as Record<string, unknown>),
        ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
      },
    })
    await c.env.DB.prepare(
      `INSERT INTO user_settings (setting_key,value_json) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`,
    )
      .bind(key, JSON.stringify(resolved[key]))
      .run()
    return c.json({ ok: true, key, value: resolved[key], resolved })
  } catch (error) {
    return c.json(safeError('Settings update failed')(error), 500)
  }
})

export default app
