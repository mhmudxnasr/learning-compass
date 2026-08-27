import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { inspectArtifactContent, LITE_VISUAL_RECEIPT_SCHEMA, LITE_VISUAL_WORKFLOW_CONTRACT, mergeArtifactMultipartMetadata, normalizeQualityAssurance, sha256Hex, validateArtifactIntegrity, validateLiteVisualPair } from '../../src/artifact-metadata.ts'

let artifactsApp: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  artifactsApp = (await vite.ssrLoadModule('/src/api/artifacts.ts')).default
})

test.after(async () => { await vite.close() })

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

test('Lite Visual HTML and PDF cannot bypass atomic pair publication', () => {
  const html = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'html' }))
  const pdf = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'pdf' }))
  assert.equal(html.ok, false)
  assert.equal(pdf.ok, false)
  assert.ok(!html.ok && html.failures.some((failure) => failure.includes('/artifacts/pairs')))
})

test('learning companions accept only supported recommended starting media', () => {
  assert.equal(mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'other', role: 'html', recommended_start: 'html' })).ok, true)
  const invalid = mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'lite-visual', role: 'html', recommended_start: 'audio' }))
  assert.equal(invalid.ok, false)
})

test('artifact integrity accepts real HTML and PDF signatures', () => {
  assert.deepEqual(validateArtifactIntegrity({ role: 'html' }, { name: 'companion.html', type: 'text/html' }, new TextEncoder().encode('<!doctype html><html></html>').buffer), [])
  assert.deepEqual(validateArtifactIntegrity({ role: 'pdf' }, { name: 'companion.pdf', type: 'application/pdf' }, new TextEncoder().encode('%PDF-1.7').buffer), [])
  assert.ok(validateArtifactIntegrity({ role: 'pdf' }, { name: 'companion.pdf', type: 'application/pdf' }, new TextEncoder().encode('<html>').buffer).some((failure) => failure.includes('PDF signature')))
})

test('artifact inspection rejects active or disguised content before R2 storage', () => {
  const cases = [
    [{}, { name: 'payload.svg', type: 'image/svg+xml' }, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    [{}, { name: 'notes.txt', type: 'text/plain' }, '<?xml version="1.0"?><svg onload="alert(1)"/>'],
    [{ role: 'html' }, { name: 'companion.html', type: 'text/html' }, '<!doctype html><html><body><script>alert(1)</script></body></html>'],
    [{ role: 'html' }, { name: 'companion.html', type: 'text/html' }, '<!doctype html><html><body onload="alert(1)"></body></html>'],
    [{ role: 'pdf' }, { name: 'companion.pdf', type: 'application/pdf' }, '<!doctype html><html></html>'],
  ] as const
  for (const [metadata, file, body] of cases) {
    const result = inspectArtifactContent(metadata, file, new TextEncoder().encode(body).buffer)
    assert.equal(result.ok, false, `${file.name} was accepted`)
    assert.equal(result.mediaType, null)
  }
  const arabic = inspectArtifactContent(
    { role: 'html' },
    { name: 'companion.html', type: 'text/html' },
    new TextEncoder().encode('<!doctype html><html lang="ar" dir="rtl"><head><style>body{font-family:sans-serif}</style></head><body><article>شرح عربي</article></body></html>').buffer,
  )
  assert.equal(arabic.ok, true, arabic.failures.join('\n'))
  assert.equal(arabic.mediaType, 'text/html; charset=utf-8')
})

test('artifact role cannot bypass the uploaded media contract', () => {
  const result = mergeArtifactMultipartMetadata({}, uploadForm({
    generator: 'other', role: 'html',
  }))
  const pdf = new FormData()
  pdf.set('file', new Blob(['artifact'], { type: 'application/pdf' }), 'companion.pdf')
  for (const [key, value] of Object.entries({
    generator: 'other', role: 'html',
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

test('legacy quality state remains compatible while Lite Visual exposes deterministic validation', () => {
  assert.equal(normalizeQualityAssurance({}, true).status, 'unverified')
  assert.deepEqual(normalizeQualityAssurance({ generator: 'lite-visual', role: 'html' }), {
    status: 'repair_required', score: null, video_format: null, repair_status: 'required', failures: ['Lite Visual HTML/PDF must use the atomic /artifacts/pairs publication route'],
  })
  assert.equal(normalizeQualityAssurance({ generator: 'lite-visual', role: 'html', validation_status: 'passed' }).status, 'passed')
  assert.equal(normalizeQualityAssurance({ generator: 'notebooklm', role: 'video', qa_status: 'failed' }).status, 'repair_required')
})

test('atomic Lite Visual pair validation binds the receipt to exact code-only files', async () => {
  const htmlText = '<!doctype html><html lang="ar" dir="rtl"><head><style>@page{size:A4}</style></head><body><main><article data-canonical-content="true"><h1>عنوان عربي</h1><p>هذا شرح عربي كامل للمصدر.</p></article></main></body></html>'
  const pdfText = '%PDF-1.7\nfixture'
  const htmlBytes = new TextEncoder().encode(htmlText).buffer
  const pdfBytes = new TextEncoder().encode(pdfText).buffer
  const source = 'a'.repeat(64)
  const checks = { source_coverage: true, claim_traceability: true, canonical_html: true, code_only: true, rtl: true, accessibility: true, responsive: true, print_a4: true, pdf_parity: true }
  const receipt = { schema_version: LITE_VISUAL_RECEIPT_SCHEMA, status: 'passed', source_sha256: source, source_scope_sha256: 'b'.repeat(64), coverage_ledger_sha256: 'c'.repeat(64), html_sha256: await sha256Hex(htmlBytes), pdf_sha256: await sha256Hex(pdfBytes), checks }
  const metadata = { pair_id: 'lv-source-v4', recommendation_id: 'rec-1', source_checksum: source, generator: 'lite-visual', workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT, asset_policy: 'code-only', recommended_start: 'html' }
  const valid = await validateLiteVisualPair(metadata, receipt, { name: 'companion.html', type: 'text/html' }, { name: 'companion.pdf', type: 'application/pdf' }, htmlBytes, pdfBytes)
  assert.equal(valid.ok, true, valid.failures.join('\n'))
  const tampered = await validateLiteVisualPair(metadata, receipt, { name: 'companion.html', type: 'text/html' }, { name: 'companion.pdf', type: 'application/pdf' }, new TextEncoder().encode(htmlText + 'tampered').buffer, pdfBytes)
  assert.equal(tampered.ok, false)
  assert.ok(tampered.failures.some((failure) => failure.includes('HTML hash')))
  const interactive = await validateLiteVisualPair(metadata, receipt, { name: 'companion.html', type: 'text/html' }, { name: 'companion.pdf', type: 'application/pdf' }, new TextEncoder().encode(htmlText.replace('</article>', '<button>Reveal</button></article>')).buffer, pdfBytes)
  assert.equal(interactive.ok, false)
  assert.ok(interactive.failures.some((failure) => failure.includes('interactive widgets')))
})

function atomicPairFixture() {
  const htmlText = '<!doctype html><html lang="ar" dir="rtl"><head><style>@page{size:A4}</style></head><body><main><article data-canonical-content="true"><h1>عنوان عربي</h1><p>هذا شرح عربي كامل للمصدر.</p></article></main></body></html>'
  const pdfText = '%PDF-1.7\nfixture'
  const source = 'a'.repeat(64)
  return { htmlText, pdfText, source }
}

class PairDatabase {
  batchStatements: any[] = []
  preparedSql: string[] = []
  failBatch = false

  prepare(sql: string) {
    this.preparedSql.push(sql)
    const statement: any = {
      sql,
      values: [] as unknown[],
      bind: (...values: unknown[]) => { statement.values = values; return statement },
      first: async () => sql.includes('FROM recommendations') ? { id: 'rec-1', video_url: null, video_title: 'Source', source_metadata_json: '{}' } : null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }
    return statement
  }

  async batch(statements: any[]) {
    this.batchStatements = statements
    if (this.failBatch) throw new Error('forced batch failure')
    return statements.map(() => ({ success: true }))
  }
}

class ArtifactDatabase {
  inserted: unknown[] | null = null
  failInsert = false
  private readonly row?: Record<string, unknown>

  constructor(row?: Record<string, unknown>) { this.row = row }

  prepare(sql: string) {
    const statement: any = {
      values: [] as unknown[],
      bind: (...values: unknown[]) => { statement.values = values; return statement },
      first: async () => sql.includes('SELECT * FROM artifacts') || sql.includes('SELECT id,filename,media_type,r2_key FROM artifacts') ? this.row || null : null,
      all: async () => ({ results: [] }),
      run: async () => {
        if (sql.includes('INSERT INTO artifacts')) {
          this.inserted = statement.values
          if (this.failInsert) throw new Error('forced insert failure')
        }
        return { success: true, meta: { changes: 1 } }
      },
    }
    return statement
  }

  async batch(statements: any[]) { return Promise.all(statements.map((statement) => statement.run())) }
}

const r2Object = (body: string) => ({ body: new Blob([body]).stream(), text: async () => body })

test('generic upload stores only inspected canonical media and rejects scriptable payloads', async () => {
  const validDb = new ArtifactDatabase()
  const puts: Array<{ key: string; value: unknown; contentType?: string }> = []
  const valid = new FormData()
  valid.set('file', new Blob(['<!doctype html><html lang="ar" dir="rtl"><body><article>رفيق عربي</article></body></html>'], { type: 'text/html' }), 'arabic.html')
  valid.set('metadata', JSON.stringify({ generator: 'other', role: 'html' }))
  const validResponse = await artifactsApp.request('https://compass.test/', { method: 'POST', body: valid }, {
    DB: validDb,
    ARTIFACTS: { put: async (key: string, value: unknown, options: any) => puts.push({ key, value, contentType: options?.httpMetadata?.contentType }) },
  } as any)
  assert.equal(validResponse.status, 201, await validResponse.text())
  assert.equal(puts[0]?.contentType, 'text/html; charset=utf-8')
  assert.equal(validDb.inserted?.[2], 'text/html; charset=utf-8')

  for (const [name, type, body] of [
    ['payload.svg', 'image/svg+xml', '<svg onload="alert(1)"/>'],
    ['payload.txt', 'text/plain', '<svg onload="alert(1)"/>'],
    ['payload.html', 'text/html', '<!doctype html><html><script>alert(1)</script></html>'],
  ]) {
    const db = new ArtifactDatabase()
    let stored = false
    const form = new FormData()
    form.set('file', new Blob([body], { type }), name)
    const response = await artifactsApp.request('https://compass.test/', { method: 'POST', body: form }, {
      DB: db,
      ARTIFACTS: { put: async () => { stored = true } },
    } as any)
    assert.equal(response.status, 422, `${name}: ${await response.text()}`)
    assert.equal(stored, false)
    assert.equal(db.inserted, null)
  }
})

test('generic upload removes its staged R2 object when the D1 insert fails', async () => {
  const db = new ArtifactDatabase()
  db.failInsert = true
  const puts: string[] = []
  const deletes: string[] = []
  const form = new FormData()
  form.set('file', new Blob(['<!doctype html><html lang="ar" dir="rtl"><body><article>رفيق عربي</article></body></html>'], { type: 'text/html' }), 'arabic.html')
  const response = await artifactsApp.request('https://compass.test/', { method: 'POST', body: form }, {
    DB: db,
    ARTIFACTS: {
      put: async (key: string) => { puts.push(key) },
      delete: async (key: string) => { deletes.push(key) },
    },
  } as any)
  assert.equal(response.status, 500)
  assert.equal(puts.length, 1)
  assert.deepEqual(deletes, puts)
})

test('served HTML remains readable but sandboxed, while active XML is forced to download', async () => {
  const htmlBody = '<!doctype html><html lang="ar" dir="rtl"><body><p>شرح عربي</p><script>globalThis.compromised=true</script></body></html>'
  const htmlResponse = await artifactsApp.request('https://compass.test/html-id', {}, {
    DB: new ArtifactDatabase({ id: 'html-id', filename: 'companion.html', media_type: 'text/html; charset=utf-8', r2_key: 'html-key' }),
    ARTIFACTS: { get: async () => r2Object(htmlBody) },
  } as any)
  assert.equal(htmlResponse.status, 200)
  assert.match(htmlResponse.headers.get('content-type') || '', /^text\/html/)
  assert.match(htmlResponse.headers.get('content-disposition') || '', /^inline/)
  const htmlCsp = htmlResponse.headers.get('content-security-policy') || ''
  assert.match(htmlCsp, /(?:^|;)\s*sandbox(?:;|$)/)
  assert.match(htmlCsp, /script-src 'none'/)
  assert.doesNotMatch(htmlCsp, /script-src 'unsafe-inline'/)
  assert.match(await htmlResponse.text(), /شرح عربي/)

  const svgResponse = await artifactsApp.request('https://compass.test/svg-id', {}, {
    DB: new ArtifactDatabase({ id: 'svg-id', filename: 'payload.svg', media_type: 'text/plain', r2_key: 'svg-key' }),
    ARTIFACTS: { get: async () => r2Object('<svg onload="alert(1)"/>') },
  } as any)
  assert.equal(svgResponse.status, 200)
  assert.equal(svgResponse.headers.get('content-type'), 'application/octet-stream')
  assert.match(svgResponse.headers.get('content-disposition') || '', /^attachment/)
  assert.match(svgResponse.headers.get('content-security-policy') || '', /script-src 'none'/)
  assert.equal(svgResponse.headers.get('x-content-type-options'), 'nosniff')
})

async function atomicPairForm() {
  const { htmlText, pdfText, source } = atomicPairFixture()
  const htmlBytes = new TextEncoder().encode(htmlText).buffer
  const pdfBytes = new TextEncoder().encode(pdfText).buffer
  const form = new FormData()
  form.set('html', new Blob([htmlText], { type: 'text/html' }), 'companion.html')
  form.set('pdf', new Blob([pdfText], { type: 'application/pdf' }), 'companion.pdf')
  form.set('metadata', JSON.stringify({ pair_id: 'lv-rec-1-v4', recommendation_id: 'rec-1', source_checksum: source, generator: 'lite-visual', workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT, asset_policy: 'code-only', recommended_start: 'html' }))
  form.set('validation_receipt', JSON.stringify({ schema_version: LITE_VISUAL_RECEIPT_SCHEMA, status: 'passed', source_sha256: source, source_scope_sha256: 'b'.repeat(64), coverage_ledger_sha256: 'c'.repeat(64), html_sha256: await sha256Hex(htmlBytes), pdf_sha256: await sha256Hex(pdfBytes), checks: { source_coverage: true, claim_traceability: true, canonical_html: true, code_only: true, rtl: true, accessibility: true, responsive: true, print_a4: true, pdf_parity: true } }))
  return form
}

test('atomic pair route stores both objects before one D1 batch and retains the exact receipt', async () => {
  const db = new PairDatabase()
  const puts: string[] = []
  const deletes: string[] = []
  const response = await artifactsApp.request('https://compass.test/pairs', { method: 'POST', body: await atomicPairForm() }, {
    DB: db,
    ARTIFACTS: { put: async (key: string) => { puts.push(key) }, delete: async (key: string) => { deletes.push(key) } },
  } as any)
  assert.equal(response.status, 201, await response.text())
  assert.equal(puts.length, 2)
  assert.equal(deletes.length, 0)
  const targetQuery = db.preparedSql.find((sql) => sql.includes('FROM recommendations')) || ''
  assert.match(targetQuery, /r\.status IN \('active','consumed'\)/)
  assert.match(targetQuery, /r\.deleted_at IS NULL/)
  assert.equal(db.batchStatements.length, 2)
  const htmlMetadata = JSON.parse(db.batchStatements[0].values[5])
  assert.equal(htmlMetadata.publication_state, 'ready')
  assert.equal(htmlMetadata.validation_receipt.schema_version, LITE_VISUAL_RECEIPT_SCHEMA)
})

test('atomic pair route removes both staged objects when the D1 commit fails', async () => {
  const db = new PairDatabase()
  db.failBatch = true
  const puts: string[] = []
  const deletes: string[] = []
  const response = await artifactsApp.request('https://compass.test/pairs', { method: 'POST', body: await atomicPairForm() }, {
    DB: db,
    ARTIFACTS: { put: async (key: string) => { puts.push(key) }, delete: async (key: string) => { deletes.push(key) } },
  } as any)
  assert.equal(response.status, 500)
  assert.equal(puts.length, 2)
  assert.deepEqual(deletes.sort(), puts.sort())
})
