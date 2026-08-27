import test from 'node:test'
import assert from 'node:assert/strict'
import { cached, invalidate } from '../../src/cache.ts'

test('zero-TTL reads bypass both memory and edge caches', async () => {
  const priorCaches = (globalThis as any).caches
  let edgeReads = 0
  let edgeWrites = 0
  ;(globalThis as any).caches = {
    default: {
      match: async () => {
        edgeReads += 1
        return new Response(JSON.stringify('stale'))
      },
      put: async () => { edgeWrites += 1 },
      delete: async () => true,
    },
  }
  try {
    invalidate()
    let sourceReads = 0
    const first = await cached('profile.zero-ttl', 0, async () => `fresh-${++sourceReads}`)
    const second = await cached('profile.zero-ttl', 0, async () => `fresh-${++sourceReads}`)
    assert.equal(first, 'fresh-1')
    assert.equal(second, 'fresh-2')
    assert.equal(edgeReads, 0)
    assert.equal(edgeWrites, 0)
  } finally {
    invalidate()
    ;(globalThis as any).caches = priorCaches
  }
})
