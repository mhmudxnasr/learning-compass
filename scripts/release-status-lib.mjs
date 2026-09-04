const rows = (result, label) => {
  if (!result || result.success !== true || !Array.isArray(result.results)) {
    throw new Error(`Release-status query failed: ${label}`)
  }
  return result.results
}

const numeric = (value) => Number(value || 0)

export function buildReleaseSnapshot({
  observedAt,
  origin,
  source,
  deployments,
  d1Results,
  live,
  readiness,
  budget,
  localMigrations,
  requiredSchema,
  requiredReadHeadroom,
  requiredWriteHeadroom,
}) {
  if (!Array.isArray(deployments) || !deployments.length) throw new Error('No production deployment was returned')
  if (!Array.isArray(d1Results) || d1Results.length !== 4)
    throw new Error('Remote release-status query returned an unexpected result set')

  const deployment = [...deployments]
    .sort((left, right) => String(left.created_on).localeCompare(String(right.created_on)))
    .at(-1)
  const version = deployment?.versions?.find((item) => Number(item.percentage) === 100) || deployment?.versions?.[0]
  if (!version?.version_id) throw new Error('Current production Worker version is unavailable')

  const applied = rows(d1Results[0], 'migrations').map((row) => ({
    name: String(row.name),
    applied_at: row.applied_at || null,
  }))
  const schemaRows = rows(d1Results[1], 'release schema').map((row) => ({
    name: String(row.name),
    type: String(row.type),
  }))
  const backup = rows(d1Results[2], 'recovery backup')[0] || null
  const corpus = rows(d1Results[3], 'corpus state')[0] || {}
  const appliedNames = new Set(applied.map((row) => row.name))
  const localNames = new Set(localMigrations)
  const presentSchema = new Set(schemaRows.map((row) => row.name))
  const pendingLocal = localMigrations.filter((name) => !appliedNames.has(name))
  const unexpectedRemote = applied.map((row) => row.name).filter((name) => !localNames.has(name))
  const missingSchema = requiredSchema.filter((name) => !presentSchema.has(name))

  const reads = {
    estimated: numeric(budget?.reads?.estimated),
    budget: numeric(budget?.reads?.budget),
    cloudflare_limit: numeric(budget?.reads?.cloudflare_limit),
  }
  const writes = {
    estimated: numeric(budget?.writes?.estimated),
    budget: numeric(budget?.writes?.budget),
    cloudflare_limit: numeric(budget?.writes?.cloudflare_limit),
  }
  reads.headroom = reads.cloudflare_limit - reads.budget
  writes.headroom = writes.cloudflare_limit - writes.budget
  reads.required_headroom = requiredReadHeadroom
  writes.required_headroom = requiredWriteHeadroom

  const blockers = [
    ...(!live?.ok || live?.status !== 'live' ? ['production_not_live'] : []),
    ...(!readiness?.ok || readiness?.status !== 'healthy' ? ['production_not_ready'] : []),
    ...(pendingLocal.length || unexpectedRemote.length ? ['migration_drift'] : []),
    ...(missingSchema.length ? ['release_schema_incomplete'] : []),
    ...(readiness?.release?.signing_secret_configured !== true ? ['release_signing_secret_unavailable'] : []),
    ...(reads.budget <= 0 || reads.headroom < requiredReadHeadroom ? ['read_budget_missing_required_headroom'] : []),
    ...(writes.budget <= 0 || writes.headroom < requiredWriteHeadroom
      ? ['write_budget_missing_required_headroom']
      : []),
    ...(!backup || backup.status !== 'verified' || !backup.restore_rehearsed_at
      ? ['verified_restore_receipt_unavailable']
      : []),
  ]

  return {
    format: 'learning-compass-release-status-v1',
    observed_at: observedAt,
    source,
    production: {
      origin,
      deployment: { version_id: version.version_id, deployed_at: deployment.created_on },
      migrations: {
        applied_count: applied.length,
        highest: applied.at(-1) || null,
        pending_local: pendingLocal,
        unexpected_remote: unexpectedRemote,
      },
      schema: {
        expected_count: requiredSchema.length,
        present: schemaRows,
        missing: missingSchema,
      },
      health: {
        live: { ok: Boolean(live?.ok), status: live?.status || null, observed_at: live?.now || null },
        readiness: {
          ok: Boolean(readiness?.ok),
          status: readiness?.status || null,
          checked_at: readiness?.checked_at || null,
          blockers: readiness?.blockers || [],
          bindings: readiness?.release?.bindings || null,
          signing_secret_configured: readiness?.release?.signing_secret_configured === true,
        },
      },
      budget: { day_utc: budget?.day_utc || null, reads, writes, updated_at: budget?.updated_at || null },
      recovery: { latest_verified: backup },
      corpus: {
        corpora: numeric(corpus.corpora),
        targets: numeric(corpus.targets),
        active_corpora: numeric(corpus.active_corpora),
        pairs: numeric(corpus.pairs),
      },
    },
    policy: { ok: blockers.length === 0, blockers },
  }
}
