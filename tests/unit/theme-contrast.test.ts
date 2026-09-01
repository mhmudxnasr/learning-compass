import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditThemeContrast,
  computeThemeVariables,
  contrastRatio,
  THEME_PRESETS,
  THEME_VARIANTS,
  type CustomPalette,
  type ThemeMode,
} from '../../client/src/theme.ts'

const TEXT_TOKENS = ['--studio-ink', '--studio-secondary', '--studio-muted'] as const
const TEXT_PLANES = ['--studio-shell', '--studio-canvas', '--studio-surface'] as const

function assertAccessibleText(label: string, palette: CustomPalette, mode: ThemeMode) {
  const variables = computeThemeVariables(palette, mode)

  for (const token of TEXT_TOKENS) {
    for (const plane of TEXT_PLANES) {
      const ratio = contrastRatio(variables[token], variables[plane])
      assert.ok(ratio !== null && ratio >= 4.5, `${label} ${token} must remain WCAG AA on ${plane}; received ${ratio}`)
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
    const variables = computeThemeVariables(
      {
        brand,
        shell: '#111111',
        highlight: '#222222',
        accent: '#ffffff',
        ink: '#ffffff',
        rail: brand,
        map: brand,
        due: brand,
        danger: brand,
      },
      'dark',
    )
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
