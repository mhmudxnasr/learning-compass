import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { feedbackLifecycle, feedbackMetadata, normalizeStructuredFeedback } from '../../src/services/feedback.ts'

test('structured feedback normalizes completion, tags, effort, and duration', () => {
  assert.deepEqual(normalizeStructuredFeedback({
    completion_state: 'stopped',
    reason_tags: ['Too Advanced', 'too-advanced', 'wrong topic', ''],
    expected: '  A practical explanation.  ',
    actual: '  Too abstract. ',
    effort: 'deep',
    length_minutes: '42.4',
  }), {
    completion_state: 'stopped',
    reason_tags: ['too_advanced', 'wrong_topic'],
    expected: 'A practical explanation.',
    actual: 'Too abstract.',
    effort: 'deep',
    length_minutes: 42,
  })
})

test('stopped feedback exits Queue instead of becoming in progress', () => {
  assert.deepEqual(feedbackLifecycle('stopped'), {
    complete: false,
    stopped: true,
    sessionStatus: 'returned',
    learningState: 'excluded',
    progressPercent: 0,
    recommendationStatus: 'rejected',
  })
  const product = readFileSync(new URL('../../src/api/product.ts', import.meta.url), 'utf8')
  assert.equal((product.match(/feedbackLifecycle\(structured\.completion_state\)/g) || []).length, 2)
  assert.match(product, /if \(complete \|\| stopped\).*UPDATE compass_picks/)
})

test('feedback metadata preserves shared fields and route context', () => {
  const structured = normalizeStructuredFeedback({ reason_tags: ['not_now'] }, 'in_progress')
  const metadata = feedbackMetadata(structured, null, { source: 'compass_pick', outcome: 'dismissed' })
  assert.equal(metadata.learning_feedback.source, 'compass_pick')
  assert.equal(metadata.learning_feedback.outcome, 'dismissed')
  assert.deepEqual(metadata.learning_feedback.reason_tags, ['not_now'])
  assert.match(metadata.learning_feedback.recorded_at, /^\d{4}-\d{2}-\d{2}T/)
})
