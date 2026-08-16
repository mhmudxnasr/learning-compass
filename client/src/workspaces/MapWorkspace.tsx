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

type ViewScope = 'tree' | 'macro' | 'ranked' | 'risk'
type SortMode = 'attention' | 'due' | 'recency' | 'alpha'

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
  const isCategory = branch.type === 'category'
  return (
    <button
      class={`balance-branch-row ${selected ? 'active' : ''} ${isCategory ? 'is-category' : ''}`}
      style={{ paddingLeft: `${Math.max(12, depth * 18 + 12)}px` }}
      onClick={() => onSelect(branch)}
      aria-pressed={selected}
      type="button"
    >
      <span class={`balance-branch-round ${isCategory ? 'round-cat' : ''}`}>{branch.round || (isCategory ? 'CAT' : 'MAP')}</span>
      <span class="balance-branch-copy">
        <strong>{branch.label}</strong>
        <small>{branch.consumed_count} completed · {branch.last_consumed_at ? `last ${formatDate(branch.last_consumed_at)}` : 'not touched yet'}</small>
      </span>
      <span class="balance-branch-signal" aria-label={`${branch.attention_share.toFixed(1)} percent attention`}>
        <span class="signal-bar-track">
          <i style={{ width: `${Math.min(100, Math.max(0, branch.attention_share))}%` }} />
        </span>
        <span class="signal-share-num">{branch.attention_share.toFixed(1)}%</span>
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
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [viewScope, setViewScope] = useState<ViewScope>('tree')
  const [sortBy, setSortBy] = useState<SortMode>('attention')
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState(route?.objectType === 'branch' ? route.objectId || '' : '')
  const balance = useBalance(windowDays)

  useEffect(() => {
    if (route?.objectType === 'branch' && route.objectId) setSelectedId(route.objectId)
  }, [route?.objectId, route?.objectType])

  const branches = balance.data?.branches || []
  const portfolio = balance.data?.portfolio || {}
  const selected = branches.find((branch) => branch.id === selectedId) || null

  // Macro Attention Distribution by Category
  const categoryAttention = useMemo(() => {
    let tech = 0
    let faith = 0
    let mind = 0
    branches.forEach((b) => {
      if (b.type === 'category') return
      if (b.super_category === 'cat-tech' || b.parent_id === 'cat-tech') tech += b.attention_share
      else if (b.super_category === 'cat-faith' || b.parent_id === 'cat-faith') faith += b.attention_share
      else if (b.super_category === 'cat-mind' || b.parent_id === 'cat-mind') mind += b.attention_share
    })
    return {
      tech: Math.min(100, Math.round(tech * 10) / 10),
      faith: Math.min(100, Math.round(faith * 10) / 10),
      mind: Math.min(100, Math.round(mind * 10) / 10),
      unmapped: portfolio.unmapped_attention_share || 0,
    }
  }, [branches, portfolio.unmapped_attention_share])

  // Smart Filter Counts
  const filterCounts = useMemo(() => {
    const counts = {
      all: branches.length,
      needsAttention: 0,
      overFocused: 0,
      cooling: 0,
      uncovered: 0,
      balanced: 0,
    }
    branches.forEach((b) => {
      if (b.state === 'at-risk' || b.state === 'exposed' || b.srs_due > 0) counts.needsAttention++
      if (b.state === 'over-focused') counts.overFocused++
      if (b.state === 'cooling') counts.cooling++
      if (b.state === 'uncovered') counts.uncovered++
      if (b.state === 'balanced') counts.balanced++
    })
    return counts
  }, [branches])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return branches.filter((branch) => {
      // 1. Search Query
      const matchesQuery = !normalized || `${branch.label} ${branch.round || ''} ${branch.super_category || ''}`.toLowerCase().includes(normalized)
      if (!matchesQuery) return false

      // 2. Category Filter
      if (categoryFilter !== 'all') {
        const matchesCategory = branch.id === categoryFilter || branch.super_category === categoryFilter || branch.parent_id === categoryFilter
        if (!matchesCategory) return false
      }

      // 3. State Preset Filter
      if (stateFilter === 'needs-attention') {
        return branch.state === 'at-risk' || branch.state === 'exposed' || branch.srs_due > 0
      }
      if (stateFilter !== 'all' && branch.state !== stateFilter) return false

      // 4. View Scope Filter
      if (viewScope === 'macro') {
        return branch.type === 'category' || branch.round === 'R1' || (!branch.parent_id || branch.parent_id === 'root')
      }
      if (viewScope === 'risk') {
        return branch.state === 'at-risk' || branch.state === 'exposed' || branch.srs_due > 0 || (branch.reasons && branch.reasons.length > 0)
      }

      return true
    })
  }, [branches, query, categoryFilter, stateFilter, viewScope])

  const sortedBranches = useMemo(() => {
    const list = [...filtered]
    if (sortBy === 'attention') {
      return list.sort((a, b) => b.attention_share - a.attention_share || a.label.localeCompare(b.label))
    }
    if (sortBy === 'due') {
      return list.sort((a, b) => b.srs_due - a.srs_due || b.attention_share - a.attention_share)
    }
    if (sortBy === 'recency') {
      return list.sort((a, b) => {
        if (!a.last_consumed_at && !b.last_consumed_at) return 0
        if (!a.last_consumed_at) return 1
        if (!b.last_consumed_at) return -1
        return a.last_consumed_at.localeCompare(b.last_consumed_at)
      })
    }
    if (sortBy === 'alpha') {
      return list.sort((a, b) => a.label.localeCompare(b.label))
    }
    return list
  }, [filtered, sortBy])

  const filteredIds = useMemo(() => new Set(filtered.map((branch) => branch.id)), [filtered])
  const children = useMemo(() => {
    const grouped = new Map<string, BalanceBranch[]>()
    sortedBranches.forEach((branch) => {
      const pId = branch.parent_id || '__root__'
      const list = grouped.get(pId) || []
      list.push(branch)
      grouped.set(pId, list)
    })
    return grouped
  }, [sortedBranches])

  const selectBranch = (branch: BalanceBranch) => {
    setSelectedId(branch.id)
    onRouteChange?.({ view: 'balance', mode: 'review', focus: 'balance', objectType: 'branch', objectId: branch.id })
  }

  const roots = useMemo(() => {
    return sortedBranches
      .filter((branch) => !branch.parent_id || branch.parent_id === 'root' || branch.parent_id === '__root__' || !filteredIds.has(branch.parent_id))
  }, [sortedBranches, filteredIds])

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }))
  }

  const toggleAllCategories = (collapse: boolean) => {
    const updated: Record<string, boolean> = {}
    roots.forEach((r) => { updated[r.id] = collapse })
    setCollapsedCategories(updated)
  }

  const renderTree = (parentId: string, depth = 1): ComponentChildren => {
    const rows = children.get(parentId) || []
    if (!rows.length) return null
    return rows.map((branch) => (
      <div class="balance-tree-node" key={branch.id}>
        <BalanceBranchRow branch={branch} depth={depth} selected={selectedId === branch.id} onSelect={selectBranch} />
        {renderTree(branch.id, depth + 1)}
      </div>
    ))
  }

  if (balance.loading) return <Loading label="Reading learning balance" />
  if (balance.error) return <ErrorState message={balance.error} retry={balance.reload} />

  return (
    <div class="map-balance-view">
      {/* 1. Header & Window Selector */}
      <section class="workspace-intro folio-branch-head">
        <div>
          <span class="eyebrow">Map / Balance</span>
          <h1>Where your attention is landing</h1>
          <p>Balance reads completed sources, memory retention load, priority weights, and branches waiting for evidence.</p>
        </div>
        <label class="workspace-control">
          Window
          <select
            value={windowDays}
            onChange={(event) => setWindowDays(Number((event.target as HTMLSelectElement).value) as 30 | 90 | 365)}
            aria-label="Time window"
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
      </section>

      {/* 2. Macro Attention Distribution Strip */}
      <section class="balance-macro-strip" aria-label="Attention distribution by domain">
        <div class="macro-strip-head">
          <span class="macro-strip-title">Portfolio Attention Distribution</span>
          <span class="macro-strip-meta">{portfolio.mapped_consumed || 0} mapped · {portfolio.unmapped_count || 0} unmapped</span>
        </div>
        <div class="macro-progress-bar">
          <span class="macro-segment seg-tech" style={{ width: `${categoryAttention.tech}%` }} title={`Tech & AI: ${categoryAttention.tech}%`} />
          <span class="macro-segment seg-faith" style={{ width: `${categoryAttention.faith}%` }} title={`Faith & Tazkiyah: ${categoryAttention.faith}%`} />
          <span class="macro-segment seg-mind" style={{ width: `${categoryAttention.mind}%` }} title={`Mind & Economics: ${categoryAttention.mind}%`} />
          <span class="macro-segment seg-unmapped" style={{ width: `${categoryAttention.unmapped}%` }} title={`Unmapped: ${categoryAttention.unmapped}%`} />
        </div>
        <div class="macro-legend-pills">
          <button
            type="button"
            class={`legend-pill pill-tech ${categoryFilter === 'cat-tech' ? 'is-active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === 'cat-tech' ? 'all' : 'cat-tech')}
          >
            <i class="legend-dot dot-tech" />
            <span>Tech &amp; AI</span>
            <strong>{categoryAttention.tech}%</strong>
          </button>
          <button
            type="button"
            class={`legend-pill pill-faith ${categoryFilter === 'cat-faith' ? 'is-active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === 'cat-faith' ? 'all' : 'cat-faith')}
          >
            <i class="legend-dot dot-faith" />
            <span>Faith &amp; Tazkiyah</span>
            <strong>{categoryAttention.faith}%</strong>
          </button>
          <button
            type="button"
            class={`legend-pill pill-mind ${categoryFilter === 'cat-mind' ? 'is-active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === 'cat-mind' ? 'all' : 'cat-mind')}
          >
            <i class="legend-dot dot-mind" />
            <span>Mind &amp; Econ</span>
            <strong>{categoryAttention.mind}%</strong>
          </button>
          {categoryAttention.unmapped > 0 && (
            <span class="legend-pill pill-unmapped">
              <i class="legend-dot dot-unmapped" />
              <span>Unmapped</span>
              <strong>{categoryAttention.unmapped}%</strong>
            </span>
          )}
        </div>
      </section>

      {/* 3. Interactive Quick-Filter Chips */}
      <section class="folio-branch-metrics-bar" role="tablist" aria-label="Attention State Filter">
        <button
          type="button"
          class={`folio-branch-metric-tab ${stateFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setStateFilter('all')}
        >
          <span class="metric-label">All</span>
          <span class="metric-count">{filterCounts.all}</span>
        </button>
        <button
          type="button"
          class={`folio-branch-metric-tab tab-priority ${stateFilter === 'needs-attention' ? 'is-active' : ''}`}
          onClick={() => setStateFilter(stateFilter === 'needs-attention' ? 'all' : 'needs-attention')}
        >
          <span class="metric-dot" />
          <span class="metric-label">Attention Needed</span>
          <span class="metric-count">{filterCounts.needsAttention}</span>
        </button>
        <button
          type="button"
          class={`folio-branch-metric-tab ${stateFilter === 'over-focused' ? 'is-active' : ''}`}
          onClick={() => setStateFilter(stateFilter === 'over-focused' ? 'all' : 'over-focused')}
        >
          <span class="metric-label">Over-focused</span>
          <span class="metric-count">{filterCounts.overFocused}</span>
        </button>
        <button
          type="button"
          class={`folio-branch-metric-tab ${stateFilter === 'cooling' ? 'is-active' : ''}`}
          onClick={() => setStateFilter(stateFilter === 'cooling' ? 'all' : 'cooling')}
        >
          <span class="metric-label">Cooling</span>
          <span class="metric-count">{filterCounts.cooling}</span>
        </button>
        <button
          type="button"
          class={`folio-branch-metric-tab ${stateFilter === 'uncovered' ? 'is-active' : ''}`}
          onClick={() => setStateFilter(stateFilter === 'uncovered' ? 'all' : 'uncovered')}
        >
          <span class="metric-label">Uncovered</span>
          <span class="metric-count">{filterCounts.uncovered}</span>
        </button>
        <button
          type="button"
          class={`folio-branch-metric-tab ${stateFilter === 'balanced' ? 'is-active' : ''}`}
          onClick={() => setStateFilter(stateFilter === 'balanced' ? 'all' : 'balanced')}
        >
          <span class="metric-label">Balanced</span>
          <span class="metric-count">{filterCounts.balanced}</span>
        </button>
      </section>

      {/* 4. Controls Bar: Search, Category, Scope, Sort */}
      <section class="balance-control-panel">
        <div class="control-panel-row">
          <div class="folio-search-wrapper balance-search-wrap">
            <input
              type="search"
              placeholder="Search branches or topics…"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              aria-label="Search branches in balance"
            />
            {query && (
              <button type="button" class="search-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>

          <div class="balance-scope-tabs" role="radiogroup" aria-label="View scope">
            <button
              type="button"
              class={`scope-tab ${viewScope === 'tree' ? 'is-active' : ''}`}
              onClick={() => setViewScope('tree')}
            >
              Grouped Tree
            </button>
            <button
              type="button"
              class={`scope-tab ${viewScope === 'macro' ? 'is-active' : ''}`}
              onClick={() => setViewScope('macro')}
            >
              R1 Macro
            </button>
            <button
              type="button"
              class={`scope-tab ${viewScope === 'ranked' ? 'is-active' : ''}`}
              onClick={() => setViewScope('ranked')}
            >
              Ranked
            </button>
            <button
              type="button"
              class={`scope-tab ${viewScope === 'risk' ? 'is-active' : ''}`}
              onClick={() => setViewScope('risk')}
            >
              At Risk ({filterCounts.needsAttention})
            </button>
          </div>

          <div class="balance-sort-control">
            <label>
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy((e.target as HTMLSelectElement).value as SortMode)}
              >
                <option value="attention">Attention Share ↓</option>
                <option value="due">Cards Due ↓</option>
                <option value="recency">Least Recently Studied</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </label>
          </div>
        </div>

        <div class="control-panel-subrow">
          <div class="folio-category-pills">
            <button
              type="button"
              class={`category-pill ${categoryFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              All Categories
            </button>
            <button
              type="button"
              class={`category-pill pill-tech ${categoryFilter === 'cat-tech' ? 'is-active' : ''}`}
              onClick={() => setCategoryFilter('cat-tech')}
            >
              Tech &amp; AI
            </button>
            <button
              type="button"
              class={`category-pill pill-faith ${categoryFilter === 'cat-faith' ? 'is-active' : ''}`}
              onClick={() => setCategoryFilter('cat-faith')}
            >
              Faith &amp; Tazkiyah
            </button>
            <button
              type="button"
              class={`category-pill pill-mind ${categoryFilter === 'cat-mind' ? 'is-active' : ''}`}
              onClick={() => setCategoryFilter('cat-mind')}
            >
              Mind &amp; Economics
            </button>
          </div>

          <div class="tree-expand-controls">
            <span class="branch-count-label">{filtered.length} of {branches.length} branches</span>
            {viewScope === 'tree' && (
              <>
                <button type="button" class="text-btn" onClick={() => toggleAllCategories(false)}>Expand all</button>
                <span class="sep">·</span>
                <button type="button" class="text-btn" onClick={() => toggleAllCategories(true)}>Collapse all</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 5. Main Content Split (Scannable Ledger + Inspector) */}
      {branches.length === 0 ? (
        <Empty
          title="No mapped branches yet"
          body="Complete and map a source to reveal where learning attention and retention are accumulating."
        />
      ) : filtered.length === 0 ? (
        <Empty
          title="No branches match current filters"
          body="Try clearing the search query or selecting 'All' in category/state presets."
          action={
            <button
              class="button secondary"
              onClick={() => {
                setQuery('')
                setStateFilter('all')
                setCategoryFilter('all')
                setViewScope('tree')
              }}
            >
              Reset Filters
            </button>
          }
        />
      ) : (
        <div class="map-balance-layout">
          <section class="map-balance-tree" aria-label="Learning balance branches">
            <div class="map-tree-head">
              <div>
                <strong>Branch Attention &amp; Cadence</strong>
                <span>Click a row to inspect evidence.</span>
              </div>
              <span>Attention</span>
            </div>

            {viewScope === 'tree' ? (
              // Grouped Tree Accordion View
              roots.map((root) => {
                const isCollapsed = Boolean(collapsedCategories[root.id])
                const childNodes = children.get(root.id) || []
                const isCategory = root.type === 'category'
                return (
                  <div class="balance-category-accordion" key={root.id}>
                    {isCategory ? (
                      <div class="category-accordion-header">
                        <button
                          type="button"
                          class="category-toggle-btn"
                          onClick={() => toggleCategory(root.id)}
                          aria-expanded={!isCollapsed}
                        >
                          <span class="accordion-chevron">{isCollapsed ? '▶' : '▼'}</span>
                          <strong class="accordion-title">{root.label}</strong>
                          <span class="accordion-badge">{childNodes.length} branches</span>
                          <span class="accordion-share">{root.attention_share.toFixed(1)}%</span>
                        </button>
                      </div>
                    ) : (
                      <BalanceBranchRow branch={root} depth={0} selected={selectedId === root.id} onSelect={selectBranch} />
                    )}
                    {!isCollapsed && (
                      <div class="category-accordion-content">
                        {renderTree(root.id, isCategory ? 0 : 1)}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              // Flat Ranked / Filtered List View
              sortedBranches.map((branch) => (
                <div class="balance-tree-node" key={branch.id}>
                  <BalanceBranchRow branch={branch} depth={0} selected={selectedId === branch.id} onSelect={selectBranch} />
                </div>
              ))
            )}
          </section>

          {/* Right Column: Hero Inspector */}
          {selected ? (
            <BalanceInspector
              branch={selected}
              onClose={() => {
                setSelectedId('')
                onRouteChange?.({ view: 'balance', mode: 'review', focus: 'balance' })
              }}
              onRouteChange={onRouteChange}
            />
          ) : (
            <aside class="map-selection-prompt folio-branch-empty-inspector">
              <span class="empty-icon" aria-hidden="true">◈</span>
              <h3>Select a branch to inspect</h3>
              <p>Every row exposes the evidence behind its state: completed sources, recall strength, cards due, and attention share.</p>
            </aside>
          )}
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
