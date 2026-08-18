import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studioCss = readFileSync(new URL('../../client/src/studio.css', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../../client/src/workspaces/SettingsWorkspace.tsx', import.meta.url), 'utf8')

test('app-wide display preferences have real stylesheet behavior', () => {
  const requiredSelectors = [
    ':root[data-density="comfortable"]',
    ':root[data-density="compact"]',
    ':root[data-radius="sharp"]',
    ':root[data-radius="round"]',
    ':root[data-font-size="small"]',
    ':root[data-font-size="large"]',
    ':root[data-reduced-motion="true"]',
  ]

  for (const selector of requiredSelectors) {
    assert.ok(
      studioCss.includes(selector),
      `${selector} must change the rendered studio instead of only updating document metadata`,
    )
  }
})

test('density tokens are consumed across the studio, not only on Settings', () => {
  const tokenUses = studioCss.match(/var\(--studio-density-/g) || []
  assert.ok(tokenUses.length >= 12, `expected app-wide density token usage, found ${tokenUses.length}`)
})

test('server-owned custom themes win over stale local palette state', () => {
  const themeSource = readFileSync(new URL('../../client/src/theme.ts', import.meta.url), 'utf8')
  assert.match(themeSource, /serverPalette \|\| \(storedPair \? getActiveCustomPalette\(\) : undefined\)/)
  assert.doesNotMatch(themeSource, /storedPair \? getActiveCustomPalette\(\) : serverPalette/)
})

test('Preferences prioritizes complete choices and progressively discloses expert tuning', () => {
  assert.match(settingsSource, /<h1>Preferences<\/h1>/)
  assert.match(settingsSource, /class="preferences-layout"/)
  assert.match(settingsSource, /function PreferenceChoice/)
  assert.match(settingsSource, /type="radio"/)
  assert.match(settingsSource, /<details class="theme-section preference-disclosure"/)
  assert.match(settingsSource, /<details class="font-section preference-disclosure"/)
  assert.match(settingsSource, /<details class="typography-controls-section preference-disclosure"/)
  assert.match(settingsSource, /<details class="preference-disclosure atlas-preferences"/)
})

test('the global appearance preview is contextual but never impersonates working controls', () => {
  const previewSource = settingsSource.slice(
    settingsSource.indexOf('function ThemeContextPreview'),
    settingsSource.indexOf('function PreferencesView'),
  )
  assert.match(previewSource, /aria-hidden="true"/)
  assert.doesNotMatch(previewSource, /<button/)
  assert.match(previewSource, /Home.*Library.*Learn.*Map.*Settings/s)
})
