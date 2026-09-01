export type DataQualityCheck = {
  id: 'source_identity' | 'source_branch' | 'source_uniqueness' | 'event_lineage' | 'feed_branch_defaults'
  dimension: 'completeness' | 'validity' | 'uniqueness' | 'lineage'
  label: string
  status: 'passing' | 'failing'
  affected: number
  total: number
  coverage_percent: number
  message: string
}

export type DataQualityInputs = {
  sources: {
    total: number
    stored_total: number
    invalid_identity: number
    missing_branch: number
    invalid_branch: number
    duplicate_groups: number
    duplicate_rows: number
  }
  events: {
    total: number
    invalid: number
  }
  feeds: {
    total: number
    invalid_branch: number
  }
}

const number = (value: unknown) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

const coverage = (total: number, affected: number) => {
  if (total <= 0) return 100
  return Math.round(((total - Math.min(total, affected)) / total) * 10_000) / 100
}

function check(
  id: DataQualityCheck['id'],
  dimension: DataQualityCheck['dimension'],
  label: string,
  affected: number,
  total: number,
  healthyMessage: string,
  failingMessage: string,
): DataQualityCheck {
  return {
    id,
    dimension,
    label,
    status: affected === 0 ? 'passing' : 'failing',
    affected,
    total,
    coverage_percent: coverage(total, affected),
    message: affected === 0 ? healthyMessage : failingMessage,
  }
}

export function buildDataQualityReport(input: DataQualityInputs, checkedAt = new Date().toISOString()) {
  const sources = {
    total: number(input.sources.total),
    stored_total: number(input.sources.stored_total),
    invalid_identity: number(input.sources.invalid_identity),
    missing_branch: number(input.sources.missing_branch),
    invalid_branch: number(input.sources.invalid_branch),
    duplicate_groups: number(input.sources.duplicate_groups),
    duplicate_rows: number(input.sources.duplicate_rows),
  }
  const events = { total: number(input.events.total), invalid: number(input.events.invalid) }
  const feeds = { total: number(input.feeds.total), invalid_branch: number(input.feeds.invalid_branch) }
  const sourceIdentityDefects = sources.invalid_identity
  const sourceBranchDefects = sources.missing_branch + sources.invalid_branch

  const checks: DataQualityCheck[] = [
    check(
      'source_identity',
      'completeness',
      'Source identity',
      sourceIdentityDefects,
      sources.total,
      'Every active source has a title, locator, and deduplication key.',
      `${sourceIdentityDefects} active source records are missing required identity fields.`,
    ),
    check(
      'source_branch',
      'validity',
      'Branch coverage',
      sourceBranchDefects,
      sources.total,
      'Every active source resolves to a verified non-pruned taxonomy node.',
      `${sourceBranchDefects} active source records are missing a usable branch mapping.`,
    ),
    check(
      'source_uniqueness',
      'uniqueness',
      'Canonical source uniqueness',
      sources.duplicate_rows,
      sources.total,
      'No active source identity is duplicated.',
      `${sources.duplicate_rows} extra source records occur across ${sources.duplicate_groups} duplicate groups.`,
    ),
    check(
      'event_lineage',
      'lineage',
      'Learning-event lineage',
      events.invalid,
      events.total,
      'Every learning event has a type, timestamp, and valid source or Thread reference.',
      `${events.invalid} learning events have broken identity or ownership lineage.`,
    ),
    check(
      'feed_branch_defaults',
      'validity',
      'Feed branch defaults',
      feeds.invalid_branch,
      feeds.total,
      'Every enabled feed imports into one reviewed default branch.',
      `${feeds.invalid_branch} enabled feeds are missing a verified default branch.`,
    ),
  ]
  const passing = checks.filter((item) => item.status === 'passing').length
  return {
    status: passing === checks.length ? ('trusted' as const) : ('needs_attention' as const),
    scope: 'active_sources' as const,
    checked_at: checkedAt,
    summary: {
      passing,
      failing: checks.length - passing,
      total: checks.length,
    },
    counts: {
      active_sources: sources.total,
      stored_sources: sources.stored_total,
      learning_events: events.total,
      enabled_feeds: feeds.total,
    },
    checks,
  }
}

export async function loadDataQuality(DB: D1Database, checkedAt = new Date().toISOString()) {
  const [sourceRow, eventRow, feedRow] = await Promise.all([
    DB.prepare(
      `WITH stored_sources AS (
        SELECT r.id,r.status,r.video_title,r.video_url,r.dedup_key,m.recommendation_id meta_id,m.branch_id,n.id node_id,n.type node_type,n.status node_status
        FROM recommendations r
        LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
        LEFT JOIN tree_nodes n ON n.id=m.branch_id
        WHERE r.deleted_at IS NULL
      ), active_sources AS (
        SELECT * FROM stored_sources WHERE status='active'
      ), duplicate_keys AS (
        SELECT dedup_key,COUNT(*) count
        FROM active_sources
        WHERE dedup_key IS NOT NULL AND trim(dedup_key)!=''
        GROUP BY dedup_key HAVING COUNT(*)>1
      )
      SELECT
        (SELECT COUNT(*) FROM stored_sources) stored_total,
        (SELECT COUNT(*) FROM active_sources) total,
        (SELECT COUNT(*) FROM active_sources WHERE video_title IS NULL OR trim(video_title)='' OR video_url IS NULL OR trim(video_url)='' OR dedup_key IS NULL OR trim(dedup_key)='') invalid_identity,
        (SELECT COUNT(*) FROM active_sources WHERE meta_id IS NULL OR branch_id IS NULL OR trim(branch_id)='') missing_branch,
        (SELECT COUNT(*) FROM active_sources WHERE branch_id IS NOT NULL AND trim(branch_id)!='' AND (node_id IS NULL OR node_type='root' OR lower(COALESCE(node_status,''))='pruned')) invalid_branch,
        (SELECT COUNT(*) FROM duplicate_keys) duplicate_groups,
        (SELECT COALESCE(SUM(count-1),0) FROM duplicate_keys) duplicate_rows`,
    ).first<any>(),
    DB.prepare(
      `SELECT COUNT(*) total,
        SUM(CASE WHEN e.event_type IS NULL OR trim(e.event_type)='' OR e.occurred_at IS NULL
          OR (e.recommendation_id IS NOT NULL AND r.id IS NULL)
          OR (e.thread_id IS NOT NULL AND t.id IS NULL) THEN 1 ELSE 0 END) invalid
      FROM learning_events e
      LEFT JOIN recommendations r ON r.id=e.recommendation_id
      LEFT JOIN learning_threads t ON t.id=e.thread_id`,
    ).first<any>(),
    DB.prepare(
      `SELECT COUNT(*) total,
        SUM(CASE WHEN fs.branch_id IS NULL OR trim(fs.branch_id)='' OR n.id IS NULL OR n.type!='branch'
          OR NOT (n.parent_id='root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id=n.parent_id AND p.type='category'))
          OR lower(COALESCE(n.status,''))='pruned' THEN 1 ELSE 0 END) invalid_branch
      FROM feed_sources fs LEFT JOIN tree_nodes n ON n.id=fs.branch_id
      WHERE fs.enabled=1`,
    ).first<any>(),
  ])

  return buildDataQualityReport(
    {
      sources: {
        total: sourceRow?.total,
        stored_total: sourceRow?.stored_total,
        invalid_identity: sourceRow?.invalid_identity,
        missing_branch: sourceRow?.missing_branch,
        invalid_branch: sourceRow?.invalid_branch,
        duplicate_groups: sourceRow?.duplicate_groups,
        duplicate_rows: sourceRow?.duplicate_rows,
      },
      events: { total: eventRow?.total, invalid: eventRow?.invalid },
      feeds: { total: feedRow?.total, invalid_branch: feedRow?.invalid_branch },
    },
    checkedAt,
  )
}
