import { Hono } from 'hono'
import { Bindings, Recommendation, VALID_STATUS, VALID_RATINGS, isValidUrl, isNonEmptyStr, safeError, safeErrorMessage, normalizeRating, deriveDedupKey, normalizeSourceUrlIdentity, normalizeUrlForDedup } from '../lib'
import { activateWaitingRun } from './discovery'
import { normalizeQualityAssurance } from '../artifact-metadata'
import { classifyRecommendationFeedback } from '../intelligence-v2'
import { recordRecommendationSignal, syncRecommendationFeedbackSignals } from '../services/intelligence-v2'
import { chapterMetadataFromArtifact, projectBook } from '../services/book-projection'
import { scheduleResurfacing } from '../services/resurfacing'
import { enrichRecommendationRows } from '../services/recommendation-enrichment'
import { personalStateFromBookState } from '../services/personal-library'
import { chunkForD1 } from '../services/d1-query.ts'
import { checkAndRecordSourceHealth, loadSourceHealth } from '../services/source-health.ts'

const app = new Hono<{ Bindings: Bindings }>()

export const bookVisibilityPredicate = (alias = 'r') => `(${alias}.status IS NULL OR ${alias}.status!='deleted') AND ${alias}.deleted_at IS NULL`

app.get('/active', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const res = await DB.prepare(
      `SELECT * FROM recommendations WHERE status = 'active' ORDER BY created_at DESC`
    ).all<Recommendation>()
    const recommendations = (res.results || []).map((row: any) => { const { round: _legacyRound, ...item } = row; return item })
    return c.json({ recommendations })
  } catch (err) {
    return c.json(safeError('Active failed')(err), 500)
  }
})

app.get('/list', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const status = c.req.query('status')
  const q = c.req.query('q')
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 200)
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)
  const contentType = c.req.query('content_type')
  const rating = c.req.query('rating')
  const creator = c.req.query('creator')
  const since = c.req.query('since')
  const source = c.req.query('source')

  const where: string[] = []
  const bindings: (string | number)[] = []

  if (status) {
    if (status === 'archived') {
      where.push("recommendations.status IN ('consumed','rejected')")
    } else {
      if (!VALID_STATUS.has(status)) return c.json({ error: 'invalid status' }, 400)
      where.push('recommendations.status = ?')
      bindings.push(status)
    }
  } else {
    where.push("(recommendations.status IS NULL OR recommendations.status != 'deleted') AND recommendations.deleted_at IS NULL")
  }
  if (contentType) {
    where.push('recommendations.content_type = ?')
    bindings.push(contentType)
  }
  if (rating) {
    if (!VALID_RATINGS.has(rating)) return c.json({ error: 'invalid rating' }, 400)
    where.push('recommendations.user_rating = ?')
    bindings.push(rating)
  }
  if (creator) {
    where.push('recommendations.creator LIKE ?')
    bindings.push(`%${creator}%`)
  }
  if (since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return c.json({ error: 'invalid since date' }, 400)
    where.push('recommendations.created_at >= ?')
    bindings.push(since)
  }
  if (source) {
    if (source !== 'feed' && source !== 'manual') return c.json({ error: 'invalid source' }, 400)
    where.push(source === 'feed'
      ? 'EXISTS (SELECT 1 FROM feed_entries fe WHERE fe.recommendation_id = recommendations.id)'
      : 'NOT EXISTS (SELECT 1 FROM feed_entries fe WHERE fe.recommendation_id = recommendations.id)')
  }
  if (q) {
    where.push('(recommendations.video_title LIKE ? OR recommendations.creator LIKE ? OR recommendations.why_this LIKE ?)')
    const like = `%${q}%`
    bindings.push(like, like, like)
  }

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''

  try {
    const [rows, countRow] = await Promise.all([
      DB.prepare(`SELECT recommendations.*,
        COALESCE(n.label, recommendations.branch) branch_label,
        COALESCE(n.status, 'love') branch_status,
        n.super_category branch_domain
        FROM recommendations
        LEFT JOIN recommendation_meta m ON m.recommendation_id = recommendations.id
        LEFT JOIN tree_nodes n ON n.id = m.branch_id${whereClause} ORDER BY recommendations.created_at DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset).all<Recommendation>(),
      DB.prepare(`SELECT COUNT(*) as c FROM recommendations${whereClause}`)
        .bind(...bindings).first<{ c: number }>()
    ])
    c.header('Content-Range', `items ${offset}-${offset + (rows.results?.length || 0)}/${countRow?.c || 0}`)
    const enriched = await enrichRecommendationRows(DB, rows.results || [], true)
    const items = enriched.map((row: any) => {
      const branchLabel = row.branch_label || row.branch
      const { round: _legacyRound, round_label: _legacyRoundLabel, ...item } = row
      return {
        ...item,
        branch_label: branchLabel,
        branch: branchLabel ? {
          id: row.branch_id || branchLabel,
          label: branchLabel,
          status: row.branch_status || 'love',
          super_category: row.branch_domain || null,
        } : null,
        note: row.note_id ? { id: row.note_id, title: row.note_title || 'Field note' } : null,
        recall: { count: Number(row.recall_count || 0), due: Number(row.due_count || 0) },
        companions: { html: row.html_artifact_id ? { id: row.html_artifact_id } : null, pdf: row.pdf_artifact_id ? { id: row.pdf_artifact_id } : null },
        note_id: undefined, note_title: undefined, recall_count: undefined, due_count: undefined, html_count: undefined, pdf_count: undefined, html_artifact_id: undefined, pdf_artifact_id: undefined,
      }
    })
    return c.json({ recommendations: items, total: countRow?.c || 0, limit, offset })
  } catch (err) {
    return c.json(safeError('List failed')(err), 500)
  }
})

app.get('/books', async (c) => {
  const status = c.req.query('status')
  const allowed = new Set(['active', 'consumed', 'rejected'])
  if (status && !allowed.has(status)) return c.json({ error: 'invalid status' }, 400)
  const query = `SELECT r.*,m.learning_state,m.priority_rank,m.branch_id,m.source_metadata_json,
    n.id verified_branch_id,n.label verified_branch_label,n.status verified_branch_status,n.super_category verified_branch_domain,
    (SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads t ON t.id=ts.thread_id WHERE ts.recommendation_id=r.id AND ts.status='active' AND t.status NOT IN ('verified','abandoned') ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 1) thread_id
    FROM recommendations r
    LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    LEFT JOIN tree_nodes n ON n.id=m.branch_id AND lower(COALESCE(n.status,''))!='pruned'
    WHERE r.content_type='book' AND ${bookVisibilityPredicate('r')} ${status ? 'AND r.status=?' : ''}
    ORDER BY r.updated_at DESC, r.created_at DESC`
  const rows = status ? await c.env.DB.prepare(query).bind(status).all<any>() : await c.env.DB.prepare(query).all<any>()
  const books = rows.results || []
  const ids = books.map((book: any) => book.id)
  const placeholders = ids.map(() => '?').join(',')
  const [artifacts, jobs, canonMembershipRows, threadRows, chapterResult] = await Promise.all([
    ids.length
      ? c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,created_at FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id') IN (${placeholders}) AND COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged' ORDER BY created_at DESC,id DESC`).bind(...ids).all<any>()
      : Promise.resolve({ results: [] }),
    ids.length
      ? c.env.DB.prepare(`SELECT id,job_type,status,error,payload_json,updated_at FROM agent_jobs WHERE job_type IN ('visualise_source','extract_notes') AND json_extract(payload_json,'$.recommendation_id') IN (${placeholders}) ORDER BY updated_at DESC,id DESC`).bind(...ids).all<any>()
      : Promise.resolve({ results: [] }),
    ids.length
      ? c.env.DB.prepare(`SELECT e.recommendation_id,e.id entry_id,e.role,d.id domain_id,d.slug domain_slug,d.title domain_title,d.boundary domain_boundary
      FROM canon_entries e JOIN canon_domains d ON d.id=e.domain_id
      WHERE e.recommendation_id IN (${placeholders})
      ORDER BY d.sort_order,d.title,CASE e.role WHEN 'foundation' THEN 0 WHEN 'representative' THEN 1 ELSE 2 END`).bind(...ids).all<any>()
      : Promise.resolve({ results: [] }),
    ids.length
      ? c.env.DB.prepare(`SELECT ts.recommendation_id,t.id,t.title,t.thread_type,t.status,ts.role,ts.expected_contribution
      FROM thread_sources ts JOIN learning_threads t ON t.id=ts.thread_id
      WHERE ts.recommendation_id IN (${placeholders}) AND ts.status!='removed'
      ORDER BY CASE t.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,t.updated_at DESC,t.title`).bind(...ids).all<any>()
      : Promise.resolve({ results: [] }),
    ids.length
      ? c.env.DB.prepare(`SELECT recommendation_id,chapter_key,chapter_title,position,completed_at FROM book_visual_chapters WHERE recommendation_id IN (${placeholders}) ORDER BY position,chapter_key`).bind(...ids).all<any>()
      : Promise.resolve({ results: [] }),
  ])
  const canonMemberships = new Map<string, any[]>()
  for (const membership of canonMembershipRows.results || []) {
    const recommendationId = String(membership.recommendation_id)
    let bucket = canonMemberships.get(recommendationId)
    if (!bucket) {
      bucket = []
      canonMemberships.set(recommendationId, bucket)
    }
    bucket.push({
      entry_id: membership.entry_id,
      domain_id: membership.domain_id,
      domain_slug: membership.domain_slug,
      domain_title: membership.domain_title,
      domain_boundary: membership.domain_boundary,
      role: membership.role,
    })
  }
  const threadsByBook = new Map<string, any[]>()
  for (const thread of threadRows.results || []) {
    const recommendationId = String(thread.recommendation_id)
    let bucket = threadsByBook.get(recommendationId)
    if (!bucket) {
      bucket = []
      threadsByBook.set(recommendationId, bucket)
    }
    bucket.push({
      id: thread.id,
      title: thread.title,
      thread_type: thread.thread_type,
      status: thread.status,
      role: thread.role,
      expected_contribution: thread.expected_contribution,
    })
  }
  const artifactsByBook = new Map<string, any[]>()
  for (const row of artifacts.results || []) {
    let metadata: any = {}
    try { metadata = JSON.parse(row.metadata_json || '{}') } catch {}
    const recommendationId = String(metadata.recommendation_id || '')
    if (!recommendationId) continue
    let bucket = artifactsByBook.get(recommendationId)
    if (!bucket) {
      bucket = []
      artifactsByBook.set(recommendationId, bucket)
    }
    bucket.push({ ...row, quality_assurance: normalizeQualityAssurance(metadata) })
  }
  const chaptersByBook = new Map<string, any[]>()
  for (const row of chapterResult.results || []) {
    const recommendationId = String(row.recommendation_id)
    let bucket = chaptersByBook.get(recommendationId)
    if (!bucket) {
      bucket = []
      chaptersByBook.set(recommendationId, bucket)
    }
    bucket.push(row)
  }
  const projections = new Map<string, any>()
  for (const book of books) projections.set(String(book.id), projectBook(book, chaptersByBook.get(String(book.id)) || [], artifactsByBook.get(String(book.id)) || []))
  const primaryBookId = books.find((book: any) => {
    const projection = projections.get(String(book.id))
    return projection?.is_primary && projection?.reading_state === 'reading'
  })?.id
  for (const row of jobs.results || []) {
    let payload: any = {}
    try { payload = JSON.parse(row.payload_json || '{}') } catch {}
    const visual = projections.get(String(payload.recommendation_id))?.visual
    if (!visual) continue
    if (row.job_type === 'visualise_source' && visual.status === 'not_started') visual.status = row.status
    if (row.job_type === 'extract_notes') {
      const chapter = visual.chapters?.find((item: any) => item.html?.id === payload.artifact_id)
      if (chapter) chapter.extraction = { id: row.id, status: row.status, error: row.error || null, updated_at: row.updated_at }
    }
  }
  return c.json({
    books: books.map((book: any) => {
      const projection = projections.get(String(book.id)) || projectBook(book)
      const verified = Boolean(book.verified_branch_id)
      const branchLabel = verified ? book.verified_branch_label : String(book.branch || '').trim() || null
      const branchId = verified ? book.verified_branch_id : null
      const branchInfo = branchLabel ? {
        id: branchId,
        label: branchLabel,
        status: verified ? book.verified_branch_status : null,
        super_category: verified ? book.verified_branch_domain || null : null,
        verified,
        linkable: verified,
      } : null
      const { round: _legacyRound, verified_round_label: _legacyVerifiedRound, ...bookRecord } = book
      return {
        ...bookRecord,
        source_metadata_json: undefined,
        verified_branch_id: undefined,
        verified_branch_label: undefined,
        verified_branch_status: undefined,
        verified_branch_domain: undefined,
        ...projection,
        is_primary: String(book.id) === String(primaryBookId || ''),
        branch: branchInfo,
        branch_label: branchLabel,
        branch_status: verified ? book.verified_branch_status : null,
        canon_memberships: canonMemberships.get(String(book.id)) || [],
        threads: threadsByBook.get(String(book.id)) || [],
      }
    }),
  })
})

// Personal book reading state and the pinned reading desk are separate from Queue commitment.
app.post('/books/:id/reading-state', async (c) => {
  const recommendationId = c.req.param('id')
  const body = await c.req.json<{ state?: string; primary?: boolean }>().catch(() => ({} as { state?: string; primary?: boolean }))
  const readingState = String(body.state || '').trim().toLowerCase()
  if (!['saved', 'reading', 'finished'].includes(readingState)) return c.json({ error: 'state must be saved, reading, or finished' }, 400)
  const personalState = personalStateFromBookState(readingState)
  if (body.primary === true && readingState !== 'reading') return c.json({ error: 'the primary book must be in reading state' }, 400)
  const book = await c.env.DB.prepare(`SELECT r.id,m.learning_state FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=? AND r.content_type='book' AND ${bookVisibilityPredicate('r')} AND lower(COALESCE(n.status,''))!='pruned'`).bind(recommendationId).first<any>()
  if (!book) return c.json({ error: 'book not found' }, 404)

  const writeTarget = (includePrimary: boolean) => c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json,updated_at)
    VALUES (?,COALESCE(?,'captured'),${includePrimary ? "json_object('book_reading_state',?,'book_primary',?)" : "json_object('book_reading_state',?)"},datetime('now'))
    ON CONFLICT(recommendation_id) DO UPDATE SET
      source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),
      updated_at=datetime('now')`)
  const syncPersonalState = () => c.env.DB.prepare(`INSERT INTO personal_library_items
    (recommendation_id,item_type,state,started_at,completed_at,created_at,updated_at)
    VALUES (?,'book',?,CASE WHEN ?='in_progress' THEN datetime('now') ELSE NULL END,CASE WHEN ?='completed' THEN datetime('now') ELSE NULL END,datetime('now'),datetime('now'))
    ON CONFLICT(recommendation_id) DO UPDATE SET
      state=excluded.state,
      started_at=CASE WHEN excluded.state='in_progress' THEN COALESCE(personal_library_items.started_at,excluded.started_at) ELSE personal_library_items.started_at END,
      completed_at=CASE WHEN excluded.state='completed' THEN COALESCE(personal_library_items.completed_at,excluded.completed_at) ELSE NULL END,
      updated_at=datetime('now')`).bind(recommendationId, personalState, personalState, personalState)
  const personalEventId = `personal-library-reading-state:${recommendationId}:${crypto.randomUUID()}`
  const syncPersonalEvent = () => c.env.DB.prepare(`INSERT INTO learning_events
    (id,idempotency_key,event_type,actor_type,evidence_weight,recommendation_id,occurred_at,payload_json)
    VALUES (?,?,'personal_library_updated','user',0,?,datetime('now'),?)`)
    .bind(personalEventId, personalEventId, recommendationId, JSON.stringify({ state: personalState, book_reading_state: readingState, source: 'books_reading_state' }))

  if (body.primary === true) {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE recommendation_meta SET source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),json_object('book_primary',0)),updated_at=datetime('now')
        WHERE recommendation_id IN (SELECT id FROM recommendations WHERE content_type='book')`),
      writeTarget(true).bind(recommendationId, book.learning_state || null, readingState, 1),
      syncPersonalState(),
      syncPersonalEvent(),
    ])
  } else {
    const clearPrimary = readingState !== 'reading' || body.primary === false
    const statement = writeTarget(clearPrimary)
    await c.env.DB.batch([
      clearPrimary
        ? statement.bind(recommendationId, book.learning_state || null, readingState, 0)
        : statement.bind(recommendationId, book.learning_state || null, readingState),
      syncPersonalState(),
      syncPersonalEvent(),
    ])
  }
  return c.json({ ok: true, recommendation_id: recommendationId, reading_state: readingState, is_primary: body.primary === true, queue_state: book.learning_state || 'captured' })
})

app.post('/books/:id/chapters/:chapterKey/complete', async (c) => {
  const recommendationId = c.req.param('id')
  const chapterKey = c.req.param('chapterKey')
  const exists = await c.env.DB.prepare(`SELECT 1 FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=? AND r.content_type='book' AND ${bookVisibilityPredicate('r')} AND lower(COALESCE(n.status,''))!='pruned'`).bind(recommendationId).first()
  if (!exists) return c.json({ error: 'book not found' }, 404)
  let chapter = await c.env.DB.prepare(`SELECT chapter_key FROM book_visual_chapters WHERE recommendation_id=? AND chapter_key=?`).bind(recommendationId, chapterKey).first()
  if (!chapter) {
    const artifact = await c.env.DB.prepare(`SELECT metadata_json FROM artifacts
      WHERE json_extract(metadata_json,'$.recommendation_id')=?
        AND trim(json_extract(metadata_json,'$.chapter_key'))=?
        AND COALESCE(json_extract(metadata_json,'$.scope'),'book')='book'
        AND COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged'
        AND lower(json_extract(metadata_json,'$.role')) IN ('html','pdf')
      ORDER BY created_at DESC,id DESC LIMIT 1`).bind(recommendationId, chapterKey).first<any>()
    let metadata: Record<string, any> = {}
    try { metadata = JSON.parse(artifact?.metadata_json || '{}') } catch {}
    const last = artifact
      ? await c.env.DB.prepare(`SELECT COALESCE(MAX(position),0) position FROM book_visual_chapters WHERE recommendation_id=?`).bind(recommendationId).first<{ position: number }>()
      : null
    const derived = artifact ? chapterMetadataFromArtifact(metadata, chapterKey, Number(last?.position || 0) + 1) : null
    if (!derived) return c.json({ error: 'chapter not found' }, 404)
    await c.env.DB.prepare(`INSERT INTO book_visual_chapters (recommendation_id,chapter_key,chapter_title,position,updated_at)
      VALUES (?,?,?,?,datetime('now'))
      ON CONFLICT(recommendation_id,chapter_key) DO UPDATE SET
        chapter_title=excluded.chapter_title,position=excluded.position,updated_at=datetime('now')`)
      .bind(recommendationId, derived.key, derived.title, derived.position).run()
    chapter = { chapter_key: derived.key }
  }
  const body: { completed?: boolean } = await c.req.json<{ completed?: boolean }>().catch(() => ({} as { completed?: boolean }))
  const completed = body.completed !== false
  const personalEventId = `personal-library-chapter:${recommendationId}:${chapterKey}:${crypto.randomUUID()}`
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE book_visual_chapters SET completed_at=?,updated_at=datetime('now') WHERE recommendation_id=? AND chapter_key=?`).bind(completed ? new Date().toISOString() : null, recommendationId, chapterKey),
    c.env.DB.prepare(`UPDATE personal_library_items SET updated_at=datetime('now') WHERE recommendation_id=?`).bind(recommendationId),
    c.env.DB.prepare(`INSERT INTO learning_events
      (id,idempotency_key,event_type,actor_type,evidence_weight,recommendation_id,occurred_at,payload_json)
      VALUES (?,?,'personal_library_updated','user',0,?,datetime('now'),?)`)
      .bind(personalEventId, personalEventId, recommendationId, JSON.stringify({ chapter_key: chapterKey, completed, source: 'books_chapter_progress' })),
  ])
  return c.json({ ok: true, completed })
})

// POST /recommendations/books/:id/chapters — register chapter metadata only.
// This deliberately does not upload or create artifact records; book chapters
// remain scoped to the book shelf and the Files library stays untouched.
app.post('/books/:id/chapters', async (c) => {
  const recommendationId = c.req.param('id')
  const book = await c.env.DB.prepare(`SELECT r.id FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=? AND r.content_type='book' AND ${bookVisibilityPredicate('r')} AND lower(COALESCE(n.status,''))!='pruned'`).bind(recommendationId).first()
  if (!book) return c.json({ error: 'book not found' }, 404)
  const body = await c.req.json<{ chapters?: Array<{ key?: string; title?: string; number?: number; completed?: boolean }> }>().catch(() => ({} as { chapters?: Array<{ key?: string; title?: string; number?: number; completed?: boolean }> }))
  const chapters = Array.isArray(body.chapters) ? body.chapters : []
  if (!chapters.length || chapters.length > 100) return c.json({ error: 'chapters must contain 1 to 100 items' }, 400)
  const normalized = chapters.map((chapter, index) => ({
    key: String(chapter.key || `chapter-${index + 1}`).trim().slice(0, 120),
    title: String(chapter.title || `Chapter ${index + 1}`).trim().slice(0, 500),
    number: Number.isFinite(Number(chapter.number)) ? Number(chapter.number) : index + 1,
    completed: chapter.completed === true,
  }))
  if (normalized.some((chapter) => !chapter.key || !chapter.title)) return c.json({ error: 'each chapter needs a key and title' }, 400)
  if (normalized.some((chapter) => chapter.key.toLowerCase() === 'book' && chapter.number === 0)) return c.json({ error: 'the legacy whole-book Chapter 0 placeholder is not a valid chapter' }, 400)
  try {
    await c.env.DB.batch(normalized.map((chapter) => c.env.DB.prepare(`
      INSERT INTO book_visual_chapters (recommendation_id,chapter_key,chapter_title,position,completed_at,updated_at)
      VALUES (?,?,?,?,?,datetime('now'))
      ON CONFLICT(recommendation_id,chapter_key) DO UPDATE SET
        chapter_title=excluded.chapter_title,
        position=excluded.position,
        completed_at=CASE WHEN excluded.completed_at IS NOT NULL THEN excluded.completed_at ELSE book_visual_chapters.completed_at END,
        updated_at=datetime('now')
    `).bind(recommendationId, chapter.key, chapter.title, chapter.number, chapter.completed ? new Date().toISOString() : null)))
    const saved = await c.env.DB.prepare(`SELECT chapter_key key,chapter_title title,position,completed_at FROM book_visual_chapters WHERE recommendation_id=? ORDER BY position,chapter_key`).bind(recommendationId).all()
    return c.json({ ok: true, artifacts_created: 0, chapters: saved.results || [] })
  } catch (err) {
    return c.json(safeError('Book chapters could not be registered')(err), 500)
  }
})

app.post('/books', async (c) => {
  let body: { title?: string; author?: string; branch_id?: string; isbn?: string; url?: string; why_this?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  const title = String(body.title || '').trim()
  const author = String(body.author || '').trim()
  const branchId = String(body.branch_id || '').trim()
  const isbn = String(body.isbn || '').replace(/[-\s]/g, '')
  if (!isNonEmptyStr(title, 500)) return c.json({ error: 'title required' }, 400)
  if (!isNonEmptyStr(author, 300)) return c.json({ error: 'author required' }, 400)
  if (!branchId) return c.json({ error: 'valid non-pruned branch_id required' }, 400)
  if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) return c.json({ error: 'isbn must be 10 or 13 characters' }, 400)
  const url = body.url?.trim() || `https://books.google.com/books?q=${encodeURIComponent(isbn || `${title} ${author}`)}`
  if (!isValidUrl(url)) return c.json({ error: 'invalid url' }, 400)
  const slug = `${title}-${author}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
  const dedupKey = `book_${isbn || slug}`
  const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  try {
    const branch = await c.env.DB.prepare(`SELECT id,label,status FROM tree_nodes WHERE id=? AND type='branch' AND status!='pruned'`).bind(branchId).first<{ id: string; label: string; status: string }>()
    if (!branch) return c.json({ error: 'valid non-pruned branch_id required' }, 400)
    const existing = await c.env.DB.prepare('SELECT id,video_url FROM recommendations WHERE dedup_key=?').bind(dedupKey).first<{ id: string; video_url: string }>()
    const normalizedUrl = normalizeUrlForDedup(url)
    if (existing && body.url?.trim() && normalizeUrlForDedup(existing.video_url) !== normalizedUrl) {
      return c.json({
        error: 'source_url_replacement_required',
        message: 'This ISBN already belongs to a canonical book. Verify and replace its URL through /recommendations/:id/source-url instead of rewriting it during book upsert.',
        recommendation_id: existing.id,
        current_source_url: existing.video_url,
        replacement_endpoint: `/recommendations/${existing.id}/source-url`,
      }, 409)
    }
    const recommendationId = existing?.id || id
    const canonicalUrl = existing?.video_url || normalizedUrl
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO recommendations
        (id,video_title,creator,content_type,video_url,why_this,branch,verified,status,user_rating,dedup_key,updated_at)
        VALUES (?,?,?,?,?,?,?,datetime('now'),'active','unset',?,datetime('now'))
        ON CONFLICT(dedup_key) DO UPDATE SET video_title=excluded.video_title,creator=excluded.creator,why_this=excluded.why_this,branch=excluded.branch,updated_at=datetime('now')`)
        .bind(recommendationId, title, author, 'book', canonicalUrl, body.why_this?.trim() || null, branch.label, dedupKey),
      c.env.DB.prepare(`INSERT INTO recommendation_meta
        (recommendation_id,learning_state,branch_id,source_metadata_json,updated_at) VALUES (?,'captured',?,?,datetime('now'))
        ON CONFLICT(recommendation_id) DO UPDATE SET branch_id=excluded.branch_id,source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),updated_at=datetime('now')`)
        .bind(recommendationId, branch.id, JSON.stringify({ isbn: isbn || null, source: 'bookshelf', ...(existing ? {} : { book_reading_state: 'saved' }) })),
      c.env.DB.prepare(`INSERT INTO personal_library_items
        (recommendation_id,item_type,state,personal_note,created_at,updated_at) VALUES (?,'book','planned',?,datetime('now'),datetime('now'))
        ON CONFLICT(recommendation_id) DO UPDATE SET updated_at=personal_library_items.updated_at`)
        .bind(recommendationId, body.why_this?.trim() || null),
      c.env.DB.prepare(`INSERT OR IGNORE INTO learning_events
        (id,idempotency_key,event_type,actor_type,evidence_weight,recommendation_id,occurred_at,payload_json)
        VALUES (?,?,?,'user',0,?,datetime('now'),?)`)
        .bind(`personal-library-book:${recommendationId}`, `personal-library-book:${recommendationId}`, existing ? 'personal_library_linked' : 'personal_library_created', recommendationId, JSON.stringify({ item_type: 'book', state: 'planned', branch_id: branch.id, source: 'bookshelf' })),
    ])
    const saved = await c.env.DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,n.label branch_label,n.status branch_status FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id WHERE r.id=?`).bind(recommendationId).first<any>()
    const { round: _legacyRound, ...book } = saved || {}
    return c.json({ ok: true, book, duplicate: Boolean(existing) }, existing ? 200 : 201)
  } catch (error) { return c.json(safeError('Book save failed')(error), 500) }
})

app.post('/push', async (c) => {
  const { DB } = c.env
  let body: Partial<Recommendation> | Partial<Recommendation>[]

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const items = Array.isArray(body) ? body : [body]
  const today = new Date().toISOString().split('T')[0]
  const stmts: D1PreparedStatement[] = []
  const dedupKeys: string[] = []
  const pendingCanonicalUrls = new Map<string, { id: string; source_url: string }>()

  try {
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue
      if (!isNonEmptyStr(item.video_title, 500)) continue
      if (!isValidUrl(item.video_url)) continue
      if (item.status && !VALID_STATUS.has(item.status)) continue
      const norm = normalizeRating(item.user_rating)
      if (item.user_rating != null && item.user_rating !== '' && norm.rating === 'unset') continue

      const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const cleanUrl = normalizeUrlForDedup(item.video_url)
      const dedupItem = { ...item, video_url: cleanUrl }
      const dedupKey = deriveDedupKey(dedupItem)
      const pending = pendingCanonicalUrls.get(dedupKey)
      if (pending && normalizeSourceUrlIdentity(pending.source_url) !== normalizeSourceUrlIdentity(cleanUrl)) {
        return c.json({
          error: 'source_url_replacement_required',
          message: 'This import batch contains one canonical recommendation identity with different source URLs.',
          recommendation_id: pending.id,
          current_source_url: pending.source_url,
          replacement_endpoint: `/recommendations/${pending.id}/source-url`,
        }, 409)
      }
      const existing = await DB.prepare(`SELECT id,video_url FROM recommendations WHERE dedup_key=? LIMIT 1`)
        .bind(dedupKey).first<{ id: string; video_url: string }>()
      if (existing && normalizeSourceUrlIdentity(existing.video_url) !== normalizeSourceUrlIdentity(cleanUrl)) {
        return c.json({
          error: 'source_url_replacement_required',
          message: 'This canonical recommendation already has a different source URL. Verify and replace it through the guarded source URL endpoint.',
          recommendation_id: existing.id,
          current_source_url: existing.video_url,
          replacement_endpoint: `/recommendations/${existing.id}/source-url`,
        }, 409)
      }
      pendingCanonicalUrls.set(dedupKey, { id: existing?.id || id, source_url: existing?.video_url || cleanUrl })

      stmts.push(
        DB.prepare(
          `INSERT INTO recommendations (
            id, video_title, creator, content_type, video_url, why_this, context_brief, verified, status,
            user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(dedup_key) DO UPDATE SET
            video_title = excluded.video_title,
            creator = excluded.creator,
            content_type = excluded.content_type,
            why_this = excluded.why_this,
            context_brief = excluded.context_brief,
            verified = excluded.verified,
            status = excluded.status,
            user_rating = excluded.user_rating,
            user_score = excluded.user_score,
            user_review = excluded.user_review,
            synergy_bundle_id = excluded.synergy_bundle_id,
            consumed_date = excluded.consumed_date,
            updated_at = datetime('now')`
        ).bind(
          id,
          item.video_title,
          item.creator || null,
          item.content_type || null,
          cleanUrl,
          item.why_this || null,
          item.context_brief || null,
          item.verified || today,
          item.status || 'active',
          norm.rating,
          norm.score,
          item.user_review || null,
          dedupKey,
          item.synergy_bundle_id || null,
          item.consumed_date || null
        )
      )
      dedupKeys.push(dedupKey)
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 })
    await DB.batch(stmts)
    for (const dedupKey of dedupKeys) {
      const row = await DB.prepare(`SELECT id FROM recommendations WHERE dedup_key=?`).bind(dedupKey).first<{ id: string }>()
      if (row) await DB.prepare(`INSERT OR IGNORE INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json,updated_at) VALUES (?,'captured',?,datetime('now'))`).bind(row.id, JSON.stringify({ imported: true })).run()
    }

    // Update the portable search projection immediately.
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue
      const searchDedup = deriveDedupKey({ video_url: normalizeUrlForDedup(item.video_url), video_title: item.video_title, content_type: item.content_type })
      const searchRow = await DB.prepare(`SELECT id,video_title,creator,why_this FROM recommendations WHERE dedup_key=?`).bind(searchDedup).first<any>()
      if (searchRow) {
        try {
          const searchText = [searchRow.video_title, searchRow.creator, searchRow.why_this].filter(Boolean).join(' ')
          await DB.prepare("INSERT OR REPLACE INTO search_idx(source, ref_id, text) VALUES ('rec', ?, ?)").bind(searchRow.id, searchText).run()
        } catch { /* Search projection is best-effort; maintenance will rebuild it. */ }
      }
    }
  } catch (err) {
    return c.json(safeError('Push failed')(err), 500)
  }

  return c.json({ ok: true, count: stmts.length })
})

app.post('/action', async (c) => {
  const { DB } = c.env
  let body: {
    id?: string
    ids?: string[]
    status: 'active' | 'consumed' | 'rejected'
    user_rating?: string
    user_review?: string
    consumed_date?: string
    notebook_url?: string
    reason_code?: string
    feedback_kind?: 'bad_fit' | 'administrative' | 'not_now'
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!body.status) {
    return c.json({ error: 'status required' }, 400)
  }
  if (!VALID_STATUS.has(body.status)) {
    return c.json({ error: 'invalid status' }, 400)
  }
  if (body.status === 'rejected' && (body.feedback_kind === 'not_now' || body.reason_code === 'not_now')) {
    return c.json({ error: 'not_now is neutral and cannot reject a recommendation' }, 400)
  }
  // DATA QUALITY: consuming requires a review, but only when transitioning TO consumed
  // (moved after ids resolve, below)
  const norm = normalizeRating(body.user_rating)
  if (body.user_rating != null && String(body.user_rating) !== '' && norm.rating === 'unset') {
    return c.json({ error: 'invalid rating' }, 400)
  }
  if (body.user_review && !isNonEmptyStr(body.user_review, 5000)) {
    return c.json({ error: 'review too long' }, 400)
  }
  if (body.notebook_url != null && body.notebook_url !== '' && !isValidUrl(body.notebook_url)) {
    return c.json({ error: 'invalid notebook_url' }, 400)
  }

  const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (ids.length === 0) return c.json({ error: 'id or ids required' }, 400)
  for (const id of ids) {
    if (!isNonEmptyStr(id, 100)) return c.json({ error: 'invalid id' }, 400)
  }

  // DATA QUALITY: review required when transitioning TO consumed (not for already-consumed items)
  if (body.status === 'consumed') {
    const review = (body.user_review || '').trim()
    // only check single-id updates (batch skip for simplicity)
    const currentStatus = ids.length === 1
      ? await DB.prepare('SELECT status FROM recommendations WHERE id = ?').bind(ids[0]).first()
      : null
    const wasConsumed = currentStatus && currentStatus.status === 'consumed'
    if (!wasConsumed && review.length < 3) {
      return c.json({ error: 'A review is required to mark consumed (min 3 chars).' }, 400)
    }
  }

  const consumedDate = body.status === 'consumed'
    ? (body.consumed_date || new Date().toISOString().split('T')[0])
    : null

  try {
    const stmts = ids.map(id => DB.prepare(
      `UPDATE recommendations
       SET status = ?,
           user_rating = COALESCE(?, user_rating),
           user_score = COALESCE(?, user_score),
           user_review = COALESCE(?, user_review),
           consumed_date = COALESCE(?, consumed_date),
           notebook_url = COALESCE(?, notebook_url),
           activated_at = CASE WHEN status != 'active' AND ? = 'active' THEN datetime('now') ELSE activated_at END,
           updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      body.status,
      norm.rating === 'unset' ? null : norm.rating,
      norm.score,
      body.user_review || null,
      consumedDate,
      body.notebook_url || null,
      body.status,
      id
    ))
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50))

    // MEMORY: on consume, schedule spaced resurfaces + detect contradictions
    if (body.status === 'consumed') {
      for (const id of ids) {
        try { await scheduleResurfacing(DB, id) } catch (e) { console.warn('resurface sched failed', safeErrorMessage(e)) }
        try { await detectContradiction(DB, id) } catch (e) { console.warn('contradiction detect failed', safeErrorMessage(e)) }
        try {
          const item = await DB.prepare(`SELECT r.creator,r.content_type,m.branch_id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`).bind(id).first<any>()
          await DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,branch_id,actual_score,outcome_status,consumed_at,evaluated_at) VALUES (?,?,?,?,?,?, 'consumed', ?, datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),outcome_status='consumed',consumed_at=excluded.consumed_at,evaluated_at=datetime('now')`)
            .bind(`outcome_${id}`, id, item?.creator || null, item?.content_type || null, item?.branch_id || null, norm.score, consumedDate).run()
        } catch (e) { console.warn('quality ledger failed', safeErrorMessage(e)) }
        await syncRecommendationFeedbackSignals(DB, {
          recommendationId: id,
          sourceKey: `recommendation-action:${id}:${consumedDate}`,
          rating: norm.score,
          completed: true,
          reflection: body.user_review || null,
        })
      }
    }
    if (body.status === 'rejected') {
      for (const id of ids) {
        const explicitFit = body.feedback_kind === 'bad_fit' || Boolean(body.reason_code)
        const rejectionReason = body.reason_code || (explicitFit ? 'bad_fit' : 'administrative_exclusion')
        await DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,branch_id,outcome_status,rejection_reason,evaluated_at)
          SELECT ?,r.id,r.creator,r.content_type,m.branch_id,'rejected',?,datetime('now') FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?
          ON CONFLICT(recommendation_id) DO UPDATE SET outcome_status='rejected',rejection_reason=COALESCE(excluded.rejection_reason,recommendation_outcomes.rejection_reason),evaluated_at=datetime('now')`).bind(`outcome_${id}`, rejectionReason, id).run()
        const classified = classifyRecommendationFeedback(body.feedback_kind === 'not_now' ? 'dismissed' : 'declined', [rejectionReason])
        await recordRecommendationSignal(DB, {
          idempotencyKey: `recommendation-action:${id}:rejected:${body.reason_code || body.feedback_kind || 'administrative'}`,
          eventType: explicitFit ? classified.eventType : 'administrative_exclusion',
          recommendationId: id,
          signalScope: explicitFit ? classified.signalScope : 'none',
          reasonCode: explicitFit ? classified.reasonCodes[0] : null,
          explicit: explicitFit,
          origin: explicitFit ? 'recommendation_feedback' : 'administrative_exclusion',
          payload: { feedback_kind: body.feedback_kind || 'administrative', rejection_reason: rejectionReason },
        })
      }
    }
  } catch (err) {
    return c.json(safeError('Action failed')(err), 500)
  }

  return c.json({ ok: true, count: ids.length })
})

const loadSourceHealthTarget = (DB: D1Database, id: string) => DB.prepare(
  `SELECT id,video_title,content_type,video_url,dedup_key,status,deleted_at,updated_at
   FROM recommendations WHERE id=?`
).bind(id).first<any>()

app.get('/:id/source-health', async (c) => {
  const id = c.req.param('id')
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20'), 1), 20)
  try {
    const target = await loadSourceHealthTarget(c.env.DB, id)
    if (!target || target.status === 'deleted' || target.deleted_at) return c.json({ error: 'recommendation_not_found' }, 404)
    const ledger = await loadSourceHealth(c.env.DB, id, target.video_url, limit)
    return c.json({
      source: { id: target.id, title: target.video_title, source_url: target.video_url, status: target.status },
      ...ledger,
    })
  } catch (err) {
    return c.json(safeError('Source health read failed')(err), 500)
  }
})

app.post('/:id/source-health/check', async (c) => {
  const id = c.req.param('id')
  const body: { expected_source_url?: string } = await c.req.json<{ expected_source_url?: string }>().catch(() => ({}))
  try {
    const target = await loadSourceHealthTarget(c.env.DB, id)
    if (!target || target.status === 'deleted' || target.deleted_at) return c.json({ error: 'recommendation_not_found' }, 404)
    if (body.expected_source_url && normalizeUrlForDedup(body.expected_source_url) !== normalizeUrlForDedup(target.video_url)) {
      return c.json({ error: 'source_url_precondition_failed', source_url: target.video_url }, 409)
    }
    const health = await checkAndRecordSourceHealth(c.env.DB, id, target.video_url, 'current')
    return c.json({ ok: true, id, source_url: target.video_url, health })
  } catch (err) {
    return c.json(safeError('Source health check failed')(err), 500)
  }
})

app.post('/:id/source-url/verify', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ source_url?: string; expected_source_url?: string }>().catch(() => null)
  if (!body || !isValidUrl(body.source_url) || !isNonEmptyStr(body.expected_source_url, 2048)) return c.json({ error: 'valid source_url and expected_source_url required' }, 400)
  try {
    const target = await loadSourceHealthTarget(c.env.DB, id)
    if (!target || target.status === 'deleted' || target.deleted_at) return c.json({ error: 'recommendation_not_found' }, 404)
    if (normalizeUrlForDedup(body.expected_source_url) !== normalizeUrlForDedup(target.video_url)) {
      return c.json({ error: 'source_url_precondition_failed', source_url: target.video_url }, 409)
    }
    const sourceUrl = normalizeUrlForDedup(body.source_url)
    const verification = await checkAndRecordSourceHealth(c.env.DB, id, sourceUrl, 'replacement')
    return c.json({
      ok: true,
      id,
      current_source_url: target.video_url,
      source_url: sourceUrl,
      accepted_for_replacement: verification.status === 'verified',
      verification,
    })
  } catch (err) {
    return c.json(safeError('Source URL verification failed')(err), 500)
  }
})

app.patch('/:id/source-url', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ source_url?: string; expected_source_url?: string }>().catch(() => null)
  if (!body || !isValidUrl(body.source_url) || !isNonEmptyStr(body.expected_source_url, 2048)) return c.json({ error: 'valid source_url and expected_source_url required' }, 400)

  const sourceUrl = normalizeUrlForDedup(body.source_url)
  try {
    const target = await loadSourceHealthTarget(c.env.DB, id)
    if (!target || target.status === 'deleted' || target.deleted_at) return c.json({ error: 'recommendation_not_found' }, 404)
    if (normalizeUrlForDedup(body.expected_source_url) !== normalizeUrlForDedup(target.video_url)) {
      return c.json({ error: 'source_url_precondition_failed', source_url: target.video_url }, 409)
    }
    if (target.video_url === sourceUrl) return c.json({ ok: true, reused: true, id, previous_url: target.video_url, source_url: sourceUrl, dedup_key: target.dedup_key })

    const dedupKey = deriveDedupKey({ video_url: sourceUrl, video_title: target.video_title, content_type: target.content_type })
    const collision = await c.env.DB.prepare(`SELECT id FROM recommendations WHERE dedup_key=? AND id!=? AND deleted_at IS NULL`).bind(dedupKey, id).first<{ id: string }>()
    if (collision) return c.json({ error: 'source_url_conflict', recommendation_id: collision.id }, 409)

    // A replacement check is persisted even when it fails, but only a directly
    // reachable candidate may become canonical. Restricted/unknown responses
    // stay reviewable and never get mislabeled as dead or silently installed.
    const verification = await checkAndRecordSourceHealth(c.env.DB, id, sourceUrl, 'replacement')
    if (verification.status !== 'verified') {
      return c.json({ error: 'source_url_not_verified', id, source_url: sourceUrl, verification }, 409)
    }

    // Re-read after the network boundary, then bind the exact old identity into
    // the guarded update. The following lineage insert deliberately violates a
    // NOT NULL constraint if that update did not stamp this exact change, which
    // makes D1 roll the whole batch back instead of leaving partial lineage.
    const current = await loadSourceHealthTarget(c.env.DB, id)
    if (!current || current.video_url !== target.video_url || current.dedup_key !== target.dedup_key) {
      return c.json({ error: 'source_url_precondition_failed', source_url: current?.video_url || null }, 409)
    }

    const changedAt = new Date().toISOString()
    const replacementId = `source_replacement_${crypto.randomUUID()}`
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE recommendations SET video_url=?,dedup_key=?,updated_at=?
        WHERE id=? AND video_url=? AND dedup_key=?`).bind(sourceUrl, dedupKey, changedAt, id, target.video_url, target.dedup_key),
      c.env.DB.prepare(`INSERT INTO source_url_replacements
        (id,recommendation_id,previous_url,source_url,previous_dedup_key,source_dedup_key,
         verification_attempt_id,verification_status,verification_http_status,verification_final_url,replaced_at)
        VALUES (?,(SELECT CASE WHEN video_url=? AND dedup_key=? AND updated_at=? THEN id ELSE NULL END FROM recommendations WHERE id=?),?,?,?,?,?,'verified',?,?,?)`).bind(
        replacementId, sourceUrl, dedupKey, changedAt, id,
        target.video_url, sourceUrl, target.dedup_key, dedupKey,
        verification.attempt_id, verification.http_status ?? null, verification.final_url ?? null, changedAt,
      ),
      c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,source_metadata_json,updated_at) VALUES (?,?,datetime('now'))
        ON CONFLICT(recommendation_id) DO UPDATE SET source_metadata_json=json_set(
          COALESCE(recommendation_meta.source_metadata_json,'{}'),
          '$.preferred_source_url',?,
          '$.archive_source_url',COALESCE(json_extract(recommendation_meta.source_metadata_json,'$.archive_source_url'),?),
          '$.source_url_updated_at',?
        ),updated_at=datetime('now')`).bind(id, JSON.stringify({ preferred_source_url: sourceUrl, archive_source_url: target.video_url, source_url_updated_at: changedAt }), sourceUrl, target.video_url, changedAt),
      c.env.DB.prepare(`INSERT INTO source_health
        (recommendation_id,checked_url,status,last_checked_at,http_status,final_url,error_code,updated_at)
        VALUES (?,?,?, ?,?,?,?,datetime('now'))
        ON CONFLICT(recommendation_id) DO UPDATE SET
          checked_url=excluded.checked_url,status=excluded.status,last_checked_at=excluded.last_checked_at,
          http_status=excluded.http_status,final_url=excluded.final_url,error_code=excluded.error_code,updated_at=datetime('now')`).bind(
        id, verification.checked_url, verification.status, verification.checked_at,
        verification.http_status ?? null, verification.final_url ?? null, verification.error_code ?? null,
      ),
    ])
    return c.json({
      ok: true,
      reused: false,
      id,
      previous_url: target.video_url,
      source_url: sourceUrl,
      dedup_key: dedupKey,
      verification,
      replacement_id: replacementId,
    })
  } catch (err) {
    return c.json(safeError('Source URL replacement failed')(err), 500)
  }
})

app.patch('/content-types', async (c) => {
  const body = await c.req.json<{
    ids?: string[]
    content_type?: string
    expected_content_types?: string[]
  }>().catch(() => null)
  const ids = [...new Set((body?.ids || []).filter((id) => isNonEmptyStr(id, 100)))]
  const expectedTypes = [...new Set((body?.expected_content_types || []).filter((type) => isNonEmptyStr(type, 80)))]
  if (!body || ids.length < 1 || ids.length > 500 || ids.length !== (body.ids || []).length) {
    return c.json({ error: '1-500 unique valid ids required' }, 400)
  }
  if (body.content_type !== 'video') return c.json({ error: 'content_type must be video' }, 400)
  if (!expectedTypes.length || expectedTypes.length !== (body.expected_content_types || []).length) {
    return c.json({ error: 'expected_content_types required' }, 400)
  }

  try {
    const rowBatches = await Promise.all(chunkForD1(ids).map((batch) => c.env.DB.prepare(
      `SELECT id,video_url,content_type,status,deleted_at FROM recommendations WHERE id IN (${batch.map(() => '?').join(',')})`
    ).bind(...batch).all<any>()))
    const rows = rowBatches.flatMap((batch) => batch.results || [])
    const byId = new Map(rows.map((row: any) => [row.id, row]))
    const missing = ids.filter((id) => !byId.has(id))
    if (missing.length) return c.json({ error: 'recommendation_not_found', ids: missing }, 404)

    const unavailable = rows.filter((row: any) => row.status === 'deleted' || row.deleted_at)
    if (unavailable.length) return c.json({ error: 'recommendation_not_available', ids: unavailable.map((row: any) => row.id) }, 409)
    const unexpected = rows.filter((row: any) => !expectedTypes.includes(String(row.content_type || '')))
    if (unexpected.length) return c.json({
      error: 'content_type_precondition_failed',
      items: unexpected.map((row: any) => ({ id: row.id, content_type: row.content_type || null })),
    }, 409)
    const nonYoutube = rows.filter((row: any) => {
      try {
        const host = new URL(String(row.video_url || '')).hostname.toLowerCase().replace(/^www\./, '')
        return !['youtube.com', 'youtu.be', 'music.youtube.com'].includes(host)
      } catch { return true }
    })
    if (nonYoutube.length) return c.json({ error: 'video_type_requires_youtube_url', ids: nonYoutube.map((row: any) => row.id) }, 409)

    await c.env.DB.batch(ids.map((id) => c.env.DB.prepare(
      `UPDATE recommendations SET content_type='video',updated_at=datetime('now') WHERE id=?`
    ).bind(id)))
    return c.json({ ok: true, requested: ids.length, updated: ids.length, content_type: 'video', ids })
  } catch (err) {
    return c.json(safeError('Content type repair failed')(err), 500)
  }
})

// POST /recommendations/map — attach completed sources to an existing map node.
app.post('/map', async (c) => {
  const { DB } = c.env
  let body: { id?: string; ids?: string[]; branch_id?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (!ids.length || ids.length > 50) return c.json({ error: 'id or ids required (maximum 50)' }, 400)
  if (!isNonEmptyStr(body.branch_id, 100)) return c.json({ error: 'branch_id required' }, 400)
  if (!ids.every((id) => isNonEmptyStr(id, 100))) return c.json({ error: 'invalid id' }, 400)

  try {
    const branch = await DB.prepare("SELECT id,label,type FROM tree_nodes WHERE id=? AND type IN ('root','category','branch','leaf')").bind(body.branch_id).first<any>()
    if (!branch) return c.json({ error: 'map branch not found' }, 404)
    const sources = await DB.prepare(`SELECT id,status FROM recommendations WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<any>()
    if ((sources.results || []).length !== ids.length) return c.json({ error: 'one or more sources not found' }, 404)
    const incomplete = (sources.results || []).filter((source: any) => source.status !== 'consumed')
    if (incomplete.length) return c.json({ error: 'only completed sources can be mapped', ids: incomplete.map((source: any) => source.id) }, 409)

    const statements = ids.flatMap((id) => [
      DB.prepare(`INSERT INTO recommendation_meta (recommendation_id, learning_state, source_metadata_json) VALUES (?, 'completed', '{}') ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='completed', updated_at=datetime('now')`).bind(id),
      DB.prepare(`UPDATE recommendation_meta SET branch_id=?, updated_at=datetime('now') WHERE recommendation_id=?`).bind(body.branch_id, id),
      DB.prepare(`UPDATE recommendation_outcomes SET branch_id=? WHERE recommendation_id=?`).bind(body.branch_id, id),
    ])
    await DB.batch(statements)
    await DB.prepare(`INSERT INTO update_log (kind,summary,details_json) VALUES ('tree_change',?,?)`)
      .bind(`Mapped ${ids.length} completed source${ids.length === 1 ? '' : 's'} to ${branch.label || body.branch_id}`, JSON.stringify({ recommendation_ids: ids, branch_id: body.branch_id, source: 'hermes' })).run()
    const mapped = await DB.prepare(`SELECT r.id,r.video_title,m.branch_id FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<any>()
    return c.json({ ok: true, count: ids.length, branch, sources: mapped.results || [] })
  } catch (err) { return c.json(safeError('Map source failed')(err), 500) }
})

app.post('/delete', async (c) => {
  const { DB } = c.env
  let body: { id: string; undo?: boolean }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return c.json({ error: 'id required' }, 400)
  if (!isNonEmptyStr(body.id, 100)) return c.json({ error: 'id required' }, 400)

  try {
    if (body.undo) {
      const row = await DB.prepare('SELECT * FROM recommendations WHERE id = ?').bind(body.id).first<any>()
      if (!row) return c.json({ error: 'not found' }, 404)
      await DB.batch([
        DB.prepare("INSERT OR REPLACE INTO undo_queue (id, table_name, row_id, snapshot_json, expires_at) VALUES (?, 'recommendations', ?, ?, datetime('now', '+30 seconds'))")
          .bind(body.id, body.id, JSON.stringify(row)),
        DB.prepare("UPDATE recommendations SET status='deleted',deleted_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(body.id),
        DB.prepare("UPDATE recommendation_meta SET source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),json_object('book_primary',0)),updated_at=datetime('now') WHERE recommendation_id=?").bind(body.id),
      ])
    } else {
      await DB.batch([
        DB.prepare("UPDATE recommendations SET status='deleted',deleted_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(body.id),
        DB.prepare("UPDATE recommendation_meta SET source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),json_object('book_primary',0)),updated_at=datetime('now') WHERE recommendation_id=?").bind(body.id),
      ])
    }
    try { await activateWaitingRun(DB) } catch {}
    return c.json({ ok: true })
  } catch (err) { return c.json(safeError('Delete failed')(err), 500) }
})

// DELETE /recommendations/:id/permanent — irreversibly remove a source and its
// linked learning history/artifacts. Kept separate from the reversible archive
// action so ordinary triage cannot destroy evidence by accident.
app.delete('/:id/permanent', async (c) => {
  const { DB, ARTIFACTS } = c.env
  const recommendationId = c.req.param('id')
  if (!isNonEmptyStr(recommendationId, 100)) return c.json({ error: 'id required' }, 400)

  try {
    const recommendation = await DB.prepare('SELECT id,status FROM recommendations WHERE id=?').bind(recommendationId).first<{ id: string; status: string }>()
    if (!recommendation) return c.json({ error: 'not found' }, 404)
    if (recommendation.status === 'active') return c.json({ error: 'active sources must be archived before permanent deletion' }, 409)
    const liteVisualPair = await DB.prepare('SELECT pair_id,corpus_id,state FROM lite_visual_pairs WHERE recommendation_id=? LIMIT 1').bind(recommendationId).first<any>()
    if (liteVisualPair) return c.json({ error: 'lite_visual_pair_history_is_immutable', pair_id: liteVisualPair.pair_id, corpus_id: liteVisualPair.corpus_id, state: liteVisualPair.state }, 409)
    const legacyLiteVisualPair = await DB.prepare(`SELECT json_extract(metadata_json,'$.pair_id') pair_id,json_extract(metadata_json,'$.corpus_id') corpus_id,json_extract(metadata_json,'$.publication_state') state
      FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id')=? AND json_extract(metadata_json,'$.generator')='lite-visual'
        AND json_extract(metadata_json,'$.pair_id') IS NOT NULL LIMIT 1`).bind(recommendationId).first<any>()
    if (legacyLiteVisualPair) return c.json({ error: 'lite_visual_pair_history_is_immutable', pair_id: legacyLiteVisualPair.pair_id, corpus_id: legacyLiteVisualPair.corpus_id || null, state: legacyLiteVisualPair.state || 'legacy' }, 409)

    const artifacts = await DB.prepare(`SELECT id,r2_key FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id')=?`).bind(recommendationId).all<{ id: string; r2_key: string | null }>()

    const unitIds = await DB.prepare('SELECT id FROM learning_units WHERE recommendation_id=?').bind(recommendationId).all<{ id: string }>()
    const unitIdList = (unitIds.results || []).map((row) => row.id)
    const unitPlaceholders = unitIdList.map(() => '?').join(',')
    const statements: D1PreparedStatement[] = [
      DB.prepare('DELETE FROM feed_entries WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM collection_items WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM thread_lesson_sources WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM learning_path_sources WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM thread_sources WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM book_visual_chapters WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM compass_feedback WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM compass_picks WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM branch_evidence WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM note_sections WHERE note_id IN (SELECT id FROM notes WHERE recommendation_id=?)').bind(recommendationId),
      DB.prepare('DELETE FROM notes WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM srs_review_events WHERE card_id IN (SELECT id FROM srs_cards WHERE recommendation_id=?)').bind(recommendationId),
      DB.prepare('DELETE FROM srs_cards WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM srs_drafts WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM consolidation_steps WHERE run_id IN (SELECT id FROM consolidation_runs WHERE recommendation_id=?)').bind(recommendationId),
      DB.prepare('DELETE FROM consolidation_runs WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM source_learning_dispositions WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM learning_sessions WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM learning_events WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM learning_activity_ledger WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM recommendation_engagement WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM session_consumption_log WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM rating_events WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM recommendation_outcomes WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM resurfacing WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM memory_evidence WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare("DELETE FROM semantic_documents WHERE document_kind='recommendation' AND source_id=?").bind(recommendationId),
      DB.prepare('DELETE FROM feedback_proposals WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM agent_jobs WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare("DELETE FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id')=?").bind(recommendationId),
      DB.prepare('DELETE FROM personal_library_items WHERE recommendation_id=?').bind(recommendationId),
      DB.prepare('DELETE FROM recommendation_meta WHERE recommendation_id=?').bind(recommendationId),
    ]
    if (unitPlaceholders) {
      statements.unshift(
        DB.prepare(`DELETE FROM unit_anchors WHERE unit_id IN (${unitPlaceholders})`).bind(...unitIdList),
        DB.prepare(`DELETE FROM unit_relations WHERE source_unit_id IN (${unitPlaceholders}) OR target_unit_id IN (${unitPlaceholders})`).bind(...unitIdList, ...unitIdList),
        DB.prepare(`DELETE FROM thread_units WHERE unit_id IN (${unitPlaceholders})`).bind(...unitIdList),
        DB.prepare(`DELETE FROM unit_mastery_state WHERE unit_id IN (${unitPlaceholders})`).bind(...unitIdList),
        DB.prepare(`DELETE FROM learning_unit_revisions WHERE unit_id IN (${unitPlaceholders})`).bind(...unitIdList),
        DB.prepare(`DELETE FROM learning_units WHERE id IN (${unitPlaceholders})`).bind(...unitIdList),
      )
    }
    statements.push(DB.prepare('DELETE FROM recommendations WHERE id=?').bind(recommendationId))
    await DB.batch(statements)
    if (ARTIFACTS) {
      for (const artifact of artifacts.results || []) if (artifact.r2_key) await ARTIFACTS.delete(artifact.r2_key).catch(() => {})
    }
    return c.json({ ok: true, permanently_deleted: true, artifact_count: artifacts.results?.length || 0 })
  } catch (err) {
    return c.json(safeError('Permanent deletion failed')(err), 500)
  }
})

app.post('/undo', async (c) => {
  const { DB } = c.env
  let body: { id: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return c.json({ error: 'id required' }, 400)

  try {
    const row = await DB.prepare('SELECT * FROM undo_queue WHERE id = ? AND expires_at > datetime(\'now\')').bind(body.id).first<any>()
    if (!row) return c.json({ error: 'nothing to undo or expired' }, 404)

    if (row.table_name === 'recommendations') {
      const snap = JSON.parse(row.snapshot_json)
      await DB.prepare(`UPDATE recommendations SET status=?,deleted_at=?,updated_at=datetime('now') WHERE id=?`).bind(snap.status, snap.deleted_at || null, snap.id).run()
    }
    await DB.prepare('DELETE FROM undo_queue WHERE id = ?').bind(body.id).run()
    return c.json({ ok: true })
  } catch (err) { return c.json(safeError('Undo failed')(err), 500) }
})

// Fuzzy match a string against blacklist entries. Powers live-check in push sheet.
app.get('/check-blacklist', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const q = (c.req.query('q') || '').trim()
  if (!q || q.length < 2) return c.json({ matches: [] })
  const like = `%${q}%`
  try {
    const res = await DB.prepare(
      `SELECT id, name, work, reason, severity FROM blacklist
       WHERE name LIKE ? OR work LIKE ?
       ORDER BY severity ASC LIMIT 8`
    ).bind(like, like).all<any>()
    return c.json({ matches: res.results || [] })
  } catch (err) {
    return c.json(safeError('Blacklist check failed')(err), 500)
  }
})

// ---------- MEMORY: contradiction detection ----------
async function detectContradiction(DB: any, recId: string) {
  const me = await DB.prepare('SELECT id, dedup_key, user_rating, user_review, video_title FROM recommendations WHERE id = ?').bind(recId).first()
  if (!me || !me.dedup_key) return
  const myBranch = me.dedup_key.split('-')[0]
  if (!myBranch || myBranch === 'yt' || myBranch === 'book' || myBranch === 'key') return
  const opposite = me.user_rating === 'love' || me.user_rating === 'like'
    ? ['meh', 'dislike']
    : me.user_rating === 'dislike' || me.user_rating === 'meh'
      ? ['love', 'like']
      : []
  if (!opposite.length) return
  const others = await DB.prepare(
    `SELECT id, dedup_key, user_rating, video_title
     FROM recommendations
     WHERE status = 'consumed' AND id != ? AND user_rating IN ('love','like','meh','dislike')
       AND substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) = ?`
  ).bind(recId, myBranch).all()
  for (const o of (others.results || [])) {
    if (!opposite.includes(o.user_rating)) continue
    const tid = [me.id, o.id].sort().join('::')
    const exists = await DB.prepare('SELECT id FROM contradictions WHERE id = ?').bind(tid).first()
    if (exists) continue
    await DB.prepare(
      `INSERT OR IGNORE INTO contradictions (id, source_a, source_b, topic, tension, detected_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      tid, me.id, o.id, myBranch,
      `Consumed "${me.video_title}" as ${me.user_rating} but "${o.video_title}" as ${o.user_rating} under branch ${myBranch}.`
    ).run()
  }
}

app.get('/export', async (c) => {
  const { DB } = c.env
  const format = c.req.query('format') || 'json'
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '500'), 1), 5000)
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)
  try {
    const result = await DB.prepare(`SELECT r.*,m.branch_id,m.tags_json,n.label branch_label,
      p.item_type personal_item_type,p.state personal_state,p.release_year personal_release_year,
      p.duration_minutes personal_duration_minutes,p.progress_current personal_progress_current,
      p.progress_total personal_progress_total,p.progress_unit personal_progress_unit,
      p.tags_json personal_tags_json,p.personal_note,p.started_at personal_started_at,
      p.completed_at personal_completed_at,p.updated_at personal_updated_at
      FROM recommendations r
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      LEFT JOIN tree_nodes n ON n.id=m.branch_id
      LEFT JOIN personal_library_items p ON p.recommendation_id=r.id
      ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(limit, offset).all<any>()
    const items = (result.results || []).map((row: any) => {
      const {
        round: _legacyRound,
        personal_item_type, personal_state, personal_release_year, personal_duration_minutes,
        personal_progress_current, personal_progress_total, personal_progress_unit,
        personal_tags_json, personal_note, personal_started_at, personal_completed_at, personal_updated_at,
        ...item
      } = row
      let tags: string[] = []
      try { tags = JSON.parse(personal_tags_json || row.tags_json || '[]') } catch {}
      return {
        ...item,
        personal_library: personal_item_type ? {
          item_type: personal_item_type,
          state: personal_state,
          release_year: personal_release_year,
          duration_minutes: personal_duration_minutes,
          progress_current: personal_progress_current,
          progress_total: personal_progress_total,
          progress_unit: personal_progress_unit,
          tags,
          personal_note: personal_note || '',
          started_at: personal_started_at,
          completed_at: personal_completed_at,
          updated_at: personal_updated_at,
        } : null,
      }
    })

    if (format === 'md') {
      const cell = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
      const header = '| Title | Creator | Type | Personal state | Progress | Rating | Branch | URL | Personal note |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
      const rows = items.map((i: any) =>
        `| ${cell(i.video_title)} | ${cell(i.creator)} | ${cell(i.personal_library?.item_type || i.content_type)} | ${cell(i.personal_library?.state)} | ${cell(i.personal_library?.progress_current == null ? '' : `${i.personal_library.progress_current}${i.personal_library.progress_total == null ? '' : ` / ${i.personal_library.progress_total}`} ${i.personal_library.progress_unit || ''}`)} | ${cell(i.user_score ?? i.user_rating)} | ${cell(i.branch_label || i.branch_id)} | ${cell(/^https?:\/\//i.test(i.video_url || '') ? i.video_url : '')} | ${cell(i.personal_library?.personal_note || i.user_review)} |`
      ).join('\n')
      return new Response(header + '\n' + rows, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="learning-compass-export.md"' }
      })
    }
    return c.json({ exported_at: new Date().toISOString(), total: items.length, limit, offset, recommendations: items })
  } catch (err) {
    return c.json(safeError('Export failed')(err), 500)
  }
})

export default app
