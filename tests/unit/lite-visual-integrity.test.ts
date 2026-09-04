import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  LITE_VISUAL_INTEGRITY_SCHEMA,
  liteVisualReceiptSignature,
  normalizeQualityAssurance,
  sha256Hex,
  validLiteVisualAttestation,
  validateLiteVisualPair,
} from '../../src/artifact-metadata.ts'
import { validateLiteVisualCheckpointEvidence } from '../../src/services/lite-visual-workflow.ts'

const scripts = '/home/mahmud/.hermes/skills/lite-visual/scripts'
const key = 'local-test-integrity-only-key-at-least-32-bytes'

test(
  'direct finish renders once without ledgers, source duplication, editorial passes, or browser/PDF QA; Worker verifies the honest receipt',
  { skip: !existsSync(join(scripts, 'run_workflow.py')) && 'native Hermes installation required' },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lite-integrity-'))
    try {
      const source =
        'This is a complete synthetic source for testing the direct rendering workflow and its file integrity boundary.'
      const html =
        '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>شرح الفكرة</title><style>@page{size:A4}body{font:18px/1.9 Tahoma}p{color:#eee}</style><body><article data-canonical-content="true"><h1>إزاي نفهم الفكرة؟</h1><p>دي تجربة للملفات، ومش دليل على إن الشرح اتراجع أو إن كل تفاصيل التصميم سليمة.</p></article></body></html>'
      // Low contrast deliberately demonstrates that this receipt does not attest QA.
      writeFileSync(join(dir, 'source.txt'), source)
      writeFileSync(
        join(dir, 'source-extraction.json'),
        JSON.stringify({
          schema_version: 'lite-visual-source-extraction/v1',
          status: 'complete',
          content_sha256: await sha256Hex(source),
          word_count: 20,
          method: 'direct-utf8',
          cache_key: 'c'.repeat(64),
        }),
      )
      writeFileSync(join(dir, 'companion.html'), html)
      const command = [
        join(scripts, 'run_workflow.py'),
        'finish',
        '--workdir',
        dir,
        '--recommendation-id',
        'test-source',
        '--source-url',
        'https://example.test/source',
        '--source-title',
        'Source',
      ]
      const finish = () =>
        spawnSync('python3', command, {
          encoding: 'utf8',
          env: { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: key },
          timeout: 30_000,
        })
      const first = finish()
      assert.equal(first.status, 0, first.stderr)
      assert.equal(
        readFileSync(join(dir, 'companion.html'), 'utf8'),
        html,
        'must not append source text or rewrite the article',
      )
      const rawReceipt = readFileSync(join(dir, 'validation-receipt.json'), 'utf8')
      const receipt = JSON.parse(rawReceipt)
      assert.equal(receipt.schema_version, LITE_VISUAL_INTEGRITY_SCHEMA)
      assert.equal(receipt.quality_checks, 'not_run')
      assert.equal(receipt.verification_scope, 'integrity-only')
      assert.equal(receipt.checks.accessibility, undefined)
      assert.equal(receipt.checks.pdf_parity, undefined)
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'coverage-ledger.json'), 'utf8')).claims, [])
      const second = finish()
      assert.equal(second.status, 0, second.stderr)
      assert.equal(second.stderr, '', 'hash-matched retry must not render again')
      assert.equal(readFileSync(join(dir, 'validation-receipt.json'), 'utf8'), rawReceipt)
      const oldServer = spawnSync(
        'python3',
        [
          '-c',
          `import sys;sys.path.insert(0,${JSON.stringify(scripts)})
from pathlib import Path
from types import SimpleNamespace
import run_workflow as w
calls=[]
def old_api(worker,path,*args,**kwargs):
 calls.append(path);raise w.WorkflowError('HTTP 404')
w.api=old_api
args=SimpleNamespace(workdir=Path(${JSON.stringify(dir)}),recommendation_id='test-source',source_url='https://example.test/source',source_title='Source',expected_hashes_json=None,expected_provenance_json=None,worker='https://old.example')
try:w.publish(args)
except w.WorkflowError as error:assert 'finished local HTML/PDF are preserved' in str(error),error
else:raise AssertionError('unsupported receiver accepted')
assert calls==['/artifacts/pair-contract'],calls`,
        ],
        { encoding: 'utf8', env: { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: key } },
      )
      assert.equal(oldServer.status, 0, oldServer.stderr)
      const manifest = join(dir, 'batch.json'),
        registration = join(dir, 'registration.json')
      const target = {
        recording_number: 1,
        recommendation_id: 'test-source',
        source_url: 'https://example.test/source',
        source_title: 'Source',
        workdir: dir,
        job_id: 'job-test',
        workflow_run_id: 'run-test',
        supersedes_pair_id: 'lv-prior-pair',
      }
      writeFileSync(manifest, JSON.stringify({ thread_id: 'thread-test', targets: [target] }))
      const audit = () =>
        spawnSync('python3', [join(scripts, 'audit_pair_set.py'), manifest, '--out', registration], {
          encoding: 'utf8',
          env: { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: key },
        })
      const audited = audit()
      assert.equal(audited.status, 0, audited.stderr)
      const batch = JSON.parse(readFileSync(registration, 'utf8'))
      assert.equal(batch.audit_receipt.schema_version, 'lite-visual-corpus-integrity/v1')
      assert.equal(batch.audit_receipt.quality_checks, 'not_run')
      assert.equal(await validLiteVisualAttestation(batch.audit_receipt, key), true)
      assert.equal(
        batch.target_set_sha256,
        await sha256Hex(JSON.stringify([[1, target.recommendation_id, target.source_url, target.source_title, dir]])),
      )
      const fields = [
        'recording_number',
        'recommendation_id',
        'chapter_key',
        'source_url',
        'source_title',
        'workdir',
        'pair_id',
        'target_sha256',
        'work_item_sha256',
        'source_extraction_sha256',
        'source_sha256',
        'source_scope_sha256',
        'coverage_ledger_sha256',
        'html_sha256',
        'pdf_sha256',
        'receipt_sha256',
      ]
      assert.equal(
        batch.audit_corpus_sha256,
        await sha256Hex(
          JSON.stringify(batch.targets.map((t: Record<string, unknown>) => fields.map((field) => t[field] ?? ''))),
        ),
      )
      writeFileSync(manifest, JSON.stringify({ thread_id: 'thread-test', targets: [target, target] }))
      assert.notEqual(audit().status, 0, 'duplicate batch target must fail')
      const htmlBytes = new Uint8Array(readFileSync(join(dir, 'companion.html'))).buffer
      const pdfBytes = new Uint8Array(readFileSync(join(dir, 'companion.pdf'))).buffer
      const metadata = {
        pair_id: 'lv-test-source',
        recommendation_id: 'test-source',
        source_checksum: receipt.source_sha256,
        generator: 'lite-visual',
        workflow_contract: receipt.workflow_contract,
        asset_policy: 'code-only',
        recommended_start: 'html',
      }
      const check = (candidate: typeof receipt, bytes = htmlBytes) =>
        validateLiteVisualPair(
          metadata,
          candidate,
          { name: 'companion.html', type: 'text/html' },
          { name: 'companion.pdf', type: 'application/pdf' },
          bytes,
          pdfBytes,
          key,
        )
      const accepted = await check(receipt)
      assert.equal(accepted.ok, true, accepted.failures.join('\n'))
      assert.equal((await check(receipt, new TextEncoder().encode(html + 'changed').buffer)).ok, false)
      for (const mutation of ['false-quality-claim', 'wrong-scope', 'extra-check', 'numeric-check']) {
        const changed = structuredClone(receipt)
        if (mutation === 'false-quality-claim') changed.quality_checks = 'passed'
        if (mutation === 'wrong-scope') changed.verification_scope = 'full-validation'
        if (mutation === 'extra-check') changed.checks.accessibility = true
        if (mutation === 'numeric-check') changed.checks.render_binding = 1
        changed.attestation.signature = await liteVisualReceiptSignature(changed, key)
        assert.equal((await check(changed)).ok, false, mutation)
        const local = spawnSync(
          'python3',
          [
            '-c',
            `import sys,json;sys.path.insert(0,${JSON.stringify(scripts)});from pair_integrity import receipt_valid;assert not receipt_valid(json.loads(sys.argv[1]))`,
            JSON.stringify(changed),
          ],
          { encoding: 'utf8', env: { ...process.env, LITE_VISUAL_RECEIPT_SIGNING_KEY: key } },
        )
        assert.equal(local.status, 0, `${mutation}: ${local.stderr}`)
      }
      const qa = normalizeQualityAssurance({
        generator: 'lite-visual',
        role: 'html',
        validation_status: 'passed',
        validation_receipt_schema: receipt.schema_version,
      })
      assert.equal(qa.status, 'unverified')
      assert.equal(qa.quality_checks, 'not_run')
      // A changed extraction binding fails before rerendering; the previous PDF survives.
      const previous = readFileSync(join(dir, 'companion.pdf'))
      writeFileSync(join(dir, 'source.txt'), source + 'changed')
      const stale = finish()
      assert.notEqual(stale.status, 0)
      assert.match(stale.stderr, /source extraction must be complete and match/)
      assert.deepEqual(readFileSync(join(dir, 'companion.pdf')), previous)
      writeFileSync(manifest, JSON.stringify({ thread_id: 'thread-test', targets: [target] }))
      assert.notEqual(audit().status, 0, 'changed source must invalidate aggregate binding')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

test('direct checkpoint evidence reports zero reviewed scopes/claims explicitly while old checkpoints remain strict', () => {
  const source = { source_sha256: 'a'.repeat(64), source_scope_sha256: 'b'.repeat(64), word_count: 100, span_count: 0 }
  const html = {
    html_sha256: 'a'.repeat(64),
    coverage_ledger_sha256: 'b'.repeat(64),
    claim_count: 0,
    canonical_selector: 'article[data-canonical-content=true]',
  }
  assert.deepEqual(validateLiteVisualCheckpointEvidence('author_html', { ...source, authoring_mode: 'direct' }), [])
  assert.deepEqual(validateLiteVisualCheckpointEvidence('render_pdf', { ...html, authoring_mode: 'direct' }), [])
  assert.notDeepEqual(validateLiteVisualCheckpointEvidence('author_html', source), [])
  assert.notDeepEqual(validateLiteVisualCheckpointEvidence('render_pdf', html), [])
  assert.deepEqual(
    validateLiteVisualCheckpointEvidence('publish_pair', {
      validation_schema: LITE_VISUAL_INTEGRITY_SCHEMA,
      validation_status: 'passed',
      receipt_sha256: 'a'.repeat(64),
    }),
    [],
  )
})
