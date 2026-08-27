import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDataQualityReport, type DataQualityInputs } from '../../src/services/data-quality.ts'

const healthy: DataQualityInputs = {
  sources: {
    total: 42,
    stored_total: 47,
    invalid_identity: 0,
    missing_branch: 0,
    invalid_branch: 0,
    duplicate_groups: 0,
    duplicate_rows: 0,
  },
  events: { total: 18, invalid: 0 },
  feeds: { total: 3, invalid_branch: 0 },
}

test('data-quality report exposes explicit passing contracts without an opaque score', () => {
  const report = buildDataQualityReport(healthy, '2026-08-25T12:00:00.000Z')
  assert.equal(report.status, 'trusted')
  assert.deepEqual(report.summary, { passing: 5, failing: 0, total: 5 })
  assert.equal(report.checks.every((check) => check.status === 'passing'), true)
  assert.equal(report.checks.find((check) => check.id === 'source_branch')?.coverage_percent, 100)
  assert.equal(report.scope, 'active_sources')
  assert.deepEqual(report.counts, { active_sources: 42, stored_sources: 47, learning_events: 18, enabled_feeds: 3 })
})

test('data-quality report names affected records and keeps dimensions separate', () => {
  const report = buildDataQualityReport({
    sources: { ...healthy.sources, invalid_identity: 1, missing_branch: 2, invalid_branch: 1, duplicate_groups: 1, duplicate_rows: 2 },
    events: { total: 20, invalid: 1 },
    feeds: { total: 4, invalid_branch: 1 },
  })
  assert.equal(report.status, 'needs_attention')
  assert.deepEqual(report.summary, { passing: 0, failing: 5, total: 5 })
  const branch = report.checks.find((check) => check.id === 'source_branch')
  assert.equal(branch?.affected, 3)
  assert.equal(branch?.coverage_percent, 92.86)
  assert.match(branch?.message || '', /3 active source records/)
  assert.equal(report.checks.find((check) => check.id === 'source_uniqueness')?.affected, 2)
  assert.equal(report.checks.find((check) => check.id === 'feed_branch_defaults')?.dimension, 'validity')
})

test('empty datasets pass vacuous contracts at full coverage', () => {
  const report = buildDataQualityReport({
    sources: { total: 0, stored_total: 0, invalid_identity: 0, missing_branch: 0, invalid_branch: 0, duplicate_groups: 0, duplicate_rows: 0 },
    events: { total: 0, invalid: 0 },
    feeds: { total: 0, invalid_branch: 0 },
  })
  assert.equal(report.status, 'trusted')
  assert.equal(report.checks.every((check) => check.coverage_percent === 100), true)
})
