import { useEffect, useState } from 'preact/hooks'
import { ApiError, api } from '../api'
import { ErrorState, Loading } from '../components/States'
import { useData } from '../app/useData'
import { itemHref, useRoute } from '../app/router'
import { routeHref as canonicalRouteHref } from '../app/router'
import { processArtifact, startLearningSession, triageCapture } from './library/actions'
import {
  ArchiveView,
  BooksView,
  FeedsView,
  FilesView,
  ObjectRouteView,
  QueueView,
  type LibraryViewHandlers,
} from './library/LibraryViews'
import {
  asView,
  listFrom,
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
    if (objectType === 'artifact') return `/artifacts/${id}/record`
  }
  switch (asView(view)) {
    case 'feeds':
      return '/capture/feeds'
    case 'files':
      return '/artifacts'
    case 'books':
      return '/recommendations/books'
    case 'archive':
      return '/recommendations/list?limit=200&source=manual&status=archived'
    default:
      return '/capture/queue'
  }
}

function errorCode(error: unknown) {
  if (error instanceof ApiError) return String(error.body?.error || '')
  return String((error as any)?.body?.error || '')
}

function actionMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The action could not be completed.'
}

function objectItem(type: LibraryObjectType, data: LibraryRecord, objectId: string) {
  if (type === 'source' || type === 'book')
    return data.item || listFrom<LibraryRecord>(data, 'books').find((item) => String(item.id) === objectId) || null
  if (type === 'artifact') return data.artifact || null
  return null
}

type LibraryPrimaryMode = 'books' | 'triage' | 'catalog' | 'assets'

const triageFilters: Array<{ key: Extract<LibraryView, 'queue' | 'feeds'>; label: string; description: string }> = [
  { key: 'queue', label: 'Queue', description: 'Committed next' },
  { key: 'feeds', label: 'Feeds', description: 'Subscriptions & articles' },
]

const primaryModes: Array<{ key: LibraryPrimaryMode; label: string; description: string; view: LibraryView }> = [
  { key: 'books', label: 'Books', description: 'Reading desk and personal library', view: 'books' },
  { key: 'triage', label: 'Triage', description: 'Decide what earns attention', view: 'queue' },
  { key: 'catalog', label: 'Archive', description: 'Completed and excluded sources', view: 'archive' },
  { key: 'assets', label: 'Files', description: 'Reading companions and uploads', view: 'files' },
]

function primaryModeFor(view: LibraryView, objectType?: LibraryObjectType): LibraryPrimaryMode {
  if (objectType === 'book' || view === 'books') return 'books'
  if (objectType === 'artifact' || view === 'files') return 'assets'
  if (view === 'archive') return 'catalog'
  return 'triage'
}

function defaultViewForMode(mode: LibraryPrimaryMode): LibraryView {
  return mode === 'books' ? 'books' : mode === 'triage' ? 'queue' : mode === 'catalog' ? 'archive' : 'files'
}

function libraryHref(mode: LibraryPrimaryMode, focus = defaultViewForMode(mode)) {
  return mode === 'books' ? canonicalRouteHref('library', mode) : canonicalRouteHref('library', mode, focus)
}

function LibraryModeSwitcher({
  activeView,
  objectType,
  onNavigate,
}: {
  activeView: LibraryView
  objectType?: LibraryObjectType
  onNavigate?: (href: string) => void
}) {
  const activePrimary = primaryModeFor(activeView, objectType)
  const navigate = (href: string) => {
    onNavigate?.(href)
    if (!onNavigate) location.hash = href.slice(1)
  }
  return (
    <>
      <nav class="workspace-mode-switcher workspace-local-nav" aria-label="Library sections">
        {primaryModes.map((item) => {
          const href = libraryHref(item.key, item.view)
          return (
            <a
              key={item.key}
              href={href}
              class={activePrimary === item.key ? 'active' : ''}
              aria-current={activePrimary === item.key ? 'page' : undefined}
              onClick={(event) => {
                if (!onNavigate) return
                event.preventDefault()
                navigate(href)
              }}
            >
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </a>
          )
        })}
      </nav>
      {activePrimary === 'triage' && (
        <nav class="workspace-filter-switcher workspace-local-nav" aria-label="Triage filters">
          {triageFilters.map((item) => {
            const href = libraryHref(activePrimary, item.key)
            return (
              <a
                key={item.key}
                href={href}
                class={activeView === item.key ? 'active' : ''}
                aria-current={activeView === item.key ? 'page' : undefined}
                onClick={(event) => {
                  if (!onNavigate) return
                  event.preventDefault()
                  navigate(href)
                }}
              >
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </a>
            )
          })}
        </nav>
      )}
    </>
  )
}

export function LibraryWorkspace({ route, embedded = false, onInspect, onSelect, onNavigate }: LibraryWorkspaceProps) {
  const localRoute = useRoute()
  const activeRoute = route || localRoute
  const normalizedMode = activeRoute.mode || activeRoute.query.get('mode') || ''
  const normalizedFocus = activeRoute.focus || activeRoute.query.get('focus') || ''
  const compatibleView =
    normalizedFocus ||
    (/^(queue|feeds|files|books|archive)$/.test(normalizedMode) ? normalizedMode : '') ||
    (/^(queue|feeds|files|books|archive)$/.test(activeRoute.view) ? activeRoute.view : '')
  const view = compatibleView
    ? asView(compatibleView)
    : normalizedMode === 'catalog'
      ? 'archive'
      : normalizedMode === 'assets'
        ? 'files'
        : normalizedMode === 'triage'
          ? 'queue'
          : 'books'
  const objectType = activeRoute.objectType as LibraryObjectType | undefined
  const [queueDelivery, setQueueDelivery] = useState<{
    effort?: string
    language?: string
    delivery_modes?: string[]
    depth_tier?: string
    matches_only?: boolean
  }>({})
  const queueQuery = new URLSearchParams()
  for (const [key, value] of Object.entries(queueDelivery)) {
    if (value === undefined || value === false || (Array.isArray(value) && !value.length)) continue
    queueQuery.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const baseEndpoint = endpointFor(view, objectType, activeRoute.objectId)
  const endpoint = view === 'queue' && !objectType && queueQuery.size ? `${baseEndpoint}?${queueQuery}` : baseEndpoint
  const { data, error, loading, reload } = useData<LibraryRecord>(endpoint)
  useEffect(() => {
    if (objectType !== 'source' || data?.item?.content_type !== 'book' || String(data.item.id) !== activeRoute.objectId)
      return
    const query = new URLSearchParams(activeRoute.query)
    query.delete('mode')
    query.delete('focus')
    const href = itemHref(data.item)
    location.replace(`${href}${query.size ? `?${query}` : ''}`)
  }, [objectType, activeRoute.objectId, activeRoute.query, data?.item])
  const [working, setWorking] = useState('')
  const [blockedId, setBlockedId] = useState('')
  const [notice, setNotice] = useState('')
  const [feedbackReceipt, setFeedbackReceipt] = useState<{ sourceId: string; result: LibraryRecord } | null>(null)

  const inspect = (selection: LibrarySelection) => {
    onInspect?.(selection)
    onSelect?.(selection)
    if (location.hash !== selection.route) location.hash = selection.route.slice(1)
  }

  const go = (href: string) => {
    onNavigate?.(href)
    if (!onNavigate) location.hash = href.slice(1)
  }

  const queue = async (item: LibraryRecord, override = false) => {
    setWorking(String(item.id))
    setNotice('')
    if (!override) setBlockedId('')
    try {
      await triageCapture(String(item.id), 'queue', override)
      setBlockedId('')
      setNotice(override ? 'Added with the explicit Queue-cap override.' : 'Added to Queue.')
      reload()
    } catch (actionError) {
      if (errorCode(actionError) === 'queue_full' || actionMessage(actionError).toLowerCase().includes('queue_full')) {
        setBlockedId(String(item.id))
        setNotice('Queue is at its five-item cap. Review the overflow choice before adding this source.')
      } else if (errorCode(actionError) === 'learning_thread_required') {
        setNotice('Start a Learning Thread before adding a source to Queue.')
      } else {
        setNotice(actionMessage(actionError))
      }
    } finally {
      setWorking('')
    }
  }

  const exclude = async (item: LibraryRecord) => {
    if (
      !window.confirm(
        `Exclude “${item.video_title || item.title || 'this source'}”? This is an administrative exclusion; it will not be recorded as bad fit.`,
      )
    )
      return
    setWorking(String(item.id))
    setNotice('')
    try {
      await triageCapture(String(item.id), 'exclude')
      setNotice('Source excluded.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const start = async (
    event: MouseEvent,
    item: LibraryRecord,
    href: string,
    kind: 'original' | 'html' | 'pdf' | 'artifact' | 'notebooklm' = 'original',
    artifactId?: string,
  ) => {
    setWorking(String(item.id))
    setNotice('')
    try {
      await startLearningSession(event, item, href, kind, artifactId)
    } catch (actionError) {
      setNotice(`Could not start the session: ${actionMessage(actionError)}`)
    } finally {
      setWorking('')
    }
  }

  const process = async (item: LibraryRecord) => {
    setWorking(String(item.id))
    setNotice('')
    try {
      const result = await processArtifact(String(item.id))
      setNotice(result.status === 'retry' ? 'Extraction retry queued.' : 'Note extraction queued.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const removeArtifact = async (item: LibraryRecord, skipConfirm = false) => {
    const files = Array.isArray(item._group) ? (item._group as LibraryRecord[]) : [item]
    if (
      !skipConfirm &&
      !window.confirm(
        `Remove ${files.length > 1 ? `these ${files.length} linked files` : `“${item.filename || 'this file'}”`} from Files?`,
      )
    )
      return
    setWorking(String(item.id))
    setNotice('Removing…')
    try {
      for (const file of files) await api(`/artifacts/${encodeURIComponent(String(file.id))}`, { method: 'DELETE' })
      setNotice('Removed from Files.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const completeChapter = async (book: LibraryRecord, chapter: LibraryRecord) => {
    const busyKey = `${book.id}:${chapter.key}`
    setWorking(busyKey)
    setNotice('')
    try {
      await api(
        `/recommendations/books/${encodeURIComponent(String(book.id))}/chapters/${encodeURIComponent(String(chapter.key))}/complete`,
        { method: 'POST', body: JSON.stringify({ completed: !chapter.completed }) },
      )
      setNotice(chapter.completed ? 'Chapter reopened.' : 'Chapter marked finished.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const setBookReadingState = async (book: LibraryRecord, state: 'saved' | 'reading' | 'finished', primary = false) => {
    const busyKey = `reading-state:${book.id}`
    setWorking(busyKey)
    setNotice('')
    try {
      await api(`/recommendations/books/${encodeURIComponent(String(book.id))}/reading-state`, {
        method: 'POST',
        body: JSON.stringify({ state, ...(primary ? { primary: true } : {}) }),
      })
      setNotice(
        primary
          ? 'Pinned as the primary current book.'
          : `Personal reading state changed to ${state}. Queue was not changed.`,
      )
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const addBook = async (payload: {
    title: string
    author: string
    branch_id: string
    isbn?: string
    why_this?: string
    url?: string
  }) => {
    setWorking('book')
    setNotice('')
    try {
      await api('/recommendations/books', { method: 'POST', body: JSON.stringify(payload) })
      setNotice('Book added to Books.')
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
      throw actionError
    } finally {
      setWorking('')
    }
  }

  const deleteRecommendationPermanently = async (item: LibraryRecord) => {
    const title = String(item.video_title || item.title || 'this source')
    if (
      !window.confirm(
        `Permanently delete “${title}”? This removes the source, feedback, notes, learning history, and linked files from the site. This cannot be undone.`,
      )
    )
      return
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

  const addFeed = async (url: string, branchId: string) => {
    setWorking('add-feed')
    setNotice('')
    try {
      await api('/capture/feeds', { method: 'POST', body: JSON.stringify({ url, branch_id: branchId, limit: 5 }) })
      setNotice('Feed subscribed and latest entries added to Library.')
      reload()
      return true
    } catch (actionError) {
      setNotice(actionMessage(actionError))
      return false
    } finally {
      setWorking('')
    }
  }

  const syncFeeds = async () => {
    setWorking('sync-feeds')
    setNotice('')
    try {
      const res = await api<{ ok: boolean; imported: number }>('/capture/feeds/sync', {
        method: 'POST',
        body: JSON.stringify({ limit: 5 }),
      })
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
      const res = await api<{ ok: boolean; imported?: number }>(`/capture/feeds/${encodeURIComponent(feedId)}/sync`, {
        method: 'POST',
        body: JSON.stringify({ limit: 5 }),
      })
      setNotice(`Feed checked. ${res.imported || 0} new ${res.imported === 1 ? 'entry' : 'entries'} added to Library.`)
      reload()
    } catch (actionError) {
      setNotice(actionMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const deleteFeed = async (feed: LibraryRecord) => {
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

  const handlers: LibraryViewHandlers = {
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
    onAddFeed: addFeed,
    onSyncFeeds: syncFeeds,
    onSyncFeed: syncFeed,
    onDeleteFeed: deleteFeed,
    onFeedbackSaved: (sourceId, result) => setFeedbackReceipt({ sourceId, result }),
    onReload: reload,
    onQueueDeliveryChange: setQueueDelivery,
    feedbackReceipt,
    busyId: working,
    blockedId,
    notice,
  }

  if (loading) return <Loading label={objectType ? `Loading ${objectType}` : `Loading ${view}`} />
  if (error) return <ErrorState message={error} retry={reload} />
  const loaded = data || {}

  const modeSwitcher =
    embedded || objectType ? null : (
      <LibraryModeSwitcher activeView={view} objectType={objectType} onNavigate={onNavigate} />
    )

  if (activeRoute.objectId && objectType) {
    const item = objectItem(objectType, loaded, activeRoute.objectId)
    if (!item)
      return (
        <ErrorState
          message={`The ${objectType} “${activeRoute.objectId}” is not available in this library.`}
          retry={reload}
        />
      )
    const objectData =
      objectType === 'source' || objectType === 'book' ? { ...loaded, [objectType]: item } : { [objectType]: item }
    const backView = objectType === 'artifact' ? 'files' : objectType === 'book' ? 'books' : 'queue'
    return (
      <div class={`library-workspace workspace-surface ${objectType === 'book' ? 'is-books-room' : ''}`}>
        {modeSwitcher}
        <ObjectRouteView
          type={objectType}
          data={objectData}
          handlers={handlers}
          onBack={() => go(viewHref(backView))}
        />
      </div>
    )
  }

  const content =
    view === 'queue' ? (
      <QueueView data={loaded} handlers={handlers} />
    ) : view === 'feeds' ? (
      <FeedsView data={loaded} handlers={handlers} />
    ) : view === 'files' ? (
      <FilesView data={loaded} handlers={handlers} />
    ) : view === 'books' ? (
      <BooksView data={loaded} handlers={handlers} />
    ) : (
      <ArchiveView data={loaded} handlers={handlers} />
    )
  return (
    <div
      class={`library-workspace workspace-surface ${view === 'books' ? 'is-books-room' : view === 'feeds' ? 'is-feeds-room' : ''}`}
    >
      {modeSwitcher}
      {content}
    </div>
  )
}
