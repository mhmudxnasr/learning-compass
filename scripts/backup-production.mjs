import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const args = process.argv.slice(2)
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined }
const outputRoot = resolve(value('--output-dir') || process.env.LEARNING_COMPASS_BACKUP_DIR || '/home/mahmud/backups/learning-compass')
const retain = Math.max(2, Math.min(60, Number(value('--retain') || 14)))
const record = !args.includes('--no-record')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const snapshotId = `backup_${stamp}`
const snapshotDir = join(outputRoot, 'snapshots', snapshotId)
const objectDir = join(outputRoot, 'objects')
const execFileAsync = promisify(execFile)
mkdirSync(snapshotDir, { recursive: true })
mkdirSync(objectDir, { recursive: true })

const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const sqlPath = join(snapshotDir, 'database.sql')
execFileSync('/usr/bin/node', ['scripts/export-recovery.mjs', '--remote', '--output', sqlPath], { cwd: process.cwd(), stdio: 'inherit' })
const d1ManifestPath = `${sqlPath}.manifest.json`
const d1Manifest = JSON.parse(readFileSync(d1ManifestPath, 'utf8'))
d1Manifest.sql_file = basename(sqlPath)
writeFileSync(d1ManifestPath, `${JSON.stringify(d1Manifest, null, 2)}\n`)

const inventoryOutput = execFileSync('npx', ['wrangler', 'd1', 'execute', 'recommendations-db', '--remote', '--config', 'wrangler.toml', '--json', '--command', 'SELECT id,filename,r2_key,size_bytes FROM artifacts ORDER BY id;'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
const inventoryResult = JSON.parse(inventoryOutput)
const inventory = inventoryResult?.[0]?.results || []
if (inventory.some((item) => !item.r2_key)) throw new Error('Every canonical artifact must have an R2 key before a full backup can pass')

const objects = new Array(inventory.length)
let cursor = 0
let completed = 0
const downloadArtifact = async (artifact, index) => {
  const key = String(artifact.r2_key)
  const objectName = createHash('sha256').update(key).digest('hex')
  const objectPath = join(objectDir, objectName)
  const expectedSize = Number(artifact.size_bytes || 0)
  // Always acquire the remote bytes. A same-key, same-size local cache entry is
  // not checksum evidence and could otherwise preserve a stale overwritten object.
  const temporary = `${objectPath}.partial-${process.pid}-${index}`
  rmSync(temporary, { force: true })
  try {
    await execFileAsync('npx', ['wrangler', 'r2', 'object', 'get', `taste-map-artifacts/${key}`, '--remote', '--config', 'wrangler.toml', '--file', temporary], { maxBuffer: 2 * 1024 * 1024 })
    if (expectedSize > 0 && statSync(temporary).size !== expectedSize) {
      throw new Error(`Downloaded R2 object size does not match D1: ${key}`)
    }
    renameSync(temporary, objectPath)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
  const bytes = readFileSync(objectPath)
  const size = bytes.byteLength
  const sha256 = hash(bytes)
  objects[index] = { id: artifact.id, filename: artifact.filename, r2_key: key, size_bytes: size, sha256, file: relative(snapshotDir, objectPath) }
  completed += 1
  if (completed % 25 === 0 || completed === inventory.length) console.log(`Verified ${completed}/${inventory.length} remote R2 objects`)
}
const configuredConcurrency = Number(process.env.LEARNING_COMPASS_BACKUP_CONCURRENCY || 18)
const workerCount = Math.min(Math.max(1, Number.isFinite(configuredConcurrency) ? Math.floor(configuredConcurrency) : 18), 24, inventory.length)
await Promise.all(Array.from({ length: workerCount }, async () => {
  while (cursor < inventory.length) {
    const index = cursor++
    await downloadArtifact(inventory[index], index)
  }
}))
const artifactBytes = objects.reduce((sum, object) => sum + object.size_bytes, 0)

const manifest = {
  format: 'learning-compass-full-recovery-v2',
  id: snapshotId,
  created_at: new Date().toISOString(),
  storage_target: 'local-systemd',
  d1: { sql: basename(sqlPath), manifest: basename(d1ManifestPath), sha256: d1Manifest.sql_sha256, bytes: d1Manifest.sql_bytes },
  artifacts: { bucket: 'taste-map-artifacts', count: objects.length, bytes: artifactBytes, objects },
}
const manifestPath = join(snapshotDir, 'snapshot.json')
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(manifestPath, manifestBytes)
writeFileSync(`${manifestPath}.sha256`, `${hash(manifestBytes)}  ${basename(manifestPath)}\n`)

execFileSync('/usr/bin/node', ['scripts/rehearse-recovery.mjs', '--manifest', manifestPath, ...(record ? [] : ['--no-record'])], { cwd: process.cwd(), stdio: 'inherit' })

const snapshotsRoot = join(outputRoot, 'snapshots')
const snapshots = readdirSync(snapshotsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse()
for (const expired of snapshots.slice(retain)) rmSync(join(snapshotsRoot, expired), { recursive: true, force: true })

console.log(JSON.stringify({ ok: true, snapshot_id: snapshotId, manifest: manifestPath, d1_bytes: d1Manifest.sql_bytes, artifact_count: objects.length, artifact_bytes: artifactBytes, retained_snapshots: Math.min(snapshots.length, retain) }, null, 2))
