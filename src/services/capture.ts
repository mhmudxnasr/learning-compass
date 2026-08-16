import { deriveDedupKey, isValidUrl } from '../lib.js'
import { loadSettings } from './settings.js'

export type CaptureArtifact = {
  id: string
  filename: string
  media_type: string
  r2_key: string | null
}

export async function createInboxCapture(
  DB: D1Database,
  input: { source: string; title?: string; artifact?: CaptureArtifact | null; initialLearningState?: 'inbox' | 'queued' },
) {
  const source = input.source.trim()
  const sourceIsUrl = /^https?:\/\//i.test(source) && isValidUrl(source)
  const artifact = input.artifact || null
  const url = sourceIsUrl ? source : artifact ? `artifact://${artifact.id}` : `text://capture/${crypto.randomUUID()}`
  const contentType = /youtube\.com|youtu\.be/.test(source) ? 'video'
    : artifact?.media_type === 'application/pdf' || /\.pdf(?:$|\?)/i.test(source) ? 'paper'
      : artifact?.media_type?.includes('html') ? 'article' : sourceIsUrl ? 'article' : 'other'
  const title = input.title?.trim() || (sourceIsUrl ? new URL(source).hostname.replace(/^www\./, '') : source.slice(0, 100))
  const initialLearningState = input.initialLearningState || 'queued'
  const dedup = deriveDedupKey({ video_url: url, video_title: title, content_type: contentType })
  const existing = await DB.prepare(`SELECT id,status FROM recommendations WHERE dedup_key=?`).bind(dedup).first<{ id: string; status: string }>()

  if (existing) {
    const duplicateStatements = [
      DB.prepare(`INSERT OR IGNORE INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json) VALUES (?, ?, ?)`).bind(existing.id, initialLearningState, JSON.stringify({ raw_source: source, artifact_id: artifact?.id || null, r2_key: artifact?.r2_key || null })),
      DB.prepare(`UPDATE recommendation_meta SET last_opened_at=datetime('now'),updated_at=datetime('now') WHERE recommendation_id=?`).bind(existing.id),
    ]
    await DB.batch(duplicateStatements)
    return { id: existing.id, duplicate: true, status: existing.status, dedup }
  }

  const id = `cap_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
  const settings = await loadSettings(DB)
  const statements: D1PreparedStatement[] = [
    DB.prepare(`INSERT INTO recommendations (id,video_title,content_type,video_url,status,user_rating,dedup_key,created_at,updated_at) VALUES (?,?,?,?,'active','unset',?,datetime('now'),datetime('now'))`).bind(id, title, contentType, url, dedup),
    DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json,updated_at) VALUES (?,?,?,datetime('now'))`).bind(id, initialLearningState, JSON.stringify({ raw_source: source, artifact_id: artifact?.id || null, r2_key: artifact?.r2_key || null })),
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
  return { id, duplicate: false, status: 'active', dedup }
}
