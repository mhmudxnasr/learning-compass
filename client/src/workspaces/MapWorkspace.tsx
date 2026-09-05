import { lazy, Suspense } from 'preact/compat'
import { Loading } from '../components/States'
import { useRoute } from '../app/router'

const AtlasPage = lazy(() => import('../features/atlas/AtlasPage'))
const BranchDeckPage = lazy(() =>
  import('../features/branches/BranchDeckPage').then((module) => ({ default: module.BranchDeckPage })),
)

export type MapView = 'atlas' | 'branches'
export type MapMode = 'atlas' | 'review'
export type MapObjectType = 'branch' | 'node'

export type MapWorkspaceRoute = {
  view: MapView
  mode?: MapMode
  objectType?: MapObjectType
  objectId?: string
}

export type MapRouteInput = {
  view?: string
  mode?: string
  focus?: string
  query?: URLSearchParams
  slug?: string
  objectType?: MapObjectType
  objectId?: string
}

export type MapWorkspaceProps = {
  route?: MapRouteInput
  view?: MapView
  onRouteChange?: (route: MapWorkspaceRoute) => void
}

const mapModes: Array<{ key: MapMode; label: string; description: string; view: MapView }> = [
  { key: 'atlas', label: 'Atlas', description: 'Explore the connected topology', view: 'atlas' },
  {
    key: 'review',
    label: 'Review',
    description: 'Decide branch status, priority, scope, and attention',
    view: 'branches',
  },
]

function MapModeSwitcher({
  active,
  onRouteChange,
}: {
  active: MapMode
  onRouteChange?: (route: MapWorkspaceRoute) => void
}) {
  return (
    <nav class="workspace-mode-switcher workspace-local-nav map-local-nav" aria-label="Map sections">
      {mapModes.map((item) => (
        <a
          key={item.key}
          href={item.key === 'atlas' ? '#/map?mode=atlas' : '#/map?mode=review'}
          class={active === item.key ? 'active' : ''}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={(event) => {
            if (!onRouteChange) return
            event.preventDefault()
            onRouteChange({ view: item.view, mode: item.key })
          }}
        >
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </a>
      ))}
    </nav>
  )
}

export function MapWorkspace({ route, view, onRouteChange }: MapWorkspaceProps) {
  const routed = useRoute()
  const query = route?.query || routed.query
  const requestedMode = route?.mode || routed.mode || query.get('mode') || ''
  const requestedView = route?.view || route?.slug || view || routed.view
  const activeMode: MapMode =
    route?.objectType === 'branch' ||
    requestedMode === 'review' ||
    ['branches', 'balance', 'coverage', 'deck'].includes(String(requestedView))
      ? 'review'
      : 'atlas'

  return (
    <div class="map-workspace workspace-surface">
      <MapModeSwitcher active={activeMode} onRouteChange={onRouteChange} />
      {activeMode === 'atlas' ? (
        <Suspense fallback={<Loading label="Preparing spatial atlas" />}>
          <AtlasPage
            initialSelectedId={route?.objectType === 'node' ? route.objectId : undefined}
            onSelect={(nodeId) =>
              onRouteChange?.({
                view: 'atlas',
                mode: 'atlas',
                objectType: nodeId ? 'node' : undefined,
                objectId: nodeId || undefined,
              })
            }
          />
        </Suspense>
      ) : (
        <Suspense fallback={<Loading label="Opening branch review" />}>
          <BranchDeckPage
            initialSelectedId={route?.objectType === 'branch' ? route.objectId : undefined}
            onSelect={(branchId) =>
              onRouteChange?.({
                view: 'branches',
                mode: 'review',
                objectType: branchId ? 'branch' : undefined,
                objectId: branchId || undefined,
              })
            }
          />
        </Suspense>
      )}
    </div>
  )
}
