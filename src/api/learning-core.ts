import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import {
  completedLearningStatus,
  deriveLevelStatus,
  deriveThreadStatus,
  recordLearningEvent,
} from '../services/learning-core'
import { selectLearningSourceRenditions } from '../services/learning-material-renditions'
import { loadNotebookLearningStates, summarizeNotebookLearningState } from '../services/notebooklm-learning'
import { loadThreadLearningMaterials } from '../services/learning-scope'
import { chunkForD1 } from '../services/d1-query.ts'
import { loadIntegrityHealth } from '../services/operational-health'
import { cached, invalidate } from '../cache'
import { loadContradictionRelations, loadNormalizedUnitRelations } from '../services/cross-branch-bridges'

const app = new Hono<{ Bindings: Bindings }>()
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const clean = (value: unknown, max = 4000) =>
  String(value || '')
    .trim()
    .slice(0, max)
const threadTypes = new Set(['understand', 'decide', 'build', 'practice'])
const unitTypes = new Set(['claim', 'concept', 'method', 'example', 'question', 'application', 'counterclaim'])
const COMPLETED_STORAGE_STATUS = 'verified'
const completedStage = completedLearningStatus
const publicStatus = (status: unknown) =>
  completedStage(status) || status === 'ready_to_verify' ? 'completed' : status
const publicThread = (thread: any) => ({
  ...thread,
  status: publicStatus(thread.status),
  evidence_requirements_json: undefined,
})

const keepSupersededThreadsReadOnly = async (c: any, next: () => Promise<void>) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
  const thread = (await c.env.DB.prepare(
    `SELECT superseded_by_type,superseded_by_id,superseded_at FROM learning_threads WHERE id=?`,
  )
    .bind(c.req.param('id'))
    .first()) as { superseded_at?: string; superseded_by_type?: string; superseded_by_id?: string } | null
  if (thread?.superseded_at)
    return c.json(
      {
        error: 'learning_thread_superseded',
        message: 'This Learning Thread is preserved read-only because its work moved to a dedicated product object.',
        superseded_by: { type: thread.superseded_by_type, id: thread.superseded_by_id },
      },
      409,
    )
  return next()
}

app.use('/threads/:id', keepSupersededThreadsReadOnly)
app.use('/threads/:id/*', keepSupersededThreadsReadOnly)

app.use('*', async (c, next) => {
  await next()
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method) && c.res.status < 400) {
    invalidate('learning.')
  }
})

async function syncPathStatuses(db: any, threadId: string) {
  const stages = await db
    .prepare(`SELECT id,status,position FROM learning_path_stages WHERE thread_id=? ORDER BY position`)
    .bind(threadId)
    .all()
  let priorComplete = true
  for (const stage of stages.results || []) {
    const lessons: any = await db
      .prepare(
        `SELECT COUNT(*) total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM thread_lessons WHERE stage_id=?`,
      )
      .bind(stage.id)
      .first()
    const totalLessons = Number(lessons?.total || 0)
    const completedLessons = Number(lessons?.completed || 0)
    const current = String(stage.status || 'locked')
    const next = deriveLevelStatus({ priorComplete, totalLessons, completedLessons, currentStatus: current })
    if (next !== current)
      await db
        .prepare(`UPDATE learning_path_stages SET status=?,updated_at=datetime('now') WHERE id=?`)
        .bind(next, stage.id)
        .run()
    priorComplete = completedStage(next)
  }
  const remaining: any = await db
    .prepare(
      `SELECT COUNT(*) count FROM learning_path_stages WHERE thread_id=? AND status NOT IN ('verified','waived')`,
    )
    .bind(threadId)
    .first()
  const thread: any = await db.prepare(`SELECT status FROM learning_threads WHERE id=?`).bind(threadId).first()
  if (thread) {
    const complete = (stages.results || []).length > 0 && Number(remaining?.count || 0) === 0
    const next = deriveThreadStatus(String(thread.status || ''), complete)
    if (next !== thread.status)
      await db
        .prepare(
          `UPDATE learning_threads SET status=?,completed_at=CASE WHEN ?=? THEN COALESCE(completed_at,datetime('now')) ELSE NULL END,verified_at=CASE WHEN ?=? THEN verified_at ELSE NULL END,updated_at=datetime('now') WHERE id=?`,
        )
        .bind(next, next, COMPLETED_STORAGE_STATUS, next, COMPLETED_STORAGE_STATUS, threadId)
        .run()
  }
}

app.get('/integrity/health', async (c) => {
  const health = await loadIntegrityHealth(c.env.DB)
  return c.json(health, health.ok ? 200 : 503)
})

app.get('/threads', async (c) => {
  const status = c.req.query('status')
  const key = `learning.threads.${status || 'all'}`
  const data = await cached(key, 15000, async () => {
    const rows = status
      ? await c.env.DB.prepare(
          `SELECT * FROM learning_threads WHERE status=? AND superseded_at IS NULL ORDER BY priority DESC,updated_at DESC`,
        )
          .bind(status)
          .all<any>()
      : await c.env.DB.prepare(
          `SELECT * FROM learning_threads WHERE superseded_at IS NULL ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'ready_to_verify' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,priority DESC,updated_at DESC`,
        ).all<any>()
    return { threads: (rows.results || []).map(publicThread) }
  })
  c.header('Cache-Control', 'private, max-age=15, stale-while-revalidate=30')
  return c.json(data)
})

app.get('/hub', async (c) => {
  const data = await cached('learning.hub', 15000, async () => {
    const rows = await c.env.DB.prepare(
      `SELECT t.*,
      (SELECT COUNT(*) FROM learning_path_stages s WHERE s.thread_id=t.id) stage_count,
      (SELECT COUNT(*) FROM learning_path_stages s WHERE s.thread_id=t.id AND s.status IN ('verified','waived')) completed_stage_count,
      (SELECT s.title FROM learning_path_stages s WHERE s.thread_id=t.id AND s.status IN ('available','in_progress','evidence_pending','ready_to_verify') ORDER BY s.position LIMIT 1) current_stage_title,
      (SELECT s.status FROM learning_path_stages s WHERE s.thread_id=t.id AND s.status IN ('available','in_progress','evidence_pending','ready_to_verify') ORDER BY s.position LIMIT 1) current_stage_status,
      (SELECT COUNT(*) FROM thread_lessons l WHERE l.thread_id=t.id) lesson_count,
      (SELECT COUNT(*) FROM thread_lessons l WHERE l.thread_id=t.id AND l.status='completed') completed_lesson_count,
      (SELECT COUNT(*) FROM thread_lessons l WHERE l.thread_id=t.id AND COALESCE(NULLIF(TRIM(l.content),''),'')='' AND NOT EXISTS (SELECT 1 FROM thread_lesson_sources ls WHERE ls.lesson_id=l.id)) needs_material_count
      FROM learning_threads t WHERE t.superseded_at IS NULL ORDER BY CASE t.status WHEN 'active' THEN 0 WHEN 'ready_to_verify' THEN 1 WHEN 'paused' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,t.priority DESC,t.updated_at DESC`,
    ).all<any>()
    return {
      paths: (rows.results || []).map((row: any) => ({
        ...publicThread(row),
        current_stage_status: publicStatus(row.current_stage_status),
        stage_count: Number(row.stage_count || 0),
        completed_stage_count: Number(row.completed_stage_count || 0),
        lesson_count: Number(row.lesson_count || 0),
        completed_lesson_count: Number(row.completed_lesson_count || 0),
        needs_material_count: Number(row.needs_material_count || 0),
      })),
    }
  })
  c.header('Cache-Control', 'private, max-age=15, stale-while-revalidate=30')
  return c.json(data)
})

app.get('/threads/:id/path', async (c) => {
  const thread = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`)
    .bind(c.req.param('id'))
    .first<any>()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const [stages, items, sources, lessons, lessonSources, projects, materials] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM learning_path_stages WHERE thread_id=? ORDER BY position`)
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT i.* FROM learning_path_items i JOIN learning_path_stages s ON s.id=i.stage_id WHERE s.thread_id=? ORDER BY s.position,i.position`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT ps.*,r.video_title,r.creator,r.content_type,r.video_url,r.notebook_url,m.learning_state,m.branch_id,COALESCE(n.label,r.branch) branch_label,n.status branch_status FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id JOIN recommendations r ON r.id=ps.recommendation_id LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id WHERE s.thread_id=? ORDER BY s.position,ps.position`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(`SELECT * FROM thread_lessons WHERE thread_id=? ORDER BY stage_id,position`)
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT ls.*,r.video_title,r.creator,r.content_type,r.video_url,r.notebook_url,m.learning_state,m.branch_id,COALESCE(n.label,r.branch) branch_label,n.status branch_status FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id JOIN recommendations r ON r.id=ls.recommendation_id LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id WHERE l.thread_id=? ORDER BY l.stage_id,l.position,ls.position`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT * FROM thread_projects WHERE thread_id=? ORDER BY CASE WHEN type='level' THEN 0 ELSE 1 END,created_at`,
    )
      .bind(thread.id)
      .all<any>(),
    loadThreadLearningMaterials(c.env.DB, thread.id),
  ])
  const recIds = [
    ...new Set(
      [...(sources.results || []), ...(lessonSources.results || [])]
        .map((s: any) => s.recommendation_id)
        .filter(Boolean),
    ),
  ]
  let artifactsByRec = new Map<string, { html?: any; pdf?: any }>()
  let notebookLearningByRec = new Map<string, any>()
  if (recIds.length) {
    const [artifactBatches, notebookStates] = await Promise.all([
      Promise.all(
        chunkForD1(recIds).map((batch) => {
          const artifactMatches = batch.map(() => '?').join(',')
          return c.env.DB.prepare(
            `SELECT id,filename,media_type,size_bytes,created_at,metadata_json FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id') IN (${artifactMatches}) AND COALESCE(json_extract(metadata_json,'$.scope'),'')!='book' ORDER BY rowid DESC`,
          )
            .bind(...batch)
            .all<any>()
        }),
      ),
      loadNotebookLearningStates(c.env.DB, [...(sources.results || []), ...(lessonSources.results || [])]),
    ])
    artifactsByRec = selectLearningSourceRenditions(artifactBatches.flatMap((batch) => batch.results || []))
    notebookLearningByRec = notebookStates
  }
  const attachLearningMaterials = (source: any) => {
    const notebookState = notebookLearningByRec.get(source.recommendation_id)
    return {
      ...source,
      artifacts: artifactsByRec.get(source.recommendation_id) || {},
      ...(source.notebook_url
        ? { notebook_learning: notebookState ? summarizeNotebookLearningState(notebookState) : null }
        : {}),
    }
  }
  const stageRows = (stages.results || []).map((stage: any) => {
    const stageItems = (items.results || []).filter((item: any) => item.stage_id === stage.id)
    const stageSources = (sources.results || [])
      .filter((source: any) => source.stage_id === stage.id)
      .map(attachLearningMaterials)
    const stageLessons = (lessons.results || [])
      .filter((lesson: any) => lesson.stage_id === stage.id)
      .map((lesson: any) => ({
        ...lesson,
        sources: (lessonSources.results || [])
          .filter((source: any) => source.lesson_id === lesson.id)
          .map(attachLearningMaterials),
        notes: materials.lessons.get(lesson.id)?.notes || [],
        files: materials.lessons.get(lesson.id)?.files || [],
        cards: materials.lessons.get(lesson.id)?.cards || [],
        recall_drafts: materials.lessons.get(lesson.id)?.drafts || [],
      }))
    const stageProjects = (projects.results || []).filter((project: any) => project.stage_id === stage.id)
    const completedLessons = stageLessons.filter((lesson: any) => lesson.status === 'completed').length
    const totalLessons = stageLessons.length
    const requiredProjects = stageProjects.filter((project: any) => project.type === 'level')
    const completedProjects = requiredProjects.filter((project: any) =>
      ['completed', 'deferred'].includes(project.status),
    ).length
    const nextItem = stageLessons.find((lesson: any) => lesson.status !== 'completed')
    return {
      ...stage,
      status: publicStatus(stage.status),
      items: stageItems,
      lessons: stageLessons,
      projects: stageProjects,
      sources: stageSources,
      notes: materials.levels.get(stage.id)?.notes || [],
      files: materials.levels.get(stage.id)?.files || [],
      cards: materials.levels.get(stage.id)?.cards || [],
      recall_drafts: materials.levels.get(stage.id)?.drafts || [],
      progress: {
        completed: completedLessons,
        total: totalLessons,
        study_completed: completedLessons,
        study_total: totalLessons,
        project_completed: completedProjects,
        project_total: requiredProjects.length,
      },
      next_action:
        stage.status === 'locked'
          ? {
              kind: 'none',
              stage_id: stage.id,
              label: 'Level locked',
              reason: 'Complete the previous Level to unlock this one.',
            }
          : stage.status === 'available'
            ? { kind: 'start', stage_id: stage.id, label: 'Start level' }
            : completedStage(stage.status) || stage.status === 'ready_to_verify'
              ? { kind: 'none', stage_id: stage.id, label: 'Level completed' }
              : nextItem
                ? {
                    kind: 'lesson',
                    stage_id: stage.id,
                    lesson_id: nextItem.id,
                    label: `${nextItem.status === 'in_progress' ? 'Continue' : 'Study'}: ${nextItem.title}`,
                  }
                : { kind: 'none', stage_id: stage.id, label: 'No next lesson' },
    }
  })
  const current =
    stageRows.find((stage: any) => ['available', 'in_progress'].includes(stage.status)) ||
    stageRows.find((stage: any) => stage.status === 'locked') ||
    stageRows[stageRows.length - 1] ||
    null
  return c.json({
    thread: publicThread(thread),
    stages: stageRows,
    projects: projects.results || [],
    current_stage: current,
    notes: materials.thread.notes,
    files: materials.thread.files,
    cards: materials.thread.cards,
    recall_drafts: materials.thread.drafts,
  })
})

app.post('/threads/:id/stages/:stageId/lessons', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const stage = await c.env.DB.prepare(`SELECT id FROM learning_path_stages WHERE id=? AND thread_id=?`)
    .bind(c.req.param('stageId'), c.req.param('id'))
    .first()
  const title = clean(body.title, 500)
  if (!stage || !title) return c.json({ error: 'stage and title required' }, 400)
  const legacyItemId = clean(body.legacy_item_id, 120) || null
  if (legacyItemId) {
    const item = await c.env.DB.prepare(`SELECT id FROM learning_path_items WHERE id=? AND stage_id=?`)
      .bind(legacyItemId, c.req.param('stageId'))
      .first()
    if (!item) return c.json({ error: 'legacy item does not belong to this level' }, 400)
    const existing = await c.env.DB.prepare(`SELECT id FROM thread_lessons WHERE legacy_item_id=?`)
      .bind(legacyItemId)
      .first<any>()
    if (existing) return c.json({ ok: true, id: existing.id, duplicate: true })
  }
  const position = Math.max(0, Number(body.position || 0))
  const occupied = await c.env.DB.prepare(`SELECT id FROM thread_lessons WHERE stage_id=? AND position=?`)
    .bind(c.req.param('stageId'), position)
    .first()
  if (occupied) return c.json({ error: 'lesson position already exists' }, 409)
  const id = makeId('lesson')
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO thread_lessons (id,thread_id,stage_id,position,title,description,objective,content,estimated_minutes,status,legacy_item_id,why_learn,why_now,takeaway) VALUES (?,?,?,?,?,?,?,?,?,'not_started',?,?,?,?)`,
    ).bind(
      id,
      c.req.param('id'),
      c.req.param('stageId'),
      position,
      title,
      clean(body.description, 4000) || null,
      clean(body.objective, 2000) || null,
      clean(body.content, 12000) || null,
      body.estimated_minutes == null ? null : Math.max(1, Math.min(600, Number(body.estimated_minutes))),
      legacyItemId,
      clean(body.why_learn, 4000) || null,
      clean(body.why_now, 4000) || null,
      clean(body.takeaway, 4000) || null,
    ),
    c.env.DB.prepare(
      `UPDATE learning_path_stages SET progress_model='course',updated_at=datetime('now') WHERE id=?`,
    ).bind(c.req.param('stageId')),
  ])
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true, id, status: 'not_started' }, 201)
})

app.patch('/threads/:id/lessons/:lessonId', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const lesson = await c.env.DB.prepare(
    `SELECT l.*,s.status stage_status FROM thread_lessons l JOIN learning_path_stages s ON s.id=l.stage_id WHERE l.id=? AND l.thread_id=?`,
  )
    .bind(c.req.param('lessonId'), c.req.param('id'))
    .first<any>()
  if (!lesson) return c.json({ error: 'lesson not found' }, 404)
  const status = ['not_started', 'in_progress', 'completed'].includes(body.status) ? body.status : null
  if (!status) return c.json({ error: 'invalid lesson status' }, 400)
  if (lesson.stage_status === 'locked')
    return c.json({ error: 'level is locked; complete the previous Level first' }, 409)
  if (lesson.stage_status === 'available') return c.json({ error: 'start the level before updating its lessons' }, 409)
  if (completedStage(lesson.stage_status) && status === 'completed')
    return c.json({ error: 'completed Levels are read-only unless a lesson is explicitly reopened' }, 409)
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE thread_lessons SET status=?,why_learn=COALESCE(?,why_learn),why_now=COALESCE(?,why_now),takeaway=COALESCE(?,takeaway),content=COALESCE(?,content),updated_at=datetime('now') WHERE id=?`,
    ).bind(
      status,
      body.why_learn || null,
      body.why_now || null,
      body.takeaway || null,
      body.content || null,
      lesson.id,
    ),
  ]
  if (lesson.legacy_item_id)
    statements.push(
      c.env.DB.prepare(
        `UPDATE learning_path_items SET status=CASE WHEN ?='completed' THEN 'satisfied' WHEN ? IN ('not_started','in_progress') AND status='satisfied' THEN 'open' ELSE status END,updated_at=datetime('now') WHERE id=?`,
      ).bind(status, status, lesson.legacy_item_id),
    )
  await c.env.DB.batch(statements)
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true, id: lesson.id, status, legacy_item_id: lesson.legacy_item_id || null })
})

app.post('/threads/:id/lessons/:lessonId/sources', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const lesson = await c.env.DB.prepare(`SELECT id,stage_id FROM thread_lessons WHERE id=? AND thread_id=?`)
    .bind(c.req.param('lessonId'), c.req.param('id'))
    .first<any>()
  const source = await c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=?`)
    .bind(body.recommendation_id)
    .first()
  const branch = body.branch_id
    ? await c.env.DB.prepare(`SELECT id,label,status FROM tree_nodes WHERE id=? AND type IN ('branch','leaf')`)
        .bind(body.branch_id)
        .first<any>()
    : null
  if (!lesson || !source) return c.json({ error: 'lesson and source required' }, 400)
  if (!branch || branch.status === 'pruned') return c.json({ error: 'valid non-pruned branch_id required' }, 400)
  const role = ['primary', 'case', 'challenge', 'reference', 'optional'].includes(body.role) ? body.role : 'primary'
  await c.env.DB.batch([
    c.env.DB.prepare(
      `DELETE FROM thread_lesson_sources WHERE lesson_id=? AND role=? AND recommendation_id<>? AND ?!='optional'`,
    ).bind(c.req.param('lessonId'), role, body.recommendation_id, role),
    c.env.DB.prepare(
      `INSERT OR REPLACE INTO thread_lesson_sources (lesson_id,recommendation_id,role,position) VALUES (?,?,?,?)`,
    ).bind(c.req.param('lessonId'), body.recommendation_id, role, Math.max(0, Number(body.position || 0))),
    c.env.DB.prepare(
      `INSERT INTO recommendation_meta (recommendation_id,learning_state,branch_id,source_metadata_json,updated_at)
      VALUES (?,'attached',?,'{}',datetime('now'))
      ON CONFLICT(recommendation_id) DO UPDATE SET
        branch_id=excluded.branch_id,
        learning_state=CASE WHEN recommendation_meta.learning_state='captured' THEN 'attached' ELSE recommendation_meta.learning_state END,
        updated_at=datetime('now')`,
    ).bind(body.recommendation_id, branch.id),
  ])
  return c.json({ ok: true, lesson_id: lesson.id, recommendation_id: body.recommendation_id, role, branch }, 201)
})

app.patch('/threads/:id/projects/:projectId', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const project = await c.env.DB.prepare(`SELECT * FROM thread_projects WHERE id=? AND thread_id=?`)
    .bind(c.req.param('projectId'), c.req.param('id'))
    .first<any>()
  if (!project) return c.json({ error: 'project not found' }, 404)
  if (project.stage_id) {
    const stage = await c.env.DB.prepare(`SELECT status FROM learning_path_stages WHERE id=?`)
      .bind(project.stage_id)
      .first<any>()
    if (!stage || stage.status === 'locked')
      return c.json({ error: 'level is locked; complete the previous Level first' }, 409)
    if (stage.status === 'available') return c.json({ error: 'start the level before updating its project' }, 409)
  }
  const status = ['not_started', 'in_progress', 'completed', 'deferred'].includes(body.status) ? body.status : null
  if (!status) return c.json({ error: 'invalid project status' }, 400)
  await c.env.DB.prepare(
    `UPDATE thread_projects SET status=?,started_at=CASE WHEN ?='in_progress' AND started_at IS NULL THEN datetime('now') ELSE started_at END,completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE completed_at END,updated_at=datetime('now') WHERE id=?`,
  )
    .bind(status, status, status, project.id)
    .run()
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true, id: project.id, status })
})

app.post('/threads/:id/stages', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const thread = await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first()
  const title = clean(body.title, 240)
  if (!thread || !title) return c.json({ error: 'thread and title required' }, 400)
  const position = Math.max(0, Number(body.position ?? 0))
  const id = makeId('stage')
  await c.env.DB.prepare(
    `INSERT INTO learning_path_stages (id,thread_id,position,title,objective,description,stage_type,output_description,unlock_policy_json) VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      c.req.param('id'),
      position,
      title,
      clean(body.objective, 2000) || null,
      clean(body.description, 8000) || null,
      ['orientation', 'curriculum', 'application', 'advanced'].includes(body.stage_type)
        ? body.stage_type
        : 'curriculum',
      clean(body.output_description, 4000) || null,
      JSON.stringify(body.unlock_policy && typeof body.unlock_policy === 'object' ? body.unlock_policy : {}),
    )
    .run()
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true, id }, 201)
})

app.post('/threads/:id/stages/:stageId/start', async (c) => {
  const stage = await c.env.DB.prepare(`SELECT * FROM learning_path_stages WHERE id=? AND thread_id=?`)
    .bind(c.req.param('stageId'), c.req.param('id'))
    .first<any>()
  if (!stage) return c.json({ error: 'stage not found' }, 404)
  if (!['available', 'in_progress'].includes(stage.status))
    return c.json({ error: 'stage is not available to start' }, 409)
  await c.env.DB.prepare(`UPDATE learning_path_stages SET status='in_progress',updated_at=datetime('now') WHERE id=?`)
    .bind(stage.id)
    .run()
  return c.json({ ok: true, status: 'in_progress' })
})

app.patch('/threads/:id/stages/:stageId', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const stage = await c.env.DB.prepare(`SELECT * FROM learning_path_stages WHERE id=? AND thread_id=?`)
    .bind(c.req.param('stageId'), c.req.param('id'))
    .first<any>()
  if (!stage) return c.json({ error: 'stage not found' }, 404)
  if (body.status !== undefined) return c.json({ error: 'stage_status_is_lifecycle_managed' }, 409)
  await c.env.DB.prepare(
    `UPDATE learning_path_stages SET position=?,title=?,objective=?,description=?,stage_type=?,output_description=?,updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      body.position === undefined ? stage.position : Math.max(0, Number(body.position)),
      body.title === undefined ? stage.title : clean(body.title, 240),
      body.objective === undefined ? stage.objective : clean(body.objective, 2000) || null,
      body.description === undefined ? stage.description : clean(body.description, 8000) || null,
      body.stage_type === undefined ? stage.stage_type : body.stage_type,
      body.output_description === undefined ? stage.output_description : clean(body.output_description, 4000) || null,
      stage.id,
    )
    .run()
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true })
})

app.post('/threads/:id/stages/:stageId/items', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const stage = await c.env.DB.prepare(`SELECT id FROM learning_path_stages WHERE id=? AND thread_id=?`)
    .bind(c.req.param('stageId'), c.req.param('id'))
    .first()
  const title = clean(body.title, 500)
  if (!stage || !title) return c.json({ error: 'stage and title required' }, 400)
  const type = [
    'concept',
    'source_role',
    'companion',
    'recall_prompt',
    'exercise',
    'application',
    'reflection',
  ].includes(body.item_type)
    ? body.item_type
    : 'concept'
  const id = makeId('path_item')
  await c.env.DB.prepare(
    `INSERT INTO learning_path_items (id,stage_id,position,item_type,title,description,required,evidence_type) VALUES (?,?,?,?,?,?,0,NULL)`,
  )
    .bind(id, stage.id, Math.max(0, Number(body.position || 0)), type, title, clean(body.description, 4000) || null)
    .run()
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true, id }, 201)
})

app.patch('/threads/:id/stages/:stageId/items/:itemId', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const item = await c.env.DB.prepare(
    `SELECT i.* FROM learning_path_items i JOIN learning_path_stages s ON s.id=i.stage_id WHERE i.id=? AND i.stage_id=? AND s.thread_id=?`,
  )
    .bind(c.req.param('itemId'), c.req.param('stageId'), c.req.param('id'))
    .first<any>()
  if (!item) return c.json({ error: 'stage item not found' }, 404)
  await c.env.DB.prepare(
    `UPDATE learning_path_items SET position=?,title=?,description=?,required=0,evidence_type=NULL,updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      body.position === undefined ? item.position : Math.max(0, Number(body.position)),
      body.title === undefined ? item.title : clean(body.title, 500),
      body.description === undefined ? item.description : clean(body.description, 4000) || null,
      item.id,
    )
    .run()
  await syncPathStatuses(c.env.DB, c.req.param('id'))
  return c.json({ ok: true, id: item.id })
})

app.post('/threads/:id/stages/:stageId/sources', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const [stage, source] = await Promise.all([
    c.env.DB.prepare(`SELECT id FROM learning_path_stages WHERE id=? AND thread_id=?`)
      .bind(c.req.param('stageId'), c.req.param('id'))
      .first(),
    c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=? AND deleted_at IS NULL`)
      .bind(clean(body.recommendation_id, 120))
      .first(),
  ])
  if (!stage || !source) return c.json({ error: 'stage or source not found' }, 404)
  const role = ['foundation', 'case', 'companion', 'counterevidence', 'reference'].includes(body.role)
    ? body.role
    : 'reference'
  await c.env.DB.prepare(
    `INSERT INTO learning_path_sources (stage_id,recommendation_id,role,required,expected_contribution,position) VALUES (?,?,?,?,?,?) ON CONFLICT(stage_id,recommendation_id) DO UPDATE SET role=excluded.role,required=excluded.required,expected_contribution=excluded.expected_contribution,position=excluded.position`,
  )
    .bind(
      c.req.param('stageId'),
      clean(body.recommendation_id, 120),
      role,
      body.required === true ? 1 : 0,
      clean(body.expected_contribution, 1000) || null,
      Math.max(0, Number(body.position || 0)),
    )
    .run()
  return c.json({ ok: true })
})

app.post('/threads', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const title = clean(body.title, 160)
  const guidingQuestion = clean(body.guiding_question, 1000)
  const definition = clean(body.definition_of_done, 2000)
  const type = clean(body.thread_type, 20)
  if (!title || !guidingQuestion || !definition || !threadTypes.has(type))
    return c.json({ error: 'title, valid thread_type, guiding_question, and definition_of_done required' }, 400)
  const id = makeId('thread')
  const status = body.activate === true ? 'active' : 'draft'
  await c.env.DB.prepare(
    `INSERT INTO learning_threads (id,title,thread_type,guiding_question,why_now,definition_of_done,evidence_requirements_json,status,started_at,priority) VALUES (?,?,?,?,?,?,'[]',?,CASE WHEN ?='active' THEN datetime('now') END,?)`,
  )
    .bind(
      id,
      title,
      type,
      guidingQuestion,
      clean(body.why_now, 2000) || null,
      definition,
      status,
      status,
      Number(body.priority || 0),
    )
    .run()
  await recordLearningEvent(c.env.DB, {
    eventType: 'thread_created',
    actorType: 'user',
    idempotencyKey: `thread-created:${id}`,
    threadId: id,
    payload: { type, status },
  })
  return c.json({ ok: true, id, status }, 201)
})

app.get('/threads/:id', async (c) => {
  const thread = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`)
    .bind(c.req.param('id'))
    .first<any>()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const [sources, units, relations] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ts.*,r.video_title,r.creator,r.content_type,r.video_url,m.learning_state FROM thread_sources ts JOIN recommendations r ON r.id=ts.recommendation_id LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE ts.thread_id=? AND ts.status!='removed' ORDER BY ts.position,r.created_at`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT u.*,tu.role,tu.importance FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? ORDER BY tu.position,u.updated_at DESC`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT ur.* FROM unit_relations ur WHERE ur.source_unit_id IN (SELECT unit_id FROM thread_units WHERE thread_id=?) OR ur.target_unit_id IN (SELECT unit_id FROM thread_units WHERE thread_id=?) ORDER BY ur.created_at DESC`,
    )
      .bind(thread.id, thread.id)
      .all<any>(),
  ])
  return c.json({
    thread: publicThread(thread),
    sources: sources.results || [],
    units: units.results || [],
    relations: relations.results || [],
  })
})

app.get('/threads/:id/export', async (c) => {
  const thread = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`)
    .bind(c.req.param('id'))
    .first<any>()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const [sources, units, anchors] = await Promise.all([
    c.env.DB.prepare(
      `SELECT r.video_title,r.creator,r.video_url,ts.role FROM thread_sources ts JOIN recommendations r ON r.id=ts.recommendation_id WHERE ts.thread_id=? AND ts.status!='removed' ORDER BY ts.position`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT u.* FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? ORDER BY tu.position,u.updated_at`,
    )
      .bind(thread.id)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT a.* FROM unit_anchors a WHERE a.unit_id IN (SELECT unit_id FROM thread_units WHERE thread_id=?) ORDER BY a.created_at`,
    )
      .bind(thread.id)
      .all<any>(),
  ])
  if ((c.req.query('format') || 'json') !== 'md')
    return c.json({
      thread,
      sources: sources.results || [],
      units: units.results || [],
      anchors: anchors.results || [],
      evidence: [],
    })
  const anchorMap = new Map<string, any[]>()
  for (const anchor of anchors.results || [])
    anchorMap.set(anchor.unit_id, [...(anchorMap.get(anchor.unit_id) || []), anchor])
  const markdown = [
    `# ${thread.title}`,
    '',
    `**Type:** ${thread.thread_type}`,
    '',
    `## Guiding question`,
    '',
    thread.guiding_question,
    '',
    `## Definition of done`,
    '',
    thread.definition_of_done,
    '',
    `## Final synthesis`,
    '',
    thread.final_synthesis || '_Not completed_',
    '',
    `## Sources`,
    '',
    ...(sources.results || []).map(
      (source: any) =>
        `- [${source.video_title}](${source.video_url}) — ${source.role}${source.creator ? ` · ${source.creator}` : ''}`,
    ),
    '',
    `## Learning Units`,
    '',
    ...(units.results || []).flatMap((unit: any) => [
      `### ${unit.unit_type}: ${unit.statement}`,
      '',
      unit.user_synthesis || '',
      ...(anchorMap.get(unit.id) || []).map(
        (anchor: any) => `- Anchor: ${anchor.locator}${anchor.excerpt ? ` — ${anchor.excerpt}` : ''}`,
      ),
      '',
    ]),
  ].join('\n')
  c.header('Content-Type', 'text/markdown; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${thread.id}.md"`)
  return c.body(markdown)
})

app.get('/weekly', async (c) => {
  const [threads, stale, loops, due, completed] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id,title,thread_type,status,updated_at FROM learning_threads WHERE status IN ('active','paused') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,updated_at`,
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT id,title,status,updated_at FROM learning_threads WHERE status IN ('active','paused') AND updated_at<datetime('now','-7 days') ORDER BY updated_at`,
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT cr.id,cr.state,cr.requested_at,r.video_title FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at`,
    ).all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) count FROM learning_threads WHERE status='verified' AND verified_at>=datetime('now','-30 days')`,
    ).first<any>(),
  ])
  return c.json({
    open_threads: threads.results || [],
    stale_threads: stale.results || [],
    open_cognitive_loops: loops.results || [],
    due_recall: Number(due?.count || 0),
    completed_threads_30d: Number(completed?.count || 0),
    actions: ['continue', 'narrow', 'pause', 'synthesize', 'abandon'],
  })
})

app.get('/counterevidence', async (c) => {
  const threadId = c.req.query('thread_id')
  if (!threadId) return c.json({ error: 'thread_id required' }, 400)
  const gaps = await c.env.DB.prepare(
    `SELECT u.id,u.unit_type,u.statement,u.confidence FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? AND tu.role IN ('core','supporting') AND u.status IN ('draft','accepted') AND NOT EXISTS (SELECT 1 FROM unit_relations ur WHERE ur.status='active' AND ur.relation_type IN ('contradicts','qualifies') AND (ur.source_unit_id=u.id OR ur.target_unit_id=u.id)) ORDER BY tu.importance DESC,u.updated_at DESC`,
  )
    .bind(threadId)
    .all<any>()
  return c.json({ thread_id: threadId, units_without_counterevidence: gaps.results || [] })
})

app.get('/contradictions', async (c) => {
  const reviewState = clean(c.req.query('review_state'), 20) || 'pending'
  if (!['pending', 'accepted', 'resolved', 'dismissed', 'all'].includes(reviewState))
    return c.json({ error: 'invalid review_state' }, 400)
  const contradictions = await loadContradictionRelations(c.env.DB, reviewState === 'all' ? undefined : reviewState)
  return c.json({ contradictions, review_state: reviewState })
})

app.patch('/contradictions/:id', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const reviewState = clean(body.review_state, 20)
  const resolution = clean(body.resolution, 4000)
  if (!['accepted', 'resolved', 'dismissed'].includes(reviewState))
    return c.json({ error: 'review_state must be accepted, resolved, or dismissed' }, 400)
  if (['resolved', 'dismissed'].includes(reviewState) && !resolution)
    return c.json({ error: 'resolution required' }, 400)
  const result = await c.env.DB.prepare(
    `UPDATE unit_relations SET review_state=?,resolution=?,reviewed_at=datetime('now') WHERE id=? AND relation_type='contradicts' AND status='active'`,
  )
    .bind(reviewState, resolution || null, c.req.param('id'))
    .run()
  return result.meta.changes
    ? c.json({ ok: true, id: c.req.param('id'), review_state: reviewState, resolution: resolution || null })
    : c.json({ error: 'contradiction not found' }, 404)
})

app.patch('/threads/:id', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const current = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`)
    .bind(c.req.param('id'))
    .first<any>()
  if (!current) return c.json({ error: 'thread not found' }, 404)
  const type = body.thread_type === undefined ? current.thread_type : clean(body.thread_type, 20)
  if (!threadTypes.has(type)) return c.json({ error: 'invalid thread_type' }, 400)
  await c.env.DB.prepare(
    `UPDATE learning_threads SET title=?,thread_type=?,guiding_question=?,why_now=?,definition_of_done=?,final_synthesis=?,priority=?,updated_at=datetime('now') WHERE id=?`,
  )
    .bind(
      body.title === undefined ? current.title : clean(body.title, 160),
      type,
      body.guiding_question === undefined ? current.guiding_question : clean(body.guiding_question, 1000),
      body.why_now === undefined ? current.why_now : clean(body.why_now, 2000) || null,
      body.definition_of_done === undefined ? current.definition_of_done : clean(body.definition_of_done, 2000),
      body.final_synthesis === undefined ? current.final_synthesis : clean(body.final_synthesis, 20000) || null,
      body.priority === undefined ? current.priority : Number(body.priority || 0),
      current.id,
    )
    .run()
  await syncPathStatuses(c.env.DB, current.id)
  return c.json({ ok: true })
})

app.post('/threads/:id/status', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const status = clean(body.status, 30)
  if (!['active', 'paused', 'abandoned'].includes(status))
    return c.json({ error: 'status must be active, paused, or abandoned' }, 400)
  const thread = await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  await c.env.DB.prepare(
    `UPDATE learning_threads SET status=?,started_at=CASE WHEN ?='active' THEN COALESCE(started_at,datetime('now')) ELSE started_at END,paused_at=CASE WHEN ?='paused' THEN datetime('now') ELSE paused_at END,updated_at=datetime('now') WHERE id=?`,
  )
    .bind(status, status, status, c.req.param('id'))
    .run()
  return c.json({ ok: true, status })
})

app.post('/threads/:id/sources', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const recommendationId = clean(body.recommendation_id, 120)
  const role = ['primary', 'supporting', 'counterevidence', 'reference'].includes(body.role) ? body.role : 'supporting'
  const [thread, source] = await Promise.all([
    c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first(),
    c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=? AND deleted_at IS NULL`).bind(recommendationId).first(),
  ])
  if (!thread || !source) return c.json({ error: 'thread or source not found' }, 404)
  await c.env.DB.prepare(
    `INSERT INTO thread_sources (thread_id,recommendation_id,role,expected_contribution,position,status) VALUES (?,?,?,?,?,'active') ON CONFLICT(thread_id,recommendation_id) DO UPDATE SET role=excluded.role,expected_contribution=excluded.expected_contribution,position=excluded.position,status='active',updated_at=datetime('now')`,
  )
    .bind(
      c.req.param('id'),
      recommendationId,
      role,
      clean(body.expected_contribution, 1000) || null,
      Number(body.position || 0),
    )
    .run()
  return c.json({ ok: true })
})

app.delete('/threads/:id/sources/:sourceId', async (c) => {
  const stagedTarget = await c.env.DB.prepare(
    `SELECT t.corpus_id FROM lite_visual_corpus_targets t JOIN lite_visual_corpora c ON c.id=t.corpus_id WHERE c.thread_id=? AND t.recommendation_id=? AND c.state='staging' LIMIT 1`,
  )
    .bind(c.req.param('id'), c.req.param('sourceId'))
    .first<any>()
  if (stagedTarget)
    return c.json({ error: 'source_is_bound_to_staged_lite_visual_corpus', corpus_id: stagedTarget.corpus_id }, 409)
  await c.env.DB.prepare(
    `UPDATE thread_sources SET status='removed',updated_at=datetime('now') WHERE thread_id=? AND recommendation_id=?`,
  )
    .bind(c.req.param('id'), c.req.param('sourceId'))
    .run()
  return c.json({ ok: true })
})

app.delete('/threads/:id', async (c) => {
  const id = c.req.param('id')
  const thread = await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(id).first()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const corpus = await c.env.DB.prepare('SELECT id,state FROM lite_visual_corpora WHERE thread_id=? LIMIT 1')
    .bind(id)
    .first<any>()
  if (corpus)
    return c.json({ error: 'thread_has_lite_visual_corpus_history', corpus_id: corpus.id, state: corpus.state }, 409)
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM learning_path_sources WHERE stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=?)`,
      ).bind(id),
      c.env.DB.prepare(
        `DELETE FROM learning_path_items WHERE stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=?)`,
      ).bind(id),
      c.env.DB.prepare(`DELETE FROM learning_path_stages WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`DELETE FROM thread_sources WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`DELETE FROM thread_units WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`DELETE FROM source_learning_dispositions WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE learning_sessions SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE srs_cards SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE srs_drafts SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE compass_picks SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE learning_events SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE notes SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`UPDATE artifacts SET thread_id=NULL WHERE thread_id=?`).bind(id),
      c.env.DB.prepare(`DELETE FROM learning_threads WHERE id=?`).bind(id),
    ])
    return c.json({ ok: true, id })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500)
  }
})

app.get('/units/:id', async (c) => {
  const unit = await c.env.DB.prepare(
    `SELECT u.*,
    COALESCE(nb.id,rb.id) branch_id,COALESCE(nb.label,rb.label) branch_label,COALESCE(nb.super_category,rb.super_category) branch_domain
    FROM learning_units u
    LEFT JOIN notes n ON n.id=u.note_id
    LEFT JOIN recommendation_meta m ON m.recommendation_id=u.recommendation_id
    LEFT JOIN tree_nodes nb ON nb.id=n.branch_id AND nb.status!='pruned'
    LEFT JOIN tree_nodes rb ON rb.id=m.branch_id AND rb.status!='pruned'
    WHERE u.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!unit) return c.json({ error: 'unit not found' }, 404)
  const relations = await loadNormalizedUnitRelations(c.env.DB, unit.id)
  const { branch_id, branch_label, branch_domain, ...unitRow } = unit
  return c.json({
    unit: { ...unitRow, branch: branch_id ? { id: branch_id, label: branch_label, domain: branch_domain } : null },
    relations,
  })
})

app.get('/units', async (c) => {
  const threadId = c.req.query('thread_id')
  const sourceId = c.req.query('recommendation_id')
  if (threadId) {
    const rows = await c.env.DB.prepare(
      `SELECT u.*,tu.role,tu.importance FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? ORDER BY tu.position,u.updated_at DESC`,
    )
      .bind(threadId)
      .all<any>()
    return c.json({ units: rows.results || [] })
  }
  const rows = sourceId
    ? await c.env.DB.prepare(`SELECT * FROM learning_units WHERE recommendation_id=? ORDER BY updated_at DESC`)
        .bind(sourceId)
        .all<any>()
    : await c.env.DB.prepare(`SELECT * FROM learning_units ORDER BY updated_at DESC LIMIT 200`).all<any>()
  return c.json({ units: rows.results || [] })
})

app.post('/units', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const type = clean(body.unit_type, 30)
    const statement = clean(body.statement, 12000)
    if (!unitTypes.has(type) || !statement) return c.json({ error: 'valid unit_type and statement required' }, 400)
    const anchors = Array.isArray(body.anchors) ? body.anchors.slice(0, 20) : []
    if (['claim', 'method', 'counterclaim'].includes(type) && !anchors.length)
      return c.json({ error: 'claims, methods, and counterclaims require a source anchor' }, 400)
    const id = clean(body.id, 120) || makeId('unit')
    const recommendationId = clean(body.recommendation_id, 120) || null
    const semanticKey = clean(body.semantic_key, 240) || null
    const noteId = clean(body.note_id, 120) || null
    if (noteId) {
      const note = await c.env.DB.prepare(`SELECT id,recommendation_id FROM notes WHERE id=?`).bind(noteId).first<any>()
      if (!note || (recommendationId && note.recommendation_id && note.recommendation_id !== recommendationId))
        return c.json({ error: 'note does not own this learning unit' }, 409)
    }
    const annotationIds = [...new Set(anchors.map((anchor: any) => clean(anchor.annotation_id, 120)).filter(Boolean))]
    if (annotationIds.length) {
      const rows = await c.env.DB.prepare(
        `SELECT id,recommendation_id FROM source_annotations WHERE id IN (${annotationIds.map(() => '?').join(',')}) AND status='active'`,
      )
        .bind(...annotationIds)
        .all<any>()
      const found = rows.results || []
      if (
        found.length !== annotationIds.length ||
        found.some((row: any) => recommendationId && row.recommendation_id !== recommendationId)
      )
        return c.json({ error: 'annotation does not belong to the source or is unavailable' }, 409)
    }
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `INSERT INTO learning_units (id,unit_type,statement,user_synthesis,stance,confidence,recommendation_id,source_artifact_id,source_revision_checksum,created_by,status,semantic_key,note_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id,
        type,
        statement,
        clean(body.user_synthesis, 12000) || null,
        ['accept', 'question', 'reject', 'uncertain'].includes(body.stance) ? body.stance : 'uncertain',
        Math.max(0, Math.min(1, Number(body.confidence ?? 0.5))),
        recommendationId,
        clean(body.source_artifact_id, 120) || null,
        clean(body.source_revision_checksum, 160) || null,
        body.created_by === 'extractor' ? 'extractor' : 'user',
        body.status === 'accepted' ? 'accepted' : 'draft',
        semanticKey,
        noteId,
      ),
    ]
    for (const anchor of anchors) {
      if (!recommendationId || !clean(anchor.locator, 1000))
        return c.json({ error: 'each anchor requires recommendation_id and locator' }, 400)
      const anchorType = ['page', 'timestamp', 'section', 'quote', 'url_fragment', 'user_observation'].includes(
        anchor.anchor_type,
      )
        ? anchor.anchor_type
        : 'section'
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO unit_anchors (id,unit_id,recommendation_id,artifact_id,annotation_id,anchor_type,locator,excerpt,checksum) VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(
          makeId('anchor'),
          id,
          recommendationId,
          clean(anchor.artifact_id, 120) || null,
          clean(anchor.annotation_id, 120) || null,
          anchorType,
          clean(anchor.locator, 1000),
          clean(anchor.excerpt, 4000) || null,
          clean(anchor.checksum, 160) || null,
        ),
      )
    }
    if (body.thread_id)
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO thread_units (thread_id,unit_id,role,importance,position) VALUES (?,?,?,?,?)`,
        ).bind(
          body.thread_id,
          id,
          ['core', 'supporting', 'counterevidence', 'application'].includes(body.role) ? body.role : 'supporting',
          Math.max(0, Math.min(1, Number(body.importance ?? 0.5))),
          Number(body.position || 0),
        ),
      )
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO learning_unit_revisions (unit_id,actor_type,next_json,reason) VALUES (?,?,?,?)`,
      ).bind(
        id,
        body.created_by === 'extractor' ? 'agent' : 'user',
        JSON.stringify({ type, statement, user_synthesis: body.user_synthesis || null }),
        'created',
      ),
    )
    await c.env.DB.batch(statements)
    await recordLearningEvent(c.env.DB, {
      eventType: 'unit_created',
      actorType: body.created_by === 'extractor' ? 'agent' : 'user',
      evidenceWeight: body.created_by === 'extractor' ? 0 : 0.5,
      idempotencyKey: `unit-created:${id}`,
      threadId: body.thread_id || null,
      recommendationId,
      unitId: id,
    })
    return c.json({ ok: true, id }, 201)
  } catch (error) {
    return c.json(safeError('Learning unit creation failed')(error), 500)
  }
})

app.post('/units/:id/relations', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const relation = clean(body.relation_type, 30)
  if (!['supports', 'contradicts', 'qualifies', 'example_of', 'depends_on', 'applies_to'].includes(relation))
    return c.json({ error: 'invalid relation_type' }, 400)
  const target = clean(body.target_unit_id, 120)
  if (!target || target === c.req.param('id')) return c.json({ error: 'different target_unit_id required' }, 400)
  const why = clean(body.why, 4000)
  const sourceAnchorId = clean(body.source_anchor_id || body.evidence_anchor_id, 120)
  const targetAnchorId = clean(body.target_anchor_id, 120) || null
  if (!why || !sourceAnchorId) return c.json({ error: 'why and source_anchor_id required' }, 400)
  const [sourceUnit, targetUnit, sourceAnchor, targetAnchor] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id FROM learning_units u LEFT JOIN notes n ON n.id=u.note_id LEFT JOIN recommendation_meta m ON m.recommendation_id=u.recommendation_id LEFT JOIN tree_nodes nb ON nb.id=n.branch_id AND nb.status!='pruned' LEFT JOIN tree_nodes rb ON rb.id=m.branch_id AND rb.status!='pruned' WHERE u.id=? AND u.status IN ('draft','accepted') AND EXISTS (SELECT 1 FROM tree_nodes d WHERE d.id=COALESCE(nb.super_category,rb.super_category) AND d.type='category' AND d.status!='pruned')`,
    )
      .bind(c.req.param('id'))
      .first(),
    c.env.DB.prepare(
      `SELECT u.id FROM learning_units u LEFT JOIN notes n ON n.id=u.note_id LEFT JOIN recommendation_meta m ON m.recommendation_id=u.recommendation_id LEFT JOIN tree_nodes nb ON nb.id=n.branch_id AND nb.status!='pruned' LEFT JOIN tree_nodes rb ON rb.id=m.branch_id AND rb.status!='pruned' WHERE u.id=? AND u.status IN ('draft','accepted') AND EXISTS (SELECT 1 FROM tree_nodes d WHERE d.id=COALESCE(nb.super_category,rb.super_category) AND d.type='category' AND d.status!='pruned')`,
    )
      .bind(target)
      .first(),
    c.env.DB.prepare(`SELECT id FROM unit_anchors WHERE id=? AND unit_id=?`)
      .bind(sourceAnchorId, c.req.param('id'))
      .first(),
    targetAnchorId
      ? c.env.DB.prepare(`SELECT id FROM unit_anchors WHERE id=? AND unit_id=?`).bind(targetAnchorId, target).first()
      : Promise.resolve({ id: null }),
  ])
  if (!sourceUnit || !targetUnit)
    return c.json({ error: 'relation endpoints require valid non-pruned branch ownership' }, 409)
  if (!sourceAnchor || (targetAnchorId && !targetAnchor))
    return c.json({ error: 'relation anchors must belong to their endpoints' }, 409)
  const reviewState = relation === 'contradicts' ? 'pending' : 'accepted'
  await c.env.DB.prepare(
    `INSERT INTO unit_relations (id,source_unit_id,target_unit_id,relation_type,confidence,evidence_anchor_id,source_anchor_id,target_anchor_id,why,review_state) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_unit_id,target_unit_id,relation_type) DO UPDATE SET confidence=excluded.confidence,evidence_anchor_id=excluded.evidence_anchor_id,source_anchor_id=excluded.source_anchor_id,target_anchor_id=excluded.target_anchor_id,why=excluded.why,review_state=excluded.review_state,resolution=NULL,reviewed_at=NULL,status='active'`,
  )
    .bind(
      makeId('relation'),
      c.req.param('id'),
      target,
      relation,
      Math.max(0, Math.min(1, Number(body.confidence ?? 0.5))),
      sourceAnchorId,
      sourceAnchorId,
      targetAnchorId,
      why,
      reviewState,
    )
    .run()
  return c.json({ ok: true })
})

app.get('/consolidation/open', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT cr.*,r.video_title FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at`,
  ).all<any>()
  return c.json({ runs: rows.results || [] })
})

app.get('/consolidation/:sourceId', async (c) => {
  const run = await c.env.DB.prepare(
    `SELECT * FROM consolidation_runs WHERE recommendation_id=? ORDER BY requested_at DESC LIMIT 1`,
  )
    .bind(c.req.param('sourceId'))
    .first<any>()
  if (!run) return c.json({ run: null, steps: [] })
  const steps = await c.env.DB.prepare(`SELECT * FROM consolidation_steps WHERE run_id=? ORDER BY position`)
    .bind(run.id)
    .all<any>()
  return c.json({ run, steps: steps.results || [] })
})

app.post('/consolidation/:id/retry', async (c) => {
  const run = await c.env.DB.prepare(`SELECT * FROM consolidation_runs WHERE id=? AND state='repair_required'`)
    .bind(c.req.param('id'))
    .first<any>()
  if (!run) return c.json({ error: 'repair-required run not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE consolidation_runs SET state='queued',failure_reason=NULL,completed_at=NULL,updated_at=datetime('now') WHERE id=?`,
    ).bind(run.id),
    c.env.DB.prepare(
      `UPDATE consolidation_steps SET status='pending',error=NULL,updated_at=datetime('now') WHERE run_id=? AND status='failed'`,
    ).bind(run.id),
    c.env.DB.prepare(
      `UPDATE agent_jobs SET status='pending',attempts=0,error=NULL,updated_at=datetime('now') WHERE workflow_run_id=? AND status='failed'`,
    ).bind(run.id),
  ])
  return c.json({ ok: true, state: 'queued' })
})

app.post('/consolidation/:id/waive', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const reason = clean(body.reason, 1000)
  if (!reason) return c.json({ error: 'reason required' }, 400)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE consolidation_runs SET state='waived',failure_reason=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND state NOT IN ('closed','waived')`,
    ).bind(reason, c.req.param('id')),
    c.env.DB.prepare(
      `UPDATE consolidation_steps SET status='waived',error=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=? AND status IN ('pending','failed')`,
    ).bind(reason, c.req.param('id')),
  ])
  return c.json({ ok: true, state: 'waived' })
})

app.post('/consolidation/:id/reconcile', async (c) => {
  const run = await c.env.DB.prepare(
    `SELECT cr.*,r.video_url,r.user_score,r.user_review FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id WHERE cr.id=? AND cr.state NOT IN ('closed','waived')`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!run) return c.json({ error: 'open consolidation run not found' }, 404)
  const [note, units, anchors] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) count,SUM(CASE WHEN extraction_contract='source_note_v2' THEN 1 ELSE 0 END) quality_count FROM notes WHERE recommendation_id=? AND kind!='reflection'`,
    )
      .bind(run.recommendation_id)
      .first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM learning_units WHERE recommendation_id=?`)
      .bind(run.recommendation_id)
      .first<any>(),
    c.env.DB.prepare(`SELECT COUNT(DISTINCT unit_id) count FROM unit_anchors WHERE recommendation_id=?`)
      .bind(run.recommendation_id)
      .first<any>(),
  ])
  const unitCount = Number(units?.count || 0)
  const qualityNote = Number(note?.quality_count || 0) > 0
  const anchorsComplete = unitCount > 0 && Number(anchors?.count || 0) === unitCount
  const complete = qualityNote && unitCount > 0 && anchorsComplete
  if (complete) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE consolidation_steps SET status='completed',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE run_id=? AND step_key IN ('extract_source','validate_anchors','create_units','verify_record')`,
      ).bind(run.id),
      c.env.DB.prepare(
        `UPDATE consolidation_steps SET status='waived',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE run_id=? AND step_key='prepare_recall'`,
      ).bind(run.id),
      c.env.DB.prepare(
        `UPDATE consolidation_steps SET status='waived',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE run_id=? AND step_key='attach_map' AND status='pending'`,
      ).bind(run.id),
      c.env.DB.prepare(
        `UPDATE consolidation_runs SET state='closed',failure_reason=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
      ).bind(run.id),
    ])
    return c.json({
      ok: true,
      state: 'closed',
      reconciled_from: {
        notes: Number(note?.count || 0),
        units: Number(units?.count || 0),
        anchors: Number(anchors?.count || 0),
      },
    })
  }
  const existing = await c.env.DB.prepare(
    `SELECT id,status FROM agent_jobs WHERE job_type='extract_notes' AND recommendation_id=? AND status IN ('pending','running','retry') ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(run.recommendation_id)
    .first<any>()
  const jobId = existing?.id || makeId('job')
  if (!existing)
    await c.env.DB.prepare(
      `INSERT INTO agent_jobs(id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind,workflow_run_id,workflow_step) VALUES (?,'extract_notes',?,?,?,'explicit_user_action',?,'extract_source')`,
    )
      .bind(
        jobId,
        JSON.stringify({
          recommendation_id: run.recommendation_id,
          thread_id: run.thread_id || null,
          source_url: run.video_url || null,
          rating: run.user_score,
          reflection: run.user_review || '',
          disposition: run.disposition,
          output_contract: 'source_note_v2',
        }),
        `consolidation-reconcile-v2:${run.id}`,
        run.recommendation_id,
        run.id,
      )
      .run()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE agent_jobs SET workflow_run_id=?,workflow_step='extract_source',recommendation_id=? WHERE id=?`,
    ).bind(run.id, run.recommendation_id, jobId),
    c.env.DB.prepare(
      `UPDATE consolidation_steps SET agent_job_id=?,status='pending',error=NULL,updated_at=datetime('now') WHERE run_id=? AND step_key='extract_source'`,
    ).bind(jobId, run.id),
    c.env.DB.prepare(
      `UPDATE consolidation_runs SET state='queued',failure_reason=NULL,updated_at=datetime('now') WHERE id=?`,
    ).bind(run.id),
  ])
  return c.json({
    ok: true,
    state: 'queued',
    job_id: jobId,
    missing: { quality_note: !qualityNote, units: unitCount === 0, anchors: !anchorsComplete },
  })
})

export default app
