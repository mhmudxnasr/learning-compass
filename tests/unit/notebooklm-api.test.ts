import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let app: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  app = (await vite.ssrLoadModule('/src/api/notebooklm.ts')).default
})
test.after(async () => { await vite.close() })

function notebookEnv() {
  const notebookUrl = 'https://notebook.google.com/notebook/notebook-123'
  const receipts: any[] = []
  let tick = 0
  const DB = {
    prepare(sql: string) {
      let values: any[] = []
      const statement: any = {
        bind(...bound: any[]) { values = bound; return statement },
        async first() {
          if (sql.includes('FROM recommendations WHERE id=?') && values[0] === 'rec-1') return { id: 'rec-1', video_title: 'Source', notebook_url: notebookUrl }
          return null
        },
        async all() {
          if (!sql.includes('FROM agent_receipts')) return { results: [] }
          return { results: receipts.filter((row) => row.target === values[0]).sort((a, b) => b.created_at.localeCompare(a.created_at)) }
        },
        async run() {
          if (sql.includes('INSERT INTO agent_receipts')) {
            tick += 1
            receipts.push({
              id: values[0], request_id: values[1], agent_name: values[2], intent: values[3], target: values[4],
              status_code: values[5], verified: values[6], receipt_json: values[7], created_at: `2026-08-20 12:00:${String(tick).padStart(2, '0')}`,
            })
          }
          return { meta: { changes: 1 } }
        },
      }
      return statement
    },
  }
  return { env: { DB } as any, notebookUrl }
}

const post = (path: string, body: unknown, env: any) => app.request(`https://example.test${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-name': 'test-notebooklm' }, body: JSON.stringify(body),
}, env)

test('NotebookLM API enforces indexed source, focused route, and pending artifact receipts', async () => {
  const { env, notebookUrl } = notebookEnv()
  const base = { kind: 'source', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl }

  assert.equal((await post('/learning/receipts', { kind: 'source' }, env)).status, 400)

  const beforeIndex = await post('/learning/route', { recommendation_id: 'rec-1' }, env)
  assert.equal(beforeIndex.status, 409)

  assert.equal((await post('/learning/receipts', { ...base, status: 'pending' }, env)).status, 201)
  assert.equal((await post('/learning/receipts', { ...base, status: 'indexed', provider_source_id: 'source-1' }, env)).status, 201)

  const routed = await post('/learning/route', { recommendation_id: 'rec-1' }, env)
  assert.equal(routed.status, 201)
  const plan: any = await routed.json()
  assert.deepEqual(plan.selected_formats, ['quiz'])

  const pending = await post('/learning/receipts', {
    kind: 'artifact', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl,
    plan_id: plan.plan_id, format: 'quiz', status: 'pending', provider_task_id: 'task-1', source_grounded: true, custom_prompt_applied: true,
  }, env)
  assert.equal(pending.status, 201)

  const read = await app.request('https://example.test/learning/receipts?recommendation_id=rec-1', {}, env)
  assert.equal(read.status, 200)
  const state: any = await read.json()
  assert.equal(state.linked, true)
  assert.equal(state.indexed, true)
  assert.equal(state.index_status, 'indexed')
  assert.equal(state.output_status, 'pending')
  assert.equal(state.primary_format, 'quiz')
  assert.deepEqual(state.outputs.map((item: any) => [item.format, item.status]), [['quiz', 'pending']])
})

test('NotebookLM API rejects ready quiz claims that skip provider submission or contract checks', async () => {
  const { env, notebookUrl } = notebookEnv()
  const source = { kind: 'source', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl }
  await post('/learning/receipts', { ...source, status: 'indexed', provider_source_id: 'source-1' }, env)
  const route = await post('/learning/route', { recommendation_id: 'rec-1' }, env)
  const plan: any = await route.json()

  const skipped = await post('/learning/receipts', {
    kind: 'artifact', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl,
    plan_id: plan.plan_id, format: 'quiz', status: 'ready', provider_artifact_id: 'artifact-1', source_grounded: true, custom_prompt_applied: true,
    question_count: 7, hints_before_explanations: true, transfer_question_count: 1,
  }, env)
  assert.equal(skipped.status, 409)

  await post('/learning/receipts', {
    kind: 'artifact', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl,
    plan_id: plan.plan_id, format: 'quiz', status: 'pending', provider_task_id: 'task-1', source_grounded: true, custom_prompt_applied: true,
  }, env)
  const weak = await post('/learning/receipts', {
    kind: 'artifact', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl,
    plan_id: plan.plan_id, format: 'quiz', status: 'ready', provider_artifact_id: 'artifact-1', source_grounded: true, custom_prompt_applied: true,
    question_count: 4, hints_before_explanations: false, transfer_question_count: 0,
  }, env)
  assert.equal(weak.status, 422)
})

test('NotebookLM API rejects an artifact receipt after the source has been re-indexed', async () => {
  const { env, notebookUrl } = notebookEnv()
  const source = { kind: 'source', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl }
  await post('/learning/receipts', { ...source, status: 'indexed', provider_source_id: 'source-1' }, env)
  const route = await post('/learning/route', { recommendation_id: 'rec-1' }, env)
  const plan: any = await route.json()
  await post('/learning/receipts', {
    kind: 'artifact', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl,
    plan_id: plan.plan_id, format: 'quiz', status: 'pending', provider_task_id: 'task-1', source_grounded: true, custom_prompt_applied: true,
  }, env)
  await post('/learning/receipts', { ...source, status: 'indexed', provider_source_id: 'source-2' }, env)

  const stale = await post('/learning/receipts', {
    kind: 'artifact', recommendation_id: 'rec-1', notebook_id: 'notebook-123', notebook_url: notebookUrl,
    plan_id: plan.plan_id, format: 'quiz', status: 'ready', provider_artifact_id: 'artifact-1', source_grounded: true, custom_prompt_applied: true,
    question_count: 7, hints_before_explanations: true, transfer_question_count: 1,
  }, env)
  assert.equal(stale.status, 409)
  assert.equal((await stale.json() as any).error, 'learning_plan_not_current')
})

test('NotebookLM API strips fields that could impersonate the canonical receipt ledger', async () => {
  const { env, notebookUrl } = notebookEnv()
  const response = await post('/learning/receipts', {
    kind: 'source',
    recommendation_id: 'rec-1',
    notebook_id: ' notebook-123 ',
    notebook_url: ` ${notebookUrl} `,
    status: 'indexed',
    provider_source_id: 'source-1',
    id: 'source-fake',
    intent: 'notebooklm_artifact_receipt',
    created_at: '2099-01-01 00:00:00',
    unrelated: 'do not store me',
  }, env)
  assert.equal(response.status, 201)
  const created: any = await response.json()
  assert.notEqual(created.receipt.id, 'source-fake')
  assert.equal(created.receipt.intent, undefined)
  assert.equal(created.receipt.created_at, undefined)
  assert.equal(created.receipt.unrelated, undefined)

  const read = await app.request('https://example.test/learning/receipts?recommendation_id=rec-1', {}, env)
  const state: any = await read.json()
  assert.equal(state.source.id, created.receipt_id)
  assert.equal(state.source.intent, 'notebooklm_source_receipt')
  assert.equal(state.source.notebook_id, 'notebook-123')
  assert.equal(state.source.notebook_url, notebookUrl)
  assert.equal(state.indexed, true)
})

test('NotebookLM status preserves its existing generation mode while exposing the learning router', async () => {
  const { env } = notebookEnv()
  const response = await app.request('https://example.test/status', {}, env)
  assert.equal(response.status, 200)
  const status: any = await response.json()
  assert.equal(status.generation_mode, 'on_demand_chat_only')
  assert.equal(status.learning_router_mode, 'explicit_source_grounded_learning_router')
  assert.equal(status.learning_output_policy.default, 'quiz')
})
