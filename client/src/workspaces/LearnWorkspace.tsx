import { useRoute, Route } from '../app/router'
import { LearnNotesView } from './learn/LearnNotesView'
import { LearnPathsView } from './learn/LearnPathsView'
import { LearnRecallView } from './learn/LearnRecallView'
import { LearnThreadView } from './learn/LearnThreadView'

export type LearnWorkspaceProps = {
  route?: Route
}

type LearnMode = 'paths' | 'notes' | 'recall'

const learnModes: Array<{ key: LearnMode; label: string; description: string }> = [
  { key: 'paths', label: 'Paths', description: 'Questions with an evidence trail' },
  { key: 'notes', label: 'Notes', description: 'Readable, editable synthesis' },
  { key: 'recall', label: 'Recall', description: 'Retrieval and approved cards' },
]

function LearnModeSwitcher({ active }: { active: LearnMode }) {
  return <nav class="workspace-mode-switcher workspace-local-nav" aria-label="Learn sections">
    {learnModes.map((item) => {
      const href = item.key === 'paths' ? '#/learn?mode=paths' : `#/learn?mode=${item.key}`
      return <a key={item.key} href={href} class={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
        <strong>{item.label}</strong><small>{item.description}</small>
      </a>
    })}
  </nav>
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
  const activeMode: LearnMode = activeRoute.objectType === 'note' ? 'notes' : activeRoute.objectType === 'thread' ? 'paths' : routeMode === 'notes' || routeMode === 'recall' ? routeMode : 'paths'

  const content = activeRoute.objectType === 'thread' && activeRoute.objectId ? <LearnThreadView threadId={activeRoute.objectId} />
    : activeRoute.objectType === 'note' && activeRoute.objectId ? <LearnNotesView noteId={activeRoute.objectId} />
      : activeMode === 'notes' ? <LearnNotesView noteId={activeRoute.query.get('note') || undefined} />
        : activeMode === 'recall' ? <LearnRecallView />
          : <LearnPathsView />
  return <div class="learn-workspace-shell workspace-surface"><LearnModeSwitcher active={activeMode} />{content}</div>
}

export default LearnWorkspace
