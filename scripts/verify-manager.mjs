import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const managerRoot = join(process.env.HOME || '/home/mahmud', '.hermes', 'hermes-agent')
const fixtureRoot = join(repoRoot, 'tests', 'hermes-manager')
const runner = join(managerRoot, 'scripts', 'run_tests.sh')
const test = join(fixtureRoot, 'tests', 'evals', 'test_manager_routing_harness.py')
for (const file of [runner, test, join(fixtureRoot, 'evals', 'manager_routing', 'cases.json')]) {
  if (!existsSync(file)) throw new Error(`Required manager release fixture is missing: ${file}`)
}
const output = mkdtempSync(join(tmpdir(), 'learning-compass-manager-gate-'))
const report = join(output, 'results.xml')
try {
  const result = spawnSync(
    runner,
    [test, '-q', '-o', `pythonpath=${fixtureRoot} ${managerRoot}`, `--junitxml=${report}`],
    { cwd: managerRoot, env: process.env, stdio: 'inherit' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Manager harness failed with exit code ${result.status}`)
  if (!existsSync(report)) throw new Error('Manager harness returned without a test report')
  const suites = [...readFileSync(report, 'utf8').matchAll(/<testsuite\s([^>]+)>/g)]
  const counts = Object.fromEntries(
    ['tests', 'failures', 'errors', 'skipped'].map((key) => [
      key,
      suites.reduce((total, suite) => {
        const value = suite[1].match(new RegExp(`\\b${key}="(\\d+)"`))
        if (!value) throw new Error(`Manager report omits ${key}`)
        return total + Number(value[1])
      }, 0),
    ]),
  )
  if (counts.tests < 38 || counts.failures || counts.errors || counts.skipped)
    throw new Error(`Manager harness did not complete its release cases: ${JSON.stringify(counts)}`)
  console.log(`Manager release gate passed: ${counts.tests} tests, zero failures or skips.`)
} finally {
  rmSync(output, { recursive: true, force: true })
}
