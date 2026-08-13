import { useEffect, useMemo, useState } from 'preact/hooks'
import { ApiError, api } from '../api'
import { ErrorState, Loading } from '../components/States'
import { useData } from '../app/useData'
import { useRoute } from '../app/router'
import { processArtifact, startLearningSession, triageCapture } from './library/actions'
import {
  AllSourcesView,
  ArchiveView,
  BooksView,
  CollectionsView,
  FilesView,
  InboxView,
  ObjectRouteView,
  QueueView,
  type LibraryViewHandlers,
} from './library/LibraryViews'
import {
  asView,
  artifactSelection,
  bookSelection,
  collectionSelection,
  listFrom,
  objectHref,
  sourceSelection,
  type LibraryObjectType,
  type LibraryRecord,
  type LibrarySelection,
  type LibraryWorkspaceProps,
} from './library/types'

function endpointFor(view: string, objectType?: string, objectId?: string) {
  if (objectType && objectId) {
    const id = encodeURIComponent(objectId)
    if (objectType === 'source') return `/capture/${id}/record`
    if (objectType === 'artifact') return '/artifacts'
    if (objectType === 'book') return '/recommendations/books'
    if (objectType === 'collection') return '/collections'
  }
  switch (asView(view)) {
    case 'inbox': return '/capture'
    case 'all': return '/recommendations/list?limit=200'
    case 'files': return '/artifacts'
    case 'books': return '/recommendations/books'
    case 'collections': return '/collections'
    case 'archive': return '/recommendations/list?limit=200&source=manual'
    default: return '/capture/queue'
  }
}

function errorCode(error: unknown) {
  if (error instanceof ApiError) return String(error.body?.error || '')
  return String((error as any)?.body?.error || '')
}

function actionMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The action could not be completed.'
}

function selectionFor(type: LibraryObjectType, item: LibraryRecord): LibrarySelection {
  if (type === 'artifact') return artifactSelection(item)
  if (type === 'book') return bookSelection(item)
  if (type === 'collection') return collectionSelection(item)
  return sourceSelection(item)
}

function objectItem(type: LibraryObjectType, data: LibraryRecord, objectId: string) {
  if (type === 'source') return data.item || null
  if (type === 'artifact') return listFrom<LibraryRecord>(data, 'artifacts').find((item) => String(item.id) === objectId) || null
  if (type === 'book') return listFrom<LibraryRecord>(data, 'books').find((item) => String(item.id) === objectId) || null
  if (type === 'collection') return listFrom<LibraryRecord>(data, 'collections').find((item) => String(item.id) === objectId) || null
  return null
}

export function LibraryWorkspace({ route, onInspect, onSelect, onNavigate }: LibraryWorkspaceProps) {
  const localRoute = useRoute()
  const activeRoute = route || localRoute
  const view = asView(activeRoute.view)
  const objectType = activeRoute.objectType as LibraryObjectType | undefined
  const endpoint = endpointFor(view, objectType, activeRoute.objectId)
  const { data, error, loading, reload } = useData<LibraryRecord>(endpoint)
  const [working, setWorking] = useState('')
  const [blockedId, setBlockedId] = useState('')
  const [notice, setNotice] = useState('')

  const inspect = (selection: LibrarySelection) => {
    onInspect?.(selection)
    onSelect?.(selection)
    if (location.hash !== selection.route) location.hash = selection.route.slice(1)
  }

  useEffect(() => {
    if (!activeRoute.objectId || !objectType || !data) return
    const item = objectItem(objectType, data, activeRoute.objectId)
    if (item) {
      const selection = selectionFor(objectType, item)
      onInspect?.(selection)
      onSelect?.(selection)
    }
  }, [activeRoute.objectId, objectType, data, onInspect, onSelect])

  const go = (href: string) => {
    onNavigate?.(href)
    if (!onNavigate) location.hash = href.slice(1)
  }

  const queue = async (item: LibraryRecord, override = false) => {
    setWorking(String(item.id)); setNotice(''); if (!override) setBlockedId('')
    try {
      await triageCapture(String(item.id), 'queue', override)
      setBlockedId('')
      setNotice(override ? 'Added with the explicit Queue-cap override.' : 'Added to Queue.')
      reload()
    } catch (actionError) {
      if (errorCode(actionError) === 'queue_full' || actionMessage(actionError).toLowerCase().includes('queue_full')) {
        setBlockedId(String(item.id)); setNotice('Queue is at its five-item cap. Review the overflow choice before adding this source.')
      } else if (errorCode(actionError) === 'learning_thread_required') {
        setNotice('Start a Learning Thread before adding a source to Queue.')
      } else {
        setNotice(actionMessage(actionError))
      }
    } finally { setWorking('') }
  }

  const exclude = async (item: LibraryRecord) => {
    if (!window.confirm(`Exclude “${item.video_title || item.title || 'this source'}”? This is an administrative exclusion; it will not be recorded as bad fit.`)) return
    setWorking(String(item.id)); setNotice('')
    try { await triageCapture(String(item.id), 'exclude'); setNotice('Source excluded.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const start = async (event: MouseEvent, item: LibraryRecord, href: string, kind: 'original' | 'html' | 'pdf' | 'artifact' | 'notebooklm' = 'original', artifactId?: string) => {
    setWorking(String(item.id)); setNotice('')
    try { await startLearningSession(event, item, href, kind, artifactId) }
    catch (actionError) { setNotice(`Could not start the session: ${actionMessage(actionError)}`) }
    finally { setWorking('') }
  }

  const process = async (item: LibraryRecord) => {
    setWorking(String(item.id)); setNotice('')
    try { const result = await processArtifact(String(item.id)); setNotice(result.status === 'retry' ? 'Extraction retry queued.' : 'Note extraction queued.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const removeArtifact = async (item: LibraryRecord) => {
    const files = Array.isArray(item._group) ? item._group as LibraryRecord[] : [item]
    if (!window.confirm(`Remove ${files.length > 1 ? `these ${files.length} linked files` : `“${item.filename || 'this file'}”`} from Files?`)) return
    setWorking(String(item.id)); setNotice('Removing…')
    try { for (const file of files) await api(`/artifacts/${encodeURIComponent(String(file.id))}`, { method: 'DELETE' }); setNotice('Removed from Files.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const completeChapter = async (book: LibraryRecord, chapter: LibraryRecord) => {
    const busyKey = `${book.id}:${chapter.key}`
    setWorking(busyKey); setNotice('')
    try { await api(`/recommendations/books/${encodeURIComponent(String(book.id))}/chapters/${encodeURIComponent(String(chapter.key))}/complete`, { method: 'POST', body: JSON.stringify({ completed: !chapter.completed }) }); setNotice(chapter.completed ? 'Chapter reopened.' : 'Chapter marked finished.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const addBook = async (payload: { title: string; author: string; isbn: string }) => {
    setWorking('book'); setNotice('')
    try { await api('/recommendations/books', { method: 'POST', body: JSON.stringify(payload) }); setNotice('Book added to Inbox.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const createCollection = async (payload: { name: string; description: string }) => {
    setWorking('collection'); setNotice('')
    try { await api('/collections', { method: 'POST', body: JSON.stringify({ ...payload, scope: 'library' }) }); setNotice('Collection created.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const deleteCollection = async (item: LibraryRecord) => {
    if (!window.confirm(`Delete collection “${item.name || 'Untitled collection'}”? Its sources will not be deleted.`)) return
    setWorking(String(item.id)); setNotice('')
    try { await api(`/collections/${encodeURIComponent(String(item.id))}`, { method: 'DELETE' }); setNotice('Collection deleted.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const handlers: LibraryViewHandlers = useMemo(() => ({
    onInspect: inspect,
    onQueue: queue,
    onExclude: exclude,
    onStart: start,
    onProcessArtifact: process,
    onDeleteArtifact: removeArtifact,
    onCompleteChapter: completeChapter,
    onAddBook: addBook,
    onCreateCollection: createCollection,
    onDeleteCollection: deleteCollection,
    busyId: working,
    blockedId,
    notice,
  }), [working, blockedId, notice])

  if (loading) return <Loading label={objectType ? `Loading ${objectType}` : `Loading ${view}`}/>
  if (error) return <ErrorState message={error} retry={reload}/>
  const loaded = data || {}

  if (activeRoute.objectId && objectType) {
    const item = objectItem(objectType, loaded, activeRoute.objectId)
    if (!item) return <ErrorState message={`The ${objectType} “${activeRoute.objectId}” is not available in this library.`} retry={reload}/>
    const objectData = objectType === 'source' ? loaded : { [objectType]: item }
    const backView = objectType === 'artifact' ? 'files' : objectType === 'book' ? 'books' : objectType === 'collection' ? 'collections' : 'all'
    return <ObjectRouteView type={objectType} data={objectData} handlers={handlers} onBack={() => go(`#/library/${backView === 'all' ? '' : backView}`)}/>
  }

  if (view === 'queue') return <QueueView data={loaded} handlers={handlers}/>
  if (view === 'inbox') return <InboxView data={loaded} handlers={handlers}/>
  if (view === 'all') return <AllSourcesView data={loaded} handlers={handlers}/>
  if (view === 'files') return <FilesView data={loaded} handlers={handlers}/>
  if (view === 'books') return <BooksView data={loaded} handlers={handlers}/>
  if (view === 'collections') return <CollectionsView data={loaded} handlers={handlers}/>
  return <ArchiveView data={loaded} handlers={handlers}/>
}
