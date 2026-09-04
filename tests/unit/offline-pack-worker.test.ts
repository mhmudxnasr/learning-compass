import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const ORIGIN = 'https://learning-compass.test'
const INDEX_CACHE = 'learning-compass-offline-pack-index-v1'
const INDEX_URL = '/__learning-compass-offline-packs__'

const cacheKey = (input: string | Request) => {
  const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN)
  return `${url.pathname}${url.search}`
}

class MemoryCache {
  readonly entries = new Map<string, Response>()
  readonly name: string
  private readonly shouldFailPut: (cacheName: string, key: string) => unknown
  private readonly afterPut: (cache: MemoryCache, key: string) => void

  constructor(
    name: string,
    shouldFailPut: (cacheName: string, key: string) => unknown,
    afterPut: (cache: MemoryCache, key: string) => void,
  ) {
    this.name = name
    this.shouldFailPut = shouldFailPut
    this.afterPut = afterPut
  }

  async put(input: string | Request, response: Response) {
    const key = cacheKey(input)
    const failure = this.shouldFailPut(this.name, key)
    if (failure) throw failure
    this.entries.set(key, response.clone())
    this.afterPut(this, key)
  }

  async match(input: string | Request) {
    return this.entries.get(cacheKey(input))?.clone()
  }

  async delete(input: string | Request) {
    return this.entries.delete(cacheKey(input))
  }

  async addAll() {}
}

function createWorkerHarness() {
  const handlers = new Map<string, (event: any) => void>()
  const cacheMap = new Map<string, MemoryCache>()
  const network = new Map<string, Response>()
  let putFailure: ((cacheName: string, key: string) => unknown) | null = null
  let afterPut: ((cache: MemoryCache, key: string) => void) | null = null
  let fetchCount = 0
  let uuid = 0
  const caches = {
    open: async (name: string) => {
      if (!cacheMap.has(name)) cacheMap.set(name, new MemoryCache(
        name,
        (cacheName, key) => putFailure?.(cacheName, key),
        (cache, key) => afterPut?.(cache, key),
      ))
      return cacheMap.get(name)!
    },
    keys: async () => [...cacheMap.keys()],
    delete: async (name: string) => cacheMap.delete(name),
    match: async (input: string | Request) => {
      for (const cache of cacheMap.values()) {
        const response = await cache.match(input)
        if (response) return response
      }
      return undefined
    },
  }
  const self = {
    location: { origin: ORIGIN },
    navigator: { storage: { estimate: async () => ({ usage: 4096, quota: 1024 * 1024 }) } },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    registration: { showNotification: async () => undefined },
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
  }
  const fetch = async (input: string | Request, init?: RequestInit) => {
    fetchCount += 1
    const key = cacheKey(input)
    const response = network.get(key)
    if (!response) throw new Error(`Unexpected network request: ${key}`)
    if (response.status >= 300 && response.status < 400 && init?.redirect === 'follow') {
      const location = response.headers.get('location')
      const redirected = location ? network.get(cacheKey(new URL(location, new URL(key, ORIGIN)).href)) : null
      if (!redirected) throw new Error(`Unexpected redirect target: ${location || '(missing)'}`)
      return redirected.clone()
    }
    return response.clone()
  }
  const context = vm.createContext({
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
    Headers,
    Blob,
    TextEncoder,
    crypto: { randomUUID: () => `test-${++uuid}` },
    console,
    Date,
    Error,
    Promise,
    Map,
    Set,
    JSON,
  })
  const source = readFileSync(new URL('../../client/public/sw.js', import.meta.url), 'utf8')
  vm.runInContext(source, context, { filename: 'client/public/sw.js' })

  const message = async (data: unknown) => {
    let waitUntil: Promise<unknown> | undefined
    let reply: unknown
    handlers.get('message')!({
      data,
      ports: [{ postMessage: (value: unknown) => { reply = value } }],
      waitUntil: (task: Promise<unknown>) => { waitUntil = task },
    })
    assert.ok(waitUntil, 'service worker message must extend its lifetime')
    await waitUntil
    return reply as any
  }

  const request = async (path: string, mode: 'navigate' | 'cors' = 'cors') => {
    let response: Promise<Response | undefined> | undefined
    const url = new URL(path, ORIGIN)
    handlers.get('fetch')!({
      request: { method: 'GET', mode, destination: mode === 'navigate' ? 'document' : '', url: url.href },
      respondWith: (result: Promise<Response | undefined> | Response | undefined) => { response = Promise.resolve(result) },
    })
    return response ? await response : undefined
  }

  return {
    message,
    request,
    network,
    caches,
    cacheMap,
    fetchCount: () => fetchCount,
    failPutsWith: (failure: ((cacheName: string, key: string) => unknown) | null) => { putFailure = failure },
    afterPuts: (effect: ((cache: MemoryCache, key: string) => void) | null) => { afterPut = effect },
    index: async () => {
      const response = await (await caches.open(INDEX_CACHE)).match(INDEX_URL)
      return response ? await response.json() as Record<string, any> : {}
    },
  }
}

const byteSize = (body: string) => new TextEncoder().encode(body).byteLength

function artifact(
  role: 'html' | 'pdf',
  artifactId: string,
  pairId: string,
  body: string,
  groupId = 'source-1',
) {
  const sizeBytes = byteSize(body)
  return {
    resource: {
      url: role === 'html' ? `/artifacts/${artifactId}/view` : `/artifacts/${artifactId}`,
      role,
      artifactId,
      pairId,
      groupId,
      revision: `receipt-${pairId}-${role}`,
      sizeBytes,
    },
    response: new Response(body, {
      headers: {
        'content-type': role === 'html' ? 'text/html; charset=utf-8' : 'application/pdf',
        'x-learning-compass-artifact-id': artifactId,
        'x-learning-compass-size-bytes': String(sizeBytes),
        'x-learning-compass-pair-id': pairId,
        'x-learning-compass-pair-role': role,
        'x-learning-compass-publication-state': 'ready',
        'x-learning-compass-validation-status': 'passed',
      },
    }),
  }
}

function pack(version: string, pairId = version) {
  const html = artifact('html', `html-${version}`, pairId, `<!doctype html><p>${version}</p>`)
  const pdf = artifact('pdf', `pdf-${version}`, pairId, `%PDF-1.7\n${version}\n%%EOF`)
  const snapshot = { id: 'source-1', learning_state: 'queued' }
  const data = {
    url: '/capture/source-1/record',
    role: 'data' as const,
    groupId: 'source-1',
    revision: `snapshot-${version}`,
    sizeBytes: byteSize(JSON.stringify(snapshot)),
    snapshot,
  }
  return {
    request: { id: 'source:source-1', title: 'Source one', scope: 'source', version, resources: [html.resource, pdf.resource, data] },
    responses: [html, pdf],
    expectedSize: html.resource.sizeBytes + pdf.resource.sizeBytes + data.sizeBytes,
  }
}

function installResponses(harness: ReturnType<typeof createWorkerHarness>, built: ReturnType<typeof pack>) {
  for (const item of built.responses) {
    if (item.resource.role === 'html') {
      const rawUrl = `/artifacts/${item.resource.artifactId}`
      harness.network.set(item.resource.url, new Response(null, { status: 302, headers: { location: rawUrl } }))
      harness.network.set(rawUrl, item.response)
    } else {
      harness.network.set(item.resource.url, item.response)
    }
  }
}

test('service worker saves an exact coherent pack, detects eviction and supersession, then removes it', async () => {
  const harness = createWorkerHarness()
  const first = pack('v1', 'pair-1')
  installResponses(harness, first)

  const saved = await harness.message({ action: 'offline-pack:save', pack: first.request })
  assert.equal(saved.state, 'ready', saved.error)
  assert.equal(saved.sizeBytes, first.expectedSize)
  assert.equal(saved.resourceCount, 3)

  harness.network.clear()
  assert.equal(await (await harness.request(first.responses[0].resource.url, 'navigate'))!.text(), '<!doctype html><p>v1</p>')
  assert.equal(await (await harness.request(first.responses[1].resource.url, 'navigate'))!.text(), '%PDF-1.7\nv1\n%%EOF')
  assert.deepEqual(await (await harness.request('/capture/source-1/record'))!.json(), { id: 'source-1', learning_state: 'queued' })
  assert.equal(await harness.request('/learning/srs/due'), undefined)

  const ready = await harness.message({ action: 'offline-pack:status', packId: first.request.id, expectedVersion: 'v1' })
  assert.equal(ready.state, 'ready')
  const superseded = await harness.message({ action: 'offline-pack:status', packId: first.request.id, expectedVersion: 'v2' })
  assert.equal(superseded.state, 'superseded')

  const index = await harness.index()
  await harness.cacheMap.get(index[first.request.id].cacheName)!.delete(first.responses[1].resource.url)
  const partial = await harness.message({ action: 'offline-pack:status', packId: first.request.id, expectedVersion: 'v1' })
  assert.equal(partial.state, 'partial')
  assert.deepEqual([...partial.missing], [first.responses[1].resource.url])

  const removed = await harness.message({ action: 'offline-pack:remove', packId: first.request.id })
  assert.equal(removed.state, 'not-downloaded')
  assert.equal(removed.stored, false)
  assert.deepEqual(await harness.index(), {})
})

test('failed or quota-blocked refresh keeps the previous complete version atomically', async () => {
  const harness = createWorkerHarness()
  const first = pack('v1', 'pair-1')
  installResponses(harness, first)
  const initial = await harness.message({ action: 'offline-pack:save', pack: first.request })
  assert.equal(initial.state, 'ready', initial.error)
  const committed = (await harness.index())[first.request.id]

  const changed = pack('v2', 'pair-2')
  installResponses(harness, changed)
  const pdf = changed.responses[1]
  harness.network.set(pdf.resource.url, new Response('%PDF-short', { headers: pdf.response.headers }))
  const failed = await harness.message({ action: 'offline-pack:save', pack: changed.request })
  assert.equal(failed.state, 'error')
  assert.equal(failed.stored, true)
  assert.equal((await harness.index())[first.request.id].cacheName, committed.cacheName)
  assert.equal((await harness.message({ action: 'offline-pack:status', packId: first.request.id, expectedVersion: 'v1' })).state, 'ready')

  installResponses(harness, changed)
  harness.failPutsWith((cacheName, key) => cacheName.includes('learning-compass-offline-pack-v1:') && key === changed.responses[0].resource.url
    ? Object.assign(new Error(''), { name: 'QuotaExceededError' })
    : null)
  const quota = await harness.message({ action: 'offline-pack:save', pack: changed.request })
  assert.equal(quota.state, 'storage-full')
  assert.equal(quota.stored, true)
  assert.equal((await harness.index())[first.request.id].cacheName, committed.cacheName)
  assert.equal((await harness.message({ action: 'offline-pack:status', packId: first.request.id, expectedVersion: 'v1' })).state, 'ready')

  harness.failPutsWith(null)
  harness.afterPuts((cache, key) => {
    if (key === changed.responses[1].resource.url) cache.entries.delete(changed.responses[0].resource.url)
  })
  const evictedWhileStaging = await harness.message({ action: 'offline-pack:save', pack: changed.request })
  assert.equal(evictedWhileStaging.state, 'storage-full')
  assert.equal(evictedWhileStaging.stored, true)
  assert.equal((await harness.index())[first.request.id].cacheName, committed.cacheName)
  assert.equal((await harness.message({ action: 'offline-pack:status', packId: first.request.id, expectedVersion: 'v1' })).state, 'ready')
})

test('service worker rejects external/original, NotebookLM, recall, and duplicate-role resources before fetching', async () => {
  for (const forbidden of [
    { url: 'https://example.com/original', role: 'data', groupId: 'source-1', sizeBytes: 2, snapshot: {} },
    { url: 'https://notebooklm.google.com/notebook/1', role: 'data', groupId: 'source-1', sizeBytes: 2, snapshot: {} },
    { url: '/learning/srs/due', role: 'data', groupId: 'source-1', sizeBytes: 2, snapshot: {} },
  ]) {
    const harness = createWorkerHarness()
    const built = pack('v1', 'pair-1')
    installResponses(harness, built)
    const result = await harness.message({ action: 'offline-pack:save', pack: { ...built.request, resources: [...built.request.resources, forbidden] } })
    assert.equal(result.state, 'error')
    assert.equal(harness.fetchCount(), 0)
    assert.deepEqual(await harness.index(), {})
  }

  const harness = createWorkerHarness()
  const built = pack('v1', 'pair-1')
  installResponses(harness, built)
  const duplicateHtml = artifact('html', 'html-duplicate', 'pair-1', '<p>duplicate</p>')
  harness.network.set(duplicateHtml.resource.url, duplicateHtml.response)
  const result = await harness.message({ action: 'offline-pack:save', pack: { ...built.request, resources: [...built.request.resources, duplicateHtml.resource] } })
  assert.equal(result.state, 'error')
  assert.equal(harness.fetchCount(), 0)
})
