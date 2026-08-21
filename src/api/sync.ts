import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * POST /sync/push
 * Accept batch delta from Hermes/agent/taste-mapper and apply to D1.
 * Idempotent via INSERT OR REPLACE on stable IDs.
 */
app.post('/push', async (c) => {
  const { DB } = c.env
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const stmts: D1PreparedStatement[] = []
  const captureStmts: D1PreparedStatement[] = []
  let count = 0

  // Recommendations delta
  if (Array.isArray(body.recommendations)) {
    for (const rec of body.recommendations) {
      if (!rec.id || !rec.video_title) continue
      const now = new Date().toISOString()
      stmts.push(DB.prepare(
        `INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, user_score, user_review, dedup_key, synergy_bundle_id, consumed_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           video_title=excluded.video_title, creator=excluded.creator, content_type=excluded.content_type,
           video_url=excluded.video_url, why_this=excluded.why_this, status=excluded.status,
           user_rating=excluded.user_rating, user_score=excluded.user_score, user_review=excluded.user_review`
      ).bind(rec.id, rec.video_title, rec.creator || null, rec.content_type || 'article',
        rec.video_url, rec.why_this || null, rec.verified || now.split('T')[0],
        rec.status || 'active', rec.user_rating || 'unset', rec.user_score || null,
        rec.user_review || null, rec.dedup_key || rec.id, null, rec.consumed_date || null, now))
      count++
      captureStmts.push(DB.prepare(`INSERT OR IGNORE INTO recommendation_meta (recommendation_id,learning_state,source_metadata_json,updated_at) VALUES (?,'captured',?,datetime('now'))`).bind(rec.id, JSON.stringify({ synced: true })))
    }
  }

  // Tree nodes delta
  if (Array.isArray(body.tree_nodes)) {
    for (const n of body.tree_nodes) {
      if (!n.id) continue
      stmts.push(DB.prepare(
        `INSERT OR REPLACE INTO tree_nodes (id, type, label, super_category, parent_id, status, round_label, meta_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(n.id, n.type || 'leaf', n.label || n.id, n.super_category || null,
        n.parent_id || null, n.status || null, n.round_label || null,
        n.meta_json ? (typeof n.meta_json === 'string' ? n.meta_json : JSON.stringify(n.meta_json)) : null))
      count++
    }
  }

  // Patterns delta
  if (Array.isArray(body.patterns)) {
    for (const p of body.patterns) {
      if (!p.id || !p.description) continue
      stmts.push(DB.prepare(
        `INSERT OR REPLACE INTO patterns (id, description, evidence_json, confirmed_date, strength, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(p.id, p.description,
        p.evidence_json ? (typeof p.evidence_json === 'string' ? p.evidence_json : JSON.stringify(p.evidence_json)) : null,
        p.confirmed_date || null, p.strength || 'confirmed', p.notes || null))
      count++
    }
  }

  // Blacklist delta
  if (Array.isArray(body.blacklist)) {
    for (const b of body.blacklist) {
      if (!b.id || !b.name) continue
      stmts.push(DB.prepare(
        `INSERT OR REPLACE INTO blacklist (id, name, work, reason, severity)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(b.id, b.name, b.work || null, b.reason || null, b.severity ?? 3))
      count++
    }
  }

  // Profile upsert
  if (body.profile) {
    const p = body.profile
    stmts.push(DB.prepare(
      `INSERT OR REPLACE INTO profile (id, identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, operational_style_json, patterns_summary_json, recent_signal, last_synced_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      p.identity || null,
      p.mega_priority ? JSON.stringify(p.mega_priority) : null,
      p.core_filter || null, p.reaction_style || null, p.quality_rules || null,
      p.operational_style || null, p.patterns_summary || null, p.recent_signal || null
    ))
    count++
  }

  if (stmts.length === 0) return c.json({ ok: true, count: 0 })

  try {
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50))
    for (let i = 0; i < captureStmts.length; i += 50) await DB.batch(captureStmts.slice(i, i + 50))
    return c.json({ ok: true, count })
  } catch (err) {
    return c.json(safeError('Sync push failed')(err), 500)
  }
})

/**
 * GET /sync/pull
 * Returns last-N-days of changes for external mirroring (Obsidian, etc.)
 * Accepts optional ?since=YYYY-MM-DD or defaults to 7 days ago.
 */
app.get('/pull', async (c) => {
  const { DB } = c.env
  const since = c.req.query('since') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  try {
    const [recs, nodes, patterns, blacklist, profile] = await Promise.all([
      DB.prepare(
        "SELECT * FROM recommendations WHERE (created_at >= ? OR (consumed_date IS NOT NULL AND consumed_date >= ?)) ORDER BY created_at DESC"
      ).bind(since, since).all(),
      DB.prepare(
        "SELECT * FROM tree_nodes WHERE updated_at >= ? ORDER BY updated_at DESC"
      ).bind(since).all(),
      DB.prepare("SELECT * FROM patterns ORDER BY confirmed_date DESC").all(),
      DB.prepare("SELECT * FROM blacklist ORDER BY added_at DESC").all(),
      DB.prepare("SELECT * FROM profile WHERE id = 1").first(),
    ])

    return c.json({
      since,
      pulled_at: new Date().toISOString(),
      recommendations: recs.results || [],
      tree_nodes: nodes.results || [],
      patterns: patterns.results || [],
      blacklist: blacklist.results || [],
      profile: profile || null,
      counts: {
        recommendations: (recs.results || []).length,
        tree_nodes: (nodes.results || []).length,
        patterns: (patterns.results || []).length,
      }
    })
  } catch (err) {
    return c.json(safeError('Sync pull failed')(err), 500)
  }
})

export default app
