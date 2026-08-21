import assert from 'node:assert/strict'
import test from 'node:test'
import { LITE_VISUAL_CHECKPOINT_REQUIREMENTS, resolveLiteVisualResume, validateLiteVisualCheckpointEvidence } from '../../src/services/lite-visual-workflow.ts'

const sha = (character: string) => character.repeat(64)

test('Visual Lite extraction checkpoint requires one complete hash-bound source receipt', () => {
  assert.deepEqual(validateLiteVisualCheckpointEvidence('map_coverage', {
    schema_version: 'lite-visual-source-extraction/v1', status: 'complete', method: 'mozilla-readability', content_sha256: sha('a'), cache_key: sha('b'), word_count: 420, manifest_path: '/work/source-extraction.json',
  }), [])
  const failures = validateLiteVisualCheckpointEvidence('map_coverage', { schema_version: 'wrong', status: 'partial', word_count: 0 })
  assert.ok(failures.some((failure) => failure.includes('status must be complete')))
  assert.ok(failures.some((failure) => failure.includes('content_sha256')))
  assert.ok(failures.some((failure) => failure.includes('manifest_path')))
})

test('Visual Lite declares exact evidence for every transition after source resolution', () => {
  assert.deepEqual(Object.keys(LITE_VISUAL_CHECKPOINT_REQUIREMENTS), ['extract_source', 'map_coverage', 'author_html', 'render_pdf', 'validate_pair', 'publish_pair', 'verify_record'])
  assert.deepEqual(validateLiteVisualCheckpointEvidence('author_html', { source_sha256: sha('a'), source_scope_sha256: sha('b'), word_count: 100, span_count: 3 }), [])
  assert.deepEqual(validateLiteVisualCheckpointEvidence('validate_pair', { html_sha256: sha('c'), pdf_sha256: sha('d') }), [])
  assert.deepEqual(validateLiteVisualCheckpointEvidence('render_pdf', { html_sha256: sha('c'), coverage_ledger_sha256: sha('d'), claim_count: 4, canonical_selector: 'article[data-canonical-content=true]' }), [])
  assert.deepEqual(validateLiteVisualCheckpointEvidence('publish_pair', { validation_schema: 'lite-visual-validation/v5', validation_status: 'passed', receipt_sha256: sha('e') }), [])
  assert.deepEqual(validateLiteVisualCheckpointEvidence('verify_record', { pair_id: 'lv-source-v4', html_artifact_id: 'artifact-html', pdf_artifact_id: 'artifact-pdf' }), [])
})

test('Visual Lite retries upgrade legacy workflow payloads instead of resuming obsolete stages', () => {
  assert.deepEqual(resolveLiteVisualResume({ workflow_version: 2, stages: ['resolve_source', 'visual_mind', 'verify'] }, 'resolve_source'), {
    is_current: false,
    resume_from: 'resolve_source',
  })
  assert.deepEqual(resolveLiteVisualResume({ workflow_version: 4, workflow_contract: 'lite-visual-linear/v4' }, 'validate_pair'), {
    is_current: true,
    resume_from: 'validate_pair',
  })
  assert.deepEqual(resolveLiteVisualResume({ workflow_version: 4, workflow_contract: 'lite-visual-linear/v4' }, 'visual_mind'), {
    is_current: true,
    resume_from: 'resolve_source',
  })
})
