import { Hono } from 'hono'
import { Bindings, normalizeRating, safeError } from '../lib'
import { defaultSettings, loadSettings } from '../services/settings'

const app = new Hono<{ Bindings: Bindings }>()
const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`

app.get('/sessions', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT s.*, r.video_title, r.creator, r.video_url FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id ORDER BY s.started_at DESC LIMIT 100`).all()
  return c.json({ sessions: rows.results || [] })
})
app.post('/sessions/start', async (c) => {
  const body = await c.req.json<{ recommendation_id: string; intent?: string }>()
  if (!body.recommendation_id) return c.json({ error: 'recommendation_id required' }, 400)
  const recommendation = await c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=? AND status='active'`).bind(body.recommendation_id).first()
  if (!recommendation) return c.json({ error: 'active recommendation not found' }, 404)
  const existing = await c.env.DB.prepare(`SELECT id FROM learning_sessions WHERE recommendation_id=? AND status IN ('active','returned') ORDER BY started_at DESC LIMIT 1`).bind(body.recommendation_id).first<{ id: string }>()
  if (existing) {
    await c.env.DB.prepare(`UPDATE recommendation_meta SET learning_state='in_progress',last_opened_at=datetime('now'),updated_at=datetime('now') WHERE recommendation_id=?`).bind(body.recommendation_id).run()
    return c.json({ ok: true, session_id: existing.id, resumed: true })
  }
  const sessionId = id('session')
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO learning_sessions (id,recommendation_id,intent) VALUES (?,?,?)`).bind(sessionId, body.recommendation_id, body.intent || null),
    c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,started_at,last_opened_at) VALUES (?,'in_progress',datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state='in_progress',last_opened_at=datetime('now')`).bind(body.recommendation_id),
  ])
  return c.json({ ok: true, session_id: sessionId }, 201)
})
app.post('/sessions/:id/return', async (c) => {
  const body: { reflection?: string; complete?: boolean; rating?: number | string } = await c.req.json<{ reflection?: string; complete?: boolean; rating?: number | string }>().catch(() => ({}))
  const session = await c.env.DB.prepare(`SELECT s.*, r.video_title, r.video_url FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.id=?`).bind(c.req.param('id')).first<any>()
  if (!session) return c.json({ error: 'session not found' }, 404)
  const reflection = String(body.reflection || '').trim().slice(0, 10000)
  const rating = normalizeRating(body.rating)
  const settings = await loadSettings(c.env.DB)
  let reflectionNoteId: string | null = null
  let reflectionNoteCreated = false
  const wasCompleted = session.status === 'completed'
  const statements = [
    c.env.DB.prepare(`UPDATE learning_sessions SET returned_at=datetime('now'),reflection=?,status=?,completed_at=CASE WHEN ? THEN datetime('now') ELSE completed_at END WHERE id=?`).bind(reflection || null, body.complete ? 'completed' : 'returned', body.complete ? 1 : 0, session.id),
    c.env.DB.prepare(`INSERT INTO recommendation_meta (recommendation_id,learning_state,progress_percent,last_opened_at,updated_at) VALUES (?,?,?,datetime('now'),datetime('now')) ON CONFLICT(recommendation_id) DO UPDATE SET learning_state=excluded.learning_state,progress_percent=excluded.progress_percent,last_opened_at=datetime('now'),updated_at=datetime('now')`).bind(session.recommendation_id, body.complete ? 'completed' : 'in_progress', body.complete ? 100 : 50),
  ]
  if (reflection && session.recommendation_id) {
    const existingNote = await c.env.DB.prepare(`SELECT id FROM notes WHERE recommendation_id=? AND kind='reflection' ORDER BY updated_at DESC LIMIT 1`).bind(session.recommendation_id).first<{ id: string }>()
    reflectionNoteId = existingNote?.id || `reflection_${session.recommendation_id}`
    if (!existingNote) {
      reflectionNoteCreated = true
      const sections = [
        ['reaction', 'Reaction', reflection],
        ['foundation', 'Foundation', ''],
        ['case_studies', 'Case Studies', ''],
        ['exploitation', 'Exploitation', ''],
        ['defense', 'Defense', ''],
      ]
      statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO notes (id,recommendation_id,title,kind,source_url,status) VALUES (?,?,?,?,?,?)`).bind(reflectionNoteId, session.recommendation_id, session.video_title || 'Learning reflection', 'reflection', session.video_url || null, 'draft'))
      for (const [position, [sectionKey, label, content]] of sections.entries()) {
        statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`).bind(`${reflectionNoteId}_${sectionKey}`, reflectionNoteId, sectionKey, label, content, 'auto', position))
      }
    }
  }
  if (body.complete) statements.push(c.env.DB.prepare(`UPDATE recommendations SET status='consumed',consumed_date=date('now'),user_rating=?,user_score=?,user_review=?,updated_at=datetime('now') WHERE id=?`).bind(rating.rating, rating.score, reflection || null, session.recommendation_id))
  if (body.complete && !wasCompleted && rating.score !== null) statements.push(c.env.DB.prepare(`INSERT INTO rating_events (recommendation_id,rating,score,created_at) VALUES (?,?,?,datetime('now'))`).bind(session.recommendation_id, rating.rating, rating.score))
  if (body.complete) statements.push(c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(id('job'), JSON.stringify({ recommendation_id: session.recommendation_id, session_id: session.id, note_id: reflectionNoteId, reflection, rating: rating.score, srs_drafts: settings.srs_drafts, review_required: settings.profile_proposals.review_required }), `session-feedback:${session.id}`))
  await c.env.DB.batch(statements)
  return c.json({ ok: true, status: body.complete ? 'completed' : 'returned', reflection_note_id: reflectionNoteId, reflection_note_created: reflectionNoteCreated, srs_eligible: Number(rating.score || 0) >= 8 })
})
app.delete('/sessions/:id', async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM learning_sessions WHERE id=? AND status NOT IN ('completed')").bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'session not found or completed' }, 404)
})

app.get('/collections', async (c) => {
  const scope = c.req.query('scope')
  const rows = scope ? await c.env.DB.prepare(`SELECT c.*, COUNT(ci.recommendation_id) item_count FROM collections c LEFT JOIN collection_items ci ON ci.collection_id=c.id WHERE c.scope=? GROUP BY c.id ORDER BY c.updated_at DESC`).bind(scope).all() : await c.env.DB.prepare(`SELECT c.*, COUNT(ci.recommendation_id) item_count FROM collections c LEFT JOIN collection_items ci ON ci.collection_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC`).all()
  return c.json({ collections: rows.results || [] })
})
app.post('/collections', async (c) => {
  const body = await c.req.json<{ name: string; description?: string; scope?: string }>()
  if (!body.name?.trim()) return c.json({ error: 'name required' }, 400)
  const collectionId = id('collection')
  await c.env.DB.prepare(`INSERT INTO collections (id,name,description,scope) VALUES (?,?,?,?)`).bind(collectionId, body.name.trim(), body.description || null, body.scope || 'curate').run()
  return c.json({ ok: true, id: collectionId }, 201)
})
app.post('/collections/:id/items', async (c) => {
  const body = await c.req.json<{ recommendation_id: string; position?: number }>()
  await c.env.DB.prepare(`INSERT OR REPLACE INTO collection_items (collection_id,recommendation_id,position) VALUES (?,?,?)`).bind(c.req.param('id'), body.recommendation_id, body.position || 0).run()
  return c.json({ ok: true })
})
app.delete('/collections/:id/items/:recommendation_id', async (c) => {
  await c.env.DB.prepare('DELETE FROM collection_items WHERE collection_id=? AND recommendation_id=?').bind(c.req.param('id'), c.req.param('recommendation_id')).run()
  return c.json({ ok: true })
})
app.delete('/collections/:id', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM collection_items WHERE collection_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM collections WHERE id=?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})

app.get('/notes', async (c) => {
  const kind = c.req.query('kind')
  const notes = kind ? await c.env.DB.prepare(`SELECT * FROM notes WHERE kind=? ORDER BY updated_at DESC LIMIT 200`).bind(kind).all<any>() : await c.env.DB.prepare(`SELECT * FROM notes ORDER BY updated_at DESC LIMIT 200`).all<any>()
  const rows = notes.results || []
  if (!rows.length) return c.json({ notes: [] })
  const placeholders = rows.map(() => '?').join(',')
  const sections = await c.env.DB.prepare(`SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${placeholders}) ORDER BY note_id,position`).bind(...rows.map((note) => note.id)).all<any>()
  const byNote = new Map<string, any[]>()
  for (const section of sections.results || []) byNote.set(section.note_id, [...(byNote.get(section.note_id) || []), section])
  const output = rows.map((note) => ({ ...note, sections: byNote.get(note.id) || [] }))
  return c.json({ notes: output })
})
app.post('/notes', async (c) => {
  const body = await c.req.json<any>()
  if (!body.title?.trim()) return c.json({ error: 'title required' }, 400)
  const noteId = body.id || id('note')
  const statements = [c.env.DB.prepare(`INSERT INTO notes (id,recommendation_id,title,kind,branch_id,source_url,status) VALUES (?,?,?,?,?,?,?)`).bind(noteId, body.recommendation_id || null, body.title.trim(), body.kind || 'note', body.branch_id || null, body.source_url || null, body.status || 'draft')]
  for (const [index, section] of (body.sections || []).entries()) statements.push(c.env.DB.prepare(`INSERT INTO note_sections (id,note_id,section_key,label,content,direction,position) VALUES (?,?,?,?,?,?,?)`).bind(id('section'), noteId, section.section_key, section.label, section.content || '', section.direction || 'auto', index))
  await c.env.DB.batch(statements)
  return c.json({ ok: true, id: noteId }, 201)
})
app.put('/notes/:id', async (c) => {
  const body = await c.req.json<any>()
  const statements = [c.env.DB.prepare(`UPDATE notes SET title=COALESCE(?,title), branch_id=COALESCE(?,branch_id), revision=revision+1, updated_at=datetime('now') WHERE id=?`).bind(body.title || null, body.branch_id || null, c.req.param('id'))]
  for (const section of body.sections || []) statements.push(c.env.DB.prepare(`UPDATE note_sections SET content=?,direction=?,updated_at=datetime('now') WHERE note_id=? AND section_key=?`).bind(section.content || '', section.direction || 'auto', c.req.param('id'), section.section_key))
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})
app.delete('/notes/:id', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM note_sections WHERE note_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM notes WHERE id=?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})
app.post('/notes/:id/process', async (c) => {
  const note = await c.env.DB.prepare(`SELECT * FROM notes WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!note) return c.json({ error: 'not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE notes SET status='processing',updated_at=datetime('now') WHERE id=?`).bind(note.id),
    c.env.DB.prepare(`INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key) VALUES (?,'process_feedback',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(id('job'), JSON.stringify({ note_id: note.id, recommendation_id: note.recommendation_id }), `feedback:${note.id}:${note.revision}`),
  ])
  return c.json({ ok: true, status: 'processing' }, 202)
})

app.get('/srs/drafts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM srs_drafts ORDER BY created_at DESC LIMIT 200`).all()
  return c.json({ drafts: rows.results || [] })
})
app.put('/srs/drafts/:id', async (c) => {
  const body = await c.req.json<any>()
  await c.env.DB.prepare(`UPDATE srs_drafts SET question=COALESCE(?,question),answer=COALESCE(?,answer),topic=COALESCE(?,topic),updated_at=datetime('now') WHERE id=?`).bind(body.question || null, body.answer || null, body.topic || null, c.req.param('id')).run()
  return c.json({ ok: true })
})
app.post('/srs/drafts/:id/approve', async (c) => {
  const draft = await c.env.DB.prepare(`SELECT * FROM srs_drafts WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!draft) return c.json({ error: 'not found' }, 404)
  const approved = await c.env.DB.prepare(`UPDATE srs_drafts SET status='approved',updated_at=datetime('now') WHERE id=? AND status='draft'`).bind(draft.id).run()
  if (!approved.meta.changes) return c.json({ error: 'draft already processed' }, 409)
  await c.env.DB.prepare(`INSERT INTO srs_cards (id,recommendation_id,question,answer,topic,due_at) VALUES (?,?,?,?,?,date('now'))`).bind(id('card'), draft.recommendation_id, draft.question, draft.answer, draft.topic).run()
  return c.json({ ok: true })
})
app.post('/srs/drafts/:id/reject', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE srs_drafts SET status='rejected',updated_at=datetime('now') WHERE id=? AND status='draft'`).bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'draft not found' }, 404)
})
app.delete('/srs/drafts/:id', async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM srs_drafts WHERE id=? AND status IN ('draft','rejected')").bind(c.req.param('id')).run()
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'draft not found or already approved' }, 404)
})

app.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT setting_key,value_json,updated_at FROM user_settings`).all<any>()
  const settings: Record<string, unknown> = {}
  for (const row of rows.results || []) { try { settings[row.setting_key] = JSON.parse(row.value_json) } catch { settings[row.setting_key] = row.value_json } }
  return c.json({ settings, resolved: await loadSettings(c.env.DB), defaults: defaultSettings })
})
app.put('/settings/:key', async (c) => {
  try { const value = await c.req.json(); await c.env.DB.prepare(`INSERT INTO user_settings (setting_key,value_json) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')`).bind(c.req.param('key'), JSON.stringify(value)).run(); return c.json({ ok: true }) }
  catch (error) { return c.json(safeError('Settings update failed')(error), 500) }
})

export default app
