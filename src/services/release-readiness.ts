import type { Bindings } from '../lib.ts'

export const REQUIRED_RELEASE_SCHEMA = [
  'lite_visual_corpora',
  'lite_visual_corpus_targets',
  'lite_visual_pairs',
  'lite_visual_active_corpora',
  'lite_visual_thread_source_placements',
  'idx_lite_visual_pairs_corpus_state',
  'idx_lite_visual_pairs_recommendation_state',
  'trg_lite_visual_staged_pair_guard',
  'trg_lite_visual_corpus_activation_guard',
  'trg_lite_visual_corpus_rollback_guard',
  'srs_card_repair_events',
  'idx_srs_cards_repair',
  'idx_srs_cards_annotation',
  'idx_srs_card_repair_events_card',
  'source_health',
  'source_health_attempts',
  'source_url_replacements',
  'idx_source_health_attempts_source',
  'source_health_attempts_bound_history',
  'idx_source_url_replacements_source',
  'idx_thread_lesson_sources_source',
  'idx_thread_sources_material_order',
  'idx_learning_path_sources_material_order',
  'idx_thread_lesson_sources_material_order',
  'idx_agent_jobs_lesson_material',
  'idx_compass_lesson_material_request',
  'share_intakes',
  'idx_share_intakes_pending',
  'idx_source_annotations_revision',
  'feed_entry_dismissals',
] as const

export const REQUIRED_RELEASE_COLUMNS = {
  srs_cards: [
    'annotation_id',
    'repair_status',
    'repair_lapses_acknowledged',
    'content_revision',
    'scheduler_revision',
    'status_revision',
    'last_recall_mutation_id',
    'content_updated_at',
    'paused_at',
    'retired_at',
  ],
  thread_lesson_sources: ['expected_contribution', 'updated_at'],
  compass_picks: ['workflow_scope', 'workflow_request_id'],
  share_intakes: ['resolved_kind', 'source_identity_url', 'source_identity_key', 'resolved_at'],
  source_annotations: ['revision_of_annotation_id', 'selector_source_identities_json'],
} as const

export async function loadReleaseContractHealth(env: Bindings) {
  const schema = await env.DB.prepare(
    `SELECT name FROM sqlite_schema WHERE name IN (${REQUIRED_RELEASE_SCHEMA.map(() => '?').join(',')})`,
  )
    .bind(...REQUIRED_RELEASE_SCHEMA)
    .all<{ name: string }>()
  const present = new Set((schema.results || []).map((row) => row.name))
  const missingSchema = REQUIRED_RELEASE_SCHEMA.filter((name) => !present.has(name))
  const columnChecks = Object.entries(REQUIRED_RELEASE_COLUMNS)
    .map(([table]) => `SELECT '${table}' table_name,name FROM pragma_table_info('${table}')`)
    .join(' UNION ALL ')
  const columns = await env.DB.prepare(columnChecks).all<{ table_name: string; name: string }>()
  const presentColumns = new Set((columns.results || []).map((row) => `${row.table_name}.${row.name}`))
  const expectedColumns = Object.values(REQUIRED_RELEASE_COLUMNS).reduce((total, names) => total + names.length, 0)
  const missingColumns = Object.entries(REQUIRED_RELEASE_COLUMNS).flatMap(([table, names]) =>
    names.map((name) => `${table}.${name}`).filter((identity) => !presentColumns.has(identity)),
  )
  const bindings = {
    d1: Boolean(env.DB),
    r2: Boolean(env.ARTIFACTS),
    assets: Boolean(env.ASSETS),
    ai: Boolean(env.AI),
    vectorize: Boolean(env.COMPASS_VECTORS),
  }
  const missingBindings = Object.entries(bindings)
    .filter(([, configured]) => !configured)
    .map(([name]) => name)
  const signingSecretConfigured =
    typeof env.LITE_VISUAL_RECEIPT_SIGNING_KEY === 'string' && env.LITE_VISUAL_RECEIPT_SIGNING_KEY.trim().length >= 32
  return {
    ok:
      missingSchema.length === 0 &&
      missingColumns.length === 0 &&
      missingBindings.length === 0 &&
      signingSecretConfigured,
    schema: {
      expected: REQUIRED_RELEASE_SCHEMA.length,
      missing: missingSchema,
      expected_columns: expectedColumns,
      missing_columns: missingColumns,
    },
    bindings,
    signing_secret_configured: signingSecretConfigured,
  }
}
