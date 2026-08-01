import assert from 'node:assert/strict'
import test from 'node:test'

import { destinations, destinationForPath, mobilePrimary } from '../../client/src/destinations.ts'

test('the product exposes exactly seventeen distinct destinations', () => {
  assert.equal(destinations.length, 17)
  assert.equal(new Set(destinations.map((item) => item.key)).size, 17)
  assert.ok(destinations.every((item) => item.title && item.purpose && item.kind))
})

test('unknown hashes never fall back to an unrelated view', () => {
  assert.equal(destinationForPath('/curate/queue')?.key, 'curate.queue')
  assert.equal(destinationForPath('/vault/files')?.key, 'learn.files')
  assert.equal(destinationForPath('/learn/notebooklm')?.key, 'learn.files')
  assert.equal(destinationForPath('/learn/reflections')?.key, 'learn.notes')
  assert.equal(destinationForPath('/learn/notes?source=rec_1')?.key, 'learn.notes')
  assert.equal(destinationForPath('/map/branches')?.key, 'map.atlas')
  assert.equal(destinationForPath('/learn/review')?.key, 'learn.recall')
  assert.equal(destinationForPath('/insights/memory')?.key, 'insights.hermes')
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
