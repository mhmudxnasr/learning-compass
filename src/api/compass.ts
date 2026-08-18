import { Hono } from 'hono'
import { safeError, normalizeRating, type Bindings } from '../lib'
import { createInboxCapture } from '../services/capture'
import { candidateSetDiversity, canonicalizeUrl, decisionConfidence, DEFAULT_FEATURE_WEIGHTS, LEGACY_FEATURE_WEIGHTS, deriveCandidateFeatures, expectedLearningValue, frontierScore, laneExplorationBonus, matchThreadCoverage, pairwiseDominance, semanticSimilarity, serverScore, urlOf, type CompassContext, type SourceCheck, type ThreadCoverageMatch } from '../compass-scoring'
import { buildLearningBalance } from '../services/learning-balance'
import { canonicalTasteIdentity } from './taste'
import { computeDecayedAffinity } from '../domain'
import { INTELLIGENCE_ENGINE_VERSION, LEARNING_OBJECTIVE_VERSION, canonicalCreatorKey, canonicalFormat, classifyRecommendationFeedback, normalizeCompassLane, structuredEvidenceStatus, type CompassLane } from '../intelligence-v2'
import { recordRecommendationSignal, refreshRecommendationOutcome } from '../services/intelligence-v2'
import { indexSemanticDocuments, semanticSourceMatches } from '../services/semantic-retrieval'
import { loadThreadCoverageAnchors } from '../services/thread-coverage'

const app = new Hono<{ Bindings: Bindings }>()
const STRATEGIES = new Set(['fit', 'bridge', 'challenge'])
const REQUEST_INTENTS = new Set(['solve_problem', 'build_skill', 'deepen_thread', 'discover', 'queue_fill'])
const QUEUE_CAP = 5
// Abstention thresholds. These were originally tuned to v2's calibration
// (score ≥ .68, confidence ≥ .67) but are applied to the v1 result while the
// engine runs in shadow mode — v1 scores cluster ~.65–.76 with confidence
// ~.56–.66, so the old thresholds abstained ~37% of the time on a model we're
// about to discard. Until v2 accumulates ≥20 clean outcomes to re-base against,
// serve on a looser floor so the loop can actually collect consumption data.
// The `verified` gate (reachable URL + identity + structured evidence) remains
// the real quality floor; score/confidence here only decide automatic vs. weak.
const SERVING_SCORE_THRESHOLD = 0.60
const SERVING_CONFIDENCE_THRESHOLD = 0.50
type ScoredCandidate = { item: any; index: number; lane: CompassLane; features: ReturnType<typeof deriveCandidateFeatures> & { candidate_set_diversity?: number }; score: number; baseScore: number; expectedLearningValue: number; explorationBonus: number; dominance: number; diversity: number; uncertainty: number; sourceCheck: SourceCheck }
type PreparedCandidate = { item: any; index: number; lane: CompassLane; features: ReturnType<typeof deriveCandidateFeatures>; url: string; sourceCheck: SourceCheck }
type EngineMode = 'shadow' | 'v2'

// Older/manual rows can contain empty or malformed JSON. A bad receipt must not
// take the whole Momentum Compass card offline.
const parseJsonObject = (value: unknown): Record<string, any> => {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

const weakPickSourceIsQueueable = (candidate: any) => {
  let features: any = {}
  try { features = JSON.parse(candidate?.features_json || '{}') } catch {}
  return Boolean(candidate?.canonical_url && candidate?.title && features._valid_url && features._has_identity && !features._hard_excluded && ['verified', 'restricted'].includes(String(features._source_check || '')))
}

const checkSource = async (item: any): Promise<SourceCheck> => {
  const url = urlOf(item)
  if (!url) return { status: 'invalid' }
  const host = new URL(url).hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host.includes(':') || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return { status: 'invalid' }
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(3500), headers: { 'user-agent': 'LearningCompassVerifier/1.0' } })
    const result = { http_status: response.status, final_url: canonicalizeUrl(response.url || url) }
    if (response.status === 404 || response.status === 410) {
      const retry = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(2500), headers: { 'user-agent': 'LearningCompassVerifier/1.0', range: 'bytes=0-0' } })
      const retried = { http_status: retry.status, final_url: canonicalizeUrl(retry.url || url) }
      if (retry.ok) return { status: 'verified', ...retried }
      if ([401, 403, 405, 429].includes(retry.status)) return { status: 'restricted', ...retried }
      return { status: 'unavailable', ...retried }
    }
    if (response.ok) return { status: 'verified', ...result }
    if ([401, 403, 405, 429].includes(response.status)) return { status: 'restricted', ...result }
    return { status: 'unknown', ...result }
  } catch { return { status: 'unknown' } }
}

export const loadCompassContext = async (DB: D1Database, thread: any = null): Promise<CompassContext> => {
  const [history, mastered, blacklist, trust, vectors, priorities, formats, recent, weights, balance, assertions, laneEvidence, branchNodes, explored, threadCoverage] = await Promise.all([
    DB.prepare(`SELECT video_url,video_title,creator,status FROM recommendations WHERE status IN ('consumed','active','rejected') LIMIT 2000`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT label,author FROM mastered`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT name,work FROM blacklist`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT creator_key creator,COUNT(*) sample_count,AVG(taste_value*10) average_score,MAX(COALESCE(consumed_at,evaluated_at)) last_feedback_at FROM recommendation_outcomes WHERE creator_key IS NOT NULL AND training_eligible=1 AND taste_value IS NOT NULL GROUP BY creator_key`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT topic,affinity_score,last_consumed FROM taste_vectors`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT COALESCE(label,branch_id) topic FROM priorities ORDER BY rank`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT format_key format,COUNT(*) sample_count,AVG(taste_value*10) average_score FROM recommendation_outcomes WHERE format_key IS NOT NULL AND training_eligible=1 AND taste_value IS NOT NULL GROUP BY format_key`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT format_key format FROM recommendation_outcomes WHERE outcome_status='consumed' AND format_key IS NOT NULL ORDER BY COALESCE(consumed_at,evaluated_at) DESC LIMIT 5`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT strategy,dimension,current_weight FROM compass_feature_weights`).all<any>().catch(() => ({ results: [] })),
    buildLearningBalance(DB, 90).catch(() => null),
    DB.prepare(`SELECT assertion_key,category,value_json,weight,confidence,status FROM profile_assertions WHERE status='active' AND confidence>=.8`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT p.strategy,COUNT(DISTINCT o.recommendation_id) count FROM compass_picks p JOIN recommendation_outcomes o ON o.recommendation_id=p.recommendation_id WHERE o.training_eligible=1 GROUP BY p.strategy`).all<any>().catch(() => ({ results: [] })),
    // Branch decisions made in the Branch Deck steer the compass: pruned
    // branches are hard exclusions, love branches raise topic affinity.
    DB.prepare(`SELECT id,label,status FROM tree_nodes WHERE type='branch' AND status IN ('love','pruned','held')`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT id,is_pruned FROM branch_exploration WHERE is_pruned=1`).all<any>().catch(() => ({ results: [] })),
    loadThreadCoverageAnchors(DB),
  ])
  const assertionRows = assertions.results || []
  const assertionValues = assertionRows.map((row: any) => { try { return { ...row, parsed: JSON.parse(row.value_json) } } catch { return { ...row, parsed: row.value_json } } })
  const assertionBlocked = assertionValues.filter((row: any) => ['blacklist','hard_rule','exclusion'].includes(String(row.category))).flatMap((row: any) => {
    const value = row.parsed
    return typeof value === 'string' ? [value] : [value?.name, value?.work, value?.creator, value?.topic, value?.label, value?.target, value?.branch_id].filter(Boolean)
  })
  // Pruned branches from the deck are hard exclusions in Compass.
  const prunedBranchSet = new Set<string>((explored.results || []).map((row: any) => String(row.id)))
  const branchDecisionRows = branchNodes.results || []
  const prunedBranches = branchDecisionRows.filter((row: any) => row.status === 'pruned' || prunedBranchSet.has(String(row.id)))
  const lovedBranches = branchDecisionRows.filter((row: any) => row.status === 'love')
  const prunedTerms = prunedBranches.flatMap((row: any) => [row.label, row.id]).map((value: any) => String(value || '').trim()).filter((value: string) => value.length >= 4)
  const terms = [...(mastered.results || []), ...(blacklist.results || []), ...assertionBlocked.map((name) => ({ name })), ...prunedTerms.map((name) => ({ name }))]
    .flatMap((row: any) => [row.label, row.author, row.work, row.name])
    .map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.length >= 4)
  const featureWeights = new Map<string, Record<string, number>>()
  for (const row of weights.results || []) featureWeights.set(String(row.strategy), { ...(featureWeights.get(String(row.strategy)) || {}), [String(row.dimension)]: Number(row.current_weight) })
  const branchSignals = new Map<string, { state: string; attentionShare: number; priorityShare: number | null }>()
  for (const branch of balance?.branches || []) {
    branchSignals.set(String(branch.id).toLowerCase(), { state: String(branch.state), attentionShare: Number(branch.attention_share || 0), priorityShare: branch.priority_share == null ? null : Number(branch.priority_share) })
    branchSignals.set(String(branch.label).toLowerCase(), { state: String(branch.state), attentionShare: Number(branch.attention_share || 0), priorityShare: branch.priority_share == null ? null : Number(branch.priority_share) })
  }
  const creatorTrust = new Map<string, { average: number; count: number }>()
  for (const row of trust.results || []) {
    const key = canonicalTasteIdentity(row.creator, '')
    if (!key) continue
    const existing = creatorTrust.get(key) || { average: 0, count: 0 }
    const count = Number(row.sample_count || 0)
    const nextCount = existing.count + count
    creatorTrust.set(key, { average: nextCount ? ((existing.average * existing.count) + Number(row.average_score || 5) * count) / nextCount : 5, count: nextCount })
  }
  const topicAffinities = new Map<string, number>()
  for (const row of vectors.results || []) {
    const { decayedAffinity } = computeDecayedAffinity(Number(row.affinity_score), row.last_consumed || null)
    topicAffinities.set(canonicalTasteIdentity(row.topic), decayedAffinity)
  }
  // Love branches from the deck are an explicit positive signal: a floor of 4.5
  // so they steer candidate topic value without claiming a consumption history.
  for (const row of lovedBranches) {
    for (const key of [canonicalTasteIdentity(row.label), canonicalTasteIdentity(row.id)]) {
      if (!key) continue
      const current = topicAffinities.get(key) || 0
      if (current < 4.5) topicAffinities.set(key, Math.max(current, 4.5))
    }
  }
  return {
    knownSources: (history.results || []).map((row: any) => ({ url: row.video_url || '', title: row.video_title || '', creator: row.creator || '', status: row.status || '' })),
    blockedEntities: [...new Set(terms)],
    creatorTrust,
    topicAffinities,
    priorityTopics: new Set([
      ...(priorities.results || []).map((row: any) => canonicalTasteIdentity(row.topic, '')).filter(Boolean),
      ...assertionValues.filter((row: any) => row.category === 'priority').flatMap((row: any) => typeof row.parsed === 'string' ? [canonicalTasteIdentity(row.parsed, '')] : [canonicalTasteIdentity(row.parsed?.branch_id || row.parsed?.topic || row.parsed?.label, '')]).filter(Boolean),
    ]),
    formatOutcomes: new Map((formats.results || []).map((row: any) => [String(row.format), { average: Number(row.average_score || 5), count: Number(row.sample_count || 0) }])),
    recentFormats: (recent.results || []).map((row: any) => String(row.format)),
    featureWeights,
    branchSignals,
    profileAssertions: assertionValues.map((row: any) => ({ ...row, value: row.parsed })),
    thread,
    laneEvidence: new Map((laneEvidence.results || []).map((row: any) => [String(row.strategy), Number(row.count || 0)])),
    threadCoverage,
  }
}

// Exploration is valuable only when explicitly requested. Auto-rotating into
// bridge/challenge made ordinary recommendations predictably less personal.
const DEFAULT_COMPASS_STRATEGY = 'fit'

async function engineMode(DB: D1Database): Promise<EngineMode> {
  const setting = await DB.prepare(`SELECT value_json FROM user_settings WHERE setting_key='recommendation_engine'`).first<any>().catch(() => null)
  try { return JSON.parse(setting?.value_json || '{}').mode === 'v2' ? 'v2' : 'shadow' } catch { return 'shadow' }
}

async function resolveThread(DB: D1Database, requestedId?: unknown) {
  const thread = requestedId
    ? await DB.prepare(`SELECT * FROM learning_threads WHERE id=? AND status NOT IN ('verified','abandoned')`).bind(String(requestedId)).first<any>()
    : await DB.prepare(`SELECT * FROM learning_threads WHERE status='active' ORDER BY priority DESC,updated_at DESC LIMIT 1`).first<any>()
  if (!thread) return null
  const requirements = await DB.prepare(`SELECT requirement_key key,label,evidence_type FROM thread_evidence_requirements WHERE thread_id=? AND status='open' ORDER BY position,requirement_key`).bind(thread.id).all<any>().catch(() => ({ results: [] }))
  return { ...thread, open_evidence_requirements: requirements.results || [] }
}

// Greedy MMR (maximal marginal relevance) post-pass. The primary sort is by
// score, but a final slate that over-repeats one creator, topic, or format
// wastes the learner's limited attention. Re-rank so each next pick maximizes
// λ·score − (1−λ)·similarity-to-already-selected, keeping a diverse winner.
const MMR_LAMBDA = 0.6
function mmrReorder(ranked: ScoredCandidate[], lambda = MMR_LAMBDA): ScoredCandidate[] {
  if (ranked.length <= 1) return ranked
  const pool = [...ranked]
  const selected: ScoredCandidate[] = []
  while (pool.length) {
    let best = pool[0]
    let bestValue = -Infinity
    for (const candidate of pool) {
      const maxSimilarity = selected.length
        ? Math.max(...selected.map((chosen) => semanticSimilarity(candidate.features._candidate_context || '', chosen.features._candidate_context || '')))
        : 0
      const value = lambda * candidate.score - (1 - lambda) * maxSimilarity
      if (value > bestValue) { bestValue = value; best = candidate }
    }
    selected.push(best)
    pool.splice(pool.indexOf(best), 1)
  }
  return selected
}

function candidateDecision(scored: ScoredCandidate[], engine: 'v1' | 'v2', forcedWinner?: ScoredCandidate) {
  const eligible = scored.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded)
  const base = eligible.length ? eligible : scored
  // Exploration arm: a forced frontier candidate wins outright; MMR re-ranks the
  // remainder only so margin/runner-up stay meaningful for calibration.
  const ranked = forcedWinner
    ? [forcedWinner, ...mmrReorder(base.filter((entry) => entry.index !== forcedWinner.index))]
    : mmrReorder(base)
  const winner = ranked[0]
  const second = ranked[1]
  const margin = second && winner ? winner.score - second.score : 0
  const evidenceStatus = winner ? String(winner.features._evidence_status || 'missing') : 'missing'
  const verified = Boolean(winner && winner.features._valid_url && winner.features._has_identity &&
    evidenceStatus === 'structured' &&
    !['invalid','unavailable'].includes(winner.sourceCheck.status))
  const confidence = winner ? decisionConfidence(winner.score, winner.uncertainty, margin, winner.dominance) : 0
  const weak = forcedWinner ? !winner : eligible.length < 2 || !winner
  // Exploration candidates are validated by frontierScore + the verified gate,
  // not the greedy score floor, so they serve as long as they are reachable and
  // carry structured evidence (the real quality floor).
  const confident = Boolean(!weak && verified && (forcedWinner ? true : winner.score >= SERVING_SCORE_THRESHOLD && confidence >= SERVING_CONFIDENCE_THRESHOLD))
  const allCovered = !eligible.length && scored.some((entry) => entry.features._exclusion_reason === 'covered_by_learning_thread')
  const abstentionReason = allCovered ? 'covered_by_learning_thread'
    : !eligible.length ? 'all_candidates_ineligible'
    : eligible.length < 2 && !forcedWinner ? 'not_enough_eligible_candidates'
      : !verified ? engine === 'v2' && evidenceStatus !== 'structured' ? 'structured_evidence_required' : 'winner_not_verifiable'
        : !forcedWinner && Number(winner?.score || 0) < SERVING_SCORE_THRESHOLD ? 'winner_below_score_threshold'
          : !forcedWinner && confidence < SERVING_CONFIDENCE_THRESHOLD ? 'insufficient_decision_confidence' : 'candidate_set_not_usable'
  const reviewableWeakPick = !confident && Boolean(winner?.features._valid_url && winner?.features._has_identity && !winner?.features._hard_excluded)
  return { engine, scored, eligible, ranked, winner, second, margin, confidence, confident, verified, abstentionReason, reviewableWeakPick }
}

async function scoreCandidateSet(DB: D1Database, candidates: any[], thread: any, legacyStrategy: string) {
  const context = await loadCompassContext(DB, thread)
  const sourceChecks = await Promise.all(candidates.map(checkSource))
  const submittedKeys = new Set<string>()
  const prepared: PreparedCandidate[] = candidates.map((item: any, index: number) => {
    const lane = normalizeCompassLane(item.lane, index)
    const sourceCheck = sourceChecks[index]
    const features = deriveCandidateFeatures({ ...item, lane }, context, sourceCheck)
    const url = urlOf(item)
    const duplicate = submittedKeys.has(url) || candidates.slice(0, index).some((other: any) => semanticSimilarity(`${item.title || ''} ${item.creator || ''}`, `${other.title || ''} ${other.creator || ''}`) >= .88)
    if (duplicate) { features._hard_excluded = true; features._exclusion_reason = 'duplicate_submission' }
    if (url) submittedKeys.add(url)
    return { item: { ...item, lane }, index, lane, features, url, sourceCheck }
  })
  const eligibleFeatures = prepared.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded).map((entry) => entry.features)
  for (const entry of prepared) entry.features.candidate_set_diversity = candidateSetDiversity(entry.features, eligibleFeatures)
  const build = (version: 'v1' | 'v2') => prepared.map(({ item, index, lane, features, sourceCheck }) => {
    const scoringLane = version === 'v2' ? lane : legacyStrategy as CompassLane
    const weights = version === 'v2' ? context.featureWeights?.get(scoringLane) || DEFAULT_FEATURE_WEIGHTS[scoringLane] : LEGACY_FEATURE_WEIGHTS[scoringLane]
    const baseScore = serverScore(features, scoringLane, weights)
    const dominance = pairwiseDominance(features, eligibleFeatures)
    const diversity = Number(features.candidate_set_diversity || .5)
    const explorationBonus = version === 'v2' ? laneExplorationBonus(lane, context.laneEvidence) : 0
    // The source's expected learning value remains independent of its peers.
    // Diversity is only a small final-slate reranking signal, so a novel but
    // weak source never defeats a strong Thread-aligned source.
    const score = Math.max(0, Math.min(1, baseScore * .87 + dominance * .08 + diversity * .05 + explorationBonus))
    const uncertainty = Math.max(0, Math.min(1, .50 - Number(features.evidence_quality) * .20 + (sourceCheck.status === 'unknown' ? .14 : 0) + (features._hard_excluded ? .30 : 0) + (context.thread ? 0 : .15)))
    return { item, index, lane, features, score, baseScore, expectedLearningValue: expectedLearningValue(features, lane, weights), explorationBonus, dominance, diversity, uncertainty, sourceCheck }
  }).sort((a, b) => b.score - a.score)
  const v1Scored = build('v1')
  const v2Scored = build('v2')
  const v1 = candidateDecision(v1Scored, 'v1')
  const v2 = candidateDecision(v2Scored, 'v2')
  const mechanismAssertions = (context.profileAssertions || []).filter((assertion: any) => assertion.status === 'active' && assertion.category === 'taste_mechanism')
  const frontier = prepared.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded && Number(entry.features.friction) <= .35).map((entry) => {
    const mechanismText = [entry.item.mechanism, ...(Array.isArray(entry.item.mechanisms) ? entry.item.mechanisms : []), entry.item.expected_contribution, entry.item.expected_learning].filter(Boolean).join(' ')
    const mechanismMatch = mechanismAssertions.length ? Math.max(...mechanismAssertions.map((assertion: any) => semanticSimilarity(mechanismText, typeof assertion.value === 'string' ? assertion.value : JSON.stringify(assertion.value)))) : 0
    return { ...entry, mechanismMatch, frontierScore: frontierScore(entry.features, mechanismMatch) }
  }).sort((a, b) => b.frontierScore - a.frontierScore).slice(0, 3)

  // Exploration arm (item 12): surface a frontier candidate that also passes the
  // serving verification gate, so topic-distance + mechanism-match become
  // learnable instead of shadow-only. Exploration is a distinct arm from MMR —
  // it deliberately steps off the greedy ranking ~1 in 10 picks and is NOT gated
  // on clean-outcome counts (it is the mechanism that collects that data).
  const EXPLORATION_EPSILON = 0.10
  const explorationRoll = Math.random()
  const explorationVerified = (entry: ScoredCandidate) => Boolean(entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded && entry.features._evidence_status === 'structured' && !['invalid', 'unavailable'].includes(entry.sourceCheck.status))
  const frontierScored = frontier
    .map((entry) => v2Scored.find((scored) => scored.index === entry.index))
    .filter((entry): entry is ScoredCandidate => Boolean(entry && explorationVerified(entry)))
  const explorationPick = explorationRoll < EXPLORATION_EPSILON && frontierScored.length > 0 ? frontierScored[0] : null

  const exploration = {
    policy: 'epsilon_greedy', epsilon: EXPLORATION_EPSILON, roll: Math.round(explorationRoll * 1000) / 1000,
    would_explore: explorationPick !== null,
    // `served` flips true in the route once the winner is actually swapped in.
    served: false,
    frontier_available: frontierScored.length,
    candidate_index: explorationPick?.index ?? null,
    candidate_title: explorationPick?.item?.title ?? null,
  }

  // Rolling list-level coverage (item 11): how spread the eligible slate is, so
  // MMR has a metric to be audited against rather than an unmeasured claim.
  const coverage = (() => {
    const set = v2Scored.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded)
    if (set.length < 2) return { eligible: set.length, mean_pairwise_distance: null, gini_topic_affinity: null }
    let distanceSum = 0, pairs = 0
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { distanceSum += 1 - semanticSimilarity(set[i].features._candidate_context || '', set[j].features._candidate_context || ''); pairs++ }
    const affinities = set.map((entry) => Number(entry.features._topic_affinity || 0)).sort((a, b) => a - b)
    const n = affinities.length
    const affinityTotal = affinities.reduce((sum, value) => sum + value, 0)
    const gini = n && affinityTotal ? affinities.reduce((acc, value, index) => acc + (2 * (index + 1) - n - 1) * value, 0) / (n * affinityTotal) : null
    return { eligible: set.length, mean_pairwise_distance: pairs ? Math.round((distanceSum / pairs) * 1000) / 1000 : null, gini_topic_affinity: gini == null ? null : Math.round(gini * 1000) / 1000 }
  })()

  return { context, v1, v2, frontier, exploration, explorationPick, coverage }
}

async function learnFromOutcome(DB: D1Database, pick: any, score: number | null, outcome: string, reasonTags: string[], exposure?: Record<string, any>) {
  if (outcome === 'dismissed' || reasonTags.includes('not_now')) return { skipped: 'neutral_signal' }
  const recommendationOutcome = pick.recommendation_id
    ? await DB.prepare(`SELECT predicted_components_json,learning_value,training_eligible,rejection_reason FROM recommendation_outcomes WHERE recommendation_id=?`).bind(pick.recommendation_id).first<any>()
    : null
  const explicitNegative = outcome === 'declined' || outcome === 'abandoned'
  if ((!recommendationOutcome?.training_eligible || recommendationOutcome.learning_value == null) && !explicitNegative) return { skipped: 'no_learning_utility' }
  const [globalEvidence, laneEvidence] = await Promise.all([
    DB.prepare(`SELECT COUNT(DISTINCT recommendation_id) count FROM learning_events WHERE is_explicit=1 AND recommendation_id IS NOT NULL AND signal_scope IN ('eligibility','utility','both')`).first<any>(),
    DB.prepare(`SELECT COUNT(DISTINCT e.recommendation_id) count FROM learning_events e JOIN compass_picks p ON p.id=e.pick_id WHERE e.is_explicit=1 AND e.signal_scope IN ('eligibility','utility','both') AND p.strategy=?`).bind(pick.strategy).first<any>(),
  ])
  if (Number(globalEvidence?.count || 0) < 20 || Number(laneEvidence?.count || 0) < 8) return { skipped: 'adaptation_frozen', required: { global: 20, lane: 8 }, observed: { global: Number(globalEvidence?.count || 0), lane: Number(laneEvidence?.count || 0) } }
  const winner = await DB.prepare(`SELECT features_json FROM compass_candidates WHERE pick_id=? AND is_winner=1`).bind(pick.id).first<any>()
  let components: Record<string, number> = {}
  try { components = JSON.parse(recommendationOutcome?.predicted_components_json || winner?.features_json || '{}') } catch {}
  const reward = explicitNegative ? 0 : Math.max(0, Math.min(1, Number(recommendationOutcome.learning_value)))
  const reasonAdjustments: Record<string, Record<string, number>> = {
    too_familiar: { novelty: -.03 }, too_shallow: { information_gain: -.03 }, too_long: { format_fit: -.02 },
    wrong_topic: { personal_relevance: -.03, topic_value: -.02 }, poor_source: { source_quality: -.03 },
    excellent_source: { source_quality: .02 }, highly_relevant: { personal_relevance: .02 },
  }
  const adjustments: Record<string, number> = {}
  for (const tag of reasonTags) for (const [dimension, delta] of Object.entries(reasonAdjustments[String(tag)] || {})) adjustments[dimension] = (adjustments[dimension] || 0) + delta
  const rows = (await DB.prepare(`SELECT strategy,dimension,baseline_weight,current_weight,evidence_count,audit_history_json FROM compass_feature_weights WHERE strategy=?`).bind(pick.strategy).all<any>().catch(() => ({ results: [] }))).results || []
  const before = Object.fromEntries(rows.map((row: any) => [row.dimension, Number(row.current_weight)]))
  // Thompson sampling (item 9): draw the strategy's reward estimate from its
  // Beta posterior, seeded with a pessimistic Beta(1,2) prior so weights only
  // move once observed reward beats current belief. This replaces the flat
  // `(reward − .5)` reference with `(reward − θ)` — the Deezer pessimistic-prior
  // insight that a strategy must prove itself against its prior before it earns weight.
  const prior = await DB.prepare(`SELECT alpha,beta,explicit_evidence_count FROM compass_strategy_priors WHERE strategy=?`).bind(pick.strategy).first<any>().catch(() => null)
  const alpha = Math.max(1, Number(prior?.alpha || 1))
  const beta = Math.max(1, Number(prior?.beta || 1))
  const posteriorMean = alpha / (alpha + beta)
  const posteriorStd = Math.sqrt((alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1)))
  // Moment-matched draw (uniform ±σ around the mean) approximates a Beta sample
  // without a gamma generator; enough variance to preserve explore-vs-exploit.
  const theta = Math.max(0, Math.min(1, posteriorMean + (Math.random() * 2 - 1) * posteriorStd))
  const raw = rows.map((row: any) => {
    const component = Number(components[row.dimension] ?? .5)
    const signal = Math.max(-.01, Math.min(.01, (reward - theta) * (component - .5) * .03 + Number(adjustments[row.dimension] || 0)))
    const limit = Number(row.baseline_weight) * .2
    return { ...row, current_weight: Math.max(Number(row.baseline_weight) - limit, Math.min(Number(row.baseline_weight) + limit, Number(row.current_weight) + signal)) }
  })
  const totalWeight = raw.reduce((sum: number, row: any) => sum + Number(row.current_weight), 0) || 1
  const after: Record<string, number> = {}
  const statements: D1PreparedStatement[] = []
  for (const row of raw) {
    const next = Number(row.current_weight) / totalWeight
    after[row.dimension] = next
    let history: any[] = []
    try { history = JSON.parse(row.audit_history_json || '[]') } catch {}
    history.push({ reward, outcome, reason_tags: reasonTags, theta: Math.round(theta * 1000) / 1000, at: new Date().toISOString() })
    statements.push(DB.prepare(`UPDATE compass_feature_weights SET current_weight=?,evidence_count=evidence_count+1,audit_history_json=?,updated_at=datetime('now') WHERE strategy=? AND dimension=?`).bind(next, JSON.stringify(history.slice(-20)), pick.strategy, row.dimension))
  }
  statements.push(DB.prepare(`INSERT INTO compass_strategy_priors(strategy,alpha,beta,explicit_evidence_count,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(strategy) DO UPDATE SET alpha=compass_strategy_priors.alpha+?,beta=compass_strategy_priors.beta+?,explicit_evidence_count=compass_strategy_priors.explicit_evidence_count+1,updated_at=datetime('now')`).bind(pick.strategy, reward >= .6 ? 1 : 0, reward < .6 ? 1 : 0, 1, reward >= .6 ? 1 : 0, reward < .6 ? 1 : 0))
  statements.push(DB.prepare(`INSERT INTO compass_learning_receipts(id,pick_id,strategy,reward,reason_tags_json,before_json,after_json) VALUES (?,?,?,?,?,?,?)`).bind(`clr_${crypto.randomUUID()}`, pick.id, pick.strategy, reward, JSON.stringify(reasonTags), JSON.stringify(before), JSON.stringify(after)))
  await DB.batch(statements)
  return { reward, theta: Math.round(theta * 1000) / 1000, posterior_mean: Math.round(posteriorMean * 1000) / 1000, before, after }
}

async function storedPickCoverageConflict(DB: D1Database, pickId: string): Promise<ThreadCoverageMatch | null> {
  const winner = await DB.prepare(`SELECT canonical_url,title,creator,format,source_class,context_brief,evidence_json,lane,branch_id FROM compass_candidates WHERE pick_id=? AND is_winner=1 LIMIT 1`).bind(pickId).first<any>()
  if (!winner) return null
  const stored = parseJsonObject(winner.evidence_json)
  const candidateContext = stored.candidate_context && typeof stored.candidate_context === 'object' ? stored.candidate_context : {}
  return matchThreadCoverage({ ...candidateContext, ...winner }, await loadThreadCoverageAnchors(DB))
}

async function currentPick(DB: D1Database) {
  // Repair completion through shared feedback/session routes before reading
  // or reading active Compass picks.
  await DB.prepare(`
    UPDATE compass_picks
    SET status='resolved',resolved_at=COALESCE(resolved_at,datetime('now')),updated_at=datetime('now')
    WHERE status IN ('ready','started') AND recommendation_id IN (
      SELECT id FROM recommendations WHERE status IN ('consumed','rejected')
    )
  `).run()
  for (let attempt = 0; attempt < 25; attempt++) {
    const pick = await DB.prepare(`
      SELECT p.*, COALESCE(r.video_title,w.title) AS video_title, COALESCE(r.creator,w.creator) AS creator,
        COALESCE(r.content_type,w.format,w.source_class) AS content_type, COALESCE(r.video_url,w.canonical_url) AS video_url,
        COALESCE(r.why_this,CASE WHEN json_valid(p.rationale_json) THEN json_extract(p.rationale_json,'$.why_this') END) AS why_this,
        COALESCE(r.context_brief,CASE WHEN json_valid(p.rationale_json) THEN json_extract(p.rationale_json,'$.context_brief') END) AS context_brief
      FROM compass_picks p
      LEFT JOIN recommendations r ON r.id=p.recommendation_id
      LEFT JOIN compass_candidates w ON w.pick_id=p.id AND w.is_winner=1
      WHERE p.status IN ('ready','started','abstained') AND (r.id IS NULL OR r.status NOT IN ('consumed','rejected'))
      ORDER BY p.created_at DESC LIMIT 1
    `).first<any>()
    if (!pick || pick.status === 'started') return pick
    const conflict = await storedPickCoverageConflict(DB, pick.id)
    if (!conflict) return pick
    await DB.prepare(`UPDATE compass_picks SET status='replaced',stop_reason='covered_by_learning_thread',resolved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND status IN ('ready','abstained')`).bind(pick.id).run()
  }
  return null
}

async function activeQueueCount(DB: D1Database) {
  const row = await DB.prepare(`SELECT COUNT(*) c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<{ c: number }>()
  return Number(row?.c || 0)
}

app.get('/pick', async (c) => {
  try {
    const pick = await currentPick(c.env.DB)
    if (!pick) return c.json({ pick: null })
    // Keep the read compatible with databases that have the original Compass
    // candidate table while additive migrations are being rolled out.
    const candidates = await c.env.DB.prepare(`SELECT id,title,creator,format,source_class,lane,branch_id,format_key,creator_key,expected_learning_value,decision_score,score,uncertainty,evidence_status,contextual_alignment,candidate_set_diversity,is_verified,is_winner FROM compass_candidates WHERE pick_id=? ORDER BY decision_score DESC,score DESC`).bind(pick.id).all<any>().catch(() =>
      c.env.DB.prepare(`SELECT id,title,creator,format,source_class,is_verified,is_winner,score,uncertainty FROM compass_candidates WHERE pick_id=? ORDER BY score DESC`).bind(pick.id).all<any>()
    )
    const shadow = parseJsonObject(pick.shadow_json)
    return c.json({ pick: { ...pick, rationale: parseJsonObject(pick.rationale_json), shadow, engine_mode: shadow.mode || pick.engine_mode || null, candidates: candidates.results || [] } })
  } catch (err) { return c.json(safeError('Failed to read Compass Pick')(err), 500) }
})

// Hermes researches the web, while the Worker remains the canonical owner of
// personal context and scoring. This compact packet avoids sending an entire
// database or relying on stale prompt memory during candidate assembly.
app.get('/context', async (c) => {
  try {
    const thread = await resolveThread(c.env.DB, c.req.query('thread_id'))
    if (!thread) return c.json({ error: 'learning_thread_required' }, 409)
    const context = await loadCompassContext(c.env.DB, thread)
    const semantic = await semanticSourceMatches(c.env, `${thread.title || ''} ${thread.guiding_question || ''} ${thread.definition_of_done || ''}`)
    const semanticRecommendationIds = semantic.matches.filter((match: any) => match.metadata?.kind === 'recommendation').map((match: any) => String(match.metadata?.source_id || '')).filter(Boolean)
    const semanticKnown = semanticRecommendationIds.length
      ? ((await c.env.DB.prepare(`SELECT id,video_url url,video_title title,creator,status FROM recommendations WHERE id IN (${semanticRecommendationIds.map(() => '?').join(',')})`).bind(...semanticRecommendationIds).all<any>()).results || [])
      : []
    return c.json({
      thread: {
        id: thread.id, title: thread.title, guiding_question: thread.guiding_question, why_now: thread.why_now,
        definition_of_done: thread.definition_of_done, open_evidence_requirements: thread.open_evidence_requirements,
      },
      priorities: [...context.priorityTopics],
      active_profile_assertions: (context.profileAssertions || []).map((assertion: any) => ({
        key: assertion.assertion_key, category: assertion.category, value: assertion.value, weight: assertion.weight ?? null, confidence: assertion.confidence,
      })),
      exclusions: context.blockedEntities.slice(0, 100),
      thread_coverage: (context.threadCoverage || []).map((entry) => ({
        thread_id: entry.threadId, thread_title: entry.threadTitle, scope_kind: entry.scopeKind, scope_id: entry.scopeId, label: entry.label,
      })),
      coverage_policy: { version: 'thread-coverage-v1', complete: true, rule: 'Candidates matching any non-abandoned Thread, Level, lesson, or required item are excluded before scoring and rechecked before Start.' },
      recent_formats: context.recentFormats,
      learning_balance: [...(context.branchSignals || [])].map(([branch, signal]) => ({ branch, ...signal })),
      known_sources: context.knownSources.slice(0, 100).map((source) => ({ url: source.url, title: source.title, creator: source.creator, status: source.status })),
      semantic_retrieval: { enabled: semantic.enabled, matches: semantic.matches.slice(0, 20), known_source_matches: semanticKnown },
      candidate_contract: {
        required: ['canonical_url', 'title', 'creator', 'format', 'source_class', 'branch_id', 'expected_contribution', 'evidence', 'editorial_review'],
        optional_context: ['summary', 'concepts', 'mechanism', 'mechanisms', 'expected_evidence_type', 'evidence_types', 'duration_minutes', 'paywalled'],
        evidence_rule: 'Every evidence claim needs its direct source_url; an anchor is strongly preferred.',
        editorial_review_rule: 'verdict=recommend, substantive why_worth_time and unique_value, depth=substantive|deep.',
        coverage_rule: 'Supply precise topic/concept/mechanism fields and exclude anything present in thread_coverage. The Worker hard-enforces this rule.',
      },
      retrieval_receipt: { context_version: 'compass_research_v1', generated_at: new Date().toISOString(), source_count: context.knownSources.length },
    })
  } catch (err) { return c.json(safeError('Failed to build Compass research context')(err), 500) }
})

app.post('/semantic/index', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const requestedLimit = Number(body.limit || 100)
    const limit = Math.max(1, Math.min(250, Number.isFinite(requestedLimit) ? requestedLimit : 100))
    const [recommendations, threads, units, notes, annotations] = await Promise.all([
      c.env.DB.prepare(`SELECT id,video_url,video_title,creator,content_type,why_this,context_brief FROM recommendations ORDER BY updated_at DESC LIMIT ?`).bind(limit).all<any>(),
      c.env.DB.prepare(`SELECT id,title,guiding_question,why_now,definition_of_done,final_synthesis FROM learning_threads ORDER BY updated_at DESC LIMIT ?`).bind(limit).all<any>(),
      c.env.DB.prepare(`SELECT id,statement,user_synthesis,unit_type FROM learning_units WHERE status NOT IN ('deleted','quarantined') ORDER BY updated_at DESC LIMIT ?`).bind(limit).all<any>(),
      c.env.DB.prepare(`SELECT id,title,kind FROM notes ORDER BY updated_at DESC LIMIT ?`).bind(limit).all<any>(),
      c.env.DB.prepare(`SELECT id,quote,context_before,context_after,language FROM source_annotations WHERE status='active' ORDER BY updated_at DESC LIMIT ?`).bind(limit).all<any>(),
    ])
    const documents = [
      ...(recommendations.results || []).map((row: any) => ({ id: `rec:${row.id}`, kind: 'recommendation' as const, sourceId: row.id, text: [row.video_title, row.creator, row.content_type, row.why_this, row.context_brief, row.video_url].filter(Boolean).join('\n') })),
      ...(threads.results || []).map((row: any) => ({ id: `thread:${row.id}`, kind: 'thread' as const, sourceId: row.id, text: [row.title, row.guiding_question, row.why_now, row.definition_of_done, row.final_synthesis].filter(Boolean).join('\n') })),
      ...(units.results || []).map((row: any) => ({ id: `unit:${row.id}`, kind: 'unit' as const, sourceId: row.id, text: [row.unit_type, row.statement, row.user_synthesis].filter(Boolean).join('\n') })),
      ...(notes.results || []).map((row: any) => ({ id: `note:${row.id}`, kind: 'note' as const, sourceId: row.id, text: [row.kind, row.title].filter(Boolean).join('\n') })),
      ...(annotations.results || []).map((row: any) => ({ id: `annotation:${row.id}`, kind: 'annotation' as const, sourceId: row.id, language: row.language || 'und', text: [row.quote, row.context_before, row.context_after].filter(Boolean).join('\n') })),
    ]
    return c.json({ ok: true, documents_considered: documents.length, ...(await indexSemanticDocuments(c.env, documents)) })
  } catch (err) { return c.json(safeError('Failed to index Compass semantic documents')(err), 500) }
})

const optionalText = (value: unknown, max: number) => value == null || (typeof value === 'string' && value.trim().length > 0 && value.length <= max)
const optionalTextList = (value: unknown, min: number, max: number, itemMax: number) => value == null || (Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= itemMax))

function validateCandidates(body: any): { candidates: any[]; error?: string } {
  const candidates = (Array.isArray(body.candidates) ? body.candidates : []).map((item: any) => item && typeof item === 'object' && item.context_brief != null ? { ...item, context_brief: String(item.context_brief) } : item)
  if (candidates.length < 3 || candidates.length > 24) return { error: 'adaptive search accepts 3 to 24 candidates', candidates }
  for (const item of candidates) {
    if (!item || typeof item !== 'object') return { error: 'every candidate must be an object', candidates }
    if (typeof item.branch_id !== 'string' || !item.branch_id.trim()) return { error: 'candidate_branch_required', candidates }
    if (!optionalText(item.summary, 1800)) return { error: 'candidate summary must be a non-empty string of at most 1800 characters', candidates }
    if (!optionalTextList(item.concepts, 2, 8, 160)) return { error: 'candidate concepts must contain 2 to 8 concise strings', candidates }
    if (!optionalText(item.mechanism, 500) || !optionalTextList(item.mechanisms, 1, 8, 240)) return { error: 'candidate mechanism fields must be concise strings', candidates }
    if (!optionalText(item.expected_evidence_type, 80) || !optionalTextList(item.evidence_types, 1, 6, 80)) return { error: 'candidate evidence type fields must be concise strings', candidates }
  }
  const hasExplicitLanes = candidates.some((item: any) => item?.lane != null)
  const initialLanes = new Set(candidates.slice(0, 3).map((item: any, index: number) => normalizeCompassLane(item?.lane, index)))
  if (hasExplicitLanes && initialLanes.size !== 3) return { error: 'the first three candidates must cover fit, bridge, and challenge lanes', candidates }
  return { candidates }
}

async function validateCandidateBranches(DB: D1Database, candidates: any[]) {
  const branchIds = [...new Set(candidates.map((candidate) => candidate.branch_id.trim()))]
  const rows = await DB.prepare(`SELECT id,type,status FROM tree_nodes WHERE id IN (${branchIds.map(() => '?').join(',')})`).bind(...branchIds).all<any>()
  const byId = new Map((rows.results || []).map((row: any) => [String(row.id), row]))
  const missing = branchIds.filter((id) => !byId.has(id))
  if (missing.length) return { error: 'candidate_branch_not_found', branch_ids: missing }
  const unsupported = branchIds.filter((id) => !['root', 'category', 'branch', 'leaf'].includes(String(byId.get(id)?.type || '')))
  if (unsupported.length) return { error: 'candidate_branch_invalid_type', branch_ids: unsupported }
  const pruned = branchIds.filter((id) => String(byId.get(id)?.status || '').toLowerCase() === 'pruned')
  if (pruned.length) return { error: 'candidate_branch_pruned', branch_ids: pruned }
  return { ok: true }
}

const decisionReadModel = (decision: ReturnType<typeof candidateDecision>) => ({
  engine: decision.engine,
  winner_index: decision.winner?.index ?? null,
  winner_title: decision.winner?.item?.title || null,
  lane: decision.winner?.lane || null,
  score: decision.winner?.score || 0,
  expected_learning_value: decision.winner?.expectedLearningValue || 0,
  candidate_set_diversity: decision.winner?.diversity || 0,
  confidence: decision.confidence,
  margin: decision.margin,
  eligible_count: decision.eligible.length,
  strong: decision.confident,
  evidence_status: decision.winner?.features?._evidence_status || 'missing',
  source_status: decision.winner?.sourceCheck?.status || 'unknown',
  exclusion_reason: decision.winner?.features?._exclusion_reason || null,
  coverage_match: decision.winner?.features?._coverage_match || null,
  abstention_reason: decision.confident ? null : decision.abstentionReason,
})

async function createCompassPickV2(c: any, body: any) {
  const validated = validateCandidates(body)
  if (validated.error) return c.json({ error: validated.error }, 400)
  const intent = String(body.intent || '').trim()
  if (!REQUEST_INTENTS.has(intent)) return c.json({ error: 'intent must be solve_problem, build_skill, deepen_thread, discover, or queue_fill' }, 400)
  const requestedStrategy = body.strategy ? String(body.strategy) : ''
  const legacyStrategy = requestedStrategy || DEFAULT_COMPASS_STRATEGY
  if (!STRATEGIES.has(legacyStrategy)) return c.json({ error: 'strategy must be fit, bridge, or challenge' }, 400)
  const thread = await resolveThread(c.env.DB, body.thread_id)
  if (!thread) return c.json({ error: 'learning_thread_required' }, 409)
  const branchValidation = await validateCandidateBranches(c.env.DB, validated.candidates)
  if (branchValidation.error) return c.json(branchValidation, branchValidation.error === 'candidate_branch_pruned' ? 409 : 422)
  await currentPick(c.env.DB)
  const queuedCount = await activeQueueCount(c.env.DB)
  if (queuedCount >= QUEUE_CAP) return c.json({ error: 'queue_full', active_count: queuedCount, cap: QUEUE_CAP }, 409)
  const mode = await engineMode(c.env.DB)
  const decisions = await scoreCandidateSet(c.env.DB, validated.candidates.map((candidate: any) => ({ ...candidate, allow_books: body.allow_books === true })), thread, legacyStrategy)
  let selected = mode === 'v2' ? decisions.v2 : decisions.v1
  if (decisions.explorationPick) {
    // Re-derive the exploration winner from the served engine's own scoring so its
    // score/uncertainty stay consistent with what is actually being served.
    const forced = selected.scored.find((entry) => entry.index === decisions.explorationPick!.index)
    if (forced) { selected = candidateDecision(selected.scored, selected.engine, forced); decisions.exploration.served = true }
  }
  const winner = selected.winner
  if (!winner) return c.json({ error: 'candidate_set_not_usable' }, 400)
  const strategy = (decisions.exploration.served || mode === 'v2') ? winner.lane : legacyStrategy
  const requestId = String(body.request_id || crypto.randomUUID())
  const pickId = `pick_${crypto.randomUUID()}`
  const status = selected.confident ? 'ready' : 'abstained'
  const calibrationSamples = [...(decisions.context.laneEvidence?.values() || [])].reduce((sum, value) => sum + Number(value || 0), 0)
  const shadow = { mode, v1: decisionReadModel(decisions.v1), v2: decisionReadModel(decisions.v2), frontier: decisions.frontier.map((entry: any) => ({ index: entry.index, title: entry.item.title, score: entry.frontierScore, mechanism_match: entry.mechanismMatch, topic_distance: Math.round((1 - Number(entry.features._topic_affinity || 0)) * 1000) / 1000 })), exploration: decisions.exploration, coverage: decisions.coverage, disagreement: decisions.v1.winner?.index !== decisions.v2.winner?.index }
  let recommendationId: string | null = null
  if (selected.confident) {
    const capture = await createInboxCapture(c.env.DB, { source: urlOf(winner.item), title: String(winner.item.title) })
    recommendationId = capture.id
    const firstEvidence = Array.isArray(winner.item.evidence) ? winner.item.evidence[0]?.claim : winner.item.evidence
    const rationaleText = winner.item.why_this || (typeof firstEvidence === 'string' ? firstEvidence : null)
    await c.env.DB.prepare(`UPDATE recommendations SET creator=?,content_type=?,why_this=?,context_brief=? WHERE id=?`).bind(winner.item.creator || null, winner.item.format || winner.item.source_class || null, rationaleText, winner.item.context_brief || null, recommendationId).run()
    await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='compass_pick',branch_id=COALESCE(?,branch_id),source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),updated_at=datetime('now') WHERE recommendation_id=?`).bind(winner.item.branch_id || null, JSON.stringify({ compass_pick_id: pickId, intent, strategy, lane: winner.lane, engine_version: selected.engine, objective_version: LEARNING_OBJECTIVE_VERSION, thread_id: thread.id }), recommendationId).run()
    await c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,source_class,format,creator,branch_id,predicted_score,predicted_confidence,predicted_components_json,outcome_status,outcome_origin,training_eligible,objective_version,format_key,creator_key)
      VALUES (?,?,?,?,?,?,?,?,?,'active','compass_prediction',0,?,?,?) ON CONFLICT(recommendation_id) DO UPDATE SET predicted_score=excluded.predicted_score,predicted_confidence=excluded.predicted_confidence,predicted_components_json=excluded.predicted_components_json,outcome_origin='compass_prediction',objective_version=excluded.objective_version,format_key=excluded.format_key,creator_key=excluded.creator_key,evaluated_at=datetime('now')`).bind(
        `outcome_${recommendationId}`, recommendationId, winner.item.source_class || null, winner.item.format || null, winner.item.creator || null, winner.item.branch_id || null,
        winner.expectedLearningValue, selected.confidence, JSON.stringify(winner.features), LEARNING_OBJECTIVE_VERSION,
        canonicalFormat(winner.item.format || winner.item.source_class), canonicalCreatorKey(winner.item.creator),
      ).run()
  }
  const rationale = {
    intent, why_this: winner.item.why_this || '', context_brief: winner.item.context_brief || '', why_now: winner.item.why_now || '',
    expected_learning: winner.item.expected_learning || winner.item.expected_contribution || '', cost: winner.item.cost || null,
    lane: winner.lane, score: winner.score, expected_learning_value: winner.expectedLearningValue, exploration_bonus: winner.explorationBonus, candidate_set_diversity: winner.diversity,
    confidence: selected.confidence, confidence_status: calibrationSamples >= 20 ? 'empirical' : 'insufficient_evidence', uncertainty: winner.uncertainty,
    score_breakdown: winner.features, source_check: winner.sourceCheck, reviewable_weak_pick: selected.reviewableWeakPick,
    abstention_reason: selected.confident ? null : selected.abstentionReason,
    exclusions: selected.scored.filter((entry) => entry.features._hard_excluded).map((entry) => ({ title: entry.item.title, reason: entry.features._exclusion_reason })),
  }
  await c.env.DB.prepare(`INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count,search_rounds,stop_reason,confidence,margin,rationale_json,thread_id,engine_version,objective_version,expected_learning_value,decision_confidence,shadow_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      pickId, requestId, strategy, status, recommendationId, selected.scored.length, selected.scored.length > 3 ? 2 : 1,
      selected.confident ? 'winner_confident' : selected.abstentionReason, selected.confidence, selected.margin, JSON.stringify(rationale), thread.id,
      selected.engine, LEARNING_OBJECTIVE_VERSION, winner.expectedLearningValue, selected.confidence, JSON.stringify(shadow),
    ).run()
  for (const entry of decisions.v2.scored) {
    await c.env.DB.prepare(`INSERT INTO compass_candidates (id,pick_id,canonical_url,title,creator,format,source_class,context_brief,features_json,evidence_json,score,uncertainty,is_verified,is_winner,lane,branch_id,format_key,creator_key,expected_learning_value,decision_score,evidence_status,contextual_alignment,candidate_set_diversity)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        `cc_${crypto.randomUUID()}`, pickId, urlOf(entry.item), String(entry.item.title), entry.item.creator || null, entry.item.format || null,
        entry.item.source_class || null, entry.item.context_brief || null, JSON.stringify(entry.features), JSON.stringify({
          evidence: entry.item.evidence || entry.item.rationale || {},
          editorial_review: entry.item.editorial_review || null,
          // Preserve the scoring context across bounded research expansion.
          // Without this, a rescore silently discarded the Thread contribution
          // and concept metadata that informed the original comparison.
          candidate_context: {
            topic: entry.item.topic, topics: entry.item.topics, branch: entry.item.branch,
            summary: entry.item.summary, concepts: entry.item.concepts, mechanism: entry.item.mechanism,
            mechanisms: entry.item.mechanisms, expected_contribution: entry.item.expected_contribution,
            expected_learning: entry.item.expected_learning, evidence_type: entry.item.evidence_type,
            expected_evidence_type: entry.item.expected_evidence_type, evidence_types: entry.item.evidence_types,
            duration_minutes: entry.item.duration_minutes, duration: entry.item.duration,
            paywalled: entry.item.paywalled, why_this: entry.item.why_this, why_now: entry.item.why_now, cost: entry.item.cost,
          },
        }),
        entry.score, entry.uncertainty, entry.features._valid_url && entry.features._has_identity && !['invalid','unavailable'].includes(entry.sourceCheck.status) ? 1 : 0,
        entry.index === winner.index ? 1 : 0, entry.lane, entry.item.branch_id || null, canonicalFormat(entry.item.format || entry.item.source_class),
        canonicalCreatorKey(entry.item.creator), entry.expectedLearningValue, entry.score, structuredEvidenceStatus(entry.item.evidence || entry.item.rationale || entry.item.why_this),
        Number(entry.features.contextual_alignment || 0), entry.diversity,
      ).run()
  }
  return c.json({
    ok: true, status, strength: selected.confident ? 'strong' : selected.reviewableWeakPick ? 'weak_review' : 'withheld', strategy, lane: winner.lane,
    engine_version: selected.engine, objective_version: LEARNING_OBJECTIVE_VERSION, engine_mode: mode, thread_id: thread.id,
    reviewable_weak_pick: selected.reviewableWeakPick, pick_id: pickId, recommendation_id: recommendationId,
    candidate_count: selected.scored.length, eligible_count: selected.eligible.length, active_queue_count: queuedCount, queue_cap: QUEUE_CAP,
    score: winner.score, expected_learning_value: winner.expectedLearningValue, confidence: selected.confidence,
    confidence_status: calibrationSamples >= 20 ? 'empirical' : 'insufficient_evidence', margin: selected.margin, source_check: winner.sourceCheck.status,
    abstention_reason: selected.confident ? null : selected.abstentionReason, shadow,
    search_guidance: selected.confident ? null : { expand_to: 8, needs: ['independent source angle', 'structured evidence', 'clear Thread contribution'] },
  })
}

app.post('/evaluate', async (c) => {
  try {
    const body = await c.req.json<any>()
    const validated = validateCandidates(body)
    if (validated.error) return c.json({ error: validated.error }, 400)
    const intent = String(body.intent || '').trim()
    if (!REQUEST_INTENTS.has(intent)) return c.json({ error: 'intent must be solve_problem, build_skill, deepen_thread, discover, or queue_fill' }, 400)
    const thread = await resolveThread(c.env.DB, body.thread_id)
    if (!thread) return c.json({ error: 'learning_thread_required' }, 409)
    const requestedStrategy = body.strategy ? String(body.strategy) : ''
    const strategy = STRATEGIES.has(requestedStrategy) ? requestedStrategy : DEFAULT_COMPASS_STRATEGY
    const scored = await scoreCandidateSet(c.env.DB, validated.candidates.map((candidate: any) => ({ ...candidate, allow_books: body.allow_books === true })), thread, strategy)
    return c.json({ ok: true, dry_run: true, mode: await engineMode(c.env.DB), thread_id: thread.id, objective_version: LEARNING_OBJECTIVE_VERSION, v1: decisionReadModel(scored.v1), v2: decisionReadModel(scored.v2), frontier_shadow: scored.frontier.map((entry: any) => ({ title: entry.item.title, score: entry.frontierScore, mechanism_match: entry.mechanismMatch, topic_distance: Math.round((1 - Number(entry.features._topic_affinity || 0)) * 1000) / 1000 })), exploration_shadow: scored.exploration })
  } catch (err) { return c.json(safeError('Failed to evaluate Compass candidates')(err), 500) }
})

/** Hermes submits 3-8 candidates; the Worker owns scoring, selection, and abstention. */
app.post('/picks', async (c) => {
  try {
    return await createCompassPickV2(c, await c.req.json<any>())
  } catch (err) { return c.json(safeError('Failed to create Compass Pick')(err), 500) }
})
// Expand a weak pick with additional research candidates, then rescore the full set.
app.post('/pick/:id/candidates', async (c) => {
  try {
    const pick = await c.env.DB.prepare(`SELECT * FROM compass_picks WHERE id=? AND status='abstained'`).bind(c.req.param('id')).first<any>()
    if (!pick) return c.json({ error: 'expandable weak Compass Pick not found' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const additions = Array.isArray(body.candidates) ? body.candidates : []
    const existing = (await c.env.DB.prepare(`SELECT canonical_url,title,creator,format,source_class,context_brief,evidence_json,lane,branch_id FROM compass_candidates WHERE pick_id=? ORDER BY created_at`).bind(pick.id).all<any>()).results || []
    if (!additions.length || existing.length + additions.length > 24) return c.json({ error: 'expansion must add at least one candidate and keep the total at 24 or fewer' }, 400)
    const candidates = existing.map((item: any) => {
      let stored: any = {}
      try { stored = JSON.parse(item.evidence_json || '{}') } catch {}
      const enveloped = stored && typeof stored === 'object' && 'evidence' in stored
      return {
        ...(enveloped && stored.candidate_context && typeof stored.candidate_context === 'object' ? stored.candidate_context : {}),
        canonical_url: item.canonical_url, title: item.title, creator: item.creator, format: item.format, source_class: item.source_class,
        context_brief: item.context_brief, lane: item.lane, branch_id: item.branch_id,
        evidence: enveloped ? stored.evidence : stored, editorial_review: enveloped ? stored.editorial_review : null,
      }
    }).concat(additions)
    await c.env.DB.prepare(`UPDATE compass_picks SET status='replaced',resolved_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(pick.id).run()
    let originalRationale: any = {}
    try { originalRationale = JSON.parse(pick.rationale_json || '{}') } catch {}
    const response = await app.fetch(new Request(new URL('/picks', c.req.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_id: `${pick.request_id}:expanded:${Date.now()}`, strategy: pick.strategy, intent: originalRationale.intent, thread_id: pick.thread_id, objective_version: LEARNING_OBJECTIVE_VERSION, allow_books: body.allow_books === true, candidates }) }), c.env)
    if (!response.ok) await c.env.DB.prepare(`UPDATE compass_picks SET status='abstained',resolved_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(pick.id).run()
    const result = await response.json()
    return c.json({ ...(result as any), expanded_from: pick.id, search_round: Number(pick.search_rounds || 1) + 1 }, response.status as any)
  } catch (err) { return c.json(safeError('Failed to expand Compass Pick')(err), 500) }
})

app.post('/pick/:id/start', async (c) => {
  try {
    const pick = await c.env.DB.prepare(`SELECT * FROM compass_picks WHERE id=? AND status IN ('ready','abstained')`).bind(c.req.param('id')).first<any>()
    if (!pick) return c.json({ error: 'Compass Pick not found' }, 404)
    const queuedCount = await activeQueueCount(c.env.DB)
    if (queuedCount >= QUEUE_CAP) return c.json({ error: 'queue capacity reached', active_count: queuedCount, cap: QUEUE_CAP }, 409)
    const thread = await resolveThread(c.env.DB, pick.thread_id)
    if (!thread) return c.json({ error: 'learning_thread_required' }, 409)
    const coverageConflict = await storedPickCoverageConflict(c.env.DB, pick.id)
    if (coverageConflict) {
      await c.env.DB.prepare(`UPDATE compass_picks SET status='replaced',stop_reason='covered_by_learning_thread',resolved_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(pick.id).run()
      return c.json({ error: 'covered_by_learning_thread', message: `This topic is already owned by ${coverageConflict.threadTitle}.`, match: coverageConflict }, 409)
    }
    let recommendationId = pick.recommendation_id as string | null
    if (!recommendationId) {
      const winner = await c.env.DB.prepare(`SELECT * FROM compass_candidates WHERE pick_id=? AND is_winner=1`).bind(pick.id).first<any>()
      if (!weakPickSourceIsQueueable(winner)) return c.json({ error: 'This pick cannot be added because its source is not safe to queue.' }, 409)
      const capture = await createInboxCapture(c.env.DB, { source: winner.canonical_url, title: winner.title })
      if (capture.status !== 'active') return c.json({ error: 'This source is no longer eligible for the Queue.' }, 409)
      recommendationId = capture.id
      const rationale = JSON.parse(pick.rationale_json || '{}')
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE recommendations SET creator=?,content_type=?,why_this=?,context_brief=?,updated_at=datetime('now') WHERE id=?`).bind(winner.creator || null, winner.format || winner.source_class || null, rationale.why_this || null, winner.context_brief || null, recommendationId),
        c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='compass_pick',branch_id=COALESCE(?,branch_id),source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),updated_at=datetime('now') WHERE recommendation_id=?`).bind(winner.branch_id || null, JSON.stringify({ compass_pick_id: pick.id, strategy: pick.strategy, lane: winner.lane, engine_version: pick.engine_version, objective_version: pick.objective_version, thread_id: thread.id, accepted_weak_pick: true }), recommendationId),
        c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,source_class,format,creator,branch_id,predicted_score,predicted_confidence,predicted_components_json,outcome_status,outcome_origin,training_eligible,objective_version,format_key,creator_key) VALUES (?,?,?,?,?,?,?,?,?,'active','compass_prediction',0,?,?,?) ON CONFLICT(recommendation_id) DO UPDATE SET predicted_score=excluded.predicted_score,predicted_confidence=excluded.predicted_confidence,predicted_components_json=excluded.predicted_components_json,outcome_origin='compass_prediction',objective_version=excluded.objective_version,format_key=excluded.format_key,creator_key=excluded.creator_key,evaluated_at=datetime('now')`).bind(`outcome_${recommendationId}`, recommendationId, winner.source_class || null, winner.format || null, winner.creator || null, winner.branch_id || null, Number(winner.expected_learning_value ?? winner.score), Number(pick.decision_confidence ?? pick.confidence ?? 0), winner.features_json || '{}', pick.objective_version || LEARNING_OBJECTIVE_VERSION, winner.format_key || canonicalFormat(winner.format || winner.source_class), winner.creator_key || canonicalCreatorKey(winner.creator)),
        c.env.DB.prepare(`UPDATE compass_picks SET recommendation_id=?,updated_at=datetime('now') WHERE id=?`).bind(recommendationId, pick.id),
      ])
    }
    const sessionId = `session_${crypto.randomUUID()}`
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE compass_picks SET status='started',updated_at=datetime('now') WHERE id=? AND status='ready'`).bind(pick.id),
      c.env.DB.prepare(`UPDATE compass_picks SET status='started',updated_at=datetime('now') WHERE id=? AND status='abstained'`).bind(pick.id),
      c.env.DB.prepare(`UPDATE recommendations SET status='active',updated_at=datetime('now') WHERE id=?`).bind(recommendationId),
      c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='queued',updated_at=datetime('now') WHERE recommendation_id=?`).bind(recommendationId),
      c.env.DB.prepare(`INSERT INTO thread_sources (thread_id,recommendation_id,role,status) VALUES (?,?,'primary','active') ON CONFLICT(thread_id,recommendation_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(thread.id, recommendationId),
      c.env.DB.prepare(`INSERT INTO learning_sessions (id,recommendation_id,status,intent,thread_id,target_kind,started_at) VALUES (?,?, 'active', ?,?,'original',datetime('now'))`).bind(sessionId, recommendationId, 'Compass Pick', thread.id),
    ])
    await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-start:${pick.id}`, eventType: 'recommendation_started', recommendationId, threadId: thread.id, pickId: pick.id, signalScope: 'none', explicit: true, origin: 'compass_feedback', payload: { lane: pick.strategy } })
    return c.json({ ok: true, pick_id: pick.id, recommendation_id: recommendationId, session_id: sessionId, thread_id: thread.id })
  } catch (err) { return c.json(safeError('Failed to start Compass Pick')(err), 500) }
})

app.post('/pick/:id/feedback', async (c) => {
  try {
    const body = await c.req.json<any>()
    const pick = await c.env.DB.prepare(`SELECT * FROM compass_picks WHERE id=? AND status IN ('ready','started','abstained')`).bind(c.req.param('id')).first<any>()
    if (!pick) return c.json({ error: 'active Compass Pick not found' }, 404)
    const requestedOutcome = String(body.outcome || 'declined')
    if (!['started','completed','dismissed','declined','abandoned'].includes(requestedOutcome)) return c.json({ error: 'invalid outcome' }, 400)
    const submittedReasons = Array.isArray(body.reason_tags) ? body.reason_tags.filter(Boolean) : body.reason_code ? [body.reason_code] : []
    if (requestedOutcome === 'declined' && submittedReasons.length === 0) return c.json({ error: 'bad_fit_reason_required' }, 400)
    const classified = classifyRecommendationFeedback(requestedOutcome, submittedReasons)
    const outcome = classified.normalizedOutcome
    const reasonTags = classified.reasonCodes
    const rating = normalizeRating(body.score)
    const reflection = String(body.reflection || '').trim().slice(0, 10000)
    const nextStatus = outcome === 'completed' ? 'resolved' : outcome === 'declined' || outcome === 'dismissed' ? 'declined' : outcome === 'abandoned' ? 'resolved' : 'started'
    const completed = outcome === 'completed'
    const excluded = outcome === 'declined' || outcome === 'abandoned'
    const dismissed = outcome === 'dismissed'
    const feedbackJobId = reflection || rating.score !== null || classified.signalScope === 'eligibility' ? `job_${crypto.randomUUID()}` : null
    // Exposure context: the position the pick held in its candidate set and the
    // engine that served it. Used by the learning loop to discount position bias
    // and by the shadow evaluation to weight feedback by exposure.
    const exposure = { position: Number(body.position ?? null), candidate_count: Number(body.candidate_count ?? null), engine: pick.engine_version || 'v1', lane: pick.strategy || null, thread_id: pick.thread_id || null }
    const reflectionNote = reflection && pick.recommendation_id
      ? await c.env.DB.prepare(`SELECT id,revision FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`).bind(pick.recommendation_id).first<{ id: string; revision: number }>()
      : null
    const reflectionNoteId = reflection && pick.recommendation_id ? reflectionNote?.id || `reflection_${pick.recommendation_id}` : null
    const rejectionReason = excluded ? reasonTags[0] || (outcome === 'abandoned' ? 'abandoned' : 'declined') : null
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`INSERT INTO compass_feedback (id,pick_id,recommendation_id,outcome,score,reason_tags_json,reflection,exposure_json) VALUES (?,?,?,?,?,?,?,?)`).bind(`cf_${crypto.randomUUID()}`, pick.id, pick.recommendation_id, outcome === 'dismissed' ? 'declined' : outcome, rating.score, JSON.stringify(reasonTags), body.reflection || null, JSON.stringify(exposure)),
      c.env.DB.prepare(`UPDATE compass_picks SET status=?,updated_at=datetime('now'),resolved_at=CASE WHEN ? IN ('resolved','declined') THEN datetime('now') ELSE resolved_at END WHERE id=?`).bind(nextStatus, nextStatus, pick.id),
    ]
    if (pick.recommendation_id) {
      statements.push(
        c.env.DB.prepare(`UPDATE recommendations SET status=CASE WHEN ? THEN 'consumed' WHEN ? THEN 'rejected' ELSE status END,consumed_date=CASE WHEN ? THEN COALESCE(consumed_date,date('now')) ELSE consumed_date END,user_rating=COALESCE(?,user_rating),user_score=COALESCE(?,user_score),user_review=COALESCE(NULLIF(?,''),user_review),updated_at=datetime('now') WHERE id=?`).bind(completed ? 1 : 0, excluded ? 1 : 0, completed ? 1 : 0, rating.rating, rating.score, reflection, pick.recommendation_id),
        c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,last_opened_at,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,last_opened_at=datetime('now'),updated_at=datetime('now')`).bind(pick.recommendation_id, completed ? 'completed' : excluded ? 'excluded' : dismissed ? 'inbox' : 'queued', completed ? 100 : 0, new Date().toISOString()),
        c.env.DB.prepare(`UPDATE learning_sessions SET status=CASE WHEN ? THEN 'completed' ELSE 'returned' END,returned_at=datetime('now'),completed_at=CASE WHEN ? THEN COALESCE(completed_at,datetime('now')) ELSE completed_at END,reflection=COALESCE(NULLIF(?,''),reflection) WHERE recommendation_id=? AND status IN ('active','returned')`).bind(completed ? 1 : 0, completed ? 1 : 0, reflection, pick.recommendation_id),
        c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,actual_score,outcome_status,rejection_reason,consumed_at,evaluated_at,outcome_origin,training_eligible,objective_version) VALUES (?,?,?,?,?,CASE WHEN ? THEN date('now') ELSE NULL END,datetime('now'),'compass_feedback',0,?) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=excluded.actual_score,outcome_status=excluded.outcome_status,outcome_origin='compass_feedback',rejection_reason=COALESCE(excluded.rejection_reason,recommendation_outcomes.rejection_reason),consumed_at=COALESCE(recommendation_outcomes.consumed_at,excluded.consumed_at),evaluated_at=datetime('now')`).bind(`outcome_${pick.recommendation_id}`, pick.recommendation_id, rating.score, completed ? 'consumed' : excluded ? outcome === 'declined' ? 'rejected' : 'abandoned' : 'active', rejectionReason, completed ? 1 : 0, LEARNING_OBJECTIVE_VERSION),
      )
      if (dismissed) statements.push(c.env.DB.prepare(`UPDATE recommendation_meta SET source_metadata_json=json_set(COALESCE(source_metadata_json,'{}'),'$.resurface_at',datetime('now','+14 days'),'$.resurface_count',COALESCE(json_extract(source_metadata_json,'$.resurface_count'),0)+1),updated_at=datetime('now') WHERE recommendation_id=?`).bind(pick.recommendation_id))
      if (completed) statements.push(c.env.DB.prepare(`INSERT INTO learning_sessions (id,recommendation_id,status,intent,reflection,returned_at,completed_at) SELECT ?,?,'completed','Compass Pick',?,datetime('now'),datetime('now') WHERE NOT EXISTS (SELECT 1 FROM learning_sessions WHERE recommendation_id=?)`).bind(`session_${crypto.randomUUID()}`, pick.recommendation_id, reflection || null, pick.recommendation_id))
      if (rating.score !== null) statements.push(c.env.DB.prepare(`INSERT INTO rating_events (recommendation_id,rating,score,created_at) VALUES (?,?,?,datetime('now'))`).bind(pick.recommendation_id, rating.rating, rating.score))
    }
    if (reflection && reflectionNoteId && pick.recommendation_id) {
      if (reflectionNote) {
        statements.push(
          c.env.DB.prepare(`UPDATE notes SET revision=?,updated_at=datetime('now') WHERE id=?`).bind(Number(reflectionNote.revision || 0) + 1, reflectionNoteId),
          c.env.DB.prepare(`UPDATE note_sections SET content=?,updated_at=datetime('now') WHERE note_id=? AND section_key='reaction'`).bind(reflection, reflectionNoteId),
        )
      } else {
        statements.push(c.env.DB.prepare(`INSERT INTO notes (id,recommendation_id,title,kind,source_url,status,revision) SELECT ?,r.id,r.video_title,'reflection',r.video_url,'draft',1 FROM recommendations r WHERE r.id=?`).bind(reflectionNoteId, pick.recommendation_id))
        for (const [position, [sectionKey, label, content]] of [['reaction', 'Reaction', reflection], ['foundation', 'Foundation', ''], ['case_studies', 'Case Studies', ''], ['exploitation', 'Exploitation', ''], ['defense', 'Defense', '']].entries()) statements.push(c.env.DB.prepare(`INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,'auto',?)`).bind(`${reflectionNoteId}_${sectionKey}`, reflectionNoteId, sectionKey, label, content, position))
      }
    }
    const disposition = ['retain','apply','reference','drop','undecided'].includes(String(body.disposition || '').toLowerCase()) ? String(body.disposition).toLowerCase() : 'undecided'
    if (pick.recommendation_id && disposition !== 'undecided') statements.push(c.env.DB.prepare(`INSERT INTO source_learning_dispositions(recommendation_id,thread_id,disposition,reason) VALUES (?,?,?,?) ON CONFLICT(recommendation_id,thread_id) DO UPDATE SET disposition=excluded.disposition,reason=excluded.reason,updated_at=datetime('now')`).bind(pick.recommendation_id, pick.thread_id || null, disposition, reflection || reasonTags.join(',')))
    if (feedbackJobId && pick.recommendation_id) statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,recommendation_id,trigger_kind) VALUES (?,'process_feedback',?,?,?,'explicit_user_action') ON CONFLICT(idempotency_key) DO NOTHING`).bind(feedbackJobId, JSON.stringify({ recommendation_id: pick.recommendation_id, thread_id: pick.thread_id || null, note_id: reflectionNoteId, reflection: reflection || null, rating: rating.score, disposition, outcome, reason_tags: reasonTags, review_required: true, source: 'compass_pick', feedback_context_endpoint: '/feedback/context', feedback_context_scope: 'all_archived_feedback_profile_and_nodes' }), `compass-feedback:${pick.id}`, pick.recommendation_id))
    await c.env.DB.batch(statements)
    if (pick.recommendation_id) {
      await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-feedback:${pick.id}:${outcome}`, eventType: classified.eventType, recommendationId: pick.recommendation_id, threadId: pick.thread_id || null, pickId: pick.id, reasonCode: reasonTags[0] || null, signalScope: classified.signalScope, explicit: true, origin: 'compass_feedback', payload: { outcome, reason_tags: reasonTags, exposure } })
      if (rating.score !== null) await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-rating:${pick.id}`, eventType: 'rating_recorded', recommendationId: pick.recommendation_id, threadId: pick.thread_id || null, pickId: pick.id, signalScope: 'utility', signalValue: rating.score / 10, explicit: true, origin: 'compass_feedback', payload: { score: rating.score, exposure } })
      if (disposition !== 'undecided') await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-disposition:${pick.id}`, eventType: 'disposition_recorded', recommendationId: pick.recommendation_id, threadId: pick.thread_id || null, pickId: pick.id, signalScope: 'utility', explicit: true, origin: 'compass_feedback', payload: { disposition, exposure } })
      await refreshRecommendationOutcome(c.env.DB, pick.recommendation_id)
    }
    const learning = await learnFromOutcome(c.env.DB, pick, rating.score, outcome, reasonTags, exposure)
    // The typed Library source route preserves identity; the old Learn notes
    // query route was only a collection view and dropped the source context.
    return c.json({ ok: true, pick_id: pick.id, status: nextStatus, recommendation_state: completed ? 'completed' : excluded ? 'excluded' : dismissed ? 'inbox' : 'queued', disposition, reason_tags: reasonTags, feedback_job: feedbackJobId, learning_receipt: learning, source_page: pick.recommendation_id ? `/#/library/source/${encodeURIComponent(pick.recommendation_id)}?from=learn` : null })
  } catch (err) { return c.json(safeError('Failed to record Compass feedback')(err), 500) }
})

export default app
