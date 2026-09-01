export type DeliveryEffort = 'light' | 'moderate' | 'deep'
export type DeliveryLanguage = 'any' | 'en' | 'ar'
export type DeliveryMode = 'read' | 'watch' | 'listen' | 'practice'
export type DepthTier = 'adaptive' | 'introductory' | 'intermediate' | 'advanced'

export type DeliveryContext = {
  effort: DeliveryEffort
  language: DeliveryLanguage
  delivery_modes: DeliveryMode[]
  depth_tier: DepthTier
}

export type AdaptiveDepthReceipt = {
  recommended_tier: Exclude<DepthTier, 'adaptive'>
  direct_lessons_completed: number
  too_shallow_feedback: number
  too_deep_feedback: number
  advisory_only: true
  progression_effect: 'none'
}

export type ResolvedDeliveryContext = {
  context: DeliveryContext
  source: 'request' | 'saved' | 'default'
  effective_depth_tier: Exclude<DepthTier, 'adaptive'>
  adaptive_depth: AdaptiveDepthReceipt
}

export const defaultDeliveryContext: DeliveryContext = {
  effort: 'moderate',
  language: 'any',
  delivery_modes: [],
  depth_tier: 'adaptive',
}

const oneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback

export function normalizeDeliveryContext(value: unknown): DeliveryContext {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const modes = Array.isArray(input.delivery_modes)
    ? [
        ...new Set(
          input.delivery_modes.filter((mode): mode is DeliveryMode =>
            ['read', 'watch', 'listen', 'practice'].includes(String(mode)),
          ),
        ),
      ]
    : []
  return {
    effort: oneOf(input.effort, ['light', 'moderate', 'deep'] as const, defaultDeliveryContext.effort),
    language: oneOf(input.language, ['any', 'en', 'ar'] as const, defaultDeliveryContext.language),
    delivery_modes: modes,
    depth_tier: oneOf(
      input.depth_tier,
      ['adaptive', 'introductory', 'intermediate', 'advanced'] as const,
      defaultDeliveryContext.depth_tier,
    ),
  }
}

export function requestDeliveryContext(value: unknown): DeliveryContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (!['effort', 'language', 'delivery_modes', 'depth_tier'].some((key) => input[key] != null)) return null
  return normalizeDeliveryContext(input)
}

export function deliveryContextFromQuery(query: (key: string) => string | undefined): DeliveryContext | null {
  const modes = query('delivery_modes')
  return requestDeliveryContext({
    effort: query('effort'),
    language: query('language'),
    delivery_modes:
      modes == null
        ? undefined
        : modes
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    depth_tier: query('depth_tier'),
  })
}

async function adaptiveDepthReceipt(DB: D1Database): Promise<AdaptiveDepthReceipt> {
  const [lessons, feedback] = await Promise.all([
    DB.prepare(`SELECT COUNT(*) count FROM thread_lessons WHERE status='completed'`)
      .first<{ count: number }>()
      .catch(() => null),
    DB.prepare(
      `SELECT
      SUM(CASE WHEN reason_tags_json LIKE '%"too_shallow"%' THEN 1 ELSE 0 END) too_shallow,
      SUM(CASE WHEN reason_tags_json LIKE '%"too_deep"%' THEN 1 ELSE 0 END) too_deep
      FROM compass_feedback`,
    )
      .first<{ too_shallow: number; too_deep: number }>()
      .catch(() => null),
  ])
  const completed = Number(lessons?.count || 0)
  const tooShallow = Number(feedback?.too_shallow || 0)
  const tooDeep = Number(feedback?.too_deep || 0)
  const base = completed >= 15 ? 2 : completed >= 5 ? 1 : 0
  const adjusted = Math.max(0, Math.min(2, base + Math.sign(tooShallow - tooDeep)))
  return {
    recommended_tier: (['introductory', 'intermediate', 'advanced'] as const)[adjusted],
    direct_lessons_completed: completed,
    too_shallow_feedback: tooShallow,
    too_deep_feedback: tooDeep,
    advisory_only: true,
    progression_effect: 'none',
  }
}

export async function resolveDeliveryContext(DB: D1Database, requested?: unknown): Promise<ResolvedDeliveryContext> {
  const explicitRequest = requestDeliveryContext(requested)
  const savedRow = await DB.prepare(`SELECT value_json FROM user_settings WHERE setting_key='delivery_context'`)
    .first<{ value_json: string }>()
    .catch(() => null)
  let saved: DeliveryContext | null = null
  if (savedRow?.value_json) {
    try {
      saved = normalizeDeliveryContext(JSON.parse(savedRow.value_json))
    } catch {}
  }
  const context = explicitRequest || saved || defaultDeliveryContext
  const adaptiveDepth = await adaptiveDepthReceipt(DB)
  return {
    context,
    source: explicitRequest ? 'request' : saved ? 'saved' : 'default',
    effective_depth_tier: context.depth_tier === 'adaptive' ? adaptiveDepth.recommended_tier : context.depth_tier,
    adaptive_depth: adaptiveDepth,
  }
}

const candidateModes = (candidate: any): string[] =>
  Array.isArray(candidate?.delivery_modes) ? candidate.delivery_modes.map(String) : []

export function deliveryMatch(candidate: any, resolved: ResolvedDeliveryContext) {
  const checks: Array<boolean | null> = [
    candidate?.effort ? String(candidate.effort) === resolved.context.effort : null,
    candidate?.language && resolved.context.language !== 'any'
      ? String(candidate.language) === resolved.context.language
      : null,
    candidateModes(candidate).length && resolved.context.delivery_modes.length
      ? candidateModes(candidate).some((mode) => resolved.context.delivery_modes.includes(mode as DeliveryMode))
      : null,
    candidate?.depth_tier ? String(candidate.depth_tier) === resolved.effective_depth_tier : null,
  ]
  const known = checks.filter((value): value is boolean => value !== null)
  return {
    matches: known.length === 0 || known.every(Boolean),
    score: known.length ? known.filter(Boolean).length / known.length : 0.5,
    compared_fields: known.length,
    advisory_only: true,
  }
}
