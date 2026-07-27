import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

// Unified cross-table search. Powers the command palette and can be reused.
app.get('/', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const q = (c.req.query('q') || '').trim()
  if (!q || q.length < 2) return c.json({ groups: { recs: [], nodes: [], vault: [], patterns: [] }, q })

  const like = `%${q}%`
  try {
    const [recs, nodes, vault, patterns] = await Promise.all([
      DB.prepare(
        `SELECT id, video_title as title, creator, content_type, status, user_rating
         FROM recommendations
         WHERE video_title LIKE ? OR creator LIKE ? OR why_this LIKE ?
         ORDER BY created_at DESC LIMIT 8`
      ).bind(like, like, like).all<any>(),
      DB.prepare(
        `SELECT id, label, type, status, super_category
         FROM tree_nodes
         WHERE id LIKE ? OR label LIKE ?
         ORDER BY type, id LIMIT 8`
      ).bind(like, like).all<any>(),
      DB.prepare(
        `SELECT id, filename, created_at
         FROM html_files
         WHERE filename LIKE ?
         ORDER BY created_at DESC LIMIT 8`
      ).bind(like).all<any>(),
      DB.prepare(
        `SELECT id, description, strength
         FROM patterns
         WHERE id LIKE ? OR description LIKE ?
         ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END
         LIMIT 8`
      ).bind(like, like).all<any>(),
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
  } catch (err) {
    return c.json(safeError('Search failed')(err), 500)
  }
})

export default app
