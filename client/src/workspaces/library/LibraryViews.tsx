import { useEffect, useMemo, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../../api'
import { Empty } from '../../components/States'
import { Icon } from '../../components/Icon'
import { useData } from '../../app/useData'
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
  parseMetadata,
  sourceCreator,
  sourceFormat,
  sourceLink,
  sourceSelection,
  sourceState,
  sourceTitle,
} from './types'

export type { LibraryViewHandlers } from './types'

function RecordMeta({ children }: { children: preact.ComponentChildren }) {
  return <span class="folio-record-meta">{children}</span>
}

function RowTitle({ item, type = 'source' }: { item: LibraryRecord; type?: 'source' | 'artifact' | 'book'; onInspect?: (selection: LibrarySelection) => void }) {
  const selection = type === 'artifact' ? artifactSelection(item) : type === 'book' ? bookSelection(item) : sourceSelection(item)
  const href = objectHref(type, String(item.id))
  return <a href={href} class="folio-object-btn">
    <span class="folio-object-copy">
      <strong>{selection.title}</strong>
      <small>{type === 'artifact' ? `${fileKind(item)}${item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ''}` : `${sourceCreator(item)} · ${sourceFormat(item)}`}</small>
    </span>
    <Icon name="chevron" size={16}/>
  </a>
}

function ViewEmpty({ title, body }: { title: string; body: string }) {
  return <Empty title={title} body={body}/>
}

export function QueueView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const items = Array.isArray(data.items) ? data.items : []
  const cap = Number(data.cap || 5)
  const [viewMode, setViewMode] = useState<'gallery' | 'ledger'>(() => {
    if (typeof window === 'undefined') return 'gallery'
    return window.localStorage.getItem('learning-compass.queue-view') === 'ledger' ? 'ledger' : 'gallery'
  })
  const resolvedContext = data.delivery_context?.context || {}
  const [effort, setEffort] = useState('')
  const [depthTier, setDepthTier] = useState('')
  const [matchesOnly, setMatchesOnly] = useState(false)

  const changeDelivery = (next: { effort?: string; depth_tier?: string; matches_only?: boolean }) => {
    const nextEffort = next.effort ?? effort
    const nextDepth = next.depth_tier ?? depthTier
    const nextMatches = next.matches_only ?? matchesOnly
    setEffort(nextEffort); setDepthTier(nextDepth); setMatchesOnly(nextMatches)
    handlers.onQueueDeliveryChange?.({ ...(nextEffort ? { effort: nextEffort } : {}), ...(nextDepth ? { depth_tier: nextDepth } : {}), matches_only: nextMatches })
  }

  const changeView = (next: 'gallery' | 'ledger') => {
    setViewMode(next)
    window.localStorage.setItem('learning-compass.queue-view', next)
  }

  return <div class={`folio-library-view folio-queue-view folio-queue-view-${viewMode}`}>
    <div class="folio-view-intro"><div><p class="folio-kicker">A bounded shelf of commitments</p><h1>Queue</h1><p>Start one source at a time. The shelf stays small enough to remember why each item matters.</p></div><div class="folio-view-intro-actions"><div class="folio-view-toggle" role="group" aria-label="Queue view"><button type="button" class={viewMode === 'gallery' ? 'active' : ''} aria-pressed={viewMode === 'gallery'} onClick={() => changeView('gallery')}>Gallery</button><button type="button" class={viewMode === 'ledger' ? 'active' : ''} aria-pressed={viewMode === 'ledger'} onClick={() => changeView('ledger')}>Ledger</button></div><span class="folio-cap-readout"><strong>{items.length}</strong><small>of {cap} active</small></span></div></div>
    <div class="folio-view-toggle" role="group" aria-label="Queue delivery context">
      <select aria-label="Queue effort" value={effort} onChange={(event) => changeDelivery({ effort: (event.currentTarget as HTMLSelectElement).value })}><option value="">Effort: {resolvedContext.effort || 'default'}</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select>
      <select aria-label="Queue depth" value={depthTier} onChange={(event) => changeDelivery({ depth_tier: (event.currentTarget as HTMLSelectElement).value })}><option value="">Depth: {data.delivery_context?.effective_depth_tier || 'adaptive'}</option><option value="adaptive">Adaptive</option><option value="introductory">Introductory</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
      <label><input type="checkbox" checked={matchesOnly} onChange={(event) => changeDelivery({ matches_only: (event.currentTarget as HTMLInputElement).checked })} /> Show matches only</label>
    </div>
    {items.length > cap && <div class="folio-overflow-notice" role="status"><strong>Override is active.</strong> {items.length - cap} extra {items.length - cap === 1 ? 'item is' : 'items are'} waiting. Finish or remove one to return to the five-item cap.</div>}
    {items.length ? <div class="folio-record-list" aria-label="Active queue">
      {items.map((item: LibraryRecord, index: number) => {
        const href = sourceLink(item)
        const startKind = item.recommended_start === 'html' || item.recommended_start === 'pdf' ? item.recommended_start : 'original'
        const artifact = (item.artifacts || {})[startKind]
        const startHref = artifact?.id ? `/artifacts/${artifact.id}` : href
        const isBook = item.content_type === 'book' || item.is_book_chapter
        return <article class="folio-record folio-queue-record" key={item.chapter_key ? `${item.id}:${item.chapter_key}` : item.id}>
          <span class="folio-rank" aria-label={`Queue position ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
          <div class="folio-record-main">
            <RecordMeta>{formatQueueMeta(item)} · {item.learning_state === 'in_progress' ? 'In progress' : 'Queued'}</RecordMeta>
            <RowTitle item={item} type={isBook ? 'book' : 'source'} onInspect={handlers.onInspect}/>
            <p class="folio-record-reason">{formatReason(item)}</p>
            {Boolean(item.branch?.label || item.branch_preflight?.branch_label || item.branch_label || (typeof item.branch === 'string' && item.branch)) && <div class="folio-queue-badges" aria-label="Branch context">
              <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(String(item.branch?.id || item.branch_preflight?.branch_id || item.branch_id || item.branch?.label || item.branch_label || item.branch))}`} title="Open branch dossier"><span class="badge-format">Branch</span><span>{item.branch?.label || item.branch_preflight?.branch_label || item.branch_label || (typeof item.branch === 'string' ? item.branch : '')}</span></a>
              {item.note ? <a class="folio-badge folio-badge-note" href="#/learn?mode=practice&focus=notes" title="Open field notes">Note taken: {item.note.title}</a> : <span class="folio-badge folio-badge-muted">No note yet</span>}
              {item.recall && (item.recall.count > 0 ? <a class="folio-badge folio-badge-recall" href="#/learn?mode=practice&focus=recall" title="Open recall deck">{item.recall.count} approved {item.recall.count === 1 ? 'card' : 'cards'}{item.recall.due > 0 ? ` · ${item.recall.due} due today` : ''}</a> : <span class="folio-badge folio-badge-muted">No approved recall</span>)}
              {item.companions?.html && <a class="folio-badge folio-badge-html" href={`/artifacts/${encodeURIComponent(String(item.companions.html.id))}`} title="Open Arabic reading companion">Read HTML</a>}
              {item.companions?.pdf && <a class="folio-badge folio-badge-pdf" href={`/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`} title="Download A4 companion">PDF</a>}
            </div>}
            {item.branch_preflight?.conflict && <p class="folio-inline-warning" role="alert">Mapped to the pruned branch “{item.branch_preflight.branch_label}”. Review the mapping before starting.</p>}
            {item.branch_preflight?.status === 'unmapped' && <p class="folio-record-note">Branch match is not verified yet.</p>}
            {item.compass && <p class="folio-record-note">Compass fit {Math.round(Number(item.compass.score || 0) * 100)}% · confidence {Math.round(Number(item.compass.confidence || 0) * 100)}%</p>}
            {item.delivery_match && <p class="folio-record-note">Delivery {item.delivery_match.matches ? 'matches' : 'differs'} · advisory only</p>}
            <div class="folio-row-actions">
              {href && <a class="folio-button folio-button-primary" href={startHref || href} target="_blank" rel="noreferrer" onClick={(event) => handlers.onStart(event, item, startHref || href, startKind as 'original' | 'html' | 'pdf', artifact?.id)}>{item.learning_state === 'in_progress' ? 'Resume' : 'Start'}</a>}
              {isBook && item.chapter_key ? (
                <button
                  type="button"
                  class="folio-button"
                  onClick={() => handlers.onCompleteChapter({ id: item.book_id || item.id, ...item }, item.chapter || { key: item.chapter_key, title: item.chapter_title, completed: false })}
                  disabled={handlers.busyId === `${item.book_id || item.id}:${item.chapter_key}`}
                  aria-label={`Mark ${item.chapter_title || 'chapter'} finished`}
                >
                  <Icon name="check" size={14}/>
                  <span>Mark done</span>
                </button>
              ) : null}
              <a class="folio-button" href={objectHref(isBook ? 'book' : 'source', String(item.book_id || item.id))}>{isBook ? 'Book desk' : 'Record'}</a>
              {!isBook && <button type="button" class="folio-button" onClick={() => handlers.onExclude(item)} disabled={handlers.busyId === item.id} aria-label={`Exclude ${sourceTitle(item)} from Queue`}>Exclude</button>}
            </div>
            {!isBook && <small class="folio-action-note">Exclude is administrative and does not count as a bad-fit signal.</small>}
          </div>
        </article>
      })}
    </div> : <ViewEmpty title="Queue is clear" body="A source appears here only after a deliberate commitment."/>}
    {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
  </div>
}

export function FeedsView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [feedUrl, setFeedUrl] = useState('')
  const [feedBranchId, setFeedBranchId] = useState('')
  const [selectedFeedId, setSelectedFeedId] = useState<string>('all')
  const [feedEntries, setFeedEntries] = useState<LibraryRecord[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null)
  const [showManageFeeds, setShowManageFeeds] = useState(false)
  const branchDeck = useData<{ existing?: LibraryRecord[] }>(showManageFeeds ? '/brain/branch-deck' : undefined)
  const branchOptions = useMemo(() => (branchDeck.data?.existing || []).filter((branch) => String(branch.status || '').toLowerCase() !== 'pruned'), [branchDeck.data?.existing])

  const feeds = Array.isArray(data.feeds) ? data.feeds : []
  const totalEntries = useMemo(() => feeds.reduce((sum: number, f: LibraryRecord) => sum + Number(f.entry_count || 0), 0), [feeds])

  useEffect(() => {
    let active = true
    setLoadingEntries(true)
    api<{ feed: LibraryRecord; items: LibraryRecord[]; total: number }>(`/capture/feeds/${encodeURIComponent(selectedFeedId || 'all')}/entries?limit=50`)
      .then((res) => {
        if (active) {
          setFeedEntries(res.items || [])
          setEntriesTotal(res.total || (res.items || []).length)
        }
      })
      .catch(() => {
        if (active) {
          setFeedEntries([])
          setEntriesTotal(0)
        }
      })
      .finally(() => {
        if (active) setLoadingEntries(false)
      })
    return () => { active = false }
  }, [selectedFeedId, handlers.busyId])

  const submitSubscribe = (event: Event) => {
    event.preventDefault()
    if (feedUrl.trim() && feedBranchId && handlers.onAddFeed) {
      handlers.onAddFeed(feedUrl.trim(), feedBranchId)
      setFeedUrl('')
      setFeedBranchId('')
    }
  }

  const isAllFeeds = selectedFeedId === 'all'
  const selectedFeed = isAllFeeds
    ? { id: 'all', title: 'All Subscribed Sources', feed_url: `${feeds.length} subscribed publications` }
    : feeds.find((f: LibraryRecord) => String(f.id) === selectedFeedId) || { id: 'all', title: 'All Subscribed Sources', feed_url: `${feeds.length} subscribed publications` }
  const isSyncingCurrent = isAllFeeds
    ? handlers.busyId === 'sync-feeds'
    : Boolean(selectedFeed && (handlers.busyId === 'sync-feeds' || handlers.busyId === `sync:${selectedFeed.id}`))

  return (
    <div class="folio-library-view folio-feeds-view">
      <div class="folio-view-intro">
        <div>
          <p class="folio-kicker">Incoming external publications</p>
          <h1>RSS Feeds</h1>
          <p>Subscribe to RSS/Atom feeds, check for new material, and decide from the unified source ledger.</p>
        </div>
        <div class="folio-view-intro-actions">
          <button
            type="button"
            class={`folio-button${showManageFeeds ? ' folio-button-primary' : ''}`}
            onClick={() => setShowManageFeeds((prev) => !prev)}
            title={showManageFeeds ? 'Hide feed subscriptions' : 'Subscribe to a feed or manage feeds'}
          >
            <Icon name="rss" size={15}/>
            {showManageFeeds ? 'Hide subscriptions' : 'Manage feeds'}
          </button>
          <span class="folio-count-readout">
            <strong>{feeds.length}</strong>
            <small>{feeds.length === 1 ? 'feed' : 'feeds'} · {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}</small>
          </span>
        </div>
      </div>

      {showManageFeeds && (
        <>
          <form class="folio-intake-form folio-feed-subscribe-form" onSubmit={submitSubscribe}>
            <div class="folio-section-heading">
              <div>
                <h2>Subscribe to a feed</h2>
                <p>Imported articles remain captured records; they never bypass deliberate commitment.</p>
              </div>
              {handlers.onSyncFeeds && (
                <button
                  type="button"
                  class="folio-button"
                  onClick={() => handlers.onSyncFeeds?.()}
                  disabled={handlers.busyId === 'sync-feeds'}
                  title="Check all subscribed feeds for new articles"
                >
                  <Icon name="sync" size={15} class={handlers.busyId === 'sync-feeds' ? 'folio-icon-spin' : ''}/>
                  {handlers.busyId === 'sync-feeds' ? 'Checking…' : 'Check all feeds'}
                </button>
              )}
            </div>
            <div class="folio-feed-form-row">
              <input
                type="url"
                value={feedUrl}
                onInput={(event) => setFeedUrl((event.currentTarget as HTMLInputElement).value)}
                placeholder="https://example.com/feed.xml or atom/everything/"
                required
                aria-label="Feed URL"
              />
              <select
                value={feedBranchId}
                onChange={(event) => setFeedBranchId((event.currentTarget as HTMLSelectElement).value)}
                aria-label="Default knowledge branch for imported feed articles"
                required
                disabled={branchDeck.loading || !branchOptions.length}
              >
                <option value="">{branchDeck.loading ? 'Loading branches…' : branchOptions.length ? 'Choose default branch' : 'No active branches available'}</option>
                {branchOptions.map((branch) => <option key={String(branch.id)} value={String(branch.id)}>{branch.label}{branch.category_label ? ` · ${branch.category_label}` : ''}</option>)}
              </select>
              <button
                type="submit"
                class="folio-button folio-button-primary"
                disabled={handlers.busyId === 'add-feed' || !feedUrl.trim() || !feedBranchId || branchDeck.loading}
              >
                {handlers.busyId === 'add-feed' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>
            <p class="folio-feed-branch-help">New source records inherit this reviewed branch. If an article already exists under another reviewed branch, its canonical mapping is preserved.</p>
            {branchDeck.error && <p class="folio-inline-warning" role="alert">Branches could not be loaded. Retry before subscribing.</p>}
          </form>

          {feeds.length ? (
            <section class="folio-shelf folio-feeds-shelf" aria-labelledby="feeds-shelf-title">
              <div class="folio-section-heading">
                <div>
                  <h2 id="feeds-shelf-title">Subscribed Feeds</h2>
                  <p>Select a feed to view and triage its imported articles.</p>
                </div>
                <span class="folio-badge-count">{feeds.length}</span>
              </div>

              <div class="folio-feeds-list" role="list">
                {feeds.map((feed: LibraryRecord) => {
                  const isSelected = String(feed.id) === selectedFeedId
                  const isBusy = handlers.busyId === `sync:${feed.id}` || handlers.busyId === `delete:${feed.id}`
                  return (
                    <article class={`folio-record folio-feed-record${isSelected ? ' is-selected' : ''}`} key={feed.id} role="listitem">
                      <div class="folio-record-main">
                        <RecordMeta>
                          {feed.entry_count || 0} {(feed.entry_count || 0) === 1 ? 'entry' : 'entries'} · Last checked {feed.last_checked_at ? formatDate(feed.last_checked_at) : 'never'}
                        </RecordMeta>
                        <div class="folio-feed-title-row">
                          <button
                            type="button"
                            class="folio-feed-select-btn"
                            onClick={() => setSelectedFeedId(String(feed.id))}
                            title={`View articles from ${feed.title || feed.feed_url}`}
                          >
                            <strong>{feed.title || feed.feed_url}</strong>
                          </button>
                          {feed.site_url && (
                            <a
                              class="folio-feed-external-link"
                              href={feed.site_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Visit publisher website"
                            >
                              <Icon name="external" size={14}/>
                            </a>
                          )}
                        </div>
                        <p class="folio-record-note">{feed.feed_url}</p>
                        {feed.branch_label && <a class="folio-badge folio-badge-branch folio-feed-branch-pill" href={`#/map/branch/${encodeURIComponent(String(feed.branch_id))}`}><span class="badge-format">Default branch</span><span>{feed.branch_label}</span></a>}

                        <div class="folio-row-actions">
                          <button
                            type="button"
                            class={`folio-button${isSelected ? ' folio-button-primary' : ''}`}
                            onClick={() => setSelectedFeedId(String(feed.id))}
                          >
                            {isSelected ? 'Viewing entries' : 'View entries'}
                          </button>
                          {handlers.onSyncFeed && (
                            <button
                              type="button"
                              class="folio-button"
                              onClick={() => handlers.onSyncFeed?.(String(feed.id))}
                              disabled={isBusy}
                              title="Check this feed for new articles"
                            >
                              <Icon name="sync" size={14} class={handlers.busyId === `sync:${feed.id}` ? 'folio-icon-spin' : ''}/>
                              {handlers.busyId === `sync:${feed.id}` ? 'Checking…' : 'Check now'}
                            </button>
                          )}
                          {confirmDeleteId === feed.id ? (
                            <div class="folio-inline-confirm">
                              <span class="folio-confirm-label">Unsubscribe?</span>
                              <button
                                type="button"
                                class="folio-file-admin-btn folio-btn-danger folio-btn-confirm-yes"
                                onClick={() => {
                                  setConfirmDeleteId(null)
                                  handlers.onDeleteFeed?.(feed)
                                }}
                                disabled={isBusy}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                class="folio-file-admin-btn folio-btn-confirm-no"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              class="folio-button"
                              onClick={() => setConfirmDeleteId(String(feed.id))}
                              disabled={isBusy}
                              title="Unsubscribe from feed"
                            >
                              Unsubscribe
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}
        </>
      )}

      {!feeds.length && !showManageFeeds && (
        <ViewEmpty
          title="No feed subscriptions"
          body="Subscribe to high-quality RSS or Atom feeds to receive developer, tool, and essay updates for triage."
        />
      )}

      {feeds.length > 0 && (
        <div class="folio-feed-navigator">
          <div class="folio-feed-pill-strip" role="tablist" aria-label="Select feed to triage">
            <button
              type="button"
              role="tab"
              aria-selected={isAllFeeds}
              class={`folio-feed-pill${isAllFeeds ? ' is-active' : ''}`}
              onClick={() => setSelectedFeedId('all')}
              title="All subscribed feeds"
            >
              <Icon name="rss" size={13}/>
              <span class="folio-feed-pill-label">All Feeds</span>
              <span class="folio-feed-pill-badge">{totalEntries}</span>
            </button>
            {feeds.map((feed: LibraryRecord) => {
              const isSelected = String(feed.id) === selectedFeedId
              return (
                <button
                  key={feed.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  class={`folio-feed-pill${isSelected ? ' is-active' : ''}`}
                  onClick={() => setSelectedFeedId(String(feed.id))}
                  title={feed.title || feed.feed_url}
                >
                  <Icon name="rss" size={13}/>
                  <span class="folio-feed-pill-label">{feed.title || feed.feed_url}</span>
                  <span class="folio-feed-pill-badge">{feed.entry_count || 0}</span>
                </button>
              )
            })}
          </div>

          <div class="folio-feed-dropdown-wrapper">
            <div class="folio-feed-select-container">
              <Icon name="rss" size={14} class="folio-feed-select-lead-icon"/>
              <select
                class="folio-feed-select-dropdown"
                value={selectedFeedId || 'all'}
                onChange={(e) => setSelectedFeedId((e.currentTarget as HTMLSelectElement).value)}
                aria-label="Switch feed"
              >
                <option value="all">All Feeds ({totalEntries} articles)</option>
                {feeds.map((f: LibraryRecord) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.title || f.feed_url} ({f.entry_count || 0} articles)
                  </option>
                ))}
              </select>
              <Icon name="chevron" size={14} class="folio-feed-select-chevron"/>
            </div>
          </div>
        </div>
      )}

      {selectedFeed && (
        <section class="folio-shelf folio-feed-entries-shelf" aria-labelledby="feed-entries-title">
          <div class="folio-feed-stream-banner">
            <div class="folio-feed-banner-info">
              <div class="folio-feed-banner-top">
                <span class="folio-object-kicker">{isAllFeeds ? 'Unified Feed Stream' : 'Active Feed Stream'}</span>
                {!isAllFeeds && selectedFeed.site_url && (
                  <a
                    class="folio-feed-site-badge"
                    href={selectedFeed.site_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open publisher website"
                  >
                    <Icon name="external" size={12}/>
                    <span>Visit publisher</span>
                  </a>
                )}
              </div>
              <h2 id="feed-entries-title" class="folio-feed-banner-title">
                {selectedFeed.title || selectedFeed.feed_url}
              </h2>
              <div class="folio-feed-banner-meta">
                <span class="folio-feed-meta-url" title={selectedFeed.feed_url}>{selectedFeed.feed_url}</span>
                {!isAllFeeds && (
                  <>
                    <span class="folio-feed-meta-dot">·</span>
                    <span class="folio-feed-meta-checked">
                      Last checked {selectedFeed.last_checked_at ? formatDate(selectedFeed.last_checked_at) : 'never'}
                    </span>
                  </>
                )}
                {isAllFeeds && (
                  <>
                    <span class="folio-feed-meta-dot">·</span>
                    <span class="folio-feed-meta-checked">
                      {feeds.length} {feeds.length === 1 ? 'source' : 'sources'} active
                    </span>
                  </>
                )}
              </div>
              {!isAllFeeds && selectedFeed.branch_label && <a class="folio-badge folio-badge-branch folio-feed-branch-pill" href={`#/map/branch/${encodeURIComponent(String(selectedFeed.branch_id))}`}><span class="badge-format">Default branch</span><span>{selectedFeed.branch_label}</span></a>}
            </div>

            <div class="folio-feed-banner-actions">
              {isAllFeeds ? (
                handlers.onSyncFeeds && (
                  <button
                    type="button"
                    class={`folio-feed-btn folio-feed-btn-sync${isSyncingCurrent ? ' is-loading' : ''}`}
                    onClick={() => handlers.onSyncFeeds?.()}
                    disabled={isSyncingCurrent}
                    title="Check all feeds for new incoming articles"
                  >
                    <Icon name="sync" size={14} class={isSyncingCurrent ? 'folio-icon-spin' : ''}/>
                    <span>{isSyncingCurrent ? 'Checking all feeds…' : 'Check all feeds'}</span>
                  </button>
                )
              ) : (
                handlers.onSyncFeed && (
                  <button
                    type="button"
                    class={`folio-feed-btn folio-feed-btn-sync${isSyncingCurrent ? ' is-loading' : ''}`}
                    onClick={() => handlers.onSyncFeed?.(String(selectedFeed.id))}
                    disabled={isSyncingCurrent}
                    title="Check this feed for new incoming articles"
                  >
                    <Icon name="sync" size={14} class={isSyncingCurrent ? 'folio-icon-spin' : ''}/>
                    <span>{isSyncingCurrent ? 'Checking…' : 'Check now'}</span>
                  </button>
                )
              )}

              {handlers.onClearFeedEntries && feedEntries.length > 0 && (
                confirmClearId === (isAllFeeds ? 'all' : String(selectedFeed.id)) ? (
                  <div class="folio-feed-confirm-box">
                    <span class="folio-feed-confirm-text">Clear all {entriesTotal} articles{isAllFeeds ? ' across all feeds' : ''}?</span>
                    <button
                      type="button"
                      class="folio-feed-btn folio-feed-btn-danger"
                      onClick={() => {
                        const targetId = isAllFeeds ? 'all' : String(selectedFeed.id)
                        setConfirmClearId(null)
                        handlers.onClearFeedEntries?.(targetId)
                        setFeedEntries([])
                        setEntriesTotal(0)
                      }}
                      disabled={handlers.busyId === 'clear-feed-entries'}
                    >
                      Yes, clear
                    </button>
                    <button
                      type="button"
                      class="folio-feed-btn folio-feed-btn-cancel"
                      onClick={() => setConfirmClearId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    class="folio-feed-btn folio-feed-btn-clear"
                    onClick={() => setConfirmClearId(isAllFeeds ? 'all' : String(selectedFeed.id))}
                    disabled={handlers.busyId === 'clear-feed-entries'}
                    title={isAllFeeds ? 'Clear all imported articles across all feeds' : 'Clear imported articles for this feed'}
                  >
                    <Icon name="trash" size={14}/>
                    <span>{isAllFeeds ? 'Clear all feeds' : 'Clear articles'}</span>
                  </button>
                )
              )}

              <div class="folio-feed-stream-count-badge">
                <strong>{entriesTotal}</strong>
                <small>{entriesTotal === 1 ? 'article' : 'articles'}</small>
              </div>
            </div>
          </div>

          {loadingEntries ? (
            <div class="folio-shelf-loading">
              <Icon name="sync" size={16} class="folio-icon-spin"/>
              <span>Loading feed articles…</span>
            </div>
          ) : feedEntries.length ? (
            <div class="folio-record-list" aria-label={`Articles from ${selectedFeed.title || selectedFeed.feed_url}`}>
              {feedEntries.map((item: LibraryRecord) => {
                const href = sourceLink(item)
                const isQueued = item.learning_state === 'in_progress' || (item.status === 'active' && !['captured', 'inbox'].includes(String(item.learning_state || 'captured')))
                const isConsumed = item.status === 'consumed'
                const isExcluded = item.status === 'rejected' || item.learning_state === 'excluded'
                const isInbox = !isQueued && !isConsumed && !isExcluded
                const isDeleting = handlers.busyId === `delete-entry:${item.id}`

                return (
                  <article class="folio-record" key={item.id}>
                    <div class="folio-record-main">
                      <RecordMeta>
                        RSS · {selectedFeed.title || 'Feed'} · {formatDate(item.published_at || item.created_at || item.feed_imported_at)}
                      </RecordMeta>
                      <RowTitle item={item} onInspect={handlers.onInspect}/>
                      <p class="folio-record-reason">{formatReason(item)}</p>
                      {item.branch_label && <a class="folio-badge folio-badge-branch folio-feed-branch-pill" href={`#/map/branch/${encodeURIComponent(String(item.branch_id))}`}><span class="badge-format">Branch</span><span>{item.branch_label}</span></a>}

                      <div class="folio-row-actions">
                        {isInbox && (
                          <>
                            <button
                              type="button"
                              class="folio-button folio-button-primary"
                              onClick={() => handlers.onQueue(item)}
                              disabled={handlers.busyId === item.id}
                            >
                              Queue
                            </button>
                            <button
                              type="button"
                              class="folio-button"
                              onClick={() => handlers.onExclude(item)}
                              disabled={handlers.busyId === item.id}
                            >
                              Exclude
                            </button>
                          </>
                        )}
                        {isQueued && (
                          <a class="folio-button folio-button-primary" href={objectHref('source', String(item.id))}>
                            In Queue
                          </a>
                        )}
                        {isConsumed && (
                          <span class="folio-record-note">
                            Consumed
                          </span>
                        )}
                        {isExcluded && (
                          <span class="folio-record-note">
                            Excluded
                          </span>
                        )}
                        {href && (
                          <a class="folio-button" href={href} target="_blank" rel="noreferrer">
                            Open source
                          </a>
                        )}
                        <a class="folio-button" href={objectHref('source', String(item.id))}>Record</a>
                        {handlers.onDeleteFeedEntry && (
                          <button
                            type="button"
                            class="folio-button folio-btn-quiet-trash"
                            onClick={() => {
                              handlers.onDeleteFeedEntry?.(String(selectedFeed.id), item)
                              setFeedEntries((prev) => prev.filter((e) => e.id !== item.id))
                              setEntriesTotal((prev) => Math.max(0, prev - 1))
                            }}
                            disabled={isDeleting}
                            title="Remove this article from feed"
                          >
                            <Icon name="trash" size={13}/>
                            {isDeleting ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </div>

                      {isInbox && (
                        <small class="folio-action-note">Exclude is an administrative archive action. It does not teach Compass that the source was a bad fit.</small>
                      )}
                      {handlers.blockedId === item.id && (
                        <div class="folio-queue-override" role="alert">
                          <strong>Queue cap reached.</strong>
                          <span>Adding this source is an explicit overflow choice.</span>
                          <button
                            type="button"
                            class="folio-button folio-button-primary"
                            onClick={() => handlers.onQueue(item, true)}
                            disabled={handlers.busyId === item.id}
                          >
                            Add anyway — override cap
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div class="folio-feed-empty-state">
              <Icon name="rss" size={32}/>
              <h3>No articles in this stream</h3>
              <p>Imported articles appear here for triage. Click below to check for recent entries from this feed.</p>
              {handlers.onSyncFeed && (
                <button
                  type="button"
                  class="folio-button folio-button-primary"
                  onClick={() => handlers.onSyncFeed?.(String(selectedFeed.id))}
                  disabled={isSyncingCurrent}
                >
                  <Icon name="sync" size={14} class={isSyncingCurrent ? 'folio-icon-spin' : ''}/>
                  {isSyncingCurrent ? 'Checking feed…' : 'Check feed now'}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
    </div>
  )
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
  const [query, setQuery] = useState('')
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)
  const items = Array.isArray(data.artifacts) ? data.artifacts : []
  const groups = useMemo(() => artifactGroups(items), [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((group) => {
      const primary = group[0]
      const metadata = primary.metadata || {}
      const topic = group.find((f) => f.topic || f.metadata?.topic)?.topic || group.find((f) => f.metadata?.topic)?.metadata?.topic || primary.topic || metadata.topic || ''
      const text = `${metadata.source_title || ''} ${primary.filename || ''} ${topic} ${group.map((f) => f.filename || '').join(' ')}`.toLowerCase()
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
            const originalUrl = group.find((f) => f.source_url || f.metadata?.source_url)?.source_url || group.find((f) => f.metadata?.source_url)?.metadata?.source_url || primary.source_url || metadata.source_url || primary.video_url || null
            const notebookUrl = group.find((f) => f.notebook_url || f.metadata?.notebook_url)?.notebook_url || group.find((f) => f.metadata?.notebook_url)?.metadata?.notebook_url || primary.notebook_url || metadata.notebook_url || null
            const topic = group.find((f) => f.topic || f.metadata?.topic)?.topic || group.find((f) => f.metadata?.topic)?.metadata?.topic || primary.topic || metadata.topic || null
            const title = metadata.source_title || primary.filename || 'Owned reading artifact'
            const primaryHref = htmlFile ? artifactLink(htmlFile) : pdfFile ? artifactLink(pdfFile) : artifactLink(primary)

            return (
              <article class="folio-file-card" key={groupKey}>
                <a
                  class="folio-file-main-link"
                  href={primaryHref}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${title}`}
                >
                  <span class="folio-file-body">
                    <span class="folio-file-title" dir="auto">{title}</span>
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
          body={query ? 'Try a shorter search query.' : 'Uploaded documents and generated HTML/PDF companions will appear here.'}
        />
      )}
      {handlers.notice && <p class="folio-action-status" role="status">{handlers.notice}</p>}
    </div>
  )
}

export { BooksView }

export function ArchiveView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [filter, setFilter] = useState<'all' | 'consumed' | 'rejected'>('all')
  const all = Array.isArray(data.recommendations) ? data.recommendations : []
  const archived = all.filter((item: LibraryRecord) => ['consumed', 'rejected'].includes(String(item.status)))
  const items = filter === 'all' ? archived : archived.filter((item: LibraryRecord) => item.status === filter)
  return <div class="folio-library-view folio-archive-view">
    <div class="folio-view-intro"><div><p class="folio-kicker">Recovery without clutter</p><h1>Archive</h1><p>Completed sources and explicit exclusions stay findable, with their branch, notes, recall, and companions still linked.</p></div><span class="folio-count-readout"><strong>{archived.length}</strong><small>archived</small></span></div>
    <div class="folio-filter-row" role="group" aria-label="Archive status"><span>Show</span>{(['all', 'consumed', 'rejected'] as const).map((value) => <button type="button" class={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'all' ? 'All' : value === 'consumed' ? 'Completed' : 'Excluded'}</button>)}</div>
    {items.length ? <div class="folio-record-list" aria-label="Archived sources">{items.map((item: LibraryRecord) => <article class="folio-record" key={item.id}><div class="folio-record-main"><RecordMeta>{sourceFormat(item)} · {formatStatus(item.status)} · {formatDate(item.created_at)}</RecordMeta><RowTitle item={item} onInspect={handlers.onInspect}/><BranchContextBadges item={item}/><p class="folio-record-reason">{item.user_review || formatReason(item)}</p><div class="folio-row-actions"><a class="folio-button" href={objectHref('source', String(item.id))}>Dossier</a><button type="button" class="folio-button danger-button" onClick={() => handlers.onDeleteRecommendationPermanently(item)} disabled={handlers.busyId === `permanent-delete:${item.id}`}>{handlers.busyId === `permanent-delete:${item.id}` ? 'Deleting forever…' : 'Delete permanently'}</button></div></div></article>)}</div> : <ViewEmpty title="No archived items" body="Completed and excluded sources will appear here."/>}
  </div>
}

function BranchContextBadges({ item }: { item: LibraryRecord }) {
  const branchLabel = item.branch?.label || item.branch_preflight?.branch_label || item.branch_label || (typeof item.branch === 'string' ? item.branch : '')
  const branchId = item.branch?.id || item.branch_preflight?.branch_id || item.branch_id || branchLabel
  if (!branchLabel && !item.note && !item.recall?.count && !item.companions?.html && !item.companions?.pdf) return null
  return <div class="folio-queue-badges" aria-label="Branch context">
    {branchLabel && <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(String(branchId))}`} title="Open branch dossier"><span class="badge-format">Branch</span><span>{branchLabel}</span></a>}
    {item.note ? <a class="folio-badge folio-badge-note" href="#/learn?mode=practice&focus=notes" title="Open field notes">Note taken: {item.note.title}</a> : null}
    {item.recall?.count > 0 ? <a class="folio-badge folio-badge-recall" href="#/learn?mode=practice&focus=recall" title="Open recall deck">{item.recall.count} approved {item.recall.count === 1 ? 'card' : 'cards'}{item.recall.due > 0 ? ` · ${item.recall.due} due today` : ''}</a> : null}
    {item.companions?.html && <a class="folio-badge folio-badge-html" href={`/artifacts/${encodeURIComponent(String(item.companions.html.id))}`} title="Open Arabic reading companion">Read HTML</a>}
    {item.companions?.pdf && <a class="folio-badge folio-badge-pdf" href={`/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`} title="Download A4 companion">PDF</a>}
  </div>
}

export function ObjectRouteView({ type, data, handlers, onBack }: { type: 'source' | 'artifact' | 'book'; data: LibraryRecord; handlers: LibraryViewHandlers; onBack: () => void }) {
  const item = data.item || data.artifact || data.book || data
  if (type === 'book') return <div class="folio-library-view folio-object-view book-dossier-view"><BookObject item={item} record={data} handlers={handlers} onBack={onBack}/></div>
  const title = type === 'artifact' ? String(item.filename || 'Artifact') : sourceTitle(item)
  return <div class="folio-library-view folio-object-view">
    <button type="button" class="folio-back-link" onClick={onBack}><Icon name="back" size={16}/>Back to {type === 'artifact' ? 'Files' : 'Library'}</button>
    <header class="folio-object-header"><div><RecordMeta>{type === 'source' ? `${sourceFormat(item)} · ${sourceState(item)}` : `${fileKind(item)} · ${formatBytes(item.size_bytes) || 'size unavailable'}`}</RecordMeta><h1>{title}</h1><p>{type === 'artifact' ? item.metadata?.source_title || 'Owned file in the R2 library.' : `${sourceCreator(item)}${item.created_at ? ` · added ${formatDate(item.created_at)}` : ''}`}</p></div></header>
    {type === 'source' && <SourceObject item={item} record={data} handlers={handlers}/>}
    {type === 'artifact' && <ArtifactObject item={item}/>}
  </div>
}

function SourceObject({ item, record, handlers }: { item: LibraryRecord; record: LibraryRecord; handlers: LibraryViewHandlers }) {
  const thread = (record.threads || [])[0]
  const artifacts = record.artifacts || []
  const notes = record.notes || []
  const companions = record.companions || {}
  const recall = record.srs?.recall_summary || { count: 0, due: 0 }
  const drafts = (record.srs?.drafts || []).filter((draft: LibraryRecord) => draft.status !== 'approved')
  const branch = item.branch || (item.branch_id ? { id: item.branch_id, label: item.branch_label || item.branch_id, status: item.branch_status } : null)
  const notebookUrl = item.notebook_url
    || item.metadata?.notebook_url
    || artifacts.find((f: LibraryRecord) => f.notebook_url || f.metadata?.notebook_url)?.notebook_url
    || artifacts.find((f: LibraryRecord) => f.metadata?.notebook_url)?.metadata?.notebook_url
    || null
  const userScore = Number(item.user_score ?? item.user_rating ?? 0)
  const outcome = record.outcome
  return <div class="folio-object-sections">
    <section class="folio-object-section"><h2>Source access</h2><div class="folio-row-actions">{sourceLink(item) && <a class="folio-button folio-button-primary" href={sourceLink(item)!} target="_blank" rel="noreferrer">Open original</a>}{notebookUrl && <a class="folio-button" href={notebookUrl} target="_blank" rel="noreferrer">Open NotebookLM</a>}</div><p class="folio-record-note">Opening this source is passive. Start a tracked learning session from Queue.</p></section>
    <SourceAnnotationPanel source={item} threadId={thread?.id} branchId={branch?.id}/>
    {branch && <section class="folio-object-section"><div class="folio-section-heading"><h2>Branch</h2><span class="folio-badge folio-badge-branch"><span class="badge-format">Branch</span><span>{branch.label}</span></span></div><div class="folio-row-actions"><a class="folio-button" href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}>Open branch dossier</a></div><p class="folio-record-note">{branch.status === 'pruned' ? 'This branch is pruned — review the mapping before starting.' : branch.status && branch.status !== 'unverified' ? `Branch status: ${branch.status.replace(/_/g, ' ')}.` : 'Branch match is not verified yet.'}</p></section>}
    {(companions.html || companions.pdf) && <section class="folio-object-section"><div class="folio-section-heading"><h2>Reading companions</h2><span>{[(companions.html && 'HTML') || null, (companions.pdf && 'PDF') || null].filter(Boolean).join(' + ')}</span></div><div class="folio-row-actions">{companions.html && <a class="folio-button folio-button-primary" href={`/artifacts/${encodeURIComponent(String(companions.html.id))}`} target="_blank" rel="noreferrer">Read HTML companion</a>}{companions.pdf && <a class="folio-button" href={`/artifacts/${encodeURIComponent(String(companions.pdf.id))}`} target="_blank" rel="noreferrer">Download A4 PDF{companions.pdf.size_bytes ? ` · ${formatBytes(companions.pdf.size_bytes)}` : ''}</a>}</div><p class="folio-record-note">Canonical Arabic reading companion rendered from one verified body.</p></section>}
    <section class="folio-object-section"><div class="folio-section-heading"><h2>Active recall</h2><span>{recall.count} approved{recall.due > 0 ? ` · ${recall.due} due` : ''}</span></div>{(record.srs?.cards || []).length ? <ul class="folio-recall-list">{(record.srs.cards || []).map((card: LibraryRecord) => <li key={card.id}><strong>{card.question}</strong><span>Topic: {card.topic || 'General'} · Due {formatDate(card.due_at)} · {card.repetitions} reps</span></li>)}</ul> : <p class="folio-record-note">No approved recall cards yet.</p>}{drafts.length > 0 && <div class="folio-draft-strip"><span>{drafts.length} pending {drafts.length === 1 ? 'draft' : 'drafts'}</span><a class="folio-button" href="#/learn?mode=practice&focus=recall">Review drafts</a></div>}{recall.count === 0 && drafts.length === 0 && <div class="folio-row-actions"><a class="folio-button" href="#/learn?mode=practice&focus=notes">Take a note first</a></div>}</section>
    <SourceFeedbackPanel item={item} record={record} threadId={thread?.id} handlers={handlers} userScore={userScore} outcome={outcome}/>
    {thread && <section class="folio-object-section"><h2>Learning Thread</h2><a class="folio-linked-object" href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`}><strong>{thread.title}</strong><span>{thread.role || 'Attached source'} · {formatStatus(thread.status)}</span></a>{thread.expected_contribution && <p>{thread.expected_contribution}</p>}</section>}
    <section class="folio-object-section"><div class="folio-section-heading"><h2>Files</h2><span>{artifacts.length}</span></div>{artifacts.length ? artifacts.map((file: LibraryRecord) => <a class="folio-linked-object" href={artifactLink(file)} target="_blank" rel="noreferrer" key={file.id}><strong>{file.filename || fileKind(file)}</strong><span>{fileKind(file)} · passive open</span></a>) : <p class="folio-record-note">No linked files yet.</p>}</section>
    {notes.map((note: LibraryRecord) => <section class="folio-object-section" key={note.id}><div class="folio-section-heading"><h2>{note.kind === 'reflection' ? 'Reflection' : 'Extracted note'}</h2><span>{formatStatus(note.status || 'draft')}</span></div>{(note.sections || []).map((section: LibraryRecord) => <div class="folio-bilingual-block" dir={section.direction || 'auto'} key={section.section_key}><strong>{section.label || labelize(section.section_key || 'section')}</strong><p>{section.content}</p></div>)}</section>)}
  </div>
}

type FeedbackCompletionState = 'completed' | 'in_progress' | 'stopped'

const feedbackReasonOptions: Record<FeedbackCompletionState, Array<[string, string]>> = {
  completed: [
    ['highly_relevant', 'Highly relevant'], ['excellent_source', 'Excellent source'], ['right_depth', 'Right depth'],
    ['too_shallow', 'Too shallow'], ['too_long', 'Too long'], ['wrong_format', 'Wrong format'],
  ],
  in_progress: [
    ['not_now', 'Continue later'], ['access_problem', 'Access problem'], ['wrong_format', 'Wrong format'], ['too_long', 'Needs more time'],
  ],
  stopped: [
    ['bad_fit', 'Bad fit'], ['wrong_topic', 'Wrong topic'], ['too_familiar', 'Too familiar'], ['already_mastered', 'Already mastered'],
    ['too_shallow', 'Too shallow'], ['too_advanced', 'Too advanced'], ['too_long', 'Too long'], ['poor_source', 'Poor source'],
    ['wrong_format', 'Wrong format'], ['access_problem', 'Access problem'], ['other', 'Another reason'],
  ],
}

function SourceFeedbackPanel({ item, record, threadId, handlers, userScore, outcome }: {
  item: LibraryRecord
  record: LibraryRecord
  threadId?: string
  handlers: LibraryViewHandlers
  userScore: number
  outcome?: LibraryRecord | null
}) {
  const metadata = parseMetadata(item.source_metadata_json)
  const previous = metadata.learning_feedback || {}
  const initialCompletion: FeedbackCompletionState = ['completed', 'in_progress', 'stopped'].includes(String(previous.completion_state || ''))
    ? previous.completion_state
    : item.status === 'consumed' ? 'completed' : 'in_progress'
  const [completionState, setCompletionState] = useState<FeedbackCompletionState>(initialCompletion)
  const [reasonTags, setReasonTags] = useState<string[]>(Array.isArray(previous.reason_tags) ? previous.reason_tags : [])
  const [score, setScore] = useState(previous.score ?? (userScore || ''))
  const [disposition, setDisposition] = useState(String(record.disposition?.disposition || previous.disposition || 'undecided'))
  const [reflection, setReflection] = useState(String(item.user_review || ''))
  const [expected, setExpected] = useState(String(previous.expected || ''))
  const [actual, setActual] = useState(String(previous.actual || ''))
  const [effort, setEffort] = useState(String(previous.effort || ''))
  const [lengthMinutes, setLengthMinutes] = useState(previous.length_minutes == null ? '' : String(previous.length_minutes))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<LibraryRecord | null>(null)

  const changeCompletion = (next: FeedbackCompletionState) => {
    setCompletionState(next)
    setReasonTags((current) => current.filter((tag) => feedbackReasonOptions[next].some(([value]) => value === tag)))
    setError('')
  }
  const toggleReason = (reason: string) => setReasonTags((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason].slice(0, 8))
  const submit = async (event: Event) => {
    event.preventDefault()
    if (!reflection.trim()) { setError('Write a short reflection so the feedback keeps your exact meaning.'); return }
    if (completionState === 'stopped' && reasonTags.length === 0) { setError('Choose at least one reason for stopping.'); return }
    setSaving(true); setError(''); setReceipt(null)
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
    } catch (submitError: any) {
      setError(submitError?.message || 'Feedback could not be saved. Check the fields and try again.')
    } finally { setSaving(false) }
  }

  const visibleReceipt = receipt || (!saving && !error && handlers.feedbackReceipt?.sourceId === String(item.id) ? handlers.feedbackReceipt.result : null)
  const receiptCopy = visibleReceipt
    ? visibleReceipt.receipt?.neutral
      ? 'Saved as a neutral timing signal. It will not count as bad fit.'
      : visibleReceipt.extraction_job
        ? 'Saved. Hermes analysis and note preparation are queued.'
        : 'Saved. Hermes analysis is queued; no notes were requested.'
    : ''

  return <section class="folio-object-section source-feedback-panel" aria-labelledby="source-feedback-title">
    <div class="folio-section-heading source-feedback-heading">
      <div><span class="folio-kicker">Close the loop</span><h2 id="source-feedback-title">Feedback & outcome</h2><p class="folio-record-note">Record what happened. Timing, fit, rating, and what to keep remain separate.</p></div>
      {userScore > 0 && <span class="folio-score">{userScore}/10</span>}
    </div>
    {(item.user_review || outcome?.outcome_status) && <div class="source-feedback-current">
      {item.user_review && <blockquote dir="auto">{item.user_review}</blockquote>}
      {outcome?.outcome_status && <dl class="folio-property-list"><div><dt>Outcome</dt><dd>{formatStatus(outcome.outcome_status)}</dd></div>{outcome.actual_score != null && <div><dt>Score</dt><dd>{outcome.actual_score}/10</dd></div>}{outcome.consumed_at && <div><dt>Finished</dt><dd>{formatDate(outcome.consumed_at)}</dd></div>}</dl>}
    </div>}
    <form class="source-feedback-form" onSubmit={submit} noValidate>
      <fieldset class="source-feedback-state">
        <legend>What happened?</legend>
        <div class="source-feedback-segments">
          {([['completed', 'Finished', 'Mark this source complete'], ['in_progress', 'Continue later', 'Keep it open without a negative signal'], ['stopped', 'Stopped', 'Record why it was not worth continuing']] as Array<[FeedbackCompletionState, string, string]>).map(([value, label, hint]) => <label class={completionState === value ? 'active' : ''} key={value}><input type="radio" name={`feedback-state-${item.id}`} value={value} checked={completionState === value} onChange={() => changeCompletion(value)}/><strong>{label}</strong><small>{hint}</small></label>)}
        </div>
      </fieldset>
      <fieldset class="source-feedback-reasons">
        <legend>{completionState === 'stopped' ? 'Why did you stop?' : completionState === 'completed' ? 'What stood out?' : 'Why continue later?'}</legend>
        <div class="source-feedback-chips">
          {feedbackReasonOptions[completionState].map(([value, label]) => <label class={reasonTags.includes(value) ? 'active' : ''} key={value}><input type="checkbox" value={value} checked={reasonTags.includes(value)} onChange={() => toggleReason(value)}/><span>{label}</span></label>)}
        </div>
      </fieldset>
      <div class="source-feedback-decision-grid">
        <label class="folio-form-field"><span>Usefulness score <small>optional, 0–10</small></span><input type="number" min="0" max="10" step="1" inputMode="numeric" value={score} onInput={(event) => setScore((event.target as HTMLInputElement).value)}/></label>
        <label class="folio-form-field"><span>What should happen to the ideas?</span><select value={disposition} onChange={(event) => setDisposition((event.target as HTMLSelectElement).value)}><option value="undecided">Decide later</option><option value="retain">Keep for recall</option><option value="apply">Apply soon</option><option value="reference">Reference only</option><option value="drop">Drop</option></select></label>
      </div>
      <label class="folio-form-field source-feedback-reflection"><span>Your reflection</span><textarea value={reflection} maxLength={10000} aria-describedby={`feedback-reflection-help-${item.id}`} onInput={(event) => { setReflection((event.target as HTMLTextAreaElement).value); if (error) setError('') }} placeholder={completionState === 'completed' ? 'What was useful, surprising, or missing?' : completionState === 'stopped' ? 'What made this a poor use of your time?' : 'What should you remember when you return?'} required/><small id={`feedback-reflection-help-${item.id}`}>Your words are preserved exactly. Feedback never requests another recommendation.</small></label>
      <details class="source-feedback-details" open={Boolean(previous.expected || previous.actual || previous.effort || previous.length_minutes)}>
        <summary>Expectation, result, and effort <span>optional</span></summary>
        <div class="source-feedback-expectation">
          <label class="folio-form-field"><span>Expected</span><textarea value={expected} maxLength={2000} onInput={(event) => setExpected((event.target as HTMLTextAreaElement).value)} placeholder="What did you expect this source to give you?"/></label>
          <label class="folio-form-field"><span>Actually got</span><textarea value={actual} maxLength={2000} onInput={(event) => setActual((event.target as HTMLTextAreaElement).value)} placeholder="What did it actually give you?"/></label>
        </div>
        <div class="source-feedback-decision-grid"><label class="folio-form-field"><span>Effort</span><select value={effort} onChange={(event) => setEffort((event.target as HTMLSelectElement).value)}><option value="">Not recorded</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select></label><label class="folio-form-field"><span>Minutes spent</span><input type="number" min="0" max="100000" inputMode="numeric" value={lengthMinutes} onInput={(event) => setLengthMinutes((event.target as HTMLInputElement).value)}/></label></div>
      </details>
      {error && <p class="source-feedback-error" role="alert">{error}</p>}
      <div class="folio-form-actions"><button type="submit" class="folio-button folio-button-primary" disabled={saving}>{saving ? 'Saving feedback…' : 'Save feedback'}</button>{receiptCopy && <output class="source-feedback-receipt" role="status"><strong>Feedback saved.</strong><span>{receiptCopy}</span>{visibleReceipt?.feedback_job && <small>Analysis receipt: {visibleReceipt.feedback_job}</small>}</output>}</div>
    </form>
  </section>
}

function SourceAnnotationPanel({ source, threadId, branchId }: { source: LibraryRecord; threadId?: string; branchId?: string }) {
  const [annotations, setAnnotations] = useState<LibraryRecord[]>([])
  const [quote, setQuote] = useState('')
  const [locator, setLocator] = useState('')
  const [locatorType, setLocatorType] = useState('web')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const load = () => api<{ annotations: LibraryRecord[] }>(`/annotations?recommendation_id=${encodeURIComponent(String(source.id))}`).then((payload) => setAnnotations(payload.annotations || [])).catch(() => setAnnotations([]))
  useEffect(() => { void load() }, [source.id])
  const save = async (event: Event) => {
    event.preventDefault()
    if (!quote.trim()) return
    setSaving(true)
    try {
      await api('/annotations', { method: 'POST', body: JSON.stringify({ recommendation_id: source.id, thread_id: threadId, branch_id: branchId, locator_type: locatorType, selector: locator.trim() ? { locator: locator.trim() } : {}, quote: quote.trim(), created_by: 'user' }) })
      setQuote(''); setLocator(''); setNotice('Passage saved to the evidence ledger. Hermes can now ground a proposal in it.'); await load()
    } catch (error: any) { setNotice(error?.message || 'The passage could not be saved.') }
    finally { setSaving(false) }
  }
  return <section class="folio-object-section source-annotation-panel" aria-labelledby="source-annotation-title">
    <div class="folio-section-heading"><div><h2 id="source-annotation-title">Source anchors</h2><p class="folio-record-note">Capture the exact passage Hermes should use as evidence.</p></div><span>{annotations.length} active</span></div>
    <form class="source-annotation-form" onSubmit={save}>
      <label>Passage<textarea value={quote} onInput={(event) => setQuote((event.target as HTMLTextAreaElement).value)} placeholder="Paste the exact sentence or excerpt…" required /></label>
      <div class="source-annotation-fields"><label>Locator type<select value={locatorType} onChange={(event) => setLocatorType((event.target as HTMLSelectElement).value)}><option value="web">Web passage</option><option value="pdf">PDF page or quote</option><option value="video">Video timestamp</option><option value="epub">EPUB location</option><option value="artifact">Companion section</option><option value="text">Plain text</option></select></label><label>Locator<input value={locator} onInput={(event) => setLocator((event.target as HTMLInputElement).value)} placeholder="Page 8, 12:42, CSS selector…" /></label></div>
      <div class="folio-form-actions"><button type="submit" class="folio-button folio-button-primary" disabled={saving || !quote.trim()}>{saving ? 'Saving…' : 'Save source anchor'}</button>{notice && <output aria-live="polite">{notice}</output>}</div>
    </form>
    {annotations.length ? <div class="source-annotation-list">{annotations.slice(0, 8).map((annotation) => <article key={annotation.id}><p>{annotation.quote}</p><small>{labelize(annotation.locator_type || 'source')} · {annotation.selector?.locator || 'Locator not recorded'} · {formatDate(annotation.created_at)}</small><div class="folio-row-actions"><a class="folio-button" href={`#/learn?mode=practice&focus=notes&annotation=${encodeURIComponent(String(annotation.id))}`}>Use in Learn</a></div></article>)}</div> : <p class="folio-record-note">No passage anchors yet. Anchors are evidence, not proof of mastery.</p>}
  </section>
}

function ArtifactObject({ item }: { item: LibraryRecord }) {
  const metadata = item.metadata || {}
  return <div class="folio-object-sections"><section class="folio-object-section"><h2>Artifact access</h2><div class="folio-row-actions"><a class="folio-button folio-button-primary" href={artifactLink(item)} target="_blank" rel="noreferrer">Open {fileKind(item)}</a></div><dl class="folio-property-list"><div><dt>Filename</dt><dd>{item.filename || 'Unnamed file'}</dd></div><div><dt>Source</dt><dd>{metadata.source_title || metadata.source_url || 'Not linked'}</dd></div><div><dt>Created</dt><dd>{formatDate(item.created_at)}</dd></div><div><dt>Role</dt><dd>{metadata.role || fileKind(item)}</dd></div></dl></section></div>
}

function BookObject({ item, record, handlers, onBack }: { item: LibraryRecord; record: LibraryRecord; handlers: LibraryViewHandlers; onBack: () => void }) {
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
  const branch = item.branch || (item.branch_id ? { id: item.branch_id, label: item.branch_label || item.branch_id, status: item.branch_status } : null)
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
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  return <div class="book-overview-fold book-dossier">
    <button type="button" class="book-overview-back" onClick={onBack}><Icon name="back" size={14}/>Back to Books</button>

    <header class="book-overview-head">
      <div class="book-overview-status-row">
        {isPrimary ? <span class="book-overview-primary"><Icon name="pin" size={13}/>Current book</span> : <button type="button" class="book-overview-pin" onClick={() => handlers.onSetBookReadingState(item, 'reading', true)} disabled={handlers.busyId === `reading-state:${item.id}`}><Icon name="pin" size={14}/>Make current</button>}
        <span>{readingState === 'reading' ? 'Reading' : formatStatus(readingState)}</span>
      </div>
      <h1>{sourceTitle(item)}</h1>
      <p>{sourceCreator(item)}</p>

    </header>

    {progress.total > 0 && <section class="book-overview-progress" aria-label="Reading progress">
      <div><span>{progress.finished} of {progress.total} chapters completed</span><strong>{progress.percent}%</strong></div>
      <div role="progressbar" aria-label={`${sourceTitle(item)} reading progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{ width: `${progress.percent}%` }}/></div>
    </section>}

    <div class="book-overview-context" aria-label="Knowledge context">
      {branch && (branch.linkable !== false && branch.verified !== false ? <a href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}><Icon name="branch" size={13}/><span>{branch.label}</span></a> : <span><Icon name="branch" size={13}/>{branch.label}</span>)}
      {memberships.map((membership: LibraryRecord) => <a href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`} key={String(membership.entry_id || `${membership.domain_id}-${membership.role}`)}>Canon · {formatStatus(membership.role)} · {membership.domain_title}</a>)}
      {threads.map((thread: LibraryRecord) => <a href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`} key={String(thread.id)}><Icon name="path" size={12}/><span>Thread · {thread.title}</span></a>)}
    </div>

    <label class="book-overview-state-control"><span>Reading status</span><select value={readingState} onChange={(event) => handlers.onSetBookReadingState(item, (event.currentTarget as HTMLSelectElement).value as 'saved' | 'reading' | 'finished')} disabled={handlers.busyId === `reading-state:${item.id}`}><option value="saved">Saved</option><option value="reading">Reading</option><option value="finished">Finished</option></select></label>

    {nextChapter ? <section class="book-overview-next" aria-labelledby="book-next-chapter-title">
      <div>
        <span>Next chapter</span>
        <h2 id="book-next-chapter-title">{nextChapter.number ? `${nextChapter.number}. ` : ''}{nextChapter.title}</h2>
      </div>
      <ReadingFormatLinks book={book} chapter={nextChapter}/>
      <button type="button" onClick={() => handlers.onCompleteChapter(book, nextChapter)} disabled={handlers.busyId === `${book.id}:${nextChapter.key}`}><Icon name={nextChapter.completed ? 'back' : 'check'} size={15}/>{nextChapter.completed ? 'Reopen' : 'Mark done'}</button>
    </section> : <section class="book-overview-next is-empty"><div><h2>No chapters yet</h2><p>Add the book structure before attaching reading formats.</p></div><button type="button" onClick={() => setEditingChapters(true)}>Add chapters</button></section>}

    {handlers.notice && <p class="book-overview-notice" role="status">{handlers.notice}</p>}

    <nav class="book-dossier-index" aria-label="Book hub sections">
      {([['overview', 'Overview'], ['chapters', 'Chapters'], ['study', 'Notes & anchors'], ['recall', 'Recall'], ['connections', 'Connections'], ['history', 'History'], ['files', 'Files'], ['reflection', 'Reflection']] as Array<[string, string]>).map(([section, label]) => <button type="button" key={section} onClick={() => jump(`book-${section}`)}>{label}</button>)}
    </nav>

    <div class="book-dossier-layout">
      <main class="book-dossier-main">
        <section id="book-overview" class="book-dossier-section">
          <div class="book-dossier-section-head"><h2>Overview</h2><span>{formatStatus(readingState)}</span></div>
          <dl class="book-dossier-facts">
            <div><dt>Author</dt><dd>{sourceCreator(item)}</dd></div>
            <div><dt>ISBN</dt><dd>{metadata.isbn || item.isbn || 'Not recorded'}</dd></div>
            <div><dt>Added</dt><dd>{formatDate(item.created_at)}</dd></div>
            <div><dt>Updated</dt><dd>{formatDate(item.updated_at)}</dd></div>
            <div><dt>Reading status</dt><dd>{formatStatus(readingState)}</dd></div>
          </dl>
          {item.why_this && <blockquote class="book-dossier-rationale">{item.why_this}</blockquote>}
          {memberships.length > 0 && <div class="book-canon-placements"><h3>Canon placement</h3>{memberships.map((membership: LibraryRecord) => <article key={membership.entry_id || `${membership.domain_id}-${membership.role}`}><div><span>{formatStatus(membership.role)}</span><strong>{membership.domain_title}</strong></div>{membership.domain_boundary && <p>{membership.domain_boundary}</p>}<a href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`}>Open field guide</a></article>)}</div>}
        </section>

        <section id="book-chapters" class="book-dossier-section">
          <div class="book-dossier-section-head"><h2>Chapters & companions</h2><span>{progress.total ? `${progress.finished}/${progress.total} finished` : 'No chapters'}</span></div>
          <details class="book-overview-chapters book-hub-chapters">
            <summary><span>Complete chapter ledger</span><span class="book-overview-chapter-count"><small>{chapters.length}</small><Icon name="chevron" size={15}/></span></summary>
            <div class="book-overview-chapter-tools"><button type="button" onClick={() => setEditingChapters(true)}>{chapters.length ? 'Edit chapters' : 'Add chapters'}</button></div>
            {chapters.length ? <BookChapterRows book={book} handlers={handlers} onEdit={() => setEditingChapters(true)}/> : <div class="book-dossier-empty"><strong>No chapters yet</strong><p>Add the book structure before attaching reading formats.</p></div>}
          </details>
        </section>

        <section id="book-study" class="book-dossier-section">
          <div class="book-dossier-section-head"><h2>Notes & source anchors</h2><span>{notes.length} notes</span></div>
          {notes.length ? <details class="book-dossier-notes">
            <summary><span>Linked notes</span><span class="book-overview-chapter-count"><small>{notes.length}</small><Icon name="chevron" size={15}/></span></summary>
            <div class="book-dossier-note-list">{notes.map((note: LibraryRecord) => <a class="book-dossier-note-link" href={noteHref(String(note.id))} key={note.id}>
              <span><strong>{note.title || (note.kind === 'reflection' ? 'Reflection' : 'Book note')}</strong><small>{note.kind === 'reflection' ? 'Reflection' : 'Note'}{note.updated_at ? ` · Updated ${formatDate(note.updated_at)}` : ''}</small></span>
              <span>{formatStatus(note.status || 'draft')}<Icon name="chevron" size={14}/></span>
            </a>)}</div>
          </details> : <div class="book-dossier-empty"><strong>No notes yet</strong><p>Notes written or extracted for this book will stay attached here.</p><a class="folio-button" href="#/learn?mode=practice&focus=notes">Open Notes</a></div>}
          <details class="book-dossier-disclosure book-dossier-anchors">
            <summary><span>Source anchors</span><Icon name="chevron" size={15}/></summary>
            <SourceAnnotationPanel source={item} threadId={threads[0]?.id} branchId={branch?.id}/>
          </details>
        </section>

        <details id="book-reflection" class="book-dossier-reflection book-dossier-disclosure">
          <summary><span>Feedback & outcome</span><Icon name="chevron" size={15}/></summary>
          <SourceFeedbackPanel item={item} record={record} threadId={threads[0]?.id} handlers={handlers} userScore={score} outcome={record.outcome}/>
        </details>
      </main>

      <aside class="book-dossier-aside" aria-label="Book learning context">
        <section id="book-recall" class="book-dossier-side-section">
          <div class="book-dossier-section-head"><h2>Recall</h2><span>{recall.count} approved{recall.due ? ` · ${recall.due} due` : ''}</span></div>
          {cards.length ? <ul class="folio-recall-list">{cards.slice(0, 6).map((card: LibraryRecord) => <li key={card.id}><a href={`#/learn/card/${encodeURIComponent(String(card.id))}?mode=practice&focus=recall`}><strong>{card.question}</strong></a><span>{card.topic || 'General'} · Due {formatDate(card.due_at)}</span></li>)}</ul> : <p class="folio-record-note">No approved recall cards yet.</p>}
          {drafts.length > 0 && <div class="folio-draft-strip"><span>{drafts.length} pending {drafts.length === 1 ? 'draft' : 'drafts'}</span><a class="folio-button" href="#/learn?mode=practice&focus=recall">Review drafts</a></div>}
          {!cards.length && !drafts.length && <div class="folio-row-actions"><a class="folio-button" href="#/learn?mode=practice&focus=notes">Take a note first</a></div>}
        </section>

        <section id="book-connections" class="book-dossier-side-section">
          <div class="book-dossier-section-head"><h2>Connections</h2><span>{(branch ? 1 : 0) + memberships.length + threads.length + units.length}</span></div>
          {branch && (branch.linkable !== false && branch.verified !== false ? <a class="folio-linked-object" href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}><strong>{branch.label}</strong><span>{formatStatus(branch.status)}</span></a> : <div class="folio-linked-object"><strong>{branch.label}</strong><span>Branch match not verified</span></div>)}
          {memberships.map((membership: LibraryRecord) => <a class="folio-linked-object" href={`#/learn/canon/${encodeURIComponent(String(membership.domain_slug || membership.domain_id))}`} key={membership.entry_id || `${membership.domain_id}-${membership.role}`}><strong>{membership.domain_title}</strong><span>Canon · {formatStatus(membership.role)}</span></a>)}
          {threads.map((thread: LibraryRecord) => <a class="folio-linked-object" href={`#/learn/thread/${encodeURIComponent(String(thread.id))}`} key={thread.id}><strong>{thread.title}</strong><span>{thread.role || 'Attached book'} · {formatStatus(thread.status)}</span></a>)}
          {units.map((unit: LibraryRecord) => <a class="folio-linked-object" href={`#/learn/unit/${encodeURIComponent(String(unit.id))}`} key={unit.id}><strong>{unit.statement || unit.title || 'Learning unit'}</strong><span>{formatStatus(unit.unit_type || 'concept')}</span></a>)}
          {!branch && !memberships.length && !threads.length && !units.length && <p class="folio-record-note">No knowledge connections recorded yet.</p>}
        </section>

        <section id="book-history" class="book-dossier-side-section">
          <div class="book-dossier-section-head"><h2>Reading history</h2><span>{sessions.length}</span></div>
          {sessions.length ? <ol class="book-session-list">{sessions.map((session: LibraryRecord) => <li key={session.id}><strong>{formatStatus(session.status)}</strong><span>{formatDate(session.started_at)}{session.completed_at ? ` · finished ${formatDate(session.completed_at)}` : session.returned_at ? ` · returned ${formatDate(session.returned_at)}` : ''}</span>{session.intent && <p>{session.intent}</p>}{session.reflection && <blockquote>{session.reflection}</blockquote>}</li>)}</ol> : <p class="folio-record-note">No tracked sessions yet. Start from Queue when this book earns active attention.</p>}
        </section>

        <section id="book-files" class="book-dossier-side-section">
          <div class="book-dossier-section-head"><h2>Files</h2><span>{artifacts.length}</span></div>
          {artifacts.length ? <div class="book-file-list">{artifacts.map((artifact: LibraryRecord) => { const artifactMetadata = parseMetadata(artifact.metadata_json); return <a class="folio-linked-object" href={artifactLink(artifact)} target="_blank" rel="noreferrer" key={artifact.id}><strong>{artifact.filename || fileKind(artifact)}</strong><span>{artifactMetadata.chapter_title || artifactMetadata.role || fileKind(artifact)}{artifact.size_bytes ? ` · ${formatBytes(artifact.size_bytes)}` : ''}</span></a> })}</div> : <p class="folio-record-note">No linked files yet.</p>}
        </section>
      </aside>
    </div>

    {editingChapters && <ChapterManagerDialog
      book={book}
      onClose={() => setEditingChapters(false)}
      onSaved={() => { setEditingChapters(false); handlers.onReload?.() }}
    />}
  </div>
}
