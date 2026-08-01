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
import homeApi from './api/home'
import captureApi from './api/capture'
import productApi from './api/product'
import jobsApi from './api/jobs'
import intelligenceApi from './api/intelligence'
import dashboardApi from './api/dashboard'
import artifactsApi from './api/artifacts'
import discoveryApi from './api/discovery'
import notebooklmApi from './api/notebooklm'
import { normalizeYouTubeUrl, isValidUrl } from './lib'
import { createInboxCapture } from './services/capture'
import { syncAllFeeds } from './services/rss'
import notificationsApi from './api/notifications'
import { deliverScheduledReminders } from './api/notifications'
import { createHermesEvaluatorProposals } from './services/hermes-intelligence'

const app = new Hono<{ Bindings: Bindings }>()

const RATE_LIMIT_WINDOW = 60000
const RATE_LIMIT_MAX_READS = 300
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
  if (status >= 400 || duration >= 1000) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: status >= 500 ? 'error' : 'warn', msg: 'request', method, path, status, duration, ip, ua, requestId }))
  }
})

app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))

app.use('/*', async (c, next) => {
  await next()
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    const path = new URL(c.req.url).pathname
    const already = c.res.headers.get('Cache-Control')
    const isAsset = path === '/' || path === '/ui' || path === '/manifest.json' || path === '/sw.js' || path.startsWith('/assets/')
    if (!isAsset && !already) c.res.headers.set('Cache-Control', 'no-store')
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
    const path = new URL(c.req.url).pathname
    if (path === '/' || path === '/sw.js' || path.startsWith('/assets/')) return next()
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

// Browser/offline writes carry a stable mutation id. Cache successful responses so a
// reconnect or timeout retry cannot create duplicate captures, sessions, or notes.
app.use('/*', async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
  const mutationId = c.req.header('x-client-mutation-id')?.trim()
  if (!mutationId || mutationId.length > 120 || !c.env.DB) return next()
  const endpoint = new URL(c.req.url).pathname
  const existing = await c.env.DB.prepare('SELECT method,endpoint,status_code,response_json FROM sync_mutations WHERE mutation_id=?').bind(mutationId).first<any>()
  if (existing) {
    if (existing.method !== c.req.method || existing.endpoint !== endpoint) return c.json({ error: 'mutation_id_reused_for_different_operation' }, 409)
    try { return c.json(JSON.parse(existing.response_json), existing.status_code as any) } catch { return c.json({ error: 'cached mutation response unavailable' }, 409) }
  }
  await next()
  if (c.res.status < 200 || c.res.status >= 300) return
  try {
    const body = await c.res.clone().text()
    if (body.length <= 64000) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO sync_mutations (mutation_id,method,endpoint,status_code,response_json) VALUES (?,?,?,?,?)')
        .bind(mutationId, c.req.method, endpoint, c.res.status, body || '{}').run()
    }
  } catch { /* response caching must never break the product request */ }
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
app.route('/home', homeApi)
app.route('/capture', captureApi)
app.route('/agent/jobs', jobsApi)
app.route('/dashboard', dashboardApi)
app.route('/artifacts', artifactsApi)
app.route('/discovery', discoveryApi)
app.route('/notebooklm', notebooklmApi)
app.route('/notifications', notificationsApi)
app.route('/', intelligenceApi)
app.route('/', productApi)

app.get('/health', (c) => c.json({ ok: true, now: new Date().toISOString() }))

app.get('/', async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(asset.headers)
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  return new Response(asset.body, { status: asset.status, headers })
})
app.get('/ui', async (c) => {
  const asset = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), c.req.raw))
  const headers = new Headers(asset.headers)
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  return new Response(asset.body, { status: asset.status, headers })
})
app.get('/assets/*', (c) => c.env.ASSETS.fetch(c.req.raw))
app.get('/favicon.ico', (c) => c.body(null, 204))

// Manifest for PWA
app.get('/manifest.json', (c) => {
  c.header('Content-Type', 'application/manifest+json; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=86400')
  return c.json({
    name: 'Learning Compass',
    short_name: 'Learning Compass',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f6f3',
    theme_color: '#4d628c',
    description: 'Private learning operating system',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    share_target: {
      action: '/api/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url' }
    }
  })
})

app.get('/sw.js', async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(asset.headers)
  headers.set('Content-Type', 'application/javascript; charset=utf-8')
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  headers.set('Service-Worker-Allowed', '/')
  return new Response(asset.body, { status: asset.status, headers })
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

    const vt = title || candidateUrl.split('/').pop()?.replace(/-/g, ' ') || 'Shared item'
    await createInboxCapture(DB, { source: candidateUrl, title: vt })
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
  const { TELEGRAM_BOT_TOKEN } = c.env
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
    const result = await createInboxCapture(DB, { source: url, title: label || undefined })
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: result.duplicate ? `Already captured: ${label || url}` : `Saved to Inbox: ${label || url}`, reply_to_message_id: msg.message_id })
    })
  } else if (text === '/queue') {
    const active = await DB.prepare(`SELECT r.video_title,r.content_type
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
      ORDER BY COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 5`).all<any>()
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

// Scheduled cron: smart resurfacing engine + FTS sync
export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
  const { DB } = env
  const today = new Date().toISOString().split('T')[0]

  try {
    await syncAllFeeds(DB)
    await deliverScheduledReminders(env)

    // Weekly evaluator is idempotent and creates proposals only; it never mutates taste directly.
    const currentDate = new Date()
    const weekStart = new Date(currentDate)
    weekStart.setUTCDate(currentDate.getUTCDate() - ((currentDate.getUTCDay() + 6) % 7))
    const weekKey = weekStart.toISOString().slice(0, 10)
    const evaluatorState = await DB.prepare("SELECT value FROM kv_store WHERE key='hermes.evaluator.last_run'").first<any>()
    if (evaluatorState?.value !== weekKey) {
      await createHermesEvaluatorProposals(DB)
      await DB.prepare("INSERT OR REPLACE INTO kv_store (key,value) VALUES ('hermes.evaluator.last_run',?)").bind(weekKey).run()
    }

    // 1. Clean expired undo rows
    await DB.prepare("DELETE FROM undo_queue WHERE expires_at < datetime('now')").run()

    // 2. FTS5 sync: only rebuild if anything changed since last build
    const lastSync = await DB.prepare("SELECT value FROM kv_store WHERE key = 'fts_last_sync'").first<any>()
    const lastSyncTs = lastSync?.value || '1970-01-01'
    const changedRecs = await DB.prepare(
      "SELECT COUNT(*) as c FROM recommendations WHERE created_at > ? OR updated_at > ? OR (consumed_date IS NOT NULL AND consumed_date > ?)"
    ).bind(lastSyncTs, lastSyncTs, lastSyncTs).first<{ c: number }>()
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
    await DB.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES ('fts_last_sync', ?)").bind(new Date().toISOString()).run()

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

    // 4. For each stale branch, surface a loved source without silently adding it to Queue.
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
      await DB.prepare(`INSERT INTO resurfacing (recommendation_id,stage,due_at,notes)
        SELECT ?,'stale',date('now'),? WHERE NOT EXISTS (SELECT 1 FROM resurfacing WHERE recommendation_id=? AND resolved_at IS NULL)`)
        .bind(rec.id, `Branch ${branch} has been inactive for 30 days.`, rec.id).run()
    }
  } catch (e) {
    console.error('cron failed', e)
  }
}

export default app
