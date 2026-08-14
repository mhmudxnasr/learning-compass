import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
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
      <a class="folio-back-link" href="#/learn">Back to learning paths</a>
      <p class="folio-object-kicker">Course · {statusLabel(thread.status)}</p>
      <h1 id="thread-title">{thread.title}</h1>
      <p class="folio-thread-question">{thread.guiding_question || 'A guided path from first principles to practical use.'}</p>
      <div class="course-progress"><span><strong>{completedLessons}/{totalLessons}</strong> lessons completed</span><span>{percent(completedLessons, totalLessons)}%</span></div>
      <button class="button primary folio-primary" type="button" onClick={continueLearning}>{activeStage?.lessons.some((lesson) => lesson.status !== 'completed') ? 'Continue learning' : 'Review course'}</button>
      {message && <output class="folio-status" aria-live="polite">{message}</output>}
    </header>

    <div class="course-layout">
      <aside class="course-map" aria-label="Course path"><p class="folio-object-kicker">Course path</p>{stages.map((stage) => <button type="button" class={`folio-level-toggle folio-stage-row ${stage.id === activeStage?.id ? 'is-current' : ''}`} onClick={() => selectStage(stage)} key={stage.id}><span>{stage.position === 0 ? '00' : String(stage.position).padStart(2, '0')}</span><span><strong>Level {stage.position} — {stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong><small>{stage.progress.completed}/{stage.progress.total} lessons</small></span><i>{stage.progress.total && stage.progress.completed === stage.progress.total ? '✓' : stage.id === activeStage?.id ? '●' : '○'}</i></button>)}<ProjectCard project={finalProject} threadId={threadId} onChanged={path.reload} /></aside>
      <main class="course-main">
        {activeLesson ? <LessonView lesson={activeLesson} stage={activeStage!} threadId={threadId} onBack={() => setLessonId(null)} onChanged={path.reload} /> : activeStage ? <StageView stage={activeStage} threadId={threadId} onLesson={(lesson) => setLessonId(lesson.id)} onChanged={path.reload} /> : <Empty title="Start your learning path" body="This course has no levels yet." />}
      </main>
    </div>
  </section>
}

function StageView({ stage, threadId, onLesson, onChanged }: { stage: PathStage; threadId: string; onLesson: (lesson: ThreadLesson) => void; onChanged: () => void }) {
  return <><header class="course-stage-header"><p class="folio-object-kicker">Level {stage.position}</p><h2>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h2><p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p><span>{stage.progress.completed} / {stage.progress.total} lessons</span></header><section class="course-lessons"><div class="folio-section-head"><div><p class="folio-object-kicker">Lessons</p><h3>Learn in sequence</h3></div></div>{stage.lessons.map((lesson) => <button type="button" class={`course-lesson ${lesson.status === 'completed' ? 'is-complete' : ''}`} onClick={() => onLesson(lesson)} key={lesson.id}><span>{lesson.status === 'completed' ? '✓' : String(lesson.position + 1).padStart(2, '0')}</span><strong>{lesson.title}</strong><small>{lesson.sources?.length ? 'Study material available' : 'No source selected yet'}</small></button>)}</section><ProjectCard project={stage.projects[0]} threadId={threadId} onChanged={onChanged} /></>
}

function LessonView({ lesson, stage, threadId, onBack, onChanged }: { lesson: ThreadLesson; stage: PathStage; threadId: string; onBack: () => void; onChanged: () => void }) {
  const complete = async () => { await api(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }); onChanged() }
  return <article class="course-lesson-page"><button class="folio-back-link" type="button" onClick={onBack}>← {stage.title}</button><p class="folio-object-kicker">Lesson {String(lesson.position + 1).padStart(2, '0')}</p><h2>{lesson.title}</h2>{lesson.estimated_minutes && <span class="lesson-duration">{lesson.estimated_minutes} min</span>}<div class="lesson-orientation"><div><small>Why learn this</small><p>{lesson.why_learn || 'This lesson builds the next piece of understanding in the course.'}</p></div><div><small>Why now</small><p>{lesson.why_now || 'This lesson prepares you for the next step.'}</p></div><div><small>What you should get</small><p>{lesson.takeaway || lesson.objective || lesson.description || 'A clear working understanding you can use in the next lesson.'}</p></div></div>{lesson.content ? <div class="lesson-content">{lesson.content}</div> : <div class="lesson-placeholder">Study this lesson, then mark it complete when you are ready to continue.</div>}{lesson.sources?.length ? <SourceSection sources={lesson.sources} /> : <p class="folio-empty-line">No source selected for this lesson yet.</p>}<button class="button primary folio-primary" type="button" onClick={complete}>{lesson.status === 'completed' ? 'Completed' : 'Mark lesson complete'}</button></article>
}

function ProjectCard({ project, threadId, onChanged }: { project?: ThreadProject; threadId: string; onChanged: () => void }) {
  if (!project) return null
  const setStatus = async (status: ThreadProject['status']) => { await api(`/learning/core/threads/${encodeURIComponent(threadId)}/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); onChanged() }
  return <section class="course-project"><p class="folio-object-kicker">{project.type === 'final' ? 'Final mastery project' : 'Level project'}</p><h3>{project.title}</h3><p>{project.description}</p>{project.objective && <small>{project.objective}</small>}<span class="project-status">{statusLabel(project.status)}</span><div><button class="button secondary" type="button" onClick={() => setStatus(project.status === 'in_progress' ? 'completed' : 'in_progress')}>{project.status === 'in_progress' ? 'Mark project complete' : project.status === 'completed' ? 'Completed' : 'Start project'}</button>{project.status === 'not_started' && <button class="button quiet" type="button" onClick={() => setStatus('deferred')}>I’ll do this later</button>}</div></section>
}

function SourceSection({ sources }: { sources: PathSource[] }) {
  return <section class="course-sources"><div class="folio-section-head"><div><p class="folio-object-kicker">Study material</p><h3>For this lesson</h3></div></div>{sources.length ? <ul>{sources.map((source) => <li key={source.recommendation_id}><span><small>{roleLabel(source.role)}</small><strong>{source.video_title || 'Untitled source'}</strong><em>{source.content_type || 'Source'}</em></span><div>{source.video_url && <a href={source.video_url} target="_blank" rel="noreferrer">Original ↗</a>}{source.artifacts?.html && <a href={artifactHref(source.artifacts.html.id)} target="_blank" rel="noreferrer">HTML ↗</a>}{source.artifacts?.pdf && <a href={artifactHref(source.artifacts.pdf.id)} target="_blank" rel="noreferrer">PDF ↗</a>}{source.notebook_url && <a href={source.notebook_url} target="_blank" rel="noreferrer">NotebookLM ↗</a>}</div></li>)}</ul> : <p class="folio-empty-line">Hermes has not curated material for this lesson yet.</p>}</section>
}
