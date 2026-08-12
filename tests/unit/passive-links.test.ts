import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../../client/src/app.tsx', import.meta.url), 'utf8')

function component(start: string, end: string) {
  return app.slice(app.indexOf(start), app.indexOf(end))
}

test('Momentum and Files links never start learning sessions', () => {
  for (const source of [
    component('function TodayPage()', 'function QueuePage()'),
    component('function ArtifactsPage()', 'function JournalPage()'),
  ]) {
    assert.equal(source.includes('openLearningTarget('), false)
    assert.equal(source.includes('startExternal('), false)
  }
})
