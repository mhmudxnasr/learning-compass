import assert from 'node:assert/strict'
import test from 'node:test'

import { geminiThemeAi } from '../../src/services/ai.ts'

test('Gemini credentials travel only in the API-key header', async () => {
  const originalFetch = globalThis.fetch
  let observedUrl = ''
  let observedHeaders = new Headers()
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    observedUrl = String(input)
    observedHeaders = new Headers(init?.headers)
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"theme":"safe"}' }] } }] })
  }) as typeof fetch
  try {
    const result = await geminiThemeAi({ GOOGLE_API_KEY: 'dummy-google-secret' }, 'Create a theme')
    assert.equal(result?.model, 'gemini-3.1-flash-lite-preview')
    assert.equal(new URL(observedUrl).search, '')
    assert.equal(observedHeaders.get('x-goog-api-key'), 'dummy-google-secret')
    assert.equal(observedHeaders.get('authorization'), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})
