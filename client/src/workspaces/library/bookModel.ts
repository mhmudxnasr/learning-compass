export type PersonalBookState = 'saved' | 'reading' | 'finished'
export type BookRecord = Record<string, any>

function normalizeBookIdentity(value: unknown) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function titleIdentityVariants(value: unknown) {
  const title = String(value || '').trim()
  const lead = title.split(/\s+[—–-]\s+|[:,;]/u)[0]?.trim() || ''
  return new Set([title, lead].map(normalizeBookIdentity).filter(Boolean))
}

function primaryCreatorIdentity(value: unknown) {
  const primary = String(value || '').split(/,|&|\band\b/iu)[0] || ''
  return normalizeBookIdentity(primary)
    .split(' ')
    .filter((token) => token.length > 1)
    .join(' ')
}

export function sameBookIdentity(book: BookRecord, hardcoverBook: BookRecord) {
  const internalTitles = titleIdentityVariants(book.video_title || book.title)
  const hardcoverTitles = titleIdentityVariants(hardcoverBook.title || hardcoverBook.video_title)
  if (![...internalTitles].some((title) => hardcoverTitles.has(title))) return false

  const internalCreator = primaryCreatorIdentity(book.creator || book.author)
  const hardcoverCreator = primaryCreatorIdentity(hardcoverBook.author || hardcoverBook.creator)
  return !internalCreator || !hardcoverCreator || internalCreator === hardcoverCreator
}

export function hardcoverBookReadingState(book: BookRecord): PersonalBookState {
  const state = String(book.state || '')
    .trim()
    .toLowerCase()
  if (state === 'completed') return 'finished'
  if (state === 'in_progress') return 'reading'
  return 'saved'
}

function hardcoverProgress(book: BookRecord) {
  const numberOrNull = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }
  const current = numberOrNull(book.progress_pages ?? book.progress)
  const total = numberOrNull(book.total_pages)
  const percent = numberOrNull(book.progress)
  return {
    current,
    total: total && total > 0 ? total : null,
    percent: percent == null ? null : Math.min(100, Math.round(percent)),
    unit: book.progress_pages == null ? 'percent' : 'pages',
  }
}

function projectHardcoverBook(book: BookRecord): BookRecord {
  return {
    id: `hardcover:${book.hardcover_book_id}`,
    video_title: String(book.title || 'Untitled book'),
    creator: String(book.author || ''),
    content_type: 'book',
    video_url: String(book.url || ''),
    reading_state: hardcoverBookReadingState(book),
    reading_state_source: 'hardcover',
    hardcover_only: true,
    read_only: true,
    library_origin: 'hardcover',
    hardcover: book,
    hardcover_progress: hardcoverProgress(book),
    branch: null,
    canon_memberships: [],
    threads: [],
    is_primary: false,
    visual: {
      chapters: [],
      next_chapter: null,
      progress: { completed: 0, total: 0, percent: 0 },
      status: 'not_started',
    },
  }
}

export function mergeBooksWithHardcover(books: BookRecord[] = [], hardcoverBooks: BookRecord[] = []) {
  const merged = books.map((book) => ({ ...book }))
  const claimedInternal = new Set<number>()

  for (const hardcoverBook of hardcoverBooks) {
    const linkedId = String(hardcoverBook.recommendation_id || '')
    let matchIndex = linkedId
      ? merged.findIndex((book, index) => !claimedInternal.has(index) && String(book.id) === linkedId)
      : -1

    if (matchIndex < 0) {
      const candidates = merged
        .map((book, index) => ({ book, index }))
        .filter(({ book, index }) => !claimedInternal.has(index) && sameBookIdentity(book, hardcoverBook))
      if (candidates.length === 1) matchIndex = candidates[0].index
    }

    if (matchIndex >= 0) {
      claimedInternal.add(matchIndex)
      const readingState = hardcoverBookReadingState(hardcoverBook)
      merged[matchIndex] = {
        ...merged[matchIndex],
        reading_state: readingState,
        reading_state_source: 'hardcover',
        library_origin: 'learning-compass+hardcover',
        hardcover: hardcoverBook,
        hardcover_progress: hardcoverProgress(hardcoverBook),
        is_primary: readingState === 'reading' && Boolean(merged[matchIndex].is_primary),
      }
      continue
    }

    merged.push(projectHardcoverBook(hardcoverBook))
  }

  return merged
}

export function bookReadingState(book: BookRecord): PersonalBookState {
  const explicit = String(book.reading_state || '')
    .trim()
    .toLowerCase()
  if (explicit === 'saved' || explicit === 'reading' || explicit === 'finished') return explicit
  if (book.status === 'consumed' || book.learning_state === 'completed') return 'finished'
  if (book.learning_state === 'in_progress') return 'reading'
  return 'saved'
}

export function bookQueueState(book: BookRecord) {
  return String(book.queue_state || book.learning_state || 'captured')
}

export function bookChapters(book: BookRecord) {
  const chapters = book.visual?.chapters || book.book_chapters || []
  if (!Array.isArray(chapters)) return []
  return chapters.flatMap((chapter) => {
    const number =
      [chapter.position, chapter.number, chapter.chapter_number]
        .map(Number)
        .find((value) => Number.isFinite(value) && value > 0) ?? null
    const key = String(chapter.key ?? chapter.chapter_key ?? (number ? `chapter-${number}` : '')).trim()
    if (!key || (key.toLowerCase() === 'book' && number === null)) return []
    return [
      {
        ...chapter,
        key,
        title: String(chapter.title ?? chapter.chapter_title ?? (number ? `Chapter ${number}` : key)).trim() || key,
        number,
        position: number,
        completed: Boolean(chapter.completed || chapter.completed_at),
        completed_at: chapter.completed_at || null,
      },
    ]
  })
}

export function bookProgress(book: BookRecord) {
  const canonical = book.progress || book.visual?.progress
  if (canonical && Number.isFinite(Number(canonical.total))) {
    const completed = Number(canonical.completed ?? canonical.finished ?? 0)
    const total = Number(canonical.total || 0)
    return {
      completed,
      finished: completed,
      total,
      percent: total ? Number(canonical.percent ?? Math.round((completed / total) * 100)) : 0,
    }
  }
  const chapters = bookChapters(book)
  const completed = chapters.filter((chapter) => Boolean(chapter.completed || chapter.completed_at)).length
  const total = chapters.length
  return { completed, finished: completed, total, percent: total ? Math.round((completed / total) * 100) : 0 }
}

export function bookNextChapter(book: BookRecord) {
  const chapters = bookChapters(book)
  const canonical = book.next_chapter || book.visual?.next_chapter
  if (canonical) {
    const canonicalKey = String(canonical.key ?? canonical.chapter_key ?? '').trim()
    const match = chapters.find((chapter) => chapter.key === canonicalKey)
    if (match) return match
  }
  return chapters.find((chapter) => !chapter.completed && !chapter.completed_at) || chapters.at(-1) || null
}

export function chapterCompanionUrl(chapter: BookRecord | null | undefined) {
  if (!chapter) return null
  if (chapter.html?.id) return `/artifacts/${encodeURIComponent(String(chapter.html.id))}/view`
  if (chapter.pdf?.id) return `/artifacts/${encodeURIComponent(String(chapter.pdf.id))}`
  return null
}

export function chapterActionCopy(book: BookRecord, chapter = bookNextChapter(book)) {
  if (!chapter) return null
  const number = Number(chapter.number || chapter.position || 0)
  const suffix = number > 0 ? ` Chapter ${number}` : ' chapter'
  const progress = bookProgress(book)
  if (
    chapter.completed ||
    chapter.completed_at ||
    bookReadingState(book) === 'finished' ||
    (progress.total > 0 && progress.completed === progress.total)
  )
    return `Review${suffix}`
  if (bookReadingState(book) === 'saved' && progress.completed === 0) return `Start${suffix}`
  return `Continue${suffix}`
}
