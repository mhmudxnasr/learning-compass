import { displayRound } from './branch-rounds'

export async function loadCaptureQueue(DB: D1Database, limit = 50) {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 50)
  const rows = await DB.prepare(`SELECT r.*,m.learning_state,m.branch_id,m.priority_rank,m.progress_percent,m.estimated_minutes,m.tags_json,m.started_at,m.last_opened_at,
    COALESCE(n.label, r.branch) branch_label,
    COALESCE(n.status, 'love') branch_status,
    COALESCE(n.round_label, r.round) round_label,
    o.predicted_score,o.predicted_confidence,o.predicted_components_json,(SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads t ON t.id=ts.thread_id WHERE ts.recommendation_id=r.id AND ts.status='active' AND t.status NOT IN ('verified','abandoned') ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 1) thread_id,(SELECT n.id FROM notes n WHERE n.recommendation_id=r.id ORDER BY n.updated_at DESC LIMIT 1) note_id,(SELECT n.title FROM notes n WHERE n.recommendation_id=r.id ORDER BY n.updated_at DESC LIMIT 1) note_title,(SELECT COUNT(*) FROM srs_cards sc WHERE sc.recommendation_id=r.id) recall_count,(SELECT COUNT(*) FROM srs_cards sc WHERE sc.recommendation_id=r.id AND sc.due_at IS NOT NULL AND sc.due_at<=date('now')) due_count,(SELECT a.id FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id')=r.id AND (a.media_type LIKE '%html%' OR a.filename LIKE '%.html') ORDER BY a.created_at DESC LIMIT 1) html_artifact_id,(SELECT a.id FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id')=r.id AND (a.media_type LIKE '%pdf%' OR a.filename LIKE '%.pdf') ORDER BY a.created_at DESC LIMIT 1) pdf_artifact_id FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes n ON n.id=m.branch_id LEFT JOIN recommendation_outcomes o ON o.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress') ORDER BY COALESCE(m.priority_rank,999),r.created_at DESC LIMIT ?`).bind(boundedLimit).all<any>()

  return (rows.results || []).map((row: any) => {
    let breakdown: any = null
    try { breakdown = row.predicted_components_json ? JSON.parse(row.predicted_components_json) : null } catch {}
    const branchLabel = row.branch_label || row.branch
    const branchId = row.branch_id || branchLabel
    const roundLabel = row.round_label || row.round
    const branchStatus = String(row.branch_status || '').trim().toLowerCase()
    const round = displayRound({ round_label: roundLabel, id: branchId }, {
      consumed: 0,
      notes: row.note_id ? 1 : 0,
      cards: Number(row.recall_count || 0),
      due: Number(row.due_count || 0),
      recallStrength: null,
    })
    return {
      ...row,
      branch_label: branchLabel,
      round_label: roundLabel,
      branch: branchLabel ? { id: branchId, label: branchLabel, round, status: branchStatus || 'love' } : null,
      note: row.note_id ? { id: row.note_id, title: row.note_title || 'Field note' } : null,
      recall: { count: Number(row.recall_count || 0), due: Number(row.due_count || 0) },
      companions: {
        html: row.html_artifact_id ? { id: row.html_artifact_id } : null,
        pdf: row.pdf_artifact_id ? { id: row.pdf_artifact_id } : null,
      },
      branch_preflight: branchLabel
        ? { branch_id: branchId, branch_label: branchLabel, status: branchStatus || 'love', conflict: branchStatus === 'pruned' }
        : { status: 'unmapped', conflict: false },
      compass: row.predicted_score != null
        ? { score: Number(row.predicted_score), confidence: Number(row.predicted_confidence ?? 0), breakdown }
        : null,
    }
  })
}
