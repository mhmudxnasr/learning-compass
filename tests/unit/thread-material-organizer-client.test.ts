import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildSourceMaterialLauncher } from '../../client/src/workspaces/learn/sourceMaterials.ts'

const threadView = readFileSync(new URL('../../client/src/workspaces/learn/LearnThreadView.tsx', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../../client/src/studio.css', import.meta.url), 'utf8')

test('Thread Resources searches the Library first and places sources on exact Levels or Lessons', () => {
  assert.match(threadView, /\/material-sources\?q=/)
  assert.match(threadView, /Choose a Level or Lesson/)
  assert.match(threadView, /const lessonSourceRoles = \['primary', 'case', 'challenge', 'reference', 'optional'\]/)
  assert.match(threadView, /expected_contribution: contribution\.trim\(\)/)
  assert.match(threadView, /position\.trim\(\) \? \{ position: Math\.max\(0, Number\(position\) \|\| 0\) \} : \{\}/)
  assert.match(threadView, /placeholder="End"/)
  assert.match(threadView, /\/stages\/\$\{encodeURIComponent\(scopeId\)\}\/sources/)
  assert.match(threadView, /\/lessons\/\$\{encodeURIComponent\(scopeId\)\}\/sources/)
})

test('Direct Thread, Level, and Lesson placements can be edited and explicitly removed', () => {
  assert.match(threadView, /path\.sources\.map/)
  assert.match(threadView, /stage\.sources\.map/)
  assert.match(threadView, /lesson\.sources \|\| \[\]/)
  assert.match(threadView, /const endpoint = placementEndpoint\(threadId, placement\)/)
  assert.match(threadView, /method: 'PATCH'/)
  assert.match(threadView, /window\.confirm\(`Remove/)
  assert.match(threadView, /method: 'DELETE'/)
  assert.match(threadView, /The Library source will be kept/)
  assert.match(threadView, /const expectedContribution = contribution\.trim\(\)/)
  assert.match(threadView, /expected_contribution: expectedContribution/)
  assert.doesNotMatch(threadView, /expected_contribution: contribution\.trim\(\) \|\| null/)
  assert.match(threadView, /placeholder="Why it belongs here" required/)
  assert.match(threadView, /disabled=\{working !== null \|\| !contribution\.trim\(\)\}/)
})

test('Find material remains a reviewable request with a distinct Library attach action', () => {
  assert.match(threadView, />Find material for this lesson</)
  assert.match(threadView, /It never attaches, queues, starts, or advances learning/)
  assert.match(threadView, /\/material-request/)
  assert.match(threadView, /Review source · online only/)
  assert.match(threadView, /Attach saved Library source/)
  assert.match(threadView, /request\.result\.expected_contribution/)
  assert.match(threadView, /result\.recommendation_id/)
  assert.match(threadView, /material-sources\?recommendation_id=/)
  assert.match(threadView, /expected_source_url=\$\{encodeURIComponent\(result\.source_url \|\| ''\)\}/)
  assert.match(threadView, /expected_source_url: request\.result\.source_url/)
  assert.match(threadView, /role: 'primary'/)
  assert.doesNotMatch(threadView, /FindLessonMaterial[\s\S]{0,8000}\/start`/)
})

test('Thread and current-Level packs contain path metadata but accept only verified companion pairs', () => {
  assert.match(threadView, /threadOfflinePackResources/)
  assert.match(threadView, /levelOfflinePackResources/)
  assert.match(threadView, /offlinePairResources\(/)
  assert.match(threadView, /offlineDataResource\(/)
  assert.match(threadView, /offlineThreadPathSnapshot\(path\)/)
  assert.match(threadView, /scope="thread"/)
  assert.match(threadView, /scope="level"/)
  assert.match(threadView, /companionHref=\{verifiedCompanionHref\(source\)\}/)
  assert.match(threadView, /<SourceHealthControl/)
})

test('Original and NotebookLM launchers identify their online-only boundary', () => {
  const launcher = buildSourceMaterialLauncher({
    recommendation_id: 'source-online-boundary',
    video_url: 'https://example.com/source',
    notebook_url: 'https://notebooklm.google.com/notebook/example',
  })
  assert.match(launcher?.primary.label || '', /online only/i)
  assert.match(launcher?.alternatives.find((item) => item.kind === 'notebooklm')?.label || '', /online only/i)
})

test('Organizer and lesson request stay responsive and preserve touch-sized controls', () => {
  for (const selector of ['.thread-source-organizer-grid', '.thread-source-placement', '.lesson-material-request']) {
    assert.match(studioCss, new RegExp(selector.replace('.', '\\.')))
  }
  assert.match(studioCss, /@media \(max-width: 620px\)[\s\S]*\.thread-source-organizer > header/)
  assert.match(studioCss, /\.thread-source-search-results > button\s*\{[\s\S]*min-height: 68px/)
})
