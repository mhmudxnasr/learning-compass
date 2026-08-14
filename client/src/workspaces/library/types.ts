import type { Route } from '../../app/router'
import { objectHref as canonicalObjectHref, routeHref } from '../../app/router'

export type LibraryView = 'queue' | 'inbox' | 'feeds' | 'all' | 'files' | 'books' | 'collections' | 'archive'
export type LibraryObjectType = 'source' | 'artifact' | 'book' | 'collection'

export type LibraryRecord = Record<string, any>

export type LibrarySelection = {
  type: LibraryObjectType
  id: string
  title: string
  data: LibraryRecord
  route: string
}

export type LibraryWorkspaceProps = {
  route?: Route
  onInspect?: (selection: LibrarySelection | null) => void
  onSelect?: (selection: LibrarySelection | null) => void
  onNavigate?: (href: string) => void
}

export type LibraryActionResult = { ok: boolean; error?: string; code?: string }

export const viewLabels: Record<LibraryView, string> = {
  queue: 'Queue',
  inbox: 'Inbox',
  feeds: 'RSS Feeds',
  all: 'All sources',
  files: 'Files',
  books: 'Books',
  collections: 'Collections',
  archive: 'Archive',
}

export const objectLabels: Record<LibraryObjectType, string> = {
  source: 'Source',
  artifact: 'Artifact',
  book: 'Book',
  collection: 'Collection',
}

export function objectHref(type: LibraryObjectType, id: string) {
  return canonicalObjectHref('library', type, id)
}

export function viewHref(view: LibraryView) {
  if (view === 'queue') return routeHref('library', 'triage', 'queue')
  if (view === 'inbox') return routeHref('library', 'triage', 'inbox')
  if (view === 'feeds') return routeHref('library', 'triage', 'feeds')
  if (view === 'files') return routeHref('library', 'assets', 'files')
  return routeHref('library', 'catalog', view)
}

export function asView(value?: string): LibraryView {
  return value && value in viewLabels ? value as LibraryView : 'queue'
}

export function listFrom<T = LibraryRecord>(data: unknown, key: string): T[] {
  if (!data || typeof data !== 'object') return []
  const value = (data as LibraryRecord)[key]
  return Array.isArray(value) ? value as T[] : []
}

export function parseMetadata(value: unknown): LibraryRecord {
  if (value && typeof value === 'object') return value as LibraryRecord
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function sourceTitle(item: LibraryRecord) {
  return String(item.video_title || item.title || item.name || 'Untitled source')
}

export function sourceCreator(item: LibraryRecord) {
  return String(item.creator || item.author || item.feed_title || 'Independent source')
}

export function sourceFormat(item: LibraryRecord) {
  return String(item.content_type || item.format || (item.media_type ? fileKind(item) : 'source'))
}

export function sourceState(item: LibraryRecord) {
  return String(item.learning_state || item.status || 'saved').replace(/_/g, ' ')
}

export function sourceLink(item: LibraryRecord) {
  const url = String(item.video_url || item.url || '').trim()
  return url || null
}

export function artifactLink(item: LibraryRecord) {
  if (item.legacy) return `/html/download/${encodeURIComponent(String(item.id))}`
  const id = encodeURIComponent(String(item.id))
  return /markdown|text\/plain/i.test(String(item.media_type || '')) || /\.md$/i.test(String(item.filename || ''))
    ? `/artifacts/${id}/view`
    : `/artifacts/${id}`
}

export function fileKind(item: LibraryRecord) {
  const media = `${item.media_type || ''} ${item.filename || ''}`.toLowerCase()
  if (media.includes('pdf')) return 'PDF'
  if (media.includes('html')) return 'HTML'
  if (media.includes('markdown') || media.includes('text/plain') || media.includes('.md')) return 'Markdown'
  if (media.includes('image')) return 'Image'
  return 'File'
}

export function formatBytes(value: unknown) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatQueueMeta(item: LibraryRecord) {
  const parts = [sourceFormat(item), sourceCreator(item)]
  if (item.estimated_minutes) parts.push(`~${item.estimated_minutes} min`)
  return parts.join(' · ')
}

export function formatReason(item: LibraryRecord) {
  const explicit = String(item.context_brief || item.why_this || '').trim()
  if (explicit) return explicit
  const title = sourceTitle(item)
  const creator = item.creator ? ` by ${item.creator}` : ''
  return `A source to examine${creator}: ${title}.`
}

export function formatStatus(value: unknown) {
  return String(value || 'saved').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function sourceSelection(item: LibraryRecord): LibrarySelection {
  const id = String(item.id)
  return { type: 'source', id, title: sourceTitle(item), data: item, route: objectHref('source', id) }
}

export function artifactSelection(item: LibraryRecord): LibrarySelection {
  const id = String(item.id)
  return { type: 'artifact', id, title: String(item.filename || 'Untitled artifact'), data: item, route: objectHref('artifact', id) }
}

export function bookSelection(item: LibraryRecord): LibrarySelection {
  const id = String(item.id)
  return { type: 'book', id, title: sourceTitle(item), data: item, route: objectHref('book', id) }
}

export function collectionSelection(item: LibraryRecord): LibrarySelection {
  const id = String(item.id)
  return { type: 'collection', id, title: String(item.name || 'Untitled collection'), data: item, route: objectHref('collection', id) }
}
