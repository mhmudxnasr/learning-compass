import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeDecayedAffinity,
  directionForText,
  queueDecision,
  scheduleReview,
} from '../../src/domain.ts'

test('queue blocks the sixth normal item but preserves an explicit override', () => {
  assert.deepEqual(queueDecision(5, false), { allowed: false, slotsRemaining: 0, requiresOverride: true })
  assert.deepEqual(queueDecision(5, true), { allowed: true, slotsRemaining: 0, requiresOverride: false })
  assert.deepEqual(queueDecision(2, false), { allowed: true, slotsRemaining: 3, requiresOverride: false })
})

test('taste affinity decays by half after ninety inactive days', () => {
  const now = new Date('2026-07-29T00:00:00Z')
  const value = computeDecayedAffinity(8, '2026-04-30', now)
  assert.equal(value.staleDays, 90)
  assert.ok(Math.abs(value.decayedAffinity - 4) < 0.001)
})

test('note direction follows meaningful Arabic content', () => {
  assert.equal(directionForText('من الآخر دي الفكرة الأساسية'), 'rtl')
  assert.equal(directionForText('Foundation and evidence'), 'ltr')
  assert.equal(directionForText(''), 'auto')
})

test('review scheduling is deterministic for new cards', () => {
  const now = new Date('2026-07-29T12:00:00Z')
  assert.deepEqual(scheduleReview({ difficulty: 5, stability: 1, repetitions: 0 }, 1, now), {
    difficulty: 5.4,
    stability: 1,
    repetitions: 0,
    intervalDays: 1,
    dueAt: '2026-07-30',
  })
  assert.deepEqual(scheduleReview({ difficulty: 5, stability: 1, repetitions: 0 }, 4, now), {
    difficulty: 4.9,
    stability: 3,
    repetitions: 1,
    intervalDays: 3,
    dueAt: '2026-08-01',
  })
})

test('higher retention shortens a successful review interval', () => {
  const state = { difficulty: 5, stability: 6, repetitions: 2 }
  const now = new Date('2026-07-29T00:00:00Z')
  assert.ok(scheduleReview(state, 4, now, 95).intervalDays < scheduleReview(state, 4, now, 85).intervalDays)
})
