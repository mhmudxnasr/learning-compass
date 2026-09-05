import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { computeThemeVariables, contrastRatio } from '../../client/src/theme.ts'

// Reuse the suite's disposable Worker/D1. Interceptions exercise long content and failure states.
export async function verifyFrontendQuality({ page: suitePage, baseUrl, requestJson }) {
  const page = await suitePage.context().browser().newPage({ serviceWorkers: 'block' })
  const output = 'test-results/frontend-quality'
  mkdirSync(output, { recursive: true })
  const errors = []
  const measurements = []
  const created = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(`${baseUrl}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': 'e2e-frontend-quality' } }),
  )
  const post = (url, body) => requestJson(url, { method: 'POST', body: JSON.stringify(body) })
  const goto = async (hash, selector) => {
    await page.goto(`${baseUrl}/${hash}`, { waitUntil: 'networkidle' })
    await page.locator(selector).first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.getByRole('main').count(), 1, `${hash} must have one main landmark`)
  }
  const capture = async (name) => {
    await page.evaluate(() => document.querySelector('.workspace-canvas')?.scrollTo(0, 0))
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' })
  }
  const checkTargets = async (selector) => {
    const targets = await page.locator(selector).evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length)
        .map((node) => {
          const box = node.getBoundingClientRect()
          const canvas = document.querySelector('.workspace-canvas').getBoundingClientRect()
          return {
            text: node.textContent.trim(),
            width: box.width,
            height: box.height,
            left: box.left,
            right: box.right,
            canvasLeft: canvas.left,
            canvasRight: canvas.right,
          }
        }),
    )
    assert.ok(targets.length, selector)
    for (const target of targets) {
      assert.ok(target.width >= 43.9 && target.height >= 43.9, `Small target: ${JSON.stringify(target)}`)
      assert.ok(
        target.left >= target.canvasLeft - 1 && target.right <= target.canvasRight + 1,
        `Clipped action: ${JSON.stringify(target)}`,
      )
    }
    return targets
  }
  try {
    const content =
      '## The useful idea\n\n**Reinforcing feedback** amplifies a change. A balancing loop steadies it.\n\n- Find the cause\n- Trace the outcome\n\nلاحظ إزاي النتيجة بترجع تأثر على السبب.\n\n<script>window.untrustedLesson = true</script>'
    for (const status of ['active', 'paused']) {
      const thread = await post('/learning/core/threads', {
        title: `Quality ${status} Thread`,
        thread_type: 'understand',
        guiding_question: 'How do causes connect?',
        definition_of_done: 'Explain a feedback loop',
        activate: true,
        priority: 10,
      })
      created.push(thread.id)
      const stage = await post(`/learning/core/threads/${thread.id}/stages`, {
        title: 'Level 1 — Seeing relationships',
        position: 0,
      })
      const lesson = await post(`/learning/core/threads/${thread.id}/stages/${stage.id}/lessons`, {
        title: 'إزاي نفهم العلاقة بين الأسباب والنتائج من غير ما نضيع التفاصيل',
        position: 0,
        content,
        estimated_minutes: 12,
      })
      await post(`/learning/core/threads/${thread.id}/status`, { status })
      if (status === 'active') measurements.push({ thread: thread.id, stage: stage.id, lesson: lesson.id })
    }
    const homeSource = await post('/capture', {
      source: 'https://example.com/quality-home-branch',
      title: 'Quality primary source',
      branch_id: 'fixture-branch-id',
    })
    await post(`/learning/core/threads/${created[0]}/lessons/${measurements[0].lesson}/sources`, {
      recommendation_id: homeSource.id,
      branch_id: 'fixture-branch-id',
      role: 'primary',
      expected_contribution: 'Trace a concrete cause and outcome.',
      position: 0,
    })
    const briefing = await requestJson('/dashboard/briefing')
    assert.ok(briefing.active_threads.some((thread) => thread.id === created[0]))
    assert.equal(
      briefing.active_threads.find((thread) => thread.id === created[0]).current_stage.lessons[0].sources[0]
        .branch_label,
      'Readable fixture branch',
    )
    assert.ok(
      !briefing.active_threads.some((thread) => thread.id === created[1]),
      'Paused Threads cannot be Home turns',
    )
    const lessonHref = `#/learn/t/${created[0]}/l/${measurements[0].lesson}`
    const book = await post('/recommendations/books', {
      title: 'Quality file identity book',
      author: 'Fixture',
      branch_id: 'fixture-branch-id',
    })
    const upload = new FormData()
    upload.append(
      'file',
      new Blob(['Reading context for the owned book.'], { type: 'text/plain' }),
      'quality-reading-context.txt',
    )
    upload.append('metadata', JSON.stringify({ recommendation_id: book.book.id }))
    const uploadResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', body: upload })
    assert.equal(uploadResponse.ok, true, await uploadResponse.clone().text())
    const uploaded = await uploadResponse.json()
    const filesResponse = await requestJson('/artifacts')
    const ownedFile = filesResponse.artifacts.find((file) => file.id === uploaded.id)
    assert.equal(ownedFile?.owner_type, 'book')
    assert.equal(ownedFile?.branch?.id, 'fixture-branch-id')
    assert.equal(ownedFile?.branch?.label, 'Readable fixture branch')
    const foundFiles = await requestJson('/search?q=quality-reading-context')
    assert.equal(
      foundFiles.groups.artifacts.find((file) => file.id === uploaded.id)?.source_title,
      'Quality file identity book',
    )
    const artifacts = ['html', 'pdf'].map((format) => ({
      id: `quality-${format}`,
      filename: `long-source-companion.${format}`,
      media_type: format === 'html' ? 'text/html' : 'application/pdf',
      created_at: '2026-09-05',
      source_url: 'https://example.com/original',
      notebook_url: 'https://notebooklm.google.com/notebook/fixture',
      metadata: {
        pair_id: 'quality-pair',
        source_title:
          'A complete guide to understanding relationships between causes and outcomes — فهم الأسباب والنتائج',
        source_url: 'https://example.com/original',
      },
    }))
    for (const [number, title, state] of [
      [2, 'Tracing an outcome', 'ready'],
      [1, 'Finding a cause', 'ready'],
      [1, 'Old explanation', 'retired'],
    ]) {
      artifacts.push({
        id: `chapter-${number}-${state}`,
        filename: 'chapter.html',
        media_type: 'text/html',
        created_at: '2026-09-04',
        owner_type: 'book',
        branch: { id: 'fixture-branch-id', label: 'Readable fixture branch' },
        metadata: {
          pair_id: `chapter-pair-${number}-${state}`,
          recommendation_id: 'quality-book',
          source_title: 'Quality systems book',
          chapter_key: `ch-${number}`,
          chapter_number: number,
          chapter_title: title,
          publication_state: state,
          generator: 'lite-visual',
          role: 'html',
        },
      })
    }
    await page.route(`${baseUrl}/artifacts`, (route) => route.fulfill({ json: { artifacts } }))
    const queueItem = {
      id: 'quality-source',
      video_title: 'Understand a feedback loop in everyday decisions',
      video_url: 'https://example.com/feedback',
      content_type: 'article',
      learning_state: 'queued',
      branch: { id: 'fixture-branch-id', label: 'Readable fixture branch' },
      why_this: 'Follow how an outcome changes its own cause.',
      source_health: { status: 'verified' },
      compass: { score: 0.8, confidence: 0.9 },
      companions: { html: { id: 'quality-html' }, pdf: { id: 'quality-pdf' } },
    }
    await page.route(`${baseUrl}/capture/queue*`, (route) => route.fulfill({ json: { items: [queueItem], cap: 5 } }))
    await page.route(`${baseUrl}/recommendations/quality-source/source-health`, (route) =>
      route.fulfill({
        json: {
          source: { id: 'quality-source', source_url: queueItem.video_url },
          health: { status: 'verified' },
          attempts: [],
          replacements: [],
        },
      }),
    )
    for (const width of [1440, 1024, 975, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await goto('#/home', '.continuum-turn')
      assert.equal(await page.getByText('Quality paused Thread', { exact: true }).count(), 0)
      const turn = page.locator('.continuum-turn').filter({ hasText: 'Quality active Thread' })
      assert.equal(
        await turn.getByRole('link', { name: 'Readable fixture branch', exact: true }).getAttribute('href'),
        '#/map/branch/fixture-branch-id',
      )
      assert.match(await turn.innerText(), /Level 1 · Lesson 01/)
      const leading = await turn.locator('.folio-home-thread-lesson-title').evaluate((node) => {
        const s = getComputedStyle(node)
        return parseFloat(s.lineHeight) / parseFloat(s.fontSize)
      })
      assert.ok(leading >= 1.69, `Arabic title line height ${leading}`)
      assert.equal(await page.getByRole('button', { name: 'Search everything', exact: true }).count(), 1)
      await capture(`home-${width}`)
      await goto(lessonHref, '.lesson-authored-text')
      const skip = page.getByRole('link', { name: 'Skip to workspace' })
      await skip.focus()
      await skip.press('Enter')
      assert.ok(page.url().endsWith(lessonHref), 'Skip link must preserve the lesson route')
      assert.equal(await page.locator('.workspace-canvas').evaluate((node) => document.activeElement === node), true)
      assert.equal(await page.getByRole('heading', { name: 'The useful idea' }).count(), 1)
      assert.equal(await page.locator('.study-text strong').innerText(), 'Reinforcing feedback')
      assert.equal(await page.locator('.study-text li').count(), 2)
      assert.equal(await page.evaluate(() => window.untrustedLesson), undefined)
      const lessonY = (await page.locator('.lesson-authored-text').boundingBox()).y
      assert.ok(lessonY < 720, `Reading starts too low at ${width}: ${lessonY}`)
      await capture(`lesson-${width}`)
      await goto('#/library?mode=assets&focus=files', '.folio-file-actions')
      assert.deepEqual(await page.locator('.folio-file-owner + .folio-file-title').allTextContents(), [
        '1. Finding a cause',
        '2. Tracing an outcome',
      ])
      assert.equal(
        await page.getByRole('link', { name: /Quality systems book 1\. Finding a cause/ }).getAttribute('href'),
        '#/library/book/quality-book',
      )
      assert.equal(await page.locator('.folio-file-main-link a a').count(), 0)
      assert.equal(
        await page
          .locator('.folio-file-card')
          .filter({ hasText: '1. Finding a cause' })
          .getByRole('button', { name: /^Delete/ })
          .count(),
        0,
        'Published companion pairs cannot offer a doomed individual-file deletion',
      )
      measurements.push({
        width,
        lessonY,
        files: await checkTargets('.folio-file-actions a, .folio-file-actions button'),
      })
      await capture(`files-${width}`)
      await goto('#/library?mode=triage&focus=queue', '.folio-queue-record')
      for (const mode of ['Gallery', 'Ledger']) {
        await page.getByRole('button', { name: mode, exact: true }).click()
        const start = page.getByRole('link', { name: 'Start', exact: true })
        assert.ok((await start.boundingBox()).y < 850, `Queue ${mode} Start buried at ${width}`)
        await checkTargets('.folio-queue-record .folio-row-actions > *, .folio-queue-record a.folio-badge')
        assert.equal(await page.locator('.queue-source-details').getAttribute('open'), null)
        await capture(`queue-${mode.toLowerCase()}-${width}`)
      }
      await goto('#/learn?mode=practice&focus=recall', '.folio-recall')
      await checkTargets('.recall-view-switcher button')
    }
    await goto('#/home', '.continuum-turn')
    const activeTurn = page.locator('.continuum-turn').filter({ hasText: 'Quality active Thread' })
    await activeTurn.getByRole('button', { name: /^Finish lesson:/ }).click()
    await page.getByRole('button', { name: 'Undo completion', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Undo completion', exact: true }).click()
    await activeTurn.getByRole('button', { name: /^Finish lesson:/ }).waitFor()
    const reopened = await requestJson(`/learning/core/threads/${created[0]}/path`)
    assert.equal(reopened.stages[0].lessons[0].status, 'in_progress')

    await page.getByRole('button', { name: 'Search everything', exact: true }).click()
    const searchStatus = page.locator('.search-dialog [role="status"]')
    await page.getByLabel('Search sources, notes, Threads, files, and map', { exact: true }).fill('Quality active')
    await page.waitForFunction(() =>
      document.querySelector('.search-dialog [role="status"]')?.textContent.includes('results for Quality active'),
    )
    assert.match(await searchStatus.innerText(), /\d+ results for Quality active/)
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-search-index')), '0')
    assert.equal(
      await page.evaluate(() => document.activeElement?.tagName),
      'A',
      'Search arrows must expose the selected link through native focus',
    )
    await page.keyboard.press('Escape')

    let rejectSearch = true
    await page.route(`${baseUrl}/search*`, (route) =>
      rejectSearch
        ? route.fulfill({ status: 500, json: { error: 'Search unavailable' } })
        : route.fulfill({ json: { groups: {} } }),
    )
    await page.getByRole('button', { name: 'Search everything', exact: true }).click()
    await page.getByLabel('Search sources, notes, Threads, files, and map', { exact: true }).fill('recovery check')
    const retrySearch = page.locator('.search-dialog').getByRole('button', { name: 'Try again', exact: true })
    await retrySearch.waitFor()
    assert.equal(await page.locator('.search-dialog').getByText('No exact match.', { exact: true }).count(), 0)
    rejectSearch = false
    await retrySearch.click()
    await page.locator('.search-dialog').getByText('No exact match.', { exact: true }).waitFor()
    assert.equal(await retrySearch.count(), 0)
    await page.keyboard.press('Escape')
    await page.unroute(`${baseUrl}/search*`)

    await page.setViewportSize({ width: 1440, height: 1000 })
    await goto('#/map/node/fixture-branch-id', '[aria-label="Interactive visual knowledge map"]')
    await page
      .locator('.atlas-breadcrumbs')
      .waitFor()
      .catch(async (error) => {
        console.error(
          'Atlas selection',
          await page.evaluate(() => ({
            hash: location.hash,
            text: document.querySelector('.map-workspace')?.textContent?.slice(0, 2000),
          })),
        )
        throw error
      })
    const map = page.getByLabel('Interactive visual knowledge map', { exact: true })
    await map.focus()
    await map.press('ArrowRight')
    await map.press('ArrowLeft')
    assert.equal(
      await map.evaluate((node) => node === document.activeElement),
      true,
      'Map navigation must retain graph focus',
    )
    assert.equal(await page.locator('.object-inspector').count(), 0)
    await goto('#/map/node/fixture-branch-id', '[aria-label="Interactive visual knowledge map"]')
    const branchLink = page.locator('.atlas-breadcrumbs a[href="#/map/branch/fixture-branch-id"]')
    await branchLink.click().catch(async (error) => {
      console.error(
        'Atlas branch link',
        await page.evaluate(() => ({
          hash: location.hash,
          path: document.querySelector('.atlas-breadcrumbs')?.outerHTML,
        })),
      )
      throw error
    })
    await page.locator('.folio-branch-review').waitFor()
    assert.ok(page.url().endsWith('#/map/branch/fixture-branch-id'))

    await page.setViewportSize({ width: 390, height: 1000 })
    const newCard = await post('/learning/srs/create', {
      branch: 'fixture-branch-id',
      question: 'إزاي نفهم السبب والنتيجة؟',
      answer: 'نحدد العلاقة ونتابع أثرها.',
    })
    const { card: recallCard } = await requestJson(`/learning/srs/cards/${newCard.card_id}`)
    assert.equal(recallCard.branch_context.label, 'Readable fixture branch')
    assert.equal(recallCard.branch, 'fixture-branch-id')
    const dueCards = await requestJson('/learning/srs/due')
    assert.equal(dueCards.cards.find((card) => card.id === newCard.card_id)?.branch_context?.id, 'fixture-branch-id')
    await page.route(`${baseUrl}/learning/srs/due`, (route) => route.fulfill({ json: { cards: [recallCard] } }))
    await goto('#/learn?mode=practice&focus=recall', '.recall-review-card')
    assert.equal(await page.getByRole('searchbox', { name: 'Search question, source, or anchor' }).count(), 1)
    assert.equal(await page.locator('.recall-review-card .recall-branch-badge').innerText(), 'Readable fixture branch')
    await page.getByRole('button', { name: 'Reveal answer' }).click()
    assert.equal(
      await page.getByRole('button', { name: 'Good', exact: true }).getAttribute('aria-describedby'),
      'recall-grade-4',
    )
    await checkTargets('.recall-grades button')
    await capture('recall-mobile')

    await goto('#/library?mode=assets&focus=files', '.folio-file-actions')
    await page.getByLabel('Include earlier versions').check()
    assert.equal(await page.getByText('1. Old explanation', { exact: true }).count(), 1)
    await page.setViewportSize({ width: 975, height: 1000 })
    await goto('#/settings?focus=preferences', '.preferences-page')
    const preview = await page.locator('.theme-preview-frame').boundingBox()
    assert.ok(preview.width >= 250, `Preferences preview compressed to ${preview.width}px`)
    await capture('settings-975')
    await page.setViewportSize({ width: 390, height: 844 })
    await goto('#/settings?focus=preferences', '.preferences-page')
    assert.equal(await page.locator('.preferences-index .settings-jump-nav a').count(), 7)
    await page.locator('.preferences-index a[href="#type-controls"]').click()
    assert.notEqual(await page.locator('#type-controls').getAttribute('open'), null)
    await page.locator('#atlas-preferences > summary').click()
    const sliders = page.getByRole('slider')
    assert.equal(await sliders.count(), 14)
    for (const slider of await sliders.all()) {
      assert.match(await slider.ariaSnapshot(), /slider ".+"/, 'Every tuning slider has a meaningful accessible name')
    }
    await capture('settings-mobile')
    await page.route(`${baseUrl}/notifications`, (route) =>
      route.fulfill({
        json: {
          subscriptions: [],
          deliveries: [
            {
              id: 'failed',
              channel: 'browser',
              status: 'failed',
              error: 'atob: invalid base64',
              attempted_at: '2026-09-05',
            },
          ],
        },
      }),
    )
    await goto('#/settings?focus=preferences', '.notification-settings')
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.notification-last-delivery').waitFor()
    assert.doesNotMatch(await page.locator('.notification-settings').innerText(), /atob|base64/)
    assert.match(await page.locator('.notification-settings').innerText(), /keys need repair/)
    await page.locator('.notification-help > summary').click()
    assert.match(await page.locator('.notification-help').innerText(), /After setup is repaired/)

    const note = await post('/notes', {
      title: 'Quality reading-time agreement',
      branch_id: 'fixture-branch-id',
      sections: [
        { section_key: 'body', label: 'Study', content: 'A cause changes an outcome. '.repeat(70), direction: 'ltr' },
        {
          section_key: 'extraction_receipt',
          label: 'Extraction receipt',
          content: 'Internal provenance evidence. '.repeat(200),
          direction: 'ltr',
        },
      ],
    })
    await goto('#/learn?mode=practice&focus=notes', '.notes-ledger')
    assert.equal(await page.getByRole('searchbox', { name: 'Search titles and note text' }).count(), 1)
    const listedTime = (
      await page
        .locator('.note-ledger-row')
        .filter({ hasText: 'Quality reading-time agreement' })
        .locator('.note-ledger-measure')
        .innerText()
    ).match(/\d+\s*min/)?.[0]
    await goto(`#/learn/note/${note.id}`, '.scholar-note-meta')
    assert.equal(await page.locator('.scholar-note-meta > span').first().innerText(), listedTime)

    await goto('#/library?mode=assets&focus=files', '.folio-file-actions')
    const variables = computeThemeVariables(
      {
        brand: '#479c96',
        shell: '#121919',
        surface: '#1a2525',
        highlight: '#213a36',
        accent: '#77918d',
        ink: '#b9c6c2',
        map: '#334c53',
      },
      'dark',
    )
    await page.evaluate(
      (tokens) =>
        Object.entries(tokens).forEach(([key, value]) => document.documentElement.style.setProperty(key, value)),
      variables,
    )
    const badgeColor = await page
      .locator('.folio-badge-nblm')
      .first()
      .evaluate((node) => {
        const rgb = getComputedStyle(node)
          .color.match(/[\d.]+/g)
          .slice(0, 3)
        return '#' + rgb.map((value) => Number(value).toString(16).padStart(2, '0')).join('')
      })
    assert.ok(contrastRatio(badgeColor, variables['--studio-canvas']) >= 4.5)
    await capture('files-custom-dark')
    await page.evaluate(() => document.documentElement.style.setProperty('--font-scale', '2'))
    await checkTargets('.folio-file-actions a, .folio-file-actions button')
    await capture('files-mobile-enlarged')
    assert.deepEqual(errors, [])
    writeFileSync(`${output}/measurements.json`, JSON.stringify(measurements, null, 2))
  } finally {
    for (const id of created) await post(`/learning/core/threads/${id}/status`, { status: 'abandoned' })
    await page.close()
  }
}
