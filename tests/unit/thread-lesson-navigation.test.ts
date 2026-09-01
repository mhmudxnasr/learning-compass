import assert from 'node:assert/strict'
import test from 'node:test'
import { findNextThreadLesson } from '../../client/src/workspaces/learn/lessonState.ts'

const stages = [{ lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }] }, { lessons: [{ id: 'lesson-3' }] }]

test('lesson completion follows the Thread lesson order', () => {
  assert.equal(findNextThreadLesson(stages, 'lesson-1')?.id, 'lesson-2')
  assert.equal(findNextThreadLesson(stages, 'lesson-2')?.id, 'lesson-3')
})

test('the final or an unknown lesson has no automatic destination', () => {
  assert.equal(findNextThreadLesson(stages, 'lesson-3'), null)
  assert.equal(findNextThreadLesson(stages, 'missing'), null)
})
