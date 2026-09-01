import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

import { loadHermesBrief } from '../../src/services/agent-briefing.ts'
import {
  AGENT_CONTRACT_VERSION,
  AGENT_PROTOCOL,
  agentCapabilityPathPattern,
  buildAgentOpenApi,
  buildCapabilityCatalog,
  resolveCapabilityReadbacks,
  type CapabilityTuple,
} from '../../src/services/agent-capabilities.ts'

let agentApp: any
let vite: ViteDevServer
test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  agentApp = (await vite.ssrLoadModule('/src/api/agent.ts')).default
})
test.after(async () => {
  await vite.close()
})

const sample = [
  ['GET', '/capture/queue', 'Read Queue.'],
  ['POST', '/capture/feeds', 'Subscribe to a feed.'],
  ['POST', '/capture/feeds/:id/sync', 'Refresh one feed.'],
  ['POST', '/capture/:id/triage', 'Triage capture.'],
  ['DELETE', '/recommendations/:id/permanent', 'Delete permanently.'],
  ['POST', '/agent/request', 'Execute operation.'],
] as const satisfies readonly CapabilityTuple[]

const env = {
  DB: {
    prepare: () => {
      const statement: any = {
        bind: () => statement,
        run: async () => ({ meta: { changes: 1 } }),
      }
      return statement
    },
  },
} as any

const agentRequest = (body: unknown) =>
  agentApp.request(
    'https://example.test/request',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-name': 'test' },
      body: JSON.stringify(body),
    },
    env,
  )

const agentRead = (path: string, requestEnv: any = env) =>
  agentApp.request(
    `https://example.test${path}`,
    {
      headers: { 'x-agent-name': 'test' },
    },
    requestEnv,
  )

test('agent capability catalog is structured, filterable, and safety-aware', () => {
  const catalog = buildCapabilityCatalog(sample)
  assert.equal(AGENT_CONTRACT_VERSION, '2026-08-31')
  assert.equal(AGENT_PROTOCOL, 'learning-compass-agent-http/2')
  assert.equal(catalog.length, sample.length)
  assert.deepEqual(
    buildCapabilityCatalog(sample, { domain: 'capture', intent: 'update' }).map((item) => item.path),
    ['/capture/:id/triage'],
  )
  const destructive = catalog.find((item) => item.path.includes('/permanent'))!
  assert.equal(destructive.risk, 'high')
  assert.equal(destructive.reversible, false)
  assert.equal(destructive.precondition_path, '/capture/:id/record')
  assert.equal(destructive.explicit_confirmation_required, true)
  assert.equal(destructive.idempotency_supported, true)
  assert.equal(destructive.dry_run_supported, true)
})

test('capability HTTP discovery is compact by default with explicit full schema mode', async () => {
  const compactResponse = await agentRead('/capabilities')
  const compactText = await compactResponse.text()
  const compact: any = JSON.parse(compactText)
  const fullResponse = await agentRead('/capabilities?view=full')
  const fullText = await fullResponse.text()
  const full: any = JSON.parse(fullText)
  assert.equal(compact.view, 'summary')
  assert.equal(full.view, 'full')
  assert.equal(compact.returned, full.returned)
  assert.equal('request_body_schema' in compact.capabilities[0], false)
  assert.ok(full.capabilities.some((item: any) => item.request_body_schema))
  assert.ok(Buffer.byteLength(compactText) < Buffer.byteLength(fullText) * 0.5)
})

test('permanent Thread deletion is exact-target, high-risk, and parent-list verified', () => {
  const routes = [
    ['DELETE', '/learning/core/threads/:id', 'Delete one Thread.'],
  ] as const satisfies readonly CapabilityTuple[]
  const capability = buildCapabilityCatalog(routes)[0]
  assert.equal(capability.risk, 'high')
  assert.equal(capability.reversible, false)
  assert.equal(capability.explicit_confirmation_required, true)
  assert.equal(capability.precondition_path, '/learning/core/threads/:id')
  assert.equal(capability.verification_path, '/learning/core/threads')
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'DELETE /learning/core/threads/:id',
      capability.verification_path,
      capability.path,
      '/learning/core/threads/thread-1',
    ),
    ['/learning/core/threads'],
  )
  assert.match(
    readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8'),
    /\[\s*'DELETE',\s*'\/learning\/core\/threads\/:id'/,
  )
})

test('agent OpenAPI is generated from the same catalog with control schemas and safety extensions', () => {
  const spec: any = buildAgentOpenApi('https://example.test', sample)
  assert.equal(spec.openapi, '3.1.0')
  assert.equal(spec.info.version, AGENT_CONTRACT_VERSION)
  assert.ok(spec.paths['/capture/{id}/triage'].post.requestBody)
  assert.equal(spec.paths['/capture/{id}/triage'].post.parameters[0].name, 'id')
  assert.equal(spec.paths['/recommendations/{id}/permanent'].delete['x-risk'], 'high')
  assert.equal(
    spec.paths['/agent/request'].post.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/AgentRequest',
  )
  assert.deepEqual(spec.components.schemas.AgentAssertion.required, ['path', 'field', 'equals'])
  assert.equal(spec.components.securitySchemes, undefined)
  assert.equal(spec.paths['/capture/{id}/triage'].post.security, undefined)
  assert.equal(spec.paths['/agent/request'].post.security, undefined)
  assert.equal(spec.paths['/capture/{id}/triage'].post.parameters.at(-1).name, 'x-client-mutation-id')
  assert.deepEqual(spec.paths['/capture/feeds'].post.requestBody.content['application/json'].schema.required, [
    'url',
    'branch_id',
  ])
  assert.equal(
    spec.paths['/capture/feeds'].post.requestBody.content['application/json'].schema.properties.limit.maximum,
    20,
  )
  assert.equal(spec.paths['/capture/feeds'].post['x-verification-path'], '/capture/feeds')
  assert.equal(
    spec.paths['/capture/feeds/{id}/sync'].post.requestBody.content['application/json'].schema.properties.limit.maximum,
    20,
  )
  assert.equal(spec.paths['/capture/feeds/{id}/sync'].post['x-verification-path'], '/capture/feeds/:id/entries')
  assert.ok(spec.components.responses.Conflict)
})

test('mutation capability schemas match canonical Queue, feedback, personal, and lesson bodies', () => {
  const routes = [
    ['POST', '/capture/:id/triage', 'Triage one source.'],
    ['POST', '/feedback/record', 'Record exact feedback.'],
    ['POST', '/capture/personal', 'Create one personal item.'],
    ['PATCH', '/capture/personal/:id', 'Update one personal item.'],
    ['PATCH', '/learning/core/threads/:id/lessons/:lessonId', 'Update one lesson.'],
  ] as const satisfies readonly CapabilityTuple[]
  const [triage, feedback, personalCreate, personalUpdate, lesson] = buildCapabilityCatalog(routes)
  const triageSchema: any = triage.request_body_schema
  assert.deepEqual(triageSchema.properties.action.enum, ['queue', 'dequeue', 'exclude'])
  assert.ok(triageSchema.properties.thread_id)
  assert.ok(triageSchema.properties.reason)

  const feedbackSchema: any = feedback.request_body_schema
  assert.deepEqual(feedback.required_fields, ['feedback'])
  assert.deepEqual(feedbackSchema.required, ['feedback'])
  assert.deepEqual(feedbackSchema.anyOf, [
    { required: ['recommendation_id'] },
    { required: ['source_url'] },
    { required: ['title'] },
  ])
  assert.match(feedbackSchema.properties.feedback.description, /exact feedback preserved verbatim/)
  assert.match(feedbackSchema.properties.score.description, /do not send rating/)

  const createSchema: any = personalCreate.request_body_schema
  assert.deepEqual(createSchema.required, ['title', 'item_type', 'state', 'branch_id'])
  assert.equal(createSchema.properties.release_year.maximum, new Date().getUTCFullYear() + 5)
  assert.match(createSchema.properties.state.description, /Use completed for watched/)
  assert.match(createSchema.properties.release_year.description, /do not send year/)
  assert.equal('item_type' in (personalUpdate.request_body_schema as any).properties, false)

  const lessonSchema: any = lesson.request_body_schema
  assert.deepEqual(lessonSchema.required, ['status'])
  assert.deepEqual(lessonSchema.properties.status.enum, ['not_started', 'in_progress', 'completed'])
  assert.match(lessonSchema.properties.status.description, /not_started to reopen/)
})

test('verification readbacks resolve srs, feedback, and batch targets exactly', () => {
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /capture/feeds/:id/sync',
      '/capture/feeds/:id/entries',
      '/capture/feeds/:id/sync',
      '/capture/feeds/feed-1/sync',
    ),
    ['/capture/feeds/feed-1/entries'],
  )
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /capture/personal',
      '/capture/personal/:id',
      '/capture/personal',
      '/capture/personal',
      {},
      { item: { id: 'item 1' } },
    ),
    ['/capture/personal/item%201'],
  )
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'PATCH /capture/personal/:id',
      '/capture/personal/:id',
      '/capture/personal/:id',
      '/capture/personal/item%201?view=full',
    ),
    ['/capture/personal/item%201'],
  )
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /learning/srs/review',
      '/learning/srs/cards/:id',
      '/learning/srs/review',
      '/learning/srs/review',
      { card_id: 'card 1' },
      {},
    ),
    ['/learning/srs/cards/card%201'],
  )
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /feedback/record',
      '/capture/:id/record',
      '/feedback/record',
      '/feedback/record',
      {},
      { source: { id: 'rec-1' } },
    ),
    ['/capture/rec-1/record'],
  )
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /recommendations/map',
      '/capture/:id/record',
      '/recommendations/map',
      '/recommendations/map',
      { ids: ['rec-1', 'rec-2'] },
      {},
    ),
    ['/capture/rec-1/record', '/capture/rec-2/record'],
  )
})

test('Compass creation, job lifecycle, and exact note deletion declare canonical readbacks', () => {
  const routes = [
    ['POST', '/compass/picks', 'Create a Compass Pick.'],
    ['POST', '/agent/jobs/:id/claim', 'Claim a job.'],
    ['POST', '/agent/jobs/:id/replay', 'Replay a job.'],
    ['DELETE', '/notes/:id', 'Delete one note.'],
  ] as const satisfies readonly CapabilityTuple[]
  const [compass, claim, replay, noteDelete] = buildCapabilityCatalog(routes)
  const compassSchema: any = compass.request_body_schema
  assert.deepEqual(compass.required_fields, ['intent', 'thread_id', 'candidates'])
  assert.deepEqual(compassSchema.required, ['intent', 'thread_id', 'candidates'])
  assert.deepEqual(compassSchema.properties.intent.enum, [
    'solve_problem',
    'build_skill',
    'deepen_thread',
    'discover',
    'queue_fill',
  ])
  assert.equal(compassSchema.properties.candidates.minItems, 3)
  assert.equal(compassSchema.properties.candidates.maxItems, 24)
  assert.deepEqual(compassSchema.properties.candidates.items.required, [
    'canonical_url',
    'title',
    'creator',
    'format',
    'source_class',
    'branch_id',
    'expected_contribution',
    'evidence',
    'editorial_review',
  ])
  assert.equal(compassSchema.properties.candidates.items.properties.evidence.items.properties.claim.minLength, 12)
  assert.deepEqual(compassSchema.properties.candidates.items.properties.editorial_review.required, [
    'verdict',
    'why_worth_time',
    'unique_value',
    'depth',
  ])
  assert.deepEqual(compassSchema.properties.candidates.items.properties.editorial_review.properties.depth.enum, [
    'substantive',
    'deep',
  ])
  assert.deepEqual(compassSchema.properties.candidates.items.properties.perspective.anyOf, [
    { required: ['viewpoint'] },
    { required: ['school'] },
  ])
  assert.equal(compass.verification_path, '/compass/pick/:pick_id')
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /compass/picks',
      compass.verification_path,
      compass.path,
      '/compass/picks',
      {},
      { pick_id: 'pick 1' },
    ),
    ['/compass/pick/pick%201'],
  )
  for (const capability of [claim, replay]) {
    assert.equal(capability.verification_path, '/agent/jobs/:id')
    assert.deepEqual(
      resolveCapabilityReadbacks(
        `${capability.method} ${capability.path}`,
        capability.verification_path,
        capability.path,
        '/agent/jobs/job-1/' + (capability === claim ? 'claim' : 'replay'),
      ),
      ['/agent/jobs/job-1'],
    )
  }
  assert.deepEqual((claim.request_body_schema as any).required, ['worker'])
  assert.equal((claim.request_body_schema as any).properties.worker.maxLength, 120)
  assert.deepEqual((replay.request_body_schema as any).properties, {})
  assert.equal(noteDelete.risk, 'high')
  assert.equal(noteDelete.explicit_confirmation_required, true)
  assert.equal(noteDelete.precondition_path, '/notes/:id')
  assert.equal(noteDelete.verification_path, '/notes/:id')
})

test('job capability schemas expose lease identity and checkpoint evidence instead of generic bodies', () => {
  const routes = [
    ['POST', '/agent/jobs/:id/checkpoint', 'Checkpoint a job.'],
    ['POST', '/agent/jobs/:id/complete', 'Complete a job.'],
    ['POST', '/agent/jobs/:id/fail', 'Fail a job.'],
    ['POST', '/agent/jobs/:id/heartbeat', 'Heartbeat a job.'],
  ] as const satisfies readonly CapabilityTuple[]
  const [checkpoint, complete, fail, heartbeat] = buildCapabilityCatalog(routes)
  assert.deepEqual((checkpoint.request_body_schema as any).required, ['worker', 'step', 'evidence'])
  assert.deepEqual((complete.request_body_schema as any).required, ['worker'])
  assert.deepEqual((fail.request_body_schema as any).required, ['worker', 'error'])
  assert.deepEqual((heartbeat.request_body_schema as any).required, ['worker'])
})

test('capability path matching escapes literals and excludes traversal-normalized routes', () => {
  assert.equal(agentCapabilityPathPattern('/agent/openapi.json').test('/agent/openapi.json'), true)
  assert.equal(agentCapabilityPathPattern('/agent/openapi.json').test('/agent/openapiXjson'), false)
  assert.equal(agentCapabilityPathPattern('/capture/:id/triage').test('/capture/../triage'), true)
  assert.equal(
    agentCapabilityPathPattern('/capture/:id/triage').test(
      new URL('/capture/../triage', 'https://example.test').pathname,
    ),
    false,
  )
})

test('briefing uses one D1 batch and reports exact pressure and distinct blockers', async () => {
  let batchCalls = 0
  let statementCount = 0
  const DB: any = {
    prepare: (sql: string) => ({ sql }),
    batch: async (statements: any[]) => {
      batchCalls += 1
      statementCount = statements.length
      return [
        {
          results: [
            {
              id: 'queue-1',
              video_title: 'Queued source',
              learning_state: 'queued',
              queue_count: 4,
              invalid_branch_count: 1,
              missing_domain_count: 2,
            },
          ],
        },
        { results: [{ count: 0 }] },
        { results: [{ count: 3 }] },
        { results: [{ count: 76 }] },
        { results: [{ count: 2 }] },
        { results: [{ id: 'con-1', recommendation_id: 'source-1', open_count: 3 }] },
        {
          results: [{ active_count: 8, failed_count: 2, dead_letter_count: 1, stale_count: 3, overdue_retry_count: 4 }],
        },
        {
          results: [
            { id: 'lesson-1', title: 'Lesson one', thread_id: 'thread-1', stage_id: 'stage-1', missing_count: 5 },
          ],
        },
      ]
    },
  }
  const brief = await loadHermesBrief(DB)
  assert.equal(batchCalls, 1)
  assert.equal(statementCount, 8)
  assert.equal(brief.counts.queue, 4)
  assert.equal(brief.counts.queue_limit, 5)
  assert.equal(brief.blockers.queue_at_capacity, false)
  assert.equal(brief.blockers.invalid_queue_branches, 1)
  assert.equal(brief.blockers.missing_queue_domains, 2)
  assert.equal(brief.blockers.failed_jobs, 2)
  assert.equal(brief.blockers.dead_letter_jobs, 1)
  assert.equal(brief.blockers.stale_jobs, 3)
  assert.equal(brief.blockers.overdue_retries, 4)
  assert.equal(brief.blockers.open_consolidation_count, 3)
  assert.equal(brief.blockers.missing_direct_lesson_material, 5)
  assert.equal(brief.next_action.id, 'jobs:stale')
  for (const field of ['id', 'target', 'reason', 'href']) assert.ok((brief.next_action as any)[field])
})

test('lesson source attachment replaces required roles but accumulates optional sources', () => {
  const learningCore = readFileSync(new URL('../../src/api/learning-core.ts', import.meta.url), 'utf8')
  const capabilities = readFileSync(new URL('../../src/services/agent-capabilities.ts', import.meta.url), 'utf8')
  assert.match(learningCore, /valid non-pruned branch_id required/)
  assert.match(learningCore, /learning_state='captured' THEN 'attached'/)
  assert.doesNotMatch(learningCore, /branch_id=excluded\.branch_id/)
  assert.match(
    learningCore,
    /DELETE FROM thread_lesson_sources WHERE lesson_id=\? AND role=\? AND recommendation_id<>\? AND \?!='optional'/,
  )
  assert.match(capabilities, /'POST \/learning\/core\/threads\/:id\/lessons\/:lessonId\/sources'/)
  assert.match(capabilities, /\['recommendation_id', 'expected_contribution'\]/)
})

test('Thread material organizer capabilities are Library-first, exact-scope, and canonically verified', () => {
  const routes = [
    ['POST', '/learning/core/threads/:id/sources', 'Attach at Thread.'],
    ['PATCH', '/learning/core/threads/:id/sources/:sourceId', 'Edit Thread placement.'],
    ['POST', '/learning/core/threads/:id/stages/:stageId/sources', 'Attach at Level.'],
    ['PATCH', '/learning/core/threads/:id/stages/:stageId/sources/:sourceId', 'Edit Level placement.'],
    ['DELETE', '/learning/core/threads/:id/stages/:stageId/sources/:sourceId', 'Remove Level placement.'],
    ['POST', '/learning/core/threads/:id/lessons/:lessonId/sources', 'Attach at lesson.'],
    ['PATCH', '/learning/core/threads/:id/lessons/:lessonId/sources/:sourceId', 'Edit lesson placement.'],
    ['DELETE', '/learning/core/threads/:id/lessons/:lessonId/sources/:sourceId', 'Remove lesson placement.'],
    ['POST', '/learning/core/threads/:id/lessons/:lessonId/material-request', 'Find material.'],
  ] as const satisfies readonly CapabilityTuple[]
  const catalog = buildCapabilityCatalog(routes)
  const [
    threadAttach,
    threadEdit,
    levelAttach,
    levelEdit,
    levelRemove,
    lessonAttach,
    lessonEdit,
    lessonRemove,
    findMaterial,
  ] = catalog
  for (const capability of [threadEdit, levelAttach, levelEdit, levelRemove, lessonAttach, lessonEdit, lessonRemove]) {
    assert.equal(capability.verification_path, '/learning/core/threads/:id/path')
  }
  assert.deepEqual((threadAttach.request_body_schema as any).required, ['recommendation_id', 'expected_contribution'])
  assert.deepEqual((levelAttach.request_body_schema as any).required, ['recommendation_id', 'expected_contribution'])
  assert.deepEqual((lessonAttach.request_body_schema as any).required, ['recommendation_id', 'expected_contribution'])
  for (const capability of [threadAttach, threadEdit, levelAttach, lessonAttach, levelEdit, lessonEdit]) {
    const contribution = (capability.request_body_schema as any).properties.expected_contribution
    assert.equal(contribution.type, 'string')
    assert.equal(contribution.minLength, 1)
    assert.equal(contribution.pattern, '\\S')
  }
  assert.deepEqual((lessonEdit.request_body_schema as any).properties.role.enum, [
    'primary',
    'case',
    'challenge',
    'reference',
    'optional',
  ])
  assert.deepEqual((threadEdit.request_body_schema as any).properties.role.enum, [
    'primary',
    'supporting',
    'counterevidence',
    'reference',
  ])
  assert.ok((levelEdit.request_body_schema as any).properties.expected_contribution)
  assert.equal((lessonAttach.request_body_schema as any).properties.expected_source_url.format, 'uri')
  assert.equal(findMaterial.verification_path, '/learning/core/threads/:id/lessons/:lessonId/material-request')
  assert.equal((findMaterial.request_body_schema as any).properties.idempotency_key.maxLength, 160)
})

test('NotebookLM learning routes expose typed plans and canonical receipt readback', () => {
  const routes = [
    ['POST', '/notebooklm/learning/route', 'Route outputs.'],
    ['POST', '/notebooklm/learning/receipts', 'Record provider evidence.'],
  ] as const satisfies readonly CapabilityTuple[]
  const catalog = buildCapabilityCatalog(routes)
  assert.deepEqual(catalog[0].required_fields, ['recommendation_id'])
  assert.deepEqual(catalog[1].required_fields, ['kind', 'recommendation_id', 'notebook_id', 'notebook_url', 'status'])
  assert.deepEqual(
    resolveCapabilityReadbacks(
      'POST /notebooklm/learning/route',
      '/notebooklm/learning/receipts?recommendation_id=:recommendation_id',
      '/notebooklm/learning/route',
      '/notebooklm/learning/route',
      { recommendation_id: 'rec 1' },
      {},
    ),
    ['/notebooklm/learning/receipts?recommendation_id=rec%201'],
  )
})

test('guarded agent mutations can call same-zone Worker routes in production', () => {
  const wrangler = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
  assert.match(wrangler, /global_fetch_strictly_public/)
})

test('feedback extraction follows disposition and source notes stay source-shaped', () => {
  const product = readFileSync(new URL('../../src/api/product.ts', import.meta.url), 'utf8')
  const jobs = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  assert.match(product, /complete && \(disposition === 'retain' \|\| disposition === 'apply'\) \? id\('job'\) : null/)
  assert.match(product, /if \(complete && knowledgeRequested\)/)
  assert.doesNotMatch(product, /auto_enqueue/)
  assert.doesNotMatch(product, /rating\.score >= 8/)
  assert.doesNotMatch(product, /settings\.srs_drafts\.auto_extract/)
  assert.doesNotMatch(jobs, /payload\.rating[\s\S]*>= 7/)
  assert.match(jobs, /one or more complete source-shaped sections/)
  assert.doesNotMatch(jobs, /complete bilingual English and Egyptian Arabic sections/)
})

test('automated recall is disabled while manual write paths enforce Arabic', () => {
  const jobs = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  const learning = readFileSync(new URL('../../src/api/learning.ts', import.meta.url), 'utf8')
  const product = readFileSync(new URL('../../src/api/product.ts', import.meta.url), 'utf8')
  const vault = readFileSync(new URL('../../src/api/vault.ts', import.meta.url), 'utf8')
  const intelligence = readFileSync(new URL('../../src/services/hermes-intelligence.ts', import.meta.url), 'utf8')
  assert.match(jobs, /automated_recall_disabled/)
  assert.doesNotMatch(jobs, /INSERT OR REPLACE INTO srs_drafts/)
  assert.match(learning, /validateArabicRecall/)
  assert.match(product, /validateArabicRecall/)
  assert.match(vault, /automated_recall_disabled/)
  assert.doesNotMatch(vault, /INSERT INTO srs_cards/)
  assert.doesNotMatch(intelligence, /INSERT OR IGNORE INTO srs_cards/)
})

test('agent context and tools enforce canonical v2 semantics', () => {
  const agent = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')
  const capture = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
  for (const obsolete of [
    "name: 'push_recommendation'",
    "name: 'validate_content_fit'",
    "name: 'log_learning_session'",
    "name: 'get_agent_context'",
    "app.post('/validate-fit'",
  ]) {
    assert.equal(agent.includes(obsolete), false, `obsolete tool remains: ${obsolete}`)
  }
  assert.equal(agent.includes("AVG(CASE WHEN user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastery_rate"), false)
  assert.ok(agent.includes('learning_gaps'))
  assert.ok(agent.includes('completed_threads'))
  assert.ok(agent.includes('legacy_mastered'))
  assert.ok(agent.includes('return c.json(payload, requiredUnavailable ? 503 : 200)'))
  assert.ok(agent.includes('loadCaptureQueue(DB, 50)'))
  assert.ok(agent.includes('HAVING MAX(COALESCE(dm.last_consumed, dr.last_consumed)) IS NULL'))
  assert.equal(agent.includes('HAVING last_consumed IS NULL'), false)
  assert.match(capture, /loadCaptureQueue\(c\.env\.DB,\s*50,\s*delivery,\s*matchesOnly\)/)
})

test('recommendation engine rollout cannot bypass readiness gates through generic settings', () => {
  const product = readFileSync(new URL('../../src/api/product.ts', import.meta.url), 'utf8')
  assert.match(product, /key === 'recommendation_engine'/)
  assert.match(product, /engine_rollout_managed/)
  assert.match(product, /analytics\/hermes\/engine\/activate/)
  assert.match(product, /analytics\/hermes\/engine\/rollback/)
})

test('stranded consolidation runs reconcile from canonical outputs or regain a linked extraction job', () => {
  const core = readFileSync(new URL('../../src/api/learning-core.ts', import.meta.url), 'utf8')
  const service = readFileSync(new URL('../../src/services/learning-core.ts', import.meta.url), 'utf8')
  assert.match(core, /consolidation\/:id\/reconcile/)
  assert.match(core, /consolidation-reconcile-v2:/)
  assert.match(core, /output_contract: 'source_note_v2'/)
  assert.match(core, /workflow_run_id=\?,workflow_step='extract_source'/)
  assert.match(service, /SELECT id FROM consolidation_runs WHERE recommendation_id=\?/)
})

test('legacy extraction jobs cannot write stale Thread foreign keys', () => {
  const jobs = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  assert.match(jobs, /SELECT id FROM learning_threads WHERE id=\?/)
  assert.match(jobs, /if \(\s*payloadThreadId\s*\)\s*statements\.push/)
  assert.doesNotMatch(jobs, /if \(payload\.thread_id\) statements\.push/)
})

test('high-risk dry-run needs no confirmation while execution requires the exact asserted target', async () => {
  const dryRun = await agentRequest({ method: 'DELETE', path: '/recommendations/rec-1/permanent', dry_run: true })
  assert.equal(dryRun.status, 200)
  const dryPayload: any = await dryRun.json()
  assert.equal(dryPayload.impact.precondition_path, '/capture/rec-1/record')

  const rejected = await agentRequest({
    method: 'DELETE',
    path: '/recommendations/rec-1/permanent',
    idempotency_key: 'delete-1',
    confirm: true,
    precondition: { path: '/agent/system', field: 'status', equals: 'archived' },
  })
  assert.equal(rejected.status, 409)
  const rejectedPayload: any = await rejected.json()
  assert.equal(rejectedPayload.required_precondition_path, '/capture/rec-1/record')
})

test('agent request canonicalizes paths, rejects verification substitution, and never invents verification', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    return Response.json({
      ok: true,
      token: 'provider-secret',
      accessToken: 'provider-access-secret',
      message: 'upstream rejected Bearer provider-message-secret',
      retry_url: 'https://provider.test/retry?api_key=provider-query-secret',
    })
  }) as any
  try {
    const traversal = await agentRequest({
      method: 'POST',
      path: '/capture/../triage',
      idempotency_key: 'traversal-1',
      body: {},
    })
    assert.equal(traversal.status, 403)
    assert.equal(fetchCalls, 0)

    const substituted = await agentRequest({
      method: 'POST',
      path: '/capture/cap-1/triage',
      idempotency_key: 'queue-cap-1-substitute',
      body: { action: 'queue' },
      verify: { path: '/agent/system', field: 'status', equals: 'healthy' },
    })
    assert.equal(substituted.status, 409)
    assert.equal(fetchCalls, 0)
    const substitutedPayload: any = await substituted.json()
    assert.match(substitutedPayload.error, /canonical readback/)

    const wrongTarget = await agentRequest({
      method: 'POST',
      path: '/capture/cap-1/triage',
      idempotency_key: 'queue-cap-1-wrong-target',
      body: { action: 'queue' },
      verify: { path: '/capture/cap-2/record', field: 'learning_state', equals: 'queued' },
    })
    assert.equal(wrongTarget.status, 409)
    assert.equal(fetchCalls, 0)

    const singularPickReadback = await agentRequest({
      method: 'POST',
      path: '/compass/picks',
      idempotency_key: 'compass-pick-singular-readback',
      body: {},
      verify: { path: '/compass/pick', field: 'status', equals: 'ready' },
    })
    assert.equal(singularPickReadback.status, 409)
    assert.equal(fetchCalls, 0)
    const singularPickPayload: any = await singularPickReadback.json()
    assert.equal(singularPickPayload.required_verification_path, '/compass/pick/:pick_id')

    const unverified = await agentRequest({
      method: 'POST',
      path: '/brain/priorities',
      idempotency_key: 'priority-1',
      body: { priorities: [] },
    })
    assert.equal(unverified.status, 200)
    const unverifiedPayload: any = await unverified.json()
    assert.equal(unverifiedPayload.ok, true)
    assert.equal(unverifiedPayload.verified, false)
    assert.equal(unverifiedPayload.receipt.blocker.code, 'verification_not_declared')
    assert.equal(unverifiedPayload.receipt.mutation_or_job.mutation_committed, true)
    assert.equal(unverifiedPayload.data.token, '[redacted]')
    assert.equal(unverifiedPayload.data.accessToken, '[redacted]')
    assert.equal(JSON.stringify(unverifiedPayload).includes('provider-secret'), false)
    assert.equal(JSON.stringify(unverifiedPayload).includes('provider-access-secret'), false)
    assert.equal(JSON.stringify(unverifiedPayload).includes('provider-message-secret'), false)
    assert.equal(JSON.stringify(unverifiedPayload).includes('provider-query-secret'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('exact note deletion verifies canonical absence instead of treating a successful DELETE as proof', async () => {
  const originalFetch = globalThis.fetch
  let noteReads = 0
  let deleteCalls = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === '/notes/note-1' && request.method === 'GET') {
      noteReads += 1
      return noteReads === 1
        ? Response.json({ note: { id: 'note-1', title: 'Exact target' } })
        : Response.json({ error: 'not found' }, { status: 404 })
    }
    if (path === '/notes/note-1' && request.method === 'DELETE') {
      deleteCalls += 1
      return Response.json({ ok: true })
    }
    throw new Error(`unexpected request: ${request.method} ${path}`)
  }) as any
  try {
    const response = await agentRequest({
      method: 'DELETE',
      path: '/notes/note-1',
      idempotency_key: 'delete-note-1',
      confirm: true,
      precondition: { path: '/notes/note-1', field: 'note.id', equals: 'note-1' },
      verify: { path: '/notes/note-1', field: 'absent', equals: true },
    })
    assert.equal(response.status, 200)
    const payload: any = await response.json()
    assert.equal(payload.ok, true)
    assert.equal(payload.verified, true)
    assert.equal(payload.receipt.after.status, 404)
    assert.equal(payload.receipt.after.data.absent, true)
    assert.equal(noteReads, 2)
    assert.equal(deleteCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('agent activity stays bounded, redacts historical secrets, and reports exact degraded health', async () => {
  const huge = 'x'.repeat(60000)
  const receiptJson = JSON.stringify({
    intent: 'update',
    target: '/settings/appearance?access_token=receipt-target-secret',
    before: {
      path: '/settings',
      status: 200,
      data: { huge, token: 'stored-secret', message: 'provider said Bearer receipt-message-secret' },
    },
    mutation_or_job: {
      method: 'PUT',
      status: 200,
      mutation_committed: true,
      data: { authorization: 'Bearer stored-secret' },
    },
    after: { path: '/settings', status: 200, data: { ok: true } },
    evidence: [],
    blocker: null,
  })
  const activityEnv: any = {
    DB: {
      prepare: (sql: string) => {
        const statement: any = {
          bind: () => statement,
          all: async () => {
            if (sql.includes('FROM agent_receipts'))
              return {
                results: [
                  {
                    id: 'receipt-1',
                    target: '/settings?api_key=row-target-secret',
                    agent_name: 'agent token=row-agent-secret',
                    verified: 1,
                    receipt_json: receiptJson,
                  },
                ],
              }
            if (sql.includes('FROM agent_logs')) throw new Error('temporary audit table failure')
            if (sql.includes('FROM agent_jobs'))
              return {
                results: [
                  {
                    id: 'job-1',
                    status: 'running',
                    error: 'provider failed with Bearer job-error-secret',
                    active_total: 7,
                    failed_total: 4,
                    stale_total: 2,
                    dead_letter_total: 1,
                  },
                ],
              }
            if (sql.includes('FROM feedback_proposals'))
              return { results: [{ id: 'proposal-1', status: 'applied', pending_total: 3 }] }
            return { results: [] }
          },
        }
        return statement
      },
    },
  }
  const response = await agentRead('/activity?limit=50', activityEnv)
  const text = await response.text()
  const payload: any = JSON.parse(text)
  assert.equal(response.status, 200)
  assert.equal(payload.health.status, 'degraded')
  assert.equal(payload.health.sections.audit_events.status, 'degraded')
  assert.equal(payload.health.active_jobs, 7)
  assert.equal(payload.health.failed_jobs, 4)
  assert.equal(payload.health.stale_jobs, 2)
  assert.equal(payload.health.dead_letter_jobs, 1)
  assert.equal(payload.health.pending_proposals, 3)
  assert.equal(payload.audit_events.length, 0)
  for (const secret of [
    'stored-secret',
    'receipt-target-secret',
    'receipt-message-secret',
    'row-target-secret',
    'row-agent-secret',
    'job-error-secret',
  ]) {
    assert.equal(text.includes(secret), false, `activity leaked ${secret}`)
  }
  assert.ok(Buffer.byteLength(text) < 40000)
})

test('agent operational counts include lease-free activation waits as active work', () => {
  const source = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')
  const activity = source.match(/app\.get\('\/activity',[\s\S]*?\n\}\)/)?.[0] || ''
  const system = source.match(/app\.get\('\/system',[\s\S]*?\n\}\)/)?.[0] || ''

  assert.equal(activity.match(/status IN \('pending','running','retry','awaiting_activation'/g)?.length, 2)
  assert.match(system, /status IN \('pending','running','retry','awaiting_activation'\)/)
  assert.match(
    system,
    /FROM artifacts WHERE COALESCE\(json_extract\(metadata_json,'\$\.publication_state'\),'ready'\)!='staged'/,
  )
})

test('agent context marks the placeholder gap section unavailable and omits synthetic rounds', async () => {
  const emptyContextEnv: any = {
    DB: {
      prepare: () => {
        const statement: any = {
          bind: () => statement,
          first: async () => null,
          all: async () => ({ results: [] }),
        }
        return statement
      },
    },
  }
  const response = await agentRead('/context', emptyContextEnv)
  const payload: any = await response.json()
  assert.equal(response.status, 503)
  assert.equal(payload.health.status, 'unavailable')
  assert.equal(payload.health.sections.learning_gaps.status, 'degraded')
  assert.equal(payload.health.sections.learning_gaps.error, 'canonical_source_is_compass_context')
  assert.equal(payload.learning_gaps, null)
  assert.equal('attention_by_r1' in (payload.learning_balance || {}), false)
  assert.equal(JSON.stringify(payload).includes('"round"'), false)
})

test('retired progression-gate mutations are absent from the Hermes registry', async () => {
  const agent = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')
  for (const retired of [
    "['POST', '/learning/core/threads/:id/stages/:stageId/items'",
    "['PATCH', '/learning/core/threads/:id/stages/:stageId/items/:itemId'",
    "['POST', '/learning/core/threads/:id/stages/:stageId/verify'",
    "['POST', '/learning/core/threads/:id/verify'",
  ])
    assert.equal(agent.includes(retired), false, `retired agent route remains: ${retired}`)

  const response = await agentRequest({
    method: 'POST',
    path: '/learning/core/threads/thread-1/verify',
    idempotency_key: 'retired-progress-route',
    body: {},
  })
  assert.equal(response.status, 403)
})

test('failed post-commit readback remains an explicit committed receipt', async () => {
  const originalFetch = globalThis.fetch
  let readCount = 0
  globalThis.fetch = (async (_input: any, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ ok: true, state: 'queued' })
    readCount += 1
    if (readCount === 1) return Response.json({ item: { id: 'cap-1', learning_state: 'captured' } })
    return Response.json({ error: 'temporary readback failure' }, { status: 503 })
  }) as any
  try {
    const response = await agentRequest({
      method: 'POST',
      path: '/capture/cap-1/triage',
      idempotency_key: 'queue-cap-1',
      body: { action: 'queue' },
    })
    assert.equal(response.status, 200)
    const payload: any = await response.json()
    assert.equal(payload.ok, true)
    assert.equal(payload.verified, false)
    assert.equal(payload.receipt.mutation_or_job.mutation_committed, true)
    assert.equal(payload.receipt.blocker.mutation_committed, true)
    assert.match(payload.receipt.blocker.message, /verification read failed/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('batch map rereads every affected source before and after the mutation', async () => {
  const originalFetch = globalThis.fetch
  const reads: string[] = []
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input))
    if (init?.method === 'POST') return Response.json({ ok: true, sources: [{ id: 'rec-1' }, { id: 'rec-2' }] })
    reads.push(url.pathname)
    return Response.json({ item: { id: url.pathname.split('/')[2] } })
  }) as any
  try {
    const response = await agentRequest({
      method: 'POST',
      path: '/recommendations/map',
      idempotency_key: 'map-1',
      body: { ids: ['rec-1', 'rec-2'], branch_id: 'branch-1' },
    })
    assert.equal(response.status, 200)
    const payload: any = await response.json()
    assert.equal(payload.verified, true)
    assert.deepEqual(reads, [
      '/capture/rec-1/record',
      '/capture/rec-2/record',
      '/capture/rec-1/record',
      '/capture/rec-2/record',
    ])
    assert.equal(payload.receipt.after.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('atomic mutation reservation schema and middleware protect request fingerprints', () => {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const recovery = readFileSync(new URL('../../src/services/mutation-recovery.ts', import.meta.url), 'utf8')
  const migration = readFileSync(
    new URL('../../migrations/0037_atomic_mutation_reservations.sql', import.meta.url),
    'utf8',
  )
  assert.ok(source.includes('INSERT OR IGNORE INTO sync_mutation_locks'))
  assert.ok(source.includes('mutation_id_reused_for_different_operation'))
  assert.match(source, /crypto\.subtle\.digest\(\s*'SHA-256'/)
  assert.ok(source.includes('DURABLE_UNKNOWN_MUTATION_EXPIRES_AT'))
  assert.ok(source.includes("created_at<=datetime('now','-2 minutes')"))
  assert.ok(source.includes("expires_at<=datetime(created_at,'+5 minutes')"))
  assert.equal(source.includes("datetime('now','+1 day')"), false)
  assert.ok(recovery.includes("'9999-12-31 23:59:59'"))
  assert.ok(migration.includes('request_hash TEXT'))
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS sync_mutation_locks'))
})

test('Hermes cockpit, evidence retrieval, private intake, and recovery seams stay synchronized', () => {
  const agent = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')
  const search = readFileSync(new URL('../../src/api/search.ts', import.meta.url), 'utf8')
  const index = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(
    new URL('../../migrations/0038_hermes_brief_annotations_receipts.sql', import.meta.url),
    'utf8',
  )
  const telegramMigration = readFileSync(
    new URL('../../migrations/0039_telegram_webhook_dedup.sql', import.meta.url),
    'utf8',
  )
  const extension = readFileSync(new URL('../../browser-extension/background.js', import.meta.url), 'utf8')
  assert.ok(agent.includes("['GET', '/agent/briefing'"))
  assert.ok(agent.includes("app.get('/activity'"))
  assert.ok(search.includes("app.get('/evidence'"))
  assert.ok(!index.includes('REQUIRE_API_AUTH'))
  assert.ok(index.includes('x-telegram-bot-api-secret-token'))
  assert.ok(index.includes('telegram_updates'))
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS source_annotations'))
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS agent_receipts'))
  assert.ok(telegramMigration.includes('CREATE TABLE IF NOT EXISTS telegram_updates'))
  assert.ok(extension.includes('contextMenus'))
  assert.ok(!extension.includes('API_TOKEN'))
})

test('memory replacement atomically supersedes active or approved values and persists evidence', async () => {
  const batches: any[][] = []
  const DB: any = {
    prepare: (sql: string) => {
      const statement: any = {
        sql,
        args: [] as any[],
        bind: (...args: any[]) => {
          statement.args = args
          return statement
        },
        first: async () => (sql.includes('SELECT id FROM hermes_memory') ? { id: 'mem-approved' } : null),
        run: async () => ({ meta: { changes: 1 } }),
      }
      return statement
    },
    batch: async (statements: any[]) => {
      batches.push(statements)
      return statements.map(() => ({ meta: { changes: 1 } }))
    },
  }
  const response = await agentApp.request(
    'https://example.test/memory',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-name': 'test' },
      body: JSON.stringify({
        memory_key: 'skill_procedure:test',
        memory_kind: 'durable',
        value: { rule: 'verified' },
        source: 'test',
        confidence: 0.9,
        evidence: [{ source: 'test-suite', reason: 'regression' }],
      }),
    },
    { DB } as any,
  )
  assert.equal(response.status, 201)
  assert.equal(batches.length, 1)
  assert.ok(
    batches[0].some((statement) =>
      /UPDATE hermes_memory SET status='superseded'.*memory_key=\? AND status IN \('active','approved'\)/s.test(
        statement.sql,
      ),
    ),
  )
  assert.ok(batches[0].some((statement) => /INSERT INTO hermes_memory/.test(statement.sql)))
  assert.ok(batches[0].some((statement) => /INSERT INTO memory_evidence/.test(statement.sql)))
  const migration = readFileSync(new URL('../../migrations/0066_hermes_memory_live_key.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_memory_one_live_key/)
  assert.match(migration, /WHERE status IN \('active','approved'\)/)
})
