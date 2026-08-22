import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, formatDate } from '../../api'
import { useData } from '../../app/useData'
import { Icon } from '../../components/Icon'
import { Empty } from '../../components/States'
import { LearnCanonView } from '../learn/LearnCanonView'
import type { LibraryRecord, LibraryViewHandlers } from './types'
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

  return { label, round: roundText }
}

export function computeBookProgress(book: LibraryRecord) {
  const chapters = book.visual?.chapters || []
  if (!chapters.length) return null
  const finished = chapters.filter((c: LibraryRecord) => Boolean(c.completed || c.completed_at)).length
  const total = chapters.length
  const percent = Math.round((finished / total) * 100)
  return { finished, total, percent }
}

function firstCanonMembership(book: LibraryRecord) {
  return Array.isArray(book.canon_memberships) ? book.canon_memberships[0] : null
}

function scrollToBooksSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
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
  const [viewLayout, setViewLayout] = useState<'grid' | 'ledger'>(() => {
    if (typeof window === 'undefined') return 'grid'
    return window.localStorage.getItem('learning-compass.books-layout') === 'ledger' ? 'ledger' : 'grid'
  })
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null)
  const [chapterModalBook, setChapterModalBook] = useState<LibraryRecord | null>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addTitleRef = useRef<HTMLInputElement>(null)

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
    if (showAddForm) addTitleRef.current?.focus()
  }, [showAddForm])

  const closeAddForm = () => {
    setShowAddForm(false)
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  const toggleViewLayout = (layout: 'grid' | 'ledger') => {
    setViewLayout(layout)
    window.localStorage.setItem('learning-compass.books-layout', layout)
  }

  // Shelf separation
  const readingBooks = useMemo(
    () => books.filter((b: LibraryRecord) => String(b.learning_state || '') === 'in_progress'),
    [books],
  )
  const toReadBooks = useMemo(
    () =>
      books.filter(
        (b: LibraryRecord) =>
          ['captured', 'inbox', ''].includes(String(b.learning_state || '')) &&
          String(b.status || '') === 'active',
      ),
    [books],
  )
  const finishedBooks = useMemo(
    () =>
      books.filter(
        (b: LibraryRecord) =>
          String(b.status || '') === 'consumed' || String(b.learning_state || '') === 'completed',
      ),
    [books],
  )

  // Overall reading statistics
  const stats = useMemo(() => {
    let totalChapters = 0
    let finishedChapters = 0

    for (const b of books) {
      const chs = b.visual?.chapters || []
      totalChapters += chs.length
      finishedChapters += chs.filter((c: LibraryRecord) => Boolean(c.completed || c.completed_at)).length
    }

    const chapterPercent = totalChapters > 0 ? Math.round((finishedChapters / totalChapters) * 100) : 0

    return {
      totalBooks: books.length,
      readingCount: readingBooks.length,
      toReadCount: toReadBooks.length,
      finishedCount: finishedBooks.length,
      totalChapters,
      finishedChapters,
      chapterPercent,
    }
  }, [books, readingBooks, toReadBooks, finishedBooks])

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
        {readingBooks.length > 0 && <button type="button" onClick={() => scrollToBooksSection('books-reading-desk')}>Reading desk</button>}
        <button type="button" onClick={() => scrollToBooksSection('books-library')}>My books</button>
        <button type="button" onClick={() => scrollToBooksSection('books-canon')}>Canon fields</button>
      </nav>

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

        {stats.totalChapters > 0 && (
          <div class="books-chapter-progress-widget">
            <div class="progress-widget-head">
              <span class="progress-widget-label">Chapter progress</span>
              <strong class="progress-widget-val">
                {stats.finishedChapters}/{stats.totalChapters} <small>({stats.chapterPercent}%)</small>
              </strong>
            </div>
            <div class="progress-widget-track" role="progressbar" aria-label="Overall chapter progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.chapterPercent}>
              <div class="progress-widget-bar" style={{ width: `${stats.chapterPercent}%` }} />
            </div>
          </div>
        )}
      </section>

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
            <div class="books-form-grid">
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
                <span>ISBN / Standard Number <small>(optional)</small></span>
                <input
                  type="text"
                  value={newIsbn}
                  onInput={(e) => setNewIsbn((e.currentTarget as HTMLInputElement).value)}
                  placeholder="10 or 13-digit ISBN"
                />
              </label>

              <label class="folio-form-field">
                <span>Source Link <small>(optional)</small></span>
                <input
                  type="url"
                  value={newUrl}
                  onInput={(e) => setNewUrl((e.currentTarget as HTMLInputElement).value)}
                  placeholder="https://books.google.com/..."
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
            {addError && <p class="folio-inline-warning" role="alert">{addError}</p>}

            <label class="folio-form-field field-full">
              <span>Why read this? <small>(Personal question, problem, or branch focus)</small></span>
              <textarea
                rows={2}
                value={newWhyThis}
                onInput={(e) => setNewWhyThis((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="What core concept or foundational inquiry makes this book essential right now?"
              />
            </label>

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
      {readingBooks.length > 0 && activeShelf !== 'finished' && activeShelf !== 'toread' && (
        <section id="books-reading-desk" class="books-active-spotlight" aria-label="Reading desk">
          <div class="active-spotlight-heading">
            <span class="active-pulse-beacon" />
            <h3>Reading desk</h3>
          </div>

          <div class="active-spotlight-list">
            {readingBooks.map((book: LibraryRecord) => {
              const accent = getBookAccent(sourceTitle(book))
              const progress = computeBookProgress(book)
              const chapters = book.visual?.chapters || []
              const nextChapter = chapters.find((c: LibraryRecord) => !c.completed && !c.completed_at)
              const firstHtml = chapters.find((c: LibraryRecord) => c.html)?.html
              const branchInfo = formatBranchPill(book.branch)
              const canon = firstCanonMembership(book)

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
                      {branchInfo && (
                        <a
                          class="book-branch-badge"
                          href={`#/map/branch/${encodeURIComponent(String(book.branch?.id || branchInfo.label))}`}
                        >
                          <Icon name="branch" size={11} />
                          <span class="branch-text">{branchInfo.label}</span>
                          {branchInfo.round && <span class="branch-round-text">{branchInfo.round}</span>}
                        </a>
                      )}
                      {canon && <a class="book-canon-badge" href={`#/learn/canon/${encodeURIComponent(String(canon.domain_slug || canon.domain_id))}`}>
                        Canon · {formatStatus(canon.role)} · {canon.domain_title}
                      </a>}
                    </div>

                    <h2 class="spotlight-book-title">
                      <a href={objectHref('book', String(book.id))}>{sourceTitle(book)}</a>
                    </h2>

                    {book.why_this && <p class="spotlight-why-quote">“{book.why_this}”</p>}

                    {progress && (
                      <div class="spotlight-progress-meter">
                        <div class="progress-meter-info">
                          <span>
                            Chapter {progress.finished} of {progress.total}
                          </span>
                          <strong>{progress.percent}% complete</strong>
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
                      {nextChapter?.html ? (
                        <a
                          class="folio-button folio-button-primary"
                          href={`/artifacts/${nextChapter.html.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="source" size={14} />
                          <span>Open HTML companion</span>
                        </a>
                      ) : firstHtml ? (
                        <a
                          class="folio-button folio-button-primary"
                          href={`/artifacts/${firstHtml.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="source" size={14} />
                          <span>Open HTML companion</span>
                        </a>
                      ) : (
                        <a
                          class="folio-button folio-button-primary"
                          href={sourceLink(book) || objectHref('book', String(book.id))}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="source" size={14} />
                          <span>Open original</span>
                        </a>
                      )}

                      <a class="folio-button" href={objectHref('book', String(book.id))}>
                        <Icon name="note" size={14} />
                        <span>Open dossier</span>
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Filter Toolbar & Search */}
      <div class="books-filter-toolbar">
        <div class="books-search-wrapper">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.currentTarget as HTMLInputElement).value)}
            placeholder="Search books, authors, branches, or Canon fields…"
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
          <span class="books-results-count">
            <strong>{filteredBooks.length}</strong> {filteredBooks.length === 1 ? 'book' : 'books'}
          </span>

          <div class="books-layout-switcher" role="group" aria-label="Layout mode">
            <button
              type="button"
              class={`layout-switch-btn ${viewLayout === 'grid' ? 'is-active' : ''}`}
              onClick={() => toggleViewLayout('grid')}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewLayout === 'grid'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              class={`layout-switch-btn ${viewLayout === 'ledger' ? 'is-active' : ''}`}
              onClick={() => toggleViewLayout('ledger')}
              title="Ledger list view"
              aria-label="Ledger list view"
              aria-pressed={viewLayout === 'ledger'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <LearnCanonView integrated searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />

      {/* Book Records Grid / Ledger */}
      <section id="books-library" class="books-library-section" aria-labelledby="my-books-title">
      <header class="books-library-heading">
        <div><p class="folio-kicker">Your durable reading record</p><h2 id="my-books-title">My books</h2></div>
        <span>{filteredBooks.length} {filteredBooks.length === 1 ? 'book' : 'books'}</span>
      </header>
      {filteredBooks.length ? (
        viewLayout === 'grid' ? (
          <div class="books-responsive-grid" aria-label="Book collection">
            {filteredBooks.map((book: LibraryRecord) => (
              <BookCardItem
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
        ) : (
          <div class="books-responsive-ledger" aria-label="Book ledger">
            {filteredBooks.map((book: LibraryRecord) => (
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
        )
      ) : (
        <Empty
          title={searchQuery ? 'No matching books found' : activeShelf === 'reading' ? 'No books currently being read' : activeShelf === 'finished' ? 'No finished books recorded yet' : 'No books saved yet'}
          body={searchQuery ? 'Try another search query or clear the filter.' : activeShelf === 'reading' ? 'Add the book to Queue when it is ready for a tracked reading session.' : 'Add books with chapters to track deep reading and companion extraction.'}
        />
      )}
      </section>

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

function BookCardItem({
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
  const chapters = book.visual?.chapters || []
  const isInbox = ['captured', 'inbox', ''].includes(String(book.learning_state || '')) && String(book.status || '') === 'active'
  const isReading = String(book.learning_state || '') === 'in_progress'
  const isFinished = String(book.status || '') === 'consumed' || String(book.learning_state || '') === 'completed'
  const canDeletePermanently = String(book.status || '') !== 'active'
  const isDeleting = handlers.busyId === `permanent-delete:${book.id}`
  const branchInfo = formatBranchPill(book.branch)
  const canon = firstCanonMembership(book)

  return (
    <article class={`book-grid-card ${isReading ? 'is-reading-card' : ''} ${isFinished ? 'is-finished-card' : ''}`}>
      {/* Card Header Top Row */}
      <div class="book-card-header-bar">
        <div class="book-card-avatar" style={{ backgroundColor: accent, color: 'var(--studio-action-ink)' }}>
          <span>{getInitials(sourceTitle(book), sourceCreator(book))}</span>
        </div>

        <div class="book-card-header-info">
          <span class="book-card-author">{sourceCreator(book)}</span>
          <span class={`book-card-shelf-tag ${isReading ? 'tag-reading' : isFinished ? 'tag-finished' : ''}`}>
            {isReading ? 'Reading' : isFinished ? 'Finished' : 'Saved'}
          </span>
        </div>
      </div>

      {/* Main Body */}
      <div class="book-card-body">
        <h3 class="book-card-title">
          <a href={objectHref('book', String(book.id))} title={sourceTitle(book)}>
            {sourceTitle(book)}
          </a>
        </h3>

        {/* Clean, Compact Branch Pill */}
        {branchInfo && (
          <div class="book-card-branch-container">
            <a
              class="book-branch-badge"
              href={`#/map/branch/${encodeURIComponent(String(book.branch?.id || branchInfo.label))}`}
              title={`Branch: ${branchInfo.label}${branchInfo.round ? ` · ${branchInfo.round}` : ''}`}
            >
              <Icon name="branch" size={11} />
              <span class="branch-text">{branchInfo.label}</span>
              {branchInfo.round && <span class="branch-round-text">{branchInfo.round}</span>}
            </a>
          </div>
        )}
        {canon && <a class="book-canon-badge" href={`#/learn/canon/${encodeURIComponent(String(canon.domain_slug || canon.domain_id))}`}>
          Canon · {formatStatus(canon.role)} · {canon.domain_title}
        </a>}

        {book.why_this && <p class="book-card-reason">“{book.why_this}”</p>}

        {/* Progress Bar */}
        {progress ? (
          <div class="book-card-progress">
            <div class="card-progress-labels">
              <span>{progress.finished} of {progress.total} chapters</span>
              <strong>{progress.percent}%</strong>
            </div>
            <div class="card-progress-track" role="progressbar" aria-label={`${sourceTitle(book)} chapter progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
              <div class="card-progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : (
          <div class="book-card-no-chapters">
            <small>No chapter breakdown</small>
            <button type="button" class="inline-link-btn" onClick={onOpenChapterModal}>
              + Add chapters
            </button>
          </div>
        )}

        {/* Actions Footer */}
        <div class="book-card-actions">
          <div class="card-actions-group">
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
              class={`folio-button folio-btn-sm ${isExpanded ? 'folio-button-active' : ''}`}
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              aria-controls={`book-chapters-${book.id}`}
            >
              <Icon name="book" size={13} />
              <span>{chapters.length > 0 ? `Chapters (${chapters.length})` : 'Chapters'}</span>
            </button>

            <a class="folio-button folio-btn-sm" href={objectHref('book', String(book.id))}>
              Open dossier
            </a>
          </div>

          <div class="card-actions-end">
            {canDeletePermanently && (
              <button
                type="button"
                class="folio-btn-quiet-trash"
                onClick={() => handlers.onDeleteRecommendationPermanently(book)}
                disabled={isDeleting}
                title="Delete book permanently"
                aria-label={`Delete ${sourceTitle(book)} permanently`}
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Expandable Chapter Breakdown Drawer */}
        {isExpanded && (
          <div id={`book-chapters-${book.id}`} class="book-card-expanded-drawer">
            <div class="expanded-drawer-head">
              <h4>Chapters & Reading Companions</h4>
              <button type="button" class="inline-link-btn" onClick={onOpenChapterModal}>
                Edit breakdown
              </button>
            </div>
            <BookChapterRows book={book} handlers={handlers} onEdit={onOpenChapterModal} />
          </div>
        )}
      </div>
    </article>
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
  const chapters = book.visual?.chapters || []
  const isInbox = ['captured', 'inbox', ''].includes(String(book.learning_state || '')) && String(book.status || '') === 'active'
  const isReading = String(book.learning_state || '') === 'in_progress'
  const canDeletePermanently = String(book.status || '') !== 'active'
  const isDeleting = handlers.busyId === `permanent-delete:${book.id}`
  const branchInfo = formatBranchPill(book.branch)
  const canon = firstCanonMembership(book)

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
            <span class="ledger-state-tag">{formatStatus(book.learning_state || book.status)}</span>
            {branchInfo && (
              <span class="ledger-branch-tag">
                {branchInfo.label} {branchInfo.round ? `· ${branchInfo.round}` : ''}
              </span>
            )}
            {canon && <a class="ledger-canon-tag" href={`#/learn/canon/${encodeURIComponent(String(canon.domain_slug || canon.domain_id))}`}>
              Canon · {formatStatus(canon.role)} · {canon.domain_title}
            </a>}
          </div>

          <h3 class="ledger-title-text">
            <a href={objectHref('book', String(book.id))}>{sourceTitle(book)}</a>
          </h3>

          {book.why_this && <p class="ledger-why-text">{book.why_this}</p>}
        </div>

        <div class="ledger-progress-col">
          {progress ? (
            <div class="ledger-progress-readout">
              <strong>{progress.percent}%</strong>
              <small>{progress.finished}/{progress.total} chs</small>
            </div>
          ) : (
            <span class="ledger-empty-chs">0 chapters</span>
          )}
        </div>

        <div class="ledger-actions-col">
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
            Open dossier
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
  const chapters = book.visual?.chapters || []
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
                  href={`/artifacts/${htmlArtifact.id}/view`}
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
                  href={`/artifacts/${pdfArtifact.id}`}
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
  const existingChapters = book.visual?.chapters || []
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
