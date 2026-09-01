import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let app: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  app = (await vite.ssrLoadModule('/src/api/learning.ts')).default
})

test.after(async () => { await vite.close() })

class SqliteD1 {
  private readonly sqlite: DatabaseSync

  constructor(sqlite: DatabaseSync) { this.sqlite = sqlite }

  prepare(sql: string) {
    const execute = () => {
      const result = this.sqlite.prepare(sql).run(...statement.args as any[])
      return { meta: { changes: Number(result.changes) } }
    }
    const statement: any = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => { statement.args = args; return statement },
      first: async <T>() => this.sqlite.prepare(sql).get(...statement.args as any[]) as T || null,
      all: async <T>() => ({ results: this.sqlite.prepare(sql).all(...statement.args as any[]) as T[] }),
      run: async () => execute(),
      execute,
    }
    return statement
  }

  async batch(statements: any[]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((statement) => statement.execute())
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE source_annotations(id TEXT PRIMARY KEY);
    CREATE TABLE user_settings(setting_key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
    CREATE TABLE srs_cards (
      id TEXT PRIMARY KEY,
      recommendation_id TEXT,
      note_id TEXT,
      thread_id TEXT,
      stage_id TEXT,
      lesson_id TEXT,
      unit_id TEXT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      topic TEXT,
      branch TEXT,
      card_type TEXT,
      source_anchor TEXT,
      ease_factor REAL DEFAULT 5,
      interval_days INTEGER DEFAULT 1,
      repetitions INTEGER DEFAULT 0,
      due_at TEXT DEFAULT (date('now')),
      last_reviewed_at TEXT,
      difficulty REAL DEFAULT 5,
      stability REAL DEFAULT 1,
      lapses INTEGER NOT NULL DEFAULT 0,
      learning_steps INTEGER NOT NULL DEFAULT 0,
      scheduled_days INTEGER NOT NULL DEFAULT 0,
      fsrs_state INTEGER NOT NULL DEFAULT 0,
      scheduler_version TEXT NOT NULL DEFAULT 'legacy'
    );
    CREATE TABLE srs_review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      grade INTEGER NOT NULL,
      previous_state_json TEXT,
      next_state_json TEXT,
      reviewed_at TEXT DEFAULT (datetime('now'))
    );
  `)
  sqlite.exec(readFileSync(new URL('../../migrations/0069_recall_repair.sql', import.meta.url), 'utf8'))
  sqlite.prepare(`INSERT INTO srs_cards
    (id,question,answer,topic,due_at,difficulty,stability,interval_days,repetitions,lapses,learning_steps,scheduled_days,fsrs_state,scheduler_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'card-1', 'ما الفكرة الأساسية؟', 'هذه إجابة عربية واضحة للاختبار.', 'test', '2026-08-30', 5, 1, 1, 0, 0, 0, 0, 0, 'fsrs-6-ts-fsrs-5.4.1',
    )
  return { sqlite, DB: new SqliteD1(sqlite) as unknown as D1Database }
}

function state(sqlite: DatabaseSync) {
  const card = sqlite.prepare(`SELECT content_revision,scheduler_revision,status_revision,repair_status FROM srs_cards WHERE id='card-1'`).get() as any
  return {
    expected_content_revision: Number(card.content_revision),
    expected_scheduler_revision: Number(card.scheduler_revision),
    expected_status_revision: Number(card.status_revision),
    expected_repair_status: card.repair_status,
  }
}

function mutate(path: string, method: 'POST' | 'PUT', body: Record<string, unknown>, DB: D1Database) {
  return app.request(`https://app.test${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, { DB })
}

test('recall mutations reject missing and non-numeric state tokens before writing', async () => {
  const { sqlite, DB } = fixture()
  try {
    const missing = await mutate('/srs/review', 'POST', { card_id: 'card-1', grade: 3 }, DB)
    assert.equal(missing.status, 400)
    assert.equal((await missing.json() as any).error, 'recall_precondition_required')

    const stringRevision = await mutate('/srs/review', 'POST', {
      card_id: 'card-1', grade: 3, ...state(sqlite), expected_content_revision: '1',
    }, DB)
    assert.equal(stringRevision.status, 400)
    assert.equal((await stringRevision.json() as any).error, 'recall_precondition_required')
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_review_events').get() as any).count, 0)
    assert.equal(state(sqlite).expected_scheduler_revision, 1)
  } finally { sqlite.close() }
})

test('a semantic repair racing a review has one winner and one matching history event', async () => {
  const { sqlite, DB } = fixture()
  try {
    const expected = state(sqlite)
    const [review, semantic] = await Promise.all([
      mutate('/srs/review', 'POST', { card_id: 'card-1', grade: 3, ...expected }, DB),
      mutate('/srs/cards/card-1', 'PUT', {
        question: 'ما الفكرة المصححة؟', answer: 'هذه إجابة عربية مصححة وواضحة.', change_kind: 'semantic', ...expected,
      }, DB),
    ])

    assert.deepEqual([review.status, semantic.status].sort(), [200, 409])
    const conflict = review.status === 409 ? await review.json() as any : await semantic.json() as any
    assert.equal(conflict.error, 'recall_state_conflict')
    assert.equal(conflict.current.scheduler_revision, 2)

    const reviewEvents = Number((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_review_events').get() as any).count)
    const repairEvents = Number((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_card_repair_events').get() as any).count)
    assert.equal(reviewEvents + repairEvents, 1)
    const card = sqlite.prepare(`SELECT content_revision,scheduler_revision FROM srs_cards WHERE id='card-1'`).get() as any
    assert.equal(card.scheduler_revision, 2)
    assert.equal(card.content_revision, semantic.status === 200 ? 2 : 1)
    assert.equal(repairEvents, semantic.status === 200 ? 1 : 0)
    assert.equal(reviewEvents, review.status === 200 ? 1 : 0)
  } finally { sqlite.close() }
})

test('concurrent wording repairs cannot cross content or append orphan repair history', async () => {
  const { sqlite, DB } = fixture()
  try {
    const expected = state(sqlite)
    const [first, second] = await Promise.all([
      mutate('/srs/cards/card-1', 'PUT', {
        question: 'ما الصياغة الأولى؟', answer: 'هذه صياغة عربية أولى للاختبار.', change_kind: 'wording', ...expected,
      }, DB),
      mutate('/srs/cards/card-1', 'PUT', {
        question: 'ما الصياغة الثانية؟', answer: 'هذه صياغة عربية ثانية للاختبار.', change_kind: 'wording', ...expected,
      }, DB),
    ])
    assert.deepEqual([first.status, second.status].sort(), [200, 409])
    assert.equal((sqlite.prepare('SELECT content_revision FROM srs_cards WHERE id=?').get('card-1') as any).content_revision, 2)
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_card_repair_events').get() as any).count, 1)
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_review_events').get() as any).count, 0)
  } finally { sqlite.close() }
})

test('status and reset compare the full state and advance independent revisions', async () => {
  const { sqlite, DB } = fixture()
  try {
    const initial = state(sqlite)
    const paused = await mutate('/srs/cards/card-1/status', 'POST', { status: 'paused', ...initial }, DB)
    assert.equal(paused.status, 200)
    assert.deepEqual(state(sqlite), { ...initial, expected_status_revision: 2, expected_repair_status: 'paused' })

    const staleReset = await mutate('/srs/cards/card-1/reset', 'POST', { confirm: true, ...initial }, DB)
    assert.equal(staleReset.status, 409)
    assert.equal((await staleReset.json() as any).error, 'recall_state_conflict')
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_card_repair_events').get() as any).count, 1)

    const pausedState = state(sqlite)
    const reset = await mutate('/srs/cards/card-1/reset', 'POST', { confirm: true, ...pausedState }, DB)
    assert.equal(reset.status, 200)
    assert.deepEqual(state(sqlite), { ...pausedState, expected_scheduler_revision: 2 })
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_card_repair_events').get() as any).count, 2)

    const staleNoop = await mutate('/srs/cards/card-1/status', 'POST', { status: 'paused', ...pausedState }, DB)
    assert.equal(staleNoop.status, 409)
    const freshNoop = await mutate('/srs/cards/card-1/status', 'POST', { status: 'paused', ...state(sqlite) }, DB)
    assert.equal(freshNoop.status, 200)
    assert.equal((await freshNoop.json() as any).changed, false)
  } finally { sqlite.close() }
})

test('review and repair event failures roll back their card writes', async () => {
  const { sqlite, DB } = fixture()
  try {
    const initial = state(sqlite)
    sqlite.exec(`CREATE TRIGGER fail_review_event BEFORE INSERT ON srs_review_events BEGIN SELECT RAISE(ABORT,'forced review history failure'); END;`)
    const review = await mutate('/srs/review', 'POST', { card_id: 'card-1', grade: 3, ...initial }, DB)
    assert.equal(review.status, 500)
    assert.deepEqual(state(sqlite), initial)
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_review_events').get() as any).count, 0)

    sqlite.exec('DROP TRIGGER fail_review_event;')
    sqlite.exec(`CREATE TRIGGER fail_repair_event BEFORE INSERT ON srs_card_repair_events BEGIN SELECT RAISE(ABORT,'forced repair history failure'); END;`)
    const repair = await mutate('/srs/cards/card-1', 'PUT', {
      question: 'ما المعنى الجديد؟', answer: 'هذه إجابة عربية جديدة ومتكاملة.', change_kind: 'semantic', ...initial,
    }, DB)
    assert.equal(repair.status, 500)
    assert.deepEqual(state(sqlite), initial)
    const card = sqlite.prepare(`SELECT question FROM srs_cards WHERE id='card-1'`).get() as any
    assert.equal(card.question, 'ما الفكرة الأساسية؟')
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM srs_card_repair_events').get() as any).count, 0)
  } finally { sqlite.close() }
})
