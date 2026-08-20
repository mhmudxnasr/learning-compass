import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { dedupeHardcoverJournalEntries, fetchHardcoverSnapshot, hardcoverAuthor, hardcoverCover, hardcoverPosition, normalizeHardcoverJournalEntry, normalizeHardcoverToken } from '../../src/services/hardcover.ts'

const journalViewSource = readFileSync(new URL('../../client/src/workspaces/library/HardcoverJournalView.tsx', import.meta.url), 'utf8')

test('Reading journal defaults to books with highlights or notes and retains an all-books escape hatch', () => {
  assert.match(journalViewSource, /useState<'journaled' \| 'all'>\('journaled'\)/)
  assert.match(journalViewSource, /bookScope === 'all' \|\| bookEntries\.length > 0/)
  assert.match(journalViewSource, /'With entries'/)
  assert.match(journalViewSource, /'All books'/)
  assert.doesNotMatch(journalViewSource, /Add to Compass|Compass branch|Choose a branch/)
  assert.match(journalViewSource, /Your reading journal/)
  assert.match(journalViewSource, /<span>Journaled<\/span>/)
  assert.match(journalViewSource, /Search journal/)
  assert.doesNotMatch(journalViewSource, /In Compass/)
})

test('Hardcover helpers normalize secrets and cached book metadata', () => {
  assert.equal(normalizeHardcoverToken('token'), 'Bearer token')
  assert.equal(normalizeHardcoverToken('Bearer token'), 'Bearer token')
  assert.equal(hardcoverCover({ url: 'https://images.example/cover.jpg' }), 'https://images.example/cover.jpg')
  assert.equal(hardcoverCover({ url: 'javascript:alert(1)' }), null)
  assert.equal(hardcoverAuthor([{ author: { name: 'Ursula Le Guin' } }, { name: 'Editor' }]), 'Ursula Le Guin, Editor')
  assert.deepEqual(hardcoverPosition({ position: { type: 'pages', value: 42, possible: 320 } }), { page: 42, totalPages: 320 })
})

test('Hardcover journal cleanup removes resend duplicates and imported line wrapping', () => {
  const duplicated = [
    { id: 30, book_id: 11, event: 'quote', entry: 'First line\r\nsecond line', action_at: '2026-08-19T10:00:00Z', metadata: { position: { value: 42, possible: 320 } } },
    { id: 20, book_id: 11, event: 'quote', entry: 'First line\nsecond line', action_at: '2026-08-19T10:00:00Z', metadata: { position: { value: 42, possible: 320 } } },
    { id: 21, book_id: 11, event: 'note', entry: 'A thought.\n\nAnother thought.', action_at: '2026-08-19T11:00:00Z', metadata: { position: { value: 43, possible: 320 } } },
    { id: 22, book_id: 11, event: 'quote', entry: 'First line second line', action_at: '2026-08-20T10:00:00Z', metadata: { position: { value: 42, possible: 320 } } },
  ]

  assert.equal(normalizeHardcoverJournalEntry('  سطر أول\n\nسطر ثانٍ  '), 'سطر أول سطر ثانٍ')
  const cleaned = dedupeHardcoverJournalEntries(duplicated)
  assert.equal(cleaned.length, 3)
  assert.deepEqual(cleaned.map((entry) => entry.id), [20, 21, 22])
  assert.deepEqual(cleaned.map((entry) => entry.entry), ['First line second line', 'A thought. Another thought.', 'First line second line'])
})

test('Hardcover snapshot fetches the authenticated library and note/quote journal server-side', async () => {
  const calls: Array<{ query: string; headers: Headers }> = []
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body || '{}'))
    calls.push({ query: request.query, headers: new Headers(init?.headers) })
    const data = request.query.includes('HardcoverUser')
      ? { me: [{ id: 7, username: 'reader' }] }
      : request.query.includes('HardcoverBooks')
        ? { user_books: [{ id: 9, book_id: 11, status_id: 2, book: { id: 11, title: 'A Book' }, user_book_reads: [] }] }
        : { reading_journals: [{ id: 13, book_id: 11, event: 'quote', entry: 'A passage', action_at: '2026-08-19T00:00:00Z' }] }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const snapshot = await fetchHardcoverSnapshot('secret', fetcher as typeof fetch)
  assert.equal(snapshot.userId, 7)
  assert.equal(snapshot.books.length, 1)
  assert.equal(snapshot.journals.length, 1)
  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => call.headers.get('authorization') === 'Bearer secret'))
  assert.ok(calls.some((call) => call.query.includes('event: {_in: ["note", "quote"]}')))
})

test('Hardcover API errors do not return an incomplete snapshot', async () => {
  const fetcher = async () => new Response(JSON.stringify({ errors: [{ message: 'expired token' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  await assert.rejects(() => fetchHardcoverSnapshot('bad', fetcher as typeof fetch), /expired token/)
})
