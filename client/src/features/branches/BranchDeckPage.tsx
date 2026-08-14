import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'preact/hooks'
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

const ACTION_LABEL: Record<string, string> = {
  keep: 'Keep',
  prune: 'Prune',
  priority: 'Promote',
  hold: 'Hold',
  add: 'Add',
}

const roundLabel = (branch: DeckBranch) => branch.round_label || (branch.id?.startsWith('r1-') ? 'R1' : branch.id?.startsWith('r2-') ? 'R2' : 'Branch')

const categoryColor = (cat: string) => {
  if (cat.includes('tech')) return 'var(--accent)'
  if (cat.includes('faith')) return 'oklch(0.62 0.14 140)'
  if (cat.includes('mind')) return 'oklch(0.65 0.15 45)'
  return 'var(--ink-2)'
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    love: 'kept',
    pruned: 'pruned',
    held: 'held',
    active: 'active',
    fresh: 'fresh',
    candidate: 'new idea',
    locked: 'locked',
  }
  return map[status] || status
}

function Evidence({ branch }: { branch: DeckBranch }) {
  const items: Array<[string, string]> = []
  items.push(['sources', String(branch.mapped_count ?? 0)])
  items.push(['unmapped', String(branch.unmapped_count ?? 0)])
  items.push(['units', String(branch.learning_units ?? 0)])
  items.push(['attention', branch.attention_share != null ? `${Math.round(Number(branch.attention_share) * 100)}%` : '—'])
  items.push(['SRS due', String(branch.srs_due ?? 0)])
  if (branch.recall_strength != null) items.push(['recall', Number(branch.recall_strength).toFixed(2)])
  return (
    <div class="desk-evidence" aria-label="Branch evidence">
      {items.map(([label, value]) => (
        <div key={label}><strong>{value}</strong><span>{label}</span></div>
      ))}
    </div>
  )
}

function Row({ branch, selected, onSelect, pending }: { branch: DeckBranch; selected: boolean; onSelect: () => void; pending: boolean }) {
  const source = branch.source === 'suggest' ? 'suggest' : null
  return (
    <button class={`desk-row ${selected ? 'active' : ''} ${source ? 'is-suggest' : ''}`} onClick={onSelect}>
      <span class={`desk-state state-${branch.status}`}>{statusLabel(branch.status)}</span>
      <span class="desk-row-body">
        <strong>{branch.label}</strong>
        <small>{roundLabel(branch)} · {String(branch.super_category || 'cat-mind').replace('cat-', '')}{branch.priority_rank ? ` · priority #${branch.priority_rank}` : ''}</small>
      </span>
      <span class="desk-row-count">
        {branch.mapped_count || branch.learning_units
          ? <small>{branch.mapped_count || 0} src · {branch.learning_units || 0} units</small>
          : <small>no evidence yet</small>}
        {pending && <i class="desk-dot" aria-hidden="true" />}
      </span>
    </button>
  )
}

export function BranchDeckPage() {
  const [deck, setDeck] = useState<DeckBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Array<{ id: string; label: string; previousStatus: string; previousPriorityRank: number | null }>>([])
  const [suggestions, setSuggestions] = useState<DeckBranch[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showBranchList, setShowBranchList] = useState(false)
  const [custom, setCustom] = useState({ label: '', round: 'R1', cat: 'cat-mind', description: '', leaves: '', contrast: '' })
  const addDialogRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!showAddModal) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    addDialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus()
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [showAddModal])

  useEffect(() => {
    if (!showAddModal) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setShowAddModal(false)
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [showAddModal])

  const trapAddDialogFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setShowAddModal(false); return }
    if (event.key !== 'Tab') return
    const dialog = addDialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const noticeTimerRef = useRef<number | null>(null)
  const flash = (message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000)
  }

  const fetchDeck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<any>('/brain/branch-deck')
      setDeck(data.existing || [])
      if (!data.existing?.length) setNotice('No branches on the map yet — add a first branch.')
    } catch (err: any) {
      setError(err?.message || 'Error fetching branch deck')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeck()
  }, [fetchDeck])

  const allBranches = [...deck]
  const pending = allBranches.filter((b) => b.is_candidate || ['candidate', 'active', 'fresh'].includes(b.status))
  const decided = allBranches.filter((b) => !pending.some((p) => p.id === b.id))
  const selected = [...allBranches, ...suggestions].find((b) => b.id === selectedId) || null
  const selectedBrief = selected ? {
    plainLanguage: selected.plain_language && selected.plain_language.trim() !== selected.description?.trim() ? selected.plain_language : selected.description,
  } : null

  // Keep the review loop moving: the first waiting branch is ready immediately,
  // and every saved decision advances to the next waiting card.
  useEffect(() => {
    if (!loading && !selectedId && pending.length > 0) setSelectedId(pending[0].id)
  }, [loading, pending, selectedId])

  const decide = async (branch: DeckBranch, action: 'keep' | 'prune' | 'priority' | 'hold' | 'add') => {
    if (saving) return
    setSaving(true)
    setNotice(null)
    const previousStatus = branch.status
    const previousPriorityRank = branch.priority_rank ?? null
    try {
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
      const branchIndex = pending.findIndex((candidate) => candidate.id === branch.id)
      const nextId = pending[branchIndex + 1]?.id || pending.find((candidate) => candidate.id !== branch.id)?.id
      setHistory((prev) => [...prev, { id: branch.id, label: branch.label, previousStatus, previousPriorityRank }])
      if (action === 'add') {
        setSuggestions((prev) => prev.filter((s) => s.id !== branch.id))
        flash(`${branch.label} was added to the map.`)
      } else {
        flash(`${branch.label} → ${ACTION_LABEL[action]}. The map and Compass context updated.`)
      }
      setSelectedId(nextId || null)
      await fetchDeck()
    } catch (err: any) {
      flash(`That decision was not saved: ${err?.message || 'server error'}`)
    } finally {
      setSaving(false)
    }
  }

  const undoLast = async () => {
    if (saving || history.length === 0) return
    setSaving(true)
    setNotice(null)
    const last = history[history.length - 1]
    try {
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
      setHistory((prev) => prev.slice(0, -1))
      flash(`${last.label} was restored.`)
      await fetchDeck()
    } catch (err: any) {
      flash(`Undo could not be saved: ${err?.message || 'server error'}`)} finally {
      setSaving(false)
    }
  }

  const addCustom = async (e: Event) => {
    e.preventDefault()
    if (!custom.label.trim()) return
    const branchName = custom.label.trim()
    const id = `${custom.round.toLowerCase() === 'r1' ? 'r1' : 'r2'}-${branchName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`
    try {
      await api('/brain/branch-swipe', {
        method: 'POST',
        body: JSON.stringify({
          id,
          action: 'add',
          label: branchName,
          super_category: custom.cat,
          round_label: custom.round,
          description: custom.description.trim() || `Custom branch added by user: ${branchName}`,
          rationale: custom.description.trim() || `Custom branch added by user: ${branchName}`,
          leaves_sample: custom.leaves.split(',').map((item) => item.trim()).filter(Boolean),
          contrast_hook: custom.contrast.trim(),
        }),
      })
      setShowAddModal(false)
      setCustom({ label: '', round: 'R1', cat: 'cat-mind', description: '', leaves: '', contrast: '' })
      flash(`${branchName} was added to the map.`)
      await fetchDeck()
    } catch (err: any) {
      flash(`Could not add: ${err?.message || 'server error'}`)
    }
  }

  // Keyboard shortcuts — secondary, explicit actions remain the primary path.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showAddModal || !selected || saving) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (e.key === 'k' || e.key === 'K') decide(selected, 'keep')
      else if (e.key === 'x' || e.key === 'X') decide(selected, 'prune')
      else if (e.key === 'm' || e.key === 'M') decide(selected, 'priority')
      else if (e.key === 'h' || e.key === 'H') decide(selected, 'hold')
      else if (e.key === 'z' || e.key === 'Z') undoLast()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, showAddModal, saving, history])

  const kept = allBranches.filter((b) => b.status === 'love').length
  const pruned = allBranches.filter((b) => b.status === 'pruned').length
  const held = allBranches.filter((b) => b.status === 'held').length
  const priorities = allBranches.filter((b) => b.priority_rank != null).length

  return (
    <div class="branch-desk">
      <h1 class="visually-hidden">Branch deck</h1>
      {notice && <div class="desk-notice" role="status">{notice}</div>}

      <div class="desk-taskline">
        <span><strong>{pending.length}</strong> waiting · <strong>{decided.length}</strong> decided</span>
        <span>Decisions update the map, Compass exclusions, priorities, and taste. Nothing auto-starts.</span>
      </div>

      <div class="desk-browsebar">
        <button
          class="desk-browse-toggle"
          aria-expanded={showBranchList}
          aria-controls="branch-desk-list-section"
          onClick={() => setShowBranchList((open) => !open)}
        >
          <span class="desk-browse-icon" aria-hidden="true">{showBranchList ? '−' : '+'}</span>
          {showBranchList ? 'Hide branch list' : `Browse all branches (${allBranches.length})`}
        </button>
        <span class="desk-browse-hint">The next card opens automatically after each decision.</span>
      </div>

      <div class="desk-layout">
        {/* Left — the list */}
        {showBranchList && <section id="branch-desk-list-section" class="desk-list desk-list-reveal" aria-label="Branches">
          <div class="desk-list-head">
            <span>Waiting on you</span>
            <button class="desk-text-action" onClick={() => setShowAddModal(true)}>+ Add branch</button>
          </div>
          <div class="desk-list-body">
            {loading ? (
              <div class="desk-empty">Loading branch deck…</div>
            ) : error ? (
              <div class="desk-empty desk-error">
                <p>{error}</p>
                <button class="secondary-action" onClick={fetchDeck}>Try again</button>
              </div>
            ) : pending.length === 0 && suggestions.length === 0 ? (
              <div class="desk-empty">
                <strong>No branch decisions waiting — the map is settled.</strong>
                <span>Prune the old or add new ones.</span>
              </div>
            ) : (
              <>
                {suggestions.map((s) => (
                  <Row key={s.id} branch={s} selected={selectedId === s.id} onSelect={() => setSelectedId(s.id)} pending />
                ))}
                {pending.map((b) => (
                  <Row key={b.id} branch={b} selected={selectedId === b.id} onSelect={() => setSelectedId(b.id)} pending />
                ))}
              </>
            )}
          </div>

          {decided.length > 0 && (
            <>
              <div class="desk-list-head desk-list-head-decided"><span>Decided</span></div>
              <div class="desk-list-body">
                {decided.map((b) => (
                  <Row key={b.id} branch={b} selected={selectedId === b.id} onSelect={() => setSelectedId(b.id)} pending={false} />
                ))}
              </div>
            </>
          )}
        </section>}

        {/* Right — the inspector */}
        <section class="desk-inspector" aria-label="Branch inspector">
          {!selected ? (
            <div class="desk-inspector-empty">
              <strong>{allBranches.length ? 'Choose a branch to review it.' : 'Your branch map is settled for now.'}</strong>
              <span>{allBranches.length ? 'Every row shows real evidence — consumed sources, units, attention share — not guesses.' : 'You can browse the full map or add a branch when you are ready.'}</span>
              <button class="primary-action desk-empty-action" onClick={() => setShowBranchList(true)}>{allBranches.length ? 'Browse branches' : 'Open branch map'}</button>
            </div>
          ) : (
            <div class="desk-card" key={selected.id}>
              <div class="desk-card-meta">
                <span class="deck-round">{roundLabel(selected)}</span>
                <span class="deck-sep">·</span>
                <span class="deck-category"><i style={{ background: categoryColor(selected.super_category) }} />{String(selected.super_category || 'cat-mind').replace('cat-', '')}</span>
                {selected.priority_rank && <><span class="deck-sep">·</span><span class="deck-priority">priority #{selected.priority_rank}</span></>}
                <span class={`deck-state state-${selected.status}`}>{statusLabel(selected.status)}</span>
              </div>

              <h2 class="desk-title">{selected.label}</h2>
              <p class="desk-desc">{selected.description}</p>

              {selectedBrief?.plainLanguage && (
                <div class="desk-brief desk-brief-meaning">
                  <span class="desk-kicker">What this branch covers</span>
                  <p>{selectedBrief.plainLanguage}</p>
                </div>
              )}

              {selected.overlap_candidates && selected.overlap_candidates.length > 0 && (
                <div class="desk-section">
                  <span class="desk-kicker">Possible overlap</span>
                  <div class="deck-leaf-list">{selected.overlap_candidates.map((label) => <span class="deck-leaf" key={label}>{label}</span>)}</div>
                </div>
              )}

              <Evidence branch={selected} />

              {selected.leaves_sample && selected.leaves_sample.length > 0 && (
                <div class="desk-section">
                  <span class="desk-kicker">Topics</span>
                  <div class="deck-leaf-list">
                    {selected.leaves_sample.map((leaf) => (
                      <span class="deck-leaf" key={leaf}>{leaf}</span>
                    ))}
                  </div>
                </div>
              )}

              {selected.contrast_hook && (
                <div class="desk-section">
                  <span class="desk-kicker">Contrast boundary</span>
                  <p class="desk-contrast">{selected.contrast_hook}</p>
                </div>
              )}

              {selected.reasons && selected.reasons.length > 0 && (
                <div class="desk-section">
                  <span class="desk-kicker">Balance signal</span>
                  <p class="desk-contrast">{selected.reasons.join(' · ')}</p>
                </div>
              )}

              <div class="desk-actions">
                {selected.source === 'suggest' ? (
                  <button class="desk-btn desk-btn-add" disabled={saving} onClick={() => decide(selected, 'add')}>Add to map</button>
                ) : (
                  <>
                    <button class="desk-btn desk-btn-prune" disabled={saving} title="Prune (X)" onClick={() => decide(selected, 'prune')}>Prune</button>
                    <button class="desk-btn desk-btn-hold" disabled={saving} title="Hold (H)" onClick={() => decide(selected, 'hold')}>Hold</button>
                    <button class="desk-btn desk-btn-priority" disabled={saving} title="Promote to priority (M)" onClick={() => decide(selected, 'priority')}>Promote</button>
                    <button class="desk-btn desk-btn-keep" disabled={saving} title="Keep (K)" onClick={() => decide(selected, 'keep')}>Keep</button>
                  </>
                )}
              </div>

              <div class="desk-undo">
                <button class="desk-text-action" disabled={saving || history.length === 0} onClick={undoLast}>↩ Undo last decision{history.length ? ` (${history[history.length - 1].label})` : ''}</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Profile effect summary */}
      <div class="desk-status" aria-label="Profile effect">
        <span><strong>{kept}</strong> kept</span>
        <span><strong>{priorities}</strong> priorities</span>
        <span><strong>{held}</strong> held</span>
        <span><strong>{pruned}</strong> pruned</span>
        <span class="desk-status-note">Pruned branches are blocked from future recommendations; kept and priority branches steer Compass.</span>
      </div>

      {/* Add branch modal */}
      {showAddModal && (
        <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowAddModal(false)}>
          <div ref={addDialogRef} class="modal-box" role="dialog" aria-modal="true" aria-labelledby="add-branch-title" onClick={(e) => e.stopPropagation()} onKeyDown={trapAddDialogFocus}>
            <header class="modal-header"><h3 id="add-branch-title">Add a branch for agents to explore</h3><button type="button" class="icon-button" onClick={() => setShowAddModal(false)} aria-label="Close add branch dialog">×</button></header>
            <form onSubmit={addCustom}>
              <label>
                Branch name / topic:
                <input
                  type="text"
                  placeholder="e.g. Local LLM context engineering"
                  value={custom.label}
                  onInput={(e) => setCustom({ ...custom, label: (e.target as HTMLInputElement).value })}
                  required
                />
              </label>
              <div class="form-row">
                <label>
                  Branch level:
                  <select value={custom.round} onChange={(e) => setCustom({ ...custom, round: (e.target as HTMLSelectElement).value })}>
                    <option value="R1">R1 (Macro domain)</option>
                    <option value="R2">R2 (Micro field)</option>
                  </select>
                </label>
                <label>
                  Category:
                  <select value={custom.cat} onChange={(e) => setCustom({ ...custom, cat: (e.target as HTMLSelectElement).value })}>
                    <option value="cat-tech">Tech & AI systems</option>
                    <option value="cat-faith">Faith & Tazkiyah</option>
                    <option value="cat-mind">Mind & Economics</option>
                  </select>
                </label>
              </div>
              <label>
                What should agents understand about it?
                <textarea value={custom.description} onInput={(e) => setCustom({ ...custom, description: (e.target as HTMLTextAreaElement).value })} placeholder="The useful scope, mechanism, or outcome this branch should cover." maxLength={1000} />
              </label>
              <label>
                Starter leaves <span class="form-hint">comma-separated</span>
                <input value={custom.leaves} onInput={(e) => setCustom({ ...custom, leaves: (e.target as HTMLInputElement).value })} placeholder="e.g. mechanism, case study, application" maxLength={800} />
              </label>
              <label>
                Boundary or contrast hook <span class="form-hint">optional</span>
                <input value={custom.contrast} onInput={(e) => setCustom({ ...custom, contrast: (e.target as HTMLInputElement).value })} placeholder="What this branch is deliberately not about" maxLength={500} />
              </label>
              <div class="modal-actions">
                <button type="button" class="secondary-action" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" class="primary-action">Save branch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
