export type FeedbackCompletionState = 'completed' | 'in_progress' | 'stopped'
export type FeedbackEffort = 'light' | 'moderate' | 'deep'

export type StructuredFeedback = {
  completion_state: FeedbackCompletionState
  reason_tags: string[]
  expected: string | null
  actual: string | null
  effort: FeedbackEffort | null
  length_minutes: number | null
}

const cleanText = (value: unknown, max = 2000) => {
  const result = String(value || '').trim().slice(0, max)
  return result || null
}

export function normalizeStructuredFeedback(body: any, fallback: FeedbackCompletionState = 'in_progress'): StructuredFeedback {
  const completionState = ['completed', 'in_progress', 'stopped'].includes(String(body?.completion_state || ''))
    ? body.completion_state as FeedbackCompletionState
    : body?.complete === true ? 'completed' : fallback
  const reasonTags: string[] = Array.isArray(body?.reason_tags)
    ? [...new Set<string>(body.reason_tags
      .map((tag: unknown) => String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_'))
      .filter((tag: string) => /^[a-z0-9][a-z0-9_]{0,39}$/.test(tag)))].slice(0, 8)
    : []
  const effort = ['light', 'moderate', 'deep'].includes(String(body?.effort || ''))
    ? body.effort as FeedbackEffort
    : null
  const rawLength = Number(body?.length_minutes)
  return {
    completion_state: completionState,
    reason_tags: reasonTags,
    expected: cleanText(body?.expected),
    actual: cleanText(body?.actual),
    effort,
    length_minutes: Number.isFinite(rawLength) && rawLength >= 0 && rawLength <= 100000 ? Math.round(rawLength) : null,
  }
}

export function feedbackLifecycle(completionState: FeedbackCompletionState) {
  if (completionState === 'completed') return {
    complete: true,
    stopped: false,
    sessionStatus: 'completed' as const,
    learningState: 'completed' as const,
    progressPercent: 100,
    recommendationStatus: 'consumed' as const,
  }
  if (completionState === 'stopped') return {
    complete: false,
    stopped: true,
    sessionStatus: 'returned' as const,
    learningState: 'excluded' as const,
    progressPercent: 0,
    recommendationStatus: 'rejected' as const,
  }
  return {
    complete: false,
    stopped: false,
    sessionStatus: 'returned' as const,
    learningState: 'in_progress' as const,
    progressPercent: 50,
    recommendationStatus: null,
  }
}

export function feedbackMetadata(
  feedback: StructuredFeedback,
  score: number | null,
  context: Record<string, unknown> = {},
): { learning_feedback: StructuredFeedback & { score: number | null; recorded_at: string } & Record<string, unknown> } {
  return { learning_feedback: { ...feedback, score, ...context, recorded_at: new Date().toISOString() } }
}
