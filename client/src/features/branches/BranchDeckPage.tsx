import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'preact/hooks'
import { api } from '../../api'

export interface DeckBranch {
  id: string
  label: string
  type: string
  round_label: string
  super_category: string
  parent_id?: string
  status: string
  description: string
  leaves_sample?: string[]
  contrast_hook?: string | null
  priority_rank?: number | null
  priority_share?: number | null
  is_candidate?: boolean
  consumed_count?: number
  mapped_count?: number
  unmapped_count?: number
  attention_share?: number
  last_consumed_at?: string | null
  learning_units?: number
  srs_due?: number
  srs_total?: number
  recall_strength?: number | null
  notes_count?: number
  state?: string
  reasons?: string[]
  source?: 'existing' | 'suggest'
  mode?: string
  why_now?: string
  evidence_grounding?: string
  plain_language?: string
  evidence_confidence?: 'low' | 'medium' | 'high'
  overlap_candidates?: string[]
  suggested_next_move?: string
  uncertainty_note?: string
}

type StatusFilter = 'all' | 'waiting' | 'kept' | 'priorities' | 'held' | 'pruned'
type CategoryFilter = 'all' | 'cat-tech' | 'cat-faith' | 'cat-mind'

const ACTION_LABEL: Record<string, string> = {
  keep: 'Kept',
  prune: 'Pruned',
  priority: 'Promoted to #1',
  hold: 'Held',
  add: 'Added',
}

function roundLabel(branch: DeckBranch): string {
  return branch.round_label || (branch.id?.startsWith('r1-') ? 'R1' : branch.id?.startsWith('r2-') ? 'R2' : 'Branch')
}

function categoryLabel(cat?: string): string {
  if (!cat) return 'Mind & Economics'
  if (cat.includes('tech')) return 'Tech & AI'
  if (cat.includes('faith')) return 'Faith & Tazkiyah'
  if (cat.includes('mind')) return 'Mind & Economics'
  return cat.replace(/^cat-/, '')
}

function categoryColorClass(cat?: string): string {
  if (!cat) return 'cat-mind'
  if (cat.includes('tech')) return 'cat-tech'
  if (cat.includes('faith')) return 'cat-faith'
  return 'cat-mind'
}

function statusBadge(branch: DeckBranch): { label: string; cls: string } {
  if (branch.priority_rank != null && branch.priority_rank > 0) {
    return { label: `Priority #${branch.priority_rank}`, cls: 'status-priority' }
  }
  const status = branch.status || 'active'
  if (status === 'love' || status === 'kept') return { label: 'Kept', cls: 'status-kept' }
  if (status === 'pruned') return { label: 'Pruned', cls: 'status-pruned' }
  if (status === 'held') return { label: 'Held', cls: 'status-held' }
  if (['candidate', 'active', 'fresh'].includes(status) || branch.is_candidate) {
    return { label: 'Waiting', cls: 'status-waiting' }
  }
  return { label: status, cls: 'status-neutral' }
}

function formatDate(iso?: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

function formatStatus(value?: string | null): string {
  return String(value || 'saved').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatBytes(value?: number | null): string {
  if (value == null || value <= 0) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function BranchDeckPage() {
  const [deck, setDeck] = useState<DeckBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; branchId?: string; branchLabel?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Array<{ id: string; label: string; previousStatus: string; previousPriorityRank: number | null }>>([])
  const [suggestions, setSuggestions] = useState<DeckBranch[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [custom, setCustom] = useState({ label: '', round: 'R1', cat: 'cat-tech', description: '', leaves: '', contrast: '' })
  const [ledger, setLedger] = useState<{ branch: any; recommendations: any[]; notes: any[]; recall_cards: any[]; srs_drafts: any[]; artifacts: any[] } | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const addDialogRef = useRef<HTMLDivElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)

  const flash = (message: string, branchId?: string, branchLabel?: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice({ message, branchId, branchLabel })
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 6000)
  }

  const fetchDeck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<any>('/brain/branch-deck')
      const existing: DeckBranch[] = data.existing || []
      setDeck(existing)
      if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions)
      if (!existing.length) flash('No branches on the map yet — add your first branch below.')
    } catch (err: any) {
      setError(err?.message || 'Failed to load branch deck.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeck()
  }, [fetchDeck])

  // Count aggregates
  const allBranches = useMemo(() => [...suggestions, ...deck], [suggestions, deck])
  const activeCount = useMemo(() => allBranches.filter((b) => b.status !== 'pruned').length, [allBranches])
  const pending = useMemo(() => allBranches.filter((b) => (b.is_candidate || ['candidate', 'active', 'fresh'].includes(b.status)) && b.status !== 'pruned'), [allBranches])
  const kept = useMemo(() => allBranches.filter((b) => b.status === 'love' || b.status === 'kept'), [allBranches])
  const priorities = useMemo(() => allBranches.filter((b) => b.priority_rank != null && b.priority_rank > 0 && b.status !== 'pruned'), [allBranches])
  const held = useMemo(() => allBranches.filter((b) => b.status === 'held'), [allBranches])
  const pruned = useMemo(() => allBranches.filter((b) => b.status === 'pruned'), [allBranches])

  // Filtered branches for the list
  const filteredBranches = useMemo(() => {
    return allBranches.filter((b) => {
      // Status filter
      if (statusFilter === 'all') {
        if (b.status === 'pruned') return false
      } else if (statusFilter === 'waiting') {
        const isWaiting = (b.is_candidate || ['candidate', 'active', 'fresh'].includes(b.status)) && b.status !== 'pruned'
        if (!isWaiting) return false
      } else if (statusFilter === 'kept') {
        if (b.status !== 'love' && b.status !== 'kept') return false
      } else if (statusFilter === 'priorities') {
        if (b.priority_rank == null || b.priority_rank <= 0 || b.status === 'pruned') return false
      } else if (statusFilter === 'held') {
        if (b.status !== 'held') return false
      } else if (statusFilter === 'pruned') {
        if (b.status !== 'pruned') return false
      }

      // Category filter
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'cat-tech' && !b.super_category?.includes('tech')) return false
        if (categoryFilter === 'cat-faith' && !b.super_category?.includes('faith')) return false
        if (categoryFilter === 'cat-mind' && !b.super_category?.includes('mind') && b.super_category !== '') return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const haystack = `${b.label} ${b.description || ''} ${b.leaves_sample?.join(' ') || ''} ${b.contrast_hook || ''} ${b.id}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    })
  }, [allBranches, statusFilter, categoryFilter, searchQuery])

  // Default selection
  useEffect(() => {
    if (loading) return
    if (!selectedId && filteredBranches.length > 0) {
      const firstPending = filteredBranches.find((b) => (b.is_candidate || ['candidate', 'active', 'fresh'].includes(b.status)) && b.status !== 'pruned')
      setSelectedId(firstPending ? firstPending.id : filteredBranches[0].id)
    } else if (selectedId && !filteredBranches.some((b) => b.id === selectedId)) {
      if (filteredBranches.length > 0) setSelectedId(filteredBranches[0].id)
    }
  }, [loading, filteredBranches, selectedId])

  const selected = useMemo(() => {
    return allBranches.find((b) => b.id === selectedId) || null
  }, [allBranches, selectedId])

  // Linked items ledger — every entity attached to the selected branch
  useEffect(() => {
    if (!selectedId) {
      setLedger(null)
      return
    }
    let cancelled = false
    setLedgerLoading(true)
    setLedger(null)
    api(`/brain/branches/${encodeURIComponent(selectedId)}/items`)
      .then((data: any) => {
        if (!cancelled) setLedger(data)
      })
      .catch(() => {
        if (!cancelled) setLedger(null)
      })
      .finally(() => {
        if (!cancelled) setLedgerLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // Actions
  const decide = async (branch: DeckBranch, action: 'keep' | 'prune' | 'priority' | 'hold' | 'add') => {
    if (saving) return
    const previousStatus = branch.status
    const previousPriorityRank = branch.priority_rank ?? null

    // 1. Instant optimistic state update
    if (action === 'add') {
      setSuggestions((prev) => prev.filter((s) => s.id !== branch.id))
      setDeck((prev) => [{ ...branch, source: 'existing', status: 'active', is_candidate: false }, ...prev])
    } else {
      setDeck((prev) => prev.map((b) => {
        if (b.id !== branch.id) {
          if (action === 'priority' && b.priority_rank != null && b.priority_rank > 0) {
            return { ...b, priority_rank: b.priority_rank + 1 }
          }
          return b
        }
        return {
          ...b,
          status: action === 'keep' || action === 'priority' ? 'love' : action === 'prune' ? 'pruned' : 'held',
          is_candidate: false,
          priority_rank: action === 'priority' ? 1 : null,
        }
      }))
    }

    // 2. Select next branch smoothly
    const currentIndex = filteredBranches.findIndex((b) => b.id === branch.id)
    const nextBranch = filteredBranches[currentIndex + 1] || filteredBranches[currentIndex - 1] || null
    setSelectedId(nextBranch ? nextBranch.id : null)

    setHistory((prev) => [...prev, { id: branch.id, label: branch.label, previousStatus, previousPriorityRank }])

    if (action === 'add') {
      flash(`“${branch.label}” was added to the map.`, branch.id, branch.label)
    } else {
      flash(`“${branch.label}” → ${ACTION_LABEL[action]}. Compass weights & map updated.`, branch.id, branch.label)
    }

    // 3. Sync with backend in background
    try {
      setSaving(true)
      await api('/brain/branch-swipe', {
        method: 'POST',
        body: JSON.stringify({
          id: branch.id,
          action,
          label: branch.label,
          super_category: branch.super_category,
          round_label: branch.round_label,
          rationale: branch.description,
          description: branch.description,
          leaves_sample: branch.leaves_sample,
          contrast_hook: branch.contrast_hook,
          parent_id: branch.parent_id,
        }),
      })
    } catch (err: any) {
      flash(`Failed to save decision: ${err?.message || 'server error'}`)
      await fetchDeck()
    } finally {
      setSaving(false)
    }
  }

  const undoLast = async () => {
    if (saving || history.length === 0) return
    const last = history[history.length - 1]
    setHistory((prev) => prev.slice(0, -1))
    setSelectedId(last.id)

    // Optimistically restore in memory
    setDeck((prev) => prev.map((b) => {
      if (b.id === last.id) {
        return {
          ...b,
          status: last.previousStatus,
          priority_rank: last.previousPriorityRank,
          is_candidate: ['candidate', 'active', 'fresh'].includes(last.previousStatus),
        }
      }
      return b
    }))
    flash(`“${last.label}” restored to ${last.previousStatus}.`)

    try {
      setSaving(true)
      await api('/brain/branch-swipe', {
        method: 'POST',
        body: JSON.stringify({
          id: last.id,
          action: 'undo',
          label: last.label,
          restore_status: last.previousStatus,
          restore_priority_rank: last.previousPriorityRank,
        }),
      })
    } catch (err: any) {
      flash(`Undo failed: ${err?.message || 'server error'}`)
      await fetchDeck()
    } finally {
      setSaving(false)
    }
  }

  const addCustom = async (e: Event) => {
    e.preventDefault()
    if (!custom.label.trim()) return
    const branchName = custom.label.trim()
    const cleanSlug = branchName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const id = `${custom.round.toLowerCase() === 'r1' ? 'r1' : 'r2'}-${cleanSlug}`

    try {
      await api('/brain/branch-swipe', {
        method: 'POST',
        body: JSON.stringify({
          id,
          action: 'add',
          label: branchName,
          super_category: custom.cat,
          round_label: custom.round,
          description: custom.description.trim() || `Branch for ${branchName}`,
          rationale: custom.description.trim() || `Branch for ${branchName}`,
          leaves_sample: custom.leaves.split(',').map((item) => item.trim()).filter(Boolean),
          contrast_hook: custom.contrast.trim(),
        }),
      })
      setShowAddModal(false)
      setCustom({ label: '', round: 'R1', cat: 'cat-tech', description: '', leaves: '', contrast: '' })
      setSelectedId(id)
      flash(`“${branchName}” created on the map.`)
      await fetchDeck()
    } catch (err: any) {
      flash(`Could not add branch: ${err?.message || 'server error'}`)
    }
  }

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showAddModal || saving) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const currentIndex = filteredBranches.findIndex((b) => b.id === selectedId)
        if (currentIndex < filteredBranches.length - 1) setSelectedId(filteredBranches[currentIndex + 1].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const currentIndex = filteredBranches.findIndex((b) => b.id === selectedId)
        if (currentIndex > 0) setSelectedId(filteredBranches[currentIndex - 1].id)
      } else if (selected) {
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); decide(selected, 'keep') }
        else if (e.key === 'x' || e.key === 'X') { e.preventDefault(); decide(selected, 'prune') }
        else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); decide(selected, 'priority') }
        else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); decide(selected, 'hold') }
        else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoLast() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected, showAddModal, saving, history, filteredBranches, selectedId])

  useLayoutEffect(() => {
    if (!showAddModal) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    addDialogRef.current?.querySelector<HTMLElement>('input:not([disabled])')?.focus()
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [showAddModal])

  return (
    <div class="folio-branch-review branch-desk" aria-label="Branch Review Workspace">
      {/* 1. Header Surface */}
      <header class="folio-surface-head folio-branch-head">
        <div>
          <p class="folio-object-kicker">Map / Review / Branches</p>
          <h1>Review &amp; Tune Branches</h1>
          <p class="folio-lede">
            Steer Compass recommendation weights and boundaries against real study evidence. Keep active branches, promote top priorities, hold developing topics, or prune unwanted domains.
          </p>
        </div>
        <div class="folio-branch-head-actions">
          {history.length > 0 && (
            <button class="button secondary" type="button" onClick={undoLast} disabled={saving} title="Undo last decision [Z]">
              ↩ Undo {history[history.length - 1]?.label ? `(${history[history.length - 1].label})` : ''}
            </button>
          )}
          <button class="button primary folio-primary" type="button" onClick={() => setShowAddModal(true)}>
            + New branch
          </button>
        </div>
      </header>

      {/* 2. Interactive Status Metrics Strip */}
      <nav class="folio-branch-metrics-bar" aria-label="Filter branches by status">
        <button
          type="button"
          class={`folio-branch-metric-tab ${statusFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <span class="metric-label">All Active</span>
          <span class="metric-count">{activeCount}</span>
        </button>

        <button
          type="button"
          class={`folio-branch-metric-tab tab-waiting ${statusFilter === 'waiting' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('waiting')}
        >
          <span class="metric-dot" aria-hidden="true" />
          <span class="metric-label">Waiting</span>
          <span class="metric-count">{pending.length}</span>
        </button>

        <button
          type="button"
          class={`folio-branch-metric-tab tab-kept ${statusFilter === 'kept' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('kept')}
        >
          <span class="metric-label">Kept</span>
          <span class="metric-count">{kept.length}</span>
        </button>

        <button
          type="button"
          class={`folio-branch-metric-tab tab-priority ${statusFilter === 'priorities' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('priorities')}
        >
          <span class="metric-label">Priorities</span>
          <span class="metric-count">{priorities.length}</span>
        </button>

        <button
          type="button"
          class={`folio-branch-metric-tab tab-held ${statusFilter === 'held' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('held')}
        >
          <span class="metric-label">Held</span>
          <span class="metric-count">{held.length}</span>
        </button>

        <button
          type="button"
          class={`folio-branch-metric-tab tab-pruned ${statusFilter === 'pruned' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('pruned')}
        >
          <span class="metric-label">Pruned</span>
          <span class="metric-count">{pruned.length}</span>
        </button>
      </nav>

      {/* Floating Notice / Toast */}
      {notice && (
        <output class="folio-branch-notice" aria-live="polite">
          <span>{notice.message}</span>
          {history.length > 0 && (
            <button type="button" class="notice-undo-btn" onClick={undoLast} disabled={saving}>
              Undo
            </button>
          )}
        </output>
      )}

      {/* 3. Main Workspace Split (List + Inspector) */}
      <div class="folio-branch-split">
        {/* Left Column: Navigator / Ledger */}
        <section class="folio-branch-sidebar" aria-label="Branches List">
          <div class="folio-branch-search-box">
            <div class="folio-search-wrapper">
              <input
                type="search"
                placeholder="Search branches or topics…"
                value={searchQuery}
                onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                aria-label="Search branches"
              />
              {searchQuery && (
                <button type="button" class="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>

            <div class="folio-category-pills" role="radiogroup" aria-label="Filter by category">
              <button
                type="button"
                class={`category-pill ${categoryFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                All
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
                Faith
              </button>
              <button
                type="button"
                class={`category-pill pill-mind ${categoryFilter === 'cat-mind' ? 'is-active' : ''}`}
                onClick={() => setCategoryFilter('cat-mind')}
              >
                Mind &amp; Econ
              </button>
            </div>

            <div class="folio-branch-list-meta">
              <span>{filteredBranches.length} {filteredBranches.length === 1 ? 'branch' : 'branches'}</span>
              <span class="keyboard-hint">Use ↑ / ↓ to navigate</span>
            </div>
          </div>

          <div ref={listContainerRef} class="folio-branch-list-scroll">
            {loading ? (
              <div class="folio-branch-list-empty">
                <p>Loading branch ledger…</p>
              </div>
            ) : error ? (
              <div class="folio-branch-list-empty is-error">
                <p>{error}</p>
                <button type="button" class="button secondary" onClick={fetchDeck}>Retry</button>
              </div>
            ) : filteredBranches.length === 0 ? (
              <div class="folio-branch-list-empty">
                <strong>No matching branches</strong>
                <p>Try clearing filters or search terms.</p>
                {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all') && (
                  <button
                    type="button"
                    class="button secondary"
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); setCategoryFilter('all') }}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <ol class="folio-branch-items">
                {filteredBranches.map((branch) => {
                  const badge = statusBadge(branch)
                  const isSelected = selectedId === branch.id
                  const isSuggest = branch.source === 'suggest'

                  return (
                    <li key={branch.id}>
                      <button
                        type="button"
                        class={`folio-branch-item ${isSelected ? 'is-selected' : ''} ${isSuggest ? 'is-suggest' : ''}`}
                        onClick={() => setSelectedId(branch.id)}
                        aria-pressed={isSelected}
                      >
                        <div class="branch-item-top">
                          <span class="branch-item-round">{roundLabel(branch)}</span>
                          <span class={`branch-item-category ${categoryColorClass(branch.super_category)}`}>
                            {categoryLabel(branch.super_category)}
                          </span>
                          <span class={`branch-item-status ${badge.cls}`}>{badge.label}</span>
                        </div>

                        <strong class="branch-item-title">{branch.label}</strong>

                        <div class="branch-item-footer">
                          <span>
                            {branch.mapped_count || 0} src · {branch.learning_units || 0} units
                          </span>
                          {branch.attention_share != null && branch.attention_share > 0 && (
                            <span class="branch-item-attention">
                              {Math.round(Number(branch.attention_share) * 100)}% attention
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </section>

        {/* Right Column: Hero Branch Inspector */}
        <main class="folio-branch-detail-panel" aria-label="Branch Details & Decision Desk">
          {!selected ? (
            <div class="folio-branch-empty-inspector">
              <span class="empty-icon" aria-hidden="true">◈</span>
              <h3>No branch selected</h3>
              <p>Select a branch from the list to review its study evidence, topics, and boundaries.</p>
              {allBranches.length === 0 && (
                <button type="button" class="button primary folio-primary" onClick={() => setShowAddModal(true)}>
                  Create first branch
                </button>
              )}
            </div>
          ) : (
            <article class="folio-branch-card" key={selected.id}>
              {/* Card Meta & Badges */}
              <div class="branch-card-header">
                <div class="branch-card-tags">
                  <span class="branch-tag-round">{roundLabel(selected)}</span>
                  <span class={`branch-tag-category ${categoryColorClass(selected.super_category)}`}>
                    {categoryLabel(selected.super_category)}
                  </span>
                  {selected.priority_rank != null && selected.priority_rank > 0 && (
                    <span class="branch-tag-priority">Priority Rank #{selected.priority_rank}</span>
                  )}
                  <span class={`branch-tag-status ${statusBadge(selected).cls}`}>
                    {statusBadge(selected).label}
                  </span>
                </div>
                <span class="branch-card-id">{selected.id}</span>
              </div>

              {/* Title & Scope */}
              <h2 class="branch-card-title">{selected.label}</h2>
              <p class="branch-card-description">{selected.description}</p>

              {/* Plain Meaning / Scope Note */}
              {selected.plain_language && selected.plain_language.trim() !== selected.description?.trim() && (
                <div class="branch-card-callout">
                  <span class="callout-kicker">Scope &amp; Core Mechanism</span>
                  <p>{selected.plain_language}</p>
                </div>
              )}

              {/* Evidence Matrix: 4 Tactile Tiles */}
              <section class="branch-evidence-matrix" aria-label="Study Evidence Metrics">
                <div class="evidence-tile">
                  <span class="tile-kicker">Sources &amp; Practice</span>
                  <strong class="tile-value">{selected.mapped_count ?? 0}</strong>
                  <span class="tile-caption">
                    {selected.unmapped_count ? `+${selected.unmapped_count} unmapped` : 'Mapped in Compass'}
                    {selected.last_consumed_at ? ` · Last ${formatDate(selected.last_consumed_at)}` : ''}
                  </span>
                </div>

                <div class="evidence-tile">
                  <span class="tile-kicker">Extracted Units</span>
                  <strong class="tile-value">{selected.learning_units ?? 0}</strong>
                  <span class="tile-caption">
                    {selected.notes_count ?? 0} notes · atomic recall
                  </span>
                </div>

                <div class="evidence-tile">
                  <span class="tile-kicker">Attention Share</span>
                  <strong class="tile-value">
                    {selected.attention_share != null ? `${Math.round(Number(selected.attention_share) * 100)}%` : '0%'}
                  </strong>
                  <div class="tile-progress">
                    <span
                      class="tile-progress-bar"
                      style={{ width: `${Math.min(100, Math.max(0, Number(selected.attention_share || 0) * 100))}%` }}
                    />
                  </div>
                </div>

                <div class="evidence-tile">
                  <span class="tile-kicker">Recall &amp; Retention</span>
                  <strong class="tile-value">
                    {selected.srs_due ?? 0} <small>due</small>
                  </strong>
                  <span class="tile-caption">
                    {selected.srs_total ?? 0} cards
                    {selected.recall_strength != null ? ` · score ${Number(selected.recall_strength).toFixed(2)}` : ''}
                  </span>
                </div>
              </section>

              {/* Topics / Starter Leaves */}
              {selected.leaves_sample && selected.leaves_sample.length > 0 && (
                <section class="branch-detail-section" aria-label="Topics and Leaves">
                  <span class="section-kicker">Topics &amp; Key Concept Leaves</span>
                  <div class="branch-leaves-grid">
                    {selected.leaves_sample.map((leaf) => (
                      <span class="branch-leaf-pill" key={leaf}>
                        {leaf}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Contrast Boundary Hook */}
              {selected.contrast_hook && (
                <section class="branch-detail-section contrast-section" aria-label="Contrast Boundary">
                  <span class="section-kicker">Deliberate Contrast Boundary</span>
                  <div class="branch-contrast-box">
                    <p>{selected.contrast_hook}</p>
                  </div>
                </section>
              )}

              {/* Balance Signal / Reasons */}
              {selected.reasons && selected.reasons.length > 0 && (
                <section class="branch-detail-section" aria-label="Learning Balance Signal">
                  <span class="section-kicker">Balance Diagnostic Signal</span>
                  <p class="branch-balance-signal">{selected.reasons.join(' · ')}</p>
                </section>
              )}

              {/* Overlaps if any */}
              {selected.overlap_candidates && selected.overlap_candidates.length > 0 && (
                <section class="branch-detail-section" aria-label="Possible Overlaps">
                  <span class="section-kicker">Potential Map Overlap</span>
                  <div class="branch-leaves-grid">
                    {selected.overlap_candidates.map((cand) => (
                      <span class="branch-leaf-pill is-overlap" key={cand}>{cand}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Action Decision Dock */}
              <div class="branch-action-dock">
                {selected.source === 'suggest' ? (
                  <button
                    type="button"
                    class="button primary folio-primary dock-btn-full"
                    disabled={saving}
                    onClick={() => decide(selected, 'add')}
                  >
                    + Add to Knowledge Map
                  </button>
                ) : (
                  <div class="branch-decision-buttons">
                    <button
                      type="button"
                      class="decision-btn btn-prune"
                      disabled={saving}
                      onClick={() => decide(selected, 'prune')}
                      title="Prune this branch from future recommendations [X]"
                    >
                      <span class="btn-text">Prune</span>
                      <kbd class="btn-key">X</kbd>
                    </button>

                    <button
                      type="button"
                      class="decision-btn btn-hold"
                      disabled={saving}
                      onClick={() => decide(selected, 'hold')}
                      title="Hold this branch in neutral state [H]"
                    >
                      <span class="btn-text">Hold</span>
                      <kbd class="btn-key">H</kbd>
                    </button>

                    <button
                      type="button"
                      class="decision-btn btn-priority"
                      disabled={saving}
                      onClick={() => decide(selected, 'priority')}
                      title="Promote to Rank #1 active priority [M]"
                    >
                      <span class="btn-text">Promote</span>
                      <kbd class="btn-key">M</kbd>
                    </button>

                    <button
                      type="button"
                      class="decision-btn btn-keep"
                      disabled={saving}
                      onClick={() => decide(selected, 'keep')}
                      title="Keep this branch active in Compass [K]"
                    >
                      <span class="btn-text">Keep</span>
                      <kbd class="btn-key">K</kbd>
                    </button>
                  </div>
                )}
              </div>

              {/* Linked Items Ledger */}
              <section class="branch-detail-section branch-ledger" aria-label="Linked Items Ledger">
                <span class="section-kicker">Linked Items Ledger</span>
                {ledgerLoading ? (
                  <p class="branch-ledger-empty">Loading linked items…</p>
                ) : ledger ? (
                  <div class="branch-ledger-body">
                    {ledger.recommendations.length === 0 && ledger.notes.length === 0 && ledger.recall_cards.length === 0 && ledger.srs_drafts.length === 0 && ledger.artifacts.length === 0 ? (
                      <p class="branch-ledger-empty">No sources, notes, or recall cards are mapped to this branch yet. Map consumed sources from the source dossier to grow this ledger.</p>
                    ) : (
                      <>
                        {ledger.recommendations.length > 0 && (
                          <div class="branch-ledger-group">
                            <h4>Sources &amp; Captures <span>{ledger.recommendations.length}</span></h4>
                            <ul class="branch-ledger-list">
                              {ledger.recommendations.map((item) => (
                                <li class="branch-ledger-row" key={item.id}>
                                  <a class="branch-ledger-title" href={`#/library/source/${encodeURIComponent(String(item.id))}`} title="Open unified dossier">
                                    <strong>{item.video_title || 'Untitled source'}</strong>
                                    <span class="branch-ledger-sub">
                                      {item.creator || 'Independent source'}{item.user_score != null ? ` · ${Number(item.user_score)}/10` : item.user_rating != null ? ` · ${item.user_rating}` : ''}{item.consumed_date ? ` · consumed ${formatDate(item.consumed_date)}` : ` · ${formatStatus(item.learning_state || item.status)}`}
                                      {item.recall?.count ? ` · ${item.recall.count} recall ${item.recall.count === 1 ? 'card' : 'cards'}` : ''}
                                      {item.note ? ' · note taken' : ''}
                                      {item.companions?.html || item.companions?.pdf ? ' · companions' : ''}
                                    </span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {ledger.notes.length > 0 && (
                          <div class="branch-ledger-group">
                            <h4>Field Notes <span>{ledger.notes.length}</span></h4>
                            <ul class="branch-ledger-list">
                              {ledger.notes.map((note) => (
                                <li class="branch-ledger-row" key={note.id}>
                                  <a class="branch-ledger-title" href={`#/learn/note/${encodeURIComponent(String(note.id))}`} title="Open note">
                                    <strong>{note.title || 'Untitled note'}</strong>
                                    <span class="branch-ledger-sub">{formatStatus(note.status || 'draft')}{note.source_title ? ` · from ${note.source_title}` : ''}{note.updated_at ? ` · ${formatDate(note.updated_at)}` : ''}</span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(ledger.recall_cards.length > 0 || ledger.srs_drafts.length > 0) && (
                          <div class="branch-ledger-group">
                            <h4>Active Recall <span>{ledger.recall_cards.length} approved{ledger.srs_drafts.length ? ` · ${ledger.srs_drafts.length} pending` : ''}</span></h4>
                            <ul class="branch-ledger-list">
                              {ledger.recall_cards.map((card) => (
                                <li class="branch-ledger-row" key={card.id}>
                                  <span class="branch-ledger-title">
                                    <strong>{card.question}</strong>
                                    <span class="branch-ledger-sub">{card.topic || 'General'} · due {formatDate(card.due_at)} · {card.repetitions} {card.repetitions === 1 ? 'rep' : 'reps'}{card.source_title ? ` · ${card.source_title}` : ''}</span>
                                  </span>
                                </li>
                              ))}
                              {ledger.srs_drafts.map((draft) => (
                                <li class="branch-ledger-row" key={draft.id}>
                                  <span class="branch-ledger-title is-pending">
                                    <strong>{draft.question}</strong>
                                    <span class="branch-ledger-sub">Pending draft · {draft.topic || 'General'}{draft.source_title ? ` · ${draft.source_title}` : ''}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {ledger.artifacts.length > 0 && (
                          <div class="branch-ledger-group">
                            <h4>R2 Artifacts <span>{ledger.artifacts.length}</span></h4>
                            <ul class="branch-ledger-list">
                              {ledger.artifacts.map((file) => (
                                <li class="branch-ledger-row" key={file.id}>
                                  <a class="branch-ledger-title" href={`/artifacts/${encodeURIComponent(String(file.id))}`} target="_blank" rel="noreferrer">
                                    <strong>{file.filename || 'Artifact'}</strong>
                                    <span class="branch-ledger-sub">{String(file.media_type || '').split('/').pop()?.toUpperCase() || 'File'}{file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ''} · {formatDate(file.created_at)}</span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p class="branch-ledger-empty">Ledger unavailable.</p>
                )}
              </section>
            </article>
          )}
        </main>
      </div>

      {/* 4. Add Branch Modal Dialog */}
      {showAddModal && (
        <div
          class="folio-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false) }}
        >
          <div
            ref={addDialogRef}
            class="folio-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-add-branch-title"
          >
            <header class="folio-modal-header">
              <div>
                <p class="folio-object-kicker">New Map Branch</p>
                <h3 id="modal-add-branch-title">Add Knowledge Branch</h3>
              </div>
              <button
                type="button"
                class="modal-close-btn"
                onClick={() => setShowAddModal(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </header>

            <form onSubmit={addCustom} class="folio-modal-form">
              <label class="folio-form-field">
                <span>Branch Title / Domain Name</span>
                <input
                  type="text"
                  placeholder="e.g. Local LLM Context Engineering"
                  value={custom.label}
                  onInput={(e) => setCustom({ ...custom, label: (e.target as HTMLInputElement).value })}
                  required
                />
              </label>

              <div class="folio-form-row">
                <label class="folio-form-field">
                  <span>Hierarchy Level</span>
                  <select
                    value={custom.round}
                    onChange={(e) => setCustom({ ...custom, round: (e.target as HTMLSelectElement).value })}
                  >
                    <option value="R1">R1 · Macro Domain</option>
                    <option value="R2">R2 · Micro Specialization</option>
                  </select>
                </label>

                <label class="folio-form-field">
                  <span>Knowledge Category</span>
                  <select
                    value={custom.cat}
                    onChange={(e) => setCustom({ ...custom, cat: (e.target as HTMLSelectElement).value })}
                  >
                    <option value="cat-tech">Tech &amp; AI Systems</option>
                    <option value="cat-faith">Faith &amp; Tazkiyah</option>
                    <option value="cat-mind">Mind &amp; Economics</option>
                  </select>
                </label>
              </div>

              <label class="folio-form-field">
                <span>Scope, Mechanisms &amp; Practical Outcomes</span>
                <textarea
                  placeholder="What should agents and Compass understand about this branch? What practical mechanism does it cover?"
                  value={custom.description}
                  onInput={(e) => setCustom({ ...custom, description: (e.target as HTMLTextAreaElement).value })}
                  rows={3}
                  maxLength={1000}
                />
              </label>

              <label class="folio-form-field">
                <span>Starter Concept Leaves <small>(comma-separated)</small></span>
                <input
                  type="text"
                  placeholder="e.g. tool-calling, structured output, evals"
                  value={custom.leaves}
                  onInput={(e) => setCustom({ ...custom, leaves: (e.target as HTMLInputElement).value })}
                  maxLength={800}
                />
              </label>

              <label class="folio-form-field">
                <span>Contrast Boundary <small>(what this branch is deliberately NOT about)</small></span>
                <input
                  type="text"
                  placeholder="e.g. Theoretical model pre-training math, corporate PR"
                  value={custom.contrast}
                  onInput={(e) => setCustom({ ...custom, contrast: (e.target as HTMLInputElement).value })}
                  maxLength={500}
                />
              </label>

              <footer class="folio-modal-footer">
                <button type="button" class="button secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" class="button primary folio-primary" disabled={!custom.label.trim()}>
                  Save Branch to Map
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
