import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../../client/src/workspaces/HomeWorkspace.tsx', import.meta.url), 'utf8')
const libraryViews = readFileSync(new URL('../../client/src/workspaces/library/LibraryViews.tsx', import.meta.url), 'utf8')

test('Home source and file links remain passive and hand tracked starts to Queue', () => {
  assert.match(home, /Opening from Home is passive\./)
  assert.match(home, /href=\{routeHref\('library', 'triage', 'queue'\)\}>Open Queue to start/)
  assert.match(home, /href=\{routeHref\('library', 'assets', 'files'\)\}>All files/)
  assert.match(home, /folio-home-feeds/)
  assert.match(home, /href=\{routeHref\('library', 'triage', 'feeds'\)\}>Open Feeds/)
  assert.match(home, /folio-home-thread-lesson/)
  assert.match(home, /lessonHref\(String\(thread\.id\), activeLesson\.id\)/)
  assert.equal(home.includes('openLearningTarget('), false)
  assert.equal(home.includes('startExternal('), false)
  assert.equal(home.includes('startLearningSession('), false)
  assert.equal(home.includes('onStart('), false)
})

test('Library object and file links never start learning sessions', () => {
  const objectViews = libraryViews.slice(libraryViews.indexOf('function SourceObject'), libraryViews.indexOf('function BookObject'))
  assert.match(objectViews, /Opening this source is passive\./)
  assert.match(objectViews, /passive open/)
  assert.equal(objectViews.includes('handlers.onStart('), false)
  assert.equal(objectViews.includes('openLearningTarget('), false)
  assert.equal(objectViews.includes('startExternal('), false)

  const startCalls = libraryViews.match(/handlers\.onStart\(/g) || []
  assert.equal(startCalls.length, 1, 'only Queue owns the tracked start action')
})
