import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCapture } from '../../src/services/capture.ts'

const captureService = readFileSync(new URL('../../src/services/capture.ts', import.meta.url), 'utf8')
const captureApi = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
const agentCapabilities = readFileSync(new URL('../../src/services/agent-capabilities.ts', import.meta.url), 'utf8')
const captureDialog = readFileSync(new URL('../../client/src/shell/CaptureDialog.tsx', import.meta.url), 'utf8')

class HistoricalCaptureDatabase {
  batches: Array<Array<{ sql: string; args: unknown[] }>> = []
  history = { id: 'canonical-source', status: 'active', branch_id: 'branch-a' }
  statements: Array<{ sql: string; args: unknown[] }> = []

  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      first: async () => (sql.includes('FROM source_url_replacements history') ? this.history : null),
      run: async () => ({ meta: { changes: 1 } }),
    }
    this.statements.push(statement)
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.batches.push(statements)
    return []
  }
}

test('capture defaults to a captured source record rather than bypassing Queue', () => {
  assert.match(captureService, /input\.initialLearningState \|\| 'captured'/)
  assert.doesNotMatch(captureService, /input\.initialLearningState \|\| 'queued'/)
})

test('global Capture describes the same source-record contract as the API', () => {
  assert.match(captureDialog, /Source saved\./)
  assert.match(captureDialog, /Save source/)
  assert.doesNotMatch(captureDialog, /Captured to Queue\.|Capture to Queue/)
})

test('global Capture preserves focus and cannot dismiss an in-flight save', () => {
  assert.match(captureDialog, /requestAnimationFrame\(\(\) =>\s*document\.getElementById/)
  assert.match(captureDialog, /if \(!saving\) onClose\(\)/)
  assert.match(captureDialog, /disabled=\{saving\}/)
  assert.doesNotMatch(captureDialog, /\[open, kind\]/)
})

test('Captured sources can be branch-mapped but Queue rejects unmapped sources', () => {
  assert.match(captureService, /branch_id=COALESCE\(branch_id,\?\)/)
  assert.match(
    captureService,
    /INSERT INTO recommendation_meta \(recommendation_id,learning_state,branch_id,source_metadata_json,updated_at\)/,
  )
  assert.match(captureApi, /cannot capture to a pruned branch/)
  assert.match(captureApi, /branch_mapping_conflict/)
  assert.match(agentCapabilities, /\['source', 'branch_id'\]/)
  assert.match(captureApi, /\[\s*'captured',\s*'queued',\s*'in_progress',\s*'completed',\s*'excluded'\s*\]/)
  assert.match(captureApi, /branch_mapping_required/)
  assert.match(captureApi, /if \(!branchId\) return c\.json\(\{ error: 'branch_id required' \}/)
  assert.match(captureApi, /!item\.branch_id \|\| !item\.branch_exists/)
  assert.doesNotMatch(captureApi, /'branch_mapping_source','agy'/)
  assert.match(captureApi, /c\.req\.header\('x-agent-name'\)/)
  assert.match(captureDialog, /id="capture-branch-input"/)
  assert.match(captureDialog, /branch_id: branchId/)
})

test('capturing a former canonical URL resolves replacement lineage and preserves branch conflict review', async () => {
  const sameBranch = new HistoricalCaptureDatabase()
  const reused = await createCapture(sameBranch as any, {
    source: 'https://old.example/article/?utm_source=android',
    branch: { id: 'branch-a', confidence: 'high', source: 'user_share' },
  })
  assert.equal(reused.id, 'canonical-source')
  assert.equal(reused.duplicate, true)
  assert.equal(reused.branch_id, 'branch-a')
  const historyLookup = sameBranch.statements.find((statement) =>
    statement.sql.includes('FROM source_url_replacements history'),
  )
  assert.equal(historyLookup?.args[1], 'https://old.example/article')
  assert.equal(sameBranch.batches.length, 1)

  const conflictingBranch = new HistoricalCaptureDatabase()
  const conflict = await createCapture(conflictingBranch as any, {
    source: 'https://old.example/article',
    branch: { id: 'branch-b', confidence: 'high', source: 'user_share' },
  })
  assert.deepEqual(conflict, {
    id: 'canonical-source',
    duplicate: true,
    status: 'active',
    dedup: conflict.dedup,
    branchConflict: 'branch-a',
  })
  assert.equal(conflictingBranch.batches.length, 0)
})

test('Lite Visual revisions require the exact ready pair and immutable job lineage', () => {
  const visualise = captureApi.match(/app\.post\('\/:id\/visualise',[\s\S]*?\n\}\)\n\napp\.get\('\/:id'/)?.[0] || ''
  assert.match(captureApi, /body\.force_revision === true/)
  assert.match(captureApi, /body\.supersedes_pair_id !== pairId/)
  assert.match(captureApi, /ready_pair_revision_precondition_failed/)
  assert.match(visualise, /revision_of_pair_id/)
  assert.match(visualise, /revisionIdempotencyPrefix = `visualise-source:\$\{item\.id\}:revision:`/)
  assert.match(visualise, /forceRevision \? `\$\{revisionIdempotencyPrefix\}\$\{workflowRunId\}`/)
  assert.match(visualise, /status IN \('pending','retry','running','awaiting_activation'\)/)
  assert.match(visualise, /instr\(idempotency_key,\?\)=1/)
  assert.match(visualise, /const jobId = !forceRevision && existing \? existing\.id : `job_/)
  assert.match(visualise, /if \(!forceRevision && existing\) \{[\s\S]*?UPDATE agent_jobs/)
  assert.doesNotMatch(visualise, /forceRevision \? \{ is_current: false, resume_from: 'resolve_source' \}/)
})
