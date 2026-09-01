import { objectHref, routeHref, useRoute, Route } from '../app/router'
import { useData } from '../app/useData'
import { Empty, ErrorState, Loading } from '../components/States'
import { LearnNotesView } from './learn/LearnNotesView'
import { LearnPathsView } from './learn/LearnPathsView'
import { LearnRecallView } from './learn/LearnRecallView'
import { LearnThreadView } from './learn/LearnThreadView'
import { LearnCanonView } from './learn/LearnCanonView'
import { LearnContradictionsView } from './learn/LearnContradictionsView'

export type LearnWorkspaceProps = {
  route?: Route
}

type LearnMode = 'paths' | 'practice'
type PracticeFocus = 'notes' | 'recall' | 'contradictions'

const learnModes: Array<{ key: LearnMode; label: string; description: string }> = [
  { key: 'paths', label: 'Threads', description: 'Structured learning paths' },
  { key: 'practice', label: 'Practice', description: 'Synthesis and retrieval' },
]

const practiceFilters: Array<{ key: PracticeFocus; label: string; description: string }> = [
  { key: 'notes', label: 'Notes', description: 'Readable, editable synthesis' },
  { key: 'recall', label: 'Recall', description: 'Retrieval and approved cards' },
  { key: 'contradictions', label: 'Contradictions', description: 'Review grounded tensions' },
]

function LearnModeSwitcher({ active, practiceFocus }: { active: LearnMode; practiceFocus: PracticeFocus }) {
  return (
    <>
      <nav class="workspace-mode-switcher workspace-local-nav" aria-label="Learn sections">
        {learnModes.map((item) => {
          const href = item.key === 'paths' ? routeHref('learn', 'paths') : routeHref('learn', 'practice', 'notes')
          return (
            <a
              key={item.key}
              href={href}
              class={active === item.key ? 'active' : ''}
              aria-current={active === item.key ? 'page' : undefined}
            >
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </a>
          )
        })}
      </nav>
      {active === 'practice' && (
        <nav class="workspace-filter-switcher workspace-local-nav practice-filter-nav" aria-label="Practice modes">
          {practiceFilters.map((item) => (
            <a
              key={item.key}
              href={routeHref('learn', 'practice', item.key)}
              class={practiceFocus === item.key ? 'active' : ''}
              aria-current={practiceFocus === item.key ? 'page' : undefined}
            >
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </a>
          ))}
        </nav>
      )}
    </>
  )
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
  const practiceFocus: PracticeFocus =
    activeRoute.objectType === 'note' || routeFocus === 'notes' || routeMode === 'notes'
      ? 'notes'
      : routeFocus === 'contradictions' || routeMode === 'contradictions'
        ? 'contradictions'
        : 'recall'
  const activeMode: LearnMode =
    activeRoute.objectType === 'note' || routeMode === 'practice' || routeMode === 'notes' || routeMode === 'recall'
      ? 'practice'
      : 'paths'

  const content =
    activeRoute.objectType === 'thread' && activeRoute.objectId ? (
      <LearnThreadView
        threadId={activeRoute.objectId}
        tab={activeRoute.query.get('tab') || undefined}
        focusLevelId={activeRoute.query.get('level') || undefined}
      />
    ) : activeRoute.objectType === 'level' && activeRoute.objectId && activeRoute.parentObjectId ? (
      <LearnThreadView threadId={activeRoute.parentObjectId} levelId={activeRoute.objectId} />
    ) : activeRoute.objectType === 'lesson' && activeRoute.objectId && activeRoute.parentObjectId ? (
      <LearnThreadView threadId={activeRoute.parentObjectId} lessonId={activeRoute.objectId} />
    ) : activeRoute.objectType === 'unit' && activeRoute.objectId ? (
      <LearnUnitView unitId={activeRoute.objectId} />
    ) : activeRoute.objectType === 'card' && activeRoute.objectId ? (
      <LearnCardView cardId={activeRoute.objectId} />
    ) : activeRoute.objectType === 'note' && activeRoute.objectId ? (
      <LearnNotesView noteId={activeRoute.objectId} />
    ) : activeRoute.objectType === 'canon-domain' && activeRoute.objectId ? (
      <LearnCanonView domainId={activeRoute.objectId} />
    ) : activeMode === 'practice' && practiceFocus === 'notes' ? (
      <LearnNotesView noteId={activeRoute.query.get('note') || undefined} />
    ) : activeMode === 'practice' && practiceFocus === 'contradictions' ? (
      <LearnContradictionsView />
    ) : activeMode === 'practice' ? (
      <LearnRecallView />
    ) : (
      <LearnPathsView />
    )
  const showSwitcher = !['thread', 'level', 'lesson', 'canon-domain'].includes(activeRoute.objectType || '')
  return (
    <div class="learn-workspace-shell workspace-surface">
      {showSwitcher && <LearnModeSwitcher active={activeMode} practiceFocus={practiceFocus} />}
      {content}
    </div>
  )
}

function LearnUnitView({ unitId }: { unitId: string }) {
  const data = useData<{
    unit: {
      statement: string
      unit_type?: string
      user_synthesis?: string | null
      confidence?: number
      branch?: { id: string; label: string; domain: string }
    }
    relations?: Array<{
      id: string
      relation_type: string
      direction: 'incoming' | 'outgoing'
      why: string
      counterpart: {
        unit_id: string
        statement: string
        branch: { id: string; label: string; domain: string }
        anchor?: { locator: string } | null
      }
    }>
  }>(`/learning/core/units/${encodeURIComponent(unitId)}`)
  if (data.loading && !data.data) return <Loading label="Loading learning unit" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data)
    return (
      <Empty
        title="Learning unit not found"
        body="This typed Learn link no longer points to an available unit."
        action={
          <a class="button secondary" href={routeHref('learn', 'practice', 'notes')}>
            Return to Notes
          </a>
        }
      />
    )
  return (
    <article class="learn-object-detail relation-unit-detail">
      <p class="folio-object-kicker">Learning Unit · {data.data.unit.unit_type || 'concept'}</p>
      {data.data.unit.branch && (
        <span class="folio-branch-pill">
          {data.data.unit.branch.label} · {data.data.unit.branch.domain}
        </span>
      )}
      <h1>{data.data.unit.statement}</h1>
      {data.data.unit.user_synthesis && <p>{data.data.unit.user_synthesis}</p>}
      <small>Confidence: {Math.round(Number(data.data.unit.confidence || 0) * 100)}%</small>
      {data.data.relations?.length ? (
        <section class="unit-relations">
          <h2>Semantic relationships</h2>
          {data.data.relations.map((relation) => (
            <article key={relation.id}>
              <div>
                <span class="relation-direction">{relation.direction}</span>
                <strong>{relation.relation_type.replace(/_/g, ' ')}</strong>
                <span class="folio-branch-pill">
                  {relation.counterpart.branch.label} · {relation.counterpart.branch.domain}
                </span>
              </div>
              <a href={objectHref('learn', 'unit', relation.counterpart.unit_id)}>{relation.counterpart.statement}</a>
              <p>{relation.why}</p>
              {relation.counterpart.anchor && <small>Anchor: {relation.counterpart.anchor.locator}</small>}
            </article>
          ))}
        </section>
      ) : null}
    </article>
  )
}

function LearnCardView({ cardId }: { cardId: string }) {
  const data = useData<{
    card: {
      question: string
      answer: string
      topic?: string
      branch?: string
      card_type?: string
      source_anchor?: string
      source_title?: string
      note_id?: string
      due_at?: string
    }
  }>(`/learning/srs/cards/${encodeURIComponent(cardId)}`)
  if (data.loading && !data.data) return <Loading label="Loading recall card" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data)
    return (
      <Empty
        title="Recall card not found"
        body="This typed Learn link no longer points to an available card."
        action={
          <a class="button secondary" href="#/learn/practice/recall">
            Return to Recall
          </a>
        }
      />
    )
  const card = data.data.card
  return (
    <article class="learn-object-detail">
      <p class="folio-object-kicker">Recall · {card.card_type || 'question'}</p>
      <h1>{card.question}</h1>
      <p>{card.answer}</p>
      <dl>
        <div>
          <dt>Branch</dt>
          <dd>{card.branch || card.topic || 'General'}</dd>
        </div>
        {card.source_title && (
          <div>
            <dt>Source</dt>
            <dd>{card.source_title}</dd>
          </div>
        )}
        {card.source_anchor && (
          <div>
            <dt>Anchor</dt>
            <dd>{card.source_anchor}</dd>
          </div>
        )}
        <div>
          <dt>Due</dt>
          <dd>{card.due_at || 'Not scheduled'}</dd>
        </div>
      </dl>
      {card.note_id && (
        <a class="button secondary" href={`#/learn/note/${encodeURIComponent(card.note_id)}`}>
          Open source note
        </a>
      )}
    </article>
  )
}

export default LearnWorkspace
