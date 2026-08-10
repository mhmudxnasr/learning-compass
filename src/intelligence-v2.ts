export const INTELLIGENCE_ENGINE_VERSION = 'v2'
export const LEARNING_OBJECTIVE_VERSION = 'learning_value_v2'
export const PROFILE_POLICY_VERSION = 'profile_v2'

export type CompassLane = 'fit' | 'bridge' | 'challenge'
export type SignalScope = 'none' | 'eligibility' | 'utility' | 'both'
export type LearningDisposition = 'undecided' | 'retain' | 'apply' | 'reference' | 'drop'
export type EvidenceType = 'free_recall' | 'explanation' | 'transfer' | 'application' | 'decision' | 'artifact'

export const CANONICAL_FORMATS = [
  'article', 'essay', 'book', 'video', 'lecture', 'talk', 'interview', 'podcast',
  'paper', 'guide', 'course', 'visual_companion', 'other',
] as const
export type CanonicalFormat = typeof CANONICAL_FORMATS[number]

const clamp = (value: unknown, min = 0, max = 1) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min
}

export function canonicalFormat(value: unknown): CanonicalFormat {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'other'
  if (/lite.?visual|visual companion|reading companion/.test(raw)) return 'visual_companion'
  if (/book|كتاب|audiobook/.test(raw)) return 'book'
  if (/podcast|بودكاست/.test(raw)) return 'podcast'
  if (/interview|مقابلة|حوار/.test(raw)) return 'interview'
  if (/research paper|whitepaper|paper|ورقة|دراسة/.test(raw)) return 'paper'
  if (/lecture|محاضرة|درس|university/.test(raw)) return 'lecture'
  if (/tedx?|talk|khutbah|خطبة/.test(raw)) return 'talk'
  if (/course|class|workshop|دورة/.test(raw)) return 'course'
  if (/guide|tutorial|demonstration|how.?to/.test(raw)) return 'guide'
  if (/essay|مقالة رأي/.test(raw)) return 'essay'
  if (/article|web|مقال/.test(raw)) return 'article'
  if (/video|youtube|فيديو/.test(raw)) return 'video'
  return 'other'
}

export function canonicalCreatorKey(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  const hostless = raw.replace(/^https?:\/\/(?:www\.)?/, '').replace(/^www\./, '').split('/')[0]
  const normalized = hostless
    .replace(/^@+/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.&']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || null
}

export const REASON_CODES = [
  'not_now', 'bad_fit', 'wrong_topic', 'too_familiar', 'too_shallow', 'too_long',
  'poor_source', 'wrong_format', 'already_mastered', 'access_problem', 'other',
] as const
export type ReasonCode = typeof REASON_CODES[number]

const reasonAliases: Record<string, ReasonCode> = {
  later: 'not_now', busy: 'not_now', not_for_me: 'bad_fit', irrelevant: 'wrong_topic',
  redundant: 'too_familiar', familiar: 'too_familiar', shallow: 'too_shallow',
  long: 'too_long', source: 'poor_source', format: 'wrong_format', mastered: 'already_mastered',
}

export function canonicalReasonCode(value: unknown): ReasonCode {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((REASON_CODES as readonly string[]).includes(normalized)) return normalized as ReasonCode
  return reasonAliases[normalized] || 'other'
}

export function classifyRecommendationFeedback(outcome: unknown, reasons: unknown[] = []) {
  const normalizedOutcome = String(outcome || 'declined').trim().toLowerCase()
  const reasonCodes = [...new Set(reasons.map(canonicalReasonCode))]
  const neutral = normalizedOutcome === 'dismissed' || reasonCodes.includes('not_now')
  if (neutral) return { eventType: 'recommendation_dismissed', signalScope: 'none' as SignalScope, reasonCodes, normalizedOutcome: 'dismissed' }
  if (normalizedOutcome === 'started') return { eventType: 'recommendation_started', signalScope: 'none' as SignalScope, reasonCodes, normalizedOutcome: 'started' }
  if (normalizedOutcome === 'completed') return { eventType: 'source_completed', signalScope: 'none' as SignalScope, reasonCodes, normalizedOutcome: 'completed' }
  if (normalizedOutcome === 'abandoned') return { eventType: 'recommendation_abandoned', signalScope: 'eligibility' as SignalScope, reasonCodes, normalizedOutcome: 'abandoned' }
  return { eventType: 'recommendation_declined', signalScope: 'eligibility' as SignalScope, reasonCodes: reasonCodes.length ? reasonCodes : ['bad_fit' as ReasonCode], normalizedOutcome: 'declined' }
}

const dispositionValues: Record<LearningDisposition, number | null> = {
  undecided: null, apply: 1, retain: .8, reference: .5, drop: 0,
}
const evidenceWeights: Record<EvidenceType, number> = {
  free_recall: .5, explanation: .6, transfer: .8, application: 1, decision: 1, artifact: 1,
}
const evidenceResultFactors: Record<string, number> = { pass: 1, recorded: 1, partial: .5, fail: 0 }

export type LearningEvidenceInput = { evidence_type: string; result: string; score?: number | null }

export function computeLearningUtility(input: {
  rating?: number | null
  disposition?: string | null
  evidence?: LearningEvidenceInput[]
}) {
  const rating = input.rating == null || !Number.isFinite(Number(input.rating)) ? null : clamp(Number(input.rating), 0, 10) / 10
  const disposition = (String(input.disposition || 'undecided').toLowerCase() in dispositionValues
    ? String(input.disposition || 'undecided').toLowerCase()
    : 'undecided') as LearningDisposition
  const dispositionValue = dispositionValues[disposition]
  let evidenceValue: number | null = null
  for (const item of input.evidence || []) {
    const type = String(item.evidence_type) as EvidenceType
    if (!(type in evidenceWeights)) continue
    const resultFactor = item.score == null
      ? evidenceResultFactors[String(item.result || '').toLowerCase()] ?? 0
      : clamp(item.score)
    const value = evidenceWeights[type] * resultFactor
    evidenceValue = evidenceValue == null ? value : Math.max(evidenceValue, value)
  }
  const components: Array<[number | null, number]> = [[rating, .25], [dispositionValue, .25], [evidenceValue, .5]]
  const available = components.filter(([value]) => value !== null) as Array<[number, number]>
  const availableWeight = available.reduce((sum, [, weight]) => sum + weight, 0)
  const normalized = availableWeight ? available.reduce((sum, [value, weight]) => sum + value * weight, 0) / availableWeight : null
  return {
    tasteValue: rating,
    dispositionValue,
    evidenceValue,
    learningValue: normalized == null ? null : Math.round(normalized * 1000) / 1000,
    confidence: Math.round(availableWeight * 100) / 100,
    trainingEligible: normalized !== null,
  }
}

export type CandidateEvidence = { kind?: string; claim?: string; source_url?: string; anchor?: string; [key: string]: unknown }

export function structuredEvidenceStatus(value: unknown): 'structured' | 'legacy' | 'missing' | 'invalid' {
  if (typeof value === 'string') return value.trim().length >= 12 ? 'legacy' : 'missing'
  if (value == null) return 'missing'
  const evidence = Array.isArray(value) ? value : [value]
  if (!evidence.length) return 'missing'
  const valid = evidence.every((item) => item && typeof item === 'object' &&
    typeof (item as CandidateEvidence).claim === 'string' && (item as CandidateEvidence).claim!.trim().length >= 12 &&
    (!(item as CandidateEvidence).source_url || /^https?:\/\//i.test(String((item as CandidateEvidence).source_url))))
  return valid ? 'structured' : 'invalid'
}

export function normalizeCompassLane(value: unknown, index = 0): CompassLane {
  const lane = String(value || '').toLowerCase()
  if (lane === 'fit' || lane === 'bridge' || lane === 'challenge') return lane
  return (['fit', 'bridge', 'challenge'] as CompassLane[])[index % 3]
}

export function profileMutationPolicy(input: {
  decisionSource: 'user' | 'hermes_auto'
  confidence: number
  evidenceCount: number
  directUserStatement?: boolean
  replacingExplicit?: boolean
  directContradiction?: boolean
}) {
  if (input.decisionSource === 'user') return { eligible: true, threshold: 0, reason: 'user_authorized' }
  const confidence = clamp(input.confidence)
  if (input.replacingExplicit) {
    const eligible = Boolean(input.directContradiction) || (confidence >= .95 && input.evidenceCount >= 3)
    return { eligible, threshold: .95, reason: eligible ? 'explicit_assertion_superseded' : 'explicit_assertion_requires_stronger_evidence' }
  }
  const eligible = confidence >= .8 && (Boolean(input.directUserStatement) || input.evidenceCount >= 2)
  return { eligible, threshold: .8, reason: eligible ? 'evidence_threshold_met' : 'insufficient_profile_evidence' }
}

export function assertionKey(value: unknown) {
  return String(value || 'profile.signal').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}._:-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'profile.signal'
}
