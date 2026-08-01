import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const persist = mkdtempSync(join(tmpdir(), 'learning-compass-migrations-'))
const wrangler = './node_modules/.bin/wrangler'
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(output)))
})

try {
  await run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persist, '--file', 'schema.sql'])
  await run(['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persist])
  await run(['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persist])
  console.log('Migration rehearsal passed: clean apply and idempotent re-apply.')
} finally {
  rmSync(persist, { recursive: true, force: true })
}
