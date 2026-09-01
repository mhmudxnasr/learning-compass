import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveLevelStatus, deriveThreadStatus, normalizeDisposition } from '../../src/services/learning-core.ts'

test('explicit learning disposition is independent from taste score', () => {
  assert.equal(normalizeDisposition('apply'), 'apply')
  assert.equal(normalizeDisposition('drop'), 'drop')
})

test('ratings never infer a learning disposition', () => {
  assert.equal(normalizeDisposition(undefined), 'undecided')
  assert.equal(normalizeDisposition(''), 'undecided')
})

test('reopening a lesson restores completed progression to active', () => {
  assert.equal(
    deriveLevelStatus({ priorComplete: true, totalLessons: 3, completedLessons: 2, currentStatus: 'verified' }),
    'in_progress',
  )
  assert.equal(
    deriveLevelStatus({ priorComplete: true, totalLessons: 3, completedLessons: 3, currentStatus: 'in_progress' }),
    'verified',
  )
  assert.equal(deriveThreadStatus('verified', false), 'active')
  assert.equal(deriveThreadStatus('active', true), 'verified')
})

test('reopening an earlier Level locks later Levels without erasing lesson completion', () => {
  assert.equal(
    deriveLevelStatus({ priorComplete: false, totalLessons: 3, completedLessons: 3, currentStatus: 'verified' }),
    'locked',
  )
  assert.equal(deriveThreadStatus('abandoned', false), 'abandoned')
})
