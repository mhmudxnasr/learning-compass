export type ResurfacingAction = 'reviewed' | 'snooze' | 'dismissed'

export type ResurfacingScoreInput = {
  starred?: boolean
  overdueDays?: number
  presentationCount?: number
}

export function resurfacingScore(input: ResurfacingScoreInput): number {
  const starBoost = input.starred ? 100 : 0
  const overdue = Math.max(0, Number(input.overdueDays || 0))
  const frequencyDecay = 24 / (1 + Math.max(0, Number(input.presentationCount || 0)))
  return Number((starBoost + overdue + frequencyDecay).toFixed(6))
}

export function cairoDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const itemQuery = `SELECT
  r.id recommendation_id,r.video_title title,r.creator,r.content_type,r.video_url source_url,r.user_rating,r.consumed_date,
  rs.id resurfacing_id,rs.stage,rs.due_at,COALESCE(pref.starred,0) starred,
  b.id branch_id,b.label branch_label,b.status branch_status,
  d.id domain_id,d.label domain_label,
  (SELECT COUNT(*) FROM resurfacing_presentations p WHERE p.recommendation_id=r.id) presentation_count,
  (SELECT a.id FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id')=r.id AND COALESCE(json_extract(a.metadata_json,'$.publication_state'),'ready')!='staged' AND (a.media_type LIKE '%html%' OR a.filename LIKE '%.html') ORDER BY a.created_at DESC LIMIT 1) html_artifact_id,
  (SELECT a.id FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id')=r.id AND COALESCE(json_extract(a.metadata_json,'$.publication_state'),'ready')!='staged' AND (a.media_type LIKE '%pdf%' OR a.filename LIKE '%.pdf') ORDER BY a.created_at DESC LIMIT 1) pdf_artifact_id
FROM recommendations r
JOIN recommendation_meta m ON m.recommendation_id=r.id
JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
JOIN resurfacing rs ON rs.recommendation_id=r.id AND rs.resolved_at IS NULL AND rs.due_at<=?
LEFT JOIN resurfacing_preferences pref ON pref.recommendation_id=r.id
WHERE r.status='consumed' AND r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM resurfacing_presentations recent
    WHERE recent.recommendation_id=r.id AND recent.cairo_day>date(?,'-7 days') AND recent.cairo_day<?
  )`

function shapeItem(row: any, day: string, event?: any) {
  const overdueDays = Math.max(
    0,
    Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${row.due_at}T00:00:00Z`)) / 86400000),
  )
  return {
    recommendation_id: row.recommendation_id,
    resurfacing_id: row.resurfacing_id,
    title: row.title,
    creator: row.creator || null,
    content_type: row.content_type || null,
    source_url: row.source_url || null,
    user_rating: row.user_rating || null,
    consumed_date: row.consumed_date || null,
    stage: row.stage,
    due_at: row.due_at,
    starred: Boolean(row.starred),
    score: resurfacingScore({ starred: Boolean(row.starred), overdueDays, presentationCount: row.presentation_count }),
    branch: { id: row.branch_id, label: row.branch_label, status: row.branch_status },
    domain: { id: row.domain_id, label: row.domain_label },
    companions: {
      html: row.html_artifact_id ? { id: row.html_artifact_id } : null,
      pdf: row.pdf_artifact_id ? { id: row.pdf_artifact_id } : null,
    },
    presentation: event ? { id: event.id, cairo_day: event.cairo_day, action: event.action || null } : null,
  }
}

async function todayPresentation(DB: D1Database, day: string) {
  return DB.prepare(
    'SELECT id,recommendation_id,cairo_day,action FROM resurfacing_presentations WHERE cairo_day=? ORDER BY presented_at,id LIMIT 1',
  )
    .bind(day)
    .first<any>()
}

async function eligibleItem(DB: D1Database, recommendationId: string, day: string) {
  return DB.prepare(`${itemQuery} AND r.id=? ORDER BY rs.due_at,rs.id LIMIT 1`)
    .bind(day, day, day, recommendationId)
    .first<any>()
}

export async function getDailyResurfacing(DB: D1Database, options: { limit?: number; now?: Date } = {}) {
  const day = cairoDay(options.now)
  const existing = await todayPresentation(DB, day)
  if (existing) {
    if (existing.action) return { item: null, today: day }
    const row = await eligibleItem(DB, existing.recommendation_id, day)
    return { item: row ? shapeItem(row, day, existing) : null, today: day }
  }

  const limit = Math.min(Math.max(Math.floor(Number(options.limit || 5)), 1), 25)
  const rows = await DB.prepare(`${itemQuery} ORDER BY rs.due_at,rs.id,r.id LIMIT ?`)
    .bind(day, day, day, limit)
    .all<any>()
  const ranked = (rows.results || [])
    .map((row) => shapeItem(row, day))
    .sort((a, b) => b.score - a.score || String(a.recommendation_id).localeCompare(String(b.recommendation_id)))
  return { item: ranked[0] || null, today: day }
}

export async function setResurfacingPreference(DB: D1Database, recommendationId: string, starred: boolean) {
  const source = await DB.prepare(
    "SELECT id FROM recommendations WHERE id=? AND status='consumed' AND deleted_at IS NULL",
  )
    .bind(recommendationId)
    .first()
  if (!source) return null
  await DB.prepare(
    `INSERT INTO resurfacing_preferences(recommendation_id,starred,updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(recommendation_id) DO UPDATE SET starred=excluded.starred,updated_at=datetime('now')`,
  )
    .bind(recommendationId, starred ? 1 : 0)
    .run()
  return { recommendation_id: recommendationId, starred }
}

export async function createResurfacingPresentation(DB: D1Database, recommendationId: string, now = new Date()) {
  const day = cairoDay(now)
  const existing = await todayPresentation(DB, day)
  if (existing) return { ...existing, reused: true }
  if (!(await eligibleItem(DB, recommendationId, day))) return null
  const id = `resurface_${day}_${recommendationId}`
  await DB.prepare(
    `INSERT OR IGNORE INTO resurfacing_presentations(id,recommendation_id,cairo_day,presented_at) VALUES (?,?,?,?)`,
  )
    .bind(id, recommendationId, day, now.toISOString())
    .run()
  return { ...(await todayPresentation(DB, day)), reused: false }
}

export async function actOnResurfacing(DB: D1Database, eventId: string, action: ResurfacingAction) {
  const event = await DB.prepare(
    'SELECT id,recommendation_id,cairo_day,action FROM resurfacing_presentations WHERE id=?',
  )
    .bind(eventId)
    .first<any>()
  if (!event) return null
  if (event.action)
    return { id: event.id, recommendation_id: event.recommendation_id, action: event.action, reused: true }
  const due = await DB.prepare(
    "SELECT id FROM resurfacing WHERE recommendation_id=? AND resolved_at IS NULL AND due_at<=date(?,'start of day') ORDER BY due_at,id LIMIT 1",
  )
    .bind(event.recommendation_id, event.cairo_day)
    .first<any>()
  const statements: D1PreparedStatement[] = [
    DB.prepare(
      "UPDATE resurfacing_presentations SET action=?,acted_at=datetime('now') WHERE id=? AND action IS NULL",
    ).bind(action, eventId),
  ]
  if (due)
    statements.push(
      action === 'snooze'
        ? DB.prepare("UPDATE resurfacing SET due_at=date(due_at,'+7 days') WHERE id=?").bind(due.id)
        : DB.prepare("UPDATE resurfacing SET resolved_at=datetime('now') WHERE id=?").bind(due.id),
    )
  await DB.batch(statements)
  return { id: event.id, recommendation_id: event.recommendation_id, action, reused: false }
}

export async function scheduleResurfacing(DB: D1Database, recommendationId: string) {
  const existing = await DB.prepare('SELECT id FROM resurfacing WHERE recommendation_id=? LIMIT 1')
    .bind(recommendationId)
    .first()
  if (existing) return false
  await DB.batch([
    DB.prepare(
      "INSERT INTO resurfacing(recommendation_id,stage,due_at,notes) VALUES (?,'30d',date('now','+30 days'),'auto-scheduled on consume')",
    ).bind(recommendationId),
    DB.prepare(
      "INSERT INTO resurfacing(recommendation_id,stage,due_at,notes) VALUES (?,'90d',date('now','+90 days'),'auto-scheduled on consume')",
    ).bind(recommendationId),
    DB.prepare(
      "INSERT INTO resurfacing(recommendation_id,stage,due_at,notes) VALUES (?,'180d',date('now','+180 days'),'auto-scheduled on consume')",
    ).bind(recommendationId),
  ])
  return true
}

export async function backfillResurfacing(DB: D1Database) {
  const rows = await DB.prepare(
    `SELECT r.id FROM recommendations r
    JOIN recommendation_meta m ON m.recommendation_id=r.id
    JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
    JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
    WHERE r.status='consumed' AND r.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM resurfacing rs WHERE rs.recommendation_id=r.id)
    ORDER BY r.id LIMIT 100`,
  ).all<{ id: string }>()
  let created = 0
  for (const row of rows.results || []) if (await scheduleResurfacing(DB, row.id)) created += 3
  return { sources: rows.results?.length || 0, resurfacing_created: created }
}
