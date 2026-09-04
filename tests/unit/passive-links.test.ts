import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../../client/src/workspaces/HomeWorkspace.tsx', import.meta.url), 'utf8')
const libraryViews = readFileSync(new URL('../../client/src/workspaces/library/LibraryViews.tsx', import.meta.url), 'utf8')
const booksView = readFileSync(new URL('../../client/src/workspaces/library/BooksView.tsx', import.meta.url), 'utf8')

test('Home source and file links remain passive and hand tracked starts to Queue', () => {
  assert.match(home, /Opening from Home is passive\./)
  assert.match(home, /href=\{routeHref\('library', 'triage', 'queue'\)\}>Open Queue to start/)
  assert.match(home, /href=\{routeHref\('library', 'assets', 'files'\)\}>All files/)
  assert.match(home, /folio-home-feeds/)
  assert.match(home, /href=\{routeHref\('library', 'triage', 'feeds'\)\}/)
  assert.match(home, /folio-home-thread-lesson/)
  assert.match(home, /lessonHref\(String\(thread\.id\), lesson\.id\)/)
  assert.equal(home.includes('openLearningTarget('), false)
  assert.equal(home.includes('startExternal('), false)
  assert.equal(home.includes('startLearningSession('), false)
  assert.equal(home.includes('onStart('), false)
})

test('Home shows an expanded resurfacing item first and renders no empty shelf', () => {
  assert.ok(home.indexOf('{resurfacingItem && <section class="folio-home-resurfacing"') < home.indexOf('<section class="folio-home-focus'))
  assert.doesNotMatch(home, /Nothing is due today/)
  assert.doesNotMatch(home, /<details[^>]*folio-home-resurfacing/)
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

test('the unified Books workspace and dossier expose passive access, not tracked Resume actions', () => {
  const bookObject = libraryViews.slice(libraryViews.indexOf('function BookObject'))
  assert.equal(booksView.includes('startLearningSession('), false)
  assert.equal(booksView.includes('handlers.onStart('), false)
  assert.doesNotMatch(booksView, />\s*Resume\s*</)
  assert.doesNotMatch(booksView, /Continue Reading/)
  assert.match(booksView, /ReadingFormatLinks/)
  assert.match(booksView, />Open book overview<\/a>/)
  assert.match(bookObject, /<ReadingFormatLinks book=\{book\}/)
  assert.equal(bookObject.includes('sourceLink('), false)
  assert.equal(bookObject.includes('handlers.onStart('), false)
})
