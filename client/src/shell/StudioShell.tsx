import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { BrandMark, Icon, type IconName } from '../components/Icon'
import { modes, type RootKey, type Route, roots, routeHref } from '../app/router'

const rootIcons: Record<RootKey, IconName> = {
  home: 'home',
  library: 'library',
  learn: 'learn',
  map: 'map',
  settings: 'settings',
}

/**
 * The app shell owns only the five durable destinations. Modes belong to the
 * active workspace and are announced in the command location; they do not
 * create another layer of global navigation or another page path.
 */
export function StudioShell({
  route,
  children,
  inspector,
  onInspectorClose,
  onCapture,
  onSearch,
  online,
}: {
  route: Route
  children: ComponentChildren
  inspector?: ComponentChildren
  onInspectorClose?: () => void
  onCapture: () => void
  onSearch: () => void
  online: boolean
}) {
  const inspectorRef = useRef<HTMLElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const activeRoot = roots.find((item) => item.key === route.root)
  const activeMode = modes[route.root].find((item) => item.key === route.mode)
  const activeFocus = activeMode?.focuses?.find((item) => item.key === route.focus)
  const hasInspector = Boolean(inspector)

  useEffect(() => {
    if (!hasInspector) {
      document.body.style.overflow = ''
      lastFocus.current?.focus()
      lastFocus.current = null
      return
    }
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 940
    if (isMobile) {
      document.body.style.overflow = 'hidden'
    }
    lastFocus.current = document.activeElement as HTMLElement | null
    inspectorRef.current?.focus()
    return () => {
      document.body.style.overflow = ''
    }
  }, [hasInspector])

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onInspectorClose?.()
      return
    }
    if (event.key !== 'Tab' || !inspectorRef.current) return
    const focusable = Array.from(
      inspectorRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  return (
    <div class={`studio-shell ${inspector ? 'has-inspector' : ''}`} data-root={route.root} data-mode={route.mode}>
      <a class="skip-link" href="#workspace-canvas">
        Skip to workspace
      </a>

      <aside class="root-rail" aria-label="Main navigation">
        <nav aria-label="Five workspaces">
          <div class="rail-brand" aria-label="Learning Compass">
            <BrandMark size={28} />
            <strong>Compass</strong>
          </div>
          {roots.map((item) => (
            <a
              key={item.key}
              href={routeHref(item.key)}
              class={route.root === item.key ? 'active' : ''}
              aria-current={route.root === item.key ? 'page' : undefined}
              title={item.label}
              aria-label={item.label}
            >
              <Icon name={rootIcons[item.key]} size={20} />
              <span class="rail-label">{item.label}</span>
            </a>
          ))}
          <div class="rail-bottom">
            <span
              class="sync-pip"
              title={online ? 'Online and ready to sync' : 'Offline; changes will sync when the connection returns'}
            >
              <i class={online ? 'online' : 'offline'} />
              <span class="visually-hidden">{online ? 'Online' : 'Offline'}</span>
            </span>
          </div>
        </nav>
      </aside>

      <section class="work-area">
        <header class="workspace-chrome" aria-label="Workspace command bar">
          <div class="workspace-location">
            <span>{activeRoot?.label}</span>
            <Icon name="chevron" size={13} />
            <strong>
              {route.root === 'library' && route.objectId
                ? route.objectType === 'book'
                  ? 'Book'
                  : route.objectType === 'artifact'
                    ? 'File'
                    : 'Item'
                : activeFocus?.label || activeMode?.label}
            </strong>
          </div>
          {!(route.root === 'library' && route.objectId) && modes[route.root].length > 1 && (
            <nav class="workspace-chrome-modes" aria-label={`${activeRoot?.label} modes`}>
              {modes[route.root].map((item) => (
                <a
                  key={item.key}
                  href={routeHref(route.root, item.key, item.defaultFocus)}
                  class={route.mode === item.key ? 'active' : ''}
                  aria-current={route.mode === item.key ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          <div class="workspace-commands">
            <button
              type="button"
              class="workspace-search-command"
              onClick={onSearch}
              aria-keyshortcuts="Control+K Meta+K"
              title="Search (Ctrl/Command K)"
            >
              <Icon name="search" size={16} />
              <span>Search everything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button type="button" class="workspace-capture-command" onClick={onCapture}>
              <Icon name="capture" size={17} />
              <span>Capture</span>
            </button>
          </div>
        </header>
        <div class="mobile-utilities" aria-label="Workspace tools">
          <div class="mobile-brand" aria-label="Learning Compass">
            <BrandMark size={23} />
            <strong>Compass</strong>
          </div>
          <button type="button" class="button secondary" onClick={onSearch} aria-keyshortcuts="Control+K Meta+K">
            <Icon name="search" size={16} /> Search
          </button>
          <button type="button" class="button primary" onClick={onCapture}>
            <Icon name="capture" size={17} /> Capture
          </button>
        </div>
        {route.recoveredFrom && !route.notFound && (
          <div class="route-notice route-recovered" role="status">
            <Icon name="sync" size={14} />
            <span>
              <strong>Workspace restored</strong>
              <small>Opened from an older link</small>
            </span>
            <code>{route.recoveredFrom}</code>
          </div>
        )}
        {route.notFound && (
          <div class="route-notice route-warning" role="alert">
            <Icon name="back" size={14} />
            <span>
              <strong>That destination moved</strong>
              <small>You’re in the nearest available workspace</small>
            </span>
            <code>{route.recoveredFrom}</code>
          </div>
        )}
        <main id="workspace-canvas" class="workspace-canvas" tabIndex={-1}>
          {children}
        </main>
      </section>

      {inspector && (
        <>
          <button class="inspector-backdrop" type="button" aria-label="Close inspector" onClick={onInspectorClose} />
          <aside
            ref={inspectorRef}
            class="object-inspector"
            aria-label="Object inspector"
            tabIndex={-1}
            onKeyDown={trapFocus}
          >
            {inspector}
          </aside>
        </>
      )}

      <nav class="mobile-dock" aria-label="Main navigation">
        {roots.map((item) => (
          <a
            key={item.key}
            href={routeHref(item.key)}
            class={route.root === item.key ? 'active' : ''}
            aria-current={route.root === item.key ? 'page' : undefined}
          >
            <Icon name={rootIcons[item.key]} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
