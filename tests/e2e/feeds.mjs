import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function verifyFeedTriage({ page, baseUrl, requestJson, wrangler, persistDir }) {
  const sql = [
    `INSERT INTO feed_sources(id,feed_url,title,branch_id) VALUES ('triage-fixture','https://example.com/feed.xml','Field notes','fixture-branch-id');`,
  ]
  for (let index = 0; index < 55; index++) {
    const id = `feed-triage-${index}`
    sql.push(
      `INSERT INTO recommendations(id,video_title,video_url,content_type,status,why_this) VALUES ('${id}','Article ${index}: Practical tools for thoughtful work','https://example.com/triage/${index}','article','active','A source excerpt with a concrete explanation of what this article covers.');`,
    )
    sql.push(
      `INSERT INTO recommendation_meta(recommendation_id,learning_state,branch_id) VALUES ('${id}','captured','fixture-branch-id');`,
    )
    sql.push(
      `INSERT INTO feed_entries(feed_id,guid,recommendation_id,published_at) VALUES ('triage-fixture','guid-${index}','${id}','2026-09-05T00:00:${String(index).padStart(2, '0')}Z');`,
    )
  }
  const seed = join(persistDir, 'feed-triage.sql')
  writeFileSync(seed, sql.join('\n'))
  const process = spawn(
    wrangler,
    [
      'd1',
      'execute',
      'recommendations-db',
      '--local',
      '--config',
      'wrangler.toml',
      '--persist-to',
      persistDir,
      '--file',
      seed,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let output = ''
  process.stdout.on('data', (chunk) => {
    output += chunk
  })
  process.stderr.on('data', (chunk) => {
    output += chunk
  })
  assert.equal(await new Promise((resolve) => process.on('close', resolve)), 0, output)
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${baseUrl}/#/library?mode=triage&focus=feeds`, { waitUntil: 'networkidle' })
  const feed = page.locator('.feed-triage')
  await feed.locator('.ft-story-link').nth(54).waitFor()
  assert.equal(await feed.locator('.ft-story-link').count(), 55)
  let reads = 0
  const countReads = (request) => {
    if (request.method() === 'GET' && request.url().includes('/entries?')) reads++
  }
  page.on('request', countReads)
  const firstTitle = await feed.locator('.ft-article h2').innerText()
  const firstLink = await feed.getByRole('link', { name: 'Open article', exact: true }).getAttribute('href')
  assert.equal(firstLink, 'https://example.com/triage/54')
  assert.equal(await feed.getByRole('link', { name: 'Open article', exact: true }).getAttribute('target'), '_blank')
  const skipResponse = page.waitForResponse((response) => response.url().endsWith('/feed-triage-54/dismiss'))
  await feed.getByRole('button', { name: 'Skip', exact: true }).click()
  assert.ok((await skipResponse).ok())
  await feed.locator('.ft-story-link').filter({ hasText: firstTitle }).waitFor({ state: 'detached' })
  assert.notEqual(await feed.locator('.ft-article h2').innerText(), firstTitle)
  assert.equal(reads, 0, 'skip must not reload the feed')
  page.off('request', countReads)
  const remaining = await requestJson('/capture/feeds/triage-fixture/entries?limit=200')
  assert.equal(remaining.total, 54)
  assert.ok(!remaining.items.some((item) => item.id === 'feed-triage-54'))
  assert.equal((await requestJson('/capture/feeds')).feeds.find((feed) => feed.id === 'triage-fixture').entry_count, 54)
  const record = await requestJson('/capture/feed-triage-54/record')
  assert.equal(record.item.status, 'active')
  assert.equal(record.item.learning_state, 'captured')
  assert.equal(record.item.deleted_at, null)
  await requestJson('/capture/feeds/triage-fixture/entries/feed-triage-54/dismiss', { method: 'POST', body: '{}' })
  assert.equal((await requestJson('/capture/feeds/triage-fixture/entries')).total, 54)
  assert.equal(
    (await fetch(`${baseUrl}/capture/feeds/triage-fixture/entries/not-an-entry/dismiss`, { method: 'POST' })).status,
    404,
  )
  await page.reload({ waitUntil: 'networkidle' })
  await feed.locator('.ft-story-link').nth(53).waitFor()
  assert.equal(await feed.locator('.ft-story-link').count(), 54)
  const restoredTitle = await feed.locator('.ft-article h2').innerText()
  await page.route('**/entries/*/dismiss', (route) => route.abort())
  await feed.getByRole('button', { name: 'Skip', exact: true }).click()
  await feed.getByRole('alert').filter({ hasText: 'It has been restored' }).waitFor()
  assert.equal(await feed.locator('.ft-article h2').innerText(), restoredTitle)
  assert.equal(await feed.locator('.ft-story-link').count(), 54)
  await page.unroute('**/entries/*/dismiss')
  await feed.locator('.ft-story-link').nth(4).click()
  const selected = await feed.locator('.ft-article h2').innerText()
  await page.reload({ waitUntil: 'networkidle' })
  await feed.locator('.ft-article h2').waitFor()
  assert.equal(await feed.locator('.ft-article h2').innerText(), selected)
  mkdirSync('test-results/feeds', { recursive: true })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await feed
    .locator('.ft-article')
    .evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/feeds/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 632, height: 960 })
  await page.screenshot({ path: 'test-results/feeds/narrow.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/feeds/mobile.png', fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page overflow')
  assert.ok(await feed.getByRole('link', { name: 'Open article', exact: true }).isVisible())
  const mobileLayout = await feed.evaluate((element) => {
    const actions = element.querySelector('.ft-actions').getBoundingClientRect()
    const excerpt = element.querySelector('.ft-excerpt').getBoundingClientRect()
    const record = element.querySelector('.ft-source-line').getBoundingClientRect()
    return {
      overlap: [excerpt, record].some((rect) => actions.top < rect.bottom && actions.bottom > rect.top),
      actionsBeforeExcerpt: actions.bottom <= excerpt.top,
      controlsBeforeNavigator: Boolean(
        element.querySelector('.ft-open').compareDocumentPosition(element.querySelector('.ft-story-link')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    }
  })
  assert.equal(mobileLayout.overlap, false, 'mobile actions must not cover source content')
  assert.equal(mobileLayout.actionsBeforeExcerpt, true, 'mobile actions must stay above the excerpt with normal motion')
  assert.equal(
    mobileLayout.controlsBeforeNavigator,
    true,
    'article controls must precede the long navigator in tab order',
  )
  await feed.getByRole('button', { name: 'Search articles', exact: true }).click()
  await feed.getByLabel('Search feed titles').fill('no-matching-fixture')
  await feed.getByRole('heading', { name: 'No matching articles.' }).waitFor()
  await feed.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page.setViewportSize(viewport)
}
