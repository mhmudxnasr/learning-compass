import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { ItemParentLinks } from '../../components/ItemSections'
import { objectHref, routeHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { buildNoteReaderDocument, directionForText } from './noteReader'
import { ReaderBlockComponent } from './StudyText'
import { DistillationBlock, NoteDossierResponse, NoteRecord, NotesResponse } from './types'
import { formatDate, lessonHref, noteHref, threadHref } from './helpers'
import { NoteBranchSelect } from './NoteBranchSelect'
import { hasNoteDraft, NoteEditor } from './NoteEditor'

type NoteFilter = 'all' | 'source' | 'personal' | 'reflection'

type NoteGroup = {
  key: string
  primary: NoteRecord
  notes: NoteRecord[]
  readingMinutes: number
  kinds: Set<string>
}

export function LearnNotesView({ noteId }: { noteId?: string }) {
  const notes = useData<NotesResponse>('/notes')
  if (noteId)
    return (
      <NoteDetailWorkspace
        key={noteId}
        noteId={noteId}
        allNotes={notes.data?.notes || []}
        reloadLibrary={notes.reload}
      />
    )
  if (notes.loading && !notes.data) return <Loading label="Loading notes" />
  if (notes.error && !notes.data) return <ErrorState message={notes.error} retry={notes.reload} />
  return <NotesIndex notes={notes.data?.notes || []} reload={notes.reload} />
}

function groupNotes(notes: NoteRecord[]): NoteGroup[] {
  const grouped = new Map<string, NoteRecord[]>()
  for (const note of notes) {
    const key = note.recommendation_id ? `source:${note.recommendation_id}` : `note:${note.id}`
    grouped.set(key, [...(grouped.get(key) || []), note])
  }
  return [...grouped.entries()]
    .map(([key, items]) => {
      const primary =
        items.find((item) => item.kind === 'guide') || items.find((item) => item.kind !== 'reflection') || items[0]
      return {
        key,
        primary,
        notes: items,
        readingMinutes: buildNoteReaderDocument(primary).readingMinutes,
        kinds: new Set(items.map((item) => item.kind || 'note')),
      }
    })
    .sort((a, b) => String(b.primary.updated_at || '').localeCompare(String(a.primary.updated_at || '')))
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
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return groups.filter((group) => {
      if (filter === 'source' && !group.kinds.has('guide')) return false
      if (filter === 'personal' && group.primary.recommendation_id) return false
      if (filter === 'reflection' && !group.kinds.has('reflection')) return false
      if (!needle) return true
      return group.notes.some((note) =>
        `${note.title} ${note.branch_label || note.branch_id || ''} ${note.abstract || ''} ${(note.sections || []).map((section) => section.content).join(' ')}`
          .toLowerCase()
          .includes(needle),
      )
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
          <p class="folio-lede">
            One source record, one readable synthesis, with your reflection and retained ideas kept beside it.
          </p>
        </div>
        <button
          class="button primary"
          type="button"
          onClick={() => setCreateOpen((open) => !open)}
          aria-expanded={createOpen}
        >
          <Icon name={createOpen ? 'close' : 'edit'} size={15} />
          {createOpen ? 'Cancel' : 'New note'}
        </button>
      </header>

      {message && (
        <output class="folio-status" aria-live="polite">
          {message}
        </output>
      )}

      {createOpen && (
        <form class="notes-create-form" onSubmit={createNote}>
          <label>
            Title
            <input
              value={newTitle}
              onInput={(event) => setNewTitle((event.target as HTMLInputElement).value)}
              required
              autoFocus
            />
          </label>
          <NoteBranchSelect value={newBranch} onChange={setNewBranch} />
          <button class="button primary" type="submit" disabled={working || !newTitle.trim()}>
            {working ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      <div class="notes-index-tools">
        <label class="notes-index-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            aria-label="Search titles and note text"
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            placeholder="Search titles and note text"
          />
        </label>
        <label class="notes-index-filter">
          Show
          <select
            value={filter}
            onChange={(event) => setFilter((event.target as HTMLSelectElement).value as NoteFilter)}
          >
            <option value="all">Everything</option>
            <option value="source">Source notes</option>
            <option value="personal">My notes</option>
            <option value="reflection">With reflection</option>
          </select>
        </label>
        <span class="folio-measure">{visible.length} records</span>
      </div>

      {visible.length ? (
        <div class="notes-ledger" role="list">
          {visible.map((group) => {
            const note = group.primary
            const reflection = group.notes.find((item) => item.kind === 'reflection')
            const branch = note.branch_label || 'No branch assigned'
            return (
              <article class="note-ledger-row" role="listitem" key={group.key}>
                <a href={noteHref(note.id)} class="note-ledger-main">
                  <span class="note-ledger-kind">
                    {group.kinds.has('guide') ? 'Source' : reflection ? 'Reflection' : 'Note'}
                  </span>
                  <span class="note-ledger-copy">
                    <strong dir={directionForText(note.title)}>{note.title}</strong>
                    <small>
                      {[
                        branch,
                        group.kinds.has('guide') && reflection
                          ? 'synthesis + reflection'
                          : group.kinds.has('guide')
                            ? 'synthesis'
                            : reflection
                              ? 'your reflection'
                              : 'personal note',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                  <span class="note-ledger-measure">
                    {group.readingMinutes} min
                    <br />
                    {formatDate(note.updated_at)}
                  </span>
                  <Icon name="chevron" size={15} />
                </a>
                <button
                  class="button quiet note-ledger-delete"
                  type="button"
                  onClick={() => deleteNote(note)}
                  disabled={deletingId === note.id}
                  aria-label={`Delete ${note.title}`}
                >
                  <Icon name="trash" size={14} />
                </button>
              </article>
            )
          })}
        </div>
      ) : (
        <Empty
          title={notes.length ? 'No notes match this view' : 'No notes yet'}
          body={
            notes.length
              ? 'Change the filter or search terms.'
              : 'Source synthesis and personal notes will appear here.'
          }
        />
      )}
    </section>
  )
}

function NoteDetailWorkspace({
  noteId,
  allNotes,
  reloadLibrary,
}: {
  noteId: string
  allNotes: NoteRecord[]
  reloadLibrary: () => void
}) {
  const dossier = useData<NoteDossierResponse>(`/notes/${encodeURIComponent(noteId)}`)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)
  const [activeOutlineId, setActiveOutlineId] = useState('')
  const [contentsOpen, setContentsOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsElement = useRef<HTMLElement>(null)
  const toolsToggle = useRef<HTMLButtonElement>(null)
  const editToggle = useRef<HTMLButtonElement>(null)
  const returnToEdit = useRef(false)
  const [selectedBlock, setSelectedBlock] = useState('')
  const [claimText, setClaimText] = useState('')
  const [synthesisText, setSynthesisText] = useState('')

  useLayoutEffect(() => {
    if (toolsOpen) toolsElement.current?.focus()
  }, [toolsOpen])

  useLayoutEffect(() => {
    if (!editing && returnToEdit.current) {
      editToggle.current?.focus()
      returnToEdit.current = false
    }
  }, [editing])

  const openEditor = () => {
    setMessage('')
    setEditing(true)
  }
  const closeEditor = () => {
    returnToEdit.current = true
    setEditing(false)
  }

  const closeTools = () => {
    setToolsOpen(false)
    toolsToggle.current?.focus()
  }

  if (dossier.loading && !dossier.data) return <Loading label="Loading note" />
  if (dossier.error && !dossier.data) return <ErrorState message={dossier.error} retry={dossier.reload} />
  if (!dossier.data) return <Empty title="Note not found" body="This note is no longer available." />

  const { note, related_notes: relatedNotes, units, backlinks, recall, distillation } = dossier.data
  const document = buildNoteReaderDocument(note)
  const sourceUrl = note.source_url || document.contentSourceUrl || note.rec_video_url || note.rec_source_url
  const overviewTarget: {
    href: string
    kind: 'lesson' | 'thread' | 'book' | 'source' | 'external'
    title: string
  } | null =
    note.lesson_id && note.owner_thread_id
      ? { href: lessonHref(note.owner_thread_id, note.lesson_id), kind: 'lesson', title: 'Open lesson overview' }
      : note.thread_id
        ? { href: threadHref(note.thread_id), kind: 'thread', title: 'Open Thread overview' }
        : note.recommendation_id
          ? note.content_type === 'book'
            ? {
                href: objectHref('library', 'book', note.recommendation_id, 'books'),
                kind: 'book',
                title: 'Open book overview',
              }
            : {
                href: objectHref('library', 'source', note.recommendation_id),
                kind: 'source',
                title: 'Open source inspector',
              }
          : sourceUrl
            ? { href: sourceUrl, kind: 'external', title: 'Open original source' }
            : null
  const reflection = note.kind === 'guide' ? relatedNotes.find((item) => item.kind === 'reflection') : null
  const sourceNote = note.kind === 'reflection' ? relatedNotes.find((item) => item.kind === 'guide') : null
  const reflectionDocument = reflection ? buildNoteReaderDocument(reflection) : null
  const draftUnits = new Set(recall.drafts.filter((item) => item.status === 'draft').map((item) => item.unit_id))
  const cardUnits = new Set(recall.cards.map((item) => item.unit_id))
  const currentIndex = allNotes.findIndex((item) => item.id === note.id)
  const prevNote = currentIndex > 0 ? allNotes[currentIndex - 1] : null
  const nextNote = currentIndex >= 0 && currentIndex < allNotes.length - 1 ? allNotes[currentIndex + 1] : null

  const goBack = () => {
    location.hash = routeHref('learn', 'practice', 'notes').slice(1)
  }
  const goToOutline = (id: string) => {
    setActiveOutlineId(id)
    setContentsOpen(false)
    requestAnimationFrame(() => globalThis.document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }

  const blockKey = (block: DistillationBlock) => `${block.section_key}:${block.block_index}:${block.checksum}`
  const chosenBlock = distillation?.blocks.find((block) => blockKey(block) === selectedBlock)

  const addHighlight = async (event: Event) => {
    event.preventDefault()
    if (!chosenBlock || !claimText.trim()) return
    setWorking(true)
    try {
      await api(`/notes/${encodeURIComponent(note.id)}/distillation/highlights`, {
        method: 'POST',
        body: JSON.stringify({
          section_key: chosenBlock.section_key,
          block_index: chosenBlock.block_index,
          block_checksum: chosenBlock.checksum,
          claim_text: claimText.trim(),
        }),
      })
      setClaimText('')
      setSelectedBlock('')
      setMessage('Claim highlighted.')
      dossier.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Highlight failed.')
    } finally {
      setWorking(false)
    }
  }

  const addSynthesis = async (event: Event) => {
    event.preventDefault()
    if (!synthesisText.trim()) return
    setWorking(true)
    try {
      await api(`/notes/${encodeURIComponent(note.id)}/distillation/syntheses`, {
        method: 'POST',
        body: JSON.stringify({ synthesis_text: synthesisText.trim() }),
      })
      setSynthesisText('')
      setMessage('Synthesis revision retained.')
      dossier.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Synthesis failed.')
    } finally {
      setWorking(false)
    }
  }

  const promoteHighlight = async (highlightId: string) => {
    setWorking(true)
    try {
      await api(
        `/notes/${encodeURIComponent(note.id)}/distillation/highlights/${encodeURIComponent(highlightId)}/promote`,
        { method: 'POST' },
      )
      setMessage('Highlight promoted to a retained Unit.')
      dossier.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Promotion failed.')
    } finally {
      setWorking(false)
    }
  }

  const copyNote = async () => {
    const text = (note.sections || [])
      .map((section) => `## ${section.label || section.section_key}\n\n${section.content}`)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(`# ${note.title}\n\n${text}`)
      setMessage('Copied.')
    } catch {
      setMessage('Could not copy the note.')
    }
  }

  const reprocess = async () => {
    setWorking(true)
    setMessage('Queuing a fresh source extraction…')
    try {
      await api(`/notes/${encodeURIComponent(note.id)}/process`, { method: 'POST' })
      setMessage('Fresh source extraction queued.')
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Reprocessing failed.')
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return
    setWorking(true)
    try {
      await api(`/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' })
      reloadLibrary()
      goBack()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.')
      setWorking(false)
    }
  }

  if (editing)
    return (
      <NoteEditor
        note={note}
        onCancel={closeEditor}
        onDelete={remove}
        onSaved={() => {
          closeEditor()
          dossier.reload()
          reloadLibrary()
          setMessage('Saved.')
        }}
      />
    )

  return (
    <section
      class="folio-note-reading note-reading-workspace scholar-note-workspace"
      onKeyDown={(event) => {
        if (toolsOpen && event.key === 'Escape' && !event.isComposing) {
          event.preventDefault()
          closeTools()
        }
      }}
    >
      <header class="note-reading-actions scholar-note-actions">
        <div>
          <button
            class="button secondary"
            type="button"
            aria-expanded={toolsOpen}
            aria-controls="note-study-tools"
            ref={toolsToggle}
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            <Icon name="menu" size={14} />
            Study tools
          </button>
          {overviewTarget && (
            <a
              class="button secondary"
              href={overviewTarget.href}
              title={overviewTarget.title}
              target={overviewTarget.kind === 'external' ? '_blank' : undefined}
              rel={overviewTarget.kind === 'external' ? 'noreferrer' : undefined}
            >
              <Icon
                name={
                  overviewTarget.kind === 'lesson'
                    ? 'learn'
                    : overviewTarget.kind === 'thread'
                      ? 'path'
                      : overviewTarget.kind === 'book'
                        ? 'book'
                        : overviewTarget.kind === 'external'
                          ? 'external'
                          : 'source'
                }
                size={13}
              />
              {overviewTarget.kind === 'lesson'
                ? 'Lesson'
                : overviewTarget.kind === 'thread'
                  ? 'Thread'
                  : overviewTarget.kind === 'book'
                    ? 'Book'
                    : 'Source'}{' '}
            </a>
          )}
          <button class="button primary" type="button" aria-label="Edit note" ref={editToggle} onClick={openEditor}>
            <Icon name="edit" size={14} />
            Edit
          </button>
        </div>
      </header>
      {hasNoteDraft(note.id) && (
        <p class="folio-status">
          You have an unsaved draft on this browser.{' '}
          <button class="button secondary" type="button" onClick={openEditor}>
            Resume editing
          </button>
        </p>
      )}
      {message && (
        <output class="folio-status" aria-live="polite">
          {message}
        </output>
      )}

      <details
        class="scholar-note-nav"
        open={contentsOpen}
        onToggle={(event) => setContentsOpen(event.currentTarget.open)}
      >
        <summary>Contents</summary>
        <div>
          {(document.outline.length
            ? document.outline
            : document.sections.map((section) => ({
                id: `section-${section.key}`,
                label: section.label || 'Note',
                level: 1,
                sectionKey: section.key,
              }))
          ).map((item, index) => (
            <button
              class={`${activeOutlineId === item.id || (!activeOutlineId && index === 0) ? 'active' : ''} level-${item.level}`}
              type="button"
              onClick={() => goToOutline(item.id)}
              key={`${item.id}-${index}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {(prevNote || nextNote) && (
          <nav class="scholar-note-neighbors" aria-label="Other notes">
            {prevNote && (
              <a href={noteHref(prevNote.id)}>
                Previous
                <br />
                <span>{prevNote.title}</span>
              </a>
            )}
            {nextNote && (
              <a href={noteHref(nextNote.id)}>
                Next
                <br />
                <span>{nextNote.title}</span>
              </a>
            )}
          </nav>
        )}
      </details>

      <div class={`scholar-note-shell${toolsOpen ? ' has-tools' : ''}`}>
        <article class="scholar-note-document">
          <header class="scholar-note-head">
            {note.branch_label ? (
              <span class="folio-branch-pill">{note.branch_label}</span>
            ) : (
              <button type="button" class="button secondary" onClick={() => setEditing(true)}>
                Choose a branch
              </button>
            )}
            <h1 dir={directionForText(note.title)}>{note.title}</h1>
            <div class="scholar-note-meta">
              <span>{document.readingMinutes} min</span>
              <span>{document.wordCount.toLocaleString()} words</span>
              <span>Updated {formatDate(note.updated_at)}</span>
            </div>
            {note.abstract && (
              <p class="note-abstract" dir={directionForText(note.abstract)}>
                {note.abstract}
              </p>
            )}
          </header>

          {document.sections.length ? (
            <div class="scholar-note-bilingual">
              {document.sections.map((section) => (
                <section id={`section-${section.key}`} class="note-reading-section" key={section.key}>
                  {document.sections.length > 1 && section.label && (
                    <h2 class="note-section-label" dir="auto">
                      {section.label}
                    </h2>
                  )}
                  {section.blocks.map((block, index) => (
                    <ReaderBlockComponent block={block} key={index} />
                  ))}
                </section>
              ))}
              {reflectionDocument && (
                <section class="note-reading-section" aria-label="My reflection">
                  <h2 class="note-section-label">My reflection</h2>
                  {reflectionDocument.sections.flatMap((section) =>
                    section.blocks.map((block, index) => (
                      <ReaderBlockComponent block={block} key={`reflection-${section.key}-${index}`} />
                    )),
                  )}
                </section>
              )}
            </div>
          ) : (
            <Empty title="This note is empty" body="Edit the note to add content." />
          )}
          {document.provenance.length > 0 && (
            <details class="note-provenance">
              <summary>Provenance details</summary>
              {document.provenance.map((section) => (
                <section key={section.section_key}>
                  <h2>{section.label || 'Extraction receipt'}</h2>
                  <pre dir="ltr">{section.content}</pre>
                </section>
              ))}
            </details>
          )}
        </article>

        {toolsOpen && (
          <aside
            id="note-study-tools"
            class="scholar-note-tools"
            aria-label="Study tools"
            tabIndex={-1}
            ref={toolsElement}
          >
            <strong class="scholar-tools-title">Study tools</strong>
            <button class="button secondary" type="button" onClick={closeTools}>
              Close study tools
            </button>
            <section aria-label="Note actions">
              <span>Note actions</span>
              <button class="button secondary" type="button" onClick={copyNote}>
                <Icon name="copy" size={14} />
                Copy note
              </button>
              {note.kind === 'guide' && (
                <button class="button secondary" type="button" onClick={reprocess} disabled={working}>
                  Refresh from source
                </button>
              )}
            </section>
            <section>
              <span>Knowledge branch</span>
              {note.branch_id && note.branch_label ? (
                <a class="folio-branch-pill" href={objectHref('map', 'branch', note.branch_id)}>
                  {note.branch_label}
                </a>
              ) : (
                <button type="button" class="button secondary" onClick={openEditor}>
                  Choose a branch
                </button>
              )}
            </section>
            <ItemParentLinks sourceId={note.recommendation_id} />
            <section>
              <span>Source</span>
              {sourceUrl ? (
                <a class="relation-source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                  Open original source
                </a>
              ) : (
                <p>No source link</p>
              )}
            </section>
            <section>
              <span>Record</span>
              <p>
                {document.wordCount.toLocaleString()} words · {document.readingMinutes} min
              </p>
              <p>
                {note.status || 'Published'} · {formatDate(note.updated_at)}
              </p>
            </section>
            {sourceNote && (
              <section>
                <span>Source synthesis</span>
                <a href={noteHref(sourceNote.id)}>{sourceNote.title}</a>
              </section>
            )}
            {relatedNotes.length > 0 && (
              <section>
                <span>Related notes</span>
                <div class="scholar-related-notes">
                  {relatedNotes.slice(0, 5).map((related) => (
                    <a href={noteHref(related.id)} key={related.id}>
                      {related.title}
                    </a>
                  ))}
                </div>
              </section>
            )}
            <section>
              <span>Retention</span>
              <p>{units.length} retained ideas</p>
              <p>
                {recall.cards.length} recall cards · {recall.drafts.length} drafts
              </p>
            </section>
          </aside>
        )}
      </div>

      {toolsOpen && distillation && (
        <section class="note-distillation scholar-retained-ideas" aria-labelledby="distillation-title">
          <div class="note-section-heading">
            <div>
              <p class="folio-object-kicker">Manual, additive distillation</p>
              <h2 id="distillation-title">Claims and synthesis</h2>
            </div>
            <span class="folio-measure">{distillation.highlights.length} highlights</span>
          </div>
          <div class="note-distillation-grid">
            <div class="note-distillation-column">
              <form onSubmit={addHighlight}>
                <label>
                  Source block
                  <select
                    value={selectedBlock}
                    onChange={(event) => setSelectedBlock((event.target as HTMLSelectElement).value)}
                    required
                  >
                    <option value="">Choose an exact block</option>
                    {distillation.blocks.map((block) => (
                      <option value={blockKey(block)} key={blockKey(block)}>
                        {block.section_label || block.section_key} · {block.text.slice(0, 90)}
                      </option>
                    ))}
                  </select>
                </label>
                {chosenBlock && <blockquote dir={directionForText(chosenBlock.text)}>{chosenBlock.text}</blockquote>}
                <label>
                  Your claim
                  <textarea
                    rows={3}
                    value={claimText}
                    onInput={(event) => setClaimText((event.target as HTMLTextAreaElement).value)}
                    required
                  />
                </label>
                <button class="button secondary" type="submit" disabled={working || !chosenBlock || !claimText.trim()}>
                  Add highlight
                </button>
              </form>
              <div class="note-highlight-list">
                {distillation.highlights.map((highlight) => (
                  <article class={highlight.stale ? 'is-stale' : ''} key={highlight.id}>
                    <div>
                      <strong>{highlight.claim_text}</strong>
                      {highlight.stale && <span>Source changed</span>}
                    </div>
                    <blockquote dir={directionForText(highlight.source_text)}>{highlight.source_text}</blockquote>
                    <small>
                      {highlight.section_key} · block {highlight.block_index + 1} ·{' '}
                      {highlight.block_checksum.slice(0, 10)}
                    </small>
                    {highlight.promoted_unit_id ? (
                      <a href={objectHref('learn', 'unit', highlight.promoted_unit_id)}>Open retained Unit</a>
                    ) : (
                      <button
                        class="button quiet"
                        type="button"
                        disabled={working || !distillation.can_promote}
                        onClick={() => promoteHighlight(highlight.id)}
                      >
                        Promote to Unit
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
            <div class="note-distillation-column">
              <form onSubmit={addSynthesis}>
                <label>
                  New concise synthesis
                  <textarea
                    rows={5}
                    value={synthesisText}
                    onInput={(event) => setSynthesisText((event.target as HTMLTextAreaElement).value)}
                    required
                  />
                </label>
                <button class="button secondary" type="submit" disabled={working || !synthesisText.trim()}>
                  Append revision
                </button>
              </form>
              <ol class="note-synthesis-history">
                {distillation.synthesis_revisions.map((revision) => (
                  <li key={revision.id}>
                    <small>
                      Revision {revision.revision} · {formatDate(revision.created_at)}
                    </small>
                    <p dir={directionForText(revision.synthesis_text)}>{revision.synthesis_text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {toolsOpen && units.length > 0 && (
        <section class="note-retained-ideas scholar-retained-ideas" aria-labelledby="retained-ideas-title">
          <div class="note-section-heading">
            <div>
              <p class="folio-object-kicker">Grounded in the source</p>
              <h2 id="retained-ideas-title">Ideas worth keeping</h2>
            </div>
            <span class="folio-measure">{units.length}</span>
          </div>
          <ol>
            {units.map((unit) => {
              const anchor = unit.anchors[0]
              const recallState = cardUnits.has(unit.id)
                ? 'In review'
                : draftUnits.has(unit.id)
                  ? 'Draft waiting'
                  : 'No card needed'
              return (
                <li key={unit.id}>
                  <div>
                    <span class="note-unit-type">{unit.unit_type}</span>
                    <strong>{unit.statement}</strong>
                  </div>
                  <small>
                    {anchor ? `${anchor.anchor_type}: ${anchor.locator}` : 'No source locator'} · {recallState}
                  </small>
                </li>
              )
            })}
          </ol>
        </section>
      )}
      {toolsOpen && backlinks.length > 0 && (
        <section
          class="note-retained-ideas scholar-retained-ideas note-backlinks"
          aria-labelledby="note-backlinks-title"
        >
          <div class="note-section-heading">
            <div>
              <p class="folio-object-kicker">Connected through retained ideas</p>
              <h2 id="note-backlinks-title">Meaningful backlinks</h2>
            </div>
            <span class="folio-measure">{backlinks.length}</span>
          </div>
          <div class="unit-relations">
            {backlinks.map((relation) => (
              <article key={relation.id}>
                <div>
                  <strong>{relation.relation_type.replace(/_/g, ' ')}</strong>
                  <span class="folio-branch-pill">
                    {relation.counterpart.branch.label} · {relation.counterpart.branch.domain}
                  </span>
                </div>
                <a href={objectHref('learn', 'unit', relation.counterpart.unit_id)}>{relation.counterpart.statement}</a>
                <p>{relation.why}</p>
                {relation.counterpart.anchor && <small>Anchor: {relation.counterpart.anchor.locator}</small>}
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
