import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBookChapters, projectBook, resolveBookReadingState } from '../../src/services/book-projection.ts'

test('explicit personal reading state takes precedence over legacy Queue and source state', () => {
  assert.equal(resolveBookReadingState({ status: 'consumed', learning_state: 'completed', source_metadata_json: '{"book_reading_state":"reading"}' }), 'reading')
  assert.equal(resolveBookReadingState({ learning_state: 'in_progress' }), 'reading')
  assert.equal(resolveBookReadingState({ status: 'consumed' }), 'finished')
  assert.equal(resolveBookReadingState({ learning_state: 'queued' }), 'saved')
})

test('chapters omit only the synthetic whole-book row, merge companions, and sort numerically', () => {
  const chapters = normalizeBookChapters([
    { chapter_key: 'chapter-10', chapter_title: 'Ten', position: 10 },
    { chapter_key: 'book', chapter_title: 'Book companion', position: 0 },
    { chapter_key: 'book', chapter_title: 'A legitimate chapter', position: 2 },
    { chapter_key: 'chapter-1', chapter_title: 'One', position: 1, completed_at: '2026-01-01' },
  ], [
    { id: 'html-1', filename: 'one.html', metadata_json: JSON.stringify({ recommendation_id: 'b1', chapter_key: 'chapter-1', chapter_number: 1, role: 'html' }) },
    { id: 'whole', filename: 'book.html', metadata_json: JSON.stringify({ recommendation_id: 'b1', chapter_key: 'book', chapter_number: 0, role: 'html' }) },
  ])
  assert.deepEqual(chapters.map((chapter) => chapter.key), ['chapter-1', 'book', 'chapter-10'])
  assert.equal(chapters[0].completed, true)
  assert.equal(chapters[0].html?.id, 'html-1')
})

test('chapter companion projection keeps the newest role with deterministic timestamp ties', () => {
  const chapters = normalizeBookChapters([], [
    { id: 'new-html', filename: 'new.html', created_at: '2026-08-22T12:00:00Z', quality_assurance: { status: 'passed' }, metadata_json: JSON.stringify({ chapter_key: 'chapter-1', chapter_number: 1, role: 'html' }) },
    { id: 'old-html', filename: 'old.html', created_at: '2026-08-21T12:00:00Z', metadata_json: JSON.stringify({ chapter_key: 'chapter-1', chapter_number: 1, role: 'html' }) },
    { id: 'tie-a', filename: 'a.pdf', created_at: '2026-08-22T12:00:00Z', metadata_json: JSON.stringify({ chapter_key: 'chapter-1', chapter_number: 1, role: 'pdf' }) },
    { id: 'tie-z', filename: 'z.pdf', created_at: '2026-08-22T12:00:00Z', metadata_json: JSON.stringify({ chapter_key: 'chapter-1', chapter_number: 1, role: 'pdf' }) },
  ])
  assert.equal(chapters[0].html?.id, 'new-html')
  assert.deepEqual(chapters[0].html?.quality_assurance, { status: 'passed' })
  assert.equal(chapters[0].pdf?.id, 'tie-z')
})

test('projection derives progress and the next unread chapter from one normalized array', () => {
  const projection = projectBook({ learning_state: 'captured' }, [
    { chapter_key: 'chapter-2', chapter_title: 'Two', position: 2 },
    { chapter_key: 'chapter-1', chapter_title: 'One', position: 1, completed_at: '2026-01-01' },
  ])
  assert.deepEqual(projection.progress, { completed: 1, total: 2, percent: 50 })
  assert.equal(projection.next_chapter?.key, 'chapter-2')
  assert.deepEqual(projection.visual.chapters, normalizeBookChapters([
    { chapter_key: 'chapter-2', chapter_title: 'Two', position: 2 },
    { chapter_key: 'chapter-1', chapter_title: 'One', position: 1, completed_at: '2026-01-01' },
  ]))
})

test('empty and fully read books have deterministic next-action projections', () => {
  const empty = projectBook({}, [])
  assert.deepEqual(empty.progress, { completed: 0, total: 0, percent: 0 })
  assert.equal(empty.next_chapter, null)

  const complete = projectBook({}, [{ chapter_key: 'chapter-1', chapter_title: 'One', position: 1, completed_at: '2026-01-01' }])
  assert.equal(complete.progress.percent, 100)
  assert.equal(complete.next_chapter?.key, 'chapter-1')
})
