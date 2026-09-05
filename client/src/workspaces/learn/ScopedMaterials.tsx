import type { ComponentChildren } from 'preact'
import { useId, useRef, useState } from 'preact/hooks'
import { api, ApiError } from '../../api'
import { uploadArtifact } from '../../app/upload'
import { objectHref, routeHref } from '../../app/router'
import { Icon, type IconName } from '../../components/Icon'
import { cardHref, formatDate, noteHref } from './helpers'
import type { LearningOwnerScope, NoteRecord, PathArtifact, RecallCard, RecallDraft } from './types'

type MaterialKind = 'note' | 'file' | 'card'
type Props = {
  scope: LearningOwnerScope
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  drafts: RecallDraft[]
  onChanged: () => void
  showTitle?: boolean
}

const materialTypes: { kind: MaterialKind; label: string; icon: IconName; description: string }[] = [
  { kind: 'note', label: 'Notes', icon: 'note', description: 'Capture an idea in your own words.' },
  { kind: 'file', label: 'Files', icon: 'file', description: 'Keep a document or reference close at hand.' },
  {
    kind: 'card',
    label: 'Recall',
    icon: 'recall',
    description: 'Write a question and answer in Arabic to revisit later.',
  },
]

export function ScopedMaterials(props: Props) {
  // Editors belong to one exact owner, including when navigating between Levels.
  return <MaterialWorkspace key={`${props.scope.kind}:${props.scope.id}`} {...props} />
}

function MaterialWorkspace({ scope, notes, files, cards, drafts, onChanged, showTitle = true }: Props) {
  const [active, setActive] = useState<MaterialKind>(
    notes.length ? 'note' : files.length ? 'file' : cards.length || drafts.length ? 'card' : 'note',
  )
  const id = useId()
  const counts = { note: notes.length, file: files.length, card: cards.length + drafts.length }
  const scopeBody =
    scope.kind === 'lesson'
      ? { lesson_id: scope.id }
      : scope.kind === 'level'
        ? { stage_id: scope.id }
        : { thread_id: scope.id }

  const createMaterial = async (kind: MaterialKind, form: HTMLFormElement) => {
    const values = new FormData(form)
    const requiredText = (name: string, label: string) => {
      const value = String(values.get(name) || '').trim()
      if (!value) throw new Error(`Enter ${label}.`)
      return value
    }
    if (kind === 'file') {
      const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0]
      if (!file) throw new Error('Choose a file to upload.')
      await uploadArtifact(file, { ...scopeBody, scope: scope.kind, scope_title: scope.title })
    } else if (kind === 'note') {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({
          ...scopeBody,
          title: requiredText('title', 'a note title'),
          status: 'active',
          sections: [
            { section_key: 'body', label: 'Notes', content: requiredText('content', 'your note'), direction: 'auto' },
          ],
        }),
      })
    } else {
      await api('/learning/srs/create', {
        method: 'POST',
        body: JSON.stringify({
          ...scopeBody,
          question: requiredText('question', 'a question'),
          answer: requiredText('answer', 'an answer'),
          topic: scope.title,
        }),
      })
    }
  }

  const moveTab = (event: KeyboardEvent, kind: MaterialKind) => {
    const index = materialTypes.findIndex((type) => type.kind === kind)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 2
          : event.key === 'ArrowRight'
            ? (index + 1) % 3
            : event.key === 'ArrowLeft'
              ? (index + 2) % 3
              : -1
    if (next < 0) return
    event.preventDefault()
    setActive(materialTypes[next].kind)
    document.getElementById(`${id}-tab-${materialTypes[next].kind}`)?.focus()
  }

  return (
    <section class="learning-scope-workspace" aria-label={`${scope.title} materials`}>
      {showTitle && (
        <div class="learning-material-heading">
          <h3 dir="auto">{scope.title}</h3>
        </div>
      )}
      <p class="learning-material-context">Saved to this {scope.kind === 'thread' ? 'Thread' : scope.kind}.</p>
      <div class="learning-material-tabs" role="tablist" aria-label="Material type">
        {materialTypes.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            role="tab"
            id={`${id}-tab-${kind}`}
            aria-controls={`${id}-panel-${kind}`}
            aria-selected={active === kind}
            tabIndex={active === kind ? 0 : -1}
            onClick={() => setActive(kind)}
            onKeyDown={(event) => moveTab(event, kind)}
          >
            {label}
            <span class="learning-material-count">{counts[kind]}</span>
          </button>
        ))}
      </div>
      {materialTypes.map(({ kind, label, icon, description }) => (
        <section
          key={kind}
          class="learning-material-panel"
          id={`${id}-panel-${kind}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${kind}`}
          hidden={active !== kind}
          tabIndex={0}
        >
          <MaterialEditor
            kind={kind}
            description={description}
            scopeKind={scope.kind}
            onSave={(form) => createMaterial(kind, form)}
            onChanged={onChanged}
          >
            {counts[kind] === 0 && (
              <div class="learning-material-empty">
                <Icon name={icon} size={22} />
                <p>No {kind === 'card' ? 'recall cards' : label.toLowerCase()} yet.</p>
              </div>
            )}
            {kind === 'note' &&
              notes.map((note) => (
                <a class="learning-material-row" href={noteHref(note.id)} key={note.id}>
                  <Icon name="note" size={16} />
                  <span>
                    <strong dir="auto">{note.title}</strong>
                    <small dir="auto">{note.sections?.[0]?.content || 'Open note'}</small>
                  </span>
                  <Icon name="chevron" size={14} />
                </a>
              ))}
            {kind === 'file' &&
              files.map((file) => (
                <a class="learning-material-row" href={objectHref('library', 'artifact', file.id)} key={file.id}>
                  <Icon name="file" size={16} />
                  <span>
                    <strong dir="auto">{file.filename}</strong>
                    <small>{file.media_type || 'Stored file'}</small>
                  </span>
                  <Icon name="chevron" size={14} />
                </a>
              ))}
            {kind === 'card' && (
              <>
                {cards.map((card) => (
                  <a class="learning-material-row" href={cardHref(card.id)} key={card.id}>
                    <Icon name="recall" size={16} />
                    <span>
                      <strong lang="ar" dir="rtl">
                        {card.question}
                      </strong>
                      <small>Due {card.due_at ? formatDate(card.due_at) : 'now'}</small>
                    </span>
                    <Icon name="chevron" size={14} />
                  </a>
                ))}
                {drafts.length > 0 && (
                  <p class="learning-material-drafts">
                    {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} awaiting approval.{' '}
                    <a href={routeHref('learn', 'practice', 'recall')}>Open Recall</a> and choose Drafts.
                  </p>
                )}
                {drafts.map((draft) => (
                  <div class="learning-material-row is-draft" key={draft.id}>
                    <Icon name="clock" size={16} />
                    <span>
                      <strong lang="ar" dir="rtl">
                        {draft.question}
                      </strong>
                      <small>Draft · not scheduled for review</small>
                    </span>
                  </div>
                ))}
              </>
            )}
          </MaterialEditor>
        </section>
      ))}
    </section>
  )
}

function MaterialEditor({
  kind,
  description,
  scopeKind,
  onSave,
  onChanged,
  children,
}: {
  kind: MaterialKind
  description: string
  scopeKind: LearningOwnerScope['kind']
  onSave: (form: HTMLFormElement) => Promise<void>
  onChanged: () => void
  children: ComponentChildren
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const savedLabel = kind === 'note' ? 'Note' : kind === 'file' ? 'File' : 'Recall card'
  const submit = async (event: Event) => {
    event.preventDefault()
    if (busy.current) return
    const form = event.currentTarget as HTMLFormElement
    busy.current = true
    setError('')
    setMessage('')
    // Read FormData before the disabled fieldset removes its controls from it.
    const request = onSave(form)
    setSaving(true)
    try {
      await request
      form.reset()
      setOpen(false)
      setMessage(`${savedLabel} saved to this ${scopeKind === 'thread' ? 'Thread' : scopeKind}.`)
      onChanged()
    } catch (reason) {
      if (reason instanceof ApiError && reason.offlineQueued) {
        form.reset()
        setOpen(false)
        setMessage(`${savedLabel} queued for sync. Refresh after syncing to see it here; no need to submit it again.`)
      } else {
        setError(
          reason instanceof ApiError
            ? reason.body?.message || reason.message
            : reason instanceof Error
              ? reason.message
              : 'Could not save. Try again.',
        )
      }
    } finally {
      busy.current = false
      setSaving(false)
      requestAnimationFrame(() => {
        if (formRef.current?.hidden) addRef.current?.focus()
      })
    }
  }

  return (
    <>
      <div class="learning-material-toolbar">
        <p>{description}</p>
        <button
          ref={addRef}
          class="button secondary"
          type="button"
          hidden={open}
          onClick={() => {
            setOpen(true)
            setMessage('')
            requestAnimationFrame(() => {
              const form = formRef.current
              // Do not steal focus if the learner has already entered a field.
              if (form && !form.hidden && !form.contains(document.activeElement)) form.querySelector('input')?.focus()
            })
          }}
        >
          <Icon name="capture" size={15} />
          Add {kind}
        </button>
      </div>
      <form
        ref={formRef}
        class="learning-material-form"
        hidden={!open}
        onSubmit={submit}
        aria-label={`Add ${kind}`}
        aria-busy={saving}
      >
        <fieldset disabled={saving}>
          <legend>Add {kind}</legend>
          {kind === 'note' ? (
            <>
              <label>
                Title
                <input name="title" aria-label="Note title" placeholder="Give this idea a title" dir="auto" required />
              </label>
              <label>
                Note
                <textarea
                  name="content"
                  aria-label="Note body"
                  placeholder="What do you want to remember?"
                  dir="auto"
                  rows={5}
                  required
                />
              </label>
            </>
          ) : kind === 'file' ? (
            <label>
              Choose file
              <input type="file" name="file" required />
            </label>
          ) : (
            <>
              <label>
                Question in Arabic
                <input name="question" aria-label="Recall question in Arabic" lang="ar" dir="rtl" required />
              </label>
              <label>
                Answer in Arabic
                <textarea name="answer" aria-label="Recall answer in Arabic" lang="ar" dir="rtl" rows={4} required />
              </label>
            </>
          )}
          {error && (
            <p class="learning-material-error" role="alert">
              {error}
            </p>
          )}
          <div class="learning-material-form-actions">
            <button class="button" type="submit">
              {saving
                ? kind === 'file'
                  ? 'Uploading…'
                  : 'Saving…'
                : kind === 'file'
                  ? 'Upload file'
                  : kind === 'note'
                    ? 'Save note'
                    : 'Create card'}
            </button>
            <button
              class="button secondary"
              type="button"
              onClick={() => {
                formRef.current?.reset()
                setOpen(false)
                setError('')
                requestAnimationFrame(() => addRef.current?.focus())
              }}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
      {message && (
        <p class="learning-material-status" role="status">
          {message}
        </p>
      )}
      {!open && children}
    </>
  )
}
