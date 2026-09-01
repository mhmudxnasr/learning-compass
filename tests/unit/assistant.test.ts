import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretAssistantMessage } from '../../src/services/assistant.ts'
import { readFileSync } from 'node:fs'

const assistantUi = readFileSync(
  new URL('../../client/src/workspaces/settings/PersonalAssistant.tsx', import.meta.url),
  'utf8',
)

test('assistant interpretation is a no-write preview and normalizes model JSON', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    assert.match(body.messages[1].content, /اتفرجت/)
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"reply":"تمام","items":[{"title":"Interstellar","item_type":"movie","state":"completed","rating":9,"tags":["space"],"personal_note":"عجبك عشان فكرته"}],"profile_signals":[{"key":"likes_mechanism","category":"taste","value":"بيحب الأفلام اللي فيها أفكار علمية","confidence":0.9}],"questions":["تحب الأفلام البطيئة؟"]}',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    const result = await interpretAssistantMessage(
      { OPENCODE_ZEN_API_KEY: 'test-key' },
      'اتفرجت على Interstellar وعجبني',
      'mixed',
    )
    assert.equal(result.available, true)
    assert.equal(result.items[0].title, 'Interstellar')
    assert.equal(result.items[0].rating, 9)
    assert.equal(result.profile_signals[0].confidence, 0.9)
    assert.equal(result.questions.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('assistant returns a safe unavailable response without an API key', async () => {
  const result = await interpretAssistantMessage({}, 'قرأت كتاب وحبيته', 'log')
  assert.equal(result.available, false)
  assert.equal(result.items.length, 0)
})

test('assistant preview requires granular confirmation and supports signals without media', () => {
  assert.match(assistantUi, /selectedSignals/)
  assert.match(assistantUi, /result\.items\.length > 0 \|\| result\.profile_signals\.length > 0/)
  assert.match(assistantUi, /selected\.length > 0 && !branchId/)
  assert.match(assistantUi, /setResult\(null\)/)
  assert.match(assistantUi, /id="personal-assistant-message"/)
  assert.match(assistantUi, /lang="ar" dir="rtl"/)
  assert.doesNotMatch(assistantUi, /for \(const signal of result\.profile_signals\)/)
})
