import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchHardcoverSnapshot,
  hardcoverAuthor,
  hardcoverBookState,
  hardcoverCover,
  normalizeHardcoverToken,
} from '../../src/services/hardcover.ts'

test('Hardcover helpers normalize authentication, covers, authors, and statuses', () => {
  assert.equal(normalizeHardcoverToken('token'), 'Bearer token')
  assert.equal(normalizeHardcoverToken('Bearer token'), 'Bearer token')
  assert.equal(hardcoverCover({ url: 'https://images.example/cover.jpg' }), 'https://images.example/cover.jpg')
  assert.equal(hardcoverCover({ url: 'javascript:alert(1)' }), null)
  assert.equal(
    hardcoverAuthor([{ author: { name: 'Ursula K. Le Guin' } }, { name: 'Editor' }]),
    'Ursula K. Le Guin, Editor',
  )
  assert.equal(hardcoverBookState(1), 'planned')
  assert.equal(hardcoverBookState(2), 'in_progress')
  assert.equal(hardcoverBookState(3), 'completed')
  assert.equal(hardcoverBookState(4), 'dropped')
})

test('Hardcover snapshot is authenticated and paginates the private library', async () => {
  const calls: Array<{ query: string; authorization: string | null }> = []
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    calls.push({ query: body.query, authorization: new Headers(init?.headers).get('authorization') })
    const data = body.query.includes('HardcoverUser')
      ? { me: [{ id: 7, username: 'reader' }] }
      : { user_books: [{ id: 9, book_id: 11, status_id: 2, book: { id: 11, title: 'A Book' }, user_book_reads: [] }] }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const snapshot = await fetchHardcoverSnapshot('secret', fetcher as typeof fetch)
  assert.equal(snapshot.userId, 7)
  assert.equal(snapshot.books.length, 1)
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.authorization === 'Bearer secret'))
})

test('Hardcover GraphQL errors never produce a partial snapshot or expose credential detail', async () => {
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        errors: [
          { message: 'authorization=header-credential-value https://provider.test/fail?token=query-credential-value' },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  await assert.rejects(
    () => fetchHardcoverSnapshot('bad', fetcher as typeof fetch),
    (error: any) => {
      assert.doesNotMatch(error.message, /credential-value/)
      assert.match(error.message, /\[redacted\]/)
      return true
    },
  )
})
