import assert from 'node:assert/strict'
import test from 'node:test'

import { destinations, destinationForPath, mobilePrimary } from '../../client/src/destinations.ts'

test('the product exposes exactly twenty-eight distinct destinations', () => {
  assert.equal(destinations.length, 28)
  assert.equal(new Set(destinations.map((item) => item.key)).size, 28)
  assert.ok(destinations.every((item) => item.title && item.purpose && item.kind))
})

test('unknown hashes never fall back to an unrelated view', () => {
  assert.equal(destinationForPath('/curate/queue')?.key, 'curate.queue')
  assert.equal(destinationForPath('/not/a-route'), null)
})

test('mobile keeps the daily loop in its primary navigation', () => {
  assert.deepEqual(mobilePrimary, ['today', 'curate', 'learn', 'more'])
})
