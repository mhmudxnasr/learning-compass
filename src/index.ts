import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Bindings } from './lib'

import recsApi from './api/recommendations'
import brainApi from './api/brain'
import vaultApi from './api/vault'
import learningApi from './api/learning'
import statsApi from './api/stats'
import searchApi from './api/search'
import enhanceApi from './api/enhance'
import agentApi from './api/agent'
import tasteApi from './api/taste'
import suggestApi from './api/suggest'
import syncApi from './api/sync'

import { htmlShell } from './shell'
import { cssBundle } from './assets/css'
import { jsBundle } from './assets/js'
import { normalizeYouTubeUrl, deriveDedupKey, isNonEmptyStr, isValidUrl } from './lib'

const app = new Hono<{ Bindings: Bindings }>()

const RATE_LIMIT_WINDOW = 60000
const RATE_LIMIT_MAX_READS = 100
const RATE_LIMIT_MAX_WRITES = 20
const rateLimitStore = new Map<string, { reads: number[]; writes: number[] }>()

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
}

function checkRateLimit(ip: string, isWrite: boolean): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const limit = isWrite ? RATE_LIMIT_MAX_WRITES : RATE_LIMIT_MAX_READS
  const windowMs = RATE_LIMIT_WINDOW

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { reads: [], writes: [] })
  }
  const entry = rateLimitStore.get(ip)!
  const bucket = isWrite ? entry.writes : entry.reads

  bucket.push(now)
  const recent = bucket.filter(t => now - t < windowMs)
  bucket.length = 0
  bucket.push(...recent)

  if (recent.length > limit) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - recent[recent.length - limit - 1])) / 1000) }
  }
  return { allowed: true, retryAfter: 0 }
}

app.use('/*', async (c, next) => {
  const start = Date.now()
  const requestId = crypto.randomUUID()
  c.res.headers.set('X-Request-Id', requestId)

  await next()

  const duration = Date.now() - start
  const method = c.req.method
  const path = new URL(c.req.url).pathname
  const status = c.res.status
  const ua = c.req.header('user-agent') || '-'
  const ip = getClientIp(c)
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'request', method, path, status, duration, ip, ua, requestId }))
})

app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.use('/*', async (c, next) => {
  await next()
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    const path = new URL(c.req.url).pathname
    const skip = path === '/html/list' || path === '/stats' || path === '/recommendations/list' || path.startsWith('/static/')
    const already = c.res.headers.get('Cache-Control')
    if (!skip && !already) {
      c.res.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300')
    }
  }
})

app.use('/*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next()
  const ip = getClientIp(c)
  const { allowed, retryAfter } = checkRateLimit(ip, true)
  if (!allowed) {
    c.res.headers.set('Retry-After', String(retryAfter))
    return c.json({ error: 'Rate limit exceeded' }, 429)
  }
  return next()
})

app.use('/*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
    const ip = getClientIp(c)
    const { allowed, retryAfter } = checkRateLimit(ip, false)
    if (!allowed) {
      c.res.headers.set('Retry-After', String(retryAfter))
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }
  }
  await next()
})

app.use('/*', async (c, next) => {
  const cl = c.req.header('content-length')
  if (cl && Number(cl) > 10 * 1024 * 1024) {
    return c.json({ error: 'Payload too large' }, 413)
  }
  await next()
})

app.use('/*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next()
  const token = c.req.header('x-api-token') || c.req.query('token')
  const expected = c.env.API_TOKEN
  if (expected && token !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
})

app.use('/*', (c, next) => {
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  return next()
})

app.route('/taste', tasteApi)
app.route('/recommendations', recsApi)
app.route('/brain', brainApi)
app.route('/html', vaultApi)
app.route('/learning', learningApi)
app.route('/stats', statsApi)
app.route('/search', searchApi)
app.route('/ai', enhanceApi)
app.route('/agent', agentApi)
app.route('/ai', suggestApi)
app.route('/sync', syncApi)

app.get('/health', (c) => c.json({ ok: true, now: new Date().toISOString() }))

app.get('/', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  return c.html(htmlShell)
})
app.get('/ui', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  return c.html(htmlShell)
})

app.get('/static/app.css', (c) => {
  c.header('Content-Type', 'text/css; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=600, must-revalidate')
  return c.body(cssBundle)
})

app.get('/static/app.js', (c) => {
  c.header('Content-Type', 'application/javascript; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=600, must-revalidate')
  return c.body(jsBundle)
})

// Manifest for PWA
app.get('/manifest.json', (c) => {
  c.header('Content-Type', 'application/manifest+json; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=86400')
  return c.json({
    name: 'Taste Map',
    short_name: 'Taste Map',
    start_url: '/',
    display: 'standalone',
    background_color: '#16191f',
    theme_color: '#0d9182',
    description: 'Personal knowledge curation system',
    icons: [{ src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' }],
    share_target: {
      action: '/api/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url' }
    }
  })
})

// Service worker — network-first for navigation (always fresh HTML), cache-first for assets
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=86400')
  c.header('Service-Worker-Allowed', '/')
  return c.body(`
const CACHE = 'tastemap-v4'
const SHELL = ['/','/static/app.css','/static/app.js','https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js']
self.addEventListener('install', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => k !== CACHE ? caches.delete(k) : null))).then(() => caches.open(CACHE).then(c => c.addAll(SHELL))).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', e => {
  // Network-first for navigation — always fetch fresh HTML from server
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      }).catch(() => caches.match('/'))
    )
    return
  }
  // Cache-first for everything else (assets with ?v=N versioning)
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && res.type === 'basic' && !e.request.url.includes('/api/') && !e.request.url.includes('/recommendations/')) {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
      }
      return res
    }).catch(() => caches.match('/')))
  )
})
`)
})

// Share target — receives URLs shared from mobile/desktop
app.post('/api/share-target', async (c) => {
  const { DB } = c.env
  try {
    const form = await c.req.formData()
    const title = form.get('title')?.toString()?.trim()
    const text = form.get('text')?.toString()?.trim()
    const url = form.get('url')?.toString()?.trim()

    const candidateUrl = url || text
    if (!candidateUrl || !isValidUrl(candidateUrl)) {
      return c.html('<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Redirecting…</body></html>')
    }

    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const dedup = deriveDedupKey({ video_url: candidateUrl, video_title: title || candidateUrl })
    const vt = title || candidateUrl.split('/').pop()?.replace(/-/g, ' ') || 'Shared item'
    const ct = candidateUrl.includes('youtube.com') || candidateUrl.includes('youtu.be') ? 'video'
      : candidateUrl.includes('arxiv.org') ? 'paper' : 'article'

    await DB.prepare(`INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'unset', NULL, NULL, ?, NULL, NULL, datetime('now'))
      ON CONFLICT(dedup_key) DO UPDATE SET video_title=excluded.video_title, video_url=excluded.video_url, status='active', updated_at=datetime('now')`
    ).bind(id, vt, null, ct, candidateUrl, null, new Date().toISOString().split('T')[0], dedup).run()
  } catch { /* best effort */ }
  return c.html('<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Saved. Redirecting…</body></html>')
})

// YouTube metadata enrichment
app.get('/api/yt/:id', async (c) => {
  c.header('Cache-Control', 'public, max-age=86400')
  const videoId = c.req.param('id')
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return c.json({ error: 'invalid id' }, 400)
  try {
    const html = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { headers: { 'User-Agent': 'TasteMap/1.0' } })
    if (!html.ok) return c.json({ error: 'not found' }, 404)
    const meta = await html.json<any>()
    return c.json({
      title: meta?.title || '',
      creator: meta?.author_name || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      url: normalizeYouTubeUrl(`https://www.youtube.com/watch?v=${videoId}`),
    })
  } catch { return c.json({ error: 'failed' }, 500) }
})

// Telegram bot webhook
app.post('/api/telegram', async (c) => {
  const { DB } = c.env
  const { TELEGRAM_BOT_TOKEN } = c.env as any
  if (!TELEGRAM_BOT_TOKEN) return c.json({ ok: false }, 403)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false }, 400) }
  const msg = body?.message
  if (!msg?.text) return c.json({ ok: true })
  const text = msg.text.trim()
  const chatId = msg.chat.id

  const urlMatch = text.match(/https?:\/\/[^\s]+/)
  if (urlMatch) {
    const url = urlMatch[0]
    const label = text.replace(url, '').trim()
    const id = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
    const dedup = deriveDedupKey({ video_url: url, video_title: label || url })
    await DB.prepare(`INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
      VALUES (?, ?, NULL, 'article', ?, ?, NULL, 'active', 'unset', NULL, NULL, ?, NULL, NULL)
      ON CONFLICT(dedup_key) DO UPDATE SET status='active'`
    ).bind(id, label || url, url, null, dedup).run()
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `Saved: ${label || url}`, reply_to_message_id: msg.message_id })
    })
  } else if (text === '/queue') {
    const active = await DB.prepare("SELECT video_title, content_type FROM recommendations WHERE status='active' ORDER BY created_at DESC LIMIT 5").all<any>()
    const lines = (active.results || []).map((r: any) => `• [${r.content_type || '?'}] ${r.video_title}`)
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.length ? `Queue (${lines.length}):\n${lines.join('\n')}` : 'Queue is empty.' })
    })
  } else {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: 'Send a link to save it, or /queue to see your list.', reply_to_message_id: msg.message_id })
    })
  }
  return c.json({ ok: true })
})

// Scheduled cron: smart resurfacing engine + FTS sync + schema migrations
export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
  const { DB } = env
  const today = new Date().toISOString().split('T')[0]

  try {
    // 0. Schema migrations (idempotent — runs every cron, only adds if missing)
    try { await DB.prepare("ALTER TABLE srs_cards ADD COLUMN difficulty REAL DEFAULT 5.0").run() } catch { /* already exists */ }
    try { await DB.prepare("ALTER TABLE srs_cards ADD COLUMN stability REAL DEFAULT 1.0").run() } catch { /* already exists */ }
    try { await DB.prepare("ALTER TABLE recommendations ADD COLUMN updated_at TEXT").run() } catch { /* already exists */ }

    // 1. Clean expired undo rows
    await DB.prepare("DELETE FROM undo_queue WHERE expires_at < datetime('now')").run()

    // 2. FTS5 sync: only rebuild if anything changed since last build
    const lastSync = await DB.prepare("SELECT value FROM kv_store WHERE key = 'fts_last_sync'").first<any>()
    const lastSyncTs = lastSync?.value || '1970-01-01'
    const changedRecs = await DB.prepare(
      "SELECT COUNT(*) as c FROM recommendations WHERE created_at > ? OR (consumed_date IS NOT NULL AND consumed_date > ?)"
    ).bind(lastSyncTs, lastSyncTs).first<{ c: number }>()
    const dirty = (changedRecs?.c || 0) > 0

    if (dirty) {
      await DB.prepare("INSERT INTO search_idx(search_idx) VALUES('optimize')").run()
      await DB.prepare("DELETE FROM search_idx WHERE source='rec'").run()
      const allRecs = await DB.prepare("SELECT id, video_title, creator, why_this, user_review FROM recommendations").all<any>()
      for (const r of (allRecs.results || [])) {
        const text = [r.video_title, r.creator, r.why_this, r.user_review].filter(Boolean).join(' ')
        await DB.prepare("INSERT INTO search_idx(source, ref_id, text) VALUES ('rec', ?, ?)").bind(r.id, text).run()
      }
    }

    // Sync tree nodes to FTS too
    const changedNodes = dirty ? null as any : await DB.prepare(
      "SELECT COUNT(*) as c FROM tree_nodes WHERE updated_at > ?"
    ).bind(lastSyncTs).first<{ c: number }>()
    if ((changedNodes?.c || 0) > 0 || dirty) {
      await DB.prepare("DELETE FROM search_idx WHERE source='node'").run()
      const allNodes = await DB.prepare("SELECT id, label FROM tree_nodes").all<any>()
      for (const n of (allNodes.results || [])) {
        await DB.prepare("INSERT INTO search_idx(source, ref_id, text) VALUES ('node', ?, ?)").bind(n.id, n.label).run()
      }
    }

    // Update sync timestamp
    await DB.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES ('fts_last_sync', ?)").bind(today).run()

    // 3. Find neglected branches (no consumed items in 30 days)
    const staleBranches = await DB.prepare(`
      SELECT DISTINCT substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) as branch
      FROM recommendations
      WHERE status = 'consumed'
        AND dedup_key LIKE '%-%'
        AND dedup_key NOT LIKE 'yt-%'
        AND dedup_key NOT LIKE 'book-%'
        AND dedup_key NOT LIKE 'key-%'
      GROUP BY branch
      HAVING MAX(consumed_date) < date('now', '-30 days')
    `).all<any>()

    // 4. For each stale branch, find a loved item to resurface
    for (const b of (staleBranches.results || [])) {
      const branch = b.branch
      if (!branch) continue
      const existsResult = await DB.prepare(
        `SELECT id FROM recommendations
         WHERE user_rating IN ('love','like') AND status = 'consumed'
           AND substr(dedup_key, 1, instr(dedup_key || '-', '-') - 1) = ?
         ORDER BY consumed_date DESC LIMIT 1`
      ).bind(branch).all<any>()
      if (!existsResult.results || existsResult.results.length === 0) continue
      const rec = existsResult.results[0]
      const alreadyActive = await DB.prepare("SELECT id FROM recommendations WHERE dedup_key = (SELECT dedup_key FROM recommendations WHERE id = ?) AND status = 'active'")
        .bind(rec.id).first()
      if (alreadyActive) continue
      const now = new Date().toISOString().split('T')[0]
      const rId = `resurface_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      await DB.prepare(`INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
        SELECT ?, video_title, creator, content_type, video_url, 'Resurfaced: ' || (SELECT label FROM tree_nodes WHERE id = ? LIMIT 1) || ' needs love', ?, 'active', 'unset', NULL, NULL, dedup_key || '-res', NULL, NULL
        FROM recommendations WHERE id = ?`
      ).bind(rId, branch, now, rec.id).run()
    }

    // 5. Check resurfacing schedule — mark due items as active
    const dueResurface = await DB.prepare(
      "SELECT recommendation_id FROM resurfacing WHERE due_at <= ? AND resolved_at IS NULL"
    ).bind(today).all<any>()
    for (const dr of (dueResurface.results || [])) {
      const rec = await DB.prepare("SELECT * FROM recommendations WHERE id = ?").bind(dr.recommendation_id).first<any>()
      if (!rec || rec.status === 'active') continue
      const rId = `rs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      await DB.prepare(`INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date)
        SELECT ?, video_title, creator, content_type, video_url, 'Scheduled resurface', ?, 'active', 'unset', NULL, NULL, dedup_key || '-rs', NULL, NULL
        FROM recommendations WHERE id = ?`
      ).bind(rId, today, rec.id).run()
    }
    await DB.prepare(`UPDATE resurfacing SET resolved_at = ? WHERE due_at <= ? AND resolved_at IS NULL`).bind(today, today).run()
  } catch (e) {
    console.error('cron failed', e)
  }
}

export default app
