import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-hermes-test-'))
let server

try {
  for (const args of [
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', 'schema.sql'],
    ['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir],
  ]) {
    const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const status = await new Promise((resolve) => child.on('close', resolve))
    if (status !== 0) throw new Error(`D1 setup failed (${status})`)
  }
  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8789'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:8789/health')).ok) break } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const req = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8789${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json() }
  }

  const captureOptions = { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-mutation-id': 'integration-capture-1' }, body: JSON.stringify({ source: 'https://example.com/integration-source', title: 'Integration source' }) }
  const captured = await req('/capture', captureOptions)
  assert.equal(captured.status, 201)
  const replayedCapture = await req('/capture', captureOptions)
  assert.equal(replayedCapture.status, 201)
  assert.equal(replayedCapture.body.id, captured.body.id)
  const record = await req(`/capture/${captured.body.id}/record`)
  assert.equal(record.status, 200)
  assert.equal(record.body.item.id, captured.body.id)
  const excluded = await req(`/capture/${captured.body.id}/triage`, { method: 'POST', body: JSON.stringify({ action: 'exclude' }) })
  assert.equal(excluded.status, 200)

  const analytics = await req('/analytics/hermes')
  assert.equal(analytics.status, 200)
  assert.equal(analytics.body.jobs.dead_letters, 0)
  assert.ok(Number(analytics.body.quality.total) >= 1)

  const memory = await req('/agent/memory', { method: 'POST', body: JSON.stringify({ memory_key: 'integration.test.rule', memory_kind: 'durable', value: { rule: 'keep evidence' }, confidence: 0.9, source: 'integration-test' }) })
  assert.equal(memory.status, 201)
  const listed = await req('/agent/memory?kind=durable')
  assert.equal(listed.status, 200)
  assert.equal(listed.body.memories.length, 1)
  const resolved = await req(`/agent/memory/${memory.body.id}/resolve`, { method: 'POST', body: JSON.stringify({ status: 'rejected' }) })
  assert.equal(resolved.status, 200)

  const insufficient = await req('/analytics/hermes/recalibrate', { method: 'POST' })
  assert.equal(insufficient.status, 409)
  const seedSql = `INSERT INTO recommendation_outcomes (id,recommendation_id,actual_score,predicted_components_json,outcome_status) VALUES ${Array.from({ length: 5 }, (_, index) => `('quality_${index}','quality_rec_${index}',${6 + index},'{"personal_pull":${0.6 + index / 10},"source_quality":0.8}','consumed')`).join(',')}`
  const seed = spawn(wrangler, ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--command', seedSql], { stdio: ['ignore', 'pipe', 'pipe'] })
  let seedOutput = ''
  seed.stdout.on('data', (chunk) => { seedOutput += chunk })
  seed.stderr.on('data', (chunk) => { seedOutput += chunk })
  const seedStatus = await new Promise((resolve) => seed.on('close', resolve))
  assert.equal(seedStatus, 0, seedOutput)
  const recalibrated = await req('/analytics/hermes/recalibrate', { method: 'POST' })
  assert.equal(recalibrated.status, 200)
  assert.equal(recalibrated.body.sample_size, 5)
  assert.ok(recalibrated.body.deltas.personal_pull > 0)
  const backfill = await req('/analytics/hermes/backfill', { method: 'POST', body: JSON.stringify({ dry_run: true }) })
  assert.equal(backfill.status, 200)
  assert.equal(backfill.body.dry_run, true)
  assert.ok(Number.isInteger(backfill.body.missing_outcomes))
  const weekly = await req('/analytics/hermes/weekly')
  assert.equal(weekly.status, 200)
  assert.ok(weekly.body.period && weekly.body.accuracy)
  const capabilities = await req('/agent/capabilities')
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/agent/jobs/:id/replay'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/analytics/hermes/recalibrate'))
  assert.ok(capabilities.body.capabilities.some((item) => item.path === '/analytics/hermes/backfill'))
  const afterReject = await req('/analytics/hermes')
  assert.equal(afterReject.body.quality.rejected, 1)
  const push = await req('/notifications/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: 'browser://integration-device', keys: {} }) })
  assert.equal(push.status, 201)
  const reminderTest = await req('/notifications/test', { method: 'POST', body: JSON.stringify({ channel: 'browser' }) })
  assert.equal(reminderTest.status, 200)
  assert.equal(reminderTest.body.status, 'queued')
  const notificationState = await req('/notifications')
  assert.equal(notificationState.status, 200)
  assert.ok(notificationState.body.deliveries.length >= 1)
  const largeBatch = Array.from({ length: 210 }, (_, index) => ({ id: `large_${index}`, video_title: `Large library source ${index}`, video_url: `https://example.com/large-${index}`, content_type: 'article', dedup_key: `large_${index}`, status: 'active' }))
  const pushed = await req('/recommendations/push', { method: 'POST', body: JSON.stringify(largeBatch) })
  assert.equal(pushed.status, 200)
  const secondPage = await req('/recommendations/list?limit=200&offset=200')
  assert.equal(secondPage.status, 200)
  assert.ok(secondPage.body.total >= 211)
  assert.ok(secondPage.body.recommendations.length >= 10)
  console.log('Hermes upgrade integration passed: control read model, guarded memory, evidence gate, and capabilities')
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
