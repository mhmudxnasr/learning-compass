export interface LearningArtifactRow {
  id: string
  filename?: string | null
  media_type?: string | null
  size_bytes?: number | null
  created_at?: string | null
  metadata_json?: string | null
  metadata?: Record<string, unknown>
}

export interface LearningSourceRenditions {
  html?: LearningArtifactRow
  pdf?: LearningArtifactRow
}

function parseMetadata(row: LearningArtifactRow) {
  if (row.metadata && typeof row.metadata === 'object') return row.metadata
  try {
    const parsed = JSON.parse(String(row.metadata_json || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function renditionRole(row: LearningArtifactRow, metadata: Record<string, unknown>) {
  const explicit = String(metadata.role || '').toLowerCase()
  if (explicit === 'html' || explicit === 'pdf') return explicit
  const mediaType = String(row.media_type || '').toLowerCase().split(';', 1)[0].trim()
  if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') return 'html'
  if (mediaType === 'application/pdf') return 'pdf'
  const filename = String(row.filename || '').trim().toLowerCase()
  if (/\.html?$/.test(filename)) return 'html'
  if (/\.pdf$/.test(filename)) return 'pdf'
  return null
}

function newestFirst(a: LearningArtifactRow, b: LearningArtifactRow) {
  const aTimestamp = Number(String(a.id || '').match(/^artifact_(\d+)_/)?.[1] || 0)
  const bTimestamp = Number(String(b.id || '').match(/^artifact_(\d+)_/)?.[1] || 0)
  if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp
  return String(b.created_at || '').localeCompare(String(a.created_at || ''))
}

function publishable(metadata: Record<string, unknown>) {
  const contract = String(metadata.workflow_contract || '')
  if (!contract) return true
  return contract !== 'lite-visual-linear/v4' || metadata.generator === 'lite-visual' && metadata.publication_state === 'ready' && metadata.validation_status === 'passed' && metadata.asset_policy === 'code-only'
}

/**
 * Select one coherent HTML/PDF companion set for each recommendation.
 *
 * Paired artifacts are returned only from the newest complete pair. This avoids
 * silently combining two revisions. Unpaired legacy files retain the previous
 * independent-role fallback for REST compatibility.
 */
export function selectLearningSourceRenditions(rows: LearningArtifactRow[]) {
  const byRecommendation = new Map<string, LearningArtifactRow[]>()

  for (const row of rows) {
    const metadata = parseMetadata(row)
    const recommendationId = String(metadata.recommendation_id || '').trim()
    const role = renditionRole(row, metadata)
    if (!recommendationId || !role || String(metadata.scope || '').toLowerCase() === 'book') continue
    // Add parsed metadata without removing the legacy JSON field from the REST
    // response; existing consumers may still read metadata_json directly.
    if (!publishable(metadata)) continue
    const normalized = { ...row, metadata }
    byRecommendation.set(recommendationId, [...(byRecommendation.get(recommendationId) || []), normalized])
  }

  const selected = new Map<string, LearningSourceRenditions>()
  for (const [recommendationId, artifacts] of byRecommendation) {
    const pairs = new Map<string, LearningArtifactRow[]>()
    const unpaired: LearningArtifactRow[] = []
    for (const artifact of artifacts) {
      const pairId = String(artifact.metadata?.pair_id || '').trim()
      if (!pairId) unpaired.push(artifact)
      else pairs.set(pairId, [...(pairs.get(pairId) || []), artifact])
    }

    const completePairs = [...pairs.values()]
      .map((pair) => pair.sort(newestFirst))
      .filter((pair) => pair.some((item) => renditionRole(item, item.metadata || {}) === 'html')
        && pair.some((item) => renditionRole(item, item.metadata || {}) === 'pdf'))
      .sort((a, b) => newestFirst(a[0], b[0]))

    const chosen = completePairs[0]
    if (chosen) {
      selected.set(recommendationId, {
        html: chosen.find((item) => renditionRole(item, item.metadata || {}) === 'html'),
        pdf: chosen.find((item) => renditionRole(item, item.metadata || {}) === 'pdf'),
      })
      continue
    }

    const legacy = unpaired.sort(newestFirst)
    const html = legacy.find((item) => renditionRole(item, item.metadata || {}) === 'html')
    const pdf = legacy.find((item) => renditionRole(item, item.metadata || {}) === 'pdf')
    if (html || pdf) selected.set(recommendationId, { html, pdf })
  }

  return selected
}
