import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { freeAi } from '../services/ai'

const app = new Hono<{ Bindings: Bindings }>()

// Offline fallback: return the curator's own text cleaned up (never dead).
export function localEnhance(text: string, item: any): string {
  const t = (text || '').trim() || (item?.user_review || '').trim() || (item?.why_this || '').trim()
  if (!t) return 'Write a sentence of feedback first, then enhance it.'
  return t.replace(/\s+/g, ' ').trim()
}

export function feedbackEnhancementPrompt(content: string, ctx: string, rating?: number | string): string {
  return `Lightly improve the clarity and flow of the curator's feedback below while keeping it conversational and close to their original voice. Preserve uncertainty, spoken phrasing, meaning, verdict, and every concrete point. Do not make it formal, add claims, or force extra sentences. Return only the edited feedback.

${rating != null ? `The source is rated ${rating}/10. Do not change or reinterpret this rating.\n\n` : ''}Source context:
${ctx}

Curator's feedback:
${content}`
}

app.post('/enhance', async (c) => {
  const { DB } = c.env
  let body: { id?: string; text?: string; video_title?: string; creator?: string; content_type?: string; why_this?: string; rating?: number | string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  // Always try to load the item for context (title/creator/type), regardless of
  // whether the user also supplied live text.
  let item: any = null
  if (body.id) {
    const row = await DB.prepare('SELECT * FROM recommendations WHERE id = ?').bind(body.id).first<any>()
    item = row || null
  }

  // The content to sharpen is the curator's OWN written text, falling back to
  // stored notes. This is the text the user actually wants improved.
  const content = (body.text || '').trim()
    || (item?.user_review || '').trim()
    || (item?.why_this || '').trim()
  const title = (body.video_title || item?.video_title || '').trim()
  const creator = (body.creator || item?.creator || '').trim()
  const type = (body.content_type || item?.content_type || 'video').trim()

  if (!content) {
    return c.json({ text: localEnhance('', item), source: 'local' })
  }

  {
    try {
      const ctx = [
        title && `Title: ${title}`,
        creator && `Creator: ${creator}`,
        `Type: ${type}`,
      ].filter(Boolean).join('\n')
      const seed = feedbackEnhancementPrompt(content, ctx, body.rating)

      const result = await freeAi(c.env, 'You are a light-touch copy editor. Preserve the writer\'s meaning, uncertainty, conversational voice, and spoken tone. Never invent claims. Return only the edited feedback.', seed, 1024)
      if (result) return c.json({ text: result.text, source: 'ai', model: result.model })
    } catch (e) {
      console.warn('enhance upstream failed, falling back', e)
    }
  }

  // local fallback
  return c.json({ text: localEnhance(content, item), source: 'local' })
})

// Generate a "why_this" note for new recommendations
app.post('/enhance/why', async (c) => {
  const { DB } = c.env
  let body: { id?: string; video_title?: string; creator?: string; content_type?: string; video_url?: string }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const title = (body.video_title || '').trim()
  if (!title) return c.json({ text: '', source: 'empty' })

  const ctx = [
    title && `Title: ${title}`,
    body.creator && `Creator: ${body.creator}`,
    body.content_type && `Type: ${body.content_type}`,
  ].filter(Boolean).join('\n')

  try {
    const result = await freeAi(c.env, 'You recommend specific content to a curious autodidact. Return only 1–2 concise sentences explaining fit, with no hype.', `Context:\n${ctx}\n\nExplain why this source fits.`, 256)
    if (result) return c.json({ text: result.text, source: 'ai', model: result.model })
  } catch { }
  return c.json({ text: '', source: 'none' })
})

export default app
