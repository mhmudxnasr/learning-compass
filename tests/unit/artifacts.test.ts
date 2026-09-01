import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { DatabaseSync } from 'node:sqlite'
import {
  inspectArtifactContent,
  liteVisualReceiptSignature,
  liteVisualTargetSha256,
  LITE_VISUAL_ATTESTATION_KEY_ID,
  LITE_VISUAL_AUDIT_PROVENANCE,
  LITE_VISUAL_RECEIPT_SCHEMA,
  LITE_VISUAL_WORKFLOW_CONTRACT,
  mergeArtifactMultipartMetadata,
  normalizeQualityAssurance,
  sha256Hex,
  validLiteVisualAttestation,
  validateArtifactIntegrity,
  validateLiteVisualPair,
} from '../../src/artifact-metadata.ts'

const receiptSigningKey = 'test-lite-visual-receipt-signing-key-2026-08-28'

let artifactsApp: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  artifactsApp = (await vite.ssrLoadModule('/src/api/artifacts.ts')).default
})

test.after(async () => {
  await vite.close()
})

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
  const result = mergeArtifactMultipartMetadata(
    {},
    uploadForm({
      custom_prompt_applied: 'true',
      notebook_url_linked: '1',
      source_indexed: 'false',
      download_verified: '0',
    }),
  )
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
  assert.equal(
    mergeArtifactMultipartMetadata({}, uploadForm({ generator: 'other', role: 'html', recommended_start: 'html' })).ok,
    true,
  )
  const invalid = mergeArtifactMultipartMetadata(
    {},
    uploadForm({ generator: 'lite-visual', role: 'html', recommended_start: 'audio' }),
  )
  assert.equal(invalid.ok, false)
})

test('artifact integrity accepts real HTML and PDF signatures', () => {
  assert.deepEqual(
    validateArtifactIntegrity(
      { role: 'html' },
      { name: 'companion.html', type: 'text/html' },
      new TextEncoder().encode('<!doctype html><html></html>').buffer,
    ),
    [],
  )
  assert.deepEqual(
    validateArtifactIntegrity(
      { role: 'pdf' },
      { name: 'companion.pdf', type: 'application/pdf' },
      new TextEncoder().encode('%PDF-1.7').buffer,
    ),
    [],
  )
  assert.ok(
    validateArtifactIntegrity(
      { role: 'pdf' },
      { name: 'companion.pdf', type: 'application/pdf' },
      new TextEncoder().encode('<html>').buffer,
    ).some((failure) => failure.includes('PDF signature')),
  )
})

test('artifact inspection rejects active or disguised content before R2 storage', () => {
  const cases = [
    [
      {},
      { name: 'payload.svg', type: 'image/svg+xml' },
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ],
    [{}, { name: 'notes.txt', type: 'text/plain' }, '<?xml version="1.0"?><svg onload="alert(1)"/>'],
    [
      { role: 'html' },
      { name: 'companion.html', type: 'text/html' },
      '<!doctype html><html><body><script>alert(1)</script></body></html>',
    ],
    [
      { role: 'html' },
      { name: 'companion.html', type: 'text/html' },
      '<!doctype html><html><body onload="alert(1)"></body></html>',
    ],
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
    new TextEncoder().encode(
      '<!doctype html><html lang="ar" dir="rtl"><head><style>body{font-family:sans-serif}</style></head><body><article>شرح عربي</article></body></html>',
    ).buffer,
  )
  assert.equal(arabic.ok, true, arabic.failures.join('\n'))
  assert.equal(arabic.mediaType, 'text/html; charset=utf-8')
})

test('artifact role cannot bypass the uploaded media contract', () => {
  const result = mergeArtifactMultipartMetadata(
    {},
    uploadForm({
      generator: 'other',
      role: 'html',
    }),
  )
  const pdf = new FormData()
  pdf.set('file', new Blob(['artifact'], { type: 'application/pdf' }), 'companion.pdf')
  for (const [key, value] of Object.entries({
    generator: 'other',
    role: 'html',
  }))
    pdf.set(key, value)
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
  const result = mergeArtifactMultipartMetadata(
    {},
    videoForm({
      generator: 'notebooklm',
      role: 'video',
      video_format: 'cinematic',
      custom_prompt_applied: 'true',
      source_indexed: 'true',
      notebook_url_linked: 'true',
      download_verified: 'true',
      qa_status: 'passed',
    }),
  )
  assert.equal(result.ok, true)
  const failed = mergeArtifactMultipartMetadata(
    {},
    videoForm({ generator: 'notebooklm', role: 'video', video_format: 'overview', qa_status: 'failed' }),
  )
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.length >= 5)
})

test('legacy quality state remains compatible while Lite Visual exposes deterministic validation', () => {
  assert.equal(normalizeQualityAssurance({}, true).status, 'unverified')
  assert.deepEqual(normalizeQualityAssurance({ generator: 'lite-visual', role: 'html' }), {
    status: 'repair_required',
    score: null,
    video_format: null,
    repair_status: 'required',
    failures: ['Lite Visual HTML/PDF must use the atomic /artifacts/pairs publication route'],
  })
  assert.equal(
    normalizeQualityAssurance({ generator: 'lite-visual', role: 'html', validation_status: 'passed' }).status,
    'passed',
  )
  assert.equal(
    normalizeQualityAssurance({ generator: 'notebooklm', role: 'video', qa_status: 'failed' }).status,
    'repair_required',
  )
})

test('atomic Lite Visual pair validation binds the receipt to exact code-only files', async () => {
  const htmlText =
    '<!doctype html><html lang="ar" dir="rtl"><head><style>@page{size:A4}</style></head><body><main><article data-canonical-content="true"><h1>عنوان عربي</h1><p>هذا شرح عربي كامل للمصدر.</p></article></main></body></html>'
  const pdfText = '%PDF-1.7\nfixture'
  const htmlBytes = new TextEncoder().encode(htmlText).buffer
  const pdfBytes = new TextEncoder().encode(pdfText).buffer
  const source = 'a'.repeat(64)
  const checks = {
    source_coverage: true,
    claim_traceability: true,
    exact_source_html: true,
    exact_source_pdf: true,
    canonical_html: true,
    code_only: true,
    rtl: true,
    accessibility: true,
    responsive: true,
    print_a4: true,
    pdf_parity: true,
  }
  const target = { recommendation_id: 'rec-1', source_url: 'https://source.test/item', source_title: 'Source' }
  const receipt: Record<string, unknown> = {
    schema_version: LITE_VISUAL_RECEIPT_SCHEMA,
    workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
    status: 'passed',
    source_sha256: source,
    source_scope_sha256: 'b'.repeat(64),
    coverage_ledger_sha256: 'c'.repeat(64),
    html_sha256: await sha256Hex(htmlBytes),
    pdf_sha256: await sha256Hex(pdfBytes),
    work_item_sha256: 'd'.repeat(64),
    source_extraction_sha256: 'e'.repeat(64),
    target,
    target_sha256: await liteVisualTargetSha256(target),
    checks,
  }
  receipt.attestation = {
    algorithm: 'hmac-sha256',
    key_id: LITE_VISUAL_ATTESTATION_KEY_ID,
    signature: await liteVisualReceiptSignature(receipt, receiptSigningKey),
  }
  const metadata = {
    pair_id: 'lv-source-v4',
    recommendation_id: 'rec-1',
    source_url: target.source_url,
    source_title: target.source_title,
    source_checksum: source,
    generator: 'lite-visual',
    workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
    asset_policy: 'code-only',
    recommended_start: 'html',
  }
  const valid = await validateLiteVisualPair(
    metadata,
    receipt,
    { name: 'companion.html', type: 'text/html' },
    { name: 'companion.pdf', type: 'application/pdf' },
    htmlBytes,
    pdfBytes,
    receiptSigningKey,
  )
  assert.equal(valid.ok, true, valid.failures.join('\n'))
  const forgedReceipt = {
    ...receipt,
    checks: { ...checks, exact_source_html: true },
    attestation: { algorithm: 'hmac-sha256', key_id: LITE_VISUAL_ATTESTATION_KEY_ID, signature: '0'.repeat(64) },
  }
  const forged = await validateLiteVisualPair(
    metadata,
    forgedReceipt,
    { name: 'companion.html', type: 'text/html' },
    { name: 'companion.pdf', type: 'application/pdf' },
    htmlBytes,
    pdfBytes,
    receiptSigningKey,
  )
  assert.equal(forged.ok, false)
  assert.ok(forged.failures.some((failure) => failure.includes('attestation')))
  const tampered = await validateLiteVisualPair(
    metadata,
    receipt,
    { name: 'companion.html', type: 'text/html' },
    { name: 'companion.pdf', type: 'application/pdf' },
    new TextEncoder().encode(htmlText + 'tampered').buffer,
    pdfBytes,
    receiptSigningKey,
  )
  assert.equal(tampered.ok, false)
  assert.ok(tampered.failures.some((failure) => failure.includes('HTML hash')))
  const interactive = await validateLiteVisualPair(
    metadata,
    receipt,
    { name: 'companion.html', type: 'text/html' },
    { name: 'companion.pdf', type: 'application/pdf' },
    new TextEncoder().encode(htmlText.replace('</article>', '<button>Reveal</button></article>')).buffer,
    pdfBytes,
    receiptSigningKey,
  )
  assert.equal(interactive.ok, false)
  assert.ok(interactive.failures.some((failure) => failure.includes('interactive widgets')))
})

test('Worker verifies a Python-signed receipt containing an integral float', async () => {
  const code = `import json,sys; sys.path.insert(0,'/home/mahmud/.hermes/skills/lite-visual/scripts'); from receipt_attestation import attest_receipt; r={'schema_version':'fixture','canonical_character_trigram_overlap':1.0}; attest_receipt(r); print(json.dumps(r,separators=(',',':')))`
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8',
    env: { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await validLiteVisualAttestation(JSON.parse(result.stdout), receiptSigningKey), true)
})

test('receipt canonicalization rejects cross-runtime ambiguous numbers and keys', () => {
  for (const literal of ["{'ratio':1e-7}", "{'𐀀':1,'\ue000':2}", "{'count':9007199254740992}"]) {
    const code = `import sys; sys.path.insert(0,'/home/mahmud/.hermes/skills/lite-visual/scripts'); from receipt_attestation import attest_receipt; r=${literal}\ntry: attest_receipt(r)\nexcept ValueError as e: print(e); raise SystemExit(0)\nraise SystemExit(1)`
    const result = spawnSync('python3', ['-c', code], {
      encoding: 'utf8',
      env: { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey },
    })
    assert.equal(result.status, 0, result.stderr)
  }
})

function atomicPairFixture() {
  const htmlText =
    '<!doctype html><html lang="ar" dir="rtl"><head><style>@page{size:A4}</style></head><body><main><article data-canonical-content="true"><h1>عنوان عربي</h1><p>هذا شرح عربي كامل للمصدر.</p></article></main></body></html>'
  const pdfText = '%PDF-1.7\nfixture'
  const source = 'a'.repeat(64)
  return { htmlText, pdfText, source }
}

class PairDatabase {
  batchStatements: any[] = []
  preparedSql: string[] = []
  failBatch = false
  commitThenThrow = false
  failPairRead = false
  pairReads = 0
  committedPair: Record<string, unknown> | null = null

  prepare(sql: string) {
    this.preparedSql.push(sql)
    const statement: any = {
      sql,
      values: [] as unknown[],
      bind: (...values: unknown[]) => {
        statement.values = values
        return statement
      },
      first: async () => {
        if (sql.includes('FROM recommendations'))
          return {
            id: 'rec-1',
            video_url: 'https://source.test/item',
            video_title: 'Source',
            source_metadata_json: '{}',
          }
        if (sql.includes('FROM lite_visual_pairs')) {
          this.pairReads += 1
          if (this.failPairRead && this.pairReads > 1) throw new Error('forced canonical read failure')
          return this.committedPair
        }
        return null
      },
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
    }
    return statement
  }

  async batch(statements: any[]) {
    this.batchStatements = statements
    if (this.failBatch) throw new Error('forced batch failure')
    if (this.commitThenThrow) {
      const values = statements[2]?.values || []
      this.committedPair = { html_r2_key: values[19], pdf_r2_key: values[20] }
      throw new Error('ambiguous post-commit failure')
    }
    return statements.map(() => ({ success: true }))
  }
}

class SqliteD1Statement {
  values: unknown[] = []
  database: DatabaseSync
  sql: string
  constructor(database: DatabaseSync, sql: string) {
    this.database = database
    this.sql = sql
  }
  bind(...values: unknown[]) {
    this.values = values
    return this
  }
  async first<T>() {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) || null
  }
  async all<T>() {
    return { results: this.database.prepare(this.sql).all(...this.values) as T[] }
  }
  execute() {
    const result = this.database.prepare(this.sql).run(...this.values)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
  async run() {
    return this.execute()
  }
}

class SqliteD1 {
  database: DatabaseSync
  beforeBatch: (() => void) | null = null
  constructor(database: DatabaseSync) {
    this.database = database
  }
  prepare(sql: string) {
    return new SqliteD1Statement(this.database, sql)
  }
  async batch(statements: SqliteD1Statement[]) {
    const beforeBatch = this.beforeBatch
    this.beforeBatch = null
    beforeBatch?.()
    this.database.exec('BEGIN')
    try {
      const results = statements.map((statement) => statement.execute())
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

class ArtifactDatabase {
  inserted: unknown[] | null = null
  failInsert = false
  private readonly row?: Record<string, unknown>

  constructor(row?: Record<string, unknown>) {
    this.row = row
  }

  prepare(sql: string) {
    const statement: any = {
      values: [] as unknown[],
      bind: (...values: unknown[]) => {
        statement.values = values
        return statement
      },
      first: async () =>
        sql.includes('SELECT * FROM artifacts') ||
        sql.includes('SELECT id,filename,media_type,r2_key FROM artifacts') ||
        sql.includes('SELECT a.*') ||
        sql.includes('SELECT a.id')
          ? this.row || null
          : null,
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

  async batch(statements: any[]) {
    return Promise.all(statements.map((statement) => statement.run()))
  }
}

const r2Object = (body: string) => ({ body: new Blob([body]).stream(), text: async () => body })

test('generic upload stores only inspected canonical media and rejects scriptable payloads', async () => {
  const validDb = new ArtifactDatabase()
  const puts: Array<{ key: string; value: unknown; contentType?: string }> = []
  const valid = new FormData()
  valid.set(
    'file',
    new Blob(['<!doctype html><html lang="ar" dir="rtl"><body><article>رفيق عربي</article></body></html>'], {
      type: 'text/html',
    }),
    'arabic.html',
  )
  valid.set('metadata', JSON.stringify({ generator: 'other', role: 'html' }))
  const validResponse = await artifactsApp.request('https://compass.test/', { method: 'POST', body: valid }, {
    DB: validDb,
    ARTIFACTS: {
      put: async (key: string, value: unknown, options: any) =>
        puts.push({ key, value, contentType: options?.httpMetadata?.contentType }),
    },
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
      ARTIFACTS: {
        put: async () => {
          stored = true
        },
      },
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
  form.set(
    'file',
    new Blob(['<!doctype html><html lang="ar" dir="rtl"><body><article>رفيق عربي</article></body></html>'], {
      type: 'text/html',
    }),
    'arabic.html',
  )
  const response = await artifactsApp.request('https://compass.test/', { method: 'POST', body: form }, {
    DB: db,
    ARTIFACTS: {
      put: async (key: string) => {
        puts.push(key)
      },
      delete: async (key: string) => {
        deletes.push(key)
      },
    },
  } as any)
  assert.equal(response.status, 500)
  assert.equal(puts.length, 1)
  assert.deepEqual(deletes, puts)
})

test('served HTML remains readable but sandboxed, while active XML is forced to download', async () => {
  const htmlBody =
    '<!doctype html><html lang="ar" dir="rtl"><body><p>شرح عربي</p><script>globalThis.compromised=true</script></body></html>'
  const htmlResponse = await artifactsApp.request('https://compass.test/html-id', {}, {
    DB: new ArtifactDatabase({
      id: 'html-id',
      filename: 'companion.html',
      media_type: 'text/html; charset=utf-8',
      r2_key: 'html-key',
    }),
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

test('verified pair responses expose exact artifact identity and byte size for offline validation', async () => {
  const body = '%PDF-1.7\npair body\n%%EOF'
  const response = await artifactsApp.request('https://compass.test/pdf-id', {}, {
    DB: new ArtifactDatabase({
      id: 'pdf-id',
      filename: 'companion.pdf',
      media_type: 'application/pdf',
      r2_key: 'pdf-key',
      size_bytes: new TextEncoder().encode(body).byteLength,
      metadata_json: JSON.stringify({
        pair_id: 'pair-1',
        role: 'pdf',
        publication_state: 'ready',
        validation_status: 'passed',
      }),
    }),
    ARTIFACTS: { get: async () => r2Object(body) },
  } as any)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-learning-compass-artifact-id'), 'pdf-id')
  assert.equal(response.headers.get('x-learning-compass-size-bytes'), String(new TextEncoder().encode(body).byteLength))
  assert.equal(response.headers.get('x-learning-compass-pair-id'), 'pair-1')
  assert.equal(response.headers.get('x-learning-compass-pair-role'), 'pdf')
  assert.equal(response.headers.get('x-learning-compass-publication-state'), 'ready')
  assert.equal(response.headers.get('x-learning-compass-validation-status'), 'passed')
  assert.equal((await response.blob()).size, Number(response.headers.get('x-learning-compass-size-bytes')))

  const htmlBody = '<!doctype html><p>pair body</p>'
  const htmlRow = {
    id: 'html-id',
    filename: 'companion.html',
    media_type: 'text/html; charset=utf-8',
    r2_key: 'html-key',
    size_bytes: new TextEncoder().encode(htmlBody).byteLength,
    metadata_json: JSON.stringify({
      pair_id: 'pair-1',
      role: 'html',
      publication_state: 'ready',
      validation_status: 'passed',
    }),
  }
  const redirect = await artifactsApp.request('https://compass.test/html-id/view', {}, {
    DB: new ArtifactDatabase(htmlRow),
    ARTIFACTS: { get: async () => r2Object(htmlBody) },
  } as any)
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.get('location'), '/artifacts/html-id')
  const raw = await artifactsApp.request('https://compass.test/html-id', {}, {
    DB: new ArtifactDatabase(htmlRow),
    ARTIFACTS: { get: async () => r2Object(htmlBody) },
  } as any)
  assert.equal(raw.headers.get('x-learning-compass-artifact-id'), 'html-id')
  assert.equal(raw.headers.get('x-learning-compass-size-bytes'), String(new TextEncoder().encode(htmlBody).byteLength))
  assert.equal(raw.headers.get('x-learning-compass-pair-role'), 'html')
  assert.equal(await raw.text(), htmlBody)
})

async function atomicPairForm() {
  const { htmlText, pdfText, source } = atomicPairFixture()
  const htmlBytes = new TextEncoder().encode(htmlText).buffer
  const pdfBytes = new TextEncoder().encode(pdfText).buffer
  const form = new FormData()
  form.set('html', new Blob([htmlText], { type: 'text/html' }), 'companion.html')
  form.set('pdf', new Blob([pdfText], { type: 'application/pdf' }), 'companion.pdf')
  const target = { recommendation_id: 'rec-1', source_url: 'https://source.test/item', source_title: 'Source' }
  const receipt: Record<string, unknown> = {
    schema_version: LITE_VISUAL_RECEIPT_SCHEMA,
    workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
    status: 'passed',
    source_sha256: source,
    source_scope_sha256: 'b'.repeat(64),
    coverage_ledger_sha256: 'c'.repeat(64),
    html_sha256: await sha256Hex(htmlBytes),
    pdf_sha256: await sha256Hex(pdfBytes),
    work_item_sha256: 'd'.repeat(64),
    source_extraction_sha256: 'e'.repeat(64),
    target,
    target_sha256: await liteVisualTargetSha256(target),
    checks: {
      source_coverage: true,
      claim_traceability: true,
      exact_source_html: true,
      exact_source_pdf: true,
      canonical_html: true,
      code_only: true,
      rtl: true,
      accessibility: true,
      responsive: true,
      print_a4: true,
      pdf_parity: true,
    },
  }
  receipt.attestation = {
    algorithm: 'hmac-sha256',
    key_id: LITE_VISUAL_ATTESTATION_KEY_ID,
    signature: await liteVisualReceiptSignature(receipt, receiptSigningKey),
  }
  const fingerprint = await sha256Hex(
    ['source_sha256', 'source_scope_sha256', 'coverage_ledger_sha256', 'html_sha256', 'pdf_sha256']
      .map((key) => String(receipt[key]))
      .join('\n'),
  )
  form.set(
    'metadata',
    JSON.stringify({
      pair_id: `lv-rec-1-${fingerprint.slice(0, 20)}`,
      recommendation_id: 'rec-1',
      source_url: target.source_url,
      source_title: target.source_title,
      source_checksum: source,
      generator: 'lite-visual',
      workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
      asset_policy: 'code-only',
      recommended_start: 'html',
    }),
  )
  form.set('validation_receipt', JSON.stringify(receipt))
  return form
}

test('atomic pair route stores both objects before one D1 batch and retains the exact receipt', async () => {
  const db = new PairDatabase()
  const puts: string[] = []
  const deletes: string[] = []
  const objects = new Map<string, any>()
  const response = await artifactsApp.request(
    'https://compass.test/pairs',
    { method: 'POST', body: await atomicPairForm() },
    {
      DB: db,
      LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey,
      ARTIFACTS: {
        put: async (key: string, value: ArrayBuffer, options: any) => {
          puts.push(key)
          objects.set(key, { size: value.byteLength, customMetadata: options.customMetadata })
        },
        head: async (key: string) => objects.get(key),
        delete: async (key: string) => {
          deletes.push(key)
        },
      },
    } as any,
  )
  assert.equal(response.status, 201, await response.text())
  assert.equal(puts.length, 2)
  assert.equal(deletes.length, 0)
  const targetQuery = db.preparedSql.find((sql) => sql.includes('FROM recommendations')) || ''
  assert.match(targetQuery, /r\.status IN \('active','consumed'\)/)
  assert.match(targetQuery, /r\.deleted_at IS NULL/)
  assert.equal(db.batchStatements.length, 3)
  const htmlMetadata = JSON.parse(db.batchStatements[0].values[5])
  assert.equal(htmlMetadata.publication_state, 'ready')
  assert.equal(htmlMetadata.validation_receipt.schema_version, LITE_VISUAL_RECEIPT_SCHEMA)
})

test('atomic pair route removes both staged objects when the D1 commit fails', async () => {
  const db = new PairDatabase()
  db.failBatch = true
  const puts: string[] = []
  const deletes: string[] = []
  const objects = new Map<string, any>()
  const response = await artifactsApp.request(
    'https://compass.test/pairs',
    { method: 'POST', body: await atomicPairForm() },
    {
      DB: db,
      LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey,
      ARTIFACTS: {
        put: async (key: string, value: ArrayBuffer, options: any) => {
          puts.push(key)
          objects.set(key, { size: value.byteLength, customMetadata: options.customMetadata })
        },
        head: async (key: string) => objects.get(key),
        delete: async (key: string) => {
          deletes.push(key)
        },
      },
    } as any,
  )
  assert.equal(response.status, 500)
  assert.equal(puts.length, 2)
  assert.deepEqual(deletes.sort(), puts.sort())
})

test('atomic pair route retains request-owned R2 objects when D1 commit state is ambiguous', async () => {
  const db = new PairDatabase()
  db.commitThenThrow = true
  db.failPairRead = true
  const puts: string[] = []
  const deletes: string[] = []
  const objects = new Map<string, any>()
  const response = await artifactsApp.request(
    'https://compass.test/pairs',
    { method: 'POST', body: await atomicPairForm() },
    {
      DB: db,
      LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey,
      ARTIFACTS: {
        put: async (key: string, value: ArrayBuffer, options: any) => {
          puts.push(key)
          objects.set(key, { size: value.byteLength, customMetadata: options.customMetadata })
        },
        head: async (key: string) => objects.get(key),
        delete: async (key: string) => {
          deletes.push(key)
        },
      },
    } as any,
  )
  assert.equal(response.status, 500)
  assert.equal(puts.length, 2)
  assert.deepEqual(deletes, [])
})

test('one guarded activation publishes an exact persisted corpus and completes its immutable job', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY);
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT,video_title TEXT,status TEXT,deleted_at TEXT);
    CREATE TABLE recommendation_meta(recommendation_id TEXT PRIMARY KEY,source_metadata_json TEXT);
    CREATE TABLE thread_sources(thread_id TEXT,recommendation_id TEXT,status TEXT,PRIMARY KEY(thread_id,recommendation_id));
    CREATE TABLE agent_jobs(id TEXT PRIMARY KEY,job_type TEXT,status TEXT,payload_json TEXT,result_json TEXT,recommendation_id TEXT,workflow_run_id TEXT,workflow_step TEXT,lease_owner TEXT,lease_expires_at TEXT,error TEXT,updated_at TEXT);
    CREATE TABLE agent_job_retries(job_id TEXT PRIMARY KEY);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY,filename TEXT,media_type TEXT,r2_key TEXT,size_bytes INTEGER,metadata_json TEXT,thread_id TEXT,stage_id TEXT,lesson_id TEXT,created_at TEXT DEFAULT (datetime('now')));
    ${readFileSync(new URL('../../migrations/0068_lite_visual_corpus_activation.sql', import.meta.url), 'utf8')}
    INSERT INTO learning_threads(id) VALUES ('thread-1');
    INSERT INTO recommendations(id,video_url,video_title,status) VALUES ('rec-1','https://source.test/item','Source','active');
    INSERT INTO recommendation_meta(recommendation_id,source_metadata_json) VALUES ('rec-1','{}');
    INSERT INTO thread_sources(thread_id,recommendation_id,status) VALUES ('thread-1','rec-1','active');
  `)
  const db = new SqliteD1(sqlite)
  const objects = new Map<string, any>()
  const bucket = {
    put: async (key: string, value: ArrayBuffer, options: any) => {
      objects.set(key, { size: value.byteLength, customMetadata: options.customMetadata })
    },
    head: async (key: string) => objects.get(key) || null,
    delete: async (key: string) => {
      objects.delete(key)
    },
  }
  const oldHtmlSha = 'a'.repeat(64)
  const oldPdfSha = 'b'.repeat(64)
  for (const role of ['html', 'pdf']) {
    sqlite
      .prepare('INSERT INTO artifacts(id,filename,media_type,r2_key,size_bytes,metadata_json) VALUES (?,?,?,?,1,?)')
      .run(
        `old-${role}`,
        `old.${role}`,
        role === 'html' ? 'text/html' : 'application/pdf',
        `old/${role}`,
        JSON.stringify({
          pair_id: 'old-pair',
          recommendation_id: 'rec-1',
          role,
          publication_state: 'ready',
          validation_status: 'passed',
          html_sha256: oldHtmlSha,
          pdf_sha256: oldPdfSha,
        }),
      )
    objects.set(`old/${role}`, {
      size: 1,
      customMetadata: { sha256: role === 'html' ? oldHtmlSha : oldPdfSha, pair_id: 'old-pair', role },
    })
  }
  sqlite
    .prepare(
      `INSERT INTO lite_visual_pairs(pair_id,recommendation_id,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key,html_size_bytes,pdf_size_bytes,r2_verified,state)
    VALUES ('old-pair','rec-1',?,?,?,?,?,?,?,?,?,'old-html','old-pdf','old/html','old/pdf',1,1,1,'active')`,
    )
    .run(
      ...Array.from({ length: 6 }, (_, index) => String(index + 1).repeat(64)),
      oldHtmlSha,
      oldPdfSha,
      'c'.repeat(64),
    )

  const form = await atomicPairForm()
  const receipt = JSON.parse(String(form.get('validation_receipt')))
  const metadata = JSON.parse(String(form.get('metadata')))
  const pairId = metadata.pair_id
  const runId = 'run-1'
  const jobId = 'job-1'
  sqlite
    .prepare(
      `INSERT INTO agent_jobs(id,job_type,status,payload_json,result_json,recommendation_id,workflow_run_id,workflow_step,updated_at) VALUES (?,'visualise_source','pending',?,'{}','rec-1',?,'resolve_source',datetime('now'))`,
    )
    .run(
      jobId,
      JSON.stringify({
        recommendation_id: 'rec-1',
        source_url: 'https://source.test/item',
        title: 'Source',
        workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
        revision_of_pair_id: 'old-pair',
      }),
      runId,
    )
  const manifestSha = '1'.repeat(64)
  const targetSetSha = await sha256Hex(JSON.stringify([[1, 'rec-1', 'https://source.test/item', 'Source', '/work']]))
  const receiptSha = await sha256Hex(String(form.get('validation_receipt')))
  const target = {
    recording_number: 1,
    recommendation_id: 'rec-1',
    source_url: 'https://source.test/item',
    source_title: 'Source',
    workdir: '/work',
    pair_id: pairId,
    job_id: jobId,
    workflow_run_id: runId,
    supersedes_pair_id: 'old-pair',
    target_sha256: receipt.target_sha256,
    receipt_sha256: receiptSha,
    work_item_sha256: receipt.work_item_sha256,
    source_extraction_sha256: receipt.source_extraction_sha256,
    source_sha256: receipt.source_sha256,
    source_scope_sha256: receipt.source_scope_sha256,
    coverage_ledger_sha256: receipt.coverage_ledger_sha256,
    html_sha256: receipt.html_sha256,
    pdf_sha256: receipt.pdf_sha256,
  }
  const auditSha = await sha256Hex(
    JSON.stringify([
      [
        target.recording_number,
        target.recommendation_id,
        '',
        target.source_url,
        target.source_title,
        target.workdir,
        target.pair_id,
        target.target_sha256,
        target.work_item_sha256,
        target.source_extraction_sha256,
        target.source_sha256,
        target.source_scope_sha256,
        target.coverage_ledger_sha256,
        target.html_sha256,
        target.pdf_sha256,
        target.receipt_sha256,
      ],
    ]),
  )
  const auditReceipt: Record<string, unknown> = {
    schema_version: 'lite-visual-corpus-audit/v1',
    status: 'passed',
    thread_id: 'thread-1',
    manifest_sha256: manifestSha,
    target_set_sha256: targetSetSha,
    corpus_sha256: auditSha,
    expected: 1,
    audited: 1,
    failed: 0,
    ...LITE_VISUAL_AUDIT_PROVENANCE,
  }
  auditReceipt.attestation = {
    algorithm: 'hmac-sha256',
    key_id: LITE_VISUAL_ATTESTATION_KEY_ID,
    signature: await liteVisualReceiptSignature(auditReceipt, receiptSigningKey),
  }
  const contract = {
    thread_id: 'thread-1',
    manifest_sha256: manifestSha,
    target_set_sha256: targetSetSha,
    audit_corpus_sha256: auditSha,
    expected_pairs: 1,
    audit_receipt: auditReceipt,
    targets: [target],
  }
  const staleAuditReceipt = { ...auditReceipt, python_version: '3.11.14', attestation: undefined } as Record<
    string,
    unknown
  >
  staleAuditReceipt.attestation = {
    algorithm: 'hmac-sha256',
    key_id: LITE_VISUAL_ATTESTATION_KEY_ID,
    signature: await liteVisualReceiptSignature(staleAuditReceipt, receiptSigningKey),
  }
  const staleAudit = await artifactsApp.request(
    'https://compass.test/corpora',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...contract, audit_receipt: staleAuditReceipt }),
    },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(staleAudit.status, 422, await staleAudit.text())
  const changedHash = { ...target, source_sha256: 'f'.repeat(64) }
  const replayedAudit = await artifactsApp.request(
    'https://compass.test/corpora',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...contract, targets: [changedHash] }),
    },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(replayedAudit.status, 409, await replayedAudit.text())
  const corpusResponse = await artifactsApp.request(
    'https://compass.test/corpora',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contract) },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(
    corpusResponse.status,
    201,
    `${await corpusResponse.clone().text()}\n${JSON.stringify(sqlite.prepare('SELECT * FROM lite_visual_corpus_targets').all())}\n${JSON.stringify(target)}`,
  )
  const corpusId = ((await corpusResponse.json()) as any).corpus_id

  sqlite
    .prepare(
      "UPDATE agent_jobs SET status='running',workflow_step='publish_pair',lease_owner='worker-1',lease_expires_at=datetime('now','+5 minutes') WHERE id=?",
    )
    .run(jobId)
  metadata.corpus_id = corpusId
  metadata.job_id = jobId
  metadata.workflow_run_id = runId
  metadata.worker_identity = 'worker-1'
  metadata.supersedes_pair_id = 'old-pair'
  form.set('metadata', JSON.stringify(metadata))
  const pairResponse = await artifactsApp.request('https://compass.test/pairs', { method: 'POST', body: form }, {
    DB: db,
    ARTIFACTS: bucket,
    LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey,
  } as any)
  assert.equal(pairResponse.status, 201, await pairResponse.clone().text())
  const pair = (await pairResponse.json()) as any
  sqlite
    .prepare(
      "UPDATE agent_jobs SET status='awaiting_activation',lease_owner=NULL,lease_expires_at=NULL,result_json=? WHERE id=?",
    )
    .run(JSON.stringify({ pair_id: pairId, receipt_sha256: receiptSha }), jobId)

  db.beforeBatch = () =>
    sqlite
      .prepare(
        "UPDATE lite_visual_corpora SET state='aborted',aborted_at=datetime('now') WHERE id=? AND state='staging'",
      )
      .run(corpusId)
  const staleActivation = await artifactsApp.request(
    `https://compass.test/corpora/${corpusId}/activate`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contract) },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(staleActivation.status, 500, await staleActivation.clone().text())
  assert.equal(
    sqlite
      .prepare("SELECT json_extract(metadata_json,'$.publication_state') state FROM artifacts WHERE id='old-html'")
      .get().state,
    'ready',
  )
  assert.equal(
    sqlite
      .prepare("SELECT json_extract(metadata_json,'$.publication_state') state FROM artifacts WHERE id=?")
      .get(pair.html.id).state,
    'staged',
  )
  assert.equal(sqlite.prepare("SELECT status FROM agent_jobs WHERE id='job-1'").get().status, 'awaiting_activation')
  sqlite.prepare("UPDATE lite_visual_corpora SET state='staging',aborted_at=NULL WHERE id=?").run(corpusId)

  db.beforeBatch = () => {
    sqlite
      .prepare(
        "UPDATE lite_visual_corpora SET state='active',activated_at=datetime('now') WHERE id=? AND state='staging'",
      )
      .run(corpusId)
    sqlite
      .prepare(
        "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','superseded') WHERE json_extract(metadata_json,'$.pair_id')='old-pair'",
      )
      .run()
    sqlite
      .prepare(
        "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready') WHERE json_extract(metadata_json,'$.pair_id')=?",
      )
      .run(pairId)
    sqlite.prepare("UPDATE lite_visual_pairs SET state='active' WHERE pair_id=?").run(pairId)
    sqlite.prepare("UPDATE agent_jobs SET status='completed' WHERE id=?").run(jobId)
    sqlite.prepare("INSERT INTO lite_visual_active_corpora(thread_id,corpus_id) VALUES ('thread-1',?)").run(corpusId)
  }
  const staleAbort = await artifactsApp.request(`https://compass.test/corpora/${corpusId}/abort`, { method: 'POST' }, {
    DB: db,
    ARTIFACTS: bucket,
    LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey,
  } as any)
  assert.equal(staleAbort.status, 409, await staleAbort.clone().text())
  assert.equal(
    objects.has(sqlite.prepare('SELECT html_r2_key FROM lite_visual_pairs WHERE pair_id=?').get(pairId).html_r2_key),
    true,
  )
  assert.equal(sqlite.prepare('SELECT state FROM lite_visual_pairs WHERE pair_id=?').get(pairId).state, 'active')
  sqlite.prepare("DELETE FROM lite_visual_active_corpora WHERE thread_id='thread-1'").run()
  sqlite.prepare("UPDATE lite_visual_corpora SET state='staging',activated_at=NULL WHERE id=?").run(corpusId)
  sqlite
    .prepare(
      "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready') WHERE json_extract(metadata_json,'$.pair_id')='old-pair'",
    )
    .run()
  sqlite
    .prepare(
      "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','staged') WHERE json_extract(metadata_json,'$.pair_id')=?",
    )
    .run(pairId)
  sqlite.prepare("UPDATE lite_visual_pairs SET state='staged' WHERE pair_id=?").run(pairId)
  sqlite.prepare("UPDATE agent_jobs SET status='awaiting_activation' WHERE id=?").run(jobId)

  const activation = await artifactsApp.request(
    `https://compass.test/corpora/${corpusId}/activate`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contract) },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(activation.status, 200, await activation.text())
  assert.equal(sqlite.prepare("SELECT status FROM agent_jobs WHERE id='job-1'").get().status, 'completed')
  assert.equal(
    sqlite
      .prepare("SELECT json_extract(metadata_json,'$.publication_state') state FROM artifacts WHERE id='old-html'")
      .get().state,
    'superseded',
  )
  assert.equal(
    sqlite.prepare('SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=?').get('thread-1').corpus_id,
    corpusId,
  )
  assert.equal(sqlite.prepare('SELECT state FROM lite_visual_pairs WHERE pair_id=?').get(pairId).state, 'active')
  assert.ok(pair.html?.id && pair.pdf?.id)

  const corpusRetry = await artifactsApp.request(
    'https://compass.test/corpora',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contract) },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(corpusRetry.status, 200, await corpusRetry.clone().text())
  assert.equal(((await corpusRetry.json()) as any).state, 'active')
  const pairRetryForm = await atomicPairForm()
  const pairRetryMetadata = JSON.parse(String(pairRetryForm.get('metadata')))
  Object.assign(pairRetryMetadata, {
    corpus_id: corpusId,
    job_id: jobId,
    workflow_run_id: runId,
    worker_identity: 'worker-1',
    supersedes_pair_id: 'old-pair',
  })
  pairRetryForm.set('metadata', JSON.stringify(pairRetryMetadata))
  const pairRetry = await artifactsApp.request('https://compass.test/pairs', { method: 'POST', body: pairRetryForm }, {
    DB: db,
    ARTIFACTS: bucket,
    LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey,
  } as any)
  assert.equal(pairRetry.status, 200, await pairRetry.clone().text())
  assert.equal(((await pairRetry.json()) as any).reused, true)

  const rollback = await artifactsApp.request(
    `https://compass.test/corpora/${corpusId}/rollback`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contract) },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(rollback.status, 200, await rollback.clone().text())
  assert.equal(
    sqlite
      .prepare("SELECT json_extract(metadata_json,'$.publication_state') state FROM artifacts WHERE id='old-html'")
      .get().state,
    'ready',
  )
  assert.equal(
    sqlite
      .prepare("SELECT json_extract(metadata_json,'$.publication_state') state FROM artifacts WHERE id=?")
      .get(pair.html.id).state,
    'superseded',
  )
  assert.equal(
    sqlite.prepare('SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=?').get('thread-1'),
    undefined,
  )
  assert.equal(sqlite.prepare('SELECT state FROM lite_visual_pairs WHERE pair_id=?').get(pairId).state, 'superseded')
  assert.equal(sqlite.prepare("SELECT status FROM agent_jobs WHERE id='job-1'").get().status, 'completed')
  assert.ok(
    sqlite.prepare("SELECT json_extract(result_json,'$.rolled_back_at') value FROM agent_jobs WHERE id='job-1'").get()
      .value,
  )
  const rollbackRetry = await artifactsApp.request(
    `https://compass.test/corpora/${corpusId}/rollback`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(contract) },
    { DB: db, ARTIFACTS: bucket, LITE_VISUAL_RECEIPT_SIGNING_KEY: receiptSigningKey } as any,
  )
  assert.equal(rollbackRetry.status, 200, await rollbackRetry.clone().text())
  assert.equal(((await rollbackRetry.json()) as any).reused, true)
  sqlite.close()
})
