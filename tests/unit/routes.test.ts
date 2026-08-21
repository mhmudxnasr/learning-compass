import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { modes, objectHref, parseRoute, roots, routeHref, views } from '../../client/src/app/router.ts'
import { calibratedConfidence, canonicalizeUrl, compassPickIsUnresolved, deriveCandidateFeatures, matchThreadCoverage, pairwiseDominance, semanticSimilarity, serverScore } from '../../src/compass-scoring.ts'
import { validatePublicHttpUrl } from '../../src/services/public-url.ts'
test('Compass ignores started picks whose recommendation is already completed or rejected', () => {
  assert.equal(compassPickIsUnresolved('started', 'consumed'), false)
  assert.equal(compassPickIsUnresolved('started', 'rejected'), false)
  assert.equal(compassPickIsUnresolved('started', 'active'), true)
  assert.equal(compassPickIsUnresolved('ready', 'consumed'), false)
})

test('Compass reports comparative selection and current learning load', () => {
  const source = readFileSync(new URL('../../src/api/compass.ts', import.meta.url), 'utf8')
  assert.match(source, /selection_explanation: selectionExplanation/)
  assert.match(source, /alternatives, learning_load: learningLoad/)
  assert.match(source, /start_recommended:/)
  assert.match(source, /srs_cards WHERE due_at<=date\('now'\)/)
  assert.match(source, /consolidation_runs WHERE state NOT IN \('closed','waived'\)/)
})
test('Compass derives differentiated Worker-owned features from metadata and evidence', () => {
  const strong = deriveCandidateFeatures({
    canonical_url: 'https://arxiv.org/abs/1234.5678', title: 'Unexpected evidence from a new study',
    creator: 'Researcher', format: 'research paper', source_class: 'primary research',
    evidence: 'Directly extends Mahmood interest with evidence from five studies and practical implications.',
  })
  const weak = deriveCandidateFeatures({ canonical_url: 'https://example.com/x', title: 'Thing', format: 'unknown', evidence: 'x' })
  assert.ok(serverScore(strong) > serverScore(weak))
  assert.equal(strong._valid_url, true)
  assert.equal(strong._has_identity, true)
})

test('Compass ignores client-provided feature and verification scores', () => {
  const candidate = deriveCandidateFeatures({
    canonical_url: 'https://example.com/source', title: 'A source with evidence', format: 'article',
    evidence: 'A sufficiently detailed evidence summary that can be checked against the source.',
    features: { topic_value: 1, personal_relevance: 1, source_quality: 1 }, is_verified: true, total_score: 1,
  })
  const withoutClientFields = deriveCandidateFeatures({
    canonical_url: 'https://example.com/source', title: 'A source with evidence', format: 'article',
    evidence: 'A sufficiently detailed evidence summary that can be checked against the source.',
  })
  assert.deepEqual(candidate, withoutClientFields)
})

test('Compass hard-excludes consumed or blocked candidates', () => {
  const features = deriveCandidateFeatures({
    canonical_url: 'https://example.com/old', title: 'Old source', creator: 'Blocked creator',
    format: 'article', evidence: 'Detailed evidence for this source.',
  }, {
    knownSources: [{ url: 'https://example.com/old', title: 'Old source', creator: 'Blocked creator', status: 'consumed' }],
    blockedEntities: ['blocked creator'],
    creatorTrust: new Map(),
    topicAffinities: new Map(),
    priorityTopics: new Set(),
    formatOutcomes: new Map(),
    recentFormats: [],
  })
  assert.equal(features._hard_excluded, true)
})

test('Compass hard-excludes topics already owned by any learning Thread', () => {
  const anchors = [
    { threadId: 'thread_systems', threadTitle: 'Systems Thinking', scopeKind: 'thread' as const, scopeId: 'thread_systems', label: 'Systems Thinking', text: 'Systems Thinking feedback loops stocks flows and leverage points' },
    { threadId: 'thread_systems', threadTitle: 'Systems Thinking', scopeKind: 'level' as const, scopeId: 'level_feedback', label: 'Feedback Loops', text: 'Understand reinforcing and balancing feedback loops' },
  ]
  const match = matchThreadCoverage({ title: 'Thinking in Systems: feedback loops in practice', topic: 'systems thinking' }, anchors)
  assert.equal(match?.threadId, 'thread_systems')
  const features = deriveCandidateFeatures({
    canonical_url: 'https://example.com/thinking-in-systems', title: 'Thinking in Systems', format: 'lecture',
    topic: 'systems thinking', evidence: 'A detailed source-grounded lecture about feedback loops and leverage points.',
  }, {
    knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [], threadCoverage: anchors,
  })
  assert.equal(features._hard_excluded, true)
  assert.equal(features._exclusion_reason, 'covered_by_learning_thread')
  assert.equal(features._coverage_match?.threadTitle, 'Systems Thinking')
})

test('Compass permits an exact missing lesson target but preserves other Thread coverage', () => {
  const review = { verdict: 'recommend', why_worth_time: 'This source directly teaches the missing lesson with a complete worked method.', unique_value: 'It provides the exact mechanism and worked application absent from the lesson.', depth: 'deep' }
  const item = { canonical_url: 'https://example.com/loops', title: 'Feedback loops in practice', target_lesson_id: 'lesson_loops', evidence: [{ claim: 'The source teaches reinforcing and balancing loops.', source_url: 'https://example.com/loops' }], editorial_review: review }
  const thread = { id: 'thread_systems', recommendation_target_gaps: [{ kind: 'lesson_material' as const, lesson_id: 'lesson_loops', stage_id: 'level_1', stage_title: 'Foundations', title: 'Feedback loops', target_text: 'reinforcing and balancing feedback loops' }] }
  const sameThread = { threadId: 'thread_systems', threadTitle: 'Systems Thinking', scopeKind: 'lesson' as const, scopeId: 'lesson_loops', label: 'Feedback loops', text: 'reinforcing and balancing feedback loops' }
  const allowed = deriveCandidateFeatures(item, { knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [], thread, threadCoverage: [sameThread] }, { status: 'verified', evidence_status: 'verified' })
  assert.equal(allowed._hard_excluded, false)
  const otherThread = { ...sameThread, threadId: 'thread_other', threadTitle: 'Another Thread' }
  const blocked = deriveCandidateFeatures(item, { knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [], thread, threadCoverage: [sameThread, otherThread] }, { status: 'verified', evidence_status: 'verified' })
  assert.equal(blocked._exclusion_reason, 'covered_by_learning_thread')
})

test('Thread coverage does not block a source that only shares a broad word', () => {
  const anchors = [{ threadId: 'thread_systems', threadTitle: 'Systems Thinking', scopeKind: 'thread' as const, scopeId: 'thread_systems', label: 'Systems Thinking', text: 'Systems Thinking feedback loops stocks flows and leverage points' }]
  assert.equal(matchThreadCoverage({ title: 'Designing reliable software systems', topic: 'software architecture' }, anchors), null)
})

test('Compass canonicalizes tracking and YouTube URL variants', () => {
  assert.equal(canonicalizeUrl('https://youtu.be/abc123?utm_source=x'), 'https://www.youtube.com/watch?v=abc123')
  assert.equal(canonicalizeUrl('https://Example.com/read/?utm_campaign=x#part'), 'https://example.com/read')
})

test('public source URLs reject credentials and private or reserved targets', () => {
  assert.equal(validatePublicHttpUrl('https://Example.com/read#part'), 'https://example.com/read')
  for (const url of ['http://localhost/x', 'http://127.0.0.1/x', 'http://10.0.0.1/x', 'http://[::1]/x', 'https://user:pass@example.com/x', 'https://192.0.2.1/x']) {
    assert.throws(() => validatePublicHttpUrl(url))
  }
})

test('Compass treats unknown source reachability as ineligible', () => {
  const features = deriveCandidateFeatures({ canonical_url: 'https://example.com/source', title: 'Unverified source', editorial_review: { verdict: 'recommend', why_worth_time: 'This source provides a sufficiently substantial account of the target mechanism.', unique_value: 'It covers constraints and examples missing from introductory treatments.', depth: 'deep' }, evidence: [{ claim: 'A structured but not yet reachable source claim.', source_url: 'https://example.com/source' }] })
  assert.equal(features._exclusion_reason, 'source_verification_unknown')
})

test('Compass labels decision confidence honestly and stores observational exposure only', () => {
  const source = readFileSync(new URL('../../src/api/compass.ts', import.meta.url), 'utf8')
  assert.match(source, /confidence_status: 'heuristic_uncalibrated'/)
  assert.match(source, /position: 1,/)
  assert.match(source, /candidate_count: Number\(pick\.candidate_count \|\| 0\),/)
  assert.match(source, /branch_id: winner\?\.branch_id \|\| null,/)
  assert.match(source, /round,/)
  assert.match(source, /target_lesson_id: targetLessonId,/)
  assert.doesNotMatch(source, /discount position bias/)
})

test('Compass semantic deduplication catches title variants', () => {
  assert.ok(semanticSimilarity('Practical Agent Workflows with Local LLMs', 'Local LLM Practical Agent Workflows') > .8)
  assert.ok(semanticSimilarity('Agent Workflows', 'Existential Meaning of Death') < .2)
})

test('Compass does not reward verbose evidence or magic relevance words', () => {
  const base = { canonical_url: 'https://example.com/new', title: 'A useful source', creator: 'Expert', format: 'article', topic: 'business' }
  const short = deriveCandidateFeatures({ ...base, evidence: 'One source-grounded claim with an anchor.' })
  const verbose = deriveCandidateFeatures({ ...base, evidence: `Mahmood practical interest ${'padding '.repeat(100)}` })
  assert.equal(serverScore(short), serverScore(verbose))
})

test('Compass confidence can select a strong close winner without a fixed margin gate', () => {
  assert.ok(calibratedConfidence(.82, .18, .025, .68) >= .67)
  assert.ok(calibratedConfidence(.60, .50, 0, .50) < .67)
})

test('Compass metadata-only candidates can produce a confident personalized winner', () => {
  const context = {
    knownSources: [], blockedEntities: [],
    creatorTrust: new Map([['trusted expert', { average: 9, count: 8 }], ['weak creator', { average: 3, count: 6 }]]),
    topicAffinities: new Map([['business', 4.8], ['unwanted', .5]]),
    priorityTopics: new Set(['business']),
    formatOutcomes: new Map([['research paper', { average: 9, count: 8 }], ['article', { average: 4, count: 8 }]]),
    recentFormats: [],
  }
  const candidates = [
    { canonical_url: 'https://arxiv.org/abs/2401.1', title: 'Institutional design under uncertainty', creator: 'Trusted Expert', format: 'research paper', source_class: 'primary research', topics: ['business'], evidence: 'Methods, findings, caveats, and primary evidence anchors.' },
    { canonical_url: 'https://example.org/a', title: 'Generic overview', creator: 'Weak Creator', format: 'article', source_class: 'blog', topics: ['unwanted'], evidence: 'A source-grounded overview with links and caveats.' },
    { canonical_url: 'https://example.net/b', title: 'Another general overview', creator: 'Unknown', format: 'article', source_class: 'blog', topics: ['general'], evidence: 'A source-grounded overview with links and caveats.' },
  ]
  const features = candidates.map((candidate) => deriveCandidateFeatures(candidate, context))
  const ranked = features.map((candidate) => {
    const dominance = pairwiseDominance(candidate, features)
    return { score: serverScore(candidate) * .9 + dominance * .1, dominance }
  }).sort((a, b) => b.score - a.score)
  const margin = ranked[0].score - ranked[1].score
  assert.ok(ranked[0].score >= .68)
  assert.ok(calibratedConfidence(ranked[0].score, .336, margin, ranked[0].dominance) >= .67)
})

test('Compass infers topic affinity from legacy title-only metadata', () => {
  const features = deriveCandidateFeatures({
    canonical_url: 'https://example.com/negotiation', title: 'A practical persuasion field study',
    creator: 'Researcher', format: 'paper', source_class: 'primary research', evidence: 'Methods, results, caveats, and source anchors.',
  }, {
    knownSources: [], blockedEntities: [], creatorTrust: new Map(),
    topicAffinities: new Map([['persuasion', 4.5]]), priorityTopics: new Set(['persuasion']),
    formatOutcomes: new Map(), recentFormats: [],
  })
  assert.ok(features._topic_affinity >= .9)
  assert.ok(features.personal_relevance >= .9)
})

test('Compass uses learning balance as a bounded branch signal', () => {
  const base = { canonical_url: 'https://example.com/history', title: 'A history source', format: 'lecture', topic: 'history', evidence: 'Methods, claims, caveats, and source anchors.' }
  const context = {
    knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map([['history', 2]]), priorityTopics: new Set(),
    formatOutcomes: new Map(), recentFormats: [], branchSignals: new Map([['history', { state: 'at-risk', attentionShare: 0, priorityShare: null }]]),
  }
  const balanced = deriveCandidateFeatures(base)
  const redirected = deriveCandidateFeatures(base, context)
  assert.ok(redirected.topic_value > balanced.topic_value)
  assert.equal(redirected._branch_state, 'at-risk')
})

test('the router exposes five roots and twelve grouped modes with focus state', () => {
  assert.deepEqual(roots.map((root) => root.key), ['home', 'library', 'learn', 'map', 'settings'])
  assert.equal(roots.length, 5)
  const declaredModes = roots.flatMap((root) => modes[root.key].map((mode) => ({ root: root.key, ...mode })))
  assert.equal(declaredModes.length, 12)
  assert.equal(new Set(declaredModes.map((mode) => `${mode.root}/${mode.key}`)).size, 12)
  assert.ok(declaredModes.every((mode) => mode.label.trim() && mode.description.trim()))
  assert.equal(views.library.length, 8)
  assert.equal(views.learn.length, 4)
  for (const root of roots) {
    assert.equal(routeHref(root.key), `#/${root.key}`)
    assert.equal(routeHref(root.key, root.defaultMode), `#/${root.key}`)
    for (const mode of modes[root.key]) {
      const href = routeHref(root.key, mode.key)
      if (mode.key === root.defaultMode) assert.equal(href, `#/${root.key}`)
      else assert.equal(href, `#/${root.key}?mode=${mode.key}`)
    }
  }
  assert.equal(routeHref('library', 'books'), '#/library?mode=catalog&focus=books')
  assert.equal(routeHref('library', 'journal'), '#/library?mode=catalog&focus=journal')
  assert.equal(routeHref('learn', 'notes'), '#/learn?mode=practice&focus=notes')
  assert.equal(routeHref('learn', 'canon'), '#/learn?mode=canon')
  assert.equal(routeHref('map', 'branches'), '#/map?mode=review&focus=branches')
  assert.equal(routeHref('settings', 'profile'), '#/settings?focus=profile')
  assert.equal(routeHref('learn', 'practice', 'notes'), '#/learn?mode=practice&focus=notes')
})

test('root modes parse from query state while typed object links keep their identity', () => {
  const books = parseRoute('#/library?mode=books')
  assert.equal(books.root, 'library')
  assert.equal(books.mode, 'catalog')
  assert.equal(books.focus, 'books')
  assert.equal(books.view, 'books')
  assert.equal(books.canonical, '/library?mode=catalog&focus=books')
  assert.equal(books.objectId, undefined)

  const journal = parseRoute('#/library/hardcover')
  assert.equal(journal.mode, 'catalog')
  assert.equal(journal.focus, 'journal')
  assert.equal(journal.view, 'journal')
  assert.equal(journal.canonical, '/library?mode=catalog&focus=journal')

  const oldQueue = parseRoute('#/curate/queue')
  assert.equal(oldQueue.canonical, '/library?mode=triage&focus=queue')
  assert.equal(oldQueue.mode, 'triage')
  assert.equal(oldQueue.focus, 'queue')
  assert.equal(oldQueue.recoveredFrom, '/curate/queue')
  assert.equal(oldQueue.notFound, undefined)

  const oldThread = parseRoute('#/learn/hub/path%201')
  assert.equal(oldThread.canonical, '/learn/thread/path%201')
  assert.equal(oldThread.objectType, 'thread')
  assert.equal(oldThread.objectId, 'path 1')

  const canon = parseRoute('#/learn/canon/behavioral-psychology')
  assert.equal(canon.mode, 'canon')
  assert.equal(canon.objectType, 'canon-domain')
  assert.equal(canon.objectId, 'behavioral-psychology')
  assert.equal(canon.canonical, '/learn/canon/behavioral-psychology')

  const lesson = parseRoute('#/learn/thread/thread%201/lesson/lesson%202')
  assert.equal(lesson.objectType, 'lesson')
  assert.equal(lesson.objectId, 'lesson 2')
  assert.equal(lesson.parentObjectId, 'thread 1')
  assert.equal(lesson.canonical, '/learn/t/thread%201/l/lesson%202')
  const compactLesson = parseRoute('#/learn/t/thread%201/l/lesson%202')
  assert.equal(compactLesson.canonical, '/learn/t/thread%201/l/lesson%202')

  const level = parseRoute('#/learn/thread/thread%201/level/level%202')
  assert.equal(level.objectType, 'level')
  assert.equal(level.objectId, 'level 2')
  assert.equal(level.parentObjectId, 'thread 1')
  assert.equal(level.canonical, '/learn/t/thread%201/v/level%202')
  const compactLevel = parseRoute('#/learn/t/thread%201/v/level%202')
  assert.equal(compactLevel.canonical, '/learn/t/thread%201/v/level%202')

  const oldMapObject = parseRoute('#/map/branches/branch/branch%201')
  assert.equal(oldMapObject.canonical, '/map/branch/branch%201?mode=review&focus=branches')
  assert.equal(oldMapObject.mode, 'review')
  assert.equal(oldMapObject.focus, 'branches')
  assert.equal(oldMapObject.objectType, 'branch')
  assert.equal(oldMapObject.objectId, 'branch 1')

  const staleMode = parseRoute('#/settings/appearance')
  assert.equal(staleMode.canonical, '/settings?focus=preferences')
  assert.equal(staleMode.mode, 'personal')
  assert.equal(staleMode.focus, 'preferences')

  const unknown = parseRoute('#/library/not-a-mode')
  assert.equal(unknown.root, 'library')
  assert.equal(unknown.mode, 'triage')
  assert.equal(unknown.focus, 'queue')
  assert.equal(unknown.notFound, true)
  assert.equal(unknown.recoveredFrom, '/library/not-a-mode')
})

test('typed object links preserve the five-root contract', () => {
  assert.equal(objectHref('library', 'source', 'rec/1'), '#/library/source/rec%2F1')
  assert.equal(objectHref('learn', 'thread', 'path 1'), '#/learn/thread/path%201')
  assert.equal(objectHref('map', 'branch', 'branch 1', 'branches'), '#/map/branch/branch%201?mode=review&focus=branches')
})
