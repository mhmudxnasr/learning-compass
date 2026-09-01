import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  bookStateFromPersonalState,
  normalizePersonalLibraryInput,
  personalLibraryDedupKey,
  personalStateFromBookState,
} from '../../src/services/personal-library.ts'

test('personal-library input normalizes typed progress, direct ratings, and bounded tags', () => {
  const result = normalizePersonalLibraryInput({
    title: '  Severance  ',
    creator: 'Dan Erickson',
    item_type: 'series',
    state: 'in_progress',
    branch_id: 'storytelling',
    release_year: '2022',
    progress_current: '4',
    progress_total: '10',
    rating: '8.5',
    tags: ['work', 'mystery', 'work', ''],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value, {
    title: 'Severance',
    creator: 'Dan Erickson',
    item_type: 'series',
    state: 'in_progress',
    branch_id: 'storytelling',
    url: '',
    release_year: 2022,
    duration_minutes: null,
    progress_current: 4,
    progress_total: 10,
    progress_unit: 'episodes',
    rating: 8.5,
    rating_label: 'love',
    tags: ['work', 'mystery'],
    personal_note: '',
  })
})

test('personal-library validation protects book identity and progress bounds', () => {
  assert.deepEqual(
    normalizePersonalLibraryInput({ title: 'A book', item_type: 'book', state: 'planned', branch_id: 'books' }),
    { ok: false, error: 'author required for books' },
  )
  assert.deepEqual(
    normalizePersonalLibraryInput({
      title: 'A show',
      item_type: 'series',
      state: 'planned',
      branch_id: 'tv',
      progress_current: 11,
      progress_total: 10,
    }),
    { ok: false, error: 'progress_current cannot exceed progress_total' },
  )
  assert.deepEqual(normalizePersonalLibraryInput({ title: 'A movie', item_type: 'movie', state: 'planned' }), {
    ok: false,
    error: 'branch_id required',
  })
})

test('personal-library identity remains deterministic for URL-free and Unicode records', () => {
  const first = personalLibraryDedupKey({ title: 'فيلم تجريبي', creator: 'مخرج', item_type: 'movie', url: '' })
  const second = personalLibraryDedupKey({ title: 'فيلم تجريبي', creator: 'مخرج', item_type: 'movie', url: '' })
  const series = personalLibraryDedupKey({ title: 'فيلم تجريبي', creator: 'مخرج', item_type: 'series', url: '' })
  assert.equal(first, second)
  assert.notEqual(first, series)
  assert.match(first, /^personal_movie_/)
})

test('book and personal states synchronize without making Queue the reading model', () => {
  assert.equal(personalStateFromBookState('saved'), 'planned')
  assert.equal(personalStateFromBookState('reading'), 'in_progress')
  assert.equal(personalStateFromBookState('finished'), 'completed')
  assert.equal(bookStateFromPersonalState('planned'), 'saved')
  assert.equal(bookStateFromPersonalState('paused'), 'saved')
  assert.equal(bookStateFromPersonalState('in_progress'), 'reading')
  assert.equal(bookStateFromPersonalState('completed'), 'finished')
})

test('the API, global Capture, and Settings studio expose one editable personal-data contract', () => {
  const captureApi = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
  const recommendationsApi = readFileSync(new URL('../../src/api/recommendations.ts', import.meta.url), 'utf8')
  const captureDialog = readFileSync(new URL('../../client/src/shell/CaptureDialog.tsx', import.meta.url), 'utf8')
  const studio = readFileSync(
    new URL('../../client/src/workspaces/settings/PersonalDataStudio.tsx', import.meta.url),
    'utf8',
  )
  assert.match(captureApi, /app\.get\('\/personal'/)
  assert.match(captureApi, /app\.post\('\/personal'/)
  assert.match(captureApi, /app\.patch\('\/personal\/:id'/)
  assert.match(captureDialog, /Book.*Movie.*Series.*Podcast.*Course.*Game.*Album/s)
  assert.match(captureDialog, /\/capture\/personal/)
  assert.match(recommendationsApi, /personal-library-reading-state:/)
  assert.match(recommendationsApi, /source: 'books_reading_state'/)
  assert.match(recommendationsApi, /source: 'books_chapter_progress'/)
  assert.match(studio, /What you track/)
  assert.match(studio, /Where things stand/)
  assert.match(studio, /Edit every useful field/)
  assert.match(studio, /method: 'PATCH'/)
})

test('book-state reconciliation repairs consumed books imported before explicit metadata existed', () => {
  const migration = readFileSync(
    new URL('../../migrations/0065_reconcile_personal_book_states.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /r\.status = 'consumed'/)
  assert.match(migration, /m\.learning_state = 'completed'/)
  assert.match(migration, /book_reading_state.*finished/)
  assert.match(migration, /state = 'completed'/)
})
