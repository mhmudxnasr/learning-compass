import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let getClientIp: (request: any) => string
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
  getClientIp = (await vite.ssrLoadModule('/src/index.ts')).getClientIp
})
test.after(async () => {
  await vite.close()
})

function requestWithHeaders(headers: Record<string, string>) {
  return {
    req: {
      header(name: string) {
        return headers[name]
      },
    },
  }
}

test('client identity prefers Cloudflare and direct-proxy headers over spoofable forwarding chains', () => {
  assert.equal(
    getClientIp(
      requestWithHeaders({
        'cf-connecting-ip': '203.0.113.7',
        'x-real-ip': '198.51.100.8',
        'x-forwarded-for': '192.0.2.9, 192.0.2.10',
      }),
    ),
    '203.0.113.7',
  )
  assert.equal(
    getClientIp(
      requestWithHeaders({
        'x-real-ip': '198.51.100.8',
        'x-forwarded-for': '192.0.2.9, 192.0.2.10',
      }),
    ),
    '198.51.100.8',
  )
  assert.equal(
    getClientIp(
      requestWithHeaders({
        'x-forwarded-for': '192.0.2.9, 192.0.2.10',
      }),
    ),
    '192.0.2.9',
  )
  assert.equal(getClientIp(requestWithHeaders({})), 'unknown')
})
