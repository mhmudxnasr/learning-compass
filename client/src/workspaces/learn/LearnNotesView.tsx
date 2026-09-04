import { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { ItemParentLinks } from '../../components/ItemSections'
import { objectHref, routeHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { buildNoteReaderDocument, directionForText, NoteReaderBlock } from './noteReader'
import { Direction, DistillationBlock, NoteDossierResponse, NoteRecord, NotesResponse } from './types'
import { directionValue, formatDate, lessonHref, noteHref, threadHref } from './helpers'

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
  if (noteId)
    return <NoteDetailWorkspace noteId={noteId} allNotes={notes.data?.notes || []} reloadLibrary={notes.reload} />
  if (notes.loading && !notes.data) return <Loading label="Loading notes" />
  if (notes.error && !notes.data) return <ErrorState message={notes.error} retry={notes.reload} />
  return <NotesIndex notes={notes.data?.notes || []} reload={notes.reload} />
}

function noteWords(note: NoteRecord) {
  return (note.sections || []).reduce(
    (total, section) => total + (section.content.match(/[\p{L}\p{N}]+/gu)?.length || 0),
    0,
  )
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
        words: items.reduce((total, item) => total + noteWords(item), 0),
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
  const branches = useMemo(
    () => [...new Set(notes.map((note) => note.branch_label || note.branch_id).filter(Boolean) as string[])].sort(),
    [notes],
  )
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
          <label>
            Branch
            <input
              value={newBranch}
              onInput={(event) => setNewBranch((event.target as HTMLInputElement).value)}
              list="note-branches"
              placeholder="Optional"
            />
          </label>
          <datalist id="note-branches">
            {branches.map((branch) => (
              <option key={branch} value={branch} />
            ))}
          </datalist>
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
            const branch = note.branch_label || note.branch_id
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
                    {Math.max(1, Math.ceil(group.words / 180))} min
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

function inlineMarkdown(text: string): ComponentChildren[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*]+\*)/g
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part, index) => {
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (link)
        return (
          <a key={index} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        )
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
      return part
    })
}

function ReaderBlockComponent({ block }: { block: NoteReaderBlock }) {
  if (block.kind === 'heading') {
    const Tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
    return (
      <Tag id={block.id} class={`reader-heading level-${block.level}`} dir={block.direction}>
        {inlineMarkdown(block.text)}
      </Tag>
    )
  }
  if (block.kind === 'quote')
    return (
      <blockquote class="reader-blockquote" dir={block.direction}>
        {inlineMarkdown(block.text)}
      </blockquote>
    )
  if (block.kind === 'list') {
    const items = block.items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)
    return block.ordered ? (
      <ol class="reader-list" dir={block.direction} start={block.start}>
        {items}
      </ol>
    ) : (
      <ul class="reader-list" dir={block.direction}>
        {items}
      </ul>
    )
  }
  return (
    <p class="reader-paragraph" dir={block.direction}>
      {inlineMarkdown(block.text)}
    </p>
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
  const [selectedBlock, setSelectedBlock] = useState('')
  const [claimText, setClaimText] = useState('')
  const [synthesisText, setSynthesisText] = useState('')

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
    globalThis.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveOutlineId(id)
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
        onCancel={() => setEditing(false)}
        onDelete={remove}
        onSaved={() => {
          setEditing(false)
          dossier.reload()
          reloadLibrary()
          setMessage('Saved.')
        }}
      />
    )

  return (
    <section class="folio-note-reading note-reading-workspace scholar-note-workspace">
      <header class="note-reading-actions scholar-note-actions">
        <div>
          <button class="button secondary" type="button" onClick={copyNote}>
            <Icon name="copy" size={14} />
            Copy
          </button>
          {note.kind === 'guide' && (
            <button class="button secondary" type="button" onClick={reprocess} disabled={working}>
              Reprocess
            </button>
          )}
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
              <span class="folio-branch-pill">{note.branch_label || note.branch_id || 'Unassigned'}</span>
            </a>
          )}
          <button class="button primary" type="button" aria-label="Edit note" onClick={() => setEditing(true)}>
            <Icon name="edit" size={14} />
            Edit
          </button>
        </div>
      </header>
      {message && (
        <output class="folio-status" aria-live="polite">
          {message}
        </output>
      )}

      <div class="scholar-note-shell">
        <aside class="scholar-note-nav" aria-label="Note sections">
          <strong>Chapter sections</strong>
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
        </aside>

        <main class="scholar-note-document">
          <header class="scholar-note-head">
            <span class="folio-branch-pill">{note.branch_label || note.branch_id || 'Unassigned'}</span>
            <p>
              {note.kind === 'guide'
                ? 'Source synthesis'
                : note.kind === 'reflection'
                  ? 'My reflection'
                  : 'Knowledge note'}
            </p>
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
              <article class="scholar-language-column scholar-language-english" aria-label="English synthesis">
                <div class="scholar-language-head">
                  <strong>English synthesis</strong>
                  <span>Source argument and cases</span>
                </div>
                {document.sections.map((section) => {
                  const blocks = section.blocks.filter((block) => block.direction === 'ltr')
                  if (!blocks.length) return null
                  return (
                    <section id={`section-${section.key}`} class="note-reading-section" key={`en-${section.key}`}>
                      {document.sections.length > 1 && section.label && (
                        <h2 class="note-section-label">{section.label}</h2>
                      )}
                      {blocks.map((block, index) => (
                        <ReaderBlockComponent block={block} key={index} />
                      ))}
                    </section>
                  )
                })}
                {reflectionDocument?.sections.map((section) =>
                  section.blocks
                    .filter((block) => block.direction === 'ltr')
                    .map((block, index) => (
                      <ReaderBlockComponent block={block} key={`reflection-en-${section.key}-${index}`} />
                    )),
                )}
              </article>

              <article
                class="scholar-language-column scholar-language-arabic"
                aria-label="Arabic interpretation"
                dir="rtl"
              >
                <div class="scholar-language-head">
                  <strong>التفسير الشخصي</strong>
                  <span>الملاحظات والتطبيق</span>
                </div>
                {document.sections.map((section) => {
                  const blocks = section.blocks.filter((block) => block.direction === 'rtl')
                  if (!blocks.length) return null
                  return (
                    <section class="note-reading-section" key={`ar-${section.key}`}>
                      {blocks.map((block, index) => (
                        <ReaderBlockComponent block={block} key={index} />
                      ))}
                    </section>
                  )
                })}
                {reflectionDocument?.sections.map((section) =>
                  section.blocks
                    .filter((block) => block.direction === 'rtl')
                    .map((block, index) => (
                      <ReaderBlockComponent block={block} key={`reflection-ar-${section.key}-${index}`} />
                    )),
                )}
              </article>
            </div>
          ) : (
            <Empty title="This note is empty" body="Edit the note to add content." />
          )}
        </main>

        <aside class="scholar-note-tools" aria-label="Study tools">
          <strong class="scholar-tools-title">Study tools</strong>
          <section>
            <span>Knowledge branch</span>
            <a class="folio-branch-pill" href={objectHref('map', 'branch', note.branch_id || note.branch_label || '')}>
              {note.branch_label || note.branch_id || 'Unassigned'}
            </a>
          </section>
          <ItemParentLinks sourceId={note.recommendation_id} />
          <section>
            <span>Source</span>
            {sourceUrl ? (
              <a class="relation-source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                Open original source{' '}
                <span class="folio-branch-pill">{note.branch_label || note.branch_id || 'Unassigned'}</span>
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
      </div>

      {distillation && (
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

      {units.length > 0 && (
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
      {backlinks.length > 0 && (
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

function NoteEditor({
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
  const [title, setTitle] = useState(note.title)
  const [branch, setBranch] = useState(note.branch_label || note.branch_id || '')
  const initialSourceUrl = note.source_url || note.rec_video_url || note.rec_source_url || ''
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl)
  const [abstract, setAbstract] = useState(note.abstract || '')
  const [sections, setSections] = useState(
    (note.sections || []).map((section) => ({
      ...section,
      label: section.label || '',
      direction: directionValue(section.direction),
    })),
  )
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const updateSection = (index: number, patch: Partial<{ label: string; content: string; direction: Direction }>) =>
    setSections(sections.map((section, position) => (position === index ? { ...section, ...patch } : section)))
  const addSection = () =>
    setSections([...sections, { section_key: `section_${Date.now()}`, label: '', content: '', direction: 'auto' }])

  const save = async (event: Event) => {
    event.preventDefault()
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
        <button class="button quiet" type="button" onClick={onCancel}>
          ← Cancel
        </button>
        <div>
          <button class="button quiet danger-btn" type="button" onClick={onDelete}>
            Delete
          </button>
          <button class="button primary" type="submit" disabled={working || !title.trim()}>
            {working ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>
      {error && <output class="notes-error-banner">{error}</output>}
      <main>
        <label>
          Title
          <input
            class="note-editor-title"
            value={title}
            onInput={(event) => setTitle((event.target as HTMLInputElement).value)}
            required
          />
        </label>
        <div class="note-editor-meta folio-note-meta">
          <label>
            Branch
            <input value={branch} onInput={(event) => setBranch((event.target as HTMLInputElement).value)} />
          </label>
          <label>
            Source URL
            <input
              type="url"
              value={sourceUrl}
              onInput={(event) => setSourceUrl((event.target as HTMLInputElement).value)}
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
              onInput={(event) => setAbstract((event.target as HTMLTextAreaElement).value)}
            />
          </label>
        )}
        <div class="note-editor-section-head">
          <h2>Foundation</h2>
          <button class="button secondary" type="button" onClick={addSection}>
            Add section
          </button>
        </div>
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
                <option value="auto">Auto</option>
                <option value="ltr">LTR</option>
                <option value="rtl">RTL</option>
              </select>
            </div>
            <textarea
              rows={12}
              dir={directionValue(section.direction)}
              value={section.content}
              onInput={(event) => updateSection(index, { content: (event.target as HTMLTextAreaElement).value })}
            />
          </section>
        ))}
      </main>
    </form>
  )
}
