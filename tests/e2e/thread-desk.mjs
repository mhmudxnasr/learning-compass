import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

// Uses the suite's disposable Worker/D1 and browser. No production state is touched.
export async function verifyThreadDesk({ page, baseUrl, requestJson }) {
  const viewport = page.viewportSize()
  const screenshotDir = 'test-results/thread-desk'
  mkdirSync(screenshotDir, { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const capture = async (name, selector) => {
    await page.locator(selector).first().waitFor({ state: 'visible' })
    await page.evaluate(async () => {
      await document.fonts.ready
      document.getAnimations().forEach((animation) => {
        if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish()
      })
      document.querySelector('.workspace-canvas')?.scrollTo(0, 0)
      window.scrollTo(0, 0)
    })
    await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${baseUrl}/#/learn?mode=paths`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'New Thread', exact: true }).click()
  await page.getByLabel('Thread title', { exact: true }).fill('Practical systems thinking')
  await page.getByLabel('The question you want to answer').fill('How can I make better decisions in complex systems?')
  await page
    .getByLabel('Your intended outcome')
    .fill('Recognize feedback loops and choose interventions that address causes.')
  await page.getByRole('button', { name: 'Create & plan lessons' }).click()
  await page.waitForURL((url) => url.hash.includes('setup=1'))
  const id = page.url().split('/thread/')[1].split('?')[0]
  let path = await requestJson(`/learning/core/threads/${id}/path`)
  assert.equal(path.thread.status, 'draft')
  assert.equal(path.stages.length, 0)
  await page.getByLabel('Level Title', { exact: true }).fill('Seeing the system')
  await page.getByRole('button', { name: 'Add Level to Curriculum' }).click()
  await page.getByLabel('Lesson Title', { exact: true }).waitFor({ state: 'visible' })
  await page.getByLabel('Lesson Title', { exact: true }).fill('Find the feedback loops')
  await page.getByLabel('Estimated study time (minutes, optional)').fill('20')
  await page
    .getByLabel('Lesson text (optional)')
    .fill(
      'A feedback loop connects a change to its own future behavior.\n\nChoose a system you know. Identify its boundary, the variables that change, and the relationships between them.\n\nلاحظ كيف ترجع نتيجة الفعل فتؤثر على سببه. اكتب مثالًا من حياتك قبل المتابعة.',
    )
  await page.getByRole('button', { name: 'Add Lesson to Level' }).click()
  await page
    .getByRole('link', { name: /Find the feedback loops/ })
    .first()
    .waitFor()
  path = await requestJson(`/learning/core/threads/${id}/path`)
  const first = path.stages[0].lessons[0]
  const gap = await requestJson(`/learning/core/threads/${id}/stages/${path.stages[0].id}/lessons`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Choose an intervention', position: 1 }),
  })
  await requestJson(`/learning/core/threads/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'active' }),
  })
  await page.goto(`${baseUrl}/#/learn?mode=paths`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'In progress', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search Threads' }).fill('systems')
  const row = page.locator('.thread-desk-row').filter({ hasText: 'Practical systems thinking' })
  assert.equal(await row.getByText('1 future lesson needs material', { exact: true }).count(), 1)
  await row.locator('summary').click()
  await page.getByLabel('Priority for Practical systems thinking').selectOption('5')
  await page.getByRole('status').filter({ hasText: 'priority saved' }).waitFor()
  assert.equal((await requestJson(`/learning/core/threads/${id}/path`)).thread.priority, 5)
  await row.locator('summary').click()
  await capture('desktop-index', '.thread-desk-row')
  await row.getByRole('link', { name: 'Continue lesson: Practical systems thinking' }).click()
  await page.waitForURL((url) => url.hash.endsWith(`/l/${first.id}`))
  await page.getByLabel('Lesson text', { exact: true }).waitFor()
  assert.equal(await page.getByRole('navigation', { name: 'Course navigator' }).count(), 1)
  await capture('desktop-lesson', '.lesson-authored-text')
  await page.getByRole('button', { name: 'Focus on lesson' }).click()
  assert.equal(await page.getByRole('navigation', { name: 'Course navigator' }).count(), 0)
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.getByRole('button', { name: 'Show curriculum' }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'Show curriculum' }).click()
  await page.getByRole('button', { name: 'Mark lesson complete' }).click()
  await page.waitForURL((url) => url.hash.endsWith(`/l/${gap.id}`))
  const hub = await requestJson('/learning/core/hub')
  const current = hub.paths.find((thread) => thread.id === id)
  assert.equal(current.next_lesson.id, gap.id)
  assert.equal(current.needs_material_count, 1)
  assert.equal(current.future_material_count, 0)
  assert.ok(current.last_studied_at)
  const refreshedHub = await page.request.get(`${baseUrl}/learning/core/hub`)
  assert.equal(refreshedHub.headers()['cache-control'], 'private, no-cache')
  await page.getByRole('link', { name: 'Choose saved material' }).click()
  await page.getByLabel('Exact owner').waitFor()
  assert.equal(await page.getByLabel('Exact owner').inputValue(), `lesson:${gap.id}`)
  await page.goto(`${baseUrl}/#/learn/thread/${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Edit goal' }).click()
  await page
    .getByLabel('Intended outcome', { exact: true })
    .fill('Explain feedback loops and test a useful intervention.')
  await page.getByRole('button', { name: 'Save goal' }).click()
  await page.getByRole('heading', { name: 'Explain feedback loops and test a useful intervention.' }).waitFor()
  await page.locator('.thread-synthesis summary').click()
  await page
    .getByLabel('Thread reflection')
    .fill('I can distinguish reinforcing and balancing feedback. I still need to test an intervention.')
  await page.getByRole('button', { name: 'Save reflection' }).click()
  await page.getByRole('status').filter({ hasText: 'Reflection saved' }).waitFor()
  assert.match(
    (await requestJson(`/learning/core/threads/${id}/path`)).thread.final_synthesis,
    /reinforcing and balancing/,
  )
  await capture('desktop-overview', '.thread-purpose-sheet')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, route] of [
    ['overview', `#/learn/thread/${id}`],
    ['lesson', `#/learn/t/${id}/l/${first.id}`],
    ['index', '#/learn?mode=paths'],
  ]) {
    await page.goto(`${baseUrl}/${route}`, { waitUntil: 'networkidle' })
    const selector =
      name === 'overview' ? '.thread-purpose-sheet' : name === 'lesson' ? '.lesson-authored-text' : '.thread-desk-row'
    await capture(`mobile-${name}`, selector)
    assert.equal(
      await page.evaluate(() => {
        const canvas = document.querySelector('.workspace-canvas')
        return document.documentElement.scrollWidth > innerWidth + 1 || canvas.scrollWidth > canvas.clientWidth + 1
      }),
      false,
      `${name} overflows at 390px`,
    )
  }
  assert.equal(await page.getByRole('searchbox', { name: 'Search Threads' }).inputValue(), 'systems')
  await page.getByRole('searchbox', { name: 'Search Threads' }).fill('')
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.setViewportSize(viewport)
  const enlargedOverflow = await page.locator('.thread-desk').evaluate((desk) => {
    const elements = [...desk.querySelectorAll('h1,h2,h3,p,span,a,button,label,input,select,small')]
    const original = elements.map((element) => [
      element,
      element.getAttribute('style'),
      parseFloat(getComputedStyle(element).fontSize),
    ])
    for (const [element, , size] of original) element.style.fontSize = `${size * 2}px`
    const overflow = desk.scrollWidth > desk.clientWidth + 1
    for (const [element, style] of original) {
      if (style === null) element.removeAttribute('style')
      else element.setAttribute('style', style)
    }
    return overflow
  })
  assert.equal(enlargedOverflow, false, 'Thread desk overflows at 200% text size')
  const appearance = (await requestJson('/settings')).settings.appearance
  await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify({ ...appearance, theme: 'carbon' }) })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'carbon')
  await capture('dark-index', '.thread-desk-row')
  await requestJson('/settings/appearance', { method: 'PUT', body: JSON.stringify(appearance) })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.thread-desk-row').first().waitFor()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}
