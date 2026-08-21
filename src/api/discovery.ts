import { Hono } from 'hono'
import { safeError, type Bindings } from '../lib'
import { createCapture } from '../services/capture'
import { adaptAndNormalizeWeights, computeDialecticDivergenceScore } from '../domain'
import { canonicalCreatorKey, canonicalFormat } from '../intelligence-v2'
import { AGENT_CONTRACT_VERSION, AGENT_PROTOCOL } from '../services/agent-capabilities'

const app = new Hono<{ Bindings: Bindings }>()

export interface CandidateInput {
  id?: string
  canonical_url: string
  title: string
  creator?: string
  format: string
  source_class: string // 'paper' | 'essay' | 'podcast' | 'book' | 'talk' | 'tool' | 'article'
  metadata?: Record<string, any>
  verification?: {
    verified_url?: string
    author_verified?: boolean
    published_date?: string
    source_trust_score?: number
    accessibility_checked?: boolean
    [key: string]: any
  }
  score_components?: {
    frontier_potential?: number
    info_gain?: number
    personal_pull?: number
    real_life_relevance?: number
    source_quality?: number
    format_exploration?: number
    dialectic_divergence?: number
    cos_sim?: number
    is_refutation?: boolean
  }
  total_score?: number
  rejection_reason?: string
  is_winner?: boolean
  is_verified?: boolean
}


export interface DecisionReceipt {
  why_this: string
  why_now: string
  explored_branch: string
  surprise: string
  confidence: number
  what_feedback_will_teach: string
}

const SKILL_PATH = '/home/mahmud/.hermes/skills/personal/taste-rec/SKILL.md'
const ACTIVE_SKILL_PATHS = [
  SKILL_PATH,
  '/home/mahmud/.hermes/skills/taste-mapper/SKILL.md',
  '/home/mahmud/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md',
  '/home/mahmud/.hermes/skills/workflow/recommendations-worker-ops/SKILL.md',
]

async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  try {
    const { createHash } = await import('node:crypto')
    return createHash('sha256').update(text).digest('hex')
  } catch {
    return 'unknown'
  }
}

/** Shared transactional, idempotent activation path for runs in selected or waiting_for_capacity */
export async function activateWaitingRun(DB: D1Database, targetRunId?: string) {
  let run = null
  if (targetRunId) {
    run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(targetRunId).first<any>()
  } else {
    run = await DB.prepare(`SELECT * FROM discovery_runs WHERE lifecycle = 'waiting_for_capacity' ORDER BY created_at ASC LIMIT 1`).first<any>()
  }

  if (!run || !run.selected_candidate_id) return null

  // Idempotency check: if already active or beyond, query recommendations using correct video_title column
  if (run.lifecycle === 'active' || run.lifecycle === 'interviewing' || run.lifecycle === 'resolved') {
    const candidate = await DB.prepare(`SELECT * FROM discovery_candidates WHERE id = ?`).bind(run.selected_candidate_id).first<any>()
    const rec = candidate ? await DB.prepare(
      `SELECT r.id as recommendation_id, s.id as session_id FROM recommendations r LEFT JOIN learning_sessions s ON s.recommendation_id = r.id WHERE r.video_title = ? ORDER BY r.created_at DESC LIMIT 1`
    ).bind(candidate.title).first<any>() : null

    return {
      run_id: run.id,
      recommendation_id: rec?.recommendation_id || null,
      session_id: rec?.session_id || null,
      candidate: candidate?.title || null,
      already_active: true,
    }
  }

  // Restrict activation strictly to selected or waiting_for_capacity
  if (run.lifecycle !== 'selected' && run.lifecycle !== 'waiting_for_capacity') {
    return null
  }

  // Atomically claim the state transition first to eliminate concurrent activation races
  const claimRes = await DB.prepare(
    `UPDATE discovery_runs SET lifecycle = 'active', updated_at = datetime('now') WHERE id = ? AND lifecycle IN ('selected', 'waiting_for_capacity')`
  ).bind(run.id).run()

  if (!claimRes.meta.changes || claimRes.meta.changes === 0) {
    const candidate = await DB.prepare(`SELECT * FROM discovery_candidates WHERE id = ?`).bind(run.selected_candidate_id).first<any>()
    const rec = candidate ? await DB.prepare(
      `SELECT r.id as recommendation_id, s.id as session_id FROM recommendations r LEFT JOIN learning_sessions s ON s.recommendation_id = r.id WHERE r.video_title = ? ORDER BY r.created_at DESC LIMIT 1`
    ).bind(candidate.title).first<any>() : null

    return {
      run_id: run.id,
      recommendation_id: rec?.recommendation_id || null,
      session_id: rec?.session_id || null,
      candidate: candidate?.title || null,
      already_active: true,
    }
  }

  // Verify capacity
  const activeQueueCountResult = await DB.prepare(
    `SELECT COUNT(*) as c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`
  ).first<{ c: number }>()

  const queueCount = activeQueueCountResult?.c || 0
  if (queueCount >= 5) {
    // Revert claim if capacity is full
    await DB.prepare(`UPDATE discovery_runs SET lifecycle = 'waiting_for_capacity', updated_at = datetime('now') WHERE id = ?`).bind(run.id).run()
    return null
  }

  const candidate = await DB.prepare(`SELECT * FROM discovery_candidates WHERE id = ?`).bind(run.selected_candidate_id).first<any>()
  if (!candidate) return null

  const receipt = run.decision_receipt_json ? JSON.parse(run.decision_receipt_json) : null
  const capture = await createCapture(DB, { source: candidate.canonical_url, title: candidate.title })
  const sessionId = `session_${crypto.randomUUID()}`

  await DB.batch([
    DB.prepare(`UPDATE recommendations SET creator = ?, content_type = ?, why_this = ? WHERE id = ?`)
      .bind(candidate.creator || null, candidate.format || null, receipt?.why_this || 'Activated via Discovery Engine V2', capture.id),
    DB.prepare(`INSERT INTO recommendation_meta (recommendation_id, priority_rank, branch_id, learning_state, updated_at) VALUES (?, 1, ?, 'queued', datetime('now'))
      ON CONFLICT(recommendation_id) DO UPDATE SET priority_rank=excluded.priority_rank,branch_id=excluded.branch_id,learning_state='queued',updated_at=datetime('now')`)
      .bind(capture.id, run.selected_branch_id || 'general'),
    DB.prepare(`UPDATE recommendations SET status = 'active', updated_at = datetime('now') WHERE id = ?`).bind(capture.id),
    DB.prepare(`INSERT INTO learning_sessions (id, recommendation_id, status, intent, started_at) VALUES (?, ?, 'active', ?, datetime('now'))`)
      .bind(sessionId, capture.id, `Explore discovery frontier: ${candidate.title}`),
    DB.prepare(`INSERT INTO recommendation_outcomes (id,recommendation_id,discovery_run_id,source_class,format,creator,branch_id,predicted_score,predicted_confidence,predicted_components_json,outcome_status,outcome_origin,training_eligible,objective_version,format_key,creator_key)
      VALUES (?,?,?,?,?,?,?,?,?,?,'active','discovery_prediction',0,'taste_v1',?,?)
      ON CONFLICT(recommendation_id) DO UPDATE SET discovery_run_id=excluded.discovery_run_id,source_class=excluded.source_class,format=excluded.format,creator=excluded.creator,branch_id=excluded.branch_id,predicted_score=excluded.predicted_score,predicted_confidence=excluded.predicted_confidence,predicted_components_json=excluded.predicted_components_json,format_key=excluded.format_key,creator_key=excluded.creator_key,evaluated_at=datetime('now')`)
      .bind(`outcome_${capture.id}`, capture.id, run.id, candidate.source_class || null, candidate.format || null, candidate.creator || null, run.selected_branch_id || 'general', Number(candidate.total_score || 0), receipt?.confidence == null ? null : Number(receipt.confidence), JSON.stringify(candidate.score_components || candidate.score_components_json || {}), canonicalFormat(candidate.format || candidate.source_class), canonicalCreatorKey(candidate.creator)),
  ])

  return {
    run_id: run.id,
    recommendation_id: capture.id,
    session_id: sessionId,
    candidate: candidate.title,
  }
}

/** Check if gate is currently blocked — pure read-only check */
async function getGateState(DB: D1Database) {
  const activeRun = await DB.prepare(
    `SELECT * FROM discovery_runs WHERE lifecycle IN ('researching','selected','waiting_for_capacity','active','awaiting_feedback','interviewing') ORDER BY created_at DESC LIMIT 1`
  ).first<any>()

  const activeQueueCountResult = await DB.prepare(
    `SELECT COUNT(*) as c FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`
  ).first<{ c: number }>()

  const queueCount = activeQueueCountResult?.c || 0
  const isBlocked = !!activeRun || queueCount >= 5
  let reason: string | null = null

  if (activeRun) {
    reason = `Active discovery run ${activeRun.id} is in status '${activeRun.lifecycle}'. Complete or resolve feedback before starting another.`
  } else if (queueCount >= 5) {
    reason = `Queue is at max capacity (5 active items). Complete an item before starting a new discovery run.`
  }

  return {
    can_start_discovery: !activeRun && queueCount < 5,
    queue_count: queueCount,
    is_gate_blocked: isBlocked,
    blocked_reason: reason,
    active_run: activeRun ? { ...activeRun, decision_receipt: activeRun.decision_receipt_json ? JSON.parse(activeRun.decision_receipt_json) : null } : null,
  }
}

/** GET /discovery/state — active discovery, gate state, frontier, and current research job */
app.get('/state', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const gate = await getGateState(DB)

    const frontier = await DB.prepare(
      `SELECT * FROM branch_exploration WHERE is_pruned = 0 ORDER BY confidence_score DESC, updated_at DESC LIMIT 30`
    ).all<any>()

    const pruned = await DB.prepare(
      `SELECT * FROM branch_exploration WHERE is_pruned = 1 ORDER BY updated_at DESC LIMIT 30`
    ).all<any>()

    const currentJob = await DB.prepare(
      `SELECT id, job_type, status, payload_json, created_at, updated_at FROM agent_jobs WHERE job_type = 'discover_source' AND status IN ('pending','running') ORDER BY created_at DESC LIMIT 1`
    ).first<any>()

    let selectedCandidate = null
    if (gate.active_run?.selected_candidate_id) {
      selectedCandidate = await DB.prepare(`SELECT * FROM discovery_candidates WHERE id = ?`).bind(gate.active_run.selected_candidate_id).first<any>()
    }

    let activeInterview = null
    if (gate.active_run?.id) {
      activeInterview = await DB.prepare(`SELECT * FROM discovery_interviews WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`).bind(gate.active_run.id).first<any>()
    }

    return c.json({
      gate_state: gate,
      active_run: gate.active_run,
      selected_candidate: selectedCandidate ? {
        ...selectedCandidate,
        metadata: JSON.parse(selectedCandidate.metadata_json || '{}'),
        verification: JSON.parse(selectedCandidate.verification_json || '{}'),
        score_components: JSON.parse(selectedCandidate.score_components_json || '{}'),
      } : null,
      active_interview: activeInterview ? {
        ...activeInterview,
        questions: JSON.parse(activeInterview.questions_json || '[]'),
        answers: JSON.parse(activeInterview.answers_json || '{}'),
        unresolved_ambiguities: JSON.parse(activeInterview.unresolved_ambiguities_json || '[]'),
        learning_receipt: JSON.parse(activeInterview.learning_receipt_json || '{}'),
      } : null,
      frontier: (frontier.results || []).map((b: any) => ({ ...b, is_pruned: Boolean(b.is_pruned) })),
      pruned_branches: (pruned.results || []).map((b: any) => ({ ...b, is_pruned: Boolean(b.is_pruned) })),
      current_research_job: currentJob ? { ...currentJob, payload: JSON.parse(currentJob.payload_json || '{}') } : null,
    })
  } catch (err) {
    return c.json(safeError('Failed to fetch discovery state')(err), 500)
  }
})

/** GET /discovery/context — token-efficient complete engine context for Hermes */
app.get('/context', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const gate = await getGateState(DB)
    const weights = await DB.prepare(`SELECT dimension, baseline_weight, current_weight, evidence_count FROM engine_weights`).all<any>()
    const branches = await DB.prepare(`SELECT id, name, parent_id, lifecycle_state, confidence_score, probe_count, current_wave, is_pruned, pruning_reason FROM branch_exploration`).all<any>()
    const recentEvidence = await DB.prepare(`SELECT e.branch_id, e.signal_dimension, e.signal_value, e.confidence, e.source_type, e.created_at FROM branch_evidence e ORDER BY e.created_at DESC LIMIT 20`).all<any>()
    const recentInterviews = await DB.prepare(`SELECT i.id, i.run_id, i.learning_receipt_json, i.status, i.updated_at FROM discovery_interviews i WHERE i.status = 'resolved' ORDER BY i.updated_at DESC LIMIT 5`).all<any>()

    const profile = await DB.prepare(`SELECT identity_json, core_filter FROM profile WHERE id = 1`).first<any>()
    const mastered = await DB.prepare(`SELECT label, kind FROM mastered`).all<any>()
    const blacklist = await DB.prepare(`SELECT name, work, reason FROM blacklist`).all<any>()

    return c.json({
      timestamp: new Date().toISOString(),
      gate_state: gate,
      engine_weights: (weights.results || []).reduce((acc: any, row: any) => {
        acc[row.dimension] = { baseline: row.baseline_weight, current: row.current_weight, evidence_count: row.evidence_count }
        return acc
      }, {}),
      branches: (branches.results || []).map((b: any) => ({ ...b, is_pruned: Boolean(b.is_pruned) })),
      recent_evidence: recentEvidence.results || [],
      recent_learning_receipts: (recentInterviews.results || []).map((i: any) => ({
        id: i.id,
        run_id: i.run_id,
        learning_receipt: JSON.parse(i.learning_receipt_json || '{}'),
      })),
      profile: {
        core_filter: profile?.core_filter || null,
        identity: profile?.identity_json ? JSON.parse(profile.identity_json) : null,
      },
      mastered: (mastered.results || []).map((m: any) => m.label),
      blacklist: (blacklist.results || []).map((b: any) => b.name),
    })
  } catch (err) {
    return c.json(safeError('Failed to fetch discovery context')(err), 500)
  }
})

/** POST /discovery/runs — create one research mission after enforcing hard feedback gate */
app.post('/runs', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<{ mission?: string; selected_branch_id?: string; model_version?: string }>().catch(() => ({} as { mission?: string; selected_branch_id?: string; model_version?: string }))

    const gate = await getGateState(DB)
    if (!gate.can_start_discovery) {
      return c.json(
        {
          error: 'hard_gate_blocked',
          message: gate.blocked_reason || 'An active discovery run or queue capacity block prevents starting a new run.',
          active_run: gate.active_run,
        },
        409
      )
    }

    const lastWaveRow = await DB.prepare(`SELECT MAX(wave) as max_wave FROM discovery_runs`).first<{ max_wave: number }>()
    const nextWave = (lastWaveRow?.max_wave || 0) + 1
    const runId = `run_${crypto.randomUUID()}`
    const mission = body.mission || `Adaptive exploration wave ${nextWave} across discovery frontiers`
    const modelVersion = body.model_version || 'gemini-3.6-flash'
    const skillVersion = '2.0.0'

    await DB.prepare(
      `INSERT INTO discovery_runs (id, mission, wave, selected_branch_id, model_version, skill_version, lifecycle) VALUES (?, ?, ?, ?, ?, ?, 'researching')`
    ).bind(runId, mission, nextWave, body.selected_branch_id || null, modelVersion, skillVersion).run()

    const jobId = `job_disc_${crypto.randomUUID()}`
    await DB.prepare(
      `INSERT INTO agent_jobs (id, job_type, payload_json, status) VALUES (?, 'discover_source', ?, 'pending')`
    ).bind(jobId, JSON.stringify({ run_id: runId, mission, wave: nextWave, selected_branch_id: body.selected_branch_id })).run()

    const createdRun = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()

    return c.json({ ok: true, run: createdRun, job_id: jobId })
  } catch (err) {
    return c.json(safeError('Failed to create discovery run')(err), 500)
  }
})

/** POST /discovery/runs/:id/candidates — batch-store structured candidates with research-quality enforcement */
app.post('/runs/:id/candidates', async (c) => {
  const { DB } = c.env
  const runId = c.req.param('id')
  try {
    const body = await c.req.json<{ candidates: CandidateInput[] }>()
    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      return c.json({ error: 'candidates array required' }, 400)
    }

    const run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()
    if (!run) return c.json({ error: 'discovery run not found' }, 404)

    const existingCandidatesRows = await DB.prepare(`SELECT * FROM discovery_candidates WHERE run_id = ?`).bind(runId).all<any>()
    const allCandidates = [...(existingCandidatesRows.results || []), ...body.candidates]

    const allowedSourceClasses = new Set(['paper', 'essay', 'podcast', 'book', 'talk', 'tool', 'article'])
    const seenUrls = new Set<string>()
    const duplicateUrls: string[] = []
    for (const cand of allCandidates) {
      const canonical = String(cand.canonical_url || '').trim().replace(/\/$/, '')
      if (!/^https?:\/\/[^\s]+$/i.test(canonical)) return c.json({ error: 'quality_rule_violation', message: `Candidate "${cand.title || 'untitled'}" has an invalid canonical_url.` }, 400)
      if (!allowedSourceClasses.has(String(cand.source_class || ''))) return c.json({ error: 'quality_rule_violation', message: `Unsupported source class: ${cand.source_class}` }, 400)
      if (seenUrls.has(canonical)) duplicateUrls.push(canonical)
      seenUrls.add(canonical)
    }
    if (duplicateUrls.length) return c.json({ error: 'quality_rule_violation', message: 'Every candidate must have a unique canonical URL.', duplicate_urls: [...new Set(duplicateUrls)] }, 400)

    const totalCount = allCandidates.length
    const sourceClasses = new Set(allCandidates.map((cand: any) => cand.source_class))
    const verifiedCandidates = allCandidates.filter((cand: any) => Boolean(cand.is_verified))

    for (const cand of body.candidates) {
      if (cand.is_verified) {
        const vf = cand.verification || {}
        const keys = Object.keys(vf).filter((k) => vf[k] !== undefined && vf[k] !== null && vf[k] !== '')
        if (keys.length < 2) {
          return c.json({
            error: 'quality_rule_violation',
            message: `Verified candidate "${cand.title}" lacks required verification evidence (minimum 2 verified properties required).`,
          }, 400)
        }
      }
    }

    if (totalCount < 20) {
      return c.json({
        error: 'quality_rule_violation',
        message: `Research-quality rules require at least 20 candidate sources per run (current count: ${totalCount}). Submit additional candidates.`,
        current_candidate_count: totalCount,
        required_candidate_count: 20,
      }, 400)
    }

    if (sourceClasses.size < 4) {
      return c.json({
        error: 'quality_rule_violation',
        message: `Research-quality rules require candidates across at least 4 distinct source classes (current distinct classes: ${Array.from(sourceClasses).join(', ')}).`,
        current_source_classes: Array.from(sourceClasses),
        required_source_classes_count: 4,
      }, 400)
    }

    if (verifiedCandidates.length < 8) {
      return c.json({
        error: 'quality_rule_violation',
        message: `Research-quality rules require at least 8 verified candidates (current verified count: ${verifiedCandidates.length}).`,
        current_verified_count: verifiedCandidates.length,
        required_verified_count: 8,
      }, 400)
    }

    const weightsRows = await DB.prepare(`SELECT dimension, current_weight FROM engine_weights`).all<any>()
    const weightMap: Record<string, number> = (weightsRows.results || []).reduce((acc: any, w: any) => {
      acc[w.dimension] = w.current_weight
      return acc
    }, {
      frontier_potential: 0.30,
      info_gain: 0.20,
      personal_pull: 0.15,
      real_life_relevance: 0.15,
      source_quality: 0.15,
      format_exploration: 0.05,
    })

    const statements: D1PreparedStatement[] = []
    const storedCandidates: any[] = []

    for (const item of body.candidates) {
      const candidateId = item.id || `cand_${crypto.randomUUID()}`
      const sc = item.score_components || {}

      const cosSim = typeof sc.cos_sim === 'number' ? sc.cos_sim : 0.25
      const isRefutation = Boolean(sc.is_refutation || item.source_class === 'paper' || item.format === 'paper')
      const dialecticScore = sc.dialectic_divergence !== undefined
        ? sc.dialectic_divergence
        : computeDialecticDivergenceScore(cosSim, isRefutation)

      sc.dialectic_divergence = dialecticScore

      const totalScore = item.total_score !== undefined
        ? item.total_score
        : (sc.frontier_potential || 0.5) * weightMap.frontier_potential +
          (sc.info_gain || 0.5) * weightMap.info_gain +
          (sc.personal_pull || 0.5) * weightMap.personal_pull +
          (sc.real_life_relevance || 0.5) * weightMap.real_life_relevance +
          (sc.source_quality || 0.5) * weightMap.source_quality +
          (sc.format_exploration || 0.5) * weightMap.format_exploration

      statements.push(
        DB.prepare(
          `INSERT INTO discovery_candidates (id, run_id, canonical_url, title, creator, format, source_class, metadata_json, verification_json, score_components_json, total_score, rejection_reason, is_winner, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          candidateId,
          runId,
          item.canonical_url,
          item.title,
          item.creator || null,
          item.format || 'article',
          item.source_class || 'article',
          JSON.stringify(item.metadata || {}),
          JSON.stringify(item.verification || {}),
          JSON.stringify(sc),
          totalScore,
          item.rejection_reason || null,
          item.is_winner ? 1 : 0,
          item.is_verified ? 1 : 0
        )
      )


      storedCandidates.push({
        id: candidateId,
        run_id: runId,
        canonical_url: item.canonical_url,
        title: item.title,
        creator: item.creator || null,
        format: item.format || 'article',
        source_class: item.source_class || 'article',
        total_score: totalScore,
        is_verified: Boolean(item.is_verified),
        is_winner: Boolean(item.is_winner),
      })
    }

    await DB.batch(statements)

    return c.json({
      ok: true,
      count: storedCandidates.length,
      total_run_candidates: totalCount,
      source_classes_count: sourceClasses.size,
      verified_count: verifiedCandidates.length,
      candidates: storedCandidates,
    })
  } catch (err) {
    return c.json(safeError('Failed to store candidates')(err), 500)
  }
})

/** POST /discovery/runs/:id/select — store winner and decision receipt */
app.post('/runs/:id/select', async (c) => {
  const { DB } = c.env
  const runId = c.req.param('id')
  try {
    const body = await c.req.json<{ selected_candidate_id?: string; decision_receipt?: DecisionReceipt }>().catch(() => ({} as { selected_candidate_id?: string; decision_receipt?: DecisionReceipt }))

    const run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()
    if (!run) return c.json({ error: 'discovery run not found' }, 404)

    const candidatesRows = await DB.prepare(`SELECT * FROM discovery_candidates WHERE run_id = ?`).bind(runId).all<any>()
    const candidatesList = candidatesRows.results || []

    const sourceClasses = new Set(candidatesList.map((cand: any) => cand.source_class))
    const verifiedCount = candidatesList.filter((cand: any) => Boolean(cand.is_verified)).length

    if (candidatesList.length < 20 || sourceClasses.size < 4 || verifiedCount < 8) {
      await DB.prepare(`UPDATE discovery_runs SET lifecycle = 'withheld', updated_at = datetime('now') WHERE id = ?`).bind(runId).run()
      return c.json({
        ok: false,
        lifecycle: 'withheld',
        reason: `Run failed research quality gate (candidates: ${candidatesList.length}/20, source_classes: ${sourceClasses.size}/4, verified: ${verifiedCount}/8). Result withheld.`,
      })
    }

    let candidateId = body.selected_candidate_id
    if (!candidateId) {
      const topVerified = await DB.prepare(
        `SELECT id, total_score, is_verified FROM discovery_candidates WHERE run_id = ? AND is_verified = 1 ORDER BY total_score DESC LIMIT 1`
      ).bind(runId).first<any>()
      if (topVerified) candidateId = topVerified.id
    }

    if (!candidateId) {
      await DB.prepare(`UPDATE discovery_runs SET lifecycle = 'withheld', updated_at = datetime('now') WHERE id = ?`).bind(runId).run()
      return c.json({ ok: false, lifecycle: 'withheld', reason: 'No verified candidates found for discovery run.' })
    }

    const candidate = await DB.prepare(`SELECT * FROM discovery_candidates WHERE id = ? AND run_id = ?`).bind(candidateId, runId).first<any>()
    if (!candidate) return c.json({ error: 'candidate not found' }, 404)

    if (!candidate.is_verified || candidate.total_score < 0.60) {
      await DB.prepare(`UPDATE discovery_runs SET lifecycle = 'withheld', updated_at = datetime('now') WHERE id = ?`).bind(runId).run()
      return c.json({
        ok: false,
        lifecycle: 'withheld',
        reason: 'Selected candidate failed verification or minimum score threshold (score < 0.60 or unverified). Result withheld.',
      })
    }

    const receipt: DecisionReceipt = body.decision_receipt || {
      why_this: `Highest total score candidate (${candidate.title}) passing quality verification`,
      why_now: 'Unlocks priority branch exploration frontier',
      explored_branch: run.selected_branch_id || 'general',
      surprise: 'Presents a counter-perspective to past consumption',
      confidence: candidate.total_score,
      what_feedback_will_teach: 'Calibrates frontier potential weight vs personal pull',
    }

    await DB.prepare(`UPDATE discovery_candidates SET is_winner = 0 WHERE run_id = ?`).bind(runId).run()
    await DB.prepare(`UPDATE discovery_candidates SET is_winner = 1 WHERE id = ?`).bind(candidateId).run()

    await DB.prepare(
      `UPDATE discovery_runs SET selected_candidate_id = ?, decision_receipt_json = ?, lifecycle = 'selected', updated_at = datetime('now') WHERE id = ?`
    ).bind(candidateId, JSON.stringify(receipt), runId).run()

    const updatedRun = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()

    return c.json({
      ok: true,
      run: { ...updatedRun, decision_receipt: receipt },
      winner: {
        ...candidate,
        is_winner: true,
        metadata: JSON.parse(candidate.metadata_json || '{}'),
        verification: JSON.parse(candidate.verification_json || '{}'),
      },
    })
  } catch (err) {
    return c.json(safeError('Failed to select candidate')(err), 500)
  }
})

/** POST /discovery/runs/:id/activate — explicit shared activation route */
app.post('/runs/:id/activate', async (c) => {
  const { DB } = c.env
  const runId = c.req.param('id')
  try {
    const activationResult = await activateWaitingRun(DB, runId)
    if (!activationResult) {
      const run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()
      if (!run) return c.json({ error: 'discovery run not found' }, 404)
      if (run.lifecycle === 'waiting_for_capacity') {
        return c.json({
          ok: true,
          activated: false,
          lifecycle: 'waiting_for_capacity',
          message: 'Queue is at max capacity (5 items). Winner retained until capacity opens.',
        })
      }
      return c.json({ error: 'run cannot be activated' }, 400)
    }

    return c.json({
      ok: true,
      activated: true,
      lifecycle: 'active',
      ...activationResult,
    })
  } catch (err) {
    return c.json(safeError('Failed to activate discovery run')(err), 500)
  }
})

/** POST /discovery/runs/:id/cancel — cancel an active or researching discovery run and unlock gate */
app.post('/runs/:id/cancel', async (c) => {
  const { DB } = c.env
  const runId = c.req.param('id')
  try {
    const run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()
    if (!run) return c.json({ error: 'discovery run not found' }, 404)

    await DB.prepare(`UPDATE discovery_runs SET lifecycle = 'cancelled', updated_at = datetime('now') WHERE id = ?`).bind(runId).run()
    await DB.prepare(`UPDATE agent_jobs SET status = 'cancelled', error = 'Discovery run cancelled by user', updated_at = datetime('now') WHERE job_type = 'discover_source' AND payload_json LIKE ? AND status IN ('pending', 'running')`).bind(`%${runId}%`).run()

    return c.json({ ok: true, run_id: runId, status: 'cancelled' })
  } catch (err) {
    return c.json(safeError('Failed to cancel discovery run')(err), 500)
  }
})

/** POST /discovery/runs/:id/interview — record feedback questions and answers */
app.post('/runs/:id/interview', async (c) => {
  const { DB } = c.env
  const runId = c.req.param('id')
  try {
    const body = await c.req.json<{
      raw_feedback?: string
      questions?: string[]
      answers?: Record<string, any>
      unresolved_ambiguities?: string[]
    }>()

    const run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()
    if (!run) return c.json({ error: 'discovery run not found' }, 404)

    let interview = await DB.prepare(`SELECT * FROM discovery_interviews WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`).bind(runId).first<any>()

    const existingQuestions = interview?.questions_json ? JSON.parse(interview.questions_json) : []
    const existingAnswers = interview?.answers_json ? JSON.parse(interview.answers_json) : {}

    const newQuestions = body.questions || existingQuestions
    const newAnswers = body.answers ? { ...existingAnswers, ...body.answers } : existingAnswers
    const ambiguities = body.unresolved_ambiguities !== undefined ? body.unresolved_ambiguities : (interview?.unresolved_ambiguities_json ? JSON.parse(interview.unresolved_ambiguities_json) : [])

    const interviewId = interview?.id || `int_${crypto.randomUUID()}`

    if (interview) {
      await DB.prepare(
        `UPDATE discovery_interviews SET raw_feedback = COALESCE(?, raw_feedback), questions_json = ?, answers_json = ?, unresolved_ambiguities_json = ?, status = 'interviewing', updated_at = datetime('now') WHERE id = ?`
      ).bind(body.raw_feedback || null, JSON.stringify(newQuestions), JSON.stringify(newAnswers), JSON.stringify(ambiguities), interviewId).run()
    } else {
      await DB.prepare(
        `INSERT INTO discovery_interviews (id, run_id, raw_feedback, questions_json, answers_json, unresolved_ambiguities_json, status) VALUES (?, ?, ?, ?, ?, ?, 'interviewing')`
      ).bind(interviewId, runId, body.raw_feedback || null, JSON.stringify(newQuestions), JSON.stringify(newAnswers), JSON.stringify(ambiguities)).run()
    }

    await DB.prepare(`UPDATE discovery_runs SET lifecycle = 'interviewing', updated_at = datetime('now') WHERE id = ?`).bind(runId).run()

    const updated = await DB.prepare(`SELECT * FROM discovery_interviews WHERE id = ?`).bind(interviewId).first<any>()

    return c.json({
      ok: true,
      interview: {
        ...updated,
        questions: JSON.parse(updated.questions_json),
        answers: JSON.parse(updated.answers_json),
        unresolved_ambiguities: JSON.parse(updated.unresolved_ambiguities_json),
      },
    })
  } catch (err) {
    return c.json(safeError('Failed to record interview')(err), 500)
  }
})

/** POST /discovery/runs/:id/resolve — atomically apply resolved evidence, bounded weights, branch mutations, learning receipt */
app.post('/runs/:id/resolve', async (c) => {
  const { DB } = c.env
  const runId = c.req.param('id')
  try {
    const body = await c.req.json<{
      structured_resolution?: {
        opened_frontier?: boolean
        real_life_impact?: boolean
        source_love?: boolean
        topic_rejection?: boolean
        competing_explanations?: Record<string, any>
      }
      learning_receipt?: {
        evidence?: string[]
        confidence?: number
        affected_branches?: string[]
        weight_changes?: Record<string, number>
        map_changes?: string[]
      }
      evidence_deltas?: Record<string, number>
      branch_mutations?: Array<{
        branch_id: string
        action: 'promote' | 'prune' | 'reopen'
        reason?: string
      }>
      learned_heuristics_patch?: string
    }>()

    const run = await DB.prepare(`SELECT * FROM discovery_runs WHERE id = ?`).bind(runId).first<any>()
    if (!run) return c.json({ error: 'discovery run not found' }, 404)

    const interview = await DB.prepare(`SELECT * FROM discovery_interviews WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`).bind(runId).first<any>()
    if (!interview) {
      return c.json({
        error: 'interview_required',
        message: 'Cannot resolve discovery: Hermes adaptive feedback interview must be conducted before resolving.',
      }, 400)
    }

    const questions: string[] = interview.questions_json ? JSON.parse(interview.questions_json) : []
    const answers: Record<string, any> = interview.answers_json ? JSON.parse(interview.answers_json) : {}
    const unresolvedAmbiguities = interview.unresolved_ambiguities_json ? JSON.parse(interview.unresolved_ambiguities_json) : []

    if (Array.isArray(unresolvedAmbiguities) && unresolvedAmbiguities.length > 0) {
      return c.json({
        error: 'ambiguity_unresolved',
        message: 'Cannot resolve discovery while important ambiguities remain unresolved.',
        unresolved_ambiguities: unresolvedAmbiguities,
      }, 400)
    }

    const missingQuestions = questions.filter((q: string) => {
      const ans = answers[q]
      return ans === undefined || ans === null || String(ans).trim() === ''
    })

    if (questions.length === 0 || missingQuestions.length > 0) {
      return c.json({
        error: 'interview_incomplete',
        message: 'Cannot resolve discovery: all questions in the adaptive interview must have matching non-empty answers.',
        missing_questions: missingQuestions,
      }, 400)
    }

    const statements: D1PreparedStatement[] = []
    const branchId = run.selected_branch_id || 'general'
    const isFrontier = Boolean(body.structured_resolution?.opened_frontier)
    const isImpact = Boolean(body.structured_resolution?.real_life_impact)

    statements.push(
      DB.prepare(
        `INSERT OR IGNORE INTO branch_exploration (id, name, path, lifecycle_state, confidence_score) VALUES (?, ?, ?, 'probing', 0.5)`
      ).bind(branchId, branchId, branchId)
    )

    statements.push(
      DB.prepare(
        `INSERT INTO branch_evidence (id, branch_id, run_id, signal_dimension, signal_value, confidence, source_type, interview_evidence_json) VALUES (?, ?, ?, ?, ?, ?, 'interview', ?)`
      ).bind(
        `ev_${crypto.randomUUID()}`,
        branchId,
        runId,
        isFrontier ? 'frontier_potential' : isImpact ? 'real_life_impact' : 'personal_pull',
        isFrontier ? 1.0 : isImpact ? 0.8 : 0.5,
        body.learning_receipt?.confidence || 0.9,
        JSON.stringify(body.structured_resolution || {})
      )
    )

    const validatedMutations: any[] = []

    for (const mut of body.branch_mutations || []) {
      statements.push(
        DB.prepare(
          `INSERT OR IGNORE INTO branch_exploration (id, name, path, lifecycle_state, confidence_score) VALUES (?, ?, ?, 'probing', 0.5)`
        ).bind(mut.branch_id, mut.branch_id, mut.branch_id)
      )

      const pastEvidenceRows = await DB.prepare(`SELECT signal_value, run_id FROM branch_evidence WHERE branch_id = ?`).bind(mut.branch_id).all<any>()
      const pastEvidence = pastEvidenceRows.results || []
      const positiveCount = pastEvidence.filter((e: any) => e.signal_value >= 0.6).length

      const negativeRunIds = new Set(
        pastEvidence
          .filter((e: any) => e.signal_value <= -0.6 && e.run_id)
          .map((e: any) => e.run_id)
      )
      const distinctNegativeProbesCount = negativeRunIds.size

      if (mut.action === 'promote') {
        if (isFrontier || positiveCount >= 2) {
          statements.push(
            DB.prepare(
              `UPDATE branch_exploration SET lifecycle_state = 'frontier', confidence_score = MIN(1.0, confidence_score + 0.2), probe_count = probe_count + 1, updated_at = datetime('now') WHERE id = ?`
            ).bind(mut.branch_id)
          )
          validatedMutations.push({ branch_id: mut.branch_id, action: 'promote', status: 'applied' })
        } else {
          validatedMutations.push({ branch_id: mut.branch_id, action: 'promote', status: 'rejected', reason: 'Requires 1 frontier-opening signal or 2 positive evidence probes.' })
        }
      } else if (mut.action === 'prune') {
        const explicitTopicRejection = Boolean(body.structured_resolution?.topic_rejection)
        if (distinctNegativeProbesCount >= 2 || explicitTopicRejection) {
          statements.push(
            DB.prepare(
              `UPDATE branch_exploration SET lifecycle_state = 'pruned', is_pruned = 1, pruning_reason = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(mut.reason || 'Pruned by evidence-controlled rule', mut.branch_id)
          )
          validatedMutations.push({ branch_id: mut.branch_id, action: 'prune', status: 'applied' })
        } else {
          validatedMutations.push({ branch_id: mut.branch_id, action: 'prune', status: 'rejected', reason: 'Requires 2 distinct negative probes/runs or explicit topic rejection.' })
        }
      } else if (mut.action === 'reopen') {
        if (isFrontier || isImpact || (body.learning_receipt?.confidence || 0) >= 0.8) {
          statements.push(
            DB.prepare(
              `UPDATE branch_exploration SET lifecycle_state = 'probing', is_pruned = 0, pruning_reason = NULL, updated_at = datetime('now') WHERE id = ?`
            ).bind(mut.branch_id)
          )
          validatedMutations.push({ branch_id: mut.branch_id, action: 'reopen', status: 'applied' })
        } else {
          validatedMutations.push({ branch_id: mut.branch_id, action: 'reopen', status: 'rejected', reason: 'Requires explicit high-confidence positive evidence.' })
        }
      }
    }

    const currentWeightsRows = await DB.prepare(`SELECT * FROM engine_weights`).all<any>()
    const updatedWeights = adaptAndNormalizeWeights(
      currentWeightsRows.results || [],
      body.evidence_deltas || body.learning_receipt?.weight_changes || {}
    )

    for (const w of updatedWeights) {
      const history = JSON.parse((w as any).audit_history_json || '[]')
      history.push({ ts: new Date().toISOString(), run_id: runId, weight: w.current_weight })
      statements.push(
        DB.prepare(
          `UPDATE engine_weights SET current_weight = ?, evidence_count = ?, audit_history_json = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(w.current_weight, w.evidence_count, JSON.stringify(history), w.id)
      )
    }

    const receipt = body.learning_receipt || {
      evidence: ['Explicit interview feedback resolved'],
      confidence: 0.9,
      affected_branches: [branchId],
      weight_changes: body.evidence_deltas || {},
      map_changes: validatedMutations.map((m) => `${m.action}:${m.branch_id}:${m.status}`),
    }

    statements.push(
      DB.prepare(
        `UPDATE discovery_interviews SET structured_resolution_json = ?, learning_receipt_json = ?, status = 'resolved', updated_at = datetime('now') WHERE id = ?`
      ).bind(JSON.stringify(body.structured_resolution || {}), JSON.stringify(receipt), interview.id)
    )

    statements.push(
      DB.prepare(`UPDATE discovery_runs SET lifecycle = 'resolved', updated_at = datetime('now') WHERE id = ?`).bind(runId)
    )

    await DB.batch(statements)

    let skillRevision = null
    if (body.learned_heuristics_patch) {
      const patch = body.learned_heuristics_patch
      const fileHash = await computeSha256(patch)
      const validationStatus = 'staged'

      const revId = `rev_${crypto.randomUUID()}`
      await DB.prepare(
        `INSERT INTO skill_revisions (id, live_version, file_hash, backup_path, learned_changes_json, validation_result, triggering_interview_id) VALUES (?, '2.0.0', ?, ?, ?, ?, ?)`
      ).bind(revId, fileHash, null, JSON.stringify({ patch, owner: 'learning-compass-self-evolution', target: 'taste-rec' }), validationStatus, interview.id).run()

      skillRevision = { id: revId, file_hash: fileHash, status: validationStatus, backup_path: null }
    }

    // Auto-recover capacity for any run waiting for queue capacity
    try { await activateWaitingRun(DB) } catch {}

    return c.json({
      ok: true,
      run_id: runId,
      lifecycle: 'resolved',
      learning_receipt: receipt,
      validated_mutations: validatedMutations,
      updated_weights: updatedWeights.reduce((acc: any, w) => {
        acc[w.dimension] = w.current_weight
        return acc
      }, {}),
      skill_revision: skillRevision,
    })
  } catch (err) {
    return c.json(safeError('Failed to resolve discovery run')(err), 500)
  }
})

/** GET /discovery/revisions/pending — fetch staged skill revisions for host-side Hermes synchronization */
app.get('/revisions/pending', async (c) => {
  const { DB } = c.env
  try {
    const rows = await DB.prepare(`SELECT * FROM skill_revisions WHERE validation_result = 'staged' ORDER BY created_at ASC`).all<any>()
    return c.json({
      pending_revisions: (rows.results || []).map((r: any) => ({
        ...r,
        learned_changes: JSON.parse(r.learned_changes_json || '{}'),
      })),
    })
  } catch (err) {
    return c.json(safeError('Failed to fetch pending revisions')(err), 500)
  }
})

/** POST /discovery/revisions/:id/confirm — confirm host-side application of a staged skill revision */
app.post('/revisions/:id/confirm', async (c) => {
  const { DB } = c.env
  const revId = c.req.param('id')
  try {
    const body = await c.req.json<{ file_hash: string; backup_path?: string; validation_result?: string }>()
    if (!body.file_hash) return c.json({ error: 'file_hash required' }, 400)

    const rev = await DB.prepare(`SELECT * FROM skill_revisions WHERE id = ?`).bind(revId).first<any>()
    if (!rev) return c.json({ error: 'revision not found' }, 404)

    const status = body.validation_result || 'valid'
    await DB.prepare(
      `UPDATE skill_revisions SET file_hash = ?, backup_path = COALESCE(?, backup_path), validation_result = ?, created_at = datetime('now') WHERE id = ?`
    ).bind(body.file_hash, body.backup_path || null, status, revId).run()

    return c.json({ ok: true, revision_id: revId, file_hash: body.file_hash, validation_result: status })
  } catch (err) {
    return c.json(safeError('Failed to confirm revision')(err), 500)
  }
})

/** GET /discovery/drift-check — check API, skill version/hash, active workflows */
app.get('/drift-check', async (c) => {
  const { DB } = c.env
  try {
    const clientHash = c.req.header('x-skill-hash') || c.req.query('hash')
    let localHash = 'live'
    let skillExists = false
    let activeSkills: Record<string, boolean> = {}

    try {
      const fs = await import('node:fs')
      if (fs.existsSync && fs.existsSync(SKILL_PATH)) {
        skillExists = true
        localHash = await computeSha256(fs.readFileSync(SKILL_PATH, 'utf-8'))
      }
      activeSkills = Object.fromEntries(ACTIVE_SKILL_PATHS.map((path) => [path, Boolean(fs.existsSync && fs.existsSync(path))]))
    } catch { /* Workerd runtime */ }

    const latestRevision = await DB.prepare(
      `SELECT * FROM skill_revisions ORDER BY created_at DESC LIMIT 1`
    ).first<any>()

    const targetHash = latestRevision?.file_hash || localHash
    const checkHash = clientHash || localHash
    const isAligned = !latestRevision || checkHash === targetHash

    return c.json({
      live_api_capabilities: 'allow-listed-agent-surface',
      expected_contract_version: '2.0.0',
      agent_contract_version: AGENT_CONTRACT_VERSION,
      agent_protocol: AGENT_PROTOCOL,
      skill: {
        exists: skillExists,
        path: SKILL_PATH,
        current_hash: localHash,
        latest_revision: latestRevision ? {
          ...latestRevision,
          learned_changes: JSON.parse(latestRevision.learned_changes_json || '{}'),
        } : null,
      },
      active_hermes_workflows: [
        ...ACTIVE_SKILL_PATHS.map((path) => ({ path, exists: activeSkills[path] ?? false })),
      ],
      is_aligned: isAligned,
    })
  } catch (err) {
    return c.json(safeError('Failed to perform drift check')(err), 500)
  }
})

export default app
