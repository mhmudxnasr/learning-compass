export const LITE_VISUAL_SOURCE_EXTRACTION_SCHEMA = 'lite-visual-source-extraction/v1'
export const LITE_VISUAL_WORKFLOW_CONTRACT = 'lite-visual-linear/v4'
export const LITE_VISUAL_WORKFLOW_VERSION = 4
export const LITE_VISUAL_STAGES = ['resolve_source', 'extract_source', 'map_coverage', 'author_html', 'render_pdf', 'validate_pair', 'publish_pair', 'verify_record'] as const
export const LITE_VISUAL_CHECKPOINT_REQUIREMENTS: Record<string, string[]> = {
  extract_source: ['source_identity', 'source_kind'],
  map_coverage: ['schema_version', 'status', 'method', 'content_sha256', 'cache_key', 'word_count', 'manifest_path'],
  author_html: ['source_sha256', 'source_scope_sha256', 'word_count', 'span_count'],
  render_pdf: ['html_sha256', 'coverage_ledger_sha256', 'claim_count', 'canonical_selector'],
  validate_pair: ['html_sha256', 'pdf_sha256'],
  publish_pair: ['validation_schema', 'validation_status', 'receipt_sha256'],
  verify_record: ['pair_id', 'html_artifact_id', 'pdf_artifact_id'],
}

export function resolveLiteVisualResume(payload: Record<string, unknown>, workflowStep: unknown) {
  const isCurrent = payload.workflow_contract === LITE_VISUAL_WORKFLOW_CONTRACT && Number(payload.workflow_version) === LITE_VISUAL_WORKFLOW_VERSION
  const requestedStep = String(workflowStep || '')
  return {
    is_current: isCurrent,
    resume_from: isCurrent && LITE_VISUAL_STAGES.includes(requestedStep as typeof LITE_VISUAL_STAGES[number]) ? requestedStep : 'resolve_source',
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/
const present = (value: unknown) => typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null

export function validateLiteVisualCheckpointEvidence(step: string, evidence: Record<string, unknown> = {}) {
  const failures: string[] = []
  for (const field of LITE_VISUAL_CHECKPOINT_REQUIREMENTS[step] || []) if (!present(evidence[field])) failures.push(`${field} is required`)
  if (step === 'map_coverage') {
    if (evidence.schema_version !== LITE_VISUAL_SOURCE_EXTRACTION_SCHEMA) failures.push(`schema_version must be ${LITE_VISUAL_SOURCE_EXTRACTION_SCHEMA}`)
    if (evidence.status !== 'complete') failures.push('status must be complete')
    if (!SHA256_RE.test(String(evidence.content_sha256 || ''))) failures.push('content_sha256 must be a full lowercase SHA-256')
    if (!SHA256_RE.test(String(evidence.cache_key || ''))) failures.push('cache_key must be a full lowercase SHA-256')
    if (!Number.isInteger(Number(evidence.word_count)) || Number(evidence.word_count) < 1) failures.push('word_count must be a positive integer')
    if (!String(evidence.manifest_path || '').startsWith('/')) failures.push('manifest_path must be absolute')
  }
  if (step === 'author_html') {
    for (const field of ['source_sha256', 'source_scope_sha256']) if (!SHA256_RE.test(String(evidence[field] || ''))) failures.push(`${field} must be a full lowercase SHA-256`)
    for (const field of ['word_count', 'span_count']) {
      const minimum = field === 'span_count' && evidence.authoring_mode === 'direct' ? 0 : 1
      if (!Number.isInteger(Number(evidence[field])) || Number(evidence[field]) < minimum) failures.push(`${field} must be an integer of at least ${minimum}`)
    }
  }
  if (step === 'render_pdf') {
    for (const field of ['html_sha256', 'coverage_ledger_sha256']) if (!SHA256_RE.test(String(evidence[field] || ''))) failures.push(`${field} must be a full lowercase SHA-256`)
    const minimumClaims = evidence.authoring_mode === 'direct' ? 0 : 1
    if (!Number.isInteger(evidence.claim_count) || Number(evidence.claim_count) < minimumClaims) failures.push(`claim_count must be an integer of at least ${minimumClaims}`)
    if (evidence.canonical_selector !== 'article[data-canonical-content=true]') failures.push('canonical_selector must identify the v4 article')
  }
  if (step === 'validate_pair') for (const field of ['html_sha256', 'pdf_sha256']) if (!SHA256_RE.test(String(evidence[field] || ''))) failures.push(`${field} must be a full lowercase SHA-256`)
  if (step === 'publish_pair') {
    if (!['lite-visual-validation/v6', 'lite-visual-integrity/v1'].includes(String(evidence.validation_schema))) failures.push('validation_schema must be lite-visual-validation/v6 or lite-visual-integrity/v1')
    if (evidence.validation_status !== 'passed') failures.push('validation_status must be passed')
    if (!SHA256_RE.test(String(evidence.receipt_sha256 || ''))) failures.push('receipt_sha256 must be a full lowercase SHA-256')
  }
  if (step === 'verify_record') {
    if (!/^lv-[A-Za-z0-9._-]+$/.test(String(evidence.pair_id || ''))) failures.push('pair_id must be a valid lv-* identifier')
    if (evidence.html_artifact_id === evidence.pdf_artifact_id) failures.push('HTML and PDF artifact IDs must differ')
  }
  return [...new Set(failures)]
}
