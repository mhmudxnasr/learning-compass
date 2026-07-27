import { Hono } from 'hono'

export type Bindings = { DB: D1Database; API_TOKEN?: string }

export type Recommendation = {
  id: string
  video_title: string
  creator: string | null
  content_type: string | null
  video_url: string
  why_this: string | null
  verified: string | null
  status: 'active' | 'consumed' | 'rejected'
  user_rating: string | null
  user_review: string | null
  dedup_key: string
  synergy_bundle_id: string | null
  consumed_date: string | null
  created_at: string
}

export const VALID_STATUS = new Set(['active', 'consumed', 'rejected'])
export const VALID_RATINGS = new Set(['unset', 'love', 'like', 'meh', 'dislike'])
export const VALID_LOG_KINDS = new Set(['feedback', 'tree_change', 'pattern', 'note', 'system'])

export const isValidUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length > 0 && u.length < 2048 &&
  /^https?:\/\/[^\s<>"']+$/i.test(u)

export const isNonEmptyStr = (v: unknown, max = 5000): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max

export const isValidLength = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const safeError = (fallback: string) => (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[err]', msg)
  return { error: fallback }
}
