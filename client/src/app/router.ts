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
  query: URLSearchParams
  canonical: string
  recoveredFrom?: string
  notFound?: boolean
}

export const roots: RootDefinition[] = [
  { key: 'home', label: 'Home', defaultMode: 'today', defaultView: 'today' },
  { key: 'library', label: 'Library', defaultMode: 'triage', defaultFocus: 'queue', defaultView: 'queue' },
  { key: 'learn', label: 'Learn', defaultMode: 'paths', defaultView: 'paths' },
  { key: 'map', label: 'Map', defaultMode: 'atlas', defaultView: 'atlas' },
  { key: 'settings', label: 'Settings', defaultMode: 'personal', defaultFocus: 'profile', defaultView: 'profile' },
]

const focus = (key: string, label: string, description: string): FocusDefinition => ({ key, label, description })

/** The canonical registry contains 11 work modes, not the former 18 peer pages. */
export const modes: Record<RootKey, ModeDefinition[]> = {
  home: [
    { key: 'today', label: 'Today', description: 'Decide what matters next.', defaultView: 'today' },
  ],
  library: [
    {
      key: 'triage', label: 'Triage', description: 'Capture, decide, and commit sources.', defaultView: 'queue', defaultFocus: 'queue',
      focuses: [focus('queue', 'Queue', 'The five sources you committed to next.'), focus('inbox', 'Inbox', 'Everything captured and waiting for a decision.')],
    },
    {
      key: 'catalog', label: 'Catalog', description: 'Find and filter source material.', defaultView: 'all', defaultFocus: 'all',
      focuses: [focus('all', 'All sources', 'Every source in one searchable ledger.'), focus('books', 'Books', 'Books tracked deliberately, with chapter evidence.'), focus('collections', 'Collections', 'Focused groups of related learning objects.'), focus('archive', 'Archive', 'Completed and excluded sources kept for recovery.')],
    },
    {
      key: 'assets', label: 'Assets', description: 'Open files and reading companions.', defaultView: 'files', defaultFocus: 'files',
      focuses: [focus('files', 'Files', 'Uploaded files and generated reading companions.')],
    },
  ],
  learn: [
    { key: 'paths', label: 'Paths', description: 'Build and follow learning threads.', defaultView: 'paths' },
    {
      key: 'practice', label: 'Practice', description: 'Retrieve and make knowledge durable.', defaultView: 'notes', defaultFocus: 'notes',
      focuses: [focus('notes', 'Notes', 'Structured, editable bilingual notes.'), focus('recall', 'Recall', 'Due review plus drafts awaiting approval.')],
    },
  ],
  map: [
    { key: 'atlas', label: 'Atlas', description: 'See the connected topology of what you know.', defaultView: 'atlas' },
    {
      key: 'review', label: 'Review', description: 'Tune branches, coverage, and attention.', defaultView: 'branches', defaultFocus: 'branches',
      focuses: [focus('branches', 'Branches', 'Keep, prune, promote, hold, add, and undo.'), focus('balance', 'Balance', 'Coverage, retention, and attention drift.')],
    },
  ],
  settings: [
    {
      key: 'personal', label: 'Personal', description: 'Tune priorities and learning behavior.', defaultView: 'profile', defaultFocus: 'profile',
      focuses: [focus('profile', 'Profile', 'Priorities, exclusions, and learned patterns.'), focus('preferences', 'Preferences', 'Learning, recall, and curation defaults.')],
    },
    { key: 'data', label: 'Data & sync', description: 'Inspect exports, storage, and recovery.', defaultView: 'data' },
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
  '/curate/inbox': { root: 'library', mode: 'triage', focus: 'inbox' },
  '/library/inbox': { root: 'library', mode: 'triage', focus: 'inbox' },
  '/curate/discovery': { root: 'library', mode: 'catalog', focus: 'all' },
  '/library/all': { root: 'library', mode: 'catalog', focus: 'all' },
  '/curate/books': { root: 'library', mode: 'catalog', focus: 'books' },
  '/library/books': { root: 'library', mode: 'catalog', focus: 'books' },
  '/curate/collections': { root: 'library', mode: 'catalog', focus: 'collections' },
  '/library/collections': { root: 'library', mode: 'catalog', focus: 'collections' },
  '/curate/archive': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/library/archive': { root: 'library', mode: 'catalog', focus: 'archive' },
  '/learn/files': { root: 'library', mode: 'assets', focus: 'files' },
  '/vault/files': { root: 'library', mode: 'assets', focus: 'files' },
  '/library/files': { root: 'library', mode: 'assets', focus: 'files' },
  '/learn/hub': { root: 'learn', mode: 'paths' },
  '/learn/paths': { root: 'learn', mode: 'paths' },
  '/vault/notes': { root: 'learn', mode: 'practice', focus: 'notes' },
  '/learn/reflections': { root: 'learn', mode: 'practice', focus: 'notes' },
  '/learn/notes': { root: 'learn', mode: 'practice', focus: 'notes' },
  '/learn/cards': { root: 'learn', mode: 'practice', focus: 'recall' },
  '/learn/review': { root: 'learn', mode: 'practice', focus: 'recall' },
  '/learn/recall': { root: 'learn', mode: 'practice', focus: 'recall' },
  '/learn/activity': { root: 'settings', mode: 'data' },
  '/map/deck': { root: 'map', mode: 'review', focus: 'branches' },
  '/map/branches': { root: 'map', mode: 'review', focus: 'branches' },
  '/map/coverage': { root: 'map', mode: 'review', focus: 'balance' },
  '/map/balance': { root: 'map', mode: 'review', focus: 'balance' },
  '/insights/learning': { root: 'map', mode: 'review', focus: 'balance' },
  '/settings/profile': { root: 'settings', mode: 'personal', focus: 'profile' },
  '/settings/appearance': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/learning': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/curation': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/preferences': { root: 'settings', mode: 'personal', focus: 'preferences' },
  '/settings/data': { root: 'settings', mode: 'data' },
  '/settings/system': { root: 'settings', mode: 'system' },
  '/insights/taste': { root: 'settings', mode: 'personal', focus: 'profile' },
  '/insights/hermes': { root: 'settings', mode: 'personal', focus: 'profile' },
}

const legacySegments: Record<RootKey, Record<string, LegacyDestination>> = {
  home: {},
  library: {
    queue: { root: 'library', mode: 'triage', focus: 'queue' }, inbox: { root: 'library', mode: 'triage', focus: 'inbox' },
    all: { root: 'library', mode: 'catalog', focus: 'all' }, books: { root: 'library', mode: 'catalog', focus: 'books' },
    collections: { root: 'library', mode: 'catalog', focus: 'collections' }, archive: { root: 'library', mode: 'catalog', focus: 'archive' },
    files: { root: 'library', mode: 'assets', focus: 'files' },
  },
  learn: {
    hub: { root: 'learn', mode: 'paths' }, paths: { root: 'learn', mode: 'paths' }, notes: { root: 'learn', mode: 'practice', focus: 'notes' },
    reflections: { root: 'learn', mode: 'practice', focus: 'notes' }, cards: { root: 'learn', mode: 'practice', focus: 'recall' },
    review: { root: 'learn', mode: 'practice', focus: 'recall' }, recall: { root: 'learn', mode: 'practice', focus: 'recall' },
  },
  map: {
    deck: { root: 'map', mode: 'review', focus: 'branches' }, branches: { root: 'map', mode: 'review', focus: 'branches' },
    coverage: { root: 'map', mode: 'review', focus: 'balance' }, balance: { root: 'map', mode: 'review', focus: 'balance' },
  },
  settings: {
    profile: { root: 'settings', mode: 'personal', focus: 'profile' }, preferences: { root: 'settings', mode: 'personal', focus: 'preferences' },
    appearance: { root: 'settings', mode: 'personal', focus: 'preferences' }, learning: { root: 'settings', mode: 'personal', focus: 'preferences' },
    curation: { root: 'settings', mode: 'personal', focus: 'preferences' }, data: { root: 'settings', mode: 'data' }, system: { root: 'settings', mode: 'system' },
  },
}

const objectTypes: Record<RootKey, string[]> = {
  home: [],
  library: ['source', 'artifact', 'book', 'collection'],
  learn: ['thread', 'note', 'unit', 'card'],
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
  const oldThread = rawPath.match(/^\/learn\/hub\/([^/]+)$/)
  const oldTypedPath = oldThread ? `/learn/thread/${oldThread[1]}` : rawPath
  const exactAlias = legacyDestinations[rawPath]
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
  const objectRoute = !exactAlias && (modePrefixedObject || (pathParts.length >= 3 && !isModeOrLeaf(root, pathSegment)))
  const objectType = objectRoute ? pathParts[modePrefixedObject ? 2 : 1] : undefined
  const objectStart = modePrefixedObject ? 3 : 2
  let objectId: string | undefined
  if (objectRoute) {
    const rawSegment = pathParts.slice(objectStart).join('/')
    try {
      objectId = decodeURIComponent(rawSegment)
    } catch {
      objectId = rawSegment
    }
  }
  const pathState = segmentState || (pathSegment && modeMeta(root, pathSegment) ? { root, mode: pathSegment } : undefined)
  const queryMode = originalQuery.get('mode') || undefined
  const queryFocus = originalQuery.get('focus') || undefined
  const requestedMode = queryMode || exactAlias?.mode || pathState?.mode
  const requestedFocus = queryFocus || exactAlias?.focus || pathState?.focus
  const state = normalizeState(root, requestedMode, requestedFocus)
  const invalidObject = objectRoute && (!objectType || !objectTypes[root].includes(objectType))
  const invalidModePath = !objectRoute && pathParts.length > 1 && !exactAlias && !pathState && !modeMeta(root, pathSegment)
  const invalid = state.invalid || Boolean(invalidObject) || Boolean(invalidModePath)
  const query = exactAlias ? mergeRecoveryQuery(originalQuery, state.mode, state.focus) : originalQuery
  const forceLegacyFocus = Boolean(exactAlias || modePrefixedObject || queryFocus)
  const forceLegacyMode = Boolean((exactAlias || modePrefixedObject || queryFocus) && root !== 'settings')
  const canonical = invalidObject || invalidModePath
    ? canonicalRoot(root, defaultState(root).mode, defaultState(root).focus)
    : objectRoute
      ? canonicalObject(root, objectType!, objectId || '', state.mode, state.focus, forceLegacyFocus, forceLegacyMode)
      : canonicalRoot(root, state.mode, state.focus, forceLegacyFocus, forceLegacyMode)
  const rawComparable = rawPath + (queryString ? `?${queryString}` : '')
  const changed = canonical !== rawComparable
  const recovered = Boolean(exactAlias || oldThread || (pathParts.length > 1 && !objectRoute && canonical !== rawComparable) || invalid)
  const route = {
    root,
    mode: state.mode,
    focus: state.focus,
    view: viewFor(root, state.mode, state.focus),
    objectType: invalidObject ? undefined : objectType,
    objectId: invalidObject ? undefined : objectId,
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
  return route
}
