export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const body: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body as T
}

const OFFLINE_DB = 'taste-map-offline'
const OFFLINE_STORE = 'mutations'
const openOfflineDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(OFFLINE_DB, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
const transact = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) => {
  const db = await openOfflineDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE, mode)
    action(transaction.objectStore(OFFLINE_STORE), resolve, reject)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error)
  })
}
export async function queueOfflineMutation(url: string, init: RequestInit) {
  await transact<IDBValidKey>('readwrite', (store, resolve, reject) => {
    const request = store.add({ url, method: init.method || 'POST', body: init.body || null, headers: init.headers || {}, queuedAt: new Date().toISOString() })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function flushOfflineMutations() {
  if (!navigator.onLine) return
  const queue = await transact<any[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(() => [])
  for (const item of queue) {
    try {
      await api(item.url, item)
      await transact<void>('readwrite', (store, resolve, reject) => { const request = store.delete(item.id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
    } catch { break }
  }
}

export function firstArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const item of Object.values(value)) if (Array.isArray(item)) return item
  return []
}

export const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
  : 'Not recorded'

export const labelize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
