import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scripts = '/home/mahmud/.hermes/skills/lite-visual/scripts'
const importValidator = `import sys; sys.path.insert(0,${JSON.stringify(scripts)}); import validate_artifact as v\n`
function python(code: string) {
  const result = spawnSync('python3', ['-c', importValidator + code], { encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}
const passage = 'الفكرة هنا إننا نفهم السبب خطوة بخطوة ونوضح إزاي النتيجة حصلت وإمتى التفسير ده يفضل صحيح.'
const document = (css = '') => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>شرح السبب والنتيجة</title><style>@page{size:A4;margin:18mm}body{font-family:Tahoma,sans-serif;font-size:18px;line-height:1.9;color:#111;background:#fff;margin:20px}h1,h2{line-height:1.4}p{overflow-wrap:anywhere}@media print{body{margin:0}}${css}</style></head><body><main><article data-canonical-content="true"><h1>إزاي نفهم السبب؟</h1><section id="explanation" data-source-scope="scope-01"><h2>السبب والنتيجة</h2><p>${passage}</p></section><section id="exact-source"><h2>النص الكامل للمصدر</h2><p data-exact-source-scope="scope-01">النص الأصلي بيعرض الفكرة والمثال والنتيجة والحدود عشان نقدر نراجع المعنى بدقة.</p></section></article></main></body></html>`

for (const [name, css, mode] of [
  ['hidden authored explanation', '#explanation{display:none}', 'unreadable'],
  ['low-contrast authored explanation', '#explanation p{color:#fff}', 'unreadable'],
  ['print-only omission', '@media print{#explanation{display:none}}', 'print media'],
  ['fixed-size text clipped after actual enlargement', '#explanation p{font-size:16px;line-height:24px;height:28px;overflow:hidden}', '200% text size'],
]) {
  test(`reading gate rejects ${name} even when the complete source stays visible`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'lite-teaching-browser-'))
    try {
      const html = join(dir, 'companion.html')
      // The enlargement fixture gets a single short line before resizing.
      writeFileSync(html, name.startsWith('fixed-size') ? document(css).replace(passage, 'الشرح واضح ومقروء قبل تكبير حجم النص.') : document(css))
      const result = python(`from pathlib import Path
try: v.check_browser(Path(${JSON.stringify(html)}),1)
except v.ValidationError as e: print(e)
else: raise AssertionError('unreadable authored content was accepted')`)
      assert.match(result, new RegExp(mode))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}

test('editorial review binds every pass to authored text and becomes stale after a prose change', () => {
  python(`import copy
p=v.CanonicalHTML(); p.feed(${JSON.stringify(document())})
e={'section_id':'explanation','anchor_text':${JSON.stringify(passage)},'note':'The explanation names the causal steps and retains their conditions.'}
r={'schema_version':v.EDITORIAL_SCHEMA,'language':'egyptian-arabic','reader_goal':'Understand the source mechanism','assumed_knowledge':'Explain the unfamiliar mechanism at first use','authored_text_sha256':v.authored_digest(p),'passes':{name:dict(e) for name in ['fidelity','teaching','language','continuity']}}
assert v.check_editorial_review({'editorial_review':r},p)['editorial_review_passes']==4
for mutation in ['missing','wrong_anchor','appendix','changed_prose']:
 candidate=copy.deepcopy(r); parsed=p
 if mutation=='missing': del candidate['passes']['language']
 if mutation=='wrong_anchor': candidate['passes']['teaching']['anchor_text']='كلام مختلف تماما'
 if mutation=='appendix': candidate['passes']['fidelity'].update(section_id='exact-source',anchor_text='النص الأصلي بيعرض الفكرة')
 if mutation=='changed_prose':
  parsed=v.CanonicalHTML(); parsed.feed(${JSON.stringify(document().replace(passage, `${passage} إضافة تغيّر الشرح.`))})
 try: v.check_editorial_review({'editorial_review':candidate},parsed)
 except v.ValidationError: pass
 else: raise AssertionError(mutation+' was accepted')`)
})

test('source embedding preserves punctuation, diacritics, decimals, notation, and paragraph breaks', () => {
  python(`import embed_exact_source as e
from html.parser import HTMLParser
text=${JSON.stringify('قَالَ: "النسبة 3.5% (n=40)، والحد 24-25."\n\nCost = $10.50; x < 3.\nالنص الأخير.')}
offsets=e.source_word_offsets(text)
assert len(offsets)==len(v.words(text))
scope={'spans':[{'id':'scope-01','word_start':0,'word_end':8},{'id':'scope-02','word_start':8,'word_end':len(offsets)}]}
p=v.CanonicalHTML(); p.feed('<article data-canonical-content="true">'+e.exact_source_markup(text,scope)+'</article>')
for span in scope['spans']:
 assert v.words(' '.join(p.exact_scope_text[span['id']]))==v.words(text)[span['word_start']:span['word_end']]
class Reader(HTMLParser):
 def __init__(self): super().__init__(); self.active=False; self.parts=[]
 def handle_starttag(self,t,a):
  if t=='div' and dict(a).get('class')=='exact-source-text': self.active=True
 def handle_endtag(self,t):
  if t=='div': self.active=False
 def handle_data(self,s):
  if self.active:self.parts.append(s)
reader=Reader();reader.feed(e.exact_source_markup(text,scope));assert ''.join(reader.parts)==text
ligature='قال ﷺ ثم أكمل الكلام'
assert len(e.source_word_offsets(ligature))==len(v.words(ligature))
try:e.exact_source_markup(ligature,{'spans':[{'id':'scope-01','word_start':0,'word_end':2}]})
except ValueError as error:assert 'ligature' in str(error)
else:raise AssertionError('split presentation ligature was accepted')`)
})

test('each meaning unit must resolve inside its own source scope and authored section', () => {
  python(`import tempfile,json,hashlib,copy
from pathlib import Path
source='المبدأ يشرح السبب والمثال الأول. القيد يوضح حدود النتيجة والمثال الثاني.'
markup='<article data-canonical-content="true"><section id="first"><p>المبدأ بيشرح السبب والمثال الأول.</p></section><section id="second"><p>القيد بيوضح حدود النتيجة والمثال الثاني.</p></section></article>'
parsed=v.CanonicalHTML();parsed.feed(markup)
chunks=[('scope-01',0,5,'المبدأ يشرح السبب','first','المبدأ بيشرح السبب'),('scope-02',5,len(v.words(source)),'القيد يوضح حدود','second','القيد بيوضح حدود')]
source_hash=hashlib.sha256(source.encode()).hexdigest()
spans=[{'id':i,'word_start':start,'word_end':end,'summary':anchor} for i,start,end,anchor,section,html_anchor in chunks]
claims=[{'id':'claim-'+i,'source_scope_ids':[i],'source_anchor_text':anchor,'source_summary':anchor,'html_section_id':section,'html_anchor_text':html_anchor,'meaning_units':[{'kind':'claim','source_anchor_text':anchor,'html_anchor_text':html_anchor}]} for i,start,end,anchor,section,html_anchor in chunks]
e={'section_id':'first','anchor_text':'المبدأ بيشرح السبب','note':'Verified this source-specific passage against the accepted source.'}
review={'schema_version':v.EDITORIAL_SCHEMA,'language':'egyptian-arabic','reader_goal':'Explain the principle and its limit','assumed_knowledge':'Define the unfamiliar principle','authored_text_sha256':v.authored_digest(parsed),'passes':{name:dict(e) for name in ['fidelity','teaching','language','continuity']}}
ledger={'schema_version':v.LEDGER_SCHEMA,'source_sha256':source_hash,'claims':claims,'editorial_review':review}
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder);src=root/'source.txt';scope=root/'scope.json';path=root/'ledger.json'
 src.write_text(source);scope.write_text(json.dumps({'spans':spans}));path.write_text(json.dumps(ledger))
 assert v.check_claim_traceability(src,scope,path,parsed)['meaning_units']==2
 for failure in ['missing','wrong_section','wrong_scope','invalid_kind']:
  changed=copy.deepcopy(ledger)
  if failure=='missing':changed['claims'][0]['meaning_units']=[]
  if failure=='wrong_section':changed['claims'][0]['meaning_units'][0]['html_anchor_text']='القيد بيوضح حدود'
  if failure=='wrong_scope':changed['claims'][0]['meaning_units'][0]['source_anchor_text']='القيد يوضح حدود'
  if failure=='invalid_kind':changed['claims'][0]['meaning_units'][0]['kind']=[]
  path.write_text(json.dumps(changed))
  try:v.check_claim_traceability(src,scope,path,parsed)
  except v.ValidationError:pass
  else:raise AssertionError(failure+' was accepted')
 # An old/unreviewed workspace must fail before any render, job claim, or upload.
 import run_workflow as workflow
 from types import SimpleNamespace
 (root/'work-item.json').write_text('{}');(root/'source-extraction.json').write_text('{}')
 (root/'source-scope.json').write_text(scope.read_text());(root/'companion.html').write_text(markup)
 del ledger['editorial_review'];(root/'coverage-ledger.json').write_text(json.dumps(ledger))
 def forbidden(*a,**kw):raise AssertionError('external operation before editorial review')
 workflow.api=forbidden;workflow.run=forbidden
 try:workflow.publish(SimpleNamespace(workdir=root))
 except workflow.WorkflowError as error:assert 'editorial preflight failed' in str(error)
 else:raise AssertionError('unreviewed publication was accepted')`)
})

test('PDF renderer produces tags/bookmarks and preserves an existing PDF when a resource is blocked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lite-teaching-pdf-'))
  try {
    const html = join(dir, 'companion.html'), pdf = join(dir, 'companion.pdf')
    writeFileSync(html, document())
    const render = () => spawnSync('node', [join(scripts, 'render_pdf.mjs'), html, pdf], { encoding: 'utf8' })
    const result = render()
    assert.equal(result.status, 0, result.stderr)
    const contents = readFileSync(pdf)
    assert.ok(contents.includes(Buffer.from('/Outlines')), 'PDF must contain heading bookmarks')
    assert.ok(contents.includes(Buffer.from('/StructTreeRoot')), 'PDF must retain structure tags')
    const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' })
    assert.equal(info.status, 0, info.stderr)
    assert.match(info.stdout, /Tagged:\s+yes/)
    assert.match(info.stdout, /Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/)
    writeFileSync(html, document().replace('</head>', '<link rel="stylesheet" href="https://example.invalid/disallowed.css"></head>'))
    const blocked = render()
    assert.notEqual(blocked.status, 0)
    assert.match(blocked.stderr, /not self-contained/)
    assert.deepEqual(readFileSync(pdf), contents)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
