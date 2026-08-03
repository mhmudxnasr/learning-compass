import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
  ['docs/hermes-contract.json', 'canonical machine-readable Hermes contract'],
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

const contract = JSON.parse(read('docs/hermes-contract.json'))
const requiredPolicy = [
  ['workflow', 'conversation-driven'],
  ['background_self_improvement', false],
  ['notebooklm', 'explicit feedback grounding or explicit Studio request only'],
  ['recommendations', 'explicit request only; feedback never creates a recommendation'],
]
for (const [key, expected] of requiredPolicy) {
  if (contract.policies?.[key] !== expected) throw new Error(`Canonical Hermes policy drift: ${key}`)
}
if (contract.network?.private_urls !== 'deny_by_default' || contract.network?.local_services !== 'require_explicit_operator_override') {
  throw new Error('Canonical Hermes network policy drift')
}
const evolution = contract.policies?.self_evolution
if (evolution?.enabled !== true || evolution.scope !== 'verified_skill_procedure_memory' || evolution.persist_to !== 'D1 hermes_memory with evidence, validation, scope, and supersession' || evolution.skill_source_edits !== 'proposal_only') {
  throw new Error('Canonical Hermes self-evolution policy drift')
}
for (const trigger of ['observed skill failure', 'validated better path']) {
  if (!evolution.trigger?.includes(trigger)) throw new Error(`Self-evolution trigger missing: ${trigger}`)
}
for (const tier of ['automatic', 'proposal_only', 'explicit_only']) {
  if (!contract.side_effect_tiers?.[tier]?.requires || !Array.isArray(contract.side_effect_tiers[tier].allows)) {
    throw new Error(`Canonical Hermes side-effect tier is incomplete: ${tier}`)
  }
}
const receipt = ['intent', 'target', 'before', 'mutation_or_job', 'after', 'evidence', 'blocker']
if (JSON.stringify(contract.specialist_receipt) !== JSON.stringify(receipt)) throw new Error('Specialist receipt contract drift')

const routeEntries = Object.entries(contract.route_ownership || {})
if (!routeEntries.length || routeEntries.some(([route, rule]) => !route.includes(' ') || !rule?.owner || !rule?.permission)) {
  throw new Error('Route ownership/permission contract is incomplete')
}
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = join(dir, entry.name)
  if (entry.isDirectory()) return walk(file)
  return /\.(ts|tsx|md|json)$/.test(entry.name) ? [file] : []
})
const searchable = [join(root, 'src'), join(root, 'client'), join(root, 'docs/API.md'), join(root, '.hermes.md')]
  .flatMap((path) => path.endsWith('.md') ? [path] : walk(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
for (const [route] of routeEntries) {
  if (route.startsWith('npx ')) continue
  const path = route.replace(/^[A-Z]+\s+/, '')
  if (!searchable.includes(path) && !searchable.includes(path.replace(/:id/g, ':id'))) {
    throw new Error(`Route missing from repository contract surface: ${route}`)
  }
}

const policySurfaces = [read('docs/architecture.md'), read('.hermes.md'), read('PROJECT_CONTEXT.md'), read('CURRENT_STATE.md')].join('\n')
for (const phrase of ['conversation-driven', 'proposal-only', 'explicit-only', 'specialist receipt', 'basic intro', 'practical applied tool', 'skill-procedure memory']) {
  if (!policySurfaces.toLowerCase().includes(phrase.toLowerCase())) throw new Error(`Policy phrase missing from synchronized docs: ${phrase}`)
}
const stale = [
  ['docs/architecture.md', 'Hermes polls D1 jobs every two minutes'],
  ['docs/architecture.md', 'Only user approval queues the exact application job'],
  ['/home/mahmud/.hermes/skills/personal/taste-rec/SKILL.md', 'AI/LLM tools content** must ONLY appear in the RSS feed'],
]
for (const [file, phrase] of stale) {
  if (file.startsWith('/') && !existsSync(file)) continue
  const text = file.startsWith('/') ? readFileSync(file, 'utf8') : read(file)
  if (text.includes(phrase)) throw new Error(`Stale Hermes policy remains in ${file}: ${phrase}`)
}

console.log(`Hermes contract verified: ${expectedMigrations.length} migrations, ${checks.length} synchronized checks, ${routeEntries.length} owned routes.`)
