// Multi-tier TTL cache: in-memory fast path + Cloudflare Edge Cache API (when available)
// Falls back gracefully in Node.js test environments.

interface CacheEntry {
  data: any
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

function getEdgeCache(): any {
  if (typeof caches === 'undefined') return null
  return (caches as any).default || null
}

function makeCacheKey(key: string): Request {
  return new Request(`https://cache.local/${encodeURIComponent(key)}`, {
    method: 'GET',
  })
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  // A zero TTL is an explicit no-cache contract used by mutation-confirming
  // reads. Do not let the Edge Cache's one-second minimum resurrect stale
  // state immediately after a write or revert.
  if (ttlMs <= 0) return fetcher()

  const now = Date.now()
  const inMemory = store.get(key)
  if (inMemory && inMemory.expiresAt > now) {
    return inMemory.data as T
  }

  // Check Cloudflare Edge Cache
  const edgeCache = getEdgeCache()
  if (edgeCache) {
    try {
      const cachedResponse = await edgeCache.match(makeCacheKey(key))
      if (cachedResponse) {
        const data = (await cachedResponse.json()) as T
        store.set(key, { data, expiresAt: now + Math.min(ttlMs, 30000) })
        return data
      }
    } catch {
      // Fallback silently if edge cache read fails
    }
  }

  const data = await fetcher()
  store.set(key, { data, expiresAt: now + ttlMs })

  // Write to Cloudflare Edge Cache
  if (edgeCache && data !== undefined && data !== null) {
    try {
      const maxAgeSeconds = Math.max(1, Math.floor(ttlMs / 1000))
      const response = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
        },
      })
      await edgeCache.put(makeCacheKey(key), response)
    } catch {
      // Ignore cache put errors
    }
  }

  return data
}

export function invalidate(keyPrefix?: string): void {
  if (!keyPrefix) {
    store.clear()
    return
  }
  const edgeCache = getEdgeCache()
  for (const k of store.keys()) {
    if (k.startsWith(keyPrefix)) {
      store.delete(k)
      if (edgeCache) {
        try {
          edgeCache.delete(makeCacheKey(k)).catch(() => undefined)
        } catch {
          // Ignore edge delete errors
        }
      }
    }
  }
}
