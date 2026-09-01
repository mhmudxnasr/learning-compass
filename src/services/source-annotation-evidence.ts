export class SourceAnnotationEvidenceError extends Error {
  readonly code: string
  readonly status: 400 | 404 | 409
  constructor(code: string, message: string, status: 400 | 404 | 409 = 409) {
    super(message)
    this.code = code
    this.status = status
  }
}

const clean = (value: unknown, max = 4000) =>
  String(value || '')
    .trim()
    .slice(0, max)

const parseSelector = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const locatorFor = (annotation: any, selector: Record<string, unknown>) =>
  clean(
    selector.locator ||
      selector.page ||
      selector.timestamp ||
      selector.css_selector ||
      selector.url ||
      annotation.source_url,
    1000,
  ) || `quote:${clean(annotation.source_checksum, 160)}`

const anchorTypeFor = (locatorType: string) =>
  locatorType === 'video'
    ? 'timestamp'
    : locatorType === 'pdf'
      ? 'page'
      : locatorType === 'web'
        ? 'url_fragment'
        : locatorType === 'text'
          ? 'quote'
          : 'section'

async function sourceBelongsToThread(DB: D1Database, recommendationId: string, threadId: string) {
  return DB.prepare(
    `SELECT t.id FROM learning_threads t
    WHERE t.id=? AND t.superseded_at IS NULL AND (
      EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id=t.id AND ts.recommendation_id=? AND ts.status!='removed')
      OR EXISTS (SELECT 1 FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id WHERE s.thread_id=t.id AND ps.recommendation_id=?)
      OR EXISTS (SELECT 1 FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id WHERE l.thread_id=t.id AND ls.recommendation_id=?))`,
  )
    .bind(threadId, recommendationId, recommendationId, recommendationId)
    .first<any>()
}

export type SourceAnnotationEvidence = {
  id: string
  recommendation_id: string
  artifact_id: string | null
  thread_id: string | null
  branch_id: string
  locator_type: string
  selector: Record<string, unknown>
  quote: string
  context_before: string | null
  context_after: string | null
  language: string | null
  source_checksum: string
  source_url: string
  locator: string
  anchor_type: 'page' | 'timestamp' | 'section' | 'quote' | 'url_fragment'
}

/**
 * Load one active anchor from canonical state. Derivations never trust a client
 * copy of its source, branch, Thread, quote, locator, artifact, or checksum.
 */
export async function loadSourceAnnotationEvidence(
  DB: D1Database,
  annotationId: string,
  expected: { recommendationId?: string | null; branchId?: string | null; threadId?: string | null } = {},
): Promise<SourceAnnotationEvidence> {
  const id = clean(annotationId, 120)
  if (!id) throw new SourceAnnotationEvidenceError('annotation_required', 'A source anchor is required.', 400)
  const row = await DB.prepare(
    `SELECT a.id,a.recommendation_id,a.artifact_id,a.thread_id,a.branch_id,a.locator_type,a.selector_json,a.quote,
      a.context_before,a.context_after,a.language,a.source_checksum,r.video_url,m.branch_id canonical_branch_id
    FROM source_annotations a
    JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL
    JOIN recommendation_meta m ON m.recommendation_id=r.id
    JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
    JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
    WHERE a.id=? AND a.status='active'`,
  )
    .bind(id)
    .first<any>()
  if (!row)
    throw new SourceAnnotationEvidenceError(
      'annotation_not_found',
      'The source anchor is unavailable, archived, or no longer has valid source ownership.',
      404,
    )
  if (!row.branch_id || row.branch_id !== row.canonical_branch_id) {
    throw new SourceAnnotationEvidenceError(
      'annotation_branch_stale',
      'The source anchor no longer matches the source’s canonical branch. Review the anchor before deriving from it.',
    )
  }
  const expectedRecommendationId = clean(expected.recommendationId, 120)
  const expectedBranchId = clean(expected.branchId, 120)
  const expectedThreadId = clean(expected.threadId, 120)
  if (expectedRecommendationId && row.recommendation_id !== expectedRecommendationId) {
    throw new SourceAnnotationEvidenceError(
      'annotation_source_conflict',
      'The source anchor belongs to a different source.',
    )
  }
  if (expectedBranchId && row.branch_id !== expectedBranchId) {
    throw new SourceAnnotationEvidenceError(
      'annotation_branch_conflict',
      'The source anchor belongs to a different branch.',
    )
  }
  if (row.artifact_id) {
    const artifact = await DB.prepare(
      `SELECT id FROM artifacts WHERE id=? AND json_extract(metadata_json,'$.recommendation_id')=?`,
    )
      .bind(row.artifact_id, row.recommendation_id)
      .first<any>()
    if (!artifact)
      throw new SourceAnnotationEvidenceError(
        'annotation_artifact_stale',
        'The source anchor’s artifact no longer belongs to its source.',
      )
  }
  const threadId = expectedThreadId || clean(row.thread_id, 120)
  if (expectedThreadId && row.thread_id && row.thread_id !== expectedThreadId) {
    throw new SourceAnnotationEvidenceError(
      'annotation_scope_conflict',
      'The source anchor belongs to a different Learning Thread.',
    )
  }
  if (threadId && !(await sourceBelongsToThread(DB, row.recommendation_id, threadId))) {
    throw new SourceAnnotationEvidenceError(
      'annotation_scope_conflict',
      'The source anchor’s source is not placed in this Learning Thread.',
    )
  }
  const selector = parseSelector(row.selector_json)
  const checksum = clean(row.source_checksum, 160)
  if (!checksum)
    throw new SourceAnnotationEvidenceError(
      'annotation_checksum_missing',
      'The source anchor has no durable evidence checksum.',
    )
  return {
    id: row.id,
    recommendation_id: row.recommendation_id,
    artifact_id: row.artifact_id || null,
    thread_id: row.thread_id || null,
    branch_id: row.branch_id,
    locator_type: row.locator_type,
    selector,
    quote: row.quote,
    context_before: row.context_before || null,
    context_after: row.context_after || null,
    language: row.language || null,
    source_checksum: checksum,
    source_url: row.video_url,
    locator: locatorFor(row, selector),
    anchor_type: anchorTypeFor(row.locator_type),
  }
}
