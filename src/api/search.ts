import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()
const validAnnotationOwnershipJoins = `JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
      JOIN recommendation_meta m ON m.recommendation_id=r.id AND m.branch_id=a.branch_id
      JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
      JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'`

// Evidence retrieval is deliberately separate from broad search. Hermes gets a
// source quote plus its durable locator and downstream learning objects, so a
// semantic match can be inspected and cited instead of becoming an ungrounded
// summary.
app.get('/evidence', async (c) => {
  const q = (c.req.query('q') || '').trim()
  if (q.length < 2) return c.json({ error: 'q must contain at least two characters' }, 400)
  if (q.length > 200) return c.json({ error: 'q must contain at most 200 characters' }, 400)
  const limit = Math.max(1, Math.min(Number(c.req.query('limit') || 24), 100))
  const like = `%${q.replace(/([\\%_])/g, '\\$1')}%`
  const conditions = [
    "a.status='active'",
    "(a.quote LIKE ? ESCAPE '\\' OR a.context_before LIKE ? ESCAPE '\\' OR a.context_after LIKE ? ESCAPE '\\')",
  ]
  const bindings: unknown[] = [like, like, like]
  const recommendationId = (c.req.query('recommendation_id') || '').trim()
  const threadId = (c.req.query('thread_id') || '').trim()
  const branchId = (c.req.query('branch_id') || '').trim()
  if (recommendationId) {
    conditions.push('a.recommendation_id=?')
    bindings.push(recommendationId)
  }
  if (threadId) {
    conditions.push('a.thread_id=?')
    bindings.push(threadId)
  }
  if (branchId) {
    conditions.push('a.branch_id=?')
    bindings.push(branchId)
  }
  try {
    const rows = await c.env.DB.prepare(
      `SELECT a.id,a.recommendation_id,a.artifact_id,a.thread_id,a.branch_id,a.locator_type,a.selector_json,a.quote,a.context_before,a.context_after,a.language,a.source_checksum,a.created_at,
      r.video_title AS source_title,r.video_url AS source_url,b.label AS branch_label,t.title AS thread_title
      FROM source_annotations a
      ${validAnnotationOwnershipJoins}
      LEFT JOIN learning_threads t ON t.id=a.thread_id
      WHERE ${conditions.join(' AND ')} ORDER BY a.created_at DESC LIMIT ?`,
    )
      .bind(...bindings, limit)
      .all<any>()
    const annotations = (rows.results || []).map((row: any) => {
      let selector = {}
      try {
        selector = JSON.parse(row.selector_json || '{}')
      } catch {
        /* keep empty */
      }
      return { ...row, selector, selector_json: undefined }
    })
    if (!annotations.length) return c.json({ q, total: 0, results: [] })
    const ids = annotations.map((row: any) => row.id)
    const derivations = await c.env.DB.prepare(
      `SELECT ua.annotation_id,lu.id,lu.unit_type,lu.statement,lu.user_synthesis,lu.status,lu.recommendation_id
      FROM unit_anchors ua JOIN learning_units lu ON lu.id=ua.unit_id
      WHERE ua.annotation_id IN (${ids.map(() => '?').join(',')}) ORDER BY lu.updated_at DESC`,
    )
      .bind(...ids)
      .all<any>()
    const byAnnotation = new Map<string, any[]>()
    for (const row of derivations.results || []) {
      const list = byAnnotation.get(String(row.annotation_id)) || []
      list.push(row)
      byAnnotation.set(String(row.annotation_id), list)
    }
    return c.json({
      q,
      total: annotations.length,
      results: annotations.map((row: any) => ({ ...row, derivations: byAnnotation.get(String(row.id)) || [] })),
    })
  } catch (error) {
    return c.json(safeError('Evidence search failed')(error), 500)
  }
})

app.get('/', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const q = (c.req.query('q') || '').trim()
  if (!q || q.length < 2)
    return c.json({
      groups: {
        recs: [],
        nodes: [],
        vault: [],
        patterns: [],
        threads: [],
        units: [],
        notes: [],
        artifacts: [],
        assertions: [],
        memories: [],
        annotations: [],
      },
      q,
    })
  if (q.length > 200) return c.json({ error: 'q must contain at most 200 characters' }, 400)
  const boundedLike = `%${q.replace(/([\\%_])/g, '\\$1')}%`

  try {
    const like = `%${q}%`
    const [indexed, nodes, vault, patterns, threads, units, notes, artifacts, assertions, memories, annotations] =
      await Promise.all([
        DB.prepare(
          "SELECT source,ref_id FROM search_idx WHERE text LIKE ? ESCAPE '\\' ORDER BY updated_at DESC,source,ref_id LIMIT 16",
        )
          .bind(boundedLike)
          .all<{ source: string; ref_id: string }>(),
        DB.prepare(
          'SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8',
        )
          .bind(`%${q}%`, `%${q}%`)
          .all<any>(),
        DB.prepare(
          'SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8',
        )
          .bind(`%${q}%`)
          .all<any>(),
        DB.prepare(
          "SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8",
        )
          .bind(`%${q}%`, `%${q}%`)
          .all<any>(),
        DB.prepare(
          `SELECT id,title,thread_type,status,guiding_question FROM learning_threads WHERE superseded_at IS NULL AND (title LIKE ? OR guiding_question LIKE ? OR final_synthesis LIKE ?) ORDER BY updated_at DESC LIMIT 8`,
        )
          .bind(like, like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,unit_type,statement,user_synthesis,status,recommendation_id FROM learning_units WHERE statement LIKE ? OR user_synthesis LIKE ? ORDER BY updated_at DESC LIMIT 12`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT n.id,n.title,n.kind,n.recommendation_id FROM notes n LEFT JOIN note_sections s ON s.note_id=n.id WHERE n.title LIKE ? OR s.content LIKE ? GROUP BY n.id ORDER BY n.updated_at DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,filename,media_type,created_at FROM artifacts WHERE COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged' AND (filename LIKE ? OR metadata_json LIKE ?) ORDER BY created_at DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT assertion_key,category,value_json,confidence FROM profile_assertions WHERE assertion_key LIKE ? OR value_json LIKE ? ORDER BY confidence DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,memory_key,memory_kind,value_json,confidence FROM hermes_memory WHERE status IN ('active','approved') AND (memory_key LIKE ? OR value_json LIKE ?) ORDER BY confidence DESC,updated_at DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT a.id,a.recommendation_id,a.locator_type,a.selector_json,a.quote,a.context_before,a.context_after,a.language,a.source_checksum,a.created_at,r.video_title source_title,r.video_url source_url
        FROM source_annotations a ${validAnnotationOwnershipJoins}
        WHERE a.status='active' AND (a.quote LIKE ? OR a.context_before LIKE ? OR a.context_after LIKE ?) ORDER BY a.created_at DESC LIMIT 12`,
        )
          .bind(like, like, like)
          .all<any>(),
      ])

    const recIds: string[] = []
    const indexedIds = {
      unit: [] as string[],
      note: [] as string[],
      assertion: [] as string[],
      memory: [] as string[],
      annotation: [] as string[],
    }
    for (const r of indexed.results || []) {
      if (r.source === 'rec') recIds.push(r.ref_id)
      if (r.source in indexedIds) indexedIds[r.source as keyof typeof indexedIds].push(r.ref_id)
    }

    let recs: any[] = []
    if (recIds.length > 0) {
      const placeholders = recIds.map(() => '?').join(',')
      const res = await DB.prepare(
        `SELECT id, video_title as title, creator, content_type, status, user_rating
         FROM recommendations WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
      )
        .bind(...recIds)
        .all<any>()
      recs = res.results || []
    }
    const fromIndex = async (ids: string[], sql: string) => {
      if (!ids.length) return []
      return (
        (
          await DB.prepare(sql.replace('$ids', ids.map(() => '?').join(',')))
            .bind(...ids)
            .all<any>()
        ).results || []
      )
    }
    const [indexedUnits, indexedNotes, indexedAssertions, indexedMemories, indexedAnnotations] = await Promise.all([
      fromIndex(
        indexedIds.unit,
        'SELECT id,unit_type,statement,user_synthesis,status,recommendation_id FROM learning_units WHERE id IN ($ids)',
      ),
      fromIndex(indexedIds.note, 'SELECT id,title,kind,recommendation_id FROM notes WHERE id IN ($ids)'),
      fromIndex(
        indexedIds.assertion,
        'SELECT assertion_key,category,value_json,confidence FROM profile_assertions WHERE assertion_key IN ($ids)',
      ),
      fromIndex(
        indexedIds.memory,
        "SELECT id,memory_key,memory_kind,value_json,confidence FROM hermes_memory WHERE id IN ($ids) AND status IN ('active','approved')",
      ),
      fromIndex(
        indexedIds.annotation,
        `SELECT a.id,a.recommendation_id,a.locator_type,a.selector_json,a.quote,a.context_before,a.context_after,a.language,a.source_checksum,a.created_at,r.video_title source_title,r.video_url source_url
        FROM source_annotations a ${validAnnotationOwnershipJoins} WHERE a.id IN ($ids) AND a.status='active'`,
      ),
    ])
    const merge = (direct: any[], indexed: any[], key: string) => [
      ...indexed,
      ...direct.filter((item) => !indexed.some((match) => match[key] === item[key])),
    ]

    return c.json({
      q,
      groups: {
        recs,
        nodes: nodes.results || [],
        vault: vault.results || [],
        patterns: patterns.results || [],
        threads: threads.results || [],
        units: merge(units.results || [], indexedUnits, 'id'),
        notes: merge(notes.results || [], indexedNotes, 'id'),
        artifacts: artifacts.results || [],
        assertions: merge(assertions.results || [], indexedAssertions, 'assertion_key'),
        memories: merge(memories.results || [], indexedMemories, 'id'),
        annotations: merge(annotations.results || [], indexedAnnotations, 'id').map((row: any) => {
          let selector = {}
          try {
            selector = JSON.parse(row.selector_json || '{}')
          } catch {
            /* keep empty */
          }
          const { selector_json: _selectorJson, ...annotation } = row
          return { ...annotation, selector }
        }),
      },
    })
  } catch {
    const like = `%${q}%`
    const [recs, nodes, vault, patterns, threads, units, notes, artifacts, assertions, memories, annotations] =
      await Promise.all([
        DB.prepare(
          `SELECT id, video_title as title, creator, content_type, status, user_rating FROM recommendations WHERE video_title LIKE ? OR creator LIKE ? OR why_this LIKE ? ORDER BY created_at DESC LIMIT 8`,
        )
          .bind(like, like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id, label, type, status, super_category FROM tree_nodes WHERE id LIKE ? OR label LIKE ? ORDER BY type, id LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id, filename, created_at FROM html_files WHERE filename LIKE ? ORDER BY created_at DESC LIMIT 8`,
        )
          .bind(like)
          .all<any>(),
        DB.prepare(
          `SELECT id, description, strength FROM patterns WHERE id LIKE ? OR description LIKE ? ORDER BY CASE strength WHEN 'locked' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,title,thread_type,status,guiding_question FROM learning_threads WHERE superseded_at IS NULL AND (title LIKE ? OR guiding_question LIKE ? OR final_synthesis LIKE ?) ORDER BY updated_at DESC LIMIT 8`,
        )
          .bind(like, like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,unit_type,statement,user_synthesis,status,recommendation_id FROM learning_units WHERE statement LIKE ? OR user_synthesis LIKE ? ORDER BY updated_at DESC LIMIT 12`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT n.id,n.title,n.kind,n.recommendation_id FROM notes n LEFT JOIN note_sections s ON s.note_id=n.id WHERE n.title LIKE ? OR s.content LIKE ? GROUP BY n.id ORDER BY n.updated_at DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,filename,media_type,created_at FROM artifacts WHERE COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged' AND (filename LIKE ? OR metadata_json LIKE ?) ORDER BY created_at DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT assertion_key,category,value_json,confidence FROM profile_assertions WHERE assertion_key LIKE ? OR value_json LIKE ? ORDER BY confidence DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT id,memory_key,memory_kind,value_json,confidence FROM hermes_memory WHERE status IN ('active','approved') AND (memory_key LIKE ? OR value_json LIKE ?) ORDER BY confidence DESC,updated_at DESC LIMIT 8`,
        )
          .bind(like, like)
          .all<any>(),
        DB.prepare(
          `SELECT a.id,a.recommendation_id,a.locator_type,a.selector_json,a.quote,a.context_before,a.context_after,a.language,a.source_checksum,a.created_at,r.video_title source_title,r.video_url source_url
        FROM source_annotations a ${validAnnotationOwnershipJoins}
        WHERE a.status='active' AND (a.quote LIKE ? OR a.context_before LIKE ? OR a.context_after LIKE ?) ORDER BY a.created_at DESC LIMIT 12`,
        )
          .bind(like, like, like)
          .all<any>(),
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
        annotations: (annotations.results || []).map((row: any) => {
          let selector = {}
          try {
            selector = JSON.parse(row.selector_json || '{}')
          } catch {
            /* keep empty */
          }
          const { selector_json: _selectorJson, ...annotation } = row
          return { ...annotation, selector }
        }),
      },
    })
  }
})

export default app
