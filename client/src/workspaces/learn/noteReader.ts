import type { NoteRecord } from './types'

export type ReadingDirection = 'ltr' | 'rtl'

export type NoteReaderBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string; direction: ReadingDirection; id: string }
  | { kind: 'quote'; text: string; direction: ReadingDirection }
  | { kind: 'list'; ordered: boolean; start?: number; items: string[]; direction: ReadingDirection }
  | { kind: 'paragraph'; text: string; direction: ReadingDirection }

export interface NoteReaderSection {
  key: string
  label?: string | null
  direction: ReadingDirection
  blocks: NoteReaderBlock[]
}

export interface NoteOutlineItem {
  id: string
  label: string
  level: number
  sectionKey: string
}

export interface NoteReaderDocument {
  sections: NoteReaderSection[]
  provenance: NonNullable<NoteRecord['sections']>
  outline: NoteOutlineItem[]
  contentSourceUrl?: string
  wordCount: number
  readingMinutes: number
}

const RTL_CHARACTERS = /[\u0590-\u08ff]/g
const LATIN_CHARACTERS = /[A-Za-z]/g

export function directionForText(text: string): ReadingDirection {
  const rtl = text.match(RTL_CHARACTERS)?.length || 0
  const latin = text.match(LATIN_CHARACTERS)?.length || 0
  return rtl > 0 && rtl >= latin * 0.35 ? 'rtl' : 'ltr'
}

function stripFrontMatter(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const first = lines.findIndex((line) => line.trim())
  if (first < 0 || lines[first].trim() !== '---') return content
  const boundary = lines
    .slice(first + 1, first + 41)
    .findIndex((line) => line.trim() === '---' || /\s---\s*$/.test(line))
  if (boundary < 0) return content
  return lines.slice(first + boundary + 2).join('\n')
}

function extractContentSource(content: string): { content: string; sourceUrl?: string } {
  const lines = content.split('\n')
  let meaningful = 0
  let sourceUrl: string | undefined
  const cleaned = lines.filter((line) => {
    if (!line.trim()) return true
    meaningful += 1
    if (meaningful > 4) return true
    const source = line
      .trim()
      .match(/^(?:YT[- ]?Vid(?:eo)?|Source|Video|Article|URL)\s*:?\s*(?:\[[^\]]+\]\()?\(?\s*(https?:\/\/[^\s)\]]+)/i)
    if (!source) return true
    sourceUrl = source[1]
    return false
  })
  return { content: cleaned.join('\n').trim(), sourceUrl }
}

export function blockDirection(text: string, sectionDirection?: string | null): ReadingDirection {
  const natural = directionForText(text)
  if (natural === 'rtl') return 'rtl'
  if (sectionDirection === 'ltr' || sectionDirection === 'rtl') return sectionDirection
  return natural
}

function isStructuralLine(line: string): boolean {
  return /^\s{0,3}(?:#{1,6}\s+|>\s?|\d+[.)]\s+|[-*+]\s+|[-*_]{3,}\s*$)/.test(line)
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'heading'
  )
}

export function parseNoteBlocks(
  content: string,
  sectionDirection?: string | null,
  sectionKey = 'sec',
): NoteReaderBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const blocks: NoteReaderBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line || /^[-*_]{3,}$/.test(line)) {
      index += 1
      continue
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      const level = line.startsWith('# ') || line.startsWith('## ') ? 2 : line.startsWith('### ') ? 3 : 4
      const text = heading[1].trim()
      blocks.push({
        kind: 'heading',
        level,
        text,
        direction: blockDirection(text, sectionDirection),
        id: `${sectionKey}-${slugify(text)}`,
      })
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, '').trim())
        index += 1
      }
      const text = quote.join(' ')
      blocks.push({ kind: 'quote', text, direction: blockDirection(text, sectionDirection) })
      continue
    }

    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)$/)
    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/)
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch)
      const start = orderedMatch ? Number(orderedMatch[1]) : undefined
      const items: string[] = []
      while (index < lines.length) {
        const candidate = lines[index].trim()
        const match = ordered ? candidate.match(/^\d+[.)]\s+(.+)$/) : candidate.match(/^[-*+]\s+(.+)$/)
        if (!match) break
        let item = match[ordered ? 1 : 1].trim()
        index += 1
        while (index < lines.length && lines[index].trim() && !isStructuralLine(lines[index])) {
          item += ` ${lines[index].trim()}`
          index += 1
        }
        items.push(item)
        if (!lines[index]?.trim()) break
      }
      blocks.push({ kind: 'list', ordered, start, items, direction: blockDirection(items.join(' '), sectionDirection) })
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isStructuralLine(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    const text = paragraph.join(' ')
    blocks.push({ kind: 'paragraph', text, direction: blockDirection(text, sectionDirection) })
  }

  return blocks
}

export function buildNoteReaderDocument(note: NoteRecord): NoteReaderDocument {
  let contentSourceUrl: string | undefined
  const outline: NoteOutlineItem[] = []
  // Receipts remain verbatim in the record, editor, and provenance disclosure.
  const isReceipt = (section: NonNullable<NoteRecord['sections']>[number]) =>
    [section.section_key, section.label].some((value) =>
      /^(?:extraction|processing)[ _-]receipt(?:[ _-]v\d+)?$/i.test(value || ''),
    )
  const provenance = (note.sections || []).filter(isReceipt)
  const readingSections = (note.sections || []).filter((section) => !isReceipt(section))
  const sections = readingSections.flatMap((section, sectionIndex) => {
    const cleaned = extractContentSource(stripFrontMatter(section.content || ''))
    contentSourceUrl ||= cleaned.sourceUrl
    const sectionKey = section.section_key || `sec-${sectionIndex}`
    const blocks = parseNoteBlocks(cleaned.content, section.direction, sectionKey)
    if (!blocks.length) return []
    if (readingSections.filter((item) => item.content?.trim()).length > 1) {
      outline.push({
        id: `section-${sectionKey}`,
        label: section.label || `Section ${sectionIndex + 1}`,
        level: 1,
        sectionKey,
      })
    }
    for (const block of blocks)
      if (block.kind === 'heading') outline.push({ id: block.id, label: block.text, level: block.level, sectionKey })
    const combined = blocks.flatMap((block) => (block.kind === 'list' ? block.items : [block.text])).join(' ')
    return [{ key: sectionKey, label: section.label, direction: blockDirection(combined, section.direction), blocks }]
  })
  const allText = sections
    .flatMap((section) => section.blocks.flatMap((block) => (block.kind === 'list' ? block.items : [block.text])))
    .join(' ')
  const wordCount = allText.match(/[\p{L}\p{N}]+/gu)?.length || 0
  return {
    sections,
    provenance,
    outline,
    contentSourceUrl,
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 180)),
  }
}
