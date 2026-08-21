import { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { objectHref, routeHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { buildNoteReaderDocument, directionForText, NoteReaderBlock } from './noteReader'
import { Direction, NoteDossierResponse, NoteRecord, NotesResponse } from './types'
import { directionValue, formatDate, noteHref } from './helpers'

type NoteFilter = 'all' | 'source' | 'personal' | 'reflection'

type NoteGroup = {
  key: string
  primary: NoteRecord
  notes: NoteRecord[]
  words: number
  kinds: Set<string>
}

export function LearnNotesView({ noteId }: { noteId?: string }) {
  const notes = useData<NotesResponse>('/notes')
  if (noteId) return <NoteDetailWorkspace noteId={noteId} allNotes={notes.data?.notes || []} reloadLibrary={notes.reload} />
  if (notes.loading && !notes.data) return <Loading label="Loading notes" />
  if (notes.error && !notes.data) return <ErrorState message={notes.error} retry={notes.reload} />
  return <NotesIndex notes={notes.data?.notes || []} reload={notes.reload} />
}

function noteWords(note: NoteRecord) {
  return (note.sections || []).reduce((total, section) => total + (section.content.match(/[\p{L}\p{N}]+/gu)?.length || 0), 0)
}

function groupNotes(notes: NoteRecord[]): NoteGroup[] {
  const grouped = new Map<string, NoteRecord[]>()
  for (const note of notes) {
    const key = note.recommendation_id ? `source:${note.recommendation_id}` : `note:${note.id}`
    grouped.set(key, [...(grouped.get(key) || []), note])
  }
  return [...grouped.entries()].map(([key, items]) => {
    const primary = items.find((item) => item.kind === 'guide') || items.find((item) => item.kind !== 'reflection') || items[0]
    return { key, primary, notes: items, words: items.reduce((total, item) => total + noteWords(item), 0), kinds: new Set(items.map((item) => item.kind || 'note')) }
  }).sort((a, b) => String(b.primary.updated_at || '').localeCompare(String(a.primary.updated_at || '')))
}

function NotesIndex({ notes, reload }: { notes: NoteRecord[]; reload: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const groups = useMemo(() => groupNotes(notes), [notes])
  const branches = useMemo(() => [...new Set(notes.map((note) => note.branch_label || note.branch_id).filter(Boolean) as string[])].sort(), [notes])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return groups.filter((group) => {
      if (filter === 'source' && !group.kinds.has('guide')) return false
      if (filter === 'personal' && group.primary.recommendation_id) return false
      if (filter === 'reflection' && !group.kinds.has('reflection')) return false
      if (!needle) return true
      return group.notes.some((note) => `${note.title} ${note.branch_label || note.branch_id || ''} ${note.abstract || ''} ${(note.sections || []).map((section) => section.content).join(' ')}`.toLowerCase().includes(needle))
    })
  }, [groups, filter, query])

  const createNote = async (event: Event) => {
    event.preventDefault()
    if (!newTitle.trim()) return
    setWorking(true)
    setMessage('Creating note…')
    try {
      const result = await api<{ id: string }>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          kind: 'note',
          branch_id: newBranch.trim() || undefined,
          sections: [{ section_key: 'body', label: 'Note', content: '', direction: 'auto' }],
        }),
      })
      setNewTitle('')
      setNewBranch('')
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

  return (
    <section class="learn-notes-vault folio-notes" aria-labelledby="notes-title">
      <header class="notes-index-head">
        <div>
          <p class="folio-object-kicker">Learn / Notes</p>
          <h1 id="notes-title">Notes</h1>
          <p class="folio-lede">One source record, one readable synthesis, with your reflection and retained ideas kept beside it.</p>
        </div>
        <button class="button primary" type="button" onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen}>
          <Icon name={createOpen ? 'close' : 'edit'} size={15} />
          {createOpen ? 'Cancel' : 'New note'}
        </button>
      </header>

      {message && <output class="folio-status" aria-live="polite">{message}</output>}

      {createOpen && (
        <form class="notes-create-form" onSubmit={createNote}>
          <label>Title<input value={newTitle} onInput={(event) => setNewTitle((event.target as HTMLInputElement).value)} required autoFocus /></label>
          <label>Branch<input value={newBranch} onInput={(event) => setNewBranch((event.target as HTMLInputElement).value)} list="note-branches" placeholder="Optional" /></label>
          <datalist id="note-branches">{branches.map((branch) => <option key={branch} value={branch} />)}</datalist>
          <button class="button primary" type="submit" disabled={working || !newTitle.trim()}>{working ? 'Creating…' : 'Create'}</button>
        </form>
      )}

      <div class="notes-index-tools">
        <label class="notes-index-search"><Icon name="search" size={15} /><input type="search" value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search titles and note text" /></label>
        <label class="notes-index-filter">Show<select value={filter} onChange={(event) => setFilter((event.target as HTMLSelectElement).value as NoteFilter)}><option value="all">Everything</option><option value="source">Source notes</option><option value="personal">My notes</option><option value="reflection">With reflection</option></select></label>
        <span class="folio-measure">{visible.length} records</span>
      </div>

      {visible.length ? (
        <div class="notes-ledger" role="list">
          {visible.map((group) => {
            const note = group.primary
            const reflection = group.notes.find((item) => item.kind === 'reflection')
            const branch = note.branch_label || note.branch_id
            return (
              <article class="note-ledger-row" role="listitem" key={group.key}>
                <a href={noteHref(note.id)} class="note-ledger-main">
                  <span class="note-ledger-kind">{group.kinds.has('guide') ? 'Source' : reflection ? 'Reflection' : 'Note'}</span>
                  <span class="note-ledger-copy">
                    <strong dir={directionForText(note.title)}>{note.title}</strong>
                    <small>{[branch, group.kinds.has('guide') && reflection ? 'synthesis + reflection' : group.kinds.has('guide') ? 'synthesis' : reflection ? 'your reflection' : 'personal note'].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span class="note-ledger-measure">{Math.max(1, Math.ceil(group.words / 180))} min<br />{formatDate(note.updated_at)}</span>
                  <Icon name="chevron" size={15} />
                </a>
                <button class="button quiet note-ledger-delete" type="button" onClick={() => deleteNote(note)} disabled={deletingId === note.id} aria-label={`Delete ${note.title}`}><Icon name="trash" size={14} /></button>
              </article>
            )
          })}
        </div>
      ) : <Empty title={notes.length ? 'No notes match this view' : 'No notes yet'} body={notes.length ? 'Change the filter or search terms.' : 'Source synthesis and personal notes will appear here.'} />}
    </section>
  )
}

function inlineMarkdown(text: string): ComponentChildren[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*]+\*)/g
  return text.split(pattern).filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    return part
  })
}

function ReaderBlockComponent({ block }: { block: NoteReaderBlock }) {
  if (block.kind === 'heading') {
    const Tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
    return <Tag id={block.id} class={`reader-heading level-${block.level}`} dir={block.direction}>{inlineMarkdown(block.text)}</Tag>
  }
  if (block.kind === 'quote') return <blockquote class="reader-blockquote" dir={block.direction}>{inlineMarkdown(block.text)}</blockquote>
  if (block.kind === 'list') {
    const items = block.items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)
    return block.ordered ? <ol class="reader-list" dir={block.direction} start={block.start}>{items}</ol> : <ul class="reader-list" dir={block.direction}>{items}</ul>
  }
  return <p class="reader-paragraph" dir={block.direction}>{inlineMarkdown(block.text)}</p>
}

function NoteDetailWorkspace({ noteId, allNotes, reloadLibrary }: { noteId: string; allNotes: NoteRecord[]; reloadLibrary: () => void }) {
  const dossier = useData<NoteDossierResponse>(`/notes/${encodeURIComponent(noteId)}`)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  if (dossier.loading && !dossier.data) return <Loading label="Loading note" />
  if (dossier.error && !dossier.data) return <ErrorState message={dossier.error} retry={dossier.reload} />
  if (!dossier.data) return <Empty title="Note not found" body="This note is no longer available." />

  const { note, related_notes: relatedNotes, units, recall } = dossier.data
  const document = buildNoteReaderDocument(note)
  const sourceUrl = note.source_url || document.contentSourceUrl || note.rec_video_url || note.rec_source_url
  const reflection = note.kind === 'guide' ? relatedNotes.find((item) => item.kind === 'reflection') : null
  const sourceNote = note.kind === 'reflection' ? relatedNotes.find((item) => item.kind === 'guide') : null
  const reflectionDocument = reflection ? buildNoteReaderDocument(reflection) : null
  const draftUnits = new Set(recall.drafts.filter((item) => item.status === 'draft').map((item) => item.unit_id))
  const cardUnits = new Set(recall.cards.map((item) => item.unit_id))
  const currentIndex = allNotes.findIndex((item) => item.id === note.id)
  const prevNote = currentIndex > 0 ? allNotes[currentIndex - 1] : null
  const nextNote = currentIndex >= 0 && currentIndex < allNotes.length - 1 ? allNotes[currentIndex + 1] : null

  const goBack = () => { location.hash = routeHref('learn', 'practice', 'notes').slice(1) }

  const copyNote = async () => {
    const text = (note.sections || []).map((section) => `## ${section.label || section.section_key}\n\n${section.content}`).join('\n\n')
    try { await navigator.clipboard.writeText(`# ${note.title}\n\n${text}`); setMessage('Copied.') } catch { setMessage('Could not copy the note.') }
  }

  const reprocess = async () => {
    setWorking(true)
    setMessage('Queuing a fresh source extraction…')
    try { await api(`/notes/${encodeURIComponent(note.id)}/process`, { method: 'POST' }); setMessage('Fresh source extraction queued.') } catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Reprocessing failed.') } finally { setWorking(false) }
  }

  const remove = async () => {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return
    setWorking(true)
    try { await api(`/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' }); reloadLibrary(); goBack() } catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Delete failed.'); setWorking(false) }
  }

  if (editing) return <NoteEditor note={note} onCancel={() => setEditing(false)} onDelete={remove} onSaved={() => { setEditing(false); dossier.reload(); reloadLibrary(); setMessage('Saved.') }} />

  return (
    <section class="folio-note-reading note-reading-workspace">
      <header class="note-reading-actions">
        <button class="button quiet" type="button" onClick={goBack}>← Notes</button>
        <div>
          <button class="button quiet" type="button" onClick={copyNote}><Icon name="copy" size={14} />Copy</button>
          {note.kind === 'guide' && <button class="button quiet" type="button" onClick={reprocess} disabled={working}>Reprocess</button>}
          {sourceUrl && <a class="button quiet" href={sourceUrl} target="_blank" rel="noreferrer"><Icon name="external" size={13} />Source</a>}
          <button class="button primary" type="button" aria-label="Edit note" onClick={() => setEditing(true)}><Icon name="edit" size={14} />Edit</button>
        </div>
      </header>
      {message && <output class="folio-status" aria-live="polite">{message}</output>}

      <article class="folio-reading-body note-manuscript">
        <header class="note-manuscript-head">
          <p class="folio-object-kicker">{note.kind === 'guide' ? 'Source synthesis' : note.kind === 'reflection' ? 'My reflection' : 'Note'}</p>
          <h1 dir={directionForText(note.title)}>{note.title}</h1>
          <div class="note-manuscript-meta folio-note-meta"><span>{note.branch_label || note.branch_id || 'Unassigned'}</span><span>{document.readingMinutes} min</span><span>{document.wordCount.toLocaleString()} words</span><span>Updated {formatDate(note.updated_at)}</span>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Source</a>}</div>
          {note.abstract && <p class="note-abstract" dir={directionForText(note.abstract)}>{note.abstract}</p>}
        </header>

        {reflectionDocument && reflectionDocument.sections.length > 0 && (
          <section class="note-personal-reflection" aria-labelledby="personal-reflection-title">
            <h2 id="personal-reflection-title">My reflection</h2>
            <div class="folio-reading-copy">{reflectionDocument.sections.flatMap((section) => section.blocks).map((block, index) => <ReaderBlockComponent block={block} key={index} />)}</div>
          </section>
        )}

        <div class="folio-reading-copy note-source-body">
          {document.sections.length ? document.sections.map((section, sectionIndex) => (
            <section id={`section-${section.key}`} class="note-reading-section" key={section.key}>
              {(document.sections.length > 1 || (section.label && section.label.toLowerCase() !== note.title.toLowerCase())) && <h2 class="note-section-label">{section.label}</h2>}
              {section.blocks.map((block, blockIndex) => <ReaderBlockComponent block={block} key={blockIndex} />)}
            </section>
          )) : <Empty title="This note is empty" body="Edit the note to add content." />}
        </div>

        {sourceNote && <aside class="note-related-source"><span>Source synthesis</span><a href={noteHref(sourceNote.id)}>{sourceNote.title} →</a></aside>}

        {units.length > 0 && (
          <section class="note-retained-ideas" aria-labelledby="retained-ideas-title">
            <div class="note-section-heading"><div><p class="folio-object-kicker">Grounded in the source</p><h2 id="retained-ideas-title">Ideas worth keeping</h2></div><span class="folio-measure">{units.length}</span></div>
            <ol>
              {units.map((unit) => {
                const anchor = unit.anchors[0]
                const recallState = cardUnits.has(unit.id) ? 'In review' : draftUnits.has(unit.id) ? 'Draft waiting' : 'No card needed'
                return <li key={unit.id}><div><span class="note-unit-type">{unit.unit_type}</span><strong>{unit.statement}</strong></div><small>{anchor ? `${anchor.anchor_type}: ${anchor.locator}` : 'No source locator'} · {recallState}</small></li>
              })}
            </ol>
          </section>
        )}

        {(prevNote || nextNote) && <nav class="note-pagination" aria-label="Other notes">{prevNote ? <a href={noteHref(prevNote.id)}>← {prevNote.title}</a> : <span />}{nextNote && <a href={noteHref(nextNote.id)}>{nextNote.title} →</a>}</nav>}
      </article>
    </section>
  )
}

function NoteEditor({ note, onCancel, onDelete, onSaved }: { note: NoteRecord; onCancel: () => void; onDelete: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [branch, setBranch] = useState(note.branch_label || note.branch_id || '')
  const [sourceUrl, setSourceUrl] = useState(note.source_url || '')
  const [abstract, setAbstract] = useState(note.abstract || '')
  const [sections, setSections] = useState((note.sections || []).map((section) => ({ ...section, label: section.label || '', direction: directionValue(section.direction) })))
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const updateSection = (index: number, patch: Partial<{ label: string; content: string; direction: Direction }>) => setSections(sections.map((section, position) => position === index ? { ...section, ...patch } : section))
  const addSection = () => setSections([...sections, { section_key: `section_${Date.now()}`, label: '', content: '', direction: 'auto' }])

  const save = async (event: Event) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      await api(`/notes/${encodeURIComponent(note.id)}`, { method: 'PUT', body: JSON.stringify({ title: title.trim(), branch_id: branch.trim() || undefined, source_url: sourceUrl.trim() || undefined, abstract: abstract.trim() || undefined, sections }) })
      onSaved()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Save failed.')
    } finally { setWorking(false) }
  }

  return (
    <form class="note-editor folio-note-document" onSubmit={save}>
      <header><button class="button quiet" type="button" onClick={onCancel}>← Cancel</button><div><button class="button quiet danger-btn" type="button" onClick={onDelete}>Delete</button><button class="button primary" type="submit" disabled={working || !title.trim()}>{working ? 'Saving…' : 'Save'}</button></div></header>
      {error && <output class="notes-error-banner">{error}</output>}
      <main>
        <label>Title<input class="note-editor-title" value={title} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} required /></label>
        <div class="note-editor-meta"><label>Branch<input value={branch} onInput={(event) => setBranch((event.target as HTMLInputElement).value)} /></label><label>Source URL<input type="url" value={sourceUrl} onInput={(event) => setSourceUrl((event.target as HTMLInputElement).value)} /></label></div>
        {note.kind === 'guide' && <label>Short orientation<textarea rows={3} value={abstract} onInput={(event) => setAbstract((event.target as HTMLTextAreaElement).value)} /></label>}
        <div class="note-editor-section-head"><h2>Foundation</h2><button class="button secondary" type="button" onClick={addSection}>Add section</button></div>
        {sections.map((section, index) => <section class="note-editor-section" key={section.section_key}><div><input aria-label={`Section ${index + 1} label`} value={section.label || ''} onInput={(event) => updateSection(index, { label: (event.target as HTMLInputElement).value })} /><select aria-label={`Section ${index + 1} direction`} value={section.direction || 'auto'} onChange={(event) => updateSection(index, { direction: (event.target as HTMLSelectElement).value as Direction })}><option value="auto">Auto</option><option value="ltr">LTR</option><option value="rtl">RTL</option></select></div><textarea rows={12} dir={directionValue(section.direction)} value={section.content} onInput={(event) => updateSection(index, { content: (event.target as HTMLTextAreaElement).value })} /></section>)}
      </main>
    </form>
  )
}
