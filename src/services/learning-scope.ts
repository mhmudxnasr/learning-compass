export type LearningScopeRef =
  | { kind: 'thread'; id: string }
  | { kind: 'level'; id: string }

export type ResolvedLearningScope = {
  kind: 'thread' | 'level'
  id: string
  title: string
  threadId: string
  levelId: string | null
}

export class LearningScopeError extends Error {
  constructor(public code: 'invalid_scope' | 'scope_not_found' | 'scope_integrity_error', message: string) {
    super(message)
  }
}

type ScopeOwner = { kind: 'thread' | 'level'; id: string; title: string }

export type ScopedLearningMaterials = {
  notes: any[]
  files: any[]
  cards: any[]
  drafts: any[]
}

export type ThreadLearningMaterials = {
  thread: ScopedLearningMaterials
  levels: Map<string, ScopedLearningMaterials>
}

const emptyMaterials = (): ScopedLearningMaterials => ({ notes: [], files: [], cards: [], drafts: [] })

export async function resolveLearningScope(db: D1Database, ref: LearningScopeRef): Promise<ResolvedLearningScope> {
  const id = String(ref?.id || '').trim().slice(0, 120)
  if (!id || !['thread', 'level'].includes(ref?.kind)) throw new LearningScopeError('invalid_scope', 'A Thread or Level scope is required.')
  if (ref.kind === 'thread') {
    const thread = await db.prepare(`SELECT id,title FROM learning_threads WHERE id=?`).bind(id).first<any>()
    if (!thread) throw new LearningScopeError('scope_not_found', 'Learning Thread not found.')
    return { kind: 'thread', id: thread.id, title: thread.title, threadId: thread.id, levelId: null }
  }
  const level = await db.prepare(`SELECT s.id,s.title,s.thread_id,t.title AS thread_title FROM learning_path_stages s JOIN learning_threads t ON t.id=s.thread_id WHERE s.id=?`).bind(id).first<any>()
  if (!level) throw new LearningScopeError('scope_not_found', 'Learning Level not found.')
  return { kind: 'level', id: level.id, title: level.title, threadId: level.thread_id, levelId: level.id }
}

const parseMetadata = (row: any) => {
  let metadata: Record<string, unknown> = {}
  try { metadata = JSON.parse(row.metadata_json || '{}') } catch { /* keep malformed legacy metadata isolated */ }
  return { ...row, metadata, metadata_json: undefined }
}

const withOwner = (row: any, owner: ScopeOwner) => ({ ...row, owner_scope: owner })

export async function loadThreadLearningMaterials(db: D1Database, threadId: string): Promise<ThreadLearningMaterials> {
  const thread = await resolveLearningScope(db, { kind: 'thread', id: threadId })
  const levelsResult = await db.prepare(`SELECT id,title FROM learning_path_stages WHERE thread_id=? ORDER BY position`).bind(thread.threadId).all<any>()
  const levels = levelsResult.results || []
  const levelIds = new Set(levels.map((level: any) => String(level.id)))
  const [notesResult, filesResult, cardsResult, draftsResult] = await Promise.all([
    db.prepare(`SELECT * FROM notes WHERE thread_id=? OR stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=?) ORDER BY updated_at DESC LIMIT 500`).bind(thread.threadId, thread.threadId).all<any>(),
    db.prepare(`SELECT id,filename,media_type,size_bytes,metadata_json,thread_id,stage_id,created_at FROM artifacts WHERE thread_id=? OR stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=?) ORDER BY created_at DESC LIMIT 500`).bind(thread.threadId, thread.threadId).all<any>(),
    db.prepare(`SELECT c.*,COALESCE((SELECT title FROM notes WHERE id=c.note_id LIMIT 1),(SELECT video_title FROM recommendations WHERE id=c.recommendation_id LIMIT 1),'Direct Card') AS source_title FROM srs_cards c WHERE c.thread_id=? OR c.stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=?) ORDER BY c.due_at,c.question LIMIT 1000`).bind(thread.threadId, thread.threadId).all<any>(),
    db.prepare(`SELECT d.*,COALESCE((SELECT title FROM notes WHERE id=d.note_id LIMIT 1),(SELECT video_title FROM recommendations WHERE id=d.recommendation_id LIMIT 1),'Direct Draft') AS source_title FROM srs_drafts d WHERE d.thread_id=? OR d.stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=?) ORDER BY d.created_at DESC LIMIT 1000`).bind(thread.threadId, thread.threadId).all<any>(),
  ])
  const notes = notesResult.results || []
  const sectionsByNote = new Map<string, any[]>()
  if (notes.length) {
    const sections = await db.prepare(`SELECT note_id,section_key,label,content,direction,position FROM note_sections WHERE note_id IN (${notes.map(() => '?').join(',')}) ORDER BY note_id,position`).bind(...notes.map((note: any) => note.id)).all<any>()
    for (const section of sections.results || []) sectionsByNote.set(section.note_id, [...(sectionsByNote.get(section.note_id) || []), section])
  }
  const levelTitles = new Map(levels.map((level: any) => [String(level.id), String(level.title)]))
  const output: ThreadLearningMaterials = { thread: emptyMaterials(), levels: new Map(levels.map((level: any) => [String(level.id), emptyMaterials()])) }
  const ownerFor = (stageId: unknown): ScopeOwner => stageId
    ? { kind: 'level', id: String(stageId), title: levelTitles.get(String(stageId)) || 'Unknown Level' }
    : { kind: 'thread', id: thread.id, title: thread.title }
  const add = (kind: keyof ScopedLearningMaterials, row: any) => {
    const stageId = row.stage_id ? String(row.stage_id) : null
    if (stageId && !levelIds.has(stageId)) throw new LearningScopeError('scope_integrity_error', `${kind} belongs to a Level outside this Thread.`)
    const target = stageId ? output.levels.get(stageId) : output.thread
    if (!target) throw new LearningScopeError('scope_integrity_error', `Learning Level material owner is missing.`)
    target[kind].push(withOwner(row, ownerFor(stageId)))
  }
  for (const note of notes) add('notes', { ...note, sections: sectionsByNote.get(note.id) || [] })
  for (const file of filesResult.results || []) add('files', parseMetadata(file))
  for (const card of cardsResult.results || []) add('cards', card)
  for (const draft of draftsResult.results || []) add('drafts', draft)
  return output
}
