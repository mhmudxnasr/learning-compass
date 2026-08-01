import { ComponentChildren } from 'preact'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, flushOfflineMutations, formatDate, labelize, queueOfflineMutation } from './api'
import { Destination, destinationForPath, destinations, workspaceOrder, WorkspaceKey } from './destinations'

const AtlasPage = lazy(() => import('./features/atlas/AtlasPage'))
const DiscoveryPage = lazy(() => import('./features/discovery/DiscoveryPage'))

const workspaceLabels: Record<WorkspaceKey, string> = {
  today: 'Today', curate: 'Curate', map: 'Map', learn: 'Learn', insights: 'Insights', settings: 'Settings',
}

const icons: Record<WorkspaceKey | 'search' | 'capture' | 'more', ComponentChildren> = {
  today: <path d="M4 5h16M4 12h10M4 19h7" />,
  curate: <><path d="M4 4h16v16H4z" /><path d="M4 13h5l2 3h2l2-3h5" /></>,
  map: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-10-4 10M7 6h10" /></>,
  learn: <><path d="M4 5a3 3 0 0 1 3-3h13v18H7a3 3 0 0 0 0-6h13" /></>,
  insights: <><path d="M5 19V9m7 10V4m7 15v-7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  capture: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
}

function Icon({ name }: { name: keyof typeof icons }) {
  return <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{icons[name]}</svg>
}

function readRoute() {
  const raw = location.hash.slice(1) || '/today/briefing'
  return destinationForPath(raw) || destinations[0]
}

function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const change = () => setRoute(readRoute())
    addEventListener('hashchange', change)
    if (!location.hash) location.hash = '#/today/briefing'
    return () => removeEventListener('hashchange', change)
  }, [])
  return route
}

function go(destination: Destination) { location.hash = `#/${destination.workspace}/${destination.slug}` }

function playCompletionChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(523.25, now)
    gain1.gain.setValueAtTime(0.12, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(659.25, now + 0.12)
    gain2.gain.setValueAtTime(0.12, now + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.5)
  } catch { /* audio not allowed or unsupported */ }
}

function triggerDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') new Notification(title, { body })
    })
  }
}

type SourceItem = { id: string; video_url: string; video_title: string }

async function startExternal(event: MouseEvent, item: SourceItem) {
  event.preventDefault()
  const target = window.open('about:blank', '_blank')
  try {
    const result = await api<{ session_id: string }>('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: item.id }) })
    localStorage.setItem('tm-active-session', JSON.stringify({ id: result.session_id, recommendationId: item.id, title: item.video_title, sourceUrl: item.video_url }))
    if (target) target.location.replace(item.video_url)
    else location.assign(item.video_url)
  } catch (error: any) {
    target?.close()
    window.alert(`Couldn’t start this learning session: ${error.message}`)
  }
}

function useData(endpoint?: string) {
  const [state, setState] = useState<{ data: any; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setState((current) => ({ data: current.data, error: '', loading: current.data == null }))
    if (!endpoint) return setState({ data: {}, error: '', loading: false })
    api(endpoint).then((data) => active && setState({ data, error: '', loading: false })).catch((error) => active && setState({ data: null, error: error.message, loading: false }))
    const refresh = () => { if (document.visibilityState === 'visible') setVersion((value) => value + 1) }
    addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [endpoint, version])
  return { ...state, reload: () => setVersion((value) => value + 1) }
}

function Shell({ route, children, onCapture, onSearch, onMore }: { route: Destination; children: ComponentChildren; onCapture: () => void; onSearch: () => void; onMore: () => void }) {
  const [collapsed, setCollapsed] = useState(localStorage.getItem('tm-rail') === 'collapsed')
  const workspaceDestinations = destinations.filter((item) => item.workspace === route.workspace)
  const setRail = () => setCollapsed((value) => { localStorage.setItem('tm-rail', value ? 'open' : 'collapsed'); return !value })
  return <div class={`app-shell ${collapsed ? 'rail-collapsed' : ''}`}>
    <aside class="rail">
      <button class="brand" onClick={setRail} title="Toggle navigation"><span class="brand-mark">LC</span><span class="brand-name">Learning Compass</span></button>
      <nav class="rail-nav" aria-label="Workspaces">
        {workspaceOrder.filter((item) => item !== 'settings').map((workspace) => {
          const first = destinations.find((item) => item.workspace === workspace)!
          return <button class={route.workspace === workspace ? 'active' : ''} onClick={() => go(first)} title={workspaceLabels[workspace]}><Icon name={workspace} /><span>{workspaceLabels[workspace]}</span></button>
        })}
      </nav>
      <div class="rail-bottom">
        <button onClick={onSearch}><Icon name="search" /><span>Search</span><kbd>⌘K</kbd></button>
        <button class={route.workspace === 'settings' ? 'active' : ''} onClick={() => go(destinations.find((item) => item.workspace === 'settings')!)}><Icon name="settings" /><span>Settings</span></button>
      </div>
    </aside>
    <main class="main">
      <header class="page-head">
        <div><div class="workspace-label">{workspaceLabels[route.workspace]}</div><h1>{route.title}</h1><p>{route.purpose}</p></div>
        <button class="primary-action" onClick={onCapture}><Icon name="capture" /> Capture</button>
      </header>
      <nav class="subnav" aria-label={`${workspaceLabels[route.workspace]} views`}>
        {workspaceDestinations.map((item) => <button class={item.key === route.key ? 'active' : ''} onClick={() => go(item)}>{item.title}</button>)}
      </nav>
      <div class="page-content">{children}</div>
    </main>
    <nav class="mobile-nav">
      {(['today', 'curate', 'learn'] as WorkspaceKey[]).map((workspace) => <button class={route.workspace === workspace ? 'active' : ''} onClick={() => go(destinations.find((item) => item.workspace === workspace)!)}><Icon name={workspace} /><span>{workspaceLabels[workspace]}</span></button>)}
      <button class={['map', 'insights', 'settings'].includes(route.workspace) ? 'active' : ''} onClick={onMore}><Icon name="more" /><span>More</span></button>
    </nav>
  </div>
}

function Loading() { return <div class="skeleton-stack"><i /><i /><i /></div> }
function Empty({ title = 'Nothing here yet', body = 'This view is ready when the system has relevant data.' }) { return <div class="empty-state"><span class="empty-rule" /><h2>{title}</h2><p>{body}</p></div> }
function ErrorState({ message }: { message: string }) { return <div class="error-state"><strong>Couldn’t load this view.</strong><span>{message}</span></div> }

function TodayPage() {
  const { data, error, loading } = useData('/dashboard/briefing')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const next = data?.next_item
  const signals = [
    ['Reviews due', data?.due_reviews || 0, 'learn.review'],
    ['Queue', data?.queue_count || 0, 'curate.queue'],
    ['Neglected branches', data?.neglected_count || 0, 'insights.learning'],
    ['Learning gaps', data?.gap_count || 0, 'map.coverage'],
  ]
  return <div class="today-layout">
    <section class="today-lead">
      <div class="date-line">{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div>
      <h2>{data?.next_action === 'review' ? 'Start with recall.' : next ? 'Continue where the signal is strongest.' : 'Clear space for the next useful thing.'}</h2>
      {next ? <div class="focus-item"><div><span>{next.content_type || 'source'} · {next.creator || 'Unknown creator'}</span><h3>{next.video_title}</h3><p>{next.why_this || 'Ready when you are.'}</p></div><a class="focus-button" href={next.video_url} target="_blank" rel="noreferrer" onClick={(event) => startExternal(event, next)}>Start externally</a></div> : <Empty title="Your active queue is clear" body="Capture one strong source instead of filling a backlog." />}
    </section>
    <section class="signal-strip">{signals.map(([label, value, key]) => <button onClick={() => go(destinations.find((item) => item.key === key)!)}><span>{label}</span><strong>{value}</strong></button>)}</section>
    <div class="today-columns">
      <section class="module"><div class="module-head"><h3>Queue pressure</h3><span>{data?.queue_count || 0}/5</span></div><div class="slot-line">{[0,1,2,3,4].map((slot) => <i class={slot < (data?.queue_count || 0) ? 'filled' : ''} />)}</div><p>Five deliberate choices. Extra items require an explicit override.</p></section>
      <section class="module"><div class="module-head"><h3>Map pulse</h3><span>{data?.streak || 0} day streak</span></div><p>{data?.recent_signal || 'New profile signals and branch changes will surface here after processing.'}</p></section>
    </div>
    <section class="activity-list"><div class="module-head"><h3>Recent output</h3><button onClick={() => go(destinations.find((item) => item.key === 'learn.notes')!)}>Open notes</button></div>{(data?.recent || []).length ? data.recent.map((item: any) => <div class="activity-row"><span>{item.content_type || 'item'}</span><strong>{item.video_title}</strong><time>{formatDate(item.updated_at || item.created_at)}</time></div>) : <Empty title="No finished work yet" body="Completed notes, reviews, and reading files will collect here." />}</section>
  </div>
}

function JobMonitor({ job, item, onCancel, onRetry }: { job: any; item: any; onCancel: (id: string) => void; onRetry: (item: any) => void }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (job.status !== 'running' && job.status !== 'pending') return
    const startTime = job.created_at ? new Date(job.created_at).getTime() : Date.now()
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      setElapsed(diff)
    }
    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [job.status, job.created_at])

  const isPending = job.status === 'pending'
  const isRunning = job.status === 'running'
  const isCompleted = job.status === 'completed'
  const isCancelled = job.status === 'cancelled'
  const isFailed = job.status === 'failed'

  const progressPercent = isCompleted ? 100 : isRunning ? 75 : isPending ? 30 : 0

  return (
    <details class="job-progress-drawer" open={isRunning || isPending}>
      <summary class="job-drawer-summary">
        <div class="job-summary-title">
          <span class="job-pulse-dot" data-state={job.status} />
          <strong>
            {isRunning ? 'Synthesizing Companion...' : isPending ? 'Queued' : isCompleted ? 'Visual Lite Ready' : isCancelled ? 'Job Stopped' : 'Generation Failed'}
          </strong>
          {(isRunning || isPending) && (
            <span class="job-elapsed">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}s</span>
          )}
        </div>
        <small>Job: {job.id.slice(0, 18)}</small>
      </summary>

      <div class="job-drawer-body">
        <div class="job-bar-track">
          <div class="job-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <ul class="job-timeline">
          <li class="done">
            <strong>Stage 1: Enqueued</strong>
            <small>{formatDate(job.created_at)}</small>
          </li>
          <li class={isCompleted ? 'done' : isRunning ? 'active' : isCancelled || isFailed ? 'error' : 'pending'}>
            <strong>Stage 2: Mining & Opencode AI Synthesis</strong>
            <small>
              {isCompleted ? '✓ Source content mined & synthesized via Opencode API' : isRunning ? `⚡ Mining content & generating HTML companion (${elapsed}s elapsed)...` : isCancelled ? '✕ Stopped by user' : isFailed ? '✕ Generation failed' : 'Pending'}
            </small>
          </li>
          <li class={isCompleted ? 'done' : 'pending'}>
            <strong>Stage 3: Cloud Pair Upload (R2 / Learn Files)</strong>
            <small>{isCompleted ? '✓ Saved HTML & PDF companion pair to R2 / Learn Files' : 'Pending'}</small>
          </li>
        </ul>

        {job.error && <div class="job-error-msg">Error: {job.error}</div>}

        <div class="job-drawer-actions">
          {(isPending || isRunning) && (
            <button class="danger-button" onClick={() => onCancel(job.id)}>
              Stop / Cancel Job
            </button>
          )}
          {isCompleted && (
            <button class="primary-action" onClick={() => window.location.hash = '#/learn/files'}>
              Open in Files (Learn → Files) →
            </button>
          )}
          {(isCancelled || isFailed) && (
            <button onClick={() => onRetry(item)}>Retry Visual Lite</button>
          )}
        </div>
      </div>
    </details>
  )
}

function formatQueueMeta(item: any): string {
  const rawCreator = item.creator && item.creator.toLowerCase() !== 'unknown' ? item.creator : ''
  let domain = ''

  if (item.video_url) {
    try {
      const hostname = new URL(item.video_url).hostname.replace(/^www\./, '')
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        domain = 'YouTube'
      } else if (hostname.includes('github.com')) {
        domain = 'GitHub'
      } else if (hostname.includes('medium.com')) {
        domain = 'Medium'
      } else if (hostname.includes('substack.com')) {
        domain = 'Substack'
      } else if (hostname.includes('wikipedia.org')) {
        domain = 'Wikipedia'
      } else if (hostname.includes('arxiv.org')) {
        domain = 'arXiv'
      } else {
        domain = hostname
      }
    } catch {
      domain = ''
    }
  }

  const parts: string[] = []

  if (rawCreator) {
    parts.push(rawCreator)
    if (domain && domain.toLowerCase() !== rawCreator.toLowerCase()) {
      parts.push(domain)
    }
  } else if (domain) {
    parts.push(domain)
  } else {
    parts.push(item.content_type || 'Source')
  }

  if (item.estimated_minutes) {
    parts.push(`~${item.estimated_minutes} min`)
  }

  return parts.join(' · ')
}

function formatSmartHook(item: any): string {
  if (item.why_this && item.why_this.trim()) {
    return item.why_this.trim()
  }
  const creator = item.creator ? ` by ${item.creator}` : ''
  const title = item.video_title || 'Captured source'
  return `Core concepts & evidence from ${title}${creator}.`
}

function QueuePage() {
  const { data, error, loading } = useData('/capture/queue')

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const items = data?.items || []

  return (
    <div class="queue-view">
      <div class="queue-summary">
        <div><strong>{items.length}</strong><span>active of five</span></div>
        <p>Start, resume, and finish learning directly from this queue.</p>
      </div>
      {items.length > 5 && <div class="queue-warning">Override active · finish {items.length - 5} extra {items.length - 5 === 1 ? 'item' : 'items'} to restore focus.</div>}
      <div class="queue-list">
        {items.map((item: any, index: number) => {
          const isInProgress = item.learning_state === 'in_progress'

          return (
            <article class="queue-row" key={item.id}>
              <span class="queue-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <div class="queue-row-header">
                  <span class="meta">{formatQueueMeta(item)}</span>
                  {isInProgress && (
                    <span class="queue-state-badge in-progress">
                      ● In Progress
                    </span>
                  )}
                </div>
                <h3>{item.video_title}</h3>
                <p>{formatSmartHook(item)}</p>
              </div>

              <div class="row-actions">
                <a class="primary-action" href={item.video_url} target="_blank" rel="noreferrer" onClick={(event) => startExternal(event, item)}>
                  {isInProgress ? 'Resume' : 'Start'}
                </a>
              </div>
            </article>
          )
        })}
        {Array.from({ length: Math.max(0, 5 - items.length) }).map(() => <div class="queue-slot">Available slot</div>)}
      </div>
    </div>
  )
}

function InboxPage() {
  const { data, error, loading, reload } = useData('/capture')
  const feedsState = useData('/capture/feeds')
  const [blocked, setBlocked] = useState<any>(null)
  const [working, setWorking] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [feedStatus, setFeedStatus] = useState('')
  const [feedWorking, setFeedWorking] = useState(false)
  const [suggestion, setSuggestion] = useState<any>(null)
  const [suggestStatus, setSuggestStatus] = useState('')
  if (loading || feedsState.loading) return <Loading />
  if (error || feedsState.error) return <ErrorState message={error || feedsState.error} />
  const items = data?.items || []
  const feeds = feedsState.data?.feeds || []
  const triage = async (item: any, action: 'queue' | 'exclude', override = false) => { setWorking(item.id); setBlocked(null); try { await api(`/capture/${item.id}/triage`, { method: 'POST', body: JSON.stringify({ action, override_queue_cap: override }) }); reload() } catch (error: any) { if (error.message === 'queue_full') setBlocked(item); else setBlocked({ ...item, error: error.message }) } finally { setWorking('') } }
  const addFeed = async (event: Event) => {
    event.preventDefault()
    setFeedWorking(true); setFeedStatus('Reading feed…')
    try {
      const result = await api<any>('/capture/feeds', { method: 'POST', body: JSON.stringify({ url: feedUrl }) })
      setFeedUrl(''); setFeedStatus(`${result.feed.title} subscribed · ${result.imported} new ${result.imported === 1 ? 'article' : 'articles'}`)
      feedsState.reload(); reload()
    } catch (feedError: any) { setFeedStatus(feedError.message) }
    finally { setFeedWorking(false) }
  }
  const syncFeeds = async () => {
    setFeedWorking(true); setFeedStatus('Checking feeds…')
    try {
      const result = await api<any>('/capture/feeds/sync', { method: 'POST' })
      setFeedStatus(`${result.imported} new ${result.imported === 1 ? 'article' : 'articles'}${result.errors.length ? ` · ${result.errors.length} failed` : ''}`)
      feedsState.reload(); reload()
    } catch (feedError: any) { setFeedStatus(feedError.message) }
    finally { setFeedWorking(false) }
  }
  const removeFeed = async (feed: any) => {
    setFeedWorking(true); setFeedStatus('')
    try { await api(`/capture/feeds/${feed.id}`, { method: 'DELETE' }); setFeedStatus(`${feed.title} unsubscribed`); feedsState.reload() }
    catch (feedError: any) { setFeedStatus(feedError.message) }
    finally { setFeedWorking(false) }
  }
  const getRecommendation = async () => {
    setSuggestStatus('Finding a fit…')
    try {
      const result = await api<any>('/ai/suggest', { method: 'POST' })
      setSuggestion(result.suggestion)
      setSuggestStatus('')
    } catch (suggestErr: any) { setSuggestStatus(suggestErr.message) }
  }
  return <div class="inbox-view">
    <section class="feed-manager">
      <div class="feed-manager-head">
        <div><h2>RSS &amp; Atom feeds</h2><p>New articles arrive automatically every six hours, or generate an AI recommendation.</p></div>
        <div class="feed-head-actions">
          <button type="button" class="ai-suggest-btn" disabled={!!suggestStatus} onClick={getRecommendation}>{suggestStatus || 'Get AI recommendation'}</button>
          <button type="button" disabled={feedWorking || !feeds.length} onClick={syncFeeds}>Check now</button>
        </div>
      </div>
      <form class="feed-create" onSubmit={addFeed}><label for="feed-url">Feed URL</label><div><input id="feed-url" type="url" value={feedUrl} onInput={(event) => setFeedUrl((event.target as HTMLInputElement).value)} placeholder="https://example.com/feed.xml" required /><button class="primary-action" disabled={feedWorking || !feedUrl.trim()}>Subscribe</button></div></form>
      {feeds.length > 0 && <div class="feed-list">{feeds.map((feed: any) => <div><span><strong>{feed.title}</strong><small>{feed.entry_count || 0} seen · {feed.last_checked_at ? `checked ${formatDate(feed.last_checked_at)}` : 'not checked yet'}</small>{feed.last_error && <small class="feed-error">{feed.last_error}</small>}</span><button type="button" disabled={feedWorking} onClick={() => removeFeed(feed)}>Remove</button></div>)}</div>}
      {feedStatus && <output class="feed-status">{feedStatus}</output>}
    </section>
    {suggestion && <div class="suggestion-card">
      <div class="suggestion-body">
        <span class="meta">AI recommendation · {suggestion.content_type || 'source'}</span>
        <h3>{suggestion.title}</h3>
        <p>{suggestion.why_this}</p>
        {suggestion.creator && <span class="suggestion-creator">Creator: {suggestion.creator}</span>}
      </div>
      <div class="suggestion-actions">
        <button class="primary-action" onClick={async () => {
          setSuggestStatus('Adding to Inbox…')
          try {
            await api('/capture', { method: 'POST', body: JSON.stringify({ source: suggestion.url, title: suggestion.title }) })
            setSuggestion(null)
            setSuggestStatus('Added to Inbox')
            reload()
          } catch (error: any) { setSuggestStatus(error.message) }
        }}>Add to Inbox</button>
        <button class="secondary" onClick={() => setSuggestion(null)}>Dismiss</button>
      </div>
    </div>}
    <div class="inbox-summary"><strong>{items.length} waiting</strong><span>Promote only what deserves one of five active queue slots.</span></div>
    {blocked && <div class="queue-warning"><span>{blocked.error || 'Queue full. Finish an active item or make this a deliberate override.'}</span>{!blocked.error && <button onClick={() => triage(blocked, 'queue', true)}>Add anyway</button>}</div>}
    {items.length ? <div class="record-list">{items.map((item: any, index: number) => <article><span class="record-number">{String(index + 1).padStart(2, '0')}</span><div><span class="meta">{item.feed_title ? `rss · ${item.feed_title}` : item.content_type || 'source'}</span><h3>{item.video_title}</h3><p>{item.why_this || item.video_url}</p></div><div class="row-actions"><button disabled={working === item.id} onClick={() => triage(item, 'exclude')}>Exclude</button><button class="primary-action" disabled={working === item.id} onClick={() => triage(item, 'queue')}>Queue</button></div></article>)}</div> : <Empty title="Inbox clear" body="New captures and feed articles land here for a quick fit check before they earn a queue slot." />}
  </div>
}

function CollectionsPage({ scope }: { scope: 'curate' }) {
  const { data, error, loading, reload } = useData(`/collections?scope=${scope}`)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const collections = data?.collections || []
  const create = async (event: Event) => {
    event.preventDefault()
    if (!name.trim()) return
    setStatus('Creating…')
    try {
      await api('/collections', { method: 'POST', body: JSON.stringify({ name, scope }) })
      setName(''); setStatus(''); reload()
    } catch (createError: any) { setStatus(createError.message) }
  }
  return <div class="collection-page">
    <form class="inline-create" onSubmit={create}><label for="collection-name">New learning collection</label><div><input id="collection-name" value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="e.g. Decision making" /><button class="primary-action" disabled={!name.trim()}>Create</button></div>{status && <output>{status}</output>}</form>
    {collections.length ? <div class="collection-list">{collections.map((item: any) => <article><div><h2>{item.name}</h2><p>{item.description || 'An active group of sources to learn together.'}</p></div><strong>{item.item_count || 0}<span> sources</span></strong></article>)}</div> : <Empty title="No active collections" body="Create a collection when several sources belong to one learning goal." />}
  </div>
}

function ResurfacingPage() {
  const { data, error, loading } = useData('/brain/resurfacing')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const items = data?.due || []
  if (!items.length) return <Empty title="Nothing needs revisiting today" body="Useful sources will return here when enough time has passed." />
  return <div class="source-list">{items.map((item: any) => <article><div><span class="meta">Due {formatDate(item.due_at)}</span><h2>{item.video_title || 'Saved source'}</h2><p>{item.creator || item.reason || 'Ready for another look.'}</p></div>{item.video_url && <a href={item.video_url} target="_blank" rel="noreferrer">Open source</a>}</article>)}</div>
}

function ContradictionsPage() {
  const { data, error, loading, reload } = useData('/brain/contradictions')
  const [working, setWorking] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const items = data?.contradictions || []
  const resolve = async (item: any) => {
    setWorking(item.id)
    try { await api('/brain/contradiction/resolve', { method: 'POST', body: JSON.stringify({ id: item.id, resolution: 'reviewed' }) }); reload() }
    finally { setWorking('') }
  }
  if (!items.length) return <Empty title="No unresolved contradictions" body="Competing claims will appear here with their evidence when detected." />
  return <div class="contradiction-list">{items.map((item: any) => <article><div><span class="meta">{item.branch_id || item.topic || 'Knowledge claim'}</span><h2>{item.tension || item.summary || item.claim_a || 'Competing claims'}</h2><p>{item.claim_b || item.notes || 'Review the supporting evidence before deciding what to keep.'}</p></div><button disabled={working === item.id} onClick={() => resolve(item)}>Mark reviewed</button></article>)}</div>
}

function ArchivePage() {
  const [filter, setFilter] = useState('all')
  const endpoint = `/recommendations/list?limit=200&source=manual${filter === 'all' ? '' : `&status=${filter}`}`
  const { data, error, loading } = useData(endpoint)
  const feedsState = useData('/capture/feeds')
  if (loading || feedsState.loading) return <Loading />
  if (error || feedsState.error) return <ErrorState message={error || feedsState.error} />
  const items = data?.recommendations || []
  const feeds = feedsState.data?.feeds || []
  const feedCount = feeds.reduce((sum: number, feed: any) => sum + Number(feed.entry_count || 0), 0)
  const inbox = destinations.find((item) => item.key === 'curate.inbox')!
  return <div class="archive-page"><section class="archive-rss"><div class="archive-rss-head"><div><span class="meta">Pinned · RSS / Atom</span><h2>Feed reading</h2><p>{feedCount ? `${feedCount} captured ${feedCount === 1 ? 'article' : 'articles'} kept here, outside the main archive.` : 'Subscribe to a feed in Inbox and its articles will stay grouped here.'}</p></div><button onClick={() => go(inbox)}>Open Inbox</button></div>{feeds.length ? <div class="archive-rss-list">{feeds.map((feed: any) => <div><strong>{feed.title}</strong><span>{feed.entry_count || 0} captured · {feed.last_checked_at ? `checked ${formatDate(feed.last_checked_at)}` : 'not checked yet'}</span></div>)}</div> : <div class="archive-rss-empty">No subscribed feeds yet.</div>}</section><div class="filter-bar"><label>Status<select value={filter} onChange={(event) => setFilter((event.target as HTMLSelectElement).value)}><option value="all">All</option><option value="consumed">Completed</option><option value="rejected">Excluded</option><option value="active">Saved</option></select></label><span>{data?.total || 0} non-feed sources</span></div>{items.length ? <div class="source-list">{items.map((item: any) => <article><div><span class="meta">{item.content_type || 'source'} · {item.status}</span><h2>{item.video_title}</h2><p>{item.user_review || item.why_this || item.creator || 'No reaction recorded.'}</p></div>{item.video_url && <a href={item.video_url} target="_blank" rel="noreferrer">Open</a>}</article>)}</div> : <Empty title="No matching sources" body="Try another status filter." />}</div>
}

function NotesPage({ kind }: { kind: 'reflection' | 'source' }) {
  const { data, error, loading, reload } = useData(kind === 'reflection' ? '/notes?kind=reflection' : '/notes')
  const [selected, setSelected] = useState<any>(null)
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const notes = (data?.notes || []).filter((note: any) => kind === 'reflection' ? note.kind === 'reflection' : note.kind !== 'reflection')
  if (!notes.length) return <Empty title={kind === 'reflection' ? 'No reflections yet' : 'No extracted notes yet'} body={kind === 'reflection' ? 'Finish a queued source or scan handwritten PDF notes to preserve your reaction here.' : 'Ratings of 7 or higher automatically send the source to Notes Extractor.'} />
  const note = selected || notes[0]
  const updateSection = (key: string, content: string) => setSelected((current: any) => ({ ...(current || note), sections: (current || note).sections.map((section: any) => section.section_key === key ? { ...section, content } : section) }))
  const save = async () => { setStatus('Saving…'); try { await api(`/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ title: note.title, sections: note.sections }) }); setStatus('Saved'); reload(); return true } catch (saveError: any) { setStatus(saveError.message); return false } }
  const finish = async () => { if (await save()) { setStatus('Queueing note processing…'); try { await api(`/notes/${note.id}/process`, { method: 'POST' }); setStatus('Processing queued') } catch (finishError: any) { setStatus(finishError.message) } } }
  return <div class="notes-layout"><aside>{notes.map((item: any) => <button class={item.id === note.id ? 'active' : ''} onClick={() => { setSelected(item); setStatus('') }}><strong>{item.title}</strong><span>{kind === 'reflection' ? 'Your reflection' : 'Extractor note'} · {formatDate(item.updated_at)}</span></button>)}</aside><article class="note-document"><div class="note-kicker">{kind === 'reflection' ? 'Your words' : note.branch_id || 'Structured source note'}</div><input aria-label="Note title" class="note-title-input" value={note.title} onInput={(event) => setSelected({ ...note, title: (event.target as HTMLInputElement).value })} /><p class="note-source">{note.source_url ? <a href={note.source_url} target="_blank" rel="noreferrer">Open original source</a> : 'No source link attached'}</p>{(note.sections || []).map((section: any) => <section dir={section.direction || 'auto'}><h3>{section.label}</h3><textarea aria-label={section.label} class="note-editor" value={section.content} onInput={(event) => updateSection(section.section_key, (event.target as HTMLTextAreaElement).value)} /></section>)}<div class="note-actions"><button disabled={status === 'Saving…'} onClick={save}>Save draft</button><button class="primary-action" disabled={status === 'Saving…' || status === 'Queueing note processing…'} onClick={finish}>{kind === 'reflection' ? 'Analyze changes' : 'Re-run full bilingual extraction'}</button></div>{status && <output class="note-status">{status}</output>}</article></div>
}

function ReviewPage() {
  const { data, error, loading } = useData('/learning/srs/due')
  const [revealed, setRevealed] = useState(false)
  const [index, setIndex] = useState(0)
  const [reviewed, setReviewed] = useState(0)
  const [status, setStatus] = useState('')
  const cards = data?.cards || []
  const card = cards[index]
  const grade = async (value: number) => { if (!card) return; setStatus('Saving review…'); try { await api('/learning/srs/review', { method: 'POST', body: JSON.stringify({ card_id: card.id, grade: value }) }); setReviewed((count) => count + 1); setIndex((current) => current + 1); setRevealed(false); setStatus('') } catch (reviewError: any) { setStatus(reviewError.message) } }
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (!card || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) return; if (event.code === 'Space') { event.preventDefault(); setRevealed(true) } if (revealed && ['1','2','3','4'].includes(event.key)) grade([1,2,4,5][Number(event.key) - 1]) }; addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey) }, [card?.id, revealed])
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  if (!card) return <Empty title={reviewed ? 'Review complete' : 'Nothing due'} body={reviewed ? `You cleared ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. Come back when the schedule calls for it.` : 'Approved recall prompts will appear here at the right interval.'} />
  return <div class="review-stage"><div class="review-progress"><i style={{ width: `${((reviewed + 1) / cards.length) * 100}%` }} /><span>{reviewed + 1} of {cards.length}</span></div><button class="recall-card" onClick={() => setRevealed(true)}><span>{card.topic || 'Recall'}</span><h2>{card.question}</h2>{revealed ? <p>{card.answer}</p> : <small>Click or press Space to reveal</small>}</button>{revealed && <div class="grade-row">{['Again', 'Hard', 'Good', 'Easy'].map((label, gradeIndex) => <button disabled={status === 'Saving review…'} onClick={() => grade([1,2,4,5][gradeIndex])}><kbd>{gradeIndex + 1}</kbd>{label}</button>)}</div>}{status && <output class="review-status">{status}</output>}</div>
}

function CardsPage() {
  const draftsState = useData('/srs/drafts')
  const cardsState = useData('/learning/srs/cards')
  const [editing, setEditing] = useState<any>(null)
  const [status, setStatus] = useState('')
  if (draftsState.loading || cardsState.loading) return <Loading />
  if (draftsState.error || cardsState.error) return <ErrorState message={draftsState.error || cardsState.error} />
  const drafts = (draftsState.data?.drafts || []).filter((draft: any) => draft.status === 'draft')
  const cards = cardsState.data?.cards || []
  const refresh = () => { draftsState.reload(); cardsState.reload() }
  const act = async (draft: any, action: 'save' | 'approve' | 'reject' | 'delete') => {
    const value = editing?.id === draft.id ? editing : draft
    setStatus(action === 'approve' ? 'Approving…' : action === 'delete' ? 'Deleting…' : action === 'reject' ? 'Discarding…' : 'Saving…')
    try {
      if (action === 'delete') await api(`/srs/drafts/${draft.id}`, { method: 'DELETE' })
      else if (action === 'save') await api(`/srs/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify(value) })
      else {
        if (editing?.id === draft.id) await api(`/srs/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify(value) })
        await api(`/srs/drafts/${draft.id}/${action}`, { method: 'POST' })
      }
      setEditing(null); setStatus(''); refresh()
    } catch (error: any) { setStatus(error.message) }
  }
  const deleteCard = async (card: any) => {
    setStatus('Deleting…')
    try { await api(`/learning/srs/cards/${card.id}`, { method: 'DELETE' }); setStatus(''); cardsState.reload() }
    catch (error: any) { setStatus(error.message) }
  }
  if (!drafts.length && !cards.length) return <Empty title="No recall cards yet" body="Ratings of 7 or higher create editable drafts here before anything enters Review." />
  return <div class="drafts-view">{drafts.length > 0 && <><div class="drafts-intro"><strong>{drafts.length} drafts awaiting judgment</strong><span>Edit, delete, or approve only prompts worth remembering.</span></div>{drafts.map((draft: any) => { const value = editing?.id === draft.id ? editing : draft; return <article class="draft-card"><div class="draft-meta"><span>{draft.topic || 'General'}</span><small>{formatDate(draft.created_at)}</small></div><label>Question<textarea value={value.question} onFocus={() => setEditing({ ...draft })} onInput={(event) => setEditing({ ...value, question: (event.target as HTMLTextAreaElement).value })} /></label><label>Answer<textarea value={value.answer} onFocus={() => setEditing({ ...draft })} onInput={(event) => setEditing({ ...value, answer: (event.target as HTMLTextAreaElement).value })} /></label><div class="draft-actions"><button class="danger-action" onClick={() => act(draft, 'delete')}>Delete</button><button onClick={() => act(draft, 'reject')}>Discard</button>{editing?.id === draft.id && <button onClick={() => act(draft, 'save')}>Save draft</button>}<button class="primary-action" disabled={!value.question.trim() || !value.answer.trim()} onClick={() => act(draft, 'approve')}>Approve for Review</button></div></article> })}</>}{cards.length > 0 && <section class="active-cards"><div class="drafts-intro"><strong>{cards.length} approved cards</strong><span>These participate in Review until you delete them.</span></div>{cards.map((card: any) => <article><div><span class="meta">{card.topic || 'Recall'} · due {formatDate(card.due_at)}</span><h3>{card.question}</h3><p>{card.answer}</p></div><button class="danger-action" onClick={() => deleteCard(card)}>Delete</button></article>)}</section>}{status && <output class="sticky-status">{status}</output>}</div>
}

function ChangesPage() {
  const { data, error, loading, reload } = useData('/feedback/proposals')
  const [working, setWorking] = useState('')
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const proposals = data?.proposals || []
  const decide = async (proposal: any, action: 'approve' | 'reject') => {
    setWorking(proposal.id); setStatus(action === 'approve' ? 'Queueing approved change…' : 'Rejecting change…')
    try { await api(`/feedback/proposals/${proposal.id}/${action}`, { method: 'POST' }); setStatus(''); reload() }
    catch (proposalError: any) { setStatus(proposalError.message) }
    finally { setWorking('') }
  }
  if (!proposals.length) return <Empty title="No proposed changes yet" body="Hermes must list every profile or map change here before anything can be applied." />
  return <div class="proposal-list">{proposals.map((proposal: any) => <article><div class="proposal-head"><div><span class="meta">{labelize(proposal.change_type)}</span><h2>{proposal.target_label}</h2></div><span class={`state state-${proposal.status}`}>{proposal.status}</span></div><div class="proposal-diff"><div><small>Current</small><pre>{proposal.current == null ? 'Not set' : JSON.stringify(proposal.current, null, 2)}</pre></div><div><small>Proposed</small><pre>{JSON.stringify(proposal.proposed, null, 2)}</pre></div></div>{proposal.evidence && <p><strong>Evidence:</strong> {proposal.evidence}</p>}{proposal.reasoning && <p><strong>Why:</strong> {proposal.reasoning}</p>}<small>Confidence {Math.round(Number(proposal.confidence || 0) * 100)}%</small>{proposal.status === 'pending' && <div class="proposal-actions"><button disabled={working === proposal.id} onClick={() => decide(proposal, 'reject')}>Reject</button><button class="primary-action" disabled={working === proposal.id} onClick={() => decide(proposal, 'approve')}>Approve change</button></div>}</article>)}{status && <output class="sticky-status">{status}</output>}</div>
}

function artifactKind(pair: any) {
  const url = pair.metadata?.source_url || ''
  if (pair.files.length > 1) {
    if (/youtube\.com|youtu\.be/i.test(url)) return 'Video companion'
    if (/arxiv\.org/i.test(url)) return 'Paper companion'
    if (url) return 'Article companion'
    return 'Document set'
  }
  if (pair.primary.media_type?.includes('pdf')) return 'Document'
  if (pair.markdown) return 'Notes'
  return pair.metadata?.source_url ? 'Web file' : 'Uploaded file'
}

function NotebookLMPage() {
  const { data, error, loading } = useData('/notebooklm/status') as any
  const [selectedType, setSelectedType] = useState('audio')
  const [customPrompt, setCustomPrompt] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />

  const cliCommand = `python scripts/run.py generate_studio.py --type ${selectedType} --notebook-url "${data?.notebook_url || ''}"${customPrompt ? ` --prompt "${customPrompt}"` : ''}`

  return (
    <div class="notebooklm-page">
      <div class="notebooklm-hero">
        <div class="notebooklm-hero-head">
          <div class="notebooklm-title-group">
            <div class="notebooklm-badges">
              <span class="notebooklm-badge">NotebookLM Pro</span>
              <span class="notebooklm-badge success">Master Corpus Active</span>
            </div>
            <h1>{data?.name || 'Mahmood — Complete Knowledge Corpus'}</h1>
            <p>Grounded zero-hallucination source-of-truth knowledge brain for Learning Compass</p>
          </div>
          <div class="row-actions">
            <a href={data?.notebook_url} target="_blank" rel="noopener noreferrer" class="primary-action">
              Open in NotebookLM Pro ↗
            </a>
          </div>
        </div>

        <div class="notebooklm-stats-strip">
          <div>
            <span>Mastered Items</span>
            <strong>{data?.stats?.mastered_items_synced || 0}</strong>
          </div>
          <div>
            <span>Reflections</span>
            <strong>{data?.stats?.user_reflections_synced || 0}</strong>
          </div>
          <div>
            <span>Tree Nodes</span>
            <strong>{data?.stats?.taste_tree_nodes || 0}</strong>
          </div>
          <div>
            <span>Clean Sources</span>
            <strong>{data?.stats?.raw_sources_cleaned || 0}</strong>
          </div>
        </div>

        <div class="notebooklm-meta-bar">
          <div><strong>Persona Role:</strong> {data?.persona_role}</div>
          <div><strong>Verification Engine:</strong> {data?.verification_engine}</div>
          <div><strong>Sync Mode:</strong> Hermes Feedback Handoff</div>
        </div>
      </div>

      <div class="studio-workbench">
        <div>
          <h2>On-Demand Studio Generation Workbench</h2>
          <p>Select an artifact type and optional prompt focus. Hermes chat handles execution on demand.</p>
        </div>

        <div class="studio-grid">
          {data?.supported_studio_types?.map((item: any) => (
            <button
              key={item.type}
              class={`studio-tile ${selectedType === item.type ? 'active' : ''}`}
              onClick={() => setSelectedType(item.type)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>

        <div class="inline-create" style="max-width: none; border-bottom: 0; padding: 0;">
          <label>Custom Prompt Focus (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Focus on psychological buffers and empirical studies. Use blue theme."
            value={customPrompt}
            onInput={(e) => setCustomPrompt((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="cli-command-box">
          <small>Command for Hermes Chat Execution:</small>
          <code>{cliCommand}</code>
        </div>
      </div>
    </div>
  )
}

function ArtifactsPage() {
  const { data, error, loading, reload } = useData('/artifacts')
  const [working, setWorking] = useState('')
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const groups = new Map<string, any[]>()
  for (const artifact of data?.artifacts || []) {
    const legacyStem = artifact.legacy ? artifact.filename?.replace(/\.(html?|pdf)$/i, '') : ''
    const key = artifact.metadata?.pair_id || (legacyStem ? `legacy:${legacyStem}` : artifact.id)
    groups.set(key, [...(groups.get(key) || []), artifact])
  }
  const pairs = [...groups.entries()].map(([id, files]) => {
    const html = files.find((file) => file.metadata?.role === 'html' || file.media_type?.includes('html') || /\.html?$/i.test(file.filename))
    const pdf = files.find((file) => file.metadata?.role === 'pdf' || file.media_type === 'application/pdf' || /\.pdf$/i.test(file.filename))
    const markdown = files.find((file) => /markdown|text\/plain/i.test(file.media_type || '') || /\.md$/i.test(file.filename))
    const primary = html || pdf || markdown || files[0]
    const notebookUrl = files.find((file) => file.notebook_url)?.notebook_url || null
    return { id, files, html, pdf, markdown, primary, notebookUrl, metadata: primary.metadata || {} }
  })
  if (!pairs.length) return <Empty title="No files yet" body="Uploaded documents and generated reading companions will appear here." />
  const process = async (file: any) => { setWorking(file.id); setStatus('Asking Hermes to extract the full bilingual note…'); try { const result = await api<{ status: string }> (`/artifacts/${file.id}/process`, { method: 'POST' }); setStatus(result.status === 'retry' ? 'Extraction retry queued.' : 'Extraction queued.'); reload() } catch (processError: any) { setStatus(processError.message) } finally { setWorking('') } }
  const remove = async (pair: any) => {
    const files = pair.files
    if (!files.length || !window.confirm(`Remove “${pair.metadata.source_title || pair.primary.filename}” from Files?${files.length > 1 ? ` This removes all ${files.length} linked files.` : ''}`)) return
    setWorking(pair.id); setStatus('Removing…')
    try { for (const file of files) await api(file.legacy ? '/vault/delete' : `/artifacts/${file.id}`, { method: file.legacy ? 'POST' : 'DELETE', ...(file.legacy ? { body: JSON.stringify({ id: file.id }) } : {}) }); setStatus('Removed from Files.'); reload() }
    catch (removeError: any) { setStatus(removeError.message) }
    finally { setWorking('') }
  }
  const copySkill = async () => {
    const fullSkill = `---
name: lite-visual
description: Use when Mahmood says visual lite or lite visual, or explicitly requests a focused HTML and PDF visual learning companion for one real source. Mine the complete source, build a polished light editorial HTML artifact, generate its PDF companion, upload both as one linked Taste Map artifact pair, and queue structured note extraction from the HTML exactly once.
---

# Lite Visual

## Purpose

Lite Visual transforms one complete source into a paired learning artifact:

1. A self-contained interactive HTML companion.
2. A print-ready PDF companion.
3. One linked HTML and PDF artifact pair in Taste Map.
4. Exactly one structured extraction job using the HTML artifact.

“Lite” means focused delivery for one source. It does not mean shallow coverage, reduced evidence, smaller typography, or decorative simplification.

The final artifact should feel like a premium digital essay, research journal, or carefully designed magazine feature.

It must never resemble:

* an AI dashboard;
* a generic course platform;
* a SaaS interface;
* a collection of unrelated cards;
* a dark-mode application;
* a decorative landing page.

## System ownership

* \`recommendations-worker-ops\` owns API behavior, deployment, and production rules.
* \`lite-visual\` owns source retrieval, source mining, editorial planning, HTML construction, PDF generation, artifact upload, verification, and extraction handoff.
* \`learning-notes-extractor\` converts the uploaded HTML artifact into a structured D1 note and editable SRS drafts.
* \`taste-mapper\` processes later user reflections and ratings.
* \`taste-rec\` is unrelated unless the user separately asks for a recommendation.

D1 and R2 are canonical.

Obsidian is not part of this workflow except for any optional archive performed later by the extractor.

## Core principles

Always follow these principles:

1. Use the complete real source whenever it is available.
2. Do not build from a summary when the full source can be accessed.
3. Preserve claims, mechanisms, evidence, numbers, examples, limitations, and source anchors.
4. Organize by prerequisite and learning value rather than blindly copying source order.
5. Use interaction only when it teaches a relationship.
6. Keep the design editorial, restrained, readable, and light-only.
7. Reuse validated templates and components rather than redesigning everything.
8. Cache completed stages and resume from failure instead of restarting.
9. Upload exactly one linked HTML and PDF pair.
10. Process the HTML exactly once unless extraction explicitly fails.

# Execution architecture

The preferred execution command is:

\`\`\`bash
python scripts/run.py \\
  --source "$SOURCE_URL" \\
  --output-dir "/home/mahmud/visual-learn-artifacts" \\
  --mode standard \\
  --theme auto
\`\`\`

Supported modes:

* \`standard\`: process a new source completely.
* \`fast\`: reuse valid cached source analysis and rebuild only changed stages.
* \`repair\`: continue from the first incomplete or failed stage.
* \`local-only\`: create and validate HTML and PDF without attempting Taste Map publication.

Fast mode must preserve the same content standards as standard mode. It gains speed through caching and deterministic reuse, never by dropping source material.

## Required local structure

Use this structure when available:

\`\`\`text
lite-visual/
├── SKILL.md
├── scripts/
│   ├── run.py
│   ├── resolve_source.py
│   ├── extract_source.py
│   ├── build_inventory.py
│   ├── plan_sections.py
│   ├── render_html.py
│   ├── validate_html.py
│   ├── render_pdf.py
│   ├── validate_pdf.py
│   ├── publish_pair.py
│   └── verify_remote.py
├── templates/
│   └── editorial-companion.html
├── components/
│   ├── remote-navigation.js
│   ├── section-navigation.js
│   ├── recall.js
│   ├── glossary.js
│   ├── process-flow.js
│   ├── comparison-table.js
│   ├── evidence-table.js
│   └── timeline.js
├── schemas/
│   ├── source-inventory.schema.json
│   └── build-manifest.schema.json
├── references/
│   ├── editorial-rules.md
│   ├── quality-contract.md
│   └── print-friendly.md
└── cache/
\`\`\`

The skill describes the required result. Reusable scripts and components should own routine implementation details.

# Stage 1: Initialize API context

Set the API context once:

\`\`\`bash
TASTE_MAP_URL="\${TASTE_MAP_URL:-https://recommendations-worker.mhmudnasr30.workers.dev}"

AUTH=()
[[ -n "\${TASTE_MAP_API_TOKEN:-}" ]] && \\
  AUTH=(-H "x-api-token: $TASTE_MAP_API_TOKEN")
\`\`\`

Discover available operations through:

\`\`\`text
/agent/capabilities
\`\`\`

Send:

\`\`\`text
x-agent-name: lite-visual
\`\`\`

Do not deploy the Worker for source captures, artifact uploads, processing requests, or other data-only operations.

# Stage 2: Resolve and capture the source

Resolve and record:

* requested URL;
* canonical source URL;
* downloadable source URL;
* title;
* creator or authors;
* source type;
* publication date;
* latest revision date;
* source version;
* language;
* checksum;
* retrieval timestamp.

For arXiv papers, record the exact revision being used.

For YouTube sources, use \`scripts/fetch_transcript.py\` when available.

For long documents, obtain the complete source before planning the artifact.

Create or deduplicate the source in Taste Map:

\`\`\`bash
curl --fail --silent --show-error --max-time 25 \\
  -X POST "$TASTE_MAP_URL/capture" \\
  -H "Content-Type: application/json" \\
  -H "x-agent-name: lite-visual" \\
  "\${AUTH[@]}" \\
  --data-binary @/tmp/lite-visual-capture.json
\`\`\`

Store the returned source identifier as:

\`\`\`text
recommendation_id
\`\`\`

The source remains in Inbox unless another workflow explicitly promotes it.

If capture fails but the source is available locally, continue in \`local-only\` state and record the failed publication stage. Do not restart source analysis merely because the API is unavailable.

# Stage 3: Create the build manifest

Create:

\`\`\`text
<source-slug>.build.json
\`\`\`

Minimum structure:

\`\`\`json
{
  "build_id": "lite_<source-id>_<version>",
  "source": {
    "requested_url": "",
    "canonical_url": "",
    "download_url": "",
    "title": "",
    "creator": "",
    "type": "",
    "date": "",
    "revision_date": "",
    "version": "",
    "language": "",
    "checksum": ""
  },
  "design": {
    "style": "light-editorial",
    "theme_mode": "auto",
    "theme_id": "",
    "theme_version": "1.0",
    "layout_preset": "",
    "template_version": ""
  },
  "pipeline": {
    "source_downloaded": false,
    "source_indexed": false,
    "inventory_complete": false,
    "sections_planned": false,
    "html_rendered": false,
    "html_validated": false,
    "pdf_rendered": false,
    "pdf_validated": false,
    "source_captured": false,
    "html_uploaded": false,
    "pdf_uploaded": false,
    "extraction_queued": false,
    "remote_verified": false
  },
  "files": {
    "source": "",
    "inventory": "",
    "section_plan": "",
    "html": "",
    "pdf": ""
  },
  "remote": {
    "recommendation_id": null,
    "pair_id": null,
    "html_artifact_id": null,
    "pdf_artifact_id": null,
    "extraction_job_id": null
  }
}
\`\`\`

Write the manifest after every completed stage.

A repair run must inspect the manifest and continue from the first incomplete stage.

Do not repeat successful stages unless their input checksum or template version changed.

# Stage 4: Mine the complete source

Use two passes.

## Pass A: Complete indexing

Inventory the entire source before designing.

Record:

* headings and subheadings;
* page or timestamp ranges;
* figures;
* tables;
* equations;
* appendices;
* named researchers and institutions;
* named studies;
* important dates;
* quantitative claims;
* repeated concepts;
* definitions;
* source conclusions;
* source limitations.

This pass prevents important late-source material from being overlooked.

## Pass B: Deep extraction

Extract in this priority order:

1. Central mechanisms and causal chains.
2. Main arguments and conclusions.
3. Evidence supporting those claims.
4. Prerequisite concepts.
5. Counterarguments and alternatives.
6. Failed approaches and negative results.
7. Limitations and uncertainty.
8. Concrete examples and stories.
9. Supporting details.
10. Useful quotations.

Create:

\`\`\`text
<source-slug>.inventory.json
\`\`\`

The inventory must contain:

\`\`\`json
{
  "source_outline": [],
  "central_questions": [],
  "mechanisms": [],
  "arguments": [],
  "counterarguments": [],
  "claims": [],
  "evidence": [],
  "numbers": [],
  "studies": [],
  "researchers": [],
  "dates": [],
  "examples": [],
  "stories": [],
  "failed_approaches": [],
  "limitations": [],
  "quotes": [],
  "glossary": [],
  "recall_candidates": [],
  "source_anchors": []
}
\`\`\`

Every exact number, quotation, experiment, and major claim must carry a page, section, figure, table, equation, or timestamp anchor.

Do not proceed to rendering until the inventory is substantively complete.

# Stage 5: Plan the learning structure

Create:

\`\`\`text
<source-slug>.sections.json
\`\`\`

Reorder the source by comprehension and learning value.

A typical structure may include:

1. Opening thesis.
2. Why the topic matters.
3. Required concepts.
4. Main mechanism.
5. Evidence and results.
6. Comparison with alternatives.
7. Failures and limitations.
8. Practical implications.
9. Glossary.
10. Active recall.
11. Source map.

Do not force this exact structure when the source needs another one.

Each planned section should include:

\`\`\`json
{
  "id": "",
  "heading": "",
  "purpose": "",
  "section_type": "",
  "importance": "critical",
  "content_refs": [],
  "source_anchors": [],
  "component": null
}
\`\`\`

A component should be selected only when it improves understanding.

# Stage 6: Light editorial visual system

The design must be light-only.

Do not include:

* dark mode;
* a dark-mode toggle;
* dark default styling;
* dark alternate palettes;
* nearly black reading backgrounds;
* large dark panels;
* theme switching between light and dark.

The HTML and PDF must use the same light editorial identity.

## Permanent editorial characteristics

Keep these qualities consistent:

* premium long-form editorial appearance;
* strong typographic hierarchy;
* restrained opening title treatment;
* editorial serif or display type for major headings;
* highly readable body typography;
* approximately 60–75 characters per text line;
* generous whitespace around major ideas;
* clear section rhythm;
* thin rules and subtle borders;
* useful captions, footnotes, and source labels;
* restrained use of containers;
* evidence tables styled like journal tables;
* interactions integrated into the article flow;
* square or slightly rounded corners;
* visible source anchors;
* clear separation of evidence, explanation, interpretation, and recall.

Avoid:

* gradients;
* glass effects;
* glowing elements;
* oversized pills;
* giant corner radii;
* decorative card grids;
* cream or heavily yellowed backgrounds;
* excessive shadows;
* generic AI styling;
* generic SaaS styling;
* decorative side stripes;
* interaction with no teaching purpose.

## Typography

Tablet requirements:

* body size: at least 17px;
* body line-height: 1.65–1.8;
* sufficient font weight for comfortable reading;
* headings must not overpower the source content;
* tables must remain readable without zooming;
* captions may be smaller but must remain legible.

PDF requirements:

* body text must be at least 12.5pt-equivalent;
* important labels and captions must remain readable;
* text must print clearly in color and grayscale.

Use local or system-safe fonts. Do not depend on external font downloads.

# Stage 7: Rotating light editorial palettes

Colors should vary between artifacts so the visual experience remains fresh.

The variation must remain within one coherent editorial family.

Do not choose arbitrary random colors.

Select the palette deterministically using the canonical source checksum:

\`\`\`python
theme_index = int(source_checksum[:8], 16) % len(EDITORIAL_THEMES)
selected_theme = EDITORIAL_THEMES[theme_index]
\`\`\`

This ensures:

* different sources receive different visual identities;
* rebuilding the same source preserves its identity;
* HTML and PDF remain visually matched;
* repair runs do not unexpectedly change color;
* variety does not create inconsistency.

Support:

\`\`\`bash
--theme auto
\`\`\`

and explicit overrides such as:

\`\`\`bash
--theme oxblood
\`\`\`

## Curated palette registry

### Oxblood Journal

\`\`\`css
--page: #f3f0ec;
--surface: #fffdfb;
--surface-soft: #ebe5df;
--text: #211c19;
--muted: #6b615b;
--rule: #d1c7bf;
--accent: #8d292d;
--accent-secondary: #9e593a;
--evidence: #765b21;
--mark: #eee0d5;
\`\`\`

### Deep Ocean Review

\`\`\`css
--page: #edf2f2;
--surface: #fcfefe;
--surface-soft: #dde8e8;
--text: #172326;
--muted: #5e7074;
--rule: #c5d2d3;
--accent: #226f79;
--accent-secondary: #477b70;
--evidence: #765f23;
--mark: #dceceb;
\`\`\`

### Forest Archive

\`\`\`css
--page: #eff2ec;
--surface: #fdfefa;
--surface-soft: #e1e8dd;
--text: #20261e;
--muted: #657064;
--rule: #cbd4c8;
--accent: #4d7447;
--accent-secondary: #79683d;
--evidence: #73591e;
--mark: #e3eadc;
\`\`\`

### Violet Quarterly

\`\`\`css
--page: #f1eef4;
--surface: #fefcfe;
--surface-soft: #e7dfeb;
--text: #281f2c;
--muted: #706377;
--rule: #d5cadb;
--accent: #6f4c7e;
--accent-secondary: #8c5d52;
--evidence: #765c22;
--mark: #ebe0ed;
\`\`\`

### Cobalt Dispatch

\`\`\`css
--page: #edf1f6;
--surface: #fdfefe;
--surface-soft: #dfe6ef;
--text: #1c2431;
--muted: #647084;
--rule: #cbd3df;
--accent: #315f9f;
--accent-secondary: #557585;
--evidence: #74591f;
--mark: #dfe7f3;
\`\`\`

### Rust Monograph

\`\`\`css
--page: #f3eee9;
--surface: #fffdfa;
--surface-soft: #e9ded5;
--text: #281f1a;
--muted: #72645a;
--rule: #d7cbc1;
--accent: #9b482b;
--accent-secondary: #78643f;
--evidence: #775919;
--mark: #eee0d5;
\`\`\`

### Slate Research

\`\`\`css
--page: #eff1f2;
--surface: #ffffff;
--surface-soft: #e1e5e7;
--text: #22282b;
--muted: #687176;
--rule: #cfd5d8;
--accent: #536c79;
--accent-secondary: #746250;
--evidence: #70591f;
--mark: #e1e7e9;
\`\`\`

### Teal Essay

\`\`\`css
--page: #edf3f0;
--surface: #fcfefd;
--surface-soft: #dce9e4;
--text: #192522;
--muted: #60736d;
--rule: #c8d6d1;
--accent: #287466;
--accent-secondary: #746447;
--evidence: #735a1d;
--mark: #dcebe5;
\`\`\`

## Palette constraints

Every palette must satisfy:

* WCAG AA contrast for body text;
* readable muted text;
* accessible link and control contrast;
* no reliance on color alone;
* clear grayscale printing;
* no more than two dominant accent colors;
* accent coverage below approximately 10% of the visible page;
* white or near-white reading surfaces;
* no dark full-width sections.

# Stage 8: Controlled layout variation

To reduce boredom, rotate restrained editorial presets alongside the palette.

Allowed variations:

* chapter numerals versus small section labels;
* top rule versus bottom rule beneath headings;
* left-aligned versus centered opening title;
* margin note versus inline source note;
* serif pull quote versus restrained sans-serif pull quote;
* compact versus spacious evidence table;
* numbered versus titled section navigation;
* alternate figure-caption treatments.

Use only tested presets.

Choose the preset deterministically from the source checksum and record it in the manifest.

Do not invent a completely new layout during every run.

A repair run must preserve the recorded theme and layout preset.

A different theme may be selected only when:

* explicitly requested;
* \`--refresh-theme\` is provided;
* the template version intentionally requires migration.

# Stage 9: Build the HTML

Write:

\`\`\`text
/home/mahmud/visual-learn-artifacts/<source-slug>.html
\`\`\`

Requirements:

* begin with \`<!DOCTYPE html>\`;
* self-contained;
* offline-capable;
* no CDN JavaScript;
* no external runtime dependency;
* light editorial design only;
* comfortable tablet reading;
* responsive from mobile to desktop;
* keyboard and remote section navigation;
* reduced-motion fallback;
* semantic heading hierarchy;
* visible focus states;
* accessible form and control labels;
* print button;
* A4 print CSS;
* source anchors on substantive claims;
* glossary when useful;
* active recall when useful;
* diagrams only when they clarify relationships;
* no console errors.

Embed the shared \`remote-navigation.js\` instead of rewriting navigation for each artifact.

Use shared components for:

* mechanism flows;
* comparisons;
* evidence tables;
* timelines;
* glossary reveals;
* active recall;
* source maps.

Custom JavaScript is permitted only when existing components cannot clearly teach the source relationship.

# Stage 10: Validate the HTML

Automated validation must check:

## Structural checks

* valid doctype;
* one primary \`<main>\`;
* valid heading order;
* no duplicate element IDs;
* no broken local references;
* no missing required metadata;
* no external JavaScript;
* no inaccessible controls.

## Content checks

* all high-importance inventory items appear;
* exact numbers retain context;
* quotations retain anchors;
* named experiments retain anchors;
* limitations are not omitted;
* failed approaches are not presented as successful;
* interpretation is distinguished from source claims;
* no unsupported factual claims are introduced.

## Browser checks

Open locally and verify:

* no console errors;
* no horizontal overflow;
* keyboard navigation works;
* recall controls work;
* glossary interactions work;
* print button works;
* reduced-motion rules apply;
* all content remains visible without JavaScript where practical.

## Responsive screenshots

Render at:

\`\`\`text
390 × 844
768 × 1024
1024 × 768
1440 × 900
\`\`\`

Check:

* clipped text;
* overlapping elements;
* unreadable columns;
* viewport overflow;
* controls outside the page;
* tables that require unreasonable horizontal scrolling;
* broken title or figure layouts.

# Stage 11: Generate the PDF

Generate from the validated local HTML:

\`\`\`bash
google-chrome \\
  --headless=new \\
  --no-pdf-header-footer \\
  --disable-gpu \\
  --print-to-pdf="/home/mahmud/visual-learn-artifacts/<source-slug>.pdf" \\
  "/home/mahmud/visual-learn-artifacts/<source-slug>.html"
\`\`\`

The PDF must preserve the same light palette and editorial identity as the HTML.

Interactive sections must receive meaningful print equivalents.

For example:

* hidden recall answers should print in a separate answer section;
* interactive comparisons should print as complete static comparisons;
* collapsible glossary items should print expanded;
* process controls should print as a clearly labeled static diagram.

# Stage 12: Validate the PDF

Automated checks:

* file exists;
* page count is greater than zero;
* no blank trailing pages;
* no clipped headings;
* no horizontal clipping;
* no missing sections;
* body text meets the minimum print size;
* source anchors remain visible;
* tables remain readable;
* URLs or embedded links remain usable where supported.

Visually inspect at minimum:

1. First page.
2. One dense middle page.
3. One page containing a table.
4. One page containing a diagram.
5. One page containing active recall or glossary content.
6. Final page.

Do not approve the PDF when body text is too small, too pale, clipped, or awkwardly split.

# Stage 13: Upload one artifact pair

Generate one stable pair ID and store it before upload.

Preferred form:

\`\`\`text
lite_<recommendation_id>
\`\`\`

Fallback when capture is temporarily unavailable:

\`\`\`text
lite_<source-checksum-prefix>
\`\`\`

Upload HTML and PDF separately with identical pair and source metadata.

HTML:

\`\`\`bash
curl --fail --silent --show-error --max-time 60 \\
  -X POST "$TASTE_MAP_URL/artifacts" \\
  -H "x-agent-name: lite-visual" \\
  "\${AUTH[@]}" \\
  -F "file=@<source-slug>.html;type=text/html" \\
  -F "pair_id=$PAIR_ID" \\
  -F "role=html" \\
  -F "recommendation_id=$RECOMMENDATION_ID" \\
  -F "source_url=$SOURCE_URL" \\
  -F "source_title=$SOURCE_TITLE" \\
  -F "generator=lite-visual"
\`\`\`

PDF:

\`\`\`bash
curl --fail --silent --show-error --max-time 60 \\
  -X POST "$TASTE_MAP_URL/artifacts" \\
  -H "x-agent-name: lite-visual" \\
  "\${AUTH[@]}" \\
  -F "file=@<source-slug>.pdf;type=application/pdf" \\
  -F "pair_id=$PAIR_ID" \\
  -F "role=pdf" \\
  -F "recommendation_id=$RECOMMENDATION_ID" \\
  -F "source_url=$SOURCE_URL" \\
  -F "source_title=$SOURCE_TITLE" \\
  -F "generator=lite-visual"
\`\`\`

Save:

* HTML artifact ID;
* PDF artifact ID;
* pair ID.

Do not use legacy \`/html/upload\`.

Do not create unrelated artifact rows without a shared pair ID.

Do not link the recommendation to an internal artifact URL instead of the real source URL.

# Stage 14: Queue extraction once

Queue exactly one extraction job using the HTML artifact:

\`\`\`bash
curl --fail --silent --show-error --max-time 25 \\
  -X POST "$TASTE_MAP_URL/artifacts/$HTML_ARTIFACT_ID/process" \\
  -H "Content-Type: application/json" \\
  -H "x-agent-name: lite-visual" \\
  "\${AUTH[@]}" \\
  --data "{
    \"recommendation_id\":\"$RECOMMENDATION_ID\",
    \"source_url\":\"$SOURCE_URL\"
  }"
\`\`\`

Do not process the PDF.

Do not queue the HTML twice.

Repeat processing only when the previous extraction job explicitly failed.

Do not claim the structured note is ready merely because a job was queued.

# Stage 15: Verify remote state

Verify:

* the source appears in \`/capture\`;
* exactly two relevant artifacts exist;
* both artifacts share the same pair ID;
* one has role \`html\`;
* one has role \`pdf\`;
* the source metadata matches;
* the extraction job exists;
* no duplicate extraction job was created;
* no Worker deployment occurred.

Use:

\`\`\`text
GET /artifacts
GET /agent/jobs
GET /capture
\`\`\`

If publication fails after local files have passed validation, write:

\`\`\`text
<source-slug>.pending-upload.json
\`\`\`

The repair run must reuse the existing source, inventory, HTML, PDF, theme, layout preset, and pair ID.

It should retry only the incomplete publication stages.

# Caching and speed rules

Before every stage, compare:

* source checksum;
* inventory checksum;
* section-plan checksum;
* template version;
* component version;
* HTML checksum;
* PDF checksum.

Skip a stage when its inputs and validated output have not changed.

Examples:

\`\`\`text
Source unchanged + inventory valid
→ skip source mining

Inventory unchanged + template unchanged
→ reuse HTML

HTML unchanged + PDF valid
→ skip PDF generation

Local artifacts valid + upload incomplete
→ retry publication only

HTML uploaded + PDF uploaded + extraction not queued
→ queue extraction only
\`\`\`

Do not sacrifice quality to gain speed.

Speed should come from:

* cached source retrieval;
* reusable inventory;
* shared components;
* deterministic themes;
* automated validation;
* resumable publication;
* parallel execution of independent checks.

# Parallel execution

Safe operations may run in parallel.

After source resolution:

* local source download;
* capture request;
* artifact directory preparation.

After HTML generation:

* structural validation;
* console validation;
* responsive screenshots;
* content coverage checks.

After HTML and PDF validation:

* HTML upload;
* PDF upload.

Do not parallelize content decisions that depend on unfinished source analysis.

# Completion response

Report:

* source title;
* source version or revision;
* selected palette;
* selected layout preset;
* HTML local file;
* PDF local file;
* HTML artifact ID;
* PDF artifact ID;
* pair ID;
* source capture state;
* extraction-job state;
* remote verification state.

Use exact status language:

* \`complete\`;
* \`queued\`;
* \`pending\`;
* \`failed\`;
* \`local-only\`;
* \`not attempted\`.

Do not claim the note is ready until extraction finishes successfully.

If the request came through Telegram, send both files using:

\`\`\`text
MEDIA:/absolute/path
\`\`\`

# Non-negotiable failures to avoid

Never:

* build from a summary when the full source is available;
* omit important limitations to make the artifact shorter;
* use dark mode or dark reading surfaces;
* add meaningless visual interactions;
* produce card soup;
* use legacy HTML Vault upload;
* create two artifacts without the same pair ID;
* process both HTML and PDF;
* queue duplicate extraction jobs;
* deploy the Worker for data-only writes;
* restart the entire build after an upload failure;
* change palette during a repair run;
* invent artifact IDs or claim unverified completion;
* reduce typography below comfortable reading size;
* drop substantive source content to meet an arbitrary file-size target.`

    try {
      await navigator.clipboard.writeText(fullSkill)
      setStatus('Copied full Lite Visual skill definition to clipboard!')
      setTimeout(() => setStatus(''), 3000)
    } catch {
      setStatus('Failed to copy to clipboard')
    }
  }

  return <div class="artifact-library">
    <div class="artifact-library-head">
      <div>
        <strong>{pairs.length} {pairs.length === 1 ? 'source' : 'sources'}</strong>
        <span>Reading files and companions stay together.</span>
      </div>
      <button type="button" class="copy-skill-btn" onClick={copySkill}>
        Copy skill prompt
      </button>
    </div>
    <div class="artifact-table">{pairs.map((pair) => {
      const title = pair.metadata.source_title || pair.primary.filename?.replace(/\.(html?|pdf|md)$/i, '') || 'Untitled file'
      const href = (file: any) => file.legacy ? `/html/download/${file.id}` : /markdown|text\/plain/i.test(file.media_type || '') || /\.md$/i.test(file.filename || '') ? `/artifacts/${file.id}/view` : `/artifacts/${file.id}`
      const extraction = pair.html?.extraction
      return <article><div class="artifact-kind"><span>{artifactKind(pair)}</span><small>{formatDate(pair.primary.created_at)}</small></div><div class="artifact-copy"><h3>{title}</h3><p>{pair.metadata.source_url || `${pair.files.length} ${pair.files.length === 1 ? 'file' : 'linked files'}`}</p>{extraction && <small class={`artifact-extraction state-${extraction.status}`}>{extraction.status === 'failed' ? extraction.error || 'Extraction failed' : `Extraction ${extraction.status}`}</small>}</div><div class="artifact-actions">{pair.metadata.source_url && <a href={pair.metadata.source_url} target="_blank" rel="noreferrer">Original</a>}{pair.html && <a class="primary-action" href={href(pair.html)} target="_blank" rel="noreferrer">Read</a>}{pair.markdown && !pair.html && <a class="primary-action" href={href(pair.markdown)} target="_blank" rel="noreferrer">Read</a>}{pair.pdf && <a href={href(pair.pdf)} target="_blank" rel="noreferrer">PDF</a>}{pair.html && extraction?.status !== 'completed' && <button disabled={working === pair.html.id} onClick={() => process(pair.html)}>{extraction?.status === 'failed' ? 'Retry extraction' : 'Extract notes'}</button>}{pair.notebookUrl && <a class="nblm-link" href={pair.notebookUrl} target="_blank" rel="noreferrer">NBLM</a>}{pair.files.length > 0 && <button class="artifact-remove" disabled={working === pair.id} onClick={() => remove(pair)}>Remove</button>}</div></article>
    })}</div>{status && <output class="sticky-status">{status}</output>}
  </div>
}

function JournalPage() {
  const { data, error, loading } = useData('/learning/update-log?limit=100')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const events = data?.events || []
  if (!events.length) return <Empty title="No learning history yet" body="Completed sessions, ratings, notes, and map changes will form a timeline here." />
  return <div class="timeline">{events.map((event: any) => <article><time>{formatDate(event.ts)}</time><div><span class="meta">{labelize(event.kind || 'update')}</span><h2>{event.summary || 'Learning updated'}</h2></div></article>)}</div>
}

function BranchesPage() {
  const { data, error, loading } = useData('/brain/tree?limit=500')
  const [query, setQuery] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const nodes = (data?.nodes || []).filter((node: any) => !query || `${node.label} ${node.super_category}`.toLowerCase().includes(query.toLowerCase()))
  const groups = new Map<string, any[]>()
  for (const node of nodes) groups.set(node.super_category || 'Uncategorized', [...(groups.get(node.super_category || 'Uncategorized') || []), node])
  return <div class="branches-page"><label class="page-search">Search branches<input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Topic or domain" /></label>{groups.size ? [...groups].map(([group, items]) => <section class="branch-group"><div class="section-head"><h2>{group}</h2><span>{items.length} nodes</span></div><div>{items.map((node) => <article><span class="node-depth">{node.type}</span><strong>{node.label || node.id}</strong><span class={`state state-${node.status || 'active'}`}>{node.status || 'active'}</span></article>)}</div></section>) : <Empty title="No matching branches" body="Try a broader search." />}</div>
}

function CoveragePage({ insight = false }: { insight?: boolean }) {
  const health = useData('/learning/health')
  const gaps = useData('/learning/gaps')
  const blind = useData('/knowledge/blind-spots')
  if (health.loading || gaps.loading || blind.loading) return <Loading />
  if (health.error || gaps.error || blind.error) return <ErrorState message={health.error || gaps.error || blind.error} />
  const branches = health.data?.health || []
  const uncovered = blind.data?.blind_spots || []
  const weak = gaps.data?.gaps || []
  return <div class="coverage-page"><div class="summary-strip"><div><strong>{health.data?.healthy || 0}</strong><span>Healthy</span></div><div><strong>{branches.filter((item: any) => item.health === 'growing').length}</strong><span>Growing</span></div><div><strong>{health.data?.neglected || 0}</strong><span>Neglected</span></div><div><strong>{uncovered.length}</strong><span>Uncovered</span></div></div><section><div class="section-head"><h2>{insight ? 'Branch health' : 'Coverage by branch'}</h2><span>{branches.length} tracked</span></div>{branches.length ? <div class="health-table">{branches.map((item: any) => <article><div><strong>{item.branch || 'Unmapped'}</strong><span>{item.consumed || 0} completed of {item.total || 0}</span></div><span class={`state state-${item.health}`}>{item.health}</span></article>)}</div> : <Empty title="No branch activity yet" body="Completed sources will reveal which areas are growing or neglected." />}</section>{(weak.length > 0 || uncovered.length > 0) && <section><div class="section-head"><h2>Needs attention</h2><span>{weak.length + uncovered.length} areas</span></div><div class="compact-list">{[...weak, ...uncovered].slice(0, 80).map((item: any) => <article><strong>{item.topic || item.label || item.branch || 'Unmapped area'}</strong><span>{item.reason || item.status || 'No completed source yet'}</span></article>)}</div></section>}</div>
}

function TastePage({ insight = false }: { insight?: boolean }) {
  const dna = useData('/taste/dna')
  const creators = useData('/analytics/creator-trust')
  const drift = useData('/analytics/taste-drift')
  if (dna.loading || creators.loading || drift.loading) return <Loading />
  if (dna.error || creators.error || drift.error) return <ErrorState message={dna.error || creators.error || drift.error} />
  const vectors = dna.data?.vectors || []
  const people = creators.data?.creators || []
  const events = drift.data?.events || []
  return <div class="taste-page"><div class="summary-strip"><div><strong>{dna.data?.interest || 0}</strong><span>Active interests</span></div><div><strong>{dna.data?.diversity || 0}</strong><span>Source formats</span></div><div><strong>{dna.data?.momentum || 0}</strong><span>Recently active</span></div><div><strong>{people.length}</strong><span>Rated creators</span></div></div><div class="two-column-data"><section><div class="section-head"><h2>Topic affinity</h2><span>{vectors.length} topics</span></div>{vectors.length ? <div class="rank-list">{vectors.map((item: any) => <article><div><strong>{item.topic}</strong><span>{item.consumption_count || 0} completed</span></div><meter min="-10" max="10" value={Number(item.decayed_affinity ?? item.affinity_score ?? 0)} /></article>)}</div> : <Empty title="No taste signals yet" body="Ratings and completed sources will shape this view." />}</section><section><div class="section-head"><h2>Creator performance</h2><span>From your ratings</span></div>{people.length ? <div class="rank-list">{people.map((item: any) => <article><div><strong>{item.creator}</strong><span>{item.total} completed · {item.average_score || '—'} average</span></div><strong>{item.trust_index}</strong></article>)}</div> : <Empty title="No rated creators yet" body="Creator patterns appear after you rate completed sources." />}</section></div>{insight && events.length > 0 && <section><div class="section-head"><h2>Preference changes</h2><span>{events.length} monthly signals</span></div><div class="compact-list">{events.slice(-36).reverse().map((item: any) => <article><strong>{item.branch || 'Unmapped'}</strong><span>{item.month} · {item.average_score || '—'} average from {item.count} ratings</span></article>)}</div></section>}</div>
}

function InsightsOverviewPage() {
  const { data, error, loading } = useData('/stats')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const statuses = Object.entries(data?.byStatus || {})
  return <div class="insights-overview"><div class="summary-strip"><div><strong>{data?.total || 0}</strong><span>All sources</span></div>{statuses.slice(0, 3).map(([label, value]) => <div><strong>{String(value)}</strong><span>{labelize(label)}</span></div>)}</div><div class="two-column-data"><section><div class="section-head"><h2>Recently completed</h2><span>{data?.recentConsumed?.length || 0}</span></div>{data?.recentConsumed?.length ? <div class="compact-list">{data.recentConsumed.map((item: any) => <article><strong>{item.video_title}</strong><span>{item.creator || 'Unknown creator'} · {item.user_rating || 'unrated'}</span></article>)}</div> : <Empty title="Nothing completed yet" body="Finished sources will appear here with ratings and reactions." />}</section><section><div class="section-head"><h2>Top creators</h2><span>By source count</span></div>{data?.topCreators?.length ? <div class="rank-list">{data.topCreators.map((item: any) => <article><strong>{item.creator}</strong><span>{item.c} sources</span></article>)}</div> : <Empty title="No creator history yet" body="Creator patterns appear as your library grows." />}</section></div>{data?.allEntries?.length > 0 && <section><div class="section-head"><h2>Library snapshot</h2><span>Latest {data.allEntries.length}</span></div><div class="compact-list">{data.allEntries.slice().reverse().slice(0, 50).map((item: any) => <article><strong>{item.video_title}</strong><span>{item.status} · {item.content_type || 'source'} · {item.creator || 'Unknown'}</span></article>)}</div></section>}</div>
}

function ForecastPage() {
  const { data, error, loading } = useData('/analytics/forecast')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  return <div class="forecast-page"><div class="summary-strip"><div><strong>{data?.due_next_7_days || 0}</strong><span>Due in 7 days</span></div><div><strong>{data?.due_next_30_days || 0}</strong><span>Due in 30 days</span></div><div><strong>{data?.total_cards || 0}</strong><span>Recall cards</span></div><div><strong>{data?.mapped_topics || 0}</strong><span>Mapped topics</span></div></div><section class="forecast-guidance"><h2>{data?.due_next_7_days ? 'A review wave is approaching.' : 'Your near-term review load is clear.'}</h2><p>{data?.due_next_7_days ? `Plan for ${data.due_next_7_days} recall prompts over the next seven days.` : 'New reviews will appear after strong learning sessions create and approve recall prompts.'}</p></section></div>
}

function SettingsPage({ route }: { route: Destination }) {
  const [theme, setTheme] = useState(localStorage.getItem('tm-theme') || 'system')
  const [density, setDensity] = useState(localStorage.getItem('tm-density') || 'balanced')
  const [retention, setRetention] = useState(90)
  const [enrichCapture, setEnrichCapture] = useState(true)
  const [saved, setSaved] = useState('')
  const profile = useData(route.slug === 'profile' ? '/brain/profile' : undefined)
  const settings = useData('/settings')
  useEffect(() => {
    const resolved = settings.data?.resolved
    if (!resolved) return
    setTheme(resolved.appearance.theme); setDensity(resolved.appearance.density)
    setRetention(resolved.learning.retention)
    setEnrichCapture(resolved.ai_curation.enrich_capture)
    localStorage.setItem('tm-theme', resolved.appearance.theme); localStorage.setItem('tm-density', resolved.appearance.density)
    applyTheme(resolved.appearance.theme); document.documentElement.dataset.density = resolved.appearance.density
  }, [settings.data?.resolved])
  const persist = async (key: string, value: unknown) => { setSaved('Saving…'); try { await api(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }); setSaved('Saved'); setTimeout(() => setSaved(''), 1400) } catch (error: any) { setSaved(error.message) } }
  const changeTheme = (value: string) => { setTheme(value); localStorage.setItem('tm-theme', value); applyTheme(value); persist('appearance', { theme: value, density }) }
  const changeDensity = (value: string) => { setDensity(value); localStorage.setItem('tm-density', value); document.documentElement.dataset.density = value; persist('appearance', { theme, density: value }) }
  return <div class="settings-page"><section><h2>{route.title}</h2><p>{route.purpose}</p>
    {route.slug === 'profile' && <>{profile.loading ? <Loading /> : profile.error ? <ErrorState message={profile.error} /> : <div class="profile-dashboard">
      <div class="setting-row"><div><strong>Identity & matrix</strong><span>Personal background, location, and hardware setup.</span></div><span class="setting-value">{profile.data?.profile?.identity_json || 'Not set'}</span></div>
      <div class="setting-row"><div><strong>Core curation filter</strong><span>Primary criteria required for new content.</span></div><span class="setting-value">{profile.data?.profile?.core_filter || 'Not set'}</span></div>
      <div class="setting-row"><div><strong>Quality & verification rules</strong><span>Source verification protocol and content boundaries.</span></div><span class="setting-value">{profile.data?.profile?.quality_rules_json || 'Not set'}</span></div>
      <div class="setting-row"><div><strong>Operational style</strong><span>Interaction preference and communication rules.</span></div><span class="setting-value">{profile.data?.profile?.operational_style_json || 'Not set'}</span></div>
      <div class="setting-row"><div><strong>Recent signal</strong><span>Latest approved learning signal and updates.</span></div><span class="setting-value">{profile.data?.profile?.recent_signal || 'No recent signal'}</span></div>

      <div class="setting-section"><div class="section-head"><h3>Mega priority topics</h3><span>{(profile.data?.profile?.mega_priority_json ? JSON.parse(profile.data.profile.mega_priority_json).length : 0)}</span></div><p class="setting-value">{profile.data?.profile?.mega_priority_json || '[]'}</p></div>

      <div class="setting-section"><div class="section-head"><h3>Priorities</h3><span>{profile.data?.priorities?.length || 0}</span></div><div class="compact-list">{(profile.data?.priorities || []).map((item: any) => <article><strong>{item.label || item.topic || item.id}</strong><span>Rank {item.rank}</span></article>)}</div></div>

      <div class="setting-section"><div class="section-head"><h3>Mastered knowledge & frameworks</h3><span>{profile.data?.mastered?.length || 0}</span></div>{profile.data?.mastered?.length ? <div class="compact-list">{profile.data.mastered.map((item: any) => <article><strong>{item.label || item.id}</strong><span>{item.author ? `by ${item.author}` : 'Mastered'} • {item.rating || '10/10'}</span></article>)}</div> : <p>No mastered topics recorded.</p>}</div>

      <div class="setting-section"><div class="section-head"><h3>Excluded creators and works</h3><span>{profile.data?.blacklist?.length || 0}</span></div>{profile.data?.blacklist?.length ? <div class="compact-list">{profile.data.blacklist.map((item: any) => <article><strong>{item.name || item.id} {item.work ? `(${item.work})` : ''}</strong><span>{item.reason || `Severity ${item.severity}`}</span></article>)}</div> : <p>No exclusions recorded.</p>}</div>

      <div class="setting-section"><div class="section-head"><h3>Learning patterns & heuristics</h3><span>{profile.data?.patterns?.length || 0}</span></div>{profile.data?.patterns?.length ? <div class="compact-list">{profile.data.patterns.map((item: any) => <article><strong>{item.description || item.id}</strong><span>{item.strength}</span></article>)}</div> : <p>No confirmed patterns yet.</p>}</div>

      <div class="setting-section"><div class="section-head"><h3>Monitored RSS feeds & strategic news</h3><span>{profile.data?.feed_sources?.length || 0}</span></div>{profile.data?.feed_sources?.length ? <div class="compact-list">{profile.data.feed_sources.map((item: any) => <article><strong>{item.title}</strong><span>{item.is_active ? 'Active' : 'Paused'} • {item.site_url || item.feed_url}</span></article>)}</div> : <p>No active feed sources.</p>}</div>

      <div class="setting-section"><div class="section-head"><h3>Top creators & content sources</h3><span>{profile.data?.creator_trust?.length || 0}</span></div>{profile.data?.creator_trust?.length ? <div class="compact-list">{profile.data.creator_trust.map((item: any) => <article><strong>{item.creator}</strong><span>{item.count} items consumed</span></article>)}</div> : <p>No creator stats available.</p>}</div>

      <div class="setting-section"><div class="section-head"><h3>Learning session & recall metrics</h3><span>Active</span></div><div class="compact-list">
        <article><strong>Total sessions</strong><span>{profile.data?.activity_stats?.total_sessions || 0}</span></article>
        <article><strong>Reflections recorded</strong><span>{profile.data?.activity_stats?.reflections_count || 0}</span></article>
        <article><strong>Structured notes</strong><span>{profile.data?.activity_stats?.total_notes || 0}</span></article>
        <article><strong>Active SRS cards</strong><span>{profile.data?.srs_stats?.active_cards || 0}</span></article>
        <article><strong>Pending SRS drafts</strong><span>{profile.data?.srs_stats?.pending_drafts || 0}</span></article>
      </div></div>

      <div class="setting-section"><div class="section-head"><h3>Cloudflare & infrastructure state</h3><span>{profile.data?.infrastructure_stats?.database_name || 'D1'}</span></div><div class="compact-list">
        <article><strong>Database</strong><span>recommendations-db (D1)</span></article>
        <article><strong>Artifacts stored</strong><span>{profile.data?.infrastructure_stats?.artifacts_count || 0} (R2)</span></article>
        <article><strong>Pending proposals</strong><span>{profile.data?.infrastructure_stats?.pending_proposals_count || 0}</span></article>
        <article><strong>Environment</strong><span>{profile.data?.infrastructure_stats?.worker_environment || 'production'}</span></article>
      </div></div>
    </div>}</>}
    {route.slug === 'appearance' && <><div class="setting-row"><div><strong>Theme</strong><span>Follow the device unless you choose an override.</span></div><select value={theme} onChange={(event) => changeTheme((event.target as HTMLSelectElement).value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="setting-row"><div><strong>Density</strong><span>Balanced for daily use; compact when managing large libraries.</span></div><select value={density} onChange={(event) => changeDensity((event.target as HTMLSelectElement).value)}><option value="balanced">Balanced</option><option value="compact">Compact</option></select></div></>}
    {route.slug === 'learning' && <><div class="setting-row"><div><strong>Active queue</strong><span>Five deliberate items; Inbox remains unlimited.</span></div><span class="setting-value">5 slots</span></div><label class="setting-row"><div><strong>Review target</strong><span>Used to adjust future recall intervals.</span></div><select value={retention} onChange={(event) => { const value = Number((event.target as HTMLSelectElement).value); setRetention(value); persist('learning', { retention: value, queue_cap: 5 }) }}><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option></select></label><div class="setting-row"><div><strong>Rating 7+ notes and cards</strong><span>Notes Extractor always runs after a completed rating of 7 or higher.</span></div><span class="setting-value">Automatic</span></div></>}
    {route.slug === 'curation' && <><label class="setting-row"><div><strong>Enrich new captures</strong><span>Queue enrichment only when enabled.</span></div><input type="checkbox" checked={enrichCapture} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setEnrichCapture(enabled); persist('ai_curation', { enrich_capture: enabled }) }} /></label><div class="setting-row"><div><strong>Hermes change confirmation</strong><span>Every taste, profile, pattern, and map change requires approval.</span></div><span class="setting-value">Required</span></div><div class="setting-row"><div><strong>Automatic recommendations</strong><span>Finishing one source does not automatically add another.</span></div><span class="setting-value">Off</span></div></>}
    {route.slug === 'data' && <><div class="setting-row"><div><strong>Cloud library</strong><span>Your sources, notes, ratings, map, and files are available.</span></div><span class="status">Connected</span></div><div class="setting-row"><div><strong>Offline changes</strong><span>Send changes saved while this device was disconnected.</span></div><button class="secondary-action" onClick={() => flushOfflineMutations().then(() => setSaved('All offline changes synced'))}>Sync now</button></div><div class="setting-row"><div><strong>Export source library</strong><span>Download your recommendation history as a portable file.</span></div><a class="secondary-action" href="/recommendations/export">Download export</a></div><div class="setting-row"><div><strong>Saved preferences</strong><span>{Object.keys(settings.data?.settings || {}).length} preference groups stored.</span></div><span class="setting-value">{settings.error ? 'Unavailable' : 'Up to date'}</span></div></>}
    {saved && <output class="settings-status">{saved}</output>}
  </section></div>
}

function View({ route }: { route: Destination }) {
  if (route.key === 'today.briefing') return <TodayPage />
  if (route.key === 'curate.inbox') return <InboxPage />
  if (route.key === 'curate.queue') return <QueuePage />
  if (route.key === 'curate.discovery') return <Suspense fallback={<div class="empty-state">Loading Discovery Engine…</div>}><DiscoveryPage /></Suspense>
  if (route.key === 'curate.collections') return <CollectionsPage scope="curate" />
  if (route.key === 'curate.resurfacing') return <ResurfacingPage />
  if (route.key === 'curate.contradictions') return <ContradictionsPage />
  if (route.key === 'curate.archive') return <ArchivePage />
  if (route.key === 'map.atlas') return <Suspense fallback={<div class="atlas-loading"><div /><span>Preparing spatial canvas…</span></div>}><AtlasPage /></Suspense>
  if (route.key === 'map.branches') return <BranchesPage />
  if (route.key === 'map.coverage') return <CoveragePage />
  if (route.key === 'map.taste') return <TastePage />
  if (route.key === 'learn.files') return <ArtifactsPage />
  if (route.key === 'learn.notebooklm') return <NotebookLMPage />
  if (route.key === 'learn.reflections') return <NotesPage kind="reflection" />
  if (route.key === 'learn.notes') return <NotesPage kind="source" />
  if (route.key === 'learn.cards') return <CardsPage />
  if (route.key === 'learn.review') return <ReviewPage />
  if (route.key === 'learn.changes') return <ChangesPage />
  if (route.key === 'learn.journal') return <JournalPage />
  if (route.key === 'insights.overview') return <InsightsOverviewPage />
  if (route.key === 'insights.learning') return <CoveragePage insight />
  if (route.key === 'insights.taste') return <TastePage insight />
  if (route.key === 'insights.forecast') return <ForecastPage />
  if (route.workspace === 'settings') return <SettingsPage route={route} />
  return <Empty title="View unavailable" body="This destination is not part of the current workspace." />
}

function CaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [artifactId, setArtifactId] = useState('')
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  const submit = async (event?: Event) => { event?.preventDefault(); setStatus('Capturing…'); try { let uploadedId = artifactId; if (file && !uploadedId) { const form = new FormData(); form.append('file', file); const response = await fetch('/artifacts', { method: 'POST', body: form }); const uploaded = await response.json() as { id?: string; error?: string }; if (!response.ok || !uploaded.id) throw new Error(uploaded.error || 'Upload failed'); uploadedId = uploaded.id; setArtifactId(uploadedId) } const result = await api<any>('/capture', { method: 'POST', body: JSON.stringify({ source: file?.name || source, artifact_id: uploadedId || undefined }) }); setStatus(result.duplicate ? 'Already captured — opened the existing item.' : 'Captured to Inbox for triage.'); setSource(''); setFile(null); setArtifactId('') } catch (error: any) { if (!navigator.onLine && !file) { await queueOfflineMutation('/capture', { method: 'POST', body: JSON.stringify({ source }) }); setStatus('Saved offline. It will sync when you reconnect.') } else setStatus(error.message) } }
  return <dialog ref={ref} class="capture-dialog" onClose={onClose}><form onSubmit={submit}><div class="dialog-head"><div><span>Quick capture</span><h2>Save something worth returning to.</h2></div><button type="button" onClick={onClose}>Close</button></div><label>URL, text, or source reference<textarea value={source} onInput={(event) => setSource((event.target as HTMLTextAreaElement).value)} placeholder="Paste a link, text, video, or document reference…" required={!file} /></label><label>Or upload a PDF/HTML<input type="file" accept=".pdf,.html,.htm,text/html,application/pdf" onChange={(event) => { setFile((event.target as HTMLInputElement).files?.[0] || null); setArtifactId('') }} /></label><p>Background enrichment adds useful details. You decide whether it earns a queue slot.</p><div class="dialog-actions"><button class="primary-action" type="submit">Add to Inbox</button></div>{status && <output>{status}</output>}</form></dialog>
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDialogElement>(null)
  const cloud = useData(query.trim().length >= 2 ? `/search?q=${encodeURIComponent(query.trim())}` : undefined)
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  const pages = useMemo(() => destinations.filter((item) => `${item.title} ${item.purpose}`.toLowerCase().includes(query.toLowerCase())).slice(0, query ? 5 : 12), [query])
  const groups = cloud.data?.groups || {}
  const cloudResults = [
    ...(groups.recs || []).map((item: any) => ({ group: 'Sources', title: item.title, detail: item.creator || item.status, target: 'curate.archive' })),
    ...(groups.nodes || []).map((item: any) => ({ group: 'Map', title: item.label || item.id, detail: item.super_category || item.type, target: 'map.branches' })),
    ...(groups.vault || []).map((item: any) => ({ group: 'Files', title: item.filename, detail: formatDate(item.created_at), target: 'learn.files' })),
    ...(groups.patterns || []).map((item: any) => ({ group: 'Patterns', title: item.description || item.id, detail: item.strength, target: 'settings.profile' })),
  ].slice(0, 16)
  return <dialog ref={ref} class="command-dialog" onClose={onClose}><div class="command-input"><Icon name="search" /><input aria-label="Search Learning Compass" autoFocus value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search sources, notes, files, branches, or pages…" /><kbd>Esc</kbd></div><div class="command-results">{pages.map((item) => <button onClick={() => { go(item); onClose() }}><span>{workspaceLabels[item.workspace]}</span><strong>{item.title}</strong><small>{item.purpose}</small></button>)}{query.trim().length >= 2 && cloud.loading && <div class="command-message">Searching your library…</div>}{cloudResults.map((item) => <button onClick={() => { go(destinations.find((destination) => destination.key === item.target)!); onClose() }}><span>{item.group}</span><strong>{item.title}</strong><small>{item.detail}</small></button>)}{query.trim().length >= 2 && !cloud.loading && !pages.length && !cloudResults.length && <div class="command-message">No matches found.</div>}</div></dialog>
}

function MobileMore({ open, route, onClose, onSearch, onCapture }: { open: boolean; route: Destination; onClose: () => void; onSearch: () => void; onCapture: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  const workspaces = (['map', 'insights', 'settings'] as WorkspaceKey[])
  return <dialog ref={ref} class="mobile-more-dialog" onClose={onClose}><div class="mobile-more-head"><strong>More</strong><button onClick={onClose}>Close</button></div><div class="mobile-more-actions"><button onClick={() => { onSearch(); onClose() }}><Icon name="search" />Search everything</button><button onClick={() => { onCapture(); onClose() }}><Icon name="capture" />Capture source</button></div><nav aria-label="More workspaces">{workspaces.map((workspace) => { const target = destinations.find((item) => item.workspace === workspace)!; return <button class={route.workspace === workspace ? 'active' : ''} onClick={() => { go(target); onClose() }}><Icon name={workspace} /><span><strong>{workspaceLabels[workspace]}</strong><small>{target.purpose}</small></span></button> })}</nav></dialog>
}

type ActiveSession = { id: string; recommendationId: string; title: string; sourceUrl: string }

function ReturnDialog({ session, onClose, onComplete }: { session: ActiveSession | null; onClose: () => void; onComplete: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [reflection, setReflection] = useState('')
  const [rating, setRating] = useState('8')
  const [status, setStatus] = useState('')
  useEffect(() => { if (session) { setReflection(''); setRating('8'); setStatus(''); ref.current?.showModal() } else ref.current?.close() }, [session?.id])
  if (!session) return null
  const submit = async (complete: boolean) => {
    setStatus(complete ? 'Finishing and processing…' : 'Saving your place…')
    try {
      await api(`/sessions/${session.id}/return`, { method: 'POST', body: JSON.stringify({ reflection, rating: rating ? Number(rating) : undefined, complete }) })
      if (complete) { localStorage.removeItem('tm-active-session'); onComplete() } else onClose()
      return true
    } catch (error: any) { setStatus(error.message); return false }
  }
  const dismiss = () => onClose()
  return <dialog ref={ref} class="return-dialog" onClose={dismiss}><div class="dialog-head"><div><span>Learning handoff</span><h2>What changed after reading?</h2></div><button onClick={dismiss}>Later</button></div><p class="return-source">{session.title}</p><label>My notes & reaction<textarea autoFocus value={reflection} onInput={(event) => setReflection((event.target as HTMLTextAreaElement).value)} placeholder="What surprised you? What do you disagree with? What will you use?" /></label><label>Rating <span>{rating}/10</span><input type="range" min="1" max="10" value={rating} onInput={(event) => setRating((event.target as HTMLInputElement).value)} /></label><div class="return-actions"><a href={session.sourceUrl} target="_blank" rel="noreferrer">Resume source</a><button onClick={async () => { if (await submit(false)) localStorage.removeItem('tm-active-session') }}>Save for later</button><button class="primary-action" disabled={!reflection.trim()} onClick={() => submit(true)}>Finish and process</button></div>{status && <output>{status}</output>}</dialog>
}

function applyTheme(value = localStorage.getItem('tm-theme') || 'system') {
  const dark = value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.density = localStorage.getItem('tm-density') || 'balanced'
}

export function App() {
  const route = useRoute()
  const [capture, setCapture] = useState(false)
  const [search, setSearch] = useState(false)
  const [more, setMore] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  useEffect(() => { applyTheme(); flushOfflineMutations(); const checkSession = () => { const stored = localStorage.getItem('tm-active-session'); if (stored) try { setActiveSession(JSON.parse(stored)) } catch { localStorage.removeItem('tm-active-session') } }; checkSession(); addEventListener('online', flushOfflineMutations); addEventListener('focus', checkSession); if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); const listener = (event: KeyboardEvent) => { const tag = (event.target as HTMLElement).tagName; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearch(true) } if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) setCapture(true) }; addEventListener('keydown', listener); return () => { removeEventListener('keydown', listener); removeEventListener('online', flushOfflineMutations); removeEventListener('focus', checkSession) } }, [])
  return <><Shell route={route} onCapture={() => setCapture(true)} onSearch={() => setSearch(true)} onMore={() => setMore(true)}><View route={route} /></Shell><CaptureDialog open={capture} onClose={() => setCapture(false)} /><CommandPalette open={search} onClose={() => setSearch(false)} /><MobileMore open={more} route={route} onClose={() => setMore(false)} onSearch={() => setSearch(true)} onCapture={() => setCapture(true)} /><ReturnDialog session={activeSession} onClose={() => setActiveSession(null)} onComplete={() => setActiveSession(null)} /></>
}
