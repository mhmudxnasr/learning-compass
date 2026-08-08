import { ComponentChildren } from 'preact'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, flushOfflineMutations, formatDate, labelize, listOfflineMutations, queueOfflineMutation, resolveOfflineMutation } from './api'
import { Destination, destinationForPath, destinations, workspaceOrder, WorkspaceKey } from './destinations'

const AtlasPage = lazy(() => import('./features/atlas/AtlasPage'))
const DiscoveryPage = lazy(() => import('./features/discovery/DiscoveryPage'))

const workspaceLabels: Record<WorkspaceKey, string> = {
  today: 'Momentum', curate: 'Curate', map: 'Map', learn: 'Learn', insights: 'Insights', settings: 'Settings',
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
  const raw = location.hash.slice(1) || '/today/momentum'
  return destinationForPath(raw) || destinations[0]
}

function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const change = () => setRoute({ ...readRoute() })
    addEventListener('hashchange', change)
    if (!location.hash) location.hash = '#/today/momentum'
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
      {workspaceDestinations.length > 1 && <nav class="subnav" aria-label={`${workspaceLabels[route.workspace]} views`}>
        {workspaceDestinations.map((item) => <button class={item.key === route.key ? 'active' : ''} onClick={() => go(item)}>{item.title}</button>)}
      </nav>}
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
function compassWeakReason(reason: string) {
  return ({
    not_enough_eligible_candidates: 'Too few candidates survived the quality checks.',
    winner_not_verifiable: 'The source could not be verified with enough certainty.',
    winner_below_score_threshold: 'Its overall fit score was below the automatic threshold.',
    insufficient_calibrated_confidence: 'The system could not distinguish it confidently from the alternatives.',
    candidate_set_not_usable: 'The candidate set did not support an automatic choice.',
  } as Record<string, string>)[reason] || 'The candidate did not clear the automatic quality checks.'
}
function compassWeakPickCanQueue(pick: any) {
  const sourceStatus = pick?.rationale?.source_check?.status
  return Boolean(pick?.video_url && pick?.video_title && ['verified', 'restricted'].includes(sourceStatus))
}

function TodayPage() {
  const { data, error, loading } = useData('/dashboard/briefing')
  const compass = useData('/compass/pick')
  const [compassWorking, setCompassWorking] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  useEffect(() => { setSecondsLeft(Number(data?.momentum?.seconds_remaining || 0)); const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [data?.momentum?.seconds_remaining])
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const items = data?.active_items || []
  const mission = items[0]
  const filesFor = (id: string) => (data?.artifacts || []).filter((artifact: any) => artifact.recommendation_id === id)
  const fileLabel = (artifact: any) => artifact.role || (/pdf/i.test(artifact.media_type || artifact.filename) ? 'PDF' : /html/i.test(artifact.media_type || artifact.filename) ? 'HTML' : artifact.filename)
  const completed = Number(data?.momentum?.completed || 0)
  const streak = Number(data?.momentum?.streak || 0)
  const streakDays = data?.momentum?.streak_days || []
  const streakDates = new Set(streakDays.map((day: any) => day.date))
  const streakToday = data?.momentum?.current_date
  const streakCells = Array.from({ length: 14 }, (_, index) => { const date = new Date(`${streakToday}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (13 - index)); return date.toISOString().slice(0, 10) })
  const countdown = `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0')}m`
  const nextMove = data?.next_action_detail
  const nextTarget = destinations.find((item) => item.key === nextMove?.target)
  return <div class="momentum-page">
    {compass.error && <div class="error-state"><strong>Compass Pick unavailable.</strong><span>{compass.error}</span></div>}
    <section class="runway-section">
      <div class="momentum-kicker"><span>Learning runway</span><span>Cairo · resets at midnight</span></div>
      <div class="streak-keeper" aria-label={`${streak}-day learning streak`}>
        <div class="streak-count"><strong>{streak}</strong><span>day chain</span><small>best {data?.momentum?.longest_streak || 0}</small></div>
        <div class="streak-track"><div class="streak-mark">{streakCells.map((date) => <i title={date} class={streakDates.has(date) ? 'filled' : ''} />)}</div><span>Last 14 days</span></div>
        <div class="streak-state"><strong>{streakDates.has(streakToday) ? 'Today locked in' : streak ? 'Chain open today' : 'Start today'}</strong><span>{streakDates.has(streakToday) ? `${countdown} until the next day` : `${countdown} left to record one learning action`}</span></div>
        <div class="week-strip" aria-label="This week's learning totals"><span>This week</span><div><strong>{completed}</strong><small>finished</small></div><div><strong>{data?.momentum?.notes || 0}</strong><small>notes</small></div><div><strong>{data?.momentum?.reviews || 0}</strong><small>recalls</small></div></div>
      </div>
    </section>

    <section class="mission-section">
      <div class="section-title"><div><span>Continue</span><h2>{mission?.learning_state === 'in_progress' ? 'Pick up where you stopped' : 'Ready when you are'}</h2></div><strong>{items.length}/5 queued</strong></div>
      {mission ? <div class="mission-grid">
        <div class="mission-copy">
          <span class="meta">{mission.learning_state === 'in_progress' ? 'in progress' : mission.content_type || 'source'} · {mission.creator || 'independent source'}</span>
          <h2>{mission.video_title}</h2>
          <p>{formatSmartHook(mission)}</p>
          <div class="mission-actions">
            <a class="primary-action" href={mission.video_url} target="_blank" rel="noreferrer" onClick={(event) => startExternal(event, mission)}>{mission.learning_state === 'in_progress' ? 'Resume original ↗' : 'Open original ↗'}</a>
            <button onClick={() => { location.hash = `#/learn/notes?source=${encodeURIComponent(mission.id)}` }}>Source record</button>
          </div>
        </div>
        <div class="mission-files">
          <div class="module-head"><h3>Reading kit</h3><span>{filesFor(mission.id).length + Number(Boolean(mission.note_count)) + Number(Boolean(mission.notebook_url))} files</span></div>
          <div class="file-stack">
            {filesFor(mission.id).map((artifact: any) => <a href={`/artifacts/${artifact.id}`} target="_blank" rel="noreferrer"><span>{fileLabel(artifact)}</span><strong>{artifact.filename}</strong><b>Open ↗</b></a>)}
            {mission.note_count > 0 && <a href={`#/learn/notes?source=${encodeURIComponent(mission.id)}`}><span>Notes</span><strong>Source record</strong><b>Open →</b></a>}
            {mission.notebook_url && <a href={mission.notebook_url} target="_blank" rel="noreferrer"><span>NotebookLM</span><strong>Grounded notebook</strong><b>Open ↗</b></a>}
            {!filesFor(mission.id).length && !mission.note_count && !mission.notebook_url && <p>No companions yet. Use the original source.</p>}
          </div>
        </div>
      </div> : <Empty title="The shelf is clear" body="Queue one source worth caring about. Momentum starts there." />}
    </section>

    <section class="active-shelf">
      <div class="section-title"><div><span>Queue manifest</span><h2>Every source and file</h2></div><button onClick={() => go(destinations.find((item) => item.key === 'curate.queue')!)}>Edit queue →</button></div>
      <div class="queue-manifest">{items.map((item: any, index: number) => <article class={item.id === mission?.id ? 'active' : ''}>
        <div class="shelf-number">{String(index + 1).padStart(2, '0')}</div>
        <div class="manifest-copy"><span class="meta">{item.learning_state === 'in_progress' ? 'in progress' : 'queued'} · {item.content_type || 'source'}</span><h3>{item.video_title}</h3><small>{item.creator || 'Independent source'}</small></div>
        <div class="manifest-files">
          <a class="source-link" href={item.video_url} target="_blank" rel="noreferrer">Original ↗</a>
          {filesFor(item.id).map((artifact: any) => <a href={`/artifacts/${artifact.id}`} target="_blank" rel="noreferrer"><span>{fileLabel(artifact)}</span><small>{artifact.filename}</small></a>)}
          {item.note_count > 0 && <a href={`#/learn/notes?source=${encodeURIComponent(item.id)}`}>Notes</a>}
          {item.notebook_url && <a href={item.notebook_url} target="_blank" rel="noreferrer">Notebook</a>}
        </div>
      </article>)}</div>
    </section>

    {nextMove && <section class="next-move"><div><span>Next move</span><h2>{nextMove.label}</h2><p>{nextMove.reason}</p></div>{nextTarget && <button class="primary-action" onClick={() => go(nextTarget)}>{nextMove.label} →</button>}</section>}

    {!mission && compass.data?.pick && <section class="empty-compass">
      <span>{compass.data.pick.status === 'abstained' ? 'Weak Compass Pick · your decision' : `Compass Pick · ${compass.data.pick.strategy}`}</span><h2>{compass.data.pick.video_title || 'Compass Pick'}</h2><p>{compass.data.pick.context_brief || compass.data.pick.rationale?.why_this || compass.data.pick.why_this}</p>
      {compass.data.pick.status === 'abstained' && <div class="compass-weak-context"><strong>Not automatically recommended</strong><p>{compassWeakReason(compass.data.pick.rationale?.abstention_reason || compass.data.pick.stop_reason)} {compassWeakPickCanQueue(compass.data.pick) ? 'The source is reachable, but it did not meet the automatic recommendation threshold. You can still add it manually.' : 'No safe, reachable source is available to add.'} Score {Math.round(Number(compass.data.pick.rationale?.score || 0) * 100)}% · confidence {Math.round(Number(compass.data.pick.confidence || 0) * 100)}% · source {compass.data.pick.rationale?.source_check?.status || 'unknown'}.</p></div>}
      <div class="row-actions">
        {(compass.data.pick.status === 'ready' || (compass.data.pick.status === 'abstained' && compassWeakPickCanQueue(compass.data.pick))) && <button class="primary-action" disabled={compassWorking} onClick={async () => { setCompassWorking(true); const target = window.open('about:blank', '_blank'); try { const result = await api<any>(`/compass/pick/${compass.data.pick.id}/start`, { method: 'POST' }); localStorage.setItem('tm-active-session', JSON.stringify({ id: result.session_id, recommendationId: result.recommendation_id, title: compass.data.pick.video_title, sourceUrl: compass.data.pick.video_url })); if (target) target.location.replace(compass.data.pick.video_url); else location.assign(compass.data.pick.video_url); compass.reload() } catch (error: any) { target?.close(); window.alert(error.message) } finally { setCompassWorking(false) } }}>{compass.data.pick.status === 'abstained' ? 'Add to Queue anyway' : 'Start'}</button>}
        <button disabled={compassWorking} onClick={async () => { setCompassWorking(true); try { await api(`/compass/pick/${compass.data.pick.id}/feedback`, { method: 'POST', body: JSON.stringify({ outcome: 'declined', reason_tags: ['not_now'] }) }); compass.reload() } catch (error: any) { window.alert(error.message) } finally { setCompassWorking(false) } }}>Not for me</button>
      </div>
    </section>}
  </div>
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
                {item.context_brief?.trim() ? <p class="queue-brief">{item.context_brief}</p> : <p>{formatSmartHook(item)}</p>}
              </div>

              <div class="row-actions">
                <button onClick={() => { location.hash = `#/learn/notes?source=${encodeURIComponent(item.id)}` }}>Record</button>
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

function BooksPage() {
  const { data, error, loading, reload } = useData('/recommendations/books')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [isbn, setIsbn] = useState('')
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const books = data?.books || []
  const inbox = books.filter((book: any) => book.status === 'active' && book.learning_state === 'inbox')
  const active = books.filter((book: any) => book.status === 'active' && book.learning_state !== 'inbox')
  const finished = books.filter((book: any) => book.status === 'consumed')
  const addBook = async (event: Event) => {
    event.preventDefault(); setStatus('Adding book…')
    try { await api('/recommendations/books', { method: 'POST', body: JSON.stringify({ title, author, isbn }) }); setTitle(''); setAuthor(''); setIsbn(''); setStatus('Added to Inbox'); reload() }
    catch (error: any) { setStatus(error.message) }
  }
  const queue = async (book: any) => {
    setWorking(book.id); setStatus('')
    try { await api(`/capture/${book.id}/triage`, { method: 'POST', body: JSON.stringify({ action: 'queue' }) }); reload() }
    catch (error: any) { setStatus(error.message) }
    finally { setWorking('') }
  }
  const visualise = async (book: any) => {
    setWorking(book.id); setStatus('Preparing visual companion…')
    try { await api(`/capture/${book.id}/visualise`, { method: 'POST', body: JSON.stringify({}) }); setStatus('Visual companion queued'); reload() }
    catch (error: any) { setStatus(error.message) }
    finally { setWorking('') }
  }
  const finishChapter = async (book: any, chapter: any) => {
    setWorking(`${book.id}:${chapter.key}`)
    try { await api(`/recommendations/books/${book.id}/chapters/${encodeURIComponent(chapter.key)}/complete`, { method: 'POST', body: JSON.stringify({ completed: !chapter.completed }) }); reload() }
    catch (error: any) { setStatus(error.message) }
    finally { setWorking('') }
  }
  const uploadFile = async (book: any, chapter: any, file: File, role: 'html' | 'pdf') => {
    setWorking(`${book.id}:${chapter.key}:${role}`)
    const form = new FormData()
    form.append('file', file)
    form.append('metadata', JSON.stringify({ recommendation_id: book.id, chapter_key: chapter.key, chapter_title: chapter.title, chapter_number: chapter.number || chapter.key, role, pair_id: `book_${book.id}` }))
    try {
      const res = await fetch('/artifacts', { method: 'POST', body: form })
      const data: any = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      reload()
    } catch (err: any) { setStatus(err.message) }
    finally { setWorking('') }
  }
  const chapterList = (book: any) => {
    const visual = book.visual || {}
    if (!visual.chapters?.length) return null
    const notebookUrl = book.notebook_url
    return <div class="book-chapters">{visual.chapters.map((chapter: any) => <div class="chapter-row" key={chapter.key}><div class="chapter-info"><span class="chapter-num">{chapter.number || chapter.key}</span><span class="chapter-title">{chapter.title}</span><span class="chapter-status">{chapter.completed ? 'Done' : 'Not started'}</span></div><div class="chapter-actions">{chapter.html && <a href={`/artifacts/${chapter.html.id}/view`} target="_blank" rel="noreferrer">HTML</a>}{chapter.pdf && <a href={`/artifacts/${chapter.pdf.id}`} target="_blank" rel="noreferrer">PDF</a>}{!chapter.html && <label class="upload-btn"><input type="file" accept=".html,.htm" onChange={(e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) uploadFile(book, chapter, file, 'html') }} /><span>Upload HTML</span></label>}{!chapter.pdf && <label class="upload-btn"><input type="file" accept=".pdf" onChange={(e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) uploadFile(book, chapter, file, 'pdf') }} /><span>Upload PDF</span></label>}{notebookUrl && <a class="nblm-link" href={notebookUrl} target="_blank" rel="noreferrer">NBLM</a>}<button disabled={working === `${book.id}:${chapter.key}`} onClick={() => finishChapter(book, chapter)}>{chapter.completed ? 'Undo' : 'Finish'}</button></div></div>)}</div>
  }
  const visualActions = (book: any) => {
    const visual = book.visual || {}
    if (visual.status !== 'not_started') return <span class="meta">Visual {visual.status}</span>
    return <button disabled={working === book.id || !book.video_url} onClick={() => visualise(book)}>Create visual</button>
  }
  const shelf = (label: string, items: any[], action?: (book: any) => ComponentChildren) => <section class="book-shelf"><div class="section-title"><div><span>{label}</span><h2>{items.length} {items.length === 1 ? 'book' : 'books'}</h2></div></div>{items.length ? <div class="book-list">{items.map((book: any) => <article class={`book-row${expanded === book.id ? ' expanded' : ''}`} key={book.id}><div class="book-spine" /><div class="book-copy"><span class="meta">{book.creator}</span><h3 class="book-title" onClick={() => setExpanded(expanded === book.id ? null : book.id)}>{book.video_title}</h3>{book.why_this && <p>{book.why_this}</p>}<small>{book.user_score != null ? `${book.user_score}/10` : book.learning_state || book.status}</small>{expanded === book.id && chapterList(book)}<div class="book-visual">{visualActions(book)}</div></div><div class="row-actions">{action?.(book)}<button onClick={() => { location.hash = `#/learn/notes?source=${encodeURIComponent(book.id)}` }}>Record</button></div></article>)}</div> : <p class="quiet-copy">Nothing on this shelf yet.</p>}</section>
  return <div class="books-page"><form class="book-add" onSubmit={addBook}><div><span class="meta">Add a book</span><h2>Build a reading shelf with intent.</h2><p>Books enter Inbox first. Queue only the next one you are ready to read. When a source is ready, create its annotation-friendly HTML and PDF companion here.</p></div><div class="book-fields"><label>Title<input value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} required placeholder="e.g. The Righteous Mind" /></label><label>Author<input value={author} onInput={(event) => setAuthor((event.target as HTMLInputElement).value)} required placeholder="e.g. Jonathan Haidt" /></label><label>ISBN <span>(optional)</span><input value={isbn} onInput={(event) => setIsbn((event.target as HTMLInputElement).value)} placeholder="10 or 13 digits" /></label><button class="primary-action" type="submit">Add to Inbox</button></div>{status && <output>{status}</output>}</form>{shelf('Inbox', inbox, (book) => <button class="primary-action" disabled={working === book.id} onClick={() => queue(book)}>Queue</button>)}{shelf('Reading shelf', active, (book) => <a class="primary-action" href={book.video_url} target="_blank" rel="noreferrer" onClick={(event) => startExternal(event, book)}>Open source</a>)}{shelf('Finished', finished)}</div>
}

function InboxPage() {
  const { data, error, loading, reload } = useData('/capture')
  const feedsState = useData('/capture/feeds')
  const [blocked, setBlocked] = useState<any>(null)
  const [working, setWorking] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [feedStatus, setFeedStatus] = useState('')
  const [feedWorking, setFeedWorking] = useState(false)
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
      const result = await api<any>('/capture/feeds/sync', { method: 'POST', body: JSON.stringify({ limit: 5 }) })
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
  return <div class="inbox-view">
    <section class="feed-manager">
      <div class="feed-manager-head">
        <div><h2>RSS &amp; Atom feeds</h2><p>New articles arrive automatically every six hours. Triage only what deserves a queue slot.</p></div>
        <div class="feed-head-actions">
          <button type="button" disabled={feedWorking || !feeds.length} onClick={syncFeeds}>Check now</button>
        </div>
      </div>
      <form class="feed-create" onSubmit={addFeed}><label for="feed-url">Feed URL</label><div><input id="feed-url" type="url" value={feedUrl} onInput={(event) => setFeedUrl((event.target as HTMLInputElement).value)} placeholder="https://example.com/feed.xml" required /><button class="primary-action" disabled={feedWorking || !feedUrl.trim()}>Subscribe</button></div></form>
      {feeds.length > 0 && <div class="feed-list">{feeds.map((feed: any) => <div><span><strong>{feed.title}</strong><small>{feed.entry_count || 0} seen · {feed.last_checked_at ? `checked ${formatDate(feed.last_checked_at)}` : 'not checked yet'}</small>{feed.last_error && <small class="feed-error">{feed.last_error}</small>}</span><button type="button" disabled={feedWorking} onClick={() => removeFeed(feed)}>Remove</button></div>)}</div>}
      {feedStatus && <output class="feed-status">{feedStatus}</output>}
    </section>
    <div class="inbox-summary"><strong>{items.length} waiting</strong><span>Promote only what deserves one of five active queue slots.</span></div>
    {blocked && <div class="queue-warning"><span>{blocked.error || 'Queue full. Finish an active item or make this a deliberate override.'}</span>{!blocked.error && <button onClick={() => triage(blocked, 'queue', true)}>Add anyway</button>}</div>}
    {items.length ? <div class="record-list">{items.map((item: any, index: number) => <article><span class="record-number">{String(index + 1).padStart(2, '0')}</span><div><span class="meta">{item.feed_title ? `rss · ${item.feed_title}` : item.content_type || 'source'}</span><h3>{item.video_title}</h3><p>{item.why_this || item.video_url}</p></div><div class="row-actions"><button class="danger-action" disabled={working === item.id} onClick={() => triage(item, 'exclude')}>Remove</button><button class="primary-action" disabled={working === item.id} onClick={() => triage(item, 'queue')}>Queue</button></div></article>)}</div> : <Empty title="Inbox clear" body="New captures and feed articles land here for a quick fit check before they earn a queue slot." />}
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
  return <div class="archive-page"><section class="archive-rss"><div class="archive-rss-head"><div><span class="meta">Pinned · RSS / Atom</span><h2>Feed reading</h2><p>{feedCount ? `${feedCount} captured ${feedCount === 1 ? 'article' : 'articles'} kept here, outside the main archive.` : 'Subscribe to a feed in Inbox and its articles will stay grouped here.'}</p></div><button onClick={() => go(inbox)}>Open Inbox</button></div>{feeds.length ? <div class="archive-rss-list">{feeds.map((feed: any) => <div><strong>{feed.title}</strong><span>{feed.entry_count || 0} captured · {feed.last_checked_at ? `checked ${formatDate(feed.last_checked_at)}` : 'not checked yet'}</span></div>)}</div> : <div class="archive-rss-empty">No subscribed feeds yet.</div>}</section><div class="filter-bar"><label>Status<select value={filter} onChange={(event) => setFilter((event.target as HTMLSelectElement).value)}><option value="all">All</option><option value="consumed">Completed</option><option value="rejected">Excluded</option><option value="active">Saved</option></select></label><span>{data?.total || 0} non-feed sources</span></div>{items.length ? <div class="source-list">{items.map((item: any) => <article><div><span class="meta">{item.content_type || 'source'} · {item.status}</span><h2>{item.video_title}</h2><p>{item.user_review || item.why_this || item.creator || 'No reaction recorded.'}</p></div>{item.video_url && <a href={item.video_url} target="_blank" rel="noreferrer">Open</a>}</article>)}</div> : <Empty title="No matching sources" body="Try another status filter." />}<details class="legacy-discovery"><summary>Legacy Discovery archive</summary><p>Older research runs remain available here for reference. New recommendations appear as one Compass Pick on Momentum when the active shelf is empty.</p><Suspense fallback={<Loading />}><DiscoveryPage /></Suspense></details></div>
}

function SourceRecordPage({ record, onBack, onReload }: { record: any; onBack: () => void; onReload: () => void }) {
  const item = record.item || {}
  let storedFeedback: any = {}
  try { storedFeedback = JSON.parse(item.source_metadata_json || '{}').learning_feedback || {} } catch {}
  const reflection = (record.notes || []).find((note: any) => note.kind === 'reflection')
  const extracted = (record.notes || []).find((note: any) => note.kind !== 'reflection')
  const [feedback, setFeedback] = useState(reflection?.sections?.find((section: any) => section.section_key === 'reaction')?.content || item.user_review || '')
  const [rating, setRating] = useState(item.user_score == null ? '' : String(item.user_score))
  const [completionState, setCompletionState] = useState(storedFeedback.completion_state || (item.status === 'consumed' ? 'completed' : 'in_progress'))
  const [reasonTags, setReasonTags] = useState<string[]>(storedFeedback.reason_tags || [])
  const [expected, setExpected] = useState(storedFeedback.expected || '')
  const [actual, setActual] = useState(storedFeedback.actual || '')
  const [effort, setEffort] = useState(storedFeedback.effort || '')
  const [lengthMinutes, setLengthMinutes] = useState(storedFeedback.length_minutes == null ? '' : String(storedFeedback.length_minutes))
  const [feedbackBeforeEnhancement, setFeedbackBeforeEnhancement] = useState<string | null>(null)
  const [sourceNote, setSourceNote] = useState(extracted)
  const [status, setStatus] = useState('')
  const saveNote = async (note: any, content?: string) => {
    if (!note) return
    const sections = (note.sections || []).map((section: any) => section.section_key === 'reaction' && content !== undefined ? { ...section, content } : section)
    setStatus('Saving…')
    try { await api(`/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ title: note.title, sections }) }); setStatus('Saved') }
    catch (error: any) { setStatus(error.message) }
  }
  const saveFeedback = async () => {
    if (!feedback.trim()) return
    setStatus('Saving feedback…')
    try {
      await api('/feedback/record', { method: 'POST', body: JSON.stringify({ recommendation_id: item.id, feedback, score: rating || undefined, completion_state: completionState, reason_tags: reasonTags, expected, actual, effort: effort || undefined, length_minutes: lengthMinutes || undefined }) })
      setStatus('Feedback saved'); onReload()
    } catch (error: any) { setStatus(error.message) }
  }
  const enhanceFeedback = async () => {
    if (!feedback.trim()) return
    setStatus('Enhancing…')
    try {
      const result = await api<{ text: string }>('/ai/enhance', { method: 'POST', body: JSON.stringify({
        id: item.id,
        text: feedback,
        video_title: item.video_title,
        creator: item.creator,
        content_type: item.content_type,
        why_this: item.why_this,
        rating: item.user_score,
      }) })
      setFeedbackBeforeEnhancement(feedback)
      setFeedback(result.text)
      setStatus('Enhanced preview — review before saving')
    } catch (error: any) { setStatus(error.message) }
  }
  const undoEnhancement = () => {
    if (feedbackBeforeEnhancement === null) return
    setFeedback(feedbackBeforeEnhancement)
    setFeedbackBeforeEnhancement(null)
    setStatus('Original draft restored')
  }
  return <div class="source-record-page">
    <button class="back-link" onClick={onBack}>← All notes</button>
    <header class="source-record-head"><div><span class="meta">Source record</span><h2>{item.video_title || reflection?.title || extracted?.title || 'Learning source'}</h2><p>{item.creator || item.content_type || 'Source'} · {item.learning_state || item.status || 'saved'}</p></div><div class="row-actions">{item.notebook_url && <a href={item.notebook_url} target="_blank" rel="noreferrer">Open NotebookLM</a>}{item.video_url && <a class="primary-action" href={item.video_url} target="_blank" rel="noreferrer">Open original</a>}</div></header>
    <section class="record-section"><div class="section-head"><h3>My Feedback</h3><span>{rating ? `${rating}/10` : 'Not rated'}</span></div><textarea class="note-editor feedback-editor" value={feedback} onInput={(event) => setFeedback((event.target as HTMLTextAreaElement).value)} placeholder="Your exact reaction is preserved here." /><div class="feedback-fields"><label>Score (0–10)<input type="number" min="0" max="10" step="0.5" value={rating} onInput={(event) => setRating((event.target as HTMLInputElement).value)} /></label><label>Learning status<select value={completionState} onChange={(event) => setCompletionState((event.target as HTMLSelectElement).value)}><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="stopped">Stopped</option></select></label><label>Effort<select value={effort} onChange={(event) => setEffort((event.target as HTMLSelectElement).value)}><option value="">Not set</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select></label><label>Minutes spent<input type="number" min="0" value={lengthMinutes} onInput={(event) => setLengthMinutes((event.target as HTMLInputElement).value)} /></label></div><label>Reason tags<input value={reasonTags.join(', ')} onInput={(event) => setReasonTags((event.target as HTMLInputElement).value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="practical, too shallow, revisit" /></label><div class="feedback-fields"><label>Expected<textarea class="note-editor" value={expected} onInput={(event) => setExpected((event.target as HTMLTextAreaElement).value)} placeholder="What did you expect?" /></label><label>Actual<textarea class="note-editor" value={actual} onInput={(event) => setActual((event.target as HTMLTextAreaElement).value)} placeholder="What did you actually get?" /></label></div><div class="row-actions"><button onClick={saveFeedback} disabled={!feedback.trim()}>Save feedback</button><button onClick={enhanceFeedback} disabled={!feedback.trim() || status === 'Enhancing…'}>Enhance writing</button>{feedbackBeforeEnhancement !== null && <button onClick={undoEnhancement}>Undo enhancement</button>}</div></section>
    <section class="record-section"><div class="section-head"><h3>Extracted note</h3><span>{extracted?.status || 'Not created'}</span></div>{sourceNote ? <>{(sourceNote.sections || []).map((section: any) => <div dir={section.direction || 'auto'}><h4>{section.label}</h4><textarea class="note-editor" value={section.content} onInput={(event) => setSourceNote({ ...sourceNote, sections: sourceNote.sections.map((current: any) => current.section_key === section.section_key ? { ...current, content: (event.target as HTMLTextAreaElement).value } : current) })} /></div>)}<div class="row-actions"><button onClick={() => saveNote(sourceNote)}>Save extracted note</button></div></> : <p class="record-muted">A completed rating of 7–10 creates a bilingual source note and editable recall drafts.</p>}</section>
    <section class="record-section"><div class="section-head"><h3>Recall</h3><span>{record.srs?.cards?.length || 0} active</span></div><p>{record.srs?.drafts?.length || 0} editable drafts · {record.srs?.cards?.length || 0} approved cards</p></section>
    <section class="record-section"><div class="section-head"><h3>Files</h3><span>{record.artifacts?.length || 0}</span></div>{record.artifacts?.length ? record.artifacts.map((file: any) => <a class="record-line" href={`/artifacts/${file.id}`} target="_blank" rel="noreferrer"><strong>{file.filename}</strong><span>{file.media_type}{file.notebook_url ? ' · Open NotebookLM' : ''}</span></a>) : <p class="record-muted">No companion files yet.</p>}</section>
    {record.proposals?.length ? <section class="record-section"><div class="section-head"><h3>Suggested profile changes</h3><span>{record.proposals.length}</span></div><p>Review these suggestions in Activity before they affect your profile.</p><a href="#/learn/activity">Open Activity</a></section> : null}
    <section class="record-section"><div class="section-head"><h3>Session history</h3><span>{record.sessions?.length || 0}</span></div>{record.sessions?.map((session: any) => <div class="record-line"><strong>{session.status} session</strong><span>{formatDate(session.started_at)}{session.completed_at ? ` → ${formatDate(session.completed_at)}` : ''}</span></div>)}</section>
    {status && <output class="note-status">{status}</output>}
  </div>
}

function NoteDocumentPage({ noteId, notes, onBack, onReload }: { noteId: string; notes: any[]; onBack: () => void; onReload: () => void }) {
  const note = notes.find((candidate: any) => candidate.id === noteId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any>(note)
  const [status, setStatus] = useState('')
  useEffect(() => { setDraft(note); setEditing(false); setStatus('') }, [noteId, note])
  if (!note) return <Empty title="Note not found" body="This extracted note is no longer available in the library." />
  const sections = draft?.sections || []
  const save = async () => {
    setStatus('Saving…')
    try {
      await api(`/notes/${draft.id}`, { method: 'PUT', body: JSON.stringify({ title: draft.title, sections: sections.map((section: any) => ({ section_key: section.section_key, content: section.content, direction: section.direction })) }) })
      setStatus('Saved'); setEditing(false); onReload()
    } catch (error: any) { setStatus(error.message) }
  }
  const scrollTo = (sectionKey: string) => document.getElementById(`note-section-${sectionKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <div class="notes-layout">
    <aside class="note-sidebar">
      <button class="back-link" onClick={onBack}>← All notes</button>
      <nav aria-label="Note sections">{sections.map((section: any) => <button key={section.section_key} onClick={() => scrollTo(section.section_key)}><span>{section.label}</span></button>)}</nav>
      <div class="note-meta"><span>{labelize(note.status || 'draft')} · revision {note.revision || 1}</span><span>Updated {formatDate(note.updated_at)}</span></div>
      {note.recommendation_id && <a class="source-context-link" href={`#/learn/notes?source=${encodeURIComponent(note.recommendation_id)}`}>Open source context →</a>}
    </aside>
    <div class="note-document">
      <span class="note-kicker">Extracted note</span>
      {editing ? <input class="note-title-input" value={draft.title} onInput={(event) => setDraft({ ...draft, title: (event.target as HTMLInputElement).value })} />
        : <h2>{note.title}</h2>}
      <p class="note-source">{note.source_url || 'Completed source'} · {formatDate(note.updated_at)}</p>
      {sections.map((section: any) => <section id={`note-section-${section.section_key}`} key={section.section_key}>
        <h3>{section.label}</h3>
        {editing
          ? <textarea class="note-editor" dir={section.direction || 'auto'} value={section.content} onInput={(event) => setDraft({ ...draft, sections: sections.map((current: any) => current.section_key === section.section_key ? { ...current, content: (event.target as HTMLTextAreaElement).value } : current) })} />
          : <div class="note-copy" dir={section.direction || 'auto'}>{section.content}</div>}
      </section>)}
      <div class="note-actions">{status && <output class="note-status">{status}</output>}
        {editing
          ? <><button class="primary-action" onClick={save}>Save changes</button><button onClick={() => { setDraft(note); setEditing(false) }}>Cancel</button></>
          : <button class="primary-action" onClick={() => setEditing(true)}>Edit note</button>}
      </div>
    </div>
  </div>
}

function NotesPage() {
  const { data, error, loading, reload } = useData('/notes?kind=guide')
  const [query, setQuery] = useState('')
  const params = new URLSearchParams(location.href.split('?')[1] || '')
  const sourceId = params.get('source') || ''
  const noteId = params.get('note') || ''
  const recordState = useData(sourceId ? `/capture/${sourceId}/record` : undefined)
  useEffect(() => { reload() }, [sourceId, noteId])
  if (loading || recordState.loading) return <Loading />
  if (error || recordState.error) return <ErrorState message={error || recordState.error} />
  if (sourceId && recordState.data) return <SourceRecordPage record={recordState.data} onBack={() => { location.hash = '#/learn/notes' }} onReload={recordState.reload} />
  const notes = data?.notes || []
  if (noteId) return <NoteDocumentPage noteId={noteId} notes={notes} onBack={() => { location.hash = '#/learn/notes' }} onReload={reload} />
  if (!notes.length) return <Empty title="No extracted notes yet" body="A completed rating of 7–10 mints a structured note here — Foundation, Case Studies, Exploitation, and Defense." />
  const visible = notes.filter((note: any) => !query.trim() || (note.title || '').toLowerCase().includes(query.trim().toLowerCase()))
  return <div><label class="page-search">Search extracted notes<input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Title" /></label><div class="source-list notes-source-list">{visible.map((note: any) => {
    const preview = (note.sections || []).find((section: any) => section.content)?.content || ''
    return <article class="note-row" key={note.id}><div><span class="meta">{note.sections?.length || 0} sections · updated {formatDate(note.updated_at)}</span><h2>{note.title}</h2>{preview && <p>{preview.slice(0, 140)}{preview.length > 140 ? '…' : ''}</p>}</div><div class="note-row-actions">{note.recommendation_id && <a href={`#/learn/notes?source=${encodeURIComponent(note.recommendation_id)}`}>Source context</a>}<button class="primary-action" onClick={() => { location.hash = `#/learn/notes?note=${encodeURIComponent(note.id)}` }}>Open note</button></div></article>
  })}</div>{!visible.length && <Empty title="No matching note" body="Try a shorter title." />}</div>
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
  const act = async (draft: any, action: 'save' | 'approve' | 'reject') => {
    const value = editing?.id === draft.id ? editing : draft
    setStatus(action === 'approve' ? 'Approving…' : action === 'reject' ? 'Discarding…' : 'Saving…')
    try {
      if (action === 'save') await api(`/srs/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify(value) })
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
  const bulk = async (action: 'approve' | 'reject') => {
    if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Discard'} all ${drafts.length} drafts?`)) return
    setStatus(action === 'approve' ? 'Approving drafts…' : 'Discarding drafts…')
    try { await Promise.all(drafts.map((draft: any) => api(`/srs/drafts/${draft.id}/${action}`, { method: 'POST' }))); setStatus(''); refresh() }
    catch (error: any) { setStatus(error.message); refresh() }
  }
  if (!drafts.length && !cards.length) return <Empty title="No recall cards yet" body="Ratings of 7 or higher create editable drafts here before anything enters Review." />
  return <div class="drafts-view">{drafts.length > 0 && <><div class="drafts-intro"><div><strong>{drafts.length} drafts awaiting judgment</strong><span>Edit, discard, or approve only prompts worth remembering.</span></div><div class="row-actions"><button onClick={() => bulk('reject')}>Discard all</button><button class="primary-action" onClick={() => bulk('approve')}>Approve all</button></div></div>{drafts.map((draft: any) => { const value = editing?.id === draft.id ? editing : draft; return <article class="draft-card"><div class="draft-meta"><span>{draft.topic || 'General'}</span><small>{formatDate(draft.created_at)}</small></div><label>Question<textarea value={value.question} onFocus={() => setEditing({ ...draft })} onInput={(event) => setEditing({ ...value, question: (event.target as HTMLTextAreaElement).value })} /></label><label>Answer<textarea value={value.answer} onFocus={() => setEditing({ ...draft })} onInput={(event) => setEditing({ ...value, answer: (event.target as HTMLTextAreaElement).value })} /></label><div class="draft-actions"><button onClick={() => act(draft, 'reject')}>Discard draft</button>{editing?.id === draft.id && <button onClick={() => act(draft, 'save')}>Save draft</button>}<button class="primary-action" disabled={!value.question.trim() || !value.answer.trim()} onClick={() => act(draft, 'approve')}>Approve for Review</button></div></article> })}</>}{cards.length > 0 && <section class="active-cards"><div class="drafts-intro"><strong>{cards.length} approved cards</strong><span>These participate in Review until you delete them.</span></div>{cards.map((card: any) => <article><div><span class="meta">{card.topic || 'Recall'} · due {formatDate(card.due_at)}</span><h3>{card.question}</h3><p>{card.answer}</p></div><button class="danger-action" onClick={() => deleteCard(card)}>Delete</button></article>)}</section>}{status && <output class="sticky-status">{status}</output>}</div>
}

function RecallPage() {
  return <div class="combined-view"><section><div class="section-head"><h2>Today’s recall</h2><span>Review</span></div><ReviewPage /></section><section><div class="section-head"><h2>Manage recall</h2><span>Drafts and cards</span></div><CardsPage /></section></div>
}

function ChangesPage() {
  const { data, error, loading, reload } = useData('/feedback/proposals?status=pending')
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
  return <div class="proposal-list">{proposals.map((proposal: any) => <article><div class="proposal-head"><div><span class="meta">{labelize(proposal.change_type)}</span><h2>{proposal.target_label}</h2>{proposal.video_title && <a href={`#/learn/notes?source=${encodeURIComponent(proposal.recommendation_id)}`}>{proposal.video_title}</a>}</div><span class={`state state-${proposal.status}`}>{proposal.status}</span></div><div class="proposal-diff"><div><small>Current</small><pre>{proposal.current == null ? 'Not set' : JSON.stringify(proposal.current, null, 2)}</pre></div><div><small>Proposed</small><pre>{JSON.stringify(proposal.proposed, null, 2)}</pre></div></div>{proposal.evidence && <p><strong>Evidence:</strong> {proposal.evidence}</p>}{proposal.reasoning && <p><strong>Why:</strong> {proposal.reasoning}</p>}<small>Confidence {Math.round(Number(proposal.confidence || 0) * 100)}%</small><div class="proposal-actions"><button disabled={working === proposal.id} onClick={() => decide(proposal, 'reject')}>Reject</button><button class="primary-action" disabled={working === proposal.id} onClick={() => decide(proposal, 'approve')}>Approve change</button></div></article>)}{status && <output class="sticky-status">{status}</output>}</div>
}

function ActivityPage() {
  return <div class="combined-view"><section><div class="section-head"><h2>Pending changes</h2><span>Approve or reject</span></div><ChangesPage /></section><section><div class="section-head"><h2>History</h2><span>What changed</span></div><JournalPage /></section></div>
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
    const qualityAssurance = files.find((file) => file.quality_assurance?.status === 'repair_required')?.quality_assurance
      || primary.quality_assurance
      || { status: 'unverified' }
    return { id, files, html, pdf, markdown, primary, notebookUrl, qualityAssurance, metadata: primary.metadata || {} }
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
    </div>
    <div class="artifact-table">{pairs.map((pair) => {
      const title = pair.metadata.source_title || pair.primary.filename?.replace(/\.(html?|pdf|md)$/i, '') || 'Untitled file'
      const href = (file: any) => file.legacy ? `/html/download/${file.id}` : /markdown|text\/plain/i.test(file.media_type || '') || /\.md$/i.test(file.filename || '') ? `/artifacts/${file.id}/view` : `/artifacts/${file.id}`
      const qa = pair.qualityAssurance
      const qaLabel = qa.status === 'repair_required' ? 'Needs repair' : qa.status === 'passed' && pair.html && qa.score != null ? `Verified ${qa.score}/10` : qa.status === 'passed' && qa.video_format === 'cinematic' ? 'Verified cinematic' : null
      return <article><div class="artifact-kind"><span>{artifactKind(pair)}</span><small>{formatDate(pair.primary.created_at)}</small></div><div class="artifact-copy"><h3>{title}</h3><p>{pair.metadata.source_url || `${pair.files.length} ${pair.files.length === 1 ? 'file' : 'linked files'}`}</p></div><div class="artifact-actions">{qaLabel && <span class={`qa-label qa-${qa.status}`}>{qaLabel}</span>}{pair.metadata.source_url && <a href={pair.metadata.source_url} target="_blank" rel="noreferrer">Original</a>}{pair.html && <a class="primary-action" href={href(pair.html)} target="_blank" rel="noreferrer">Read</a>}{pair.markdown && !pair.html && <a class="primary-action" href={href(pair.markdown)} target="_blank" rel="noreferrer">Read</a>}{pair.pdf && <a href={href(pair.pdf)} target="_blank" rel="noreferrer">PDF</a>}{pair.notebookUrl && <a class="nblm-link" href={pair.notebookUrl} target="_blank" rel="noreferrer">NBLM</a>}{pair.files.length > 0 && <button class="artifact-remove" disabled={working === pair.id} onClick={() => remove(pair)}>Remove</button>}</div></article>
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

function CoveragePage({ insight = false }: { insight?: boolean }) {
  const [windowDays, setWindowDays] = useState('90')
  const [depth, setDepth] = useState(2)
  const [sort, setSort] = useState('attention')
  const [selected, setSelected] = useState<any>(null)
  const balance = useData(`/learning/balance?window=${windowDays}`)
  if (balance.loading) return <Loading />
  if (balance.error) return <ErrorState message={balance.error} />
  const branches = balance.data?.branches || []
  const children = new Map<string, any[]>()
  branches.forEach((branch: any) => { if (branch.parent_id) children.set(branch.parent_id, [...(children.get(branch.parent_id) || []), branch]) })
  const roots = branches.filter((branch: any) => branch.round === 'R1' || (!branch.parent_id && branch.type === 'branch'))
  const visibleDepth = (branch: any) => Number(String(branch.round || 'R1').replace('R', '')) <= depth
  const ordered = (items: any[]) => [...items].sort((a, b) => {
    if (sort === 'oldest') return String(a.last_consumed_at || '').localeCompare(String(b.last_consumed_at || ''))
    if (sort === 'latest') return String(b.last_consumed_at || '').localeCompare(String(a.last_consumed_at || ''))
    if (sort === 'risk') return (['over-focused', 'at-risk', 'exposed', 'uncovered', 'cooling', 'balanced'].indexOf(a.state) - ['over-focused', 'at-risk', 'exposed', 'uncovered', 'cooling', 'balanced'].indexOf(b.state)) || b.attention_share - a.attention_share
    return b.attention_share - a.attention_share
  })
  const renderChildren = (parentId: string, level = 2): ComponentChildren => {
    if (level > depth) return null
    return ordered((children.get(parentId) || []).filter(visibleDepth)).map((branch: any) => <div class={`balance-child balance-level-${level}`} key={branch.id}><button class="balance-row" onClick={() => setSelected(branch)}><span class="balance-round">{branch.round}</span><span class="balance-name"><strong>{branch.label}</strong><small>{branch.consumed_count} completed · {branch.last_consumed_at ? formatDate(branch.last_consumed_at) : 'never touched'}</small></span><span class="balance-bar"><i style={{ width: `${Math.min(100, branch.attention_share)}%` }} /></span><span class={`state state-${branch.state}`}>{labelize(branch.state)}</span></button>{renderChildren(branch.id, level + 1)}</div>)
  }
  const branchRows = ordered(roots)
  const statusCount = (state: string) => branches.filter((branch: any) => branch.state === state).length
  return <div class="coverage-page balance-page"><div class="summary-strip"><div><strong>{balance.data?.portfolio?.total_consumed || 0}</strong><span>Completed in {windowDays}d</span></div><div><strong>{statusCount('over-focused')}</strong><span>Over-focused</span></div><div><strong>{statusCount('at-risk')}</strong><span>At risk</span></div><div><strong>{balance.data?.portfolio?.unmapped_count || 0}</strong><span>Unmapped sources</span></div></div><section class="balance-controls"><div><strong>Learning balance</strong><span>Attention, coverage, and retention share one map.</span></div><div><label>Window <select value={windowDays} onChange={(event) => setWindowDays((event.target as HTMLSelectElement).value)}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label><label>Depth <select value={depth} onChange={(event) => setDepth(Number((event.target as HTMLSelectElement).value))}><option value="1">R1 only</option><option value="2">R1 + R2</option><option value="3">R1 + R2 + R3</option><option value="9">All map depth</option></select></label><label>Sort <select value={sort} onChange={(event) => setSort((event.target as HTMLSelectElement).value)}><option value="attention">Most attention</option><option value="risk">Needs attention</option><option value="latest">Latest activity</option><option value="oldest">Oldest activity</option></select></label></div></section><section><div class="section-head"><h2>{insight ? 'Branch balance' : 'Map balance'}</h2><span>R1 collapsed by default · {branches.length} mapped nodes</span></div>{branchRows.length ? <div class="balance-tree">{branchRows.map((branch: any) => <details class="balance-branch" data-balance-id={branch.id} key={branch.id}><summary><span class="balance-round">{branch.round}</span><span class="balance-name"><strong>{branch.label}</strong><small>{branch.consumed_count} completed · last {branch.last_consumed_at ? formatDate(branch.last_consumed_at) : 'never'}</small></span><span class="balance-bar"><i style={{ width: `${Math.min(100, branch.attention_share)}%` }} /></span><span class="balance-share">{branch.attention_share.toFixed(1)}%</span><span class={`state state-${branch.state}`}>{labelize(branch.state)}</span><button class="balance-inspect" onClick={(event) => { event.preventDefault(); setSelected(branch) }}>Inspect</button></summary><div class="balance-descendants">{renderChildren(branch.id)}</div></details>)}</div> : <Empty title="No mapped branches yet" body="Completed sources will reveal where your attention and retention are going." />}</section>{(statusCount('over-focused') || statusCount('at-risk') || statusCount('exposed') || balance.data?.portfolio?.unmapped_count) && <section class="balance-attention"><div class="section-head"><h2>What needs your attention</h2><span>Signals, not a single opaque score</span></div><div class="compact-list">{ordered(branches.filter((branch: any) => ['over-focused', 'at-risk', 'exposed', 'uncovered'].includes(branch.state))).slice(0, 12).map((branch: any) => <button class="balance-signal" onClick={() => setSelected(branch)}><strong>{branch.label}</strong><span>{branch.reasons[0] || labelize(branch.state)}</span></button>)}{balance.data?.portfolio?.unmapped_count > 0 && <div class="balance-signal"><strong>Unmapped sources</strong><span>{balance.data.portfolio.unmapped_count} completed source(s) cannot be assigned to the map yet.</span></div>}</div></section>}{selected && <BalancePopup branch={selected} branches={branches} onClose={() => setSelected(null)} />}</div>
}

function BalancePopup({ branch, branches, onClose }: { branch: any; branches: any[]; onClose: () => void }) {
  const descendants = branches.filter((item) => item.id !== branch.id && (item.parent_id === branch.id || item.id.startsWith(`${branch.id}-`)))
  return <div class="balance-overlay" role="presentation" onClick={onClose}><section class="balance-popup" role="dialog" aria-modal="true" aria-label={`${branch.label} balance`} onClick={(event) => event.stopPropagation()}><div class="dialog-head"><div><span>{branch.round} branch</span><h2>{branch.label}</h2></div><button onClick={onClose}>Close</button></div><div class="balance-popup-stats"><div><strong>{branch.attention_share.toFixed(1)}%</strong><span>attention share</span></div><div><strong>{branch.priority_share == null ? '—' : `${(branch.priority_share * 100).toFixed(1)}%`}</strong><span>priority share</span></div><div><strong>{branch.recall_strength == null ? '—' : `${Math.round(branch.recall_strength * 100)}%`}</strong><span>recall strength</span></div><div><strong>{branch.srs_due}</strong><span>cards due</span></div></div><div class="balance-popup-lines"><p><strong>Status:</strong> <span class={`state state-${branch.state}`}>{labelize(branch.state)}</span></p><p><strong>Last touched:</strong> {branch.last_consumed_at ? formatDate(branch.last_consumed_at) : 'Never'}</p><p><strong>Evidence:</strong> {branch.consumed_count} completed · {branch.notes_count} notes · {branch.srs_total} recall cards</p></div>{branch.reasons.length > 0 && <div class="balance-popup-reasons"><strong>Why this appears here</strong>{branch.reasons.map((reason: string) => <span>{reason}</span>)}</div>}{descendants.length > 0 && <div class="balance-popup-children"><div class="section-head"><h3>Deeper map</h3><span>{descendants.length} nodes</span></div>{descendants.slice(0, 40).map((item: any) => <button onClick={() => { onClose(); setTimeout(() => document.querySelector(`[data-balance-id="${item.id}"]`)?.scrollIntoView({ block: 'center' }), 0) }}><span>{item.round}</span><strong>{item.label}</strong><em class={`state state-${item.state}`}>{labelize(item.state)}</em></button>)}</div>}</section></div>
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

function OverviewPage() {
  return <div class="combined-view"><InsightsOverviewPage /><ForecastPage /></div>
}

function HermesMemoryPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const endpoint = `/agent/memory?status=${encodeURIComponent(status)}${query ? `&q=${encodeURIComponent(query)}` : ''}`
  const { data, error, loading, reload } = useData(endpoint)
  const act = async (id: string, action: string) => { try { await api(`/agent/memory/${id}/${action}`, { method: 'POST' }); reload() } catch (e: any) { window.alert(e.message) } }
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  return <div class="hermes-page memory-review-page">
    <div class="filter-bar"><label>Search <input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="memory key, source, or value" /></label><label>Status <select value={status} onChange={(event) => setStatus((event.target as HTMLSelectElement).value)}><option value="active">Active</option><option value="approved">Approved</option><option value="all">All</option><option value="expired">Expired</option><option value="rejected">Rejected</option><option value="superseded">Superseded</option></select></label></div>
    <section><div class="section-head"><h2>Hermes memory review</h2><span>{data?.memories?.length || 0} entries</span></div>{data?.memories?.length ? <div class="memory-list">{data.memories.map((item: any) => <article class="memory-card" key={item.id}><div class="memory-card-head"><div><strong>{item.memory_key}</strong><span>{labelize(item.memory_kind)} · {item.status} · confidence {Math.round(Number(item.confidence || 0) * 100)}%</span></div><div class="row-actions">{item.status === 'active' && <button class="secondary-action" onClick={() => act(item.id, 'approve')}>Approve</button>}{['active', 'approved'].includes(item.status) && <button class="secondary-action" onClick={() => act(item.id, 'expire')}>Expire</button>}{item.status === 'active' && <button class="secondary-action" onClick={() => api(`/agent/memory/${item.id}/resolve`, { method: 'POST', body: JSON.stringify({ status: 'rejected' }) }).then(reload)}>Reject</button>}</div></div><p>{typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}</p><small>Source: {item.source}</small>{item.evidence?.length ? <div class="memory-evidence"><strong>Evidence and recommendation influence</strong>{item.evidence.map((e: any, index: number) => <div key={index}>{e.recommendation_id ? <a href={`#/curate/queue?record=${e.recommendation_id}`}>{e.recommendation_id}</a> : 'Evidence'}{e.reason ? ` · ${e.reason}` : ''}{e.quote ? ` · “${e.quote}”` : ''}</div>)}</div> : <small>No linked recommendation evidence recorded.</small>}</article>)}</div> : <Empty title="No memories match" body="Try another status or search term." />}</section>
  </div>
}

function HermesPage() {
  const { data, error, loading, reload } = useData('/analytics/hermes')
  const weekly = useData('/analytics/hermes/weekly')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const quality = data?.quality || {}
  const recalibrate = async () => { if (!window.confirm('Recalibrate Hermes weights from rated outcomes?')) return; try { const result = await api<any>('/analytics/hermes/recalibrate', { method: 'POST' }); window.alert(`Recalibrated from ${result.sample_size} rated outcomes.`); reload() } catch (e: any) { window.alert(e.message) } }
  const evaluate = async () => { if (!window.confirm('Create reviewable Hermes proposals from the evaluator?')) return; try { const result = await api<any>('/analytics/hermes/evaluate', { method: 'POST' }); window.alert(`Created ${result.proposals?.length || 0} review proposals.`); reload(); weekly.reload() } catch (e: any) { window.alert(e.message) } }
  const backfill = async () => { if (!window.confirm('Run the intelligence backfill now? It writes derived records but does not change approved taste rules.')) return; try { const result = await api<any>('/analytics/hermes/backfill', { method: 'POST', body: JSON.stringify({ dry_run: false }) }); window.alert(`Backfill complete: ${Object.values(result.inserted || {}).reduce((a: number, b: any) => a + Number(b || 0), 0)} records written.`); reload() } catch (e: any) { window.alert(e.message) } }
  return <div class="hermes-page">
    <div class="page-actions"><span>Learning intelligence · {formatDate(data?.checked_at)}</span><div><button class="secondary-action" onClick={evaluate}>Create evaluator proposals</button> <button class="secondary-action" onClick={backfill}>Refresh derived insights</button> <button class="secondary-action" onClick={recalibrate}>Recalibrate weights</button> <button class="secondary-action" onClick={reload}>Refresh</button></div></div>
    <div class="summary-strip"><div><strong>{quality.total || 0}</strong><span>Recommendation outcomes</span></div><div><strong>{quality.completion_rate == null ? '—' : `${quality.completion_rate}%`}</strong><span>Consumed after activation</span></div><div><strong>{quality.prediction_error == null ? '—' : quality.prediction_error}</strong><span>Prediction error</span></div><div><strong>{data?.memory?.active || 0}</strong><span>Active memories</span></div></div>
    <div class="two-column-data"><section><div class="section-head"><h2>Engine evidence</h2><span>Bounded weights</span></div><div class="compact-list">{(data?.engine_weights || []).map((item: any) => <article key={item.dimension}><strong>{labelize(item.dimension)}</strong><span>{Math.round(Number(item.current_weight || 0) * 100)}% · {item.evidence_count || 0} signals</span></article>)}</div></section><section><div class="section-head"><h2>Outcome by format</h2><span>Actual ratings</span></div><div class="compact-list">{(quality.by_format || []).map((item: any) => <article key={item.format}><strong>{labelize(item.format)}</strong><span>{item.consumed || 0}/{item.total || 0} consumed · {item.average_actual ?? '—'} average</span></article>)}</div></section></div>
    <section><div class="section-head"><h2>Memory ledger</h2><span>{data?.memory?.active || 0} active entries</span></div><div class="compact-list">{(data?.memory?.entries || []).map((item: any) => <article key={`${item.memory_kind}-${item.status}`}><strong>{labelize(item.memory_kind)}</strong><span>{item.status} · {item.count} entries</span></article>)}</div></section>
    <section><div class="section-head"><h2>Weekly evaluator</h2><span>{weekly.data?.period?.since ? `${formatDate(weekly.data.period.since)} → ${formatDate(weekly.data.period.until)}` : 'Loading'}</span></div>{weekly.error ? <ErrorState message={weekly.error} /> : <div class="compact-list"><article><strong>Accuracy</strong><span>{weekly.data?.accuracy?.completion_rate == null ? '—' : `${weekly.data.accuracy.completion_rate}% completion`} · error {weekly.data?.accuracy?.prediction_error ?? '—'}</span></article><article><strong>Abandoned sources</strong><span>{(weekly.data?.abandoned_sources || []).map((item: any) => `${item.source_class}: ${item.count}`).join(' · ') || 'None recorded'}</span></article><article><strong>Taste drift</strong><span>{(weekly.data?.taste_drift || []).map((item: any) => `${labelize(item.branch)} ${item.change > 0 ? '+' : ''}${item.change}`).join(' · ') || 'Not enough ratings'}</span></article></div>}</section>
    {Number(data?.pending_proposals || 0) > 0 && <p class="settings-status">{data.pending_proposals} Hermes change proposals still require approval in Learn → Changes.</p>}
  </div>
}

function ReminderControls() {
  const { data, error, loading, reload } = useData('/notifications')
  const [chatId, setChatId] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => { if (data?.telegram?.chat_id) setChatId(String(data.telegram.chat_id)) }, [data?.telegram?.chat_id])
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const enableBrowser = async () => {
    setStatus('Enabling browser reminders…')
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') throw new Error('Browser notification permission was not granted.')
      }
      const vapid = await api<any>('/notifications/vapid')
      let endpoint = `browser://${crypto.randomUUID()}`
      let keys: Record<string, string> = {}
      if (vapid.public_key && 'serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready
        const decoded = Uint8Array.from(atob(vapid.public_key.replace(/-/g, '+').replace(/_/g, '/') + '=='), (char) => char.charCodeAt(0))
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decoded })
        endpoint = subscription.endpoint
        keys = subscription.toJSON().keys || {}
      }
      await api('/notifications/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint, keys }) })
      await api('/notifications/test', { method: 'POST', body: JSON.stringify({ channel: 'browser' }) })
      setStatus(vapid.configured ? 'Browser push enabled and test queued.' : 'Browser reminders enabled for this device; configure VAPID keys for closed-app delivery.')
      reload()
    } catch (error: any) { setStatus(error.message) }
  }
  const saveTelegram = async () => {
    setStatus('Saving Telegram controls…')
    try { await api('/notifications/telegram', { method: 'POST', body: JSON.stringify({ chat_id: chatId, enabled: Boolean(chatId.trim()) }) }); if (chatId.trim()) await api('/notifications/test', { method: 'POST', body: JSON.stringify({ channel: 'telegram' }) }); setStatus(chatId.trim() ? 'Telegram enabled; test sent.' : 'Telegram reminders disabled.'); reload() }
    catch (error: any) { setStatus(error.message) }
  }
  return <section class="reminder-controls"><div class="section-head"><h2>Reminder delivery</h2><span>{(data?.deliveries || []).length} recent deliveries</span></div><div class="setting-row"><div><strong>Browser reminders</strong><span>{data?.browser?.enabled ? 'Enabled on this device.' : 'Due-review reminders for this device.'}</span></div><button class="secondary-action" onClick={enableBrowser}>{data?.browser?.enabled ? 'Send test' : 'Enable'}</button></div><div class="setting-row"><label><strong>Telegram chat ID</strong><span>Use @userinfobot or your bot chat to find this value.</span></label><input class="reminder-chat-input" value={chatId} onInput={(event) => setChatId((event.target as HTMLInputElement).value)} placeholder="e.g. 123456789" /><button class="secondary-action" onClick={saveTelegram}>{data?.telegram?.enabled ? 'Update' : 'Enable'}</button></div>{(data?.deliveries || []).slice(0, 5).map((delivery: any) => <div class="delivery-row" key={delivery.id}><span>{delivery.channel} · {delivery.event_kind}</span><strong class={`delivery-${delivery.status}`}>{delivery.status}</strong><small>{delivery.error || formatDate(delivery.attempted_at)}</small></div>)}{status && <output class="settings-status">{status}</output>}</section>
}

const editableProfileFields = [
  { draftKey: 'identity', apiKey: 'identity', label: 'Identity & context', description: 'Personal background and learning context.', json: true },
  { draftKey: 'mega_priority', apiKey: 'mega_priority', label: 'Mega priority focus', description: 'The highest-level topics and focus areas.', json: true },
  { draftKey: 'core_filter', apiKey: 'core_filter', label: 'Core curation filter', description: 'Primary criteria required for new content.', json: false },
  { draftKey: 'reaction_style_json', apiKey: 'reaction_style_json', label: 'Reaction style', description: 'How learning reactions and feedback should be interpreted.', json: true },
  { draftKey: 'quality_rules_json', apiKey: 'quality_rules_json', label: 'Quality & verification rules', description: 'Source verification protocol and content boundaries.', json: true },
  { draftKey: 'operational_style_json', apiKey: 'operational_style_json', label: 'Operational style', description: 'Interaction preference and communication rules.', json: true },
  { draftKey: 'patterns_summary_json', apiKey: 'patterns_summary_json', label: 'Pattern summary', description: 'The stored summary of recurring learning patterns.', json: true },
  { draftKey: 'recent_signal', apiKey: 'recent_signal', label: 'Recent signal', description: 'Latest approved learning signal and updates.', json: false },
] as const

function safeProfileJson(value: unknown) {
  if (value === null || value === undefined || value === '') return { text: 'Not set', valid: true }
  if (typeof value !== 'string') {
    try { return { text: JSON.stringify(value, null, 2) || 'Not set', valid: true } } catch { return { text: String(value), valid: false } }
  }
  try { return { text: JSON.stringify(JSON.parse(value), null, 2), valid: true } }
  catch { return { text: value, valid: false } }
}

function safeProfileText(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'string') return value
  return safeProfileJson(value).text
}

function profilePreview(value: string) {
  return value.replace(/\s+/g, ' ').trim() || 'Not set'
}

function profileValue(value: unknown) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function profileTags(value: unknown, limit = 12) {
  const parsed = profileValue(value)
  if (Array.isArray(parsed)) return parsed.slice(0, limit).map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item)
    if (item && typeof item === 'object') return String((item as any).label || (item as any).name || (item as any).topic || (item as any).role || (item as any).value || '')
    return ''
  }).filter(Boolean)
  if (parsed && typeof parsed === 'object') return Object.entries(parsed).slice(0, limit).map(([key, item]) => `${labelize(key)}${typeof item === 'string' || typeof item === 'number' ? ` · ${item}` : ''}`)
  const raw = String(parsed || '').trim()
  if ((raw.startsWith('{') || raw.startsWith('[')) && parsed === value) return ['Value needs repair']
  return raw.split(/[.;·\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, limit)
}

function ProfileField({ label, description, value, json = false }: { label: string; description: string; value: unknown; json?: boolean }) {
  const rendered = json ? safeProfileJson(value) : { text: safeProfileText(value), valid: true }
  const filled = rendered.text !== 'Not set'
  const tags = profileTags(value)
  return <article class="profile-field">
    <div class="profile-field-head"><span><strong><i class={`profile-field-dot${filled ? '' : ' empty'}`} aria-hidden="true" />{label}</strong><small>{description}</small></span></div>
    {tags.length ? <div class="profile-tag-list">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : <p class="profile-field-empty">Not set yet</p>}
  </article>
}

function recordSignal(item: any) {
  const keys = ['description', 'reason', 'rationale', 'feedback', 'reflection', 'user_review', 'summary', 'note', 'topic', 'branch_id', 'status']
  for (const key of keys) {
    const value = item?.[key]
    if (typeof value === 'string' && value.trim()) return profilePreview(value)
  }
  return ''
}

function ProfileRecord({ item, title, meta, rank }: { item: any; title: string; meta?: string; rank?: number }) {
  const signal = recordSignal(item)
  return <li class="profile-record">{rank != null && <span class="profile-rank-no" aria-hidden="true">{String(rank).padStart(2, '0')}</span>}<div class="profile-record-body"><div class="profile-record-title"><strong>{title}</strong>{meta && <small>{meta}</small>}</div>{signal && <p>{signal}</p>}</div></li>
}

function ProfilePanel({ id, title, description, count, children, open = false }: { id: string; title: string; description: string; count?: number | string; children: ComponentChildren; open?: boolean }) {
  return <section class="profile-section" id={id}>
    <details class="profile-panel" open={open}>
      <summary><span><strong>{title}</strong><small>{description}</small></span>{count != null && <em class="profile-count">{count}</em>}</summary>
      <div class="profile-panel-content">{children}</div>
    </details>
  </section>
}

function ProfileRecords({ id, title, description, items, empty, getTitle, getMeta, ranked = false, open = false }: { id: string; title: string; description: string; items: any[]; empty: string; getTitle: (item: any) => string; getMeta?: (item: any) => string; ranked?: boolean; open?: boolean }) {
  return <ProfilePanel id={id} title={title} description={description} count={items.length} open={open}>{items.length ? <ol class={`profile-record-list${ranked ? ' profile-ranked' : ''}`}>{items.map((item, index) => <ProfileRecord key={`${title}-${item.id || item.rank || index}`} item={item} title={getTitle(item)} meta={getMeta?.(item)} rank={ranked ? (item.rank ?? index + 1) : undefined} />)}</ol> : <p class="profile-empty">{empty}</p>}</ProfilePanel>
}

function ProfileStats({ id, title, description, stats }: { id: string; title: string; description: string; stats: Record<string, unknown> }) {
  const entries = Object.entries(stats || {})
  return <ProfilePanel id={id} title={title} description={description} count={`${entries.length} fields`}>{entries.length ? <dl class="profile-stats">{entries.map(([key, value]) => <div key={key}><dt>{labelize(key)}</dt><dd>{safeProfileText(value)}</dd></div>)}</dl> : <p class="profile-empty">No statistics returned.</p>}</ProfilePanel>
}

function identityParts(profile: Record<string, unknown>) {
  const raw = profile.identity_json
  if (typeof raw === 'string' && raw.trim()) {
    const parts = raw.split('·').map((part) => part.trim()).filter(Boolean)
    if (parts.length) return { name: parts[0], context: parts.slice(1) }
  }
  return { name: '', context: [] }
}

function profileInitials(profile: Record<string, unknown>) {
  const { name } = identityParts(profile)
  if (name) return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return '✦'
}

const coreProfileFields = [
  ['identity_json', 'Identity & context', 'Personal background and learning context.', true],
  ['mega_priority_json', 'Mega priority focus', 'Highest-level topics and focus areas.', true],
  ['core_filter', 'Core curation filter', 'Primary criteria required for new content.', false],
  ['reaction_style_json', 'Reaction style', 'How learning reactions and feedback should be interpreted.', true],
  ['quality_rules_json', 'Quality & verification rules', 'Source verification protocol and content boundaries.', true],
  ['operational_style_json', 'Operational style', 'Interaction preference and communication rules.', true],
  ['patterns_summary_json', 'Pattern summary', 'Stored summary of recurring learning patterns.', true],
] as const

function modelSectionCounts(items: Record<string, any>) {
  return [
    { id: 'profile-core', label: 'Core model', value: coreProfileFields.length, detail: 'fields' },
    { id: 'profile-priorities', label: 'Priorities', value: items.priorities?.length || 0, detail: 'ranked focus' },
    { id: 'profile-knowledge', label: 'Mastered', value: items.mastered?.length || 0, detail: 'topics' },
    { id: 'profile-exclusions', label: 'Exclusions', value: items.blacklist?.length || 0, detail: 'blocked' },
    { id: 'profile-signals', label: 'Patterns', value: items.patterns?.length || 0, detail: 'heuristics' },
    { id: 'profile-affinities', label: 'Affinities', value: items.taste_vectors?.length || 0, detail: 'topics' },
    { id: 'profile-creators', label: 'Creators', value: items.creator_trust?.length || 0, detail: 'tracked' },
    { id: 'profile-history', label: 'Reflections', value: items.reflections?.length || 0, detail: 'written' },
    { id: 'profile-ratings', label: 'Ratings', value: items.rating_history?.length || 0, detail: 'sources' },
    { id: 'profile-activity', label: 'Activity', value: items.recent?.length || 0, detail: 'changes' },
    { id: 'profile-feeds', label: 'Feeds', value: items.feed_sources?.length || 0, detail: 'subscribed' },
    { id: 'profile-stats', label: 'Statistics', value: '—', detail: 'readout' },
  ]
}

function setProfilePanels(open: boolean) {
  document.querySelectorAll<HTMLDetailsElement>('.model-sections .profile-panel').forEach((panel) => { panel.open = open })
}

function openProfileSection(id: string) {
  const section = document.getElementById(id)
  const panel = section?.querySelector<HTMLDetailsElement>('.profile-panel')
  if (panel) panel.open = true
  if (id === 'profile-core') section?.querySelector<HTMLDetailsElement>('.profile-editor')?.setAttribute('open', '')
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function ModelHeader({ profile }: { profile: Record<string, unknown> }) {
  const { name, context } = identityParts(profile)
  const signal = typeof profile.recent_signal === 'string' && profile.recent_signal.trim() ? profilePreview(profile.recent_signal) : ''
  return <section class="model-header">
    <div class="model-header-main">
      <div class="model-identity">
        <span class="model-avatar" aria-hidden="true">{profileInitials(profile)}</span>
        <div class="model-identity-copy"><span class="meta">Personal learning model</span><h2>{name || 'Learning model'}</h2>{context.length > 0 && <p class="model-context">{context.map((part, index) => <span key={part}>{index > 0 && <i aria-hidden="true">·</i>}{part}</span>)}</p>}</div>
      </div>
      <div class="model-header-side">{typeof profile.last_synced_at === 'string' && profile.last_synced_at && <span class="model-synced">Synced {profile.last_synced_at}</span>}<button class="primary-action" onClick={() => openProfileSection('profile-core')}>Edit model</button></div>
    </div>
    {signal && <div class="model-signal"><span class="model-signal-kicker">Latest approved signal</span><p>{signal}</p></div>}
  </section>
}

function ModelIndex({ items }: { items: Record<string, any> }) {
  const entries = useMemo(() => modelSectionCounts(items), [items])
  const [active, setActive] = useState('profile-core')
  useEffect(() => {
    const sections = entries.map((entry) => document.getElementById(entry.id)).filter(Boolean) as HTMLElement[]
    const observer = new IntersectionObserver((hits) => {
      const visible = hits.filter((hit) => hit.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '-140px 0px -62% 0px', threshold: 0 })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [entries])
  return <nav class="model-index" aria-label="Model sections">
    <div class="model-index-head"><strong>Model index</strong><span>{entries.length} sections</span></div>
    {entries.map((entry) => <button class={active === entry.id ? 'active' : ''} onClick={() => openProfileSection(entry.id)}><span>{entry.label}</span><em>{entry.value}</em></button>)}
    <div class="model-index-actions"><button onClick={() => setProfilePanels(true)}>Open sections</button><button onClick={() => setProfilePanels(false)}>Collapse all</button></div>
  </nav>
}

function SettingsPage({ route }: { route: Destination }) {
  const [theme, setTheme] = useState(localStorage.getItem('tm-theme') || 'system')
  const [density, setDensity] = useState(localStorage.getItem('tm-density') || 'balanced')
  const [retention, setRetention] = useState(90)
  const [enrichCapture, setEnrichCapture] = useState(true)
  const [saved, setSaved] = useState('')
  const [offline, setOffline] = useState<any[]>([])
  const [profileDraft, setProfileDraft] = useState<Record<string, string> | null>(null)
  const [profileOriginal, setProfileOriginal] = useState<Record<string, string> | null>(null)
  const profile = useData(route.slug === 'profile' ? '/brain/profile?recent_limit=50' : undefined)
  const settings = useData('/settings')
  const refreshOffline = () => listOfflineMutations().then(setOffline)
  useEffect(() => { refreshOffline() }, [])
  useEffect(() => {
    const resolved = settings.data?.resolved
    if (!resolved) return
    setTheme(resolved.appearance.theme); setDensity(resolved.appearance.density)
    setRetention(resolved.learning.retention)
    setEnrichCapture(resolved.ai_curation.enrich_capture)
    localStorage.setItem('tm-theme', resolved.appearance.theme); localStorage.setItem('tm-density', resolved.appearance.density)
    applyTheme(resolved.appearance.theme); document.documentElement.dataset.density = resolved.appearance.density
  }, [settings.data?.resolved])
  useEffect(() => {
    if (!profile.data?.profile) return
    const next = Object.fromEntries(editableProfileFields.map(({ draftKey, apiKey }) => [draftKey, String(profile.data.profile[apiKey === 'identity' ? 'identity_json' : apiKey === 'mega_priority' ? 'mega_priority_json' : apiKey] || '')]))
    setProfileDraft(next)
    setProfileOriginal(next)
  }, [profile.data?.profile])
  const persist = async (key: string, value: unknown) => { setSaved('Saving…'); try { await api(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }); setSaved('Saved'); setTimeout(() => setSaved(''), 1400) } catch (error: any) { setSaved(error.message) } }
  const changeTheme = (value: string) => { setTheme(value); localStorage.setItem('tm-theme', value); applyTheme(value); persist('appearance', { theme: value, density }) }
  const changeDensity = (value: string) => { setDensity(value); localStorage.setItem('tm-density', value); document.documentElement.dataset.density = value; persist('appearance', { theme, density: value }) }
  const saveProfile = async () => {
    if (!profileDraft || !profileOriginal) return
    const payload = Object.fromEntries(editableProfileFields.filter(({ draftKey }) => profileDraft[draftKey] !== profileOriginal[draftKey]).map(({ draftKey, apiKey }) => [apiKey, profileDraft[draftKey]]))
    setSaved(Object.keys(payload).length ? 'Saving profile…' : 'No profile changes')
    if (!Object.keys(payload).length) return
    try { await api('/brain/profile', { method: 'POST', body: JSON.stringify(payload) }); setSaved('Profile saved'); profile.reload() } catch (error: any) { setSaved(error.message) }
  }
  const profileRow = profile.data?.profile
  const profileItems = profile.data || {}
  return <div class={`settings-page ${route.slug === 'profile' ? 'profile-settings-page' : ''}`}><section>
    {route.slug === 'profile' && <>{profile.loading ? <Loading /> : profile.error ? <ErrorState message={profile.error} /> : <div class="profile-page profile-overview">
      {profileRow ? <><ModelHeader profile={profileRow} />
        <div class="model-layout"><ModelIndex items={profileItems} /><div class="model-sections">
          <div class="model-group"><h3 class="model-group-title">The model</h3>
            <ProfilePanel id="profile-core" title="Core profile" description="Identity, focus, rules, and operating style." count={`${coreProfileFields.length} fields`} open><div class="profile-fields">{coreProfileFields.map(([key, label, description, json]) => <ProfileField key={key} label={label} description={description} value={profileRow[key]} json={json} />)}</div>{profileDraft && <details class="profile-editor"><summary>Edit core profile</summary><p>Values are saved as entered. Unchanged fields are never sent.</p>{editableProfileFields.map((field) => <label key={field.draftKey}>{field.label}<span>{field.description}</span><textarea maxLength={5000} aria-label={field.label} value={profileDraft[field.draftKey]} onInput={(event) => setProfileDraft({ ...profileDraft, [field.draftKey]: (event.target as HTMLTextAreaElement).value })} /></label>)}<button class="primary-action" onClick={saveProfile}>Save profile</button></details>}</ProfilePanel>
          </div>
          <div class="model-group"><h3 class="model-group-title">Focus</h3>
            <ProfileRecords id="profile-priorities" title="Priorities" description="Every ranked learning focus, in order." items={profileItems.priorities || []} empty="No priorities recorded." ranked open getTitle={(item) => item.label || item.branch_id || item.id || 'Priority'} getMeta={() => ''} />
            <ProfileRecords id="profile-knowledge" title="Mastered knowledge & frameworks" description="Everything already marked as learned, with evidence and review timing." items={profileItems.mastered || []} empty="No mastered topics recorded." getTitle={(item) => item.label || item.id || 'Mastered item'} getMeta={(item) => [item.kind, item.author, item.rating].filter(Boolean).join(' · ')} />
          </div>
          <div class="model-group"><h3 class="model-group-title">Guardrails</h3>
            <ProfileRecords id="profile-exclusions" title="Exclusions" description="Creators, works, and boundaries the Compass must avoid." items={profileItems.blacklist || []} empty="No exclusions recorded." getTitle={(item) => [item.name, item.work].filter(Boolean).join(' · ') || item.id || 'Excluded item'} getMeta={(item) => item.severity == null ? '' : `Severity ${item.severity}`} />
            <ProfileRecords id="profile-signals" title="Patterns & heuristics" description="Confirmed and locked rules learned from your feedback." items={profileItems.patterns || []} empty="No learning patterns recorded." getTitle={(item) => item.description || item.id || 'Pattern'} getMeta={(item) => [item.strength, item.confirmed_date].filter(Boolean).join(' · ')} />
          </div>
          <div class="model-group"><h3 class="model-group-title">Taste</h3>
            <ProfileRecords id="profile-affinities" title="Taste affinities" description="Your learned topic affinity, consumption history, and recency." items={profileItems.taste_vectors || []} empty="No taste affinities recorded." getTitle={(item) => item.topic || 'Topic'} getMeta={(item) => `${item.consumption_count || 0} completed · affinity ${item.affinity_score ?? '—'}`} />
            <ProfileRecords id="profile-creators" title="Creator history" description="Every creator you have actually consumed, including your score history." items={profileItems.creator_trust || []} empty="No creator history available." getTitle={(item) => item.creator || 'Creator'} getMeta={(item) => `${item.total ?? 0} consumed · ${item.average_score ?? '—'} average`} />
          </div>
          <div class="model-group"><h3 class="model-group-title">Record</h3>
            <ProfileRecords id="profile-history" title="Your reflections" description="Your own written learning reactions, kept verbatim." items={profileItems.reflections || []} empty="No reflections recorded." getTitle={(item) => item.video_title || 'Learning reflection'} getMeta={(item) => item.completed_at || ''} />
            <ProfileRecords id="profile-ratings" title="Rating history" description="Your ratings, scores, and written reactions on completed sources." items={profileItems.rating_history || []} empty="No rated sources recorded." getTitle={(item) => item.video_title || 'Rated source'} getMeta={(item) => [item.creator, item.user_score ?? item.user_rating].filter(Boolean).join(' · ')} />
            <ProfileRecords id="profile-activity" title="Profile activity" description="Changes and signals recorded against your learning model." items={profileItems.recent || []} empty="No profile activity recorded." getTitle={(item) => item.summary || item.kind || 'Activity'} getMeta={(item) => item.ts || ''} />
            <ProfileRecords id="profile-feeds" title="Feed sources" description="RSS and Atom sources currently attached to your learning system." items={profileItems.feed_sources || []} empty="No feed sources recorded." getTitle={(item) => item.title || item.feed_url || item.id || 'Feed source'} getMeta={(item) => item.is_active ? 'Active' : 'Paused'} />
            <ProfileStats id="profile-stats" title="Statistics & system" description="Your sessions, recall state, and stored artifacts." stats={Object.fromEntries(Object.entries({ ...(profileItems.activity_stats || {}), ...(profileItems.srs_stats || {}), artifacts: profileItems.infrastructure_stats?.artifacts_count, pending_proposals: profileItems.infrastructure_stats?.pending_proposals_count }).filter(([, value]) => value != null))} />
          </div>
        </div></div>
      </> : <Empty title="No profile record" body="The profile endpoint returned no singleton profile row." />}
    </div>}</>}
    {route.slug === 'preferences' && <><div class="setting-section"><h3>Appearance</h3><div class="setting-row"><div><strong>Theme</strong><span>Follow the device unless you choose an override.</span></div><select value={theme} onChange={(event) => changeTheme((event.target as HTMLSelectElement).value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="setting-row"><div><strong>Density</strong><span>Balanced for daily use; compact when managing large libraries.</span></div><select value={density} onChange={(event) => changeDensity((event.target as HTMLSelectElement).value)}><option value="balanced">Balanced</option><option value="compact">Compact</option></select></div></div><div class="setting-section"><h3>Learning</h3><div class="setting-row"><div><strong>Active queue</strong><span>Five deliberate items; Inbox remains unlimited.</span></div><span class="setting-value">5 slots</span></div><label class="setting-row"><div><strong>Review target</strong><span>Used to adjust future recall intervals.</span></div><select value={retention} onChange={(event) => { const value = Number((event.target as HTMLSelectElement).value); setRetention(value); persist('learning', { retention: value, queue_cap: 5 }) }}><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option></select></label><div class="setting-row"><div><strong>Rating 7+ notes and cards</strong><span>Notes Extractor runs after a completed rating of 7 or higher.</span></div><span class="setting-value">Automatic</span></div></div><div class="setting-section"><h3>Curation</h3><label class="setting-row"><div><strong>Enrich new captures</strong><span>Queue enrichment only when enabled.</span></div><input type="checkbox" checked={enrichCapture} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setEnrichCapture(enabled); persist('ai_curation', { enrich_capture: enabled }) }} /></label><div class="setting-row"><div><strong>Hermes change confirmation</strong><span>Every taste, profile, pattern, and map change requires approval.</span></div><span class="setting-value">Required</span></div><div class="setting-row"><div><strong>Automatic recommendations</strong><span>Finishing one source does not automatically add another.</span></div><span class="setting-value">Off</span></div></div></>}
    {route.slug === 'data' && <><div class="setting-row"><div><strong>Cloud library</strong><span>Your sources, notes, ratings, map, and files are available.</span></div><span class="status">Connected</span></div><div class="setting-row"><div><strong>Offline changes</strong><span>{offline.length ? `${offline.length} waiting · conflicts stay visible until you resolve them.` : 'No pending local changes.'}</span></div><button class="secondary-action" onClick={() => flushOfflineMutations().then(() => refreshOffline().then(() => setSaved('Sync complete')))}>Sync now</button></div>{offline.length > 0 && <div class="offline-mutation-list">{offline.map((item) => <div class="offline-mutation" key={item.id}><span><strong>{item.state || 'pending'}</strong><small>{item.method} {item.url} · {item.error || 'Waiting to sync'}</small></span><div>{(item.state === 'conflict' || item.state === 'failed') && <button onClick={() => resolveOfflineMutation(item.id, 'retry').then(refreshOffline)}>Retry</button>}<button onClick={() => resolveOfflineMutation(item.id, 'discard').then(refreshOffline)}>Discard</button></div></div>)}</div>}<ReminderControls /><div class="setting-row"><div><strong>Export source library</strong><span>Download your recommendation history as a portable file.</span></div><a class="secondary-action" href="/recommendations/export">Download export</a></div><div class="setting-row"><div><strong>Saved preferences</strong><span>{Object.keys(settings.data?.settings || {}).length} preference groups stored.</span></div><span class="setting-value">{settings.error ? 'Unavailable' : 'Up to date'}</span></div></>}
    {saved && <output class="settings-status">{saved}</output>}
  </section></div>
}

function View({ route }: { route: Destination }) {
  if (route.key === 'today.momentum') return <TodayPage />
  if (route.key === 'curate.inbox') return <InboxPage />
  if (route.key === 'curate.queue') return <QueuePage />
  if (route.key === 'curate.books') return <BooksPage />
  if (route.key === 'curate.collections') return <CollectionsPage scope="curate" />
  if (route.key === 'curate.archive') return <ArchivePage />
  if (route.key === 'map.atlas') return <Suspense fallback={<div class="atlas-loading"><div /><span>Preparing spatial canvas…</span></div>}><AtlasPage /></Suspense>
  if (route.key === 'map.coverage') return <div class="combined-view"><CoveragePage /><ContradictionsPage /></div>
  if (route.key === 'learn.files') return <ArtifactsPage />
  if (route.key === 'learn.notes') return <NotesPage />
  if (route.key === 'learn.recall') return <RecallPage />
  if (route.key === 'learn.activity') return <ActivityPage />
  if (route.key === 'insights.overview') return <OverviewPage />
  if (route.key === 'insights.taste') return <TastePage insight />
  if (route.key === 'insights.hermes') return <div class="combined-view"><HermesPage /><HermesMemoryPage /></div>
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
  const submit = async (event?: Event) => { event?.preventDefault(); setStatus('Capturing…'); try { let uploadedId = artifactId; if (file && !uploadedId) { const form = new FormData(); form.append('file', file); const response = await fetch('/artifacts', { method: 'POST', body: form }); const uploaded = await response.json() as { id?: string; error?: string }; if (!response.ok || !uploaded.id) throw new Error(uploaded.error || 'Upload failed'); uploadedId = uploaded.id; setArtifactId(uploadedId) } const result = await api<any>('/capture', { method: 'POST', body: JSON.stringify({ source: file?.name || source, artifact_id: uploadedId || undefined }) }); setStatus(result.duplicate ? 'Already captured — opened the existing item.' : 'Captured to Inbox for triage.'); setSource(''); setFile(null); setArtifactId('') } catch (error: any) { if (!navigator.onLine && !file && !error?.offlineQueued) { await queueOfflineMutation('/capture', { method: 'POST', body: JSON.stringify({ source }) }); setStatus('Saved offline. It will sync when you reconnect.') } else setStatus(error.message) } }
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
  const [completionState, setCompletionState] = useState('completed')
  const [reasonTags, setReasonTags] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [effort, setEffort] = useState('moderate')
  const [lengthMinutes, setLengthMinutes] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => { if (session) { setReflection(''); setRating('8'); setCompletionState('completed'); setReasonTags(''); setExpected(''); setActual(''); setEffort('moderate'); setLengthMinutes(''); setStatus(''); ref.current?.showModal() } else ref.current?.close() }, [session?.id])
  if (!session) return null
  const submit = async (complete: boolean) => {
    setStatus(complete ? 'Finishing and processing…' : 'Saving your place…')
    try {
      const state = complete ? completionState : 'in_progress'
      await api(`/sessions/${session.id}/return`, { method: 'POST', body: JSON.stringify({ reflection, score: rating ? Number(rating) : undefined, complete: state === 'completed', completion_state: state, reason_tags: reasonTags.split(',').map((tag) => tag.trim()).filter(Boolean), expected, actual, effort, length_minutes: lengthMinutes ? Number(lengthMinutes) : undefined, auto_enqueue: state === 'completed' }) })
      if (state === 'completed') { localStorage.removeItem('tm-active-session'); onComplete() } else onClose()
      return true
    } catch (error: any) { setStatus(error.message); return false }
  }
  const dismiss = () => onClose()
  return <dialog ref={ref} class="return-dialog" onClose={dismiss}><div class="dialog-head"><div><span>Learning handoff</span><h2>What changed after reading?</h2></div><button onClick={dismiss}>Later</button></div><p class="return-source">{session.title}</p><label>My notes & reaction<textarea autoFocus value={reflection} onInput={(event) => setReflection((event.target as HTMLTextAreaElement).value)} placeholder="What surprised you? What do you disagree with? What will you use?" /></label><label>Score <span>{rating}/10</span><input type="range" min="0" max="10" value={rating} onInput={(event) => setRating((event.target as HTMLInputElement).value)} /></label><div class="feedback-fields"><label>Status<select value={completionState} onChange={(event) => setCompletionState((event.target as HTMLSelectElement).value)}><option value="completed">Completed</option><option value="in_progress">Still in progress</option><option value="stopped">Stopped</option></select></label><label>Effort<select value={effort} onChange={(event) => setEffort((event.target as HTMLSelectElement).value)}><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select></label><label>Minutes spent<input type="number" min="0" value={lengthMinutes} onInput={(event) => setLengthMinutes((event.target as HTMLInputElement).value)} /></label></div><label>Reason tags<input value={reasonTags} onInput={(event) => setReasonTags((event.target as HTMLInputElement).value)} placeholder="practical, too shallow, revisit" /></label><div class="feedback-fields"><label>Expected<textarea value={expected} onInput={(event) => setExpected((event.target as HTMLTextAreaElement).value)} placeholder="What did you expect?" /></label><label>Actual<textarea value={actual} onInput={(event) => setActual((event.target as HTMLTextAreaElement).value)} placeholder="What did you actually get?" /></label></div><div class="return-actions"><a href={session.sourceUrl} target="_blank" rel="noreferrer">Resume source</a><button onClick={async () => { if (await submit(false)) localStorage.removeItem('tm-active-session') }}>Save for later</button><button class="primary-action" disabled={!reflection.trim()} onClick={() => submit(true)}>{completionState === 'completed' ? 'Finish and process' : 'Save feedback'}</button></div>{status && <output>{status}</output>}</dialog>
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
