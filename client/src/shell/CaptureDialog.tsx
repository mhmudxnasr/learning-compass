import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { api } from '../api'
import { uploadArtifact } from '../app/upload'
import { Icon } from '../components/Icon'

export function CaptureDialog({ open, onClose, onCaptured, initialSource = '' }: { open: boolean; onClose: () => void; onCaptured: () => void; initialSource?: string }) {
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const dialogRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled])')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    if (initialSource && !source) setSource(initialSource)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [open, onClose, initialSource, source])

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
    setStatus('Capturing…')
    try {
      const artifact = file ? await uploadArtifact(file) : null
      const result = await api<any>('/capture', {
        method: 'POST',
        body: JSON.stringify({ source: file?.name || source.trim(), artifact_id: artifact?.id }),
      })
      setStatus(result?.duplicate ? 'Already captured. The existing source is safe.' : 'Captured to Queue.')
      setSource('')
      setFile(null)
      onCaptured()
      window.setTimeout(onClose, 650)
    } catch (error: any) {
      setStatus(error?.message || 'Capture failed. Your input is still here.')
    }
  }

  return (
    <div
      class="dialog-layer"
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
        <header>
          <div>
            <span>Global capture</span>
            <h2 id="capture-title">Capture a source.</h2>
          </div>
          <button class="icon-button" onClick={onClose} aria-label="Close capture">
            <Icon name="close" />
          </button>
        </header>
        <p>Links, text, and local files are captured directly to your learning queue.</p>
        <form onSubmit={submit}>
          <label>
            Link or text
            <textarea
              autoFocus
              value={source}
              onInput={(event) => setSource((event.target as HTMLTextAreaElement).value)}
              placeholder="Paste a URL, title, or idea…"
            />
          </label>
          <label class="file-drop">
            <input
              type="file"
              onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] || null)}
            />
            <Icon name="file" />
            <span>{file ? file.name : 'Choose a file'}</span>
            <small>Stored in R2 and linked to its learning source.</small>
          </label>
          <footer>
            <output aria-live="polite">{status}</output>
            <div>
              <button type="button" class="button secondary" onClick={onClose}>
                Cancel
              </button>
              <button class="button primary" disabled={!source.trim() && !file} type="submit">
                Capture to Queue
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
