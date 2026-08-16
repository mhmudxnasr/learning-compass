import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { artifactHref, formatDate, percent, roleLabel, statusLabel } from './helpers'
import { PathResponse, PathSource, PathStage, ThreadLesson, ThreadProject } from './types'

export function LearnThreadView({ threadId }: { threadId: string }) {
  const path = useData<PathResponse>(`/learning/core/threads/${encodeURIComponent(threadId)}/path`)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)
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

  const selectStage = (stage: PathStage) => { setSelectedStageId(stage.id); setLessonId(null) }
  const continueLearning = () => {
    if (!activeStage) return
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
        <p class="folio-object-kicker">Course path</p>
        {stages.map((stage) => (
          <button
            type="button"
            class={`folio-level-toggle folio-stage-row ${stage.id === activeStage?.id ? 'is-current' : ''}`}
            onClick={() => selectStage(stage)}
            key={stage.id}
          >
            <span>{stage.position === 0 ? '00' : String(stage.position).padStart(2, '0')}</span>
            <span>
              <strong>Level {stage.position} — {stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong>
              <small>{stage.progress.completed}/{stage.progress.total} lessons</small>
            </span>
            <i>{stage.progress.total && stage.progress.completed === stage.progress.total ? <Icon name="check" size={14} /> : stage.id === activeStage?.id ? '●' : '○'}</i>
          </button>
        ))}
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
            onChanged={path.reload}
          />
        ) : (
          <Empty title="Start your learning path" body="This course has no levels yet." />
        )}
      </main>
    </div>
  </section>
}

function StageView({ stage, threadId, onLesson, onChanged }: { stage: PathStage; threadId: string; onLesson: (lesson: ThreadLesson) => void; onChanged: () => void }) {
  return <>
    <header class="course-stage-header">
      <p class="folio-object-kicker">Level {stage.position}</p>
      <h2>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h2>
      <p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p>
      <span>{stage.progress.completed} / {stage.progress.total} lessons</span>
    </header>
    <section class="course-lessons">
      <div class="folio-section-head">
        <div>
          <p class="folio-object-kicker">Lessons</p>
          <h3>Learn in sequence</h3>
        </div>
      </div>
      {stage.lessons.map((lesson) => (
        <button
          type="button"
          class={`course-lesson ${lesson.status === 'completed' ? 'is-complete' : ''}`}
          onClick={() => onLesson(lesson)}
          key={lesson.id}
        >
          <span class="course-lesson-number">
            {lesson.status === 'completed' ? <Icon name="check" size={14} /> : String(lesson.position + 1).padStart(2, '0')}
          </span>
          <strong class="course-lesson-title">{lesson.title}</strong>
          <small class="course-lesson-source-count">
            {lesson.sources?.length ? `${lesson.sources.length} ${lesson.sources.length === 1 ? 'source' : 'sources'} · Study material available` : 'No source selected yet'}
          </small>
        </button>
      ))}
    </section>
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

