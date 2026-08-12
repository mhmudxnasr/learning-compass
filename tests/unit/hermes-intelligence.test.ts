import assert from 'node:assert/strict'
import test from 'node:test'

import { hermesEvaluatorCandidates } from '../../src/services/hermes-intelligence.ts'
import { isSupportedProposalType } from '../../src/services/profile-proposals.ts'
import { isMemoryOwnershipAllowed, isMemoryTaskKind } from '../../src/services/memory-context.ts'

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

test('memory ownership safeguards preserve profile and live learning state as canonical', () => {
  assert.equal(isMemoryOwnershipAllowed('skill_procedure:source-proofing'), true)
  assert.equal(isMemoryOwnershipAllowed('profile.preference'), false)
  assert.equal(isMemoryOwnershipAllowed('queue:current'), false)
  assert.equal(isMemoryTaskKind('feedback'), true)
  assert.equal(isMemoryTaskKind('unbounded_history'), false)
})
