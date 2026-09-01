type DB = Pick<D1Database, 'prepare' | 'batch'>

export type MemoryTaskKind = 'recommendation' | 'feedback' | 'learning' | 'self_evolution'
const taskKinds: MemoryTaskKind[] = ['recommendation', 'feedback', 'learning', 'self_evolution']
const parseJson = (value: unknown, fallback: any = null) => {
  try {
    return value ? JSON.parse(String(value)) : fallback
  } catch {
    return fallback
  }
}
const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('und')
    .replace(/\p{M}+/gu, '')
    .match(/[\p{L}\p{N}]+/gu)
    ?.join(' ') || ''
export const memoryContextTokens = (value: unknown) =>
  new Set(
    normalize(value)
      .split(' ')
      .filter((word) => word.length > 1),
  )
const overlap = (left: Set<string>, right: Set<string>) =>
  left.size ? [...left].filter((word) => right.has(word)).length / left.size : 0

export function isMemoryOwnershipAllowed(memoryKey: string) {
  const key = memoryKey.trim().toLowerCase()
  return !/^(profile|preference|personal|policy|queue|source|recommendation|session|job|thread|unit)[.:/]/.test(key)
}

export function isMemoryTaskKind(value: string): value is MemoryTaskKind {
  return taskKinds.includes(value as MemoryTaskKind)
}

export function buildMemoryEvidenceStatements(db: DB, memoryId: string, evidence: any[]) {
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM memory_evidence WHERE memory_id=?').bind(memoryId)]
  for (const item of evidence.slice(0, 20)) {
    statements.push(
      db
        .prepare(
          `INSERT INTO memory_evidence(id,memory_id,evidence_type,recommendation_id,thread_id,unit_id,learning_event_id,source_ref,quote,reason,confidence)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `mem_ev_${crypto.randomUUID()}`,
          memoryId,
          String(item.evidence_type || 'source').slice(0, 60),
          item.recommendation_id || null,
          item.thread_id || null,
          item.unit_id || null,
          item.learning_event_id || null,
          String(item.source || item.source_ref || '').slice(0, 500) || null,
          String(item.quote || '').slice(0, 1000) || null,
          String(item.reason || '').slice(0, 500) || null,
          item.confidence == null ? null : Math.max(0, Math.min(1, Number(item.confidence))),
        ),
    )
  }
  return statements
}

export async function writeMemoryEvidence(db: DB, memoryId: string, evidence: any[]) {
  await db.batch(buildMemoryEvidenceStatements(db, memoryId, evidence))
}

export async function compileMemoryContext(
  db: DB,
  input: {
    taskKind: MemoryTaskKind
    query?: string
    recommendationId?: string
    threadId?: string
    conversationId?: string
    limit?: number
    requestId?: string
  },
) {
  const limit = Math.max(1, Math.min(24, Number(input.limit || 12)))
  const [memoriesResult, assertionsResult, evidenceResult, sourceResult, threadResult] = await Promise.all([
    db
      .prepare(
        `SELECT id,memory_key,memory_kind,value_json,confidence,source,status,evidence_json,updated_at
      FROM hermes_memory WHERE status IN ('active','approved') ORDER BY updated_at DESC LIMIT 250`,
      )
      .all<any>(),
    db
      .prepare(
        `SELECT assertion_key,category,scope,value_json,weight,confidence,status,source_kind,version,updated_at
      FROM profile_assertions WHERE status='active' ORDER BY confidence DESC,updated_at DESC LIMIT 100`,
      )
      .all<any>(),
    db
      .prepare(
        `SELECT memory_id,recommendation_id,thread_id,unit_id,learning_event_id,source_ref,quote,reason,confidence
      FROM memory_evidence`,
      )
      .all<any>()
      .catch(() => ({ results: [] })),
    input.recommendationId
      ? db
          .prepare(
            `SELECT r.id,r.video_title,r.creator,r.content_type,r.status,r.user_score,r.user_rating,r.user_review,m.branch_id,m.learning_state
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.id=?`,
          )
          .bind(input.recommendationId)
          .first<any>()
      : Promise.resolve(null),
    input.threadId
      ? db
          .prepare(
            `SELECT id,title,guiding_question,why_now,definition_of_done,status FROM learning_threads WHERE id=?`,
          )
          .bind(input.threadId)
          .first<any>()
      : Promise.resolve(null),
  ])
  const evidenceByMemory = new Map<string, any[]>()
  for (const item of evidenceResult.results || [])
    evidenceByMemory.set(item.memory_id, [...(evidenceByMemory.get(item.memory_id) || []), item])
  const queryTokens = memoryContextTokens(input.query)
  const hasQueryTerms = queryTokens.size > 0
  const considered: string[] = []
  const exclusions: any[] = []
  const memoryCandidates = (memoriesResult.results || [])
    .map((row: any) => {
      considered.push(row.id)
      const evidence = evidenceByMemory.get(row.id) || parseJson(row.evidence_json, [])
      const text = `${row.memory_key} ${row.source} ${JSON.stringify(parseJson(row.value_json, ''))} ${evidence.map((item: any) => `${item.quote || ''} ${item.reason || ''}`).join(' ')}`
      const relevance = overlap(queryTokens, memoryContextTokens(text))
      const explicitLink = evidence.some(
        (item: any) =>
          (input.recommendationId && item.recommendation_id === input.recommendationId) ||
          (input.threadId && item.thread_id === input.threadId),
      )
        ? 1
        : 0
      const kindScore =
        input.taskKind === 'self_evolution'
          ? row.memory_key.startsWith('skill_procedure:')
            ? 1
            : 0.45
          : row.memory_kind === 'durable'
            ? 1
            : row.memory_kind === 'episodic'
              ? 0.7
              : 0.45
      const recency = Math.max(
        0,
        1 - Math.min(365, (Date.now() - Date.parse(`${row.updated_at || ''}Z`)) / 86400000) / 365,
      )
      const score =
        Number(row.confidence || 0) * 0.35 + relevance * 0.3 + explicitLink * 0.2 + kindScore * 0.1 + recency * 0.05
      return {
        ...row,
        value: parseJson(row.value_json),
        evidence,
        retrieval_score: Math.round(score * 1000) / 1000,
        relevance,
        explicitLink,
      }
    })
    .filter((row: any) => {
      if (hasQueryTerms && row.relevance === 0 && row.explicitLink === 0) {
        exclusions.push({ item_type: 'memory', memory_id: row.id, reason: 'no_query_match' })
        return false
      }
      if (row.retrieval_score <= 0.12) {
        exclusions.push({ item_type: 'memory', memory_id: row.id, reason: 'low_relevance' })
        return false
      }
      return true
    })
    .sort((a: any, b: any) => b.retrieval_score - a.retrieval_score)
  const ranked = memoryCandidates.slice(0, limit)
  for (const row of memoryCandidates.slice(limit))
    exclusions.push({ item_type: 'memory', memory_id: row.id, reason: 'limit_truncated' })

  const assertionCandidates: any[] = []
  for (const row of assertionsResult.results || []) {
    if (input.taskKind === 'self_evolution') {
      exclusions.push({
        item_type: 'profile_assertion',
        assertion_key: row.assertion_key,
        reason: 'task_kind_excluded',
      })
      continue
    }
    const relevant =
      !hasQueryTerms || overlap(queryTokens, memoryContextTokens(`${row.assertion_key} ${row.value_json}`)) > 0
    if (!relevant) {
      exclusions.push({ item_type: 'profile_assertion', assertion_key: row.assertion_key, reason: 'no_query_match' })
      continue
    }
    assertionCandidates.push(row)
  }
  const selectedAssertionRows = assertionCandidates.slice(0, 12)
  for (const row of assertionCandidates.slice(12))
    exclusions.push({ item_type: 'profile_assertion', assertion_key: row.assertion_key, reason: 'limit_truncated' })
  const assertions = selectedAssertionRows.map((row: any) => ({
    ...row,
    value: parseJson(row.value_json),
    value_json: undefined,
  }))
  const packet = {
    task_kind: input.taskKind,
    scope: { recommendation_id: input.recommendationId || null, thread_id: input.threadId || null },
    source: sourceResult || null,
    thread: threadResult || null,
    memories: ranked.map(({ value_json: _valueJson, evidence_json: _evidenceJson, ...memory }: any) => memory),
    profile_assertions: assertions,
  }
  const receiptId = `mem_ctx_${crypto.randomUUID()}`
  await db
    .prepare(
      `INSERT INTO memory_retrieval_receipts(id,request_id,conversation_id,task_kind,query_text,selected_memory_ids_json,considered_memory_ids_json,exclusions_json,packet_json)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      receiptId,
      input.requestId || null,
      input.conversationId || null,
      input.taskKind,
      String(input.query || '').slice(0, 500) || null,
      JSON.stringify(ranked.map((row: any) => row.id)),
      JSON.stringify(considered),
      JSON.stringify(exclusions),
      JSON.stringify(packet),
    )
    .run()
  return {
    receipt_id: receiptId,
    ...packet,
    considered_count: considered.length,
    profile_assertions_considered_count: (assertionsResult.results || []).length,
    excluded: exclusions,
  }
}
