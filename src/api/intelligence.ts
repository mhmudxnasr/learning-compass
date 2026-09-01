import { Hono } from 'hono'
import { adaptAndNormalizeWeights, computeDecayedAffinity } from '../domain'
import { Bindings, safeError } from '../lib'
import {
  backfillHermesIntelligence,
  createHermesEvaluatorProposals,
  hermesWeeklyReport,
} from '../services/hermes-intelligence'
import { canonicalTasteIdentity, tasteEvidence } from './taste'
import {
  applyRecommendationRepair,
  profileIntelligenceSnapshot,
  recommendationRepairPreview,
} from '../services/intelligence-v2'
import { LEARNING_OBJECTIVE_VERSION } from '../intelligence-v2'

const app = new Hono<{ Bindings: Bindings }>()
const all = async (statement: D1PreparedStatement) => (await statement.all<any>()).results || []
const allOr = async (statement: D1PreparedStatement) => {
  try {
    return await all(statement)
  } catch {
    return []
  }
}

async function engineReadiness(DB: D1Database) {
  const [setting, shadow, outcomes, lanes, invalid, shadowPicks] = await Promise.all([
    DB.prepare(
      `SELECT value_json,updated_at FROM user_settings WHERE setting_key='recommendation_engine'`,
    ).first<any>(),
    DB.prepare(
      `SELECT COUNT(*) count,SUM(CASE WHEN json_valid(shadow_json) AND json_extract(shadow_json,'$.disagreement')=1 THEN 1 ELSE 0 END) disagreements FROM compass_picks WHERE engine_version='v1' AND objective_version='learning_value_v2'`,
    ).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM recommendation_training_outcomes_v2`).first<any>(),
    DB.prepare(
      `SELECT p.strategy,COUNT(DISTINCT o.recommendation_id) count FROM recommendation_training_outcomes_v2 o JOIN compass_picks p ON p.recommendation_id=o.recommendation_id GROUP BY p.strategy`,
    ).all<any>(),
    DB.prepare(
      `SELECT COUNT(*) count FROM compass_picks WHERE objective_version='learning_value_v2' AND shadow_json IS NOT NULL AND json_valid(shadow_json) AND json_extract(shadow_json,'$.v2.evidence_status')='invalid'`,
    ).first<any>(),
    DB.prepare(
      `SELECT p.shadow_json,o.outcome_status FROM compass_picks p LEFT JOIN recommendation_outcomes o ON o.recommendation_id=p.recommendation_id WHERE p.shadow_json IS NOT NULL AND p.shadow_json != '{}' AND json_valid(p.shadow_json)`,
    ).all<any>(),
  ])
  let resolved: any = { mode: 'shadow', engine_version: 'v2', objective_version: LEARNING_OBJECTIVE_VERSION }
  try {
    resolved = { ...resolved, ...JSON.parse(setting?.value_json || '{}') }
  } catch {}
  const laneCounts = Object.fromEntries((lanes.results || []).map((row: any) => [row.strategy, Number(row.count || 0)]))

  // Canary gate (F3): v2 must discriminate between consumed and rejected
  // outcomes strictly better than v1 on the shadow corpus before it is served.
  // Both read-models are logged on every pick, so this is free A/B data.
  const discrimination = (() => {
    const consumed = { v1: [] as number[], v2: [] as number[] }
    const rejected = { v1: [] as number[], v2: [] as number[] }
    for (const row of shadowPicks.results || []) {
      let shadow: any
      try {
        shadow = JSON.parse(row.shadow_json)
      } catch {
        continue
      }
      const v1 = shadow.v1 && typeof shadow.v1 === 'object' && shadow.v1.score != null ? Number(shadow.v1.score) : null
      const v2 = shadow.v2 && typeof shadow.v2 === 'object' && shadow.v2.score != null ? Number(shadow.v2.score) : null
      if (v1 == null || v2 == null) continue
      if (shadow.v1.abstention_reason) continue
      if (row.outcome_status === 'consumed') {
        consumed.v1.push(v1)
        consumed.v2.push(v2)
      } else if (row.outcome_status === 'rejected') {
        rejected.v1.push(v1)
        rejected.v2.push(v2)
      }
    }
    const mean = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const gap = (engine: 'v1' | 'v2') => {
      const consumedMean = mean(consumed[engine])
      const rejectedMean = mean(rejected[engine])
      return consumedMean != null && rejectedMean != null ? consumedMean - rejectedMean : null
    }
    const v1Gap = gap('v1')
    const v2Gap = gap('v2')
    const resolvedWithShadow = consumed.v1.length + rejected.v1.length
    // Strictly better: v2's gap is positive and larger than v1's, on a corpus
    // large enough that a single pick can't drive the verdict.
    const passed = resolvedWithShadow >= 8 && v2Gap != null && v1Gap != null && v2Gap > v1Gap && v2Gap > 0
    return {
      observed: resolvedWithShadow,
      required: 8,
      v1_gap: v1Gap == null ? null : Math.round(v1Gap * 1000) / 1000,
      v2_gap: v2Gap == null ? null : Math.round(v2Gap * 1000) / 1000,
      passed,
    }
  })()

  const gates = {
    global_learning_outcomes: {
      observed: Number(outcomes?.count || 0),
      required: 20,
      passed: Number(outcomes?.count || 0) >= 20,
    },
    lane_learning_outcomes: {
      observed: laneCounts,
      required_each: 8,
      passed: ['fit', 'bridge', 'challenge'].every((lane) => Number(laneCounts[lane] || 0) >= 8),
    },
    shadow_decisions: {
      observed: Number(shadow?.count || 0),
      required: 10,
      passed: Number(shadow?.count || 0) >= 10,
      disagreements: Number(shadow?.disagreements || 0),
    },
    invalid_winners: { observed: Number(invalid?.count || 0), required: 0, passed: Number(invalid?.count || 0) === 0 },
    v2_outperforms_v1: discrimination,
  }
  return {
    setting: resolved,
    updated_at: setting?.updated_at || null,
    gates,
    ready: Object.values(gates).every((gate: any) => gate.passed),
  }
}

app.get('/knowledge/graph', async (c) => {
  const [nodes, explicit, hierarchy] = await Promise.all([
    all(
      c.env.DB.prepare(
        `SELECT id,type,label,super_category,parent_id,status,meta_json FROM tree_nodes ORDER BY type,label LIMIT 1500`,
      ),
    ),
    allOr(
      c.env.DB.prepare(
        `SELECT id,source_id,target_id,relation_type,evidence_json,confidence FROM knowledge_edges ORDER BY confidence DESC LIMIT 1000`,
      ),
    ),
    all(
      c.env.DB.prepare(
        `SELECT 'parent-'||id id,parent_id source_id,id target_id,'hierarchy' relation_type,'[]' evidence_json,1 confidence FROM tree_nodes WHERE parent_id IS NOT NULL`,
      ),
    ),
  ])
  return c.json({ nodes, edges: [...hierarchy, ...explicit] })
})

app.get('/knowledge/blind-spots', async (c) => {
  const gaps = await all(
    c.env.DB.prepare(`SELECT n.id,n.label,n.super_category,n.status,COUNT(r.id) consumed_count
    FROM tree_nodes n
    LEFT JOIN recommendation_meta m ON m.branch_id=n.id
    LEFT JOIN recommendations r ON r.id=m.recommendation_id AND r.status='consumed'
    WHERE n.type IN ('branch','leaf') GROUP BY n.id HAVING consumed_count=0 ORDER BY n.super_category,n.label`),
  )
  return c.json({ blind_spots: gaps, count: gaps.length })
})

app.get('/learning/health', async (c) => {
  const branches = await all(
    c.env.DB.prepare(
      `SELECT COALESCE(m.branch_id,'unmapped') branch,COUNT(*) total,SUM(CASE WHEN r.status='consumed' THEN 1 ELSE 0 END) consumed,MAX(r.consumed_date) last_activity FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id GROUP BY branch ORDER BY total DESC`,
    ),
  )
  const health = branches.map((row: any) => ({
    ...row,
    health: !row.last_activity ? 'neglected' : row.consumed >= 3 ? 'healthy' : 'growing',
  }))
  return c.json({
    health,
    healthy: health.filter((row: any) => row.health === 'healthy').length,
    neglected: health.filter((row: any) => row.health === 'neglected').length,
  })
})

app.get('/taste/dna', async (c) => {
  const [vectors, ratings, categories] = await Promise.all([
    all(
      c.env.DB.prepare(
        `SELECT topic,affinity_score,consumption_count,last_consumed_at FROM taste_vectors ORDER BY affinity_score DESC`,
      ),
    ),
    all(
      c.env.DB.prepare(
        `SELECT user_rating,COUNT(*) count FROM recommendations WHERE status='consumed' GROUP BY user_rating`,
      ),
    ),
    all(c.env.DB.prepare(`SELECT content_type,COUNT(*) count FROM recommendations GROUP BY content_type`)),
  ])
  const merged = new Map<string, any>()
  for (const item of vectors) {
    const topic = canonicalTasteIdentity(item.topic)
    const current = merged.get(topic) || { topic, affinity_score: 0, consumption_count: 0, last_consumed_at: null }
    current.affinity_score += Number(item.affinity_score || 0)
    current.consumption_count += Number(item.consumption_count || 0)
    if (!current.last_consumed_at || String(item.last_consumed_at || '') > current.last_consumed_at)
      current.last_consumed_at = item.last_consumed_at
    merged.set(topic, current)
  }
  const normalized = [...merged.values()].map((item: any) => ({
    ...item,
    ...computeDecayedAffinity(Number(item.affinity_score || 0), item.last_consumed_at),
    ...tasteEvidence(item.consumption_count, item.last_consumed_at),
  }))
  const activeVectors = normalized.filter(
    (item: any) => Number(item.affinity_score) !== 0 && item.evidence_status === 'usable',
  )
  return c.json({
    vectors: normalized,
    ratings,
    categories,
    interest: activeVectors.length,
    diversity: categories.length,
    momentum: activeVectors.filter((item: any) => item.last_consumed_at).length,
  })
})

app.get('/analytics/creator-trust', async (c) => {
  const creators = await all(
    c.env.DB.prepare(
      `SELECT creator,user_score,user_rating,consumed_date,updated_at FROM recommendations WHERE creator IS NOT NULL AND creator!='' AND status='consumed' AND (user_score IS NOT NULL OR user_rating IN ('love','like','meh','dislike'))`,
    ),
  )
  const grouped = new Map<string, any>()
  for (const row of creators) {
    const creator = canonicalTasteIdentity(row.creator, '')
    if (!creator) continue
    const score =
      row.user_score == null
        ? ({ love: 10, like: 8, meh: 5, dislike: 2 } as Record<string, number>)[row.user_rating]
        : Number(row.user_score)
    if (!Number.isFinite(score)) continue
    const current = grouped.get(creator) || { creator, total: 0, sum: 0, loves: 0, last_feedback_at: null }
    current.total += 1
    current.sum += score
    current.loves += row.user_rating === 'love' ? 1 : 0
    if (!current.last_feedback_at || String(row.consumed_date || row.updated_at || '') > current.last_feedback_at)
      current.last_feedback_at = row.consumed_date || row.updated_at
    grouped.set(creator, current)
  }
  const result = [...grouped.values()]
    .map((row) => {
      const average_score = row.sum / row.total
      const shrunk_score = (row.sum + 15) / (row.total + 3)
      const evidence = tasteEvidence(row.total, row.last_feedback_at)
      return {
        creator: row.creator,
        total: row.total,
        loves: row.loves,
        average_score: Math.round(average_score * 100) / 100,
        shrunk_score: Math.round(shrunk_score * 100) / 100,
        trust_index: Math.round(shrunk_score * evidence.confidence * 10) / 10,
        last_feedback_at: row.last_feedback_at,
        ...evidence,
      }
    })
    .sort((a, b) => b.trust_index - a.trust_index || b.total - a.total)
  return c.json({ creators: result })
})

app.get('/analytics/taste-drift', async (c) => {
  const events = await all(
    c.env.DB.prepare(
      `SELECT substr(created_at,1,7) month,COALESCE(branch_id,'unmapped') branch,ROUND(AVG(score),2) average_score,COUNT(*) count FROM rating_events GROUP BY month,branch ORDER BY month`,
    ),
  )
  return c.json({ events })
})
app.get('/analytics/heatmaps', async (c) => {
  const days = await all(c.env.DB.prepare(`SELECT date,count,topics FROM learning_log ORDER BY date DESC LIMIT 366`))
  return c.json({ days, active_days: days.filter((day: any) => day.count > 0).length })
})
app.get('/analytics/forecast', async (c) => {
  const [due7, due30, cards, gaps] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now','+7 days')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now','+30 days')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM tree_nodes WHERE type IN ('branch','leaf')`).first<any>(),
  ])
  return c.json({
    due_next_7_days: due7?.count || 0,
    due_next_30_days: due30?.count || 0,
    total_cards: cards?.count || 0,
    mapped_topics: gaps?.count || 0,
  })
})

// Hermes control surface: one compact read model for operations, quality, memory, and drift.
app.get('/analytics/hermes', async (c) => {
  const { DB } = c.env
  try {
    const calibrationRows = await allOr(
      DB.prepare(`SELECT p.expected_learning_value predicted_value,o.learning_value actual_value,o.format_key format,o.creator_key creator,p.strategy
      FROM recommendation_outcomes o LEFT JOIN compass_picks p ON p.recommendation_id=o.recommendation_id
      WHERE o.training_eligible=1 AND o.learning_value IS NOT NULL AND o.objective_version='learning_value_v2'`),
    )
    const [
      jobCounts,
      stale,
      retryQueue,
      deadLetters,
      quality,
      qualityByFormat,
      memory,
      alerts,
      failures,
      weights,
      proposals,
      compassPriors,
      compassWeights,
      candidateQuality,
      compassFeedbackRows,
    ] = await Promise.all([
      DB.prepare(`SELECT status,COUNT(*) count FROM agent_jobs GROUP BY status`).all<any>(),
      DB.prepare(
        `SELECT COUNT(*) count FROM agent_jobs WHERE status='running' AND lease_expires_at < datetime('now')`,
      ).first<any>(),
      DB.prepare(
        `SELECT COUNT(*) count FROM agent_job_retries WHERE dead_lettered_at IS NULL AND next_attempt_at > datetime('now')`,
      ).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM agent_job_retries WHERE dead_lettered_at IS NOT NULL`).first<any>(),
      DB.prepare(
        `SELECT COUNT(*) total,SUM(CASE WHEN outcome_status='consumed' THEN 1 ELSE 0 END) consumed,SUM(CASE WHEN outcome_status='rejected' THEN 1 ELSE 0 END) rejected,SUM(CASE WHEN outcome_status IN ('deleted','abandoned') THEN 1 ELSE 0 END) abandoned,ROUND(AVG(learning_value),3) average_learning_value,ROUND(AVG(CASE WHEN expected_learning_value IS NOT NULL THEN ABS(expected_learning_value-learning_value) END),3) prediction_error FROM recommendation_outcomes o LEFT JOIN compass_picks p ON p.recommendation_id=o.recommendation_id WHERE o.training_eligible=1 AND o.learning_value IS NOT NULL AND o.objective_version='learning_value_v2'`,
      ).first<any>(),
      DB.prepare(
        `SELECT COALESCE(format_key,'other') format,COUNT(*) total,SUM(CASE WHEN outcome_status='consumed' THEN 1 ELSE 0 END) consumed,SUM(CASE WHEN outcome_status='rejected' THEN 1 ELSE 0 END) rejected,ROUND(AVG(learning_value),3) average_learning_value,ROUND(AVG(CASE WHEN expected_learning_value IS NOT NULL THEN ABS(expected_learning_value-learning_value) END),3) prediction_error FROM recommendation_outcomes o LEFT JOIN compass_picks p ON p.recommendation_id=o.recommendation_id WHERE o.training_eligible=1 AND o.learning_value IS NOT NULL AND o.objective_version='learning_value_v2' GROUP BY format_key ORDER BY total DESC`,
      ).all<any>(),
      DB.prepare(
        `SELECT memory_kind, status, COUNT(*) count FROM hermes_memory GROUP BY memory_kind,status ORDER BY memory_kind,status`,
      ).all<any>(),
      DB.prepare(
        `SELECT id,kind,severity,title,body,created_at FROM hermes_alerts WHERE acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 12`,
      ).all<any>(),
      DB.prepare(
        `SELECT id,job_type,attempts,error,updated_at FROM agent_jobs WHERE status='failed' ORDER BY updated_at DESC LIMIT 12`,
      ).all<any>(),
      DB.prepare(
        `SELECT dimension,current_weight,baseline_weight,evidence_count,updated_at FROM engine_weights ORDER BY current_weight DESC`,
      ).all<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending'`).first<any>(),
      DB.prepare(
        `SELECT strategy,alpha,beta,explicit_evidence_count,updated_at FROM compass_strategy_priors ORDER BY strategy`,
      )
        .all<any>()
        .catch(() => ({ results: [] })),
      DB.prepare(
        `SELECT strategy,dimension,current_weight,baseline_weight,evidence_count,updated_at FROM compass_feature_weights ORDER BY strategy,current_weight DESC`,
      )
        .all<any>()
        .catch(() => ({ results: [] })),
      DB.prepare(
        `SELECT
        COUNT(*) total_candidates,
        SUM(CASE WHEN is_winner=1 THEN 1 ELSE 0 END) winners,
        ROUND(AVG(contextual_alignment),3) average_contextual_alignment,
        ROUND(AVG(candidate_set_diversity),3) average_candidate_set_diversity,
        SUM(CASE WHEN json_extract(evidence_json,'$.candidate_context.summary') IS NOT NULL THEN 1 ELSE 0 END) candidates_with_summary,
        SUM(CASE WHEN json_array_length(json_extract(evidence_json,'$.candidate_context.concepts')) >= 2 THEN 1 ELSE 0 END) candidates_with_concepts,
        SUM(CASE WHEN json_extract(features_json,'$._exclusion_reason')='duplicate_submission' THEN 1 ELSE 0 END) duplicate_submissions
        FROM compass_candidates`,
      )
        .first<any>()
        .catch(() => null),
      DB.prepare(
        `SELECT cf.outcome,cf.score,cf.reason_tags_json,cf.exposure_json,p.strategy lane
        FROM compass_feedback cf LEFT JOIN compass_picks p ON p.id=cf.pick_id
        ORDER BY cf.created_at`,
      )
        .all<any>()
        .catch(() => ({ results: [] })),
    ])
    const [signalPopulation, profileIntelligence, improvementRuns] = await Promise.all([
      DB.prepare(
        `SELECT COUNT(*) total,
        SUM(CASE WHEN training_eligible=1 THEN 1 ELSE 0 END) utility_labeled,
        SUM(CASE WHEN outcome_origin='administrative_exclusion' THEN 1 ELSE 0 END) administrative_exclusions,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM learning_events e WHERE e.recommendation_id=recommendation_outcomes.recommendation_id AND e.is_explicit=1 AND e.signal_scope IN ('eligibility','both')) THEN 1 ELSE 0 END) explicit_fit_labels
        FROM recommendation_outcomes`,
      ).first<any>(),
      profileIntelligenceSnapshot(DB),
      DB.prepare(
        `SELECT id,conversation_id,trigger_kind,layer,risk_level,status,confidence,validation_json,deployment_json,error,created_at,completed_at FROM self_improvement_runs ORDER BY created_at DESC LIMIT 25`,
      ).all<any>(),
    ])
    const statuses: Record<string, number> = {}
    for (const row of jobCounts.results || []) statuses[row.status] = Number(row.count || 0)
    const reasonGroups = new Map<string, { reason: string; count: number; scores: number[] }>()
    const laneGroups = new Map<
      string,
      {
        lane: string
        total: number
        completed: number
        declined: number
        abandoned: number
        deferred: number
        scores: number[]
      }
    >()
    let neutralDeferrals = 0
    for (const row of compassFeedbackRows.results || []) {
      let reasons: string[] = []
      let exposure: any = {}
      try {
        reasons = JSON.parse(row.reason_tags_json || '[]')
      } catch {}
      try {
        exposure = JSON.parse(row.exposure_json || '{}')
      } catch {}
      const score = row.score == null || !Number.isFinite(Number(row.score)) ? null : Number(row.score)
      const lane = String(exposure.lane || row.lane || 'unknown')
      const laneGroup = laneGroups.get(lane) || {
        lane,
        total: 0,
        completed: 0,
        declined: 0,
        abandoned: 0,
        deferred: 0,
        scores: [],
      }
      laneGroup.total += 1
      if (row.outcome === 'completed') laneGroup.completed += 1
      if (row.outcome === 'declined') laneGroup.declined += 1
      if (row.outcome === 'abandoned') laneGroup.abandoned += 1
      if (reasons.includes('not_now')) {
        laneGroup.deferred += 1
        neutralDeferrals += 1
      }
      if (score !== null) laneGroup.scores.push(score)
      laneGroups.set(lane, laneGroup)
      for (const reason of reasons) {
        const reasonGroup = reasonGroups.get(reason) || { reason, count: 0, scores: [] }
        reasonGroup.count += 1
        if (score !== null) reasonGroup.scores.push(score)
        reasonGroups.set(reason, reasonGroup)
      }
    }
    const summarizeScores = (scores: number[]) =>
      scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100 : null
    const feedbackAnalytics = {
      total: Number(compassFeedbackRows.results?.length || 0),
      neutral_deferrals: neutralDeferrals,
      by_reason: [...reasonGroups.values()]
        .map(({ scores, ...group }) => ({ ...group, average_score: summarizeScores(scores) }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      by_lane: [...laneGroups.values()]
        .map(({ scores, ...group }) => ({ ...group, average_score: summarizeScores(scores) }))
        .sort((a, b) => a.lane.localeCompare(b.lane)),
    }
    const summarizeCalibration = (key: 'strategy' | 'format' | 'creator') => {
      const groups = new Map<string, { rated: number; paired: number; error: number }>()
      for (const row of calibrationRows) {
        const value =
          key === 'creator' ? canonicalTasteIdentity(row[key], 'unknown') : String(row[key] || 'unknown').toLowerCase()
        const group = groups.get(value) || { rated: 0, paired: 0, error: 0 }
        group.rated += 1
        if (row.predicted_value != null) {
          group.paired += 1
          group.error += Math.abs(Number(row.predicted_value) - Number(row.actual_value))
        }
        groups.set(value, group)
      }
      return [...groups.entries()].map(([label, group]) => ({
        [key]: label,
        rated_outcomes: group.rated,
        predicted_and_rated_outcomes: group.paired,
        coverage_percent: group.rated ? Math.round((group.paired / group.rated) * 100) : 0,
        mae: group.paired ? Math.round((group.error / group.paired) * 100) / 100 : null,
        evidence_status: group.paired >= 5 ? 'usable' : 'insufficient',
      }))
    }
    const paired = calibrationRows.filter((row: any) => row.predicted_value != null)
    const reliabilityBuckets = Array.from({ length: 5 }, (_, index) => ({
      bucket: `${index * 20}-${index === 4 ? 100 : (index + 1) * 20}%`,
      count: 0,
      average_predicted: null as number | null,
      average_actual: null as number | null,
    }))
    let squaredError = 0
    for (const row of paired) {
      const predicted = Math.max(0, Math.min(1, Number(row.predicted_value)))
      const actual = Math.max(0, Math.min(1, Number(row.actual_value)))
      const bucket = reliabilityBuckets[Math.min(4, Math.floor(predicted * 5))]
      bucket.count += 1
      bucket.average_predicted = (bucket.average_predicted || 0) + predicted
      bucket.average_actual = (bucket.average_actual || 0) + actual
      squaredError += (predicted - actual) ** 2
    }
    for (const bucket of reliabilityBuckets) {
      if (bucket.count) {
        bucket.average_predicted = Math.round((bucket.average_predicted! / bucket.count) * 1000) / 1000
        bucket.average_actual = Math.round((bucket.average_actual! / bucket.count) * 1000) / 1000
      }
    }
    const calibration = {
      rated_outcomes: calibrationRows.length,
      predicted_and_rated_outcomes: paired.length,
      coverage_percent: calibrationRows.length ? Math.round((paired.length / calibrationRows.length) * 100) : 0,
      mae: paired.length
        ? Math.round(
            (paired.reduce(
              (sum: number, row: any) => sum + Math.abs(Number(row.predicted_value) - Number(row.actual_value)),
              0,
            ) /
              paired.length) *
              1000,
          ) / 1000
        : null,
      evidence_status: paired.length >= 5 ? 'usable' : 'insufficient',
      brier_score: paired.length ? Math.round((squaredError / paired.length) * 1000) / 1000 : null,
      reliability_buckets: reliabilityBuckets,
      by_strategy: summarizeCalibration('strategy'),
      by_format: summarizeCalibration('format'),
      by_creator: summarizeCalibration('creator'),
    }
    return c.json({
      checked_at: new Date().toISOString(),
      jobs: {
        statuses,
        stale_running: Number(stale?.count || 0),
        delayed_retries: Number(retryQueue?.count || 0),
        dead_letters: Number(deadLetters?.count || 0),
        recent_failures: failures.results || [],
      },
      quality: {
        ...(quality || {}),
        objective_version: LEARNING_OBJECTIVE_VERSION,
        population: signalPopulation || {},
        completion_rate:
          Number(quality?.consumed || 0) + Number(quality?.rejected || 0) + Number(quality?.abandoned || 0)
            ? Math.round(
                (Number(quality?.consumed || 0) /
                  (Number(quality?.consumed || 0) + Number(quality?.rejected || 0) + Number(quality?.abandoned || 0))) *
                  100,
              )
            : null,
        abandonment_rate: Number(quality?.total || 0)
          ? Math.round((Number(quality?.abandoned || 0) / Number(quality.total)) * 100)
          : null,
        by_format: qualityByFormat.results || [],
      },
      memory: {
        entries: memory.results || [],
        active: (memory.results || [])
          .filter((row: any) => row.status === 'active')
          .reduce((sum: number, row: any) => sum + Number(row.count || 0), 0),
      },
      alerts: alerts.results || [],
      engine_weights: weights.results || [],
      compass_learning: {
        strategies: compassPriors.results || [],
        feature_weights: compassWeights.results || [],
        calibration,
        candidate_quality: candidateQuality || {},
        feedback: feedbackAnalytics,
      },
      profile_intelligence: profileIntelligence,
      self_improvement: { runs: improvementRuns.results || [] },
      pending_proposals: Number(proposals?.count || 0),
    })
  } catch (error) {
    return c.json(safeError('Hermes analytics failed')(error), 500)
  }
})

app.post('/analytics/hermes/recalibrate', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const conversationId = String(body.conversation_id || '')
      .trim()
      .slice(0, 200)
    if (!conversationId) return c.json({ error: 'conversation_id required; recalibration is conversation-bound' }, 400)
    const outcomes = await DB.prepare(
      `SELECT learning_value,predicted_components_json FROM recommendation_outcomes WHERE training_eligible=1 AND learning_value IS NOT NULL AND objective_version=? AND predicted_components_json IS NOT NULL AND predicted_components_json!='{}'`,
    )
      .bind(LEARNING_OBJECTIVE_VERSION)
      .all<any>()
    const sample = outcomes.results || []
    if (sample.length < 20)
      return c.json(
        {
          error: 'insufficient_evidence',
          message: `At least 20 learning-value outcomes are required; found ${sample.length}.`,
          required: 20,
          observed: sample.length,
        },
        409,
      )
    const dimensions = [
      'frontier_potential',
      'info_gain',
      'personal_pull',
      'real_life_relevance',
      'source_quality',
      'format_exploration',
    ]
    const deltas: Record<string, number> = {}
    for (const dimension of dimensions) {
      let signal = 0
      for (const row of sample) {
        let components: any = {}
        try {
          components = JSON.parse(row.predicted_components_json || '{}')
        } catch {}
        const component = Math.max(0, Math.min(1, Number(components[dimension] ?? 0.5)))
        signal += component * ((Number(row.learning_value) - 0.5) * 2)
      }
      // Slow, bounded adaptation. The feedback loop must be evidence-led, never twitchy.
      deltas[dimension] = Math.max(-0.01, Math.min(0.01, (signal / sample.length) * 0.03))
    }
    const current =
      (
        await DB.prepare(
          `SELECT id,dimension,baseline_weight,current_weight,evidence_count,audit_history_json FROM engine_weights`,
        ).all<any>()
      ).results || []
    const updated = adaptAndNormalizeWeights(current, deltas)
    const runId = `improvement_${crypto.randomUUID()}`
    const statements = updated.map((item: any) => {
      let history: any[] = []
      try {
        history = JSON.parse(current.find((row: any) => row.id === item.id)?.audit_history_json || '[]')
      } catch {}
      history.push({
        source: 'recommendation_training_outcomes_v2',
        objective_version: LEARNING_OBJECTIVE_VERSION,
        sample_size: sample.length,
        delta: deltas[item.dimension],
        at: new Date().toISOString(),
      })
      return DB.prepare(
        `UPDATE engine_weights SET current_weight=?,evidence_count=?,audit_history_json=?,updated_at=datetime('now') WHERE id=?`,
      ).bind(item.current_weight, item.evidence_count, JSON.stringify(history.slice(-20)), item.id)
    })
    statements.push(
      DB.prepare(`INSERT INTO update_log (kind,summary,details_json) VALUES ('system',?,?)`).bind(
        `Hermes recalibrated discovery weights from ${sample.length} rated outcomes`,
        JSON.stringify({ deltas, sample_size: sample.length, run_id: runId }),
      ),
      DB.prepare(
        `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json,after_json,validation_json,completed_at)
        VALUES (?,?,'conversation_recalibration','recommendation','low','applied',?,?,?,?,?,datetime('now'))`,
      ).bind(
        runId,
        conversationId,
        Math.min(1, sample.length / 40),
        JSON.stringify([{ source: 'recommendation_training_outcomes_v2', sample_size: sample.length }]),
        JSON.stringify({ weights: current }),
        JSON.stringify({ weights: updated, deltas }),
        JSON.stringify({
          passed: true,
          required: 20,
          observed: sample.length,
          objective_version: LEARNING_OBJECTIVE_VERSION,
        }),
      ),
    )
    await DB.batch(statements)
    return c.json({ ok: true, run_id: runId, sample_size: sample.length, deltas, weights: updated })
  } catch (error) {
    return c.json(safeError('Hermes recalibration failed')(error), 500)
  }
})

app.get('/analytics/hermes/engine', async (c) => c.json(await engineReadiness(c.env.DB)))

app.post('/analytics/hermes/engine/activate', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  if (!String(body.conversation_id || '').trim())
    return c.json({ error: 'conversation_id required; rollout is conversation-bound' }, 400)
  const readiness = await engineReadiness(c.env.DB)
  if (!readiness.ready) return c.json({ error: 'shadow_validation_incomplete', ...readiness }, 409)
  const runId = `improvement_${crypto.randomUUID()}`
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO user_settings(setting_key,value_json) VALUES ('recommendation_engine',?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`,
    ).bind(JSON.stringify({ mode: 'v2', engine_version: 'v2', objective_version: LEARNING_OBJECTIVE_VERSION })),
    c.env.DB.prepare(
      `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json,after_json,validation_json,completed_at) VALUES (?,?,?,'recommendation','medium','applied',1,?,?,?,?,datetime('now'))`,
    ).bind(
      runId,
      String(body.conversation_id).slice(0, 200),
      'shadow_activation',
      JSON.stringify([readiness.gates]),
      JSON.stringify(readiness.setting),
      JSON.stringify({ mode: 'v2' }),
      JSON.stringify({ passed: true, gates: readiness.gates }),
    ),
  ])
  return c.json({ ok: true, mode: 'v2', run_id: runId, readiness })
})

app.post('/analytics/hermes/engine/rollback', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  if (!String(body.conversation_id || '').trim())
    return c.json({ error: 'conversation_id required; rollback is conversation-bound' }, 400)
  await c.env.DB.prepare(
    `INSERT INTO user_settings(setting_key,value_json) VALUES ('recommendation_engine',?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`,
  )
    .bind(JSON.stringify({ mode: 'shadow', engine_version: 'v2', objective_version: LEARNING_OBJECTIVE_VERSION }))
    .run()
  await c.env.DB.prepare(
    `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json,after_json,validation_json,completed_at) VALUES (?,?,?,'recommendation','medium','reverted',1,?,?,?,?,datetime('now'))`,
  )
    .bind(
      `improvement_${crypto.randomUUID()}`,
      String(body.conversation_id).slice(0, 200),
      'engine_rollback',
      JSON.stringify(body.evidence || []),
      JSON.stringify({ mode: 'v2' }),
      JSON.stringify({ mode: 'shadow' }),
      JSON.stringify({ reason: String(body.reason || 'manual rollback').slice(0, 1000) }),
    )
    .run()
  return c.json({ ok: true, mode: 'shadow' })
})

app.get('/analytics/hermes/weekly', async (c) => {
  try {
    return c.json(await hermesWeeklyReport(c.env.DB))
  } catch (error) {
    return c.json(safeError('Hermes weekly evaluator failed')(error), 500)
  }
})

app.post('/analytics/hermes/evaluate', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const conversationId = String(body.conversation_id || '')
      .trim()
      .slice(0, 200)
    if (!conversationId) return c.json({ error: 'conversation_id required; evaluation is conversation-bound' }, 400)
    return c.json({ ok: true, ...(await createHermesEvaluatorProposals(c.env.DB, conversationId)) })
  } catch (error) {
    return c.json(safeError('Hermes evaluator failed')(error), 500)
  }
})

app.post('/analytics/hermes/backfill', async (c) => {
  try {
    const body = await c.req
      .json<{ dry_run?: boolean; conversation_id?: string }>()
      .catch((): { dry_run?: boolean; conversation_id?: string } => ({}))
    const dryRun = body.dry_run !== false
    if (dryRun) return c.json({ ok: true, ...(await backfillHermesIntelligence(c.env.DB, true)) })
    const conversationId = String(body.conversation_id || '')
      .trim()
      .slice(0, 200)
    if (!conversationId)
      return c.json({ error: 'conversation_id required; backfill application is conversation-bound' }, 400)
    const before = await backfillHermesIntelligence(c.env.DB, true)
    const result = await backfillHermesIntelligence(c.env.DB, false)
    const runId = `improvement_${crypto.randomUUID()}`
    await c.env.DB.prepare(
      `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json,after_json,validation_json,completed_at)
      VALUES (?,?,'historical_backfill','recommendation_profile','medium','applied',1,?,?,?,?,datetime('now'))`,
    )
      .bind(
        runId,
        conversationId,
        JSON.stringify([{ source: 'legacy_derived_records' }]),
        JSON.stringify(before),
        JSON.stringify(result),
        JSON.stringify({ passed: true, inserted: result.inserted }),
      )
      .run()
    return c.json({ ok: true, run_id: runId, ...result })
  } catch (error) {
    return c.json(safeError('Hermes backfill failed')(error), 500)
  }
})

app.get('/analytics/hermes/repair', async (c) => {
  try {
    return c.json({ dry_run: true, ...(await recommendationRepairPreview(c.env.DB)) })
  } catch (error) {
    return c.json(safeError('History repair preview failed')(error), 500)
  }
})

app.post('/analytics/hermes/repair', async (c) => {
  try {
    const body = await c.req
      .json<{ snapshot_id?: string; apply?: boolean; conversation_id?: string }>()
      .catch((): { snapshot_id?: string; apply?: boolean; conversation_id?: string } => ({}))
    const preview = await recommendationRepairPreview(c.env.DB)
    if (body.apply !== true) return c.json({ dry_run: true, ...preview })
    if (!body.snapshot_id) return c.json({ error: 'snapshot_id required to apply repair', preview }, 400)
    const conversationId = String(body.conversation_id || '')
      .trim()
      .slice(0, 200)
    if (!conversationId)
      return c.json({ error: 'conversation_id required; repair application is conversation-bound' }, 400)
    const result = await applyRecommendationRepair(c.env.DB, body.snapshot_id, conversationId)
    return result.ok ? c.json(result) : c.json(result, 409)
  } catch (error) {
    return c.json(safeError('History repair failed')(error), 500)
  }
})

app.get('/analytics/hermes/improvements', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM self_improvement_runs ORDER BY created_at DESC LIMIT 100`,
  ).all<any>()
  return c.json({
    runs: (rows.results || []).map((row: any) => ({
      ...row,
      evidence: (() => {
        try {
          return JSON.parse(row.evidence_json || '[]')
        } catch {
          return []
        }
      })(),
      before: (() => {
        try {
          return JSON.parse(row.before_json || '{}')
        } catch {
          return {}
        }
      })(),
      after: (() => {
        try {
          return JSON.parse(row.after_json || '{}')
        } catch {
          return {}
        }
      })(),
      validation: (() => {
        try {
          return JSON.parse(row.validation_json || '{}')
        } catch {
          return {}
        }
      })(),
      deployment: (() => {
        try {
          return JSON.parse(row.deployment_json || '{}')
        } catch {
          return {}
        }
      })(),
      evidence_json: undefined,
      before_json: undefined,
      after_json: undefined,
      validation_json: undefined,
      deployment_json: undefined,
    })),
  })
})

app.post('/analytics/hermes/improvements', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  if (!String(body.conversation_id || '').trim())
    return c.json({ error: 'conversation_id required; self-improvement is conversation-bound' }, 400)
  const id = `improvement_${crypto.randomUUID()}`
  const layer = ['profile', 'recommendation', 'system', 'code', 'hermes'].includes(body.layer) ? body.layer : 'system'
  const risk = ['low', 'medium', 'high'].includes(body.risk_level)
    ? body.risk_level
    : layer === 'code'
      ? 'high'
      : 'medium'
  await c.env.DB.prepare(
    `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json,baseline_version,rollback_version) VALUES (?,?,?,?,?,'evaluating',?,?,?,?,?)`,
  )
    .bind(
      id,
      String(body.conversation_id).slice(0, 200),
      'conversation_self_improvement',
      layer,
      risk,
      Math.max(0, Math.min(1, Number(body.confidence || 0))),
      JSON.stringify(body.evidence || []),
      JSON.stringify(body.before || {}),
      body.baseline_version || null,
      body.rollback_version || null,
    )
    .run()
  return c.json({ ok: true, id, status: 'evaluating' }, 201)
})

app.post('/analytics/hermes/improvements/:id/complete', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const run = await c.env.DB.prepare(
    `SELECT * FROM self_improvement_runs WHERE id=? AND status IN ('observed','evaluating','validated','applied')`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!run) return c.json({ error: 'open improvement run not found' }, 404)
  const requestedStatus = String(body.status || 'applied')
  if (requestedStatus === 'failed') {
    if (run.status === 'applied') return c.json({ error: 'applied improvement must be reverted, not failed' }, 409)
    const message = String(body.error || '')
      .trim()
      .slice(0, 2000)
    if (!message) return c.json({ error: 'error required for failed improvement' }, 400)
    await c.env.DB.prepare(
      `UPDATE self_improvement_runs SET status='failed',confidence=?,after_json=?,validation_json=?,deployment_json=?,error=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
    )
      .bind(
        Math.max(Number(run.confidence || 0), Math.min(1, Number(body.confidence || 0))),
        JSON.stringify(body.after || {}),
        JSON.stringify(body.validation || {}),
        JSON.stringify(body.deployment || {}),
        message,
        run.id,
      )
      .run()
    return c.json({ ok: true, id: run.id, status: 'failed', resumable: body.validation?.resumable === true })
  }
  if (requestedStatus === 'no_change') {
    if (run.status === 'applied')
      return c.json({ error: 'applied improvement must be reverted, not closed as no-change' }, 409)
    let evidence: unknown[] = []
    try {
      evidence = JSON.parse(run.evidence_json || '[]')
    } catch {}
    if (body.validation?.no_change !== true || body.after?.changed !== false || evidence.length === 0) {
      return c.json({ error: 'no-change requires evidence, after.changed=false, and validation.no_change=true' }, 409)
    }
    await c.env.DB.prepare(
      `UPDATE self_improvement_runs SET status='validated',confidence=?,after_json=?,validation_json=?,deployment_json='{}',error=NULL,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
    )
      .bind(
        Math.max(Number(run.confidence || 0), Math.min(1, Number(body.confidence || 0))),
        JSON.stringify(body.after),
        JSON.stringify(body.validation),
        run.id,
      )
      .run()
    return c.json({ ok: true, id: run.id, status: 'validated', decision: 'no_change' })
  }
  const validationPassed = body.validation?.passed === true
  const deploymentRequested = requestedStatus === 'deployed'
  if (['code', 'system', 'hermes'].includes(run.layer) && !validationPassed)
    return c.json({ error: 'validated checks are required for system changes' }, 409)
  if (deploymentRequested && !String(body.rollback_version || run.rollback_version || '').trim())
    return c.json({ error: 'rollback_version required before deployment' }, 409)
  const status = deploymentRequested ? 'deployed' : 'applied'
  await c.env.DB.prepare(
    `UPDATE self_improvement_runs SET status=?,confidence=?,after_json=?,validation_json=?,deployment_json=?,deployed_version=?,rollback_version=COALESCE(?,rollback_version),error=NULL,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
  )
    .bind(
      status,
      Math.max(Number(run.confidence || 0), Math.min(1, Number(body.confidence || 0))),
      JSON.stringify(body.after || {}),
      JSON.stringify(body.validation || {}),
      JSON.stringify(body.deployment || {}),
      body.deployed_version || null,
      body.rollback_version || null,
      run.id,
    )
    .run()
  return c.json({ ok: true, id: run.id, status })
})

app.post('/analytics/hermes/improvements/:id/revert', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const result = await c.env.DB.prepare(
    `UPDATE self_improvement_runs SET status='reverted',deployment_json=?,error=NULL,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=? AND status IN ('applied','deployed','failed')`,
  )
    .bind(JSON.stringify({ reverted: true, ...(body || {}) }), c.req.param('id'))
    .run()
  return result.meta.changes
    ? c.json({ ok: true, status: 'reverted' })
    : c.json({ error: 'revertible improvement run not found' }, 404)
})

export default app
