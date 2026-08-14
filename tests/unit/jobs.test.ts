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
  assert.match(cancellation, /return c\.json\(\{ error: 'job not cancellable or not found' \}, 409\)/)
})
