import { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon, IconName } from '../components/Icon'
import { RootKey, Route, roots, routeHref, views } from '../app/router'

const rootIcons: Record<RootKey, IconName> = { home: 'home', library: 'library', learn: 'learn', map: 'map', settings: 'settings' }
const viewIcons: Record<string, IconName> = {
  today: 'home', queue: 'queue', inbox: 'inbox', all: 'source', files: 'file', books: 'book', collections: 'collection', archive: 'archive',
  paths: 'path', notes: 'note', recall: 'recall', atlas: 'map', branches: 'branch', balance: 'balance', profile: 'settings', preferences: 'edit', data: 'sync', system: 'source',
}

export function StudioShell({ route, children, inspector, onCapture, onSearch, mobileContextOpen, setMobileContextOpen }: {
  route: Route
  children: ComponentChildren
  inspector?: ComponentChildren
  onCapture: () => void
  onSearch: () => void
  mobileContextOpen: boolean
  setMobileContextOpen: (open: boolean) => void
}) {
  const rootMeta = roots.find((item) => item.key === route.root)!
  const viewMeta = views[route.root].find((item) => item.key === route.view) || views[route.root][0]
  const contextPaneRef = useRef<HTMLElement>(null)
  const closeContextButtonRef = useRef<HTMLButtonElement>(null)
  const [mobileContextMode, setMobileContextMode] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 940px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 940px)')
    const update = () => setMobileContextMode(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    const pane = contextPaneRef.current
    if (!pane) return
    if (mobileContextMode && !mobileContextOpen) pane.setAttribute('inert', '')
    else pane.removeAttribute('inert')
  }, [mobileContextMode, mobileContextOpen])

  useEffect(() => {
    if (!mobileContextOpen) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => closeContextButtonRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(focusTimer)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [mobileContextOpen])

  return <div class={`studio-shell ${inspector ? 'has-inspector' : ''}`} data-root={route.root}>
    <a class="skip-link" href="#workspace-canvas">Skip to workspace</a>
    <aside class="root-rail" aria-label="Main navigation">
      <a class="studio-mark" href="#/home" aria-label="Learning Compass Home"><span>L</span><i/></a>
      <nav>
        {roots.filter((item) => item.key !== 'settings').map((item) => <a href={routeHref(item.key)} class={route.root === item.key ? 'active' : ''} aria-current={route.root === item.key ? 'page' : undefined} title={item.label}><Icon name={rootIcons[item.key]}/><span>{item.label}</span></a>)}
      </nav>
      <div class="rail-bottom">
        <button onClick={onSearch} aria-label="Search everything" title="Search everything"><Icon name="search"/><span>Search</span></button>
        <a href={routeHref('settings')} class={route.root === 'settings' ? 'active' : ''} aria-current={route.root === 'settings' ? 'page' : undefined} title="Settings"><Icon name="settings"/><span>Settings</span></a>
        <span class="sync-pip" title={navigator.onLine ? 'Synced' : 'Offline'}><i class={navigator.onLine ? 'online' : 'offline'}/></span>
      </div>
    </aside>

    <aside ref={contextPaneRef} class={`context-pane ${mobileContextOpen ? 'mobile-open' : ''}`} aria-label={`${rootMeta.label} views`} aria-hidden={mobileContextMode && !mobileContextOpen ? true : undefined}>
      <header class="context-head">
        <div><span>Learning Compass</span><strong class="context-title">{rootMeta.label}</strong></div>
        <button ref={closeContextButtonRef} class="icon-button mobile-only" tabIndex={mobileContextMode ? (mobileContextOpen ? 0 : -1) : undefined} onClick={() => setMobileContextOpen(false)} aria-label="Close navigation"><Icon name="close"/></button>
      </header>
      <nav class="view-list">
        {views[route.root].map((item) => <a href={routeHref(route.root, item.key)} class={route.view === item.key && !route.objectId ? 'active' : ''} aria-current={route.view === item.key && !route.objectId ? 'page' : undefined} tabIndex={mobileContextMode ? (mobileContextOpen ? 0 : -1) : undefined} onClick={() => setMobileContextOpen(false)}><Icon name={viewIcons[item.key] || 'source'}/><span><strong>{item.label}</strong><small>{item.description}</small></span></a>)}
      </nav>
      <footer class="context-foot"><span>Private workspace</span><small>D1 is canonical · R2 holds files</small></footer>
    </aside>

    <section class="work-area">
      <header class="command-bar">
        <div class="command-location">
          <button class="icon-button mobile-menu" onClick={() => setMobileContextOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button>
          <span>{rootMeta.label}</span><Icon name="chevron" size={14}/><strong>{route.objectId ? route.objectType : viewMeta.label}</strong>
        </div>
        <button class="command-search" onClick={onSearch}><Icon name="search" size={17}/><span>Search or jump to…</span><kbd>⌘ K</kbd></button>
        <button class="button primary capture-button" onClick={onCapture}><Icon name="capture" size={17}/>Capture</button>
      </header>
      {route.recoveredFrom && !route.notFound && <div class="route-notice" role="status">Old link restored to this workspace: <code>{route.recoveredFrom}</code></div>}
      {route.notFound && <div class="route-notice route-warning" role="alert">That destination no longer exists. You are in the nearest real workspace instead: <code>{route.recoveredFrom}</code></div>}
      <main id="workspace-canvas" class="workspace-canvas" tabindex={-1}>{children}</main>
    </section>

    {inspector && <aside class="object-inspector" aria-label="Object inspector">{inspector}</aside>}

    <nav class="mobile-dock" aria-label="Main navigation">
      {roots.map((item) => <a href={routeHref(item.key)} class={route.root === item.key ? 'active' : ''}><Icon name={rootIcons[item.key]}/><span>{item.label}</span></a>)}
    </nav>
    {mobileContextOpen && <button class="context-scrim" aria-label="Close navigation" onClick={() => setMobileContextOpen(false)}/>}
  </div>
}
