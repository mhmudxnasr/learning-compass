import assert from 'node:assert/strict'
import test from 'node:test'

import { destinations, destinationForPath, mobilePrimary } from '../../client/src/destinations.ts'

test('the product exposes exactly twenty-nine distinct destinations', () => {
  assert.equal(destinations.length, 29)
  assert.equal(new Set(destinations.map((item) => item.key)).size, 29)
  assert.ok(destinations.every((item) => item.title && item.purpose && item.kind))
})

test('unknown hashes never fall back to an unrelated view', () => {
  assert.equal(destinationForPath('/curate/queue')?.key, 'curate.queue')
  assert.equal(destinationForPath('/vault/files')?.key, 'learn.files')
  assert.equal(destinationForPath('/learn/notebooklm')?.key, 'learn.notebooklm')
  assert.equal(destinationForPath('/learn/sessions')?.key, 'curate.queue')
  assert.equal(destinationForPath('/not/a-route'), null)
})

test('mobile keeps the daily loop in its primary navigation', () => {
  assert.deepEqual(mobilePrimary, ['today', 'curate', 'learn', 'more'])
})

test('learn files destination maps correctly for artifact auto-push', () => {
  const dest = destinationForPath('/learn/files')
  assert.ok(dest)
  assert.equal(dest.key, 'learn.files')
  assert.equal(dest.endpoint, '/artifacts')
})
