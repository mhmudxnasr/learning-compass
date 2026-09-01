import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { FSRS_SCHEDULER_VERSION, scheduleReview } from '../domain'
import { loadSettings } from '../services/settings'
import { buildLearningBalance } from '../services/learning-balance'
import { recordLearningEvent } from '../services/learning-core'
import { LearningScopeError, resolveLearningScope, type ResolvedLearningScope } from '../services/learning-scope'
import { validateArabicRecall } from '../services/recall-language'
import {
  freshRecallSchedule,
  normalizeRecallRepairStatus,
  parseRecallMutationPrecondition,
  recallMutationState,
  recallMutationStateMatches,
  type RecallMutationState,
  recallRepairReason,
  RECALL_REPAIR_LAPSE_THRESHOLD,
} from '../services/recall-repair'
import { loadSourceAnnotationEvidence, SourceAnnotationEvidenceError } from '../services/source-annotation-evidence'

const app = new Hono<{ Bindings: Bindings }>()
const cleanRecallText = (value: unknown, max: number) =>
  String(value || '')
    .trim()
    .slice(0, max)
const parseRecallJson = (value: unknown, fallback: any = null) => {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function recallContentSnapshot(card: any) {
  return { question: card.question, answer: card.answer, content_revision: Number(card.content_revision || 1) }
}

function recallSchedulerSnapshot(card: any) {
  return {
    ease_factor: Number(card.ease_factor ?? 5),
    difficulty: Number(card.difficulty ?? 5),
    stability: Number(card.stability ?? 1),
    interval_days: Number(card.interval_days ?? 1),
    repetitions: Number(card.repetitions || 0),
    lapses: Number(card.lapses || 0),
    learning_steps: Number(card.learning_steps || 0),
    scheduled_days: Number(card.scheduled_days || 0),
    fsrs_state: Number(card.fsrs_state || 0),
    scheduler_version: card.scheduler_version || FSRS_SCHEDULER_VERSION,
    due_at: card.due_at || null,
    last_reviewed_at: card.last_reviewed_at || null,
    repair_lapses_acknowledged: Number(card.repair_lapses_acknowledged || 0),
  }
}

function recallRepairEvent(
  DB: Bindings['DB'],
  cardId: string,
  mutationId: string,
  action: 'edit' | 'pause' | 'resume' | 'retire' | 'restore' | 'reset',
  options: {
    changeKind?: 'wording' | 'semantic'
    beforeContent?: any
    afterContent?: any
    beforeScheduler?: any
    afterScheduler?: any
    reason?: string
  } = {},
) {
  return DB.prepare(
    `INSERT INTO srs_card_repair_events
    (id,card_id,action,change_kind,previous_content_json,next_content_json,previous_scheduler_json,next_scheduler_json,reason)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM srs_cards WHERE id=? AND last_recall_mutation_id=?
    )`,
  ).bind(
    `card_repair_${crypto.randomUUID()}`,
    cardId,
    action,
    options.changeKind || null,
    options.beforeContent ? JSON.stringify(options.beforeContent) : null,
    options.afterContent ? JSON.stringify(options.afterContent) : null,
    options.beforeScheduler ? JSON.stringify(options.beforeScheduler) : null,
    options.afterScheduler ? JSON.stringify(options.afterScheduler) : null,
    cleanRecallText(options.reason, 1000) || null,
    cardId,
    mutationId,
  )
}

function recallCasWhere(expected: RecallMutationState) {
  return [
    expected.content_revision,
    expected.scheduler_revision,
    expected.status_revision,
    expected.repair_status,
  ] as const
}

async function recallConflictResponse(c: any, cardId: string) {
  const current: any = await c.env.DB.prepare(
    `SELECT content_revision,scheduler_revision,status_revision,repair_status FROM srs_cards WHERE id=?`,
  )
    .bind(cardId)
    .first()
  return c.json(
    {
      error: 'recall_state_conflict',
      message: 'This recall card changed after it was loaded. Reload it before trying again.',
      current: current ? recallMutationState(current) : null,
    },
    409,
  )
}

const recallPreconditionMessage =
  'Send expected_content_revision, expected_scheduler_revision, expected_status_revision, and expected_repair_status from the latest card read.'

async function resolveRecallScope(
  DB: D1Database,
  input: { thread_id?: unknown; stage_id?: unknown; lesson_id?: unknown; note_id?: unknown },
): Promise<ResolvedLearningScope | null> {
  const threadId = String(input.thread_id || '')
    .trim()
    .slice(0, 120)
  const levelId = String(input.stage_id || '')
    .trim()
    .slice(0, 120)
  const lessonId = String(input.lesson_id || '')
    .trim()
    .slice(0, 120)
  if ([threadId, levelId, lessonId].filter(Boolean).length > 1)
    throw new LearningScopeError('invalid_scope', 'Choose one recall owner.')
  const requested = threadId
    ? await resolveLearningScope(DB, { kind: 'thread', id: threadId })
    : levelId
      ? await resolveLearningScope(DB, { kind: 'level', id: levelId })
      : lessonId
        ? await resolveLearningScope(DB, { kind: 'lesson', id: lessonId })
        : null
  const noteId = String(input.note_id || '')
    .trim()
    .slice(0, 120)
  if (!noteId) return requested
  const note = await DB.prepare(`SELECT thread_id,stage_id,lesson_id FROM notes WHERE id=?`).bind(noteId).first<any>()
  if (!note) throw new LearningScopeError('scope_not_found', 'Recall Note not found.')
  const noteScope = note.lesson_id
    ? await resolveLearningScope(DB, { kind: 'lesson', id: note.lesson_id })
    : note.stage_id
      ? await resolveLearningScope(DB, { kind: 'level', id: note.stage_id })
      : note.thread_id
        ? await resolveLearningScope(DB, { kind: 'thread', id: note.thread_id })
        : null
  if (
    requested &&
    noteScope &&
    (requested.threadId !== noteScope.threadId ||
      requested.levelId !== noteScope.levelId ||
      requested.lessonId !== noteScope.lessonId)
  ) {
    throw new LearningScopeError('scope_integrity_error', 'Recall scope must match the Note owner.')
  }
  return requested || noteScope
}

app.get('/heatmap', async (c) => {
  const { DB } = c.env
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const startDate = yearAgo.toISOString().split('T')[0]
  try {
    const result = await DB.prepare(
      `
      SELECT activity_date AS date, SUM(event_count) AS count,
        GROUP_CONCAT(DISTINCT event_type) AS topics,
        json_group_object(event_type, event_count) AS breakdown
      FROM (
        SELECT activity_date,event_type,COUNT(*) AS event_count
        FROM learning_activity_ledger WHERE activity_date >= ?
        GROUP BY activity_date,event_type
      ) GROUP BY activity_date ORDER BY activity_date ASC
    `,
    )
      .bind(startDate)
      .all()
    const days: { date: string; count: number; topics: string }[] = []
    const rows = result.results || []
    const map = new Map<string, { date: string; count: number; topics: string; breakdown?: string }>()
    for (const row of rows) {
      const r = row as any
      map.set(r.date, { date: r.date, count: r.count, topics: r.topics || '', breakdown: r.breakdown || '{}' })
    }
    for (let d = new Date(yearAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0]
      if (map.has(key)) days.push(map.get(key)!)
      else days.push({ date: key, count: 0, topics: '', breakdown: '{}' } as any)
    }
    return c.json({ days })
  } catch (err) {
    return c.json(safeError('Heatmap failed')(err), 500)
  }
})

app.post('/log', async (c) => {
  const { DB } = c.env
  try {
    const { date, topics } = await c.req.json<{ date?: string; topics?: string }>()
    const logDate = date || new Date().toISOString().split('T')[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return c.json({ error: 'invalid date format (YYYY-MM-DD)' }, 400)
    }
    const topicStr = (topics || '').slice(0, 2000)
    await DB.prepare(
      `INSERT INTO learning_log (date, count, topics) VALUES (?, 1, ?)
       ON CONFLICT(date) DO UPDATE SET
         count = count + 1,
         topics = CASE
           WHEN ? != '' AND learning_log.topics != '' THEN learning_log.topics || ', ' || ?
           WHEN ? != '' THEN ?
           ELSE learning_log.topics
         END`,
    )
      .bind(logDate, topicStr, topicStr, topicStr, topicStr, topicStr)
      .run()
    return c.json({ ok: true, date: logDate })
  } catch (err) {
    return c.json(safeError('Log failed')(err), 500)
  }
})

app.get('/detail', async (c) => {
  const { DB } = c.env
  const date = c.req.query('date')
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const startDate = date || yearAgo.toISOString().split('T')[0]
  const endDate = date || new Date().toISOString().split('T')[0]
  try {
    const result = await DB.prepare(
      `
      SELECT activity_date AS date, COUNT(*) AS count, GROUP_CONCAT(DISTINCT event_type) AS topics
      FROM learning_activity_ledger WHERE activity_date >= ? AND activity_date <= ?
      GROUP BY activity_date ORDER BY activity_date DESC
    `,
    )
      .bind(startDate, endDate)
      .all()
    return c.json({ days: result.results || [] })
  } catch (err) {
    return c.json(safeError('Detail failed')(err), 500)
  }
})

app.get('/update-log', async (c) => {
  const { DB } = c.env
  const limit = Math.min(parseInt(c.req.query('limit') || '30'), 100)
  try {
    const result = await DB.prepare(
      'SELECT id, ts, kind, summary, details_json FROM update_log ORDER BY ts DESC LIMIT ?',
    )
      .bind(limit)
      .all()
    return c.json({ events: result.results || [] })
  } catch (err) {
    return c.json(safeError('Update log failed')(err), 500)
  }
})

app.post('/delete', async (c) => {
  const { DB } = c.env
  try {
    const { date } = await c.req.json<{ date: string }>()
    if (!date) return c.json({ error: 'date required' }, 400)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'invalid date' }, 400)
    await DB.prepare('DELETE FROM learning_log WHERE date = ?').bind(date).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Delete failed')(err), 500)
  }
})

// ---- Active Recall & Spaced Repetition (SRS) Endpoints ----

// GET /learning/srs/repair — Cards that crossed the transparent lapse threshold,
// plus cards the learner paused so they always have a route back to them.
app.get('/srs/repair', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const rows = await DB.prepare(
      `
      SELECT c.*,u.statement AS unit_statement,u.unit_type,
        COALESCE(
          (SELECT title FROM notes WHERE id=c.note_id LIMIT 1),
          (SELECT title FROM notes WHERE recommendation_id=c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1),
          (SELECT video_title FROM recommendations WHERE id=c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1),
          'Direct Card'
        ) AS source_title,
        COALESCE(c.branch,(SELECT branch_id FROM notes WHERE id=c.note_id LIMIT 1),c.topic,'General') AS branch,
        COALESCE(c.note_id,(SELECT id FROM notes WHERE recommendation_id=c.recommendation_id AND c.recommendation_id IS NOT NULL LIMIT 1)) AS note_id,
        COALESCE(c.annotation_id,(SELECT a.annotation_id FROM unit_anchors a JOIN source_annotations sa ON sa.id=a.annotation_id AND sa.status='active' WHERE a.unit_id=c.unit_id AND a.annotation_id IS NOT NULL ORDER BY a.rowid LIMIT 1)) AS annotation_id,
        COALESCE(c.source_anchor,(SELECT locator FROM unit_anchors WHERE unit_id=c.unit_id ORDER BY rowid LIMIT 1),(SELECT quote FROM source_annotations WHERE id=c.annotation_id AND status='active' LIMIT 1)) AS source_anchor
      FROM srs_cards c LEFT JOIN learning_units u ON u.id=c.unit_id
      WHERE (c.repair_status='active' AND (COALESCE(c.lapses,0)-COALESCE(c.repair_lapses_acknowledged,0))>=?)
         OR c.repair_status='paused'
      ORDER BY CASE c.repair_status WHEN 'paused' THEN 1 ELSE 0 END,
        (COALESCE(c.lapses,0)-COALESCE(c.repair_lapses_acknowledged,0)) DESC,
        COALESCE(c.last_reviewed_at,c.due_at) ASC
      LIMIT 200
    `,
    )
      .bind(RECALL_REPAIR_LAPSE_THRESHOLD)
      .all<any>()
    const cards = rows.results || []
    if (!cards.length) return c.json({ threshold: RECALL_REPAIR_LAPSE_THRESHOLD, cards: [], count: 0 })

    const ids = cards.map((card: any) => String(card.id))
    const placeholders = ids.map(() => '?').join(',')
    const [reviews, repairEvents, comparisonPool] = await Promise.all([
      DB.prepare(
        `SELECT id,card_id,grade,previous_state_json,next_state_json,reviewed_at
        FROM srs_review_events WHERE card_id IN (${placeholders}) ORDER BY reviewed_at DESC,id DESC`,
      )
        .bind(...ids)
        .all<any>(),
      DB.prepare(
        `SELECT id,card_id,action,change_kind,previous_content_json,next_content_json,previous_scheduler_json,next_scheduler_json,reason,created_at
        FROM srs_card_repair_events WHERE card_id IN (${placeholders}) ORDER BY created_at DESC`,
      )
        .bind(...ids)
        .all<any>(),
      DB.prepare(
        `SELECT id,question,answer,topic,branch,unit_id,thread_id,stage_id,lesson_id
        FROM srs_cards WHERE repair_status!='retired' ORDER BY last_reviewed_at DESC LIMIT 500`,
      ).all<any>(),
    ])

    const reviewsByCard = new Map<string, any[]>()
    for (const event of reviews.results || []) {
      const previous = parseRecallJson((event as any).previous_state_json, {}) || {}
      const next = parseRecallJson((event as any).next_state_json, {}) || {}
      const list = reviewsByCard.get(String((event as any).card_id)) || []
      if (list.length < 25)
        list.push({
          id: (event as any).id,
          grade: Number((event as any).grade),
          reviewed_at: (event as any).reviewed_at,
          previous_due: previous.due_at || null,
          next_due: next.dueAt || next.due_at || null,
          previous_lapses: Number(previous.lapses || 0),
          next_lapses: Number(next.lapses || 0),
        })
      reviewsByCard.set(String((event as any).card_id), list)
    }

    const repairByCard = new Map<string, any[]>()
    for (const event of repairEvents.results || []) {
      const list = repairByCard.get(String((event as any).card_id)) || []
      if (list.length < 25)
        list.push({
          id: (event as any).id,
          action: (event as any).action,
          change_kind: (event as any).change_kind,
          reason: (event as any).reason,
          created_at: (event as any).created_at,
          previous_content: parseRecallJson((event as any).previous_content_json),
          next_content: parseRecallJson((event as any).next_content_json),
          previous_scheduler: parseRecallJson((event as any).previous_scheduler_json),
          next_scheduler: parseRecallJson((event as any).next_scheduler_json),
        })
      repairByCard.set(String((event as any).card_id), list)
    }

    const pool = comparisonPool.results || []
    const enriched = cards.map((card: any) => {
      const reason = recallRepairReason(card)!
      const comparisons = pool
        .filter(
          (candidate: any) =>
            candidate.id !== card.id &&
            ((card.unit_id && candidate.unit_id === card.unit_id) ||
              (!card.unit_id && card.branch && candidate.branch === card.branch) ||
              (!card.unit_id && !card.branch && card.topic && candidate.topic === card.topic)),
        )
        .slice(0, 3)
        .map((candidate: any) => ({
          id: candidate.id,
          question: candidate.question,
          answer: candidate.answer,
          reason:
            card.unit_id && candidate.unit_id === card.unit_id
              ? 'Same retained idea'
              : card.branch && candidate.branch === card.branch
                ? 'Same branch'
                : 'Same topic',
        }))
      return {
        ...card,
        repair_reason: reason,
        review_history: reviewsByCard.get(String(card.id)) || [],
        repair_history: repairByCard.get(String(card.id)) || [],
        comparison_candidates: comparisons,
      }
    })
    return c.json({ threshold: RECALL_REPAIR_LAPSE_THRESHOLD, cards: enriched, count: enriched.length })
  } catch (err) {
    return c.json(safeError('Recall repair failed')(err), 500)
  }
})

// GET /learning/srs/cards/:id — Read one card without restricting it to due cards.
app.get('/srs/cards/:id', async (c) => {
  const card = await c.env.DB.prepare(
    `SELECT c.*,
    COALESCE((SELECT title FROM notes WHERE id=c.note_id LIMIT 1),(SELECT video_title FROM recommendations WHERE id=c.recommendation_id LIMIT 1),'Direct Card') AS source_title,
    COALESCE(c.annotation_id,(SELECT a.annotation_id FROM unit_anchors a JOIN source_annotations sa ON sa.id=a.annotation_id AND sa.status='active' WHERE a.unit_id=c.unit_id AND a.annotation_id IS NOT NULL ORDER BY a.rowid LIMIT 1)) AS annotation_id,
    COALESCE(c.source_anchor,(SELECT locator FROM unit_anchors WHERE unit_id=c.unit_id ORDER BY rowid LIMIT 1),(SELECT quote FROM source_annotations WHERE id=c.annotation_id AND status='active' LIMIT 1)) AS source_anchor
    FROM srs_cards c WHERE c.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!card) return c.json({ error: 'card not found' }, 404)
  return c.json({ card })
})

// GET /learning/srs/due — Fetch cards due for active recall today
app.get('/srs/due', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const today = new Date().toISOString().split('T')[0]
  try {
    const cards = await DB.prepare(
      `
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
        ) as branch
      FROM srs_cards c
      WHERE c.due_at <= ? AND c.repair_status='active'
      ORDER BY c.due_at ASC
      LIMIT 100
    `,
    )
      .bind(today)
      .all()
    return c.json({ cards: cards.results || [], count: cards.results?.length || 0, today })
  } catch (err) {
    return c.json(safeError('SRS due failed')(err), 500)
  }
})

// POST /learning/srs/review — Update card after active recall attempt.
// Reference FSRS-6 scheduling through the official ts-fsrs implementation.
app.post('/srs/review', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const { card_id, grade } = body // grade: 0-5
    if (!card_id || typeof grade !== 'number' || grade < 0 || grade > 5) {
      return c.json({ error: 'card_id and grade (0-5) required' }, 400)
    }
    const expected = parseRecallMutationPrecondition(body)
    if (!expected) return c.json({ error: 'recall_precondition_required', message: recallPreconditionMessage }, 400)

    const card = await DB.prepare('SELECT * FROM srs_cards WHERE id = ?').bind(card_id).first<any>()
    if (!card) return c.json({ error: 'card not found' }, 404)
    if (!recallMutationStateMatches(card, expected)) return recallConflictResponse(c, card_id)
    if ((card.repair_status || 'active') !== 'active') {
      return c.json(
        {
          error: 'card_not_active',
          message: `This card is ${card.repair_status} and cannot be reviewed until it is active.`,
        },
        409,
      )
    }

    const settings = await loadSettings(DB)
    const next = scheduleReview(
      {
        difficulty: Number(card.difficulty ?? card.ease_factor ?? 5),
        stability: Number(card.stability ?? card.interval_days ?? 1),
        repetitions: Number(card.repetitions || 0),
        lapses: Number(card.lapses || 0),
        learningSteps: Number(card.learning_steps || 0),
        scheduledDays: Number(card.scheduled_days ?? card.interval_days ?? 0),
        fsrsState: Number(card.fsrs_state || 0),
        dueAt: card.due_at,
        lastReviewedAt: card.last_reviewed_at,
      },
      grade,
      new Date(),
      settings.learning.retention,
    )

    const mutationId = `recall_review_${crypto.randomUUID()}`
    const nextState = {
      ...next,
      content_revision: expected.content_revision,
      scheduler_revision: expected.scheduler_revision + 1,
      status_revision: expected.status_revision,
      repair_status: expected.repair_status,
    }
    const results = await DB.batch([
      DB.prepare(
        `
      UPDATE srs_cards
      SET ease_factor = ?, difficulty = ?, stability = ?, interval_days = ?, repetitions = ?, lapses=?, learning_steps=?, scheduled_days=?, fsrs_state=?, scheduler_version=?, due_at = ?, last_reviewed_at = datetime('now'),
        scheduler_revision=scheduler_revision+1,last_recall_mutation_id=?
      WHERE id = ? AND content_revision=? AND scheduler_revision=? AND status_revision=? AND repair_status=?
    `,
      ).bind(
        next.difficulty,
        next.difficulty,
        next.stability,
        next.intervalDays,
        next.repetitions,
        next.lapses,
        next.learningSteps,
        next.scheduledDays,
        next.fsrsState,
        next.schedulerVersion,
        next.dueAt,
        mutationId,
        card_id,
        ...recallCasWhere(expected),
      ),
      DB.prepare(
        `INSERT INTO srs_review_events (card_id,grade,previous_state_json,next_state_json)
        SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM srs_cards WHERE id=? AND last_recall_mutation_id=?)`,
      ).bind(card_id, grade, JSON.stringify(card), JSON.stringify(nextState), card_id, mutationId),
    ])
    if (Number(results[0]?.meta?.changes || 0) !== 1) return recallConflictResponse(c, card_id)
    if (card.unit_id || card.thread_id) {
      const result = grade >= 3 ? 'pass' : 'fail'
      if (result === 'pass' && card.unit_id) {
        await DB.prepare(
          `INSERT INTO unit_mastery_state (unit_id,stage,due_at,last_retrieved_at,delayed_retrievals) VALUES (?,'retrieved',?,datetime('now'),1) ON CONFLICT(unit_id) DO UPDATE SET stage=CASE WHEN unit_mastery_state.stage IN ('exposed','encoded') THEN 'retrieved' ELSE unit_mastery_state.stage END,due_at=excluded.due_at,last_retrieved_at=datetime('now'),delayed_retrievals=unit_mastery_state.delayed_retrievals+1,updated_at=datetime('now')`,
        )
          .bind(card.unit_id, next.dueAt)
          .run()
      }
      await recordLearningEvent(DB, {
        eventType: 'recall_attempted',
        actorType: 'user',
        evidenceWeight: 1,
        idempotencyKey: `core-recall:${card_id}:${mutationId}`,
        threadId: card.thread_id || null,
        recommendationId: card.recommendation_id || null,
        unitId: card.unit_id || null,
        payload: { grade, result },
      })
    }

    return c.json({
      ok: true,
      next_due: next.dueAt,
      interval_days: next.intervalDays,
      ease_factor: next.difficulty,
      scheduler: FSRS_SCHEDULER_VERSION,
      state: { ...expected, scheduler_revision: expected.scheduler_revision + 1 },
    })
  } catch (err) {
    return c.json(safeError('SRS review failed')(err), 500)
  }
})

// PUT /learning/srs/cards/:id — Learner-authored repair only. Wording edits
// preserve FSRS state; semantic rewrites reset it while keeping review history.
app.put('/srs/cards/:id', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const changeKind =
      body.change_kind === 'wording' || body.change_kind === 'semantic'
        ? (body.change_kind as 'wording' | 'semantic')
        : null
    if (!changeKind)
      return c.json(
        { error: 'change_kind_required', message: 'Choose wording or semantic so scheduling behavior is explicit.' },
        400,
      )
    const expected = parseRecallMutationPrecondition(body)
    if (!expected) return c.json({ error: 'recall_precondition_required', message: recallPreconditionMessage }, 400)
    const card = await DB.prepare(`SELECT * FROM srs_cards WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!card) return c.json({ error: 'card not found' }, 404)
    if (!recallMutationStateMatches(card, expected)) return recallConflictResponse(c, c.req.param('id'))
    if ((card.repair_status || 'active') === 'retired')
      return c.json({ error: 'retired_card', message: 'Restore the card before editing it.' }, 409)

    const question = cleanRecallText(body.question ?? card.question, 4000)
    const answer = cleanRecallText(body.answer ?? card.answer, 12000)
    if (!question || !answer) return c.json({ error: 'question and answer required' }, 400)
    if (question === card.question && answer === card.answer)
      return c.json({ error: 'no_change', message: 'The question and answer are unchanged.' }, 400)
    const languageError = validateArabicRecall(question, answer)
    if (languageError) return c.json({ error: 'recall_language_required', message: languageError }, 400)

    const beforeContent = recallContentSnapshot(card)
    const nextRevision = Number(card.content_revision || 1) + 1
    const afterContent = { question, answer, content_revision: nextRevision }
    const beforeScheduler = recallSchedulerSnapshot(card)
    const afterScheduler =
      changeKind === 'semantic'
        ? { ...freshRecallSchedule(FSRS_SCHEDULER_VERSION), repair_lapses_acknowledged: 0 }
        : { ...beforeScheduler, repair_lapses_acknowledged: Number(card.lapses || 0) }
    const mutationId = `recall_edit_${crypto.randomUUID()}`
    const update =
      changeKind === 'semantic'
        ? DB.prepare(
            `UPDATE srs_cards SET question=?,answer=?,content_revision=?,content_updated_at=datetime('now'),
          ease_factor=?,difficulty=?,stability=?,interval_days=?,repetitions=?,lapses=?,learning_steps=?,scheduled_days=?,fsrs_state=?,scheduler_version=?,due_at=?,last_reviewed_at=NULL,repair_lapses_acknowledged=0,
          scheduler_revision=scheduler_revision+1,last_recall_mutation_id=?
          WHERE id=? AND content_revision=? AND scheduler_revision=? AND status_revision=? AND repair_status=?`,
          ).bind(
            question,
            answer,
            nextRevision,
            afterScheduler.ease_factor,
            afterScheduler.difficulty,
            afterScheduler.stability,
            afterScheduler.interval_days,
            afterScheduler.repetitions,
            afterScheduler.lapses,
            afterScheduler.learning_steps,
            afterScheduler.scheduled_days,
            afterScheduler.fsrs_state,
            afterScheduler.scheduler_version,
            afterScheduler.due_at,
            mutationId,
            card.id,
            ...recallCasWhere(expected),
          )
        : DB.prepare(
            `UPDATE srs_cards SET question=?,answer=?,content_revision=?,content_updated_at=datetime('now'),repair_lapses_acknowledged=COALESCE(lapses,0),last_recall_mutation_id=?
          WHERE id=? AND content_revision=? AND scheduler_revision=? AND status_revision=? AND repair_status=?`,
          ).bind(question, answer, nextRevision, mutationId, card.id, ...recallCasWhere(expected))

    const results = await DB.batch([
      update,
      recallRepairEvent(DB, card.id, mutationId, 'edit', {
        changeKind,
        beforeContent,
        afterContent,
        beforeScheduler,
        afterScheduler,
        reason:
          body.reason ||
          (changeKind === 'semantic'
            ? 'Learner marked the meaning as changed; FSRS state reset.'
            : 'Learner repaired wording; FSRS state preserved.'),
      }),
    ])
    if (Number(results[0]?.meta?.changes || 0) !== 1) return recallConflictResponse(c, card.id)
    return c.json({
      ok: true,
      card_id: card.id,
      change_kind: changeKind,
      content_revision: nextRevision,
      scheduling: changeKind === 'semantic' ? 'reset' : 'preserved',
      next_due: afterScheduler.due_at,
      review_history_preserved: true,
      state: {
        ...expected,
        content_revision: nextRevision,
        scheduler_revision: expected.scheduler_revision + (changeKind === 'semantic' ? 1 : 0),
      },
    })
  } catch (err) {
    return c.json(safeError('Recall card repair failed')(err), 500)
  }
})

// POST /learning/srs/cards/:id/status — Pause and retirement are explicit,
// reversible learner actions. Neither changes lesson progression or FSRS state.
app.post('/srs/cards/:id/status', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const nextStatus = normalizeRecallRepairStatus(body.status)
    if (!nextStatus) return c.json({ error: 'status must be active, paused, or retired' }, 400)
    const expected = parseRecallMutationPrecondition(body)
    if (!expected) return c.json({ error: 'recall_precondition_required', message: recallPreconditionMessage }, 400)
    const card = await DB.prepare(`SELECT * FROM srs_cards WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!card) return c.json({ error: 'card not found' }, 404)
    if (!recallMutationStateMatches(card, expected)) return recallConflictResponse(c, c.req.param('id'))
    const previousStatus = normalizeRecallRepairStatus(card.repair_status) || 'active'
    if (previousStatus === nextStatus) {
      const mutationId = `recall_status_noop_${crypto.randomUUID()}`
      const result = await DB.prepare(
        `UPDATE srs_cards SET last_recall_mutation_id=?
        WHERE id=? AND content_revision=? AND scheduler_revision=? AND status_revision=? AND repair_status=?`,
      )
        .bind(mutationId, card.id, ...recallCasWhere(expected))
        .run()
      if (Number(result.meta?.changes || 0) !== 1) return recallConflictResponse(c, card.id)
      return c.json({ ok: true, changed: false, card_id: card.id, status: nextStatus, state: expected })
    }
    const action =
      nextStatus === 'paused'
        ? 'pause'
        : nextStatus === 'retired'
          ? 'retire'
          : previousStatus === 'retired'
            ? 'restore'
            : 'resume'
    const mutationId = `recall_status_${crypto.randomUUID()}`
    const results = await DB.batch([
      DB.prepare(
        `UPDATE srs_cards SET repair_status=?,paused_at=CASE WHEN ?='paused' THEN datetime('now') ELSE NULL END,retired_at=CASE WHEN ?='retired' THEN datetime('now') ELSE NULL END,
          status_revision=status_revision+1,last_recall_mutation_id=?
          WHERE id=? AND content_revision=? AND scheduler_revision=? AND status_revision=? AND repair_status=?`,
      ).bind(nextStatus, nextStatus, nextStatus, mutationId, card.id, ...recallCasWhere(expected)),
      recallRepairEvent(DB, card.id, mutationId, action, {
        beforeContent: recallContentSnapshot(card),
        afterContent: recallContentSnapshot(card),
        beforeScheduler: recallSchedulerSnapshot(card),
        afterScheduler: recallSchedulerSnapshot(card),
        reason: body.reason || `Learner changed recall status from ${previousStatus} to ${nextStatus}.`,
      }),
    ])
    if (Number(results[0]?.meta?.changes || 0) !== 1) return recallConflictResponse(c, card.id)
    return c.json({
      ok: true,
      changed: true,
      card_id: card.id,
      status: nextStatus,
      scheduling: 'preserved',
      review_history_preserved: true,
      state: { ...expected, repair_status: nextStatus, status_revision: expected.status_revision + 1 },
    })
  } catch (err) {
    return c.json(safeError('Recall card status failed')(err), 500)
  }
})

// POST /learning/srs/cards/:id/reset — Explicitly reset scheduling without
// deleting the old review events or changing the learner-authored content.
app.post('/srs/cards/:id/reset', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    if (body.confirm !== true)
      return c.json(
        { error: 'reset_confirmation_required', message: 'Send confirm: true to reset FSRS scheduling.' },
        400,
      )
    const expected = parseRecallMutationPrecondition(body)
    if (!expected) return c.json({ error: 'recall_precondition_required', message: recallPreconditionMessage }, 400)
    const card = await DB.prepare(`SELECT * FROM srs_cards WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!card) return c.json({ error: 'card not found' }, 404)
    if (!recallMutationStateMatches(card, expected)) return recallConflictResponse(c, c.req.param('id'))
    if ((card.repair_status || 'active') === 'retired')
      return c.json({ error: 'retired_card', message: 'Restore the card before resetting it.' }, 409)
    const beforeScheduler = recallSchedulerSnapshot(card)
    const afterScheduler = { ...freshRecallSchedule(FSRS_SCHEDULER_VERSION), repair_lapses_acknowledged: 0 }
    const mutationId = `recall_reset_${crypto.randomUUID()}`
    const results = await DB.batch([
      DB.prepare(
        `UPDATE srs_cards SET ease_factor=?,difficulty=?,stability=?,interval_days=?,repetitions=?,lapses=?,learning_steps=?,scheduled_days=?,fsrs_state=?,scheduler_version=?,due_at=?,last_reviewed_at=NULL,repair_lapses_acknowledged=0,
          scheduler_revision=scheduler_revision+1,last_recall_mutation_id=?
          WHERE id=? AND content_revision=? AND scheduler_revision=? AND status_revision=? AND repair_status=?`,
      ).bind(
        afterScheduler.ease_factor,
        afterScheduler.difficulty,
        afterScheduler.stability,
        afterScheduler.interval_days,
        afterScheduler.repetitions,
        afterScheduler.lapses,
        afterScheduler.learning_steps,
        afterScheduler.scheduled_days,
        afterScheduler.fsrs_state,
        afterScheduler.scheduler_version,
        afterScheduler.due_at,
        mutationId,
        card.id,
        ...recallCasWhere(expected),
      ),
      recallRepairEvent(DB, card.id, mutationId, 'reset', {
        beforeContent: recallContentSnapshot(card),
        afterContent: recallContentSnapshot(card),
        beforeScheduler,
        afterScheduler,
        reason: body.reason || 'Learner explicitly reset FSRS scheduling.',
      }),
    ])
    if (Number(results[0]?.meta?.changes || 0) !== 1) return recallConflictResponse(c, card.id)
    return c.json({
      ok: true,
      card_id: card.id,
      next_due: afterScheduler.due_at,
      scheduling: 'reset',
      review_history_preserved: true,
      state: { ...expected, scheduler_revision: expected.scheduler_revision + 1 },
    })
  } catch (err) {
    return c.json(safeError('Recall card reset failed')(err), 500)
  }
})

// POST /learning/srs/create — Create new flashcards
app.post('/srs/create', async (c) => {
  const { DB } = c.env
  try {
    const {
      recommendation_id,
      note_id,
      thread_id,
      stage_id,
      lesson_id,
      question,
      answer,
      topic,
      branch,
      source_anchor,
      annotation_id,
    } = await c.req.json<{
      recommendation_id?: string
      note_id?: string
      thread_id?: string
      stage_id?: string
      lesson_id?: string
      question: string
      answer: string
      topic?: string
      branch?: string
      source_anchor?: string
      annotation_id?: string
    }>()
    if (!question || !answer) return c.json({ error: 'question and answer required' }, 400)
    const languageError = validateArabicRecall(question, answer)
    if (languageError) return c.json({ error: 'recall_language_required', message: languageError }, 400)
    let scope = await resolveRecallScope(DB, { thread_id, stage_id, lesson_id, note_id })
    const annotationId = cleanRecallText(annotation_id, 120)
    let annotation = null
    if (annotationId) {
      try {
        annotation = await loadSourceAnnotationEvidence(DB, annotationId, {
          recommendationId: recommendation_id,
          branchId: branch,
          threadId: scope?.threadId,
        })
      } catch (error) {
        if (error instanceof SourceAnnotationEvidenceError)
          return c.json({ error: error.code, message: error.message }, error.status)
        throw error
      }
    }
    if (!scope && annotation?.thread_id)
      scope = await resolveLearningScope(DB, { kind: 'thread', id: annotation.thread_id })
    const recommendationId = annotation?.recommendation_id || cleanRecallText(recommendation_id, 120) || null
    const cardBranch = annotation?.branch_id || cleanRecallText(branch, 120) || null
    // When an annotation is selected, provenance comes only from canonical
    // server state; a caller cannot replace its locator with free text.
    const sourceAnchor = annotation?.locator || cleanRecallText(source_anchor, 1000) || null

    const id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await DB.prepare(
      `
      INSERT INTO srs_cards (id, recommendation_id, note_id, thread_id, stage_id, lesson_id, question, answer, topic, branch, ease_factor, interval_days, repetitions, due_at, scheduler_version, source_anchor, annotation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2.5, 1, 0, date('now'), ?, ?, ?)
    `,
    )
      .bind(
        id,
        recommendationId,
        note_id || null,
        scope?.kind === 'thread' ? scope.threadId : null,
        scope?.kind === 'level' ? scope.levelId : null,
        scope?.lessonId || null,
        question,
        answer,
        topic || 'general',
        cardBranch,
        FSRS_SCHEDULER_VERSION,
        sourceAnchor,
        annotation?.id || null,
      )
      .run()

    return c.json({
      ok: true,
      card_id: id,
      recommendation_id: recommendationId,
      annotation_id: annotation?.id || null,
      source_anchor: sourceAnchor,
      thread_id: scope?.kind === 'thread' ? scope.threadId : null,
      stage_id: scope?.kind === 'level' ? scope.levelId : null,
      lesson_id: scope?.lessonId || null,
    })
  } catch (err) {
    if (err instanceof LearningScopeError)
      return c.json({ error: err.code, message: err.message }, err.code === 'scope_not_found' ? 404 : 409)
    return c.json(safeError('Card creation failed')(err), 500)
  }
})

// Automated text-to-card generation creates ungrounded, duplicate study clutter.
app.post('/srs/generate', async (c) => {
  return c.json(
    {
      error: 'direct_recall_generation_retired',
      message:
        'Automatic flashcard generation is disabled. Create an Arabic card explicitly from the Recall or learning workspace.',
    },
    409,
  )
})

// GET /learning/gaps — Analyze current knowledge gaps across branches
app.get('/gaps', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const result = await DB.prepare(
      `
      SELECT
        COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'unclassified') as topic,
        COUNT(*) as total_items,
        SUM(CASE WHEN user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastered_items,
        MAX(consumed_date) as last_activity
      FROM recommendations
      WHERE status = 'consumed'
      GROUP BY topic
      ORDER BY last_activity ASC
    `,
    ).all()
    return c.json({ gaps: result.results || [] })
  } catch (err) {
    return c.json(safeError('Gaps analysis failed')(err), 500)
  }
})

// GET /learning/balance — explain attention, coverage, and retention by map branch
app.get('/balance', async (c) => {
  try {
    const windowDays = Number(c.req.query('window') || 90)
    return c.json(await buildLearningBalance(c.env.DB, windowDays))
  } catch (err) {
    return c.json(safeError('Learning balance failed')(err), 500)
  }
})

export default app
