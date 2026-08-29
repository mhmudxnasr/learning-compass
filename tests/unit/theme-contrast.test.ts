import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  auditThemeContrast,
  computeThemeVariables,
  contrastRatio,
  FONT_PRESETS,
  THEME_PRESETS,
  THEME_VARIANTS,
  VISUAL_PRESETS,
  type CustomPalette,
  type ThemeMode,
} from '../../client/src/theme.ts'

const clientIndex = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8')

const TEXT_TOKENS = ['--studio-ink', '--studio-secondary', '--studio-muted'] as const
const TEXT_PLANES = ['--studio-shell', '--studio-canvas', '--studio-surface'] as const

function assertAccessibleText(label: string, palette: CustomPalette, mode: ThemeMode) {
  const variables = computeThemeVariables(palette, mode)

  for (const token of TEXT_TOKENS) {
    for (const plane of TEXT_PLANES) {
      const ratio = contrastRatio(variables[token], variables[plane])
      assert.ok(
        ratio !== null && ratio >= 4.5,
        `${label} ${token} must remain WCAG AA on ${plane}; received ${ratio}`,
      )
    }
  }
}

function assertRenderedAudit(label: string, palette: CustomPalette, mode: ThemeMode) {
  for (const check of auditThemeContrast(palette, mode)) {
    assert.equal(check.passes, true, `${label} ${check.label} must pass; received ${check.ratio}`)
    assert.ok(check.ratio !== null && check.ratio >= check.minimum)
  }
}

test('preset and paired themes keep rendered semantic text readable', () => {
  for (const preset of THEME_PRESETS) {
    const palette = {
      brand: preset.swatches[0],
      shell: preset.swatches[1],
      highlight: preset.swatches[2],
      accent: preset.swatches[3],
      ink: preset.ink,
      surface: preset.surface,
      rail: preset.rail,
      seam: preset.seam,
      due: preset.due,
      danger: preset.danger,
      map: preset.map,
    }
    assertAccessibleText(preset.id, palette, preset.mode)
    assertRenderedAudit(preset.id, palette, preset.mode)
  }

  for (const variant of THEME_VARIANTS) {
    assertAccessibleText(`${variant.name} day`, variant.day, 'light')
    assertAccessibleText(`${variant.name} night`, variant.night, 'dark')
    assertRenderedAudit(`${variant.name} day`, variant.day, 'light')
    assertRenderedAudit(`${variant.name} night`, variant.night, 'dark')
  }
})

test('complete workspace presets bind every art direction to a real loaded font system', () => {
  assert.equal(VISUAL_PRESETS.length, THEME_PRESETS.length)
  assert.equal(new Set(VISUAL_PRESETS.map((preset) => preset.id)).size, VISUAL_PRESETS.length)
  assert.equal(new Set(VISUAL_PRESETS.map((preset) => preset.theme)).size, THEME_PRESETS.length)
  assert.equal(new Set(VISUAL_PRESETS.map((preset) => preset.inspiration)).size, VISUAL_PRESETS.length)
  assert.equal(new Set(VISUAL_PRESETS.map((preset) => preset.font)).size, VISUAL_PRESETS.length)

  for (const preset of VISUAL_PRESETS) {
    const theme = THEME_PRESETS.find((candidate) => candidate.id === preset.theme)
    const font = FONT_PRESETS.find((candidate) => candidate.id === preset.font)
    assert.ok(theme, `${preset.name} must reference a shipped theme`)
    assert.ok(font, `${preset.name} must reference a shipped font system`)
    assert.match(preset.inspiration, /^Inspired by /, `${preset.name} must name its premium product reference`)
    assert.ok(preset.typography.readingMeasure >= 45 && preset.typography.readingMeasure <= 75)

    if (font?.id !== 'system') {
      const primaryFamily = font?.ui.match(/"([^"]+)"/)?.[1]
      assert.ok(primaryFamily, `${preset.name} must expose a primary UI family`)
      assert.match(clientIndex.replaceAll('+', ' '), new RegExp(`family=${primaryFamily!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    }
  }

  for (const theme of THEME_PRESETS) {
    for (const signal of ['ink', 'surface', 'rail', 'seam', 'due', 'danger', 'map'] as const) {
      assert.ok(theme[signal], `${theme.name} must author ${signal} explicitly`)
    }
  }
})

test('custom light and dark palettes correct unreadable primary and quiet text', () => {
  const darkPalette: CustomPalette = {
    brand: '#ffffff',
    shell: '#111111',
    surface: '#191919',
    highlight: '#222222',
    accent: '#ffffff',
    ink: '#111111',
  }
  const lightPalette: CustomPalette = {
    brand: '#111111',
    shell: '#ffffff',
    surface: '#fafafa',
    highlight: '#eeeeee',
    accent: '#111111',
    ink: '#ffffff',
  }

  assertAccessibleText('dark custom', darkPalette, 'dark')
  assertAccessibleText('light custom', lightPalette, 'light')
  assert.notEqual(computeThemeVariables(darkPalette, 'dark')['--studio-ink'], darkPalette.ink)
  assert.notEqual(computeThemeVariables(lightPalette, 'light')['--studio-ink'], lightPalette.ink)
})

test('derived contrast correction never mutates the authored palette', () => {
  const palette: CustomPalette = {
    brand: '#fefefe',
    shell: '#ffffff',
    surface: '#f8f8f8',
    highlight: '#eeeeee',
    accent: '#222222',
    ink: '#ffffff',
    rail: '#777777',
    seam: '#dddddd',
    due: '#777777',
    danger: '#7a7a7a',
    map: '#767676',
  }
  const authored = structuredClone(palette)

  computeThemeVariables(palette, 'light')
  auditThemeContrast(palette, 'light')

  assert.deepEqual(palette, authored)
})

test('semantic foregrounds remain readable on functional colors', () => {
  for (const brand of ['#ffffff', '#000000', '#777777', '#7a7a7a']) {
    const variables = computeThemeVariables({
      brand,
      shell: '#111111',
      highlight: '#222222',
      accent: '#ffffff',
      ink: '#ffffff',
      rail: brand,
      map: brand,
      due: brand,
      danger: brand,
    }, 'dark')
    for (const [foreground, background] of [
      ['--studio-action-ink', '--studio-cypress'],
      ['--studio-rail-ink', '--studio-rail'],
      ['--studio-map-ink', '--studio-map'],
      ['--studio-due-ink', '--studio-due'],
      ['--studio-danger-ink', '--studio-danger'],
    ] as const) {
      const ratio = contrastRatio(variables[foreground], variables[background])
      assert.ok(ratio !== null && ratio >= 4.5, `${brand} ${foreground} must remain WCAG AA; received ${ratio}`)
    }
  }
})
