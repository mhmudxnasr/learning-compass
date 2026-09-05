import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

// Exercise real lesson-owned writes in the route suite's disposable Worker/D1.
export async function verifyScopedMaterials({ page, baseUrl, requestJson, threadId, lessonId, returnLessonId }) {
  const href = `${baseUrl}/#/learn/t/${threadId}/l/${lessonId}`
  const pathUrl = `/learning/core/threads/${threadId}/path`
  const before = await requestJson(pathUrl)
  const lessonFrom = (path) => path.stages.flatMap((stage) => stage.lessons).find((lesson) => lesson.id === lessonId)
  const screenshotDir = 'test-results/scoped-materials'
  mkdirSync(screenshotDir, { recursive: true })
  const tools = page.locator('.course-level-materials.is-lesson-tools')
  const workspace = tools.locator('.learning-scope-workspace')
  const tab = (label) => workspace.getByRole('tab', { name: new RegExp(`^${label} \\d+$`) })
  const panel = () => workspace.getByRole('tabpanel')
  const open = async () => {
    try {
      await tools.locator(':scope > summary').click()
    } catch (cause) {
      throw new Error(
        `Lesson tools unavailable at ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 4000)}`,
        { cause },
      )
    }
    await workspace.waitFor({ state: 'visible' })
  }
  const capture = async (name) => {
    await tools.scrollIntoViewIfNeeded()
    await tools.screenshot({ path: `${screenshotDir}/${name}.png`, animations: 'disabled' })
  }
  await page.goto(href, { waitUntil: 'networkidle' })
  await open()
  assert.equal(await workspace.getByText('Saved to this lesson.', { exact: true }).count(), 1)
  assert.equal(await workspace.locator('.learning-owner-pill, h3').count(), 0)
  assert.equal(await tab('Notes').getAttribute('aria-selected'), 'true')
  assert.equal(await panel().count(), 1)
  await capture('empty-desktop')

  await tab('Notes').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await tab('Files').getAttribute('aria-selected'), 'true')
  await page.keyboard.press('End')
  assert.equal(await tab('Recall').getAttribute('aria-selected'), 'true')
  await page.keyboard.press('Home')
  assert.equal(await tab('Notes').getAttribute('aria-selected'), 'true')

  await panel().getByRole('button', { name: 'Add note', exact: true }).click()
  await panel().getByLabel('Note title', { exact: true }).fill('A useful distinction')
  await panel().getByLabel('Note body', { exact: true }).fill('A full-width notebook keeps the lesson context close.')
  await tab('Files').click()
  await panel().getByRole('button', { name: 'Add file', exact: true }).click()
  await panel()
    .getByLabel('Choose file', { exact: true })
    .setInputFiles({ name: 'lesson-reference.txt', mimeType: 'text/plain', buffer: Buffer.from('A scoped reference.') })
  await tab('Notes').click()
  assert.equal(await panel().getByLabel('Note title', { exact: true }).inputValue(), 'A useful distinction')
  // Whitespace is rejected visibly, without a silent no-op or a write.
  await panel().getByLabel('Note body', { exact: true }).fill('   ')
  await panel().getByRole('button', { name: 'Save note', exact: true }).click()
  await panel().getByRole('alert').filter({ hasText: 'Enter your note.' }).waitFor()
  await panel().getByLabel('Note body', { exact: true }).fill('A full-width notebook keeps the lesson context close.')
  await panel()
    .getByRole('form', { name: 'Add note', exact: true })
    .evaluate((form) => {
      form.requestSubmit()
      form.requestSubmit()
    })
  await panel().getByRole('status').filter({ hasText: 'Note saved to this lesson.' }).waitFor()
  await panel()
    .getByRole('link', { name: /A useful distinction/ })
    .waitFor()
  assert.equal(await tab('Notes').textContent(), 'Notes1')
  await tab('Files').click()
  assert.equal(
    await panel()
      .getByLabel('Choose file', { exact: true })
      .evaluate((input) => input.files[0].name),
    'lesson-reference.txt',
  )
  await page.context().setOffline(true)
  await panel().getByRole('button', { name: 'Upload file', exact: true }).click()
  await panel().getByRole('alert').waitFor()
  assert.equal(
    await panel()
      .getByLabel('Choose file', { exact: true })
      .evaluate((input) => input.files[0].name),
    'lesson-reference.txt',
  )
  await page.context().setOffline(false)
  await panel().getByRole('button', { name: 'Upload file', exact: true }).click()
  await panel()
    .getByRole('link', { name: /lesson-reference.txt/ })
    .waitFor()

  await tab('Recall').click()
  await panel().getByRole('button', { name: 'Add card', exact: true }).click()
  await panel().getByLabel('Recall question in Arabic').fill('English question')
  await panel().getByLabel('Recall answer in Arabic').fill('English answer')
  await panel().getByRole('button', { name: 'Create card', exact: true }).click()
  await panel().getByRole('alert').filter({ hasText: 'must be written primarily in Arabic' }).waitFor()
  assert.equal(await panel().getByLabel('Recall question in Arabic').inputValue(), 'English question')
  await panel()
    .getByLabel('Recall question in Arabic')
    .fill('إزاي أختار المادة المناسبة للدرس وأرجع للفكرة المهمة بعدين؟')
  await panel()
    .getByLabel('Recall answer in Arabic')
    .fill('أحدد السؤال اللي عايز أجاوب عليه، وأكتب الفكرة بطريقتي وأحفظها مع الدرس.')
  await panel().getByRole('button', { name: 'Create card', exact: true }).click()
  await panel()
    .getByRole('link', { name: /إزاي أختار/ })
    .waitFor()
  await capture('recall-desktop')

  const saved = await requestJson(pathUrl)
  const lesson = lessonFrom(saved)
  assert.equal(lesson.notes.length, 1)
  assert.equal(lesson.files.length, 1)
  assert.equal(lesson.cards.length, 1)
  assert.equal(lesson.status, lessonFrom(before).status, 'Saving material advanced the lesson')
  assert.equal(saved.thread.status, before.thread.status)
  for (const kind of ['notes', 'files', 'cards']) {
    assert.equal(
      saved[kind].some((item) => item.id === lesson[kind][0].id),
      false,
    )
    assert.equal(
      saved.stages.some((stage) => stage[kind].some((item) => item.id === lesson[kind][0].id)),
      false,
    )
  }
  await page.reload({ waitUntil: 'networkidle' })
  await open()
  assert.equal(await tools.locator(':scope > summary small').textContent(), '3 saved')
  await panel()
    .getByRole('link', { name: /A useful distinction/ })
    .waitFor()
  await capture('saved-desktop')

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const label of ['Notes', 'Files', 'Recall']) {
      await tab(label).click()
      assert.equal(await panel().count(), 1)
      const bounds = await tab(label).boundingBox()
      assert.ok(bounds.height >= 44, 'Material tab is too small to tap')
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
        `${label} overflows at ${width}px`,
      )
    }
    await capture(`recall-${width}`)
  }
  await tab('Notes').click()
  await panel().getByRole('button', { name: 'Add note', exact: true }).click()
  await panel().getByLabel('Note title', { exact: true }).fill('Cancel this draft')
  await capture('editor-mobile')
  await panel().getByRole('button', { name: 'Cancel', exact: true }).click()
  await panel().getByRole('button', { name: 'Add note', exact: true }).click()
  assert.equal(await panel().getByLabel('Note title', { exact: true }).inputValue(), '')

  // A queued request already has one durable outbox identity; it must not leave
  // the same filled form available for a second submission with a fresh ID.
  await page.context().setOffline(true)
  await panel().getByLabel('Note title', { exact: true }).fill('Saved while offline')
  await panel().getByLabel('Note body', { exact: true }).fill('Sync this once, without creating a duplicate.')
  assert.equal(await panel().getByLabel('Note title', { exact: true }).inputValue(), 'Saved while offline')
  assert.equal(
    await panel().getByLabel('Note body', { exact: true }).inputValue(),
    'Sync this once, without creating a duplicate.',
  )
  await panel().getByRole('button', { name: 'Save note', exact: true }).click()
  // The API may queue after its 30-second network deadline; allow the outbox
  // write and UI update to finish before checking the same durable result.
  try {
    await panel().getByRole('status').filter({ hasText: 'Note queued for sync.' }).waitFor({ timeout: 45_000 })
  } catch (error) {
    await capture('offline-note-failure')
    throw new Error(`${error.message}\nOffline note panel: ${await panel().innerText()}`, { cause: error })
  }
  assert.equal(await panel().getByRole('button', { name: 'Save note', exact: true }).count(), 0)
  await panel().getByRole('button', { name: 'Add note', exact: true }).click()
  assert.equal(await panel().getByLabel('Note title', { exact: true }).inputValue(), '')
  await panel().getByRole('button', { name: 'Cancel', exact: true }).click()
  const synced = page.waitForResponse(
    (response) => response.url() === `${baseUrl}/notes` && response.request().method() === 'POST' && response.ok(),
  )
  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await synced
  assert.equal(
    lessonFrom(await requestJson(pathUrl)).notes.filter((note) => note.title === 'Saved while offline').length,
    1,
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  const appearance = (await requestJson('/settings')).settings.appearance
  await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify({ ...appearance, theme: 'carbon' }) })
  await page.reload({ waitUntil: 'networkidle' })
  await open()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'carbon')
  await capture('dark-desktop')
  const enlargedOverflow = await workspace.evaluate((element) => {
    const sizes = [element, ...element.querySelectorAll('*')].map((node) => [
      node,
      node.getAttribute('style'),
      getComputedStyle(node).fontSize,
    ])
    for (const [node, , size] of sizes) node.style.fontSize = `${parseFloat(size) * 2}px`
    const overflow = element.scrollWidth > element.clientWidth + 2
    for (const [node, style] of sizes) {
      if (style === null) node.removeAttribute('style')
      else node.setAttribute('style', style)
    }
    return overflow
  })
  assert.equal(enlargedOverflow, false, 'Material panel overflows at 200% text size')
  await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify(appearance) })
  await requestJson(`/artifacts/${lesson.files[0].id}`, { method: 'DELETE' })
  await page.goto(`${baseUrl}/#/learn/t/${threadId}/l/${returnLessonId}`, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  await open()
}
