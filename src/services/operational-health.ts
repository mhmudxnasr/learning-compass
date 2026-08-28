import type { Bindings } from '../lib'
import { MAINTENANCE_STALE_AFTER_MS } from './maintenance'
import { DELAYED_RETRY_COUNT_SQL, OVERDUE_RETRY_COUNT_SQL } from './job-retry-health.ts'
import { loadReleaseContractHealth } from './release-readiness.ts'

const BACKUP_STALE_AFTER_MS = 26 * 60 * 60 * 1000
const RETRY_STALE_AFTER_MINUTES = 30

const utcMillis = (value: string | null | undefined) => {
  if (!value) return null
  const normalized = value.includes('T') || /Z$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export async function loadIntegrityHealth(DB: D1Database) {
  const [open, metadata, sessions, notes, reviews] = await Promise.all([
    DB.prepare('SELECT COUNT(*) count FROM integrity_quarantine WHERE resolved_at IS NULL').first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM recommendation_meta m LEFT JOIN recommendations r ON r.id=m.recommendation_id WHERE r.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='recommendation_meta' AND q.entity_id=m.recommendation_id AND q.reason='missing_recommendation')`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.recommendation_id IS NOT NULL AND r.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='learning_session' AND q.entity_id=s.id AND q.reason='missing_recommendation')`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM notes n LEFT JOIN recommendations r ON r.id=n.recommendation_id WHERE n.recommendation_id IS NOT NULL AND r.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='note' AND q.entity_id=n.id AND q.reason='missing_recommendation')`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM srs_review_events e LEFT JOIN srs_cards x ON x.id=e.card_id WHERE x.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='srs_review_event' AND q.entity_id=CAST(e.id AS TEXT) AND q.reason='missing_card')`).first<any>(),
  ])
  const details = {
    recommendation_meta: Number(metadata?.count || 0),
    sessions: Number(sessions?.count || 0),
    notes: Number(notes?.count || 0),
    review_events: Number(reviews?.count || 0),
  }
  const activeOrphans = Object.values(details).reduce((sum, value) => sum + value, 0)
  const unresolved = Number(open?.count || 0)
  return { ok: activeOrphans === 0 && unresolved === 0, active_orphans: activeOrphans, quarantined_unresolved: unresolved, details }
}

export async function loadJobHealth(DB: D1Database) {
  const [counts, stale, oldest, failures, delayed, deadLetters, overdueRetry] = await Promise.all([
    DB.prepare('SELECT status,COUNT(*) count FROM agent_jobs GROUP BY status').all<any>(),
    DB.prepare("SELECT COUNT(*) count FROM agent_jobs WHERE status='running' AND lease_expires_at<datetime('now')").first<any>(),
    DB.prepare("SELECT MIN(created_at) created_at FROM agent_jobs WHERE status IN ('pending','retry')").first<any>(),
    DB.prepare("SELECT COUNT(*) count FROM agent_jobs WHERE status='failed' AND datetime(updated_at)>=datetime('now','-24 hours')").first<any>(),
    DB.prepare(DELAYED_RETRY_COUNT_SQL).first<any>(),
    DB.prepare('SELECT COUNT(*) count FROM agent_job_retries WHERE dead_lettered_at IS NOT NULL').first<any>(),
    DB.prepare(OVERDUE_RETRY_COUNT_SQL(RETRY_STALE_AFTER_MINUTES)).first<any>(),
  ])
  const status: Record<string, number> = {}
  for (const row of counts.results || []) status[row.status] = Number(row.count || 0)
  const staleRunning = Number(stale?.count || 0)
  const failedLast24h = Number(failures?.count || 0)
  const dead = Number(deadLetters?.count || 0)
  const overdue = Number(overdueRetry?.count || 0)
  return {
    ok: staleRunning === 0 && failedLast24h === 0 && dead === 0 && overdue === 0,
    status,
    stale_running: staleRunning,
    oldest_pending: oldest?.created_at || null,
    failed_last_24h: failedLast24h,
    delayed_retries: Number(delayed?.count || 0),
    dead_letters: dead,
    overdue_retries: overdue,
    checked_at: new Date().toISOString(),
  }
}

export async function loadMaintenanceHealth(DB: D1Database, now = Date.now()) {
  const rows = await DB.prepare("SELECT key,value FROM kv_store WHERE key IN ('maintenance_last_run','maintenance_last_success','maintenance_last_receipt','fts_last_sync')").all<{ key: string; value: string }>()
  const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]))
  const successMillis = utcMillis(values.maintenance_last_success)
  const age = successMillis == null ? null : Math.max(0, now - successMillis)
  let receipt: unknown = null
  try { receipt = values.maintenance_last_receipt ? JSON.parse(values.maintenance_last_receipt) : null } catch { receipt = null }
  return {
    ok: age !== null && age <= MAINTENANCE_STALE_AFTER_MS,
    last_run: values.maintenance_last_run || null,
    last_success: values.maintenance_last_success || null,
    last_search_sync: values.fts_last_sync || null,
    age_ms: age,
    stale_after_ms: MAINTENANCE_STALE_AFTER_MS,
    receipt,
  }
}

export async function loadRecoveryHealth(DB: D1Database, now = Date.now()) {
  const sourceCount = await DB.prepare('SELECT COUNT(*) count FROM recommendations WHERE deleted_at IS NULL').first<{ count: number }>()
  let latest: any = null
  try {
    latest = await DB.prepare(`SELECT id,status,storage_target,d1_sha256,d1_bytes,artifact_count,artifact_bytes,created_at,restore_rehearsed_at,error
      FROM recovery_backups WHERE status='verified' ORDER BY created_at DESC LIMIT 1`).first<any>()
  } catch {
    latest = null
  }
  const verifiedAt = latest?.restore_rehearsed_at || latest?.created_at || null
  const verifiedMillis = utcMillis(verifiedAt)
  const age = verifiedMillis == null ? null : Math.max(0, now - verifiedMillis)
  const required = Number(sourceCount?.count || 0) > 0
  return {
    ok: !required || (age !== null && age <= BACKUP_STALE_AFTER_MS),
    required,
    latest,
    age_ms: age,
    stale_after_ms: BACKUP_STALE_AFTER_MS,
  }
}

export async function loadOperationalHealth(env: Bindings, now = Date.now()) {
  const checkedAt = new Date(now).toISOString()
  try {
    await env.DB.prepare('SELECT 1 ok').first()
    const [integrity, jobs, maintenance, recovery, release] = await Promise.all([
      loadIntegrityHealth(env.DB),
      loadJobHealth(env.DB),
      loadMaintenanceHealth(env.DB, now),
      loadRecoveryHealth(env.DB, now),
      loadReleaseContractHealth(env),
    ])
    const storage = { d1: true, r2: Boolean(env.ARTIFACTS), assets: Boolean(env.ASSETS) }
    const blockers = [
      ...(!storage.r2 ? ['R2 binding unavailable'] : []),
      ...(!integrity.ok ? [`${integrity.active_orphans} active and ${integrity.quarantined_unresolved} unresolved integrity records`] : []),
      ...(!jobs.ok ? [`${jobs.failed_last_24h} recent failures, ${jobs.overdue_retries} overdue retries, ${jobs.stale_running} stale leases, ${jobs.dead_letters} dead letters`] : []),
      ...(!maintenance.ok ? ['Maintenance has never succeeded or is stale'] : []),
      ...(!recovery.ok ? ['No recent verified full recovery backup'] : []),
      ...(release.schema.missing.length ? [`Release schema missing: ${release.schema.missing.join(', ')}`] : []),
      ...(Object.entries(release.bindings).filter(([, configured]) => !configured).length ? [`Release bindings unavailable: ${Object.entries(release.bindings).filter(([, configured]) => !configured).map(([name]) => name).join(', ')}`] : []),
      ...(!release.signing_secret_configured ? ['Lite Visual receipt signing key unavailable'] : []),
    ]
    return { ok: blockers.length === 0, status: blockers.length ? 'needs_attention' : 'healthy', checked_at: checkedAt, storage, integrity, jobs, maintenance, recovery, release, blockers }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      status: 'unavailable',
      checked_at: checkedAt,
      storage: { d1: false, r2: Boolean(env.ARTIFACTS), assets: Boolean(env.ASSETS) },
      integrity: null,
      jobs: null,
      maintenance: null,
      recovery: null,
      release: null,
      blockers: [`D1 readiness check failed: ${reason}`],
    }
  }
}
