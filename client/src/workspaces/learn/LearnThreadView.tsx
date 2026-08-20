import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { uploadArtifact } from '../../app/upload'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { artifactHref, cardHref, evidenceLabel, isRequired, lessonHref, lessonReadiness, levelHref, noteHref, percent, roleLabel, statusLabel } from './helpers'
import { NoteRecord, PathArtifact, PathResponse, PathSource, PathStage, RecallCard, RecallDraft, ThreadLesson } from './types'
import { ThreadEvidenceForm } from './ThreadEvidenceForm'

export function LearnThreadView({ threadId, levelId: routeLevelId, lessonId: routeLessonId }: { threadId: string; levelId?: string; lessonId?: string }) {
  const path = useData<PathResponse>(`/learning/core/threads/${encodeURIComponent(threadId)}/path`)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(routeLevelId || null)
  const [lessonId, setLessonId] = useState<string | null>(routeLessonId || null)
  useEffect(() => setSelectedStageId(routeLevelId || null), [routeLevelId])
  useEffect(() => setLessonId(routeLessonId || null), [routeLessonId])
  if (path.loading && !path.data) return <Loading label="Loading Thread" />
  if (path.error && !path.data) return <ErrorState message={path.error} retry={path.reload} />
  if (!path.data) return <Empty title="This Thread is unavailable" body="The Thread may have been archived or the link may be incomplete." action={<a class="button secondary" href="#/learn">Return to Threads</a>} />

  const { stages } = path.data
  const lessonStage = lessonId ? stages.find((stage) => stage.lessons.some((lesson) => lesson.id === lessonId)) : undefined
  const activeStage = stages.find((stage) => stage.id === selectedStageId) || lessonStage || path.data.current_stage || stages[0]
  const activeLesson = activeStage?.lessons.find((lesson) => lesson.id === lessonId)

  return <section class="learn-workspace folio-learn folio-thread course-thread">
    <main class="course-main">
         {activeLesson ? (
          <LessonView
            lesson={activeLesson}
            stage={activeStage!}
            threadId={threadId}
            threadTitle={path.data.thread.title}
            onChanged={path.reload}
          />
        ) : activeStage ? (
          <StageView
            stage={activeStage}
            threadId={threadId}
            threadTitle={path.data.thread.title}
            onChanged={path.reload}
          />
        ) : (
          <Empty title="Start your learning path" body="This Thread has no levels yet." />
        )}
    </main>
    {!activeLesson && <>
      <LevelList threadId={threadId} stages={stages} activeStage={activeStage} />
      <ThreadMaterialLedger path={path.data} onChanged={path.reload} />
    </>}
  </section>
}

function StageView({ stage, threadId, threadTitle, onChanged }: { stage: PathStage; threadId: string; threadTitle: string; onChanged: () => void }) {
  const completedLessons = stage.lessons.filter((lesson) => lesson.status === 'completed').length
  const totalLessons = stage.lessons.length
  const lessonCompletion = percent(completedLessons, totalLessons)
  const proofItems = stage.items.filter((item) => isRequired(item) && Boolean(item.evidence_type))
  const completedProof = proofItems.filter((item) => item.status === 'satisfied' || item.status === 'waived').length
  const proofCompletion = percent(completedProof, proofItems.length)
  const nextAction = stage.next_action
  const proposedNextLesson = nextAction?.kind === 'lesson'
    ? stage.lessons.find((lesson) => lesson.id === nextAction.lesson_id)
    : stage.lessons.find((lesson) => lesson.status !== 'completed')
  const nextLesson = proposedNextLesson && lessonReadiness(proposedNextLesson) !== 'needs_material'
    ? proposedNextLesson
    : stage.lessons.find((lesson) => ['ready', 'in_progress'].includes(lessonReadiness(lesson)))
  const lessonsNeedingMaterial = stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length

  return <>
    <header class="course-stage-header">
      <nav class="course-stage-context" aria-label="Breadcrumb"><a href="#/learn">Threads</a><span aria-hidden="true">/</span><span>{threadTitle}</span></nav>
      <div class="course-stage-heading-line"><p class="folio-object-kicker">Level {stage.position}</p><span class={`course-stage-status status-${stage.status}`}>{statusLabel(stage.status)}</span></div>
      <h1>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h1>
      <p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p>
      <div class="course-stage-progress-grid" aria-label="Level progress">
        <ProgressTrack label="Study" completed={completedLessons} total={totalLessons} unit="lessons" value={lessonCompletion} />
        <ProgressTrack label="Proof" completed={completedProof} total={proofItems.length} unit="actions" value={proofCompletion} />
      </div>
    </header>
    {nextLesson && <section class="course-next-action" aria-labelledby="course-next-action-title">
      <div>
        <p class="folio-object-kicker">Next up</p>
        <h3 id="course-next-action-title">{nextLesson.title}</h3>
        <p>{nextLesson.status === 'in_progress' ? 'Pick up where you left off.' : 'Start the next lesson in this level.'}</p>
      </div>
      <a class="button primary folio-primary" href={lessonHref(threadId, nextLesson.id)}>{nextLesson.status === 'in_progress' ? 'Continue lesson' : 'Start lesson'} <Icon name="chevron" size={14} /></a>
    </section>}
    {!nextLesson && lessonsNeedingMaterial > 0 && <section class="course-next-action is-blocked" aria-labelledby="course-next-action-title">
      <div>
        <p class="folio-object-kicker">Next up</p>
        <h3 id="course-next-action-title">Prepare the next lesson</h3>
        <p>{lessonsNeedingMaterial} {lessonsNeedingMaterial === 1 ? 'lesson needs' : 'lessons need'} authored content or a verified source before study can continue.</p>
      </div>
      <span class="course-next-action-lock"><Icon name="source" size={14} /> Material needed</span>
    </section>}
    <LevelFinishLine stage={stage} threadId={threadId} proofItems={proofItems} completedProof={completedProof} onChanged={onChanged} />
    <details class="course-section course-lessons" open>
      <summary><span><span class="folio-object-kicker">Understand</span><strong>Learn in sequence</strong></span><span class="course-section-count">{completedLessons}/{totalLessons} complete</span></summary>
      <div class="course-section-body">
        {stage.lessons.length ? stage.lessons.map((lesson, sequence) => {
          const readiness = lessonReadiness(lesson)
          const stateCopy = readiness === 'completed' ? 'Completed' : readiness === 'needs_material' ? 'Needs material' : readiness === 'in_progress' ? 'In progress · Continue' : lesson.id === nextLesson?.id ? 'Ready · Your next lesson' : 'Ready to study'
          return <a class={`course-lesson state-${readiness} ${readiness === 'completed' ? 'is-complete' : ''} ${lesson.id === nextLesson?.id ? 'is-next' : ''}`} href={lessonHref(threadId, lesson.id)} key={lesson.id} aria-label={`Open lesson ${sequence + 1}: ${lesson.title}, ${stateCopy.toLowerCase()}`}>
            <span class="course-lesson-number">{readiness === 'completed' ? <Icon name="check" size={14} /> : String(sequence + 1).padStart(2, '0')}</span>
            <strong class="course-lesson-title">{lesson.title}</strong>
            <small class="course-lesson-source-count">{stateCopy}</small>
          </a>
        }) : <p class="folio-empty-line">This level uses proof actions directly. Add lessons in Edit when a guided sequence would help.</p>}
      </div>
    </details>
    <LevelMaterials stage={stage} onChanged={onChanged} />
  </>
}

function ProgressTrack({ label, completed, total, unit, value }: { label: string; completed: number; total: number; unit: string; value: number }) {
  const summary = total ? `${completed} of ${total} ${unit}` : `No ${unit} set`
  return <div class="course-stage-progress" aria-label={`${label}: ${summary}`}>
    <div class="course-stage-progress-label"><span class="folio-object-kicker">{label}</span><strong>{summary}</strong><span>{total ? `${value}%` : '—'}</span></div>
    <div class="course-stage-progress-track" role="progressbar" aria-label={`${label} progress`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div>
  </div>
}

function LevelFinishLine({ stage, threadId, proofItems, completedProof, onChanged }: { stage: PathStage; threadId: string; proofItems: PathStage['items']; completedProof: number; onChanged: () => void }) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const finishLine = stage.projects.find((project) => project.type === 'level')
  const activeItem = proofItems.find((item) => item.id === activeItemId)
  if (!finishLine && proofItems.length === 0) return null
  return <section class="course-finish-line" aria-labelledby="course-finish-line-title">
    <div class="course-finish-line-copy">
      <p class="folio-object-kicker">Finish line</p>
      <h2 id="course-finish-line-title">{finishLine?.title || 'Prove the level'}</h2>
      <p>{finishLine?.description || proofItems.find((item) => item.description)?.description || 'Record the proof actions that show this level changed what you can explain or do.'}</p>
    </div>
    {proofItems.length > 0 && <details class="course-proof-details">
      <summary>{completedProof} of {proofItems.length} proof actions complete</summary>
      <div class="course-proof-list">
        {proofItems.map((item) => {
          const done = item.status === 'satisfied' || item.status === 'waived'
          return <div class={`course-proof-row ${done ? 'is-satisfied' : ''}`} key={item.id}>
            <span class="course-proof-state" aria-hidden="true">{done ? '✓' : '○'}</span>
            <span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span>
            <span class="course-proof-type">{evidenceLabel(item.evidence_type)}</span>
            {!done && <button class="button quiet" type="button" onClick={() => setActiveItemId(activeItemId === item.id ? null : item.id)} aria-expanded={activeItemId === item.id}>{activeItemId === item.id ? 'Close' : 'Add proof'}</button>}
            {activeItemId === item.id && <ThreadEvidenceForm threadId={threadId} stageId={stage.id} item={item} onSaved={() => { setActiveItemId(null); onChanged() }} onCancel={() => setActiveItemId(null)} />}
          </div>
        })}
      </div>
    </details>}
  </section>
}

function LevelMaterials({ stage, onChanged, lessonTools = false }: { stage: PathStage; onChanged: () => void; lessonTools?: boolean }) {
  const total = stage.notes.length + stage.files.length + stage.cards.length + stage.recall_drafts.length
  return <details class={`course-level-materials ${lessonTools ? 'is-lesson-tools' : ''}`}>
    <summary><span><span class="folio-object-kicker">{lessonTools ? 'Learning tools' : 'Level workspace'}</span><strong>{lessonTools ? 'Capture while you study' : 'Notes, files, and recall'}</strong></span><small>{total} saved</small></summary>
    <ScopedMaterials
      compact
      scope={{ kind: 'level', id: stage.id, title: stage.title }}
      notes={stage.notes}
      files={stage.files}
      cards={stage.cards}
      drafts={stage.recall_drafts}
      onChanged={onChanged}
    />
  </details>
}

function LevelList({ threadId, stages, activeStage }: { threadId: string; stages: PathStage[]; activeStage?: PathStage }) {
  return <details class="course-level-list" open>
    <summary class="course-level-list-heading"><span class="folio-object-kicker">Levels</span><span>{stages.length} levels</span></summary>
    <div class="course-level-list-grid">
      {stages.map((stage) => (
        <a href={levelHref(threadId, stage.id)} class={`course-level-card status-${stage.status} ${stage.id === activeStage?.id ? 'is-current' : ''}`} aria-current={stage.id === activeStage?.id ? 'page' : undefined} key={stage.id}>
          <span class="course-level-number">{String(stage.position).padStart(2, '0')}</span>
          <span><strong>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong><small>{stage.lessons.filter((lesson) => lesson.status === 'completed').length}/{stage.lessons.length} complete · {stage.lessons.filter((lesson) => lessonReadiness(lesson) !== 'needs_material').length} ready</small><small class="course-level-readiness">{stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length ? `${stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length} need material` : statusLabel(stage.status)}</small></span>
          <span class="course-level-mark" aria-hidden="true">{stage.status === 'verified' ? <Icon name="check" size={14} /> : stage.id === activeStage?.id ? '●' : '○'}</span>
        </a>
      ))}
    </div>
  </details>
}

type MaterialScope = { kind: 'thread' | 'level'; id: string; title: string }

function ThreadMaterialLedger({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const levelMaterials = path.stages.filter((stage) => stage.notes.length || stage.files.length || stage.cards.length || stage.recall_drafts.length)
  return <details class="learning-material-ledger">
    <summary>
      <span><span class="folio-object-kicker">Thread workspace</span><strong>Notes, files, and recall</strong></span>
      <small>{path.notes.length + path.files.length + path.cards.length + path.recall_drafts.length} owned by Thread · {levelMaterials.length} Levels with material</small>
    </summary>
    <div class="learning-material-ledger-body">
      <ScopedMaterials
        compact
        scope={{ kind: 'thread', id: path.thread.id, title: path.thread.title }}
        notes={path.notes}
        files={path.files}
        cards={path.cards}
        drafts={path.recall_drafts}
        onChanged={onChanged}
      />
      {levelMaterials.length > 0 && <section class="learning-owned-index" aria-label="Materials owned by Levels">
        <div class="learning-material-heading"><div><span class="folio-object-kicker">All Levels</span><h3>Thread material index</h3></div><small>Ownership stays with each Level.</small></div>
        {levelMaterials.map((stage) => <div class="learning-owned-level" key={stage.id}>
          <a href={levelHref(path.thread.id, stage.id)}><strong>{stage.title}</strong></a>
          <span>{stage.notes.length} notes · {stage.files.length} files · {stage.cards.length} cards · {stage.recall_drafts.length} drafts</span>
        </div>)}
      </section>}
    </div>
  </details>
}

function ScopedMaterials({ scope, notes, files, cards, drafts, onChanged, compact = false }: {
  scope: MaterialScope
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  drafts: RecallDraft[]
  onChanged: () => void
  compact?: boolean
}) {
  const [saving, setSaving] = useState<'note' | 'file' | 'card' | null>(null)
  const [error, setError] = useState('')
  const scopeBody = scope.kind === 'level' ? { stage_id: scope.id } : { thread_id: scope.id }

  const createNote = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const content = String(values.get('content') || '').trim()
    if (!title || !content) return
    setSaving('note'); setError('')
    try {
      await api('/notes', { method: 'POST', body: JSON.stringify({ ...scopeBody, title, status: 'active', sections: [{ section_key: 'body', label: 'Notes', content, direction: 'auto' }] }) })
      form.reset()
      onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Note creation failed.') }
    finally { setSaving(null) }
  }

  const uploadFile = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('file') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) return
    setSaving('file'); setError('')
    try {
      await uploadArtifact(file, { ...scopeBody, scope: scope.kind, scope_title: scope.title })
      form.reset()
      onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'File upload failed.') }
    finally { setSaving(null) }
  }

  const createCard = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const values = new FormData(form)
    const question = String(values.get('question') || '').trim()
    const answer = String(values.get('answer') || '').trim()
    if (!question || !answer) return
    setSaving('card'); setError('')
    try {
      await api('/learning/srs/create', { method: 'POST', body: JSON.stringify({ ...scopeBody, question, answer, topic: scope.title }) })
      form.reset()
      onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Recall card creation failed.') }
    finally { setSaving(null) }
  }

  return <section class={`learning-scope-workspace ${compact ? 'is-compact' : ''}`} aria-label={`${scope.title} materials`}>
    <div class="learning-material-heading">
      <div><span class="folio-object-kicker">{scope.kind === 'level' ? 'Level workspace' : 'Direct Thread material'}</span><h3>{scope.title}</h3></div>
      <span class="learning-owner-pill">Owned by {scope.kind === 'level' ? 'Level' : 'Thread'}</span>
    </div>
    <div class="learning-material-columns">
      <MaterialColumn title="Notes" count={notes.length} empty="No notes in this scope yet.">
        {notes.map((note) => <a class="learning-material-row" href={noteHref(note.id)} key={note.id}><Icon name="note" size={14} /><span><strong>{note.title}</strong><small>{note.sections?.[0]?.content || 'Open note'}</small></span></a>)}
        <details class="learning-add-material"><summary>Add note</summary><form onSubmit={createNote}><input name="title" aria-label="Note title" placeholder="Note title" required /><textarea name="content" aria-label="Note body" placeholder="What should this scope remember?" rows={3} required /><button class="button secondary" disabled={saving !== null}>{saving === 'note' ? 'Saving…' : 'Save note'}</button></form></details>
      </MaterialColumn>
      <MaterialColumn title="Files" count={files.length} empty="No files in this scope yet.">
        {files.map((file) => <a class="learning-material-row" href={artifactHref(file.id)} target="_blank" rel="noreferrer" key={file.id}><Icon name="file" size={14} /><span><strong>{file.filename}</strong><small>{file.media_type || 'Stored file'}</small></span></a>)}
        <details class="learning-add-material"><summary>Add file</summary><form onSubmit={uploadFile}><input type="file" name="file" aria-label="Choose file" required /><button class="button secondary" disabled={saving !== null}>{saving === 'file' ? 'Uploading…' : 'Upload file'}</button></form></details>
      </MaterialColumn>
      <MaterialColumn title="Recall" count={cards.length + drafts.length} empty="No recall in this scope yet.">
        {cards.map((card) => <a class="learning-material-row" href={cardHref(card.id)} key={card.id}><Icon name="spark" size={14} /><span><strong>{card.question}</strong><small>Approved card · due {card.due_at || 'now'}</small></span></a>)}
        {drafts.map((draft) => <div class="learning-material-row is-draft" key={draft.id}><Icon name="clock" size={14} /><span><strong>{draft.question}</strong><small>Draft · approve in Recall</small></span></div>)}
        <details class="learning-add-material"><summary>Add card</summary><form onSubmit={createCard}><input name="question" aria-label="Recall question" placeholder="Question" required /><textarea name="answer" aria-label="Recall answer" placeholder="Answer" rows={2} required /><button class="button secondary" disabled={saving !== null}>{saving === 'card' ? 'Saving…' : 'Create card'}</button></form></details>
      </MaterialColumn>
    </div>
    {error && <p class="learning-material-error" role="alert">{error}</p>}
  </section>
}

function MaterialColumn({ title, count, empty, children }: { title: string; count: number; empty: string; children: any }) {
  return <section class="learning-material-column"><header><h4>{title}</h4><span>{count}</span></header>{count === 0 && <p class="folio-empty-line">{empty}</p>}{children}</section>
}

function LessonView({
  lesson,
  stage,
  threadId,
  threadTitle,
  onChanged,
}: {
  lesson: ThreadLesson
  stage: PathStage
  threadId: string
  threadTitle: string
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const isCompleted = lesson.status === 'completed'
  const readiness = lessonReadiness(lesson)
  const canComplete = readiness !== 'needs_material'

  const currentIndex = stage.lessons.findIndex((l) => l.id === lesson.id)
  const prevLesson = currentIndex > 0 ? stage.lessons[currentIndex - 1] : null
  const nextLesson = currentIndex >= 0 && currentIndex < stage.lessons.length - 1 ? stage.lessons[currentIndex + 1] : null

  const toggleComplete = async () => {
    setSaving(true)
    try {
      const nextStatus = isCompleted ? 'in_progress' : 'completed'
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <article class="course-lesson-page">
      <div class="course-lesson-top-nav">
        <a class="folio-back-link" href={levelHref(threadId, stage.id)}>
          <Icon name="back" size={14} />
            <span>Back to level</span>
        </a>
        {lesson.estimated_minutes && (
          <span class="lesson-duration-pill">
            <Icon name="clock" size={12} />
            <span>{lesson.estimated_minutes} min</span>
          </span>
        )}
      </div>

      <header class="course-lesson-header">
        <nav class="course-stage-context" aria-label="Breadcrumb"><a href="#/learn">Threads</a><span aria-hidden="true">/</span><span>{threadTitle}</span></nav>
        <div class="course-lesson-meta-bar">
          <p class="folio-object-kicker">Lesson {String(lesson.position + 1).padStart(2, '0')}</p>
          <span class={`course-lesson-status-pill state-${readiness}`}>
            <Icon name={isCompleted ? 'check' : readiness === 'needs_material' ? 'source' : 'clock'} size={12} />
            <span>{isCompleted ? 'Completed' : readiness === 'needs_material' ? 'Needs material' : readiness === 'in_progress' ? 'In progress' : 'Ready to study'}</span>
          </span>
        </div>
        <h1>{lesson.title}</h1>
      </header>

      {readiness === 'needs_material' && <section class="lesson-empty-state" aria-label="Study material unavailable"><h2>No study material attached</h2><p>This lesson is not ready yet. Add authored lesson content or attach a verified source before completing it.</p></section>}

      {(lesson.why_learn || lesson.why_now || lesson.takeaway) && <section class="lesson-learning-contract" aria-labelledby="lesson-learning-contract-title">
        <div><p class="folio-object-kicker">Learning contract</p><h2 id="lesson-learning-contract-title">What this lesson changes</h2></div>
        <dl>
          {lesson.why_learn && <div><dt>Why it matters</dt><dd>{lesson.why_learn}</dd></div>}
          {lesson.why_now && <div><dt>Why now</dt><dd>{lesson.why_now}</dd></div>}
          {lesson.takeaway && <div><dt>Takeaway</dt><dd>{lesson.takeaway}</dd></div>}
        </dl>
      </section>}

      {lesson.content && <div class="lesson-content">{lesson.content}</div>}

      {lesson.sources?.length ? <SourceSection sources={lesson.sources} /> : null}

      <LevelMaterials stage={stage} onChanged={onChanged} lessonTools />

      <footer class="course-lesson-footer">
        <div class="course-lesson-nav">
          {prevLesson && (
            <a class="button secondary" href={lessonHref(threadId, prevLesson.id)} title={prevLesson.title}>
              <Icon name="back" size={14} />
              <span>Prev: Lesson {String(prevLesson.position + 1).padStart(2, '0')}</span>
            </a>
          )}
          {nextLesson && (
            <a class="button secondary" href={lessonHref(threadId, nextLesson.id)} title={nextLesson.title}>
              <span>Next: Lesson {String(nextLesson.position + 1).padStart(2, '0')}</span>
              <Icon name="chevron" size={14} />
            </a>
          )}
        </div>
        <div class="course-lesson-actions">
          {!canComplete && <p class="course-lesson-completion-note">Completion unlocks when study material is attached.</p>}
          <button
            class={`button ${isCompleted ? 'secondary course-lesson-completed-btn' : 'primary folio-primary'}`}
            type="button"
            onClick={toggleComplete}
            disabled={saving || !canComplete}
          >
            <Icon name="check" size={15} />
            <span>{saving ? 'Updating…' : isCompleted ? 'Completed ✓ · Reopen lesson' : 'Mark lesson complete'}</span>
          </button>
        </div>
      </footer>
    </article>
  )
}

function SourceSection({ sources }: { sources: PathSource[] }) {
  return (
    <section class="course-sources">
      <div class="folio-section-head">
        <div>
          <p class="folio-object-kicker">Study material</p>
          <h3>For this lesson</h3>
        </div>
      </div>
      {sources.length ? (
        <ul class="course-sources-list">
          {sources.map((source) => (
            <li key={source.recommendation_id} class="course-source-card">
              <div class="course-source-header">
                <div class="course-source-tags">
                  <span class="course-source-role-tag">{roleLabel(source.role)}</span>
                  {source.content_type && <span class="course-source-type-tag">{source.content_type}</span>}
                  {source.creator && <span class="course-source-creator-tag">{source.creator}</span>}
                </div>
                <strong class="course-source-title">{source.video_title || 'Untitled source'}</strong>
                {source.expected_contribution && (
                  <p class="course-source-rationale">{source.expected_contribution}</p>
                )}
              </div>
              <div class="course-source-links">
                {source.video_url && (
                  <a
                    class="folio-file-badge folio-badge-source"
                    href={source.video_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open original source"
                  >
                    <Icon name="external" size={13} />
                    <span class="badge-format">Original</span>
                  </a>
                )}
                {source.artifacts?.html && (
                  <a
                    class="folio-file-badge folio-badge-html"
                    href={artifactHref(source.artifacts.html.id)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open HTML companion"
                  >
                    <Icon name="source" size={13} />
                    <span class="badge-format">HTML</span>
                  </a>
                )}
                {source.artifacts?.pdf && (
                  <a
                    class="folio-file-badge folio-badge-pdf"
                    href={artifactHref(source.artifacts.pdf.id)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open / Download PDF companion"
                  >
                    <Icon name="file" size={13} />
                    <span class="badge-format">PDF</span>
                  </a>
                )}
                {source.notebook_url && (
                  <a
                    class="folio-file-badge folio-badge-nblm"
                    href={source.notebook_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open Google NotebookLM notebook"
                  >
                    <Icon name="spark" size={13} />
                    <span class="badge-format">NotebookLM</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p class="folio-empty-line">Hermes has not curated material for this lesson yet.</p>
      )}
    </section>
  )
}
