import { authFetch } from './auth'

export class ApiError extends Error {
  public status: number
  public body: any
  public offlineQueued = false
  constructor(message: string, status: number, body: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function safeUUID(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID()
      } catch {
        // Fallback below
      }
    }
    if (typeof crypto.getRandomValues === 'function') {
      try {
        const bytes = new Uint8Array(16)
        crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
          .join('')
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
      } catch {
        // Fallback below
      }
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const mutationId = () => `mut_${Date.now()}_${safeUUID()}`

type ApiRequestInit = RequestInit & { timeoutMs?: number; queueOnNetworkError?: boolean }

export async function api<T = any>(url: string, init?: ApiRequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase()
  const headers = new Headers({ 'content-type': 'application/json', ...(init?.headers || {}) })
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (mutation && !headers.has('x-client-mutation-id')) headers.set('x-client-mutation-id', mutationId())
  const controller = new AbortController()
  let timedOut = false
  const timeoutMs = Math.max(1000, Number(init?.timeoutMs || (mutation ? 30000 : 15000)))
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const abortFromCaller = () => controller.abort()
  init?.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const { timeoutMs: _timeoutMs, queueOnNetworkError = true, ...requestInit } = init || {}
  let response: Response
  try {
    response = await authFetch(url, { ...requestInit, headers, signal: controller.signal })
  } catch (error) {
    const callerAborted = Boolean(init?.signal?.aborted) && !timedOut
    if (mutation && queueOnNetworkError && !callerAborted && typeof indexedDB !== 'undefined') {
      await queueOfflineMutation(url, { ...requestInit, method, headers })
      const queued = new ApiError(timedOut ? 'The request timed out and was saved for retry.' : 'The network request was saved for retry.', 0, { error: timedOut ? 'network_timeout_queued' : 'network_error_queued' })
      queued.offlineQueued = true
      throw queued
    }
    if (timedOut) throw new ApiError('The request timed out. Try again.', 0, { error: 'network_timeout' })
    throw error
  } finally {
    clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', abortFromCaller)
  }

  let body: any = {}
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      body = await response.json()
    } catch {
      const rawText = await response.text().catch(() => '')
      body = { error: 'invalid_json_response', rawText }
    }
  } else {
    const rawText = await response.text().catch(() => '')
    body = rawText ? { rawText } : {}
  }

  if (!response.ok) throw new ApiError(body?.error || body?.message || `Request failed (${response.status})`, response.status, body)
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
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  const id = headers['x-client-mutation-id'] || mutationId()
  headers['x-client-mutation-id'] = id
  await transact<IDBValidKey>('readwrite', (store, resolve, reject) => {
    const request = store.put({ id, url, method: init.method || 'POST', body: init.body || null, headers, queuedAt: new Date().toISOString(), attempts: 0, state: 'pending', error: '' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listOfflineMutations() {
  return transact<any[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(() => [])
}

async function updateOfflineMutation(item: any, patch: Record<string, unknown>) {
  await transact<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({ ...item, ...patch })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  }).catch(() => undefined)
}

export async function resolveOfflineMutation(id: string, action: 'retry' | 'discard') {
  if (action === 'discard') {
    await transact<void>('readwrite', (store, resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    }).catch(() => undefined)
    return
  }
  const item = await transact<any>('readonly', (store, resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(() => null)
  if (item) {
    await updateOfflineMutation(item, { state: 'pending', error: '' })
  }
}

let flushPromise: Promise<void> | null = null

export async function flushOfflineMutations() {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  flushPromise = (async () => {
    const queue = await listOfflineMutations()
    for (const item of queue) {
      if (item.state === 'conflict' || item.state === 'failed') continue
      try {
        await updateOfflineMutation(item, { attempts: Number(item.attempts || 0) + 1, state: 'syncing', error: '' })
        await api(item.url, { method: item.method, body: item.body || undefined, headers: { ...(item.headers || {}), 'x-client-mutation-id': item.id }, queueOnNetworkError: false })
        await transact<void>('readwrite', (store, resolve, reject) => {
          const request = store.delete(item.id)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      } catch (error: any) {
        const status = Number(error?.status || 0)
        await updateOfflineMutation(item, { state: status === 409 || status === 412 ? 'conflict' : status >= 400 && status < 500 ? 'failed' : 'pending', error: error?.message || 'Network unavailable; waiting to retry' })
        if (!status || status >= 500) break
      }
    }
  })().finally(() => { flushPromise = null })
  return flushPromise
}

export function firstArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) return item
  }
  return []
}

export const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
  : 'Not recorded'

export const labelize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
