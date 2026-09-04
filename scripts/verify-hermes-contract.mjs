import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { auditInstructions, instructionDocuments, formatInstructionIssues } from './hermes-instruction-audit.mjs'

const root = new URL('..', import.meta.url).pathname
const read = (file) => readFileSync(join(root, file), 'utf8')
const normalizeDurableEntry = (entry) =>
  entry
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/\s+/gu, ' ')
    .replace(/[.!?؟،؛:…]+$/gu, '')
    .trim()
const durableEntryTokens = (entry) =>
  new Set(normalizeDurableEntry(entry).match(/[\p{L}\p{N}]+(?:[+#/]+[\p{L}\p{N}]*)*/gu) || [])
const durableEntryRelation = (left, right) => {
  const normalizedLeft = normalizeDurableEntry(left)
  const normalizedRight = normalizeDurableEntry(right)
  if (normalizedLeft === normalizedRight) return 'normalized duplicate'

  const shorterChars = Math.min(Array.from(normalizedLeft).length, Array.from(normalizedRight).length)
  if (shorterChars >= 32 && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))) {
    return 'containment supersession'
  }

  const leftTokens = durableEntryTokens(left)
  const rightTokens = durableEntryTokens(right)
  const smallerTokenCount = Math.min(leftTokens.size, rightTokens.size)
  if (smallerTokenCount < 8) return null
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  if (intersection >= 7 && union && intersection / union >= 0.82) return 'high-overlap supersession'
  return null
}
const required = [
  ['migrations/0006_hermes_upgrade.sql', 'Hermes upgrade migration'],
  ['migrations/0023_intelligence_v2.sql', 'recommendation intelligence v2 migration'],
  ['src/api/intelligence.ts', '/analytics/hermes read model'],
  ['src/api/agent.ts', '/agent/memory and replay routes'],
  ['client/src/app/router.ts', 'five-root frontend route registry'],
  ['client/src/workspaces/SettingsWorkspace.tsx', 'Hermes control panel view'],
  ['docs/API.md', 'Hermes API contract'],
  ['docs/hermes-contract.json', 'canonical machine-readable Hermes contract'],
  ['docs/hermes-prompt-budget.json', 'default Telegram prompt budget'],
  ['docs/hermes-production.md', 'Hermes production runbook'],
  ['.hermes.md', 'repository Hermes contract'],
]
const missing = required.filter(([file]) => !existsSync(join(root, file))).map(([, label]) => label)
if (missing.length) throw new Error(`Missing Hermes contract files: ${missing.join(', ')}`)

const migrationNames = readdirSync(join(root, 'migrations'))
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()
const expectedMigrations = [
  '0000_brain.sql',
  '0001_production_rebuild.sql',
  '0002_rss_feeds.sql',
  '0003_feedback_review.sql',
  '0004_discovery_engine.sql',
  '0005_recommendation_notebook_url.sql',
  '0006_hermes_upgrade.sql',
  '0007_sync_notifications.sql',
  '0008_compass_cascade.sql',
  '0009_proposal_dedup.sql',
  '0010_compass_queue_fill.sql',
  '0011_compass_adaptive_learning.sql',
  '0012_context_brief.sql',
  '0013_book_visual_chapters.sql',
  '0014_canonical_activity_ledger.sql',
  '0015_outcome_learning_integrity.sql',
  '0016_learning_integrity.sql',
  '0017_consolidation_workflows.sql',
  '0018_learning_threads.sql',
  '0019_learning_units.sql',
  '0020_mastery_evidence.sql',
  '0021_learning_outcomes_v2.sql',
  '0022_fsrs_and_thread_backfill.sql',
  '0023_intelligence_v2.sql',
  '0024_memory_context.sql',
  '0025_compass_contextual_reranking.sql',
  '0026_semantic_retrieval.sql',
  '0027_feedback_observability.sql',
  '0027_recommendation_quality_enhancements.sql',
  '0028_compass_thompson_pessimistic_prior.sql',
  '0029_learning_hub.sql',
  '0030_hub_notes_files.sql',
  '0031_thread_courses.sql',
  '0032_lesson_sources.sql',
  '0033_lesson_orientation.sql',
  '0034_srs_lineage_and_tags.sql',
  '0035_recommendation_branch_and_round.sql',
  '0036_profile_automation_manual.sql',
  '0037_atomic_mutation_reservations.sql',
  '0038_hermes_brief_annotations_receipts.sql',
  '0039_telegram_webhook_dedup.sql',
  '0040_learning_thread_progression.sql',
  '0041_level_recall_scope.sql',
  '0042_hardcover_reading_journal.sql',
  '0043_remove_thread_evidence.sql',
  '0044_lesson_learning_scope.sql',
]
expectedMigrations.splice(
  expectedMigrations.indexOf('0044_lesson_learning_scope.sql'),
  1,
  '0044_drop_learning_evidence.sql',
  '0045_lesson_learning_scope.sql',
)
expectedMigrations.push('0046_canon_atlas.sql')
expectedMigrations.push('0047_personal_branch_map.sql')
expectedMigrations.push('0048_remove_inbox_concept.sql')
expectedMigrations.push('0049_source_notes_recall_quality.sql')
expectedMigrations.push('0050_structured_compass_feedback.sql')
expectedMigrations.push('0051_remove_synthetic_book_chapters.sql')
expectedMigrations.push('0052_pin_primary_book.sql')
expectedMigrations.push('0053_retire_synthetic_rounds.sql')
expectedMigrations.push('0054_production_operations.sql')
expectedMigrations.push('0055_d1_performance_indexes.sql')
expectedMigrations.push('0056_direct_lesson_progression.sql')
expectedMigrations.push('0057_complete_legacy_draft_threads.sql')
expectedMigrations.push('0058_semantic_relationships.sql')
expectedMigrations.push('0059_daily_resurfacing.sql')
expectedMigrations.push('0060_note_distillation.sql')
expectedMigrations.push('0061_recommendation_read_efficiency.sql')
expectedMigrations.push('0062_free_tier_budget.sql')
expectedMigrations.push('0063_data_trust_and_feed_branches.sql')
expectedMigrations.push('0064_personal_library_studio.sql')
expectedMigrations.push('0065_reconcile_personal_book_states.sql')
expectedMigrations.push('0066_hermes_memory_live_key.sql')
expectedMigrations.push('0067_portable_search_and_lineage_repair.sql')
expectedMigrations.push('0068_lite_visual_corpus_activation.sql')
expectedMigrations.push('0069_recall_repair.sql')
expectedMigrations.push('0070_source_health.sql')
expectedMigrations.push('0071_thread_material_organizer.sql')
expectedMigrations.push('0072_share_intakes.sql')
expectedMigrations.push('0073_source_annotation_revisions.sql')
expectedMigrations.push('0074_lite_visual_corpus_scope_lineage.sql')
expectedMigrations.push('0075_riyadh_legacy_pair_visibility.sql')
expectedMigrations.push('0076_retire_unrebuilt_riyadh_companions.sql')
if (
  migrationNames.length !== expectedMigrations.length ||
  expectedMigrations.some((name, index) => migrationNames[index] !== name)
)
  throw new Error(
    `Migration order drift: expected ${expectedMigrations.join(', ')}, found ${migrationNames.join(', ')}`,
  )

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
  [
    'src/api/discovery.ts',
    'agent_contract_version: AGENT_CONTRACT_VERSION',
    'discovery drift check exposes active agent contract',
  ],
  [
    'client/src/app/router.ts',
    "export type RootKey = 'home' | 'library' | 'learn' | 'map' | 'settings'",
    'five-root route registry',
  ],
  [
    'client/src/workspaces/SettingsWorkspace.tsx',
    "const system = useData<SystemPayload>('/agent/system')",
    'Settings system control surface',
  ],
  ['docs/API.md', '/analytics/hermes', 'Hermes API documentation'],
  ['client/src/auth.ts', "credentials: 'same-origin'", 'shared browser request boundary'],
  [
    'PROJECT_CONTEXT.md',
    '`schema.sql` is the base schema; `migrations/` are ordered, idempotent production migrations.',
    'migration contract synchronization',
  ],
  ['.hermes.md', 'learning-compass-operating-system', 'procedural Hermes router contract'],
  ['src/api/agent.ts', /\[\s*'POST',\s*'\/learning\/core\/threads'/, 'Learning Thread agent capability'],
  ['src/api/capture.ts', 'branch_mapping_conflict', 'atomic branch-aware capture conflict guard'],
  ['src/services/capture.ts', 'branch_id=COALESCE(branch_id,?)', 'atomic capture branch persistence'],
  ['src/api/capture.ts', "app.post('/personal'", 'typed personal-library create route'],
  ['client/src/workspaces/settings/PersonalDataStudio.tsx', 'Edit every useful field', 'editable personal Data Studio'],
  ['.hermes.md', 'output_contract=source_note_v2', 'source-note extraction contract'],
  ['src/api/agent.ts', "['GET', '/agent/briefing'", 'Hermes briefing capability'],
  ['src/api/search.ts', "app.get('/evidence'", 'evidence retrieval endpoint'],
  ['docs/recovery.md', 'Recovery and portability', 'portable recovery contract'],
]
const failed = checks
  .filter(([file, needle]) => {
    const source = read(file)
    return needle instanceof RegExp ? !needle.test(source) : !source.includes(needle)
  })
  .map(([, , label]) => label)
if (failed.length) throw new Error(`Hermes contract drift: ${failed.join(', ')}`)
if (read('src/index.ts').includes('createHermesEvaluatorProposals'))
  throw new Error('Scheduled self-improvement remains enabled')

const contract = JSON.parse(read('docs/hermes-contract.json'))
if (contract.version !== 8) throw new Error('Canonical Hermes contract version drift')
const runtimeBudgets = contract.runtime_budgets
if (
  !runtimeBudgets?.default_telegram ||
  !runtimeBudgets?.memory_chars ||
  !runtimeBudgets?.loaded_skill_bytes ||
  !runtimeBudgets?.read_slo_ms
) {
  throw new Error('Canonical Hermes runtime budget contract is incomplete')
}
if (JSON.stringify(Object.keys(runtimeBudgets.prompt_contracts || {})) !== JSON.stringify(['default_telegram']))
  throw new Error('Hermes prompt checks must target the native default profile')
for (const [name, file] of Object.entries(runtimeBudgets.prompt_contracts)) {
  if (typeof file !== 'string' || !existsSync(join(root, file)))
    throw new Error(`Hermes prompt contract path is invalid: ${name}`)
  const promptContract = JSON.parse(read(file))
  const expected = runtimeBudgets[name]
  if (promptContract.schema !== 'hermes-prompt-budget/v1' || promptContract.platform !== 'telegram')
    throw new Error(`Hermes prompt contract schema drift: ${name}`)
  for (const field of [
    'max_system_prompt_bytes',
    'max_tool_schema_bytes',
    'max_fixed_payload_bytes',
    'max_skills_index_bytes',
  ]) {
    if (promptContract[field] !== expected[field]) throw new Error(`Hermes prompt budget drift: ${name}.${field}`)
  }
  if (!Array.isArray(promptContract.expected_tools) || promptContract.expected_tools.length !== expected.exact_tools)
    throw new Error(`Hermes prompt tool inventory drift: ${name}`)
  if (
    !promptContract.require_memory_readable ||
    !promptContract.require_memory_within_limits ||
    !promptContract.require_memory_tail_loaded ||
    !promptContract.require_no_duplicate_memory_entries
  ) {
    throw new Error(`Hermes prompt memory gate drift: ${name}`)
  }
}
if (runtimeBudgets.read_slo_ms.filtered_capabilities_p95 !== 1000 || runtimeBudgets.read_slo_ms.briefing_p95 !== 1000)
  throw new Error('Hermes production read SLO drift')
const agentControlSource = read('src/services/agent-capabilities.ts')
const agentApiSource = read('src/api/agent.ts')
const agentVersion = agentControlSource.match(/AGENT_CONTRACT_VERSION = '([^']+)'/)?.[1]
const agentProtocol = agentControlSource.match(/AGENT_PROTOCOL = '([^']+)'/)?.[1]
if (!agentVersion || agentVersion !== contract.agent_control?.contract_version)
  throw new Error(
    `Agent contract version drift: source=${agentVersion}, contract=${contract.agent_control?.contract_version}`,
  )
if (!agentProtocol || agentProtocol !== contract.agent_control?.protocol)
  throw new Error(`Agent protocol drift: source=${agentProtocol}, contract=${contract.agent_control?.protocol}`)
const turnLedgerContract = contract.agent_control?.turn_ledger
if (
  turnLedgerContract?.owner !== 'learning-compass-site-operator/scripts/site_request.py' ||
  turnLedgerContract?.identity_env !== 'HERMES_TURN_ID' ||
  turnLedgerContract?.safe_get_attempts !== 2 ||
  turnLedgerContract?.mutation_retry_default !== 0
) {
  throw new Error('Hermes turn-ledger contract drift')
}
if (!agentControlSource.includes("paths['/agent/request']")) throw new Error('Agent OpenAPI control-route drift')
if (!read('src/index.ts').includes('INSERT OR IGNORE INTO sync_mutation_locks'))
  throw new Error('Atomic mutation reservation drift')
for (const obsolete of [
  "name: 'push_recommendation'",
  "name: 'validate_content_fit'",
  "name: 'log_learning_session'",
  "name: 'get_agent_context'",
  "app.post('/validate-fit'",
]) {
  if (agentApiSource.includes(obsolete)) throw new Error(`Obsolete agent tool remains: ${obsolete}`)
}
for (const retired of [
  "['POST', '/learning/core/threads/:id/stages/:stageId/items'",
  "['PATCH', '/learning/core/threads/:id/stages/:stageId/items/:itemId'",
  "['POST', '/learning/core/threads/:id/stages/:stageId/verify'",
  "['POST', '/learning/core/threads/:id/verify'",
]) {
  if (agentApiSource.includes(retired)) throw new Error(`Retired progression-gate agent route remains: ${retired}`)
}
for (const tool of contract.agent_control?.tools || []) {
  if (!agentApiSource.includes(`name: '${tool}'`) || !agentApiSource.includes(`name === '${tool}'`))
    throw new Error(`Agent tool declaration/handler drift: ${tool}`)
}
for (const invariant of [
  'idempotency_key required for agent mutations',
  'exact-target read precondition',
  'resolveCapabilityReadbacks',
  'buildAgentOpenApi',
]) {
  if (!agentApiSource.includes(invariant) && !agentControlSource.includes(invariant))
    throw new Error(`Agent control invariant missing: ${invariant}`)
}
const requiredPolicy = [
  ['workflow', 'conversation-driven'],
  ['background_self_improvement', false],
  ['notebooklm', 'explicit feedback grounding or explicit Studio request only'],
  ['recommendations', 'explicit request only; feedback never creates a recommendation'],
  [
    'capture',
    'every new source is a captured Library record with its validated branch persisted atomically; Queue is separate and explicit',
  ],
  [
    'personal_library',
    'typed books and media use canonical branch-verified records with editable personal state and append-only lineage; personal status never enters Queue or advances learning',
  ],
  [
    'learning_progression',
    'Levels and Threads advance only through learner-confirmed direct lesson completion; projects, sources, notes, ratings, dispositions, recall, resurfacing, frontier states, and provider receipts never gate or advance progression',
  ],
  [
    'branch_domain',
    'every captured, recommended, or queued item requires a verified non-pruned branch plus persisted super_category/domain and a visible branch pill on every rendering surface; synthetic rounds are retired',
  ],
]
for (const [key, expected] of requiredPolicy) {
  if (contract.policies?.[key] !== expected) throw new Error(`Canonical Hermes policy drift: ${key}`)
}
if (
  contract.network?.private_urls !== 'deny_by_default' ||
  contract.network?.local_services !== 'require_explicit_operator_override'
) {
  throw new Error('Canonical Hermes network policy drift')
}
const authentication = contract.authentication
if (
  authentication?.learning_compass_api_token_required !== false ||
  authentication?.browser_session_exchange !== false ||
  authentication?.access !== 'open Worker reads and writes' ||
  !authentication?.dedicated_boundaries?.includes('telegram_webhook') ||
  !String(authentication.local_write_bypass || '').includes('exact loopback')
) {
  throw new Error('Canonical open-access contract drift')
}
if (existsSync(join(root, 'src/auth.ts'))) throw new Error('Retired private-auth module remains in Worker source')
const workerEntrySource = read('src/index.ts')
for (const retired of [
  "from './auth'",
  "app.post('/auth/session'",
  'authenticatePrivateRequest',
  'createBrowserSession',
  'privateApiRequired',
  'configuredApiToken',
]) {
  if (workerEntrySource.includes(retired))
    throw new Error(`Retired private-auth plumbing remains in Worker entry: ${retired}`)
}
const browserClientSource = read('client/src/auth.ts')
for (const retired of [
  'TASTE_MAP_API_TOKEN',
  'LEARNING_COMPASS_API_TOKEN',
  'x-api-token',
  '/auth/session',
  '__Host-learning_compass_session',
]) {
  if (browserClientSource.includes(retired))
    throw new Error(`Retired private-auth plumbing remains in browser client: ${retired}`)
}
for (const [file, required] of [
  [
    'docs/API.md',
    'Learning Compass API reads and writes do not require an API token or browser session. `POST /auth/session` is retired.',
  ],
  ['PROJECT_CONTEXT.md', 'Learning Compass ordinary reads and writes require no API token or browser unlock session'],
]) {
  if (!read(file).includes(required)) throw new Error(`Public Learning Compass API contract drift: ${file}`)
}
const evolution = contract.policies?.self_evolution
if (
  evolution?.enabled !== true ||
  evolution.scope !== 'verified_system_improvement' ||
  evolution.persist_to !==
    'canonical source plus D1 self_improvement_runs receipt; hermes_memory only for durable profile or skill_procedure evidence' ||
  evolution.skill_source_edits !== 'automatic_after_replay_or_test_gate_in_active_conversation' ||
  evolution.deployment !== 'automatic_after_release_verification_with_observed_live_smoke'
) {
  throw new Error('Canonical Hermes self-evolution policy drift')
}
for (const trigger of [
  'specialist evolution handoff',
  'observed skill failure',
  'validated better path',
  'explicit audit',
]) {
  if (!evolution.trigger?.includes(trigger)) throw new Error(`Self-evolution trigger missing: ${trigger}`)
}
if (contract.self_evolution_owner !== 'learning-compass-self-evolution')
  throw new Error('Canonical self-evolution owner drift')
const activeSkills = contract.skill_graph?.active || []
const retiredSkills = contract.skill_graph?.retired || []
if (activeSkills.length !== 28 || new Set(activeSkills.map((skill) => skill.name)).size !== activeSkills.length) {
  throw new Error('Canonical Hermes active skill graph is incomplete or duplicated')
}
for (const name of ['learning-compass-operating-system', 'learning-compass-self-evolution', 'learning-compass-site-operator', 'recommendations-worker-ops', 'cloudflare-ai-pipeline-operations', 'taste-mapper', 'taste-rec', 'learning-notes-extractor', 'lite-visual', 'arab-writer', 'visual-mind', 'notebooklm', 'rss-feed', 'agent-cli-delegation', 'youtube-playlist-verification', 'media-transcription-systems', 'learning-thread-authoring', 'riyadh-salihin-al-badr', 'progressive-learning-curriculum', 'learning-compass-source-ingestion', 'learning-hub-companion-authoring', 'compass-recommendation-workflows', 'hermes-configuration-operations', 'learning-compass-feedback-corrections', 'learning-compass-foundation-curation', 'learning-compass-job-backlog-operations', 'hermes-learning-compass', 'epub-repair']) {
  if (!activeSkills.some((skill) => skill.name === name && skill.path && skill.role)) throw new Error(`Canonical active skill missing: ${name}`)
}
for (const name of [
  'taste-enhancer',
  'compass-queue-fill',
  'learning-compass-curator-policy',
  'master-editorial-synthesis',
  'learning-thread-curation',
  'learning-compass-bridge',
]) {
  if (!retiredSkills.includes(name)) throw new Error(`Canonical retired skill missing: ${name}`)
}
const localSkillsRoot = join(homedir(), '.hermes', 'skills')
if (existsSync(localSkillsRoot)) {
  const instructionIssues = auditInstructions({
    repoRoot: root,
    skillsRoot: localSkillsRoot,
    packageScripts: JSON.parse(read('package.json')).scripts,
    documents: instructionDocuments(root, localSkillsRoot, activeSkills),
  })
  if (instructionIssues.length)
    throw new Error(`Hermes instruction audit failed:\n${formatInstructionIssues(instructionIssues, root)}`)
  const siteClientPath = join(
    localSkillsRoot,
    'workflow',
    'learning-compass-site-operator',
    'scripts',
    'site_request.py',
  )
  if (!existsSync(siteClientPath)) throw new Error('First-party Learning Compass site client is missing')
  const siteClientSource = readFileSync(siteClientPath, 'utf8')
  for (const [needle, label] of [
    ['GET_REQUEST_ATTEMPTS = 2', 'two-attempt safe GET ownership'],
    ['HERMES_TURN_ID', 'turn-scoped call-ledger identity'],
    ['safe_get_retry_budget_exhausted', 'cross-process retry budget'],
    ['verified_receipt_proves', 'exact receipt proof guard'],
    ['"view": "full"', 'full filtered capability schema discovery'],
  ]) {
    if (!siteClientSource.includes(needle)) throw new Error(`Site client contract drift: ${label}`)
  }
  const configPath = join(homedir(), '.hermes', 'config.yaml')
  const configText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  const envPath = join(homedir(), '.hermes', '.env')
  const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  if (
    !/^browser:\n(?:[ \t]+.*\n)*?[ \t]+allow_private_urls:\s*false\s*$/m.test(configText) ||
    !/^security:\n(?:[ \t]+.*\n)*?[ \t]+allow_private_urls:\s*false\s*$/m.test(configText)
  ) {
    throw new Error('Default Hermes profile must deny private/internal URLs by default')
  }
  if (!/^WEBHOOK_ENABLED=false\s*$/m.test(envText))
    throw new Error('Default Hermes environment overrides the disabled webhook listener')
  const disabledBlock = configText.match(/^skills:\n((?:[ \t]+.*\n?)*)/m)?.[1] || ''
  const disabledSkills = new Set([...disabledBlock.matchAll(/^\s+-\s+([^#\s]+)\s*$/gm)].map((match) => match[1]))
  const disabledInline = disabledBlock.match(/disabled:\s*['"]?(\[[^\n]+\])['"]?/)?.[1]
  if (disabledInline) {
    try {
      for (const name of JSON.parse(disabledInline)) disabledSkills.add(String(name))
    } catch {}
  }
  for (const skill of activeSkills) {
    const file = join(localSkillsRoot, skill.path, 'SKILL.md')
    if (!existsSync(file)) throw new Error(`Active Hermes skill is not installed: ${skill.name}`)
    if (disabledSkills.has(skill.name)) throw new Error(`Canonical active Hermes skill is disabled: ${skill.name}`)
    const body = readFileSync(file, 'utf8')
    const loadedLimit = runtimeBudgets.loaded_skill_bytes[skill.name]
    if (loadedLimit !== undefined && Buffer.byteLength(body) > loadedLimit)
      throw new Error(`Hermes loaded skill budget exceeded: ${skill.name} ${Buffer.byteLength(body)}/${loadedLimit}`)
    if (!body.includes(`name: ${skill.name}`)) throw new Error(`Hermes skill name/path drift: ${skill.name}`)
    if (!body.includes('## Evolution handoff')) throw new Error(`Hermes skill lacks evolution handoff: ${skill.name}`)
    for (const forbidden of [
      'style_lock: paper=',
      '## Keep the skill current (mandatory)',
      'save to Hermes memory as hard reject',
      'pair upload, extraction,',
      'agy CLI agent last',
      'Every substantive section must be bilingual',
      'ε=0.15',
      'V2 remains shadow-only',
      'POST /learning/log',
      'Gemini API exclusively',
      "Scholar's Instrument",
      'or the canonical direct route',
    ]) {
      if (body.includes(forbidden)) throw new Error(`Stale Hermes skill contract in ${skill.name}: ${forbidden}`)
    }
    for (const forbidden of [
      /\bInbox\b/i,
      /learning[- ]evidence/i,
      /learner evidence/i,
      /Thread evidence/i,
      /proof (?:work|action|requirement|counter)/i,
      /ready_to_verify/i,
      /evidence_pending/i,
      /\/learning\/core\/evidence/i,
      /2026-08-18/,
    ]) {
      if (forbidden.test(body))
        throw new Error(`Retired Learning Compass concept remains in ${skill.name}: ${forbidden}`)
    }
    if (skill.name === 'learning-compass-self-evolution') {
      for (const needle of [
        '## Failure-to-repair protocol',
        'Reproduce it with the smallest safe replay',
        'Add a regression test or deterministic validator',
        'Do not close a reproducible repairable failure as `no_change`',
      ]) {
        if (!body.includes(needle)) throw new Error(`Hermes self-evolution repair protocol missing: ${needle}`)
      }
    }
    if (skill.name === 'lite-visual') {
      for (const needle of [
        'lite-visual-linear/v4',
        'lite-visual-source-extraction/v1',
        'scripts/extract_source.py',
        'references/source-extraction.md',
        'article[data-canonical-content=true]',
        'POST /artifacts/pairs',
        'Intent',
        'Frontend Design',
        'code-only',
      ]) {
        if (!body.includes(needle)) throw new Error(`Visual Lite v4 contract missing: ${needle}`)
      }
      for (const forbidden of [
        'generated-image',
        'call AGY automatically',
        'Visual Mind records',
        'two to four Arabic pauses',
      ]) {
        if (body.includes(forbidden)) throw new Error(`Visual Lite retained a removed image/widget path: ${forbidden}`)
      }
    }
  }

  const routerSkillBytes = Buffer.byteLength(
    readFileSync(join(localSkillsRoot, 'workflow', 'learning-compass-operating-system', 'SKILL.md'), 'utf8'),
  )
  const operatorSkillBytes = Buffer.byteLength(
    readFileSync(join(localSkillsRoot, 'workflow', 'learning-compass-site-operator', 'SKILL.md'), 'utf8'),
  )
  if (routerSkillBytes > runtimeBudgets.loaded_skill_bytes['learning-compass-operating-system'])
    throw new Error(`Hermes router skill budget exceeded: ${routerSkillBytes}`)
  if (operatorSkillBytes > runtimeBudgets.loaded_skill_bytes['learning-compass-site-operator'])
    throw new Error(`Hermes site-operator skill budget exceeded: ${operatorSkillBytes}`)
  if (routerSkillBytes + operatorSkillBytes > runtimeBudgets.loaded_skill_bytes.ordinary_router_plus_operator)
    throw new Error(`Hermes ordinary loaded-skill budget exceeded: ${routerSkillBytes + operatorSkillBytes}`)

  const liteVisualRoot = join(localSkillsRoot, 'lite-visual')
  for (const file of [
    'references/source-extraction.md',
    'scripts/extract_source.py',
    'scripts/extract_article.mjs',
    'scripts/render_page.mjs',
    'scripts/fetch_transcript.py',
  ]) {
    if (!existsSync(join(liteVisualRoot, file))) throw new Error(`Visual Lite source adapter missing: ${file}`)
  }
  for (const name of retiredSkills) {
    const installed =
      readdirSync(localSkillsRoot, { withFileTypes: true }).some(
        (entry) => entry.isDirectory() && entry.name === name,
      ) ||
      existsSync(join(localSkillsRoot, 'workflow', name, 'SKILL.md')) ||
      existsSync(join(localSkillsRoot, 'personal', name, 'SKILL.md')) ||
      existsSync(join(localSkillsRoot, 'productivity', name, 'SKILL.md'))
    const stillActive = activeSkills.some((skill) => skill.name === name) || (installed && !disabledSkills.has(name))
    if (stillActive) throw new Error(`Retired Hermes skill remains active: ${name}`)
  }
  const walkSkillFiles = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
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

  const relevantFiles = (dir) =>
    walkSkillFiles(dir).filter(
      (file) =>
        !file.includes('/__pycache__/') &&
        !file.includes('/.usage/') &&
        !file.includes('/.hub/') &&
        !file.endsWith('.pyc'),
    )
  for (const skill of activeSkills) {
    const canonicalDir = join(localSkillsRoot, skill.path)
    const canonicalFiles = relevantFiles(canonicalDir)
      .map((file) => relative(canonicalDir, file))
      .sort()
    for (const file of canonicalFiles) {
      const canonical = readFileSync(join(canonicalDir, file))
      if (/\.(?:md|py|js|mjs|sh|json|ya?ml)$/.test(file)) {
        const text = canonical.toString('utf8')
        for (const forbidden of [
          /\bInbox\b/i,
          /learning[- ]evidence/i,
          /learner evidence/i,
          /Thread evidence/i,
          /proof (?:work|action|requirement|counter)/i,
          /ready_to_verify/i,
          /evidence_pending/i,
          /\/learning\/core\/evidence/i,
          /2026-08-18/,
          /notebooklm-mcp/i,
          /compatible MCP session/i,
          /optional recall-draft workflow/i,
          /silently producing an unlinked item/i,
          /Private mode is opt-in through/i,
          /Writes require `x-api-token` when `API_TOKEN` is configured/i,
          /Incremental FTS5/i,
          /\/knowledge\/blind-spots/i,
        ]) {
          if (forbidden.test(text))
            throw new Error(`Retired Learning Compass concept remains in ${skill.name}/${file}: ${forbidden}`)
        }
      }
    }
  }
  const rootMemory = join(homedir(), '.hermes', 'memories', 'MEMORY.md')
  const rootUser = join(homedir(), '.hermes', 'memories', 'USER.md')
  const rootSoul = join(homedir(), '.hermes', 'SOUL.md')
  if (readFileSync(rootSoul, 'utf8') !== read('docs/learning-compass-hermes-soul.md'))
    throw new Error('Checked-in Hermes SOUL source drift')

  for (const [label, file] of [
    ['MEMORY.md', rootMemory],
    ['USER.md', rootUser],
  ]) {
    const text = readFileSync(file, 'utf8').trim()
    const chars = Array.from(text).length
    const limit = runtimeBudgets.memory_chars[label]
    if (!Number.isInteger(limit) || chars > limit)
      throw new Error(`${label} character budget exceeded: ${chars}/${limit}`)
    const entries = text
      .split(/\n\s*§\s*\n/g)
      .map((entry) => entry.trim())
      .filter(Boolean)
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const relation = durableEntryRelation(entries[left], entries[right])
        if (relation) throw new Error(`${label} contains ${relation} between entries ${left + 1} and ${right + 1}`)
      }
    }
    if (!entries.length || !entries.at(-1)) throw new Error(`${label} tail entry is missing`)
  }

  for (const [label, text] of [['default', configText]]) {
    for (const requiredConfig of [
      /default:\s*gpt-5\.6-sol/,
      /provider:\s*openai-codex/,
      /service_tier:\s*fast/,
      /reasoning_effort:\s*medium/,
      /model:\s*gpt-5\.6-terra/,
      /model:\s*gpt-5\.6-luna/,
    ])
      if (!requiredConfig.test(text)) throw new Error(`${label} Hermes model configuration drift: ${requiredConfig}`)
    if (/^mcp(?:_servers)?:/m.test(text)) throw new Error(`${label} Hermes profile has an unintended MCP registration`)
    if ([...text.matchAll(/^\s+webhook:\n\s+enabled:\s*false\s*$/gm)].length < 2)
      throw new Error(`${label} Hermes profile must keep the unused webhook listeners disabled`)
  }
}
for (const tier of ['automatic', 'proposal_only', 'explicit_only']) {
  if (!contract.side_effect_tiers?.[tier]?.requires || !Array.isArray(contract.side_effect_tiers[tier].allows)) {
    throw new Error(`Canonical Hermes side-effect tier is incomplete: ${tier}`)
  }
}
const receipt = ['intent', 'target', 'before', 'mutation_or_job', 'after', 'evidence', 'blocker']
if (JSON.stringify(contract.specialist_receipt) !== JSON.stringify(receipt))
  throw new Error('Specialist receipt contract drift')

const routeEntries = Object.entries(contract.route_ownership || {})
if (
  !routeEntries.length ||
  routeEntries.some(([route, rule]) => !route.includes(' ') || !rule?.owner || !rule?.permission)
) {
  throw new Error('Route ownership/permission contract is incomplete')
}
for (const route of [
  'GET /compass/context',
  'POST /compass/semantic/index',
  'POST /compass/pick/:id/candidates',
  'POST /capture/:id/branch-map',
  'GET /capture/personal',
  'POST /capture/personal',
  'PATCH /capture/personal/:id',
  'POST /assistant/interpret',
  'GET /hardcover',
  'POST /hardcover/sync',
  'POST /hardcover/import',
]) {
  if (!contract.route_ownership?.[route]?.owner) throw new Error(`Canonical route owner missing: ${route}`)
}
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) return walk(file)
    return /\.(ts|tsx|md|json)$/.test(entry.name) ? [file] : []
  })
const searchable = [join(root, 'src'), join(root, 'client'), join(root, 'docs/API.md'), join(root, '.hermes.md')]
  .flatMap((path) => (path.endsWith('.md') ? [path] : walk(path)))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
for (const [route] of routeEntries) {
  if (route.startsWith('npx ')) continue
  const path = route.replace(/^[A-Z]+\s+/, '')
  if (!searchable.includes(path) && !searchable.includes(path.replace(/:id/g, ':id'))) {
    throw new Error(`Route missing from repository contract surface: ${route}`)
  }
}

const policySurfaces = [
  read('docs/architecture.md'),
  read('.hermes.md'),
  read('PROJECT_CONTEXT.md'),
  read('CURRENT_STATE.md'),
].join('\n')
for (const phrase of [
  'active workflow',
  'proposal-only',
  'explicit-only',
  'specialist receipt',
  'basic intro',
  'practical applied tool',
  'skill-procedure memory',
]) {
  if (!policySurfaces.toLowerCase().includes(phrase.toLowerCase()))
    throw new Error(`Policy phrase missing from synchronized docs: ${phrase}`)
}
const stale = [
  ['docs/architecture.md', 'Hermes polls D1 jobs every two minutes'],
  ['docs/architecture.md', 'Only user approval queues the exact application job'],
  [
    '/home/mahmud/.hermes/skills/personal/taste-rec/SKILL.md',
    'AI/LLM tools content** must ONLY appear in the RSS feed',
  ],
  ['/home/mahmud/.hermes/skills/workflow/learning-compass-operating-system/SKILL.md', 'call AGY automatically'],
  ['/home/mahmud/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md', 'Lite Visual/Visual Mind'],
  ['/home/mahmud/.hermes/skills/visual-mind/SKILL.md', 'decision: generated-image'],
]
for (const [file, phrase] of stale) {
  if (file.startsWith('/') && !existsSync(file)) continue
  const text = file.startsWith('/') ? readFileSync(file, 'utf8') : read(file)
  if (text.includes(phrase)) throw new Error(`Stale Hermes policy remains in ${file}: ${phrase}`)
}

console.log(
  `Hermes contract verified: ${expectedMigrations.length} migrations, ${checks.length} synchronized checks, ${routeEntries.length} owned routes.`,
)
