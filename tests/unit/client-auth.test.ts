import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { authFetch } from '../../client/src/auth.ts'

test('browser requests use same-origin credentials without an unlock prompt or session exchange', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = (globalThis as any).window
  let prompts = 0
  const calls: Array<{ input: string; init?: RequestInit }> = []
  ;(globalThis as any).window = { prompt() { prompts += 1; return 'unused' } }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init })
    return Response.json({ ok: true })
  }) as typeof fetch
  try {
    const response = await authFetch('/settings')
    assert.equal(response.status, 200)
    assert.equal(prompts, 0)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init?.credentials, 'same-origin')
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = originalWindow
  }
})

test('all browser network boundaries use the shared fetch wrapper', () => {
  for (const site of ['client/src/api.ts', 'client/src/theme.ts', 'client/src/app/upload.ts', 'client/src/workspaces/SettingsWorkspace.tsx']) {
    const source = readFileSync(site, 'utf8')
    assert.match(source, /import \{ authFetch \}/)
    assert.match(source, /await authFetch\(/)
  }
  const auth = readFileSync('client/src/auth.ts', 'utf8')
  assert.doesNotMatch(auth, /window\.prompt|auth\/session|localStorage|sessionStorage|indexedDB/)
})
