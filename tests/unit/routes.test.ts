import assert from 'node:assert/strict'
import test from 'node:test'

import { modes, objectHref, parseRoute, roots, routeHref, views } from '../../client/src/app/router.ts'
import { calibratedConfidence, canonicalizeUrl, compassPickIsUnresolved, deriveCandidateFeatures, pairwiseDominance, semanticSimilarity, serverScore } from '../../src/compass-scoring.ts'
test('Compass ignores started picks whose recommendation is already completed or rejected', () => {
  assert.equal(compassPickIsUnresolved('started', 'consumed'), false)
  assert.equal(compassPickIsUnresolved('started', 'rejected'), false)
  assert.equal(compassPickIsUnresolved('started', 'active'), true)
  assert.equal(compassPickIsUnresolved('ready', 'consumed'), false)
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

test('Compass canonicalizes tracking and YouTube URL variants', () => {
  assert.equal(canonicalizeUrl('https://youtu.be/abc123?utm_source=x'), 'https://www.youtube.com/watch?v=abc123')
  assert.equal(canonicalizeUrl('https://Example.com/read/?utm_campaign=x#part'), 'https://example.com/read')
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

test('the router exposes five roots and eleven grouped modes with focus state', () => {
  assert.deepEqual(roots.map((root) => root.key), ['home', 'library', 'learn', 'map', 'settings'])
  assert.equal(roots.length, 5)
  const declaredModes = roots.flatMap((root) => modes[root.key].map((mode) => ({ root: root.key, ...mode })))
  assert.equal(declaredModes.length, 11)
  assert.equal(new Set(declaredModes.map((mode) => `${mode.root}/${mode.key}`)).size, 11)
  assert.ok(declaredModes.every((mode) => mode.label.trim() && mode.description.trim()))
  assert.equal(views.library.length, 8)
  assert.equal(views.learn.length, 3)
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
  assert.equal(routeHref('learn', 'notes'), '#/learn?mode=practice&focus=notes')
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
