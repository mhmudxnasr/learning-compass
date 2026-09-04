import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyThreadDesk } from './thread-desk.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')

const roots = ['home', 'library', 'learn', 'map', 'settings']
const publicLearningUpdatePath = '/updates/learning-materials'
const rootRoutes = [
  { root: 'home', href: '#/home', expected: '.folio-home-workspace' },
  { root: 'library', href: '#/library', expected: '.folio-books-view' },
  { root: 'learn', href: '#/learn', expected: '.folio-notes' },
  { root: 'map', href: '#/map', expected: '.atlas-empty-state, .atlas-canvas-view' },
  { root: 'settings', href: '#/settings', expected: '.profile-settings-page' },
]

// These are lenses inside the five roots. They deliberately use query state;
// none of them is a peer destination in the global rail or mobile dock.
const modeRoutes = [
  { root: 'home', href: '#/home', mode: 'today', expected: '.folio-home-workspace' },
  { root: 'library', href: '#/library', mode: 'books', expected: '.folio-books-view' },
  {
    root: 'library',
    href: '#/library?mode=triage&focus=queue',
    mode: 'triage',
    focus: 'queue',
    expected: '.folio-queue-view',
  },

  {
    root: 'library',
    href: '#/library?mode=triage&focus=feeds',
    mode: 'triage',
    focus: 'feeds',
    expected: '.folio-feeds-view',
  },
  {
    root: 'library',
    href: '#/library?mode=catalog&focus=archive',
    mode: 'catalog',
    focus: 'archive',
    expected: '.folio-archive-view',
  },
  {
    root: 'library',
    href: '#/library?mode=assets&focus=files',
    mode: 'assets',
    focus: 'files',
    expected: '.folio-files-view',
  },
  { root: 'learn', href: '#/learn', mode: 'practice', expected: '.folio-notes' },
  { root: 'learn', href: '#/learn?mode=paths', mode: 'paths', expected: '.folio-paths' },
  {
    root: 'learn',
    href: '#/learn?mode=practice&focus=notes',
    mode: 'practice',
    focus: 'notes',
    expected: '.folio-notes',
  },
  {
    root: 'learn',
    href: '#/learn?mode=practice&focus=recall',
    mode: 'practice',
    focus: 'recall',
    expected: '.folio-recall',
  },
  { root: 'map', href: '#/map', mode: 'atlas', expected: '.atlas-empty-state, .atlas-canvas-view' },
  { root: 'map', href: '#/map?mode=review', mode: 'review', expected: '.branch-desk' },
  { root: 'settings', href: '#/settings', mode: 'personal', expected: '.profile-settings-page' },
  {
    root: 'settings',
    href: '#/settings?focus=preferences',
    mode: 'personal',
    focus: 'preferences',
    expected: '.settings-page',
  },
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
    probe.close((error) => (error ? reject(error) : resolve(address.port)))
  })
})
const baseUrl = `http://127.0.0.1:${port}`
let server
let browser

try {
  for (const args of [
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
      preContextBriefSchema,
    ],
    [
      'd1',
      'migrations',
      'apply',
      'recommendations-db',
      '--local',
      '--config',
      'wrangler.toml',
      '--persist-to',
      persistDir,
    ],
  ]) {
    const process = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    process.stdout.on('data', (chunk) => {
      output += chunk
    })
    process.stderr.on('data', (chunk) => {
      output += chunk
    })
    const status = await new Promise((resolve) => process.on('close', resolve))
    if (status !== 0) throw new Error(`D1 setup failed:\n${output}`)
  }

  server = spawn(
    wrangler,
    [
      'dev',
      '--local',
      '--config',
      'wrangler.toml',
      '--persist-to',
      persistDir,
      '--port',
      String(port),
      '--var',
      'ALLOW_UNAUTHENTICATED_LOCAL_WRITES:true',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  )
  let serverLog = ''
  let serverExit = null
  server.stdout.on('data', (chunk) => {
    serverLog = (serverLog + chunk).slice(-4000)
  })
  server.stderr.on('data', (chunk) => {
    serverLog = (serverLog + chunk).slice(-4000)
  })
  server.on('exit', (code, signal) => {
    serverExit = { code, signal }
  })

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health/live`)
      if (response.ok) break
    } catch {}
    if (attempt === 59) throw new Error(`Worker did not start:\n${serverLog}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const publicRead = await fetch(`${baseUrl}/settings`)
  if (!publicRead.ok) throw new Error(`unauthenticated settings read failed with ${publicRead.status}`)
  const malformedPublicWrite = await fetch(`${baseUrl}/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (malformedPublicWrite.status !== 400 || (await malformedPublicWrite.json()).error !== 'source required') {
    throw new Error(`unauthenticated malformed write did not reach domain validation: ${malformedPublicWrite.status}`)
  }
  const retiredSession = await fetch(`${baseUrl}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const unknownRoute = await fetch(`${baseUrl}/_e2e/missing-route`, { method: 'POST' })
  for (const [label, response] of [
    ['retired auth session', retiredSession],
    ['unknown route', unknownRoute],
  ]) {
    if (response.status !== 404) throw new Error(`${label} did not return the normal 404 boundary: ${response.status}`)
    if (response.headers.has('www-authenticate')) throw new Error(`${label} emitted a retired authentication challenge`)
    if (response.headers.has('set-cookie')) throw new Error(`${label} emitted a retired browser session cookie`)
  }

  // Exercise the installed first-party client through the real Worker and D1.
  // The idempotency key belongs only to the inner canonical target; putting it
  // on the outer /agent/request would reserve the wrong endpoint and make the
  // forwarded write self-conflict.
  const siteRequestScript =
    process.env.SITE_REQUEST_SCRIPT ||
    join(
      process.env.HOME || '/home/mahmud',
      '.hermes',
      'skills',
      'workflow',
      'learning-compass-site-operator',
      'scripts',
      'site_request.py',
    )
  if (existsSync(siteRequestScript)) {
    const guardedMutationFile = join(persistDir, 'guarded-mutation.json')
    writeFileSync(
      guardedMutationFile,
      JSON.stringify({
        method: 'PUT',
        path: '/settings/appearance',
        body: { density: 'balanced' },
        idempotency_key: 'e2e-inner-target-only',
        verify: { path: '/settings', field: 'settings.appearance.density', equals: 'balanced' },
      }),
    )
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = spawn('python3', [siteRequestScript, 'mutate', `@${guardedMutationFile}`, '--raw'], {
        env: {
          ...process.env,
          TASTE_MAP_URL: baseUrl,
          TASTE_MAP_ALLOW_LOCAL: '1',
          TASTE_MAP_AGENT_NAME: 'learning-compass-e2e',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let clientOutput = ''
      client.stdout.on('data', (chunk) => {
        clientOutput += chunk
      })
      client.stderr.on('data', (chunk) => {
        clientOutput += chunk
      })
      const clientStatus = await new Promise((resolve) => client.on('close', resolve))
      if (clientStatus !== 0 || /mutation_id_reused_for_different_operation/.test(clientOutput)) {
        throw new Error(
          `guarded client mutation self-conflicted (attempt ${attempt + 1}, exit ${clientStatus}):\n${clientOutput}`,
        )
      }
      const clientReceipt = JSON.parse(clientOutput)
      if (
        !clientReceipt.ok ||
        !clientReceipt.verified ||
        clientReceipt.receipt?.mutation_or_job?.mutation_committed !== true
      ) {
        throw new Error(`guarded client mutation lacked a verified receipt: ${clientOutput}`)
      }
    }
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
  await requestJson('/brain/seed', {
    method: 'POST',
    body: JSON.stringify({
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
        {
          id: 'fixture-branch-id',
          type: 'branch',
          label: 'Readable fixture branch',
          super_category: 'cat-mind',
          parent_id: 'root',
          status: 'love',
        },
        {
          id: 'pruned-fixture-branch',
          type: 'branch',
          label: 'Pruned fixture branch',
          super_category: 'cat-mind',
          parent_id: 'root',
          status: 'pruned',
        },
        {
          id: 'legacy-book-branch',
          type: 'branch',
          label: 'Legacy visible branch',
          super_category: 'cat-mind',
          parent_id: 'root',
          status: 'love',
        },
      ],
    }),
  })
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
    const rejected = await fetch(`${baseUrl}/recommendations/books`, {
      method: 'POST',
      headers: bookHeaders,
      body: JSON.stringify(body),
    })
    if (rejected.status !== 400) throw new Error(`manual book intake accepted a ${label} branch (${rejected.status})`)
  }
  const directBook = await requestJson('/recommendations/books', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({ ...directBookBody, branch_id: 'fixture-branch-id' }),
  })
  if (directBook.book.branch_id !== 'fixture-branch-id')
    throw new Error('manual book intake did not persist its verified branch')
  const readingBook = await requestJson(
    `/recommendations/books/${encodeURIComponent(directBook.book.id)}/reading-state`,
    { method: 'POST', headers: bookHeaders, body: JSON.stringify({ state: 'reading', primary: true }) },
  )
  if (readingBook.reading_state !== 'reading' || !readingBook.is_primary || readingBook.queue_state !== 'captured')
    throw new Error('primary book state did not remain explicit and independent from Queue state')
  const bookThread = await requestJson('/learning/core/threads', {
    method: 'POST',
    body: JSON.stringify({
      title: 'E2E Book Thread',
      thread_type: 'understand',
      guiding_question: 'What should this book change in practice?',
      definition_of_done: 'Explain and apply the book’s central model.',
    }),
  })
  await requestJson(`/learning/core/threads/${encodeURIComponent(bookThread.id)}/sources`, {
    method: 'POST',
    body: JSON.stringify({
      recommendation_id: directBook.book.id,
      role: 'primary',
      expected_contribution: 'Provide the Thread’s primary reading path.',
    }),
  })
  const duplicateBook = await requestJson('/recommendations/books', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({ ...directBookBody, branch_id: 'fixture-branch-id' }),
  })
  if (!duplicateBook.duplicate) throw new Error('duplicate Add Book did not resolve to the existing book identity')
  const syntheticChapter = await fetch(
    `${baseUrl}/recommendations/books/${encodeURIComponent(directBook.book.id)}/chapters`,
    {
      method: 'POST',
      headers: bookHeaders,
      body: JSON.stringify({ chapters: [{ key: ' book ', title: 'Legacy whole-book companion', number: 0 }] }),
    },
  )
  if (syntheticChapter.status !== 400)
    throw new Error(`chapter registration accepted the synthetic whole-book Chapter 0 (${syntheticChapter.status})`)
  await requestJson(`/recommendations/books/${encodeURIComponent(directBook.book.id)}/chapters`, {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({
      chapters: [
        { key: 'chapter-2', title: 'Application', number: 2 },
        { key: 'chapter-1', title: 'Orientation', number: 1 },
        { key: 'book', title: 'A legitimate numbered book chapter', number: 3 },
      ],
    }),
  })
  await requestJson('/notes', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({
      recommendation_id: directBook.book.id,
      title: 'E2E book note',
      kind: 'note',
      sections: [
        {
          section_key: 'insight',
          label: 'Insight',
          content: 'A durable note attached to the book dossier.',
          direction: 'auto',
        },
      ],
    }),
  })
  await requestJson('/annotations', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({
      recommendation_id: directBook.book.id,
      branch_id: 'fixture-branch-id',
      locator_type: 'epub',
      selector: { locator: 'Chapter 1' },
      quote: 'An exact anchored passage for the book dossier.',
    }),
  })
  const shelfRead = await requestJson('/recommendations/books')
  if ((shelfRead.books || []).some((book) => !book.branch?.id))
    throw new Error('Books Shelf exposed a record without canonical branch context')
  const readingShelfBook = (shelfRead.books || []).find((book) => book.id === directBook.book.id)
  if (readingShelfBook?.reading_state !== 'reading' || readingShelfBook?.learning_state !== 'captured')
    throw new Error('Reading now did not survive neutral Queue removal')
  if (
    readingShelfBook.visual?.chapters?.length !== 3 ||
    readingShelfBook.visual.chapters.some((chapter) => Number(chapter.number) === 0) ||
    !readingShelfBook.visual.chapters.some((chapter) => chapter.key === 'book' && Number(chapter.number) === 3)
  )
    throw new Error('Books projection rejected a legitimate book key or exposed synthetic Chapter 0')
  const repeatedShelfRead = await requestJson('/recommendations/books')
  const repeatedBook = (repeatedShelfRead.books || []).find((book) => book.id === directBook.book.id)
  if (JSON.stringify(repeatedBook?.visual) !== JSON.stringify(readingShelfBook.visual))
    throw new Error('repeated Books GET changed the canonical projection')
  const directBookRecord = await requestJson(`/capture/${encodeURIComponent(directBook.book.id)}/record`)
  if (
    JSON.stringify(directBookRecord.item?.visual) !== JSON.stringify(readingShelfBook.visual) ||
    directBookRecord.item?.reading_state !== readingShelfBook.reading_state
  )
    throw new Error('Books list and dossier returned different chapter or reading-state projections')
  const artifactOnlyBook = await requestJson('/recommendations/books', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({ title: 'E2E Artifact-only Book', author: 'E2E Author', branch_id: 'fixture-branch-id' }),
  })
  const chapterUpload = new FormData()
  chapterUpload.append(
    'file',
    new Blob(['<!doctype html><html><body><h1>Artifact chapter</h1></body></html>'], { type: 'text/html' }),
    'artifact-chapter.html',
  )
  chapterUpload.append(
    'metadata',
    JSON.stringify({
      recommendation_id: artifactOnlyBook.book.id,
      scope: 'book',
      role: 'html',
      chapter_key: 'artifact-chapter',
      chapter_title: 'Artifact chapter',
      chapter_number: 4,
    }),
  )
  const chapterUploadResponse = await fetch(`${baseUrl}/artifacts`, {
    method: 'POST',
    headers: { 'x-real-ip': 'e2e-books' },
    body: chapterUpload,
  })
  const chapterArtifact = await chapterUploadResponse.json()
  if (!chapterUploadResponse.ok)
    throw new Error(`book chapter artifact upload failed: ${JSON.stringify(chapterArtifact)}`)
  const unknownChapterCompletion = await fetch(
    `${baseUrl}/recommendations/books/${encodeURIComponent(artifactOnlyBook.book.id)}/chapters/unknown/complete`,
    { method: 'POST', headers: bookHeaders, body: JSON.stringify({ completed: true }) },
  )
  if (unknownChapterCompletion.status !== 404)
    throw new Error(`chapter completion accepted an unknown/unowned key (${unknownChapterCompletion.status})`)
  await requestJson(
    `/recommendations/books/${encodeURIComponent(artifactOnlyBook.book.id)}/chapters/artifact-chapter/complete`,
    { method: 'POST', headers: bookHeaders, body: JSON.stringify({ completed: true }) },
  )
  const artifactOnlyShelf = await requestJson('/recommendations/books')
  const artifactOnlyShelfBook = artifactOnlyShelf.books.find((book) => book.id === artifactOnlyBook.book.id)
  const artifactOnlyChapter = artifactOnlyShelfBook?.visual?.chapters?.find(
    (chapter) => chapter.key === 'artifact-chapter',
  )
  if (
    !artifactOnlyChapter?.completed ||
    artifactOnlyChapter.number !== 4 ||
    artifactOnlyChapter.html?.id !== chapterArtifact.id
  )
    throw new Error('artifact-only chapter completion did not materialize safe chapter metadata')
  const artifactOnlyRecord = await requestJson(`/capture/${encodeURIComponent(artifactOnlyBook.book.id)}/record`)
  const dossierArtifactChapter = artifactOnlyRecord.item?.visual?.chapters?.find(
    (chapter) => chapter.key === 'artifact-chapter',
  )
  if (
    JSON.stringify(dossierArtifactChapter?.html?.quality_assurance) !==
    JSON.stringify(artifactOnlyChapter.html.quality_assurance)
  )
    throw new Error('Books list and dossier returned different companion QA projections')
  const deletedBook = await requestJson('/recommendations/books', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({ title: 'E2E Deleted Book', author: 'E2E Author', branch_id: 'fixture-branch-id' }),
  })
  await requestJson('/recommendations/action', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({
      id: deletedBook.book.id,
      status: 'rejected',
      feedback_kind: 'administrative',
      reason_code: 'e2e_cleanup',
    }),
  })
  await requestJson(`/recommendations/${encodeURIComponent(deletedBook.book.id)}/permanent`, {
    method: 'DELETE',
    headers: bookHeaders,
  })
  const deletedReadingState = await fetch(
    `${baseUrl}/recommendations/books/${encodeURIComponent(deletedBook.book.id)}/reading-state`,
    { method: 'POST', headers: bookHeaders, body: JSON.stringify({ state: 'reading' }) },
  )
  if (deletedReadingState.status !== 404)
    throw new Error(`reading-state mutation accepted a deleted book (${deletedReadingState.status})`)
  const afterDelete = await requestJson('/recommendations/books')
  if ((afterDelete.books || []).some((book) => book.id === deletedBook.book.id))
    throw new Error('Books GET returned a deleted book')
  const legacyCreated = await requestJson('/recommendations/books', {
    method: 'POST',
    headers: bookHeaders,
    body: JSON.stringify({ title: 'E2E Legacy Branch Book', author: 'E2E Author', branch_id: 'legacy-book-branch' }),
  })
  await requestJson('/brain/branch-swipe', {
    method: 'POST',
    body: JSON.stringify({
      id: 'legacy-book-branch',
      action: 'prune',
      label: 'Legacy visible branch',
      super_category: 'cat-mind',
    }),
  })
  const legacyShelf = await requestJson('/recommendations/books')
  const legacyBook = legacyShelf.books.find((book) => book.id === legacyCreated.book.id)
  if (
    !legacyBook?.branch ||
    legacyBook.branch.label !== 'Legacy visible branch' ||
    legacyBook.branch.verified !== false ||
    legacyBook.branch.linkable !== false ||
    legacyBook.branch.id !== null ||
    legacyBook.branch.status !== null
  )
    throw new Error(`legacy Books branch was fabricated as canonical: ${JSON.stringify(legacyBook?.branch)}`)
  const legacyMutation = await fetch(
    `${baseUrl}/recommendations/books/${encodeURIComponent(legacyCreated.book.id)}/reading-state`,
    { method: 'POST', headers: bookHeaders, body: JSON.stringify({ state: 'reading' }) },
  )
  if (legacyMutation.status !== 404)
    throw new Error(`book mutation accepted an unverified legacy branch (${legacyMutation.status})`)
  for (let index = 1; index <= 36; index++) {
    await requestJson('/recommendations/books', {
      method: 'POST',
      headers: bookHeaders,
      body: JSON.stringify({
        title: `E2E Ledger Book ${String(index).padStart(2, '0')}`,
        author: 'E2E Ledger Author',
        branch_id: 'fixture-branch-id',
      }),
    })
  }

  const missingPersonalBranch = await fetch(`${baseUrl}/capture/personal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Branchless movie', item_type: 'movie', state: 'planned' }),
  })
  if (missingPersonalBranch.status !== 400)
    throw new Error(`personal intake accepted a missing branch (${missingPersonalBranch.status})`)
  const personalMovie = await requestJson('/capture/personal', {
    method: 'POST',
    body: JSON.stringify({
      title: 'E2E Personal Movie',
      creator: 'E2E Director',
      item_type: 'movie',
      state: 'in_progress',
      branch_id: 'fixture-branch-id',
      url: 'https://example.com/e2e-personal-movie',
      release_year: 2024,
      duration_minutes: 142,
      progress_current: 42,
      progress_total: 142,
      progress_unit: 'minutes',
      rating: 8.5,
      tags: ['documentary', 'systems'],
      personal_note: 'Keep the causal model visible.',
    }),
  })
  if (
    personalMovie.item?.item_type !== 'movie' ||
    personalMovie.item?.state !== 'in_progress' ||
    personalMovie.item?.branch_id !== 'fixture-branch-id' ||
    personalMovie.item?.rating !== 8.5
  )
    throw new Error(`personal movie did not persist its typed fields: ${JSON.stringify(personalMovie)}`)
  const personalMovieRecord = await requestJson(`/capture/${personalMovie.item.id}/record`)
  if (
    personalMovieRecord.personal_item?.personal_note !== 'Keep the causal model visible.' ||
    personalMovieRecord.personal_item?.state !== 'in_progress'
  )
    throw new Error('item record lost the independent personal-media details')
  const duplicatePersonalMovie = await fetch(`${baseUrl}/capture/personal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Duplicate title is irrelevant',
      item_type: 'movie',
      state: 'planned',
      branch_id: 'fixture-branch-id',
      url: 'https://example.com/e2e-personal-movie',
    }),
  })
  if (
    duplicatePersonalMovie.status !== 409 ||
    (await duplicatePersonalMovie.json()).recommendation_id !== personalMovie.item.id
  )
    throw new Error('personal intake did not preserve canonical URL identity')
  const editedPersonalMovie = await requestJson(`/capture/personal/${encodeURIComponent(personalMovie.item.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'E2E Personal Movie — Edited',
      state: 'completed',
      release_year: null,
      duration_minutes: null,
      progress_current: null,
      progress_total: null,
      rating: null,
      tags: [],
      personal_note: '',
    }),
  })
  if (
    editedPersonalMovie.item?.state !== 'completed' ||
    editedPersonalMovie.item?.release_year !== null ||
    editedPersonalMovie.item?.duration_minutes !== null ||
    editedPersonalMovie.item?.progress_current !== null ||
    editedPersonalMovie.item?.rating !== null ||
    editedPersonalMovie.item?.tags?.length ||
    editedPersonalMovie.item?.personal_note !== ''
  )
    throw new Error(`personal edit could not clear optional fields: ${JSON.stringify(editedPersonalMovie)}`)
  const personalSeries = await requestJson('/capture/personal', {
    method: 'POST',
    body: JSON.stringify({
      title: 'E2E Personal Series',
      creator: 'E2E Network',
      item_type: 'series',
      state: 'in_progress',
      branch_id: 'fixture-branch-id',
      release_year: 2025,
      progress_current: 3,
      progress_total: 8,
      progress_unit: 'episodes',
      tags: ['workplace'],
    }),
  })
  const filteredPersonal = await requestJson('/capture/personal?item_type=movie&state=completed&q=Edited')
  if (
    filteredPersonal.total !== 1 ||
    filteredPersonal.items[0]?.id !== personalMovie.item.id ||
    !filteredPersonal.summary?.by_type?.some((item) => item.key === 'series')
  )
    throw new Error(`personal filtering or exact summary contract drifted: ${JSON.stringify(filteredPersonal)}`)
  const personalQueue = await requestJson('/capture/queue')
  if (personalQueue.items.some((item) => item.id === personalMovie.item.id || item.id === personalSeries.item.id))
    throw new Error('personal media bypassed deliberate triage and entered Queue')
  const personalExport = await requestJson('/recommendations/export?format=json&limit=5000')
  const exportedSeries = personalExport.recommendations.find((item) => item.id === personalSeries.item.id)
  if (
    exportedSeries?.personal_library?.state !== 'in_progress' ||
    exportedSeries?.personal_library?.progress_current !== 3 ||
    exportedSeries?.branch_id !== 'fixture-branch-id'
  )
    throw new Error('portable export omitted typed personal-library data')

  const canonHeaders = { 'content-type': 'application/json', 'x-real-ip': 'e2e-canon' }
  const requestCanonJson = (path, options = {}) =>
    requestJson(path, { ...options, headers: { ...canonHeaders, ...(options.headers || {}) } })
  const canonFamily = await requestCanonJson('/learning/core/canon/domains', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Mind & Society',
      kind: 'family',
      branch_id: 'fixture-branch-id',
      boundary: 'Fields for understanding minds, groups, and institutions.',
      sort_order: 1,
    }),
  })
  const canonDomain = await requestCanonJson('/learning/core/canon/domains', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Behavioral Psychology',
      slug: 'behavioral-psychology',
      parent_id: canonFamily.id,
      branch_id: 'fixture-branch-id',
      boundary: 'Evidence-led accounts of observable behavior and learning; excludes clinical self-treatment.',
      orientation: 'Compare mechanisms, applications, and critiques.',
      sort_order: 1,
    }),
  })
  const canonPendingDomain = await requestCanonJson('/learning/core/canon/domains', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Social Psychology',
      slug: 'social-psychology',
      parent_id: canonFamily.id,
      branch_id: 'fixture-branch-id',
      boundary: 'How people think and act in social settings.',
      orientation: 'Compare individual, group, and cultural mechanisms.',
      sort_order: 2,
    }),
  })
  const canonSecondaryDomain = await requestCanonJson('/learning/core/canon/domains', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Decision Psychology',
      slug: 'decision-psychology',
      parent_id: canonFamily.id,
      branch_id: 'fixture-branch-id',
      boundary: 'How people choose under uncertainty.',
      orientation: 'Compare descriptive and prescriptive accounts.',
      sort_order: 3,
    }),
  })
  const emptyCanonThread = await fetch(`${baseUrl}/learning/core/canon/domains/${canonPendingDomain.id}/thread`, {
    method: 'POST',
    headers: canonHeaders,
  })
  if (emptyCanonThread.status !== 409)
    throw new Error(`Canon created an empty Thread from an unfinished field (${emptyCanonThread.status})`)
  const canonEntryBody = (role, suffix) => ({
    title: `E2E Canon Book ${suffix}`,
    author: 'E2E Author',
    canonical_url: `https://example.com/canon-${suffix.toLowerCase()}`,
    why_slot: `${role} earns this permanent role through a distinct contribution.`,
    beginner_case: 'A newcomer can enter through concrete examples.',
    expert_case: 'Experienced practitioners still use its core model.',
    unique_contribution: `The ${role} contribution is not duplicated by the other slots.`,
    limitations: 'Its scope is deliberately bounded.',
    difficulty: 'Moderate; no specialist prerequisites.',
    rejected_alternative: `Alternative ${suffix}`,
    rejection_reason: 'It overlaps more heavily with another slot.',
    evidence: [
      { claim: 'E2E source-grounded selection evidence.', url: `https://example.com/evidence-${suffix.toLowerCase()}` },
    ],
    editorial_status: 'approved',
  })
  const canonFoundation = await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/entries/foundation`, {
    method: 'PUT',
    body: JSON.stringify(canonEntryBody('foundation', 'A')),
  })
  const prematureComplete = await fetch(`${baseUrl}/learning/core/canon/domains/${canonDomain.id}`, {
    method: 'PATCH',
    headers: canonHeaders,
    body: JSON.stringify({ curation_status: 'complete' }),
  })
  if (prematureComplete.status !== 409)
    throw new Error(`Canon accepted a complete domain without three approved dossiers (${prematureComplete.status})`)
  const canonCapture = await requestCanonJson(`/learning/core/canon/entries/${canonFoundation.id}/capture`, {
    method: 'POST',
  })
  if (canonCapture.state !== 'captured' || canonCapture.branch_id !== 'fixture-branch-id')
    throw new Error('Canon capture did not preserve captured-source and branch contracts')
  const secondMembershipEntry = await requestCanonJson(
    `/learning/core/canon/domains/${canonSecondaryDomain.id}/entries/foundation`,
    { method: 'PUT', body: JSON.stringify(canonEntryBody('foundation', 'A')) },
  )
  const secondMembershipCapture = await requestCanonJson(
    `/learning/core/canon/entries/${secondMembershipEntry.id}/capture`,
    { method: 'POST' },
  )
  if (secondMembershipCapture.id !== canonCapture.id)
    throw new Error('Canon duplicate capture did not preserve one personal book identity')
  const canonShelfRead = await requestJson('/recommendations/books')
  const capturedCanonBook = (canonShelfRead.books || []).find((book) => book.id === canonCapture.id)
  if (
    capturedCanonBook?.canon_memberships?.length !== 2 ||
    !capturedCanonBook.canon_memberships.some(
      (membership) => membership.domain_id === canonDomain.id && membership.role === 'foundation',
    ) ||
    !capturedCanonBook.canon_memberships.some(
      (membership) => membership.domain_id === canonSecondaryDomain.id && membership.role === 'foundation',
    )
  )
    throw new Error('Books read model did not project every Canon membership onto the captured book identity')
  const canonRecordRead = await requestJson(`/capture/${encodeURIComponent(canonCapture.id)}/record`)
  if (
    canonRecordRead.item?.canon_memberships?.[0]?.domain_id !== canonDomain.id ||
    canonRecordRead.canon_memberships?.[0]?.entry_id !== canonFoundation.id
  )
    throw new Error('book dossier read model did not project Canon membership')
  await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/entries/representative`, {
    method: 'PUT',
    body: JSON.stringify(canonEntryBody('representative', 'B')),
  })
  await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/entries/boundary`, {
    method: 'PUT',
    body: JSON.stringify(canonEntryBody('boundary', 'C')),
  })
  await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ curation_status: 'complete' }),
  })
  const canonRead = await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}`)
  if (canonRead.entries.length !== 3 || canonRead.domain.curation_status !== 'complete')
    throw new Error('Canon domain did not expose its approved trio')

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultNavigationTimeout(20_000)
  let browserIp = 'e2e-browser-desktop'
  await page.route(`${baseUrl}/**`, (route) => {
    route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': browserIp, 'x-real-ip': browserIp } })
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  const rootHrefs = await page
    .locator('.root-rail nav[aria-label="Five workspaces"] a')
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')))])
  if (rootHrefs.length !== roots.length || roots.some((root) => !rootHrefs.includes(`#/${root}`)))
    throw new Error(`root rail does not expose exactly the five stable roots: ${rootHrefs.join(', ')}`)
  if ((await page.locator('.root-rail nav[aria-label="Five workspaces"] a').count()) !== roots.length)
    throw new Error('root rail must contain exactly five global destinations')
  if (await page.locator('.root-rail + .context-pane, .context-pane').count())
    throw new Error('desktop shell rendered a permanent context pane')
  const desktopRail = page.locator('.root-rail')
  if (await desktopRail.getByRole('button').count()) throw new Error('desktop rail must remain navigation-only')
  const desktopCommands = page.locator('.workspace-chrome')
  if (
    (await desktopCommands.getByRole('button', { name: /Search everything/ }).count()) !== 1 ||
    (await desktopCommands.getByRole('button', { name: 'Capture', exact: true }).count()) !== 1
  )
    throw new Error('workspace command bar is missing global Search or Capture')
  await desktopCommands.getByRole('button', { name: /Search everything/ }).click()
  await page.locator('.search-dialog').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await desktopCommands.getByRole('button', { name: 'Capture', exact: true }).click()
  await page.locator('.capture-dialog').waitFor({ state: 'visible' })
  const globalCaptureText = await page.locator('.capture-dialog').innerText()
  if (
    !globalCaptureText.includes('Book') ||
    !globalCaptureText.includes('Movie') ||
    !globalCaptureText.includes('Series') ||
    !globalCaptureText.includes('refine every field later')
  )
    throw new Error('global Add anything does not expose typed, editable capture')
  await page.getByRole('button', { name: 'Close capture dialog' }).click()

  for (const route of rootRoutes) {
    await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
    await page.locator('.studio-shell').waitFor({ state: 'visible', timeout: 15000 })
    if (!(await page.locator(`.studio-shell[data-root="${route.root}"]`).count()))
      throw new Error(`${route.href}: wrong root shell`)
    await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
  }

  let count = 0
  for (const route of modeRoutes) {
    const before = errors.length
    await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
    await page.locator('.studio-shell').waitFor({ state: 'visible', timeout: 15000 })
    if (!(await page.locator(`.studio-shell[data-root="${route.root}"]`).count()))
      throw new Error(`${route.href}: wrong root shell`)
    for (const selector of ['.root-rail', '.workspace-canvas']) {
      if ((await page.locator(selector).count()) !== 1)
        throw new Error(`${route.href}: missing exactly one ${selector}`)
    }
    if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count())
      throw new Error(`${route.href}: rendered a redundant context/menu surface`)
    await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
    if (
      route.root === 'library' &&
      route.mode === 'triage' &&
      route.focus === 'queue' &&
      !(await page.locator('.folio-queue-view-ledger').count())
    ) {
      throw new Error(`${route.href}: Queue did not open in its calm Ledger view by default`)
    }
    const routeState = await page.evaluate(() => {
      const hash = location.hash.replace(/^#/, '')
      const [path, query = ''] = hash.split('?')
      return { path, query: Object.fromEntries(new URLSearchParams(query).entries()) }
    })
    if (routeState.path !== `/${route.root}`)
      throw new Error(`${route.href}: mode escaped its root path (${routeState.path})`)
    const defaultModes = { home: 'today', library: 'books', learn: 'practice', map: 'atlas', settings: 'personal' }
    if (route.mode && route.mode !== defaultModes[route.root] && routeState.query.mode !== route.mode)
      throw new Error(`${route.href}: mode query was not preserved (${JSON.stringify(routeState.query)})`)
    if (route.focus && routeState.query.focus !== route.focus)
      throw new Error(`${route.href}: focus query was not preserved (${JSON.stringify(routeState.query)})`)
    if (
      route.root !== 'home' &&
      ((await page.locator('.workspace-mode-switcher').count()) !== 1 ||
        (await page.locator('.workspace-chrome-modes').count()) !== 1)
    )
      throw new Error(`${route.href}: missing responsive and desktop mode navigation`)
    if (
      route.root === 'library' &&
      route.mode === 'triage' &&
      (await page.locator('.workspace-filter-switcher').count()) !== 1
    )
      throw new Error(`${route.href}: missing the Library filter switcher`)
    if (
      route.root === 'library' &&
      route.mode === 'catalog' &&
      (await page.locator('.workspace-filter-switcher').count())
    )
      throw new Error(`${route.href}: Catalog rendered a redundant filter switcher`)
    if (
      (route.root === 'learn' && route.mode === 'practice') ||
      (route.root === 'settings' && route.mode === 'personal')
    ) {
      if ((await page.locator('.workspace-filter-switcher').count()) !== 1)
        throw new Error(`${route.href}: missing the active mode's focus switcher`)
    }
    if (route.root === 'map' && route.mode === 'review' && (await page.locator('.workspace-filter-switcher').count()))
      throw new Error(`${route.href}: unified Review rendered a redundant focus switcher`)
    if (
      route.root !== 'home' &&
      (!(await page
        .locator('.workspace-mode-switcher a.active, .workspace-mode-switcher a[aria-current="page"]')
        .count()) ||
        !(await page
          .locator('.workspace-chrome-modes a.active, .workspace-chrome-modes a[aria-current="page"]')
          .count()))
    )
      throw new Error(`${route.href}: responsive or desktop mode navigation did not mark its active mode`)
    const workspaceWidth = await page.evaluate(() => {
      const canvas = document.querySelector('.workspace-canvas')
      const surface = document.querySelector('.workspace-canvas > div > :first-child')
      if (!canvas || !surface) return null
      const style = getComputedStyle(canvas)
      const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const available = canvas.clientWidth - padding
      const surfaceRect = surface.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()
      const contentLeft = canvasRect.left + Number.parseFloat(style.paddingLeft)
      const contentRight = canvasRect.right - Number.parseFloat(style.paddingRight)
      return {
        canvas: canvas.clientWidth,
        available,
        surface: surfaceRect.width,
        imbalance: Math.abs(surfaceRect.left - contentLeft - (contentRight - surfaceRect.right)),
      }
    })
    const expectedSurface = Math.min(workspaceWidth?.available ?? 0, 1280)
    if (!workspaceWidth || workspaceWidth.surface < expectedSurface * 0.92 || workspaceWidth.imbalance > 3) {
      throw new Error(
        `${route.href}: workspace surface violates the centered 1280px canvas contract (${JSON.stringify(workspaceWidth)})`,
      )
    }
    for (const selector of ['.orbit-bar', '.page-head', '.subnav', '.rail', '.app-shell', '.main']) {
      if (await page.locator(selector).count())
        throw new Error(`${route.href}: rendered retired frontend selector ${selector}`)
    }
    const headings = page.locator('h1')
    if ((await headings.count()) !== 1)
      throw new Error(`${route.href}: expected exactly one h1, found ${await headings.count()}`)
    if (!(await headings.first().textContent())?.trim()) throw new Error(`${route.href}: h1 is empty`)
    if (errors.length !== before) throw new Error(`${route.href}: ${errors.at(-1)}`)
    if (await page.locator('.error-state').count()) throw new Error(`${route.href}: rendered an API error state`)
    const body = await page.locator('.workspace-canvas').innerText()
    if (/undefined|NaN/.test(body)) throw new Error(`${route.href}: leaked undefined/NaN`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 2) throw new Error(`${route.href}: horizontal overflow ${overflow}px`)
    count++
  }

  if (count !== modeRoutes.length)
    throw new Error(`expected ${modeRoutes.length} internal mode states, checked ${count}`)

  let reviewDeck = await requestJson('/brain/branch-deck')
  if (!reviewDeck.existing?.some((branch) => branch.status !== 'pruned')) {
    const category = reviewDeck.categories?.[0]
    if (!category) throw new Error('Map Review has no category available for branch creation')
    await requestJson('/brain/branch-swipe', {
      method: 'POST',
      body: JSON.stringify({
        id: 'map-review-e2e',
        action: 'add',
        label: 'Map Review E2E',
        super_category: category.id,
        parent_id: category.id,
        description: 'Verifies the unified branch dossier.',
      }),
    })
    reviewDeck = await requestJson('/brain/branch-deck')
  }
  await page.goto(`${baseUrl}/#/map?mode=review`, { waitUntil: 'networkidle' })
  const dossier = page.locator('.branch-dossier-layout')
  await dossier.waitFor({ state: 'visible', timeout: 15000 })
  await dossier.locator('.branch-dossier-rail').waitFor({ state: 'visible', timeout: 15000 })
  await dossier.getByRole('button', { name: 'Keep active', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  for (const action of ['Keep active', 'Make first priority', 'Pause branch', 'Archive branch']) {
    const button = dossier.getByRole('button', { name: action, exact: true })
    if ((await button.count()) !== 1) throw new Error(`Map Review is missing the ${action} decision`)
    const bounds = await button.boundingBox()
    if (!bounds || bounds.height < 44) throw new Error(`Map Review ${action} target is smaller than 44px`)
  }
  const branchIndex = dossier.locator('.folio-branch-sidebar')
  const areaFilter = branchIndex.getByRole('combobox', { name: 'Filter branches by area' })
  if ((await areaFilter.count()) !== 1) throw new Error('Map Review branch index is missing its single area filter')
  if (await branchIndex.locator('.folio-category-pills, .branch-item-status.status-kept').count())
    throw new Error('Map Review branch index restored noisy area chips or redundant Active badges')
  const filterBranch = reviewDeck.existing.find((branch) => branch.status !== 'pruned')
  const branchSearch = branchIndex.getByRole('searchbox', { name: 'Search branches' })
  await areaFilter.selectOption(filterBranch.super_category)
  await branchSearch.fill(filterBranch.label)
  await branchIndex.locator('.folio-branch-item').filter({ hasText: filterBranch.label }).click()
  await page.waitForFunction(
    (branchId) => location.hash.includes(`/map/branch/${encodeURIComponent(branchId)}`),
    filterBranch.id,
  )
  if (
    (await areaFilter.inputValue()) !== filterBranch.super_category ||
    (await branchSearch.inputValue()) !== filterBranch.label
  )
    throw new Error('Map Review reset its area or search filter after branch selection')
  await page.evaluate(() => document.documentElement.style.setProperty('--font-scale', '1.25'))
  const enlargedIndexOverflow = await branchIndex.evaluate((element) => element.scrollWidth - element.clientWidth)
  await page.evaluate(() => document.documentElement.style.removeProperty('--font-scale'))
  if (enlargedIndexOverflow > 2)
    throw new Error(`Map Review branch index overflows with enlarged text by ${enlargedIndexOverflow}px`)
  if (
    (await dossier
      .locator('.branch-inline-editor input, .branch-inline-editor textarea, .branch-inline-editor select')
      .count()) < 5
  )
    throw new Error('Map Review is missing the inline branch definition editor')
  if ((await dossier.locator('.branch-rail-signal').count()) !== 4)
    throw new Error('Map Review is missing live attention, filing, alignment, or frontier signals')

  await page.goto(`${baseUrl}/#/library`, { waitUntil: 'networkidle' })
  const readingFold = page.locator('.folio-books-view.books-room')
  await readingFold.waitFor({ state: 'visible', timeout: 15000 })
  await readingFold.getByRole('heading', { level: 1, name: 'Books', exact: true }).waitFor()
  await readingFold.getByRole('heading', { level: 2, name: 'E2E Direct Book', exact: true }).waitFor()
  if (!(await readingFold.getByText('Current Book', { exact: true }).count()))
    throw new Error('Books did not preserve the explicitly pinned current book')
  if (!(await readingFold.getByRole('link', { name: 'Thread · E2E Book Thread' }).count()))
    throw new Error('Books did not expose the current book’s connected Learning Thread')
  if (await readingFold.locator('.books-filter-nav, nav[aria-label="Books views"], .books-room-index').count())
    throw new Error('Reading Fold exposed a competing Books navigation surface')
  if (await readingFold.locator('a[href="https://example.com/direct-book"]').count())
    throw new Error('Reading Fold exposed original-book access in the primary flow')
  if (
    !(await readingFold.getByRole('heading', { level: 3, name: '1. Orientation' }).count()) ||
    !(await readingFold.getByRole('button', { name: 'Mark finished' }).count())
  )
    throw new Error('Reading Fold did not expose the next chapter and manual completion action')
  if (!(await readingFold.getByText('No reading format is attached to this chapter yet.', { exact: true }).count()))
    throw new Error('Reading Fold did not report the missing chapter format truthfully')

  const chapterDisclosure = readingFold.locator('.reading-fold-chapter-disclosure')
  const disclosureChevron = chapterDisclosure.locator('.disclosure-chevron')
  if ((await chapterDisclosure.getAttribute('open')) !== null || (await disclosureChevron.count()) !== 1)
    throw new Error('chapter ledger did not begin as an accessible disclosure with an explicit chevron')
  const closedChevronMotion = await disclosureChevron.evaluate((node) => {
    const style = getComputedStyle(node)
    return { duration: style.transitionDuration, transform: style.transform, rotate: style.rotate }
  })
  await chapterDisclosure.locator(':scope > summary').click()
  await page.waitForTimeout(220)
  const openChevronMotion = await disclosureChevron.evaluate((node) => {
    const style = getComputedStyle(node)
    return { transform: style.transform, rotate: style.rotate }
  })
  const chevronDuration = closedChevronMotion.duration.split(',').reduce((maximum, value) => {
    const duration = Number.parseFloat(value)
    return Math.max(maximum, value.trim().endsWith('ms') ? duration / 1000 : duration)
  }, 0)
  if (
    (await chapterDisclosure.getAttribute('open')) === null ||
    chevronDuration <= 0 ||
    (closedChevronMotion.transform === openChevronMotion.transform &&
      closedChevronMotion.rotate === openChevronMotion.rotate)
  )
    throw new Error(
      `chapter disclosure has no stateful expansion motion: ${JSON.stringify({ closedChevronMotion, openChevronMotion })}`,
    )
  await chapterDisclosure.locator(':scope > summary').click()

  const myBooks = readingFold.locator('.books-library-panel')
  await myBooks.waitFor({ state: 'visible' })
  const myBooksSearch = myBooks.getByRole('searchbox', { name: 'Search My Books' })
  const myBooksFilters = myBooks.getByRole('group', { name: 'Filter My Books by reading status' })
  if (
    !(await myBooksSearch.isVisible()) ||
    !(await myBooksFilters.isVisible()) ||
    (await myBooksFilters.locator('.books-library-filter').count()) < 3
  )
    throw new Error('My Books did not expose visible search and reading-state filters')
  const bookFacetToggle = myBooks.getByRole('button', { name: /Branches & Canon/i })
  await bookFacetToggle.click()
  const branchFacets = myBooks.getByRole('group', { name: 'Filter My Books by branch' })
  const canonFacets = myBooks.getByRole('group', { name: 'Filter My Books by Canon field' })
  if (
    !(await branchFacets.isVisible()) ||
    !(await canonFacets.isVisible()) ||
    !(await branchFacets.getByRole('button', { name: /Readable fixture branch/i }).count()) ||
    !(await canonFacets.getByRole('button', { name: /Behavioral Psychology/i }).count())
  )
    throw new Error('My Books did not expose branch and Canon field filters')
  await bookFacetToggle.click()
  const initialBookRows = await myBooks.locator('.books-library-row').count()
  if (initialBookRows < 1 || initialBookRows >= 40)
    throw new Error(`My Books did not start with a bounded incremental ledger (${initialBookRows} rows)`)
  if (
    !(await myBooks.locator('.books-library-branch-group').count()) ||
    !(await myBooks.locator('.books-library-state-band').count()) ||
    !(await myBooks.getByText('Reading now', { exact: true }).count())
  )
    throw new Error('My Books lost its branch-first library or reading-state bands')
  const showMoreBooks = myBooks.getByRole('button', { name: /Show .* more books/i })
  if (!(await showMoreBooks.isVisible())) throw new Error('My Books did not expose an incremental Show more action')
  await showMoreBooks.click()
  const expandedBookRows = await myBooks.locator('.books-library-row').count()
  if (expandedBookRows <= initialBookRows || expandedBookRows > 40)
    throw new Error(`My Books did not expand incrementally (${initialBookRows} → ${expandedBookRows})`)
  const readingFilter = myBooksFilters.getByRole('button', { name: /^Reading\b/i })
  await readingFilter.click()
  if (
    (await readingFilter.getAttribute('aria-pressed')) !== 'true' ||
    (await myBooks.locator('.books-library-row').count()) !== 1 ||
    !(await myBooks.locator('.books-library-row').filter({ hasText: 'E2E Direct Book' }).count())
  )
    throw new Error('My Books Reading filter did not isolate the current reading title')
  if (await myBooks.locator('.books-library-state-band:not(.state-reading)').count())
    throw new Error('My Books Reading filter left unrelated state bands visible')
  await myBooksFilters.getByRole('button', { name: /^All\b/i }).click()
  await myBooksSearch.fill('E2E Canon Book A')
  const capturedCanonRow = myBooks.locator('.books-library-row').filter({ hasText: 'E2E Canon Book A' })
  const capturedCanonPin = capturedCanonRow.getByRole('button', { name: 'Make E2E Canon Book A the current book' })
  if (
    (await capturedCanonRow.count()) !== 1 ||
    (await capturedCanonPin.count()) !== 1 ||
    !(await capturedCanonPin.evaluate((node) => node.classList.contains('books-library-primary-action')))
  )
    throw new Error('captured Canon book did not remain one searchable, pinnable personal title')
  const booksStyleContract = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const pin = getComputedStyle(document.querySelector('.books-library-primary-action'))
    const search = document.querySelector('.books-library-search').getBoundingClientRect()
    return {
      seamStrong: root.getPropertyValue('--studio-seam-strong').trim(),
      pinBorder: parseFloat(pin.borderTopWidth),
      searchHeight: search.height,
    }
  })
  if (!booksStyleContract.seamStrong || booksStyleContract.pinBorder < 1 || booksStyleContract.searchHeight < 44)
    throw new Error(
      `Books semantic theme tokens did not resolve into visible controls: ${JSON.stringify(booksStyleContract)}`,
    )
  await myBooksSearch.fill('E2E Legacy Branch Book')
  if ((await myBooks.locator('.books-library-row').filter({ hasText: 'E2E Legacy Branch Book' }).count()) !== 1)
    throw new Error('unresolved legacy book disappeared from the searchable title ledger')
  await myBooksSearch.fill('')

  const canonPanel = readingFold.locator('.canon-room-panel')
  await canonPanel.waitFor({ state: 'visible' })
  const canonSearch = canonPanel.locator('input[aria-label="Search Canon fields"], input.canon-room-search')
  const canonFamilyFilters = canonPanel.locator('[aria-label="Filter Canon by family"], .canon-filter-tabs')
  if (
    !(await canonSearch.isVisible()) ||
    !(await canonPanel.getByRole('button', { name: 'Surprise me with a ready field' }).isVisible())
  )
    throw new Error('Canon hid search or ready-field discovery')
  const canonFamilyFilter = canonFamilyFilters.getByRole('button', { name: /Mind & Society/i })
  await canonFamilyFilter.click()
  if ((await canonFamilyFilter.getAttribute('aria-pressed')) !== 'true')
    throw new Error('Canon family filter did not expose its selected state')
  await canonSearch.fill('Behavioral Psychology')
  const readyField = canonPanel.locator('.canon-field-map-card').filter({ hasText: 'Behavioral Psychology' })
  if ((await readyField.count()) !== 1 || (await canonPanel.locator('.canon-field-map-card').count()) !== 1)
    throw new Error('Canon search did not isolate the matching field visualization')
  if ((await readyField.locator('.canon-field-role').count()) !== 3)
    throw new Error('integrated Canon field did not preserve its three-book role visualization')
  for (const role of ['Foundation', 'Representative', 'Boundary'])
    if (!(await readyField.getByText(role, { exact: true }).count()))
      throw new Error(`integrated Canon field omitted its ${role} role`)
  for (const [role, title] of [
    ['foundation', 'E2E Canon Book A'],
    ['representative', 'E2E Canon Book B'],
    ['boundary', 'E2E Canon Book C'],
  ]) {
    if (!(await readyField.locator(`.role-${role}`).getByText(title, { exact: true }).count()))
      throw new Error(`integrated Canon field assigned the wrong title to its ${role} role`)
  }
  await canonSearch.fill('')
  if ((await readingFold.evaluate((node) => node.scrollWidth - node.clientWidth)) > 2)
    throw new Error('Books room overflowed after ledger and Canon interaction')

  const contrastPalette = {
    brand: '#ffffff',
    shell: '#0b1120',
    surface: '#111827',
    highlight: '#1f2937',
    accent: '#dbeafe',
    ink: '#f8fafc',
    rail: '#050811',
    seam: '#334155',
    due: '#fbbf24',
    danger: '#f87171',
    map: '#67e8f9',
  }
  await requestJson('/settings/appearance', {
    method: 'PUT',
    body: JSON.stringify({
      theme: 'custom',
      density: 'balanced',
      radius: 'soft',
      font_size: 'medium',
      reduced_motion: false,
      custom_palette: contrastPalette,
    }),
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'custom')
  const primaryActionContrast = await page.locator('.reading-fold-done').evaluate((node) => {
    const parse = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    const luminance = (value) => {
      const [red, green, blue] = parse(value).map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }
    const style = getComputedStyle(node)
    const foreground = style.color
    const background = style.backgroundColor
    const lighter = Math.max(luminance(foreground), luminance(background))
    const darker = Math.min(luminance(foreground), luminance(background))
    return { ratio: (lighter + 0.05) / (darker + 0.05), foreground, background }
  })
  if (primaryActionContrast.ratio < 4.5)
    throw new Error(
      `Books primary action loses contrast in a custom dark theme: ${JSON.stringify(primaryActionContrast)}`,
    )
  await requestJson('/settings/appearance', {
    method: 'PUT',
    body: JSON.stringify({
      theme: 'continuum',
      density: 'balanced',
      radius: 'soft',
      font_size: 'medium',
      reduced_motion: false,
      custom_palette: contrastPalette,
    }),
  })
  await page.goto(`${baseUrl}/#/learn/canon/behavioral-psychology`, { waitUntil: 'networkidle' })
  await page.locator('.canon-domain-detail').waitFor({ state: 'visible' })
  if (!page.url().includes('#/learn/canon/behavioral-psychology'))
    throw new Error('Canon domain did not preserve its canonical typed route')
  for (const role of ['Foundation', 'Representative', 'Boundary'])
    if (!(await page.getByRole('heading', { level: 2, name: role }).count()))
      throw new Error(`Canon domain omitted its permanent ${role} slot`)
  if (
    (await page.locator('.canon-book-section').count()) !== 3 ||
    (await page.getByText('Strongest rejected alternative').count()) !== 3
  )
    throw new Error('Canon domain did not render three progressive selection dossiers')
  if (!(await page.getByRole('button', { name: 'Create three-book Thread' }).isEnabled()))
    throw new Error('Canon did not enable Thread creation after a ready book was captured')
  const canonThread = await requestCanonJson(`/learning/core/canon/domains/${canonDomain.id}/thread`, {
    method: 'POST',
  })
  const canonThreadRead = await requestCanonJson(`/learning/core/threads/${canonThread.id}/path`)
  if (!canonThreadRead.thread.title.includes('Behavioral Psychology'))
    throw new Error('Canon domain did not create a normal finite Thread')
  await page.goto(`${baseUrl}/#/learn/canon/social-psychology`, { waitUntil: 'networkidle' })
  await page.locator('.canon-pending-panel').waitFor({ state: 'visible' })
  if (
    (await page.locator('.canon-book-section').count()) ||
    (await page.getByRole('button', { name: 'Create three-book Thread' }).count())
  )
    throw new Error('unfinished Canon field exposed a false reading path or Thread action')

  await page.goto(`${baseUrl}/#/library/book/${encodeURIComponent(directBook.book.id)}`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell[data-root="library"]').waitFor({ state: 'visible' })
  const bookOverview = page.locator('.book-overview-fold')
  await bookOverview.waitFor({ state: 'visible' })
  if (
    !(await bookOverview.getByRole('heading', { level: 1, name: 'E2E Direct Book' }).count()) ||
    !(await bookOverview.getByText('Current book', { exact: true }).count())
  )
    throw new Error('book overview lost its identity or primary state')
  if (
    !(await bookOverview.getByRole('link', { name: 'E2E Book Thread' }).count()) ||
    !(await bookOverview.getByRole('link', { name: /Readable fixture branch/ }).count())
  )
    throw new Error('book overview lost its Thread or verified branch context')
  if (!(await bookOverview.getByRole('heading', { level: 2, name: '1. Orientation' }).isVisible()))
    throw new Error('book overview did not lead with one next chapter')
  const bookSections = bookOverview.getByRole('navigation', { name: 'Book hub sections' })
  for (const [label, heading] of [
    ['Chapters', 'Chapters & companions'],
    ['Notes & passages', 'Notes & source anchors'],
    ['Recall', 'Recall'],
    ['Connections', 'Connections'],
    ['History', 'Reading history'],
    ['Files', 'Files'],
    ['Overview', 'Overview'],
  ]) {
    await bookSections.getByRole('link', { name: new RegExp('^' + label) }).click()
    await bookOverview
      .getByRole('heading', { name: heading, exact: true })
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(async (error) => {
        await page.screenshot({ path: '/tmp/learning-compass-item-pages-failure.png' })
        console.error(
          'Item section failure',
          await page.evaluate(() => ({
            hash: location.hash,
            active: [...document.querySelectorAll('.item-sections a')].map((a) => ({
              text: a.textContent,
              href: a.getAttribute('href'),
              current: a.getAttribute('aria-current'),
            })),
            panels: [...document.querySelectorAll('.book-dossier-main, .book-dossier-section')].map((el) => ({
              id: el.id,
              hidden: el.hidden,
              display: getComputedStyle(el).display,
            })),
          })),
        )
        throw error
      })
  }
  if (await bookOverview.getByText('A durable note attached to the book dossier.', { exact: true }).count())
    throw new Error('book hub duplicated the formatted note reader')
  await bookSections.getByRole('link', { name: /^Notes & passages/ }).click()
  const bookNotes = bookOverview.locator('details.book-dossier-notes')
  await bookOverview
    .getByText('An exact anchored passage for the book dossier.', { exact: true })
    .waitFor({ state: 'visible' })
  await bookSections.getByRole('link', { name: /^Reflection/ }).click()
  const bookFeedback = bookOverview.locator('details.book-dossier-reflection')
  await bookFeedback.getByRole('button', { name: 'Save feedback' }).waitFor({ state: 'visible' })
  await bookSections.getByRole('link', { name: /^Notes & passages/ }).click()
  const bookNoteLink = bookNotes.getByRole('link', { name: /E2E book note/ })
  await bookNoteLink.waitFor({ state: 'visible' })
  await bookNoteLink.click()
  await page.locator('.scholar-note-workspace').waitFor({ state: 'visible' })
  if (
    !(await page.getByRole('heading', { level: 1, name: 'E2E book note' }).count()) ||
    !(await page.getByText('A durable note attached to the book dossier.', { exact: true }).count())
  )
    throw new Error('book note did not open in the formatted Notes reader')
  await page.goBack({ waitUntil: 'networkidle' })
  await bookOverview.waitFor({ state: 'visible' })
  if ((await bookOverview.evaluate((node) => node.scrollWidth - node.clientWidth)) > 2)
    throw new Error('book overview overflows its desktop canvas')
  await bookOverview.getByRole('button', { name: 'Back to Books', exact: true }).click()
  await page.locator('.folio-books-view').waitFor({ state: 'visible' })
  if (!page.url().endsWith('#/library'))
    throw new Error('book overview Back action left the unified Library Books workspace')

  await page.goto(`${baseUrl}/#/library?mode=catalog&focus=books`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell[data-root="library"]').waitFor({ state: 'visible' })
  await page.locator('.folio-books-view').waitFor({ state: 'visible' })
  await page.waitForURL((url) => url.hash === '#/library')
  if (
    !page.url().endsWith('#/library') ||
    (await page.locator('.books-filter-nav, nav[aria-label="Books views"]').count())
  )
    throw new Error(`legacy Library Books query did not recover to the one Books workspace (${page.url()})`)

  browserIp = 'e2e-browser-preferences'
  await page.goto(`${baseUrl}/#/settings?focus=preferences`, { waitUntil: 'networkidle' })
  for (const section of [
    'visual-presets-heading',
    'interface-tokens',
    'theme-section',
    'font-section',
    'learning-preferences',
    'atlas-preferences',
  ]) {
    await page.locator(`.preferences-index .settings-jump-nav a[href="#${section}"]`).click()
    await page.waitForTimeout(80)
    const jumpState = await page.evaluate((id) => {
      const canvas = document.querySelector('.workspace-canvas')
      const target = document.getElementById(id)
      const jumpNav = document.querySelector('.preferences-index')
      return {
        hash: location.hash,
        heading: document.querySelector('h1')?.textContent,
        scrollTop: canvas?.scrollTop || 0,
        targetTop: target?.getBoundingClientRect().top || 0,
        navBottom: jumpNav?.getBoundingClientRect().bottom || 0,
      }
    }, section)
    if (jumpState.hash !== '#/settings?focus=preferences' || jumpState.heading !== 'Preferences')
      throw new Error(`preference jump escaped settings route for ${section}: ${JSON.stringify(jumpState)}`)
    if (section !== 'visual-presets-heading' && jumpState.targetTop < jumpState.navBottom - 12)
      throw new Error(
        `preference jump hid ${section} behind the sticky section navigator: ${JSON.stringify(jumpState)}`,
      )
  }
  const duplicateSettingIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  })
  if (duplicateSettingIds.length) throw new Error(`Settings contains duplicate IDs: ${duplicateSettingIds.join(', ')}`)
  const preferenceDisclosures = page.locator('.preferences-main > details.preference-disclosure')
  if ((await preferenceDisclosures.count()) !== 4)
    throw new Error('Preferences must progressively disclose theme, font, typography, and Map tuning')
  for (let index = 0; index < (await preferenceDisclosures.count()); index++) {
    if ((await preferenceDisclosures.nth(index).getAttribute('open')) !== null)
      throw new Error('advanced preference disclosures must start closed')
  }
  if (await page.locator('.theme-preview-frame').getByRole('button').count())
    throw new Error('appearance preview must not expose fake actions')
  if ((await page.locator('.preferences-preview-rail').count()) !== 1)
    throw new Error('Preferences must keep one contextual appearance preview')
  if ((await page.locator('.preferences-index .settings-jump-nav a').count()) !== 6)
    throw new Error('Preferences must expose a persistent, scannable section index')
  const saveRadio = async (group, option) => {
    const radio = page
      .getByRole('group', { name: new RegExp(`^${group}`) })
      .getByRole('radio', { name: new RegExp(`^${option}`) })
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
      ),
      radio.check(),
    ])
  }
  const renderedPreferences = () =>
    page.evaluate(() => {
      const root = document.documentElement
      const canvas = document.querySelector('.workspace-canvas')
      const row = document.querySelector('.preference-choice-options label')
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
  if (
    (await page.locator('.visual-preset-card').count()) !== 8 ||
    (await page.locator('.visual-preset-preview').count()) !== 8
  )
    throw new Error('complete workspace presets did not expose all eight art-directed semantic previews')
  const presetDirections = await page.locator('.visual-preset-reference').allTextContents()
  const expectedPresetDirections = [
    'Inspired by Attio',
    'Inspired by Raycast',
    'Inspired by Superhuman',
    'Inspired by Readwise Reader',
    'Inspired by Notion',
    'Inspired by Craft',
    'Inspired by Arc',
    'Inspired by Are.na',
  ]
  if (
    presetDirections.length !== expectedPresetDirections.length ||
    expectedPresetDirections.some((direction) => !presetDirections.includes(direction))
  )
    throw new Error(`workspace presets lost their distinct premium references: ${presetDirections.join(', ')}`)
  await saveRadio('Density', 'Compact')
  const compactPreference = await renderedPreferences()
  await saveRadio('Density', 'Comfortable')
  const comfortablePreference = await renderedPreferences()
  if (
    compactPreference.density !== 'compact' ||
    comfortablePreference.density !== 'comfortable' ||
    comfortablePreference.canvasPaddingTop <= compactPreference.canvasPaddingTop
  )
    throw new Error(
      `density does not materially change the studio: ${JSON.stringify({ compactPreference, comfortablePreference })}`,
    )
  await saveRadio('Corners', 'Sharp')
  const sharpPreference = await renderedPreferences()
  await saveRadio('Corners', 'Round')
  const roundPreference = await renderedPreferences()
  if (
    sharpPreference.radius !== 'sharp' ||
    roundPreference.radius !== 'round' ||
    roundPreference.rowRadius <= sharpPreference.rowRadius
  )
    throw new Error(
      `radius does not materially change controls: ${JSON.stringify({ sharpPreference, roundPreference })}`,
    )
  await saveRadio('Text size', 'Small')
  const smallPreference = await renderedPreferences()
  await saveRadio('Text size', 'Large')
  const largePreference = await renderedPreferences()
  if (
    smallPreference.fontSizePreference !== 'small' ||
    largePreference.fontSizePreference !== 'large' ||
    largePreference.introFontSize <= smallPreference.introFontSize
  )
    throw new Error(
      `font size does not materially change the interface: ${JSON.stringify({ smallPreference, largePreference })}`,
    )
  const reducedMotionToggle = page.getByLabel('Reduce motion', { exact: false })
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
    ),
    reducedMotionToggle.check(),
  ])
  const reducedPreference = await renderedPreferences()
  if (reducedPreference.reducedMotion !== 'true' || reducedPreference.transitionDuration > 0.001)
    throw new Error(`reduced motion is metadata-only: ${JSON.stringify(reducedPreference)}`)
  await page.locator('#theme-section > summary').click()
  const continuumTheme = page.locator('.theme-preset-card').filter({ hasText: 'Attio Coral' })
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
    ),
    continuumTheme.click(),
  ])
  const continuumPreference = await renderedPreferences()
  if (
    continuumPreference.theme !== 'continuum' ||
    continuumPreference.colorMode !== 'light' ||
    !continuumPreference.cypress ||
    !continuumPreference.actionInk
  )
    throw new Error(`theme does not replace the global visual system: ${JSON.stringify(continuumPreference)}`)
  await page.reload({ waitUntil: 'networkidle' })
  await page
    .waitForFunction(
      () =>
        document.documentElement.dataset.theme === 'continuum' && document.documentElement.dataset.fontSize === 'large',
    )
    .catch(async () => {
      const state = await page.evaluate(() => ({
        dataset: { ...document.documentElement.dataset },
        localTheme: localStorage.getItem('taste-map-theme'),
        localDisplay: localStorage.getItem('taste-map-display-preferences'),
        heading: document.querySelector('h1')?.textContent || '',
        alert: document.querySelector('[role="alert"]')?.textContent || '',
      }))
      throw new Error(`display preferences did not rehydrate after reload: ${JSON.stringify(state)}`)
    })
  const persistedPreference = await renderedPreferences()
  if (
    persistedPreference.reducedMotion !== 'true' ||
    persistedPreference.radius !== 'round' ||
    persistedPreference.density !== 'comfortable'
  )
    throw new Error(`display preferences did not survive reload: ${JSON.stringify(persistedPreference)}`)
  await page.locator('#theme-section > summary').click()
  if (
    (await page.locator('.theme-preset-group').count()) !== 3 ||
    !(await page.getByRole('heading', { name: 'Day palettes' }).isVisible()) ||
    !(await page.getByRole('heading', { name: 'Night palettes' }).isVisible())
  )
    throw new Error('Themes did not group day, night, and custom systems')
  if (
    (await page
      .locator('.theme-preset-card .theme-semantic-preview, .theme-custom-card .theme-semantic-preview')
      .count()) !== 9
  )
    throw new Error('theme choices did not render semantic studio previews')
  const themeReadingOrder = await page.locator('.preferences-main').evaluate((main) => {
    const children = [...main.children]
    return {
      preview: children.findIndex((node) => node.classList.contains('preferences-preview-stage')),
      presets: children.findIndex((node) => node.classList.contains('visual-presets-section')),
    }
  })
  if (themeReadingOrder.preview < 0 || themeReadingOrder.presets <= themeReadingOrder.preview)
    throw new Error(`appearance preview is not before controls in reading order: ${JSON.stringify(themeReadingOrder)}`)
  const customTheme = page.locator('.theme-custom-card')
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
    ),
    customTheme.click(),
  ])
  await page.locator('.custom-palette-panel').waitFor({ state: 'visible' })
  if (!(await customTheme.getByText('Selected', { exact: true }).isVisible()))
    throw new Error('custom theme did not expose a visible selected state')
  if ((await page.locator('.theme-contrast-grid > span').count()) !== 10)
    throw new Error('custom theme did not audit the rendered semantic foreground pairs')
  const advancedWorkshop = page.locator('.theme-workshop-advanced')
  if ((await advancedWorkshop.getAttribute('open')) !== null)
    throw new Error('theme transfer and automation tools must start collapsed')
  await advancedWorkshop.locator(':scope > summary').focus()
  await page.keyboard.press('Enter')
  if (
    !(await advancedWorkshop.getByText('Complete system exchange').isVisible()) ||
    !(await page.getByLabel('Import visual system JSON').count())
  )
    throw new Error('keyboard did not reveal the advanced visual-system tools')
  const brandInput = page.locator('#color-brand')
  const originalBrand = await brandInput.inputValue()
  const editedBrand = originalBrand.toLowerCase() === '#123456' ? '#234567' : '#123456'
  const editedBrandSave = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
  )
  await brandInput.fill(editedBrand)
  await editedBrandSave
  if ((await page.locator('#color-brand').inputValue()).toLowerCase() !== editedBrand)
    throw new Error('custom semantic color did not remain editable')
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileThemeTargets = await page.evaluate(() => {
    const size = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      return rect ? { width: rect.width, height: rect.height } : null
    }
    return {
      mode: size('.theme-mode-switch button'),
      color: size('.custom-color-input-group input[type="color"]'),
      importControl: size('.theme-import-button'),
    }
  })
  for (const [control, size] of Object.entries(mobileThemeTargets))
    if (!size || size.width < 44 || size.height < 44)
      throw new Error(`mobile ${control} target is below 44px at normal text size: ${JSON.stringify(size)}`)
  await page.evaluate(() => document.documentElement.style.setProperty('--font-scale', '2'))
  const mobileThemeLayout = await page.evaluate(() => {
    const pageNode = document.querySelector('.preferences-page')
    if (!pageNode) return { overflow: 0, offenders: [] }
    const pageBounds = pageNode.getBoundingClientRect()
    const offenders = [...pageNode.querySelectorAll('*')]
      .flatMap((node) => {
        if (!(node instanceof HTMLElement) || node.offsetParent === null) return []
        const bounds = node.getBoundingClientRect()
        if (bounds.right <= pageBounds.right + 2 && node.scrollWidth <= node.clientWidth + 2) return []
        return [
          {
            target: `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`,
            right: Math.round(bounds.right - pageBounds.right),
            ownOverflow: node.scrollWidth - node.clientWidth,
            text: node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
          },
        ]
      })
      .slice(0, 12)
    return { overflow: pageNode.scrollWidth - pageNode.clientWidth, offenders }
  })
  if (mobileThemeLayout.overflow > 2)
    throw new Error(`custom theme workshop overflows at mobile enlarged text: ${JSON.stringify(mobileThemeLayout)}`)
  await page.evaluate(() => document.documentElement.style.removeProperty('--font-scale'))
  await page.setViewportSize({ width: 1440, height: 900 })
  const restoredBrandSave = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
  )
  await brandInput.fill(originalBrand)
  await restoredBrandSave
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
    ),
    page.locator('.theme-preset-card').filter({ hasText: 'Attio Coral' }).click(),
  ])
  await saveRadio('Density', 'Balanced')
  await saveRadio('Corners', 'Soft')
  await saveRadio('Text size', 'Medium')
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/appearance') && response.request().method() === 'PUT' && response.ok(),
    ),
    page.getByLabel('Reduce motion', { exact: false }).uncheck(),
  ])

  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  const desktopScreenshot = await page.screenshot({ path: join(persistDir, 'home-desktop.png') })
  if (!desktopScreenshot.length) throw new Error('desktop visual smoke screenshot was empty')
  if ((await page.locator('.root-rail nav a').count()) !== 5)
    throw new Error('desktop root rail should expose five destinations')

  const updateResponse = await page.goto(`${baseUrl}${publicLearningUpdatePath}`, { waitUntil: 'networkidle' })
  if (!updateResponse?.ok()) throw new Error(`public learning update returned ${updateResponse?.status()}`)
  if (!updateResponse.headers()['content-type']?.startsWith('text/html'))
    throw new Error('public learning update is not served as HTML')
  if (!updateResponse.headers()['content-security-policy']?.includes("script-src 'none'"))
    throw new Error('public learning update is missing its no-script policy')
  if (
    (await page.locator('h1').count()) !== 1 ||
    !(await page.getByRole('heading', { level: 1, name: /One lesson/ }).isVisible())
  )
    throw new Error('public learning update does not have one clear page title')
  if ((await page.getByRole('link', { name: 'Open Learn' }).count()) < 2)
    throw new Error('public learning update does not expose its Learn action at the top and close')
  if (
    (await page.locator('.format-row').count()) !== 4 ||
    !(await page.getByText('NotebookLM gets a job, not a format list.').isVisible())
  )
    throw new Error('public learning update does not explain all four material roles and focused AI')
  const updateDesktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (updateDesktopOverflow > 2) throw new Error(`public learning update desktop overflow ${updateDesktopOverflow}px`)
  const updateDesktopScreenshot = await page.screenshot({
    path: join(persistDir, 'learning-materials-update-desktop.png'),
    fullPage: true,
  })
  if (!updateDesktopScreenshot.length) throw new Error('public learning update desktop screenshot was empty')
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })

  const legacyAliases = [
    { path: '/today', root: 'home', mode: 'today' },
    { path: '/today/briefing', root: 'home', mode: 'today' },
    { path: '/today/momentum', root: 'home', mode: 'today' },
    { path: '/insights/overview', root: 'home', mode: 'today' },
    { path: '/curate/queue', root: 'library', mode: 'triage', focus: 'queue' },
    { path: '/library/queue', root: 'library', mode: 'triage', focus: 'queue' },
    { path: '/curate/inbox', root: 'library', mode: 'catalog', focus: 'archive' },
    { path: '/library/inbox', root: 'library', mode: 'catalog', focus: 'archive' },
    { path: '/curate/feeds', root: 'library', mode: 'triage', focus: 'feeds' },
    { path: '/library/feeds', root: 'library', mode: 'triage', focus: 'feeds' },
    { path: '/curate/rss', root: 'library', mode: 'triage', focus: 'feeds' },
    { path: '/library/rss', root: 'library', mode: 'triage', focus: 'feeds' },
    { path: '/curate/discovery', root: 'library', mode: 'catalog', focus: 'archive' },
    { path: '/library/all', root: 'library', mode: 'catalog', focus: 'archive' },
    { path: '/curate/books', root: 'library', mode: 'books' },
    { path: '/library/books', root: 'library', mode: 'books' },
    { path: '/learn/books', root: 'library', mode: 'books' },
    { path: '/library/hardcover', root: 'library', mode: 'catalog', focus: 'archive' },
    { path: '/curate/collections', root: 'library', mode: 'catalog', focus: 'archive' },
    { path: '/library/collections', root: 'library', mode: 'catalog', focus: 'archive' },
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
      if (alias.mode === 'books') return '.folio-books-view'
      if (alias.focus === 'queue') return '.folio-queue-view'

      if (alias.focus === 'feeds') return '.folio-feeds-view'
      if (alias.focus === 'books') return '.folio-books-view'
      if (alias.focus === 'archive') return '.folio-archive-view'
      return '.folio-archive-view'
    }
    if (alias.root === 'learn')
      return alias.focus === 'notes' ? '.folio-notes' : alias.focus === 'recall' ? '.folio-recall' : '.folio-paths'
    if (alias.root === 'map') return alias.mode === 'review' ? '.branch-desk' : '.atlas-empty-state'
    if (alias.mode === 'system') return '.system-console'
    if (alias.mode === 'data') return '.data-settings-page'
    return alias.focus === 'preferences' ? '.settings-page' : '.profile-settings-page'
  }
  function hasFocusFilter(alias) {
    return Boolean(
      alias.focus &&
      alias.root !== 'map' &&
      !(alias.root === 'library' && (alias.mode === 'assets' || alias.mode === 'catalog')),
    )
  }
  for (const alias of legacyAliases) {
    await page.goto(`${baseUrl}/#${alias.path}`, { waitUntil: 'networkidle' })
    await page
      .locator(`.studio-shell[data-root="${alias.root}"]`)
      .waitFor({ state: 'attached', timeout: 15000 })
      .catch(() => {
        throw new Error(`${alias.path}: legacy alias did not recover into the right workspace`)
      })
    if (!(await page.locator('.route-notice').count()) || (await page.locator('.route-warning').count()))
      throw new Error(`${alias.path}: legacy alias did not announce purposeful recovery`)
    await page
      .locator('.workspace-mode-switcher, .workspace-canvas')
      .first()
      .waitFor({ state: 'attached', timeout: 15000 })
    await page.locator(legacySurface(alias)).waitFor({ state: 'attached', timeout: 15000 })
    const recoveredState = await page
      .locator('.studio-shell')
      .evaluate((shell) => ({ mode: shell.getAttribute('data-mode') }))
    if (recoveredState.mode !== alias.mode)
      throw new Error(`${alias.path}: recovered to mode ${recoveredState.mode}, expected ${alias.mode}`)
    if (hasFocusFilter(alias)) {
      await page
        .locator('.workspace-filter-switcher')
        .waitFor({ state: 'attached', timeout: 15000 })
        .catch(() => {
          throw new Error(`${alias.path}: recovery lost its focus switcher`)
        })
      if (
        !(await page
          .locator('.workspace-filter-switcher a.active, .workspace-filter-switcher a[aria-current="page"]')
          .count())
      )
        throw new Error(`${alias.path}: recovery lost focus=${alias.focus}`)
    }
    if (await page.locator('.orbit-bar, .page-head, .subnav, .rail').count())
      throw new Error(`${alias.path}: legacy alias rendered the retired shell`)
  }
  await page.goto(`${baseUrl}/#/not-a-real-destination`, { waitUntil: 'networkidle' })
  if ((await page.locator('.route-warning[role="alert"]').count()) !== 1)
    throw new Error('unknown route did not render purposeful recovery')
  const hubThread = await requestJson('/learning/core/threads', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Systems Thinking',
      thread_type: 'understand',
      guiding_question: 'How do systems create behavior over time?',
      definition_of_done: 'Explain and apply core systems concepts.',
      activate: true,
    }),
  })
  const hubStage = await requestJson(`/learning/core/threads/${hubThread.id}/stages`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Level 0 — Orientation',
      objective: 'Build the map before studying the full theory.',
      position: 0,
    }),
  })
  const hubLesson = await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/lessons`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Map the system',
      content: 'Identify the system boundary and its feedback loops.',
      position: 0,
    }),
  })
  const hubItem = await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/items`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Explain the map from memory',
      item_type: 'recall_prompt',
      evidence_type: 'free_recall',
      position: 0,
    }),
  })
  const hubSourcePush = await requestJson('/recommendations/push', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: 'hub_source_e2e',
        video_title: 'Hub visible source',
        video_url: 'https://example.com/hub-visible-source',
        creator: 'E2E',
        content_type: 'article',
        status: 'active',
      },
    ]),
  })
  const hubSourceId = hubSourcePush.items?.[0]?.id || 'hub_source_e2e'
  await requestJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/hub-visible-source',
      title: 'Hub visible source',
      branch_id: 'fixture-branch-id',
    }),
  })
  await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/sources`, {
    method: 'POST',
    body: JSON.stringify({
      recommendation_id: hubSourceId,
      role: 'foundation',
      expected_contribution: 'Visible source link for the Hub stage.',
      position: 0,
    }),
  })
  const hubRead = await requestJson('/learning/core/hub')
  if (!hubRead.paths.some((path) => path.id === hubThread.id && path.stage_count === 1))
    throw new Error('Learning Hub read model omitted the authored stage')
  await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/start`, { method: 'POST' })
  await requestJson(`/learning/core/threads/${hubThread.id}/stages/${hubStage.id}/items/${hubItem.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'satisfied' }),
  })
  const compassContextWithThread = await requestJson('/compass/context')
  if (
    !compassContextWithThread.thread_coverage?.some(
      (anchor) => anchor.thread_id === hubThread.id && anchor.label === 'Systems Thinking',
    ) ||
    compassContextWithThread.coverage_policy?.complete !== true
  )
    throw new Error('Compass context omitted complete learning Thread coverage')
  await requestJson(`/learning/core/threads/${hubThread.id}/lessons/${hubLesson.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  })
  const hubPath = await requestJson(`/learning/core/threads/${hubThread.id}/path`)
  if (
    hubPath.stages[0].progress.completed !== 1 ||
    hubPath.stages[0].status !== 'completed' ||
    hubPath.thread.status !== 'completed'
  )
    throw new Error('Learning Hub did not complete the Level and Thread from direct lesson completion')
  const hubNote = await requestJson('/notes', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Path-level reflection',
      kind: 'note',
      thread_id: hubThread.id,
      sections: [
        { section_key: 'body', label: 'Notes', content: 'The map comes before the theory.', direction: 'auto' },
      ],
    }),
  })
  const hubStageNote = await requestJson('/notes', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Stage-level checkpoint',
      kind: 'note',
      stage_id: hubStage.id,
      sections: [{ section_key: 'body', label: 'Notes', content: 'Orientation done.', direction: 'auto' }],
    }),
  })
  const hubNotes = await requestJson(`/notes/hub?thread_id=${hubThread.id}`)
  if (
    !hubNotes.notes.some((note) => note.id === hubNote.id) ||
    hubNotes.notes.some((note) => note.id === hubStageNote.id)
  )
    throw new Error('hub path notes read model is wrong')
  const hubStageNotes = await requestJson(`/notes/hub?stage_id=${hubStage.id}`)
  if (
    !hubStageNotes.notes.some((note) => note.id === hubStageNote.id) ||
    hubStageNotes.notes.some((note) => note.id === hubNote.id)
  )
    throw new Error('hub stage notes read model is wrong')
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
  const hubThreadCard = await requestJson('/learning/srs/create', {
    method: 'POST',
    body: JSON.stringify({
      thread_id: hubThread.id,
      question: 'إيه سؤال مسار التعلم؟',
      answer: 'إزاي الأنظمة بتصنع السلوك بمرور الوقت؟',
    }),
  })
  const hubStageCard = await requestJson('/learning/srs/create', {
    method: 'POST',
    body: JSON.stringify({ stage_id: hubStage.id, question: 'إيه اللي يسبق النظرية؟', answer: 'بناء الخريطة.' }),
  })
  const hubFiles = await requestJson(`/artifacts/hub?thread_id=${hubThread.id}`)
  if (!hubFiles.files.some((file) => file.id === hubUploadBody.id && file.filename === 'hub-path.txt'))
    throw new Error('hub files read model omitted the uploaded file')
  const globalArtifacts = await requestJson('/artifacts')
  if (globalArtifacts.artifacts.some((file) => file.id === hubUploadBody.id))
    throw new Error('global files list leaked a hub-owned file')
  for (const [id] of [
    [hubUploadBody.id, 'hub-path.txt'],
    [hubStageUploadBody.id, 'hub-stage.txt'],
    [chapterArtifact.id, 'artifact-only-chapter.html'],
  ]) {
    const exact = await requestJson(`/artifacts/${encodeURIComponent(id)}/record`)
    if (exact.artifact.id !== id) throw new Error('exact scoped file record returned the wrong identity')
    await page.goto(`${baseUrl}/#/library/artifact/${encodeURIComponent(id)}`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: exact.artifact.filename, exact: true }).waitFor({ state: 'visible' })
    await page.getByRole('heading', { name: 'Artifact access', exact: true }).waitFor({ state: 'visible' })
    if (await page.locator('.object-inspector').count()) throw new Error('file page rendered a second inspector')
  }
  const hubPathLoaded = await requestJson(`/learning/core/threads/${hubThread.id}/path`)
  if (
    !hubPathLoaded.notes.some((note) => note.id === hubNote.id) ||
    !hubPathLoaded.files.some((file) => file.id === hubUploadBody.id) ||
    !hubPathLoaded.cards.some((card) => card.id === hubThreadCard.card_id)
  )
    throw new Error('path read model omitted Thread-owned notes, files, or cards')
  if (
    hubPathLoaded.notes.some((note) => note.id === hubStageNote.id) ||
    hubPathLoaded.cards.some((card) => card.id === hubStageCard.card_id)
  )
    throw new Error('Thread direct material leaked a Level-owned record')
  if (
    !hubPathLoaded.stages[0].notes.some((note) => note.id === hubStageNote.id) ||
    !hubPathLoaded.stages[0].files.some((file) => file.id === hubStageUploadBody.id) ||
    !hubPathLoaded.stages[0].cards.some((card) => card.id === hubStageCard.card_id)
  )
    throw new Error('path read model omitted Level-owned notes, files, or cards')
  if (
    hubPathLoaded.stages[0].notes.some((note) => note.id === hubNote.id) ||
    hubPathLoaded.stages[0].cards.some((card) => card.id === hubThreadCard.card_id)
  )
    throw new Error('Level material leaked a Thread-owned record')
  await page.goto(`${baseUrl}/#/learn?mode=paths`, { waitUntil: 'networkidle' })
  await page.locator('.folio-paths').waitFor({ state: 'visible' })
  await verifyThreadDesk({ page, baseUrl, requestJson })
  await page.getByRole('button', { name: 'All', exact: true }).click()
  if (!(await page.getByRole('link', { name: 'Revisit Thread: Systems Thinking' }).count()))
    throw new Error('Learn Paths did not render an explicit Thread review affordance')
  await page.goto(`${baseUrl}/#/learn/thread/${hubThread.id}`, { waitUntil: 'networkidle' })
  await page.locator('.thread-command-center').waitFor({ state: 'visible' })
  await page.locator('.vertical-thread-spine').waitFor({ state: 'visible' })
  if (!(await page.getByRole('heading', { level: 1, name: 'Systems Thinking' }).count()))
    throw new Error('typed Thread route is missing its Thread h1')
  if (
    (await page.locator('.course-stage-context').getByRole('link', { name: 'Threads' }).getAttribute('href')) !==
    '#/learn?mode=paths'
  )
    throw new Error('Thread breadcrumb does not return to the Threads index')
  if (
    !(await page.getByLabel('Thread lesson progress').count()) ||
    !(await page.locator('.vertical-journey-meta').count())
  )
    throw new Error('Vertical Journey does not show direct lesson progress and Level completion state')
  if (
    (await page.locator('.vertical-thread-overview > .vertical-thread-ledger').count()) !== 1 ||
    (await page.locator('.vertical-journey-list > li').count()) !== 1
  )
    throw new Error('Thread Now view did not render its compact resources and Level journey')
  const overviewLevelLink = page
    .locator('.vertical-journey-list')
    .getByRole('link', { name: 'Level 0 — Orientation', exact: true })
  if (
    (await overviewLevelLink.getAttribute('href')) !==
    `#/learn/thread/${hubThread.id}?tab=curriculum&level=${hubStage.id}`
  )
    throw new Error('Now Level link did not return through the Thread Lessons tab')
  if (await page.locator('.learn-workspace-shell > .workspace-mode-switcher').count())
    throw new Error('typed Thread route retained the competing global Learn switcher')
  for (const tab of ['Now', 'Lessons', 'Projects', 'Resources'])
    if (!(await page.getByRole('link', { name: new RegExp(`^${tab}`) }).count()))
      throw new Error(`Thread command center omitted ${tab}`)
  if (await page.getByRole('link', { name: 'Evidence', exact: true }).count())
    throw new Error('Thread command center exposed the retired Evidence tab')
  await page.getByRole('link', { name: /^Lessons/ }).click()
  await page.locator('.vertical-curriculum').waitFor({ state: 'visible' })
  if ((await page.locator('.vertical-curriculum-journey > li.is-expanded').count()) !== 1)
    throw new Error('Lessons did not keep exactly one Level expanded')
  await page.getByRole('button', { name: /Level 0 — Orientation/ }).click()
  if (!page.url().includes(`tab=curriculum&level=${hubStage.id}`))
    throw new Error('Lesson disclosure did not preserve the exact Level in the URL')
  await page.getByRole('link', { name: /^Projects/ }).click()
  await page.locator('.vertical-practice').waitFor({ state: 'visible' })
  if (
    (await page.locator('.vertical-practice-journey > li.is-expanded').count()) !== 1 ||
    !(await page.getByText('Projects are optional practice.').count())
  )
    throw new Error('Projects did not render the one-Level non-gating journey')
  await page.getByRole('link', { name: /^Resources/ }).click()
  await page.locator('.vertical-materials').waitFor({ state: 'visible' })
  if (
    !(await page.getByText('Direct Thread material').count()) ||
    !(await page.getByRole('link', { name: 'Path-level reflection' }).count()) ||
    !(await page.getByRole('link', { name: 'إيه سؤال مسار التعلم؟' }).count())
  )
    throw new Error(
      `Learn Thread did not render direct Thread material: ${await page.locator('.thread-command-center').innerText()}`,
    )
  const levelMaterialOwner = page.getByRole('button', { name: /Level 0 — Orientation/ })
  if (!(await levelMaterialOwner.count())) throw new Error('Learn Thread did not aggregate its Level material owner')
  await levelMaterialOwner.click()
  if (
    !(await page.getByRole('link', { name: 'Stage-level checkpoint' }).count()) ||
    !(await page.getByRole('link', { name: 'hub-level.txt' }).count()) ||
    !(await page.getByRole('link', { name: 'إيه اللي يسبق النظرية؟' }).count())
  )
    throw new Error('Learn Thread did not reveal the exact Level-owned materials')
  if (!page.url().includes(`#/learn/thread/${hubThread.id}`))
    throw new Error('typed Thread route did not preserve identity')
  if (await page.locator('.orbit-bar, .page-head, .subnav, .main-focus').count())
    throw new Error('focused Learning Thread rendered retired shell selectors')
  await page.goto(`${baseUrl}/#/learn/t/${hubThread.id}/v/${hubStage.id}`, { waitUntil: 'networkidle' })
  await page
    .locator('.course-level-materials > summary')
    .getByText('Level workspace')
    .waitFor({ state: 'visible', timeout: 15000 })
  if (
    (await page.getByRole('link', { name: 'Lessons', exact: true }).getAttribute('href')) !==
    `#/learn/thread/${hubThread.id}?tab=curriculum&level=${hubStage.id}`
  )
    throw new Error('typed Level route did not expose a path back to the Thread Lessons tab')
  if (await page.locator('.course-level-list').evaluate((node) => node.hasAttribute('open')))
    throw new Error('typed Level route reopened the unbounded full-Thread Level wall')
  if (await page.locator('.course-level-materials').evaluate((node) => node.hasAttribute('open')))
    throw new Error('Level materials should use progressive disclosure')
  await page.locator('.course-level-materials > summary').click()
  if (
    !(await page.getByRole('link', { name: 'Stage-level checkpoint' }).count()) ||
    !(await page.getByRole('link', { name: 'hub-level.txt' }).count()) ||
    !(await page.getByRole('link', { name: 'إيه اللي يسبق النظرية؟' }).count())
  )
    throw new Error(
      `Level route did not render its owned materials: ${await page.locator('.folio-thread').innerText()}`,
    )
  if (!page.url().includes(`#/learn/t/${hubThread.id}/v/${hubStage.id}`))
    throw new Error('typed Level route did not preserve Thread and Level identity')
  const materialHeaders = { 'content-type': 'application/json', 'x-real-ip': 'e2e-learning-materials' }
  const requestMaterialJson = (path, options = {}) =>
    requestJson(path, { ...options, headers: { ...materialHeaders, ...(options.headers || {}) } })
  const materialThread = await requestMaterialJson('/learning/core/threads', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Material launcher fixture',
      thread_type: 'understand',
      guiding_question: 'Which material should I open first?',
      definition_of_done: 'Open the recommended lesson material.',
      activate: true,
    }),
  })
  const materialStage = await requestMaterialJson(`/learning/core/threads/${materialThread.id}/stages`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Level 1 — Study', objective: 'Use the right rendition for the task.', position: 0 }),
  })
  const materialLesson = await requestMaterialJson(
    `/learning/core/threads/${materialThread.id}/stages/${materialStage.id}/lessons`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Choose the right material',
        objective: 'Start with the guided companion and keep alternatives close.',
        position: 0,
        estimated_minutes: 18,
      }),
    },
  )
  const materialNextLesson = await requestMaterialJson(
    `/learning/core/threads/${materialThread.id}/stages/${materialStage.id}/lessons`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Compare source formats',
        objective: 'Choose a format based on the learning task.',
        content: 'Compare the available formats against the task.',
        position: 1,
        estimated_minutes: 12,
      }),
    },
  )
  await requestMaterialJson(`/learning/core/threads/${materialThread.id}/stages/${materialStage.id}/lessons`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Record the useful distinction',
      objective: 'Retain the decision rule for future sources.',
      position: 2,
      estimated_minutes: 10,
    }),
  })
  const materialLessonNote = await requestMaterialJson('/notes', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Lesson-owned observation',
      lesson_id: materialLesson.id,
      sections: [
        { section_key: 'body', label: 'Notes', content: 'This belongs only to the lesson.', direction: 'auto' },
      ],
    }),
  })
  const materialLessonCard = await requestMaterialJson('/learning/srs/create', {
    method: 'POST',
    body: JSON.stringify({
      lesson_id: materialLesson.id,
      question: 'أي نطاق يملك البطاقة دي؟',
      answer: 'الدرس المحدد نفسه.',
    }),
  })
  const materialLessonUpload = new FormData()
  materialLessonUpload.append('file', new Blob(['lesson-owned file'], { type: 'text/plain' }), 'lesson-owned.txt')
  materialLessonUpload.append('metadata', JSON.stringify({ lesson_id: materialLesson.id }))
  const materialLessonUploadResponse = await fetch(`${baseUrl}/artifacts`, {
    method: 'POST',
    headers: { 'x-real-ip': 'e2e-learning-materials' },
    body: materialLessonUpload,
  })
  const materialLessonFile = await materialLessonUploadResponse.json()
  if (!materialLessonUploadResponse.ok)
    throw new Error(`Lesson-owned file upload failed: ${JSON.stringify(materialLessonFile)}`)
  const materialScopedPath = await requestMaterialJson(`/learning/core/threads/${materialThread.id}/path`)
  const materialScopedLesson = materialScopedPath.stages[0].lessons.find((lesson) => lesson.id === materialLesson.id)
  if (
    !materialScopedLesson?.notes.some((note) => note.id === materialLessonNote.id) ||
    !materialScopedLesson.files.some((file) => file.id === materialLessonFile.id) ||
    !materialScopedLesson.cards.some((card) => card.id === materialLessonCard.card_id)
  )
    throw new Error('Thread path omitted exact Lesson-owned capture')
  if (
    materialScopedPath.notes.some((note) => note.id === materialLessonNote.id) ||
    materialScopedPath.stages[0].notes.some((note) => note.id === materialLessonNote.id)
  )
    throw new Error('Lesson-owned capture leaked into a parent scope')
  await requestMaterialJson('/recommendations/push', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: 'material_launcher_source',
        video_title: 'Source with learning companions',
        video_url: 'https://example.com/material-launcher-original',
        creator: 'E2E',
        content_type: 'article',
        status: 'active',
      },
      {
        id: 'material_launcher_case',
        video_title: 'Secondary lesson case study',
        video_url: 'https://example.com/material-launcher-case',
        creator: 'E2E',
        content_type: 'article',
        status: 'active',
      },
    ]),
  })
  await requestMaterialJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/material-launcher-original',
      title: 'Source with learning companions',
      branch_id: 'fixture-branch-id',
    }),
  })
  await requestMaterialJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/material-launcher-case',
      title: 'Secondary lesson case study',
      branch_id: 'fixture-branch-id',
    }),
  })
  await requestMaterialJson('/recommendations/action', {
    method: 'POST',
    body: JSON.stringify({
      id: 'material_launcher_source',
      status: 'active',
      notebook_url: 'https://notebooklm.google.com/notebook/material-launcher',
    }),
  })
  await requestMaterialJson('/notebooklm/learning/receipts', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'source',
      recommendation_id: 'material_launcher_source',
      notebook_id: 'material-launcher',
      notebook_url: 'https://notebooklm.google.com/notebook/material-launcher',
      status: 'pending',
    }),
  })
  await requestMaterialJson('/notebooklm/learning/receipts', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'source',
      recommendation_id: 'material_launcher_source',
      notebook_id: 'material-launcher',
      notebook_url: 'https://notebooklm.google.com/notebook/material-launcher',
      status: 'indexed',
      provider_source_id: 'provider-material-source',
    }),
  })
  const materialNotebookPlan = await requestMaterialJson('/notebooklm/learning/route', {
    method: 'POST',
    body: JSON.stringify({ recommendation_id: 'material_launcher_source' }),
  })
  await requestMaterialJson('/notebooklm/learning/receipts', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'artifact',
      recommendation_id: 'material_launcher_source',
      notebook_id: 'material-launcher',
      notebook_url: 'https://notebooklm.google.com/notebook/material-launcher',
      plan_id: materialNotebookPlan.plan_id,
      format: 'quiz',
      status: 'pending',
      provider_task_id: 'provider-material-quiz-task',
      source_grounded: true,
      custom_prompt_applied: true,
    }),
  })
  await requestMaterialJson('/notebooklm/learning/receipts', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'artifact',
      recommendation_id: 'material_launcher_source',
      notebook_id: 'material-launcher',
      notebook_url: 'https://notebooklm.google.com/notebook/material-launcher',
      plan_id: materialNotebookPlan.plan_id,
      format: 'quiz',
      status: 'ready',
      provider_artifact_id: 'provider-material-quiz',
      source_grounded: true,
      custom_prompt_applied: true,
      question_count: 6,
      hints_before_explanations: true,
      transfer_question_count: 1,
    }),
  })
  await requestMaterialJson(`/learning/core/threads/${materialThread.id}/lessons/${materialLesson.id}/sources`, {
    method: 'POST',
    body: JSON.stringify({
      recommendation_id: 'material_launcher_source',
      branch_id: 'fixture-branch-id',
      role: 'primary',
      expected_contribution: 'Explain the source through a verified reading companion.',
      position: 0,
    }),
  })
  await requestMaterialJson(`/learning/core/threads/${materialThread.id}/lessons/${materialLesson.id}/sources`, {
    method: 'POST',
    body: JSON.stringify({
      recommendation_id: 'material_launcher_case',
      branch_id: 'fixture-branch-id',
      role: 'case',
      expected_contribution: 'Apply the lesson through a contrasting case.',
      position: 1,
    }),
  })
  const materialPairId = 'material-launcher-pair'
  const materialHtmlUpload = new FormData()
  materialHtmlUpload.append(
    'file',
    new Blob(['<!doctype html><html lang="ar" dir="rtl"><body><main><h1>رفيق القراءة</h1></main></body></html>'], {
      type: 'text/html',
    }),
    'material-launcher.html',
  )
  materialHtmlUpload.append(
    'metadata',
    JSON.stringify({
      recommendation_id: 'material_launcher_source',
      pair_id: materialPairId,
      role: 'html',
      recommended_start: 'html',
      revision: '2',
      language: 'ar',
    }),
  )
  const materialHtmlResponse = await fetch(`${baseUrl}/artifacts`, {
    method: 'POST',
    headers: { 'x-real-ip': 'e2e-learning-materials' },
    body: materialHtmlUpload,
  })
  const materialHtml = await materialHtmlResponse.json()
  if (!materialHtmlResponse.ok) throw new Error(`material launcher HTML upload failed: ${JSON.stringify(materialHtml)}`)
  const materialPdfUpload = new FormData()
  materialPdfUpload.append(
    'file',
    new Blob(['%PDF-1.4\n% material launcher fixture\n'], { type: 'application/pdf' }),
    'material-launcher.pdf',
  )
  materialPdfUpload.append(
    'metadata',
    JSON.stringify({
      recommendation_id: 'material_launcher_source',
      pair_id: materialPairId,
      role: 'pdf',
      recommended_start: 'html',
      revision: '2',
      language: 'ar',
      page_count: 12,
    }),
  )
  const materialPdfResponse = await fetch(`${baseUrl}/artifacts`, {
    method: 'POST',
    headers: { 'x-real-ip': 'e2e-learning-materials' },
    body: materialPdfUpload,
  })
  const materialPdf = await materialPdfResponse.json()
  if (!materialPdfResponse.ok) throw new Error(`material launcher PDF upload failed: ${JSON.stringify(materialPdf)}`)
  await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/l/${materialLesson.id}`, { waitUntil: 'networkidle' })
  await page.locator('.course-lesson-page').waitFor({ state: 'visible', timeout: 15000 })
  if (
    (await page
      .locator('.course-stage-context')
      .getByRole('link', { name: 'Level 0', exact: true })
      .getAttribute('href')) !== `#/learn/thread/${materialThread.id}?tab=curriculum&level=${materialStage.id}`
  )
    throw new Error('Lesson breadcrumb did not return to its exact Level inside the Thread Lessons tab')
  if (
    !(await page.getByText('Ready to study', { exact: true }).count()) ||
    !(await page.getByRole('button', { name: 'Mark lesson complete' }).count())
  )
    throw new Error('Available Level lesson did not expose direct completion')
  await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/v/${materialStage.id}`, { waitUntil: 'networkidle' })
  if (await page.getByRole('button', { name: 'Start Level' }).count())
    throw new Error('Level workspace still exposes the retired manual start gate')
  await page.getByRole('link', { name: 'Open first lesson' }).click()
  await page.getByRole('button', { name: 'Mark lesson complete' }).waitFor({ state: 'visible' })
  await page.locator('.course-level-materials > summary').click()
  for (const ownedMaterial of ['Lesson-owned observation', 'lesson-owned.txt', 'أي نطاق يملك البطاقة دي؟'])
    if (!(await page.getByText(ownedMaterial, { exact: true }).count()))
      throw new Error(`Lesson workspace omitted ${ownedMaterial}`)
  const moreMaterials = page.locator('.lesson-more-sources')
  if ((await moreMaterials.count()) !== 1 || (await moreMaterials.getAttribute('open')) !== null)
    throw new Error('Lesson did not keep secondary material behind one closed disclosure')
  await moreMaterials.locator('summary').click()
  if (!(await page.getByText('Secondary lesson case study', { exact: true }).count()))
    throw new Error('Lesson did not reveal its secondary material')
  const formatActions = page.locator('.lesson-source-start .course-material-icon-action')
  if ((await formatActions.count()) !== 4)
    throw new Error('Lesson launcher did not reduce HTML, Original, PDF, and NotebookLM to four compact actions')
  const primaryMaterial = page.locator('.lesson-source-start .course-material-icon-action.material-html.is-primary')
  if (
    (await primaryMaterial.count()) !== 1 ||
    (await primaryMaterial.getAttribute('href')) !== `/artifacts/${materialHtml.id}`
  )
    throw new Error('Lesson launcher did not preserve the recommended HTML companion as the primary icon')
  const primaryLabel = ((await primaryMaterial.getAttribute('aria-label')) || '').toLowerCase()
  for (const copy of ['recommended', 'read the html companion', 'arabic', 'revision 2'])
    if (!primaryLabel.includes(copy))
      throw new Error(`Lesson HTML icon omitted accessible purpose or metadata: ${primaryLabel}`)
  for (const kind of ['original', 'pdf', 'notebooklm'])
    if ((await page.locator(`.lesson-source-start .course-material-icon-action.material-${kind}`).count()) !== 1)
      throw new Error(`Lesson launcher omitted the ${kind} icon action`)
  if (await page.locator('.course-source-links, .course-sources .folio-file-badge').count())
    throw new Error('Lesson launcher still renders the old equal material badges')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/#/learn/t/${materialThread.id}/l/${materialLesson.id}`, { waitUntil: 'networkidle' })
  if (
    !(await page.locator('.lesson-source-start .course-material-icon-action.is-primary').isVisible()) ||
    (await page.locator('.lesson-source-start .course-material-icon-action').count()) !== 4
  )
    throw new Error('Lesson launcher lost its compact format actions on mobile')
  if ((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) > 2)
    throw new Error('Lesson material launcher introduced mobile horizontal overflow')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Mark lesson complete' }).click()
  await page.waitForURL((url) => url.hash === `#/learn/t/${materialThread.id}/l/${materialNextLesson.id}`)
  await page.getByRole('heading', { level: 1, name: 'Compare source formats' }).waitFor({ state: 'visible' })
  const advancedMaterialPath = await requestMaterialJson(`/learning/core/threads/${materialThread.id}/path`)
  const advancedMaterialStage = advancedMaterialPath.stages.find((stage) => stage.id === materialStage.id)
  const advancedMaterialLesson = advancedMaterialStage?.lessons.find((lesson) => lesson.id === materialNextLesson.id)
  if (advancedMaterialStage?.status !== 'in_progress' || advancedMaterialLesson?.status !== 'in_progress')
    throw new Error('Lesson completion did not atomically start the next ordered lesson and refresh the path')
  for (const artifact of [materialHtml, materialPdf, materialLessonFile]) {
    const cleanup = await fetch(`${baseUrl}/artifacts/${artifact.id}`, {
      method: 'DELETE',
      headers: { 'x-real-ip': 'e2e-learning-materials' },
    })
    if (!cleanup.ok) throw new Error(`material launcher fixture cleanup failed for ${artifact.id}`)
  }
  const [capabilities, systemInventory] = await Promise.all([
    requestJson('/agent/capabilities'),
    requestJson('/agent/system'),
  ])
  if (!capabilities.capabilities?.some((operation) => operation.method === 'GET' && operation.path === '/agent/system'))
    throw new Error('agent capabilities omitted the System inventory route')
  if (
    !Array.isArray(systemInventory.schedule) ||
    systemInventory.schedule.length !== 1 ||
    systemInventory.schedule[0].cron !== '0 */6 * * *'
  )
    throw new Error('System inventory omitted the configured maintenance schedule')
  if (
    !Array.isArray(systemInventory.on_demand_only) ||
    !systemInventory.storage?.length ||
    !systemInventory.safety?.length
  )
    throw new Error('System inventory contract is incomplete')
  if (systemInventory.data_quality?.scope !== 'active_sources' || systemInventory.data_quality?.checks?.length !== 5)
    throw new Error(
      `System inventory omitted the explicit data-quality contracts: ${JSON.stringify(systemInventory.data_quality)}`,
    )
  if (
    !systemInventory.data_quality.checks.every(
      (check) => Number.isFinite(check.affected) && Number.isFinite(check.coverage_percent),
    )
  )
    throw new Error('Data-quality contracts omitted exact affected counts or coverage')
  if (systemInventory.counts?.sources !== systemInventory.data_quality.counts?.stored_sources)
    throw new Error('System source inventory changed from stored-source semantics')
  await page.goto(`${baseUrl}/#/settings?mode=system`, { waitUntil: 'networkidle' })
  await page.locator('.system-console').waitFor({ state: 'visible', timeout: 15000 })
  if ((await page.locator('.api-operation-list article').count()) !== capabilities.capabilities.length)
    throw new Error('System page does not expose every allow-listed API operation')
  await page.getByLabel('Search path or capability').fill('schedule')
  if ((await page.locator('.api-operation-list article').count()) < 1)
    throw new Error('System API search did not return matching operations')
  await page.getByLabel('Search path or capability').fill('')
  await page.goto(`${baseUrl}/#/settings?mode=data`, { waitUntil: 'networkidle' })
  await page.locator('.personal-data-studio').waitFor({ state: 'visible', timeout: 15000 })
  if ((await page.locator('.personal-data-visual').count()) !== 4)
    throw new Error('Data Studio omitted a real type, status, activity, or branch visualization')
  await page.getByLabel('Search records').fill('E2E Personal Series')
  const personalSeriesRow = page.locator('.personal-data-row', { hasText: 'E2E Personal Series' })
  await personalSeriesRow.waitFor({ state: 'visible', timeout: 15000 })
  await personalSeriesRow.getByRole('button', { name: 'Edit' }).click()
  await personalSeriesRow.getByLabel('Rating (0–10)').fill('9')
  await personalSeriesRow.getByLabel('Personal note').fill('Edited from the visual data ledger.')
  const personalEditResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/capture/personal/${personalSeries.item.id}`) && response.request().method() === 'PATCH',
  )
  await personalSeriesRow.getByRole('button', { name: 'Save changes' }).click()
  if (!(await personalEditResponse).ok())
    throw new Error('Data Studio inline edit did not reach the canonical personal API')
  await page
    .getByText('The edit is recorded in the data lineage.', { exact: false })
    .waitFor({ state: 'visible', timeout: 15000 })
  const editedSeriesReadback = await requestJson(`/capture/personal/${personalSeries.item.id}`)
  if (
    editedSeriesReadback.item?.rating !== 9 ||
    editedSeriesReadback.item?.personal_note !== 'Edited from the visual data ledger.'
  )
    throw new Error('Data Studio inline edit did not survive canonical readback')
  await page.setViewportSize({ width: 390, height: 844 })
  if ((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) > 2)
    throw new Error('Data Studio introduced mobile horizontal overflow')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.data-trust-panel').waitFor({ state: 'visible', timeout: 15000 })
  if ((await page.locator('.data-trust-check').count()) !== 5)
    throw new Error('Data & recovery did not render all five named trust contracts')
  const dataTrustText = await page.locator('.data-trust-panel').innerText()
  for (const label of [
    'Source identity',
    'Branch coverage',
    'Canonical source uniqueness',
    'Learning-event lineage',
    'Feed branch defaults',
  ])
    if (!dataTrustText.includes(label)) throw new Error(`Data & recovery omitted ${label}`)
  await page.goto(`${baseUrl}/#/settings`, { waitUntil: 'networkidle' })
  await page.locator('.profile-settings-page').waitFor({ state: 'visible' })
  const profileBody = await page.locator('.workspace-canvas').innerText()
  for (const value of [
    'Profile rendering fixture',
    'Deep systems thinking',
    'Reaction style',
    'Priorities',
    'Mastered knowledge',
    'Exclusions',
    'Learned patterns',
    'Creator history',
    'Taste affinities',
    'Recent reflections',
    'Recent ratings',
  ]) {
    if (!profileBody.toLowerCase().includes(value.toLowerCase()))
      throw new Error(`profile page is missing rendered value or section: ${value}`)
  }
  if (!profileBody.includes('Readable fixture branch') || profileBody.includes('fixture-branch-id'))
    throw new Error(
      `profile taste affinities leaked an internal branch id instead of the branch label (label=${profileBody.includes('Readable fixture branch')}, id=${profileBody.includes('fixture-branch-id')})`,
    )
  if (profileBody.includes('Priority topics configured.'))
    throw new Error('profile page still renders the fake priority placeholder')
  if (profileBody.includes('{"malformed":')) throw new Error('profile page exposed raw JSON in its normal view')
  if ((await page.locator('.profile-tag-list').count()) < 1)
    throw new Error('profile page did not render visual topic tags')
  if ((await page.locator('.profile-settings-page .profile-record').count()) < 1)
    throw new Error('profile records did not render')
  const homeCompletionThread = await requestJson('/learning/core/threads', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Home completion fixture',
      thread_type: 'practice',
      guiding_question: 'Can Home close one lesson without losing context?',
      definition_of_done: 'Complete both lessons directly.',
      activate: true,
    }),
  })
  const homeCompletionStage = await requestJson(`/learning/core/threads/${homeCompletionThread.id}/stages`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Level 1 — Home flow',
      objective: 'Keep completion inside the current desk.',
      position: 0,
    }),
  })
  const homeCompletionLesson = await requestJson(
    `/learning/core/threads/${homeCompletionThread.id}/stages/${homeCompletionStage.id}/lessons`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Finish this lesson from Home',
        content: 'A complete lesson body makes direct completion available.',
        position: 0,
      }),
    },
  )
  const homeCompletionNextLesson = await requestJson(
    `/learning/core/threads/${homeCompletionThread.id}/stages/${homeCompletionStage.id}/lessons`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Continue from Home',
        content: 'The next lesson should replace the completed turn without navigation.',
        position: 1,
      }),
    },
  )
  await requestJson(`/learning/core/threads/${homeCompletionThread.id}/stages/${homeCompletionStage.id}/start`, {
    method: 'POST',
  })
  await requestJson(`/learning/core/threads/${homeCompletionThread.id}/lessons/${homeCompletionLesson.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'in_progress' }),
  })
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
  if (settings.resolved?.learning?.retention !== 90 || settings.resolved?.learning?.queue_cap !== 5)
    throw new Error('settings defaults are not resolved')
  if (
    settings.resolved?.srs_drafts?.minimum_rating !== 7 ||
    settings.resolved?.profile_proposals?.review_required !== true ||
    settings.resolved?.profile_automation?.mode !== 'manual' ||
    settings.resolved?.recommendation_engine?.mode !== 'shadow'
  )
    throw new Error('learning automation defaults are incorrect')
  if (manifest.id !== '/' || manifest.start_url !== '/#/home' || manifest.display !== 'standalone')
    throw new Error('manifest is missing the Android standalone launch contract')
  if (!manifest.icons?.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'))
    throw new Error('manifest is missing the 192px Android launcher icon')
  if (!manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'))
    throw new Error('manifest is missing the 512px Android launcher icon')
  if (!manifest.icons?.some((icon) => icon.purpose === 'maskable'))
    throw new Error('manifest is missing a maskable Android launcher icon')
  if (manifest.share_target?.action !== '/api/share-target')
    throw new Error('manifest lost the Android source share target')
  if (!manifest.shortcuts?.some((shortcut) => shortcut.url?.includes('action=capture')))
    throw new Error('manifest is missing the Android Capture shortcut')
  if ((await page.locator('link[rel="manifest"][href="/manifest.json"]').count()) !== 1)
    throw new Error('application shell does not link the install manifest')
  await page.evaluate(() => navigator.serviceWorker?.ready)
  if ((await page.evaluate(() => document.documentElement.dataset.serviceWorker)) !== 'ready')
    throw new Error('application shell did not register its service worker')
  const offlineCompanionUpload = new FormData()
  offlineCompanionUpload.append(
    'file',
    new Blob(
      [
        '<!doctype html><html><head><title>Offline companion fixture</title></head><body><main><h1>Offline companion fixture</h1><p>Exact cached reading body.</p></main></body></html>',
      ],
      { type: 'text/html' },
    ),
    'offline-companion.html',
  )
  const offlineCompanionResponse = await fetch(`${baseUrl}/artifacts`, { method: 'POST', body: offlineCompanionUpload })
  const offlineCompanion = await offlineCompanionResponse.json()
  if (!offlineCompanionResponse.ok)
    throw new Error(`offline HTML companion upload failed: ${JSON.stringify(offlineCompanion)}`)
  const offlineCompanionPath = `/artifacts/${offlineCompanion.id}`
  await page.goto(`${baseUrl}${offlineCompanionPath}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Offline companion fixture' }).waitFor({ state: 'visible' })
  const artifactServiceWorker = page
    .context()
    .serviceWorkers()
    .find((worker) => new URL(worker.url()).pathname === '/sw.js')
  if (!artifactServiceWorker)
    throw new Error('artifact cache verification could not find the registered service worker')
  const offlineCompanionCached = await artifactServiceWorker.evaluate(
    async ({ cacheName, path }) => Boolean(await (await caches.open(cacheName)).match(path)),
    { cacheName: 'learning-compass-html-artifacts-v2', path: offlineCompanionPath },
  )
  if (!offlineCompanionCached) throw new Error('opened HTML companion was not stored in the isolated artifact cache')
  await page.context().setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Offline companion fixture' }).waitFor({ state: 'visible' })
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'domcontentloaded' })
  await page.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
  await page.context().setOffline(false)
  const offlineCompanionDelete = await fetch(`${baseUrl}${offlineCompanionPath}`, { method: 'DELETE' })
  if (!offlineCompanionDelete.ok) throw new Error('offline HTML companion fixture cleanup failed')
  await page.goto(`${baseUrl}/#/home?action=capture`, { waitUntil: 'networkidle' })
  await page.locator('.capture-dialog').waitFor({ state: 'visible' })
  if ((await page.locator('#capture-branch-input').count()) !== 1)
    throw new Error('Capture dialog omitted the required branch selector')
  await page.locator('#capture-source-input').fill('https://example.com/capture-branch-contract')
  const captureSubmit = page.locator('.capture-dialog').getByRole('button', { name: 'Save source' })
  if (await captureSubmit.isEnabled()) throw new Error('Capture dialog enabled save before a branch was selected')
  await page.locator('#capture-branch-input').selectOption('fixture-branch-id')
  if (!(await captureSubmit.isEnabled())) throw new Error('Capture dialog did not accept a verified branch selection')
  await page.getByRole('button', { name: 'Close capture dialog' }).click()
  await page.locator('.capture-dialog').waitFor({ state: 'detached' })
  if (!page.url().includes('#/home') || page.url().includes('action=capture'))
    throw new Error('Android Capture shortcut did not return Home')
  if (!Array.isArray(artifacts.artifacts)) throw new Error('artifact library contract is invalid')
  if (!Array.isArray(feeds.feeds)) throw new Error('feed subscriptions contract is invalid')
  const missingFeedBranch = await fetch(`${baseUrl}/capture/feeds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/feed.xml', limit: 5 }),
  })
  if (missingFeedBranch.status !== 400)
    throw new Error(`feed subscription accepted a missing default branch (${missingFeedBranch.status})`)
  if (!Array.isArray(manualArchive.recommendations)) throw new Error('manual archive contract is invalid')
  if (!Array.isArray(balance.branches) || balance.window_days !== 90 || !balance.portfolio)
    throw new Error('learning balance contract is invalid')
  if (!Array.isArray(proposals.proposals)) throw new Error('feedback proposal contract is invalid')
  if (!Array.isArray(cards.cards)) throw new Error('SRS card management contract is invalid')
  if (
    !Array.isArray(momentum.active_items) ||
    !Array.isArray(momentum.active_threads) ||
    !Array.isArray(momentum.artifacts) ||
    !momentum.momentum ||
    !momentum.insight ||
    !momentum.next_action_detail ||
    !Array.isArray(momentum.recent_wins)
  )
    throw new Error('Momentum workspace contract is invalid')
  if (balance.branches?.[0]?.id) {
    const branchId = encodeURIComponent(String(balance.branches[0].id))
    await page.goto(`${baseUrl}/#/map/branch/${branchId}`, { waitUntil: 'networkidle' })
    const inspectorItemLink = page.getByRole('link', { name: 'Open full item page', exact: true })
    if (
      (await page.locator('.object-inspector').count()) !== 1 ||
      !(await inspectorItemLink.getAttribute('href')).includes(`/map/branch/${branchId}`)
    )
      throw new Error('typed map branch inspector did not link to its owning item route')
  }
  const resurfacingNavigationSource = await requestJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/e2e-resurfacing-record',
      title: 'E2E resurfacing source record',
      branch_id: 'fixture-branch-id',
    }),
  })
  const resurfacingRoutePattern = /\/brain\/resurfacing\?limit=5$/
  const resurfacingPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    extraHTTPHeaders: { 'x-real-ip': 'e2e-resurfacing-browser' },
  })
  await resurfacingPage.route(resurfacingRoutePattern, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        item: {
          recommendation_id: resurfacingNavigationSource.id,
          title: 'E2E resurfacing source record',
          creator: 'E2E fixture',
          content_type: 'article',
          source_url: 'https://example.com/e2e-resurfacing-record',
          due_at: '2026-09-01',
          starred: false,
          branch: { id: 'fixture-branch-id', label: 'Readable fixture branch' },
          domain: { id: 'cat-mind', label: 'Mind' },
          companions: {},
          presentation: { id: 'e2e-resurfacing-presentation' },
        },
      }),
    })
  })
  await resurfacingPage.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  await resurfacingPage.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
  const resurfacingRecordLink = resurfacingPage.getByRole('link', {
    name: 'Open source record: E2E resurfacing source record',
  })
  await resurfacingRecordLink.waitFor({ state: 'visible', timeout: 15000 })
  if (
    (await resurfacingRecordLink.getAttribute('href')) !==
    `#/library/source/${encodeURIComponent(resurfacingNavigationSource.id)}`
  )
    throw new Error('Home resurfacing card did not target the matching source id')
  await resurfacingPage.locator('.folio-home-resurfacing').click({ position: { x: 24, y: 24 } })
  await resurfacingPage.locator('.folio-object-view').waitFor({ state: 'visible', timeout: 15000 })
  if (!resurfacingPage.url().includes(`#/library/source/${encodeURIComponent(resurfacingNavigationSource.id)}`))
    throw new Error('Home resurfacing card did not preserve the source identity in its destination')
  await resurfacingPage.getByRole('heading', { name: 'Source access', exact: true }).waitFor({ state: 'visible' })
  const resurfacingBranch = resurfacingPage.locator('.item-page-context').getByRole('link', {
    name: 'Readable fixture branch',
    exact: true,
  })
  if (
    !(await resurfacingBranch.isVisible()) ||
    (await resurfacingBranch.getAttribute('href')) !== '#/map/branch/fixture-branch-id'
  )
    throw new Error('Home resurfacing destination lost its verified branch badge')
  const resurfacingSections = resurfacingPage.getByRole('navigation', { name: 'Item sections', exact: true })
  for (const [label, heading] of [
    ['Recall', 'Recall cards'],
    ['Reflection', 'Feedback & outcome'],
    ['Files', 'Files & reading companions'],
  ]) {
    await resurfacingSections.getByRole('link', { name: new RegExp('^' + label) }).click()
    await resurfacingPage.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' })
  }
  await resurfacingPage.close()
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  await page.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
  const homeBody = await page.locator('.workspace-canvas').innerText()
  for (const value of ['Current source', 'Current rotation', 'Queue', 'RSS Feeds']) {
    if (!homeBody.toLowerCase().includes(value.toLowerCase())) throw new Error(`Home is missing ${value}: ${homeBody}`)
  }
  if ((await page.locator('.folio-home-focus').count()) !== 1)
    throw new Error('Home must expose exactly one current-source focus')
  const homeThreadTurns = page.locator('.folio-home-thread-list .folio-home-thread-lesson')
  await homeThreadTurns.first().waitFor({ state: 'visible', timeout: 15000 })
  if ((await homeThreadTurns.count()) !== momentum.active_threads.length)
    throw new Error(
      `Home must show exactly one current turn from every Thread (${await homeThreadTurns.count()}/${momentum.active_threads.length})`,
    )
  const homeCompletionTurn = homeThreadTurns.filter({ hasText: 'Home completion fixture' })
  const homeFinishButton = homeCompletionTurn.getByRole('button', {
    name: 'Finish lesson: Finish this lesson from Home',
  })
  await homeFinishButton.waitFor({ state: 'visible' })
  const homeFinishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/learning/core/threads/${homeCompletionThread.id}/lessons/${homeCompletionLesson.id}`) &&
      response.request().method() === 'PATCH',
  )
  await homeFinishButton.click()
  if (!(await homeFinishResponse).ok()) throw new Error('Home lesson completion mutation failed')
  await homeCompletionTurn
    .getByRole('button', { name: 'Finished: Finish this lesson from Home' })
    .waitFor({ state: 'visible' })
  await homeCompletionTurn
    .getByText('Continue from Home', { exact: true })
    .waitFor({ state: 'visible', timeout: 15000 })
  if (!page.url().includes('#/home')) throw new Error('Home lesson completion navigated away from Home')
  const homeCompletionPath = await requestJson(`/learning/core/threads/${homeCompletionThread.id}/path`)
  if (
    homeCompletionPath.stages[0].lessons.find((lesson) => lesson.id === homeCompletionLesson.id)?.status !==
      'completed' ||
    homeCompletionPath.stages[0].lessons.find((lesson) => lesson.id === homeCompletionNextLesson.id)?.status !==
      'in_progress'
  )
    throw new Error('Home lesson completion did not automatically start the next ordered lesson')

  await page.goto(`${baseUrl}/#/library?mode=assets&focus=files`, { waitUntil: 'networkidle' })
  if (artifacts.artifacts.length === 0) {
    await page.locator('.folio-files-view .state-empty').waitFor({ state: 'visible', timeout: 15000 })
  } else {
    await page.locator('.folio-files-view').waitFor({ state: 'visible', timeout: 15000 })
    if (!(await page.locator('.folio-files-view').innerText()).includes('Generated companions'))
      throw new Error('Files view is missing its library header')
    if ((await page.locator('.folio-file-record').count()) < 1)
      throw new Error('Files view did not render the artifact groups')
  }

  const missingCaptureBranch = await fetch(`${baseUrl}/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'https://example.com/missing-branch', title: 'Missing branch test' }),
  })
  if (missingCaptureBranch.status !== 400)
    throw new Error(`capture accepted a missing branch (${missingCaptureBranch.status})`)
  const captured = await requestJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/hermes-e2e',
      title: 'Hermes automation test',
      branch_id: 'fixture-branch-id',
    }),
  })
  const [capturedSources, queueBeforeTriage] = await Promise.all([
    requestJson('/capture'),
    requestJson('/capture/queue'),
  ])
  if (!capturedSources.items.some((item) => item.id === captured.id))
    throw new Error('new capture did not enter durable source storage')
  if (queueBeforeTriage.items.some((item) => item.id === captured.id))
    throw new Error('new capture bypassed deliberate triage and entered Queue')
  const preRecord = await requestJson(`/capture/${captured.id}/record`)
  if (!preRecord.item || preRecord.item.branch_id !== 'fixture-branch-id')
    throw new Error('source record API did not return the atomically captured branch')
  const thread = await requestJson('/learning/core/threads', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Test a decision with evidence',
      thread_type: 'decide',
      guiding_question: 'Should this mechanism be used?',
      definition_of_done: 'Record a source-backed decision and synthesis.',
      activate: true,
    }),
  })
  await requestJson(`/capture/${captured.id}/triage`, {
    method: 'POST',
    body: JSON.stringify({ action: 'queue', thread_id: thread.id }),
  })
  await requestJson(`/learning/core/threads/${thread.id}/sources`, {
    method: 'POST',
    body: JSON.stringify({
      recommendation_id: captured.id,
      role: 'primary',
      expected_contribution: 'Supply the mechanism and its limits.',
    }),
  })
  await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(captured.id)}`, { waitUntil: 'networkidle' })
  await page.locator('.folio-object-view').waitFor({ state: 'visible', timeout: 15000 })
  if (!(await page.getByRole('heading', { name: 'Source access' }).isVisible()))
    throw new Error('typed source route is missing source access')
  if (!page.url().includes(`#/library/source/${captured.id}`))
    throw new Error('typed source route did not preserve the captured source identity')
  if (await page.locator('.object-inspector').count())
    throw new Error('typed source route rendered a redundant side inspector beside its full-page record')
  const itemSections = page.getByRole('navigation', { name: 'Item sections', exact: true })
  for (const [label, heading] of [
    ['Files', 'Files & reading companions'],
    ['Notes & passages', 'Notes'],
    ['Recall', 'Recall cards'],
    ['Connections', 'Connected knowledge'],
    ['History', 'Learning history'],
    ['Reflection', 'Feedback & outcome'],
  ]) {
    await itemSections.getByRole('link', { name: new RegExp('^' + label) }).click()
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' })
    if (await page.locator('.route-recovered').count())
      throw new Error('an ordinary item section was mislabeled as a restored legacy route')
  }
  const itemReflection = page.locator('.source-feedback-panel').getByRole('textbox', { name: /Your reflection/ })
  await itemReflection.fill('A local draft retained while browsing item sections.')
  await itemSections.getByRole('link', { name: /^Files/ }).click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Files & reading companions', exact: true }).waitFor({ state: 'visible' })
  if (!page.url().includes('tab=files')) throw new Error('item section was lost on reload')
  await itemSections.getByRole('link', { name: /^Reflection/ }).click()
  await itemReflection.fill('A local draft retained while browsing item sections.')
  await itemSections.getByRole('link', { name: /^Notes & passages/ }).click()
  await page.goBack()
  await itemReflection.waitFor({ state: 'visible' })
  if ((await itemReflection.inputValue()) !== 'A local draft retained while browsing item sections.')
    throw new Error('switching item sections discarded an unsaved reflection')
  const passiveRecord = await requestJson(`/capture/${captured.id}/record`)
  if (
    passiveRecord.sessions.length !== preRecord.sessions.length ||
    passiveRecord.notes.length !== preRecord.notes.length
  )
    throw new Error('browsing item pages created learning work')
  await itemSections.getByRole('link', { name: /^Overview/ }).click()
  const started = await requestJson('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ recommendation_id: captured.id, thread_id: thread.id, target_kind: 'original' }),
  })
  const returned = await requestJson(`/sessions/${started.session_id}/return`, {
    method: 'POST',
    body: JSON.stringify({
      reflection: 'The mechanism is useful and I will apply it.',
      rating: 7,
      disposition: 'apply',
      complete: true,
    }),
  })
  if (
    returned.status !== 'completed' ||
    returned.disposition !== 'apply' ||
    !returned.reflection_note_id ||
    returned.recall_eligible !== false ||
    returned.srs_eligible !== false ||
    !returned.consolidation?.id
  )
    throw new Error('explicit application disposition did not start note-only consolidation')
  const sourceRecord = await requestJson(`/capture/${captured.id}/record`)
  if (
    !sourceRecord.notes.some(
      (note) =>
        note.kind === 'reflection' &&
        note.sections.some((section) => section.content.includes('The mechanism is useful')),
    )
  )
    throw new Error('source record did not return the exact reflection')
  await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(captured.id)}?tab=notes`, {
    waitUntil: 'networkidle',
  })
  // The session was completed through the API above; refresh the mounted item's snapshot.
  await page.reload({ waitUntil: 'networkidle' })
  const attachedNote = sourceRecord.notes.find((note) => note.kind === 'reflection')
  await page.locator(`a[href^="#/learn/note/${attachedNote.id}"]`).first().click()
  await page.locator('.scholar-note-workspace').waitFor({ state: 'visible' })
  await page
    .getByRole('navigation', { name: 'Related material' })
    .getByRole('link', { name: 'Source files', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Files & reading companions', exact: true }).waitFor({ state: 'visible' })
  if (!page.url().includes(captured.id)) throw new Error('note-to-files navigation lost the source identity')
  await page.screenshot({ path: '/tmp/learning-compass-item-page-desktop.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('navigation', { name: 'Item sections' })
    .getByRole('link', { name: /^Notes & passages/ })
    .click()
  await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor({ state: 'visible' })
  const itemMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  if (itemMobileOverflow > 2) throw new Error(`item page overflows mobile by ${itemMobileOverflow}px`)
  const itemTabHeights = await page
    .locator('.item-sections a')
    .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height))
  if (itemTabHeights.some((height) => height < 44)) throw new Error('item sections lost their mobile touch targets')
  await page.screenshot({ path: '/tmp/learning-compass-item-page-mobile.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const initialJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter(
    (job) => job.payload.recommendation_id === captured.id,
  )
  if (
    initialJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 ||
    initialJobs.filter((job) => job.job_type === 'extract_notes').length !== 1
  )
    throw new Error('explicit apply did not queue exactly one feedback and extraction job')
  const claim = async (jobType) => {
    const job = (await requestJson('/agent/jobs?status=pending')).jobs.find((item) => item.job_type === jobType)
    if (!job) throw new Error(`missing pending ${jobType} job`)
    return (
      await requestJson(`/agent/jobs/${job.id}/claim`, { method: 'POST', body: JSON.stringify({ worker: 'e2e' }) })
    ).job
  }
  const feedbackJob = await claim('process_feedback')
  const feedbackCompletion = await requestJson(`/agent/jobs/${feedbackJob.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      worker: 'e2e',
      proposals: [
        {
          change_type: 'profile_signal',
          target_label: 'Learning priority',
          current: 'old',
          proposed: 'new',
          evidence: 'The reflection explicitly values the mechanism.',
          reasoning: 'Positive signal at rating 7.',
          confidence: 0.9,
        },
      ],
    }),
  })
  const proposalId = feedbackCompletion.proposals?.created?.[0]
  const pendingProposal = (await requestJson('/feedback/proposals')).proposals.find(
    (proposal) => proposal.id === proposalId,
  )
  if (pendingProposal?.status !== 'pending' || pendingProposal?.decision_source != null)
    throw new Error('manual profile automation did not hold the proposal for review')
  await requestJson(`/feedback/proposals/${proposalId}/approve`, { method: 'POST' })
  const appliedProposal = (await requestJson('/feedback/proposals')).proposals.find(
    (proposal) => proposal.id === proposalId,
  )
  if (appliedProposal?.status !== 'applied' || appliedProposal?.decision_source !== 'user')
    throw new Error('approved proposal did not apply through the profile policy')
  const agentContextAfterApplyResponse = await fetch(`${baseUrl}/agent/context`)
  const agentContextAfterApply = await agentContextAfterApplyResponse.json()
  if (
    agentContextAfterApplyResponse.status !== 503 ||
    agentContextAfterApply.health?.sections?.learning_gaps?.status !== 'degraded' ||
    agentContextAfterApply.learning_gaps !== null
  )
    throw new Error('agent context disguised the non-canonical learning-gap projection as healthy')
  if (
    !agentContextAfterApply.profile?.assertions?.some(
      (assertion) => assertion.assertion_key === appliedProposal.validation?.assertion_key,
    )
  )
    throw new Error('agent context omitted the typed adaptive profile')
  const feedbackContextAfterApply = await requestJson('/feedback/context')
  if (
    !feedbackContextAfterApply.profile_assertions?.some(
      (assertion) => assertion.assertion_key === appliedProposal.validation?.assertion_key,
    )
  )
    throw new Error('Taste Mapper context omitted the typed adaptive profile')
  await requestJson(`/feedback/proposals/${proposalId}/revert`, { method: 'POST' })
  const revertedProposal = (await requestJson('/feedback/proposals')).proposals.find(
    (proposal) => proposal.id === proposalId,
  )
  if (revertedProposal?.status !== 'reverted') throw new Error('Activity did not revert the automatic profile change')
  if ((await requestJson('/agent/jobs?status=pending')).jobs.some((job) => job.job_type === 'apply_feedback_proposal'))
    throw new Error('proposal approval created a redundant application job')
  const extractJob = await claim('extract_notes')
  const sourceNoteBody = `The fixture preserves one complete source-shaped note instead of imposing generic Foundation or Case Study sections. It explains the test mechanism in source order, keeps its limitation visible, and gives the retained idea one exact locator. The mechanism requires checking available evidence before applying a rule; otherwise confidence outruns the source. The note stays readable prose rather than a collection of generated cards.\n\n> الفكرة الأساسية هي مراجعة الدليل المتاح قبل تطبيق الآلية.\n\nThe source-specific limitation is that this fixture demonstrates the contract rather than a real-world causal result.`
  const sourceNoteWordCount = sourceNoteBody.match(/[\p{L}\p{N}]+/gu)?.length || 0
  const automatedDraftResponse = await fetch(`${baseUrl}/agent/jobs/${extractJob.id}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worker: 'e2e', srs_drafts: [{ question: 'سؤال تلقائي؟', answer: 'إجابة تلقائية.' }] }),
  })
  if (
    automatedDraftResponse.status !== 422 ||
    !(await automatedDraftResponse.json()).failures?.some((failure) =>
      failure.includes('automated recall drafting is disabled'),
    )
  )
    throw new Error('source-note extraction accepted an automatically generated flash card')
  await requestJson(`/agent/jobs/${extractJob.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      worker: 'e2e',
      extraction: {
        contract: 'source_note_v2',
        complete: true,
        adapter: 'direct_text',
        source_hash: 'a'.repeat(64),
        source_word_count: 200,
        note_word_count: sourceNoteWordCount,
        coverage_status: 'complete',
      },
      note: {
        id: 'e2e_source_note',
        recommendation_id: captured.id,
        title: 'Hermes extraction fixture',
        kind: 'guide',
        abstract: 'A source-shaped extraction contract fixture.',
        source_url: 'https://example.com/hermes-e2e',
        sections: [{ section_key: 'body', label: 'Source note', content: sourceNoteBody }],
      },
      learning_units: [
        {
          id: 'e2e_unit',
          unit_type: 'method',
          statement: 'Check the available evidence before applying the mechanism.',
          user_synthesis: 'I should test the evidence before using it.',
          stance: 'accept',
          confidence: 0.9,
          role: 'core',
          anchors: [
            {
              anchor_type: 'section',
              locator: 'Fixture body',
              excerpt: 'checking available evidence before applying a rule',
            },
          ],
        },
      ],
      reflection: {
        content: 'Handwritten margin note from page 2.',
        recommendation_id: captured.id,
        source_url: 'https://example.com/hermes-e2e',
      },
    }),
  })
  const extractedNotes = (await requestJson('/notes')).notes
  if (
    !extractedNotes.some((note) => note.id === 'e2e_source_note') ||
    !extractedNotes.some(
      (note) =>
        note.kind === 'reflection' &&
        note.sections.some((section) => section.content.includes('Handwritten margin note')),
    )
  )
    throw new Error('extractor did not keep source note and handwritten reflection separate')
  const guideNotes = (await requestJson('/notes?kind=guide')).notes
  if (
    !guideNotes.some((note) => note.id === 'e2e_source_note') ||
    guideNotes.some((note) => note.kind === 'reflection')
  )
    throw new Error('guide notes library leaked reflections into the extracted scope')
  const consolidatedRecord = await requestJson(`/capture/${captured.id}/record`)
  if (
    consolidatedRecord.consolidation?.state !== 'closed' ||
    !consolidatedRecord.learning_units.some((unit) => unit.id === 'e2e_unit' && unit.anchors.length === 1) ||
    !consolidatedRecord.threads.some((item) => item.id === thread.id)
  )
    throw new Error('learning core did not preserve the thread, anchored unit, and terminal consolidation receipt')
  await requestJson(`/learning/core/threads/${thread.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ final_synthesis: 'The mechanism is useful only when its failure modes are checked first.' }),
  })
  await page.goto(`${baseUrl}/#/learn?mode=practice&focus=notes`, { waitUntil: 'networkidle' })
  await page
    .locator('.note-ledger-copy strong', { hasText: 'Hermes extraction fixture' })
    .waitFor({ state: 'visible', timeout: 15000 })
  if (await page.getByText('Handwritten margin note').count())
    throw new Error('Notes library leaked personal reflection content into the extracted library')
  await page.goto(`${baseUrl}/#/learn/note/e2e_source_note`, { waitUntil: 'networkidle' })
  await page.locator('.folio-note-reading').waitFor({ state: 'visible', timeout: 15000 })
  if ((await page.locator('.scholar-note-document').innerText()).includes('status/completed'))
    throw new Error('note reader leaked source front matter into the reading surface')
  if ((await page.locator('.scholar-note-document [dir="rtl"]').count()) < 1)
    throw new Error('note reader did not preserve Arabic reading direction')
  if ((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) > 2)
    throw new Error('note reader introduced horizontal overflow')
  await page.getByRole('button', { name: 'Edit note' }).first().click()
  await page.locator('.folio-note-document').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByRole('heading', { name: 'Foundation' }).waitFor({ state: 'visible', timeout: 15000 })
  if ((await page.locator('.folio-note-meta a').count()) !== 1)
    throw new Error('typed note route is missing its source context link')
  if ((await page.locator('.folio-note-meta a').getAttribute('href')) !== 'https://example.com/hermes-e2e')
    throw new Error('note source context did not preserve the canonical external source URL')
  if ((await requestJson('/srs/drafts')).drafts.some((draft) => draft.recommendation_id === captured.id))
    throw new Error('explicit apply automatically created a flash-card draft')
  const lower = await requestJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/lower-rating',
      title: 'Lower rating test',
      branch_id: 'fixture-branch-id',
    }),
  })
  const lowerSession = await requestJson('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ recommendation_id: lower.id }),
  })
  await requestJson(`/sessions/${lowerSession.session_id}/return`, {
    method: 'POST',
    body: JSON.stringify({
      reflection: 'Useful context but not worth extracting.',
      rating: 5,
      disposition: 'reference',
      complete: true,
    }),
  })
  const lowerJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter(
    (job) => job.payload.recommendation_id === lower.id,
  )
  if (
    lowerJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 ||
    lowerJobs.some((job) => job.job_type === 'extract_notes')
  )
    throw new Error('lower rating feedback/extraction gate is incorrect')
  const progress = await requestJson('/capture', {
    method: 'POST',
    body: JSON.stringify({
      source: 'https://example.com/in-progress-feedback',
      title: 'In-progress feedback test',
      branch_id: 'fixture-branch-id',
    }),
  })
  const progressSession = await requestJson('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ recommendation_id: progress.id }),
  })
  const progressReturn = await requestJson(`/sessions/${progressSession.session_id}/return`, {
    method: 'POST',
    body: JSON.stringify({ reflection: 'I am still reading, but this point matters.', complete: false }),
  })
  if (progressReturn.status !== 'returned') throw new Error('in-progress feedback incorrectly completed the source')
  const progressJobs = (await requestJson('/agent/jobs?status=pending')).jobs.filter(
    (job) => job.payload.recommendation_id === progress.id,
  )
  if (
    progressJobs.filter((job) => job.job_type === 'process_feedback').length !== 1 ||
    progressJobs.some((job) => job.job_type === 'extract_notes')
  )
    throw new Error('in-progress feedback did not queue analysis cleanly')
  const atomicFeedback = await requestJson('/feedback/record', {
    method: 'POST',
    body: JSON.stringify({
      source_url: 'https://example.com/atomic-feedback',
      title: 'Atomic feedback test',
      feedback: 'Preserve these exact words.',
      score: 8,
      completion_state: 'completed',
      reason_tags: ['practical', 'revisit'],
      expected: 'A useful mechanism.',
      actual: 'Useful and concrete.',
      effort: 'deep',
      length_minutes: 45,
    }),
  })
  if (
    atomicFeedback.preserved_feedback !== 'Preserve these exact words.' ||
    atomicFeedback.completion_state !== 'completed' ||
    atomicFeedback.disposition !== 'undecided' ||
    !atomicFeedback.feedback_job ||
    atomicFeedback.extraction_job ||
    atomicFeedback.receipt?.analysis !== 'queued' ||
    atomicFeedback.receipt?.notes !== 'not_requested' ||
    !atomicFeedback.source_page.includes(atomicFeedback.source.id)
  )
    throw new Error('rating-only atomic feedback incorrectly requested extraction')
  const atomicRecord = await requestJson(`/capture/${atomicFeedback.source.id}/record`)
  if (
    !atomicRecord.notes.some(
      (note) =>
        note.kind === 'reflection' &&
        note.sections.some((section) => section.content === 'Preserve these exact words.'),
    )
  )
    throw new Error('atomic feedback did not preserve exact words')
  const atomicStructuredFeedback = JSON.parse(atomicRecord.item.source_metadata_json || '{}').learning_feedback
  if (
    atomicStructuredFeedback?.score !== 8 ||
    atomicStructuredFeedback?.effort !== 'deep' ||
    atomicStructuredFeedback?.length_minutes !== 45 ||
    atomicStructuredFeedback?.expected !== 'A useful mechanism.' ||
    !atomicStructuredFeedback?.reason_tags?.includes('revisit')
  )
    throw new Error('structured feedback was not preserved on the source record')
  const stoppedWithoutReason = await fetch(`${baseUrl}/feedback/record`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': 'e2e-feedback-validation' },
    body: JSON.stringify({
      recommendation_id: atomicFeedback.source.id,
      feedback: 'I stopped here.',
      completion_state: 'stopped',
    }),
  })
  if (stoppedWithoutReason.status !== 400 || (await stoppedWithoutReason.json()).error !== 'stopped_reason_required')
    throw new Error('stopped feedback accepted without an explicit reason')
  browserIp = 'e2e-browser-mobile'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(atomicFeedback.source.id)}?tab=feedback`, {
    waitUntil: 'networkidle',
  })
  await page.locator('.source-feedback-panel').waitFor({ state: 'visible', timeout: 15000 })
  if ((await page.locator('.source-feedback-segments label').count()) !== 3)
    throw new Error('feedback ledger does not expose the three honest completion states')
  if ((await page.locator('.source-feedback-panel textarea').count()) < 3)
    throw new Error('feedback ledger is missing reflection or expectation/result fields')
  const feedbackMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (feedbackMobileOverflow > 2) throw new Error(`feedback ledger mobile overflow ${feedbackMobileOverflow}px`)
  await page.goto(`${baseUrl}/#/library/source/${encodeURIComponent(progress.id)}?tab=feedback`, {
    waitUntil: 'networkidle',
  })
  const progressFeedbackPanel = page.locator('.source-feedback-panel')
  await progressFeedbackPanel.waitFor({ state: 'visible', timeout: 15000 })
  await progressFeedbackPanel.locator('input[type="radio"][value="in_progress"]').check()
  await progressFeedbackPanel
    .getByRole('group', { name: 'Why continue later?' })
    .locator('label')
    .filter({ hasText: /^Continue later$/ })
    .click()
  await progressFeedbackPanel
    .getByRole('textbox', { name: /Your reflection/ })
    .fill('Continue when I have a focused reading block.')
  const feedbackWriteResponse = page.waitForResponse(
    (response) => response.url().endsWith('/feedback/record') && response.request().method() === 'POST',
  )
  await progressFeedbackPanel.getByRole('button', { name: 'Save feedback' }).click()
  const feedbackResponse = await feedbackWriteResponse
  if (!feedbackResponse.ok())
    throw new Error(
      `continue-later feedback write failed (${feedbackResponse.status()}: ${await feedbackResponse.text()})`,
    )
  const neutralReceipt = progressFeedbackPanel.locator('.source-feedback-receipt')
  await neutralReceipt.waitFor({ state: 'visible', timeout: 15000 })
  const neutralReceiptText = await neutralReceipt.innerText()
  if (
    !neutralReceiptText.includes('Feedback saved.') ||
    !neutralReceiptText.includes('neutral timing signal') ||
    !neutralReceiptText.includes('will not count as bad fit')
  )
    throw new Error('continue-later feedback did not render an honest neutral receipt')
  const savedProgressRecord = await requestJson(`/capture/${progress.id}/record`)
  const savedProgressFeedback = JSON.parse(savedProgressRecord.item.source_metadata_json || '{}').learning_feedback
  if (
    savedProgressFeedback?.completion_state !== 'in_progress' ||
    !savedProgressFeedback?.reason_tags?.includes('not_now') ||
    savedProgressFeedback?.disposition !== 'undecided'
  )
    throw new Error('continue-later UI did not persist its structured neutral feedback')
  await page.setViewportSize({ width: 900, height: 1200 })
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  if (!(await page.locator('.mobile-dock').isVisible()) || !(await page.locator('.mobile-utilities').isVisible()))
    throw new Error('tablet shell did not replace the desktop rail with dock and utilities')
  if (await page.locator('.root-rail').isVisible()) throw new Error('desktop root rail remains visible at tablet width')
  const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (tabletOverflow > 2) throw new Error(`tablet Home horizontal overflow ${tabletOverflow}px`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  if (!(await page.locator('.mobile-dock').isVisible())) throw new Error('mobile primary navigation is not visible')
  if (await page.locator('.root-rail').isVisible()) throw new Error('desktop root rail remains visible on mobile')
  if (
    !(await page.locator('.mobile-utilities').isVisible()) ||
    (await page.locator('.mobile-utilities button').count()) !== 2
  )
    throw new Error('mobile shell is missing compact Search and Capture tools')
  if (await page.locator('.folio-home-header > .folio-button').isVisible())
    throw new Error('mobile Home repeats the global Capture action')
  if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count())
    throw new Error('mobile shell rendered a redundant navigation sheet or context pane')
  const mobileRootHrefs = await page
    .locator('.mobile-dock a')
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')))])
  if (mobileRootHrefs.length !== roots.length || roots.some((root) => !mobileRootHrefs.includes(`#/${root}`)))
    throw new Error('mobile dock does not expose the five stable roots')

  await page.goto(`${baseUrl}${publicLearningUpdatePath}`, { waitUntil: 'networkidle' })
  const updateMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (updateMobileOverflow > 2) throw new Error(`public learning update mobile overflow ${updateMobileOverflow}px`)
  const updateMobileAction = await page.getByRole('link', { name: 'Open Learn' }).first().boundingBox()
  if (!updateMobileAction || updateMobileAction.height < 44)
    throw new Error('public learning update mobile action is smaller than 44px')
  if (!(await page.locator('.source-folio').isVisible()) || (await page.locator('.format-row').count()) !== 4)
    throw new Error('public learning update loses its material explanation on mobile')
  const updateMobileScreenshot = await page.screenshot({
    path: join(persistDir, 'learning-materials-update-mobile.png'),
    fullPage: true,
  })
  if (!updateMobileScreenshot.length) throw new Error('public learning update mobile screenshot was empty')
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
  for (const route of modeRoutes) {
    await page.goto(`${baseUrl}/${route.href}`, { waitUntil: 'networkidle' })
    await page.locator(route.expected).waitFor({ state: 'attached', timeout: 15000 })
    if (!(await page.locator('.mobile-dock').isVisible())) throw new Error(`${route.href}: mobile dock disappeared`)
    if ((await page.locator('.mobile-dock a').count()) !== roots.length)
      throw new Error(`${route.href}: mobile dock does not contain exactly five items`)
    if (
      route.root !== 'home' &&
      ((await page.locator('.workspace-mode-switcher').count()) !== 1 ||
        !(await page.locator('.workspace-mode-switcher').isVisible()))
    )
      throw new Error(`${route.href}: internal mode controls are missing on mobile`)
    if (
      route.root === 'library' &&
      route.mode === 'triage' &&
      (await page.locator('.workspace-filter-switcher').count()) !== 1
    )
      throw new Error(`${route.href}: Library filter controls are missing on mobile`)
    if (
      route.root === 'library' &&
      route.mode === 'catalog' &&
      (await page.locator('.workspace-filter-switcher').count())
    )
      throw new Error(`${route.href}: Catalog rendered redundant mobile filter controls`)
    if (
      (route.root === 'learn' && route.mode === 'practice') ||
      (route.root === 'settings' && route.mode === 'personal')
    ) {
      if ((await page.locator('.workspace-filter-switcher').count()) !== 1)
        throw new Error(`${route.href}: focus controls are missing on mobile`)
    }
    if (route.root === 'map' && route.mode === 'review' && (await page.locator('.workspace-filter-switcher').count()))
      throw new Error(`${route.href}: unified Review rendered redundant mobile focus controls`)
    if (await page.locator('.context-pane, .context-scrim, .navigation-sheet').count())
      throw new Error(`${route.href}: mobile rendered a redundant navigation sheet`)
  }
  await page.goto(`${baseUrl}/#/map?mode=review`, { waitUntil: 'networkidle' })
  await page.locator('.branch-dossier-layout').waitFor({ state: 'visible', timeout: 15000 })
  const mobileDossierOrder = await page
    .locator(
      '.branch-dossier-layout > .folio-branch-sidebar, .branch-dossier-layout > .branch-dossier-rail, .branch-dossier-layout > .branch-dossier-main',
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({ className: element.className, top: element.getBoundingClientRect().top })),
    )
  const mobileIndexTop = mobileDossierOrder.find((item) => item.className.includes('folio-branch-sidebar'))?.top
  const mobileDecisionTop = mobileDossierOrder.find((item) => item.className.includes('branch-dossier-rail'))?.top
  const mobileMainTop = mobileDossierOrder.find((item) => item.className.includes('branch-dossier-main'))?.top
  if (
    mobileDossierOrder.length !== 3 ||
    mobileIndexTop == null ||
    mobileDecisionTop == null ||
    mobileMainTop == null ||
    !(mobileIndexTop <= mobileDecisionTop && mobileDecisionTop <= mobileMainTop)
  )
    throw new Error(`mobile Map Review lost index, decision, dossier order: ${JSON.stringify(mobileDossierOrder)}`)
  const mobileDossierOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (mobileDossierOverflow > 2) throw new Error(`mobile Map Review horizontal overflow ${mobileDossierOverflow}px`)
  await page.goto(`${baseUrl}/#/library/book/${encodeURIComponent(directBook.book.id)}`, { waitUntil: 'networkidle' })
  await page.locator('.book-overview-fold').waitFor({ state: 'visible', timeout: 15000 })
  const mobileBookOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (mobileBookOverflow > 2) throw new Error(`mobile book overview horizontal overflow ${mobileBookOverflow}px`)
  const mobileBookActions = await page
    .locator('.book-overview-fold button, .book-overview-fold select, .book-overview-fold summary')
    .evaluateAll((controls) =>
      controls
        .filter((control) => control instanceof HTMLElement && control.offsetParent !== null)
        .map((control) => ({
          target: `${control.tagName.toLowerCase()}.${[...control.classList].join('.')}`,
          height: control.getBoundingClientRect().height,
        })),
    )
  if (mobileBookActions.some((control) => control.height < 44))
    throw new Error(`mobile book overview exposed undersized controls: ${JSON.stringify(mobileBookActions)}`)
  await page.goto(`${baseUrl}/#/library`, { waitUntil: 'networkidle' })
  await page.locator('.folio-books-view.books-room').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.books-library-panel').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.canon-room-panel').waitFor({ state: 'visible', timeout: 15000 })
  const mobileBooksAccess = await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
    document.documentElement.style.setProperty('--font-scale', '2')
    const targets = [
      ...document.querySelectorAll(
        '.folio-books-view a[href], .folio-books-view button, .folio-books-view input, .folio-books-view select, .folio-books-view summary',
      ),
    ]
      .filter((target) => target instanceof HTMLElement && target.offsetParent !== null)
      .map((target) => {
        const bounds = target.getBoundingClientRect()
        return {
          width: bounds.width,
          height: bounds.height,
          target: `${target.tagName.toLowerCase()}.${[...target.classList].join('.')}`,
          name: target.getAttribute('aria-label') || target.textContent?.trim().slice(0, 48) || '',
        }
      })
    const view = document.querySelector('.folio-books-view')
    const dock = document.querySelector('.mobile-dock')
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      undersized: targets.filter((target) => target.width < 44 || target.height < 44),
      bottomPadding: view ? parseFloat(getComputedStyle(view).paddingBottom) : 0,
      dockHeight: dock?.getBoundingClientRect().height || 0,
    }
  })
  if (
    mobileBooksAccess.overflow > 2 ||
    mobileBooksAccess.undersized.length ||
    mobileBooksAccess.bottomPadding < mobileBooksAccess.dockHeight
  )
    throw new Error(
      `mobile Books failed 200% text, 44px targets, or dock clearance: ${JSON.stringify(mobileBooksAccess)}`,
    )
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
    document.documentElement.style.removeProperty('--font-scale')
  })
  await page.goto(`${baseUrl}/#/home`, { waitUntil: 'networkidle' })
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
  if (!(await page.locator('.mobile-dock').isVisible()))
    throw new Error('offline Android shell lost its primary navigation')
  await page.context().setOffline(false)

  const androidPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    extraHTTPHeaders: { 'x-real-ip': 'e2e-android-browser' },
  })
  androidPage.setDefaultNavigationTimeout(20_000)
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
  if (
    (await androidPage.getByRole('button', { name: 'Install app' }).count()) !== 1 ||
    (await androidPage.getByRole('button', { name: 'Not now' }).count()) !== 1
  )
    throw new Error('Android install card is missing its explicit install and dismissal actions')
  await androidPage.getByRole('button', { name: 'Not now' }).click()
  await androidPage.locator('.android-install-banner').waitFor({ state: 'detached' })
  if (serverExit)
    throw new Error(`Worker exited before the Android offline check (${JSON.stringify(serverExit)}):\n${serverLog}`)
  await Promise.race([
    androidPage.evaluate(() => navigator.serviceWorker.ready.then(() => true)),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`service worker readiness timed out; Worker exit=${JSON.stringify(serverExit)}:\n${serverLog}`),
          ),
        15_000,
      ),
    ),
  ])
  await androidPage.context().setOffline(true)
  await androidPage.reload({ waitUntil: 'domcontentloaded' })
  await androidPage.locator('.folio-home-workspace').waitFor({ state: 'visible', timeout: 15000 })
  await androidPage.context().setOffline(false)
  await androidPage.close()

  console.log(
    `E2E passed: five root destinations, ${count} internal mode states, typed objects, Android shell/HTML offline behavior, and mobile shell`,
  )
} finally {
  await browser?.close()
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      server.kill('SIGTERM')
    }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) {
      try {
        process.kill(-server.pid, 'SIGKILL')
      } catch {
        server.kill('SIGKILL')
      }
    }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
