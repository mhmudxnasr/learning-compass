import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { uploadArtifact } from '../../app/upload'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { artifactHref, cardHref, lessonHref, levelHref, noteHref, roleLabel, statusLabel, threadHref } from './helpers'
import { NoteRecord, PathArtifact, PathResponse, PathSource, PathStage, RecallCard, RecallDraft, ThreadLesson } from './types'

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
            onChanged={path.reload}
          />
        ) : activeStage ? (
          <StageView
            stage={activeStage}
            threadId={threadId}
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

function StageView({ stage, threadId, onChanged }: { stage: PathStage; threadId: string; onChanged: () => void }) {
  return <>
    <header class="course-stage-header">
      <div class="course-stage-heading-line"><p class="folio-object-kicker">Level {stage.position}</p><span class={`course-stage-status status-${stage.status}`}>{statusLabel(stage.status)}</span></div>
      <h2>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h2>
      <p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p>
    </header>
    <details class="course-section course-lessons" open>
      <summary><span><span class="folio-object-kicker">Understand</span><strong>Learn in sequence</strong></span></summary>
      <div class="course-section-body">
        {stage.lessons.length ? stage.lessons.map((lesson, sequence) => (
          <a class={`course-lesson ${lesson.status === 'completed' ? 'is-complete' : ''}`} href={lessonHref(threadId, lesson.id)} key={lesson.id} aria-label={`Open lesson ${sequence + 1}: ${lesson.title}${lesson.status === 'completed' ? ', completed' : ''}`}>
            <span class="course-lesson-number">{lesson.status === 'completed' ? <Icon name="check" size={14} /> : String(sequence + 1).padStart(2, '0')}</span>
            <strong class="course-lesson-title">{lesson.title}</strong>
            <small class="course-lesson-source-count">{lesson.sources?.length ? `${lesson.sources.length} ${lesson.sources.length === 1 ? 'source' : 'sources'} · Study material available` : 'No source selected yet'}</small>
          </a>
        )) : <p class="folio-empty-line">This level uses proof actions directly. Add lessons in Edit when a guided sequence would help.</p>}
      </div>
    </details>
    <ScopedMaterials
      scope={{ kind: 'level', id: stage.id, title: stage.title }}
      notes={stage.notes}
      files={stage.files}
      cards={stage.cards}
      drafts={stage.recall_drafts}
      onChanged={onChanged}
    />
  </>
}

function LevelList({ threadId, stages, activeStage }: { threadId: string; stages: PathStage[]; activeStage?: PathStage }) {
  return <details class="course-level-list" open>
    <summary class="course-level-list-heading"><span class="folio-object-kicker">Levels</span><span>{stages.length} levels</span></summary>
    <div class="course-level-list-grid">
      {stages.map((stage) => (
        <a href={levelHref(threadId, stage.id)} class={`course-level-card status-${stage.status} ${stage.id === activeStage?.id ? 'is-current' : ''}`} aria-current={stage.id === activeStage?.id ? 'page' : undefined} key={stage.id}>
          <span class="course-level-number">{String(stage.position).padStart(2, '0')}</span>
          <span><strong>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong><small>{stage.lessons.length} lessons · {statusLabel(stage.status)}</small></span>
          <span class="course-level-mark" aria-hidden="true">{stage.status === 'verified' ? <Icon name="check" size={14} /> : stage.id === activeStage?.id ? '●' : '○'}</span>
        </a>
      ))}
    </div>
  </details>
}

type MaterialScope = { kind: 'thread' | 'level'; id: string; title: string }

function ThreadMaterialLedger({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const levelMaterials = path.stages.filter((stage) => stage.notes.length || stage.files.length || stage.cards.length || stage.recall_drafts.length)
  return <details class="learning-material-ledger" open>
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
  onChanged,
}: {
  lesson: ThreadLesson
  stage: PathStage
  threadId: string
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const isCompleted = lesson.status === 'completed'

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
        <div class="course-lesson-meta-bar">
          <p class="folio-object-kicker">Lesson {String(lesson.position + 1).padStart(2, '0')}</p>
          <span class={`course-lesson-status-pill ${isCompleted ? 'is-complete' : 'is-pending'}`}>
            <Icon name={isCompleted ? 'check' : 'clock'} size={12} />
            <span>{isCompleted ? 'Completed' : 'In progress'}</span>
          </span>
        </div>
        <h2>{lesson.title}</h2>
      </header>

      {lesson.content && <div class="lesson-content">{lesson.content}</div>}

      {lesson.sources?.length ? (
        <SourceSection sources={lesson.sources} />
      ) : (
        <section class="lesson-empty-state" aria-label="Study material unavailable"><h3>No study material attached</h3><p>This lesson is ready for your own notes or a linked source.</p></section>
      )}

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
          <button
            class={`button ${isCompleted ? 'secondary course-lesson-completed-btn' : 'primary folio-primary'}`}
            type="button"
            onClick={toggleComplete}
            disabled={saving}
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
