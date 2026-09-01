import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DURABLE_UNKNOWN_MUTATION_EXPIRES_AT,
  mutationReservationDisposition,
} from '../../src/services/mutation-recovery.ts'

test('mutation reservations distinguish safe retries from unknown commit outcomes', () => {
  for (const status of [200, 201, 204, 299]) assert.equal(mutationReservationDisposition(status), 'store_success')
  for (const status of [400, 401, 404, 409, 422, 429]) assert.equal(mutationReservationDisposition(status), 'release')
  for (const status of [301, 307, 308, 500, 502, 503, 504])
    assert.equal(mutationReservationDisposition(status), 'hold_unknown')
  assert.equal(DURABLE_UNKNOWN_MUTATION_EXPIRES_AT, '9999-12-31 23:59:59')
})
