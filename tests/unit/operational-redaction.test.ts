import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'

let worker: any
let captureApp: any
let hardcoverApp: any
let notificationsApp: any
let deliverScheduledReminders: any
let syncHardcoverLibrary: any
let syncFeed: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  const [indexModule, captureModule, hardcoverApiModule, notificationsModule, hardcoverServiceModule, rssModule] =
    await Promise.all([
      vite.ssrLoadModule('/src/index.ts'),
      vite.ssrLoadModule('/src/api/capture.ts'),
      vite.ssrLoadModule('/src/api/hardcover.ts'),
      vite.ssrLoadModule('/src/api/notifications.ts'),
      vite.ssrLoadModule('/src/services/hardcover.ts'),
      vite.ssrLoadModule('/src/services/rss.ts'),
    ])
  worker = indexModule.default
  captureApp = captureModule.default
  hardcoverApp = hardcoverApiModule.default
  notificationsApp = notificationsModule.default
  deliverScheduledReminders = (await vite.ssrLoadModule('/src/services/notifications.ts')).deliverScheduledReminders
  syncHardcoverLibrary = hardcoverServiceModule.syncHardcoverLibrary
  syncFeed = rssModule.syncFeed
})

test.after(async () => {
  await vite.close()
})

const leakedDetail = 'authorization=header-credential-value https://provider.example/fail?token=query-credential-value'
const assertRedacted = (value: unknown) => {
  const text = String(value || '')
  assert.doesNotMatch(text, /credential-value/)
  assert.match(text, /\[redacted\]/)
}

function statement(
  sql: string,
  handlers: {
    first?: (sql: string, values: unknown[]) => unknown
    all?: (sql: string, values: unknown[]) => unknown
    run?: (sql: string, values: unknown[]) => unknown
  },
) {
  const prepared: any = {
    values: [] as unknown[],
    bind: (...values: unknown[]) => {
      prepared.values = values
      return prepared
    },
    first: async () => handlers.first?.(sql, prepared.values) ?? null,
    all: async () => handlers.all?.(sql, prepared.values) ?? { results: [] },
    run: async () => handlers.run?.(sql, prepared.values) ?? { success: true, meta: { changes: 1 } },
  }
  return prepared
}

test('Telegram webhook failures persist only redacted operational detail', async () => {
  let persisted = ''
  const DB = {
    prepare(sql: string) {
      return statement(sql, {
        first: () => {
          if (sql.includes('FROM telegram_updates')) return null
          if (sql.includes('FROM recommendations')) throw new Error(leakedDetail)
          return null
        },
        run: (_query, values) => {
          if (sql.includes("SET status='failed'")) persisted = String(values[0] || '')
          return { success: true, meta: { changes: 1 } }
        },
      })
    },
  }
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const response = await (worker.fetch as any)(
      new Request('https://compass.test/api/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-webhook-secret' },
        body: JSON.stringify({
          update_id: 701,
          message: { message_id: 1, chat: { id: 42 }, text: 'https://example.com/source' },
        }),
      }),
      {
        DB,
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
        TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
        TELEGRAM_ALLOWED_CHAT_ID: '42',
      },
      {},
    )
    assert.equal(response.status, 500)
    assert.doesNotMatch(await response.text(), /credential-value/)
    assertRedacted(persisted)
  } finally {
    console.error = originalConsoleError
  }
})

test('notification delivery persistence and API responses redact upstream credentials', async () => {
  const persisted: string[] = []
  const DB = {
    prepare(sql: string) {
      return statement(sql, {
        first: () => {
          if (sql.includes('FROM srs_cards')) return { count: 1 }
          if (sql.includes('FROM notification_deliveries')) return { count: 0 }
          if (sql.includes('FROM user_settings'))
            return { value_json: JSON.stringify({ enabled: true, chat_id: '42' }) }
          return null
        },
        all: () => ({ results: [] }),
        run: (_query, values) => {
          if (sql.includes('INSERT INTO notification_deliveries')) persisted.push(String(values[6] || ''))
          return { success: true, meta: { changes: 1 } }
        },
      })
    },
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error(leakedDetail)
  }) as typeof fetch
  try {
    await deliverScheduledReminders({ DB, TELEGRAM_BOT_TOKEN: 'test-bot-token' } as any)
    const response = await notificationsApp.request(
      'https://compass.test/test',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: 'telegram' }),
      },
      { DB, TELEGRAM_BOT_TOKEN: 'test-bot-token' } as any,
    )
    assert.equal(response.status, 200)
    assertRedacted(((await response.json()) as any).error)
    assert.equal(persisted.length, 2)
    for (const value of persisted) assertRedacted(value)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('RSS failures redact credential-bearing URLs in D1 and API responses', async () => {
  let persisted = ''
  const DB = {
    prepare(sql: string) {
      return statement(sql, {
        first: () => {
          if (sql.includes('FROM tree_nodes')) return { id: 'branch-1', label: 'Branch', status: 'active' }
          return null
        },
        run: (_query, values) => {
          if (sql.includes('UPDATE feed_sources SET last_checked_at')) persisted = String(values[0] || '')
          return { success: true, meta: { changes: 1 } }
        },
      })
    },
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error(leakedDetail)
  }) as typeof fetch
  try {
    await assert.rejects(() =>
      syncFeed(
        DB as any,
        {
          id: 'feed-1',
          feed_url: 'https://example.com/feed?token=query-credential-value',
          title: 'Feed',
          site_url: null,
          etag: null,
          last_modified: null,
          branch_id: 'branch-1',
        } as any,
      ),
    )
    assertRedacted(persisted)

    const response = await captureApp.request(
      'https://compass.test/feeds',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/feed?token=query-credential-value', branch_id: 'branch-1' }),
      },
      { DB } as any,
    )
    assert.equal(response.status, 400)
    assertRedacted(((await response.json()) as any).error)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Hardcover failures redact provider detail in D1 and API responses', async () => {
  const persisted: string[] = []
  const DB = {
    prepare(sql: string) {
      return statement(sql, {
        all: () => ({ results: [] }),
        run: (_query, values) => {
          if (sql.includes("SET status='error'")) persisted.push(String(values[0] || ''))
          return { success: true, meta: { changes: 1 } }
        },
      })
    },
    batch: async () => [],
  }
  const credentialErrorResponse = () => Response.json({ errors: [{ message: leakedDetail }] })
  await assert.rejects(() =>
    syncHardcoverLibrary(DB as any, 'test-provider-token', async () => credentialErrorResponse()),
  )
  assertRedacted(persisted[0])

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => credentialErrorResponse()) as typeof fetch
  try {
    const response = await hardcoverApp.request('https://compass.test/sync', { method: 'POST' }, {
      DB,
      HARDCOVER_API_TOKEN: 'test-provider-token',
    } as any)
    assert.equal(response.status, 502)
    assertRedacted(((await response.json()) as any).detail)
    assertRedacted(persisted[1])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('every audited operational boundary calls the shared redactor', () => {
  const index = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const notifications = readFileSync(new URL('../../src/api/notifications.ts', import.meta.url), 'utf8')
  const delivery = readFileSync(new URL('../../src/services/notifications.ts', import.meta.url), 'utf8')
  const rss = readFileSync(new URL('../../src/services/rss.ts', import.meta.url), 'utf8')
  const capture = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
  const hardcoverService = readFileSync(new URL('../../src/services/hardcover.ts', import.meta.url), 'utf8')
  const hardcoverApi = readFileSync(new URL('../../src/api/hardcover.ts', import.meta.url), 'utf8')
  assert.match(index, /const failure = safeErrorMessage\(error\)/)
  assert.equal((notifications + delivery).match(/deliveryFailure\(err,/g)?.length, 4)
  for (const source of [rss, capture, hardcoverService, hardcoverApi])
    assert.match(source, /redactSensitiveText\(error,/)
  assert.doesNotMatch(rss, /error instanceof Error \? error\.message/)
  assert.doesNotMatch(capture, /error instanceof Error \? error\.message/)
  assert.doesNotMatch(hardcoverService, /error instanceof Error \? error\.message/)
  assert.doesNotMatch(hardcoverApi, /error instanceof Error \? error\.message/)
})
