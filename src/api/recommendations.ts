import { Hono } from 'hono'
import { Bindings, Recommendation, VALID_STATUS, VALID_RATINGS, isValidUrl, isNonEmptyStr, safeError, normalizeRating, deriveDedupKey, normalizeUrlForDedup } from '../lib'
import { activateWaitingRun } from './discovery'
import { normalizeQualityAssurance } from '../artifact-metadata'
import { classifyRecommendationFeedback } from '../intelligence-v2'
import { recordRecommendationSignal, syncRecommendationFeedbackSignals } from '../services/intelligence-v2'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/active', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const res = await DB.prepare(
      `SELECT * FROM recommendations WHERE status = 'active' ORDER BY created_at DESC`
    ).all<Recommendation>()
    return c.json({ recommendations: res.results || [] })
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
    if (!VALID_STATUS.has(status)) return c.json({ error: 'invalid status' }, 400)
    where.push('status = ?')
    bindings.push(status)
  }
  if (contentType) {
    where.push('content_type = ?')
    bindings.push(contentType)
  }
  if (rating) {
    if (!VALID_RATINGS.has(rating)) return c.json({ error: 'invalid rating' }, 400)
    where.push('user_rating = ?')
    bindings.push(rating)
  }
  if (creator) {
    where.push('creator LIKE ?')
    bindings.push(`%${creator}%`)
  }
  if (since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return c.json({ error: 'invalid since date' }, 400)
    where.push('created_at >= ?')
    bindings.push(since)
  }
  if (source) {
    if (source !== 'feed' && source !== 'manual') return c.json({ error: 'invalid source' }, 400)
    where.push(source === 'feed'
      ? 'EXISTS (SELECT 1 FROM feed_entries fe WHERE fe.recommendation_id = recommendations.id)'
      : 'NOT EXISTS (SELECT 1 FROM feed_entries fe WHERE fe.recommendation_id = recommendations.id)')
  }
  if (q) {
    where.push('(video_title LIKE ? OR creator LIKE ? OR why_this LIKE ?)')
    const like = `%${q}%`
    bindings.push(like, like, like)
  }

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''

  try {
    const [rows, countRow] = await Promise.all([
      DB.prepare(`SELECT * FROM recommendations${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset).all<Recommendation>(),
      DB.prepare(`SELECT COUNT(*) as c FROM recommendations${whereClause}`)
        .bind(...bindings).first<{ c: number }>()
    ])
    c.header('Content-Range', `items ${offset}-${offset + (rows.results?.length || 0)}/${countRow?.c || 0}`)
    return c.json({ recommendations: rows.results, total: countRow?.c || 0, limit, offset })
  } catch (err) {
    return c.json(safeError('List failed')(err), 500)
  }
})

app.get('/books', async (c) => {
  const status = c.req.query('status')
  const allowed = new Set(['active', 'consumed', 'rejected'])
  if (status && !allowed.has(status)) return c.json({ error: 'invalid status' }, 400)
  const query = `SELECT r.*,m.learning_state,m.priority_rank,(SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads t ON t.id=ts.thread_id WHERE ts.recommendation_id=r.id AND ts.status='active' AND t.status NOT IN ('verified','abandoned') ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 1) thread_id FROM recommendations r
    LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.content_type='book' ${status ? 'AND r.status=?' : ''}
    ORDER BY r.updated_at DESC, r.created_at DESC`
  const rows = status ? await c.env.DB.prepare(query).bind(status).all<any>() : await c.env.DB.prepare(query).all<any>()
  const books = rows.results || []
  const ids = books.map((book: any) => book.id)
  const artifacts = ids.length
    ? await c.env.DB.prepare(`SELECT id,filename,media_type,metadata_json,created_at FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id') IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`).bind(...ids).all<any>()
    : { results: [] }
  const jobs = ids.length
    ? await c.env.DB.prepare(`SELECT id,job_type,status,error,payload_json,updated_at FROM agent_jobs WHERE job_type IN ('visualise_source','extract_notes') AND json_extract(payload_json,'$.recommendation_id') IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC`).bind(...ids).all<any>()
    : { results: [] }
  const visuals = new Map<string, any>()
  for (const book of books) visuals.set(book.id, { status: 'not_started', html: null, pdf: null, extraction: null, chapters: [] })
  for (const row of artifacts.results || []) {
    let metadata: any = {}
    try { metadata = JSON.parse(row.metadata_json || '{}') } catch {}
    const visual = visuals.get(metadata.recommendation_id)
    if (!visual || !['html', 'pdf'].includes(metadata.role)) continue
    const chapterKey = metadata.chapter_key || 'book'
    await c.env.DB.prepare(`INSERT OR IGNORE INTO book_visual_chapters (recommendation_id,chapter_key,chapter_title,position) VALUES (?,?,?,?)`).bind(metadata.recommendation_id, chapterKey, metadata.chapter_title || (chapterKey === 'book' ? 'Book companion' : `Chapter ${metadata.chapter_number || chapterKey}`), Number(metadata.chapter_number || 0)).run()
    const chapter = visual.chapters?.find((item: any) => item.key === chapterKey) || (() => {
      const item = { key: chapterKey, title: metadata.chapter_title || (chapterKey === 'book' ? 'Book companion' : `Chapter ${metadata.chapter_number || chapterKey}`), number: metadata.chapter_number || null, html: null, pdf: null, completed: false }
      visual.chapters = [...(visual.chapters || []), item]
      return item
    })()
    chapter[metadata.role] = { id: row.id, filename: row.filename, quality_assurance: normalizeQualityAssurance(metadata), created_at: row.created_at }
  }
  const chapterIds = ids.filter(Boolean)
  if (chapterIds.length) {
    const chapters = await c.env.DB.prepare(`SELECT recommendation_id,chapter_key,chapter_title,position,completed_at FROM book_visual_chapters WHERE recommendation_id IN (${chapterIds.map(() => '?').join(',')}) ORDER BY position,chapter_key`).bind(...chapterIds).all<any>()
    for (const row of chapters.results || []) {
      const visual = visuals.get(row.recommendation_id)
      if (!visual) continue
      let chapter = visual.chapters?.find((item: any) => item.key === row.chapter_key)
      if (!chapter) {
        chapter = { key: row.chapter_key, title: row.chapter_title, number: null, html: null, pdf: null, completed: false }
        visual.chapters = [...(visual.chapters || []), chapter]
      }
      chapter.title = row.chapter_title; chapter.position = row.position; chapter.completed = Boolean(row.completed_at); chapter.completed_at = row.completed_at
    }
  }
  for (const row of jobs.results || []) {
    let payload: any = {}
    try { payload = JSON.parse(row.payload_json || '{}') } catch {}
    const visual = visuals.get(payload.recommendation_id)
    if (!visual) continue
    if (row.job_type === 'visualise_source' && visual.status === 'not_started') visual.status = row.status
    if (row.job_type === 'extract_notes') {
      const chapter = visual.chapters?.find((item: any) => item.html?.id === payload.artifact_id)
      if (chapter) chapter.extraction = { id: row.id, status: row.status, error: row.error || null, updated_at: row.updated_at }
    }
  }
  return c.json({ books: books.map((book: any) => ({ ...book, visual: visuals.get(book.id) })) })
})

app.post('/books/:id/chapters/:chapterKey/complete', async (c) => {
  const recommendationId = c.req.param('id')
  const chapterKey = c.req.param('chapterKey')
  const exists = await c.env.DB.prepare(`SELECT 1 FROM recommendations WHERE id=? AND content_type='book'`).bind(recommendationId).first()
  if (!exists) return c.json({ error: 'book not found' }, 404)
  const chapter = await c.env.DB.prepare(`SELECT chapter_key FROM book_visual_chapters WHERE recommendation_id=? AND chapter_key=?`).bind(recommendationId, chapterKey).first()
  if (!chapter) return c.json({ error: 'chapter not found' }, 404)
  const body: { completed?: boolean } = await c.req.json<{ completed?: boolean }>().catch(() => ({} as { completed?: boolean }))
  const completed = body.completed !== false
  await c.env.DB.prepare(`UPDATE book_visual_chapters SET completed_at=?,updated_at=datetime('now') WHERE recommendation_id=? AND chapter_key=?`).bind(completed ? new Date().toISOString() : null, recommendationId, chapterKey).run()
  return c.json({ ok: true, completed })
})

app.post('/books', async (c) => {
  let body: { title?: string; author?: string; isbn?: string; url?: string; why_this?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  const title = String(body.title || '').trim()
  const author = String(body.author || '').trim()
  const isbn = String(body.isbn || '').replace(/[-\s]/g, '')
  if (!isNonEmptyStr(title, 500)) return c.json({ error: 'title required' }, 400)
  if (!isNonEmptyStr(author, 300)) return c.json({ error: 'author required' }, 400)
  if (isbn && !/^(?:\d{9}[\dX]|\d{13})$/i.test(isbn)) return c.json({ error: 'isbn must be 10 or 13 characters' }, 400)
  const url = body.url?.trim() || `https://books.google.com/books?q=${encodeURIComponent(isbn || `${title} ${author}`)}`
  if (!isValidUrl(url)) return c.json({ error: 'invalid url' }, 400)
  const slug = `${title}-${author}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
  const dedupKey = `book_${isbn || slug}`
  const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  try {
    await c.env.DB.prepare(`INSERT INTO recommendations
      (id,video_title,creator,content_type,video_url,why_this,verified,status,user_rating,dedup_key,updated_at)
      VALUES (?,?,?,?,?,?,datetime('now'),'active','unset',?,datetime('now'))
      ON CONFLICT(dedup_key) DO UPDATE SET video_title=excluded.video_title,creator=excluded.creator,video_url=excluded.video_url,why_this=excluded.why_this,updated_at=datetime('now')`)
      .bind(id, title, author, 'book', url, body.why_this?.trim() || null, dedupKey).run()
    const item = await c.env.DB.prepare('SELECT id FROM recommendations WHERE dedup_key=?').bind(dedupKey).first<{ id: string }>()
    if (!item) return c.json({ error: 'book could not be saved' }, 500)
    await c.env.DB.prepare(`INSERT OR IGNORE INTO recommendation_meta
      (recommendation_id,learning_state,source_metadata_json,updated_at) VALUES (?,'inbox',?,datetime('now'))`)
      .bind(item.id, JSON.stringify({ isbn: isbn || null, source: 'bookshelf' })).run()
    const saved = await c.env.DB.prepare(`SELECT r.*,m.learning_state FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`).bind(item.id).first<any>()
    return c.json({ ok: true, book: saved, duplicate: item.id !== id }, item.id === id ? 201 : 200)
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
            video_url = excluded.video_url,
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
      if (row) await DB.prepare(`INSERT OR IGNORE INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json,updated_at) VALUES (?,'inbox',?,datetime('now'))`).bind(row.id, JSON.stringify({ imported: true })).run()
    }

    // Incremental FTS5: index pushed recommendations immediately
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue
      const ftsDedup = deriveDedupKey({ video_url: normalizeUrlForDedup(item.video_url), video_title: item.video_title, content_type: item.content_type })
      const ftsRow = await DB.prepare(`SELECT id,video_title,creator,why_this FROM recommendations WHERE dedup_key=?`).bind(ftsDedup).first<any>()
      if (ftsRow) {
        try {
          const ftsText = [ftsRow.video_title, ftsRow.creator, ftsRow.why_this].filter(Boolean).join(' ')
          await DB.prepare("INSERT OR REPLACE INTO search_idx(source, ref_id, text) VALUES ('rec', ?, ?)").bind(ftsRow.id, ftsText).run()
        } catch { /* FTS best-effort */ }
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
        try { await scheduleResurfacing(DB, id) } catch (e) { console.warn('resurface sched failed', e) }
        try { await detectContradiction(DB, id) } catch (e) { console.warn('contradiction detect failed', e) }
        try {
          const item = await DB.prepare(`SELECT r.creator,r.content_type,m.branch_id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`).bind(id).first<any>()
          await DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,branch_id,actual_score,outcome_status,consumed_at,evaluated_at) VALUES (?,?,?,?,?,?, 'consumed', ?, datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),outcome_status='consumed',consumed_at=excluded.consumed_at,evaluated_at=datetime('now')`)
            .bind(`outcome_${id}`, id, item?.creator || null, item?.content_type || null, item?.branch_id || null, norm.score, consumedDate).run()
        } catch (e) { console.warn('quality ledger failed', e) }
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
      ])
    } else {
      await DB.prepare("UPDATE recommendations SET status='deleted',deleted_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(body.id).run()
    }
    try { await activateWaitingRun(DB) } catch {}
    return c.json({ ok: true })
  } catch (err) { return c.json(safeError('Delete failed')(err), 500) }
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

// ---------- MEMORY: spaced resurfacing ----------
// On consume, schedule three review stages (30/90/180 days). If a row already
// exists for this recommendation we leave it (don't double-schedule).
async function scheduleResurfacing(DB: any, recId: string) {
  const existing = await DB.prepare('SELECT id FROM resurfacing WHERE recommendation_id = ? AND resolved_at IS NULL LIMIT 1').bind(recId).first()
  if (existing) return
  const stages = ['30d', '90d', '180d']
  const offsets = [30, 90, 180]
  const stmts = stages.map((stage, i) =>
    DB.prepare(
      `INSERT INTO resurfacing (recommendation_id, stage, due_at, notes)
       VALUES (?, ?, date('now', '+' || ? || ' days'), ?)`
    ).bind(recId, stage, offsets[i], 'auto-scheduled on consume')
  )
  await DB.batch(stmts)
}

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
    const result = await DB.prepare('SELECT * FROM recommendations ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all<Recommendation>()
    const items = result.results || []

    if (format === 'md') {
      const header = '| Title | Creator | URL | Why | Status | Rating | Review | Tags |\n| --- | --- | --- | --- | --- | --- | --- | --- |'
      const rows = items.map(i =>
        `| ${i.video_title} | ${i.creator || ''} | ${i.video_url} | ${i.why_this || ''} | ${i.status} | ${i.user_rating || ''} | ${i.user_review || ''} | ${i.synergy_bundle_id || ''} |`
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
