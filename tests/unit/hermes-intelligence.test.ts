import assert from 'node:assert/strict'
import test from 'node:test'

import { hermesEvaluatorCandidates } from '../../src/services/hermes-intelligence.ts'
import { isSupportedProposalType } from '../../src/services/profile-proposals.ts'

test('Hermes evaluator only emits proposal types the approval route can apply', () => {
  const candidates = hermesEvaluatorCandidates({
    period: { since: '2026-08-01', until: '2026-08-08' },
    accuracy: {},
    abandoned_sources: [],
    taste_drift: [],
    best_formats: [{ format: 'video', total: 3, average_score: 5 }],
    best_creators: [{ creator: 'Strong Creator', total: 3, average_score: 9 }],
  } as any)

  assert.deepEqual(candidates.map((item) => item.change_type), ['quality_rule', 'pattern_hypothesis'])
  assert.equal(candidates.every((item) => isSupportedProposalType(item.change_type)), true)
})
