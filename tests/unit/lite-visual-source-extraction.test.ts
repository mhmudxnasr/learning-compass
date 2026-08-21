import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const extractor = '/home/mahmud/.hermes/skills/lite-visual/scripts/extract_source.py'
const transcript = '/home/mahmud/.hermes/skills/lite-visual/scripts/fetch_transcript.py'

test('source router extracts the complete article body and returns a millisecond cache hit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-source-'))
  try {
    const paragraph = (number: number) => `الفقرة ${number} تشرح الفكرة الأساسية والسبب والنتيجة والمثال والشرط والحدود بطريقة كاملة تحافظ على معنى المصدر من دون حذف أو اختصار مخل.`
    const article = `<!doctype html><html lang="ar" dir="rtl"><head><title>المقال الكامل</title><link rel="canonical" href="https://example.com/canonical"></head><body><nav>قائمة لا تنتمي للمقال</nav><main><article><h1>المقال الكامل</h1>${Array.from({ length: 12 }, (_, index) => `<p>${paragraph(index + 1)}</p>`).join('')}</article></main><footer>تذييل متكرر</footer></body></html>`
    const input = join(directory, 'article.html')
    const output = join(directory, 'source.txt')
    const manifest = join(directory, 'manifest.json')
    const cache = join(directory, 'cache')
    writeFileSync(input, article)
    const first = spawnSync('python3', [extractor, input, '--kind', 'article', '--output', output, '--manifest', manifest, '--cache-dir', cache], { encoding: 'utf8' })
    assert.equal(first.status, 0, first.stderr)
    const body = readFileSync(output, 'utf8')
    const receipt = JSON.parse(readFileSync(manifest, 'utf8'))
    assert.match(body, /الفكرة الأساسية/)
    assert.doesNotMatch(body, /قائمة لا تنتمي/)
    assert.equal(receipt.status, 'complete')
    assert.equal(receipt.method, 'mozilla-readability')
    assert.equal(receipt.cache_hit, false)
    assert.ok(receipt.word_count >= 100)

    const cached = spawnSync('python3', [extractor, input, '--kind', 'article', '--output', output, '--manifest', manifest, '--cache-dir', cache], { encoding: 'utf8' })
    assert.equal(cached.status, 0, cached.stderr)
    const cachedReceipt = JSON.parse(readFileSync(manifest, 'utf8'))
    assert.equal(cachedReceipt.cache_hit, true)
    assert.ok(cachedReceipt.elapsed_ms < 100)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('source router rejects a visibly truncated paywall instead of inventing completeness', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-paywall-'))
  try {
    const input = join(directory, 'paywall.html')
    const output = join(directory, 'source.txt')
    const manifest = join(directory, 'manifest.json')
    writeFileSync(input, '<!doctype html><html><head><title>Locked</title></head><body><article><h1>Locked</h1><p>Subscribe to continue reading this article.</p><p>Only this introduction is visible.</p><p>The rest is unavailable.</p></article></body></html>')
    const result = spawnSync('python3', [extractor, input, '--kind', 'article', '--output', output, '--manifest', manifest, '--cache-dir', join(directory, 'cache')], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).status, 'blocked')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('source router visits every text PDF page and preserves page anchors', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-pdf-source-'))
  try {
    const htmlPath = join(directory, 'source.html')
    const pdfPath = join(directory, 'source.pdf')
    const output = join(directory, 'source.txt')
    const manifest = join(directory, 'manifest.json')
    const content = Array.from({ length: 60 }, (_, index) => `النقطة ${index + 1} تشرح الدليل والمثال والحدود.`).join(' ')
    writeFileSync(htmlPath, `<!doctype html><html lang="ar" dir="rtl"><style>@page{size:A4;margin:18mm}</style><body><p>${content}</p></body></html>`)
    const chrome = spawnSync('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { encoding: 'utf8' })
    if (chrome.status === null) { t.skip('Chrome unavailable'); return }
    assert.equal(chrome.status, 0, chrome.stderr)
    const result = spawnSync('python3', [extractor, pdfPath, '--kind', 'pdf', '--no-ocr', '--output', output, '--manifest', manifest, '--cache-dir', join(directory, 'cache')], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(readFileSync(manifest, 'utf8'))
    assert.equal(receipt.status, 'complete')
    assert.equal(receipt.method, 'pymupdf')
    assert.ok(receipt.adapter.page_count >= 1)
    assert.match(readFileSync(output, 'utf8'), /\[PAGE 1\]/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('transcript adapter converts VTT to clean timestamped text and exposes AI-friendly aliases', () => {
  const code = `import importlib.util; s=importlib.util.spec_from_file_location('t','${transcript}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); raw='WEBVTT\\n\\n00:00:01.000 --> 00:00:03.000\\n<c>مرحبا بكم في الشرح الكامل للمصدر ومعناه وأمثلته وحدوده المهمة جدا</c>\\n\\n00:00:04.000 --> 00:00:06.000\\nنشرح الآن السبب والنتيجة والدليل والتطبيق والخلاصة بوضوح كامل للقارئ\\n'; text=m.parse_vtt(raw, True); print(text); print(m.validate_transcript(text))`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\[00:00:01\]/)
  assert.doesNotMatch(result.stdout, /WEBVTT|-->/)
  const help = spawnSync('python3', [transcript, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /--url/)
  assert.match(help.stdout, /--language LANGUAGE, --languages LANGUAGE/)
  assert.match(help.stdout, /--manifest/)
})
