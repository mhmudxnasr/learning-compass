import type { ComponentChildren } from 'preact'
import { Icon, type IconName } from '../components/Icon'
import { modeLabel, type RootKey, type Route, roots, routeHref } from '../app/router'

const rootIcons: Record<RootKey, IconName> = { home: 'home', library: 'library', learn: 'learn', map: 'map', settings: 'settings' }

/**
 * The app shell owns only the five durable destinations. Modes belong to the
 * active workspace and are announced in the command location; they do not
 * create another layer of global navigation or another page path.
 */
export function StudioShell({ route, children, inspector, onCapture, onSearch }: {
  route: Route
  children: ComponentChildren
  inspector?: ComponentChildren
  onCapture: () => void
  onSearch: () => void
}) {
  const rootMeta = roots.find((item) => item.key === route.root)!
  const currentMode = modeLabel(route)
  const online = typeof navigator === 'undefined' || navigator.onLine

  return <div class={`studio-shell ${inspector ? 'has-inspector' : ''}`} data-root={route.root} data-mode={route.mode}>
    <a class="skip-link" href="#workspace-canvas">Skip to workspace</a>

    <aside class="root-rail" aria-label="Main navigation">
      <a class="studio-mark" href={routeHref('home')} aria-label="Learning Compass Home"><span>L</span><i/></a>
      <nav aria-label="Five workspaces">
        {roots.map((item) => <a key={item.key} href={routeHref(item.key)} class={route.root === item.key ? 'active' : ''} aria-current={route.root === item.key ? 'page' : undefined} title={item.label}>
          <Icon name={rootIcons[item.key]}/><span>{item.label}</span>
        </a>)}
      </nav>
      <div class="rail-bottom">
        <button type="button" onClick={onSearch} aria-label="Search everything" title="Search everything"><Icon name="search"/><span>Search</span></button>
        <button type="button" class="rail-capture" onClick={onCapture} aria-label="Capture a source" title="Capture a source"><Icon name="capture"/><span>Capture</span></button>
        <span class="sync-pip" title={online ? 'Synced' : 'Offline'} aria-label={online ? 'Synced' : 'Offline'}><i class={online ? 'online' : 'offline'}/></span>
      </div>
    </aside>

    <section class="work-area">
      <header class="command-bar">
        <div class="command-location" aria-label={`${rootMeta.label}, ${currentMode}`}>
          <span class="command-root">{rootMeta.label}</span>
          <Icon name="chevron" size={14}/>
          <strong class="command-mode">{currentMode}</strong>
          {route.objectType && <><Icon name="chevron" size={14}/><span class="command-object">{route.objectType}</span></>}
        </div>
        <button type="button" class="command-search" onClick={onSearch}><Icon name="search" size={17}/><span>Search or jump to…</span><kbd>⌘ K</kbd></button>
        <button type="button" class="button primary capture-button" onClick={onCapture}><Icon name="capture" size={17}/>Capture</button>
      </header>
      {route.recoveredFrom && !route.notFound && <div class="route-notice" role="status">Old link restored to this workspace: <code>{route.recoveredFrom}</code></div>}
      {route.notFound && <div class="route-notice route-warning" role="alert">That destination no longer exists. You are in the nearest real workspace instead: <code>{route.recoveredFrom}</code></div>}
      <main id="workspace-canvas" class="workspace-canvas" tabIndex={-1}>{children}</main>
    </section>

    {inspector && <aside class="object-inspector" aria-label="Object inspector">{inspector}</aside>}

    <nav class="mobile-dock" aria-label="Main navigation">
      {roots.map((item) => <a key={item.key} href={routeHref(item.key)} class={route.root === item.key ? 'active' : ''} aria-current={route.root === item.key ? 'page' : undefined}>
        <Icon name={rootIcons[item.key]}/><span>{item.label}</span>
      </a>)}
    </nav>
  </div>
}
