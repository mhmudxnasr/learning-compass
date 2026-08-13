import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { useData } from '../../app/useData'
import { artifactHref, evidenceLabel, formatDate, isRequired, itemLabel, noteHref, percent, roleLabel, statusLabel } from './helpers'
import { PathArtifact, PathResponse, PathSource, PathStage, ThreadItem } from './types'
import { ThreadAuthoring } from './ThreadAuthoring'
import { ThreadEvidenceForm } from './ThreadEvidenceForm'

export function LearnThreadView({ threadId }: { threadId: string }) {
  const path = useData<PathResponse>(`/learning/core/threads/${encodeURIComponent(threadId)}/path`)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [evidenceItemId, setEvidenceItemId] = useState<string | null>(null)
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')

  if (path.loading && !path.data) return <Loading label="Loading learning path" />
  if (path.error && !path.data) return <ErrorState message={path.error} retry={path.reload} />
  if (!path.data) return <Empty title="This path is unavailable" body="The Thread may have been archived or the link may be incomplete." action={<a class="button secondary" href="#/learn">Return to Paths</a>} />

  const { thread, stages } = path.data
  const activeStage = stages.find((stage) => stage.id === selectedStageId) || path.data.current_stage || stages[0]
  const stageProgress = activeStage ? percent(activeStage.progress.completed, activeStage.progress.total) : 0
  const evidenceItem = activeStage?.items.find((item) => item.id === evidenceItemId)

  const mutate = async (endpoint: string, init: RequestInit, status: string) => {
    setWorking(endpoint)
    setMessage(status)
    try {
      await api(endpoint, init)
      setMessage('Saved.')
      setEvidenceItemId(null)
      path.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The change could not be saved.')
    } finally {
      setWorking('')
    }
  }

  const startStage = activeStage && activeStage.status === 'available'
    ? () => mutate(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(activeStage.id)}/start`, { method: 'POST' }, 'Starting level…')
    : undefined
  const verifyStage = activeStage && activeStage.status === 'ready_to_verify'
    ? () => mutate(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(activeStage.id)}/verify`, { method: 'POST' }, 'Checking evidence…')
    : undefined

  const toggleProof = (item: ThreadItem) => mutate(
    `/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(activeStage?.id || '')}/items/${encodeURIComponent(item.id)}`,
    { method: 'PATCH', body: JSON.stringify({ status: item.status === 'satisfied' ? 'open' : 'satisfied' }) },
    item.status === 'satisfied' ? 'Reopening proof…' : 'Updating proof…',
  )

  return <section class="learn-workspace folio-learn folio-thread" aria-labelledby="thread-title">
    <header class="folio-thread-head">
      <a class="folio-back-link" href="#/learn" aria-label="Back to learning paths">← Paths</a>
      <div class="folio-thread-head-main">
        <div><p class="folio-object-kicker">Learning Thread · {statusLabel(thread.status)}</p><h1 id="thread-title">{thread.title}</h1><p class="folio-thread-question">{thread.guiding_question || 'No guiding question recorded.'}</p></div>
        <div class="folio-thread-actions">
          {startStage && <button class="button primary folio-primary" type="button" onClick={startStage} disabled={Boolean(working)}>{working.includes('/start') ? 'Starting…' : 'Start level'}</button>}
          {verifyStage && <button class="button primary folio-primary" type="button" onClick={verifyStage} disabled={Boolean(working)}>{working.includes('/verify') ? 'Verifying…' : 'Verify level'}</button>}
          {!startStage && !verifyStage && <span class="folio-state-chip">{activeStage ? statusLabel(activeStage.status) : 'No level yet'}</span>}
        </div>
      </div>
      {message && <output class="folio-status" aria-live="polite">{message}</output>}
    </header>

    <div class="folio-thread-layout">
      <aside class="folio-stage-ledger" aria-label="Learning path levels">
        <div class="folio-panel-head"><div><p class="folio-object-kicker">Path sequence</p><h2>Levels</h2></div><span class="folio-measure">{stages.length}</span></div>
        {stages.length ? <ol>{stages.map((stage) => <StageRow key={stage.id} stage={stage} selected={stage.id === activeStage?.id} onSelect={() => { setSelectedStageId(stage.id); setEvidenceItemId(null) }} />)}</ol> : <p class="folio-empty-line">No levels have been shaped yet.</p>}
        <ThreadAuthoring threadId={threadId} stage={activeStage} stageCount={stages.length} onChanged={path.reload} />
      </aside>

      <main class="folio-proof-canvas" tabIndex={-1} aria-labelledby="stage-title">
        {activeStage ? <>
          <header class="folio-stage-head"><div><p class="folio-object-kicker">Level {activeStage.position + 1} · {statusLabel(activeStage.status)}</p><h2 id="stage-title">{activeStage.title}</h2><p>{activeStage.objective || activeStage.description || 'This level is waiting for a focused objective.'}</p></div><div class="folio-stage-measure"><strong>{stageProgress}%</strong><span>{activeStage.progress.completed} of {activeStage.progress.total} proof actions</span></div></header>
          <NextAction stage={activeStage} onStart={startStage} onVerify={verifyStage} onEvidence={(item) => setEvidenceItemId(item.id)} />
          <section class="folio-proof-section" aria-labelledby="proof-title"><div class="folio-section-head"><div><p class="folio-object-kicker">Required evidence</p><h3 id="proof-title">Proof ledger</h3></div><span class="folio-measure">{activeStage.progress.completed}/{activeStage.progress.total}</span></div>
            {activeStage.items.filter((item) => isRequired(item) && !['source_role', 'companion'].includes(item.item_type)).length ? <ul class="folio-proof-ledger">{activeStage.items.filter((item) => isRequired(item) && !['source_role', 'companion'].includes(item.item_type)).map((item) => <ProofRow key={item.id} item={item} selected={item.id === evidenceItemId} onEvidence={() => setEvidenceItemId(item.id)} onToggle={() => toggleProof(item)} disabled={Boolean(working)} />)}</ul> : <Empty title="No proof actions yet" body="Shape this level with one or two actions that would demonstrate the competence you want." />}
            {evidenceItem && <ThreadEvidenceForm threadId={threadId} stageId={activeStage.id} item={evidenceItem} onSaved={() => { setEvidenceItemId(null); setMessage('Evidence recorded.'); path.reload() }} onCancel={() => setEvidenceItemId(null)} />}
          </section>
          <SourceSection sources={activeStage.sources} />
          <MaterialsSection stage={activeStage} path={path.data} />
        </> : <Empty title="Shape the first level" body="Add a level to turn this Thread brief into a sequence of evidence-bearing actions." />}
      </main>

      <aside class="folio-thread-inspector" aria-label="Thread brief">
        <div class="folio-panel-head"><div><p class="folio-object-kicker">Thread brief</p><h2>Why this path exists</h2></div></div>
        <dl class="folio-property-list"><div><dt>Question</dt><dd>{thread.guiding_question || 'Not recorded'}</dd></div><div><dt>Definition of competence</dt><dd>{thread.definition_of_done || 'Not recorded'}</dd></div><div><dt>Why now</dt><dd>{thread.why_now || 'Not recorded'}</dd></div><div><dt>Thread state</dt><dd>{statusLabel(thread.status)}</dd></div></dl>
        <section class="folio-inspector-section"><div class="folio-section-head"><h3>Evidence contract</h3><span class="folio-measure">{path.data.requirements.length}</span></div>{path.data.requirements.length ? <ul class="folio-compact-ledger">{path.data.requirements.map((requirement) => <li key={requirement.id}><span class={requirement.status === 'satisfied' ? 'folio-check is-complete' : 'folio-check'} aria-hidden="true">{requirement.status === 'satisfied' ? '✓' : '·'}</span><span>{requirement.label || evidenceLabel(requirement.evidence_type)}</span></li>)}</ul> : <p class="folio-empty-line">No thread-wide requirements recorded.</p>}</section>
      </aside>
    </div>
  </section>
}
function StageRow({ stage, selected, onSelect }: { stage: PathStage; selected: boolean; onSelect: () => void }) {
  return <li class={`folio-stage-row ${selected ? 'is-selected' : ''} ${stage.status === 'locked' ? 'is-locked' : ''}`}><button type="button" onClick={onSelect} disabled={stage.status === 'locked'} aria-current={selected ? 'step' : undefined} aria-label={`${stage.title}, ${statusLabel(stage.status)}`}><span class="folio-stage-index">{String(stage.position + 1).padStart(2, '0')}</span><span><strong>{stage.title}</strong><small>{stage.progress.completed}/{stage.progress.total} · {statusLabel(stage.status)}</small></span><span class="folio-stage-state" aria-hidden="true">{stage.status === 'verified' || stage.status === 'waived' ? '✓' : stage.status === 'locked' ? '—' : '○'}</span></button></li>
}

function NextAction({ stage, onStart, onVerify, onEvidence }: { stage: PathStage; onStart?: () => void; onVerify?: () => void; onEvidence: (item: ThreadItem) => void }) {
  const nextItem = stage.next_action?.item_id ? stage.items.find((item) => item.id === stage.next_action?.item_id) : stage.items.find((item) => isRequired(item) && item.status === 'open' && !['source_role', 'companion'].includes(item.item_type))
  const action = stage.status === 'available' && onStart ? <button class="button primary folio-primary" type="button" onClick={onStart}>Start this level</button> : stage.status === 'ready_to_verify' && onVerify ? <button class="button primary folio-primary" type="button" onClick={onVerify}>Verify evidence</button> : nextItem ? <button class="button secondary" type="button" onClick={() => onEvidence(nextItem)}>Record next proof</button> : null
  return <section class="folio-next-action" aria-labelledby="next-action-title"><div><p class="folio-object-kicker">Next required action</p><h3 id="next-action-title">{stage.status === 'verified' ? 'This level is verified.' : nextItem?.title || stage.next_action?.label || 'Review the level evidence.'}</h3><p>{stage.status === 'verified' ? 'The proof is preserved in the Thread ledger.' : nextItem?.description || 'Work from the source, then record what you can retrieve, explain, transfer, decide, or apply.'}</p></div>{action || <span class="folio-state-chip">{statusLabel(stage.status)}</span>}</section>
}

function ProofRow({ item, selected, onEvidence, onToggle, disabled }: { item: ThreadItem; selected: boolean; onEvidence: () => void; onToggle: () => void; disabled: boolean }) {
  const satisfied = item.status === 'satisfied' || item.status === 'waived'
  return <li class={`folio-proof-row ${satisfied ? 'is-complete' : ''} ${selected ? 'is-open' : ''}`}><span class="folio-proof-icon" aria-hidden="true">{satisfied ? '✓' : '○'}</span><span class="folio-proof-copy"><span class="folio-row-type">{itemLabel(item.item_type)} · {evidenceLabel(item.evidence_type)}</span><strong>{item.title}</strong>{item.description && <span>{item.description}</span>}</span><span class="folio-proof-action">{satisfied ? <button class="button quiet" type="button" onClick={onToggle} disabled={disabled}>Reopen</button> : <button class="button secondary" type="button" onClick={onEvidence} disabled={disabled}>Record proof</button>}</span></li>
}

function SourceSection({ sources }: { sources: PathSource[] }) {
  return <section class="folio-material-section" aria-labelledby="sources-title"><div class="folio-section-head"><div><p class="folio-object-kicker">Study material</p><h3 id="sources-title">Sources for this level</h3></div><span class="folio-measure">{sources.length}</span></div>{sources.length ? <ul class="folio-source-ledger">{sources.map((source) => <li key={source.recommendation_id}><span class="folio-row-mark folio-mark-source" aria-hidden="true" /><span class="folio-source-copy"><span class="folio-row-type">{roleLabel(source.role)}{source.learning_state ? ` · ${statusLabel(source.learning_state)}` : ''}</span><strong>{source.video_title || 'Untitled source'}</strong><small>{source.creator || source.content_type || 'Source record'}</small>{source.expected_contribution && <p>{source.expected_contribution}</p>}</span><span class="folio-source-actions"><SourceLink href={source.video_url} label="Original" /><SourceLink href={source.artifacts?.html ? artifactHref(source.artifacts.html.id) : undefined} label="HTML" /><SourceLink href={source.artifacts?.pdf ? artifactHref(source.artifacts.pdf.id) : undefined} label="PDF" /><SourceLink href={source.notebook_url} label="NotebookLM" /></span></li>)}</ul> : <p class="folio-empty-line">No sources are attached to this level yet.</p>}</section>
}

function SourceLink({ href, label }: { href?: string | null; label: string }) {
  return href ? <a class="folio-material-link" href={href} target="_blank" rel="noreferrer">{label} ↗</a> : <button class="folio-material-link" type="button" disabled>{label} unavailable</button>
}

function MaterialsSection({ stage, path }: { stage: PathStage; path: PathResponse }) {
  const stageNoteIds = new Set(stage.notes.map((note) => note.id))
  const notes = [...stage.notes, ...path.notes.filter((note) => !stageNoteIds.has(note.id))]
  const stageFileIds = new Set(stage.files.map((file) => file.id))
  const files = [...stage.files, ...path.files.filter((file) => !stageFileIds.has(file.id))]
  return <section class="folio-material-section folio-materials" aria-labelledby="materials-title"><div class="folio-section-head"><div><p class="folio-object-kicker">Preserved work</p><h3 id="materials-title">Notes and files</h3></div><span class="folio-measure">{notes.length + files.length}</span></div><div class="folio-material-columns"><div><h4>Notes</h4>{notes.length ? <ul class="folio-mini-ledger">{notes.map((note) => <li key={note.id}><a href={noteHref(note.id)}><span class="folio-row-mark folio-mark-note" aria-hidden="true" /><span><strong>{note.title}</strong><small>{note.sections.length} sections · {formatDate(note.updated_at)}</small></span></a></li>)}</ul> : <p class="folio-empty-line">No notes attached to this path yet.</p>}</div><div><h4>Files</h4>{files.length ? <ul class="folio-mini-ledger">{files.map((file: PathArtifact) => <li key={file.id}><a href={artifactHref(file.id)} target="_blank" rel="noreferrer"><span class="folio-row-mark folio-mark-file" aria-hidden="true" /><span><strong>{file.filename}</strong><small>{file.media_type || 'File'} · {formatDate(file.created_at)}</small></span></a></li>)}</ul> : <p class="folio-empty-line">No files attached to this path yet.</p>}</div></div></section>
}
