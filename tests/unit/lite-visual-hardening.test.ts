import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const validator = '/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py'
const uploader = '/home/mahmud/.hermes/skills/lite-visual/scripts/upload_pair.py'
const profileValidator = '/home/mahmud/.hermes/profiles/compass/skills/lite-visual/scripts/validate_artifact.py'
const scopeBuilder = '/home/mahmud/.hermes/skills/lite-visual/scripts/build_source_scope.py'
const profileScopeBuilder = '/home/mahmud/.hermes/profiles/compass/skills/lite-visual/scripts/build_source_scope.py'
const runner = '/home/mahmud/.hermes/skills/lite-visual/scripts/run_workflow.py'
const profileRunner = '/home/mahmud/.hermes/profiles/compass/skills/lite-visual/scripts/run_workflow.py'

test('source scope rejects any gap in the complete extracted source', () => {
  const code = `import importlib.util,tempfile,json,hashlib,pathlib; s=importlib.util.spec_from_file_location('v','${validator}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); d=pathlib.Path(tempfile.mkdtemp()); source=d/'source.txt'; source.write_text('واحد اثنان ثلاثة اربعة خمسة',encoding='utf-8'); scope=d/'scope.json'; scope.write_text(json.dumps({'schema_version':'lite-visual-source-scope/v2','source':{'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'word_count':5},'spans':[{'id':'scope-01','word_start':0,'word_end':2,'anchor':'start','summary':'first'}]}),encoding='utf-8');\ntry: m.check_source_scope(source,scope)\nexcept m.ValidationError as e: print(e); raise SystemExit(0)\nraise SystemExit(1)`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /do not reach the final source word/)
})

test('uploader identity preflight rejects a record from another capture before uploads', () => {
  const code = `import importlib.util, types; s=importlib.util.spec_from_file_location('u','${uploader}'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.request_json=lambda request:(200,{'item':{'video_url':'https://example.com/other','video_title':'Other'}}); a=types.SimpleNamespace(recommendation_id='cap_abc',source_url='https://example.com/right',source_title='Right',worker='https://worker.example');\ntry: m.preflight_target(a)\nexcept m.UploadError as e: print(e); raise SystemExit(0)\nraise SystemExit(1)`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /source URL does not match/)
})

test('source-scope builder partitions every word and leaves explicit author summaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lite-visual-scope-'))
  try {
    const source = join(directory, 'source.txt')
    const output = join(directory, 'source-scope.json')
    writeFileSync(source, Array.from({ length: 210 }, (_, index) => `كلمة${index}`).join(' '))
    const result = spawnSync('python3', [scopeBuilder, '--source', source, '--out', output, '--max-words', '80'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const scope = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(scope.spans[0].word_start, 0)
    assert.equal(scope.spans.at(-1).word_end, 210)
    assert.ok(scope.spans.every((span: any, index: number) => index === 0 || span.word_start === scope.spans[index - 1].word_end))
    assert.ok(scope.spans.every((span: any) => span.summary.startsWith('AUTHOR_REQUIRED')))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Compass profile mirrors all canonical Lite Visual workflow scripts', () => {
  assert.deepEqual(readFileSync(profileValidator), readFileSync(validator))
  assert.deepEqual(readFileSync(profileScopeBuilder), readFileSync(scopeBuilder))
  assert.deepEqual(readFileSync(profileRunner), readFileSync(runner))
})
