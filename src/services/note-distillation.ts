export interface DistillationBlock {
  section_key: string
  section_label: string | null
  block_index: number
  text: string
  checksum: string
}

const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max)
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

export function splitDistillationBlocks(content: string): string[] {
  return String(content || '')
    .split(/\r?\n[\t ]*\r?\n+/)
    .filter((block) => Boolean(block.trim()))
}

export async function distillationChecksum(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n?/g, '\n')))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function loadBlocks(db: D1Database, noteId: string): Promise<DistillationBlock[]> {
  const sections = await db.prepare(`SELECT section_key,label,content FROM note_sections WHERE note_id=? ORDER BY position`).bind(noteId).all<any>()
  const pending = (sections.results || []).flatMap((section: any) => splitDistillationBlocks(section.content).map(async (text, blockIndex) => ({
    section_key: section.section_key,
    section_label: section.label || null,
    block_index: blockIndex,
    text,
    checksum: await distillationChecksum(text),
  })))
  return Promise.all(pending)
}

export async function loadNoteDistillation(db: D1Database, noteId: string) {
  const [note, blocks, highlights, revisions] = await Promise.all([
    db.prepare(`SELECT id,recommendation_id FROM notes WHERE id=?`).bind(noteId).first<any>(),
    loadBlocks(db, noteId),
    db.prepare(`SELECT * FROM note_claim_highlights WHERE note_id=? ORDER BY created_at,id`).bind(noteId).all<any>(),
    db.prepare(`SELECT * FROM note_synthesis_revisions WHERE note_id=? ORDER BY revision DESC`).bind(noteId).all<any>(),
  ])
  if (!note) return null
  const current = new Map(blocks.map((block) => [`${block.section_key}:${block.block_index}`, block.checksum]))
  return {
    blocks,
    highlights: (highlights.results || []).map((highlight: any) => ({
      ...highlight,
      stale: current.get(`${highlight.section_key}:${highlight.block_index}`) !== highlight.block_checksum,
    })),
    synthesis_revisions: revisions.results || [],
    can_promote: Boolean(note.recommendation_id),
  }
}

export async function createClaimHighlight(db: D1Database, noteId: string, input: any) {
  const sectionKey = clean(input.section_key, 120)
  const blockIndex = Number(input.block_index)
  const suppliedChecksum = clean(input.block_checksum, 160)
  const claimText = String(input.claim_text || '').slice(0, 4000)
  if (!sectionKey || !Number.isInteger(blockIndex) || blockIndex < 0 || !suppliedChecksum || !claimText.trim()) return { error: 'section_key, block_index, block_checksum, and claim_text required', status: 400 as const }
  const block = (await loadBlocks(db, noteId)).find((candidate) => candidate.section_key === sectionKey && candidate.block_index === blockIndex)
  if (!block) return { error: 'source block not found', status: 404 as const }
  if (block.checksum !== suppliedChecksum) return { error: 'source block changed; reload before highlighting', status: 409 as const }
  const id = makeId('highlight')
  await db.prepare(`INSERT INTO note_claim_highlights (id,note_id,section_key,block_index,block_checksum,source_text,claim_text) VALUES (?,?,?,?,?,?,?)`).bind(id, noteId, sectionKey, blockIndex, block.checksum, block.text, claimText).run()
  return { id, source_text: block.text, block_checksum: block.checksum }
}

export async function appendSynthesisRevision(db: D1Database, noteId: string, input: any) {
  const synthesisText = String(input.synthesis_text || '').slice(0, 4000)
  if (!synthesisText.trim()) return { error: 'synthesis_text required', status: 400 as const }
  const note = await db.prepare(`SELECT id FROM notes WHERE id=?`).bind(noteId).first()
  if (!note) return { error: 'note not found', status: 404 as const }
  const latest = await db.prepare(`SELECT COALESCE(MAX(revision),0) revision FROM note_synthesis_revisions WHERE note_id=?`).bind(noteId).first<any>()
  const revision = Number(latest?.revision || 0) + 1
  const id = makeId('synthesis')
  await db.prepare(`INSERT INTO note_synthesis_revisions (id,note_id,revision,synthesis_text) VALUES (?,?,?,?)`).bind(id, noteId, revision, synthesisText).run()
  return { id, revision, synthesis_text: synthesisText }
}

export async function promoteHighlightToUnit(db: D1Database, noteId: string, highlightId: string) {
  const highlight = await db.prepare(`SELECT h.*,n.recommendation_id FROM note_claim_highlights h JOIN notes n ON n.id=h.note_id WHERE h.id=? AND h.note_id=?`).bind(highlightId, noteId).first<any>()
  if (!highlight) return { error: 'highlight not found', status: 404 as const }
  if (highlight.promoted_unit_id) return { id: highlight.promoted_unit_id, duplicate: true }
  if (!highlight.recommendation_id) return { error: 'a source-backed note is required for Unit promotion', status: 409 as const }
  const unitId = `unit_${highlight.id}`
  const anchorId = `anchor_${highlight.id}`
  const locator = `note:${noteId}/section:${highlight.section_key}/block:${highlight.block_index}`
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO learning_units (id,unit_type,statement,stance,confidence,recommendation_id,source_revision_checksum,created_by,status,note_id) VALUES (?,'claim',?,'uncertain',0.5,?,?,'user','accepted',?)`).bind(unitId, highlight.claim_text, highlight.recommendation_id, highlight.block_checksum, noteId),
    db.prepare(`INSERT OR IGNORE INTO unit_anchors (id,unit_id,recommendation_id,anchor_type,locator,excerpt,checksum) VALUES (?,?,?,'section',?,?,?)`).bind(anchorId, unitId, highlight.recommendation_id, locator, highlight.source_text, highlight.block_checksum),
    db.prepare(`INSERT INTO learning_unit_revisions (unit_id,actor_type,next_json,reason) SELECT ?,'user',?,'promoted_note_highlight' WHERE NOT EXISTS (SELECT 1 FROM learning_unit_revisions WHERE unit_id=? AND reason='promoted_note_highlight')`).bind(unitId, JSON.stringify({ type: 'claim', statement: highlight.claim_text, note_id: noteId, anchor: locator }), unitId),
    db.prepare(`UPDATE note_claim_highlights SET promoted_unit_id=?,promoted_at=datetime('now') WHERE id=? AND promoted_unit_id IS NULL`).bind(unitId, highlightId),
  ])
  return { id: unitId, anchor_id: anchorId, note_id: noteId, locator }
}
