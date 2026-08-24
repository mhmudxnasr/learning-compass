import { useEffect, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../api'
import { useData } from '../app/useData'
import { ErrorState, Empty, Loading } from '../components/States'
import { Icon } from '../components/Icon'
import { objectHref as canonicalObjectHref, routeHref } from '../app/router'
import { sourceCreator, sourceFormat, sourceLink, sourceTitle, type LibraryRecord } from './library/types'
import { lessonHref } from './learn/helpers'
import type { PathRecord, PathStage, ThreadLesson } from './learn/types'

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
  const { data: resurfacingData, reload: reloadResurfacing } = useData<{ item?: ResurfacingItem | null }>('/brain/resurfacing?limit=5')
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [resurfacingItem, setResurfacingItem] = useState<ResurfacingItem | null>(null)
  const [resurfacingBusy, setResurfacingBusy] = useState('')

  useEffect(() => { setResurfacingItem(resurfacingData?.item || null) }, [resurfacingData?.item])
  useEffect(() => {
    const item = resurfacingData?.item
    if (!item || item.presentation) return
    let live = true
    api<{ presentation: { id: string; action?: string | null } }>('/brain/resurfacing/presentations', {
      method: 'POST', body: JSON.stringify({ recommendation_id: item.recommendation_id }),
    }).then((result) => {
      if (live) setResurfacingItem((current) => current?.recommendation_id === item.recommendation_id ? { ...current, presentation: result.presentation } : current)
    }).catch(() => undefined)
    return () => { live = false }
  }, [resurfacingData?.item?.recommendation_id, resurfacingData?.item?.presentation?.id])

  const setResurfacingStar = async () => {
    if (!resurfacingItem || resurfacingBusy) return
    setResurfacingBusy('star')
    try {
      const starred = !resurfacingItem.starred
      await api(`/brain/resurfacing/${encodeURIComponent(resurfacingItem.recommendation_id)}/preference`, { method: 'PATCH', body: JSON.stringify({ starred }) })
      setResurfacingItem({ ...resurfacingItem, starred })
    } finally { setResurfacingBusy('') }
  }

  const actOnResurfacing = async (action: 'reviewed' | 'snooze' | 'dismissed') => {
    const eventId = resurfacingItem?.presentation?.id
    if (!eventId || resurfacingBusy) return
    setResurfacingBusy(action)
    try {
      await api(`/brain/resurfacing/${encodeURIComponent(eventId)}/action`, { method: 'POST', body: JSON.stringify({ action }) })
      setResurfacingItem(null)
      reloadResurfacing()
    } finally { setResurfacingBusy('') }
  }

  const briefing = data || {}
  const threads = (Array.isArray(briefing.active_threads) ? briefing.active_threads : briefing.active_thread ? [briefing.active_thread] : []) as HomeThread[]

  if (loading) return <Loading label="Loading Home"/>
  if (error) return <ErrorState message={error} retry={reload}/>
  const items = Array.isArray(briefing.active_items) ? briefing.active_items : []
  const activeSource = (selectedSourceId ? items.find((item: LibraryRecord) => String(item.id) === String(selectedSourceId)) : null)
    || items.find((item: LibraryRecord) => item.learning_state === 'in_progress')
    || items[0]
  const feeds = Array.isArray(feedsData?.feeds) ? feedsData.feeds : []
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
    const isBook = activeSource.content_type === 'book' || activeSource.is_book_chapter
    const selection: HomeSelection = {
      type: 'source',
      id: String(activeSource.id),
      title: sourceTitle(activeSource),
      data: activeSource,
      route: isBook ? canonicalObjectHref('library', 'book', String(activeSource.book_id || activeSource.id), 'books') : canonicalObjectHref('library', 'source', String(activeSource.id))
    }
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

    {resurfacingItem && <section class="folio-home-resurfacing" aria-labelledby="home-resurfacing-title">
      <div class="folio-section-heading">
        <div>
          <p class="folio-kicker">Memory shelf</p>
          <h2 id="home-resurfacing-title">Daily resurfacing</h2>
        </div>
        <button type="button" class={`folio-button folio-resurfacing-star${resurfacingItem.starred ? ' is-starred' : ''}`} onClick={setResurfacingStar} disabled={Boolean(resurfacingBusy)} aria-pressed={resurfacingItem.starred} title="Prioritize this source in resurfacing">{resurfacingItem.starred ? 'Starred' : 'Star'}</button>
      </div>
      <article class="folio-resurfacing-card">
        <div class="folio-resurfacing-copy">
          <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(resurfacingItem.branch.id)}`} title="Open branch dossier"><span class="badge-format">Branch</span><span>{resurfacingItem.branch.label}</span></a>
          <h3>{resurfacingItem.title}</h3>
          <p class="folio-record-meta">{[resurfacingItem.creator, resurfacingItem.content_type ? labelize(resurfacingItem.content_type) : null, `Due ${formatDate(resurfacingItem.due_at)}`, resurfacingItem.domain.label].filter(Boolean).join(' · ')}</p>
          <div class="folio-resurfacing-links" aria-label="Passive source links">
            {resurfacingItem.source_url && <a class="folio-quick-link" href={resurfacingItem.source_url} target="_blank" rel="noreferrer">Original</a>}
            {resurfacingItem.companions?.html && <a class="folio-quick-link" href={`/artifacts/${resurfacingItem.companions.html.id}`} target="_blank" rel="noreferrer">HTML</a>}
            {resurfacingItem.companions?.pdf && <a class="folio-quick-link" href={`/artifacts/${resurfacingItem.companions.pdf.id}`} target="_blank" rel="noreferrer">PDF</a>}
          </div>
        </div>
        <div class="folio-resurfacing-actions" aria-label="Resurfacing actions">
          <button type="button" class="folio-button folio-button-primary" disabled={!resurfacingItem.presentation?.id || Boolean(resurfacingBusy)} onClick={() => actOnResurfacing('reviewed')}>Reviewed</button>
          <button type="button" class="folio-button" disabled={!resurfacingItem.presentation?.id || Boolean(resurfacingBusy)} onClick={() => actOnResurfacing('snooze')}>Snooze 7 days</button>
          <button type="button" class="folio-button folio-button-quiet" disabled={!resurfacingItem.presentation?.id || Boolean(resurfacingBusy)} onClick={() => actOnResurfacing('dismissed')}>Dismiss</button>
        </div>
      </article>
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
      <section class="folio-home-threads" aria-labelledby="home-threads-title">
        <div class="folio-section-heading folio-home-threads-heading">
          <div>
            <p class="folio-kicker">Current rotation</p>
            <h2 id="home-threads-title">{threads.length ? `One turn from each Thread` : 'No current Threads'}</h2>
          </div>
          <a class="folio-heading-link" href={routeHref('learn', 'paths')} title="Browse Threads" aria-label="Browse Threads">
            <Icon name="learn" size={21}/>
          </a>
        </div>
        {threads.length ? <div class="folio-home-thread-list">
          {threads.map((thread) => {
            const stage = thread.current_stage
            const lesson = stage?.lessons?.[0]
            const primarySource = lesson?.sources?.find((source) => source.role === 'primary') || lesson?.sources?.[0]
            const sourceCue = lesson ? [primarySource?.content_type ? labelize(primarySource.content_type) : null, primarySource?.creator || null, lesson.estimated_minutes ? `~${lesson.estimated_minutes} min` : null].filter(Boolean).join(' · ') : ''
            const location = lesson && stage ? `Level ${stage.position} · Lesson ${String(lesson.position + 1).padStart(2, '0')}` : stage?.title || 'Learning path'
            const title = lesson?.title || (stage?.status === 'completed' ? 'Level completed' : 'Open learning path')
            const status = lesson?.status === 'in_progress' ? 'In progress' : stage?.status === 'completed' ? 'Completed' : 'Ready'
            const href = lesson ? lessonHref(String(thread.id), lesson.id) : `#/learn/thread/${encodeURIComponent(String(thread.id))}`
            return <a key={thread.id} class={`folio-home-thread-lesson${lesson?.status === 'in_progress' ? ' is-active' : ''}`} href={href} title={`Open ${thread.title}: ${title}`} role="listitem">
              <div class="folio-home-thread-copy">
                <span class="folio-object-kicker" dir="auto">{thread.title}</span>
                <strong class="folio-home-thread-lesson-title" dir="auto">{title}</strong>
                <small>{location}{sourceCue ? ` · ${sourceCue}` : ''}</small>
              </div>
              <div class="folio-home-thread-action">
                <span class={`folio-status-mark${lesson?.status === 'in_progress' ? ' is-in-progress' : ''}`}>{status}</span>
                <Icon name="chevron" size={15}/>
              </div>
            </a>
          })}
        </div> : <p class="folio-record-note">Create a Thread before Queue can become a learning commitment.</p>}
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
          <p class="folio-record-note">Queue is empty. Add a source here only when it has earned your attention.</p>
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
  </div>
}
