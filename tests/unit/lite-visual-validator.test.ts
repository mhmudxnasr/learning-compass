import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const validator = '/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py'
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

test('Visual Lite v5 rejects a source scope that does not partition the complete extraction', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-gap-'))
  try {
    const source = 'واحد اثنان ثلاثة اربعة خمسة ستة'
    const sourcePath = join(directory, 'source.txt')
    const scopePath = join(directory, 'source-scope.json')
    writeFileSync(sourcePath, source)
    writeFileSync(scopePath, JSON.stringify({
      schema_version: 'lite-visual-source-scope/v2',
      source: { sha256: hash(source), word_count: 6 },
      spans: [{ id: 'scope-01', word_start: 0, word_end: 3, anchor: 'opening', summary: 'النصف الأول فقط' }],
    }))
    const result = spawnSync('python3', [validator, '--source', sourcePath, '--source-scope', scopePath, '--coverage-ledger', sourcePath, '--html', sourcePath, '--pdf', sourcePath, '--receipt-out', join(directory, 'receipt.json')], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /do not reach the final source word/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Visual Lite v5 rejects media, scripts, and preset/template markup before rendering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-code-only-'))
  try {
    const htmlPath = join(directory, 'bad.html')
    writeFileSync(htmlPath, '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width"><meta name="lite-visual-design-intent" content="شرح مصدر محدد بوضوح"><meta name="lite-visual-design-signature" content="إيقاع مستمد من المصدر"><title>اختبار</title><style>@page{size:A4}@media print{body{color:#000}}</style></head><body><main><article data-canonical-content="true"><h1>اختبار</h1><section data-source-scope="scope-01"><img src="figure.png"><script>bad()</script></section></article></main></body></html>')
    const code = `import importlib.util; s=importlib.util.spec_from_file_location('v','${validator}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m);\ntry: m.check_html(__import__('pathlib').Path('${htmlPath}'),['scope-01'])\nexcept m.ValidationError as e: print(e); raise SystemExit(0)\nraise SystemExit(1)`
    const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /forbidden media or interaction tags/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Visual Lite v5 validates claim traceability and emits a hash-bound receipt', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-v4-'))
  try {
    const source = Array.from({ length: 24 }, (_, index) => `الفكرة ${index + 1} تشرح السبب والنتيجة والمثال والشرط والحدود بوضوح كامل`).join(' ')
    const wordCount = source.trim().split(/\s+/).length
    const sourcePath = join(directory, 'source.txt')
    const scopePath = join(directory, 'source-scope.json')
    const htmlPath = join(directory, 'companion.html')
    const ledgerPath = join(directory, 'coverage-ledger.json')
    const pdfPath = join(directory, 'companion.pdf')
    const receiptPath = join(directory, 'validation-receipt.json')
    writeFileSync(sourcePath, source)
    writeFileSync(scopePath, JSON.stringify({
      schema_version: 'lite-visual-source-scope/v2',
      source: { sha256: hash(source), word_count: wordCount, url: 'https://example.com/source', title: 'المصدر', kind: 'article' },
      spans: [{ id: 'scope-01', word_start: 0, word_end: wordCount, anchor: 'complete source', summary: 'كل أفكار المصدر وأمثلته وشروطه وحدوده' }],
    }))
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="lite-visual-design-intent" content="قراءة سببية هادئة تتبع حركة هذا المصدر"><meta name="lite-visual-design-signature" content="خط جانبي يوضح انتقال السبب إلى النتيجة"><title>رفيق المصدر</title><style>@page{size:A4;margin:18mm 16mm}:root{font-size:18px;--ink:#18231d;--paper:#f8f8f4;--accent:#245c45}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Naskh Arabic","DejaVu Sans",sans-serif;font-size:1rem;line-height:1.9}main{max-width:46rem;margin:auto;padding:3rem 1.25rem}article{border-inline-start:.3rem solid var(--accent);padding-inline-start:clamp(1rem,4vw,2.5rem)}h1{font-size:clamp(2rem,7vw,4rem);line-height:1.15;margin:0 0 2rem}p{max-width:68ch;margin:0 0 1.2rem}@media(max-width:480px){main{padding:1.5rem .9rem}}@media print{body{background:#fff}main{max-width:none;padding:0}article{border:0;padding:0}h1{font-size:28pt}}</style></head><body><main><article data-canonical-content="true"><h1>كيف تنتقل الفكرة من السبب إلى النتيجة؟</h1><section id="source" data-source-scope="scope-01"><h2>الحجة الكاملة</h2><p>${source}</p></section></article></main></body></html>`
    writeFileSync(htmlPath, html)
    writeFileSync(ledgerPath, JSON.stringify({
      schema_version: 'lite-visual-coverage-ledger/v1',
      source_sha256: hash(source),
      source_items: ['1'],
      claims: [{ id: 'claim-01', source_item: '1', source_scope_ids: ['scope-01'], source_anchor_text: 'الفكرة 1 تشرح السبب', source_summary: 'تتبع الفكرة من السبب إلى النتيجة', html_section_id: 'source', html_anchor_text: 'الفكرة 1 تشرح السبب' }],
    }))
    const chrome = spawnSync('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { encoding: 'utf8' })
    if (chrome.status === null) {
      t.skip('Chrome is unavailable')
      return
    }
    assert.equal(chrome.status, 0, chrome.stderr)
    const result = spawnSync('python3', [validator, '--source', sourcePath, '--source-scope', scopePath, '--coverage-ledger', ledgerPath, '--html', htmlPath, '--pdf', pdfPath, '--receipt-out', receiptPath], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    assert.equal(receipt.schema_version, 'lite-visual-validation/v5')
    assert.equal(receipt.status, 'passed')
    assert.equal(receipt.source_sha256, hash(source))
    assert.equal(receipt.html_sha256, hash(html))
    assert.equal(receipt.pdf_sha256, hash(readFileSync(pdfPath)))
    assert.equal(receipt.coverage_ledger_sha256, hash(readFileSync(ledgerPath)))
    assert.equal(receipt.stats.claims, 1)
    assert.deepEqual(receipt.checks, { source_coverage: true, claim_traceability: true, canonical_html: true, code_only: true, rtl: true, accessibility: true, responsive: true, print_a4: true, pdf_parity: true })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
