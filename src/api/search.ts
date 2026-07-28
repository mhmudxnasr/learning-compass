import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const q = (c.req.query('q') || '').trim()
  if (!q || q.length < 2) return c.json({ groups: { recs: [], nodes: [], vault: [], patterns: [] }, q })

  try {
    const [fts, nodes, vault, patterns] = await Promise.all([
      DB.prepare("SELECT source, ref_id FROM search_idx WHERE search_idx MATCH ? LIMIT 16").bind(q).all<{ source: string, ref_id: string }>(),
      DB.prepare("SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8")
        .bind(`%${q}%`, `%${q}%`).all<any>(),
      DB.prepare("SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8")
        .bind(`%${q}%`).all<any>(),
      DB.prepare("SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8")
        .bind(`%${q}%`, `%${q}%`).all<any>(),
    ])

    const recIds: string[] = []
    for (const r of (fts.results || [])) {
      if (r.source === 'rec') recIds.push(r.ref_id)
    }

    let recs: any[] = []
    if (recIds.length > 0) {
      const placeholders = recIds.map(() => '?').join(',')
      const res = await DB.prepare(
        `SELECT id, video_title as title, creator, content_type, status, user_rating
         FROM recommendations WHERE id IN (${placeholders}) ORDER BY created_at DESC`
      ).bind(...recIds).all<any>()
      recs = res.results || []
    }

    return c.json({
      q,
      groups: {
        recs,
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || [],
      },
    })
  } catch {
    const like = `%${q}%`
    const [recs, nodes, vault, patterns] = await Promise.all([
      DB.prepare(`SELECT id, video_title as title, creator, content_type, status, user_rating FROM recommendations WHERE video_title LIKE ? OR creator LIKE ? OR why_this LIKE ? ORDER BY created_at DESC LIMIT 8`)
        .bind(like, like, like).all<any>(),
      DB.prepare(`SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8`)
        .bind(like, like).all<any>(),
      DB.prepare(`SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8`)
        .bind(like).all<any>(),
      DB.prepare(`SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8`)
        .bind(like, like).all<any>(),
    ])
    return c.json({
      q,
      groups: {
        recs: recs.results || [],
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || [],
      },
    })
  }
})

export default app
