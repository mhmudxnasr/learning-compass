import type { NoteRecord } from './types'

export type ReadingDirection = 'ltr' | 'rtl'

export type NoteReaderBlock =
  | { kind: 'heading'; level: 2 | 3; text: string; direction: ReadingDirection }
  | { kind: 'paragraph'; text: string; direction: ReadingDirection }
  | { kind: 'quote'; text: string; direction: ReadingDirection }
  | { kind: 'list'; ordered: boolean; start?: number; items: string[]; direction: ReadingDirection }

export interface NoteReaderSection {
  key: string
  label?: string | null
  direction: ReadingDirection
  blocks: NoteReaderBlock[]
}

export interface NoteReaderDocument {
  sections: NoteReaderSection[]
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

  const boundary = lines.slice(first + 1, first + 41).findIndex((line) => (
    line.trim() === '---' || /\s---\s*$/.test(line)
  ))
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
    const source = line.trim().match(/^(?:YT[- ]?Vid(?:eo)?|Source|Video|Article|URL)\s*:?\s*(?:\[[^\]]+\]\()?\(?\s*(https?:\/\/[^\s)\]]+)/i)
    if (!source) return true
    sourceUrl = source[1]
    return false
  })
  return { content: cleaned.join('\n').trim(), sourceUrl }
}

function blockDirection(text: string, sectionDirection?: string | null): ReadingDirection {
  if (sectionDirection === 'ltr' || sectionDirection === 'rtl') return sectionDirection
  return directionForText(text)
}

function isStructuralLine(line: string): boolean {
  return /^\s{0,3}(?:#{1,6}\s+|>\s?|\d+[.)]\s+|[-*+]\s+|[-*_]{3,}\s*$)/.test(line)
}

export function parseNoteBlocks(content: string, sectionDirection?: string | null): NoteReaderBlock[] {
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
      const level = line.startsWith('# ') || line.startsWith('## ') ? 2 : 3
      blocks.push({ kind: 'heading', level, text: heading[1].trim(), direction: blockDirection(heading[1], sectionDirection) })
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

    const listItem = line.match(/^(\d+)[.)]\s+(.+)$|^[-*+]\s+(.+)$/)
    if (listItem) {
      const ordered = Boolean(listItem[1])
      const start = ordered ? Number(listItem[1]) : undefined
      const items: string[] = []
      while (index < lines.length) {
        const candidate = lines[index].trim()
        const match = ordered
          ? candidate.match(/^\d+[.)]\s+(.+)$/)
          : candidate.match(/^[-*+]\s+(.+)$/)
        if (!match) break
        let item = match[1].trim()
        index += 1
        while (index < lines.length && lines[index].trim() && !isStructuralLine(lines[index])) {
          item += ` ${lines[index].trim()}`
          index += 1
        }
        items.push(item)
        if (!lines[index]?.trim()) break
      }
      const text = items.join(' ')
      blocks.push({ kind: 'list', ordered, start, items, direction: blockDirection(text, sectionDirection) })
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
  const sections = (note.sections || []).flatMap((section) => {
    const cleaned = extractContentSource(stripFrontMatter(section.content || ''))
    contentSourceUrl ||= cleaned.sourceUrl
    const blocks = parseNoteBlocks(cleaned.content, section.direction)
    if (!blocks.length) return []
    const combined = blocks.flatMap((block) => block.kind === 'list' ? block.items : [block.text]).join(' ')
    return [{
      key: section.section_key,
      label: section.label,
      direction: blockDirection(combined, section.direction),
      blocks,
    }]
  })
  const allText = sections.flatMap((section) => section.blocks.flatMap((block) => block.kind === 'list' ? block.items : [block.text])).join(' ')
  const wordCount = allText.match(/[\p{L}\p{N}]+/gu)?.length || 0
  return {
    sections,
    contentSourceUrl,
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 180)),
  }
}
