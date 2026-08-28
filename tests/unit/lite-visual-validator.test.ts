import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const validator = '/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py'
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const signingEnv = { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: 'test-lite-visual-receipt-signing-key-2026-08-28' }

test('Visual Lite v6 rejects a source scope that does not partition the complete extraction', () => {
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
    const result = spawnSync('python3', [validator, '--source', sourcePath, '--source-scope', scopePath, '--coverage-ledger', sourcePath, '--html', sourcePath, '--pdf', sourcePath, '--work-item', sourcePath, '--source-extraction', sourcePath, '--receipt-out', join(directory, 'receipt.json')], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /do not reach the final source word/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Visual Lite v6 rejects media, scripts, and preset/template markup before rendering', () => {
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

test('Visual Lite v6 validates exact source coverage and emits a hash-bound receipt', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-v4-'))
  try {
    const source = Array.from({ length: 10 }, (_, index) => `الفكرة ${index + 1} تشرح السبب والنتيجة والمثال والشرط والحدود بوضوح كامل`).join(' ')
    const wordCount = source.trim().split(/\s+/).length
    const sourcePath = join(directory, 'source.txt')
    const scopePath = join(directory, 'source-scope.json')
    const htmlPath = join(directory, 'companion.html')
    const ledgerPath = join(directory, 'coverage-ledger.json')
    const pdfPath = join(directory, 'companion.pdf')
    const receiptPath = join(directory, 'validation-receipt.json')
    const workItemPath = join(directory, 'work-item.json')
    const extractionPath = join(directory, 'source-extraction.json')
    writeFileSync(sourcePath, source)
    writeFileSync(workItemPath, JSON.stringify({ recommendation_id: 'rec-1', source_url: 'https://example.com/source', source_title: 'المصدر' }))
    writeFileSync(extractionPath, JSON.stringify({ status: 'complete', content_sha256: hash(source) }))
    writeFileSync(scopePath, JSON.stringify({
      schema_version: 'lite-visual-source-scope/v2',
      source: { sha256: hash(source), word_count: wordCount, url: 'https://example.com/source', title: 'المصدر', kind: 'article' },
      spans: [{ id: 'scope-01', word_start: 0, word_end: wordCount, anchor: 'complete source', summary: 'كل أفكار المصدر وأمثلته وشروطه وحدوده' }],
    }))
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="lite-visual-design-intent" content="قراءة سببية هادئة تتبع حركة هذا المصدر"><meta name="lite-visual-design-signature" content="خط جانبي يوضح انتقال السبب إلى النتيجة"><title>رفيق المصدر</title><style>@page{size:A4;margin:18mm 16mm}:root{font-size:18px;--ink:#18231d;--paper:#f8f8f4;--accent:#245c45}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Naskh Arabic","DejaVu Sans",sans-serif;font-size:1rem;line-height:1.9}main{max-width:46rem;margin:auto;padding:3rem 1.25rem}article{border-inline-start:.3rem solid var(--accent);padding-inline-start:clamp(1rem,4vw,2.5rem)}h1{font-size:clamp(2rem,7vw,4rem);line-height:1.15;margin:0 0 2rem}p{max-width:68ch;margin:0 0 1.2rem}@media(max-width:480px){main{padding:1.5rem .9rem}}@media print{body{background:#fff}main{max-width:none;padding:0}article{border:0;padding:0}h1{font-size:28pt}}</style></head><body><main><article data-canonical-content="true"><h1>كيف تنتقل الفكرة من السبب إلى النتيجة؟</h1><section id="source" data-source-scope="scope-01"><h2>الحجة الكاملة</h2><div data-exact-source-scope="scope-01"><p>${source}</p></div></section></article></main></body></html>`
    writeFileSync(htmlPath, html)
    writeFileSync(ledgerPath, JSON.stringify({
      schema_version: 'lite-visual-coverage-ledger/v1',
      source_sha256: hash(source),
      source_items: ['1'],
      claims: [{ id: 'claim-01', source_item: '1', source_scope_ids: ['scope-01'], source_anchor_text: 'الفكرة 1 تشرح السبب', source_summary: 'كل أفكار المصدر وأمثلته وشروطه وحدوده', html_section_id: 'source', html_anchor_text: 'الفكرة 1 تشرح السبب' }],
    }))
    const chromeBinary = ['google-chrome', 'chromium', 'chromium-browser'].find((binary) => spawnSync(binary, ['--version'], { encoding: 'utf8' }).status === 0)
    if (!chromeBinary) {
      t.skip('Chrome is unavailable')
      return
    }
    const chrome = spawnSync(chromeBinary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { encoding: 'utf8' })
    assert.equal(chrome.status, 0, chrome.stderr)
    const baseArgs = ['--source', sourcePath, '--source-scope', scopePath, '--coverage-ledger', ledgerPath, '--work-item', workItemPath, '--source-extraction', extractionPath]
    const result = spawnSync('python3', [validator, ...baseArgs, '--html', htmlPath, '--pdf', pdfPath, '--receipt-out', receiptPath], { encoding: 'utf8', env: signingEnv })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    assert.equal(receipt.schema_version, 'lite-visual-validation/v6')
    assert.equal(receipt.status, 'passed')
    assert.equal(receipt.source_sha256, hash(source))
    assert.equal(receipt.html_sha256, hash(html))
    assert.equal(receipt.pdf_sha256, hash(readFileSync(pdfPath)))
    assert.equal(receipt.coverage_ledger_sha256, hash(readFileSync(ledgerPath)))
    assert.equal(receipt.work_item_sha256, hash(readFileSync(workItemPath)))
    assert.equal(receipt.source_extraction_sha256, hash(readFileSync(extractionPath)))
    assert.deepEqual(receipt.target, { recommendation_id: 'rec-1', source_url: 'https://example.com/source', source_title: 'المصدر' })
    assert.equal(receipt.stats.claims, 1)
    assert.equal(receipt.attestation.algorithm, 'hmac-sha256')
    assert.match(receipt.attestation.signature, /^[a-f0-9]{64}$/)
    assert.deepEqual(receipt.checks, { source_coverage: true, claim_traceability: true, exact_source_html: true, exact_source_pdf: true, canonical_html: true, code_only: true, rtl: true, accessibility: true, responsive: true, print_a4: true, pdf_parity: true })

    const omittedPath = join(directory, 'omitted.html')
    writeFileSync(omittedPath, html.replace('والحدود بوضوح كامل', 'والحذف بوضوح كامل'))
    const omitted = spawnSync('python3', [validator, ...baseArgs, '--html', omittedPath, '--pdf', pdfPath, '--receipt-out', join(directory, 'omitted-receipt.json')], { encoding: 'utf8', env: signingEnv })
    assert.notEqual(omitted.status, 0)
    assert.match(omitted.stderr, /exact source scope scope-01 differs/)

    const hiddenPrintPath = join(directory, 'hidden-print.html')
    writeFileSync(hiddenPrintPath, html.replace('@media print{', '@media print{[data-exact-source-scope]{display:none}'))
    const hiddenPrint = spawnSync('python3', [validator, ...baseArgs, '--html', hiddenPrintPath, '--pdf', pdfPath, '--receipt-out', join(directory, 'hidden-print-receipt.json')], { encoding: 'utf8', env: signingEnv })
    assert.notEqual(hiddenPrint.status, 0)
    assert.match(hiddenPrint.stderr, /print media/)

    const lowContrastPath = join(directory, 'low-contrast.html')
    writeFileSync(lowContrastPath, html.replace('</style>', '[data-exact-source-scope]{color:#fff;background:#fff}</style>'))
    const lowContrast = spawnSync('python3', [validator, ...baseArgs, '--html', lowContrastPath, '--pdf', pdfPath, '--receipt-out', join(directory, 'low-contrast-receipt.json')], { encoding: 'utf8', env: signingEnv })
    assert.notEqual(lowContrast.status, 0)
    assert.match(lowContrast.stderr, /unreadable/)

    const coveredPath = join(directory, 'covered.html')
    writeFileSync(coveredPath, html.replace('<body>', '<body><div style="position:fixed;inset:0;background:#111;z-index:9999"></div>'))
    const covered = spawnSync('python3', [validator, ...baseArgs, '--html', coveredPath, '--pdf', pdfPath, '--receipt-out', join(directory, 'covered-receipt.json')], { encoding: 'utf8', env: signingEnv })
    assert.notEqual(covered.status, 0)
    assert.match(covered.stderr, /unreadable/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
