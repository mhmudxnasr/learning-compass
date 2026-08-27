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
  const [recommendations, reflections, learningFeedback, compassFeedback, profile, assertions, nodes] = await Promise.all([
    db.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.video_url,r.status,r.user_rating,r.user_score,r.user_review,r.consumed_date,r.updated_at,m.branch_id,m.source_metadata_json
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE NULLIF(TRIM(r.user_review),'') IS NOT NULL OR json_extract(m.source_metadata_json,'$.learning_feedback') IS NOT NULL
      ORDER BY COALESCE(r.consumed_date,r.updated_at,r.created_at) ASC`).all<any>(),
    db.prepare(`SELECT n.id,n.recommendation_id,n.title,n.updated_at,s.content
      FROM notes n JOIN note_sections s ON s.note_id=n.id AND s.section_key='reaction'
      WHERE n.kind='reflection' AND TRIM(COALESCE(s.content,''))!=''
      ORDER BY n.updated_at ASC`).all<any>(),
    db.prepare(`SELECT le.id,le.recommendation_id,le.session_id,le.thread_id,le.occurred_at,le.payload_json,
        r.video_title title,r.creator,r.content_type,r.video_url url,r.status,m.branch_id
      FROM learning_events le
      LEFT JOIN recommendations r ON r.id=le.recommendation_id
      LEFT JOIN recommendation_meta m ON m.recommendation_id=le.recommendation_id
      WHERE le.event_type='reflection_submitted'
      ORDER BY le.occurred_at ASC,le.id ASC`).all<any>(),
    db.prepare(`SELECT cf.id,cf.pick_id,cf.recommendation_id,cf.outcome,cf.score,cf.reason_tags_json,cf.reflection,cf.exposure_json,cf.structured_json,cf.disposition,cf.created_at,
        p.strategy lane,p.thread_id,p.engine_version,p.candidate_count,
        r.video_title title,r.creator,r.content_type,r.video_url url,r.status,m.branch_id
      FROM compass_feedback cf
      LEFT JOIN compass_picks p ON p.id=cf.pick_id
      LEFT JOIN recommendations r ON r.id=cf.recommendation_id
      LEFT JOIN recommendation_meta m ON m.recommendation_id=cf.recommendation_id
      ORDER BY cf.created_at ASC`).all<any>(),
    db.prepare(`SELECT core_filter,mega_priority_json,identity_json,reaction_style_json,quality_rules_json,operational_style_json,patterns_summary_json,recent_signal FROM profile WHERE id=1`).first<any>(),
    db.prepare(`SELECT assertion_key,category,scope,value_json,weight,confidence,status,source_kind,version,updated_at FROM profile_assertions WHERE status IN ('active','hypothesis') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,confidence DESC,updated_at DESC`).all<any>(),
    db.prepare(`SELECT id,type,label,parent_id,super_category,status,meta_json FROM tree_nodes WHERE type IN ('root','category','branch','leaf') ORDER BY label`).all<any>(),
  ])

  const feedbackEvents: any[] = []
  const feedback: any[] = (recommendations.results || []).map((row: any) => {
    const metadata = parseJson(row.source_metadata_json) || {}
    const item = {
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
      compass_events: [] as any[],
      recorded_at: row.consumed_date || row.updated_at,
    }
    return item
  })

  for (const row of reflections.results || []) {
    const existing = feedback.find((item: any) => item.recommendation_id === row.recommendation_id)
    if (existing) {
      if (!existing.feedback) existing.feedback = row.content
      continue
    }
    feedback.push({ recommendation_id: row.recommendation_id, title: row.title, feedback: row.content, recorded_at: row.updated_at })
  }

  const completeGeneralEventSources = new Set<string>()
  for (const row of learningFeedback.results || []) {
    const payload = parseJson(row.payload_json) || {}
    const structured = payload.structured_feedback || {
      completion_state: payload.completion_state || null,
      reason_tags: Array.isArray(payload.reason_tags) ? payload.reason_tags : [],
      expected: payload.expected || null,
      actual: payload.actual || null,
      effort: payload.effort || null,
      length_minutes: payload.length_minutes ?? null,
    }
    feedbackEvents.push({
      event_id: row.id,
      source: payload.source || 'learning_feedback',
      recommendation_id: row.recommendation_id,
      session_id: row.session_id || null,
      thread_id: row.thread_id || null,
      title: row.title || null,
      creator: row.creator || null,
      content_type: row.content_type || null,
      url: row.url || null,
      status: row.status || null,
      branch_id: row.branch_id || null,
      rating: payload.rating ?? null,
      disposition: payload.disposition || 'undecided',
      reason_tags: Array.isArray(structured.reason_tags) ? structured.reason_tags : [],
      feedback: payload.reflection || null,
      structured: { ...structured, score: payload.rating ?? structured.score ?? null },
      recorded_at: row.occurred_at,
    })
    if (row.recommendation_id && (payload.reflection != null || payload.structured_feedback)) completeGeneralEventSources.add(String(row.recommendation_id))
  }

  for (const item of feedback) {
    if ((item.feedback || item.structured) && !completeGeneralEventSources.has(String(item.recommendation_id))) {
      feedbackEvents.push({ event_id: `source:${item.recommendation_id}:${item.recorded_at}`, source: 'learning_feedback', ...item, compass_events: undefined })
    }
  }

  for (const row of compassFeedback.results || []) {
    const reasonTags = parseJson(row.reason_tags_json)
    const rawExposure = parseJson(row.exposure_json) || {}
    const { round: _legacyRound, round_label: _legacyRoundLabel, ...exposure } = rawExposure
    const storedStructured = parseJson(row.structured_json) || {}
    const event = {
      event_id: row.id,
      source: 'compass_pick',
      pick_id: row.pick_id,
      recommendation_id: row.recommendation_id,
      title: row.title || null,
      creator: row.creator || null,
      content_type: row.content_type || null,
      url: row.url || null,
      status: row.status || null,
      branch_id: exposure.branch_id || row.branch_id || null,
      thread_id: exposure.thread_id || row.thread_id || null,
      target_lesson_id: exposure.target_lesson_id || null,
      lane: exposure.lane || row.lane || null,
      engine: exposure.engine || row.engine_version || null,
      candidate_count: Number(exposure.candidate_count ?? row.candidate_count ?? 0),
      outcome: storedStructured.outcome || row.outcome,
      rating: row.score,
      disposition: row.disposition || storedStructured.disposition || 'undecided',
      reason_tags: Array.isArray(reasonTags) ? reasonTags : [],
      feedback: row.reflection || null,
      structured: {
        ...storedStructured,
        completion_state: storedStructured.completion_state || (row.outcome === 'completed' ? 'completed' : ['declined', 'abandoned'].includes(row.outcome) ? 'stopped' : 'in_progress'),
        reason_tags: Array.isArray(reasonTags) ? reasonTags : [],
        score: row.score,
      },
      exposure,
      recorded_at: row.created_at,
    }
    feedbackEvents.push(event)
    let existing = feedback.find((item: any) => item.recommendation_id === row.recommendation_id)
    if (!existing) {
      existing = { recommendation_id: row.recommendation_id, title: row.title, creator: row.creator, content_type: row.content_type, url: row.url, status: row.status, rating: row.score, feedback: row.reflection || null, branch_id: row.branch_id || exposure.branch_id || null, structured: event.structured, recorded_at: row.created_at, compass_events: [] }
      feedback.push(existing)
    }
    existing.compass_events = [...(existing.compass_events || []), event]
    if (!existing.feedback && row.reflection) existing.feedback = row.reflection
    if (existing.rating == null && row.score != null) existing.rating = row.score
  }

  return {
    feedback,
    feedback_count: feedback.length,
    feedback_events: feedbackEvents.sort((a, b) => String(a.recorded_at || '').localeCompare(String(b.recorded_at || '')) || String(a.event_id).localeCompare(String(b.event_id))),
    feedback_event_count: feedbackEvents.length,
    profile: profile ? Object.fromEntries(Object.entries(profile).map(([key, value]) => [key.endsWith('_json') ? key.slice(0, -5) : key, key.endsWith('_json') ? parseJson(value) : value])) : null,
    profile_assertions: (assertions.results || []).map((assertion: any) => ({ ...assertion, value: parseJson(assertion.value_json), value_json: undefined })),
    nodes: nodes.results || [],
  }
}
