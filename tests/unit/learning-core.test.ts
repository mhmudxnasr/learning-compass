import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDisposition } from '../../src/services/learning-core.ts'

test('explicit learning disposition is independent from taste score', () => {
  assert.equal(normalizeDisposition('apply', 3), 'apply')
  assert.equal(normalizeDisposition('drop', 10), 'drop')
})

test('legacy feedback retains the old seven-plus extraction behavior', () => {
  assert.equal(normalizeDisposition(undefined, 7), 'retain')
  assert.equal(normalizeDisposition(undefined, 5), 'undecided')
})
