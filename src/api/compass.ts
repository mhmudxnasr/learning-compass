import { Hono } from 'hono'
import { safeError, normalizeRating, type Bindings } from '../lib'
import { createInboxCapture } from '../services/capture'
import { canonicalizeUrl, decisionConfidence, DEFAULT_FEATURE_WEIGHTS, LEGACY_FEATURE_WEIGHTS, deriveCandidateFeatures, expectedLearningValue, laneExplorationBonus, pairwiseDominance, semanticSimilarity, serverScore, urlOf, type CompassContext, type SourceCheck } from '../compass-scoring'
import { buildLearningBalance } from '../services/learning-balance'
import { canonicalTasteIdentity } from './taste'
import { INTELLIGENCE_ENGINE_VERSION, LEARNING_OBJECTIVE_VERSION, canonicalCreatorKey, canonicalFormat, classifyRecommendationFeedback, normalizeCompassLane, structuredEvidenceStatus, type CompassLane } from '../intelligence-v2'
import { recordRecommendationSignal, refreshRecommendationOutcome } from '../services/intelligence-v2'

const app = new Hono<{ Bindings: Bindings }>()
const STRATEGIES = new Set(['fit', 'bridge', 'challenge'])
const QUEUE_CAP = 5
type ScoredCandidate = { item: any; index: number; lane: CompassLane; features: ReturnType<typeof deriveCandidateFeatures>; score: number; baseScore: number; expectedLearningValue: number; explorationBonus: number; dominance: number; uncertainty: number; sourceCheck: SourceCheck }
type PreparedCandidate = { item: any; index: number; lane: CompassLane; features: ReturnType<typeof deriveCandidateFeatures>; url: string; sourceCheck: SourceCheck }
type EngineMode = 'shadow' | 'v2'

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

const loadCompassContext = async (DB: D1Database, thread: any = null): Promise<CompassContext> => {
  const [history, mastered, blacklist, trust, vectors, priorities, formats, recent, weights, balance, assertions, laneEvidence] = await Promise.all([
    DB.prepare(`SELECT video_url,video_title,creator,status FROM recommendations WHERE status IN ('consumed','active','rejected') LIMIT 2000`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT label,author FROM mastered`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT name,work FROM blacklist`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT creator_key creator,COUNT(*) sample_count,AVG(taste_value*10) average_score,MAX(COALESCE(consumed_at,evaluated_at)) last_feedback_at FROM recommendation_outcomes WHERE creator_key IS NOT NULL AND training_eligible=1 AND taste_value IS NOT NULL GROUP BY creator_key`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT topic,affinity_score FROM taste_vectors`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT COALESCE(label,branch_id) topic FROM priorities ORDER BY rank`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT format_key format,COUNT(*) sample_count,AVG(taste_value*10) average_score FROM recommendation_outcomes WHERE format_key IS NOT NULL AND training_eligible=1 AND taste_value IS NOT NULL GROUP BY format_key`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT format_key format FROM recommendation_outcomes WHERE outcome_status='consumed' AND format_key IS NOT NULL ORDER BY COALESCE(consumed_at,evaluated_at) DESC LIMIT 5`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT strategy,dimension,current_weight FROM compass_feature_weights`).all<any>().catch(() => ({ results: [] })),
    buildLearningBalance(DB, 90).catch(() => null),
    DB.prepare(`SELECT assertion_key,category,value_json,weight,confidence,status FROM profile_assertions WHERE status='active' AND confidence>=.8`).all<any>().catch(() => ({ results: [] })),
    DB.prepare(`SELECT p.strategy,COUNT(DISTINCT o.recommendation_id) count FROM compass_picks p JOIN recommendation_outcomes o ON o.recommendation_id=p.recommendation_id WHERE o.training_eligible=1 GROUP BY p.strategy`).all<any>().catch(() => ({ results: [] })),
  ])
  const assertionRows = assertions.results || []
  const assertionValues = assertionRows.map((row: any) => { try { return { ...row, parsed: JSON.parse(row.value_json) } } catch { return { ...row, parsed: row.value_json } } })
  const assertionBlocked = assertionValues.filter((row: any) => ['blacklist','hard_rule','exclusion'].includes(String(row.category))).flatMap((row: any) => {
    const value = row.parsed
    return typeof value === 'string' ? [value] : [value?.name, value?.work, value?.creator, value?.topic, value?.label, value?.target].filter(Boolean)
  })
  const terms = [...(mastered.results || []), ...(blacklist.results || []), ...assertionBlocked.map((name) => ({ name }))]
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
  for (const row of vectors.results || []) topicAffinities.set(canonicalTasteIdentity(row.topic), Number(row.affinity_score))
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
  }
}

async function chooseStrategy(DB: D1Database) {
  const rows = (await DB.prepare(`SELECT strategy,alpha,beta,explicit_evidence_count FROM compass_strategy_priors`).all<any>().catch(() => ({ results: [] }))).results || []
  const byStrategy = new Map(rows.map((row: any) => [String(row.strategy), row]))
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.explicit_evidence_count || 0), 0)
  const candidates = ['fit', 'bridge', 'challenge']
  if (total % 5 < 2) {
    return candidates.slice(1).sort((a, b) => Number(byStrategy.get(a)?.explicit_evidence_count || 0) - Number(byStrategy.get(b)?.explicit_evidence_count || 0))[0]
  }
  return candidates.sort((a, b) => {
    const left = byStrategy.get(a) || { alpha: 1, beta: 1, explicit_evidence_count: 0 }
    const right = byStrategy.get(b) || { alpha: 1, beta: 1, explicit_evidence_count: 0 }
    const score = (strategy: string, row: any) => Number(row.alpha) / (Number(row.alpha) + Number(row.beta)) + .35 * Math.sqrt(Math.log(total + 2) / (Number(row.explicit_evidence_count || 0) + 1)) + (strategy === 'fit' ? 0 : .04)
    return score(b, right) - score(a, left)
  })[0]
}

async function engineMode(DB: D1Database): Promise<EngineMode> {
  const setting = await DB.prepare(`SELECT value_json FROM user_settings WHERE setting_key='recommendation_engine'`).first<any>().catch(() => null)
  try { return JSON.parse(setting?.value_json || '{}').mode === 'v2' ? 'v2' : 'shadow' } catch { return 'shadow' }
}

async function resolveThread(DB: D1Database, requestedId?: unknown) {
  if (requestedId) return DB.prepare(`SELECT * FROM learning_threads WHERE id=? AND status NOT IN ('verified','abandoned')`).bind(String(requestedId)).first<any>()
  return DB.prepare(`SELECT * FROM learning_threads WHERE status='active' ORDER BY priority DESC,updated_at DESC LIMIT 1`).first<any>()
}

function candidateDecision(scored: ScoredCandidate[], engine: 'v1' | 'v2') {
  const eligible = scored.filter((entry) => entry.features._valid_url && entry.features._has_identity && !entry.features._hard_excluded)
  const ranked = eligible.length ? eligible : scored
  const winner = ranked[0]
  const second = ranked[1]
  const margin = second && winner ? winner.score - second.score : 0
  const evidenceStatus = winner ? String(winner.features._evidence_status || 'missing') : 'missing'
  const verified = Boolean(winner && winner.features._valid_url && winner.features._has_identity &&
    (engine === 'v2' ? evidenceStatus === 'structured' : ['structured','legacy'].includes(evidenceStatus)) &&
    !['invalid','unavailable'].includes(winner.sourceCheck.status))
  const confidence = winner ? decisionConfidence(winner.score, winner.uncertainty, margin, winner.dominance) : 0
  const weak = eligible.length < 2 || !winner
  const confident = Boolean(!weak && verified && winner.score >= .68 && confidence >= .67)
  const abstentionReason = !eligible.length ? 'all_candidates_ineligible'
    : eligible.length < 2 ? 'not_enough_eligible_candidates'
      : !verified ? engine === 'v2' && evidenceStatus !== 'structured' ? 'structured_evidence_required' : 'winner_not_verifiable'
        : Number(winner?.score || 0) < .68 ? 'winner_below_score_threshold'
          : confidence < .67 ? 'insufficient_decision_confidence' : 'candidate_set_not_usable'
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
  const build = (version: 'v1' | 'v2') => prepared.map(({ item, index, lane, features, sourceCheck }) => {
    const scoringLane = version === 'v2' ? lane : legacyStrategy as CompassLane
    const weights = version === 'v2' ? context.featureWeights?.get(scoringLane) || DEFAULT_FEATURE_WEIGHTS[scoringLane] : LEGACY_FEATURE_WEIGHTS[scoringLane]
    const baseScore = serverScore(features, scoringLane, weights)
    const dominance = pairwiseDominance(features, eligibleFeatures)
    const explorationBonus = version === 'v2' ? laneExplorationBonus(lane, context.laneEvidence) : 0
    const score = Math.max(0, Math.min(1, baseScore * .90 + dominance * .10 + explorationBonus))
    const uncertainty = Math.max(0, Math.min(1, .50 - Number(features.evidence_quality) * .20 + (sourceCheck.status === 'unknown' ? .14 : 0) + (features._hard_excluded ? .30 : 0) + (context.thread ? 0 : .15)))
    return { item, index, lane, features, score, baseScore, expectedLearningValue: expectedLearningValue(features, lane, weights), explorationBonus, dominance, uncertainty, sourceCheck }
  }).sort((a, b) => b.score - a.score)
  const v1 = candidateDecision(build('v1'), 'v1')
  const v2 = candidateDecision(build('v2'), 'v2')
  return { context, v1, v2 }
}

async function learnFromOutcome(DB: D1Database, pick: any, score: number | null, outcome: string, reasonTags: string[]) {
  if (outcome === 'dismissed' || reasonTags.includes('not_now')) return { skipped: 'neutral_signal' }
  const recommendationOutcome = pick.recommendation_id
    ? await DB.prepare(`SELECT predicted_components_json,learning_value,training_eligible FROM recommendation_outcomes WHERE recommendation_id=?`).bind(pick.recommendation_id).first<any>()
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
  const raw = rows.map((row: any) => {
    const component = Number(components[row.dimension] ?? .5)
    const signal = Math.max(-.01, Math.min(.01, (reward - .5) * (component - .5) * .03 + Number(adjustments[row.dimension] || 0)))
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
    history.push({ reward, outcome, reason_tags: reasonTags, at: new Date().toISOString() })
    statements.push(DB.prepare(`UPDATE compass_feature_weights SET current_weight=?,evidence_count=evidence_count+1,audit_history_json=?,updated_at=datetime('now') WHERE strategy=? AND dimension=?`).bind(next, JSON.stringify(history.slice(-20)), pick.strategy, row.dimension))
  }
  statements.push(DB.prepare(`INSERT INTO compass_strategy_priors(strategy,alpha,beta,explicit_evidence_count,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(strategy) DO UPDATE SET alpha=compass_strategy_priors.alpha+?,beta=compass_strategy_priors.beta+?,explicit_evidence_count=compass_strategy_priors.explicit_evidence_count+1,updated_at=datetime('now')`).bind(pick.strategy, reward >= .6 ? 1 : 0, reward < .6 ? 1 : 0, 1, reward >= .6 ? 1 : 0, reward < .6 ? 1 : 0))
  statements.push(DB.prepare(`INSERT INTO compass_learning_receipts(id,pick_id,strategy,reward,reason_tags_json,before_json,after_json) VALUES (?,?,?,?,?,?,?)`).bind(`clr_${crypto.randomUUID()}`, pick.id, pick.strategy, reward, JSON.stringify(reasonTags), JSON.stringify(before), JSON.stringify(after)))
  await DB.batch(statements)
  return { reward, before, after }
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
  return DB.prepare(`
    SELECT p.*, COALESCE(r.video_title,w.title) AS video_title, COALESCE(r.creator,w.creator) AS creator,
      COALESCE(r.content_type,w.format,w.source_class) AS content_type, COALESCE(r.video_url,w.canonical_url) AS video_url,
      COALESCE(r.why_this,json_extract(p.rationale_json,'$.why_this')) AS why_this,
      COALESCE(r.context_brief,json_extract(p.rationale_json,'$.context_brief')) AS context_brief
    FROM compass_picks p
    LEFT JOIN recommendations r ON r.id=p.recommendation_id
    LEFT JOIN compass_candidates w ON w.pick_id=p.id AND w.is_winner=1
    WHERE p.status IN ('ready','started','abstained') AND (r.id IS NULL OR r.status NOT IN ('consumed','rejected'))
    ORDER BY p.created_at DESC LIMIT 1
  `).first<any>()
}

async function activeQueueCount(DB: D1Database) {
  const row = await DB.prepare(`SELECT COUNT(*) c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<{ c: number }>()
  return Number(row?.c || 0)
}

app.get('/pick', async (c) => {
  try {
    const pick = await currentPick(c.env.DB)
    if (!pick) return c.json({ pick: null })
    const candidates = await c.env.DB.prepare(`SELECT id,title,creator,format,source_class,lane,branch_id,format_key,creator_key,expected_learning_value,decision_score,score,uncertainty,evidence_status,is_verified,is_winner FROM compass_candidates WHERE pick_id=? ORDER BY decision_score DESC,score DESC`).bind(pick.id).all<any>()
    return c.json({ pick: { ...pick, rationale: JSON.parse(pick.rationale_json || '{}'), shadow: JSON.parse(pick.shadow_json || '{}'), candidates: candidates.results || [] } })
  } catch (err) { return c.json(safeError('Failed to read Compass Pick')(err), 500) }
})

function validateCandidates(body: any): { candidates: any[]; error?: string } {
  const candidates = (Array.isArray(body.candidates) ? body.candidates : []).map((item: any) => item && typeof item === 'object' && item.context_brief != null ? { ...item, context_brief: String(item.context_brief) } : item)
  if (candidates.length < 3 || candidates.length > 8) return { error: 'adaptive search accepts 3 to 8 candidates', candidates }
  const hasExplicitLanes = candidates.some((item: any) => item?.lane != null)
  const initialLanes = new Set(candidates.slice(0, 3).map((item: any, index: number) => normalizeCompassLane(item?.lane, index)))
  if (hasExplicitLanes && initialLanes.size !== 3) return { error: 'the first three candidates must cover fit, bridge, and challenge lanes', candidates }
  return { candidates }
}

const decisionReadModel = (decision: ReturnType<typeof candidateDecision>) => ({
  engine: decision.engine,
  winner_index: decision.winner?.index ?? null,
  winner_title: decision.winner?.item?.title || null,
  lane: decision.winner?.lane || null,
  score: decision.winner?.score || 0,
  expected_learning_value: decision.winner?.expectedLearningValue || 0,
  confidence: decision.confidence,
  margin: decision.margin,
  eligible_count: decision.eligible.length,
  strong: decision.confident,
  evidence_status: decision.winner?.features?._evidence_status || 'missing',
  source_status: decision.winner?.sourceCheck?.status || 'unknown',
  abstention_reason: decision.confident ? null : decision.abstentionReason,
})

async function createCompassPickV2(c: any, body: any) {
  const validated = validateCandidates(body)
  if (validated.error) return c.json({ error: validated.error }, 400)
  const requestedStrategy = body.strategy ? String(body.strategy) : ''
  const legacyStrategy = requestedStrategy || await chooseStrategy(c.env.DB)
  if (!STRATEGIES.has(legacyStrategy)) return c.json({ error: 'strategy must be fit, bridge, or challenge' }, 400)
  const thread = await resolveThread(c.env.DB, body.thread_id)
  if (!thread) return c.json({ error: 'learning_thread_required' }, 409)
  await currentPick(c.env.DB)
  const queuedCount = await activeQueueCount(c.env.DB)
  if (queuedCount >= QUEUE_CAP) return c.json({ error: 'queue_full', active_count: queuedCount, cap: QUEUE_CAP }, 409)
  const mode = await engineMode(c.env.DB)
  const decisions = await scoreCandidateSet(c.env.DB, validated.candidates, thread, legacyStrategy)
  const selected = mode === 'v2' ? decisions.v2 : decisions.v1
  const winner = selected.winner
  if (!winner) return c.json({ error: 'candidate_set_not_usable' }, 400)
  const strategy = mode === 'v2' ? winner.lane : legacyStrategy
  const requestId = String(body.request_id || crypto.randomUUID())
  const pickId = `pick_${crypto.randomUUID()}`
  const status = selected.confident ? 'ready' : 'abstained'
  const calibrationSamples = [...(decisions.context.laneEvidence?.values() || [])].reduce((sum, value) => sum + Number(value || 0), 0)
  const shadow = { mode, v1: decisionReadModel(decisions.v1), v2: decisionReadModel(decisions.v2), disagreement: decisions.v1.winner?.index !== decisions.v2.winner?.index }
  let recommendationId: string | null = null
  if (selected.confident) {
    const capture = await createInboxCapture(c.env.DB, { source: urlOf(winner.item), title: String(winner.item.title) })
    recommendationId = capture.id
    const firstEvidence = Array.isArray(winner.item.evidence) ? winner.item.evidence[0]?.claim : winner.item.evidence
    const rationaleText = winner.item.why_this || (typeof firstEvidence === 'string' ? firstEvidence : null)
    await c.env.DB.prepare(`UPDATE recommendations SET creator=?,content_type=?,why_this=?,context_brief=? WHERE id=?`).bind(winner.item.creator || null, winner.item.format || winner.item.source_class || null, rationaleText, winner.item.context_brief || null, recommendationId).run()
    await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='compass_pick',branch_id=COALESCE(?,branch_id),source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),updated_at=datetime('now') WHERE recommendation_id=?`).bind(winner.item.branch_id || null, JSON.stringify({ compass_pick_id: pickId, strategy, lane: winner.lane, engine_version: selected.engine, objective_version: LEARNING_OBJECTIVE_VERSION, thread_id: thread.id }), recommendationId).run()
    await c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,source_class,format,creator,branch_id,predicted_score,predicted_confidence,predicted_components_json,outcome_status,outcome_origin,training_eligible,objective_version,format_key,creator_key)
      VALUES (?,?,?,?,?,?,?,?,?,'active','compass_prediction',0,?,?,?) ON CONFLICT(recommendation_id) DO UPDATE SET predicted_score=excluded.predicted_score,predicted_confidence=excluded.predicted_confidence,predicted_components_json=excluded.predicted_components_json,outcome_origin='compass_prediction',objective_version=excluded.objective_version,format_key=excluded.format_key,creator_key=excluded.creator_key,evaluated_at=datetime('now')`).bind(
        `outcome_${recommendationId}`, recommendationId, winner.item.source_class || null, winner.item.format || null, winner.item.creator || null, winner.item.branch_id || null,
        winner.expectedLearningValue, selected.confidence, JSON.stringify(winner.features), LEARNING_OBJECTIVE_VERSION,
        canonicalFormat(winner.item.format || winner.item.source_class), canonicalCreatorKey(winner.item.creator),
      ).run()
  }
  const rationale = {
    why_this: winner.item.why_this || '', context_brief: winner.item.context_brief || '', why_now: winner.item.why_now || '',
    expected_learning: winner.item.expected_learning || winner.item.expected_contribution || '', cost: winner.item.cost || null,
    lane: winner.lane, score: winner.score, expected_learning_value: winner.expectedLearningValue, exploration_bonus: winner.explorationBonus,
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
    await c.env.DB.prepare(`INSERT INTO compass_candidates (id,pick_id,canonical_url,title,creator,format,source_class,context_brief,features_json,evidence_json,score,uncertainty,is_verified,is_winner,lane,branch_id,format_key,creator_key,expected_learning_value,decision_score,evidence_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        `cc_${crypto.randomUUID()}`, pickId, urlOf(entry.item), String(entry.item.title), entry.item.creator || null, entry.item.format || null,
        entry.item.source_class || null, entry.item.context_brief || null, JSON.stringify(entry.features), JSON.stringify(entry.item.evidence || entry.item.rationale || {}),
        entry.score, entry.uncertainty, entry.features._valid_url && entry.features._has_identity && !['invalid','unavailable'].includes(entry.sourceCheck.status) ? 1 : 0,
        entry.index === winner.index ? 1 : 0, entry.lane, entry.item.branch_id || null, canonicalFormat(entry.item.format || entry.item.source_class),
        canonicalCreatorKey(entry.item.creator), entry.expectedLearningValue, entry.score, structuredEvidenceStatus(entry.item.evidence || entry.item.rationale || entry.item.why_this),
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
    const thread = await resolveThread(c.env.DB, body.thread_id)
    if (!thread) return c.json({ error: 'learning_thread_required' }, 409)
    const requestedStrategy = body.strategy ? String(body.strategy) : ''
    const strategy = STRATEGIES.has(requestedStrategy) ? requestedStrategy : await chooseStrategy(c.env.DB)
    const scored = await scoreCandidateSet(c.env.DB, validated.candidates, thread, strategy)
    return c.json({ ok: true, dry_run: true, mode: await engineMode(c.env.DB), thread_id: thread.id, objective_version: LEARNING_OBJECTIVE_VERSION, v1: decisionReadModel(scored.v1), v2: decisionReadModel(scored.v2) })
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
    if (!additions.length || existing.length + additions.length > 8) return c.json({ error: 'expansion must add at least one candidate and keep the total at eight or fewer' }, 400)
    const candidates = existing.map((item: any) => ({ canonical_url: item.canonical_url, title: item.title, creator: item.creator, format: item.format, source_class: item.source_class, context_brief: item.context_brief, lane: item.lane, branch_id: item.branch_id, evidence: (() => { try { return JSON.parse(item.evidence_json || '{}') } catch { return {} } })() })).concat(additions)
    await c.env.DB.prepare(`UPDATE compass_picks SET status='replaced',resolved_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(pick.id).run()
    const response = await app.fetch(new Request(new URL('/picks', c.req.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_id: `${pick.request_id}:expanded:${Date.now()}`, strategy: pick.strategy, thread_id: pick.thread_id, objective_version: LEARNING_OBJECTIVE_VERSION, candidates }) }), c.env)
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
    const reflectionNote = reflection && pick.recommendation_id
      ? await c.env.DB.prepare(`SELECT id,revision FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`).bind(pick.recommendation_id).first<{ id: string; revision: number }>()
      : null
    const reflectionNoteId = reflection && pick.recommendation_id ? reflectionNote?.id || `reflection_${pick.recommendation_id}` : null
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`INSERT INTO compass_feedback (id,pick_id,recommendation_id,outcome,score,reason_tags_json,reflection) VALUES (?,?,?,?,?,?,?)`).bind(`cf_${crypto.randomUUID()}`, pick.id, pick.recommendation_id, outcome === 'dismissed' ? 'declined' : outcome, rating.score, JSON.stringify(reasonTags), body.reflection || null),
      c.env.DB.prepare(`UPDATE compass_picks SET status=?,updated_at=datetime('now'),resolved_at=CASE WHEN ? IN ('resolved','declined') THEN datetime('now') ELSE resolved_at END WHERE id=?`).bind(nextStatus, nextStatus, pick.id),
    ]
    if (pick.recommendation_id) {
      statements.push(
        c.env.DB.prepare(`UPDATE recommendations SET status=CASE WHEN ? THEN 'consumed' WHEN ? THEN 'rejected' ELSE status END,consumed_date=CASE WHEN ? THEN COALESCE(consumed_date,date('now')) ELSE consumed_date END,user_rating=COALESCE(?,user_rating),user_score=COALESCE(?,user_score),user_review=COALESCE(NULLIF(?,''),user_review),updated_at=datetime('now') WHERE id=?`).bind(completed ? 1 : 0, excluded ? 1 : 0, completed ? 1 : 0, rating.rating, rating.score, reflection, pick.recommendation_id),
        c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,last_opened_at,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,last_opened_at=datetime('now'),updated_at=datetime('now')`).bind(pick.recommendation_id, completed ? 'completed' : excluded ? 'excluded' : dismissed ? 'inbox' : 'queued', completed ? 100 : 0, new Date().toISOString()),
        c.env.DB.prepare(`UPDATE learning_sessions SET status=CASE WHEN ? THEN 'completed' ELSE 'returned' END,returned_at=datetime('now'),completed_at=CASE WHEN ? THEN COALESCE(completed_at,datetime('now')) ELSE completed_at END,reflection=COALESCE(NULLIF(?,''),reflection) WHERE recommendation_id=? AND status IN ('active','returned')`).bind(completed ? 1 : 0, completed ? 1 : 0, reflection, pick.recommendation_id),
        c.env.DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,actual_score,outcome_status,consumed_at,evaluated_at,outcome_origin,training_eligible,objective_version) VALUES (?,?,?,?,CASE WHEN ? THEN date('now') ELSE NULL END,datetime('now'),'compass_feedback',0,?) ON CONFLICT(recommendation_id) DO UPDATE SET actual_score=excluded.actual_score,outcome_status=excluded.outcome_status,outcome_origin='compass_feedback',consumed_at=COALESCE(recommendation_outcomes.consumed_at,excluded.consumed_at),evaluated_at=datetime('now')`).bind(`outcome_${pick.recommendation_id}`, pick.recommendation_id, rating.score, completed ? 'consumed' : excluded ? outcome === 'declined' ? 'rejected' : 'abandoned' : 'active', completed ? 1 : 0, LEARNING_OBJECTIVE_VERSION),
      )
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
      await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-feedback:${pick.id}:${outcome}`, eventType: classified.eventType, recommendationId: pick.recommendation_id, threadId: pick.thread_id || null, pickId: pick.id, reasonCode: reasonTags[0] || null, signalScope: classified.signalScope, explicit: true, origin: 'compass_feedback', payload: { outcome, reason_tags: reasonTags } })
      if (rating.score !== null) await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-rating:${pick.id}`, eventType: 'rating_recorded', recommendationId: pick.recommendation_id, threadId: pick.thread_id || null, pickId: pick.id, signalScope: 'utility', signalValue: rating.score / 10, explicit: true, origin: 'compass_feedback', payload: { score: rating.score } })
      if (disposition !== 'undecided') await recordRecommendationSignal(c.env.DB, { idempotencyKey: `compass-disposition:${pick.id}`, eventType: 'disposition_recorded', recommendationId: pick.recommendation_id, threadId: pick.thread_id || null, pickId: pick.id, signalScope: 'utility', explicit: true, origin: 'compass_feedback', payload: { disposition } })
      await refreshRecommendationOutcome(c.env.DB, pick.recommendation_id)
    }
    const learning = await learnFromOutcome(c.env.DB, pick, rating.score, outcome, reasonTags)
    return c.json({ ok: true, pick_id: pick.id, status: nextStatus, recommendation_state: completed ? 'completed' : excluded ? 'excluded' : dismissed ? 'inbox' : 'queued', disposition, reason_tags: reasonTags, feedback_job: feedbackJobId, learning_receipt: learning, source_page: pick.recommendation_id ? `/#/learn/notes?source=${encodeURIComponent(pick.recommendation_id)}` : null })
  } catch (err) { return c.json(safeError('Failed to record Compass feedback')(err), 500) }
})

export default app
