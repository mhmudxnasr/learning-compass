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

export type ReviewState = { difficulty: number; stability: number; repetitions: number }

export function scheduleReview(state: ReviewState, grade: number, now = new Date(), targetRetention = 90) {
  const success = grade >= 3
  const difficulty = Number(Math.max(1.3, Math.min(10, state.difficulty + (success ? (3 - grade) * 0.1 : (3 - grade) * 0.2))).toFixed(2))
  const repetitions = success ? state.repetitions + 1 : 0
  const stability = Number((success
    ? state.repetitions === 0 ? Math.max(1, grade - 1) : state.stability * (1 + grade * 0.45)
    : Math.max(1, state.stability * 0.5)).toFixed(2))
  const retentionFactor = Math.max(.7, Math.min(1.3, 1 - (targetRetention - 90) * .04))
  const intervalDays = Math.max(1, Math.min(1825, Math.round(stability * retentionFactor)))
  const due = new Date(now)
  due.setUTCDate(due.getUTCDate() + intervalDays)
  return { difficulty, stability, repetitions, intervalDays, dueAt: due.toISOString().slice(0, 10) }
}
