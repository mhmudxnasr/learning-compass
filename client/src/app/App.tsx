import { Component, type ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { api, flushOfflineMutations } from '../api'
import { CaptureDialog } from '../shell/CaptureDialog'
import { SearchDialog } from '../shell/SearchDialog'
import { StudioShell } from '../shell/StudioShell'
import { HomeWorkspace, type HomeSelection } from '../workspaces/HomeWorkspace'
import { LearnWorkspace } from '../workspaces/LearnWorkspace'
import { LibraryWorkspace } from '../workspaces/LibraryWorkspace'
import { MapWorkspace, type MapObjectType, type MapWorkspaceRoute } from '../workspaces/MapWorkspace'
import { SettingsWorkspace, type SettingsWorkspaceRoute } from '../workspaces/SettingsWorkspace'
import type { LibrarySelection } from '../workspaces/library/types'
import { AndroidInstallBanner } from './android'
import { Inspector, type InspectorSelection, type MapSelection } from './inspector'
import { objectHref, routeHref, useRoute, type Route } from './router'
import { ShareIntakeReviewDialog, shareIntakeCompletionKind, type ShareIntake } from './ShareIntakeReviewDialog'

type ErrorBoundaryProps = { children: ComponentChildren }
type ErrorBoundaryState = { error: Error | null }

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <main class="app-error-boundary" role="alert">
          <div>
            <span class="folio-kicker">Learning Compass</span>
            <h1>The studio needs a fresh start.</h1>
            <p>{this.state.error.message || 'An unexpected rendering error interrupted this view.'}</p>
            <button class="button primary" type="button" onClick={() => location.reload()}>
              Reload the studio
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

function navigate(href: string) {
  if (href.startsWith('#')) location.hash = href.slice(1)
  else location.hash = href
}

function mapRouteHref(route: MapWorkspaceRoute) {
  const mode = route.view === 'atlas' ? 'atlas' : 'review'
  const focus = route.view === 'atlas' ? undefined : route.view
  if (route.objectId) return objectHref('map', route.objectType || 'branch', route.objectId, mode, focus)
  return routeHref('map', mode, focus)
}

function mapSelection(route: Route): MapSelection | null {
  if (route.root !== 'map' || !route.objectId || route.view === 'balance') return null
  const type: MapObjectType = route.objectType === 'node' ? 'node' : 'branch'
  return {
    type,
    id: route.objectId,
    title: `${type === 'node' ? 'Map node' : 'Map branch'} ${route.objectId}`,
    data: { object_type: type, object_id: route.objectId },
    route: route.canonical,
  }
}

function workspace(route: Route, onCapture: () => void, onInspect: (selection: InspectorSelection) => void) {
  if (route.root === 'home')
    return (
      <HomeWorkspace
        onCapture={onCapture}
        onInspect={(selection: HomeSelection) => onInspect(selection)}
        onNavigate={navigate}
      />
    )
  if (route.root === 'library') {
    const inspect = (selection: LibrarySelection | null) => {
      if (selection) onInspect(selection)
    }
    return <LibraryWorkspace route={route} onInspect={inspect} onNavigate={navigate} />
  }
  if (route.root === 'learn') return <LearnWorkspace route={route} />
  if (route.root === 'map') {
    const mapRoute = {
      view: route.view as MapWorkspaceRoute['view'],
      objectType: route.objectType as MapObjectType | undefined,
      objectId: route.objectId,
    }
    return <MapWorkspace route={mapRoute} onRouteChange={(next) => navigate(mapRouteHref(next))} />
  }
  return (
    <SettingsWorkspace
      route={{ view: route.view as SettingsWorkspaceRoute['view'] }}
      onRouteChange={(next: SettingsWorkspaceRoute) => navigate(routeHref('settings', next.view))}
      onCapture={onCapture}
    />
  )
}

export function App() {
  const route = useRoute()
  const capturePayload = route.query.get('capture') || ''
  const captureAction = route.query.get('action') === 'capture'
  const shareIntakeId = route.query.get('share_intake') || ''
  const shareState = route.query.get('share')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selection, setSelection] = useState<InspectorSelection | null>(null)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [refreshKey, setRefreshKey] = useState(0)
  const [shareIntake, setShareIntake] = useState<ShareIntake | null>(null)
  const [shareIntakeError, setShareIntakeError] = useState('')
  const shareCompletionKind = shareIntakeCompletionKind(shareIntake)

  const resolvedCapturePayload =
    capturePayload ||
    (shareCompletionKind === 'capture' ? shareIntake?.source_url || shareIntake?.shared_text || '' : '')
  const captureNotice =
    shareState === 'retry'
      ? 'The share could not be persisted. Your input is preserved—try again when the connection is stable.'
      : shareState === 'invalid'
        ? 'The shared item was empty or too large. Add a link, title, or note before saving.'
        : shareIntakeError
          ? `The saved share could not be loaded: ${shareIntakeError}`
          : shareIntakeId && !shareIntake
            ? 'Loading the saved share…'
            : shareCompletionKind === 'capture'
              ? 'Shared input recovered. Choose its reviewed branch to finish capture.'
              : ''

  useEffect(() => {
    let live = true
    setShareIntake(null)
    setShareIntakeError('')
    if (!shareIntakeId)
      return () => {
        live = false
      }
    api<{ intake: ShareIntake }>(`/api/share-intakes/${encodeURIComponent(shareIntakeId)}`)
      .then(({ intake }) => {
        if (!live) return
        setShareIntake(intake)
        const completionKind = shareIntakeCompletionKind(intake)
        if (intake.status !== 'consumed') {
          if (intake.kind === 'review' && completionKind === 'capture' && !captureAction) {
            navigate(`#/home?action=capture&share_intake=${encodeURIComponent(intake.id)}`)
          } else if (intake.kind === 'review' && completionKind === 'anchor' && route.root !== 'learn') {
            navigate(`#/learn?mode=practice&focus=notes&share_intake=${encodeURIComponent(intake.id)}`)
          }
          return
        }
        setCaptureOpen(false)
        if (completionKind === 'capture' && intake.recommendation_id)
          navigate(objectHref('library', 'source', intake.recommendation_id))
        else if (completionKind === 'anchor' && intake.annotation_id)
          navigate(`#/learn?mode=practice&focus=notes&annotation=${encodeURIComponent(intake.annotation_id)}`)
      })
      .catch((error: any) => {
        if (live) setShareIntakeError(error?.message || 'Saved share unavailable.')
      })
    return () => {
      live = false
    }
  }, [shareIntakeId, captureAction, route.root])

  useEffect(() => {
    if (route.root !== 'home' || capturePayload || captureAction || shareIntakeId) return
    let live = true
    api<{ intakes: ShareIntake[] }>('/api/share-intakes/pending?limit=1')
      .then(({ intakes }) => {
        if (!live || !intakes[0]) return
        const intake = intakes[0]
        const completionKind = shareIntakeCompletionKind(intake)
        navigate(
          completionKind === 'anchor'
            ? `#/learn?mode=practice&focus=notes&share_intake=${encodeURIComponent(intake.id)}`
            : completionKind === 'capture'
              ? `#/home?action=capture&share_intake=${encodeURIComponent(intake.id)}`
              : `#/home?action=review-share&share_intake=${encodeURIComponent(intake.id)}`,
        )
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [route.root, capturePayload, captureAction, shareIntakeId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        setCaptureOpen(false)
        return
      }
      if (event.key !== 'Escape') return
      if (searchOpen) setSearchOpen(false)
      else if (captureOpen) setCaptureOpen(false)
      else if (selection || (route.root === 'map' && route.objectId && route.view !== 'balance')) {
        setSelection(null)
        if (route.root === 'map' && route.objectId && route.view !== 'balance')
          navigate(routeHref('map', route.mode, route.focus))
      }
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [captureOpen, searchOpen, selection, route.root, route.objectId, route.view, route.mode, route.focus])

  useEffect(() => {
    if (capturePayload || captureAction) setCaptureOpen(true)
  }, [capturePayload, captureAction])

  useEffect(() => {
    const retryQueuedWrites = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void flushOfflineMutations()
    }
    const onOnline = () => {
      setOnline(true)
      retryQueuedWrites()
    }
    const onOffline = () => setOnline(false)
    const onVisibility = () => retryQueuedWrites()
    addEventListener('online', onOnline)
    addEventListener('offline', onOffline)
    addEventListener('focus', retryQueuedWrites)
    document.addEventListener('visibilitychange', onVisibility)
    const retryTimer = window.setInterval(retryQueuedWrites, 30000)
    retryQueuedWrites()
    return () => {
      removeEventListener('online', onOnline)
      removeEventListener('offline', onOffline)
      removeEventListener('focus', retryQueuedWrites)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(retryTimer)
    }
  }, [])

  useEffect(() => {
    setSelection(null)
  }, [route.root, route.view, route.objectId, route.mode, route.focus])

  const routedMapSelection = mapSelection(route)
  const activeSelection =
    route.root === 'map' ? routedMapSelection : route.root === 'library' && route.objectId ? null : selection
  const closeSelection = () => {
    setSelection(null)
    if (routedMapSelection) navigate(routeHref('map', route.mode, route.focus))
    else if (route.root === 'library' && route.objectId) {
      const from = route.query.get('from')
      const view = from || (route.objectType === 'artifact' ? 'files' : route.objectType === 'book' ? 'books' : 'queue')
      navigate(routeHref('library', view))
    }
  }
  const refreshWorkspace = () => setRefreshKey((value) => value + 1)
  const closeCapture = () => {
    setCaptureOpen(false)
    if (capturePayload || captureAction || shareIntakeId) navigate(routeHref('home'))
  }
  const workspaceKey = route.root === 'map' ? `map-${route.mode}:${refreshKey}` : `${route.canonical}:${refreshKey}`

  return (
    <AppErrorBoundary>
      <StudioShell
        route={route}
        inspector={activeSelection ? <Inspector selection={activeSelection} onClose={closeSelection} /> : undefined}
        onInspectorClose={activeSelection ? closeSelection : undefined}
        onCapture={() => {
          setCaptureOpen(true)
          setSearchOpen(false)
        }}
        onSearch={() => {
          setSearchOpen(true)
          setCaptureOpen(false)
        }}
        online={online}
      >
        <AndroidInstallBanner />
        <div key={workspaceKey}>{workspace(route, () => setCaptureOpen(true), setSelection)}</div>
      </StudioShell>
      <CaptureDialog
        open={captureOpen}
        initialSource={resolvedCapturePayload}
        initialTitle={shareCompletionKind === 'capture' ? shareIntake?.title || '' : ''}
        initialStatus={captureNotice}
        shareIntakeId={shareCompletionKind === 'capture' && shareIntake?.status === 'pending' ? shareIntake.id : ''}
        onClose={closeCapture}
        onCaptured={refreshWorkspace}
      />
      {shareIntake?.kind === 'review' && !shareCompletionKind && shareIntake.status === 'pending' && (
        <ShareIntakeReviewDialog
          intake={shareIntake}
          onResolved={(intake) => {
            setShareIntake(intake)
            const completionKind = shareIntakeCompletionKind(intake)
            navigate(
              completionKind === 'anchor'
                ? `#/learn?mode=practice&focus=notes&share_intake=${encodeURIComponent(intake.id)}`
                : `#/home?action=capture&share_intake=${encodeURIComponent(intake.id)}`,
            )
          }}
          onDefer={() => navigate(routeHref('home'))}
        />
      )}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </AppErrorBoundary>
  )
}

export default App
