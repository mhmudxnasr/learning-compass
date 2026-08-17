import { Component, type ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { flushOfflineMutations } from '../api'
import { CaptureDialog } from '../shell/CaptureDialog'
import { SearchDialog } from '../shell/SearchDialog'
import { StudioShell } from '../shell/StudioShell'
import { HomeWorkspace, type HomeSelection } from '../workspaces/HomeWorkspace'
import { LearnWorkspace } from '../workspaces/LearnWorkspace'
import { LibraryWorkspace } from '../workspaces/LibraryWorkspace'
import { MapWorkspace, type MapObjectType, type MapWorkspaceRoute } from '../workspaces/MapWorkspace'
import { SettingsWorkspace, type SettingsWorkspaceRoute } from '../workspaces/SettingsWorkspace'
import type { LibrarySelection } from '../workspaces/library/types'
import { Inspector, type InspectorSelection, type MapSelection } from './inspector'
import { objectHref, routeHref, useRoute, type Route } from './router'

type ErrorBoundaryProps = { children: ComponentChildren }
type ErrorBoundaryState = { error: Error | null }

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <main class="app-error-boundary" role="alert">
        <div>
          <span class="folio-kicker">Learning Compass</span>
          <h1>The studio needs a fresh start.</h1>
          <p>{this.state.error.message || 'An unexpected rendering error interrupted this view.'}</p>
          <button class="button primary" type="button" onClick={() => location.reload()}>Reload the studio</button>
        </div>
      </main>
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
  if (route.root === 'home') return <HomeWorkspace onCapture={onCapture} onInspect={(selection: HomeSelection) => onInspect(selection)} onNavigate={navigate}/>
  if (route.root === 'library') {
    const inspect = (selection: LibrarySelection | null) => { if (selection) onInspect(selection) }
    return <LibraryWorkspace route={route} onInspect={inspect} onSelect={inspect} onNavigate={navigate}/>
  }
  if (route.root === 'learn') return <LearnWorkspace route={route}/>
  if (route.root === 'map') {
    const mapRoute = { view: route.view as MapWorkspaceRoute['view'], objectType: route.objectType as MapObjectType | undefined, objectId: route.objectId }
    return <MapWorkspace route={mapRoute} onRouteChange={(next) => navigate(mapRouteHref(next))}/>
  }
  return <SettingsWorkspace route={{ view: route.view as SettingsWorkspaceRoute['view'] }} onRouteChange={(next: SettingsWorkspaceRoute) => navigate(routeHref('settings', next.view))}/>
}

export function App() {
  const route = useRoute()
  const capturePayload = route.query.get('capture') || ''
  const [captureOpen, setCaptureOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selection, setSelection] = useState<InspectorSelection | null>(null)
  const [, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [refreshKey, setRefreshKey] = useState(0)

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
        if (route.root === 'map' && route.objectId && route.view !== 'balance') navigate(routeHref('map', route.mode, route.focus))
      }
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [captureOpen, searchOpen, selection, route.root, route.objectId, route.view, route.mode, route.focus])

  useEffect(() => {
    if (capturePayload) setCaptureOpen(true)
  }, [capturePayload])

  useEffect(() => {
    const onOnline = () => { setOnline(true); void flushOfflineMutations() }
    const onOffline = () => setOnline(false)
    addEventListener('online', onOnline)
    addEventListener('offline', onOffline)
    void flushOfflineMutations()
    return () => { removeEventListener('online', onOnline); removeEventListener('offline', onOffline) }
  }, [])

  useEffect(() => {
    if (route.root !== 'library' || !route.objectId) setSelection(null)
  }, [route.root, route.view, route.objectId, route.mode, route.focus])

  const routedMapSelection = mapSelection(route)
  const activeSelection = selection || routedMapSelection
  const closeSelection = () => {
    setSelection(null)
    if (routedMapSelection) navigate(routeHref('map', route.mode, route.focus))
    else if (route.root === 'library' && route.objectId) {
      const from = route.query.get('from')
      const view = from || (route.objectType === 'artifact' ? 'files' : route.objectType === 'book' ? 'books' : route.objectType === 'collection' ? 'collections' : 'all')
      navigate(routeHref('library', view))
    }
  }
  const refreshWorkspace = () => setRefreshKey((value) => value + 1)
  const closeCapture = () => {
    setCaptureOpen(false)
    if (capturePayload) navigate(routeHref('library', 'triage', 'inbox'))
  }

  return <AppErrorBoundary>
    <StudioShell
      route={route}
      inspector={activeSelection ? <Inspector selection={activeSelection} onClose={closeSelection}/> : undefined}
      onInspectorClose={activeSelection ? closeSelection : undefined}
    >
      <div key={`${route.canonical}:${refreshKey}`}>
        {workspace(route, () => setCaptureOpen(true), setSelection)}
      </div>
    </StudioShell>
    <CaptureDialog open={captureOpen} initialSource={capturePayload} onClose={closeCapture} onCaptured={refreshWorkspace}/>
    <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)}/>
  </AppErrorBoundary>
}

export default App
