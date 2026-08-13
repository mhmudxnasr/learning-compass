import { useRoute, Route } from '../app/router'
import { LearnNotesView } from './learn/LearnNotesView'
import { LearnPathsView } from './learn/LearnPathsView'
import { LearnRecallView } from './learn/LearnRecallView'
import { LearnThreadView } from './learn/LearnThreadView'

export type LearnWorkspaceProps = {
  route?: Route
}

/**
 * Learn owns three jobs: shape a path, preserve readable notes, and retrieve.
 * Typed Thread and Note routes stay inside this workspace so object identity is
 * preserved while the parent shell keeps ownership of navigation and chrome.
 */
export function LearnWorkspace({ route }: LearnWorkspaceProps = {}) {
  const routed = useRoute()
  const activeRoute = route || routed

  if (activeRoute.objectType === 'thread' && activeRoute.objectId) return <LearnThreadView threadId={activeRoute.objectId} />
  if (activeRoute.objectType === 'note' && activeRoute.objectId) return <LearnNotesView noteId={activeRoute.objectId} />
  if (activeRoute.view === 'notes') return <LearnNotesView noteId={activeRoute.query.get('note') || undefined} />
  if (activeRoute.view === 'recall') return <LearnRecallView />
  return <LearnPathsView />
}

export default LearnWorkspace
