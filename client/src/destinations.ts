export type WorkspaceKey = 'today' | 'curate' | 'map' | 'learn' | 'insights' | 'settings'
export type ViewKind = 'briefing' | 'list' | 'board' | 'graph' | 'study' | 'library' | 'analysis' | 'settings'

export type Destination = {
  key: string
  workspace: WorkspaceKey
  slug: string
  title: string
  purpose: string
  kind: ViewKind
  endpoint?: string
}

const define = (workspace: WorkspaceKey, entries: Array<[string, string, string, ViewKind, string?]>) =>
  entries.map(([slug, title, purpose, kind, endpoint]) => ({ key: `${workspace}.${slug}`, workspace, slug, title, purpose, kind, endpoint }))

export const destinations: Destination[] = [
  ...define('today', [['momentum', 'Momentum', 'Continue one source, protect your streak, and close the learning loop.', 'briefing', '/dashboard/briefing']]),
  ...define('curate', [
    ['queue', 'Queue', 'Choose the five items worth doing next.', 'board', '/capture/queue'],
    ['inbox', 'Inbox', 'Capture, subscribe, refresh, and triage sources before the queue.', 'list', '/capture'],
    ['collections', 'Collections', 'Build active thematic learning groups.', 'board', '/collections?scope=curate'],
    ['archive', 'Archive', 'Find completed, excluded, and saved sources while RSS stays pinned above.', 'list', '/recommendations/list?limit=200&source=manual'],
    ['books', 'Books', 'Keep a deliberate shelf of books to read, reading, and finished.', 'library', '/recommendations/books'],
  ]),
  ...define('map', [
    ['atlas', 'Atlas', 'Explore the living topology of your knowledge.', 'graph', '/knowledge/graph'],
    ['coverage', 'Coverage', 'See where attention, coverage, and retention are balanced or drifting.', 'analysis', '/learning/balance'],
  ]),
  ...define('learn', [
    ['files', 'Files', 'Open PDFs, web companions, and uploaded documents.', 'library', '/artifacts'],
    ['notes', 'Notes', 'Read and edit the structured notes extracted from completed sources.', 'library', '/notes'],
    ['recall', 'Recall', 'Review due cards and approve or edit future recall prompts.', 'study', '/learning/srs/due'],
    ['activity', 'Activity', 'Review Hermes proposals and the history of what changed.', 'list', '/feedback/proposals'],
  ]),
  ...define('insights', [
    ['overview', 'Overview', 'See consumption, ratings, review load, and recent activity.', 'analysis', '/stats'],
    ['taste', 'Taste', 'Understand preference changes and creator performance.', 'analysis', '/taste/dna'],
    ['hermes', 'Hermes', 'Review recommendation quality, learned memory, and approval gates.', 'analysis', '/analytics/hermes'],
  ]),
  ...define('settings', [
    ['profile', 'Profile', 'Review priorities, exclusions, and learning patterns.', 'settings', '/brain/profile'],
    ['preferences', 'Preferences', 'Configure appearance, learning defaults, and curation behavior.', 'settings', '/settings'],
    ['data', 'Data', 'Export your library and check synchronization.', 'settings', '/settings'],
    ['system', 'System', 'See every API capability, schedule, service, and safety boundary.', 'settings', '/agent/system'],
  ]),
]

export const mobilePrimary = ['today', 'curate', 'learn', 'more'] as const

export function destinationForPath(path: string): Destination | null {
  const clean = path.replace(/^#?\/?/, '').replace(/\/$/, '').split('?')[0]
  if (clean === 'vault/files') return destinations.find((item) => item.key === 'learn.files') || null
  if (clean === 'vault/notes') return destinations.find((item) => item.key === 'learn.notes') || null
  if (clean === 'learn/sessions') return destinations.find((item) => item.key === 'curate.queue') || null
  const aliases: Record<string, string> = {
    'today/briefing': 'today/momentum',
    'curate/discovery': 'curate/archive',
    'curate/resurfacing': 'today/momentum',
    'curate/contradictions': 'map/coverage',
    'map/branches': 'map/atlas',
    'map/taste': 'insights/taste',
    'learn/notebooklm': 'learn/files',
    'learn/reflections': 'learn/notes',
    'learn/cards': 'learn/recall',
    'learn/review': 'learn/recall',
    'learn/changes': 'learn/activity',
    'learn/journal': 'learn/activity',
    'insights/learning': 'map/coverage',
    'insights/forecast': 'insights/overview',
    'insights/memory': 'insights/hermes',
    'settings/appearance': 'settings/preferences',
    'settings/learning': 'settings/preferences',
    'settings/curation': 'settings/preferences',
  }
  const canonical = aliases[clean] || clean
  const [workspace, slug] = canonical.split('/')
  return destinations.find((item) => item.workspace === workspace && item.slug === slug) || null
}

export const workspaceOrder: WorkspaceKey[] = ['today', 'curate', 'map', 'learn', 'insights', 'settings']
