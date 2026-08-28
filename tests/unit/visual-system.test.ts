import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const theme = readFileSync(new URL('../../client/src/theme.ts', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../../client/src/studio.css', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../../client/src/workspaces/SettingsWorkspace.tsx', import.meta.url), 'utf8')

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

test('surprise themes use randomized extreme art directions and reject unreadable output', () => {
  const enhance = readFileSync(new URL('../../src/api/enhance.ts', import.meta.url), 'utf8')
  assert.match(enhance, /SURPRISE_DIRECTIONS/)
  assert.match(enhance, /Near-black and white monochrome/)
  assert.match(enhance, /High-chroma color collision/)
  assert.match(enhance, /Math\.random\(\) \* SURPRISE_DIRECTIONS\.length/)
  assert.match(enhance, /do not copy any website's exact branding/)
  assert.match(enhance, /hasAccessibleThemeInk/)
  assert.match(enhance, /\['shell', 'surface'\]\.every/)
  assert.match(enhance, /!hasAccessibleThemeInk\(day\).*!hasAccessibleThemeInk\(night\)/s)
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
