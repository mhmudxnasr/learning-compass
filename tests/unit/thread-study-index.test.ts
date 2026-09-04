import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { loadThreadStudyIndex, projectThreadStudy } from '../../src/services/thread-study-index.ts'

const lesson = (id: string, overrides = {}) => ({
  id,
  thread_id: 'thread',
  stage_id: 'stage',
  title: id,
  objective: null,
  status: 'not_started',
  stage_status: 'available',
  stage_position: 0,
  stage_title: 'Orientation',
  position: 0,
  estimated_minutes: null,
  has_material: 1,
  ...overrides,
})

test('study index keeps the current gap visible, excludes completed gaps, and counts future gaps separately', () => {
  const result = projectThreadStudy([
    lesson('done', { status: 'completed', has_material: 0 }),
    lesson('current', { has_material: 0 }),
    lesson('ready'),
    lesson('future', { has_material: 0, stage_status: 'locked' }),
  ])
  assert.equal(result.next_lesson?.id, 'current')
  assert.equal(result.next_lesson?.readiness, 'needs_material')
  assert.equal(result.needs_material_count, 2)
  assert.equal(result.future_material_count, 1)
})

test('active study wins over an earlier unfinished lesson, but locked active rows do not', () => {
  assert.equal(
    projectThreadStudy([lesson('first'), lesson('active', { status: 'in_progress' })]).next_lesson?.id,
    'active',
  )
  assert.equal(
    projectThreadStudy([lesson('first'), lesson('locked', { status: 'in_progress', stage_status: 'locked' })])
      .next_lesson?.id,
    'first',
  )
  assert.equal(projectThreadStudy([lesson('locked', { stage_status: 'locked' })]).next_lesson?.readiness, 'locked')
})

test('complete and empty curricula have no synthetic next lesson and duration coverage stays explicit', () => {
  assert.equal(projectThreadStudy([]).next_lesson, null)
  assert.equal(projectThreadStudy([lesson('done', { status: 'completed' })]).next_lesson, null)
  const result = projectThreadStudy([
    lesson('known', { estimated_minutes: 25 }),
    lesson('unknown'),
    lesson('done', { status: 'completed', estimated_minutes: 90 }),
  ])
  assert.equal(result.remaining_minutes, 25)
  assert.equal(result.estimated_lesson_count, 1)
})

test('D1 projection isolates Threads, accepts source-backed lessons, and derives study dates only from explicit lesson events', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE learning_threads(id TEXT,superseded_at TEXT);
    CREATE TABLE learning_path_stages(id TEXT,status TEXT,position INTEGER,title TEXT);
    CREATE TABLE thread_lessons(id TEXT,thread_id TEXT,stage_id TEXT,title TEXT,objective TEXT,status TEXT,position INTEGER,estimated_minutes INTEGER,content TEXT);
    CREATE TABLE thread_lesson_sources(lesson_id TEXT);
    CREATE TABLE learning_events(thread_id TEXT,occurred_at TEXT,event_type TEXT,is_explicit INTEGER);
    INSERT INTO learning_threads VALUES ('a',NULL),('b',NULL),('old','2026-01-01');
    INSERT INTO learning_path_stages VALUES ('sa','available',0,'First'),('sb','available',0,'Other');
    INSERT INTO thread_lessons VALUES ('a1','a','sa','Read',NULL,'not_started',0,10,''),('b1','b','sb','Write',NULL,'not_started',0,NULL,'text'),('old1','old','sa','Old',NULL,'not_started',0,NULL,'text');
    INSERT INTO thread_lesson_sources VALUES ('a1');
    INSERT INTO learning_events VALUES ('a','2026-01-01','lesson_status_changed',1),('a','2026-02-01','thread_created',1),('a','2026-03-01','lesson_status_changed',0);`)
  const d1 = {
    prepare: (sql: string) => ({ all: async () => ({ results: db.prepare(sql).all() }) }),
  } as unknown as D1Database
  try {
    const index = await loadThreadStudyIndex(d1)
    assert.equal(index.size, 2)
    assert.equal(index.get('a')?.next_lesson?.readiness, 'ready')
    assert.equal(index.get('b')?.next_lesson?.id, 'b1')
    assert.equal(index.get('a')?.last_studied_at, '2026-01-01')
    assert.equal(index.get('b')?.last_studied_at, null)
  } finally {
    db.close()
  }
})
