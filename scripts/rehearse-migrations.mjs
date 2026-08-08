import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const persist = mkdtempSync(join(tmpdir(), 'learning-compass-migrations-'))
const preContextBriefSchema = join(persist, 'schema-before-context-brief.sql')
const wrangler = './node_modules/.bin/wrangler'
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(output)))
})

try {
  writeFileSync(preContextBriefSchema, readFileSync('schema.sql', 'utf8').replace('  context_brief TEXT,\n', ''))
  await run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persist, '--file', preContextBriefSchema])
  await run(['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persist])
  await run(['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persist])
  console.log('Migration rehearsal passed: clean apply and idempotent re-apply.')
} finally {
  rmSync(persist, { recursive: true, force: true })
}
