import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearRecentSearchItems,
  readRecentSearchItems,
  rememberSearchItem,
} from '../../client/src/shell/recentSearchItems.ts'

Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true })

test('recent search remembers bounded unique items, refreshes titles, and clears history', (t) => {
  const data = new Map<string, string>()
  t.mock.property(globalThis, 'localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } as unknown as Storage)
  for (let i = 0; i < 12; i++) rememberSearchItem({ href: `#/learn/note/${i}`, title: `Note ${i}`, meta: 'Notes' })
  assert.equal(readRecentSearchItems().length, 8)
  rememberSearchItem({ href: '#/learn/note/5', title: 'Renamed note', meta: 'Notes' })
  assert.equal(readRecentSearchItems()[0].title, 'Renamed note')
  assert.equal(readRecentSearchItems().filter((item) => item.href === '#/learn/note/5').length, 1)
  const previous = readRecentSearchItems()
  rememberSearchItem({ href: 'https://example.com', title: 'External', meta: 'Source' })
  assert.deepEqual(readRecentSearchItems(), previous)
  clearRecentSearchItems()
  assert.deepEqual(readRecentSearchItems(), [])
})

test('recent search tolerates corrupt or unavailable browser storage', (t) => {
  t.mock.property(globalThis, 'localStorage', {
    getItem: () => '{broken',
    setItem: () => {
      throw new Error('denied')
    },
  } as unknown as Storage)
  assert.deepEqual(readRecentSearchItems(), [])
  const item = { href: '#/library/book/one', title: 'A book', meta: 'Book' }
  assert.deepEqual(rememberSearchItem(item), [item])
})
