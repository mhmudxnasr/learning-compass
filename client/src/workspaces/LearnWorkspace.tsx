import { useRoute, Route } from '../app/router'
import { useData } from '../app/useData'
import { Empty, ErrorState, Loading } from '../components/States'
import { LearnNotesView } from './learn/LearnNotesView'
import { LearnPathsView } from './learn/LearnPathsView'
import { LearnRecallView } from './learn/LearnRecallView'
import { LearnThreadView } from './learn/LearnThreadView'
import { routeHref } from '../app/router'

export type LearnWorkspaceProps = {
  route?: Route
}

type LearnMode = 'paths' | 'practice'
type LearnFocus = 'notes' | 'recall'

const learnModes: Array<{ key: LearnMode; label: string; description: string }> = [
  { key: 'paths', label: 'Threads', description: 'Questions with an evidence trail' },
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
      const href = item.key === 'paths' ? routeHref('learn', 'paths') : routeHref('learn', 'practice', 'notes')
      return <a key={item.key} href={href} class={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
        <strong>{item.label}</strong><small>{item.description}</small>
      </a>
    })}
    </nav>
    {active === 'practice' && <nav class="workspace-filter-switcher workspace-local-nav" aria-label="Practice filters">
      {practiceFilters.map((item) => <a key={item.key} href={routeHref('learn', 'practice', item.key)} class={focus === item.key ? 'active' : ''} aria-current={focus === item.key ? 'page' : undefined}>
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
  const routeMode = activeRoute.mode || activeRoute.query.get('mode') || activeRoute.view
  const routeFocus = activeRoute.focus || activeRoute.query.get('focus') || ''
  const compatibleFocus: LearnFocus = activeRoute.objectType === 'note' || routeFocus === 'notes' || routeMode === 'notes' ? 'notes' : 'recall'
  const activeMode: LearnMode = activeRoute.objectType === 'thread' || activeRoute.objectType === 'level' ? 'paths' : activeRoute.objectType === 'note' || routeMode === 'practice' || routeMode === 'notes' || routeMode === 'recall' ? 'practice' : 'paths'

  const content = activeRoute.objectType === 'thread' && activeRoute.objectId ? <LearnThreadView threadId={activeRoute.objectId} />
    : activeRoute.objectType === 'level' && activeRoute.objectId && activeRoute.parentObjectId ? <LearnThreadView threadId={activeRoute.parentObjectId} levelId={activeRoute.objectId} />
    : activeRoute.objectType === 'lesson' && activeRoute.objectId && activeRoute.parentObjectId ? <LearnThreadView threadId={activeRoute.parentObjectId} lessonId={activeRoute.objectId} />
    : activeRoute.objectType === 'unit' && activeRoute.objectId ? <LearnUnitView unitId={activeRoute.objectId} />
      : activeRoute.objectType === 'card' && activeRoute.objectId ? <LearnCardView cardId={activeRoute.objectId} />
    : activeRoute.objectType === 'note' && activeRoute.objectId ? <LearnNotesView noteId={activeRoute.objectId} />
      : activeMode === 'practice' && compatibleFocus === 'notes' ? <LearnNotesView noteId={activeRoute.query.get('note') || undefined} />
        : activeMode === 'practice' ? <LearnRecallView />
          : <LearnPathsView />
  // A typed note route is already inside the Notes editor. Keep the editor
  // focused instead of repeating the parent Learn navigation above it.
  return <div class="learn-workspace-shell workspace-surface">{activeRoute.objectType !== 'note' && activeRoute.objectType !== 'lesson' && <LearnModeSwitcher active={activeMode} focus={compatibleFocus} />}{content}</div>
}

function LearnUnitView({ unitId }: { unitId: string }) {
  const data = useData<{ unit: { statement: string; unit_type?: string; user_synthesis?: string | null; confidence?: number }; relations?: Array<{ relation_type: string; target_statement?: string }> }>(`/learning/core/units/${encodeURIComponent(unitId)}`)
  if (data.loading && !data.data) return <Loading label="Loading learning unit" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data) return <Empty title="Learning unit not found" body="This typed Learn link no longer points to an available unit." action={<a class="button secondary" href="#/learn">Return to Threads</a>} />
  return <article class="learn-object-detail"><p class="folio-object-kicker">Learning Unit · {data.data.unit.unit_type || 'concept'}</p><h1>{data.data.unit.statement}</h1>{data.data.unit.user_synthesis && <p>{data.data.unit.user_synthesis}</p>}<small>Confidence: {Math.round(Number(data.data.unit.confidence || 0) * 100)}%</small>{data.data.relations?.length ? <section><h2>Relations</h2>{data.data.relations.map((relation) => <p key={`${relation.relation_type}-${relation.target_statement}`}>{relation.relation_type}: {relation.target_statement}</p>)}</section> : null}</article>
}

function LearnCardView({ cardId }: { cardId: string }) {
  const data = useData<{ card: { question: string; answer: string; topic?: string; source_title?: string; due_at?: string } }>(`/learning/srs/cards/${encodeURIComponent(cardId)}`)
  if (data.loading && !data.data) return <Loading label="Loading recall card" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data) return <Empty title="Recall card not found" body="This typed Learn link no longer points to an available card." action={<a class="button secondary" href="#/learn/practice/recall">Return to Recall</a>} />
  return <article class="learn-object-detail"><p class="folio-object-kicker">Recall Card · {data.data.card.topic || 'General'}</p><h1>{data.data.card.question}</h1><p>{data.data.card.answer}</p>{data.data.card.source_title && <small>Source: {data.data.card.source_title}</small>}<small>Due: {data.data.card.due_at || 'Not scheduled'}</small></article>
}

export default LearnWorkspace
