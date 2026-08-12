type DB = Pick<D1Database, 'prepare' | 'batch'>

export type MemoryTaskKind = 'recommendation' | 'feedback' | 'learning' | 'self_evolution'
const taskKinds: MemoryTaskKind[] = ['recommendation', 'feedback', 'learning', 'self_evolution']
const parseJson = (value: unknown, fallback: any = null) => { try { return value ? JSON.parse(String(value)) : fallback } catch { return fallback } }
const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (value: unknown) => new Set(normalize(value).split(' ').filter((word) => word.length > 2))
const overlap = (left: Set<string>, right: Set<string>) => left.size ? [...left].filter((word) => right.has(word)).length / left.size : 0

export function isMemoryOwnershipAllowed(memoryKey: string) {
  const key = memoryKey.trim().toLowerCase()
  return !/^(profile|preference|personal|policy|queue|source|recommendation|session|job|thread|unit)[.:/]/.test(key)
}

export function isMemoryTaskKind(value: string): value is MemoryTaskKind { return taskKinds.includes(value as MemoryTaskKind) }

export async function writeMemoryEvidence(db: DB, memoryId: string, evidence: any[]) {
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM memory_evidence WHERE memory_id=?').bind(memoryId)]
  for (const item of evidence.slice(0, 20)) {
    statements.push(db.prepare(`INSERT INTO memory_evidence(id,memory_id,evidence_type,recommendation_id,thread_id,unit_id,learning_event_id,source_ref,quote,reason,confidence)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
      `mem_ev_${crypto.randomUUID()}`, memoryId, String(item.evidence_type || 'source').slice(0, 60), item.recommendation_id || null,
      item.thread_id || null, item.unit_id || null, item.learning_event_id || null, String(item.source || item.source_ref || '').slice(0, 500) || null,
      String(item.quote || '').slice(0, 1000) || null, String(item.reason || '').slice(0, 500) || null,
      item.confidence == null ? null : Math.max(0, Math.min(1, Number(item.confidence))),
    ))
  }
  await db.batch(statements)
}

export async function compileMemoryContext(db: DB, input: {
  taskKind: MemoryTaskKind; query?: string; recommendationId?: string; threadId?: string; conversationId?: string; limit?: number; requestId?: string
}) {
  const limit = Math.max(1, Math.min(24, Number(input.limit || 12)))
  const [memoriesResult, assertionsResult, evidenceResult, sourceResult, threadResult] = await Promise.all([
    db.prepare(`SELECT id,memory_key,memory_kind,value_json,confidence,source,status,evidence_json,updated_at
      FROM hermes_memory WHERE status IN ('active','approved') ORDER BY updated_at DESC LIMIT 250`).all<any>(),
    db.prepare(`SELECT assertion_key,category,scope,value_json,weight,confidence,status,source_kind,version,updated_at
      FROM profile_assertions WHERE status='active' ORDER BY confidence DESC,updated_at DESC LIMIT 100`).all<any>(),
    db.prepare(`SELECT memory_id,recommendation_id,thread_id,unit_id,learning_event_id,source_ref,quote,reason,confidence
      FROM memory_evidence`).all<any>().catch(() => ({ results: [] })),
    input.recommendationId ? db.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.status,r.user_score,r.user_rating,r.user_review,m.branch_id,m.learning_state
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`).bind(input.recommendationId).first<any>() : Promise.resolve(null),
    input.threadId ? db.prepare(`SELECT id,title,guiding_question,why_now,definition_of_done,evidence_requirements_json,status FROM learning_threads WHERE id=?`).bind(input.threadId).first<any>() : Promise.resolve(null),
  ])
  const evidenceByMemory = new Map<string, any[]>()
  for (const item of evidenceResult.results || []) evidenceByMemory.set(item.memory_id, [...(evidenceByMemory.get(item.memory_id) || []), item])
  const queryTokens = tokens(input.query)
  const considered: string[] = []; const exclusions: any[] = []
  const ranked = (memoriesResult.results || []).map((row: any) => {
    considered.push(row.id)
    const evidence = evidenceByMemory.get(row.id) || parseJson(row.evidence_json, [])
    const text = `${row.memory_key} ${row.source} ${JSON.stringify(parseJson(row.value_json, ''))} ${evidence.map((item: any) => `${item.quote || ''} ${item.reason || ''}`).join(' ')}`
    const relevance = overlap(queryTokens, tokens(text))
    const explicitLink = evidence.some((item: any) => (input.recommendationId && item.recommendation_id === input.recommendationId) || (input.threadId && item.thread_id === input.threadId)) ? 1 : 0
    const kindScore = input.taskKind === 'self_evolution' ? (row.memory_key.startsWith('skill_procedure:') ? 1 : .45) : row.memory_kind === 'durable' ? 1 : row.memory_kind === 'episodic' ? .7 : .45
    const recency = Math.max(0, 1 - Math.min(365, (Date.now() - Date.parse(`${row.updated_at || ''}Z`)) / 86400000) / 365)
    const score = Number(row.confidence || 0) * .35 + relevance * .30 + explicitLink * .20 + kindScore * .10 + recency * .05
    return { ...row, value: parseJson(row.value_json), evidence, retrieval_score: Math.round(score * 1000) / 1000, relevance, explicitLink }
  }).filter((row: any) => {
    if (row.retrieval_score <= .12) { exclusions.push({ memory_id: row.id, reason: 'low_relevance' }); return false }
    return true
  }).sort((a: any, b: any) => b.retrieval_score - a.retrieval_score).slice(0, limit)
  const assertions = (assertionsResult.results || []).filter((row: any) => {
    const relevant = !queryTokens.size || overlap(queryTokens, tokens(`${row.assertion_key} ${row.value_json}`)) > 0
    return input.taskKind !== 'self_evolution' && relevant
  }).slice(0, 12).map((row: any) => ({ ...row, value: parseJson(row.value_json), value_json: undefined }))
  const packet = {
    task_kind: input.taskKind,
    scope: { recommendation_id: input.recommendationId || null, thread_id: input.threadId || null },
    source: sourceResult || null,
    thread: threadResult ? { ...threadResult, evidence_requirements: parseJson(threadResult.evidence_requirements_json), evidence_requirements_json: undefined } : null,
    memories: ranked.map(({ value_json, evidence_json, ...memory }: any) => memory),
    profile_assertions: assertions,
  }
  const receiptId = `mem_ctx_${crypto.randomUUID()}`
  await db.prepare(`INSERT INTO memory_retrieval_receipts(id,request_id,conversation_id,task_kind,query_text,selected_memory_ids_json,considered_memory_ids_json,exclusions_json,packet_json)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(receiptId, input.requestId || null, input.conversationId || null, input.taskKind, String(input.query || '').slice(0, 500) || null, JSON.stringify(ranked.map((row: any) => row.id)), JSON.stringify(considered), JSON.stringify(exclusions), JSON.stringify(packet)).run()
  return { receipt_id: receiptId, ...packet, considered_count: considered.length, excluded: exclusions }
}
