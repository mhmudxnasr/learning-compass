import { useMemo, useState } from 'preact/hooks'
import { formatDate, labelize } from '../../api'
import { Empty } from '../../components/States'
import { Icon } from '../../components/Icon'
import type { LibraryRecord, LibrarySelection } from './types'
import {
  artifactLink,
  artifactSelection,
  bookSelection,
  collectionSelection,
  fileKind,
  formatBytes,
  formatQueueMeta,
  formatReason,
  formatStatus,
  objectHref,
  sourceCreator,
  sourceFormat,
  sourceLink,
  sourceSelection,
  sourceState,
  sourceTitle,
} from './types'

export type LibraryViewHandlers = {
  onInspect: (selection: LibrarySelection) => void
  onQueue: (item: LibraryRecord, override?: boolean) => void
  onExclude: (item: LibraryRecord) => void
  onStart: (event: MouseEvent, item: LibraryRecord, href: string, kind?: 'original' | 'html' | 'pdf' | 'artifact' | 'notebooklm', artifactId?: string) => void
  onProcessArtifact: (item: LibraryRecord) => void
  onDeleteArtifact: (item: LibraryRecord) => void
  onCompleteChapter: (book: LibraryRecord, chapter: LibraryRecord) => void
  onAddBook: (payload: { title: string; author: string; isbn: string }) => void
  onCreateCollection: (payload: { name: string; description: string }) => void
  onDeleteCollection: (item: LibraryRecord) => void
  busyId?: string
  blockedId?: string
  notice?: string
}

function RecordMeta({ children }: { children: preact.ComponentChildren }) {
  return <span class="folio-record-meta">{children}</span>
}

function RowTitle({ item, type = 'source', onInspect }: { item: LibraryRecord; type?: 'source' | 'artifact' | 'book' | 'collection'; onInspect: (selection: LibrarySelection) => void }) {
  const selection = type === 'artifact' ? artifactSelection(item) : type === 'book' ? bookSelection(item) : type === 'collection' ? collectionSelection(item) : sourceSelection(item)
  return <button type="button" class="folio-object-row" onClick={() => onInspect(selection)}>
    <span class={`folio-object-mark folio-object-${type}`} aria-hidden="true"><Icon name={type === 'source' ? 'source' : type === 'artifact' ? 'file' : type === 'book' ? 'book' : 'collection'} size={17}/></span>
    <span class="folio-object-copy">
      <strong>{selection.title}</strong>
      <small>{type === 'artifact' ? `${fileKind(item)}${item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ''}` : type === 'collection' ? `${item.item_count || 0} sources · ${formatStatus(item.scope || 'library')}` : `${sourceCreator(item)} · ${sourceFormat(item)}`}</small>
    </span>
    <Icon name="chevron" size={16}/>
  </button>
}

function ViewEmpty({ title, body }: { title: string; body: string }) {
  return <Empty title={title} body={body}/>
}

export function QueueView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const items = Array.isArray(data.items) ? data.items : []
  const cap = Number(data.cap || 5)
  return <div class="folio-library-view folio-queue-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">A bounded shelf of commitments</p><h1>Queue</h1><p>Start one source at a time. The shelf stays small enough to remember why each item matters.</p></div><span class="folio-cap-readout"><strong>{items.length}</strong><small>of {cap} active</small></span></div>
    {items.length > cap && <div class="folio-overflow-notice" role="status"><strong>Override is active.</strong> {items.length - cap} extra {items.length - cap === 1 ? 'item is' : 'items are'} waiting. Finish or remove one to return to the five-item cap.</div>}
    {items.length ? <div class="folio-record-list" aria-label="Active queue">
      {items.map((item: LibraryRecord, index: number) => {
        const href = sourceLink(item)
        const startKind = item.recommended_start === 'html' || item.recommended_start === 'pdf' ? item.recommended_start : 'original'
        const artifact = (item.artifacts || {})[startKind]
        const startHref = artifact?.id ? `/artifacts/${artifact.id}` : href
        return <article class="folio-record folio-queue-record" key={item.id}>
          <span class="folio-rank" aria-label={`Queue position ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
          <div class="folio-record-main">
            <RecordMeta>{formatQueueMeta(item)} · {item.learning_state === 'in_progress' ? 'In progress' : 'Queued'}</RecordMeta>
            <RowTitle item={item} onInspect={handlers.onInspect}/>
            <p class="folio-record-reason">{formatReason(item)}</p>
            {item.branch_preflight?.conflict && <p class="folio-inline-warning" role="alert">Mapped to the pruned branch “{item.branch_preflight.branch_label}”. Review the mapping before starting.</p>}
            {item.branch_preflight?.status === 'unmapped' && <p class="folio-record-note">Branch match is not verified yet.</p>}
            {item.compass && <p class="folio-record-note">Compass fit {Math.round(Number(item.compass.score || 0) * 100)}% · confidence {Math.round(Number(item.compass.confidence || 0) * 100)}%</p>}
            <div class="folio-row-actions">
              {href && <a class="folio-button folio-button-primary" href={startHref || href} target="_blank" rel="noreferrer" onClick={(event) => handlers.onStart(event, item, startHref || href, startKind as 'original' | 'html' | 'pdf', artifact?.id)}>{item.learning_state === 'in_progress' ? 'Resume' : 'Start'}</a>}
              <a class="folio-button" href={objectHref('source', String(item.id))}>Record</a>
              <button type="button" class="folio-button" onClick={() => handlers.onExclude(item)} disabled={handlers.busyId === item.id} aria-label={`Exclude ${sourceTitle(item)} from Queue`}>Exclude</button>
            </div>
            <small class="folio-action-note">Exclude is administrative and does not count as a bad-fit signal.</small>
          </div>
        </article>
      })}
    </div> : <ViewEmpty title="Queue is clear" body="A source earns a place here only after a deliberate decision in Inbox."/>}
    {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
  </div>
}

export function InboxView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const items = Array.isArray(data.items) ? data.items : []
  return <div class="folio-library-view folio-inbox-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">Unlimited landing place</p><h1>Inbox</h1><p>Every capture waits here until it earns Queue, stays neutral for later, or is explicitly excluded.</p></div><span class="folio-count-readout"><strong>{items.length}</strong><small>waiting</small></span></div>
    {items.length ? <div class="folio-record-list" aria-label="Inbox captures">
      {items.map((item: LibraryRecord) => <article class="folio-record" key={item.id}>
        <div class="folio-record-main">
          <RecordMeta>{item.feed_title ? `RSS · ${item.feed_title}` : sourceFormat(item)} · {formatDate(item.created_at)}</RecordMeta>
          <RowTitle item={item} onInspect={handlers.onInspect}/>
          <p class="folio-record-reason">{formatReason(item)}</p>
          {item.resurface_at && <p class="folio-record-note">Neutral revisit window: {formatDate(item.resurface_at)}</p>}
          <div class="folio-row-actions">
            <button type="button" class="folio-button folio-button-primary" onClick={() => handlers.onQueue(item)} disabled={handlers.busyId === item.id}>Queue</button>
            <button type="button" class="folio-button" onClick={() => handlers.onExclude(item)} disabled={handlers.busyId === item.id}>Exclude</button>
          </div>
          <small class="folio-action-note">Exclude is an administrative archive action. It does not teach Compass that the source was a bad fit.</small>
          {handlers.blockedId === item.id && <div class="folio-queue-override" role="alert"><strong>Queue cap reached.</strong><span>Adding this source is an explicit overflow choice.</span><button type="button" class="folio-button folio-button-primary" onClick={() => handlers.onQueue(item, true)} disabled={handlers.busyId === item.id}>Add anyway — override cap</button></div>}
        </div>
      </article>)}
    </div> : <ViewEmpty title="Inbox is clear" body="Captures, share-target links, Telegram links, and feed entries will appear here for triage."/>}
    {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
  </div>
}

export function AllSourcesView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [query, setQuery] = useState('')
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : []
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return recommendations.filter((item: LibraryRecord) => !needle || `${sourceTitle(item)} ${sourceCreator(item)} ${item.why_this || ''}`.toLowerCase().includes(needle))
  }, [recommendations, query])
  return <div class="folio-library-view folio-all-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">One source ledger</p><h1>All sources</h1><p>Search the canonical record without losing its lifecycle or source identity.</p></div><span class="folio-count-readout"><strong>{data.total ?? recommendations.length}</strong><small>records</small></span></div>
    <label class="folio-search-field"><span>Filter sources</span><input type="search" value={query} onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)} placeholder="Title, creator, or rationale"/></label>
    {items.length ? <div class="folio-record-list" aria-label="All sources">{items.map((item: LibraryRecord) => <article class="folio-record" key={item.id}><div class="folio-record-main"><RecordMeta>{sourceFormat(item)} · {formatStatus(item.status)} · {formatDate(item.created_at)}</RecordMeta><RowTitle item={item} onInspect={handlers.onInspect}/><p class="folio-record-reason">{item.user_review || formatReason(item)}</p></div></article>)}</div> : <ViewEmpty title="No matching sources" body="Try a shorter title, creator, or rationale."/>}
  </div>
}

function artifactGroups(items: LibraryRecord[]) {
  const groups = new Map<string, LibraryRecord[]>()
  for (const item of items) {
    const metadata = item.metadata || {}
    const key = metadata.pair_id || item.id
    groups.set(String(key), [...(groups.get(String(key)) || []), item])
  }
  return [...groups.values()].sort((a, b) => String(b[0]?.created_at || '').localeCompare(String(a[0]?.created_at || '')))
}

export function FilesView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const items = Array.isArray(data.artifacts) ? data.artifacts : []
  const groups = artifactGroups(items)
  return <div class="folio-library-view folio-files-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">R2-backed reading material</p><h1>Files</h1><p>Generated companions and owned uploads stay attached to their source. Opening a file is passive; start a session from Queue.</p></div><span class="folio-count-readout"><strong>{groups.length}</strong><small>file groups</small></span></div>
    {groups.length ? <div class="folio-record-list" aria-label="Source artifacts">{groups.map((group) => { const primary = group[0]; const metadata = primary.metadata || {}; const groupRecord = { ...primary, _group: group }; return <article class="folio-record folio-file-record" key={metadata.pair_id || primary.id}><div class="folio-record-main"><RecordMeta>{metadata.source_title || 'Owned artifact'} · {formatDate(primary.created_at)}</RecordMeta><RowTitle item={primary} type="artifact" onInspect={handlers.onInspect}/><p class="folio-record-reason">{group.length > 1 ? `${group.length} linked files · ${metadata.source_title || 'paired reading companion'}` : 'One source file'}</p><div class="folio-file-links">{group.map((file) => <span class="folio-file-link" key={file.id}><a href={artifactLink(file)} target="_blank" rel="noreferrer">Open {fileKind(file)}</a><small>{file.filename || fileKind(file)}{file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ''}</small></span>)}</div><div class="folio-row-actions"><button type="button" class="folio-button" onClick={() => handlers.onProcessArtifact(primary)} disabled={handlers.busyId === primary.id}>Queue note extraction</button><button type="button" class="folio-button" onClick={() => handlers.onDeleteArtifact(groupRecord)} disabled={handlers.busyId === primary.id}>Remove group</button></div></div></article> })}</div> : <ViewEmpty title="No files yet" body="Uploaded documents and generated HTML/PDF companions will appear here."/>}
    {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
  </div>
}

export function BooksView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [isbn, setIsbn] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const books = Array.isArray(data.books) ? data.books : []
  const shelves = [
    ['Inbox', books.filter((book: LibraryRecord) => String(book.learning_state || '') === 'inbox' || String(book.status || '') === 'active' && String(book.learning_state || '') !== 'in_progress'), 'Books enter here first.'],
    ['Reading', books.filter((book: LibraryRecord) => String(book.learning_state || '') === 'in_progress'), 'Only deliberate reading belongs here.'],
    ['Finished', books.filter((book: LibraryRecord) => String(book.status || '') === 'consumed'), 'Finished books remain available for reflection and evidence.'],
  ] as Array<[string, LibraryRecord[], string]>
  const submit = (event: Event) => { event.preventDefault(); if (title.trim() && author.trim()) { handlers.onAddBook({ title: title.trim(), author: author.trim(), isbn: isbn.trim() }); setTitle(''); setAuthor(''); setIsbn('') } }
  return <div class="folio-library-view folio-books-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">Deliberate intake</p><h1>Books</h1><p>Books enter Inbox, then move through the same Queue, session, reflection, and evidence loop as every other source.</p></div><span class="folio-count-readout"><strong>{books.length}</strong><small>books</small></span></div>
    <form class="folio-intake-form" onSubmit={submit}><div><h2>Add a book</h2><p>Record the reason before the title becomes a commitment.</p></div><label>Title<input value={title} onInput={(event) => setTitle((event.currentTarget as HTMLInputElement).value)} required/></label><label>Author<input value={author} onInput={(event) => setAuthor((event.currentTarget as HTMLInputElement).value)} required/></label><label>ISBN <span>(optional)</span><input value={isbn} onInput={(event) => setIsbn((event.currentTarget as HTMLInputElement).value)}/></label><button type="submit" class="folio-button folio-button-primary">Add to Inbox</button></form>
    {shelves.map(([label, items, description]) => <section class="folio-shelf" key={label}><div class="folio-section-heading"><div><h2>{label}</h2><p>{description}</p></div><span>{items.length}</span></div>{items.length ? <div class="folio-record-list">{items.map((book) => { const expandedBook = expanded === book.id; return <article class="folio-record folio-book-record" key={book.id}><div class="folio-record-main"><RecordMeta>{sourceCreator(book)} · {formatStatus(book.learning_state || book.status)}</RecordMeta><RowTitle item={book} type="book" onInspect={handlers.onInspect}/>{book.why_this && <p class="folio-record-reason">{book.why_this}</p>}<div class="folio-row-actions"><button type="button" class="folio-button" onClick={() => setExpanded(expandedBook ? null : String(book.id))}>{expandedBook ? 'Hide chapters' : 'Show chapters'}</button>{String(book.learning_state || '') === 'inbox' && <button type="button" class="folio-button folio-button-primary" onClick={() => handlers.onQueue(book)} disabled={handlers.busyId === book.id}>Queue</button>}{sourceLink(book) && String(book.learning_state || '') === 'in_progress' && <a class="folio-button" href={sourceLink(book)!} target="_blank" rel="noreferrer">Open source</a>}<a class="folio-button" href={objectHref('source', String(book.id))}>Record</a></div>{expandedBook && <BookChapters book={book} handlers={handlers}/>}</div></article> })}</div> : <p class="folio-shelf-empty">Nothing on this shelf yet.</p>}</section>)}
    {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
  </div>
}

function BookChapters({ book, handlers }: { book: LibraryRecord; handlers: LibraryViewHandlers }) {
  const chapters = book.visual?.chapters || []
  if (!chapters.length) return <p class="folio-record-note">No chapter companion records yet. Visual creation remains an explicit source action.</p>
  return <div class="folio-chapter-list" aria-label={`${sourceTitle(book)} chapters`}>{chapters.map((chapter: LibraryRecord) => <div class="folio-chapter-row" key={chapter.key}><div><strong>{chapter.number ? `${chapter.number}. ` : ''}{chapter.title}</strong><small>{chapter.completed ? 'Finished' : 'Not finished'}</small></div><div class="folio-row-actions">{chapter.html && <a href={`/artifacts/${chapter.html.id}/view`} target="_blank" rel="noreferrer">HTML</a>}{chapter.pdf && <a href={`/artifacts/${chapter.pdf.id}`} target="_blank" rel="noreferrer">PDF</a>}<button type="button" onClick={() => handlers.onCompleteChapter(book, chapter)} disabled={handlers.busyId === `${book.id}:${chapter.key}`}>{chapter.completed ? 'Undo' : 'Finish'}</button></div></div>)}</div>
}

export function CollectionsView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const collections = Array.isArray(data.collections) ? data.collections : []
  const submit = (event: Event) => { event.preventDefault(); if (name.trim()) { handlers.onCreateCollection({ name: name.trim(), description: description.trim() }); setName(''); setDescription('') } }
  return <div class="folio-library-view folio-collections-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">A group with a purpose</p><h1>Collections</h1><p>Keep thematic shelves adjacent to the sources they organize. A collection groups records; it does not replace Thread evidence.</p></div><span class="folio-count-readout"><strong>{collections.length}</strong><small>collections</small></span></div>
    <form class="folio-intake-form folio-collection-form" onSubmit={submit}><label>Name<input value={name} onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)} required/></label><label>Description <span>(optional)</span><input value={description} onInput={(event) => setDescription((event.currentTarget as HTMLInputElement).value)}/></label><button type="submit" class="folio-button folio-button-primary">Create collection</button></form>
    {collections.length ? <div class="folio-record-list" aria-label="Collections">{collections.map((item: LibraryRecord) => <article class="folio-record" key={item.id}><div class="folio-record-main"><RowTitle item={item} type="collection" onInspect={handlers.onInspect}/><p class="folio-record-reason">{item.description || 'No description recorded.'}</p><div class="folio-row-actions"><button type="button" class="folio-button" onClick={() => handlers.onDeleteCollection(item)} disabled={handlers.busyId === item.id}>Delete collection</button></div></div></article>)}</div> : <ViewEmpty title="No collections yet" body="Create a group when a set of sources has a real shared purpose."/>}
    {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
  </div>
}

export function ArchiveView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [filter, setFilter] = useState<'all' | 'consumed' | 'rejected'>('all')
  const all = Array.isArray(data.recommendations) ? data.recommendations : []
  const archived = all.filter((item: LibraryRecord) => ['consumed', 'rejected'].includes(String(item.status)))
  const items = filter === 'all' ? archived : archived.filter((item: LibraryRecord) => item.status === filter)
  return <div class="folio-library-view folio-archive-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">Recovery without clutter</p><h1>Archive</h1><p>Completed sources and explicit exclusions stay findable. Feed entries retain their own pinned shelf in Inbox.</p></div><span class="folio-count-readout"><strong>{archived.length}</strong><small>archived</small></span></div>
    <div class="folio-filter-row" role="group" aria-label="Archive status"><span>Show</span>{(['all', 'consumed', 'rejected'] as const).map((value) => <button type="button" class={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'consumed' ? 'Completed' : 'Excluded'}</button>)}</div>
  </div>
}

export function ObjectRouteView({ type, data, handlers, onBack }: { type: 'source' | 'artifact' | 'book' | 'collection'; data: LibraryRecord; handlers: LibraryViewHandlers; onBack: () => void }) {
  const item = data.item || data.artifact || data.book || data.collection || data
  const title = type === 'artifact' ? String(item.filename || 'Artifact') : type === 'collection' ? String(item.name || 'Collection') : sourceTitle(item)
  return <div class="folio-library-view folio-object-view">
    <button type="button" class="folio-back-link" onClick={onBack}><Icon name="back" size={16}/>Back to {type === 'artifact' ? 'Files' : type === 'collection' ? 'Collections' : type === 'book' ? 'Books' : 'All sources'}</button>
    <header class="folio-object-header"><div><RecordMeta>{type === 'source' ? `${sourceFormat(item)} · ${sourceState(item)}` : type === 'artifact' ? `${fileKind(item)} · ${formatBytes(item.size_bytes) || 'size unavailable'}` : type === 'book' ? `Book · ${formatStatus(item.status)}` : `Collection · ${item.item_count || 0} sources`}</RecordMeta><h1>{title}</h1><p>{type === 'collection' ? item.description || 'No description recorded.' : type === 'artifact' ? item.metadata?.source_title || 'Owned file in the R2 library.' : `${sourceCreator(item)}${item.created_at ? ` · added ${formatDate(item.created_at)}` : ''}`}</p></div></header>
    {type === 'source' && <SourceObject item={item} record={data} handlers={handlers}/>}
    {type === 'artifact' && <ArtifactObject item={item}/>}
    {type === 'book' && <BookObject item={item} handlers={handlers}/>}
    {type === 'collection' && <CollectionObject item={item}/>}
  </div>
}

function SourceObject({ item, record, handlers }: { item: LibraryRecord; record: LibraryRecord; handlers: LibraryViewHandlers }) {
  const thread = (record.threads || [])[0]
  const artifacts = record.artifacts || []
  const notes = record.notes || []
  return <div class="folio-object-sections">
    <section class="folio-object-section"><h2>Source access</h2><div class="folio-row-actions">{sourceLink(item) && <a class="folio-button folio-button-primary" href={sourceLink(item)!} target="_blank" rel="noreferrer">Open original</a>}{item.notebook_url && <a class="folio-button" href={item.notebook_url} target="_blank" rel="noreferrer">Open NotebookLM</a>}</div><p class="folio-record-note">Opening this source is passive. Start a tracked learning session from Queue.</p></section>
    {thread && <section class="folio-object-section"><h2>Learning Thread</h2><a class="folio-linked-object" href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`}><strong>{thread.title}</strong><span>{thread.role || 'Attached source'} · {formatStatus(thread.status)}</span></a>{thread.expected_contribution && <p>{thread.expected_contribution}</p>}</section>}
    <section class="folio-object-section"><div class="folio-section-heading"><h2>Files</h2><span>{artifacts.length}</span></div>{artifacts.length ? artifacts.map((file: LibraryRecord) => <a class="folio-linked-object" href={artifactLink(file)} target="_blank" rel="noreferrer" key={file.id}><strong>{file.filename || fileKind(file)}</strong><span>{fileKind(file)} · passive open</span></a>) : <p class="folio-record-note">No linked files yet.</p>}</section>
    {notes.map((note: LibraryRecord) => <section class="folio-object-section" key={note.id}><div class="folio-section-heading"><h2>{note.kind === 'reflection' ? 'Reflection' : 'Extracted note'}</h2><span>{formatStatus(note.status || 'draft')}</span></div>{(note.sections || []).map((section: LibraryRecord) => <div class="folio-bilingual-block" dir={section.direction || 'auto'} key={section.section_key}><strong>{section.label || labelize(section.section_key || 'section')}</strong><p>{section.content}</p></div>)}</section>)}
  </div>
}

function ArtifactObject({ item }: { item: LibraryRecord }) {
  const metadata = item.metadata || {}
  return <div class="folio-object-sections"><section class="folio-object-section"><h2>Artifact access</h2><div class="folio-row-actions"><a class="folio-button folio-button-primary" href={artifactLink(item)} target="_blank" rel="noreferrer">Open {fileKind(item)}</a></div><dl class="folio-property-list"><div><dt>Filename</dt><dd>{item.filename || 'Unnamed file'}</dd></div><div><dt>Source</dt><dd>{metadata.source_title || metadata.source_url || 'Not linked'}</dd></div><div><dt>Created</dt><dd>{formatDate(item.created_at)}</dd></div><div><dt>Role</dt><dd>{metadata.role || fileKind(item)}</dd></div></dl></section></div>
}

function BookObject({ item, handlers }: { item: LibraryRecord; handlers: LibraryViewHandlers }) {
  return <div class="folio-object-sections"><section class="folio-object-section"><h2>Book access</h2><p>Books use the same source lifecycle. Queue owns tracked reading starts; the original link remains a passive browse action here.</p><div class="folio-row-actions">{sourceLink(item) && <a class="folio-button" href={sourceLink(item)!} target="_blank" rel="noreferrer">Browse source</a>}{String(item.learning_state || '') === 'inbox' && <button type="button" class="folio-button folio-button-primary" onClick={() => handlers.onQueue(item)}>Queue book</button>}</div></section><section class="folio-object-section"><h2>Chapters</h2><BookChapters book={item} handlers={handlers}/></section></div>
}

function CollectionObject({ item }: { item: LibraryRecord }) {
  return <div class="folio-object-sections"><section class="folio-object-section"><h2>Collection boundary</h2><p>{item.description || 'This collection has no description yet.'}</p><dl class="folio-property-list"><div><dt>Scope</dt><dd>{formatStatus(item.scope || 'library')}</dd></div><div><dt>Sources</dt><dd>{item.item_count || 0}</dd></div><div><dt>Updated</dt><dd>{formatDate(item.updated_at)}</dd></div></dl></section></div>
}
