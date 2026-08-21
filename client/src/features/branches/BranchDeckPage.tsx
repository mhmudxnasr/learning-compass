import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api } from '../../api'

interface DeckCategory {
  id: string
  label: string
  status: string
}

export interface DeckBranch {
  id: string
  label: string
  type: string
  round_label: string
  super_category: string
  category_label?: string
  parent_id?: string
  status: string
  description: string
  leaves_sample?: string[]
  contrast_hook?: string | null
  priority_rank?: number | null
  mapped_count?: number
  unmapped_count?: number
  attention_share?: number
  last_consumed_at?: string | null
  learning_units?: number
  srs_due?: number
  srs_total?: number
  notes_count?: number
}

interface BranchLedger {
  branch: any
  recommendations: any[]
  notes: any[]
  recall_cards: any[]
  srs_drafts: any[]
  artifacts: any[]
}

type StatusFilter = 'all' | 'active' | 'priorities' | 'paused' | 'archived'

interface BranchForm {
  label: string
  category: string
  description: string
  topics: string
  boundary: string
}

const EMPTY_FORM: BranchForm = { label: '', category: '', description: '', topics: '', boundary: '' }

function statusLabel(branch: DeckBranch): { label: string; cls: string } {
  if (branch.priority_rank != null && branch.priority_rank > 0 && branch.status !== 'pruned') {
    return { label: `Priority ${branch.priority_rank}`, cls: 'status-priority' }
  }
  if (branch.status === 'pruned') return { label: 'Archived', cls: 'status-pruned' }
  if (branch.status === 'held') return { label: 'Paused', cls: 'status-held' }
  return { label: 'Active', cls: 'status-kept' }
}

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatStatus(value?: string | null): string {
  return String(value || 'saved').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function makeBranchId(label: string): string {
  const slug = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52)
  return `branch-${slug || 'personal'}-${crypto.randomUUID().slice(0, 6)}`
}

export function BranchDeckPage() {
  const [branches, setBranches] = useState<DeckBranch[]>([])
  const [categories, setCategories] = useState<DeckCategory[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; label: string; status: string; priority: number | null; action: 'keep' | 'hold' | 'priority' | 'prune' | 'add' }>>([])
  const [ledger, setLedger] = useState<BranchLedger | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM)
  const dialogRef = useRef<HTMLDivElement>(null)
  const noticeTimer = useRef<number | null>(null)

  const flash = useCallback((message: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])

  const fetchDeck = useCallback(async (preferredId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<any>('/brain/branch-deck')
      const nextBranches = Array.isArray(data.existing) ? data.existing : []
      const nextCategories = Array.isArray(data.categories) ? data.categories : []
      setBranches(nextBranches)
      setCategories(nextCategories)
      setSelectedId((current) => {
        const target = preferredId || current
        if (target && nextBranches.some((branch: DeckBranch) => branch.id === target)) return target
        return nextBranches.find((branch: DeckBranch) => branch.status !== 'pruned')?.id || nextBranches[0]?.id || null
      })
      if (nextCategories.length) setForm((current) => current.category ? current : { ...current, category: nextCategories[0].id })
    } catch (err: any) {
      setError(err?.message || 'Could not load your knowledge branches.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDeck() }, [fetchDeck])

  const counts = useMemo(() => ({
    active: branches.filter((branch) => branch.status !== 'pruned').length,
    priorities: branches.filter((branch) => branch.status !== 'pruned' && Number(branch.priority_rank || 0) > 0).length,
    paused: branches.filter((branch) => branch.status === 'held').length,
    archived: branches.filter((branch) => branch.status === 'pruned').length,
  }), [branches])

  const filteredBranches = useMemo(() => branches.filter((branch) => {
    if (statusFilter === 'all' && branch.status === 'pruned') return false
    if (statusFilter === 'active' && ['held', 'pruned'].includes(branch.status)) return false
    if (statusFilter === 'priorities' && (branch.status === 'pruned' || Number(branch.priority_rank || 0) < 1)) return false
    if (statusFilter === 'paused' && branch.status !== 'held') return false
    if (statusFilter === 'archived' && branch.status !== 'pruned') return false
    if (categoryFilter !== 'all' && branch.super_category !== categoryFilter) return false
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      const haystack = [branch.label, branch.description, branch.category_label, branch.contrast_hook, ...(branch.leaves_sample || [])].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  }), [branches, statusFilter, categoryFilter, searchQuery])

  useEffect(() => {
    if (loading) return
    if (!selectedId || !filteredBranches.some((branch) => branch.id === selectedId)) setSelectedId(filteredBranches[0]?.id || null)
  }, [filteredBranches, loading, selectedId])

  const selected = useMemo(() => branches.find((branch) => branch.id === selectedId) || null, [branches, selectedId])

  useEffect(() => {
    if (!selectedId) { setLedger(null); return }
    let cancelled = false
    setLedger(null)
    setLedgerLoading(true)
    api(`/brain/branches/${encodeURIComponent(selectedId)}/items`)
      .then((data: any) => { if (!cancelled) setLedger(data) })
      .catch(() => { if (!cancelled) setLedger(null) })
      .finally(() => { if (!cancelled) setLedgerLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  const changeStatus = async (branch: DeckBranch, action: 'keep' | 'hold' | 'priority' | 'prune') => {
    if (saving) return
    setSaving(true)
    try {
      await api('/brain/branch-swipe', {
        method: 'POST',
        body: JSON.stringify({ id: branch.id, action, label: branch.label, super_category: branch.super_category, parent_id: branch.parent_id, rationale: branch.description }),
      })
      setHistory((current) => [...current, { id: branch.id, label: branch.label, status: branch.status, priority: branch.priority_rank ?? null, action }])
      flash(action === 'priority' ? `${branch.label} is now your first priority.` : action === 'hold' ? `${branch.label} is paused.` : action === 'prune' ? `${branch.label} was archived.` : `${branch.label} is active again.`)
      await fetchDeck(branch.id)
    } catch (err: any) {
      flash(err?.message || 'The branch could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  const undoLast = async () => {
    const last = history[history.length - 1]
    if (!last || saving) return
    setSaving(true)
    try {
      await api('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: last.id, action: 'undo', label: last.label, restore_status: last.status, restore_priority_rank: last.priority, restore_action: last.action }) })
      setHistory((current) => current.slice(0, -1))
      flash(`${last.label} was restored.`)
      await fetchDeck(last.id)
    } catch (err: any) {
      flash(err?.message || 'The last change could not be undone.')
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, category: categories[0]?.id || '' })
    setDialogMode('create')
  }

  const openEdit = (branch: DeckBranch) => {
    setForm({ label: branch.label, category: branch.super_category, description: branch.description || '', topics: (branch.leaves_sample || []).join(', '), boundary: branch.contrast_hook || '' })
    setDialogMode('edit')
  }

  const saveBranch = async (event: Event) => {
    event.preventDefault()
    if (!form.label.trim() || !form.category || saving) return
    const id = dialogMode === 'edit' && selected ? selected.id : makeBranchId(form.label)
    setSaving(true)
    try {
      await api('/brain/branch-swipe', {
        method: 'POST',
        body: JSON.stringify({ id, action: dialogMode === 'edit' ? 'update' : 'add', label: form.label.trim(), super_category: form.category, parent_id: form.category, description: form.description.trim(), leaves_sample: form.topics.split(',').map((topic) => topic.trim()).filter(Boolean), contrast_hook: form.boundary.trim() }),
      })
      const edited = dialogMode === 'edit'
      if (!edited) setHistory((current) => [...current, { id, label: form.label.trim(), status: 'candidate', priority: null, action: 'add' }])
      setDialogMode(null)
      flash(edited ? `${form.label.trim()} was updated.` : `${form.label.trim()} was added to your map.`)
      await fetchDeck(id)
    } catch (err: any) {
      flash(err?.message || 'The branch could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogMode && event.key === 'Escape') { setDialogMode(null); return }
      const target = event.target as HTMLElement | null
      if (dialogMode || target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const index = filteredBranches.findIndex((branch) => branch.id === selectedId)
      if (event.key === 'ArrowDown' && index < filteredBranches.length - 1) { event.preventDefault(); setSelectedId(filteredBranches[index + 1].id) }
      if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); setSelectedId(filteredBranches[index - 1].id) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialogMode, filteredBranches, selectedId])

  useLayoutEffect(() => {
    if (!dialogMode) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('input')?.focus()
    return () => { if (previous && document.contains(previous)) previous.focus() }
  }, [dialogMode])

  return (
    <div class="folio-branch-review branch-manager branch-desk" aria-label="Knowledge branches">
      <header class="folio-surface-head folio-branch-head">
        <div>
          <p class="folio-object-kicker">Map / Review / Branches</p>
          <h1>Your knowledge branches</h1>
          <p class="folio-lede">The stable subjects Compass uses to organize your sources and understand what deserves attention. Keep this layer broad; topics live inside each branch.</p>
        </div>
        <div class="folio-branch-head-actions">
          {history.length > 0 && <button class="button secondary" type="button" onClick={undoLast} disabled={saving}>Undo last change</button>}
          <button class="button primary folio-primary" type="button" onClick={openCreate}>New branch</button>
        </div>
      </header>

      <nav class="folio-branch-metrics-bar" aria-label="Filter branches by status">
        {([
          ['all', 'All active', counts.active],
          ['active', 'Active', counts.active - counts.paused],
          ['priorities', 'Priorities', counts.priorities],
          ['paused', 'Paused', counts.paused],
          ['archived', 'Archived', counts.archived],
        ] as Array<[StatusFilter, string, number]>).map(([value, label, count]) => (
          <button type="button" aria-pressed={statusFilter === value} class={`folio-branch-metric-tab ${value === 'priorities' ? 'tab-priority' : value === 'archived' ? 'tab-pruned' : ''} ${statusFilter === value ? 'is-active' : ''}`} onClick={() => setStatusFilter(value)} key={value}>
            <span class="metric-label">{label}</span><span class="metric-count">{count}</span>
          </button>
        ))}
      </nav>

      {notice && <output class="folio-branch-notice" aria-live="polite"><span>{notice}</span></output>}

      <div class="folio-branch-split">
        <section class="folio-branch-sidebar" aria-label="Branch index">
          <div class="folio-branch-search-box">
            <div class="folio-search-wrapper">
              <input type="search" placeholder="Search branches or topics" value={searchQuery} onInput={(event) => setSearchQuery((event.target as HTMLInputElement).value)} aria-label="Search branches" />
              {searchQuery && <button type="button" class="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>}
            </div>
            <div class="folio-category-pills" aria-label="Filter by area">
              <button type="button" aria-pressed={categoryFilter === 'all'} class={`category-pill ${categoryFilter === 'all' ? 'is-active' : ''}`} onClick={() => setCategoryFilter('all')}>All areas</button>
              {categories.map((category) => <button type="button" aria-pressed={categoryFilter === category.id} class={`category-pill ${categoryFilter === category.id ? 'is-active' : ''}`} onClick={() => setCategoryFilter(category.id)} key={category.id}>{category.label}</button>)}
            </div>
            <div class="folio-branch-list-meta"><span>{filteredBranches.length} {filteredBranches.length === 1 ? 'branch' : 'branches'}</span><span>↑ ↓ to move</span></div>
          </div>

          <div class="folio-branch-list-scroll">
            {loading ? <div class="folio-branch-list-empty"><p>Loading your map…</p></div> : error ? <div class="folio-branch-list-empty is-error"><p>{error}</p><button class="button secondary" type="button" onClick={() => fetchDeck()}>Retry</button></div> : filteredBranches.length === 0 ? (
              <div class="folio-branch-list-empty"><strong>{branches.length ? 'No branches match these filters' : 'Your branch map is empty'}</strong><p>{branches.length ? 'Clear a filter or search term.' : 'Create a broad subject that you want Compass to organize around.'}</p>{branches.length ? <button class="button secondary" type="button" onClick={() => { setSearchQuery(''); setStatusFilter('all'); setCategoryFilter('all') }}>Clear filters</button> : <button class="button primary" type="button" onClick={openCreate}>Create first branch</button>}</div>
            ) : (
              <ol class="folio-branch-items">
                {filteredBranches.map((branch) => {
                  const badge = statusLabel(branch)
                  return <li key={branch.id}><button type="button" class={`folio-branch-item ${selectedId === branch.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(branch.id)} aria-pressed={selectedId === branch.id}>
                    <div class="branch-item-top"><span class="branch-item-round">{branch.round_label || 'R1'}</span><span class="branch-item-category">{branch.category_label || branch.super_category}</span><span class={`branch-item-status ${badge.cls}`}>{badge.label}</span></div>
                    <strong class="branch-item-title">{branch.label}</strong>
                    <div class="branch-item-footer"><span>{branch.mapped_count || 0} sources · {branch.notes_count || 0} notes</span>{branch.last_consumed_at && <span>{formatDate(branch.last_consumed_at)}</span>}</div>
                  </button></li>
                })}
              </ol>
            )}
          </div>
        </section>

        <main class="folio-branch-detail-panel">
          {!selected ? <div class="folio-branch-empty-inspector"><h3>Select a branch</h3><p>Choose a branch to see its scope, topics, and everything filed under it.</p></div> : (
            <article class="folio-branch-card">
              <div class="branch-card-header">
                <div class="branch-card-tags"><span class="branch-tag-round">{selected.round_label || 'R1'}</span><span class="branch-tag-category">{selected.category_label || selected.super_category}</span><span class={`branch-tag-status ${statusLabel(selected).cls}`}>{statusLabel(selected).label}</span></div>
                <button class="button secondary branch-edit-button" type="button" onClick={() => openEdit(selected)}>Edit branch</button>
              </div>
              <div class="branch-title-block"><h2 class="branch-card-title">{selected.label}</h2><p class="branch-card-description">{selected.description || 'Add a clear purpose so Compass knows what belongs here.'}</p></div>

              <section class="branch-evidence-matrix" aria-label="Branch activity">
                <div class="evidence-tile"><span class="tile-kicker">Sources</span><strong class="tile-value">{selected.mapped_count || 0}</strong><span class="tile-caption">Filed in this branch</span></div>
                <div class="evidence-tile"><span class="tile-kicker">Notes</span><strong class="tile-value">{selected.notes_count || 0}</strong><span class="tile-caption">Your written thinking</span></div>
                <div class="evidence-tile"><span class="tile-kicker">Knowledge units</span><strong class="tile-value">{selected.learning_units || 0}</strong><span class="tile-caption">Extracted concepts</span></div>
                <div class="evidence-tile"><span class="tile-kicker">Recall</span><strong class="tile-value">{selected.srs_total || 0}</strong><span class="tile-caption">{selected.srs_due || 0} due now</span></div>
              </section>

              <section class="branch-detail-section"><span class="section-kicker">Topics inside this branch</span>{selected.leaves_sample?.length ? <div class="branch-leaves-grid">{selected.leaves_sample.map((topic) => <span class="branch-leaf-pill" key={topic}>{topic}</span>)}</div> : <p class="branch-ledger-empty">No starter topics yet. Edit the branch to add them.</p>}</section>
              {selected.contrast_hook && <section class="branch-detail-section"><span class="section-kicker">Boundary</span><div class="branch-contrast-box"><p>{selected.contrast_hook}</p></div></section>}

              <div class="branch-action-dock">
                <span class="section-kicker">Branch status</span>
                <div class="branch-status-controls">
                  {selected.status === 'pruned' ? <button class="button primary" type="button" disabled={saving} onClick={() => changeStatus(selected, 'keep')}>Restore branch</button> : <>
                    {Number(selected.priority_rank || 0) !== 1 && <button class="button primary" type="button" disabled={saving} onClick={() => changeStatus(selected, 'priority')}>Make first priority</button>}
                    {selected.status === 'held' ? <button class="button secondary" type="button" disabled={saving} onClick={() => changeStatus(selected, 'keep')}>Resume branch</button> : <button class="button secondary" type="button" disabled={saving} onClick={() => changeStatus(selected, 'hold')}>Pause branch</button>}
                    <button class="button secondary branch-archive-button" type="button" disabled={saving} onClick={() => changeStatus(selected, 'prune')}>Archive branch</button>
                  </>}
                </div>
                <p class="branch-status-note">Pausing removes a branch from active attention. Archiving also blocks future recommendations until you restore it.</p>
              </div>

              <section class="branch-detail-section branch-ledger" aria-label="Items in this branch">
                <span class="section-kicker">Everything filed here</span>
                {ledgerLoading ? <p class="branch-ledger-empty">Loading branch contents…</p> : !ledger ? <p class="branch-ledger-empty">Branch contents are unavailable.</p> : ledger.recommendations.length + ledger.notes.length + ledger.recall_cards.length + ledger.srs_drafts.length + ledger.artifacts.length === 0 ? <p class="branch-ledger-empty">Nothing is filed here yet. New sources can use this branch immediately.</p> : <div class="branch-ledger-body">
                  {ledger.recommendations.length > 0 && <div class="branch-ledger-group"><h4>Sources <span>{ledger.recommendations.length}</span></h4><ul class="branch-ledger-list">{ledger.recommendations.map((item) => <li class="branch-ledger-row" key={item.id}><a class="branch-ledger-title" href={`#/library/source/${encodeURIComponent(String(item.id))}`}><strong>{item.video_title || 'Untitled source'}</strong><span class="branch-ledger-sub">{item.creator || 'Independent source'} · {formatStatus(item.learning_state || item.status)}{item.consumed_date ? ` · ${formatDate(item.consumed_date)}` : ''}</span></a></li>)}</ul></div>}
                  {ledger.notes.length > 0 && <div class="branch-ledger-group"><h4>Notes <span>{ledger.notes.length}</span></h4><ul class="branch-ledger-list">{ledger.notes.map((note) => <li class="branch-ledger-row" key={note.id}><a class="branch-ledger-title" href={`#/learn/note/${encodeURIComponent(String(note.id))}`}><strong>{note.title || 'Untitled note'}</strong><span class="branch-ledger-sub">{formatStatus(note.status)}{note.updated_at ? ` · ${formatDate(note.updated_at)}` : ''}</span></a></li>)}</ul></div>}
                  {(ledger.recall_cards.length > 0 || ledger.srs_drafts.length > 0) && <div class="branch-ledger-group"><h4>Recall <span>{ledger.recall_cards.length} active · {ledger.srs_drafts.length} drafts</span></h4></div>}
                  {ledger.artifacts.length > 0 && <div class="branch-ledger-group"><h4>Reading companions and files <span>{ledger.artifacts.length}</span></h4></div>}
                </div>}
              </section>
            </article>
          )}
        </main>
      </div>

      {dialogMode && <div class="folio-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setDialogMode(null) }}>
        <div ref={dialogRef} class="folio-modal-card branch-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="branch-editor-title">
          <header class="folio-modal-header"><div><p class="folio-object-kicker">{dialogMode === 'edit' ? 'Branch details' : 'Personal map'}</p><h3 id="branch-editor-title">{dialogMode === 'edit' ? 'Edit branch' : 'Create a knowledge branch'}</h3></div><button type="button" class="modal-close-btn" onClick={() => setDialogMode(null)} aria-label="Close dialog">×</button></header>
          <form class="folio-modal-form" onSubmit={saveBranch}>
            <label class="folio-form-field"><span>Branch name</span><input type="text" value={form.label} placeholder="e.g. Systems Thinking" maxLength={120} required onInput={(event) => setForm({ ...form, label: (event.target as HTMLInputElement).value })} /><small>Use a broad subject you expect to revisit. Put narrower ideas in Topics.</small></label>
            <label class="folio-form-field"><span>Area</span><select value={form.category} required onChange={(event) => setForm({ ...form, category: (event.target as HTMLSelectElement).value })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</select></label>
            <label class="folio-form-field"><span>Purpose and scope</span><textarea value={form.description} rows={4} maxLength={1000} placeholder="What belongs here, and what should studying it help you understand or do?" onInput={(event) => setForm({ ...form, description: (event.target as HTMLTextAreaElement).value })} /></label>
            <label class="folio-form-field"><span>Starter topics <small>comma-separated</small></span><input type="text" value={form.topics} maxLength={800} placeholder="feedback loops, system boundaries, leverage points" onInput={(event) => setForm({ ...form, topics: (event.target as HTMLInputElement).value })} /></label>
            <label class="folio-form-field"><span>Boundary</span><input type="text" value={form.boundary} maxLength={500} placeholder="What looks related but does not belong in this branch?" onInput={(event) => setForm({ ...form, boundary: (event.target as HTMLInputElement).value })} /></label>
            <footer class="folio-modal-footer"><button class="button secondary" type="button" onClick={() => setDialogMode(null)}>Cancel</button><button class="button primary folio-primary" type="submit" disabled={saving || !form.label.trim() || !form.category}>{saving ? 'Saving…' : dialogMode === 'edit' ? 'Save changes' : 'Create branch'}</button></footer>
          </form>
        </div>
      </div>}
    </div>
  )
}
