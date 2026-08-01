import { Hono } from 'hono'
import { Bindings, Recommendation, safeError, isNonEmptyStr, isValidLength, VALID_LOG_KINDS } from '../lib'
import { cached } from '../cache'

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
    const node = { ...row, x, y, meta_json: undefined }
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
      "SELECT id, video_title, creator, user_rating, status, consumed_date, dedup_key FROM recommendations WHERE dedup_key LIKE ? ORDER BY consumed_date DESC"
    ).bind(id + '-%').all()
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

// ---- /brain/profile — full profile snapshot (cached 30s TTL)
app.get('/profile', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const recentLimit = Math.min(Math.max(parseInt(c.req.query('recent_limit') || '10'), 1), 50)
  try {
    const data = await cached('brain.profile.' + recentLimit, 30000, async () => {
      const [profile, priorities, mastered, blacklist, patterns, recent, feedSources, srsCards, srsDrafts, sessions, notes, creators, artifactsCount, proposalsCount] = await Promise.all([
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
        DB.prepare("SELECT creator, COUNT(*) as count FROM recommendations WHERE creator IS NOT NULL AND creator != '' AND status='consumed' GROUP BY creator ORDER BY count DESC LIMIT 10").all().catch(() => ({ results: [] })),
        DB.prepare("SELECT COUNT(*) as count FROM artifacts").first<{ count: number }>().catch(() => ({ count: 0 })),
        DB.prepare("SELECT COUNT(*) as count FROM feedback_proposals WHERE status = 'pending'").first<{ count: number }>().catch(() => ({ count: 0 })),
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
        infrastructure_stats: {
          artifacts_count: artifactsCount?.count || 0,
          pending_proposals_count: proposalsCount?.count || 0,
          database_name: 'recommendations-db',
          worker_environment: 'production',
        },
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

// ---- /brain/resurfacing — items due for review
app.get('/resurfacing', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const today = new Date().toISOString().split('T')[0]
    const due = await DB.prepare(
      "SELECT r.*, rec.video_title, rec.creator, rec.user_rating FROM resurfacing r LEFT JOIN recommendations rec ON rec.id = r.recommendation_id WHERE r.resolved_at IS NULL AND r.due_at <= ? ORDER BY r.due_at ASC"
    ).bind(today).all()
    return c.json({ due: due.results || [], today })
  } catch (err) {
    return c.json(safeError('Resurfacing failed')(err), 500)
  }
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
          INSERT OR REPLACE INTO tree_nodes (id, type, label, super_category, parent_id, status, round_label, meta_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          n.id, n.type || 'branch', n.label || n.id,
          n.super_category || null, n.parent_id || null,
          n.status || null, n.round_label || null,
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
    return c.json({ ok: true, count: fields.length - 1 })
  } catch (err) {
    return c.json(safeError('Profile update failed')(err), 500)
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
