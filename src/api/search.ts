import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const q = (c.req.query('q') || '').trim()
  if (!q || q.length < 2) return c.json({ groups: { recs: [], nodes: [], vault: [], patterns: [], threads: [], units: [], notes: [], artifacts: [], assertions: [], memories: [] }, q })

  try {
    const like = `%${q}%`
    const [fts, nodes, vault, patterns, threads, units, notes, artifacts, assertions, memories] = await Promise.all([
      DB.prepare("SELECT source, ref_id FROM search_idx WHERE search_idx MATCH ? LIMIT 16").bind(q).all<{ source: string, ref_id: string }>(),
      DB.prepare("SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8")
        .bind(`%${q}%`, `%${q}%`).all<any>(),
      DB.prepare("SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8")
        .bind(`%${q}%`).all<any>(),
      DB.prepare("SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8")
        .bind(`%${q}%`, `%${q}%`).all<any>(),
      DB.prepare(`SELECT id,title,thread_type,status,guiding_question FROM learning_threads WHERE title LIKE ? OR guiding_question LIKE ? OR final_synthesis LIKE ? ORDER BY updated_at DESC LIMIT 8`).bind(like,like,like).all<any>(),
      DB.prepare(`SELECT id,unit_type,statement,user_synthesis,status,recommendation_id FROM learning_units WHERE statement LIKE ? OR user_synthesis LIKE ? ORDER BY updated_at DESC LIMIT 12`).bind(like,like).all<any>(),
      DB.prepare(`SELECT n.id,n.title,n.kind,n.recommendation_id FROM notes n LEFT JOIN note_sections s ON s.note_id=n.id WHERE n.title LIKE ? OR s.content LIKE ? GROUP BY n.id ORDER BY n.updated_at DESC LIMIT 8`).bind(like,like).all<any>(),
      DB.prepare(`SELECT id,filename,media_type,created_at FROM artifacts WHERE filename LIKE ? OR metadata_json LIKE ? ORDER BY created_at DESC LIMIT 8`).bind(like,like).all<any>(),
      DB.prepare(`SELECT assertion_key,category,value_json,confidence FROM profile_assertions WHERE assertion_key LIKE ? OR value_json LIKE ? ORDER BY confidence DESC LIMIT 8`).bind(like,like).all<any>(),
      DB.prepare(`SELECT id,memory_key,memory_kind,value_json,confidence FROM hermes_memory WHERE status IN ('active','approved') AND (memory_key LIKE ? OR value_json LIKE ?) ORDER BY confidence DESC,updated_at DESC LIMIT 8`).bind(like,like).all<any>(),
    ])

    const recIds: string[] = []
    const ftsIds = { unit: [] as string[], note: [] as string[], assertion: [] as string[], memory: [] as string[] }
    for (const r of (fts.results || [])) {
      if (r.source === 'rec') recIds.push(r.ref_id)
      if (r.source in ftsIds) ftsIds[r.source as keyof typeof ftsIds].push(r.ref_id)
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
    const fromFts = async (ids: string[], sql: string) => {
      if (!ids.length) return []
      return (await DB.prepare(sql.replace('$ids', ids.map(() => '?').join(','))).bind(...ids).all<any>()).results || []
    }
    const [ftsUnits, ftsNotes, ftsAssertions, ftsMemories] = await Promise.all([
      fromFts(ftsIds.unit, 'SELECT id,unit_type,statement,user_synthesis,status,recommendation_id FROM learning_units WHERE id IN ($ids)'),
      fromFts(ftsIds.note, 'SELECT id,title,kind,recommendation_id FROM notes WHERE id IN ($ids)'),
      fromFts(ftsIds.assertion, 'SELECT assertion_key,category,value_json,confidence FROM profile_assertions WHERE assertion_key IN ($ids)'),
      fromFts(ftsIds.memory, "SELECT id,memory_key,memory_kind,value_json,confidence FROM hermes_memory WHERE id IN ($ids) AND status IN ('active','approved')"),
    ])
    const merge = (direct: any[], indexed: any[], key: string) => [...indexed, ...direct.filter((item) => !indexed.some((match) => match[key] === item[key]))]

    return c.json({
      q,
      groups: {
        recs,
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || [],
        threads: threads.results || [],
        units: merge(units.results || [], ftsUnits, 'id'),
        notes: merge(notes.results || [], ftsNotes, 'id'),
        artifacts: artifacts.results || [],
        assertions: merge(assertions.results || [], ftsAssertions, 'assertion_key'),
        memories: merge(memories.results || [], ftsMemories, 'id'),
      },
    })
  } catch {
    const like = `%${q}%`
    const [recs, nodes, vault, patterns, threads, units, notes, artifacts, assertions, memories] = await Promise.all([
      DB.prepare(`SELECT id, video_title as title, creator, content_type, status, user_rating FROM recommendations WHERE video_title LIKE ? OR creator LIKE ? OR why_this LIKE ? ORDER BY created_at DESC LIMIT 8`)
        .bind(like, like, like).all<any>(),
      DB.prepare(`SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8`)
        .bind(like, like).all<any>(),
      DB.prepare(`SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8`)
        .bind(like).all<any>(),
      DB.prepare(`SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8`)
        .bind(like, like).all<any>(),
      DB.prepare(`SELECT id,title,thread_type,status,guiding_question FROM learning_threads WHERE title LIKE ? OR guiding_question LIKE ? OR final_synthesis LIKE ? ORDER BY updated_at DESC LIMIT 8`).bind(like,like,like).all<any>(),
      DB.prepare(`SELECT id,unit_type,statement,user_synthesis,status,recommendation_id FROM learning_units WHERE statement LIKE ? OR user_synthesis LIKE ? ORDER BY updated_at DESC LIMIT 12`).bind(like,like).all<any>(),
      DB.prepare(`SELECT n.id,n.title,n.kind,n.recommendation_id FROM notes n LEFT JOIN note_sections s ON s.note_id=n.id WHERE n.title LIKE ? OR s.content LIKE ? GROUP BY n.id ORDER BY n.updated_at DESC LIMIT 8`).bind(like,like).all<any>(),
      DB.prepare(`SELECT id,filename,media_type,created_at FROM artifacts WHERE filename LIKE ? OR metadata_json LIKE ? ORDER BY created_at DESC LIMIT 8`).bind(like,like).all<any>(),
      DB.prepare(`SELECT assertion_key,category,value_json,confidence FROM profile_assertions WHERE assertion_key LIKE ? OR value_json LIKE ? ORDER BY confidence DESC LIMIT 8`).bind(like,like).all<any>(),
      DB.prepare(`SELECT id,memory_key,memory_kind,value_json,confidence FROM hermes_memory WHERE status IN ('active','approved') AND (memory_key LIKE ? OR value_json LIKE ?) ORDER BY confidence DESC,updated_at DESC LIMIT 8`).bind(like,like).all<any>(),
    ])
    return c.json({
      q,
      groups: {
        recs: recs.results || [],
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || [],
        threads: threads.results || [],
        units: units.results || [],
        notes: notes.results || [],
        artifacts: artifacts.results || [],
        assertions: assertions.results || [],
        memories: memories.results || [],
      },
    })
  }
})

export default app
