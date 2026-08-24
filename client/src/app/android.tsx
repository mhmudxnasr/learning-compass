import { useEffect, useState } from 'preact/hooks'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> }
type AndroidState = { android: boolean; standalone: boolean; canInstall: boolean }

const DISMISS_KEY = 'learning-compass:android-install-dismissed-at'
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000
const listeners = new Set<(state: AndroidState) => void>()
let promptEvent: InstallPromptEvent | null = null
let started = false

function isAndroid() {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || ''
  return platform.toLowerCase() === 'android' || /Android/i.test(navigator.userAgent)
}

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches
}

function state(): AndroidState {
  return { android: isAndroid(), standalone: isStandalone(), canInstall: Boolean(promptEvent) }
}

function emit() {
  const next = state()
  document.documentElement.dataset.platform = next.android ? 'android' : 'web'
  document.documentElement.dataset.displayMode = next.standalone ? 'standalone' : 'browser'
  listeners.forEach((listener) => listener(next))
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
  const register = () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        document.documentElement.dataset.serviceWorker = 'ready'
        void registration.update()
      })
      .catch(() => { document.documentElement.dataset.serviceWorker = 'failed' })
  }
  if (document.readyState === 'complete') register()
  else addEventListener('load', register, { once: true })
}

export function initAndroidExperience() {
  if (started || typeof window === 'undefined') return
  started = true
  registerServiceWorker()
  emit()
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    promptEvent = event as InstallPromptEvent
    emit()
  })
  addEventListener('appinstalled', () => {
    promptEvent = null
    try { localStorage.removeItem(DISMISS_KEY) } catch {}
    emit()
  })
  matchMedia('(display-mode: standalone)').addEventListener('change', emit)
}

function subscribe(listener: (state: AndroidState) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function install() {
  if (!promptEvent) return
  const event = promptEvent
  await event.prompt()
  const choice = await event.userChoice
  promptEvent = null
  if (choice.outcome === 'dismissed') {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
  }
  emit()
}

function recentlyDismissed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_FOR_MS } catch { return false }
}

export function AndroidInstallBanner() {
  const [installState, setInstallState] = useState<AndroidState>(() => state())
  const [dismissed, setDismissed] = useState(recentlyDismissed)

  useEffect(() => subscribe(setInstallState), [])
  if (!installState.android || installState.standalone || !installState.canInstall || dismissed) return null

  return <aside class="android-install-banner" aria-label="Install Learning Compass">
    <div>
      <strong>Use Learning Compass like an Android app</strong>
      <span>Install it for a launcher icon, standalone window, offline shell, and sharing. Reminders can be enabled separately in Preferences.</span>
    </div>
    <div class="android-install-actions">
      <button class="button secondary" type="button" onClick={() => {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
        setDismissed(true)
      }}>Not now</button>
      <button class="button primary" type="button" onClick={() => void install()}>Install app</button>
    </div>
  </aside>
}
