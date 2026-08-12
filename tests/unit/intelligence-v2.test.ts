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
import { candidateSetDiversity, contextualAlignment, deriveCandidateFeatures, editorialReviewStatus, expectedLearningValue, frontierScore } from '../../src/compass-scoring.ts'

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
  assert.equal(structuredEvidenceStatus([{ claim: 'An unsupported claim without a source URL.' }]), 'invalid')
  assert.equal(structuredEvidenceStatus([{ claim: 'short' }]), 'invalid')
})

test('Compass excludes candidates without grounded source evidence', () => {
  const features = deriveCandidateFeatures({
    canonical_url: 'https://example.com/source', title: 'Ungrounded recommendation', format: 'article',
    editorial_review: { verdict: 'recommend', why_worth_time: 'It directly addresses the active decision with a concrete mechanism.', unique_value: 'It offers primary evidence rather than a familiar generic summary.', depth: 'substantive' },
    evidence: 'Plausible sounding but unanchored explanation.',
  })
  assert.equal(features._hard_excluded, true)
  assert.equal(features._exclusion_reason, 'structured_evidence_required')
})

test('Compass excludes books unless the request explicitly permits them', () => {
  const book = { canonical_url: 'https://example.com/book', title: 'A book', format: 'book', editorial_review: { verdict: 'recommend', why_worth_time: 'It directly addresses the active decision with a concrete mechanism.', unique_value: 'It offers primary evidence rather than a familiar generic summary.', depth: 'deep' }, evidence: [{ claim: 'A source-grounded claim about this book.', source_url: 'https://example.com/book' }] }
  assert.equal(deriveCandidateFeatures(book)._exclusion_reason, 'book_requires_explicit_request')
  assert.equal(deriveCandidateFeatures({ ...book, allow_books: true })._hard_excluded, false)
})

test('Compass requires a substantive editorial review before ranking a candidate', () => {
  const review = { verdict: 'recommend', why_worth_time: 'It teaches a concrete mechanism that directly changes the current decision.', unique_value: 'It is an original primary account rather than the familiar introductory summary.', depth: 'deep' }
  assert.equal(editorialReviewStatus(review), 'approved')
  const candidate = { canonical_url: 'https://example.com/editorial', title: 'Reviewed source', format: 'article', editorial_review: review, evidence: [{ claim: 'A source-grounded claim about the reviewed source.', source_url: 'https://example.com/editorial' }] }
  assert.equal(deriveCandidateFeatures(candidate)._hard_excluded, false)
  assert.equal(deriveCandidateFeatures({ ...candidate, editorial_review: undefined })._exclusion_reason, 'editorial_review_required')
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

test('Compass rewards candidates that target an open Thread evidence gap', () => {
  const base = { title: 'A decision framework for teams', creator: 'Expert', url: 'https://example.com/decision', source_class: 'essay', evidence: [{ claim: 'A grounded claim with enough structure.' }], editorial_review: { verdict: 'recommend', why_worth_time: 'This is a substantive source worth the time because it explains a real decision mechanism.', unique_value: 'It connects the mechanism to concrete decisions and tradeoffs.', depth: 'substantive' } }
  const context: any = { knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [], thread: { id: 'thread_1', title: 'Decision quality', guiding_question: 'How should I make better decisions?', definition_of_done: 'Record a decision', open_evidence_requirements: [{ key: 'decision', label: 'Record a decision', evidence_type: 'decision' }] } }
  const targeted = deriveCandidateFeatures({ ...base, evidence_type: 'decision' }, context)
  const generic = deriveCandidateFeatures({ ...base, evidence_type: 'explanation' }, context)
  assert.ok(Number(targeted.thread_contribution) > Number(generic.thread_contribution))
  assert.equal(targeted._evidence_gap_match, 1)
})

test('Compass uses supplied concepts and source summary to align a candidate to its Thread', () => {
  const review = { verdict: 'recommend', why_worth_time: 'It gives a concrete implementation that directly advances the current build decision.', unique_value: 'It is a primary implementation account with constraints that generic summaries omit.', depth: 'deep' }
  const context: any = { knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [], thread: { id: 'thread_1', title: 'Reliable AI agent workflows', guiding_question: 'How do I build deterministic tool calling for local agent workflows?', definition_of_done: 'Implement and verify a tool-calling workflow' } }
  const aligned = deriveCandidateFeatures({ canonical_url: 'https://example.com/aligned', title: 'Implementation notes', concepts: ['deterministic tool calling', 'local agents'], summary: 'A tested local agent workflow with deterministic tool calling and verification.', expected_contribution: 'Implement a reliable tool-calling workflow.', editorial_review: review, evidence: [{ claim: 'The source documents a deterministic tool-calling implementation.', source_url: 'https://example.com/aligned' }] }, context)
  const generic = deriveCandidateFeatures({ canonical_url: 'https://example.com/generic', title: 'Implementation notes', concepts: ['image generation'], summary: 'A broad visual design overview.', expected_contribution: 'Understand image aesthetics.', editorial_review: review, evidence: [{ claim: 'The source documents a visual design overview.', source_url: 'https://example.com/generic' }] }, context)
  assert.ok(aligned.contextual_alignment > generic.contextual_alignment)
  assert.ok(contextualAlignment('deterministic tool calling local agent workflow', context.thread.guiding_question) > .3)
})

test('Compass diversity detects repeated candidates without treating a distinct high-quality option as a duplicate', () => {
  const repeated = { _valid_url: true, _has_identity: true, _creator_key: 'same creator', _format_key: 'article', _branch_id: 'agents', _candidate_context: 'deterministic tool calling local agent workflow' }
  const duplicate = { ...repeated }
  const distinct = { ...repeated, _creator_key: 'other creator', _format_key: 'lecture', _branch_id: 'testing', _candidate_context: 'evaluation methods for reliable agent systems' }
  assert.ok(candidateSetDiversity(distinct, [repeated, duplicate, distinct]) > candidateSetDiversity(repeated, [repeated, duplicate, distinct]))
})

test('frontier score favors transferable mechanisms in unfamiliar topics without ignoring friction', () => {
  const unfamiliar = { _topic_affinity: .5, _topic_signals: 0, source_quality: .9, evidence_quality: .92, friction: .05 }
  const familiar = { ...unfamiliar, _topic_affinity: .9, _topic_signals: 2 }
  assert.ok(frontierScore(unfamiliar, .9) > frontierScore(familiar, .9))
  assert.ok(frontierScore({ ...unfamiliar, friction: .8 }, .9) < frontierScore(unfamiliar, .9))
})
