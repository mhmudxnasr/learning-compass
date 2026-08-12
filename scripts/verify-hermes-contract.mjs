import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (file) => readFileSync(join(root, file), 'utf8')
const required = [
  ['migrations/0006_hermes_upgrade.sql', 'Hermes upgrade migration'],
  ['migrations/0023_intelligence_v2.sql', 'recommendation intelligence v2 migration'],
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
const expectedMigrations = ['0000_brain.sql', '0001_production_rebuild.sql', '0002_rss_feeds.sql', '0003_feedback_review.sql', '0004_discovery_engine.sql', '0005_recommendation_notebook_url.sql', '0006_hermes_upgrade.sql', '0007_sync_notifications.sql', '0008_compass_cascade.sql', '0009_proposal_dedup.sql', '0010_compass_queue_fill.sql', '0011_compass_adaptive_learning.sql', '0012_context_brief.sql', '0013_book_visual_chapters.sql', '0014_canonical_activity_ledger.sql', '0015_outcome_learning_integrity.sql', '0016_learning_integrity.sql', '0017_consolidation_workflows.sql', '0018_learning_threads.sql', '0019_learning_units.sql', '0020_mastery_evidence.sql', '0021_learning_outcomes_v2.sql', '0022_fsrs_and_thread_backfill.sql', '0023_intelligence_v2.sql', '0024_memory_context.sql', '0025_compass_contextual_reranking.sql', '0026_semantic_retrieval.sql']
if (migrationNames.length !== expectedMigrations.length || expectedMigrations.some((name, index) => migrationNames[index] !== name)) throw new Error(`Migration order drift: expected ${expectedMigrations.join(', ')}, found ${migrationNames.join(', ')}`)

const checks = [
  ['src/api/intelligence.ts', "app.get('/analytics/hermes'", 'Hermes analytics endpoint'],
  ['src/api/intelligence.ts', "app.post('/analytics/hermes/recalibrate'", 'bounded quality recalibration'],
  ['src/api/intelligence.ts', "app.post('/analytics/hermes/repair'", 'snapshot-guarded history repair'],
  ['src/api/intelligence.ts', "app.get('/analytics/hermes/engine'", 'v2 shadow rollout gate'],
  ['src/api/intelligence.ts', "requestedStatus === 'no_change'", 'evidence-backed no-change improvement closure'],
  ['src/api/intelligence.ts', "requestedStatus === 'failed'", 'failed resumable improvement closure'],
  ['src/api/brain.ts', "app.put('/profile/assertions/:key'", 'editable typed profile assertions'],
  ['src/api/product.ts', "app.post('/feedback/proposals/:id/revert'", 'reversible automatic profile changes'],
  ['src/api/intelligence.ts', "app.get('/analytics/hermes/weekly'", 'weekly evaluator report'],
  ['src/api/notebooklm.ts', "app.get('/health'", 'NotebookLM broker health'],
  ['src/api/agent.ts', "['POST', '/agent/memory/:id/approve'", 'memory approval capability'],
  ['src/api/agent.ts', "['POST', '/agent/jobs/:id/replay'", 'job replay capability'],
  ['src/api/agent.ts', "['POST', '/agent/memory'", 'guarded memory capability'],
  ['src/api/agent.ts', "app.get('/memory/context'", 'bounded memory context compiler'],
  ['client/src/destinations.ts', "['hermes', 'Hermes'", 'Hermes destination registration'],
  ['docs/API.md', '/analytics/hermes', 'Hermes API documentation'],
  ['PROJECT_CONTEXT.md', '0006_hermes_upgrade.sql', 'migration contract synchronization'],
  ['.hermes.md', 'learning-compass-operating-system', 'procedural Hermes router contract'],
  ['src/api/agent.ts', "['POST', '/learning/core/threads'", 'Learning Thread agent capability'],
  ['.hermes.md', 'output_contract=learning_units_v1', 'anchored Learning Unit output contract'],
]
const failed = checks.filter(([file, needle]) => !read(file).includes(needle)).map(([, , label]) => label)
if (failed.length) throw new Error(`Hermes contract drift: ${failed.join(', ')}`)
if (read('src/index.ts').includes('createHermesEvaluatorProposals')) throw new Error('Scheduled self-improvement remains enabled')

const contract = JSON.parse(read('docs/hermes-contract.json'))
if (contract.version !== 3) throw new Error('Canonical Hermes contract version drift')
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
if (evolution?.enabled !== true || evolution.scope !== 'verified_system_improvement' || evolution.persist_to !== 'canonical source plus D1 self_improvement_runs receipt; hermes_memory only for durable profile or skill_procedure evidence' || evolution.skill_source_edits !== 'automatic_after_replay_or_test_gate_in_active_conversation' || evolution.deployment !== 'automatic_after_release_verification_with_observed_live_smoke') {
  throw new Error('Canonical Hermes self-evolution policy drift')
}
for (const trigger of ['specialist evolution handoff', 'observed skill failure', 'validated better path', 'explicit audit']) {
  if (!evolution.trigger?.includes(trigger)) throw new Error(`Self-evolution trigger missing: ${trigger}`)
}
if (contract.self_evolution_owner !== 'learning-compass-self-evolution') throw new Error('Canonical self-evolution owner drift')
const activeSkills = contract.skill_graph?.active || []
const retiredSkills = contract.skill_graph?.retired || []
if (activeSkills.length !== 13 || new Set(activeSkills.map((skill) => skill.name)).size !== activeSkills.length) {
  throw new Error('Canonical Hermes active skill graph is incomplete or duplicated')
}
for (const name of ['learning-compass-operating-system', 'learning-compass-self-evolution', 'learning-compass-site-operator', 'recommendations-worker-ops', 'taste-mapper', 'taste-rec', 'learning-notes-extractor', 'lite-visual', 'visual-mind', 'notebooklm', 'rss-feed', 'agent-cli-delegation', 'youtube-playlist-verification']) {
  if (!activeSkills.some((skill) => skill.name === name && skill.path && skill.role)) throw new Error(`Canonical active skill missing: ${name}`)
}
for (const name of ['taste-enhancer', 'compass-queue-fill', 'learning-compass-curator-policy', 'master-editorial-synthesis']) {
  if (!retiredSkills.includes(name)) throw new Error(`Canonical retired skill missing: ${name}`)
}
const localSkillsRoot = join(homedir(), '.hermes', 'skills')
if (existsSync(localSkillsRoot)) {
  for (const skill of activeSkills) {
    const file = join(localSkillsRoot, skill.path, 'SKILL.md')
    if (!existsSync(file)) throw new Error(`Active Hermes skill is not installed: ${skill.name}`)
    const body = readFileSync(file, 'utf8')
    if (!body.includes(`name: ${skill.name}`)) throw new Error(`Hermes skill name/path drift: ${skill.name}`)
    if (!body.includes('## Evolution handoff')) throw new Error(`Hermes skill lacks evolution handoff: ${skill.name}`)
  }
  for (const name of retiredSkills) {
    const stillActive = activeSkills.some((skill) => skill.name === name)
      || readdirSync(localSkillsRoot, { withFileTypes: true }).some((entry) => entry.isDirectory() && entry.name === name)
      || existsSync(join(localSkillsRoot, 'workflow', name, 'SKILL.md'))
      || existsSync(join(localSkillsRoot, 'personal', name, 'SKILL.md'))
      || existsSync(join(localSkillsRoot, 'productivity', name, 'SKILL.md'))
    if (stillActive) throw new Error(`Retired Hermes skill remains active: ${name}`)
  }
  const configPath = join(homedir(), '.hermes', 'config.yaml')
  const configText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  const disabledBlock = configText.match(/^skills:\n((?:[ \t]+.*\n?)*)/m)?.[1] || ''
  const disabledSkills = new Set([...disabledBlock.matchAll(/^\s+-\s+([^#\s]+)\s*$/gm)].map((match) => match[1]))
  const walkSkillFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name)
    return entry.isDirectory() ? walkSkillFiles(file) : [file]
  })
  const installedSkillNames = walkSkillFiles(localSkillsRoot)
    .filter((file) => file.endsWith('SKILL.md'))
    .map((file) => readFileSync(file, 'utf8').match(/^name:\s*([^\s]+)\s*$/m)?.[1])
    .filter(Boolean)
  const activeNames = new Set(activeSkills.map((skill) => skill.name))
  const unownedEnabled = installedSkillNames.filter((name) => !activeNames.has(name) && !disabledSkills.has(name))
  if (unownedEnabled.length) throw new Error(`Unowned Hermes skills remain enabled: ${unownedEnabled.join(', ')}`)
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
