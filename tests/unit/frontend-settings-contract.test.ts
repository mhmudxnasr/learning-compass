import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readStudioCss } from './support/read-studio-css.ts'

const studioCss = readStudioCss()
const settingsSource = readFileSync(
  new URL('../../client/src/workspaces/SettingsWorkspace.tsx', import.meta.url),
  'utf8',
)

test('app-wide display preferences have real stylesheet behavior', () => {
  const requiredSelectors = [
    /:root\[data-density=['"]comfortable['"]\]/,
    /:root\[data-density=['"]compact['"]\]/,
    /:root\[data-radius=['"]sharp['"]\]/,
    /:root\[data-radius=['"]round['"]\]/,
    /:root\[data-font-size=['"]small['"]\]/,
    /:root\[data-font-size=['"]large['"]\]/,
    /:root\[data-reduced-motion=['"]true['"]\]/,
  ]

  for (const selector of requiredSelectors) {
    assert.ok(
      selector.test(studioCss),
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

test('theme choices expose semantic previews, grouped modes, and visible selection state', () => {
  assert.match(settingsSource, /Day palettes/)
  assert.match(settingsSource, /Night palettes/)
  assert.match(settingsSource, /function ThemeSemanticPreview/)
  assert.match(settingsSource, /theme-selected-marker/)
  assert.match(settingsSource, /aria-pressed=\{isSelected\}/)
  assert.match(settingsSource, /CUSTOM_COLOR_GROUPS\.map/)
  assert.match(settingsSource, /Foundations/)
  assert.match(settingsSource, /Identity & emphasis/)
  assert.match(settingsSource, /Navigation & signals/)
})

test('Preferences keeps one indexed decision canvas with an in-flow preview before controls', () => {
  const layoutStart = settingsSource.indexOf('<div class="preferences-layout">')
  const indexStart = settingsSource.indexOf('<aside class="preferences-index"', layoutStart)
  const mainIndex = settingsSource.indexOf('<div class="preferences-main">', layoutStart)
  const previewIndex = settingsSource.indexOf('<section class="preferences-preview-stage"', mainIndex)
  const presetIndex = settingsSource.indexOf('<section class="visual-presets-section"', previewIndex)
  assert.ok(layoutStart >= 0 && indexStart > layoutStart && mainIndex > indexStart && previewIndex > mainIndex && presetIndex > previewIndex)
  assert.match(studioCss, /\.preferences-page \.preferences-layout \{[\s\S]*grid-template-columns: 210px minmax\(0, 1fr\);/)
  assert.match(studioCss, /\.preferences-index \{[\s\S]*position: sticky;/)
  assert.match(studioCss, /@media \(max-width: 880px\)[\s\S]*\.preferences-index \.settings-jump-nav \{[\s\S]*display: flex;/)
})

test('custom theme workshop audits rendered tokens and keeps transfer tools progressive', () => {
  assert.match(settingsSource, /auditThemeContrast\(customPalette, customThemeMode\)/)
  assert.match(settingsSource, /class="theme-contrast-report"/)
  assert.match(settingsSource, /<details class="theme-workshop-advanced">/)
  assert.match(settingsSource, /aria-label="Import visual system JSON"/)
  assert.match(
    studioCss,
    /\.preferences-main \.custom-color-input-group input\[type=['"]color['"]\][\s\S]*width: 44px;[\s\S]*height: 44px;/,
  )
  assert.doesNotMatch(studioCss, /\.preferences-main \.theme-preset-desc[\s\S]{0,240}-webkit-line-clamp: 4/)
})
