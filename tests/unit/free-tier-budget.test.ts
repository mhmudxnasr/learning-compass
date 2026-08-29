import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CLOUDFLARE_FREE_READ_LIMIT,
  CLOUDFLARE_FREE_WRITE_LIMIT,
  DAILY_READ_BUDGET,
  DAILY_WRITE_BUDGET,
  describeFreeTierUsage,
  getFreeTierBudgetPolicy,
  reserveFreeTierBudget,
  secondsUntilUtcReset,
} from '../../src/services/free-tier-budget.ts'

test('free-tier budget preserves the declared provider headroom', () => {
  assert.equal(DAILY_READ_BUDGET, 4_000_000)
  assert.equal(DAILY_WRITE_BUDGET, 70_000)
  assert.equal(CLOUDFLARE_FREE_READ_LIMIT, 5_000_000)
  assert.equal(CLOUDFLARE_FREE_WRITE_LIMIT, 100_000)
  assert.deepEqual(getFreeTierBudgetPolicy(), {
    ok: true,
    reads: { budget: 4_000_000, cloudflare_limit: 5_000_000, headroom: 1_000_000, required_headroom: 1_000_000 },
    writes: { budget: 70_000, cloudflare_limit: 100_000, headroom: 30_000, required_headroom: 30_000 },
    blockers: [],
  })
  assert.deepEqual(getFreeTierBudgetPolicy(5_000_000, 100_000).blockers, [
    'read_budget_missing_required_headroom',
    'write_budget_missing_required_headroom',
  ])
})

test('free-tier health evidence separates internal budgets, provider limits, and headroom', () => {
  assert.deepEqual(describeFreeTierUsage({ estimated_rows_read: 12_345, estimated_rows_written: 67 }), {
    reads: { estimated: 12_345, budget: 4_000_000, cloudflare_limit: 5_000_000, headroom: 1_000_000, required_headroom: 1_000_000 },
    writes: { estimated: 67, budget: 70_000, cloudflare_limit: 100_000, headroom: 30_000, required_headroom: 30_000 },
    policy: { ok: true, blockers: [] },
  })
})

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
