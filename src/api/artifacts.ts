import { Hono } from 'hono'
import { mergeArtifactMultipartMetadata, normalizeQualityAssurance, validateArtifactIntegrity } from '../artifact-metadata'
import { Bindings, escapeHtml, safeError } from '../lib'
import { resolveLearningScope } from '../services/learning-scope'

const app = new Hono<{ Bindings: Bindings }>()
const artifactCsp = "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; img-src data: https:; font-src data: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'"

function markdownToHtml(markdown: string, title: string) {
  const inline = (value: string) => escapeHtml(value).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  const output: string[] = []
  let code = false
  let list = false
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (/^```/.test(line)) {
      if (code) { output.push('</code></pre>'); code = false }
      else { output.push('<pre><code>'); code = true }
      continue
    }
    if (code) { output.push(escapeHtml(line) + '\n'); continue }
    if (!line.trim()) { if (list) { output.push('</ul>'); list = false } continue }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) { if (list) { output.push('</ul>'); list = false } output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) { if (!list) { output.push('<ul>'); list = true } output.push(`<li>${inline(bullet[1])}</li>`); continue }
    if (list) { output.push('</ul>'); list = false }
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
    c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,created_at FROM artifacts WHERE thread_id IS NULL AND stage_id IS NULL AND COALESCE(json_extract(metadata_json,'$.scope'),'') != 'book' ORDER BY created_at DESC LIMIT 200`).all(),
    c.env.DB.prepare(`SELECT status,payload_json,error,updated_at FROM agent_jobs WHERE job_type='extract_notes' ORDER BY created_at DESC LIMIT 400`).all<any>(),
  ])
  const jobByArtifact = new Map<string, { status: string; error?: string; updated_at: string }>()
  for (const job of jobs.results || []) {
    try {
      const artifactId = JSON.parse(job.payload_json || '{}').artifact_id
      if (artifactId && !jobByArtifact.has(artifactId)) jobByArtifact.set(artifactId, { status: job.status, error: job.error || undefined, updated_at: job.updated_at })
    } catch { /* ignore malformed legacy payloads */ }
  }
  const legacy = await c.env.DB.prepare(`SELECT id,filename,CASE WHEN lower(filename) LIKE '%.pdf' THEN 'application/pdf' ELSE 'text/html' END media_type,length(content) size_bytes,created_at FROM html_files ORDER BY created_at DESC LIMIT 200`).all()
  const artifacts = (rows.results || []).map((row: any) => {
    try {
      const metadata = JSON.parse(row.metadata_json || '{}')
      return { ...row, metadata, quality_assurance: normalizeQualityAssurance(metadata), metadata_json: undefined, extraction: jobByArtifact.get(row.id) || null }
    }
    catch { return { ...row, metadata: {}, quality_assurance: normalizeQualityAssurance(), metadata_json: undefined, extraction: jobByArtifact.get(row.id) || null } }
  })
  const recIds = [...new Set(artifacts.map((a: any) => a.metadata?.recommendation_id).filter(Boolean))]
  const recDetailsByRec = new Map<string, { notebook_url?: string; video_url?: string }>()
  if (recIds.length) {
    const placeholders = recIds.map(() => '?').join(',')
    const recs = await c.env.DB.prepare(`
      SELECT r.id, r.video_url, r.notebook_url
      FROM recommendations r
      WHERE r.id IN (${placeholders})
    `).bind(...recIds).all<{ id: string; video_url: string; notebook_url: string }>()
    for (const row of recs.results || []) recDetailsByRec.set(row.id, row)
  }
  for (const artifact of artifacts) {
    const recId = artifact.metadata?.recommendation_id
    const rec = recId ? recDetailsByRec.get(recId) : undefined
    artifact.notebook_url = rec?.notebook_url || null
    artifact.source_url = artifact.metadata?.source_url || rec?.video_url || null
    artifact.topic = artifact.metadata?.topic || null
  }
  return c.json({ artifacts: [...artifacts, ...(legacy.results || []).map((row: any) => ({ ...row, legacy: true, metadata: {}, quality_assurance: normalizeQualityAssurance({}, true), notebook_url: null, source_url: null, topic: null }))] })
})

app.get('/hub', async (c) => {
  const threadId = c.req.query('thread_id') || ''
  const stageId = c.req.query('stage_id') || ''
  const rows = threadId
    ? await c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE thread_id=? ORDER BY created_at DESC LIMIT 200`).bind(threadId).all<any>()
    : stageId
      ? await c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE stage_id=? ORDER BY created_at DESC LIMIT 200`).bind(stageId).all<any>()
      : await c.env.DB.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE thread_id IS NOT NULL OR stage_id IS NOT NULL ORDER BY created_at DESC LIMIT 200`).all<any>()
  const files = (rows.results || []).map((row: any) => {
    let metadata: Record<string, unknown> = {}
    try { metadata = JSON.parse(row.metadata_json || '{}') } catch { /* ignore malformed metadata */ }
    return { ...row, metadata, metadata_json: undefined }
  })
  return c.json({ files })
})

app.post('/', async (c) => {
  try {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file required' }, 400)
    let metadata: Record<string, unknown> = {}
    const rawMetadata = form.get('metadata')
    if (typeof rawMetadata === 'string' && rawMetadata.trim()) {
      try {
        const parsed = JSON.parse(rawMetadata)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return c.json({ error: 'metadata must be a JSON object' }, 400)
        metadata = parsed
      }
      catch { return c.json({ error: 'metadata must be valid JSON' }, 400) }
    }
    const validation = mergeArtifactMultipartMetadata(metadata, form, file)
    const bytes = await file.arrayBuffer()
    const integrityFailures = validateArtifactIntegrity(metadata, file, bytes)
    if (!validation.ok || integrityFailures.length) {
      const failures = [...new Set([...(validation.ok ? [] : validation.failures), ...integrityFailures])]
      return c.json({ error: 'artifact_metadata_validation_failed', failures }, 422)
    }
    const threadId = String(metadata.thread_id || '').trim().slice(0, 120) || null
    const stageId = String(metadata.stage_id || '').trim().slice(0, 120) || null
    if (threadId && stageId) return c.json({ error: 'file cannot belong to both a Thread and a Level' }, 400)
    if (threadId || stageId) {
      try { await resolveLearningScope(c.env.DB, threadId ? { kind: 'thread', id: threadId } : { kind: 'level', id: stageId! }) }
      catch (error: any) { return c.json({ error: error?.code || 'invalid_scope', message: error?.message || 'Invalid learning scope.' }, 400) }
    }
    const pairId = String(metadata.pair_id || '')
    const role = String(metadata.role || '').toLowerCase()
    if (pairId && ['html', 'pdf'].includes(role)) {
      const conflict = await c.env.DB.prepare(`SELECT id,metadata_json FROM artifacts WHERE json_extract(metadata_json,'$.pair_id')=?`).bind(pairId).all<any>()
      for (const row of conflict.results || []) {
        let existing: any = {}
        try { existing = JSON.parse(row.metadata_json || '{}') } catch {}
        if (existing.role === role) return c.json({ error: 'artifact_pair_role_exists', pair_id: pairId, role }, 409)
        for (const key of ['recommendation_id', 'source_checksum']) {
          if (existing[key] && metadata[key] && existing[key] !== metadata[key]) return c.json({ error: 'artifact_pair_source_mismatch', pair_id: pairId, field: key }, 409)
        }
      }
    }
    const id = `artifact_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
    const key = `${new Date().toISOString().slice(0, 10)}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    if (c.env.ARTIFACTS) await c.env.ARTIFACTS.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } })
    await c.env.DB.prepare(`INSERT INTO artifacts (id,filename,media_type,r2_key,size_bytes,metadata_json,thread_id,stage_id) VALUES (?,?,?,?,?,?,?,?)`).bind(id, file.name, file.type || 'application/octet-stream', key, file.size, JSON.stringify({ source: 'artifact_upload', ...metadata }), threadId, stageId).run()
    return c.json({ ok: true, id, filename: file.name, r2_key: key, metadata, quality_assurance: normalizeQualityAssurance(metadata) }, 201)
  } catch (error) { return c.json(safeError('Artifact upload failed')(error), 500) }
})

app.post('/:id/process', async (c) => {
  const artifact = await c.env.DB.prepare(`SELECT * FROM artifacts WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!artifact) return c.json({ error: 'not found' }, 404)
  const body: { recommendation_id?: string; source_url?: string } = await c.req.json().catch(() => ({}))
  let metadata: Record<string, any> = {}
  try { metadata = JSON.parse(artifact.metadata_json || '{}') } catch {}
  const recommendationId = body.recommendation_id || metadata.recommendation_id || null
  const sourceUrl = body.source_url || metadata.source_url || null
  const jobId = `job_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`
  const idempotencyKey = `extract-artifact:${artifact.id}`
  const existing = await c.env.DB.prepare(`SELECT id,status FROM agent_jobs WHERE idempotency_key=?`).bind(idempotencyKey).first<{ id: string; status: string }>()
  if (existing?.status === 'failed') {
    await c.env.DB.prepare(`UPDATE agent_jobs SET status='retry',attempts=0,error=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(existing.id).run()
    return c.json({ ok: true, status: 'retry', job_id: existing.id }, 202)
  }
  await c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key)
    VALUES (?,'extract_notes',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(
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
    }),
    idempotencyKey,
  ).run()
  const job = await c.env.DB.prepare(`SELECT id,status FROM agent_jobs WHERE idempotency_key=?`).bind(idempotencyKey).first<any>()
  return c.json({ ok: true, status: job?.status || 'pending', job_id: job?.id || jobId }, 202)
})

app.get('/:id/view', async (c) => {
  const row = await c.env.DB.prepare(`SELECT id,filename,media_type,r2_key FROM artifacts WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!/markdown|text\/plain/i.test(row.media_type || '') && !/\.md$/i.test(row.filename || '')) return c.redirect(`/artifacts/${row.id}`)
  if (!c.env.ARTIFACTS || !row.r2_key) return c.json({ error: 'artifact missing' }, 404)
  const object = await c.env.ARTIFACTS.get(row.r2_key)
  if (!object) return c.json({ error: 'artifact missing' }, 404)
  const markdown = await object.text()
  return new Response(markdownToHtml(markdown, row.filename), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-disposition': `inline; filename="${row.filename.replace(/"/g, '')}"`, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } })
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM artifacts WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (/markdown|text\/plain/i.test(row.media_type || '') || /\.md$/i.test(row.filename || '')) return c.redirect(`/artifacts/${row.id}/view`)
  if (!c.env.ARTIFACTS || !row.r2_key) return c.json({ artifact: row })
  const object = await c.env.ARTIFACTS.get(row.r2_key)
  if (!object) return c.json({ error: 'artifact missing' }, 404)
  const headers: Record<string, string> = { 'content-type': row.media_type, 'content-disposition': `inline; filename="${row.filename.replace(/"/g, '')}"` }
  if (/html/i.test(row.media_type || '') || /\.html?$/i.test(row.filename || '')) headers['content-security-policy'] = artifactCsp
  return new Response(object.body, { headers })
})

app.delete('/:id', async (c) => {
  const artifact = await c.env.DB.prepare('SELECT id,r2_key FROM artifacts WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!artifact) return c.json({ error: 'not found' }, 404)
  if (c.env.ARTIFACTS && artifact.r2_key) await c.env.ARTIFACTS.delete(artifact.r2_key)
  await c.env.DB.prepare('DELETE FROM artifacts WHERE id=?').bind(artifact.id).run()
  return c.json({ ok: true })
})

export default app
