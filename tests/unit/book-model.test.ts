import assert from 'node:assert/strict'
import test from 'node:test'
import { bookChapters, bookNextChapter } from '../../client/src/workspaces/library/bookModel.ts'

test('legacy client chapter normalization matches trimmed server keys and positive positions', () => {
  const book = {
    book_chapters: [
      { chapter_key: ' book ', chapter_title: 'Synthetic', chapter_number: 0 },
      { chapter_key: ' book ', chapter_title: 'Legitimate', chapter_number: 3 },
      { chapter_key: ' chapter-1 ', chapter_title: 'One', chapter_number: 1, completed_at: '2026-08-22' },
      { chapter_title: 'Two', chapter_number: 2 },
    ],
  }
  assert.deepEqual(bookChapters(book).map((chapter) => [chapter.key, chapter.number, chapter.completed]), [
    ['book', 3, false],
    ['chapter-1', 1, true],
    ['chapter-2', 2, false],
  ])
})

test('next chapter never reintroduces a filtered synthetic canonical fallback', () => {
  const book = {
    visual: {
      chapters: [{ key: 'book', title: 'Synthetic', number: 0 }, { key: 'chapter-1', title: 'One', number: 1 }],
      next_chapter: { key: 'book', title: 'Synthetic', number: 0 },
    },
  }
  assert.equal(bookNextChapter(book)?.key, 'chapter-1')
})
