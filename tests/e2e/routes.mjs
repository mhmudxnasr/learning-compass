import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')

const roots = ['home', 'library', 'learn', 'map', 'settings']
const publicLearningUpdatePath = '/updates/learning-materials'
const rootRoutes = [
  { root: 'home', href: '#/home', expected: '.folio-home-workspace' },
  { root: 'library', href: '#/library', expected: '.folio-queue-view' },
  { root: 'learn', href: '#/learn', expected: '.folio-paths' },
  { root: 'map', href: '#/map', expected: '.atlas-empty-state, .atlas-canvas-view' },
  { root: 'settings', href: '#/settings', expected: '.profile-settings-page' },
]

// These are lenses inside the five roots. They deliberately use query state;
// none of them is a peer destination in the global rail or mobile dock.
const modeRoutes = [
  { root: 'home', href: '#/home', mode: 'today', expected: '.folio-home-workspace' },
  { root: 'library', href: '#/library?mode=triage&focus=queue', mode: 'triage', focus: 'queue', expected: '.folio-queue-view' },

  { root: 'library', href: '#/library?mode=triage&focus=feeds', mode: 'triage', focus: 'feeds', expected: '.folio-feeds-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=all', mode: 'catalog', focus: 'all', expected: '.folio-all-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=journal', mode: 'catalog', focus: 'journal', expected: '.hardcover-journal-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=collections', mode: 'catalog', focus: 'collections', expected: '.folio-collections-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=archive', mode: 'catalog', focus: 'archive', expected: '.folio-archive-view' },
  { root: 'library', href: '#/library?mode=assets&focus=files', mode: 'assets', focus: 'files', expected: '.folio-files-view' },
  { root: 'learn', href: '#/learn', mode: 'paths', expected: '.folio-paths' },
  { root: 'learn', href: '#/learn?mode=canon&focus=shelf', mode: 'canon', focus: 'shelf', expected: '.folio-books-view' },
  { root: 'learn', href: '#/learn?mode=canon', mode: 'canon', expected: '.canon-atlas-workspace' },
  { root: 'learn', href: '#/learn?mode=practice&focus=notes', mode: 'practice', focus: 'notes', expected: '.folio-notes' },
  { root: 'learn', href: '#/learn?mode=practice&focus=recall', mode: 'practice', focus: 'recall', expected: '.folio-recall' },
  { root: 'map', href: '#/map', mode: 'atlas', expected: '.atlas-empty-state, .atlas-canvas-view' },
  { root: 'map', href: '#/map?mode=review&focus=branches', mode: 'review', focus: 'branches', expected: '.branch-desk' },
  { root: 'map', href: '#/map?mode=review&focus=balance', mode: 'review', focus: 'balance', expected: '.map-balance-view' },
  { root: 'settings', href: '#/settings', mode: 'personal', expected: '.profile-settings-page' },
  { root: 'settings', href: '#/settings?focus=preferences', mode: 'personal', focus: 'preferences', expected: '.settings-page' },
  { root: 'settings', href: '#/settings?mode=data', mode: 'data', expected: '.data-settings-page' },
  { root: 'settings', href: '#/settings?mode=system', mode: 'system', expected: '.system-console' },
]

const wrangler = process.env.WRANGLER_BIN || 'wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-e2e-'))
const preContextBriefSchema = join(persistDir, 'schema-before-context-brief.sql')
writeFileSync(preContextBriefSchema, readFileSync('schema.sql', 'utf8').replace('  context_brief TEXT,\n', ''))
const port = await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})
const baseUrl = `http://127.0.0.1:${port}`
let server
let browser

try {
  for (const args of [
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', preContextBriefSchema],
    ['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir],
  ]) {
    const process = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    process.stdout.on('data', (chunk) => { output += chunk })
    process.stderr.on('data', (chunk) => { output += chunk })
    const status = await new Promise((resolve) => process.on('close', resolve))
    if (status !== 0) throw new Error(`D1 setup failed:\n${output}`)
  }

  server = spawn(wrangler, ['dev', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })
  server.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) break
    } catch {}
    if (attempt === 59) throw new Error(`Worker did not start:\n${serverLog}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const requestJson = async (path, options = {}, retry = true) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    const method = (options.method || 'GET').toUpperCase()
    let body
    try {
      body = await response.json()
    } catch (error) {
      if (retry && ['GET', 'HEAD'].includes(method)) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return requestJson(path, options, false)
      }
      throw error
    }
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${JSON.stringify(body)}`)
    return body
  }
  await requestJson('/brain/seed', { method: 'POST', body: JSON.stringify({
    profile: {
      identity: JSON.stringify({ role: 'builder', context: 'Profile rendering fixture' }),
      mega_priority: [{ rank: 1, label: 'Deep systems thinking' }],
      core_filter: 'Only sources with concrete mechanisms and evidence.',
      reaction_style: JSON.stringify({ tone: 'direct', format: 'compact' }),
      quality_rules: '{"malformed":',
      operational_style: JSON.stringify({ language: 'English-first' }),
      patterns_summary: JSON.stringify({ preference: 'applied examples' }),
      recent_signal: 'Prefer evidence-backed applied material.',
    },
    priorities: [[1, 'systems', 'Systems thinking', 'Build durable models.']],
    tree_nodes: [
      { id: 'fixture-branch-id', type: 'branch', label: 'Readable fixture branch', super_category: 'cat-mind', parent_id: 'root', status: 'love', round_label: 'R1' },
      { id: 'pruned-fixture-branch', type: 'branch', label: 'Pruned fixture branch', super_category: 'cat-mind', parent_id: 'root', status: 'pruned', round_label: 'R2' },
    ],
  }) })
  await requestJson('/brain/profile/sync-swipes', { method: 'POST', body: JSON.stringify({}) })
  const seededProfile = await requestJson('/brain/profile?recent_limit=50')
  if (!seededProfile.profile) throw new Error(`profile fixture did not persist: ${JSON.stringify(seededProfile)}`)

  const directBookBody = { title: 'E2E Direct Book', author: 'E2E Author', url: 'https://example.com/direct-book' }
  const bookHeaders = { 'content-type': 'application/json', 'x-real-ip': 'e2e-books' }
  for (const [label, body] of [
    ['missing', directBookBody],
    ['invalid', { ...directBookBody, branch_id: 'missing-branch' }],
    ['pruned', { ...directBookBody, branch_id: 'pruned-fixture-branch' }],
  ]) {
    const rejected = await fetch(`${baseUrl}/recommendations/books`, { method: 'POST', headers: bookHeaders, body: JSON.stringify(body) })
    if (rejected.status !== 400) throw new Error(`manual book intake accepted a ${label} branch (${rejected.status})`)
  }
  const directBook = await requestJson('/recommendations/books', { method: 'POST', headers: bookHeaders, body: JSON.stringify({ ...directBookBody, branch_id: 'fixture-branch-id' }) })
  if (directBook.book.branch_id !== 'fixture-branch-id' || directBook.book.round_label !== 'R1') throw new Error('manual book intake did not persist its verified branch and round')
  const shelfRead = await requestJson('/recommendations/books')
  if ((shelfRead.books || []).some((book) => !book.branch?.id || !book.branch?.round)) throw new Error('Books Shelf exposed a record without canonical branch and round context')

  const canonHeaders = { 'content-type': 'application/json', 'x-real-ip': 'e2e-canon' }
  const requestCanonJson = (path, options = {}) => requestJson(path, { ...options, headers: { ...canonHeaders, ...(options.headers || {}) } })
  const canonFamily = await requestCanonJson('/learning/core/canon/domains', { method: 'POST', body: JSON.stringify({ title: 'Mind & Society', kind: 'family', branch_id: 'fixture-branch-id', boundary: 'Fields for understanding minds, groups, and institutions.', sort_order: 1 }) })
  const canonDomain = await requestCanonJson('/learning/core/canon/domains', { method: 'POST', body: JSON.stringify({ title: 'Behavioral Psychology', slug: 'behavioral-psychology', parent_id: canonFamily.id, branch_id: 'fixture-branch-id', boundary: 'Evidence-led accounts of observable behavior and learning; excludes clinical self-treatment.', orientation: 'Compare mechanisms, applications, and critiques.', sort_order: 1 }) })
  const canonPendingDomain = await requestCanonJson('/learning/core/canon/domains', { method: 'POST', body: JSON.stringify({ title: 'Social Psychology', slug: 'social-psychology', parent_id: canonFamily.id, branch_id: 'fixture-branch-id', boundary: 'How people think and act in social settings.', orientation: 'Compare individual, group, and cultural mechanisms.', sort_order: 2 }) })
  const emptyCanonThread = await fetch(`${baseUrl}/learning/core/canon/domains/${canonPendingDomain.id}/thread`, { method: 'POST', headers: canonHeaders })
  if (emptyCanonThread.status !== 409) throw new Error(`Canon created an empty Thread from an unfinished field (${emptyCanonThread.status})`)
  const canonEntryBody = (role, suffix) => ({
    title: `E2E Canon Book ${suffix}`, author: 'E2E Author', canonical_url: `https://example.com/canon-${suffix.toLowerCase()}`,
    why_slot: `${role} earns this permanent role through a distinct contribution.`, beginner_case: 'A newcomer can enter through concrete examples.',
    expert_case: 'Experienced practitioners still use its core model.', unique_contribution: `The ${role} contribution is not duplicated by the other slots.`,
    limitations: 'Its scope is deliberately bounded.', difficulty: 'Moderate; no specialist prerequisites.', rejected_alternative: `Alternative ${suffix}`,
    rejection_reason: 'It overlaps more heavily with another slot.', evidence: [{ claim: 'E2E source-grounded selection evidence.', url: `https://example.com/evidence-${suffix.toLowerCase()}` }], editorial_status: 'approved',
  })
  const canonFoundation = await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/entries/foundation`, { method: 'PUT', body: JSON.stringify(canonEntryBody('foundation', 'A')) })
  const prematureComplete = await fetch(`${baseUrl}/learning/core/canon/domains/${canonDomain.id}`, { method: 'PATCH', headers: canonHeaders, body: JSON.stringify({ curation_status: 'complete' }) })
  if (prematureComplete.status !== 409) throw new Error(`Canon accepted a complete domain without three approved dossiers (${prematureComplete.status})`)
  const canonCapture = await requestCanonJson(`/learning/core/canon/entries/${canonFoundation.id}/capture`, { method: 'POST' })
  if (canonCapture.state !== 'captured' || canonCapture.branch_id !== 'fixture-branch-id') throw new Error('Canon capture did not preserve captured-source and branch contracts')
  await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/entries/representative`, { method: 'PUT', body: JSON.stringify(canonEntryBody('representative', 'B')) })
  await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/entries/boundary`, { method: 'PUT', body: JSON.stringify(canonEntryBody('boundary', 'C')) })
  await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}`, { method: 'PATCH', body: JSON.stringify({ curation_status: 'complete' }) })
  const canonRead = await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}`)
  if (canonRead.entries.length !== 3 || canonRead.domain.curation_status !== 'complete') throw new Error('Canon domain did not expose its approved trio')

  browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
const rootHrefs = await page.locator('.root-rail nav[aria-label="Five workspaces"] a').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')))])
if (rootHrefs.length !== roots.length || roots.some((root) => !rootHrefs.includes(`#/${root}`))) throw new Error(`root rail does not expose exactly the five stable roots: ${rootHrefs.join(', ')}`)
if (await page.locator('.root-rail nav[aria-label="Five workspaces"] a').count() !== roots.length) throw new Error('root rail must contain exactly five global destinations')
if (await page.locator('.root-rail + .context-pane, .context-pane').count()) throw new Error('desktop shell rendered a permanent context pane')
const desktopRail = page.locator('.root-rail')
if (await desktopRail.getByRole('button', { name: 'Search', exact: true }).count() !== 1 || await desktopRail.getByRole('button', { name: 'Save source', exact: true }).count() !== 1) throw new Error('desktop rail is missing global Search or Save source')
await desktopRail.getByRole('button', { name: 'Search', exact: true }).click()
await page.locator('.search-dialog').waitFor({ state: 'visible' })
await page.keyboard.press('Escape')
await desktopRail.getByRole('button', { name: 'Save source', exact: true }).click()
await page.locator('.capture-dialog').waitFor({ state: 'visible' })
if (!(await page.locator('.capture-dialog').innerText()).includes('source records')) throw new Error('global Save source does not explain the source-ledger contract')
await page.getByRole('button', { name: 'Close capture dialog' }).click()

for (const route of rootRoutes) {
  await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell').waitFor({ state: 'visible', timeout: 15000 })
  if (!(await page.locator(`.studio-shell[data-root="${route.root}"]`).count())) throw new Error(`${route.href}: wrong root shell`)
  await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
}

let count = 0
for (const route of modeRoutes) {
  const before = errors.length
  await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell').waitFor({ state: 'visible', timeout: 15000 })
  if (!(await page.locator(`.studio-shell[data-root="${route.root}"]`).count())) throw new Error(`${route.href}: wrong root shell`)
  for (const selector of ['.root-rail', '.workspace-canvas']) {
    if (await page.locator(selector).count() !== 1) throw new Error(`${route.href}: missing exactly one ${selector}`)
  }
  if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count()) throw new Error(`${route.href}: rendered a redundant context/menu surface`)
  await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
  const routeState = await page.evaluate(() => {
    const hash = location.hash.replace(/^#/, '')
    const [path, query = ''] = hash.split('?')
    return { path, query: Object.fromEntries(new URLSearchParams(query).entries()) }
  })
  if (routeState.path !== `/${route.root}`) throw new Error(`${route.href}: mode escaped its root path (${routeState.path})`)
  const defaultModes = { home: 'today', library: 'triage', learn: 'paths', map: 'atlas', settings: 'personal' }
  if (route.mode && route.mode !== defaultModes[route.root] && routeState.query.mode !== route.mode) throw new Error(`${route.href}: mode query was not preserved (${JSON.stringify(routeState.query)})`)
  if (route.focus && routeState.query.focus !== route.focus) throw new Error(`${route.href}: focus query was not preserved (${JSON.stringify(routeState.query)})`)
  if (route.root !== 'home' && await page.locator('.workspace-mode-switcher').count() !== 1) throw new Error(`${route.href}: missing the active root's internal mode switcher`)
  if (route.root === 'library' && (route.mode === 'triage' || route.mode === 'catalog') && await page.locator('.workspace-filter-switcher').count() !== 1) throw new Error(`${route.href}: missing the Library filter switcher`)
  if ((route.root === 'learn' && (route.mode === 'canon' || route.mode === 'practice')) || (route.root === 'map' && route.mode === 'review') || (route.root === 'settings' && route.mode === 'personal')) {
    if (await page.locator('.workspace-filter-switcher').count() !== 1) throw new Error(`${route.href}: missing the active mode's focus switcher`)
  }
  if (route.root !== 'home' && !(await page.locator('.workspace-mode-switcher a.active, .workspace-mode-switcher a[aria-current="page"]').count())) throw new Error(`${route.href}: mode switcher did not mark its active mode`)
  const workspaceWidth = await page.evaluate(() => {
    const canvas = document.querySelector('.workspace-canvas')
    const surface = document.querySelector('.workspace-canvas > div > :first-child')
    if (!canvas || !surface) return null
    return { canvas: canvas.clientWidth, surface: surface.getBoundingClientRect().width }
  })
  if (!workspaceWidth || workspaceWidth.surface < workspaceWidth.canvas * 0.92) {
    throw new Error(`${route.href}: workspace surface is not using the available desktop canvas (${JSON.stringify(workspaceWidth)})`)
  }
  for (const selector of ['.orbit-bar', '.page-head', '.subnav', '.rail', '.app-shell', '.main']) {
    if (await page.locator(selector).count()) throw new Error(`${route.href}: rendered retired frontend selector ${selector}`)
  }
  const headings = page.locator('h1')
  if (await headings.count() !== 1) throw new Error(`${route.href}: expected exactly one h1, found ${await headings.count()}`)
  if (!(await headings.first().textContent())?.trim()) throw new Error(`${route.href}: h1 is empty`)
  if (errors.length !== before) throw new Error(`${route.href}: ${errors.at(-1)}`)
  if (await page.locator('.error-state').count()) throw new Error(`${route.href}: rendered an API error state`)
  const body = await page.locator('.workspace-canvas').innerText()
  if (/undefined|NaN/.test(body)) throw new Error(`${route.href}: leaked undefined/NaN`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 2) throw new Error(`${route.href}: horizontal overflow ${overflow}px`)
  count++
}

  if (count !== modeRoutes.length) throw new Error(`expected ${modeRoutes.length} internal mode states, checked ${count}`)

  await page.goto(`${baseUrl}/#/learn?mode=canon`, { waitUntil: 'networkidle' })
  await page.locator('.canon-atlas-workspace').waitFor({ state: 'visible', timeout: 15000 })
  if (!(await page.getByRole('heading', { level: 1, name: 'Canon' }).count())) throw new Error(`Canon atlas is missing its learner-facing title: ${await page.locator('h1').allTextContents()}`)
  if (!(await page.getByRole('heading', { level: 2, name: 'Ready to explore' }).count()) || !(await page.getByRole('heading', { level: 2, name: 'Coming next' }).count())) throw new Error('Canon atlas did not separate usable paths from unfinished coverage')
  if (!(await page.getByRole('button', { name: 'Surprise me with a ready field' }).count())) throw new Error('Canon did not constrain surprise discovery to ready fields')
  if (!(await page.getByRole('link', { name: 'Explore Canon field Behavioral Psychology' }).count())) throw new Error('Canon atlas omitted the ready field row')
  const pendingCard = page.locator('.canon-entry-card').filter({ hasText: 'Social Psychology' })
  if (await pendingCard.getByRole('link').count()) throw new Error('unfinished Canon field exposed a false path link')
  await page.getByRole('link', { name: 'Explore Canon field Behavioral Psychology' }).click()
  await page.locator('.canon-domain-detail').waitFor({ state: 'visible' })
  if (!page.url().includes('#/learn/canon/behavioral-psychology')) throw new Error('Canon domain did not preserve its canonical typed route')
  for (const role of ['Foundation', 'Representative', 'Boundary']) if (!(await page.getByRole('heading', { level: 2, name: role }).count())) throw new Error(`Canon domain omitted its permanent ${role} slot`)
  if (await page.locator('.canon-book-section').count() !== 3 || await page.getByText('Strongest rejected alternative').count() !== 3) throw new Error('Canon domain did not render three progressive selection dossiers')
  if (!(await page.getByRole('button', { name: 'Create three-book Thread' }).isEnabled())) throw new Error('Canon did not enable Thread creation after a ready book was captured')
  const canonThread = await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/thread`, { method: 'POST' })
  const canonThreadRead = await requestCanonJson(`/learning/core/threads/${canonThread.id}/path`)
  if (!canonThreadRead.thread.title.includes('Behavioral Psychology')) throw new Error('Canon domain did not create a normal finite Thread')
  await page.goto(`${baseUrl}/#/learn/canon/social-psychology`, { waitUntil: 'networkidle' })
  await page.locator('.canon-pending-panel').waitFor({ state: 'visible' })
  if (await page.locator('.canon-book-section').count() || await page.getByRole('button', { name: 'Create three-book Thread' }).count()) throw new Error('unfinished Canon field exposed a false reading path or Thread action')

  await page.goto(`${baseUrl}/#/learn/book/${encodeURIComponent(directBook.book.id)}?mode=canon&focus=shelf`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell[data-root="learn"]').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /back/i }).click()
  await page.locator('.folio-books-view').waitFor({ state: 'visible' })
  if (!page.url().includes('#/learn?mode=canon&focus=shelf')) throw new Error('book dossier Back action left the unified Learn Books workspace')

  await page.goto(`${baseUrl}/#/library?mode=catalog&focus=books`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell[data-root="learn"]').waitFor({ state: 'visible' })
  await page.locator('.folio-books-view').waitFor({ state: 'visible' })
  if (!(await page.locator('.workspace-filter-switcher a[aria-current="page"]').filter({ hasText: 'Shelf' }).count())) throw new Error('legacy Library Books query did not recover to Learn Books Shelf')

  await page.goto(`${baseUrl}/#/settings?focus=preferences`, { waitUntil: 'networkidle' })
  for (const section of ['visual-presets-heading', 'interface-tokens', 'theme-section', 'font-section', 'learning-preferences', 'atlas-preferences']) {
    await page.locator(`.settings-jump-nav a[href="#${section}"]`).click()
    await page.waitForTimeout(80)
    const jumpState = await page.evaluate((id) => {
      const canvas = document.querySelector('.workspace-canvas')
      const target = document.getElementById(id)
      const jumpNav = document.querySelector('.settings-jump-nav')
      return { hash: location.hash, heading: document.querySelector('h1')?.textContent, scrollTop: canvas?.scrollTop || 0, targetTop: target?.getBoundingClientRect().top || 0, navBottom: jumpNav?.getBoundingClientRect().bottom || 0 }
    }, section)
    if (jumpState.hash !== '#/settings?focus=preferences' || jumpState.heading !== 'Preferences') throw new Error(`preference jump escaped settings route for ${section}: ${JSON.stringify(jumpState)}`)
    if (section !== 'visual-presets-heading' && jumpState.targetTop < jumpState.navBottom - 12) throw new Error(`preference jump hid ${section} behind the sticky section navigator: ${JSON.stringify(jumpState)}`)
  }
  const duplicateSettingIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  })
  if (duplicateSettingIds.length) throw new Error(`Settings contains duplicate IDs: ${duplicateSettingIds.join(', ')}`)
  const preferenceDisclosures = page.locator('.preferences-main > details.preference-disclosure')
  if (await preferenceDisclosures.count() !== 4) throw new Error('Preferences must progressively disclose theme, font, typography, and Map tuning')
  for (let index = 0; index < await preferenceDisclosures.count(); index++) {
    if (await preferenceDisclosures.nth(index).getAttribute('open') !== null) throw new Error('advanced preference disclosures must start closed')
  }
  if (await page.locator('.theme-preview-frame').getByRole('button').count()) throw new Error('appearance preview must not expose fake actions')
  if (await page.locator('.preferences-preview-rail').count() !== 1) throw new Error('Preferences must keep one contextual appearance preview')
  const saveRadio = async (group, option) => {
    const radio = page.getByRole('group', { name: new RegExp(`^${group}`) }).getByRole('radio', { name: new RegExp(`^${option}`) })
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok()),
      radio.check(),
    ])
  }
  const renderedPreferences = () => page.evaluate(() => {
    const root = document.documentElement
    const canvas = document.querySelector('.workspace-canvas')
    const row = document.querySelector('.setting-row')
    const intro = document.querySelector('.settings-intro p')
    const sampleButton = document.querySelector('.visual-preset-card')
    return {
      density: root.dataset.density,
      radius: root.dataset.radius,
      fontSizePreference: root.dataset.fontSize,
      reducedMotion: root.dataset.reducedMotion,
      canvasPaddingTop: canvas ? parseFloat(getComputedStyle(canvas).paddingTop) : 0,
      rowRadius: row ? parseFloat(getComputedStyle(row).borderRadius) : 0,
      introFontSize: intro ? parseFloat(getComputedStyle(intro).fontSize) : 0,
      transitionDuration: sampleButton ? parseFloat(getComputedStyle(sampleButton).transitionDuration) : 1,
      theme: root.dataset.theme,
      colorMode: root.dataset.colorMode,
      cypress: getComputedStyle(root).getPropertyValue('--studio-cypress').trim(),
      actionInk: getComputedStyle(root).getPropertyValue('--studio-action-ink').trim(),
    }
  })
  await saveRadio('Density', 'Compact')
  const compactPreference = await renderedPreferences()
  await saveRadio('Density', 'Comfortable')
  const comfortablePreference = await renderedPreferences()
  if (compactPreference.density !== 'compact' || comfortablePreference.density !== 'comfortable' || comfortablePreference.canvasPaddingTop <= compactPreference.canvasPaddingTop) throw new Error(`density does not materially change the studio: ${JSON.stringify({ compactPreference, comfortablePreference })}`)
  await saveRadio('Corners', 'Sharp')
  const sharpPreference = await renderedPreferences()
  await saveRadio('Corners', 'Round')
  const roundPreference = await renderedPreferences()
  if (sharpPreference.radius !== 'sharp' || roundPreference.radius !== 'round' || roundPreference.rowRadius <= sharpPreference.rowRadius) throw new Error(`radius does not materially change controls: ${JSON.stringify({ sharpPreference, roundPreference })}`)
  await saveRadio('Text size', 'Small')
  const smallPreference = await renderedPreferences()
  await saveRadio('Text size', 'Large')
  const largePreference = await renderedPreferences()
  if (smallPreference.fontSizePreference !== 'small' || largePreference.fontSizePreference !== 'large' || largePreference.introFontSize <= smallPreference.introFontSize) throw new Error(`font size does not materially change the interface: ${JSON.stringify({ smallPreference, largePreference })}`)
  const reducedMotionToggle = page.getByLabel('Reduce motion', { exact: false })
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok()),
    reducedMotionToggle.check(),
  ])
  const reducedPreference = await renderedPreferences()
  if (reducedPreference.reducedMotion !== 'true' || reducedPreference.transitionDuration > 0.001) throw new Error(`reduced motion is metadata-only: ${JSON.stringify(reducedPreference)}`)
  await page.locator('#theme-section > summary').click()
  const midnightTheme = page.locator('.theme-preset-card').filter({ hasText: 'Midnight Observatory' })
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok()),
    midnightTheme.click(),
  ])
  const midnightPreference = await renderedPreferences()
  if (midnightPreference.theme !== 'midnight' || midnightPreference.colorMode !== 'dark' || !midnightPreference.cypress || !midnightPreference.actionInk) throw new Error(`theme does not replace the global visual system: ${JSON.stringify(midnightPreference)}`)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'midnight' && document.documentElement.dataset.fontSize === 'large')
  const persistedPreference = await renderedPreferences()
  if (persistedPreference.reducedMotion !== 'true' || persistedPreference.radius !== 'round' || persistedPreference.density !== 'comfortable') throw new Error(`display preferences did not survive reload: ${JSON.stringify(persistedPreference)}`)
  await page.locator('#theme-section > summary').click()
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok()),
    page.locator('.theme-preset-card').filter({ hasText: 'Botanical Folio' }).click(),
  ])
  await saveRadio('Density', 'Balanced')
  await saveRadio('Corners', 'Soft')
  await saveRadio('Text size', 'Medium')
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok()),
    page.getByLabel('Reduce motion', { exact: false }).uncheck(),
  ])

  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
const desktopScreenshot = await page.screenshot({ path: join(persistDir, 'home-desktop.png') })
if (!desktopScreenshot.length) throw new Error('desktop visual smoke screenshot was empty')
if (await page.locator('.root-rail nav a').count() !== 5) throw new Error('desktop root rail should expose five destinations')

const updateResponse = await page.goto(`${baseUrl}${publicLearningUpdatePath}`, { waitUntil: 'networkidle' })
if (!updateResponse?.ok()) throw new Error(`public learning update returned ${updateResponse?.status()}`)
if (!updateResponse.headers()['content-type']?.startsWith('text/html')) throw new Error('public learning update is not served as HTML')
if (!updateResponse.headers()['content-security-policy']?.includes("script-src 'none'")) throw new Error('public learning update is missing its no-script policy')
if (await page.locator('h1').count() !== 1 || !(await page.getByRole('heading', { level: 1, name: /One lesson/ }).isVisible())) throw new Error('public learning update does not have one clear page title')
if (await page.getByRole('link', { name: 'Open Learn' }).count() < 2) throw new Error('public learning update does not expose its Learn action at the top and close')
if (await page.locator('.format-row').count() !== 4 || !(await page.getByText('NotebookLM gets a job, not a format list.').isVisible())) throw new Error('public learning update does not explain all four material roles and focused AI')
const updateDesktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (updateDesktopOverflow > 2) throw new Error(`public learning update desktop overflow ${updateDesktopOverflow}px`)
const updateDesktopScreenshot = await page.screenshot({ path: join(persistDir, 'learning-materials-update-desktop.png'), fullPage: true })
if (!updateDesktopScreenshot.length) throw new Error('public learning update desktop screenshot was empty')
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })

const legacyAliases = [
  { path: '/today', root: 'home', mode: 'today' },
  { path: '/today/briefing', root: 'home', mode: 'today' },
  { path: '/today/momentum', root: 'home', mode: 'today' },
  { path: '/insights/overview', root: 'home', mode: 'today' },
  { path: '/curate/queue', root: 'library', mode: 'triage', focus: 'queue' },
  { path: '/library/queue', root: 'library', mode: 'triage', focus: 'queue' },
  { path: '/curate/inbox', root: 'library', mode: 'catalog', focus: 'all' },
  { path: '/library/inbox', root: 'library', mode: 'catalog', focus: 'all' },
  { path: '/curate/feeds', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/library/feeds', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/curate/rss', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/library/rss', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/curate/discovery', root: 'library', mode: 'catalog', focus: 'all' },
  { path: '/library/all', root: 'library', mode: 'catalog', focus: 'all' },
  { path: '/curate/books', root: 'learn', mode: 'canon', focus: 'shelf' },
  { path: '/library/books', root: 'learn', mode: 'canon', focus: 'shelf' },
  { path: '/learn/books', root: 'learn', mode: 'canon', focus: 'shelf' },
  { path: '/library/hardcover', root: 'library', mode: 'catalog', focus: 'journal' },
  { path: '/curate/collections', root: 'library', mode: 'catalog', focus: 'collections' },
  { path: '/library/collections', root: 'library', mode: 'catalog', focus: 'collections' },
  { path: '/curate/archive', root: 'library', mode: 'catalog', focus: 'archive' },
  { path: '/library/archive', root: 'library', mode: 'catalog', focus: 'archive' },
  { path: '/learn/files', root: 'library', mode: 'assets', focus: 'files' },
  { path: '/vault/files', root: 'library', mode: 'assets', focus: 'files' },
  { path: '/library/files', root: 'library', mode: 'assets', focus: 'files' },
  { path: '/learn/hub', root: 'learn', mode: 'paths' },
  { path: '/learn/paths', root: 'learn', mode: 'paths' },
  { path: '/vault/notes', root: 'learn', mode: 'practice', focus: 'notes' },
  { path: '/learn/reflections', root: 'learn', mode: 'practice', focus: 'notes' },
  { path: '/learn/notes', root: 'learn', mode: 'practice', focus: 'notes' },
  { path: '/learn/cards', root: 'learn', mode: 'practice', focus: 'recall' },
  { path: '/learn/review', root: 'learn', mode: 'practice', focus: 'recall' },
  { path: '/learn/recall', root: 'learn', mode: 'practice', focus: 'recall' },
  { path: '/learn/activity', root: 'settings', mode: 'data' },
  { path: '/map/deck', root: 'map', mode: 'review', focus: 'branches' },
  { path: '/map/branches', root: 'map', mode: 'review', focus: 'branches' },
  { path: '/map/coverage', root: 'map', mode: 'review', focus: 'balance' },
  { path: '/map/balance', root: 'map', mode: 'review', focus: 'balance' },
  { path: '/insights/learning', root: 'map', mode: 'review', focus: 'balance' },
  { path: '/settings/profile', root: 'settings', mode: 'personal', focus: 'profile' },
  { path: '/settings/appearance', root: 'settings', mode: 'personal', focus: 'preferences' },
  { path: '/settings/learning', root: 'settings', mode: 'personal', focus: 'preferences' },
  { path: '/settings/curation', root: 'settings', mode: 'personal', focus: 'preferences' },
  { path: '/settings/preferences', root: 'settings', mode: 'personal', focus: 'preferences' },
  { path: '/settings/data', root: 'settings', mode: 'data' },
  { path: '/settings/system', root: 'settings', mode: 'system' },
  { path: '/insights/taste', root: 'settings', mode: 'personal', focus: 'profile' },
  { path: '/insights/hermes', root: 'settings', mode: 'personal', focus: 'profile' },
]
function legacySurface(alias) {
  if (alias.root === 'home') return '.folio-home-workspace'
  if (alias.root === 'library') {
    if (alias.mode === 'assets') return '.folio-files-view'
    if (alias.focus === 'queue') return '.folio-queue-view'

    if (alias.focus === 'feeds') return '.folio-feeds-view'
    if (alias.focus === 'books') return '.folio-books-view'
    if (alias.focus === 'journal') return '.hardcover-journal-view'
    if (alias.focus === 'collections') return '.folio-collections-view'
    if (alias.focus === 'archive') return '.folio-archive-view'
    return '.folio-all-view'
  }
  if (alias.root === 'learn') return alias.mode === 'canon' ? '.folio-books-view' : alias.focus === 'notes' ? '.folio-notes' : alias.focus === 'recall' ? '.folio-recall' : '.folio-paths'
  if (alias.root === 'map') return alias.focus === 'branches' ? '.branch-desk' : alias.focus === 'balance' ? '.map-balance-view' : '.atlas-empty-state'
  if (alias.mode === 'system') return '.system-console'
  if (alias.mode === 'data') return '.data-settings-page'
  return alias.focus === 'preferences' ? '.settings-page' : '.profile-settings-page'
}
function hasFocusFilter(alias) {
  return Boolean(alias.focus && !(alias.root === 'library' && alias.mode === 'assets'))
}
for (const alias of legacyAliases) {
  await page.goto(`${baseUrl}/#${alias.path}`, { waitUntil: 'networkidle' })
  if (!(await page.locator(`.studio-shell[data-root="${alias.root}"]`).count())) throw new Error(`${alias.path}: legacy alias did not recover into the right workspace`)
  if (!(await page.locator('.route-notice').count()) || (await page.locator('.route-warning').count())) throw new Error(`${alias.path}: legacy alias did not announce purposeful recovery`)
  await page.locator('.workspace-mode-switcher, .workspace-canvas').first().waitFor({ state: 'attached', timeout: 15000 })
  await page.locator(legacySurface(alias)).waitFor({ state: 'attached', timeout: 15000 })
  const recoveredState = await page.locator('.studio-shell').evaluate((shell) => ({ mode: shell.getAttribute('data-mode') }))
  if (recoveredState.mode !== alias.mode) throw new Error(`${alias.path}: recovered to mode ${recoveredState.mode}, expected ${alias.mode}`)
  if (hasFocusFilter(alias)) {
    await page.locator('.workspace-filter-switcher').waitFor({ state: 'attached', timeout: 15000 })
    if (!(await page.locator('.workspace-filter-switcher a.active, .workspace-filter-switcher a[aria-current="page"]').count())) throw new Error(`${alias.path}: recovery lost focus=${alias.focus}`)
  }
  if (await page.locator('.orbit-bar, .page-head, .subnav, .rail').count()) throw new Error(`${alias.path}: legacy alias rendered the retired shell`)
}
await page.goto(`${baseUrl}/#/not-a-real-destination`, { waitUntil: 'networkidle' })
if (await page.locator('.route-warning[role="alert"]').count() !== 1) throw new Error('unknown route did not render purposeful recovery')
const hubThread = await requestJson('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title: 'Systems Thinking', thread_type: 'understand', guiding_question: 'How do systems create behavior over time?', definition_of_done: 'Explain and apply core systems concepts.', activate: true }) })
const hubStage = await requestJson(`/learning/core/threads/${hubThread.id}/stages`, { method: 'POST', body: JSON.stringify({ title: 'Level 0 — Orientation', objective: 'Build the map before studying the full theory.', position: 0 }) })
const hubItem = await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/items`, { method: 'POST', body: JSON.stringify({ title: 'Explain the map from memory', item_type: 'recall_prompt', evidence_type: 'free_recall', position: 0 }) })
const hubSourcePush = await requestJson('/recommendations/push', { method: 'POST', body: JSON.stringify([{ id: 'hub_source_e2e', video_title: 'Hub visible source', video_url: 'https://example.com/hub-visible-source', creator: 'E2E', content_type: 'article', status: 'active' }]) })
const hubSourceId = hubSourcePush.items?.[0]?.id || 'hub_source_e2e'
await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/sources`, { method: 'POST', body: JSON.stringify({ recommendation_id: hubSourceId, role: 'foundation', expected_contribution: 'Visible source link for the Hub stage.', position: 0 }) })
const hubRead = await requestJson('/learning/core/hub')
if (!hubRead.paths.some((path) => path.id === hubThread.id && path.stage_count === 1)) throw new Error('Learning Hub read model omitted the authored stage')
await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/start`, { method: 'POST' })
await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/items/${hubItem.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'satisfied' }) })
const hubPath = await requestJson(`/learning/core/threads/${hubThread.id}/path`)
if (hubPath.stages[0].progress.completed !== 1 || hubPath.stages[0].status !== 'ready_to_verify') throw new Error('Learning Hub did not derive stage proof progress')
const hubNote = await requestJson('/notes', { method: 'POST', body: JSON.stringify({ title: 'Path-level reflection', kind: 'note', thread_id: hubThread.id, sections: [{ section_key: 'body', label: 'Notes', content: 'The map comes before the theory.', direction: 'auto' }] }) })
const hubStageNote = await requestJson('/notes', { method: 'POST', body: JSON.stringify({ title: 'Stage-level checkpoint', kind: 'note', stage_id: hubStage.id, sections: [{ section_key: 'body', label: 'Notes', content: 'Orientation done.', direction: 'auto' }] }) })
const hubNotes = await requestJson(`/notes/hub?thread_id=${hubThread.id}`)
if (!hubNotes.notes.some((note) => note.id === hubNote.id) || hubNotes.notes.some((note) => note.id === hubStageNote.id)) throw new Error('hub path notes read model is wrong')
const hubStageNotes = await requestJson(`/notes/hub?stage_id=${hubStage.id}`)
if (!hubStageNotes.notes.some((note) => note.id === hubStageNote.id) || hubStageNotes.notes.some((note) => note.id === hubNote.id)) throw new Error('hub stage notes read model is wrong')
const hubUpload = new FormData()
hubUpload.append('file', new Blob(['hub file for the path'], { type: 'text/plain' }), 'hub-path.txt')
hubUpload.append('metadata', JSON.stringify({ thread_id: hubThread.id }))
const hubUploadResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', body: hubUpload })
const hubUploadBody = await hubUploadResponse.json()
if (!hubUploadResponse.ok) throw new Error(`hub file upload failed: ${JSON.stringify(hubUploadBody)}`)
const hubStageUpload = new FormData()
hubStageUpload.append('file', new Blob(['hub file for the level'], { type: 'text/plain' }), 'hub-level.txt')
hubStageUpload.append('metadata', JSON.stringify({ stage_id: hubStage.id }))
const hubStageUploadResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', body: hubStageUpload })
const hubStageUploadBody = await hubStageUploadResponse.json()
if (!hubStageUploadResponse.ok) throw new Error(`hub Level file upload failed: ${JSON.stringify(hubStageUploadBody)}`)
const hubThreadCard = await requestJson('/learning/srs/create', { method: 'POST', body: JSON.stringify({ thread_id: hubThread.id, question: 'What is the Thread question?', answer: 'How systems create behavior over time.' }) })
const hubStageCard = await requestJson('/learning/srs/create', { method: 'POST', body: JSON.stringify({ stage_id: hubStage.id, question: 'What comes before the theory?', answer: 'Build the map.' }) })
const hubFiles = await requestJson(`/artifacts/hub?thread_id=${hubThread.id}`)
if (!hubFiles.files.some((file) => file.id === hubUploadBody.id && file.filename === 'hub-path.txt')) throw new Error('hub files read model omitted the uploaded file')
const globalArtifacts = await requestJson('/artifacts')
if (globalArtifacts.artifacts.some((file) => file.id === hubUploadBody.id)) throw new Error('global files list leaked a hub-owned file')
const hubPathLoaded = await requestJson(`/learning/core/threads/${hubThread.id}/path`)
if (!hubPathLoaded.notes.some((note) => note.id === hubNote.id) || !hubPathLoaded.files.some((file) => file.id === hubUploadBody.id) || !hubPathLoaded.cards.some((card) => card.id === hubThreadCard.card_id)) throw new Error('path read model omitted Thread-owned notes, files, or cards')
if (hubPathLoaded.notes.some((note) => note.id === hubStageNote.id) || hubPathLoaded.cards.some((card) => card.id === hubStageCard.card_id)) throw new Error('Thread direct material leaked a Level-owned record')
if (!hubPathLoaded.stages[0].notes.some((note) => note.id === hubStageNote.id) || !hubPathLoaded.stages[0].files.some((file) => file.id === hubStageUploadBody.id) || !hubPathLoaded.stages[0].cards.some((card) => card.id === hubStageCard.card_id)) throw new Error('path read model omitted Level-owned notes, files, or cards')
if (hubPathLoaded.stages[0].notes.some((note) => note.id === hubNote.id) || hubPathLoaded.stages[0].cards.some((card) => card.id === hubThreadCard.card_id)) throw new Error('Level material leaked a Thread-owned record')
const compassContextWithThread = await requestJson('/compass/context')
if (!compassContextWithThread.thread_coverage?.some((anchor) => anchor.thread_id === hubThread.id && anchor.label === 'Systems Thinking') || compassContextWithThread.coverage_policy?.complete !== true) throw new Error('Compass context omitted complete learning Thread coverage')
await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/verify`, { method: 'POST' })
await page.goto(`${baseUrl}/#/learn`, { waitUntil: 'networkidle' })
await page.locator('.folio-paths').waitFor({ state: 'visible' })
if (!(await page.getByRole('link', { name: 'Open learning Thread Systems Thinking' }).count())) throw new Error('Learn Paths did not render the authored path')
await page.goto(`${baseUrl}/#/learn/thread/${hubThread.id}`, { waitUntil: 'networkidle' })
await page.locator('.thread-command-center').waitFor({ state: 'visible' })
if (!(await page.getByRole('heading', { level: 1, name: 'Systems Thinking' }).count())) throw new Error('typed Thread route is missing its Thread h1')
if ((await page.locator('.course-stage-context').getByRole('link', { name: 'Threads' }).getAttribute('href')) !== '#/learn') throw new Error('Thread breadcrumb does not return to the Threads index')
if (!(await page.getByLabel('Study progress').count()) || !(await page.getByLabel('Proof progress').count()) || !(await page.getByLabel('Verification progress').count())) throw new Error('Thread overview does not separate Study, Proof, and Verification')
for (const tab of ['Overview', 'Curriculum', 'Evidence', 'Materials']) if (!(await page.getByRole('link', { name: tab, exact: true }).count())) throw new Error(`Thread command center omitted ${tab}`)
await page.getByRole('link', { name: 'Materials', exact: true }).click()
await page.locator('.learning-material-ledger').waitFor({ state: 'visible' })
if (!(await page.getByText('Direct Thread material').count()) || !(await page.getByRole('link', { name: 'Path-level reflection' }).count()) || !(await page.getByRole('link', { name: 'What is the Thread question?' }).count())) throw new Error(`Learn Thread did not render direct Thread material: ${await page.locator('.thread-command-center').innerText()}`)
if (!(await page.getByText('Thread material index').count()) || !(await page.getByText('1 notes · 1 files · 1 cards · 0 drafts').count())) throw new Error('Learn Thread did not aggregate its Level material index')
if (!page.url().includes(`#/learn/thread/${hubThread.id}`)) throw new Error('typed Thread route did not preserve identity')
if (await page.locator('.orbit-bar, .page-head, .subnav, .main-focus').count()) throw new Error('focused Learning Thread rendered retired shell selectors')
await page.goto(`${baseUrl}/#/learn/t/${hubThread.id}/v/${hubStage.id}`, { waitUntil: 'networkidle' })
await page.locator('.course-level-materials > summary').getByText('Level workspace').waitFor({ state: 'visible', timeout: 15000 })
if (await page.locator('.course-level-materials').evaluate((node) => node.hasAttribute('open'))) throw new Error('Level materials should use progressive disclosure')
await page.locator('.course-level-materials > summary').click()
if (!(await page.getByRole('link', { name: 'Stage-level checkpoint' }).count()) || !(await page.getByRole('link', { name: 'hub-level.txt' }).count()) || !(await page.getByRole('link', { name: 'What comes before the theory?' }).count())) throw new Error(`Level route did not render its owned materials: ${await page.locator('.folio-thread').innerText()}`)
if (!page.url().includes(`#/learn/t/${hubThread.id}/v/${hubStage.id}`)) throw new Error('typed Level route did not preserve Thread and Level identity')
const materialHeaders = { 'content-type': 'application/json', 'x-real-ip': 'e2e-learning-materials' }
const requestMaterialJson = (path, options = {}) => requestJson(path, { ...options, headers: { ...materialHeaders, ...(options.headers || {}) } })
const materialThread = await requestMaterialJson('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title: 'Material launcher fixture', thread_type: 'understand', guiding_question: 'Which material should I open first?', definition_of_done: 'Open the recommended lesson material.', activate: true }) })
const materialStage = await requestMaterialJson(`/learning/core/threads/${materialThread.id}/stages`, { method: 'POST', body: JSON.stringify({ title: 'Level 1 — Study', objective: 'Use the right rendition for the task.', position: 0 }) })
const materialLesson = await requestMaterialJson(`/learning/core/threads/${materialThread.id}/stages/${materialStage.id}/lessons`, { method: 'POST', body: JSON.stringify({ title: 'Choose the right material', objective: 'Start with the guided companion and keep alternatives close.', position: 0, estimated_minutes: 18 }) })
const materialLessonNote = await requestMaterialJson('/notes', { method: 'POST', body: JSON.stringify({ title: 'Lesson-owned observation', lesson_id: materialLesson.id, sections: [{ section_key: 'body', label: 'Notes', content: 'This belongs only to the lesson.', direction: 'auto' }] }) })
const materialLessonCard = await requestMaterialJson('/learning/srs/create', { method: 'POST', body: JSON.stringify({ lesson_id: materialLesson.id, question: 'Which scope owns this card?', answer: 'The exact lesson.' }) })
const materialLessonUpload = new FormData()
materialLessonUpload.append('file', new Blob(['lesson-owned file'], { type: 'text/plain' }), 'lesson-owned.txt')
materialLessonUpload.append('metadata', JSON.stringify({ lesson_id: materialLesson.id }))
const materialLessonUploadResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', headers: { 'x-real-ip': 'e2e-learning-materials' }, body: materialLessonUpload })
const materialLessonFile = await materialLessonUploadResponse.json()
if (!materialLessonUploadResponse.ok) throw new Error(`Lesson-owned file upload failed: ${JSON.stringify(materialLessonFile)}`)
const materialScopedPath = await requestMaterialJson(`/learning/core/threads/${materialThread.id}/path`)
const materialScopedLesson = materialScopedPath.stages[0].lessons.find((lesson) => lesson.id === materialLesson.id)
if (!materialScopedLesson?.notes.some((note) => note.id === materialLessonNote.id) || !materialScopedLesson.files.some((file) => file.id === materialLessonFile.id) || !materialScopedLesson.cards.some((card) => card.id === materialLessonCard.card_id)) throw new Error('Thread path omitted exact Lesson-owned capture')
if (materialScopedPath.notes.some((note) => note.id === materialLessonNote.id) || materialScopedPath.stages[0].notes.some((note) => note.id === materialLessonNote.id)) throw new Error('Lesson-owned capture leaked into a parent scope')
await requestMaterialJson('/recommendations/push', { method: 'POST', body: JSON.stringify([{ id: 'material_launcher_source', video_title: 'Source with learning companions', video_url: 'https://example.com/material-launcher-original', creator: 'E2E', content_type: 'article', status: 'active' }]) })
await requestMaterialJson('/recommendations/action', { method: 'POST', body: JSON.stringify({ id: 'material_launcher_source', status: 'active', notebook_url: 'https://notebooklm.google.com/notebook/material-launcher' }) })
await requestMaterialJson('/notebooklm/learning/receipts', { method: 'POST', body: JSON.stringify({ kind: 'source', recommendation_id: 'material_launcher_source', notebook_id: 'material-launcher', notebook_url: 'https://notebooklm.google.com/notebook/material-launcher', status: 'pending' }) })
await requestMaterialJson('/notebooklm/learning/receipts', { method: 'POST', body: JSON.stringify({ kind: 'source', recommendation_id: 'material_launcher_source', notebook_id: 'material-launcher', notebook_url: 'https://notebooklm.google.com/notebook/material-launcher', status: 'indexed', provider_source_id: 'provider-material-source' }) })
const materialNotebookPlan = await requestMaterialJson('/notebooklm/learning/route', { method: 'POST', body: JSON.stringify({ recommendation_id: 'material_launcher_source' }) })
await requestMaterialJson('/notebooklm/learning/receipts', { method: 'POST', body: JSON.stringify({ kind: 'artifact', recommendation_id: 'material_launcher_source', notebook_id: 'material-launcher', notebook_url: 'https://notebooklm.google.com/notebook/material-launcher', plan_id: materialNotebookPlan.plan_id, format: 'quiz', status: 'pending', provider_task_id: 'provider-material-quiz-task', source_grounded: true, custom_prompt_applied: true }) })
await requestMaterialJson('/notebooklm/learning/receipts', { method: 'POST', body: JSON.stringify({ kind: 'artifact', recommendation_id: 'material_launcher_source', notebook_id: 'material-launcher', notebook_url: 'https://notebooklm.google.com/notebook/material-launcher', plan_id: materialNotebookPlan.plan_id, format: 'quiz', status: 'ready', provider_artifact_id: 'provider-material-quiz', source_grounded: true, custom_prompt_applied: true, question_count: 6, hints_before_explanations: true, transfer_question_count: 1 }) })
await requestMaterialJson(`/learning/core/threads/${materialThread.id}/lessons/${materialLesson.id}/sources`, { method: 'POST', body: JSON.stringify({ recommendation_id: 'material_launcher_source', branch_id: 'fixture-branch-id', role: 'primary', expected_contribution: 'Explain the source through a verified reading companion.', position: 0 }) })
const materialPairId = 'material-launcher-pair'
const materialHtmlUpload = new FormData()
materialHtmlUpload.append('file', new Blob(['<!doctype html><html lang="ar" dir="rtl"><body><main><h1>رفيق القراءة</h1></main></body></html>'], { type: 'text/html' }), 'material-launcher.html')
materialHtmlUpload.append('metadata', JSON.stringify({ recommendation_id: 'material_launcher_source', pair_id: materialPairId, role: 'html', recommended_start: 'html', revision: '2', language: 'ar' }))
const materialHtmlResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', headers: { 'x-real-ip': 'e2e-learning-materials' }, body: materialHtmlUpload })
const materialHtml = await materialHtmlResponse.json()
if (!materialHtmlResponse.ok) throw new Error(`material launcher HTML upload failed: ${JSON.stringify(materialHtml)}`)
const materialPdfUpload = new FormData()
materialPdfUpload.append('file', new Blob(['%PDF-1.4\n% material launcher fixture\n'], { type: 'application/pdf' }), 'material-launcher.pdf')
materialPdfUpload.append('metadata', JSON.stringify({ recommendation_id: 'material_launcher_source', pair_id: materialPairId, role: 'pdf', recommended_start: 'html', revision: '2', language: 'ar', page_count: 12 }))
const materialPdfResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', headers: { 'x-real-ip': 'e2e-learning-materials' }, body: materialPdfUpload })
const materialPdf = await materialPdfResponse.json()
if (!materialPdfResponse.ok) throw new Error(`material launcher PDF upload failed: ${JSON.stringify(materialPdf)}`)
await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/l/${materialLesson.id}`, { waitUntil: 'networkidle' })
await page.locator('.course-lesson-page').waitFor({ state: 'visible', timeout: 15000 })
if (!(await page.getByRole('heading', { level: 2, name: 'Start the Level first' }).count()) || (await page.getByRole('button', { name: 'Mark lesson complete' }).isEnabled())) throw new Error('Lesson deep link bypassed the explicit Level start gate')
const blockedLessonUpdate = await fetch(`${baseUrl}/learning/core/threads/${materialThread.id}/lessons/${materialLesson.id}`, { method: 'PATCH', headers: { ...materialHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })
if (blockedLessonUpdate.status !== 409) throw new Error('API allowed Lesson completion before its Level was started')
await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/v/${materialStage.id}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Start Level' }).click()
await page.getByText('In progress', { exact: true }).first().waitFor({ state: 'visible' })
await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/l/${materialLesson.id}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Start lesson' }).click()
await page.getByRole('button', { name: 'Mark lesson complete' }).waitFor({ state: 'visible' })
await page.locator('.course-level-materials > summary').click()
for (const ownedMaterial of ['Lesson-owned observation', 'lesson-owned.txt', 'Which scope owns this card?']) if (!(await page.getByText(ownedMaterial, { exact: true }).count())) throw new Error(`Lesson workspace omitted ${ownedMaterial}`)
const primaryMaterial = page.locator('.course-material-primary')
if (await primaryMaterial.count() !== 1 || (await primaryMaterial.getAttribute('href')) !== `/artifacts/${materialHtml.id}`) throw new Error('Lesson launcher did not make the recommended HTML companion the single primary action')
const primaryMaterialText = await primaryMaterial.innerText()
const normalizedPrimaryMaterialText = primaryMaterialText.toLowerCase()
if (!normalizedPrimaryMaterialText.includes('recommended start') || !normalizedPrimaryMaterialText.includes('read the html companion') || !normalizedPrimaryMaterialText.includes('arabic') || !normalizedPrimaryMaterialText.includes('revision 2')) throw new Error(`Lesson launcher omitted primary purpose or metadata: ${primaryMaterialText}`)
const materialAlternatives = page.locator('.course-material-option')
if (await materialAlternatives.count() !== 3) throw new Error('Lesson launcher did not retain Original, PDF, and NotebookLM as alternatives')
const materialLauncherText = await page.locator('.course-material-launcher').innerText()
for (const copy of ['Read at the original source.', 'Read or annotate the exact A4 print edition on a tablet.', 'Open the Quiz made from this source.', 'Ready', '12 pages']) {
  if (!materialLauncherText.toLowerCase().includes(copy.toLowerCase())) throw new Error(`Lesson launcher is missing purpose or metadata: ${copy}. Rendered: ${materialLauncherText}`)
}
if (await page.locator('.course-source-links, .course-sources .folio-file-badge').count()) throw new Error('Lesson launcher still renders the old equal material badges')
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/l/${materialLesson.id}`, { waitUntil: 'networkidle' })
if (!(await page.locator('.course-material-primary').isVisible()) || await page.locator('.course-material-option').count() !== 3) throw new Error('Lesson launcher lost its primary action or alternatives on mobile')
if (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) > 2) throw new Error('Lesson material launcher introduced mobile horizontal overflow')
await page.setViewportSize({ width: 1440, height: 900 })
for (const artifact of [materialHtml, materialPdf, materialLessonFile]) {
  const cleanup = await fetch(`${baseUrl}/artifacts/${artifact.id}`, { method: 'DELETE', headers: { 'x-real-ip': 'e2e-learning-materials' } })
  if (!cleanup.ok) throw new Error(`material launcher fixture cleanup failed for ${artifact.id}`)
}
const [capabilities, systemInventory] = await Promise.all([
  requestJson('/agent/capabilities'),
  requestJson('/agent/system'),
])
if (!capabilities.capabilities?.some((operation) => operation.method === 'GET' && operation.path === '/agent/system')) throw new Error('agent capabilities omitted the System inventory route')
if (!Array.isArray(systemInventory.schedule) || systemInventory.schedule.length !== 1 || systemInventory.schedule[0].cron !== '0 */6 * * *') throw new Error('System inventory omitted the configured maintenance schedule')
if (!Array.isArray(systemInventory.on_demand_only) || !systemInventory.storage?.length || !systemInventory.safety?.length) throw new Error('System inventory contract is incomplete')
await page.goto(`${baseUrl}/#/settings?mode=system`, { waitUntil: 'networkidle' })
await page.locator('.system-console').waitFor({ state: 'visible', timeout: 15000 })
if (await page.locator('.api-operation-list article').count() !== capabilities.capabilities.length) throw new Error('System page does not expose every allow-listed API operation')
await page.getByLabel('Search path or capability').fill('schedule')
if (await page.locator('.api-operation-list article').count() < 1) throw new Error('System API search did not return matching operations')
await page.getByLabel('Search path or capability').fill('')
await page.goto(`${baseUrl}/#/settings`, { waitUntil: 'networkidle' })
await page.locator('.profile-settings-page').waitFor({ state: 'visible' })
const profileBody = await page.locator('.workspace-canvas').innerText()
for (const value of ['Profile rendering fixture', 'Deep systems thinking', 'Reaction style', 'Priorities', 'Mastered knowledge', 'Exclusions', 'Learned patterns', 'Creator history', 'Taste affinities', 'Recent reflections', 'Recent ratings']) {
  if (!profileBody.toLowerCase().includes(value.toLowerCase())) throw new Error(`profile page is missing rendered value or section: ${value}`)
}
if (!profileBody.includes('Readable fixture branch') || profileBody.includes('fixture-branch-id')) throw new Error(`profile taste affinities leaked an internal branch id instead of the branch label (label=${profileBody.includes('Readable fixture branch')}, id=${profileBody.includes('fixture-branch-id')})`)
if (profileBody.includes('Priority topics configured.')) throw new Error('profile page still renders the fake priority placeholder')
if (profileBody.includes('{"malformed":')) throw new Error('profile page exposed raw JSON in its normal view')
if (await page.locator('.profile-tag-list').count() < 1) throw new Error('profile page did not render visual topic tags')
if (await page.locator('.profile-settings-page .profile-record').count() < 1) throw new Error('profile records did not render')
const [settings, manifest, artifacts, feeds, manualArchive, proposals, cards, momentum, balance] = await Promise.all([
  fetch(`${baseUrl}/settings`).then((response) => response.json()),
  fetch(`${baseUrl}/manifest.json`).then((response) => response.json()),
  fetch(`${baseUrl}/artifacts`).then((response) => response.json()),
  fetch(`${baseUrl}/capture/feeds`).then((response) => response.json()),
  fetch(`${baseUrl}/recommendations/list?source=manual`).then((response) => response.json()),
  fetch(`${baseUrl}/feedback/proposals`).then((response) => response.json()),
  fetch(`${baseUrl}/learning/srs/cards`).then((response) => response.json()),
  fetch(`${baseUrl}/dashboard/briefing`).then((response) => response.json()),
  fetch(`${baseUrl}/learning/balance?window=90`).then((response) => response.json()),
])
if (settings.resolved?.learning?.retention !== 90 || settings.resolved?.learning?.queue_cap !== 5) throw new Error('settings defaults are not resolved')
if (settings.resolved?.srs_drafts?.minimum_rating !== 7 || settings.resolved?.profile_proposals?.review_required !== true || settings.resolved?.profile_automation?.mode !== 'manual' || settings.resolved?.recommendation_engine?.mode !== 'shadow') throw new Error('learning automation defaults are incorrect')
if (manifest.id !== '/' || manifest.start_url !== '/#/home' || manifest.display !== 'standalone') throw new Error('manifest is missing the Android standalone launch contract')
if (!manifest.icons?.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png')) throw new Error('manifest is missing the 192px Android launcher icon')
if (!manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png')) throw new Error('manifest is missing the 512px Android launcher icon')
if (!manifest.icons?.some((icon) => icon.purpose === 'maskable')) throw new Error('manifest is missing a maskable Android launcher icon')
if (manifest.share_target?.action !== '/api/share-target') throw new Error('manifest lost the Android source share target')
if (!manifest.shortcuts?.some((shortcut) => shortcut.url?.includes('action=capture'))) throw new Error('manifest is missing the Android Capture shortcut')
if (await page.locator('link[rel="manifest"][href="/manifest.json"]').count() !== 1) throw new Error('application shell does not link the install manifest')
await page.evaluate(() => navigator.serviceWorker?.ready)
if (await page.evaluate(() => document.documentElement.dataset.serviceWorker) !== 'ready') throw new Error('application shell did not register its service worker')
const offlineCompanionUpload = new FormData()
offlineCompanionUpload.append('file', new Blob(['<!doctype html><html><head><title>Offline companion fixture</title></head><body><main><h1>Offline companion fixture</h1><p>Exact cached reading body.</p></main></body></html>'], { type: 'text/html' }), 'offline-companion.html')
const offlineCompanionResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', body: offlineCompanionUpload })
const offlineCompanion = await offlineCompanionResponse.json()
if (!offlineCompanionResponse.ok) throw new Error(`offline HTML companion upload failed: ${JSON.stringify(offlineCompanion)}`)
const offlineCompanionPath = `/artifacts/${offlineCompanion.id}`
await page.goto(`${baseUrl}${offlineCompanionPath}`, { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'Offline companion fixture' }).waitFor({ state: 'visible' })
await page.waitForFunction(async (path) => Boolean(await (await caches.open('learning-compass-html-artifacts-v1')).match(path)), offlineCompanionPath)
await page.context().setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'Offline companion fixture' }).waitFor({ state: 'visible' })
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'domcontentloaded' })
await page.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
await page.context().setOffline(false)
const offlineCompanionDelete = await fetch(`${baseUrl}${offlineCompanionPath}`, { method: 'DELETE' })
if (!offlineCompanionDelete.ok) throw new Error('offline HTML companion fixture cleanup failed')
await page.goto(`${baseUrl}/#/library?mode=catalog&focus=all&action=capture`, { waitUntil: 'networkidle' })
await page.locator('.capture-dialog').waitFor({ state: 'visible' })
await page.getByRole('button', { name: 'Close capture dialog' }).click()
await page.locator('.capture-dialog').waitFor({ state: 'detached' })
if (!page.url().includes('#/library?mode=catalog&focus=all') || page.url().includes('action=capture')) throw new Error('Android Capture shortcut did not return to All sources')
if (!Array.isArray(artifacts.artifacts)) throw new Error('artifact library contract is invalid')
if (!Array.isArray(feeds.feeds)) throw new Error('feed subscriptions contract is invalid')
if (!Array.isArray(manualArchive.recommendations)) throw new Error('manual archive contract is invalid')
if (!Array.isArray(balance.branches) || balance.window_days !== 90 || !balance.portfolio) throw new Error('learning balance contract is invalid')
if (!Array.isArray(proposals.proposals)) throw new Error('feedback proposal contract is invalid')
if (!Array.isArray(cards.cards)) throw new Error('SRS card management contract is invalid')
if (!Array.isArray(momentum.active_items) || !Array.isArray(momentum.artifacts) || !momentum.momentum || !momentum.insight || !momentum.next_action_detail || !Array.isArray(momentum.recent_wins)) throw new Error('Momentum workspace contract is invalid')
if (balance.branches?.[0]?.id) {
  const branchId = encodeURIComponent(String(balance.branches[0].id))
  await page.goto(`${baseUrl}/#/map/branch/${branchId}`, { waitUntil: 'networkidle' })
  if (await page.locator('.object-inspector').count() !== 1 || !(await page.locator('.inspector-route').innerText()).includes(`/map/branch/${balance.branches[0].id}`)) throw new Error('typed map branch route did not open its inspector plumbing')
}
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
await page.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
const homeBody = await page.locator('.workspace-canvas').innerText()
for (const value of ['Current source', 'Active Thread', 'Queue', 'RSS Feeds', 'Capture signal']) {
  if (!homeBody.toLowerCase().includes(value.toLowerCase())) throw new Error(`Home is missing ${value}: ${homeBody}`)
}
if (await page.locator('.folio-home-focus').count() !== 1) throw new Error('Home must expose exactly one current-source focus')
if (await page.locator('.folio-home-capture-signal').count() !== 1) throw new Error('Home must expose its capture signal')

await page.goto(`${baseUrl}/#/library?mode=assets&focus=files`, { waitUntil: 'networkidle' })
if (artifacts.artifacts.length === 0) {
  await page.locator('.folio-files-view .state-empty').waitFor({ state: 'visible', timeout: 15000 })
} else {
  await page.locator('.folio-files-view').waitFor({ state: 'visible', timeout: 15000 })
  if (!(await page.locator('.folio-files-view').innerText()).includes('Generated companions')) throw new Error('Files view is missing its library header')
  if (await page.locator('.folio-file-record').count() < 1) throw new Error('Files view did not render the artifact groups')
}

const captured = await requestJson('/capture', { method: 'POST', body: JSON.stringify({ source: 'https://example.com/hermes-e2e', title: 'Hermes automation test' }) })
const [capturedSources, queueBeforeTriage] = await Promise.all([requestJson('/capture'), requestJson('/capture/queue')])
if (!capturedSources.items.some((item) => item.id === captured.id)) throw new Error('new capture did not enter All sources')
if (queueBeforeTriage.items.some((item) => item.id === captured.id)) throw new Error('new capture bypassed deliberate triage and entered Queue')
const preRecord = await requestJson(`/capture/${captured.id}/record`)
if (!preRecord.item) throw new Error('source record API did not return the captured source')
const thread = await requestJson('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title: 'Test a decision with evidence', thread_type: 'decide', guiding_question: 'Should this mechanism be used?', definition_of_done: 'Record a source-backed decision and synthesis.', activate: true }) })
await requestJson(`/capture/${captured.id}/branch-map`, { method: 'POST', body: JSON.stringify({ branch_id: 'fixture-branch-id', confidence: 'high', reason: 'E2E fixture mapping before Queue placement' }) })
await requestJson(`/capture/${captured.id}/triage`, { method: 'POST', body: JSON.stringify({ action: 'queue', thread_id: thread.id }) })
await requestJson(`/learning/core/threads/${thread.id}/sources`, { method: 'POST', body: JSON.stringify({ recommendation_id: captured.id, role: 'primary', expected_contribution: 'Supply the mechanism and its limits.' }) })
await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(captured.id)}`, { waitUntil: 'networkidle' })
await page.locator('.folio-object-view').waitFor({ state: 'visible', timeout: 15000 })
if (!(await page.getByRole('heading', { name: 'Source access' }).isVisible())) throw new Error('typed source route is missing source access')
if (!page.url().includes(`#/library/source/${captured.id}`)) throw new Error('typed source route did not preserve the captured source identity')
if (await page.locator('.object-inspector').count()) throw new Error('typed source route rendered a redundant side inspector beside its full-page record')
const started = await requestJson('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: captured.id, thread_id: thread.id, target_kind: 'original' }) })
const returned = await requestJson(`/sessions/${started.session_id}/return`, { method: 'POST', body: JSON.stringify({ reflection: 'The mechanism is useful and I will apply it.', rating: 7, disposition: 'apply', complete: true, auto_enqueue: true }) })
if (returned.status !== 'completed' || returned.disposition !== 'apply' || !returned.reflection_note_id || !returned.recall_eligible || !returned.consolidation?.id) throw new Error('explicit application disposition did not start consolidation')
const sourceRecord = await requestJson(`/capture/${captured.id}/record`)
if (!sourceRecord.notes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content.includes('The mechanism is useful')))) throw new Error('source record did not return the exact reflection')
const initialJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter((job) => job.payload.recommendation_id === captured.id)
if (initialJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 || initialJobs.filter((job) => job.job_type === 'extract_notes').length !== 1) throw new Error('rating 7 did not queue exactly one feedback and extraction job')
const claim = async (jobType) => {
  const job = (await requestJson('/agent/jobs?status=pending')).jobs.find((item) => item.job_type === jobType)
  if (!job) throw new Error(`missing pending ${jobType} job`)
  return (await requestJson(`/agent/jobs/${job.id}/claim`, { method: 'POST', body: JSON.stringify({ worker: 'e2e' }) })).job
}
const feedbackJob = await claim('process_feedback')
const feedbackCompletion = await requestJson(`/agent/jobs/${feedbackJob.id}/complete`, { method: 'POST', body: JSON.stringify({ worker: 'e2e', proposals: [{ change_type: 'profile_signal', target_label: 'Learning priority', current: 'old', proposed: 'new', evidence: 'The reflection explicitly values the mechanism.', reasoning: 'Positive signal at rating 7.', confidence: 0.9 }] }) })
const proposalId = feedbackCompletion.proposals?.created?.[0]
const pendingProposal = (await requestJson('/feedback/proposals')).proposals.find((proposal) => proposal.id === proposalId)
if (pendingProposal?.status !== 'pending' || pendingProposal?.decision_source != null) throw new Error('manual profile automation did not hold the proposal for review')
await requestJson(`/feedback/proposals/${proposalId}/approve`, { method: 'POST' })
const appliedProposal = (await requestJson('/feedback/proposals')).proposals.find((proposal) => proposal.id === proposalId)
if (appliedProposal?.status !== 'applied' || appliedProposal?.decision_source !== 'user') throw new Error('approved proposal did not apply through the profile policy')
const agentContextAfterApply = await requestJson('/agent/context')
if (!agentContextAfterApply.profile?.assertions?.some((assertion) => assertion.assertion_key === appliedProposal.validation?.assertion_key)) throw new Error('agent context omitted the typed adaptive profile')
const feedbackContextAfterApply = await requestJson('/feedback/context')
if (!feedbackContextAfterApply.profile_assertions?.some((assertion) => assertion.assertion_key === appliedProposal.validation?.assertion_key)) throw new Error('Taste Mapper context omitted the typed adaptive profile')
await requestJson(`/feedback/proposals/${proposalId}/revert`, { method: 'POST' })
const revertedProposal = (await requestJson('/feedback/proposals')).proposals.find((proposal) => proposal.id === proposalId)
if (revertedProposal?.status !== 'reverted') throw new Error('Activity did not revert the automatic profile change')
if ((await requestJson('/agent/jobs?status=pending')).jobs.some((job) => job.job_type === 'apply_feedback_proposal')) throw new Error('proposal approval created a redundant application job')
const extractJob = await claim('extract_notes')
const sourceNoteBody = `The fixture preserves one complete source-shaped note instead of imposing generic Foundation or Case Study sections. It explains the test mechanism in source order, keeps its limitation visible, and gives the retained idea one exact locator. The mechanism requires checking available evidence before applying a rule; otherwise confidence outruns the source. The note stays readable prose rather than a collection of generated cards.\n\n> الفكرة الأساسية هي مراجعة الدليل المتاح قبل تطبيق الآلية.\n\nThe source-specific limitation is that this fixture demonstrates the contract rather than a real-world causal result.`
const sourceNoteWordCount = sourceNoteBody.match(/[\p{L}\p{N}]+/gu)?.length || 0
await requestJson(`/agent/jobs/${extractJob.id}/complete`, { method: 'POST', body: JSON.stringify({ worker: 'e2e',
  extraction: { contract: 'source_note_v2', complete: true, adapter: 'direct_text', source_hash: 'a'.repeat(64), source_word_count: 200, note_word_count: sourceNoteWordCount, coverage_status: 'complete' },
  note: { id: 'e2e_source_note', recommendation_id: captured.id, title: 'Hermes extraction fixture', kind: 'guide', abstract: 'A source-shaped extraction contract fixture.', source_url: 'https://example.com/hermes-e2e', sections: [
    { section_key: 'body', label: 'Source note', content: sourceNoteBody },
  ] },
  srs_drafts: [{ id: 'e2e_draft', unit_id: 'e2e_unit', card_type: 'decision', question: 'What should be checked before applying the mechanism?', answer: 'Check the available source evidence and its limits.', topic: 'Testing', source_anchor: 'Fixture body' }],
  recall: { status: 'drafted', count: 1 },
  learning_units: [{ id: 'e2e_unit', unit_type: 'method', statement: 'Check the available evidence before applying the mechanism.', user_synthesis: 'I should test the evidence before using it.', stance: 'accept', confidence: 0.9, role: 'core', anchors: [{ anchor_type: 'section', locator: 'Fixture body', excerpt: 'checking available evidence before applying a rule' }] }],
  reflection: { content: 'Handwritten margin note from page 2.', recommendation_id: captured.id, source_url: 'https://example.com/hermes-e2e' },
}) })
const extractedNotes = (await requestJson('/notes')).notes
if (!extractedNotes.some((note) => note.id === 'e2e_source_note') || !extractedNotes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content.includes('Handwritten margin note')))) throw new Error('extractor did not keep source note and handwritten reflection separate')
const guideNotes = (await requestJson('/notes?kind=guide')).notes
if (!guideNotes.some((note) => note.id === 'e2e_source_note') || guideNotes.some((note) => note.kind === 'reflection')) throw new Error('guide notes library leaked reflections into the extracted scope')
const consolidatedRecord = await requestJson(`/capture/${captured.id}/record`)
if (consolidatedRecord.consolidation?.state !== 'closed' || !consolidatedRecord.learning_units.some((unit) => unit.id === 'e2e_unit' && unit.anchors.length === 1) || !consolidatedRecord.threads.some((item) => item.id === thread.id)) throw new Error('learning core did not preserve the thread, anchored unit, and terminal consolidation receipt')
await requestJson(`/learning/core/threads/${thread.id}`, { method: 'PATCH', body: JSON.stringify({ final_synthesis: 'The mechanism is useful only when its failure modes are checked first.' }) })
const verifiedThread = await requestJson(`/learning/core/threads/${thread.id}/verify`, { method: 'POST' })
if (verifiedThread.status !== 'verified') throw new Error('Thread did not verify')
await page.goto(`${baseUrl}/#/learn?mode=practice&focus=notes`, { waitUntil: 'networkidle' })
await page.locator('.note-ledger-copy strong', { hasText: 'Hermes extraction fixture' }).waitFor({ state: 'visible', timeout: 15000 })
if (await page.getByText('Handwritten margin note').count()) throw new Error('Notes library leaked personal reflection content into the extracted library')
await page.goto(`${baseUrl}/#/learn/note/e2e_source_note`, { waitUntil: 'networkidle' })
await page.locator('.folio-note-reading').waitFor({ state: 'visible', timeout: 15000 })
if ((await page.locator('.folio-reading-body').innerText()).includes('status/completed')) throw new Error('note reader leaked source front matter into the reading surface')
if (await page.locator('.folio-reading-copy [dir="rtl"]').count() < 1) throw new Error('note reader did not preserve Arabic reading direction')
if (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) > 2) throw new Error('note reader introduced horizontal overflow')
await page.getByRole('button', { name: 'Edit note' }).first().click()
await page.locator('.folio-note-document').waitFor({ state: 'visible', timeout: 15000 })
await page.getByRole('heading', { name: 'Foundation' }).waitFor({ state: 'visible', timeout: 15000 })
if (await page.locator('.folio-note-meta a').count() !== 1) throw new Error('typed note route is missing its source context link')
if (await page.locator('.folio-note-meta a').getAttribute('href') !== 'https://example.com/hermes-e2e') throw new Error('note source context did not preserve the canonical external source URL')
const draft = (await requestJson('/srs/drafts')).drafts.find((item) => item.id)
if (!draft || draft.status !== 'draft') throw new Error('rating 7 did not create an editable card draft')
await requestJson(`/srs/drafts/${draft.id}/approve`, { method: 'POST' })
const activeCards = (await requestJson('/learning/srs/cards')).cards
if (!activeCards.length) throw new Error('approved draft did not become an active card')
await requestJson(`/learning/srs/cards/${activeCards[0].id}`, { method: 'DELETE' })
if ((await requestJson('/learning/srs/cards')).cards.some((card) => card.id === activeCards[0].id)) throw new Error('active card deletion failed')
const lower = await requestJson('/capture', { method: 'POST', body: JSON.stringify({ source: 'https://example.com/lower-rating', title: 'Lower rating test' }) })
const lowerSession = await requestJson('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: lower.id }) })
await requestJson(`/sessions/${lowerSession.session_id}/return`, { method: 'POST', body: JSON.stringify({ reflection: 'Useful context but not worth extracting.', rating: 5, disposition: 'reference', complete: true }) })
const lowerJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter((job) => job.payload.recommendation_id === lower.id)
if (lowerJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 || lowerJobs.some((job) => job.job_type === 'extract_notes')) throw new Error('lower rating feedback/extraction gate is incorrect')
const progress = await requestJson('/capture', { method: 'POST', body: JSON.stringify({ source: 'https://example.com/in-progress-feedback', title: 'In-progress feedback test' }) })
const progressSession = await requestJson('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: progress.id }) })
const progressReturn = await requestJson(`/sessions/${progressSession.session_id}/return`, { method: 'POST', body: JSON.stringify({ reflection: 'I am still reading, but this point matters.', complete: false }) })
if (progressReturn.status !== 'returned') throw new Error('in-progress feedback incorrectly completed the source')
const progressJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter((job) => job.payload.recommendation_id === progress.id)
if (progressJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 || progressJobs.some((job) => job.job_type === 'extract_notes')) throw new Error('in-progress feedback did not queue analysis cleanly')
const atomicFeedback = await requestJson('/feedback/record', { method: 'POST', body: JSON.stringify({ source_url: 'https://example.com/atomic-feedback', title: 'Atomic feedback test', feedback: 'Preserve these exact words.', score: 8, completion_state: 'completed', reason_tags: ['practical', 'revisit'], expected: 'A useful mechanism.', actual: 'Useful and concrete.', effort: 'deep', length_minutes: 45 }) })
if (atomicFeedback.preserved_feedback !== 'Preserve these exact words.' || atomicFeedback.completion_state !== 'completed' || !atomicFeedback.feedback_job || !atomicFeedback.extraction_job || atomicFeedback.receipt?.analysis !== 'queued' || atomicFeedback.receipt?.notes !== 'queued' || !atomicFeedback.source_page.includes(atomicFeedback.source.id)) throw new Error('atomic feedback receipt is incomplete')
const atomicRecord = await requestJson(`/capture/${atomicFeedback.source.id}/record`)
if (!atomicRecord.notes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content === 'Preserve these exact words.'))) throw new Error('atomic feedback did not preserve exact words')
const atomicStructuredFeedback = JSON.parse(atomicRecord.item.source_metadata_json || '{}').learning_feedback
if (atomicStructuredFeedback?.score !== 8 || atomicStructuredFeedback?.effort !== 'deep' || atomicStructuredFeedback?.length_minutes !== 45 || atomicStructuredFeedback?.expected !== 'A useful mechanism.' || !atomicStructuredFeedback?.reason_tags?.includes('revisit')) throw new Error('structured feedback was not preserved on the source record')
const stoppedWithoutReason = await fetch(`${baseUrl}/feedback/record`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recommendation_id: atomicFeedback.source.id, feedback: 'I stopped here.', completion_state: 'stopped' }) })
if (stoppedWithoutReason.status !== 400 || (await stoppedWithoutReason.json()).error !== 'stopped_reason_required') throw new Error('stopped feedback accepted without an explicit reason')
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(atomicFeedback.source.id)}`, { waitUntil: 'networkidle' })
await page.locator('.source-feedback-panel').waitFor({ state: 'visible', timeout: 15000 })
if (await page.locator('.source-feedback-segments label').count() !== 3) throw new Error('feedback ledger does not expose the three honest completion states')
if (await page.locator('.source-feedback-panel textarea').count() < 3) throw new Error('feedback ledger is missing reflection or expectation/result fields')
const feedbackMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (feedbackMobileOverflow > 2) throw new Error(`feedback ledger mobile overflow ${feedbackMobileOverflow}px`)
await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(progress.id)}`, { waitUntil: 'networkidle' })
const progressFeedbackPanel = page.locator('.source-feedback-panel')
await progressFeedbackPanel.waitFor({ state: 'visible', timeout: 15000 })
await progressFeedbackPanel.locator('input[type="radio"][value="in_progress"]').check()
await progressFeedbackPanel.getByRole('group', { name: 'Why continue later?' }).locator('label').filter({ hasText: /^Continue later$/ }).click()
await progressFeedbackPanel.getByRole('textbox', { name: /Your reflection/ }).fill('Continue when I have a focused reading block.')
const feedbackWriteResponse = page.waitForResponse((response) => response.url().endsWith('/feedback/record') && response.request().method() === 'POST')
await progressFeedbackPanel.getByRole('button', { name: 'Save feedback' }).click()
if (!(await feedbackWriteResponse).ok()) throw new Error('continue-later feedback write failed')
const neutralReceipt = progressFeedbackPanel.locator('.source-feedback-receipt')
await neutralReceipt.waitFor({ state: 'visible', timeout: 15000 })
const neutralReceiptText = await neutralReceipt.innerText()
if (!neutralReceiptText.includes('Feedback saved.') || !neutralReceiptText.includes('neutral timing signal') || !neutralReceiptText.includes('will not count as bad fit')) throw new Error('continue-later feedback did not render an honest neutral receipt')
const savedProgressRecord = await requestJson(`/capture/${progress.id}/record`)
const savedProgressFeedback = JSON.parse(savedProgressRecord.item.source_metadata_json || '{}').learning_feedback
if (savedProgressFeedback?.completion_state !== 'in_progress' || !savedProgressFeedback?.reason_tags?.includes('not_now') || savedProgressFeedback?.disposition !== 'undecided') throw new Error('continue-later UI did not persist its structured neutral feedback')
await page.setViewportSize({ width: 900, height: 1200 })
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
if (!(await page.locator('.mobile-dock').isVisible()) || !(await page.locator('.mobile-utilities').isVisible())) throw new Error('tablet shell did not replace the desktop rail with dock and utilities')
if (await page.locator('.root-rail').isVisible()) throw new Error('desktop root rail remains visible at tablet width')
const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (tabletOverflow > 2) throw new Error(`tablet Home horizontal overflow ${tabletOverflow}px`)
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
if (!(await page.locator('.mobile-dock').isVisible())) throw new Error('mobile primary navigation is not visible')
if (await page.locator('.root-rail').isVisible()) throw new Error('desktop root rail remains visible on mobile')
if (!(await page.locator('.mobile-utilities').isVisible()) || await page.locator('.mobile-utilities button').count() !== 2) throw new Error('mobile shell is missing compact Search and Capture tools')
if (await page.locator('.folio-home-header > .folio-button').isVisible()) throw new Error('mobile Home repeats the global Capture action')
if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count()) throw new Error('mobile shell rendered a redundant navigation sheet or context pane')
const mobileRootHrefs = await page.locator('.mobile-dock a').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')))])
if (mobileRootHrefs.length !== roots.length || roots.some((root) => !mobileRootHrefs.includes(`#/${root}`))) throw new Error('mobile dock does not expose the five stable roots')

await page.goto(`${baseUrl}${publicLearningUpdatePath}`, { waitUntil: 'networkidle' })
const updateMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (updateMobileOverflow > 2) throw new Error(`public learning update mobile overflow ${updateMobileOverflow}px`)
const updateMobileAction = await page.getByRole('link', { name: 'Open Learn' }).first().boundingBox()
if (!updateMobileAction || updateMobileAction.height < 44) throw new Error('public learning update mobile action is smaller than 44px')
if (!(await page.locator('.source-folio').isVisible()) || await page.locator('.format-row').count() !== 4) throw new Error('public learning update loses its material explanation on mobile')
const updateMobileScreenshot = await page.screenshot({ path: join(persistDir, 'learning-materials-update-mobile.png'), fullPage: true })
if (!updateMobileScreenshot.length) throw new Error('public learning update mobile screenshot was empty')
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
for (const route of modeRoutes) {
  await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
  await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
  if (!(await page.locator('.mobile-dock').isVisible())) throw new Error(`${route.href}: mobile dock disappeared`)
  if (await page.locator('.mobile-dock a').count() !== roots.length) throw new Error(`${route.href}: mobile dock does not contain exactly five items`)
  if (route.root !== 'home' && (await page.locator('.workspace-mode-switcher').count() !== 1 || !(await page.locator('.workspace-mode-switcher').isVisible()))) throw new Error(`${route.href}: internal mode controls are missing on mobile`)
  if (route.root === 'library' && route.mode !== 'assets' && await page.locator('.workspace-filter-switcher').count() !== 1) throw new Error(`${route.href}: Library filter controls are missing on mobile`)
  if ((route.root === 'learn' && (route.mode === 'canon' || route.mode === 'practice')) || (route.root === 'map' && route.mode === 'review') || (route.root === 'settings' && route.mode === 'personal')) {
    if (await page.locator('.workspace-filter-switcher').count() !== 1) throw new Error(`${route.href}: focus controls are missing on mobile`)
  }
  if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count()) throw new Error(`${route.href}: mobile rendered a redundant navigation sheet`)
}
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (mobileOverflow > 2) throw new Error(`mobile Home horizontal overflow ${mobileOverflow}px`)
const mobileScreenshot = await page.screenshot({ path: join(persistDir, 'home-mobile.png') })
if (!mobileScreenshot.length) throw new Error('mobile visual smoke screenshot was empty')
await page.getByRole('link', { name: 'Map' }).click()
if (!page.url().includes('#/map')) throw new Error('mobile dock did not navigate to Map')

await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
await page.context().setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
if (!(await page.locator('.mobile-dock').isVisible())) throw new Error('offline Android shell lost its primary navigation')
await page.context().setOffline(false)

const androidPage = await browser.newPage({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
})
await androidPage.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
await androidPage.evaluate(() => {
  const event = new Event('beforeinstallprompt')
  Object.assign(event, {
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
  })
  window.dispatchEvent(event)
})
await androidPage.locator('.android-install-banner').waitFor({ state: 'visible' })
if (await androidPage.getByRole('button', { name: 'Install app' }).count() !== 1 || await androidPage.getByRole('button', { name: 'Not now' }).count() !== 1) throw new Error('Android install card is missing its explicit install and dismissal actions')
await androidPage.getByRole('button', { name: 'Not now' }).click()
await androidPage.locator('.android-install-banner').waitFor({ state: 'detached' })
await androidPage.evaluate(() => navigator.serviceWorker.ready)
await androidPage.context().setOffline(true)
await androidPage.reload({ waitUntil: 'domcontentloaded' })
await androidPage.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
await androidPage.context().setOffline(false)
await androidPage.close()

console.log(`E2E passed: five root destinations, ${count} internal mode states, typed objects, Android shell/HTML offline behavior, and mobile shell`)
} finally {
  await browser?.close()
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
