import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

import { REQUIRED_READ_HEADROOM, REQUIRED_WRITE_HEADROOM } from '../src/services/free-tier-budget.ts'
import { REQUIRED_RELEASE_SCHEMA } from '../src/services/release-readiness.ts'
import { buildReleaseSnapshot } from './release-status-lib.mjs'

const args = process.argv.slice(2)
const value = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : fallback
}
const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const origin = value('--origin', 'https://recommendations-worker.mhmudnasr30.workers.dev')
const database = value('--database', 'recommendations-db')
const config = value('--config', 'wrangler.toml')
const output = value('--output', null)
const execFileAsync = promisify(execFile)

const capture = async (command, commandArgs) => {
  const result = await execFileAsync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  return result.stdout.trim()
}

const getJson = async (path) => {
  const response = await fetch(`${origin}${path}`, {
    headers: { 'user-agent': 'LearningCompassReleaseStatus/1.0' },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(`Release-status read failed for ${path}: HTTP ${response.status}`)
  return body
}

const quotedSchema = REQUIRED_RELEASE_SCHEMA.map((name) => `'${name.replaceAll("'", "''")}'`).join(',')
const releaseSql = [
  'SELECT name,applied_at FROM d1_migrations ORDER BY applied_at,name',
  `SELECT name,type FROM sqlite_schema WHERE name IN (${quotedSchema}) ORDER BY name`,
  "SELECT id,status,storage_target,d1_sha256,d1_bytes,artifact_count,artifact_bytes,created_at,restore_rehearsed_at FROM recovery_backups WHERE status='verified' ORDER BY created_at DESC LIMIT 1",
  'SELECT (SELECT COUNT(*) FROM lite_visual_corpora) corpora,(SELECT COUNT(*) FROM lite_visual_corpus_targets) targets,(SELECT COUNT(*) FROM lite_visual_active_corpora) active_corpora,(SELECT COUNT(*) FROM lite_visual_pairs) pairs',
].join('; ')

const [live, readiness, budget, deploymentsText, d1Text, commitSha, branch, status] = await Promise.all([
  getJson('/health/live'),
  getJson('/health/ready'),
  getJson('/health/free-tier-budget'),
  capture('npx', ['wrangler', 'deployments', 'list', '--config', config, '--json']),
  capture('npx', [
    'wrangler',
    'd1',
    'execute',
    database,
    '--remote',
    '--config',
    config,
    '--json',
    '--command',
    releaseSql,
  ]),
  capture('git', ['rev-parse', 'HEAD']),
  capture('git', ['branch', '--show-current']),
  capture('git', ['status', '--porcelain']),
])

const snapshot = buildReleaseSnapshot({
  observedAt: new Date().toISOString(),
  origin,
  source: { commit_sha: commitSha, branch, dirty: Boolean(status) },
  deployments: JSON.parse(deploymentsText),
  d1Results: JSON.parse(d1Text),
  live,
  readiness,
  budget,
  localMigrations: readdirSync(resolve(repoRoot, 'migrations'))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort(),
  requiredSchema: [...REQUIRED_RELEASE_SCHEMA],
  requiredReadHeadroom: REQUIRED_READ_HEADROOM,
  requiredWriteHeadroom: REQUIRED_WRITE_HEADROOM,
})

const serialized = `${JSON.stringify(snapshot, null, 2)}\n`
if (output) {
  const outputPath = resolve(repoRoot, output)
  const temporaryPath = `${outputPath}.tmp-${process.pid}`
  mkdirSync(dirname(outputPath), { recursive: true })
  rmSync(temporaryPath, { force: true })
  writeFileSync(temporaryPath, serialized)
  renameSync(temporaryPath, outputPath)
}
process.stdout.write(serialized)
