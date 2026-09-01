import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { api } from '../api'

export type ShareIntakeCompletionKind = 'capture' | 'anchor'

export type ShareIntake = {
  id: string
  kind: ShareIntakeCompletionKind | 'review'
  resolved_kind?: ShareIntakeCompletionKind | null
  effective_kind?: ShareIntakeCompletionKind | null
  title?: string | null
  shared_text?: string | null
  source_url?: string | null
  status: 'pending' | 'consumed'
  recommendation_id?: string | null
  annotation_id?: string | null
}

export function shareIntakeCompletionKind(intake: ShareIntake | null | undefined) {
  if (!intake) return null
  if (intake.effective_kind === 'capture' || intake.effective_kind === 'anchor') return intake.effective_kind
  if (intake.kind === 'capture' || intake.kind === 'anchor') return intake.kind
  return intake.resolved_kind === 'capture' || intake.resolved_kind === 'anchor' ? intake.resolved_kind : null
}

export function ShareIntakeReviewDialog({
  intake,
  onResolved,
  onDefer,
}: {
  intake: ShareIntake
  onResolved: (intake: ShareIntake) => void
  onDefer: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const [working, setWorking] = useState<ShareIntakeCompletionKind | ''>('')
  const [notice, setNotice] = useState('')

  useLayoutEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-share-choice]')?.focus()
  }, [intake.id])

  const resolve = async (kind: ShareIntakeCompletionKind) => {
    setWorking(kind)
    setNotice('')
    try {
      const payload = await api<{ intake: ShareIntake }>(
        `/api/share-intakes/${encodeURIComponent(intake.id)}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ kind }),
        },
      )
      onResolved(payload.intake)
    } catch (error: any) {
      if (error?.status === 409) {
        try {
          const current = await api<{ intake: ShareIntake }>(`/api/share-intakes/${encodeURIComponent(intake.id)}`)
          if (shareIntakeCompletionKind(current.intake)) {
            onResolved(current.intake)
            return
          }
        } catch {
          // Keep the original conflict visible if recovery cannot load current state.
        }
      }
      setNotice(
        error?.offlineQueued
          ? 'Your choice is saved for retry. This share will remain recoverable until it syncs.'
          : error?.message || 'The share choice could not be saved. Try again.',
      )
    } finally {
      setWorking('')
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !working) {
      event.preventDefault()
      onDefer()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') || [],
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

  return (
    <div class="dialog-layer share-intake-review-layer" role="presentation">
      <section
        ref={dialogRef}
        class="dialog share-intake-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-intake-review-title"
        aria-describedby="share-intake-review-help"
        aria-busy={Boolean(working)}
        onKeyDown={onKeyDown}
      >
        <header class="dialog-head">
          <div>
            <span>Saved Android share</span>
            <h2 id="share-intake-review-title">What did you mean to share?</h2>
          </div>
        </header>
        <div class="share-intake-review-body">
          <p id="share-intake-review-help">
            Android sent both a page address and some text. Choose explicitly so a page description is never mistaken
            for a selected passage.
          </p>
          <div class="share-intake-review-source">
            {intake.title && <strong>{intake.title}</strong>}
            {intake.source_url && (
              <a href={intake.source_url} target="_blank" rel="noreferrer">
                {intake.source_url}
              </a>
            )}
          </div>
          {intake.shared_text && <blockquote dir="auto">{intake.shared_text}</blockquote>}
          <div class="share-intake-review-options" aria-label="Share intent">
            <button
              data-share-choice
              type="button"
              class="share-intake-review-option"
              onClick={() => void resolve('capture')}
              disabled={Boolean(working)}
            >
              <strong>{working === 'capture' ? 'Opening Capture…' : 'Capture the whole source'}</strong>
              <span>Keep the page as a Library source after you choose its reviewed branch.</span>
            </button>
            <button
              type="button"
              class="share-intake-review-option"
              onClick={() => void resolve('anchor')}
              disabled={Boolean(working)}
            >
              <strong>{working === 'anchor' ? 'Opening anchor review…' : 'Save a selected passage'}</strong>
              <span>Treat the shared text as an exact quote anchored to this page.</span>
            </button>
          </div>
          {notice && (
            <p class="share-intake-review-notice" role="status">
              {notice}
            </p>
          )}
          <footer class="share-intake-review-actions">
            <button type="button" class="button secondary" onClick={onDefer} disabled={Boolean(working)}>
              Decide later
            </button>
            <small>The saved share will return after the app is reopened.</small>
          </footer>
        </div>
      </section>
    </div>
  )
}
