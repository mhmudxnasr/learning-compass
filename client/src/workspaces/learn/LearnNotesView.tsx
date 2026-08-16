import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { useData } from '../../app/useData'
import { objectHref, routeHref } from '../../app/router'
import { directionValue, formatDate, noteHref } from './helpers'
import { Direction, NoteRecord, NotesResponse } from './types'

export function LearnNotesView({ noteId }: { noteId?: string }) {
  const notes = useData<NotesResponse>('/notes')
  if (notes.loading && !notes.data) return <Loading label="Loading notes" />
  if (notes.error && !notes.data) return <ErrorState message={notes.error} retry={notes.reload} />
  const note = notes.data?.notes.find((item) => item.id === noteId)
  if (noteId) return <NoteEditor note={note} onBack={() => { location.hash = routeHref('learn', 'practice', 'notes').slice(1) }} onSaved={notes.reload} />
  // Reflections remain attached to the source record and its activity surface;
  // the Learn library is the editable extracted-note shelf, so keep that
  // personal margin layer out of this collection even though /notes is the
  // canonical combined read model.
  const libraryNotes = (notes.data?.notes || []).filter((item) => item.kind !== 'reflection')
  return <NotesBrowser notes={libraryNotes} reload={notes.reload} />
}
function NotesBrowser({ notes, reload }: { notes: NoteRecord[]; reload: () => void }) {
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [working, setWorking] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const filtered = notes.filter((note) => {
    const haystack = `${note.title} ${note.kind || ''} ${(note.sections || []).map((section) => section.content).join(' ')}`.toLowerCase()
    return !query.trim() || haystack.includes(query.trim().toLowerCase())
  })

  const createNote = async (event: Event) => {
    event.preventDefault()
    if (!title.trim()) return
    setWorking(true)
    setMessage('Creating note…')
    try {
      const result = await api<{ id: string }>('/notes', { method: 'POST', body: JSON.stringify({ title: title.trim(), kind: 'note', sections: [{ section_key: 'body', label: 'Notes', content: '', direction: 'auto' }] }) })
      setTitle('')
      setCreateOpen(false)
      location.hash = objectHref('learn', 'note', result.id).slice(1)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The note could not be created.')
    } finally {
      setWorking(false)
    }
  }

  const deleteNote = async (note: NoteRecord) => {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return
    setDeletingId(note.id)
    setMessage('Deleting note…')
    try {
      await api(`/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' })
      setMessage('Note deleted.')
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The note could not be deleted.')
    } finally {
      setDeletingId(null)
    }
  }

  return <section class="learn-workspace folio-learn folio-notes" aria-labelledby="notes-title">
    <header class="learn-surface-head folio-surface-head"><div><p class="folio-object-kicker">Learn / Notes</p><h1 id="notes-title">Notes are the readable layer.</h1><p class="folio-lede">Read the extracted structure, then make your own synthesis explicit. Every section keeps its English or Egyptian-Arabic direction.</p></div><button class="button primary folio-primary" type="button" onClick={() => { setCreateOpen((open) => !open); setMessage('') }} aria-expanded={createOpen} aria-controls="new-note-form">{createOpen ? 'Close' : 'New note'}</button></header>
    {message && <output class="folio-status" aria-live="polite">{message}</output>}
    {createOpen && <form id="new-note-form" class="folio-inline-form" onSubmit={createNote}><label>Note title<input value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} required /></label><button class="button primary folio-primary" type="submit" disabled={working || !title.trim()}>{working ? 'Creating…' : 'Create note'}</button></form>}
    <div class="folio-notes-toolbar"><label class="folio-search-field">Find in notes<input type="search" value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} /></label><span class="folio-measure">{filtered.length} of {notes.length}</span></div>
    {filtered.length ? <ol class="folio-object-ledger folio-notes-ledger">{filtered.map((note) => <NoteRow key={note.id} note={note} onDelete={() => deleteNote(note)} deleting={deletingId === note.id} />)}</ol> : <Empty title={notes.length ? 'No notes match that search' : 'No structured notes yet'} body={notes.length ? 'Try a title, section heading, or a phrase from the note body.' : 'Source notes appear here after a completed source has been extracted. You can also start a private note from this view.'} action={notes.length ? undefined : <button class="button primary folio-primary" type="button" onClick={() => setCreateOpen(true)}>Create a note</button>} />}
  </section>
}

function NoteRow({ note, onDelete, deleting }: { note: NoteRecord; onDelete: () => void; deleting: boolean }) {
  const preview = (note.sections || []).map((section) => section.content).join(' ').trim()
  return <li class="folio-object-row folio-note-row"><a href={noteHref(note.id)} aria-label={`Open note ${note.title}`}><span class="folio-row-mark folio-mark-note" aria-hidden="true" /><span class="folio-row-main"><span class="folio-row-type">{note.kind || 'Note'} · {note.status || 'draft'}</span><strong>{note.title}</strong><span class="folio-row-detail">{preview ? `${preview.slice(0, 190)}${preview.length > 190 ? '…' : ''}` : 'Empty note; open to write the first section.'}</span></span><span class="folio-row-tail"><span>{note.sections?.length || 0} sections</span><small>{formatDate(note.updated_at)}</small></span><span class="folio-row-chevron" aria-hidden="true">→</span></a><button class="folio-note-delete" type="button" onClick={onDelete} disabled={deleting} aria-label={`Delete note ${note.title}`}>{deleting ? 'Deleting…' : 'Delete'}</button></li>
}

function plainTextParagraphs(note: NoteRecord): string[] {
  const content = (note.sections || []).map((section) => section.content || '').join('\n\n')
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*-{4,}\s*$/gm, '')
      .replace(/\*\*|==|`/g, '')
      .replace(/\n+/g, ' ')
      .trim())
    .filter(Boolean)
}

function directionForText(text: string): 'ltr' | 'rtl' {
  return /[\u0590-\u08ff]/.test(text) ? 'rtl' : 'ltr'
}

function NoteReader({ note, onEdit, onGenerate, generating }: { note: NoteRecord; onEdit: () => void; onGenerate: () => void; generating: boolean }) {
  const paragraphs = plainTextParagraphs(note)
  return <article class="folio-reading-shell">
    <header class="folio-reading-header">
      <p class="folio-object-kicker">Personal field note</p>
      <h1>{note.title}</h1>
      <div class="folio-note-meta"><span>{formatDate(note.updated_at)}</span>{note.source_url && <a href={note.source_url} target="_blank" rel="noreferrer">Open source ↗</a>}</div>
    </header>
    <div class="folio-reading-body">
      {paragraphs.length ? paragraphs.map((paragraph, index) => <p key={index} dir={directionForText(paragraph)}>{paragraph}</p>) : <Empty title="This note has no content" body="Switch to edit mode to start writing." />}
    </div>
    <footer class="folio-reading-footer">
      <button class="button secondary" type="button" onClick={onGenerate} disabled={generating}>{generating ? 'Generating recall…' : 'Generate recall cards'}</button>
      <button class="button primary folio-primary" type="button" onClick={onEdit}>Edit note</button>
    </footer>
  </article>
}

function NoteEditor({ note, onBack, onSaved }: { note?: NoteRecord; onBack: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<NoteRecord | null>(null)
  const [working, setWorking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (note && (!draft || draft.id !== note.id)) setDraft({ ...note, sections: (note.sections || []).map((section) => ({ ...section })) })
  }, [note?.id, note?.updated_at])

  if (!note) return <Empty title="Note not found" body="This note may have been removed, or the link may not include a valid note ID." action={<button class="button secondary" type="button" onClick={onBack}>Back to Notes</button>} />
  if (!draft) return <Loading label="Opening note" />

  const generateRecall = async () => {
    if (!draft) return
    setGenerating(true)
    setMessage('Generating smart recall cards with Gemini Flash Lite…')
    try {
      const res = await api<{ ok: boolean; count: number; message?: string }>('/learning/srs/generate', {
        method: 'POST',
        body: JSON.stringify({
          note_id: draft.id,
          topic: draft.title,
          branch: (draft as any).branch_id || 'General'
        })
      })
      if (res.count > 0) {
        setMessage(`Generated ${res.count} recall cards in Learn / Recall drafts.`)
      } else {
        setMessage(res.message || 'No atomic recall cards extracted for this note.')
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Recall generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  if (!editing) return <section class="learn-workspace folio-learn folio-note-reading" aria-labelledby="note-reading-title">
    <header class="folio-editor-head folio-reading-toolbar"><button class="folio-back-link" type="button" onClick={onBack}>← Notes</button><div class="folio-editor-actions"><button class="button secondary" type="button" onClick={generateRecall} disabled={generating}>{generating ? 'Generating…' : 'Generate cards'}</button><button class="button primary folio-primary" type="button" onClick={() => setEditing(true)}>Edit note</button></div></header>
    {message && <output class="folio-status" aria-live="polite">{message}</output>}
    <NoteReader note={draft} onEdit={() => setEditing(true)} onGenerate={generateRecall} generating={generating} />
  </section>

  const updateSection = (sectionKey: string, patch: Partial<{ content: string; direction: Direction }>) => setDraft((current) => current ? { ...current, sections: current.sections.map((section) => section.section_key === sectionKey ? { ...section, ...patch } : section) } : current)
  const save = async (event: Event) => {
    event.preventDefault()
    setWorking(true)
    setMessage('Saving note…')
    try {
      await api(`/notes/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: JSON.stringify({ title: draft.title.trim(), sections: draft.sections.map((section) => ({ section_key: section.section_key, content: section.content, direction: directionValue(section.direction) })) }) })
      setMessage('Saved.')
      onSaved()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The note could not be saved.')
    } finally {
      setWorking(false)
    }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${draft.title}”?`)) return
    setWorking(true)
    setMessage('Deleting note…')
    try {
      await api(`/notes/${encodeURIComponent(draft.id)}`, { method: 'DELETE' })
      onBack()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The note could not be deleted.')
      setWorking(false)
    }
  }

  return <section class="learn-workspace folio-learn folio-note-editor" aria-labelledby="note-editor-title">
    <header class="folio-editor-head"><button class="folio-back-link" type="button" onClick={onBack}>← Notes</button><div class="folio-editor-actions"><button class="button secondary" type="button" onClick={generateRecall} disabled={generating || working}>{generating ? 'Generating…' : 'Generate cards'}</button><button class="button quiet" type="button" onClick={remove} disabled={working}>Delete</button><button class="button primary folio-primary" type="submit" form="note-editor-form" disabled={working}>{working ? 'Saving…' : 'Save note'}</button></div></header>
    {message && <output class="folio-status" aria-live="polite">{message}</output>}
    <form id="note-editor-form" class="folio-note-document" onSubmit={save}><label class="folio-note-title-label">Note title<input id="note-editor-title" value={draft.title} onInput={(event) => setDraft({ ...draft, title: (event.target as HTMLInputElement).value })} required /></label><div class="folio-note-meta"><span>{draft.kind || 'Note'}</span><span>{draft.status || 'draft'}</span><span>Updated {formatDate(draft.updated_at)}</span>{draft.source_url && <a href={draft.source_url} target="_blank" rel="noreferrer">Source ↗</a>}</div><div class="folio-note-sections">{draft.sections.length ? draft.sections.map((section) => <section class="folio-note-section" key={section.section_key} aria-labelledby={`section-title-${section.section_key}`}><div class="folio-note-section-head"><h2 id={`section-title-${section.section_key}`}>{section.label || section.section_key}</h2><label>Direction<select value={directionValue(section.direction)} onChange={(event) => updateSection(section.section_key, { direction: (event.target as HTMLSelectElement).value as Direction })}><option value="auto">Auto</option><option value="ltr">English / LTR</option><option value="rtl">Egyptian Arabic / RTL</option></select></label></div><textarea class="folio-note-textarea" value={section.content} dir={directionValue(section.direction)} onInput={(event) => updateSection(section.section_key, { content: (event.target as HTMLTextAreaElement).value })} aria-label={`${section.label || section.section_key} content`} /></section>) : <Empty title="This note has no sections" body="The note record exists, but it has no editable section content." />}</div></form>
  </section>
}
