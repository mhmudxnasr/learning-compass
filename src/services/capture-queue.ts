import { deliveryMatch, type ResolvedDeliveryContext } from './delivery-context.ts'
import { selectLearningSourceRenditions } from './learning-material-renditions.ts'
import { sourceHealthMatchesCurrentUrl } from './source-health.ts'

export async function loadCaptureQueue(DB: D1Database, limit = 50, delivery?: ResolvedDeliveryContext, matchesOnly = false) {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 50)
  const rows = await DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.priority_rank,m.progress_percent,m.estimated_minutes,m.tags_json,m.source_metadata_json,m.started_at,m.last_opened_at,
      COALESCE(n.label, r.branch) branch_label,
      COALESCE(n.status, 'love') branch_status,
      n.super_category branch_domain,
    o.predicted_score,o.predicted_confidence,o.predicted_components_json,
    h.checked_url source_health_checked_url,h.status source_health_status,h.last_checked_at source_health_checked_at,
    h.http_status source_health_http_status,h.final_url source_health_final_url,h.error_code source_health_error_code,
    (SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads t ON t.id=ts.thread_id WHERE ts.recommendation_id=r.id AND ts.status='active' AND t.status NOT IN ('verified','abandoned') ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 1) thread_id,(SELECT n.id FROM notes n WHERE n.recommendation_id=r.id ORDER BY n.updated_at DESC LIMIT 1) note_id,(SELECT n.title FROM notes n WHERE n.recommendation_id=r.id ORDER BY n.updated_at DESC LIMIT 1) note_title,(SELECT COUNT(*) FROM srs_cards sc WHERE sc.recommendation_id=r.id) recall_count,(SELECT COUNT(*) FROM srs_cards sc WHERE sc.recommendation_id=r.id AND sc.repair_status='active' AND sc.due_at IS NOT NULL AND sc.due_at<=date('now')) due_count FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id LEFT JOIN recommendation_outcomes o ON o.recommendation_id=r.id LEFT JOIN source_health h ON h.recommendation_id=r.id WHERE r.status='active' AND COALESCE(r.content_type, '') != 'book' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress') ORDER BY COALESCE(m.priority_rank,999),r.created_at DESC LIMIT ?`).bind(boundedLimit).all<any>()

  const recommendationIds = (rows.results || []).map((row: any) => String(row.id)).filter(Boolean)
  const artifactRows = recommendationIds.length
    ? await DB.prepare(`SELECT id,filename,media_type,size_bytes,created_at,metadata_json FROM artifacts
        WHERE json_extract(metadata_json,'$.recommendation_id') IN (${recommendationIds.map(() => '?').join(',')})
          AND COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged'
        ORDER BY created_at DESC`).bind(...recommendationIds).all<any>()
    : { results: [] }
  const renditions = selectLearningSourceRenditions(artifactRows.results || [])

  const mappedItems = (rows.results || []).map((row: any) => {
    let breakdown: any = null
    try { breakdown = row.predicted_components_json ? JSON.parse(row.predicted_components_json) : null } catch {}
    const branchLabel = row.branch_label || row.branch
    const branchId = row.branch_id || branchLabel
    const branchStatus = String(row.branch_status || '').trim().toLowerCase()
    const {
      round: _legacyRound,
      round_label: _legacyRoundLabel,
      source_health_checked_url: _sourceHealthCheckedUrl,
      source_health_status: _sourceHealthStatus,
      source_health_checked_at: _sourceHealthCheckedAt,
      source_health_http_status: _sourceHealthHttpStatus,
      source_health_final_url: _sourceHealthFinalUrl,
      source_health_error_code: _sourceHealthErrorCode,
      ...source
    } = row
    let sourceMetadata: Record<string, any> = {}
    try { sourceMetadata = JSON.parse(row.source_metadata_json || '{}') } catch {}
    const candidateMetadata = sourceMetadata.candidate_metadata || {}
    const pair = renditions.get(String(row.id)) || {}
    const sourceHealth = sourceHealthMatchesCurrentUrl(row.source_health_checked_url, row.video_url) && row.source_health_status ? {
      status: row.source_health_status,
      checked_url: row.source_health_checked_url,
      checked_at: row.source_health_checked_at,
      http_status: row.source_health_http_status,
      final_url: row.source_health_final_url,
      error_code: row.source_health_error_code,
    } : null
    return {
      ...source,
      branch_label: branchLabel,
      branch: branchLabel ? { id: branchId, label: branchLabel, status: branchStatus || 'love', super_category: row.branch_domain || null } : null,
      note: row.note_id ? { id: row.note_id, title: row.note_title || 'Field note' } : null,
      recall: { count: Number(row.recall_count || 0), due: Number(row.due_count || 0) },
      source_health: sourceHealth,
      companions: {
        html: pair.html || null,
        pdf: pair.pdf || null,
      },
      branch_preflight: branchLabel
        ? { branch_id: branchId, branch_label: branchLabel, super_category: row.branch_domain || null, status: branchStatus || 'love', conflict: branchStatus === 'pruned' }
        : { status: 'unmapped', conflict: false },
      compass: row.predicted_score != null
        ? { score: Number(row.predicted_score), confidence: Number(row.predicted_confidence ?? 0), breakdown }
        : null,
      candidate_metadata: Object.keys(candidateMetadata).length ? candidateMetadata : null,
      ...(delivery ? { delivery_match: deliveryMatch(candidateMetadata, delivery) } : {}),
    }
  })

  return matchesOnly && delivery ? mappedItems.filter((item) => item.delivery_match?.matches) : mappedItems
}
