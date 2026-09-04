import assert from 'node:assert/strict'
import test from 'node:test'
import { itemHref, parseRoute } from '../../client/src/app/router.ts'

test('source appearances share the same item identity and scoped material links', () => {
  const id = 'source/Arabic & English?'
  const ordinary = itemHref({ id })
  assert.equal(itemHref({ recommendation_id: id, content_type: 'video' }), ordinary)
  assert.equal(itemHref({ id, item_type: 'movie' }), ordinary)
  const route = parseRoute(itemHref({ recommendation_id: id }, 'notes'))
  assert.equal(route.objectId, id)
  assert.equal(route.objectType, 'source')
  assert.equal(route.query.get('tab'), 'notes')
  assert.equal(Boolean(route.notFound), false)
  assert.equal(route.recoveredFrom, undefined, 'an item section is not a legacy route')
})

test('books opened through personal history and chapter context retain the owning book page', () => {
  const book = itemHref({ id: 'book 1', content_type: 'book' }, 'files')
  assert.equal(itemHref({ id: 'book 1', item_type: 'book' }, 'files'), book)
  assert.equal(itemHref({ id: 'chapter 2', book_id: 'book 1', is_book_chapter: true }, 'files'), book)
  const route = parseRoute(book)
  assert.equal(route.objectType, 'book')
  assert.equal(route.objectId, 'book 1')
  assert.equal(route.query.get('tab'), 'files')
  assert.equal(route.recoveredFrom, undefined)
})

test('local item query state preserves genuine legacy route recovery', () => {
  const current = parseRoute('#/library/source/one?annotation=passage-1&tab=notes')
  assert.equal(current.recoveredFrom, undefined)
  assert.equal(current.query.get('annotation'), 'passage-1')
  const legacy = parseRoute('#/learn/book/one?tab=notes')
  assert.equal(legacy.objectType, 'book')
  assert.equal(legacy.query.get('tab'), 'notes')
  assert.equal(legacy.recoveredFrom, '/learn/book/one')
})
