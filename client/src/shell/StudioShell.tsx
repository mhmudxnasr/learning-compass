import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Icon, type IconName } from '../components/Icon'
import { type RootKey, type Route, roots, routeHref } from '../app/router'

const rootIcons: Record<RootKey, IconName> = { home: 'home', library: 'library', learn: 'learn', map: 'map', settings: 'settings' }

/**
 * The app shell owns only the five durable destinations. Modes belong to the
 * active workspace and are announced in the command location; they do not
 * create another layer of global navigation or another page path.
 */
export function StudioShell({ route, children, inspector, onInspectorClose }: {
  route: Route
  children: ComponentChildren
  inspector?: ComponentChildren
  onInspectorClose?: () => void
}) {
  const inspectorRef = useRef<HTMLElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!inspector) {
      document.body.style.overflow = ''
      lastFocus.current?.focus()
      lastFocus.current = null
      return
    }
    lastFocus.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    inspectorRef.current?.focus()
    return () => { document.body.style.overflow = '' }
  }, [Boolean(inspector)])

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onInspectorClose?.()
      return
    }
    if (event.key !== 'Tab' || !inspectorRef.current) return
    const focusable = Array.from(inspectorRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return <div class={`studio-shell ${inspector ? 'has-inspector' : ''}`} data-root={route.root} data-mode={route.mode}>
    <a class="skip-link" href="#workspace-canvas">Skip to workspace</a>

    <aside class="root-rail" aria-label="Main navigation">
      <nav aria-label="Five workspaces">
        {roots.map((item) => <a key={item.key} href={routeHref(item.key)} class={route.root === item.key ? 'active' : ''} aria-current={route.root === item.key ? 'page' : undefined} title={item.label} aria-label={item.label}>
          <Icon name={rootIcons[item.key]} size={20}/>
        </a>)}
      </nav>
    </aside>

    <section class="work-area">
      {route.recoveredFrom && !route.notFound && <div class="route-notice" role="status">Old link restored to this workspace: <code>{route.recoveredFrom}</code></div>}
      {route.notFound && <div class="route-notice route-warning" role="alert">That destination no longer exists. You are in the nearest real workspace instead: <code>{route.recoveredFrom}</code></div>}
      <main id="workspace-canvas" class="workspace-canvas" tabIndex={-1}>{children}</main>
    </section>

    {inspector && <><button class="inspector-backdrop" type="button" aria-label="Close inspector" onClick={onInspectorClose}/><aside ref={inspectorRef} class="object-inspector" aria-label="Object inspector" tabIndex={-1} onKeyDown={trapFocus}>{inspector}</aside></>}

    <nav class="mobile-dock" aria-label="Main navigation">
      {roots.map((item) => <a key={item.key} href={routeHref(item.key)} class={route.root === item.key ? 'active' : ''} aria-current={route.root === item.key ? 'page' : undefined}>
        <Icon name={rootIcons[item.key]}/><span>{item.label}</span>
      </a>)}
    </nav>
  </div>
}
