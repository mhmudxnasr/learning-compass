import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
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

const filterOptions = [
  { key: 'active', label: 'In progress' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]

export function LearnPathsView() {
  const hub = useData<PathHubResponse>('/learning/core/hub')
  const [interviewOpen, setInterviewOpen] = useState(false)
  const [values, setValues] = useState<InterviewValues>(initialInterview)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('active')

  if (hub.loading && !hub.data) return <Loading label="Loading Learning Threads" />
  if (hub.error && !hub.data) return <ErrorState message={hub.error} retry={hub.reload} />

  const paths = hub.data?.paths || []
  const visiblePaths = paths.filter((path) => {
    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'active'
          ? path.status === 'active'
          : filter === 'completed'
            ? path.status === 'completed'
            : path.status === filter
    const matchesQuery =
      !query ||
      `${path.title} ${path.guiding_question || ''} ${path.thread_type || ''}`
        .toLowerCase()
        .includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  })

  const totalCompletedLessons = paths.reduce((sum, p) => sum + (Number(p.completed_lesson_count) || 0), 0)
  const totalLessons = paths.reduce((sum, p) => sum + (Number(p.lesson_count) || 0), 0)
  const activeCount = paths.filter((p) => p.status === 'active').length

  const update = <K extends keyof InterviewValues>(key: K, value: InterviewValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const createPath = async (event: Event) => {
    event.preventDefault()
    if (!values.title.trim() || !values.question.trim() || !values.definition.trim()) return
    setWorking(true)
    setMessage('Creating learning Thread…')
    const brief = [
      `Depth: ${values.depth === 'survey' ? 'just enough to understand' : values.depth === 'solid' ? 'solid working knowledge' : 'deep study'}`,
      values.priorKnowledge.trim() ? `Prior knowledge: ${values.priorKnowledge.trim()}` : '',
      values.useCase.trim() ? `Use case: ${values.useCase.trim()}` : '',
      values.constraints.trim() ? `Constraints and source preferences: ${values.constraints.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')

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
      setMessage('Thread created. Opening curriculum…')
      location.hash = threadHref(result.id)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The Thread could not be created.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section class="learn-workspace folio-learn folio-paths" aria-labelledby="learn-threads-title">
      <header class="learn-surface-head folio-surface-head thread-index-head">
        <div class="learn-header-content">
          <h1 id="learn-threads-title">Learning Threads</h1>
          <p class="folio-lede">Continue an active path, inspect its lessons, or return to a completed Thread.</p>
          <div class="thread-index-summary" aria-label="Learning Thread summary">
            <span>
              <strong>{activeCount}</strong> in progress
            </span>
            <span>
              <strong>
                {totalCompletedLessons} of {totalLessons}
              </strong>{' '}
              lessons complete
            </span>
            <span>
              <strong>{percent(totalCompletedLessons, totalLessons)}%</strong> overall
            </span>
          </div>
        </div>
        <button
          class="button primary folio-primary thread-new-btn"
          type="button"
          onClick={() => {
            setInterviewOpen((open) => !open)
            setMessage('')
          }}
          aria-expanded={interviewOpen}
          aria-controls="new-thread-interview"
        >
          <Icon name={interviewOpen ? 'close' : 'spark'} size={15} />
          <span>{interviewOpen ? 'Close interview' : 'New Thread'}</span>
        </button>
      </header>

      {message && (
        <output class="folio-status" aria-live="polite">
          {message}
        </output>
      )}

      {interviewOpen && (
        <form
          id="new-thread-interview"
          class="folio-interview thread-creation-panel"
          onSubmit={createPath}
          aria-labelledby="new-thread-title"
        >
          <div class="folio-interview-intro">
            <p class="folio-object-kicker">Thread Design Brief</p>
            <h3 id="new-thread-title">Define the goal and scope of this Thread</h3>
            <p>This blueprint structures the Levels, sequential lessons, and primary study companions.</p>
          </div>

          <div class="folio-form-grid">
            <fieldset class="thread-form-section">
              <legend>1. Core Identity</legend>
              <div class="folio-form-fields">
                <label>
                  <span>Thread Title</span>
                  <input
                    value={values.title}
                    onInput={(event) => update('title', (event.target as HTMLInputElement).value)}
                    placeholder="e.g. Distributed Consensus in Cloudflare Workers"
                    required
                  />
                </label>
                <label>
                  <span>Thread Type</span>
                  <select
                    value={values.threadType}
                    onChange={(event) =>
                      update('threadType', (event.target as HTMLSelectElement).value as InterviewValues['threadType'])
                    }
                  >
                    <option value="understand">Understand (Deep conceptual grasp)</option>
                    <option value="build">Build (Hands-on implementation)</option>
                    <option value="decide">Decide (Architectural decision-making)</option>
                    <option value="practice">Practice (Skill refinement)</option>
                  </select>
                </label>
                <label class="folio-field-wide">
                  <span>Guiding Question</span>
                  <textarea
                    value={values.question}
                    onInput={(event) => update('question', (event.target as HTMLTextAreaElement).value)}
                    placeholder="What core question will this Thread conclusively answer?"
                    rows={2}
                    required
                  />
                </label>
              </div>
            </fieldset>

            <fieldset class="thread-form-section">
              <legend>2. Depth & Target Outcome</legend>
              <div class="folio-form-fields">
                <label>
                  <span>Target Depth</span>
                  <select
                    value={values.depth}
                    onChange={(event) =>
                      update('depth', (event.target as HTMLSelectElement).value as InterviewValues['depth'])
                    }
                  >
                    <option value="survey">Survey (High-level working orientation)</option>
                    <option value="solid">Solid Working Knowledge (Practical proficiency)</option>
                    <option value="deep">Deep Study (First-principles mastery)</option>
                  </select>
                </label>
                <label class="folio-field-wide">
                  <span>Definition of Done (Target Outcome)</span>
                  <textarea
                    value={values.definition}
                    onInput={(event) => update('definition', (event.target as HTMLTextAreaElement).value)}
                    placeholder="What will you be able to explain, build, or decide once this Thread is finished?"
                    rows={2}
                    required
                  />
                </label>
              </div>
            </fieldset>

            <fieldset class="thread-form-section">
              <legend>3. Background Context & Sources</legend>
              <div class="folio-form-fields">
                <label>
                  <span>Prior Knowledge</span>
                  <textarea
                    value={values.priorKnowledge}
                    onInput={(event) => update('priorKnowledge', (event.target as HTMLTextAreaElement).value)}
                    placeholder="What relevant fundamentals do you already have?"
                    rows={2}
                  />
                </label>
                <label>
                  <span>Practical Use Case</span>
                  <textarea
                    value={values.useCase}
                    onInput={(event) => update('useCase', (event.target as HTMLTextAreaElement).value)}
                    placeholder="Where will you apply this immediately?"
                    rows={2}
                  />
                </label>
                <label class="folio-field-wide">
                  <span>Constraints & Source Preferences</span>
                  <textarea
                    value={values.constraints}
                    onInput={(event) => update('constraints', (event.target as HTMLTextAreaElement).value)}
                    placeholder="Preferred authors, primary sources, or format constraints (papers, companions, docs)"
                    rows={2}
                  />
                </label>
              </div>
            </fieldset>
          </div>

          <div class="folio-form-actions">
            <button
              class="button primary folio-primary"
              type="submit"
              disabled={working || !values.title.trim() || !values.question.trim() || !values.definition.trim()}
            >
              {working ? 'Creating Thread…' : 'Create Learning Thread'}
            </button>
            <button class="button secondary" type="button" onClick={() => setInterviewOpen(false)}>
              Cancel
            </button>
            <span class="thread-form-note">
              Creating a Thread sets it as active and prepares its sequential curriculum.
            </span>
          </div>
        </form>
      )}

      <section class="folio-ledger-section thread-index-ledger" aria-labelledby="active-threads-title">
        <div class="folio-section-head thread-index-ledger-head">
          <div>
            <h2 id="active-threads-title">Your Threads</h2>
            <p>Open one Thread to see its exact next lesson and complete path.</p>
          </div>
          <span class="folio-measure">
            {visiblePaths.length} of {paths.length}
          </span>
        </div>
        <div class="thread-filter-toolbar">
          <div class="thread-filter-tabs" role="tablist">
            {filterOptions.map((opt) => (
              <button
                type="button"
                key={opt.key}
                class={`thread-filter-tab-btn ${filter === opt.key ? 'is-active' : ''}`}
                onClick={() => setFilter(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div class="thread-search-box">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              placeholder="Search by title, question, or type…"
              aria-label="Search Threads"
            />
            {query && (
              <button class="thread-search-clear" type="button" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
        </div>

        {visiblePaths.length ? (
          <div class="folio-path-list">
            {visiblePaths.map((path) => (
              <PathRow key={path.id} path={path} />
            ))}
          </div>
        ) : (
          <Empty
            title={
              query
                ? 'No matching Threads'
                : paths.length
                  ? `No ${filterOptions.find((option) => option.key === filter)?.label.toLowerCase()} Threads`
                  : 'No Learning Threads yet'
            }
            body={
              query
                ? `No Threads match "${query}" in this view.`
                : paths.length
                  ? 'Choose another status to see the rest of your Threads.'
                  : 'Start with one question or capability. Learning Compass will shape it into progressive Levels and lessons.'
            }
            action={
              paths.length ? (
                <button
                  class="button secondary"
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  Show all Threads
                </button>
              ) : (
                <button class="button primary folio-primary" type="button" onClick={() => setInterviewOpen(true)}>
                  Create your first Thread
                </button>
              )
            }
          />
        )}
      </section>
    </section>
  )
}

function PathRow({ path }: { path: PathRecord }) {
  const stageCount = Number(path.stage_count || 0)
  const completedStageCount = Number(path.completed_stage_count || 0)
  const lessonCount = Number(path.lesson_count || 0)
  const completedLessonCount = Number(path.completed_lesson_count || 0)
  const completion = percent(completedLessonCount, lessonCount)
  const statusKey = (path.status || 'draft').toLowerCase().replace(/\s+/g, '_')
  const threadType = path.thread_type || 'understand'
  const currentStageDisplay =
    path.current_stage_title || (stageCount > 0 ? 'Curriculum ready to inspect' : 'Curriculum in design')
  const stageStatus = path.current_stage_status
    ? statusLabel(path.current_stage_status)
    : path.updated_at
      ? `Updated ${formatDate(path.updated_at)}`
      : ''
  const actionLabel =
    path.status === 'completed'
      ? 'Review Thread'
      : path.status === 'active'
        ? 'Continue Thread'
        : path.status === 'draft'
          ? 'Build Thread'
          : 'Open Thread'

  return (
    <article class={`folio-path-card status-${statusKey}`}>
      <a href={threadHref(path.id)} aria-label={`${actionLabel}: ${path.title}`}>
        <div class="folio-path-main">
          <div class="folio-path-badges">
            <span class={`folio-status-tag status-${statusKey}`}>
              <i class="folio-tag-dot" aria-hidden="true" />
              {statusLabel(path.status)}
            </span>
            <span class="folio-type-tag">{threadType}</span>
            {path.needs_material_count && path.needs_material_count > 0 ? (
              <span class="folio-warning-tag">{path.needs_material_count} need material</span>
            ) : null}
          </div>

          <h3 class="folio-path-title" dir="auto">
            {path.title}
          </h3>
          {path.guiding_question && (
            <p class="folio-path-question" dir="auto">
              {path.guiding_question}
            </p>
          )}
        </div>

        <div class="folio-path-meta-side">
          <div class="folio-path-current-stage">
            <span class="folio-path-stage-kicker">Current Level</span>
            <strong class="folio-path-stage-title">{currentStageDisplay}</strong>
            {stageStatus && <small class="folio-path-stage-status">{stageStatus}</small>}
          </div>
          <div class="folio-path-progress-box">
            <div
              class="folio-path-progress-bar"
              role="progressbar"
              aria-label={`${path.title} lesson progress`}
              aria-valuenow={completion}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${completion}%` }} />
            </div>
            <div class="folio-path-progress-labels">
              <span>
                <strong>
                  {completedLessonCount}/{lessonCount}
                </strong>{' '}
                lessons
              </span>
              <span>
                <strong>
                  {completedStageCount}/{stageCount}
                </strong>{' '}
                Levels
              </span>
            </div>
          </div>
        </div>

        <span class="folio-path-open-label" aria-hidden="true">
          <span>{actionLabel}</span>
          <Icon name="chevron" size={15} />
        </span>
      </a>
    </article>
  )
}
