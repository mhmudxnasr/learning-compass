import { defaultDeliveryContext, normalizeDeliveryContext, type DeliveryContext } from './delivery-context.ts'

export type TasteMapSettings = {
  appearance: { theme: string; density: 'comfortable' | 'balanced' | 'compact'; radius?: 'sharp' | 'soft' | 'round'; font_size?: 'small' | 'medium' | 'large'; reduced_motion?: boolean; custom_palette?: Record<string, string>; font?: string; custom_font?: Record<string, string>; typography?: Record<string, number> }
  learning: { retention: 85 | 90 | 95; queue_cap: 5 }
  srs_drafts: { enabled: boolean; minimum_rating: number; auto_extract: boolean }
  ai_curation: { enrich_capture: boolean }
  profile_proposals: { review_required: boolean }
  profile_automation: { mode: 'automatic' | 'manual'; policy_version: 'profile_v2' }
  recommendation_engine: { mode: 'shadow' | 'v2'; engine_version: 'v2'; objective_version: 'learning_value_v2' }
  delivery_context: DeliveryContext
  atlas: {
    arrows: boolean
    text_fade_threshold: number
    node_size: number
    link_thickness: number
    branch_link_thickness: number
    animate: boolean
    center_force: number
    repel_force: number
    link_force: number
    focus_dimming: boolean
  }
}

export const defaultSettings: TasteMapSettings = {
  appearance: { theme: 'botanical', density: 'balanced' },
  learning: { retention: 90, queue_cap: 5 },
  srs_drafts: { enabled: true, minimum_rating: 7, auto_extract: false },
  ai_curation: { enrich_capture: false },
  profile_proposals: { review_required: true },
  profile_automation: { mode: 'manual', policy_version: 'profile_v2' },
  recommendation_engine: { mode: 'shadow', engine_version: 'v2', objective_version: 'learning_value_v2' },
  delivery_context: defaultDeliveryContext,
  atlas: {
    arrows: false,
    text_fade_threshold: 0.15,
    node_size: 0.85,
    link_thickness: 1.4,
    branch_link_thickness: 1.5,
    animate: true,
    center_force: 0.65,
    repel_force: 14,
    link_force: 1.25,
      focus_dimming: true,
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const oneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback
const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
const color = (value: unknown, fallback?: string) => typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\\([^)]{3,32}\\))$/i.test(value.trim()) ? value.trim() : fallback
const fontStack = (value: unknown, fallback?: string) => typeof value === 'string' && value.length <= 240 && /^[a-zA-Z0-9 ,.'\"()_-]+$/.test(value) ? value.trim() : fallback
const clamp = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export function normalizeSettings(input: unknown): TasteMapSettings {
  const source = isRecord(input) ? input : {}
  const appearance = isRecord(source.appearance) ? source.appearance : {}
  const paletteSource = isRecord(appearance.custom_palette) ? appearance.custom_palette : {}
  const custom_palette = Object.fromEntries((['brand', 'shell', 'highlight', 'accent', 'ink', 'surface', 'rail', 'seam', 'due', 'danger', 'map'] as const).flatMap((key) => {
    const value = color(paletteSource[key])
    return value ? [[key, value]] : []
  }))
  const customFontSource = isRecord(appearance.custom_font) ? appearance.custom_font : {}
  const custom_font = Object.fromEntries((['ui', 'display', 'reading', 'mono'] as const).flatMap((key) => {
    const value = fontStack(customFontSource[key])
    return value ? [[key, value]] : []
  }))
  const typographySource = isRecord(appearance.typography) ? appearance.typography : {}
  const typography = Object.fromEntries(([
    ['baseSize', 12, 24], ['bodyWeight', 300, 800], ['headingWeight', 400, 900],
    ['lineHeight', 1.15, 2.3], ['letterSpacing', -0.04, 0.1], ['displayScale', 0.8, 1.5], ['readingMeasure', 45, 90]
  ] as const).flatMap(([key, min, max]) => {
    const value = typographySource[key]
    return typeof value === 'number' && Number.isFinite(value)
      ? [[key, Math.min(max, Math.max(min, value))]]
      : []
  }))
  return {
    appearance: {
      theme: typeof appearance.theme === 'string' && /^[a-z0-9_-]{1,40}$/.test(appearance.theme) ? appearance.theme : defaultSettings.appearance.theme,
      density: oneOf(appearance.density, ['comfortable', 'balanced', 'compact'] as const, defaultSettings.appearance.density),
      radius: oneOf(appearance.radius, ['sharp', 'soft', 'round'] as const, 'soft'),
      font_size: oneOf(appearance.font_size, ['small', 'medium', 'large'] as const, 'medium'),
      reduced_motion: bool(appearance.reduced_motion, false),
      ...(Object.keys(custom_palette).length ? { custom_palette } : {}),
      ...(typeof appearance.font === 'string' && /^[a-z0-9_-]{1,40}$/.test(appearance.font) ? { font: appearance.font } : {}),
      ...(Object.keys(custom_font).length ? { custom_font } : {}),
      ...(Object.keys(typography).length ? { typography } : {}),
    },
    learning: { retention: appearance && [85, 90, 95].includes(Number((source.learning as any)?.retention)) ? Number((source.learning as any).retention) as 85 | 90 | 95 : defaultSettings.learning.retention, queue_cap: 5 },
    srs_drafts: { enabled: bool((source.srs_drafts as any)?.enabled, defaultSettings.srs_drafts.enabled), minimum_rating: 7, auto_extract: bool((source.srs_drafts as any)?.auto_extract, defaultSettings.srs_drafts.auto_extract) },
    ai_curation: { enrich_capture: bool((source.ai_curation as any)?.enrich_capture, defaultSettings.ai_curation.enrich_capture) },
    profile_proposals: { review_required: bool((source.profile_proposals as any)?.review_required, defaultSettings.profile_proposals.review_required) },
    profile_automation: { mode: oneOf((source.profile_automation as any)?.mode, ['automatic', 'manual'] as const, defaultSettings.profile_automation.mode), policy_version: 'profile_v2' },
    recommendation_engine: { mode: oneOf((source.recommendation_engine as any)?.mode, ['shadow', 'v2'] as const, defaultSettings.recommendation_engine.mode), engine_version: 'v2', objective_version: 'learning_value_v2' },
    delivery_context: normalizeDeliveryContext(source.delivery_context),
    atlas: {
      arrows: bool((source.atlas as any)?.arrows, defaultSettings.atlas.arrows),
      text_fade_threshold: clamp((source.atlas as any)?.text_fade_threshold, -1, 1, defaultSettings.atlas.text_fade_threshold),
      node_size: clamp((source.atlas as any)?.node_size, 0.1, 3, defaultSettings.atlas.node_size),
      link_thickness: clamp((source.atlas as any)?.link_thickness, 0.1, 6, defaultSettings.atlas.link_thickness),
      branch_link_thickness: clamp((source.atlas as any)?.branch_link_thickness, 0.1, 6, defaultSettings.atlas.branch_link_thickness),
      animate: bool((source.atlas as any)?.animate, defaultSettings.atlas.animate),
      center_force: clamp((source.atlas as any)?.center_force, 0, 2, defaultSettings.atlas.center_force),
      repel_force: clamp((source.atlas as any)?.repel_force, 0, 50, defaultSettings.atlas.repel_force),
      link_force: clamp((source.atlas as any)?.link_force, 0, 3, defaultSettings.atlas.link_force),
      focus_dimming: bool((source.atlas as any)?.focus_dimming, defaultSettings.atlas.focus_dimming),
    },
  }
}

export async function loadSettings(DB: D1Database): Promise<TasteMapSettings> {
  const rows = await DB.prepare('SELECT setting_key,value_json FROM user_settings').all<{ setting_key: keyof TasteMapSettings; value_json: string }>()
  const input: Record<string, unknown> = {}
  for (const row of rows.results || []) {
    try { input[row.setting_key] = JSON.parse(row.value_json) } catch {}
  }
  return normalizeSettings(input)
}
