import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../../client/src/workspaces/HomeWorkspace.tsx', import.meta.url), 'utf8')
const libraryViews = readFileSync(new URL('../../client/src/workspaces/library/LibraryViews.tsx', import.meta.url), 'utf8')

test('Home source and file links remain passive and hand tracked starts to Queue', () => {
  assert.match(home, /Opening from Home is passive\./)
  assert.match(home, /href="#\/library">Open Queue to start/)
  assert.equal(home.includes('openLearningTarget('), false)
  assert.equal(home.includes('startExternal('), false)
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
