import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { directionValue } from './helpers'
import { NoteBranchSelect } from './NoteBranchSelect'
import type { Direction, NoteRecord } from './types'

type NoteDraft = {
  title: string
  branch: string
  sourceUrl: string
  abstract: string
  sections: Array<{ section_key: string; label: string; content: string; direction: Direction }>
}
type StoredDraft = { baseUpdatedAt?: string | null; draft: NoteDraft }
// Keep route changes safe even when browser storage is full or disabled.
const sessionDrafts = new Map<string, StoredDraft | null>()
const draftKey = (id: string) => `learning-compass:note-draft:v1:${id}`

function loadDraft(id: string): StoredDraft | null {
  if (sessionDrafts.has(id)) return sessionDrafts.get(id) || null
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(id)) || 'null')
    const draft = saved?.draft
    if (
      draft &&
      ['title', 'branch', 'sourceUrl', 'abstract'].every((key) => typeof draft[key] === 'string') &&
      Array.isArray(draft.sections) &&
      draft.sections.every(
        (section: NoteDraft['sections'][number]) =>
          section &&
          ['section_key', 'label', 'content'].every(
            (key) => typeof section[key as keyof typeof section] === 'string',
          ) &&
          ['auto', 'ltr', 'rtl'].includes(section.direction),
      )
    )
      return saved
  } catch {
    // An unreadable cache must not prevent opening the canonical note.
  }
  return null
}

export const hasNoteDraft = (id: string) => Boolean(loadDraft(id))

export function NoteEditor({
  note,
  onCancel,
  onDelete,
  onSaved,
}: {
  note: NoteRecord
  onCancel: () => void
  onDelete: () => void
  onSaved: () => void
}) {
  const [initial] = useState(() => ({
    title: note.title,
    branch: note.branch_id || '',
    sourceUrl: note.source_url || note.rec_video_url || note.rec_source_url || '',
    abstract: note.abstract || '',
    sections: (note.sections || []).map((section) => ({
      section_key: section.section_key,
      label: section.label || '',
      content: section.content,
      direction: directionValue(section.direction),
    })),
  }))
  const [recovered] = useState(() => loadDraft(note.id))
  const [draft, setDraft] = useState<NoteDraft>(recovered?.draft || initial)
  const { title, branch, sourceUrl, abstract, sections } = draft
  const [storageFailed, setStorageFailed] = useState(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const changedSinceDraft = Boolean(recovered && recovered.baseUpdatedAt !== note.updated_at)
  const patch = (update: Partial<NoteDraft>) => setDraft((current) => ({ ...current, ...update }))
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    titleInput.current?.focus()
  }, [])
  useLayoutEffect(() => {
    const saved = dirty ? { baseUpdatedAt: recovered?.baseUpdatedAt ?? note.updated_at, draft } : null
    sessionDrafts.set(note.id, saved)
    try {
      if (saved) localStorage.setItem(draftKey(note.id), JSON.stringify(saved))
      else localStorage.removeItem(draftKey(note.id))
      setStorageFailed(false)
    } catch {
      setStorageFailed(true)
    }
  }, [draft, dirty, note.id, note.updated_at, recovered])
  useEffect(() => {
    if (!dirty || !storageFailed) return
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [dirty, storageFailed])

  const clearDraft = () => {
    sessionDrafts.set(note.id, null)
    try {
      localStorage.removeItem(draftKey(note.id))
    } catch {
      /* The in-memory tombstone wins for this session. */
    }
  }

  const updateSection = (index: number, patch: Partial<{ label: string; content: string; direction: Direction }>) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, position) => (position === index ? { ...section, ...patch } : section)),
    }))
  const addSection = () =>
    patch({
      sections: [...sections, { section_key: `section_${Date.now()}`, label: '', content: '', direction: 'auto' }],
    })

  const save = async (event: Event) => {
    event.preventDefault()
    if (working) return
    if (
      changedSinceDraft &&
      !window.confirm('The saved note changed after this draft began. Replace it with the draft you reviewed?')
    )
      return
    setWorking(true)
    setError('')
    try {
      await api(`/notes/${encodeURIComponent(note.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          branch_id: branch.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
          abstract: abstract.trim() || undefined,
          sections,
        }),
      })
      clearDraft()
      onSaved()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Save failed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <form class="note-editor folio-note-document" onSubmit={save}>
      <header>
        <button
          class="button quiet"
          type="button"
          disabled={working}
          onClick={() => {
            clearDraft()
            onCancel()
          }}
        >
          ← Cancel
        </button>
        <div>
          <button class="button quiet danger-btn" type="button" onClick={onDelete} disabled={working}>
            Delete
          </button>
          <button class="button primary" type="submit" disabled={working || !title.trim()}>
            {working ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>
      <p role="status">
        {storageFailed
          ? 'Browser storage is unavailable. Keep this tab open and Save before closing it.'
          : dirty
            ? `${recovered ? 'Recovered draft. ' : ''}Unsaved changes are kept on this browser. Save updates the note; Cancel discards this draft.`
            : 'Changes stay as a draft on this browser until you Save. Cancel discards the draft.'}
      </p>
      {changedSinceDraft && (
        <p class="notes-error-banner">
          The saved note changed after this draft began. Review your draft before saving over it.
        </p>
      )}
      {error && <output class="notes-error-banner">{error}</output>}
      <section aria-label="Note editor">
        <label>
          Title
          <input
            class="note-editor-title"
            ref={titleInput}
            value={title}
            onInput={(event) => patch({ title: (event.target as HTMLInputElement).value })}
            required
          />
        </label>
        <div class="note-editor-meta folio-note-meta">
          <NoteBranchSelect
            value={branch}
            label={note.branch_label}
            onChange={(branch) => patch({ branch })}
            allowEmpty={!note.branch_id}
          />
          <label>
            Source URL
            <input
              type="url"
              value={sourceUrl}
              onInput={(event) => patch({ sourceUrl: (event.target as HTMLInputElement).value })}
            />
          </label>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              Source
            </a>
          )}
        </div>
        {note.kind === 'guide' && (
          <label>
            Short orientation
            <textarea
              rows={3}
              value={abstract}
              onInput={(event) => patch({ abstract: (event.target as HTMLTextAreaElement).value })}
            />
          </label>
        )}
        <div class="note-editor-section-head">
          <h2>Sections</h2>
          <button class="button secondary" type="button" onClick={addSection}>
            Add section
          </button>
        </div>
        <p id="note-format-help">
          Write plain text, or use ## Heading, **bold**, *emphasis*, - lists, and &gt; quotations. Automatic direction
          follows each block; choose left to right for English or right to left for Arabic when needed.
        </p>
        {sections.map((section, index) => (
          <section class="note-editor-section" key={section.section_key}>
            <div>
              <input
                aria-label={`Section ${index + 1} label`}
                value={section.label || ''}
                onInput={(event) => updateSection(index, { label: (event.target as HTMLInputElement).value })}
              />
              <select
                aria-label={`Section ${index + 1} direction`}
                value={section.direction || 'auto'}
                onChange={(event) =>
                  updateSection(index, { direction: (event.target as HTMLSelectElement).value as Direction })
                }
              >
                <option value="auto">Automatic direction</option>
                <option value="ltr">Left to right (English)</option>
                <option value="rtl">Right to left (Arabic)</option>
              </select>
            </div>
            <textarea
              aria-label={`Section ${index + 1} content${section.label ? `: ${section.label}` : ''}`}
              aria-describedby="note-format-help"
              rows={12}
              dir={directionValue(section.direction)}
              value={section.content}
              onInput={(event) => updateSection(index, { content: (event.target as HTMLTextAreaElement).value })}
            />
          </section>
        ))}
      </section>
    </form>
  )
}
