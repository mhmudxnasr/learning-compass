import { Hono } from 'hono'
import { deriveDedupKey, isValidUrl, normalizeSourceUrlIdentity, type Bindings } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()
const locatorTypes = new Set(['web', 'pdf', 'video', 'epub', 'artifact', 'text'])
const clean = (value: unknown, max = 4000) => String(value || '').trim().slice(0, max)
const exactText = (value: unknown) => String(value || '').trim()
const QUOTE_MAX_LENGTH = 10000
const CONTEXT_MAX_LENGTH = 2000
const parseJson = (value: unknown, fallback: any = {}) => {
  try { return JSON.parse(String(value || '')) } catch { return fallback }
}
const makeId = () => `annotation_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const SELECTOR_JSON_MAX_LENGTH = 12000
const serializeSelector = (selector: Record<string, unknown>) => {
  const serialized = stableJson(selector)
  return serialized.length <= SELECTOR_JSON_MAX_LENGTH ? serialized : null
}
const selectorSourceUrls = (selector: Record<string, unknown>) => Array.from(new Set(
  [selector.url, selector.locator].filter(isValidUrl),
))
const selectorSourceIdentities = (selector: Record<string, unknown>) => Array.from(new Set(
  selectorSourceUrls(selector).map(normalizeSourceUrlIdentity),
))
const withoutUrlFragmentSql = (expression: string) => `rtrim(CASE WHEN instr(${expression},'#')>0 THEN substr(${expression},1,instr(${expression},'#')-1) ELSE ${expression} END,'/')`
const sourceUrlIdentityGuard = (rawUrl: string, recommendationAlias = 'r') => {
  const identity = normalizeSourceUrlIdentity(rawUrl)
  const identityDedupKey = deriveDedupKey({ video_url: identity, content_type: 'article' })
  const genericDedupSuffix = /^(?:yt|book)_/.test(identityDedupKey)
    ? null
    : identityDedupKey.slice(identityDedupKey.indexOf('_') + 1)
  return {
    sql: `(${recommendationAlias}.video_url=? OR ${withoutUrlFragmentSql(`${recommendationAlias}.video_url`)}=?
      OR ${recommendationAlias}.dedup_key=?
      OR (? IS NOT NULL AND substr(${recommendationAlias}.dedup_key,instr(${recommendationAlias}.dedup_key,'_')+1)=?)
      OR EXISTS (
      SELECT 1 FROM source_url_replacements identity_history
      WHERE identity_history.recommendation_id=${recommendationAlias}.id AND (
        identity_history.previous_url=? OR identity_history.source_url=?
        OR ${withoutUrlFragmentSql('identity_history.previous_url')}=?
        OR ${withoutUrlFragmentSql('identity_history.source_url')}=?
        OR identity_history.previous_dedup_key=? OR identity_history.source_dedup_key=?
        OR (? IS NOT NULL AND (
          substr(identity_history.previous_dedup_key,instr(identity_history.previous_dedup_key,'_')+1)=?
          OR substr(identity_history.source_dedup_key,instr(identity_history.source_dedup_key,'_')+1)=?
        ))
      )
    ))`,
    binds: [
      rawUrl, identity, identityDedupKey, genericDedupSuffix, genericDedupSuffix,
      rawUrl, rawUrl, identity, identity, identityDedupKey, identityDedupKey,
      genericDedupSuffix, genericDedupSuffix, genericDedupSuffix,
    ],
  }
}
const annotationSelect = `SELECT a.*,r.video_title source_title,r.video_url source_url,r.creator source_creator,
  n.label branch_label,n.status branch_status,n.super_category branch_domain,t.title thread_title
  FROM source_annotations a
  LEFT JOIN recommendations r ON r.id=a.recommendation_id
  LEFT JOIN tree_nodes n ON n.id=a.branch_id
  LEFT JOIN learning_threads t ON t.id=a.thread_id`
const mutableAnnotationSelect = `SELECT a.*,r.video_title source_title,r.video_url source_url,r.creator source_creator,
  b.label branch_label,b.status branch_status,b.super_category branch_domain,t.title thread_title
  FROM source_annotations a
  JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
  JOIN recommendation_meta m ON m.recommendation_id=r.id AND a.branch_id=m.branch_id
  JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
  JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
  LEFT JOIN learning_threads t ON t.id=a.thread_id`

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const evidenceText = (input: { recommendation_id: string; locator_type: string; selector: Record<string, unknown>; quote: string; context_before?: string | null; context_after?: string | null }) => stableJson({
  recommendation_id: input.recommendation_id,
  locator_type: input.locator_type,
  selector: input.selector,
  quote: input.quote,
  context_before: input.context_before || null,
  context_after: input.context_after || null,
})

export async function annotationEvidenceChecksum(input: { recommendation_id: string; locator_type: string; selector: Record<string, unknown>; quote: string; context_before?: string | null; context_after?: string | null }) {
  const bytes = new TextEncoder().encode(evidenceText(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function syncSearchProjection(DB: Bindings['DB'], id: string, status: 'active' | 'archived', text = '') {
  try {
    if (status === 'archived') await DB.prepare("DELETE FROM search_idx WHERE source='annotation' AND ref_id=?").bind(id).run()
    else await DB.prepare("INSERT OR REPLACE INTO search_idx(source,ref_id,text) VALUES ('annotation',?,?)").bind(id, text).run()
  } catch { /* Maintenance rebuilds the portable projection on older local databases. */ }
}

async function resolveSourceByUrl(DB: Bindings['DB'], rawUrl: string) {
  if (!isValidUrl(rawUrl)) return null
  // A browser selection often carries an in-page fragment. Preserve that
  // fragment in the annotation selector, but remove it only for source identity.
  const normalized = normalizeSourceUrlIdentity(rawUrl)
  const canonicalDedupKey = deriveDedupKey({ video_url: normalized, content_type: 'article' })
  // Generic recommendation keys prefix the same host/path identity with the
  // first four content-type characters. Match the suffix as well so an older
  // record still resolves after its type was corrected. YouTube/ISBN keys are
  // already type-independent and must remain exact matches.
  const genericDedupSuffix = /^(?:yt|book)_/.test(canonicalDedupKey)
    ? null
    : canonicalDedupKey.slice(canonicalDedupKey.indexOf('_') + 1)
  return DB.prepare(`SELECT r.id,r.video_title,r.video_url,r.creator,r.content_type,m.branch_id,n.label branch_label,n.status branch_status,n.super_category branch_domain,
    d.id branch_domain_verified,
    COALESCE(
      (SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads lt ON lt.id=ts.thread_id
        WHERE ts.recommendation_id=r.id AND ts.status!='removed' AND lt.superseded_at IS NULL ORDER BY CASE lt.status WHEN 'active' THEN 0 ELSE 1 END,lt.updated_at DESC LIMIT 1),
      (SELECT s.thread_id FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id JOIN learning_threads lt ON lt.id=s.thread_id
        WHERE ps.recommendation_id=r.id AND lt.superseded_at IS NULL ORDER BY CASE lt.status WHEN 'active' THEN 0 ELSE 1 END,lt.updated_at DESC LIMIT 1),
      (SELECT l.thread_id FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id JOIN learning_threads lt ON lt.id=l.thread_id
        WHERE ls.recommendation_id=r.id AND lt.superseded_at IS NULL ORDER BY CASE lt.status WHEN 'active' THEN 0 ELSE 1 END,lt.updated_at DESC LIMIT 1)
    ) thread_id
    FROM recommendations r
    LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
    LEFT JOIN tree_nodes n ON n.id=m.branch_id AND n.type IN ('branch','leaf') AND lower(COALESCE(n.status,''))!='pruned'
    LEFT JOIN tree_nodes d ON d.id=n.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
    WHERE r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted' AND (r.video_url=? OR r.video_url=? OR json_extract(m.source_metadata_json,'$.raw_source')=? OR json_extract(m.source_metadata_json,'$.raw_source')=?
      OR r.dedup_key=?
      OR (? IS NOT NULL AND substr(r.dedup_key,instr(r.dedup_key,'_')+1)=?)
      OR EXISTS (SELECT 1 FROM source_url_replacements h WHERE h.recommendation_id=r.id AND (
        h.previous_url IN (?,?) OR h.source_url IN (?,?)
        OR h.previous_dedup_key=? OR h.source_dedup_key=?
        OR (? IS NOT NULL AND (substr(h.previous_dedup_key,instr(h.previous_dedup_key,'_')+1)=?
          OR substr(h.source_dedup_key,instr(h.source_dedup_key,'_')+1)=?)))))
    ORDER BY CASE WHEN r.video_url=? THEN 0 WHEN r.video_url=? THEN 1 ELSE 2 END,r.updated_at DESC LIMIT 1`)
    .bind(
      rawUrl, normalized, rawUrl, normalized,
      canonicalDedupKey, genericDedupSuffix, genericDedupSuffix,
      rawUrl, normalized, rawUrl, normalized,
      canonicalDedupKey, canonicalDedupKey,
      genericDedupSuffix, genericDedupSuffix, genericDedupSuffix,
      rawUrl, normalized,
    ).first<any>()
}

async function selectorUrlsBelongToRecommendation(DB: Bindings['DB'], recommendationId: string, urls: string[]) {
  const resolved = await Promise.all(urls.map((url) => resolveSourceByUrl(DB, url)))
  return resolved.every((source) => source?.id === recommendationId)
}

async function withDerivations(DB: Bindings['DB'], row: any) {
  if (!row) return null
  const [units, notes, drafts] = await Promise.all([
    DB.prepare(`SELECT u.id,u.unit_type,u.statement,u.status,u.confidence
      FROM unit_anchors a JOIN learning_units u ON u.id=a.unit_id
      WHERE a.annotation_id=? ORDER BY u.updated_at DESC`).bind(row.id).all<any>(),
    DB.prepare(`SELECT n.id,n.title,n.kind,n.status,n.provenance_json FROM notes n
      WHERE EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(n.provenance_json) THEN n.provenance_json ELSE '[]' END) p
        WHERE json_extract(p.value,'$.annotation_id')=?)
      ORDER BY n.updated_at DESC LIMIT 50`).bind(row.id).all<any>(),
    DB.prepare(`SELECT d.id,d.question,d.answer,d.status,d.provenance_json FROM srs_drafts d
      WHERE EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(d.provenance_json) THEN d.provenance_json ELSE '[]' END) p
        WHERE json_extract(p.value,'$.annotation_id')=?)
      ORDER BY d.updated_at DESC LIMIT 50`).bind(row.id).all<any>(),
  ])
  return {
    ...row,
    selector: parseJson(row.selector_json),
    selector_json: undefined,
    selector_source_identities_json: undefined,
    derivations: {
      units: units.results || [],
      notes: (notes.results || []).map((item: any) => ({ ...item, provenance: parseJson(item.provenance_json, []), provenance_json: undefined })),
      recall_drafts: (drafts.results || []).map((item: any) => ({ ...item, provenance: parseJson(item.provenance_json, []), provenance_json: undefined })),
    },
  }
}

app.get('/', async (c) => {
  const recommendationId = clean(c.req.query('recommendation_id'), 120)
  const threadId = clean(c.req.query('thread_id'), 120)
  const branchId = clean(c.req.query('branch_id'), 120)
  const status = c.req.query('status') === 'archived' ? 'archived' : 'active'
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') || 50)))
  const clauses = ['status=?']
  const binds: any[] = [status]
  if (recommendationId) { clauses.push('recommendation_id=?'); binds.push(recommendationId) }
  if (threadId) { clauses.push('thread_id=?'); binds.push(threadId) }
  if (branchId) { clauses.push('branch_id=?'); binds.push(branchId) }
  const rows = await c.env.DB.prepare(`${annotationSelect} WHERE ${clauses.map((clause) => `a.${clause}`).join(' AND ')} ORDER BY a.created_at DESC LIMIT ?`).bind(...binds, limit).all<any>()
  return c.json({ annotations: await Promise.all((rows.results || []).map((row: any) => withDerivations(c.env.DB, row))) })
})

app.get('/resolve', async (c) => {
  const sourceUrl = clean(c.req.query('source_url'), 2048)
  if (!isValidUrl(sourceUrl)) return c.json({ error: 'valid source_url required' }, 400)
  const source = await resolveSourceByUrl(c.env.DB, sourceUrl)
  if (!source) return c.json({ found: false, source_url: sourceUrl })
  return c.json({
    found: true,
    source: {
      id: source.id,
      title: source.video_title,
      url: source.video_url,
      creator: source.creator,
      content_type: source.content_type,
      branch_id: source.branch_id,
      branch_label: source.branch_label,
      branch_status: source.branch_status,
      branch_domain: source.branch_domain,
      branch_verified: Boolean(source.branch_id && source.branch_domain_verified),
      thread_id: source.thread_id,
    },
  })
})

app.post('/', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const recommendationId = clean(body.recommendation_id, 120)
  const locatorType = clean(body.locator_type, 20)
  const quote = exactText(body.quote)
  const rawContextBefore = exactText(body.context_before)
  const rawContextAfter = exactText(body.context_after)
  if (quote.length > QUOTE_MAX_LENGTH) return c.json({ error: 'quote_too_large', message: `quote must contain at most ${QUOTE_MAX_LENGTH} characters` }, 400)
  if (rawContextBefore.length > CONTEXT_MAX_LENGTH || rawContextAfter.length > CONTEXT_MAX_LENGTH) {
    return c.json({ error: 'context_too_large', message: `each context window must contain at most ${CONTEXT_MAX_LENGTH} characters` }, 400)
  }
  if (!recommendationId || !locatorTypes.has(locatorType) || !quote) return c.json({ error: 'recommendation_id, locator_type, and quote are required' }, 400)
  const metadata = body.selector && typeof body.selector === 'object' && !Array.isArray(body.selector) ? body.selector : {}
  const selectorJson = serializeSelector(metadata)
  if (!selectorJson) return c.json({ error: 'selector_too_large', message: `selector must serialize to at most ${SELECTOR_JSON_MAX_LENGTH} characters` }, 400)
  const selectorUrls = selectorSourceUrls(metadata)
  const selectorIdentitiesJson = JSON.stringify(selectorSourceIdentities(metadata))
  const artifactId = body.artifact_id ? clean(body.artifact_id, 120) : null

  const [source, artifact] = await Promise.all([
    c.env.DB.prepare(`SELECT r.id,r.video_url,m.branch_id,
      COALESCE(
        (SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads lt ON lt.id=ts.thread_id WHERE ts.recommendation_id=r.id AND ts.status!='removed' AND lt.superseded_at IS NULL ORDER BY CASE lt.status WHEN 'active' THEN 0 ELSE 1 END,lt.updated_at DESC LIMIT 1),
        (SELECT s.thread_id FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id JOIN learning_threads lt ON lt.id=s.thread_id WHERE ps.recommendation_id=r.id AND lt.superseded_at IS NULL ORDER BY CASE lt.status WHEN 'active' THEN 0 ELSE 1 END,lt.updated_at DESC LIMIT 1),
        (SELECT l.thread_id FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id JOIN learning_threads lt ON lt.id=l.thread_id WHERE ls.recommendation_id=r.id AND lt.superseded_at IS NULL ORDER BY CASE lt.status WHEN 'active' THEN 0 ELSE 1 END,lt.updated_at DESC LIMIT 1)
      ) thread_id
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.id=? AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'`).bind(recommendationId).first<any>(),
    artifactId ? c.env.DB.prepare(`SELECT id FROM artifacts WHERE id=? AND json_extract(metadata_json,'$.recommendation_id')=?`).bind(artifactId, recommendationId).first<any>() : Promise.resolve(null),
  ])
  if (!source) return c.json({ error: 'source not found' }, 404)
  if (selectorUrls.length && !(await selectorUrlsBelongToRecommendation(c.env.DB, recommendationId, selectorUrls))) {
    return c.json({ error: 'annotation_source_url_mismatch', message: 'The selector URL does not belong to this source or its verified replacement lineage.' }, 409)
  }
  const branchId = clean(source.branch_id, 120)
  const threadId = clean(body.thread_id, 120) || clean(source.thread_id, 120)
  if (!branchId) return c.json({ error: 'source_branch_required', message: 'Map the source to a reviewed branch before anchoring evidence.' }, 409)
  if (body.branch_id && clean(body.branch_id, 120) !== branchId) return c.json({ error: 'annotation branch does not match source ownership' }, 409)
  const [thread, branch] = await Promise.all([
    threadId ? c.env.DB.prepare(`SELECT t.id FROM learning_threads t
      WHERE t.id=? AND t.superseded_at IS NULL AND (
        EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id=t.id AND ts.recommendation_id=? AND ts.status!='removed')
        OR EXISTS (SELECT 1 FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id WHERE s.thread_id=t.id AND ps.recommendation_id=?)
        OR EXISTS (SELECT 1 FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id WHERE l.thread_id=t.id AND ls.recommendation_id=?))`).bind(threadId, recommendationId, recommendationId, recommendationId).first<any>() : Promise.resolve(null),
    branchId ? c.env.DB.prepare(`SELECT b.id,b.status,b.super_category,d.id domain_id FROM tree_nodes b
      JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
      WHERE b.id=? AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'`).bind(branchId).first<any>() : Promise.resolve(null),
  ])
  if (artifactId && !artifact) return c.json({ error: 'artifact not found' }, 404)
  if (threadId && !thread) return c.json({ error: 'thread is not attached to this source' }, 409)
  if (branchId && !branch) return c.json({ error: 'branch not found' }, 404)

  const contextBefore = rawContextBefore || null
  const contextAfter = rawContextAfter || null
  const language = clean(body.language, 40) || null
  const checksum = await annotationEvidenceChecksum({ recommendation_id: recommendationId, locator_type: locatorType, selector: metadata, quote, context_before: contextBefore, context_after: contextAfter })
  const id = clean(body.id, 120) || makeId()
  const urlGuards = selectorUrls.map((url) => sourceUrlIdentityGuard(url))
  const inserted = await c.env.DB.prepare(`INSERT INTO source_annotations
    (id,recommendation_id,artifact_id,thread_id,branch_id,locator_type,selector_json,selector_source_identities_json,quote,context_before,context_after,language,source_checksum,created_by,status)
    SELECT ?,r.id,?,?,m.branch_id,?,?,?,?,?,?,?,?,?,'active'
    FROM recommendations r
    JOIN recommendation_meta m ON m.recommendation_id=r.id
    JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
    JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
    WHERE r.id=? AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted' AND m.branch_id=?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM artifacts ar WHERE ar.id=? AND json_extract(ar.metadata_json,'$.recommendation_id')=r.id))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM learning_threads lt WHERE lt.id=? AND lt.superseded_at IS NULL AND (
        EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id=lt.id AND ts.recommendation_id=r.id AND ts.status!='removed')
        OR EXISTS (SELECT 1 FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id WHERE s.thread_id=lt.id AND ps.recommendation_id=r.id)
        OR EXISTS (SELECT 1 FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id WHERE l.thread_id=lt.id AND ls.recommendation_id=r.id)
      )))
      ${urlGuards.map((guard) => `AND ${guard.sql}`).join('\n      ')}`).bind(
    id, artifactId, threadId || null, locatorType, selectorJson, selectorIdentitiesJson, quote,
    contextBefore, contextAfter, language, checksum, ['agent', 'system'].includes(body.created_by) ? body.created_by : 'user',
    recommendationId, branchId,
    artifactId, artifactId, threadId || null, threadId || null,
    ...urlGuards.flatMap((guard) => guard.binds),
  ).run()
  if (!inserted.meta.changes) return c.json({ error: 'annotation_ownership_conflict', message: 'The source, branch, Thread, artifact, or selector URL changed before this anchor could be saved. Reload and try again.' }, 409)
  await syncSearchProjection(c.env.DB, id, 'active', [quote, contextBefore, contextAfter, language].filter(Boolean).join(' '))
  const row = await c.env.DB.prepare(`${annotationSelect} WHERE a.id=?`).bind(id).first<any>()
  return c.json({ ok: true, annotation: await withDerivations(c.env.DB, row) }, 201)
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`${annotationSelect} WHERE a.id=?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'annotation not found' }, 404)
  return c.json({ annotation: await withDerivations(c.env.DB, row) })
})

app.patch('/:id', async (c) => {
  const current = await c.env.DB.prepare(`${mutableAnnotationSelect} WHERE a.id=? AND a.status='active'`).bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error: 'active annotation not found' }, 404)
  const body = await c.req.json<any>().catch(() => ({}))
  const locatorType = body.locator_type === undefined ? current.locator_type : clean(body.locator_type, 20)
  const suppliedQuote = body.quote === undefined ? null : exactText(body.quote)
  const suppliedContextBefore = body.context_before === undefined ? null : exactText(body.context_before)
  const suppliedContextAfter = body.context_after === undefined ? null : exactText(body.context_after)
  if (suppliedQuote !== null && suppliedQuote.length > QUOTE_MAX_LENGTH) return c.json({ error: 'quote_too_large', message: `quote must contain at most ${QUOTE_MAX_LENGTH} characters` }, 400)
  if ((suppliedContextBefore !== null && suppliedContextBefore.length > CONTEXT_MAX_LENGTH)
    || (suppliedContextAfter !== null && suppliedContextAfter.length > CONTEXT_MAX_LENGTH)) {
    return c.json({ error: 'context_too_large', message: `each context window must contain at most ${CONTEXT_MAX_LENGTH} characters` }, 400)
  }
  const quote = suppliedQuote === null ? current.quote : suppliedQuote
  if (!locatorTypes.has(locatorType) || !quote) return c.json({ error: 'valid locator_type and quote are required' }, 400)
  const selector = body.selector === undefined
    ? parseJson(current.selector_json)
    : body.selector && typeof body.selector === 'object' && !Array.isArray(body.selector) ? body.selector : null
  if (!selector) return c.json({ error: 'selector must be an object' }, 400)
  const selectorJson = serializeSelector(selector)
  if (!selectorJson) return c.json({ error: 'selector_too_large', message: `selector must serialize to at most ${SELECTOR_JSON_MAX_LENGTH} characters` }, 400)
  const selectorUrls = selectorSourceUrls(selector)
  const selectorIdentitiesJson = JSON.stringify(selectorSourceIdentities(selector))
  if (selectorUrls.length && !(await selectorUrlsBelongToRecommendation(c.env.DB, current.recommendation_id, selectorUrls))) {
    return c.json({ error: 'annotation_source_url_mismatch', message: 'The selector URL does not belong to this source or its verified replacement lineage.' }, 409)
  }
  const contextBefore = suppliedContextBefore === null ? current.context_before : suppliedContextBefore || null
  const contextAfter = suppliedContextAfter === null ? current.context_after : suppliedContextAfter || null
  const language = body.language === undefined ? current.language : clean(body.language, 40) || null
  const checksum = await annotationEvidenceChecksum({ recommendation_id: current.recommendation_id, locator_type: locatorType, selector, quote, context_before: contextBefore, context_after: contextAfter })
  const urlGuards = selectorUrls.map((url) => sourceUrlIdentityGuard(url))
  if (checksum !== current.source_checksum) {
    const nextId = makeId()
    const [revisionInsert, previousArchive] = await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO source_annotations
        (id,recommendation_id,artifact_id,thread_id,branch_id,locator_type,selector_json,selector_source_identities_json,quote,context_before,context_after,language,source_checksum,created_by,status,revision_of_annotation_id)
        SELECT ?,a.recommendation_id,a.artifact_id,a.thread_id,a.branch_id,?,?,?,?,?,?,?,?,a.created_by,'active',?
        FROM source_annotations a
        JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
        JOIN recommendation_meta m ON m.recommendation_id=r.id AND a.branch_id=m.branch_id
        JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
        JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
        WHERE a.id=? AND a.status='active' AND a.source_checksum=?
          AND (a.artifact_id IS NULL OR EXISTS (SELECT 1 FROM artifacts ar WHERE ar.id=a.artifact_id AND json_extract(ar.metadata_json,'$.recommendation_id')=r.id))
          AND (a.thread_id IS NULL OR EXISTS (SELECT 1 FROM learning_threads lt WHERE lt.id=a.thread_id AND lt.superseded_at IS NULL AND (
            EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id=lt.id AND ts.recommendation_id=r.id AND ts.status!='removed')
            OR EXISTS (SELECT 1 FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id WHERE s.thread_id=lt.id AND ps.recommendation_id=r.id)
            OR EXISTS (SELECT 1 FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id WHERE l.thread_id=lt.id AND ls.recommendation_id=r.id)
          )))
          ${urlGuards.map((guard) => `AND ${guard.sql}`).join('\n          ')}`).bind(
        nextId, locatorType, selectorJson, selectorIdentitiesJson, quote, contextBefore, contextAfter, language, checksum,
        current.id, current.id, current.source_checksum,
        ...urlGuards.flatMap((guard) => guard.binds),
      ),
      c.env.DB.prepare(`UPDATE source_annotations SET status='archived',updated_at=datetime('now')
        WHERE id=? AND status='active' AND source_checksum=?
          AND EXISTS (SELECT 1 FROM source_annotations revision WHERE revision.id=? AND revision.revision_of_annotation_id=?)`)
        .bind(current.id, current.source_checksum, nextId, current.id),
    ])
    if (!revisionInsert.meta.changes || !previousArchive.meta.changes) {
      return c.json({ error: 'annotation_revision_conflict', message: 'This anchor changed while it was being revised. Reload the source dossier and try again.' }, 409)
    }
    const row = await c.env.DB.prepare(`${annotationSelect} WHERE a.id=?`).bind(nextId).first<any>()
    if (!row) return c.json({ error: 'annotation_revision_conflict', message: 'This anchor changed while it was being revised. Reload the source dossier and try again.' }, 409)
    await Promise.all([
      syncSearchProjection(c.env.DB, current.id, 'archived'),
      syncSearchProjection(c.env.DB, nextId, 'active', [quote, contextBefore, contextAfter, language].filter(Boolean).join(' ')),
    ])
    return c.json({ ok: true, revised: true, previous_annotation_id: current.id, annotation: await withDerivations(c.env.DB, row) })
  }
  const updated = await c.env.DB.prepare(`UPDATE source_annotations SET locator_type=?,selector_json=?,selector_source_identities_json=?,quote=?,context_before=?,context_after=?,language=?,source_checksum=?,updated_at=datetime('now')
    WHERE id=? AND status='active' AND source_checksum=?
      AND EXISTS (
        SELECT 1 FROM recommendations r
        JOIN recommendation_meta m ON m.recommendation_id=r.id AND m.branch_id=source_annotations.branch_id
        JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
        JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
        WHERE r.id=source_annotations.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
          AND (source_annotations.artifact_id IS NULL OR EXISTS (SELECT 1 FROM artifacts ar WHERE ar.id=source_annotations.artifact_id AND json_extract(ar.metadata_json,'$.recommendation_id')=r.id))
          AND (source_annotations.thread_id IS NULL OR EXISTS (SELECT 1 FROM learning_threads lt WHERE lt.id=source_annotations.thread_id AND lt.superseded_at IS NULL AND (
            EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id=lt.id AND ts.recommendation_id=r.id AND ts.status!='removed')
            OR EXISTS (SELECT 1 FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id WHERE s.thread_id=lt.id AND ps.recommendation_id=r.id)
            OR EXISTS (SELECT 1 FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id WHERE l.thread_id=lt.id AND ls.recommendation_id=r.id)
          )))
          ${urlGuards.map((guard) => `AND ${guard.sql}`).join('\n          ')}
      )`).bind(
    locatorType, selectorJson, selectorIdentitiesJson, quote, contextBefore, contextAfter, language, checksum, current.id, current.source_checksum,
    ...urlGuards.flatMap((guard) => guard.binds),
  ).run()
  if (!updated.meta.changes) return c.json({ error: 'annotation_revision_conflict', message: 'This anchor changed while it was being updated. Reload the source dossier and try again.' }, 409)
  await syncSearchProjection(c.env.DB, current.id, 'active', [quote, contextBefore, contextAfter, language].filter(Boolean).join(' '))
  const row = await c.env.DB.prepare(`${annotationSelect} WHERE a.id=? AND a.status='active'`).bind(current.id).first<any>()
  return c.json({ ok: true, annotation: await withDerivations(c.env.DB, row) })
})

app.post('/:id/archive', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE source_annotations SET status='archived',updated_at=datetime('now') WHERE id=? AND status='active'`).bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: 'active annotation not found' }, 404)
  await syncSearchProjection(c.env.DB, c.req.param('id'), 'archived')
  const row = await c.env.DB.prepare(`${annotationSelect} WHERE a.id=?`).bind(c.req.param('id')).first<any>()
  return c.json({ ok: true, annotation: await withDerivations(c.env.DB, row) })
})

export default app
