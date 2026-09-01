import { useEffect, useMemo, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../../api'
import { useData } from '../../app/useData'
import { Empty, ErrorState, Loading } from '../../components/States'
import { PersonalAssistant } from './PersonalAssistant'

type PersonalItem = {
  id: string
  title: string
  creator: string
  item_type: string
  state: string
  branch_id: string | null
  branch: { id: string; label: string; status: string } | null
  url: string
  release_year: number | null
  duration_minutes: number | null
  progress_current: number | null
  progress_total: number | null
  progress_unit: string
  rating: number | null
  tags: string[]
  personal_note: string
  created_at: string | null
  updated_at: string | null
}

type Breakdown = { key: string; count: number }
type PersonalLibraryPayload = {
  items: PersonalItem[]
  total: number
  limit: number
  offset: number
  summary: {
    total: number
    rated: number
    with_progress: number
    by_type: Breakdown[]
    by_state: Breakdown[]
    by_branch: Array<{ id: string | null; label: string; count: number }>
    activity: Array<{ month: string; count: number }>
  }
}

type BranchDeckPayload = { existing?: Array<{ id: string; label: string; category_label?: string; status?: string }> }
type HardcoverPayload = {
  configured: boolean
  state: { status: string; username?: string; last_sync_at?: string | null; last_error?: string | null }
  counts: { total: number; imported: number; unimported: number }
  books: Array<{ hardcover_book_id: number; title: string; state: string; imported: boolean; journal_count: number }>
}

type EditDraft = {
  title: string
  creator: string
  state: string
  branch_id: string
  url: string
  release_year: string
  duration_minutes: string
  progress_current: string
  progress_total: string
  progress_unit: string
  rating: string
  tags: string
  personal_note: string
}

const typeOptions = ['book', 'movie', 'series', 'podcast', 'course', 'game', 'album', 'other']
const stateOptions = [
  { value: 'planned', label: 'Want to start' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Finished' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Stopped' },
]

const stateLabel = (value: string) => stateOptions.find((item) => item.value === value)?.label || labelize(value)
const numberValue = (value: string) => (value.trim() === '' ? null : Number(value))

function draftFrom(item: PersonalItem): EditDraft {
  return {
    title: item.title,
    creator: item.creator,
    state: item.state,
    branch_id: item.branch_id || '',
    url: item.url || '',
    release_year: item.release_year == null ? '' : String(item.release_year),
    duration_minutes: item.duration_minutes == null ? '' : String(item.duration_minutes),
    progress_current: item.progress_current == null ? '' : String(item.progress_current),
    progress_total: item.progress_total == null ? '' : String(item.progress_total),
    progress_unit: item.progress_unit || '',
    rating: item.rating == null ? '' : String(item.rating),
    tags: (item.tags || []).join(', '),
    personal_note: item.personal_note || '',
  }
}

function lastSixMonths(activity: Array<{ month: string; count: number }>) {
  const known = new Map(activity.map((item) => [item.month, item.count]))
  const result: Array<{ month: string; label: string; count: number }> = []
  const now = new Date()
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const month = date.toISOString().slice(0, 7)
    result.push({ month, label: date.toLocaleDateString('en', { month: 'short' }), count: known.get(month) || 0 })
  }
  return result
}

function BreakdownBars({
  items,
  active,
  onSelect,
  label,
}: {
  items: Breakdown[]
  active?: string
  onSelect?: (key: string) => void
  label: string
}) {
  const maximum = Math.max(1, ...items.map((item) => item.count))
  return (
    <div class="personal-breakdown-bars" aria-label={label}>
      {items.length ? (
        items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={active === item.key}
            onClick={() => onSelect?.(active === item.key ? '' : item.key)}
          >
            <span>
              <strong>
                {item.key === 'in_progress'
                  ? 'In progress'
                  : item.key === 'completed'
                    ? 'Finished'
                    : item.key === 'planned'
                      ? 'Want to start'
                      : labelize(item.key)}
              </strong>
              <em>{item.count}</em>
            </span>
            <i aria-hidden="true">
              <b style={{ width: `${Math.max(4, (item.count / maximum) * 100)}%` }} />
            </i>
          </button>
        ))
      ) : (
        <p class="personal-data-empty-copy">No records yet.</p>
      )}
    </div>
  )
}

function Progress({ item }: { item: PersonalItem }) {
  if (item.progress_current == null && item.progress_total == null)
    return <span class="personal-data-muted">Not tracked</span>
  const current = Number(item.progress_current || 0)
  const total = Number(item.progress_total || 0)
  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null
  return (
    <div class="personal-item-progress">
      <span>
        {current}
        {total > 0 ? ` of ${total}` : ''} {item.progress_unit}
      </span>
      {percentage !== null && (
        <i aria-label={`${percentage}% complete`}>
          <b style={{ width: `${percentage}%` }} />
        </i>
      )}
    </div>
  )
}

export function PersonalDataStudio({ onCapture }: { onCapture?: () => void }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [limit, setLimit] = useState(200)
  const [editingId, setEditingId] = useState('')
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [hardcoverBusy, setHardcoverBusy] = useState(false)
  const [hardcoverBranchId, setHardcoverBranchId] = useState('')
  const params = new URLSearchParams({ limit: String(limit) })
  if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
  if (typeFilter) params.set('item_type', typeFilter)
  if (stateFilter) params.set('state', stateFilter)
  const records = useData<PersonalLibraryPayload>(`/capture/personal?${params}`)
  const branches = useData<BranchDeckPayload>('/brain/branch-deck')
  const hardcover = useData<HardcoverPayload>('/hardcover')
  const branchOptions = (branches.data?.existing || []).filter(
    (branch) => String(branch.status || '').toLowerCase() !== 'pruned',
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => setLimit(200), [debouncedQuery, typeFilter, stateFilter])

  const activity = useMemo(() => lastSixMonths(records.data?.summary.activity || []), [records.data?.summary.activity])
  if (records.loading && !records.data) return <Loading label="Building your personal data studio" />
  if (records.error && !records.data) return <ErrorState message={records.error} retry={records.reload} />

  const payload = records.data || {
    items: [],
    total: 0,
    limit,
    offset: 0,
    summary: { total: 0, rated: 0, with_progress: 0, by_type: [], by_state: [], by_branch: [], activity: [] },
  }
  const inProgress = payload.summary.by_state.find((item) => item.key === 'in_progress')?.count || 0
  const completed = payload.summary.by_state.find((item) => item.key === 'completed')?.count || 0
  const maximumActivity = Math.max(1, ...activity.map((item) => item.count))

  const startEdit = (item: PersonalItem) => {
    setEditingId(item.id)
    setDraft(draftFrom(item))
    setNotice('')
  }

  const closeEdit = () => {
    setEditingId('')
    setDraft(null)
  }

  const updateDraft = (key: keyof EditDraft, value: string) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const saveEdit = async (event: Event, item: PersonalItem) => {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    setNotice('')
    try {
      await api(`/capture/personal/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title,
          creator: draft.creator,
          state: draft.state,
          branch_id: draft.branch_id,
          release_year: numberValue(draft.release_year),
          duration_minutes: numberValue(draft.duration_minutes),
          progress_current: numberValue(draft.progress_current),
          progress_total: numberValue(draft.progress_total),
          progress_unit: draft.progress_unit,
          rating: numberValue(draft.rating),
          tags: draft.tags
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          personal_note: draft.personal_note,
        }),
      })
      setNotice(`Saved “${draft.title}”. The edit is recorded in the data lineage.`)
      setEditingId('')
      setDraft(null)
      records.reload()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The item could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  const syncHardcover = async () => {
    setHardcoverBusy(true)
    setNotice('')
    try {
      const result = await api<{ books?: number }>('/hardcover/sync', { method: 'POST', body: '{}' })
      setNotice(`Hardcover synced ${result.books || 0} books. Choose a branch, then import the unimported records.`)
      hardcover.reload()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Hardcover could not be synced.')
    } finally {
      setHardcoverBusy(false)
    }
  }

  const importHardcover = async () => {
    if (!hardcoverBranchId) return
    setHardcoverBusy(true)
    setNotice('')
    try {
      const result = await api<{ imported?: number; errors?: Array<{ id: number; error: string }> }>(
        '/hardcover/import',
        { method: 'POST', body: JSON.stringify({ branch_id: hardcoverBranchId }) },
      )
      setNotice(
        `Imported ${result.imported || 0} Hardcover books into your personal ledger${result.errors?.length ? `; ${result.errors.length} needs review.` : '.'}`,
      )
      hardcover.reload()
      records.reload()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Hardcover books could not be imported.')
    } finally {
      setHardcoverBusy(false)
    }
  }

  return (
    <section class="personal-data-studio" aria-labelledby="personal-data-title">
      <PersonalAssistant
        branches={branchOptions}
        onSaved={() => {
          records.reload()
          branches.reload()
        }}
      />
      <div class="personal-data-heading">
        <div>
          <span class="eyebrow">Personal data studio</span>
          <h2 id="personal-data-title">Make what you read, watch, and finish useful</h2>
          <p>
            Add media in seconds, correct any field later, and see the real shape of your history without engagement
            scores or invented insights.
          </p>
        </div>
        <button type="button" class="button primary" onClick={onCapture}>
          Add anything
        </button>
      </div>

      <div class="personal-data-stats" aria-label="Personal library summary">
        <article>
          <span>Tracked records</span>
          <strong>{payload.summary.total}</strong>
          <small>Across {payload.summary.by_type.length} types</small>
        </article>
        <article>
          <span>In progress</span>
          <strong>{inProgress}</strong>
          <small>Things currently underway</small>
        </article>
        <article>
          <span>Finished</span>
          <strong>{completed}</strong>
          <small>Explicitly completed records</small>
        </article>
        <article>
          <span>Rated</span>
          <strong>{payload.summary.rated}</strong>
          <small>Direct preference signals</small>
        </article>
      </div>

      <section class="personal-hardcover-panel" aria-labelledby="hardcover-import-title">
        <div class="personal-hardcover-copy">
          <span class="eyebrow">External library</span>
          <h3 id="hardcover-import-title">Bring in your Hardcover books</h3>
          <p>
            Sync the private Hardcover mirror, review the count, then import unlinked books into this editable ledger.
            Every import needs one verified knowledge branch and stays outside Queue.
          </p>
        </div>
        <div class="personal-hardcover-controls">
          <div class="personal-hardcover-summary">
            <strong>{hardcover.data?.counts.total || 0}</strong>
            <span>synced</span>
            <strong>{hardcover.data?.counts.unimported || 0}</strong>
            <span>not imported</span>
            <small>
              {hardcover.data?.state.last_sync_at
                ? `Last sync ${formatDate(hardcover.data.state.last_sync_at)}`
                : 'Not synced in this session'}
            </small>
          </div>
          <label>
            <span>Import branch</span>
            <select
              value={hardcoverBranchId}
              onChange={(event) => setHardcoverBranchId((event.currentTarget as HTMLSelectElement).value)}
              disabled={branches.loading || !branchOptions.length}
            >
              <option value="">Choose a verified branch</option>
              {branchOptions.map((branch) => (
                <option value={branch.id} key={branch.id}>
                  {branch.label}
                  {branch.category_label ? ` · ${branch.category_label}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div class="personal-hardcover-actions">
            <button type="button" class="button secondary" onClick={syncHardcover} disabled={hardcoverBusy}>
              {hardcoverBusy ? 'Syncing…' : 'Sync Hardcover'}
            </button>
            <button
              type="button"
              class="button primary"
              onClick={importHardcover}
              disabled={hardcoverBusy || !hardcoverBranchId || !hardcover.data?.counts.unimported}
            >
              {hardcoverBusy ? 'Importing…' : 'Import unlinked books'}
            </button>
          </div>
        </div>
      </section>

      <div class="personal-data-visual-grid">
        <section class="personal-data-visual">
          <div class="section-head">
            <h3>What you track</h3>
            <span>{payload.summary.total} records</span>
          </div>
          <BreakdownBars
            items={payload.summary.by_type}
            active={typeFilter}
            onSelect={setTypeFilter}
            label="Records by type"
          />
        </section>
        <section class="personal-data-visual">
          <div class="section-head">
            <h3>Where things stand</h3>
            <span>Explicit status</span>
          </div>
          <BreakdownBars
            items={payload.summary.by_state}
            active={stateFilter}
            onSelect={setStateFilter}
            label="Records by status"
          />
        </section>
        <section class="personal-data-visual personal-data-activity">
          <div class="section-head">
            <h3>Recent editing activity</h3>
            <span>Last six months</span>
          </div>
          <div class="personal-activity-bars" aria-label="Records updated by month">
            {activity.map((item) => (
              <div key={item.month}>
                <i>
                  <b style={{ height: `${Math.max(item.count ? 10 : 2, (item.count / maximumActivity) * 100)}%` }} />
                </i>
                <strong>{item.count}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section class="personal-data-visual">
          <div class="section-head">
            <h3>Knowledge context</h3>
            <span>Top branches</span>
          </div>
          <div class="personal-branch-breakdown">
            {payload.summary.by_branch.length ? (
              payload.summary.by_branch.map((item) => (
                <div key={item.id || item.label}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              ))
            ) : (
              <p class="personal-data-empty-copy">No branch data yet.</p>
            )}
          </div>
        </section>
      </div>

      <section class="personal-data-ledger-section">
        <div class="section-head personal-data-ledger-head">
          <div>
            <h3>Your editable records</h3>
            <span>
              {payload.total} matching {payload.total === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>
        <div class="personal-data-toolbar">
          <label>
            <span>Search records</span>
            <input
              value={query}
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
              placeholder="Title, creator, tag, or note"
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter((event.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">All types</option>
              {typeOptions.map((value) => (
                <option value={value} key={value}>
                  {labelize(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter((event.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">All statuses</option>
              {stateOptions.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {(query || typeFilter || stateFilter) && (
            <button
              type="button"
              class="button secondary"
              onClick={() => {
                setQuery('')
                setTypeFilter('')
                setStateFilter('')
              }}
            >
              Clear
            </button>
          )}
        </div>

        {notice && (
          <output class="personal-data-notice" aria-live="polite">
            {notice}
          </output>
        )}
        {records.error && (
          <div class="personal-data-notice is-error" role="alert">
            {records.error}{' '}
            <button type="button" onClick={records.reload}>
              Retry
            </button>
          </div>
        )}

        {payload.items.length ? (
          <div class="personal-data-ledger" role="table" aria-label="Editable personal records">
            <div class="personal-data-column-head" role="row">
              <span role="columnheader">Record</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Rating</span>
              <span role="columnheader">Updated</span>
              <span role="columnheader">Action</span>
            </div>
            {payload.items.map((item) => (
              <article
                class={editingId === item.id ? 'personal-data-row is-editing' : 'personal-data-row'}
                role="row"
                key={item.id}
              >
                <div class="personal-data-row-main" role="cell" aria-label="Record">
                  <span class="personal-type-label">{labelize(item.item_type)}</span>
                  <strong>{item.title}</strong>
                  <small>
                    {[item.creator, item.release_year, item.branch?.label].filter(Boolean).join(' · ') ||
                      'No creator or year recorded'}
                  </small>
                  {item.tags.length > 0 && (
                    <div class="personal-item-tags">
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div role="cell" aria-label="Status">
                  <span class={`personal-state personal-state-${item.state}`}>{stateLabel(item.state)}</span>
                </div>
                <div role="cell" aria-label="Progress">
                  <Progress item={item} />
                </div>
                <div role="cell" aria-label="Rating">
                  <strong class="personal-item-rating">{item.rating == null ? '—' : `${item.rating}/10`}</strong>
                </div>
                <div role="cell" aria-label="Updated">
                  <span class="personal-data-muted">{formatDate(item.updated_at || undefined)}</span>
                </div>
                <div role="cell" aria-label="Action">
                  <button
                    type="button"
                    class="button secondary"
                    aria-expanded={editingId === item.id}
                    onClick={() => (editingId === item.id ? closeEdit() : startEdit(item))}
                  >
                    {editingId === item.id ? 'Close' : 'Edit'}
                  </button>
                </div>

                {editingId === item.id && draft && (
                  <form class="personal-item-editor" onSubmit={(event) => saveEdit(event, item)}>
                    <div class="personal-item-editor-heading">
                      <div>
                        <span>{labelize(item.item_type)}</span>
                        <strong>Edit every useful field</strong>
                      </div>
                      <small>
                        Type and canonical record identity stay fixed so links, Books, and history do not break.
                      </small>
                    </div>
                    <div class="personal-item-editor-grid">
                      <label>
                        <span>Title</span>
                        <input
                          value={draft.title}
                          required
                          onInput={(event) => updateDraft('title', (event.currentTarget as HTMLInputElement).value)}
                        />
                      </label>
                      <label>
                        <span>{item.item_type === 'book' ? 'Author' : 'Creator'}</span>
                        <input
                          value={draft.creator}
                          required={item.item_type === 'book'}
                          onInput={(event) => updateDraft('creator', (event.currentTarget as HTMLInputElement).value)}
                        />
                      </label>
                      <label>
                        <span>Status</span>
                        <select
                          value={draft.state}
                          onChange={(event) => updateDraft('state', (event.currentTarget as HTMLSelectElement).value)}
                        >
                          {stateOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Knowledge branch</span>
                        <select
                          value={draft.branch_id}
                          required
                          onChange={(event) =>
                            updateDraft('branch_id', (event.currentTarget as HTMLSelectElement).value)
                          }
                        >
                          <option value="">Choose a branch</option>
                          {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.label}
                              {branch.category_label ? ` · ${branch.category_label}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label class="personal-editor-wide">
                        <span>Canonical link</span>
                        <input
                          type="url"
                          value={draft.url}
                          placeholder="No canonical link"
                          readOnly
                          aria-describedby={`personal-url-help-${item.id}`}
                        />
                        <small id={`personal-url-help-${item.id}`}>
                          Canonical link changes use the source record’s verified replacement flow.
                        </small>
                      </label>
                      <label>
                        <span>Release year</span>
                        <input
                          type="number"
                          min="1800"
                          max={new Date().getFullYear() + 5}
                          value={draft.release_year}
                          onInput={(event) =>
                            updateDraft('release_year', (event.currentTarget as HTMLInputElement).value)
                          }
                        />
                      </label>
                      <label>
                        <span>Duration (minutes)</span>
                        <input
                          type="number"
                          min="0"
                          value={draft.duration_minutes}
                          onInput={(event) =>
                            updateDraft('duration_minutes', (event.currentTarget as HTMLInputElement).value)
                          }
                        />
                      </label>
                      <label>
                        <span>Progress</span>
                        <input
                          type="number"
                          min="0"
                          value={draft.progress_current}
                          onInput={(event) =>
                            updateDraft('progress_current', (event.currentTarget as HTMLInputElement).value)
                          }
                        />
                      </label>
                      <label>
                        <span>Total</span>
                        <input
                          type="number"
                          min="1"
                          value={draft.progress_total}
                          onInput={(event) =>
                            updateDraft('progress_total', (event.currentTarget as HTMLInputElement).value)
                          }
                        />
                      </label>
                      <label>
                        <span>Progress unit</span>
                        <input
                          value={draft.progress_unit}
                          onInput={(event) =>
                            updateDraft('progress_unit', (event.currentTarget as HTMLInputElement).value)
                          }
                        />
                      </label>
                      <label>
                        <span>Rating (0–10)</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.5"
                          value={draft.rating}
                          onInput={(event) => updateDraft('rating', (event.currentTarget as HTMLInputElement).value)}
                        />
                      </label>
                      <label class="personal-editor-wide">
                        <span>Tags</span>
                        <input
                          value={draft.tags}
                          placeholder="Comma separated"
                          onInput={(event) => updateDraft('tags', (event.currentTarget as HTMLInputElement).value)}
                        />
                      </label>
                      <label class="personal-editor-wide">
                        <span>Personal note</span>
                        <textarea
                          rows={3}
                          value={draft.personal_note}
                          onInput={(event) =>
                            updateDraft('personal_note', (event.currentTarget as HTMLTextAreaElement).value)
                          }
                        />
                      </label>
                    </div>
                    <div class="personal-item-editor-actions">
                      <button type="button" class="button secondary" disabled={saving} onClick={closeEdit}>
                        Cancel
                      </button>
                      <button type="submit" class="button primary" disabled={saving || branches.loading}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No records match"
            body={
              payload.summary.total
                ? 'Change the filters or search to return to your data.'
                : 'Use Add anything to log the first book, movie, series, podcast, course, game, or album.'
            }
            action={
              <button type="button" class="button primary" onClick={onCapture}>
                Add the first item
              </button>
            }
          />
        )}

        {payload.items.length < payload.total && (
          <div class="personal-data-load-more">
            <button
              type="button"
              class="button secondary"
              disabled={records.loading}
              onClick={() => setLimit((value) => Math.min(5000, value + 200))}
            >
              {records.loading ? 'Loading…' : `Show more (${payload.total - payload.items.length} remaining)`}
            </button>
          </div>
        )}
      </section>
    </section>
  )
}
