import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('successful completion clears a prior lease error', () => {
  const source = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const completionUpdate = source.match(/UPDATE agent_jobs SET status='completed',[^`]+/s)?.[0] || ''

  assert.match(source, /error='Lease expired'/)
  assert.match(completionUpdate, /result_json=\?,error=NULL/)
})
