import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readStudioCss } from './support/read-studio-css.ts'

const home = readFileSync(new URL('../../client/src/workspaces/HomeWorkspace.tsx', import.meta.url), 'utf8')
const studioCss = readStudioCss()

test('Home completion uses the canonical direct lesson mutation and refreshes in place', () => {
  assert.match(home, /function finishLesson|const finishLesson/)
  assert.match(
    home,
    /\/learning\/core\/threads\/\$\{encodeURIComponent\(threadId\)\}\/lessons\/\$\{encodeURIComponent\(lesson\.id\)\}/,
  )
  assert.match(home, /JSON\.stringify\(\{ status: 'completed' \}\)/)
  assert.match(home, /lessonReadiness\(lesson\) !== 'needs_material'/)
  assert.match(home, /window\.setTimeout\(\(\) => \{[\s\S]*reload\(\)[\s\S]*\}, 520\)/)
})

test('Home completion has deliberate animated, accessible, and mobile-safe states', () => {
  for (const hook of ['continuum-finish-lesson', 'is-finishing', 'is-finished', 'continuum-turn-error'])
    assert.match(home, new RegExp(hook))
  assert.match(home, /aria-label=\{`\$\{completionPhase/)
  assert.match(studioCss, /@keyframes continuum-finish-check/)
  assert.match(studioCss, /@keyframes continuum-turn-finished/)
  assert.match(studioCss, /\.continuum-finish-lesson\s*\{[\s\S]*min-height:\s*34px/)
  assert.match(studioCss, /\.continuum-finish-lesson\s*\{\s*width:\s*100%;\s*min-height:\s*40px;/)
  assert.match(studioCss, /:root\[data-reduced-motion=['"]true['"]\] \*,/)
})
