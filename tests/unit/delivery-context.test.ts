import assert from 'node:assert/strict'
import test from 'node:test'

import { candidateSetDiversity, deriveCandidateFeatures } from '../../src/compass-scoring.ts'
import { defaultDeliveryContext, deliveryMatch, normalizeDeliveryContext, resolveDeliveryContext } from '../../src/services/delivery-context.ts'
import { loadCaptureQueue } from '../../src/services/capture-queue.ts'

function contextDb(saved: unknown = null) {
  return {
    prepare(sql: string) {
      return {
        first: async () => {
          if (sql.includes("setting_key='delivery_context'")) return saved == null ? null : { value_json: JSON.stringify(saved) }
          if (sql.includes('thread_lessons')) return { count: 7 }
          if (sql.includes('compass_feedback')) return { too_shallow: 2, too_deep: 0 }
          return null
        },
      }
    },
  } as unknown as D1Database
}

test('delivery context uses only explicit request, saved, or default sources', async () => {
  const fallback = await resolveDeliveryContext(contextDb())
  assert.equal(fallback.source, 'default')
  assert.deepEqual(fallback.context, defaultDeliveryContext)

  const saved = await resolveDeliveryContext(contextDb({ effort: 'light', language: 'ar', delivery_modes: ['listen'], depth_tier: 'adaptive' }))
  assert.equal(saved.source, 'saved')
  assert.equal(saved.context.language, 'ar')

  const requested = await resolveDeliveryContext(contextDb({ effort: 'light' }), { effort: 'deep', depth_tier: 'advanced' })
  assert.equal(requested.source, 'request')
  assert.equal(requested.context.effort, 'deep')
  assert.equal(requested.effective_depth_tier, 'advanced')
})

test('adaptive depth is advisory and derives from direct completion plus depth feedback', async () => {
  const resolved = await resolveDeliveryContext(contextDb())
  assert.deepEqual(resolved.adaptive_depth, {
    recommended_tier: 'advanced',
    direct_lessons_completed: 7,
    too_shallow_feedback: 2,
    too_deep_feedback: 0,
    advisory_only: true,
    progression_effect: 'none',
  })
  assert.equal(resolved.effective_depth_tier, 'advanced')
})

test('delivery matching is neutral when candidate metadata is absent and never gates', () => {
  const resolved = {
    context: normalizeDeliveryContext({ effort: 'deep', language: 'en', delivery_modes: ['read'], depth_tier: 'advanced' }),
    source: 'request' as const,
    effective_depth_tier: 'advanced' as const,
    adaptive_depth: { recommended_tier: 'introductory' as const, direct_lessons_completed: 0, too_shallow_feedback: 0, too_deep_feedback: 0, advisory_only: true as const, progression_effect: 'none' as const },
  }
  assert.deepEqual(deliveryMatch({}, resolved), { matches: true, score: .5, compared_fields: 0, advisory_only: true })
  assert.equal(deliveryMatch({ effort: 'light', depth_tier: 'advanced' }, resolved).matches, false)
})

test('Queue preserves source order and filters only when matches-only is explicit', async () => {
  const rows = [
    { id: 'first', source_metadata_json: JSON.stringify({ candidate_metadata: { effort: 'light' } }), branch_label: 'A' },
    { id: 'second', source_metadata_json: JSON.stringify({ candidate_metadata: { effort: 'deep' } }), branch_label: 'B' },
  ]
  const DB = { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) } as unknown as D1Database
  const delivery = await resolveDeliveryContext(contextDb(), { effort: 'deep' })
  assert.deepEqual((await loadCaptureQueue(DB, 50, delivery)).map((item) => item.id), ['first', 'second'])
  assert.deepEqual((await loadCaptureQueue(DB, 50, delivery, true)).map((item) => item.id), ['second'])
})

test('perspective diversity uses only verified evidence-backed labels and unknown stays neutral', () => {
  const verified = deriveCandidateFeatures({ title: 'A', perspective: { status: 'verified', viewpoint: 'Institutional', school: 'Ostrom', evidence_indexes: [0] } })
  const peer = deriveCandidateFeatures({ title: 'B', perspective: { status: 'verified', viewpoint: 'Institutional', school: 'Ostrom', evidence_indexes: [0] } })
  const unknown = deriveCandidateFeatures({ title: 'C', perspective: { viewpoint: 'Claimed', evidence_indexes: [0] } })
  verified._valid_url = peer._valid_url = true
  verified._has_identity = peer._has_identity = true
  verified._hard_excluded = peer._hard_excluded = false
  assert.equal(unknown._perspective.status, 'neutral')
  assert.ok(candidateSetDiversity(verified, [verified, peer]) < 1)
})
