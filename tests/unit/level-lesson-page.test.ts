import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLevelLessonPage } from '../../src/services/level-lesson-page.ts'

test('Level pages use bounded defaults and preserve literal identifiers', () => {
  assert.deepEqual(parseLevelLessonPage({ stage_id: 'stage_0-test' }), {
    stageId: 'stage_0-test',
    limit: 25,
    offset: 0,
  })
  assert.deepEqual(parseLevelLessonPage({ stage_id: 'level', limit: '50', offset: '50' }), {
    stageId: 'level',
    limit: 50,
    offset: 50,
  })
})

test('invalid pagination and malformed stage IDs fail rather than broaden the read', () => {
  for (const stage_id of ['', ' stage', 'stage ', 'stage/id', 'x'.repeat(121)]) {
    assert.equal(parseLevelLessonPage({ stage_id }), null)
  }
  for (const limit of ['0', '51', '-1', '1.5', 'NaN', 'Infinity', '1e1', '']) {
    assert.equal(parseLevelLessonPage({ stage_id: 'stage', limit }), null)
  }
  for (const offset of ['-1', '1.5', '9007199254740992', 'NaN', '']) {
    assert.equal(parseLevelLessonPage({ stage_id: 'stage', offset }), null)
  }
})
