import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cleanRawSourceText,
  computeDecayedAffinity,
  computeDialecticDivergenceScore,
  directionForText,
  formatNoteAnchors,
  queueDecision,
  scheduleReview,
  selectCurationMode,
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
  const again = scheduleReview({ difficulty: 5, stability: 1, repetitions: 0 }, 1, now)
  const good = scheduleReview({ difficulty: 5, stability: 1, repetitions: 0 }, 4, now)
  assert.equal(again.schedulerVersion, 'fsrs-6-ts-fsrs-5.4.1')
  assert.equal(again.intervalDays, 1)
  assert.equal(again.dueAt, '2026-07-30')
  assert.equal(good.intervalDays, 3)
  assert.equal(good.dueAt, '2026-08-01')
  assert.equal(good.fsrsState, 2)
  assert.ok(good.stability > again.stability)
})

test('higher retention shortens a successful review interval', () => {
  const state = { difficulty: 5, stability: 6, repetitions: 2 }
  const now = new Date('2026-07-29T00:00:00Z')
  assert.ok(scheduleReview(state, 4, now, 95).intervalDays < scheduleReview(state, 4, now, 85).intervalDays)
})

test('formatNoteAnchors truncates and extracts clean reflection snippets', () => {
  const reflections = [
    { reflection: 'How does System 1 heuristics apply to high-stakes trading Decisions?' },
    { reflection: '' },
    { reflection: 'a'.repeat(250) },
  ]
  const anchors = formatNoteAnchors(reflections)
  assert.equal(anchors.length, 2)
  assert.equal(anchors[0], 'How does System 1 heuristics apply to high-stakes trading Decisions?')
  assert.ok(anchors[1].endsWith('...'))
  assert.equal(anchors[1].length, 183)
})

test('selectCurationMode respects explicit valid mode or selects deterministically', () => {
  assert.equal(selectCurationMode('academic_paper'), 'academic_paper')
  assert.equal(selectCurationMode('counter_evidence'), 'counter_evidence')
  assert.equal(selectCurationMode('auto', true, 0), 'note_answer')
  assert.equal(selectCurationMode('auto', false, 0), 'blind_spot_bridge')
})

test('computeDialecticDivergenceScore computes mathematical divergence score correctly', () => {
  // cosSim = 0.25 (exact target angle), isRefutation = true
  // S_dialectic = 0.4 * 0.25 - 0.6 * |0.25 - 0.25| + 0.35 = 0.1 + 0 + 0.35 = 0.45
  const scoreRefutation = computeDialecticDivergenceScore(0.25, true)
  assert.equal(scoreRefutation, 0.45)

  // cosSim = 0.9 (high similarity / duplicate), isRefutation = false
  // S_dialectic = 0.4 * 0.9 - 0.6 * |0.9 - 0.25| + 0 = 0.36 - 0.39 = -0.03
  const scoreDuplicate = computeDialecticDivergenceScore(0.9, false)
  assert.equal(scoreDuplicate, -0.03)
})

test('cleanRawSourceText cleans YouTube timestamps, PDF page numbers, and web boilerplate', () => {
  const ytRaw = "[00:12] Hello world\n01:23:45 Substantive argument\n\n\n"
  assert.equal(cleanRawSourceText(ytRaw, 'youtube'), "Hello world\nSubstantive argument")

  const pdfRaw = "Page 12\nSection 1 text\n 45 \nSection 2 text"
  assert.equal(cleanRawSourceText(pdfRaw, 'pdf'), "Section 1 text\n\nSection 2 text")

  const webRaw = "<p>Clean main text</p>\nCookie Policy\nPrivacy Policy"
  assert.equal(cleanRawSourceText(webRaw, 'web'), "Clean main text")
})
