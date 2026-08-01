export class ApiError extends Error {
  status: number
  body: any
  offlineQueued = false
  constructor(message: string, status: number, body: any) { super(message); this.name = 'ApiError'; this.status = status; this.body = body }
}

const mutationId = () => `mut_${Date.now()}_${crypto.randomUUID()}`

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase()
  const headers = new Headers({ 'content-type': 'application/json', ...(init?.headers || {}) })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers.has('x-client-mutation-id')) headers.set('x-client-mutation-id', mutationId())
  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (error) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineMutation(url, { ...init, method, headers })
      const queued = new ApiError('Saved offline. It will sync when you reconnect.', 0, { error: 'offline_queued' })
      queued.offlineQueued = true
      throw queued
    }
    throw error
  }
  const body: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status})`, response.status, body)
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
  const id = mutationId()
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  await transact<IDBValidKey>('readwrite', (store, resolve, reject) => {
    const request = store.add({ id, url, method: init.method || 'POST', body: init.body || null, headers, queuedAt: new Date().toISOString(), attempts: 0, state: 'pending', error: '' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function listOfflineMutations() {
  return transact<any[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  }).catch(() => [])
}
async function updateOfflineMutation(item: any, patch: Record<string, unknown>) {
  await transact<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({ ...item, ...patch }); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error)
  }).catch(() => undefined)
}
export async function resolveOfflineMutation(id: string, action: 'retry' | 'discard') {
  const items = await listOfflineMutations()
  const item = items.find((candidate) => candidate.id === id)
  if (!item) return
  if (action === 'discard') {
    await transact<void>('readwrite', (store, resolve, reject) => { const request = store.delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
    return
  }
  await updateOfflineMutation(item, { state: 'pending', error: '' })
}
export async function flushOfflineMutations() {
  if (!navigator.onLine) return
  const queue = await listOfflineMutations()
  for (const item of queue) {
    if (item.state === 'conflict' || item.state === 'failed') continue
    try {
      await updateOfflineMutation(item, { attempts: Number(item.attempts || 0) + 1, state: 'syncing', error: '' })
      await api(item.url, { method: item.method, body: item.body || undefined, headers: { ...(item.headers || {}), 'x-client-mutation-id': item.id } })
      await transact<void>('readwrite', (store, resolve, reject) => { const request = store.delete(item.id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
    } catch (error: any) {
      const status = Number(error?.status || 0)
      await updateOfflineMutation(item, { state: status === 409 || status === 412 ? 'conflict' : status >= 400 && status < 500 ? 'failed' : 'pending', error: error?.message || 'Offline; waiting to reconnect' })
      if (!status || status >= 500) break
    }
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
