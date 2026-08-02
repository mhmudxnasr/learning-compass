const stringFields = ['pair_id', 'role', 'recommendation_id', 'source_url', 'source_title', 'generator', 'revision', 'supersedes_pair_id', 'coverage_status', 'qa_status', 'qa_checked_at', 'repair_status', 'repair_reason', 'video_format']
const booleanFields = ['custom_prompt_applied', 'notebook_url_linked', 'source_indexed', 'download_verified']
const jsonFields = ['qa_checks_json']

export type ArtifactMetadataValidation =
  | { ok: true; metadata: Record<string, unknown>; failures: [] }
  | { ok: false; metadata: Record<string, unknown>; failures: string[] }

function parseBoolean(value: unknown, key: string) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1
  if (typeof value === 'string') {
    if (/^(true|1)$/i.test(value.trim())) return true
    if (/^(false|0)$/i.test(value.trim())) return false
  }
  throw new Error(`${key} must be boolean`)
}

function parseJson(value: unknown, key: string) {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value) } catch { throw new Error(`${key} must be valid JSON`) }
  }
  throw new Error(`${key} must be valid JSON`)
}

function isHtml(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  if (metadata.role) return metadata.role === 'html'
  return /html/i.test(String(file?.type || '')) || /\.html?$/i.test(String(file?.name || ''))
}

function isPdf(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  if (metadata.role) return metadata.role === 'pdf'
  return /pdf/i.test(String(file?.type || '')) || /\.pdf$/i.test(String(file?.name || ''))
}

function isVideo(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  if (metadata.role) return metadata.role === 'video'
  return /video/i.test(String(file?.type || '')) || /\.(mp4|webm|mov|m4v)$/i.test(String(file?.name || ''))
}

function mediaRoleFailures(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  const role = String(metadata.role || '').toLowerCase()
  if (!role || !file) return []
  const hint = `${file.type || ''} ${file.name || ''}`.toLowerCase()
  const mismatched = role === 'html' ? /pdf|video|\.(mp4|webm|mov|m4v)\b/.test(hint)
    : role === 'pdf' ? /html?|video|\.(mp4|webm|mov|m4v)\b/.test(hint)
      : role === 'video' ? /html?|pdf|\.pdf\b/.test(hint)
        : false
  return mismatched ? [`role ${role} does not match uploaded media`] : []
}

export function validateArtifactQuality(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  const failures: string[] = mediaRoleFailures(metadata, file)
  const generator = String(metadata.generator || '')
  const checks = metadata.qa_checks_json as any
  if (generator === 'lite-visual' && isHtml(metadata, file)) {
    if (typeof metadata.quality_score !== 'number' || metadata.quality_score < 8) failures.push('quality_score must be at least 8 for Lite Visual HTML')
    if (metadata.coverage_status !== 'complete') failures.push('coverage_status must be complete for Lite Visual HTML')
    if (metadata.qa_status !== 'passed') failures.push('qa_status must be passed for Lite Visual HTML')
    const dimensions = ['source_fidelity', 'learning_value', 'composition', 'visual_intelligence', 'source_fit']
    if (!checks || typeof checks !== 'object' || Array.isArray(checks)) failures.push('qa_checks_json must contain the five Lite Visual score dimensions')
    else {
      const values = dimensions.map((key) => checks[key])
      if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2)) failures.push('qa_checks_json score dimensions must be numeric values from 0 to 2')
      if (values.every((value) => typeof value === 'number') && Math.abs(values.reduce((sum, value) => sum + value, 0) - Number(metadata.quality_score)) > 1e-9) failures.push('qa_checks_json score dimensions must sum to quality_score')
      if (!Array.isArray(checks.defects) || checks.defects.length !== 0) failures.push('qa_checks_json.defects must be an empty array')
    }
  }
  if (generator === 'lite-visual' && isPdf(metadata, file)) {
    if (metadata.qa_status !== 'passed') failures.push('qa_status must be passed for the linked Lite Visual PDF')
    if (!checks || checks.pdf_render_check !== 'passed') failures.push('qa_checks_json.pdf_render_check must be passed for the linked Lite Visual PDF')
  }
  if (generator === 'notebooklm' && isVideo(metadata, file)) {
    if (metadata.video_format !== 'cinematic') failures.push('video_format must be cinematic for NotebookLM video')
    for (const key of ['custom_prompt_applied', 'source_indexed', 'notebook_url_linked', 'download_verified']) if (metadata[key] !== true) failures.push(`${key} must be true for NotebookLM video`)
    if (metadata.qa_status !== 'passed') failures.push('qa_status must be passed for NotebookLM video')
  }
  return failures
}

export function mergeArtifactMultipartMetadata(metadata: Record<string, unknown>, form: FormData, file?: { name?: string; type?: string }): ArtifactMetadataValidation {
  const failures: string[] = []
  for (const key of stringFields) {
    const value = form.get(key)
    if (typeof value === 'string' && value.trim()) metadata[key] = value.trim()
  }
  const qualityScore = form.get('quality_score')
  if (qualityScore !== null) metadata.quality_score = qualityScore
  if (metadata.quality_score !== undefined) {
    const raw = String(metadata.quality_score).trim()
    const parsed = typeof metadata.quality_score === 'number' ? metadata.quality_score : raw ? Number(raw) : Number.NaN
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) failures.push('quality_score must be a numeric value between 0 and 10')
    else metadata.quality_score = parsed
  }
  for (const key of booleanFields) {
    const value = form.get(key)
    if (value !== null) { try { metadata[key] = parseBoolean(value, key) } catch (error) { failures.push((error as Error).message) } }
    else if (metadata[key] !== undefined) { try { metadata[key] = parseBoolean(metadata[key], key) } catch (error) { failures.push((error as Error).message) } }
  }
  for (const key of jsonFields) {
    const value = form.get(key)
    if (value !== null) { try { metadata[key] = parseJson(value, key) } catch (error) { failures.push((error as Error).message) } }
    else if (metadata[key] !== undefined) { try { metadata[key] = parseJson(metadata[key], key) } catch (error) { failures.push((error as Error).message) } }
  }
  failures.push(...validateArtifactQuality(metadata, file))
  return failures.length ? { ok: false, metadata, failures: [...new Set(failures)] } : { ok: true, metadata, failures: [] }
}

export function normalizeQualityAssurance(metadata: Record<string, unknown> = {}, legacy = false) {
  const contractFailures = validateArtifactQuality(metadata)
  const explicitRepair = metadata.repair_status === 'required' || metadata.qa_status === 'failed' || metadata.qa_status === 'repair_required'
  const repairRequired = explicitRepair || (Boolean(metadata.qa_status) && contractFailures.length > 0)
  const failures = repairRequired
    ? [...new Set([...(metadata.repair_reason ? [String(metadata.repair_reason)] : []), ...contractFailures])]
    : []
  return {
    status: legacy || !metadata.qa_status ? 'unverified' : repairRequired ? 'repair_required' : metadata.qa_status === 'passed' ? 'passed' : 'unverified',
    score: typeof metadata.quality_score === 'number' ? metadata.quality_score : null,
    video_format: metadata.video_format || null,
    repair_status: repairRequired ? 'required' : metadata.qa_status === 'passed' ? 'not_needed' : null,
    failures,
  }
}
