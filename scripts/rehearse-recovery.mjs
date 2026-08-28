import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined }
const manifestPath = resolve(value('--manifest') || args.find((item) => !item.startsWith('--')) || '')
const record = !args.includes('--no-record')
if (!manifestPath) throw new Error('Usage: node scripts/rehearse-recovery.mjs --manifest /path/to/snapshot.json [--no-record]')

const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const manifestBytes = readFileSync(manifestPath)
const manifest = JSON.parse(manifestBytes.toString('utf8'))
if (manifest.format !== 'learning-compass-full-recovery-v2') throw new Error(`Unsupported recovery format: ${manifest.format || 'missing'}`)
const expectedManifestHash = readFileSync(`${manifestPath}.sha256`, 'utf8').trim().split(/\s+/)[0]
const manifestHash = hash(manifestBytes)
if (manifestHash !== expectedManifestHash) throw new Error('Snapshot manifest checksum mismatch')

const snapshotDir = dirname(manifestPath)
const d1ManifestPath = resolve(snapshotDir, manifest.d1.manifest)
execFileSync('/usr/bin/node', ['scripts/verify-recovery.mjs', d1ManifestPath], { cwd: process.cwd(), stdio: 'inherit' })
const d1Manifest = JSON.parse(readFileSync(d1ManifestPath, 'utf8'))
const sqlPath = resolve(dirname(d1ManifestPath), d1Manifest.sql_file)

const temporary = mkdtempSync(join(tmpdir(), 'learning-compass-restore-'))
const databasePath = join(temporary, 'restored.sqlite')
try {
  execFileSync('sqlite3', [databasePath, `.read ${JSON.stringify(sqlPath)}`], { stdio: 'pipe', maxBuffer: 100 * 1024 * 1024 })
  const integrity = execFileSync('sqlite3', [databasePath, 'PRAGMA integrity_check;'], { encoding: 'utf8' }).trim()
  if (integrity !== 'ok') throw new Error(`Restored SQLite integrity failed: ${integrity}`)
  const foreignKeyRows = JSON.parse(execFileSync('sqlite3', ['-json', databasePath, 'PRAGMA foreign_key_check;'], { encoding: 'utf8' }) || '[]')
  if (foreignKeyRows.length) throw new Error(`Restored SQLite foreign-key check failed: ${JSON.stringify(foreignKeyRows.slice(0, 10))}`)
  const counts = JSON.parse(execFileSync('sqlite3', ['-json', databasePath, `SELECT
    (SELECT COUNT(*) FROM recommendations) recommendations,
    (SELECT COUNT(*) FROM notes) notes,
    (SELECT COUNT(*) FROM artifacts) artifacts,
    (SELECT COUNT(*) FROM learning_threads) threads,
    (SELECT COUNT(*) FROM srs_cards) recall_cards;`], { encoding: 'utf8' }) || '[]')[0] || {}
  if (Number(counts.artifacts || 0) !== Number(manifest.artifacts.count || 0)) throw new Error(`Restored artifact count ${counts.artifacts || 0} does not match snapshot ${manifest.artifacts.count || 0}`)

  let artifactBytes = 0
  for (const object of manifest.artifacts.objects || []) {
    const objectPath = resolve(snapshotDir, object.file)
    const info = statSync(objectPath)
    if (info.size !== Number(object.size_bytes)) throw new Error(`R2 backup size mismatch: ${object.r2_key}`)
    const actual = hash(readFileSync(objectPath))
    if (actual !== object.sha256) throw new Error(`R2 backup checksum mismatch: ${object.r2_key}`)
    artifactBytes += info.size
  }
  if (artifactBytes !== Number(manifest.artifacts.bytes || 0)) throw new Error('R2 backup byte total does not match the snapshot manifest')

  const rehearsedAt = new Date().toISOString()
  const receipt = {
    format: 'learning-compass-restore-rehearsal-v1',
    snapshot_id: manifest.id,
    manifest_sha256: manifestHash,
    d1_sha256: d1Manifest.sql_sha256,
    d1_bytes: d1Manifest.sql_bytes,
    artifacts: { count: manifest.artifacts.count, bytes: artifactBytes },
    restored_counts: counts,
    sqlite_integrity: integrity,
    foreign_key_violations: foreignKeyRows.length,
    rehearsed_at: rehearsedAt,
    status: 'verified',
  }
  const receiptPath = join(snapshotDir, 'restore-rehearsal.json')
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)

  if (record) {
    const safe = (input) => String(input).replaceAll("'", "''")
    const command = `INSERT OR REPLACE INTO recovery_backups(id,status,storage_target,d1_sha256,d1_bytes,artifact_count,artifact_bytes,manifest_sha256,created_at,restore_rehearsed_at) VALUES ('${safe(manifest.id)}','verified','local-systemd','${safe(d1Manifest.sql_sha256)}',${Number(d1Manifest.sql_bytes)},${Number(manifest.artifacts.count)},${artifactBytes},'${manifestHash}',datetime('now'),datetime('now'));`
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'recommendations-db', '--remote', '--config', 'wrangler.toml', '--command', command], { stdio: 'inherit' })
  }
  console.log(JSON.stringify({ ok: true, manifest: manifestPath, receipt: receiptPath, ...receipt }, null, 2))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
