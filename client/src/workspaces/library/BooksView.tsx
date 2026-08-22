import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, formatDate } from '../../api'
import { useData } from '../../app/useData'
import { Icon } from '../../components/Icon'
import { Empty } from '../../components/States'
import { LearnCanonView } from '../learn/LearnCanonView'
import type { LibraryRecord, LibraryViewHandlers } from './types'
import { bookChapters, bookNextChapter, bookProgress, bookQueueState, bookReadingState, chapterActionCopy, chapterCompanionUrl } from './bookModel'
import {
  artifactLink,
  bookSelection,
  fileKind,
  formatBytes,
  formatReason,
  formatStatus,
  objectHref,
  parseMetadata,
  sourceCreator,
  sourceLink,
  sourceTitle,
} from './types'

// Theme-aware folio spine colors; these follow custom and dark theme tokens.
const BOOK_ACCENTS = [
  'var(--studio-cypress)',
  'var(--studio-map)',
  'var(--studio-due)',
  'var(--studio-secondary)',
]

export function getBookAccent(title: string) {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % BOOK_ACCENTS.length
  return BOOK_ACCENTS[index]
}

export function getInitials(title: string, author?: string) {
  const tWords = (title || '').trim().split(/\s+/).filter(Boolean)
  const aWords = (author || '').trim().split(/\s+/).filter(Boolean)
  const tInitial = tWords[0] ? tWords[0][0].toUpperCase() : 'B'
  const aInitial = aWords[0] ? aWords[0][0].toUpperCase() : 'K'
  return `${tInitial}${aInitial}`
}

function formatBranchPill(branch?: LibraryRecord | null) {
  if (!branch) return null
  const label = String(branch.label || branch.title || '').trim()
  if (!label) return null

  const roundText = String(branch.round || branch.round_label || '').trim()

  return { label, round: roundText, linkable: branch.linkable !== false && branch.verified !== false }
}

export const computeBookProgress = bookProgress

function CanonMembershipTags({ book, className }: { book: LibraryRecord; className: string }) {
  const memberships = Array.isArray(book.canon_memberships) ? book.canon_memberships : []
  if (!memberships.length) return null
  return <span class="book-canon-memberships">{memberships.map((membership: LibraryRecord, index: number) => (
    <a class={className} href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`} key={String(membership.entry_id || `${membership.domain_id}-${membership.role}-${index}`)}>
      Canon · {formatStatus(membership.role)} · {membership.domain_title}
    </a>
  ))}</span>
}

export function BooksView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const books = useMemo(() => (Array.isArray(data.books) ? data.books : []), [data.books])
  const branchDeck = useData<{ existing?: LibraryRecord[] }>('/brain/branch-deck')
  const branchOptions = useMemo(
    () => (branchDeck.data?.existing || []).filter((branch) => String(branch.status || '').toLowerCase() !== 'pruned'),
    [branchDeck.data?.existing],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [activeShelf, setActiveShelf] = useState<'all' | 'reading' | 'toread' | 'finished'>('all')
  const [visibleCount, setVisibleCount] = useState(12)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null)
  const [chapterModalBook, setChapterModalBook] = useState<LibraryRecord | null>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addTitleRef = useRef<HTMLInputElement>(null)
  const shelfInitialized = useRef(false)

  // Add Book Form state
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newIsbn, setNewIsbn] = useState('')
  const [newWhyThis, setNewWhyThis] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newBranchId, setNewBranchId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    if (!showAddForm) return
    addTitleRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAddForm()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [showAddForm])

  const closeAddForm = () => {
    setShowAddForm(false)
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  const shelves = useMemo(() => {
    const reading: LibraryRecord[] = []
    const toRead: LibraryRecord[] = []
    const finished: LibraryRecord[] = []
    for (const book of books) {
      const state = bookReadingState(book)
      if (state === 'reading') reading.push(book)
      else if (state === 'finished') finished.push(book)
      else if (String(book.status || '') === 'active') toRead.push(book)
    }
    return { reading, toRead, finished }
  }, [books])
  const readingBooks = shelves.reading
  const toReadBooks = shelves.toRead
  const finishedBooks = shelves.finished

  // Shelf book counts
  const stats = useMemo(() => ({
    totalBooks: books.length,
    readingCount: readingBooks.length,
    toReadCount: toReadBooks.length,
    finishedCount: finishedBooks.length,
  }), [books, readingBooks, toReadBooks, finishedBooks])

  useEffect(() => {
    if (!shelfInitialized.current && books.length) {
      shelfInitialized.current = true
      setActiveShelf(readingBooks.length ? 'reading' : 'all')
    }
  }, [books.length, readingBooks.length])

  // Filtered books
  const filteredBooks = useMemo(() => {
    let list = books
    if (activeShelf === 'reading') list = readingBooks
    else if (activeShelf === 'toread') list = toReadBooks
    else if (activeShelf === 'finished') list = finishedBooks

    const needle = searchQuery.trim().toLowerCase()
    if (!needle) return list

    return list.filter((book: LibraryRecord) => {
      const title = sourceTitle(book).toLowerCase()
      const author = sourceCreator(book).toLowerCase()
      const why = String(book.why_this || '').toLowerCase()
      const branch = String(book.branch?.label || book.branch_label || '').toLowerCase()
      const isbn = String(parseMetadata(book.source_metadata_json).isbn || '').toLowerCase()
      const canon = (Array.isArray(book.canon_memberships) ? book.canon_memberships : [])
        .map((membership: LibraryRecord) => `${membership.domain_title || ''} ${membership.role || ''}`)
        .join(' ')
        .toLowerCase()
      return (
        title.includes(needle) ||
        author.includes(needle) ||
        why.includes(needle) ||
        branch.includes(needle) ||
        isbn.includes(needle) ||
        canon.includes(needle)
      )
    })
  }, [books, activeShelf, readingBooks, toReadBooks, finishedBooks, searchQuery])

  useEffect(() => setVisibleCount(12), [activeShelf, searchQuery])

  const visibleBooks = filteredBooks.slice(0, visibleCount)

  const handleAddSubmit = async (e: Event) => {
    e.preventDefault()
    if (!newTitle.trim() || !newAuthor.trim() || !newBranchId) return
    setIsSubmitting(true)
    setAddError('')
    try {
      await handlers.onAddBook({
        title: newTitle.trim(),
        author: newAuthor.trim(),
        branch_id: newBranchId,
        isbn: newIsbn.trim(),
        why_this: newWhyThis.trim() || undefined,
        url: newUrl.trim() || undefined,
      })
      setNewTitle('')
      setNewAuthor('')
      setNewIsbn('')
      setNewWhyThis('')
      setNewUrl('')
      setNewBranchId('')
      closeAddForm()
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'The book could not be added. Your entries have been preserved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div class="folio-library-view folio-books-view folio-books-sanctuary">
      {/* Intro Header */}
      <header class="books-view-header">
        <div class="books-view-intro">
          <p class="folio-kicker">Deliberate intake · Long-form reading</p>
          <h1>Books</h1>
          <p class="books-lede">
            Chapter-aware reading companions, field reflections, and long-form study. Books move through intentional triage, deep reading sessions, and permanent consolidation.
          </p>
        </div>

        <div class="books-header-actions">
          <button
            ref={addButtonRef}
            type="button"
            class={`folio-button ${showAddForm ? 'folio-button-active' : 'folio-button-primary'}`}
            onClick={() => showAddForm ? closeAddForm() : setShowAddForm(true)}
            aria-expanded={showAddForm}
            aria-controls="books-intake-drawer"
          >
            <Icon name="book" size={15} />
            <span>{showAddForm ? 'Close intake' : 'Add a book'}</span>
          </button>
          <a
            href="#/library?mode=catalog&focus=journal"
            class="folio-button"
            title="Open highlights & notes from KOReader via Hardcover"
          >
            <Icon name="rss" size={14} />
            <span>Reading journal</span>
          </a>
        </div>
      </header>

      <nav class="books-room-index" aria-label="Books page sections">
        <a href="#books-reading-desk">Reading desk</a>
        <a href="#books-library">My books</a>
        <a href="#books-canon">Canon fields</a>
      </nav>

      {/* Add Book Intake Card */}
      {showAddForm && (
        <section id="books-intake-drawer" class="books-intake-drawer" aria-label="Add book form">
          <div class="intake-drawer-head">
            <div>
              <h2>Add a volume to your library</h2>
              <p>Clarify why this book earns attention before it becomes a commitment.</p>
            </div>
            <button
              type="button"
              class="intake-drawer-close"
              onClick={closeAddForm}
              aria-label="Close form"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <form class="books-form-body" onSubmit={handleAddSubmit}>
            <div class="books-form-grid" aria-describedby={addError ? 'books-add-error' : undefined}>
              <label class="folio-form-field">
                <span>Book Title <em>*</em></span>
                <input
                  ref={addTitleRef}
                  type="text"
                  value={newTitle}
                  onInput={(e) => setNewTitle((e.currentTarget as HTMLInputElement).value)}
                  placeholder="e.g. The Structure of Scientific Revolutions"
                  required
                />
              </label>

              <label class="folio-form-field">
                <span>Author <em>*</em></span>
                <input
                  type="text"
                  value={newAuthor}
                  onInput={(e) => setNewAuthor((e.currentTarget as HTMLInputElement).value)}
                  placeholder="e.g. Thomas S. Kuhn"
                  required
                />
              </label>

              <label class="folio-form-field">
                <span>Knowledge branch <em>*</em></span>
                <select value={newBranchId} onChange={(event) => setNewBranchId((event.currentTarget as HTMLSelectElement).value)} required disabled={branchDeck.loading || !branchOptions.length}>
                  <option value="">{branchDeck.loading ? 'Loading branches…' : branchOptions.length ? 'Choose the book’s branch' : 'No active branches available'}</option>
                  {branchOptions.map((branch) => <option value={String(branch.id)} key={String(branch.id)}>{branch.label || branch.id} · {branch.round_label || branch.round || 'R1'}</option>)}
                </select>
              </label>
            </div>

            {branchDeck.error && <p class="folio-inline-warning" role="alert">Branches could not be loaded. Retry the page before adding a book.</p>}
            {addError && <p id="books-add-error" class="folio-inline-warning" role="alert">{addError}</p>}

            <details class="books-optional-fields">
              <summary>Optional book details</summary>
              <div class="books-form-grid">
                <label class="folio-form-field">
                  <span>ISBN / Standard Number</span>
                  <input type="text" value={newIsbn} onInput={(e) => setNewIsbn((e.currentTarget as HTMLInputElement).value)} placeholder="10 or 13-digit ISBN" />
                </label>
                <label class="folio-form-field">
                  <span>Original book link</span>
                  <input type="url" value={newUrl} onInput={(e) => setNewUrl((e.currentTarget as HTMLInputElement).value)} placeholder="https://books.google.com/..." />
                </label>
                <label class="folio-form-field field-full">
                  <span>Why read this?</span>
                  <textarea rows={2} value={newWhyThis} onInput={(e) => setNewWhyThis((e.currentTarget as HTMLTextAreaElement).value)} placeholder="The question, problem, or branch focus this book serves" />
                </label>
              </div>
            </details>

            <div class="intake-drawer-actions">
              <button
                type="submit"
                class="folio-button folio-button-primary"
                disabled={isSubmitting || !newTitle.trim() || !newAuthor.trim() || !newBranchId}
              >
                {isSubmitting ? 'Adding book…' : 'Save volume'}
              </button>
              <button
                type="button"
                class="folio-button"
                onClick={closeAddForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Currently Immersed Spotlight Banner */}
      <section id="books-reading-desk" class="books-active-spotlight" aria-labelledby="books-reading-title">
          <div class="active-spotlight-heading">
            <h2 id="books-reading-title">Reading desk</h2>
          </div>

          <div class="active-spotlight-list">
            {readingBooks.slice(0, 1).map((book: LibraryRecord) => {
              const accent = getBookAccent(sourceTitle(book))
              const progress = computeBookProgress(book)
              const nextChapter = bookNextChapter(book)
              const original = sourceLink(book)
              const nextUrl = chapterCompanionUrl(nextChapter) || (nextChapter ? original : null)
              const nextCopy = chapterActionCopy(book, nextChapter)
              const branchInfo = formatBranchPill(book.branch)

              return (
                <div class="active-spotlight-card" key={book.id}>
                  <div
                    class="spotlight-initials-cover"
                    style={{ backgroundColor: accent, color: 'var(--studio-action-ink)' }}
                  >
                    <span>{getInitials(sourceTitle(book), sourceCreator(book))}</span>
                  </div>

                  <div class="spotlight-content">
                    <div class="spotlight-meta-row">
                      <span class="spotlight-author">{sourceCreator(book)}</span>
                      {branchInfo && branchInfo.linkable ? (
                        <a
                          class="book-branch-badge"
                          href={`#/map/branch/${encodeURIComponent(String(book.branch?.id || branchInfo.label))}`}
                        >
                          <Icon name="branch" size={11} />
                          <span class="branch-text">{branchInfo.label}</span>
                          {branchInfo.round && <span class="branch-round-text">{branchInfo.round}</span>}
                        </a>
                      ) : branchInfo ? <span class="book-branch-badge is-unverified"><Icon name="branch" size={11} />Unverified · {branchInfo.label}</span> : null}
                      <CanonMembershipTags book={book} className="book-canon-badge" />
                    </div>

                    <h2 class="spotlight-book-title">
                      <a href={objectHref('book', String(book.id))}>{sourceTitle(book)}</a>
                    </h2>

                    {book.why_this && <p class="spotlight-why-quote">“{book.why_this}”</p>}

                    {progress.total > 0 && (
                      <div class="spotlight-progress-meter">
                        <div class="progress-meter-info">
                          <span>{progress.finished} of {progress.total} chapters complete</span>
                          <strong>{progress.percent}%</strong>
                        </div>
                        <div class="progress-meter-track" role="progressbar" aria-label={`${sourceTitle(book)} chapter progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                          <div class="progress-meter-fill" style={{ width: `${progress.percent}%` }} />
                        </div>
                        {nextChapter && (
                          <div class="spotlight-next-chapter">
                            <span>Up next: </span>
                            <strong>
                              {nextChapter.number ? `${nextChapter.number}. ` : ''}
                              {nextChapter.title}
                            </strong>
                          </div>
                        )}
                      </div>
                    )}

                    <div class="spotlight-actions-bar">
                      {nextUrl && nextCopy ? (
                        <a
                          class="folio-button folio-button-primary"
                          href={nextUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="source" size={14} />
                          <span>{nextCopy}</span>
                        </a>
                      ) : original ? (
                        <a
                          class="folio-button folio-button-primary"
                          href={original}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="external" size={14} />
                          <span>Open original book</span>
                        </a>
                      ) : (
                        <a class="folio-button folio-button-primary" href={objectHref('book', String(book.id))}>Open book record</a>
                      )}

                      <a class="folio-button" href={objectHref('book', String(book.id))}>
                        <Icon name="note" size={14} />
                        <span>Book details</span>
                      </a>
                    </div>
                    <p class="folio-action-note">Opening a chapter or original is passive. Queue is {bookQueueState(book) === 'queued' || bookQueueState(book) === 'in_progress' ? formatStatus(bookQueueState(book)) : 'not tracking this book'}.</p>
                  </div>
                </div>
              )
            })}
            {!readingBooks.length && <Empty title="No book is marked Reading now" body="Choose Reading now from a book’s personal state controls. Queue remains a separate commitment." />}
          </div>
        </section>

      {/* Book Records Grid / Ledger */}
      <section id="books-library" class="books-library-section" aria-labelledby="my-books-title">
        <header class="books-library-heading">
          <div><p class="folio-kicker">Your durable reading record</p><h2 id="my-books-title">My books</h2></div>
          <span>{filteredBooks.length} {filteredBooks.length === 1 ? 'book' : 'books'}</span>
        </header>

        {/* Reading-status summary */}
        <section class="books-stats-shelf" aria-label="Reading status overview">
          <div class="books-shelf-nav-pills" role="group" aria-label="Filter My books by reading status">
            <button
              type="button"
              aria-pressed={activeShelf === 'all'}
              class={`books-shelf-pill ${activeShelf === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveShelf('all')}
            >
              <span class="pill-title">All books</span>
              <span class="pill-badge">{stats.totalBooks}</span>
            </button>

            <button
              type="button"
              aria-pressed={activeShelf === 'reading'}
              class={`books-shelf-pill ${activeShelf === 'reading' ? 'is-active' : ''}`}
              onClick={() => setActiveShelf('reading')}
            >
              <span class="pill-title">
                {stats.readingCount > 0 && <span class="active-dot" />}
                Reading now
              </span>
              <span class={`pill-badge ${stats.readingCount > 0 ? 'badge-reading' : ''}`}>
                {stats.readingCount}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={activeShelf === 'toread'}
              class={`books-shelf-pill ${activeShelf === 'toread' ? 'is-active' : ''}`}
              onClick={() => setActiveShelf('toread')}
            >
              <span class="pill-title">Saved</span>
              <span class="pill-badge">{stats.toReadCount}</span>
            </button>

            <button
              type="button"
              aria-pressed={activeShelf === 'finished'}
              class={`books-shelf-pill ${activeShelf === 'finished' ? 'is-active' : ''}`}
              onClick={() => setActiveShelf('finished')}
            >
              <span class="pill-title">Finished</span>
              <span class={`pill-badge ${stats.finishedCount > 0 ? 'badge-finished' : ''}`}>
                {stats.finishedCount}
              </span>
            </button>
          </div>
        </section>

        {/* Filter Toolbar & Search */}
        <div class="books-filter-toolbar">
          <div class="books-search-wrapper">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.currentTarget as HTMLInputElement).value)}
              placeholder="Search books by title, author, or branch…"
              aria-label="Filter books"
            />
            {searchQuery && (
              <button
                type="button"
                class="books-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div class="books-view-controls">
            <output class="books-results-count" aria-live="polite">
              <strong>{filteredBooks.length}</strong> {filteredBooks.length === 1 ? 'book' : 'books'}
            </output>
          </div>
        </div>

        {filteredBooks.length ? <>
            <div class="books-responsive-ledger" aria-label="Book ledger">
              {visibleBooks.map((book: LibraryRecord) => (
                <BookLedgerItem
                  key={book.id}
                  book={book}
                  isExpanded={expandedBookId === String(book.id)}
                  onToggleExpand={() =>
                    setExpandedBookId(expandedBookId === String(book.id) ? null : String(book.id))
                  }
                  onOpenChapterModal={() => setChapterModalBook(book)}
                  handlers={handlers}
                />
              ))}
            </div>
            {visibleCount < filteredBooks.length && <div class="books-load-more"><button type="button" class="folio-button" onClick={() => setVisibleCount((count) => count + 12)}>Show 12 more</button><span aria-live="polite">Showing {Math.min(visibleCount, filteredBooks.length)} of {filteredBooks.length} books</span></div>}
          </> : (
          <Empty
            title={searchQuery ? 'No matching books found' : activeShelf === 'reading' ? 'No books currently being read' : activeShelf === 'finished' ? 'No finished books recorded yet' : 'No books saved yet'}
            body={searchQuery ? 'Try another search query or clear the filter.' : activeShelf === 'reading' ? 'Add the book to Queue when it is ready for a tracked reading session.' : 'Add books with chapters to track deep reading and companion extraction.'}
          />
        )}
      </section>

      <LearnCanonView integrated searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />

      {/* Chapter Breakdown Modal */}
      {chapterModalBook && (
        <ChapterManagerDialog
          book={chapterModalBook}
          onClose={() => setChapterModalBook(null)}
          onSaved={() => {
            setChapterModalBook(null)
            handlers.onReload?.()
          }}
        />
      )}

      {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
    </div>
  )
}

function BookLedgerItem({
  book,
  isExpanded,
  onToggleExpand,
  onOpenChapterModal,
  handlers,
}: {
  book: LibraryRecord
  isExpanded: boolean
  onToggleExpand: () => void
  onOpenChapterModal: () => void
  handlers: LibraryViewHandlers
}) {
  const accent = getBookAccent(sourceTitle(book))
  const progress = computeBookProgress(book)
  const chapters = bookChapters(book)
  const nextChapter = bookNextChapter(book)
  const nextUrl = chapterCompanionUrl(nextChapter) || sourceLink(book)
  const nextCopy = nextChapter ? chapterActionCopy(book, nextChapter) : (nextUrl ? 'Open original book' : null)
  const isInbox = bookQueueState(book) === 'captured' && String(book.status || '') === 'active'
  const isReading = bookReadingState(book) === 'reading'
  const canDeletePermanently = String(book.status || '') !== 'active'
  const isDeleting = handlers.busyId === `permanent-delete:${book.id}`
  const branchInfo = formatBranchPill(book.branch)

  return (
    <article class={`book-ledger-row ${isReading ? 'is-reading-row' : ''}`}>
      <div class="ledger-row-content">
        <div
          class="ledger-avatar"
          style={{ backgroundColor: accent, color: 'var(--studio-action-ink)' }}
        >
          <span>{getInitials(sourceTitle(book), sourceCreator(book))}</span>
        </div>

        <div class="ledger-main-info">
          <div class="ledger-author-line">
            <span class="ledger-author-text">{sourceCreator(book)}</span>
            <span class="ledger-state-tag">{bookReadingState(book) === 'reading' ? 'Reading now' : formatStatus(bookReadingState(book))}</span>
            {branchInfo && (
              <span class={`ledger-branch-tag ${branchInfo.linkable ? '' : 'is-unverified'}`}>
                {!branchInfo.linkable && 'Unverified · '}
                {branchInfo.label} {branchInfo.round ? `· ${branchInfo.round}` : ''}
              </span>
            )}
            <CanonMembershipTags book={book} className="ledger-canon-tag" />
          </div>

          <h3 class="ledger-title-text">
            <a href={objectHref('book', String(book.id))}>{sourceTitle(book)}</a>
          </h3>

          {book.why_this && <p class="ledger-why-text">{book.why_this}</p>}
        </div>

        <div class="ledger-progress-col">
          {progress.total ? (
            <div class="ledger-progress-readout">
              <strong>{progress.percent}%</strong>
              <small>{progress.finished}/{progress.total} chs</small>
            </div>
          ) : (
            <span class="ledger-empty-chs">0 chapters</span>
          )}
        </div>

        <div class="ledger-actions-col">
          <label class="book-reading-state-control">
            <span>Personal state</span>
            <select value={bookReadingState(book)} onChange={(event) => handlers.onSetBookReadingState(book, (event.currentTarget as HTMLSelectElement).value as 'saved' | 'reading' | 'finished')} disabled={handlers.busyId === `reading-state:${book.id}`} aria-label={`Personal reading state for ${sourceTitle(book)}`}>
              <option value="saved">Saved</option>
              <option value="reading">Reading now</option>
              <option value="finished">Finished</option>
            </select>
          </label>
          {nextUrl && nextCopy && <a class="folio-button folio-button-primary folio-btn-sm" href={nextUrl} target="_blank" rel="noreferrer">{nextCopy}</a>}
          {isInbox && (
            <button
              type="button"
              class="folio-button folio-button-primary folio-btn-sm"
              onClick={() => handlers.onQueue(book)}
              disabled={handlers.busyId === book.id}
            >
              Queue
            </button>
          )}

          <button
            type="button"
            class="folio-button folio-btn-sm"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            aria-controls={`book-ledger-chapters-${book.id}`}
          >
            {isExpanded ? 'Hide' : `${chapters.length} Chs`}
          </button>

          <a class="folio-button folio-btn-sm" href={objectHref('book', String(book.id))}>
            Book details
          </a>

          {canDeletePermanently && (
            <button
              type="button"
              class="folio-btn-quiet-trash"
              onClick={() => handlers.onDeleteRecommendationPermanently(book)}
              disabled={isDeleting}
              title="Delete book"
              aria-label={`Delete ${sourceTitle(book)} permanently`}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div id={`book-ledger-chapters-${book.id}`} class="ledger-expanded-content">
          <BookChapterRows book={book} handlers={handlers} onEdit={onOpenChapterModal} />
        </div>
      )}
    </article>
  )
}

export function BookChapterRows({
  book,
  handlers,
  onEdit,
}: {
  book: LibraryRecord
  handlers: LibraryViewHandlers
  onEdit?: () => void
}) {
  const chapters = bookChapters(book)
  if (!chapters.length) {
    return (
      <div class="empty-chapters-panel">
        <p>No chapter breakdown registered yet.</p>
        {onEdit && (
          <button type="button" class="folio-button folio-button-primary folio-btn-sm" onClick={onEdit}>
            <Icon name="book" size={13} />
            <span>Add chapter breakdown</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div class="chapter-rows-container" aria-label={`${sourceTitle(book)} chapters`}>
      {chapters.map((chapter: LibraryRecord, index: number) => {
        const isDone = Boolean(chapter.completed || chapter.completed_at)
        const isBusy = handlers.busyId === `${book.id}:${chapter.key}`
        const htmlArtifact = chapter.html
        const pdfArtifact = chapter.pdf

        return (
          <div class={`chapter-item-row ${isDone ? 'is-completed' : ''}`} key={chapter.key || index}>
            <div class="chapter-item-left">
              <button
                type="button"
                class={`chapter-checkbox-btn ${isDone ? 'is-done' : ''}`}
                onClick={() => handlers.onCompleteChapter(book, chapter)}
                disabled={isBusy}
                title={isDone ? 'Mark as unread' : 'Mark as finished'}
                aria-label={`${isDone ? 'Mark as unread' : 'Mark as finished'}: ${chapter.title}`}
                aria-pressed={isDone}
              >
                {isDone ? <Icon name="check" size={13} /> : null}
              </button>

              <div class="chapter-item-info">
                <span class="chapter-title-heading">
                  {chapter.number ? `${chapter.number}. ` : ''}
                  {chapter.title}
                </span>
                <span class="chapter-sub-meta">
                  {isDone ? (
                    <span class="meta-done">
                      Finished {chapter.completed_at ? `· ${formatDate(chapter.completed_at)}` : ''}
                    </span>
                  ) : (
                    <span class="meta-unread">Unread</span>
                  )}
                </span>
              </div>
            </div>

            <div class="chapter-item-actions">
              {htmlArtifact && (
                <a
                  class="folio-file-badge folio-badge-html"
                  href={artifactLink(htmlArtifact)}
                  target="_blank"
                  rel="noreferrer"
                  title="Read Arabic HTML companion"
                >
                  <span class="badge-format">Read HTML</span>
                </a>
              )}

              {pdfArtifact && (
                <a
                  class="folio-file-badge folio-badge-pdf"
                  href={artifactLink(pdfArtifact)}
                  target="_blank"
                  rel="noreferrer"
                  title="Download A4 PDF companion"
                >
                  <span class="badge-format">PDF</span>
                </a>
              )}

            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ChapterManagerDialog({
  book,
  onClose,
  onSaved,
}: {
  book: LibraryRecord
  onClose: () => void
  onSaved: () => void
}) {
  const existingChapters = bookChapters(book)
  const initialText = existingChapters
    .map((c: LibraryRecord) => `${c.number ? `${c.number}. ` : ''}${c.title}`)
    .join('\n')
  const [chapterText, setChapterText] = useState(initialText)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const handleDialogKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const handleSave = async (e: Event) => {
    e.preventDefault()
    const lines: string[] = chapterText
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean)

    if (!lines.length) {
      setError('Enter at least one chapter.')
      return
    }

    const payloadChapters = lines.map((line: string, idx: number) => {
      const match = line.match(/^(?:chapter\s+)?(\d+)[\s.:\-]+(.*)$/i)
      const num = match ? parseInt(match[1], 10) : idx + 1
      const rawTitle = match ? match[2].trim() : line
      const cleanTitle = rawTitle || `Chapter ${num}`
      const key = `chapter-${num}`
      const existing = existingChapters.find((c: LibraryRecord) => c.key === key || c.number === num)

      return {
        key,
        title: cleanTitle,
        number: num,
        completed: Boolean(existing?.completed || existing?.completed_at),
      }
    })

    setSaving(true)
    setError('')
    try {
      await api(`/recommendations/books/${encodeURIComponent(String(book.id))}/chapters`, {
        method: 'POST',
        body: JSON.stringify({ chapters: payloadChapters }),
      })
      onSaved()
    } catch (err: any) {
      setError(err?.message || 'Failed to save chapters.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="folio-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} class="folio-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="chapter-dialog-title" aria-describedby="chapter-dialog-help" onKeyDown={handleDialogKeyDown}>
        <div class="folio-modal-header">
          <div>
            <span class="folio-kicker">Chapter Breakdown</span>
            <h3 id="chapter-dialog-title">{sourceTitle(book)}</h3>
          </div>
          <button type="button" class="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div class="folio-modal-body">
            <label class="folio-form-field">
              <span>Paste or type chapter titles <small>(one chapter per line)</small></span>
              <textarea
                rows={9}
                value={chapterText}
                onInput={(e) => setChapterText((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="1. The Myth of the Given&#10;2. Space of Reasons&#10;3. Empirical Constraints&#10;4. Coherence and Justification"
                required
              />
            </label>
            <p class="dialog-hint" id="chapter-dialog-help">
              Chapters create tracked milestones for your reading sessions. You can associate Arabic HTML & A4 PDF companions with individual chapters.
            </p>
            {error && <p class="folio-inline-warning" role="alert">{error}</p>}
          </div>

          <div class="folio-modal-footer">
            <button type="button" class="folio-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class="folio-button folio-button-primary" disabled={saving}>
              {saving ? 'Saving chapters…' : 'Save chapter breakdown'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
