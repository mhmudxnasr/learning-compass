const CACHE = 'learning-compass-shell-v11'
const DATA_CACHE = 'learning-compass-data-v4'
const ARTIFACT_CACHE = 'learning-compass-html-artifacts-v1'
const CORE_ASSETS = ['/manifest.json', '/icon.svg', '/icons/compass-192.png', '/icons/compass-512.png', '/icons/compass-maskable-512.png']
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
  await Promise.all(CORE_DATA.map(async (path) => {
    try {
      const data = await fetch(path, { cache: 'no-store' })
      if (data.ok) await dataCache.put(path, data)
    } catch { /* shell installation remains usable if live data is temporarily unavailable */ }
  }))
}

self.addEventListener('install', (event) => event.waitUntil(cacheShell().then(() => self.skipWaiting())))
self.addEventListener('activate', (event) => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE, DATA_CACHE, ARTIFACT_CACHE].includes(key)).map((key) => caches.delete(key))))])))
self.addEventListener('push', (event) => {
  let payload = { title: 'Learning Compass', body: 'A learning review is ready.' }
  try { if (event.data) payload = { ...payload, ...event.data.json() } } catch { /* use the safe default */ }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: '/icons/compass-192.png', badge: '/icons/compass-192.png', data: { url: payload.url || '/#/home' } }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const target = event.notification.data?.url || '/#/home'
    const existing = windows.find((client) => 'focus' in client)
    if (existing) { existing.navigate(target); return existing.focus() }
    return clients.openWindow(target)
  }))
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
    } catch { /* a cache quota failure must not block the live shell */ }
  }
  return response
}

async function fetchHtmlArtifact(request) {
  let response
  try {
    response = await fetch(request)
  } catch {
    try {
      const cache = await caches.open(ARTIFACT_CACHE)
      return (await cache.match(request)) || Response.error()
    } catch { return Response.error() }
  }
  if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
    try {
      const cache = await caches.open(ARTIFACT_CACHE)
      await cache.put(request, response.clone())
    } catch { /* storage pressure must not block the live companion */ }
  }
  return response
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (event.request.mode === 'navigate') {
    if (isAppShellNavigation(url)) event.respondWith(fetchAppShell(event.request))
    else if (isArtifactNavigation(url)) event.respondWith(fetchHtmlArtifact(event.request))
    else event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    return
  }
  const cacheableData = ['/dashboard/briefing', '/notes', '/recommendations/list'].some((path) => url.pathname === path)
  if (cacheableData) {
    event.respondWith(caches.open(DATA_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      const network = fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          cache.put(event.request, copy).catch(() => {})
        }
        return response
      })
      return network.catch(() => cached || Promise.reject(new Error('Offline and no cached data')))
    }))
    return
  }
  if (url.pathname.startsWith('/capture') || url.pathname.startsWith('/notes') || url.pathname.startsWith('/recommendations') || url.pathname.startsWith('/settings')) return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && ['script', 'style', 'font', 'image'].includes(event.request.destination)) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
