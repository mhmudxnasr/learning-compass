import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const validator = '/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py'
const uploader = '/home/mahmud/.hermes/skills/lite-visual/scripts/upload_pair.py'
const extractor = '/home/mahmud/.hermes/skills/lite-visual/scripts/extract_source.py'
const browserRenderer = '/home/mahmud/.hermes/skills/lite-visual/scripts/render_page.mjs'
const publicUrlValidator = '/home/mahmud/.hermes/skills/lite-visual/scripts/validate_public_url.py'
const scopeBuilder = '/home/mahmud/.hermes/skills/lite-visual/scripts/build_source_scope.py'
const exactSourceEmbedder = '/home/mahmud/.hermes/skills/lite-visual/scripts/embed_exact_source.py'
const runner = '/home/mahmud/.hermes/skills/lite-visual/scripts/run_workflow.py'

test('source scope rejects any gap in the complete extracted source', () => {
  const code = `import importlib.util,tempfile,json,hashlib,pathlib; s=importlib.util.spec_from_file_location('v','${validator}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); d=pathlib.Path(tempfile.mkdtemp()); source=d/'source.txt'; source.write_text('واحد اثنان ثلاثة اربعة خمسة',encoding='utf-8'); scope=d/'scope.json'; scope.write_text(json.dumps({'schema_version':'lite-visual-source-scope/v2','source':{'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'word_count':5},'spans':[{'id':'scope-01','word_start':0,'word_end':2,'anchor':'start','summary':'first'}]}),encoding='utf-8');\ntry: m.check_source_scope(source,scope)\nexcept m.ValidationError as e: print(e); raise SystemExit(0)\nraise SystemExit(1)`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /do not reach the final source word/)
})

test('source scope rejects semantic inventory spans over 120 words', () => {
  const code = `import importlib.util,tempfile,json,hashlib,pathlib; s=importlib.util.spec_from_file_location('v','${validator}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); d=pathlib.Path(tempfile.mkdtemp()); source=d/'source.txt'; source.write_text(' '.join(f'كلمة{i}' for i in range(121)),encoding='utf-8'); scope=d/'scope.json'; scope.write_text(json.dumps({'schema_version':'lite-visual-source-scope/v2','source':{'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'word_count':121},'spans':[{'id':'scope-01','word_start':0,'word_end':121,'anchor':'كلمة0 كلمة1','summary':'تفصيل كامل للمقطع'}]}),encoding='utf-8');
try: m.check_source_scope(source,scope)
except m.ValidationError as e: print(e); raise SystemExit(0)
raise SystemExit(1)`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /120-word semantic inventory limit/)
})

test('PDF scope matching rejects omitted or reordered complete-source blocks', () => {
  const code = `import importlib.util; s=importlib.util.spec_from_file_location('v','${validator}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); first='ا'*120+'ب'*120; second='ج'*120+'د'*120; print(m.ordered_pdf_scope(first+second,first,0)); print(m.ordered_pdf_scope(first+second,second,240)); reordered=m.ordered_pdf_scope(second+first,first,0); print(reordered); print(m.ordered_pdf_scope(second+first,second,reordered)); print(m.ordered_pdf_scope(first[:-1]+second,first,0)); decoy=first[:80]+'س'*20+first+second; print(m.ordered_pdf_scope(decoy,first,0))`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '240\n480\n480\nNone\nNone\n340')
})

test('exact-source embedding uses RTL-stable Arabic quotation marks', () => {
  const code = `import importlib.util; s=importlib.util.spec_from_file_location('e','${exactSourceEmbedder}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.arabic_quotation_marks('قال "العدل" ثم “الاحسان”'))`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'قال «العدل» ثم «الاحسان»')
})

test('exact-source embedding isolates adjacent numeric runs from RTL reversal', () => {
  const code = `import importlib.util; s=importlib.util.spec_from_file_location('e','${exactSourceEmbedder}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.exact_html('عاش 70 80 سنة وقرأ 24-25 ثم 4000، <مرة>'))`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'عاش <bdi dir="ltr">70 80</bdi> سنة وقرأ <bdi dir="ltr">24-25</bdi> ثم <bdi dir="ltr">4000،</bdi> &lt;مرة&gt;')
})

test('uploader identity preflight rejects a record from another capture before uploads', () => {
  const code = `import importlib.util, types; s=importlib.util.spec_from_file_location('u','${uploader}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.request_json=lambda request:(200,{'item':{'id':'cap_abc','video_url':'https://example.com/other','video_title':'Other'}}); a=types.SimpleNamespace(recommendation_id='cap_abc',source_url='https://example.com/right',source_title='Right',worker='https://worker.example');\ntry: m.preflight_target(a)\nexcept m.UploadError as e: print(e); raise SystemExit(0)\nraise SystemExit(1)`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /source URL does not match/)
})

test('default pair identity changes when any validated content hash changes', () => {
  const code = `import importlib.util; s=importlib.util.spec_from_file_location('u','${uploader}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); r={k:c*64 for k,c in zip(m.PAIR_HASH_FIELDS,'abcde')}; a=m.default_pair_id('cap_abc',r); chapter=m.default_pair_id('cap_abc',r,'chapter-1'); r['pdf_sha256']='f'*64; b=m.default_pair_id('cap_abc',r); print(a,b,chapter); raise SystemExit(0 if len({a,b,chapter})==3 else 1)`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('browser request validator rejects loopback redirect targets', () => {
  const result = spawnSync('python3', [publicUrlValidator, 'http://127.0.0.1/private'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /private/)
  assert.match(readFileSync(browserRenderer, 'utf8'), /validate_public_url\.py/)
})

test('source-scope builder defaults to a fine 120-word inventory and leaves explicit author summaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-scope-'))
  try {
    const source = join(directory, 'source.txt')
    const output = join(directory, 'source-scope.json')
    writeFileSync(source, Array.from({ length: 241 }, (_, index) => `كلمة${index}`).join(' '))
    const result = spawnSync('python3', [scopeBuilder, '--source', source, '--out', output], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const scope = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(scope.spans[0].word_start, 0)
    assert.equal(scope.spans.length, 3)
    assert.equal(scope.spans.at(-1).word_end, 241)
    assert.ok(scope.spans.every((span: any) => span.word_end - span.word_start <= 120))
    assert.ok(scope.spans.every((span: any, index: number) => index === 0 || span.word_start === scope.spans[index - 1].word_end))
    assert.ok(scope.spans.every((span: any) => span.summary.startsWith('AUTHOR_REQUIRED')))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('workflow runner reuses an unchanged passing pair instead of rerendering a conflicting PDF', () => {
  const code = `import importlib.util,tempfile,json,pathlib,os; os.environ['LITE_VISUAL_RECEIPT_SIGNING_KEY']='test-lite-visual-receipt-signing-key-2026-08-28'; s=importlib.util.spec_from_file_location('r','${runner}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); from receipt_attestation import attest_receipt,target_sha256; d=pathlib.Path(tempfile.mkdtemp()); names=['work-item.json','source-extraction.json','source.txt','source-scope.json','coverage-ledger.json','companion.html','companion.pdf','validation-receipt.json']; paths={name:d/name for name in names}; [path.write_text(name,encoding='utf-8') for name,path in paths.items() if name != 'validation-receipt.json']; checks={key:True for key in ['source_coverage','claim_traceability','exact_source_html','exact_source_pdf','canonical_html','code_only','rtl','accessibility','responsive','print_a4','pdf_parity']}; target={'recommendation_id':'rec-1','source_url':'https://example.com/source','source_title':'Source'}; receipt={'schema_version':'lite-visual-validation/v6','workflow_contract':'lite-visual-linear/v4','status':'passed','checks':checks,'target':target,'target_sha256':target_sha256(target),'work_item_sha256':m.digest(paths['work-item.json']),'source_extraction_sha256':m.digest(paths['source-extraction.json']),'source_sha256':m.digest(paths['source.txt']),'source_scope_sha256':m.digest(paths['source-scope.json']),'coverage_ledger_sha256':m.digest(paths['coverage-ledger.json']),'html_sha256':m.digest(paths['companion.html']),'pdf_sha256':m.digest(paths['companion.pdf'])}; attest_receipt(receipt); paths['validation-receipt.json'].write_text(json.dumps(receipt),encoding='utf-8'); args=[paths[name] for name in names]; print(m.current_validation_receipt(*args)['status']); paths['companion.html'].write_text('changed',encoding='utf-8'); print(m.current_validation_receipt(*args))`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'passed\nNone')
})
