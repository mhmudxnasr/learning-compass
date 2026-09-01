import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const value = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (has('--help') || has('-h')) {
  console.log('Usage: node scripts/export-recovery.mjs [--local|--remote] [--output path]')
  console.log('Remote export is opt-in. The export contains D1 state; R2 binaries need a separate object copy.')
  process.exit(0)
}

const remote = has('--remote')
const local = has('--local') || !remote
if (remote && local && has('--local')) throw new Error('Choose either --local or --remote, not both.')

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z')
const output = resolve(
  value('--output') || join('backups', `learning-compass-${remote ? 'remote' : 'local'}-${stamp}.sql`),
)
mkdirSync(dirname(output), { recursive: true })

let exportMethod = 'wrangler-d1-export'
try {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'export',
      'recommendations-db',
      remote ? '--remote' : '--local',
      '--config',
      'wrangler.toml',
      '--output',
      output,
    ],
    { stdio: 'inherit' },
  )
} catch (error) {
  if (!local) throw error
  // Miniflare's D1 exporter currently rejects any database containing FTS5
  // virtual tables. The exact local D1 file is still a SQLite database, so use
  // SQLite's native dump only for local recovery and record that method.
  const d1Dir = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  const databasePath = readdirSync(d1Dir)
    .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => join(d1Dir, name))
    .sort((left, right) => statSync(right).size - statSync(left).size)[0]
  if (!databasePath)
    throw new Error('Local D1 export failed and no Wrangler SQLite database was found.', { cause: error })
  console.warn(`Wrangler local export cannot dump FTS5; using SQLite fallback for ${databasePath}`)
  const dump = execFileSync('sqlite3', [databasePath, '.dump'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  writeFileSync(output, dump)
  exportMethod = 'sqlite3-local-fallback'
}

const sql = readFileSync(output)
const sha256 = createHash('sha256').update(sql).digest('hex')
const migrations = readdirSync('migrations')
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
  .map((name) => {
    const path = join('migrations', name)
    return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }
  })
const manifest = {
  format: 'learning-compass-recovery-v1',
  created_at: new Date().toISOString(),
  database: 'recommendations-db',
  source: remote ? 'remote' : 'local',
  export_method: exportMethod,
  sql_file: output,
  sql_bytes: sql.byteLength,
  sql_sha256: sha256,
  migrations,
  r2: {
    included: false,
    note: 'D1 metadata includes artifact keys. Copy R2 objects separately and verify each key against the artifact metadata before restore.',
  },
}
const manifestPath = `${output}.manifest.json`
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Recovery export written: ${output}`)
console.log(`Manifest written: ${manifestPath}`)
