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
  ...define('today', [['briefing', 'Briefing', 'Decide what deserves attention today.', 'briefing', '/dashboard/briefing']]),
  ...define('curate', [
    ['queue', 'Queue', 'Choose the five items worth doing next.', 'board', '/capture/queue'],
    ['discovery', 'Discovery', 'Explore unexpected frontiers and manage discovery interviews.', 'board', '/discovery/state'],
    ['inbox', 'RSS Feed', 'Subscribe, refresh, and triage RSS/Atom articles before the queue.', 'list', '/capture'],
    ['collections', 'Collections', 'Build active thematic learning groups.', 'board', '/collections?scope=curate'],
    ['resurfacing', 'Resurfacing', 'Revisit high-value material at useful intervals.', 'list', '/brain/resurfacing'],
    ['contradictions', 'Contradictions', 'Resolve competing claims instead of hiding them.', 'list', '/brain/contradictions'],
    ['archive', 'Archive', 'Find completed, excluded, and saved sources while RSS stays pinned above.', 'list', '/recommendations/list?limit=200&source=manual'],
  ]),
  ...define('map', [
    ['atlas', 'Atlas', 'Explore the living topology of your knowledge.', 'graph', '/knowledge/graph'],
    ['branches', 'Branches', 'Browse the hierarchy and health of every knowledge branch.', 'list', '/brain/tree?limit=500'],
    ['coverage', 'Coverage', 'Find healthy, growing, neglected, and uncovered areas.', 'analysis', '/learning/health'],
    ['taste', 'Taste', 'See the topics and creators shaping your learning choices.', 'analysis', '/taste/dna'],
  ]),
  ...define('learn', [
    ['files', 'Files', 'Open PDFs, web companions, and uploaded documents.', 'library', '/artifacts'],
    ['notebooklm', 'NotebookLM', 'Grounded Master Corpus, studio artifact generator, and zero-hallucination Q&A.', 'library', '/notebooklm/status'],
    ['reflections', 'Reflections', 'Preserve your own reactions, ratings, and handwritten notes.', 'study', '/notes?kind=reflection'],
    ['notes', 'Notes', 'Read and edit structured source notes created by Notes Extractor.', 'library', '/notes'],
    ['cards', 'Cards', 'Edit drafts, manage approved cards, or delete either.', 'study', '/srs/drafts'],
    ['review', 'Review', 'Complete today’s active-recall session.', 'study', '/learning/srs/due'],
    ['changes', 'Changes', 'Approve or reject every Hermes profile and map proposal.', 'list', '/feedback/proposals'],
    ['journal', 'Journal', 'Review the chronological record of what changed.', 'list', '/learning/update-log?limit=100'],
  ]),
  ...define('insights', [
    ['overview', 'Overview', 'See consumption, ratings, creators, and recent activity.', 'analysis', '/stats'],
    ['learning', 'Learning', 'Review branch health, gaps, and learning activity.', 'analysis', '/learning/health'],
    ['taste', 'Taste', 'Understand preference changes and creator performance.', 'analysis', '/taste/dna'],
    ['forecast', 'Forecast', 'Estimate upcoming review load and mastery progress.', 'analysis', '/analytics/forecast'],
  ]),
  ...define('settings', [
    ['profile', 'Profile', 'Review priorities, exclusions, and learning patterns.', 'settings', '/brain/profile'],
    ['appearance', 'Appearance', 'Choose theme, density, and dashboard behavior.', 'settings', '/settings'],
    ['learning', 'Learning', 'Configure goals, review defaults, and queue discipline.', 'settings', '/settings'],
    ['curation', 'Curation', 'Control background enrichment and recommendation rules.', 'settings', '/settings'],
    ['data', 'Data', 'Export your library and check synchronization.', 'settings', '/settings'],
  ]),
]

export const mobilePrimary = ['today', 'curate', 'learn', 'more'] as const

export function destinationForPath(path: string): Destination | null {
  const clean = path.replace(/^#?\/?/, '').replace(/\/$/, '')
  if (clean === 'vault/files') return destinations.find((item) => item.key === 'learn.files') || null
  if (clean === 'vault/notes') return destinations.find((item) => item.key === 'learn.notes') || null
  if (clean === 'learn/sessions') return destinations.find((item) => item.key === 'curate.queue') || null
  const [workspace, slug] = clean.split('/')
  return destinations.find((item) => item.workspace === workspace && item.slug === slug) || null
}

export const workspaceOrder: WorkspaceKey[] = ['today', 'curate', 'map', 'learn', 'insights', 'settings']
