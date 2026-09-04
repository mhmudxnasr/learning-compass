import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const settings = readFileSync(new URL('../../client/src/workspaces/SettingsWorkspace.tsx', import.meta.url), 'utf8')
const studio = readStudioCss()
import { readStudioCss } from './support/read-studio-css.ts'

test('learning profile renders legacy and structured values without false repair warnings or duplicate fields', () => {
  assert.match(settings, /function asValue\(value: unknown\)/)
  assert.match(settings, /<ReadableValue value=\{card\.value\}/)
  assert.doesNotMatch(settings, /Needs review in the profile editor/)
  assert.doesNotMatch(settings, /function ProfileFieldList/)
  for (const label of [
    'Learning context',
    'Priority areas',
    'Content boundaries',
    'How Hermes works',
    'Reaction style',
    'Pattern summary',
    'Quality standards',
    'Recent signal',
  ])
    assert.match(settings, new RegExp(`label: '${label}'`))
  assert.match(settings, /Structured value needs repair\./)
  assert.equal((settings.match(/<ProfileOverview profile=\{person\}/g) || []).length, 1)
})

test('learning profile uses progressive disclosure for long preferences and secondary evidence', () => {
  assert.match(settings, /Read the complete preference/)
  assert.match(settings, /class="profile-value-more"/)
  assert.match(settings, /class="profile-panel profile-history-panel"/)
  assert.match(settings, /class="profile-editor-body"/)
  assert.match(studio, /\.profile-card-quality,\s*\.profile-card-recent\s*\{[^}]*grid-column: 1 \/ -1/s)
  assert.match(studio, /\.profile-history-panel \.profile-record-columns/)
  assert.match(studio, /\.profile-editor-fields label\.profile-editor-wide/)
})

test('learning profile remains a single-column readable surface on phones', () => {
  assert.match(studio, /@media \(max-width: 768px\)[\s\S]*\.profile-card-context,[\s\S]*grid-column: auto/)
  assert.match(
    studio,
    /@media \(max-width: 768px\)[\s\S]*\.profile-editor-fields,[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
  )
})
