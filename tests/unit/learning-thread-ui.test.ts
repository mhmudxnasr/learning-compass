import assert from 'node:assert/strict'
import test from 'node:test'
import { hasLessonStudyMaterial, lessonReadiness } from '../../client/src/workspaces/learn/lessonState.ts'

test('lesson readiness distinguishes active study from missing material', () => {
  assert.equal(lessonReadiness({ status: 'completed' }), 'completed')
  assert.equal(lessonReadiness({ status: 'in_progress', content: 'A guided explanation.' }), 'in_progress')
  assert.equal(lessonReadiness({ status: 'not_started', sources: [{}] }), 'ready')
  assert.equal(lessonReadiness({ status: 'not_started', content: '   ', sources: [] }), 'needs_material')
})

test('authored content and linked sources both count as study material', () => {
  assert.equal(hasLessonStudyMaterial({ content: 'Canonical lesson content.' }), true)
  assert.equal(hasLessonStudyMaterial({ sources: [{}] }), true)
  assert.equal(hasLessonStudyMaterial({ content: null, sources: [] }), false)
})
