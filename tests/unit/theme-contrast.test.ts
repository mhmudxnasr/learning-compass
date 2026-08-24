import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeThemeVariables,
  contrastRatio,
  THEME_PRESETS,
  THEME_VARIANTS,
  type CustomPalette,
  type ThemeMode,
} from '../../client/src/theme.ts'

const TEXT_TOKENS = ['--studio-secondary', '--studio-muted'] as const
const TEXT_PLANES = ['--studio-canvas', '--studio-surface'] as const

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

test('preset and paired themes keep secondary and muted text readable', () => {
  for (const preset of THEME_PRESETS) {
    assertAccessibleText(preset.id, {
      brand: preset.swatches[0],
      shell: preset.swatches[1],
      highlight: preset.swatches[2],
      accent: preset.swatches[3],
      ink: preset.ink,
    }, preset.mode)
  }

  for (const variant of THEME_VARIANTS) {
    assertAccessibleText(`${variant.name} day`, variant.day, 'light')
    assertAccessibleText(`${variant.name} night`, variant.night, 'dark')
  }
})

test('custom light and dark palettes cannot collapse quiet text contrast', () => {
  assertAccessibleText('white-brand dark custom', {
    brand: '#ffffff',
    shell: '#111111',
    surface: '#191919',
    highlight: '#222222',
    accent: '#ffffff',
    ink: '#ffffff',
  }, 'dark')

  assertAccessibleText('white-ink light custom', {
    brand: '#111111',
    shell: '#ffffff',
    surface: '#fafafa',
    highlight: '#eeeeee',
    accent: '#111111',
    ink: '#ffffff',
  }, 'light')
})

test('semantic action ink remains readable on custom brand colors', () => {
  for (const brand of ['#ffffff', '#000000', '#777777', '#7a7a7a']) {
    const variables = computeThemeVariables({
      brand,
      shell: '#111111',
      highlight: '#222222',
      accent: '#ffffff',
      ink: '#ffffff',
    }, 'dark')
    const ratio = contrastRatio(variables['--studio-action-ink'], variables['--studio-cypress'])
    assert.ok(ratio !== null && ratio >= 4.5, `${brand} action foreground must remain WCAG AA; received ${ratio}`)
  }
})
