const stringFields = ['pair_id', 'role', 'recommendation_id', 'source_url', 'source_title', 'generator', 'revision', 'supersedes_pair_id', 'qa_status', 'video_format']
const booleanFields = ['custom_prompt_applied', 'notebook_url_linked', 'source_indexed', 'download_verified']
const jsonFields: string[] = []

export type ArtifactMetadataValidation =
  | { ok: true; metadata: Record<string, unknown>; failures: [] }
  | { ok: false; metadata: Record<string, unknown>; failures: string[] }

export function validateArtifactIntegrity(metadata: Record<string, unknown>, file: { name?: string; type?: string; size?: number }, bytes: ArrayBuffer) {
  const failures: string[] = []
  if (!bytes.byteLength) failures.push('artifact must not be empty')
  const role = String(metadata.role || '').toLowerCase()
  const filename = String(file.name || '').toLowerCase()
  const mediaType = String(file.type || '').toLowerCase()
  const view = new Uint8Array(bytes)
  if (role === 'pdf' || mediaType.includes('pdf') || filename.endsWith('.pdf')) {
    const signature = new TextDecoder().decode(view.slice(0, 5))
    if (signature !== '%PDF-') failures.push('PDF artifact must have a valid PDF signature')
  }
  if (role === 'html' || mediaType.includes('html') || /\.html?$/.test(filename)) {
    const head = new TextDecoder().decode(view.slice(0, 4096)).toLowerCase()
    if (!/<\s*!doctype\s+html|<\s*html[\s>]/.test(head)) failures.push('HTML artifact must contain a document root')
  }
  return failures
}

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
  const explicitRepair = false
  const repairRequired = explicitRepair || (Boolean(metadata.qa_status) && contractFailures.length > 0)
  const notebookVideo = String(metadata.generator || '') === 'notebooklm' && isVideo(metadata)
  const failures = repairRequired
    ? [...new Set([...(metadata.repair_reason ? [String(metadata.repair_reason)] : []), ...contractFailures])]
    : []
  return {
    status: legacy || !notebookVideo ? 'unverified' : repairRequired ? 'repair_required' : metadata.qa_status === 'passed' ? 'passed' : 'unverified',
    score: null,
    video_format: metadata.video_format || null,
    repair_status: repairRequired ? 'required' : null,
    failures,
  }
}
