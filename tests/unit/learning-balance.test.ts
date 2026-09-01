import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLearningBalance, knowledgeFrontier } from '../../src/services/learning-balance.ts'

test('knowledge frontier classifies advisory states from cumulative evidence', () => {
  assert.equal(knowledgeFrontier({ consumed: 0, units: 0, lessons: 0, latestRecall: null }).state, 'unexplored')
  assert.equal(knowledgeFrontier({ consumed: 1, units: 0, lessons: 0, latestRecall: null }).state, 'weak')
  assert.equal(knowledgeFrontier({ consumed: 4, units: 1, lessons: 0, latestRecall: null }).state, 'developing')
  assert.equal(knowledgeFrontier({ consumed: 4, units: 2, lessons: 0, latestRecall: 0.6 }).state, 'deeper-study-ready')
  assert.equal(knowledgeFrontier({ consumed: 10, units: 6, lessons: 3, latestRecall: 0.8 }).state, 'saturated')
  assert.equal(knowledgeFrontier({ consumed: 10, units: 6, lessons: 3, latestRecall: 0.4 }).state, 'weak')
})

test('frontier attributes note-owned Units before source branch fallback', async () => {
  const queries: string[] = []
  const DB = {
    prepare(sql: string) {
      queries.push(sql)
      return { all: async () => ({ results: [] }) }
    },
  }
  await buildLearningBalance(DB as any)
  const unitQuery = queries.find((sql) => sql.includes("u.status='accepted'")) || ''
  assert.match(unitQuery, /COALESCE\(n\.branch_id,m\.branch_id\)/)
  assert.match(unitQuery, /LEFT JOIN notes n ON n\.id=u\.note_id/)
})

test('learning balance projects lifetime frontier evidence, exact lessons, latest recall, and excludes pruned subtrees', async () => {
  const recent = new Date().toISOString().slice(0, 10)
  const old = '2020-01-01'
  const rows = (sql: string) => {
    if (sql.includes('FROM tree_nodes'))
      return [
        { id: 'root', type: 'root', label: 'Root', parent_id: null, status: 'active' },
        { id: 'cat', type: 'category', label: 'Domain', parent_id: 'root', status: 'active' },
        { id: 'branch', type: 'branch', label: 'Branch', parent_id: 'cat', status: 'active' },
        { id: 'pruned', type: 'branch', label: 'Pruned', parent_id: 'cat', status: 'pruned' },
        { id: 'pruned-leaf', type: 'leaf', label: 'Hidden', parent_id: 'pruned', status: 'active' },
      ]
    if (sql.includes('FROM priorities')) return []
    if (sql.includes('FROM recommendations r LEFT JOIN recommendation_meta'))
      return [
        { id: 'recent', status: 'consumed', consumed_date: recent, branch_id: 'branch', dedup_key: '' },
        { id: 'old', status: 'consumed', consumed_date: old, branch_id: 'branch', dedup_key: '' },
        { id: 'hidden', status: 'consumed', consumed_date: recent, branch_id: 'pruned-leaf', dedup_key: '' },
      ]
    if (sql.includes('FROM notes')) return []
    if (sql.includes('FROM srs_cards')) return [{ id: 'card', recommendation_id: 'recent', due_at: '2099-01-01' }]
    if (sql.includes('FROM srs_review_events'))
      return [
        { card_id: 'card', grade: 5, reviewed_at: '2026-01-01' },
        { card_id: 'card', grade: 3, reviewed_at: '2026-08-01' },
      ]
    if (sql.includes("u.status='accepted'"))
      return [
        { id: 'unit-1', branch_id: 'branch' },
        { id: 'unit-2', branch_id: 'branch' },
      ]
    if (sql.includes("l.status='completed'")) return [{ id: 'lesson-1', branch_id: 'branch' }]
    if (sql.includes('FROM branch_exploration')) return []
    return []
  }
  const DB = {
    prepare(sql: string) {
      return { all: async () => ({ results: rows(sql) }) }
    },
  }

  const balance = await buildLearningBalance(DB as any, 30)
  const branch = balance.branches.find((node) => node.id === 'branch')!
  const category = balance.branches.find((node) => node.id === 'cat')!

  assert.equal('round' in branch, false)
  assert.equal(branch.consumed_count, 1)
  assert.equal(branch.lifetime_consumed_count, 2)
  assert.equal(branch.accepted_units_count, 2)
  assert.equal(branch.completed_lessons_count, 1)
  assert.equal(category.completed_lessons_count, 0, 'direct lesson completion must not roll up to ancestors')
  assert.equal(branch.latest_recall, 0.6)
  assert.equal(branch.frontier_state, 'developing')
  assert.equal(
    balance.branches.some((node) => node.id === 'pruned' || node.id === 'pruned-leaf'),
    false,
  )
})

test('learning balance keeps paused and retired cards visible in totals but excludes them from due risk', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const rows = (sql: string) => {
    if (sql.includes('FROM tree_nodes'))
      return [
        { id: 'root', type: 'root', label: 'Root', parent_id: null, status: 'active' },
        { id: 'cat', type: 'category', label: 'Domain', parent_id: 'root', status: 'active' },
        { id: 'branch', type: 'branch', label: 'Branch', parent_id: 'cat', status: 'active' },
      ]
    if (sql.includes('FROM recommendations r LEFT JOIN recommendation_meta'))
      return [{ id: 'source', status: 'consumed', consumed_date: today, branch_id: 'branch', dedup_key: '' }]
    if (sql.includes('FROM srs_cards'))
      return [
        { id: 'active-card', recommendation_id: 'source', due_at: today, repair_status: 'active' },
        { id: 'paused-card', recommendation_id: 'source', due_at: today, repair_status: 'paused' },
        { id: 'retired-card', recommendation_id: 'source', due_at: today, repair_status: 'retired' },
      ]
    return []
  }
  const DB = {
    prepare(sql: string) {
      return { all: async () => ({ results: rows(sql) }) }
    },
  }

  const balance = await buildLearningBalance(DB as any, 30)
  const branch = balance.branches.find((node) => node.id === 'branch')!

  assert.equal(branch.srs_total, 3)
  assert.equal(branch.srs_due, 1)
  assert.ok(branch.reasons.includes('1 recall card is due'))
})
