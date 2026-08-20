import type { ThreadCoverageAnchor } from '../compass-scoring'

/**
 * Loads the explicit curriculum that existing Learning Threads already own.
 * Free-form Notes and generated summaries are intentionally excluded: they can
 * inform later structured coverage, but they are too noisy for a hard gate.
 */
export async function loadThreadCoverageAnchors(db: D1Database): Promise<ThreadCoverageAnchor[]> {
  const rows = await db.prepare(`
    SELECT t.id AS thread_id,t.title AS thread_title,'thread' AS scope_kind,t.id AS scope_id,t.title AS label,
      trim(t.title || ' ' || COALESCE(t.guiding_question,'') || ' ' || COALESCE(t.definition_of_done,'')) AS coverage_text
    FROM learning_threads t WHERE t.status!='abandoned'
    UNION ALL
    SELECT t.id,t.title,'level',s.id,s.title,
      trim(s.title || ' ' || COALESCE(s.objective,'') || ' ' || COALESCE(s.description,'') || ' ' || COALESCE(s.output_description,''))
    FROM learning_path_stages s JOIN learning_threads t ON t.id=s.thread_id WHERE t.status!='abandoned'
    UNION ALL
    SELECT t.id,t.title,'lesson',l.id,l.title,
      trim(l.title || ' ' || COALESCE(l.description,'') || ' ' || COALESCE(l.objective,'') || ' ' || COALESCE(l.why_learn,'') || ' ' || COALESCE(l.takeaway,''))
    FROM thread_lessons l JOIN learning_threads t ON t.id=l.thread_id WHERE t.status!='abandoned'
    UNION ALL
    SELECT t.id,t.title,'item',i.id,i.title,
      trim(i.title || ' ' || COALESCE(i.description,''))
    FROM learning_path_items i JOIN learning_path_stages s ON s.id=i.stage_id JOIN learning_threads t ON t.id=s.thread_id
    WHERE t.status!='abandoned'
  `).all<any>()
  return (rows.results || []).map((row: any) => ({
    threadId: String(row.thread_id),
    threadTitle: String(row.thread_title),
    scopeKind: row.scope_kind as ThreadCoverageAnchor['scopeKind'],
    scopeId: String(row.scope_id),
    label: String(row.label),
    text: String(row.coverage_text || row.label),
  }))
}
