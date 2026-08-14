import { useState } from 'preact/hooks'
import { formatDate, labelize } from '../api'
import { useData } from '../app/useData'
import { ErrorState, Empty, Loading } from '../components/States'
import { Icon } from '../components/Icon'
import { objectHref as canonicalObjectHref, routeHref } from '../app/router'
import { sourceCreator, sourceFormat, sourceLink, sourceTitle, type LibraryRecord } from './library/types'

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

function evidenceSummary(thread: LibraryRecord) {
  const requirements = Array.isArray(thread?.evidence_requirements) ? thread.evidence_requirements : []
  const completed = requirements.filter((item: LibraryRecord) => ['met', 'verified', 'complete', 'completed'].includes(String(item.status || item.state || '').toLowerCase()) || item.completed_at).length
  return { completed, total: requirements.length }
}

export function HomeWorkspace({ onCapture, onInspect, onNavigate }: HomeWorkspaceProps) {
  const { data, error, loading, reload } = useData<LibraryRecord>('/dashboard/briefing')
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)

  if (loading) return <Loading label="Loading Home"/>
  if (error) return <ErrorState message={error} retry={reload}/>
  const briefing = data || {}
  const items = Array.isArray(briefing.active_items) ? briefing.active_items : []
  const activeSource = (selectedSourceId ? items.find((item: LibraryRecord) => String(item.id) === String(selectedSourceId)) : null)
    || items.find((item: LibraryRecord) => item.learning_state === 'in_progress')
    || items[0]
  const thread = briefing.active_thread
  const dueReviews = Number(briefing.due_reviews || 0)
  const files = activeSource ? (briefing.artifacts || []).filter((file: LibraryRecord) => String(file.recommendation_id) === String(activeSource.id)) : []
  const htmlFile = files.find((f: LibraryRecord) => String(f.role || '').toLowerCase() === 'html' || /html/i.test(String(f.media_type || f.filename || '')))
  const pdfFile = files.find((f: LibraryRecord) => String(f.role || '').toLowerCase() === 'pdf' || /pdf/i.test(String(f.media_type || f.filename || '')))
  const otherFiles = files.filter((f: LibraryRecord) => f.id !== htmlFile?.id && f.id !== pdfFile?.id)
  const notebookUrl = activeSource?.notebook_url
    || activeSource?.metadata?.notebook_url
    || files.find((file: LibraryRecord) => file.notebook_url || file.metadata?.notebook_url)?.notebook_url
    || files.find((file: LibraryRecord) => file.metadata?.notebook_url)?.metadata?.notebook_url
    || null
  const evidence = evidenceSummary(thread)
  const openSource = () => {
    if (!activeSource) return
    const selection: HomeSelection = { type: 'source', id: String(activeSource.id), title: sourceTitle(activeSource), data: activeSource, route: canonicalObjectHref('library', 'source', String(activeSource.id)) }
    onInspect?.(selection)
  }

  return <div class="folio-home-workspace">
    <header class="folio-home-header">
      <h1>Home</h1>
      <button type="button" class="folio-button folio-button-primary" onClick={() => onCapture ? onCapture() : navigate(routeHref('library', 'triage', 'inbox'), onNavigate)}>
        <Icon name="capture" size={16}/>
        Quick capture
      </button>
    </header>

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
        </> : <Empty title="The working shelf is clear" body="Capture or curate one source when you are ready to make a deliberate commitment." action={<button type="button" class="folio-button folio-button-primary" onClick={() => onCapture ? onCapture() : navigate(routeHref('library', 'triage', 'inbox'), onNavigate)}>Capture a source</button>}/>}
      </div>
    </section>

    <div class="folio-home-sequence">
      <section class="folio-home-thread" aria-labelledby="home-thread-title"><div class="folio-section-heading"><div><p class="folio-kicker">Active Thread</p><h2 id="home-thread-title">{thread?.title || 'No active Thread'}</h2></div>{thread && <a href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`}>Open Thread</a>}</div>{thread ? <><p>{thread.guiding_question || thread.why_now || 'A purpose-first Thread is holding the work together.'}</p>{thread.definition_of_done && <div class="folio-thread-finish"><strong>Finish line</strong><p>{thread.definition_of_done}</p></div>}<div class="folio-thread-evidence"><span><strong>{evidence.completed}</strong> of {evidence.total || '—'}</span><small>evidence requirements met</small></div></> : <p class="folio-record-note">Create a Thread before Queue can become a learning commitment.</p>}</section>

      <section class="folio-home-queue" aria-labelledby="home-queue-title"><div class="folio-section-heading"><div><p class="folio-kicker">Queue</p><h2 id="home-queue-title">{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} in queue` : 'Queue is empty'}</h2></div><a class="folio-heading-link" href={routeHref('library', 'triage', 'queue')}>Open Queue</a></div>{items.length ? <div class="folio-home-queue-list" role="list">{items.map((item: LibraryRecord) => { const isSelected = activeSource && String(activeSource.id) === String(item.id); return <button type="button" key={item.id} role="listitem" class={`folio-home-queue-item${isSelected ? ' is-active' : ''}`} onClick={() => setSelectedSourceId(String(item.id))} title="Click to set as current source"><span class="folio-home-queue-item-title">{sourceTitle(item)}</span></button> })}</div> : <p class="folio-record-note">Queue is empty. Review Inbox to add new sources.</p>}</section>

      <section class="folio-home-recall" aria-labelledby="home-recall-title"><div class="folio-section-heading"><div><p class="folio-kicker">Due recall</p><h2 id="home-recall-title">{dueReviews ? `${dueReviews} ${dueReviews === 1 ? 'card is' : 'cards are'} due` : 'No recall due today'}</h2></div><Icon name="recall" size={21}/></div><p>{dueReviews ? 'Retrieve before adding another source. A small recall action protects the map from becoming a shelf of unread intentions.' : 'Your review shelf is clear. The next proof can come from the current source or Thread.'}</p><a class="folio-button" href={routeHref('learn', 'practice', 'recall')}>{dueReviews ? 'Review now' : 'Open Recall'}</a></section>
    </div>

    <section class="folio-home-capture-signal" aria-label="Capture signal"><div><p class="folio-kicker">Capture signal</p><h2>{briefing.inbox_count ? `${briefing.inbox_count} capture${briefing.inbox_count === 1 ? '' : 's'} waiting` : 'Inbox is clear'}</h2><p>{briefing.inbox_count ? 'Triage the waiting material when you can make a real fit decision.' : 'A clean Inbox leaves room for the next useful question.'}</p></div><div class="folio-row-actions"><button type="button" class="folio-button folio-button-primary" onClick={() => onCapture ? onCapture() : navigate(routeHref('library', 'triage', 'inbox'), onNavigate)}><Icon name="capture" size={16}/>Capture</button>{briefing.inbox_count > 0 && <a class="folio-button" href={routeHref('library', 'triage', 'inbox')}>Review Inbox</a>}</div></section>
  </div>
}
