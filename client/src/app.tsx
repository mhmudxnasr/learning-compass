import { ComponentChildren } from 'preact'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, flushOfflineMutations, formatDate, labelize, queueOfflineMutation } from './api'
import { Destination, destinationForPath, destinations, workspaceOrder, WorkspaceKey } from './destinations'

const AtlasPage = lazy(() => import('./features/atlas/AtlasPage'))

const workspaceLabels: Record<WorkspaceKey, string> = {
  today: 'Today', curate: 'Curate', map: 'Map', learn: 'Learn', vault: 'Vault', insights: 'Insights', settings: 'Settings',
}

const icons: Record<WorkspaceKey | 'search' | 'capture' | 'more', ComponentChildren> = {
  today: <path d="M4 5h16M4 12h10M4 19h7" />,
  curate: <><path d="M4 4h16v16H4z" /><path d="M4 13h5l2 3h2l2-3h5" /></>,
  map: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-10-4 10M7 6h10" /></>,
  learn: <><path d="M4 5a3 3 0 0 1 3-3h13v18H7a3 3 0 0 0 0-6h13" /></>,
  vault: <><path d="M3 6h7l2 2h9v12H3z" /></>,
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
      <button class="brand" onClick={setRail} title="Toggle navigation"><span class="brand-mark">TM</span><span class="brand-name">Taste Map</span></button>
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
      <button class={['map', 'vault', 'insights', 'settings'].includes(route.workspace) ? 'active' : ''} onClick={onMore}><Icon name="more" /><span>More</span></button>
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
    <section class="activity-list"><div class="module-head"><h3>Recent output</h3><button onClick={() => go(destinations.find((item) => item.key === 'vault.notes')!)}>Open notes</button></div>{(data?.recent || []).length ? data.recent.map((item: any) => <div class="activity-row"><span>{item.content_type || 'item'}</span><strong>{item.video_title}</strong><time>{formatDate(item.updated_at || item.created_at)}</time></div>) : <Empty title="No finished work yet" body="Completed notes, reviews, and reading files will collect here." />}</section>
  </div>
}

function QueuePage() {
  const { data, error, loading } = useData('/capture/queue')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const items = data?.items || []
  return <div class="queue-view"><div class="queue-summary"><div><strong>{items.length}</strong><span>active of five</span></div><p>Finish, reject, or deliberately override before the queue grows.</p></div>{items.length > 5 && <div class="queue-warning">Override active · finish {items.length - 5} extra {items.length - 5 === 1 ? 'item' : 'items'} to restore focus.</div>}<div class="queue-list">{items.map((item: any, index: number) => <article class="queue-row"><span class="queue-index">{String(index + 1).padStart(2, '0')}</span><div><span class="meta">{item.content_type || 'source'} · {item.creator || 'Unknown'}</span><h3>{item.video_title}</h3><p>{item.why_this}</p></div><a href={item.video_url} target="_blank" rel="noreferrer" onClick={(event) => startExternal(event, item)}>Start</a></article>)}{Array.from({ length: Math.max(0, 5 - items.length) }).map(() => <div class="queue-slot">Available slot</div>)}</div></div>
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
  return <div class="inbox-view">
    <section class="feed-manager">
      <div class="feed-manager-head"><div><h2>RSS &amp; Atom feeds</h2><p>New articles arrive here automatically every six hours.</p></div><button type="button" disabled={feedWorking || !feeds.length} onClick={syncFeeds}>Check now</button></div>
      <form class="feed-create" onSubmit={addFeed}><label for="feed-url">Feed URL</label><div><input id="feed-url" type="url" value={feedUrl} onInput={(event) => setFeedUrl((event.target as HTMLInputElement).value)} placeholder="https://example.com/feed.xml" required /><button class="primary-action" disabled={feedWorking || !feedUrl.trim()}>Subscribe</button></div></form>
      {feeds.length > 0 && <div class="feed-list">{feeds.map((feed: any) => <div><span><strong>{feed.title}</strong><small>{feed.entry_count || 0} seen · {feed.last_checked_at ? `checked ${formatDate(feed.last_checked_at)}` : 'not checked yet'}</small>{feed.last_error && <small class="feed-error">{feed.last_error}</small>}</span><button type="button" disabled={feedWorking} onClick={() => removeFeed(feed)}>Remove</button></div>)}</div>}
      {feedStatus && <output class="feed-status">{feedStatus}</output>}
    </section>
    <div class="inbox-summary"><strong>{items.length} waiting</strong><span>Promote only what deserves one of five active queue slots.</span></div>
    {blocked && <div class="queue-warning"><span>{blocked.error || 'Queue full. Finish an active item or make this a deliberate override.'}</span>{!blocked.error && <button onClick={() => triage(blocked, 'queue', true)}>Add anyway</button>}</div>}
    {items.length ? <div class="record-list">{items.map((item: any, index: number) => <article><span class="record-number">{String(index + 1).padStart(2, '0')}</span><div><span class="meta">{item.feed_title ? `rss · ${item.feed_title}` : item.content_type || 'source'}</span><h3>{item.video_title}</h3><p>{item.why_this || item.video_url}</p></div><div class="row-actions"><button disabled={working === item.id} onClick={() => triage(item, 'exclude')}>Exclude</button><button class="primary-action" disabled={working === item.id} onClick={() => triage(item, 'queue')}>Queue</button></div></article>)}</div> : <Empty title="Inbox clear" body="New captures and feed articles land here for a quick fit check before they earn a queue slot." />}
  </div>
}

function CollectionsPage({ scope }: { scope: 'curate' | 'vault' }) {
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
    {scope === 'curate' && <form class="inline-create" onSubmit={create}><label for="collection-name">New learning collection</label><div><input id="collection-name" value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="e.g. Decision making" /><button class="primary-action" disabled={!name.trim()}>Create</button></div>{status && <output>{status}</output>}</form>}
    {collections.length ? <div class="collection-list">{collections.map((item: any) => <article><div><h2>{item.name}</h2><p>{item.description || (scope === 'curate' ? 'An active group of sources to learn together.' : 'A completed group of connected learning.')}</p></div><strong>{item.item_count || 0}<span> sources</span></strong></article>)}</div> : <Empty title={scope === 'curate' ? 'No active collections' : 'No completed collections'} body={scope === 'curate' ? 'Create a collection when several sources belong to one learning goal.' : 'Collections move here when their learning goal is complete.'} />}
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

function NotesPage({ kind }: { kind?: string }) {
  const { data, error, loading, reload } = useData(kind ? `/notes?kind=${kind}` : '/notes')
  const [selected, setSelected] = useState<any>(null)
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const notes = data?.notes || []
  if (!notes.length) return <Empty title={kind === 'reflection' ? 'No unfinished reflections' : 'No learning notes yet'} body={kind === 'reflection' ? 'Return from a learning session and save a reaction to continue it here.' : 'Finish a source and process it to create an editable learning note.'} />
  const note = selected || notes[0]
  const updateSection = (key: string, content: string) => setSelected((current: any) => ({ ...(current || note), sections: (current || note).sections.map((section: any) => section.section_key === key ? { ...section, content } : section) }))
  const save = async () => { setStatus('Saving…'); try { await api(`/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ title: note.title, sections: note.sections }) }); setStatus('Saved'); reload(); return true } catch (saveError: any) { setStatus(saveError.message); return false } }
  const finish = async () => { if (await save()) { setStatus('Queueing note processing…'); try { await api(`/notes/${note.id}/process`, { method: 'POST' }); setStatus('Processing queued') } catch (finishError: any) { setStatus(finishError.message) } } }
  return <div class="notes-layout"><aside>{notes.map((item: any) => <button class={item.id === note.id ? 'active' : ''} onClick={() => { setSelected(item); setStatus('') }}><strong>{item.title}</strong><span>{item.branch_id || 'Unmapped'} · {formatDate(item.updated_at)}</span></button>)}</aside><article class="note-document"><div class="note-kicker">{note.branch_id || 'Learning note'}</div><input aria-label="Note title" class="note-title-input" value={note.title} onInput={(event) => setSelected({ ...note, title: (event.target as HTMLInputElement).value })} /><p class="note-source">{note.source_url ? <a href={note.source_url} target="_blank" rel="noreferrer">Open original source</a> : 'No source link attached'}</p>{(note.sections || []).map((section: any) => <section dir={section.direction || 'auto'}><h3>{section.label}</h3><textarea aria-label={section.label} class="note-editor" value={section.content} onInput={(event) => updateSection(section.section_key, (event.target as HTMLTextAreaElement).value)} /></section>)}<div class="note-actions"><button disabled={status === 'Saving…'} onClick={save}>Save draft</button><button class="primary-action" disabled={status === 'Saving…' || status === 'Queueing note processing…'} onClick={finish}>Finish note</button></div>{status && <output class="note-status">{status}</output>}</article></div>
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
  const { data, error, loading, reload } = useData('/srs/drafts')
  const [editing, setEditing] = useState<any>(null)
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const drafts = (data?.drafts || []).filter((draft: any) => draft.status === 'draft')
  if (!drafts.length) return <Empty title="No recall drafts to review" body="High-rated learning sessions produce editable drafts here before anything enters Review." />
  const act = async (draft: any, action: 'save' | 'approve' | 'reject') => { const value = editing?.id === draft.id ? editing : draft; setStatus(action === 'approve' ? 'Approving…' : action === 'reject' ? 'Discarding…' : 'Saving…'); try { if (action === 'save') await api(`/srs/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify(value) }); else { if (editing?.id === draft.id) await api(`/srs/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify(value) }); await api(`/srs/drafts/${draft.id}/${action}`, { method: 'POST' }) } setEditing(null); setStatus(''); reload() } catch (error: any) { setStatus(error.message) } }
  return <div class="drafts-view"><div class="drafts-intro"><strong>{drafts.length} drafts awaiting judgment</strong><span>Edit for clarity. Approve only prompts worth remembering.</span></div>{drafts.map((draft: any) => { const value = editing?.id === draft.id ? editing : draft; return <article class="draft-card"><div class="draft-meta"><span>{draft.topic || 'General'}</span><small>{formatDate(draft.created_at)}</small></div><label>Question<textarea value={value.question} onFocus={() => setEditing({ ...draft })} onInput={(event) => setEditing({ ...value, question: (event.target as HTMLTextAreaElement).value })} /></label><label>Answer<textarea value={value.answer} onFocus={() => setEditing({ ...draft })} onInput={(event) => setEditing({ ...value, answer: (event.target as HTMLTextAreaElement).value })} /></label><div class="draft-actions"><button onClick={() => act(draft, 'reject')}>Discard</button>{editing?.id === draft.id && <button onClick={() => act(draft, 'save')}>Save draft</button>}<button class="primary-action" disabled={!value.question.trim() || !value.answer.trim()} onClick={() => act(draft, 'approve')}>Approve for Review</button></div></article> })}{status && <output class="sticky-status">{status}</output>}</div>
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
    return { id, files, html, pdf, markdown, primary, metadata: primary.metadata || {} }
  })
  if (!pairs.length) return <Empty title="No files yet" body="Uploaded documents and generated reading companions will appear here." />
  const process = async (file: any) => { setWorking(file.id); setStatus('Queueing extraction…'); try { const result = await api<{ status: string }> (`/artifacts/${file.id}/process`, { method: 'POST' }); setStatus(result.status === 'retry' ? 'Extraction retry queued.' : 'Extraction queued.'); reload() } catch (processError: any) { setStatus(processError.message) } finally { setWorking('') } }
  const remove = async (pair: any) => {
    const files = pair.files
    if (!files.length || !window.confirm(`Remove “${pair.metadata.source_title || pair.primary.filename}” from Vault?${files.length > 1 ? ` This removes all ${files.length} linked files.` : ''}`)) return
    setWorking(pair.id); setStatus('Removing…')
    try { for (const file of files) await api(file.legacy ? '/vault/delete' : `/artifacts/${file.id}`, { method: file.legacy ? 'POST' : 'DELETE', ...(file.legacy ? { body: JSON.stringify({ id: file.id }) } : {}) }); setStatus('Removed from Vault.'); reload() }
    catch (removeError: any) { setStatus(removeError.message) }
    finally { setWorking('') }
  }
  return <div class="artifact-library"><div class="artifact-library-head"><strong>{pairs.length} {pairs.length === 1 ? 'source' : 'sources'}</strong><span>Reading files and companions stay together.</span></div><div class="artifact-table">{pairs.map((pair) => {
    const title = pair.metadata.source_title || pair.primary.filename?.replace(/\.(html?|pdf|md)$/i, '') || 'Untitled file'
    const href = (file: any) => file.legacy ? `/html/download/${file.id}` : /markdown|text\/plain/i.test(file.media_type || '') || /\.md$/i.test(file.filename || '') ? `/artifacts/${file.id}/view` : `/artifacts/${file.id}`
    const extraction = pair.html?.extraction
    return <article><div class="artifact-kind"><span>{pair.files.length > 1 ? 'Reading companion' : pair.primary.media_type?.includes('pdf') ? 'Document' : pair.markdown ? 'Markdown' : 'Web file'}</span><small>{formatDate(pair.primary.created_at)}</small></div><div class="artifact-copy"><h3>{title}</h3><p>{pair.metadata.source_url || `${pair.files.length} ${pair.files.length === 1 ? 'file' : 'linked files'}`}</p>{extraction && <small class={`artifact-extraction state-${extraction.status}`}>{extraction.status === 'failed' ? extraction.error || 'Extraction failed' : `Extraction ${extraction.status}`}</small>}</div><div class="artifact-actions">{pair.metadata.source_url && <a href={pair.metadata.source_url} target="_blank" rel="noreferrer">Original</a>}{pair.html && <a class="primary-action" href={href(pair.html)} target="_blank" rel="noreferrer">Read</a>}{pair.markdown && !pair.html && <a class="primary-action" href={href(pair.markdown)} target="_blank" rel="noreferrer">Read</a>}{pair.pdf && <a href={href(pair.pdf)} target="_blank" rel="noreferrer">PDF</a>}{pair.html && (!extraction || extraction.status === 'failed') && <button disabled={working === pair.html.id} onClick={() => process(pair.html)}>{extraction?.status === 'failed' ? 'Retry extraction' : 'Extract notes'}</button>}{pair.files.length > 0 && <button class="artifact-remove" disabled={working === pair.id} onClick={() => remove(pair)}>Remove</button>}</div></article>
  })}</div>{status && <output class="sticky-status">{status}</output>}</div>
}

function SessionsPage() {
  const { data, error, loading } = useData('/sessions')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const sessions = (data?.sessions || []).filter((session: any) => session.status !== 'completed')
  if (!sessions.length) return <Empty title="No active learning sessions" body="Starting an item from Today or Queue records the handoff automatically." />
  const reflect = (session: any) => { localStorage.setItem('tm-active-session', JSON.stringify({ id: session.id, recommendationId: session.recommendation_id, title: session.video_title, sourceUrl: session.video_url })); window.dispatchEvent(new Event('focus')) }
  return <div class="sessions-view">{sessions.map((session: any) => <article><div><span class={`session-state state-${session.status}`}>{session.status}</span><h3>{session.video_title || 'Untitled learning session'}</h3><p>{formatDate(session.started_at)} · {session.creator || 'Unknown creator'}</p></div><div class="row-actions">{session.status !== 'completed' && <><a href={session.video_url} target="_blank" rel="noreferrer">Resume</a><button class="primary-action" onClick={() => reflect(session)}>Reflect</button></>}</div></article>)}</div>
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
  const [draftsEnabled, setDraftsEnabled] = useState(true)
  const [enrichCapture, setEnrichCapture] = useState(true)
  const [reviewRequired, setReviewRequired] = useState(true)
  const [saved, setSaved] = useState('')
  const profile = useData(route.slug === 'profile' ? '/brain/profile' : undefined)
  const settings = useData('/settings')
  useEffect(() => {
    const resolved = settings.data?.resolved
    if (!resolved) return
    setTheme(resolved.appearance.theme); setDensity(resolved.appearance.density)
    setRetention(resolved.learning.retention); setDraftsEnabled(resolved.srs_drafts.enabled)
    setEnrichCapture(resolved.ai_curation.enrich_capture); setReviewRequired(resolved.profile_proposals.review_required)
    localStorage.setItem('tm-theme', resolved.appearance.theme); localStorage.setItem('tm-density', resolved.appearance.density)
    applyTheme(resolved.appearance.theme); document.documentElement.dataset.density = resolved.appearance.density
  }, [settings.data?.resolved])
  const persist = async (key: string, value: unknown) => { setSaved('Saving…'); try { await api(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }); setSaved('Saved'); setTimeout(() => setSaved(''), 1400) } catch (error: any) { setSaved(error.message) } }
  const changeTheme = (value: string) => { setTheme(value); localStorage.setItem('tm-theme', value); applyTheme(value); persist('appearance', { theme: value, density }) }
  const changeDensity = (value: string) => { setDensity(value); localStorage.setItem('tm-density', value); document.documentElement.dataset.density = value; persist('appearance', { theme, density: value }) }
  return <div class="settings-page"><section><h2>{route.title}</h2><p>{route.purpose}</p>
    {route.slug === 'profile' && <>{profile.loading ? <Loading /> : profile.error ? <ErrorState message={profile.error} /> : <><div class="setting-row"><div><strong>Learning priority</strong><span>The main filter applied when evaluating new sources.</span></div><span class="setting-value">{profile.data?.profile?.mega_priority || 'Not set'}</span></div><div class="setting-row"><div><strong>Core filter</strong><span>The standard new material should pass.</span></div><span class="setting-value">{profile.data?.profile?.core_filter || 'Not set'}</span></div><div class="setting-section"><div class="section-head"><h3>Priorities</h3><span>{profile.data?.priorities?.length || 0}</span></div><div class="compact-list">{(profile.data?.priorities || []).map((item: any) => <article><strong>{item.topic || item.name || item.id}</strong><span>Rank {item.rank}</span></article>)}</div></div><div class="setting-section"><div class="section-head"><h3>Excluded topics and sources</h3><span>{profile.data?.blacklist?.length || 0}</span></div>{profile.data?.blacklist?.length ? <div class="compact-list">{profile.data.blacklist.map((item: any) => <article><strong>{item.value || item.topic || item.id}</strong><span>{item.reason || item.severity || 'Excluded'}</span></article>)}</div> : <p>No exclusions recorded.</p>}</div><div class="setting-section"><div class="section-head"><h3>Learning patterns</h3><span>{profile.data?.patterns?.length || 0}</span></div>{profile.data?.patterns?.length ? <div class="compact-list">{profile.data.patterns.map((item: any) => <article><strong>{item.description || item.id}</strong><span>{item.strength}</span></article>)}</div> : <p>No confirmed patterns yet.</p>}</div></>}</>}
    {route.slug === 'appearance' && <><div class="setting-row"><div><strong>Theme</strong><span>Follow the device unless you choose an override.</span></div><select value={theme} onChange={(event) => changeTheme((event.target as HTMLSelectElement).value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="setting-row"><div><strong>Density</strong><span>Balanced for daily use; compact when managing large libraries.</span></div><select value={density} onChange={(event) => changeDensity((event.target as HTMLSelectElement).value)}><option value="balanced">Balanced</option><option value="compact">Compact</option></select></div></>}
    {route.slug === 'learning' && <><div class="setting-row"><div><strong>Active queue</strong><span>Five deliberate items; Inbox remains unlimited.</span></div><span class="setting-value">5 slots</span></div><label class="setting-row"><div><strong>Review target</strong><span>Used to adjust future recall intervals.</span></div><select value={retention} onChange={(event) => { const value = Number((event.target as HTMLSelectElement).value); setRetention(value); persist('learning', { retention: value, queue_cap: 5 }) }}><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option></select></label><label class="setting-row"><div><strong>High-rating drafts</strong><span>Create recall drafts only when this is enabled.</span></div><input type="checkbox" checked={draftsEnabled} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setDraftsEnabled(enabled); persist('srs_drafts', { enabled, minimum_rating: 8 }) }} /></label></>}
    {route.slug === 'curation' && <><label class="setting-row"><div><strong>Enrich new captures</strong><span>Queue enrichment only when enabled.</span></div><input type="checkbox" checked={enrichCapture} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setEnrichCapture(enabled); persist('ai_curation', { enrich_capture: enabled }) }} /></label><label class="setting-row"><div><strong>Review important changes</strong><span>Pass this instruction to feedback processing jobs.</span></div><input type="checkbox" checked={reviewRequired} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setReviewRequired(enabled); persist('profile_proposals', { review_required: enabled }) }} /></label><div class="setting-row"><div><strong>Automatic recommendations</strong><span>Finishing one source does not automatically add another.</span></div><span class="setting-value">Off</span></div></>}
    {route.slug === 'data' && <><div class="setting-row"><div><strong>Cloud library</strong><span>Your sources, notes, ratings, map, and files are available.</span></div><span class="status">Connected</span></div><div class="setting-row"><div><strong>Offline changes</strong><span>Send changes saved while this device was disconnected.</span></div><button class="secondary-action" onClick={() => flushOfflineMutations().then(() => setSaved('All offline changes synced'))}>Sync now</button></div><div class="setting-row"><div><strong>Export source library</strong><span>Download your recommendation history as a portable file.</span></div><a class="secondary-action" href="/recommendations/export">Download export</a></div><div class="setting-row"><div><strong>Saved preferences</strong><span>{Object.keys(settings.data?.settings || {}).length} preference groups stored.</span></div><span class="setting-value">{settings.error ? 'Unavailable' : 'Up to date'}</span></div></>}
    {saved && <output class="settings-status">{saved}</output>}
  </section></div>
}

function View({ route }: { route: Destination }) {
  if (route.key === 'today.briefing') return <TodayPage />
  if (route.key === 'curate.inbox') return <InboxPage />
  if (route.key === 'curate.queue') return <QueuePage />
  if (route.key === 'curate.collections') return <CollectionsPage scope="curate" />
  if (route.key === 'curate.resurfacing') return <ResurfacingPage />
  if (route.key === 'curate.contradictions') return <ContradictionsPage />
  if (route.key === 'curate.archive') return <ArchivePage />
  if (route.key === 'map.atlas') return <Suspense fallback={<div class="atlas-loading"><div /><span>Preparing spatial canvas…</span></div>}><AtlasPage /></Suspense>
  if (route.key === 'map.branches') return <BranchesPage />
  if (route.key === 'map.coverage') return <CoveragePage />
  if (route.key === 'map.taste') return <TastePage />
  if (route.key === 'learn.review') return <ReviewPage />
  if (route.key === 'learn.sessions') return <SessionsPage />
  if (route.key === 'learn.reflections') return <NotesPage kind="reflection" />
  if (route.key === 'learn.journal') return <JournalPage />
  if (route.key === 'learn.cards') return <CardsPage />
  if (route.key === 'vault.notes') return <NotesPage />
  if (route.key === 'vault.files') return <ArtifactsPage />
  if (route.key === 'vault.collections') return <CollectionsPage scope="vault" />
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
    ...(groups.vault || []).map((item: any) => ({ group: 'Files', title: item.filename, detail: formatDate(item.created_at), target: 'vault.files' })),
    ...(groups.patterns || []).map((item: any) => ({ group: 'Patterns', title: item.description || item.id, detail: item.strength, target: 'settings.profile' })),
  ].slice(0, 16)
  return <dialog ref={ref} class="command-dialog" onClose={onClose}><div class="command-input"><Icon name="search" /><input aria-label="Search Taste Map" autoFocus value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search sources, notes, files, branches, or pages…" /><kbd>Esc</kbd></div><div class="command-results">{pages.map((item) => <button onClick={() => { go(item); onClose() }}><span>{workspaceLabels[item.workspace]}</span><strong>{item.title}</strong><small>{item.purpose}</small></button>)}{query.trim().length >= 2 && cloud.loading && <div class="command-message">Searching your library…</div>}{cloudResults.map((item) => <button onClick={() => { go(destinations.find((destination) => destination.key === item.target)!); onClose() }}><span>{item.group}</span><strong>{item.title}</strong><small>{item.detail}</small></button>)}{query.trim().length >= 2 && !cloud.loading && !pages.length && !cloudResults.length && <div class="command-message">No matches found.</div>}</div></dialog>
}

function MobileMore({ open, route, onClose, onSearch, onCapture }: { open: boolean; route: Destination; onClose: () => void; onSearch: () => void; onCapture: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  const workspaces = (['map', 'vault', 'insights', 'settings'] as WorkspaceKey[])
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
