import type { Bindings } from '../lib'

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql'
const PAGE_SIZE = 100
const MAX_PAGES = 50

type FetchLike = typeof fetch
type JsonRecord = Record<string, any>

const ME_QUERY = `query LearningCompassHardcoverUser { me { id username } }`

const BOOKS_QUERY = `query LearningCompassHardcoverBooks($userId: Int!, $limit: Int!, $offset: Int!) {
  user_books(where: {user_id: {_eq: $userId}}, order_by: {updated_at: desc}, limit: $limit, offset: $offset) {
    id book_id edition_id status_id rating date_added last_read_date updated_at
    book { id title slug pages cached_image cached_contributors }
    user_book_reads(order_by: {id: desc}, limit: 1) { progress progress_pages }
  }
}`

const JOURNAL_QUERY = `query LearningCompassHardcoverJournal($userId: Int!, $limit: Int!, $offset: Int!) {
  reading_journals(
    where: {user_id: {_eq: $userId}, event: {_in: ["note", "quote"]}}
    order_by: {action_at: desc}
    limit: $limit
    offset: $offset
  ) {
    id book_id edition_id event entry action_at privacy_setting_id metadata updated_at
  }
}`

function objectValue(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
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
  const contributors = arrayValue(value)
  const names = contributors.map((item) => item?.author?.name || item?.contributor?.name || item?.name).filter((name) => typeof name === 'string' && name.trim())
  return names.length ? [...new Set(names)].join(', ') : null
}

export function hardcoverPosition(value: unknown): { page: number | null; totalPages: number | null } {
  const metadata = objectValue(value)
  const position = objectValue(metadata.position)
  const page = Number(position.value)
  const totalPages = Number(position.possible)
  return {
    page: Number.isFinite(page) && page >= 0 ? Math.round(page) : null,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.round(totalPages) : null,
  }
}

export function normalizeHardcoverJournalEntry(value: unknown): string {
  return String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
}

export function dedupeHardcoverJournalEntries(rows: JsonRecord[]): JsonRecord[] {
  const unique = new Map<string, JsonRecord>()
  for (const row of rows) {
    const entry = normalizeHardcoverJournalEntry(row.entry)
    if (!entry) continue
    const position = hardcoverPosition(row.metadata)
    const key = JSON.stringify([
      Number(row.book_id),
      String(row.event || ''),
      entry,
      String(row.action_at || ''),
      position.page,
      position.totalPages,
    ])
    const normalized = { ...row, entry }
    const existing = unique.get(key)
    if (!existing || String(row.id).localeCompare(String(existing.id), 'en', { numeric: true }) < 0) unique.set(key, normalized)
  }
  return [...unique.values()]
}

async function hardcoverGraphQL<T>(token: string, query: string, variables: JsonRecord, fetcher: FetchLike): Promise<T> {
  const response = await fetcher(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      authorization: normalizeHardcoverToken(token),
      'content-type': 'application/json',
      'user-agent': 'Learning-Compass/1.0 (private reading journal sync)',
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await response.json().catch(() => ({})) as any
  if (!response.ok) throw new Error(`Hardcover request failed (${response.status})`)
  if (Array.isArray(body.errors) && body.errors.length) throw new Error(`Hardcover rejected the sync: ${String(body.errors[0]?.message || 'GraphQL error').slice(0, 240)}`)
  if (!body.data) throw new Error('Hardcover returned no data')
  return body.data as T
}

async function fetchPages<T>(token: string, query: string, key: string, userId: number, fetcher: FetchLike): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await hardcoverGraphQL<JsonRecord>(token, query, { userId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }, fetcher)
    const batch = Array.isArray(data[key]) ? data[key] as T[] : []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
  throw new Error(`Hardcover sync exceeded ${MAX_PAGES * PAGE_SIZE} ${key.replace(/_/g, ' ')}`)
}

export async function fetchHardcoverSnapshot(token: string, fetcher: FetchLike = fetch) {
  const identity = await hardcoverGraphQL<{ me?: Array<{ id: number; username?: string }> | { id: number; username?: string } }>(token, ME_QUERY, {}, fetcher)
  const me = Array.isArray(identity.me) ? identity.me[0] : identity.me
  const userId = Number(me?.id)
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('Hardcover account identity is unavailable')
  const [books, journals] = await Promise.all([
    fetchPages<JsonRecord>(token, BOOKS_QUERY, 'user_books', userId, fetcher),
    fetchPages<JsonRecord>(token, JOURNAL_QUERY, 'reading_journals', userId, fetcher),
  ])
  return { userId, username: String(me?.username || ''), books, journals }
}

export async function syncHardcover(DB: Bindings['DB'], token: string, fetcher: FetchLike = fetch) {
  const syncId = `hc_sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  await DB.prepare(`INSERT INTO hardcover_sync_state (id,status,last_error,updated_at) VALUES ('primary','syncing',NULL,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET status='syncing',last_error=NULL,updated_at=datetime('now')`).run()
  try {
    const snapshot = await fetchHardcoverSnapshot(token, fetcher)
    for (let offset = 0; offset < snapshot.books.length; offset += PAGE_SIZE) {
      const statements = snapshot.books.slice(offset, offset + PAGE_SIZE).map((row) => {
        const book = objectValue(row.book)
        const latestRead = Array.isArray(row.user_book_reads) ? row.user_book_reads[0] || {} : {}
        return DB.prepare(`INSERT INTO hardcover_books
          (hardcover_book_id,user_book_id,edition_id,title,author,slug,cover_url,status_id,rating,progress,progress_pages,date_added,last_read_date,raw_json,last_seen_sync,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(hardcover_book_id) DO UPDATE SET user_book_id=excluded.user_book_id,edition_id=excluded.edition_id,title=excluded.title,
            author=excluded.author,slug=excluded.slug,cover_url=excluded.cover_url,status_id=excluded.status_id,rating=excluded.rating,
            progress=excluded.progress,progress_pages=excluded.progress_pages,date_added=excluded.date_added,last_read_date=excluded.last_read_date,
            raw_json=excluded.raw_json,last_seen_sync=excluded.last_seen_sync,updated_at=datetime('now')`)
          .bind(Number(row.book_id || book.id), Number(row.id), row.edition_id == null ? null : Number(row.edition_id), String(book.title || 'Untitled book').slice(0, 500),
            hardcoverAuthor(book.cached_contributors), String(book.slug || '').slice(0, 300) || null, hardcoverCover(book.cached_image), Number(row.status_id || 1),
            row.rating == null ? null : Number(row.rating), latestRead.progress == null ? null : Number(latestRead.progress), latestRead.progress_pages == null ? null : Number(latestRead.progress_pages),
            row.date_added || null, row.last_read_date || null, JSON.stringify({ pages: book.pages || null, updated_at: row.updated_at || null }), syncId)
      })
      if (statements.length) await DB.batch(statements)
    }

    const knownBooks = new Set(snapshot.books.map((row) => Number(row.book_id || row.book?.id)).filter(Number.isFinite))
    const journals = dedupeHardcoverJournalEntries(snapshot.journals
      .filter((row) => knownBooks.has(Number(row.book_id)) && ['note', 'quote'].includes(String(row.event))))
    for (let offset = 0; offset < journals.length; offset += PAGE_SIZE) {
      const statements = journals.slice(offset, offset + PAGE_SIZE).map((row) => {
        const position = hardcoverPosition(row.metadata)
        return DB.prepare(`INSERT INTO hardcover_journal_entries
          (hardcover_journal_id,hardcover_book_id,event,entry,action_at,edition_id,page,total_pages,privacy_setting_id,metadata_json,last_seen_sync,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(hardcover_journal_id) DO UPDATE SET hardcover_book_id=excluded.hardcover_book_id,event=excluded.event,entry=excluded.entry,
            action_at=excluded.action_at,edition_id=excluded.edition_id,page=excluded.page,total_pages=excluded.total_pages,
            privacy_setting_id=excluded.privacy_setting_id,metadata_json=excluded.metadata_json,last_seen_sync=excluded.last_seen_sync,updated_at=datetime('now')`)
          .bind(String(row.id), Number(row.book_id), String(row.event), String(row.entry).slice(0, 20000), row.action_at || new Date().toISOString(),
            row.edition_id == null ? null : Number(row.edition_id), position.page, position.totalPages, row.privacy_setting_id == null ? null : Number(row.privacy_setting_id),
            JSON.stringify(objectValue(row.metadata)), syncId)
      })
      if (statements.length) await DB.batch(statements)
    }

    await DB.batch([
      DB.prepare('DELETE FROM hardcover_journal_entries WHERE last_seen_sync!=?').bind(syncId),
      DB.prepare('DELETE FROM hardcover_books WHERE last_seen_sync!=?').bind(syncId),
      DB.prepare(`UPDATE hardcover_sync_state SET status='ready',hardcover_user_id=?,username=?,last_sync_at=datetime('now'),last_error=NULL,book_count=?,journal_count=?,updated_at=datetime('now') WHERE id='primary'`)
        .bind(snapshot.userId, snapshot.username || null, snapshot.books.length, journals.length),
    ])
    return { books: snapshot.books.length, journals: journals.length, username: snapshot.username }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hardcover sync failed'
    await DB.prepare(`UPDATE hardcover_sync_state SET status='error',last_error=?,updated_at=datetime('now') WHERE id='primary'`).bind(message.slice(0, 500)).run().catch(() => undefined)
    throw error
  }
}
