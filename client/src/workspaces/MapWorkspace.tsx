import { lazy, Suspense } from 'preact/compat'
import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../api'
import { ErrorState, Empty, Loading } from '../components/States'
import { useRoute } from '../app/router'

const AtlasPage = lazy(() => import('../features/atlas/AtlasPage'))
const BranchDeckPage = lazy(() => import('../features/branches/BranchDeckPage').then((module) => ({ default: module.BranchDeckPage })))

export type MapView = 'atlas' | 'branches' | 'balance'
export type MapMode = 'atlas' | 'review'
export type MapFocus = 'branches' | 'balance'
export type MapObjectType = 'branch' | 'node'

export type MapWorkspaceRoute = {
  view: MapView
  mode?: MapMode
  focus?: MapFocus
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

type BalanceBranch = {
  id: string
  label: string
  type?: string
  parent_id?: string | null
  round?: string
  super_category?: string | null
  priority_rank?: number | null
  priority_share?: number | null
  consumed_count: number
  attention_share: number
  last_consumed_at?: string | null
  notes_count: number
  srs_total: number
  srs_due: number
  recall_strength?: number | null
  state: string
  reasons: string[]
}

type BalanceResponse = {
  generated_at?: string
  window_days?: number
  portfolio?: {
    total_consumed?: number
    mapped_consumed?: number
    mapped_attention_share?: number
    unmapped_attention_share?: number
    over_focused?: string[]
    at_risk?: string[]
    uncovered?: string[]
    unmapped_count?: number
  }
  branches?: BalanceBranch[]
}

const mapModes: Array<{ key: MapMode; label: string; description: string; view: MapView }> = [
  { key: 'atlas', label: 'Atlas', description: 'Explore the connected topology', view: 'atlas' },
  { key: 'review', label: 'Review', description: 'Tune branches and attention', view: 'branches' },
]

const reviewFilters: Array<{ key: MapFocus; label: string; description: string }> = [
  { key: 'branches', label: 'Branches', description: 'Keep, prune, promote, and hold' },
  { key: 'balance', label: 'Balance', description: 'Coverage, retention, and attention' },
]

function normalizeView(value: string | undefined, fallback: MapView = 'atlas'): MapView {
  if (value === 'atlas') return 'atlas'
  if (value === 'branches' || value === 'deck') return 'branches'
  if (value === 'balance' || value === 'coverage') return 'balance'
  return fallback
}

function navigateTo(route: MapWorkspaceRoute, onRouteChange?: (route: MapWorkspaceRoute) => void) {
  if (onRouteChange) {
    onRouteChange(route)
    return
  }
  const mode = route.mode || (route.view === 'atlas' ? 'atlas' : 'review')
  const focus = route.focus || (route.view === 'atlas' ? undefined : route.view)
  const objectPart = route.objectId ? `/${route.objectType || 'branch'}/${encodeURIComponent(route.objectId)}` : ''
  const query = new URLSearchParams({ mode })
  if (focus) query.set('focus', focus)
  window.location.hash = `#/map${objectPart}?${query}`
}

function MapModeSwitcher({ active, focus, onRouteChange }: { active: MapMode; focus: MapFocus; onRouteChange?: (route: MapWorkspaceRoute) => void }) {
  return <>
    <nav class="workspace-mode-switcher workspace-local-nav map-local-nav" aria-label="Map sections">
      {mapModes.map((item) => (
        <a
          key={item.key}
          href={item.key === 'atlas' ? '#/map?mode=atlas' : '#/map?mode=review&focus=branches'}
          class={active === item.key ? 'active' : ''}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={(event) => {
            if (!onRouteChange) return
            event.preventDefault()
            onRouteChange({ view: item.view, mode: item.key, focus: item.key === 'review' ? 'branches' : undefined })
          }}
        >
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </a>
      ))}
    </nav>
    {active === 'review' && <nav class="workspace-filter-switcher workspace-local-nav" aria-label="Map review filters">
      {reviewFilters.map((item) => <a key={item.key} href={`#/map?mode=review&focus=${item.key}`} class={focus === item.key ? 'active' : ''} aria-current={focus === item.key ? 'page' : undefined} onClick={(event) => {
        if (!onRouteChange) return
        event.preventDefault()
        onRouteChange({ view: item.key, mode: 'review', focus: item.key })
      }}><strong>{item.label}</strong><small>{item.description}</small></a>)}
    </nav>}
  </>
}

function BalanceBranchRow({
  branch,
  depth,
  selected,
  onSelect,
}: {
  branch: BalanceBranch
  depth: number
  selected: boolean
  onSelect: (branch: BalanceBranch) => void
}) {
  return (
    <button
      class={`balance-branch-row ${selected ? 'active' : ''}`}
      style={{ '--branch-depth': String(depth) } as any}
      onClick={() => onSelect(branch)}
      aria-pressed={selected}
    >
      <span class="balance-branch-round">{branch.round || 'Map'}</span>
      <span class="balance-branch-copy">
        <strong>{branch.label}</strong>
        <small>{branch.consumed_count} completed · {branch.last_consumed_at ? `last ${formatDate(branch.last_consumed_at)}` : 'not touched yet'}</small>
      </span>
      <span class="balance-branch-signal" aria-label={`${branch.attention_share.toFixed(1)} percent attention`}>
        <i style={{ width: `${Math.min(100, Math.max(0, branch.attention_share))}%` }} />
      </span>
      <span class={`state state-${branch.state}`}>{labelize(branch.state)}</span>
    </button>
  )
}

function BalanceInspector({
  branch,
  onClose,
  onRouteChange,
}: {
  branch: BalanceBranch
  onClose: () => void
  onRouteChange?: (route: MapWorkspaceRoute) => void
}) {
  const priority = branch.priority_share == null ? 'Not prioritized' : `${(branch.priority_share * 100).toFixed(1)}% of priority`
  const recall = branch.recall_strength == null ? 'No recall signal' : `${Math.round(branch.recall_strength * 100)}% strength`
  return (
    <aside class="map-object-inspector balance-inspector" aria-label={`${branch.label} balance details`}>
      <div class="map-inspector-head">
        <div>
          <span class="eyebrow">{branch.round || 'Map'} branch</span>
          <h2>{branch.label}</h2>
        </div>
        <button class="icon-button" onClick={onClose} aria-label="Close branch inspector">×</button>
      </div>
      <p class="map-inspector-summary">This branch is receiving <strong>{branch.attention_share.toFixed(1)}%</strong> of completed-source attention in the selected window.</p>
      <div class="map-inspector-metrics" aria-label="Branch balance metrics">
        <div><strong>{branch.consumed_count}</strong><span>completed</span></div>
        <div><strong>{branch.notes_count}</strong><span>notes</span></div>
        <div><strong>{branch.srs_due}</strong><span>cards due</span></div>
        <div><strong>{recall}</strong><span>recall</span></div>
      </div>
      <dl class="map-inspector-facts">
        <div><dt>Balance state</dt><dd><span class={`state state-${branch.state}`}>{labelize(branch.state)}</span></dd></div>
        <div><dt>Priority signal</dt><dd>{priority}{branch.priority_rank ? ` · rank ${branch.priority_rank}` : ''}</dd></div>
        <div><dt>Last completed</dt><dd>{branch.last_consumed_at ? formatDate(branch.last_consumed_at) : 'Not recorded'}</dd></div>
        <div><dt>Recall load</dt><dd>{branch.srs_total} total card{branch.srs_total === 1 ? '' : 's'}</dd></div>
      </dl>
      <section class="map-inspector-reasons">
        <div class="section-head"><h3>Why this appears here</h3><span>{branch.reasons.length} signal{branch.reasons.length === 1 ? '' : 's'}</span></div>
        {branch.reasons.length ? <ul>{branch.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>No attention warning is recorded for this branch.</p>}
      </section>
      <div class="map-inspector-actions">
        <button class="button secondary" onClick={() => navigateTo({ view: 'atlas', mode: 'atlas', objectType: 'node', objectId: branch.id }, onRouteChange)}>Open in Atlas</button>
        <button class="button secondary" onClick={onClose}>Keep browsing</button>
      </div>
    </aside>
  )
}

function BalanceView({ route, onRouteChange }: { route?: MapRouteInput; onRouteChange?: (route: MapWorkspaceRoute) => void }) {
  const [windowDays, setWindowDays] = useState<30 | 90 | 365>(90)
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(route?.objectType === 'branch' ? route.objectId || '' : '')
  const balance = useBalance(windowDays)

  useEffect(() => {
    if (route?.objectType === 'branch' && route.objectId) setSelectedId(route.objectId)
  }, [route?.objectId, route?.objectType])

  const branches = balance.data?.branches || []
  const selected = branches.find((branch) => branch.id === selectedId) || null
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return branches.filter((branch) => {
      const matchesQuery = !normalized || `${branch.label} ${branch.round || ''} ${branch.super_category || ''}`.toLowerCase().includes(normalized)
      return matchesQuery && (stateFilter === 'all' || branch.state === stateFilter)
    })
  }, [branches, query, stateFilter])
  const children = useMemo(() => {
    const grouped = new Map<string, BalanceBranch[]>()
    filtered.forEach((branch) => grouped.set(branch.parent_id || '__root__', [...(grouped.get(branch.parent_id || '__root__') || []), branch]))
    return grouped
  }, [filtered])
  const selectBranch = (branch: BalanceBranch) => {
    setSelectedId(branch.id)
    onRouteChange?.({ view: 'balance', mode: 'review', focus: 'balance', objectType: 'branch', objectId: branch.id })
  }
  const roots = (children.get('__root__') || []).sort((a, b) => b.attention_share - a.attention_share || a.label.localeCompare(b.label))
  const renderTree = (parentId: string, depth = 0): ComponentChildren => {
    const rows = (children.get(parentId) || []).sort((a, b) => b.attention_share - a.attention_share || a.label.localeCompare(b.label))
    return rows.map((branch) => (
      <div class="balance-tree-node" key={branch.id}>
        <BalanceBranchRow branch={branch} depth={depth} selected={selectedId === branch.id} onSelect={selectBranch} />
        {renderTree(branch.id, depth + 1)}
      </div>
    ))
  }

  if (balance.loading) return <Loading label="Reading learning balance" />
  if (balance.error) return <ErrorState message={balance.error} retry={balance.reload} />

  const portfolio = balance.data?.portfolio || {}
  const states = [...new Set(branches.map((branch) => branch.state).filter(Boolean))].sort()
  return (
    <div class="map-balance-view">
      <section class="workspace-intro">
        <div>
          <span class="eyebrow">Map / Balance</span>
          <h1>Where your attention is landing</h1>
          <p>Balance reads the same map that Compass uses: completed sources, consolidation, recall, priority, and the branches still waiting for evidence.</p>
        </div>
        <label class="workspace-control">Window
          <select value={windowDays} onChange={(event) => setWindowDays(Number((event.target as HTMLSelectElement).value) as 30 | 90 | 365)}>
            <option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
          </select>
        </label>
      </section>
      <div class="map-balance-summary" aria-label="Learning balance summary">
        <div><strong>{portfolio.total_consumed || 0}</strong><span>completed in {windowDays}d</span></div>
        <div><strong>{portfolio.mapped_attention_share || 0}%</strong><span>mapped attention</span></div>
        <div><strong>{portfolio.at_risk?.length || 0}</strong><span>at risk</span></div>
        <div><strong>{portfolio.unmapped_count || 0}</strong><span>unmapped sources</span></div>
      </div>
      <section class="map-balance-toolbar" aria-label="Balance filters">
        <label>Find a branch<input type="search" value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search the map" /></label>
        <label>State<select value={stateFilter} onChange={(event) => setStateFilter((event.target as HTMLSelectElement).value)}><option value="all">All states</option>{states.map((state) => <option key={state} value={state}>{labelize(state)}</option>)}</select></label>
        <span>{filtered.length} of {branches.length} branches</span>
      </section>
      {branches.length === 0 ? <Empty title="No mapped branches yet" body="Complete and map a source to reveal where learning attention and retention are accumulating." /> : filtered.length === 0 ? <Empty title="No branches match" body="Try a different branch name or state filter." action={<button class="button secondary" onClick={() => { setQuery(''); setStateFilter('all') }}>Clear filters</button>} /> : (
        <div class="map-balance-layout">
          <section class="map-balance-tree" aria-label="Learning balance branches">
            <div class="map-tree-head"><div><strong>Branch attention</strong><span>Click a row to inspect its evidence.</span></div><span>Attention</span></div>
            {roots.map((branch) => <div class="balance-tree-node" key={branch.id}><BalanceBranchRow branch={branch} depth={0} selected={selectedId === branch.id} onSelect={selectBranch} />{renderTree(branch.id, 1)}</div>)}
          </section>
          {selected ? <BalanceInspector branch={selected} onClose={() => { setSelectedId(''); onRouteChange?.({ view: 'balance', mode: 'review', focus: 'balance' }) }} onRouteChange={onRouteChange} /> : <aside class="map-selection-prompt"><span class="eyebrow">Branch inspector</span><h2>Select a branch</h2><p>Every row exposes the evidence behind its state. Select one to see attention share, recall load, and why it needs more or less of your time.</p></aside>}
        </div>
      )}
    </div>
  )
}

function useBalance(windowDays: 30 | 90 | 365) {
  const [state, setState] = useState<{ data: BalanceResponse | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    setState((current) => ({ ...current, loading: current.data == null, error: '' }))
    api<BalanceResponse>(`/learning/balance?window=${windowDays}`)
      .then((data) => live && setState({ data, loading: false, error: '' }))
      .catch((error: any) => live && setState({ data: null, loading: false, error: error?.message || 'Could not load learning balance.' }))
    return () => { live = false }
  }, [windowDays, version])
  return { ...state, reload: () => setVersion((value) => value + 1) }
}

export function MapWorkspace({ route, view, onRouteChange }: MapWorkspaceProps) {
  const routed = useRoute()
  const query = route?.query || routed.query
  const normalizedMode = route?.mode || routed.mode || query.get('mode') || ''
  const normalizedFocus = route?.focus || routed.focus || query.get('focus') || ''
  const routeValue = normalizedFocus || route?.view || route?.slug || view || routed.view
  const activeView = normalizeView(routeValue, 'atlas')
  const activeMode: MapMode = route?.objectType === 'branch' || normalizedMode === 'review' || activeView !== 'atlas' ? 'review' : 'atlas'
  const activeFocus: MapFocus = activeView === 'balance' ? 'balance' : 'branches'
  return (
    <div class="map-workspace workspace-surface">
      <MapModeSwitcher active={activeMode} focus={activeFocus} onRouteChange={onRouteChange} />
      {activeView === 'atlas' && <Suspense fallback={<Loading label="Preparing spatial atlas" />}><AtlasPage /></Suspense>}
      {activeView === 'branches' && <Suspense fallback={<Loading label="Opening branch review" />}><BranchDeckPage /></Suspense>}
      {activeView === 'balance' && <BalanceView route={route} onRouteChange={onRouteChange} />}
    </div>
  )
}

export default MapWorkspace
