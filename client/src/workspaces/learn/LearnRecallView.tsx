import { useMemo, useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { objectHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { objectHref as libraryObjectHref } from '../library/types'
import { cardHref, formatDate, noteHref } from './helpers'
import {
  CardsResponse,
  DraftsResponse,
  DueResponse,
  RecallCard,
  RecallDraft,
  RecallRepairCard,
  RecallRepairResponse,
} from './types'

type RecallView = 'due' | 'repair' | 'drafts' | 'library'

export function LearnRecallView() {
  const due = useData<DueResponse>('/learning/srs/due')
  const drafts = useData<DraftsResponse>('/srs/drafts')
  const cards = useData<CardsResponse>('/learning/srs/cards')
  const repair = useData<RecallRepairResponse>('/learning/srs/repair')
  const [view, setView] = useState<RecallView>('due')
  const [branch, setBranch] = useState('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')

  const dueCards = useMemo(() => due.data?.cards || [], [due.data?.cards])
  const pendingDrafts = useMemo(
    () => (drafts.data?.drafts || []).filter((draft) => draft.status === 'draft'),
    [drafts.data?.drafts],
  )
  const approvedCards = useMemo(() => cards.data?.cards || [], [cards.data?.cards])
  const repairCards = useMemo(() => repair.data?.cards || [], [repair.data?.cards])
  const branches = useMemo(
    () =>
      [
        ...new Map(
          [...dueCards, ...repairCards, ...pendingDrafts, ...approvedCards].flatMap((item) =>
            item.branch_context ? [[item.branch_context.id, item.branch_context.label] as const] : [],
          ),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [dueCards, repairCards, pendingDrafts, approvedCards],
  )
  const matches = (item: RecallCard | RecallDraft) => {
    if (branch !== 'all' && (item.branch_context?.id || 'unassigned') !== branch) return false
    const needle = query.trim().toLowerCase()
    return (
      !needle ||
      `${item.question} ${item.answer} ${item.topic || ''} ${item.source_title || ''} ${item.branch_context?.label || ''} ${item.source_anchor || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }

  const counts: Record<RecallView, number> = {
    due: dueCards.filter(matches).length,
    repair: repairCards.filter(matches).length,
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
              ['repair', 'Needs repair'],
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
                {key === 'due'
                  ? dueCards.length
                  : key === 'repair'
                    ? repairCards.length
                    : key === 'drafts'
                      ? pendingDrafts.length
                      : approvedCards.length}
              </span>
            </button>
          ))}
        </nav>
        <div class="recall-filters">
          <label>
            <span>Branch</span>
            <select value={branch} onChange={(event) => setBranch((event.target as HTMLSelectElement).value)}>
              <option value="all">All branches</option>
              <option value="unassigned">Unassigned branch</option>
              {branches.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label class="recall-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              aria-label="Search question, source, or anchor"
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
            repair.reload()
            cards.reload()
          }}
          setMessage={setMessage}
        />
      )}
      {view === 'repair' && (
        <RepairReview
          cards={repairCards.filter(matches)}
          threshold={repair.data?.threshold || 3}
          loading={repair.loading && !repair.data}
          error={repair.error}
          reload={() => {
            repair.reload()
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
          reload={() => {
            drafts.reload()
            cards.reload()
            due.reload()
            repair.reload()
          }}
          setMessage={setMessage}
        />
      )}
      {view === 'library' && (
        <CardLibrary
          cards={approvedCards.filter(matches)}
          loading={cards.loading && !cards.data}
          error={cards.error}
          reload={() => {
            cards.reload()
            due.reload()
            repair.reload()
          }}
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
      {item.branch_context ? (
        <a class="recall-branch-badge" href={objectHref('map', 'branch', item.branch_context.id)}>
          {item.branch_context.label}
        </a>
      ) : (
        <span class="recall-branch-badge">Unassigned branch</span>
      )}
      {item.card_type && <span>{item.card_type}</span>}
      {item.source_title &&
        (item.recommendation_id ? (
          <a class="item-title-link" href={libraryObjectHref('source', item.recommendation_id)}>
            {item.source_title}
          </a>
        ) : (
          <span>{item.source_title}</span>
        ))}
      {item.source_anchor && <span class="recall-anchor">{item.source_anchor}</span>}
    </div>
  )
}

function recallPrecondition(card: RecallCard) {
  const revisions = [card.content_revision, card.scheduler_revision, card.status_revision]
  if (
    revisions.some((value) => !Number.isInteger(value) || value < 1) ||
    !['active', 'paused', 'retired'].includes(card.repair_status)
  ) {
    throw new Error('This card is missing its current revision state. Reload Recall before changing it.')
  }
  return {
    expected_content_revision: card.content_revision,
    expected_scheduler_revision: card.scheduler_revision,
    expected_status_revision: card.status_revision,
    expected_repair_status: card.repair_status,
  }
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
  const activePosition = active ? cards.findIndex((card) => card.id === active.id) + 1 : 0

  const review = async (grade: number) => {
    if (!active || !revealed) return
    setWorking(true)
    try {
      await api('/learning/srs/review', {
        method: 'POST',
        body: JSON.stringify({ card_id: active.id, grade, ...recallPrecondition(active) }),
      })
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
    <article class="recall-review-card" data-state={revealed ? 'answer' : 'question'}>
      <div class="recall-review-progress" aria-label={`Review ${activePosition} of ${cards.length}`}>
        <span>
          <Icon name="recall" size={16} />
          Due review
        </span>
        <span>
          <strong>{activePosition}</strong> / {cards.length}
        </span>
      </div>
      <header>
        <SourceLine item={active} />
        <div class="recall-card-schedule">
          <span>{active.repetitions || 0} reviews</span>
          <span>Due {formatDate(active.due_at)}</span>
        </div>
      </header>
      <div class="recall-prompt">
        <span>Question</span>
        <h2 lang="ar" dir="rtl">
          {active.question}
        </h2>
      </div>
      {revealed ? (
        <div class="recall-answer">
          <span>Answer</span>
          <p lang="ar" dir="rtl">
            {active.answer}
          </p>
          {active.note_id && <a href={noteHref(active.note_id)}>Open source note →</a>}
        </div>
      ) : (
        <div class="recall-review-action">
          <button class="button primary" type="button" onClick={() => setRevealed(true)}>
            <span>Reveal answer</span>
            <Icon name="chevron" size={16} />
          </button>
          <small>Pause and retrieve before revealing.</small>
        </div>
      )}
      {revealed && (
        <div class="recall-grades">
          <span>How did retrieval feel?</span>
          <div>
            {[
              [0, 'Again', 'Could not recall'],
              [2, 'Hard', 'Recalled with effort'],
              [4, 'Good', 'Recalled correctly'],
              [5, 'Easy', 'Recalled immediately'],
            ].map(([grade, label, meaning]) => (
              <button
                class="button secondary"
                type="button"
                key={grade}
                aria-label={String(label)}
                aria-describedby={`recall-grade-${grade}`}
                onClick={() => review(Number(grade))}
                disabled={working}
              >
                <strong>{label}</strong>
                <small id={`recall-grade-${grade}`}>{meaning}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function RepairReview({
  cards,
  threshold,
  loading,
  error,
  reload,
  setMessage,
}: {
  cards: RecallRepairCard[]
  threshold: number
  loading: boolean
  error: string
  reload: () => void
  setMessage: (message: string) => void
}) {
  if (loading) return <Loading label="Loading cards that need repair" />
  if (error) return <ErrorState message={error} retry={reload} />
  if (!cards.length)
    return (
      <Empty
        title="No cards need repair"
        body={`A card appears here after ${threshold} new lapses. Paused cards also stay here so you can resume them.`}
      />
    )
  return (
    <section class="recall-repair-section" aria-labelledby="recall-repair-heading">
      <div class="recall-repair-intro">
        <div>
          <h2 id="recall-repair-heading">Repair before repeating</h2>
          <p>
            Threshold: {threshold} unacknowledged lapses. Nothing is rewritten, paused, retired, reset, or split without
            your action.
          </p>
        </div>
        <span>{cards.length} to inspect</span>
      </div>
      <div class="recall-repair-list">
        {cards.map((card) => (
          <RepairRow key={card.id} card={card} reload={reload} setMessage={setMessage} />
        ))}
      </div>
    </section>
  )
}

function RepairRow({
  card,
  reload,
  setMessage,
}: {
  card: RecallRepairCard
  reload: () => void
  setMessage: (message: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [question, setQuestion] = useState(card.question)
  const [answer, setAnswer] = useState(card.answer)
  const [changeKind, setChangeKind] = useState<'wording' | 'semantic'>('wording')
  const [reason, setReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [splitQuestion, setSplitQuestion] = useState('')
  const [splitAnswer, setSplitAnswer] = useState('')
  const [working, setWorking] = useState('')
  const isPaused = card.repair_status === 'paused'

  const save = async () => {
    if (
      changeKind === 'semantic' &&
      !window.confirm(
        'This meaning change will reset the card’s FSRS schedule. Existing review history will remain. Continue?',
      )
    )
      return
    setWorking('edit')
    try {
      await api(`/learning/srs/cards/${encodeURIComponent(card.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          change_kind: changeKind,
          reason: reason.trim(),
          ...recallPrecondition(card),
        }),
      })
      setMessage(
        changeKind === 'semantic'
          ? 'Meaning updated. Scheduling reset; review history preserved.'
          : 'Wording repaired. Scheduling preserved.',
      )
      setEditing(false)
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Card repair failed.')
    } finally {
      setWorking('')
    }
  }

  const setStatus = async (status: 'active' | 'paused' | 'retired') => {
    if (
      status === 'retired' &&
      !window.confirm(
        'Retire this card? It will leave due review, but its history will remain and it can be restored from Library.',
      )
    )
      return
    setWorking(status)
    try {
      await api(`/learning/srs/cards/${encodeURIComponent(card.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, ...recallPrecondition(card) }),
      })
      setMessage(
        status === 'active'
          ? 'Card resumed with its FSRS state intact.'
          : status === 'paused'
            ? 'Card paused. Its schedule and history are intact.'
            : 'Card retired. Review history preserved.',
      )
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Card status could not be changed.')
    } finally {
      setWorking('')
    }
  }

  const reset = async () => {
    if (!window.confirm('Reset this card’s FSRS schedule to a new card? Review history will remain available.')) return
    setWorking('reset')
    try {
      await api(`/learning/srs/cards/${encodeURIComponent(card.id)}/reset`, {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          reason: 'Learner reset scheduling from Needs repair.',
          ...recallPrecondition(card),
        }),
      })
      setMessage('Scheduling reset. Existing review history was preserved.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Schedule reset failed.')
    } finally {
      setWorking('')
    }
  }

  const createSplitCard = async () => {
    setWorking('split')
    const scope = card.lesson_id
      ? { lesson_id: card.lesson_id }
      : card.stage_id
        ? { stage_id: card.stage_id }
        : card.thread_id
          ? { thread_id: card.thread_id }
          : {}
    try {
      await api('/learning/srs/create', {
        method: 'POST',
        body: JSON.stringify({
          ...scope,
          recommendation_id: card.recommendation_id || undefined,
          note_id: card.note_id || undefined,
          annotation_id: card.annotation_id || undefined,
          source_anchor: card.source_anchor || undefined,
          topic: card.topic || undefined,
          branch: card.branch || undefined,
          question: splitQuestion.trim(),
          answer: splitAnswer.trim(),
        }),
      })
      setSplitQuestion('')
      setSplitAnswer('')
      setMessage('Learner-authored split card added. The original card is unchanged.')
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Split card could not be created.')
    } finally {
      setWorking('')
    }
  }

  const sourceAnchorHref =
    card.annotation_id && card.recommendation_id
      ? `${libraryObjectHref('source', card.recommendation_id)}?annotation=${encodeURIComponent(card.annotation_id)}`
      : card.recommendation_id
        ? libraryObjectHref('source', card.recommendation_id)
        : ''

  return (
    <article class={`recall-repair-row${isPaused ? ' is-paused' : ''}`}>
      <header>
        <SourceLine item={card} />
        <span class={`recall-repair-state ${isPaused ? 'is-paused' : 'needs-repair'}`}>
          {isPaused ? 'Paused' : 'Needs repair'}
        </span>
      </header>
      <div class="recall-repair-reason">
        <strong>{card.repair_reason.message}</strong>
        <span>
          Total: {card.lapses || 0} lapses · revision {card.content_revision || 1}
        </span>
      </div>

      {editing ? (
        <div class="recall-repair-editor">
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
          <fieldset>
            <legend>What changed?</legend>
            <label>
              <input
                type="radio"
                name={`change-${card.id}`}
                checked={changeKind === 'wording'}
                onChange={() => setChangeKind('wording')}
              />
              Wording only <small>Keeps the current FSRS schedule.</small>
            </label>
            <label>
              <input
                type="radio"
                name={`change-${card.id}`}
                checked={changeKind === 'semantic'}
                onChange={() => setChangeKind('semantic')}
              />
              Meaning changed <small>Resets scheduling; preserves review history.</small>
            </label>
          </fieldset>
          <label>
            Repair note{' '}
            <input
              value={reason}
              onInput={(event) => setReason((event.target as HTMLInputElement).value)}
              placeholder="Optional reason for the audit trail"
            />
          </label>
          <div class="recall-repair-actions">
            <button class="button quiet" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              class="button primary"
              type="button"
              onClick={save}
              disabled={Boolean(working) || !question.trim() || !answer.trim()}
            >
              Save repair
            </button>
          </div>
        </div>
      ) : (
        <div class="recall-repair-content">
          <h3 lang="ar" dir="rtl">
            {card.question}
          </h3>
          <p lang="ar" dir="rtl">
            {card.answer}
          </p>
        </div>
      )}

      <div class="recall-repair-links">
        {card.note_id && <a href={noteHref(card.note_id)}>Open source note</a>}
        {sourceAnchorHref && <a href={sourceAnchorHref}>Open source anchor</a>}
        {card.unit_statement && <span>{card.unit_statement}</span>}
      </div>

      {showHistory && (
        <section class="recall-repair-detail" aria-label="Card history">
          <h4>Review history</h4>
          {card.review_history.length ? (
            <ol>
              {card.review_history.map((event) => (
                <li key={event.id}>
                  <strong>{gradeLabel(event.grade)}</strong>
                  <span>
                    {formatDate(event.reviewed_at)}
                    {event.next_due ? ` · next ${formatDate(event.next_due)}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>No review attempts recorded.</p>
          )}
          {card.repair_history.length ? (
            <>
              <h4>Repair history</h4>
              <ol>
                {card.repair_history.map((event) => (
                  <li key={event.id}>
                    <strong>
                      {event.action}
                      {event.change_kind ? ` · ${event.change_kind}` : ''}
                    </strong>
                    <span>
                      {event.reason || 'Learner action'} · {formatDate(event.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      )}
      {showCompare && (
        <section class="recall-repair-detail" aria-label="Potentially interfering cards">
          <h4>Compare manually</h4>
          {card.comparison_candidates.length ? (
            <ul>
              {card.comparison_candidates.map((candidate) => (
                <li key={candidate.id}>
                  <a href={cardHref(candidate.id)} lang="ar" dir="rtl">
                    {candidate.question}
                  </a>
                  <span>{candidate.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No nearby cards share this Unit, branch, or topic.</p>
          )}
        </section>
      )}
      {showSplit && (
        <section class="recall-split-editor">
          <h4>Write one smaller card</h4>
          <p>
            This creates one learner-authored card at a time. The original remains unchanged until you pause or retire
            it.
          </p>
          <label>
            Question in Arabic
            <textarea
              lang="ar"
              dir="rtl"
              value={splitQuestion}
              onInput={(event) => setSplitQuestion((event.target as HTMLTextAreaElement).value)}
            />
          </label>
          <label>
            Answer in Arabic
            <textarea
              lang="ar"
              dir="rtl"
              value={splitAnswer}
              onInput={(event) => setSplitAnswer((event.target as HTMLTextAreaElement).value)}
            />
          </label>
          <div>
            <button class="button quiet" type="button" onClick={() => setShowSplit(false)}>
              Cancel
            </button>
            <button
              class="button secondary"
              type="button"
              onClick={createSplitCard}
              disabled={Boolean(working) || !splitQuestion.trim() || !splitAnswer.trim()}
            >
              Add learner-authored card
            </button>
          </div>
        </section>
      )}

      {!editing && (
        <footer class="recall-repair-actions">
          <div>
            <button class="button quiet" type="button" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? 'Hide history' : 'History'}
            </button>
            <button class="button quiet" type="button" onClick={() => setShowCompare(!showCompare)}>
              {showCompare ? 'Hide comparison' : 'Compare'}
            </button>
            <button class="button quiet" type="button" onClick={() => setShowSplit(!showSplit)}>
              Split manually
            </button>
          </div>
          <div>
            <button class="button quiet" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
            {isPaused ? (
              <button
                class="button secondary"
                type="button"
                onClick={() => setStatus('active')}
                disabled={Boolean(working)}
              >
                Resume
              </button>
            ) : (
              <button
                class="button secondary"
                type="button"
                onClick={() => setStatus('paused')}
                disabled={Boolean(working)}
              >
                Pause
              </button>
            )}
            <button class="button quiet" type="button" onClick={reset} disabled={Boolean(working)}>
              Reset schedule
            </button>
            <button
              class="button quiet danger"
              type="button"
              onClick={() => setStatus('retired')}
              disabled={Boolean(working)}
            >
              Retire
            </button>
          </div>
        </footer>
      )}
    </article>
  )
}

function gradeLabel(grade: number) {
  if (grade <= 0) return 'Again'
  if (grade <= 2) return 'Hard'
  if (grade <= 4) return 'Good'
  return 'Easy'
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
      <Empty title="No drafts waiting" body="Drafts appear only after an explicit learner-authored recall action." />
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
  const [working, setWorking] = useState('')
  const status = card.repair_status
  const changeStatus = async (next: 'active' | 'paused' | 'retired') => {
    if (next === 'retired' && !window.confirm('Retire this card while preserving its review history?')) return
    setWorking(next)
    try {
      await api(`/learning/srs/cards/${encodeURIComponent(card.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next, ...recallPrecondition(card) }),
      })
      setMessage(
        next === 'active' ? 'Card restored to active review.' : next === 'paused' ? 'Card paused.' : 'Card retired.',
      )
      reload()
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Status change failed.')
    } finally {
      setWorking('')
    }
  }
  return (
    <article class="recall-library-row">
      <div>
        <SourceLine item={card} />
        <a class="item-title-link" href={cardHref(card.id)} lang="ar" dir="rtl">
          <strong>{card.question}</strong>
        </a>
        <small>
          {status === 'active' ? `Due ${formatDate(card.due_at)}` : status} · {card.repetitions || 0} reviews ·{' '}
          {card.lapses || 0} lapses
        </small>
      </div>
      <div>
        {card.note_id && (
          <a class="button quiet" href={noteHref(card.note_id)}>
            Note
          </a>
        )}
        {status === 'active' ? (
          <>
            <button
              class="button quiet"
              type="button"
              onClick={() => changeStatus('paused')}
              disabled={Boolean(working)}
            >
              Pause
            </button>
            <button
              class="button quiet"
              type="button"
              onClick={() => changeStatus('retired')}
              disabled={Boolean(working)}
            >
              Retire
            </button>
          </>
        ) : (
          <button class="button quiet" type="button" onClick={() => changeStatus('active')} disabled={Boolean(working)}>
            {status === 'retired' ? 'Restore' : 'Resume'}
          </button>
        )}
      </div>
    </article>
  )
}
