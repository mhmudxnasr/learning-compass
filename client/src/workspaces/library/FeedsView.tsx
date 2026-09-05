import { useEffect, useRef, useState } from 'preact/hooks'
import { api, formatDate } from '../../api'
import { Icon } from '../../components/Icon'
import { FeedManagement } from './FeedManagement'
import { objectHref, sourceLink, sourceTitle, type LibraryRecord, type LibraryViewHandlers } from './types'

const entryKey = (item: LibraryRecord) => `${item.feed_id}:${item.id}`
const positionKey = 'compass-feed-position'
function readPosition() {
  try {
    return JSON.parse(sessionStorage.getItem(positionKey) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}
function sourceExcerpt(item: LibraryRecord) {
  const doc = new DOMParser().parseFromString(
    String(item.context_brief || item.why_this || item.description || ''),
    'text/html',
  )
  doc.querySelectorAll('script, style').forEach((element) => element.remove())
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}
function articleUrl(item: LibraryRecord) {
  try {
    const url = new URL(sourceLink(item) || '')
    return /^https?:$/.test(url.protocol) ? url : null
  } catch {
    return null
  }
}

export function FeedsView({ data, handlers }: { data: LibraryRecord; handlers: LibraryViewHandlers }) {
  const [positions, setPositions] = useState(readPosition)
  const [selectedFeed, setSelectedFeed] = useState(() => readPosition().publication || 'all')
  const [items, setItems] = useState<LibraryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [manage, setManage] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [notice, setNotice] = useState('')
  const [skipError, setSkipError] = useState('')
  const pendingSkip = useRef(false)
  const sourceAnchor = useRef<HTMLAnchorElement>(null)
  const articleBody = useRef<HTMLElement>(null)
  const feeds: LibraryRecord[] = Array.isArray(data.feeds) ? data.feeds : []
  const feedId = selectedFeed === 'all' || feeds.some((feed) => String(feed.id) === selectedFeed) ? selectedFeed : 'all'
  const visible = items.filter((item) =>
    `${sourceTitle(item)} ${item.feed_title || ''}`.toLowerCase().includes(query.toLowerCase().trim()),
  )
  const index = Math.max(
    0,
    visible.findIndex((item) => entryKey(item) === positions[feedId]),
  )
  const item = visible[index]
  const url = item ? articleUrl(item) : null

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    const load = async () => {
      const collected: LibraryRecord[] = []
      let total = 1
      while (collected.length < total) {
        const result = await api<{ items: LibraryRecord[]; total: number }>(
          `/capture/feeds/${encodeURIComponent(feedId)}/entries?limit=200&offset=${collected.length}`,
          { signal: controller.signal },
        )
        collected.push(...result.items)
        total = result.total
        if (!result.items.length) break
      }
      if (!controller.signal.aborted) setItems(collected)
    }
    load()
      .catch(() => {
        if (!controller.signal.aborted) setLoadError('Articles could not be loaded. Try again.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [feedId, retry, data.feeds])

  const selectArticle = (key: string) => {
    setPositions((previous) => {
      const next = { ...previous, [feedId]: key, publication: feedId }
      try {
        sessionStorage.setItem(positionKey, JSON.stringify(next))
      } catch {
        /* Browsing still works without storage. */
      }
      return next
    })
    requestAnimationFrame(() => articleBody.current?.scrollIntoView({ block: 'nearest' }))
  }
  const previous = () => {
    if (index > 0) selectArticle(entryKey(visible[index - 1]))
  }
  const skip = async () => {
    if (!item || pendingSkip.current) return
    pendingSkip.current = true
    setSkipping(true)
    setSkipError('')
    setNotice('')
    const removed = item
    const oldItems = items
    const oldPosition = entryKey(item)
    const following = visible[index + 1] || visible[index - 1]
    setItems((current) => current.filter((entry) => entryKey(entry) !== oldPosition))
    selectArticle(following ? entryKey(following) : '')
    try {
      await api(
        `/capture/feeds/${encodeURIComponent(String(removed.feed_id))}/entries/${encodeURIComponent(String(removed.id))}/dismiss`,
        {
          method: 'POST',
          body: '{}',
          queueOnNetworkError: false,
        },
      )
      setNotice('Skipped. Removed from this feed; saved source preserved.')
    } catch {
      setItems(oldItems)
      selectArticle(oldPosition)
      setSkipError('Could not skip this article. It has been restored. Try again.')
    } finally {
      pendingSkip.current = false
      setSkipping(false)
    }
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]',
        )
      )
        return
      if (event.key === 'j' && item && !loading && !loadError) {
        event.preventDefault()
        void skip()
      } else if (event.key === 'k') {
        event.preventDefault()
        previous()
      } else if (event.key === 'o') {
        event.preventDefault()
        sourceAnchor.current?.click()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  })

  return (
    <div class="folio-library-view folio-feeds-view feed-triage ft-split">
      <header class="ft-toolbar">
        <h1>Feeds</h1>
        <select
          aria-label="Choose publication"
          value={feedId}
          disabled={skipping}
          onChange={(event) => {
            setSelectedFeed(event.currentTarget.value)
            setQuery('')
            setNotice('')
            setSkipError('')
          }}
        >
          <option value="all">All publications</option>
          {feeds.map((feed) => (
            <option key={feed.id} value={feed.id}>
              {feed.title || feed.feed_url}
            </option>
          ))}
        </select>
        <div class="ft-toolbar-actions">
          <button
            type="button"
            aria-label="Search articles"
            aria-expanded={showSearch}
            onClick={() => setShowSearch(!showSearch)}
          >
            <Icon name="search" size={18} />
          </button>
          <button
            type="button"
            class="ft-manage-button"
            aria-label="Manage feeds"
            aria-expanded={manage}
            onClick={() => setManage(!manage)}
          >
            <Icon name="settings" size={16} />
            <span>Manage</span>
          </button>
        </div>
      </header>
      {showSearch && (
        <div class="ft-search">
          <input
            autoFocus
            aria-label="Search feed titles"
            placeholder="Find an article or publication…"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setShowSearch(false)
            }}
          >
            Close
          </button>
        </div>
      )}
      {manage && <FeedManagement feeds={feeds} handlers={handlers} />}
      {loadError ? (
        <div class="ft-empty" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <div class="ft-empty" role="status">
          <Icon name="sync" size={24} />
          <h2>Loading articles…</h2>
        </div>
      ) : !item ? (
        <div class="ft-empty">
          <Icon name="check" size={32} />
          <h2>{query ? 'No matching articles.' : 'You’re all caught up.'}</h2>
          <p>
            {query
              ? 'Try another title or publication.'
              : 'Check your feeds for something new, or choose another publication.'}
          </p>
          {query ? (
            <button type="button" onClick={() => setQuery('')}>
              Clear search
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handlers.onSyncFeeds?.()}
              disabled={Boolean(handlers.busyId) || skipping}
            >
              Check feeds
            </button>
          )}
        </div>
      ) : (
        <div class="ft-body">
          <div class="ft-reading-column">
            <article class="ft-article" ref={articleBody} key={entryKey(item)} aria-labelledby="feed-article-title">
              <div class="ft-article-meta">
                <span>{item.feed_title || item.creator || 'Feed'}</span>
                <time>{formatDate(item.published_at || item.created_at)}</time>
                <span class="ft-position">
                  {index + 1} / {visible.length}
                </span>
              </div>
              <h2 id="feed-article-title" dir="auto">
                {sourceTitle(item)}
              </h2>
              <div class="ft-branch-row">
                {item.branch_label && (
                  <a class="ft-branch" href={`#/map/branch/${encodeURIComponent(String(item.branch_id))}`}>
                    <Icon name="branch" size={14} />
                    {item.branch_label}
                  </a>
                )}
                <span>
                  {item.content_type || 'Article'}
                  {item.estimated_minutes ? ` · ${item.estimated_minutes} min` : ''}
                </span>
              </div>
              <div class="ft-excerpt">
                <span class="ft-excerpt-label">From the publication</span>
                <p dir="auto">
                  {sourceExcerpt(item) || 'This publication did not include a preview. Open the article to read it.'}
                </p>
              </div>
              <div class="ft-source-line">
                {url && <span>{url.hostname.replace(/^www\./, '')}</span>}
                <a href={objectHref('source', String(item.id))}>
                  View saved record <Icon name="chevron" size={12} />
                </a>
              </div>
              <footer class="ft-actions">
                <button
                  type="button"
                  class="ft-back"
                  onClick={previous}
                  disabled={index === 0}
                  aria-label="Previous article"
                >
                  <Icon name="back" size={18} />
                </button>
                <button
                  type="button"
                  class="ft-skip"
                  onClick={() => void skip()}
                  disabled={skipping}
                  title="Remove from this feed and show the next article"
                >
                  {skipping ? 'Skipping…' : 'Skip'}
                  <Icon name="chevron" size={17} />
                </button>
                {url && (
                  <a ref={sourceAnchor} class="ft-open" href={url.href} target="_blank" rel="noreferrer">
                    Open article <Icon name="external" size={17} />
                  </a>
                )}
                {['queued', 'in_progress'].includes(String(item.learning_state)) ? (
                  <a class="ft-queue" href="#/library?mode=triage&focus=queue">
                    In Queue
                  </a>
                ) : (
                  <button
                    type="button"
                    class="ft-queue"
                    aria-label="Queue article"
                    onClick={() => handlers.onQueue(item)}
                    disabled={Boolean(handlers.busyId)}
                  >
                    <Icon name="queue" size={16} />
                    <span>Queue</span>
                  </button>
                )}
              </footer>
            </article>
            <div class="ft-hints">
              <span>Skip removes the article from this feed.</span>
              <span>
                <kbd>J</kbd> skip <kbd>K</kbd> back <kbd>O</kbd> open
              </span>
            </div>
            {handlers.blockedId === item.id && (
              <div class="folio-queue-override" role="alert">
                <strong>Queue cap reached.</strong>
                <span>Adding this source is an explicit overflow choice.</span>
                <button type="button" class="folio-button" onClick={() => handlers.onQueue(item, true)}>
                  Add anyway
                </button>
              </div>
            )}
          </div>
          <nav class="ft-rail" aria-label="Article navigator">
            <div class="ft-nav-label">
              In this feed <span>{visible.length} articles</span>
            </div>
            {visible.map((entry, position) => (
              <button
                type="button"
                key={entryKey(entry)}
                class="ft-story-link"
                aria-current={entryKey(entry) === entryKey(item) ? 'true' : undefined}
                onClick={() => selectArticle(entryKey(entry))}
              >
                <span class="ft-story-number">{String(position + 1).padStart(2, '0')}</span>
                <span>
                  <small>{entry.feed_title || 'Feed'}</small>
                  <strong dir="auto">{sourceTitle(entry)}</strong>
                </span>
              </button>
            ))}
          </nav>
        </div>
      )}
      {skipError && (
        <p class="ft-error" role="alert">
          {skipError}
        </p>
      )}
      {(notice || handlers.notice) && (
        <p class="ft-notice" role="status">
          {notice || handlers.notice}
        </p>
      )}
    </div>
  )
}
