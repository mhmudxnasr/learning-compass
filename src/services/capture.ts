import { deriveDedupKey, isValidUrl } from '../lib.js'
import { loadSettings } from './settings.js'

export type CaptureArtifact = {
  id: string
  filename: string
  media_type: string
  r2_key: string | null
}

export async function createCapture(
  DB: D1Database,
  input: {
    source: string
    title?: string
    artifact?: CaptureArtifact | null
    initialLearningState?: 'captured' | 'queued'
    branch?: { id: string; confidence: 'high'; reason?: string; source: string }
  },
) {
  const source = input.source.trim()
  const sourceIsUrl = /^https?:\/\//i.test(source) && isValidUrl(source)
  const artifact = input.artifact || null
  const url = sourceIsUrl ? source : artifact ? `artifact://${artifact.id}` : `text://capture/${crypto.randomUUID()}`
  const contentType = /youtube\.com|youtu\.be/.test(source) ? 'video'
    : artifact?.media_type === 'application/pdf' || /\.pdf(?:$|\?)/i.test(source) ? 'paper'
      : artifact?.media_type?.includes('html') ? 'article' : sourceIsUrl ? 'article' : 'other'
  const title = input.title?.trim() || (sourceIsUrl ? new URL(source).hostname.replace(/^www\./, '') : source.slice(0, 100))
  const initialLearningState = input.initialLearningState || 'captured'
  const dedup = deriveDedupKey({ video_url: url, video_title: title, content_type: contentType })
  const existing = await DB.prepare(`SELECT r.id,r.status,m.branch_id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.dedup_key=?`).bind(dedup).first<{ id: string; status: string; branch_id: string | null }>()

  if (existing) {
    if (input.branch && existing.branch_id && existing.branch_id !== input.branch.id) {
      return { id: existing.id, duplicate: true, status: existing.status, dedup, branchConflict: existing.branch_id }
    }
    const sourceMetadata = {
      raw_source: source,
      artifact_id: artifact?.id || null,
      r2_key: artifact?.r2_key || null,
      ...(input.branch ? {
        branch_mapping_confidence: input.branch.confidence,
        branch_mapping_reason: input.branch.reason || '',
        branch_mapping_source: input.branch.source,
      } : {}),
    }
    const duplicateStatements = [
      DB.prepare(`INSERT OR IGNORE INTO recommendation_meta (recommendation_id,learning_state,branch_id,source_metadata_json) VALUES (?,?,?,?)`).bind(existing.id, initialLearningState, input.branch?.id || null, JSON.stringify(sourceMetadata)),
      DB.prepare(`UPDATE recommendation_meta SET branch_id=COALESCE(branch_id,?),source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),last_opened_at=datetime('now'),updated_at=datetime('now') WHERE recommendation_id=?`).bind(input.branch?.id || null, JSON.stringify(sourceMetadata), existing.id),
    ]
    await DB.batch(duplicateStatements)
    return { id: existing.id, duplicate: true, status: existing.status, dedup, branch_id: existing.branch_id || input.branch?.id || null }
  }

  const id = `cap_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
  const settings = await loadSettings(DB)
  const sourceMetadata = {
    raw_source: source,
    artifact_id: artifact?.id || null,
    r2_key: artifact?.r2_key || null,
    ...(input.branch ? {
      branch_mapping_confidence: input.branch.confidence,
      branch_mapping_reason: input.branch.reason || '',
      branch_mapping_source: input.branch.source,
    } : {}),
  }
  const statements: D1PreparedStatement[] = [
    DB.prepare(`INSERT INTO recommendations (id,video_title,content_type,video_url,status,user_rating,dedup_key,created_at,updated_at) VALUES (?,?,?,?,'active','unset',?,datetime('now'),datetime('now'))`).bind(id, title, contentType, url, dedup),
    DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,branch_id,source_metadata_json,updated_at) VALUES (?,?,?,?,datetime('now'))`).bind(id, initialLearningState, input.branch?.id || null, JSON.stringify(sourceMetadata)),
  ]
  if (settings.ai_curation.enrich_capture) statements.push(
    DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'enrich_capture',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(`job_${crypto.randomUUID()}`, JSON.stringify({ recommendation_id: id, source, artifact_id: artifact?.id || null, r2_key: artifact?.r2_key || null }), `capture:${dedup}`),
  )
  await DB.batch(statements)
  // Incremental FTS5: index immediately so new captures are searchable without waiting for cron
  try {
    const ftsText = [title, contentType, source].filter(Boolean).join(' ')
    await DB.prepare("INSERT OR REPLACE INTO search_idx(source, ref_id, text) VALUES ('rec', ?, ?)").bind(id, ftsText).run()
  } catch { /* FTS update is best-effort; cron will catch up */ }
  return { id, duplicate: false, status: 'active', dedup, branch_id: input.branch?.id || null }
}
