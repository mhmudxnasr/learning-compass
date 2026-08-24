import { Hono } from 'hono'
import { Bindings, isValidUrl, safeError } from '../lib'
import { createCapture } from '../services/capture'

const app = new Hono<{ Bindings: Bindings }>()
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const clean = (value: unknown, max = 4000) => String(value || '').trim().slice(0, max)
const roles = new Set(['foundation', 'representative', 'boundary'])
const curationStates = new Set(['unmapped', 'curating', 'complete'])
const validationStates = new Set(['untested', 'exploring', 'field_tested'])
const editorialStates = new Set(['draft', 'reviewed', 'approved'])

const slugify = (value: unknown) => clean(value, 120)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

async function verifiedBranch(db: D1Database, id: string) {
  return db.prepare(`SELECT id,label,status,type FROM tree_nodes WHERE id=? AND COALESCE(status,'')!='pruned' AND type IN ('root','category','branch','leaf')`).bind(id).first<any>()
}

async function loadDomain(db: D1Database, idOrSlug: string) {
  return db.prepare(`SELECT d.*,n.label branch_label,n.status branch_status,n.round_label branch_round,
      p.title family_title,p.slug family_slug
    FROM canon_domains d
    LEFT JOIN tree_nodes n ON n.id=d.branch_id
    LEFT JOIN canon_domains p ON p.id=d.parent_id
    WHERE d.id=? OR d.slug=? LIMIT 1`).bind(idOrSlug, idOrSlug).first<any>()
}

const dossierFields = ['title', 'author', 'why_slot', 'beginner_case', 'expert_case', 'unique_contribution', 'limitations', 'difficulty', 'rejected_alternative', 'rejection_reason'] as const

function entryInput(body: any) {
  const entry: Record<string, any> = {}
  for (const field of dossierFields) entry[field] = clean(body?.[field], field === 'title' || field === 'author' ? 500 : 6000)
  entry.canonical_url = clean(body?.canonical_url, 2000) || null
  entry.isbn = clean(body?.isbn, 80) || null
  entry.editorial_status = editorialStates.has(body?.editorial_status) ? body.editorial_status : 'draft'
  entry.validation_state = validationStates.has(body?.validation_state) ? body.validation_state : 'untested'
  entry.recommendation_id = clean(body?.recommendation_id, 120) || null
  entry.evidence = Array.isArray(body?.evidence) ? body.evidence.slice(0, 30) : []
  return entry
}

function validateEntry(entry: Record<string, any>) {
  const missing = dossierFields.filter((field) => !entry[field])
  if (missing.length) return `missing dossier fields: ${missing.join(', ')}`
  if (entry.canonical_url && !isValidUrl(entry.canonical_url)) return 'canonical_url must be a valid http(s) URL'
  if (entry.editorial_status === 'approved' && !entry.canonical_url && !entry.isbn) return 'approved entries require a canonical URL or ISBN'
  if (entry.editorial_status === 'approved' && entry.evidence.length === 0) return 'approved entries require selection evidence'
  return ''
}

app.get('/', async (c) => {
  try {
    const atlas = await c.env.DB.prepare(`SELECT * FROM canon_atlases ORDER BY created_at LIMIT 1`).first<any>()
    if (!atlas) return c.json({ atlas: null, families: [], domains: [], counts: { domains: 0, unmapped: 0, curating: 0, complete: 0, field_tested: 0 } })
    const query = clean(c.req.query('q'), 200).toLowerCase()
    const status = clean(c.req.query('status'), 30)
    const family = clean(c.req.query('family'), 120)
    const validation = clean(c.req.query('validation'), 30)
    const params: any[] = [atlas.id]
    const filters: string[] = []
    if (query) { filters.push(`(LOWER(d.title) LIKE ? OR LOWER(d.boundary) LIKE ? OR EXISTS (SELECT 1 FROM canon_entries e WHERE e.domain_id=d.id AND (LOWER(e.title) LIKE ? OR LOWER(e.author) LIKE ?)))`); params.push(...Array(4).fill(`%${query}%`)) }
    if (curationStates.has(status)) { filters.push(`d.curation_status=?`); params.push(status) }
    if (validationStates.has(validation)) { filters.push(`d.validation_state=?`); params.push(validation) }
    if (family) { filters.push(`(d.parent_id=? OR d.id=?)`); params.push(family, family) }
    const rows = await c.env.DB.prepare(`SELECT d.*,n.label branch_label,n.status branch_status,n.round_label branch_round,
        p.title family_title,p.slug family_slug,
        (SELECT COUNT(*) FROM canon_entries e WHERE e.domain_id=d.id) entry_count,
        (SELECT e.title FROM canon_entries e WHERE e.domain_id=d.id AND e.role='foundation' LIMIT 1) entry_foundation_title,
        (SELECT e.title FROM canon_entries e WHERE e.domain_id=d.id AND e.role='representative' LIMIT 1) entry_representative_title,
        (SELECT e.title FROM canon_entries e WHERE e.domain_id=d.id AND e.role='boundary' LIMIT 1) entry_boundary_title,
        (SELECT GROUP_CONCAT(e.title,'\u001f') FROM canon_entries e WHERE e.domain_id=d.id ORDER BY CASE e.role WHEN 'foundation' THEN 0 WHEN 'representative' THEN 1 ELSE 2 END) entry_titles
      FROM canon_domains d
      LEFT JOIN tree_nodes n ON n.id=d.branch_id
      LEFT JOIN canon_domains p ON p.id=d.parent_id
      WHERE d.atlas_id=? AND (d.kind='family' OR (d.kind='domain' AND ${filters.length ? filters.join(' AND ') : '1=1'}))
      ORDER BY CASE d.kind WHEN 'family' THEN 0 ELSE 1 END,COALESCE(p.sort_order,d.sort_order),d.sort_order,d.title`).bind(...params).all<any>()
    const all = (rows.results || []).map((row: any) => {
      const { entry_foundation_title, entry_representative_title, entry_boundary_title, ...domain } = row
      return {
        ...domain,
        entry_count: Number(row.entry_count || 0),
        entry_titles: row.entry_titles ? String(row.entry_titles).split('\u001f') : [],
        entry_roles: {
          foundation: entry_foundation_title || null,
          representative: entry_representative_title || null,
          boundary: entry_boundary_title || null,
        },
      }
    })
    const counts = await c.env.DB.prepare(`SELECT COUNT(*) domains,
        SUM(CASE WHEN curation_status='unmapped' THEN 1 ELSE 0 END) unmapped,
        SUM(CASE WHEN curation_status='curating' THEN 1 ELSE 0 END) curating,
        SUM(CASE WHEN curation_status='complete' THEN 1 ELSE 0 END) complete,
        SUM(CASE WHEN validation_state='field_tested' THEN 1 ELSE 0 END) field_tested
      FROM canon_domains WHERE atlas_id=? AND kind='domain'`).bind(atlas.id).first<any>()
    return c.json({ atlas, families: all.filter((row: any) => row.kind === 'family'), domains: all.filter((row: any) => row.kind === 'domain'), counts: Object.fromEntries(Object.entries(counts || {}).map(([key, value]) => [key, Number(value || 0)])) })
  } catch (error) { return c.json(safeError('Canon atlas failed')(error), 500) }
})

app.get('/domains/:id', async (c) => {
  try {
    const domain = await loadDomain(c.env.DB, c.req.param('id'))
    if (!domain) return c.json({ error: 'Canon domain not found' }, 404)
    const [entries, revisions] = await Promise.all([
      c.env.DB.prepare(`SELECT e.*,r.status recommendation_status,r.video_url recommendation_url,
          CASE WHEN r.status='consumed' OR EXISTS (SELECT 1 FROM mastered m WHERE m.kind='book' AND LOWER(m.label)=LOWER(e.title)) THEN 1 ELSE 0 END consumed,
          CASE WHEN EXISTS (SELECT 1 FROM blacklist b WHERE LOWER(COALESCE(b.work,b.name))=LOWER(e.title) OR (LOWER(b.name)=LOWER(e.author) AND COALESCE(b.work,'')='')) THEN 1 ELSE 0 END blacklisted
        FROM canon_entries e LEFT JOIN recommendations r ON r.id=e.recommendation_id
        WHERE e.domain_id=? ORDER BY CASE e.role WHEN 'foundation' THEN 0 WHEN 'representative' THEN 1 ELSE 2 END`).bind(domain.id).all<any>(),
      c.env.DB.prepare(`SELECT id,entry_id,role,previous_json,replacement_reason,replaced_at FROM canon_entry_revisions WHERE domain_id=? ORDER BY replaced_at DESC LIMIT 50`).bind(domain.id).all<any>(),
    ])
    return c.json({ domain, entries: (entries.results || []).map((row: any) => ({ ...row, evidence: JSON.parse(row.evidence_json || '[]'), evidence_json: undefined, consumed: Boolean(row.consumed), blacklisted: Boolean(row.blacklisted) })), revisions: (revisions.results || []).map((row: any) => ({ ...row, previous: JSON.parse(row.previous_json), previous_json: undefined })) })
  } catch (error) { return c.json(safeError('Canon domain failed')(error), 500) }
})

app.get('/entries/:id', async (c) => {
  try {
    const entry = await c.env.DB.prepare(`SELECT e.*,d.title domain_title,d.slug domain_slug,d.branch_id,n.label branch_label,n.status branch_status,r.status recommendation_status
      FROM canon_entries e JOIN canon_domains d ON d.id=e.domain_id
      LEFT JOIN tree_nodes n ON n.id=d.branch_id LEFT JOIN recommendations r ON r.id=e.recommendation_id
      WHERE e.id=?`).bind(c.req.param('id')).first<any>()
    if (!entry) return c.json({ error: 'Canon entry not found' }, 404)
    return c.json({ entry: { ...entry, evidence: JSON.parse(entry.evidence_json || '[]'), evidence_json: undefined } })
  } catch (error) { return c.json(safeError('Canon entry failed')(error), 500) }
})

app.post('/domains', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const atlas = await c.env.DB.prepare(`SELECT id FROM canon_atlases ORDER BY created_at LIMIT 1`).first<any>()
    const title = clean(body.title, 500)
    const slug = slugify(body.slug || title)
    const branchId = clean(body.branch_id, 120)
    const boundary = clean(body.boundary, 6000)
    if (!atlas || !title || !slug || !branchId || !boundary) return c.json({ error: 'atlas, title, slug, branch_id, and boundary are required' }, 400)
    if (!await verifiedBranch(c.env.DB, branchId)) return c.json({ error: 'verified non-pruned branch required' }, 409)
    const kind = body.kind === 'family' ? 'family' : 'domain'
    const parentId = clean(body.parent_id, 120) || null
    if (kind === 'domain' && !parentId) return c.json({ error: 'domains require a family parent_id' }, 400)
    if (parentId) {
      const parent = await c.env.DB.prepare(`SELECT id FROM canon_domains WHERE id=? AND atlas_id=? AND kind='family'`).bind(parentId, atlas.id).first()
      if (!parent) return c.json({ error: 'Canon family not found' }, 404)
    }
    const id = clean(body.id, 120) || makeId('canon_domain')
    await c.env.DB.prepare(`INSERT INTO canon_domains (id,atlas_id,slug,kind,parent_id,branch_id,title,boundary,orientation,curation_status,validation_state,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, atlas.id, slug, kind, parentId, branchId, title, boundary, clean(body.orientation, 6000) || null,
      body.curation_status === 'curating' ? 'curating' : 'unmapped', validationStates.has(body.validation_state) ? body.validation_state : 'untested', Number(body.sort_order || 0),
    ).run()
    return c.json({ ok: true, id, slug }, 201)
  } catch (error: any) {
    if (/UNIQUE/.test(error?.message || '')) return c.json({ error: 'Canon domain slug or id already exists' }, 409)
    return c.json(safeError('Canon domain creation failed')(error), 500)
  }
})

app.patch('/domains/:id', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const domain = await loadDomain(c.env.DB, c.req.param('id'))
    if (!domain) return c.json({ error: 'Canon domain not found' }, 404)
    const branchId = clean(body.branch_id, 120) || domain.branch_id
    if (!await verifiedBranch(c.env.DB, branchId)) return c.json({ error: 'verified non-pruned branch required' }, 409)
    const title = body.title === undefined ? domain.title : clean(body.title, 500)
    const boundary = body.boundary === undefined ? domain.boundary : clean(body.boundary, 6000)
    if (!title || !boundary) return c.json({ error: 'title and boundary cannot be empty' }, 400)
    const curation = curationStates.has(body.curation_status) ? body.curation_status : domain.curation_status
    const validation = validationStates.has(body.validation_state) ? body.validation_state : domain.validation_state
    await c.env.DB.prepare(`UPDATE canon_domains SET title=?,boundary=?,orientation=?,branch_id=?,curation_status=?,validation_state=?,sort_order=?,updated_at=datetime('now') WHERE id=?`).bind(
      title, boundary, body.orientation === undefined ? domain.orientation : clean(body.orientation, 6000) || null, branchId, curation, validation,
      body.sort_order === undefined ? domain.sort_order : Number(body.sort_order || 0), domain.id,
    ).run()
    return c.json({ ok: true, id: domain.id, curation_status: curation, validation_state: validation })
  } catch (error: any) {
    if (/complete Canon domains require/.test(error?.message || '')) return c.json({ error: 'A complete Canon domain requires three distinct approved dossiers.' }, 409)
    return c.json(safeError('Canon domain update failed')(error), 500)
  }
})

app.put('/domains/:id/entries/:role', async (c) => {
  try {
    const role = c.req.param('role')
    if (!roles.has(role)) return c.json({ error: 'role must be foundation, representative, or boundary' }, 400)
    const domain = await loadDomain(c.env.DB, c.req.param('id'))
    if (!domain) return c.json({ error: 'Canon domain not found' }, 404)
    if (domain.kind !== 'domain') return c.json({ error: 'Canon entries belong to domains, not families' }, 409)
    if (domain.curation_status === 'complete') return c.json({ error: 'Reopen the Canon domain before replacing an approved entry.' }, 409)
    const body = await c.req.json<any>().catch(() => ({}))
    const entry = entryInput(body)
    const problem = validateEntry(entry)
    if (problem) return c.json({ error: problem }, 400)
    if (entry.recommendation_id) {
      const source = await c.env.DB.prepare(`SELECT id,status FROM recommendations WHERE id=? AND deleted_at IS NULL`).bind(entry.recommendation_id).first<any>()
      if (!source) return c.json({ error: 'linked source record not found' }, 404)
      if (source.status === 'consumed') return c.json({ error: 'Consumed books are ineligible for a new Canon selection.' }, 409)
    }
    const excluded = await c.env.DB.prepare(`SELECT
      EXISTS (SELECT 1 FROM mastered m WHERE m.kind='book' AND LOWER(m.label)=LOWER(?)) consumed,
      EXISTS (SELECT 1 FROM blacklist b WHERE LOWER(COALESCE(b.work,b.name))=LOWER(?) OR (LOWER(b.name)=LOWER(?) AND COALESCE(b.work,'')='')) blacklisted`).bind(entry.title, entry.title, entry.author).first<any>()
    if (excluded?.consumed) return c.json({ error: 'Consumed books are ineligible for a new Canon selection.' }, 409)
    if (excluded?.blacklisted) return c.json({ error: 'Blacklisted books or authors are ineligible for Canon.' }, 409)
    const existing = await c.env.DB.prepare(`SELECT * FROM canon_entries WHERE domain_id=? AND role=?`).bind(domain.id, role).first<any>()
    const replacementReason = clean(body.replacement_reason, 2000)
    if (existing && (existing.title !== entry.title || existing.author !== entry.author) && !replacementReason) return c.json({ error: 'replacement_reason is required when changing the selected book' }, 400)
    const id = existing?.id || clean(body.id, 120) || makeId('canon_entry')
    const statements: D1PreparedStatement[] = []
    if (existing && (existing.title !== entry.title || existing.author !== entry.author)) statements.push(
      c.env.DB.prepare(`INSERT INTO canon_entry_revisions (entry_id,domain_id,role,previous_json,replacement_reason) VALUES (?,?,?,?,?)`).bind(existing.id, domain.id, role, JSON.stringify(existing), replacementReason),
    )
    statements.push(c.env.DB.prepare(`INSERT INTO canon_entries (id,domain_id,role,title,author,canonical_url,isbn,why_slot,beginner_case,expert_case,unique_contribution,limitations,difficulty,rejected_alternative,rejection_reason,evidence_json,recommendation_id,editorial_status,validation_state)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(domain_id,role) DO UPDATE SET title=excluded.title,author=excluded.author,canonical_url=excluded.canonical_url,isbn=excluded.isbn,why_slot=excluded.why_slot,beginner_case=excluded.beginner_case,expert_case=excluded.expert_case,unique_contribution=excluded.unique_contribution,limitations=excluded.limitations,difficulty=excluded.difficulty,rejected_alternative=excluded.rejected_alternative,rejection_reason=excluded.rejection_reason,evidence_json=excluded.evidence_json,recommendation_id=excluded.recommendation_id,editorial_status=excluded.editorial_status,validation_state=excluded.validation_state,updated_at=datetime('now')`).bind(
      id, domain.id, role, entry.title, entry.author, entry.canonical_url, entry.isbn, entry.why_slot, entry.beginner_case, entry.expert_case, entry.unique_contribution,
      entry.limitations, entry.difficulty, entry.rejected_alternative, entry.rejection_reason, JSON.stringify(entry.evidence), entry.recommendation_id, entry.editorial_status, entry.validation_state,
    ))
    if (domain.curation_status === 'unmapped') statements.push(c.env.DB.prepare(`UPDATE canon_domains SET curation_status='curating',updated_at=datetime('now') WHERE id=?`).bind(domain.id))
    await c.env.DB.batch(statements)
    return c.json({ ok: true, id, domain_id: domain.id, role }, existing ? 200 : 201)
  } catch (error: any) {
    if (/UNIQUE/.test(error?.message || '')) return c.json({ error: 'A Canon domain cannot select the same book twice.' }, 409)
    return c.json(safeError('Canon entry update failed')(error), 500)
  }
})

app.post('/entries/:id/capture', async (c) => {
  try {
    const entry = await c.env.DB.prepare(`SELECT e.*,d.branch_id,n.id branch_exists,n.status branch_status,
      EXISTS (SELECT 1 FROM mastered m WHERE m.kind='book' AND LOWER(m.label)=LOWER(e.title)) consumed,
      EXISTS (SELECT 1 FROM blacklist b WHERE LOWER(COALESCE(b.work,b.name))=LOWER(e.title) OR (LOWER(b.name)=LOWER(e.author) AND COALESCE(b.work,'')='')) blacklisted
      FROM canon_entries e JOIN canon_domains d ON d.id=e.domain_id LEFT JOIN tree_nodes n ON n.id=d.branch_id WHERE e.id=?`).bind(c.req.param('id')).first<any>()
    if (!entry) return c.json({ error: 'Canon entry not found' }, 404)
    if (!entry.branch_exists || entry.branch_status === 'pruned') return c.json({ error: 'Canon domain needs a verified non-pruned branch before capture' }, 409)
    if (entry.consumed || entry.blacklisted) return c.json({ error: 'Consumed or blacklisted books cannot be captured from Canon.' }, 409)
    if (entry.recommendation_id) return c.json({ ok: true, id: entry.recommendation_id, duplicate: true, state: 'existing' })
    const source = entry.canonical_url || (entry.isbn ? `ISBN ${entry.isbn}` : '')
    if (!source) return c.json({ error: 'A canonical URL or ISBN is required before capture' }, 409)
    const result = await createCapture(c.env.DB, { source, title: entry.title })
    if (result.status === 'consumed' || result.status === 'rejected') return c.json({ error: 'This book already exists as consumed or rejected and cannot be captured from Canon.' }, 409)
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE recommendations SET content_type='book',creator=COALESCE(NULLIF(creator,''),?),updated_at=datetime('now') WHERE id=?`).bind(entry.author, result.id),
      c.env.DB.prepare(`UPDATE recommendation_meta SET branch_id=?,updated_at=datetime('now') WHERE recommendation_id=?`).bind(entry.branch_id, result.id),
      c.env.DB.prepare(`UPDATE canon_entries SET recommendation_id=?,updated_at=datetime('now') WHERE id=?`).bind(result.id, entry.id),
    ])
    return c.json({ ok: true, ...result, state: result.duplicate ? 'existing' : 'captured', branch_id: entry.branch_id }, result.duplicate ? 200 : 201)
  } catch (error) { return c.json(safeError('Canon capture failed')(error), 500) }
})

app.post('/domains/:id/thread', async (c) => {
  try {
    const domain = await loadDomain(c.env.DB, c.req.param('id'))
    if (!domain || domain.kind !== 'domain') return c.json({ error: 'Canon domain not found' }, 404)
    if (!domain.branch_label || domain.branch_status === 'pruned') return c.json({ error: 'Canon field needs a verified non-pruned branch before creating a Thread.' }, 409)
    const readiness = await c.env.DB.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN editorial_status='approved' THEN 1 ELSE 0 END) approved,
        COUNT(DISTINCT role) roles,
        SUM(CASE WHEN recommendation_id IS NOT NULL THEN 1 ELSE 0 END) captured
      FROM canon_entries WHERE domain_id=?`).bind(domain.id).first<any>()
    if (domain.curation_status !== 'complete' || Number(readiness?.total || 0) !== 3 || Number(readiness?.approved || 0) !== 3 || Number(readiness?.roles || 0) !== 3) {
      return c.json({ error: 'Finish the approved three-book Canon path before creating a Thread.' }, 409)
    }
    if (Number(readiness?.captured || 0) < 1) return c.json({ error: 'Capture at least one Canon book before creating a Thread.' }, 409)
    const existing = await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE superseded_at IS NULL AND status NOT IN ('verified','abandoned') AND guiding_question=? LIMIT 1`).bind(`What is the strongest working understanding of ${domain.title}, and how can I test it?`).first<any>()
    if (existing) return c.json({ ok: true, id: existing.id, duplicate: true })
    const id = makeId('thread')
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO learning_threads (id,title,thread_type,guiding_question,why_now,definition_of_done,status,priority) VALUES (?,?, 'understand', ?, ?, ?, 'draft', 0)`).bind(
        id, `${domain.title} — Guided Exploration`, `What is the strongest working understanding of ${domain.title}, and how can I test it?`,
        `Started explicitly from the Three-Book Canon. Domain boundary: ${domain.boundary}`,
        `Study the Canon trio deliberately, explain where the books agree and conflict, apply one idea, and decide whether the trio deserves field-tested status.`,
      ),
      c.env.DB.prepare(`INSERT INTO thread_sources (thread_id,recommendation_id,role,expected_contribution,position,status)
        SELECT ?,e.recommendation_id,CASE e.role WHEN 'foundation' THEN 'primary' WHEN 'boundary' THEN 'counterevidence' ELSE 'supporting' END,
          e.why_slot,CASE e.role WHEN 'foundation' THEN 0 WHEN 'representative' THEN 1 ELSE 2 END,'active'
        FROM canon_entries e WHERE e.domain_id=? AND e.recommendation_id IS NOT NULL`).bind(id, domain.id),
    ])
    return c.json({ ok: true, id, duplicate: false }, 201)
  } catch (error) { return c.json(safeError('Canon Thread creation failed')(error), 500) }
})

export default app
