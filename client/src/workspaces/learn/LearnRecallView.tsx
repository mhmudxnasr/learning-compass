import { useState } from 'preact/hooks'
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

  const dueCards = due.data?.cards || []
  const activeCard = dueCards.find((card) => card.id === activeId) || dueCards[0]
  const review = async (grade: number) => {
    if (!activeCard || !revealed) return
    setWorking(true)
    setMessage('Saving review…')
    try {
      await api('/learning/srs/review', { method: 'POST', body: JSON.stringify({ card_id: activeCard.id, grade }) })
      const next = dueCards.find((card) => card.id !== activeCard.id)
      setActiveId(next?.id || null)
      setRevealed(false)
      setMessage('Review recorded.')
      due.reload()
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
        : <Empty title="Nothing is due" body="Approved cards will appear here when their FSRS schedule says it is time to retrieve them. A source opening or a rating does not count as recall evidence." />

  return <section class="learn-workspace folio-learn folio-recall" aria-labelledby="recall-title">
    <header class="learn-surface-head folio-surface-head"><div><p class="folio-object-kicker">Learn / Recall</p><h1 id="recall-title">Retrieve before you reread.</h1><p class="folio-lede">One prompt first. Card administration stays below the current retrieval action so the review remains the work.</p></div><span class="folio-measure">{dueCards.length} due today</span></header>
    {message && <output class="folio-status" aria-live="polite">{message}</output>}
    <section class="folio-review-stage" aria-labelledby="review-stage-title"><div class="folio-section-head"><div><p class="folio-object-kicker">Current review</p><h3 id="review-stage-title">Active recall</h3></div><span class="folio-measure">FSRS-6</span></div>{reviewView}</section>
    <DraftsSection drafts={drafts.data?.drafts || []} loading={drafts.loading && !drafts.data} error={drafts.error} reload={drafts.reload} />
    <CardsSection cards={cards.data?.cards || []} loading={cards.loading && !cards.data} error={cards.error} reload={cards.reload} />
  </section>
}
function ReviewCard({ card, revealed, onReveal, onReview, working }: { card: RecallCard; revealed: boolean; onReveal: () => void; onReview: (grade: number) => void; working: boolean }) {
  return <article class="folio-recall-card" aria-labelledby="recall-prompt"><div class="folio-recall-card-head"><span class="folio-row-type">{card.topic || 'General'} · Due {formatDate(card.due_at)}</span><span class="folio-measure">{card.repetitions || 0} reviews</span></div><h4 id="recall-prompt">{card.question}</h4>{revealed ? <div class="folio-recall-answer"><p class="folio-object-kicker">Answer</p><p>{card.answer}</p></div> : <button class="button primary folio-primary" type="button" onClick={onReveal}>Reveal answer</button>}{revealed && <div class="folio-grade-actions" aria-label="Score recall from 0 to 5"><span>How well did you retrieve it?</span><div>{[0, 1, 2, 3, 4, 5].map((grade) => <button key={grade} class={`button ${grade >= 4 ? 'primary' : 'secondary'}`} type="button" onClick={() => onReview(grade)} disabled={working}>{grade === 0 ? '0 · Again' : grade === 2 ? '2 · Hard' : grade === 4 ? '4 · Good' : grade === 5 ? '5 · Easy' : String(grade)}</button>)}</div></div>}</article>
}

function DraftsSection({ drafts, loading, error, reload }: { drafts: RecallDraft[]; loading: boolean; error: string; reload: () => void }) {
  const pending = drafts.filter((draft) => draft.status === 'draft')
  return <section class="folio-admin-section" aria-labelledby="drafts-title"><div class="folio-section-head"><div><p class="folio-object-kicker">Progressive disclosure</p><h3 id="drafts-title">Recall drafts</h3></div><span class="folio-measure">{pending.length} awaiting approval</span></div><p class="folio-section-note">Ratings from 7–10 can create editable drafts. They never become review cards until you approve them here.</p>{loading ? <Loading label="Loading recall drafts" /> : error ? <ErrorState message={error} retry={reload} /> : pending.length ? <div class="folio-draft-ledger">{pending.map((draft) => <DraftEditor key={draft.id} draft={draft} onChanged={reload} />)}</div> : <p class="folio-empty-line">No drafts are waiting for a decision.</p>}</section>
}

function DraftEditor({ draft, onChanged }: { draft: RecallDraft; onChanged: () => void }) {
  const [question, setQuestion] = useState(draft.question)
  const [answer, setAnswer] = useState(draft.answer)
  const [topic, setTopic] = useState(draft.topic || '')
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')
  const save = async () => {
    setWorking('save')
    setMessage('Saving draft…')
    try {
      await api(`/srs/drafts/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: JSON.stringify({ question: question.trim(), answer: answer.trim(), topic: topic.trim() }) })
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
  return <article class="folio-draft-row"><div class="folio-draft-context"><span class="folio-row-type">Draft · approval required</span><small>{draft.created_at ? `Created ${formatDate(draft.created_at)}` : 'Generated from learning evidence'}</small></div><label>Question<textarea value={question} onInput={(event) => setQuestion((event.target as HTMLTextAreaElement).value)} /></label><label>Answer<textarea value={answer} onInput={(event) => setAnswer((event.target as HTMLTextAreaElement).value)} /></label><label>Topic<input value={topic} onInput={(event) => setTopic((event.target as HTMLInputElement).value)} /></label><div class="folio-draft-actions"><button class="button secondary" type="button" onClick={save} disabled={Boolean(working) || !question.trim() || !answer.trim()}>{working === 'save' ? 'Saving…' : 'Save edits'}</button><button class="button primary folio-primary" type="button" onClick={approve} disabled={Boolean(working) || !question.trim() || !answer.trim()}>{working === 'approve' ? 'Approving…' : 'Approve for Review'}</button><button class="button quiet" type="button" onClick={reject} disabled={Boolean(working)}>Reject</button>{message && <output aria-live="polite">{message}</output>}</div></article>
}

function CardsSection({ cards, loading, error, reload }: { cards: RecallCard[]; loading: boolean; error: string; reload: () => void }) {
  return <details class="folio-admin-section folio-card-admin"><summary><span><span class="folio-object-kicker">Progressive disclosure</span><strong>Approved cards</strong></span><span class="folio-measure">{cards.length} active</span></summary>{loading ? <Loading label="Loading approved cards" /> : error ? <ErrorState message={error} retry={reload} /> : cards.length ? <ul class="folio-card-ledger">{cards.map((card) => <CardRow key={card.id} card={card} reload={reload} />)}</ul> : <p class="folio-empty-line">No approved cards yet. Approve an editable draft after reviewing its question and answer.</p>}</details>
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
  return <li><span><strong>{card.question}</strong><small>{card.topic || 'General'} · due {formatDate(card.due_at)}</small></span><button class="button quiet" type="button" onClick={remove} disabled={working}>{working ? 'Deleting…' : 'Delete'}</button></li>
}
