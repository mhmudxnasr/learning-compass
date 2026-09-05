import { Hono } from 'hono'
import {
  inspectArtifactContent,
  liteVisualTargetSha256,
  LITE_VISUAL_AUDIT_PROVENANCE,
  LITE_VISUAL_WORKFLOW_CONTRACT,
  mergeArtifactMultipartMetadata,
  normalizeQualityAssurance,
  sha256Hex,
  validLiteVisualAttestation,
  validateLiteVisualPair,
  type LiteVisualValidationReceipt,
} from '../artifact-metadata'
import { Bindings, escapeHtml, safeError, safeErrorMessage } from '../lib'
import { resolveLearningScope } from '../services/learning-scope'
import { loadCompanionPair, retireCompanionPair } from '../services/companion-pair-retirement'

const app = new Hono<{ Bindings: Bindings }>()
app.get('/pair-contract', (c) =>
  c.json({
    workflow_contract: 'lite-visual-linear/v4',
    receipt_schemas: ['lite-visual-integrity/v1', 'lite-visual-validation/v6'],
    corpus_receipt_schemas: ['lite-visual-corpus-integrity/v1', 'lite-visual-corpus-audit/v1'],
    default_verification_scope: 'integrity-only',
    default_quality_checks: 'not_run',
  }),
)
const artifactCsp =
  "sandbox; default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'"
const inertAttachmentCsp =
  "sandbox; default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; style-src 'none'; script-src 'none'"
const activeXmlArtifact = (row: { media_type?: unknown; filename?: unknown }) =>
  /(?:svg\+xml|application\/(?:xml|xhtml\+xml)|text\/xml)/i.test(String(row.media_type || '')) ||
  /\.(?:svg|xml|xhtml|xsl)$/i.test(String(row.filename || ''))
const htmlArtifact = (row: { media_type?: unknown; filename?: unknown }) =>
  /html/i.test(String(row.media_type || '')) || /\.html?$/i.test(String(row.filename || ''))
const textArtifact = (row: { media_type?: unknown; filename?: unknown }) =>
  !activeXmlArtifact(row) &&
  (/markdown|text\/plain/i.test(String(row.media_type || '')) || /\.md$/i.test(String(row.filename || '')))
const inlineBinaryArtifact = (row: { media_type?: unknown }) =>
  /^(?:application\/pdf|video\/(?:mp4|webm|quicktime)|audio\/(?:mpeg|mp4|webm|ogg|opus|wav))(?:;|$)/i.test(
    String(row.media_type || ''),
  )
const originalFilename = (value: unknown) =>
  Array.from(String(value || 'artifact'))
    .slice(0, 180)
    .join('') || 'artifact'
const safeFilename = (value: unknown) => originalFilename(value).replace(/[^\x20-\x7e]|["\\]/g, '_') || 'artifact'
const encodedFilename = (value: unknown) =>
  encodeURIComponent(originalFilename(value)).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
const disposition = (kind: 'inline' | 'attachment', value: unknown) =>
  `${kind}; filename="${safeFilename(value)}"; filename*=UTF-8''${encodedFilename(value)}`
const SHA256_RE = /^[a-f0-9]{64}$/
const PAIR_HASH_FIELDS = [
  'source_sha256',
  'source_scope_sha256',
  'coverage_ledger_sha256',
  'html_sha256',
  'pdf_sha256',
] as const
const CORPUS_HASH_FIELDS = [
  'target_sha256',
  'work_item_sha256',
  'source_extraction_sha256',
  'source_sha256',
  'source_scope_sha256',
  'coverage_ledger_sha256',
  'html_sha256',
  'pdf_sha256',
  'receipt_sha256',
] as const
const CORPUS_TARGET_FIELDS = [
  'position',
  'recording_number',
  'recommendation_id',
  'chapter_key',
  'source_url',
  'source_title',
  'workdir',
  'pair_id',
  'job_id',
  'workflow_run_id',
  'supersedes_pair_id',
  ...CORPUS_HASH_FIELDS,
] as const
const AUDIT_CORPUS_FIELDS = [
  'recording_number',
  'recommendation_id',
  'chapter_key',
  'source_url',
  'source_title',
  'workdir',
  'pair_id',
  ...CORPUS_HASH_FIELDS,
] as const
const VISIBLE_ARTIFACT_SQL = "COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged'"
const parseMetadata = (value: string | null | undefined) => {
  try {
    return JSON.parse(value || '{}') as Record<string, any>
  } catch {
    return {}
  }
}
const hiddenArtifact = (row: any) => {
  const metadata = parseMetadata(row?.metadata_json)
  return (
    metadata.publication_state === 'staged' ||
    Boolean(metadata.recommendation_id && (!row.owner_id || row.owner_deleted_at || row.owner_status === 'deleted'))
  )
}
const pairIdFor = async (recommendationId: string, receipt: LiteVisualValidationReceipt, chapterKey = '') => {
  const fingerprint = await sha256Hex(
    [
      ...PAIR_HASH_FIELDS.map((key) => String(receipt[key] || '')),
      ...(chapterKey ? [`chapter:${chapterKey}`] : []),
    ].join('\n'),
  )
  return `lv-${recommendationId.replace(/[^a-zA-Z0-9._-]/g, '-')}-${fingerprint.slice(0, 20)}`
}

const pairOwnerKey = (recommendationId: string, chapterKey = '') => `${recommendationId}\u0000${chapterKey}`

async function currentReadyPair(DB: D1Database, recommendationId: string, chapterKey = '') {
  const rows = await DB.prepare(
    `SELECT id,metadata_json,created_at FROM artifacts
    WHERE json_extract(metadata_json,'$.recommendation_id')=?
      AND COALESCE(json_extract(metadata_json,'$.chapter_key'),'')=?
      AND json_extract(metadata_json,'$.publication_state')='ready'
      AND json_extract(metadata_json,'$.validation_status')='passed'
      AND json_extract(metadata_json,'$.pair_id') IS NOT NULL
    ORDER BY created_at DESC,id DESC`,
  )
    .bind(recommendationId, chapterKey)
    .all<any>()
  const pairs = new Map<string, Set<string>>()
  for (const row of rows.results || []) {
    const metadata = parseMetadata(row.metadata_json)
    const pairId = String(metadata.pair_id || '')
    if (!pairId) continue
    const roles = pairs.get(pairId) || new Set<string>()
    roles.add(String(metadata.role || ''))
    pairs.set(pairId, roles)
  }
  return [...pairs].find(([, roles]) => roles.has('html') && roles.has('pdf'))?.[0] || null
}

const chunks = <T>(values: T[], size = 40) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))
const exactObject = (left: Record<string, any>, right: Record<string, any>, fields: readonly string[]) =>
  fields.every((field) => (left[field] ?? null) === (right[field] ?? null))
const computeTargetSetSha256 = (targets: Record<string, any>[]) =>
  sha256Hex(
    JSON.stringify(
      targets.map((target) => [
        target.recording_number,
        target.recommendation_id,
        ...(target.chapter_key ? [target.chapter_key] : []),
        target.source_url,
        target.source_title,
        target.workdir,
      ]),
    ),
  )
const computeAuditCorpusSha256 = (targets: Record<string, any>[]) =>
  sha256Hex(JSON.stringify(targets.map((target) => AUDIT_CORPUS_FIELDS.map((field) => target[field] ?? ''))))
const verifiedR2Object = (object: R2Object | null, size: number, sha256: string, pairId: string, role: string) =>
  Boolean(
    object &&
    object.size === size &&
    object.customMetadata?.sha256 === sha256 &&
    object.customMetadata?.pair_id === pairId &&
    object.customMetadata?.role === role,
  )

async function readyPairMap(DB: D1Database, targets: Record<string, any>[]) {
  const complete = new Map<string, string[]>()
  for (const group of chunks([...new Set(targets.map((target) => target.recommendation_id))])) {
    const placeholders = group.map(() => '?').join(',')
    const rows = await DB.prepare(
      `SELECT metadata_json,created_at,id FROM artifacts
      WHERE json_extract(metadata_json,'$.recommendation_id') IN (${placeholders})
        AND json_extract(metadata_json,'$.publication_state')='ready'
        AND json_extract(metadata_json,'$.validation_status')='passed'
        AND json_extract(metadata_json,'$.pair_id') IS NOT NULL
      ORDER BY created_at DESC,id DESC`,
    )
      .bind(...group)
      .all<any>()
    const pairs = new Map<string, Map<string, Set<string>>>()
    for (const row of rows.results || []) {
      const metadata = parseMetadata(row.metadata_json)
      const recommendationId = String(metadata.recommendation_id || '')
      const ownerKey = pairOwnerKey(recommendationId, String(metadata.chapter_key || ''))
      const pairId = String(metadata.pair_id || '')
      if (!recommendationId || !pairId) continue
      const byPair = pairs.get(ownerKey) || new Map<string, Set<string>>()
      const roles = byPair.get(pairId) || new Set<string>()
      roles.add(String(metadata.role || ''))
      byPair.set(pairId, roles)
      pairs.set(ownerKey, byPair)
    }
    for (const [ownerKey, byPair] of pairs)
      complete.set(
        ownerKey,
        [...byPair].filter(([, roles]) => roles.has('html') && roles.has('pdf')).map(([pairId]) => pairId),
      )
  }
  return complete
}

function artifactHeaders(row: {
  id?: unknown
  size_bytes?: unknown
  media_type?: unknown
  filename?: unknown
  metadata_json?: string | null
}) {
  const filename = row.filename
  const metadata = parseMetadata(row.metadata_json)
  const headers: Record<string, string> = {
    'content-disposition': disposition('attachment', filename),
    'content-security-policy': inertAttachmentCsp,
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  }
  if (metadata.pair_id) {
    if (row.id)
      headers['x-learning-compass-artifact-id'] = String(row.id)
        .replace(/[^a-zA-Z0-9._:-]/g, '-')
        .slice(0, 240)
    const exactSize = Number(row.size_bytes)
    if (Number.isSafeInteger(exactSize) && exactSize > 0) headers['x-learning-compass-size-bytes'] = String(exactSize)
    headers['x-learning-compass-pair-id'] = String(metadata.pair_id)
      .replace(/[^a-zA-Z0-9._:-]/g, '-')
      .slice(0, 240)
    headers['x-learning-compass-pair-role'] = String(metadata.role || '')
      .toLowerCase()
      .slice(0, 20)
    headers['x-learning-compass-publication-state'] = String(metadata.publication_state || '')
      .toLowerCase()
      .slice(0, 30)
    headers['x-learning-compass-validation-status'] = String(metadata.validation_status || '')
      .toLowerCase()
      .slice(0, 30)
  }
  if (activeXmlArtifact(row)) {
    headers['content-type'] = 'application/octet-stream'
    return headers
  }
  if (htmlArtifact(row)) {
    headers['content-type'] = 'text/html; charset=utf-8'
    headers['content-disposition'] = disposition('inline', filename)
    headers['content-security-policy'] = artifactCsp
    return headers
  }
  if (inlineBinaryArtifact(row)) {
    headers['content-type'] = String(row.media_type || 'application/octet-stream')
    headers['content-disposition'] = disposition('inline', filename)
    delete headers['content-security-policy']
    return headers
  }
  headers['content-type'] = 'application/octet-stream'
  return headers
}

function markdownToHtml(markdown: string, title: string) {
  const inline = (value: string) =>
    escapeHtml(value).replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
  const output: string[] = []
  let code = false
  let list = false
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (/^```/.test(line)) {
      if (code) {
        output.push('</code></pre>')
        code = false
      } else {
        output.push('<pre><code>')
        code = true
      }
      continue
    }
    if (code) {
      output.push(escapeHtml(line) + '\n')
      continue
    }
    if (!line.trim()) {
      if (list) {
        output.push('</ul>')
        list = false
      }
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      if (list) {
        output.push('</ul>')
        list = false
      }
      output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      if (!list) {
        output.push('<ul>')
        list = true
      }
      output.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    if (list) {
      output.push('</ul>')
      list = false
    }
    output.push(`<p>${inline(line)}</p>`)
  }
  if (list) output.push('</ul>')
  if (code) output.push('</code></pre>')
  const safeTitle = escapeHtml(title)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>
    :root{color-scheme:light dark}body{margin:0;background:#f6f6f3;color:#252932;font:16px/1.7 system-ui,-apple-system,sans-serif}main{max-width:760px;margin:0 auto;padding:48px 24px 80px}h1,h2,h3{line-height:1.25;margin:1.8em 0 .55em}h1{font-size:2rem;border-bottom:1px solid #c8ccd4;padding-bottom:20px;margin-top:0}h2{font-size:1.45rem}h3{font-size:1.15rem}p{margin:0 0 1em}a{color:#426497}li{margin:.25em 0}pre{padding:16px;overflow:auto;background:#e7e9ed;border:1px solid #c8ccd4;border-radius:8px;font:13px/1.55 ui-monospace,SFMono-Regular,monospace}code{font-family:ui-monospace,SFMono-Regular,monospace}@media(prefers-color-scheme:dark){body{background:#181b20;color:#e8eaf0}h1{border-color:#3c424c}a{color:#9bbcf0}pre{background:#252a32;border-color:#3c424c}}
  </style></head><body><main>${output.join('')}</main></body></html>`
}

app.get('/', async (c) => {
  const [rows, jobs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id,filename,media_type,size_bytes,metadata_json,created_at FROM artifacts WHERE thread_id IS NULL AND stage_id IS NULL AND COALESCE(json_extract(metadata_json,'$.scope'),'') != 'book' AND ${VISIBLE_ARTIFACT_SQL} ORDER BY created_at DESC LIMIT 200`,
    ).all(),
    c.env.DB.prepare(
      `SELECT status,payload_json,error,updated_at FROM agent_jobs WHERE job_type='extract_notes' ORDER BY created_at DESC LIMIT 400`,
    ).all<any>(),
  ])
  const jobByArtifact = new Map<string, { status: string; error?: string; updated_at: string }>()
  for (const job of jobs.results || []) {
    try {
      const artifactId = JSON.parse(job.payload_json || '{}').artifact_id
      if (artifactId && !jobByArtifact.has(artifactId))
        jobByArtifact.set(artifactId, { status: job.status, error: job.error || undefined, updated_at: job.updated_at })
    } catch {
      /* ignore malformed legacy payloads */
    }
  }
  const legacy = await c.env.DB.prepare(
    `SELECT id,filename,CASE WHEN lower(filename) LIKE '%.pdf' THEN 'application/pdf' ELSE 'text/html' END media_type,length(content) size_bytes,created_at FROM html_files ORDER BY created_at DESC LIMIT 200`,
  ).all()
  const artifacts = (rows.results || []).map((row: any) => {
    try {
      const metadata = JSON.parse(row.metadata_json || '{}')
      return {
        ...row,
        metadata,
        quality_assurance: normalizeQualityAssurance(metadata),
        metadata_json: undefined,
        extraction: jobByArtifact.get(row.id) || null,
      }
    } catch {
      return {
        ...row,
        metadata: {},
        quality_assurance: normalizeQualityAssurance(),
        metadata_json: undefined,
        extraction: jobByArtifact.get(row.id) || null,
      }
    }
  })
  const recIds = [...new Set(artifacts.map((a: any) => a.metadata?.recommendation_id).filter(Boolean))]
  const recDetailsByRec = new Map<
    string,
    {
      notebook_url?: string
      video_url?: string
      content_type?: string
      video_title?: string
      branch_id?: string
      branch_label?: string
      branch_status?: string
      domain?: string
    }
  >()
  if (recIds.length) {
    const placeholders = recIds.map(() => '?').join(',')
    const recs = await c.env.DB.prepare(
      `
      SELECT r.id, r.video_url, r.video_title, r.notebook_url,r.content_type,b.id branch_id,b.label branch_label,b.status branch_status,b.super_category domain
      FROM recommendations r
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      LEFT JOIN tree_nodes b ON b.id=COALESCE(m.branch_id,r.branch) AND b.status!='pruned'
      WHERE r.id IN (${placeholders})
    `,
    )
      .bind(...recIds)
      .all<{
        id: string
        video_url: string
        notebook_url: string
        content_type: string
        video_title: string
        branch_id: string
        branch_label: string
        branch_status: string
        domain: string
      }>()
    for (const row of recs.results || []) recDetailsByRec.set(row.id, row)
  }
  for (const artifact of artifacts) {
    const recId = artifact.metadata?.recommendation_id
    const rec = recId ? recDetailsByRec.get(recId) : undefined
    artifact.notebook_url = rec?.notebook_url || null
    artifact.source_url = artifact.metadata?.source_url || rec?.video_url || null
    artifact.topic = artifact.metadata?.topic || null
    artifact.owner_title = rec?.video_title || artifact.metadata?.source_title || null
    artifact.owner_type =
      rec?.content_type === 'book' || artifact.metadata?.chapter_key ? 'book' : rec ? 'source' : null
    artifact.branch = rec?.branch_id
      ? { id: rec.branch_id, label: rec.branch_label, status: rec.branch_status, domain: rec.domain }
      : null
  }
  return c.json({
    artifacts: [
      ...artifacts,
      ...(legacy.results || []).map((row: any) => ({
        ...row,
        legacy: true,
        metadata: {},
        quality_assurance: normalizeQualityAssurance({}, true),
        notebook_url: null,
        source_url: null,
        topic: null,
      })),
    ],
  })
})

app.get('/hub', async (c) => {
  const threadId = c.req.query('thread_id') || ''
  const stageId = c.req.query('stage_id') || ''
  const rows = threadId
    ? await c.env.DB.prepare(
        `SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE thread_id=? AND ${VISIBLE_ARTIFACT_SQL} ORDER BY created_at DESC LIMIT 200`,
      )
        .bind(threadId)
        .all<any>()
    : stageId
      ? await c.env.DB.prepare(
          `SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE stage_id=? AND ${VISIBLE_ARTIFACT_SQL} ORDER BY created_at DESC LIMIT 200`,
        )
          .bind(stageId)
          .all<any>()
      : await c.env.DB.prepare(
          `SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE (thread_id IS NOT NULL OR stage_id IS NOT NULL) AND ${VISIBLE_ARTIFACT_SQL} ORDER BY created_at DESC LIMIT 200`,
        ).all<any>()
  const files = (rows.results || []).map((row: any) => {
    let metadata: Record<string, unknown> = {}
    try {
      metadata = JSON.parse(row.metadata_json || '{}')
    } catch {
      /* ignore malformed metadata */
    }
    return { ...row, metadata, metadata_json: undefined }
  })
  return c.json({ files })
})

app.post('/corpora', async (c) => {
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const threadId = String(body.thread_id || '').trim()
  const manifestSha256 = String(body.manifest_sha256 || '')
  const targetSetSha256 = String(body.target_set_sha256 || '')
  const auditCorpusSha256 = String(body.audit_corpus_sha256 || '')
  const expectedPairs = Number(body.expected_pairs)
  const auditReceipt =
    body.audit_receipt && typeof body.audit_receipt === 'object' && !Array.isArray(body.audit_receipt)
      ? (body.audit_receipt as LiteVisualValidationReceipt)
      : null
  const rawTargets = Array.isArray(body.targets) ? body.targets : []
  const receiptSigningKey = String(c.env.LITE_VISUAL_RECEIPT_SIGNING_KEY || '')
  if (
    !threadId ||
    ![manifestSha256, targetSetSha256, auditCorpusSha256].every((value) => SHA256_RE.test(value)) ||
    !Number.isInteger(expectedPairs) ||
    expectedPairs < 1 ||
    expectedPairs > 400 ||
    rawTargets.length !== expectedPairs ||
    !auditReceipt
  ) {
    return c.json({ error: 'invalid_lite_visual_corpus_contract' }, 400)
  }
  if (receiptSigningKey.length < 32) return c.json({ error: 'lite_visual_receipt_verification_unavailable' }, 503)
  const integrityAudit = auditReceipt.schema_version === 'lite-visual-corpus-integrity/v1'
  const auditChecks =
    auditReceipt.checks && typeof auditReceipt.checks === 'object' && !Array.isArray(auditReceipt.checks)
      ? (auditReceipt.checks as Record<string, unknown>)
      : {}
  const auditScopeValid = integrityAudit
    ? auditReceipt.verification_scope === 'integrity-only' &&
      auditReceipt.quality_checks === 'not_run' &&
      Object.keys(auditChecks).length === 3 &&
      ['ordered_targets', 'local_receipt_bindings', 'file_hashes'].every((key) => auditChecks[key] === true)
    : auditReceipt.schema_version === 'lite-visual-corpus-audit/v1' &&
      Object.entries(LITE_VISUAL_AUDIT_PROVENANCE).every(([key, expected]) => auditReceipt[key] === expected)
  if (
    !(await validLiteVisualAttestation(auditReceipt, receiptSigningKey)) ||
    !auditScopeValid ||
    auditReceipt.status !== 'passed' ||
    auditReceipt.thread_id !== threadId ||
    auditReceipt.manifest_sha256 !== manifestSha256 ||
    auditReceipt.target_set_sha256 !== targetSetSha256 ||
    auditReceipt.corpus_sha256 !== auditCorpusSha256 ||
    Number(auditReceipt.expected) !== expectedPairs ||
    Number(auditReceipt.audited) !== expectedPairs ||
    Number(auditReceipt.failed) !== 0
  )
    return c.json({ error: 'lite_visual_corpus_audit_invalid' }, 422)

  const targets: Record<string, any>[] = []
  for (const [position, raw] of rawTargets.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return c.json({ error: 'invalid_lite_visual_corpus_target', position }, 400)
    const value = raw as Record<string, unknown>
    const target: Record<string, any> = {
      position,
      recording_number: Number(value.recording_number),
      recommendation_id: String(value.recommendation_id || '').trim(),
      chapter_key: String(value.chapter_key || '').trim(),
      source_url: String(value.source_url || '').trim(),
      source_title: String(value.source_title || '').trim(),
      workdir: String(value.workdir || '').trim(),
      pair_id: String(value.pair_id || '').trim(),
      job_id: String(value.job_id || '').trim(),
      workflow_run_id: String(value.workflow_run_id || '').trim(),
      supersedes_pair_id: String(value.supersedes_pair_id || '').trim() || null,
    }
    for (const field of CORPUS_HASH_FIELDS) target[field] = String(value[field] || '')
    if (
      !Number.isInteger(target.recording_number) ||
      target.recording_number < 1 ||
      Object.entries(target).some(
        ([field, value]) => !['supersedes_pair_id', 'chapter_key'].includes(field) && (value === '' || value == null),
      ) ||
      CORPUS_HASH_FIELDS.some((field) => !SHA256_RE.test(target[field]))
    )
      return c.json({ error: 'invalid_lite_visual_corpus_target', position }, 400)
    const derivedPairId = await pairIdFor(target.recommendation_id, target, target.chapter_key)
    const targetIdentity = {
      recommendation_id: target.recommendation_id,
      source_url: target.source_url,
      source_title: target.source_title,
      ...(target.chapter_key ? { chapter_key: target.chapter_key } : {}),
    }
    const derivedTargetSha = await liteVisualTargetSha256(targetIdentity)
    if (target.pair_id !== derivedPairId || target.target_sha256 !== derivedTargetSha)
      return c.json({ error: 'lite_visual_corpus_target_identity_mismatch', position }, 409)
    targets.push(target)
  }
  if (
    new Set(targets.map((target) => target.recording_number)).size !== expectedPairs ||
    new Set(targets.map((target) => pairOwnerKey(target.recommendation_id, target.chapter_key))).size !==
      expectedPairs ||
    new Set(targets.map((target) => target.pair_id)).size !== expectedPairs ||
    new Set(targets.map((target) => target.job_id)).size !== expectedPairs ||
    (await computeTargetSetSha256(targets)) !== targetSetSha256
  )
    return c.json({ error: 'lite_visual_corpus_target_set_mismatch' }, 409)
  if ((await computeAuditCorpusSha256(targets)) !== auditCorpusSha256)
    return c.json({ error: 'lite_visual_corpus_audit_hash_mismatch' }, 409)

  const fingerprint = await sha256Hex(
    [threadId, manifestSha256, targetSetSha256, auditCorpusSha256, expectedPairs].join('\n'),
  )
  const corpusId = `lvc-${fingerprint.slice(0, 24)}`
  const existingCorpus = await c.env.DB.prepare('SELECT * FROM lite_visual_corpora WHERE id=?')
    .bind(corpusId)
    .first<any>()
  if (existingCorpus) {
    if (
      existingCorpus.thread_id !== threadId ||
      existingCorpus.manifest_sha256 !== manifestSha256 ||
      existingCorpus.target_set_sha256 !== targetSetSha256 ||
      existingCorpus.audit_corpus_sha256 !== auditCorpusSha256 ||
      Number(existingCorpus.expected_pairs) !== expectedPairs
    ) {
      return c.json({ error: 'lite_visual_corpus_conflict' }, 409)
    }
    const storedTargets = await c.env.DB.prepare(
      `SELECT ${CORPUS_TARGET_FIELDS.join(',')} FROM lite_visual_corpus_targets WHERE corpus_id=? ORDER BY position`,
    )
      .bind(corpusId)
      .all<any>()
    if ((storedTargets.results || []).length === expectedPairs) {
      if (
        (storedTargets.results || []).some(
          (stored: any, index: number) => !exactObject(stored, targets[index], CORPUS_TARGET_FIELDS),
        )
      )
        return c.json({ error: 'lite_visual_corpus_target_conflict' }, 409)
      if (!['staging', 'active'].includes(existingCorpus.state))
        return c.json({ error: 'lite_visual_corpus_not_staging', state: existingCorpus.state }, 409)
      return c.json({
        ok: true,
        reused: true,
        corpus_id: corpusId,
        state: existingCorpus.state,
        expected_pairs: expectedPairs,
      })
    }
    if (existingCorpus.state !== 'staging') return c.json({ error: 'lite_visual_corpus_target_conflict' }, 409)
  }

  const thread = await c.env.DB.prepare('SELECT id FROM learning_threads WHERE id=?')
    .bind(threadId)
    .first<{ id: string }>()
  if (!thread) return c.json({ error: 'thread_not_found' }, 404)
  const readyPairs = await readyPairMap(c.env.DB, targets)
  for (const group of chunks(targets)) {
    const placeholders = group.map(() => '?').join(',')
    const ids = group.map((target) => target.recommendation_id)
    const [recommendations, jobs] = await Promise.all([
      c.env.DB.prepare(
        `SELECT r.id,r.video_url,r.video_title
        FROM recommendations r
        WHERE r.id IN (${placeholders})
          AND r.status IN ('active','consumed') AND r.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM lite_visual_thread_source_placements sp
            WHERE sp.recommendation_id=r.id AND sp.thread_id=?)`,
      )
        .bind(...ids, threadId)
        .all<any>(),
      c.env.DB.prepare(
        `SELECT id,job_type,status,recommendation_id,workflow_run_id,payload_json FROM agent_jobs WHERE id IN (${placeholders})`,
      )
        .bind(...group.map((target) => target.job_id))
        .all<any>(),
    ])
    const recommendationById = new Map((recommendations.results || []).map((row: any) => [row.id, row]))
    const jobById = new Map((jobs.results || []).map((row: any) => [row.id, row]))
    for (const target of group) {
      const recommendation: any = recommendationById.get(target.recommendation_id)
      const job: any = jobById.get(target.job_id)
      const payload = parseMetadata(job?.payload_json)
      const completeReadyPairs = readyPairs.get(pairOwnerKey(target.recommendation_id, target.chapter_key)) || []
      if (
        !recommendation ||
        String(recommendation.video_url || '') !== target.source_url ||
        String(recommendation.video_title || '').trim() !== target.source_title ||
        !job ||
        job.job_type !== 'visualise_source' ||
        !['pending', 'retry', 'running'].includes(job.status) ||
        job.recommendation_id !== target.recommendation_id ||
        job.workflow_run_id !== target.workflow_run_id ||
        payload.recommendation_id !== target.recommendation_id ||
        payload.workflow_contract !== LITE_VISUAL_WORKFLOW_CONTRACT ||
        String(payload.chapter_key || '') !== target.chapter_key ||
        (payload.revision_of_pair_id || null) !== target.supersedes_pair_id ||
        completeReadyPairs.length > 1 ||
        (completeReadyPairs[0] || null) !== target.supersedes_pair_id
      )
        return c.json({ error: 'lite_visual_corpus_target_precondition_failed', position: target.position }, 409)
    }
  }

  const inserted = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO lite_visual_corpora(id,thread_id,manifest_sha256,target_set_sha256,audit_corpus_sha256,expected_pairs)
    VALUES (?,?,?,?,?,?)`,
  )
    .bind(corpusId, threadId, manifestSha256, targetSetSha256, auditCorpusSha256, expectedPairs)
    .run()
  const corpus = await c.env.DB.prepare('SELECT * FROM lite_visual_corpora WHERE id=?').bind(corpusId).first<any>()
  if (
    !corpus ||
    corpus.thread_id !== threadId ||
    corpus.manifest_sha256 !== manifestSha256 ||
    corpus.target_set_sha256 !== targetSetSha256 ||
    corpus.audit_corpus_sha256 !== auditCorpusSha256 ||
    Number(corpus.expected_pairs) !== expectedPairs
  ) {
    return c.json({ error: 'lite_visual_corpus_conflict' }, 409)
  }
  if (corpus.state !== 'staging') return c.json({ error: 'lite_visual_corpus_not_staging', state: corpus.state }, 409)
  for (const group of chunks(targets)) {
    await c.env.DB.batch(
      group.map((target) =>
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO lite_visual_corpus_targets(
      corpus_id,position,recording_number,recommendation_id,chapter_key,source_url,source_title,workdir,pair_id,job_id,workflow_run_id,supersedes_pair_id,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(corpusId, ...CORPUS_TARGET_FIELDS.map((field) => target[field])),
      ),
    )
  }
  const storedTargets = await c.env.DB.prepare(
    `SELECT ${CORPUS_TARGET_FIELDS.join(',')} FROM lite_visual_corpus_targets WHERE corpus_id=? ORDER BY position`,
  )
    .bind(corpusId)
    .all<any>()
  if (
    (storedTargets.results || []).length !== expectedPairs ||
    (storedTargets.results || []).some(
      (stored: any, index: number) => !exactObject(stored, targets[index], CORPUS_TARGET_FIELDS),
    )
  ) {
    return c.json({ error: 'lite_visual_corpus_target_conflict' }, 409)
  }
  return c.json(
    {
      ok: true,
      reused: Number(inserted.meta?.changes || 0) === 0,
      corpus_id: corpusId,
      state: corpus.state,
      expected_pairs: expectedPairs,
    },
    Number(inserted.meta?.changes || 0) === 0 ? 200 : 201,
  )
})

app.get('/corpora/:id', async (c) => {
  const corpus = await c.env.DB.prepare('SELECT * FROM lite_visual_corpora WHERE id=?')
    .bind(c.req.param('id'))
    .first<any>()
  if (!corpus) return c.json({ error: 'lite_visual_corpus_not_found' }, 404)
  const counts = await c.env.DB.prepare(
    `SELECT state,COUNT(*) count FROM lite_visual_pairs WHERE corpus_id=? GROUP BY state`,
  )
    .bind(corpus.id)
    .all<any>()
  const targets = await c.env.DB.prepare('SELECT COUNT(*) count FROM lite_visual_corpus_targets WHERE corpus_id=?')
    .bind(corpus.id)
    .first<any>()
  return c.json({
    corpus,
    target_count: Number(targets?.count || 0),
    pair_counts: Object.fromEntries((counts.results || []).map((row: any) => [row.state, Number(row.count)])),
  })
})

app.get('/corpora/:id/pairs/:pairId', async (c) => {
  const pair = await c.env.DB.prepare(
    `SELECT pair_id,corpus_id,recommendation_id,chapter_key,job_id,workflow_run_id,supersedes_pair_id,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,r2_verified,state,created_at,activated_at
    FROM lite_visual_pairs WHERE corpus_id=? AND pair_id=?`,
  )
    .bind(c.req.param('id'), c.req.param('pairId'))
    .first<any>()
  if (!pair) return c.json({ error: 'lite_visual_pair_not_found' }, 404)
  return c.json({ pair: { ...pair, r2_verified: Number(pair.r2_verified) === 1 } })
})

app.post('/corpora/:id/activate', async (c) => {
  if (!c.env.ARTIFACTS) return c.json({ error: 'artifact_storage_unavailable' }, 503)
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const corpus = await c.env.DB.prepare('SELECT * FROM lite_visual_corpora WHERE id=?')
    .bind(c.req.param('id'))
    .first<any>()
  if (!corpus) return c.json({ error: 'lite_visual_corpus_not_found' }, 404)
  if (
    body.manifest_sha256 !== corpus.manifest_sha256 ||
    body.target_set_sha256 !== corpus.target_set_sha256 ||
    body.audit_corpus_sha256 !== corpus.audit_corpus_sha256 ||
    Number(body.expected_pairs) !== Number(corpus.expected_pairs)
  ) {
    return c.json({ error: 'lite_visual_corpus_activation_precondition_failed' }, 409)
  }
  if (corpus.state === 'active') {
    const pointer = await c.env.DB.prepare('SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=?')
      .bind(corpus.thread_id)
      .first<any>()
    const active = await c.env.DB.prepare(
      `SELECT COUNT(*) count FROM lite_visual_pairs WHERE corpus_id=? AND state='active'`,
    )
      .bind(corpus.id)
      .first<any>()
    if (pointer?.corpus_id !== corpus.id || Number(active?.count) !== Number(corpus.expected_pairs))
      return c.json({ error: 'lite_visual_corpus_no_longer_active' }, 409)
    return c.json({
      ok: true,
      reused: true,
      corpus_id: corpus.id,
      state: 'active',
      activated_pairs: Number(corpus.expected_pairs),
    })
  }
  if (corpus.state !== 'staging') return c.json({ error: 'lite_visual_corpus_not_staging', state: corpus.state }, 409)
  const pairs = await c.env.DB.prepare(`SELECT * FROM lite_visual_pairs WHERE corpus_id=? ORDER BY recommendation_id`)
    .bind(corpus.id)
    .all<any>()
  if (
    (pairs.results || []).length !== Number(corpus.expected_pairs) ||
    (pairs.results || []).some((pair: any) => pair.state !== 'staged' || Number(pair.r2_verified) !== 1)
  ) {
    return c.json(
      {
        error: 'lite_visual_corpus_incomplete',
        expected: Number(corpus.expected_pairs),
        staged: (pairs.results || []).length,
      },
      409,
    )
  }
  for (const group of chunks(pairs.results || [], 20)) {
    const heads = await Promise.all(
      group.flatMap((pair: any) => [c.env.ARTIFACTS!.head(pair.html_r2_key), c.env.ARTIFACTS!.head(pair.pdf_r2_key)]),
    )
    for (const [index, pair] of group.entries()) {
      if (
        !verifiedR2Object(heads[index * 2], Number(pair.html_size_bytes), pair.html_sha256, pair.pair_id, 'html') ||
        !verifiedR2Object(heads[index * 2 + 1], Number(pair.pdf_size_bytes), pair.pdf_sha256, pair.pair_id, 'pdf')
      )
        return c.json({ error: 'lite_visual_corpus_r2_verification_failed', pair_id: pair.pair_id }, 409)
    }
  }
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE lite_visual_corpora SET state='active',previous_corpus_id=(SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=lite_visual_corpora.thread_id),activated_at=datetime('now') WHERE id=? AND state='staging'`,
      ).bind(corpus.id),
      c.env.DB.prepare(
        `UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','superseded','$.superseded_by_corpus_id',?)
        WHERE EXISTS (SELECT 1 FROM lite_visual_corpus_targets t JOIN lite_visual_corpora c ON c.id=t.corpus_id AND c.state='active'
          WHERE t.corpus_id=? AND t.supersedes_pair_id=json_extract(artifacts.metadata_json,'$.pair_id') AND t.recommendation_id=json_extract(artifacts.metadata_json,'$.recommendation_id')
            AND t.chapter_key=COALESCE(json_extract(artifacts.metadata_json,'$.chapter_key'),''))
          AND json_extract(metadata_json,'$.publication_state')='ready'`,
      ).bind(corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready','$.activated_corpus_id',?)
        WHERE EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='active')
          AND id IN (SELECT html_artifact_id FROM lite_visual_pairs WHERE corpus_id=? UNION SELECT pdf_artifact_id FROM lite_visual_pairs WHERE corpus_id=?)`,
      ).bind(corpus.id, corpus.id, corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE lite_visual_pairs SET state='superseded' WHERE EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='active')
        AND pair_id IN (SELECT supersedes_pair_id FROM lite_visual_pairs WHERE corpus_id=? AND supersedes_pair_id IS NOT NULL)`,
      ).bind(corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE lite_visual_pairs SET state='active',activated_at=datetime('now') WHERE corpus_id=? AND state='staged'
        AND EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='active')`,
      ).bind(corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE agent_jobs SET status='completed',workflow_step='verify_record',result_json=json_patch(COALESCE(result_json,'{}'),(
          SELECT json_object('pair_id',p.pair_id,'html_artifact_id',p.html_artifact_id,'pdf_artifact_id',p.pdf_artifact_id,'validation_status','passed','receipt_sha256',p.receipt_sha256,'corpus_id',p.corpus_id,'activated_at',datetime('now'))
          FROM lite_visual_pairs p WHERE p.job_id=agent_jobs.id AND p.corpus_id=?
        )),error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now')
        WHERE EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='active')
          AND id IN (SELECT job_id FROM lite_visual_pairs WHERE corpus_id=?) AND status='awaiting_activation'
          AND workflow_run_id=(SELECT p.workflow_run_id FROM lite_visual_pairs p WHERE p.job_id=agent_jobs.id AND p.corpus_id=?)`,
      ).bind(corpus.id, corpus.id, corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE lite_visual_corpora SET state='superseded'
        WHERE id=(SELECT previous_corpus_id FROM lite_visual_corpora WHERE id=? AND state='active') AND id!=? AND state='active'`,
      ).bind(corpus.id, corpus.id),
      c.env.DB.prepare(
        `INSERT INTO lite_visual_active_corpora(thread_id,corpus_id,activated_at)
        SELECT thread_id,id,datetime('now') FROM lite_visual_corpora WHERE id=? AND state='active'
        ON CONFLICT(thread_id) DO UPDATE SET corpus_id=excluded.corpus_id,activated_at=excluded.activated_at`,
      ).bind(corpus.id),
      c.env.DB.prepare(
        `DELETE FROM agent_job_retries WHERE EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='active')
        AND job_id IN (SELECT job_id FROM lite_visual_pairs WHERE corpus_id=?)`,
      ).bind(corpus.id, corpus.id),
    ])
  } catch (error) {
    return c.json(
      {
        error: 'lite_visual_corpus_activation_failed',
        detail: String((error as Error)?.message || error).slice(0, 500),
      },
      409,
    )
  }
  const [activated, completed, pointer] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) count FROM lite_visual_pairs WHERE corpus_id=? AND state='active'`)
      .bind(corpus.id)
      .first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) count FROM agent_jobs j JOIN lite_visual_pairs p ON p.job_id=j.id WHERE p.corpus_id=? AND j.status='completed' AND j.workflow_run_id=p.workflow_run_id`,
    )
      .bind(corpus.id)
      .first<any>(),
    c.env.DB.prepare('SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=?')
      .bind(corpus.thread_id)
      .first<any>(),
  ])
  if (
    Number(activated?.count) !== Number(corpus.expected_pairs) ||
    Number(completed?.count) !== Number(corpus.expected_pairs) ||
    pointer?.corpus_id !== corpus.id
  )
    return c.json({ error: 'lite_visual_corpus_activation_readback_failed' }, 500)
  return c.json({
    ok: true,
    reused: false,
    corpus_id: corpus.id,
    state: 'active',
    activated_pairs: Number(activated.count),
  })
})

app.post('/corpora/:id/abort', async (c) => {
  const corpus = await c.env.DB.prepare('SELECT * FROM lite_visual_corpora WHERE id=?')
    .bind(c.req.param('id'))
    .first<any>()
  if (!corpus) return c.json({ error: 'lite_visual_corpus_not_found' }, 404)
  if (corpus.state === 'aborted') return c.json({ ok: true, reused: true, corpus_id: corpus.id, state: 'aborted' })
  if (corpus.state !== 'staging') return c.json({ error: 'lite_visual_corpus_not_staging', state: corpus.state }, 409)
  const pairs = await c.env.DB.prepare(
    'SELECT pair_id,job_id,workflow_run_id,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key FROM lite_visual_pairs WHERE corpus_id=?',
  )
    .bind(corpus.id)
    .all<any>()
  const artifactIds = (pairs.results || []).flatMap((pair: any) => [pair.html_artifact_id, pair.pdf_artifact_id])
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE lite_visual_corpora SET state='aborted',aborted_at=datetime('now') WHERE id=? AND state='staging'`,
    ).bind(corpus.id),
    c.env.DB.prepare(
      `UPDATE agent_jobs SET status='retry',workflow_step='publish_pair',result_json=json_remove(COALESCE(result_json,'{}'),'$.pair_id','$.html_artifact_id','$.pdf_artifact_id','$.receipt_sha256','$.corpus_id'),lease_owner=NULL,lease_expires_at=NULL,error=NULL,updated_at=datetime('now')
      WHERE EXISTS (SELECT 1 FROM lite_visual_corpus_targets t JOIN lite_visual_corpora c ON c.id=t.corpus_id AND c.state='aborted' AND c.aborted_at IS NOT NULL
        WHERE t.corpus_id=? AND t.job_id=agent_jobs.id AND t.workflow_run_id=agent_jobs.workflow_run_id)
        AND status IN ('pending','retry','running','awaiting_activation')`,
    ).bind(corpus.id),
    c.env.DB.prepare(
      `DELETE FROM lite_visual_pairs WHERE corpus_id=? AND EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='aborted' AND c.aborted_at IS NOT NULL)`,
    ).bind(corpus.id, corpus.id),
    ...chunks(artifactIds).map((group) =>
      c.env.DB.prepare(
        `DELETE FROM artifacts WHERE id IN (${group.map(() => '?').join(',')})
      AND EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='aborted' AND c.aborted_at IS NOT NULL)`,
      ).bind(...group, corpus.id),
    ),
  ])
  const [aborted, remaining] = await Promise.all([
    c.env.DB.prepare(`SELECT state,aborted_at FROM lite_visual_corpora WHERE id=?`).bind(corpus.id).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM lite_visual_pairs WHERE corpus_id=?`).bind(corpus.id).first<any>(),
  ])
  if (aborted?.state !== 'aborted' || !aborted?.aborted_at || Number(remaining?.count || 0) !== 0)
    return c.json({ error: 'lite_visual_corpus_abort_raced' }, 409)
  if (c.env.ARTIFACTS)
    await Promise.allSettled(
      (pairs.results || [])
        .flatMap((pair: any) => [pair.html_r2_key, pair.pdf_r2_key])
        .map((key: string) => c.env.ARTIFACTS!.delete(key)),
    )
  return c.json({
    ok: true,
    reused: false,
    corpus_id: corpus.id,
    state: 'aborted',
    discarded_pairs: (pairs.results || []).length,
  })
})

app.post('/corpora/:id/rollback', async (c) => {
  if (!c.env.ARTIFACTS) return c.json({ error: 'artifact_storage_unavailable' }, 503)
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const corpus = await c.env.DB.prepare('SELECT * FROM lite_visual_corpora WHERE id=?')
    .bind(c.req.param('id'))
    .first<any>()
  if (!corpus) return c.json({ error: 'lite_visual_corpus_not_found' }, 404)
  if (
    body.manifest_sha256 !== corpus.manifest_sha256 ||
    body.target_set_sha256 !== corpus.target_set_sha256 ||
    body.audit_corpus_sha256 !== corpus.audit_corpus_sha256 ||
    Number(body.expected_pairs) !== Number(corpus.expected_pairs)
  ) {
    return c.json({ error: 'lite_visual_corpus_rollback_precondition_failed' }, 409)
  }
  const pointer = await c.env.DB.prepare('SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=?')
    .bind(corpus.thread_id)
    .first<any>()
  if (
    corpus.state === 'superseded' &&
    corpus.rolled_back_at &&
    (pointer?.corpus_id || null) === (corpus.previous_corpus_id || null)
  ) {
    return c.json({
      ok: true,
      reused: true,
      corpus_id: corpus.id,
      state: 'superseded',
      active_corpus_id: pointer?.corpus_id || null,
    })
  }
  if (corpus.state !== 'active' || pointer?.corpus_id !== corpus.id || corpus.rolled_back_at)
    return c.json({ error: 'lite_visual_corpus_not_active', state: corpus.state }, 409)
  const targets = await c.env.DB.prepare(
    `SELECT recommendation_id,chapter_key,supersedes_pair_id FROM lite_visual_corpus_targets WHERE corpus_id=? ORDER BY position`,
  )
    .bind(corpus.id)
    .all<any>()
  const previous = (targets.results || []).filter((target: any) => target.supersedes_pair_id)
  const oldArtifacts = previous.length
    ? await c.env.DB.prepare(
        `SELECT id,r2_key,size_bytes,metadata_json FROM artifacts a WHERE EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t WHERE t.corpus_id=? AND t.supersedes_pair_id=json_extract(a.metadata_json,'$.pair_id')
      AND t.recommendation_id=json_extract(a.metadata_json,'$.recommendation_id') AND t.chapter_key=COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')
  )`,
      )
        .bind(corpus.id)
        .all<any>()
    : { results: [] as any[] }
  const byPair = new Map<string, Map<string, any>>()
  for (const artifact of oldArtifacts.results || []) {
    const metadata = parseMetadata(artifact.metadata_json)
    const roles = byPair.get(String(metadata.pair_id || '')) || new Map<string, any>()
    roles.set(String(metadata.role || ''), { ...artifact, metadata })
    byPair.set(String(metadata.pair_id || ''), roles)
  }
  for (const target of previous) {
    const roles = byPair.get(String(target.supersedes_pair_id || ''))
    if (!roles || roles.size !== 2 || !roles.has('html') || !roles.has('pdf'))
      return c.json({ error: 'lite_visual_corpus_rollback_artifacts_missing', pair_id: target.supersedes_pair_id }, 409)
    for (const [role, artifact] of roles) {
      if (
        artifact.metadata.publication_state !== 'superseded' ||
        artifact.metadata.validation_status !== 'passed' ||
        !artifact.r2_key ||
        Number(artifact.size_bytes) < 1
      ) {
        return c.json(
          { error: 'lite_visual_corpus_rollback_artifacts_invalid', pair_id: target.supersedes_pair_id, role },
          409,
        )
      }
    }
  }
  for (const group of chunks(
    [...byPair.values()].flatMap((roles) => [...roles.values()]),
    20,
  )) {
    const heads = await Promise.all(group.map((artifact: any) => c.env.ARTIFACTS!.head(artifact.r2_key)))
    for (const [index, artifact] of group.entries()) {
      const object = heads[index]
      const role = String(artifact.metadata.role || '')
      const expectedHash = String(artifact.metadata[`${role}_sha256`] || '')
      if (
        !verifiedR2Object(
          object,
          Number(artifact.size_bytes),
          expectedHash,
          String(artifact.metadata.pair_id || ''),
          role,
        )
      ) {
        return c.json(
          { error: 'lite_visual_corpus_rollback_r2_verification_failed', pair_id: artifact.metadata.pair_id, role },
          409,
        )
      }
    }
  }
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE lite_visual_corpora SET state='superseded',rolled_back_at=datetime('now')
        WHERE id=? AND state='active' AND rolled_back_at IS NULL AND id=(SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=lite_visual_corpora.thread_id)`,
      ).bind(corpus.id),
      c.env.DB.prepare(
        `UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','superseded','$.rolled_back_corpus_id',?)
        WHERE EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL)
          AND id IN (SELECT html_artifact_id FROM lite_visual_pairs WHERE corpus_id=? UNION SELECT pdf_artifact_id FROM lite_visual_pairs WHERE corpus_id=?)`,
      ).bind(corpus.id, corpus.id, corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE artifacts SET metadata_json=json_remove(json_set(metadata_json,'$.publication_state','ready','$.restored_by_rollback_corpus_id',?),'$.superseded_by_corpus_id')
        WHERE EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL)
          AND EXISTS (SELECT 1 FROM lite_visual_corpus_targets t WHERE t.corpus_id=? AND t.supersedes_pair_id=json_extract(artifacts.metadata_json,'$.pair_id')
            AND t.recommendation_id=json_extract(artifacts.metadata_json,'$.recommendation_id') AND t.chapter_key=COALESCE(json_extract(artifacts.metadata_json,'$.chapter_key'),''))`,
      ).bind(corpus.id, corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE lite_visual_pairs SET state='superseded' WHERE corpus_id=? AND state='active'
        AND EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL)`,
      ).bind(corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE lite_visual_pairs SET state='active',activated_at=datetime('now')
        WHERE pair_id IN (SELECT supersedes_pair_id FROM lite_visual_corpus_targets WHERE corpus_id=? AND supersedes_pair_id IS NOT NULL)
          AND EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL)`,
      ).bind(corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE agent_jobs SET result_json=json_patch(COALESCE(result_json,'{}'),json_object('rolled_back_at',datetime('now'),'rolled_back_corpus_id',?)),updated_at=datetime('now')
        WHERE id IN (SELECT job_id FROM lite_visual_pairs WHERE corpus_id=?) AND status='completed'
          AND EXISTS (SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL)`,
      ).bind(corpus.id, corpus.id, corpus.id),
      c.env.DB.prepare(
        `UPDATE lite_visual_corpora SET state='active',activated_at=datetime('now')
        WHERE id=(SELECT previous_corpus_id FROM lite_visual_corpora WHERE id=? AND state='superseded' AND rolled_back_at IS NOT NULL) AND state='superseded'`,
      ).bind(corpus.id),
      c.env.DB.prepare(
        `INSERT INTO lite_visual_active_corpora(thread_id,corpus_id,activated_at)
        SELECT c.thread_id,c.previous_corpus_id,datetime('now') FROM lite_visual_corpora c
        WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL AND c.previous_corpus_id IS NOT NULL
        ON CONFLICT(thread_id) DO UPDATE SET corpus_id=excluded.corpus_id,activated_at=excluded.activated_at`,
      ).bind(corpus.id),
      c.env.DB.prepare(
        `DELETE FROM lite_visual_active_corpora WHERE thread_id=? AND EXISTS (
        SELECT 1 FROM lite_visual_corpora c WHERE c.id=? AND c.state='superseded' AND c.rolled_back_at IS NOT NULL AND c.previous_corpus_id IS NULL
      )`,
      ).bind(corpus.thread_id, corpus.id),
    ])
  } catch (error) {
    return c.json(
      { error: 'lite_visual_corpus_rollback_failed', detail: String((error as Error)?.message || error).slice(0, 500) },
      409,
    )
  }
  const [rolledBack, activePointer, restored] = await Promise.all([
    c.env.DB.prepare(`SELECT state,previous_corpus_id,rolled_back_at FROM lite_visual_corpora WHERE id=?`)
      .bind(corpus.id)
      .first<any>(),
    c.env.DB.prepare(`SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id=?`)
      .bind(corpus.thread_id)
      .first<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT json_extract(a.metadata_json,'$.pair_id')) count FROM artifacts a WHERE json_extract(a.metadata_json,'$.publication_state')='ready'
      AND EXISTS (SELECT 1 FROM lite_visual_corpus_targets t WHERE t.corpus_id=? AND t.supersedes_pair_id=json_extract(a.metadata_json,'$.pair_id'))`,
    )
      .bind(corpus.id)
      .first<any>(),
  ])
  if (
    rolledBack?.state !== 'superseded' ||
    !rolledBack?.rolled_back_at ||
    (rolledBack.previous_corpus_id || null) !== (activePointer?.corpus_id || null) ||
    Number(restored?.count || 0) !== previous.length
  ) {
    return c.json({ error: 'lite_visual_corpus_rollback_readback_failed' }, 500)
  }
  return c.json({
    ok: true,
    corpus_id: corpus.id,
    state: 'superseded',
    restored_pairs: previous.length,
    active_corpus_id: activePointer?.corpus_id || null,
  })
})

app.post('/pairs', async (c) => {
  const storedKeys: string[] = []
  let committedPairId = ''
  let d1CommitAttempted = false
  try {
    if (!c.env.ARTIFACTS) return c.json({ error: 'artifact_storage_unavailable' }, 503)
    const form = await c.req.formData()
    const html = form.get('html')
    const pdf = form.get('pdf')
    if (!(html instanceof File) || !(pdf instanceof File))
      return c.json({ error: 'html and pdf files are required' }, 400)
    const rawMetadata = form.get('metadata')
    const rawReceipt = form.get('validation_receipt')
    if (typeof rawMetadata !== 'string' || typeof rawReceipt !== 'string')
      return c.json({ error: 'metadata and validation_receipt JSON are required' }, 400)
    let metadata: Record<string, unknown>
    let receipt: LiteVisualValidationReceipt
    try {
      metadata = JSON.parse(rawMetadata)
      receipt = JSON.parse(rawReceipt)
    } catch {
      return c.json({ error: 'metadata and validation_receipt must be valid JSON objects' }, 400)
    }
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt)
    )
      return c.json({ error: 'metadata and validation_receipt must be JSON objects' }, 400)
    const receiptSigningKey = String(c.env.LITE_VISUAL_RECEIPT_SIGNING_KEY || '')
    if (receiptSigningKey.length < 32) return c.json({ error: 'lite_visual_receipt_verification_unavailable' }, 503)

    const [htmlBytes, pdfBytes] = await Promise.all([html.arrayBuffer(), pdf.arrayBuffer()])
    const validation = await validateLiteVisualPair(
      metadata,
      receipt,
      html,
      pdf,
      htmlBytes,
      pdfBytes,
      receiptSigningKey,
    )
    if (!validation.ok)
      return c.json({ error: 'lite_visual_pair_validation_failed', failures: validation.failures }, 422)

    const recommendationId = String(metadata.recommendation_id)
    const target = await c.env.DB.prepare(
      `SELECT r.id,r.video_url,r.video_title,m.source_metadata_json FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=? AND r.status IN ('active','consumed') AND r.deleted_at IS NULL`,
    )
      .bind(recommendationId)
      .first<any>()
    if (!target) return c.json({ error: 'recommendation_not_found' }, 404)
    const sourceUrl = String(metadata.source_url || '')
    const sourceTitle = String(metadata.source_title || '').trim()
    const chapterKey = String(metadata.chapter_key || '').trim()
    const receiptTarget =
      receipt.target && typeof receipt.target === 'object' && !Array.isArray(receipt.target)
        ? (receipt.target as Record<string, unknown>)
        : {}
    if (
      sourceUrl !== String(target.video_url || '') ||
      sourceTitle !== String(target.video_title || '').trim() ||
      receiptTarget.recommendation_id !== recommendationId ||
      receiptTarget.source_url !== sourceUrl ||
      String(receiptTarget.source_title || '').trim() !== sourceTitle ||
      String(receiptTarget.chapter_key || '') !== chapterKey
    )
      return c.json({ error: 'source_target_mismatch' }, 409)

    const pairId = await pairIdFor(recommendationId, receipt, chapterKey)
    committedPairId = pairId
    if (metadata.pair_id !== pairId)
      return c.json({ error: 'pair_id_not_derived_from_receipt', expected_pair_id: pairId }, 409)
    const corpusId = String(metadata.corpus_id || '').trim() || null
    const jobId = String(metadata.job_id || '').trim() || null
    const workflowRunId = String(metadata.workflow_run_id || '').trim() || null
    const workerIdentity = String(metadata.worker_identity || '').trim() || null
    const supersedesPairId = String(metadata.supersedes_pair_id || '').trim() || null
    const receiptSha256 = await sha256Hex(rawReceipt)
    let corpus: any = null
    let corpusTarget: any = null
    if (corpusId) {
      corpus = await c.env.DB.prepare(`SELECT * FROM lite_visual_corpora WHERE id=?`).bind(corpusId).first<any>()
      if (!corpus || !['staging', 'active'].includes(corpus.state))
        return c.json({ error: 'lite_visual_corpus_not_staging' }, 409)
      if (!jobId || !workflowRunId || !workerIdentity)
        return c.json({ error: 'staged_pair_requires_exact_job_run' }, 400)
      corpusTarget = await c.env.DB.prepare('SELECT * FROM lite_visual_corpus_targets WHERE corpus_id=? AND pair_id=?')
        .bind(corpusId, pairId)
        .first<any>()
      const expectedTarget = {
        pair_id: pairId,
        recommendation_id: recommendationId,
        chapter_key: chapterKey,
        job_id: jobId,
        workflow_run_id: workflowRunId,
        supersedes_pair_id: supersedesPairId,
        target_sha256: receipt.target_sha256,
        receipt_sha256: receiptSha256,
        work_item_sha256: receipt.work_item_sha256,
        source_extraction_sha256: receipt.source_extraction_sha256,
        source_sha256: receipt.source_sha256,
        source_scope_sha256: receipt.source_scope_sha256,
        coverage_ledger_sha256: receipt.coverage_ledger_sha256,
        html_sha256: receipt.html_sha256,
        pdf_sha256: receipt.pdf_sha256,
      }
      if (!corpusTarget || !exactObject(corpusTarget, expectedTarget, Object.keys(expectedTarget)))
        return c.json({ error: 'staged_pair_target_mismatch' }, 409)
    }
    const existing = await c.env.DB.prepare(`SELECT * FROM lite_visual_pairs WHERE pair_id=?`).bind(pairId).first<any>()
    if (existing) {
      const exact =
        existing.recommendation_id === recommendationId &&
        String(existing.chapter_key || '') === chapterKey &&
        (existing.corpus_id || null) === corpusId &&
        (existing.job_id || null) === jobId &&
        (existing.workflow_run_id || null) === workflowRunId &&
        (existing.supersedes_pair_id || null) === supersedesPairId &&
        existing.target_sha256 === receipt.target_sha256 &&
        existing.receipt_sha256 === receiptSha256 &&
        existing.work_item_sha256 === receipt.work_item_sha256 &&
        existing.source_extraction_sha256 === receipt.source_extraction_sha256 &&
        existing.source_sha256 === receipt.source_sha256 &&
        existing.source_scope_sha256 === receipt.source_scope_sha256 &&
        existing.coverage_ledger_sha256 === receipt.coverage_ledger_sha256 &&
        existing.html_sha256 === validation.hashes.html &&
        existing.pdf_sha256 === validation.hashes.pdf
      if (!exact) return c.json({ error: 'artifact_pair_conflict', pair_id: pairId }, 409)
      const [htmlObject, pdfObject] = await Promise.all([
        c.env.ARTIFACTS.head(existing.html_r2_key),
        c.env.ARTIFACTS.head(existing.pdf_r2_key),
      ])
      if (
        !verifiedR2Object(htmlObject, Number(existing.html_size_bytes), existing.html_sha256, pairId, 'html') ||
        !verifiedR2Object(pdfObject, Number(existing.pdf_size_bytes), existing.pdf_sha256, pairId, 'pdf')
      )
        return c.json({ error: 'artifact_pair_storage_incomplete', pair_id: pairId }, 409)
      return c.json({
        ok: true,
        reused: true,
        pair_id: pairId,
        status: existing.state === 'staged' ? 'staged' : 'ready',
        corpus_id: existing.corpus_id || null,
        html: { id: existing.html_artifact_id, filename: html.name },
        pdf: { id: existing.pdf_artifact_id, filename: pdf.name },
      })
    }
    if (corpusId && corpus?.state !== 'staging') return c.json({ error: 'lite_visual_corpus_not_staging' }, 409)
    const currentPairId = await currentReadyPair(c.env.DB, recommendationId, chapterKey)
    if (corpusId && currentPairId !== supersedesPairId)
      return c.json({ error: 'pair_supersession_precondition_failed', current_pair_id: currentPairId }, 409)
    if (jobId) {
      const job = await c.env.DB.prepare(
        `SELECT id,job_type,status,recommendation_id,workflow_run_id,workflow_step,lease_owner,lease_expires_at,payload_json FROM agent_jobs WHERE id=?`,
      )
        .bind(jobId)
        .first<any>()
      const payload = parseMetadata(job?.payload_json)
      if (
        !job ||
        job.job_type !== 'visualise_source' ||
        job.status !== 'running' ||
        job.workflow_step !== 'publish_pair' ||
        job.recommendation_id !== recommendationId ||
        job.workflow_run_id !== workflowRunId ||
        job.lease_owner !== workerIdentity ||
        !job.lease_expires_at ||
        job.lease_expires_at <= new Date().toISOString().slice(0, 19).replace('T', ' ') ||
        payload.recommendation_id !== recommendationId ||
        payload.workflow_contract !== LITE_VISUAL_WORKFLOW_CONTRACT ||
        String(payload.chapter_key || '') !== chapterKey ||
        (payload.revision_of_pair_id || null) !== (supersedesPairId || currentPairId)
      )
        return c.json({ error: 'pair_job_lineage_mismatch' }, 409)
    }

    const identity = `${Date.now()}_${crypto.randomUUID().slice(0, 12)}`
    const htmlId = `artifact_${identity}_html`
    const pdfId = `artifact_${identity}_pdf`
    const htmlKey = `lite-visual/${pairId}/${identity}/companion.html`
    const pdfKey = `lite-visual/${pairId}/${identity}/companion.pdf`
    await c.env.ARTIFACTS.put(htmlKey, htmlBytes, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
      customMetadata: { sha256: validation.hashes.html, pair_id: pairId, role: 'html' },
    })
    storedKeys.push(htmlKey)
    await c.env.ARTIFACTS.put(pdfKey, pdfBytes, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { sha256: validation.hashes.pdf, pair_id: pairId, role: 'pdf' },
    })
    storedKeys.push(pdfKey)
    const [htmlObject, pdfObject] = await Promise.all([c.env.ARTIFACTS.head(htmlKey), c.env.ARTIFACTS.head(pdfKey)])
    if (
      !verifiedR2Object(htmlObject, htmlBytes.byteLength, validation.hashes.html, pairId, 'html') ||
      !verifiedR2Object(pdfObject, pdfBytes.byteLength, validation.hashes.pdf, pairId, 'pdf')
    )
      throw new Error('R2 verification failed after pair upload')
    const publicationState = corpusId ? 'staged' : 'ready'
    const common = {
      ...metadata,
      generator: 'lite-visual',
      workflow_contract: LITE_VISUAL_WORKFLOW_CONTRACT,
      asset_policy: 'code-only',
      publication_state: publicationState,
      validation_status: 'passed',
      validation_receipt_schema: receipt.schema_version,
      verification_scope: receipt.schema_version === 'lite-visual-integrity/v1' ? 'integrity-only' : 'full-validation',
      quality_checks: receipt.schema_version === 'lite-visual-integrity/v1' ? 'not_run' : 'passed',
      validation_receipt_sha256: receiptSha256,
      validation_receipt: receipt,
      source: 'lite_visual_atomic_pair',
      ...(corpusId ? { corpus_id: corpusId } : {}),
      ...(jobId ? { job_id: jobId } : {}),
      ...(workflowRunId ? { workflow_run_id: workflowRunId } : {}),
    }
    const statements = [
      ...(currentPairId && !corpusId
        ? [
            c.env.DB.prepare(
              `UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','superseded') WHERE json_extract(metadata_json,'$.recommendation_id')=? AND COALESCE(json_extract(metadata_json,'$.chapter_key'),'')=? AND json_extract(metadata_json,'$.publication_state')='ready'`,
            ).bind(recommendationId, chapterKey),
            c.env.DB.prepare(
              `UPDATE lite_visual_pairs SET state='superseded' WHERE recommendation_id=? AND chapter_key=? AND state='active'`,
            ).bind(recommendationId, chapterKey),
          ]
        : []),
      c.env.DB.prepare(
        `INSERT INTO artifacts (id,filename,media_type,r2_key,size_bytes,metadata_json) VALUES (?,?,?,?,?,?)`,
      ).bind(
        htmlId,
        html.name,
        'text/html; charset=utf-8',
        htmlKey,
        html.size,
        JSON.stringify({
          ...common,
          role: 'html',
          html_sha256: validation.hashes.html,
          pdf_sha256: validation.hashes.pdf,
        }),
      ),
      c.env.DB.prepare(
        `INSERT INTO artifacts (id,filename,media_type,r2_key,size_bytes,metadata_json) VALUES (?,?,?,?,?,?)`,
      ).bind(
        pdfId,
        pdf.name,
        'application/pdf',
        pdfKey,
        pdf.size,
        JSON.stringify({
          ...common,
          role: 'pdf',
          html_sha256: validation.hashes.html,
          pdf_sha256: validation.hashes.pdf,
        }),
      ),
      c.env.DB.prepare(
        `INSERT INTO lite_visual_pairs(pair_id,corpus_id,recommendation_id,chapter_key,job_id,workflow_run_id,worker_identity,supersedes_pair_id,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key,html_size_bytes,pdf_size_bytes,r2_verified,state,activated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='active' THEN datetime('now') ELSE NULL END)`,
      ).bind(
        pairId,
        corpusId,
        recommendationId,
        chapterKey,
        jobId,
        workflowRunId,
        workerIdentity,
        currentPairId || supersedesPairId,
        receipt.target_sha256,
        receipt.work_item_sha256,
        receipt.source_extraction_sha256,
        receipt.source_sha256,
        receipt.source_scope_sha256,
        receipt.coverage_ledger_sha256,
        validation.hashes.html,
        validation.hashes.pdf,
        receiptSha256,
        htmlId,
        pdfId,
        htmlKey,
        pdfKey,
        html.size,
        pdf.size,
        1,
        corpusId ? 'staged' : 'active',
        corpusId ? 'staged' : 'active',
      ),
    ]
    d1CommitAttempted = true
    await c.env.DB.batch(statements)
    return c.json(
      {
        ok: true,
        reused: false,
        pair_id: pairId,
        status: publicationState,
        corpus_id: corpusId,
        html: { id: htmlId, filename: html.name },
        pdf: { id: pdfId, filename: pdf.name },
        verification: {
          validation_receipt_sha256: receiptSha256,
          r2_verified: true,
          source_record: `/capture/${encodeURIComponent(recommendationId)}/record`,
        },
      },
      201,
    )
  } catch (error) {
    let committed: any = null
    let commitReadFailed = false
    if (d1CommitAttempted && committedPairId) {
      try {
        committed = await c.env.DB.prepare('SELECT html_r2_key,pdf_r2_key FROM lite_visual_pairs WHERE pair_id=?')
          .bind(committedPairId)
          .first<any>()
      } catch {
        commitReadFailed = true
      }
    }
    const retained = new Set([committed?.html_r2_key, committed?.pdf_r2_key].filter(Boolean))
    if (c.env.ARTIFACTS && !commitReadFailed)
      await Promise.allSettled(
        storedKeys.filter((key) => !retained.has(key)).map((key) => c.env.ARTIFACTS!.delete(key)),
      )
    return c.json({ error: 'Atomic Lite Visual publication failed', details: safeErrorMessage(error) }, 500)
  }
})

app.post('/', async (c) => {
  let storedKey: string | null = null
  try {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file required' }, 400)
    let metadata: Record<string, unknown> = {}
    const rawMetadata = form.get('metadata')
    if (typeof rawMetadata === 'string' && rawMetadata.trim()) {
      try {
        const parsed = JSON.parse(rawMetadata)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          return c.json({ error: 'metadata must be a JSON object' }, 400)
        metadata = parsed
      } catch {
        return c.json({ error: 'metadata must be valid JSON' }, 400)
      }
    }
    const validation = mergeArtifactMultipartMetadata(metadata, form, file)
    const bytes = await file.arrayBuffer()
    const content = inspectArtifactContent(metadata, file, bytes)
    if (!validation.ok || !content.ok || !content.mediaType) {
      const failures = [...new Set([...(validation.ok ? [] : validation.failures), ...content.failures])]
      return c.json({ error: 'artifact_metadata_validation_failed', failures }, 422)
    }
    const threadId =
      String(metadata.thread_id || '')
        .trim()
        .slice(0, 120) || null
    const stageId =
      String(metadata.stage_id || '')
        .trim()
        .slice(0, 120) || null
    const lessonId =
      String(metadata.lesson_id || '')
        .trim()
        .slice(0, 120) || null
    if ([threadId, stageId, lessonId].filter(Boolean).length > 1)
      return c.json({ error: 'file must have exactly one learning owner' }, 400)
    if (threadId || stageId || lessonId) {
      try {
        await resolveLearningScope(
          c.env.DB,
          threadId
            ? { kind: 'thread', id: threadId }
            : stageId
              ? { kind: 'level', id: stageId }
              : { kind: 'lesson', id: lessonId! },
        )
      } catch (error: any) {
        return c.json(
          { error: error?.code || 'invalid_scope', message: error?.message || 'Invalid learning scope.' },
          400,
        )
      }
    }
    const pairId = String(metadata.pair_id || '')
    const role = String(metadata.role || '').toLowerCase()
    if (pairId && ['html', 'pdf'].includes(role)) {
      const conflict = await c.env.DB.prepare(
        `SELECT id,metadata_json FROM artifacts WHERE json_extract(metadata_json,'$.pair_id')=?`,
      )
        .bind(pairId)
        .all<any>()
      for (const row of conflict.results || []) {
        let existing: any = {}
        try {
          existing = JSON.parse(row.metadata_json || '{}')
        } catch {}
        if (existing.role === role) return c.json({ error: 'artifact_pair_role_exists', pair_id: pairId, role }, 409)
        for (const key of ['recommendation_id', 'source_checksum']) {
          if (existing[key] && metadata[key] && existing[key] !== metadata[key])
            return c.json({ error: 'artifact_pair_source_mismatch', pair_id: pairId, field: key }, 409)
        }
      }
    }
    const id = `artifact_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
    const key = `${new Date().toISOString().slice(0, 10)}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    if (c.env.ARTIFACTS) {
      await c.env.ARTIFACTS.put(key, bytes, { httpMetadata: { contentType: content.mediaType } })
      storedKey = key
    }
    await c.env.DB.prepare(
      `INSERT INTO artifacts (id,filename,media_type,r2_key,size_bytes,metadata_json,thread_id,stage_id,lesson_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        file.name,
        content.mediaType,
        key,
        file.size,
        JSON.stringify({ source: 'artifact_upload', ...metadata }),
        threadId,
        stageId,
        lessonId,
      )
      .run()
    storedKey = null
    return c.json(
      {
        ok: true,
        id,
        filename: file.name,
        r2_key: key,
        metadata,
        quality_assurance: normalizeQualityAssurance(metadata),
      },
      201,
    )
  } catch (error) {
    if (storedKey && c.env.ARTIFACTS) await c.env.ARTIFACTS.delete(storedKey).catch(() => {})
    return c.json(safeError('Artifact upload failed')(error), 500)
  }
})

app.post('/:id/process', async (c) => {
  const artifact = await c.env.DB.prepare(
    `SELECT a.*,r.id owner_id,r.status owner_status,r.deleted_at owner_deleted_at FROM artifacts a LEFT JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id') WHERE a.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!artifact) return c.json({ error: 'not found' }, 404)
  if (hiddenArtifact(artifact)) return c.json({ error: 'not found' }, 404)
  const body: { recommendation_id?: string; source_url?: string } = await c.req.json().catch(() => ({}))
  let metadata: Record<string, any> = {}
  try {
    metadata = JSON.parse(artifact.metadata_json || '{}')
  } catch {}
  const recommendationId = body.recommendation_id || metadata.recommendation_id || null
  const sourceUrl = body.source_url || metadata.source_url || null
  const jobId = `job_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
  const idempotencyKey = `extract-artifact:${artifact.id}`
  const existing = await c.env.DB.prepare(`SELECT id,status FROM agent_jobs WHERE idempotency_key=?`)
    .bind(idempotencyKey)
    .first<{ id: string; status: string }>()
  if (existing?.status === 'failed') {
    await c.env.DB.prepare(
      `UPDATE agent_jobs SET status='retry',attempts=0,error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`,
    )
      .bind(existing.id)
      .run()
    return c.json({ ok: true, status: 'retry', job_id: existing.id }, 202)
  }
  await c.env.DB.prepare(
    `INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key)
    VALUES (?,'extract_notes',?,?) ON CONFLICT(idempotency_key) DO NOTHING`,
  )
    .bind(
      jobId,
      JSON.stringify({
        artifact_id: artifact.id,
        r2_key: artifact.r2_key,
        filename: artifact.filename,
        media_type: artifact.media_type,
        recommendation_id: recommendationId,
        source_url: sourceUrl,
        pair_id: metadata.pair_id || null,
        artifact_role: metadata.role || null,
        output_contract: 'source_note_v2',
      }),
      idempotencyKey,
    )
    .run()
  const job = await c.env.DB.prepare(`SELECT id,status FROM agent_jobs WHERE idempotency_key=?`)
    .bind(idempotencyKey)
    .first<any>()
  return c.json({ ok: true, status: job?.status || 'pending', job_id: job?.id || jobId }, 202)
})

// Exact metadata lookup includes book/Thread files and does not read R2 content.
app.get('/:id/record', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(
    `SELECT a.id,a.filename,a.media_type,a.size_bytes,a.metadata_json,a.created_at,a.thread_id,a.stage_id,
    r.id owner_id,r.status owner_status,r.deleted_at owner_deleted_at
    FROM artifacts a LEFT JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id') WHERE a.id=?`,
  )
    .bind(id)
    .first<any>()
  if (row) {
    if (hiddenArtifact(row)) return c.json({ error: 'not found' }, 404)
    const {
      metadata_json,
      owner_id: _ownerId,
      owner_status: _ownerStatus,
      owner_deleted_at: _ownerDeletedAt,
      ...artifact
    } = row
    const metadata = parseMetadata(metadata_json)
    return c.json({ artifact: { ...artifact, metadata, quality_assurance: normalizeQualityAssurance(metadata) } })
  }
  const legacy = await c.env.DB.prepare(
    `SELECT id,filename,CASE WHEN lower(filename) LIKE '%.pdf' THEN 'application/pdf' ELSE 'text/html' END media_type,
    length(content) size_bytes,created_at FROM html_files WHERE id=?`,
  )
    .bind(id)
    .first<any>()
  if (!legacy) return c.json({ error: 'not found' }, 404)
  return c.json({ artifact: { ...legacy, legacy: true, metadata: {} } })
})

app.get('/:id/view', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT a.id,a.filename,a.media_type,a.r2_key,a.size_bytes,a.metadata_json,r.id owner_id,r.status owner_status,r.deleted_at owner_deleted_at FROM artifacts a LEFT JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id') WHERE a.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (hiddenArtifact(row)) return c.json({ error: 'not found' }, 404)
  if (!textArtifact(row)) return c.redirect(`/artifacts/${row.id}`)
  if (!c.env.ARTIFACTS || !row.r2_key) return c.json({ error: 'artifact missing' }, 404)
  const object = await c.env.ARTIFACTS.get(row.r2_key)
  if (!object) return c.json({ error: 'artifact missing' }, 404)
  const markdown = await object.text()
  return new Response(markdownToHtml(markdown, row.filename), {
    headers: {
      ...artifactHeaders({
        id: row.id,
        size_bytes: row.size_bytes,
        media_type: 'text/html',
        filename: row.filename,
        metadata_json: row.metadata_json,
      }),
      'content-security-policy': artifactCsp,
    },
  })
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT a.*,r.id owner_id,r.status owner_status,r.deleted_at owner_deleted_at FROM artifacts a LEFT JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id') WHERE a.id=?`,
  )
    .bind(c.req.param('id'))
    .first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (hiddenArtifact(row)) return c.json({ error: 'not found' }, 404)
  if (textArtifact(row)) return c.redirect(`/artifacts/${row.id}/view`)
  if (!c.env.ARTIFACTS || !row.r2_key) return c.json({ artifact: row })
  const object = await c.env.ARTIFACTS.get(row.r2_key)
  if (!object) return c.json({ error: 'artifact missing' }, 404)
  return new Response(object.body, { headers: artifactHeaders(row) })
})

app.get('/pairs/:id/record', async (c) => {
  const pair = await loadCompanionPair(c.env.DB, c.req.param('id'))
  if (!pair) return c.json({ error: 'pair_not_found' }, 404)
  return c.json({ pair: pair.record })
})

app.post('/pairs/:id/retire', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (body?.confirm !== true) return c.json({ error: 'pair_retirement_confirmation_required' }, 400)
  const pair = await loadCompanionPair(c.env.DB, c.req.param('id'))
  if (!pair) return c.json({ error: 'pair_not_found' }, 404)
  if (!pair.record.can_retire) return c.json({ error: 'pair_not_retirable', pair: pair.record }, 409)
  for (const key of ['recommendation_id', 'html_artifact_id', 'pdf_artifact_id'] as const) {
    if (body[key] !== pair.record[key]) return c.json({ error: 'pair_identity_changed', field: key }, 409)
  }
  const retired = await retireCompanionPair(c.env.DB, pair)
  if (!retired?.retired) return c.json({ error: 'pair_retirement_conflict' }, 409)
  return c.json({ ok: true, pair: retired })
})

app.delete('/:id', async (c) => {
  const artifact = await c.env.DB.prepare('SELECT id,r2_key,metadata_json FROM artifacts WHERE id=?')
    .bind(c.req.param('id'))
    .first<any>()
  if (!artifact) return c.json({ error: 'not found' }, 404)
  const pair = await c.env.DB.prepare(
    'SELECT pair_id,corpus_id,state FROM lite_visual_pairs WHERE html_artifact_id=? OR pdf_artifact_id=?',
  )
    .bind(artifact.id, artifact.id)
    .first<any>()
  if (pair)
    return c.json(
      {
        error: 'lite_visual_pair_artifact_is_immutable',
        pair_id: pair.pair_id,
        corpus_id: pair.corpus_id,
        state: pair.state,
      },
      409,
    )
  const metadata = parseMetadata(artifact.metadata_json)
  if (
    metadata.generator === 'lite-visual' &&
    metadata.pair_id &&
    ['html', 'pdf'].includes(String(metadata.role || ''))
  ) {
    return c.json(
      {
        error: 'lite_visual_pair_artifact_is_immutable',
        pair_id: metadata.pair_id,
        corpus_id: metadata.corpus_id || null,
        state: metadata.publication_state || 'legacy',
      },
      409,
    )
  }
  await c.env.DB.prepare('DELETE FROM artifacts WHERE id=?').bind(artifact.id).run()
  if (c.env.ARTIFACTS && artifact.r2_key) await c.env.ARTIFACTS.delete(artifact.r2_key).catch(() => {})
  return c.json({ ok: true })
})

export default app
