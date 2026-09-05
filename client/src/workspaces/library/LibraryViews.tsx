import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../../api'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'
import { OfflinePackControl } from '../../components/OfflinePackControl'
import { SourceHealthControl } from '../../components/SourceHealthControl'
import { offlineDataResource, offlinePairResources, type OfflinePackResource } from '../../offlinePacks'
import { useData } from '../../app/useData'
import { itemHref } from '../../app/router'
import { ItemSections, useItemSection } from '../../components/ItemSections'
import { BookChapterRows, BooksView, ChapterManagerDialog, computeBookProgress, ReadingFormatLinks } from './BooksView'
import { bookChapters, bookNextChapter, bookReadingState } from './bookModel'
import { noteHref } from '../learn/helpers'
import type { LibraryRecord, LibrarySelection, LibraryViewHandlers } from './types'
import {
  artifactLink,
  artifactSelection,
  bookSelection,
  fileKind,
  formatBytes,
  formatQueueMeta,
  formatReason,
  formatStatus,
  objectHref,
  offlineArtifactSnapshot,
  parseMetadata,
  sourceCreator,
  sourceFormat,
  sourceLink,
  sourceSelection,
  sourceState,
  sourceTitle,
} from './types'

export type { LibraryViewHandlers } from './types'

function offlineSourceItemSnapshot(item: LibraryRecord, html?: LibraryRecord | null, pdf?: LibraryRecord | null) {
  const rawBranch = item.branch && typeof item.branch === 'object' ? item.branch : {}
  const branchId = rawBranch.id || item.verified_branch_id || item.branch_id || null
  const branchLabel =
    rawBranch.label ||
    item.verified_branch_label ||
    item.branch_label ||
    (typeof item.branch === 'string' ? item.branch : null)
  return {
    id: item.id,
    video_title: sourceTitle(item),
    creator: sourceCreator(item),
    content_type: sourceFormat(item),
    video_url: sourceLink(item),
    notebook_url: item.notebook_url,
    status: item.status,
    learning_state: item.learning_state,
    created_at: item.created_at,
    updated_at: item.updated_at,
    why_this: item.why_this,
    context_brief: item.context_brief,
    estimated_minutes: item.estimated_minutes,
    branch:
      branchId || branchLabel
        ? {
            id: branchId,
            label: branchLabel,
            status: rawBranch.status || item.verified_branch_status || item.branch_status || null,
            super_category: rawBranch.super_category || item.verified_branch_domain || item.super_category || null,
          }
        : null,
    branch_id: branchId,
    branch_label: branchLabel,
    companions: {
      html: offlineArtifactSnapshot(html),
      pdf: offlineArtifactSnapshot(pdf),
    },
  }
}

function sourceOfflineResources(
  item: LibraryRecord,
  html?: LibraryRecord | null,
  pdf?: LibraryRecord | null,
): OfflinePackResource[] {
  const sourceId = String(item.id)
  const pair = offlinePairResources(html, pdf, sourceId)
  if (!pair.length) return []
  const companions = {
    html: offlineArtifactSnapshot(html),
    pdf: offlineArtifactSnapshot(pdf),
  }
  const snapshot = {
    offline_snapshot: true,
    item: offlineSourceItemSnapshot(item, html, pdf),
    sessions: [],
    threads: [],
    annotations: [],
    learning_units: [],
    disposition: null,
    feedback: [],
    consolidation: null,
    notes: [],
    artifacts: [companions.html, companions.pdf].filter(Boolean),
    companion: companions.html || companions.pdf,
    companions,
    book_chapters: [],
    canon_memberships: [],
    srs: {
      drafts: [],
      cards: [],
      recall_summary: { count: 0, due: 0 },
    },
    outcome: null,
    memory_influences: [],
    proposals: [],
    jobs: [],
  }
  return [...pair, offlineDataResource(`/capture/${encodeURIComponent(sourceId)}/record`, sourceId, snapshot)]
}

function RecordMeta({ children }: { children: preact.ComponentChildren }) {
  return <span class="folio-record-meta">{children}</span>
}

function recallScheduleLabel(card: LibraryRecord) {
  const status = String(card.repair_status || 'active')
  if (status === 'paused') return 'Paused · schedule preserved'
  if (status === 'retired') return 'Retired · outside due review'
  return `Due ${formatDate(card.due_at)}`
}

function RowTitle({
  item,
  type = 'source',
}: {
  item: LibraryRecord
  type?: 'source' | 'artifact' | 'book'
  onInspect?: (selection: LibrarySelection) => void
}) {
  const selection =
    type === 'artifact' ? artifactSelection(item) : type === 'book' ? bookSelection(item) : sourceSelection(item)
  const href = type === 'artifact' ? objectHref(type, String(item.id)) : itemHref(item)
  return (
    <a href={href} class="folio-object-btn">
      <span class="folio-object-copy">
        <strong>{selection.title}</strong>
        <small>
          {type === 'artifact'
            ? `${fileKind(item)}${item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ''}`
            : `${sourceCreator(item)} · ${sourceFormat(item)}`}
        </small>
      </span>
      <Icon name="chevron" size={16} />
    </a>
  )
}

function ViewEmpty({ title, body }: { title: string; body: string }) {
  return <Empty title={title} body={body} />
}

export function QueueView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const items = useMemo(() => (Array.isArray(data.items) ? data.items : []), [data.items])
  const cap = Number(data.cap || 5)
  const [viewMode, setViewMode] = useState<'gallery' | 'ledger'>(() => {
    if (typeof window === 'undefined') return 'ledger'
    return window.localStorage.getItem('learning-compass.queue-view') === 'gallery' ? 'gallery' : 'ledger'
  })
  const resolvedContext = data.delivery_context?.context || {}
  const [effort, setEffort] = useState('')
  const [depthTier, setDepthTier] = useState('')
  const [matchesOnly, setMatchesOnly] = useState(false)
  const [healthFilter, setHealthFilter] = useState<
    'all' | 'attention' | 'verified' | 'unavailable' | 'restricted' | 'unknown' | 'invalid' | 'unchecked'
  >('all')
  const visibleItems = useMemo(
    () =>
      items.filter((item: LibraryRecord) => {
        const status = String(item.source_health?.status || '')
        if (healthFilter === 'all') return true
        if (healthFilter === 'unchecked') return !status
        if (healthFilter === 'attention') return Boolean(status && status !== 'verified')
        return status === healthFilter
      }),
    [items, healthFilter],
  )

  const changeDelivery = (next: { effort?: string; depth_tier?: string; matches_only?: boolean }) => {
    const nextEffort = next.effort ?? effort
    const nextDepth = next.depth_tier ?? depthTier
    const nextMatches = next.matches_only ?? matchesOnly
    setEffort(nextEffort)
    setDepthTier(nextDepth)
    setMatchesOnly(nextMatches)
    handlers.onQueueDeliveryChange?.({
      ...(nextEffort ? { effort: nextEffort } : {}),
      ...(nextDepth ? { depth_tier: nextDepth } : {}),
      matches_only: nextMatches,
    })
  }

  const changeView = (next: 'gallery' | 'ledger') => {
    setViewMode(next)
    window.localStorage.setItem('learning-compass.queue-view', next)
  }

  return (
    <div class={`folio-library-view folio-queue-view folio-queue-view-${viewMode}`}>
      <div class="folio-view-intro">
        <div>
          <p class="folio-kicker">A bounded shelf of commitments</p>
          <h1>Queue</h1>
          <p>Start one source at a time. The shelf stays small enough to remember why each item matters.</p>
        </div>
        <div class="folio-view-intro-actions">
          <div class="folio-view-toggle" role="group" aria-label="Queue view">
            <button
              type="button"
              class={viewMode === 'gallery' ? 'active' : ''}
              aria-pressed={viewMode === 'gallery'}
              onClick={() => changeView('gallery')}
            >
              Gallery
            </button>
            <button
              type="button"
              class={viewMode === 'ledger' ? 'active' : ''}
              aria-pressed={viewMode === 'ledger'}
              onClick={() => changeView('ledger')}
            >
              Ledger
            </button>
          </div>
          <span class="folio-cap-readout">
            <strong>{items.length}</strong>
            <small>of {cap} active</small>
          </span>
        </div>
      </div>
      <div class="folio-view-toggle" role="group" aria-label="Queue delivery context">
        <select
          aria-label="Queue effort"
          value={effort}
          onChange={(event) => changeDelivery({ effort: (event.currentTarget as HTMLSelectElement).value })}
        >
          <option value="">Effort: {resolvedContext.effort || 'default'}</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="deep">Deep</option>
        </select>
        <select
          aria-label="Queue depth"
          value={depthTier}
          onChange={(event) => changeDelivery({ depth_tier: (event.currentTarget as HTMLSelectElement).value })}
        >
          <option value="">Depth: {data.delivery_context?.effective_depth_tier || 'adaptive'}</option>
          <option value="adaptive">Adaptive</option>
          <option value="introductory">Introductory</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={matchesOnly}
            onChange={(event) => changeDelivery({ matches_only: (event.currentTarget as HTMLInputElement).checked })}
          />{' '}
          Show matches only
        </label>
        <select
          aria-label="Queue source health"
          value={healthFilter}
          onChange={(event) => setHealthFilter((event.currentTarget as HTMLSelectElement).value as typeof healthFilter)}
        >
          <option value="all">Health: all</option>
          <option value="attention">Needs attention</option>
          <option value="unavailable">Unavailable</option>
          <option value="restricted">Restricted</option>
          <option value="unknown">Unknown</option>
          <option value="invalid">Invalid URL</option>
          <option value="verified">Verified</option>
          <option value="unchecked">Not checked</option>
        </select>
      </div>
      {items.length > cap && (
        <div class="folio-overflow-notice" role="status">
          <strong>Override is active.</strong> {items.length - cap} extra{' '}
          {items.length - cap === 1 ? 'item is' : 'items are'} waiting. Finish or remove one to return to the five-item
          cap.
        </div>
      )}
      {visibleItems.length ? (
        <div class="folio-record-list" aria-label="Active queue">
          {visibleItems.map((item: LibraryRecord, index: number) => {
            const href = sourceLink(item)
            const startKind =
              item.recommended_start === 'html' || item.recommended_start === 'pdf'
                ? item.recommended_start
                : 'original'
            const artifact = (item.artifacts || {})[startKind]
            const startHref = artifact?.id ? `/artifacts/${artifact.id}` : href
            const isBook = item.content_type === 'book' || item.is_book_chapter
            const offlineResources = isBook
              ? []
              : sourceOfflineResources(item, item.companions?.html, item.companions?.pdf)
            return (
              <article
                class="folio-record folio-queue-record"
                key={item.chapter_key ? `${item.id}:${item.chapter_key}` : item.id}
              >
                <span class="folio-rank" aria-label={`Queue position ${index + 1}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div class="folio-record-main">
                  <RecordMeta>
                    {formatQueueMeta(item)} · {item.learning_state === 'in_progress' ? 'In progress' : 'Queued'}
                  </RecordMeta>
                  <RowTitle item={item} type={isBook ? 'book' : 'source'} onInspect={handlers.onInspect} />
                  <p class="folio-record-reason">{formatReason(item)}</p>
                  {Boolean(
                    item.branch?.label ||
                    item.branch_preflight?.branch_label ||
                    item.branch_label ||
                    (typeof item.branch === 'string' && item.branch),
                  ) && (
                    <div class="folio-queue-badges" aria-label="Branch context">
                      <a
                        class="folio-badge folio-badge-branch"
                        href={`#/map/branch/${encodeURIComponent(String(item.branch?.id || item.branch_preflight?.branch_id || item.branch_id || item.branch?.label || item.branch_label || item.branch))}`}
                        title="Open branch dossier"
                      >
                        <span class="badge-format">Branch</span>
                        <span>
                          {item.branch?.label ||
                            item.branch_preflight?.branch_label ||
                            item.branch_label ||
                            (typeof item.branch === 'string' ? item.branch : '')}
                        </span>
                      </a>
                      {item.note ? (
                        <a
                          class="folio-badge folio-badge-note"
                          href={item.note?.id ? noteHref(String(item.note.id)) : itemHref(item, 'notes')}
                          title="Open item notes"
                        >
                          Note taken: {item.note.title}
                        </a>
                      ) : (
                        <span class="folio-badge folio-badge-muted">No note yet</span>
                      )}
                      {item.recall &&
                        (item.recall.count > 0 ? (
                          <a
                            class="folio-badge folio-badge-recall"
                            href={itemHref(item, 'recall')}
                            title="Open item recall cards"
                          >
                            {item.recall.count} approved {item.recall.count === 1 ? 'card' : 'cards'}
                            {item.recall.due > 0 ? ` · ${item.recall.due} due today` : ''}
                          </a>
                        ) : (
                          <span class="folio-badge folio-badge-muted">No approved recall</span>
                        ))}
                      {item.companions?.html && (
                        <a
                          class="folio-badge folio-badge-html"
                          href={`/artifacts/${encodeURIComponent(String(item.companions.html.id))}`}
                          title="Open Arabic reading companion"
                        >
                          Read HTML
                        </a>
                      )}
                      {item.companions?.pdf && (
                        <a
                          class="folio-badge folio-badge-pdf"
                          href={`/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`}
                          title="Download A4 companion"
                        >
                          PDF
                        </a>
                      )}
                    </div>
                  )}
                  {item.branch_preflight?.conflict && (
                    <p class="folio-inline-warning" role="alert">
                      Mapped to the pruned branch “{item.branch_preflight.branch_label}”. Review the mapping before
                      starting.
                    </p>
                  )}
                  {item.branch_preflight?.status === 'unmapped' && (
                    <p class="folio-record-note">Branch match is not verified yet.</p>
                  )}
                  {item.compass && (
                    <p class="folio-record-note">
                      Compass fit {Math.round(Number(item.compass.score || 0) * 100)}% · confidence{' '}
                      {Math.round(Number(item.compass.confidence || 0) * 100)}%
                    </p>
                  )}
                  {item.delivery_match && (
                    <p class="folio-record-note">
                      Delivery {item.delivery_match.matches ? 'matches' : 'differs'} · advisory only
                    </p>
                  )}
                  {!isBook && (
                    <div class="folio-source-durability-actions">
                      <SourceHealthControl
                        compact
                        sourceId={String(item.id)}
                        sourceUrl={sourceLink(item)}
                        companionHref={
                          offlineResources.length
                            ? item.companions?.html?.id
                              ? `/artifacts/${encodeURIComponent(String(item.companions.html.id))}`
                              : `/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`
                            : null
                        }
                      />
                      <OfflinePackControl
                        compact
                        packId={`queue-source:${item.id}`}
                        title={sourceTitle(item)}
                        scope="queue-source"
                        resources={offlineResources}
                      />
                    </div>
                  )}
                  <div class="folio-row-actions">
                    {href && (
                      <a
                        class="folio-button folio-button-primary"
                        href={startHref || href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) =>
                          handlers.onStart(
                            event,
                            item,
                            startHref || href,
                            startKind as 'original' | 'html' | 'pdf',
                            artifact?.id,
                          )
                        }
                      >
                        {item.learning_state === 'in_progress' ? 'Resume' : 'Start'}
                      </a>
                    )}
                    {isBook && item.chapter_key ? (
                      <button
                        type="button"
                        class="folio-button"
                        onClick={() =>
                          handlers.onCompleteChapter(
                            { id: item.book_id || item.id, ...item },
                            item.chapter || { key: item.chapter_key, title: item.chapter_title, completed: false },
                          )
                        }
                        disabled={handlers.busyId === `${item.book_id || item.id}:${item.chapter_key}`}
                        aria-label={`Mark ${item.chapter_title || 'chapter'} finished`}
                      >
                        <Icon name="check" size={14} />
                        <span>Mark done</span>
                      </button>
                    ) : null}
                    <a
                      class="folio-button"
                      href={objectHref(isBook ? 'book' : 'source', String(item.book_id || item.id))}
                    >
                      {isBook ? 'Book desk' : 'Record'}
                    </a>
                    {!isBook && (
                      <button
                        type="button"
                        class="folio-button"
                        onClick={() => handlers.onExclude(item)}
                        disabled={handlers.busyId === item.id}
                        aria-label={`Exclude ${sourceTitle(item)} from Queue`}
                      >
                        Exclude
                      </button>
                    )}
                  </div>
                  {!isBook && (
                    <small class="folio-action-note">
                      Exclude is administrative and does not count as a bad-fit signal.
                    </small>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <ViewEmpty
          title={items.length ? 'No sources match this health filter' : 'Queue is clear'}
          body={
            items.length
              ? 'Choose another source-health status to return to the Queue.'
              : 'A source appears here only after a deliberate commitment.'
          }
        />
      )}
      {handlers.notice && (
        <p class="folio-action-status" role="status">
          {handlers.notice}
        </p>
      )}
    </div>
  )
}

export { FeedsView } from './FeedsView'

function artifactGroups(items: LibraryRecord[]) {
  const groups = new Map<string, LibraryRecord[]>()
  for (const item of items) {
    const metadata = item.metadata || {}
    const key = metadata.pair_id || item.id
    groups.set(String(key), [...(groups.get(String(key)) || []), item])
  }
  return [...groups.values()].sort((a, b) =>
    String(b[0]?.created_at || '').localeCompare(String(a[0]?.created_at || '')),
  )
}

export function FilesView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [query, setQuery] = useState('')
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)
  const items = useMemo(() => (Array.isArray(data.artifacts) ? data.artifacts : []), [data.artifacts])
  const groups = useMemo(() => artifactGroups(items), [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((group) => {
      const primary = group[0]
      const metadata = primary.metadata || {}
      const topic =
        group.find((f) => f.topic || f.metadata?.topic)?.topic ||
        group.find((f) => f.metadata?.topic)?.metadata?.topic ||
        primary.topic ||
        metadata.topic ||
        ''
      const text =
        `${metadata.source_title || ''} ${primary.filename || ''} ${topic} ${group.map((f) => f.filename || '').join(' ')}`.toLowerCase()
      return text.includes(q)
    })
  }, [groups, query])

  return (
    <div class="folio-library-view folio-files-view">
      <div class="folio-view-intro">
        <div>
          <p class="folio-kicker">R2-backed reading material</p>
          <h1>Files</h1>
          <p>Generated companions and uploaded documents. Open HTML to read or download PDF for offline annotation.</p>
        </div>
        <span class="folio-count-readout">
          <strong>{filtered.length}</strong>
          <small>{filtered.length === 1 ? 'document' : 'documents'}</small>
        </span>
      </div>

      <label class="folio-search-field">
        <span>Filter files</span>
        <input
          type="search"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          placeholder="Filter by title, topic, or filename…"
        />
      </label>

      {filtered.length ? (
        <div class="folio-files-ledger" aria-label="Source artifacts">
          {filtered.map((group) => {
            const primary = group[0]
            const metadata = primary.metadata || {}
            const groupRecord = { ...primary, _group: group }
            const groupKey = String(metadata.pair_id || primary.id)
            const htmlFile = group.find((f) => fileKind(f) === 'HTML' || String(f.filename || '').endsWith('.html'))
            const pdfFile = group.find((f) => fileKind(f) === 'PDF' || String(f.filename || '').endsWith('.pdf'))
            const originalUrl =
              group.find((f) => f.source_url || f.metadata?.source_url)?.source_url ||
              group.find((f) => f.metadata?.source_url)?.metadata?.source_url ||
              primary.source_url ||
              metadata.source_url ||
              primary.video_url ||
              null
            const notebookUrl =
              group.find((f) => f.notebook_url || f.metadata?.notebook_url)?.notebook_url ||
              group.find((f) => f.metadata?.notebook_url)?.metadata?.notebook_url ||
              primary.notebook_url ||
              metadata.notebook_url ||
              null
            const topic =
              group.find((f) => f.topic || f.metadata?.topic)?.topic ||
              group.find((f) => f.metadata?.topic)?.metadata?.topic ||
              primary.topic ||
              metadata.topic ||
              null
            const title = metadata.source_title || primary.filename || 'Owned reading artifact'
            const primaryHref = metadata.recommendation_id
              ? itemHref({ recommendation_id: metadata.recommendation_id, content_type: metadata.source_type }, 'files')
              : objectHref('artifact', String(primary.id))

            return (
              <article class="folio-file-card" key={groupKey}>
                <a class="folio-file-main-link" href={primaryHref} title={`Open ${title}`}>
                  <span class="folio-file-body">
                    <span class="folio-file-title" dir="auto">
                      {title}
                    </span>
                    <span class="folio-file-sub">
                      <span>{formatDate(primary.created_at)}</span>
                      {topic && (
                        <>
                          <span class="folio-file-sep">·</span>
                          <span class="folio-file-topic">{topic}</span>
                        </>
                      )}
                      {group.length > 1 && <span class="folio-file-sep">·</span>}
                      {group.length > 1 && <span>{group.length} files</span>}
                    </span>
                  </span>
                </a>

                <div class="folio-file-actions">
                  {originalUrl && (
                    <a
                      class="folio-file-badge folio-badge-source"
                      href={originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open original source"
                    >
                      <span class="badge-format">Source</span>
                    </a>
                  )}

                  {notebookUrl && (
                    <a
                      class="folio-file-badge folio-badge-nblm"
                      href={notebookUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open Google NotebookLM notebook"
                    >
                      <span class="badge-format">NBLM</span>
                    </a>
                  )}

                  {htmlFile && (
                    <a
                      class="folio-file-badge folio-badge-html"
                      href={artifactLink(htmlFile)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open HTML Companion"
                    >
                      <span class="badge-format">HTML</span>
                    </a>
                  )}

                  {pdfFile && (
                    <a
                      class="folio-file-badge folio-badge-pdf"
                      href={artifactLink(pdfFile)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open / Download PDF Companion"
                    >
                      <span class="badge-format">PDF</span>
                    </a>
                  )}

                  <div class="folio-file-admin">
                    {confirmDeleteKey === groupKey ? (
                      <div class="folio-inline-confirm">
                        <span class="folio-confirm-label">Delete?</span>
                        <button
                          type="button"
                          class="folio-file-admin-btn folio-btn-danger folio-btn-confirm-yes"
                          onClick={() => {
                            setConfirmDeleteKey(null)
                            handlers.onDeleteArtifact(groupRecord, true)
                          }}
                          disabled={handlers.busyId === primary.id}
                          title="Confirm delete"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          class="folio-file-admin-btn folio-btn-confirm-no"
                          onClick={() => setConfirmDeleteKey(null)}
                          title="Cancel delete"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        class="folio-file-admin-btn folio-btn-danger"
                        onClick={() => setConfirmDeleteKey(groupKey)}
                        disabled={handlers.busyId === primary.id}
                        title="Remove file group"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <ViewEmpty
          title={query ? 'No matching files' : 'No files yet'}
          body={
            query
              ? 'Try a shorter search query.'
              : 'Uploaded documents and generated HTML/PDF companions will appear here.'
          }
        />
      )}
      {handlers.notice && (
        <p class="folio-action-status" role="status">
          {handlers.notice}
        </p>
      )}
    </div>
  )
}

export { BooksView }

export function ArchiveView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [filter, setFilter] = useState<'all' | 'consumed' | 'rejected'>('all')
  const all = Array.isArray(data.recommendations) ? data.recommendations : []
  const archived = all.filter((item: LibraryRecord) => ['consumed', 'rejected'].includes(String(item.status)))
  const items = filter === 'all' ? archived : archived.filter((item: LibraryRecord) => item.status === filter)
  return (
    <div class="folio-library-view folio-archive-view">
      <div class="folio-view-intro">
        <div>
          <p class="folio-kicker">Recovery without clutter</p>
          <h1>Archive</h1>
          <p>
            Completed sources and explicit exclusions stay findable, with their branch, notes, recall, and companions
            still linked.
          </p>
        </div>
        <span class="folio-count-readout">
          <strong>{archived.length}</strong>
          <small>archived</small>
        </span>
      </div>
      <div class="folio-filter-row" role="group" aria-label="Archive status">
        <span>Show</span>
        {(['all', 'consumed', 'rejected'] as const).map((value) => (
          <button type="button" class={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>
            {value === 'all' ? 'All' : value === 'consumed' ? 'Completed' : 'Excluded'}
          </button>
        ))}
      </div>
      {items.length ? (
        <div class="folio-record-list" aria-label="Archived sources">
          {items.map((item: LibraryRecord) => (
            <article class="folio-record" key={item.id}>
              <div class="folio-record-main">
                <RecordMeta>
                  {sourceFormat(item)} · {formatStatus(item.status)} · {formatDate(item.created_at)}
                </RecordMeta>
                <RowTitle item={item} onInspect={handlers.onInspect} />
                <BranchContextBadges item={item} />
                <p class="folio-record-reason">{item.user_review || formatReason(item)}</p>
                <div class="folio-row-actions">
                  <a class="folio-button" href={itemHref(item)}>
                    Open item
                  </a>
                  <button
                    type="button"
                    class="folio-button danger-button"
                    onClick={() => handlers.onDeleteRecommendationPermanently(item)}
                    disabled={handlers.busyId === `permanent-delete:${item.id}`}
                  >
                    {handlers.busyId === `permanent-delete:${item.id}` ? 'Deleting forever…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <ViewEmpty title="No archived items" body="Completed and excluded sources will appear here." />
      )}
    </div>
  )
}

function BranchContextBadges({ item }: { item: LibraryRecord }) {
  const branchLabel =
    item.branch?.label ||
    item.branch_preflight?.branch_label ||
    item.branch_label ||
    (typeof item.branch === 'string' ? item.branch : '')
  const branchId = item.branch?.id || item.branch_preflight?.branch_id || item.branch_id || branchLabel
  if (!branchLabel && !item.note && !item.recall?.count && !item.companions?.html && !item.companions?.pdf) return null
  return (
    <div class="folio-queue-badges" aria-label="Branch context">
      {branchLabel && (
        <a
          class="folio-badge folio-badge-branch"
          href={`#/map/branch/${encodeURIComponent(String(branchId))}`}
          title="Open branch dossier"
        >
          <span class="badge-format">Branch</span>
          <span>{branchLabel}</span>
        </a>
      )}
      {item.note ? (
        <a
          class="folio-badge folio-badge-note"
          href={item.note?.id ? noteHref(String(item.note.id)) : itemHref(item, 'notes')}
          title="Open item notes"
        >
          Note taken: {item.note.title}
        </a>
      ) : null}
      {item.recall?.count > 0 ? (
        <a class="folio-badge folio-badge-recall" href={itemHref(item, 'recall')} title="Open item recall cards">
          {item.recall.count} approved {item.recall.count === 1 ? 'card' : 'cards'}
          {item.recall.due > 0 ? ` · ${item.recall.due} due today` : ''}
        </a>
      ) : null}
      {item.companions?.html && (
        <a
          class="folio-badge folio-badge-html"
          href={`/artifacts/${encodeURIComponent(String(item.companions.html.id))}`}
          title="Open Arabic reading companion"
        >
          Read HTML
        </a>
      )}
      {item.companions?.pdf && (
        <a
          class="folio-badge folio-badge-pdf"
          href={`/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`}
          title="Download A4 companion"
        >
          PDF
        </a>
      )}
    </div>
  )
}

export function ObjectRouteView({
  type,
  data,
  handlers,
  onBack,
}: {
  type: 'source' | 'artifact' | 'book'
  data: LibraryRecord
  handlers: LibraryViewHandlers
  onBack: () => void
}) {
  const item = data.item || data.artifact || data.book || data
  if (type === 'book' || (type === 'source' && item.content_type === 'book'))
    return (
      <div class="folio-library-view folio-object-view book-dossier-view">
        <BookObject item={item} record={data} handlers={handlers} onBack={onBack} />
      </div>
    )
  const title = type === 'artifact' ? String(item.filename || 'Artifact') : sourceTitle(item)
  return (
    <div class="folio-library-view folio-object-view">
      <button type="button" class="folio-back-link" onClick={onBack}>
        <Icon name="back" size={16} />
        Back to {type === 'artifact' ? 'Files' : 'Library'}
      </button>
      <header class="folio-object-header">
        <div>
          <RecordMeta>
            {type === 'source'
              ? `${sourceFormat(item)} · ${sourceState(item)}`
              : `${fileKind(item)} · ${formatBytes(item.size_bytes) || 'size unavailable'}`}
          </RecordMeta>
          <h1>{title}</h1>
          <p>
            {type === 'artifact'
              ? item.metadata?.source_title || 'Owned file in the R2 library.'
              : `${sourceCreator(item)}${item.created_at ? ` · added ${formatDate(item.created_at)}` : ''}`}
          </p>
        </div>
      </header>
      {type === 'source' && <SourceObject item={item} record={data} handlers={handlers} />}
      {type === 'artifact' && <ArtifactObject item={item} />}
    </div>
  )
}

function SourceObject({
  item,
  record,
  handlers,
}: {
  item: LibraryRecord
  record: LibraryRecord
  handlers: LibraryViewHandlers
}) {
  const threads: LibraryRecord[] = record.threads || []
  const artifacts: LibraryRecord[] = record.artifacts || []
  const notes: LibraryRecord[] = record.notes || []
  const units: LibraryRecord[] = record.learning_units || []
  const sessions: LibraryRecord[] = record.sessions || []
  const cards: LibraryRecord[] = record.srs?.cards || []
  const drafts: LibraryRecord[] = (record.srs?.drafts || []).filter((draft: LibraryRecord) => draft.status === 'draft')
  const companions = record.companions || {}
  const recall = record.srs?.recall_summary || { count: 0, due: 0 }
  const branch = item.branch || null
  const sections = [
    { key: 'overview', label: 'Overview' },
    { key: 'files', label: 'Files', count: artifacts.length },
    { key: 'notes', label: 'Notes & passages', count: notes.length },
    { key: 'recall', label: 'Recall', count: cards.length },
    { key: 'connections', label: 'Connections', count: threads.length + units.length + (branch?.id ? 1 : 0) },
    { key: 'history', label: 'History', count: sessions.length },
    { key: 'feedback', label: 'Reflection' },
  ]
  const active = useItemSection(sections)
  const notebookUrl =
    item.notebook_url ||
    artifacts.map((file) => file.notebook_url || parseMetadata(file.metadata_json).notebook_url).find(Boolean)
  const companionHtml = artifacts.find((file) => String(file.id) === String(companions.html?.id)) || companions.html
  const companionPdf = artifacts.find((file) => String(file.id) === String(companions.pdf?.id)) || companions.pdf
  const offlineResources = sourceOfflineResources(item, companionHtml, companionPdf)
  return (
    <div class="source-item-page">
      {branch && (
        <div class="item-page-context">
          {branch.id && branch.linkable !== false ? (
            <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}>
              {branch.label}
            </a>
          ) : (
            <span class="folio-badge">{branch.label}</span>
          )}
        </div>
      )}
      <ItemSections sections={sections} active={active} />
      <div class="item-section-panel" hidden={active !== 'overview'}>
        <section class="folio-object-section">
          <h2>Source access</h2>
          {item.context_brief || item.why_this ? (
            <p class="item-page-intro">{item.context_brief || item.why_this}</p>
          ) : null}
          <div class="folio-row-actions">
            {sourceLink(item) && (
              <a class="folio-button folio-button-primary" href={sourceLink(item)!} target="_blank" rel="noreferrer">
                Open original · online only
              </a>
            )}
            {companions.html && (
              <a
                class="folio-button"
                href={`/artifacts/${encodeURIComponent(String(companions.html.id))}`}
                target="_blank"
                rel="noreferrer"
              >
                Read HTML
              </a>
            )}
            {companions.pdf && (
              <a
                class="folio-button"
                href={`/artifacts/${encodeURIComponent(String(companions.pdf.id))}`}
                target="_blank"
                rel="noreferrer"
              >
                Open PDF
              </a>
            )}
            {notebookUrl && (
              <a class="folio-button" href={notebookUrl} target="_blank" rel="noreferrer">
                Open NotebookLM · online only
              </a>
            )}
          </div>
          <dl class="folio-property-list">
            <div>
              <dt>Status</dt>
              <dd>{sourceState(item)}</dd>
            </div>
            <div>
              <dt>Creator</dt>
              <dd>{sourceCreator(item)}</dd>
            </div>
            {item.estimated_minutes && (
              <div>
                <dt>Estimated time</dt>
                <dd>{item.estimated_minutes} minutes</dd>
              </div>
            )}
            {item.user_rating != null && (
              <div>
                <dt>Your rating</dt>
                <dd>{item.user_rating}/10</dd>
              </div>
            )}
          </dl>
        </section>
        {sourceLink(item) && (
          <SourceHealthControl
            sourceId={String(item.id)}
            sourceUrl={sourceLink(item)}
            companionHref={
              offlineResources.length && companions.html?.id
                ? `/artifacts/${encodeURIComponent(String(companions.html.id))}`
                : null
            }
            onReplaced={() => handlers.onReload?.()}
          />
        )}
        <PersonalItemFacts item={record.personal_item} />
        <div class="item-page-summary">
          <a href={itemHref(item, 'files')}>
            <strong>{artifacts.length}</strong>
            <span>Files and reading companions</span>
          </a>
          <a href={itemHref(item, 'notes')}>
            <strong>{notes.length}</strong>
            <span>Notes and saved passages</span>
          </a>
          <a href={itemHref(item, 'connections')}>
            <strong>{threads.length + units.length}</strong>
            <span>Threads and retained ideas</span>
          </a>
        </div>
      </div>
      <div class="item-section-panel" hidden={active !== 'files'}>
        <section class="folio-object-section">
          <div class="folio-section-heading">
            <h2>Files & reading companions</h2>
            <span>{artifacts.length}</span>
          </div>
          {offlineResources.length > 0 && (
            <OfflinePackControl
              packId={`source:${item.id}`}
              title={sourceTitle(item)}
              scope="source"
              resources={offlineResources}
            />
          )}
          <ItemFileList files={artifacts} />
        </section>
      </div>
      <div class="item-section-panel" hidden={active !== 'notes'}>
        <section class="folio-object-section">
          <div class="folio-section-heading">
            <h2>Notes</h2>
            <span>{notes.length}</span>
          </div>
          {notes.length ? (
            notes.map((note) => (
              <a class="folio-linked-object" key={note.id} href={noteHref(String(note.id))}>
                <strong>{note.title || (note.kind === 'reflection' ? 'Your reflection' : 'Source note')}</strong>
                <span>
                  {formatStatus(note.kind)} · {formatDate(note.updated_at)}
                </span>
              </a>
            ))
          ) : (
            <p class="folio-record-note">
              No notes are attached to this item yet. Saved passages stay below until you choose to turn them into a
              note.
            </p>
          )}
        </section>
        <SourceAnnotationPanel source={item} threadId={threads[0]?.id} branchId={branch?.id} />
      </div>
      <div class="item-section-panel" hidden={active !== 'recall'}>
        <section class="folio-object-section">
          <div class="folio-section-heading">
            <h2>Recall cards</h2>
            <span>
              {recall.count} cards{recall.due > 0 ? ` · ${recall.due} active due` : ''}
            </span>
          </div>
          {cards.length ? (
            <ul class="folio-recall-list">
              {cards.map((card) => (
                <li key={card.id}>
                  <a href={`#/learn/card/${encodeURIComponent(String(card.id))}`}>
                    <strong dir="auto">{card.question}</strong>
                  </a>
                  <span>
                    {card.topic || 'General'} · {recallScheduleLabel(card)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="folio-record-note">No learner-authored recall cards for this item yet.</p>
          )}
          {drafts.length > 0 && (
            <div class="folio-draft-strip">
              <span>{drafts.length} pending drafts</span>
              <a class="folio-button" href="#/learn?mode=practice&focus=recall">
                Open Recall
              </a>
            </div>
          )}
        </section>
      </div>
      <div class="item-section-panel" hidden={active !== 'connections'}>
        <section class="folio-object-section">
          <h2>Connected knowledge</h2>
          {branch?.id && branch.linkable !== false && (
            <a class="folio-linked-object" href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}>
              <strong>{branch.label}</strong>
              <span>Knowledge branch</span>
            </a>
          )}
          {threads.map((thread) => (
            <a
              class="folio-linked-object"
              href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`}
              key={thread.id}
            >
              <strong>{thread.title}</strong>
              <span>
                {formatStatus(thread.status)} · {thread.role || 'Attached source'}
              </span>
              {thread.expected_contribution && <p>{thread.expected_contribution}</p>}
            </a>
          ))}
          {units.map((unit) => (
            <a class="folio-linked-object" href={`#/learn/unit/${encodeURIComponent(String(unit.id))}`} key={unit.id}>
              <strong dir="auto">{unit.statement || unit.title}</strong>
              <span>{formatStatus(unit.unit_type || 'concept')}</span>
            </a>
          ))}
          {!threads.length && !units.length && !branch?.id && (
            <p class="folio-record-note">No connections have been recorded for this item yet.</p>
          )}
        </section>
      </div>
      <div class="item-section-panel" hidden={active !== 'history'}>
        <section class="folio-object-section">
          <h2>Learning history</h2>
          {sessions.length ? (
            <ol class="book-session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <strong>{formatStatus(session.status)}</strong>
                  <span>
                    {formatDate(session.started_at)}
                    {session.completed_at ? ` · finished ${formatDate(session.completed_at)}` : ''}
                  </span>
                  {session.intent && <p>{session.intent}</p>}
                  {session.reflection && <blockquote dir="auto">{session.reflection}</blockquote>}
                  {session.target_artifact_id && (
                    <a href={objectHref('artifact', String(session.target_artifact_id))}>Session file</a>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p class="folio-record-note">No tracked sessions yet.</p>
          )}
          {(record.feedback || []).length > 0 && (
            <>
              <h3>Previous feedback</h3>
              {record.feedback.map((entry: LibraryRecord) => (
                <article class="item-history-entry" key={entry.id}>
                  <strong>
                    {formatDate(entry.created_at)} · {formatStatus(entry.outcome)}
                  </strong>
                  {entry.reflection && <p dir="auto">{entry.reflection}</p>}
                  <span>{(entry.reason_tags || []).map((tag: string) => labelize(tag)).join(' · ')}</span>
                </article>
              ))}
            </>
          )}
        </section>
      </div>
      <div class="item-section-panel" hidden={active !== 'feedback'}>
        <SourceFeedbackPanel
          item={item}
          record={record}
          threadId={threads[0]?.id}
          handlers={handlers}
          userScore={Number(item.user_score ?? item.user_rating ?? 0)}
          outcome={record.outcome}
        />
      </div>
    </div>
  )
}

function PersonalItemFacts({ item }: { item?: LibraryRecord | null }) {
  if (!item) return null
  return (
    <section class="folio-object-section">
      <h2>Personal record</h2>
      <dl class="folio-property-list">
        <div>
          <dt>Personal status</dt>
          <dd>{formatStatus(item.state)}</dd>
        </div>
        {item.release_year != null && (
          <div>
            <dt>Released</dt>
            <dd>{item.release_year}</dd>
          </div>
        )}
        {item.duration_minutes != null && (
          <div>
            <dt>Duration</dt>
            <dd>{item.duration_minutes} minutes</dd>
          </div>
        )}
        {item.progress_current != null && (
          <div>
            <dt>Progress</dt>
            <dd>
              {item.progress_current}
              {item.progress_total != null ? ` / ${item.progress_total}` : ''} {item.progress_unit}
            </dd>
          </div>
        )}
        {item.rating != null && (
          <div>
            <dt>Your rating</dt>
            <dd>{item.rating}/10</dd>
          </div>
        )}
        {item.completed_at && (
          <div>
            <dt>Finished</dt>
            <dd>{formatDate(item.completed_at)}</dd>
          </div>
        )}
      </dl>
      {item.personal_note && <blockquote dir="auto">{item.personal_note}</blockquote>}
      {item.tags?.length > 0 && <p class="folio-record-note">{item.tags.join(' · ')}</p>}
    </section>
  )
}

function ItemFileList({ files }: { files: LibraryRecord[] }) {
  return files.length ? (
    <div class="item-file-list">
      {files.map((file) => (
        <div class="item-file-row" key={file.id}>
          <a class="folio-linked-object" href={objectHref('artifact', String(file.id))}>
            <strong>{file.filename || fileKind(file)}</strong>
            <span>
              {fileKind(file)}
              {file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ''}
            </span>
          </a>
          <a
            class="folio-button"
            href={artifactLink(file)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${file.filename || fileKind(file)}`}
          >
            Open
          </a>
        </div>
      ))}
    </div>
  ) : (
    <p class="folio-record-note">No linked files yet.</p>
  )
}

type FeedbackCompletionState = 'completed' | 'in_progress' | 'stopped'

const feedbackReasonOptions: Record<FeedbackCompletionState, Array<[string, string]>> = {
  completed: [
    ['highly_relevant', 'Highly relevant'],
    ['excellent_source', 'Excellent source'],
    ['right_depth', 'Right depth'],
    ['too_shallow', 'Too shallow'],
    ['too_long', 'Too long'],
    ['wrong_format', 'Wrong format'],
  ],
  in_progress: [
    ['not_now', 'Continue later'],
    ['access_problem', 'Access problem'],
    ['wrong_format', 'Wrong format'],
    ['too_long', 'Needs more time'],
  ],
  stopped: [
    ['bad_fit', 'Bad fit'],
    ['wrong_topic', 'Wrong topic'],
    ['too_familiar', 'Too familiar'],
    ['already_mastered', 'Already mastered'],
    ['too_shallow', 'Too shallow'],
    ['too_advanced', 'Too advanced'],
    ['too_long', 'Too long'],
    ['poor_source', 'Poor source'],
    ['wrong_format', 'Wrong format'],
    ['access_problem', 'Access problem'],
    ['other', 'Another reason'],
  ],
}

function SourceFeedbackPanel({
  item,
  record,
  threadId,
  handlers,
  userScore,
  outcome,
}: {
  item: LibraryRecord
  record: LibraryRecord
  threadId?: string
  handlers: LibraryViewHandlers
  userScore: number
  outcome?: LibraryRecord | null
}) {
  const metadata = parseMetadata(item.source_metadata_json)
  const previous = metadata.learning_feedback || {}
  const initialCompletion: FeedbackCompletionState = ['completed', 'in_progress', 'stopped'].includes(
    String(previous.completion_state || ''),
  )
    ? previous.completion_state
    : item.status === 'consumed'
      ? 'completed'
      : 'in_progress'
  const [completionState, setCompletionState] = useState<FeedbackCompletionState>(initialCompletion)
  const [reasonTags, setReasonTags] = useState<string[]>(
    Array.isArray(previous.reason_tags) ? previous.reason_tags : [],
  )
  const [score, setScore] = useState(previous.score ?? (userScore || ''))
  const [disposition, setDisposition] = useState(
    String(record.disposition?.disposition || previous.disposition || 'undecided'),
  )
  const [reflection, setReflection] = useState(String(item.user_review || ''))
  const [expected, setExpected] = useState(String(previous.expected || ''))
  const [actual, setActual] = useState(String(previous.actual || ''))
  const [effort, setEffort] = useState(String(previous.effort || ''))
  const [lengthMinutes, setLengthMinutes] = useState(
    previous.length_minutes == null ? '' : String(previous.length_minutes),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<LibraryRecord | null>(null)

  const changeCompletion = (next: FeedbackCompletionState) => {
    setCompletionState(next)
    setReasonTags((current) => current.filter((tag) => feedbackReasonOptions[next].some(([value]) => value === tag)))
    setError('')
  }
  const toggleReason = (reason: string) =>
    setReasonTags((current) =>
      current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason].slice(0, 8),
    )
  const submit = async (event: Event) => {
    event.preventDefault()
    if (!reflection.trim()) {
      setError('Write a short reflection so the feedback keeps your exact meaning.')
      return
    }
    if (completionState === 'stopped' && reasonTags.length === 0) {
      setError('Choose at least one reason for stopping.')
      return
    }
    setSaving(true)
    setError('')
    setReceipt(null)
    try {
      const result = await api<LibraryRecord>('/feedback/record', {
        method: 'POST',
        body: JSON.stringify({
          recommendation_id: item.id,
          thread_id: threadId,
          feedback: reflection.trim(),
          completion_state: completionState,
          score: score === '' ? undefined : Number(score),
          disposition,
          reason_tags: reasonTags,
          expected: expected.trim() || undefined,
          actual: actual.trim() || undefined,
          effort: effort || undefined,
          length_minutes: lengthMinutes === '' ? undefined : Number(lengthMinutes),
        }),
      })
      setReceipt(result)
      handlers.onFeedbackSaved?.(String(item.id), result)
      handlers.onReload?.()
    } catch (submitError: any) {
      setError(submitError?.message || 'Feedback could not be saved. Check the fields and try again.')
    } finally {
      setSaving(false)
    }
  }

  const visibleReceipt =
    receipt ||
    (!saving && !error && handlers.feedbackReceipt?.sourceId === String(item.id)
      ? handlers.feedbackReceipt.result
      : null)
  const receiptCopy = visibleReceipt
    ? visibleReceipt.receipt?.neutral
      ? 'Saved as a neutral timing signal. It will not count as bad fit.'
      : visibleReceipt.extraction_job
        ? 'Saved. Hermes analysis and note preparation are queued.'
        : 'Saved. Hermes analysis is queued; no notes were requested.'
    : ''

  return (
    <section class="folio-object-section source-feedback-panel" aria-labelledby="source-feedback-title">
      <div class="folio-section-heading source-feedback-heading">
        <div>
          <span class="folio-kicker">Close the loop</span>
          <h2 id="source-feedback-title">Feedback & outcome</h2>
          <p class="folio-record-note">Record what happened. Timing, fit, rating, and what to keep remain separate.</p>
        </div>
        {userScore > 0 && <span class="folio-score">{userScore}/10</span>}
      </div>
      {(item.user_review || outcome?.outcome_status) && (
        <div class="source-feedback-current">
          {item.user_review && <blockquote dir="auto">{item.user_review}</blockquote>}
          {outcome?.outcome_status && (
            <dl class="folio-property-list">
              <div>
                <dt>Outcome</dt>
                <dd>{formatStatus(outcome.outcome_status)}</dd>
              </div>
              {outcome.actual_score != null && (
                <div>
                  <dt>Score</dt>
                  <dd>{outcome.actual_score}/10</dd>
                </div>
              )}
              {outcome.consumed_at && (
                <div>
                  <dt>Finished</dt>
                  <dd>{formatDate(outcome.consumed_at)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
      <form class="source-feedback-form" onSubmit={submit} noValidate>
        <fieldset class="source-feedback-state">
          <legend>What happened?</legend>
          <div class="source-feedback-segments">
            {(
              [
                ['completed', 'Finished', 'Mark this source complete'],
                ['in_progress', 'Continue later', 'Keep it open without a negative signal'],
                ['stopped', 'Stopped', 'Record why it was not worth continuing'],
              ] as Array<[FeedbackCompletionState, string, string]>
            ).map(([value, label, hint]) => (
              <label class={completionState === value ? 'active' : ''} key={value}>
                <input
                  type="radio"
                  name={`feedback-state-${item.id}`}
                  value={value}
                  checked={completionState === value}
                  onChange={() => changeCompletion(value)}
                />
                <strong>{label}</strong>
                <small>{hint}</small>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset class="source-feedback-reasons">
          <legend>
            {completionState === 'stopped'
              ? 'Why did you stop?'
              : completionState === 'completed'
                ? 'What stood out?'
                : 'Why continue later?'}
          </legend>
          <div class="source-feedback-chips">
            {feedbackReasonOptions[completionState].map(([value, label]) => (
              <label class={reasonTags.includes(value) ? 'active' : ''} key={value}>
                <input
                  type="checkbox"
                  value={value}
                  checked={reasonTags.includes(value)}
                  onChange={() => toggleReason(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div class="source-feedback-decision-grid">
          <label class="folio-form-field">
            <span>
              Usefulness score <small>optional, 0–10</small>
            </span>
            <input
              type="number"
              min="0"
              max="10"
              step="1"
              inputMode="numeric"
              value={score}
              onInput={(event) => setScore((event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="folio-form-field">
            <span>What should happen to the ideas?</span>
            <select value={disposition} onChange={(event) => setDisposition((event.target as HTMLSelectElement).value)}>
              <option value="undecided">Decide later</option>
              <option value="retain">Keep for recall</option>
              <option value="apply">Apply soon</option>
              <option value="reference">Reference only</option>
              <option value="drop">Drop</option>
            </select>
          </label>
        </div>
        <label class="folio-form-field source-feedback-reflection">
          <span>Your reflection</span>
          <textarea
            value={reflection}
            maxLength={10000}
            aria-describedby={`feedback-reflection-help-${item.id}`}
            onInput={(event) => {
              setReflection((event.target as HTMLTextAreaElement).value)
              if (error) setError('')
            }}
            placeholder={
              completionState === 'completed'
                ? 'What was useful, surprising, or missing?'
                : completionState === 'stopped'
                  ? 'What made this a poor use of your time?'
                  : 'What should you remember when you return?'
            }
            required
          />
          <small id={`feedback-reflection-help-${item.id}`}>
            Your words are preserved exactly. Feedback never requests another recommendation.
          </small>
        </label>
        <details
          class="source-feedback-details"
          open={Boolean(previous.expected || previous.actual || previous.effort || previous.length_minutes)}
        >
          <summary>
            Expectation, result, and effort <span>optional</span>
          </summary>
          <div class="source-feedback-expectation">
            <label class="folio-form-field">
              <span>Expected</span>
              <textarea
                value={expected}
                maxLength={2000}
                onInput={(event) => setExpected((event.target as HTMLTextAreaElement).value)}
                placeholder="What did you expect this source to give you?"
              />
            </label>
            <label class="folio-form-field">
              <span>Actually got</span>
              <textarea
                value={actual}
                maxLength={2000}
                onInput={(event) => setActual((event.target as HTMLTextAreaElement).value)}
                placeholder="What did it actually give you?"
              />
            </label>
          </div>
          <div class="source-feedback-decision-grid">
            <label class="folio-form-field">
              <span>Effort</span>
              <select value={effort} onChange={(event) => setEffort((event.target as HTMLSelectElement).value)}>
                <option value="">Not recorded</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="deep">Deep</option>
              </select>
            </label>
            <label class="folio-form-field">
              <span>Minutes spent</span>
              <input
                type="number"
                min="0"
                max="100000"
                inputMode="numeric"
                value={lengthMinutes}
                onInput={(event) => setLengthMinutes((event.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        </details>
        {error && (
          <p class="source-feedback-error" role="alert">
            {error}
          </p>
        )}
        <div class="folio-form-actions">
          <button type="submit" class="folio-button folio-button-primary" disabled={saving}>
            {saving ? 'Saving feedback…' : 'Save feedback'}
          </button>
          {receiptCopy && (
            <output class="source-feedback-receipt" role="status">
              <strong>Feedback saved.</strong>
              <span>{receiptCopy}</span>
              {visibleReceipt?.feedback_job && <small>Analysis receipt: {visibleReceipt.feedback_job}</small>}
            </output>
          )}
        </div>
      </form>
    </section>
  )
}

function SourceAnnotationPanel({
  source,
  threadId,
  branchId,
}: {
  source: LibraryRecord
  threadId?: string
  branchId?: string
}) {
  const [annotations, setAnnotations] = useState<LibraryRecord[]>([])
  const [quote, setQuote] = useState('')
  const [contextBefore, setContextBefore] = useState('')
  const [contextAfter, setContextAfter] = useState('')
  const [locator, setLocator] = useState('')
  const [locatorType, setLocatorType] = useState('web')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<LibraryRecord | null>(null)
  const requestedAnnotationId =
    typeof location === 'undefined'
      ? ''
      : new URLSearchParams(location.hash.split('?')[1] || '').get('annotation') || ''
  const load = useCallback(
    () =>
      api<{ annotations: LibraryRecord[] }>(`/annotations?recommendation_id=${encodeURIComponent(String(source.id))}`)
        .then((payload) => setAnnotations(payload.annotations || []))
        .catch(() => setAnnotations([])),
    [source.id],
  )
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!requestedAnnotationId || !annotations.some((annotation) => String(annotation.id) === requestedAnnotationId))
      return
    window.requestAnimationFrame(() =>
      document
        .getElementById(`source-anchor-${requestedAnnotationId}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    )
  }, [requestedAnnotationId, annotations])
  const save = async (event: Event) => {
    event.preventDefault()
    if (!quote.trim()) return
    setSaving(true)
    try {
      const sourceUrl = sourceLink(source)
      await api('/annotations', {
        method: 'POST',
        body: JSON.stringify({
          recommendation_id: source.id,
          thread_id: threadId,
          branch_id: branchId,
          locator_type: locatorType,
          selector: {
            ...(locator.trim() ? { locator: locator.trim() } : {}),
            ...(sourceUrl ? { url: sourceUrl } : {}),
          },
          quote: quote.trim(),
          context_before: contextBefore.trim() || undefined,
          context_after: contextAfter.trim() || undefined,
          created_by: 'user',
        }),
      })
      setQuote('')
      setContextBefore('')
      setContextAfter('')
      setLocator('')
      setNotice('Passage saved to the evidence ledger. Nothing else was created.')
      await load()
    } catch (error: any) {
      setNotice(error?.message || 'The passage could not be saved.')
    } finally {
      setSaving(false)
    }
  }
  const startEdit = (annotation: LibraryRecord) =>
    setEditing({
      ...annotation,
      edit_quote: annotation.quote || '',
      edit_context_before: annotation.context_before || '',
      edit_context_after: annotation.context_after || '',
      edit_locator: annotation.selector?.locator || annotation.selector?.url || '',
    })
  const saveEdit = async (event: Event) => {
    event.preventDefault()
    if (!editing?.id || !String(editing.edit_quote || '').trim()) return
    setSaving(true)
    setNotice('')
    try {
      const result = await api<any>(`/annotations/${encodeURIComponent(String(editing.id))}`, {
        method: 'PATCH',
        body: JSON.stringify({
          locator_type: editing.locator_type,
          selector: {
            ...(editing.selector || {}),
            locator: String(editing.edit_locator || '').trim() || undefined,
            url: editing.selector?.url || sourceLink(source) || undefined,
          },
          quote: String(editing.edit_quote).trim(),
          context_before: String(editing.edit_context_before || '').trim() || null,
          context_after: String(editing.edit_context_after || '').trim() || null,
        }),
      })
      setEditing(null)
      setNotice(
        result?.revised
          ? 'New source-anchor revision saved; prior evidence was preserved.'
          : 'Source-anchor metadata updated.',
      )
      await load()
    } catch (error: any) {
      setNotice(error?.message || 'The source anchor could not be updated.')
    } finally {
      setSaving(false)
    }
  }
  const archive = async (annotation: LibraryRecord) => {
    if (!window.confirm('Archive this source anchor? Its existing downstream provenance remains visible.')) return
    setSaving(true)
    setNotice('')
    try {
      await api(`/annotations/${encodeURIComponent(String(annotation.id))}/archive`, { method: 'POST' })
      setNotice('Source anchor archived.')
      await load()
    } catch (error: any) {
      setNotice(error?.message || 'The source anchor could not be archived.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <section class="folio-object-section source-annotation-panel" aria-labelledby="source-annotation-title">
      <div class="folio-section-heading">
        <div>
          <h2 id="source-annotation-title">Source anchors</h2>
          <p class="folio-record-note">Capture the exact passage Hermes should use as evidence.</p>
        </div>
        <span>{annotations.length} active</span>
      </div>
      <form class="source-annotation-form" onSubmit={save}>
        <label>
          Passage
          <textarea
            value={quote}
            onInput={(event) => setQuote((event.target as HTMLTextAreaElement).value)}
            placeholder="Paste the exact sentence or excerpt…"
            required
          />
        </label>
        <div class="source-annotation-fields">
          <label>
            Context before <small>optional</small>
            <textarea
              value={contextBefore}
              onInput={(event) => setContextBefore((event.target as HTMLTextAreaElement).value)}
              placeholder="Text immediately before the passage…"
            />
          </label>
          <label>
            Context after <small>optional</small>
            <textarea
              value={contextAfter}
              onInput={(event) => setContextAfter((event.target as HTMLTextAreaElement).value)}
              placeholder="Text immediately after the passage…"
            />
          </label>
        </div>
        <div class="source-annotation-fields">
          <label>
            Locator type
            <select value={locatorType} onChange={(event) => setLocatorType((event.target as HTMLSelectElement).value)}>
              <option value="web">Web passage</option>
              <option value="pdf">PDF page or quote</option>
              <option value="video">Video timestamp</option>
              <option value="epub">EPUB location</option>
              <option value="artifact">Companion section</option>
              <option value="text">Plain text</option>
            </select>
          </label>
          <label>
            Locator
            <input
              value={locator}
              onInput={(event) => setLocator((event.target as HTMLInputElement).value)}
              placeholder="Page 8, 12:42, CSS selector…"
            />
          </label>
        </div>
        <div class="folio-form-actions">
          <button type="submit" class="folio-button folio-button-primary" disabled={saving || !quote.trim()}>
            {saving ? 'Saving…' : 'Save source anchor'}
          </button>
          {notice && <output aria-live="polite">{notice}</output>}
        </div>
      </form>
      {annotations.length ? (
        <div class="source-annotation-list">
          {annotations.map((annotation) => {
            const isEditing = String(editing?.id || '') === String(annotation.id)
            const isRequested = requestedAnnotationId === String(annotation.id)
            const activeEdit = isEditing ? editing : null
            return (
              <article
                id={`source-anchor-${annotation.id}`}
                class={isRequested ? 'is-targeted' : ''}
                key={annotation.id}
              >
                {activeEdit ? (
                  <form class="source-annotation-form" onSubmit={saveEdit}>
                    <label>
                      Passage
                      <textarea
                        value={activeEdit.edit_quote}
                        onInput={(event) =>
                          setEditing({ ...activeEdit, edit_quote: (event.currentTarget as HTMLTextAreaElement).value })
                        }
                        required
                      />
                    </label>
                    <div class="source-annotation-fields">
                      <label>
                        Context before
                        <textarea
                          value={activeEdit.edit_context_before}
                          onInput={(event) =>
                            setEditing({
                              ...activeEdit,
                              edit_context_before: (event.currentTarget as HTMLTextAreaElement).value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Context after
                        <textarea
                          value={activeEdit.edit_context_after}
                          onInput={(event) =>
                            setEditing({
                              ...activeEdit,
                              edit_context_after: (event.currentTarget as HTMLTextAreaElement).value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div class="source-annotation-fields">
                      <label>
                        Locator type
                        <select
                          value={activeEdit.locator_type}
                          onChange={(event) =>
                            setEditing({
                              ...activeEdit,
                              locator_type: (event.currentTarget as HTMLSelectElement).value,
                            })
                          }
                        >
                          <option value="web">Web passage</option>
                          <option value="pdf">PDF page or quote</option>
                          <option value="video">Video timestamp</option>
                          <option value="epub">EPUB location</option>
                          <option value="artifact">Companion section</option>
                          <option value="text">Plain text</option>
                        </select>
                      </label>
                      <label>
                        Locator
                        <input
                          value={activeEdit.edit_locator}
                          onInput={(event) =>
                            setEditing({ ...activeEdit, edit_locator: (event.currentTarget as HTMLInputElement).value })
                          }
                        />
                      </label>
                    </div>
                    <div class="folio-row-actions">
                      <button type="submit" class="folio-button folio-button-primary" disabled={saving}>
                        Save changes
                      </button>
                      <button type="button" class="folio-button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {annotation.context_before && <small dir="auto">…{annotation.context_before}</small>}
                    <p dir="auto">{annotation.quote}</p>
                    {annotation.context_after && <small dir="auto">{annotation.context_after}…</small>}
                    <small>
                      {labelize(annotation.locator_type || 'source')} ·{' '}
                      {annotation.selector?.locator || annotation.selector?.url || 'Locator not recorded'} ·{' '}
                      {formatDate(annotation.created_at)}
                      {annotation.source_checksum ? ` · ${String(annotation.source_checksum).slice(0, 12)}…` : ''}
                    </small>
                    <div class="folio-row-actions">
                      <a
                        class="folio-button folio-button-primary"
                        href={`#/learn?mode=practice&focus=notes&annotation=${encodeURIComponent(String(annotation.id))}`}
                      >
                        Use in Learn
                      </a>
                      <button type="button" class="folio-button" onClick={() => startEdit(annotation)}>
                        Edit
                      </button>
                      <button type="button" class="folio-button" onClick={() => archive(annotation)} disabled={saving}>
                        Archive
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <p class="folio-record-note">No passage anchors yet. Anchors are evidence, not proof of mastery.</p>
      )}
    </section>
  )
}

function ArtifactObject({ item }: { item: LibraryRecord }) {
  const metadata = { ...parseMetadata(item.metadata_json), ...item.metadata }
  const sourceId = metadata.recommendation_id || item.recommendation_id
  const owner = useData<LibraryRecord>(sourceId ? `/capture/${encodeURIComponent(String(sourceId))}/record` : undefined)
  const source = owner.data?.item || { id: sourceId }
  const sections = [
    { key: 'overview', label: 'Overview' },
    ...(sourceId
      ? [
          { key: 'files', label: 'Source files' },
          { key: 'notes', label: 'Source notes' },
        ]
      : []),
  ]
  const active = useItemSection(sections)
  return (
    <div class="artifact-item-page">
      <ItemSections sections={sections} active={active} />
      <div class="item-section-panel" hidden={active !== 'overview'}>
        <section class="folio-object-section">
          <h2>Artifact access</h2>
          <div class="folio-row-actions">
            <a class="folio-button folio-button-primary" href={artifactLink(item)} target="_blank" rel="noreferrer">
              Open {fileKind(item)}
            </a>
          </div>
          <dl class="folio-property-list">
            <div>
              <dt>Filename</dt>
              <dd>{item.filename || 'Unnamed file'}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {sourceId ? (
                  <a href={itemHref(source)}>{metadata.source_title || source.video_title || 'Open owning item'}</a>
                ) : (
                  metadata.source_title || 'Not linked'
                )}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(item.created_at)}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{metadata.role || fileKind(item)}</dd>
            </div>
          </dl>
          {(item.thread_id || metadata.thread_id) && (
            <a
              class="folio-linked-object"
              href={`#/learn/thread/${encodeURIComponent(String(item.thread_id || metadata.thread_id))}`}
            >
              Open Learning Thread
            </a>
          )}
          {(item.stage_id || metadata.stage_id) && (
            <a
              class="folio-linked-object"
              href={`#/learn/level/${encodeURIComponent(String(item.stage_id || metadata.stage_id))}`}
            >
              Open Level
            </a>
          )}
        </section>
      </div>
      {active !== 'overview' && owner.loading && !owner.data && <Loading label="Loading source material" />}
      {active !== 'overview' && owner.error && <ErrorState message={owner.error} retry={owner.reload} />}
      <div class="item-section-panel" hidden={active !== 'files' || !owner.data}>
        <section class="folio-object-section">
          <h2>Files from this source</h2>
          <ItemFileList files={owner.data?.artifacts || []} />
        </section>
      </div>
      <div class="item-section-panel" hidden={active !== 'notes' || !owner.data}>
        <section class="folio-object-section">
          <h2>Notes from this source</h2>
          {(owner.data?.notes || []).map((note: LibraryRecord) => (
            <a class="folio-linked-object" href={noteHref(String(note.id))} key={note.id}>
              <strong>{note.title || 'Source note'}</strong>
              <span>{formatStatus(note.kind)}</span>
            </a>
          ))}
          {!owner.data?.notes?.length && <p class="folio-record-note">No notes are attached to this source yet.</p>}
          <a class="folio-button" href={itemHref(source, 'notes')}>
            Open item notes & passages
          </a>
        </section>
      </div>
    </div>
  )
}

function BookObject({
  item,
  record,
  handlers,
  onBack,
}: {
  item: LibraryRecord
  record: LibraryRecord
  handlers: LibraryViewHandlers
  onBack: () => void
}) {
  const [editingChapters, setEditingChapters] = useState(false)
  const metadata = parseMetadata(item.source_metadata_json)
  const book: LibraryRecord = {
    ...item,
    progress: item.progress || record.progress,
    next_chapter: item.next_chapter || record.next_chapter,
    visual: item.visual || record.visual || { chapters: record.book_chapters || [] },
    canon_memberships: item.canon_memberships || record.canon_memberships || [],
    threads: item.threads || record.threads || [],
  }
  const chapters = bookChapters(book)
  const progress = computeBookProgress(book)
  const nextChapter = bookNextChapter(book)
  const readingState = bookReadingState(book)
  const branch =
    item.branch ||
    (item.branch_id
      ? { id: item.branch_id, label: item.branch_label || item.branch_id, status: item.branch_status }
      : null)
  const memberships = Array.isArray(book.canon_memberships) ? book.canon_memberships : []
  const threads = Array.isArray(book.threads) ? book.threads : []
  const isPrimary = Boolean(book.is_primary)
  const notes = Array.isArray(record.notes) ? record.notes : []
  const sessions = Array.isArray(record.sessions) ? record.sessions : []
  const units = Array.isArray(record.learning_units) ? record.learning_units : []
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : []
  const recall = record.srs?.recall_summary || { count: 0, due: 0 }
  const cards = Array.isArray(record.srs?.cards) ? record.srs.cards : []
  const drafts = (record.srs?.drafts || []).filter((draft: LibraryRecord) => draft.status !== 'approved')
  const score = Number(item.user_score ?? item.user_rating ?? 0)
  const sections = [
    { key: 'overview', label: 'Overview' },
    { key: 'chapters', label: 'Chapters', count: chapters.length },
    { key: 'files', label: 'Files', count: artifacts.length },
    { key: 'notes', label: 'Notes & passages', count: notes.length },
    { key: 'recall', label: 'Recall', count: cards.length },
    { key: 'connections', label: 'Connections', count: threads.length + units.length + memberships.length },
    { key: 'history', label: 'History', count: sessions.length },
    { key: 'feedback', label: 'Reflection' },
  ]
  const active = useItemSection(sections)

  return (
    <div class="book-overview-fold book-dossier">
      <button type="button" class="book-overview-back" onClick={onBack}>
        <Icon name="back" size={14} />
        Back to Books
      </button>

      <header class="book-overview-head">
        <div class="book-overview-status-row">
          {isPrimary ? (
            <span class="book-overview-primary">
              <Icon name="pin" size={13} />
              Current book
            </span>
          ) : (
            <button
              type="button"
              class="book-overview-pin"
              onClick={() => handlers.onSetBookReadingState(item, 'reading', true)}
              disabled={handlers.busyId === `reading-state:${item.id}`}
            >
              <Icon name="pin" size={14} />
              Make current
            </button>
          )}
          <span>{readingState === 'reading' ? 'Reading' : formatStatus(readingState)}</span>
        </div>
        <h1>{sourceTitle(item)}</h1>
        <p>{sourceCreator(item)}</p>
      </header>

      {progress.total > 0 && (
        <section hidden={active !== 'overview'} class="book-overview-progress" aria-label="Reading progress">
          <div>
            <span>
              {progress.finished} of {progress.total} chapters completed
            </span>
            <strong>{progress.percent}%</strong>
          </div>
          <div
            role="progressbar"
            aria-label={`${sourceTitle(item)} reading progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span style={{ width: `${progress.percent}%` }} />
          </div>
        </section>
      )}

      <div class="book-overview-context" aria-label="Knowledge context">
        {branch &&
          (branch.linkable !== false && branch.verified !== false ? (
            <a href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}>
              <Icon name="branch" size={13} />
              <span>{branch.label}</span>
            </a>
          ) : (
            <span>
              <Icon name="branch" size={13} />
              {branch.label}
            </span>
          ))}
        {memberships.map((membership: LibraryRecord) => (
          <a
            href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`}
            key={String(membership.entry_id || `${membership.domain_id}-${membership.role}`)}
          >
            Canon · {formatStatus(membership.role)} · {membership.domain_title}
          </a>
        ))}
        {threads.map((thread: LibraryRecord) => (
          <a href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`} key={String(thread.id)}>
            <Icon name="path" size={12} />
            <span>Thread · {thread.title}</span>
          </a>
        ))}
      </div>

      <label class="book-overview-state-control">
        <span>Reading status</span>
        <select
          value={readingState}
          onChange={(event) =>
            handlers.onSetBookReadingState(
              item,
              (event.currentTarget as HTMLSelectElement).value as 'saved' | 'reading' | 'finished',
            )
          }
          disabled={handlers.busyId === `reading-state:${item.id}`}
        >
          <option value="saved">Saved</option>
          <option value="reading">Reading</option>
          <option value="finished">Finished</option>
        </select>
      </label>

      {nextChapter ? (
        <section hidden={active !== 'overview'} class="book-overview-next" aria-labelledby="book-next-chapter-title">
          <div>
            <span>Next chapter</span>
            <h2 id="book-next-chapter-title">
              {nextChapter.number ? `${nextChapter.number}. ` : ''}
              {nextChapter.title}
            </h2>
          </div>
          <ReadingFormatLinks book={book} chapter={nextChapter} />
          <button
            type="button"
            onClick={() => handlers.onCompleteChapter(book, nextChapter)}
            disabled={handlers.busyId === `${book.id}:${nextChapter.key}`}
          >
            <Icon name={nextChapter.completed ? 'back' : 'check'} size={15} />
            {nextChapter.completed ? 'Reopen' : 'Mark done'}
          </button>
        </section>
      ) : (
        <section hidden={active !== 'overview'} class="book-overview-next is-empty">
          <div>
            <h2>No chapters yet</h2>
            <p>Add the book structure before attaching reading formats.</p>
          </div>
          <button type="button" onClick={() => setEditingChapters(true)}>
            Add chapters
          </button>
        </section>
      )}

      {handlers.notice && (
        <p class="book-overview-notice" role="status">
          {handlers.notice}
        </p>
      )}

      <ItemSections sections={sections} active={active} label="Book hub sections" />

      <div class="book-dossier-layout item-book-layout">
        <div class="book-dossier-main" hidden={['recall', 'connections', 'history', 'files'].includes(active)}>
          <section hidden={active !== 'overview'} id="book-overview" class="book-dossier-section">
            <div class="book-dossier-section-head">
              <h2>Overview</h2>
              <span>{formatStatus(readingState)}</span>
            </div>
            <dl class="book-dossier-facts">
              <div>
                <dt>Author</dt>
                <dd>{sourceCreator(item)}</dd>
              </div>
              <div>
                <dt>ISBN</dt>
                <dd>{metadata.isbn || item.isbn || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{formatDate(item.created_at)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(item.updated_at)}</dd>
              </div>
              <div>
                <dt>Reading status</dt>
                <dd>{formatStatus(readingState)}</dd>
              </div>
            </dl>
            <PersonalItemFacts item={record.personal_item} />
            {item.why_this && <blockquote class="book-dossier-rationale">{item.why_this}</blockquote>}
            {memberships.length > 0 && (
              <div class="book-canon-placements">
                <h3>Canon placement</h3>
                {memberships.map((membership: LibraryRecord) => (
                  <article key={membership.entry_id || `${membership.domain_id}-${membership.role}`}>
                    <div>
                      <span>{formatStatus(membership.role)}</span>
                      <strong>{membership.domain_title}</strong>
                    </div>
                    {membership.domain_boundary && <p>{membership.domain_boundary}</p>}
                    <a
                      href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`}
                    >
                      Open field guide
                    </a>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section hidden={active !== 'chapters'} id="book-chapters" class="book-dossier-section">
            <div class="book-dossier-section-head">
              <h2>Chapters & companions</h2>
              <span>{progress.total ? `${progress.finished}/${progress.total} finished` : 'No chapters'}</span>
            </div>
            <details class="book-overview-chapters book-hub-chapters" open>
              <summary>
                <span>Complete chapter ledger</span>
                <span class="book-overview-chapter-count">
                  <small>{chapters.length}</small>
                  <Icon name="chevron" size={15} />
                </span>
              </summary>
              <div class="book-overview-chapter-tools">
                <button type="button" onClick={() => setEditingChapters(true)}>
                  {chapters.length ? 'Edit chapters' : 'Add chapters'}
                </button>
              </div>
              {chapters.length ? (
                <BookChapterRows book={book} handlers={handlers} onEdit={() => setEditingChapters(true)} />
              ) : (
                <div class="book-dossier-empty">
                  <strong>No chapters yet</strong>
                  <p>Add the book structure before attaching reading formats.</p>
                </div>
              )}
            </details>
          </section>

          <section hidden={active !== 'notes'} id="book-study" class="book-dossier-section">
            <div class="book-dossier-section-head">
              <h2>Notes & source anchors</h2>
              <span>{notes.length} notes</span>
            </div>
            {notes.length ? (
              <details class="book-dossier-notes" open>
                <summary>
                  <span>Linked notes</span>
                  <span class="book-overview-chapter-count">
                    <small>{notes.length}</small>
                    <Icon name="chevron" size={15} />
                  </span>
                </summary>
                <div class="book-dossier-note-list">
                  {notes.map((note: LibraryRecord) => (
                    <a class="book-dossier-note-link" href={noteHref(String(note.id))} key={note.id}>
                      <span>
                        <strong>{note.title || (note.kind === 'reflection' ? 'Reflection' : 'Book note')}</strong>
                        <small>
                          {note.kind === 'reflection' ? 'Reflection' : 'Note'}
                          {note.updated_at ? ` · Updated ${formatDate(note.updated_at)}` : ''}
                        </small>
                      </span>
                      <span>
                        {formatStatus(note.status || 'draft')}
                        <Icon name="chevron" size={14} />
                      </span>
                    </a>
                  ))}
                </div>
              </details>
            ) : (
              <div class="book-dossier-empty">
                <strong>No notes yet</strong>
                <p>Notes written or extracted for this book will stay attached here.</p>
                <a class="folio-button" href="#/learn?mode=practice&focus=notes">
                  Open Notes
                </a>
              </div>
            )}
            <details class="book-dossier-disclosure book-dossier-anchors" open>
              <summary>
                <span>Source anchors</span>
                <Icon name="chevron" size={15} />
              </summary>
              <SourceAnnotationPanel source={item} threadId={threads[0]?.id} branchId={branch?.id} />
            </details>
          </section>

          <details
            hidden={active !== 'feedback'}
            open
            id="book-reflection"
            class="book-dossier-reflection book-dossier-disclosure"
          >
            <summary>
              <span>Feedback & outcome</span>
              <Icon name="chevron" size={15} />
            </summary>
            <SourceFeedbackPanel
              item={item}
              record={record}
              threadId={threads[0]?.id}
              handlers={handlers}
              userScore={score}
              outcome={record.outcome}
            />
          </details>
        </div>

        <aside
          class="book-dossier-aside"
          aria-label="Book learning context"
          hidden={!['recall', 'connections', 'history', 'files'].includes(active)}
        >
          <section hidden={active !== 'recall'} id="book-recall" class="book-dossier-side-section">
            <div class="book-dossier-section-head">
              <h2>Recall</h2>
              <span>
                {recall.count} approved{recall.due ? ` · ${recall.due} active due` : ''}
              </span>
            </div>
            {cards.length ? (
              <ul class="folio-recall-list">
                {cards.map((card: LibraryRecord) => (
                  <li key={card.id}>
                    <a href={`#/learn/card/${encodeURIComponent(String(card.id))}?mode=practice&focus=recall`}>
                      <strong>{card.question}</strong>
                    </a>
                    <span>
                      {card.topic || 'General'} · {recallScheduleLabel(card)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="folio-record-note">No approved recall cards yet.</p>
            )}
            {drafts.length > 0 && (
              <div class="folio-draft-strip">
                <span>
                  {drafts.length} pending {drafts.length === 1 ? 'draft' : 'drafts'}
                </span>
                <a class="folio-button" href="#/learn?mode=practice&focus=recall">
                  Review drafts
                </a>
              </div>
            )}
            {!cards.length && !drafts.length && (
              <div class="folio-row-actions">
                <a class="folio-button" href="#/learn?mode=practice&focus=notes">
                  Take a note first
                </a>
              </div>
            )}
          </section>

          <section hidden={active !== 'connections'} id="book-connections" class="book-dossier-side-section">
            <div class="book-dossier-section-head">
              <h2>Connections</h2>
              <span>{(branch ? 1 : 0) + memberships.length + threads.length + units.length}</span>
            </div>
            {branch &&
              (branch.linkable !== false && branch.verified !== false ? (
                <a class="folio-linked-object" href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}>
                  <strong>{branch.label}</strong>
                  <span>{formatStatus(branch.status)}</span>
                </a>
              ) : (
                <div class="folio-linked-object">
                  <strong>{branch.label}</strong>
                  <span>Branch match not verified</span>
                </div>
              ))}
            {memberships.map((membership: LibraryRecord) => (
              <a
                class="folio-linked-object"
                href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`}
                key={membership.entry_id || `${membership.domain_id}-${membership.role}`}
              >
                <strong>{membership.domain_title}</strong>
                <span>Canon · {formatStatus(membership.role)}</span>
              </a>
            ))}
            {threads.map((thread: LibraryRecord) => (
              <a
                class="folio-linked-object"
                href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`}
                key={thread.id}
              >
                <strong>{thread.title}</strong>
                <span>
                  {thread.role || 'Attached book'} · {formatStatus(thread.status)}
                </span>
              </a>
            ))}
            {units.map((unit: LibraryRecord) => (
              <a class="folio-linked-object" href={`#/learn/unit/${encodeURIComponent(String(unit.id))}`} key={unit.id}>
                <strong>{unit.statement || unit.title || 'Learning unit'}</strong>
                <span>{formatStatus(unit.unit_type || 'concept')}</span>
              </a>
            ))}
            {!branch && !memberships.length && !threads.length && !units.length && (
              <p class="folio-record-note">No knowledge connections recorded yet.</p>
            )}
          </section>

          <section hidden={active !== 'history'} id="book-history" class="book-dossier-side-section">
            <div class="book-dossier-section-head">
              <h2>Reading history</h2>
              <span>{sessions.length}</span>
            </div>
            {sessions.length ? (
              <ol class="book-session-list">
                {sessions.map((session: LibraryRecord) => (
                  <li key={session.id}>
                    <strong>{formatStatus(session.status)}</strong>
                    <span>
                      {formatDate(session.started_at)}
                      {session.completed_at
                        ? ` · finished ${formatDate(session.completed_at)}`
                        : session.returned_at
                          ? ` · returned ${formatDate(session.returned_at)}`
                          : ''}
                    </span>
                    {session.intent && <p>{session.intent}</p>}
                    {session.reflection && <blockquote>{session.reflection}</blockquote>}
                  </li>
                ))}
              </ol>
            ) : (
              <p class="folio-record-note">No tracked sessions recorded for this book.</p>
            )}
          </section>

          <section hidden={active !== 'files'} id="book-files" class="book-dossier-side-section">
            <div class="book-dossier-section-head">
              <h2>Files</h2>
              <span>{artifacts.length}</span>
            </div>
            <ItemFileList files={artifacts} />
          </section>
        </aside>
      </div>

      {editingChapters && (
        <ChapterManagerDialog
          book={book}
          onClose={() => setEditingChapters(false)}
          onSaved={() => {
            setEditingChapters(false)
            handlers.onReload?.()
          }}
        />
      )}
    </div>
  )
}
