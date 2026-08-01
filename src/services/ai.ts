const DEFAULT_KEY = 'sk-jxGCRcSfOMEO0qy6OWreJIfJwfcheuZRVPJMk3okzU2uaeVRhhSivetfmNTFu3NT'
const FREE_MODELS = ['mimo-v2.5-free', 'deepseek-v4-flash-free', 'nemotron-3-ultra-free', 'laguna-s-2.1-free', 'ling-3.0-flash-free', 'north-mini-code-free']

export async function freeAi(env: { OPENCODE_ZEN_API_KEY?: string }, system: string, prompt: string, maxTokens = 1024) {
  const apiKey = env.OPENCODE_ZEN_API_KEY || DEFAULT_KEY
  if (!apiKey) return null
  for (const model of FREE_MODELS) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)
      const response = await fetch('https://opencode.ai/zen/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'learning-compass/1.0', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.4, max_tokens: maxTokens }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))
      if (!response.ok) continue
      const raw = await response.text()
      let json: any
      try { json = JSON.parse(raw) } catch { continue }
      const text = json?.choices?.[0]?.message?.content?.trim()
      if (text) return { text, model }
    } catch { /* try the next free model */ }
  }
  return null
}

export const freeAiModels = FREE_MODELS
