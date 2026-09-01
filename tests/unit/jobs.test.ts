import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('successful completion clears a prior lease error', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const completionUpdate = source.match(/UPDATE agent_jobs SET status='completed',[^`]+/s)?.[0] || ''

  assert.match(source, /error='Lease expired'/)
  assert.match(completionUpdate, /result_json=\?,error=NULL/)
})

test('job cancellation is guarded to pending and retry jobs', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const cancellation = source.match(/app\.post\('\/:id\/cancel',[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(cancellation, /status IN \('pending','retry'\)/)
  assert.doesNotMatch(cancellation, /status IN \('pending','running','retry'\)/)
  assert.match(cancellation, /status='cancelled'/)
  assert.match(cancellation, /error='Cancelled by user'/)
  assert.match(cancellation, /lease_owner=NULL,lease_expires_at=NULL/)
  assert.doesNotMatch(cancellation, /lease_principal/)
  assert.match(cancellation, /return c\.json\(\{ error: 'job not cancellable or not found' \}, 409\)/)
})

test('Visual Lite checkpoints are leased, linear, and resumable', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const checkpoint = source.match(/app\.post\('\/:id\/checkpoint',[\s\S]*?\n\}\)/)?.[0] || ''
  assert.match(checkpoint, /job\.status !== 'running'/)
  assert.match(checkpoint, /nextIndex < currentIndex \|\| nextIndex > currentIndex \+ 1/)
  assert.match(checkpoint, /validateLiteVisualCheckpointEvidence/)
  assert.match(checkpoint, /lite_visual_checkpoint_evidence_invalid/)
  assert.match(checkpoint, /resume_from: step/)
  assert.match(checkpoint, /workflow_step=\?/)
})

test('Visual Lite cannot complete before exact pair verification', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  assert.match(source, /job\.workflow_step !== 'verify_record'/)
  assert.match(source, /Lite Visual completion requires one verified atomic HTML\/PDF pair/)
})

test('staged Visual Lite releases its exact workflow lease while awaiting corpus activation', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const completion = source.match(/app\.post\('\/:id\/complete',[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(completion, /WHERE job_id=\? AND workflow_run_id=\? AND state='staged'/)
  assert.match(completion, /job\.workflow_step !== 'publish_pair'/)
  assert.match(completion, /body\.receipt_sha256 != null && body\.receipt_sha256 !== stagedPair\.receipt_sha256/)
  assert.match(completion, /receipt_sha256: stagedPair\.receipt_sha256/)
  assert.match(completion, /SET status='awaiting_activation'/)
  assert.match(completion, /lease_owner=NULL,lease_expires_at=NULL/)
  assert.match(
    completion,
    /WHERE id=\? AND workflow_run_id=\? AND workflow_step='publish_pair' AND status='running' AND lease_owner=\?/,
  )
  assert.match(completion, /status: 'awaiting_activation'/)
})

test('awaiting activation is observable but cannot be claimed or lease-expired', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const active = source.match(/app\.get\('\/active',[\s\S]*?\n\}\)/)?.[0] || ''
  const health = source.match(/app\.get\('\/health',[\s\S]*?\n\}\)/)?.[0] || ''
  const claim = source.match(/app\.post\('\/:id\/claim',[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(active, /status IN \('pending','running','retry','awaiting_activation'\)/)
  assert.match(health, /\['pending', 'running', 'retry', 'awaiting_activation'\]/)
  assert.match(health, /active_jobs: activeJobs/)
  assert.match(claim, /WHERE status='running' AND lease_expires_at<datetime\('now'\)/)
  assert.match(claim, /status IN \('pending','retry'\)/)
  assert.doesNotMatch(claim, /awaiting_activation/)
})
