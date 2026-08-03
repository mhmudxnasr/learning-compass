import assert from 'node:assert/strict'
import test from 'node:test'

import { isSupportedProposalType, mergeQualityRules, normalizeProposalType, serializeProfileValue } from '../../src/services/profile-proposals.ts'

test('quality rules append and deduplicate serialized proposals', () => {
  const merged = JSON.parse(mergeQualityRules(JSON.stringify(['verify primary sources']), { rule: 'require evidence anchors' }))
  assert.deepEqual(merged, ['verify primary sources', { rule: 'require evidence anchors' }])
  assert.equal(mergeQualityRules(JSON.stringify(merged), { rule: 'require evidence anchors' }), JSON.stringify(merged))
})

test('profile proposal serialization preserves existing conventions', () => {
  assert.equal(serializeProfileValue('be direct'), 'be direct')
  assert.equal(serializeProfileValue({ tone: 'direct' }), '{"tone":"direct"}')
})

test('unsupported proposal types are not in the approval contract', () => {
  assert.equal(isSupportedProposalType('operational_style'), true)
  assert.equal(isSupportedProposalType('future_change'), false)
})

test('legacy profile proposal types normalize to the approval contract', () => {
  assert.equal(normalizeProposalType('recent_signal'), 'profile_signal')
  assert.equal(normalizeProposalType('quality_rules_json'), 'quality_rule')
  assert.equal(isSupportedProposalType('recent_signal'), true)
  assert.equal(isSupportedProposalType('quality_rules_json'), true)
})
