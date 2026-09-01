export type PersonalBookState = 'saved' | 'reading' | 'finished'
export type BookRecord = Record<string, any>

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
