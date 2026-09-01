import { fsrs, generatorParameters, Rating, State, type CardInput } from 'ts-fsrs'

export type QueueDecision = {
  allowed: boolean
  slotsRemaining: number
  requiresOverride: boolean
}

export function queueDecision(activeCount: number, override = false, cap = 5): QueueDecision {
  const slotsRemaining = Math.max(0, cap - Math.max(0, activeCount))
  const blocked = activeCount >= cap && !override
  return { allowed: !blocked, slotsRemaining, requiresOverride: blocked }
}

export function computeDecayedAffinity(
  affinity: number,
  lastConsumed: string | null | undefined,
  now = new Date(),
  halfLifeDays = 90,
) {
  if (!lastConsumed) return { staleDays: null, decayedAffinity: affinity }
  const then = new Date(lastConsumed + (lastConsumed.includes('T') ? '' : 'T00:00:00Z'))
  const staleDays = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000))
  const decayedAffinity = affinity * Math.pow(0.5, staleDays / halfLifeDays)
  return { staleDays, decayedAffinity }
}

export function directionForText(text: string): 'rtl' | 'ltr' | 'auto' {
  const meaningful = text.replace(/[\s\d\p{P}\p{S}]/gu, '')
  if (!meaningful) return 'auto'
  const rtl = (meaningful.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length
  return rtl / meaningful.length >= 0.3 ? 'rtl' : 'ltr'
}

export const FSRS_SCHEDULER_VERSION = 'fsrs-6-ts-fsrs-5.4.1'
export type ReviewState = {
  difficulty: number
  stability: number
  repetitions: number
  lapses?: number
  learningSteps?: number
  scheduledDays?: number
  fsrsState?: number
  dueAt?: string | null
  lastReviewedAt?: string | null
}

export function scheduleReview(state: ReviewState, grade: number, now = new Date(), targetRetention = 90) {
  const rating = grade <= 1 ? Rating.Again : grade === 2 ? Rating.Hard : grade === 5 ? Rating.Easy : Rating.Good
  const card: CardInput = {
    due: state.dueAt || now,
    stability: state.repetitions > 0 ? Math.max(0.01, Number(state.stability || 1)) : 0,
    difficulty: state.repetitions > 0 ? Math.max(1, Math.min(10, Number(state.difficulty || 5))) : 0,
    elapsed_days: 0,
    scheduled_days: Math.max(0, Number(state.scheduledDays ?? 0)),
    learning_steps: Math.max(0, Number(state.learningSteps ?? 0)),
    reps: Math.max(0, Number(state.repetitions || 0)),
    lapses: Math.max(0, Number(state.lapses || 0)),
    state: state.repetitions > 0 ? (state.fsrsState ?? State.Review) : State.New,
    last_review: state.lastReviewedAt || undefined,
  }
  const scheduler = fsrs(
    generatorParameters({
      request_retention: Math.max(0.7, Math.min(0.97, targetRetention / 100)),
      maximum_interval: 1825,
      enable_fuzz: false,
      enable_short_term: false,
    }),
  )
  const next = scheduler.next(card, now, rating).card
  return {
    difficulty: next.difficulty,
    stability: next.stability,
    repetitions: next.reps,
    lapses: next.lapses,
    learningSteps: next.learning_steps,
    scheduledDays: next.scheduled_days,
    fsrsState: next.state,
    intervalDays: Math.max(1, next.scheduled_days),
    dueAt: next.due.toISOString().slice(0, 10),
    schedulerVersion: FSRS_SCHEDULER_VERSION,
  }
}

export const VALID_RECOMMENDATION_MODES = [
  'note_answer',
  'blind_spot_bridge',
  'counter_evidence',
  'academic_paper',
  'auto',
] as const
export type RecommendationMode = (typeof VALID_RECOMMENDATION_MODES)[number]

export const VALID_ENERGY_LEVELS = ['quick_scan', 'medium_focus', 'deep_focus'] as const
export type EnergyLevel = (typeof VALID_ENERGY_LEVELS)[number]

export const VALID_FORMAT_PREFERENCES = ['paper', 'article', 'podcast', 'book', 'video', 'any'] as const
export type FormatPreference = (typeof VALID_FORMAT_PREFERENCES)[number]

export function formatNoteAnchors(reflections: Array<{ reflection?: string }>): string[] {
  return reflections
    .map((r) => (r.reflection || '').trim())
    .filter((text) => text.length > 5)
    .slice(0, 5)
    .map((text) => (text.length > 180 ? text.slice(0, 180) + '...' : text))
}

export function selectCurationMode(
  requestedMode?: string,
  hasNoteAnchors = false,
  seed = Date.now(),
): RecommendationMode {
  if (
    requestedMode &&
    (VALID_RECOMMENDATION_MODES as readonly string[]).includes(requestedMode) &&
    requestedMode !== 'auto'
  ) {
    return requestedMode as RecommendationMode
  }
  const modes: RecommendationMode[] = ['blind_spot_bridge', 'academic_paper', 'counter_evidence']
  if (hasNoteAnchors) modes.unshift('note_answer')
  const index = Math.abs(seed) % modes.length
  return modes[index]
}

export function adaptAndNormalizeWeights(
  currentWeights: Array<{
    id: string
    dimension: string
    baseline_weight: number
    current_weight: number
    evidence_count: number
  }>,
  evidenceDeltas: Record<string, number>,
) {
  const updated = currentWeights.map((item) => {
    const delta = evidenceDeltas[item.dimension] || 0
    let newWeight = item.current_weight + delta
    const minWeight = item.baseline_weight * 0.8
    const maxWeight = item.baseline_weight * 1.2
    newWeight = Math.max(minWeight, Math.min(maxWeight, newWeight))
    return { ...item, current_weight: newWeight, evidence_count: item.evidence_count + (delta !== 0 ? 1 : 0) }
  })

  const sum = updated.reduce((acc, item) => acc + item.current_weight, 0)
  if (sum > 0) {
    for (const item of updated) {
      item.current_weight = Math.round((item.current_weight / sum) * 10000) / 10000
    }
  }
  return updated
}

/**
 * Computes Dialectic Divergence Score S_dialectic(d) for recommendation candidates.
 * Formula: S_dialectic(d) = λ * cosSim - (1 - λ) * |cosSim - θ_target| + μ * II_refutation(d)
 * Enforces orthogonal contrast window (target angle θ_target = 0.25) to avoid near-duplicate confirmation bias and unrelated noise.
 */
export function computeDialecticDivergenceScore(
  cosSim: number,
  isRefutation: boolean,
  lambda = 0.4,
  targetAngle = 0.25,
  refutationWeight = 0.35,
): number {
  const relevanceTerm = lambda * cosSim
  const divergencePenalty = (1 - lambda) * Math.abs(cosSim - targetAngle)
  const refutationBonus = isRefutation ? refutationWeight : 0
  const rawScore = relevanceTerm - divergencePenalty + refutationBonus
  return Math.round(rawScore * 10000) / 10000
}

/**
 * Cleans raw source text (YouTube transcripts, PDF extracts, web articles)
 * for NotebookLM ingestion. Strips navigation, excessive whitespace, and boilerplate.
 */
export function cleanRawSourceText(rawText: string, sourceType: 'youtube' | 'pdf' | 'web' = 'web'): string {
  if (!rawText) return ''
  let cleaned = rawText

  if (sourceType === 'youtube') {
    // Remove standalone timestamp lines like [00:12] or 01:23:45
    cleaned = cleaned.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/gm, '')
  } else if (sourceType === 'pdf') {
    // Strip page number lines and layout breaks
    cleaned = cleaned.replace(/^\s*(?:Page\s+\d+|\d+)\s*$/gm, '')
  } else if (sourceType === 'web') {
    // Remove HTML tags if present and strip boilerplate UI lines
    cleaned = cleaned.replace(/<[^>]+>/g, ' ')
    cleaned = cleaned.replace(
      /^(?:Cookie Policy|Privacy Policy|Terms of Service|Subscribe|Share this article).*$/gm,
      '',
    )
  }

  // Normalize excessive newlines and whitespace
  return cleaned
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
