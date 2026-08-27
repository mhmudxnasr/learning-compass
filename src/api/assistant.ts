import { Hono } from 'hono'
import type { Bindings } from '../lib.ts'
import { interpretAssistantMessage, type AssistantMode } from '../services/assistant.ts'

const app = new Hono<{ Bindings: Bindings }>()

app.post('/interpret', async (c) => {
  const body: { message?: string; mode?: AssistantMode } = await c.req.json<{ message?: string; mode?: AssistantMode }>().catch(() => ({} as { message?: string; mode?: AssistantMode }))
  const mode = body.mode === 'log' || body.mode === 'questions' ? body.mode : 'mixed'
  if (!String(body.message || '').trim()) return c.json({ error: 'message required' }, 400)
  return c.json(await interpretAssistantMessage(c.env, String(body.message), mode))
})

export default app
