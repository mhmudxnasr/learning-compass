import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayRound, explicitRound, progressionRound, roundEvidenceFromBalance } from '../../src/services/branch-rounds.ts'

test('progressionRound starts at R1 for untouched branches', () => {
  assert.equal(progressionRound({ consumed: 0, notes: 0, cards: 0, due: 0, recallStrength: null }), 'R1')
  assert.equal(progressionRound({ consumed: 0, notes: 1, cards: 0, due: 0, recallStrength: null }), 'R1')
  assert.equal(progressionRound({ consumed: 0, notes: 0, cards: 2, due: 0, recallStrength: null }), 'R1')
})

test('progressionRound advances to R2 with first consumed source or consolidation', () => {
  assert.equal(progressionRound({ consumed: 1, notes: 0, cards: 0, due: 0, recallStrength: null }), 'R2')
  assert.equal(progressionRound({ consumed: 0, notes: 2, cards: 0, due: 0, recallStrength: null }), 'R2')
  assert.equal(progressionRound({ consumed: 0, notes: 0, cards: 3, due: 0, recallStrength: null }), 'R2')
  assert.equal(progressionRound({ consumed: 2, notes: 1, cards: 2, due: 1, recallStrength: 0.5 }), 'R2')
})

test('progressionRound advances to R3 with integrated evidence', () => {
  assert.equal(progressionRound({ consumed: 3, notes: 1, cards: 3, due: 0, recallStrength: 0.65 }), 'R3')
  assert.equal(progressionRound({ consumed: 5, notes: 1, cards: 2, due: 0, recallStrength: 0.6 }), 'R3')
  assert.equal(progressionRound({ consumed: 4, notes: 0, cards: 4, due: 2, recallStrength: 0.7 }), 'R2')
})

test('explicitRound normalizes R1..R5 labels and rejects garbage', () => {
  assert.equal(explicitRound('r2'), 'R2')
  assert.equal(explicitRound(' R3 '), 'R3')
  assert.equal(explicitRound('Branch'), null)
  assert.equal(explicitRound(null), null)
})

test('displayRound prefers explicit label, then id prefix, then progression', () => {
  assert.equal(displayRound({ round_label: 'R2', id: 'r1-test' }, { consumed: 0, notes: 0, cards: 0, due: 0, recallStrength: null }), 'R2')
  assert.equal(displayRound({ round_label: null, id: 'r2-whatever' }, { consumed: 0, notes: 0, cards: 0, due: 0, recallStrength: null }), 'R2')
  assert.equal(displayRound({ round_label: null, id: 'r3-deep' }, { consumed: 0, notes: 0, cards: 0, due: 0, recallStrength: null }), 'R3')
  assert.equal(displayRound({ round_label: null, id: 'systems-dynamics' }, { consumed: 0, notes: 0, cards: 0, due: 0, recallStrength: null }), 'R1')
  assert.equal(displayRound({ round_label: null, id: 'systems-dynamics' }, { consumed: 3, notes: 1, cards: 3, due: 0, recallStrength: 0.66 }), 'R3')
})

test('roundEvidenceFromBalance maps balance node fields', () => {
  assert.deepEqual(roundEvidenceFromBalance(null), { consumed: 0, notes: 0, cards: 0, due: 0, recallStrength: null })
  assert.deepEqual(roundEvidenceFromBalance({ consumed_count: 2, notes_count: 3, srs_total: 4, srs_due: 1, recall_strength: 0.7 }), { consumed: 2, notes: 3, cards: 4, due: 1, recallStrength: 0.7 })
})
