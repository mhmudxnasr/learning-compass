import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { uploadArtifact } from '../../app/upload'
import { routeHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { artifactHref, cardHref, cleanTitle, lessonHref, lessonReadiness, noteHref, percent, roleLabel, statusLabel } from './helpers'
import { buildSourceMaterialLauncher, SourceMaterialKind } from './sourceMaterials'
import { NoteRecord, PathArtifact, PathResponse, PathSource, PathStage, RecallCard, RecallDraft, ThreadLesson, ThreadProject } from './types'
import { ThreadAuthoring } from './ThreadAuthoring'

export function LearnThreadView({
  threadId,
  levelId: routeLevelId,
  lessonId: routeLessonId,
  tab,
  focusLevelId,
}: {
  threadId: string
  levelId?: string
  lessonId?: string
  tab?: string
  focusLevelId?: string
}) {
  const path = useData<PathResponse>(`/learning/core/threads/${encodeURIComponent(threadId)}/path`)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(routeLevelId || null)
  const [lessonId, setLessonId] = useState<string | null>(routeLessonId || null)

  useEffect(() => setSelectedStageId(routeLevelId || null), [routeLevelId])
  useEffect(() => setLessonId(routeLessonId || null), [routeLessonId])

  if (path.loading && !path.data) return <Loading label="Loading Thread curriculum" />
  if (path.error && !path.data) return <ErrorState message={path.error} retry={path.reload} />
  if (!path.data) {
    return (
      <Empty
        title="This Learning Thread is unavailable"
        body="The Thread may have been archived, moved, or the link may be incomplete."
        action={<a class="button secondary" href={routeHref('learn', 'paths')}>Return to Threads</a>}
      />
    )
  }

  const { stages } = path.data
  const lessonStage = lessonId ? stages.find((stage) => stage.lessons.some((lesson) => lesson.id === lessonId)) : undefined
  const activeStage = stages.find((stage) => stage.id === selectedStageId) || lessonStage || path.data.current_stage || stages[0]
  const activeLesson = activeStage?.lessons.find((lesson) => lesson.id === lessonId)

  if (!routeLevelId && !routeLessonId) {
    return <ThreadCommandCenter path={path.data} tab={tab} focusLevelId={focusLevelId} onChanged={path.reload} />
  }

  return (
    <section class="learn-workspace folio-learn folio-thread course-thread">
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
          <Empty title="Start your learning path" body="This Thread has no levels yet. Add a level to begin." />
        )}
      </main>
      {!activeLesson && (
        <>
          <LevelList threadId={threadId} stages={stages} activeStage={activeStage} />
          <ThreadMaterialLedger path={path.data} onChanged={path.reload} />
        </>
      )}
    </section>
  )
}

const threadTabs = [
  { key: 'overview', label: 'Now' },
  { key: 'curriculum', label: 'Lessons' },
  { key: 'practice', label: 'Projects' },
  { key: 'materials', label: 'Resources' },
] as const
type ThreadTabKey = (typeof threadTabs)[number]['key']

function levelTitle(stage: PathStage) {
  return stage.title.replace(/^Level \d+\s*[—-]\s*/, '')
}

function threadTabHref(threadId: string, tab: ThreadTabKey, levelId?: string) {
  const query = new URLSearchParams({ tab })
  if (levelId) query.set('level', levelId)
  return `#/learn/thread/${encodeURIComponent(threadId)}?${query.toString()}`
}

function persistThreadLevelFocus(threadId: string, tab: ThreadTabKey, levelId: string) {
  const href = threadTabHref(threadId, tab, levelId)
  if (window.location.hash !== href) window.history.replaceState(window.history.state, '', href)
}

function domId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function materialExcerpt(value: string | null | undefined, fallback: string) {
  const plain = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return fallback
  return plain.length > 220 ? `${plain.slice(0, 217).trimEnd()}…` : plain
}

function completedLessonCount(stage: PathStage) {
  return Number(stage.progress?.study_completed ?? stage.lessons.filter((lesson) => lesson.status === 'completed').length)
}

function threadNextLesson(path: PathResponse) {
  const lessons = path.stages.flatMap((stage) => stage.lessons.map((lesson) => ({ stage, lesson })))
  return (
    lessons.find(({ lesson }) => lesson.status === 'in_progress') ||
    lessons.find(
      ({ stage, lesson }) =>
        ['available', 'in_progress'].includes(stage.status) &&
        lesson.status !== 'completed' &&
        lessonReadiness(lesson) !== 'needs_material',
    ) ||
    lessons.find(({ lesson }) => lesson.status !== 'completed')
  )
}

function threadMaterialTotals(path: PathResponse) {
  return path.stages.reduce(
    (totals, stage) => {
      totals.notes += stage.notes.length
      totals.files += stage.files.length
      totals.cards += stage.cards.length
      totals.drafts += stage.recall_drafts.length
      for (const lesson of stage.lessons) {
        totals.notes += lesson.notes?.length || 0
        totals.files += lesson.files?.length || 0
        totals.cards += lesson.cards?.length || 0
        totals.drafts += lesson.recall_drafts?.length || 0
      }
      return totals
    },
    {
      notes: path.notes.length,
      files: path.files.length,
      cards: path.cards.length,
      drafts: path.recall_drafts.length,
    },
  )
}

function threadSourceCount(path: PathResponse) {
  return path.stages.reduce(
    (total, stage) =>
      total +
      stage.sources.length +
      stage.lessons.reduce((lessonTotal, lesson) => lessonTotal + (lesson.sources?.length || 0), 0),
    0,
  )
}

function lessonActionLabel(lesson: ThreadLesson) {
  const readiness = lessonReadiness(lesson)
  if (readiness === 'completed') return 'Review'
  if (readiness === 'in_progress') return 'Continue'
  if (readiness === 'needs_material') return 'Review gap'
  return 'Open lesson'
}

function ThreadCommandCenter({
  path,
  tab,
  focusLevelId,
  onChanged,
}: {
  path: PathResponse
  tab?: string
  focusLevelId?: string
  onChanged: () => void
}) {
  const activeTab: ThreadTabKey = threadTabs.some((t) => t.key === tab) ? (tab as ThreadTabKey) : 'overview'
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')
  const thread = path.thread

  const completedLessons = path.stages.reduce(
    (sum, stage) =>
      sum + Number(stage.progress?.study_completed ?? stage.lessons.filter((lesson) => lesson.status === 'completed').length),
    0
  )
  const totalLessons = path.stages.reduce(
    (sum, stage) => sum + Number(stage.progress?.study_total ?? stage.lessons.length),
    0
  )
  const next = threadNextLesson(path)
  const hasLessons = totalLessons > 0
  const currentStage =
    next?.stage ||
    path.current_stage ||
    path.stages.find((stage) => ['available', 'in_progress'].includes(stage.status)) ||
    path.stages[0]
  const nextReadiness = next ? lessonReadiness(next.lesson) : null
  const lessonProgress = percent(completedLessons, totalLessons)
  const currentLessonPosition = next ? next.stage.lessons.findIndex((lesson) => lesson.id === next.lesson.id) + 1 : 0
  const nextHref = !hasLessons
    ? threadTabHref(thread.id, 'curriculum')
    : next
    ? nextReadiness === 'needs_material'
      ? threadTabHref(thread.id, 'curriculum', next.stage.id)
      : lessonHref(thread.id, next.lesson.id)
    : threadTabHref(thread.id, 'curriculum')
  const nextLabel = !hasLessons
    ? 'Author first lesson'
    : next
    ? next.stage.status === 'locked'
      ? 'Review locked preview'
      : nextReadiness === 'in_progress'
      ? 'Continue lesson'
      : nextReadiness === 'needs_material'
      ? 'Review material gap'
      : 'Open next lesson'
    : 'Inspect completed path'

  const mutate = async (label: string, url: string, body?: unknown) => {
    setWorking(label)
    setMessage('')
    try {
      await api(url, {
        method: 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      setMessage(`${label} complete.`)
      onChanged()
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : `${label} failed.`)
    } finally {
      setWorking('')
    }
  }

  return (
    <section class="learn-workspace folio-learn thread-command-center vertical-thread">
      <header class="vertical-thread-spine">
        <div class="vertical-thread-topline">
          <nav class="course-stage-context" aria-label="Breadcrumb">
            <a href={routeHref('learn', 'paths')}>Threads</a>
            <span aria-hidden="true">/</span>
            <span dir="auto">{thread.title}</span>
          </nav>
          <div class="vertical-thread-management">
            {thread.status === 'paused' || thread.status === 'draft' ? (
              <button
                class="button secondary"
                disabled={Boolean(working)}
                onClick={() =>
                  mutate('Activate Thread', `/learning/core/threads/${encodeURIComponent(thread.id)}/status`, {
                    status: 'active',
                  })
                }
              >
                Activate
              </button>
            ) : thread.status === 'active' ? (
              <button
                class="button secondary"
                disabled={Boolean(working)}
                onClick={() =>
                  mutate('Pause Thread', `/learning/core/threads/${encodeURIComponent(thread.id)}/status`, {
                    status: 'paused',
                  })
                }
              >
                Pause
              </button>
            ) : null}
          </div>
        </div>

        <div class="vertical-thread-spine-grid">
          <div class="vertical-thread-identity">
            <div class="vertical-thread-status-line">
              <span class={`folio-status-tag status-${thread.status}`}>
                <i class="folio-tag-dot" aria-hidden="true" />
                {statusLabel(thread.status)}
              </span>
            </div>
            <h1 dir="auto">{thread.title}</h1>
            {thread.guiding_question && <p class="thread-guiding-lede" dir="auto">{thread.guiding_question}</p>}
          </div>

          <aside class="vertical-thread-position" aria-label="Current Thread position">
            <div class="vertical-thread-progress-copy">
              <strong>{completedLessons} / {totalLessons}</strong>
              <span>lessons complete</span>
            </div>
            {hasLessons ? (
              <div
                class="vertical-thread-progress-track"
                role="progressbar"
                aria-label="Thread lesson progress"
                aria-valuemin={0}
                aria-valuemax={totalLessons}
                aria-valuenow={completedLessons}
              >
                <span style={{ width: `${lessonProgress}%` }} />
              </div>
            ) : (
              <div class="vertical-thread-progress-track is-empty" aria-hidden="true"><span /></div>
            )}
            <div class="vertical-thread-current">
              <strong>
                {currentStage ? `Level ${currentStage.position} — ${levelTitle(currentStage)}` : 'No Level available'}
              </strong>
              <span>
                {next
                  ? next.stage.status === 'locked'
                    ? `Locked preview · Lesson ${currentLessonPosition} of ${next.stage.lessons.length}`
                    : `Lesson ${currentLessonPosition} of ${next.stage.lessons.length} · ${statusLabel(nextReadiness)}`
                  : hasLessons
                  ? 'Every authored lesson is complete'
                  : 'No lessons are authored yet'}
              </span>
            </div>
            <a
              class={`vertical-thread-next-link button ${
                next && next.stage.status !== 'locked' && nextReadiness !== 'needs_material' ? 'primary folio-primary' : 'secondary'
              }`}
              href={nextHref}
            >
              <span>
                <small>{nextLabel}</small>
                <strong>{next?.lesson.title || (hasLessons ? 'Curriculum complete' : 'Build the first lesson')}</strong>
              </span>
              <Icon name="chevron" size={14} />
            </a>
          </aside>
        </div>

        <nav class="thread-tabs vertical-thread-tabs" aria-label="Thread sections">
          {threadTabs.map((item) => (
            <a
              href={threadTabHref(thread.id, item.key)}
              class={`thread-tab-link ${item.key === activeTab ? 'is-active' : ''}`}
              aria-current={item.key === activeTab ? 'page' : undefined}
              key={item.key}
            >
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        {message && (
          <p class="folio-status" role="status">
            {message}
          </p>
        )}
      </header>

      {activeTab === 'overview' && <ThreadOverview path={path} currentStage={currentStage} />}

      {activeTab === 'curriculum' && <ThreadCurriculum path={path} focusLevelId={focusLevelId} onChanged={onChanged} />}

      {activeTab === 'practice' && <ThreadProjects path={path} focusLevelId={focusLevelId} onChanged={onChanged} />}

      {activeTab === 'materials' && <ThreadMaterialLedger path={path} onChanged={onChanged} open />}
    </section>
  )
}

function ThreadOverview({ path, currentStage }: { path: PathResponse; currentStage?: PathStage }) {
  const materialTotals = threadMaterialTotals(path)
  const sources = threadSourceCount(path)
  return (
    <section class="vertical-thread-overview">
      <div class="vertical-thread-ledger" aria-label="Thread resources">
        <span><strong>{sources}</strong> sources</span>
        <span><strong>{materialTotals.notes}</strong> notes</span>
        <span><strong>{materialTotals.files}</strong> files</span>
        <span><strong>{materialTotals.cards + materialTotals.drafts}</strong> recall</span>
      </div>

      <section class="vertical-overview-roadmap" aria-labelledby="vertical-overview-roadmap-title">
        <header>
          <h2 id="vertical-overview-roadmap-title">Levels</h2>
        </header>

        <ol class="vertical-journey-list">
          {path.stages.map((stage) => {
            const completed = completedLessonCount(stage)
            const isCurrent = stage.id === currentStage?.id
            const label =
              stage.status === 'completed'
                ? 'Completed'
                : isCurrent
                ? 'Current'
                : stage.status === 'locked'
                ? 'Preview'
                : statusLabel(stage.status)
            return (
              <li class={isCurrent ? 'is-current' : ''} key={stage.id}>
                <span class="vertical-journey-marker" aria-hidden="true">{stage.position}</span>
                <div class="vertical-journey-copy">
                  <a href={threadTabHref(path.thread.id, 'curriculum', stage.id)}>
                    <strong>Level {stage.position} — {levelTitle(stage)}</strong>
                  </a>
                  {(stage.objective || stage.description) && <p>{stage.objective || stage.description}</p>}
                </div>
                <div class="vertical-journey-meta">
                  <span class={`folio-status-tag status-${stage.status}`}>{label}</span>
                  <small>{completed} / {stage.lessons.length} lessons</small>
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </section>
  )
}

function ThreadCurriculum({
  path,
  focusLevelId,
  onChanged,
}: {
  path: PathResponse
  focusLevelId?: string
  onChanged: () => void
}) {
  const defaultStage =
    path.stages.find((stage) => stage.id === focusLevelId) ||
    threadNextLesson(path)?.stage ||
    path.current_stage ||
    path.stages[0]
  const [expandedStageId, setExpandedStageId] = useState(defaultStage?.id || '')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'needs_material' | 'completed'>('all')
  const [visibleResultCount, setVisibleResultCount] = useState(24)

  useEffect(() => {
    setExpandedStageId((current) =>
      path.stages.some((stage) => stage.id === current) ? current : defaultStage?.id || path.stages[0]?.id || '',
    )
  }, [path.thread.id, path.stages.length, defaultStage?.id])

  useEffect(() => setVisibleResultCount(24), [path.thread.id, query, filter])

  const lessons = path.stages.flatMap((stage) =>
    stage.lessons.map((lesson, index) => ({ stage, lesson, index })),
  )
  const completedLessons = lessons.filter(({ lesson }) => lesson.status === 'completed').length
  const inProgressLessons = lessons.filter(({ lesson }) => lesson.status === 'in_progress').length
  const needsMaterialLessons = lessons.filter(
    ({ lesson }) => lessonReadiness(lesson) === 'needs_material',
  ).length
  const normalizedQuery = query.trim().toLowerCase()
  const filteredLessons = lessons.filter(({ stage, lesson }) => {
    const queryMatch =
      !normalizedQuery ||
      `${lesson.title} ${lesson.description || ''} ${lesson.why_learn || ''} ${lesson.why_now || ''} ${
        lesson.takeaway || ''
      } ${stage.title} ${stage.objective || ''}`
        .toLowerCase()
        .includes(normalizedQuery)
    const filterMatch =
      filter === 'all' ||
      lesson.status === filter ||
      (filter === 'needs_material' && lessonReadiness(lesson) === 'needs_material')
    return queryMatch && filterMatch
  })
  const searchActive = Boolean(normalizedQuery || filter !== 'all')
  const visibleFilteredLessons = filteredLessons.slice(0, visibleResultCount)

  return (
    <section class="vertical-curriculum">
      <header class="vertical-view-head">
        <div>
          <h2>Curriculum journey</h2>
          <p>Every Level summary stays visible. One Level opens at a time, and search becomes one direct lesson index.</p>
        </div>
        <span>{completedLessons} of {lessons.length} lessons complete</span>
      </header>

      <div class="vertical-curriculum-controls">
        <label class="vertical-curriculum-search">
          <span>Search all {lessons.length} lessons</span>
          <span class="vertical-curriculum-search-field">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              placeholder="Search titles, concepts, or outcomes"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear curriculum search">
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </span>
        </label>

        <div class="vertical-curriculum-filters" role="group" aria-label="Filter curriculum">
          {[
            { key: 'all', label: `All ${lessons.length}` },
            { key: 'in_progress', label: `In progress ${inProgressLessons}` },
            { key: 'needs_material', label: `Needs material ${needsMaterialLessons}` },
            { key: 'completed', label: `Completed ${completedLessons}` },
          ].map((item) => (
            <button
              type="button"
              class={filter === item.key ? 'is-active' : ''}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key as typeof filter)}
              key={item.key}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {searchActive ? (
        <section class="vertical-curriculum-results">
          <header>
            <h3>Matching lessons</h3>
            <span aria-live="polite">
              {Math.min(visibleResultCount, filteredLessons.length)} of {filteredLessons.length} results shown
            </span>
          </header>
          {filteredLessons.length ? (
            <div>
              {visibleFilteredLessons.map(({ stage, lesson, index }) => {
                const readiness = lessonReadiness(lesson)
                return (
                  <a
                    class="vertical-curriculum-result"
                    href={lessonHref(path.thread.id, lesson.id)}
                    key={lesson.id}
                  >
                    <span class="vertical-curriculum-step">
                      {stage.position}.{index + 1}
                    </span>
                    <span>
                      <strong>{lesson.title}</strong>
                      <small>Level {stage.position} — {levelTitle(stage)}</small>
                    </span>
                    <span class={`lesson-readiness-pill state-${readiness}`}>{statusLabel(readiness)}</span>
                  </a>
                )
              })}
              {visibleResultCount < filteredLessons.length ? (
                <button
                  class="vertical-journey-more"
                  type="button"
                  onClick={() => setVisibleResultCount((count) => count + 24)}
                >
                  Show 24 more lessons
                </button>
              ) : null}
            </div>
          ) : (
            <p class="vertical-thread-empty">
              No lessons match this search and filter. Clear one control to recover the curriculum.
            </p>
          )}
        </section>
      ) : (
        <ol class="vertical-curriculum-journey">
          {path.stages.map((stage) => {
            const expanded = stage.id === expandedStageId
            const panelId = domId('curriculum-level-panel', stage.id)
            const completed = completedLessonCount(stage)
            const stageProgress = percent(completed, stage.lessons.length)
            const sourceCount =
              stage.sources.length +
              stage.lessons.reduce((total, lesson) => total + (lesson.sources?.length || 0), 0)
            const isLocked = stage.status === 'locked'
            const stageState =
              stage.status === 'completed'
                ? 'Completed'
                : isLocked
                ? sourceCount > 0 ? 'Preview · Prerequisite' : 'Preview · Needs material'
                : statusLabel(stage.status)

            return (
              <li class={`${expanded ? 'is-expanded' : ''} ${isLocked ? 'is-preview' : ''}`} key={stage.id}>
                <span class="vertical-journey-marker" aria-hidden="true">{stage.position}</span>
                <section class="vertical-curriculum-level" aria-label={`Level ${stage.position}: ${levelTitle(stage)}`}>
                  <button
                    class="vertical-curriculum-level-trigger"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => {
                      setExpandedStageId(stage.id)
                      persistThreadLevelFocus(path.thread.id, 'curriculum', stage.id)
                    }}
                  >
                    <span class="vertical-curriculum-level-copy">
                      <strong>Level {stage.position} — {levelTitle(stage)}</strong>
                      <small>{stage.lessons.length} lessons · {sourceCount} sources</small>
                    </span>
                    <span class="vertical-curriculum-level-state">
                      <span class={`folio-status-tag status-${stage.status}`}>{stageState}</span>
                      <small>{completed} / {stage.lessons.length}</small>
                    </span>
                    <Icon name="chevron" size={14} />
                  </button>

                  {expanded ? (
                    <div class="vertical-curriculum-level-panel" id={panelId}>
                      {(stage.objective || stage.description) && <p>{stage.objective || stage.description}</p>}
                      <div
                        class="vertical-curriculum-level-progress"
                        role="progressbar"
                        aria-label={`Level ${stage.position} lesson progress`}
                        aria-valuemin={0}
                        aria-valuemax={stage.lessons.length || 1}
                        aria-valuenow={completed}
                      >
                        <span style={{ width: `${stageProgress}%` }} />
                      </div>
                      {isLocked ? (
                        <p class="vertical-curriculum-preview-note">
                          {sourceCount > 0
                            ? 'Preview only. Complete the preceding Levels before these lessons become active work.'
                            : 'Preview only. Complete the preceding Levels and attach study material before these lessons become active work.'}
                        </p>
                      ) : null}

                      <div class="vertical-curriculum-lessons">
                        {stage.lessons.map((lesson, index) => {
                          const readiness = lessonReadiness(lesson)
                          return (
                            <a
                              class={`vertical-curriculum-lesson state-${readiness}`}
                              href={lessonHref(path.thread.id, lesson.id)}
                              key={lesson.id}
                            >
                              <span class="vertical-curriculum-step">
                                {stage.position}.{index + 1}
                              </span>
                              <span class="vertical-curriculum-lesson-copy">
                                <strong>{lesson.title}</strong>
                                {(lesson.why_learn || lesson.description) && (
                                  <small>{lesson.why_learn || lesson.description}</small>
                                )}
                              </span>
                              <span class="vertical-curriculum-lesson-meta">
                                <span class={`lesson-readiness-pill state-${readiness}`}>
                                  {statusLabel(readiness)}
                                </span>
                                <small>
                                  {lesson.sources?.length
                                    ? `${lesson.sources.length} ${lesson.sources.length === 1 ? 'source' : 'sources'}`
                                    : lessonActionLabel(lesson)}
                                </small>
                              </span>
                              <span class="vertical-curriculum-lesson-action">{lessonActionLabel(lesson)}</span>
                            </a>
                          )
                        })}
                        {!stage.lessons.length ? (
                          <p class="vertical-thread-empty">No lessons have been authored for this Level.</p>
                        ) : null}
                      </div>

                    </div>
                  ) : null}
                </section>
              </li>
            )
          })}
        </ol>
      )}

      <ThreadAuthoring threadId={path.thread.id} stageCount={path.stages.length} onChanged={onChanged} />
    </section>
  )
}

function ThreadProjects({
  path,
  focusLevelId,
  onChanged,
}: {
  path: PathResponse
  focusLevelId?: string
  onChanged: () => void
}) {
  const defaultStage =
    path.stages.find((stage) => stage.id === focusLevelId) ||
    threadNextLesson(path)?.stage ||
    path.current_stage ||
    path.stages.find((stage) => ['available', 'in_progress'].includes(stage.status)) ||
    path.stages[0]
  const [expandedStageId, setExpandedStageId] = useState(defaultStage?.id || '')
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setExpandedStageId((current) =>
      path.stages.some((stage) => stage.id === current) ? current : defaultStage?.id || path.stages[0]?.id || '',
    )
  }, [path.thread.id, path.stages.length, defaultStage?.id])

  const updateProject = async (id: string, status: string) => {
    setSaving(id)
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.thread.id)}/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setMessage('Project status saved.')
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project update failed.')
    } finally {
      setSaving('')
    }
  }

  const saveSynthesis = async (event: Event) => {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget as HTMLFormElement).get('synthesis') || '')
    setSaving('synthesis')
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.thread.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ final_synthesis: value }),
      })
      setMessage('Final synthesis saved.')
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Synthesis save failed.')
    } finally {
      setSaving('')
    }
  }

  const finalProjects = path.projects.filter((project) => project.type === 'final')

  return (
    <section class="vertical-practice">
      <header class="vertical-view-head">
        <div>
          <h2>Practice journey</h2>
          <p>Current Level application leads. Future projects remain previews, and synthesis closes the Thread as a terminal workspace.</p>
        </div>
        <span>{path.stages.reduce((total, stage) => total + stage.projects.length, 0) + finalProjects.length} projects</span>
      </header>

      <p class="vertical-thread-advisory">
        Projects are optional practice. They never unlock a lesson, advance a Level, or complete the Thread.
      </p>

      <ol class="vertical-practice-journey">
        {path.stages.map((stage) => {
          const expanded = stage.id === expandedStageId
          const panelId = domId('practice-level-panel', stage.id)
          const isCurrent = stage.id === defaultStage?.id
          const stateLabel =
            stage.status === 'completed'
              ? 'Completed Level'
              : isCurrent
              ? 'Current Level'
              : 'Future preview'

          return (
            <li class={`${expanded ? 'is-expanded' : ''} ${isCurrent ? 'is-current' : ''}`} key={stage.id}>
              <span class="vertical-journey-marker" aria-hidden="true">{stage.position}</span>
              <section class="vertical-practice-level" aria-label={`Level ${stage.position}: ${levelTitle(stage)}`}>
                <button
                  class="vertical-practice-level-trigger"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => {
                    setExpandedStageId(stage.id)
                    persistThreadLevelFocus(path.thread.id, 'practice', stage.id)
                  }}
                >
                  <span>
                    <strong>Level {stage.position} — {levelTitle(stage)}</strong>
                    <small>{stage.projects.length || 0} {stage.projects.length === 1 ? 'project' : 'projects'}</small>
                  </span>
                  <span class={`folio-status-tag status-${stage.status}`}>{stateLabel}</span>
                  <Icon name="chevron" size={14} />
                </button>

                {expanded ? (
                  <div class="vertical-practice-level-panel" id={panelId}>
                    {(stage.objective || stage.description) && <p>{stage.objective || stage.description}</p>}
                    {stage.projects.length ? (
                      <div class="vertical-practice-projects">
                        {stage.projects.map((project) => (
                          <VerticalProjectEntry
                            project={project}
                            saving={saving === project.id}
                            onUpdate={updateProject}
                            key={project.id}
                          />
                        ))}
                      </div>
                    ) : (
                      <p class="vertical-thread-empty">No optional project has been defined for this Level.</p>
                    )}
                  </div>
                ) : null}
              </section>
            </li>
          )
        })}
      </ol>

      <section class="vertical-practice-terminal" aria-labelledby="vertical-practice-terminal-title">
        <header>
          <div>
            <h3 id="vertical-practice-terminal-title">Final mastery and synthesis</h3>
            <p>A terminal workspace after the Level journey, never a progression gate.</p>
          </div>
          <span class="folio-status-tag status-deferred">Terminal workspace</span>
        </header>

        {finalProjects.length ? (
          <div class="vertical-practice-projects">
            {finalProjects.map((project) => (
              <VerticalProjectEntry
                project={project}
                saving={saving === project.id}
                onUpdate={updateProject}
                key={project.id}
              />
            ))}
          </div>
        ) : null}

        <form class="vertical-practice-synthesis" onSubmit={saveSynthesis}>
          <label>
            <strong>What can you now explain, decide, build, or do?</strong>
            <span>Save a durable synthesis without changing lesson or Level progress.</span>
            <textarea
              name="synthesis"
              rows={7}
              defaultValue={path.thread.final_synthesis || ''}
              placeholder="Document the models, decisions, and practical conclusions that should remain after this Thread."
            />
          </label>
          <button class="button secondary" disabled={Boolean(saving)}>
            {saving === 'synthesis' ? 'Saving…' : 'Save final synthesis'}
          </button>
        </form>
      </section>

      {message && <p class="folio-status" role="status">{message}</p>}
    </section>
  )
}

function VerticalProjectEntry({
  project,
  saving,
  onUpdate,
}: {
  project: ThreadProject
  saving: boolean
  onUpdate: (id: string, status: string) => void
}) {
  return (
    <article class={`vertical-practice-project status-${project.status}`}>
      <div>
        <h4>{project.title}</h4>
        {project.objective && <p><strong>Objective:</strong> {project.objective}</p>}
        {project.description && <p>{project.description}</p>}
        {project.suggested_context && (
          <p class="vertical-practice-context"><strong>Suggested context:</strong> {project.suggested_context}</p>
        )}
        {project.instructions && (
          <details>
            <summary>Project instructions</summary>
            <p>{project.instructions}</p>
          </details>
        )}
      </div>
      <label>
        <span>Status</span>
        <select
          value={project.status}
          disabled={saving}
          onChange={(event) => onUpdate(project.id, (event.target as HTMLSelectElement).value)}
          aria-label={`Status for ${project.title}`}
        >
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="deferred">Deferred</option>
        </select>
      </label>
    </article>
  )
}

function StageView({
  stage,
  threadId,
  threadTitle,
  onChanged,
}: {
  stage: PathStage
  threadId: string
  threadTitle: string
  onChanged: () => void
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const completedLessons = stage.lessons.filter((lesson) => lesson.status === 'completed').length
  const totalLessons = stage.lessons.length
  const lessonCompletion = percent(completedLessons, totalLessons)

  const nextAction = stage.next_action
  const proposedNextLesson =
    nextAction?.kind === 'lesson'
      ? stage.lessons.find((lesson) => lesson.id === nextAction.lesson_id)
      : stage.lessons.find((lesson) => lesson.status !== 'completed')
  const nextLesson =
    proposedNextLesson && lessonReadiness(proposedNextLesson) !== 'needs_material'
      ? proposedNextLesson
      : stage.lessons.find((lesson) => ['ready', 'in_progress'].includes(lessonReadiness(lesson)))
  const lessonsNeedingMaterial = stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length

  const startLevel = async () => {
    setWorking(true)
    setError('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/start`, {
        method: 'POST',
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Level start failed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <header class="course-stage-header">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href={routeHref('learn', 'paths')}>Threads</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'overview')}>{threadTitle}</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'curriculum', stage.id)}>Lessons</a>
          <span aria-hidden="true">/</span>
          <span>Level {stage.position}</span>
        </nav>
        <div class="course-stage-heading-line">
          <p class="folio-object-kicker">Level {stage.position}</p>
          <span class={`course-stage-status status-${stage.status}`}>{statusLabel(stage.status)}</span>
        </div>
        <h1>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h1>
        <p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p>
        <div class="course-stage-progress-grid" aria-label="Level progress">
          <ProgressTrack label="Study" completed={completedLessons} total={totalLessons} unit="lessons" value={lessonCompletion} />
        </div>
      </header>

      {stage.status === 'locked' && (
        <section class="course-next-action is-blocked">
          <div>
            <p class="folio-object-kicker">Locked Level</p>
            <h3>Finish the previous Level first</h3>
            <p>You can preview this curriculum, but study actions unlock only after the previous Level is completed.</p>
          </div>
          <span class="course-next-action-lock">
            <Icon name="lock" size={14} /> Locked
          </span>
        </section>
      )}

      {stage.status === 'available' && (
        <section class="course-next-action">
          <div>
            <p class="folio-object-kicker">Ready when you are</p>
            <h3>Start this Level</h3>
            <p>Starting makes its sequential lessons and project actionable.</p>
          </div>
          <button class="button primary folio-primary" disabled={working} onClick={startLevel}>
            {working ? 'Starting…' : 'Start Level'}
          </button>
        </section>
      )}

      {error && <p class="folio-status" role="alert">{error}</p>}

      {stage.status === 'in_progress' && nextLesson && (
        <section class="course-next-action" aria-labelledby="course-next-action-title">
          <div>
            <p class="folio-object-kicker">Next up</p>
            <h3 id="course-next-action-title">{nextLesson.title}</h3>
            <p>{nextLesson.status === 'in_progress' ? 'Pick up where you left off.' : 'Start the next lesson in this level.'}</p>
          </div>
          <a class="button primary folio-primary" href={lessonHref(threadId, nextLesson.id)}>
            {nextLesson.status === 'in_progress' ? 'Continue lesson' : 'Start lesson'} <Icon name="chevron" size={14} />
          </a>
        </section>
      )}

      {!nextLesson && lessonsNeedingMaterial > 0 && (
        <section class="course-next-action is-blocked" aria-labelledby="course-next-action-title">
          <div>
            <p class="folio-object-kicker">Next up</p>
            <h3 id="course-next-action-title">Prepare the next lesson</h3>
            <p>{lessonsNeedingMaterial} {lessonsNeedingMaterial === 1 ? 'lesson needs' : 'lessons need'} authored content or an attached source before study can continue.</p>
          </div>
          <span class="course-next-action-lock"><Icon name="source" size={14} /> Material needed</span>
        </section>
      )}

      <details class="course-section course-lessons" open>
        <summary>
          <span>
            <span class="folio-object-kicker">Curriculum</span>
            <strong>Sequential Lessons</strong>
          </span>
          <span class="course-section-count">{completedLessons}/{totalLessons} complete</span>
        </summary>
        <div class="course-section-body">
          {stage.lessons.length ? (
            stage.lessons.map((lesson, sequence) => {
              const readiness = lessonReadiness(lesson)
              const stateCopy =
                readiness === 'completed'
                  ? 'Completed'
                  : readiness === 'needs_material'
                  ? 'Needs material'
                  : readiness === 'in_progress'
                  ? 'In progress · Continue'
                  : lesson.id === nextLesson?.id
                  ? 'Ready · Your next lesson'
                  : 'Ready to study'
              return (
                <a
                  class={`course-lesson state-${readiness} ${readiness === 'completed' ? 'is-complete' : ''} ${lesson.id === nextLesson?.id ? 'is-next' : ''}`}
                  href={lessonHref(threadId, lesson.id)}
                  key={lesson.id}
                  aria-label={`Open lesson ${sequence + 1}: ${lesson.title}, ${stateCopy.toLowerCase()}`}
                >
                  <span class="course-lesson-number">
                    {readiness === 'completed' ? <Icon name="check" size={14} /> : String(sequence + 1).padStart(2, '0')}
                  </span>
                  <strong class="course-lesson-title">{lesson.title}</strong>
                  <small class="course-lesson-source-count">{stateCopy}</small>
                </a>
              )
            })
          ) : (
            <p class="folio-empty-line">No lessons in this level yet.</p>
          )}
        </div>
      </details>

      {stage.sources.length > 0 && <SourceSection sources={stage.sources} title="Level Study Material" />}

      <LevelMaterials stage={stage} onChanged={onChanged} />
    </>
  )
}

function ProgressTrack({
  label,
  completed,
  total,
  unit,
  value,
}: {
  label: string
  completed: number
  total: number
  unit: string
  value: number
}) {
  const summary = total ? `${completed} of ${total} ${unit}` : `No ${unit} set`
  return (
    <div class="course-stage-progress" aria-label={`${label}: ${summary}`}>
      <div class="course-stage-progress-label">
        <span class="folio-object-kicker">{label}</span>
        <strong>{summary}</strong>
        <span>{total ? `${value}%` : '—'}</span>
      </div>
      <div class="course-stage-progress-track" role="progressbar" aria-label={`${label} progress`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function LevelMaterials({ stage, onChanged, lessonTools = false }: { stage: PathStage; onChanged: () => void; lessonTools?: boolean }) {
  const total = stage.notes.length + stage.files.length + stage.cards.length + stage.recall_drafts.length
  return (
    <details class={`course-level-materials ${lessonTools ? 'is-lesson-tools' : ''}`}>
      <summary>
        <span>
          <span class="folio-object-kicker">{lessonTools ? 'Learning tools' : 'Level workspace'}</span>
          <strong>{lessonTools ? 'Capture while you study' : 'Notes, files, and recall'}</strong>
        </span>
        <small>{total} saved</small>
      </summary>
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
  )
}

function LevelList({ threadId, stages, activeStage }: { threadId: string; stages: PathStage[]; activeStage?: PathStage }) {
  return (
    <details class="course-level-list">
      <summary class="course-level-list-heading">
        <span class="folio-object-kicker">Curriculum Spine</span>
        <span>{stages.length} levels</span>
      </summary>
      <div class="course-level-list-grid">
        {stages.map((stage) => (
          <a
            href={threadTabHref(threadId, 'curriculum', stage.id)}
            class={`course-level-card status-${stage.status} ${stage.id === activeStage?.id ? 'is-current' : ''}`}
            aria-current={stage.id === activeStage?.id ? 'page' : undefined}
            key={stage.id}
            aria-label={`${stage.status === 'locked' ? 'Preview locked' : 'Open'} Level ${stage.position}: ${stage.title}`}
          >
            <span class="course-level-number">{String(stage.position).padStart(2, '0')}</span>
            <span>
              <strong>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong>
              <small>
                {stage.lessons.filter((lesson) => lesson.status === 'completed').length}/{stage.lessons.length} complete ·{' '}
                {stage.lessons.filter((lesson) => lessonReadiness(lesson) !== 'needs_material').length} ready
              </small>
              <small class="course-level-readiness">
                {stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length
                  ? `${stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length} need material`
                  : statusLabel(stage.status)}
              </small>
            </span>
            <span class="course-level-mark" aria-hidden="true">
              {stage.status === 'completed' ? <Icon name="check" size={14} /> : stage.id === activeStage?.id ? '●' : '○'}
            </span>
          </a>
        ))}
      </div>
    </details>
  )
}

type MaterialScope = { kind: 'thread' | 'level' | 'lesson'; id: string; title: string }

function ThreadMaterialLedger({
  path,
  onChanged,
  open = false,
}: {
  path: PathResponse
  onChanged: () => void
  open?: boolean
}) {
  if (open) return <ThreadMaterialsJourney path={path} onChanged={onChanged} />

  const levelMaterials = path.stages.filter(
    (stage) => stage.notes.length || stage.files.length || stage.cards.length || stage.recall_drafts.length
  )
  const lessonMaterials = path.stages
    .flatMap((stage) => stage.lessons.map((lesson) => ({ stage, lesson })))
    .filter(
      ({ lesson }) =>
        (lesson.notes?.length || 0) +
          (lesson.files?.length || 0) +
          (lesson.cards?.length || 0) +
          (lesson.recall_drafts?.length || 0) >
        0
    )

  return (
    <details class="learning-material-ledger" open={open}>
      <summary>
        <span>
          <span class="folio-object-kicker">Thread Knowledge Hub</span>
          <strong>Notes, Files, and Recall</strong>
        </span>
        <small>
          {path.notes.length + path.files.length + path.cards.length + path.recall_drafts.length} Direct Thread · {levelMaterials.length} Levels · {lessonMaterials.length} Lessons
        </small>
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
        {levelMaterials.length > 0 && (
          <section class="learning-owned-index" aria-label="Materials owned by Levels">
            <div class="learning-material-heading">
              <div>
                <span class="folio-object-kicker">All Levels</span>
                <h3>Thread material index</h3>
              </div>
              <small>Artifacts scoped to each Level.</small>
            </div>
            {levelMaterials.map((stage) => (
              <div class="learning-owned-level" key={stage.id}>
                <a href={threadTabHref(path.thread.id, 'curriculum', stage.id)}>
                  <strong>{stage.title}</strong>
                </a>
                <span>
                  {stage.notes.length} notes · {stage.files.length} files · {stage.cards.length} cards · {stage.recall_drafts.length} drafts
                </span>
              </div>
            ))}
          </section>
        )}
        {lessonMaterials.length > 0 && (
          <section class="learning-owned-index" aria-label="Materials owned by Lessons">
            <div class="learning-material-heading">
              <div>
                <span class="folio-object-kicker">All Lessons</span>
                <h3>Lesson Capture Index</h3>
              </div>
              <small>Capture scoped to specific Lessons.</small>
            </div>
            {lessonMaterials.map(({ stage, lesson }) => (
              <div class="learning-owned-level" key={lesson.id}>
                <a href={lessonHref(path.thread.id, lesson.id)}>
                  <strong>{lesson.title}</strong>
                </a>
                <span>
                  Level {stage.position} · {lesson.notes?.length || 0} notes · {lesson.files?.length || 0} files · {lesson.cards?.length || 0} cards
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </details>
  )
}

type ThreadMaterialKind = 'note' | 'file' | 'recall'

interface ThreadMaterialOwner {
  key: string
  marker: string
  scope: MaterialScope
  subtitle: string
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  drafts: RecallDraft[]
}

interface ThreadMaterialIndexItem {
  id: string
  kind: ThreadMaterialKind
  title: string
  detail: string
  status: string
  href?: string
  rtl?: boolean
  owner: ThreadMaterialOwner
}

function ThreadMaterialsJourney({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ThreadMaterialKind>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | MaterialScope['kind']>('all')
  const [expandedOwnerKey, setExpandedOwnerKey] = useState('')
  const [visibleOwnerCount, setVisibleOwnerCount] = useState(24)
  const [ownerItemLimit, setOwnerItemLimit] = useState(24)

  const owners: ThreadMaterialOwner[] = [
    {
      key: `thread:${path.thread.id}`,
      marker: 'T',
      scope: { kind: 'thread', id: path.thread.id, title: path.thread.title },
      subtitle: 'Direct Thread material',
      notes: path.notes,
      files: path.files,
      cards: path.cards,
      drafts: path.recall_drafts,
    },
    ...path.stages
      .filter((stage) => stage.notes.length + stage.files.length + stage.cards.length + stage.recall_drafts.length > 0)
      .map((stage) => ({
        key: `level:${stage.id}`,
        marker: String(stage.position),
        scope: { kind: 'level' as const, id: stage.id, title: stage.title },
        subtitle: `Level ${stage.position} owner`,
        notes: stage.notes,
        files: stage.files,
        cards: stage.cards,
        drafts: stage.recall_drafts,
      })),
    ...path.stages.flatMap((stage) =>
      stage.lessons
        .filter(
          (lesson) =>
            (lesson.notes?.length || 0) +
              (lesson.files?.length || 0) +
              (lesson.cards?.length || 0) +
              (lesson.recall_drafts?.length || 0) >
            0,
        )
        .map((lesson, lessonIndex) => ({
          key: `lesson:${lesson.id}`,
          marker: `${stage.position}.${lessonIndex + 1}`,
          scope: { kind: 'lesson' as const, id: lesson.id, title: lesson.title },
          subtitle: `Level ${stage.position} · Lesson owner`,
          notes: lesson.notes || [],
          files: lesson.files || [],
          cards: lesson.cards || [],
          drafts: lesson.recall_drafts || [],
        })),
    ),
  ]

  const items: ThreadMaterialIndexItem[] = owners.flatMap((owner) => [
    ...owner.notes.map((note) => ({
      id: note.id,
      kind: 'note' as const,
      title: note.title,
      detail: materialExcerpt(note.abstract || note.sections?.[0]?.content, 'Study note'),
      status: note.status || 'active',
      href: noteHref(note.id),
      owner,
    })),
    ...owner.files.map((file) => ({
      id: file.id,
      kind: 'file' as const,
      title: file.filename,
      detail: file.media_type || 'Stored file',
      status: 'stored',
      href: artifactHref(file.id),
      owner,
    })),
    ...owner.cards.map((card) => ({
      id: card.id,
      kind: 'recall' as const,
      title: card.question,
      detail: `Approved card · due ${card.due_at || 'now'}`,
      status: 'approved',
      href: cardHref(card.id),
      rtl: true,
      owner,
    })),
    ...owner.drafts.map((draft) => ({
      id: draft.id,
      kind: 'recall' as const,
      title: draft.question,
      detail: `${draft.status === 'rejected' ? 'Rejected' : draft.status === 'approved' ? 'Approved' : 'Draft'} recall item${
        draft.source_title ? ` · ${draft.source_title}` : ''
      }`,
      status: draft.status,
      rtl: true,
      owner,
    })),
  ])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = items.filter((item) => {
    const queryMatch =
      !normalizedQuery ||
      `${item.title} ${item.detail} ${item.owner.scope.title} ${item.owner.subtitle}`
        .toLowerCase()
        .includes(normalizedQuery)
    const typeMatch = typeFilter === 'all' || item.kind === typeFilter
    const ownerMatch = ownerFilter === 'all' || item.owner.scope.kind === ownerFilter
    return queryMatch && typeMatch && ownerMatch
  })
  const filteredOwners = owners
    .map((owner) => ({
      owner,
      items: filteredItems.filter((item) => item.owner.key === owner.key),
    }))
    .filter((group) => group.items.length > 0)
  const filteredOwnerKeys = filteredOwners.map(({ owner }) => owner.key).join('|')

  useEffect(() => {
    setExpandedOwnerKey((current) =>
      filteredOwners.some(({ owner }) => owner.key === current) ? current : filteredOwners[0]?.owner.key || '',
    )
  }, [path.thread.id, filteredOwnerKeys])

  useEffect(() => {
    setVisibleOwnerCount(24)
    setOwnerItemLimit(24)
  }, [path.thread.id, query, typeFilter, ownerFilter])

  const totals = threadMaterialTotals(path)
  const totalRecall = totals.cards + totals.drafts
  const materialOwnerCount = new Set(items.map((item) => item.owner.key)).size
  const visibleFilteredOwners = filteredOwners.slice(0, visibleOwnerCount)

  return (
    <section class="vertical-materials">
      <header class="vertical-view-head">
        <div>
          <h2>Materials journey</h2>
          <p>One owner-aware index follows saved material from the Thread to exact Levels and Lessons.</p>
        </div>
        <span>{items.length} items across {materialOwnerCount} owners</span>
      </header>

      <div class="vertical-materials-summary" aria-label="Material counts across every owner scope">
        <div><strong>{totals.notes}</strong><span>Notes</span></div>
        <div><strong>{totals.files}</strong><span>Files</span></div>
        <div><strong>{totals.cards}</strong><span>Approved cards</span></div>
        <div><strong>{totals.drafts}</strong><span>Recall drafts</span></div>
      </div>

      <div class="vertical-materials-controls">
        <label>
          <span>Search title, source, or owner</span>
          <span class="vertical-materials-search-field">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              placeholder="Search all material"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear material search">
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </span>
        </label>

        <div>
          <span>Type</span>
          <div class="vertical-materials-filters" role="group" aria-label="Material type">
            {[
              { key: 'all', label: `All ${items.length}` },
              { key: 'note', label: `Notes ${totals.notes}` },
              { key: 'file', label: `Files ${totals.files}` },
              { key: 'recall', label: `Recall ${totalRecall}` },
            ].map((item) => (
              <button
                type="button"
                class={typeFilter === item.key ? 'is-active' : ''}
                aria-pressed={typeFilter === item.key}
                onClick={() => setTypeFilter(item.key as typeof typeFilter)}
                key={item.key}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span>Owner</span>
          <div class="vertical-materials-filters" role="group" aria-label="Material owner">
            {[
              { key: 'all', label: 'All owners' },
              { key: 'thread', label: 'Thread' },
              { key: 'level', label: 'Level' },
              { key: 'lesson', label: 'Lesson' },
            ].map((item) => (
              <button
                type="button"
                class={ownerFilter === item.key ? 'is-active' : ''}
                aria-pressed={ownerFilter === item.key}
                onClick={() => setOwnerFilter(item.key as typeof ownerFilter)}
                key={item.key}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p class="visually-hidden" aria-live="polite">
        {filteredItems.length} matching items across {filteredOwners.length} owners.
      </p>

      {filteredOwners.length ? (
        <>
          <ol class="vertical-material-owner-journey">
            {visibleFilteredOwners.map(({ owner, items: ownerItems }) => {
              const expanded = owner.key === expandedOwnerKey
              const panelId = domId('material-owner-panel', owner.key)
              return (
                <li class={expanded ? 'is-expanded' : ''} key={owner.key}>
                  <span class="vertical-material-owner-marker" aria-hidden="true">
                    {owner.marker}
                  </span>
                  <section class="vertical-material-owner" aria-label={`${owner.scope.kind}: ${owner.scope.title}`}>
                    <button
                      class="vertical-material-owner-trigger"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => {
                        setExpandedOwnerKey(owner.key)
                        setOwnerItemLimit(24)
                      }}
                    >
                      <span>
                        <strong>{owner.scope.title}</strong>
                        <small>{owner.subtitle}</small>
                      </span>
                      <span class="learning-owner-pill">{ownerItems.length} owned by {owner.scope.kind}</span>
                      <Icon name="chevron" size={14} />
                    </button>
                    {expanded ? (
                      <div class="vertical-material-owner-panel" id={panelId}>
                        <div class="vertical-material-owner-items">
                          {ownerItems.slice(0, ownerItemLimit).map((item) => {
                            const content = (
                              <>
                                <Icon
                                  name={item.kind === 'note' ? 'note' : item.kind === 'file' ? 'file' : 'spark'}
                                  size={14}
                                />
                                <span>
                                  <strong lang={item.rtl ? 'ar' : undefined} dir={item.rtl ? 'rtl' : undefined}>
                                    {item.title}
                                  </strong>
                                  <small>{item.detail}</small>
                                </span>
                                <span class={`folio-status-tag status-${item.status}`}>{statusLabel(item.status)}</span>
                              </>
                            )
                            return item.href ? (
                              <a
                                class="vertical-material-item"
                                href={item.href}
                                target={item.kind === 'file' ? '_blank' : undefined}
                                rel={item.kind === 'file' ? 'noreferrer' : undefined}
                                key={item.id}
                              >
                                {content}
                              </a>
                            ) : (
                              <div class="vertical-material-item is-draft" key={item.id}>{content}</div>
                            )
                          })}
                        </div>
                        {ownerItemLimit < ownerItems.length ? (
                          <button
                            class="vertical-journey-more"
                            type="button"
                            onClick={() => setOwnerItemLimit((count) => count + 24)}
                          >
                            Show 24 more items
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </li>
              )
            })}
          </ol>
          {visibleOwnerCount < filteredOwners.length ? (
            <button
              class="vertical-journey-more"
              type="button"
              onClick={() => setVisibleOwnerCount((count) => count + 24)}
            >
              Show 24 more owners
            </button>
          ) : null}
        </>
      ) : (
        <p class="vertical-thread-empty">
          No materials match this search, type, and owner combination. Clear one filter to recover the index.
        </p>
      )}

      <details class="vertical-materials-create">
        <summary>
          <span>
            <strong>Manage direct Thread material</strong>
            <small>Browse existing Thread-owned items and add an explicit note, file, or learner-authored card.</small>
          </span>
          <Icon name="chevron" size={14} />
        </summary>
        <ScopedMaterials
          compact
          scope={{ kind: 'thread', id: path.thread.id, title: path.thread.title }}
          notes={path.notes}
          files={path.files}
          cards={path.cards}
          drafts={path.recall_drafts}
          onChanged={onChanged}
        />
      </details>
    </section>
  )
}

function ScopedMaterials({
  scope,
  notes,
  files,
  cards,
  drafts,
  onChanged,
  compact = false,
}: {
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
  const scopeBody =
    scope.kind === 'lesson'
      ? { lesson_id: scope.id }
      : scope.kind === 'level'
      ? { stage_id: scope.id }
      : { thread_id: scope.id }

  const createNote = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const content = String(values.get('content') || '').trim()
    if (!title || !content) return
    setSaving('note')
    setError('')
    try {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({
          ...scopeBody,
          title,
          status: 'active',
          sections: [{ section_key: 'body', label: 'Notes', content, direction: 'auto' }],
        }),
      })
      form.reset()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Note creation failed.')
    } finally {
      setSaving(null)
    }
  }

  const uploadFile = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('file') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) return
    setSaving('file')
    setError('')
    try {
      await uploadArtifact(file, { ...scopeBody, scope: scope.kind, scope_title: scope.title })
      form.reset()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'File upload failed.')
    } finally {
      setSaving(null)
    }
  }

  const createCard = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const values = new FormData(form)
    const question = String(values.get('question') || '').trim()
    const answer = String(values.get('answer') || '').trim()
    if (!question || !answer) return
    setSaving('card')
    setError('')
    try {
      await api('/learning/srs/create', {
        method: 'POST',
        body: JSON.stringify({ ...scopeBody, question, answer, topic: scope.title }),
      })
      form.reset()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recall card creation failed.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section class={`learning-scope-workspace ${compact ? 'is-compact' : ''}`} aria-label={`${scope.title} materials`}>
      <div class="learning-material-heading">
        <div>
          <span class="folio-object-kicker">
            {scope.kind === 'lesson' ? 'Lesson workspace' : scope.kind === 'level' ? 'Level workspace' : 'Direct Thread material'}
          </span>
          <h3>{scope.title}</h3>
        </div>
        <span class="learning-owner-pill">Owned by {scope.kind === 'lesson' ? 'Lesson' : scope.kind === 'level' ? 'Level' : 'Thread'}</span>
      </div>
      <div class="learning-material-columns">
        <MaterialColumn title="Notes" count={notes.length} empty="No notes in this scope yet.">
          {notes.map((note) => (
            <a class="learning-material-row" href={noteHref(note.id)} key={note.id}>
              <Icon name="note" size={14} />
              <span>
                <strong>{note.title}</strong>
                <small>{note.sections?.[0]?.content || 'Open note'}</small>
              </span>
            </a>
          ))}
          <details class="learning-add-material">
            <summary>Add note</summary>
            <form onSubmit={createNote}>
              <input name="title" aria-label="Note title" placeholder="Note title" required />
              <textarea name="content" aria-label="Note body" placeholder="What should this scope remember?" rows={3} required />
              <button class="button secondary" disabled={saving !== null}>
                {saving === 'note' ? 'Saving…' : 'Save note'}
              </button>
            </form>
          </details>
        </MaterialColumn>

        <MaterialColumn title="Files" count={files.length} empty="No files in this scope yet.">
          {files.map((file) => (
            <a class="learning-material-row" href={artifactHref(file.id)} target="_blank" rel="noreferrer" key={file.id}>
              <Icon name="file" size={14} />
              <span>
                <strong>{file.filename}</strong>
                <small>{file.media_type || 'Stored file'}</small>
              </span>
            </a>
          ))}
          <details class="learning-add-material">
            <summary>Add file</summary>
            <form onSubmit={uploadFile}>
              <input type="file" name="file" aria-label="Choose file" required />
              <button class="button secondary" disabled={saving !== null}>
                {saving === 'file' ? 'Uploading…' : 'Upload file'}
              </button>
            </form>
          </details>
        </MaterialColumn>

        <MaterialColumn title="Recall Cards" count={cards.length + drafts.length} empty="No recall cards in this scope yet.">
          {cards.map((card) => (
            <a class="learning-material-row" href={cardHref(card.id)} key={card.id}>
              <Icon name="spark" size={14} />
              <span>
                <strong lang="ar" dir="rtl">{card.question}</strong>
                <small>Approved card · due {card.due_at || 'now'}</small>
              </span>
            </a>
          ))}
          {drafts.map((draft) => (
            <div class="learning-material-row is-draft" key={draft.id}>
              <Icon name="clock" size={14} />
              <span>
                <strong lang="ar" dir="rtl">{draft.question}</strong>
                <small>Draft · approve in Recall</small>
              </span>
            </div>
          ))}
          <details class="learning-add-material">
            <summary>Add card</summary>
            <form onSubmit={createCard}>
              <input name="question" lang="ar" dir="rtl" aria-label="Recall question in Arabic" placeholder="السؤال بالعربية" required />
              <textarea name="answer" lang="ar" dir="rtl" aria-label="Recall answer in Arabic" placeholder="الإجابة بالعربية" rows={2} required />
              <button class="button secondary" disabled={saving !== null}>
                {saving === 'card' ? 'Saving…' : 'Create card'}
              </button>
            </form>
          </details>
        </MaterialColumn>
      </div>
      {error && <p class="learning-material-error" role="alert">{error}</p>}
    </section>
  )
}

function MaterialColumn({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: any
}) {
  return (
    <section class="learning-material-column">
      <header>
        <h4>{title}</h4>
        <span>{count}</span>
      </header>
      {count === 0 && <p class="folio-empty-line">{empty}</p>}
      {children}
    </section>
  )
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
  const [error, setError] = useState('')
  const isCompleted = lesson.status === 'completed'
  const readiness = lessonReadiness(lesson)
  const canStudy = stage.status === 'in_progress'
  const canComplete = readiness !== 'needs_material' && canStudy
  const displayState = stage.status === 'locked' ? 'locked' : stage.status === 'available' ? 'level_not_started' : readiness

  const currentIndex = stage.lessons.findIndex((l) => l.id === lesson.id)
  const prevLesson = currentIndex > 0 ? stage.lessons[currentIndex - 1] : null
  const nextLesson = currentIndex >= 0 && currentIndex < stage.lessons.length - 1 ? stage.lessons[currentIndex + 1] : null

  const toggleComplete = async () => {
    setSaving(true)
    setError('')
    try {
      const nextStatus = isCompleted ? 'in_progress' : 'completed'
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lesson update failed.')
    } finally {
      setSaving(false)
    }
  }

  const startLesson = async () => {
    setSaving(true)
    setError('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lesson could not be started.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article class="course-lesson-page">
      <header class="course-lesson-header">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href={routeHref('learn', 'paths')}>Threads</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'overview')}>{threadTitle}</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'curriculum', stage.id)}>Level {stage.position}</a>
        </nav>
        <div class="course-lesson-meta-bar">
          <div class="course-lesson-position">
            <span>Lesson {currentIndex + 1} of {stage.lessons.length}</span>
            {lesson.estimated_minutes && (
              <span class="lesson-duration-pill">
                <Icon name="clock" size={12} />
                <span>{lesson.estimated_minutes} min</span>
              </span>
            )}
          </div>
          <span class={`course-lesson-status-pill state-${displayState}`}>
            <Icon name={displayState === 'locked' ? 'lock' : isCompleted ? 'check' : displayState === 'needs_material' ? 'source' : 'clock'} size={12} />
            <span>
              {displayState === 'locked'
                ? 'Locked'
                : displayState === 'level_not_started'
                ? 'Level not started'
                : isCompleted
                ? 'Completed'
                : displayState === 'needs_material'
                ? 'Needs material'
                : displayState === 'in_progress'
                ? 'In progress'
                : 'Ready to study'}
            </span>
          </span>
        </div>
        <h1 dir="auto">{cleanTitle(lesson.title)}</h1>
        {(lesson.objective || lesson.description) && <p dir="auto">{lesson.objective || lesson.description}</p>}
      </header>

      {(prevLesson || nextLesson || canComplete) && (
        <div class="course-lesson-action-bar" aria-label="Lesson actions">
          <div class="course-lesson-nav">
            {prevLesson && (
              <a class="button secondary" href={lessonHref(threadId, prevLesson.id)} aria-label={`Previous lesson: ${prevLesson.title}`}>
                <Icon name="back" size={14} />
                <span><small>Previous</small><strong dir="auto">{cleanTitle(prevLesson.title)}</strong></span>
              </a>
            )}
            {nextLesson && (
              <a class="button secondary" href={lessonHref(threadId, nextLesson.id)} aria-label={`Next lesson: ${nextLesson.title}`}>
                <span><small>Next</small><strong dir="auto">{cleanTitle(nextLesson.title)}</strong></span>
                <Icon name="chevron" size={14} />
              </a>
            )}
          </div>
          {canComplete && (
            <div class="course-lesson-actions">
              {lesson.status === 'not_started' && canStudy ? (
                <button class="button primary folio-primary" type="button" onClick={startLesson} disabled={saving}>
                  Start lesson
                </button>
              ) : (
                <button
                  class={`button ${isCompleted ? 'secondary course-lesson-completed-btn' : 'primary folio-primary'}`}
                  type="button"
                  onClick={toggleComplete}
                  disabled={saving}
                >
                  <Icon name="check" size={15} />
                  <span>{saving ? 'Updating…' : isCompleted ? 'Completed · Reopen lesson' : 'Mark lesson complete'}</span>
                </button>
              )}
              {error && <p class="learning-material-error" role="alert">{error}</p>}
            </div>
          )}
        </div>
      )}

      {lesson.sources?.length ? <SourceSection sources={lesson.sources} /> : null}

      <details class="course-level-materials is-lesson-tools">
        <summary>
          <span>
            <strong>Notes, files & recall</strong>
          </span>
          <small>
            {(lesson.notes?.length || 0) +
              (lesson.files?.length || 0) +
              (lesson.cards?.length || 0) +
              (lesson.recall_drafts?.length || 0)}{' '}
            saved
          </small>
        </summary>
        <ScopedMaterials
          compact
          scope={{ kind: 'lesson', id: lesson.id, title: lesson.title }}
          notes={lesson.notes || []}
          files={lesson.files || []}
          cards={lesson.cards || []}
          drafts={lesson.recall_drafts || []}
          onChanged={onChanged}
        />
      </details>

    </article>
  )
}

function SourceSection({ sources, title = 'Study materials' }: { sources: PathSource[]; title?: string }) {
  const preferredIndex = sources.findIndex((source) => source.role === 'primary')
  const startIndex = preferredIndex >= 0 ? preferredIndex : 0
  const startSource = sources[startIndex]
  const remainingSources = sources.filter((_, index) => index !== startIndex)

  return (
    <section class="course-sources" aria-labelledby="course-sources-title">
      <div class="folio-section-head">
        <div>
          <h3 id="course-sources-title">{title}</h3>
        </div>
      </div>
      {startSource ? (
        <>
          <div class="lesson-source-start">
            <ul class="course-sources-list is-primary">
              <SourceCard source={startSource} />
            </ul>
          </div>
          {remainingSources.length > 0 && (
            <details class="lesson-more-sources">
              <summary>
                <span>
                  <strong>More materials</strong>
                </span>
                <span>{remainingSources.length}</span>
              </summary>
              <ul class="course-sources-list">
                {remainingSources.map((source) => <SourceCard key={source.recommendation_id} source={source} />)}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p class="folio-empty-line">Hermes has not curated material for this lesson yet.</p>
      )}
    </section>
  )
}

function SourceCard({ source }: { source: PathSource }) {
  return (
    <li class="course-source-card">
      <div class="course-source-header">
        <div class="course-source-tags">
          <span class="course-source-role-tag">{roleLabel(source.role)}</span>
          {source.branch_id && (
            <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(source.branch_id)}`}>
              <span class="badge-format">Branch</span>
              <span>{source.branch_label || source.branch_id}</span>
            </a>
          )}
        </div>
        <strong class="course-source-title" dir="auto">{cleanTitle(source.video_title) || 'Untitled source'}</strong>
        {source.expected_contribution && <p class="course-source-rationale" dir="auto">{source.expected_contribution}</p>}
      </div>
      <SourceMaterialLauncher source={source} />
    </li>
  )
}

const materialIcon = (kind: SourceMaterialKind) =>
  kind === 'original' ? 'external' : kind === 'html' ? 'source' : kind === 'pdf' ? 'file' : 'spark'

function SourceMaterialLauncher({ source }: { source: PathSource }) {
  const launcher = buildSourceMaterialLauncher(source)
  if (!launcher) return <p class="course-material-unavailable">No openable material</p>
  const materials = [launcher.primary, ...launcher.alternatives]

  return (
    <div class="course-material-launcher is-icon-only" aria-label={`Open formats for ${source.video_title || 'this source'}`}>
      {materials.map((material, index) => {
        const description = [material.label, material.purpose, ...material.details, material.availability].filter(Boolean).join('. ')
        return (
          <a
            class={`course-material-icon-action material-${material.kind} ${index === 0 ? 'is-primary' : ''}`}
            href={material.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${index === 0 && launcher.explicitlyRecommended ? 'Recommended. ' : ''}${description}. Opens in a new tab.`}
            title={`${material.format}: ${material.label}`}
            key={material.kind}
          >
            <Icon name={materialIcon(material.kind)} size={16} />
            <span class="visually-hidden">{material.format}</span>
          </a>
        )
      })}
    </div>
  )
}
