import assert from 'node:assert/strict'
import test from 'node:test'
import { DAILY_READ_BUDGET, DAILY_WRITE_BUDGET, reserveFreeTierBudget, secondsUntilUtcReset } from '../../src/services/free-tier-budget.ts'

test('free-tier budget reserves conservative route costs atomically', async () => {
  let query = ''
  let bindings: unknown[] = []
  const DB = { prepare(sql: string) { query = sql; return { bind(...values: unknown[]) { bindings = values; return { run: async () => ({ meta: { changes: 1 } }) } } } } } as unknown as D1Database
  const result = await reserveFreeTierBudget(DB, 'GET', '/recommendations/list')
  assert.deepEqual(result, { allowed: true, read: 5_000, written: 0 })
  assert.match(query, /ON CONFLICT\(day_utc\) DO UPDATE/)
  assert.deepEqual(bindings.slice(-2), [DAILY_READ_BUDGET, DAILY_WRITE_BUDGET])
})

test('free-tier budget blocks rejected reservations and resets at UTC midnight', async () => {
  const DB = { prepare() { return { bind() { return { run: async () => ({ meta: { changes: 0 } }) } } } } } as unknown as D1Database
  assert.equal((await reserveFreeTierBudget(DB, 'POST', '/capture')).allowed, false)
  assert.equal(secondsUntilUtcReset(new Date('2026-08-24T23:59:30Z')), 30)
})
