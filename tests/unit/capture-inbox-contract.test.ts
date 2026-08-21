import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const captureService = readFileSync(new URL('../../src/services/capture.ts', import.meta.url), 'utf8')
const captureApi = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
const agentCapabilities = readFileSync(new URL('../../src/services/agent-capabilities.ts', import.meta.url), 'utf8')
const captureDialog = readFileSync(new URL('../../client/src/shell/CaptureDialog.tsx', import.meta.url), 'utf8')

test('capture defaults to a captured source record rather than bypassing Queue', () => {
  assert.match(captureService, /input\.initialLearningState \|\| 'captured'/)
  assert.doesNotMatch(captureService, /input\.initialLearningState \|\| 'queued'/)
})

test('global Capture describes the same source-record contract as the API', () => {
  assert.match(captureDialog, /Source saved\./)
  assert.match(captureDialog, /Save source/)
  assert.doesNotMatch(captureDialog, /Captured to Queue\.|Capture to Queue/)
})

test('Captured sources can be branch-mapped but Queue rejects unmapped sources', () => {
  assert.match(captureService, /branch_id=COALESCE\(branch_id,\?\)/)
  assert.match(captureService, /INSERT INTO recommendation_meta \(recommendation_id,learning_state,branch_id,source_metadata_json,updated_at\)/)
  assert.match(captureApi, /cannot capture to a pruned branch/)
  assert.match(captureApi, /branch_mapping_conflict/)
  assert.match(agentCapabilities, /\['source', 'branch_id'\]/)
  assert.match(captureApi, /\['captured','queued','in_progress'\]/)
  assert.match(captureApi, /branch_mapping_required/)
  assert.match(captureApi, /!item\.branch_id \|\| !item\.branch_exists/)
  assert.doesNotMatch(captureApi, /'branch_mapping_source','agy'/)
  assert.match(captureApi, /c\.req\.header\('x-agent-name'\)/)
})
