const FREE_MODELS = [
  'mimo-v2.5-free',
  'deepseek-v4-flash-free',
  'nemotron-3-ultra-free',
  'laguna-s-2.1-free',
  'ling-3.0-flash-free',
  'north-mini-code-free',
]
export const GEMINI_THEME_MODEL = 'gemini-3.1-flash-lite-preview'
const GEMINI_THEME_FALLBACKS = ['gemini-2.5-flash-lite']

export async function freeAi(env: { OPENCODE_ZEN_API_KEY?: string }, system: string, prompt: string, maxTokens = 1024) {
  const apiKey = env.OPENCODE_ZEN_API_KEY
  if (!apiKey) return null
  for (const model of FREE_MODELS) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)
      const response = await fetch('https://opencode.ai/zen/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': 'learning-compass/1.0',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))
      if (!response.ok) continue
      const raw = await response.text()
      let json: any
      try {
        json = JSON.parse(raw)
      } catch {
        continue
      }
      const text = json?.choices?.[0]?.message?.content?.trim()
      if (text) return { text, model }
    } catch {
      /* try the next free model */
    }
  }
  return null
}

export const freeAiModels = FREE_MODELS

export async function geminiThemeAi(env: { GOOGLE_API_KEY?: string }, prompt: string) {
  if (!env.GOOGLE_API_KEY) return null
  for (const model of [GEMINI_THEME_MODEL, ...GEMINI_THEME_FALLBACKS]) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-goog-api-key': env.GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.15, maxOutputTokens: 900, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      })
      if (!response.ok) continue
      const json: any = await response.json()
      const text = json?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part.text || '')
        .join('')
        .trim()
      if (text) return { text, model }
    } catch {
      /* try the compatible Flash-Lite fallback */
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}
