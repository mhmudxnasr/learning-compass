import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { api } from '../api'
import { uploadArtifact } from '../app/upload'
import { Icon } from '../components/Icon'

export function CaptureDialog({
  open,
  onClose,
  onCaptured,
  initialSource = '',
  initialStatus = '',
}: {
  open: boolean
  onClose: () => void
  onCaptured: () => void
  initialSource?: string
  initialStatus?: string
}) {
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
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
    if (initialSource && !source) setSource(initialSource)
    if (initialStatus && !status) setStatus(initialStatus)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [open, onClose, initialSource, initialStatus, source, status])

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
      )
    )
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

  const submit = async (event: Event) => {
    event.preventDefault()
    if (!source.trim() && !file) return
    setSaving(true)
    setStatus('Saving source…')
    try {
      const artifact = file ? await uploadArtifact(file) : null
      const result = await api<any>('/capture', {
        method: 'POST',
        body: JSON.stringify({ source: file?.name || source.trim(), artifact_id: artifact?.id }),
      })
      setStatus(result?.duplicate ? 'Source already exists. Existing record preserved.' : 'Source saved.')
      setSource('')
      setFile(null)
      onCaptured()
      window.setTimeout(onClose, 650)
    } catch (error: any) {
      setStatus(error?.message || 'Capture failed. Input preserved.')
      setSaving(false)
    }
  }

  return (
    <div
      class="dialog-layer capture-dialog-layer"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        class="dialog capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        onKeyDown={trapFocus}
      >
        <header class="capture-dialog-head">
          <div class="capture-dialog-heading">
            <span class="folio-object-kicker">Quick Capture</span>
            <h2 id="capture-title">Save source</h2>
          </div>
          <button type="button" class="capture-close-btn" onClick={onClose} aria-label="Close capture dialog">
            <Icon name="close" size={16} />
          </button>
        </header>

        <p class="capture-dialog-lede">
          URLs, articles, books, videos, and raw text become source records you can open, organize, or commit to Queue.
        </p>

        <form class="capture-dialog-form" onSubmit={submit}>
          <div class="capture-input-group">
            <label for="capture-source-input" class="capture-label">
              <span>Link, Title, or Idea</span>
            </label>
            <textarea
              id="capture-source-input"
              class="capture-textarea"
              autoFocus
              value={source}
              onInput={(event) => setSource((event.target as HTMLTextAreaElement).value)}
              placeholder="Paste a URL (YouTube, article, paper, book), title, or note…"
              rows={4}
            />
          </div>

          <div class="capture-file-zone">
            <input
              ref={fileInputRef}
              id="capture-file-input"
              type="file"
              class="capture-file-hidden"
              onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] || null)}
            />
            {file ? (
              <div class="capture-file-selected">
                <div class="capture-file-info">
                  <Icon name="file" size={16} />
                  <strong>{file.name}</strong>
                  <small>({Math.round(file.size / 1024)} KB)</small>
                </div>
                <button
                  type="button"
                  class="capture-file-remove"
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  aria-label="Remove attached file"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ) : (
              <label for="capture-file-input" class="capture-file-label">
                <Icon name="file" size={18} />
                <div class="capture-file-label-text">
                  <strong>Attach local file or document</strong>
                  <small>PDF, EPUB, HTML, audio, or text stored in R2 and linked to source</small>
                </div>
              </label>
            )}
          </div>

          {status && (
            <output class="capture-status-banner" aria-live="polite">
              {status}
            </output>
          )}

          <footer class="capture-dialog-footer">
            <button type="button" class="button secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              class="button primary folio-primary"
              disabled={(!source.trim() && !file) || saving}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save source'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
