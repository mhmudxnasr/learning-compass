import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReleaseSnapshot } from '../../scripts/release-status-lib.mjs'

const requiredSchema = ['release_table', 'release_trigger']
const evidence = (readBudget = 4_000_000, writeBudget = 70_000) => ({
  observedAt: '2026-08-29T04:34:28.000Z',
  origin: 'https://example.test',
  source: { commit_sha: 'abc123', branch: 'task', dirty: false },
  deployments: [{ created_on: '2026-08-29T02:01:30.598Z', versions: [{ version_id: 'worker-v2', percentage: 100 }] }],
  d1Results: [
    { success: true, results: [{ name: '0068_release.sql', applied_at: '2026-08-28 09:15:29' }] },
    { success: true, results: requiredSchema.map((name) => ({ name, type: name.endsWith('trigger') ? 'trigger' : 'table' })) },
    { success: true, results: [{ id: 'backup-1', status: 'verified', restore_rehearsed_at: '2026-08-28 13:22:08' }] },
    { success: true, results: [{ corpora: 0, targets: 0, active_corpora: 0, pairs: 452 }] },
  ],
  live: { ok: true, status: 'live', now: '2026-08-29T04:34:28.000Z' },
  readiness: {
    ok: true,
    status: 'healthy',
    blockers: [],
    release: { bindings: { d1: true, r2: true }, signing_secret_configured: true },
  },
  budget: {
    day_utc: '2026-08-29',
    reads: { estimated: 25_970, budget: readBudget, cloudflare_limit: 5_000_000 },
    writes: { estimated: 12, budget: writeBudget, cloudflare_limit: 100_000 },
  },
  localMigrations: ['0068_release.sql'],
  requiredSchema,
  requiredReadHeadroom: 1_000_000,
  requiredWriteHeadroom: 30_000,
})

test('release snapshot reconciles deployment, migration, schema, recovery, budget, and corpus truth', () => {
  const snapshot = buildReleaseSnapshot(evidence())
  assert.equal(snapshot.format, 'learning-compass-release-status-v1')
  assert.equal(snapshot.production.deployment.version_id, 'worker-v2')
  assert.deepEqual(snapshot.production.migrations.pending_local, [])
  assert.equal(snapshot.production.schema.missing.length, 0)
  assert.equal(snapshot.production.budget.reads.headroom, 1_000_000)
  assert.equal(snapshot.production.budget.writes.headroom, 30_000)
  assert.equal(snapshot.production.recovery.latest_verified.id, 'backup-1')
  assert.deepEqual(snapshot.production.corpus, { corpora: 0, targets: 0, active_corpora: 0, pairs: 452 })
  assert.deepEqual(snapshot.policy, { ok: true, blockers: [] })
})

test('release snapshot exposes provider-maximum budgets as release blockers', () => {
  const snapshot = buildReleaseSnapshot(evidence(5_000_000, 100_000))
  assert.deepEqual(snapshot.policy, {
    ok: false,
    blockers: ['read_budget_missing_required_headroom', 'write_budget_missing_required_headroom'],
  })
})
