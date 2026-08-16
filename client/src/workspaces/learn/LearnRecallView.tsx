import { useState, useMemo } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { useData } from '../../app/useData'
import { formatDate } from './helpers'
import { CardsResponse, DraftsResponse, DueResponse, RecallCard, RecallDraft } from './types'

export function LearnRecallView() {
  const due = useData<DueResponse>('/learning/srs/due')
  const drafts = useData<DraftsResponse>('/srs/drafts')
  const cards = useData<CardsResponse>('/learning/srs/cards')

  const [activeId, setActiveId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  // Hierarchical Filter State
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const dueCards = due.data?.cards || []
  const allDrafts = drafts.data?.drafts || []
  const allCards = cards.data?.cards || []

  // Extract all distinct branches across due cards, drafts, and approved cards
  const availableBranches = useMemo(() => {
    const branchSet = new Set<string>()
    for (const c of dueCards) if (c.branch) branchSet.add(c.branch)
    for (const d of allDrafts) if (d.branch) branchSet.add(d.branch)
    for (const c of allCards) if (c.branch) branchSet.add(c.branch)
    return Array.from(branchSet).sort()
  }, [dueCards, allDrafts, allCards])

  // Filter due cards according to selected branch & search query
  const filteredDueCards = useMemo(() => {
    return dueCards.filter((card) => {
      const matchBranch = selectedBranch === 'all' || (card.branch || 'General') === selectedBranch
      const query = searchQuery.trim().toLowerCase()
      const matchQuery =
        !query ||
        card.question.toLowerCase().includes(query) ||
        card.answer.toLowerCase().includes(query) ||
        (card.topic || '').toLowerCase().includes(query) ||
        (card.source_title || '').toLowerCase().includes(query) ||
        (card.branch || '').toLowerCase().includes(query)
      return matchBranch && matchQuery
    })
  }, [dueCards, selectedBranch, searchQuery])

  const activeCard = filteredDueCards.find((card) => card.id === activeId) || filteredDueCards[0]

  const review = async (grade: number) => {
    if (!activeCard || !revealed) return
    setWorking(true)
    setMessage('Saving review…')
    try {
      await api('/learning/srs/review', { method: 'POST', body: JSON.stringify({ card_id: activeCard.id, grade }) })
      const next = filteredDueCards.find((card) => card.id !== activeCard.id)
      setActiveId(next?.id || null)
      setRevealed(false)
      setMessage('Review recorded.')
      due.reload()
      cards.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The review could not be saved.')
    } finally {
      setWorking(false)
    }
  }

  const reviewView = due.error && !due.data
    ? <ErrorState message={due.error} retry={due.reload} />
    : due.loading && !due.data
      ? <Loading label="Loading due recall" />
      : activeCard
        ? <ReviewCard card={activeCard} revealed={revealed} onReveal={() => setRevealed(true)} onReview={review} working={working} />
        : <Empty
            title={selectedBranch !== 'all' || searchQuery ? 'No cards match this filter' : 'Nothing is due'}
            body={
              selectedBranch !== 'all' || searchQuery
                ? 'Try clearing the branch filter or search query to see other due cards.'
                : 'Approved cards will appear here when their FSRS schedule says it is time to retrieve them.'
            }
          />

  return (
    <section class="learn-workspace folio-learn folio-recall" aria-labelledby="recall-title">
      <header class="learn-surface-head folio-surface-head">
        <div>
          <p class="folio-object-kicker">Learn / Recall</p>
          <h1 id="recall-title">Retrieve before you reread.</h1>
          <p class="folio-lede">
            Atomic recall questions organized by branch and topic, scheduled via FSRS-6.
          </p>
        </div>
        <span class="folio-measure">{dueCards.length} due today</span>
      </header>

      {message && <output class="folio-status" aria-live="polite">{message}</output>}

      {/* Hierarchical Filter Bar */}
      <nav class="folio-filter-bar" aria-label="Filter recall cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', margin: '0 0 1.25rem 0' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            class={`button ${selectedBranch === 'all' ? 'primary folio-primary' : 'secondary'}`}
            style={{ fontSize: '0.82rem', padding: '0.25rem 0.65rem' }}
            onClick={() => { setSelectedBranch('all'); setActiveId(null) }}
          >
            All Branches ({dueCards.length})
          </button>
          {availableBranches.map((b) => {
            const count = dueCards.filter((c) => (c.branch || 'General') === b).length
            return (
              <button
                key={b}
                type="button"
                class={`button ${selectedBranch === b ? 'primary folio-primary' : 'secondary'}`}
                style={{ fontSize: '0.82rem', padding: '0.25rem 0.65rem' }}
                onClick={() => { setSelectedBranch(b); setActiveId(null) }}
              >
                {b} {count > 0 ? `(${count})` : ''}
              </button>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <input
            type="search"
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            placeholder="Filter topic or note…"
            style={{ fontSize: '0.82rem', padding: '0.25rem 0.5rem', minWidth: '180px' }}
          />
        </div>
      </nav>

      <section class="folio-review-stage" aria-labelledby="review-stage-title">
        <div class="folio-section-head">
          <div>
            <p class="folio-object-kicker">Current review</p>
            <h3 id="review-stage-title">Active recall</h3>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {selectedBranch !== 'all' && <span class="folio-row-type" style={{ margin: 0 }}>Branch: {selectedBranch}</span>}
            <span class="folio-measure">FSRS-6</span>
          </div>
        </div>
        {reviewView}
      </section>

      <DraftsSection
        drafts={allDrafts}
        loading={drafts.loading && !drafts.data}
        error={drafts.error}
        reload={drafts.reload}
        filterBranch={selectedBranch}
        searchQuery={searchQuery}
      />

      <CardsSection
        cards={allCards}
        loading={cards.loading && !cards.data}
        error={cards.error}
        reload={cards.reload}
        filterBranch={selectedBranch}
        searchQuery={searchQuery}
      />
    </section>
  )
}

function ReviewCard({
  card,
  revealed,
  onReveal,
  onReview,
  working
}: {
  card: RecallCard
  revealed: boolean
  onReveal: () => void
  onReview: (grade: number) => void
  working: boolean
}) {
  return (
    <article class="folio-recall-card" aria-labelledby="recall-prompt">
      <div class="folio-recall-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          {card.branch && <span class="folio-row-type" style={{ fontWeight: 600, background: 'rgba(0,0,0,0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>{card.branch}</span>}
          {card.topic && <span class="folio-row-type" style={{ background: 'rgba(0,0,0,0.03)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>{card.topic}</span>}
          {card.source_title && <small style={{ opacity: 0.75, fontStyle: 'italic' }}>From: {card.source_title}</small>}
        </div>
        <span class="folio-measure">{card.repetitions || 0} reviews · Due {formatDate(card.due_at)}</span>
      </div>

      <h4 id="recall-prompt" style={{ margin: '1rem 0' }}>{card.question}</h4>

      {revealed ? (
        <div class="folio-recall-answer">
          <p class="folio-object-kicker">Answer</p>
          <p>{card.answer}</p>
        </div>
      ) : (
        <button class="button primary folio-primary" type="button" onClick={onReveal}>
          Reveal answer
        </button>
      )}

      {revealed && (
        <div class="folio-grade-actions" aria-label="Score recall from 0 to 5">
          <span>How well did you retrieve it?</span>
          <div>
            {[0, 1, 2, 3, 4, 5].map((grade) => (
              <button
                key={grade}
                class={`button ${grade >= 4 ? 'primary' : 'secondary'}`}
                type="button"
                onClick={() => onReview(grade)}
                disabled={working}
              >
                {grade === 0 ? '0 · Again' : grade === 2 ? '2 · Hard' : grade === 4 ? '4 · Good' : grade === 5 ? '5 · Easy' : String(grade)}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function DraftsSection({
  drafts,
  loading,
  error,
  reload,
  filterBranch,
  searchQuery
}: {
  drafts: RecallDraft[]
  loading: boolean
  error: string
  reload: () => void
  filterBranch: string
  searchQuery: string
}) {
  const pending = drafts.filter((draft) => draft.status === 'draft')
  const filteredDrafts = useMemo(() => {
    return pending.filter((draft) => {
      const matchBranch = filterBranch === 'all' || (draft.branch || 'General') === filterBranch
      const query = searchQuery.trim().toLowerCase()
      const matchQuery =
        !query ||
        draft.question.toLowerCase().includes(query) ||
        draft.answer.toLowerCase().includes(query) ||
        (draft.topic || '').toLowerCase().includes(query) ||
        (draft.source_title || '').toLowerCase().includes(query) ||
        (draft.branch || '').toLowerCase().includes(query)
      return matchBranch && matchQuery
    })
  }, [pending, filterBranch, searchQuery])

  const [generateOpen, setGenerateOpen] = useState(false)
  const [customBranch, setCustomBranch] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [customText, setCustomText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genMessage, setGenMessage] = useState('')

  const handleGenerate = async (e: Event) => {
    e.preventDefault()
    if (!customText.trim()) return
    setGenerating(true)
    setGenMessage('Generating recall cards with Gemini Flash Lite…')
    try {
      const res = await api<{ ok: boolean; count: number; message?: string }>('/learning/srs/generate', {
        method: 'POST',
        body: JSON.stringify({
          content: customText.trim(),
          branch: customBranch.trim() || undefined,
          topic: customTopic.trim() || undefined
        })
      })
      if (res.count > 0) {
        setGenMessage(`Extracted ${res.count} atomic cards into drafts.`)
        setCustomText('')
        setCustomTopic('')
        setCustomBranch('')
        setGenerateOpen(false)
        reload()
      } else {
        setGenMessage(res.message || 'No conceptual cards extracted.')
      }
    } catch (err: unknown) {
      setGenMessage(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section class="folio-admin-section" aria-labelledby="drafts-title">
      <div class="folio-section-head">
        <div>
          <p class="folio-object-kicker">Progressive disclosure</p>
          <h3 id="drafts-title">Recall drafts</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button class="button secondary" type="button" onClick={() => setGenerateOpen(!generateOpen)}>
            {generateOpen ? 'Close' : '+ Generate from text'}
          </button>
          <span class="folio-measure">{filteredDrafts.length} awaiting decision</span>
        </div>
      </div>

      {genMessage && <output class="folio-status" aria-live="polite">{genMessage}</output>}

      {generateOpen && (
        <form class="folio-inline-form" onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', margin: '0.75rem 0 1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
            <label>
              Branch / Pillar (Macro)
              <input
                value={customBranch}
                onInput={(e) => setCustomBranch((e.target as HTMLInputElement).value)}
                placeholder="e.g. Pillars of Islam, System Dynamics"
              />
            </label>
            <label>
              Topic / Concept (Micro)
              <input
                value={customTopic}
                onInput={(e) => setCustomTopic((e.target as HTMLInputElement).value)}
                placeholder="e.g. Salah, Feedback Loops"
              />
            </label>
          </div>
          <label>
            Source text to extract cards from
            <textarea
              value={customText}
              onInput={(e) => setCustomText((e.target as HTMLTextAreaElement).value)}
              placeholder="Paste note content, book summary, or concept explanation here..."
              rows={4}
              required
            />
          </label>
          <button class="button primary folio-primary" type="submit" disabled={generating || !customText.trim()}>
            {generating ? 'Extracting with Gemini…' : 'Extract atomic cards (Gemini Flash Lite)'}
          </button>
        </form>
      )}

      <p class="folio-section-note">
        Editable drafts generated from notes or Gemini Flash Lite. Tagged with source note, pillar branch, and micro topic.
      </p>

      {loading ? (
        <Loading label="Loading recall drafts" />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : filteredDrafts.length ? (
        <div class="folio-draft-ledger">
          {filteredDrafts.map((draft) => (
            <DraftEditor key={draft.id} draft={draft} onChanged={reload} />
          ))}
        </div>
      ) : (
        <p class="folio-empty-line">No drafts are waiting for a decision.</p>
      )}
    </section>
  )
}

function DraftEditor({ draft, onChanged }: { draft: RecallDraft; onChanged: () => void }) {
  const [question, setQuestion] = useState(draft.question)
  const [answer, setAnswer] = useState(draft.answer)
  const [branch, setBranch] = useState(draft.branch || '')
  const [topic, setTopic] = useState(draft.topic || '')
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')

  const save = async () => {
    setWorking('save')
    setMessage('Saving draft…')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          topic: topic.trim(),
          branch: branch.trim() || undefined
        })
      })
      setMessage('Draft saved.')
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The draft could not be saved.')
    } finally {
      setWorking('')
    }
  }

  const approve = async () => {
    if (!question.trim() || !answer.trim()) return
    setWorking('approve')
    setMessage('Approving card…')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}/approve`, { method: 'POST' })
      setMessage('Approved and added to Review.')
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The draft could not be approved.')
    } finally {
      setWorking('')
    }
  }

  const reject = async () => {
    setWorking('reject')
    setMessage('Rejecting draft…')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}/reject`, { method: 'POST' })
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The draft could not be rejected.')
    } finally {
      setWorking('')
    }
  }

  return (
    <article class="folio-draft-row">
      <div class="folio-draft-context" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
        <span class="folio-row-type">Draft</span>
        {draft.branch && <span class="folio-row-type" style={{ fontWeight: 600, background: 'rgba(0,0,0,0.06)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{draft.branch}</span>}
        {draft.topic && <span class="folio-row-type" style={{ background: 'rgba(0,0,0,0.03)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{draft.topic}</span>}
        {draft.source_title && <small style={{ opacity: 0.8, fontStyle: 'italic' }}>From: {draft.source_title}</small>}
        <small style={{ marginLeft: 'auto' }}>{draft.created_at ? formatDate(draft.created_at) : ''}</small>
      </div>

      <label>
        Question
        <textarea value={question} onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label>
        Answer
        <textarea value={answer} onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
        <label>
          Branch / Pillar
          <input value={branch} onInput={(e) => setBranch((e.target as HTMLInputElement).value)} placeholder="e.g. Pillars of Islam" />
        </label>
        <label>
          Topic / Concept
          <input value={topic} onInput={(e) => setTopic((e.target as HTMLInputElement).value)} placeholder="e.g. Salah" />
        </label>
      </div>

      <div class="folio-draft-actions">
        <button class="button secondary" type="button" onClick={save} disabled={Boolean(working) || !question.trim() || !answer.trim()}>
          {working === 'save' ? 'Saving…' : 'Save edits'}
        </button>
        <button class="button primary folio-primary" type="button" onClick={approve} disabled={Boolean(working) || !question.trim() || !answer.trim()}>
          {working === 'approve' ? 'Approving…' : 'Approve for Review'}
        </button>
        <button class="button quiet" type="button" onClick={reject} disabled={Boolean(working)}>
          Reject
        </button>
        {message && <output aria-live="polite">{message}</output>}
      </div>
    </article>
  )
}

function CardsSection({
  cards,
  loading,
  error,
  reload,
  filterBranch,
  searchQuery
}: {
  cards: RecallCard[]
  loading: boolean
  error: string
  reload: () => void
  filterBranch: string
  searchQuery: string
}) {
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchBranch = filterBranch === 'all' || (card.branch || 'General') === filterBranch
      const query = searchQuery.trim().toLowerCase()
      const matchQuery =
        !query ||
        card.question.toLowerCase().includes(query) ||
        card.answer.toLowerCase().includes(query) ||
        (card.topic || '').toLowerCase().includes(query) ||
        (card.source_title || '').toLowerCase().includes(query) ||
        (card.branch || '').toLowerCase().includes(query)
      return matchBranch && matchQuery
    })
  }, [cards, filterBranch, searchQuery])

  return (
    <details class="folio-admin-section folio-card-admin">
      <summary>
        <span>
          <span class="folio-object-kicker">Progressive disclosure</span>
          <strong>Approved cards ({filteredCards.length})</strong>
        </span>
        <span class="folio-measure">{cards.length} total in deck</span>
      </summary>
      {loading ? (
        <Loading label="Loading approved cards" />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : filteredCards.length ? (
        <ul class="folio-card-ledger">
          {filteredCards.map((card) => (
            <CardRow key={card.id} card={card} reload={reload} />
          ))}
        </ul>
      ) : (
        <p class="folio-empty-line">No approved cards match this view.</p>
      )}
    </details>
  )
}

function CardRow({ card, reload }: { card: RecallCard; reload: () => void }) {
  const [working, setWorking] = useState(false)
  const remove = async () => {
    if (!window.confirm(`Delete the recall card “${card.question}”?`)) return
    setWorking(true)
    try {
      await api(`/learning/srs/cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' })
      reload()
    } catch {
      setWorking(false)
    }
  }

  return (
    <li>
      <span>
        <strong>{card.question}</strong>
        <small style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.2rem' }}>
          {card.branch && <span style={{ fontWeight: 600 }}>{card.branch}</span>}
          {card.topic && <span>{card.topic}</span>}
          {card.source_title && <span>· From: {card.source_title}</span>}
          <span>· due {formatDate(card.due_at)}</span>
        </small>
      </span>
      <button class="button quiet" type="button" onClick={remove} disabled={working}>
        {working ? 'Deleting…' : 'Delete'}
      </button>
    </li>
  )
}
