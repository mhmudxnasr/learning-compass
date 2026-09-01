import assert from 'node:assert/strict'
import test from 'node:test'
import { selectHomeLessonTurns } from '../../src/services/home-threads.ts'
import type { PathStage, ThreadLesson } from '../../client/src/workspaces/learn/types.ts'

function stageWithLessons(statuses: ThreadLesson['status'][]): PathStage {
  return {
    id: 'level-0',
    thread_id: 'thread-1',
    position: 0,
    title: 'Orientation',
    status: 'in_progress',
    items: [],
    lessons: statuses.map((status, position) => ({
      id: `lesson-${position}`,
      stage_id: 'level-0',
      position,
      title: `Lesson ${position + 1}`,
      status,
    })),
    projects: [],
    sources: [],
    notes: [],
    files: [],
    cards: [],
    recall_drafts: [],
    progress: { completed: 0, total: statuses.length },
  }
}

test('Home selects only the current lesson from each Thread', () => {
  const stage = stageWithLessons(['completed', 'in_progress', 'not_started', 'not_started', 'not_started'])
  assert.deepEqual(
    selectHomeLessonTurns(stage.lessons).map((lesson) => lesson.id),
    ['lesson-1'],
  )
})

test('Home starts from the first unfinished lesson when none is active', () => {
  const stage = stageWithLessons(['completed', 'completed', 'not_started', 'not_started'])
  assert.deepEqual(
    selectHomeLessonTurns(stage.lessons).map((lesson) => lesson.id),
    ['lesson-2'],
  )
})

test('Home does not fabricate a current lesson when the Level is complete', () => {
  const stage = stageWithLessons(['completed', 'completed'])
  assert.deepEqual(selectHomeLessonTurns(stage.lessons), [])
})
