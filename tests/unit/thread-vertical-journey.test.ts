import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pathsView = readFileSync(new URL('../../client/src/workspaces/learn/LearnPathsView.tsx', import.meta.url), 'utf8')
const threadView = readFileSync(new URL('../../client/src/workspaces/learn/LearnThreadView.tsx', import.meta.url), 'utf8')
const learnWorkspace = readFileSync(new URL('../../client/src/workspaces/LearnWorkspace.tsx', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../../client/src/studio.css', import.meta.url), 'utf8')
const serviceWorker = readFileSync(new URL('../../client/public/sw.js', import.meta.url), 'utf8')

test('Thread command center uses one continuous Vertical Journey contract', () => {
  for (const hook of [
    'vertical-thread-spine',
    'vertical-thread-ledger',
    'vertical-curriculum-journey',
    'vertical-practice-journey',
    'vertical-material-owner-journey',
  ]) {
    assert.match(threadView, new RegExp(`class="[^"]*${hook}`))
    assert.match(studioCss, new RegExp(`\\.${hook}`))
  }

  assert.match(studioCss, /container-name:\s*thread-journey/)
  assert.match(studioCss, /\.vertical-thread > :not\(\.vertical-thread-spine\)\s*\{[^}]*width:\s*100%;[^}]*margin-inline:\s*0;/s)
  assert.doesNotMatch(studioCss, /\.vertical-thread > :not\(\.vertical-thread-spine\)\s*\{[^}]*1120px/s)
  assert.match(studioCss, /\.thread-tabs\.vertical-thread-tabs\s*\{[^}]*display:\s*flex/s)
  assert.match(studioCss, /@container thread-journey \(max-width:\s*660px\)[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2/)
  for (const label of ['Now', 'Lessons', 'Projects', 'Resources']) assert.match(threadView, new RegExp(`label: '${label}'`))
  assert.match(learnWorkspace, /!\['thread', 'level', 'lesson', 'canon-domain'\]\.includes/)
  assert.doesNotMatch(threadView, /class="vertical-overview-next"/)
})

test('Level and owner disclosures stay exact, bounded, and recoverable', () => {
  assert.match(learnWorkspace, /focusLevelId=\{activeRoute\.query\.get\('level'\)/)
  assert.match(threadView, /persistThreadLevelFocus\(path\.thread\.id, 'curriculum', stage\.id\)/)
  assert.match(threadView, /persistThreadLevelFocus\(path\.thread\.id, 'practice', stage\.id\)/)
  assert.match(threadView, /threadTabHref\(path\.thread\.id, 'curriculum', stage\.id\)/)
  assert.match(threadView, /threadTabHref\(threadId, 'curriculum', stage\.id\)/)
  assert.doesNotMatch(threadView, /href=\{levelHref\(/)
  assert.match(threadView, /filteredLessons\.slice\(0, visibleResultCount\)/)
  assert.match(threadView, /filteredOwners\.slice\(0, visibleOwnerCount\)/)
  assert.match(threadView, /ownerItems\.slice\(0, ownerItemLimit\)/)
  assert.match(threadView, /materialExcerpt\(note\.abstract \|\| note\.sections\?\.\[0\]\?\.content/)
  assert.doesNotMatch(threadView, /vertical-curriculum-level-footer/)
  assert.doesNotMatch(threadView, /vertical-material-owner-link/)
  assert.doesNotMatch(threadView, /Open curriculum|Review curriculum|owner workspace/)
})

test('Threads index leads with resumable work instead of dashboard metrics', () => {
  for (const label of ['In progress', 'Paused', 'Completed', 'All']) assert.match(pathsView, new RegExp(`label: '${label}'`))
  assert.match(pathsView, /const \[filter, setFilter\] = useState\('active'\)/)
  assert.match(pathsView, /Continue Thread/)
  assert.match(pathsView, /thread-index-summary/)
  assert.doesNotMatch(pathsView, /Current Work|thread-summary-card|Structured Learning Threads/)
})

test('Lesson route exposes only essential actions and compact material icons', () => {
  assert.match(threadView, /class="course-lesson-action-bar"/)
  assert.match(threadView, /source\.role === 'primary'/)
  assert.match(threadView, /class="lesson-source-start"/)
  assert.match(threadView, /class="lesson-more-sources"/)
  assert.match(threadView, /course-material-icon-action/)
  assert.match(studioCss, /\.course-material-icon-action\s*\{/)
  assert.doesNotMatch(threadView, /class="lesson-gate-note"|class="lesson-learning-contract"|<LessonContent/)
  assert.doesNotMatch(threadView, /class="course-lesson-top-nav"|class="course-lesson-footer"/)
})

test('Vertical Journey preserves direct progression language and ships a fresh PWA shell', () => {
  assert.match(threadView, /They never unlock a lesson, advance a Level, or complete the Thread/)
  assert.match(threadView, /Projects are optional practice/)
  assert.equal((threadView.match(/vertical-thread-next-link button/g) || []).length, 1)
  assert.doesNotMatch(threadView, /optional evidence/)
  assert.match(serviceWorker, /learning-compass-shell-v50/)
})

test('locked Levels distinguish prerequisites from missing material', () => {
  assert.match(threadView, /sourceCount > 0 \? 'Preview · Prerequisite' : 'Preview · Needs material'/)
  assert.match(threadView, /Complete the preceding Levels before these lessons become active work/)
})
