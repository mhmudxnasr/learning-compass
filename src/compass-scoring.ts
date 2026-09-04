import { canonicalCreatorKey, canonicalFormat, structuredEvidenceStatus, type CompassLane } from './intelligence-v2.ts'
import { deliveryMatch, type ResolvedDeliveryContext } from './services/delivery-context.ts'

export type TrustSignal = { average: number; count: number }
export type KnownSource = { url: string; title: string; creator: string; status: string }
export type SourceCheck = {
  status: 'verified' | 'restricted' | 'unknown' | 'unavailable' | 'invalid'
  http_status?: number
  final_url?: string
  evidence_status?: 'verified' | 'failed'
  evidence_checks?: Array<{
    submitted_url: string
    final_url?: string
    status: SourceCheck['status']
    http_status?: number
  }>
}
export type RecommendationTargetGap = {
  kind: 'lesson_material'
  lesson_id: string
  stage_id: string
  stage_title: string
  title: string
  target_text: string
}
export type ThreadCoverageAnchor = {
  threadId: string
  threadTitle: string
  scopeKind: 'thread' | 'level' | 'lesson' | 'item'
  scopeId: string
  label: string
  text: string
}
export type ThreadCoverageMatch = ThreadCoverageAnchor & { score: number; matchKind: 'phrase' | 'topic' | 'context' }
export type CompassContext = {
  knownSources: KnownSource[]
  blockedEntities: string[]
  creatorTrust: Map<string, TrustSignal>
  topicAffinities: Map<string, number>
  priorityTopics: Set<string>
  formatOutcomes: Map<string, TrustSignal>
  recentFormats: string[]
  featureWeights?: Map<string, Record<string, number>>
  branchSignals?: Map<string, { state: string; attentionShare: number; priorityShare: number | null }>
  profileAssertions?: Array<{
    assertion_key: string
    category: string
    value: unknown
    weight?: number | null
    confidence: number
    status: string
  }>
  thread?: {
    id: string
    title?: string | null
    guiding_question?: string | null
    why_now?: string | null
    definition_of_done?: string | null
    recommendation_target_gaps?: RecommendationTargetGap[]
  }
  laneEvidence?: Map<string, number>
  threadCoverage?: ThreadCoverageAnchor[]
  delivery?: ResolvedDeliveryContext
}

export function editorialReviewStatus(value: unknown): 'approved' | 'missing' | 'invalid' {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'missing'
  const review = value as Record<string, unknown>
  const text = (key: string, minimum: number) => typeof review[key] === 'string' && review[key].trim().length >= minimum
  return review.verdict === 'recommend' &&
    text('why_worth_time', 30) &&
    text('unique_value', 30) &&
    ['substantive', 'deep'].includes(String(review.depth || ''))
    ? 'approved'
    : 'invalid'
}

const EMPTY_CONTEXT: CompassContext = {
  knownSources: [],
  blockedEntities: [],
  creatorTrust: new Map(),
  topicAffinities: new Map(),
  priorityTopics: new Set(),
  formatOutcomes: new Map(),
  recentFormats: [],
  featureWeights: new Map(),
  branchSignals: new Map(),
}
const clamp = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}
const norm = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const STOP_WORDS = new Set(['and', 'the', 'with', 'from', 'into', 'for', 'this', 'that', 'how', 'why', 'what'])
const tokens = (value: unknown) =>
  new Set(
    norm(value)
      .split(' ')
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
      .map((token) => (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token)),
  )
const shrunk = (signal?: TrustSignal) =>
  signal ? (clamp(signal.average / 10, 0.5) * signal.count + 1.5) / (signal.count + 3) : 0.5

export function canonicalizeUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key)
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      if (id) return `https://www.youtube.com/watch?v=${id}`
    }
    if (/^(www\.)?youtube\.com$/.test(url.hostname) && url.pathname === '/watch') {
      const id = url.searchParams.get('v')
      if (id) return `https://www.youtube.com/watch?v=${id}`
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    url.pathname = url.pathname.replace(/\/$/, '') || '/'
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export const urlOf = (item: any) => canonicalizeUrl(item.url || item.canonical_url)

export function semanticSimilarity(a: unknown, b: unknown) {
  const left = tokens(a)
  const right = tokens(b)
  if (!left.size || !right.size) return 0
  const overlap = [...left].filter((token) => right.has(token)).length
  return overlap / new Set([...left, ...right]).size
}

// Candidate researchers may provide concepts and a source-grounded summary.
// Keep this deliberately deterministic: it is an auditable retrieval signal,
// not an untraceable claim that an opaque model "understood" the learner.
const textList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : []

export function candidateContextText(item: any) {
  const evidence = Array.isArray(item?.evidence) ? item.evidence.map((entry: any) => entry?.claim).filter(Boolean) : []
  return [
    item?.title,
    item?.source_class,
    item?.topic,
    item?.branch_id,
    ...textList(item?.topics),
    ...textList(item?.concepts),
    ...textList(item?.mechanisms),
    item?.summary,
    item?.expected_contribution,
    item?.expected_learning,
    item?.evidence_type,
    item?.expected_evidence_type,
    ...textList(item?.evidence_types),
    ...evidence,
  ]
    .filter(Boolean)
    .join(' ')
}

export function contextualAlignment(candidateText: unknown, targetText: unknown) {
  const lexical = semanticSimilarity(candidateText, targetText)
  const candidateTerms = tokens(candidateText)
  const targetTerms = tokens(targetText)
  if (!candidateTerms.size || !targetTerms.size) return lexical
  const contained = [...targetTerms].filter((term) => candidateTerms.has(term)).length / targetTerms.size
  // Containment rewards direct coverage of a Thread question while Jaccard
  // keeps broad, keyword-stuffed candidate descriptions from dominating.
  return clamp(lexical * 0.45 + contained * 0.55, 0)
}

export function candidateSetDiversity(candidate: any, peers: any[]) {
  const eligible = peers.filter((peer) => peer?._valid_url && peer?._has_identity && !peer?._hard_excluded)
  if (eligible.length <= 1) return 0.5
  const creator = String(candidate?._creator_key || '')
  const format = String(candidate?._format_key || '')
  const branch = norm(candidate?._branch_id || '')
  const duplicateSimilarity = Math.max(
    0,
    ...eligible
      .filter((peer) => peer !== candidate)
      .map((peer) =>
        semanticSimilarity(
          `${candidate?._candidate_context || ''} ${candidate?._branch_id || ''}`,
          `${peer?._candidate_context || ''} ${peer?._branch_id || ''}`,
        ),
      ),
  )
  const sameCreator = creator
    ? eligible.filter((peer) => peer !== candidate && String(peer?._creator_key || '') === creator).length
    : 0
  const sameFormat = format
    ? eligible.filter((peer) => peer !== candidate && String(peer?._format_key || '') === format).length
    : 0
  const sameBranch = branch
    ? eligible.filter((peer) => peer !== candidate && norm(peer?._branch_id || '') === branch).length
    : 0
  const perspective = String(candidate?._perspective_key || '')
  const samePerspective = perspective
    ? eligible.filter((peer) => peer !== candidate && String(peer?._perspective_key || '') === perspective).length
    : 0
  const repetition =
    duplicateSimilarity * 0.5 +
    (sameCreator / (eligible.length - 1)) * 0.18 +
    (sameFormat / (eligible.length - 1)) * 0.12 +
    (sameBranch / (eligible.length - 1)) * 0.1 +
    (samePerspective / (eligible.length - 1)) * 0.1
  return Math.round(clamp(1 - repetition, 0) * 1000) / 1000
}

const exactEntityMatch = (corpus: string, entity: string) => {
  const phrase = norm(entity)
  return phrase.length >= 4 && ` ${norm(corpus)} `.includes(` ${phrase} `)
}
const topicMatches = (candidate: string, known: string) =>
  exactEntityMatch(candidate, known) ||
  exactEntityMatch(known, candidate) ||
  semanticSimilarity(candidate, known) >= 0.45

const coverageTokens = (value: unknown) =>
  new Set(
    norm(value)
      .split(' ')
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
      .map((token) => {
        if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
        if (token.length > 6 && token.endsWith('ing')) return token.slice(0, -3)
        return token
      }),
  )

const coverageSimilarity = (leftValue: unknown, rightValue: unknown) => {
  const left = coverageTokens(leftValue)
  const right = coverageTokens(rightValue)
  if (!left.size || !right.size) return 0
  const overlap = [...left].filter((token) => right.has(token)).length
  const jaccard = overlap / new Set([...left, ...right]).size
  const contained = overlap / Math.min(left.size, right.size)
  return clamp(jaccard * 0.45 + contained * 0.55, 0)
}

const coverageCandidateText = (item: any) =>
  [candidateContextText(item), item?.branch, item?.mechanism].filter(Boolean).join(' ')

export function matchThreadCoverage(item: any, anchors: ThreadCoverageAnchor[] = []): ThreadCoverageMatch | null {
  const candidate = coverageCandidateText(item)
  if (!candidate.trim()) return null
  let strongest: ThreadCoverageMatch | null = null
  for (const anchor of anchors) {
    const phrase = exactEntityMatch(candidate, anchor.label)
    const topicScore = coverageSimilarity(candidate, anchor.label)
    const contextScore = coverageSimilarity(candidate, anchor.text)
    const matched = phrase || topicScore >= 0.72 || contextScore >= 0.78
    if (!matched) continue
    const score = phrase ? 1 : Math.max(topicScore, contextScore)
    const matchKind: ThreadCoverageMatch['matchKind'] = phrase ? 'phrase' : topicScore >= 0.72 ? 'topic' : 'context'
    if (!strongest || score > strongest.score)
      strongest = { ...anchor, score: Math.round(score * 1000) / 1000, matchKind }
  }
  return strongest
}

export function deriveCandidateFeatures(
  item: any,
  context: CompassContext = EMPTY_CONTEXT,
  sourceCheck: SourceCheck = { status: 'unknown' },
) {
  const url = urlOf(item)
  const title = String(item.title || '').trim()
  const creator = String(item.creator || '').trim()
  const creatorKey = canonicalCreatorKey(creator) || ''
  const format = canonicalFormat(item.format || item.source_class || 'unknown')
  const bookRequiresExplicitRequest = format === 'book' && item.allow_books !== true
  const editorialStatus = editorialReviewStatus(item.editorial_review)
  const sourceClass = norm(item.source_class || '')
  const explicitTopics = Array.isArray(item.topics) ? item.topics : [item.topic, item.branch_id, item.branch]
  const candidateTopics: string[] = [...explicitTopics, sourceClass, ...(explicitTopics.some(Boolean) ? [] : [title])]
    .map((value: unknown) => norm(value))
    .filter(Boolean)
  const corpus = `${title} ${creator} ${candidateTopics.join(' ')}`
  const knownSimilarity = context.knownSources.reduce(
    (max, source) => Math.max(max, semanticSimilarity(`${title} ${creator}`, `${source.title} ${source.creator}`)),
    0,
  )
  const knownUrl = context.knownSources.some((source) => canonicalizeUrl(source.url) === url)
  const blocked = context.blockedEntities.some((entity) => exactEntityMatch(corpus, entity))
  const targetGap = (context.thread?.recommendation_target_gaps || []).find(
    (gap) => gap.lesson_id === String(item.target_lesson_id || ''),
  )
  const coverageAnchors = targetGap
    ? (context.threadCoverage || []).filter((anchor) => anchor.threadId !== context.thread?.id)
    : context.threadCoverage || []
  const coverageMatch = matchThreadCoverage(item, coverageAnchors)
  const topicSignals = candidateTopics.flatMap((topic) =>
    [...context.topicAffinities.entries()]
      .filter(([known]) => topicMatches(topic, known))
      .map(([, score]) => clamp(score / 5, 0.5)),
  )
  const topicAffinity = topicSignals.length ? Math.max(...topicSignals) : 0.5
  const priorityMatch = candidateTopics.some((topic) =>
    [...context.priorityTopics].some((priority) => topicMatches(topic, priority)),
  )
  const profileSignals = (context.profileAssertions || [])
    .filter(
      (assertion) =>
        assertion.status === 'active' && !['blacklist', 'hard_rule', 'exclusion'].includes(assertion.category),
    )
    .map((assertion) => ({
      text: typeof assertion.value === 'string' ? assertion.value : JSON.stringify(assertion.value),
      confidence: clamp(assertion.confidence, 0.5),
      weight: assertion.weight == null ? 1 : Math.max(0, Number(assertion.weight)),
    }))
  const profileMatch = profileSignals.reduce(
    (max, signal) =>
      Math.max(
        max,
        topicMatches(corpus, signal.text)
          ? Math.min(1, 0.55 + signal.confidence * 0.35 + Math.min(signal.weight, 2) * 0.05)
          : semanticSimilarity(corpus, signal.text) * signal.confidence,
      ),
    0,
  )
  const branchSignal = [...(context.branchSignals || [])]
    .filter(([branch]) => candidateTopics.some((topic) => topicMatches(topic, branch)))
    .map(([, signal]) => signal)
    .sort((a, b) => Number(b.attentionShare) - Number(a.attentionShare))[0]
  const balanceBoost =
    branchSignal?.state === 'at-risk' || branchSignal?.state === 'uncovered'
      ? 0.08
      : branchSignal?.state === 'over-focused' && !priorityMatch
        ? -0.06
        : 0
  const creatorSignal = context.creatorTrust.get(creatorKey)
  const formatSignal = context.formatOutcomes.get(format)
  const recentFormatCount = context.recentFormats.filter((recent) => recent === format).length
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  const authority =
    /arxiv\.org|doi\.org|acm\.org|ieee\.org|nature\.com|science\.org|\.edu$/.test(host) ||
    /primary|research|academic|journal|original/.test(sourceClass)
      ? 0.9
      : /lecture|scholar|expert|conference|essay/.test(sourceClass)
        ? 0.78
        : 0.64
  const duration = Number(item.duration_minutes || item.duration || 0)
  const friction = clamp(
    (item.paywalled === true ? 0.45 : 0) +
      (duration > 120 ? 0.25 : duration > 60 ? 0.12 : 0) +
      (sourceCheck.status === 'restricted' ? 0.12 : 0),
    0,
  )
  const novelty = clamp(1 - knownSimilarity * 0.75, 0)
  const threadCorpus = context.thread
    ? `${context.thread.title || ''} ${context.thread.guiding_question || ''} ${context.thread.why_now || ''} ${context.thread.definition_of_done || ''}`
    : ''
  const contributionCorpus = candidateContextText(item)
  const threadSimilarity = threadCorpus ? contextualAlignment(contributionCorpus, threadCorpus) : 0.5
  const explicitContribution = String(item.expected_contribution || item.expected_learning || '').trim().length >= 12
  const targetGaps = context.thread?.recommendation_target_gaps || []
  const targetGapMatch = targetGap
    ? 1
    : targetGaps.length
      ? Math.max(...targetGaps.map((gap) => contextualAlignment(contributionCorpus, gap.target_text)), 0)
      : 0.5
  const threadContribution = context.thread
    ? clamp(0.28 + threadSimilarity * 0.38 + targetGapMatch * 0.22 + (explicitContribution ? 0.12 : 0), 0.28)
    : 0.5
  const evidenceStatus = structuredEvidenceStatus(item.evidence || item.rationale || item.why_this)
  const evidenceQuality =
    evidenceStatus === 'structured'
      ? 0.92
      : evidenceStatus === 'legacy'
        ? 0.58
        : evidenceStatus === 'invalid'
          ? 0.08
          : 0.2
  const perspective = item.perspective && item.perspective.status === 'verified' ? item.perspective : null
  const delivery = context.delivery
    ? deliveryMatch(item, context.delivery)
    : { matches: true, score: 0.5, compared_fields: 0, advisory_only: true as const }
  return {
    topic_value: clamp(0.4 + topicAffinity * 0.35 + (priorityMatch ? 0.2 : 0) + balanceBoost, 0),
    personal_relevance: clamp(
      0.38 + topicAffinity * 0.4 + (priorityMatch ? 0.17 : 0) + profileMatch * 0.12 + balanceBoost,
      0,
    ),
    source_quality: clamp(authority * 0.72 + shrunk(creatorSignal) * 0.28, 0),
    information_gain: clamp(novelty * 0.7 + (topicSignals.length ? 0.15 : 0.28), 0),
    novelty,
    format_fit: clamp(
      shrunk(formatSignal) * 0.7 + 0.3 - Math.min(recentFormatCount, 5) * 0.06 - (recentFormatCount >= 3 ? 0.1 : 0),
      0,
    ),
    evidence_quality: evidenceQuality,
    thread_contribution: threadContribution,
    friction,
    delivery_fit: delivery.score,
    _valid_url: Boolean(url),
    _has_identity: Boolean(title && url),
    _hard_excluded:
      knownUrl ||
      knownSimilarity >= 0.84 ||
      blocked ||
      Boolean(coverageMatch) ||
      bookRequiresExplicitRequest ||
      editorialStatus !== 'approved' ||
      !['verified', 'restricted'].includes(sourceCheck.status) ||
      sourceCheck.evidence_status === 'failed' ||
      evidenceStatus !== 'structured',
    _exclusion_reason: knownUrl
      ? 'known_url'
      : knownSimilarity >= 0.84
        ? 'semantic_duplicate'
        : blocked
          ? 'blocked_or_mastered'
          : coverageMatch
            ? 'covered_by_learning_thread'
            : bookRequiresExplicitRequest
              ? 'book_requires_explicit_request'
              : editorialStatus !== 'approved'
                ? 'editorial_review_required'
                : evidenceStatus !== 'structured'
                  ? 'structured_evidence_required'
                  : sourceCheck.status === 'unavailable'
                    ? 'source_unavailable'
                    : sourceCheck.status === 'invalid'
                      ? 'invalid_url'
                      : sourceCheck.status === 'unknown'
                        ? 'source_verification_unknown'
                        : sourceCheck.evidence_status === 'failed'
                          ? 'evidence_source_unverified'
                          : null,
    _coverage_match: coverageMatch,
    _topic_affinity: topicAffinity,
    _topic_signals: topicSignals.length,
    _profile_match: profileMatch,
    _known_similarity: knownSimilarity,
    _repetition_advisory: {
      repeated_source: knownUrl,
      similarity: Math.round(knownSimilarity * 1000) / 1000,
      advisory_only: true,
    },
    _source_check: sourceCheck.status,
    _branch_state: branchSignal?.state || 'unmapped',
    _branch_id: item.branch_id || null,
    _creator_key: creatorKey || null,
    _format_key: format,
    _evidence_status: evidenceStatus,
    _editorial_status: editorialStatus,
    _thread_id: context.thread?.id || null,
    _target_gap_match: targetGapMatch,
    _target_lesson_id: targetGap?.lesson_id || null,
    _candidate_context: contributionCorpus,
    _perspective: perspective || { status: 'neutral', viewpoint: null, school: null, evidence_indexes: [] },
    _perspective_key: perspective ? norm(`${perspective.viewpoint || ''} ${perspective.school || ''}`) || null : null,
    _delivery_match: delivery,
    contextual_alignment: threadSimilarity,
    // Replaced with candidate-set comparison in the route once all candidates
    // are known; a neutral default keeps isolated feature evaluation stable.
    candidate_set_diversity: 0.5,
  }
}

export const DEFAULT_FEATURE_WEIGHTS: Record<string, Record<string, number>> = {
  fit: {
    topic_value: 0.16,
    personal_relevance: 0.17,
    source_quality: 0.14,
    information_gain: 0.1,
    novelty: 0.06,
    format_fit: 0.06,
    evidence_quality: 0.11,
    thread_contribution: 0.2,
  },
  bridge: {
    topic_value: 0.12,
    personal_relevance: 0.13,
    source_quality: 0.13,
    information_gain: 0.18,
    novelty: 0.12,
    format_fit: 0.05,
    evidence_quality: 0.07,
    thread_contribution: 0.2,
  },
  challenge: {
    topic_value: 0.1,
    personal_relevance: 0.1,
    source_quality: 0.14,
    information_gain: 0.17,
    novelty: 0.18,
    format_fit: 0.04,
    evidence_quality: 0.07,
    thread_contribution: 0.2,
  },
}

export const LEGACY_FEATURE_WEIGHTS: Record<string, Record<string, number>> = {
  fit: {
    topic_value: 0.23,
    personal_relevance: 0.22,
    source_quality: 0.19,
    information_gain: 0.13,
    novelty: 0.08,
    format_fit: 0.07,
    evidence_quality: 0.08,
  },
  bridge: {
    topic_value: 0.17,
    personal_relevance: 0.16,
    source_quality: 0.17,
    information_gain: 0.22,
    novelty: 0.15,
    format_fit: 0.06,
    evidence_quality: 0.07,
  },
  challenge: {
    topic_value: 0.14,
    personal_relevance: 0.13,
    source_quality: 0.18,
    information_gain: 0.2,
    novelty: 0.23,
    format_fit: 0.05,
    evidence_quality: 0.07,
  },
}

export function serverScore(
  features: Record<string, unknown>,
  strategy = 'fit',
  customWeights?: Record<string, number>,
) {
  const weights = customWeights || DEFAULT_FEATURE_WEIGHTS[strategy] || DEFAULT_FEATURE_WEIGHTS.fit
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + clamp(features[key], 0.5) * weight, 0)
  return clamp(score - clamp(features.friction, 0) * 0.1, 0)
}

export function pairwiseDominance(candidate: Record<string, any>, peers: Record<string, any>[]) {
  const dimensions = [
    'topic_value',
    'personal_relevance',
    'source_quality',
    'information_gain',
    'novelty',
    'format_fit',
    'evidence_quality',
    'thread_contribution',
  ]
  if (peers.length <= 1) return 0.5
  let wins = 0
  let comparisons = 0
  for (const peer of peers)
    for (const key of dimensions) {
      comparisons++
      if (Number(candidate[key]) > Number(peer[key])) wins++
      else if (Number(candidate[key]) === Number(peer[key])) wins += 0.5
    }
  return comparisons ? wins / comparisons : 0.5
}

export function calibratedConfidence(score: number, uncertainty: number, margin: number, dominance: number) {
  return clamp(score * 0.55 + (1 - uncertainty) * 0.22 + clamp(margin / 0.06, 0) * 0.13 + dominance * 0.1, 0)
}
export const decisionConfidence = calibratedConfidence

export function laneExplorationBonus(lane: CompassLane, laneEvidence: Map<string, number> = new Map()) {
  const total = [...laneEvidence.values()].reduce((sum, value) => sum + Number(value || 0), 0)
  const count = Number(laneEvidence.get(lane) || 0)
  if (total <= 0) return lane === 'fit' ? 0 : 0.025
  return Math.min(0.05, 0.018 * Math.sqrt(Math.log(total + 2) / (count + 1)))
}

export function expectedLearningValue(
  features: Record<string, unknown>,
  lane: CompassLane,
  customWeights?: Record<string, number>,
) {
  return Math.round(serverScore(features, lane, customWeights) * 1000) / 1000
}

// Shadow-only exploration signal. It rewards a transferable reason to care
// plus distance from known topics, while keeping source quality, evidence, and
// try-cost as hard trust constraints. It is intentionally not a serving lane.
export function frontierScore(features: Record<string, unknown>, mechanismMatch = 0) {
  const topicDistance = Number(features._topic_signals || 0) === 0 ? 1 : clamp(1 - Number(features._topic_affinity), 0)
  const score =
    mechanismMatch * 0.42 +
    topicDistance * 0.3 +
    clamp(features.source_quality, 0.5) * 0.18 +
    clamp(features.evidence_quality, 0.5) * 0.1 -
    clamp(features.friction, 0) * 0.15
  return Math.round(clamp(score, 0) * 1000) / 1000
}
export const compassPickIsUnresolved = (pickStatus: string, recommendationStatus?: string | null) =>
  ['ready', 'started', 'abstained'].includes(pickStatus) &&
  !['consumed', 'rejected'].includes(String(recommendationStatus || 'active'))
