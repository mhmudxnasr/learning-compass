import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { FSRS_SCHEDULER_VERSION, scheduleReview } from '../domain'
import { loadSettings } from '../services/settings'
import { buildLearningBalance } from '../services/learning-balance'
import { recordLearningEvent } from '../services/learning-core'
import { LearningScopeError, resolveLearningScope, type ResolvedLearningScope } from '../services/learning-scope'
import { validateArabicRecall } from '../services/recall-language'

const app = new Hono<{ Bindings: Bindings }>()

async function resolveRecallScope(DB: D1Database, input: { thread_id?: unknown; stage_id?: unknown; lesson_id?: unknown; note_id?: unknown }): Promise<ResolvedLearningScope | null> {
  const threadId = String(input.thread_id || '').trim().slice(0, 120)
  const levelId = String(input.stage_id || '').trim().slice(0, 120)
  const lessonId = String(input.lesson_id || '').trim().slice(0, 120)
  if ([threadId, levelId, lessonId].filter(Boolean).length > 1) throw new LearningScopeError('invalid_scope', 'Choose one recall owner.')
  const requested = threadId ? await resolveLearningScope(DB, { kind: 'thread', id: threadId }) : levelId ? await resolveLearningScope(DB, { kind: 'level', id: levelId }) : lessonId ? await resolveLearningScope(DB, { kind: 'lesson', id: lessonId }) : null
  const noteId = String(input.note_id || '').trim().slice(0, 120)
  if (!noteId) return requested
  const note = await DB.prepare(`SELECT thread_id,stage_id,lesson_id FROM notes WHERE id=?`).bind(noteId).first<any>()
  if (!note) throw new LearningScopeError('scope_not_found', 'Recall Note not found.')
  const noteScope = note.lesson_id ? await resolveLearningScope(DB, { kind: 'lesson', id: note.lesson_id }) : note.stage_id
    ? await resolveLearningScope(DB, { kind: 'level', id: note.stage_id })
    : note.thread_id ? await resolveLearningScope(DB, { kind: 'thread', id: note.thread_id }) : null
  if (requested && noteScope && (requested.threadId !== noteScope.threadId || requested.levelId !== noteScope.levelId || requested.lessonId !== noteScope.lessonId)) {
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
    const result = await DB.prepare(`
      SELECT activity_date AS date, SUM(event_count) AS count,
        GROUP_CONCAT(DISTINCT event_type) AS topics,
        json_group_object(event_type, event_count) AS breakdown
      FROM (
        SELECT activity_date,event_type,COUNT(*) AS event_count
        FROM learning_activity_ledger WHERE activity_date >= ?
        GROUP BY activity_date,event_type
      ) GROUP BY activity_date ORDER BY activity_date ASC
    `).bind(startDate).all()
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
         END`
    ).bind(logDate, topicStr, topicStr, topicStr, topicStr, topicStr).run()
    return c.json({ ok: true, date: logDate })
  } catch (err) {
    return c.json(safeError('Log failed')(err), 500)
  }
})

app.get('/detail', async (c) => {
  const { DB } = c.env
  const date = c.req.query('date')
  const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const startDate = date || yearAgo.toISOString().split('T')[0]
  const endDate = date || new Date().toISOString().split('T')[0]
  try {
    const result = await DB.prepare(`
      SELECT activity_date AS date, COUNT(*) AS count, GROUP_CONCAT(DISTINCT event_type) AS topics
      FROM learning_activity_ledger WHERE activity_date >= ? AND activity_date <= ?
      GROUP BY activity_date ORDER BY activity_date DESC
    `).bind(startDate, endDate).all()
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
      'SELECT id, ts, kind, summary, details_json FROM update_log ORDER BY ts DESC LIMIT ?'
    ).bind(limit).all()
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

// GET /learning/srs/cards/:id — Read one card without restricting it to due cards.
app.get('/srs/cards/:id', async (c) => {
  const card = await c.env.DB.prepare(`SELECT c.*,
    COALESCE((SELECT title FROM notes WHERE id=c.note_id LIMIT 1),(SELECT video_title FROM recommendations WHERE id=c.recommendation_id LIMIT 1),'Direct Card') AS source_title
    FROM srs_cards c WHERE c.id=?`).bind(c.req.param('id')).first<any>()
  if (!card) return c.json({ error: 'card not found' }, 404)
  return c.json({ card })
})

// GET /learning/srs/due — Fetch cards due for active recall today
app.get('/srs/due', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const today = new Date().toISOString().split('T')[0]
  try {
    const cards = await DB.prepare(`
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
      WHERE c.due_at <= ?
      ORDER BY c.due_at ASC
      LIMIT 100
    `).bind(today).all()
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
    const { card_id, grade } = await c.req.json<{ card_id: string; grade: number }>() // grade: 0-5
    if (!card_id || typeof grade !== 'number' || grade < 0 || grade > 5) {
      return c.json({ error: 'card_id and grade (0-5) required' }, 400)
    }

    const card = await DB.prepare("SELECT * FROM srs_cards WHERE id = ?").bind(card_id).first<any>()
    if (!card) return c.json({ error: 'card not found' }, 404)

    const settings = await loadSettings(DB)
    const next = scheduleReview({ difficulty: Number(card.difficulty ?? card.ease_factor ?? 5), stability: Number(card.stability ?? card.interval_days ?? 1), repetitions: Number(card.repetitions || 0), lapses: Number(card.lapses || 0), learningSteps: Number(card.learning_steps || 0), scheduledDays: Number(card.scheduled_days ?? card.interval_days ?? 0), fsrsState: Number(card.fsrs_state || 0), dueAt: card.due_at, lastReviewedAt: card.last_reviewed_at }, grade, new Date(), settings.learning.retention)

    await DB.prepare(`
      UPDATE srs_cards
      SET ease_factor = ?, difficulty = ?, stability = ?, interval_days = ?, repetitions = ?, lapses=?, learning_steps=?, scheduled_days=?, fsrs_state=?, scheduler_version=?, due_at = ?, last_reviewed_at = datetime('now')
      WHERE id = ?
    `).bind(next.difficulty, next.difficulty, next.stability, next.intervalDays, next.repetitions, next.lapses, next.learningSteps, next.scheduledDays, next.fsrsState, next.schedulerVersion, next.dueAt, card_id).run()
    await DB.prepare(`INSERT INTO srs_review_events (card_id,grade,previous_state_json,next_state_json) VALUES (?,?,?,?)`).bind(card_id, grade, JSON.stringify(card), JSON.stringify(next)).run()
    if (card.unit_id || card.thread_id) {
      const result = grade >= 3 ? 'pass' : 'fail'
      if (result === 'pass' && card.unit_id) {
        await DB.prepare(`INSERT INTO unit_mastery_state (unit_id,stage,due_at,last_retrieved_at,delayed_retrievals) VALUES (?,'retrieved',?,datetime('now'),1) ON CONFLICT(unit_id) DO UPDATE SET stage=CASE WHEN unit_mastery_state.stage IN ('exposed','encoded') THEN 'retrieved' ELSE unit_mastery_state.stage END,due_at=excluded.due_at,last_retrieved_at=datetime('now'),delayed_retrievals=unit_mastery_state.delayed_retrievals+1,updated_at=datetime('now')`).bind(card.unit_id, next.dueAt).run()
      }
      await recordLearningEvent(DB, { eventType: 'recall_attempted', actorType: 'user', evidenceWeight: 1, idempotencyKey: `core-recall:${card_id}:${Date.now()}`, threadId: card.thread_id || null, recommendationId: card.recommendation_id || null, unitId: card.unit_id || null, payload: { grade, result } })
    }

    return c.json({ ok: true, next_due: next.dueAt, interval_days: next.intervalDays, ease_factor: next.difficulty, scheduler: FSRS_SCHEDULER_VERSION })
  } catch (err) {
    return c.json(safeError('SRS review failed')(err), 500)
  }
})

// POST /learning/srs/create — Create new flashcards
app.post('/srs/create', async (c) => {
  const { DB } = c.env
  try {
    const { recommendation_id, note_id, thread_id, stage_id, lesson_id, question, answer, topic, branch } = await c.req.json<{ recommendation_id?: string; note_id?: string; thread_id?: string; stage_id?: string; lesson_id?: string; question: string; answer: string; topic?: string; branch?: string }>()
    if (!question || !answer) return c.json({ error: 'question and answer required' }, 400)
    const languageError = validateArabicRecall(question, answer)
    if (languageError) return c.json({ error: 'recall_language_required', message: languageError }, 400)
    const scope = await resolveRecallScope(DB, { thread_id, stage_id, lesson_id, note_id })

    const id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await DB.prepare(`
      INSERT INTO srs_cards (id, recommendation_id, note_id, thread_id, stage_id, lesson_id, question, answer, topic, branch, ease_factor, interval_days, repetitions, due_at, scheduler_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2.5, 1, 0, date('now'), ?)
    `).bind(id, recommendation_id || null, note_id || null, scope?.kind === 'thread' ? scope.threadId : null, scope?.kind === 'level' ? scope.levelId : null, scope?.lessonId || null, question, answer, topic || 'general', branch || null, FSRS_SCHEDULER_VERSION).run()

    return c.json({ ok: true, card_id: id, thread_id: scope?.kind === 'thread' ? scope.threadId : null, stage_id: scope?.kind === 'level' ? scope.levelId : null, lesson_id: scope?.lessonId || null })
  } catch (err) {
    if (err instanceof LearningScopeError) return c.json({ error: err.code, message: err.message }, err.code === 'scope_not_found' ? 404 : 409)
    return c.json(safeError('Card creation failed')(err), 500)
  }
})

// Automated text-to-card generation creates ungrounded, duplicate study clutter.
app.post('/srs/generate', async (c) => {
  return c.json({
    error: 'direct_recall_generation_retired',
    message: 'Automatic flashcard generation is disabled. Create an Arabic card explicitly from the Recall or learning workspace.',
  }, 409)
})

// GET /learning/gaps — Analyze current knowledge gaps across branches
app.get('/gaps', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const result = await DB.prepare(`
      SELECT
        COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'unclassified') as topic,
        COUNT(*) as total_items,
        SUM(CASE WHEN user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastered_items,
        MAX(consumed_date) as last_activity
      FROM recommendations
      WHERE status = 'consumed'
      GROUP BY topic
      ORDER BY last_activity ASC
    `).all()
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
