import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (file) => readFileSync(join(root, file), 'utf8')
const required = [
  ['migrations/0006_hermes_upgrade.sql', 'Hermes upgrade migration'],
  ['src/api/intelligence.ts', '/analytics/hermes read model'],
  ['src/api/agent.ts', '/agent/memory and replay routes'],
  ['client/src/destinations.ts', 'Hermes destination'],
  ['client/src/app.tsx', 'Hermes control panel view'],
  ['docs/API.md', 'Hermes API contract'],
  ['.hermes.md', 'repository Hermes contract'],
]
const missing = required.filter(([file]) => !existsSync(join(root, file))).map(([, label]) => label)
if (missing.length) throw new Error(`Missing Hermes contract files: ${missing.join(', ')}`)

const migrationNames = readdirSync(join(root, 'migrations')).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()
const expectedMigrations = ['0000_brain.sql', '0001_production_rebuild.sql', '0002_rss_feeds.sql', '0003_feedback_review.sql', '0004_discovery_engine.sql', '0005_recommendation_notebook_url.sql', '0006_hermes_upgrade.sql', '0007_sync_notifications.sql', '0008_compass_cascade.sql', '0009_proposal_dedup.sql', '0010_compass_queue_fill.sql', '0011_compass_adaptive_learning.sql']
if (migrationNames.length !== expectedMigrations.length || expectedMigrations.some((name, index) => migrationNames[index] !== name)) throw new Error(`Migration order drift: expected ${expectedMigrations.join(', ')}, found ${migrationNames.join(', ')}`)

const checks = [
  ['src/api/intelligence.ts', "app.get('/analytics/hermes'", 'Hermes analytics endpoint'],
  ['src/api/intelligence.ts', "app.post('/analytics/hermes/recalibrate'", 'bounded quality recalibration'],
  ['src/api/intelligence.ts', "app.get('/analytics/hermes/weekly'", 'weekly evaluator report'],
  ['src/api/notebooklm.ts', "app.get('/health'", 'NotebookLM broker health'],
  ['src/api/agent.ts', "['POST', '/agent/memory/:id/approve'", 'memory approval capability'],
  ['src/api/agent.ts', "['POST', '/agent/jobs/:id/replay'", 'job replay capability'],
  ['src/api/agent.ts', "['POST', '/agent/memory'", 'guarded memory capability'],
  ['client/src/destinations.ts', "['hermes', 'Hermes'", 'Hermes destination registration'],
  ['docs/API.md', '/analytics/hermes', 'Hermes API documentation'],
  ['.hermes.md', '0006_hermes_upgrade.sql', 'migration contract synchronization'],
  ['.hermes.md', 'learning-compass-operating-system', 'procedural Hermes router contract'],
]
const failed = checks.filter(([file, needle]) => !read(file).includes(needle)).map(([, , label]) => label)
if (failed.length) throw new Error(`Hermes contract drift: ${failed.join(', ')}`)

console.log(`Hermes contract verified: ${expectedMigrations.length} migrations, ${checks.length} synchronized checks.`)
