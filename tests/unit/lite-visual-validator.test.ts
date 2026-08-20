import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const validator = '/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py'

function checksum(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

test('Lite Visual rejects hidden transcript padding that disguises a shallow article', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-padding-'))
  try {
    const evidence = {
      schema_version: 'lite-visual-source-scope/v1',
      source: {
        id: 'source-1', url: 'https://example.com/source', title: 'Regression source', creator: 'Fixture',
        kind: 'video', language: 'en', checksum: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', word_count: 6000, duration_seconds: 600,
      },
      spans: [{
        id: 'cov-1', anchor: '00:00–10:00', summary: 'The complete source is deliberately represented as one fixture span.',
      }],
    }
    const evidencePath = join(directory, 'evidence.json')
    writeFileSync(evidencePath, JSON.stringify(evidence))
    const content = {
      contract_version: 1,
      source: { checksum: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
      document: {
        language: 'ar-EG', direction: 'rtl', title: 'مصدر الاختبار', subtitle: 'اختبار الحشو المخفي',
        visual_rationale: 'النص القصير لا يحتاج إلى أي رسم توضيحي إضافي هنا.',
        sections: [{
          id: 'overview', title: 'الفكرة الأساسية', kind: 'source', coverage_ids: ['cov-1'],
          blocks: [{ id: 'p1', type: 'paragraph', text: 'هذا متن عربي قصير جدًا ولا يمكن أن يمثل مصدرًا طويلًا كاملًا بأي شكل.' }],
        }],
      },
    }
    const contentPath = join(directory, 'content.json')
    writeFileSync(contentPath, JSON.stringify(content))
    const manifest = { schema_version: 'lite-visual-publication-evidence/v1' }
    const manifestPath = join(directory, 'images.json')
    writeFileSync(manifestPath, JSON.stringify(manifest))

    const padding = Array.from({ length: 3000 }, () => 'padding').join(' ')
    const style = `
      @page{size:A4} body{padding-inline:20px} figure{break-inside:avoid}
      p{orphans:3;widows:3} .skip:focus{position:fixed;inset:10px;outline:3px solid #000}
      @media(max-width:768px){body{padding-inline:12px}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}}
      @media print{body{font-size:18pt}}
    `
    const primary = 'الفكرة الأساسية هذا متن عربي قصير جدًا ولا يمكن أن يمثل مصدرًا طويلًا كاملًا بأي شكل.'
    const primaryWordCount = primary.match(/\S+/g)?.length ?? 0
    const body = `
      <a class="skip" href="#main">Skip</a>
      <header><h1>مصدر الاختبار</h1></header>
      <main id="main"><article>
        <nav class="reader-map"><a href="#overview">Overview</a></nav>
        <section id="overview" data-coverage-id="cov-1">
          <h2 data-block-id="section-overview-title">الفكرة الأساسية</h2>
          <span class="source-anchor" data-source-scope="cov-1">المصدر: 00:00–10:00</span>
          <p data-block-id="p1">هذا متن عربي قصير جدًا ولا يمكن أن يمثل مصدرًا طويلًا كاملًا بأي شكل.</p>
        </section>
        <section class="source-transcript" hidden><h2>Raw source</h2><p>${padding}</p></section>
      </article></main><footer>Source record</footer>
    `
    const html = `<!doctype html><html lang="ar-EG" dir="rtl"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="word-count" content="${primaryWordCount}"><meta name="evidence-count" content="1">
      <meta name="canonical-content-checksum" content="${checksum(JSON.stringify(content))}">
      <meta name="evidence-packet-checksum" content="${checksum(JSON.stringify(evidence))}">
      <title>Regression source</title><style>${style}</style></head><body>${body}</body></html>`
    const htmlPath = join(directory, 'artifact.html')
    const pdfPath = join(directory, 'artifact.pdf')
    writeFileSync(htmlPath, html)

    const chrome = spawnSync('google-chrome', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
    ], { encoding: 'utf8' })
    if (chrome.status === null) {
      t.skip('Chrome is not installed in this environment')
      return
    }
    assert.equal(chrome.status, 0, chrome.stderr)

    const result = spawnSync('python3', [validator, '--html', htmlPath, '--pdf', pdfPath, '--content', contentPath, '--source-scope', evidencePath, '--publication-evidence', manifestPath], { encoding: 'utf8' })
    assert.notEqual(result.status, 0, `validator accepted transcript padding:\n${result.stdout}`)
    assert.match(result.stderr, /hidden source|hidden reader content/i)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Lite Visual v2 rejects image-only and prose-dump modes before publication', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-experience-'))
  try {
    const sourceChecksum = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const scope = {
      schema_version: 'lite-visual-source-scope/v1',
      source: { checksum: sourceChecksum, url: 'https://example.com/source', title: 'Source', kind: 'article' },
      spans: [{ id: 'scope-01', anchor: 'p. 1', summary: 'One complete source span.' }],
    }
    const content = {
      contract_version: 2,
      source: { checksum: sourceChecksum },
      document: {
        title: 'رفيق القراءة',
        experience: {
          mode: 'image-only',
          learning_promise: 'فهم الآلية كاملة بوضوح',
          narrative_arc: ['orientation', 'mechanism'],
          art_direction: 'تحرير عربي خاص بالمصدر',
          color_strategy: 'ألوان دلالية واضحة ومتباينة',
          visual_decisions: [{ section_id: 'section-01', decision: 'hybrid', purpose: 'شرح العلاقة السببية بصريًا مع النص', source_scope_ids: ['scope-01'] }],
        },
        sections: [{ id: 'section-01', coverage_ids: ['scope-01'], blocks: [{ kind: 'paragraph', text: 'شرح عربي واضح وكامل للمفهوم.' }] }],
      },
    }
    const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width"><style>@page{size:A4}</style></head><body><span class="source-anchor" data-source-scope="scope-01">المصدر: ص ١</span></body></html>'
    const scopePath = join(directory, 'scope.json')
    const contentPath = join(directory, 'content.json')
    const evidencePath = join(directory, 'evidence.json')
    const htmlPath = join(directory, 'artifact.html')
    const pdfPath = join(directory, 'artifact.pdf')
    writeFileSync(scopePath, JSON.stringify(scope))
    writeFileSync(contentPath, JSON.stringify(content))
    writeFileSync(evidencePath, JSON.stringify({ schema_version: 'lite-visual-publication-evidence/v1' }))
    writeFileSync(htmlPath, html)
    writeFileSync(pdfPath, '%PDF-fake')
    const result = spawnSync('python3', [validator, '--html', htmlPath, '--pdf', pdfPath, '--content', contentPath, '--source-scope', scopePath, '--publication-evidence', evidencePath], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /mode=reading-companion/i)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
