import {
  LEARNING_OBJECTIVE_VERSION,
  PROFILE_POLICY_VERSION,
  assertionKey,
  canonicalCreatorKey,
  canonicalFormat,
  computeLearningUtility,
  profileMutationPolicy,
  type SignalScope,
} from '../intelligence-v2.ts'
import { recordLearningEvent } from './learning-core.ts'
import {
  isSupportedProposalType,
  mergeQualityRules,
  normalizeProposalType,
  serializeProfileValue,
} from './profile-proposals.ts'

const ratingLabels: Record<string, number> = { love: 10, like: 8, meh: 5, dislike: 2 }
const json = (value: unknown, fallback: any = null) => {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
const parsedJson = (value: unknown) => {
  if (typeof value !== 'string') return { ok: true, value }
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false, value: null }
  }
}
const stableId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const cleanText = (value: unknown, max = 4000) =>
  String(value || '')
    .trim()
    .slice(0, max)
const ratingFrom = (row: any): number | null => {
  const candidates = [
    row?.explicit_rating,
    row?.rating_event_score,
    row?.compass_score,
    row?.status === 'rejected' ? null : row?.user_score,
  ]
  for (const candidate of candidates)
    if (candidate != null && Number.isFinite(Number(candidate))) return Math.max(0, Math.min(10, Number(candidate)))
  return row?.status === 'rejected' ? null : (ratingLabels[String(row?.user_rating || '').toLowerCase()] ?? null)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function ensureCreatorEntity(DB: D1Database, rawCreator: unknown) {
  const key = canonicalCreatorKey(rawCreator)
  if (!key) return null
  const existing = await DB.prepare(
    `SELECT id,canonical_name,normalized_key FROM creator_entities WHERE normalized_key=?`,
  )
    .bind(key)
    .first<any>()
  if (existing) {
    await DB.prepare(`INSERT OR IGNORE INTO creator_aliases(alias_key,entity_id,raw_alias) VALUES (?,?,?)`)
      .bind(key, existing.id, String(rawCreator).trim())
      .run()
    return existing
  }
  const id = `creator_${key.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 70) || crypto.randomUUID()}`
  await DB.batch([
    DB.prepare(`INSERT OR IGNORE INTO creator_entities(id,canonical_name,normalized_key) VALUES (?,?,?)`).bind(
      id,
      String(rawCreator).trim(),
      key,
    ),
    DB.prepare(`INSERT OR IGNORE INTO creator_aliases(alias_key,entity_id,raw_alias) VALUES (?,?,?)`).bind(
      key,
      id,
      String(rawCreator).trim(),
    ),
  ])
  return DB.prepare(`SELECT id,canonical_name,normalized_key FROM creator_entities WHERE normalized_key=?`)
    .bind(key)
    .first<any>()
}

export async function refreshRecommendationOutcome(DB: D1Database, recommendationId: string) {
  const [recommendation, disposition, latestSignal] = await Promise.all([
    DB.prepare(
      `SELECT r.id,r.status,r.creator,r.content_type,r.user_score,r.user_rating,r.consumed_date,m.branch_id,
      (SELECT signal_value*10 FROM learning_events le WHERE le.recommendation_id=r.id AND le.event_type='rating_recorded' AND le.is_explicit=1 ORDER BY le.occurred_at DESC LIMIT 1) explicit_rating,
      (SELECT score FROM rating_events re WHERE re.recommendation_id=r.id ORDER BY re.created_at DESC LIMIT 1) rating_event_score,
      (SELECT score FROM compass_feedback cf WHERE cf.recommendation_id=r.id AND cf.score IS NOT NULL ORDER BY cf.created_at DESC LIMIT 1) compass_score
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`,
    )
      .bind(recommendationId)
      .first<any>(),
    DB.prepare(
      `SELECT json_extract(payload_json,'$.disposition') disposition FROM learning_events
      WHERE recommendation_id=? AND event_type='disposition_recorded' AND is_explicit=1
      ORDER BY occurred_at DESC LIMIT 1`,
    )
      .bind(recommendationId)
      .first<any>()
      .catch(() => null),
    DB.prepare(
      `SELECT event_type,origin FROM learning_events WHERE recommendation_id=? AND is_explicit=1 ORDER BY occurred_at DESC LIMIT 1`,
    )
      .bind(recommendationId)
      .first<any>()
      .catch(() => null),
  ])
  if (!recommendation) return null
  const rating = ratingFrom(recommendation)
  const utility = computeLearningUtility({
    rating,
    disposition: disposition?.disposition || null,
    evidence: [],
  })
  const creator = await ensureCreatorEntity(DB, recommendation.creator)
  const outcomeStatus =
    recommendation.status === 'consumed' ? 'consumed' : recommendation.status === 'rejected' ? 'rejected' : 'active'
  const origin = latestSignal?.origin || (recommendation.status === 'rejected' ? 'administrative_exclusion' : 'legacy')
  await DB.prepare(
    `INSERT INTO recommendation_outcomes
    (id,recommendation_id,creator,format,branch_id,actual_score,outcome_status,consumed_at,evaluated_at,outcome_origin,training_eligible,taste_value,disposition_value,evidence_value,learning_value,applied_value,learning_confidence,objective_version,format_key,creator_key)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(recommendation_id) DO UPDATE SET
      creator=excluded.creator,format=excluded.format,branch_id=excluded.branch_id,actual_score=excluded.actual_score,
      outcome_status=excluded.outcome_status,consumed_at=COALESCE(excluded.consumed_at,recommendation_outcomes.consumed_at),
      evaluated_at=datetime('now'),outcome_origin=excluded.outcome_origin,training_eligible=excluded.training_eligible,
      taste_value=excluded.taste_value,disposition_value=excluded.disposition_value,evidence_value=excluded.evidence_value,
      learning_value=excluded.learning_value,applied_value=excluded.applied_value,learning_confidence=excluded.learning_confidence,
      objective_version=excluded.objective_version,format_key=excluded.format_key,creator_key=excluded.creator_key`,
  )
    .bind(
      `outcome_${recommendationId}`,
      recommendationId,
      recommendation.creator || null,
      recommendation.content_type || null,
      recommendation.branch_id || null,
      rating,
      outcomeStatus,
      recommendation.status === 'consumed'
        ? recommendation.consumed_date || new Date().toISOString().slice(0, 10)
        : null,
      origin,
      utility.trainingEligible ? 1 : 0,
      utility.tasteValue,
      utility.dispositionValue,
      utility.evidenceValue,
      utility.learningValue,
      utility.evidenceValue == null ? null : utility.evidenceValue * 10,
      utility.confidence,
      LEARNING_OBJECTIVE_VERSION,
      canonicalFormat(recommendation.content_type),
      creator?.normalized_key || null,
    )
    .run()
  return { recommendationId, rating, disposition: disposition?.disposition || null, ...utility }
}

export async function recordRecommendationSignal(
  DB: D1Database,
  input: {
    idempotencyKey: string
    eventType: string
    recommendationId: string
    actorType?: 'user' | 'system' | 'agent'
    threadId?: string | null
    pickId?: string | null
    reasonCode?: string | null
    signalScope?: SignalScope
    signalValue?: number | null
    explicit?: boolean
    origin: string
    payload?: unknown
  },
) {
  await recordLearningEvent(DB, {
    eventType: input.eventType,
    actorType: input.actorType || 'user',
    evidenceWeight: input.signalScope === 'utility' || input.signalScope === 'both' ? 1 : 0,
    idempotencyKey: input.idempotencyKey,
    threadId: input.threadId,
    recommendationId: input.recommendationId,
    pickId: input.pickId,
    reasonCode: input.reasonCode,
    signalScope: input.signalScope || 'none',
    signalValue: input.signalValue,
    explicit: input.explicit !== false,
    origin: input.origin,
    payload: input.payload,
  })
  return refreshRecommendationOutcome(DB, input.recommendationId)
}

export async function syncRecommendationFeedbackSignals(
  DB: D1Database,
  input: {
    recommendationId: string
    sourceKey: string
    threadId?: string | null
    rating?: number | null
    disposition?: string | null
    completed?: boolean
    reflection?: string | null
  },
) {
  if (input.completed)
    await recordLearningEvent(DB, {
      eventType: 'source_completed',
      actorType: 'user',
      idempotencyKey: `${input.sourceKey}:completed`,
      threadId: input.threadId,
      recommendationId: input.recommendationId,
      signalScope: 'none',
      explicit: true,
      origin: 'learning_feedback',
      payload: { reflection_present: Boolean(input.reflection) },
    })
  if (input.rating != null && Number.isFinite(Number(input.rating)))
    await recordLearningEvent(DB, {
      eventType: 'rating_recorded',
      actorType: 'user',
      evidenceWeight: 1,
      idempotencyKey: `${input.sourceKey}:rating`,
      threadId: input.threadId,
      recommendationId: input.recommendationId,
      signalScope: 'utility',
      signalValue: Math.max(0, Math.min(10, Number(input.rating))) / 10,
      explicit: true,
      origin: 'learning_feedback',
      payload: { score: Number(input.rating) },
    })
  const disposition = String(input.disposition || 'undecided').toLowerCase()
  const dispositionValues: Record<string, number> = { apply: 1, retain: 0.8, reference: 0.5, drop: 0 }
  if (disposition in dispositionValues)
    await recordLearningEvent(DB, {
      eventType: 'disposition_recorded',
      actorType: 'user',
      evidenceWeight: 1,
      idempotencyKey: `${input.sourceKey}:disposition`,
      threadId: input.threadId,
      recommendationId: input.recommendationId,
      signalScope: 'utility',
      signalValue: dispositionValues[disposition],
      explicit: true,
      origin: 'learning_feedback',
      payload: { disposition },
    })
  return refreshRecommendationOutcome(DB, input.recommendationId)
}

async function repairRows(DB: D1Database) {
  return (
    (
      await DB.prepare(
        `SELECT o.id outcome_id,o.recommendation_id,o.actual_score,o.outcome_status,o.evaluated_at,o.outcome_origin,o.training_eligible,o.learning_value,o.objective_version,o.format_key,o.creator_key,
      r.status,r.user_score,r.user_rating,r.user_review,r.creator,r.content_type,r.updated_at,
      (SELECT score FROM rating_events re WHERE re.recommendation_id=r.id ORDER BY re.created_at DESC LIMIT 1) rating_event_score,
      (SELECT score FROM compass_feedback cf WHERE cf.recommendation_id=r.id AND cf.score IS NOT NULL ORDER BY cf.created_at DESC LIMIT 1) compass_score,
      (SELECT COUNT(*) FROM compass_feedback cf WHERE cf.recommendation_id=r.id AND (cf.score IS NOT NULL OR COALESCE(cf.reflection,'')!='' OR cf.reason_tags_json!='[]')) explicit_feedback_count,
      (SELECT COUNT(*) FROM learning_events le WHERE le.recommendation_id=r.id AND le.event_type='rating_recorded' AND le.is_explicit=1) explicit_rating_event_count
    FROM recommendation_outcomes o JOIN recommendations r ON r.id=o.recommendation_id ORDER BY o.recommendation_id`,
      ).all<any>()
    ).results || []
  )
}

async function legacyProfileRepairPreview(DB: D1Database) {
  const [profile, assertionsResult, proposalsResult] = await Promise.all([
    DB.prepare(`SELECT * FROM profile WHERE id=1`).first<any>(),
    DB.prepare(
      `SELECT assertion_key,version,value_json,status FROM profile_assertions ORDER BY assertion_key`,
    ).all<any>(),
    DB.prepare(
      `SELECT id,change_type,target_label,status,fingerprint,proposed_json,confidence FROM feedback_proposals ORDER BY id`,
    ).all<any>(),
  ])
  const assertions = assertionsResult.results || []
  const proposals = proposalsResult.results || []
  const assertionKeys = new Set(assertions.map((item: any) => String(item.assertion_key)))
  const proposalFingerprints = new Set(proposals.map((item: any) => String(item.fingerprint || '')))
  const deterministicImports: string[] = []
  const reviewProposals: string[] = []
  if (profile) {
    for (const [field] of [
      ['identity_json'],
      ['mega_priority_json'],
      ['reaction_style_json'],
      ['quality_rules_json'],
      ['operational_style_json'],
      ['patterns_summary_json'],
    ]) {
      const raw = profile[field]
      if (raw == null || raw === '') continue
      const parsed = parsedJson(raw)
      if (parsed.ok) {
        if (!assertionKeys.has(`legacy.${field.replace(/_json$/, '')}`)) deterministicImports.push(field)
      } else if (!proposalFingerprints.has(`historical-profile:${field}`)) reviewProposals.push(field)
    }
    for (const field of ['core_filter', 'recent_signal']) {
      if (cleanText(profile[field], 10000) && !proposalFingerprints.has(`historical-profile:${field}`))
        reviewProposals.push(field)
    }
  }
  const proposalAssertions = proposals
    .filter(
      (proposal: any) =>
        proposal.status === 'applied' &&
        !assertionKeys.has(assertionKey(`proposal.${proposal.change_type}.${proposal.target_label}`)),
    )
    .map((proposal: any) => proposal.id)
  const approvedToPending = proposals
    .filter((proposal: any) => proposal.status === 'approved')
    .map((proposal: any) => proposal.id)
  return {
    deterministic_imports: deterministicImports,
    review_proposals: reviewProposals,
    proposal_assertions: proposalAssertions,
    approved_to_pending: approvedToPending,
    changes_required:
      deterministicImports.length + reviewProposals.length + proposalAssertions.length + approvedToPending.length,
    source_state: {
      profile: profile || null,
      assertions,
      proposals: proposals.map((item: any) => ({
        id: item.id,
        status: item.status,
        fingerprint: item.fingerprint,
        proposed_json: item.proposed_json,
        confidence: item.confidence,
      })),
    },
  }
}

export async function recommendationRepairPreview(DB: D1Database) {
  const [rows, profile] = await Promise.all([repairRows(DB), legacyProfileRepairPreview(DB)])
  const classified = rows.map((row: any) => {
    const explicitRating = ratingFrom(row)
    const rejected = row.status === 'rejected' || row.outcome_status === 'rejected'
    const fabricated = rejected && Number(row.actual_score) === 2 && explicitRating === null
    const administrative = rejected && explicitRating === null && Number(row.explicit_feedback_count || 0) === 0
    const ambiguous = rejected && explicitRating === null && !administrative
    const canonicalKeysMissing = !row.format_key || (row.creator && !row.creator_key)
    const v2 = row.objective_version === LEARNING_OBJECTIVE_VERSION
    const needsRepair =
      fabricated ||
      (administrative &&
        (row.outcome_origin !== 'administrative_exclusion' ||
          Number(row.training_eligible || 0) !== 0 ||
          row.actual_score != null ||
          row.learning_value != null ||
          !v2 ||
          canonicalKeysMissing)) ||
      (ambiguous &&
        (row.outcome_origin !== 'ambiguous_explicit_feedback' ||
          Number(row.training_eligible || 0) !== 0 ||
          row.actual_score != null ||
          row.learning_value != null ||
          !v2 ||
          canonicalKeysMissing)) ||
      (explicitRating !== null &&
        (Number(row.explicit_rating_event_count || 0) === 0 ||
          Number(row.training_eligible || 0) !== 1 ||
          Number(row.actual_score) !== explicitRating ||
          row.learning_value == null ||
          !v2 ||
          canonicalKeysMissing)) ||
      (!rejected && explicitRating === null && (!v2 || canonicalKeysMissing))
    return {
      recommendation_id: row.recommendation_id,
      explicit_rating: explicitRating,
      fabricated,
      administrative,
      ambiguous,
      needs_repair: needsRepair,
      status: row.status,
    }
  })
  const actionable = classified.filter((row) => row.needs_repair)
  const sourceClock = await sha256(
    JSON.stringify({
      outcomes: rows.map((row: any) => [
        row.recommendation_id,
        row.evaluated_at,
        row.updated_at,
        row.actual_score,
        row.outcome_origin,
        row.training_eligible,
        row.learning_value,
        row.objective_version,
        row.explicit_rating_event_count,
      ]),
      profile: profile.source_state,
    }),
  )
  const summary = {
    total: classified.length,
    changes_required: actionable.length + profile.changes_required,
    outcome_changes_required: actionable.length,
    fabricated_scores: actionable.filter((row) => row.fabricated).length,
    administrative_exclusions: actionable.filter((row) => row.administrative).length,
    ambiguous_exclusions: actionable.filter((row) => row.ambiguous).length,
    explicit_ratings: actionable.filter((row) => row.explicit_rating !== null).length,
    profile_changes_required: profile.changes_required,
    source_clock: sourceClock,
  }
  const snapshotId = await sha256(JSON.stringify(summary))
  return {
    snapshot_id: snapshotId,
    summary: { ...summary, source_clock: undefined },
    profile: {
      deterministic_imports: profile.deterministic_imports,
      review_proposals: profile.review_proposals,
      proposal_assertions: profile.proposal_assertions,
      approved_to_pending: profile.approved_to_pending,
    },
    rows: classified,
  }
}

async function importLegacyProfile(DB: D1Database, runId: string) {
  const profile = await DB.prepare(`SELECT * FROM profile WHERE id=1`).first<any>()
  const imported: string[] = []
  const pending: string[] = []
  if (profile) {
    const fields: Array<[string, string]> = [
      ['identity_json', 'identity'],
      ['mega_priority_json', 'priority'],
      ['reaction_style_json', 'reaction_style'],
      ['quality_rules_json', 'quality_rule'],
      ['operational_style_json', 'operational_style'],
      ['patterns_summary_json', 'pattern'],
    ]
    for (const [field, category] of fields) {
      const raw = profile[field]
      if (raw == null || raw === '') continue
      const parsed = parsedJson(raw)
      if (parsed.ok) {
        const key = `legacy.${field.replace(/_json$/, '')}`
        const existing = await DB.prepare(`SELECT id FROM profile_assertions WHERE assertion_key=?`).bind(key).first()
        if (!existing) {
          const id = stableId('assertion')
          await DB.batch([
            DB.prepare(
              `INSERT INTO profile_assertions(id,assertion_key,category,value_json,confidence,status,source_kind,evidence_json) VALUES (?,?,?,?,1,'active','legacy_profile',?)`,
            ).bind(id, key, category, JSON.stringify(parsed.value), JSON.stringify([{ source: 'profile', field }])),
            DB.prepare(
              `INSERT INTO profile_assertion_revisions(id,assertion_id,revision,before_json,after_json,actor_type,decision_source,confidence,evidence_json,improvement_run_id) VALUES (?,?,1,NULL,?,'system','historical_repair',1,?,?)`,
            ).bind(
              stableId('profile_revision'),
              id,
              JSON.stringify({ value: parsed.value, category, status: 'active' }),
              JSON.stringify([{ source: 'profile', field }]),
              runId,
            ),
          ])
        }
        imported.push(field)
      } else {
        const fingerprint = `historical-profile:${field}`
        await DB.prepare(
          `INSERT OR IGNORE INTO feedback_proposals(id,change_type,target_label,current_json,proposed_json,evidence,reasoning,confidence,status,fingerprint,layer,risk_level,evidence_json,policy_version,improvement_run_id)
          VALUES (?,?,?,?,?,?,?,.5,'pending',?,'profile','medium',?,'profile_v2',?)`,
        )
          .bind(
            `historical_${field}`,
            'profile_update',
            `Normalize legacy ${field}`,
            JSON.stringify(raw),
            JSON.stringify({ field, raw }),
            `Legacy ${field} is free-form and cannot be normalized deterministically.`,
            'Historical repair preserves it for explicit review.',
            fingerprint,
            JSON.stringify([{ source: 'profile', field }]),
            runId,
          )
          .run()
        pending.push(field)
      }
    }
    for (const [field, category] of [
      ['core_filter', 'core_filter'],
      ['recent_signal', 'profile_signal'],
    ] as Array<[string, string]>) {
      const raw = cleanText(profile[field], 10000)
      if (!raw) continue
      const fingerprint = `historical-profile:${field}`
      await DB.prepare(
        `INSERT OR IGNORE INTO feedback_proposals(id,change_type,target_label,current_json,proposed_json,evidence,reasoning,confidence,status,fingerprint,layer,risk_level,evidence_json,policy_version,improvement_run_id)
        VALUES (?,?,?,?,?,?,?,.5,'pending',?,'profile','medium',?,'profile_v2',?)`,
      )
        .bind(
          `historical_${field}`,
          category,
          `Normalize legacy ${field}`,
          JSON.stringify(raw),
          JSON.stringify({ field, raw }),
          `Legacy ${field} is free-form and cannot be normalized deterministically.`,
          'Historical repair preserves it for explicit review.',
          fingerprint,
          JSON.stringify([{ source: 'profile', field }]),
          runId,
        )
        .run()
      pending.push(field)
    }
  }

  const proposals =
    (
      await DB.prepare(
        `SELECT * FROM feedback_proposals WHERE status IN ('applied','approved') ORDER BY created_at`,
      ).all<any>()
    ).results || []
  for (const proposal of proposals) {
    if (proposal.status === 'approved') {
      await DB.prepare(`UPDATE feedback_proposals SET status='pending',decision_source=NULL WHERE id=?`)
        .bind(proposal.id)
        .run()
      continue
    }
    const key = assertionKey(`proposal.${proposal.change_type}.${proposal.target_label}`)
    const confidence = Math.max(0, Math.min(1, Number(proposal.confidence || 0)))
    const status = confidence >= 0.8 ? 'active' : 'hypothesis'
    await DB.prepare(
      `INSERT OR IGNORE INTO profile_assertions(id,assertion_key,category,value_json,confidence,status,source_kind,evidence_json)
      VALUES (?,?,?,?,?,?, 'feedback_proposal',?)`,
    )
      .bind(
        stableId('assertion'),
        key,
        String(proposal.change_type),
        proposal.proposed_json,
        confidence,
        status,
        JSON.stringify([{ proposal_id: proposal.id, source: 'feedback_proposals' }]),
      )
      .run()
  }
  return { imported, pending }
}

export async function applyRecommendationRepair(DB: D1Database, expectedSnapshot: string, conversationId: string) {
  const preview = await recommendationRepairPreview(DB)
  if (preview.snapshot_id !== expectedSnapshot)
    return { ok: false as const, error: 'repair_snapshot_changed', current: preview }
  const runId = stableId('improvement')
  await DB.prepare(
    `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json)
    VALUES (?,?,'historical_repair','recommendation_profile','medium','validated',1,?,?)`,
  )
    .bind(runId, conversationId, JSON.stringify([{ snapshot_id: expectedSnapshot }]), JSON.stringify(preview.summary))
    .run()
  try {
    for (const row of preview.rows.filter((item) => item.needs_repair)) {
      if (row.fabricated || row.administrative) {
        await recordLearningEvent(DB, {
          eventType: 'administrative_exclusion',
          actorType: 'system',
          idempotencyKey: `repair:administrative:${row.recommendation_id}`,
          recommendationId: row.recommendation_id,
          signalScope: 'none',
          explicit: false,
          origin: 'historical_repair',
          payload: { fabricated_score_removed: row.fabricated },
        })
        await refreshRecommendationOutcome(DB, row.recommendation_id)
      } else if (row.explicit_rating !== null) {
        await recordLearningEvent(DB, {
          eventType: 'rating_recorded',
          actorType: 'user',
          evidenceWeight: 1,
          idempotencyKey: `repair:rating:${row.recommendation_id}`,
          recommendationId: row.recommendation_id,
          signalScope: 'utility',
          signalValue: row.explicit_rating / 10,
          explicit: true,
          origin: 'historical_repair',
          payload: { score: row.explicit_rating },
        })
        await refreshRecommendationOutcome(DB, row.recommendation_id)
      } else if (row.ambiguous) {
        const source = await DB.prepare(`SELECT creator,content_type FROM recommendations WHERE id=?`)
          .bind(row.recommendation_id)
          .first<any>()
        const creator = await ensureCreatorEntity(DB, source?.creator)
        await DB.prepare(
          `UPDATE recommendation_outcomes SET actual_score=NULL,training_eligible=0,taste_value=NULL,disposition_value=NULL,evidence_value=NULL,learning_value=NULL,applied_value=NULL,learning_confidence=0,objective_version=?,outcome_origin='ambiguous_explicit_feedback',format_key=?,creator_key=?,evaluated_at=datetime('now') WHERE recommendation_id=?`,
        )
          .bind(
            LEARNING_OBJECTIVE_VERSION,
            canonicalFormat(source?.content_type),
            creator?.normalized_key || null,
            row.recommendation_id,
          )
          .run()
      } else {
        await refreshRecommendationOutcome(DB, row.recommendation_id)
      }
    }
    const profile = await importLegacyProfile(DB, runId)
    const after = await recommendationRepairPreview(DB)
    await DB.prepare(
      `UPDATE self_improvement_runs SET status='applied',after_json=?,validation_json=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
    )
      .bind(
        JSON.stringify(after.summary),
        JSON.stringify({ fabricated_scores: after.summary.fabricated_scores, profile }),
        runId,
      )
      .run()
    return { ok: true as const, run_id: runId, before: preview.summary, after: after.summary, profile }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await DB.prepare(
      `UPDATE self_improvement_runs SET status='failed',error=?,validation_json=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
    )
      .bind(message.slice(0, 2000), JSON.stringify({ resumable: true, error: message.slice(0, 2000) }), runId)
      .run()
      .catch(() => {})
    throw error
  }
}

export type ProfileAssertionInput = {
  assertionKey: string
  category: string
  scope?: string
  value: unknown
  weight?: number | null
  confidence: number
  status?: 'active' | 'hypothesis' | 'inactive'
  sourceKind: string
  evidence?: unknown[]
  actorType: 'user' | 'agent' | 'system'
  decisionSource: 'user' | 'hermes_auto'
  directUserStatement?: boolean
  directContradiction?: boolean
  targetVersion?: number | null
  proposalId?: string | null
  improvementRunId?: string | null
}

export async function applyProfileAssertion(DB: D1Database, input: ProfileAssertionInput) {
  const key = assertionKey(input.assertionKey)
  const current = await DB.prepare(`SELECT * FROM profile_assertions WHERE assertion_key=?`).bind(key).first<any>()
  if (input.targetVersion != null && Number(current?.version || 0) !== Number(input.targetVersion))
    return { ok: false as const, error: 'profile_version_conflict', current }
  const nextValue = JSON.stringify(input.value)
  const replacingExplicit = Boolean(current && current.source_kind === 'user' && current.value_json !== nextValue)
  const evidence = Array.isArray(input.evidence) ? input.evidence : []
  const policy = profileMutationPolicy({
    decisionSource: input.decisionSource,
    confidence: input.confidence,
    evidenceCount: evidence.length,
    directUserStatement: input.directUserStatement,
    replacingExplicit,
    directContradiction: input.directContradiction,
  })
  if (!policy.eligible) return { ok: false as const, error: policy.reason, threshold: policy.threshold }
  if (current && current.value_json === nextValue && current.status === (input.status || 'active'))
    return { ok: true as const, unchanged: true, assertion: current }
  const id = current?.id || stableId('assertion')
  const version = Number(current?.version || 0) + 1
  const status = input.status || 'active'
  const after = {
    id,
    assertion_key: key,
    category: input.category,
    scope: input.scope || 'global',
    value_json: nextValue,
    weight: input.weight ?? null,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    status,
    source_kind: input.sourceKind,
    evidence_json: JSON.stringify(evidence),
    version,
  }
  await DB.batch([
    DB.prepare(
      `INSERT INTO profile_assertions(id,assertion_key,category,scope,value_json,weight,confidence,status,source_kind,evidence_json,version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(assertion_key) DO UPDATE SET category=excluded.category,scope=excluded.scope,value_json=excluded.value_json,weight=excluded.weight,confidence=excluded.confidence,status=excluded.status,source_kind=excluded.source_kind,evidence_json=excluded.evidence_json,version=excluded.version,updated_at=datetime('now')`,
    ).bind(
      id,
      key,
      after.category,
      after.scope,
      nextValue,
      after.weight,
      after.confidence,
      status,
      after.source_kind,
      after.evidence_json,
      version,
    ),
    DB.prepare(
      `INSERT INTO profile_assertion_revisions(id,assertion_id,revision,before_json,after_json,actor_type,decision_source,confidence,evidence_json,proposal_id,improvement_run_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      stableId('profile_revision'),
      id,
      version,
      current ? JSON.stringify(current) : null,
      JSON.stringify(after),
      input.actorType,
      input.decisionSource,
      after.confidence,
      after.evidence_json,
      input.proposalId || null,
      input.improvementRunId || null,
    ),
  ])
  return { ok: true as const, assertion: { ...after, value: input.value }, policy }
}

const proposalEvidence = (proposal: any) => {
  const structured = json(proposal.evidence_json, [])
  const evidence = Array.isArray(structured) ? structured.filter(Boolean) : structured ? [structured] : []
  if (proposal.evidence) {
    const legacy = json(proposal.evidence, proposal.evidence)
    if (Array.isArray(legacy)) evidence.push(...legacy.filter(Boolean))
    else if (legacy) evidence.push(typeof legacy === 'object' ? legacy : { source: 'proposal', quote: String(legacy) })
  }
  return evidence.slice(0, 20)
}

export async function applyFeedbackProposal(
  DB: D1Database,
  proposalId: string,
  decisionSource: 'user' | 'hermes_auto',
) {
  const proposal = await DB.prepare(`SELECT * FROM feedback_proposals WHERE id=? AND status IN ('pending','approved')`)
    .bind(proposalId)
    .first<any>()
  if (!proposal) return { ok: false as const, error: 'pending_proposal_not_found' }
  if (!isSupportedProposalType(proposal.change_type))
    return { ok: false as const, error: 'unsupported_proposal_type', change_type: proposal.change_type }
  const changeType = normalizeProposalType(proposal.change_type)
  const proposed = json(proposal.proposed_json, proposal.proposed_json)
  const evidence = proposalEvidence(proposal)
  const runId = proposal.improvement_run_id || stableId('improvement')
  const profile = await DB.prepare(
    `SELECT recent_signal,quality_rules_json,operational_style_json,core_filter FROM profile WHERE id=1`,
  ).first<any>()
  if (!proposal.improvement_run_id)
    await DB.prepare(
      `INSERT INTO self_improvement_runs(id,conversation_id,trigger_kind,layer,risk_level,status,confidence,evidence_json,before_json)
    VALUES (?,?,?,?,?,'evaluating',?,?,?)`,
    )
      .bind(
        runId,
        proposal.conversation_id || `proposal-review:${proposal.id}`,
        'conversation_feedback',
        proposal.layer || 'profile',
        proposal.risk_level || 'low',
        Math.max(0, Math.min(1, Number(proposal.confidence || 0))),
        JSON.stringify(evidence),
        JSON.stringify({
          proposal_id: proposal.id,
          current: json(proposal.current_json),
          legacy_profile: profile || null,
        }),
      )
      .run()
  const category =
    changeType === 'pattern_hypothesis' ? 'pattern' : changeType === 'profile_update' ? 'profile_signal' : changeType
  const assertion = await applyProfileAssertion(DB, {
    assertionKey: `proposal.${category}.${proposal.target_label}`,
    category,
    value: proposed,
    confidence: Math.max(0, Math.min(1, Number(proposal.confidence || 0))),
    status: changeType === 'pattern_hypothesis' ? 'hypothesis' : 'active',
    sourceKind: 'feedback_proposal',
    evidence,
    actorType: decisionSource === 'user' ? 'user' : 'agent',
    decisionSource,
    directUserStatement:
      decisionSource === 'user' ||
      evidence.some((item: any) => item?.kind === 'user_statement' || item?.direct_user_statement === true),
    directContradiction: evidence.some(
      (item: any) => item?.kind === 'direct_contradiction' || item?.direct_contradiction === true,
    ),
    targetVersion: proposal.target_version,
    proposalId: proposal.id,
    improvementRunId: runId,
  })
  if (!assertion.ok) {
    const validation = {
      policy_version: PROFILE_POLICY_VERSION,
      eligible: false,
      reason: assertion.error,
      threshold: (assertion as any).threshold ?? null,
    }
    const appliedInRun = await DB.prepare(
      `SELECT COUNT(*) count FROM feedback_proposals WHERE improvement_run_id=? AND status='applied'`,
    )
      .bind(runId)
      .first<any>()
    const runStatus = Number(appliedInRun?.count || 0) > 0 ? 'applied' : 'blocked'
    await DB.batch([
      DB.prepare(
        `UPDATE feedback_proposals SET validation_json=?,policy_version=?,decision_source=?,improvement_run_id=? WHERE id=?`,
      ).bind(JSON.stringify(validation), PROFILE_POLICY_VERSION, decisionSource, runId, proposal.id),
      DB.prepare(
        `UPDATE self_improvement_runs SET status=?,validation_json=?,error=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
      ).bind(runStatus, JSON.stringify(validation), assertion.error, runId),
    ])
    return { ...assertion, run_id: runId }
  }

  const proposedText = typeof proposed === 'string' ? proposed : JSON.stringify(proposed)
  const statements: D1PreparedStatement[] = [
    DB.prepare(`INSERT OR IGNORE INTO profile(id,last_synced_at) VALUES (1,datetime('now'))`),
  ]
  let compatibility: { field: string; before: unknown; after: unknown } | null = null
  if (changeType === 'profile_signal' || changeType === 'profile_update') {
    compatibility = { field: 'recent_signal', before: profile?.recent_signal ?? null, after: proposedText }
    statements.push(
      DB.prepare(`UPDATE profile SET recent_signal=?,last_synced_at=datetime('now') WHERE id=1`).bind(
        compatibility.after,
      ),
    )
  } else if (changeType === 'quality_rule') {
    compatibility = {
      field: 'quality_rules_json',
      before: profile?.quality_rules_json ?? null,
      after: mergeQualityRules(profile?.quality_rules_json, proposed),
    }
    statements.push(
      DB.prepare(`UPDATE profile SET quality_rules_json=?,last_synced_at=datetime('now') WHERE id=1`).bind(
        compatibility.after,
      ),
    )
  } else if (changeType === 'operational_style') {
    compatibility = {
      field: 'operational_style_json',
      before: profile?.operational_style_json ?? null,
      after: serializeProfileValue(proposed),
    }
    statements.push(
      DB.prepare(`UPDATE profile SET operational_style_json=?,last_synced_at=datetime('now') WHERE id=1`).bind(
        compatibility.after,
      ),
    )
  } else if (changeType === 'core_filter') {
    const existing = String(profile?.core_filter || '')
    compatibility = {
      field: 'core_filter',
      before: profile?.core_filter ?? null,
      after: existing.includes(proposedText) ? existing : `${existing}${existing ? '\n' : ''}${proposedText}`,
    }
    statements.push(
      DB.prepare(`UPDATE profile SET core_filter=?,last_synced_at=datetime('now') WHERE id=1`).bind(
        compatibility.after,
      ),
    )
  }
  const receiptId = `proposal_receipt_${proposal.id}`
  const validation = {
    policy_version: PROFILE_POLICY_VERSION,
    eligible: true,
    reason: assertion.policy?.reason,
    assertion_key: (assertion.assertion as any)?.assertion_key,
  }
  const receipt = {
    kind: 'verified_self_improvement',
    proposal_id: proposal.id,
    recommendation_id: proposal.recommendation_id || null,
    run_id: runId,
    target: proposal.target_label,
    before: json(proposal.current_json),
    after: proposed,
    validation,
    decision_source: decisionSource,
  }
  const deployment = { ...json(proposal.deployment_json, {}), ...(compatibility ? { compatibility } : {}) }
  statements.push(
    DB.prepare(
      `UPDATE feedback_proposals SET status='applied',reviewed_at=datetime('now'),applied_at=datetime('now'),decision_source=?,validation_json=?,deployment_json=?,policy_version=?,applied_by=?,improvement_run_id=? WHERE id=? AND status IN ('pending','approved')`,
    ).bind(
      decisionSource,
      JSON.stringify(validation),
      JSON.stringify(deployment),
      PROFILE_POLICY_VERSION,
      decisionSource === 'user' ? 'user' : 'hermes',
      runId,
      proposal.id,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO hermes_memory(id,memory_key,memory_kind,value_json,confidence,source,status,evidence_json) VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      receiptId,
      `self_improvement:proposal:${proposal.id}`,
      'episodic',
      JSON.stringify(receipt),
      Math.max(0, Math.min(1, Number(proposal.confidence || 0))),
      `feedback_proposal:${proposal.id}`,
      'approved',
      JSON.stringify(evidence),
    ),
    DB.prepare(`INSERT INTO update_log(kind,summary,details_json) VALUES ('profile',?,?)`).bind(
      `${decisionSource === 'user' ? 'Applied' : 'Hermes auto-applied'} proposal: ${proposal.target_label}`,
      JSON.stringify({ ...receipt, receipt_id: receiptId }),
    ),
  )
  await DB.batch(statements)
  const appliedInRun =
    (
      await DB.prepare(
        `SELECT id FROM feedback_proposals WHERE improvement_run_id=? AND status='applied' ORDER BY applied_at,id`,
      )
        .bind(runId)
        .all<any>()
    ).results || []
  await DB.prepare(
    `UPDATE self_improvement_runs SET status='applied',after_json=?,validation_json=?,error=NULL,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
  )
    .bind(
      JSON.stringify({ proposal_ids: appliedInRun.map((item: any) => item.id), latest_assertion: assertion.assertion }),
      JSON.stringify(validation),
      runId,
    )
    .run()
  const revision = await DB.prepare(
    `SELECT id,revision FROM profile_assertion_revisions WHERE proposal_id=? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(proposal.id)
    .first<any>()
  return { ok: true as const, status: 'applied', run_id: runId, assertion: assertion.assertion, revision, validation }
}

export async function revertProfileRevision(DB: D1Database, revisionId: string, actorType: 'user' | 'agent' = 'user') {
  const revision = await DB.prepare(`SELECT * FROM profile_assertion_revisions WHERE id=?`)
    .bind(revisionId)
    .first<any>()
  if (!revision) return { ok: false as const, error: 'profile_revision_not_found' }
  const current = await DB.prepare(`SELECT * FROM profile_assertions WHERE id=?`)
    .bind(revision.assertion_id)
    .first<any>()
  if (!current) return { ok: false as const, error: 'profile_assertion_not_found' }
  const before = json(revision.before_json, null)
  const version = Number(current.version || 0) + 1
  const restored = before
    ? {
        category: before.category,
        scope: before.scope,
        value_json: before.value_json,
        weight: before.weight,
        confidence: before.confidence,
        status: before.status,
        source_kind: before.source_kind,
        evidence_json: before.evidence_json,
      }
    : { ...current, status: 'inactive' }
  await DB.batch([
    DB.prepare(
      `UPDATE profile_assertions SET category=?,scope=?,value_json=?,weight=?,confidence=?,status=?,source_kind=?,evidence_json=?,version=?,updated_at=datetime('now') WHERE id=?`,
    ).bind(
      restored.category,
      restored.scope,
      restored.value_json,
      restored.weight ?? null,
      restored.confidence,
      restored.status,
      restored.source_kind,
      restored.evidence_json || '[]',
      version,
      current.id,
    ),
    DB.prepare(
      `INSERT INTO profile_assertion_revisions(id,assertion_id,revision,before_json,after_json,actor_type,decision_source,confidence,evidence_json,revert_of)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      stableId('profile_revision'),
      current.id,
      version,
      JSON.stringify(current),
      JSON.stringify({ ...restored, version }),
      actorType,
      'revert',
      1,
      JSON.stringify([{ revision_id: revisionId }]),
      revisionId,
    ),
  ])
  return { ok: true as const, assertion_id: current.id, version, reverted_revision: revisionId }
}

export async function revertFeedbackProposal(DB: D1Database, proposalId: string, actorType: 'user' | 'agent' = 'user') {
  const proposal = await DB.prepare(
    `SELECT * FROM feedback_proposals WHERE id=? AND status='applied' AND reverted_at IS NULL`,
  )
    .bind(proposalId)
    .first<any>()
  if (!proposal) return { ok: false as const, error: 'applied_proposal_not_found' }
  const revision = await DB.prepare(
    `SELECT id FROM profile_assertion_revisions WHERE proposal_id=? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(proposal.id)
    .first<any>()
  if (!revision) return { ok: false as const, error: 'proposal_revision_not_found' }
  const reverted = await revertProfileRevision(DB, revision.id, actorType)
  if (!reverted.ok) return reverted
  const compatibility = json(proposal.deployment_json, {})?.compatibility
  const allowedCompatibilityFields = new Set([
    'recent_signal',
    'quality_rules_json',
    'operational_style_json',
    'core_filter',
  ])
  let compatibilityReverted: boolean | null = null
  const statements: D1PreparedStatement[] = [
    DB.prepare(
      `UPDATE feedback_proposals SET status='reverted',reverted_at=datetime('now'),reviewed_at=datetime('now') WHERE id=?`,
    ).bind(proposal.id),
  ]
  if (compatibility && allowedCompatibilityFields.has(String(compatibility.field))) {
    const field = String(compatibility.field)
    const current = await DB.prepare(`SELECT ${field} value FROM profile WHERE id=1`).first<any>()
    if ((current?.value ?? null) === (compatibility.after ?? null)) {
      statements.push(
        DB.prepare(`UPDATE profile SET ${field}=?,last_synced_at=datetime('now') WHERE id=1`).bind(
          compatibility.before ?? null,
        ),
      )
      compatibilityReverted = true
    } else compatibilityReverted = false
  }
  statements.push(
    DB.prepare(`INSERT INTO update_log(kind,summary,details_json) VALUES ('profile',?,?)`).bind(
      `Reverted proposal: ${proposal.target_label}`,
      JSON.stringify({ proposal_id: proposal.id, revision_id: revision.id }),
    ),
  )
  await DB.batch(statements)
  if (proposal.improvement_run_id) {
    const remaining =
      (
        await DB.prepare(
          `SELECT id FROM feedback_proposals WHERE improvement_run_id=? AND status='applied' ORDER BY applied_at,id`,
        )
          .bind(proposal.improvement_run_id)
          .all<any>()
      ).results || []
    await DB.prepare(
      `UPDATE self_improvement_runs SET status=?,after_json=?,rollback_version=?,updated_at=datetime('now'),completed_at=datetime('now') WHERE id=?`,
    )
      .bind(
        remaining.length ? 'applied' : 'reverted',
        JSON.stringify({ proposal_ids: remaining.map((item: any) => item.id), reverted_proposal_id: proposal.id }),
        `profile-revision:${revision.id}`,
        proposal.improvement_run_id,
      )
      .run()
  }
  return {
    ...reverted,
    status: 'reverted' as const,
    proposal_id: proposal.id,
    compatibility_reverted: compatibilityReverted,
  }
}

export async function profileIntelligenceSnapshot(DB: D1Database) {
  const [assertions, revisions, profile, unsupported] = await Promise.all([
    DB.prepare(
      `SELECT * FROM profile_assertions ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'hypothesis' THEN 1 ELSE 2 END,category,confidence DESC,updated_at DESC`,
    ).all<any>(),
    DB.prepare(
      `SELECT r.*,a.assertion_key,a.category FROM profile_assertion_revisions r JOIN profile_assertions a ON a.id=r.assertion_id ORDER BY r.created_at DESC LIMIT 100`,
    ).all<any>(),
    DB.prepare(`SELECT * FROM profile WHERE id=1`).first<any>(),
    DB.prepare(
      `SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending' AND policy_version='profile_v2'`,
    ).first<any>(),
  ])
  const rows = assertions.results || []
  const legacyFields = [
    'identity_json',
    'mega_priority_json',
    'core_filter',
    'reaction_style_json',
    'quality_rules_json',
    'operational_style_json',
    'patterns_summary_json',
    'recent_signal',
  ]
  const legacyCharacters = legacyFields.reduce((sum, field) => sum + String(profile?.[field] || '').length, 0)
  const active = rows.filter((row: any) => row.status === 'active')
  const stale = active.filter((row: any) => Date.now() - Date.parse(row.updated_at || '') > 180 * 86400000)
  return {
    assertions: rows.map((row: any) => ({
      ...row,
      value: json(row.value_json, row.value_json),
      evidence: json(row.evidence_json, []),
      value_json: undefined,
      evidence_json: undefined,
    })),
    revisions: (revisions.results || []).map((row: any) => ({
      ...row,
      before: json(row.before_json),
      after: json(row.after_json),
      evidence: json(row.evidence_json, []),
      before_json: undefined,
      after_json: undefined,
      evidence_json: undefined,
    })),
    health: {
      active: active.length,
      hypotheses: rows.filter((row: any) => row.status === 'hypothesis').length,
      inactive: rows.filter((row: any) => row.status === 'inactive').length,
      low_confidence_active: active.filter((row: any) => Number(row.confidence) < 0.8).length,
      stale: stale.length,
      pending_historical_normalization: Number(unsupported?.count || 0),
      legacy_characters: legacyCharacters,
      status: active.length && !stale.length && !Number(unsupported?.count || 0) ? 'healthy' : 'needs_attention',
    },
  }
}
