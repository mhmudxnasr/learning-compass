import { Hono } from 'hono'
import { Bindings, isValidUrl } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()
const encoder = new TextEncoder()
const decodeBase64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=='), (char) => char.charCodeAt(0))
const encodeBase64 = (value: ArrayBuffer | Uint8Array) => { const input = value instanceof Uint8Array ? value : new Uint8Array(value); let binary = ''; for (const byte of input) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') }
const asBuffer = (value: Uint8Array) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
const concatBytes = (...parts: Uint8Array[]) => { const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length } return output }
async function hmac(key: Uint8Array, data: Uint8Array) { const cryptoKey = await crypto.subtle.importKey('raw', asBuffer(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, asBuffer(data))) }
async function hkdfExtract(salt: Uint8Array, input: Uint8Array) { return hmac(salt, input) }
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number) { let previous = new Uint8Array(); const blocks: Uint8Array[] = []; for (let counter = 1; blocks.reduce((sum, block) => sum + block.length, 0) < length; counter++) { previous = await hmac(prk, concatBytes(previous, info, new Uint8Array([counter]))); blocks.push(previous) } return concatBytes(...blocks).slice(0, length) }
function derToRaw(signature: Uint8Array) { if (signature.length === 64) return signature; let cursor = 2; if (signature[1] & 0x80) cursor += signature[1] & 0x7f; if (signature[cursor] !== 0x02) return signature; const rLength = signature[cursor + 1]; const rStart = cursor + 2; const sMarker = rStart + rLength; const sLength = signature[sMarker + 1]; const sStart = sMarker + 2; const raw = new Uint8Array(64); raw.set(signature.slice(rStart + Math.max(0, rLength - 32), rStart + rLength), 32 - Math.min(32, rLength)); raw.set(signature.slice(sStart + Math.max(0, sLength - 32), sStart + sLength), 64 - Math.min(32, sLength)); return raw }
async function sendWebPush(endpoint: string, keys: { auth?: string; p256dh?: string }, message: string, env: Bindings) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !keys.auth || !keys.p256dh) throw new Error('VAPID keys or subscription keys are missing')
  const subscriberPublic = decodeBase64(keys.p256dh); const authSecret = decodeBase64(keys.auth)
  const subscriberKey = await crypto.subtle.importKey('raw', subscriberPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subscriberKey }, ephemeral.privateKey, 256))
  const prkKey = await hkdfExtract(authSecret, shared)
  const ikm = await hkdfExpand(prkKey, concatBytes(encoder.encode('WebPush: info\0'), subscriberPublic, ephemeralPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16)); const prk = await hkdfExtract(salt, ikm)
  const cek = await hkdfExpand(prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16); const nonce = await hkdfExpand(prk, encoder.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concatBytes(encoder.encode(JSON.stringify({ title: 'Learning Compass', body: message })), new Uint8Array([2]))))
  const body = concatBytes(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([ephemeralPublic.length]), ephemeralPublic, encrypted)
  const privateKey = await crypto.subtle.importKey('pkcs8', decodeBase64(env.VAPID_PRIVATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = encodeBase64(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))); const audience = new URL(endpoint).origin
  const payload = encodeBase64(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: 'mailto:learning-compass@localhost' })))
  const signature = derToRaw(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(`${header}.${payload}`))))
  const response = await fetch(endpoint, { method: 'POST', headers: { TTL: '60', Authorization: `vapid t=${header}.${payload}.${encodeBase64(signature)}, k=${env.VAPID_PUBLIC_KEY}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' }, body })
  if (!response.ok) throw new Error(`Push service returned ${response.status}`)
}
const setting = async (DB: D1Database, key: string) => {
  const row = await DB.prepare('SELECT value_json FROM user_settings WHERE setting_key=?').bind(key).first<any>()
  try { return row ? JSON.parse(row.value_json) : null } catch { return null }
}
const saveSetting = (DB: D1Database, key: string, value: unknown) => DB.prepare(`INSERT INTO user_settings (setting_key,value_json,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`).bind(key, JSON.stringify(value))

export async function deliverScheduledReminders(env: Bindings) {
  const due = await env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>()
  const dueCount = Number(due?.count || 0)
  if (!dueCount) return { due: 0, deliveries: 0 }
  const already = await env.DB.prepare(`SELECT COUNT(*) count FROM notification_deliveries WHERE event_kind='review_due' AND date(attempted_at)=date('now')`).first<any>()
  if (Number(already?.count || 0)) return { due: dueCount, deliveries: 0 }
  const message = `Learning Compass: ${dueCount} recall ${dueCount === 1 ? 'card is' : 'cards are'} due.`
  let deliveries = 0
  const telegram = await setting(env.DB, 'notifications.telegram')
  if (telegram?.enabled && telegram.chat_id && env.TELEGRAM_BOT_TOKEN) {
    let status = 'delivered'; let error: string | null = null
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: telegram.chat_id, text: message }) })
      if (!response.ok) { status = 'failed'; error = `Telegram returned ${response.status}` }
    } catch (err) { status = 'failed'; error = err instanceof Error ? err.message : 'Telegram delivery failed' }
    await env.DB.prepare(`INSERT INTO notification_deliveries (id,channel,target,event_kind,status,payload_json,error,delivered_at) VALUES (?,?,?,?,?,?,?,CASE WHEN ?='delivered' THEN datetime('now') ELSE NULL END)`).bind(`delivery_${crypto.randomUUID()}`, 'telegram', String(telegram.chat_id), 'review_due', status, JSON.stringify({ due: dueCount }), error, status).run()
    deliveries++
  }
  const browser = await env.DB.prepare(`SELECT id,endpoint_json FROM notification_subscriptions WHERE channel='browser' AND enabled=1`).all<any>()
  for (const subscription of browser.results || []) {
    let status = 'queued'; let error: string | null = !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY ? 'VAPID keys not configured' : null
    try { const parsed = JSON.parse(subscription.endpoint_json || '{}'); if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && !String(parsed.endpoint || '').startsWith('browser://')) { await sendWebPush(parsed.endpoint, parsed.keys || {}, message, env); status = 'delivered'; error = null } } catch (err) { status = 'failed'; error = err instanceof Error ? err.message : 'Browser push delivery failed' }
    await env.DB.prepare(`INSERT INTO notification_deliveries (id,channel,target,event_kind,status,payload_json,error,delivered_at) VALUES (?,?,?,?,?,?,?,CASE WHEN ?='delivered' THEN datetime('now') ELSE NULL END)`).bind(`delivery_${crypto.randomUUID()}`, 'browser', subscription.id, 'review_due', status, JSON.stringify({ due: dueCount, message }), error, status).run()
    deliveries++
  }
  return { due: dueCount, deliveries }
}

app.get('/', async (c) => {
  const [browser, telegram, subscriptions, deliveries] = await Promise.all([
    setting(c.env.DB, 'notifications.browser'),
    setting(c.env.DB, 'notifications.telegram'),
    c.env.DB.prepare(`SELECT id,channel,enabled,created_at FROM notification_subscriptions ORDER BY created_at DESC`).all<any>(),
    c.env.DB.prepare(`SELECT id,channel,target,event_kind,status,error,attempted_at,delivered_at FROM notification_deliveries ORDER BY attempted_at DESC LIMIT 30`).all<any>(),
  ])
  return c.json({ browser, telegram, subscriptions: subscriptions.results || [], deliveries: deliveries.results || [] })
})

app.get('/vapid', (c) => c.json({ configured: Boolean((c.env as any).VAPID_PUBLIC_KEY), public_key: (c.env as any).VAPID_PUBLIC_KEY || null }))

app.post('/push/subscribe', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const endpoint = String(body.endpoint || '').trim()
  if (!endpoint || (!endpoint.startsWith('browser://') && !isValidUrl(endpoint))) return c.json({ error: 'valid push endpoint required' }, 400)
  const existing = await c.env.DB.prepare('SELECT id FROM notification_subscriptions WHERE endpoint_json=?').bind(JSON.stringify({ endpoint, keys: body.keys || {} })).first<any>()
  const id = existing?.id || `push_${crypto.randomUUID()}`
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO notification_subscriptions (id,channel,endpoint_json,enabled) VALUES (?,'browser',?,1) ON CONFLICT(id) DO UPDATE SET endpoint_json=excluded.endpoint_json,enabled=1`).bind(id, JSON.stringify({ endpoint, keys: body.keys || {} })),
    saveSetting(c.env.DB, 'notifications.browser', { enabled: true, subscription_id: id, updated_at: new Date().toISOString() }),
  ])
  return c.json({ ok: true, id, delivery_mode: endpoint.startsWith('browser://') ? 'in_app' : 'push' }, 201)
})

app.delete('/push/:id', async (c) => {
  const result = await c.env.DB.prepare('UPDATE notification_subscriptions SET enabled=0 WHERE id=? AND channel=\'browser\'').bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'subscription not found' }, 404)
  await c.env.DB.prepare(`INSERT INTO user_settings (setting_key,value_json,updated_at) VALUES ('notifications.browser','{"enabled":false}',datetime('now')) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`).run()
  return c.json({ ok: true })
})

app.post('/telegram', async (c) => {
  const body: { chat_id?: string; enabled?: boolean } = await c.req.json<{ chat_id?: string; enabled?: boolean }>().catch(() => ({} as { chat_id?: string; enabled?: boolean }))
  const chatId = String(body.chat_id || '').trim()
  if (body.enabled !== false && !chatId) return c.json({ error: 'chat_id required' }, 400)
  await saveSetting(c.env.DB, 'notifications.telegram', { chat_id: chatId || null, enabled: body.enabled !== false, updated_at: new Date().toISOString() }).run()
  return c.json({ ok: true, enabled: body.enabled !== false })
})

app.post('/test', async (c) => {
  const body: { channel?: 'browser' | 'telegram' } = await c.req.json<{ channel?: 'browser' | 'telegram' }>().catch(() => ({} as { channel?: 'browser' | 'telegram' }))
  const channel = body.channel || 'browser'
  const message = 'Learning Compass reminder test · delivery controls are working.'
  const deliveryId = `delivery_${crypto.randomUUID()}`
  const telegram = await setting(c.env.DB, 'notifications.telegram')
  let target = channel === 'telegram' ? String(telegram?.chat_id || '') : 'browser'
  let status = 'queued'
  let error: string | null = null
  if (channel === 'telegram') {
    if (!c.env.TELEGRAM_BOT_TOKEN || !target || telegram?.enabled === false) { status = 'failed'; error = 'Telegram is not configured or enabled.' }
    else {
      try {
        const response = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: target, text: message }) })
        if (!response.ok) { status = 'failed'; error = `Telegram returned ${response.status}` } else status = 'delivered'
      } catch (err) { status = 'failed'; error = err instanceof Error ? err.message : 'Telegram delivery failed' }
    }
  } else {
    const subscriptions = await c.env.DB.prepare(`SELECT endpoint_json FROM notification_subscriptions WHERE channel='browser' AND enabled=1`).all<any>()
    if (!(subscriptions.results || []).length) { status = 'failed'; error = 'No browser subscription is enabled.' }
    else if (!c.env.VAPID_PUBLIC_KEY || !c.env.VAPID_PRIVATE_KEY) { status = 'queued'; error = 'Browser subscription saved; configure VAPID keys for delivery while the app is closed.' }
    else {
      try {
        for (const subscription of subscriptions.results || []) { const parsed = JSON.parse(subscription.endpoint_json || '{}'); if (!String(parsed.endpoint || '').startsWith('browser://')) await sendWebPush(parsed.endpoint, parsed.keys || {}, message, c.env) }
        status = 'delivered'
      } catch (err) { status = 'failed'; error = err instanceof Error ? err.message : 'Browser push delivery failed' }
    }
  }
  await c.env.DB.prepare(`INSERT INTO notification_deliveries (id,channel,target,event_kind,status,payload_json,error,delivered_at) VALUES (?,?,?,?,?,?,?,CASE WHEN ?='delivered' THEN datetime('now') ELSE NULL END)`).bind(deliveryId, channel, target || null, 'test', status, JSON.stringify({ message }), error, status).run()
  return c.json({ ok: status !== 'failed', id: deliveryId, channel, status, error })
})

export default app
