const stringFields = ['pair_id', 'role', 'recommendation_id', 'source_url', 'source_title', 'source_checksum', 'generator', 'revision', 'supersedes_pair_id', 'qa_status', 'validation_status', 'validation_receipt_sha256', 'workflow_contract', 'asset_policy', 'publication_state', 'video_format', 'recommended_start']
const booleanFields = ['custom_prompt_applied', 'notebook_url_linked', 'source_indexed', 'download_verified']
const jsonFields: string[] = []

export type ArtifactMetadataValidation =
  | { ok: true; metadata: Record<string, unknown>; failures: [] }
  | { ok: false; metadata: Record<string, unknown>; failures: string[] }

export const LITE_VISUAL_WORKFLOW_CONTRACT = 'lite-visual-linear/v4'
export const LITE_VISUAL_RECEIPT_SCHEMA = 'lite-visual-validation/v5'
const SHA256_RE = /^[a-f0-9]{64}$/
const PAIR_ID_RE = /^lv-[a-zA-Z0-9._-]+$/

export type LiteVisualValidationReceipt = {
  schema_version?: unknown
  status?: unknown
  source_sha256?: unknown
  source_scope_sha256?: unknown
  coverage_ledger_sha256?: unknown
  html_sha256?: unknown
  pdf_sha256?: unknown
  checks?: unknown
  [key: string]: unknown
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array | string) {
  const value = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

export async function validateLiteVisualPair(
  metadata: Record<string, unknown>,
  receipt: LiteVisualValidationReceipt,
  htmlFile: { name?: string; type?: string; size?: number },
  pdfFile: { name?: string; type?: string; size?: number },
  htmlBytes: ArrayBuffer,
  pdfBytes: ArrayBuffer,
) {
  const failures: string[] = []
  const pairId = String(metadata.pair_id || '')
  const sourceChecksum = String(metadata.source_checksum || '')
  if (!PAIR_ID_RE.test(pairId)) failures.push('pair_id must start with lv- and contain only letters, digits, dots, underscores, or hyphens')
  if (!String(metadata.recommendation_id || '').trim()) failures.push('recommendation_id is required')
  if (!SHA256_RE.test(sourceChecksum)) failures.push('source_checksum must be a full lowercase SHA-256')
  if (metadata.generator !== 'lite-visual') failures.push('generator must be lite-visual')
  if (metadata.workflow_contract !== LITE_VISUAL_WORKFLOW_CONTRACT) failures.push(`workflow_contract must be ${LITE_VISUAL_WORKFLOW_CONTRACT}`)
  if (metadata.asset_policy !== 'code-only') failures.push('asset_policy must be code-only')
  if (metadata.recommended_start !== 'html') failures.push('recommended_start must be html for Lite Visual')
  if (receipt.schema_version !== LITE_VISUAL_RECEIPT_SCHEMA) failures.push(`validation receipt schema_version must be ${LITE_VISUAL_RECEIPT_SCHEMA}`)
  if (receipt.status !== 'passed') failures.push('validation receipt status must be passed')
  if (receipt.source_sha256 !== sourceChecksum) failures.push('validation receipt source hash does not match metadata')
  for (const key of ['source_scope_sha256', 'coverage_ledger_sha256', 'html_sha256', 'pdf_sha256'] as const) {
    if (!SHA256_RE.test(String(receipt[key] || ''))) failures.push(`validation receipt ${key} must be a full lowercase SHA-256`)
  }
  const checks = receipt.checks && typeof receipt.checks === 'object' && !Array.isArray(receipt.checks) ? receipt.checks as Record<string, unknown> : {}
  for (const key of ['source_coverage', 'claim_traceability', 'canonical_html', 'code_only', 'rtl', 'accessibility', 'responsive', 'print_a4', 'pdf_parity'] as const) {
    if (checks[key] !== true) failures.push(`validation receipt check ${key} must be true`)
  }

  failures.push(...validateArtifactIntegrity({ role: 'html' }, htmlFile, htmlBytes))
  failures.push(...validateArtifactIntegrity({ role: 'pdf' }, pdfFile, pdfBytes))
  const html = new TextDecoder().decode(htmlBytes)
  const forbidden = [
    [/<\s*(?:img|picture|source|image|canvas|video|audio|iframe|object|embed)\b/i, 'HTML must not contain raster or embedded media'],
    [/<\s*(?:script|template|form|input|button|select|textarea|details|dialog)\b/i, 'HTML must not contain scripts or interactive widgets'],
    [/\b(?:data-visual-kind|data-asset-kind|class)=["'][^"']*(?:mind[\s-]*map|image[\s-]*atlas|generated[\s-]*image)[^"']*["']/i, 'HTML must not declare mind-map or generated-image output'],
    [/(?:url\(\s*["']?https?:\/\/|@import\s+(?:url\()?\s*["']?https?:\/\/|<\s*link\b[^>]*\bhref=["']https?:\/\/|<\s*use\b[^>]*\bhref=["']https?:\/\/)/i, 'HTML must not load remote resources'],
  ] as const
  for (const [pattern, message] of forbidden) if (pattern.test(html)) failures.push(message)
  if (!/<html\b[^>]*\blang=["']ar(?:-[^"']+)?["'][^>]*\bdir=["']rtl["']/i.test(html)
    && !/<html\b[^>]*\bdir=["']rtl["'][^>]*\blang=["']ar(?:-[^"']+)?["']/i.test(html)) failures.push('HTML root must declare Arabic and RTL')
  if (!/<article\b[^>]*data-canonical-content=["']true["']/i.test(html)) failures.push('HTML must contain one canonical article[data-canonical-content=true]')
  if (!/@page\s*{[^}]*size\s*:\s*A4\b/is.test(html)) failures.push('HTML must declare A4 print CSS')

  const [htmlHash, pdfHash] = await Promise.all([sha256Hex(htmlBytes), sha256Hex(pdfBytes)])
  if (receipt.html_sha256 !== htmlHash) failures.push('validation receipt HTML hash does not match upload')
  if (receipt.pdf_sha256 !== pdfHash) failures.push('validation receipt PDF hash does not match upload')
  return { ok: failures.length === 0, failures: [...new Set(failures)], hashes: { html: htmlHash, pdf: pdfHash } }
}

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
  if (metadata.recommended_start && !['original', 'html', 'pdf', 'notebooklm'].includes(String(metadata.recommended_start))) failures.push('recommended_start must be original, html, pdf, or notebooklm')
  const generator = String(metadata.generator || '')
  if (generator === 'lite-visual' && ['html', 'pdf'].includes(String(metadata.role || '').toLowerCase())) {
    failures.push('Lite Visual HTML/PDF must use the atomic /artifacts/pairs publication route')
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
  const liteVisual = String(metadata.generator || '') === 'lite-visual' && ['html', 'pdf'].includes(String(metadata.role || '').toLowerCase())
  const repairRequired = explicitRepair || (Boolean(metadata.qa_status) && contractFailures.length > 0) || (liteVisual && metadata.validation_status !== 'passed')
  const notebookVideo = String(metadata.generator || '') === 'notebooklm' && isVideo(metadata)
  const failures = repairRequired
    ? [...new Set([...(metadata.repair_reason ? [String(metadata.repair_reason)] : []), ...contractFailures])]
    : []
  return {
    status: legacy ? 'unverified' : liteVisual ? metadata.validation_status === 'passed' ? 'passed' : 'repair_required' : !notebookVideo ? 'unverified' : repairRequired ? 'repair_required' : metadata.qa_status === 'passed' ? 'passed' : 'unverified',
    score: null,
    video_format: metadata.video_format || null,
    repair_status: repairRequired ? 'required' : null,
    failures,
  }
}
