import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { freeAi } from '../services/ai'

const app = new Hono<{ Bindings: Bindings }>()

// Offline fallback: return the curator's own text cleaned up (never dead).
function localEnhance(text: string, item: any): string {
  const t = (text || '').trim() || (item?.user_review || '').trim() || (item?.why_this || '').trim()
  if (!t) return 'Write a sentence of feedback first, then enhance it.'
  return t.replace(/\s+/g, ' ').trim().slice(0, 280)
}

app.post('/enhance', async (c) => {
  const { DB } = c.env
  let body: { id?: string; text?: string; video_title?: string; creator?: string; content_type?: string; why_this?: string }
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
      const wordCount = content.split(/\s+/).filter(Boolean).length
      const tooThin = wordCount <= 3
      const seed = tooThin
        ? `The curator's note is too vague to sharpen: "${content}". Do NOT invent specifics. Reply with exactly this, unchanged: ${content}`
        : `Rewrite the curator's note below as a clean, well-structured review. You MUST write at least 2 complete sentences. Rules:
- Use ONLY facts, opinions, and specifics the curator already wrote. Do NOT add any new claims, new details, new judgments, or recommendations that were not in the note.
- You may tighten wording, fix grammar, expand into as many sentences as the note naturally supports, and improve flow — but the verdict and every concrete point must come from the note, never from you.
- No preamble, no emoji, no hype words.

Context:
${ctx}

Curator's note:
${content}`

      const result = await freeAi(c.env, 'You are a strict copy editor. Use only the curator\'s own words; never invent claims. Return only the polished note.', seed, 1024)
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
