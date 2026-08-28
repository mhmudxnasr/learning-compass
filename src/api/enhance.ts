import { Hono } from 'hono'
import { Bindings, safeError, safeErrorMessage } from '../lib'
import { freeAi, geminiThemeAi } from '../services/ai'

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
      console.warn('enhance upstream failed, falling back', safeErrorMessage(e))
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

const THEME_KEYS = ['brand', 'shell', 'surface', 'highlight', 'accent', 'ink', 'rail', 'seam', 'due', 'danger', 'map'] as const
const SURPRISE_DIRECTIONS = [
  'Near-black and white monochrome: almost no color, stark ink, paper-white surfaces, and one barely-there status color.',
  'High-chroma color collision: vivid cobalt, vermilion, acid lime, electric violet, or hot pink, balanced by disciplined neutrals.',
  'Swiss International / Bauhaus poster logic: strict neutrals, one primary color, one geometric accent, and uncompromising contrast.',
  'Brutalist editorial web: black, white, raw gray, one alarming signal color, hard seams, and no softness.',
  'Luxury fashion editorial: ink, bone, parchment, tobacco, oxblood, or metallic-like muted accents with restrained contrast.',
  'Late-90s web palette reinterpreted for modern accessibility: saturated cyan, purple, blue, or orange with clean neutral surfaces.',
  'Bloomberg-like information density and Financial Times-like print warmth: editorial paper, dark ink, restrained signal colors.',
  'Stripe / Linear / Notion-inspired product calm: precise neutral surfaces with one unexpected luminous accent, without copying their branding.',
  'Night-only astronomical laboratory: deep black or navy, luminous text, one ultraviolet or cyan signal, and quiet secondary tones.',
  'Botanical field guide pushed to an extreme: moss, lichen, clay, pollen, or poisonous green, with deliberately unusual pairings.',
  'Desert mineral / oxidized metal: sand, rust, copper, slate, turquoise, or salt-white, with strong daylight and night reversals.',
  'Pop-art / album-cover energy: unexpected complementary colors, bold contrast, and a playful but still readable system.',
] as const
const themePalette = (value: any) => {
  if (Array.isArray(value)) value = Object.fromEntries(THEME_KEYS.map((key, index) => [key, value[index]]))
  const source = value?.colors || value?.palette || value
  if (!source || typeof source !== 'object') return null
  const palette: Record<string, string> = {}
  for (const key of THEME_KEYS) {
    const color = String(source[key] || '').trim().toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(color)) return null
    palette[key] = color
  }
  return palette
}

const hexLuminance = (hex: string) => {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const hexContrast = (foreground: string, background: string) => {
  const lighter = Math.max(hexLuminance(foreground), hexLuminance(background))
  const darker = Math.min(hexLuminance(foreground), hexLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const hasAccessibleThemeInk = (palette: Record<string, string>) =>
  ['shell', 'surface'].every((plane) => hexContrast(palette.ink, palette[plane]) >= 4.5)

app.post('/theme-variants', async (c) => {
  const body = await c.req.json<{ current?: Record<string, string>; mode?: 'day' | 'night' }>().catch(() => ({} as { current?: Record<string, string>; mode?: 'day' | 'night' }))
  const direction = SURPRISE_DIRECTIONS[Math.floor(Math.random() * SURPRISE_DIRECTIONS.length)]
  const prompt = `Create a genuinely surprising, production-ready paired theme for Learning Compass. This is a deliberate visual lottery: do not make a safe variation of the current palette. Random art direction for this run: ${direction} Return ONLY valid JSON with exactly two objects, day and night. Each object must contain exactly these keys: ${THEME_KEYS.join(', ')}. Every value must be a six-digit uppercase HEX code matching ^#[0-9A-F]{6}$. Day and night must feel like the same art direction under different lighting, but they must be materially different from each other and from the current palette. Explore the named direction aggressively: black-and-white is allowed, extreme color is allowed, and unusual combinations are preferred. Draw inspiration from recognizable traditions such as Swiss posters, Bauhaus, brutalist web, luxury editorial, Bloomberg/Financial Times information design, Stripe/Linear/Notion product calm, album covers, and late-90s web palettes, but do not copy any website's exact branding, logo, layout, or proprietary palette. Avoid default green, generic SaaS blue, beige-and-green safety, muddy near-duplicates, gradients, and neon unless the selected direction explicitly calls for it. Keep ink readable on shell and surface at WCAG AA contrast (4.5:1 minimum), keep due and danger distinct, and keep map muted but visibly separate from brand. Current mode: ${body.mode || 'day'}. Current palette JSON: ${JSON.stringify(body.current || {})}. Output JSON only; no markdown, comments, explanation, or extra keys.`
  const result = await geminiThemeAi(c.env, prompt)
  if (!result) return c.json({ error: 'Gemini theme generation is unavailable.', model: 'gemini-3.1-flash-lite-preview' }, 503)
  try {
    const parsed = JSON.parse(result.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim())
    const variants = Array.isArray(parsed) ? parsed : parsed?.variants
    const day = themePalette(parsed?.day || parsed?.day_palette || parsed?.light || parsed?.light_palette || variants?.[0]?.day || variants?.[0]?.light || variants?.[0])
    const night = themePalette(parsed?.night || parsed?.night_palette || parsed?.dark || parsed?.dark_palette || variants?.[1]?.night || variants?.[1]?.dark || variants?.[1])
    if (!day || !night || !hasAccessibleThemeInk(day) || !hasAccessibleThemeInk(night)) {
      return c.json({ error: 'Gemini returned an invalid theme shape.', model: result.model }, 502)
    }
    return c.json({ day, night, model: result.model })
  } catch { return c.json({ error: 'Gemini returned invalid JSON.', model: result.model }, 502) }
})

export default app
