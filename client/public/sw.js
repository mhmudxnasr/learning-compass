const CACHE = 'taste-map-scholar-v4'
const DATA_CACHE = 'taste-map-data-v2'
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')).then(() => self.skipWaiting())))
self.addEventListener('activate', (event) => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key))))])))
self.addEventListener('push', (event) => {
  let payload = { title: 'Learning Compass', body: 'A learning review is ready.' }
  try { if (event.data) payload = { ...payload, ...event.data.json() } } catch { /* use the safe default */ }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: '/icon.svg', data: { url: '/#/today/briefing' } }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const target = event.notification.data?.url || '/#/today/briefing'
    const existing = windows.find((client) => 'focus' in client)
    if (existing) { existing.navigate(target); return existing.focus() }
    return clients.openWindow(target)
  }))
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async (response) => {
      if (response.ok) await caches.open(CACHE).then((cache) => cache.put('/', response.clone()))
      return response
    }).catch(() => caches.match('/')))
    return
  }
  const cacheableData = ['/dashboard/briefing', '/notes', '/recommendations/list'].some((path) => url.pathname === path)
  if (cacheableData) {
    event.respondWith(caches.open(DATA_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      const network = fetch(event.request).then((response) => { if (response.ok) cache.put(event.request, response.clone()); return response })
      return network.catch(() => cached || Promise.reject(new Error('Offline and no cached data')))
    }))
    return
  }
  if (url.pathname.startsWith('/capture') || url.pathname.startsWith('/notes') || url.pathname.startsWith('/recommendations')) return
  event.respondWith(fetch(event.request).then((response) => { if (response.ok && ['script','style','font','image'].includes(event.request.destination)) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))))
})
