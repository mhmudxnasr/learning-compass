import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/heatmap', async (c) => {
  const { DB } = c.env
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const startDate = yearAgo.toISOString().split('T')[0]
  try {
    const result = await DB.prepare(
      'SELECT date, count, topics FROM learning_log WHERE date >= ? ORDER BY date ASC'
    ).bind(startDate).all()
    const days: { date: string; count: number; topics: string }[] = []
    const rows = result.results || []
    const map = new Map<string, { date: string; count: number; topics: string }>()
    for (const row of rows) {
      const r = row as any
      map.set(r.date, { date: r.date, count: r.count, topics: r.topics || '' })
    }
    for (let d = new Date(yearAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0]
      if (map.has(key)) days.push(map.get(key)!)
      else days.push({ date: key, count: 0, topics: '' })
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
    const result = await DB.prepare(
      'SELECT date, count, topics FROM learning_log WHERE date >= ? AND date <= ? ORDER BY date DESC'
    ).bind(startDate, endDate).all()
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

// GET /learning/srs/due — Fetch cards due for active recall today
app.get('/srs/due', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const today = new Date().toISOString().split('T')[0]
  try {
    const cards = await DB.prepare(
      "SELECT * FROM srs_cards WHERE due_at <= ? ORDER BY due_at ASC LIMIT 20"
    ).bind(today).all()
    return c.json({ cards: cards.results || [], count: cards.results?.length || 0, today })
  } catch (err) {
    return c.json(safeError('SRS due failed')(err), 500)
  }
})

// POST /learning/srs/review — Update card after active recall attempt (FSRS v5 approximation)
// FSRS is the modern Anki default — 20-30% fewer reviews for same retention vs SM-2.
// This implementation uses a simplified FSRS-style model:
//   - difficulty: tracks item inherent difficulty (1.3-10.0, starts at 5.0)
//   - stability: interval in days, grows with recall success, decays on forget
//   - retrievability: computed from elapsed / stability (for future enhance)
app.post('/srs/review', async (c) => {
  const { DB } = c.env
  try {
    const { card_id, grade } = await c.req.json<{ card_id: string; grade: number }>() // grade: 0-5
    if (!card_id || typeof grade !== 'number' || grade < 0 || grade > 5) {
      return c.json({ error: 'card_id and grade (0-5) required' }, 400)
    }

    const card = await DB.prepare("SELECT * FROM srs_cards WHERE id = ?").bind(card_id).first<any>()
    if (!card) return c.json({ error: 'card not found' }, 404)

    let difficulty = card.ease_factor || 5.0
    let interval = card.interval_days || 1
    let reps = card.repetitions || 0
    const grade3 = grade >= 3 // recall success threshold (like SM-2's >= 3)

    // --- FSRS-style computation ---
    // Difficulty adjustment: success → easier, fail → harder
    // Bounded [1.3, 10.0] to prevent extreme intervals
    if (grade3) {
      // Success: difficulty drifts down slightly (or up for marginal pass)
      difficulty = difficulty + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    } else {
      // Fail: difficulty increases (item is harder than estimated)
      difficulty = difficulty + (grade - 3) * 0.2 // negative diff → increase
    }
    difficulty = Math.max(1.3, Math.min(10.0, difficulty))

    // Stability (interval) update
    if (grade3) {
      if (reps === 0) {
        interval = 1
      } else if (reps === 1) {
        interval = 6
      } else {
        // FSRS core: S(n) = S(n-1) * difficulty_factor * recall_boost * history_boost
        const diffFactor = difficulty / 5.0  // >1 = hard (longer), <1 = easy (shorter)
        const recallBoost = 1 + (grade - 3) * 0.3  // perfect recall = 1.6x, marginal = 1.0x
        const historyBoost = Math.exp(Math.min(reps * 0.08, 1.0)) // capped at ~2.7x
        interval = Math.round(Math.max(interval, 1) * diffFactor * recallBoost * historyBoost)
      }
      reps += 1
    } else {
      // Forget: half-life decay proportional to grade (partial credit for near-misses)
      const forgetFactor = 0.3 + (grade / 10)  // grade 0 → 0.3x, grade 2 → 0.5x
      interval = Math.max(1, Math.round(interval * forgetFactor))
      reps = 0
    }

    // Cap at reasonable max (5 years)
    interval = Math.min(interval, 1825)

    const nextDue = new Date()
    nextDue.setDate(nextDue.getDate() + interval)
    const nextDueStr = nextDue.toISOString().split('T')[0]

    await DB.prepare(`
      UPDATE srs_cards
      SET ease_factor = ?, interval_days = ?, repetitions = ?, due_at = ?, last_reviewed_at = datetime('now')
      WHERE id = ?
    `).bind(difficulty, interval, reps, nextDueStr, card_id).run()

    return c.json({ ok: true, next_due: nextDueStr, interval_days: interval, ease_factor: difficulty, fsrs: true })
  } catch (err) {
    return c.json(safeError('SRS review failed')(err), 500)
  }
})

// POST /learning/srs/create — Create new flashcards
app.post('/srs/create', async (c) => {
  const { DB } = c.env
  try {
    const { recommendation_id, question, answer, topic } = await c.req.json<{ recommendation_id?: string; question: string; answer: string; topic?: string }>()
    if (!question || !answer) return c.json({ error: 'question and answer required' }, 400)

    const id = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await DB.prepare(`
      INSERT INTO srs_cards (id, recommendation_id, question, answer, topic, ease_factor, interval_days, repetitions, due_at)
      VALUES (?, ?, ?, ?, ?, 2.5, 1, 0, date('now'))
    `).bind(id, recommendation_id || null, question, answer, topic || 'general').run()

    return c.json({ ok: true, card_id: id })
  } catch (err) {
    return c.json(safeError('Card creation failed')(err), 500)
  }
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

export default app


