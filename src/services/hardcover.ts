import { redactSensitiveText, type Bindings } from '../lib.ts'
import { createPersonalLibraryItem, updatePersonalLibraryItem, type PersonalItemState } from './personal-library.ts'

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql'
const PAGE_SIZE = 100
const MAX_PAGES = 50

type JsonRecord = Record<string, any>

const ME_QUERY = `query LearningCompassHardcoverUser { me { id username } }`
const BOOKS_QUERY = `query LearningCompassHardcoverBooks($userId: Int!, $limit: Int!, $offset: Int!) {
  user_books(where: {user_id: {_eq: $userId}}, order_by: {updated_at: desc}, limit: $limit, offset: $offset) {
    id book_id edition_id status_id rating date_added last_read_date updated_at
    book { id title slug pages cached_image cached_contributors }
    user_book_reads(order_by: {id: desc}, limit: 1) { progress progress_pages }
  }
}`

function objectValue(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
  if (typeof value !== 'string' || !value.trim()) return {}
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
}

function arrayValue(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

export function normalizeHardcoverToken(token: string) {
  const clean = token.trim()
  return /^Bearer\s/i.test(clean) ? clean : `Bearer ${clean}`
}

export function hardcoverCover(value: unknown): string | null {
  const image = objectValue(value)
  const url = image.url || image.image_url || image.src
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
}

export function hardcoverAuthor(value: unknown): string | null {
  const names = arrayValue(value).map((item) => item?.author?.name || item?.contributor?.name || item?.name).filter((name) => typeof name === 'string' && name.trim())
  return names.length ? [...new Set(names)].join(', ') : null
}

async function hardcoverGraphQL<T>(token: string, query: string, variables: JsonRecord, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: { authorization: normalizeHardcoverToken(token), 'content-type': 'application/json', 'user-agent': 'Learning-Compass/1.0 (personal library sync)' },
    body: JSON.stringify({ query, variables }),
  })
  const body = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(`Hardcover request failed (${response.status})`)
  if (Array.isArray(body.errors) && body.errors.length) throw new Error(`Hardcover rejected the sync: ${redactSensitiveText(body.errors[0]?.message || 'GraphQL error', 240)}`)
  if (!body.data) throw new Error('Hardcover returned no data')
  return body.data as T
}

async function fetchPages<T>(token: string, query: string, key: string, userId: number, fetcher: typeof fetch): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await hardcoverGraphQL<JsonRecord>(token, query, { userId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }, fetcher)
    const batch = Array.isArray(data[key]) ? data[key] as T[] : []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
  throw new Error(`Hardcover sync exceeded ${MAX_PAGES * PAGE_SIZE} books`)
}

export async function fetchHardcoverSnapshot(token: string, fetcher: typeof fetch = fetch) {
  const identity = await hardcoverGraphQL<{ me?: Array<{ id: number; username?: string }> | { id: number; username?: string } }>(token, ME_QUERY, {}, fetcher)
  const me = Array.isArray(identity.me) ? identity.me[0] : identity.me
  const userId = Number(me?.id)
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('Hardcover account identity is unavailable')
  const books = await fetchPages<JsonRecord>(token, BOOKS_QUERY, 'user_books', userId, fetcher)
  return { userId, username: String(me?.username || ''), books }
}

export function hardcoverBookState(statusId: unknown): PersonalItemState {
  const status = Number(statusId)
  if (status === 2) return 'in_progress'
  if (status === 3) return 'completed'
  if (status === 4) return 'dropped'
  return 'planned'
}

export function hardcoverBookUrl(slug: unknown, id: unknown) {
  const value = String(slug || '').trim()
  return value ? `https://hardcover.app/books/${encodeURIComponent(value)}` : `https://hardcover.app/books/${encodeURIComponent(String(id))}`
}

function normalizeBookRow(row: JsonRecord) {
  const book = objectValue(row.book)
  const read = Array.isArray(row.user_book_reads) ? row.user_book_reads[0] || {} : {}
  return {
    hardcover_book_id: Number(row.book_id || book.id),
    user_book_id: Number(row.id),
    edition_id: row.edition_id == null ? null : Number(row.edition_id),
    title: String(book.title || 'Untitled book').slice(0, 500),
    author: hardcoverAuthor(book.cached_contributors),
    slug: String(book.slug || '').slice(0, 300) || null,
    cover_url: hardcoverCover(book.cached_image),
    status_id: Number(row.status_id || 1),
    rating: row.rating == null ? null : Number(row.rating),
    progress: read.progress == null ? null : Number(read.progress),
    progress_pages: read.progress_pages == null ? null : Number(read.progress_pages),
    date_added: row.date_added || null,
    last_read_date: row.last_read_date || null,
    raw_json: JSON.stringify({ pages: book.pages || null, updated_at: row.updated_at || null }),
  }
}

export async function syncHardcoverLibrary(DB: Bindings['DB'], token: string, fetcher: typeof fetch = fetch) {
  await DB.prepare(`INSERT INTO hardcover_sync_state (id,status,last_error,updated_at) VALUES ('primary','syncing',NULL,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET status='syncing',last_error=NULL,updated_at=datetime('now')`).run()
  try {
    const snapshot = await fetchHardcoverSnapshot(token, fetcher)
    const syncId = `hc_sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const rows = snapshot.books.map(normalizeBookRow)
    for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) {
      const statements = rows.slice(offset, offset + PAGE_SIZE).map((row) => DB.prepare(`INSERT INTO hardcover_books
        (hardcover_book_id,user_book_id,edition_id,title,author,slug,cover_url,status_id,rating,progress,progress_pages,date_added,last_read_date,raw_json,last_seen_sync,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(hardcover_book_id) DO UPDATE SET user_book_id=excluded.user_book_id,edition_id=excluded.edition_id,title=excluded.title,author=excluded.author,
          slug=excluded.slug,cover_url=excluded.cover_url,status_id=excluded.status_id,rating=excluded.rating,progress=excluded.progress,progress_pages=excluded.progress_pages,
          date_added=excluded.date_added,last_read_date=excluded.last_read_date,raw_json=excluded.raw_json,last_seen_sync=excluded.last_seen_sync,updated_at=datetime('now')`)
        .bind(row.hardcover_book_id,row.user_book_id,row.edition_id,row.title,row.author,row.slug,row.cover_url,row.status_id,row.rating,row.progress,row.progress_pages,row.date_added,row.last_read_date,row.raw_json,syncId))
      if (statements.length) await DB.batch(statements)
    }
    await DB.prepare(`UPDATE hardcover_sync_state SET status='ready',hardcover_user_id=?,username=?,last_sync_at=datetime('now'),last_error=NULL,book_count=?,updated_at=datetime('now') WHERE id='primary'`)
      .bind(snapshot.userId, snapshot.username || null, rows.length).run()
    return { books: rows.length, username: snapshot.username }
  } catch (error) {
    const message = error instanceof Error ? redactSensitiveText(error, 500) : 'Hardcover sync failed'
    await DB.prepare(`UPDATE hardcover_sync_state SET status='error',last_error=?,updated_at=datetime('now') WHERE id='primary'`).bind(message.slice(0, 500)).run().catch(() => undefined)
    throw error
  }
}

export async function loadHardcoverLibrary(DB: Bindings['DB'], configured = true) {
  const [state, books] = await Promise.all([
    DB.prepare(`SELECT status,username,last_sync_at,last_error,book_count,journal_count FROM hardcover_sync_state WHERE id='primary'`).first<any>(),
    DB.prepare(`SELECT b.hardcover_book_id,b.user_book_id,b.edition_id,b.title,b.author,b.slug,b.cover_url,b.status_id,b.rating,b.progress,b.progress_pages,b.date_added,b.last_read_date,b.recommendation_id,
      json_extract(b.raw_json,'$.pages') AS total_pages,
      (SELECT COUNT(*) FROM hardcover_journal_entries j WHERE j.hardcover_book_id=b.hardcover_book_id) AS journal_count
      FROM hardcover_books b ORDER BY COALESCE(b.last_read_date,b.date_added,b.updated_at) DESC,b.title`).all<any>(),
  ])
  const rows = books.results || []
  return {
    configured,
    state: state || { status: 'idle', book_count: 0, journal_count: 0 },
    books: rows.map((book: any) => ({ ...book, state: hardcoverBookState(book.status_id), imported: Boolean(book.recommendation_id), url: hardcoverBookUrl(book.slug, book.hardcover_book_id) })),
    counts: { total: rows.length, imported: rows.filter((book: any) => book.recommendation_id).length, unimported: rows.filter((book: any) => !book.recommendation_id).length },
  }
}

export async function importHardcoverBooks(DB: Bindings['DB'], branchId: string, bookIds?: number[]) {
  const rows = await DB.prepare(`SELECT b.*,json_extract(b.raw_json,'$.pages') AS total_pages FROM hardcover_books b WHERE b.recommendation_id IS NULL ${bookIds?.length ? `AND b.hardcover_book_id IN (${bookIds.map(() => '?').join(',')})` : ''} ORDER BY b.title`)
    .bind(...(bookIds?.length ? bookIds : [])).all<any>()
  let imported = 0
  const errors: Array<{ id: number; error: string }> = []
  for (const book of rows.results || []) {
    const input = {
      title: book.title,
      creator: book.author || '',
      item_type: 'book',
      state: hardcoverBookState(book.status_id),
      branch_id: branchId,
      url: hardcoverBookUrl(book.slug, book.hardcover_book_id),
      progress_current: book.progress_pages ?? book.progress,
      progress_total: book.total_pages,
      progress_unit: 'pages',
      rating: book.rating,
      tags: ['hardcover'],
      personal_note: '',
    }
    try {
      let result = await createPersonalLibraryItem(DB, input)
      if (!result.ok && result.recommendation_id) result = await updatePersonalLibraryItem(DB, result.recommendation_id, input)
      if (!result.ok) throw new Error(result.error)
      if (!result.item) throw new Error('personal item was not returned after import')
      const recommendationId = result.item.id
      await DB.batch([
        DB.prepare(`UPDATE hardcover_books SET recommendation_id=?,updated_at=datetime('now') WHERE hardcover_book_id=?`).bind(recommendationId, book.hardcover_book_id),
        DB.prepare(`UPDATE recommendation_meta SET source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?) WHERE recommendation_id=?`).bind(JSON.stringify({ hardcover_book_id: book.hardcover_book_id, hardcover_user_book_id: book.user_book_id, source: 'hardcover' }), recommendationId),
      ])
      imported += 1
    } catch (error) {
      errors.push({ id: Number(book.hardcover_book_id), error: error instanceof Error ? redactSensitiveText(error, 200) : 'import failed' })
    }
  }
  return { imported, skipped: (rows.results || []).length - imported - errors.length, errors }
}
