import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { recordLearningEvent } from '../services/learning-core'
import { refreshRecommendationOutcome } from '../services/intelligence-v2'

const app = new Hono<{ Bindings: Bindings }>()
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const clean = (value: unknown, max = 4000) => String(value || '').trim().slice(0, max)
const threadTypes = new Set(['understand', 'decide', 'build', 'practice'])
const unitTypes = new Set(['claim', 'concept', 'method', 'example', 'question', 'application', 'counterclaim'])
const evidenceTypes = new Set(['free_recall', 'explanation', 'transfer', 'application', 'decision', 'artifact'])

const defaultRequirements = (type: string) => type === 'understand'
  ? [{ key: 'delayed_recall', label: 'Pass delayed free recall', evidence_type: 'free_recall', minimum_count: 1, minimum_score: .6 }]
  : type === 'decide'
    ? [{ key: 'decision', label: 'Record the decision and its evidence', evidence_type: 'decision', minimum_count: 1 }]
    : type === 'build'
      ? [{ key: 'artifact', label: 'Produce a working artifact', evidence_type: 'artifact', minimum_count: 1 }]
      : [{ key: 'application', label: 'Apply the capability successfully', evidence_type: 'application', minimum_count: 1 }]

app.get('/integrity/health', async (c) => {
  const [open, metadata, sessions, notes, reviews] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) count FROM integrity_quarantine WHERE resolved_at IS NULL`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM recommendation_meta m LEFT JOIN recommendations r ON r.id=m.recommendation_id WHERE r.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='recommendation_meta' AND q.entity_id=m.recommendation_id AND q.reason='missing_recommendation')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.recommendation_id IS NOT NULL AND r.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='learning_session' AND q.entity_id=s.id AND q.reason='missing_recommendation')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM notes n LEFT JOIN recommendations r ON r.id=n.recommendation_id WHERE n.recommendation_id IS NOT NULL AND r.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='note' AND q.entity_id=n.id AND q.reason='missing_recommendation')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_review_events e LEFT JOIN srs_cards x ON x.id=e.card_id WHERE x.id IS NULL AND NOT EXISTS (SELECT 1 FROM integrity_quarantine q WHERE q.entity_type='srs_review_event' AND q.entity_id=CAST(e.id AS TEXT) AND q.reason='missing_card')`).first<any>(),
  ])
  const activeOrphans = Number(metadata?.count || 0) + Number(sessions?.count || 0) + Number(notes?.count || 0) + Number(reviews?.count || 0)
  return c.json({ ok: activeOrphans === 0, active_orphans: activeOrphans, quarantined_unresolved: Number(open?.count || 0), details: { recommendation_meta: metadata?.count || 0, sessions: sessions?.count || 0, notes: notes?.count || 0, review_events: reviews?.count || 0 } })
})

app.get('/threads', async (c) => {
  const status = c.req.query('status')
  const rows = status
    ? await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE status=? ORDER BY priority DESC,updated_at DESC`).bind(status).all<any>()
    : await c.env.DB.prepare(`SELECT * FROM learning_threads ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'ready_to_verify' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,priority DESC,updated_at DESC`).all<any>()
  return c.json({ threads: (rows.results || []).map((row) => ({ ...row, evidence_requirements: JSON.parse(row.evidence_requirements_json || '[]') })) })
})

app.post('/threads', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const title = clean(body.title, 160)
  const guidingQuestion = clean(body.guiding_question, 1000)
  const definition = clean(body.definition_of_done, 2000)
  const type = clean(body.thread_type, 20)
  if (!title || !guidingQuestion || !definition || !threadTypes.has(type)) return c.json({ error: 'title, valid thread_type, guiding_question, and definition_of_done required' }, 400)
  const requirements = Array.isArray(body.evidence_requirements) && body.evidence_requirements.length ? body.evidence_requirements.slice(0, 12) : defaultRequirements(type)
  const id = makeId('thread')
  const status = body.activate === true ? 'active' : 'draft'
  const statements: D1PreparedStatement[] = []
  if (status === 'active') statements.push(c.env.DB.prepare(`UPDATE learning_threads SET status='paused',paused_at=datetime('now'),updated_at=datetime('now') WHERE status='active'`))
  statements.push(c.env.DB.prepare(`INSERT INTO learning_threads (id,title,thread_type,guiding_question,why_now,definition_of_done,evidence_requirements_json,status,started_at,priority) VALUES (?,?,?,?,?,?,?,?,CASE WHEN ?='active' THEN datetime('now') END,?)`).bind(id, title, type, guidingQuestion, clean(body.why_now, 2000) || null, definition, JSON.stringify(requirements), status, status, Number(body.priority || 0)))
  for (const [index, requirement] of requirements.entries()) {
    const key = clean(requirement.key || `requirement_${index + 1}`, 80)
    const evidenceType = evidenceTypes.has(requirement.evidence_type) ? requirement.evidence_type : defaultRequirements(type)[0].evidence_type
    statements.push(c.env.DB.prepare(`INSERT INTO thread_evidence_requirements (id,thread_id,requirement_key,label,evidence_type,minimum_count,minimum_score) VALUES (?,?,?,?,?,?,?)`).bind(`${id}_${key}`, id, key, clean(requirement.label || key, 240), evidenceType, Math.max(1, Number(requirement.minimum_count || 1)), requirement.minimum_score == null ? null : Math.max(0, Math.min(1, Number(requirement.minimum_score)))))
  }
  await c.env.DB.batch(statements)
  await recordLearningEvent(c.env.DB, { eventType: 'thread_created', actorType: 'user', idempotencyKey: `thread-created:${id}`, threadId: id, payload: { type, status } })
  return c.json({ ok: true, id, status }, 201)
})

app.get('/threads/:id', async (c) => {
  const thread = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const [sources, units, requirements, evidence, relations] = await Promise.all([
    c.env.DB.prepare(`SELECT ts.*,r.video_title,r.creator,r.content_type,r.video_url,m.learning_state FROM thread_sources ts JOIN recommendations r ON r.id=ts.recommendation_id LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE ts.thread_id=? AND ts.status!='removed' ORDER BY ts.position,r.created_at`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT u.*,tu.role,tu.importance FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? ORDER BY tu.position,u.updated_at DESC`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT * FROM thread_evidence_requirements WHERE thread_id=? ORDER BY rowid`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT * FROM learning_evidence WHERE thread_id=? ORDER BY occurred_at DESC LIMIT 100`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT ur.* FROM unit_relations ur WHERE ur.source_unit_id IN (SELECT unit_id FROM thread_units WHERE thread_id=?) OR ur.target_unit_id IN (SELECT unit_id FROM thread_units WHERE thread_id=?) ORDER BY ur.created_at DESC`).bind(thread.id,thread.id).all<any>(),
  ])
  return c.json({ thread: { ...thread, evidence_requirements: JSON.parse(thread.evidence_requirements_json || '[]') }, sources: sources.results || [], units: units.results || [], requirements: requirements.results || [], evidence: evidence.results || [], relations: relations.results || [] })
})

app.get('/threads/:id/export', async (c) => {
  const thread = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const [sources, units, anchors, evidence] = await Promise.all([
    c.env.DB.prepare(`SELECT r.video_title,r.creator,r.video_url,ts.role FROM thread_sources ts JOIN recommendations r ON r.id=ts.recommendation_id WHERE ts.thread_id=? AND ts.status!='removed' ORDER BY ts.position`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT u.* FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? ORDER BY tu.position,u.updated_at`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT a.* FROM unit_anchors a WHERE a.unit_id IN (SELECT unit_id FROM thread_units WHERE thread_id=?) ORDER BY a.created_at`).bind(thread.id).all<any>(),
    c.env.DB.prepare(`SELECT * FROM learning_evidence WHERE thread_id=? ORDER BY occurred_at`).bind(thread.id).all<any>(),
  ])
  if ((c.req.query('format') || 'json') !== 'md') return c.json({ thread, sources: sources.results || [], units: units.results || [], anchors: anchors.results || [], evidence: evidence.results || [] })
  const anchorMap = new Map<string, any[]>()
  for (const anchor of anchors.results || []) anchorMap.set(anchor.unit_id, [...(anchorMap.get(anchor.unit_id) || []), anchor])
  const markdown = [`# ${thread.title}`, '', `**Type:** ${thread.thread_type}`, '', `## Guiding question`, '', thread.guiding_question, '', `## Definition of done`, '', thread.definition_of_done, '', `## Final synthesis`, '', thread.final_synthesis || '_Not completed_', '', `## Sources`, '', ...(sources.results || []).map((source: any) => `- [${source.video_title}](${source.video_url}) — ${source.role}${source.creator ? ` · ${source.creator}` : ''}`), '', `## Learning Units`, '', ...(units.results || []).flatMap((unit: any) => [`### ${unit.unit_type}: ${unit.statement}`, '', unit.user_synthesis || '', ...(anchorMap.get(unit.id) || []).map((anchor: any) => `- Anchor: ${anchor.locator}${anchor.excerpt ? ` — ${anchor.excerpt}` : ''}`), '']), `## Evidence`, '', ...(evidence.results || []).map((item: any) => `- ${item.evidence_type} · ${item.result}${item.response ? ` — ${item.response}` : ''}`)].join('\n')
  c.header('Content-Type', 'text/markdown; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="${thread.id}.md"`)
  return c.body(markdown)
})

app.get('/weekly', async (c) => {
  const [threads, stale, loops, due, verified] = await Promise.all([
    c.env.DB.prepare(`SELECT id,title,thread_type,status,updated_at FROM learning_threads WHERE status IN ('active','paused','ready_to_verify') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,updated_at`).all<any>(),
    c.env.DB.prepare(`SELECT id,title,status,updated_at FROM learning_threads WHERE status IN ('active','paused') AND updated_at<datetime('now','-7 days') ORDER BY updated_at`).all<any>(),
    c.env.DB.prepare(`SELECT cr.id,cr.state,cr.requested_at,r.video_title FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at`).all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM learning_threads WHERE status='verified' AND verified_at>=datetime('now','-30 days')`).first<any>(),
  ])
  return c.json({ open_threads: threads.results || [], stale_threads: stale.results || [], open_cognitive_loops: loops.results || [], due_recall: Number(due?.count || 0), verified_learning_outcomes_30d: Number(verified?.count || 0), actions: ['continue','narrow','pause','synthesize','abandon'] })
})

app.get('/counterevidence', async (c) => {
  const threadId = c.req.query('thread_id')
  if (!threadId) return c.json({ error: 'thread_id required' }, 400)
  const gaps = await c.env.DB.prepare(`SELECT u.id,u.unit_type,u.statement,u.confidence FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? AND tu.role IN ('core','supporting') AND u.status IN ('draft','accepted') AND NOT EXISTS (SELECT 1 FROM unit_relations ur WHERE ur.status='active' AND ur.relation_type IN ('contradicts','qualifies') AND (ur.source_unit_id=u.id OR ur.target_unit_id=u.id)) ORDER BY tu.importance DESC,u.updated_at DESC`).bind(threadId).all<any>()
  return c.json({ thread_id: threadId, units_without_counterevidence: gaps.results || [] })
})

app.patch('/threads/:id', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const current = await c.env.DB.prepare(`SELECT * FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error: 'thread not found' }, 404)
  const type = body.thread_type === undefined ? current.thread_type : clean(body.thread_type, 20)
  if (!threadTypes.has(type)) return c.json({ error: 'invalid thread_type' }, 400)
  await c.env.DB.prepare(`UPDATE learning_threads SET title=?,thread_type=?,guiding_question=?,why_now=?,definition_of_done=?,final_synthesis=?,priority=?,updated_at=datetime('now') WHERE id=?`).bind(
    body.title === undefined ? current.title : clean(body.title, 160), type,
    body.guiding_question === undefined ? current.guiding_question : clean(body.guiding_question, 1000),
    body.why_now === undefined ? current.why_now : clean(body.why_now, 2000) || null,
    body.definition_of_done === undefined ? current.definition_of_done : clean(body.definition_of_done, 2000),
    body.final_synthesis === undefined ? current.final_synthesis : clean(body.final_synthesis, 20000) || null,
    body.priority === undefined ? current.priority : Number(body.priority || 0), current.id,
  ).run()
  return c.json({ ok: true })
})

app.post('/threads/:id/status', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const status = clean(body.status, 30)
  if (!['active', 'paused', 'abandoned'].includes(status)) return c.json({ error: 'status must be active, paused, or abandoned' }, 400)
  const thread = await c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const statements: D1PreparedStatement[] = []
  if (status === 'active') statements.push(c.env.DB.prepare(`UPDATE learning_threads SET status='paused',paused_at=datetime('now'),updated_at=datetime('now') WHERE status='active' AND id!=?`).bind(c.req.param('id')))
  statements.push(c.env.DB.prepare(`UPDATE learning_threads SET status=?,started_at=CASE WHEN ?='active' THEN COALESCE(started_at,datetime('now')) ELSE started_at END,paused_at=CASE WHEN ?='paused' THEN datetime('now') ELSE paused_at END,updated_at=datetime('now') WHERE id=?`).bind(status, status, status, c.req.param('id')))
  await c.env.DB.batch(statements)
  return c.json({ ok: true, status })
})

app.post('/threads/:id/sources', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const recommendationId = clean(body.recommendation_id, 120)
  const role = ['primary', 'supporting', 'counterevidence', 'reference'].includes(body.role) ? body.role : 'supporting'
  const [thread, source] = await Promise.all([
    c.env.DB.prepare(`SELECT id FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first(),
    c.env.DB.prepare(`SELECT id FROM recommendations WHERE id=? AND deleted_at IS NULL`).bind(recommendationId).first(),
  ])
  if (!thread || !source) return c.json({ error: 'thread or source not found' }, 404)
  await c.env.DB.prepare(`INSERT INTO thread_sources (thread_id,recommendation_id,role,expected_contribution,position,status) VALUES (?,?,?,?,?,'active') ON CONFLICT(thread_id,recommendation_id) DO UPDATE SET role=excluded.role,expected_contribution=excluded.expected_contribution,position=excluded.position,status='active',updated_at=datetime('now')`).bind(c.req.param('id'), recommendationId, role, clean(body.expected_contribution, 1000) || null, Number(body.position || 0)).run()
  return c.json({ ok: true })
})

app.delete('/threads/:id/sources/:sourceId', async (c) => {
  await c.env.DB.prepare(`UPDATE thread_sources SET status='removed',updated_at=datetime('now') WHERE thread_id=? AND recommendation_id=?`).bind(c.req.param('id'), c.req.param('sourceId')).run()
  return c.json({ ok: true })
})

app.post('/threads/:id/verify', async (c) => {
  const thread = await c.env.DB.prepare(`SELECT final_synthesis FROM learning_threads WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!thread) return c.json({ error: 'thread not found' }, 404)
  const open = await c.env.DB.prepare(`SELECT COUNT(*) count FROM thread_evidence_requirements WHERE thread_id=? AND status!='satisfied'`).bind(c.req.param('id')).first<any>()
  if (!clean(thread.final_synthesis, 20000)) return c.json({ error: 'final synthesis required' }, 409)
  if (Number(open?.count || 0) > 0) return c.json({ error: 'evidence requirements remain open', open: open.count }, 409)
  await c.env.DB.prepare(`UPDATE learning_threads SET status='verified',completed_at=COALESCE(completed_at,datetime('now')),verified_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(c.req.param('id')).run()
  await recordLearningEvent(c.env.DB, { eventType: 'thread_verified', actorType: 'user', evidenceWeight: 1, idempotencyKey: `thread-verified:${c.req.param('id')}`, threadId: c.req.param('id') })
  return c.json({ ok: true, status: 'verified' })
})

app.get('/units', async (c) => {
  const threadId = c.req.query('thread_id')
  const sourceId = c.req.query('recommendation_id')
  if (threadId) {
    const rows = await c.env.DB.prepare(`SELECT u.*,tu.role,tu.importance FROM thread_units tu JOIN learning_units u ON u.id=tu.unit_id WHERE tu.thread_id=? ORDER BY tu.position,u.updated_at DESC`).bind(threadId).all<any>()
    return c.json({ units: rows.results || [] })
  }
  const rows = sourceId
    ? await c.env.DB.prepare(`SELECT * FROM learning_units WHERE recommendation_id=? ORDER BY updated_at DESC`).bind(sourceId).all<any>()
    : await c.env.DB.prepare(`SELECT * FROM learning_units ORDER BY updated_at DESC LIMIT 200`).all<any>()
  return c.json({ units: rows.results || [] })
})

app.post('/units', async (c) => {
  try {
    const body = await c.req.json<any>().catch(() => ({}))
    const type = clean(body.unit_type, 30)
    const statement = clean(body.statement, 12000)
    if (!unitTypes.has(type) || !statement) return c.json({ error: 'valid unit_type and statement required' }, 400)
    const anchors = Array.isArray(body.anchors) ? body.anchors.slice(0, 20) : []
    if (['claim', 'method', 'counterclaim'].includes(type) && !anchors.length) return c.json({ error: 'claims, methods, and counterclaims require a source anchor' }, 400)
    const id = clean(body.id, 120) || makeId('unit')
    const recommendationId = clean(body.recommendation_id, 120) || null
    const semanticKey = clean(body.semantic_key, 240) || null
    const statements: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO learning_units (id,unit_type,statement,user_synthesis,stance,confidence,recommendation_id,source_artifact_id,source_revision_checksum,created_by,status,semantic_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, type, statement, clean(body.user_synthesis, 12000) || null, ['accept','question','reject','uncertain'].includes(body.stance) ? body.stance : 'uncertain', Math.max(0, Math.min(1, Number(body.confidence ?? .5))), recommendationId, clean(body.source_artifact_id, 120) || null, clean(body.source_revision_checksum, 160) || null, body.created_by === 'extractor' ? 'extractor' : 'user', body.status === 'accepted' ? 'accepted' : 'draft', semanticKey)]
    for (const anchor of anchors) {
      if (!recommendationId || !clean(anchor.locator, 1000)) return c.json({ error: 'each anchor requires recommendation_id and locator' }, 400)
      const anchorType = ['page','timestamp','section','quote','url_fragment','user_observation'].includes(anchor.anchor_type) ? anchor.anchor_type : 'section'
      statements.push(c.env.DB.prepare(`INSERT INTO unit_anchors (id,unit_id,recommendation_id,artifact_id,anchor_type,locator,excerpt,checksum) VALUES (?,?,?,?,?,?,?,?)`).bind(makeId('anchor'), id, recommendationId, clean(anchor.artifact_id, 120) || null, anchorType, clean(anchor.locator, 1000), clean(anchor.excerpt, 4000) || null, clean(anchor.checksum, 160) || null))
    }
    if (body.thread_id) statements.push(c.env.DB.prepare(`INSERT INTO thread_units (thread_id,unit_id,role,importance,position) VALUES (?,?,?,?,?)`).bind(body.thread_id, id, ['core','supporting','counterevidence','application'].includes(body.role) ? body.role : 'supporting', Math.max(0, Math.min(1, Number(body.importance ?? .5))), Number(body.position || 0)))
    statements.push(c.env.DB.prepare(`INSERT INTO learning_unit_revisions (unit_id,actor_type,next_json,reason) VALUES (?,?,?,?)`).bind(id, body.created_by === 'extractor' ? 'agent' : 'user', JSON.stringify({ type, statement, user_synthesis: body.user_synthesis || null }), 'created'))
    await c.env.DB.batch(statements)
    await recordLearningEvent(c.env.DB, { eventType: 'unit_created', actorType: body.created_by === 'extractor' ? 'agent' : 'user', evidenceWeight: body.created_by === 'extractor' ? 0 : .5, idempotencyKey: `unit-created:${id}`, threadId: body.thread_id || null, recommendationId, unitId: id })
    return c.json({ ok: true, id }, 201)
  } catch (error) { return c.json(safeError('Learning unit creation failed')(error), 500) }
})

app.post('/units/:id/relations', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const relation = clean(body.relation_type, 30)
  if (!['supports','contradicts','qualifies','example_of','depends_on','applies_to'].includes(relation)) return c.json({ error: 'invalid relation_type' }, 400)
  const target = clean(body.target_unit_id, 120)
  if (!target || target === c.req.param('id')) return c.json({ error: 'different target_unit_id required' }, 400)
  await c.env.DB.prepare(`INSERT INTO unit_relations (id,source_unit_id,target_unit_id,relation_type,confidence,evidence_anchor_id) VALUES (?,?,?,?,?,?) ON CONFLICT(source_unit_id,target_unit_id,relation_type) DO UPDATE SET confidence=excluded.confidence,evidence_anchor_id=excluded.evidence_anchor_id,status='active'`).bind(makeId('relation'), c.req.param('id'), target, relation, Math.max(0, Math.min(1, Number(body.confidence ?? .5))), clean(body.evidence_anchor_id, 120) || null).run()
  return c.json({ ok: true })
})

app.post('/evidence', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const type = clean(body.evidence_type, 30)
  const result = ['pass','partial','fail','recorded'].includes(body.result) ? body.result : 'recorded'
  if (!evidenceTypes.has(type) || (!body.thread_id && !body.unit_id)) return c.json({ error: 'valid evidence_type and thread_id or unit_id required' }, 400)
  const id = makeId('evidence')
  const score = body.score == null ? null : Math.max(0, Math.min(1, Number(body.score)))
  const linkedUnit = body.unit_id ? await c.env.DB.prepare(`SELECT recommendation_id FROM learning_units WHERE id=?`).bind(body.unit_id).first<any>() : null
  const recommendationId = clean(body.context?.recommendation_id || linkedUnit?.recommendation_id, 120) || null
  const context = { ...(body.context && typeof body.context === 'object' ? body.context : {}), ...(recommendationId ? { recommendation_id: recommendationId } : {}) }
  await c.env.DB.prepare(`INSERT INTO learning_evidence (id,thread_id,unit_id,evidence_type,prompt,response,result,score,self_rating,evaluator,proof_ref,delay_days,context_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, body.thread_id || null, body.unit_id || null, type, clean(body.prompt, 4000) || null, clean(body.response, 20000) || null, result, score, body.self_rating == null ? null : Number(body.self_rating), clean(body.evaluator, 80) || 'user', clean(body.proof_ref, 1000) || null, body.delay_days == null ? null : Number(body.delay_days), JSON.stringify(context)).run()
  if (body.thread_id && ['pass', 'recorded'].includes(result)) {
    await c.env.DB.prepare(`UPDATE thread_evidence_requirements SET status='satisfied',satisfied_by_evidence_id=?,updated_at=datetime('now') WHERE thread_id=? AND evidence_type=? AND status='open' AND (minimum_score IS NULL OR ? >= minimum_score) AND (SELECT COUNT(*) FROM learning_evidence WHERE thread_id=? AND evidence_type=? AND result IN ('pass','recorded')) >= minimum_count`).bind(id, body.thread_id, type, score ?? 1, body.thread_id, type).run()
  }
  if (body.unit_id && ['pass', 'recorded'].includes(result)) {
    const stage = type === 'application' ? 'applied' : type === 'transfer' ? 'transferred' : type === 'free_recall' && result === 'pass' ? 'retrieved' : type === 'explanation' && result === 'pass' ? 'encoded' : 'exposed'
    await c.env.DB.prepare(`INSERT INTO unit_mastery_state (unit_id,stage,due_at,last_retrieved_at,delayed_retrievals,transfer_count,application_count) VALUES (?,?,date('now','+1 day'),CASE WHEN ?='retrieved' THEN datetime('now') END,CASE WHEN ?='retrieved' THEN 1 ELSE 0 END,CASE WHEN ?='transferred' THEN 1 ELSE 0 END,CASE WHEN ?='applied' THEN 1 ELSE 0 END) ON CONFLICT(unit_id) DO UPDATE SET stage=CASE WHEN CASE excluded.stage WHEN 'mastered' THEN 6 WHEN 'applied' THEN 5 WHEN 'transferred' THEN 4 WHEN 'retrieved' THEN 3 WHEN 'encoded' THEN 2 ELSE 1 END > CASE unit_mastery_state.stage WHEN 'mastered' THEN 6 WHEN 'applied' THEN 5 WHEN 'transferred' THEN 4 WHEN 'retrieved' THEN 3 WHEN 'encoded' THEN 2 ELSE 1 END THEN excluded.stage ELSE unit_mastery_state.stage END,last_retrieved_at=COALESCE(excluded.last_retrieved_at,unit_mastery_state.last_retrieved_at),delayed_retrievals=unit_mastery_state.delayed_retrievals+excluded.delayed_retrievals,transfer_count=unit_mastery_state.transfer_count+excluded.transfer_count,application_count=unit_mastery_state.application_count+excluded.application_count,updated_at=datetime('now')`).bind(body.unit_id, stage, stage, stage, stage, stage).run()
  }
  await recordLearningEvent(c.env.DB, { eventType: type === 'free_recall' ? 'recall_attempted' : `${type}_recorded`, actorType: 'user', evidenceWeight: 1, idempotencyKey: `evidence:${id}`, threadId: body.thread_id || null, recommendationId, unitId: body.unit_id || null, evidenceId: id, signalScope: 'utility', signalValue: score, explicit: true, origin: 'learning_evidence', payload: { result, score, evidence_type: type } })
  const outcome = recommendationId ? await refreshRecommendationOutcome(c.env.DB, recommendationId) : null
  return c.json({ ok: true, id, recommendation_id: recommendationId, learning_outcome: outcome }, 201)
})

app.get('/consolidation/open', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT cr.*,r.video_title FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at`).all<any>()
  return c.json({ runs: rows.results || [] })
})

app.get('/consolidation/:sourceId', async (c) => {
  const run = await c.env.DB.prepare(`SELECT * FROM consolidation_runs WHERE recommendation_id=? ORDER BY requested_at DESC LIMIT 1`).bind(c.req.param('sourceId')).first<any>()
  if (!run) return c.json({ run: null, steps: [] })
  const steps = await c.env.DB.prepare(`SELECT * FROM consolidation_steps WHERE run_id=? ORDER BY position`).bind(run.id).all<any>()
  return c.json({ run, steps: steps.results || [] })
})

app.post('/consolidation/:id/retry', async (c) => {
  const run = await c.env.DB.prepare(`SELECT * FROM consolidation_runs WHERE id=? AND state='repair_required'`).bind(c.req.param('id')).first<any>()
  if (!run) return c.json({ error: 'repair-required run not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE consolidation_runs SET state='queued',failure_reason=NULL,completed_at=NULL,updated_at=datetime('now') WHERE id=?`).bind(run.id),
    c.env.DB.prepare(`UPDATE consolidation_steps SET status='pending',error=NULL,updated_at=datetime('now') WHERE run_id=? AND status='failed'`).bind(run.id),
    c.env.DB.prepare(`UPDATE agent_jobs SET status='pending',attempts=0,error=NULL,updated_at=datetime('now') WHERE workflow_run_id=? AND status='failed'`).bind(run.id),
  ])
  return c.json({ ok: true, state: 'queued' })
})

app.post('/consolidation/:id/waive', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const reason = clean(body.reason, 1000)
  if (!reason) return c.json({ error: 'reason required' }, 400)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE consolidation_runs SET state='waived',failure_reason=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND state NOT IN ('closed','waived')`).bind(reason, c.req.param('id')),
    c.env.DB.prepare(`UPDATE consolidation_steps SET status='waived',error=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE run_id=? AND status IN ('pending','failed')`).bind(reason, c.req.param('id')),
  ])
  return c.json({ ok: true, state: 'waived' })
})

export default app
