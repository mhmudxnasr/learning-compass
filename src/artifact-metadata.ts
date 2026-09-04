const stringFields = [
  'pair_id',
  'role',
  'recommendation_id',
  'source_url',
  'source_title',
  'source_checksum',
  'generator',
  'revision',
  'supersedes_pair_id',
  'qa_status',
  'validation_status',
  'validation_receipt_sha256',
  'workflow_contract',
  'asset_policy',
  'publication_state',
  'video_format',
  'recommended_start',
]
const booleanFields = ['custom_prompt_applied', 'notebook_url_linked', 'source_indexed', 'download_verified']
const jsonFields: string[] = []

export type ArtifactMetadataValidation =
  | { ok: true; metadata: Record<string, unknown>; failures: [] }
  | { ok: false; metadata: Record<string, unknown>; failures: string[] }

export type ArtifactContentInspection = {
  ok: boolean
  mediaType: string | null
  failures: string[]
}

export const LITE_VISUAL_WORKFLOW_CONTRACT = 'lite-visual-linear/v4'
export const LITE_VISUAL_RECEIPT_SCHEMA = 'lite-visual-validation/v6'
export const LITE_VISUAL_ATTESTATION_KEY_ID = 'lite-visual-v6-2026-08-28-r2'
export const LITE_VISUAL_AUDIT_PROVENANCE = {
  audit_script_sha256: 'ef2e6ab0a8c352b757202196c2fe2a22dd01385e0fa6eb7d1f8f9b05024552ca',
  series_sha256: '8d86f4b68626457b77b4d2a3c898a2e9436040793f924b6d0d61d40b026ba60a',
  receipt_attestation_sha256: '812ef128a101cf94e5837779725ac5f01a273c89cfe2155a25d74caa708afb00',
  python_implementation: 'CPython',
  python_version: '3.11.15',
  invocation_contract: 'audit_lite_visual.py manifest --report-out',
} as const
const SHA256_RE = /^[a-f0-9]{64}$/
const PAIR_ID_RE = /^lv-[a-zA-Z0-9._-]+$/
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024
type ArtifactMediaKind = 'html' | 'pdf' | 'markdown' | 'text' | 'video' | 'audio'

const ALLOWED_MEDIA_TYPES: Record<string, { kind: ArtifactMediaKind; canonical: string }> = {
  'text/html': { kind: 'html', canonical: 'text/html; charset=utf-8' },
  'application/pdf': { kind: 'pdf', canonical: 'application/pdf' },
  'text/markdown': { kind: 'markdown', canonical: 'text/markdown; charset=utf-8' },
  'text/x-markdown': { kind: 'markdown', canonical: 'text/markdown; charset=utf-8' },
  'text/plain': { kind: 'text', canonical: 'text/plain; charset=utf-8' },
  'video/mp4': { kind: 'video', canonical: 'video/mp4' },
  'video/x-m4v': { kind: 'video', canonical: 'video/mp4' },
  'video/webm': { kind: 'video', canonical: 'video/webm' },
  'video/quicktime': { kind: 'video', canonical: 'video/quicktime' },
  'audio/mpeg': { kind: 'audio', canonical: 'audio/mpeg' },
  'audio/mp4': { kind: 'audio', canonical: 'audio/mp4' },
  'audio/x-m4a': { kind: 'audio', canonical: 'audio/mp4' },
  'audio/webm': { kind: 'audio', canonical: 'audio/webm' },
  'audio/ogg': { kind: 'audio', canonical: 'audio/ogg' },
  'audio/opus': { kind: 'audio', canonical: 'audio/opus' },
  'audio/wav': { kind: 'audio', canonical: 'audio/wav' },
  'audio/x-wav': { kind: 'audio', canonical: 'audio/wav' },
}

const EXTENSION_MEDIA: Record<string, { kind: ArtifactMediaKind | 'webm'; canonical: string }> = {
  html: { kind: 'html', canonical: 'text/html; charset=utf-8' },
  htm: { kind: 'html', canonical: 'text/html; charset=utf-8' },
  pdf: { kind: 'pdf', canonical: 'application/pdf' },
  md: { kind: 'markdown', canonical: 'text/markdown; charset=utf-8' },
  markdown: { kind: 'markdown', canonical: 'text/markdown; charset=utf-8' },
  txt: { kind: 'text', canonical: 'text/plain; charset=utf-8' },
  mp4: { kind: 'video', canonical: 'video/mp4' },
  m4v: { kind: 'video', canonical: 'video/mp4' },
  mov: { kind: 'video', canonical: 'video/quicktime' },
  webm: { kind: 'webm', canonical: 'video/webm' },
  mp3: { kind: 'audio', canonical: 'audio/mpeg' },
  m4a: { kind: 'audio', canonical: 'audio/mp4' },
  ogg: { kind: 'audio', canonical: 'audio/ogg' },
  opus: { kind: 'audio', canonical: 'audio/opus' },
  wav: { kind: 'audio', canonical: 'audio/wav' },
}

const activeXmlMedia = (mediaType: string) =>
  /^(?:image\/svg\+xml|application\/(?:xml|xhtml\+xml)|text\/xml)$/.test(mediaType)
const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
const mediaKindCompatible = (declared: ArtifactMediaKind, extension: ArtifactMediaKind | 'webm') =>
  extension === 'webm'
    ? declared === 'video' || declared === 'audio'
    : declared === extension || (['text', 'markdown'].includes(declared) && ['text', 'markdown'].includes(extension))

const startsWithBytes = (bytes: Uint8Array, expected: number[], offset = 0) =>
  expected.every((value, index) => bytes[offset + index] === value)
const hasIsoMediaSignature = (bytes: Uint8Array) =>
  bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp'
const hasWebmSignature = (bytes: Uint8Array) => startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])

export function inspectArtifactContent(
  metadata: Record<string, unknown>,
  file: { name?: string; type?: string; size?: number },
  bytes: ArrayBuffer,
): ArtifactContentInspection {
  const failures: string[] = []
  const view = new Uint8Array(bytes)
  const filename = String(file.name || '')
  const extension = extensionOf(filename)
  const declaredType = String(file.type || '')
    .toLowerCase()
    .split(';', 1)[0]
    .trim()
  const declared = ALLOWED_MEDIA_TYPES[declaredType]
  const extensionMedia = EXTENSION_MEDIA[extension]
  const head = new TextDecoder()
    .decode(view.slice(0, 4096))
    .replace(/^\uFEFF/, '')
    .trimStart()
  const activeXml =
    activeXmlMedia(declaredType) ||
    ['svg', 'xml', 'xhtml', 'xsl'].includes(extension) ||
    /^<\?xml\b/i.test(head) ||
    /^<svg\b/i.test(head)

  if (!view.byteLength) failures.push('artifact must not be empty')
  if (view.byteLength > MAX_ARTIFACT_BYTES) failures.push('artifact must not exceed 10 MB')
  if (activeXml) failures.push('SVG, XML, and XHTML artifacts are not supported')
  if (declaredType && declaredType !== 'application/octet-stream' && !declared && !activeXmlMedia(declaredType))
    failures.push('artifact media type is not supported')
  if (!declared && !extensionMedia) failures.push('artifact must use a supported media type or filename extension')
  if (declared && extensionMedia && !mediaKindCompatible(declared.kind, extensionMedia.kind))
    failures.push('artifact filename extension does not match its media type')

  const kind = declared?.kind || (extensionMedia?.kind === 'webm' ? 'video' : extensionMedia?.kind)
  let mediaType = declared?.canonical || extensionMedia?.canonical || null
  if (extensionMedia?.kind === 'webm' && declared?.kind === 'audio') mediaType = declared.canonical

  if (kind === 'pdf' && new TextDecoder().decode(view.slice(0, 5)) !== '%PDF-')
    failures.push('PDF artifact must have a valid PDF signature')
  if (kind === 'html') {
    if (!/<\s*!doctype\s+html|<\s*html[\s>]/i.test(head)) failures.push('HTML artifact must contain a document root')
    const html = new TextDecoder().decode(view)
    if (
      /<\s*(?:script|iframe|object|embed)\b/i.test(html) ||
      /\son[a-z][a-z0-9_-]*\s*=/i.test(html) ||
      /(?:href|src)\s*=\s*["']?\s*javascript\s*:/i.test(html) ||
      /<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i.test(html)
    ) {
      failures.push('HTML artifact must not contain executable or embedded active content')
    }
  }
  if (kind === 'markdown' || kind === 'text') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(view)
      if (text.includes('\0')) failures.push('text artifact must contain valid UTF-8 text')
    } catch {
      failures.push('text artifact must contain valid UTF-8 text')
    }
  }
  if (kind === 'video') {
    if (mediaType === 'video/webm' ? !hasWebmSignature(view) : !hasIsoMediaSignature(view))
      failures.push('video artifact must have a valid container signature')
  }
  if (kind === 'audio') {
    const valid =
      mediaType === 'audio/webm'
        ? hasWebmSignature(view)
        : mediaType === 'audio/mp4'
          ? hasIsoMediaSignature(view)
          : mediaType === 'audio/mpeg'
            ? new TextDecoder().decode(view.slice(0, 3)) === 'ID3' || (view[0] === 0xff && (view[1] & 0xe0) === 0xe0)
            : mediaType === 'audio/ogg' || mediaType === 'audio/opus'
              ? new TextDecoder().decode(view.slice(0, 4)) === 'OggS'
              : mediaType === 'audio/wav'
                ? new TextDecoder().decode(view.slice(0, 4)) === 'RIFF' &&
                  new TextDecoder().decode(view.slice(8, 12)) === 'WAVE'
                : false
    if (!valid) failures.push('audio artifact must have a valid container signature')
  }

  const role = String(metadata.role || '').toLowerCase()
  if (role === 'html' && kind !== 'html') failures.push('role html does not match uploaded media')
  if (role === 'pdf' && kind !== 'pdf') failures.push('role pdf does not match uploaded media')
  if (role === 'video' && kind !== 'video') failures.push('role video does not match uploaded media')

  return { ok: failures.length === 0, mediaType: failures.length ? null : mediaType, failures: [...new Set(failures)] }
}

export type LiteVisualValidationReceipt = {
  schema_version?: unknown
  workflow_contract?: unknown
  status?: unknown
  source_sha256?: unknown
  source_scope_sha256?: unknown
  coverage_ledger_sha256?: unknown
  html_sha256?: unknown
  pdf_sha256?: unknown
  work_item_sha256?: unknown
  source_extraction_sha256?: unknown
  target_sha256?: unknown
  target?: unknown
  checks?: unknown
  [key: string]: unknown
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('receipt numbers must be safe integers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') throw new Error(`receipt contains unsupported value type: ${typeof value}`)
  const object = value as Record<string, unknown>
  if (
    Object.keys(object).some(
      (key) =>
        !key ||
        [...key].some((character) => {
          const code = character.codePointAt(0) || 0
          return code < 0x20 || code > 0x7e
        }),
    )
  )
    throw new Error('receipt object keys must be non-empty printable ASCII')
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`
}

function unsignedReceipt(receipt: LiteVisualValidationReceipt) {
  return Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'attestation'))
}

export async function liteVisualReceiptSignature(receipt: LiteVisualValidationReceipt, signingKey: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(stableJson(unsignedReceipt(receipt))),
  )
  return [...new Uint8Array(signature)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

export const liteVisualTargetSha256 = (target: Record<string, unknown>) => sha256Hex(stableJson(target))

export async function validLiteVisualAttestation(receipt: LiteVisualValidationReceipt, signingKey: string) {
  const attestation =
    receipt.attestation && typeof receipt.attestation === 'object' && !Array.isArray(receipt.attestation)
      ? (receipt.attestation as Record<string, unknown>)
      : {}
  const signature = String(attestation.signature || '')
  if (
    attestation.algorithm !== 'hmac-sha256' ||
    attestation.key_id !== LITE_VISUAL_ATTESTATION_KEY_ID ||
    !SHA256_RE.test(signature) ||
    signingKey.length < 32
  )
    return false
  try {
    return signature === (await liteVisualReceiptSignature(receipt, signingKey))
  } catch {
    return false
  }
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array | string) {
  const value =
    typeof bytes === 'string'
      ? new TextEncoder().encode(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes)
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
  signingKey: string,
) {
  const failures: string[] = []
  const pairId = String(metadata.pair_id || '')
  const sourceChecksum = String(metadata.source_checksum || '')
  if (!PAIR_ID_RE.test(pairId))
    failures.push('pair_id must start with lv- and contain only letters, digits, dots, underscores, or hyphens')
  if (!String(metadata.recommendation_id || '').trim()) failures.push('recommendation_id is required')
  if (!SHA256_RE.test(sourceChecksum)) failures.push('source_checksum must be a full lowercase SHA-256')
  if (metadata.generator !== 'lite-visual') failures.push('generator must be lite-visual')
  if (metadata.workflow_contract !== LITE_VISUAL_WORKFLOW_CONTRACT)
    failures.push(`workflow_contract must be ${LITE_VISUAL_WORKFLOW_CONTRACT}`)
  if (metadata.asset_policy !== 'code-only') failures.push('asset_policy must be code-only')
  if (metadata.recommended_start !== 'html') failures.push('recommended_start must be html for Lite Visual')
  if (receipt.schema_version !== LITE_VISUAL_RECEIPT_SCHEMA)
    failures.push(`validation receipt schema_version must be ${LITE_VISUAL_RECEIPT_SCHEMA}`)
  if (receipt.workflow_contract !== LITE_VISUAL_WORKFLOW_CONTRACT)
    failures.push(`validation receipt workflow_contract must be ${LITE_VISUAL_WORKFLOW_CONTRACT}`)
  if (receipt.status !== 'passed') failures.push('validation receipt status must be passed')
  if (!(await validLiteVisualAttestation(receipt, signingKey)))
    failures.push('validation receipt attestation is missing or invalid')
  if (receipt.source_sha256 !== sourceChecksum) failures.push('validation receipt source hash does not match metadata')
  for (const key of [
    'source_scope_sha256',
    'coverage_ledger_sha256',
    'html_sha256',
    'pdf_sha256',
    'work_item_sha256',
    'source_extraction_sha256',
    'target_sha256',
  ] as const) {
    if (!SHA256_RE.test(String(receipt[key] || '')))
      failures.push(`validation receipt ${key} must be a full lowercase SHA-256`)
  }
  const checks =
    receipt.checks && typeof receipt.checks === 'object' && !Array.isArray(receipt.checks)
      ? (receipt.checks as Record<string, unknown>)
      : {}
  const requiredChecks = [
    'source_coverage',
    'claim_traceability',
    'exact_source_html',
    'exact_source_pdf',
    'canonical_html',
    'code_only',
    'rtl',
    'accessibility',
    'responsive',
    'print_a4',
    'pdf_parity',
  ] as const
  if (
    Object.keys(checks).length !== requiredChecks.length ||
    Object.keys(checks).some((key) => !requiredChecks.includes(key as (typeof requiredChecks)[number]))
  )
    failures.push('validation receipt checks must contain only the exact v6 check set')
  for (const key of requiredChecks) {
    if (checks[key] !== true) failures.push(`validation receipt check ${key} must be true`)
  }
  const target =
    receipt.target && typeof receipt.target === 'object' && !Array.isArray(receipt.target)
      ? (receipt.target as Record<string, unknown>)
      : {}
  if (!String(target.recommendation_id || '') || !String(target.source_url || '') || !String(target.source_title || ''))
    failures.push('validation receipt target identity is incomplete')
  else if (receipt.target_sha256 !== (await liteVisualTargetSha256(target)))
    failures.push('validation receipt target hash does not match target identity')

  failures.push(...validateArtifactIntegrity({ role: 'html' }, htmlFile, htmlBytes))
  failures.push(...validateArtifactIntegrity({ role: 'pdf' }, pdfFile, pdfBytes))
  const html = new TextDecoder().decode(htmlBytes)
  const forbidden = [
    [
      /<\s*(?:img|picture|source|image|canvas|video|audio|iframe|object|embed)\b/i,
      'HTML must not contain raster or embedded media',
    ],
    [
      /<\s*(?:script|template|form|input|button|select|textarea|details|dialog)\b/i,
      'HTML must not contain scripts or interactive widgets',
    ],
    [
      /\b(?:data-visual-kind|data-asset-kind|class)=["'][^"']*(?:mind[\s-]*map|image[\s-]*atlas|generated[\s-]*image)[^"']*["']/i,
      'HTML must not declare mind-map or generated-image output',
    ],
    [
      /(?:url\(\s*["']?https?:\/\/|@import\s+(?:url\()?\s*["']?https?:\/\/|<\s*link\b[^>]*\bhref=["']https?:\/\/|<\s*use\b[^>]*\bhref=["']https?:\/\/)/i,
      'HTML must not load remote resources',
    ],
  ] as const
  for (const [pattern, message] of forbidden) if (pattern.test(html)) failures.push(message)
  if (
    !/<html\b[^>]*\blang=["']ar(?:-[^"']+)?["'][^>]*\bdir=["']rtl["']/i.test(html) &&
    !/<html\b[^>]*\bdir=["']rtl["'][^>]*\blang=["']ar(?:-[^"']+)?["']/i.test(html)
  )
    failures.push('HTML root must declare Arabic and RTL')
  if (!/<article\b[^>]*data-canonical-content=["']true["']/i.test(html))
    failures.push('HTML must contain one canonical article[data-canonical-content=true]')
  if (!/@page\s*{[^}]*size\s*:\s*A4\b/is.test(html)) failures.push('HTML must declare A4 print CSS')

  const [htmlHash, pdfHash] = await Promise.all([sha256Hex(htmlBytes), sha256Hex(pdfBytes)])
  if (receipt.html_sha256 !== htmlHash) failures.push('validation receipt HTML hash does not match upload')
  if (receipt.pdf_sha256 !== pdfHash) failures.push('validation receipt PDF hash does not match upload')
  return { ok: failures.length === 0, failures: [...new Set(failures)], hashes: { html: htmlHash, pdf: pdfHash } }
}

export function validateArtifactIntegrity(
  metadata: Record<string, unknown>,
  file: { name?: string; type?: string; size?: number },
  bytes: ArrayBuffer,
) {
  return inspectArtifactContent(metadata, file, bytes).failures
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
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`${key} must be valid JSON`)
    }
  }
  throw new Error(`${key} must be valid JSON`)
}

function isVideo(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  if (metadata.role) return metadata.role === 'video'
  return /video/i.test(String(file?.type || '')) || /\.(mp4|webm|mov|m4v)$/i.test(String(file?.name || ''))
}

function mediaRoleFailures(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  const role = String(metadata.role || '').toLowerCase()
  if (!role || !file) return []
  const hint = `${file.type || ''} ${file.name || ''}`.toLowerCase()
  const mismatched =
    role === 'html'
      ? /pdf|video|\.(mp4|webm|mov|m4v)\b/.test(hint)
      : role === 'pdf'
        ? /html?|video|\.(mp4|webm|mov|m4v)\b/.test(hint)
        : role === 'video'
          ? /html?|pdf|\.pdf\b/.test(hint)
          : false
  return mismatched ? [`role ${role} does not match uploaded media`] : []
}

export function validateArtifactQuality(metadata: Record<string, unknown>, file?: { name?: string; type?: string }) {
  const failures: string[] = mediaRoleFailures(metadata, file)
  if (
    metadata.recommended_start &&
    !['original', 'html', 'pdf', 'notebooklm'].includes(String(metadata.recommended_start))
  )
    failures.push('recommended_start must be original, html, pdf, or notebooklm')
  const generator = String(metadata.generator || '')
  if (generator === 'lite-visual' && ['html', 'pdf'].includes(String(metadata.role || '').toLowerCase())) {
    failures.push('Lite Visual HTML/PDF must use the atomic /artifacts/pairs publication route')
  }
  if (generator === 'notebooklm' && isVideo(metadata, file)) {
    if (metadata.video_format !== 'cinematic') failures.push('video_format must be cinematic for NotebookLM video')
    for (const key of ['custom_prompt_applied', 'source_indexed', 'notebook_url_linked', 'download_verified'])
      if (metadata[key] !== true) failures.push(`${key} must be true for NotebookLM video`)
    if (metadata.qa_status !== 'passed') failures.push('qa_status must be passed for NotebookLM video')
  }
  return failures
}

export function mergeArtifactMultipartMetadata(
  metadata: Record<string, unknown>,
  form: FormData,
  file?: { name?: string; type?: string },
): ArtifactMetadataValidation {
  const failures: string[] = []
  for (const key of stringFields) {
    const value = form.get(key)
    if (typeof value === 'string' && value.trim()) metadata[key] = value.trim()
  }
  for (const key of booleanFields) {
    const value = form.get(key)
    if (value !== null) {
      try {
        metadata[key] = parseBoolean(value, key)
      } catch (error) {
        failures.push((error as Error).message)
      }
    } else if (metadata[key] !== undefined) {
      try {
        metadata[key] = parseBoolean(metadata[key], key)
      } catch (error) {
        failures.push((error as Error).message)
      }
    }
  }
  for (const key of jsonFields) {
    const value = form.get(key)
    if (value !== null) {
      try {
        metadata[key] = parseJson(value, key)
      } catch (error) {
        failures.push((error as Error).message)
      }
    } else if (metadata[key] !== undefined) {
      try {
        metadata[key] = parseJson(metadata[key], key)
      } catch (error) {
        failures.push((error as Error).message)
      }
    }
  }
  failures.push(...validateArtifactQuality(metadata, file))
  return failures.length
    ? { ok: false, metadata, failures: [...new Set(failures)] }
    : { ok: true, metadata, failures: [] }
}

export function normalizeQualityAssurance(metadata: Record<string, unknown> = {}, legacy = false) {
  const contractFailures = validateArtifactQuality(metadata)
  const explicitRepair = false
  const liteVisual =
    String(metadata.generator || '') === 'lite-visual' &&
    ['html', 'pdf'].includes(String(metadata.role || '').toLowerCase())
  const repairRequired =
    explicitRepair ||
    (Boolean(metadata.qa_status) && contractFailures.length > 0) ||
    (liteVisual && metadata.validation_status !== 'passed')
  const notebookVideo = String(metadata.generator || '') === 'notebooklm' && isVideo(metadata)
  const failures = repairRequired
    ? [...new Set([...(metadata.repair_reason ? [String(metadata.repair_reason)] : []), ...contractFailures])]
    : []
  return {
    status: legacy
      ? 'unverified'
      : liteVisual
        ? metadata.validation_status === 'passed'
          ? 'passed'
          : 'repair_required'
        : !notebookVideo
          ? 'unverified'
          : repairRequired
            ? 'repair_required'
            : metadata.qa_status === 'passed'
              ? 'passed'
              : 'unverified',
    score: null,
    video_format: metadata.video_format || null,
    repair_status: repairRequired ? 'required' : null,
    failures,
  }
}
