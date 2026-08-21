import { useState } from 'preact/hooks'
import { formatDate, labelize } from '../api'
import { useData } from '../app/useData'
import { ErrorState, Empty, Loading } from '../components/States'
import { Icon } from '../components/Icon'
import { objectHref as canonicalObjectHref, routeHref } from '../app/router'
import { sourceCreator, sourceFormat, sourceLink, sourceTitle, type LibraryRecord } from './library/types'
import { lessonHref } from './learn/helpers'
import type { PathResponse, PathStage, ThreadLesson } from './learn/types'

export type HomeSelection = {
  type: 'source' | 'thread'
  id: string
  title: string
  data: LibraryRecord
  route: string
}

export type HomeWorkspaceProps = {
  onCapture?: () => void
  onInspect?: (selection: HomeSelection) => void
  onNavigate?: (href: string) => void
}

function navigate(href: string, onNavigate?: (href: string) => void) {
  onNavigate?.(href)
  if (!onNavigate) location.hash = href.slice(1)
}

function sourceFileLabel(file: LibraryRecord) {
  const role = String(file.role || '').toLowerCase()
  if (role) return role === 'html' ? 'HTML companion' : role === 'pdf' ? 'PDF companion' : labelize(role)
  if (/pdf/i.test(String(file.media_type || file.filename || ''))) return 'PDF'
  if (/html/i.test(String(file.media_type || file.filename || ''))) return 'HTML'
  return 'File'
}

export function HomeWorkspace({ onCapture, onInspect, onNavigate }: HomeWorkspaceProps) {
  const { data, error, loading, reload } = useData<LibraryRecord>('/dashboard/briefing')
  const { data: feedsData } = useData<{ feeds?: LibraryRecord[] }>('/capture/feeds')
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)

  if (loading) return <Loading label="Loading Home"/>
  if (error) return <ErrorState message={error} retry={reload}/>
  const briefing = data || {}
  const items = Array.isArray(briefing.active_items) ? briefing.active_items : []
  const activeSource = (selectedSourceId ? items.find((item: LibraryRecord) => String(item.id) === String(selectedSourceId)) : null)
    || items.find((item: LibraryRecord) => item.learning_state === 'in_progress')
    || items[0]
  const thread = briefing.active_thread
  const threadId = thread?.id ? String(thread.id) : null
  const { data: threadPath } = useData<PathResponse>(threadId ? `/learning/core/threads/${encodeURIComponent(threadId)}/path` : undefined)

  const stages = threadPath?.stages || []
  let activeLessonWithStage: { stage: PathStage; lesson: ThreadLesson } | null = null

  for (const stage of stages) {
    const inProg = stage.lessons?.find((l) => l.status === 'in_progress')
    if (inProg) {
      activeLessonWithStage = { stage, lesson: inProg }
      break
    }
  }

  if (!activeLessonWithStage && stages.length > 0) {
    const currentStage = threadPath?.current_stage || stages.find((s) => ['available', 'in_progress', 'ready_to_verify'].includes(s.status)) || stages[0]
    const nextLesson = currentStage?.lessons?.find((l) => l.status !== 'completed') || currentStage?.lessons?.[0]
    if (nextLesson && currentStage) {
      activeLessonWithStage = { stage: currentStage, lesson: nextLesson }
    }
  }

  const activeLesson = activeLessonWithStage?.lesson
  const activeLessonStage = activeLessonWithStage?.stage
  const totalStages = stages.length || Number(thread?.stage_count || 0)
  const allLessons = stages.flatMap((s) => s.lessons || [])
  const totalLessons = allLessons.length || Number(thread?.lesson_count || 0)
  const completedLessons = allLessons.length
    ? allLessons.filter((l) => l.status === 'completed').length
    : Number(thread?.completed_lesson_count || 0)
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const stageLabel = activeLessonStage
    ? (activeLessonStage.title && new RegExp(`^level\\s*${activeLessonStage.position}\\b`, 'i').test(activeLessonStage.title)
        ? activeLessonStage.title
        : `Level ${activeLessonStage.position}${activeLessonStage.title ? ` · ${activeLessonStage.title}` : ''}`)
    : `${totalStages} Level${totalStages === 1 ? '' : 's'}`

  const activeLessonSources = activeLesson?.sources || []
  const activePrimarySource = activeLessonSources.find((s) => s.role === 'primary') || activeLessonSources[0]
  const activeSourceCue = [
    activePrimarySource?.content_type ? labelize(activePrimarySource.content_type) : null,
    activePrimarySource?.creator || null,
    activeLesson?.estimated_minutes ? `~${activeLesson.estimated_minutes} min` : null,
  ].filter(Boolean).join(' · ')

  const activeLessonHref = activeLesson ? lessonHref(String(thread.id), activeLesson.id) : '#'
  const stageLessons = activeLessonStage?.lessons || []
  const activeLessonIndex = activeLesson ? stageLessons.findIndex((l) => l.id === activeLesson.id) : 0
  const visibleLessons = stageLessons.length > 0
    ? stageLessons.slice(Math.max(0, activeLessonIndex), Math.max(0, activeLessonIndex) + 3)
    : activeLesson ? [activeLesson] : []

  const feeds = Array.isArray(feedsData?.feeds) ? feedsData.feeds : []
  const hermesBrief = briefing.hermes_brief || { next_action: briefing.next_action_detail, blockers: {}, counts: {} }
  const nextAction = hermesBrief.next_action || briefing.next_action_detail
  const files = activeSource ? (briefing.artifacts || []).filter((file: LibraryRecord) => String(file.recommendation_id) === String(activeSource.id)) : []
  const htmlFile = files.find((f: LibraryRecord) => String(f.role || '').toLowerCase() === 'html' || /html/i.test(String(f.media_type || f.filename || '')))
  const pdfFile = files.find((f: LibraryRecord) => String(f.role || '').toLowerCase() === 'pdf' || /pdf/i.test(String(f.media_type || f.filename || '')))
  const otherFiles = files.filter((f: LibraryRecord) => f.id !== htmlFile?.id && f.id !== pdfFile?.id)
  const notebookUrl = activeSource?.notebook_url
    || activeSource?.metadata?.notebook_url
    || files.find((file: LibraryRecord) => file.notebook_url || file.metadata?.notebook_url)?.notebook_url
    || files.find((file: LibraryRecord) => file.metadata?.notebook_url)?.metadata?.notebook_url
    || null
  const openSource = () => {
    if (!activeSource) return
    const selection: HomeSelection = { type: 'source', id: String(activeSource.id), title: sourceTitle(activeSource), data: activeSource, route: canonicalObjectHref('library', 'source', String(activeSource.id)) }
    onInspect?.(selection)
  }

  return <div class="folio-home-workspace">
    <header class="folio-home-header">
      <h1>Home</h1>
      <button type="button" class="folio-button folio-button-primary" onClick={() => onCapture ? onCapture() : navigate(routeHref('library', 'catalog', 'all'), onNavigate)}>
        <Icon name="capture" size={16}/>
        Quick capture
      </button>
    </header>

    {nextAction && <section class="folio-hermes-brief" aria-labelledby="hermes-brief-title">
      <div class="folio-hermes-brief-copy">
        <p class="folio-kicker">Hermes brief</p>
        <h2 id="hermes-brief-title">{nextAction.label}</h2>
        <p>{nextAction.reason}</p>
        {hermesBrief.blockers && (Number(hermesBrief.blockers.pending_proposals || 0) > 0 || Number(hermesBrief.blockers.active_jobs || 0) > 0) && <small class="folio-hermes-brief-meta">
          {Number(hermesBrief.blockers.pending_proposals || 0) > 0 ? `${hermesBrief.blockers.pending_proposals} proposal${Number(hermesBrief.blockers.pending_proposals) === 1 ? '' : 's'} waiting` : ''}
          {Number(hermesBrief.blockers.pending_proposals || 0) > 0 && Number(hermesBrief.blockers.active_jobs || 0) > 0 ? ' · ' : ''}
          {Number(hermesBrief.blockers.active_jobs || 0) > 0 ? `${hermesBrief.blockers.active_jobs} active job${Number(hermesBrief.blockers.active_jobs) === 1 ? '' : 's'}` : ''}
        </small>}
      </div>
      <a class="folio-button folio-button-primary" href={nextAction.href || routeHref('home', 'today')}>Open next action</a>
    </section>}

    <section class="folio-home-focus" aria-labelledby="home-focus-title">
      <div class="folio-home-focus-copy">
        <div class="folio-section-heading">
          <div>
            <p class="folio-kicker">Current source</p>
            <h2 id="home-focus-title">{activeSource ? sourceTitle(activeSource) : 'No active source'}</h2>
          </div>
          {activeSource && <span class="folio-status-mark">{activeSource.learning_state === 'in_progress' ? 'In progress' : 'Queued'}</span>}
        </div>
        {activeSource ? <>
          <p class="folio-record-meta">{sourceCreator(activeSource)} · {activeSource.content_type || 'Source'}{activeSource.estimated_minutes ? ` · ~${activeSource.estimated_minutes} min` : ''}</p>
          <p class="folio-home-rationale">{activeSource.context_brief || activeSource.why_this || 'This source is next because it is the most immediate useful commitment on your shelf.'}</p>
          <div class="folio-home-actions-bar">
            <div class="folio-row-actions">
              <button type="button" class="folio-button" onClick={openSource}>Inspect source</button>
              <a class="folio-button folio-button-primary" href={routeHref('library', 'triage', 'queue')}>Open Queue to start</a>
            </div>
            <div class="folio-quick-links" aria-label="Source links and companions">
              {activeSource.video_url && (
                <a class="folio-quick-link" href={activeSource.video_url} target="_blank" rel="noreferrer" title="Open original source">
                  <Icon name="external" size={14}/>
                  <span>Original</span>
                </a>
              )}
              {pdfFile && (
                <a class="folio-quick-link" href={`/artifacts/${pdfFile.id}`} target="_blank" rel="noreferrer" title="Open PDF companion">
                  <Icon name="file" size={14}/>
                  <span>PDF</span>
                </a>
              )}
              {htmlFile && (
                <a class="folio-quick-link" href={`/artifacts/${htmlFile.id}`} target="_blank" rel="noreferrer" title="Open HTML companion">
                  <Icon name="source" size={14}/>
                  <span>HTML</span>
                </a>
              )}
              {otherFiles.map((file: LibraryRecord) => (
                <a class="folio-quick-link" href={`/artifacts/${file.id}`} target="_blank" rel="noreferrer" key={file.id} title={file.filename || sourceFileLabel(file)}>
                  <Icon name="file" size={14}/>
                  <span>{sourceFileLabel(file)}</span>
                </a>
              ))}
              {notebookUrl && (
                <a class="folio-quick-link" href={notebookUrl} target="_blank" rel="noreferrer" title="Open Google NotebookLM">
                  <Icon name="spark" size={14}/>
                  <span>NBLM</span>
                </a>
              )}
              <a class="folio-quick-link folio-quick-link-all" href={routeHref('library', 'assets', 'files')}>All files</a>
            </div>
          </div>
          <p class="folio-action-note">Opening from Home is passive. Queue owns the tracked Start/Resume action.</p>
        </> : <Empty title="The working shelf is clear" body="Save a source, open its record, and commit it to Queue when it earns your attention." action={<button type="button" class="folio-button folio-button-primary" onClick={() => onCapture ? onCapture() : navigate(routeHref('library', 'catalog', 'all'), onNavigate)}>Save a source</button>}/>}
      </div>
    </section>

    <div class="folio-home-sequence">
      <section class="folio-home-thread" aria-labelledby="home-thread-title">
        <div class="folio-section-heading">
          <div>
            <p class="folio-kicker">Active Thread</p>
            <h2 id="home-thread-title">{thread?.title || 'No active Thread'}</h2>
          </div>
          <a
            class="folio-heading-link"
            href={thread ? `#/learn/thread/${encodeURIComponent(String(thread.id))}` : routeHref('learn', 'paths')}
            title={thread ? 'Open Thread' : 'Browse Threads'}
            aria-label={thread ? 'Open Thread' : 'Browse Threads'}
          >
            <Icon name="learn" size={21}/>
          </a>
        </div>
        {thread ? (
          <>
            {totalLessons > 0 && (
              <div class="folio-home-thread-progress" aria-label={`Thread progress: ${completedLessons} of ${totalLessons} lessons completed (${progressPct}%)`}>
                <div class="folio-home-thread-progress-meta">
                  <span>{stageLabel}</span>
                  <span>{completedLessons}/{totalLessons} lessons ({progressPct}%)</span>
                </div>
                <div class="folio-home-thread-progress-track">
                  <div class="folio-home-thread-progress-fill" style={{ width: `${progressPct}%` }}/>
                </div>
              </div>
            )}
            {visibleLessons.length > 0 && activeLessonStage ? (
              <div class="folio-home-thread-lesson-list" role="list">
                {visibleLessons.map((lesson) => {
                  const lessonSources = lesson.sources || []
                  const primarySource = lessonSources.find((s) => s.role === 'primary') || lessonSources[0]
                  const sourceCue = [
                    primarySource?.content_type ? labelize(primarySource.content_type) : null,
                    primarySource?.creator || null,
                    lesson.estimated_minutes ? `~${lesson.estimated_minutes} min` : null,
                  ].filter(Boolean).join(' · ')
                  const isCurrent = activeLesson && lesson.id === activeLesson.id

                  return (
                    <a
                      key={lesson.id}
                      class={`folio-home-thread-lesson${isCurrent ? ' is-active' : ''}`}
                      href={isCurrent ? activeLessonHref : lessonHref(String(thread.id), lesson.id)}
                      title={`Open Level ${activeLessonStage.position} · Lesson ${String(lesson.position + 1).padStart(2, '0')}: ${lesson.title}`}
                      role="listitem"
                    >
                      <div class="folio-home-thread-copy">
                        <span class="folio-object-kicker">
                          Level {activeLessonStage.position} · Lesson {String(lesson.position + 1).padStart(2, '0')}
                        </span>
                        <strong class="folio-home-thread-lesson-title">{lesson.title}</strong>
                        {sourceCue && <small>{sourceCue}</small>}
                      </div>
                      <div class="folio-home-thread-action">
                        <span class={`folio-status-mark${lesson.status === 'in_progress' ? ' is-in-progress' : lesson.status === 'completed' ? ' is-completed' : ''}`}>
                          {lesson.status === 'in_progress' ? 'In progress' : lesson.status === 'completed' ? 'Completed' : 'Ready'}
                        </span>
                        <Icon name="chevron" size={15}/>
                      </div>
                    </a>
                  )
                })}
              </div>
            ) : (
              <a
                class="folio-home-thread-lesson"
                href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`}
                title="Open Thread"
              >
                <div class="folio-home-thread-copy">
                  <strong class="folio-home-thread-lesson-title">Open learning path</strong>
                </div>
                <Icon name="chevron" size={15}/>
              </a>
            )}
          </>
        ) : (
          <p class="folio-record-note">Create a Thread before Queue can become a learning commitment.</p>
        )}
      </section>

      <section class="folio-home-queue" aria-labelledby="home-queue-title">
        <div class="folio-section-heading">
          <div>
            <p class="folio-kicker">Queue</p>
            <h2 id="home-queue-title">{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} in queue` : 'Queue is empty'}</h2>
          </div>
          <a
            class="folio-heading-link"
            href={routeHref('library', 'triage', 'queue')}
            title="Open Queue"
            aria-label="Open Queue"
          >
            <Icon name="queue" size={21}/>
          </a>
        </div>
        {items.length ? (
          <div class="folio-home-queue-list" role="list">
            {items.map((item: LibraryRecord) => {
              const isSelected = activeSource && String(activeSource.id) === String(item.id)
              return (
                <button
                  type="button"
                  key={item.id}
                  role="listitem"
                  class={`folio-home-queue-item${isSelected ? ' is-active' : ''}`}
                  onClick={() => setSelectedSourceId(String(item.id))}
                  title="Click to set as current source"
                >
                  <span class="folio-home-queue-item-title">{sourceTitle(item)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p class="folio-record-note">Queue is empty. Save a source, then commit it from All sources when it earns your attention.</p>
        )}
      </section>

      <section class="folio-home-feeds" aria-labelledby="home-feeds-title">
        <div class="folio-section-heading">
          <div>
            <p class="folio-kicker">Incoming publications</p>
            <h2 id="home-feeds-title">RSS Feeds</h2>
          </div>
          <a
            class="folio-heading-link"
            href={routeHref('library', 'triage', 'feeds')}
            title="Open Feeds"
            aria-label="Open Feeds"
          >
            <Icon name="rss" size={21}/>
          </a>
        </div>
        {feeds.length ? (
          <div class="folio-home-feed-list" role="list" aria-label="Subscribed RSS feeds">
            {feeds.map((feed: LibraryRecord) => (
              <a class="folio-home-feed-item" href={routeHref('library', 'triage', 'feeds')} role="listitem" key={feed.id}>
                <span class="folio-home-feed-copy">
                  <strong>{feed.title || feed.feed_url}</strong>
                  <small>{feed.entry_count || 0} {Number(feed.entry_count || 0) === 1 ? 'entry' : 'entries'}</small>
                </span>
                <Icon name="chevron" size={15}/>
              </a>
            ))}
          </div>
        ) : (
          <p>No feed subscriptions yet. Add a publication to keep incoming reading in one deliberate stream.</p>
        )}
      </section>
    </div>

      <section class="folio-home-capture-signal" aria-label="Capture signal"><div><p class="folio-kicker">Capture signal</p><h2>Feeds & Subscriptions</h2><p>Manage RSS feeds and imported articles directly in Library.</p></div><div class="folio-row-actions"><button type="button" class="folio-button folio-button-primary" onClick={() => onCapture ? onCapture() : navigate(routeHref('library', 'catalog', 'all'), onNavigate)}><Icon name="capture" size={16}/>Save source</button><a class="folio-button" href={routeHref('library', 'triage', 'feeds')}>Open Feeds</a></div></section>
  </div>
}
