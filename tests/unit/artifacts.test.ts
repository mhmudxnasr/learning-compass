import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeArtifactMultipartMetadata, normalizeQualityAssurance, validateArtifactIntegrity } from '../../src/artifact-metadata.ts'

function uploadForm(fields: Record<string, string>) {
  const form = new FormData()
  form.set('file', new Blob(['artifact'], { type: 'text/html' }), 'companion.html')
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

test('artifact upload accepts Lite Visual revision metadata fields', () => {
  const metadata: Record<string, unknown> = {}
  const result = mergeArtifactMultipartMetadata(metadata, uploadForm({ revision: '3', supersedes_pair_id: 'pair-2' }))
  assert.equal(result.ok, true)
  assert.deepEqual(metadata, {
    revision: '3',
    supersedes_pair_id: 'pair-2',
  })
})

test('artifact metadata keeps media booleans', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({
    custom_prompt_applied: 'true', notebook_url_linked: '1', source_indexed: 'false', download_verified: '0',
  }))
  assert.equal(result.ok, true)
  assert.deepEqual(result.metadata.custom_prompt_applied, true)
  assert.deepEqual(result.metadata.notebook_url_linked, true)
  assert.deepEqual(result.metadata.source_indexed, false)
})

test('Lite Visual HTML and PDF do not require QA metadata', () => {
  assert.equal(mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'html' })).ok, true)
  assert.equal(mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'pdf' })).ok, true)
})

test('learning companions accept only supported recommended starting media', () => {
  assert.equal(mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'html', recommended_start: 'html' })).ok, true)
  const invalid = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'html', recommended_start: 'audio' }))
  assert.equal(invalid.ok, false)
})

test('artifact integrity accepts real HTML and PDF signatures', () => {
  assert.deepEqual(validateArtifactIntegrity({ role: 'html' }, { name: 'companion.html', type: 'text/html' }, new TextEncoder().encode('<!doctype html><html></html>').buffer), [])
  assert.deepEqual(validateArtifactIntegrity({ role: 'pdf' }, { name: 'companion.pdf', type: 'application/pdf' }, new TextEncoder().encode('%PDF-1.7').buffer), [])
  assert.ok(validateArtifactIntegrity({ role: 'pdf' }, { name: 'companion.pdf', type: 'application/pdf' }, new TextEncoder().encode('<html>').buffer).some((failure) => failure.includes('PDF signature')))
})

test('artifact role cannot bypass the uploaded media contract', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({
    generator: 'lite-visual', role: 'html',
  }))
  const pdf = new FormData()
  pdf.set('file', new Blob(['artifact'], { type: 'application/pdf' }), 'companion.pdf')
  for (const [key, value] of Object.entries({
    generator: 'lite-visual', role: 'html',
  })) pdf.set(key, value)
  assert.equal(result.ok, true)
  const failed = mergeArtifactMultipartMetadata({}, pdf, pdf.get('file') as File)
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.some((failure) => failure.includes('does not match')))
})

test('NotebookLM video requires cinematic custom-prompt and download QA', () => {
  const videoForm = (fields: Record<string, string>) => {
    const form = new FormData()
    form.set('file', new Blob(['artifact'], { type: 'video/mp4' }), 'companion.mp4')
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    return form
  }
  const result = mergeArtifactMultipartMetadata({}, videoForm({ generator: 'notebooklm', role: 'video', video_format: 'cinematic', custom_prompt_applied: 'true', source_indexed: 'true', notebook_url_linked: 'true', download_verified: 'true', qa_status: 'passed' }))
  assert.equal(result.ok, true)
  const failed = mergeArtifactMultipartMetadata({}, videoForm({ generator: 'notebooklm', role: 'video', video_format: 'overview', qa_status: 'failed' }))
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.length >= 5)
})

test('legacy quality state remains compatible while Lite Visual has no gate', () => {
  assert.equal(normalizeQualityAssurance({}, true).status, 'unverified')
  assert.equal(normalizeQualityAssurance({ generator: 'lite-visual', role: 'html' }).status, 'unverified')
  assert.equal(normalizeQualityAssurance({ generator: 'notebooklm', role: 'video', qa_status: 'failed' }).status, 'repair_required')
})
