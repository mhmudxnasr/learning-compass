export type MutationReservationDisposition = 'store_success' | 'release' | 'hold_unknown'

// Unknown outcomes are safety tombstones, not short leases. A finite expiry can
// eventually turn an unresolved, possibly committed write into a blind replay.
// SQLite/D1 accepts this timestamp and it remains sortable by the existing
// expires_at index while making the quarantine durable.
export const DURABLE_UNKNOWN_MUTATION_EXPIRES_AT = '9999-12-31 23:59:59'

/**
 * A server error after a mutation handler ran cannot prove that no write
 * committed. Keep the reservation durably; a canonical reread may resolve the
 * caller's outcome, but it must not silently make the original key replayable.
 * Only deterministic client errors release it for a safe retry.
 */
export function mutationReservationDisposition(status: number): MutationReservationDisposition {
  if (status >= 200 && status < 300) return 'store_success'
  if ((status >= 300 && status < 400) || status >= 500) return 'hold_unknown'
  return 'release'
}
