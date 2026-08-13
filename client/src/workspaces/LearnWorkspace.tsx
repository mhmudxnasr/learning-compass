import { useRoute, Route } from '../app/router'
import { LearnNotesView } from './learn/LearnNotesView'
import { LearnPathsView } from './learn/LearnPathsView'
import { LearnRecallView } from './learn/LearnRecallView'
import { LearnThreadView } from './learn/LearnThreadView'

export type LearnWorkspaceProps = {
  route?: Route
}

type LearnMode = 'paths' | 'practice'
type LearnFocus = 'notes' | 'recall'

const learnModes: Array<{ key: LearnMode; label: string; description: string }> = [
  { key: 'paths', label: 'Paths', description: 'Questions with an evidence trail' },
  { key: 'practice', label: 'Practice', description: 'Synthesis and retrieval' },
]

const practiceFilters: Array<{ key: LearnFocus; label: string; description: string }> = [
  { key: 'notes', label: 'Notes', description: 'Readable, editable synthesis' },
  { key: 'recall', label: 'Recall', description: 'Retrieval and approved cards' },
]

function LearnModeSwitcher({ active, focus }: { active: LearnMode; focus: LearnFocus }) {
  return <>
    <nav class="workspace-mode-switcher workspace-local-nav" aria-label="Learn sections">
    {learnModes.map((item) => {
      const href = item.key === 'paths' ? '#/learn?mode=paths' : '#/learn?mode=practice&focus=notes'
      return <a key={item.key} href={href} class={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
        <strong>{item.label}</strong><small>{item.description}</small>
      </a>
    })}
    </nav>
    {active === 'practice' && <nav class="workspace-filter-switcher workspace-local-nav" aria-label="Practice filters">
      {practiceFilters.map((item) => <a key={item.key} href={`#/learn?mode=practice&focus=${item.key}`} class={focus === item.key ? 'active' : ''} aria-current={focus === item.key ? 'page' : undefined}>
        <strong>{item.label}</strong><small>{item.description}</small>
      </a>)}
    </nav>}
  </>
}

/**
 * Learn owns three jobs: shape a path, preserve readable notes, and retrieve.
 * Typed Thread and Note routes stay inside this workspace so object identity is
 * preserved while the parent shell keeps ownership of navigation and chrome.
 */
export function LearnWorkspace({ route }: LearnWorkspaceProps = {}) {
  const routed = useRoute()
  const activeRoute = route || routed
  const routeMode = activeRoute.query.get('mode') || activeRoute.view
  const routeFocus = activeRoute.query.get('focus') || ''
  const compatibleFocus: LearnFocus = activeRoute.objectType === 'note' || routeFocus === 'notes' || routeMode === 'notes' ? 'notes' : 'recall'
  const activeMode: LearnMode = activeRoute.objectType === 'thread' ? 'paths' : activeRoute.objectType === 'note' || routeMode === 'practice' || routeMode === 'notes' || routeMode === 'recall' ? 'practice' : 'paths'

  const content = activeRoute.objectType === 'thread' && activeRoute.objectId ? <LearnThreadView threadId={activeRoute.objectId} />
    : activeRoute.objectType === 'note' && activeRoute.objectId ? <LearnNotesView noteId={activeRoute.objectId} />
      : activeMode === 'practice' && compatibleFocus === 'notes' ? <LearnNotesView noteId={activeRoute.query.get('note') || undefined} />
        : activeMode === 'practice' ? <LearnRecallView />
          : <LearnPathsView />
  return <div class="learn-workspace-shell workspace-surface"><LearnModeSwitcher active={activeMode} focus={compatibleFocus} />{content}</div>
}

export default LearnWorkspace
