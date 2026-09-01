const supportedProposalTypes = new Set([
  'profile_signal',
  'profile_update',
  'quality_rule',
  'operational_style',
  'core_filter',
  'pattern_hypothesis',
  'pattern',
  'blacklist',
  'priority',
])

const legacyProposalTypes: Record<string, string> = {
  recent_signal: 'profile_signal',
  quality_rules_json: 'quality_rule',
}

export const normalizeProposalType = (value: unknown): string => legacyProposalTypes[String(value)] || String(value)

export const isSupportedProposalType = (value: unknown): boolean =>
  supportedProposalTypes.has(normalizeProposalType(value))

export const serializeProfileValue = (value: any): string => {
  if (typeof value === 'string') return value
  const serialized = JSON.stringify(value)
  return serialized === undefined ? '' : serialized
}

const parseStoredProfileValue = (value: unknown): any => {
  if (value === null || value === undefined || value === '') return null
  try {
    return JSON.parse(String(value))
  } catch {
    return value
  }
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sameSerializedValue = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right)

export function mergeQualityRules(existingRaw: unknown, proposed: any): string {
  const existing = parseStoredProfileValue(existingRaw)
  if (existing === null) return serializeProfileValue(proposed)
  if (Array.isArray(existing)) {
    const additions = Array.isArray(proposed) ? proposed : [proposed]
    return JSON.stringify([
      ...existing,
      ...additions.filter((item) => !existing.some((current) => sameSerializedValue(current, item))),
    ])
  }
  if (isPlainObject(existing) && isPlainObject(proposed)) return JSON.stringify({ ...existing, ...proposed })
  if (typeof existing === 'string' && typeof proposed === 'string')
    return existing === proposed ? existing : `${existing}\n${proposed}`
  return JSON.stringify([existing, ...(Array.isArray(proposed) ? proposed : [proposed])])
}
