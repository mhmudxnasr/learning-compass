import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { artifactHref, formatDate, percent, roleLabel, statusLabel } from './helpers'
import { PathResponse, PathSource, PathStage, ThreadLesson, ThreadProject } from './types'
import { ThreadEvidenceForm } from './ThreadEvidenceForm'

export function LearnThreadView({ threadId }: { threadId: string }) {
  const path = useData<PathResponse>(`/learning/core/threads/${encodeURIComponent(threadId)}/path`)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [evidenceItemId, setEvidenceItemId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  if (path.loading && !path.data) return <Loading label="Loading course" />
  if (path.error && !path.data) return <ErrorState message={path.error} retry={path.reload} />
  if (!path.data) return <Empty title="This course is unavailable" body="The Thread may have been archived or the link may be incomplete." action={<a class="button secondary" href="#/learn">Return to Paths</a>} />

  const { thread, stages } = path.data
  const activeStage = stages.find((stage) => stage.id === selectedStageId) || path.data.current_stage || stages[0]
  const activeLesson = activeStage?.lessons.find((lesson) => lesson.id === lessonId)
  const totalLessons = stages.reduce((sum, stage) => sum + stage.progress.total, 0)
  const completedLessons = stages.reduce((sum, stage) => sum + stage.progress.completed, 0)
  const finalProject = path.data.projects.find((project) => project.type === 'final')

  const update = async (endpoint: string, body: object, success: string) => {
    try { await api(endpoint, { method: 'PATCH', body: JSON.stringify(body) }); setMessage(success); path.reload() }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Could not save the change.') }
  }

  const selectStage = (stage: PathStage) => { setSelectedStageId(stage.id); setLessonId(null); setEvidenceItemId(null) }
  const startStage = async (stage: PathStage) => {
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/start`, { method: 'POST' })
      setSelectedStageId(stage.id)
      setMessage(`Level ${stage.position} started. Choose the next proof action.`)
      path.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'This level could not be started.')
    }
  }
  const verifyStage = async (stage: PathStage) => {
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/verify`, { method: 'POST' })
      setMessage(`Level ${stage.position} verified. The next level is now available.`)
      path.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'This level is not ready to verify.')
    }
  }
  const continueLearning = () => {
    if (!activeStage) return
    if (activeStage.next_action?.kind === 'start') { void startStage(activeStage); return }
    if (activeStage.next_action?.kind === 'verify') { void verifyStage(activeStage); return }
    const next = activeStage.lessons.find((lesson) => lesson.status !== 'completed') || activeStage.lessons[0]
    if (next) { setLessonId(next.id); update(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(next.id)}`, { status: 'in_progress' }, 'Lesson started.') }
  }

  return <section class="learn-workspace folio-learn folio-thread course-thread" aria-labelledby="thread-title">
    <header class="course-header">
      <a class="folio-back-link" href="#/learn"><Icon name="back" size={14} /> Back to learning paths</a>
      <p class="folio-object-kicker">Course · {statusLabel(thread.status)}</p>
      <h1 id="thread-title">{thread.title}</h1>
      <p class="folio-thread-question">{thread.guiding_question || 'A guided path from first principles to practical use.'}</p>
      <div class="course-progress"><span><strong>{completedLessons}/{totalLessons}</strong> lessons completed</span><span>{percent(completedLessons, totalLessons)}%</span></div>
      <button class="button primary folio-primary" type="button" onClick={continueLearning}>{activeStage?.lessons.some((lesson) => lesson.status !== 'completed') ? 'Continue learning' : 'Review course'}</button>
      {message && <output class="folio-status" aria-live="polite">{message}</output>}
    </header>

    <div class="course-layout">
      <aside class="course-map" aria-label="Course path">
        <div class="course-map-heading">
          <p class="folio-object-kicker">Course path</p>
          <span>{stages.filter((stage) => stage.status === 'verified').length}/{stages.length} levels verified</span>
        </div>
        <div class="course-stage-list">
          {stages.map((stage) => (
            <button
              type="button"
              class={`folio-level-toggle folio-stage-row ${stage.id === activeStage?.id ? 'is-current' : ''}`}
              onClick={() => selectStage(stage)}
              key={stage.id}
              aria-current={stage.id === activeStage?.id ? 'step' : undefined}
            >
              <span>{stage.position === 0 ? '00' : String(stage.position).padStart(2, '0')}</span>
              <span>
                <strong>Level {stage.position} · {stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong>
                <small>{statusLabel(stage.status)} · {stage.progress.completed}/{stage.progress.total}</small>
              </span>
              <i>{stage.progress.total && stage.progress.completed === stage.progress.total ? <Icon name="check" size={14} /> : stage.id === activeStage?.id ? '●' : '○'}</i>
            </button>
          ))}
        </div>
        <ProjectCard project={finalProject} threadId={threadId} onChanged={path.reload} />
      </aside>
      <main class="course-main">
        {activeLesson ? (
          <LessonView
            lesson={activeLesson}
            stage={activeStage!}
            threadId={threadId}
            onBack={() => setLessonId(null)}
            onSelectLesson={(lesson) => setLessonId(lesson.id)}
            onChanged={path.reload}
          />
        ) : activeStage ? (
          <StageView
            stage={activeStage}
            threadId={threadId}
            onLesson={(lesson) => setLessonId(lesson.id)}
            evidenceItemId={evidenceItemId}
            onEvidence={(itemId) => { setLessonId(null); setEvidenceItemId(itemId) }}
            onStart={() => startStage(activeStage)}
            onVerify={() => verifyStage(activeStage)}
            onEvidenceSaved={() => { setEvidenceItemId(null); path.reload() }}
            onChanged={path.reload}
          />
        ) : (
          <Empty title="Start your learning path" body="This course has no levels yet." />
        )}
      </main>
    </div>
  </section>
}

function StageView({ stage, threadId, onLesson, evidenceItemId, onEvidence, onStart, onVerify, onEvidenceSaved, onChanged }: { stage: PathStage; threadId: string; onLesson: (lesson: ThreadLesson) => void; evidenceItemId: string | null; onEvidence: (itemId: string) => void; onStart: () => void; onVerify: () => void; onEvidenceSaved: () => void; onChanged: () => void }) {
  const requiredItems = stage.items.filter((item) => (item.required === true || Number(item.required) === 1) && !['source_role', 'companion'].includes(item.item_type))
  const openItems = requiredItems.filter((item) => item.status === 'open')
  const evidenceItem = requiredItems.find((item) => item.id === evidenceItemId)
  return <>
    <header class="course-stage-header">
      <div class="course-stage-heading-line"><p class="folio-object-kicker">Level {stage.position}</p><span class={`course-stage-status status-${stage.status}`}>{statusLabel(stage.status)}</span></div>
      <h2>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h2>
      <p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p>
      <div class="course-stage-meta"><span>{stage.progress.completed} / {stage.progress.total} lessons</span><span>{requiredItems.length - openItems.length} / {requiredItems.length || 0} proof actions</span></div>
    </header>
    <section class={`course-next-action next-${stage.status}`} aria-labelledby="course-next-action-title">
      <div><p class="folio-object-kicker">Next action</p><h3 id="course-next-action-title">{stage.next_action?.label || (stage.status === 'available' ? 'Start this level' : stage.status === 'ready_to_verify' ? 'Verify this level' : stage.status === 'locked' ? 'Review the prerequisite' : openItems[0]?.title || 'Continue the lesson sequence')}</h3><p>{stage.status === 'locked' ? 'Complete and verify the previous level before this work opens.' : stage.status === 'ready_to_verify' ? 'Your required proof is recorded. Verification unlocks the next level.' : openItems[0] ? 'This is the first missing proof needed to move forward.' : 'Take the smallest useful step, then return here to see what changed.'}</p></div>
      {stage.status === 'available' && <button class="button primary folio-primary" type="button" onClick={onStart}>Start level</button>}
      {stage.status === 'ready_to_verify' && <button class="button primary folio-primary" type="button" onClick={onVerify}>Verify level</button>}
      {stage.status === 'evidence_pending' && openItems[0] && <button class="button primary folio-primary" type="button" onClick={() => onEvidence(openItems[0].id)}>Record proof</button>}
      {stage.status === 'locked' && <span class="course-next-action-lock">Locked</span>}
    </section>
    {requiredItems.length > 0 && <section class="course-proof" aria-labelledby="course-proof-title">
      <div class="folio-section-head"><div><p class="folio-object-kicker">Evidence gate</p><h3 id="course-proof-title">Proof for this level</h3></div><span class="folio-measure">{requiredItems.length - openItems.length}/{requiredItems.length}</span></div>
      <p class="course-proof-intro">Learning builds understanding; proof shows you can use it.</p>
      {openItems[0] && <div class="course-proof-priority"><span class="course-proof-state" aria-hidden="true">○</span><div><strong>First missing proof</strong><span>{openItems[0].title}</span></div><button class="button secondary" type="button" onClick={() => onEvidence(openItems[0].id)}>Record proof</button></div>}
      <details class="course-proof-details">
        <summary>View all {requiredItems.length} proof actions</summary>
        <div class="course-proof-list">
          {requiredItems.map((item) => item.id === evidenceItemId && evidenceItem ? <ThreadEvidenceForm key={item.id} threadId={threadId} stageId={stage.id} item={item} onSaved={onEvidenceSaved} onCancel={() => onEvidence('')} /> : <div class={`course-proof-row is-${item.status}`} key={item.id}>
            <span class="course-proof-state" aria-hidden="true">{item.status === 'satisfied' || item.status === 'waived' ? '✓' : '○'}</span><div><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</div><span class="course-proof-type">{item.status === 'satisfied' ? 'Recorded' : item.status === 'waived' ? 'Waived' : 'Open'}</span>{item.status === 'open' && <button class="button secondary" type="button" onClick={() => onEvidence(item.id)}>Record proof</button>}
          </div>)}
        </div>
      </details>
    </section>}
    <details class="course-section course-lessons" open>
      <summary><span><span class="folio-object-kicker">Understand</span><strong>Learn in sequence</strong></span><span>{stage.progress.completed}/{stage.progress.total} complete</span></summary>
      <div class="course-section-body">
        {stage.lessons.map((lesson) => (
          <button type="button" class={`course-lesson ${lesson.status === 'completed' ? 'is-complete' : ''}`} onClick={() => onLesson(lesson)} key={lesson.id}>
            <span class="course-lesson-number">{lesson.status === 'completed' ? <Icon name="check" size={14} /> : String(lesson.position + 1).padStart(2, '0')}</span>
            <strong class="course-lesson-title">{lesson.title}</strong>
            <small class="course-lesson-source-count">{lesson.sources?.length ? `${lesson.sources.length} ${lesson.sources.length === 1 ? 'source' : 'sources'} · Study material available` : 'No source selected yet'}</small>
          </button>
        ))}
      </div>
    </details>
    <ProjectCard project={stage.projects[0]} threadId={threadId} onChanged={onChanged} />
  </>
}

function LessonView({
  lesson,
  stage,
  threadId,
  onBack,
  onSelectLesson,
  onChanged,
}: {
  lesson: ThreadLesson
  stage: PathStage
  threadId: string
  onBack: () => void
  onSelectLesson?: (lesson: ThreadLesson) => void
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
        <button class="folio-back-link" type="button" onClick={onBack}>
          <Icon name="back" size={14} />
          <span>Level {stage.position} — {stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</span>
        </button>
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

      <div class="lesson-orientation">
        <div class="orientation-block">
          <div class="orientation-kicker">
            <Icon name="spark" size={12} />
            <span>Why learn this</span>
          </div>
          <p>{lesson.why_learn || 'This lesson builds the next piece of understanding in the course.'}</p>
        </div>
        <div class="orientation-block">
          <div class="orientation-kicker">
            <Icon name="path" size={12} />
            <span>Why now</span>
          </div>
          <p>{lesson.why_now || 'This lesson prepares you for the next step.'}</p>
        </div>
        <div class="orientation-block">
          <div class="orientation-kicker">
            <Icon name="check" size={12} />
            <span>What you should get</span>
          </div>
          <p>{lesson.takeaway || lesson.objective || lesson.description || 'A clear working understanding you can use in the next lesson.'}</p>
        </div>
      </div>

      {lesson.content ? (
        <div class="lesson-content">{lesson.content}</div>
      ) : (
        <div class="lesson-placeholder">Study the curated material below, then mark this lesson complete to advance.</div>
      )}

      {lesson.sources?.length ? (
        <SourceSection sources={lesson.sources} />
      ) : (
        <p class="folio-empty-line">No source selected for this lesson yet.</p>
      )}

      <footer class="course-lesson-footer">
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
        <div class="course-lesson-nav">
          {prevLesson && onSelectLesson && (
            <button class="button secondary" type="button" onClick={() => onSelectLesson(prevLesson)} title={prevLesson.title}>
              <Icon name="back" size={14} />
              <span>Prev: Lesson {String(prevLesson.position + 1).padStart(2, '0')}</span>
            </button>
          )}
          {nextLesson && onSelectLesson && (
            <button class="button secondary" type="button" onClick={() => onSelectLesson(nextLesson)} title={nextLesson.title}>
              <span>Next: Lesson {String(nextLesson.position + 1).padStart(2, '0')}</span>
              <Icon name="chevron" size={14} />
            </button>
          )}
        </div>
      </footer>
    </article>
  )
}

function ProjectCard({ project, threadId, onChanged }: { project?: ThreadProject; threadId: string; onChanged: () => void }) {
  if (!project) return null
  const setStatus = async (status: ThreadProject['status']) => {
    await api(`/learning/core/threads/${encodeURIComponent(threadId)}/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    onChanged()
  }
  return (
    <section class="course-project">
      <p class="folio-object-kicker">{project.type === 'final' ? 'Final mastery project' : 'Level project'}</p>
      <h3>{project.title}</h3>
      <p>{project.description}</p>
      {project.objective && <small>{project.objective}</small>}
      <span class="project-status">{statusLabel(project.status)}</span>
      <div>
        <button
          class={`button ${project.status === 'in_progress' ? 'primary folio-primary' : 'secondary'}`}
          type="button"
          onClick={() => setStatus(project.status === 'in_progress' ? 'completed' : 'in_progress')}
        >
          {project.status === 'in_progress' ? 'Mark project complete' : project.status === 'completed' ? 'Completed ✓ · Reopen' : 'Start project'}
        </button>
        {project.status === 'not_started' && (
          <button class="button quiet" type="button" onClick={() => setStatus('deferred')}>
            I’ll do this later
          </button>
        )}
      </div>
    </section>
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
