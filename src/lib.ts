import { Hono } from 'hono'

export type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  ARTIFACTS?: R2Bucket
  // Optional locally; production binds Workers AI + Vectorize for semantic
  // retrieval. Keeping these optional makes local D1 tests deterministic.
  AI?: any
  COMPASS_VECTORS?: any
  ALLOW_UNAUTHENTICATED_LOCAL_WRITES?: string
  GOOGLE_API_KEY?: string
  GEMINI_API_KEY?: string
  OPENCODE_ZEN_API_KEY?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_WEBHOOK_SECRET?: string
  TELEGRAM_ALLOWED_CHAT_ID?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  HARDCOVER_API_TOKEN?: string
}

export type Recommendation = {
  id: string
  video_title: string
  creator: string | null
  content_type: string | null
  video_url: string
  why_this: string | null
  context_brief: string | null
  verified: string | null
  status: 'active' | 'consumed' | 'rejected'
  user_rating: string | null
  user_score: number | null
  user_review: string | null
  dedup_key: string
  synergy_bundle_id: string | null
  consumed_date: string | null
  notebook_url: string | null
  created_at: string
}

export const VALID_STATUS = new Set(['active', 'consumed', 'rejected'])
export const VALID_RATINGS = new Set(['unset', 'love', 'like', 'meh', 'dislike'])
export const VALID_LOG_KINDS = new Set(['feedback', 'tree_change', 'pattern', 'note', 'system'])

// ---------- rating normalization (data quality) ----------
// Accepts the legacy enum OR any numeric score 0-10 and returns a normalized
// { rating: enum|'unset', score: number|null }. This kills the "9/10 free-text drift"
// by coercing every write into one of two consistent shapes.
export function normalizeRating(raw: unknown): { rating: string; score: number | null } {
  if (raw == null) return { rating: 'unset', score: null }
  const s = String(raw).trim()
  if (s === '' || s === 'unset') return { rating: 'unset', score: null }
  // legacy enum
  if (VALID_RATINGS.has(s)) {
    const map: Record<string, number | null> = { unset: null, love: 10, like: 8, meh: 5, dislike: 2 }
    return { rating: s, score: map[s] ?? null }
  }
  // numeric-ish: "9/10", "5/10", "9", "10/10" -> take the first number (the score)
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (m) {
    let n = parseFloat(m[1])
    if (!isNaN(n)) {
      n = Math.max(0, Math.min(10, n))
      const rating = n >= 8 ? 'love' : n >= 6 ? 'like' : n >= 4 ? 'meh' : 'dislike'
      return { rating, score: n }
    }
  }
  return { rating: 'unset', score: null }
}

// ---------- dedup key derivation (data quality) ----------
// If no explicit dedup_key is supplied we derive a stable one from the source so
// re-pushes never silently duplicate. yt_<id> / book_<slug> / article_<slug> / etc.
export function deriveDedupKey(item: { video_url?: any; content_type?: any; dedup_key?: any; video_title?: any }): string {
  if (item.dedup_key && item.dedup_key.trim()) return item.dedup_key.trim()
  const url = item.video_url || ''
  // YouTube
  const yt = url.match(/(?:youtu\.be\/|v=)([\w-]{6,})/) || url.match(/youtube\.com\/embed\/([\w-]+)/)
  if (yt) return 'yt_' + yt[1]
  // Amazon book
  const amz = url.match(/amazon\.[a-z.]+\/(?:dp|gp\/product|product)\/([A-Z0-9]{8,})/i)
  if (amz) return 'book_' + amz[1]
  // ISBN-ish
  const isbn = url.match(/isbn[:=]?(\d{10,13})/i) || (item.video_title || '').match(/(\d{10,13})/)
  if (isbn) return 'book_' + isbn[1]
  // generic host+slug
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').replace(/\./g, '_')
    const slug = (u.pathname.replace(/\/$/, '').split('/').pop() || 'x').replace(/[^a-z0-9]+/gi, '_').slice(0, 40)
    const type = (item.content_type || 'art').slice(0, 4)
    return `${type}_${host}_${slug}`.toLowerCase()
  } catch {
    const slug = (item.video_title || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)
    return 'key_' + slug
  }
}

export const isValidUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length > 0 && u.length < 2048 &&
  /^https?:\/\/[^\s<>"']+$/i.test(u)

export const isNonEmptyStr = (v: unknown, max = 5000): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max

export const isValidLength = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function redactSensitiveText(value: unknown, maxLength = 500): string {
  let text = value instanceof Error ? value.message : String(value)
  const sensitiveName = String.raw`(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook[_-]?secret|token|secret|password|authorization|api[_-]?key|private[_-]?key|cookie|session|signature)`
  const jsonCredential = new RegExp(`(["']?${sensitiveName}["']?\\s*:\\s*)(["'])(.*?)\\2`, 'gi')
  const assignedCredential = new RegExp(`(${sensitiveName}\\s*[:=]\\s*)[^\\s,;]+`, 'gi')
  const queryCredential = new RegExp(`([?&](?:${sensitiveName}|key)=)[^&\\s]+`, 'gi')
  text = text
    .replace(/(https:\/\/api\.telegram\.org\/bot)[^/\s]+/gi, '$1[redacted]')
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b(?:Basic\s+)[A-Za-z0-9+/]+=*/gi, 'Basic [redacted]')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(jsonCredential, '$1$2[redacted]$2')
    .replace(assignedCredential, '$1[redacted]')
    .replace(queryCredential, '$1[redacted]')
  return text.slice(0, maxLength)
}

export const safeErrorMessage = (error: unknown): string => redactSensitiveText(error)

export const safeError = (fallback: string) => (err: unknown) => {
  console.error('[err]', safeErrorMessage(err))
  return { error: fallback }
}

export function normalizeYouTubeUrl(url: string): string {
  const match = url.match(/(?:youtu\.be\/|(?:v|embed|shorts)\/|watch\?v=)([\w-]{11})/)
  if (match) return `https://www.youtube.com/watch?v=${match[1]}`
  return url
}

export function normalizeUrlForDedup(url: string): string {
  let u = url.trim().replace(/\/$/, '')
  u = u.replace(/[?&](utm_[^=]+=[^&]*|fbclid=[^&]*|ref=[^&]*|feature=[^&]*|si=[^&]*|t=[^&]*)(&|$)/g, '$2')
  u = u.replace(/[?&]$/, '')
  try {
    const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'youtu.be') u = normalizeYouTubeUrl(u)
  } catch { /* URL validation happens at the route boundary. */ }
  return u
}
