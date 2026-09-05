import { deliverScheduledReminders } from './notifications'
import type { Bindings } from '../lib'
import { syncAllFeeds } from './rss'
import { backfillResurfacing } from './resurfacing'
import { refreshScopedSourceHealth } from './source-health'

export const MAINTENANCE_CRON = '0 */6 * * *'
export const MAINTENANCE_STALE_AFTER_MS = 8 * 60 * 60 * 1000

type StepStatus = 'ok' | 'failed'
export type MaintenanceStep = {
  name: string
  status: StepStatus
  duration_ms: number
  summary?: Record<string, unknown>
  error?: string
}

export type MaintenanceReceipt = {
  ok: boolean
  trigger: string
  started_at: string
  completed_at: string
  duration_ms: number
  steps: MaintenanceStep[]
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error || 'Unknown maintenance failure')

async function step(name: string, action: () => Promise<Record<string, unknown> | void>): Promise<MaintenanceStep> {
  const started = Date.now()
  try {
    const summary = await action()
    return { name, status: 'ok', duration_ms: Date.now() - started, ...(summary ? { summary } : {}) }
  } catch (error) {
    return { name, status: 'failed', duration_ms: Date.now() - started, error: message(error).slice(0, 1000) }
  }
}

async function refreshFeeds(DB: D1Database) {
  const results = await syncAllFeeds(DB)
  const failures = results.filter((item: any) => item?.error)
  if (failures.length)
    throw new Error(
      `${failures.length} feed refresh${failures.length === 1 ? '' : 'es'} failed: ${failures.map((item: any) => item.error).join('; ')}`,
    )
  return {
    feeds: results.length,
    imported: results.reduce((sum: number, item: any) => sum + Number(item?.imported || 0), 0),
    duplicates: results.reduce((sum: number, item: any) => sum + Number(item?.duplicates || 0), 0),
  }
}

async function cleanExpired(DB: D1Database) {
  const [undo, telegram] = await DB.batch([
    DB.prepare("DELETE FROM undo_queue WHERE expires_at < datetime('now')"),
    DB.prepare("DELETE FROM telegram_updates WHERE status='completed' AND received_at < datetime('now','-30 days')"),
  ])
  return { undo_rows: Number(undo.meta?.changes || 0), telegram_receipts: Number(telegram.meta?.changes || 0) }
}

async function rebuildSearch(DB: D1Database) {
  const indexedAt = new Date().toISOString()
  await DB.batch([
    DB.prepare("DELETE FROM search_idx WHERE source IN ('rec','node','unit','note','assertion','memory','annotation')"),
    DB.prepare(
      "INSERT INTO search_idx(source,ref_id,text) SELECT 'rec',id,TRIM(COALESCE(video_title,'') || ' ' || COALESCE(creator,'') || ' ' || COALESCE(why_this,'') || ' ' || COALESCE(user_review,'')) FROM recommendations WHERE deleted_at IS NULL",
    ),
    DB.prepare(
      "INSERT INTO search_idx(source,ref_id,text) SELECT 'node',id,TRIM(COALESCE(label,'') || ' ' || COALESCE(meta_json,'')) FROM tree_nodes",
    ),
    DB.prepare(
      "INSERT INTO search_idx(source,ref_id,text) SELECT 'unit',id,TRIM(COALESCE(statement,'') || ' ' || COALESCE(user_synthesis,'')) FROM learning_units",
    ),
    DB.prepare(
      "INSERT INTO search_idx(source,ref_id,text) SELECT 'note',n.id,TRIM(COALESCE(n.title,'') || ' ' || COALESCE(GROUP_CONCAT(s.content,' '),'')) FROM notes n LEFT JOIN note_sections s ON s.note_id=n.id GROUP BY n.id",
    ),
    DB.prepare(
      "INSERT INTO search_idx(source,ref_id,text) SELECT 'assertion',assertion_key,TRIM(assertion_key || ' ' || COALESCE(value_json,'')) FROM profile_assertions WHERE status='active'",
    ),
    DB.prepare(
      "INSERT INTO search_idx(source,ref_id,text) SELECT 'memory',id,TRIM(COALESCE(memory_key,'') || ' ' || COALESCE(value_json,'')) FROM hermes_memory WHERE status IN ('active','approved')",
    ),
    DB.prepare(`INSERT INTO search_idx(source,ref_id,text)
      SELECT 'annotation',a.id,TRIM(COALESCE(a.quote,'') || ' ' || COALESCE(a.context_before,'') || ' ' || COALESCE(a.context_after,'') || ' ' || COALESCE(a.language,''))
      FROM source_annotations a
      JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
      JOIN recommendation_meta m ON m.recommendation_id=r.id AND m.branch_id=a.branch_id
      JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
      JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
      WHERE a.status='active'`),
    DB.prepare("INSERT OR REPLACE INTO kv_store(key,value) VALUES ('fts_last_sync',?)").bind(indexedAt),
  ])
  const count = await DB.prepare('SELECT COUNT(*) count FROM search_idx').first<{ count: number }>()
  return { indexed_at: indexedAt, rows: Number(count?.count || 0), strategy: 'portable_substring_projection' }
}

async function surfaceNeglectedBranches(DB: D1Database) {
  const stale = await DB.prepare(
    `
    SELECT m.branch_id,n.label,MAX(r.consumed_date) last_consumed
    FROM recommendation_meta m
    JOIN recommendations r ON r.id=m.recommendation_id
    JOIN tree_nodes n ON n.id=m.branch_id
    WHERE m.branch_id IS NOT NULL AND r.status='consumed' AND r.consumed_date IS NOT NULL AND n.status!='pruned'
    GROUP BY m.branch_id,n.label
    HAVING MAX(r.consumed_date) < date('now','-30 days')
  `,
  ).all<{ branch_id: string; label: string; last_consumed: string }>()
  let created = 0
  for (const branch of stale.results || []) {
    const candidate = await DB.prepare(
      `
      SELECT r.id FROM recommendations r
      JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE m.branch_id=? AND r.status='consumed' AND r.user_rating IN ('love','like')
      ORDER BY r.consumed_date DESC,r.id DESC LIMIT 1
    `,
    )
      .bind(branch.branch_id)
      .first<{ id: string }>()
    if (!candidate) continue
    const result = await DB.prepare(
      `
      INSERT INTO resurfacing(recommendation_id,stage,due_at,notes)
      SELECT ?,'stale',date('now'),?
      WHERE NOT EXISTS (SELECT 1 FROM resurfacing WHERE recommendation_id=? AND resolved_at IS NULL)
    `,
    )
      .bind(candidate.id, `Branch ${branch.label} has been inactive for 30 days.`, candidate.id)
      .run()
    created += Number(result.meta?.changes || 0)
  }
  return { stale_branches: stale.results?.length || 0, resurfacing_created: created }
}

async function persistReceipt(DB: D1Database, receipt: MaintenanceReceipt) {
  const id = `maintenance_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const payload = JSON.stringify(receipt)
  const statements = [
    DB.prepare(
      `INSERT INTO agent_receipts(id,request_id,agent_name,intent,target,status_code,verified,receipt_json)
      VALUES (?,?,'worker-maintenance','maintenance_run','worker-maintenance',?,?,?)`,
    ).bind(id, id, receipt.ok ? 200 : 500, receipt.ok ? 1 : 0, payload),
    DB.prepare("INSERT OR REPLACE INTO kv_store(key,value) VALUES ('maintenance_last_run',?)").bind(
      receipt.completed_at,
    ),
    DB.prepare("INSERT OR REPLACE INTO kv_store(key,value) VALUES ('maintenance_last_receipt',?)").bind(payload),
  ]
  if (receipt.ok)
    statements.push(
      DB.prepare("INSERT OR REPLACE INTO kv_store(key,value) VALUES ('maintenance_last_success',?)").bind(
        receipt.completed_at,
      ),
    )
  await DB.batch(statements)
  if (!receipt.ok) {
    const failures = receipt.steps.filter((item) => item.status === 'failed')
    const body = failures
      .map((item) => `${item.name}: ${item.error}`)
      .join('\n')
      .slice(0, 4000)
    const fingerprint = `maintenance:${receipt.completed_at.slice(0, 10)}`
    await DB.prepare(
      `INSERT INTO hermes_alerts(id,kind,severity,title,body,fingerprint)
      SELECT ?,'maintenance_failure','critical','Scheduled maintenance needs attention',?,?
      WHERE NOT EXISTS (SELECT 1 FROM hermes_alerts WHERE fingerprint=? AND acknowledged_at IS NULL)`,
    )
      .bind(`alert_${crypto.randomUUID()}`, body, fingerprint, fingerprint)
      .run()
  }
}

export async function runMaintenance(env: Bindings, trigger = 'scheduled'): Promise<MaintenanceReceipt> {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const steps = [
    await step('feeds', () => refreshFeeds(env.DB)),
    await step('reminders', () => deliverScheduledReminders(env)),
    await step('cleanup', () => cleanExpired(env.DB)),
    await step('source_health', () => refreshScopedSourceHealth(env.DB)),
    await step('search', () => rebuildSearch(env.DB)),
    await step('resurfacing', async () => {
      const backfill = await backfillResurfacing(env.DB)
      const neglected = await surfaceNeglectedBranches(env.DB)
      return { ...neglected, scheduled_rows: backfill.resurfacing_created, scheduled_sources: backfill.sources }
    }),
  ]
  const completedAt = new Date().toISOString()
  const receipt: MaintenanceReceipt = {
    ok: steps.every((item) => item.status === 'ok'),
    trigger,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Date.now() - started,
    steps,
  }
  await persistReceipt(env.DB, receipt)
  return receipt
}
