import { Hono } from 'hono'
import { Bindings, Recommendation, safeError, isNonEmptyStr, isValidLength, VALID_LOG_KINDS } from '../lib'
import { cached } from '../cache'
import { applyProfileAssertion, profileIntelligenceSnapshot, revertProfileRevision } from '../services/intelligence-v2'
import { buildLearningBalance } from '../services/learning-balance'
import { profileTasteLabel } from '../services/profile-labels'
import { loadCompassContext } from './compass'
import { freeAi } from '../services/ai'
import { loadCrossBranchBridges } from '../services/cross-branch-bridges'
import { actOnResurfacing, createResurfacingPresentation, getDailyResurfacing, setResurfacingPreference } from '../services/resurfacing'

const app = new Hono<{ Bindings: Bindings }>()

// ---- /brain/node/:id — single node + children + related
app.get('/node/:id', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const id = c.req.param('id')
  try {
    const row = await DB.prepare('SELECT * FROM tree_nodes WHERE id = ?').bind(id).first<any>()
    if (!row) return c.json({ error: 'not found' }, 404)
    let x: number | null = null, y: number | null = null
    try { if (row.meta_json) { const m = JSON.parse(row.meta_json); if (typeof m.x === 'number') x = m.x; if (typeof m.y === 'number') y = m.y } } catch { }
    const { round_label: _legacyRound, ...nodeRow } = row
    const node = { ...nodeRow, x, y, meta_json: undefined }
    const children = await DB.prepare(
      'SELECT id, type, label, status, super_category, meta_json FROM tree_nodes WHERE parent_id = ? ORDER BY type, id'
    ).bind(id).all<any[]>()
    const childrenParsed = (children.results || []).map((c: any) => {
      let cx = null, cy = null; try { const m = JSON.parse(c.meta_json || '{}'); cx = m.x; cy = m.y; } catch { }
      return { ...c, x: cx, y: cy, meta_json: undefined }
    })
    const siblings = await DB.prepare(
      'SELECT id, type, label, status FROM tree_nodes WHERE parent_id = ? AND id != ? ORDER BY id'
    ).bind(node.parent_id || 'root', id).all()
    const recs = await DB.prepare(
      `SELECT r.id, r.video_title, r.creator, r.user_rating, r.status, r.consumed_date, r.dedup_key
       FROM recommendations r
       WHERE r.dedup_key LIKE ?
          OR EXISTS (SELECT 1 FROM recommendation_meta m WHERE m.recommendation_id = r.id AND m.branch_id = ?)
       ORDER BY r.consumed_date DESC`
    ).bind(id + '-%', id).all()
    const parents: any[] = []
    let cur: any = node
    while (cur && cur.parent_id) {
      const p = await DB.prepare('SELECT id, type, label, status, parent_id, meta_json FROM tree_nodes WHERE id = ?').bind(cur.parent_id).first<any>()
      if (p) {
        let px = null, py = null; try { const m = JSON.parse(p.meta_json || '{}'); px = m.x; py = m.y; } catch { }
        parents.push({ ...p, x: px, y: py, meta_json: undefined })
        cur = p
      } else break
    }
    return c.json({ node, children: childrenParsed, siblings: siblings.results || [], related_recs: recs.results || [], parents })
  } catch (err) {
    return c.json(safeError('Node failed')(err), 500)
  }
})

// ---- /brain/profile — full profile snapshot; profile edits require an immediate confirming reread.
app.get('/profile', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const recentLimit = Math.min(Math.max(parseInt(c.req.query('recent_limit') || '10'), 1), 50)
  try {
    const data = await cached('brain.profile.' + recentLimit, 0, async () => {
      const [profile, priorities, mastered, blacklist, patterns, recent, feedSources, srsCards, srsDrafts, sessions, notes, creators, tasteVectors, reflections, ratings, artifactsCount, proposalsCount, intelligence] = await Promise.all([
        DB.prepare('SELECT * FROM profile WHERE id = 1').first(),
        DB.prepare('SELECT * FROM priorities ORDER BY rank ASC').all(),
        DB.prepare('SELECT * FROM mastered ORDER BY mastered_at DESC').all(),
        DB.prepare('SELECT * FROM blacklist ORDER BY severity ASC, added_at DESC').all(),
        DB.prepare("SELECT * FROM patterns ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, confirmed_date DESC").all(),
        DB.prepare('SELECT * FROM update_log ORDER BY id DESC LIMIT ?').bind(recentLimit).all(),
        DB.prepare('SELECT id, title, feed_url, site_url, last_fetched_at, is_active FROM feed_sources ORDER BY is_active DESC, title ASC').all().catch(() => ({ results: [] })),
        DB.prepare("SELECT COUNT(*) as count FROM srs_cards").first<{ count: number }>().catch(() => ({ count: 0 })),
        DB.prepare("SELECT COUNT(*) as count FROM srs_drafts WHERE status = 'draft'").first<{ count: number }>().catch(() => ({ count: 0 })),
        DB.prepare("SELECT COUNT(*) as total_sessions, SUM(CASE WHEN reflection IS NOT NULL AND reflection != '' THEN 1 ELSE 0 END) as reflections_count FROM learning_sessions").first<{ total_sessions: number; reflections_count: number }>().catch(() => ({ total_sessions: 0, reflections_count: 0 })),
        DB.prepare("SELECT COUNT(*) as count FROM notes").first<{ count: number }>().catch(() => ({ count: 0 })),
        DB.prepare("SELECT creator, COUNT(*) as total, ROUND(AVG(COALESCE(user_score, CASE user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END)), 2) as average_score, SUM(CASE WHEN user_rating='love' THEN 1 ELSE 0 END) as loves FROM recommendations WHERE creator IS NOT NULL AND creator != '' AND status='consumed' GROUP BY creator ORDER BY average_score DESC, total DESC LIMIT 50").all().catch(() => ({ results: [] })),
        DB.prepare(`SELECT tv.topic, COALESCE(NULLIF(n.label, ''), NULLIF(p.label, '')) AS branch_label,
          tv.affinity_score, tv.consumption_count, tv.last_consumed_at
          FROM taste_vectors tv
          LEFT JOIN tree_nodes n ON n.id = tv.topic
          LEFT JOIN priorities p ON p.branch_id = tv.topic
          ORDER BY tv.affinity_score DESC, tv.consumption_count DESC LIMIT 50`).all().catch(() => ({ results: [] })),
        DB.prepare("SELECT s.id, r.video_title, r.creator, s.reflection, s.completed_at FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.reflection IS NOT NULL AND s.reflection != '' ORDER BY s.completed_at DESC LIMIT 20").all().catch(() => ({ results: [] })),
        DB.prepare("SELECT id, video_title, creator, user_rating, user_score, user_review, consumed_date FROM recommendations WHERE status='consumed' AND (user_rating IS NOT NULL OR user_score IS NOT NULL OR user_review IS NOT NULL) ORDER BY consumed_date DESC LIMIT 30").all().catch(() => ({ results: [] })),
        DB.prepare("SELECT COUNT(*) as count FROM artifacts").first<{ count: number }>().catch(() => ({ count: 0 })),
        DB.prepare("SELECT COUNT(*) as count FROM feedback_proposals WHERE status = 'pending'").first<{ count: number }>().catch(() => ({ count: 0 })),
        profileIntelligenceSnapshot(DB).catch(() => ({ assertions: [], revisions: [], health: { status: 'unavailable' } })),
      ])
      return {
        profile: profile || null,
        priorities: priorities.results || [],
        mastered: mastered.results || [],
        blacklist: blacklist.results || [],
        patterns: (patterns.results || []).filter((item: any, index: number, rows: any[]) => rows.findIndex((candidate: any) => String(candidate.description || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === String(item.description || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) === index),
        recent: recent.results || [],
        feed_sources: feedSources.results || [],
        srs_stats: {
          active_cards: srsCards?.count || 0,
          pending_drafts: srsDrafts?.count || 0,
        },
        activity_stats: {
          total_sessions: sessions?.total_sessions || 0,
          reflections_count: sessions?.reflections_count || 0,
          total_notes: notes?.count || 0,
        },
        creator_trust: creators.results || [],
        taste_vectors: (tasteVectors.results || []).map((item: any) => {
          const { branch_label, ...vector } = item
          return { ...vector, label: profileTasteLabel({ topic: vector.topic, branch_label }) }
        }),
        reflections: reflections.results || [],
        rating_history: ratings.results || [],
        infrastructure_stats: {
          artifacts_count: artifactsCount?.count || 0,
          pending_proposals_count: proposalsCount?.count || 0,
          database_name: 'recommendations-db',
          worker_environment: 'production',
        },
        model_version: 'profile_v2',
        profile_assertions: intelligence.assertions,
        profile_revisions: intelligence.revisions,
        profile_health: intelligence.health,
      }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Profile failed')(err), 500)
  }
})

// ---- /brain/tree — full tree nodes with positions (cached 60s TTL)
app.get('/tree', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100'), 1), 500)
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)
  try {
    const data = await cached('brain.tree.' + limit + '.' + offset, 60000, async () => {
      const result = await DB.prepare('SELECT id, type, label, status, super_category, parent_id, meta_json FROM tree_nodes ORDER BY id LIMIT ? OFFSET ?').bind(limit, offset).all()
      const nodes = (result.results || []).map((r: any) => {
        let x: number | null = null, y: number | null = null
        try { if (r.meta_json) { const m = JSON.parse(r.meta_json); if (typeof m.x === 'number') x = m.x; if (typeof m.y === 'number') y = m.y } } catch { }
        return { id: r.id, type: r.type, label: r.label, status: r.status, super_category: r.super_category, parent_id: r.parent_id, x, y }
      })
      return { nodes, count: nodes.length, limit, offset }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Tree failed')(err), 500)
  }
})

// ---- /brain/branches — grouped by super_category (cached 60s TTL)
app.get('/branches', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const data = await cached('brain.branches', 60000, async () => {
      const result = await DB.prepare("SELECT super_category, status, COUNT(*) as c FROM tree_nodes WHERE type IN ('branch','leaf') GROUP BY super_category, status").all()
      return { groups: result.results || [] }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Branches failed')(err), 500)
  }
})

// ---- /brain/branches/:id/items — full linked-items ledger for one branch:
// recommendations with ratings and recall metadata, notes, recall cards,
// pending SRS drafts, and R2 artifacts. The authoritative branch dossier.
app.get('/branches/:id/items', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const id = c.req.param('id')
  try {
    const branch = await DB.prepare('SELECT id,type,label,status,super_category,parent_id,meta_json FROM tree_nodes WHERE id=?').bind(id).first<any>()
    if (!branch) return c.json({ error: 'branch not found' }, 404)
    let meta: any = {}
    try { if (branch.meta_json) meta = JSON.parse(branch.meta_json) } catch {}
    const [path, recommendations, notes, cards, drafts, artifacts, balance, bridges] = await Promise.all([
      DB.prepare(`WITH RECURSIVE chain(id,label,type,parent_id) AS (
        SELECT id,label,type,parent_id FROM tree_nodes WHERE id=?
        UNION ALL SELECT t.id,t.label,t.type,t.parent_id FROM tree_nodes t JOIN chain ch ON t.id=ch.parent_id)
        SELECT * FROM chain`).bind(id).all<any>(),
      DB.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.status,r.user_score,r.user_rating,r.user_review,r.consumed_date,r.created_at,m.learning_state,m.priority_rank,
        (SELECT COUNT(*) FROM srs_cards sc WHERE sc.recommendation_id=r.id) recall_count,
        (SELECT COUNT(*) FROM srs_cards sc WHERE sc.recommendation_id=r.id AND sc.due_at IS NOT NULL AND sc.due_at<=date('now')) due_count,
        (SELECT COUNT(*) FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id')=r.id AND (a.media_type LIKE '%html%' OR a.filename LIKE '%.html')) html_count,
        (SELECT COUNT(*) FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id')=r.id AND (a.media_type LIKE '%pdf%' OR a.filename LIKE '%.pdf')) pdf_count,
        (SELECT n.id FROM notes n WHERE n.recommendation_id=r.id ORDER BY n.updated_at DESC LIMIT 1) note_id,
        (SELECT n.title FROM notes n WHERE n.recommendation_id=r.id ORDER BY n.updated_at DESC LIMIT 1) note_title
        FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
        WHERE m.branch_id=? AND r.deleted_at IS NULL AND (r.status IS NULL OR r.status!='deleted')
        ORDER BY CASE WHEN r.status='consumed' THEN 0 ELSE 1 END, COALESCE(r.consumed_date,r.created_at) DESC`).bind(id).all<any>(),
      DB.prepare(`SELECT n.id,n.recommendation_id,n.title,n.kind,n.status,n.revision,n.updated_at,r.video_title source_title
        FROM notes n LEFT JOIN recommendations r ON r.id=n.recommendation_id WHERE n.branch_id=?
        ORDER BY n.updated_at DESC`).bind(id).all<any>(),
      DB.prepare(`SELECT sc.id,sc.recommendation_id,sc.question,sc.answer,sc.topic,sc.due_at,sc.repetitions,sc.ease_factor,sc.scheduler_version,r.video_title source_title
        FROM srs_cards sc LEFT JOIN recommendations r ON r.id=sc.recommendation_id
        WHERE COALESCE(sc.branch,'')=? OR EXISTS (SELECT 1 FROM notes n WHERE n.id=sc.note_id AND n.branch_id=?)
          OR sc.recommendation_id IN (SELECT m.recommendation_id FROM recommendation_meta m WHERE m.branch_id=?)
        ORDER BY sc.due_at`).bind(id, id, id).all<any>(),
      DB.prepare(`SELECT sd.id,sd.recommendation_id,sd.question,sd.answer,sd.topic,sd.status,r.video_title source_title
        FROM srs_drafts sd LEFT JOIN recommendations r ON r.id=sd.recommendation_id
        WHERE COALESCE(sd.branch,'')=? OR sd.recommendation_id IN (SELECT m.recommendation_id FROM recommendation_meta m WHERE m.branch_id=?)
        ORDER BY sd.created_at DESC`).bind(id, id).all<any>(),
      DB.prepare(`SELECT a.id,a.filename,a.media_type,a.size_bytes,a.metadata_json,a.created_at
        FROM artifacts a WHERE json_extract(a.metadata_json,'$.recommendation_id') IN (SELECT m.recommendation_id FROM recommendation_meta m WHERE m.branch_id=?)
        ORDER BY a.created_at DESC LIMIT 100`).bind(id).all<any>(),
      buildLearningBalance(DB, 90).catch(() => null),
      loadCrossBranchBridges(DB, id),
    ])
    const balanceNode = (balance?.branches || []).find((b: any) => String(b.id) === id) || null
    const priority = await DB.prepare('SELECT rank,label,rationale FROM priorities WHERE branch_id=?').bind(id).first<any>()
    const recs = (recommendations.results || []).map((row: any) => ({
      ...row,
      recall: { count: Number(row.recall_count || 0), due: Number(row.due_count || 0) },
      companions: { html: Number(row.html_count || 0) > 0, pdf: Number(row.pdf_count || 0) > 0 },
      note: row.note_id ? { id: row.note_id, title: row.note_title || 'Field note' } : null,
      recall_count: undefined, due_count: undefined, html_count: undefined, pdf_count: undefined, note_id: undefined, note_title: undefined,
    }))
    return c.json({
      branch: {
        id: branch.id, label: branch.label, type: branch.type, status: branch.status,
        super_category: branch.super_category || null,
        parent_id: branch.parent_id || null, description: meta.notes || meta.description || null,
        priority: priority || null, balance: balanceNode,
      },
      path: (path.results || []).reverse(),
      recommendations: recs,
      notes: notes.results || [],
      recall_cards: cards.results || [],
      srs_drafts: drafts.results || [],
      artifacts: artifacts.results || [],
      bridges,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    return c.json(safeError('Branch items failed')(err), 500)
  }
})

// ---- /brain/resurfacing — items due for review
app.get('/resurfacing', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '5'), 1), 25)
    return c.json(await getDailyResurfacing(DB, { limit }))
  } catch (err) {
    return c.json(safeError('Resurfacing failed')(err), 500)
  }
})

app.patch('/resurfacing/:recommendationId/preference', async (c) => {
  const body = await c.req.json<{ starred?: boolean }>().catch(() => null)
  if (!body || typeof body.starred !== 'boolean') return c.json({ error: 'starred must be boolean' }, 400)
  try {
    const result = await setResurfacingPreference(c.env.DB, c.req.param('recommendationId'), body.starred)
    return result ? c.json({ ok: true, ...result }) : c.json({ error: 'consumed source not found' }, 404)
  } catch (err) { return c.json(safeError('Resurfacing preference failed')(err), 500) }
})

app.post('/resurfacing/presentations', async (c) => {
  const body = await c.req.json<{ recommendation_id?: string }>().catch(() => null)
  if (!body?.recommendation_id || !isNonEmptyStr(body.recommendation_id, 100)) return c.json({ error: 'recommendation_id required' }, 400)
  try {
    const result = await createResurfacingPresentation(c.env.DB, body.recommendation_id)
    return result ? c.json({ ok: true, presentation: result }) : c.json({ error: 'source is not today\'s due resurfacing item' }, 409)
  } catch (err) { return c.json(safeError('Resurfacing presentation failed')(err), 500) }
})

app.post('/resurfacing/:eventId/action', async (c) => {
  const body = await c.req.json<{ action?: string }>().catch(() => null)
  if (!body || !['reviewed', 'snooze', 'dismissed'].includes(String(body.action))) return c.json({ error: 'action must be reviewed, snooze, or dismissed' }, 400)
  try {
    const result = await actOnResurfacing(c.env.DB, c.req.param('eventId'), body.action as 'reviewed' | 'snooze' | 'dismissed')
    return result ? c.json({ ok: true, event: result }) : c.json({ error: 'resurfacing event not found' }, 404)
  } catch (err) { return c.json(safeError('Resurfacing action failed')(err), 500) }
})

// ---- /brain/contradictions — detected tensions
app.get('/contradictions', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const result = await DB.prepare("SELECT * FROM contradictions WHERE resolved_at IS NULL ORDER BY detected_at DESC").all()
    return c.json({ contradictions: result.results || [] })
  } catch (err) {
    return c.json(safeError('Contradictions failed')(err), 500)
  }
})

// ---- /brain/health — branch health metrics (cached 60s TTL)
app.get('/health', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const data = await cached('brain.health', 60000, async () => {
    const byBranch = await DB.prepare(`
      SELECT
        COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'root') as branch,
        COUNT(*) as consumed_count,
        AVG(CASE WHEN user_rating GLOB '[0-9]*' THEN CAST(user_rating AS REAL) ELSE NULL END) as avg_rating,
        MAX(consumed_date) as last_consumed
      FROM recommendations
      WHERE status = 'consumed' AND dedup_key IS NOT NULL AND dedup_key != ''
      GROUP BY branch
      HAVING consumed_count > 0
      ORDER BY consumed_count DESC
    `).all()

    const stale = await DB.prepare(`
      SELECT id, video_title, verified, creator
      FROM recommendations
      WHERE status = 'active'
      AND verified != 'unset'
      AND julianday('now') - julianday(verified) > 30
      ORDER BY verified ASC
    `).all()

    // Mastery per branch: count of consumed recs with love/like rating / total leaves in branch
    const mastery = await DB.prepare(`
      SELECT
        COALESCE(SUBSTR(r.dedup_key, 1, INSTR(r.dedup_key, '-') - 1), 'root') as branch,
        SUM(CASE WHEN r.user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastered,
        COUNT(*) as total
      FROM recommendations r
      WHERE r.status = 'consumed' AND r.dedup_key IS NOT NULL AND r.dedup_key != ''
      GROUP BY branch
    `).all()

    return {
      byBranch: byBranch.results || [],
      stale: stale.results || [],
      mastery: mastery.results || [],
      stale_count: stale.results?.length || 0
    }
    })
    return c.json(data)
  } catch (err) {
    return c.json(safeError('Health failed')(err), 500)
  }
})

// ---- /brain/log — append to update log
app.post('/log', async (c) => {
  const { DB } = c.env
  try {
    const { kind, summary, details } = await c.req.json<{ kind: string; summary: string; details?: any }>()
    if (!summary || !isValidLength(summary, 1, 500)) return c.json({ error: 'summary required (1-500 chars)' }, 400)
    if (kind && !VALID_LOG_KINDS.has(kind)) return c.json({ error: 'invalid kind' }, 400)
    await DB.prepare(
      'INSERT INTO update_log (kind, summary, details_json) VALUES (?, ?, ?)'
    ).bind(kind || 'system', summary, details ? JSON.stringify(details) : null).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Log failed')(err), 500)
  }
})

// ---- /brain/seed — idempotent bootstrap
app.post('/seed', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<any>()
    const stmts: D1PreparedStatement[] = []

    if (body.profile) {
      const p = body.profile
      if (p.identity && !isValidLength(p.identity, 0, 5000)) return c.json({ error: 'identity too long' }, 400)
      if (p.core_filter && !isValidLength(p.core_filter, 0, 5000)) return c.json({ error: 'core_filter too long' }, 400)
      if (p.reaction_style && !isValidLength(p.reaction_style, 0, 5000)) return c.json({ error: 'reaction_style too long' }, 400)
      if (p.quality_rules && !isValidLength(p.quality_rules, 0, 5000)) return c.json({ error: 'quality_rules too long' }, 400)
      if (p.operational_style && !isValidLength(p.operational_style, 0, 5000)) return c.json({ error: 'operational_style too long' }, 400)
      if (p.patterns_summary && !isValidLength(p.patterns_summary, 0, 5000)) return c.json({ error: 'patterns_summary too long' }, 400)
      if (p.recent_signal && !isValidLength(p.recent_signal, 0, 5000)) return c.json({ error: 'recent_signal too long' }, 400)
      stmts.push(DB.prepare(`
        INSERT OR REPLACE INTO profile
        (id, identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, operational_style_json, patterns_summary_json, recent_signal, last_synced_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        p.identity || null,
        JSON.stringify(p.mega_priority || []),
        p.core_filter || null,
        p.reaction_style || null,
        p.quality_rules || null,
        p.operational_style || null,
        p.patterns_summary || null,
        p.recent_signal || null
      ))
    }

    if (Array.isArray(body.priorities)) {
      for (const [rank, branch_id, label, rationale] of body.priorities) {
        if (typeof rank !== 'number') continue
        if (!isNonEmptyStr(branch_id, 100)) continue
        if (rationale && !isValidLength(rationale, 0, 500)) return c.json({ error: 'rationale too long (max 500 chars)' }, 400)
        stmts.push(DB.prepare('INSERT OR REPLACE INTO priorities (rank, branch_id, label, rationale) VALUES (?, ?, ?, ?)').bind(rank, branch_id, label || null, rationale || null))
      }
    }

    if (Array.isArray(body.tree_nodes)) {
      for (const n of body.tree_nodes) {
        if (!isNonEmptyStr(n.id, 100)) continue
        if (!isNonEmptyStr(n.label, 200)) return c.json({ error: `label too long for node ${n.id}` }, 400)
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO tree_nodes (id, type, label, super_category, parent_id, status, meta_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          n.id, n.type || 'branch', n.label || n.id,
          n.super_category || null, n.parent_id || null,
          n.status || null,
          n.meta_json || (n.color ? JSON.stringify({ color: n.color, x: n.x, y: n.y, creator: n.creator, video_url: n.video_url, user_rating: n.user_rating, consumed_date: n.consumed_date }) : null)
        ))
      }
    }

    if (Array.isArray(body.mastered)) {
      for (const m of body.mastered) {
        if (!isNonEmptyStr(m[0], 100)) continue
        if (m[5] && !isValidLength(m[5], 0, 1000)) return c.json({ error: `notes too long for mastered ${m[0]}` }, 400)
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO mastered (id, kind, label, author, rating, notes, mastered_at, decay_review_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT mastered_at FROM mastered WHERE id = ?), datetime('now')), COALESCE((SELECT decay_review_at FROM mastered WHERE id = ?), datetime('now', '+12 months')))
        `).bind(m[0], m[1], m[2], m[3] || null, m[4] || null, m[5] || null, m[0], m[0]))
      }
    }

    if (Array.isArray(body.blacklist)) {
      for (const b of body.blacklist) {
        if (!isNonEmptyStr(b[0], 100)) continue
        if (!isNonEmptyStr(b[1], 200)) return c.json({ error: `name too long for blacklist ${b[0]}` }, 400)
        if (b[3] && !isValidLength(b[3], 0, 1000)) return c.json({ error: `reason too long for blacklist ${b[0]}` }, 400)
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO blacklist (id, name, work, reason, severity)
          VALUES (?, ?, ?, ?, ?)
        `).bind(b[0], b[1], b[2] || null, b[3] || null, b[4] || 3))
      }
    }

    if (Array.isArray(body.patterns_confirmed)) {
      for (const p of body.patterns_confirmed) {
        if (!isNonEmptyStr(p[0], 100)) continue
        if (!isNonEmptyStr(p[1], 500)) return c.json({ error: `description too long for pattern ${p[0]}` }, 400)
        if (p[2] && !Array.isArray(p[2])) return c.json({ error: `evidence_json must be an array for pattern ${p[0]}` }, 400)
        if (p[5] && !isValidLength(p[5], 0, 1000)) return c.json({ error: `notes too long for pattern ${p[0]}` }, 400)
        stmts.push(DB.prepare(`
          INSERT OR REPLACE INTO patterns (id, description, evidence_json, confirmed_date, strength, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(p[0], p[1], JSON.stringify(p[2] || []), p[3] || null, p[4] || 'confirmed', p[5] || null))
      }
    }

    if (stmts.length === 0) return c.json({ ok: true, count: 0 })
    for (let i = 0; i < stmts.length; i += 50) {
      await DB.batch(stmts.slice(i, i + 50))
    }
    return c.json({ ok: true, count: stmts.length })
  } catch (err) {
    return c.json(safeError('Seed failed')(err), 500)
  }
})

// ---- /brain/pattern/strength — promote/demote a pattern
app.post('/pattern/strength', async (c) => {
  const { DB } = c.env
  try {
    const { id, strength } = await c.req.json<{ id: string; strength: string }>()
    if (!isNonEmptyStr(id, 100)) return c.json({ error: 'id required' }, 400)
    if (!['weak', 'confirmed', 'locked'].includes(strength)) return c.json({ error: 'invalid strength' }, 400)
    await DB.prepare('UPDATE patterns SET strength = ? WHERE id = ?').bind(strength, id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Pattern strength failed')(err), 500)
  }
})

// ---- /brain/contradiction/resolve — mark a contradiction as resolved
app.post('/contradiction/resolve', async (c) => {
  const { DB } = c.env
  try {
    const { id } = await c.req.json<{ id: string }>()
    if (!isNonEmptyStr(id, 100)) return c.json({ error: 'id required' }, 400)
    await DB.prepare(`UPDATE contradictions SET resolved_at = datetime('now') WHERE id = ?`).bind(id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Resolve failed')(err), 500)
  }
})

// ---- /brain/profile — update editable profile fields
app.post('/profile', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<{
      core_filter?: string
      mega_priority?: any
      identity?: any
      reaction_style_json?: any
      quality_rules_json?: any
      operational_style_json?: any
      patterns_summary_json?: any
      recent_signal?: string
      reaction_style?: any
      quality_rules?: any
      operational_style?: any
      patterns_summary?: any
    }>()
    const fields: string[] = []
    const bindings: any[] = []
    const serialized = (value: any) => {
      const result = typeof value === 'string' ? value : JSON.stringify(value)
      return isValidLength(result, 0, 5000) ? result : null
    }
    if (body.core_filter !== undefined) {
      if (typeof body.core_filter !== 'string' || !isValidLength(body.core_filter, 0, 5000)) return c.json({ error: 'core_filter must be a string of 5000 characters or fewer' }, 400)
      fields.push('core_filter = ?'); bindings.push(body.core_filter)
    }
    if (body.mega_priority !== undefined) {
      const value = serialized(body.mega_priority)
      if (value === null) return c.json({ error: 'mega_priority must be 5000 characters or fewer when serialized' }, 400)
      fields.push('mega_priority_json = ?'); bindings.push(value)
    }
    if (body.identity !== undefined) {
      const value = serialized(body.identity)
      if (value === null) return c.json({ error: 'identity must be 5000 characters or fewer when serialized' }, 400)
      fields.push('identity_json = ?'); bindings.push(value)
    }
    const jsonFields: Array<[string, string, any]> = [
      ['reaction_style_json', 'reaction_style', body.reaction_style_json ?? body.reaction_style],
      ['quality_rules_json', 'quality_rules', body.quality_rules_json ?? body.quality_rules],
      ['operational_style_json', 'operational_style', body.operational_style_json ?? body.operational_style],
      ['patterns_summary_json', 'patterns_summary', body.patterns_summary_json ?? body.patterns_summary],
    ]
    for (const [column, name, value] of jsonFields) {
      if (value !== undefined) {
        const serializedValue = serialized(value)
        if (serializedValue === null) return c.json({ error: `${name} must be 5000 characters or fewer when serialized` }, 400)
        fields.push(`${column} = ?`); bindings.push(serializedValue)
      }
    }
    if (body.recent_signal !== undefined) {
      if (typeof body.recent_signal !== 'string' || !isValidLength(body.recent_signal, 0, 5000)) return c.json({ error: 'recent_signal must be a string of 5000 characters or fewer' }, 400)
      fields.push('recent_signal = ?'); bindings.push(body.recent_signal)
    }
    if (fields.length === 0) return c.json({ ok: true, count: 0 })
    fields.push("last_synced_at = datetime('now')")
    await DB.prepare(`UPDATE profile SET ${fields.join(', ')} WHERE id = 1`).bind(...bindings).run()
    const typedUpdates: Array<[string, string, unknown]> = [
      ['core_filter', 'core_filter', body.core_filter],
      ['priority', 'priority', body.mega_priority],
      ['identity', 'identity', body.identity],
      ['reaction_style', 'reaction_style', body.reaction_style_json ?? body.reaction_style],
      ['quality_rule', 'quality_rule', body.quality_rules_json ?? body.quality_rules],
      ['operational_style', 'operational_style', body.operational_style_json ?? body.operational_style],
      ['pattern', 'pattern', body.patterns_summary_json ?? body.patterns_summary],
      ['profile_signal', 'profile_signal', body.recent_signal],
    ]
    for (const [key, category, value] of typedUpdates) if (value !== undefined) await applyProfileAssertion(DB, {
      assertionKey: `user.profile.${key}`, category, value, confidence: 1, sourceKind: 'user', evidence: [{ source: 'brain_profile_edit', field: key }],
      actorType: 'user', decisionSource: 'user', directUserStatement: true,
    })
    return c.json({ ok: true, count: fields.length - 1, model_version: 'profile_v2' })
  } catch (err) {
    return c.json(safeError('Profile update failed')(err), 500)
  }
})

app.get('/profile/intelligence', async (c) => {
  try { return c.json({ model_version: 'profile_v2', ...(await profileIntelligenceSnapshot(c.env.DB)) }) }
  catch (err) { return c.json(safeError('Profile intelligence failed')(err), 500) }
})

app.put('/profile/assertions/:key', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    if (body.value === undefined || !String(body.category || '').trim()) return c.json({ error: 'category and value required' }, 400)
    const result = await applyProfileAssertion(c.env.DB, {
      assertionKey: c.req.param('key'), category: String(body.category).slice(0, 80), scope: String(body.scope || 'global').slice(0, 120),
      value: body.value, weight: body.weight == null ? null : Number(body.weight), confidence: 1, status: body.status === 'inactive' ? 'inactive' : 'active',
      sourceKind: 'user', evidence: [{ source: 'profile_assertion_edit', note: String(body.reason || '').slice(0, 500) }],
      actorType: 'user', decisionSource: 'user', directUserStatement: true, targetVersion: body.target_version == null ? null : Number(body.target_version),
    })
    return result.ok ? c.json(result) : c.json(result, result.error === 'profile_version_conflict' ? 409 : 422)
  } catch (err) { return c.json(safeError('Profile assertion update failed')(err), 500) }
})

app.post('/profile/revisions/:id/revert', async (c) => {
  try {
    const result = await revertProfileRevision(c.env.DB, c.req.param('id'), 'user')
    return result.ok ? c.json(result) : c.json(result, 404)
  } catch (err) { return c.json(safeError('Profile revision revert failed')(err), 500) }
})

// ---- /brain/branch-deck — Evidence-driven branch review deck
// Existing branches come from tree_nodes; every branch carries real evidence
// (consumed/mapped sources, attention share, priority rank, SRS due, recall
// strength, learning units) computed from the same learning-balance model the
// rest of the product reads. No hardcoded candidates or mastered exclusions —
// the map is the source of truth. New-branch suggestions are review-before-
// commit and live in the client (see POST /brain/branch-suggest).
app.get('/branch-deck', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const [existingNodes, categories, priorities, explored, mastered, balance, mappedByBranch, unmappedRows, learningUnitsByBranch] = await Promise.all([
      DB.prepare(`SELECT id, type, label, status, super_category, parent_id, meta_json
        FROM tree_nodes
        WHERE type='branch'
          AND (parent_id='root' OR parent_id IN (SELECT id FROM tree_nodes WHERE type='category'))
        ORDER BY CASE WHEN status = 'love' THEN 0 WHEN status = 'active' THEN 1 WHEN status = 'fresh' THEN 2 WHEN status = 'locked' THEN 3 WHEN status = 'held' THEN 4 ELSE 5 END, label COLLATE NOCASE`).all<any>(),
      DB.prepare("SELECT id,label,status,super_category FROM tree_nodes WHERE type='category' AND status!='pruned' ORDER BY label COLLATE NOCASE").all<any>(),
      DB.prepare("SELECT rank, branch_id, label, rationale FROM priorities ORDER BY rank ASC").all<any>(),
      DB.prepare("SELECT id, name, lifecycle_state, is_pruned FROM branch_exploration").all<any>(),
      DB.prepare("SELECT id, label, kind FROM mastered").all<any>(),
      buildLearningBalance(DB, 90).catch(() => null),
      DB.prepare(`SELECT m.branch_id, COUNT(*) mapped_count,
          SUM(CASE WHEN r.status='consumed' THEN 1 ELSE 0 END) consumed_mapped,
          MAX(r.consumed_date) last_consumed_at
        FROM recommendation_meta m LEFT JOIN recommendations r ON r.id=m.recommendation_id
        WHERE m.branch_id IS NOT NULL AND m.branch_id != '' GROUP BY m.branch_id`).all<any>().catch(() => ({ results: [] })),
      DB.prepare(`SELECT r.dedup_key, COUNT(*) c
        FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
        WHERE r.status='consumed' AND r.dedup_key IS NOT NULL AND r.dedup_key != '' AND COALESCE(m.branch_id,'')=''
        GROUP BY r.dedup_key`).all<any>().catch(() => ({ results: [] })),
      DB.prepare(`SELECT m.branch_id, COUNT(*) units
        FROM learning_units u JOIN recommendations r ON r.id=u.recommendation_id
        JOIN recommendation_meta m ON m.recommendation_id=r.id
        WHERE u.status NOT IN ('deleted','quarantined') AND m.branch_id IS NOT NULL AND m.branch_id != ''
        GROUP BY m.branch_id`).all<any>().catch(() => ({ results: [] })),
    ])

    const priorityMap = new Map<string, number>()
    for (const p of priorities.results || []) priorityMap.set(p.branch_id, p.rank)

    const prunedSet = new Set<string>()
    for (const e of explored.results || []) if (e.is_pruned) prunedSet.add(e.id)

    const masteredIdsAndLabels = new Set<string>()
    for (const m of mastered.results || []) {
      if (m.id) masteredIdsAndLabels.add(m.id.toLowerCase())
      if (m.label) masteredIdsAndLabels.add(m.label.toLowerCase())
    }
    const isMastered = (id: string, label: string) => masteredIdsAndLabels.has(id.toLowerCase()) || masteredIdsAndLabels.has(label.toLowerCase())

    // Helper to clean raw database bracket text like "[LOVE · R2 — new]"
    const cleanBranchLabel = (raw: string) => raw.replace(/\[.*?\]/g, '').trim()

    // Resolve unmapped consumed sources to the branch their dedup_key belongs
    // to. This mirrors buildLearningBalance.resolveNode and makes the deck
    // consistent with map/node/compass even when a source was never explicitly
    // mapped through POST /recommendations/map.
    const branchIds = (existingNodes.results || []).map((n: any) => n.id).sort((a: string, b: string) => b.length - a.length)
    const unmappedByBranch = new Map<string, number>()
    for (const row of unmappedRows.results || []) {
      const key = String(row.dedup_key || '')
      const match = branchIds.find((id: string) => key === id || key.startsWith(id + '-'))
      if (match) unmappedByBranch.set(match, (unmappedByBranch.get(match) || 0) + Number(row.c || 0))
    }

    const balanceById = new Map<string, any>()
    for (const branch of balance?.branches || []) {
      balanceById.set(String(branch.id), branch)
      balanceById.set(String(branch.label).toLowerCase(), branch)
    }
    const mappedById = new Map<string, any>((mappedByBranch.results || []).map((row: any) => [String(row.branch_id), row]))
    const unitsById = new Map<string, number>((learningUnitsByBranch.results || []).map((row: any) => [String(row.branch_id), Number(row.units || 0)]))

    const existing = (existingNodes.results || [])
      .filter((node: any) => !isMastered(node.id, node.label))
      .map((node: any) => {
        let meta: any = {}
        try { if (node.meta_json) meta = JSON.parse(node.meta_json) } catch {}
        const cleanedLabel = cleanBranchLabel(node.label)
        const categoryName = (node.super_category || 'cat-mind').replace('cat-', '')
        const balanceNode = balanceById.get(String(node.id)) || balanceById.get(cleanedLabel.toLowerCase())
        const mapped = mappedById.get(String(node.id))
        const state = balanceNode?.state || 'unmapped'
        return {
          id: node.id,
          label: cleanedLabel,
          type: node.type,
          super_category: node.super_category || 'cat-mind',
          category_label: (categories.results || []).find((category: any) => category.id === node.super_category)?.label || categoryName,
          parent_id: node.parent_id || 'root',
          status: prunedSet.has(node.id) ? 'pruned' : (node.status || 'active'),
          description: meta.notes || meta.description || `A focused area for understanding ${cleanedLabel}: what it means, how it works, and where it appears in real decisions or situations. It belongs to the ${categoryName} part of the map, but this branch is not a claim of mastery or a finished conclusion; sources should establish its useful scope and distinguish it from nearby topics.`,
          leaves_sample: meta.leaves || [],
          contrast_hook: meta.contrast_hook || null,
          priority_rank: priorityMap.get(node.id) ?? balanceNode?.priority_rank ?? null,
          priority_share: balanceNode?.priority_share ?? null,
          is_candidate: ['candidate', 'active', 'fresh'].includes(prunedSet.has(node.id) ? 'pruned' : (node.status || 'active')),
          // Evidence fields — real data, computed by the same learning-balance
          // model the site and Hermes read.
          consumed_count: Number(balanceNode?.consumed_count ?? 0),
          mapped_count: Number(mapped?.mapped_count ?? 0),
          unmapped_count: unmappedByBranch.get(String(node.id)) ?? 0,
          attention_share: balanceNode?.attention_share ?? 0,
          last_consumed_at: mapped?.last_consumed_at ?? balanceNode?.last_consumed_at ?? null,
          learning_units: unitsById.get(String(node.id)) ?? 0,
          srs_due: Number(balanceNode?.srs_due ?? 0),
          srs_total: Number(balanceNode?.srs_total ?? 0),
          recall_strength: balanceNode?.recall_strength ?? null,
          notes_count: Number(balanceNode?.notes_count ?? 0),
          state,
          reasons: Array.isArray(balanceNode?.reasons) ? balanceNode.reasons : [],
          frontier_state: balanceNode?.frontier_state || null,
          frontier_reasons: Array.isArray(balanceNode?.frontier_reasons) ? balanceNode.frontier_reasons : [],
          lifetime_consumed_count: Number(balanceNode?.lifetime_consumed_count ?? 0),
          accepted_units_count: Number(balanceNode?.accepted_units_count ?? 0),
          completed_lessons_count: Number(balanceNode?.completed_lessons_count ?? 0),
          latest_recall: balanceNode?.latest_recall ?? null,
        }
      })

    return c.json({
      existing,
      categories: (categories.results || []).map((category: any) => ({
        id: category.id,
        label: cleanBranchLabel(category.label),
        status: category.status || 'active',
      })),
      suggestions: [],
      total: existing.length,
      priorities_count: priorityMap.size,
      pruned_count: prunedSet.size,
      pending_count: existing.filter((b: any) => b.is_candidate).length,
      generated_at: new Date().toISOString(),
      window_days: balance?.window_days || 90,
    })
  } catch (err) {
    return c.json(safeError('Branch deck failed')(err), 500)
  }
})

// ---- /brain/branch-explanations — Apply reviewed explanations to waiting branches only.
// This is metadata-only: it never changes branch status, taste, priority, or evidence.
app.post('/branch-explanations', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<{ explanations?: Array<{ id?: string; explanation?: string }> }>()
    const items = Array.isArray(body?.explanations) ? body.explanations : []
    if (!items.length || items.length > 200) return c.json({ ok: false, error: 'explanations must contain 1..200 items' }, 400)
    let updated = 0
    const skipped: string[] = []
    for (const item of items) {
      const id = String(item?.id || '').trim()
      const explanation = String(item?.explanation || '').trim().slice(0, 1200)
      if (!id || !explanation) { if (id) skipped.push(id); continue }
      const node = await DB.prepare("SELECT meta_json, status, type FROM tree_nodes WHERE id = ?").bind(id).first<any>()
      const nodeStatus = String(node?.status || '').trim().toLowerCase()
      if (!node || !['branch', 'leaf'].includes(String(node.type || '').trim().toLowerCase()) || (nodeStatus && !['candidate', 'active', 'fresh'].includes(nodeStatus))) { skipped.push(id); continue }
      let meta: any = {}
      try { if (node.meta_json) meta = JSON.parse(node.meta_json) } catch {}
      meta.description = explanation
      meta.notes = explanation
      meta.explanation_source = 'agy'
      meta.explanation_updated_at = new Date().toISOString()
      await DB.prepare("UPDATE tree_nodes SET meta_json = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(meta), id).run()
      updated += 1
    }
    return c.json({ ok: true, updated, skipped })
  } catch (err) { return c.json(safeError('Branch explanations failed')(err), 500) }
})

// ---- /brain/branch-swipe — Handle a branch decision.
// Every action writes the canonical tree state plus one reversible typed
// profile assertion and a taste signal; prune is a reversible user exclusion
// (never an "applied" feedback proposal), priority keeps one explicit renumbered
// rank, hold stays neutral, and undo reverses the side effects — not just the
// tree row. Add only registers an active exploration branch; it gets no taste
// signal until evidence exists.
app.post('/branch-swipe', async (c) => {
  const { DB } = c.env
  try {
    const { id, action, label, super_category, rationale, description, leaves_sample, contrast_hook, parent_id, restore_status, restore_priority_rank, restore_action } = await c.req.json<{
      id: string
      action: 'keep' | 'prune' | 'priority' | 'hold' | 'add' | 'update' | 'undo'
      label?: string
      super_category?: string
      rationale?: string
      description?: string
      leaves_sample?: string[]
      contrast_hook?: string
      parent_id?: string
      restore_status?: string
      restore_priority_rank?: number | null
      restore_action?: 'keep' | 'prune' | 'priority' | 'hold' | 'add'
    }>()

    if (!id || !isNonEmptyStr(id, 100)) return c.json({ error: 'id required' }, 400)
    if (!['keep', 'prune', 'priority', 'hold', 'add', 'update', 'undo'].includes(action)) return c.json({ error: 'invalid action' }, 400)

    const branchLabel = label || id.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    const cat = super_category || 'cat-mind'
    const suppliedMeta = {
      description: String(description || rationale || '').slice(0, 1000),
      leaves: Array.isArray(leaves_sample) ? leaves_sample.map((item) => String(item).slice(0, 120)).slice(0, 12) : [],
      contrast_hook: String(contrast_hook || '').slice(0, 500),
    }

    const log = (summary: string, details: any) =>
      DB.prepare("INSERT INTO update_log (kind, summary, details_json) VALUES ('tree_change', ?, ?)")
        .bind(summary, JSON.stringify({ id, action, ...details })).run().catch(() => {})
    type PriorityRow = { branch_id: string; label: string | null; rationale: string | null }
    const readPriorityOrder = async (): Promise<PriorityRow[]> => {
      const rows = await DB.prepare('SELECT branch_id,label,rationale FROM priorities ORDER BY rank ASC').all<PriorityRow>()
      return rows.results || []
    }
    const writePriorityOrder = async (rows: PriorityRow[]) => {
      await DB.batch([
        DB.prepare('DELETE FROM priorities'),
        ...rows.map((row, index) => DB.prepare('INSERT INTO priorities (rank,branch_id,label,rationale) VALUES (?,?,?,?)')
          .bind(index + 1, row.branch_id, row.label, row.rationale)),
      ])
    }

    if (action === 'undo') {
      if (String(restore_status) === 'candidate') {
        // The branch was created by an explicit Add and did not exist on the map
        // before, so undo removes it entirely rather than restoring a status.
        await DB.prepare('DELETE FROM tree_nodes WHERE id = ?').bind(id).run()
        await DB.prepare('DELETE FROM branch_exploration WHERE id = ?').bind(id).run().catch(() => {})
        await DB.prepare('DELETE FROM priorities WHERE branch_id = ?').bind(id).run().catch(() => {})
        await DB.prepare('DELETE FROM taste_vectors WHERE topic = ?').bind(id).run().catch(() => {})
        await DB.prepare("UPDATE profile_assertions SET status='inactive', updated_at=datetime('now') WHERE assertion_key=? AND status='active'")
          .bind(`user.profile.branch_preference.${id}`).run().catch(() => {})
        await log(`Branch ${branchLabel} removed (add undone)`, {})
      } else {
      const restoredStatus = ['love', 'pruned', 'held', 'active', 'candidate', 'fresh', 'standard', 'locked'].includes(String(restore_status))
        ? String(restore_status)
        : 'active'
      await DB.prepare("UPDATE tree_nodes SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(restoredStatus, id).run()
      if (restore_action === 'priority' || restore_action === 'prune' || !restore_action) {
        const priorities = (await readPriorityOrder()).filter((priority) => priority.branch_id !== id)
        if (typeof restore_priority_rank === 'number' && restore_priority_rank > 0) {
          priorities.splice(Math.min(restore_priority_rank - 1, priorities.length), 0, {
            branch_id: id,
            label: branchLabel,
            rationale: rationale || 'Restored previous branch priority',
          })
        }
        await writePriorityOrder(priorities)
      }
      if (restoredStatus !== 'pruned') {
        await DB.prepare("UPDATE branch_exploration SET is_pruned = 0, lifecycle_state = 'active', pruning_reason = NULL, updated_at = datetime('now') WHERE id = ?")
          .bind(id).run().catch(() => {})
      }
      // Reverse the typed profile assertion created by the previous decision.
      await DB.prepare("UPDATE profile_assertions SET status='inactive', updated_at=datetime('now') WHERE assertion_key=? AND status='active'")
        .bind(`user.profile.branch_preference.${id}`).run().catch(() => {})
      await log(`Branch ${branchLabel} restored to ${restoredStatus}`, { restoredStatus })
      }
    } else if (action === 'update') {
      const existing = await DB.prepare("SELECT label,status,super_category,parent_id,meta_json FROM tree_nodes WHERE id=? AND type='branch'").bind(id).first<any>()
      if (!existing) return c.json({ error: 'branch not found' }, 404)
      const nextParent = parent_id || super_category || existing.parent_id || 'root'
      const category = await DB.prepare("SELECT id FROM tree_nodes WHERE id=? AND type='category' AND status!='pruned'").bind(nextParent).first<any>()
      if (!category) return c.json({ error: 'valid category required' }, 400)
      let nextMeta: Record<string, unknown> = {}
      try { nextMeta = existing.meta_json ? JSON.parse(existing.meta_json) : {} } catch {}
      if (description !== undefined || rationale !== undefined) nextMeta.description = suppliedMeta.description
      if (Array.isArray(leaves_sample)) nextMeta.leaves = suppliedMeta.leaves
      if (contrast_hook !== undefined) nextMeta.contrast_hook = suppliedMeta.contrast_hook
      await DB.prepare(`UPDATE tree_nodes SET label=?,super_category=?,parent_id=?,meta_json=?,updated_at=datetime('now') WHERE id=?`)
        .bind(branchLabel, nextParent, nextParent, JSON.stringify(nextMeta), id).run()
      await DB.prepare('UPDATE priorities SET label=? WHERE branch_id=?').bind(branchLabel, id).run().catch(() => {})
      await log(`Branch ${branchLabel} details updated`, { category: nextParent })
    } else if (action === 'keep') {
      await DB.prepare("INSERT INTO tree_nodes (id, type, label, super_category, parent_id, status, updated_at) VALUES (?, 'branch', ?, ?, 'root', 'love', datetime('now')) ON CONFLICT(id) DO UPDATE SET status = 'love', updated_at = datetime('now')")
        .bind(id, branchLabel, cat).run()
      await log(`Branch ${branchLabel} kept and updated to LOVE status`, {})
    } else if (action === 'prune') {
      await DB.prepare("INSERT INTO tree_nodes (id, type, label, super_category, parent_id, status, updated_at) VALUES (?, 'branch', ?, ?, 'root', 'pruned', datetime('now')) ON CONFLICT(id) DO UPDATE SET status = 'pruned', updated_at = datetime('now')")
        .bind(id, branchLabel, cat).run()
      await DB.prepare("INSERT INTO branch_exploration (id, name, path, lifecycle_state, confidence_score, is_pruned, pruning_reason, updated_at) VALUES (?, ?, ?, 'pruned', 0, 1, 'Pruned in Branch Deck', datetime('now')) ON CONFLICT(id) DO UPDATE SET is_pruned = 1, lifecycle_state = 'pruned', pruning_reason = 'Pruned in Branch Deck', updated_at = datetime('now')")
        .bind(id, branchLabel, id).run()
      // A pruned branch stops steering Compass priorities.
      await writePriorityOrder((await readPriorityOrder()).filter((priority) => priority.branch_id !== id))
      await log(`Branch ${branchLabel} pruned`, {})
    } else if (action === 'priority') {
      await DB.prepare("INSERT INTO tree_nodes (id, type, label, super_category, parent_id, status, updated_at) VALUES (?, 'branch', ?, ?, 'root', 'love', datetime('now')) ON CONFLICT(id) DO UPDATE SET status = 'love', updated_at = datetime('now')")
        .bind(id, branchLabel, cat).run()
      const priorities = await readPriorityOrder()
      const existingPriority = priorities.find((priority) => priority.branch_id === id)
      await writePriorityOrder([
        { branch_id: id, label: branchLabel, rationale: rationale || existingPriority?.rationale || 'Promoted in Branch Deck' },
        ...priorities.filter((priority) => priority.branch_id !== id),
      ])
      await log(`Branch ${branchLabel} promoted to priority #1`, { rank: 1 })
    } else if (action === 'hold') {
      await DB.prepare("INSERT INTO tree_nodes (id, type, label, super_category, parent_id, status, updated_at) VALUES (?, 'branch', ?, ?, 'root', 'held', datetime('now')) ON CONFLICT(id) DO UPDATE SET status = 'held', updated_at = datetime('now')")
        .bind(id, branchLabel, cat).run()
      await log(`Branch ${branchLabel} held`, {})
    } else if (action === 'add') {
      const nextParent = parent_id || cat
      const category = await DB.prepare("SELECT id FROM tree_nodes WHERE id=? AND type='category' AND status!='pruned'").bind(nextParent).first<any>()
      if (!category) return c.json({ error: 'valid category required' }, 400)
      await DB.prepare("INSERT INTO tree_nodes (id, type, label, super_category, parent_id, status, meta_json, updated_at) VALUES (?, 'branch', ?, ?, ?, 'active', ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET label = excluded.label, super_category = excluded.super_category, parent_id = excluded.parent_id, status = 'active', meta_json = excluded.meta_json, updated_at = datetime('now')")
        .bind(id, branchLabel, nextParent, nextParent, JSON.stringify(suppliedMeta)).run()
      await log(`Branch ${branchLabel} added as active exploration`, {})
    }

    // 1. Taste signal. Prune is an explicit negative (floor 0.5/5); hold stays
    // neutral; add gets no signal until sources are mapped to it. Undo removes
    // the signal the decision wrote rather than re-applying it.
    let affinityScore: number | null = null
    if (action === 'undo') {
      await DB.prepare('DELETE FROM taste_vectors WHERE topic = ?').bind(id).run().catch(() => {})
    } else if (action !== 'add' && action !== 'update') {
      affinityScore = action === 'keep' || action === 'priority' ? 5.0 : action === 'prune' ? 0.5 : 2.5
      try {
        await DB.prepare("INSERT INTO taste_vectors (topic, affinity_score, consumption_count, last_consumed_at, updated_at) VALUES (?, ?, 1, datetime('now'), datetime('now')) ON CONFLICT(topic) DO UPDATE SET affinity_score = excluded.affinity_score, updated_at = datetime('now')")
          .bind(id, affinityScore).run()
      } catch {}
    }

    // 2. Typed profile assertion — reversible, category reflects the decision's
    // meaning. prune is an exclusion (Compass blocks it), priority is a priority
    // topic (Compass steers toward it), hold stays a weak hypothesis, add is an
    // active exploration signal. No feedback proposal is fabricated as "applied".
    if (action !== 'undo' && action !== 'update') {
      try {
        await applyProfileAssertion(DB, {
          assertionKey: `user.profile.branch_preference.${id}`,
          category: action === 'prune' ? 'exclusion' : action === 'priority' ? 'priority' : action === 'add' ? 'active_exploration' : 'topic_affinity',
          value: {
            branch_id: id,
            label: branchLabel,
            action,
            status: action === 'keep' || action === 'priority' ? 'love' : action === 'prune' ? 'pruned' : action === 'add' ? 'active' : 'held',
            super_category: cat,
            timestamp: new Date().toISOString(),
          },
          confidence: action === 'hold' ? 0.6 : 1.0,
          status: action === 'hold' ? 'hypothesis' : 'active',
          sourceKind: 'user',
          evidence: [{ source: 'branch_deck', action, timestamp: new Date().toISOString() }],
          actorType: 'user',
          decisionSource: 'user',
          directUserStatement: true,
        })
      } catch {}
    }

    // 3. Sync profile recent_signal
    if (action !== 'update') {
      try {
        const lastSwipes = await DB.prepare("SELECT summary FROM update_log WHERE kind = 'tree_change' ORDER BY ts DESC LIMIT 8").all<any>()
        const summaries = (lastSwipes.results || []).map((r: any) => r.summary).join(' | ')
        await DB.prepare("UPDATE profile SET recent_signal = ?, last_synced_at = datetime('now') WHERE id = 1").bind(`Branch decisions: ${summaries}`).run()
      } catch {}
    }

    const profileState = await DB.prepare("SELECT last_synced_at, recent_signal FROM profile WHERE id = 1").first<any>().catch(() => null)
    const assertionState = await DB.prepare("SELECT updated_at FROM profile_assertions WHERE assertion_key = ?").bind(`user.profile.branch_preference.${id}`).first<any>().catch(() => null)

    return c.json({
      ok: true,
      id,
      action,
      affinity_score: affinityScore,
      profile_sync: {
        synced_at: profileState?.last_synced_at || null,
        assertion_updated_at: assertionState?.updated_at || null,
        context_refresh: action === 'update' ? 'Branch metadata updated without changing recommendation preferences.' : 'Compass context will include this branch decision on its next read.',
      },
    })
  } catch (err) {
    return c.json(safeError('Branch swipe failed')(err), 500)
  }
})

// ---- /brain/branch-suggest — grounded, review-before-commit new-branch ideas
// Builds a bounded grounding packet from the canonical Compass context plus the
// live branch deck, asks the LLM (same freeAi wrapper as /ai/suggest) for new
// branch candidates, and returns them for the user to review and Add. Nothing
// is written here: suggestions never mutate the map or the profile. If the LLM
// is unavailable the endpoint still succeeds with an empty list, and the client
// falls back to the grounded Hermes copy-prompt.
const SUGGEST_MODES: Record<string, string> = {
  surprise: 'Suggest an unexpected but genuinely promising direction not obviously implied by the current map — a creative leap grounded in this person\'s learning profile. Avoid anything already on the map.',
  expand: 'Suggest a natural next expansion of an existing loved or high-priority branch — an adjacent subtopic that would deepen that branch.',
  bridge: 'Suggest a new hybrid branch that connects two existing branches which rarely appear together, creating a novel synthesis.',
  challenge: 'Suggest a counterbalancing branch that challenges a dominant conviction or over-weighted direction — a productive contrarian path, not a troll.',
}
const SLUG_RE = /[^a-z0-9]+/g

app.post('/branch-suggest', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<{ count?: number; mode?: string }>().catch(() => ({} as { count?: number; mode?: string }))
    const mode = Object.prototype.hasOwnProperty.call(SUGGEST_MODES, String(body?.mode)) ? String(body!.mode) : 'surprise'
    const count = Math.max(1, Math.min(Number(body?.count) || 3, 6))

    const [context, nodes, assertions] = await Promise.all([
      loadCompassContext(DB).catch(() => null),
      DB.prepare("SELECT id, label, status, super_category FROM tree_nodes WHERE type='branch' ORDER BY CASE status WHEN 'love' THEN 0 WHEN 'priority' THEN 0 ELSE 1 END, id").all<any>().catch(() => ({ results: [] })),
      DB.prepare("SELECT category, value_json, confidence, status FROM profile_assertions WHERE status='active' ORDER BY confidence DESC LIMIT 40").all<any>().catch(() => ({ results: [] })),
    ])

    const branchRows = nodes.results || []
    const existingIds = new Set<string>(branchRows.map((n: any) => String(n.id).toLowerCase()))
    const existingLabels = new Set<string>(branchRows.map((n: any) => String(n.label || n.id).toLowerCase()))
    const loved = branchRows.filter((n: any) => n.status === 'love' || n.status === 'priority').map((n: any) => String(n.label || n.id))
    const held = branchRows.filter((n: any) => n.status === 'held').map((n: any) => String(n.label || n.id))
    const pruned = branchRows.filter((n: any) => n.status === 'pruned').map((n: any) => String(n.label || n.id))
    const categories = [...new Set(branchRows.map((n: any) => String(n.super_category || 'cat-mind')).filter(Boolean))]

    const affinities: Array<[string, number]> = []
    if (context?.topicAffinities) for (const [topic, value] of context.topicAffinities) if (topic) affinities.push([String(topic), Number(value)])
    affinities.sort((a, b) => b[1] - a[1])

    const creators: Array<[string, number]> = []
    if (context?.creatorTrust) for (const [key, info] of context.creatorTrust) if (key && info.count > 0) creators.push([String(key), Number(info.average)])
    creators.sort((a, b) => b[1] - a[1])

    const priorityTopics = context?.priorityTopics ? [...context.priorityTopics].filter(Boolean).slice(0, 8) : []
    const blocked = (context?.blockedEntities || []).filter(Boolean).slice(0, 15)
    const recentFormats = (context?.recentFormats || []).filter(Boolean).slice(0, 4)

    const grounding = [
      `LOVED / HIGH-PRIORITY BRANCHES: ${loved.length ? loved.slice(0, 12).join(', ') : '(none yet)'}`,
      `HELD (neutral) BRANCHES: ${held.length ? held.slice(0, 8).join(', ') : '(none)'}`,
      `PRUNED / EXCLUDED (never suggest): ${pruned.length ? pruned.slice(0, 10).join(', ') : '(none)'}`,
      `KNOWN CATEGORIES: ${categories.slice(0, 10).join(', ') || 'cat-mind'}`,
      `EXPLICIT PRIORITY TOPICS: ${priorityTopics.length ? priorityTopics.join(', ') : '(none)'}`,
      `BLOCKED ENTITIES TO AVOID: ${blocked.length ? blocked.join(', ') : '(none)'}`,
      `STRONGEST TOPIC AFFINITIES: ${affinities.slice(0, 8).map(([t, v]) => `${t} (${v.toFixed(1)})`).join(', ') || '(no signal yet)'}`,
      `HIGHEST-TRUST CREATORS: ${creators.slice(0, 6).map(([k]) => k).join(', ') || '(no signal yet)'}`,
      `RECENT FORMATS: ${recentFormats.join(', ') || '(no signal yet)'}`,
    ].join('\n')

    const prompt = [
      grounding,
      '',
      `Generate up to ${count} new knowledge-branch candidates for this learner. Mode: ${mode.toUpperCase()}.`,
      SUGGEST_MODES[mode],
      '',
      'Rules:',
      '- Each label must be a concrete, non-obvious branch name (2-6 words), not already on the map, not in the blocked/excluded list.',
      '- super_category must be one of the KNOWN CATEGORIES (or a natural new category prefixed cat-).',
      '- description: 1-2 sentences on what the branch is and why it matters to this learner.',
      '- plain_language: give a comprehensive but concise orientation in everyday language (2-3 sentences): define the scope, include one concrete example or mechanism, and state what this branch is not about.',
      '- leaves_sample: 3-6 concrete subtopics or source directions inside the branch.',
      '- contrast_hook: one sharp sentence contrasting this direction with what the learner already favors.',
      '- why_now: one sentence on why now, tied to the grounding above.',
      '- evidence_grounding: which specific affinity, priority, creator, or gap in the grounding supports this.',
      '- evidence_confidence: one of "low", "medium", or "high". Use low when the branch is mostly exploratory and has no direct source evidence.',
      '- overlap_candidates: 0-3 existing branch labels this may overlap with; do not invent labels.',
      '- suggested_next_move: one cautious next step such as "Hold until one source confirms the scope" or "Keep and explore one primary source".',
      '- uncertainty_note: one sentence naming what is still unknown and making uncertainty explicit.',
      'Return ONLY valid JSON — an array of objects with keys: label, super_category, description, plain_language, leaves_sample, contrast_hook, why_now, evidence_grounding, evidence_confidence, overlap_candidates, suggested_next_move, uncertainty_note. No markdown, no commentary.',
    ].join('\n')

    const result = await freeAi(c.env, 'You are the branch curator for a private learning OS. Return ONLY valid JSON as instructed.', prompt, 2048)
    const suggestions: any[] = []
    if (result && result.text) {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const label = String(item?.label || '').trim().slice(0, 100)
              if (!label) continue
              const low = label.toLowerCase()
              if (existingLabels.has(low) || existingIds.has(low)) continue
              if (blocked.some((b: string) => low.includes(b.toLowerCase()) || String(b).toLowerCase().includes(low))) continue
              const slug = label.toLowerCase().replace(SLUG_RE, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'branch'
              suggestions.push({
                id: `branch-${slug}`,
                label,
                super_category: /^cat-/.test(String(item?.super_category || '')) ? String(item.super_category).slice(0, 60) : `cat-${String(item?.super_category || 'mind').toLowerCase().replace(SLUG_RE, '-').slice(0, 40)}`,
                description: String(item?.description || '').trim().slice(0, 1000),
                plain_language: String(item?.plain_language || '').trim().slice(0, 500),
                leaves_sample: Array.isArray(item?.leaves_sample) ? item.leaves_sample.map((leaf: any) => String(leaf).trim().slice(0, 120)).filter(Boolean).slice(0, 12) : [],
                contrast_hook: String(item?.contrast_hook || '').trim().slice(0, 500),
                why_now: String(item?.why_now || '').trim().slice(0, 500),
                evidence_grounding: String(item?.evidence_grounding || '').trim().slice(0, 300),
                evidence_confidence: ['low', 'medium', 'high'].includes(String(item?.evidence_confidence || '').toLowerCase()) ? String(item.evidence_confidence).toLowerCase() : 'low',
                overlap_candidates: Array.isArray(item?.overlap_candidates) ? item.overlap_candidates.map((label: any) => String(label).trim().slice(0, 100)).filter(Boolean).slice(0, 3) : [],
                suggested_next_move: String(item?.suggested_next_move || '').trim().slice(0, 300),
                uncertainty_note: String(item?.uncertainty_note || '').trim().slice(0, 300),
                status: 'candidate',
                source: 'suggest',
                mode,
              })
              if (suggestions.length >= count) break
            }
          }
        } catch { /* malformed LLM output — fall through with what parsed */ }
      }
    }

    return c.json({
      ok: true,
      mode,
      model: result?.model || null,
      suggestions,
      fallback: !result,
      message: result ? undefined : 'LLM unavailable — suggest is read-only; the grounded Hermes copy-prompt is the fallback.',
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    return c.json(safeError('Branch suggest failed')(err), 500)
  }
})

// ---- /brain/profile/sync-swipes — Sync all swiped branch reactions to canonical profile assertions
app.post('/profile/sync-swipes', async (c) => {
  const { DB } = c.env
  try {
    const nodes = await DB.prepare("SELECT id, label, status, super_category FROM tree_nodes WHERE status IN ('love','pruned','held')").all<any>()
    let synced = 0
    for (const node of nodes.results || []) {
      const affinityScore = node.status === 'love' ? 5.0 : node.status === 'pruned' ? 0.0 : 2.5
      await DB.prepare(
        "INSERT INTO taste_vectors (topic, affinity_score, consumption_count, last_consumed_at, updated_at) VALUES (?, ?, 1, datetime('now'), datetime('now')) ON CONFLICT(topic) DO UPDATE SET affinity_score = excluded.affinity_score, updated_at = datetime('now')"
      ).bind(node.id, affinityScore).run().catch(() => {})

      await applyProfileAssertion(DB, {
        assertionKey: `user.profile.branch_preference.${node.id}`,
        category: 'topic_affinity',
        value: JSON.stringify({ branch_id: node.id, label: node.label, status: node.status, super_category: node.super_category }),
        confidence: 1.0,
        sourceKind: 'user',
        evidence: [{ source: 'profile_sync_swipes', status: node.status }],
        actorType: 'user',
        decisionSource: 'user',
        directUserStatement: true,
      }).catch(() => {})
      synced++
    }

    const lastSwipes = await DB.prepare("SELECT summary FROM update_log WHERE kind = 'tree_change' ORDER BY ts DESC LIMIT 12").all<any>()
    const summaries = (lastSwipes.results || []).map((r: any) => r.summary).join(' | ')
    await DB.prepare("UPDATE profile SET recent_signal = ?, last_synced_at = datetime('now') WHERE id = 1").bind(`Synced Branch Swipes (${synced}): ${summaries}`).run()

    return c.json({ ok: true, synced_count: synced })
  } catch (err) {
    return c.json(safeError('Sync swipes failed')(err), 500)
  }
})

// ---- /brain/priorities — bulk replace priority list
app.post('/priorities', async (c) => {
  const { DB } = c.env
  try {
    const body = await c.req.json<Array<{ rank: number; branch_id: string; label?: string; rationale?: string }>>()
    if (!Array.isArray(body)) return c.json({ error: 'array required' }, 400)
    const stmts: D1PreparedStatement[] = [DB.prepare('DELETE FROM priorities')]
    for (const p of body) {
      if (typeof p.rank !== 'number' || !isNonEmptyStr(p.branch_id, 100)) continue
      if (p.rationale && !isValidLength(p.rationale, 0, 500)) return c.json({ error: 'rationale too long (max 500 chars)' }, 400)
      stmts.push(DB.prepare('INSERT INTO priorities (rank, branch_id, label, rationale) VALUES (?, ?, ?, ?)').bind(p.rank, p.branch_id, p.label || null, p.rationale || null))
    }
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50))
    return c.json({ ok: true, count: body.length })
  } catch (err) {
    return c.json(safeError('Priorities update failed')(err), 500)
  }
})

// ---- /brain/node — create a new tree node
app.post('/node', async (c) => {
  const { DB } = c.env
  try {
    const { id, label, type, super_category, parent_id } = await c.req.json<{ id?: string; label: string; type?: string; super_category?: string; parent_id?: string }>()
    if (!isNonEmptyStr(label, 100)) return c.json({ error: 'label required (max 100 chars)' }, 400)
    const nodeId = (id && isNonEmptyStr(id, 80)) ? id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : label.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') + '-' + Date.now().toString(36)
    const nodeType = type || 'leaf'
    const cat = super_category || 'mind'
    const parent = parent_id || 'root'
    await DB.prepare(
      'INSERT INTO tree_nodes (id, type, label, status, super_category, parent_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(nodeId, nodeType, label.trim(), 'active', cat.startsWith('cat-') ? cat : 'cat-' + cat, parent).run()
    return c.json({ ok: true, node: { id: nodeId, label: label.trim(), type: nodeType, status: 'active', super_category: 'cat-' + cat, parent_id: parent } })
  } catch (err) {
    return c.json(safeError('Create node failed')(err), 500)
  }
})

app.put('/node/:id', async (c) => {
  const body: { label?: string; type?: string; super_category?: string; parent_id?: string; status?: string; meta_json?: string } = await c.req.json().catch(() => ({}))
  const id = c.req.param('id')
  const current = await c.env.DB.prepare('SELECT id FROM tree_nodes WHERE id=?').bind(id).first()
  if (!current) return c.json({ error: 'not found' }, 404)
  const fields: string[] = [], values: any[] = []
  for (const key of ['label', 'type', 'super_category', 'parent_id', 'status', 'meta_json'] as const) {
    if (body[key] !== undefined) { fields.push(`${key}=?`); values.push(body[key]) }
  }
  if (!fields.length) return c.json({ ok: true, count: 0 })
  fields.push("updated_at=datetime('now')")
  await c.env.DB.prepare(`UPDATE tree_nodes SET ${fields.join(',')} WHERE id=?`).bind(...values, id).run()
  return c.json({ ok: true })
})

app.delete('/node/:id', async (c) => {
  const id = c.req.param('id')
  if (id === 'root') return c.json({ error: 'root cannot be deleted' }, 400)
  const node = await c.env.DB.prepare('SELECT type FROM tree_nodes WHERE id=?').bind(id).first<any>()
  if (!node) return c.json({ error: 'not found' }, 404)
  const child = await c.env.DB.prepare('SELECT id FROM tree_nodes WHERE parent_id=? LIMIT 1').bind(id).first()
  if (child) return c.json({ error: 'node_has_children', message: 'Delete or move child nodes first.' }, 409)
  await c.env.DB.prepare('DELETE FROM tree_nodes WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

export default app
