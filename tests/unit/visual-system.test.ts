import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readStudioCss } from './support/read-studio-css.ts'

const theme = readFileSync(new URL('../../client/src/theme.ts', import.meta.url), 'utf8')
const studio = readStudioCss()
const settings = readFileSync(new URL('../../client/src/workspaces/SettingsWorkspace.tsx', import.meta.url), 'utf8')
const recallView = readFileSync(
  new URL('../../client/src/workspaces/learn/LearnRecallView.tsx', import.meta.url),
  'utf8',
)
const recallStyles = readFileSync(new URL('../../client/src/notes-recall.css', import.meta.url), 'utf8')

test('custom visual-system JSON reaches the global startup and heading seams', () => {
  assert.match(theme, /getActiveCustomPalette\(\)/)
  assert.match(theme, /const customPalette = theme === 'custom' \? getActiveCustomPalette\(\) : undefined/)
  assert.match(theme, /export async function hydrateThemeFromServer\(\)/)
  assert.match(theme, /authFetch\('\/settings'\)/)
  assert.match(studio, /font-family: var\(--font-display\) !important/)
  assert.match(studio, /letter-spacing: var\(--font-letter-spacing\) !important/)
  assert.match(settings, /applyFont\(nextFont, nextFont === 'custom' \? nextCustomFont : undefined\)/)
  assert.match(settings, /applyTypography\(nextTypography\)/)
  assert.match(settings, /const pasted = pasteCodes\.trim\(\)/)
  assert.match(settings, /applyThemeJson\(JSON\.parse\(pasted\)\)/)
  assert.match(settings, /Apply colors or JSON/)
})

test('global entry hydrates saved visual settings before route-specific workspaces', () => {
  const entry = readFileSync(new URL('../../client/src/app/entry.tsx', import.meta.url), 'utf8')
  assert.match(entry, /initTheme\(\)/)
  assert.match(entry, /void hydrateThemeFromServer\(\)/)
})

test('surprise themes use randomized premium art directions and reject unreadable output', () => {
  const enhance = readFileSync(new URL('../../src/api/enhance.ts', import.meta.url), 'utf8')
  assert.match(enhance, /SURPRISE_DIRECTIONS/)
  assert.match(enhance, /Warm editorial product studio/)
  assert.match(enhance, /Archival gallery index/)
  assert.match(enhance, /Math\.random\(\) \* SURPRISE_DIRECTIONS\.length/)
  assert.match(enhance, /premium 2026 learning workspace/)
  assert.match(enhance, /not like a random color generator or a generic SaaS dashboard/)
  assert.match(enhance, /do not copy any website's exact branding/)
  assert.match(enhance, /hasAccessibleThemeInk/)
  assert.match(enhance, /\['shell', 'surface'\]\.every/)
  assert.match(enhance, /!hasAccessibleThemeInk\(day\).*!hasAccessibleThemeInk\(night\)/s)
})

test('copied AI brief requests a premium whole-product visual system', () => {
  assert.match(settings, /senior product art director for Learning Compass, a premium 2026 learning workspace/)
  assert.match(settings, /warm off-white editorial planes/)
  assert.match(settings, /persistent rail, command bar, page horizons/)
  assert.match(settings, /Home, Library, Learn, Map, and Settings/)
  assert.match(settings, /Reject generic dashboard card grids/)
  assert.match(settings, /studio\|plex\|inter\|editorial\|newsreader\|jakarta\|system\|terminal\|custom/)
  assert.match(
    studio,
    /:root\[data-theme=['"]continuum['"]\] \.btn-surprise\s*\{[\s\S]*min-width:\s*145px;[\s\S]*min-height:\s*42px;/,
  )
  assert.match(studio, /border-radius:\s*999px;/)
})

test('font presets and typography settings align semantic roles and Arabic support', () => {
  assert.match(theme, /id: 'plex'/)
  assert.match(theme, /id: 'inter'/)
  assert.match(theme, /id: 'editorial'/)
  assert.match(theme, /id: 'newsreader'/)
  assert.match(theme, /id: 'jakarta'/)
  assert.match(theme, /id: 'system'/)
  assert.match(theme, /id: 'terminal'/)
  assert.match(theme, /--font-body/)
  assert.match(theme, /--font-editorial/)
  assert.match(theme, /TYPOGRAPHY_LIMITS/)
  assert.match(settings, /TYPOGRAPHY_LIMITS\[key\]/)
  assert.match(theme, /Noto Sans Arabic/)
  assert.match(theme, /Noto Naskh Arabic/)
  assert.match(settings, /Font family/)
  assert.match(settings, /Detailed typography/)
  assert.match(settings, /Live specimen/)
  assert.match(settings, /العلم النافع/)
})

test('due recall is a focused, responsive retrieval stage', () => {
  assert.match(recallView, /class="recall-review-progress"/)
  assert.match(recallView, /data-state=\{revealed \? 'answer' : 'question'\}/)
  assert.match(recallView, /Pause and retrieve before revealing\./)
  assert.match(recallStyles, /\.recall-prompt\s*\{[\s\S]*font-family: var\(--font-reading\)/)
  assert.match(recallStyles, /\.recall-grades > div\s*\{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(recallStyles, /\.recall-view-switcher\s*\{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/)
})
