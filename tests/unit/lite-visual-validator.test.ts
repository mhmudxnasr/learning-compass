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

test('Lite Visual rejects hidden transcript padding that disguises a shallow article', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-padding-'))
  try {
    const evidence = {
      contract_version: 1,
      source: {
        id: 'source-1', url: 'https://example.com/source', title: 'Regression source', creator: 'Fixture',
        kind: 'video', language: 'en', checksum: '0123456789abcdef', word_count: 6000, duration_seconds: 600,
      },
      transcript: { file: 'source.json', checksum: 'abcdef0123456789', segment_count: 10, first_start_seconds: 0, last_end_seconds: 600 },
      coverage_matrix: [{
        id: 'cov-1', title: 'Full source', start_seconds: 0, end_seconds: 600,
        key_points: ['The complete source is deliberately represented as one fixture span.'],
        canonical_section_ids: ['overview'],
      }],
    }
    const evidencePath = join(directory, 'evidence.json')
    writeFileSync(evidencePath, JSON.stringify(evidence))
    const content = {
      contract_version: 1,
      source: { checksum: '0123456789abcdef' },
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
    const manifest = {
      contract_version: 3,
      source_checksum: '0123456789abcdef',
      evidence_packet_checksum: checksum(JSON.stringify(evidence)),
      canonical_content_checksum: checksum(JSON.stringify(content)),
      visual_plan: { decision: 'none', rationale: 'The fixture needs no visual because prose is structurally sufficient.' },
      visual_count: 0,
      visuals: [],
    }
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
    assert.equal(chrome.status, 0, chrome.stderr)

    const result = spawnSync('python3', [validator, htmlPath, pdfPath, evidencePath, manifestPath, contentPath], { encoding: 'utf8' })
    assert.notEqual(result.status, 0, `validator accepted transcript padding:\n${result.stdout}`)
    assert.match(result.stdout, /primary reading|hidden source|JSON evidence packet/i)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
