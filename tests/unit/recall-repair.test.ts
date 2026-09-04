import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildCapabilityCatalog } from '../../src/services/agent-capabilities.ts'
import {
  freshRecallSchedule,
  parseRecallMutationPrecondition,
  recallMutationState,
  recallMutationStateMatches,
  recallRepairReason,
  RECALL_REPAIR_LAPSE_THRESHOLD,
  unacknowledgedRecallLapses,
} from '../../src/services/recall-repair.ts'

const mutationState = {
  expected_content_revision: 2,
  expected_scheduler_revision: 4,
  expected_status_revision: 3,
  expected_repair_status: 'paused',
}

test('recall repair uses three new lapses since the learner last repaired wording', () => {
  assert.equal(RECALL_REPAIR_LAPSE_THRESHOLD, 3)
  assert.equal(unacknowledgedRecallLapses({ lapses: 7, repair_lapses_acknowledged: 5 }), 2)
  assert.equal(recallRepairReason({ lapses: 7, repair_lapses_acknowledged: 5, repair_status: 'active' }), null)
  assert.deepEqual(recallRepairReason({ lapses: 8, repair_lapses_acknowledged: 5, repair_status: 'active' }), {
    code: 'repeated_lapses',
    lapse_count: 3,
    threshold: 3,
    message: '3 unacknowledged lapses meet the repair threshold of 3.',
  })
})

test('paused recall remains learner-visible without pretending it failed again', () => {
  assert.deepEqual(recallRepairReason({ lapses: 1, repair_status: 'paused' }), {
    code: 'paused_by_learner',
    lapse_count: 1,
    threshold: 3,
    message: 'Paused by you. Its FSRS state and review history are unchanged.',
  })
})

test('an explicit FSRS reset creates new-card scheduling state without erasing history itself', () => {
  assert.deepEqual(freshRecallSchedule('fsrs-test', '2026-08-31'), {
    ease_factor: 5,
    difficulty: 5,
    stability: 1,
    interval_days: 1,
    repetitions: 0,
    lapses: 0,
    learning_steps: 0,
    scheduled_days: 0,
    fsrs_state: 0,
    scheduler_version: 'fsrs-test',
    due_at: '2026-08-31',
    last_reviewed_at: null,
  })
})

test('recall mutation preconditions require the complete exact numeric state token', () => {
  const expected = parseRecallMutationPrecondition(mutationState)
  assert.deepEqual(expected, {
    content_revision: 2,
    scheduler_revision: 4,
    status_revision: 3,
    repair_status: 'paused',
  })
  assert.equal(parseRecallMutationPrecondition({ ...mutationState, expected_scheduler_revision: undefined }), null)
  assert.equal(parseRecallMutationPrecondition({ ...mutationState, expected_content_revision: '2' }), null)
  assert.equal(parseRecallMutationPrecondition({ ...mutationState, expected_repair_status: 'active-ish' }), null)
  assert.equal(recallMutationStateMatches({ content_revision: 2, scheduler_revision: 4, status_revision: 3, repair_status: 'paused' }, expected!), true)
  assert.equal(recallMutationStateMatches({ content_revision: 2, scheduler_revision: 5, status_revision: 3, repair_status: 'paused' }, expected!), false)
  assert.deepEqual(recallMutationState({ content_revision: 5, scheduler_revision: 6, status_revision: 7, repair_status: 'retired' }), {
    content_revision: 5, scheduler_revision: 6, status_revision: 7, repair_status: 'retired',
  })
})

test('agent recall mutations advertise and require the complete concurrency token', () => {
  const routes = [
    ['POST', '/learning/srs/review', 'review'],
    ['PUT', '/learning/srs/cards/:id', 'edit'],
    ['POST', '/learning/srs/cards/:id/status', 'status'],
    ['POST', '/learning/srs/cards/:id/reset', 'reset'],
  ] as const
  const catalog = buildCapabilityCatalog(routes)
  for (const capability of catalog) {
    const schema = capability.request_body_schema as any
    for (const field of ['expected_content_revision', 'expected_scheduler_revision', 'expected_status_revision', 'expected_repair_status']) {
      assert.ok(schema.required.includes(field), `${capability.path} must require ${field}`)
      assert.ok(schema.properties[field], `${capability.path} must define ${field}`)
    }
  }
})

test('recall repair schema and API preserve provenance and append-only history', () => {
  const migration = readFileSync(new URL('../../migrations/0069_recall_repair.sql', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../../src/api/learning.ts', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../../client/src/workspaces/learn/LearnRecallView.tsx', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../../client/src/workspaces/learn/types.ts', import.meta.url), 'utf8')

  assert.match(migration, /ADD COLUMN annotation_id TEXT REFERENCES source_annotations/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS srs_card_repair_events/)
  assert.match(migration, /previous_scheduler_json/)
  assert.match(migration, /ADD COLUMN scheduler_revision INTEGER NOT NULL DEFAULT 1/)
  assert.match(migration, /ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 1/)
  assert.match(migration, /ADD COLUMN last_recall_mutation_id TEXT/)
  assert.match(api, /app\.get\('\/srs\/repair'/)
  assert.match(api, /app\.put\('\/srs\/cards\/:id'/)
  assert.match(api, /app\.post\('\/srs\/cards\/:id\/status'/)
  assert.match(api, /app\.post\('\/srs\/cards\/:id\/reset'/)
  assert.match(api, /change_kind_required/)
  assert.match(api, /repair_lapses_acknowledged=COALESCE\(lapses,0\)/)
  assert.match(api, /review_history_preserved: true/)
  assert.match(api, /c\.repair_status='active'/)
  assert.doesNotMatch(api, /DELETE FROM srs_review_events[\s\S]*Recall card reset failed/)
  assert.match(api, /loadSourceAnnotationEvidence/)
  assert.match(api, /const sourceAnchor = annotation\?\.locator/)
  assert.match(api, /WHERE id = \? AND content_revision=\? AND scheduler_revision=\? AND status_revision=\? AND repair_status=\?/)
  assert.match(api, /DB\.batch\(\[/)
  assert.match(api, /recall_state_conflict/)
  assert.match(api, /last_recall_mutation_id/)
  assert.match(types, /content_revision: number/)
  assert.match(types, /scheduler_revision: number/)
  assert.match(types, /status_revision: number/)
  assert.equal((ui.match(/\.\.\.recallPrecondition\(/g) || []).length, 5)
  assert.match(ui, /expected_content_revision: card\.content_revision/)
  assert.match(ui, /expected_scheduler_revision: card\.scheduler_revision/)
  assert.match(ui, /expected_status_revision: card\.status_revision/)
  assert.match(ui, /expected_repair_status: card\.repair_status/)
  assert.match(ui, /Needs repair/)
  assert.match(ui, /Wording only[\s\S]*Keeps the current FSRS schedule/)
  assert.match(ui, /Meaning changed[\s\S]*Resets scheduling; preserves review history/)
  assert.match(ui, /This creates one learner-authored card at a time/)
})
