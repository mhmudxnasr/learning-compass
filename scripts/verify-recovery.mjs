import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const input = process.argv[2]
if (!input || input === '--help' || input === '-h') {
  console.log('Usage: node scripts/verify-recovery.mjs path/to/export.sql.manifest.json')
  process.exit(input ? 0 : 1)
}

const manifestPath = resolve(input)
if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.format !== 'learning-compass-recovery-v1') throw new Error('Unsupported recovery manifest format.')
const sqlPath = resolve(manifest.sql_file)
if (!existsSync(sqlPath)) throw new Error(`SQL export not found: ${sqlPath}`)
const sql = readFileSync(sqlPath)
const hash = createHash('sha256').update(sql).digest('hex')
if (hash !== manifest.sql_sha256) throw new Error(`SQL checksum mismatch: expected ${manifest.sql_sha256}, got ${hash}`)
if (!sql.length) throw new Error('SQL export is empty.')
if (!/CREATE TABLE|INSERT INTO|BEGIN TRANSACTION/i.test(sql.toString('utf8'))) throw new Error('SQL export does not contain a recognizable D1 payload.')
console.log(JSON.stringify({ ok: true, format: manifest.format, source: manifest.source, sql_bytes: sql.byteLength, sql_sha256: hash, r2_included: Boolean(manifest.r2?.included) }, null, 2))
