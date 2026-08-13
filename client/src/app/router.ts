import { useEffect, useState } from 'preact/hooks'

export type RootKey = 'home' | 'library' | 'learn' | 'map' | 'settings'
export type Route = {
  root: RootKey
  view: string
  objectType?: string
  objectId?: string
  query: URLSearchParams
  canonical: string
  recoveredFrom?: string
  notFound?: boolean
}

export const roots: Array<{ key: RootKey; label: string; defaultView: string }> = [
  { key: 'home', label: 'Home', defaultView: 'today' },
  { key: 'library', label: 'Library', defaultView: 'queue' },
  { key: 'learn', label: 'Learn', defaultView: 'paths' },
  { key: 'map', label: 'Map', defaultView: 'atlas' },
  { key: 'settings', label: 'Settings', defaultView: 'profile' },
]

export const views: Record<RootKey, Array<{ key: string; label: string; description: string }>> = {
  home: [{ key: 'today', label: 'Today', description: 'The active thread and the next evidence action.' }],
  library: [
    { key: 'queue', label: 'Queue', description: 'The five sources you committed to next.' },
    { key: 'inbox', label: 'Inbox', description: 'Everything captured and waiting for a decision.' },
    { key: 'all', label: 'All sources', description: 'Every source in one searchable ledger.' },
    { key: 'files', label: 'Files', description: 'Uploaded files and generated reading companions.' },
    { key: 'books', label: 'Books', description: 'Books tracked deliberately, with chapter evidence.' },
    { key: 'collections', label: 'Collections', description: 'Focused groups of related learning objects.' },
    { key: 'archive', label: 'Archive', description: 'Completed and excluded sources kept for recovery.' },
  ],
  learn: [
    { key: 'paths', label: 'Paths', description: 'Learning threads with evidence-based progress.' },
    { key: 'notes', label: 'Notes', description: 'Structured, editable bilingual notes.' },
    { key: 'recall', label: 'Recall', description: 'Due review plus drafts awaiting approval.' },
  ],
  map: [
    { key: 'atlas', label: 'Atlas', description: 'The connected topology of what you know.' },
    { key: 'branches', label: 'Branches', description: 'Keep, prune, promote, hold, add, and undo.' },
    { key: 'balance', label: 'Balance', description: 'Coverage, retention, and attention drift.' },
  ],
  settings: [
    { key: 'profile', label: 'Profile', description: 'Priorities, exclusions, and learned patterns.' },
    { key: 'preferences', label: 'Preferences', description: 'Learning, recall, and curation defaults.' },
    { key: 'data', label: 'Data & sync', description: 'Offline work, exports, and storage truth.' },
    { key: 'system', label: 'System', description: 'Capabilities, schedule, storage, and safety.' },
  ],
}

const aliases: Record<string, string> = {
  '': '/home',
  '/today': '/home',
  '/today/momentum': '/home',
  '/today/briefing': '/home',
  '/curate/queue': '/library/queue',
  '/curate/inbox': '/library/inbox',
  '/curate/collections': '/library/collections',
  '/curate/archive': '/library/archive',
  '/curate/books': '/library/books',
  '/curate/discovery': '/library/archive',
  '/learn/hub': '/learn/paths',
  '/learn/files': '/library/files',
  '/vault/files': '/library/files',
  '/vault/notes': '/learn/notes',
  '/learn/cards': '/learn/recall',
  '/learn/review': '/learn/recall',
  '/learn/reflections': '/learn/notes',
  '/learn/activity': '/settings/data',
  '/map/deck': '/map/branches',
  '/map/coverage': '/map/balance',
  '/insights/learning': '/map/balance',
  '/insights/overview': '/home',
  '/insights/taste': '/settings/profile',
  '/insights/hermes': '/settings/profile',
  '/settings/appearance': '/settings/preferences',
  '/settings/learning': '/settings/preferences',
  '/settings/curation': '/settings/preferences',
}

function parseHash(hash = location.hash): Route {
  const raw = (hash.replace(/^#/, '') || '/home').replace(/\/$/, '') || '/home'
  const [rawPath, queryString = ''] = raw.split('?')
  const oldThread = rawPath.match(/^\/learn\/hub\/([^/]+)$/)
  const aliased = oldThread ? `/learn/thread/${oldThread[1]}` : (aliases[rawPath] || rawPath)
  const parts = aliased.replace(/^\//, '').split('/').filter(Boolean)
  const root = parts[0] as RootKey
  const knownRoot = roots.some((item) => item.key === root)
  if (!knownRoot) return { root: 'home', view: 'today', query: new URLSearchParams(queryString), canonical: '/home', notFound: true, recoveredFrom: rawPath }
  const rootMeta = roots.find((item) => item.key === root)!
  const objectRoute = parts.length >= 3
  const view = objectRoute ? rootMeta.defaultView : (parts[1] || rootMeta.defaultView)
  const knownView = views[root].some((item) => item.key === view)
  if (!objectRoute && !knownView) return { root, view: rootMeta.defaultView, query: new URLSearchParams(queryString), canonical: `/${root}/${rootMeta.defaultView}`, notFound: true, recoveredFrom: rawPath }
  return {
    root,
    view,
    objectType: objectRoute ? parts[1] : undefined,
    objectId: objectRoute ? decodeURIComponent(parts.slice(2).join('/')) : undefined,
    query: new URLSearchParams(queryString),
    canonical: aliased,
    recoveredFrom: aliased !== rawPath ? rawPath : undefined,
  }
}

export function routeHref(root: RootKey, view?: string) {
  const defaultView = roots.find((item) => item.key === root)!.defaultView
  return `#/${root}${view && view !== defaultView ? `/${view}` : ''}`
}

export function objectHref(root: RootKey, type: string, id: string) {
  return `#/${root}/${type}/${encodeURIComponent(id)}`
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash())
  useEffect(() => {
    const update = () => setRoute(parseHash())
    addEventListener('hashchange', update)
    if (!location.hash) location.hash = '#/home'
    return () => removeEventListener('hashchange', update)
  }, [])
  return route
}
