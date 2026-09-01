import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeUnitRelation } from '../../src/services/cross-branch-bridges.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('semantic relation migration adds note ownership, explanations, anchors, and review state', () => {
  const migration = read('../../migrations/0058_semantic_relationships.sql')
  for (const field of [
    'note_id',
    'why',
    'source_anchor_id',
    'target_anchor_id',
    'review_state',
    'resolution',
    'reviewed_at',
  ])
    assert.match(migration, new RegExp(field))
})

test('relation writes require grounded endpoint ownership and explanations', () => {
  const core = read('../../src/api/learning-core.ts')
  assert.match(core, /why and source_anchor_id required/)
  assert.match(core, /relation anchors must belong to their endpoints/)
  assert.match(core, /relation endpoints require valid non-pruned branch ownership/)
  assert.match(core, /app\.patch\('\/contradictions\/:id'/)
})

test('notes use owned Units and branch dossiers derive rather than persist bridges', () => {
  const product = read('../../src/api/product.ts')
  const brain = read('../../src/api/brain.ts')
  const bridges = read('../../src/services/cross-branch-bridges.ts')
  assert.match(product, /learning_units WHERE note_id=\?/)
  assert.ok(
    product.indexOf('learning_units WHERE recommendation_id=? AND status') >
      product.indexOf('learning_units WHERE note_id=?'),
    'legacy source fallback must follow the canonical note-owned query',
  )
  assert.match(brain, /loadCrossBranchBridges/)
  assert.match(bridges, /FROM unit_relations r/)
  assert.doesNotMatch(bridges, /INSERT|UPDATE|DELETE/)
})

test('relations normalize the counterpart from either direction with branch and domain', () => {
  const row = {
    id: 'relation-1',
    source_unit_id: 'unit-a',
    target_unit_id: 'unit-b',
    relation_type: 'supports',
    confidence: 0.8,
    why: 'The source mechanism explains the target outcome.',
    status: 'active',
    review_state: 'accepted',
    created_at: '2026-08-23',
    source_statement: 'Mechanism',
    source_unit_type: 'claim',
    source_note_id: 'note-a',
    source_branch_id: 'branch-a',
    source_branch_label: 'Systems',
    source_domain_id: 'domain-a',
    source_domain: 'Thinking',
    source_anchor_locator: 'p. 4',
    target_statement: 'Outcome',
    target_unit_type: 'claim',
    target_note_id: 'note-b',
    target_branch_id: 'branch-b',
    target_branch_label: 'Strategy',
    target_domain_id: 'domain-b',
    target_domain: 'Business',
    target_anchor_locator: 'p. 9',
  }
  const incoming = normalizeUnitRelation(row, 'unit-b')
  assert.equal(incoming.direction, 'incoming')
  assert.equal(incoming.counterpart.unit_id, 'unit-a')
  assert.deepEqual(incoming.counterpart.branch, {
    id: 'branch-a',
    label: 'Systems',
    domain_id: 'domain-a',
    domain: 'Thinking',
  })
  assert.equal(normalizeUnitRelation(row, 'unit-a').direction, 'outgoing')
})

test('published meaningful links require accepted endpoints, accepted review, and live domain joins', () => {
  const bridges = read('../../src/services/cross-branch-bridges.ts')
  assert.match(bridges, /r\.review_state='accepted'/)
  assert.match(bridges, /su\.status='accepted' AND tu\.status='accepted'/)
  assert.match(bridges, /sd\.label source_domain/)
  assert.match(bridges, /sd\.id IS NOT NULL AND td\.id IS NOT NULL/)
})

test('note deletion detaches owned Units before removing the note', () => {
  const product = read('../../src/api/product.ts')
  const deletion = product.slice(
    product.indexOf("app.delete('/notes/:id'"),
    product.indexOf("app.post('/notes/:id/process'"),
  )
  assert.match(deletion, /UPDATE learning_units SET note_id=NULL WHERE note_id=\?/)
})
