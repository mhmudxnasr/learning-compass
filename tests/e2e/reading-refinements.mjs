import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

// Reuses the route suite's isolated Worker, D1, and browser.
export async function verifyReadingRefinements({ page: suitePage, baseUrl, requestJson, bookId }) {
  // Keep fixture interception independent of the offline suite's active service worker.
  const page = await suitePage
    .context()
    .browser()
    .newPage({ viewport: suitePage.viewportSize(), serviceWorkers: 'block' })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const capture = async (name) => {
    await page.evaluate(async () => {
      await document.fonts.ready
      document.querySelector('.workspace-canvas')?.scrollTo(0, 0)
      window.scrollTo(0, 0)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    await page.screenshot({ path: `test-results/reading-refinements/${name}.png`, fullPage: true })
  }
  await page
    .context()
    .route(`${baseUrl}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': 'e2e-reading-refinements' } }),
    )
  try {
    const viewport = page.viewportSize()
    const sections = [
      {
        section_key: 'claim',
        label: 'Claim and explanation',
        direction: 'auto',
        content:
          'A feedback loop connects an outcome to its cause.\n\nحلقة التغذية الراجعة بتربط النتيجة بالسبب. لاحظ العلاقة بينهم قبل ما تختار طريقة التدخل.',
      },
      {
        section_key: 'extraction_receipt',
        label: 'Extraction receipt',
        direction: 'ltr',
        content: '{"contract":"source_note_v2","source_hash":"unchanged-evidence"}',
      },
    ]
    const note = await requestJson('/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Reading refinement — فهم العلاقات بين الأسباب والنتائج واختيار التدخل المناسب',
        branch_id: 'fixture-branch-id',
        sections,
      }),
    })
    const dossier = await requestJson(`/notes/${note.id}`)
    assert.equal(dossier.note.branch_label, 'Readable fixture branch')
    assert.equal(
      (await requestJson('/notes')).notes.find((item) => item.id === note.id).branch_label,
      'Readable fixture branch',
    )
    const canonicalSections = dossier.note.sections
    mkdirSync('test-results/reading-refinements', { recursive: true })

    await requestJson(`/recommendations/books/${bookId}/reading-state`, {
      method: 'POST',
      body: JSON.stringify({ state: 'reading', primary: true }),
    })
    const healthUrl = `${baseUrl}/recommendations/${bookId}/source-health`
    await page.route(healthUrl, (route) =>
      route.fulfill({
        json: {
          source: { id: bookId, source_url: 'https://example.com/direct-book' },
          health: { status: 'verified', checked_url: 'https://example.com/direct-book', http_status: 204 },
          attempts: [],
          replacements: [],
        },
      }),
    )
    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
      await page.locator('.folio-home-workspace').waitFor()
      await capture(`home-${name}`)
      await page.goto(`${baseUrl}/#/library`, { waitUntil: 'networkidle' })
      const next = page.locator('.reading-fold-next')
      await next.waitFor()
      const health = page.locator('.source-health-disclosure')
      assert.equal(await health.getAttribute('open'), null)
      assert.ok((await next.boundingBox()).y < (await health.boundingBox()).y)
      await capture(`books-${name}`)
      await page.getByRole('button', { name: 'My books', exact: true }).click()
      assert.ok((await page.locator('#books-library').boundingBox()).y < height)
      await page.getByRole('button', { name: 'Canon', exact: true }).click()
      assert.ok((await page.locator('#books-canon').boundingBox()).y < height)
    }
    await page.unroute(healthUrl)

    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 820, 1180],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto(`${baseUrl}/#/learn/note/${note.id}`, { waitUntil: 'networkidle' })
      await page.locator('.scholar-note-bilingual').waitFor()
      assert.equal(await page.getByRole('complementary', { name: 'Study tools' }).count(), 0)
      assert.equal(await page.locator('.note-provenance').getAttribute('open'), null)
      assert.ok(!(await page.locator('.scholar-note-bilingual').innerText()).includes('source_hash'))
      const paragraphs = page.locator('.scholar-note-bilingual .reader-paragraph')
      assert.equal(await paragraphs.nth(0).getAttribute('dir'), 'ltr')
      assert.equal(await paragraphs.nth(1).getAttribute('dir'), 'rtl')
      assert.ok((await paragraphs.first().boundingBox()).y < height)
      assert.equal(
        await page.evaluate(() => {
          const canvas = document.querySelector('.workspace-canvas')
          return document.documentElement.scrollWidth > innerWidth + 1 || canvas.scrollWidth > canvas.clientWidth + 1
        }),
        false,
      )
      assert.equal(await page.getByRole('heading', { name: 'Claims and synthesis' }).count(), 0)
      await capture(`notes-${name}`)
      await page.getByRole('button', { name: 'Study tools', exact: true }).click()
      assert.equal(await page.getByRole('complementary', { name: 'Study tools' }).count(), 1)
      assert.equal(await page.getByRole('heading', { name: 'Claims and synthesis' }).count(), 1)
      await page.getByRole('button', { name: 'Study tools', exact: true }).click()
      await page.locator('.note-provenance > summary').click()
      assert.equal(await page.locator('.note-provenance pre').innerText(), sections[1].content)
      await page.locator('.note-provenance > summary').click()
      await page.locator('.scholar-note-nav > summary').click()
      assert.equal(await page.locator('.scholar-note-nav').getByText('Extraction receipt').count(), 0)
      await page.locator('.scholar-note-nav > summary').click()
    }
    assert.deepEqual((await requestJson(`/notes/${note.id}`)).note.sections, canonicalSections)
    await page.getByRole('button', { name: 'Edit note' }).click()
    assert.equal(await page.getByLabel('Note branch').inputValue(), 'fixture-branch-id')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.scholar-note-bilingual').waitFor()
    const afterEdit = await requestJson(`/notes/${note.id}`)
    assert.equal(afterEdit.note.branch_id, 'fixture-branch-id')
    assert.equal(afterEdit.note.branch_label, 'Readable fixture branch')
    assert.deepEqual(
      afterEdit.note.sections.map(({ content }) => content),
      sections.map(({ content }) => content),
    )

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.keyboard.press('Control+k')
    await page.locator('#search-query').fill('Reading refinement')
    await page.locator('.search-results a').filter({ hasText: 'Reading refinement' }).first().click()
    await page.keyboard.press('Control+k')
    await page.getByRole('region', { name: 'Recently opened from search' }).waitFor()
    await page
      .getByRole('link', { name: /Reading refinement/ })
      .first()
      .waitFor()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.ok(page.url().endsWith(`/note/${note.id}`))
    await page.reload({ waitUntil: 'networkidle' })
    await page.keyboard.press('Control+k')
    assert.equal(await page.getByRole('region', { name: 'Recently opened from search' }).count(), 1)
    await page.getByRole('button', { name: 'Clear recent items' }).click()
    assert.equal(await page.getByRole('region', { name: 'Recently opened from search' }).count(), 0)
    await page.keyboard.press('Escape')
    const graphUrl = `${baseUrl}/knowledge/graph`
    const domains = ['Human behavior', 'Technology', 'Communication']
    await page.route(graphUrl, (route) =>
      route.fulfill({
        json: {
          nodes: domains.flatMap((label, index) => [
            { id: `domain-${index}`, label, type: 'category' },
            {
              id: `branch-${index}`,
              label: `${label} practice`,
              type: 'branch',
              parent_id: `domain-${index}`,
              super_category: label,
            },
          ]),
          edges: domains.map((_, index) => ({ source_id: `domain-${index}`, target_id: `branch-${index}` })),
        },
      }),
    )
    for (const [name, width, height] of [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto(`${baseUrl}/#/map`, { waitUntil: 'networkidle' })
      const select = page.getByLabel('Explore a domain', { exact: true })
      await select.selectOption('Technology')
      assert.equal(await select.inputValue(), 'Technology')
      assert.equal(await page.locator('.atlas-trigger-badge').innerText(), '2')
      await page.getByRole('button', { name: 'Whole map', exact: true }).click()
      assert.equal(await select.inputValue(), 'all')
      assert.equal(await page.locator('.atlas-trigger-badge').innerText(), '6')
      await capture(`atlas-${name}`)
    }
    await page.unroute(graphUrl)
    await page.setViewportSize(viewport)
    assert.deepEqual(errors, [], 'Reading refinements raised browser errors')
  } finally {
    await page.close()
  }
}
