import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { uploadArtifact } from '../../app/upload'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
import { artifactHref, cardHref, lessonHref, lessonReadiness, levelHref, noteHref, percent, roleLabel, statusLabel } from './helpers'
import { buildSourceMaterialLauncher, SourceMaterialKind, SourceMaterialOption } from './sourceMaterials'
import { parseNoteBlocks } from './noteReader'
import { NoteRecord, PathArtifact, PathResponse, PathSource, PathStage, RecallCard, RecallDraft, ThreadLesson, ThreadProject } from './types'
import { ThreadAuthoring } from './ThreadAuthoring'

export function LearnThreadView({
  threadId,
  levelId: routeLevelId,
  lessonId: routeLessonId,
  tab,
}: {
  threadId: string
  levelId?: string
  lessonId?: string
  tab?: string
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
        action={<a class="button secondary" href="#/learn">Return to Threads</a>}
      />
    )
  }

  const { stages } = path.data
  const lessonStage = lessonId ? stages.find((stage) => stage.lessons.some((lesson) => lesson.id === lessonId)) : undefined
  const activeStage = stages.find((stage) => stage.id === selectedStageId) || lessonStage || path.data.current_stage || stages[0]
  const activeLesson = activeStage?.lessons.find((lesson) => lesson.id === lessonId)

  if (!routeLevelId && !routeLessonId) {
    return <ThreadCommandCenter path={path.data} tab={tab} onChanged={path.reload} />
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
  { key: 'overview', label: 'Overview', icon: 'spark' },
  { key: 'curriculum', label: 'Curriculum', icon: 'source' },
  { key: 'evidence', label: 'Evidence', icon: 'edit' },
  { key: 'materials', label: 'Materials', icon: 'file' },
] as const
type ThreadTabKey = (typeof threadTabs)[number]['key']

function ThreadCommandCenter({
  path,
  tab,
  onChanged,
}: {
  path: PathResponse
  tab?: string
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
  const completedProof = path.stages.reduce(
    (sum, stage) =>
      sum + Number(stage.progress?.proof_completed ?? 0) + Number(stage.progress?.project_completed ?? 0),
    0
  )
  const totalProof = path.stages.reduce(
    (sum, stage) => sum + Number(stage.progress?.proof_total ?? 0) + Number(stage.progress?.project_total ?? 0),
    0
  )
  const completedLevels = path.stages.filter((stage) => ['verified', 'waived'].includes(stage.status)).length
  const currentStage = path.stages.find((stage) => ['available', 'in_progress', 'ready_to_verify'].includes(stage.status)) || path.stages[0]

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
    <section class="learn-workspace folio-learn thread-command-center">
      {/* Thread Command Header */}
      <header class="thread-command-head">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href="#/learn">Threads</a>
          <span aria-hidden="true">/</span>
          <span>{thread.title}</span>
        </nav>

        <div class="thread-command-title">
          <div class="thread-title-block">
            <div class="thread-badge-strip">
              <span class={`folio-status-tag status-${thread.status}`}>
                <i class="folio-tag-dot" aria-hidden="true" />
                {statusLabel(thread.status)}
              </span>
              <span class="folio-type-tag">{thread.thread_type || 'understand'}</span>
              <span class="thread-stat-pill">{completedLessons}/{totalLessons} lessons completed</span>
            </div>
            <h1>{thread.title}</h1>
            {thread.guiding_question && <p class="thread-guiding-lede">{thread.guiding_question}</p>}
          </div>

          <div class="thread-command-actions">
            {thread.status === 'paused' || thread.status === 'draft' ? (
              <button
                class="button primary folio-primary"
                disabled={Boolean(working)}
                onClick={() =>
                  mutate('Activate Thread', `/learning/core/threads/${encodeURIComponent(thread.id)}/status`, {
                    status: 'active',
                  })
                }
              >
                Activate Thread
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
                Pause Thread
              </button>
            ) : null}

            {thread.status === 'ready_to_verify' && (
              <button
                class="button primary folio-primary"
                disabled={Boolean(working)}
                onClick={() =>
                  mutate('Verify Thread', `/learning/core/threads/${encodeURIComponent(thread.id)}/verify`)
                }
              >
                Verify Thread
              </button>
            )}
          </div>
        </div>

        {/* Enhanced Tabs Navigation */}
        <nav class="thread-tabs" aria-label="Thread sections">
          {threadTabs.map((item) => (
            <a
              href={`#/learn/thread/${encodeURIComponent(thread.id)}?tab=${item.key}`}
              class={`thread-tab-link ${item.key === activeTab ? 'is-active' : ''}`}
              aria-current={item.key === activeTab ? 'page' : undefined}
              key={item.key}
            >
              <Icon name={item.icon as any} size={15} />
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

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <ThreadOverview
          path={path}
          currentStage={currentStage}
          study={[completedLessons, totalLessons]}
          proof={[completedProof, totalProof]}
          verification={[completedLevels, path.stages.length]}
        />
      )}

      {activeTab === 'curriculum' && <ThreadCurriculum path={path} onChanged={onChanged} />}

      {activeTab === 'evidence' && <ThreadProjects path={path} onChanged={onChanged} />}

      {activeTab === 'materials' && <ThreadMaterialLedger path={path} onChanged={onChanged} open />}
    </section>
  )
}

function ThreadOverview({
  path,
  currentStage,
  study,
  proof,
  verification,
}: {
  path: PathResponse
  currentStage?: PathStage
  study: number[]
  proof: number[]
  verification: number[]
}) {
  const activeStages = path.stages.filter((s) => ['in_progress', 'available', 'ready_to_verify'].includes(s.status))
  const displayStages = activeStages.length > 0 ? activeStages : currentStage ? [currentStage] : (path.stages[0] ? [path.stages[0]] : [])
  const nextLesson = currentStage?.lessons?.find((l) => l.status !== 'completed') || currentStage?.lessons?.[0]
  const totalNotes = path.notes.length + path.stages.reduce((s, st) => s + st.notes.length, 0)
  const totalCards = path.cards.length + path.stages.reduce((s, st) => s + st.cards.length, 0)

  return (
    <div class="thread-overview-grid">
      <main class="thread-overview-main">
        {/* Active Lessons Section */}
        <section class="thread-active-section" aria-labelledby="thread-active-lessons-title">
          <div class="thread-active-header">
            <div>
              <p class="folio-object-kicker">Current Curriculum Focus</p>
              <h2 id="thread-active-lessons-title">Active Lessons</h2>
            </div>
            {currentStage && (
              <a class="button secondary thread-open-level-btn" href={levelHref(path.thread.id, currentStage.id)}>
                <span>Level {currentStage.position} Hub</span>
                <Icon name="chevron" size={14} />
              </a>
            )}
          </div>

          {displayStages.map((stage) => {
            const completedCount = stage.lessons.filter((l) => l.status === 'completed').length
            const totalCount = stage.lessons.length
            return (
              <div class="thread-active-stage-group" key={stage.id}>
                <div class="thread-active-stage-bar">
                  <div class="thread-active-stage-title">
                    <span class="thread-level-badge">{String(stage.position).padStart(2, '0')}</span>
                    <div>
                      <strong>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong>
                      {stage.objective && <p class="thread-active-stage-obj">{stage.objective}</p>}
                    </div>
                  </div>
                  <div class="thread-active-stage-meta">
                    <span class={`folio-status-tag status-${stage.status}`}>{statusLabel(stage.status)}</span>
                    <span class="thread-level-progress-tag">
                      {completedCount}/{totalCount} completed
                    </span>
                  </div>
                </div>

                <div class="thread-active-lessons-list">
                  {stage.lessons.map((lesson, idx) => {
                    const readiness = lessonReadiness(lesson)
                    const isDone = lesson.status === 'completed'
                    const isInProgress = lesson.status === 'in_progress'
                    const isNext = lesson.id === nextLesson?.id
                    const noteCount = lesson.notes?.length || 0
                    const cardCount = lesson.cards?.length || 0
                    const fileCount = lesson.files?.length || 0

                    return (
                      <div
                        class={`thread-active-lesson-card ${isInProgress ? 'is-in-progress' : ''} ${isDone ? 'is-completed' : ''} ${isNext ? 'is-next' : ''}`}
                        key={lesson.id}
                      >
                        <div class="thread-active-lesson-left">
                          <span class="thread-active-lesson-index">
                            {isDone ? <Icon name="check" size={14} /> : String(idx + 1).padStart(2, '0')}
                          </span>
                          <div class="thread-active-lesson-body">
                            <div class="thread-active-lesson-head">
                              <strong class="thread-active-lesson-name">{lesson.title}</strong>
                              <span class={`lesson-readiness-pill state-${readiness}`}>
                                {statusLabel(readiness)}
                              </span>
                            </div>
                            {(lesson.description || lesson.why_learn) && (
                              <p class="thread-active-lesson-desc">{lesson.description || lesson.why_learn}</p>
                            )}
                            <div class="thread-active-lesson-meta">
                              {lesson.estimated_minutes ? (
                                <span class="thread-active-lesson-duration">
                                  <Icon name="clock" size={12} />
                                  {lesson.estimated_minutes} min
                                </span>
                              ) : null}
                              {noteCount > 0 && (
                                <span class="thread-active-lesson-pill">
                                  <Icon name="edit" size={12} />
                                  {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                                </span>
                              )}
                              {cardCount > 0 && (
                                <span class="thread-active-lesson-pill">
                                  <Icon name="spark" size={12} />
                                  {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                                </span>
                              )}
                              {fileCount > 0 && (
                                <span class="thread-active-lesson-pill">
                                  <Icon name="file" size={12} />
                                  {fileCount} {fileCount === 1 ? 'material' : 'materials'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div class="thread-active-lesson-action">
                          <a
                            class={`button ${isInProgress || isNext ? 'primary folio-primary' : 'secondary'}`}
                            href={lessonHref(path.thread.id, lesson.id)}
                          >
                            {isInProgress
                              ? 'Continue'
                              : isDone
                              ? 'Review'
                              : isNext
                              ? 'Start'
                              : 'Open'}
                            <Icon name="chevron" size={13} />
                          </a>
                        </div>
                      </div>
                    )
                  })}
                  {!stage.lessons.length && (
                    <p class="folio-empty-line">No lessons have been defined for Level {stage.position} yet.</p>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        {/* Thread Purpose & Target Outcome */}
        <section class="thread-purpose">
          <div class="thread-purpose-card">
            <p class="folio-object-kicker">Definition of Done</p>
            <h2>Target Outcome</h2>
            <p>{path.thread.definition_of_done || 'No completion definition recorded.'}</p>
          </div>

          {path.thread.why_now && (
            <div class="thread-purpose-card">
              <p class="folio-object-kicker">Rationale</p>
              <h3>Why This Matters Now</h3>
              <p>{path.thread.why_now}</p>
            </div>
          )}
        </section>
      </main>

      {/* Progress Ledger Sidebar */}
      <aside class="thread-progress-ledger" aria-label="Thread progress">
        <h2>Progress Breakdown</h2>
        <ProgressTrack
          label="Study"
          completed={study[0]}
          total={study[1]}
          unit="lessons"
          value={percent(study[0], study[1])}
        />
        <ProgressTrack
          label="Proof"
          completed={proof[0]}
          total={proof[1]}
          unit="proof items"
          value={percent(proof[0], proof[1])}
        />
        <ProgressTrack
          label="Verification"
          completed={verification[0]}
          total={verification[1]}
          unit="levels"
          value={percent(verification[0], verification[1])}
        />
        <div class="thread-materials-count-card">
          <span class="folio-object-kicker">Knowledge Artifacts</span>
          <div class="thread-materials-stats">
            <div>
              <strong>{totalNotes}</strong>
              <small>Study Notes</small>
            </div>
            <div>
              <strong>{totalCards}</strong>
              <small>Recall Cards</small>
            </div>
            <div>
              <strong>{path.files.length}</strong>
              <small>Stored Files</small>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function ThreadCurriculum({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')

  const totalLessons = path.stages.reduce((sum, stage) => sum + stage.lessons.length, 0)
  const completedLessons = path.stages.reduce(
    (sum, stage) => sum + stage.lessons.filter((lesson) => lesson.status === 'completed').length,
    0,
  )
  const inProgressLessons = path.stages.reduce(
    (sum, stage) => sum + stage.lessons.filter((lesson) => lesson.status === 'in_progress').length,
    0,
  )
  const needsMaterialLessons = path.stages.reduce(
    (sum, stage) => sum + stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length,
    0,
  )
  const nextStage = path.stages.find((stage) => stage.lessons.some((lesson) => lesson.status !== 'completed')) || path.stages[0]
  const nextLesson = nextStage?.lessons.find((lesson) => lesson.status !== 'completed')
  const progress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
  const completedStages = path.stages.filter(
    (stage) => stage.status === 'completed' || (stage.lessons.length > 0 && stage.lessons.every((l) => l.status === 'completed')),
  ).length

  const matches = (lesson: ThreadLesson, stage: PathStage) =>
    (!query || `${lesson.title} ${lesson.description || ''} ${lesson.why_learn || ''} ${lesson.why_now || ''} ${lesson.takeaway || ''} ${stage.title}`.toLowerCase().includes(query.toLowerCase())) &&
    (filter === 'all' ||
      filter === lesson.status ||
      (filter === 'needs_material' && lessonReadiness(lesson) === 'needs_material'))

  return (
    <section class="thread-curriculum">
      {/* 1. Header & Roadmap Progress Hero */}
      <header class="curriculum-roadmap-hero">
        <div class="curriculum-hero-intro">
          <p class="folio-object-kicker">Curriculum Architecture</p>
          <h2 class="curriculum-hero-title">Pathway & Lesson Roadmap</h2>
          <p class="curriculum-hero-subtitle">
            Progress systematically through each level. Every lesson delivers distinct foundational concepts, primary source study, and applied mastery.
          </p>
        </div>

        <div class="curriculum-hero-stats">
          <div class="curriculum-hero-stat-main">
            <span class="curriculum-hero-pct">{progress}%</span>
            <div class="curriculum-hero-stat-copy">
              <strong>Progress Completed</strong>
              <span>{completedLessons} of {totalLessons} lessons finished</span>
            </div>
          </div>

          <div class="curriculum-hero-track" aria-hidden="true">
            <div class="curriculum-hero-track-bar" style={{ width: `${progress}%` }} />
          </div>

          <div class="curriculum-hero-badges">
            <span class="curriculum-hero-pill">
              <Icon name="learn" size={13} /> {completedStages} of {path.stages.length} levels finished
            </span>
            <span class="curriculum-hero-pill">
              <Icon name="spark" size={13} /> {inProgressLessons} active now
            </span>
          </div>
        </div>
      </header>

      {/* 2. Spotlight "Up Next" Card */}
      {nextLesson && nextStage && (
        <div class="curriculum-spotlight-card">
          <div class="curriculum-spotlight-left">
            <div class="curriculum-spotlight-kicker">
              <span class="curriculum-spotlight-badge">UP NEXT</span>
              <span class="curriculum-spotlight-level">Level {nextStage.position} · {nextStage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</span>
            </div>
            <h3 class="curriculum-spotlight-title">{nextLesson.title}</h3>
            <p class="curriculum-spotlight-desc">
              {nextLesson.why_learn || nextLesson.description || nextLesson.takeaway || 'Continue your next lesson on the curriculum pathway.'}
            </p>
            <div class="curriculum-spotlight-meta">
              {nextLesson.estimated_minutes ? (
                <span class="curriculum-meta-chip">
                  <Icon name="clock" size={12} /> {nextLesson.estimated_minutes} min
                </span>
              ) : null}
              {nextLesson.sources?.length ? (
                <span class="curriculum-meta-chip">
                  <Icon name="source" size={12} /> {nextLesson.sources.length} {nextLesson.sources.length === 1 ? 'material' : 'materials'}
                </span>
              ) : null}
              <span class={`lesson-readiness-pill state-${lessonReadiness(nextLesson)}`}>
                {statusLabel(lessonReadiness(nextLesson))}
              </span>
            </div>
          </div>
          <div class="curriculum-spotlight-action">
            <a
              class="button primary folio-primary curriculum-spotlight-btn"
              href={lessonHref(path.thread.id, nextLesson.id)}
            >
              {nextLesson.status === 'in_progress' ? 'Continue Lesson' : 'Start Lesson'}
              <Icon name="chevron" size={14} />
            </a>
          </div>
        </div>
      )}

      {/* 3. Controls & Filter Bar */}
      <div class="curriculum-controls-bar">
        <div class="curriculum-search-box">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Search lessons, topics, or outcomes…"
            aria-label="Search lessons"
          />
          {query && (
            <button class="curriculum-search-clear" onClick={() => setQuery('')} aria-label="Clear search" type="button">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        <div class="curriculum-filter-pills">
          {[
            { key: 'all', label: `All (${totalLessons})` },
            { key: 'in_progress', label: `In progress (${inProgressLessons})` },
            { key: 'needs_material', label: `Needs material (${needsMaterialLessons})` },
            { key: 'completed', label: `Completed (${completedLessons})` },
          ].map((tab) => (
            <button
              key={tab.key}
              class={`curriculum-filter-chip ${filter === tab.key ? 'is-active' : ''}`}
              onClick={() => setFilter(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div class="thread-view-switcher curriculum-view-switcher">
          <button
            class={`thread-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            type="button"
            title="Cards view"
          >
            Cards
          </button>
          <button
            class={`thread-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            type="button"
            title="List view"
          >
            List
          </button>
        </div>
      </div>

      {/* 4. Level Modules */}
      <div class="curriculum-modules-list">
        {path.stages.map((stage) => {
          const lessons = stage.lessons.filter((lesson) => matches(lesson, stage))
          const stageCompleted = stage.lessons.filter((l) => l.status === 'completed').length
          const stageProgress = stage.lessons.length ? Math.round((stageCompleted / stage.lessons.length) * 100) : 0
          const isLocked = stage.status === 'locked'

          return (
            <section class={`curriculum-stage-module status-${stage.status}`} key={stage.id}>
              <header class="curriculum-stage-header">
                <div class="curriculum-stage-header-left">
                  <div class="curriculum-stage-kicker-row">
                    <span class="curriculum-stage-badge">LEVEL {stage.position}</span>
                    <span class={`folio-status-tag status-${stage.status}`}>{statusLabel(stage.status)}</span>
                  </div>
                  <h3 class="curriculum-stage-title">
                    {stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}
                  </h3>
                  {(stage.objective || stage.description) && (
                    <p class="curriculum-stage-objective">{stage.objective || stage.description}</p>
                  )}
                </div>

                <div class="curriculum-stage-header-right">
                  <div class="curriculum-stage-progress-info">
                    <strong>{stageCompleted} of {stage.lessons.length}</strong>
                    <span>lessons complete ({stageProgress}%)</span>
                  </div>
                  <a
                    class="button secondary curriculum-open-level-btn"
                    href={levelHref(path.thread.id, stage.id)}
                  >
                    {isLocked ? 'Preview Level' : 'Open Level Hub'}
                    <Icon name="chevron" size={13} />
                  </a>
                </div>
              </header>

              <div class="curriculum-stage-meter" aria-hidden="true">
                <div class="curriculum-stage-meter-fill" style={{ width: `${stageProgress}%` }} />
              </div>

              {isLocked ? (
                <div class="curriculum-stage-locked-notice">
                  <Icon name="lock" size={15} />
                  <span>Level locked. Complete the preceding levels to unlock active study.</span>
                </div>
              ) : null}

              {/* Lessons container */}
              {viewMode === 'cards' ? (
                <div class="curriculum-lessons-grid">
                  {lessons.map((lesson, idx) => {
                    const readiness = lessonReadiness(lesson)
                    const isDone = lesson.status === 'completed'
                    const isInProgress = lesson.status === 'in_progress'
                    const isNext = lesson.id === nextLesson?.id

                    return (
                      <div
                        class={`curriculum-lesson-card ${isDone ? 'is-completed' : ''} ${isInProgress ? 'is-in-progress' : ''} ${isNext ? 'is-next' : ''} ${isLocked ? 'is-locked' : ''}`}
                        key={lesson.id}
                      >
                        <div class="curriculum-card-top">
                          <div class="curriculum-card-index-title">
                            <span class="curriculum-card-step-badge">
                              {isDone ? <Icon name="check" size={13} /> : String(idx + 1).padStart(2, '0')}
                            </span>
                            <h4 class="curriculum-card-title">{lesson.title}</h4>
                          </div>
                          <span class={`lesson-readiness-pill state-${readiness}`}>
                            {statusLabel(readiness)}
                          </span>
                        </div>

                        <p class="curriculum-card-summary">
                          {lesson.why_learn || lesson.description || lesson.takeaway || 'Structured lesson unit.'}
                        </p>

                        <div class="curriculum-card-footer">
                          <div class="curriculum-card-tags">
                            {lesson.estimated_minutes ? (
                              <span class="curriculum-tag-pill">
                                <Icon name="clock" size={11} /> {lesson.estimated_minutes}m
                              </span>
                            ) : null}
                            {lesson.sources?.length ? (
                              <span class="curriculum-tag-pill">
                                <Icon name="source" size={11} /> {lesson.sources.length} {lesson.sources.length === 1 ? 'source' : 'sources'}
                              </span>
                            ) : null}
                          </div>

                          <a
                            class={`curriculum-card-cta-btn ${isInProgress || isNext ? 'is-highlight' : ''}`}
                            href={lessonHref(path.thread.id, lesson.id)}
                          >
                            {isDone ? 'Review' : isInProgress ? 'Continue' : 'Start'}
                            <Icon name="chevron" size={12} />
                          </a>
                        </div>
                      </div>
                    )
                  })}
                  {!lessons.length && (
                    <p class="curriculum-empty-filter-note">No lessons match your active search/filter in Level {stage.position}.</p>
                  )}
                </div>
              ) : (
                <div class="curriculum-lessons-list-view">
                  {lessons.map((lesson, idx) => {
                    const readiness = lessonReadiness(lesson)
                    const isDone = lesson.status === 'completed'
                    const isInProgress = lesson.status === 'in_progress'

                    return (
                      <a
                        class={`curriculum-list-row ${isDone ? 'is-completed' : ''} ${isInProgress ? 'is-in-progress' : ''}`}
                        href={lessonHref(path.thread.id, lesson.id)}
                        key={lesson.id}
                      >
                        <span class="curriculum-list-step">
                          {isDone ? <Icon name="check" size={13} /> : String(idx + 1).padStart(2, '0')}
                        </span>
                        <div class="curriculum-list-body">
                          <div class="curriculum-list-head">
                            <strong class="curriculum-list-title">{lesson.title}</strong>
                            <span class={`lesson-readiness-pill state-${readiness}`}>
                              {statusLabel(readiness)}
                            </span>
                          </div>
                          {(lesson.why_learn || lesson.description) && (
                            <p class="curriculum-list-desc">{lesson.why_learn || lesson.description}</p>
                          )}
                        </div>
                        <div class="curriculum-list-meta">
                          {lesson.estimated_minutes ? (
                            <span class="curriculum-tag-pill"><Icon name="clock" size={11} /> {lesson.estimated_minutes}m</span>
                          ) : null}
                          {lesson.sources?.length ? (
                            <span class="curriculum-tag-pill"><Icon name="source" size={11} /> {lesson.sources.length}</span>
                          ) : null}
                          <span class="curriculum-list-cta">
                            {isDone ? 'Review' : isInProgress ? 'Continue' : 'Start'}
                            <Icon name="chevron" size={13} />
                          </span>
                        </div>
                      </a>
                    )
                  })}
                  {!lessons.length && (
                    <p class="curriculum-empty-filter-note">No lessons match your active search/filter in Level {stage.position}.</p>
                  )}
                </div>
              )}

              {/* Stage Project Link Banner if present */}
              {stage.projects && stage.projects.length > 0 ? (
                <div class="curriculum-stage-project-banner">
                  <div class="curriculum-stage-project-info">
                    <span class="curriculum-stage-project-icon"><Icon name="edit" size={14} /></span>
                    <div>
                      <small>Level {stage.position} Applied Project</small>
                      <strong>{stage.projects[0].title}</strong>
                    </div>
                  </div>
                  <a
                    class="button secondary curriculum-stage-project-link"
                    href={`#/learn/thread/${encodeURIComponent(path.thread.id)}?tab=evidence`}
                  >
                    View Project <Icon name="chevron" size={12} />
                  </a>
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      {/* Curriculum Authoring Tool */}
      <ThreadAuthoring threadId={path.thread.id} stageCount={path.stages.length} onChanged={onChanged} />
    </section>
  )
}

function ThreadProjects({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')

  const updateProject = async (id: string, status: string) => {
    setSaving(id)
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.thread.id)}/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
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

  return (
    <section class="thread-evidence-ledger thread-projects-section">
      <header class="thread-projects-header">
        <div>
          <p class="folio-object-kicker">Applied Practice & Synthesis</p>
          <h2>Practical Projects & Durable Takeaways</h2>
          <p>Real-world projects and personal synthesis solidify understanding into durable capability.</p>
        </div>
        <div class="thread-view-switcher" role="group" aria-label="Projects view mode">
          <button
            type="button"
            class={`thread-view-btn ${viewMode === 'cards' ? 'is-active' : ''}`}
            onClick={() => setViewMode('cards')}
            aria-pressed={viewMode === 'cards'}
          >
            <Icon name="palette" size={14} />
            <span>Cards</span>
          </button>
          <button
            type="button"
            class={`thread-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            <Icon name="menu" size={14} />
            <span>List</span>
          </button>
        </div>
      </header>

      {/* Level Projects Grid */}
      <div class="thread-levels-projects-grid">
        {path.stages.map((stage) => {
          if (!stage.projects || stage.projects.length === 0) return null
          return (
            <section class="thread-proof-level" key={stage.id}>
              <div class="thread-proof-level-head">
                <div class="thread-proof-level-meta">
                  <span class="thread-level-badge">{String(stage.position).padStart(2, '0')}</span>
                  <div>
                    <p class="folio-object-kicker">Level {stage.position}</p>
                    <h3>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h3>
                  </div>
                </div>
                <span class={`folio-status-tag status-${stage.status}`}>{statusLabel(stage.status)}</span>
              </div>
              {viewMode === 'cards' ? (
                <div class="thread-project-grid">
                  {stage.projects.map((project) => (
                    <ProjectCard
                      project={project}
                      levelLabel={`Level ${stage.position}`}
                      saving={saving === project.id}
                      onUpdate={updateProject}
                      key={project.id}
                    />
                  ))}
                </div>
              ) : (
                <div class="thread-project-list">
                  {stage.projects.map((project) => (
                    <ProjectRow
                      project={project}
                      saving={saving === project.id}
                      onUpdate={updateProject}
                      key={project.id}
                    />
                  ))}
                </div>
              )}
              <LevelVerifyAction stage={stage} threadId={path.thread.id} onChanged={onChanged} />
            </section>
          )
        })}
      </div>

      {/* Final Mastery Project */}
      {path.projects
        .filter((project) => project.type === 'final')
        .map((project) => (
          <section class="thread-final-project" key={project.id}>
            <p class="folio-object-kicker">Capstone Mastery Project</p>
            {viewMode === 'cards' ? (
              <ProjectCard
                project={project}
                levelLabel="Capstone"
                saving={saving === project.id}
                onUpdate={updateProject}
              />
            ) : (
              <ProjectRow project={project} saving={saving === project.id} onUpdate={updateProject} />
            )}
          </section>
        ))}

      {/* Thread Final Synthesis */}
      <form class="thread-synthesis" onSubmit={saveSynthesis}>
        <label>
          <span class="folio-object-kicker">Thread Final Synthesis</span>
          <strong>What can you now explain, decide, build, or do?</strong>
          <textarea
            name="synthesis"
            rows={7}
            defaultValue={path.thread.final_synthesis || ''}
            placeholder="Document your durable takeaways, conceptual frameworks, and practical conclusions from this Thread…"
          />
        </label>
        <button class="button primary folio-primary" disabled={Boolean(saving)}>
          {saving === 'synthesis' ? 'Saving…' : 'Save Thread Synthesis'}
        </button>
      </form>

      {message && (
        <p class="folio-status" role="status">
          {message}
        </p>
      )}
    </section>
  )
}

function ProjectCard({
  project,
  levelLabel,
  saving,
  onUpdate,
}: {
  project: ThreadProject
  levelLabel?: string
  saving: boolean
  onUpdate: (id: string, status: string) => void
}) {
  return (
    <article class={`thread-project-card status-${project.status}`}>
      <div class="thread-project-card-head">
        <span class="thread-project-kicker">{levelLabel || 'Project'}</span>
        <span class={`folio-status-tag status-${project.status}`}>
          <i class="folio-tag-dot" aria-hidden="true" />
          {statusLabel(project.status)}
        </span>
      </div>

      <div class="thread-project-card-body">
        <h4 class="thread-project-card-title">{project.title}</h4>
        {project.description && <p class="thread-project-card-desc">{project.description}</p>}
        {project.instructions && (
          <div class="thread-project-instructions">{project.instructions}</div>
        )}
        {project.suggested_context && (
          <p class="thread-project-card-context">
            <strong>Context:</strong> {project.suggested_context}
          </p>
        )}
      </div>

      <div class="thread-project-card-footer">
        <span class="thread-project-status-label">Status</span>
        <select
          class="thread-project-status-select"
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
      </div>
    </article>
  )
}

function ProjectRow({
  project,
  saving,
  onUpdate,
}: {
  project: ThreadProject
  saving: boolean
  onUpdate: (id: string, status: string) => void
}) {
  return (
    <div class="thread-project-row">
      <div class="thread-project-info">
        <strong>{project.title}</strong>
        {project.description && <p>{project.description}</p>}
        {project.instructions && <div class="thread-project-instructions">{project.instructions}</div>}
      </div>
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
    </div>
  )
}

function LevelVerifyAction({
  stage,
  threadId,
  onChanged,
}: {
  stage: PathStage
  threadId: string
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (stage.status !== 'ready_to_verify') return null

  const verify = async () => {
    setSaving(true)
    setError('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/verify`, {
        method: 'POST',
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="thread-level-verify">
      <button class="button primary folio-primary" disabled={saving} onClick={verify}>
        {saving ? 'Verifying…' : 'Verify Level & Unlock Next'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
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

  const lifecycleAction = async (action: 'start' | 'verify') => {
    setWorking(true)
    setError('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/${action}`, {
        method: 'POST',
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Level ${action} failed.`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <header class="course-stage-header">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href="#/learn">Threads</a>
          <span aria-hidden="true">/</span>
          <span>{threadTitle}</span>
        </nav>
        <div class="course-stage-heading-line">
          <p class="folio-object-kicker">Level {stage.position}</p>
          <span class={`course-stage-status status-${stage.status}`}>{statusLabel(stage.status)}</span>
        </div>
        <h1>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h1>
        <p>{stage.objective || stage.description || 'Build the next layer of verified understanding.'}</p>
        <div class="course-stage-progress-grid" aria-label="Level progress">
          <ProgressTrack label="Study" completed={completedLessons} total={totalLessons} unit="lessons" value={lessonCompletion} />
        </div>
      </header>

      {stage.status === 'locked' && (
        <section class="course-next-action is-blocked">
          <div>
            <p class="folio-object-kicker">Locked Level</p>
            <h3>Finish the previous Level first</h3>
            <p>You can preview this curriculum, but study and completion actions unlock only after the previous Level is verified.</p>
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
          <button class="button primary folio-primary" disabled={working} onClick={() => lifecycleAction('start')}>
            {working ? 'Starting…' : 'Start Level'}
          </button>
        </section>
      )}

      {stage.status === 'ready_to_verify' && (
        <section class="course-next-action">
          <div>
            <p class="folio-object-kicker">Level work complete</p>
            <h3>Verify this Level</h3>
            <p>Confirm the lessons and project are complete to unlock the next Level in sequence.</p>
          </div>
          <button class="button primary folio-primary" disabled={working} onClick={() => lifecycleAction('verify')}>
            {working ? 'Verifying…' : 'Verify Level'}
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
            <p>{lessonsNeedingMaterial} {lessonsNeedingMaterial === 1 ? 'lesson needs' : 'lessons need'} authored content or a verified source before study can continue.</p>
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
    <details class="course-level-list" open>
      <summary class="course-level-list-heading">
        <span class="folio-object-kicker">Curriculum Spine</span>
        <span>{stages.length} levels</span>
      </summary>
      <div class="course-level-list-grid">
        {stages.map((stage) => (
          <a
            href={levelHref(threadId, stage.id)}
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
              {stage.status === 'verified' ? <Icon name="check" size={14} /> : stage.id === activeStage?.id ? '●' : '○'}
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
                <a href={levelHref(path.thread.id, stage.id)}>
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
                <strong>{card.question}</strong>
                <small>Approved card · due {card.due_at || 'now'}</small>
              </span>
            </a>
          ))}
          {drafts.map((draft) => (
            <div class="learning-material-row is-draft" key={draft.id}>
              <Icon name="clock" size={14} />
              <span>
                <strong>{draft.question}</strong>
                <small>Draft · approve in Recall</small>
              </span>
            </div>
          ))}
          <details class="learning-add-material">
            <summary>Add card</summary>
            <form onSubmit={createCard}>
              <input name="question" aria-label="Recall question" placeholder="Question" required />
              <textarea name="answer" aria-label="Recall answer" placeholder="Answer" rows={2} required />
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
  const canStudy = stage.status === 'in_progress' || stage.status === 'ready_to_verify'
  const canComplete = readiness !== 'needs_material' && canStudy

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
      <div class="course-lesson-top-nav">
        <a class="folio-back-link" href={levelHref(threadId, stage.id)}>
          <Icon name="back" size={14} />
          <span>Back to Level {stage.position}</span>
        </a>
        {lesson.estimated_minutes && (
          <span class="lesson-duration-pill">
            <Icon name="clock" size={12} />
            <span>{lesson.estimated_minutes} min</span>
          </span>
        )}
      </div>

      <header class="course-lesson-header">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href="#/learn">Threads</a>
          <span aria-hidden="true">/</span>
          <span>{threadTitle}</span>
          <span aria-hidden="true">/</span>
          <span>Level {stage.position}</span>
        </nav>
        <div class="course-lesson-meta-bar">
          <p class="folio-object-kicker">Lesson {String(lesson.position + 1).padStart(2, '0')}</p>
          <span class={`course-lesson-status-pill state-${readiness}`}>
            <Icon name={isCompleted ? 'check' : readiness === 'needs_material' ? 'source' : 'clock'} size={12} />
            <span>
              {isCompleted
                ? 'Completed'
                : readiness === 'needs_material'
                ? 'Needs material'
                : readiness === 'in_progress'
                ? 'In progress'
                : 'Ready to study'}
            </span>
          </span>
        </div>
        <h1>{lesson.title}</h1>
        {(lesson.objective || lesson.description) && <p>{lesson.objective || lesson.description}</p>}
      </header>

      {stage.status === 'locked' && (
        <section class="lesson-empty-state">
          <h2>This Level is locked</h2>
          <p>Verify the previous Level before starting this lesson.</p>
        </section>
      )}
      {stage.status === 'available' && (
        <section class="lesson-empty-state">
          <h2>Start the Level first</h2>
          <p>Return to the Level overview and start it to make this lesson actionable.</p>
          <a class="button primary folio-primary" href={levelHref(threadId, stage.id)}>
            Open Level
          </a>
        </section>
      )}

      {readiness === 'needs_material' && (
        <section class="lesson-empty-state" aria-label="Study material unavailable">
          <h2>No study material attached</h2>
          <p>This lesson is not ready yet. Add authored lesson content or attach a verified source before completing it.</p>
        </section>
      )}

      {(lesson.why_learn || lesson.why_now || lesson.takeaway) && (
        <details class="lesson-learning-contract" aria-labelledby="lesson-learning-contract-title">
          <summary class="lesson-contract-summary">
            <div>
              <p class="folio-object-kicker">Learning Contract</p>
              <h2 id="lesson-learning-contract-title">What this lesson changes</h2>
            </div>
          </summary>
          <dl>
            {lesson.why_learn && (
              <div>
                <dt>Why it matters</dt>
                <dd>{lesson.why_learn}</dd>
              </div>
            )}
            {lesson.why_now && (
              <div>
                <dt>Why now</dt>
                <dd>{lesson.why_now}</dd>
              </div>
            )}
            {lesson.takeaway && (
              <div>
                <dt>Key Takeaway</dt>
                <dd>{lesson.takeaway}</dd>
              </div>
            )}
          </dl>
        </details>
      )}

      {lesson.content && <LessonContent content={lesson.content} />}

      {lesson.sources?.length ? <SourceSection sources={lesson.sources} /> : null}

      <details class="course-level-materials is-lesson-tools">
        <summary>
          <span>
            <span class="folio-object-kicker">Learning tools</span>
            <strong>Capture for this Lesson</strong>
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
          {!canComplete && (
            <p class="course-lesson-completion-note">
              {!canStudy
                ? 'Start this Level before updating the lesson.'
                : 'Completion unlocks when study material is attached.'}
            </p>
          )}
          {lesson.status === 'not_started' && canStudy && canComplete ? (
            <button class="button primary folio-primary" type="button" onClick={startLesson} disabled={saving}>
              Start lesson
            </button>
          ) : (
            <button
              class={`button ${isCompleted ? 'secondary course-lesson-completed-btn' : 'primary folio-primary'}`}
              type="button"
              onClick={toggleComplete}
              disabled={saving || !canComplete}
            >
              <Icon name="check" size={15} />
              <span>{saving ? 'Updating…' : isCompleted ? 'Completed ✓ · Reopen lesson' : 'Mark lesson complete'}</span>
            </button>
          )}
          {error && <p class="learning-material-error" role="alert">{error}</p>}
        </div>
      </footer>
    </article>
  )
}

function LessonContent({ content }: { content: string }) {
  const blocks = parseNoteBlocks(content)
  return (
    <details class="lesson-content">
      <summary class="lesson-content-summary">
        <div>
          <p class="folio-object-kicker">Lesson Notes</p>
          <h3>Authored guide & examples</h3>
        </div>
      </summary>
      <div class="lesson-content-body">
        {blocks.map((block, index) =>
          block.kind === 'heading' ? (
            block.level === 2 ? (
              <h3 dir={block.direction} key={index}>
                {block.text}
              </h3>
            ) : (
              <h4 dir={block.direction} key={index}>
                {block.text}
              </h4>
            )
          ) : block.kind === 'quote' ? (
            <blockquote dir={block.direction} key={index}>
              {block.text}
            </blockquote>
          ) : block.kind === 'list' ? (
            block.ordered ? (
              <ol start={block.start} dir={block.direction} key={index}>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            ) : (
              <ul dir={block.direction} key={index}>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )
          ) : (
            <p dir={block.direction} key={index}>
              {block.text}
            </p>
          )
        )}
      </div>
    </details>
  )
}

function SourceSection({ sources, title = 'For this lesson' }: { sources: PathSource[]; title?: string }) {
  return (
    <section class="course-sources">
      <div class="folio-section-head">
        <div>
          <p class="folio-object-kicker">Study Material</p>
          <h3>{title}</h3>
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
                  {source.branch_id && (
                    <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(source.branch_id)}`}>
                      <span class="badge-format">Branch</span>
                      <span>{source.branch_label || source.branch_id}</span>
                      {source.round_label && <span class="badge-round">{source.round_label}</span>}
                    </a>
                  )}
                </div>
                <strong class="course-source-title">{source.video_title || 'Untitled source'}</strong>
                {source.expected_contribution && (
                  <p class="course-source-rationale">{source.expected_contribution}</p>
                )}
              </div>
              <SourceMaterialLauncher source={source} />
            </li>
          ))}
        </ul>
      ) : (
        <p class="folio-empty-line">Hermes has not curated material for this lesson yet.</p>
      )}
    </section>
  )
}

const materialIcon = (kind: SourceMaterialKind) =>
  kind === 'original' ? 'external' : kind === 'html' ? 'source' : kind === 'pdf' ? 'file' : 'spark'

function MaterialDetails({ material }: { material: SourceMaterialOption }) {
  if (!material.details.length) return null
  return (
    <span class="course-material-details" aria-label={`Material details: ${material.details.join(', ')}`}>
      {material.details.map((detail) => (
        <span key={detail}>{detail}</span>
      ))}
    </span>
  )
}

function SourceMaterialLauncher({ source }: { source: PathSource }) {
  const launcher = buildSourceMaterialLauncher(source)
  if (!launcher) return <p class="course-material-unavailable">This source is attached, but it has no openable material yet.</p>
  const { primary, alternatives, explicitlyRecommended } = launcher

  return (
    <div class="course-material-launcher" aria-label={`Ways to study ${source.video_title || 'this source'}`}>
      <a
        class={`course-material-primary material-${primary.kind}`}
        href={primary.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`${explicitlyRecommended ? 'Open recommended material' : 'Start here'}: ${primary.label}. ${primary.purpose} Opens in a new tab.`}
      >
        <span class="course-material-primary-icon" aria-hidden="true">
          <Icon name={materialIcon(primary.kind)} size={18} />
        </span>
        <span class="course-material-primary-copy">
          <span class="course-material-primary-kicker">
            {explicitlyRecommended ? 'Recommended start' : 'Start here'} · {primary.availability}
          </span>
          <strong>{primary.label}</strong>
          <small>{primary.purpose}</small>
          <MaterialDetails material={primary} />
        </span>
        <span class="course-material-primary-format" aria-hidden="true">
          {primary.format}
        </span>
      </a>
      {alternatives.length > 0 && (
        <div class="course-material-alternatives">
          <p>Also available</p>
          <div class="course-material-option-list">
            {alternatives.map((material) => (
              <a
                class={`course-material-option material-${material.kind}`}
                href={material.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${material.label}. ${material.purpose} ${material.availability}. Opens in a new tab.`}
                key={material.kind}
              >
                <span class="course-material-option-icon" aria-hidden="true">
                  <Icon name={materialIcon(material.kind)} size={15} />
                </span>
                <span class="course-material-option-copy">
                  <span>
                    <strong>{material.format}</strong>
                    <span>{material.label}</span>
                  </span>
                  <small>{material.purpose}</small>
                  <MaterialDetails material={material} />
                </span>
                <span class="course-material-option-state">
                  {material.availability}
                  <Icon name="chevron" size={12} />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
