export const SOURCE_NOTE_CONTRACT = 'source_note_v2'

const anchorTypes = new Set(['page', 'timestamp', 'section', 'quote', 'url_fragment', 'user_observation'])
const legacySectionKeys = new Set(['foundation', 'case_studies', 'exploitation', 'defense'])
const genericTitleSuffix = /\s*[—–-]\s*source (?:notes?|study notes?|study guide)$/i

export function countNoteWords(value: unknown): number {
  return String(value || '').match(/[\p{L}\p{N}]+/gu)?.length || 0
}

export function minimumSourceNoteWords(sourceWordCount: number): number {
  const words = Math.max(1, Math.floor(sourceWordCount))
  if (words <= 120) return Math.max(25, Math.ceil(words * 0.35))
  if (words <= 800) return Math.max(80, Math.ceil(words * 0.25))
  if (words <= 4000) return Math.max(220, Math.ceil(words * 0.15))
  return Math.min(1200, Math.max(500, Math.ceil(words * 0.1)))
}

export function validateSourceNoteCompletion(payload: any, body: any): string[] {
  if (payload?.output_contract !== SOURCE_NOTE_CONTRACT) return []

  const failures: string[] = []
  const note = body?.note || {}
  const extraction = body?.extraction || {}
  const sections = Array.isArray(note.sections) ? note.sections : []
  const units = Array.isArray(body?.learning_units) ? body.learning_units : []
  const drafts = Array.isArray(body?.srs_drafts) ? body.srs_drafts : []

  if (note.kind === 'reflection') failures.push('source note cannot be a reflection')
  if (!String(note.title || '').trim()) failures.push('source note title is required')
  if (genericTitleSuffix.test(String(note.title || '').trim()))
    failures.push('source note title must preserve the source title without a generated suffix')
  if (!sections.length) failures.push('source note requires at least one section')
  if (
    sections.some(
      (section: any) =>
        !String(section?.section_key || '').trim() ||
        !String(section?.label || '').trim() ||
        !String(section?.content || '').trim(),
    )
  )
    failures.push('every source note section requires section_key, label, and content')
  const sectionKeys = new Set(sections.map((section: any) => String(section?.section_key || '').trim()))
  if ([...legacySectionKeys].every((key) => sectionKeys.has(key)))
    failures.push('legacy Foundation/Case Studies/Exploitation/Defense template is forbidden')

  if (extraction.contract !== SOURCE_NOTE_CONTRACT) failures.push(`extraction.contract must be ${SOURCE_NOTE_CONTRACT}`)
  if (extraction.complete !== true) failures.push('source extraction must be complete')
  if (!String(extraction.adapter || '').trim()) failures.push('extraction.adapter is required')
  if (!/^[a-f0-9]{64}$/i.test(String(extraction.source_hash || '')))
    failures.push('extraction.source_hash must be a SHA-256 hash')
  const sourceWordCount = Number(extraction.source_word_count || 0)
  if (!Number.isInteger(sourceWordCount) || sourceWordCount < 1)
    failures.push('extraction.source_word_count must be a positive integer')

  const noteWordCount = sections.reduce((sum: number, section: any) => sum + countNoteWords(section?.content), 0)
  if (Number(extraction.note_word_count) !== noteWordCount)
    failures.push('extraction.note_word_count must match the submitted note body')
  if (sourceWordCount > 0 && noteWordCount < minimumSourceNoteWords(sourceWordCount))
    failures.push(
      `source note is too thin for the source (${noteWordCount}/${minimumSourceNoteWords(sourceWordCount)} minimum words)`,
    )
  if (!['complete', 'source-bounded'].includes(String(extraction.coverage_status || '')))
    failures.push('extraction.coverage_status must be complete or source-bounded')

  if (!units.length) failures.push('source note requires at least one durable learning unit')
  if (units.length > 16) failures.push('source note may keep at most 16 learning units')
  const unitIds = new Set<string>()
  const semanticStatements = new Set<string>()
  for (const [index, unit] of units.entries()) {
    const unitId = String(unit?.id || '').trim()
    const statement = String(unit?.statement || '').trim()
    const semantic = statement.toLowerCase().replace(/\s+/g, ' ')
    const anchors = Array.isArray(unit?.anchors) ? unit.anchors : []
    if (!unitId) failures.push(`learning unit ${index + 1} requires a stable id`)
    else if (unitIds.has(unitId)) failures.push(`learning unit ${index + 1} duplicates id ${unitId}`)
    else unitIds.add(unitId)
    if (!statement) failures.push(`learning unit ${index + 1} requires a statement`)
    else if (semanticStatements.has(semantic)) failures.push(`learning unit ${index + 1} duplicates another statement`)
    else semanticStatements.add(semantic)
    if (!anchors.length) failures.push(`learning unit ${index + 1} requires a source anchor`)
    for (const [anchorIndex, anchor] of anchors.entries()) {
      if (!anchorTypes.has(String(anchor?.anchor_type || '')))
        failures.push(`learning unit ${index + 1} anchor ${anchorIndex + 1} has an invalid type`)
      if (!String(anchor?.locator || '').trim())
        failures.push(`learning unit ${index + 1} anchor ${anchorIndex + 1} requires a locator`)
    }
  }

  if (drafts.length)
    failures.push(
      'automated recall drafting is disabled; create cards only through an explicit learner-authored action',
    )

  return failures
}
