import { Hono } from 'hono'
import { Bindings, safeErrorMessage, normalizeYouTubeUrl, isValidUrl } from './lib'

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
import hardcoverApi from './api/hardcover'
import assistantApi from './api/assistant'
import homeApi from './api/home'
import captureApi from './api/capture'
import productApi from './api/product'
import jobsApi from './api/jobs'
import intelligenceApi from './api/intelligence'
import dashboardApi from './api/dashboard'
import artifactsApi from './api/artifacts'
import discoveryApi from './api/discovery'
import notebooklmApi from './api/notebooklm'
import { createCapture } from './services/capture'
import { runMaintenance } from './services/maintenance'
import { loadOperationalHealth } from './services/operational-health'
import notificationsApi from './api/notifications'
import compassApi from './api/compass'
import analyticsApi from './api/analytics'
import learningCoreApi from './api/learning-core'
import canonApi from './api/canon'
import annotationsApi from './api/annotations'
import { describeFreeTierUsage, reserveFreeTierBudget, secondsUntilUtcReset } from './services/free-tier-budget'
import { DURABLE_UNKNOWN_MUTATION_EXPIRES_AT, mutationReservationDisposition } from './services/mutation-recovery'

const app = new Hono<{ Bindings: Bindings; Variables: { requestId: string } }>()
const PUBLIC_LEARNING_UPDATE_PATH = '/updates/learning-materials'
const PUBLIC_LEARNING_UPDATE_FILE_PATH = `${PUBLIC_LEARNING_UPDATE_PATH}.html`
const isPublicLearningUpdatePath = (path: string) => path === PUBLIC_LEARNING_UPDATE_PATH || path === PUBLIC_LEARNING_UPDATE_FILE_PATH
const isPublicRequestPath = (path: string) => path === '/' || path === '/ui' || isPublicLearningUpdatePath(path) || path === '/health' || path.startsWith('/health/') || path === '/manifest.json' || path === '/sw.js' || path === '/icon.svg' || path === '/brand-mark.svg' || path === '/favicon.ico' || path === '/api/telegram' || path.startsWith('/assets/') || path.startsWith('/icons/')

const RATE_LIMIT_WINDOW = 60000
const RATE_LIMIT_MAX_READS = 300
const RATE_LIMIT_MAX_WRITES = 60
const rateLimitStore = new Map<string, { reads: number[]; writes: number[] }>()

const allowsUnauthenticatedLocalWrite = (request: Request, enabled?: string) => {
  if (enabled !== 'true' || ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return false
  return ['127.0.0.1', '::1', 'localhost'].includes(new URL(request.url).hostname)
}

export function getClientIp(c: any): string {
  const cloudflareIp = c.req.header('cf-connecting-ip')?.trim()
  if (cloudflareIp) return cloudflareIp
  const realIp = c.req.header('x-real-ip')?.trim()
  if (realIp) return realIp
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
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
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)

  await next()

  const duration = Date.now() - start
  const method = c.req.method
  const path = new URL(c.req.url).pathname
  const status = c.res.status
  const ua = c.req.header('user-agent') || '-'
  const ip = getClientIp(c)
  c.res.headers.set('Server-Timing', `app;dur=${duration}`)
  c.res.headers.set('X-Response-Time-Ms', String(duration))
  if (status >= 400 || duration >= 1000) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: status >= 500 ? 'error' : 'warn', msg: 'request', method, path, status, duration, ip, ua, requestId }))
  }
})

app.onError((error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID()
  const method = c.req.method
  const path = new URL(c.req.url).pathname
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'unhandled_request_error', method, path, requestId, error: safeErrorMessage(error) }))
  c.header('X-Request-Id', requestId)
  return c.json({ error: 'internal_error', message: 'Learning Compass could not complete this request.', request_id: requestId }, 500)
})

app.use('/*', async (c, next) => {
  await next()
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    const path = new URL(c.req.url).pathname
    const already = c.res.headers.get('Cache-Control')
    const isAsset = path === '/' || path === '/ui' || isPublicLearningUpdatePath(path) || path === '/manifest.json' || path === '/sw.js' || path === '/icon.svg' || path === '/brand-mark.svg' || path.startsWith('/assets/') || path.startsWith('/icons/')
    if (!isAsset && !already) c.res.headers.set('Cache-Control', 'no-store')
  }
})

app.use('/*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next()
  if (allowsUnauthenticatedLocalWrite(c.req.raw, c.env.ALLOW_UNAUTHENTICATED_LOCAL_WRITES)) return next()
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
    if (path === '/' || isPublicLearningUpdatePath(path) || path === '/sw.js' || path.startsWith('/assets/') || path.startsWith('/icons/')) return next()
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
  if (method === 'OPTIONS') return next()
  const path = new URL(c.req.url).pathname
  const exempt = isPublicRequestPath(path)
  if (exempt) return next()
  const budget = await reserveFreeTierBudget(c.env.DB, method, path)
  if (!budget.allowed) {
    const retryAfter = secondsUntilUtcReset()
    c.header('Retry-After', String(retryAfter))
    return c.json({ error: 'daily_free_tier_budget_exhausted', reset_at: new Date(Date.now() + retryAfter * 1000).toISOString() }, 429)
  }
  c.header('X-D1-Estimated-Rows-Read', String(budget.read))
  c.header('X-D1-Estimated-Rows-Written', String(budget.written))
  return next()
})

// Browser/offline writes carry a stable mutation id. Atomically reserve each key
// before executing so concurrent retries cannot both mutate. Successful responses
// are replayed only when method, path, and request body fingerprints match.
app.use('/*', async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
  const mutationId = c.req.header('x-client-mutation-id')?.trim()
  if (!mutationId || mutationId.length > 120 || !c.env.DB) return next()
  const endpoint = new URL(c.req.url).pathname
  const bodyText = await c.req.raw.clone().text()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${c.req.method}\n${endpoint}\n${bodyText}`))
  const requestHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

  const replay = async () => {
    const existing = await c.env.DB.prepare('SELECT method,endpoint,request_hash,status_code,response_json FROM sync_mutations WHERE mutation_id=?').bind(mutationId).first<any>()
    if (!existing) return null
    if (existing.method !== c.req.method || existing.endpoint !== endpoint || (existing.request_hash && existing.request_hash !== requestHash)) {
      return c.json({ error: 'mutation_id_reused_for_different_operation' }, 409)
    }
    try { return c.json(JSON.parse(existing.response_json), existing.status_code as any) } catch { return c.json({ error: 'cached mutation response unavailable' }, 409) }
  }

  const cached = await replay()
  if (cached) return cached
  // Only an ordinary short lease may expire. Unknown-outcome reservations are
  // durable tombstones: legacy builds represented those by extending the
  // expiry well beyond created_at, while current builds use the explicit
  // far-future sentinel. Neither may be deleted and turned into a blind replay.
  await c.env.DB.prepare("DELETE FROM sync_mutation_locks WHERE expires_at<=datetime('now') AND expires_at<=datetime(created_at,'+5 minutes')").run()
  // Reserve fail-closed from the first write. If the handler or the later
  // receipt write crashes, the row is already a durable tombstone; a follow-up
  // database failure cannot leave behind a short lease that later blind-replays.
  const reservation = await c.env.DB.prepare('INSERT OR IGNORE INTO sync_mutation_locks (mutation_id,method,endpoint,request_hash,expires_at) VALUES (?,?,?,?,?)')
    .bind(mutationId, c.req.method, endpoint, requestHash, DURABLE_UNKNOWN_MUTATION_EXPIRES_AT).run()
  if (!reservation.meta.changes) {
    const completed = await replay()
    if (completed) return completed
    const lock = await c.env.DB.prepare(`SELECT method,endpoint,request_hash,expires_at,
      CASE WHEN (expires_at=? AND created_at<=datetime('now','-2 minutes'))
        OR (expires_at<>? AND expires_at>datetime(created_at,'+5 minutes'))
        THEN 1 ELSE 0 END outcome_unknown
      FROM sync_mutation_locks WHERE mutation_id=?`)
      .bind(DURABLE_UNKNOWN_MUTATION_EXPIRES_AT, DURABLE_UNKNOWN_MUTATION_EXPIRES_AT, mutationId).first<any>()
    if (lock && (lock.method !== c.req.method || lock.endpoint !== endpoint || lock.request_hash !== requestHash)) {
      return c.json({ error: 'mutation_id_reused_for_different_operation' }, 409)
    }
    if (Number(lock?.outcome_unknown || 0)) {
      return c.json({ error: 'mutation_outcome_unknown', mutation_committed: 'unknown', retryable: false, reread_required: true }, 409)
    }
    return c.json({ error: 'mutation_in_progress', retryable: true }, 409)
  }

  await next()
  const disposition = mutationReservationDisposition(c.res.status)
  if (disposition === 'release') {
    await c.env.DB.prepare('DELETE FROM sync_mutation_locks WHERE mutation_id=? AND request_hash=?').bind(mutationId, requestHash).run()
    return
  }
  if (disposition === 'hold_unknown') {
    await c.env.DB.prepare('UPDATE sync_mutation_locks SET expires_at=? WHERE mutation_id=? AND request_hash=?')
      .bind(DURABLE_UNKNOWN_MUTATION_EXPIRES_AT, mutationId, requestHash).run().catch(() => undefined)
    return
  }
  try {
    const body = await c.res.clone().text()
    await c.env.DB.prepare('INSERT INTO sync_mutations (mutation_id,method,endpoint,request_hash,status_code,response_json) VALUES (?,?,?,?,?,?)')
      .bind(mutationId, c.req.method, endpoint, requestHash, c.res.status, body || '{}').run()
    await c.env.DB.prepare('DELETE FROM sync_mutation_locks WHERE mutation_id=? AND request_hash=?').bind(mutationId, requestHash).run()
  } catch {
    // The write may already be committed. Quarantine the key durably so a later
    // cleanup cannot turn an unresolved outcome into a blind replay.
    await c.env.DB.prepare('UPDATE sync_mutation_locks SET expires_at=? WHERE mutation_id=? AND request_hash=?')
      .bind(DURABLE_UNKNOWN_MUTATION_EXPIRES_AT, mutationId, requestHash).run().catch(() => undefined)
  }
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
app.route('/learning/core', learningCoreApi)
app.route('/learning/core/canon', canonApi)
app.route('/annotations', annotationsApi)
app.route('/stats', statsApi)
app.route('/search', searchApi)
app.route('/ai', enhanceApi)
app.route('/agent', agentApi)
app.route('/ai', suggestApi)
app.route('/sync', syncApi)
app.route('/hardcover', hardcoverApi)
app.route('/assistant', assistantApi)
app.route('/home', homeApi)
app.route('/capture', captureApi)
app.route('/agent/jobs', jobsApi)
app.route('/dashboard', dashboardApi)
app.route('/artifacts', artifactsApi)
app.route('/discovery', discoveryApi)
app.route('/compass', compassApi)
app.route('/notebooklm', notebooklmApi)
app.route('/notifications', notificationsApi)
app.route('/analytics', analyticsApi)
app.route('/', intelligenceApi)
app.route('/', productApi)

app.get('/health/live', (c) => c.json({ ok: true, status: 'live', now: new Date().toISOString() }))

app.get('/health/free-tier-budget', async (c) => {
  const usage = await c.env.DB.prepare(`SELECT estimated_rows_read,estimated_rows_written,read_requests,write_requests,updated_at FROM free_tier_usage_budget WHERE day_utc=date('now')`).first<any>()
  const budget = describeFreeTierUsage(usage || {})
  return c.json({
    day_utc: new Date().toISOString().slice(0, 10),
    ...budget,
    requests: { reads: Number(usage?.read_requests || 0), writes: Number(usage?.write_requests || 0) },
    updated_at: usage?.updated_at || null,
  })
})
const readiness = async (c: any) => {
  const health = await loadOperationalHealth(c.env)
  return c.json(health, health.ok ? 200 : 503)
}
app.get('/health', readiness)
app.get('/health/ready', readiness)

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
app.get(PUBLIC_LEARNING_UPDATE_PATH, async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(asset.headers)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
  return new Response(asset.body, { status: asset.status, headers })
})
app.get(PUBLIC_LEARNING_UPDATE_FILE_PATH, (c) => c.redirect(PUBLIC_LEARNING_UPDATE_PATH, 308))
app.get('/assets/*', (c) => c.env.ASSETS.fetch(c.req.raw))
app.get('/icons/*', (c) => c.env.ASSETS.fetch(c.req.raw))
app.get('/icon.svg', (c) => c.env.ASSETS.fetch(c.req.raw))
app.get('/brand-mark.svg', (c) => c.env.ASSETS.fetch(c.req.raw))
app.get('/favicon.ico', (c) => c.body(null, 204))

app.get('/manifest.json', async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(asset.headers)
  headers.set('Content-Type', 'application/manifest+json; charset=utf-8')
  headers.set('Cache-Control', 'public, max-age=3600')
  return new Response(asset.body, { status: asset.status, headers })
})

app.get('/sw.js', async (c) => {
  const assetUrl = new URL(c.req.url)
  assetUrl.searchParams.set('release', 'shell-v48-data-v5')
  const asset = await c.env.ASSETS.fetch(assetUrl.toString())
  const headers = new Headers(asset.headers)
  headers.set('Content-Type', 'application/javascript; charset=utf-8')
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  headers.set('Service-Worker-Allowed', '/')
  return new Response(asset.body, { status: asset.status, headers })
})

// Share target — receives URLs shared from mobile/desktop and preserves failed input.
app.post('/api/share-target', async (c) => {
  let candidate = ''
  try {
    const form = await c.req.formData()
    const title = form.get('title')?.toString()?.trim()
    const text = form.get('text')?.toString()?.trim()
    const url = form.get('url')?.toString()?.trim()
    candidate = url || text || ''
    if (!candidate || candidate.length > 10000) return c.redirect('/#/home?action=capture&share=invalid', 303)
    const derivedTitle = title || (isValidUrl(String(candidate)) ? candidate.split('/').pop()?.replace(/-/g, ' ') : candidate.slice(0, 100)) || 'Shared item'
    const result = await createCapture(c.env.DB, { source: candidate, title: derivedTitle })
    return c.redirect(`/#/library/source/${encodeURIComponent(result.id)}?from=home&share=${result.duplicate ? 'existing' : 'saved'}`, 303)
  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'share_target_capture_failed', error: safeErrorMessage(error) }))
    const query = new URLSearchParams({ action: 'capture', share: 'retry', ...(candidate ? { capture: candidate } : {}) })
    return c.redirect(`/#/home?${query.toString()}`, 303)
  }
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
async function telegramReply(token: string, payload: Record<string, unknown>) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', msg: 'telegram_reply_failed', status: response.status }))
  } catch (error) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', msg: 'telegram_reply_failed', error: safeErrorMessage(error) }))
  }
}

app.post('/api/telegram', async (c) => {
  const { DB } = c.env
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_CHAT_ID } = c.env
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) return c.json({ ok: false, error: 'webhook_not_configured' }, 403)
  const suppliedSecret = c.req.header('x-telegram-bot-api-secret-token') || ''
  if (suppliedSecret.length !== TELEGRAM_WEBHOOK_SECRET.length) return c.json({ ok: false, error: 'invalid_webhook_secret' }, 401)
  let secretMismatch = 0
  for (let index = 0; index < TELEGRAM_WEBHOOK_SECRET.length; index += 1) secretMismatch |= suppliedSecret.charCodeAt(index) ^ TELEGRAM_WEBHOOK_SECRET.charCodeAt(index)
  if (secretMismatch !== 0) return c.json({ ok: false, error: 'invalid_webhook_secret' }, 401)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false }, 400) }
  const msg = body?.message
  if (!msg?.text) return c.json({ ok: true })
  const chatId = msg.chat.id
  if (TELEGRAM_ALLOWED_CHAT_ID && String(chatId) !== String(TELEGRAM_ALLOWED_CHAT_ID)) return c.json({ ok: false, error: 'chat_not_allowed' }, 403)

  const updateId = Number(body?.update_id)
  const durableUpdate = Number.isInteger(updateId)
  if (durableUpdate) {
    const existing = await DB.prepare('SELECT status,result_id FROM telegram_updates WHERE update_id=?').bind(updateId).first<{ status: string; result_id: string | null }>()
    if (existing?.status === 'completed') return c.json({ ok: true, duplicate: true, result_id: existing.result_id || null })
    if (!existing) {
      await DB.prepare("INSERT INTO telegram_updates(update_id,status,attempts,updated_at) VALUES (?,'processing',1,datetime('now'))").bind(updateId).run()
    } else {
      const claimed = await DB.prepare(`UPDATE telegram_updates SET status='processing',attempts=attempts+1,error=NULL,updated_at=datetime('now')
        WHERE update_id=? AND (status='failed' OR (status='processing' AND datetime(COALESCE(updated_at,received_at))<datetime('now','-2 minutes')))`)
        .bind(updateId).run()
      if (!claimed.meta?.changes) return c.json({ ok: true, in_progress: true }, 202)
    }
  }

  const text = msg.text.trim()
  let resultId: string | null = null
  try {
    const urlMatch = text.match(/https?:\/\/[^\s]+/)
    if (urlMatch) {
      const url = urlMatch[0]
      const label = text.replace(url, '').trim()
      const result = await createCapture(DB, { source: url, title: label || undefined })
      resultId = result.id
      if (durableUpdate) await DB.prepare("UPDATE telegram_updates SET status='completed',result_id=?,error=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE update_id=?").bind(result.id, updateId).run()
      await telegramReply(TELEGRAM_BOT_TOKEN, { chat_id: chatId, text: result.duplicate ? `Already captured: ${label || url}` : `Saved as a source: ${label || url}`, reply_to_message_id: msg.message_id })
    } else if (text === '/queue') {
      const active = await DB.prepare(`SELECT r.video_title,r.content_type
        FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
        WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
        ORDER BY COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 5`).all<any>()
      const lines = (active.results || []).map((row: any) => `• [${row.content_type || '?'}] ${row.video_title}`)
      if (durableUpdate) await DB.prepare("UPDATE telegram_updates SET status='completed',error=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE update_id=?").bind(updateId).run()
      await telegramReply(TELEGRAM_BOT_TOKEN, { chat_id: chatId, text: lines.length ? `Queue (${lines.length}):\n${lines.join('\n')}` : 'Queue is empty.' })
    } else {
      if (durableUpdate) await DB.prepare("UPDATE telegram_updates SET status='completed',error=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE update_id=?").bind(updateId).run()
      await telegramReply(TELEGRAM_BOT_TOKEN, { chat_id: chatId, text: 'Send a link to save it, or /queue to see your list.', reply_to_message_id: msg.message_id })
    }
    return c.json({ ok: true, result_id: resultId })
  } catch (error) {
    const failure = safeErrorMessage(error)
    if (durableUpdate) await DB.prepare("UPDATE telegram_updates SET status='failed',error=?,updated_at=datetime('now') WHERE update_id=?").bind(failure.slice(0, 1000), updateId).run().catch(() => undefined)
    throw error
  }
})

// Cloudflare invokes scheduled handlers from the default module export.
export async function scheduled(_event: ScheduledController, env: Bindings, _ctx: ExecutionContext) {
  const receipt = await runMaintenance(env, 'cron')
  if (!receipt.ok) {
    const failures = receipt.steps.filter((step) => step.status === 'failed').map((step) => `${step.name}: ${step.error}`).join('; ')
    throw new Error(`Scheduled maintenance failed: ${failures}`)
  }
}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Bindings>
