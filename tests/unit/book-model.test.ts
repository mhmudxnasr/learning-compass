import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bookChapters,
  bookNextChapter,
  mergeBooksWithHardcover,
  sameBookIdentity,
} from '../../client/src/workspaces/library/bookModel.ts'

test('legacy client chapter normalization matches trimmed server keys and positive positions', () => {
  const book = {
    book_chapters: [
      { chapter_key: ' book ', chapter_title: 'Synthetic', chapter_number: 0 },
      { chapter_key: ' book ', chapter_title: 'Legitimate', chapter_number: 3 },
      { chapter_key: ' chapter-1 ', chapter_title: 'One', chapter_number: 1, completed_at: '2026-08-22' },
      { chapter_title: 'Two', chapter_number: 2 },
    ],
  }
  assert.deepEqual(
    bookChapters(book).map((chapter) => [chapter.key, chapter.number, chapter.completed]),
    [
      ['book', 3, false],
      ['chapter-1', 1, true],
      ['chapter-2', 2, false],
    ],
  )
})

test('next chapter never reintroduces a filtered synthetic canonical fallback', () => {
  const book = {
    visual: {
      chapters: [
        { key: 'book', title: 'Synthetic', number: 0 },
        { key: 'chapter-1', title: 'One', number: 1 },
      ],
      next_chapter: { key: 'book', title: 'Synthetic', number: 0 },
    },
  }
  assert.equal(bookNextChapter(book)?.key, 'chapter-1')
})

test('Hardcover matching tolerates subtitles and middle initials without collapsing different authors', () => {
  assert.equal(
    sameBookIdentity(
      { video_title: 'Predictably Irrational', creator: 'Dan Ariely' },
      { title: 'Predictably Irrational: The Hidden Forces That Shape Our Decisions', author: 'Dan Ariely' },
    ),
    true,
  )
  assert.equal(
    sameBookIdentity(
      { video_title: 'Influence: The Psychology of Persuasion', creator: 'Robert Cialdini' },
      { title: 'Influence, New and Expanded The Psychology of Persuasion', author: 'Robert B. Cialdini' },
    ),
    true,
  )
  assert.equal(
    sameBookIdentity(
      { video_title: 'Power: A Primer', creator: 'Author One' },
      { title: 'Power: Another Book', author: 'Author Two' },
    ),
    false,
  )
})

test('Books composes a read-only Hardcover mirror without importing or duplicating matching titles', () => {
  const books = [
    {
      id: 'internal-finished',
      video_title: 'Thinking, Fast and Slow',
      creator: 'Daniel Kahneman',
      reading_state: 'saved',
      is_primary: true,
      branch: { id: 'biases', label: 'Biases' },
    },
    {
      id: 'internal-saved',
      video_title: 'A Local Book',
      creator: 'Local Author',
      reading_state: 'saved',
      branch: { id: 'local', label: 'Local' },
    },
  ]
  const hardcover = [
    {
      hardcover_book_id: 1,
      recommendation_id: null,
      title: 'Thinking, Fast and Slow',
      author: 'Daniel Kahneman',
      state: 'completed',
      url: 'https://hardcover.app/books/thinking-fast-and-slow',
    },
    {
      hardcover_book_id: 2,
      recommendation_id: null,
      title: 'External Book',
      author: 'External Author',
      state: 'in_progress',
      progress_pages: 50,
      total_pages: 200,
      progress: 25,
      url: 'https://hardcover.app/books/external-book',
    },
  ]

  const merged = mergeBooksWithHardcover(books, hardcover)
  assert.equal(merged.length, 3)
  assert.equal(merged.filter((book) => /Thinking, Fast and Slow/.test(book.video_title)).length, 1)
  assert.equal(merged[0].id, 'internal-finished')
  assert.equal(merged[0].reading_state, 'finished')
  assert.equal(merged[0].reading_state_source, 'hardcover')
  assert.equal(merged[0].is_primary, false)
  assert.equal(merged[0].branch.id, 'biases')

  const external = merged.find((book) => book.hardcover_only)
  assert.equal(external?.id, 'hardcover:2')
  assert.equal(external?.reading_state, 'reading')
  assert.equal(external?.read_only, true)
  assert.deepEqual(external?.hardcover_progress, { current: 50, total: 200, percent: 25, unit: 'pages' })
  assert.equal(external?.branch, null)
})

test('an explicit Hardcover recommendation link wins over textual matching', () => {
  const merged = mergeBooksWithHardcover(
    [{ id: 'linked', video_title: 'Old display title', creator: 'Known Author', reading_state: 'saved' }],
    [
      {
        hardcover_book_id: 3,
        recommendation_id: 'linked',
        title: 'Provider display title',
        author: 'Known Author',
        state: 'completed',
      },
    ],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].reading_state, 'finished')
  assert.equal(merged[0].hardcover.hardcover_book_id, 3)
})
