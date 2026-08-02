import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeArtifactMultipartMetadata, normalizeQualityAssurance } from '../../src/artifact-metadata.ts'

function uploadForm(fields: Record<string, string>) {
  const form = new FormData()
  form.set('file', new Blob(['artifact'], { type: 'text/html' }), 'companion.html')
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

test('artifact upload accepts Lite Visual revision metadata fields', () => {
  const metadata: Record<string, unknown> = {}
  const result = mergeArtifactMultipartMetadata(metadata, uploadForm({ revision: '3', supersedes_pair_id: 'pair-2', quality_score: '8.5', coverage_status: 'complete' }))
  assert.equal(result.ok, true)
  assert.deepEqual(metadata, {
    revision: '3',
    supersedes_pair_id: 'pair-2',
    coverage_status: 'complete',
    quality_score: 8.5,
  })
})

test('artifact upload rejects invalid quality scores', () => {
  for (const qualityScore of ['not-a-number', '-0.1', '10.1', '']) {
    const result = mergeArtifactMultipartMetadata({}, uploadForm({ quality_score: qualityScore }))
    assert.equal(result.ok, false, qualityScore)
    assert.match(result.failures.join(' '), /quality_score/)
  }
})

test('artifact metadata parses QA booleans and JSON safely', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({
    custom_prompt_applied: 'true', notebook_url_linked: '1', source_indexed: 'false', download_verified: '0',
    qa_checks_json: '{"pdf_render_check":"passed"}', qa_status: 'passed',
  }))
  assert.equal(result.ok, true)
  assert.deepEqual(result.metadata.custom_prompt_applied, true)
  assert.deepEqual(result.metadata.notebook_url_linked, true)
  assert.deepEqual(result.metadata.source_indexed, false)
  assert.deepEqual(result.metadata.qa_checks_json, { pdf_render_check: 'passed' })
})

test('Lite Visual HTML requires complete scored QA evidence', () => {
  const fields = {
    generator: 'lite-visual', role: 'html', quality_score: '8', coverage_status: 'complete', qa_status: 'passed',
    qa_checks_json: JSON.stringify({ source_fidelity: 2, learning_value: 2, composition: 2, visual_intelligence: 1, source_fit: 1, defects: [] }),
  }
  const result = mergeArtifactMultipartMetadata({}, uploadForm(fields))
  assert.equal(result.ok, true)
  const failed = mergeArtifactMultipartMetadata({}, uploadForm({ ...fields, qa_checks_json: JSON.stringify({ source_fidelity: 2, defects: ['clipping'] }) }))
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.some((failure) => /dimensions|defects/.test(failure)))
})

test('Lite Visual PDF requires a passed render check', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'pdf', qa_status: 'passed', qa_checks_json: '{"pdf_render_check":"failed"}' }))
  assert.equal(result.ok, false)
  assert.ok(result.failures.some((failure) => failure.includes('pdf_render_check')))
  const passed = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'pdf', qa_status: 'passed', qa_checks_json: '{"pdf_render_check":"passed"}' }))
  assert.equal(passed.ok, true)
})

test('artifact role cannot bypass the uploaded media contract', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({
    generator: 'lite-visual', role: 'html', quality_score: '8', coverage_status: 'complete', qa_status: 'passed',
    qa_checks_json: JSON.stringify({ source_fidelity: 2, learning_value: 2, composition: 2, visual_intelligence: 1, source_fit: 1, defects: [] }),
  }))
  const pdf = new FormData()
  pdf.set('file', new Blob(['artifact'], { type: 'application/pdf' }), 'companion.pdf')
  for (const [key, value] of Object.entries({
    generator: 'lite-visual', role: 'html', quality_score: '8', coverage_status: 'complete', qa_status: 'passed',
    qa_checks_json: JSON.stringify({ source_fidelity: 2, learning_value: 2, composition: 2, visual_intelligence: 1, source_fit: 1, defects: [] }),
  })) pdf.set(key, value)
  assert.equal(result.ok, true)
  const failed = mergeArtifactMultipartMetadata({}, pdf, pdf.get('file') as File)
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.some((failure) => failure.includes('does not match')))
})

test('NotebookLM video requires cinematic custom-prompt and download QA', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'notebooklm', role: 'video', video_format: 'cinematic', custom_prompt_applied: 'true', source_indexed: 'true', notebook_url_linked: 'true', download_verified: 'true', qa_status: 'passed' }))
  assert.equal(result.ok, true)
  const failed = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'notebooklm', role: 'video', video_format: 'overview', qa_status: 'failed' }))
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.length >= 5)
})

test('normalized quality assurance distinguishes legacy, passed, and repair-required artifacts', () => {
  assert.equal(normalizeQualityAssurance({}, true).status, 'unverified')
  assert.equal(normalizeQualityAssurance({ qa_status: 'passed', quality_score: 8 }).status, 'passed')
  assert.equal(normalizeQualityAssurance({ qa_status: 'failed', repair_reason: 'missing source coverage' }).status, 'repair_required')
  assert.equal(normalizeQualityAssurance({ qa_status: 'repair_required' }).status, 'repair_required')
})
