import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { useData } from '../../app/useData'
import { formatDate, percent, statusLabel, threadHref } from './helpers'
import { PathHubResponse, PathRecord } from './types'

type InterviewValues = {
  title: string
  question: string
  definition: string
  depth: 'survey' | 'solid' | 'deep'
  priorKnowledge: string
  useCase: string
  constraints: string
  threadType: 'understand' | 'decide' | 'build' | 'practice'
}
const initialInterview: InterviewValues = {
  title: '',
  question: '',
  definition: '',
  depth: 'deep',
  priorKnowledge: '',
  useCase: '',
  constraints: '',
  threadType: 'understand',
}

export function LearnPathsView() {
  const hub = useData<PathHubResponse>('/learning/core/hub')
  const [interviewOpen, setInterviewOpen] = useState(false)
  const [values, setValues] = useState<InterviewValues>(initialInterview)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  if (hub.loading && !hub.data) return <Loading label="Loading Learning Threads" />
  if (hub.error && !hub.data) return <ErrorState message={hub.error} retry={hub.reload} />

  const paths = hub.data?.paths || []
  const update = <K extends keyof InterviewValues>(key: K, value: InterviewValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const createPath = async (event: Event) => {
    event.preventDefault()
    if (!values.title.trim() || !values.question.trim() || !values.definition.trim()) return
    setWorking(true)
    setMessage('Creating Thread…')
    const brief = [
      `Depth: ${values.depth === 'survey' ? 'just enough to understand' : values.depth === 'solid' ? 'solid working knowledge' : 'deep study'}`,
      values.priorKnowledge.trim() ? `Prior knowledge: ${values.priorKnowledge.trim()}` : '',
      values.useCase.trim() ? `Use case: ${values.useCase.trim()}` : '',
      values.constraints.trim() ? `Constraints and source preferences: ${values.constraints.trim()}` : '',
    ].filter(Boolean).join('\n')
    try {
      const result = await api<{ id: string }>('/learning/core/threads', {
        method: 'POST',
        body: JSON.stringify({
          title: values.title.trim(),
          guiding_question: values.question.trim(),
          why_now: brief,
          definition_of_done: values.definition.trim(),
          thread_type: values.threadType,
          activate: true,
        }),
      })
      setValues(initialInterview)
      setInterviewOpen(false)
      setMessage('Path created. Opening its first level…')
      location.hash = threadHref(result.id)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The Thread could not be created.')
    } finally {
      setWorking(false)
    }
  }

  return <section class="learn-workspace folio-learn folio-paths" aria-labelledby="learn-Threads-title">
    <header class="learn-surface-head folio-surface-head">
      <div>
        <p class="folio-object-kicker">Learn / Threads</p>
        <h1 id="learn-Threads-title">Build a Thread that can prove itself.</h1>
        <p class="folio-lede">A curriculum map for the question, decision, build, or capability you are working toward. Progress comes from evidence, not from opening sources.</p>
      </div>
      <button class="button primary folio-primary" type="button" onClick={() => { setInterviewOpen((open) => !open); setMessage('') }} aria-expanded={interviewOpen} aria-controls="new-Thread-interview">
        {interviewOpen ? 'Close interview' : 'New Thread'}
      </button>
    </header>

    {message && <output class="folio-status" aria-live="polite">{message}</output>}

    {interviewOpen && <form id="new-Thread-interview" class="folio-interview" onSubmit={createPath} aria-labelledby="new-Thread-title">
      <div class="folio-interview-intro">
        <p class="folio-object-kicker">Before the first level</p>
        <h3 id="new-Thread-title">Name the proof you want from this path.</h3>
        <p>This short interview becomes the Thread brief. Keep it specific enough to guide source roles and later evidence.</p>
      </div>
      <div class="folio-form-fields">
        <label>Path title<input value={values.title} onInput={(event) => update('title', (event.target as HTMLInputElement).value)} required /></label>
        <label>Thread type<select value={values.threadType} onChange={(event) => update('threadType', (event.target as HTMLSelectElement).value as InterviewValues['threadType'])}><option value="understand">Understand</option><option value="decide">Decide</option><option value="build">Build</option><option value="practice">Practice</option></select></label>
        <label class="folio-field-wide">Guiding question<textarea value={values.question} onInput={(event) => update('question', (event.target as HTMLTextAreaElement).value)} required /></label>
        <label>Desired depth<select value={values.depth} onChange={(event) => update('depth', (event.target as HTMLSelectElement).value as InterviewValues['depth'])}><option value="survey">Survey</option><option value="solid">Solid working knowledge</option><option value="deep">Deep study</option></select></label>
        <label>What do you already know?<textarea value={values.priorKnowledge} onInput={(event) => update('priorKnowledge', (event.target as HTMLTextAreaElement).value)} /></label>
        <label>Where will you use it?<textarea value={values.useCase} onInput={(event) => update('useCase', (event.target as HTMLTextAreaElement).value)} /></label>
        <label>Constraints or source preferences<textarea value={values.constraints} onInput={(event) => update('constraints', (event.target as HTMLTextAreaElement).value)} /></label>
        <label class="folio-field-wide">Definition of competence<textarea value={values.definition} onInput={(event) => update('definition', (event.target as HTMLTextAreaElement).value)} required /></label>
      </div>
      <div class="folio-form-actions">
        <button class="button primary folio-primary" type="submit" disabled={working || !values.title.trim() || !values.question.trim() || !values.definition.trim()}>{working ? 'Creating…' : 'Create learning Thread'}</button>
        <span>Creating a Thread activates it and pauses any other active path.</span>
      </div>
    </form>}

    <section class="folio-ledger-section" aria-labelledby="active-Threads-title">
      <div class="folio-section-head"><div><p class="folio-object-kicker">Curriculum ledger</p><h3 id="active-Threads-title">Your Threads</h3></div><span class="folio-measure">{paths.length} {paths.length === 1 ? 'Thread' : 'Threads'}</span></div>
      {paths.length ? <ol class="folio-object-ledger">
        {paths.map((path) => <PathRow key={path.id} path={path} />)}
      </ol> : <Empty title="No Learning Threads yet" body="Start with a question and a definition of competence. The first level can stay small; the evidence contract will make the next step visible." action={<button class="button primary folio-primary" type="button" onClick={() => setInterviewOpen(true)}>Start the interview</button>} />}
    </section>
  </section>
}

function PathRow({ path }: { path: PathRecord }) {
  const stageCount = Number(path.stage_count || 0)
  const completedCount = Number(path.completed_stage_count || 0)
  const completion = percent(completedCount, stageCount)
  const statusKey = (path.status || 'draft').toLowerCase().replace(/\s+/g, '_')
  const threadType = path.thread_type || 'understand'
  const currentStageDisplay = path.current_stage_title || (stageCount > 0 ? 'No level started' : 'Planned')
  const stageStatus = path.current_stage_status ? statusLabel(path.current_stage_status) : (path.updated_at ? `Updated ${formatDate(path.updated_at)}` : '')

  return (
    <li class={`folio-object-row folio-path-row status-${statusKey}`}>
      <a href={threadHref(path.id)} aria-label={`Open learning Thread ${path.title}`}>
        <span class={`folio-row-mark folio-mark-path status-${statusKey}`} aria-hidden="true" />

        <div class="folio-row-main">
          <div class="folio-row-type-line">
            <span class={`folio-status-tag status-${statusKey}`}>
              <i class="folio-tag-dot" aria-hidden="true" />
              {statusLabel(path.status)}
            </span>
            <span class="folio-type-tag">
              {threadType}
            </span>
          </div>

          <strong class="folio-path-title">{path.title}</strong>

          {path.guiding_question && (
            <p class="folio-path-question">{path.guiding_question}</p>
          )}

          {path.definition_of_done && (
            <p class="folio-path-proof-line">
              <span class="folio-proof-tag">Proof</span>
              <span>{path.definition_of_done}</span>
            </p>
          )}
        </div>

        <div class="folio-row-progress-block">
          <div class="folio-progress-track" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${completion}%` }} />
          </div>
          <span class="folio-progress-stats">{completedCount}/{stageCount || 0} levels · {completion}%</span>
        </div>

        <div class="folio-row-tail">
          <strong class="folio-tail-stage">{currentStageDisplay}</strong>
          {stageStatus && <small class="folio-tail-status">{stageStatus}</small>}
        </div>

        <span class="folio-row-chevron" aria-hidden="true">→</span>
      </a>
    </li>
  )
}
