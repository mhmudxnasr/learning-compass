import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { formatDate, lessonHref, percent, statusLabel, threadHref } from './helpers'
import { threadTabHref } from './threadViewModel'
import { NewThreadForm } from './NewThreadForm'
import type { PathHubResponse, PathRecord } from './types'

const filters = [
  { key: 'active', label: 'In progress' },
  { key: 'draft', label: 'Planning' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]
const preferenceKey = 'compass-thread-desk-v1'
function savedPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}')
    return {
      filter: filters.some((filter) => filter.key === saved?.filter) ? saved.filter : 'active',
      query: typeof saved?.query === 'string' ? saved.query : '',
      sort: ['priority', 'recent', 'title'].includes(saved?.sort) ? saved.sort : 'priority',
    }
  } catch {
    return {}
  }
}

export function LearnPathsView() {
  const hub = useData<PathHubResponse>('/learning/core/hub')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState(() => savedPreferences().filter || 'active')
  const [query, setQuery] = useState(() => savedPreferences().query || '')
  const [sort, setSort] = useState(() => savedPreferences().sort || 'priority')
  const [readiness, setReadiness] = useState('all')
  const [limit, setLimit] = useState(24)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState('')
  const restored = useRef(false)
  const createButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ filter, query, sort }))
    } catch {
      /* Preferences are optional in private browsing. */
    }
    setLimit(24)
  }, [filter, query, sort, readiness])
  useEffect(() => {
    if (!hub.data || restored.current) return
    restored.current = true
    try {
      const id = sessionStorage.getItem('compass-thread-return')
      if (id) document.getElementById(`desk-${id}`)?.scrollIntoView({ block: 'nearest' })
    } catch {
      /* Returning still works without storage. */
    }
  }, [hub.data])

  if (hub.loading && !hub.data) return <Loading label="Loading Learning Threads" />
  if (hub.error && !hub.data) return <ErrorState message={hub.error} retry={hub.reload} />
  const paths = hub.data?.paths || []
  const active = paths.filter((path) => path.status === 'active')
  const visible = paths
    .filter(
      (path) =>
        (filter === 'all' || path.status === filter) &&
        `${path.title} ${path.guiding_question || ''} ${path.next_lesson?.title || ''} ${path.thread_type || ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()) &&
        (readiness === 'all' ||
          (readiness === 'gaps'
            ? Number(path.needs_material_count) > 0
            : ['ready', 'in_progress'].includes(path.next_lesson?.readiness || ''))),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'recent'
          ? (b.last_studied_at || '').localeCompare(a.last_studied_at || '') || a.title.localeCompare(b.title)
          : Number(b.priority || 0) - Number(a.priority || 0) ||
            (b.last_studied_at || '').localeCompare(a.last_studied_at || '') ||
            a.title.localeCompare(b.title),
    )

  const mutate = async (path: PathRecord, body: { priority: number } | { status: string }) => {
    setWorking(path.id)
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.id)}${'status' in body ? '/status' : ''}`, {
        method: 'status' in body ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
      })
      setMessage(`${path.title}: ${'status' in body ? statusLabel(body.status) : 'priority saved'}.`)
      hub.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update Thread.')
    } finally {
      setWorking('')
    }
  }

  return (
    <section class="learn-workspace folio-paths thread-desk" aria-labelledby="learn-threads-title">
      <header class="thread-desk-heading">
        <div>
          <span class="desk-eyebrow">Your learning workspace</span>
          <h1 id="learn-threads-title">Learning Threads</h1>
          <p>Continue a lesson or plan your next question.</p>
        </div>
        <button
          ref={createButton}
          class="button primary thread-desk-create"
          aria-label="New Thread"
          onClick={() => setCreating(true)}
        >
          <Icon name="capture" size={17} />
          <span>New Thread</span>
        </button>
      </header>
      {creating && (
        <NewThreadForm
          onClose={() => {
            setCreating(false)
            createButton.current?.focus()
          }}
        />
      )}
      <div class="thread-desk-pulse" aria-label="Learning overview">
        <span>
          <strong>{active.length}</strong> active Threads
        </span>
        <span>
          <strong>
            {active.filter((path) => ['ready', 'in_progress'].includes(path.next_lesson?.readiness || '')).length}
          </strong>{' '}
          ready to continue
        </span>
        <span>
          <strong>{paths.filter((path) => path.status === 'draft').length}</strong> in planning
        </span>
      </div>
      <div class="thread-desk-toolbar">
        <div class="thread-desk-filters" aria-label="Thread status">
          {filters.map((item) => (
            <button
              key={item.key}
              aria-label={item.label}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{item.key === 'all' ? paths.length : paths.filter((path) => path.status === item.key).length}</span>
            </button>
          ))}
        </div>
        <div class="thread-desk-search">
          <Icon name="search" size={17} />
          <input
            type="search"
            id="thread-desk-query"
            aria-label="Search Threads"
            placeholder="Find a Thread or next lesson"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
      </div>
      <div class="thread-desk-options">
        <span>
          {visible.length} {visible.length === 1 ? 'Thread' : 'Threads'}
        </span>
        <label>
          Show{' '}
          <select
            aria-label="Filter by readiness"
            value={readiness}
            onChange={(event) => setReadiness(event.currentTarget.value)}
          >
            <option value="all">Everything</option>
            <option value="ready">Ready to study</option>
            <option value="gaps">Material gaps</option>
          </select>
        </label>
        <label>
          Sort{' '}
          <select aria-label="Sort Threads" value={sort} onChange={(event) => setSort(event.currentTarget.value)}>
            <option value="priority">Priority</option>
            <option value="recent">Last studied</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>
      {message && (
        <p class="desk-feedback" role="status">
          {message}
        </p>
      )}
      {visible.length ? (
        <div class="thread-desk-list">
          {visible.slice(0, limit).map((path) => (
            <ThreadDeskRow
              key={path.id}
              path={path}
              busy={working === path.id}
              onChange={(body) => mutate(path, body)}
            />
          ))}
        </div>
      ) : (
        <Empty
          title={paths.length ? 'No Threads in this view' : 'What do you want to understand?'}
          body={
            paths.length
              ? 'Try another status or clear the filters.'
              : 'Create a Thread around a question, decision, skill, or project. Start with one Level and build from there.'
          }
          action={
            <button
              class="button secondary"
              onClick={() => (paths.length ? (setFilter('all'), setQuery(''), setReadiness('all')) : setCreating(true))}
            >
              {paths.length ? 'Show all Threads' : 'Create your first Thread'}
            </button>
          }
        />
      )}
      {visible.length > limit && (
        <button class="button secondary" onClick={() => setLimit((value) => value + 24)}>
          Show more Threads · {visible.length - limit} remaining
        </button>
      )}
    </section>
  )
}

function ThreadDeskRow({
  path,
  busy,
  onChange,
}: {
  path: PathRecord
  busy: boolean
  onChange: (body: { priority: number } | { status: string }) => void
}) {
  const next = path.next_lesson
  const done = path.status === 'completed'
  const progress = percent(Number(path.completed_lesson_count || 0), Number(path.lesson_count || 0))
  const href = next ? lessonHref(path.id, next.id) : threadTabHref(path.id, done ? 'overview' : 'curriculum')
  const action = done
    ? 'Revisit Thread'
    : !next
      ? 'Build curriculum'
      : next.readiness === 'needs_material'
        ? 'Prepare lesson'
        : next.readiness === 'locked'
          ? 'Preview lesson'
          : 'Continue lesson'
  const remember = () => {
    try {
      sessionStorage.setItem('compass-thread-return', path.id)
    } catch {
      /* Optional navigation memory. */
    }
  }
  return (
    <article class={`thread-desk-row ${done ? 'is-complete' : ''}`} id={`desk-${path.id}`}>
      <div class="thread-desk-identity">
        <div class="desk-row-meta">
          <span class={`desk-state state-${path.status}`}>{statusLabel(path.status)}</span>
          <span>{path.thread_type || 'understand'}</span>
          {Number(path.priority) >= 4 && (
            <span>
              <Icon name="pin" size={12} />
              High priority
            </span>
          )}
        </div>
        <h2>
          <a href={threadHref(path.id)} onClick={remember} dir="auto">
            {path.title}
          </a>
        </h2>
        {path.guiding_question && <p dir="auto">{path.guiding_question}</p>}
        <div class="desk-row-progress">
          <progress aria-label={`${path.title} lesson progress`} value={progress} max={100} />
          <span>
            {path.completed_lesson_count || 0}/{path.lesson_count || 0} lessons
          </span>
          <span>
            {path.stage_count} {path.stage_count === 1 ? 'Level' : 'Levels'}
          </span>
        </div>
        {path.last_studied_at && <small>Last studied {formatDate(path.last_studied_at)}</small>}
      </div>
      <div class="thread-desk-next">
        <span class="desk-eyebrow">
          {done ? 'A path you can return to' : next ? next.stage_title : 'Start with a small first step'}
        </span>
        <h3 dir="auto">{next?.title || (done ? 'Bring your learning back into view' : 'Shape your first Level')}</h3>
        {next?.estimated_minutes ? (
          <span class="desk-duration">
            <Icon name="clock" size={14} />
            {next.estimated_minutes} min
          </span>
        ) : null}
        {next?.readiness === 'needs_material' && (
          <span class="desk-gap">
            <Icon name="warning" size={14} />
            This lesson needs material
          </span>
        )}
        {!!path.future_material_count && (
          <a
            class="desk-future-gap"
            href={`${threadTabHref(path.id, 'curriculum')}&filter=needs_material`}
            onClick={remember}
          >
            {path.future_material_count} future {path.future_material_count === 1 ? 'lesson needs' : 'lessons need'}{' '}
            material
          </a>
        )}
        <a
          class={`button ${path.status === 'active' && next && ['ready', 'in_progress'].includes(next.readiness) ? 'primary' : 'secondary'}`}
          href={href}
          aria-label={`${action}: ${path.title}`}
          onClick={remember}
        >
          {action}
          <Icon name="chevron" size={15} />
        </a>
      </div>
      <details class="thread-desk-manage">
        <summary aria-label={`Manage ${path.title}`}>
          <Icon name="more" size={20} />
        </summary>
        <div>
          <label>
            Priority
            <select
              aria-label={`Priority for ${path.title}`}
              value={path.priority || 0}
              disabled={busy}
              onChange={(event) => onChange({ priority: Number(event.currentTarget.value) })}
            >
              <option value={0}>Normal</option>
              <option value={2}>Medium</option>
              <option value={4}>High</option>
              <option value={5}>First focus</option>
              {[1, 3].includes(Number(path.priority)) && <option value={path.priority}>{path.priority}</option>}
            </select>
          </label>
          {['active', 'paused', 'draft'].includes(path.status) && (
            <button
              class="button secondary"
              disabled={busy}
              onClick={() => onChange({ status: path.status === 'active' ? 'paused' : 'active' })}
            >
              {busy ? 'Saving…' : path.status === 'active' ? 'Pause Thread' : 'Activate Thread'}
            </button>
          )}
          <a href={threadHref(path.id)} onClick={remember}>
            Open overview
          </a>
        </div>
      </details>
    </article>
  )
}
