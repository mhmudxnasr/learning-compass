import type { Bindings } from '../lib'

type ArtifactRow = { id: string; r2_key: string | null; media_type: string; metadata_json: string; created_at: string }

type ReconciliationAction = {
  job_id: string
  recommendation_id: string | null
  action: 'complete' | 'cancel' | 'blocked'
  reason: string
  pair_id?: string
  html_artifact_id?: string
  pdf_artifact_id?: string
}

const parse = (value: string | null | undefined) => {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

async function readyPair(env: Bindings, recommendationId: string, revisionOfPairId: string | null) {
  const rows = await env.DB.prepare(
    `SELECT id,r2_key,media_type,metadata_json,created_at FROM artifacts
    WHERE json_extract(metadata_json,'$.recommendation_id')=?
      AND json_extract(metadata_json,'$.publication_state')='ready'
      AND json_extract(metadata_json,'$.validation_status')='passed'
      AND json_extract(metadata_json,'$.pair_id') IS NOT NULL
    ORDER BY created_at DESC,id DESC`,
  )
    .bind(recommendationId)
    .all<ArtifactRow>()
  const pairs = new Map<
    string,
    { html?: ArtifactRow; pdf?: ArtifactRow; newest: string; supersedesPairId: string | null }
  >()
  for (const row of rows.results || []) {
    const metadata = parse(row.metadata_json)
    const pairId = String(metadata.pair_id || '')
    if (!pairId.startsWith('lv-')) continue
    if (
      revisionOfPairId &&
      (pairId === revisionOfPairId || String(metadata.supersedes_pair_id || '') !== revisionOfPairId)
    )
      continue
    const pair = pairs.get(pairId) || {
      newest: row.created_at,
      supersedesPairId: String(metadata.supersedes_pair_id || '') || null,
    }
    if (metadata.role === 'html' && !pair.html) pair.html = row
    if (metadata.role === 'pdf' && !pair.pdf) pair.pdf = row
    pairs.set(pairId, pair)
  }
  for (const [pairId, pair] of pairs) {
    if (!pair.html?.r2_key || !pair.pdf?.r2_key || !env.ARTIFACTS) continue
    const [html, pdf] = await Promise.all([env.ARTIFACTS.head(pair.html.r2_key), env.ARTIFACTS.head(pair.pdf.r2_key)])
    if (html && pdf) return { pairId, html: pair.html, pdf: pair.pdf }
  }
  return null
}

export async function reconcileVisualJobs(env: Bindings, apply = false) {
  const jobs = await env.DB.prepare(
    `SELECT id,status,payload_json,result_json,created_at FROM agent_jobs
    WHERE job_type='visualise_source' AND status IN ('pending','retry') ORDER BY created_at,id`,
  ).all<any>()
  const actions: ReconciliationAction[] = []
  for (const job of jobs.results || []) {
    const payload = parse(job.payload_json)
    const recommendationId = String(payload.recommendation_id || '').trim() || null
    if (!recommendationId) {
      actions.push({
        job_id: job.id,
        recommendation_id: null,
        action: 'cancel',
        reason: 'Job has no canonical source target.',
      })
      continue
    }
    const recommendation = await env.DB.prepare('SELECT id FROM recommendations WHERE id=? AND deleted_at IS NULL')
      .bind(recommendationId)
      .first<{ id: string }>()
    if (!recommendation) {
      actions.push({
        job_id: job.id,
        recommendation_id: recommendationId,
        action: 'cancel',
        reason: 'Canonical source no longer exists; generated artifacts are preserved for operator review.',
      })
      continue
    }
    const pair = await readyPair(env, recommendationId, String(payload.revision_of_pair_id || '') || null)
    if (!pair) {
      actions.push({
        job_id: job.id,
        recommendation_id: recommendationId,
        action: 'blocked',
        reason: 'No complete validation-passed HTML/PDF pair with both R2 objects exists.',
      })
      continue
    }
    actions.push({
      job_id: job.id,
      recommendation_id: recommendationId,
      action: 'complete',
      reason: 'Canonical source and complete validation-passed R2 pair verified.',
      pair_id: pair.pairId,
      html_artifact_id: pair.html.id,
      pdf_artifact_id: pair.pdf.id,
    })
  }

  if (apply) {
    for (const action of actions) {
      if (action.action === 'blocked') continue
      const result =
        action.action === 'complete'
          ? {
              pair_id: action.pair_id,
              html_artifact_id: action.html_artifact_id,
              pdf_artifact_id: action.pdf_artifact_id,
              validation_status: 'passed',
              reconciled: true,
              reconciled_at: new Date().toISOString(),
            }
          : { reconciled: true, cancelled_reason: action.reason, reconciled_at: new Date().toISOString() }
      await env.DB.batch([
        action.action === 'complete'
          ? env.DB.prepare(
              "UPDATE agent_jobs SET status='completed',workflow_step='verify_record',result_json=?,error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('pending','retry')",
            ).bind(JSON.stringify(result), action.job_id)
          : env.DB.prepare(
              "UPDATE agent_jobs SET status='cancelled',result_json=?,error=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status IN ('pending','retry')",
            ).bind(JSON.stringify(result), action.reason.slice(0, 1000), action.job_id),
        env.DB.prepare('DELETE FROM agent_job_retries WHERE job_id=?').bind(action.job_id),
      ])
    }
  }

  return {
    ok: actions.every((action) => action.action !== 'blocked'),
    applied: apply,
    considered: actions.length,
    completed: actions.filter((action) => action.action === 'complete').length,
    cancelled: actions.filter((action) => action.action === 'cancel').length,
    blocked: actions.filter((action) => action.action === 'blocked').length,
    actions,
  }
}
