import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, formatDate } from '../../api'
import { useData } from '../../app/useData'
import { Icon } from '../../components/Icon'
import { OfflinePackControl } from '../../components/OfflinePackControl'
import { SourceHealthControl } from '../../components/SourceHealthControl'
import { offlineDataResource, offlinePairResources, type OfflinePackResource } from '../../offlinePacks'
import { LearnCanonView } from '../learn/LearnCanonView'
import type { LibraryRecord, LibraryViewHandlers } from './types'
import { bookChapters, bookNextChapter, bookProgress, bookReadingState } from './bookModel'
import { artifactLink, formatStatus, objectHref, parseMetadata, sourceCreator, sourceTitle } from './types'

// Theme-aware folio spine colors; these follow custom and dark theme tokens.
const BOOK_ACCENTS = ['var(--studio-cypress)', 'var(--studio-map)', 'var(--studio-due)', 'var(--studio-secondary)']

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

  return { label, linkable: branch.linkable !== false && branch.verified !== false }
}

export const computeBookProgress = bookProgress

function bookOfflineArtifactSnapshot(artifact?: LibraryRecord | null) {
  if (!artifact?.id) return null
  const metadata = parseMetadata(artifact.metadata || artifact.metadata_json)
  return {
    id: artifact.id,
    filename: artifact.filename,
    media_type: artifact.media_type,
    size_bytes: artifact.size_bytes,
    created_at: artifact.created_at,
    metadata: {
      pair_id: metadata.pair_id,
      role: metadata.role,
      publication_state: metadata.publication_state,
      validation_status: metadata.validation_status,
      revision: metadata.revision,
      receipt_sha256: metadata.receipt_sha256,
      validation_receipt_sha256: metadata.validation_receipt_sha256,
      chapter_key: metadata.chapter_key,
      chapter_number: metadata.chapter_number,
      source_title: metadata.source_title,
    },
  }
}

function bookOfflineSnapshot(book: LibraryRecord) {
  const chapters = bookChapters(book).map((chapter) => {
    const verifiedPair = offlinePairResources(chapter.html, chapter.pdf, `${book.id}:${chapter.key}`)
    return {
      key: chapter.key,
      title: chapter.title,
      number: chapter.number,
      position: chapter.position,
      completed: chapter.completed,
      completed_at: chapter.completed_at,
      html: verifiedPair.length === 2 ? bookOfflineArtifactSnapshot(chapter.html) : null,
      pdf: verifiedPair.length === 2 ? bookOfflineArtifactSnapshot(chapter.pdf) : null,
    }
  })
  const progress = computeBookProgress(book)
  const nextChapter = bookNextChapter({ ...book, book_chapters: chapters, visual: { chapters } })
  const item = {
    id: book.id,
    video_title: book.video_title,
    title: book.title,
    creator: book.creator,
    author: book.author,
    content_type: book.content_type,
    video_url: book.video_url,
    url: book.url,
    notebook_url: book.notebook_url,
    status: book.status,
    learning_state: book.learning_state,
    queue_state: book.queue_state,
    reading_state: bookReadingState(book),
    created_at: book.created_at,
    updated_at: book.updated_at,
    why_this: book.why_this,
    isbn: book.isbn || parseMetadata(book.source_metadata_json).isbn,
    branch: book.branch,
    branch_id: book.branch_id,
    branch_label: book.branch_label,
    branch_status: book.branch_status,
    super_category: book.super_category,
    domain: book.domain,
    is_primary: book.is_primary,
    progress,
    next_chapter: nextChapter,
    visual: { chapters, progress, next_chapter: nextChapter },
    canon_memberships: (Array.isArray(book.canon_memberships) ? book.canon_memberships : []).map(
      (membership: LibraryRecord) => ({
        entry_id: membership.entry_id,
        domain_id: membership.domain_id,
        domain_slug: membership.domain_slug,
        domain_title: membership.domain_title,
        domain_boundary: membership.domain_boundary,
        role: membership.role,
      }),
    ),
    threads: (Array.isArray(book.threads) ? book.threads : []).map((thread: LibraryRecord) => ({
      id: thread.id,
      title: thread.title,
      role: thread.role,
      status: thread.status,
      expected_contribution: thread.expected_contribution,
    })),
  }
  const artifacts = chapters.flatMap((chapter) => [chapter.html, chapter.pdf]).filter(Boolean)
  return {
    offline_snapshot: true,
    item,
    sessions: [],
    threads: item.threads,
    annotations: [],
    learning_units: [],
    disposition: null,
    feedback: [],
    consolidation: null,
    notes: [],
    artifacts,
    companion: nextChapter?.html || nextChapter?.pdf || null,
    companions: { html: nextChapter?.html || null, pdf: nextChapter?.pdf || null },
    visual: item.visual,
    book_chapters: chapters,
    progress,
    next_chapter: nextChapter,
    canon_memberships: item.canon_memberships,
    srs: { drafts: [], cards: [], recall_summary: book.recall || { count: 0, due: 0 } },
    outcome: null,
    memory_influences: [],
    proposals: [],
    jobs: [],
  }
}

function chapterOfflineResources(book: LibraryRecord, chapter: LibraryRecord | null): OfflinePackResource[] {
  if (!chapter) return []
  const pair = offlinePairResources(chapter.html, chapter.pdf, `${book.id}:${chapter.key}`)
  return pair.length
    ? [
        ...pair,
        offlineDataResource(
          `/capture/${encodeURIComponent(String(book.id))}/record`,
          String(book.id),
          bookOfflineSnapshot(book),
        ),
      ]
    : []
}

function bookOfflineResources(book: LibraryRecord): OfflinePackResource[] {
  const pairs = bookChapters(book).flatMap((chapter) =>
    offlinePairResources(chapter.html, chapter.pdf, `${book.id}:${chapter.key}`),
  )
  return pairs.length
    ? [
        ...pairs,
        offlineDataResource(
          `/capture/${encodeURIComponent(String(book.id))}/record`,
          String(book.id),
          bookOfflineSnapshot(book),
        ),
      ]
    : []
}

const BOOK_PAGE_SIZE = 8

type BookState = 'reading' | 'saved' | 'finished'
type BookFilter = 'all' | BookState

const BOOK_STATE_ORDER: BookState[] = ['reading', 'saved', 'finished']
const BOOK_STATE_LABELS: Record<BookState, string> = {
  reading: 'Reading now',
  saved: 'Saved for later',
  finished: 'Finished',
}

type BookBranchGroup = {
  key: string
  id: string
  representative: LibraryRecord
  books: LibraryRecord[]
  states: Record<BookState, LibraryRecord[]>
}

function bookBranchKey(book: LibraryRecord) {
  return String(book.branch?.id || book.branch?.label || 'unassigned')
}

function bookBranchLabel(book: LibraryRecord) {
  return String(book.branch?.label || 'Unassigned branch')
}

function bookCanonKeys(book: LibraryRecord) {
  const memberships = Array.isArray(book.canon_memberships) ? book.canon_memberships : []
  return memberships.map((membership: LibraryRecord) =>
    String(membership.domain_id || membership.domain_slug || membership.domain_title || ''),
  )
}

function bookSearchText(book: LibraryRecord) {
  const canon = (Array.isArray(book.canon_memberships) ? book.canon_memberships : []).map(
    (membership: LibraryRecord) => `${membership.domain_title || ''} ${membership.role || ''}`,
  )
  const threads = (Array.isArray(book.threads) ? book.threads : []).map((thread: LibraryRecord) => thread.title || '')
  return [
    sourceTitle(book),
    sourceCreator(book),
    book.why_this,
    book.branch?.label,
    parseMetadata(book.source_metadata_json).isbn,
    ...canon,
    ...threads,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function CanonMembershipTags({ book, className }: { book: LibraryRecord; className: string }) {
  const memberships = Array.isArray(book.canon_memberships) ? book.canon_memberships : []
  if (!memberships.length) return null
  return (
    <span class="book-canon-memberships">
      {memberships.map((membership: LibraryRecord, index: number) => (
        <a
          class={className}
          href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`}
          key={String(membership.entry_id || `${membership.domain_id}-${membership.role}-${index}`)}
        >
          Canon · {formatStatus(membership.role)} · {membership.domain_title}
        </a>
      ))}
    </span>
  )
}

function ThreadConnectionTags({ book, className }: { book: LibraryRecord; className: string }) {
  const threads = Array.isArray(book.threads) ? book.threads : []
  if (!threads.length) return null
  return (
    <span class="book-thread-connections" aria-label="Connected Learning Threads">
      {threads.map((thread: LibraryRecord) => (
        <a class={className} href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`} key={String(thread.id)}>
          <Icon name="path" size={11} />
          <span>Thread · {thread.title}</span>
        </a>
      ))}
    </span>
  )
}

function BookBranchPill({ book, className = '' }: { book: LibraryRecord; className?: string }) {
  const branchInfo = formatBranchPill(book.branch)
  if (!branchInfo) return null
  const classes = `book-branch-pill ${className}`.trim()
  const content = (
    <>
      <Icon name="branch" size={12} />
      <span>{branchInfo.label}</span>
    </>
  )
  return branchInfo.linkable ? (
    <a class={classes} href={`#/map/branch/${encodeURIComponent(String(book.branch?.id || branchInfo.label))}`}>
      {content}
    </a>
  ) : (
    <span class={`${classes} is-unverified`} aria-label={`Unverified branch ${branchInfo.label}`}>
      {content}
    </span>
  )
}

export function ReadingFormatLinks({
  book,
  chapter,
  className = '',
}: {
  book: LibraryRecord
  chapter: LibraryRecord | null
  className?: string
}) {
  if (!chapter) return null
  const notebookUrl = String(book.notebook_url || book.metadata?.notebook_url || '').trim()
  const formats = [
    chapter.html?.id ? { label: 'HTML', href: artifactLink(chapter.html), kind: 'html' } : null,
    chapter.pdf?.id ? { label: 'PDF', href: artifactLink(chapter.pdf), kind: 'pdf' } : null,
    notebookUrl ? { label: 'NotebookLM · online only', href: notebookUrl, kind: 'notebooklm' } : null,
  ].filter(Boolean) as Array<{ label: string; href: string; kind: string }>

  if (!formats.length) return <p class="reading-fold-no-format">No reading format is attached to this chapter yet.</p>
  return (
    <div class={`reading-fold-formats ${className}`.trim()} aria-label={`Reading formats for ${chapter.title}`}>
      {formats.map((format) => (
        <a
          class={`reading-format reading-format-${format.kind}`}
          href={format.href}
          target="_blank"
          rel="noreferrer"
          key={format.kind}
        >
          <span>{format.label}</span>
          <Icon name="external" size={14} />
        </a>
      ))}
    </div>
  )
}

export function BookKnowledgeContext({ book }: { book: LibraryRecord }) {
  return (
    <div class="reading-fold-context" aria-label="Book knowledge context">
      <BookBranchPill book={book} className="reading-fold-branch-pill" />
      <CanonMembershipTags book={book} className="reading-fold-context-link" />
      <ThreadConnectionTags book={book} className="reading-fold-context-link" />
    </div>
  )
}

export function BooksView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const books = useMemo(() => (Array.isArray(data.books) ? data.books : []), [data.books])
  const primaryBook = useMemo(() => books.find((book: LibraryRecord) => Boolean(book.is_primary)) || null, [books])
  const [showAddForm, setShowAddForm] = useState(false)
  const branchDeck = useData<{ existing?: LibraryRecord[] }>(showAddForm ? '/brain/branch-deck' : undefined)
  const branchOptions = useMemo(
    () => (branchDeck.data?.existing || []).filter((branch) => String(branch.status || '').toLowerCase() !== 'pruned'),
    [branchDeck.data?.existing],
  )
  const [bookSearch, setBookSearch] = useState('')
  const [bookFilter, setBookFilter] = useState<BookFilter>('all')
  const [showBookFacets, setShowBookFacets] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedCanon, setSelectedCanon] = useState('')
  const [visibleBookCount, setVisibleBookCount] = useState(BOOK_PAGE_SIZE)
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newIsbn, setNewIsbn] = useState('')
  const [newWhyThis, setNewWhyThis] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newBranchId, setNewBranchId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addError, setAddError] = useState('')
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addTitleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showAddForm) return
    addTitleRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAddForm()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [showAddForm])

  useEffect(() => {
    setVisibleBookCount(BOOK_PAGE_SIZE)
  }, [bookSearch, bookFilter, selectedBranch, selectedCanon, books.length])

  const closeAddForm = () => {
    setShowAddForm(false)
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  const handleAddSubmit = async (event: Event) => {
    event.preventDefault()
    if (!newTitle.trim() || !newAuthor.trim() || !newBranchId) return
    setIsSubmitting(true)
    setAddError('')
    try {
      await handlers.onAddBook({
        title: newTitle.trim(),
        author: newAuthor.trim(),
        branch_id: newBranchId,
        isbn: newIsbn.trim() || undefined,
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
      setAddError(
        error instanceof Error ? error.message : 'The book could not be added. Your entries have been preserved.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const progress = primaryBook ? computeBookProgress(primaryBook) : null
  const nextChapter = primaryBook ? bookNextChapter(primaryBook) : null
  const nextOfflineResources = primaryBook ? chapterOfflineResources(primaryBook, nextChapter) : []
  const readingComplete = Boolean(progress && progress.total > 0 && progress.finished >= progress.total)
  const bookCounts = useMemo(
    () =>
      books.reduce(
        (counts, book) => {
          counts[bookReadingState(book)] += 1
          return counts
        },
        { saved: 0, reading: 0, finished: 0 },
      ),
    [books],
  )
  const branchFacets = useMemo(() => {
    const facets = new Map<string, { key: string; label: string; count: number; current: boolean }>()
    for (const book of books) {
      const key = bookBranchKey(book)
      const existing = facets.get(key)
      facets.set(key, {
        key,
        label: bookBranchLabel(book),
        count: (existing?.count || 0) + 1,
        current: Boolean(existing?.current || book.is_primary),
      })
    }
    return [...facets.values()].sort(
      (left, right) => Number(right.current) - Number(left.current) || left.label.localeCompare(right.label),
    )
  }, [books])
  const canonFacets = useMemo(() => {
    const facets = new Map<string, { key: string; label: string; count: number }>()
    for (const book of books) {
      const memberships = Array.isArray(book.canon_memberships) ? book.canon_memberships : []
      for (const membership of memberships) {
        const key = String(membership.domain_id || membership.domain_slug || membership.domain_title || '')
        const label = String(membership.domain_title || '').trim()
        if (!key || !label) continue
        const existing = facets.get(key)
        facets.set(key, { key, label, count: (existing?.count || 0) + 1 })
      }
    }
    return [...facets.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [books])
  const filteredBooks = useMemo(() => {
    const needle = bookSearch.trim().toLowerCase()
    const currentBranchKey = primaryBook ? bookBranchKey(primaryBook) : ''
    return [...books]
      .filter((book) => bookFilter === 'all' || bookReadingState(book) === bookFilter)
      .filter((book) => !selectedBranch || bookBranchKey(book) === selectedBranch)
      .filter((book) => !selectedCanon || bookCanonKeys(book).includes(selectedCanon))
      .filter((book) => !needle || bookSearchText(book).includes(needle))
      .sort((left, right) => {
        const branchPriority =
          Number(bookBranchKey(right) === currentBranchKey) - Number(bookBranchKey(left) === currentBranchKey)
        if (branchPriority) return branchPriority
        const branchDifference = bookBranchLabel(left).localeCompare(bookBranchLabel(right))
        if (branchDifference) return branchDifference
        const stateOrder: Record<BookState, number> = { reading: 0, saved: 1, finished: 2 }
        const stateDifference = stateOrder[bookReadingState(left)] - stateOrder[bookReadingState(right)]
        if (stateDifference) return stateDifference
        const primaryDifference = Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary))
        if (primaryDifference) return primaryDifference
        return sourceTitle(left).localeCompare(sourceTitle(right))
      })
  }, [books, bookFilter, bookSearch, primaryBook, selectedBranch, selectedCanon])
  const visibleBooks = useMemo(() => {
    const branchBuckets = new Map<string, LibraryRecord[]>()
    for (const book of filteredBooks) {
      const key = bookBranchKey(book)
      branchBuckets.set(key, [...(branchBuckets.get(key) || []), book])
    }
    const buckets = [...branchBuckets.values()]
    const ordered: LibraryRecord[] = []
    const positions = buckets.map(() => 0)

    // Keep the leading branch useful while ensuring the first page previews the wider library.
    const leadingCount = Math.min(4, buckets[0]?.length || 0)
    if (buckets[0]) {
      ordered.push(...buckets[0].slice(0, leadingCount))
      positions[0] = leadingCount
    }
    while (ordered.length < filteredBooks.length) {
      let added = false
      for (let offset = 1; offset <= buckets.length; offset++) {
        const index = offset % buckets.length
        const book = buckets[index][positions[index]]
        if (!book) continue
        ordered.push(book)
        positions[index] += 1
        added = true
      }
      if (!added) break
    }
    return ordered.slice(0, visibleBookCount)
  }, [filteredBooks, visibleBookCount])
  const hiddenBookCount = Math.max(0, filteredBooks.length - visibleBooks.length)
  const visibleBookGroups = useMemo(() => {
    const groups = new Map<string, BookBranchGroup>()
    for (const book of visibleBooks) {
      const key = bookBranchKey(book)
      const group: BookBranchGroup = groups.get(key) || {
        key,
        id: key.replace(/[^a-zA-Z0-9_-]/g, '-'),
        representative: book,
        books: [],
        states: { reading: [], saved: [], finished: [] },
      }
      group.books.push(book)
      group.states[bookReadingState(book)].push(book)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [visibleBooks])

  const addBookButton = (
    <button
      ref={addButtonRef}
      type="button"
      class={`books-add-trigger ${showAddForm ? 'is-active' : ''}`}
      onClick={() => (showAddForm ? closeAddForm() : setShowAddForm(true))}
      aria-expanded={showAddForm}
      aria-controls="books-add-panel"
    >
      <Icon name={showAddForm ? 'close' : 'capture'} size={15} />
      <span>{showAddForm ? 'Close form' : 'Add a book'}</span>
    </button>
  )

  return (
    <div class="folio-books-view books-reading-fold books-room">
      <div class="folio-view-intro">
        <div>
          <p class="folio-kicker">Library and reading desk</p>
          <h1>Books</h1>
          <p>Current reading desk, personal book collection, and canon memberships.</p>
        </div>
      </div>
      {primaryBook ? (
        <section
          id="books-reading-desk"
          class="reading-fold-current books-current-desk"
          aria-labelledby="current-book-title"
        >
          <div class="reading-fold-current-head">
            <div class="reading-fold-head-main">
              <div class="reading-fold-status-line">
                <span class="reading-fold-status">
                  <Icon name="pin" size={12} />
                  Current Book
                </span>
              </div>
              <h2 id="current-book-title">
                <a href={objectHref('book', String(primaryBook.id))}>{sourceTitle(primaryBook)}</a>
              </h2>
              <p class="reading-fold-author">{sourceCreator(primaryBook)}</p>
            </div>
            <div class="reading-fold-head-side">
              <a class="reading-fold-overview-link" href={objectHref('book', String(primaryBook.id))}>
                Open book overview
              </a>
              <OfflinePackControl
                compact
                packId={`book:${primaryBook.id}`}
                title={sourceTitle(primaryBook)}
                scope="book"
                resources={bookOfflineResources(primaryBook)}
              />
            </div>
          </div>

          {progress && progress.total > 0 && (
            <div class="reading-fold-progress">
              <div class="reading-fold-progress-meta">
                <span>
                  {progress.finished} of {progress.total} chapters completed
                </span>
                <strong>{progress.percent}%</strong>
              </div>
              <div
                class="reading-fold-progress-track"
                role="progressbar"
                aria-label={`${sourceTitle(primaryBook)} reading progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
              >
                <span style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}

          <BookKnowledgeContext book={primaryBook} />
          {String(primaryBook.video_url || '').trim() && (
            <SourceHealthControl
              sourceId={String(primaryBook.id)}
              sourceUrl={String(primaryBook.video_url)}
              companionHref={
                nextOfflineResources.length
                  ? nextChapter?.html?.id
                    ? artifactLink(nextChapter.html)
                    : nextChapter?.pdf?.id
                      ? artifactLink(nextChapter.pdf)
                      : null
                  : null
              }
              onReplaced={() => handlers.onReload?.()}
            />
          )}

          {nextChapter ? (
            <section
              class={`reading-fold-next ${readingComplete ? 'is-reading-complete' : ''}`}
              aria-labelledby="next-chapter-title"
            >
              <div class="reading-fold-next-info">
                <span class="reading-fold-next-kicker">{readingComplete ? 'Reading complete' : 'Up next to read'}</span>
                <h3 id="next-chapter-title">
                  {readingComplete ? (
                    `All ${progress?.total || 0} chapters finished`
                  ) : (
                    <>
                      {nextChapter.number ? `${nextChapter.number}. ` : ''}
                      {nextChapter.title}
                    </>
                  )}
                </h3>
              </div>
              <div class="reading-fold-next-actions">
                <ReadingFormatLinks book={primaryBook} chapter={nextChapter} />
                <OfflinePackControl
                  compact
                  packId={`book-chapter:${primaryBook.id}:${nextChapter.key}`}
                  title={`${sourceTitle(primaryBook)} — ${nextChapter.title}`}
                  scope="book-chapter"
                  resources={nextOfflineResources}
                />
                <button
                  type="button"
                  class={`reading-fold-done ${nextChapter.completed ? 'is-completed' : ''}`}
                  onClick={() => handlers.onCompleteChapter(primaryBook, nextChapter)}
                  disabled={handlers.busyId === `${primaryBook.id}:${nextChapter.key}`}
                  aria-busy={handlers.busyId === `${primaryBook.id}:${nextChapter.key}`}
                >
                  <Icon name={nextChapter.completed ? 'back' : 'check'} size={15} />
                  <span>
                    {handlers.busyId === `${primaryBook.id}:${nextChapter.key}`
                      ? 'Saving…'
                      : nextChapter.completed
                        ? readingComplete
                          ? 'Reopen final chapter'
                          : 'Reopen chapter'
                        : 'Mark finished'}
                  </span>
                </button>
              </div>
            </section>
          ) : (
            <div class="reading-fold-next reading-fold-next-empty">
              <div class="reading-fold-next-info">
                <span class="reading-fold-next-kicker">Status</span>
                <h3 id="next-chapter-title">No chapters registered yet</h3>
                <p class="reading-fold-empty-hint">Add chapter breakdown to track reading and attach companions.</p>
              </div>
              <a class="reading-fold-overview-link" href={objectHref('book', String(primaryBook.id))}>
                <span>Open book overview</span>
                <Icon name="chevron" size={14} />
              </a>
            </div>
          )}

          {primaryBook && bookChapters(primaryBook).length > 0 && (
            <details class="reading-fold-chapter-disclosure">
              <summary>
                <div class="reading-fold-summary-label">
                  <Icon name="book" size={15} />
                  <span>All chapters</span>
                </div>
                <span class="reading-fold-summary-side">
                  <small>{bookChapters(primaryBook).length} chapters</small>
                  <Icon name="chevron" size={15} class="disclosure-chevron" />
                </span>
              </summary>
              <div class="reading-fold-disclosure-content">
                <BookChapterRows book={primaryBook} handlers={handlers} />
              </div>
            </details>
          )}
        </section>
      ) : (
        <section class="reading-fold-empty" aria-labelledby="choose-current-title">
          <Icon name="book" size={24} />
          <h2 id="choose-current-title">{books.length ? 'Choose a current book' : 'Add your first book'}</h2>
          <p>
            {books.length
              ? 'Make a title current from My Books to activate the reading desk.'
              : 'Save one title to create your reading desk and chapter ledger.'}
          </p>
          {!books.length && addBookButton}
        </section>
      )}

      <div class="books-room-workspaces">
        <section id="books-library" class="reading-fold-library books-library-panel" aria-labelledby="my-books-heading">
          <div class="reading-fold-library-content">
            <div class="reading-fold-library-topline">
              <span id="my-books-heading">
                <strong>My books</strong>
                <small>
                  {bookCounts.reading} reading · {bookCounts.saved} saved · {bookCounts.finished} finished
                </small>
              </span>
              {!showAddForm && Boolean(books.length) && addBookButton}
            </div>

            {showAddForm && (
              <section id="books-add-panel" class="books-add-panel" aria-labelledby="books-add-title">
                <header>
                  <div>
                    <p class="folio-object-kicker">New personal book</p>
                    <h3 id="books-add-title">Add a book</h3>
                  </div>
                  <button type="button" onClick={closeAddForm} aria-label="Close add book form">
                    <Icon name="close" size={16} />
                  </button>
                </header>
                <form
                  onSubmit={handleAddSubmit}
                  aria-describedby={branchDeck.error || addError ? 'books-add-errors' : undefined}
                >
                  <div class="reading-fold-add-grid">
                    <label>
                      Title
                      <input
                        ref={addTitleRef}
                        value={newTitle}
                        onInput={(event) => setNewTitle((event.currentTarget as HTMLInputElement).value)}
                        required
                      />
                    </label>
                    <label>
                      Author
                      <input
                        value={newAuthor}
                        onInput={(event) => setNewAuthor((event.currentTarget as HTMLInputElement).value)}
                        required
                      />
                    </label>
                    <label>
                      Branch
                      <select
                        value={newBranchId}
                        onChange={(event) => setNewBranchId((event.currentTarget as HTMLSelectElement).value)}
                        required
                        disabled={branchDeck.loading || !branchOptions.length}
                      >
                        <option value="">
                          {branchDeck.loading
                            ? 'Loading branches…'
                            : branchOptions.length
                              ? 'Choose a branch'
                              : 'No active branches available'}
                        </option>
                        {branchOptions.map((branch) => (
                          <option value={String(branch.id)} key={String(branch.id)}>
                            {branch.label}
                            {branch.category_label ? ` · ${branch.category_label}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ISBN <span>optional</span>
                      <input
                        value={newIsbn}
                        onInput={(event) => setNewIsbn((event.currentTarget as HTMLInputElement).value)}
                      />
                    </label>
                    <label class="reading-fold-add-wide">
                      Book URL <span>optional</span>
                      <input
                        type="url"
                        value={newUrl}
                        onInput={(event) => setNewUrl((event.currentTarget as HTMLInputElement).value)}
                      />
                    </label>
                    <label class="reading-fold-add-wide">
                      Why save it? <span>optional</span>
                      <textarea
                        value={newWhyThis}
                        onInput={(event) => setNewWhyThis((event.currentTarget as HTMLTextAreaElement).value)}
                      />
                    </label>
                  </div>
                  {(branchDeck.error || addError) && (
                    <div id="books-add-errors" class="reading-fold-form-errors" role="alert">
                      {branchDeck.error && (
                        <p class="reading-fold-form-error">
                          Branches could not be loaded. Retry before adding this book.
                        </p>
                      )}
                      {addError && <p class="reading-fold-form-error">{addError}</p>}
                    </div>
                  )}
                  <div class="reading-fold-add-actions">
                    <button
                      type="submit"
                      disabled={isSubmitting || !newTitle.trim() || !newAuthor.trim() || !newBranchId}
                    >
                      {isSubmitting ? 'Saving…' : 'Save book'}
                    </button>
                    <button type="button" onClick={closeAddForm}>
                      Cancel
                    </button>
                  </div>
                </form>
              </section>
            )}

            <div class="books-library-toolbar">
              <div class="books-library-search-wrap">
                <Icon name="search" size={15} class="books-library-search-icon" />
                <input
                  class="books-library-search"
                  type="search"
                  value={bookSearch}
                  onInput={(event) => setBookSearch((event.currentTarget as HTMLInputElement).value)}
                  aria-label="Search My Books"
                  placeholder="Search title, author, branch, Canon, or Thread…"
                />
                {bookSearch && (
                  <button type="button" onClick={() => setBookSearch('')} aria-label="Clear My Books search">
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
              <div class="books-library-controls">
                <div class="books-library-filters" role="group" aria-label="Filter My Books by reading status">
                  {(
                    [
                      ['all', 'All', books.length],
                      ['reading', 'Reading', bookCounts.reading],
                      ['saved', 'Saved', bookCounts.saved],
                      ['finished', 'Finished', bookCounts.finished],
                    ] as Array<[BookFilter, string, number]>
                  ).map(([key, label, count]) => (
                    <button
                      type="button"
                      class={`books-library-filter ${bookFilter === key ? 'is-active' : ''}`}
                      aria-pressed={bookFilter === key}
                      onClick={() => setBookFilter(key)}
                      key={key}
                    >
                      <span>{label}</span>
                      <small>{count}</small>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  class={`books-library-facet-toggle ${showBookFacets ? 'is-active' : ''}`}
                  aria-expanded={showBookFacets}
                  aria-controls="books-library-facets"
                  onClick={() => setShowBookFacets((open) => !open)}
                >
                  <Icon name="branch" size={14} />
                  <span>Branches &amp; Canon</span>
                  {(selectedBranch || selectedCanon) && (
                    <small>{Number(Boolean(selectedBranch)) + Number(Boolean(selectedCanon))}</small>
                  )}
                  <Icon name="chevron" size={13} class={showBookFacets ? 'is-up' : ''} />
                </button>
              </div>
            </div>

            {showBookFacets && (
              <div id="books-library-facets" class="books-library-facet-panel">
                <div class="books-library-facet-group" role="group" aria-label="Filter My Books by branch">
                  <strong>Branches</strong>
                  <div>
                    <button
                      type="button"
                      class={!selectedBranch ? 'is-active' : ''}
                      aria-pressed={!selectedBranch}
                      onClick={() => setSelectedBranch('')}
                    >
                      Any branch
                    </button>
                    {branchFacets.map((facet) => (
                      <button
                        type="button"
                        class={selectedBranch === facet.key ? 'is-active' : ''}
                        aria-pressed={selectedBranch === facet.key}
                        onClick={() => setSelectedBranch(selectedBranch === facet.key ? '' : facet.key)}
                        key={facet.key}
                      >
                        <span>{facet.label}</span>
                        <small>{facet.count}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div class="books-library-facet-group" role="group" aria-label="Filter My Books by Canon field">
                  <strong>Canon fields</strong>
                  <div>
                    <button
                      type="button"
                      class={!selectedCanon ? 'is-active' : ''}
                      aria-pressed={!selectedCanon}
                      onClick={() => setSelectedCanon('')}
                    >
                      Any field
                    </button>
                    {canonFacets.map((facet) => (
                      <button
                        type="button"
                        class={selectedCanon === facet.key ? 'is-active' : ''}
                        aria-pressed={selectedCanon === facet.key}
                        onClick={() => setSelectedCanon(selectedCanon === facet.key ? '' : facet.key)}
                        key={facet.key}
                      >
                        <span>{facet.label}</span>
                        <small>{facet.count}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div class="books-library-results" aria-live="polite">
              <span>
                {filteredBooks.length} {filteredBooks.length === 1 ? 'title' : 'titles'}
              </span>
              {(bookSearch || bookFilter !== 'all' || selectedBranch || selectedCanon) && (
                <button
                  type="button"
                  onClick={() => {
                    setBookSearch('')
                    setBookFilter('all')
                    setSelectedBranch('')
                    setSelectedCanon('')
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>

            <div class="books-library-list" aria-label="My Books results">
              {visibleBookGroups.map((group) => (
                <section
                  class="books-library-branch-group"
                  aria-label={`${bookBranchLabel(group.representative)} books`}
                  key={group.key}
                >
                  <header class="books-library-branch-heading">
                    <BookBranchPill book={group.representative} className="books-library-group-branch-pill" />
                    <small>
                      {group.books.length} {group.books.length === 1 ? 'title' : 'titles'} shown
                    </small>
                  </header>
                  <div class="books-library-branch-bands">
                    {BOOK_STATE_ORDER.map((state) =>
                      group.states[state].length ? (
                        <section
                          class={`books-library-state-band state-${state}`}
                          aria-labelledby={`books-${group.id}-${state}`}
                          key={state}
                        >
                          <header class="books-library-state-heading">
                            <strong id={`books-${group.id}-${state}`}>{BOOK_STATE_LABELS[state]}</strong>
                            <span>{group.states[state].length}</span>
                          </header>
                          {group.states[state].map((book) => {
                            const isPrimary = String(book.id) === String(primaryBook?.id || '')
                            const titleId = `books-library-title-${String(book.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`
                            return (
                              <article
                                class={`books-library-row ${isPrimary ? 'is-primary' : ''}`}
                                data-state={state}
                                aria-labelledby={titleId}
                                key={String(book.id)}
                              >
                                <div class="books-library-row-copy">
                                  <h3 id={titleId}>
                                    <a href={objectHref('book', String(book.id))}>{sourceTitle(book)}</a>
                                  </h3>
                                  <div class="books-library-row-meta">
                                    <p>
                                      {sourceCreator(book)} · {formatStatus(state)}
                                    </p>
                                    <BookBranchPill book={book} className="books-library-branch-pill" />
                                  </div>
                                </div>
                                <div class="books-library-row-action">
                                  {isPrimary ? (
                                    <span class="reading-fold-current-mark">
                                      <Icon name="pin" size={13} />
                                      Current
                                    </span>
                                  ) : (
                                    <button
                                      class="books-library-primary-action"
                                      type="button"
                                      aria-label={`Make ${sourceTitle(book)} the current book`}
                                      title="Make current"
                                      onClick={() => handlers.onSetBookReadingState(book, 'reading', true)}
                                      disabled={handlers.busyId === `reading-state:${book.id}`}
                                    >
                                      <Icon name="pin" size={14} />
                                      <span>Make current</span>
                                    </button>
                                  )}
                                </div>
                              </article>
                            )
                          })}
                        </section>
                      ) : null,
                    )}
                  </div>
                </section>
              ))}
              {!filteredBooks.length && (
                <div class="books-library-empty">
                  <Icon name="search" size={24} />
                  <h3>{books.length ? 'No matching books' : 'No books saved yet'}</h3>
                  <p>
                    {books.length
                      ? 'Try another title, author, branch, or reading state.'
                      : 'Add a book with a verified branch to begin your personal reading record.'}
                  </p>
                </div>
              )}
            </div>

            {filteredBooks.length > BOOK_PAGE_SIZE && (
              <div class="books-library-pagination">
                {hiddenBookCount > 0 ? (
                  <button
                    type="button"
                    class="books-library-more"
                    onClick={() =>
                      setVisibleBookCount((count) => Math.min(filteredBooks.length, count + BOOK_PAGE_SIZE))
                    }
                  >
                    <span>Show {Math.min(BOOK_PAGE_SIZE, hiddenBookCount)} more books</span>
                    <Icon name="chevron" size={15} />
                  </button>
                ) : (
                  <button type="button" class="books-library-more" onClick={() => setVisibleBookCount(BOOK_PAGE_SIZE)}>
                    <span>Show fewer books</span>
                    <Icon name="chevron" size={15} class="is-up" />
                  </button>
                )}
                <small>
                  Showing {visibleBooks.length} of {filteredBooks.length}
                </small>
              </div>
            )}
          </div>
        </section>

        <div class="reading-fold-canon">
          <LearnCanonView integrated searchQuery={bookSearch} onClearSearch={() => setBookSearch('')} />
        </div>
      </div>

      {handlers.notice && (
        <p class="reading-fold-notice" role="status">
          {handlers.notice}
        </p>
      )}
    </div>
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

        return (
          <div class={`chapter-item-row ${isDone ? 'is-completed' : ''}`} key={chapter.key || index}>
            <div class="chapter-item-left">
              <span class={`chapter-read-mark ${isDone ? 'is-done' : ''}`} aria-label={isDone ? 'Completed' : 'Unread'}>
                {isDone && <Icon name="check" size={11} />}
              </span>
              <span class="chapter-item-number">{String(chapter.number || index + 1).padStart(2, '0')}</span>
              <div class="chapter-item-info">
                <span class="chapter-title-heading">{chapter.title}</span>
                {isDone && chapter.completed_at && (
                  <span class="chapter-sub-meta">
                    <span class="meta-done">Finished · {formatDate(chapter.completed_at)}</span>
                  </span>
                )}
              </div>
            </div>

            <div class="chapter-item-actions">
              <ReadingFormatLinks book={book} chapter={chapter} />
              <button
                type="button"
                class={`chapter-row-done ${isDone ? 'is-completed' : ''}`}
                onClick={() => handlers.onCompleteChapter(book, chapter)}
                disabled={isBusy}
                aria-busy={isBusy}
              >
                {isBusy ? 'Saving…' : isDone ? 'Reopen' : 'Mark done'}
              </button>
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
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
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
      const match = line.match(/^(?:chapter\s+)?(\d+)[\s.:-]+(.*)$/i)
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
      <div
        ref={dialogRef}
        class="folio-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-dialog-title"
        aria-describedby="chapter-dialog-help"
        onKeyDown={handleDialogKeyDown}
      >
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
              <span>
                Paste or type chapter titles <small>(one chapter per line)</small>
              </span>
              <textarea
                rows={9}
                value={chapterText}
                onInput={(e) => setChapterText((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="1. The Myth of the Given&#10;2. Space of Reasons&#10;3. Empirical Constraints&#10;4. Coherence and Justification"
                required
              />
            </label>
            <p class="dialog-hint" id="chapter-dialog-help">
              Chapters create tracked milestones for your reading sessions. You can associate Arabic HTML & A4 PDF
              companions with individual chapters.
            </p>
            {error && (
              <p class="folio-inline-warning" role="alert">
                {error}
              </p>
            )}
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
