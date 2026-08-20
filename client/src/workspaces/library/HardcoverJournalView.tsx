import { useMemo, useState } from 'preact/hooks'
import { api, formatDate } from '../../api'
import type { LibraryRecord } from './types'

const STATUS_LABELS: Record<string, string> = {
  '1': 'Want to read',
  '2': 'Reading',
  '3': 'Read',
  '4': 'Did not finish',
  '5': 'Paused',
  '6': 'Ignored',
}

function progressValue(book: LibraryRecord) {
  const raw = Number(book.progress)
  if (!Number.isFinite(raw) || raw < 0) return null
  return Math.min(100, Math.round(raw <= 1 ? raw * 100 : raw))
}

function eventLocation(entry: LibraryRecord) {
  if (entry.page == null) return 'Location not recorded'
  return entry.total_pages ? `Page ${entry.page} of ${entry.total_pages}` : `Page ${entry.page}`
}

export function HardcoverJournalView({ data, onReload }: { data: LibraryRecord; onReload: () => void }) {
  const books = Array.isArray(data.books) ? data.books : []
  const entries = Array.isArray(data.entries) ? data.entries : []
  const state = data.state || {}
  const [query, setQuery] = useState('')
  const [bookScope, setBookScope] = useState<'journaled' | 'all'>('journaled')
  const [eventFilter, setEventFilter] = useState<'all' | 'quote' | 'note'>('all')
  const [expanded, setExpanded] = useState<string | null>(() => {
    const bookIdsWithEntries = new Set(entries.map((entry: LibraryRecord) => String(entry.hardcover_book_id)))
    const firstJournaledBook = books.find((book: LibraryRecord) => bookIdsWithEntries.has(String(book.hardcover_book_id)))
    return firstJournaledBook ? String(firstJournaledBook.hardcover_book_id) : null
  })
  const [working, setWorking] = useState('')
  const [notice, setNotice] = useState('')

  const entriesByBook = useMemo(() => {
    const grouped = new Map<string, LibraryRecord[]>()
    for (const entry of entries) {
      const id = String(entry.hardcover_book_id)
      grouped.set(id, [...(grouped.get(id) || []), entry])
    }
    return grouped
  }, [entries])

  const filteredBooks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return books.filter((book: LibraryRecord) => {
      const bookEntries = entriesByBook.get(String(book.hardcover_book_id)) || []
      const matchesScope = bookScope === 'all' || bookEntries.length > 0
      const matchesType = eventFilter === 'all' || bookEntries.some((entry) => entry.event === eventFilter)
      const haystack = `${book.title || ''} ${book.author || ''} ${bookEntries.map((entry) => entry.entry).join(' ')}`.toLowerCase()
      return matchesScope && matchesType && (!needle || haystack.includes(needle))
    })
  }, [bookScope, books, entriesByBook, eventFilter, query])

  const sync = async () => {
    setWorking('sync'); setNotice('Syncing books and journal entries from Hardcover…')
    try {
      const result = await api<{ books: number; journals: number }>('/hardcover/sync', { method: 'POST', body: '{}' })
      setNotice(`Synced ${result.books} books and ${result.journals} journal entries.`)
      onReload()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Hardcover sync failed.') }
    finally { setWorking('') }
  }

  return <div class="folio-library-view hardcover-journal-view">
    <header class="hardcover-journal-hero">
      <div class="hardcover-journal-intro"><p class="folio-kicker">KOReader sync</p><h1>Your reading journal</h1><p>Your books, highlights, and notes, synced through Hardcover.</p></div>
      <div class="hardcover-sync-panel"><span class={`hardcover-sync-state is-${state.status || 'idle'}`}>{state.status === 'ready' ? 'Connected' : state.status === 'error' ? 'Needs attention' : state.status === 'syncing' ? 'Syncing' : 'Not synced'}</span><button type="button" class="folio-button folio-button-primary" onClick={sync} disabled={working === 'sync' || !data.configured}>{working === 'sync' ? 'Syncing…' : 'Sync now'}</button><small>{state.last_sync_at ? `Last sync ${formatDate(state.last_sync_at)}` : 'No completed sync yet'}</small></div>
      <section class="hardcover-ledger-strip" aria-label="Reading journal totals">
        <div><strong>{books.length}</strong><span>Books</span></div><div><strong>{entries.filter((entry: LibraryRecord) => entry.event === 'quote').length}</strong><span>Highlights</span></div><div><strong>{entries.filter((entry: LibraryRecord) => entry.event === 'note').length}</strong><span>Notes</span></div><div><strong>{books.filter((book: LibraryRecord) => entriesByBook.has(String(book.hardcover_book_id))).length}</strong><span>Journaled</span></div>
      </section>
    </header>

    {!data.configured && <section class="hardcover-setup-state" role="status"><strong>Hardcover is not connected.</strong><p>Add the API token as the Worker secret <code>HARDCOVER_API_TOKEN</code>. The token never enters browser storage.</p></section>}
    {state.last_error && <p class="folio-action-status hardcover-error" role="alert">{state.last_error}</p>}
    {notice && <output class="folio-action-status" aria-live="polite">{notice}</output>}

    <div class="hardcover-journal-tools">
      <label><span>Search journal</span><input type="search" value={query} onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)} placeholder="Book, author, or passage" /></label>
      <div class="hardcover-filter-groups">
        <div class="folio-filter-row" role="group" aria-label="Books shown"><span>Books</span>{(['journaled', 'all'] as const).map((value) => <button type="button" class={bookScope === value ? 'active' : ''} aria-pressed={bookScope === value} onClick={() => setBookScope(value)} key={value}>{value === 'journaled' ? 'With entries' : 'All books'}</button>)}</div>
        <div class="folio-filter-row" role="group" aria-label="Journal entry type"><span>Entries</span>{(['all', 'quote', 'note'] as const).map((value) => <button type="button" class={eventFilter === value ? 'active' : ''} aria-pressed={eventFilter === value} onClick={() => setEventFilter(value)} key={value}>{value === 'all' ? 'All' : value === 'quote' ? 'Highlights' : 'Notes'}</button>)}</div>
      </div>
    </div>

    {filteredBooks.length ? <div class="hardcover-book-ledger">{filteredBooks.map((book: LibraryRecord) => {
      const id = String(book.hardcover_book_id)
      const bookEntries = (entriesByBook.get(id) || []).filter((entry) => eventFilter === 'all' || entry.event === eventFilter)
      const isExpanded = expanded === id
      const progress = progressValue(book)
      return <article class={`hardcover-book-row ${isExpanded ? 'is-open' : ''}`} key={id}>
        <button type="button" class="hardcover-book-summary" onClick={() => setExpanded(isExpanded ? null : id)} aria-expanded={isExpanded} aria-controls={`hardcover-book-${id}`}>
          <span class="hardcover-cover">{book.cover_url ? <img src={book.cover_url} alt="" loading="lazy"/> : <i aria-hidden="true">HC</i>}</span>
          <span class="hardcover-book-identity"><small>{book.author || 'Unknown author'}</small><strong>{book.title}</strong><span>{STATUS_LABELS[String(book.status_id)] || 'Saved'}{progress != null ? ` · ${progress}%` : ''}{book.branch_id && <em class="hardcover-branch-pill">{book.branch_label || book.branch_id} · {book.round_label || 'R1'}</em>}</span></span>
          <span class="hardcover-entry-count"><strong>{bookEntries.length}</strong><small>{bookEntries.length === 1 ? 'entry' : 'entries'}</small></span>
          <span class="hardcover-disclosure" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
        </button>
        {isExpanded && <div id={`hardcover-book-${id}`} class="hardcover-book-detail">
          {bookEntries.length ? <ol class="hardcover-entry-list">{bookEntries.map((entry: LibraryRecord) => <li key={entry.hardcover_journal_id} class={`is-${entry.event}`}><span class="hardcover-entry-mark" aria-hidden="true">{entry.event === 'quote' ? 'Q' : 'N'}</span><div><div class="hardcover-entry-meta"><strong>{entry.event === 'quote' ? 'Highlight' : 'Note'}</strong><span>{eventLocation(entry)} · {formatDate(entry.action_at)}</span></div><p dir="auto">{entry.entry}</p></div></li>)}</ol> : <p class="folio-shelf-empty">No {eventFilter === 'all' ? 'journal entries' : eventFilter === 'quote' ? 'highlights' : 'notes'} for this book.</p>}
        </div>}
      </article>
    })}</div> : <section class="hardcover-empty-state"><span>HC</span><h2>{books.length ? 'No journal records match' : 'The journal is empty'}</h2><p>{books.length ? 'Try a shorter search, another entry type, or All books.' : data.configured ? 'Sync Hardcover after sending a quote or note from KOReader.' : 'Connect Hardcover, then sync your KOReader reading journal.'}</p></section>}
  </div>
}
