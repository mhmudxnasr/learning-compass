import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

import { AGENT_CONTRACT_VERSION, AGENT_PROTOCOL, buildAgentOpenApi, buildCapabilityCatalog, resolveCapabilityReadbacks, type CapabilityTuple } from '../../src/services/agent-capabilities.ts'

let agentApp: any
let vite: ViteDevServer
test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  agentApp = (await vite.ssrLoadModule('/src/api/agent.ts')).default
})
test.after(async () => { await vite.close() })

const sample = [
  ['GET', '/capture/queue', 'Read Queue.'],
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

const agentRequest = (body: unknown) => agentApp.request('https://example.test/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-agent-name': 'test' },
  body: JSON.stringify(body),
}, env)

test('agent capability catalog is structured, filterable, and safety-aware', () => {
  const catalog = buildCapabilityCatalog(sample)
  assert.equal(AGENT_CONTRACT_VERSION, '2026-08-20')
  assert.equal(AGENT_PROTOCOL, 'learning-compass-agent-http/2')
  assert.equal(catalog.length, sample.length)
  assert.deepEqual(buildCapabilityCatalog(sample, { domain: 'capture', intent: 'update' }).map((item) => item.path), ['/capture/:id/triage'])
  const destructive = catalog.find((item) => item.path.includes('/permanent'))!
  assert.equal(destructive.risk, 'high')
  assert.equal(destructive.reversible, false)
  assert.equal(destructive.precondition_path, '/capture/:id/record')
  assert.equal(destructive.explicit_confirmation_required, true)
  assert.equal(destructive.idempotency_supported, true)
  assert.equal(destructive.dry_run_supported, true)
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
  assert.deepEqual(resolveCapabilityReadbacks('DELETE /learning/core/threads/:id', capability.verification_path, capability.path, '/learning/core/threads/thread-1'), ['/learning/core/threads'])
  assert.match(readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8'), /\['DELETE', '\/learning\/core\/threads\/:id'/)
})

test('agent OpenAPI is generated from the same catalog with control schemas and safety extensions', () => {
  const spec: any = buildAgentOpenApi('https://example.test', sample)
  assert.equal(spec.openapi, '3.1.0')
  assert.equal(spec.info.version, AGENT_CONTRACT_VERSION)
  assert.ok(spec.paths['/capture/{id}/triage'].post.requestBody)
  assert.equal(spec.paths['/capture/{id}/triage'].post.parameters[0].name, 'id')
  assert.equal(spec.paths['/recommendations/{id}/permanent'].delete['x-risk'], 'high')
  assert.equal(spec.paths['/agent/request'].post.requestBody.content['application/json'].schema.$ref, '#/components/schemas/AgentRequest')
  assert.deepEqual(spec.components.schemas.AgentAssertion.required, ['path', 'field', 'equals'])
  assert.equal(spec.components.securitySchemes.ApiToken.name, 'x-api-token')
  assert.equal(spec.paths['/capture/{id}/triage'].post.parameters.at(-1).name, 'x-client-mutation-id')
  assert.ok(spec.components.responses.Conflict)
})

test('verification readbacks resolve srs, feedback, and batch targets exactly', () => {
  assert.deepEqual(resolveCapabilityReadbacks('POST /learning/srs/review', '/learning/srs/cards/:id', '/learning/srs/review', '/learning/srs/review', { card_id: 'card 1' }, {}), ['/learning/srs/cards/card%201'])
  assert.deepEqual(resolveCapabilityReadbacks('POST /feedback/record', '/capture/:id/record', '/feedback/record', '/feedback/record', {}, { source: { id: 'rec-1' } }), ['/capture/rec-1/record'])
  assert.deepEqual(resolveCapabilityReadbacks('POST /recommendations/map', '/capture/:id/record', '/recommendations/map', '/recommendations/map', { ids: ['rec-1', 'rec-2'] }, {}), ['/capture/rec-1/record', '/capture/rec-2/record'])
})

test('lesson source attachment replaces required roles but accumulates optional sources', () => {
  const learningCore = readFileSync(new URL('../../src/api/learning-core.ts', import.meta.url), 'utf8')
  const capabilities = readFileSync(new URL('../../src/services/agent-capabilities.ts', import.meta.url), 'utf8')
  assert.match(learningCore, /valid non-pruned branch_id required/)
  assert.match(learningCore, /learning_state='captured' THEN 'attached'/)
  assert.match(learningCore, /branch_id=excluded\.branch_id/)
  assert.match(learningCore, /DELETE FROM thread_lesson_sources WHERE lesson_id=\? AND role=\? AND recommendation_id<>\? AND \?!='optional'/)
  assert.match(capabilities, /'POST \/learning\/core\/threads\/:id\/lessons\/:lessonId\/sources'/)
  assert.match(capabilities, /\['recommendation_id', 'role', 'branch_id'\]/)
})

test('NotebookLM learning routes expose typed plans and canonical receipt readback', () => {
  const routes = [
    ['POST', '/notebooklm/learning/route', 'Route outputs.'],
    ['POST', '/notebooklm/learning/receipts', 'Record provider evidence.'],
  ] as const satisfies readonly CapabilityTuple[]
  const catalog = buildCapabilityCatalog(routes)
  assert.deepEqual(catalog[0].required_fields, ['recommendation_id'])
  assert.deepEqual(catalog[1].required_fields, ['kind', 'recommendation_id', 'notebook_id', 'notebook_url', 'status'])
  assert.deepEqual(resolveCapabilityReadbacks('POST /notebooklm/learning/route', '/notebooklm/learning/receipts?recommendation_id=:recommendation_id', '/notebooklm/learning/route', '/notebooklm/learning/route', { recommendation_id: 'rec 1' }, {}), ['/notebooklm/learning/receipts?recommendation_id=rec%201'])
})

test('guarded agent mutations can call same-zone Worker routes in production', () => {
  const wrangler = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
  assert.match(wrangler, /global_fetch_strictly_public/)
})

test('feedback extraction follows disposition and source notes stay source-shaped', () => {
  const product = readFileSync(new URL('../../src/api/product.ts', import.meta.url), 'utf8')
  const jobs = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')
  assert.match(product, /complete && \(disposition === 'retain' \|\| disposition === 'apply'\) \? id\('job'\) : null/)
  assert.match(product, /knowledgeRequested \|\| body\.auto_enqueue === true/)
  assert.doesNotMatch(product, /rating\.score >= 8/)
  assert.doesNotMatch(product, /settings\.srs_drafts\.auto_extract/)
  assert.match(jobs, /one or more complete source-shaped sections/)
  assert.doesNotMatch(jobs, /complete bilingual English and Egyptian Arabic sections/)
})

test('agent context and tools enforce canonical v2 semantics', () => {
  const agent = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')
  const capture = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
  for (const obsolete of ["name: 'push_recommendation'", "name: 'validate_content_fit'", "name: 'log_learning_session'", "name: 'get_agent_context'", "app.post('/validate-fit'"]) {
    assert.equal(agent.includes(obsolete), false, `obsolete tool remains: ${obsolete}`)
  }
  assert.equal(agent.includes("AVG(CASE WHEN user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastery_rate"), false)
  assert.ok(agent.includes('learning_gaps'))
  assert.ok(agent.includes('verified_threads'))
  assert.ok(agent.includes('legacy_mastered'))
  assert.ok(agent.includes("return c.json(payload, requiredUnavailable ? 503 : 200)"))
  assert.ok(agent.includes('loadCaptureQueue(DB, 50)'))
  assert.ok(agent.includes('HAVING MAX(COALESCE(dm.last_consumed, dr.last_consumed)) IS NULL'))
  assert.equal(agent.includes('HAVING last_consumed IS NULL'), false)
  assert.ok(capture.includes('loadCaptureQueue(c.env.DB)'))
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
  assert.match(jobs, /if \(payloadThreadId\) statements\.push/)
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

test('evidence mutation verifies the Thread, and failed post-commit readback remains a committed receipt', async () => {
  const originalFetch = globalThis.fetch
  let readCount = 0
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input))
    if (init?.method === 'POST') return Response.json({ ok: true, id: 'evidence-1' }, { status: 201 })
    readCount += 1
    if (readCount === 1) return Response.json({ thread: { id: 'thread-1', status: 'active' } })
    return Response.json({ error: 'temporary readback failure' }, { status: 503 })
  }) as any
  try {
    const response = await agentRequest({
      method: 'POST',
      path: '/learning/core/threads/thread-1/verify',
      idempotency_key: 'verify-1',
      confirm: true,
      precondition: { path: '/learning/core/threads/thread-1/path', field: 'thread.id', equals: 'thread-1' },
      body: {},
    })
    assert.equal(response.status, 201)
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
    assert.deepEqual(reads, ['/capture/rec-1/record', '/capture/rec-2/record', '/capture/rec-1/record', '/capture/rec-2/record'])
    assert.equal(payload.receipt.after.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('atomic mutation reservation schema and middleware protect request fingerprints', () => {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../../migrations/0037_atomic_mutation_reservations.sql', import.meta.url), 'utf8')
  assert.ok(source.includes("INSERT OR IGNORE INTO sync_mutation_locks"))
  assert.ok(source.includes('mutation_id_reused_for_different_operation'))
  assert.ok(source.includes("crypto.subtle.digest('SHA-256'"))
  assert.ok(migration.includes('request_hash TEXT'))
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS sync_mutation_locks'))
})

test('Hermes cockpit, evidence retrieval, private intake, and recovery seams stay synchronized', () => {
  const agent = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')
  const search = readFileSync(new URL('../../src/api/search.ts', import.meta.url), 'utf8')
  const index = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../../migrations/0038_hermes_brief_annotations_receipts.sql', import.meta.url), 'utf8')
  const telegramMigration = readFileSync(new URL('../../migrations/0039_telegram_webhook_dedup.sql', import.meta.url), 'utf8')
  const extension = readFileSync(new URL('../../browser-extension/background.js', import.meta.url), 'utf8')
  assert.ok(agent.includes("['GET', '/agent/briefing'"))
  assert.ok(agent.includes("app.get('/activity'"))
  assert.ok(search.includes("app.get('/evidence'"))
  assert.ok(index.includes('REQUIRE_API_AUTH'))
  assert.ok(index.includes('x-telegram-bot-api-secret-token'))
  assert.ok(index.includes('telegram_updates'))
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS source_annotations'))
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS agent_receipts'))
  assert.ok(telegramMigration.includes('CREATE TABLE IF NOT EXISTS telegram_updates'))
  assert.ok(extension.includes('contextMenus'))
  assert.ok(!extension.includes('API_TOKEN'))
})
