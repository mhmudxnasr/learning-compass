import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const threadView = readFileSync(new URL('../../client/src/workspaces/learn/LearnThreadView.tsx', import.meta.url), 'utf8')
const learnWorkspace = readFileSync(new URL('../../client/src/workspaces/LearnWorkspace.tsx', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../../client/src/studio.css', import.meta.url), 'utf8')
const serviceWorker = readFileSync(new URL('../../client/public/sw.js', import.meta.url), 'utf8')

test('Thread command center uses one continuous Vertical Journey contract', () => {
  for (const hook of [
    'vertical-thread-spine',
    'vertical-overview-next',
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
  assert.match(studioCss, /\.thread-tabs\.vertical-thread-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4/s)
  assert.match(studioCss, /@container thread-journey \(max-width:\s*660px\)[\s\S]*grid-template-columns:\s*repeat\(2/)
})

test('Level and owner disclosures stay exact, bounded, and recoverable', () => {
  assert.match(learnWorkspace, /focusLevelId=\{activeRoute\.query\.get\('level'\)/)
  assert.match(threadView, /persistThreadLevelFocus\(path\.thread\.id, 'curriculum', stage\.id\)/)
  assert.match(threadView, /persistThreadLevelFocus\(path\.thread\.id, 'practice', stage\.id\)/)
  assert.match(threadView, /filteredLessons\.slice\(0, visibleResultCount\)/)
  assert.match(threadView, /filteredOwners\.slice\(0, visibleOwnerCount\)/)
  assert.match(threadView, /ownerItems\.slice\(0, ownerItemLimit\)/)
  assert.match(threadView, /materialExcerpt\(note\.abstract \|\| note\.sections\?\.\[0\]\?\.content/)
  assert.doesNotMatch(threadView, /vertical-curriculum-level-footer/)
  assert.doesNotMatch(threadView, /vertical-material-owner-link/)
  assert.doesNotMatch(threadView, /Open curriculum|Review curriculum|owner workspace/)
})

test('Vertical Journey preserves direct progression language and ships a fresh PWA shell', () => {
  assert.match(threadView, /Only direct lesson completion advances Levels/)
  assert.match(threadView, /Projects are optional practice/)
  assert.equal((threadView.match(/vertical-thread-next-link button/g) || []).length, 1)
  assert.doesNotMatch(threadView, /optional evidence/)
  assert.match(serviceWorker, /learning-compass-shell-v45/)
})

test('locked Levels distinguish prerequisites from missing material', () => {
  assert.match(threadView, /sourceCount > 0 \? 'Preview · Prerequisite' : 'Preview · Needs material'/)
  assert.match(threadView, /Complete the preceding Levels before these lessons become active work/)
})
