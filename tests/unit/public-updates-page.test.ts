import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

const updatePath = '/updates/learning-materials'
const updateHtml = readFileSync(new URL('../../client/public/updates/learning-materials.html', import.meta.url), 'utf8')
let app: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  app = (await vite.ssrLoadModule('/src/index.ts')).default
})

test.after(async () => { await vite.close() })

test('public learning update explains the real material contract in accessible plain HTML', () => {
  assert.match(updateHtml, /^<!doctype html>/i)
  assert.match(updateHtml, /<html lang="en">/)
  assert.match(updateHtml, /name="viewport"/)
  assert.equal((updateHtml.match(/<h1\b/g) || []).length, 1)
  assert.match(updateHtml, /One clear place to start/)
  assert.match(updateHtml, /one clean canonical document/i)
  assert.match(updateHtml, /structure, type, and color come from this source—not a template/i)
  assert.match(updateHtml, /publish HTML and PDF together/i)
  assert.match(updateHtml, /first successful online open/)
  assert.match(updateHtml, /PDF still needs a connection to open/)
  assert.match(updateHtml, /When a separate learning build is requested/)
  assert.match(updateHtml, /NotebookLM never changes progress or mastery by itself/)
  assert.match(updateHtml, /href="\/#\/learn"/)
  assert.match(updateHtml, /class="skip-link"/)
  assert.doesNotMatch(updateHtml, /<script\b/i)
})

test('learning update stays public and is served with strict document headers', async () => {
  const requestedPaths: string[] = []
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        requestedPaths.push(new URL(request.url).pathname)
        return new Response(updateHtml, { headers: { 'content-type': 'text/plain' } })
      },
    },
  }

  const response = await app.fetch(new Request(`https://learning-compass.test${updatePath}`), env as any, {} as ExecutionContext)
  assert.equal(response.status, 200)
  assert.deepEqual(requestedPaths, [updatePath])
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(response.headers.get('cache-control'), 'no-cache, no-store, must-revalidate')
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'none'/)
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(await response.text(), /One lesson/)
})
