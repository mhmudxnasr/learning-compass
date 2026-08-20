import { Hono } from 'hono'
import type { Bindings } from '../lib'
import { syncHardcover } from '../services/hardcover'

const app = new Hono<{ Bindings: Bindings }>()
const cleanId = (value: unknown) => String(value || '').trim().slice(0, 120)

function hardcoverUrl(slug: unknown, id: unknown) {
  const value = String(slug || '').trim()
  return value ? `https://hardcover.app/books/${encodeURIComponent(value)}` : `https://hardcover.app/books/${encodeURIComponent(String(id))}`
}

app.get('/', async (c) => {
  const [state, books, entries, branches] = await Promise.all([
    c.env.DB.prepare(`SELECT status,username,last_sync_at,last_error,book_count,journal_count FROM hardcover_sync_state WHERE id='primary'`).first<any>(),
    c.env.DB.prepare(`SELECT b.*,
      (SELECT COUNT(*) FROM hardcover_journal_entries j WHERE j.hardcover_book_id=b.hardcover_book_id) journal_count,
      (SELECT COUNT(*) FROM hardcover_journal_entries j WHERE j.hardcover_book_id=b.hardcover_book_id AND j.event='quote') quote_count,
      (SELECT COUNT(*) FROM hardcover_journal_entries j WHERE j.hardcover_book_id=b.hardcover_book_id AND j.event='note') note_count,
      m.branch_id,n.label branch_label,n.round_label,n.status branch_status
      FROM hardcover_books b
      LEFT JOIN recommendation_meta m ON m.recommendation_id=b.recommendation_id
      LEFT JOIN tree_nodes n ON n.id=m.branch_id
      ORDER BY COALESCE(b.last_read_date,b.date_added,b.updated_at) DESC,b.title`).all<any>(),
    c.env.DB.prepare(`SELECT hardcover_journal_id,hardcover_book_id,event,entry,action_at,edition_id,page,total_pages,privacy_setting_id
      FROM hardcover_journal_entries ORDER BY action_at DESC LIMIT 5000`).all<any>(),
    c.env.DB.prepare(`SELECT id,label,round_label,status,super_category FROM tree_nodes
      WHERE type IN ('branch','leaf') AND COALESCE(status,'')!='pruned' ORDER BY label`).all<any>(),
  ])
  return c.json({
    configured: Boolean(c.env.HARDCOVER_API_TOKEN),
    state: state || { status: 'idle', book_count: 0, journal_count: 0 },
    books: books.results || [],
    entries: entries.results || [],
    branches: branches.results || [],
  })
})

app.post('/sync', async (c) => {
  const token = String(c.env.HARDCOVER_API_TOKEN || '').trim()
  if (!token) return c.json({ error: 'hardcover_not_configured' }, 503)
  try {
    const result = await syncHardcover(c.env.DB, token)
    return c.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hardcover sync failed'
    console.error('[hardcover-sync]', message)
    return c.json({ error: 'hardcover_sync_failed', detail: message.slice(0, 240) }, 502)
  }
})

app.post('/books/:id/import', async (c) => {
  const hardcoverBookId = Number(c.req.param('id'))
  const body = await c.req.json<any>().catch(() => ({}))
  const branchId = cleanId(body.branch_id)
  if (!Number.isInteger(hardcoverBookId) || hardcoverBookId <= 0 || !branchId) return c.json({ error: 'hardcover book and branch_id are required' }, 400)

  const [book, branch] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM hardcover_books WHERE hardcover_book_id=?').bind(hardcoverBookId).first<any>(),
    c.env.DB.prepare(`SELECT id,label,status,round_label FROM tree_nodes WHERE id=? AND type IN ('branch','leaf')`).bind(branchId).first<any>(),
  ])
  if (!book) return c.json({ error: 'hardcover book not found; sync first' }, 404)
  if (!branch) return c.json({ error: 'branch not found' }, 404)
  if (branch.status === 'pruned') return c.json({ error: 'pruned_branch_conflict' }, 409)

  const url = hardcoverUrl(book.slug, hardcoverBookId)
  const existing = await c.env.DB.prepare(`SELECT r.id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    WHERE r.deleted_at IS NULL AND (r.video_url=? OR json_extract(m.source_metadata_json,'$.hardcover_book_id')=?) LIMIT 1`).bind(url, hardcoverBookId).first<{ id: string }>()
  const recommendationId = existing?.id || `hardcover_book_${hardcoverBookId}`
  const sourceMetadata = JSON.stringify({ source: 'hardcover', hardcover_book_id: hardcoverBookId, hardcover_user_book_id: book.user_book_id, imported_at: new Date().toISOString() })

  if (existing) {
    await c.env.DB.prepare(`UPDATE recommendations SET video_title=?,creator=?,content_type='book',video_url=?,updated_at=datetime('now') WHERE id=?`)
      .bind(book.title, book.author || null, url, recommendationId).run()
  } else {
    await c.env.DB.prepare(`INSERT INTO recommendations
      (id,video_title,creator,content_type,video_url,why_this,verified,status,user_rating,dedup_key,created_at,updated_at)
      VALUES (?,?,?,'book',?,'Imported from the KOReader reading journal through Hardcover.',datetime('now'),'active','unset',?,datetime('now'),datetime('now'))`)
      .bind(recommendationId, book.title, book.author || null, url, `book_hardcover_${hardcoverBookId}`).run()
  }
  await c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,branch_id,learning_state,progress_percent,source_metadata_json,updated_at)
    VALUES (?,?, 'inbox', ?, ?, datetime('now'))
    ON CONFLICT(recommendation_id) DO UPDATE SET branch_id=excluded.branch_id,
      progress_percent=COALESCE(excluded.progress_percent,recommendation_meta.progress_percent),
      source_metadata_json=json_patch(COALESCE(recommendation_meta.source_metadata_json,'{}'),excluded.source_metadata_json),updated_at=datetime('now')`)
    .bind(recommendationId, branchId, book.progress == null ? null : Number(book.progress) * 100, sourceMetadata).run()
  await c.env.DB.prepare('UPDATE hardcover_books SET recommendation_id=?,updated_at=datetime(\'now\') WHERE hardcover_book_id=?').bind(recommendationId, hardcoverBookId).run()

  const journals = await c.env.DB.prepare(`SELECT * FROM hardcover_journal_entries WHERE hardcover_book_id=? ORDER BY action_at`).bind(hardcoverBookId).all<any>()
  let quotes = 0
  let notes = 0
  const statements: D1PreparedStatement[] = []
  for (const journal of journals.results || []) {
    const journalId = cleanId(journal.hardcover_journal_id)
    const provenance = JSON.stringify([{ source: 'hardcover', journal_id: journalId, book_id: hardcoverBookId, action_at: journal.action_at }])
    if (journal.event === 'quote') {
      quotes++
      statements.push(c.env.DB.prepare(`INSERT INTO source_annotations
        (id,recommendation_id,branch_id,locator_type,selector_json,quote,created_by,status,created_at,updated_at)
        VALUES (?,?,?,'epub',?,?,'system','active',?,datetime('now'))
        ON CONFLICT(id) DO UPDATE SET recommendation_id=excluded.recommendation_id,branch_id=excluded.branch_id,selector_json=excluded.selector_json,
          quote=excluded.quote,status='active',updated_at=datetime('now')`)
        .bind(`hardcover_annotation_${journalId}`, recommendationId, branchId, JSON.stringify({ provider: 'hardcover', journal_id: journalId, edition_id: journal.edition_id, page: journal.page, total_pages: journal.total_pages, locator: journal.page == null ? 'Hardcover journal' : `Page ${journal.page}` }), journal.entry, journal.action_at))
    } else if (journal.event === 'note') {
      notes++
      const noteId = `hardcover_note_${journalId}`
      statements.push(c.env.DB.prepare(`INSERT INTO notes
        (id,recommendation_id,title,kind,branch_id,source_url,status,revision,provenance_json,created_at,updated_at)
        VALUES (?,?,?,'reading_journal',?,?,'published',1,?,?,datetime('now'))
        ON CONFLICT(id) DO UPDATE SET recommendation_id=excluded.recommendation_id,branch_id=excluded.branch_id,source_url=excluded.source_url,
          provenance_json=excluded.provenance_json,updated_at=datetime('now')`)
        .bind(noteId, recommendationId, `${book.title} — reading note`, branchId, url, provenance, journal.action_at))
      statements.push(c.env.DB.prepare(`INSERT INTO note_sections
        (id,note_id,section_key,label,content,direction,position,updated_at)
        VALUES (?,?,'body','Reading note',?,'auto',0,datetime('now'))
        ON CONFLICT(note_id,section_key) DO UPDATE SET content=excluded.content,updated_at=datetime('now')`)
        .bind(`${noteId}_body`, noteId, journal.entry))
    }
  }
  for (let offset = 0; offset < statements.length; offset += 80) await c.env.DB.batch(statements.slice(offset, offset + 80))

  return c.json({ ok: true, recommendation_id: recommendationId, branch: { id: branch.id, label: branch.label, round: branch.round_label || 'R1' }, imported: { quotes, notes } })
})

export default app
