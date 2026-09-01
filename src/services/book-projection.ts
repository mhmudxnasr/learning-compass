export type BookReadingState = 'saved' | 'reading' | 'finished'

type Row = Record<string, any>

export type BookChapter = {
  key: string
  title: string
  number: number | null
  position: number | null
  completed: boolean
  completed_at: string | null
  html: Row | null
  pdf: Row | null
}

const parseObject = (value: unknown): Row => {
  if (value && typeof value === 'object') return value as Row
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const positiveNumber = (...values: unknown[]) => {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return null
}

const artifactIsNewer = (candidate: Row, current: Row) => {
  const candidateCreated = String(candidate.created_at || '')
  const currentCreated = String(current.created_at || '')
  if (candidateCreated !== currentCreated) return candidateCreated > currentCreated
  return String(candidate.id || '').localeCompare(String(current.id || '')) > 0
}

export function resolveBookReadingState(book: Row): BookReadingState {
  const metadata = parseObject(book.source_metadata_json ?? book.source_metadata)
  const explicit = String(metadata.book_reading_state || '')
    .trim()
    .toLowerCase()
  if (explicit === 'saved' || explicit === 'reading' || explicit === 'finished') return explicit
  if (book.status === 'consumed' || book.learning_state === 'completed') return 'finished'
  if (book.learning_state === 'in_progress') return 'reading'
  return 'saved'
}

export function resolveBookPrimary(book: Row) {
  const metadata = parseObject(book.source_metadata_json ?? book.source_metadata)
  return metadata.book_primary === true || metadata.book_primary === 1
}

export function isSyntheticWholeBookChapter(row: Row) {
  const key = String(row.chapter_key ?? row.key ?? '')
    .trim()
    .toLowerCase()
  const position = Number(row.position ?? row.number ?? row.chapter_number ?? 0)
  return key === 'book' && position === 0
}

export function chapterMetadataFromArtifact(metadata: Row, requestedKey: string, fallbackPosition: number) {
  const key = String(metadata.chapter_key || '').trim()
  if (!key || key !== requestedKey || isSyntheticWholeBookChapter(metadata)) return null
  const number =
    positiveNumber(metadata.position, metadata.number, metadata.chapter_number, key.match(/^chapter-(\d+)$/i)?.[1]) ||
    fallbackPosition
  const title =
    String(metadata.chapter_title || metadata.title || `Chapter ${number}`)
      .trim()
      .slice(0, 500) || `Chapter ${number}`
  return { key, title, position: number }
}

export function normalizeBookChapters(chapterRows: Row[] = [], artifactRows: Row[] = []): BookChapter[] {
  const chapters = new Map<string, BookChapter>()
  const chapterArtifacts = new Map<string, Row[]>()

  const ensureChapter = (row: Row) => {
    if (isSyntheticWholeBookChapter(row)) return null
    const number = positiveNumber(row.position, row.number, row.chapter_number)
    const key = String(row.chapter_key ?? row.key ?? (number ? `chapter-${number}` : '')).trim()
    if (!key) return null
    const existing = chapters.get(key)
    if (existing) return existing
    const chapter: BookChapter = {
      key,
      title: String(row.chapter_title ?? row.title ?? (number ? `Chapter ${number}` : key)).trim() || key,
      number,
      position: number,
      completed: Boolean(row.completed || row.completed_at),
      completed_at: row.completed_at || null,
      html: null,
      pdf: null,
    }
    chapters.set(key, chapter)
    return chapter
  }

  for (const row of chapterRows) {
    const key = String(row.chapter_key ?? row.key ?? '').trim()
    const existing = key ? chapters.get(key) : null
    const chapter = ensureChapter(row)
    if (!chapter) continue
    if (!existing) continue
    const number = positiveNumber(row.position, row.number, row.chapter_number)
    chapter.title = String(row.chapter_title ?? row.title ?? chapter.title).trim() || chapter.title
    chapter.number = number ?? chapter.number
    chapter.position = number ?? chapter.position
    chapter.completed = Boolean(row.completed || row.completed_at)
    chapter.completed_at = row.completed_at || null
  }

  for (const artifact of artifactRows) {
    const metadata = parseObject(artifact.metadata_json ?? artifact.metadata)
    if (
      ['staged', 'superseded'].includes(
        String(metadata.publication_state || '')
          .trim()
          .toLowerCase(),
      )
    )
      continue
    if (!metadata.chapter_key || isSyntheticWholeBookChapter(metadata)) continue
    const role = String(metadata.role || '').toLowerCase()
    if (role !== 'html' && role !== 'pdf') continue
    const chapter = ensureChapter(metadata)
    if (!chapter) continue
    const candidate = {
      id: artifact.id,
      filename: artifact.filename,
      size_bytes: artifact.size_bytes,
      media_type: artifact.media_type,
      quality_assurance: artifact.quality_assurance,
      created_at: artifact.created_at,
      metadata,
      metadata_json: artifact.metadata_json,
    }
    chapterArtifacts.set(chapter.key, [...(chapterArtifacts.get(chapter.key) || []), candidate])
  }

  for (const chapter of chapters.values()) {
    const artifacts = chapterArtifacts.get(chapter.key) || []
    const pairs = new Map<string, Row[]>()
    const legacy: Row[] = []
    for (const artifact of artifacts) {
      const pairId = String(artifact.metadata?.pair_id || '').trim()
      if (pairId) pairs.set(pairId, [...(pairs.get(pairId) || []), artifact])
      else legacy.push(artifact)
    }
    const completePairs = [...pairs.values()]
      .filter(
        (pair) =>
          pair.some((artifact) => artifact.metadata?.role === 'html') &&
          pair.some((artifact) => artifact.metadata?.role === 'pdf'),
      )
      .sort((left, right) => {
        const newestLeft = [...left].sort((a, b) => (artifactIsNewer(a, b) ? -1 : artifactIsNewer(b, a) ? 1 : 0))[0]
        const newestRight = [...right].sort((a, b) => (artifactIsNewer(a, b) ? -1 : artifactIsNewer(b, a) ? 1 : 0))[0]
        return artifactIsNewer(newestLeft, newestRight) ? -1 : artifactIsNewer(newestRight, newestLeft) ? 1 : 0
      })
    if (completePairs[0]) {
      chapter.html = completePairs[0].find((artifact) => artifact.metadata?.role === 'html') || null
      chapter.pdf = completePairs[0].find((artifact) => artifact.metadata?.role === 'pdf') || null
      continue
    }
    for (const artifact of legacy) {
      const role = String(artifact.metadata?.role || '').toLowerCase()
      if ((role === 'html' || role === 'pdf') && (!chapter[role] || artifactIsNewer(artifact, chapter[role])))
        chapter[role] = artifact
    }
  }

  return [...chapters.values()].sort((left, right) => {
    if (left.number !== null && right.number !== null && left.number !== right.number) return left.number - right.number
    if (left.number !== null) return -1
    if (right.number !== null) return 1
    return left.title.localeCompare(right.title) || left.key.localeCompare(right.key)
  })
}

export function projectBook(book: Row, chapterRows: Row[] = [], artifactRows: Row[] = []) {
  const chapters = normalizeBookChapters(chapterRows, artifactRows)
  const completed = chapters.filter((chapter) => chapter.completed).length
  const total = chapters.length
  const percent = total ? Math.round((completed / total) * 100) : 0
  const nextChapter =
    chapters.find((chapter) => !chapter.completed) || (chapters.length ? chapters[chapters.length - 1] : null)
  return {
    reading_state: resolveBookReadingState(book),
    is_primary: resolveBookPrimary(book),
    queue_state: String(book.learning_state || 'captured'),
    visual: {
      status: total ? 'ready' : 'not_started',
      chapters,
      progress: { completed, total, percent },
      next_chapter: nextChapter,
    },
    progress: { completed, total, percent },
    next_chapter: nextChapter,
  }
}
