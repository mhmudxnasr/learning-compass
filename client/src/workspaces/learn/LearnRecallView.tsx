import { useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { formatDate, noteHref } from './helpers'
import { CardsResponse, DraftsResponse, DueResponse, RecallCard, RecallDraft } from './types'

type RecallView = 'due' | 'drafts' | 'library'

export function LearnRecallView() {
  const due = useData<DueResponse>('/learning/srs/due')
  const drafts = useData<DraftsResponse>('/srs/drafts')
  const cards = useData<CardsResponse>('/learning/srs/cards')
  const [view, setView] = useState<RecallView>('due')
  const [branch, setBranch] = useState('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')

  const dueCards = due.data?.cards || []
  const pendingDrafts = (drafts.data?.drafts || []).filter((draft) => draft.status === 'draft')
  const approvedCards = cards.data?.cards || []
  const branches = [
    ...new Set(
      [...dueCards, ...pendingDrafts, ...approvedCards].map((item) => item.branch).filter(Boolean) as string[],
    ),
  ].sort()
  const matches = (item: RecallCard | RecallDraft) => {
    if (branch !== 'all' && (item.branch || 'General') !== branch) return false
    const needle = query.trim().toLowerCase()
    return (
      !needle ||
      `${item.question} ${item.answer} ${item.topic || ''} ${item.source_title || ''} ${item.branch || ''} ${item.source_anchor || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }

  const counts: Record<RecallView, number> = {
    due: dueCards.filter(matches).length,
    drafts: pendingDrafts.filter(matches).length,
    library: approvedCards.filter(matches).length,
  }

  return (
    <section class="learn-workspace folio-learn folio-recall recall-workspace" aria-labelledby="recall-title">
      <header class="recall-head">
        <div>
          <p class="folio-object-kicker">Learn / Recall</p>
          <h1 id="recall-title">Recall</h1>
          <p class="folio-lede">Arabic source-grounded questions only. Review what is due; edit or reject the rest.</p>
        </div>
        <span class="folio-measure">{dueCards.length} due</span>
      </header>

      {message && (
        <output class="folio-status" aria-live="polite">
          {message}
        </output>
      )}

      <div class="recall-controls">
        <nav class="recall-view-switcher" aria-label="Recall view">
          {(
            [
              ['due', 'Due now'],
              ['drafts', 'Drafts'],
              ['library', 'Library'],
            ] as Array<[RecallView, string]>
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              class={view === key ? 'active' : ''}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label}
              <span>
                {key === 'due' ? dueCards.length : key === 'drafts' ? pendingDrafts.length : approvedCards.length}
              </span>
            </button>
          ))}
        </nav>
        <div class="recall-filters">
          <label>
            <span>Branch</span>
            <select value={branch} onChange={(event) => setBranch((event.target as HTMLSelectElement).value)}>
              <option value="all">All branches</option>
              {branches.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label class="recall-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              placeholder="Search question, source, or anchor"
            />
          </label>
        </div>
      </div>

      {view === 'due' && (
        <DueReview
          cards={dueCards.filter(matches)}
          loading={due.loading && !due.data}
          error={due.error}
          reload={() => {
            due.reload()
            cards.reload()
          }}
          setMessage={setMessage}
        />
      )}
      {view === 'drafts' && (
        <DraftReview
          drafts={pendingDrafts.filter(matches)}
          loading={drafts.loading && !drafts.data}
          error={drafts.error}
          reload={drafts.reload}
          setMessage={setMessage}
        />
      )}
      {view === 'library' && (
        <CardLibrary
          cards={approvedCards.filter(matches)}
          loading={cards.loading && !cards.data}
          error={cards.error}
          reload={cards.reload}
          setMessage={setMessage}
        />
      )}
      {counts[view] === 0 && query && <p class="recall-filter-note">No items match this search.</p>}
    </section>
  )
}

function SourceLine({ item }: { item: RecallCard | RecallDraft }) {
  return (
    <div class="recall-source-line">
      {item.branch && <span class="recall-branch-badge">{item.branch}</span>}
      {item.card_type && <span>{item.card_type}</span>}
      {item.source_title && <span>{item.source_title}</span>}
      {item.source_anchor && <span class="recall-anchor">{item.source_anchor}</span>}
    </div>
  )
}

function DueReview({
  cards,
  loading,
  error,
  reload,
  setMessage,
}: {
  cards: RecallCard[]
  loading: boolean
  error: string
  reload: () => void
  setMessage: (message: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [working, setWorking] = useState(false)
  const active = cards.find((card) => card.id === activeId) || cards[0]

  const review = async (grade: number) => {
    if (!active || !revealed) return
    setWorking(true)
    try {
      await api('/learning/srs/review', { method: 'POST', body: JSON.stringify({ card_id: active.id, grade }) })
      setActiveId(cards.find((card) => card.id !== active.id)?.id || null)
      setRevealed(false)
      setMessage('Review saved.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'The review could not be saved.')
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <Loading label="Loading due recall" />
  if (error) return <ErrorState message={error} retry={reload} />
  if (!active) return <Empty title="Nothing is due" body="Approved questions will return when FSRS schedules them." />

  return (
    <article class="recall-review-card">
      <header>
        <SourceLine item={active} />
        <span class="folio-measure">
          {active.repetitions || 0} reviews · due {formatDate(active.due_at)}
        </span>
      </header>
      <h2 lang="ar" dir="rtl">
        {active.question}
      </h2>
      {revealed ? (
        <div class="recall-answer">
          <span>Answer</span>
          <p lang="ar" dir="rtl">
            {active.answer}
          </p>
          {active.note_id && <a href={noteHref(active.note_id)}>Open source note →</a>}
        </div>
      ) : (
        <button class="button primary" type="button" onClick={() => setRevealed(true)}>
          Reveal answer
        </button>
      )}
      {revealed && (
        <div class="recall-grades">
          <span>How did retrieval feel?</span>
          <div>
            {[
              [0, 'Again'],
              [2, 'Hard'],
              [4, 'Good'],
              [5, 'Easy'],
            ].map(([grade, label]) => (
              <button
                class="button secondary"
                type="button"
                key={grade}
                onClick={() => review(Number(grade))}
                disabled={working}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function DraftReview({
  drafts,
  loading,
  error,
  reload,
  setMessage,
}: {
  drafts: RecallDraft[]
  loading: boolean
  error: string
  reload: () => void
  setMessage: (message: string) => void
}) {
  if (loading) return <Loading label="Loading recall drafts" />
  if (error) return <ErrorState message={error} retry={reload} />
  if (!drafts.length)
    return (
      <Empty
        title="No drafts waiting"
        body="Source extraction creates a draft only when an anchored idea is worth retrieving."
      />
    )
  return (
    <div class="recall-draft-list">
      {drafts.map((draft) => (
        <DraftRow key={draft.id} draft={draft} reload={reload} setMessage={setMessage} />
      ))}
    </div>
  )
}

function DraftRow({
  draft,
  reload,
  setMessage,
}: {
  draft: RecallDraft
  reload: () => void
  setMessage: (message: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [question, setQuestion] = useState(draft.question)
  const [answer, setAnswer] = useState(draft.answer)
  const [cardType, setCardType] = useState(draft.card_type || 'mechanism')
  const [sourceAnchor, setSourceAnchor] = useState(draft.source_anchor || '')
  const [working, setWorking] = useState('')

  const save = async () => {
    setWorking('save')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          card_type: cardType,
          source_anchor: sourceAnchor.trim(),
        }),
      })
      setEditing(false)
      setMessage('Draft saved.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Draft save failed.')
    } finally {
      setWorking('')
    }
  }

  const approve = async () => {
    setWorking('approve')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}/approve`, { method: 'POST' })
      setMessage('Added to the review deck.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Approval failed.')
    } finally {
      setWorking('')
    }
  }

  const reject = async () => {
    setWorking('reject')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}/reject`, { method: 'POST' })
      setMessage('Draft rejected.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Rejection failed.')
    } finally {
      setWorking('')
    }
  }

  return (
    <article class="recall-draft-row">
      <SourceLine item={draft} />
      {editing ? (
        <div class="recall-draft-editor">
          <label>
            Question in Arabic
            <textarea
              lang="ar"
              dir="rtl"
              value={question}
              onInput={(event) => setQuestion((event.target as HTMLTextAreaElement).value)}
            />
          </label>
          <label>
            Answer in Arabic
            <textarea
              lang="ar"
              dir="rtl"
              value={answer}
              onInput={(event) => setAnswer((event.target as HTMLTextAreaElement).value)}
            />
          </label>
          <div>
            <label>
              Question type
              <select value={cardType} onChange={(event) => setCardType((event.target as HTMLSelectElement).value)}>
                {['mechanism', 'comparison', 'boundary', 'sequence', 'decision', 'application', 'causal'].map(
                  (type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Source anchor
              <input
                value={sourceAnchor}
                onInput={(event) => setSourceAnchor((event.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        </div>
      ) : (
        <>
          <h2 lang="ar" dir="rtl">
            {draft.question}
          </h2>
          <p lang="ar" dir="rtl">
            {draft.answer}
          </p>
          {draft.unit_statement && <small class="recall-unit-line">Retained idea: {draft.unit_statement}</small>}
        </>
      )}
      <footer>
        <div>
          {draft.note_id && <a href={noteHref(draft.note_id)}>Open note</a>}
          <span>{formatDate(draft.created_at)}</span>
        </div>
        <div>
          {editing ? (
            <>
              <button class="button quiet" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                class="button secondary"
                type="button"
                onClick={save}
                disabled={Boolean(working) || !question.trim() || !answer.trim()}
              >
                Save
              </button>
            </>
          ) : (
            <button class="button quiet" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button class="button quiet" type="button" onClick={reject} disabled={Boolean(working)}>
            Reject
          </button>
          <button class="button primary" type="button" onClick={approve} disabled={Boolean(working) || editing}>
            Approve
          </button>
        </div>
      </footer>
    </article>
  )
}

function CardLibrary({
  cards,
  loading,
  error,
  reload,
  setMessage,
}: {
  cards: RecallCard[]
  loading: boolean
  error: string
  reload: () => void
  setMessage: (message: string) => void
}) {
  if (loading) return <Loading label="Loading review deck" />
  if (error) return <ErrorState message={error} retry={reload} />
  if (!cards.length)
    return <Empty title="No approved cards" body="Approve a useful source-grounded draft to add it here." />
  return (
    <div class="recall-library-list">
      {cards.map((card) => (
        <CardRow key={card.id} card={card} reload={reload} setMessage={setMessage} />
      ))}
    </div>
  )
}

function CardRow({
  card,
  reload,
  setMessage,
}: {
  card: RecallCard
  reload: () => void
  setMessage: (message: string) => void
}) {
  const [working, setWorking] = useState(false)
  const remove = async () => {
    if (!window.confirm(`Delete “${card.question}”?`)) return
    setWorking(true)
    try {
      await api(`/learning/srs/cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' })
      setMessage('Card deleted.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Delete failed.')
      setWorking(false)
    }
  }
  return (
    <article class="recall-library-row">
      <div>
        <SourceLine item={card} />
        <strong lang="ar" dir="rtl">
          {card.question}
        </strong>
        <small>
          Due {formatDate(card.due_at)} · {card.repetitions || 0} reviews
        </small>
      </div>
      <div>
        {card.note_id && (
          <a class="button quiet" href={noteHref(card.note_id)}>
            Note
          </a>
        )}
        <button class="button quiet" type="button" onClick={remove} disabled={working}>
          {working ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </article>
  )
}
