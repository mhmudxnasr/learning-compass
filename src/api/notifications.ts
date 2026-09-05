import { Hono } from 'hono'
import type { Bindings } from '../lib'
import { validatePushEndpoint } from '../services/public-url'
import { deliveryFailure, saveSetting, sendWebPush, setting } from '../services/notifications'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  const [browser, telegram, subscriptions, deliveries] = await Promise.all([
    setting(c.env.DB, 'notifications.browser'),
    setting(c.env.DB, 'notifications.telegram'),
    c.env.DB.prepare(
      `SELECT id,channel,enabled,created_at FROM notification_subscriptions ORDER BY created_at DESC`,
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT id,channel,target,event_kind,status,error,attempted_at,delivered_at FROM notification_deliveries ORDER BY attempted_at DESC LIMIT 30`,
    ).all<any>(),
  ])
  return c.json({ browser, telegram, subscriptions: subscriptions.results || [], deliveries: deliveries.results || [] })
})

app.get('/vapid', (c) =>
  c.json({ configured: Boolean((c.env as any).VAPID_PUBLIC_KEY), public_key: (c.env as any).VAPID_PUBLIC_KEY || null }),
)

app.post('/push/subscribe', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  let endpoint: string
  try {
    endpoint = validatePushEndpoint(body.endpoint)
  } catch {
    return c.json({ error: 'public HTTPS push endpoint required' }, 400)
  }
  const existing = await c.env.DB.prepare('SELECT id FROM notification_subscriptions WHERE endpoint_json=?')
    .bind(JSON.stringify({ endpoint, keys: body.keys || {} }))
    .first<any>()
  const id = existing?.id || `push_${crypto.randomUUID()}`
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO notification_subscriptions (id,channel,endpoint_json,enabled) VALUES (?,'browser',?,1) ON CONFLICT(id) DO UPDATE SET endpoint_json=excluded.endpoint_json,enabled=1`,
    ).bind(id, JSON.stringify({ endpoint, keys: body.keys || {} })),
    saveSetting(c.env.DB, 'notifications.browser', {
      enabled: true,
      subscription_id: id,
      updated_at: new Date().toISOString(),
    }),
  ])
  return c.json({ ok: true, id, delivery_mode: endpoint.startsWith('browser://') ? 'in_app' : 'push' }, 201)
})

app.delete('/push/:id', async (c) => {
  const result = await c.env.DB.prepare(
    "UPDATE notification_subscriptions SET enabled=0 WHERE id=? AND channel='browser'",
  )
    .bind(c.req.param('id'))
    .run()
  if (!result.meta.changes) return c.json({ error: 'subscription not found' }, 404)
  await c.env.DB.prepare(
    `INSERT INTO user_settings (setting_key,value_json,updated_at) VALUES ('notifications.browser','{"enabled":false}',datetime('now')) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`,
  ).run()
  return c.json({ ok: true })
})

app.post('/telegram', async (c) => {
  const body: { chat_id?: string; enabled?: boolean } = await c.req
    .json<{ chat_id?: string; enabled?: boolean }>()
    .catch(() => ({}) as { chat_id?: string; enabled?: boolean })
  const chatId = String(body.chat_id || '').trim()
  if (body.enabled !== false && !chatId) return c.json({ error: 'chat_id required' }, 400)
  await saveSetting(c.env.DB, 'notifications.telegram', {
    chat_id: chatId || null,
    enabled: body.enabled !== false,
    updated_at: new Date().toISOString(),
  }).run()
  return c.json({ ok: true, enabled: body.enabled !== false })
})

app.post('/test', async (c) => {
  const body: { channel?: 'browser' | 'telegram' } = await c.req
    .json<{ channel?: 'browser' | 'telegram' }>()
    .catch(() => ({}) as { channel?: 'browser' | 'telegram' })
  const channel = body.channel || 'browser'
  const message = 'Learning Compass reminder test · delivery controls are working.'
  const deliveryId = `delivery_${crypto.randomUUID()}`
  const telegram = await setting(c.env.DB, 'notifications.telegram')
  const target = channel === 'telegram' ? String(telegram?.chat_id || '') : 'browser'
  let status: string
  let error: string | null = null
  if (channel === 'telegram') {
    if (!c.env.TELEGRAM_BOT_TOKEN || !target || telegram?.enabled === false) {
      status = 'failed'
      error = 'Telegram is not configured or enabled.'
    } else {
      try {
        const response = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: target, text: message }),
        })
        if (!response.ok) {
          status = 'failed'
          error = `Telegram returned ${response.status}`
        } else status = 'delivered'
      } catch (err) {
        status = 'failed'
        error = deliveryFailure(err, 'Telegram delivery failed')
      }
    }
  } else {
    const subscriptions = await c.env.DB.prepare(
      `SELECT endpoint_json FROM notification_subscriptions WHERE channel='browser' AND enabled=1`,
    ).all<any>()
    if (!(subscriptions.results || []).length) {
      status = 'failed'
      error = 'No browser subscription is enabled.'
    } else if (!c.env.VAPID_PUBLIC_KEY || !c.env.VAPID_PRIVATE_KEY) {
      status = 'queued'
      error = 'Browser subscription saved; configure VAPID keys for delivery while the app is closed.'
    } else {
      try {
        for (const subscription of subscriptions.results || []) {
          const parsed = JSON.parse(subscription.endpoint_json || '{}')
          if (!String(parsed.endpoint || '').startsWith('browser://'))
            await sendWebPush(parsed.endpoint, parsed.keys || {}, message, c.env)
        }
        status = 'delivered'
      } catch (err) {
        status = 'failed'
        error = deliveryFailure(err, 'Browser push delivery failed')
      }
    }
  }
  await c.env.DB.prepare(
    `INSERT INTO notification_deliveries (id,channel,target,event_kind,status,payload_json,error,delivered_at) VALUES (?,?,?,?,?,?,?,CASE WHEN ?='delivered' THEN datetime('now') ELSE NULL END)`,
  )
    .bind(deliveryId, channel, target || null, 'test', status, JSON.stringify({ message }), error, status)
    .run()
  return c.json({ ok: status !== 'failed', id: deliveryId, channel, status, error })
})

export default app
