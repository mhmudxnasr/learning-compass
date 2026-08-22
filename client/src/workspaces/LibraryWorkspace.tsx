import { useEffect, useMemo, useState } from 'preact/hooks'
import { ApiError, api } from '../api'
import { ErrorState, Loading } from '../components/States'
import { useData } from '../app/useData'
import { useRoute } from '../app/router'
import { routeHref as canonicalRouteHref } from '../app/router'
import { processArtifact, startLearningSession, triageCapture } from './library/actions'
import {
  AllSourcesView,
  ArchiveView,
  BooksView,
  CollectionsView,
  FeedsView,
  FilesView,
  ObjectRouteView,
  QueueView,
  type LibraryViewHandlers,
} from './library/LibraryViews'
import { HardcoverJournalView } from './library/HardcoverJournalView'
import {
  asView,
  artifactSelection,
  bookSelection,
  collectionSelection,
  listFrom,
  objectHref,
  sourceSelection,
  viewHref,
  type LibraryObjectType,
  type LibraryRecord,
  type LibrarySelection,
  type LibraryView,
  type LibraryWorkspaceProps,
} from './library/types'

function endpointFor(view: string, objectType?: string, objectId?: string) {
  if (objectType && objectId) {
    const id = encodeURIComponent(objectId)
    if (objectType === 'source' || objectType === 'book') return `/capture/${id}/record`
    if (objectType === 'artifact') return '/artifacts'
    if (objectType === 'collection') return '/collections'
  }
  switch (asView(view)) {
    case 'feeds': return '/capture/feeds'
    case 'all': return '/recommendations/list?limit=200'
    case 'files': return '/artifacts'
    case 'books': return '/recommendations/books'
    case 'journal': return '/hardcover'
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
  if (type === 'source' || type === 'book') return data.item || listFrom<LibraryRecord>(data, 'books').find((item) => String(item.id) === objectId) || null
  if (type === 'artifact') return listFrom<LibraryRecord>(data, 'artifacts').find((item) => String(item.id) === objectId) || null
  if (type === 'collection') return listFrom<LibraryRecord>(data, 'collections').find((item) => String(item.id) === objectId) || null
  return null
}

type LibraryPrimaryMode = 'triage' | 'catalog' | 'assets'

const triageFilters: Array<{ key: Extract<LibraryView, 'queue' | 'feeds'>; label: string; description: string }> = [
  { key: 'queue', label: 'Queue', description: 'Committed next' },
  { key: 'feeds', label: 'Feeds', description: 'Subscriptions & articles' },
]

const catalogFilters: Array<{ key: Extract<LibraryView, 'all' | 'journal' | 'collections' | 'archive'>; label: string; description: string }> = [
  { key: 'all', label: 'All', description: 'Every source' },
  { key: 'journal', label: 'Journal', description: 'KOReader via Hardcover' },
  { key: 'collections', label: 'Collections', description: 'Purposeful source groups' },
  { key: 'archive', label: 'Archive', description: 'Completed and excluded' },
]

const primaryModes: Array<{ key: LibraryPrimaryMode; label: string; description: string; view: LibraryView }> = [
  { key: 'triage', label: 'Triage', description: 'Decide what earns attention', view: 'queue' },
  { key: 'catalog', label: 'Catalog', description: 'Find and revisit sources', view: 'all' },
  { key: 'assets', label: 'Files', description: 'Reading companions and uploads', view: 'files' },
]

function primaryModeFor(view: LibraryView, objectType?: LibraryObjectType): LibraryPrimaryMode {
  if (objectType === 'artifact' || view === 'files') return 'assets'
  if (objectType === 'collection' || view === 'all' || view === 'books' || view === 'journal' || view === 'collections' || view === 'archive') return 'catalog'
  return 'triage'
}

function defaultViewForMode(mode: LibraryPrimaryMode): LibraryView {
  return mode === 'triage' ? 'queue' : mode === 'catalog' ? 'all' : 'files'
}

function libraryHref(mode: LibraryPrimaryMode, focus = defaultViewForMode(mode)) {
  return canonicalRouteHref('library', mode, focus)
}

function LibraryModeSwitcher({ activeView, objectType, onNavigate }: { activeView: LibraryView; objectType?: LibraryObjectType; onNavigate?: (href: string) => void }) {
  const activePrimary = primaryModeFor(activeView, objectType)
  const navigate = (href: string) => {
    onNavigate?.(href)
    if (!onNavigate) location.hash = href.slice(1)
  }
  return <>
    <nav class="workspace-mode-switcher workspace-local-nav" aria-label="Library sections">
      {primaryModes.map((item) => {
        const href = libraryHref(item.key, item.view)
        return <a key={item.key} href={href} class={activePrimary === item.key ? 'active' : ''} aria-current={activePrimary === item.key ? 'page' : undefined} onClick={(event) => { if (!onNavigate) return; event.preventDefault(); navigate(href) }}>
          <strong>{item.label}</strong><small>{item.description}</small>
        </a>
      })}
    </nav>
    {activePrimary !== 'assets' && <nav class="workspace-filter-switcher workspace-local-nav" aria-label={`${activePrimary === 'triage' ? 'Triage' : 'Catalog'} filters`}>
      {(activePrimary === 'triage' ? triageFilters : catalogFilters).map((item) => {
        const href = libraryHref(activePrimary, item.key)
        return <a key={item.key} href={href} class={activeView === item.key ? 'active' : ''} aria-current={activeView === item.key ? 'page' : undefined} onClick={(event) => { if (!onNavigate) return; event.preventDefault(); navigate(href) }}>
          <strong>{item.label}</strong><small>{item.description}</small>
        </a>
      })}
    </nav>}
  </>
}

export function LibraryWorkspace({ route, embedded = false, onInspect, onSelect, onNavigate }: LibraryWorkspaceProps) {
  const localRoute = useRoute()
  const activeRoute = route || localRoute
  const normalizedMode = activeRoute.mode || activeRoute.query.get('mode') || ''
  const normalizedFocus = activeRoute.focus || activeRoute.query.get('focus') || ''
  const compatibleView = normalizedFocus || (/^(queue|feeds|all|files|books|journal|collections|archive)$/.test(normalizedMode) ? normalizedMode : '') || (/^(queue|feeds|all|files|books|journal|collections|archive)$/.test(activeRoute.view) ? activeRoute.view : '')
  const view = compatibleView ? asView(compatibleView) : normalizedMode === 'catalog' ? 'all' : normalizedMode === 'assets' ? 'files' : 'queue'
  const objectType = activeRoute.objectType as LibraryObjectType | undefined
  const endpoint = endpointFor(view, objectType, activeRoute.objectId)
  const { data, error, loading, reload } = useData<LibraryRecord>(endpoint)
  const [working, setWorking] = useState('')
  const [blockedId, setBlockedId] = useState('')
  const [notice, setNotice] = useState('')
  const [feedbackReceipt, setFeedbackReceipt] = useState<{ sourceId: string; result: LibraryRecord } | null>(null)

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
      if (objectType === 'source') {
        const linkedThread = Array.isArray(data.threads) ? data.threads[0] : null
        selection.data = {
          ...selection.data,
          branch: data.item?.branch || selection.data.branch,
          round: data.item?.round || selection.data.round,
          thread_id: linkedThread?.id || selection.data.thread_id,
          thread_title: linkedThread?.title || selection.data.thread_title,
        }
      }
      onSelect?.(selection)
    }
  }, [activeRoute.objectId, objectType, data, onSelect])

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

  const removeArtifact = async (item: LibraryRecord, skipConfirm = false) => {
    const files = Array.isArray(item._group) ? item._group as LibraryRecord[] : [item]
    if (!skipConfirm && !window.confirm(`Remove ${files.length > 1 ? `these ${files.length} linked files` : `“${item.filename || 'this file'}”`} from Files?`)) return
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

  const setBookReadingState = async (book: LibraryRecord, state: 'saved' | 'reading' | 'finished') => {
    const busyKey = `reading-state:${book.id}`
    setWorking(busyKey); setNotice('')
    try {
      await api(`/recommendations/books/${encodeURIComponent(String(book.id))}/reading-state`, { method: 'POST', body: JSON.stringify({ state }) })
      setNotice(`Personal reading state changed to ${state}. Queue was not changed.`)
      reload()
    } catch (actionError) { setNotice(actionMessage(actionError)) }
    finally { setWorking('') }
  }

  const addBook = async (payload: { title: string; author: string; branch_id: string; isbn?: string; why_this?: string; url?: string }) => {
    setWorking('book'); setNotice('')
    try { await api('/recommendations/books', { method: 'POST', body: JSON.stringify(payload) }); setNotice('Book added to Books.'); reload() }
    catch (actionError) { setNotice(actionMessage(actionError)); throw actionError }
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

  const deleteRecommendationPermanently = async (item: LibraryRecord) => {
    const title = String(item.video_title || item.title || 'this source')
    if (!window.confirm(`Permanently delete “${title}”? This removes the source, feedback, notes, learning history, and linked files from the site. This cannot be undone.`)) return
    const busyKey = `permanent-delete:${item.id}`
    setWorking(busyKey)
    setNotice('Deleting forever…')
    try {
      await api(`/recommendations/${encodeURIComponent(String(item.id))}/permanent`, { method: 'DELETE' })
      setNotice('Source permanently deleted.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const addFeed = async (url: string) => {
    setWorking('add-feed')
    setNotice('')
    try {
      await api('/capture/feeds', { method: 'POST', body: JSON.stringify({ url, limit: 5 }) })
      setNotice('Feed subscribed and latest entries added to Library.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const syncFeeds = async () => {
    setWorking('sync-feeds')
    setNotice('')
    try {
      const res = await api<{ ok: boolean; imported: number }>('/capture/feeds/sync', { method: 'POST', body: JSON.stringify({ limit: 5 }) })
      setNotice(`Feeds checked. ${res.imported || 0} new ${res.imported === 1 ? 'entry' : 'entries'} added to Library.`)
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const syncFeed = async (feedId: string) => {
    const busyKey = `sync:${feedId}`
    setWorking(busyKey)
    setNotice('')
    try {
      const res = await api<{ ok: boolean; imported?: number }>(`/capture/feeds/${encodeURIComponent(feedId)}/sync`, { method: 'POST', body: JSON.stringify({ limit: 5 }) })
      setNotice(`Feed checked. ${res.imported || 0} new ${res.imported === 1 ? 'entry' : 'entries'} added to Library.`)
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const deleteFeed = async (feed: LibraryRecord) => {
    if (!window.confirm(`Unsubscribe from “${feed.title || feed.feed_url}”? Imported articles will remain in your library.`)) return
    setWorking(`delete:${feed.id}`)
    setNotice('')
    try {
      await api(`/capture/feeds/${encodeURIComponent(String(feed.id))}`, { method: 'DELETE' })
      setNotice('Feed unsubscribed.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const deleteFeedEntry = async (feedId: string, item: LibraryRecord) => {
    const busyKey = `delete-entry:${item.id}`
    setWorking(busyKey)
    setNotice('')
    try {
      await api(`/capture/feeds/${encodeURIComponent(feedId)}/entries/${encodeURIComponent(String(item.id))}`, { method: 'DELETE' })
      setNotice('Article removed from feed.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const clearFeedEntries = async (feedId: string) => {
    if (!window.confirm('Remove all imported articles for this feed?')) return
    setWorking('clear-feed-entries')
    setNotice('')
    try {
      await api(`/capture/feeds/${encodeURIComponent(feedId)}/entries`, { method: 'DELETE' })
      setNotice('All articles removed for this feed.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const handlers: LibraryViewHandlers = useMemo(() => ({
    onInspect: inspect,
    onQueue: queue,
    onExclude: exclude,
    onStart: start,
    onProcessArtifact: process,
    onDeleteArtifact: removeArtifact,
    onDeleteRecommendationPermanently: deleteRecommendationPermanently,
    onCompleteChapter: completeChapter,
    onSetBookReadingState: setBookReadingState,
    onAddBook: addBook,
    onCreateCollection: createCollection,
    onDeleteCollection: deleteCollection,
    onAddFeed: addFeed,
    onSyncFeeds: syncFeeds,
    onSyncFeed: syncFeed,
    onDeleteFeed: deleteFeed,
    onDeleteFeedEntry: deleteFeedEntry,
    onClearFeedEntries: clearFeedEntries,
    onFeedbackSaved: (sourceId, result) => setFeedbackReceipt({ sourceId, result }),
    onReload: reload,
    feedbackReceipt,
    busyId: working,
    blockedId,
    notice,
  }), [working, blockedId, notice, feedbackReceipt, reload])

  if (loading) return <Loading label={objectType ? `Loading ${objectType}` : `Loading ${view}`}/>
  if (error) return <ErrorState message={error} retry={reload}/>
  const loaded = data || {}

  const modeSwitcher = embedded ? null : <LibraryModeSwitcher activeView={view} objectType={objectType} onNavigate={onNavigate} />

  if (activeRoute.objectId && objectType) {
    const item = objectItem(objectType, loaded, activeRoute.objectId)
    if (!item) return <ErrorState message={`The ${objectType} “${activeRoute.objectId}” is not available in this library.`} retry={reload}/>
    const objectData = objectType === 'source' || objectType === 'book' ? { ...loaded, [objectType]: item } : { [objectType]: item }
    const backView = objectType === 'artifact' ? 'files' : objectType === 'book' ? 'books' : objectType === 'collection' ? 'collections' : 'all'
    return <div class="library-workspace workspace-surface">{modeSwitcher}<ObjectRouteView type={objectType} data={objectData} handlers={handlers} onBack={() => go(objectType === 'book' ? canonicalRouteHref('learn', 'canon') : viewHref(backView))}/></div>
  }

  const content = view === 'queue' ? <QueueView data={loaded} handlers={handlers}/> :
      view === 'feeds' ? <FeedsView data={loaded} handlers={handlers}/> :
        view === 'all' ? <AllSourcesView data={loaded} handlers={handlers}/> :
          view === 'files' ? <FilesView data={loaded} handlers={handlers}/> :
            view === 'books' ? <BooksView data={loaded} handlers={handlers}/> :
              view === 'journal' ? <HardcoverJournalView data={loaded} onReload={reload}/> :
              view === 'collections' ? <CollectionsView data={loaded} handlers={handlers}/> :
                <ArchiveView data={loaded} handlers={handlers}/>
  return <div class="library-workspace workspace-surface">{modeSwitcher}{content}</div>
}
