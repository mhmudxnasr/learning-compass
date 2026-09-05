import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'

// Runs only against the route suite's disposable Worker/D1.
export async function verifyCalendarExport({ page: suitePage, baseUrl, requestJson, bookId }) {
  const page = await suitePage
    .context()
    .browser()
    .newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const directory = 'test-results/calendar-export'
  mkdirSync(directory, { recursive: true })
  const post = (url, body) => requestJson(url, { method: 'POST', body: JSON.stringify(body) })
  const thread = await post('/learning/core/threads', {
    title: 'Calendar export study',
    thread_type: 'understand',
    guiding_question: 'What did I learn?',
    definition_of_done: 'Explain the idea.',
    activate: true,
  })
  const level = await post(`/learning/core/threads/${thread.id}/stages`, { title: 'Orientation', position: 0 })
  const lesson = await post(`/learning/core/threads/${thread.id}/stages/${level.id}/lessons`, {
    title: 'Calendar lesson',
    content: 'Study the source and explain the idea.',
    position: 0,
  })
  await post(`/learning/core/threads/${thread.id}/sources`, {
    recommendation_id: bookId,
    role: 'primary',
    expected_contribution: 'The source for this study.',
  })
  await post('/notes', {
    recommendation_id: bookId,
    lesson_id: lesson.id,
    title: 'My handwritten explanation',
    kind: 'reflection',
    sections: [
      {
        section_key: 'handwriting',
        label: 'ملاحظة بخط اليد - صفحة 2',
        content: 'دي ملاحظتي الأصلية [كلمة غير واضحة].',
        direction: 'rtl',
      },
    ],
  })
  await requestJson(`/learning/core/threads/${thread.id}/lessons/${lesson.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  })
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const history = await requestJson(`/home/activity?month=${today.slice(0, 7)}&day=${today}`)
  assert(history.events.some((event) => event.target_id === lesson.id && event.kind === 'lesson_completed'))
  try {
    await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
    const calendar = page.locator('.learning-calendar')
    await calendar.getByRole('link', { name: 'Calendar lesson', exact: true }).waitFor()
    await calendar.getByRole('link', { name: 'Calendar lesson', exact: true }).click()
    await page.waitForURL((url) => url.hash.includes(`/l/${lesson.id}`))
    await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
    await calendar.getByRole('button', { name: 'Previous month' }).click()
    await calendar.locator('.learning-calendar-detail').getByRole('status').waitFor()
    assert.notEqual(
      await calendar.locator('.learning-calendar-day[aria-pressed="true"]').getAttribute('aria-current'),
      'date',
    )
    await calendar.getByRole('button', { name: 'Today', exact: true }).click()
    await calendar.getByRole('link', { name: 'Calendar lesson', exact: true }).waitFor()
    for (const [width, theme] of [
      [1440, 'mineral'],
      [390, 'carbon'],
    ]) {
      await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify({ theme }) })
      await page.setViewportSize({ width, height: 1000 })
      await page.reload({ waitUntil: 'networkidle' })
      await calendar.scrollIntoViewIfNeeded()
      await calendar.getByRole('link', { name: 'Calendar lesson', exact: true }).waitFor()
      assert(await calendar.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
      const box = await calendar.locator('.learning-calendar-day:not(:disabled)').first().boundingBox()
      assert(box.height >= 44)
      await calendar.screenshot({ path: `${directory}/calendar-${width}-${theme}.png` })
    }
    await page.goto(`${baseUrl}/#/learn/thread/${thread.id}`, { waitUntil: 'networkidle' })
    const exporter = page.locator('.thread-export')
    await exporter.locator('summary').click()
    await exporter.getByLabel('Download scope', { exact: true }).selectOption(level.id)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exporter.getByRole('button', { name: 'Download ZIP', exact: true }).click(),
    ])
    await download.saveAs(`${directory}/thread.zip`)
    assert(readFileSync(`${directory}/thread.zip`).readUInt32LE(0) === 0x04034b50)
    await exporter.getByRole('status').filter({ hasText: 'Unzip into your Obsidian vault' }).waitFor()
    await exporter.screenshot({ path: `${directory}/export-mobile.png` })
    const path = await requestJson(`/learning/core/threads/${thread.id}/path`)
    assert.equal(path.stages[0].lessons[0].status, 'completed')
    const packet = await requestJson(`/learning/core/threads/${thread.id}/export?format=obsidian&stage_id=${level.id}`)
    const pdf = '%PDF-1.4\nCompanion fixture\n'
    await page.route('**/learning/core/threads/*/export?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...packet,
          attachments: [
            {
              path: `${packet.files[0].path.split('/')[0]}/Attachments/test.pdf`,
              url: '/artifacts/export-fixture',
              size_bytes: pdf.length,
            },
          ],
        }),
      }),
    )
    await page.route('**/artifacts/export-fixture', (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf }),
    )
    await exporter.getByRole('checkbox').check()
    const [withCompanion] = await Promise.all([
      page.waitForEvent('download'),
      exporter.getByRole('button', { name: 'Download ZIP', exact: true }).click(),
    ])
    await withCompanion.saveAs(`${directory}/thread-with-companion.zip`)
    assert(readFileSync(`${directory}/thread-with-companion.zip`).includes(Buffer.from(pdf)))
    await exporter.getByRole('status').filter({ hasText: 'with 1 companion files' }).waitFor()
    await page.unroute('**/artifacts/export-fixture')
    await page.route('**/artifacts/export-fixture', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"artifact":{}}' }),
    )
    await exporter.getByRole('button', { name: 'Download ZIP', exact: true }).click()
    await exporter.getByRole('alert').filter({ hasText: 'A companion is unavailable' }).waitFor()
    await page.unroute('**/learning/core/threads/*/export?*')
    await page.route('**/learning/core/threads/*/export?*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Export unavailable for test' }),
      }),
    )
    await exporter.getByRole('button', { name: 'Download ZIP', exact: true }).click()
    await exporter.getByRole('alert').filter({ hasText: 'Export unavailable for test' }).waitFor()
    await page.route('**/home/activity?*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'History unavailable for test' }),
      }),
    )
    await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
    await calendar.getByText('History unavailable for test', { exact: true }).waitFor()
    assert.equal(await calendar.getByText('No learning activity recorded for this day.', { exact: true }).count(), 0)
  } finally {
    await page.close()
  }
}
