import type { Bindings } from '../lib'

export const SEMANTIC_MODEL = '@cf/baai/bge-base-en-v1.5'
const MAX_TEXT = 6000

const normalizedText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
const hashText = async (text: string) => {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

export async function embedTexts(env: Pick<Bindings, 'AI'>, values: unknown[]): Promise<number[][] | null> {
  const text = values.map(normalizedText).filter(Boolean)
  if (!env.AI || !text.length) return null
  try {
    const response = await env.AI.run(SEMANTIC_MODEL, { text })
    const vectors = Array.isArray(response?.data) ? response.data : []
    return vectors.length === text.length && vectors.every((vector: unknown) => Array.isArray(vector) && vector.length === 768)
      ? vectors.map((vector: number[]) => vector.map(Number)) : null
  } catch { return null }
}

export async function indexSemanticDocuments(env: Pick<Bindings, 'AI' | 'COMPASS_VECTORS' | 'DB'>, documents: Array<{ id: string; kind: 'recommendation' | 'thread' | 'note' | 'unit' | 'annotation'; sourceId: string; text: unknown; language?: string }>) {
  if (!env.AI || !env.COMPASS_VECTORS) return { enabled: false, indexed: 0, skipped: documents.length, reason: 'semantic_bindings_unavailable' }
  const prepared = await Promise.all(documents.map(async (document) => ({ ...document, text: normalizedText(document.text), hash: await hashText(normalizedText(document.text)) })))
  const changed: typeof prepared = []
  for (const document of prepared) {
    if (!document.text) continue
    const existing = await env.DB.prepare(`SELECT content_hash,status FROM semantic_documents WHERE document_kind=? AND source_id=?`).bind(document.kind, document.sourceId).first<any>()
    if (existing?.content_hash === document.hash && existing.status === 'indexed') continue
    changed.push(document)
  }
  if (!changed.length) return { enabled: true, indexed: 0, skipped: prepared.length, reason: 'already_current' }
  const vectors = await embedTexts(env, changed.map((document) => document.text))
  if (!vectors) return { enabled: true, indexed: 0, skipped: prepared.length, reason: 'embedding_unavailable' }
  try {
    await env.COMPASS_VECTORS.upsert(changed.map((document, index) => ({ id: document.id, values: vectors[index], namespace: 'learning-compass', metadata: { kind: document.kind, source_id: document.sourceId, language: document.language || 'und' } })))
    await env.DB.batch(changed.map((document) => env.DB.prepare(`INSERT INTO semantic_documents(id,document_kind,source_id,content_hash,model,status,error,indexed_at,updated_at)
      VALUES (?,?,?,?,?,'indexed',NULL,datetime('now'),datetime('now'))
      ON CONFLICT(document_kind,source_id) DO UPDATE SET id=excluded.id,content_hash=excluded.content_hash,model=excluded.model,status='indexed',error=NULL,indexed_at=datetime('now'),updated_at=datetime('now')`).bind(document.id, document.kind, document.sourceId, document.hash, SEMANTIC_MODEL)))
    return { enabled: true, indexed: changed.length, skipped: prepared.length - changed.length, reason: null }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'vector_index_write_failed'
    await env.DB.batch(changed.map((document) => env.DB.prepare(`INSERT INTO semantic_documents(id,document_kind,source_id,content_hash,model,status,error,indexed_at,updated_at)
      VALUES (?,?,?,?,?,'failed',?,datetime('now'),datetime('now'))
      ON CONFLICT(document_kind,source_id) DO UPDATE SET content_hash=excluded.content_hash,model=excluded.model,status='failed',error=excluded.error,updated_at=datetime('now')`).bind(document.id, document.kind, document.sourceId, document.hash, SEMANTIC_MODEL, message)))
    return { enabled: true, indexed: 0, skipped: prepared.length, reason: 'vector_index_write_failed' }
  }
}

export async function semanticSourceMatches(env: Pick<Bindings, 'AI' | 'COMPASS_VECTORS'>, query: unknown, topK = 20) {
  if (!env.AI || !env.COMPASS_VECTORS) return { enabled: false, matches: [] as Array<{ id: string; score: number }> }
  const vectors = await embedTexts(env, [query])
  if (!vectors) return { enabled: true, matches: [] as Array<{ id: string; score: number }> }
  try {
    const response = await env.COMPASS_VECTORS.query(vectors[0], { topK: Math.max(1, Math.min(50, topK)), namespace: 'learning-compass', returnMetadata: 'all' })
    return { enabled: true, matches: (response?.matches || []).map((match: any) => ({ id: String(match.id), score: Number(match.score || 0), metadata: match.metadata || {} })) }
  } catch { return { enabled: true, matches: [] as Array<{ id: string; score: number }> } }
}
