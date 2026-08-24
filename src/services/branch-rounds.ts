export type RoundEvidence = {
  consumed: number
  notes: number
  cards: number
  due: number
  recallStrength: number | null
}

const ROUND_RE = /^R(\d+)$/

export function explicitRound(roundLabel: string | null | undefined): string | null {
  const match = String(roundLabel || '').trim().toUpperCase().match(ROUND_RE)
  return match ? `R${Number(match[1])}` : null
}

export function progressionRound(evidence: RoundEvidence): 'R1' | 'R2' | 'R3' {
  const { consumed, notes, cards, recallStrength } = evidence
  if (consumed >= 3 && notes >= 1 && (cards >= 3 || (consumed >= 5 && recallStrength != null && recallStrength >= 0.55))) return 'R3'
  if (consumed >= 1 || notes >= 2 || cards >= 3) return 'R2'
  return 'R1'
}

export function displayRound(
  node: { round_label?: string | null; id?: string | null },
  _evidence?: RoundEvidence,
): string | null {
  const explicit = explicitRound(node.round_label)
  if (explicit) return explicit
  return null
}

export function roundEvidenceFromBalance(balanceNode: {
  consumed_count?: number | null
  notes_count?: number | null
  srs_total?: number | null
  srs_due?: number | null
  recall_strength?: number | null
} | null | undefined): RoundEvidence {
  return {
    consumed: Number(balanceNode?.consumed_count ?? 0),
    notes: Number(balanceNode?.notes_count ?? 0),
    cards: Number(balanceNode?.srs_total ?? 0),
    due: Number(balanceNode?.srs_due ?? 0),
    recallStrength: balanceNode?.recall_strength != null ? Number(balanceNode.recall_strength) : null,
  }
}
