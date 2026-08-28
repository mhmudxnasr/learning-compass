import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('the combined release gate is complete and local-only', () => {
  const scripts = JSON.parse(read('package.json')).scripts
  assert.equal(scripts['verify:release'], 'node scripts/verify-release.mjs')
  assert.equal(scripts.deploy, 'node scripts/deploy-release.mjs')

  const gate = read('scripts/verify-release.mjs')
  for (const required of [
    "run('Unit tests and TypeScript', 'npm', ['test'])",
    "run('Production build and bundle budget', 'npm', ['run', 'build'])",
    "run('Worker-backed responsive, PWA, offline, and public-boundary E2E', 'npm', ['run', 'test:e2e'])",
    "run('Hermes contracts and Telegram prompt budgets', 'npm', ['run', 'verify:hermes'])",
    "run('Fresh and idempotent migration rehearsal', 'npm', ['run', 'verify:migrations'])",
    "run('Agent control contract', 'npm', ['run', 'verify:agent-contract'])",
    'test_manager_routing_harness.py',
    'assertMirror(skillPath)',
    'assertNoRetiredClientAuth()',
    'assertNoRetiredReleaseDocsAuth()',
    'Retired Learning Compass auth credential remains in release documentation',
    'credentialPatterns',
    "run('Final tracked diff check', 'git', ['diff', 'HEAD', '--check'])",
  ]) assert.ok(gate.includes(required), `missing release gate: ${required}`)

  assert.doesNotMatch(gate, /wrangler\s+(?:deploy|rollback)/)
  assert.doesNotMatch(gate, /--remote/)
  assert.doesNotMatch(gate, /backup:production/)

  const deploy = read('scripts/deploy-release.mjs')
  assert.match(deploy, /npm', \['run', 'verify:release'\]/)
  assert.match(deploy, /\/health\/ready/)
  assert.match(deploy, /wrangler', 'deploy'/)
  assert.match(deploy, /verify-deploy\.sh/)
})

test('local Worker commands do not depend on a retired auth flag', () => {
  const integrationFiles = readdirSync(new URL('../integration/', import.meta.url))
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => read(`tests/integration/${name}`))
  const localCommands = [read('package.json'), read('tests/e2e/routes.mjs'), ...integrationFiles].join('\n')
  assert.doesNotMatch(localCommands, /REQUIRE_API_AUTH/)
})

test('E2E proves the public API and retired session boundary', () => {
  const e2e = read('tests/e2e/routes.mjs')
  for (const required of [
    'unauthenticated settings read failed',
    'unauthenticated malformed write did not reach domain validation',
    '/auth/session',
    'www-authenticate',
    'set-cookie',
  ]) assert.ok(e2e.includes(required), `missing public-boundary assertion: ${required}`)
  assert.doesNotMatch(e2e, /TASTE_MAP_API_TOKEN/)
})
