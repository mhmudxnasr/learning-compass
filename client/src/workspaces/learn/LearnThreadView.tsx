import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { routeHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { findNextThreadLesson, lessonHref, lessonReadiness, percent, statusLabel } from './helpers'
import { LessonView } from './LearnLessonView'
import { StageView } from './LearnLevelView'
import { ThreadProjects } from './LearnThreadProjects'
import { LevelList, ThreadMaterialLedger } from './LearnThreadMaterials'
import {
  completedLessonCount,
  domId,
  lessonActionLabel,
  levelTitle,
  persistThreadLevelFocus,
  threadMaterialTotals,
  threadNextLesson,
  threadSourceCount,
  threadTabHref,
} from './threadViewModel'
import { PathResponse, PathStage } from './types'
import { ThreadAuthoring } from './ThreadAuthoring'
import { ThreadStudyOverview } from './ThreadStudyOverview'
import { LessonNavigator } from './LessonNavigator'

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
  const [focusMode, setFocusMode] = useState(() => {
    try {
      return localStorage.getItem('compass-lesson-focus') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => setSelectedStageId(routeLevelId || null), [routeLevelId])
  useEffect(() => setLessonId(routeLessonId || null), [routeLessonId])

  if (path.loading && !path.data) return <Loading label="Loading Thread curriculum" />
  if (path.error && !path.data) return <ErrorState message={path.error} retry={path.reload} />
  if (!path.data) {
    return (
      <Empty
        title="This Learning Thread is unavailable"
        body="The Thread may have been archived, moved, or the link may be incomplete."
        action={
          <a class="button secondary" href={routeHref('learn', 'paths')}>
            Return to Threads
          </a>
        }
      />
    )
  }

  const { stages } = path.data
  const lessonStage = lessonId
    ? stages.find((stage) => stage.lessons.some((lesson) => lesson.id === lessonId))
    : undefined
  const activeStage =
    stages.find((stage) => stage.id === selectedStageId) || lessonStage || path.data.current_stage || stages[0]
  const activeLesson = activeStage?.lessons.find((lesson) => lesson.id === lessonId)

  if (!routeLevelId && !routeLessonId) {
    return <ThreadCommandCenter path={path.data} tab={tab} focusLevelId={focusLevelId} onChanged={path.reload} />
  }

  return (
    <section
      class={`learn-workspace folio-learn folio-thread course-thread ${activeLesson ? `lesson-study-workspace ${focusMode ? 'is-focused' : ''}` : ''}`}
    >
      {activeLesson && (
        <>
          <div class="lesson-workspace-tools">
            <button
              class="button secondary"
              aria-pressed={focusMode}
              onClick={() => {
                setFocusMode(!focusMode)
                try {
                  localStorage.setItem('compass-lesson-focus', String(!focusMode))
                } catch {
                  /* Focus remains available without persistence. */
                }
              }}
            >
              <Icon name={focusMode ? 'menu' : 'book'} size={16} />
              {focusMode ? 'Show curriculum' : 'Focus on lesson'}
            </button>
            <a class="button secondary" href={threadTabHref(threadId, 'materials')}>
              Resources
              <Icon name="file" size={15} />
            </a>
          </div>
          {!focusMode && <LessonNavigator key={threadId} path={path.data} lessonId={activeLesson.id} />}
        </>
      )}
      <main class="course-main">
        {activeLesson ? (
          <LessonView
            key={activeLesson.id}
            lesson={activeLesson}
            stage={activeStage!}
            threadId={threadId}
            threadTitle={path.data.thread.title}
            followingLesson={findNextThreadLesson(stages, activeLesson.id)}
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
      sum +
      Number(stage.progress?.study_completed ?? stage.lessons.filter((lesson) => lesson.status === 'completed').length),
    0,
  )
  const totalLessons = path.stages.reduce(
    (sum, stage) => sum + Number(stage.progress?.study_total ?? stage.lessons.length),
    0,
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
      ? lessonHref(thread.id, next.lesson.id)
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
    <section class="learn-workspace folio-learn thread-command-center vertical-thread thread-study-center">
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
            {thread.guiding_question && (
              <p class="thread-guiding-lede" dir="auto">
                {thread.guiding_question}
              </p>
            )}
          </div>

          <aside class="vertical-thread-position" aria-label="Current Thread position">
            <div class="vertical-thread-progress-copy">
              <strong>
                {completedLessons} / {totalLessons}
              </strong>
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
              <div class="vertical-thread-progress-track is-empty" aria-hidden="true">
                <span />
              </div>
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
                next && next.stage.status !== 'locked' && nextReadiness !== 'needs_material'
                  ? 'primary folio-primary'
                  : 'secondary'
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

      {activeTab === 'overview' && (
        <ThreadStudyOverview key={thread.id} path={path} onChanged={onChanged}>
          <ThreadOverview path={path} currentStage={currentStage} />
        </ThreadStudyOverview>
      )}

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
        <span>
          <strong>{sources}</strong> sources
        </span>
        <span>
          <strong>{materialTotals.notes}</strong> notes
        </span>
        <span>
          <strong>{materialTotals.files}</strong> files
        </span>
        <span>
          <strong>{materialTotals.cards + materialTotals.drafts}</strong> recall
        </span>
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
                <span class="vertical-journey-marker" aria-hidden="true">
                  {stage.position}
                </span>
                <div class="vertical-journey-copy">
                  <a href={threadTabHref(path.thread.id, 'curriculum', stage.id)}>
                    <strong>
                      Level {stage.position} — {levelTitle(stage)}
                    </strong>
                  </a>
                  {(stage.objective || stage.description) && <p>{stage.objective || stage.description}</p>}
                </div>
                <div class="vertical-journey-meta">
                  <span class={`folio-status-tag status-${stage.status}`}>{label}</span>
                  <small>
                    {completed} / {stage.lessons.length} lessons
                  </small>
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
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'needs_material' | 'completed'>(() =>
    new URLSearchParams(location.hash.split('?')[1]).get('filter') === 'needs_material' ? 'needs_material' : 'all',
  )
  const [visibleResultCount, setVisibleResultCount] = useState(24)

  useEffect(() => {
    setExpandedStageId((current) =>
      path.stages.some((stage) => stage.id === current) ? current : defaultStage?.id || path.stages[0]?.id || '',
    )
  }, [defaultStage?.id, path.stages, path.thread.id])

  useEffect(() => setVisibleResultCount(24), [path.thread.id, query, filter])

  const lessons = path.stages.flatMap((stage) => stage.lessons.map((lesson, index) => ({ stage, lesson, index })))
  const completedLessons = lessons.filter(({ lesson }) => lesson.status === 'completed').length
  const inProgressLessons = lessons.filter(({ lesson }) => lesson.status === 'in_progress').length
  const needsMaterialLessons = lessons.filter(({ lesson }) => lessonReadiness(lesson) === 'needs_material').length
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
          <p>
            Every Level summary stays visible. One Level opens at a time, and search becomes one direct lesson index.
          </p>
        </div>
        <span>
          {completedLessons} of {lessons.length} lessons complete
        </span>
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
                  <a class="vertical-curriculum-result" href={lessonHref(path.thread.id, lesson.id)} key={lesson.id}>
                    <span class="vertical-curriculum-step">
                      {stage.position}.{index + 1}
                    </span>
                    <span>
                      <strong>{lesson.title}</strong>
                      <small>
                        Level {stage.position} — {levelTitle(stage)}
                      </small>
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
              stage.sources.length + stage.lessons.reduce((total, lesson) => total + (lesson.sources?.length || 0), 0)
            const isLocked = stage.status === 'locked'
            const stageState =
              stage.status === 'completed'
                ? 'Completed'
                : isLocked
                  ? sourceCount > 0
                    ? 'Preview · Prerequisite'
                    : 'Preview · Needs material'
                  : statusLabel(stage.status)

            return (
              <li class={`${expanded ? 'is-expanded' : ''} ${isLocked ? 'is-preview' : ''}`} key={stage.id}>
                <span class="vertical-journey-marker" aria-hidden="true">
                  {stage.position}
                </span>
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
                      <strong>
                        Level {stage.position} — {levelTitle(stage)}
                      </strong>
                      <small>
                        {stage.lessons.length} lessons · {sourceCount} sources
                      </small>
                    </span>
                    <span class="vertical-curriculum-level-state">
                      <span class={`folio-status-tag status-${stage.status}`}>{stageState}</span>
                      <small>
                        {completed} / {stage.lessons.length}
                      </small>
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
                                <span class={`lesson-readiness-pill state-${readiness}`}>{statusLabel(readiness)}</span>
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

      <ThreadAuthoring
        key={expandedStageId}
        threadId={path.thread.id}
        stage={path.stages.find((stage) => stage.id === expandedStageId)}
        stageCount={path.stages.length}
        onChanged={onChanged}
      />
    </section>
  )
}
