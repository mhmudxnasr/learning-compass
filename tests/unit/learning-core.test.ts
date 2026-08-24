import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDisposition } from '../../src/services/learning-core.ts'

test('explicit learning disposition is independent from taste score', () => {
  assert.equal(normalizeDisposition('apply'), 'apply')
  assert.equal(normalizeDisposition('drop'), 'drop')
})

test('ratings never infer a learning disposition', () => {
  assert.equal(normalizeDisposition(undefined), 'undecided')
  assert.equal(normalizeDisposition(''), 'undecided')
})
