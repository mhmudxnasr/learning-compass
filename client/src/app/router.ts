import { useEffect, useState } from 'preact/hooks'

/**
 * The shell has five page destinations. Everything that changes the surface
 * inside one of those destinations is state (`mode`), not another page in
 * the URL. Typed records are the deliberate exception: their identity remains
 * addressable at `/root/type/id`.
 */
export type RootKey = 'home' | 'library' | 'learn' | 'map' | 'settings'

export type ModeDefinition = {
  key: string
  label: string
  description: string
}

export type RootDefinition = {
  key: RootKey
  label: string
  defaultMode: string
  /** Compatibility name for workspaces that still consume `defaultView`. */
  defaultView: string
}

export type Route = {
  root: RootKey
  /** Compatibility name; this is always the normalized root mode. */
  view: string
  mode: string
  objectType?: string
  objectId?: string
  query: URLSearchParams
  canonical: string
  recoveredFrom?: string
  notFound?: boolean
}

export const roots: RootDefinition[] = [
  { key: 'home', label: 'Home', defaultMode: 'today', defaultView: 'today' },
  { key: 'library', label: 'Library', defaultMode: 'queue', defaultView: 'queue' },
  { key: 'learn', label: 'Learn', defaultMode: 'paths', defaultView: 'paths' },
  { key: 'map', label: 'Map', defaultMode: 'atlas', defaultView: 'atlas' },
  { key: 'settings', label: 'Settings', defaultMode: 'profile', defaultView: 'profile' },
]

export const modes: Record<RootKey, ModeDefinition[]> = {
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

/** Compatibility export while workspaces migrate from `views` to `modes`. */
export const views = modes

type LegacyDestination = { root: RootKey; mode: string }

const legacyDestinations: Record<string, LegacyDestination> = {
  '/': { root: 'home', mode: 'today' },
  '/today': { root: 'home', mode: 'today' },
  '/today/momentum': { root: 'home', mode: 'today' },
  '/today/briefing': { root: 'home', mode: 'today' },
  '/curate/queue': { root: 'library', mode: 'queue' },
  '/curate/inbox': { root: 'library', mode: 'inbox' },
  '/curate/collections': { root: 'library', mode: 'collections' },
  '/curate/archive': { root: 'library', mode: 'archive' },
  '/curate/books': { root: 'library', mode: 'books' },
  '/curate/discovery': { root: 'library', mode: 'archive' },
  '/learn/hub': { root: 'learn', mode: 'paths' },
  '/learn/files': { root: 'library', mode: 'files' },
  '/vault/files': { root: 'library', mode: 'files' },
  '/vault/notes': { root: 'learn', mode: 'notes' },
  '/learn/cards': { root: 'learn', mode: 'recall' },
  '/learn/review': { root: 'learn', mode: 'recall' },
  '/learn/reflections': { root: 'learn', mode: 'notes' },
  '/learn/activity': { root: 'settings', mode: 'data' },
  '/map/deck': { root: 'map', mode: 'branches' },
  '/map/coverage': { root: 'map', mode: 'balance' },
  '/insights/learning': { root: 'map', mode: 'balance' },
  '/insights/overview': { root: 'home', mode: 'today' },
  '/insights/taste': { root: 'settings', mode: 'profile' },
  '/insights/hermes': { root: 'settings', mode: 'profile' },
  '/settings/appearance': { root: 'settings', mode: 'preferences' },
  '/settings/learning': { root: 'settings', mode: 'preferences' },
  '/settings/curation': { root: 'settings', mode: 'preferences' },
}

function rootMeta(root: RootKey) {
  return roots.find((item) => item.key === root)!
}

function modeKnown(root: RootKey, mode: string | null | undefined): mode is string {
  return Boolean(mode && modes[root].some((item) => item.key === mode))
}

function modeMeta(root: RootKey, mode: string) {
  return modes[root].find((item) => item.key === mode)!
}

function encodeQuery(root: RootKey, mode: string) {
  const defaultMode = rootMeta(root).defaultMode
  return mode === defaultMode ? '' : `?mode=${encodeURIComponent(mode)}`
}

function canonicalRoot(root: RootKey, mode: string) {
  return `/${root}${encodeQuery(root, mode)}`
}

function mergeLegacyQuery(query: URLSearchParams, mode: string) {
  const merged = new URLSearchParams(query)
  if (!merged.has('mode')) merged.set('mode', mode)
  return merged
}

/** Parse a hash independently of browser globals so route recovery is testable. */
export function parseRoute(hash = typeof location === 'undefined' ? '' : location.hash): Route {
  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash
  const raw = (rawHash || '/home').replace(/\/$/, '') || '/home'
  const [rawPath, queryString = ''] = raw.split('?')
  const originalQuery = new URLSearchParams(queryString)
  const oldThread = rawPath.match(/^\/learn\/hub\/([^/]+)$/)
  const oldTypedRoute = oldThread ? `/learn/thread/${oldThread[1]}` : rawPath
  const alias = legacyDestinations[rawPath]
  const pathParts = oldTypedRoute.replace(/^\//, '').split('/').filter(Boolean)
  const candidateRoot = (alias?.root || pathParts[0]) as RootKey
  const knownRoot = roots.some((item) => item.key === candidateRoot)

  if (!knownRoot) {
    const fallback = rootMeta('home')
    return {
      root: 'home', view: fallback.defaultMode, mode: fallback.defaultMode,
      query: originalQuery, canonical: canonicalRoot('home', fallback.defaultMode),
      notFound: true, recoveredFrom: rawPath,
    }
  }

  const root = candidateRoot
  const rootDefinition = rootMeta(root)
  const pathMode = !alias && pathParts.length >= 2 && modeKnown(root, pathParts[1]) ? pathParts[1] : undefined
  const modePrefixedObject = Boolean(pathMode && pathParts.length >= 4)
  const objectRoute = !alias && (modePrefixedObject || (pathParts.length >= 3 && !pathMode))
  const objectType = objectRoute ? pathParts[modePrefixedObject ? 2 : 1] : undefined
  const objectStart = modePrefixedObject ? 3 : 2
  const objectId = objectRoute ? decodeURIComponent(pathParts.slice(objectStart).join('/')) : undefined
  const requestedMode = originalQuery.get('mode') || alias?.mode || pathMode
  const mode = modeKnown(root, requestedMode) ? requestedMode : rootDefinition.defaultMode
  const invalidMode = Boolean(requestedMode && !modeKnown(root, requestedMode))
  const recovered = oldThread ? rawPath : (alias || (pathMode && !invalidMode ? true : false))
  const query = alias ? mergeLegacyQuery(originalQuery, mode) : originalQuery
  // A mode is state, so paths such as `/library/queue` collapse to the root.
  // Objects keep their typed identity and can additionally carry mode state.
  const canonicalPath = objectRoute
    ? `/${root}/${objectType}/${encodeURIComponent(objectId || '')}${encodeQuery(root, mode)}`
    : canonicalRoot(root, mode)
  const changed = canonicalPath !== rawPath + (queryString ? `?${queryString}` : '')

  if (!objectRoute && pathParts.length > 1 && !alias && !modeKnown(root, pathMode)) {
    return {
      root, view: rootDefinition.defaultMode, mode: rootDefinition.defaultMode,
      query, canonical: canonicalRoot(root, rootDefinition.defaultMode),
      notFound: true, recoveredFrom: rawPath,
    }
  }

  return {
    root, view: mode, mode, objectType, objectId, query, canonical: canonicalPath,
    recoveredFrom: changed || recovered ? rawPath : undefined,
    notFound: invalidMode ? true : undefined,
  }
}

/** Compatibility alias for callers that prefer the explicit parser name. */
export const parseHash = parseRoute

/** Return a root page URL; modes are query state, never another page path. */
export function routeHref(root: RootKey, mode?: string) {
  const normalized = modeKnown(root, mode) ? mode : rootMeta(root).defaultMode
  return `#${canonicalRoot(root, normalized)}`
}

/** Typed records remain addressable while their owning page stays one of five roots. */
export function objectHref(root: RootKey, type: string, id: string, mode?: string) {
  const normalized = modeKnown(root, mode) ? mode : rootMeta(root).defaultMode
  return `#/${root}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${encodeQuery(root, normalized)}`
}

export function modeLabel(route: Route) {
  return modeMeta(route.root, route.mode)?.label || route.mode
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  useEffect(() => {
    const update = () => setRoute(parseRoute())
    addEventListener('hashchange', update)
    if (!location.hash) location.hash = '#/home'
    return () => removeEventListener('hashchange', update)
  }, [])
  return route
}
