import { objectHref, routeHref, useRoute, Route } from '../app/router'
import { useData } from '../app/useData'
import { ItemParentLinks } from '../components/ItemSections'
import { api } from '../api'
import { Empty, ErrorState, Loading } from '../components/States'
import { useEffect, useState } from 'preact/hooks'
import { LearnNotesView } from './learn/LearnNotesView'
import { LearnPathsView } from './learn/LearnPathsView'
import { LearnRecallView } from './learn/LearnRecallView'
import { LearnThreadView } from './learn/LearnThreadView'
import { LearnCanonView } from './learn/LearnCanonView'
import { LearnContradictionsView } from './learn/LearnContradictionsView'
import { shareIntakeCompletionKind, type ShareIntake } from '../app/ShareIntakeReviewDialog'

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
  return <>
    <nav class="workspace-mode-switcher workspace-local-nav" aria-label="Learn sections">
    {learnModes.map((item) => {
      const href = item.key === 'paths' ? routeHref('learn', 'paths') : routeHref('learn', 'practice', 'notes')
      return <a key={item.key} href={href} class={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
        <strong>{item.label}</strong><small>{item.description}</small>
      </a>
    })}
    </nav>
    {active === 'practice' && <nav class="workspace-filter-switcher workspace-local-nav practice-filter-nav" aria-label="Practice modes">
      {practiceFilters.map((item) => <a key={item.key} href={routeHref('learn', 'practice', item.key)} class={practiceFocus === item.key ? 'active' : ''} aria-current={practiceFocus === item.key ? 'page' : undefined}>
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
  const practiceFocus: PracticeFocus = activeRoute.objectType === 'note' || routeFocus === 'notes' || routeMode === 'notes' ? 'notes' : routeFocus === 'contradictions' || routeMode === 'contradictions' ? 'contradictions' : 'recall'
  const activeMode: LearnMode = activeRoute.objectType === 'note' || routeMode === 'practice' || routeMode === 'notes' || routeMode === 'recall' ? 'practice' : 'paths'
  const annotationId = activeRoute.query.get('annotation') || ''
  const incomingAnchorUrl = activeRoute.query.get('anchor_url') || ''
  const incomingAnchorQuote = activeRoute.query.get('anchor_quote') || ''
  const incomingAnchorTitle = activeRoute.query.get('anchor_title') || ''
  const incomingAnchorError = activeRoute.query.get('anchor_error') || ''
  const incomingAnchorLength = Number(activeRoute.query.get('anchor_length') || 0)
  const shareIntakeId = activeRoute.query.get('share_intake') || ''
  const hasAnchorAction = Boolean(shareIntakeId || annotationId || (incomingAnchorUrl && incomingAnchorQuote))

  const content = incomingAnchorError === 'selection_too_large'
    ? <Empty title="Selection is too long to anchor" body={`The selected passage has ${Number.isFinite(incomingAnchorLength) ? incomingAnchorLength.toLocaleString() : 'more than 10,000'} characters. Source anchors preserve exact passages and accept at most 10,000, so nothing was truncated or saved.`} action={<a class="button secondary" href="#/learn?mode=practice&focus=notes">Return to Notes</a>} />
    : shareIntakeId ? <ShareAnchorLearningAction shareIntakeId={shareIntakeId} />
    : hasAnchorAction ? <SourceAnchorLearningAction annotationId={annotationId} incomingUrl={incomingAnchorUrl} incomingQuote={incomingAnchorQuote} incomingTitle={incomingAnchorTitle} />
    : activeRoute.objectType === 'thread' && activeRoute.objectId ? <LearnThreadView threadId={activeRoute.objectId} tab={activeRoute.query.get('tab') || undefined} focusLevelId={activeRoute.query.get('level') || undefined} />
    : activeRoute.objectType === 'level' && activeRoute.objectId && activeRoute.parentObjectId ? <LearnThreadView threadId={activeRoute.parentObjectId} levelId={activeRoute.objectId} />
    : activeRoute.objectType === 'lesson' && activeRoute.objectId && activeRoute.parentObjectId ? <LearnThreadView threadId={activeRoute.parentObjectId} lessonId={activeRoute.objectId} />
    : activeRoute.objectType === 'unit' && activeRoute.objectId ? <LearnUnitView unitId={activeRoute.objectId} />
      : activeRoute.objectType === 'card' && activeRoute.objectId ? <LearnCardView cardId={activeRoute.objectId} />
    : activeRoute.objectType === 'note' && activeRoute.objectId ? <LearnNotesView noteId={activeRoute.objectId} />
      : activeRoute.objectType === 'canon-domain' && activeRoute.objectId ? <LearnCanonView domainId={activeRoute.objectId} />
    : activeMode === 'practice' && practiceFocus === 'notes' ? <LearnNotesView noteId={activeRoute.query.get('note') || undefined} />
        : activeMode === 'practice' && practiceFocus === 'contradictions' ? <LearnContradictionsView />
        : activeMode === 'practice' ? <LearnRecallView />
          : <LearnPathsView />
  const showSwitcher = !['thread', 'level', 'lesson', 'canon-domain'].includes(activeRoute.objectType || '')
  return <div class="learn-workspace-shell workspace-surface">{showSwitcher && <LearnModeSwitcher active={activeMode} practiceFocus={practiceFocus} />}{content}</div>
}

type SourceAnnotation = {
  id: string
  recommendation_id: string
  artifact_id?: string | null
  thread_id?: string | null
  branch_id?: string | null
  branch_label?: string | null
  locator_type: string
  selector?: Record<string, any>
  quote: string
  context_before?: string | null
  context_after?: string | null
  language?: string | null
  source_checksum?: string | null
  source_title?: string | null
  source_url?: string | null
  status?: string
}

type AnchorAction = 'note' | 'unit' | 'card' | ''

type ShareAnchorIntake = ShareIntake & {
  recoverable_annotation_id?: string | null
}

function annotationLocator(annotation: SourceAnnotation) {
  return String(annotation.selector?.locator || annotation.selector?.url || annotation.source_url || 'Exact source passage')
}

function unitAnchorType(locatorType: string) {
  if (locatorType === 'video') return 'timestamp'
  if (locatorType === 'pdf') return 'page'
  if (locatorType === 'web') return 'url_fragment'
  if (locatorType === 'text') return 'quote'
  return 'section'
}

function ShareAnchorLearningAction({ shareIntakeId }: { shareIntakeId: string }) {
  const intakeState = useData<{ intake: ShareAnchorIntake }>(`/api/share-intakes/${encodeURIComponent(shareIntakeId)}`)
  const intake = intakeState.data?.intake
  const completionKind = shareIntakeCompletionKind(intake)
  const recoverableAnnotationId = intake?.annotation_id || intake?.recoverable_annotation_id || ''

  useEffect(() => {
    if (!intake || completionKind !== 'anchor' || intake.status !== 'pending' || !recoverableAnnotationId) return
    api(`/api/share-intakes/${encodeURIComponent(intake.id)}/consume`, {
      method: 'POST', body: JSON.stringify({ annotation_id: recoverableAnnotationId }),
    }).then(intakeState.reload).catch(() => undefined)
  }, [intake?.id, completionKind, intake?.status, recoverableAnnotationId])

  if (intakeState.loading && !intake) return <Loading label="Recovering shared passage" />
  if (intakeState.error && !intake) return <ErrorState message={intakeState.error} retry={intakeState.reload} />
  if (!intake || completionKind !== 'anchor') return <Empty title="Shared passage unavailable" body="This share receipt is missing or does not contain an anchored passage." action={<a class="button secondary" href="#/learn?mode=practice&focus=notes">Return to Notes</a>} />
  if (intake.status === 'consumed' && !recoverableAnnotationId) return <Empty title="Shared passage completed" body="Its saved source anchor is no longer available." action={<a class="button secondary" href="#/learn?mode=practice&focus=notes">Return to Notes</a>} />
  return <SourceAnchorLearningAction
    annotationId={recoverableAnnotationId}
    incomingUrl={intake.source_url || ''}
    incomingQuote={intake.shared_text || ''}
    incomingTitle={intake.title || ''}
    shareIntakeId={intake.status === 'pending' ? intake.id : ''}
  />
}

function SourceAnchorLearningAction({ annotationId, incomingUrl, incomingQuote, incomingTitle, shareIntakeId = '' }: { annotationId: string; incomingUrl: string; incomingQuote: string; incomingTitle: string; shareIntakeId?: string }) {
  const [savedId, setSavedId] = useState('')
  const [action, setAction] = useState<AnchorAction>('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)
  const effectiveId = annotationId || savedId
  const annotationState = useData<{ annotation: SourceAnnotation }>(effectiveId ? `/annotations/${encodeURIComponent(effectiveId)}` : undefined)
  const resolution = useData<{ found: boolean; source?: { id: string; title?: string; url?: string; creator?: string; content_type?: string; branch_id?: string; branch_label?: string; branch_status?: string; branch_verified?: boolean; thread_id?: string } }>(!effectiveId && incomingUrl ? `/annotations/resolve?source_url=${encodeURIComponent(incomingUrl)}` : undefined)

  useEffect(() => {
    setSavedId('')
    setAction('')
    setNotice('')
  }, [annotationId, incomingUrl, incomingQuote])

  const saveIncomingAnchor = async () => {
    if (!resolution.data?.found || !resolution.data.source || !incomingQuote.trim()) return
    setWorking(true); setNotice('')
    try {
      const source = resolution.data.source
      const payload = await api<{ annotation: SourceAnnotation }>('/annotations', {
        method: 'POST',
        body: JSON.stringify({
          recommendation_id: source.id,
          thread_id: source.thread_id || undefined,
          branch_id: source.branch_id || undefined,
          locator_type: 'web',
          selector: { locator: incomingUrl, url: incomingUrl, text_quote: { exact: incomingQuote.trim() }, ...(shareIntakeId ? { share_intake_id: shareIntakeId } : {}) },
          quote: incomingQuote.trim(),
          language: document.documentElement.lang || undefined,
          created_by: 'user',
        }),
      })
      setSavedId(payload.annotation.id)
      let intakePending = false
      if (shareIntakeId) {
        try {
          await api(`/api/share-intakes/${encodeURIComponent(shareIntakeId)}/consume`, {
            method: 'POST', body: JSON.stringify({ annotation_id: payload.annotation.id }),
          })
        } catch { intakePending = true }
      }
      setNotice(intakePending
        ? 'Source anchor saved. The share receipt remains recoverable until its completion marker syncs.'
        : 'Source anchor saved. Choose what you want to create from it.')
    } catch (error: any) { setNotice(error?.message || 'The source anchor could not be saved.') }
    finally { setWorking(false) }
  }

  if (!effectiveId) {
    if (resolution.loading) return <Loading label="Resolving source passage" />
    if (resolution.error) return <ErrorState message={resolution.error} retry={resolution.reload} />
    if (!resolution.data?.found || !resolution.data.source?.branch_verified) {
      const captureHref = `#/home?capture=${encodeURIComponent(incomingUrl)}`
      const needsBranch = Boolean(resolution.data?.found)
      return <article class="learn-object-detail source-anchor-action">
        <p class="folio-object-kicker">Source anchor · Capture required</p>
        <h1>{needsBranch ? 'This source needs a reviewed branch' : 'This page is not in Learning Compass yet'}</h1>
        <blockquote dir="auto">{incomingQuote}</blockquote>
        <p>{needsBranch ? 'Capture the same URL under a reviewed, non-pruned branch before anchoring the passage.' : 'Capture the source under a reviewed branch first.'} This tab keeps the selected passage while Capture opens separately.</p>
        <div class="folio-row-actions"><a class="folio-button folio-button-primary" href={captureHref} target="_blank" rel="noreferrer">{needsBranch ? 'Review source branch' : 'Capture source'}</a><button type="button" class="folio-button" onClick={resolution.reload}>Check again</button></div>
      </article>
    }
    return <article class="learn-object-detail source-anchor-action">
      <p class="folio-object-kicker">Source anchor · Review</p>
      <h1>{resolution.data.source?.title || incomingTitle || 'Selected source passage'}</h1>
      <blockquote dir="auto">{incomingQuote}</blockquote>
      <dl><div><dt>Source</dt><dd>{incomingUrl}</dd></div>{resolution.data.source?.branch_label && <div><dt>Branch</dt><dd>{resolution.data.source.branch_label}</dd></div>}</dl>
      <p>Saving preserves this exact passage and locator. It does not create a note, Learning Unit, or recall card.</p>
      {notice && <p role="status">{notice}</p>}
      <div class="folio-row-actions"><button type="button" class="folio-button folio-button-primary" onClick={saveIncomingAnchor} disabled={working}>{working ? 'Saving…' : 'Save source anchor'}</button><a class="folio-button" href={`#/library/source/${encodeURIComponent(resolution.data.source?.id || '')}`}>Open source record</a></div>
    </article>
  }

  if (annotationState.loading && !annotationState.data) return <Loading label="Loading source anchor" />
  if (annotationState.error && !annotationState.data) return <ErrorState message={annotationState.error} retry={annotationState.reload} />
  const annotation = annotationState.data?.annotation
  if (!annotation || annotation.status === 'archived') return <Empty title="Source anchor unavailable" body="This anchor was archived or no longer exists." action={<a class="button secondary" href="#/learn?mode=practice&focus=notes">Return to Notes</a>} />

  return <article class="learn-object-detail source-anchor-action">
    <p class="folio-object-kicker">Source anchor · Explicit learner action</p>
    <h1>{annotation.source_title || 'Anchored source passage'}</h1>
    {annotation.context_before && <p dir="auto">…{annotation.context_before}</p>}
    <blockquote dir="auto">{annotation.quote}</blockquote>
    {annotation.context_after && <p dir="auto">{annotation.context_after}…</p>}
    <dl>
      <div><dt>Locator</dt><dd>{annotationLocator(annotation)}</dd></div>
      {annotation.branch_label && <div><dt>Branch</dt><dd>{annotation.branch_label}</dd></div>}
      {annotation.source_checksum && <div><dt>Checksum</dt><dd>{annotation.source_checksum.slice(0, 16)}…</dd></div>}
    </dl>
    <p>Choose one action. Nothing is generated or retained until you submit its form.</p>
    <div class="folio-row-actions" role="group" aria-label="Use source anchor">
      <button type="button" class={`folio-button${action === 'note' ? ' folio-button-primary' : ''}`} aria-pressed={action === 'note'} onClick={() => { setAction('note'); setNotice('') }}>Write a note</button>
      <button type="button" class={`folio-button${action === 'unit' ? ' folio-button-primary' : ''}`} aria-pressed={action === 'unit'} onClick={() => { setAction('unit'); setNotice('') }}>Create a Learning Unit</button>
      <button type="button" class={`folio-button${action === 'card' ? ' folio-button-primary' : ''}`} aria-pressed={action === 'card'} onClick={() => { setAction('card'); setNotice('') }}>Write a recall card</button>
      <a class="folio-button" href={`#/library/source/${encodeURIComponent(annotation.recommendation_id)}?annotation=${encodeURIComponent(annotation.id)}`}>Return to source</a>
    </div>
    {action === 'note' && <AnchoredNoteForm annotation={annotation} onNotice={setNotice} />}
    {action === 'unit' && <AnchoredUnitForm annotation={annotation} onNotice={setNotice} />}
    {action === 'card' && <AnchoredCardForm annotation={annotation} onNotice={setNotice} />}
    {notice && <p role="status">{notice}</p>}
  </article>
}

function AnchoredNoteForm({ annotation, onNotice }: { annotation: SourceAnnotation; onNotice: (message: string) => void }) {
  const [title, setTitle] = useState(annotation.source_title ? `Note on ${annotation.source_title}` : 'Source-anchored note')
  const [learnerNote, setLearnerNote] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: Event) => {
    event.preventDefault()
    if (!title.trim() || !learnerNote.trim()) return
    setSaving(true); onNotice('')
    try {
      const result = await api<{ id: string }>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), kind: 'note', status: 'draft', recommendation_id: annotation.recommendation_id,
          branch_id: annotation.branch_id || undefined, thread_id: annotation.thread_id || undefined, source_url: annotation.source_url || undefined,
          provenance: [{ annotation_id: annotation.id, reason: 'Learner explicitly created this note from the source anchor.', confidence: 1 }],
          sections: [
            { section_key: 'source_passage', label: 'Source passage', content: annotation.quote, direction: 'auto' },
            { section_key: 'learner_note', label: 'My note', content: learnerNote.trim(), direction: 'auto' },
          ],
        }),
      })
      window.location.hash = `/learn/note/${encodeURIComponent(result.id)}`
    } catch (error: any) { onNotice(error?.message || 'The note could not be created.') }
    finally { setSaving(false) }
  }
  return <form class="source-annotation-form" onSubmit={submit}>
    <h2>Write a source-grounded note</h2>
    <label>Title<input value={title} maxLength={500} onInput={(event) => setTitle((event.currentTarget as HTMLInputElement).value)} required /></label>
    <label>Your note<textarea value={learnerNote} maxLength={12000} dir="auto" onInput={(event) => setLearnerNote((event.currentTarget as HTMLTextAreaElement).value)} placeholder="Explain, question, or apply the passage in your own words…" required /></label>
    <button type="submit" class="folio-button folio-button-primary" disabled={saving || !title.trim() || !learnerNote.trim()}>{saving ? 'Creating…' : 'Create note'}</button>
  </form>
}

function AnchoredUnitForm({ annotation, onNotice }: { annotation: SourceAnnotation; onNotice: (message: string) => void }) {
  const [unitType, setUnitType] = useState('claim')
  const [statement, setStatement] = useState('')
  const [synthesis, setSynthesis] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: Event) => {
    event.preventDefault()
    if (!statement.trim()) return
    setSaving(true); onNotice('')
    try {
      const result = await api<{ id: string }>('/learning/core/units', {
        method: 'POST',
        body: JSON.stringify({
          unit_type: unitType, statement: statement.trim(), user_synthesis: synthesis.trim() || undefined,
          stance: 'uncertain', confidence: .5, status: 'draft', created_by: 'user', recommendation_id: annotation.recommendation_id,
          thread_id: annotation.thread_id || undefined,
          anchors: [{ annotation_id: annotation.id, artifact_id: annotation.artifact_id || undefined, anchor_type: unitAnchorType(annotation.locator_type), locator: annotationLocator(annotation), excerpt: annotation.quote, checksum: annotation.source_checksum || undefined }],
        }),
      })
      window.location.hash = `/learn/unit/${encodeURIComponent(result.id)}`
    } catch (error: any) { onNotice(error?.message || 'The Learning Unit could not be created.') }
    finally { setSaving(false) }
  }
  return <form class="source-annotation-form" onSubmit={submit}>
    <h2>Create a typed Learning Unit</h2>
    <div class="source-annotation-fields"><label>Type<select value={unitType} onChange={(event) => setUnitType((event.currentTarget as HTMLSelectElement).value)}><option value="claim">Claim</option><option value="concept">Concept</option><option value="method">Method</option><option value="example">Example</option><option value="question">Question</option><option value="application">Application</option><option value="counterclaim">Counterclaim</option></select></label></div>
    <label>Statement<textarea value={statement} maxLength={12000} dir="auto" onInput={(event) => setStatement((event.currentTarget as HTMLTextAreaElement).value)} placeholder="State the idea precisely in your own words…" required /></label>
    <label>Your synthesis <small>optional</small><textarea value={synthesis} maxLength={12000} dir="auto" onInput={(event) => setSynthesis((event.currentTarget as HTMLTextAreaElement).value)} /></label>
    <button type="submit" class="folio-button folio-button-primary" disabled={saving || !statement.trim()}>{saving ? 'Creating…' : 'Create draft Unit'}</button>
  </form>
}

function AnchoredCardForm({ annotation, onNotice }: { annotation: SourceAnnotation; onNotice: (message: string) => void }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: Event) => {
    event.preventDefault()
    if (!question.trim() || !answer.trim()) return
    setSaving(true); onNotice('')
    try {
      const result = await api<{ card_id: string }>('/learning/srs/create', {
        method: 'POST',
        body: JSON.stringify({
          recommendation_id: annotation.recommendation_id, annotation_id: annotation.id,
          thread_id: annotation.thread_id || undefined, question: question.trim(), answer: answer.trim(),
          topic: annotation.source_title || 'source anchor', branch: annotation.branch_id || undefined,
          source_anchor: annotationLocator(annotation),
        }),
      })
      window.location.hash = `/learn/card/${encodeURIComponent(result.card_id)}`
    } catch (error: any) { onNotice(error?.message || 'The recall card could not be created.') }
    finally { setSaving(false) }
  }
  return <form class="source-annotation-form" onSubmit={submit}>
    <h2>Write an Arabic recall card</h2>
    <p>The question and answer must be learner-authored Arabic. The exact source anchor remains attached as provenance.</p>
    <label>Question<textarea value={question} maxLength={4000} dir="rtl" lang="ar" onInput={(event) => setQuestion((event.currentTarget as HTMLTextAreaElement).value)} required /></label>
    <label>Answer<textarea value={answer} maxLength={8000} dir="rtl" lang="ar" onInput={(event) => setAnswer((event.currentTarget as HTMLTextAreaElement).value)} required /></label>
    <button type="submit" class="folio-button folio-button-primary" disabled={saving || !question.trim() || !answer.trim()}>{saving ? 'Creating…' : 'Create recall card'}</button>
  </form>
}

function LearnUnitView({ unitId }: { unitId: string }) {
  const data = useData<{ unit: { recommendation_id?: string; note_id?: string; thread_id?: string; statement: string; unit_type?: string; user_synthesis?: string | null; confidence?: number; branch?: { id: string; label: string; domain: string } }; relations?: Array<{ id: string; relation_type: string; direction: 'incoming' | 'outgoing'; why: string; counterpart: { unit_id: string; statement: string; branch: { id: string; label: string; domain: string }; anchor?: { locator: string } | null } }> }>(`/learning/core/units/${encodeURIComponent(unitId)}`)
  if (data.loading && !data.data) return <Loading label="Loading learning unit" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data) return <Empty title="Learning unit not found" body="This typed Learn link no longer points to an available unit." action={<a class="button secondary" href={routeHref('learn', 'practice', 'notes')}>Return to Notes</a>} />
  return <article class="learn-object-detail relation-unit-detail"><p class="folio-object-kicker">Learning Unit · {data.data.unit.unit_type || 'concept'}</p>{data.data.unit.branch && <span class="folio-branch-pill">{data.data.unit.branch.label} · {data.data.unit.branch.domain}</span>}<h1>{data.data.unit.statement}</h1><ItemParentLinks sourceId={data.data.unit.recommendation_id} noteId={data.data.unit.note_id} threadId={data.data.unit.thread_id}/>{data.data.unit.user_synthesis && <p>{data.data.unit.user_synthesis}</p>}<small>Confidence: {Math.round(Number(data.data.unit.confidence || 0) * 100)}%</small>{data.data.relations?.length ? <section class="unit-relations"><h2>Semantic relationships</h2>{data.data.relations.map((relation) => <article key={relation.id}><div><span class="relation-direction">{relation.direction}</span><strong>{relation.relation_type.replace(/_/g, ' ')}</strong><span class="folio-branch-pill">{relation.counterpart.branch.label} · {relation.counterpart.branch.domain}</span></div><a href={objectHref('learn', 'unit', relation.counterpart.unit_id)}>{relation.counterpart.statement}</a><p>{relation.why}</p>{relation.counterpart.anchor && <small>Anchor: {relation.counterpart.anchor.locator}</small>}</article>)}</section> : null}</article>
}

function LearnCardView({ cardId }: { cardId: string }) {
  const data = useData<{ card: { recommendation_id?: string; thread_id?: string; question: string; answer: string; topic?: string; branch?: string; card_type?: string; source_anchor?: string; source_title?: string; note_id?: string; due_at?: string } }>(`/learning/srs/cards/${encodeURIComponent(cardId)}`)
  if (data.loading && !data.data) return <Loading label="Loading recall card" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data) return <Empty title="Recall card not found" body="This typed Learn link no longer points to an available card." action={<a class="button secondary" href="#/learn/practice/recall">Return to Recall</a>} />
  const card = data.data.card
  return <article class="learn-object-detail"><p class="folio-object-kicker">Recall · {card.card_type || 'question'}</p><h1>{card.question}</h1><p>{card.answer}</p><dl><div><dt>Branch</dt><dd>{card.branch || card.topic || 'General'}</dd></div>{card.source_title && <div><dt>Source</dt><dd>{card.source_title}</dd></div>}{card.source_anchor && <div><dt>Anchor</dt><dd>{card.source_anchor}</dd></div>}<div><dt>Due</dt><dd>{card.due_at || 'Not scheduled'}</dd></div></dl><ItemParentLinks sourceId={card.recommendation_id} noteId={card.note_id} threadId={card.thread_id}/></article>
}

export default LearnWorkspace
