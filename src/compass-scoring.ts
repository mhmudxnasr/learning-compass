export type TrustSignal = { average: number; count: number }
export type KnownSource = { url: string; title: string; creator: string; status: string }
export type SourceCheck = { status: 'verified' | 'restricted' | 'unknown' | 'unavailable' | 'invalid'; http_status?: number; final_url?: string }
export type CompassContext = {
  knownSources: KnownSource[]
  blockedEntities: string[]
  creatorTrust: Map<string, TrustSignal>
  topicAffinities: Map<string, number>
  priorityTopics: Set<string>
  formatOutcomes: Map<string, TrustSignal>
  recentFormats: string[]
  featureWeights?: Map<string, Record<string, number>>
}

const EMPTY_CONTEXT: CompassContext = { knownSources: [], blockedEntities: [], creatorTrust: new Map(), topicAffinities: new Map(), priorityTopics: new Set(), formatOutcomes: new Map(), recentFormats: [], featureWeights: new Map() }
const clamp = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback }
const norm = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const STOP_WORDS = new Set(['and', 'the', 'with', 'from', 'into', 'for', 'this', 'that', 'how', 'why', 'what'])
const tokens = (value: unknown) => new Set(norm(value).split(' ').filter((token) => token.length >= 3 && !STOP_WORDS.has(token)).map((token) => token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token))
const evidencePresent = (value: unknown) => typeof value === 'string' ? value.trim().length >= 24 : Boolean(value && typeof value === 'object' && Object.keys(value as object).length)
const shrunk = (signal?: TrustSignal) => signal ? ((clamp(signal.average / 10, .5) * signal.count) + 1.5) / (signal.count + 3) : .5

export function canonicalizeUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key)
    if (url.hostname === 'youtu.be') { const id = url.pathname.split('/').filter(Boolean)[0]; if (id) return `https://www.youtube.com/watch?v=${id}` }
    if (/^(www\.)?youtube\.com$/.test(url.hostname) && url.pathname === '/watch') { const id = url.searchParams.get('v'); if (id) return `https://www.youtube.com/watch?v=${id}` }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    url.pathname = url.pathname.replace(/\/$/, '') || '/'
    return url.toString().replace(/\/$/, '')
  } catch { return '' }
}

export const urlOf = (item: any) => canonicalizeUrl(item.url || item.canonical_url)

export function semanticSimilarity(a: unknown, b: unknown) {
  const left = tokens(a); const right = tokens(b)
  if (!left.size || !right.size) return 0
  const overlap = [...left].filter((token) => right.has(token)).length
  return overlap / new Set([...left, ...right]).size
}

const exactEntityMatch = (corpus: string, entity: string) => {
  const phrase = norm(entity)
  return phrase.length >= 4 && (` ${norm(corpus)} `).includes(` ${phrase} `)
}
const topicMatches = (candidate: string, known: string) => exactEntityMatch(candidate, known) || exactEntityMatch(known, candidate) || semanticSimilarity(candidate, known) >= .45

export function deriveCandidateFeatures(item: any, context: CompassContext = EMPTY_CONTEXT, sourceCheck: SourceCheck = { status: 'unknown' }) {
  const url = urlOf(item)
  const title = String(item.title || '').trim()
  const creator = String(item.creator || '').trim()
  const format = norm(item.format || item.source_class || 'unknown')
  const sourceClass = norm(item.source_class || '')
  const explicitTopics = Array.isArray(item.topics) ? item.topics : [item.topic, item.branch]
  const candidateTopics: string[] = [...explicitTopics, sourceClass, ...(explicitTopics.some(Boolean) ? [] : [title])].map((value: unknown) => norm(value)).filter(Boolean)
  const corpus = `${title} ${creator} ${candidateTopics.join(' ')}`
  const knownSimilarity = context.knownSources.reduce((max, source) => Math.max(max, semanticSimilarity(`${title} ${creator}`, `${source.title} ${source.creator}`)), 0)
  const knownUrl = context.knownSources.some((source) => canonicalizeUrl(source.url) === url)
  const blocked = context.blockedEntities.some((entity) => exactEntityMatch(corpus, entity))
  const topicSignals = candidateTopics.flatMap((topic) => [...context.topicAffinities.entries()].filter(([known]) => topicMatches(topic, known)).map(([, score]) => clamp(score / 5, .5)))
  const topicAffinity = topicSignals.length ? Math.max(...topicSignals) : .5
  const priorityMatch = candidateTopics.some((topic) => [...context.priorityTopics].some((priority) => topicMatches(topic, priority)))
  const creatorSignal = context.creatorTrust.get(norm(creator))
  const formatSignal = context.formatOutcomes.get(format)
  const recentFormatCount = context.recentFormats.filter((recent) => recent === format).length
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  const authority = /arxiv\.org|doi\.org|acm\.org|ieee\.org|nature\.com|science\.org|\.edu$/.test(host) || /primary|research|academic|journal|original/.test(sourceClass) ? .90
    : /lecture|scholar|expert|conference|essay/.test(sourceClass) ? .78 : .64
  const duration = Number(item.duration_minutes || item.duration || 0)
  const friction = clamp((item.paywalled === true ? .45 : 0) + (duration > 120 ? .25 : duration > 60 ? .12 : 0) + (sourceCheck.status === 'restricted' ? .12 : 0), 0)
  const novelty = clamp(1 - knownSimilarity * .75, 0)
  return {
    topic_value: clamp(.40 + topicAffinity * .35 + (priorityMatch ? .20 : 0), 0),
    personal_relevance: clamp(.38 + topicAffinity * .40 + (priorityMatch ? .17 : 0), 0),
    source_quality: clamp(authority * .72 + shrunk(creatorSignal) * .28, 0),
    information_gain: clamp(novelty * .70 + (topicSignals.length ? .15 : .28), 0),
    novelty,
    format_fit: clamp(shrunk(formatSignal) * .70 + .30 - Math.min(recentFormatCount, 3) * .08, 0),
    evidence_quality: evidencePresent(item.evidence || item.rationale || item.why_this) ? .80 : .25,
    friction,
    _valid_url: Boolean(url),
    _has_identity: Boolean(title && url),
    _hard_excluded: knownUrl || knownSimilarity >= .84 || blocked || sourceCheck.status === 'unavailable' || sourceCheck.status === 'invalid',
    _exclusion_reason: knownUrl ? 'known_url' : knownSimilarity >= .84 ? 'semantic_duplicate' : blocked ? 'blocked_or_mastered' : sourceCheck.status === 'unavailable' ? 'source_unavailable' : sourceCheck.status === 'invalid' ? 'invalid_url' : null,
    _topic_affinity: topicAffinity,
    _known_similarity: knownSimilarity,
    _source_check: sourceCheck.status,
  }
}

export const DEFAULT_FEATURE_WEIGHTS: Record<string, Record<string, number>> = {
  fit: { topic_value: .23, personal_relevance: .22, source_quality: .19, information_gain: .13, novelty: .08, format_fit: .07, evidence_quality: .08 },
  bridge: { topic_value: .17, personal_relevance: .16, source_quality: .17, information_gain: .22, novelty: .15, format_fit: .06, evidence_quality: .07 },
  challenge: { topic_value: .14, personal_relevance: .13, source_quality: .18, information_gain: .20, novelty: .23, format_fit: .05, evidence_quality: .07 },
}

export function serverScore(features: Record<string, unknown>, strategy = 'fit', customWeights?: Record<string, number>) {
  const weights = customWeights || DEFAULT_FEATURE_WEIGHTS[strategy] || DEFAULT_FEATURE_WEIGHTS.fit
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + clamp(features[key], .5) * weight, 0)
  return clamp(score - clamp(features.friction, 0) * .10, 0)
}

export function pairwiseDominance(candidate: Record<string, any>, peers: Record<string, any>[]) {
  const dimensions = ['topic_value', 'personal_relevance', 'source_quality', 'information_gain', 'novelty', 'format_fit', 'evidence_quality']
  if (peers.length <= 1) return .5
  let wins = 0; let comparisons = 0
  for (const peer of peers) for (const key of dimensions) { comparisons++; if (Number(candidate[key]) > Number(peer[key])) wins++; else if (Number(candidate[key]) === Number(peer[key])) wins += .5 }
  return comparisons ? wins / comparisons : .5
}

export function calibratedConfidence(score: number, uncertainty: number, margin: number, dominance: number) {
  return clamp(score * .55 + (1 - uncertainty) * .22 + clamp(margin / .06, 0) * .13 + dominance * .10, 0)
}
export const compassPickIsUnresolved = (pickStatus: string, recommendationStatus?: string | null) => ['ready', 'started', 'abstained'].includes(pickStatus) && !['consumed', 'rejected'].includes(String(recommendationStatus || 'active'))
