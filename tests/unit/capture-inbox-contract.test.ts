import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const captureService = readFileSync(new URL('../../src/services/capture.ts', import.meta.url), 'utf8')
const captureApi = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
const captureDialog = readFileSync(new URL('../../client/src/shell/CaptureDialog.tsx', import.meta.url), 'utf8')

test('capture defaults to the unlimited Inbox rather than bypassing triage', () => {
  assert.match(captureService, /input\.initialLearningState \|\| 'inbox'/)
  assert.doesNotMatch(captureService, /input\.initialLearningState \|\| 'queued'/)
})

test('global Capture describes the same Inbox contract as the API', () => {
  assert.match(captureDialog, /Captured to Inbox\./)
  assert.match(captureDialog, /Capture to Inbox/)
  assert.doesNotMatch(captureDialog, /Captured to Queue\.|Capture to Queue/)
})

test('Inbox sources can be branch-mapped but Queue rejects unmapped sources', () => {
  assert.match(captureApi, /\['inbox','queued','in_progress'\]/)
  assert.match(captureApi, /branch_mapping_required/)
  assert.match(captureApi, /!item\.branch_id \|\| !item\.branch_exists/)
  assert.doesNotMatch(captureApi, /'branch_mapping_source','agy'/)
  assert.match(captureApi, /c\.req\.header\('x-agent-name'\)/)
})
