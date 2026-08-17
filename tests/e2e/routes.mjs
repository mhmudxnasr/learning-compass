import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')

const roots = ['home', 'library', 'learn', 'map', 'settings']
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
  { root: 'library', href: '#/library?mode=triage&focus=inbox', mode: 'triage', focus: 'inbox', expected: '.folio-inbox-view' },
  { root: 'library', href: '#/library?mode=triage&focus=feeds', mode: 'triage', focus: 'feeds', expected: '.folio-feeds-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=all', mode: 'catalog', focus: 'all', expected: '.folio-all-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=books', mode: 'catalog', focus: 'books', expected: '.folio-books-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=collections', mode: 'catalog', focus: 'collections', expected: '.folio-collections-view' },
  { root: 'library', href: '#/library?mode=catalog&focus=archive', mode: 'catalog', focus: 'archive', expected: '.folio-archive-view' },
  { root: 'library', href: '#/library?mode=assets&focus=files', mode: 'assets', focus: 'files', expected: '.folio-files-view' },
  { root: 'learn', href: '#/learn', mode: 'paths', expected: '.folio-paths' },
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

  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', String(port)], {
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

  const requestJson = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    const body = await response.json()
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
    tree_nodes: [{ id: 'fixture-branch-id', type: 'branch', label: 'Readable fixture branch', super_category: 'cat-mind', parent_id: 'root', status: 'love', round_label: 'R1' }],
  }) })
  await requestJson('/brain/profile/sync-swipes', { method: 'POST', body: JSON.stringify({}) })
  const seededProfile = await requestJson('/brain/profile?recent_limit=50')
  if (!seededProfile.profile) throw new Error(`profile fixture did not persist: ${JSON.stringify(seededProfile)}`)

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
  if ((route.root === 'learn' && route.mode === 'practice') || (route.root === 'map' && route.mode === 'review') || (route.root === 'settings' && route.mode === 'personal')) {
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

  await page.goto(`${baseUrl}/#/settings?focus=preferences`, { waitUntil: 'networkidle' })
  for (const section of ['visual-presets-heading', 'theme-section', 'font-section', 'type-controls', 'interface-tokens']) {
    await page.locator(`.settings-jump-nav a[href="#${section}"]`).click()
    await page.waitForTimeout(80)
    const jumpState = await page.evaluate((id) => {
      const canvas = document.querySelector('.workspace-canvas')
      const target = document.getElementById(id)
      return { hash: location.hash, heading: document.querySelector('h1')?.textContent, scrollTop: canvas?.scrollTop || 0, targetTop: target?.getBoundingClientRect().top || 0 }
    }, section)
    if (jumpState.hash !== '#/settings?focus=preferences' || jumpState.heading !== 'Make the learning loop fit you') throw new Error(`preference jump escaped settings route for ${section}: ${JSON.stringify(jumpState)}`)
    if (section !== 'visual-presets-heading' && jumpState.targetTop < -20) throw new Error(`preference jump did not reach ${section}: ${JSON.stringify(jumpState)}`)
  }

  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
const desktopScreenshot = await page.screenshot({ path: join(persistDir, 'home-desktop.png') })
if (!desktopScreenshot.length) throw new Error('desktop visual smoke screenshot was empty')
if (await page.locator('.root-rail nav a').count() !== 5) throw new Error('desktop root rail should expose five destinations')

const legacyAliases = [
  { path: '/today', root: 'home', mode: 'today' },
  { path: '/today/briefing', root: 'home', mode: 'today' },
  { path: '/today/momentum', root: 'home', mode: 'today' },
  { path: '/insights/overview', root: 'home', mode: 'today' },
  { path: '/curate/queue', root: 'library', mode: 'triage', focus: 'queue' },
  { path: '/library/queue', root: 'library', mode: 'triage', focus: 'queue' },
  { path: '/curate/inbox', root: 'library', mode: 'triage', focus: 'inbox' },
  { path: '/library/inbox', root: 'library', mode: 'triage', focus: 'inbox' },
  { path: '/curate/feeds', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/library/feeds', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/curate/rss', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/library/rss', root: 'library', mode: 'triage', focus: 'feeds' },
  { path: '/curate/discovery', root: 'library', mode: 'catalog', focus: 'all' },
  { path: '/library/all', root: 'library', mode: 'catalog', focus: 'all' },
  { path: '/curate/books', root: 'library', mode: 'catalog', focus: 'books' },
  { path: '/library/books', root: 'library', mode: 'catalog', focus: 'books' },
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
    if (alias.focus === 'inbox') return '.folio-inbox-view'
    if (alias.focus === 'feeds') return '.folio-feeds-view'
    if (alias.focus === 'books') return '.folio-books-view'
    if (alias.focus === 'collections') return '.folio-collections-view'
    if (alias.focus === 'archive') return '.folio-archive-view'
    return '.folio-all-view'
  }
  if (alias.root === 'learn') return alias.focus === 'notes' ? '.folio-notes' : alias.focus === 'recall' ? '.folio-recall' : '.folio-paths'
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
const hubFiles = await requestJson(`/artifacts/hub?thread_id=${hubThread.id}`)
if (!hubFiles.files.some((file) => file.id === hubUploadBody.id && file.filename === 'hub-path.txt')) throw new Error('hub files read model omitted the uploaded file')
const globalArtifacts = await requestJson('/artifacts')
if (globalArtifacts.artifacts.some((file) => file.id === hubUploadBody.id)) throw new Error('global files list leaked a hub-owned file')
const hubPathLoaded = await requestJson(`/learning/core/threads/${hubThread.id}/path`)
if (!hubPathLoaded.notes.some((note) => note.id === hubNote.id) || !hubPathLoaded.files.some((file) => file.id === hubUploadBody.id)) throw new Error('path read model omitted path-level notes or files')
if (!hubPathLoaded.stages[0].notes.some((note) => note.id === hubStageNote.id)) throw new Error('path read model omitted stage-level notes')
await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/verify`, { method: 'POST' })
await page.goto(`${baseUrl}/#/learn`, { waitUntil: 'networkidle' })
await page.locator('.folio-paths').waitFor({ state: 'visible' })
if (!(await page.getByRole('link', { name: 'Open learning path Systems Thinking' }).count())) throw new Error('Learn Paths did not render the authored path')
await page.goto(`${baseUrl}/#/learn/thread/${hubThread.id}`, { waitUntil: 'networkidle' })
await page.locator('.folio-thread').waitFor({ state: 'visible' })
await page.locator('.folio-level-toggle').click()
if (!(await page.locator('.folio-stage-row').filter({ hasText: 'Level 0' }).count())) throw new Error('Learn Thread did not render the authored stage workspace')
if (!(await page.getByText('Evidence gate').count()) || !(await page.getByText('Recorded').count())) throw new Error('Learn Thread did not render the stage evidence gate')
if (!page.url().includes(`#/learn/thread/${hubThread.id}`)) throw new Error('typed Thread route did not preserve identity')
if (await page.locator('.orbit-bar, .page-head, .subnav, .main-focus').count()) throw new Error('focused Learning Thread rendered retired shell selectors')
if (!(await page.getByRole('link', { name: 'Back to learning paths' }).count())) throw new Error('focused Learning Thread omitted its compact return action')
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
if (!profileBody.includes('Readable fixture branch') || profileBody.includes('fixture-branch-id')) throw new Error('profile taste affinities leaked an internal branch id instead of the branch label')
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
if (!manifest.icons?.some((icon) => icon.src === '/icon.svg')) throw new Error('manifest is missing the local app icon')
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
for (const value of ['Current source', 'Active Thread', 'Queue', 'Due recall', 'Capture signal']) {
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
const preRecord = await requestJson(`/capture/${captured.id}/record`)
if (!preRecord.item) throw new Error('source record API did not return the captured source')
const thread = await requestJson('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title: 'Test a decision with evidence', thread_type: 'decide', guiding_question: 'Should this mechanism be used?', definition_of_done: 'Record a source-backed decision and synthesis.', activate: true }) })
await requestJson(`/capture/${captured.id}/triage`, { method: 'POST', body: JSON.stringify({ action: 'queue', thread_id: thread.id }) })
await requestJson(`/learning/core/threads/${thread.id}/sources`, { method: 'POST', body: JSON.stringify({ recommendation_id: captured.id, role: 'primary', expected_contribution: 'Supply the mechanism and its limits.' }) })
await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(captured.id)}`, { waitUntil: 'networkidle' })
await page.locator('.folio-object-view').waitFor({ state: 'visible', timeout: 15000 })
if (!(await page.getByRole('heading', { name: 'Source access' }).isVisible())) throw new Error('typed source route is missing source access')
if (!page.url().includes(`#/library/source/${captured.id}`)) throw new Error('typed source route did not preserve the captured source identity')
if (await page.locator('.object-inspector').count() !== 1 || !(await page.locator('.inspector-route').innerText()).includes(`/library/source/${captured.id}`)) throw new Error('typed source route did not open its inspector plumbing')
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
await requestJson(`/agent/jobs/${extractJob.id}/complete`, { method: 'POST', body: JSON.stringify({ worker: 'e2e',
  note: { id: 'e2e_source_note', recommendation_id: captured.id, title: 'Hermes source note', kind: 'guide', source_url: 'https://example.com/hermes-e2e', sections: [
    { section_key: 'foundation', label: 'Foundation', content: 'A test mechanism. *الفكرة الأساسية إن الميكانيزم ده بيشتغل كده.*' },
    { section_key: 'case_studies', label: 'Case Studies', content: 'The example shows the mechanism in practice. *المثال موضح الفكرة وهي شغالة على أرض الواقع.*' },
    { section_key: 'exploitation', label: 'Exploitation', content: 'The weakness is overconfidence. *الثغرة هنا إن الواحد يثق زيادة عن اللزوم.*' },
    { section_key: 'defense', label: 'Defense', content: 'Check the evidence before acting. *من الآخر راجع الدليل قبل ما تتحرك.*' },
  ] },
  srs_drafts: [{ question: 'What is the test mechanism?', answer: 'A test mechanism.', topic: 'Testing' }],
  learning_units: [{ id: 'e2e_unit', unit_type: 'method', statement: 'Check the available evidence before applying the mechanism.', user_synthesis: 'I should test the evidence before using it.', stance: 'accept', confidence: 0.9, role: 'core', anchors: [{ anchor_type: 'section', locator: 'Foundation', excerpt: 'A test mechanism.' }] }],
  reflection: { content: 'Handwritten margin note from page 2.', recommendation_id: captured.id, source_url: 'https://example.com/hermes-e2e' },
}) })
const extractedNotes = (await requestJson('/notes')).notes
if (!extractedNotes.some((note) => note.id === 'e2e_source_note') || !extractedNotes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content.includes('Handwritten margin note')))) throw new Error('extractor did not keep source note and handwritten reflection separate')
const guideNotes = (await requestJson('/notes?kind=guide')).notes
if (!guideNotes.some((note) => note.id === 'e2e_source_note') || guideNotes.some((note) => note.kind === 'reflection')) throw new Error('guide notes library leaked reflections into the extracted scope')
const consolidatedRecord = await requestJson(`/capture/${captured.id}/record`)
if (consolidatedRecord.consolidation?.state !== 'closed' || !consolidatedRecord.learning_units.some((unit) => unit.id === 'e2e_unit' && unit.anchors.length === 1) || !consolidatedRecord.threads.some((item) => item.id === thread.id)) throw new Error('learning core did not preserve the thread, anchored unit, and terminal consolidation receipt')
await requestJson('/learning/core/evidence', { method: 'POST', body: JSON.stringify({ thread_id: thread.id, unit_id: 'e2e_unit', evidence_type: 'decision', result: 'recorded', response: 'Use the mechanism only when its evidence checks pass.', score: 1 }) })
await requestJson(`/learning/core/threads/${thread.id}`, { method: 'PATCH', body: JSON.stringify({ final_synthesis: 'The mechanism is useful only when its evidence and failure modes are checked first.' }) })
const verifiedThread = await requestJson(`/learning/core/threads/${thread.id}/verify`, { method: 'POST' })
if (verifiedThread.status !== 'verified') throw new Error('evidence-backed Thread did not verify')
await page.goto(`${baseUrl}/#/learn?mode=practice&focus=notes`, { waitUntil: 'networkidle' })
await page.locator('.folio-note-row strong', { hasText: 'Hermes source note' }).waitFor({ state: 'visible', timeout: 15000 })
if (await page.getByText('Handwritten margin note').count()) throw new Error('Notes library leaked personal reflection content into the extracted library')
await page.goto(`${baseUrl}/#/learn/note/e2e_source_note`, { waitUntil: 'networkidle' })
await page.locator('.folio-note-reading').waitFor({ state: 'visible', timeout: 15000 })
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
await requestJson(`/sessions/${lowerSession.session_id}/return`, { method: 'POST', body: JSON.stringify({ reflection: 'Useful context but not worth extracting.', rating: 5, complete: true, auto_enqueue: true }) })
const lowerJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter((job) => job.payload.recommendation_id === lower.id)
if (lowerJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 || lowerJobs.some((job) => job.job_type === 'extract_notes')) throw new Error('lower rating feedback/extraction gate is incorrect')
const progress = await requestJson('/capture', { method: 'POST', body: JSON.stringify({ source: 'https://example.com/in-progress-feedback', title: 'In-progress feedback test' }) })
const progressSession = await requestJson('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: progress.id }) })
const progressReturn = await requestJson(`/sessions/${progressSession.session_id}/return`, { method: 'POST', body: JSON.stringify({ reflection: 'I am still reading, but this point matters.', complete: false }) })
if (progressReturn.status !== 'returned') throw new Error('in-progress feedback incorrectly completed the source')
const progressJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter((job) => job.payload.recommendation_id === progress.id)
if (progressJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 || progressJobs.some((job) => job.job_type === 'extract_notes')) throw new Error('in-progress feedback did not queue analysis cleanly')
const atomicFeedback = await requestJson('/feedback/record', { method: 'POST', body: JSON.stringify({ source_url: 'https://example.com/atomic-feedback', title: 'Atomic feedback test', feedback: 'Preserve these exact words.', score: 8, completion_state: 'completed', reason_tags: ['practical', 'revisit'], expected: 'A useful mechanism.', actual: 'Useful and concrete.', effort: 'deep', length_minutes: 45 }) })
if (atomicFeedback.preserved_feedback !== 'Preserve these exact words.' || atomicFeedback.completion_state !== 'completed' || !atomicFeedback.feedback_job || atomicFeedback.extraction_job !== null || !atomicFeedback.source_page.includes(atomicFeedback.source.id)) throw new Error('atomic feedback receipt is incomplete')
const atomicRecord = await requestJson(`/capture/${atomicFeedback.source.id}/record`)
if (!atomicRecord.notes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content === 'Preserve these exact words.'))) throw new Error('atomic feedback did not preserve exact words')
const atomicStructuredFeedback = JSON.parse(atomicRecord.item.source_metadata_json || '{}').learning_feedback
if (atomicStructuredFeedback?.score !== 8 || atomicStructuredFeedback?.effort !== 'deep' || atomicStructuredFeedback?.length_minutes !== 45 || atomicStructuredFeedback?.expected !== 'A useful mechanism.' || !atomicStructuredFeedback?.reason_tags?.includes('revisit')) throw new Error('structured feedback was not preserved on the source record')
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
if (!(await page.locator('.mobile-dock').isVisible())) throw new Error('mobile primary navigation is not visible')
if (await page.locator('.root-rail').isVisible()) throw new Error('desktop root rail remains visible on mobile')
if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count()) throw new Error('mobile shell rendered a redundant navigation sheet or context pane')
const mobileRootHrefs = await page.locator('.mobile-dock a').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')))])
if (mobileRootHrefs.length !== roots.length || roots.some((root) => !mobileRootHrefs.includes(`#/${root}`))) throw new Error('mobile dock does not expose the five stable roots')
for (const route of modeRoutes) {
  await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
  await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
  if (!(await page.locator('.mobile-dock').isVisible())) throw new Error(`${route.href}: mobile dock disappeared`)
  if (await page.locator('.mobile-dock a').count() !== roots.length) throw new Error(`${route.href}: mobile dock does not contain exactly five items`)
  if (route.root !== 'home' && (await page.locator('.workspace-mode-switcher').count() !== 1 || !(await page.locator('.workspace-mode-switcher').isVisible()))) throw new Error(`${route.href}: internal mode controls are missing on mobile`)
  if (route.root === 'library' && route.mode !== 'assets' && await page.locator('.workspace-filter-switcher').count() !== 1) throw new Error(`${route.href}: Library filter controls are missing on mobile`)
  if ((route.root === 'learn' && route.mode === 'practice') || (route.root === 'map' && route.mode === 'review') || (route.root === 'settings' && route.mode === 'personal')) {
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

console.log(`E2E passed: five root destinations, ${count} internal mode states, typed objects, legacy recovery, and mobile shell`)
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
