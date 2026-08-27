import { useEffect, useState } from 'preact/hooks'

/** Five stable page destinations. Local lenses are mode/focus query state. */
export type RootKey = 'home' | 'library' | 'learn' | 'map' | 'settings'

export type FocusDefinition = {
  key: string
  label: string
  description: string
}

export type ModeDefinition = {
  key: string
  label: string
  description: string
  /** The leaf workspace shown when this mode has no explicit focus. */
  defaultView: string
  defaultFocus?: string
  focuses?: FocusDefinition[]
}

export type RootDefinition = {
  key: RootKey
  label: string
  defaultMode: string
  defaultFocus?: string
  /** Compatibility name for old workspace props. */
  defaultView: string
}

export type Route = {
  root: RootKey
  /** Leaf compatibility value: focus when present, otherwise mode defaultView. */
  view: string
  /** Group mode, never a leaf focus. */
  mode: string
  focus?: string
  objectType?: string
  objectId?: string
  parentObjectId?: string
  query: URLSearchParams
  canonical: string
  recoveredFrom?: string
  notFound?: boolean
}

export const roots: RootDefinition[] = [
  { key: 'home', label: 'Home', defaultMode: 'today', defaultView: 'today' },
  { key: 'library', label: 'Library', defaultMode: 'books', defaultView: 'books' },
  { key: 'learn', label: 'Learn', defaultMode: 'practice', defaultFocus: 'notes', defaultView: 'notes' },
  { key: 'map', label: 'Map', defaultMode: 'atlas', defaultView: 'atlas' },
  { key: 'settings', label: 'Settings', defaultMode: 'personal', defaultFocus: 'profile', defaultView: 'profile' },
]

const focus = (key: string, label: string, description: string): FocusDefinition => ({ key, label, description })

/** The canonical registry contains grouped work modes, not the former peer-page sprawl. */
export const modes: Record<RootKey, ModeDefinition[]> = {
  home: [
    { key: 'today', label: 'Today', description: 'Decide what matters next.', defaultView: 'today' },
  ],
  library: [
    { key: 'books', label: 'Books', description: 'Read and organize the personal book library.', defaultView: 'books' },
    {
      key: 'triage', label: 'Triage', description: 'Capture, decide, and commit sources.', defaultView: 'queue', defaultFocus: 'queue',
      focuses: [focus('queue', 'Queue', 'The five sources you committed to next.'), focus('feeds', 'RSS Feeds', 'Subscriptions and imported feed entries.')],
    },
    {
      key: 'catalog', label: 'Archive', description: 'Recover completed and excluded sources.', defaultView: 'archive', defaultFocus: 'archive',
      focuses: [focus('archive', 'Archive', 'Completed and excluded sources kept for recovery.')],
    },
    {
      key: 'assets', label: 'Files', description: 'Open files and reading companions.', defaultView: 'files', defaultFocus: 'files',
      focuses: [focus('files', 'Files', 'Uploaded files and generated reading companions.')],
    },
  ],
  learn: [
    { key: 'paths', label: 'Threads', description: 'Build and follow finite learning paths.', defaultView: 'paths' },
    {
      key: 'practice', label: 'Practice', description: 'Retrieve and make knowledge durable.', defaultView: 'notes', defaultFocus: 'notes',
      focuses: [focus('notes', 'Notes', 'Structured, editable bilingual notes.'), focus('recall', 'Recall', 'Due review plus drafts awaiting approval.'), focus('contradictions', 'Contradictions', 'Review grounded tensions between retained ideas.')],
    },
  ],
  map: [
    { key: 'atlas', label: 'Atlas', description: 'See the connected topology of what you know.', defaultView: 'atlas' },
    { key: 'review', label: 'Review', description: 'Decide branch status, priority, scope, and attention.', defaultView: 'branches' },
  ],
  settings: [
    {
      key: 'personal', label: 'Personal', description: 'Tune priorities and learning behavior.', defaultView: 'profile', defaultFocus: 'profile',
      focuses: [focus('profile', 'Profile', 'Priorities, exclusions, and learned patterns.'), focus('preferences', 'Preferences', 'Learning, recall, and curation defaults.')],
    },
    { key: 'data', label: 'Data & recovery', description: 'Inspect exports, storage, and recovery.', defaultView: 'data' },
    { key: 'system', label: 'System', description: 'Inspect capabilities, schedules, and safety.', defaultView: 'system' },
  ],
}

function modeList(root: RootKey) {
  return modes[root]
}

function modeMeta(root: RootKey, key: string | undefined) {
  return modeList(root).find((item) => item.key === key)
}

function focusMeta(root: RootKey, mode: string, key: string | undefined) {
  return modeMeta(root, mode)?.focuses?.find((item) => item.key === key)
}

function leafMeta(root: RootKey, key: string | undefined) {
  if (!key) return undefined
  for (const mode of modeList(root)) {
    if (mode.key === key) return { mode: mode.key, focus: undefined }
    const item = mode.focuses?.find((candidate) => candidate.key === key)
    if (item) return { mode: mode.key, focus: item.key }
  }
  return undefined
}

/** Compatibility view inventory generated from grouped modes, not a route registry. */
export const views: Record<RootKey, FocusDefinition[]> = Object.fromEntries(
  roots.map((root) => [root.key, modeList(root.key).flatMap((mode) => mode.focuses || [focus(mode.defaultView, mode.label, mode.description)])]),
) as Record<RootKey, FocusDefinition[]>

type LegacyDestination = { root: RootKey; mode: string; focus?: string }

const legacyDestinations: Record<string, LegacyDestination> = {
  '/': { root: 'home', mode: 'today' },
  '/today': { root: 'home', mode: 'today' },
  '/today/momentum': { root: 'home', mode: 'today' },
  '/today/briefing': { root: 'home', mode: 'today' },
  '/insights/overview': { root: 'home', mode: 'today' },
  '/curate/queue': { root: 'library', mode: 'triage', focus: 'queue' },
  '/library/queue': { root: 'library', mode: 'triage', focus: 'queue' },
  '/curate/inbox': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/library/inbox': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/curate/feeds': { root: 'library', mode: 'triage', focus: 'feeds' },
  '/library/feeds': { root: 'library', mode: 'triage', focus: 'feeds' },
  '/curate/rss': { root: 'library', mode: 'triage', focus: 'feeds' },
  '/library/rss': { root: 'library', mode: 'triage', focus: 'feeds' },
  '/curate/discovery': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/library/all': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/curate/books': { root: 'library', mode: 'books' },
  '/library/books': { root: 'library', mode: 'books' },
  '/learn/books': { root: 'library', mode: 'books' },
  '/library/journal': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/library/hardcover': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/curate/collections': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/library/collections': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/curate/archive': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/library/archive': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/learn/files': { root: 'library', mode: 'assets', focus: 'files' },
  '/vault/files': { root: 'library', mode: 'assets', focus: 'files' },
  '/library/files': { root: 'library', mode: 'assets', focus: 'files' },
  '/learn/hub': { root: 'learn', mode: 'paths' },
  '/learn/paths': { root: 'learn', mode: 'paths' },
  '/learn/canon': { root: 'library', mode: 'books' },
  '/vault/notes': { root: 'learn', mode: 'practice', focus: 'notes' },
  '/learn/reflections': { root: 'learn', mode: 'practice', focus: 'notes' },
  '/learn/notes': { root: 'learn', mode: 'practice', focus: 'notes' },
  '/learn/cards': { root: 'learn', mode: 'practice', focus: 'recall' },
  '/learn/review': { root: 'learn', mode: 'practice', focus: 'recall' },
  '/learn/recall': { root: 'learn', mode: 'practice', focus: 'recall' },
  '/learn/contradictions': { root: 'learn', mode: 'practice', focus: 'contradictions' },
  '/learn/activity': { root: 'settings', mode: 'data' },
  '/map/deck': { root: 'map', mode: 'review' },
  '/map/branches': { root: 'map', mode: 'review' },
  '/map/coverage': { root: 'map', mode: 'review' },
  '/map/balance': { root: 'map', mode: 'review' },
  '/insights/learning': { root: 'map', mode: 'review' },
  '/settings/profile': { root: 'settings', mode: 'personal', focus: 'profile' },
  '/settings/appearance': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/learning': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/curation': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/preferences': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/data': { root: 'settings', mode: 'data' },
  '/settings/sync': { root: 'settings', mode: 'data' },
  '/settings/storage': { root: 'settings', mode: 'data' },
  '/settings/system': { root: 'settings', mode: 'system' },
  '/settings/diagnostics': { root: 'settings', mode: 'system' },
  '/insights/taste': { root: 'settings', mode: 'personal', focus: 'profile' },
  '/insights/hermes': { root: 'settings', mode: 'personal', focus: 'profile' },
}

const legacySegments: Record<RootKey, Record<string, LegacyDestination>> = {
  home: { today: { root: 'home', mode: 'today' } },
  library: {
    queue: { root: 'library', mode: 'triage', focus: 'queue' }, inbox: { root: 'library', mode: 'catalog', focus: 'archive' },
    feeds: { root: 'library', mode: 'triage', focus: 'feeds' }, rss: { root: 'library', mode: 'triage', focus: 'feeds' },
    all: { root: 'library', mode: 'catalog', focus: 'archive' }, books: { root: 'library', mode: 'books' },
    journal: { root: 'library', mode: 'catalog', focus: 'archive' }, hardcover: { root: 'library', mode: 'catalog', focus: 'archive' },
    collections: { root: 'library', mode: 'catalog', focus: 'archive' }, archive: { root: 'library', mode: 'catalog', focus: 'archive' },
    files: { root: 'library', mode: 'assets', focus: 'files' },
  },
  learn: {
    hub: { root: 'learn', mode: 'paths' }, paths: { root: 'learn', mode: 'paths' }, canon: { root: 'library', mode: 'books' }, notes: { root: 'learn', mode: 'practice', focus: 'notes' },
    reflections: { root: 'learn', mode: 'practice', focus: 'notes' }, cards: { root: 'learn', mode: 'practice', focus: 'recall' },
    review: { root: 'learn', mode: 'practice', focus: 'recall' }, recall: { root: 'learn', mode: 'practice', focus: 'recall' }, contradictions: { root: 'learn', mode: 'practice', focus: 'contradictions' },
  },
  map: {
    deck: { root: 'map', mode: 'review' }, branches: { root: 'map', mode: 'review' },
    coverage: { root: 'map', mode: 'review' }, balance: { root: 'map', mode: 'review' },
  },
  settings: {
    profile: { root: 'settings', mode: 'personal', focus: 'profile' }, preferences: { root: 'settings', mode: 'personal', focus: 'preferences' },
    appearance: { root: 'settings', mode: 'personal', focus: 'preferences' }, learning: { root: 'settings', mode: 'personal', focus: 'preferences' },
    curation: { root: 'settings', mode: 'personal', focus: 'preferences' }, data: { root: 'settings', mode: 'data' }, system: { root: 'settings', mode: 'system' },
  },
}

const objectTypes: Record<RootKey, string[]> = {
  home: [],
  library: ['source', 'artifact', 'book'],
  learn: ['thread', 'level', 'note', 'unit', 'card', 'lesson', 'canon-domain'],
  map: ['node', 'branch'],
  settings: [],
}

function rootMeta(root: RootKey) {
  return roots.find((item) => item.key === root)!
}

function defaultState(root: RootKey) {
  const meta = rootMeta(root)
  return { mode: meta.defaultMode, focus: meta.defaultFocus }
}

function implicitObjectState(root: RootKey, type: string | undefined) {
  if (root !== 'learn' || !type) return undefined
  if (['thread', 'level', 'lesson', 'canon-domain'].includes(type)) return { mode: 'paths', focus: undefined }
  if (type === 'card') return { mode: 'practice', focus: 'recall' }
  if (['note', 'unit'].includes(type)) return { mode: 'practice', focus: 'notes' }
  return undefined
}

function normalizeState(root: RootKey, requestedMode: string | undefined, requestedFocus: string | undefined): { mode: string; focus?: string; invalid: boolean } {
  const fallback = defaultState(root)
  let mode = requestedMode
  let focusValue = requestedFocus
  let invalid = false

  if (!mode && focusValue) {
    const owner = modeList(root).find((candidate) => candidate.focuses?.some((item) => item.key === focusValue))
    if (owner) mode = owner.key
    else { mode = fallback.mode; focusValue = fallback.focus; invalid = true }
  }

  const leaf = mode && !modeMeta(root, mode) ? leafMeta(root, mode) : undefined
  if (leaf) {
    mode = leaf.mode
    if (!focusValue) focusValue = leaf.focus
  }

  if (!modeMeta(root, mode)) {
    invalid = Boolean(requestedMode)
    mode = fallback.mode
    focusValue = fallback.focus
  }

  const normalizedMode = mode || fallback.mode
  const meta = modeMeta(root, normalizedMode)!
  if (focusValue && !focusMeta(root, normalizedMode, focusValue)) {
    invalid = true
    focusValue = meta.defaultFocus
  }
  return { mode: normalizedMode, focus: focusValue, invalid }
}

function viewFor(root: RootKey, mode: string, focusValue?: string) {
  return focusValue || modeMeta(root, mode)?.defaultView || rootMeta(root).defaultView
}

function queryFor(root: RootKey, mode: string, focusValue?: string, forceFocus = false, forceMode = false) {
  const rootDefinition = rootMeta(root)
  const modeDefinition = modeMeta(root, mode)!
  const params = new URLSearchParams()
  const modeIsDefault = mode === rootDefinition.defaultMode
  const focusIsDefault = focusValue === rootDefinition.defaultFocus || focusValue === modeDefinition.defaultFocus
  // Settings' personal focus is intentionally addressable as ?focus=...; its
  // default mode remains implicit even when preferences is selected.
  const omitDefaultModeWithFocus = root === 'settings'
  if (!modeIsDefault || (forceMode && !omitDefaultModeWithFocus) || (focusValue && !focusIsDefault && !omitDefaultModeWithFocus)) params.set('mode', mode)
  if (focusValue && (!focusIsDefault || forceFocus)) params.set('focus', focusValue)
  const text = params.toString()
  return text ? `?${text}` : ''
}

function canonicalRoot(root: RootKey, mode: string, focusValue?: string, forceFocus = false, forceMode = false) {
  return `/${root}${queryFor(root, mode, focusValue, forceFocus, forceMode)}`
}

function mergeRecoveryQuery(query: URLSearchParams, mode: string, focusValue?: string) {
  const merged = new URLSearchParams(query)
  merged.set('mode', mode)
  if (focusValue) merged.set('focus', focusValue)
  else merged.delete('focus')
  return merged
}

function isModeOrLeaf(root: RootKey, value: string | undefined) {
  return Boolean(value && (modeMeta(root, value) || leafMeta(root, value) || legacySegments[root][value]))
}

function canonicalObject(root: RootKey, type: string, id: string, mode: string, focusValue?: string, forceFocus = false, forceMode = false) {
  return `/${root}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${queryFor(root, mode, focusValue, forceFocus, forceMode)}`
}

/** Parse a hash independently of browser globals so route recovery is testable. */
export function parseRoute(hash = typeof location === 'undefined' ? '' : location.hash): Route {
  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash
  const raw = (rawHash || '/home').replace(/\/$/, '') || '/home'
  const [rawPath, queryString = ''] = raw.split('?')
  const originalQuery = new URLSearchParams(queryString)
  const movedBookObject = rawPath.match(/^\/learn\/book\/([^/]+)$/)
  const oldThread = rawPath.match(/^\/learn\/hub\/([^/]+)$/)
  const oldTypedPath = movedBookObject ? `/library/book/${movedBookObject[1]}` : oldThread ? `/learn/thread/${oldThread[1]}` : rawPath
  const lessonPath = oldTypedPath.match(/^\/learn\/(?:thread\/([^/]+)\/lesson|t\/([^/]+)\/l)\/([^/]+)$/)
  const levelPath = oldTypedPath.match(/^\/learn\/(?:thread\/([^/]+)\/level|t\/([^/]+)\/v)\/([^/]+)$/)
  const canonDomainPath = oldTypedPath.match(/^\/learn\/canon\/([^/]+)$/)
  const movedBooksQuery = (rawPath === '/library' && originalQuery.get('focus') === 'books') || (rawPath === '/learn' && originalQuery.get('mode') === 'canon')
  const exactAlias = movedBooksQuery ? { root: 'library' as const, mode: 'books' } : legacyDestinations[rawPath]
  const pathParts = oldTypedPath.replace(/^\//, '').split('/').filter(Boolean)
  const candidateRoot = (exactAlias?.root || pathParts[0]) as RootKey
  const knownRoot = roots.some((item) => item.key === candidateRoot)

  if (!knownRoot) {
    const fallback = defaultState('home')
    return { root: 'home', mode: fallback.mode, view: viewFor('home', fallback.mode, fallback.focus), focus: fallback.focus, query: originalQuery, canonical: canonicalRoot('home', fallback.mode, fallback.focus), notFound: true, recoveredFrom: rawPath }
  }

  const root = candidateRoot
  const pathSegment = pathParts[1]
  const segmentState = pathSegment ? (legacySegments[root][pathSegment] || undefined) : undefined
  const modePrefixedObject = !exactAlias && pathParts.length >= 4 && isModeOrLeaf(root, pathSegment)
  const objectRoute = !exactAlias && (Boolean(lessonPath) || Boolean(levelPath) || Boolean(canonDomainPath) || modePrefixedObject || (pathParts.length >= 3 && !isModeOrLeaf(root, pathSegment)))
  const objectType = lessonPath ? 'lesson' : levelPath ? 'level' : canonDomainPath ? 'canon-domain' : objectRoute ? pathParts[modePrefixedObject ? 2 : 1] : undefined
  const objectStart = modePrefixedObject ? 3 : 2
  let objectId: string | undefined
  let parentObjectId: string | undefined
  if (objectRoute) {
    const nestedPath = lessonPath || levelPath
    const rawSegment = canonDomainPath ? canonDomainPath[1] : nestedPath ? nestedPath[3] : pathParts.slice(objectStart).join('/')
    try {
      objectId = decodeURIComponent(rawSegment)
      parentObjectId = nestedPath ? decodeURIComponent(nestedPath[1] || nestedPath[2]) : undefined
    } catch {
      objectId = rawSegment
      parentObjectId = nestedPath ? nestedPath[1] || nestedPath[2] : undefined
    }
  }
  const pathState = segmentState || (pathSegment && modeMeta(root, pathSegment) ? { root, mode: pathSegment } : undefined)
  const queryMode = originalQuery.get('mode') || undefined
  const queryFocus = originalQuery.get('focus') || undefined
  const objectState = !queryMode && !queryFocus && !exactAlias ? implicitObjectState(root, objectType) : undefined
  const requestedMode = movedBookObject || movedBooksQuery ? 'books' : queryMode || exactAlias?.mode || objectState?.mode || pathState?.mode
  const rawRequestedFocus = movedBookObject || movedBooksQuery ? undefined : queryFocus || exactAlias?.focus || objectState?.focus || pathState?.focus
  const legacyBooksFocus = root === 'library' && requestedMode === 'books' && ['shelf', 'atlas'].includes(String(rawRequestedFocus || ''))
  const retiredCatalogFocus = root === 'library' && requestedMode === 'catalog' && ['all', 'journal', 'collections'].includes(String(rawRequestedFocus || ''))
  const retiredMapFocus = root === 'map' && requestedMode === 'review' && ['branches', 'balance'].includes(String(rawRequestedFocus || ''))
  const requestedFocus = legacyBooksFocus || retiredMapFocus ? undefined : retiredCatalogFocus ? 'archive' : rawRequestedFocus
  const state = normalizeState(root, requestedMode, requestedFocus)
  const invalidObject = objectRoute && (!objectType || !objectTypes[root].includes(objectType))
  const invalidModePath = !objectRoute && pathParts.length > 1 && !exactAlias && !pathState && !modeMeta(root, pathSegment)
  const invalid = state.invalid || Boolean(invalidObject) || Boolean(invalidModePath)
  const query = exactAlias ? mergeRecoveryQuery(originalQuery, state.mode, state.focus) : originalQuery
  const canonicalBooksRecovery = root === 'library' && state.mode === 'books' && Boolean(movedBookObject || movedBooksQuery || exactAlias?.mode === 'books')
  const forceLegacyFocus = Boolean((exactAlias || modePrefixedObject || queryFocus) && !canonicalBooksRecovery)
  const forceLegacyMode = Boolean((exactAlias || modePrefixedObject || queryFocus) && !canonicalBooksRecovery && root !== 'settings')
  const canonical = invalidObject || invalidModePath
    ? canonicalRoot(root, defaultState(root).mode, defaultState(root).focus)
    : objectRoute
      ? canonDomainPath
        ? `/learn/canon/${encodeURIComponent(objectId || '')}`
        : lessonPath || levelPath
        ? `/learn/t/${encodeURIComponent(parentObjectId || '')}/${lessonPath ? 'l' : 'v'}/${encodeURIComponent(objectId || '')}${objectState ? '' : queryFor(root, state.mode, state.focus, forceLegacyFocus, forceLegacyMode)}`
        : objectState
          ? `/${root}/${encodeURIComponent(objectType!)}/${encodeURIComponent(objectId || '')}`
          : canonicalObject(root, objectType!, objectId || '', state.mode, state.focus, forceLegacyFocus, forceLegacyMode)
      : canonicalRoot(root, state.mode, state.focus, forceLegacyFocus, forceLegacyMode)
  const rawComparable = rawPath + (queryString ? `?${queryString}` : '')
  const changed = canonical !== rawComparable
  const recovered = Boolean(exactAlias || movedBookObject || legacyBooksFocus || retiredCatalogFocus || retiredMapFocus || oldThread || (pathParts.length > 1 && !objectRoute && canonical !== rawComparable) || invalid)
  const route = {
    root,
    mode: state.mode,
    focus: state.focus,
    view: viewFor(root, state.mode, state.focus),
    objectType: invalidObject ? undefined : objectType,
    objectId: invalidObject ? undefined : objectId,
    parentObjectId: invalidObject ? undefined : parentObjectId,
    query,
    canonical,
    recoveredFrom: recovered || changed ? rawPath : undefined,
    notFound: invalid ? true : undefined,
  }
  return route
}

export const parseHash = parseRoute

function normalizeHrefState(root: RootKey, requestedMode?: string, requestedFocus?: string) {
  const state = normalizeState(root, requestedMode, requestedFocus)
  return state
}

/** Return a root URL; modes are groups and focus is local query state. */
export function routeHref(root: RootKey, mode?: string, focusValue?: string) {
  const state = normalizeHrefState(root, mode, focusValue)
  const explicitLeaf = Boolean(mode && !modeMeta(root, mode) && leafMeta(root, mode))
  const explicitFocus = Boolean(focusValue)
  return `#${canonicalRoot(root, state.mode, state.focus, explicitLeaf || explicitFocus, (explicitLeaf || explicitFocus) && root !== 'settings')}`
}

/** Typed records remain addressable while their owning root/mode/focus is preserved. */
export function objectHref(root: RootKey, type: string, id: string, mode?: string, focusValue?: string) {
  const objectState = mode || focusValue ? undefined : implicitObjectState(root, type)
  if (objectState) return `#/${root}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
  const state = normalizeHrefState(root, mode, focusValue)
  const explicitLeaf = Boolean(mode && !modeMeta(root, mode) && leafMeta(root, mode))
  const explicitFocus = Boolean(focusValue)
  return `#${canonicalObject(root, type, id, state.mode, state.focus, explicitLeaf || explicitFocus, (explicitLeaf || explicitFocus) && root !== 'settings')}`
}

export function modeLabel(route: Route) {
  return modeMeta(route.root, route.mode)?.label || route.mode
}

export function focusLabel(route: Route) {
  return route.focus ? focusMeta(route.root, route.mode, route.focus)?.label || route.focus : undefined
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  useEffect(() => {
    const update = () => setRoute(parseRoute())
    addEventListener('hashchange', update)
    if (!location.hash) location.hash = '#/home'
    return () => removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    if (!route.recoveredFrom || route.notFound) return
    const currentRoute = parseRoute(location.hash)
    if (currentRoute.canonical !== route.canonical || currentRoute.recoveredFrom !== route.recoveredFrom) return
    const [canonicalPath, canonicalQuery = ''] = route.canonical.split('?')
    const params = new URLSearchParams(canonicalQuery)
    for (const [key, value] of route.query) {
      if (key !== 'mode' && key !== 'focus') params.set(key, value)
    }
    const query = params.toString()
    const canonicalHash = `#${canonicalPath}${query ? `?${query}` : ''}`
    if (location.hash !== canonicalHash) {
      history.replaceState(history.state, '', canonicalHash)
      const dismiss = window.setTimeout(() => setRoute(parseRoute(canonicalHash)), 2400)
      return () => window.clearTimeout(dismiss)
    }
  }, [route])
  return route
}
