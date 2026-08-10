import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canonicalCreatorKey,
  canonicalFormat,
  classifyRecommendationFeedback,
  computeLearningUtility,
  profileMutationPolicy,
  structuredEvidenceStatus,
} from '../../src/intelligence-v2.ts'
import { deriveCandidateFeatures, expectedLearningValue } from '../../src/compass-scoring.ts'

test('recommendation feedback separates neutral dismissal from explicit bad fit', () => {
  assert.deepEqual(classifyRecommendationFeedback('declined', ['not_now']), {
    eventType: 'recommendation_dismissed', signalScope: 'none', reasonCodes: ['not_now'], normalizedOutcome: 'dismissed',
  })
  assert.equal(classifyRecommendationFeedback('declined', ['wrong_topic']).signalScope, 'eligibility')
})

test('learning utility is missing-aware and emphasizes downstream evidence', () => {
  assert.deepEqual(computeLearningUtility({ rating: 10 }), {
    tasteValue: 1, dispositionValue: null, evidenceValue: null, learningValue: 1, confidence: .25, trainingEligible: true,
  })
  const complete = computeLearningUtility({ rating: 8, disposition: 'retain', evidence: [{ evidence_type: 'application', result: 'pass' }] })
  assert.equal(complete.learningValue, .9)
  assert.equal(complete.confidence, 1)
})

test('profile automation requires strong evidence and protects explicit assertions', () => {
  assert.equal(profileMutationPolicy({ decisionSource: 'hermes_auto', confidence: .79, evidenceCount: 4 }).eligible, false)
  assert.equal(profileMutationPolicy({ decisionSource: 'hermes_auto', confidence: .8, evidenceCount: 2 }).eligible, true)
  assert.equal(profileMutationPolicy({ decisionSource: 'hermes_auto', confidence: .94, evidenceCount: 5, replacingExplicit: true }).eligible, false)
  assert.equal(profileMutationPolicy({ decisionSource: 'hermes_auto', confidence: .95, evidenceCount: 3, replacingExplicit: true }).eligible, true)
  assert.equal(profileMutationPolicy({ decisionSource: 'user', confidence: 0, evidenceCount: 0 }).eligible, true)
})

test('format, creator, and evidence taxonomies are deterministic', () => {
  assert.equal(canonicalFormat('YouTube lecture'), 'lecture')
  assert.equal(canonicalFormat('Lite Visual reading companion'), 'visual_companion')
  assert.equal(canonicalCreatorKey('https://www.Example.com/channel/name'), 'example.com')
  assert.equal(structuredEvidenceStatus([{ claim: 'A sufficiently anchored source claim.', source_url: 'https://example.com/source' }]), 'structured')
  assert.equal(structuredEvidenceStatus([{ claim: 'short' }]), 'invalid')
})

test('typed profile assertions affect relevance and expected learning value stays normalized', () => {
  const item = { title: 'Agent workflow integration in Obsidian', canonical_url: 'https://example.com/agent', evidence: [{ claim: 'Shows a complete applied agent workflow.', source_url: 'https://example.com/agent' }] }
  const base = deriveCandidateFeatures(item)
  const profiled = deriveCandidateFeatures(item, {
    knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [],
    profileAssertions: [{ assertion_key: 'ai.agent-workflows', category: 'pattern', value: 'practical agent workflow integrations with Obsidian', confidence: .95, status: 'active' }],
  })
  assert.ok(profiled.personal_relevance > base.personal_relevance)
  assert.ok(expectedLearningValue(profiled, 'fit') >= 0 && expectedLearningValue(profiled, 'fit') <= 1)
})
