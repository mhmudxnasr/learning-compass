const CACHE = 'learning-compass-shell-v62'
const DATA_CACHE = 'learning-compass-data-v5'
const ARTIFACT_CACHE = 'learning-compass-html-artifacts-v2'
const OFFLINE_PACK_PREFIX = 'learning-compass-offline-pack-v1:'
const OFFLINE_PACK_INDEX_CACHE = 'learning-compass-offline-pack-index-v1'
const OFFLINE_PACK_INDEX_URL = '/__learning-compass-offline-packs__'
let offlinePackMutation = Promise.resolve()
const CORE_ASSETS = [
  '/manifest.json',
  '/icon.svg',
  '/icons/compass-192.png',
  '/icons/compass-512.png',
  '/icons/compass-maskable-512.png',
]
const CORE_DATA = ['/dashboard/briefing']

async function cacheShell() {
  const cache = await caches.open(CACHE)
  const response = await fetch('/', { cache: 'reload' })
  if (!response.ok) throw new Error(`Shell request failed (${response.status})`)
  const html = await response.clone().text()
  await cache.put('/', response)
  const builtAssets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1])
  await cache.addAll([...new Set([...CORE_ASSETS, ...builtAssets])])
  const dataCache = await caches.open(DATA_CACHE)
  await Promise.all(
    CORE_DATA.map(async (path) => {
      try {
        const data = await fetch(path, { cache: 'no-store' })
        if (data.ok) await dataCache.put(path, data)
      } catch {
        /* shell installation remains usable if live data is temporarily unavailable */
      }
    }),
  )
}

self.addEventListener('install', (event) => event.waitUntil(cacheShell().then(() => self.skipWaiting())))
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      cleanupOrphanOfflinePackCaches(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  ![CACHE, DATA_CACHE, ARTIFACT_CACHE, OFFLINE_PACK_INDEX_CACHE].includes(key) &&
                  !key.startsWith(OFFLINE_PACK_PREFIX),
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  ),
)
self.addEventListener('push', (event) => {
  let payload = { title: 'Learning Compass', body: 'A learning review is ready.' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    /* use the safe default */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/compass-192.png',
      badge: '/icons/compass-192.png',
      data: { url: payload.url || '/#/home' },
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const target = event.notification.data?.url || '/#/home'
      const existing = windows.find((client) => 'focus' in client)
      if (existing) {
        existing.navigate(target)
        return existing.focus()
      }
      return clients.openWindow(target)
    }),
  )
})

function isAppShellNavigation(url) {
  return url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/ui')
}

function isArtifactNavigation(url) {
  return url.origin === self.location.origin && /^\/artifacts\/[^/]+(?:\/view)?$/.test(url.pathname)
}

async function fetchAppShell(request) {
  let response
  try {
    response = await fetch(request)
  } catch {
    return (await caches.match('/')) || Response.error()
  }
  if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
    try {
      const cache = await caches.open(CACHE)
      await cache.put('/', response.clone())
    } catch {
      /* a cache quota failure must not block the live shell */
    }
  }
  return response
}

async function fetchHtmlArtifact(request) {
  let response
  try {
    response = await fetch(request)
  } catch {
    try {
      return (await caches.match(request)) || Response.error()
    } catch {
      return Response.error()
    }
  }
  if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
    try {
      const cache = await caches.open(ARTIFACT_CACHE)
      await cache.put(request, response.clone())
    } catch {
      /* storage pressure must not block the live companion */
    }
  }
  return response
}

async function readOfflinePackIndex() {
  const cache = await caches.open(OFFLINE_PACK_INDEX_CACHE)
  const response = await cache.match(OFFLINE_PACK_INDEX_URL)
  if (!response) return {}
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function cleanupOrphanOfflinePackCaches(index) {
  try {
    const manifests = index || (await readOfflinePackIndex())
    const active = new Set(
      Object.values(manifests)
        .map((manifest) => manifest?.cacheName)
        .filter(Boolean),
    )
    const names = await caches.keys()
    await Promise.allSettled(
      names
        .filter((name) => name.startsWith(OFFLINE_PACK_PREFIX) && !active.has(name))
        .map((name) => caches.delete(name)),
    )
  } catch {
    /* orphan cleanup never invalidates an indexed ready pack */
  }
}

async function writeOfflinePackIndex(index) {
  const cache = await caches.open(OFFLINE_PACK_INDEX_CACHE)
  await cache.put(
    OFFLINE_PACK_INDEX_URL,
    new Response(JSON.stringify(index), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    }),
  )
}

function safePackId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '-')
    .slice(0, 180)
}

function allowedOfflineResource(resource) {
  if (!resource || !['html', 'pdf', 'data'].includes(resource.role)) return null
  let url
  try {
    url = new URL(String(resource.url || ''), self.location.origin)
  } catch {
    return null
  }
  if (url.origin !== self.location.origin) return null
  const path = url.pathname
  const allowedArtifact = /^\/artifacts\/[^/]+(?:\/view)?$/.test(path)
  const allowedData = /^\/capture\/[^/]+\/record$/.test(path) || /^\/learning\/core\/threads\/[^/]+\/path$/.test(path)
  if (resource.role === 'data' ? !allowedData : !allowedArtifact) return null
  let snapshot
  if (resource.role === 'data') {
    if (resource.snapshot === undefined) return null
    try {
      const serialized = JSON.stringify(resource.snapshot)
      if (!serialized || serialized.length > 512000) return null
      snapshot = JSON.parse(serialized)
    } catch {
      return null
    }
  }
  const sizeBytes = Number(resource.sizeBytes)
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) return null
  if (resource.role !== 'data' && !String(resource.artifactId || '').trim()) return null
  return {
    ...resource,
    ...(resource.role === 'data' ? { snapshot } : {}),
    url: `${url.pathname}${url.search}`,
    sizeBytes,
  }
}

function validateOfflinePack(pack) {
  const id = safePackId(pack?.id)
  const version = String(pack?.version || '').trim()
  const rawResources = Array.isArray(pack?.resources) ? pack.resources : []
  if (version.length > 250000) throw new Error('Offline pack version identity is too large.')
  if (!id || !version || !rawResources.length || rawResources.length > 200)
    throw new Error('A bounded, versioned offline pack is required.')
  const resources = rawResources.map(allowedOfflineResource)
  if (resources.some((resource) => !resource))
    throw new Error('Offline packs may contain only exact same-origin companions and supported metadata snapshots.')
  const unique = [...new Map(resources.map((resource) => [resource.url, resource])).values()]
  const pairs = new Map()
  for (const resource of unique.filter((item) => item.role !== 'data')) {
    const pairId = String(resource.pairId || '').trim()
    const groupId = String(resource.groupId || pairId).trim()
    if (!pairId || !groupId) throw new Error('Offline companions require exact pair identity.')
    const current = pairs.get(groupId) || []
    current.push(resource)
    pairs.set(groupId, current)
  }
  if (!pairs.size) throw new Error('Offline packs require at least one complete verified HTML/PDF pair.')
  for (const resourcesInPair of pairs.values()) {
    if (
      resourcesInPair.length !== 2 ||
      resourcesInPair.filter((item) => item.role === 'html').length !== 1 ||
      resourcesInPair.filter((item) => item.role === 'pdf').length !== 1 ||
      new Set(resourcesInPair.map((item) => item.pairId)).size !== 1
    ) {
      throw new Error('Offline HTML and PDF must come from one complete pair.')
    }
  }
  return {
    id,
    title: String(pack.title || 'Offline pack')
      .trim()
      .slice(0, 500),
    scope: String(pack.scope || 'source'),
    version,
    resources: unique,
  }
}

async function storageEstimate() {
  try {
    const estimate = await self.navigator.storage?.estimate?.()
    return { quota: estimate?.quota ?? null, usage: estimate?.usage ?? null }
  } catch {
    return { quota: null, usage: null }
  }
}

async function offlinePackStatus(packId, expectedVersion) {
  const id = safePackId(packId)
  const index = await readOfflinePackIndex()
  const manifest = index[id]
  const estimate = await storageEstimate()
  if (!manifest)
    return { supported: true, state: 'not-downloaded', stored: false, packId: id, expectedVersion, ...estimate }
  const cache = await caches.open(manifest.cacheName)
  const missing = []
  for (const resource of manifest.resources || []) if (!(await cache.match(resource.url))) missing.push(resource.url)
  const state = missing.length
    ? 'partial'
    : expectedVersion && manifest.version !== expectedVersion
      ? 'superseded'
      : 'ready'
  return { supported: true, state, stored: true, packId: id, expectedVersion, ...manifest, missing, ...estimate }
}

async function matchLatestOfflinePackResource(request) {
  const index = await readOfflinePackIndex()
  const requestUrl = new URL(typeof request === 'string' ? request : request.url, self.location.origin)
  const cacheKey = `${requestUrl.pathname}${requestUrl.search}`
  const candidates = Object.values(index)
    .filter((manifest) => (manifest.resources || []).some((resource) => resource.url === cacheKey))
    .sort(
      (left, right) =>
        Number(right.sequence || 0) - Number(left.sequence || 0) ||
        String(right.savedAt || '').localeCompare(String(left.savedAt || '')),
    )
  for (const manifest of candidates) {
    if (!manifest.cacheName) continue
    const cached = await (await caches.open(manifest.cacheName)).match(cacheKey)
    if (cached) return cached
  }
  return null
}

async function saveOfflinePack(pack) {
  const validated = validateOfflinePack(pack)
  const index = await readOfflinePackIndex()
  const previous = index[validated.id]
  const sequence =
    Object.values(index).reduce((highest, manifest) => Math.max(highest, Number(manifest.sequence || 0)), 0) + 1
  const cacheName = `${OFFLINE_PACK_PREFIX}${validated.id}:${Date.now()}:${crypto.randomUUID()}`
  const cache = await caches.open(cacheName)
  let totalBytes = 0
  try {
    for (const resource of validated.resources) {
      const response =
        resource.role === 'data'
          ? new Response(JSON.stringify(resource.snapshot), {
              status: 200,
              headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
            })
          : await fetch(resource.url, { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' })
      if (!response.ok) throw new Error(`Download failed for ${resource.role} (${response.status}).`)
      const contentType = String(response.headers.get('content-type') || '').toLowerCase()
      if (resource.role === 'html' && !contentType.includes('html'))
        throw new Error('The HTML companion did not return HTML.')
      if (resource.role === 'pdf' && !contentType.includes('pdf'))
        throw new Error('The PDF companion did not return PDF.')
      if (resource.role !== 'data') {
        const serverArtifactId = String(response.headers.get('x-learning-compass-artifact-id') || '')
        const serverPairId = String(response.headers.get('x-learning-compass-pair-id') || '')
        const serverRole = String(response.headers.get('x-learning-compass-pair-role') || '')
        const publicationState = String(response.headers.get('x-learning-compass-publication-state') || '')
        const validationStatus = String(response.headers.get('x-learning-compass-validation-status') || '')
        const serverSizeBytes = Number(response.headers.get('x-learning-compass-size-bytes'))
        if (
          serverArtifactId !== resource.artifactId ||
          serverPairId !== resource.pairId ||
          serverRole !== resource.role ||
          publicationState !== 'ready' ||
          validationStatus !== 'passed' ||
          !Number.isSafeInteger(serverSizeBytes) ||
          serverSizeBytes !== resource.sizeBytes
        ) {
          throw new Error(
            'The companion pair is no longer the verified current version. Refresh the page before saving it offline.',
          )
        }
      }
      const copy = response.clone()
      const measuredBytes = Number((await copy.blob()).size || 0)
      if (measuredBytes !== resource.sizeBytes)
        throw new Error(`The exact byte size changed for ${resource.role}. Refresh the page before saving it offline.`)
      totalBytes += measuredBytes
      await cache.put(resource.url, response)
    }
    const stagedMissing = []
    for (const resource of validated.resources) if (!(await cache.match(resource.url))) stagedMissing.push(resource.url)
    if (stagedMissing.length)
      throw new Error(
        'The browser evicted part of the staged offline pack before it could be committed. Free storage and refresh.',
      )
    const estimate = await storageEstimate()
    const manifestResources = validated.resources.map(({ snapshot, ...resource }) => resource)
    const manifest = {
      id: validated.id,
      title: validated.title,
      scope: validated.scope,
      version: validated.version,
      cacheName,
      resources: manifestResources,
      resourceCount: validated.resources.length,
      sizeBytes: totalBytes,
      savedAt: new Date().toISOString(),
      sequence,
    }
    await cache.put(
      `/__learning-compass-offline-pack__/${encodeURIComponent(validated.id)}`,
      new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } }),
    )
    for (const resource of validated.resources)
      if (!(await cache.match(resource.url)))
        throw new Error(
          'The browser evicted part of the staged offline pack before it could be committed. Free storage and refresh.',
        )
    await writeOfflinePackIndex({ ...index, [validated.id]: manifest })
    // The new manifest is committed at this point. Old-cache cleanup is
    // best-effort: a browser eviction/delete failure must never make the catch
    // path delete the new cache while the index already points at it.
    if (previous?.cacheName && previous.cacheName !== cacheName) {
      try {
        await caches.delete(previous.cacheName)
      } catch {
        /* harmless orphan; activation cleanup can reclaim it later */
      }
    }
    await cleanupOrphanOfflinePackCaches({ ...index, [validated.id]: manifest })
    return { supported: true, state: 'ready', stored: true, packId: validated.id, ...manifest, ...estimate }
  } catch (error) {
    try {
      await caches.delete(cacheName)
    } catch {
      /* a failed cleanup never hides the original failure */
    }
    const message = error instanceof Error ? error.message : 'Offline download failed.'
    const storageFull = String(error?.name || '') === 'QuotaExceededError' || /quota|storage/i.test(message)
    return {
      supported: true,
      state: storageFull ? 'storage-full' : 'error',
      stored: Boolean(previous?.cacheName),
      packId: validated.id,
      error: message,
      ...(await storageEstimate()),
    }
  }
}

async function removeOfflinePack(packId) {
  const id = safePackId(packId)
  const index = await readOfflinePackIndex()
  const manifest = index[id]
  const nextIndex = { ...index }
  delete nextIndex[id]
  // Commit removal in the manifest first. If that write fails, the indexed
  // ready cache remains untouched; cache deletion afterward is recoverable
  // orphan cleanup rather than a broken manifest.
  await writeOfflinePackIndex(nextIndex)
  if (manifest?.cacheName) {
    try {
      await caches.delete(manifest.cacheName)
    } catch {
      /* activation cleanup reclaims the orphan */
    }
  }
  await cleanupOrphanOfflinePackCaches(nextIndex)
  return { supported: true, state: 'not-downloaded', stored: false, packId: id, ...(await storageEstimate()) }
}

function serializeOfflinePackMutation(task) {
  const result = offlinePackMutation.catch(() => {}).then(task)
  offlinePackMutation = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

self.addEventListener('message', (event) => {
  const action = event.data?.action
  if (!String(action || '').startsWith('offline-pack:')) return
  const reply = (value) => event.ports?.[0]?.postMessage(value)
  const task =
    action === 'offline-pack:save'
      ? serializeOfflinePackMutation(() => saveOfflinePack(event.data.pack))
      : action === 'offline-pack:remove'
        ? serializeOfflinePackMutation(() => removeOfflinePack(event.data.packId))
        : action === 'offline-pack:status'
          ? offlinePackStatus(event.data.packId, event.data.expectedVersion)
          : Promise.resolve({ supported: true, state: 'error', error: 'Unknown offline-pack action.' })
  event.waitUntil(
    task.then(reply).catch((error) =>
      reply({
        supported: true,
        state: 'error',
        error: error instanceof Error ? error.message : 'Offline-pack action failed.',
      }),
    ),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (event.request.mode === 'navigate') {
    if (isAppShellNavigation(url)) event.respondWith(fetchAppShell(event.request))
    else if (isArtifactNavigation(url)) event.respondWith(fetchHtmlArtifact(event.request))
    else event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    return
  }
  const offlinePackData =
    /^\/capture\/[^/]+\/record$/.test(url.pathname) || /^\/learning\/core\/threads\/[^/]+\/path$/.test(url.pathname)
  if (offlinePackData) {
    event.respondWith(
      fetch(event.request).catch(() =>
        matchLatestOfflinePackResource(event.request).then(
          (cached) => cached || Promise.reject(new Error('Offline pack is not available')),
        ),
      ),
    )
    return
  }
  const cacheableData = ['/dashboard/briefing', '/notes', '/recommendations/list'].some((path) => url.pathname === path)
  if (cacheableData) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request)
        const network = fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            cache.put(event.request, copy).catch(() => {})
          }
          return response
        })
        return network.catch(() => cached || Promise.reject(new Error('Offline and no cached data')))
      }),
    )
    return
  }
  if (
    url.pathname.startsWith('/capture') ||
    url.pathname.startsWith('/notes') ||
    url.pathname.startsWith('/recommendations') ||
    url.pathname.startsWith('/settings')
  )
    return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && ['script', 'style', 'font', 'image'].includes(event.request.destination)) {
          const copy = response.clone()
          caches
            .open(CACHE)
            .then((cache) => cache.put(event.request, copy))
            .catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(event.request)),
  )
})
