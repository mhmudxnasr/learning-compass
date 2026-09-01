import { deriveDedupKey, normalizeRating, normalizeUrlForDedup } from '../lib.ts'

export const PERSONAL_ITEM_TYPES = ['book', 'movie', 'series', 'podcast', 'course', 'game', 'album', 'other'] as const
export const PERSONAL_ITEM_STATES = ['planned', 'in_progress', 'completed', 'paused', 'dropped'] as const

export type PersonalItemType = (typeof PERSONAL_ITEM_TYPES)[number]
export type PersonalItemState = (typeof PERSONAL_ITEM_STATES)[number]

export type PersonalLibraryInput = {
  title?: unknown
  creator?: unknown
  item_type?: unknown
  state?: unknown
  branch_id?: unknown
  url?: unknown
  release_year?: unknown
  duration_minutes?: unknown
  progress_current?: unknown
  progress_total?: unknown
  progress_unit?: unknown
  rating?: unknown
  tags?: unknown
  personal_note?: unknown
}

export type NormalizedPersonalLibraryInput = {
  title: string
  creator: string
  item_type: PersonalItemType
  state: PersonalItemState
  branch_id: string
  url: string
  release_year: number | null
  duration_minutes: number | null
  progress_current: number | null
  progress_total: number | null
  progress_unit: string
  rating: number | null
  rating_label: string
  tags: string[]
  personal_note: string
}

type ValidationResult = { ok: true; value: NormalizedPersonalLibraryInput } | { ok: false; error: string }

const has = (input: PersonalLibraryInput, key: keyof PersonalLibraryInput) =>
  Object.prototype.hasOwnProperty.call(input, key)

function boundedText(value: unknown, maximum: number) {
  return String(value ?? '')
    .trim()
    .slice(0, maximum)
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function normalizeTags(value: unknown) {
  const candidates = Array.isArray(value) ? value : String(value ?? '').split(',')
  const tags = candidates.map((item) => boundedText(item, 60)).filter(Boolean)
  return [...new Set(tags)].slice(0, 20)
}

const defaultProgressUnit = (itemType: PersonalItemType) =>
  ({
    book: 'pages',
    movie: 'minutes',
    series: 'episodes',
    podcast: 'episodes',
    course: 'lessons',
    game: 'hours',
    album: 'tracks',
    other: 'items',
  })[itemType]

export function normalizePersonalLibraryInput(
  input: PersonalLibraryInput,
  fallback: Partial<NormalizedPersonalLibraryInput> = {},
): ValidationResult {
  const title = boundedText(has(input, 'title') ? input.title : fallback.title, 500)
  const creator = boundedText(has(input, 'creator') ? input.creator : fallback.creator, 300)
  const itemType = boundedText(has(input, 'item_type') ? input.item_type : fallback.item_type, 40) as PersonalItemType
  const state = boundedText(has(input, 'state') ? input.state : fallback.state || 'planned', 40) as PersonalItemState
  const branchId = boundedText(has(input, 'branch_id') ? input.branch_id : fallback.branch_id, 160)
  const rawUrl = boundedText(has(input, 'url') ? input.url : fallback.url, 2048)
  const releaseYear = nullableNumber(has(input, 'release_year') ? input.release_year : fallback.release_year)
  const duration = nullableNumber(has(input, 'duration_minutes') ? input.duration_minutes : fallback.duration_minutes)
  const progressCurrent = nullableNumber(
    has(input, 'progress_current') ? input.progress_current : fallback.progress_current,
  )
  const progressTotal = nullableNumber(has(input, 'progress_total') ? input.progress_total : fallback.progress_total)
  const rating = nullableNumber(has(input, 'rating') ? input.rating : fallback.rating)
  const tags = normalizeTags(has(input, 'tags') ? input.tags : fallback.tags || [])
  const note = boundedText(has(input, 'personal_note') ? input.personal_note : fallback.personal_note, 5000)

  if (!title) return { ok: false, error: 'title required' }
  if (!PERSONAL_ITEM_TYPES.includes(itemType)) return { ok: false, error: 'unsupported item_type' }
  if (!PERSONAL_ITEM_STATES.includes(state)) return { ok: false, error: 'unsupported state' }
  if (!branchId) return { ok: false, error: 'branch_id required' }
  if (itemType === 'book' && !creator) return { ok: false, error: 'author required for books' }
  if (rawUrl && !/^https?:\/\/[^\s<>"']+$/i.test(rawUrl))
    return { ok: false, error: 'url must be an http or https address' }
  const maximumYear = new Date().getUTCFullYear() + 5
  if (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1800 || releaseYear > maximumYear))
    return { ok: false, error: `release_year must be between 1800 and ${maximumYear}` }
  if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 1_000_000))
    return { ok: false, error: 'duration_minutes must be a non-negative integer' }
  if (progressCurrent !== null && (progressCurrent < 0 || progressCurrent > 1_000_000))
    return { ok: false, error: 'progress_current must be between 0 and 1000000' }
  if (progressTotal !== null && (progressTotal <= 0 || progressTotal > 1_000_000))
    return { ok: false, error: 'progress_total must be between 1 and 1000000' }
  if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal)
    return { ok: false, error: 'progress_current cannot exceed progress_total' }
  if (rating !== null && (rating < 0 || rating > 10)) return { ok: false, error: 'rating must be between 0 and 10' }

  const normalizedRating = normalizeRating(rating)
  const progressUnit =
    boundedText(has(input, 'progress_unit') ? input.progress_unit : fallback.progress_unit, 40) ||
    defaultProgressUnit(itemType)
  return {
    ok: true,
    value: {
      title,
      creator,
      item_type: itemType,
      state,
      branch_id: branchId,
      url: rawUrl ? normalizeUrlForDedup(rawUrl) : '',
      release_year: releaseYear,
      duration_minutes: duration,
      progress_current: progressCurrent,
      progress_total: progressTotal,
      progress_unit: progressUnit,
      rating,
      rating_label: normalizedRating.rating,
      tags,
      personal_note: note,
    },
  }
}

function keyPart(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 72) || 'untitled'
  )
}

export function personalLibraryDedupKey(
  item: Pick<NormalizedPersonalLibraryInput, 'url' | 'title' | 'creator' | 'item_type'>,
) {
  if (item.url) return deriveDedupKey({ video_url: item.url, video_title: item.title, content_type: item.item_type })
  return `personal_${item.item_type}_${keyPart(item.title)}_${keyPart(item.creator || 'unknown')}`
}

export function personalStateFromBookState(value: unknown): PersonalItemState {
  if (value === 'reading') return 'in_progress'
  if (value === 'finished') return 'completed'
  return 'planned'
}

export function bookStateFromPersonalState(value: PersonalItemState) {
  if (value === 'in_progress') return 'reading'
  if (value === 'completed') return 'finished'
  return 'saved'
}

async function verifiedBranch(DB: D1Database, branchId: string) {
  return DB.prepare(
    `SELECT n.id,n.label,n.status
    FROM tree_nodes n
    WHERE n.id=? AND n.type='branch'
      AND (n.parent_id='root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id=n.parent_id AND p.type='category'))
      AND lower(COALESCE(n.status,''))!='pruned'`,
  )
    .bind(branchId)
    .first<{ id: string; label: string; status: string }>()
}

function parseTags(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function projectPersonalItem(row: any) {
  return {
    id: String(row.recommendation_id || row.id),
    title: String(row.title || row.video_title || 'Untitled'),
    creator: String(row.creator || ''),
    item_type: String(row.item_type || row.content_type || 'other'),
    state: String(row.personal_state || row.state || 'planned'),
    branch: row.branch_id
      ? { id: row.branch_id, label: row.branch_label || row.branch_id, status: row.branch_status || 'active' }
      : null,
    branch_id: row.branch_id || null,
    url: /^https?:\/\//i.test(String(row.video_url || '')) ? row.video_url : '',
    release_year: row.release_year == null ? null : Number(row.release_year),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    progress_current:
      row.projected_progress_current == null
        ? row.progress_current == null
          ? null
          : Number(row.progress_current)
        : Number(row.projected_progress_current),
    progress_total:
      row.projected_progress_total == null
        ? row.progress_total == null
          ? null
          : Number(row.progress_total)
        : Number(row.projected_progress_total),
    progress_unit: String(row.progress_unit || ''),
    rating: row.user_score == null ? null : Number(row.user_score),
    tags: parseTags(row.tags_json),
    personal_note: String(row.personal_note || ''),
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    created_at: row.personal_created_at || row.created_at || null,
    updated_at: row.personal_updated_at || row.updated_at || null,
  }
}

const itemProjectionSql = `SELECT
  p.recommendation_id,p.item_type,p.state personal_state,p.release_year,p.duration_minutes,
  p.progress_current,p.progress_total,p.progress_unit,p.tags_json,p.personal_note,p.started_at,p.completed_at,
  p.created_at personal_created_at,p.updated_at personal_updated_at,
  r.video_title title,r.creator,r.video_url,r.user_score,r.created_at,r.updated_at,
  m.branch_id,n.label branch_label,n.status branch_status,
  CASE WHEN p.item_type='book' AND p.progress_current IS NULL
    THEN (SELECT COUNT(*) FROM book_visual_chapters bc WHERE bc.recommendation_id=p.recommendation_id AND bc.completed_at IS NOT NULL)
    ELSE p.progress_current END projected_progress_current,
  CASE WHEN p.item_type='book' AND p.progress_total IS NULL
    THEN NULLIF((SELECT COUNT(*) FROM book_visual_chapters bc WHERE bc.recommendation_id=p.recommendation_id),0)
    ELSE p.progress_total END projected_progress_total
  FROM personal_library_items p
  JOIN recommendations r ON r.id=p.recommendation_id
  LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
  LEFT JOIN tree_nodes n ON n.id=m.branch_id`

export async function loadPersonalLibraryItem(DB: D1Database, recommendationId: string) {
  const row = await DB.prepare(
    `${itemProjectionSql} WHERE p.recommendation_id=? AND r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted'`,
  )
    .bind(recommendationId)
    .first<any>()
  return row ? projectPersonalItem(row) : null
}

export async function loadPersonalLibrary(
  DB: D1Database,
  filters: { q?: string; item_type?: string; state?: string; limit?: number; offset?: number } = {},
) {
  const clauses = ['r.deleted_at IS NULL', "COALESCE(r.status,'')!='deleted'"]
  const bindings: Array<string | number> = []
  const q = String(filters.q || '').trim()
  if (q) {
    const like = `%${q}%`
    clauses.push('(r.video_title LIKE ? OR r.creator LIKE ? OR p.personal_note LIKE ? OR p.tags_json LIKE ?)')
    bindings.push(like, like, like, like)
  }
  if (filters.item_type && PERSONAL_ITEM_TYPES.includes(filters.item_type as PersonalItemType)) {
    clauses.push('p.item_type=?')
    bindings.push(filters.item_type)
  }
  if (filters.state && PERSONAL_ITEM_STATES.includes(filters.state as PersonalItemState)) {
    clauses.push('p.state=?')
    bindings.push(filters.state)
  }
  const where = ` WHERE ${clauses.join(' AND ')}`
  const limit = Math.min(Math.max(Number(filters.limit || 200), 1), 5000)
  const offset = Math.max(Number(filters.offset || 0), 0)

  const [rows, filteredCount, totals, byType, byState, byBranch, activity] = await Promise.all([
    DB.prepare(`${itemProjectionSql}${where} ORDER BY p.updated_at DESC,p.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all<any>(),
    DB.prepare(
      `SELECT COUNT(*) count FROM personal_library_items p JOIN recommendations r ON r.id=p.recommendation_id${where}`,
    )
      .bind(...bindings)
      .first<{ count: number }>(),
    DB.prepare(
      `SELECT COUNT(*) total,SUM(CASE WHEN r.user_score IS NOT NULL THEN 1 ELSE 0 END) rated,
      SUM(CASE WHEN p.progress_current IS NOT NULL OR p.progress_total IS NOT NULL THEN 1 ELSE 0 END) with_progress
      FROM personal_library_items p JOIN recommendations r ON r.id=p.recommendation_id
      WHERE r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted'`,
    ).first<any>(),
    DB.prepare(
      `SELECT p.item_type key,COUNT(*) count FROM personal_library_items p JOIN recommendations r ON r.id=p.recommendation_id
      WHERE r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted' GROUP BY p.item_type ORDER BY count DESC,p.item_type`,
    ).all<any>(),
    DB.prepare(
      `SELECT p.state key,COUNT(*) count FROM personal_library_items p JOIN recommendations r ON r.id=p.recommendation_id
      WHERE r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted' GROUP BY p.state ORDER BY count DESC,p.state`,
    ).all<any>(),
    DB.prepare(
      `SELECT m.branch_id id,COALESCE(n.label,m.branch_id,'Unmapped') label,COUNT(*) count
      FROM personal_library_items p JOIN recommendations r ON r.id=p.recommendation_id
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id
      WHERE r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted'
      GROUP BY m.branch_id,COALESCE(n.label,m.branch_id,'Unmapped') ORDER BY count DESC,label LIMIT 8`,
    ).all<any>(),
    DB.prepare(
      `SELECT substr(p.updated_at,1,7) month,COUNT(*) count FROM personal_library_items p JOIN recommendations r ON r.id=p.recommendation_id
      WHERE r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted' AND p.updated_at>=date('now','start of month','-5 months')
      GROUP BY substr(p.updated_at,1,7) ORDER BY month`,
    ).all<any>(),
  ])

  return {
    items: (rows.results || []).map(projectPersonalItem),
    total: Number(filteredCount?.count || 0),
    limit,
    offset,
    summary: {
      total: Number(totals?.total || 0),
      rated: Number(totals?.rated || 0),
      with_progress: Number(totals?.with_progress || 0),
      by_type: (byType.results || []).map((item: any) => ({ key: String(item.key), count: Number(item.count || 0) })),
      by_state: (byState.results || []).map((item: any) => ({ key: String(item.key), count: Number(item.count || 0) })),
      by_branch: (byBranch.results || []).map((item: any) => ({
        id: item.id || null,
        label: String(item.label),
        count: Number(item.count || 0),
      })),
      activity: (activity.results || []).map((item: any) => ({
        month: String(item.month),
        count: Number(item.count || 0),
      })),
    },
  }
}

export async function createPersonalLibraryItem(DB: D1Database, input: PersonalLibraryInput) {
  const normalized = normalizePersonalLibraryInput(input)
  if (!normalized.ok) return { ok: false as const, status: 400, error: normalized.error }
  const item = normalized.value
  const branch = await verifiedBranch(DB, item.branch_id)
  if (!branch) return { ok: false as const, status: 400, error: 'valid non-pruned branch_id required' }
  const id = `personal_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const url = item.url || `personal://library/${item.item_type}/${id}`
  const dedupKey = personalLibraryDedupKey({ ...item, url: item.url })
  const duplicate = await DB.prepare(
    `SELECT r.id,m.branch_id,p.recommendation_id personal_id
    FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    LEFT JOIN personal_library_items p ON p.recommendation_id=r.id
    WHERE r.dedup_key=? AND r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted'`,
  )
    .bind(dedupKey)
    .first<any>()
  if (duplicate) {
    if (duplicate.branch_id && duplicate.branch_id !== item.branch_id)
      return { ok: false as const, status: 409, error: 'branch_mapping_conflict', recommendation_id: duplicate.id }
    return {
      ok: false as const,
      status: 409,
      error: duplicate.personal_id ? 'personal_item_already_exists' : 'canonical_source_already_exists',
      recommendation_id: duplicate.id,
    }
  }

  const now = new Date().toISOString()
  const startedAt = item.state === 'in_progress' ? now : null
  const completedAt = item.state === 'completed' ? now : null
  const metadata = {
    source: 'personal_library',
    branch_mapping_confidence: 'high',
    branch_mapping_source: 'user_personal_library',
    ...(item.item_type === 'book'
      ? { book_reading_state: bookStateFromPersonalState(item.state), book_primary: 0 }
      : {}),
  }
  const eventId = `personal-library-created:${id}`
  await DB.batch([
    DB.prepare(
      `INSERT INTO recommendations
      (id,video_title,creator,content_type,video_url,branch,verified,status,user_rating,user_score,dedup_key,created_at,updated_at)
      VALUES (?,?,?,?,?,?,datetime('now'),'active',?,?,?,datetime('now'),datetime('now'))`,
    ).bind(
      id,
      item.title,
      item.creator || null,
      item.item_type,
      url,
      branch.label,
      item.rating_label,
      item.rating,
      dedupKey,
    ),
    DB.prepare(
      `INSERT INTO recommendation_meta
      (recommendation_id,learning_state,branch_id,tags_json,source_metadata_json,updated_at)
      VALUES (?,'captured',?,?,?,datetime('now'))`,
    ).bind(id, branch.id, JSON.stringify(item.tags), JSON.stringify(metadata)),
    DB.prepare(
      `INSERT INTO personal_library_items
      (recommendation_id,item_type,state,release_year,duration_minutes,progress_current,progress_total,progress_unit,tags_json,personal_note,started_at,completed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    ).bind(
      id,
      item.item_type,
      item.state,
      item.release_year,
      item.duration_minutes,
      item.progress_current,
      item.progress_total,
      item.progress_unit,
      JSON.stringify(item.tags),
      item.personal_note || null,
      startedAt,
      completedAt,
    ),
    DB.prepare(
      `INSERT INTO learning_events
      (id,idempotency_key,event_type,actor_type,evidence_weight,recommendation_id,occurred_at,payload_json)
      VALUES (?,?,'personal_library_created','user',0,?,datetime('now'),?)`,
    ).bind(
      eventId,
      eventId,
      id,
      JSON.stringify({ item_type: item.item_type, state: item.state, branch_id: branch.id }),
    ),
  ])
  try {
    await DB.prepare("INSERT OR REPLACE INTO search_idx(source,ref_id,text) VALUES ('rec',?,?)")
      .bind(id, [item.title, item.creator, item.item_type, item.tags.join(' ')].filter(Boolean).join(' '))
      .run()
  } catch {
    /* search maintenance will repair the best-effort projection */
  }
  return { ok: true as const, status: 201, item: await loadPersonalLibraryItem(DB, id) }
}

export async function updatePersonalLibraryItem(DB: D1Database, recommendationId: string, input: PersonalLibraryInput) {
  const existing = await loadPersonalLibraryItem(DB, recommendationId)
  if (!existing) return { ok: false as const, status: 404, error: 'personal item not found' }
  if (has(input, 'item_type') && String(input.item_type || '') !== existing.item_type) {
    return {
      ok: false as const,
      status: 409,
      error: 'item_type is fixed after creation; create a corrected record instead',
    }
  }
  const storedProfile = await DB.prepare(
    `SELECT progress_current,progress_total FROM personal_library_items WHERE recommendation_id=?`,
  )
    .bind(recommendationId)
    .first<{ progress_current: number | null; progress_total: number | null }>()
  const normalized = normalizePersonalLibraryInput(input, {
    title: existing.title,
    creator: existing.creator,
    item_type: existing.item_type as PersonalItemType,
    state: existing.state as PersonalItemState,
    branch_id: existing.branch_id,
    url: existing.url,
    release_year: existing.release_year,
    duration_minutes: existing.duration_minutes,
    progress_current: storedProfile?.progress_current ?? null,
    progress_total: storedProfile?.progress_total ?? null,
    progress_unit: existing.progress_unit,
    rating: existing.rating,
    tags: existing.tags,
    personal_note: existing.personal_note,
  })
  if (!normalized.ok) return { ok: false as const, status: 400, error: normalized.error }
  const item = normalized.value
  const branch = await verifiedBranch(DB, item.branch_id)
  if (!branch) return { ok: false as const, status: 400, error: 'valid non-pruned branch_id required' }

  const stored = await DB.prepare('SELECT video_url FROM recommendations WHERE id=?')
    .bind(recommendationId)
    .first<{ video_url: string }>()
  const url =
    item.url ||
    (/^personal:\/\//.test(String(stored?.video_url || ''))
      ? stored!.video_url
      : `personal://library/${item.item_type}/${recommendationId}`)
  const dedupKey = personalLibraryDedupKey({ ...item, url: item.url })
  const collision = await DB.prepare(
    `SELECT id FROM recommendations WHERE dedup_key=? AND id!=? AND deleted_at IS NULL AND COALESCE(status,'')!='deleted'`,
  )
    .bind(dedupKey, recommendationId)
    .first<{ id: string }>()
  if (collision)
    return {
      ok: false as const,
      status: 409,
      error: 'personal_item_identity_conflict',
      recommendation_id: collision.id,
    }

  const now = new Date().toISOString()
  const startedAt = item.state === 'in_progress' && !existing.started_at ? now : existing.started_at
  const completedAt = item.state === 'completed' ? existing.completed_at || now : null
  const metadata = {
    source: 'personal_library',
    branch_mapping_confidence: 'high',
    branch_mapping_source: 'user_personal_library_edit',
    preferred_source_url: item.url || null,
    ...(item.item_type === 'book'
      ? {
          book_reading_state: bookStateFromPersonalState(item.state),
          ...(item.state === 'in_progress' ? {} : { book_primary: 0 }),
        }
      : {}),
  }
  const eventId = `personal-library-updated:${recommendationId}:${crypto.randomUUID()}`
  await DB.batch([
    DB.prepare(
      `UPDATE recommendations SET video_title=?,creator=?,video_url=?,branch=?,user_rating=?,user_score=?,dedup_key=?,updated_at=datetime('now') WHERE id=?`,
    ).bind(
      item.title,
      item.creator || null,
      url,
      branch.label,
      item.rating_label,
      item.rating,
      dedupKey,
      recommendationId,
    ),
    DB.prepare(
      `UPDATE recommendation_meta SET branch_id=?,tags_json=?,source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),updated_at=datetime('now') WHERE recommendation_id=?`,
    ).bind(branch.id, JSON.stringify(item.tags), JSON.stringify(metadata), recommendationId),
    DB.prepare(`UPDATE recommendation_outcomes SET branch_id=? WHERE recommendation_id=?`).bind(
      branch.id,
      recommendationId,
    ),
    DB.prepare(
      `UPDATE personal_library_items SET state=?,release_year=?,duration_minutes=?,progress_current=?,progress_total=?,progress_unit=?,tags_json=?,personal_note=?,started_at=?,completed_at=?,updated_at=datetime('now') WHERE recommendation_id=?`,
    ).bind(
      item.state,
      item.release_year,
      item.duration_minutes,
      item.progress_current,
      item.progress_total,
      item.progress_unit,
      JSON.stringify(item.tags),
      item.personal_note || null,
      startedAt,
      completedAt,
      recommendationId,
    ),
    DB.prepare(
      `INSERT INTO learning_events
      (id,idempotency_key,event_type,actor_type,evidence_weight,recommendation_id,occurred_at,payload_json)
      VALUES (?,?,'personal_library_updated','user',0,?,datetime('now'),?)`,
    ).bind(
      eventId,
      eventId,
      recommendationId,
      JSON.stringify({
        before: { state: existing.state, branch_id: existing.branch_id, rating: existing.rating },
        after: { state: item.state, branch_id: branch.id, rating: item.rating },
      }),
    ),
  ])
  try {
    await DB.prepare("INSERT OR REPLACE INTO search_idx(source,ref_id,text) VALUES ('rec',?,?)")
      .bind(recommendationId, [item.title, item.creator, item.item_type, item.tags.join(' ')].filter(Boolean).join(' '))
      .run()
  } catch {
    /* search maintenance will repair the best-effort projection */
  }
  return { ok: true as const, status: 200, item: await loadPersonalLibraryItem(DB, recommendationId) }
}
