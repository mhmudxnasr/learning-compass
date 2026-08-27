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

test('surprise themes use randomized extreme art directions', () => {
  const enhance = readFileSync(new URL('../../src/api/enhance.ts', import.meta.url), 'utf8')
  assert.match(enhance, /SURPRISE_DIRECTIONS/)
  assert.match(enhance, /Near-black and white monochrome/)
  assert.match(enhance, /High-chroma color collision/)
  assert.match(enhance, /Math\.random\(\) \* SURPRISE_DIRECTIONS\.length/)
  assert.match(enhance, /do not copy any website's exact branding/)
})
