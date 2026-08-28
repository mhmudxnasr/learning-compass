const CHUNK_SIZE = 75

export async function enrichRecommendationRows(DB: D1Database, input: any[], excludeBookArtifacts = false) {
  const rows = input.map((row) => ({ ...row }))
  const byId = new Map(rows.map((row) => [String(row.id), row]))
  const ids = [...byId.keys()]

  for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
    const chunk = ids.slice(start, start + CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(',')
    const artifactScope = excludeBookArtifacts ? "AND COALESCE(json_extract(metadata_json,'$.scope'),'')!='book'" : ''
    const [notes, recall, artifacts] = await Promise.all([
      DB.prepare(`SELECT recommendation_id,id,title FROM notes WHERE recommendation_id IN (${placeholders}) ORDER BY updated_at DESC`).bind(...chunk).all<any>(),
      DB.prepare(`SELECT recommendation_id,COUNT(*) recall_count,SUM(CASE WHEN due_at IS NOT NULL AND due_at<=date('now') THEN 1 ELSE 0 END) due_count FROM srs_cards WHERE recommendation_id IN (${placeholders}) GROUP BY recommendation_id`).bind(...chunk).all<any>(),
      DB.prepare(`SELECT json_extract(metadata_json,'$.recommendation_id') recommendation_id,id,media_type,filename FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id') IN (${placeholders}) AND COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged' ${artifactScope} ORDER BY created_at DESC`).bind(...chunk).all<any>(),
    ])

    for (const note of notes.results || []) {
      const row = byId.get(String(note.recommendation_id))
      if (row && !row.note_id) {
        row.note_id = note.id
        row.note_title = note.title
      }
    }
    for (const counts of recall.results || []) {
      const row = byId.get(String(counts.recommendation_id))
      if (row) {
        row.recall_count = Number(counts.recall_count || 0)
        row.due_count = Number(counts.due_count || 0)
      }
    }
    for (const artifact of artifacts.results || []) {
      const row = byId.get(String(artifact.recommendation_id))
      if (!row) continue
      const html = String(artifact.media_type || '').includes('html') || String(artifact.filename || '').endsWith('.html')
      const pdf = String(artifact.media_type || '').includes('pdf') || String(artifact.filename || '').endsWith('.pdf')
      if (html) {
        row.html_count = Number(row.html_count || 0) + 1
        row.html_artifact_id ||= artifact.id
      }
      if (pdf) {
        row.pdf_count = Number(row.pdf_count || 0) + 1
        row.pdf_artifact_id ||= artifact.id
      }
    }
  }

  return rows
}
