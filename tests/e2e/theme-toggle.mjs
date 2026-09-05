import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

export async function verifyThemeToggle({ page, baseUrl, requestJson }) {
  const original = (await requestJson('/settings')).resolved.appearance
  const desktop = page.locator('button.rail-brand')
  const mobile = page.locator('button.mobile-brand')
  const waitForMode = async (mode) => {
    await page.waitForFunction((expected) => document.documentElement.dataset.colorMode === expected, mode)
  }
  const toggle = async (button, mode, key) => {
    assert.equal(await button.getAttribute('aria-label'), `Compass: switch to ${mode} mode`)
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT',
    )
    if (key) {
      await button.focus()
      await button.press(key)
    } else await button.click()
    assert.equal((await saved).status(), 200)
    await waitForMode(mode)
    await page.waitForFunction(() => !document.querySelector('button.rail-brand').disabled)
  }
  const appearance = async () => (await requestJson('/settings')).resolved.appearance
  const checkLayout = async (button, label) => {
    const bounds = await button.boundingBox()
    assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44, `${label}: touch target is too small`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `test-results/theme-toggle/${label}.png` })
  }

  mkdirSync('test-results/theme-toggle', { recursive: true })
  try {
    await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify({ theme: 'mineral' }) })
    await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'mineral')
    const font = await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-ui'))
    const location = page.url()
    await checkLayout(desktop, 'desktop-light')
    await toggle(desktop, 'dark')
    assert.equal(page.url(), location, 'Logo should preserve the current workspace')
    assert.equal((await appearance()).theme, 'carbon')
    await checkLayout(desktop, 'desktop-dark')
    await page.reload({ waitUntil: 'networkidle' })
    await waitForMode('dark')
    await toggle(desktop, 'light', 'Enter')
    assert.equal((await appearance()).theme, 'mineral', 'Switching back should restore the selected day preset')
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-ui')), font)

    await page.goto(`${baseUrl}/#/settings?focus=preferences`, { waitUntil: 'networkidle' })
    await page.locator('.settings-page').waitFor()
    await toggle(desktop, 'dark', 'Space')
    await page.locator('.theme-section').evaluate((element) => {
      element.open = true
    })
    assert.equal(await page.locator('.theme-preset-card.active .theme-preset-title').textContent(), 'Raycast Aubergine')
    await toggle(desktop, 'light')

    await page.setViewportSize({ width: 390, height: 844 })
    await checkLayout(mobile, 'mobile-light')
    await toggle(mobile, 'dark')
    await checkLayout(mobile, 'mobile-dark')
    await toggle(mobile, 'light', 'Enter')
    await page.evaluate(() => document.documentElement.style.setProperty('--font-viewport-scale', '2'))
    await checkLayout(mobile, 'mobile-large-text')
    await page.evaluate(() => document.documentElement.style.removeProperty('--font-viewport-scale'))

    const day = { brand: '#7357ce', shell: '#faf9ff', highlight: '#e5dff8', accent: '#534575', ink: '#242132' }
    const night = { brand: '#bba7ff', shell: '#171321', highlight: '#39304f', accent: '#c5b6df', ink: '#faf6ff' }
    await page.evaluate(
      ({ day, night }) => {
        localStorage.setItem('taste-map-theme-pair', JSON.stringify({ day, night }))
        localStorage.setItem('taste-map-theme-dark', 'custom')
        localStorage.setItem('taste-map-theme-light', 'custom')
      },
      { day, night },
    )
    await requestJson('/settings/appearance', {
      method: 'PUT',
      body: JSON.stringify({ theme: 'custom', custom_palette: day }),
    })
    await page.reload({ waitUntil: 'networkidle' })
    await waitForMode('light')
    await toggle(mobile, 'dark')
    assert.equal((await appearance()).custom_palette.shell, night.shell)
    await page.reload({ waitUntil: 'networkidle' })
    await waitForMode('dark')
    await toggle(mobile, 'light')
    assert.equal((await appearance()).custom_palette.shell, day.shell)

    // A rejected save must restore the previous appearance and explain the failure.
    await page.route('**/settings/appearance', (route) => route.fulfill({ status: 500, json: { error: 'fixture' } }))
    await mobile.click()
    await page.getByRole('status').filter({ hasText: 'Could not save the theme' }).waitFor()
    await waitForMode('light')
    await page.unroute('**/settings/appearance')
  } finally {
    await page.unroute('**/settings/appearance')
    await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify(original) })
    await page.evaluate(() => {
      for (const key of ['taste-map-theme-light', 'taste-map-theme-dark', 'taste-map-theme-pair']) {
        localStorage.removeItem(key)
      }
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
  }
}
