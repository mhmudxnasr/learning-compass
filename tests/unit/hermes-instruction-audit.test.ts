import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { auditInstructions, instructionDocuments } from '../../scripts/hermes-instruction-audit.mjs'

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'hermes-instruction-audit-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repoRoot = join(root, 'repo'),
    skillsRoot = join(root, 'skills'),
    skillRoot = join(skillsRoot, 'owner')
  mkdirSync(join(repoRoot, 'docs'), { recursive: true })
  mkdirSync(join(skillRoot, 'references'), { recursive: true })
  mkdirSync(join(skillRoot, 'scripts'))
  writeFileSync(join(skillRoot, 'scripts/run.py'), '')
  writeFileSync(join(skillRoot, 'references/detail.md'), '# Details\n')
  writeFileSync(join(repoRoot, 'docs/API.md'), '# API\n')
  const audit = (text: string, path = join(skillRoot, 'SKILL.md')) =>
    auditInstructions({
      repoRoot,
      skillsRoot,
      packageScripts: { test: 'node --test', 'verify:release': 'node scripts/verify-release.mjs' },
      documents: [{ path, skillRoot, text }],
    })
  return { repoRoot, skillsRoot, skillRoot, audit }
}

test('missing npm commands fail even when instruction copies are identical', (t) => {
  const { audit } = fixture(t)
  const instruction = 'Run `npm run release:status -- --output docs/release-snapshot.json`.'
  for (const copy of [instruction, instruction]) assert.equal(audit(copy)[0].code, 'missing-npm-script')
  assert.deepEqual(audit('Run `npm run verify:release` and `npm test`.'), [])
})

test('instructions use native Hermes without requiring or recreating the retired profile', (t) => {
  const { audit } = fixture(t)
  for (const command of [
    'hermes -p compass prompt-size',
    'hermes --profile=compass skills list',
    'hermes profile create compass --clone',
    'hermes profile use compass',
  ]) {
    assert.equal(audit(command)[0].code, 'retired-hermes-profile')
  }
  assert.deepEqual(audit('hermes -p default prompt-size\nhermes skills list\nhermes profile delete compass'), [])
})

test('local links resolve from the reference; commands resolve from the skill root', (t) => {
  const { skillRoot, audit } = fixture(t)
  assert.deepEqual(audit('[Details](references/detail.md#section)\n`python3 scripts/run.py`'), [])
  assert.deepEqual(
    audit('[Run](../scripts/run.py)\n`python3 scripts/run.py`', join(skillRoot, 'references/detail.md')),
    [],
  )
  assert.equal(audit('[Missing](references/missing.md)')[0].code, 'missing-local-path')
  assert.equal(audit('`python3 scripts/missing.py`')[0].code, 'missing-local-path')
  assert.equal(audit('python3 "scripts/missing.py"')[0].code, 'missing-local-path')
  assert.deepEqual(audit('python3 "scripts/run.py"'), [])
})

test('canonical repository paths check the worktree, not an unrelated primary checkout', (t) => {
  const { audit } = fixture(t)
  assert.deepEqual(audit('`/home/mahmud/recommendations-worker/docs/API.md`'), [])
  assert.equal(audit('`/home/mahmud/recommendations-worker/scripts/retired.mjs`')[0].code, 'missing-local-path')
})

test('URLs, route parameters, generated examples, and output operands are not required inputs', (t) => {
  const { audit } = fixture(t)
  assert.deepEqual(
    audit(
      '[API](https://example.com/docs)\n`/capture/:id/record`\n`/abs/work/companion.html`\npython3 scripts/run.py --output output.json\n`references/<kind>.md`',
    ),
    [],
  )
})

test('frozen migration claims fail while conditional ledger instructions and schema requirements pass', (t) => {
  const { audit } = fixture(t)
  assert.equal(audit('Migrations `0069`–`0071` are undeployed.')[0].code, 'frozen-migration-state')
  assert.equal(audit('Migration `0067` is already applied in production.')[0].code, 'frozen-migration-state')
  assert.equal(audit('Migration `0069` is applied.\nMigration `0069` remains pending.').length, 2)
  assert.deepEqual(
    audit('Migration `0069` adds history. Read the ledger to determine which migrations are pending.'),
    [],
  )
  assert.deepEqual(audit('Check whether migration `0069` is applied using the live ledger.'), [])
  assert.deepEqual(
    audit(
      'Compare migrations with the live ledger before applying only pending files.\nMigration `0069` adds revision history.',
    ),
    [],
  )
})

test('natural prose may report exact facts without requiring a literal response template', (t) => {
  const { audit } = fixture(t)
  assert.equal(
    audit('Return the canonical receipt `intent → target → before → mutation/job → after → evidence → blocker`.')[0]
      .code,
    'forced-response-template',
  )
  assert.deepEqual(
    audit(
      'Keep exact target, branch ID, before/after, verification, and blocker in the operation receipt. Explain the verified outcome naturally; include IDs when useful.',
    ),
    [],
  )
})

test('referenced instructions are audited as well as the entry point', (t) => {
  const { repoRoot, skillsRoot, skillRoot } = fixture(t)
  writeFileSync(join(skillRoot, 'SKILL.md'), '[Details](references/detail.md)\n')
  writeFileSync(join(skillRoot, 'references/detail.md'), 'Run `npm run retired:command`.\n')
  writeFileSync(join(repoRoot, '.hermes.md'), '# Routing\n')
  writeFileSync(join(repoRoot, 'docs/hermes-production.md'), '# Operations\n')
  const documents = instructionDocuments(repoRoot, skillsRoot, [{ path: 'owner' }])
  const issues = auditInstructions({ repoRoot, skillsRoot, packageScripts: {}, documents })
  assert.equal(issues.length, 1)
  assert.equal(issues[0].path, join(skillRoot, 'references/detail.md'))
})
