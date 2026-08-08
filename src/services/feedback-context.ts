type FeedbackDb = Pick<D1Database, 'prepare'>

const parseJson = (value: unknown) => {
  if (!value) return null
  try { return JSON.parse(String(value)) } catch { return value }
}

/**
 * Canonical evidence bundle for feedback learning. It deliberately includes
 * every archived reaction, not only the latest item, so Taste Mapper can see
 * repeated signals before proposing profile or map changes.
 */
export async function loadFeedbackContext(db: FeedbackDb) {
  const [recommendations, reflections, profile, nodes] = await Promise.all([
    db.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.video_url,r.status,r.user_rating,r.user_score,r.user_review,r.consumed_date,r.updated_at,m.branch_id,m.source_metadata_json
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE NULLIF(TRIM(r.user_review),'') IS NOT NULL OR json_extract(m.source_metadata_json,'$.learning_feedback') IS NOT NULL
      ORDER BY COALESCE(r.consumed_date,r.updated_at,r.created_at) ASC`).all<any>(),
    db.prepare(`SELECT n.id,n.recommendation_id,n.title,n.updated_at,s.content
      FROM notes n JOIN note_sections s ON s.note_id=n.id AND s.section_key='reaction'
      WHERE n.kind='reflection' AND TRIM(COALESCE(s.content,''))!=''
      ORDER BY n.updated_at ASC`).all<any>(),
    db.prepare(`SELECT core_filter,mega_priority_json,identity_json,reaction_style_json,quality_rules_json,operational_style_json,patterns_summary_json,recent_signal FROM profile WHERE id=1`).first<any>(),
    db.prepare(`SELECT id,type,label,parent_id,super_category,status,round_label,meta_json FROM tree_nodes WHERE type IN ('root','category','branch','leaf') ORDER BY label`).all<any>(),
  ])

  const feedback: any[] = (recommendations.results || []).map((row: any) => {
    const metadata = parseJson(row.source_metadata_json) || {}
    return {
      recommendation_id: row.id,
      title: row.video_title,
      creator: row.creator,
      content_type: row.content_type,
      url: row.video_url,
      status: row.status,
      rating: row.user_score ?? row.user_rating,
      feedback: row.user_review || null,
      branch_id: row.branch_id || null,
      structured: metadata.learning_feedback || null,
      recorded_at: row.consumed_date || row.updated_at,
    }
  })

  for (const row of reflections.results || []) {
    const existing = feedback.find((item: any) => item.recommendation_id === row.recommendation_id)
    if (existing) {
      if (!existing.feedback) existing.feedback = row.content
      continue
    }
    feedback.push({ recommendation_id: row.recommendation_id, title: row.title, feedback: row.content, recorded_at: row.updated_at })
  }

  return {
    feedback,
    feedback_count: feedback.length,
    profile: profile ? Object.fromEntries(Object.entries(profile).map(([key, value]) => [key.endsWith('_json') ? key.slice(0, -5) : key, key.endsWith('_json') ? parseJson(value) : value])) : null,
    nodes: nodes.results || [],
  }
}
