import { useEffect, useMemo, useState } from 'preact/hooks'
import { api, formatDate, labelize } from '../../api'
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
  onDeleteArtifact: (item: LibraryRecord, skipConfirm?: boolean) => void
  onDeleteRecommendationPermanently: (item: LibraryRecord) => void
  onCompleteChapter: (book: LibraryRecord, chapter: LibraryRecord) => void
  onAddBook: (payload: { title: string; author: string; isbn: string }) => void
  onCreateCollection: (payload: { name: string; description: string }) => void
  onDeleteCollection: (item: LibraryRecord) => void
  onAddFeed?: (url: string) => void
  onSyncFeeds?: () => void
  onSyncFeed?: (feedId: string) => void
  onDeleteFeed?: (feed: LibraryRecord) => void
  onDeleteFeedEntry?: (feedId: string, item: LibraryRecord) => void
  onClearFeedEntries?: (feedId: string) => void
  busyId?: string
  blockedId?: string
  notice?: string
}

function RecordMeta({ children }: { children: preact.ComponentChildren }) {
  return <span class="folio-record-meta">{children}</span>
}

function RowTitle({ item, type = 'source', onInspect }: { item: LibraryRecord; type?: 'source' | 'artifact' | 'book' | 'collection'; onInspect: (selection: LibrarySelection) => void }) {
  const selection = type === 'artifact' ? artifactSelection(item) : type === 'book' ? bookSelection(item) : type === 'collection' ? collectionSelection(item) : sourceSelection(item)
  return <button type="button" class="folio-object-btn" onClick={() => onInspect(selection)}>
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
  const [viewMode, setViewMode] = useState<'gallery' | 'ledger'>(() => {
    if (typeof window === 'undefined') return 'gallery'
    return window.localStorage.getItem('learning-compass.queue-view') === 'ledger' ? 'ledger' : 'gallery'
  })

  const changeView = (next: 'gallery' | 'ledger') => {
    setViewMode(next)
    window.localStorage.setItem('learning-compass.queue-view', next)
  }

  return <div class={`folio-library-view folio-queue-view folio-queue-view-${viewMode}`}>
    <div class="folio-view-intro"><div><p class="folio-kicker">A bounded shelf of commitments</p><h1>Queue</h1><p>Start one source at a time. The shelf stays small enough to remember why each item matters.</p></div><div class="folio-view-intro-actions"><div class="folio-view-toggle" role="group" aria-label="Queue view"><button type="button" class={viewMode === 'gallery' ? 'active' : ''} aria-pressed={viewMode === 'gallery'} onClick={() => changeView('gallery')}>Gallery</button><button type="button" class={viewMode === 'ledger' ? 'active' : ''} aria-pressed={viewMode === 'ledger'} onClick={() => changeView('ledger')}>Ledger</button></div><span class="folio-cap-readout"><strong>{items.length}</strong><small>of {cap} active</small></span></div></div>
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
            {Boolean(item.branch?.label || item.branch_preflight?.branch_label || item.branch_label || (typeof item.branch === 'string' && item.branch)) && <div class="folio-queue-badges" aria-label="Branch context">
              <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(String(item.branch?.id || item.branch_preflight?.branch_id || item.branch_id || item.branch?.label || item.branch_label || item.branch))}`} title="Open branch dossier"><span class="badge-format">Branch</span><span>{item.branch?.label || item.branch_preflight?.branch_label || item.branch_label || (typeof item.branch === 'string' ? item.branch : '')}</span>{(item.branch?.round || item.round_label || (typeof item.round === 'string' ? item.round : '')) && <span class="badge-round">{item.branch?.round || item.round_label || item.round}</span>}</a>
              {item.note ? <a class="folio-badge folio-badge-note" href="#/learn?mode=practice&focus=notes" title="Open field notes">Note taken: {item.note.title}</a> : <span class="folio-badge folio-badge-muted">No note yet</span>}
              {item.recall && (item.recall.count > 0 ? <a class="folio-badge folio-badge-recall" href="#/learn?mode=practice&focus=recall" title="Open recall deck">{item.recall.count} approved {item.recall.count === 1 ? 'card' : 'cards'}{item.recall.due > 0 ? ` · ${item.recall.due} due today` : ''}</a> : <a class="folio-badge folio-badge-recall" href="#/learn?mode=practice&focus=recall" title="Generate recall cards">Generate recall</a>)}
              {item.companions?.html && <a class="folio-badge folio-badge-html" href={`/artifacts/${encodeURIComponent(String(item.companions.html.id))}`} title="Open Arabic reading companion">Read HTML</a>}
              {item.companions?.pdf && <a class="folio-badge folio-badge-pdf" href={`/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`} title="Download A4 companion">PDF</a>}
            </div>}
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

export function FeedsView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [feedUrl, setFeedUrl] = useState('')
  const [selectedFeedId, setSelectedFeedId] = useState<string>('all')
  const [feedEntries, setFeedEntries] = useState<LibraryRecord[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null)
  const [showManageFeeds, setShowManageFeeds] = useState(false)

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
    if (feedUrl.trim() && handlers.onAddFeed) {
      handlers.onAddFeed(feedUrl.trim())
      setFeedUrl('')
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
          <p>Subscribe to RSS/Atom feeds, check for new incoming material, and triage articles directly into Queue or Inbox.</p>
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
                <p>Articles enter Inbox for triage; they never bypass deliberate commitment.</p>
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
              <button
                type="submit"
                class="folio-button folio-button-primary"
                disabled={handlers.busyId === 'add-feed' || !feedUrl.trim()}
              >
                {handlers.busyId === 'add-feed' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>
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
                const isQueued = item.learning_state === 'in_progress' || (item.status === 'active' && item.learning_state !== 'inbox')
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
    {items.length ? <div class="folio-record-list" aria-label="All sources">{items.map((item: LibraryRecord) => <article class="folio-record" key={item.id}><div class="folio-record-main"><RecordMeta>{sourceFormat(item)} · {formatStatus(item.status)} · {formatDate(item.created_at)}</RecordMeta><BranchContextBadges item={item}/><RowTitle item={item} onInspect={handlers.onInspect}/><p class="folio-record-reason">{item.user_review || formatReason(item)}</p>{item.status !== 'active' && <div class="folio-row-actions"><a class="folio-button" href={objectHref('source', String(item.id))}>Dossier</a><button type="button" class="folio-button danger-button" onClick={() => handlers.onDeleteRecommendationPermanently(item)} disabled={handlers.busyId === `permanent-delete:${item.id}`}>{handlers.busyId === `permanent-delete:${item.id}` ? 'Deleting forever…' : 'Delete permanently'}</button></div>}</div></article>)}</div> : <ViewEmpty title="No matching sources" body="Try a shorter title, creator, or rationale."/>}
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
    {shelves.map(([label, items, description]) => <section class="folio-shelf" key={label}><div class="folio-section-heading"><div><h2>{label}</h2><p>{description}</p></div><span>{items.length}</span></div>{items.length ? <div class="folio-record-list">{items.map((book) => { const expandedBook = expanded === book.id; const bookStatus = String(book.learning_state || book.status); return <article class="folio-record folio-book-record" key={book.id}><div class="folio-record-main"><RecordMeta>{sourceCreator(book)} · {formatStatus(bookStatus)}</RecordMeta><RowTitle item={book} type="book" onInspect={handlers.onInspect}/>{book.why_this && <p class="folio-record-reason">{book.why_this}</p>}<div class="folio-row-actions"><button type="button" class="folio-button" onClick={() => setExpanded(expandedBook ? null : String(book.id))}>{expandedBook ? 'Hide chapters' : 'Show chapters'}</button>{String(book.learning_state || '') === 'inbox' && <button type="button" class="folio-button folio-button-primary" onClick={() => handlers.onQueue(book)} disabled={handlers.busyId === book.id}>Queue</button>}{sourceLink(book) && String(book.learning_state || '') === 'in_progress' && <a class="folio-button" href={sourceLink(book)!} target="_blank" rel="noreferrer">Open source</a>}<a class="folio-button" href={objectHref('source', String(book.id))}>Record</a>{bookStatus !== 'active' && <button type="button" class="folio-button danger-button" onClick={() => handlers.onDeleteRecommendationPermanently(book)} disabled={handlers.busyId === `permanent-delete:${book.id}`}>{handlers.busyId === `permanent-delete:${book.id}` ? 'Deleting forever…' : 'Delete permanently'}</button>}</div>{expandedBook && <BookChapters book={book} handlers={handlers}/>}</div></article> })}</div> : <p class="folio-shelf-empty">Nothing on this shelf yet.</p>}</section>)}
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
    <div class="folio-view-intro"><div><p class="folio-kicker">Recovery without clutter</p><h1>Archive</h1><p>Completed sources and explicit exclusions stay findable, with their branch, notes, recall, and companions still linked.</p></div><span class="folio-count-readout"><strong>{archived.length}</strong><small>archived</small></span></div>
    <div class="folio-filter-row" role="group" aria-label="Archive status"><span>Show</span>{(['all', 'consumed', 'rejected'] as const).map((value) => <button type="button" class={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'all' ? 'All' : value === 'consumed' ? 'Completed' : 'Excluded'}</button>)}</div>
    {items.length ? <div class="folio-record-list" aria-label="Archived sources">{items.map((item: LibraryRecord) => <article class="folio-record" key={item.id}><div class="folio-record-main"><RecordMeta>{sourceFormat(item)} · {formatStatus(item.status)} · {formatDate(item.created_at)}</RecordMeta><RowTitle item={item} onInspect={handlers.onInspect}/><BranchContextBadges item={item}/><p class="folio-record-reason">{item.user_review || formatReason(item)}</p><div class="folio-row-actions"><a class="folio-button" href={objectHref('source', String(item.id))}>Dossier</a><button type="button" class="folio-button danger-button" onClick={() => handlers.onDeleteRecommendationPermanently(item)} disabled={handlers.busyId === `permanent-delete:${item.id}`}>{handlers.busyId === `permanent-delete:${item.id}` ? 'Deleting forever…' : 'Delete permanently'}</button></div></div></article>)}</div> : <ViewEmpty title="No archived items" body="Completed and excluded sources will appear here."/>}
  </div>
}

function BranchContextBadges({ item }: { item: LibraryRecord }) {
  const branchLabel = item.branch?.label || item.branch_preflight?.branch_label || item.branch_label || (typeof item.branch === 'string' ? item.branch : '')
  const branchId = item.branch?.id || item.branch_preflight?.branch_id || item.branch_id || branchLabel
  const roundLabel = item.branch?.round || item.round_label || (typeof item.round === 'string' ? item.round : '')
  if (!branchLabel && !item.note && !item.recall?.count && !item.companions?.html && !item.companions?.pdf) return null
  return <div class="folio-queue-badges" aria-label="Branch context">
    {branchLabel && <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(String(branchId))}`} title="Open branch dossier"><span class="badge-format">Branch</span><span>{branchLabel}</span>{roundLabel && <span class="badge-round">{roundLabel}</span>}</a>}
    {item.note ? <a class="folio-badge folio-badge-note" href="#/learn?mode=practice&focus=notes" title="Open field notes">Note taken: {item.note.title}</a> : null}
    {item.recall?.count > 0 ? <a class="folio-badge folio-badge-recall" href="#/learn?mode=practice&focus=recall" title="Open recall deck">{item.recall.count} approved {item.recall.count === 1 ? 'card' : 'cards'}{item.recall.due > 0 ? ` · ${item.recall.due} due today` : ''}</a> : null}
    {item.companions?.html && <a class="folio-badge folio-badge-html" href={`/artifacts/${encodeURIComponent(String(item.companions.html.id))}`} title="Open Arabic reading companion">Read HTML</a>}
    {item.companions?.pdf && <a class="folio-badge folio-badge-pdf" href={`/artifacts/${encodeURIComponent(String(item.companions.pdf.id))}`} title="Download A4 companion">PDF</a>}
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
  const companions = record.companions || {}
  const recall = record.srs?.recall_summary || { count: 0, due: 0 }
  const drafts = (record.srs?.drafts || []).filter((draft: LibraryRecord) => draft.status !== 'approved')
  const branch = item.branch || (item.branch_id ? { id: item.branch_id, label: item.branch_label || item.branch_id, round: item.round, status: item.branch_status } : null)
  const notebookUrl = item.notebook_url
    || item.metadata?.notebook_url
    || artifacts.find((f: LibraryRecord) => f.notebook_url || f.metadata?.notebook_url)?.notebook_url
    || artifacts.find((f: LibraryRecord) => f.metadata?.notebook_url)?.metadata?.notebook_url
    || null
  const userScore = Number(item.user_score ?? item.user_rating ?? 0)
  const outcome = record.outcome
  return <div class="folio-object-sections">
    <section class="folio-object-section"><h2>Source access</h2><div class="folio-row-actions">{sourceLink(item) && <a class="folio-button folio-button-primary" href={sourceLink(item)!} target="_blank" rel="noreferrer">Open original</a>}{notebookUrl && <a class="folio-button" href={notebookUrl} target="_blank" rel="noreferrer">Open NotebookLM</a>}</div><p class="folio-record-note">Opening this source is passive. Start a tracked learning session from Queue.</p></section>
    {branch && <section class="folio-object-section"><div class="folio-section-heading"><h2>Branch</h2><span class="folio-badge folio-badge-branch"><span class="badge-format">Branch</span><span>{branch.label}</span>{branch.round && <span class="badge-round">{branch.round}</span>}</span></div><div class="folio-row-actions"><a class="folio-button" href={`#/map/branch/${encodeURIComponent(String(branch.id))}`}>Open branch dossier</a></div><p class="folio-record-note">{branch.status === 'pruned' ? 'This branch is pruned — review the mapping before starting.' : branch.status && branch.status !== 'unverified' ? `Branch status: ${branch.status.replace(/_/g, ' ')}.` : 'Branch match is not verified yet.'}</p></section>}
    {(companions.html || companions.pdf) && <section class="folio-object-section"><div class="folio-section-heading"><h2>Reading companions</h2><span>{[(companions.html && 'HTML') || null, (companions.pdf && 'PDF') || null].filter(Boolean).join(' + ')}</span></div><div class="folio-row-actions">{companions.html && <a class="folio-button folio-button-primary" href={`/artifacts/${encodeURIComponent(String(companions.html.id))}`} target="_blank" rel="noreferrer">Read HTML companion</a>}{companions.pdf && <a class="folio-button" href={`/artifacts/${encodeURIComponent(String(companions.pdf.id))}`} target="_blank" rel="noreferrer">Download A4 PDF{companions.pdf.size_bytes ? ` · ${formatBytes(companions.pdf.size_bytes)}` : ''}</a>}</div><p class="folio-record-note">Canonical Arabic reading companion rendered from one verified body.</p></section>}
    <section class="folio-object-section"><div class="folio-section-heading"><h2>Active recall</h2><span>{recall.count} approved{recall.due > 0 ? ` · ${recall.due} due` : ''}</span></div>{(record.srs?.cards || []).length ? <ul class="folio-recall-list">{(record.srs.cards || []).map((card: LibraryRecord) => <li key={card.id}><strong>{card.question}</strong><span>Topic: {card.topic || 'General'} · Due {formatDate(card.due_at)} · {card.repetitions} reps</span></li>)}</ul> : <p class="folio-record-note">No approved recall cards yet.</p>}{drafts.length > 0 && <div class="folio-draft-strip"><span>{drafts.length} pending {drafts.length === 1 ? 'draft' : 'drafts'}</span><a class="folio-button" href="#/learn?mode=practice&focus=recall">Review drafts</a></div>}{recall.count === 0 && drafts.length === 0 && <div class="folio-row-actions"><a class="folio-button" href="#/learn?mode=practice&focus=notes">Take a note first</a></div>}</section>
    <section class="folio-object-section"><div class="folio-section-heading"><h2>Feedback & evidence</h2>{userScore > 0 && <span class="folio-score">{userScore}/10</span>}</div>{item.user_review && <div class="folio-bilingual-block" dir="auto"><p>{item.user_review}</p></div>}{!item.user_review && !item.user_score && <p class="folio-record-note">No rating or review recorded yet.</p>}{outcome?.outcome_status && <dl class="folio-property-list"><div><dt>Outcome</dt><dd>{formatStatus(outcome.outcome_status)}</dd></div>{outcome.actual_score != null && <div><dt>Actual score</dt><dd>{outcome.actual_score}/10</dd></div>}{outcome.consumed_at && <div><dt>Consumed</dt><dd>{formatDate(outcome.consumed_at)}</dd></div>}</dl>}</section>
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
