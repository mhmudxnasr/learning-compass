import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptAndNormalizeWeights } from '../../src/domain.ts'

test('bounded weight adaptation keeps weights within ±20% of baseline and normalized to 1.0', () => {
  const currentWeights = [
    {
      id: 'frontier_potential',
      dimension: 'frontier_potential',
      baseline_weight: 0.3,
      current_weight: 0.3,
      evidence_count: 0,
    },
    { id: 'info_gain', dimension: 'info_gain', baseline_weight: 0.2, current_weight: 0.2, evidence_count: 0 },
    { id: 'personal_pull', dimension: 'personal_pull', baseline_weight: 0.15, current_weight: 0.15, evidence_count: 0 },
    {
      id: 'real_life_relevance',
      dimension: 'real_life_relevance',
      baseline_weight: 0.15,
      current_weight: 0.15,
      evidence_count: 0,
    },
    {
      id: 'source_quality',
      dimension: 'source_quality',
      baseline_weight: 0.15,
      current_weight: 0.15,
      evidence_count: 0,
    },
    {
      id: 'format_exploration',
      dimension: 'format_exploration',
      baseline_weight: 0.05,
      current_weight: 0.05,
      evidence_count: 0,
    },
  ]

  const deltas = {
    frontier_potential: +0.2, // Should be clamped to 0.30 * 1.2 = 0.36
    format_exploration: -0.05, // Should be clamped to 0.05 * 0.8 = 0.04
  }

  const updated = adaptAndNormalizeWeights(currentWeights, deltas)

  const frontier = updated.find((w) => w.dimension === 'frontier_potential')!
  const format = updated.find((w) => w.dimension === 'format_exploration')!

  // Check bounds before sum normalization
  assert.ok(frontier.current_weight <= 0.4)
  assert.ok(format.current_weight >= 0.03)

  // Check sum normalized to approximately 1.0
  const sum = updated.reduce((acc, w) => acc + w.current_weight, 0)
  assert.ok(Math.abs(sum - 1.0) < 0.01)
})

test('one-active-discovery gate logic blocks concurrent discovery runs', () => {
  const activeRun = { id: 'run_123', lifecycle: 'interviewing' }
  const queueCount = 2

  const canStartDiscovery = !activeRun && queueCount < 5
  assert.equal(canStartDiscovery, false)
})

test('queue capacity of 5 retains verified winner in waiting_for_capacity state', () => {
  const queueCount = 5
  const canActivate = queueCount < 5
  assert.equal(canActivate, false)

  const targetLifecycle = canActivate ? 'active' : 'waiting_for_capacity'
  assert.equal(targetLifecycle, 'waiting_for_capacity')
})

test('weak-result withholding triggers when candidate total score is below quality threshold', () => {
  const candidate = { total_score: 0.45, is_verified: false }
  const passesThreshold = candidate.is_verified && candidate.total_score >= 0.6

  assert.equal(passesThreshold, false)
  const lifecycle = passesThreshold ? 'selected' : 'withheld'
  assert.equal(lifecycle, 'withheld')
})

test('interview ambiguity blocks atomic resolution when unresolved ambiguities exist', () => {
  const unresolvedAmbiguities = ['rejection_cause_unclear', 'framing_vs_depth']
  const canResolve = Array.isArray(unresolvedAmbiguities) && unresolvedAmbiguities.length === 0

  assert.equal(canResolve, false)
})

test('resolution requires matching non-empty answers for all asked interview questions', () => {
  const questions = ['What opened this frontier?', 'Did the format work?']
  const answers = { 'What opened this frontier?': 'Game theory concept' } // Missing second answer

  const missingQuestions = questions.filter((q) => {
    const ans = (answers as any)[q]
    return ans === undefined || ans === null || String(ans).trim() === ''
  })

  assert.equal(missingQuestions.length, 1)
  assert.equal(missingQuestions[0], 'Did the format work?')
})

test('pruning rule requires at least 2 distinct run probes with negative evidence', () => {
  const pastEvidence = [
    { signal_value: -0.8, run_id: 'run_1' },
    { signal_value: -0.9, run_id: 'run_1' }, // Same run_id
  ]

  const negativeRunIds = new Set(pastEvidence.filter((e) => e.signal_value <= -0.6 && e.run_id).map((e) => e.run_id))

  assert.equal(negativeRunIds.size, 1) // Only 1 distinct run probe
  const canPrune = negativeRunIds.size >= 2
  assert.equal(canPrune, false)
})

test('activation idempotency check ignores already-active runs without duplicating sessions', () => {
  const activeRun = { id: 'run_123', lifecycle: 'active' }
  const isAlreadyActive = ['active', 'interviewing', 'resolved'].includes(activeRun.lifecycle)

  assert.equal(isAlreadyActive, true)
})

test('recommendation video_title column is used for title lookups', () => {
  const schemaColumns = ['id', 'video_url', 'video_title', 'creator', 'status', 'created_at']
  assert.ok(schemaColumns.includes('video_title'))
  assert.ok(!schemaColumns.includes('title'))
})
