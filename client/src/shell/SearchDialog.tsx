import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useData } from '../app/useData'
import { Icon } from '../components/Icon'
import { itemHref } from '../app/router'
import { clearRecentSearchItems, readRecentSearchItems, rememberSearchItem } from './recentSearchItems'

const groupMeta: Record<string, { label: string; href: (item: any) => string }> = {
  recs: { label: 'Sources', href: (item) => itemHref(item) },
  annotations: {
    label: 'Source anchors',
    href: (item) =>
      `#/library/source/${encodeURIComponent(item.recommendation_id)}?annotation=${encodeURIComponent(item.id)}`,
  },
  threads: { label: 'Threads', href: (item) => `#/learn/thread/${encodeURIComponent(item.id)}` },
  notes: { label: 'Notes', href: (item) => `#/learn/note/${encodeURIComponent(item.id)}` },
  artifacts: { label: 'Files', href: (item) => `#/library/artifact/${encodeURIComponent(item.id)}` },
  nodes: { label: 'Map', href: (item) => `#/map/node/${encodeURIComponent(item.id)}` },
  units: { label: 'Learning units', href: (item) => `#/learn/unit/${encodeURIComponent(item.id)}` },
  assertions: { label: 'Profile', href: () => '#/settings?focus=profile' },
  memories: { label: 'Hermes memory', href: () => '#/settings?focus=profile' },
}

function resultTitle(item: any) {
  if (item.quote) return item.quote.length > 180 ? `${item.quote.slice(0, 177)}…` : item.quote
  return item.title || item.label || item.filename || item.statement || item.memory_key || item.assertion_key || item.id
}

function resultMeta(groupKey: string, item: any) {
  if (groupKey === 'annotations') {
    const locator = item.selector?.locator || item.selector?.url || item.locator_type || 'exact passage'
    return [item.source_title || 'Source', locator].filter(Boolean).join(' · ')
  }
  return item.creator || item.kind || item.type || item.content_type || 'Learning object'
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [recentItems, setRecentItems] = useState(readRecentSearchItems)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
      setSelectedIndex(-1)
    }
  }, [open])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setSelectedIndex(-1)
    }, 180)
    return () => clearTimeout(timer)
  }, [query])

  const endpoint = open && debouncedQuery.length >= 2 ? `/search?q=${encodeURIComponent(debouncedQuery)}` : undefined
  const state = useData<any>(endpoint)

  useLayoutEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), button:not([disabled])')?.focus()
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [open, onClose])

  const groups = useMemo(
    () =>
      Object.entries(state.data?.groups || {}).filter(
        ([key, items]) => groupMeta[key] && Array.isArray(items) && items.length,
      ) as Array<[string, any[]]>,
    [state.data],
  )

  const flatResults = useMemo(() => {
    const list: Array<{ groupKey: string; item: any; href: string }> = []
    for (const [key, items] of groups) {
      for (const item of items) {
        list.push({ groupKey: key, item, href: groupMeta[key].href(item) })
      }
    }
    return list
  }, [groups])

  const showingRecent = query.trim().length < 2
  const choices = showingRecent
    ? recentItems
    : flatResults.map(({ groupKey, item, href }) => ({
        href,
        title: String(resultTitle(item)).slice(0, 300),
        meta: String(resultMeta(groupKey, item)).slice(0, 200),
      }))
  const remember = (item: { href: string; title: string; meta: string }) =>
    setRecentItems(rememberSearchItem(item, recentItems))

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'ArrowDown') {
      if (!choices.length) return
      event.preventDefault()
      setSelectedIndex((prev) => (prev + 1 >= choices.length ? 0 : prev + 1))
      return
    }

    if (event.key === 'ArrowUp') {
      if (!choices.length) return
      event.preventDefault()
      setSelectedIndex((prev) => (prev - 1 < 0 ? choices.length - 1 : prev - 1))
      return
    }

    if (event.key === 'Enter' && selectedIndex >= 0 && choices[selectedIndex]) {
      event.preventDefault()
      const target = choices[selectedIndex]
      remember(target)
      window.location.hash = target.href.replace(/^#/, '')
      onClose()
      return
    }

    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
      ),
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  let currentIndexTracker = 0

  return (
    <div
      class="dialog-layer search-layer"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        class="dialog search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
        onKeyDown={onKeyDown}
      >
        <h2 id="search-dialog-title" class="visually-hidden">
          Search everything
        </h2>
        <header class="search-input">
          <Icon name="search" />
          <label class="visually-hidden" for="search-query">
            Search sources, notes, Threads, files, and map
          </label>
          <input
            id="search-query"
            autoFocus
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            placeholder="Search sources, notes, Threads, files, and map…"
          />
          <kbd>Esc</kbd>
        </header>
        <div class="search-results">
          {showingRecent && (
            <div class="search-hint">
              <strong>Find something you saved or learned.</strong>
              <span>Type a title, creator, or phrase. Use at least two characters.</span>
            </div>
          )}
          {showingRecent && recentItems.length > 0 && (
            <section aria-label="Recently opened from search">
              <div class="search-recent-heading">
                <h3>Recently opened</h3>
                <button
                  type="button"
                  class="button quiet"
                  onClick={() => {
                    clearRecentSearchItems()
                    setRecentItems([])
                    setSelectedIndex(-1)
                  }}
                >
                  Clear recent items
                </button>
              </div>
              {recentItems.map((item, index) => (
                <a
                  key={item.href}
                  href={item.href}
                  class={selectedIndex === index ? 'search-item-selected' : ''}
                  onClick={() => {
                    remember(item)
                    onClose()
                  }}
                >
                  <span>
                    <strong dir="auto">{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <Icon name="chevron" size={16} />
                </a>
              ))}
            </section>
          )}
          {state.loading && <div class="search-hint">Searching…</div>}
          {state.error && <div class="search-hint error">{state.error}</div>}
          {!state.loading && debouncedQuery.length >= 2 && !groups.length && (
            <div class="search-hint">
              <strong>No exact match.</strong>
              <span>Try a title, creator, topic, or phrase from a note.</span>
            </div>
          )}
          {!showingRecent &&
            groups.map(([key, items]) => (
              <section key={key}>
                <h3>{groupMeta[key].label}</h3>
                {items.map((item) => {
                  const itemIndex = currentIndexTracker++
                  const isSelected = itemIndex === selectedIndex
                  return (
                    <a
                      key={item.id || itemIndex}
                      href={groupMeta[key].href(item)}
                      class={isSelected ? 'search-item-selected' : ''}
                      onClick={() => {
                        remember(choices[itemIndex])
                        onClose()
                      }}
                    >
                      <span>
                        <strong>{resultTitle(item)}</strong>
                        <small>{resultMeta(key, item)}</small>
                      </span>
                      <Icon name="chevron" size={16} />
                    </a>
                  )
                })}
              </section>
            ))}
        </div>
      </section>
    </div>
  )
}
