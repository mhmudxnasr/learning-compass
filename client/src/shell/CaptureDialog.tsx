import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { api } from '../api'
import { uploadArtifact } from '../app/upload'
import { useData } from '../app/useData'
import { Icon } from '../components/Icon'

type CaptureKind = 'source' | 'book' | 'movie' | 'series' | 'podcast' | 'course' | 'game' | 'album' | 'other'
type PersonalState = 'planned' | 'in_progress' | 'completed' | 'paused' | 'dropped'

const captureKinds: Array<{ key: CaptureKind; label: string; hint: string }> = [
  { key: 'source', label: 'Source', hint: 'Link, idea, or file' },
  { key: 'book', label: 'Book', hint: 'Reading record' },
  { key: 'movie', label: 'Movie', hint: 'Watch history' },
  { key: 'series', label: 'Series', hint: 'Episode progress' },
  { key: 'podcast', label: 'Podcast', hint: 'Listening record' },
  { key: 'course', label: 'Course', hint: 'Lesson progress' },
  { key: 'game', label: 'Game', hint: 'Play history' },
  { key: 'album', label: 'Album', hint: 'Listening history' },
  { key: 'other', label: 'Other', hint: 'Anything else' },
]

const stateOptions: Array<{ value: PersonalState; label: string }> = [
  { value: 'planned', label: 'Want to start' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Finished' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Stopped' },
]

const creatorLabel = (kind: CaptureKind) => {
  if (kind === 'book') return 'Author'
  if (kind === 'movie') return 'Director or creator'
  if (kind === 'series') return 'Creator or network'
  if (kind === 'podcast') return 'Host or publisher'
  if (kind === 'course') return 'Teacher or provider'
  if (kind === 'game') return 'Studio'
  if (kind === 'album') return 'Artist'
  return 'Creator'
}

const progressUnitFor = (kind: CaptureKind) => ({
  book: 'pages', movie: 'minutes', series: 'episodes', podcast: 'episodes', course: 'lessons',
  game: 'hours', album: 'tracks', other: 'items', source: 'items',
})[kind]

export function CaptureDialog({
  open,
  onClose,
  onCaptured,
  initialSource = '',
  initialTitle = '',
  initialStatus = '',
  shareIntakeId = '',
}: {
  open: boolean
  onClose: () => void
  onCaptured: () => void
  initialSource?: string
  initialTitle?: string
  initialStatus?: string
  shareIntakeId?: string
}) {
  const [kind, setKind] = useState<CaptureKind>('source')
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [creator, setCreator] = useState('')
  const [personalState, setPersonalState] = useState<PersonalState>('planned')
  const [url, setUrl] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [progressCurrent, setProgressCurrent] = useState('')
  const [progressTotal, setProgressTotal] = useState('')
  const [progressUnit, setProgressUnit] = useState('items')
  const [rating, setRating] = useState('')
  const [tags, setTags] = useState('')
  const [personalNote, setPersonalNote] = useState('')
  const branchDeck = useData<{ existing?: Array<{ id: string; label: string; category_label?: string; status?: string }> }>(open ? '/brain/branch-deck' : undefined)
  const branchOptions = (branchDeck.data?.existing || []).filter((branch) => String(branch.status || '').toLowerCase() !== 'pruned')
  const dialogRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    dialogRef.current
      ?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled])')
      ?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    if (initialSource && !source) {
      setKind('source')
      setSource(initialSource)
    }
    if (initialTitle && !title) setTitle(initialTitle)
    if (initialStatus && !status) setStatus(initialStatus)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (!saving) onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [open, onClose, initialSource, initialTitle, initialStatus, source, title, status, saving])

  const chooseKind = (next: CaptureKind) => {
    setKind(next)
    setStatus('')
    if (next !== 'source') setProgressUnit(progressUnitFor(next))
    window.requestAnimationFrame(() => document.getElementById(next === 'source' ? 'capture-source-input' : 'capture-personal-title')?.focus())
  }

  const reset = () => {
    setSource(''); setFile(null); setBranchId(''); setTitle(''); setCreator(''); setPersonalState('planned')
    setUrl(''); setReleaseYear(''); setDurationMinutes(''); setProgressCurrent(''); setProgressTotal('')
    setProgressUnit('items'); setRating(''); setTags(''); setPersonalNote('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!saving) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
    ))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  const canSaveSource = Boolean((source.trim() || file) && branchId)
  const canSavePersonal = Boolean(title.trim() && branchId && (kind !== 'book' || creator.trim()))

  const submit = async (event: Event) => {
    event.preventDefault()
    if (kind === 'source' ? !canSaveSource : !canSavePersonal) return
    setSaving(true)
    setStatus(kind === 'source' ? 'Saving source…' : `Saving ${kind}…`)
    try {
      if (kind === 'source') {
        const artifact = file ? await uploadArtifact(file) : null
        const result = await api<any>('/capture', {
          method: 'POST',
          body: JSON.stringify({ source: file?.name || source.trim(), title: initialTitle.trim() || undefined, artifact_id: artifact?.id, branch_id: branchId }),
        })
        let intakePending = false
        if (shareIntakeId) {
          try {
            await api(`/api/share-intakes/${encodeURIComponent(shareIntakeId)}/consume`, {
              method: 'POST', body: JSON.stringify({ recommendation_id: result.id }),
            })
          } catch { intakePending = true }
        }
        setStatus(intakePending
          ? 'Source saved. The share receipt remains recoverable until its completion marker syncs.'
          : result?.duplicate ? 'Source already exists. Existing record preserved.' : 'Source saved.')
      } else {
        await api('/capture/personal', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(), creator: creator.trim(), item_type: kind, state: personalState, branch_id: branchId,
            url: url.trim() || undefined, release_year: releaseYear || undefined, duration_minutes: durationMinutes || undefined,
            progress_current: progressCurrent || undefined, progress_total: progressTotal || undefined, progress_unit: progressUnit,
            rating: rating || undefined, tags: tags.split(',').map((value) => value.trim()).filter(Boolean), personal_note: personalNote.trim(),
          }),
        })
        setStatus(`${captureKinds.find((item) => item.key === kind)?.label || 'Item'} saved to your data studio.`)
      }
      reset()
      setSaving(false)
      onCaptured()
      window.setTimeout(() => {
        onClose()
        setKind('source')
        setStatus('')
      }, 650)
    } catch (error: any) {
      setStatus(error?.message || 'Capture failed. Input preserved.')
      setSaving(false)
    }
  }

  return (
    <div class="dialog-layer capture-dialog-layer" role="presentation" onClick={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} class="dialog capture-dialog capture-dialog-advanced" role="dialog" aria-modal="true" aria-labelledby="capture-title" onKeyDown={trapFocus}>
        <header class="capture-dialog-head">
          <div class="capture-dialog-heading"><span class="folio-object-kicker">Quick Capture</span><h2 id="capture-title">Add to Learning Compass</h2></div>
          <button type="button" class="capture-close-btn" onClick={onClose} aria-label="Close capture dialog" disabled={saving}><Icon name="close" size={16} /></button>
        </header>

        <p class="capture-dialog-lede">Save a source, or log something you read, watched, listened to, studied, or played. You can refine every field later.</p>

        <form class="capture-dialog-form" onSubmit={submit}>
          <fieldset class="capture-kind-fieldset">
            <legend>What are you adding?</legend>
            <div class="capture-kind-grid">
              {captureKinds.map((item) => <button key={item.key} type="button" class={kind === item.key ? 'capture-kind-option is-active' : 'capture-kind-option'} aria-pressed={kind === item.key} onClick={() => chooseKind(item.key)}>
                <strong>{item.label}</strong><small>{item.hint}</small>
              </button>)}
            </div>
          </fieldset>

          {kind === 'source' ? <>
            <div class="capture-input-group">
              <label for="capture-source-input" class="capture-label"><span>Link, title, or idea</span></label>
              <textarea id="capture-source-input" class="capture-textarea" autoFocus value={source} onInput={(event) => setSource((event.target as HTMLTextAreaElement).value)} placeholder="Paste a URL, title, or note…" rows={3} />
            </div>
            <div class="capture-file-zone">
              <input ref={fileInputRef} id="capture-file-input" type="file" class="capture-file-hidden" onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] || null)} />
              {file ? <div class="capture-file-selected">
                <div class="capture-file-info"><Icon name="file" size={16} /><strong>{file.name}</strong><small>({Math.round(file.size / 1024)} KB)</small></div>
                <button type="button" class="capture-file-remove" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} aria-label="Remove attached file"><Icon name="close" size={13} /></button>
              </div> : <label for="capture-file-input" class="capture-file-label"><Icon name="file" size={18} /><div class="capture-file-label-text"><strong>Attach a local file</strong><small>PDF, EPUB, HTML, audio, or text</small></div></label>}
            </div>
          </> : <>
            <div class="capture-personal-core">
              <div class="capture-input-group capture-title-field">
                <label for="capture-personal-title" class="capture-label"><span>Title</span></label>
                <input id="capture-personal-title" class="capture-control" autoFocus value={title} onInput={(event) => setTitle((event.currentTarget as HTMLInputElement).value)} placeholder={`Name of the ${kind}`} required />
              </div>
              <div class="capture-input-group">
                <label for="capture-personal-creator" class="capture-label"><span>{creatorLabel(kind)}</span></label>
                <input id="capture-personal-creator" class="capture-control" value={creator} onInput={(event) => setCreator((event.currentTarget as HTMLInputElement).value)} placeholder={kind === 'book' ? 'Required for books' : 'Optional'} required={kind === 'book'} />
              </div>
              <div class="capture-input-group">
                <label for="capture-personal-state" class="capture-label"><span>Status</span></label>
                <select id="capture-personal-state" class="capture-select" value={personalState} onChange={(event) => setPersonalState((event.currentTarget as HTMLSelectElement).value as PersonalState)}>
                  {stateOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </div>

            <details class="capture-more-fields">
              <summary>More details <span>Progress, rating, tags, and notes</span></summary>
              <div class="capture-more-fields-body">
                <div class="capture-fields-grid">
                  <label class="capture-input-group" for="capture-personal-url"><span class="capture-label">Link</span><input id="capture-personal-url" class="capture-control" type="url" value={url} onInput={(event) => setUrl((event.currentTarget as HTMLInputElement).value)} placeholder="Optional canonical URL" /></label>
                  <label class="capture-input-group" for="capture-personal-year"><span class="capture-label">Release year</span><input id="capture-personal-year" class="capture-control" type="number" min="1800" max={new Date().getFullYear() + 5} value={releaseYear} onInput={(event) => setReleaseYear((event.currentTarget as HTMLInputElement).value)} placeholder="Optional" /></label>
                  <label class="capture-input-group" for="capture-personal-duration"><span class="capture-label">Duration (minutes)</span><input id="capture-personal-duration" class="capture-control" type="number" min="0" value={durationMinutes} onInput={(event) => setDurationMinutes((event.currentTarget as HTMLInputElement).value)} placeholder="Optional" /></label>
                  <label class="capture-input-group" for="capture-personal-rating"><span class="capture-label">Rating (0–10)</span><input id="capture-personal-rating" class="capture-control" type="number" min="0" max="10" step="0.5" value={rating} onInput={(event) => setRating((event.currentTarget as HTMLInputElement).value)} placeholder="Optional" /></label>
                </div>
                <div class="capture-progress-row">
                  <label class="capture-input-group" for="capture-progress-current"><span class="capture-label">Progress</span><input id="capture-progress-current" class="capture-control" type="number" min="0" value={progressCurrent} onInput={(event) => setProgressCurrent((event.currentTarget as HTMLInputElement).value)} placeholder="Current" /></label>
                  <span aria-hidden="true">of</span>
                  <label class="capture-input-group" for="capture-progress-total"><span class="capture-label">Total</span><input id="capture-progress-total" class="capture-control" type="number" min="1" value={progressTotal} onInput={(event) => setProgressTotal((event.currentTarget as HTMLInputElement).value)} placeholder="Total" /></label>
                  <label class="capture-input-group" for="capture-progress-unit"><span class="capture-label">Unit</span><input id="capture-progress-unit" class="capture-control" value={progressUnit} onInput={(event) => setProgressUnit((event.currentTarget as HTMLInputElement).value)} /></label>
                </div>
                <label class="capture-input-group" for="capture-personal-tags"><span class="capture-label">Tags</span><input id="capture-personal-tags" class="capture-control" value={tags} onInput={(event) => setTags((event.currentTarget as HTMLInputElement).value)} placeholder="psychology, documentary, favorite" /><small class="capture-field-help">Separate tags with commas.</small></label>
                <label class="capture-input-group" for="capture-personal-note"><span class="capture-label">Personal note</span><textarea id="capture-personal-note" class="capture-textarea capture-personal-note" rows={2} value={personalNote} onInput={(event) => setPersonalNote((event.currentTarget as HTMLTextAreaElement).value)} placeholder="What mattered, what you want to remember, or why you stopped…" /></label>
              </div>
            </details>
          </>}

          <div class="capture-input-group capture-branch-field">
            <label for="capture-branch-input" class="capture-label"><span>Knowledge branch</span></label>
            <select id="capture-branch-input" class="capture-select" value={branchId} onChange={(event) => setBranchId((event.currentTarget as HTMLSelectElement).value)} required disabled={branchDeck.loading || !branchOptions.length}>
              <option value="">{branchDeck.loading ? 'Loading branches…' : branchOptions.length ? 'Choose where this belongs' : 'No active branches available'}</option>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}{branch.category_label ? ` · ${branch.category_label}` : ''}</option>)}
            </select>
            <small class="capture-field-help">Required so this record and the preferences learned from it keep one durable context.</small>
            {branchDeck.error && <span class="capture-field-error" role="alert">Branches could not be loaded. Close and retry before saving.</span>}
          </div>

          {status && <output class="capture-status-banner" aria-live="polite">{status}</output>}

          <footer class="capture-dialog-footer">
            <button type="button" class="button secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button class="button primary folio-primary" disabled={(kind === 'source' ? !canSaveSource : !canSavePersonal) || saving || branchDeck.loading} type="submit">
              {saving ? 'Saving…' : kind === 'source' ? 'Save source' : `Save ${captureKinds.find((item) => item.key === kind)?.label || 'item'}`}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
