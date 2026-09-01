import { Hono } from 'hono'
import { Bindings, safeErrorMessage } from '../lib'
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
  let body: {
    id?: string
    text?: string
    video_title?: string
    creator?: string
    content_type?: string
    why_this?: string
    rating?: number | string
  }
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
  const content = (body.text || '').trim() || (item?.user_review || '').trim() || (item?.why_this || '').trim()
  const title = (body.video_title || item?.video_title || '').trim()
  const creator = (body.creator || item?.creator || '').trim()
  const type = (body.content_type || item?.content_type || 'video').trim()

  if (!content) {
    return c.json({ text: localEnhance('', item), source: 'local' })
  }

  {
    try {
      const ctx = [title && `Title: ${title}`, creator && `Creator: ${creator}`, `Type: ${type}`]
        .filter(Boolean)
        .join('\n')
      const seed = feedbackEnhancementPrompt(content, ctx, body.rating)

      const result = await freeAi(
        c.env,
        "You are a light-touch copy editor. Preserve the writer's meaning, uncertainty, conversational voice, and spoken tone. Never invent claims. Return only the edited feedback.",
        seed,
        1024,
      )
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
  let body: { id?: string; video_title?: string; creator?: string; content_type?: string; video_url?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const title = (body.video_title || '').trim()
  if (!title) return c.json({ text: '', source: 'empty' })

  const ctx = [
    title && `Title: ${title}`,
    body.creator && `Creator: ${body.creator}`,
    body.content_type && `Type: ${body.content_type}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const result = await freeAi(
      c.env,
      'You recommend specific content to a curious autodidact. Return only 1–2 concise sentences explaining fit, with no hype.',
      `Context:\n${ctx}\n\nExplain why this source fits.`,
      256,
    )
    if (result) return c.json({ text: result.text, source: 'ai', model: result.model })
  } catch {}
  return c.json({ text: '', source: 'none' })
})

const THEME_KEYS = [
  'brand',
  'shell',
  'surface',
  'highlight',
  'accent',
  'ink',
  'rail',
  'seam',
  'due',
  'danger',
  'map',
] as const
const SURPRISE_DIRECTIONS = [
  'Warm editorial product studio: ivory paper, black ink, one decisive coral action, soft seams, and tactile lifted surfaces.',
  'Precision command workspace: near-black chrome, luminous cool-white text, one disciplined violet signal, and compact tonal depth.',
  'High-velocity navy workspace: midnight blue planes, electric sky actions, sharp hierarchy, and restrained status colors.',
  'Reader-first publishing desk: parchment, burnt orange, espresso ink, and a low-fatigue long-form surface system.',
  'Modern monochrome notebook: paper white, charcoal hierarchy, soft gray controls, and one deliberately quiet accent.',
  'Crafted journal studio: cream, clay, oxblood, and warm brown with generous editorial separation.',
  'Spatial lavender workspace: pale lilac chrome, saturated violet focus, ink-dark navigation, and friendly soft surfaces.',
  'Archival gallery index: white and warm gray, cobalt links, blunt seams, and almost no decorative color.',
  'Luxury cultural journal: bone, tobacco, burgundy, and black with confident typography and restrained contrast.',
  'Mineral research desk: salt white, slate, oxidized copper, and muted turquoise with calm scientific clarity.',
  'Swiss product editorial: disciplined neutrals, one primary red, exact rules, and crisp information hierarchy.',
  'Contemporary coastal utility: chalk, deep marine, sea-glass teal, and one warm signal with clean product restraint.',
] as const
const themePalette = (value: any) => {
  if (Array.isArray(value)) value = Object.fromEntries(THEME_KEYS.map((key, index) => [key, value[index]]))
  const source = value?.colors || value?.palette || value
  if (!source || typeof source !== 'object') return null
  const palette: Record<string, string> = {}
  for (const key of THEME_KEYS) {
    const color = String(source[key] || '')
      .trim()
      .toUpperCase()
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
  const body = await c.req
    .json<{ current?: Record<string, string>; mode?: 'day' | 'night' }>()
    .catch(() => ({}) as { current?: Record<string, string>; mode?: 'day' | 'night' })
  const direction = SURPRISE_DIRECTIONS[Math.floor(Math.random() * SURPRISE_DIRECTIONS.length)]
  const prompt = `Act as the senior product art director for a premium 2026 learning workspace. Create one production-ready paired theme for Learning Compass from this direction: ${direction} The result should feel authored, contemporary, tactile, and expensive—not like a random color generator or a generic SaaS dashboard. Return ONLY valid JSON with exactly two objects, day and night. Each object must contain exactly these keys: ${THEME_KEYS.join(', ')}. Every value must be a six-digit uppercase HEX code matching ^#[0-9A-F]{6}$. Day and night must be recognizably the same visual world under different lighting while remaining materially different from each other and from the current palette. Use a disciplined neutral foundation, one confident primary working signal, clear surface elevation, and mature functional colors. Draw high-level inspiration from premium product and editorial systems such as Attio, Linear, Raycast, Superhuman, Readwise Reader, Notion, Craft, Arc, Are.na, Swiss publishing, and independent cultural journals, but do not copy any website's exact branding, logo, layout, or proprietary palette. Reject generic SaaS blue, muddy near-duplicates, gratuitous neon, gradients, glassmorphism soup, and timid low-contrast accents. Keep ink readable on shell and surface at WCAG AA contrast (4.5:1 minimum), keep due and danger distinct, and keep map muted but visibly separate from brand. Current mode: ${body.mode || 'day'}. Current palette JSON: ${JSON.stringify(body.current || {})}. Output JSON only; no markdown, comments, explanation, or extra keys.`
  const result = await geminiThemeAi(c.env, prompt)
  if (!result)
    return c.json({ error: 'Gemini theme generation is unavailable.', model: 'gemini-3.1-flash-lite-preview' }, 503)
  try {
    const parsed = JSON.parse(
      result.text
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim(),
    )
    const variants = Array.isArray(parsed) ? parsed : parsed?.variants
    const day = themePalette(
      parsed?.day ||
        parsed?.day_palette ||
        parsed?.light ||
        parsed?.light_palette ||
        variants?.[0]?.day ||
        variants?.[0]?.light ||
        variants?.[0],
    )
    const night = themePalette(
      parsed?.night ||
        parsed?.night_palette ||
        parsed?.dark ||
        parsed?.dark_palette ||
        variants?.[1]?.night ||
        variants?.[1]?.dark ||
        variants?.[1],
    )
    if (!day || !night || !hasAccessibleThemeInk(day) || !hasAccessibleThemeInk(night)) {
      return c.json({ error: 'Gemini returned an invalid theme shape.', model: result.model }, 502)
    }
    return c.json({ day, night, model: result.model })
  } catch {
    return c.json({ error: 'Gemini returned invalid JSON.', model: result.model }, 502)
  }
})

export default app
