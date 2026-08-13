import { ComponentChildren } from 'preact'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, flushOfflineMutations, formatDate, labelize, listOfflineMutations, queueOfflineMutation, resolveOfflineMutation } from './api'
import { Destination, destinationForPath, destinations, WorkspaceKey } from './destinations'

const AtlasPage = lazy(() => import('./features/atlas/AtlasPage'))
const DiscoveryPage = lazy(() => import('./features/discovery/DiscoveryPage'))
import { BranchDeckPage } from './features/branches/BranchDeckPage'

const workspaceLabels: Record<WorkspaceKey, string> = {
  today: 'Momentum', curate: 'Curate', map: 'Map', learn: 'Learn', insights: 'Insights', settings: 'Settings',
}

const icons: Record<WorkspaceKey | 'momentum' | 'inbox' | 'queue' | 'hub' | 'files' | 'notes' | 'activity' | 'atlas' | 'search' | 'capture' | 'more' | 'profile', ComponentChildren> = {
  today: <path d="M4 5h16M4 12h10M4 19h7" />,
  curate: <><path d="M4 4h16v16H4z" /><path d="M4 13h5l2 3h2l2-3h5" /></>,
  map: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-10-4 10M7 6h10" /></>,
  learn: <><path d="M4 5a3 3 0 0 1 3-3h13v18H7a3 3 0 0 0 0-6h13" /></>,
  momentum: <><circle cx="12" cy="12" r="8" /><path d="m14.8 9.2-2 5.6-3.6 1.1 2-5.6z" /></>,
  inbox: <><path d="M4 5h16v14H4z" /><path d="M4 13h4l2 3h4l2-3h4" /></>,
  queue: <><path d="M5 6h14M5 12h14M5 18h8" /><circle cx="18" cy="18" r="2" /></>,
  hub: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5M8 17h3" /></>,
  files: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  notes: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  activity: <path d="M4 13h3l2-6 4 12 2-6h5" />,
  atlas: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-10-4 10M7 6h10" /></>,
  insights: <><path d="M5 19V9m7 10V4m7 15v-7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
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
const loopNavigation = ['today.momentum', 'curate.queue', 'learn.hub', 'learn.files', 'learn.notes', 'learn.activity', 'curate.inbox', 'map.atlas']
  .map((key) => destinations.find((item) => item.key === key)!)
const navIcons: Record<string, keyof typeof icons> = {
  'today.momentum': 'momentum', 'curate.inbox': 'inbox', 'learn.hub': 'hub', 'learn.files': 'files', 'learn.notes': 'notes',
  'learn.activity': 'activity', 'curate.queue': 'queue', 'map.atlas': 'atlas',
}

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

type SourceItem = { id: string; video_url: string; video_title: string; thread_id?: string | null }

async function openLearningTarget(event: MouseEvent, item: SourceItem, url: string, targetKind = 'original', targetArtifactId?: string) {
  event.preventDefault()
  const target = window.open('about:blank', '_blank')
  try {
    const result = await api<{ session_id: string }>('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: item.id, thread_id: item.thread_id || undefined, target_kind: targetKind, target_artifact_id: targetArtifactId }) })
    localStorage.setItem('tm-active-session', JSON.stringify({ id: result.session_id, recommendationId: item.id, title: item.video_title, sourceUrl: url, threadId: item.thread_id || null, targetKind }))
    if (target) target.location.replace(url)
    else location.assign(url)
  } catch (error: any) {
    target?.close()
    window.alert(`Couldn’t start this learning session: ${error.message}`)
  }
}

async function startExternal(event: MouseEvent, item: SourceItem) { return openLearningTarget(event, item, item.video_url, 'original') }

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
      <button class="brand" onClick={setRail} title="Toggle navigation"><img class="brand-image" src="/brand-mark.svg" alt="" /><span class="brand-name">Learning Compass</span></button>
      <div class="rail-section-label">Learning loop</div>
      <nav class="rail-nav" aria-label="Learning loop">
        {loopNavigation.map((item, index) => <button class={route.key === item.key ? 'active' : ''} onClick={() => go(item)} title={item.title}><span class="rail-icon"><Icon name={navIcons[item.key]} /></span><span>{item.title}</span><small>{String(index + 1).padStart(2, '0')}</small></button>)}
      </nav>
      <div class="rail-bottom">
        <div class="rail-divider" />
        <button onClick={onSearch}><span class="rail-icon"><Icon name="search" /></span><span>Search</span><kbd>⌘K</kbd></button>
        <button class={route.key === 'settings.profile' ? 'active' : ''} onClick={() => go(destinations.find((item) => item.key === 'settings.profile')!)}><span class="rail-icon"><Icon name="profile" /></span><span>Profile</span></button>
        <button class={route.workspace === 'settings' && route.key !== 'settings.profile' ? 'active' : ''} onClick={() => go(destinations.find((item) => item.workspace === 'settings')!)}><span class="rail-icon"><Icon name="settings" /></span><span>Settings</span></button>
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
      {['today.momentum', 'curate.queue', 'learn.activity'].map((key) => { const item = destinations.find((candidate) => candidate.key === key)!; return <button class={route.key === item.key ? 'active' : ''} onClick={() => go(item)}><Icon name={navIcons[item.key]} /><span>{item.title}</span></button> })}
      <button class={['map', 'insights', 'settings'].includes(route.workspace) ? 'active' : ''} onClick={onMore}><Icon name="more" /><span>More</span></button>
    </nav>
  </div>
}

function Loading() { return <div class="skeleton-stack"><i /><i /><i /></div> }
function Empty({ title = 'Nothing here yet', body = 'This view is ready when the system has relevant data.' }) { return <div class="empty-state"><span class="empty-rule" /><h2>{title}</h2><p>{body}</p></div> }
function ErrorState({ message }: { message: string }) { return <div class="error-state"><strong>Couldn’t load this view.</strong><span>{message}</span></div> }

function pathStatusLabel(status: string) {
  return ({ active: 'In progress', paused: 'Paused', verified: 'Verified', ready_to_verify: 'Ready to verify', abandoned: 'Archived', draft: 'Planned' } as Record<string, string>)[status] || labelize(status || 'Planned')
}

function itemGroup(itemType: string) {
  if (['concept', 'recall_prompt'].includes(itemType)) return 'Understand'
  if (['source_role', 'companion'].includes(itemType)) return 'Study'
  if (['exercise', 'application'].includes(itemType)) return 'Practice'
  return 'Reflect'
}

function sourceRoleLabel(role: string) {
  return ({
    foundation: 'Foundation',
    case: 'Case',
    companion: 'Companion',
    counterevidence: 'Counterevidence',
    reference: 'Reference',
  } as Record<string, string>)[role] || labelize(role)
}

function HubNotesPanel({ notes, scope, onChanged }: { notes: any[]; scope: Record<string, string>; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('')
  const add = async (event: Event) => {
    event.preventDefault()
    if (!title.trim()) return
    setStatus('Saving…')
    try {
      await api('/notes', { method: 'POST', body: JSON.stringify({ title, kind: 'note', ...scope, sections: [{ section_key: 'body', label: 'Notes', content, direction: 'auto' }] }) })
      setTitle(''); setContent(''); setStatus(''); onChanged()
    } catch (error: any) { setStatus(error.message) }
  }
  const save = async () => {
    if (!draft) return
    setStatus('Saving…')
    try {
      await api(`/notes/${draft.id}`, { method: 'PUT', body: JSON.stringify({ title: draft.title, sections: (draft.sections || []).map((section: any) => ({ section_key: section.section_key, content: section.content, direction: section.direction })) }) })
      setEditingId(null); setDraft(null); setStatus(''); onChanged()
    } catch (error: any) { setStatus(error.message) }
  }
  const remove = async (note: any) => {
    if (!confirm(`Delete note "${note.title}"?`)) return
    setStatus('Deleting…')
    try { await api(`/notes/${note.id}`, { method: 'DELETE' }); setStatus(''); onChanged() } catch (error: any) { setStatus(error.message) }
  }
  return <div class="hub-notes">
    {notes.length ? <div class="hub-note-list">{notes.map((note: any) => {
      const isOpen = openId === note.id
      const isEditing = editingId === note.id
      return <article class={`hub-note-row ${isOpen ? 'open' : ''}`} key={note.id}>
        <div class="hub-note-head">
          <button class="hub-note-toggle" aria-label={isOpen ? 'Collapse note' : 'Expand note'} onClick={() => { setOpenId(isOpen ? null : note.id); setEditingId(null); setDraft(null) }}>{isOpen ? '−' : '+'}</button>
          <strong>{note.title}</strong>
          <small>{note.sections?.length || 0} section{note.sections?.length === 1 ? '' : 's'} · {formatDate(note.updated_at)}</small>
          <div class="row-actions"><button class="inline-action" onClick={() => { setOpenId(note.id); setEditingId(isEditing ? null : note.id); setDraft(isEditing ? null : note) }}>{isEditing ? 'Cancel' : 'Edit'}</button><button class="inline-action" onClick={() => remove(note)}>Delete</button></div>
        </div>
        {isOpen && <div class="hub-note-body">
          {isEditing && draft
            ? <><input class="hub-note-title-input" value={draft.title} onInput={(event) => setDraft({ ...draft, title: (event.target as HTMLInputElement).value })} />{(draft.sections || []).map((section: any, index: number) => <textarea class="note-editor" key={section.section_key || index} value={section.content} onInput={(event) => setDraft({ ...draft, sections: (draft.sections || []).map((current: any) => current.section_key === section.section_key ? { ...current, content: (event.target as HTMLTextAreaElement).value } : current) })} />)}<div class="row-actions"><button class="primary-action" onClick={save}>Save changes</button><button onClick={() => { setEditingId(null); setDraft(null) }}>Cancel</button></div></>
            : <div class="hub-note-copy">{(note.sections || []).map((section: any, index: number) => <p key={section.section_key || index}>{section.content}</p>)}</div>}
        </div>}
      </article>
    })}</div> : <p class="muted-copy">No notes yet.</p>}
    <details class="hub-add-note"><summary>Add a note</summary><form onSubmit={add}><input value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} placeholder="Note title" required /><textarea value={content} onInput={(event) => setContent((event.target as HTMLTextAreaElement).value)} placeholder="What did you learn, decide, or want to keep?" /><div class="row-actions"><button class="primary-action" type="submit">Save note</button></div></form></details>
    {status && <output class="hub-feedback" aria-live="polite">{status}</output>}
  </div>
}

function HubFilesPanel({ files, scope, onChanged }: { files: any[]; scope: Record<string, string>; onChanged: () => void }) {
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState('')
  const upload = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    setStatus('Uploading…')
    const form = new FormData()
    form.append('file', file)
    form.append('metadata', JSON.stringify(scope))
    try {
      const res = await fetch('/artifacts', { method: 'POST', body: form })
      const data: any = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setStatus(''); input.value = ''; onChanged()
    } catch (error: any) { setStatus(error.message) }
  }
  const remove = async (file: any) => {
    if (!confirm(`Remove ${file.filename}?`)) return
    setWorking(file.id)
    try { await api(`/artifacts/${file.id}`, { method: 'DELETE' }); setWorking(''); onChanged() } catch (error: any) { setStatus(error.message); setWorking('') }
  }
  return <div class="hub-files">
    {files.length ? <div class="hub-file-list">{files.map((file: any) => <div class="hub-file-row" key={file.id}><a href={`/artifacts/${file.id}`} target="_blank" rel="noreferrer">{file.filename}</a><small>{file.media_type} · {formatDate(file.created_at)}</small><button class="artifact-remove" disabled={working === file.id} onClick={() => remove(file)}>Remove</button></div>)}</div> : <p class="muted-copy">No files yet.</p>}
    <label class="upload-btn"><input type="file" onChange={upload} /><span>Upload file</span></label>
    {status && <output class="hub-feedback" aria-live="polite">{status}</output>}
  </div>
}

function LearningPathWorkspace({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const path = useData(`/learning/core/threads/${encodeURIComponent(threadId)}/path`)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [mode, setMode] = useState<'learn' | 'edit'>('learn')
  const [evidenceItem, setEvidenceItem] = useState<any>(null)
  const [evidenceResponse, setEvidenceResponse] = useState('')
  const [status, setStatus] = useState('')
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [itemType, setItemType] = useState('concept')
  const [itemDescription, setItemDescription] = useState('')
  if (path.loading) return <Loading />
  if (path.error) return <ErrorState message={path.error} />
  const thread = path.data?.thread
  const stages = path.data?.stages || []
  const current = stages.find((stage: any) => stage.id === selectedStageId) || path.data?.current_stage || stages[0]
  const grouped = ['Understand', 'Study', 'Practice', 'Reflect'].map((group) => ({ group, items: (current?.items || []).filter((item: any) => itemGroup(item.item_type) === group) })).filter((group) => group.items.length)
  const mutate = async (endpoint: string, options: RequestInit, message: string) => { setStatus(message); try { await api(endpoint, options); setStatus('Saved'); path.reload() } catch (error: any) { setStatus(error.message) } }
  const startStage = () => current && mutate(`/learning/core/threads/${threadId}/stages/${current.id}/start`, { method: 'POST' }, 'Starting stage…')
  const verifyStage = () => current && mutate(`/learning/core/threads/${threadId}/stages/${current.id}/verify`, { method: 'POST' }, 'Checking evidence…')
  const toggleItem = (item: any) => mutate(`/learning/core/threads/${threadId}/stages/${current.id}/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'satisfied' ? 'open' : 'satisfied' }) }, 'Updating proof…')
  const saveEvidence = async (event: Event) => { event.preventDefault(); if (!evidenceItem || !evidenceResponse.trim()) return; setStatus('Recording evidence…'); try { await api('/learning/core/evidence', { method: 'POST', body: JSON.stringify({ thread_id: threadId, stage_id: current.id, evidence_type: evidenceItem.evidence_type || 'explanation', result: 'recorded', response: evidenceResponse, prompt: evidenceItem.title, score: 1 }) }); await api(`/learning/core/threads/${threadId}/stages/${current.id}/items/${evidenceItem.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'satisfied' }) }); setEvidenceItem(null); setEvidenceResponse(''); setStatus('Evidence recorded'); path.reload() } catch (error: any) { setStatus(error.message) } }
  const addStage = async (event: Event) => { event.preventDefault(); if (!title.trim()) return; await mutate(`/learning/core/threads/${threadId}/stages`, { method: 'POST', body: JSON.stringify({ title, objective, position: stages.length }) }, 'Adding stage…'); setTitle(''); setObjective('') }
  const addItem = async (event: Event) => { event.preventDefault(); if (!current?.id || !itemTitle.trim()) return; await mutate(`/learning/core/threads/${threadId}/stages/${current.id}/items`, { method: 'POST', body: JSON.stringify({ title: itemTitle, item_type: itemType, description: itemDescription, position: current.items?.length || 0 }) }, 'Adding work…'); setItemTitle(''); setItemDescription('') }
  return <div class="learning-path-workspace">
    <button class="back-link" onClick={onBack}>← Learning Hub</button>
    <header class="path-header"><div><span class="meta">Learning path · {labelize(thread?.thread_type || 'understand')}</span><h2>{thread?.title}</h2><p>{thread?.guiding_question}</p></div><div class="path-header-actions"><span class={`state state-${thread?.status || 'draft'}`}>{pathStatusLabel(thread?.status)}</span><button class={mode === 'edit' ? 'secondary-action' : 'inline-action'} onClick={() => setMode(mode === 'edit' ? 'learn' : 'edit')}>{mode === 'edit' ? 'Done editing' : 'Edit path'}</button></div></header>
    <div class="path-mode-note">{mode === 'learn' ? 'Learn mode · follow the next proof, then advance when the evidence is ready.' : 'Edit mode · shape the syllabus. Changes affect the path structure, not your learning evidence.'}</div>
    <div class="path-layout"><aside class="path-index"><div class="section-title"><span>Syllabus</span><strong>{stages.length} levels</strong></div>{stages.length ? stages.map((stage: any, index: number) => <button class={`path-index-row ${current?.id === stage.id ? 'current' : ''}`} onClick={() => setSelectedStageId(stage.id)}><span>{String(index).padStart(2, '0')}</span><div><strong>{stage.title}</strong><small>{pathStatusLabel(stage.status)} · {stage.progress?.completed || 0}/{stage.progress?.total || 0} proof</small></div></button>) : <p class="muted-copy">Add the first level to give this path a sequence.</p>}</aside>
      <section class="path-workbench">{current ? <><div class="stage-heading"><div><span class="meta">Level {current.position} · {pathStatusLabel(current.status)}</span><h3>{current.title}</h3><p class="path-objective">{current.objective || 'Define the objective for this level and the proof that will demonstrate it.'}</p></div><div class="stage-progress"><strong>{current.progress?.completed || 0}/{current.progress?.total || 0}</strong><span>required proof</span></div></div>{mode === 'learn' && <div class="next-action"><div><span class="hub-label">Next action</span><strong>{current.next_action?.label || 'Review this level'}</strong><p>{current.status === 'available' ? 'Start here when you are ready to work.' : current.output_description || 'Evidence, not source count, advances the path.'}</p></div><button class="primary-action" disabled={['locked', 'verified', 'waived'].includes(current.status)} onClick={current.status === 'available' ? startStage : current.status === 'ready_to_verify' ? verifyStage : () => { const item = current.items?.find((candidate: any) => candidate.status === 'open' && !['source_role', 'companion'].includes(candidate.item_type)); if (item) setEvidenceItem(item) }}>{current.status === 'available' ? 'Start level' : current.status === 'ready_to_verify' ? 'Verify level' : current.next_action?.label?.startsWith('Complete:') ? 'Record proof' : 'Review'}</button></div>}{(current.sources || []).length > 0 && <section class="stage-block hub-sources-block"><div class="section-title"><span>Sources</span><strong>{current.sources.length} links</strong></div><div class="hub-source-list">{current.sources.map((source: any) => { const artHtml = source.artifacts?.html; const artPdf = source.artifacts?.pdf; return <article class="hub-source-row" key={`${source.stage_id}:${source.recommendation_id}`}><span class={`hub-source-role role-${source.role}`}>{sourceRoleLabel(source.role)}</span><div><strong>{source.video_title || 'Untitled source'}</strong><small>{source.creator || labelize(source.content_type || 'source')} · {pathStatusLabel(source.learning_state || 'inbox')}</small>{source.expected_contribution && <p>{source.expected_contribution}</p>}</div><div class="row-actions">{source.video_url ? <a class="inline-action" href={source.video_url} target="_blank" rel="noreferrer">Original</a> : <span class="muted-copy">No URL</span>}{artHtml && <a class="primary-action" href={`/artifacts/${artHtml.id}`} target="_blank" rel="noreferrer">Read</a>}{artPdf && <a class="inline-action" href={`/artifacts/${artPdf.id}`} target="_blank" rel="noreferrer">PDF</a>}{source.notebook_url && <a class="nblm-link" href={source.notebook_url} target="_blank" rel="noreferrer">NBLM</a>}</div></article> })}</div></section>}{grouped.map(({ group, items }) => <section class="stage-block" key={group}><div class="section-title"><span>{group}</span><strong>{items.length} items</strong></div><div class="stage-items">{items.map((item: any) => <div class={`stage-item-row ${item.status !== 'open' ? 'satisfied' : ''}`} key={item.id}><button class="item-check" aria-label={`${item.status === 'satisfied' ? 'Reopen' : 'Complete'} ${item.title}`} onClick={() => !['source_role', 'companion'].includes(item.item_type) && toggleItem(item)}>{item.status === 'satisfied' ? '✓' : '○'}</button><div><strong>{item.title}</strong><small>{item.description || `${labelize(item.item_type)}${item.required ? ' · required' : ' · optional'}`}</small></div>{mode === 'learn' && item.status === 'open' && !['source_role', 'companion'].includes(item.item_type) && <button class="item-action" onClick={() => setEvidenceItem(item)}>{item.evidence_type ? 'Record proof' : 'Mark done'}</button>}</div>)}</div></section>)}{mode === 'learn' && !grouped.length && <div class="path-empty"><span class="meta">No work defined</span><h3>This level needs a sequence.</h3><p>Switch to Edit path to add concepts, practice, and proof.</p></div>}<section class="stage-block"><div class="section-title"><span>Level notes</span><strong>{current.notes?.length || 0} notes</strong></div><HubNotesPanel notes={current.notes || []} scope={{ stage_id: current.id }} onChanged={path.reload} /></section><section class="stage-block"><div class="section-title"><span>Level files</span><strong>{current.files?.length || 0} files</strong></div><HubFilesPanel files={current.files || []} scope={{ stage_id: current.id }} onChanged={path.reload} /></section></> : <div class="path-empty"><span class="meta">No current level</span><h3>Give this path a sequence.</h3><p>Switch to Edit path to add the first level.</p></div>}</section>
      <aside class="path-evidence"><div class="section-title"><span>Evidence gate</span><strong>{current.progress?.completed || 0}/{current.progress?.total || 0}</strong></div><p>{current.output_description || thread?.definition_of_done || 'Evidence shows what changed, not how many sources you opened.'}</p><div class="evidence-summary">{(current.items || []).filter((item: any) => item.required && !['source_role', 'companion'].includes(item.item_type)).slice(0, 8).map((item: any) => <div><span>{item.status === 'satisfied' ? '✓' : '○'}</span><strong>{item.title}</strong></div>)}</div><div class="path-next"><span class="meta">Path definition</span><strong>{thread?.definition_of_done || 'Define competence before collecting sources.'}</strong><small>Current level: {current.title}</small></div></aside></div>
    <section class="path-dossier"><div class="section-title"><span>Path notes</span><strong>{path.data?.notes?.length || 0} notes</strong></div><HubNotesPanel notes={path.data?.notes || []} scope={{ thread_id: threadId }} onChanged={path.reload} /></section>
    <section class="path-dossier"><div class="section-title"><span>Path files</span><strong>{path.data?.files?.length || 0} files</strong></div><HubFilesPanel files={path.data?.files || []} scope={{ thread_id: threadId }} onChanged={path.reload} /></section>
    {mode === 'edit' && <div class="path-authoring-group"><details class="path-authoring" open><summary>Add a level</summary><form onSubmit={addStage}><label>Level title<input value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} placeholder="e.g. Level 1 — Foundations" required /></label><label>Objective<textarea value={objective} onInput={(event) => setObjective((event.target as HTMLTextAreaElement).value)} placeholder="What should this level build?" /></label><button class="primary-action" type="submit">Add level</button></form></details><details class="path-authoring" open><summary>Add work to {current?.title}</summary><form onSubmit={addItem}><label>Work item<input value={itemTitle} onInput={(event) => setItemTitle((event.target as HTMLInputElement).value)} placeholder="e.g. Explain stocks and flows from memory" required /></label><label>Type<select value={itemType} onChange={(event) => setItemType((event.target as HTMLSelectElement).value)}><option value="concept">Concept</option><option value="recall_prompt">Recall prompt</option><option value="exercise">Exercise</option><option value="application">Application</option><option value="reflection">Reflection</option><option value="companion">Companion slot</option></select></label><label>Description<textarea value={itemDescription} onInput={(event) => setItemDescription((event.target as HTMLTextAreaElement).value)} placeholder="What does good completion look like?" /></label><button class="primary-action" type="submit">Add work item</button></form></details></div>}
    {status && <output class="hub-feedback" aria-live="polite">{status}</output>}
    {evidenceItem && <div class="evidence-sheet"><div class="evidence-sheet-inner"><span class="meta">Record evidence</span><h3>{evidenceItem.title}</h3><p>{evidenceItem.description || 'Write what you can now explain, model, apply, or demonstrate.'}</p><form onSubmit={saveEvidence}><label>Your evidence<textarea autoFocus value={evidenceResponse} onInput={(event) => setEvidenceResponse((event.target as HTMLTextAreaElement).value)} placeholder="Describe what you did or can explain…" required /></label><div class="row-actions"><button type="button" onClick={() => setEvidenceItem(null)}>Cancel</button><button class="primary-action" type="submit">Save evidence</button></div></form></div></div>}
  </div>
}

function LearningHubPage() {
  const hub = useData('/learning/core/hub')
  const getThreadFromHash = () => {
    const raw = location.hash.replace(/^#\/?/, '')
    const match = raw.match(/^learn\/hub\/([^?#]+)/)
    return match ? decodeURIComponent(match[1]) : null
  }
  const [selected, setSelectedState] = useState<string | null>(getThreadFromHash)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [definition, setDefinition] = useState('')
  const [depth, setDepth] = useState('deep')
  const [priorKnowledge, setPriorKnowledge] = useState('')
  const [useCase, setUseCase] = useState('')
  const [constraints, setConstraints] = useState('')
  const [createStatus, setCreateStatus] = useState('')

  useEffect(() => {
    const onHash = () => {
      const threadId = getThreadFromHash()
      setSelectedState(threadId)
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const setSelected = (id: string | null) => {
    setSelectedState(id)
    if (id) location.hash = `#/learn/hub/${encodeURIComponent(id)}`
    else location.hash = '#/learn/hub'
  }

  const createPath = async (event: Event) => { event.preventDefault(); setCreateStatus('Creating path…'); const brief = [`Depth: ${depth === 'survey' ? 'just enough to understand' : depth === 'solid' ? 'solid working knowledge' : 'deep academic dive'}`, priorKnowledge.trim() ? `Already knows: ${priorKnowledge.trim()}` : '', useCase.trim() ? `Use case: ${useCase.trim()}` : '', constraints.trim() ? `Constraints/preferences: ${constraints.trim()}` : ''].filter(Boolean).join('\n'); try { const result = await api<any>('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title, guiding_question: question, why_now: brief, definition_of_done: definition, thread_type: 'understand', activate: true }) }); setCreateStatus('Path created'); setShowCreate(false); setTitle(''); setQuestion(''); setDefinition(''); setDepth('deep'); setPriorKnowledge(''); setUseCase(''); setConstraints(''); hub.reload(); setSelected(result.id) } catch (error: any) { setCreateStatus(error.message) } }
  if (selected) return <LearningPathWorkspace threadId={selected} onBack={() => setSelected(null)} />
  if (hub.loading) return <Loading />
  if (hub.error) return <ErrorState message={hub.error} />
  const paths = (hub.data?.paths || []).filter((path: any) => path.status !== 'abandoned')
  const active = paths.find((path: any) => path.status === 'active')
  return <div class="learning-hub"><section class="hub-intro"><div><span class="meta">Learning Hub</span><h2>Know what to learn next.</h2><p>Build a deliberate path, then move through it by producing evidence—not by collecting more sources.</p></div><div class="hub-principle"><span>Learning rule</span><strong>Interview first. Freeze the levels. Then attach researched sources.</strong></div></section><div class="hub-toolbar"><span>{paths.length ? `${paths.length} active learning ${paths.length === 1 ? 'path' : 'paths'}` : 'Start with a capability, question, or topic you want to learn deeply.'}</span><button class="primary-action" onClick={() => setShowCreate((open) => !open)}>{showCreate ? 'Close' : 'New learning path'}</button></div>{showCreate && <form class="hub-create hub-interview" onSubmit={createPath}><div class="hub-create-heading"><span class="meta">New learning path</span><h3>Interview the topic before the syllabus.</h3><p>Hermes uses this brief to decide the depth and starting point. After levels exist, source filling must preserve them.</p></div><label>Topic or capability<input value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} placeholder="e.g. Systems Thinking" required /></label><label>How deep should Hermes go?<select value={depth} onChange={(event) => setDepth((event.target as HTMLSelectElement).value)}><option value="deep">Deep academic dive</option><option value="solid">Solid working knowledge</option><option value="survey">Just enough to understand</option></select></label><label>What do you already know?<textarea value={priorKnowledge} onInput={(event) => setPriorKnowledge((event.target as HTMLInputElement).value)} placeholder="Concepts, sources, or levels you already finished." /></label><label>Guiding question<textarea value={question} onInput={(event) => setQuestion((event.target as HTMLInputElement).value)} placeholder="What do I want to understand or be able to do?" required /></label><label>Real use case<textarea value={useCase} onInput={(event) => setUseCase((event.target as HTMLInputElement).value)} placeholder="Where will I apply this? Business, personal systems, policy, relationships…" /></label><label>Constraints or preferences<textarea value={constraints} onInput={(event) => setConstraints((event.target as HTMLInputElement).value)} placeholder="No books, academic sources only, videos preferred, time limits, language…" /></label><label>Definition of competence<textarea value={definition} onInput={(event) => setDefinition((event.target as HTMLInputElement).value)} placeholder="What would prove that I learned it?" required /></label><button class="primary-action" type="submit">Create path</button>{createStatus && <output>{createStatus}</output>}</form>}{active && <section class="hub-current"><div class="hub-section-head"><div><span class="meta">Continue</span><h3>{active.title}</h3><p>{active.guiding_question}</p></div><button class="primary-action" onClick={() => setSelected(active.id)}>Continue →</button></div><div class="hub-current-grid"><div><span class="hub-label">Current level</span><strong>{active.current_stage_title || 'Path setup'}</strong><p>{active.current_stage_status ? pathStatusLabel(active.current_stage_status) : 'Add levels to define the sequence.'}</p></div><div><span class="hub-label">Path progress</span><strong>{active.stage_count ? `${active.completed_stage_count}/${active.stage_count} levels` : 'No levels yet'}</strong><p>Progress comes from evidence.</p></div><div><span class="hub-label">Next move</span><strong>{active.current_stage_status === 'ready_to_verify' ? 'Verify this level' : active.stage_count ? 'Work on the current level' : 'Create levels from the interview'}</strong><p>{active.stage_count ? 'Resume where the proof is missing.' : 'Hermes should create the structure once, then source-fill it.'}</p></div></div></section>}<section class="hub-section"><div class="hub-section-head"><div><span class="meta">Your paths</span><h3>Learning paths</h3></div><span class="hub-count">{paths.length} path{paths.length === 1 ? '' : 's'}</span></div>{paths.length ? <div class="hub-path-list">{paths.map((path: any, index: number) => <article class="hub-path" key={path.id}><div class="hub-path-index">{String(index + 1).padStart(2, '0')}</div><div class="hub-path-main"><div class="hub-path-top"><span class="meta">{labelize(path.thread_type)} · {pathStatusLabel(path.status)}</span><strong>{path.title}</strong></div><p>{path.guiding_question || path.definition_of_done}</p><div class="hub-path-bar"><span style={{ width: `${path.stage_count ? Math.round((path.completed_stage_count / path.stage_count) * 100) : 0}%` }} /></div><small>{path.current_stage_title || 'No current level'} · {path.stage_count ? `${path.completed_stage_count}/${path.stage_count} levels verified` : 'Curriculum not started'}</small></div><div class="hub-path-side"><button class="inline-action" onClick={() => setSelected(path.id)}>{path.status === 'active' ? 'Open' : 'Inspect'}</button><small>{pathStatusLabel(path.status)}</small></div></article>)}</div> : <Empty title="No learning paths yet" body="Create a path from an interview brief, then shape it into levels, outputs, and evidence gates." />}</section><details class="hub-help"><summary>How the Hub works</summary><div class="hub-method-grid"><div><strong>Interview</strong><span>Capture depth, prior knowledge, use case, and constraints before Hermes designs anything.</span></div><div><strong>Level</strong><span>Create the path structure once: objectives, outputs, work, applications, and evidence gates.</span></div><div><strong>Source-fill</strong><span>Keep existing levels and attach researched, verified sources by role.</span></div><div><strong>Verify</strong><span>Advance only after recall, explanation, transfer, artifact, or application evidence.</span></div></div></details></div>
}
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
function compassFeatureLabel(key: string) {
  return ({
    topic_value: 'topic fit', personal_relevance: 'personal relevance', source_quality: 'source quality',
    information_gain: 'new learning', novelty: 'novelty', format_fit: 'format fit',
    evidence_quality: 'evidence quality', thread_contribution: 'helps your current goal',
  } as Record<string, string>)[key] || labelize(key)
}
function compassTopFeatures(breakdown: any) {
  return Object.entries(breakdown || {})
    .filter(([key, value]) => !key.startsWith('_') && !['friction'].includes(key) && Number.isFinite(Number(value)))
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 3)
}
function CompassFeedbackReasons({ working, onDecline }: { working: boolean; onDecline: (reason: string) => void }) {
  return <div class="compass-feedback-reasons"><span>What missed?</span>{[['wrong_topic', 'Wrong topic'], ['too_familiar', 'Too familiar'], ['too_shallow', 'Too shallow'], ['too_long', 'Too long'], ['poor_source', 'Poor source'], ['wrong_format', 'Wrong format'], ['already_mastered', 'Already mastered'], ['other', 'Other']].map(([reason, label]) => <button disabled={working} onClick={() => onDecline(reason)}>{label}</button>)}</div>
}

function buildStreakTrail(momentum: any) {
  const current = String(momentum?.current_date || '')
  if (!current) return [] as Array<{ date: string; count: number; isToday: boolean; label: string }>
  const counts = new Map<string, number>((momentum?.streak_days || []).map((row: any) => [String(row.date), Number(row.count || 0)]))
  const cursor = new Date(`${current}T12:00:00Z`)
  return Array.from({ length: 14 }, (_, index) => {
    const day = new Date(cursor)
    day.setUTCDate(cursor.getUTCDate() - (13 - index))
    const date = day.toISOString().slice(0, 10)
    return {
      date,
      count: counts.get(date) || 0,
      isToday: date === current,
      label: day.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }),
    }
  })
}

function formatRemaining(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

function formatCairoDay(value?: string | null) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function TodayPage() {
  const { data, error, loading } = useData('/dashboard/briefing')
  const compass = useData('/compass/pick')
  const [compassWorking, setCompassWorking] = useState(false)
  const [compassFeedbackOpen, setCompassFeedbackOpen] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [queueSwitcherOpen, setQueueSwitcherOpen] = useState(false)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const seconds = Number(data?.momentum?.seconds_remaining || 0)
    setRemaining(seconds)
    if (!seconds) return
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [data?.momentum?.seconds_remaining, data?.momentum?.current_date])

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />

  const items = data?.active_items || []
  const mission = items.find((item: any) => item.id === focusedId) || items[0]
  const momentum = data?.momentum || {}
  const trail = buildStreakTrail(momentum)
  const filesFor = (id: string) => (data?.artifacts || []).filter((artifact: any) => artifact.recommendation_id === id)
  const fileLabel = (artifact: any) => artifact.role || (/pdf/i.test(artifact.media_type || artifact.filename) ? 'PDF' : /html/i.test(artifact.media_type || artifact.filename) ? 'HTML' : artifact.filename)
  const sendCompassFeedback = async (outcome: 'dismissed' | 'declined', reason: string) => {
    setCompassWorking(true)
    try {
      await api(`/compass/pick/${compass.data.pick.id}/feedback`, { method: 'POST', body: JSON.stringify({ outcome, reason_tags: [reason] }) })
      setCompassFeedbackOpen(false)
      compass.reload()
    } catch (feedbackError: any) {
      window.alert(feedbackError.message)
    } finally {
      setCompassWorking(false)
    }
  }
  const missionFiles = mission ? filesFor(mission.id) : []
  const startPreference = missionFiles.find((artifact: any) => artifact.recommended_start)?.recommended_start
  const startArtifact = startPreference === 'html' || startPreference === 'pdf'
    ? missionFiles.find((artifact: any) => (artifact.role || (/pdf/i.test(artifact.media_type || artifact.filename) ? 'pdf' : 'html')) === startPreference)
    : null
  const chosenStart = startPreference === 'notebooklm' && mission?.notebook_url
    ? { href: mission.notebook_url, kind: 'notebooklm', artifactId: undefined, label: 'Start with NotebookLM' }
    : startArtifact
      ? { href: `/artifacts/${startArtifact.id}`, kind: startPreference, artifactId: startArtifact.id, label: startPreference === 'html' ? 'Start with Arabic companion' : 'Start with PDF companion' }
      : mission?.video_url
        ? { href: mission.video_url, kind: 'original', artifactId: undefined, label: mission.learning_state === 'in_progress' ? 'Resume source' : 'Open source' }
        : null
  const missionIndex = Math.max(0, items.findIndex((item: any) => item.id === mission?.id))
  const streak = Number(momentum.streak || 0)
  const longest = Number(momentum.longest_streak || 0)
  const secured = Boolean(momentum.today_secured)
  const weekDone = Number(momentum.completed || 0)
  const weekNotes = Number(momentum.notes || 0)
  const weekReviews = Number(momentum.reviews || 0)

  return <div class="momentum-page">
    {compass.error && <div class="error-state"><strong>Compass Pick unavailable.</strong><span>{compass.error}</span></div>}

    <section class="streak-overview" aria-label="Streak overview">
      <div class="streak-readout">
        <div class="streak-figure">
          <strong>{streak}</strong>
          <span>{streak === 1 ? 'day' : 'days'}</span>
        </div>
        <div class="streak-status">
          <em class={secured ? 'secured' : 'open'}>{secured ? 'Today secured' : 'Today open'}</em>
          <small>{secured ? `Day holds for ${formatRemaining(remaining)}` : `Secure by midnight · ${formatRemaining(remaining)} left`}</small>
        </div>
      </div>

      <div class="streak-trail" aria-label="Last 14 days">
        <div class="streak-trail-head">
          <span>14-day chain</span>
          <span>Africa/Cairo</span>
        </div>
        <div class="streak-days">
          {trail.map((day) => (
            <div class={`streak-day${day.count ? ' active' : ''}${day.isToday ? ' today' : ''}`} title={`${day.date}${day.count ? ` · ${day.count} signals` : ''}`}>
              <i style={day.count ? { ['--fill' as any]: `${Math.min(100, 28 + day.count * 8)}%` } : undefined} />
              <span>{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div class="streak-metrics">
        <div><strong>{longest || '—'}</strong><span>Best streak</span></div>
        <div><strong>{weekDone}</strong><span>Done this week</span></div>
        <div><strong>{weekNotes}</strong><span>Notes</span></div>
        <div><strong>{weekReviews}</strong><span>Reviews</span></div>
        <div class="streak-last"><strong>{formatCairoDay(momentum.last_activity_date)}</strong><span>Last activity</span></div>
      </div>
    </section>

    <div class="momentum-workspace">
      <div class="momentum-primary">
        {mission ? <section class="focus-desk">
          <div class="focus-desk-head">
            <div class="focus-identity">
              <span class="momentum-eyebrow">Now learning</span>
              <div class="focus-meta">
                <span>{mission.content_type || 'Source'}</span>
                <span>{mission.creator || 'Independent source'}</span>
                <span class={mission.learning_state === 'in_progress' ? 'state-live' : ''}>{mission.learning_state === 'in_progress' ? 'In progress' : 'Queued'}</span>
              </div>
            </div>
            <div class="focus-switcher">
              <span>Queue · {String(missionIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
              <button onClick={() => setQueueSwitcherOpen((open) => !open)} aria-expanded={queueSwitcherOpen}>Switch source</button>
            </div>
          </div>

          {queueSwitcherOpen && <div class="queue-switcher" role="listbox" aria-label="Choose a queued source">{items.map((item: any, index: number) => <button class={item.id === mission.id ? 'active' : ''} onClick={() => { setFocusedId(item.id); setQueueSwitcherOpen(false) }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.video_title}</strong><small>{item.learning_state === 'in_progress' ? 'In progress' : 'Queued'}</small></button>)}</div>}

          <div class="focus-body">
            <h2>{mission.video_title}</h2>
            <div class="focus-why">
              <span>Why this is in your Queue</span>
              <p>{mission.context_brief || formatSmartHook(mission)}</p>
            </div>
            {chosenStart && (
              <div class="focus-actions">
                <a class="primary-action" href={chosenStart.href} target="_blank" rel="noreferrer">
                  {chosenStart.label}
                </a>
                <button onClick={() => go(destinations.find((item) => item.key === 'curate.queue')!)}>Full queue</button>
              </div>
            )}
          </div>

          <div class="focus-resources">
            <div class="focus-resources-head">
              <strong>Source desk</strong>
              <button onClick={() => go(destinations.find((item) => item.key === 'learn.files')!)}>All files →</button>
            </div>
            <div class="focus-resource-grid">
              {mission.video_url
                ? <a class="resource-source" href={mission.video_url} target="_blank" rel="noreferrer"><span>Original</span><strong>Open the source</strong><small>↗</small></a>
                : <div class="resource-empty"><span>Original</span><strong>No source URL</strong><small>—</small></div>}
              {missionFiles.length
                ? missionFiles.map((artifact: any) => <a href={`/artifacts/${artifact.id}`} target="_blank" rel="noreferrer"><span>{fileLabel(artifact)}</span><strong>{artifact.filename || `${fileLabel(artifact)} companion`}</strong><small>↗</small></a>)
                : <div class="resource-empty"><span>Files</span><strong>No companion files yet</strong><small>—</small></div>}
              {mission.notebook_url
                ? <a class="resource-notebook" href={mission.notebook_url} target="_blank" rel="noreferrer"><span>NotebookLM</span><strong>Ask the grounded notebook</strong><small>↗</small></a>
                : <div class="resource-empty resource-notebook"><span>NotebookLM</span><strong>Not linked yet</strong><small>—</small></div>}
            </div>
          </div>
        </section> : <section class="focus-desk focus-empty"><span class="momentum-eyebrow">Focus desk</span><Empty title="Your Queue is clear" body="Choose one worthwhile source. Momentum should begin with intent, not volume." /></section>}

        {!mission && compass.data?.pick && <section class="empty-compass">
          <span>{compass.data.pick.status === 'abstained' ? 'Weak Compass Pick · your decision' : `Compass Pick · ${compass.data.pick.strategy}`}</span>
          <h2>{compass.data.pick.video_title || 'Compass Pick'}</h2>
          <p>{compass.data.pick.context_brief || compass.data.pick.rationale?.why_this || compass.data.pick.why_this}</p>
          {(() => {
            const reasons = compassTopFeatures(compass.data.pick.rationale?.score_breakdown)
            return reasons.length ? <div class="compass-why"><strong>Why this pick</strong><div class="compact-list">{reasons.map(([key, value]) => <article key={key}><strong>{compassFeatureLabel(key)}</strong><span>{Math.round(Number(value) * 100)}% signal</span></article>)}</div></div> : null
          })()}
          {compass.data.pick.status === 'abstained' && <div class="compass-weak-context"><strong>Not automatically recommended</strong><p>{compassWeakReason(compass.data.pick.rationale?.abstention_reason || compass.data.pick.stop_reason)} {compassWeakPickCanQueue(compass.data.pick) ? 'The source is reachable, but it did not meet the automatic recommendation threshold. You can still add it manually.' : 'No safe, reachable source is available to add.'} Score {Math.round(Number(compass.data.pick.rationale?.score || 0) * 100)}% · confidence {Math.round(Number(compass.data.pick.confidence || 0) * 100)}% · source {compass.data.pick.rationale?.source_check?.status || 'unknown'}{compass.data.pick.confidence_status ? ` · calibration ${compass.data.pick.confidence_status}` : ''}.</p></div>}
          <div class="row-actions">
            {(compass.data.pick.status === 'ready' || (compass.data.pick.status === 'abstained' && compassWeakPickCanQueue(compass.data.pick))) && <button class="primary-action" disabled={compassWorking} onClick={async () => { setCompassWorking(true); const target = window.open('about:blank', '_blank'); try { const result = await api<any>(`/compass/pick/${compass.data.pick.id}/start`, { method: 'POST' }); localStorage.setItem('tm-active-session', JSON.stringify({ id: result.session_id, recommendationId: result.recommendation_id, title: compass.data.pick.video_title, sourceUrl: compass.data.pick.video_url })); if (target) target.location.replace(compass.data.pick.video_url); else location.assign(compass.data.pick.video_url); compass.reload() } catch (startError: any) { target?.close(); window.alert(startError.message) } finally { setCompassWorking(false) } }}>{compass.data.pick.status === 'abstained' ? 'Add to Queue anyway' : 'Start'}</button>}
            <button disabled={compassWorking} onClick={() => sendCompassFeedback('dismissed', 'not_now')}>Not now</button>
            <button disabled={compassWorking} onClick={() => setCompassFeedbackOpen((value) => !value)}>Bad fit</button>
          </div>
          {compassFeedbackOpen && <CompassFeedbackReasons working={compassWorking} onDecline={(reason) => sendCompassFeedback('declined', reason)} />}
        </section>}
        {mission && compass.data?.pick && <section class="compass-strip">
          <div class="compass-strip-head">
            <span class="momentum-eyebrow">What Compass would pick next</span>
            <span class="compass-strip-meta">score {Math.round(Number(compass.data.pick.rationale?.score || 0) * 100)}% · confidence {Math.round(Number(compass.data.pick.confidence || 0) * 100)}% · {compass.data.pick.status}</span>
          </div>
          <div class="compass-strip-body">
            <h3>{compass.data.pick.video_title || 'Compass Pick'}</h3>
            {compass.data.pick.context_brief || compass.data.pick.rationale?.why_this ? <p>{compass.data.pick.context_brief || compass.data.pick.rationale?.why_this}</p> : null}
            {(() => { const features = compassTopFeatures(compass.data.pick.rationale?.score_breakdown); return features.length ? <div class="compass-strip-features">{features.map(([key, value]) => <span key={key}>{compassFeatureLabel(key)} {Math.round(Number(value) * 100)}%</span>)}</div> : null })()}
          </div>
          <div class="row-actions">
            <button disabled={compassWorking} onClick={() => sendCompassFeedback('dismissed', 'not_now')}>Not now</button>
            <button disabled={compassWorking} onClick={() => setCompassFeedbackOpen((value) => !value)}>Bad fit</button>
          </div>
          {compassFeedbackOpen && <CompassFeedbackReasons working={compassWorking} onDecline={(reason) => sendCompassFeedback('declined', reason)} />}
        </section>}
      </div>
    </div>
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
  const { data, error, loading, reload } = useData('/capture/queue')
  const [rejecting, setRejecting] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const items = data?.items || []
  const notForMe = async (item: any) => {
    setRejecting(item.id)
    try { await api(`/capture/${item.id}/triage`, { method: 'POST', body: JSON.stringify({ action: 'exclude', reason: 'not_for_me' }) }); reload() }
    catch (err: any) { window.alert(err.message) }
    finally { setRejecting('') }
  }

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
                {item.branch_preflight?.conflict && <div class="queue-warning">Branch conflict: this source is mapped to the pruned branch “{item.branch_preflight.branch_label}”. Do not start it until the mapping is reviewed.</div>}
                {item.branch_preflight?.status === 'unmapped' && <div class="queue-preflight">Branch match not verified yet.</div>}
                {item.compass && <div class="queue-compass"><span>Compass · score {Math.round(Number(item.compass.score) * 100)}% · confidence {Math.round(Number(item.compass.confidence) * 100)}%</span>{compassTopFeatures(item.compass.breakdown).length ? <div class="queue-compass-features">{compassTopFeatures(item.compass.breakdown).map(([key, value]) => <span key={key}>{compassFeatureLabel(key)} {Math.round(Number(value) * 100)}%</span>)}</div> : null}</div>}
              </div>

              <div class="row-actions">
                <button onClick={() => { location.hash = `#/learn/notes?source=${encodeURIComponent(item.id)}` }}>Record</button>
                <button disabled={rejecting === item.id} onClick={() => notForMe(item)}>Not for me</button>
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
    return <div class="book-chapters">{visual.chapters.map((chapter: any) => <div class="chapter-row" key={chapter.key}><div class="chapter-info"><span class="chapter-num">{chapter.number || chapter.key}</span><span class="chapter-title">{chapter.title}</span><span class="chapter-status">{chapter.completed ? 'Done' : 'Not started'}</span></div><div class="chapter-actions">{chapter.html && <a href={`/artifacts/${chapter.html.id}/view`} target="_blank" rel="noreferrer" onClick={(event) => openLearningTarget(event, book, `/artifacts/${chapter.html.id}/view`, 'html', chapter.html.id)}>HTML</a>}{chapter.pdf && <a href={`/artifacts/${chapter.pdf.id}`} target="_blank" rel="noreferrer" onClick={(event) => openLearningTarget(event, book, `/artifacts/${chapter.pdf.id}`, 'pdf', chapter.pdf.id)}>PDF</a>}{!chapter.html && <label class="upload-btn"><input type="file" accept=".html,.htm" onChange={(e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) uploadFile(book, chapter, file, 'html') }} /><span>Upload HTML</span></label>}{!chapter.pdf && <label class="upload-btn"><input type="file" accept=".pdf" onChange={(e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) uploadFile(book, chapter, file, 'pdf') }} /><span>Upload PDF</span></label>}{notebookUrl && <a class="nblm-link" href={notebookUrl} target="_blank" rel="noreferrer" onClick={(event) => openLearningTarget(event, book, notebookUrl, 'notebooklm')}>NBLM</a>}<button disabled={working === `${book.id}:${chapter.key}`} onClick={() => finishChapter(book, chapter)}>{chapter.completed ? 'Undo' : 'Finish'}</button></div></div>)}</div>
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
  const triage = async (item: any, action: 'queue' | 'exclude', override = false) => { setWorking(item.id); setBlocked(null); try { await api(`/capture/${item.id}/triage`, { method: 'POST', body: JSON.stringify({ action, override_queue_cap: override }) }); reload() } catch (error: any) { if (error.message === 'queue_full') setBlocked(item); else setBlocked({ ...item, error: error.message === 'learning_thread_required' ? 'Start a Learning Thread on Momentum before adding a source to Queue.' : error.message }) } finally { setWorking('') } }
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
    {items.length ? <div class="record-list">{items.map((item: any, index: number) => <article><span class="record-number">{String(index + 1).padStart(2, '0')}</span><div><span class="meta">{item.resurface_at && new Date(item.resurface_at).getTime() <= Date.now() ? 'Ready to revisit' : item.feed_title ? `rss · ${item.feed_title}` : item.content_type || 'source'}</span><h3>{item.video_title}</h3><p>{item.resurface_at && new Date(item.resurface_at).getTime() <= Date.now() ? 'You said “not now” earlier. The timing window has reopened.' : item.why_this || item.video_url}</p></div><div class="row-actions"><button class="danger-action" disabled={working === item.id} onClick={() => triage(item, 'exclude')}>Remove</button><button class="primary-action" disabled={working === item.id} onClick={() => triage(item, 'queue')}>Queue</button></div></article>)}</div> : <Empty title="Inbox clear" body="New captures and feed articles land here for a quick fit check before they earn a queue slot." />}
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
  return <div class="archive-page"><section class="archive-rss"><div class="archive-rss-head"><div><span class="meta">Pinned · RSS / Atom</span><h2>Feed reading</h2><p>{feedCount ? `${feedCount} captured ${feedCount === 1 ? 'article' : 'articles'} kept here, outside the main archive.` : 'Subscribe to a feed in Inbox and its articles will stay grouped here.'}</p></div><button onClick={() => go(inbox)}>Open Inbox</button></div>{feeds.length ? <div class="archive-rss-list">{feeds.map((feed: any) => <div><strong>{feed.title}</strong><span>{feed.entry_count || 0} captured · {feed.last_checked_at ? `checked ${formatDate(feed.last_checked_at)}` : 'not checked yet'}</span></div>)}</div> : <div class="archive-rss-empty">No subscribed feeds yet.</div>}</section><div class="filter-bar"><label>Status<select value={filter} onChange={(event) => setFilter((event.target as HTMLSelectElement).value)}><option value="all">All</option><option value="consumed">Completed</option><option value="rejected">Excluded</option><option value="active">Saved</option></select></label><span>{data?.total || 0} non-feed sources</span></div>{items.length ? <div class="source-list">{items.map((item: any) => <article><div><span class="meta">{item.content_type || 'source'} · {item.status}</span><h2>{item.video_title}</h2><p>{item.user_review || item.why_this || item.creator || 'No reaction recorded.'}</p></div>{item.video_url && <a href={item.video_url} target="_blank" rel="noreferrer" onClick={(event) => startExternal(event, item)}>Open</a>}</article>)}</div> : <Empty title="No matching sources" body="Try another status filter." />}<details class="legacy-discovery"><summary>Legacy Discovery archive</summary><p>Older research runs remain available here for reference. New recommendations appear as one Compass Pick on Momentum when the active shelf is empty.</p><Suspense fallback={<Loading />}><DiscoveryPage /></Suspense></details></div>
}

function SourceRecordPage({ record, onBack, onReload }: { record: any; onBack: () => void; onReload: () => void }) {
  const item = record.item || {}
  let storedFeedback: any = {}
  try { storedFeedback = JSON.parse(item.source_metadata_json || '{}').learning_feedback || {} } catch {}
  const reflection = (record.notes || []).find((note: any) => note.kind === 'reflection')
  const extracted = (record.notes || []).find((note: any) => note.kind !== 'reflection')
  const [feedback, setFeedback] = useState(reflection?.sections?.find((section: any) => section.section_key === 'reaction')?.content || item.user_review || '')
  const [rating, setRating] = useState(item.user_score == null ? '' : String(item.user_score))
  const [disposition, setDisposition] = useState(record.disposition?.disposition || 'retain')
  const [completionState, setCompletionState] = useState(storedFeedback.completion_state || (item.status === 'consumed' ? 'completed' : 'in_progress'))
  const [reasonTags, setReasonTags] = useState<string[]>(storedFeedback.reason_tags || [])
  const [expected, setExpected] = useState(storedFeedback.expected || '')
  const [actual, setActual] = useState(storedFeedback.actual || '')
  const [effort, setEffort] = useState(storedFeedback.effort || '')
  const [lengthMinutes, setLengthMinutes] = useState(storedFeedback.length_minutes == null ? '' : String(storedFeedback.length_minutes))
  const [feedbackBeforeEnhancement, setFeedbackBeforeEnhancement] = useState<string | null>(null)
  const [sourceNote, setSourceNote] = useState(extracted)
  const [noteEditing, setNoteEditing] = useState(false)
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
      await api('/feedback/record', { method: 'POST', body: JSON.stringify({ recommendation_id: item.id, thread_id: record.threads?.find((thread: any) => thread.status === 'active')?.id || record.threads?.[0]?.id, feedback, score: rating || undefined, disposition, completion_state: completionState, reason_tags: reasonTags, expected, actual, effort: effort || undefined, length_minutes: lengthMinutes || undefined }) })
      setStatus(disposition === 'retain' || disposition === 'apply' ? 'Saved for Hermes consolidation' : 'Feedback saved'); onReload()
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
    <header class="source-record-head"><div><span class="meta">Source context</span><h2>{item.video_title || reflection?.title || extracted?.title || 'Learning source'}</h2><p>{item.creator || item.content_type || 'Source'} · {item.learning_state || item.status || 'saved'}</p></div><div class="row-actions">{item.notebook_url && <a href={item.notebook_url} target="_blank" rel="noreferrer" onClick={(event) => openLearningTarget(event, { ...item, thread_id: record.threads?.find((thread: any) => thread.status === 'active')?.id || record.threads?.[0]?.id }, item.notebook_url, 'notebooklm')}>Open NotebookLM</a>}{item.video_url && <a class="primary-action" href={item.video_url} target="_blank" rel="noreferrer" onClick={(event) => openLearningTarget(event, { ...item, thread_id: record.threads?.find((thread: any) => thread.status === 'active')?.id || record.threads?.[0]?.id }, item.video_url, 'original')}>Open original</a>}</div></header>
    <section class="record-section"><div class="section-head"><h3>Extracted note</h3><span>{sourceNote ? `${extracted?.status || 'draft'} · ${(sourceNote.sections || []).length} sections` : 'Not created'}</span></div>{sourceNote ? <div class="note-reader">{(sourceNote.sections || []).map((section: any) => noteEditing ? <div dir={section.direction || 'auto'}><h4>{section.label}</h4><textarea class="note-editor" value={section.content} onInput={(event) => setSourceNote({ ...sourceNote, sections: (sourceNote.sections || []).map((current: any) => current.section_key === section.section_key ? { ...current, content: (event.target as HTMLTextAreaElement).value } : current) })} /></div> : <div class="note-document" dir={section.direction || 'auto'}><div class="section-key">{section.label}</div><div class="note-copy">{section.content}</div></div>)}<div class="row-actions">{noteEditing ? <><button class="primary-action" onClick={() => saveNote(sourceNote)}>Save changes</button><button onClick={() => { setSourceNote(extracted); setNoteEditing(false) }}>Cancel</button></> : <button onClick={() => setNoteEditing(true)}>Edit note</button>}</div></div> : <p class="record-muted">Retain or apply sends this source to Hermes for anchored Unit extraction and editable recall drafts.</p>}</section>
    <section class="record-section"><div class="section-head"><h3>My Feedback</h3><span>{rating ? `${rating}/10` : 'Not rated'}</span></div><textarea class="note-editor feedback-editor" value={feedback} onInput={(event) => setFeedback((event.target as HTMLTextAreaElement).value)} placeholder="Your exact reaction is preserved here." /><div class="row-actions"><button onClick={saveFeedback} disabled={!feedback.trim()}>Save feedback</button><button onClick={enhanceFeedback} disabled={!feedback.trim() || status === 'Enhancing…'}>Enhance writing</button>{feedbackBeforeEnhancement !== null && <button onClick={undoEnhancement}>Undo enhancement</button>}</div><details class="feedback-details"><summary>Detailed feedback and disposition</summary><div class="feedback-fields"><label>Score (0–10)<input type="number" min="0" max="10" step="0.5" value={rating} onInput={(event) => setRating((event.target as HTMLInputElement).value)} /></label><label>Learning status<select value={completionState} onChange={(event) => setCompletionState((event.target as HTMLSelectElement).value)}><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="stopped">Stopped</option></select></label><label>Effort<select value={effort} onChange={(event) => setEffort((event.target as HTMLSelectElement).value)}><option value="">Not set</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select></label><label>Minutes spent<input type="number" min="0" value={lengthMinutes} onInput={(event) => setLengthMinutes((event.target as HTMLInputElement).value)} /></label></div><label>Keep this knowledge?<select value={disposition} onChange={(event) => setDisposition((event.target as HTMLSelectElement).value)}><option value="retain">Retain and review</option><option value="apply">Apply in real work</option><option value="reference">Keep as reference</option><option value="drop">Drop after reflection</option></select></label><label>Reason tags<input value={reasonTags.join(', ')} onInput={(event) => setReasonTags((event.target as HTMLInputElement).value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="practical, too shallow, revisit" /></label><div class="feedback-fields"><label>Expected<textarea class="note-editor" value={expected} onInput={(event) => setExpected((event.target as HTMLTextAreaElement).value)} placeholder="What did you expect?" /></label><label>Actual<textarea class="note-editor" value={actual} onInput={(event) => setActual((event.target as HTMLTextAreaElement).value)} placeholder="What did you actually get?" /></label></div></details></section>
    {record.artifacts?.length ? <section class="record-section"><div class="section-head"><h3>Files</h3><span>{record.artifacts.length}</span></div>{record.artifacts.map((file: any) => <a class="record-line" href={`/artifacts/${file.id}`} target="_blank" rel="noreferrer"><strong>{file.filename}</strong><span>{file.media_type}{file.notebook_url ? ' · Open NotebookLM' : ''}</span></a>)}</section> : null}
    {record.proposals?.length ? <section class="record-section"><div class="section-head"><h3>Suggested profile changes</h3><span>{record.proposals.length}</span></div><p>Review these suggestions in Activity before they affect your profile.</p><a href="#/learn/activity">Open Activity</a></section> : null}
    {record.threads?.length || record.learning_units?.length || record.consolidation?.state ? <section class="record-section"><div class="section-head"><h3>Learning core</h3><span>{record.consolidation?.state?.replace(/_/g, ' ') || 'open'}</span></div>{record.threads?.length ? record.threads.map((thread: any) => <div class="record-line"><strong>{thread.title}</strong><span>{thread.thread_type} · {thread.status}</span></div>) : null}{record.learning_units?.length ? record.learning_units.map((unit: any) => <article class="record-line"><div><span class="meta">{unit.unit_type} · {unit.stance} · {Math.round(Number(unit.confidence || 0) * 100)}%</span><strong>{unit.statement}</strong>{unit.user_synthesis && <p>{unit.user_synthesis}</p>}</div><span>{unit.anchors?.length || 0} anchors</span></article>) : null}{record.consolidation?.failure_reason ? <p class="error-state">{record.consolidation.failure_reason}</p> : null}</section> : null}
    {record.sessions?.length ? <section class="record-section"><div class="section-head"><h3>Session history</h3><span>{record.sessions.length}</span></div>{record.sessions?.map((session: any) => <div class="record-line"><strong>{session.status} session</strong><span>{formatDate(session.started_at)}{session.completed_at ? ` → ${formatDate(session.completed_at)}` : ''}</span></div>)}</section> : null}
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
  if (!notes.length) return <Empty title="No extracted notes yet" body="Retained or applied sources become structured notes and anchored Learning Units after Hermes completes consolidation." />
  const visible = notes.filter((note: any) => !query.trim() || (note.title || '').toLowerCase().includes(query.trim().toLowerCase()))
  return <div><label class="page-search">Search extracted notes<input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Title" /></label><div class="source-list notes-source-list">{visible.map((note: any) => {
    const preview = (note.sections || []).find((section: any) => section.content)?.content || ''
    return <article class="note-row" key={note.id}><div><span class="meta">{note.sections?.length || 0} sections · updated {formatDate(note.updated_at)}</span><h2>{note.title}</h2>{preview && <p>{preview.slice(0, 140)}{preview.length > 140 ? '…' : ''}</p>}</div><div class="note-row-actions"><button class="primary-action" onClick={() => { location.hash = `#/learn/notes?note=${encodeURIComponent(note.id)}` }}>Open note</button></div></article>
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
  const { data, error, loading, reload } = useData('/feedback/proposals')
  const [working, setWorking] = useState('')
  const [status, setStatus] = useState('')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const proposals = data?.proposals || []
  const decide = async (proposal: any, action: 'approve' | 'reject' | 'revert') => {
    setWorking(proposal.id); setStatus(action === 'revert' ? 'Reverting change…' : action === 'approve' ? 'Applying change…' : 'Rejecting change…')
    try { await api(`/feedback/proposals/${proposal.id}/${action}`, { method: 'POST' }); setStatus(''); reload() }
    catch (proposalError: any) { setStatus(proposalError.message) }
    finally { setWorking('') }
  }
  if (!proposals.length) return <Empty title="No model changes yet" body="Evidence-backed Hermes changes and their undo receipts will appear here." />
  return <div class="proposal-list">{proposals.map((proposal: any) => <article><div class="proposal-head"><div><span class="meta">{labelize(proposal.change_type)} · {proposal.decision_source ? labelize(proposal.decision_source) : 'Awaiting evidence'}</span><h2>{proposal.target_label}</h2>{proposal.video_title && <a href={`#/learn/notes?source=${encodeURIComponent(proposal.recommendation_id)}`}>{proposal.video_title}</a>}</div><span class={`state state-${proposal.status}`}>{proposal.status}</span></div><div class="proposal-diff"><div><small>Before</small><pre>{proposal.current == null ? 'Not set' : safeProfileText(proposal.current)}</pre></div><div><small>After</small><pre>{safeProfileText(proposal.proposed)}</pre></div></div>{proposal.evidence && <p><strong>Evidence:</strong> {proposal.evidence}</p>}{proposal.reasoning && <p><strong>Why:</strong> {proposal.reasoning}</p>}<small>Confidence {Math.round(Number(proposal.confidence || 0) * 100)}%{proposal.validation?.reason ? ` · ${labelize(proposal.validation.reason)}` : ''}</small><div class="proposal-actions">{proposal.status === 'pending' && <><button disabled={working === proposal.id} onClick={() => decide(proposal, 'reject')}>Reject</button><button class="primary-action" disabled={working === proposal.id} onClick={() => decide(proposal, 'approve')}>Apply manually</button></>}{proposal.status === 'applied' && !proposal.reverted_at && <button disabled={working === proposal.id} onClick={() => decide(proposal, 'revert')}>Undo change</button>}</div></article>)}{status && <output class="sticky-status">{status}</output>}</div>
}

function ActivityPage() {
  return <div class="combined-view"><section><div class="section-head"><h2>Hermes model changes</h2><span>Automatic when evidence passes · always undoable</span></div><ChangesPage /></section><section><div class="section-head"><h2>System journal</h2><span>What changed</span></div><JournalPage /></section></div>
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
  const sorted = [...pairs].sort((a, b) => String(b.primary.created_at).localeCompare(String(a.primary.created_at)))
  const RECENT_COUNT = 5
  const recent = sorted.slice(0, RECENT_COUNT)
  const rest = sorted.slice(RECENT_COUNT)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = (pair: any) => !q || `${pair.metadata.source_title || ''} ${pair.metadata.source_url || ''}`.toLowerCase().includes(q)
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

const domain = (url?: string) => { try { return new URL(url || '').hostname.replace(/^www\./, '') } catch { return '' } }
  const renderPair = (pair: any, featured: boolean) => {
    const title = pair.metadata.source_title || pair.primary.filename?.replace(/\.(html?|pdf|md)$/i, '') || 'Untitled file'
    const href = (file: any) => file.legacy ? `/html/download/${file.id}` : /markdown|text\/plain/i.test(file.media_type || '') || /\.md$/i.test(file.filename || '') ? `/artifacts/${file.id}/view` : `/artifacts/${file.id}`
    const qa = pair.qualityAssurance
    const qaLabel = qa.status === 'repair_required' ? 'Needs repair' : qa.status === 'passed' && pair.html && qa.score != null ? `Verified ${qa.score}/10` : qa.status === 'passed' && qa.video_format === 'cinematic' ? 'Verified cinematic' : null
    const sub = featured && pair.metadata.source_url ? domain(pair.metadata.source_url) : (pair.metadata.source_url || `${pair.files.length} ${pair.files.length === 1 ? 'file' : 'linked files'}`)
    return <article class={featured ? 'artifact-card' : undefined}><div class="artifact-kind"><span>{artifactKind(pair)}</span><small>{formatDate(pair.primary.created_at)}</small></div><div class="artifact-copy"><h3>{title}</h3><p>{sub}</p></div><div class="artifact-actions">{qaLabel && <span class={`qa-label qa-${qa.status}`}>{qaLabel}</span>}{pair.metadata.source_url && <a href={pair.metadata.source_url} target="_blank" rel="noreferrer">Original</a>}{pair.html && <a class="primary-action" href={href(pair.html)} target="_blank" rel="noreferrer">Read</a>}{pair.markdown && !pair.html && <a class="primary-action" href={href(pair.markdown)} target="_blank" rel="noreferrer">Read</a>}{pair.pdf && <a href={href(pair.pdf)} target="_blank" rel="noreferrer">PDF</a>}{pair.notebookUrl && <a class="nblm-link" href={pair.notebookUrl} target="_blank" rel="noreferrer">NBLM</a>}{pair.files.length > 0 && <button class="artifact-remove" disabled={working === pair.id} onClick={() => remove(pair)}>Remove</button>}</div></article>
  }
  return <div class="artifact-library">
    <div class="artifact-library-head">
      <div>
        <strong>{pairs.length} {pairs.length === 1 ? 'source' : 'sources'}</strong>
        <span>Reading files and companions stay together.</span>
      </div>
    </div>
    {recent.filter(matches).length > 0 && <section class="artifact-recent"><div class="section-head"><h2>Latest</h2><span>Your 5 most recent reading files</span></div><div class="artifact-cards">{recent.filter(matches).map((pair) => renderPair(pair, true))}</div></section>}
    {rest.length > 0 && <section class="artifact-archive"><button class="artifact-archive-toggle" onClick={() => setShowAll((open) => !open)}>{showAll ? 'Collapse all files' : `Show all files (${rest.length})`}<span class="artifact-archive-chevron">{showAll ? '▾' : '▸'}</span></button>{showAll && <><div class="artifact-search-wrap"><input class="artifact-search" aria-label="Search files" type="search" placeholder="Search files…" value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} /></div>{query.trim() && rest.filter(matches).length === 0 ? <div class="artifact-none">No files match “{query}”.</div> : <div class="artifact-table">{rest.filter(matches).map((pair) => renderPair(pair, false))}</div>}</>}</section>}
    {status && <output class="sticky-status">{status}</output>}
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

function rolloutGateReadout(gate: any) {
  if (gate?.observed && typeof gate.observed === 'object') {
    const required = Number(gate.required_each || 0)
    return ['fit', 'bridge', 'challenge'].map((lane) => `${labelize(lane)} ${Number(gate.observed[lane] || 0)}/${required}`).join(' · ')
  }
  return `${Number(gate?.observed || 0)}/${Number(gate?.required || 0)}`
}

function HermesPage() {
  const { data, error, loading, reload } = useData('/analytics/hermes')
  const weekly = useData('/analytics/hermes/weekly')
  const engine = useData('/analytics/hermes/engine')
  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  const quality = data?.quality || {}
  const population = quality.population || {}
  const profileHealth = data?.profile_intelligence?.health || {}
  const recalibrate = async () => { if (!window.confirm('Recalibrate from clean learning-value outcomes?')) return; try { const result = await api<any>('/analytics/hermes/recalibrate', { method: 'POST' }); window.alert(`Recalibrated from ${result.sample_size} learning outcomes.`); reload() } catch (e: any) { window.alert(e.message) } }
  const repair = async () => { try { const preview = await api<any>('/analytics/hermes/repair'); const summary = preview.summary || {}; if (!window.confirm(`Repair ${summary.fabricated_scores || 0} fabricated scores and classify ${summary.administrative_exclusions || 0} administrative exclusions? A snapshot receipt will be kept.`)) return; await api('/analytics/hermes/repair', { method: 'POST', body: JSON.stringify({ apply: true, snapshot_id: preview.snapshot_id }) }); window.alert('History repair applied.'); reload(); engine.reload() } catch (e: any) { window.alert(e.message) } }
  return <div class="hermes-page">
    <div class="page-actions"><span>Learning intelligence · {formatDate(data?.checked_at)}</span><div><button class="secondary-action" onClick={repair}>Repair historical signals</button> <button class="secondary-action" onClick={recalibrate}>Recalibrate</button> <button class="secondary-action" onClick={() => { reload(); engine.reload(); weekly.reload() }}>Refresh</button></div></div>
    <div class="summary-strip"><div><strong>{population.utility_labeled || 0}</strong><span>Utility-labeled sources</span></div><div><strong>{population.explicit_fit_labels || 0}</strong><span>Explicit fit labels</span></div><div><strong>{population.administrative_exclusions || 0}</strong><span>Administrative exclusions</span></div><div><strong>{quality.prediction_error == null ? '—' : quality.prediction_error}</strong><span>Learning-value MAE</span></div></div>
    <div class="two-column-data"><section><div class="section-head"><h2>V2 rollout</h2><span>{engine.data?.setting?.mode === 'v2' ? 'Serving' : 'Shadow'}</span></div>{engine.error ? <ErrorState message={engine.error} /> : <div class="compact-list">{Object.entries(engine.data?.gates || {}).map(([key, gate]: [string, any]) => <article><strong>{labelize(key)}</strong><span>{gate.passed ? 'Passed' : 'Waiting'} · {rolloutGateReadout(gate)}</span></article>)}</div>}</section><section><div class="section-head"><h2>Profile health</h2><span>{labelize(profileHealth.status || 'unknown')}</span></div><div class="compact-list"><article><strong>Active assertions</strong><span>{profileHealth.active || 0}</span></article><article><strong>Hypotheses</strong><span>{profileHealth.hypotheses || 0}</span></article><article><strong>Low-confidence active</strong><span>{profileHealth.low_confidence_active || 0}</span></article><article><strong>Historical fields needing review</strong><span>{profileHealth.pending_historical_normalization || 0}</span></article></div></section></div>
    <div class="two-column-data"><section><div class="section-head"><h2>Compass learning</h2><span>Bounded per lane</span></div><div class="compact-list">{(data?.compass_learning?.feature_weights || []).map((item: any) => <article key={`${item.strategy}-${item.dimension}`}><strong>{item.strategy} · {labelize(item.dimension)}</strong><span>{Math.round(Number(item.current_weight || 0) * 100)}% · {item.evidence_count || 0} signals</span></article>)}</div></section><section><div class="section-head"><h2>Learning value by format</h2><span>Clean outcomes only</span></div><div class="compact-list">{(quality.by_format || []).map((item: any) => <article key={item.format}><strong>{labelize(item.format)}</strong><span>{item.total || 0} outcomes · {item.average_learning_value == null ? '—' : Math.round(Number(item.average_learning_value) * 100) + '%'} value</span></article>)}</div></section></div>
    <section><div class="section-head"><h2>Self-improvement receipts</h2><span>Conversation-bound · reversible</span></div>{data?.self_improvement?.runs?.length ? <div class="compact-list">{data.self_improvement.runs.map((run: any) => <article><strong>{labelize(run.trigger_kind)} · {labelize(run.layer)}</strong><span>{run.status} · confidence {Math.round(Number(run.confidence || 0) * 100)}% · {formatDate(run.created_at)}</span></article>)}</div> : <Empty title="No improvement runs yet" body="Validated profile, recommendation, and system changes will leave receipts here." />}</section>
    <section><div class="section-head"><h2>Recent learning quality</h2><span>{weekly.data?.period?.since ? `${formatDate(weekly.data.period.since)} → ${formatDate(weekly.data.period.until)}` : 'Loading'}</span></div>{weekly.error ? <ErrorState message={weekly.error} /> : <div class="compact-list"><article><strong>Completion</strong><span>{weekly.data?.accuracy?.completion_rate == null ? '—' : `${weekly.data.accuracy.completion_rate}%`} · error {weekly.data?.accuracy?.prediction_error ?? '—'}</span></article><article><strong>Abandoned sources</strong><span>{(weekly.data?.abandoned_sources || []).map((item: any) => `${item.source_class}: ${item.count}`).join(' · ') || 'None recorded'}</span></article><article><strong>Taste drift</strong><span>{(weekly.data?.taste_drift || []).map((item: any) => `${labelize(item.branch)} ${item.change > 0 ? '+' : ''}${item.change}`).join(' · ') || 'Not enough ratings'}</span></article></div>}</section>
    {Number(data?.pending_proposals || 0) > 0 && <p class="settings-status">{data.pending_proposals} changes are waiting because evidence or historical normalization is incomplete.</p>}
  </div>
}
function capabilityArea(path: string) {
  if (/^\/(capture|recommendations|compass|discovery|collections)/.test(path)) return 'Capture & curation'
  if (/^\/(learning|sessions|srs|notes|feedback)/.test(path)) return 'Learning loop'
  if (/^\/(brain|knowledge|taste)/.test(path)) return 'Knowledge & profile'
  if (/^\/(artifacts|notebooklm)/.test(path)) return 'Files & NotebookLM'
  if (/^\/(analytics)/.test(path)) return 'Intelligence & analytics'
  if (/^\/(notifications)/.test(path)) return 'Delivery & reminders'
  return 'Platform & system'
}

function SystemPage() {
  const capabilities = useData('/agent/capabilities')
  const system = useData('/agent/system')
  const jobs = useData('/agent/jobs/health')
  const integrity = useData('/learning/core/integrity/health')
  const notebook = useData('/notebooklm/health')
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('ALL')
  if (capabilities.loading || system.loading) return <Loading />
  if (capabilities.error || system.error) return <ErrorState message={capabilities.error || system.error} />
  const operations = capabilities.data?.capabilities || []
  const filtered = operations.filter((item: any) => (method === 'ALL' || item.method === method) && `${item.path} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const grouped = filtered.reduce((result: Record<string, any[]>, item: any) => { const area = capabilityArea(item.path); result[area] = [...(result[area] || []), item]; return result }, {})
  const writeCount = operations.filter((item: any) => item.method !== 'GET').length
  const activeJobs = Number(system.data?.counts?.active_jobs || 0)
  return <div class="system-console">
    <section class="system-hero"><div><span class="meta">Learning Compass control plane</span><h2>Everything the system can do</h2><p>One searchable inventory for user features, Hermes operations, schedules, storage, health, and guarded mutations.</p></div><div class="system-hero-actions"><a href="/agent/openapi.json" target="_blank" rel="noreferrer">Open API specification ↗</a><button onClick={() => { capabilities.reload(); system.reload(); jobs.reload(); integrity.reload(); notebook.reload() }}>Refresh status</button></div></section>
    <div class="system-summary"><div><strong>{operations.length}</strong><span>API operations</span></div><div><strong>{operations.length - writeCount}</strong><span>Read operations</span></div><div><strong>{writeCount}</strong><span>Guarded writes</span></div><div><strong>{system.data?.schedule?.length || 0}</strong><span>Active schedule</span></div></div>
    <section class="system-health"><div class="section-head"><h2>Live services</h2><span>Current observable state</span></div><div class="system-health-grid">
      <article><i class="healthy" /><span><strong>Worker</strong><small>{system.data?.environment} · active</small></span></article>
      <article><i class={Number(integrity.data?.active_orphans || 0) === 0 ? 'healthy' : 'warning'} /><span><strong>Learning data</strong><small>{integrity.loading ? 'Checking…' : integrity.error ? 'Unavailable' : `${integrity.data.active_orphans} active integrity failures`}</small></span></article>
      <article><i class={Number(jobs.data?.stale_running || 0) === 0 ? 'healthy' : 'warning'} /><span><strong>Hermes jobs</strong><small>{jobs.loading ? 'Checking…' : jobs.error ? 'Unavailable' : `${activeJobs} active · ${jobs.data.stale_running || 0} stale leases`}</small></span></article>
      <article><i class={notebook.data?.status === 'healthy' ? 'healthy' : 'warning'} /><span><strong>NotebookLM</strong><small>{notebook.loading ? 'Checking…' : notebook.error ? 'Unavailable' : labelize(notebook.data?.status || 'unknown')}</small></span></article>
    </div></section>
    <div class="system-two-column">
      <section><div class="section-head"><h2>Schedules</h2><span>{system.data?.schedule?.length || 0} configured</span></div><div class="schedule-list">{(system.data?.schedule || []).map((item: any) => <article><div class="schedule-head"><span class="method-badge method-post">CRON</span><div><strong>{item.cadence}</strong><code>{item.cron} · {item.timezone}</code></div></div><ul>{item.responsibilities.map((responsibility: string) => <li>{responsibility}</li>)}</ul><small>Search synced {item.last_search_sync ? formatDate(item.last_search_sync) : 'not recorded'} · evaluator week {item.last_evaluator_week || 'not recorded'}</small></article>)}</div></section>
      <section><div class="section-head"><h2>Never scheduled</h2><span>User or Hermes starts these</span></div><div class="on-demand-list">{(system.data?.on_demand_only || []).map((item: string) => <div><i /><span>{item}</span></div>)}</div></section>
    </div>
    <section><div class="section-head"><h2>Data and runtime</h2><span>{system.data?.timezone}</span></div><div class="system-storage">{(system.data?.storage || []).map((item: any) => <article><div><strong>{item.name}</strong><span>{item.purpose}</span></div><em>{labelize(item.status)}</em></article>)}</div><div class="system-counts">{Object.entries(system.data?.counts || {}).map(([key, value]) => <span><strong>{String(value)}</strong>{labelize(key)}</span>)}</div></section>
    <section class="api-catalog"><div class="api-catalog-head"><div><span class="meta">Complete capability catalog</span><h2>API operations</h2></div><div class="api-filters"><label>Search<input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search path or capability" /></label><label>Method<select value={method} onChange={(event) => setMethod((event.target as HTMLSelectElement).value)}><option value="ALL">All methods</option><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option><option value="DELETE">DELETE</option></select></label></div></div>
      <div class="api-results-note"><span>{filtered.length} of {operations.length} operations</span><span>Writes preserve normal validation and are audit logged.</span></div>
      <div class="api-groups">{(Object.entries(grouped) as Array<[string, any[]]>).map(([area, items]) => <section><div class="api-group-title"><h3>{area}</h3><span>{items.length}</span></div><div class="api-operation-list">{items.map((item: any) => <article><span class={`method-badge method-${item.method.toLowerCase()}`}>{item.method}</span><code>{item.path}</code><p>{item.description}</p><small>{item.method === 'GET' ? 'Read only' : item.method === 'DELETE' || /delete|remove|unsubscribe/i.test(item.description) ? 'Destructive · explicit action' : 'Validated · audit logged'}</small></article>)}</div></section>)}</div>
    </section>
    <section class="system-safety"><div class="section-head"><h2>Safety boundaries</h2><span>{capabilities.data?.authentication}</span></div>{(system.data?.safety || []).map((item: string) => <span>{item}</span>)}</section>
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
    const parsed = profileValue(raw)
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) return { name: '', context: profileTags(parsed, 4) }
      const record = parsed as Record<string, unknown>
      const explicitName = ['name', 'display_name', 'full_name', 'title'].map((key) => record[key]).find((value) => typeof value === 'string' && value.trim())
      const context = Object.entries(record).filter(([key]) => !['name', 'display_name', 'full_name', 'title'].includes(key)).slice(0, 4).map(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') return `${labelize(key)} · ${value}`
        return labelize(key)
      })
      return { name: typeof explicitName === 'string' ? explicitName.trim() : '', context }
    }
    if (/^[\[{]/.test(raw.trim())) return { name: '', context: ['Identity needs repair'] }
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
    { id: 'profile-intelligence', label: 'Adaptive model', value: items.profile_assertions?.length || 0, detail: 'assertions' },
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

function TypedProfileModel({ items, reload }: { items: Record<string, any>; reload: () => void }) {
  const assertions = items.profile_assertions || []
  const revisions = items.profile_revisions || []
  const health = items.profile_health || {}
  const [editing, setEditing] = useState<any>(null)
  const [status, setStatus] = useState('')
  const begin = (assertion: any) => setEditing({ ...assertion, draft: typeof assertion.value === 'string' ? assertion.value : JSON.stringify(assertion.value, null, 2) })
  const save = async (assertion: any, nextStatus = assertion.status) => {
    setStatus('Saving assertion…')
    let value: any = editing?.id === assertion.id ? editing.draft : assertion.value
    if (typeof value === 'string') { try { value = JSON.parse(value) } catch {} }
    try {
      await api(`/brain/profile/assertions/${encodeURIComponent(assertion.assertion_key)}`, { method: 'PUT', body: JSON.stringify({ category: editing?.id === assertion.id ? editing.category : assertion.category, value, status: nextStatus, target_version: assertion.version, reason: 'Explicit profile edit' }) })
      setEditing(null); setStatus('Saved'); reload()
    } catch (saveError: any) { setStatus(saveError.message) }
  }
  const undo = async (revision: any) => {
    setStatus('Undoing revision…')
    try { await api(`/brain/profile/revisions/${revision.id}/revert`, { method: 'POST' }); setStatus('Revision undone'); reload() }
    catch (undoError: any) { setStatus(undoError.message) }
  }
  return <ProfilePanel id="profile-intelligence" title="Adaptive profile" description="Typed evidence, confidence, history, and direct control. Nothing in this model is locked." count={`${assertions.length} assertions`} open>
    <div class="profile-health-strip"><div><strong>{labelize(health.status || 'unknown')}</strong><span>model health</span></div><div><strong>{health.active || 0}</strong><span>active</span></div><div><strong>{health.hypotheses || 0}</strong><span>hypotheses</span></div><div><strong>{health.pending_historical_normalization || 0}</strong><span>needs review</span></div></div>
    {assertions.length ? <div class="profile-assertion-list">{assertions.map((assertion: any) => <article key={assertion.id}><div class="profile-assertion-head"><div><span class="meta">{labelize(assertion.category)} · {labelize(assertion.source_kind)}</span><strong>{assertion.assertion_key}</strong></div><span class={`state state-${assertion.status}`}>{assertion.status}</span></div>{editing?.id === assertion.id ? <div class="profile-assertion-editor"><label>Category<input value={editing.category} onInput={(event) => setEditing({ ...editing, category: (event.target as HTMLInputElement).value })} /></label><label>Value<textarea value={editing.draft} onInput={(event) => setEditing({ ...editing, draft: (event.target as HTMLTextAreaElement).value })} /></label><div class="row-actions"><button onClick={() => setEditing(null)}>Cancel</button><button class="primary-action" onClick={() => save(assertion)}>Save</button></div></div> : <><pre>{typeof assertion.value === 'string' ? assertion.value : JSON.stringify(assertion.value, null, 2)}</pre><small>Confidence {Math.round(Number(assertion.confidence || 0) * 100)}% · version {assertion.version}</small><div class="row-actions"><button onClick={() => begin(assertion)}>Edit</button>{assertion.status !== 'inactive' && <button onClick={() => save(assertion, 'inactive')}>Deactivate</button>}</div></>}</article>)}</div> : <p class="profile-empty">Run the deterministic profile repair to import the compatibility profile into typed assertions.</p>}
    {revisions.length > 0 && <details class="profile-revisions"><summary>Revision history · {revisions.length}</summary><div>{revisions.slice(0, 20).map((revision: any) => <article><span><strong>{revision.assertion_key}</strong><small>{labelize(revision.decision_source)} · {formatDate(revision.created_at)}</small></span><button onClick={() => undo(revision)}>Undo</button></article>)}</div></details>}
    {status && <output class="settings-status">{status}</output>}
  </ProfilePanel>
}

function SettingsPage({ route }: { route: Destination }) {
  const [theme, setTheme] = useState(localStorage.getItem('tm-theme') || 'system')
  const [density, setDensity] = useState(localStorage.getItem('tm-density') || 'balanced')
  const [retention, setRetention] = useState(90)
  const [enrichCapture, setEnrichCapture] = useState(true)
  const [profileAutomation, setProfileAutomation] = useState('automatic')
  const [engineMode, setEngineMode] = useState('shadow')
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
    setProfileAutomation(resolved.profile_automation?.mode || 'automatic')
    setEngineMode(resolved.recommendation_engine?.mode || 'shadow')
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
            <div class="deck-callout-banner">
              <div>
                <h4>🎴 Tender Branch Swiper</h4>
                <p>Swipe candidate R1 Macro & R2 Micro branches to visually tune your knowledge profile.</p>
              </div>
              <a class="primary-action" href="#/map/deck">Open Branch Deck</a>
            </div>
            <TypedProfileModel items={profileItems} reload={profile.reload} />
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
    {route.slug === 'preferences' && <><div class="setting-section"><h3>Appearance</h3><div class="setting-row"><div><strong>Theme</strong><span>Follow the device unless you choose an override.</span></div><select value={theme} onChange={(event) => changeTheme((event.target as HTMLSelectElement).value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="setting-row"><div><strong>Density</strong><span>Balanced for daily use; compact when managing large libraries.</span></div><select value={density} onChange={(event) => changeDensity((event.target as HTMLSelectElement).value)}><option value="balanced">Balanced</option><option value="compact">Compact</option></select></div></div><div class="setting-section"><h3>Learning</h3><div class="setting-row"><div><strong>Active queue</strong><span>Five deliberate items; Inbox remains unlimited.</span></div><span class="setting-value">5 slots</span></div><label class="setting-row"><div><strong>Review target</strong><span>Used to adjust future recall intervals.</span></div><select value={retention} onChange={(event) => { const value = Number((event.target as HTMLSelectElement).value); setRetention(value); persist('learning', { retention: value, queue_cap: 5 }) }}><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option></select></label><div class="setting-row"><div><strong>Retained knowledge</strong><span>Hermes consolidates retained or applied sources during the active workflow.</span></div><span class="setting-value">Hermes</span></div></div><div class="setting-section"><h3>Curation</h3><label class="setting-row"><div><strong>Enrich new captures</strong><span>Queue enrichment only when enabled.</span></div><input type="checkbox" checked={enrichCapture} onChange={(event) => { const enabled = (event.target as HTMLInputElement).checked; setEnrichCapture(enabled); persist('ai_curation', { enrich_capture: enabled }) }} /></label><label class="setting-row"><div><strong>Hermes profile learning</strong><span>Apply strong evidence automatically and keep every change reversible.</span></div><select value={profileAutomation} onChange={(event) => { const mode = (event.target as HTMLSelectElement).value; setProfileAutomation(mode); persist('profile_automation', { mode, policy_version: 'profile_v2' }) }}><option value="automatic">Automatic</option><option value="manual">Manual review</option></select></label><div class="setting-row"><div><strong>Recommendation engine</strong><span>V2 switches on only after shadow evidence passes every rollout gate.</span></div><span class="setting-value">{engineMode === 'v2' ? 'V2 active' : 'V2 shadow'}</span></div><div class="setting-row"><div><strong>Automatic recommendations</strong><span>Finishing one source never automatically adds another.</span></div><span class="setting-value">Off</span></div></div></>}
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
  if (route.key === 'map.deck') return <BranchDeckPage />
  if (route.key === 'map.coverage') return <div class="combined-view"><CoveragePage /><ContradictionsPage /></div>
  if (route.key === 'learn.hub') return <LearningHubPage />
  if (route.key === 'learn.files') return <ArtifactsPage />
  if (route.key === 'learn.notes') return <NotesPage />
  if (route.key === 'learn.recall') return <RecallPage />
  if (route.key === 'learn.activity') return <ActivityPage />
  if (route.key === 'insights.overview') return <OverviewPage />
  if (route.key === 'insights.taste') return <TastePage insight />
  if (route.key === 'insights.hermes') return <div class="combined-view"><HermesPage /><HermesMemoryPage /></div>
  if (route.key === 'settings.system') return <SystemPage />
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
    ...(groups.nodes || []).map((item: any) => ({ group: 'Map', title: item.label || item.id, detail: item.super_category || item.type, target: 'map.atlas' })),
    ...(groups.vault || []).map((item: any) => ({ group: 'Files', title: item.filename, detail: formatDate(item.created_at), target: 'learn.files' })),
    ...(groups.patterns || []).map((item: any) => ({ group: 'Patterns', title: item.description || item.id, detail: item.strength, target: 'settings.profile' })),
    ...(groups.threads || []).map((item: any) => ({ group: 'Threads', title: item.title, detail: item.guiding_question || item.status, target: 'today.momentum' })),
    ...(groups.units || []).map((item: any) => ({ group: 'Knowledge', title: item.statement, detail: item.unit_type, target: 'map.atlas' })),
    ...(groups.notes || []).map((item: any) => ({ group: 'Notes', title: item.title, detail: item.kind, target: 'learn.notes' })),
    ...(groups.artifacts || []).map((item: any) => ({ group: 'Files', title: item.filename, detail: item.media_type, target: 'learn.files' })),
    ...(groups.assertions || []).map((item: any) => ({ group: 'Profile', title: item.assertion_key, detail: item.category, target: 'settings.profile' })),
    ...(groups.memories || []).map((item: any) => ({ group: 'Memory', title: item.memory_key, detail: item.memory_kind, target: 'insights.hermes' })),
  ].slice(0, 16)
  return <dialog ref={ref} class="command-dialog" onClose={onClose}><div class="command-input"><Icon name="search" /><input aria-label="Search Learning Compass" autoFocus value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search sources, notes, files, branches, or pages…" /><kbd>Esc</kbd></div><div class="command-results">{pages.map((item) => <button onClick={() => { go(item); onClose() }}><span>{workspaceLabels[item.workspace]}</span><strong>{item.title}</strong><small>{item.purpose}</small></button>)}{query.trim().length >= 2 && cloud.loading && <div class="command-message">Searching your library…</div>}{cloudResults.map((item) => <button onClick={() => { go(destinations.find((destination) => destination.key === item.target)!); onClose() }}><span>{item.group}</span><strong>{item.title}</strong><small>{item.detail}</small></button>)}{query.trim().length >= 2 && !cloud.loading && !pages.length && !cloudResults.length && <div class="command-message">No matches found.</div>}</div></dialog>
}

function MobileMore({ open, route, onClose, onSearch, onCapture }: { open: boolean; route: Destination; onClose: () => void; onSearch: () => void; onCapture: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  const workspaces = (['map', 'insights', 'settings'] as WorkspaceKey[])
  return <dialog ref={ref} class="mobile-more-dialog" onClose={onClose}><div class="mobile-more-head"><strong>More</strong><button onClick={onClose}>Close</button></div><div class="mobile-more-actions"><button onClick={() => { onSearch(); onClose() }}><Icon name="search" />Search everything</button><button onClick={() => { onCapture(); onClose() }}><Icon name="capture" />Capture source</button></div><nav aria-label="More workspaces">{workspaces.map((workspace) => { const target = destinations.find((item) => item.workspace === workspace)!; return <button class={route.workspace === workspace ? 'active' : ''} onClick={() => { go(target); onClose() }}><Icon name={workspace} /><span><strong>{workspaceLabels[workspace]}</strong><small>{target.purpose}</small></span></button> })}</nav></dialog>
}

type ActiveSession = { id: string; recommendationId: string; title: string; sourceUrl: string; threadId?: string | null; targetKind?: string }

function ReturnDialog({ session, onClose, onComplete }: { session: ActiveSession | null; onClose: () => void; onComplete: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [reflection, setReflection] = useState('')
  const [rating, setRating] = useState('')
  const [completionState, setCompletionState] = useState('completed')
  const [reasonTags, setReasonTags] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [effort, setEffort] = useState('moderate')
  const [lengthMinutes, setLengthMinutes] = useState('')
  const [disposition, setDisposition] = useState('retain')
  const [status, setStatus] = useState('')
  useEffect(() => { if (session) { setReflection(''); setRating(''); setCompletionState('completed'); setReasonTags(''); setExpected(''); setActual(''); setEffort('moderate'); setLengthMinutes(''); setDisposition('retain'); setStatus(''); ref.current?.showModal() } else ref.current?.close() }, [session?.id])
  if (!session) return null
  const submit = async (complete: boolean) => {
    setStatus(complete ? 'Finishing and processing…' : 'Saving your place…')
    try {
      const state = complete ? completionState : 'in_progress'
      await api(`/sessions/${session.id}/return`, { method: 'POST', body: JSON.stringify({ reflection, score: rating ? Number(rating) : undefined, disposition, complete: state === 'completed', completion_state: state, reason_tags: reasonTags.split(',').map((tag) => tag.trim()).filter(Boolean), expected, actual, effort, length_minutes: lengthMinutes ? Number(lengthMinutes) : undefined, auto_enqueue: state === 'completed' }) })
      if (state === 'completed') { localStorage.removeItem('tm-active-session'); onComplete() } else onClose()
      return true
    } catch (error: any) { setStatus(error.message); return false }
  }
  const dismiss = () => onClose()
  return <dialog ref={ref} class="return-dialog" onClose={dismiss}><div class="dialog-head"><div><span>Learning handoff</span><h2>What changed after reading?</h2></div><button onClick={dismiss}>Later</button></div><p class="return-source">{session.title}</p><label>My notes & reaction <span>optional</span><textarea autoFocus value={reflection} onInput={(event) => setReflection((event.target as HTMLTextAreaElement).value)} placeholder="What surprised you? What do you disagree with? What will you use?" /></label><label>Score {rating ? <span>{rating}/10</span> : <span>optional — leave unset if unsure</span>}{rating !== '' && <button type="button" class="field-clear" onClick={() => setRating('')}>Clear</button>}<input type="range" min="1" max="10" value={rating || '5'} onInput={(event) => setRating((event.target as HTMLInputElement).value)} /></label><div class="feedback-fields"><label>Keep this knowledge?<select value={disposition} onChange={(event) => setDisposition((event.target as HTMLSelectElement).value)}><option value="retain">Retain and review</option><option value="apply">Apply in real work</option><option value="reference">Keep as reference</option><option value="drop">Drop after reflection</option></select></label><label>Status<select value={completionState} onChange={(event) => setCompletionState((event.target as HTMLSelectElement).value)}><option value="completed">Completed</option><option value="in_progress">Still in progress</option><option value="stopped">Stopped</option></select></label><label>Effort<select value={effort} onChange={(event) => setEffort((event.target as HTMLSelectElement).value)}><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select></label><label>Minutes spent<input type="number" min="0" value={lengthMinutes} onInput={(event) => setLengthMinutes((event.target as HTMLInputElement).value)} /></label></div><label>Reason tags<input value={reasonTags} onInput={(event) => setReasonTags((event.target as HTMLInputElement).value)} placeholder="practical, too shallow, revisit" /></label><div class="feedback-fields"><label>Expected<textarea value={expected} onInput={(event) => setExpected((event.target as HTMLTextAreaElement).value)} placeholder="What did you expect?" /></label><label>Actual<textarea value={actual} onInput={(event) => setActual((event.target as HTMLTextAreaElement).value)} placeholder="What did you actually get?" /></label></div><div class="return-actions"><a href={session.sourceUrl} target="_blank" rel="noreferrer">Resume source</a><button onClick={async () => { if (await submit(false)) localStorage.removeItem('tm-active-session') }}>Save for later</button><button class="primary-action" onClick={() => submit(true)}>{completionState === 'completed' ? 'Finish and hand to Hermes' : 'Save feedback'}</button></div>{status && <output>{status}</output>}</dialog>
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
