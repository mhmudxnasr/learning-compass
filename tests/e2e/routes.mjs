import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const workspaces = {
  today: ['briefing'],
  curate: ['queue','inbox','collections','archive'],
  map: ['atlas','coverage'],
  learn: ['files','notes','recall','activity'],
  insights: ['overview','taste','hermes'],
  settings: ['profile','preferences','data'],
}

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-e2e-'))
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
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', 'schema.sql'],
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

  browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

let count = 0
for (const [workspace, views] of Object.entries(workspaces)) {
  for (const view of views) {
    const before = errors.length
    await page.goto(`${baseUrl}/#/${workspace}/${view}`, { waitUntil: 'networkidle' })
    const heading = await page.locator('.page-head h1').textContent()
    if (!heading?.trim()) throw new Error(`${workspace}/${view}: missing heading`)
    if (errors.length !== before) throw new Error(`${workspace}/${view}: ${errors.at(-1)}`)
    if (await page.locator('.error-state').count()) throw new Error(`${workspace}/${view}: rendered an API error state`)
    const body = await page.locator('.page-content').innerText()
    if (/undefined|NaN/.test(body)) throw new Error(`${workspace}/${view}: leaked undefined/NaN`)
    if (workspace === 'curate' && view === 'archive') {
      await page.locator('.archive-rss').waitFor({ state: 'attached' })
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 2) throw new Error(`${workspace}/${view}: horizontal overflow ${overflow}px`)
    if (workspace === 'today' && view === 'briefing') {
      const screenshot = await page.screenshot({ path: join(persistDir, 'briefing-desktop.png') })
      if (!screenshot.length) throw new Error('desktop visual smoke screenshot was empty')
    }
    count++
  }
}

if (count !== 17) throw new Error(`expected 17 routes, checked ${count}`)
await page.goto(`${baseUrl}/#/curate/queue`, { waitUntil: 'networkidle' })
const curateNav = await page.locator('.subnav button').allTextContents()
if (curateNav[0]?.trim() !== 'Queue' || curateNav[1]?.trim() !== 'Inbox') throw new Error('Curate navigation order or Inbox label is incorrect')
await page.goto(`${baseUrl}/#/learn/notes`, { waitUntil: 'networkidle' })
const learnNav = await page.locator('.subnav button').allTextContents()
if (learnNav[0]?.trim() !== 'Files' || learnNav.includes('NotebookLM') || learnNav.includes('Reflections')) throw new Error('Learn navigation order is incorrect')
const [settings, manifest, artifacts, feeds, manualArchive, proposals, cards] = await Promise.all([
  fetch(`${baseUrl}/settings`).then((response) => response.json()),
  fetch(`${baseUrl}/manifest.json`).then((response) => response.json()),
  fetch(`${baseUrl}/artifacts`).then((response) => response.json()),
  fetch(`${baseUrl}/capture/feeds`).then((response) => response.json()),
  fetch(`${baseUrl}/recommendations/list?source=manual`).then((response) => response.json()),
  fetch(`${baseUrl}/feedback/proposals`).then((response) => response.json()),
  fetch(`${baseUrl}/learning/srs/cards`).then((response) => response.json()),
])
if (settings.resolved?.learning?.retention !== 90 || settings.resolved?.learning?.queue_cap !== 5) throw new Error('settings defaults are not resolved')
if (settings.resolved?.srs_drafts?.minimum_rating !== 7 || settings.resolved?.profile_proposals?.review_required !== true) throw new Error('learning automation defaults are incorrect')
if (!manifest.icons?.some((icon) => icon.src === '/icon.svg')) throw new Error('manifest is missing the local app icon')
if (!Array.isArray(artifacts.artifacts)) throw new Error('artifact library contract is invalid')
if (!Array.isArray(feeds.feeds)) throw new Error('feed subscriptions contract is invalid')
if (!Array.isArray(manualArchive.recommendations)) throw new Error('manual archive contract is invalid')
if (!Array.isArray(proposals.proposals)) throw new Error('feedback proposal contract is invalid')
if (!Array.isArray(cards.cards)) throw new Error('SRS card management contract is invalid')

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'content-type': 'application/json' }, ...options })
  const body = await response.json()
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${JSON.stringify(body)}`)
  return body
}
const captured = await requestJson('/capture', { method: 'POST', body: JSON.stringify({ source: 'https://example.com/hermes-e2e', title: 'Hermes automation test' }) })
const preRecord = await requestJson(`/capture/${captured.id}/record`)
if (!preRecord.item) throw new Error('source record API did not return the captured source')
await requestJson(`/capture/${captured.id}/triage`, { method: 'POST', body: JSON.stringify({ action: 'queue' }) })
await page.goto(`${baseUrl}/#/learn/notes?source=${captured.id}`, { waitUntil: 'networkidle' })
if (!await page.locator('.source-record-page').isVisible()) throw new Error(`canonical source record did not open: ${await page.locator('.page-content').innerText()}`)
if (!await page.getByRole('heading', { name: 'My Feedback' }).isVisible()) throw new Error('source record is missing feedback section')
const started = await requestJson('/sessions/start', { method: 'POST', body: JSON.stringify({ recommendation_id: captured.id }) })
const returned = await requestJson(`/sessions/${started.session_id}/return`, { method: 'POST', body: JSON.stringify({ reflection: 'The mechanism is useful and I will apply it.', rating: 7, complete: true, auto_enqueue: true }) })
if (returned.status !== 'completed' || !returned.reflection_note_id || !returned.srs_eligible) throw new Error('rating 7 did not close the reflection workflow')
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
await requestJson(`/agent/jobs/${feedbackJob.id}/complete`, { method: 'POST', body: JSON.stringify({ worker: 'e2e', proposals: [{ change_type: 'profile_signal', target_label: 'Learning priority', current: 'old', proposed: 'new', evidence: 'The reflection explicitly values the mechanism.', reasoning: 'Positive signal at rating 7.', confidence: 0.9 }] }) })
const pendingProposal = (await requestJson('/feedback/proposals?status=pending')).proposals[0]
if (!pendingProposal) throw new Error('feedback job did not persist a pending proposal')
await requestJson(`/feedback/proposals/${pendingProposal.id}/approve`, { method: 'POST' })
const appliedProposal = (await requestJson('/feedback/proposals')).proposals.find((proposal) => proposal.id === pendingProposal.id)
if (appliedProposal?.status !== 'applied') throw new Error('Activity did not apply the approved proposal directly')
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
  reflection: { content: 'Handwritten margin note from page 2.', recommendation_id: captured.id, source_url: 'https://example.com/hermes-e2e' },
}) })
const extractedNotes = (await requestJson('/notes')).notes
if (!extractedNotes.some((note) => note.id === 'e2e_source_note') || !extractedNotes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content.includes('Handwritten margin note')))) throw new Error('extractor did not keep source note and handwritten reflection separate')
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
const atomicFeedback = await requestJson('/feedback/record', { method: 'POST', body: JSON.stringify({ source_url: 'https://example.com/atomic-feedback', title: 'Atomic feedback test', feedback: 'Preserve these exact words.', rating: 8 }) })
if (atomicFeedback.preserved_feedback !== 'Preserve these exact words.' || atomicFeedback.completion_state !== 'completed' || !atomicFeedback.feedback_job || !atomicFeedback.extraction_job || !atomicFeedback.source_page.includes(atomicFeedback.source.id)) throw new Error('atomic feedback receipt is incomplete')
const atomicRecord = await requestJson(`/capture/${atomicFeedback.source.id}/record`)
if (!atomicRecord.notes.some((note) => note.kind === 'reflection' && note.sections.some((section) => section.content === 'Preserve these exact words.'))) throw new Error('atomic feedback did not preserve exact words')
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/#/today/briefing`, { waitUntil: 'networkidle' })
if (!(await page.locator('.mobile-nav').isVisible())) throw new Error('mobile primary navigation is not visible')
if (await page.locator('.rail').isVisible()) throw new Error('desktop rail remains visible on mobile')
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (mobileOverflow > 2) throw new Error(`mobile briefing horizontal overflow ${mobileOverflow}px`)
const mobileScreenshot = await page.screenshot({ path: join(persistDir, 'briefing-mobile.png') })
if (!mobileScreenshot.length) throw new Error('mobile visual smoke screenshot was empty')
await page.getByRole('button', { name: 'More' }).click()
const moreDialog = page.locator('.mobile-more-dialog')
await moreDialog.waitFor({ state: 'visible' })
for (const workspace of ['Map', 'Insights', 'Settings']) {
  if (!(await moreDialog.locator('nav button').filter({ hasText: new RegExp(`^${workspace}`) }).isVisible())) throw new Error(`mobile More is missing ${workspace}`)
}
await moreDialog.locator('nav button').filter({ hasText: /^Map/ }).click()
if (!page.url().includes('#/map/')) throw new Error('mobile More did not navigate to Map')

console.log(`E2E passed: ${count} purposeful destinations, mobile shell, and complete mobile navigation`)
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
