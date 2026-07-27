import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Bindings } from './lib'

import recsApi from './api/recommendations'
import brainApi from './api/brain'
import vaultApi from './api/vault'
import learningApi from './api/learning'
import statsApi from './api/stats'
import searchApi from './api/search'

import { htmlShell } from './shell'
import { cssBundle } from './assets/css'
import { jsBundle } from './assets/js'

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

app.route('/recommendations', recsApi)
app.route('/brain', brainApi)
app.route('/html', vaultApi)
app.route('/learning', learningApi)
app.route('/stats', statsApi)
app.route('/search', searchApi)

app.get('/health', (c) => c.json({ ok: true, now: new Date().toISOString() }))

app.get('/', (c) => c.html(htmlShell))
app.get('/ui', (c) => c.html(htmlShell))

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

export default app
