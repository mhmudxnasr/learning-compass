import type { Bindings } from '../lib.ts'

export const REQUIRED_RELEASE_SCHEMA = [
  'lite_visual_corpora',
  'lite_visual_corpus_targets',
  'lite_visual_pairs',
  'lite_visual_active_corpora',
  'idx_lite_visual_pairs_corpus_state',
  'idx_lite_visual_pairs_recommendation_state',
  'trg_lite_visual_staged_pair_guard',
  'trg_lite_visual_corpus_activation_guard',
  'trg_lite_visual_corpus_rollback_guard',
] as const

export async function loadReleaseContractHealth(env: Bindings) {
  const schema = await env.DB.prepare(
    `SELECT name FROM sqlite_schema WHERE name IN (${REQUIRED_RELEASE_SCHEMA.map(() => '?').join(',')})`,
  )
    .bind(...REQUIRED_RELEASE_SCHEMA)
    .all<{ name: string }>()
  const present = new Set((schema.results || []).map((row) => row.name))
  const missingSchema = REQUIRED_RELEASE_SCHEMA.filter((name) => !present.has(name))
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
    ok: missingSchema.length === 0 && missingBindings.length === 0 && signingSecretConfigured,
    schema: { expected: REQUIRED_RELEASE_SCHEMA.length, missing: missingSchema },
    bindings,
    signing_secret_configured: signingSecretConfigured,
  }
}
