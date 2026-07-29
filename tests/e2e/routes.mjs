import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const workspaces = {
  today: ['briefing'],
  curate: ['inbox','queue','collections','resurfacing','contradictions','archive'],
  map: ['atlas','branches','coverage','taste'],
  learn: ['review','sessions','reflections','journal','cards'],
  vault: ['files','notes','collections'],
  insights: ['overview','learning','taste','forecast'],
  settings: ['profile','appearance','learning','curation','data'],
}

const server = spawn('./node_modules/.bin/wrangler', ['dev', '--config', 'wrangler.toml', '--port', '8787'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
})
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })
server.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })

for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8787/health')
    if (response.ok) break
  } catch {}
  if (attempt === 59) {
    server.kill('SIGTERM')
    throw new Error(`Worker did not start:\n${serverLog}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 250))
}

const browser = await chromium.launch()
try {
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

let count = 0
for (const [workspace, views] of Object.entries(workspaces)) {
  for (const view of views) {
    const before = errors.length
    await page.goto(`http://127.0.0.1:8787/#/${workspace}/${view}`, { waitUntil: 'networkidle' })
    const heading = await page.locator('.page-head h1').textContent()
    if (!heading?.trim()) throw new Error(`${workspace}/${view}: missing heading`)
    if (errors.length !== before) throw new Error(`${workspace}/${view}: ${errors.at(-1)}`)
    if (await page.locator('.error-state').count()) throw new Error(`${workspace}/${view}: rendered an API error state`)
    const body = await page.locator('.page-content').innerText()
    if (/undefined|NaN/.test(body)) throw new Error(`${workspace}/${view}: leaked undefined/NaN`)
    if (workspace === 'curate' && view === 'archive') {
      await page.locator('.archive-rss').waitFor({ state: 'attached' })
    }
    count++
  }
}

if (count !== 28) throw new Error(`expected 28 routes, checked ${count}`)
await page.goto('http://127.0.0.1:8787/#/curate/queue', { waitUntil: 'networkidle' })
const curateNav = await page.locator('.subnav button').allTextContents()
if (curateNav[0]?.trim() !== 'Queue' || curateNav[1]?.trim() !== 'RSS Feed') throw new Error('Curate navigation order or RSS label is incorrect')
const [settings, manifest, artifacts, feeds, manualArchive] = await Promise.all([
  fetch('http://127.0.0.1:8787/settings').then((response) => response.json()),
  fetch('http://127.0.0.1:8787/manifest.json').then((response) => response.json()),
  fetch('http://127.0.0.1:8787/artifacts').then((response) => response.json()),
  fetch('http://127.0.0.1:8787/capture/feeds').then((response) => response.json()),
  fetch('http://127.0.0.1:8787/recommendations/list?source=manual').then((response) => response.json()),
])
if (settings.resolved?.learning?.retention !== 90 || settings.resolved?.learning?.queue_cap !== 5) throw new Error('settings defaults are not resolved')
if (!manifest.icons?.some((icon) => icon.src === '/icon.svg')) throw new Error('manifest is missing the local app icon')
if (!Array.isArray(artifacts.artifacts)) throw new Error('artifact library contract is invalid')
if (!Array.isArray(feeds.feeds)) throw new Error('feed subscriptions contract is invalid')
if (!Array.isArray(manualArchive.recommendations)) throw new Error('manual archive contract is invalid')
await page.setViewportSize({ width: 390, height: 844 })
await page.goto('http://127.0.0.1:8787/#/today/briefing', { waitUntil: 'networkidle' })
if (!(await page.locator('.mobile-nav').isVisible())) throw new Error('mobile primary navigation is not visible')
if (await page.locator('.rail').isVisible()) throw new Error('desktop rail remains visible on mobile')
await page.getByRole('button', { name: 'More' }).click()
const moreDialog = page.locator('.mobile-more-dialog')
await moreDialog.waitFor({ state: 'visible' })
for (const workspace of ['Map', 'Vault', 'Insights', 'Settings']) {
  if (!(await moreDialog.locator('nav button').filter({ hasText: new RegExp(`^${workspace}`) }).isVisible())) throw new Error(`mobile More is missing ${workspace}`)
}
await moreDialog.locator('nav button').filter({ hasText: /^Vault/ }).click()
if (!page.url().includes('#/vault/')) throw new Error('mobile More did not navigate to Vault')

console.log(`E2E passed: ${count} purposeful destinations, mobile shell, and complete mobile navigation`)
} finally {
  await browser.close()
  server.kill('SIGTERM')
}
