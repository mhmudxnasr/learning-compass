import { render } from 'preact'
import { App } from './App'
import { initAndroidExperience } from './android'
import { hydrateThemeFromServer, initTheme } from '../theme'
import '../studio.css'

const IMPORT_RECOVERY_KEY = 'learning-compass:dynamic-import-recovery'

function recoverFromStaleImport(message: string) {
  if (!/Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)) return
  try {
    const lastAttempt = Number(sessionStorage.getItem(IMPORT_RECOVERY_KEY) || 0)
    if (Date.now() - lastAttempt < 15_000) return
    sessionStorage.setItem(IMPORT_RECOVERY_KEY, String(Date.now()))
  } catch {
    // Continue with a normal reload when storage is unavailable.
  }
  const url = new URL(location.href)
  url.searchParams.set('asset_refresh', String(Date.now()))
  location.replace(url.href)
}

addEventListener('error', (event: ErrorEvent) => recoverFromStaleImport(event.message || ''))
addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => recoverFromStaleImport(String(event.reason?.message || event.reason || '')))

initTheme()
initAndroidExperience()
void hydrateThemeFromServer()

render(<App />, document.getElementById('app')!)
