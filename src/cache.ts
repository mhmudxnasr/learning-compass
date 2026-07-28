// In-memory TTL cache for hot endpoints
// Lives per-isolate (CF Workers isolate lifetime ~ ms to minutes).
// Good enough for single-user rate reduction across requests within the same isolate.
// NOT shared across isolates — no consistency issues since D1 is the source of truth.

interface CacheEntry {
  data: any
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = store.get(key)
  if (existing && existing.expiresAt > now) {
    return existing.data as T
  }
  const data = await fetcher()
  store.set(key, { data, expiresAt: now + ttlMs })
  return data
}

export function invalidate(keyPrefix?: string): void {
  if (!keyPrefix) { store.clear(); return }
  for (const k of store.keys()) {
    if (k.startsWith(keyPrefix)) store.delete(k)
  }
}


