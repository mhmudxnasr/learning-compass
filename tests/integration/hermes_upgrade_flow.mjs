import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-hermes-test-'))
let server

try {
  const run = async (args) => {
    const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    const status = await new Promise((resolve) => child.on('close', resolve))
    if (status !== 0) throw new Error(`D1 setup failed (${status}): ${output.slice(0, 400)}`)
  }
  await run([
    'd1',
    'execute',
    'recommendations-db',
    '--local',
    '--config',
    'wrangler.toml',
    '--persist-to',
    persistDir,
    '--file',
    'schema.sql',
  ])
  await run([
    'd1',
    'migrations',
    'apply',
    'recommendations-db',
    '--local',
    '--config',
    'wrangler.toml',
    '--persist-to',
    persistDir,
  ])
  server = spawn(
    wrangler,
    [
      'dev',
      '--config',
      'wrangler.toml',
      '--persist-to',
      persistDir,
      '--port',
      '8789',
      '--var',
      'ALLOW_UNAUTHENTICATED_LOCAL_WRITES:true',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  server.stdout.on('data', () => {})
  server.stderr.on('data', () => {})
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:8789/health/live')).ok) break
    } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const req = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8789${path}`, {
      headers: { 'content-type': 'application/json' },
      ...options,
    })
    return { status: response.status, body: await response.json() }
  }
  const query = async (command) => {
    const child = spawn(
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
        '--command',
        command,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    const status = await new Promise((resolve) => child.on('close', resolve))
    if (status !== 0) throw new Error(`D1 query failed (${status}): ${output.slice(0, 400)}`)
    const json = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
    return json
  }

  const captureOptions = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-mutation-id': 'integration-capture-1' },
    body: JSON.stringify({
      source: 'https://example.com/integration-source',
      title: 'Integration source',
      branch_id: 'systems-thinking',
    }),
  }
  const captured = await req('/capture', captureOptions)
  assert.equal(captured.status, 201)
  const replayedCapture = await req('/capture', captureOptions)
  assert.equal(replayedCapture.status, 201)
  assert.equal(replayedCapture.body.id, captured.body.id)
  const record = await req(`/capture/${captured.body.id}/record`)
  assert.equal(record.status, 200)
  assert.equal(record.body.item.id, captured.body.id)
  const excluded = await req(`/capture/${captured.body.id}/triage`, {
    method: 'POST',
    body: JSON.stringify({ action: 'exclude' }),
  })
  assert.equal(excluded.status, 200)
  // Phase 1 observability: inbox-triage exclusions must record a learnable reason.
  const excludedOutcome = (
    await query(`SELECT rejection_reason FROM recommendation_outcomes WHERE recommendation_id='${captured.body.id}'`)
  ).results[0]
  assert.ok(excludedOutcome && excludedOutcome.rejection_reason, 'triage exclusion should record a rejection_reason')

  const analytics = await req('/analytics/hermes')
  assert.equal(analytics.status, 200)
  assert.equal(analytics.body.jobs.dead_letters, 0)
  assert.ok(Number(analytics.body.quality.population.total) >= 1)
  assert.ok(Number(analytics.body.quality.population.administrative_exclusions) >= 1)

  const repairPreview = await req('/analytics/hermes/repair')
  assert.equal(repairPreview.status, 200)
  assert.equal(repairPreview.body.dry_run, true)
  assert.ok(repairPreview.body.snapshot_id)
  const repairWithoutConversation = await req('/analytics/hermes/repair', {
    method: 'POST',
    body: JSON.stringify({ apply: true, snapshot_id: repairPreview.body.snapshot_id }),
  })
  assert.equal(repairWithoutConversation.status, 400)
  const repairApplied = await req('/analytics/hermes/repair', {
    method: 'POST',
    body: JSON.stringify({
      apply: true,
      snapshot_id: repairPreview.body.snapshot_id,
      conversation_id: 'integration-conversation',
    }),
  })
  assert.equal(repairApplied.status, 200)
  assert.equal(repairApplied.body.ok, true)
  const repairedPreview = await req('/analytics/hermes/repair')
  assert.equal(repairedPreview.status, 200)
  assert.equal(repairedPreview.body.summary.changes_required, 0)

  const profileIntelligence = await req('/brain/profile/intelligence')
  assert.equal(profileIntelligence.status, 200)
  assert.equal(profileIntelligence.body.model_version, 'profile_v2')

  const improvement = await req('/analytics/hermes/improvements', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: 'integration-conversation',
      layer: 'code',
      risk_level: 'high',
      confidence: 0.95,
      evidence: [{ source: 'integration-test' }],
      before: { version: 'baseline' },
      rollback_version: 'baseline',
    }),
  })
  assert.equal(improvement.status, 201)
  const improvementCompleted = await req(`/analytics/hermes/improvements/${improvement.body.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      status: 'deployed',
      validation: { passed: true, checks: ['integration'] },
      after: { version: 'candidate' },
      deployed_version: 'candidate',
      rollback_version: 'baseline',
      deployment: { smoke: 'passed' },
    }),
  })
  assert.equal(improvementCompleted.status, 200)
  assert.equal(improvementCompleted.body.status, 'deployed')
  const improvementReverted = await req(`/analytics/hermes/improvements/${improvement.body.id}/revert`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'integration rollback' }),
  })
  assert.equal(improvementReverted.status, 200)
  assert.equal(improvementReverted.body.status, 'reverted')

  const noChange = await req('/analytics/hermes/improvements', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: 'integration-conversation',
      layer: 'hermes',
      confidence: 0.93,
      evidence: [{ source: 'integration-test', finding: 'candidate already covered' }],
      before: { skill: 'current' },
    }),
  })
  assert.equal(noChange.status, 201)
  const noChangeCompleted = await req(`/analytics/hermes/improvements/${noChange.body.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      status: 'no_change',
      after: { changed: false },
      validation: { no_change: true, reason: 'Existing behavior already satisfies the evidence.' },
    }),
  })
  assert.equal(noChangeCompleted.status, 200)
  assert.equal(noChangeCompleted.body.status, 'validated')
  assert.equal(noChangeCompleted.body.decision, 'no_change')

  const failedImprovement = await req('/analytics/hermes/improvements', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: 'integration-conversation',
      layer: 'hermes',
      confidence: 0.91,
      evidence: [{ source: 'integration-test', finding: 'replay failed' }],
      before: { skill: 'current' },
    }),
  })
  assert.equal(failedImprovement.status, 201)
  const failedCompleted = await req(`/analytics/hermes/improvements/${failedImprovement.body.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      status: 'failed',
      error: 'Replay did not pass.',
      after: { changed: false },
      validation: { passed: false, resumable: true },
    }),
  })
  assert.equal(failedCompleted.status, 200)
  assert.equal(failedCompleted.body.status, 'failed')
  assert.equal(failedCompleted.body.resumable, true)

  const memory = await req('/agent/memory', {
    method: 'POST',
    body: JSON.stringify({
      memory_key: 'integration.test.rule',
      memory_kind: 'durable',
      value: { rule: 'keep evidence' },
      confidence: 0.9,
      source: 'integration-test',
      evidence: [{ source: 'integration-test', reason: 'Validated by the integration workflow', confidence: 0.9 }],
    }),
  })
  assert.equal(memory.status, 201)
  const listed = await req('/agent/memory?kind=durable')
  assert.equal(listed.status, 200)
  assert.equal(listed.body.memories.length, 1)
  const resolved = await req(`/agent/memory/${memory.body.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'rejected' }),
  })
  assert.equal(resolved.status, 200)

  const unboundRecalibration = await req('/analytics/hermes/recalibrate', { method: 'POST' })
  assert.equal(unboundRecalibration.status, 400)
  const insufficient = await req('/analytics/hermes/recalibrate', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: 'integration-conversation' }),
  })
  assert.equal(insufficient.status, 409)
  const seedSql = `INSERT INTO recommendation_outcomes (id,recommendation_id,actual_score,predicted_components_json,outcome_status,training_eligible,learning_value,objective_version) VALUES ${Array.from({ length: 20 }, (_, index) => `('quality_${index}','quality_rec_${index}',${6 + (index % 5)},'{"personal_pull":${0.6 + (index % 4) / 10},"source_quality":0.8}','consumed',1,${0.6 + (index % 5) / 10},'learning_value_v2')`).join(',')}`
  const seed = spawn(
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
      '--command',
      seedSql,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let seedOutput = ''
  seed.stdout.on('data', (chunk) => {
    seedOutput += chunk
  })
  seed.stderr.on('data', (chunk) => {
    seedOutput += chunk
  })
  const seedStatus = await new Promise((resolve) => seed.on('close', resolve))
  assert.equal(seedStatus, 0, seedOutput)
  const recalibrated = await req('/analytics/hermes/recalibrate', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: 'integration-conversation' }),
  })
  assert.equal(recalibrated.status, 200)
  assert.ok(recalibrated.body.run_id)
  assert.equal(recalibrated.body.sample_size, 20)
  assert.ok(recalibrated.body.deltas.personal_pull > 0)
  const engine = await req('/analytics/hermes/engine')
  assert.equal(engine.status, 200)
  assert.equal(engine.body.setting.mode, 'shadow')
  assert.equal(engine.body.ready, false)
  const activationBlocked = await req('/analytics/hermes/engine/activate', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: 'integration-conversation' }),
  })
  assert.equal(activationBlocked.status, 409)
  const backfill = await req('/analytics/hermes/backfill', { method: 'POST', body: JSON.stringify({ dry_run: true }) })
  assert.equal(backfill.status, 200)
  assert.equal(backfill.body.dry_run, true)
  assert.ok(Number.isInteger(backfill.body.missing_outcomes))
  const weekly = await req('/analytics/hermes/weekly')
  assert.equal(weekly.status, 200)
  assert.ok(weekly.body.period && weekly.body.accuracy)
  assert.equal((await req('/analytics/hermes/evaluate', { method: 'POST' })).status, 400)
  const evaluated = await req('/analytics/hermes/evaluate', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: 'integration-conversation' }),
  })
  assert.equal(evaluated.status, 200)
  assert.ok(evaluated.body.run_id)
  const capabilities = await req('/agent/capabilities')
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/agent/jobs/:id/replay'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/analytics/hermes/recalibrate'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/analytics/hermes/backfill'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/analytics/hermes/repair'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/analytics/hermes/engine'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/brain/profile/intelligence'))
  const afterReject = await req('/analytics/hermes')
  assert.ok(Number(afterReject.body.quality.population.administrative_exclusions) >= 1)
  const push = await req('/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'browser://integration-device', keys: {} }),
  })
  assert.equal(push.status, 201)
  const reminderTest = await req('/notifications/test', {
    method: 'POST',
    body: JSON.stringify({ channel: 'browser' }),
  })
  assert.equal(reminderTest.status, 200)
  assert.equal(reminderTest.body.status, 'queued')
  const notificationState = await req('/notifications')
  assert.equal(notificationState.status, 200)
  assert.ok(notificationState.body.deliveries.length >= 1)
  const largeBatch = Array.from({ length: 210 }, (_, index) => ({
    id: `large_${index}`,
    video_title: `Large library source ${index}`,
    video_url: `https://example.com/large-${index}`,
    content_type: 'article',
    dedup_key: `large_${index}`,
    status: 'active',
  }))
  const pushed = await req('/recommendations/push', { method: 'POST', body: JSON.stringify(largeBatch) })
  assert.equal(pushed.status, 200)
  const secondPage = await req('/recommendations/list?limit=200&offset=200')
  assert.equal(secondPage.status, 200)
  assert.ok(secondPage.body.total >= 211)
  assert.ok(secondPage.body.recommendations.length >= 10)
  await query(`INSERT INTO artifacts (id,filename,media_type,r2_key,size_bytes,metadata_json) VALUES
    ('retire-html','companion.html','text/html','retirement/html',20,'{"pair_id":"retirement-pair","generator":"lite-visual","recommendation_id":"large_0","publication_state":"ready","role":"html"}'),
    ('retire-pdf','companion.pdf','application/pdf','retirement/pdf',20,'{"pair_id":"retirement-pair","generator":"lite-visual","recommendation_id":"large_0","publication_state":"ready","role":"pdf"}');`)
  const pairPath = '/artifacts/pairs/retirement-pair/record'
  const originalPair = await req(pairPath)
  assert.equal(originalPair.status, 200)
  assert.equal(originalPair.body.pair.can_retire, true)
  const retirement = await req('/agent/request', {
    method: 'POST',
    body: JSON.stringify({
      method: 'POST',
      path: '/artifacts/pairs/retirement-pair/retire',
      idempotency_key: 'integration-retire-pair',
      body: {
        confirm: true,
        recommendation_id: 'large_0',
        html_artifact_id: 'retire-html',
        pdf_artifact_id: 'retire-pdf',
      },
      precondition: { path: pairPath, field: 'pair', equals: originalPair.body.pair },
      verify: { path: pairPath, field: 'pair.retired', equals: true },
    }),
  })
  assert.equal(retirement.status, 200, JSON.stringify(retirement.body))
  assert.equal(retirement.body.verified, true)
  assert.equal(retirement.body.receipt.after.data.pair.retired, true)
  for (const id of ['retire-html', 'retire-pdf']) {
    const record = await req(`/artifacts/${id}/record`)
    assert.equal(record.status, 200)
    assert.equal(record.body.artifact.metadata.publication_state, 'superseded')
  }
  const preservedSource = await req('/capture/large_0/record')
  assert.equal(preservedSource.status, 200)
  assert.equal(preservedSource.body.item.id, 'large_0')
  for (const statement of `
    INSERT INTO learning_threads (id,title,thread_type,guiding_question,definition_of_done)
      VALUES ('bounded-thread','Large Thread','understand','Question','Outcome');
    INSERT INTO learning_path_stages (id,thread_id,title,position,status)
      VALUES ('bounded-level','bounded-thread','Orientation',0,'in_progress'),
             ('bounded-empty','bounded-thread','Empty',1,'verified');
    INSERT INTO thread_lessons (id,thread_id,stage_id,title,position,status,content)
      VALUES ('bounded-a','bounded-thread','bounded-level','Completed',0,'completed',hex(zeroblob(600000))),
             ('bounded-b','bounded-thread','bounded-level','Current',1,'in_progress','body'),
             ('bounded-c','bounded-thread','bounded-level','Future',2,'not_started',NULL);
    INSERT INTO thread_lesson_sources (lesson_id,recommendation_id,role,position)
      VALUES ('bounded-b','${captured.body.id}','primary',0);
    INSERT INTO artifacts (id,filename,media_type,r2_key,metadata_json)
      VALUES ('bounded-receipt','evidence.html','text/html','bounded/evidence',
        json_object('recommendation_id','${captured.body.id}','provider_receipt',hex(zeroblob(600000))));
  `
    .split(';')
    .filter((statement) => statement.trim())) {
    await query(statement)
  }
  const levelUrl = '/learning/core/threads/bounded-thread/path?view=lessons&stage_id=bounded-level&limit=2'
  const levelPage = await req(levelUrl)
  assert.equal(levelPage.status, 200)
  assert.deepEqual(levelPage.body.progress, { total: 3, completed: 1 })
  assert.deepEqual(
    levelPage.body.lessons.map((lesson) => lesson.id),
    ['bounded-a', 'bounded-b'],
  )
  assert.equal(levelPage.body.lessons[1].primary_source_id, captured.body.id)
  assert.equal(levelPage.body.lessons[0].has_content, 1)
  assert.equal('content' in levelPage.body.lessons[0], false)
  assert.ok(JSON.stringify(levelPage.body).length < 12000)
  assert.equal(levelPage.body.pagination.has_more, true)
  assert.equal(levelPage.body.pagination.next_offset, 2)
  const lastPage = await req(`${levelUrl}&offset=2`)
  assert.deepEqual(
    lastPage.body.lessons.map((lesson) => lesson.id),
    ['bounded-c'],
  )
  assert.equal(lastPage.body.pagination.has_more, false)
  assert.equal(lastPage.body.pagination.next_offset, null)
  const beyond = await req(`${levelUrl}&offset=99`)
  assert.equal(beyond.body.lessons.length, 0)
  assert.equal(beyond.body.pagination.total, 3)
  const empty = await req('/learning/core/threads/bounded-thread/path?view=lessons&stage_id=bounded-empty')
  assert.equal(empty.body.stage.status, 'completed')
  assert.deepEqual(empty.body.progress, { total: 0, completed: 0 })
  assert.equal((await req(levelUrl.replace('bounded-thread', 'other-thread'))).status, 404)
  assert.equal((await req(levelUrl.replace('bounded-level', 'missing-level'))).status, 404)
  for (const query of [
    'view=unknown',
    'view=lessons',
    'stage_id=bounded-level',
    'view=lessons&stage_id=bounded-level&limit=51',
    'view=lessons&stage_id=bounded-level&offset=-1',
  ]) {
    assert.equal((await req(`/learning/core/threads/bounded-thread/path?${query}`)).status, 400)
  }
  const fullPath = await req('/learning/core/threads/bounded-thread/path')
  assert.equal(fullPath.status, 200)
  assert.equal(fullPath.body.stages[0].lessons[0].content.length, 1200000)
  assert.deepEqual(
    fullPath.body.stages[0].lessons.map((lesson) => lesson.status),
    ['completed', 'in_progress', 'not_started'],
  )
  console.log(
    'Hermes upgrade integration passed: bounded Level reads, clean outcomes, deterministic repair, typed profile, rollout gates, improvement receipts, capabilities, and guarded companion retirement',
  )
} finally {
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
