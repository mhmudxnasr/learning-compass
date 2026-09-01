import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeTypography, TYPOGRAPHY_LIMITS } from '../../client/src/theme.ts'
import { normalizeSettings } from '../../src/services/settings.ts'

test('client typography normalization uses the shared expanded limits', () => {
  const normalized = normalizeTypography({
    baseSize: 99,
    bodyWeight: 100,
    headingWeight: 1200,
    lineHeight: 9,
    letterSpacing: -1,
    displayScale: 8,
    readingMeasure: 12,
  })

  assert.deepEqual(normalized, {
    baseSize: TYPOGRAPHY_LIMITS.baseSize.max,
    bodyWeight: TYPOGRAPHY_LIMITS.bodyWeight.min,
    headingWeight: TYPOGRAPHY_LIMITS.headingWeight.max,
    lineHeight: TYPOGRAPHY_LIMITS.lineHeight.max,
    letterSpacing: TYPOGRAPHY_LIMITS.letterSpacing.min,
    displayScale: TYPOGRAPHY_LIMITS.displayScale.max,
    readingMeasure: TYPOGRAPHY_LIMITS.readingMeasure.min,
  })
})

test('server appearance normalization preserves and clamps the expanded typography contract', () => {
  const resolved = normalizeSettings({
    appearance: {
      theme: 'custom',
      density: 'comfortable',
      typography: {
        baseSize: 30,
        bodyWeight: 250,
        headingWeight: 950,
        lineHeight: 1,
        letterSpacing: 0.25,
        displayScale: 2,
        readingMeasure: 100,
        ignored: 42,
      },
    },
  })

  assert.deepEqual(resolved.appearance.typography, {
    baseSize: 24,
    bodyWeight: 300,
    headingWeight: 900,
    lineHeight: 1.15,
    letterSpacing: 0.1,
    displayScale: 1.5,
    readingMeasure: 90,
  })
})

test('server appearance normalization omits non-finite typography values', () => {
  const resolved = normalizeSettings({ appearance: { typography: { baseSize: Number.NaN, bodyWeight: '400' } } })
  assert.equal(resolved.appearance.typography, undefined)
})
