export const RECALL_REPAIR_LAPSE_THRESHOLD = 3

export type RecallRepairStatus = 'active' | 'paused' | 'retired'

export type RecallMutationState = {
  content_revision: number
  scheduler_revision: number
  status_revision: number
  repair_status: RecallRepairStatus
}

export type RecallRepairReason = {
  code: 'repeated_lapses' | 'paused_by_learner' | 'retired_by_learner'
  lapse_count: number
  threshold: number
  message: string
}

export function normalizeRecallRepairStatus(value: unknown): RecallRepairStatus | null {
  return value === 'active' || value === 'paused' || value === 'retired' ? value : null
}

const positiveRevision = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : null
const strictPositiveRevision = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null

export function recallMutationState(card: Record<string, unknown>): RecallMutationState {
  return {
    content_revision: positiveRevision(card.content_revision) || 1,
    scheduler_revision: positiveRevision(card.scheduler_revision) || 1,
    status_revision: positiveRevision(card.status_revision) || 1,
    repair_status: normalizeRecallRepairStatus(card.repair_status) || 'active',
  }
}

export function parseRecallMutationPrecondition(input: Record<string, unknown>): RecallMutationState | null {
  const contentRevision = strictPositiveRevision(input.expected_content_revision)
  const schedulerRevision = strictPositiveRevision(input.expected_scheduler_revision)
  const statusRevision = strictPositiveRevision(input.expected_status_revision)
  const repairStatus = normalizeRecallRepairStatus(input.expected_repair_status)
  return contentRevision && schedulerRevision && statusRevision && repairStatus ? {
    content_revision: contentRevision,
    scheduler_revision: schedulerRevision,
    status_revision: statusRevision,
    repair_status: repairStatus,
  } : null
}

export function recallMutationStateMatches(card: Record<string, unknown>, expected: RecallMutationState) {
  const current = recallMutationState(card)
  return current.content_revision === expected.content_revision
    && current.scheduler_revision === expected.scheduler_revision
    && current.status_revision === expected.status_revision
    && current.repair_status === expected.repair_status
}

export function unacknowledgedRecallLapses(card: { lapses?: unknown; repair_lapses_acknowledged?: unknown }) {
  const lapses = Math.max(0, Number(card.lapses || 0))
  const acknowledged = Math.max(0, Number(card.repair_lapses_acknowledged || 0))
  return Math.max(0, lapses - acknowledged)
}

export function recallRepairReason(
  card: { lapses?: unknown; repair_lapses_acknowledged?: unknown; repair_status?: unknown },
  threshold = RECALL_REPAIR_LAPSE_THRESHOLD,
): RecallRepairReason | null {
  const status = normalizeRecallRepairStatus(card.repair_status) || 'active'
  const lapseCount = unacknowledgedRecallLapses(card)
  if (status === 'paused') {
    return { code: 'paused_by_learner', lapse_count: lapseCount, threshold, message: 'Paused by you. Its FSRS state and review history are unchanged.' }
  }
  if (status === 'retired') {
    return { code: 'retired_by_learner', lapse_count: lapseCount, threshold, message: 'Retired by you. It no longer appears in due review.' }
  }
  if (lapseCount < threshold) return null
  return {
    code: 'repeated_lapses',
    lapse_count: lapseCount,
    threshold,
    message: `${lapseCount} unacknowledged lapses meet the repair threshold of ${threshold}.`,
  }
}

export function freshRecallSchedule(schedulerVersion: string, dueAt = new Date().toISOString().slice(0, 10)) {
  return {
    ease_factor: 5,
    difficulty: 5,
    stability: 1,
    interval_days: 1,
    repetitions: 0,
    lapses: 0,
    learning_steps: 0,
    scheduled_days: 0,
    fsrs_state: 0,
    scheduler_version: schedulerVersion,
    due_at: dueAt,
    last_reviewed_at: null,
  }
}
