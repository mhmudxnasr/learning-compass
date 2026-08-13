import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useData } from '../app/useData'
import { Icon } from '../components/Icon'

const groupMeta: Record<string, { label: string; href: (item: any) => string }> = {
  recs: { label: 'Sources', href: (item) => `#/library/source/${encodeURIComponent(item.id)}` },
  threads: { label: 'Paths', href: (item) => `#/learn/thread/${encodeURIComponent(item.id)}` },
  notes: { label: 'Notes', href: (item) => `#/learn/note/${encodeURIComponent(item.id)}` },
  artifacts: { label: 'Files', href: (item) => `#/library/artifact/${encodeURIComponent(item.id)}` },
  nodes: { label: 'Map', href: (item) => `#/map/node/${encodeURIComponent(item.id)}` },
  units: { label: 'Learning units', href: (item) => `#/learn/unit/${encodeURIComponent(item.id)}` },
  assertions: { label: 'Profile', href: () => '#/settings/profile' },
  memories: { label: 'Hermes memory', href: () => '#/settings/profile' },
}

function resultTitle(item: any) { return item.title || item.label || item.filename || item.statement || item.memory_key || item.assertion_key || item.id }

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const endpoint = open && query.trim().length >= 2 ? `/search?q=${encodeURIComponent(query.trim())}` : undefined
  const state = useData<any>(endpoint)
  useEffect(() => { if (!open) setQuery('') }, [open])
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('[autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')?.focus(), 0)
    return () => {
      window.clearTimeout(focusTimer)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open])
  const groups = useMemo(() => Object.entries(state.data?.groups || {}).filter(([key, items]) => groupMeta[key] && Array.isArray(items) && items.length) as Array<[string, any[]]>, [state.data])
  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  if (!open) return null
  return <div class="dialog-layer search-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} class="dialog search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title" onKeyDown={trapFocus}>
      <h2 id="search-dialog-title" class="visually-hidden">Search everything</h2>
      <header class="search-input"><Icon name="search"/><label class="visually-hidden" for="search-query">Search sources, notes, paths, files, and map</label><input id="search-query" autoFocus value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search sources, notes, paths, files, and map…"/><kbd>Esc</kbd></header>
      <div class="search-results">
        {query.trim().length < 2 && <div class="search-hint"><strong>Search the whole evidence system.</strong><span>Type at least two characters. Results open exact object routes.</span></div>}
        {state.loading && <div class="search-hint">Searching…</div>}
        {state.error && <div class="search-hint error">{state.error}</div>}
        {!state.loading && query.trim().length >= 2 && !groups.length && <div class="search-hint"><strong>No exact match.</strong><span>Try a title, creator, topic, or phrase from a note.</span></div>}
        {groups.map(([key, items]) => <section><h3>{groupMeta[key].label}</h3>{items.map((item) => <a href={groupMeta[key].href(item)} onClick={onClose}><span><strong>{resultTitle(item)}</strong><small>{item.creator || item.kind || item.type || item.content_type || 'Learning object'}</small></span><Icon name="chevron" size={16}/></a>)}</section>)}
      </div>
    </section>
  </div>
}
