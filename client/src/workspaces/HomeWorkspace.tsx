import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../api'
import { useData } from '../app/useData'
import { ErrorState, Empty, Loading } from '../components/States'
import { Icon, type IconName } from '../components/Icon'
import { objectHref as canonicalObjectHref, routeHref } from '../app/router'
import { sourceCreator, sourceFormat, sourceLink, sourceTitle, type LibraryRecord } from './library/types'
import { lessonHref, lessonReadiness } from './learn/helpers'
import {
  buildSourceMaterialLauncher,
  type SourceMaterialKind,
  type SourceMaterialOption,
} from './learn/sourceMaterials'
import type { PathRecord, PathSource, PathStage, ThreadLesson } from './learn/types'

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

type HomeThread = PathRecord & {
  current_stage?: (PathStage & { lessons: ThreadLesson[] }) | null
}

type LessonCompletionState = {
  lessonId: string
  phase: 'saving' | 'finished'
}

type ResurfacingItem = {
  recommendation_id: string
  title: string
  creator?: string | null
  content_type?: string | null
  source_url?: string | null
  due_at: string
  starred: boolean
  branch: { id: string; label: string }
  domain: { id: string; label: string }
  companions: { html?: { id: string } | null; pdf?: { id: string } | null }
  presentation?: { id: string; action?: string | null } | null
}

const MATERIAL_ICONS: Record<SourceMaterialKind, IconName> = {
  original: 'external',
  html: 'source',
  pdf: 'file',
  notebooklm: 'spark',
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

function MaterialLink({ option }: { option: SourceMaterialOption }) {
  const shortLabel = option.kind === 'notebooklm' ? 'NBLM' : option.format
  return (
    <a
      class={`continuum-material-link kind-${option.kind}`}
      href={option.href}
      target="_blank"
      rel="noreferrer"
      title={`${option.label} · ${option.availability}`}
      aria-label={`${option.label} (${option.availability})`}
    >
      <Icon name={MATERIAL_ICONS[option.kind]} size={14} />
      <span>{shortLabel}</span>
    </a>
  )
}

function MaterialDock({
  source,
  label = 'Available lesson materials',
}: {
  source?: PathSource | null
  label?: string
}) {
  const launcher = source ? buildSourceMaterialLauncher(source) : null
  if (!launcher) return null
  const materials = [launcher.primary, ...launcher.alternatives]
  return (
    <div class="continuum-material-dock" aria-label={label}>
      {materials.map((option) => (
        <MaterialLink key={`${option.kind}-${option.href}`} option={option} />
      ))}
    </div>
  )
}

export function HomeWorkspace({ onCapture, onInspect, onNavigate }: HomeWorkspaceProps) {
  const { data, error, loading, reload } = useData<LibraryRecord>('/dashboard/briefing')
  const { data: feedsData } = useData<{ feeds?: LibraryRecord[] }>('/capture/feeds')
  const { data: resurfacingData, reload: reloadResurfacing } = useData<{ item?: ResurfacingItem | null }>(
    '/brain/resurfacing?limit=5',
  )
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [resurfacingItem, setResurfacingItem] = useState<ResurfacingItem | null>(null)
  const [resurfacingBusy, setResurfacingBusy] = useState('')
  const [lessonCompletion, setLessonCompletion] = useState<LessonCompletionState | null>(null)
  const [lessonCompletionError, setLessonCompletionError] = useState<{ lessonId: string; message: string } | null>(null)
  const lessonRefreshTimer = useRef<number | null>(null)

  useEffect(() => {
    setResurfacingItem(resurfacingData?.item || null)
  }, [resurfacingData?.item])
  useEffect(
    () => () => {
      if (lessonRefreshTimer.current !== null) window.clearTimeout(lessonRefreshTimer.current)
    },
    [],
  )
  useEffect(() => {
    const item = resurfacingData?.item
    if (!item || item.presentation) return
    let live = true
    api<{ presentation: { id: string; action?: string | null } }>('/brain/resurfacing/presentations', {
      method: 'POST',
      body: JSON.stringify({ recommendation_id: item.recommendation_id }),
    })
      .then((result) => {
        if (live)
          setResurfacingItem((current) =>
            current?.recommendation_id === item.recommendation_id
              ? { ...current, presentation: result.presentation }
              : current,
          )
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [resurfacingData?.item])

  const setResurfacingStar = async () => {
    if (!resurfacingItem || resurfacingBusy) return
    setResurfacingBusy('star')
    try {
      const starred = !resurfacingItem.starred
      await api(`/brain/resurfacing/${encodeURIComponent(resurfacingItem.recommendation_id)}/preference`, {
        method: 'PATCH',
        body: JSON.stringify({ starred }),
      })
      setResurfacingItem({ ...resurfacingItem, starred })
    } finally {
      setResurfacingBusy('')
    }
  }

  const actOnResurfacing = async (action: 'reviewed' | 'snooze' | 'dismissed') => {
    const eventId = resurfacingItem?.presentation?.id
    if (!eventId || resurfacingBusy) return
    setResurfacingBusy(action)
    try {
      await api(`/brain/resurfacing/${encodeURIComponent(eventId)}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      setResurfacingItem(null)
      reloadResurfacing()
    } finally {
      setResurfacingBusy('')
    }
  }

  const briefing = data || {}
  const threads = useMemo(
    () =>
      (Array.isArray(briefing.active_threads)
        ? briefing.active_threads
        : briefing.active_thread
          ? [briefing.active_thread]
          : []) as HomeThread[],
    [briefing.active_threads, briefing.active_thread],
  )

  useEffect(() => {
    if (!lessonCompletion || lessonCompletion.phase !== 'finished') return
    const remainsCurrent = threads.some(
      (thread) => thread.current_stage?.lessons?.[0]?.id === lessonCompletion.lessonId,
    )
    if (!remainsCurrent) setLessonCompletion(null)
  }, [threads, lessonCompletion])

  if (loading) return <Loading label="Loading Home" />
  if (error) return <ErrorState message={error} retry={reload} />

  const items = Array.isArray(briefing.active_items) ? briefing.active_items : []
  const activeSource =
    (selectedSourceId ? items.find((item: LibraryRecord) => String(item.id) === String(selectedSourceId)) : null) ||
    items.find((item: LibraryRecord) => item.learning_state === 'in_progress') ||
    items[0]
  const feeds = Array.isArray(feedsData?.feeds) ? feedsData.feeds : []
  const files = activeSource
    ? (briefing.artifacts || []).filter(
        (file: LibraryRecord) => String(file.recommendation_id) === String(activeSource.id),
      )
    : []
  const htmlFile =
    activeSource?.artifacts?.html ||
    files.find(
      (file: LibraryRecord) =>
        String(file.role || '').toLowerCase() === 'html' ||
        /html/i.test(String(file.media_type || file.filename || '')),
    )
  const pdfFile =
    activeSource?.artifacts?.pdf ||
    files.find(
      (file: LibraryRecord) =>
        String(file.role || '').toLowerCase() === 'pdf' || /pdf/i.test(String(file.media_type || file.filename || '')),
    )
  const otherFiles = files.filter((file: LibraryRecord) => file.id !== htmlFile?.id && file.id !== pdfFile?.id)
  const notebookUrl =
    activeSource?.notebook_url ||
    activeSource?.metadata?.notebook_url ||
    files.find((file: LibraryRecord) => file.notebook_url || file.metadata?.notebook_url)?.notebook_url ||
    files.find((file: LibraryRecord) => file.metadata?.notebook_url)?.metadata?.notebook_url ||
    null
  const activeMaterialSource: PathSource | null = activeSource
    ? {
        recommendation_id: String(activeSource.id),
        content_type: sourceFormat(activeSource),
        video_url: sourceLink(activeSource),
        notebook_url: notebookUrl,
        artifacts: { ...(htmlFile ? { html: htmlFile } : {}), ...(pdfFile ? { pdf: pdfFile } : {}) },
      }
    : null
  const readyLessons = threads.filter((thread) => thread.current_stage?.lessons?.[0]).length

  const openSource = () => {
    if (!activeSource) return
    const isBook = activeSource.content_type === 'book' || activeSource.is_book_chapter
    const selection: HomeSelection = {
      type: 'source',
      id: String(activeSource.id),
      title: sourceTitle(activeSource),
      data: activeSource,
      route: isBook
        ? canonicalObjectHref('library', 'book', String(activeSource.book_id || activeSource.id), 'books')
        : canonicalObjectHref('library', 'source', String(activeSource.id)),
    }
    onInspect?.(selection)
  }

  const finishLesson = async (threadId: string, lesson: ThreadLesson) => {
    if (lessonCompletion) return
    if (lessonRefreshTimer.current !== null) window.clearTimeout(lessonRefreshTimer.current)
    setLessonCompletionError(null)
    setLessonCompletion({ lessonId: lesson.id, phase: 'saving' })
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      })
      setLessonCompletion({ lessonId: lesson.id, phase: 'finished' })
      lessonRefreshTimer.current = window.setTimeout(() => {
        lessonRefreshTimer.current = null
        reload()
      }, 520)
    } catch (reason) {
      setLessonCompletion(null)
      setLessonCompletionError({
        lessonId: lesson.id,
        message: reason instanceof Error ? reason.message : 'Lesson completion failed.',
      })
    }
  }

  return (
    <div class="folio-home-workspace continuum-home">
      <header class="folio-home-header continuum-home-header">
        <div>
          <p class="folio-kicker">Your learning desk</p>
          <h1>Today</h1>
        </div>
        <div class="continuum-home-status" aria-label="Today’s study state">
          <span>
            <i class="continuum-live-dot" />
            {readyLessons || 0} {readyLessons === 1 ? 'turn' : 'turns'} ready
          </span>
          <small>{items.length ? `${items.length} in Queue` : 'Queue is clear'}</small>
        </div>
      </header>

      <div class="folio-home-spread continuum-home-spread">
        <main class="folio-home-main continuum-home-main">
          {resurfacingItem && (
            <section class="folio-home-resurfacing" aria-labelledby="home-resurfacing-title">
              <div class="folio-section-heading">
                <div>
                  <p class="folio-kicker">Worth remembering</p>
                  <h2 id="home-resurfacing-title">Daily resurfacing</h2>
                </div>
                <button
                  type="button"
                  class={`folio-button folio-resurfacing-star${resurfacingItem.starred ? ' is-starred' : ''}`}
                  onClick={setResurfacingStar}
                  disabled={Boolean(resurfacingBusy)}
                  aria-pressed={resurfacingItem.starred}
                  title="Prioritize this source in resurfacing"
                >
                  {resurfacingItem.starred ? 'Starred' : 'Star'}
                </button>
              </div>
              <article class="folio-resurfacing-card">
                <div class="folio-resurfacing-copy">
                  <a
                    class="folio-badge folio-badge-branch"
                    href={`#/map/branch/${encodeURIComponent(resurfacingItem.branch.id)}`}
                    title="Open branch dossier"
                  >
                    <span class="badge-format">Branch</span>
                    <span>{resurfacingItem.branch.label}</span>
                  </a>
                  <h3>
                    <a
                      class="folio-resurfacing-record-link"
                      href={canonicalObjectHref('library', 'source', resurfacingItem.recommendation_id)}
                      aria-label={`Open source record: ${resurfacingItem.title}`}
                    >
                      {resurfacingItem.title}
                    </a>
                  </h3>
                  <p class="folio-record-meta">
                    {[
                      resurfacingItem.creator,
                      resurfacingItem.content_type ? labelize(resurfacingItem.content_type) : null,
                      `Due ${formatDate(resurfacingItem.due_at)}`,
                      resurfacingItem.domain.label,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div class="folio-resurfacing-links" aria-label="Passive source links">
                    {resurfacingItem.source_url && (
                      <a class="folio-quick-link" href={resurfacingItem.source_url} target="_blank" rel="noreferrer">
                        Original
                      </a>
                    )}
                    {resurfacingItem.companions?.html && (
                      <a
                        class="folio-quick-link"
                        href={`/artifacts/${resurfacingItem.companions.html.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        HTML
                      </a>
                    )}
                    {resurfacingItem.companions?.pdf && (
                      <a
                        class="folio-quick-link"
                        href={`/artifacts/${resurfacingItem.companions.pdf.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
                <div class="folio-resurfacing-actions" aria-label="Resurfacing actions">
                  <button
                    type="button"
                    class="folio-button folio-button-primary"
                    disabled={!resurfacingItem.presentation?.id || Boolean(resurfacingBusy)}
                    onClick={() => actOnResurfacing('reviewed')}
                  >
                    Reviewed
                  </button>
                  <button
                    type="button"
                    class="folio-button"
                    disabled={!resurfacingItem.presentation?.id || Boolean(resurfacingBusy)}
                    onClick={() => actOnResurfacing('snooze')}
                  >
                    Snooze 7 days
                  </button>
                  <button
                    type="button"
                    class="folio-button folio-button-quiet"
                    disabled={!resurfacingItem.presentation?.id || Boolean(resurfacingBusy)}
                    onClick={() => actOnResurfacing('dismissed')}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            </section>
          )}

          <section class="folio-home-threads continuum-turns" aria-labelledby="home-threads-title">
            <div class="folio-section-heading folio-home-threads-heading">
              <div>
                <p class="folio-kicker">Current rotation</p>
                <h2 id="home-threads-title">{threads.length ? 'What comes next' : 'No current Threads'}</h2>
                {threads.length > 0 && <p>One deliberate turn from each active Thread.</p>}
              </div>
              <a
                class="folio-heading-link"
                href={routeHref('learn', 'paths')}
                title="Browse Threads"
                aria-label="Browse Threads"
              >
                <Icon name="learn" size={19} />
              </a>
            </div>
            {threads.length ? (
              <div class="folio-home-thread-list" role="list">
                {threads.map((thread, index) => {
                  const stage = thread.current_stage
                  const lesson = stage?.lessons?.[0]
                  const primarySource =
                    lesson?.sources?.find((source) => source.role === 'primary') || lesson?.sources?.[0]
                  const sourceCue = lesson
                    ? [
                        primarySource?.content_type ? labelize(primarySource.content_type) : null,
                        primarySource?.creator || null,
                        lesson.estimated_minutes ? `~${lesson.estimated_minutes} min` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : ''
                  const location =
                    lesson && stage
                      ? `Level ${stage.position} · Lesson ${String(lesson.position + 1).padStart(2, '0')}`
                      : stage?.title || 'Learning path'
                  const title =
                    lesson?.title || (stage?.status === 'completed' ? 'Level completed' : 'Open learning path')
                  const status =
                    lesson?.status === 'in_progress'
                      ? 'In progress'
                      : stage?.status === 'completed'
                        ? 'Completed'
                        : 'Ready'
                  const href = lesson
                    ? lessonHref(String(thread.id), lesson.id)
                    : `#/learn/thread/${encodeURIComponent(String(thread.id))}`
                  const completionPhase =
                    lesson && lessonCompletion?.lessonId === lesson.id ? lessonCompletion.phase : null
                  const completionError =
                    lesson && lessonCompletionError?.lessonId === lesson.id ? lessonCompletionError.message : ''
                  const canFinish = Boolean(
                    lesson && stage?.status === 'in_progress' && lessonReadiness(lesson) !== 'needs_material',
                  )
                  return (
                    <article
                      key={`${thread.id}:${lesson?.id || 'path'}`}
                      class={`folio-home-thread-lesson continuum-turn${lesson?.status === 'in_progress' ? ' is-active' : ''}${completionPhase === 'saving' ? ' is-finishing' : ''}${completionPhase === 'finished' ? ' is-finished' : ''}`}
                      role="listitem"
                      aria-busy={completionPhase === 'saving' || undefined}
                    >
                      <span class="continuum-turn-number" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <a class="continuum-turn-open" href={href} title={`Open ${thread.title}: ${title}`}>
                        <span class="folio-home-thread-copy">
                          <span class="folio-object-kicker" dir="auto">
                            {thread.title}
                          </span>
                          <strong class="folio-home-thread-lesson-title" dir="auto">
                            {title}
                          </strong>
                          <small>
                            {location}
                            {sourceCue ? ` · ${sourceCue}` : ''}
                          </small>
                        </span>
                        <span class="folio-home-thread-action">
                          <span class={`folio-status-mark${lesson?.status === 'in_progress' ? ' is-in-progress' : ''}`}>
                            {status}
                          </span>
                          <Icon name="chevron" size={15} />
                        </span>
                      </a>
                      {(primarySource || canFinish || completionError) && (
                        <div class="continuum-turn-tools">
                          <MaterialDock source={primarySource} label={`Materials for ${title}`} />
                          {canFinish && (
                            <button
                              type="button"
                              class={`continuum-finish-lesson${completionPhase ? ` is-${completionPhase}` : ''}`}
                              onClick={() => finishLesson(String(thread.id), lesson!)}
                              disabled={Boolean(lessonCompletion)}
                              aria-label={`${completionPhase === 'finished' ? 'Finished' : completionPhase === 'saving' ? 'Finishing lesson' : 'Finish lesson'}: ${title}`}
                              title="Mark this lesson complete and advance the Thread"
                            >
                              <span class="continuum-finish-mark" aria-hidden="true">
                                <Icon name="check" size={13} />
                              </span>
                              <span>
                                {completionPhase === 'finished'
                                  ? 'Completed'
                                  : completionPhase === 'saving'
                                    ? 'Saving…'
                                    : 'Complete'}
                              </span>
                            </button>
                          )}
                          {completionError && (
                            <p class="continuum-turn-error" role="alert">
                              {completionError}
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
              <p class="folio-record-note">Create a Thread before Queue can become a learning commitment.</p>
            )}
          </section>

          <section class="folio-home-feeds continuum-quiet-section" aria-labelledby="home-feeds-title">
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
                <Icon name="rss" size={19} />
              </a>
            </div>
            {feeds.length ? (
              <div class="folio-home-feed-list" role="list" aria-label="Subscribed RSS feeds">
                {feeds.map((feed: LibraryRecord) => (
                  <a
                    class="folio-home-feed-item"
                    href={routeHref('library', 'triage', 'feeds')}
                    role="listitem"
                    key={feed.id}
                  >
                    <span class="folio-home-feed-copy">
                      <strong>{feed.title || feed.feed_url}</strong>
                      <small>
                        {feed.entry_count || 0} {Number(feed.entry_count || 0) === 1 ? 'entry' : 'entries'}
                      </small>
                    </span>
                    <Icon name="chevron" size={15} />
                  </a>
                ))}
              </div>
            ) : (
              <p>No feed subscriptions yet. Add a publication to keep incoming reading in one deliberate stream.</p>
            )}
          </section>
        </main>

        <aside class="folio-home-side continuum-home-side" aria-label="Active Queue context">
          <section class="folio-home-focus continuum-current" aria-labelledby="home-focus-title">
            <div class="folio-home-focus-copy">
              <div class="folio-section-heading">
                <div>
                  <p class="folio-kicker">Current source</p>
                  <h2 id="home-focus-title">{activeSource ? sourceTitle(activeSource) : 'No active source'}</h2>
                </div>
                {activeSource && (
                  <span class="folio-status-mark">
                    {activeSource.learning_state === 'in_progress' ? 'In progress' : 'Queued'}
                  </span>
                )}
              </div>
              {activeSource ? (
                <>
                  <p class="folio-record-meta">
                    {sourceCreator(activeSource)} · {sourceFormat(activeSource)}
                    {activeSource.estimated_minutes ? ` · ~${activeSource.estimated_minutes} min` : ''}
                  </p>
                  <p class="folio-home-rationale">
                    {activeSource.context_brief ||
                      activeSource.why_this ||
                      'The most immediate useful commitment on your shelf.'}
                  </p>
                  <MaterialDock source={activeMaterialSource} label="Current source materials" />
                  {otherFiles.length > 0 && (
                    <div class="continuum-extra-files" aria-label="Other source files">
                      {otherFiles.map((file: LibraryRecord) => (
                        <a
                          href={`/artifacts/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          key={file.id}
                          title={file.filename || sourceFileLabel(file)}
                        >
                          <Icon name="file" size={14} />
                          <span>{sourceFileLabel(file)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <div class="folio-home-actions-bar">
                    <button type="button" class="folio-button" onClick={openSource}>
                      Inspect
                    </button>
                    <a class="folio-button folio-button-primary" href={routeHref('library', 'triage', 'queue')}>
                      Open Queue to start
                    </a>
                  </div>
                  <p class="folio-action-note">
                    Opening from Home is passive. Queue owns the tracked Start/Resume action.
                  </p>
                  <a class="continuum-all-files" href={routeHref('library', 'assets', 'files')}>
                    All files
                  </a>
                </>
              ) : (
                <Empty
                  title="The working shelf is clear"
                  body="Save a source, then commit it to Queue when it earns your attention."
                  action={
                    <button
                      type="button"
                      class="folio-button folio-button-primary"
                      onClick={() =>
                        onCapture ? onCapture() : navigate(routeHref('library', 'catalog', 'all'), onNavigate)
                      }
                    >
                      Save a source
                    </button>
                  }
                />
              )}
            </div>
          </section>

          <section class="folio-home-queue continuum-queue" aria-labelledby="home-queue-title">
            <div class="folio-section-heading">
              <div>
                <p class="folio-kicker">Queue</p>
                <h2 id="home-queue-title">
                  {items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : 'Queue is empty'}
                </h2>
              </div>
              <a
                class="folio-heading-link"
                href={routeHref('library', 'triage', 'queue')}
                title="Open Queue"
                aria-label="Open Queue"
              >
                <Icon name="queue" size={19} />
              </a>
            </div>
            {items.length ? (
              <div class="folio-home-queue-list" role="list">
                {items.map((item: LibraryRecord, index: number) => {
                  const isSelected = activeSource && String(activeSource.id) === String(item.id)
                  return (
                    <button
                      type="button"
                      key={item.id}
                      role="listitem"
                      class={`folio-home-queue-item${isSelected ? ' is-active' : ''}`}
                      onClick={() => setSelectedSourceId(String(item.id))}
                      title="Set as current source"
                    >
                      <span class="continuum-queue-index">{String(index + 1).padStart(2, '0')}</span>
                      <span class="folio-home-queue-item-title">{sourceTitle(item)}</span>
                      {isSelected && <span class="continuum-queue-active">Active</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p class="folio-record-note">Add a source only when it has earned your attention.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
