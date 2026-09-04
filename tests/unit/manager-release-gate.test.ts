import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('manager release gate rejects an empty successful runner and incomplete test reports', () => {
  const home = mkdtempSync(join(tmpdir(), 'manager-release-test-'))
  const scripts = join(home, '.hermes', 'hermes-agent', 'scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(
    join(scripts, 'run_tests.sh'),
    `#!${process.execPath}
const fs = require('node:fs');
const output = process.argv.find((arg) => arg.startsWith('--junitxml='));
if (process.env.MANAGER_TEST_REPORT) fs.writeFileSync(output.slice('--junitxml='.length), process.env.MANAGER_TEST_REPORT);
`,
    { mode: 0o755 },
  )
  try {
    for (const [report, passes] of [
      ['', false],
      ['<testsuites></testsuites>', false],
      ['<testsuite tests="0" failures="0" errors="0" skipped="0"></testsuite>', false],
      ['<testsuite tests="38" failures="1" errors="0" skipped="0"></testsuite>', false],
      ['<testsuite tests="38" failures="0" errors="0" skipped="1"></testsuite>', false],
      ['<testsuite tests="38" failures="0" errors="0" skipped="0"></testsuite>', true],
    ] as const) {
      const result = spawnSync(process.execPath, ['scripts/verify-manager.mjs'], {
        env: { ...process.env, HOME: home, MANAGER_TEST_REPORT: report },
        encoding: 'utf8',
      })
      assert.equal(result.status === 0, passes, result.stderr || result.stdout)
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
