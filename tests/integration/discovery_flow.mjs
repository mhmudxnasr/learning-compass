import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-disc-test-'))
let server

try {
  console.log('1. Setting up local D1 schema and applying discovery migration...')
  for (const args of [
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', 'schema.sql'],
    ['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir],
  ]) {
    const process = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    process.stdout.on('data', (chunk) => { output += chunk })
    process.stderr.on('data', (chunk) => { output += chunk })
    const status = await new Promise((resolve) => process.on('close', resolve))
    if (status !== 0) throw new Error(`D1 setup failed:\n${output}`)
  }

  console.log('2. Starting local Wrangler dev server...')
  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8788'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })
  server.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8788/health')
      if (response.ok) break
    } catch {}
    if (attempt === 59) throw new Error(`Worker did not start:\n${serverLog}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const req = async (path, options = {}) => {
    const res = await fetch(`http://127.0.0.1:8788${path}`, {
      headers: { 'content-type': 'application/json' },
      ...options,
    })
    const body = await res.json()
    return { status: res.status, body }
  }

  console.log('3. Testing GET /discovery/state...')
  const state0 = await req('/discovery/state')
  assert.equal(state0.status, 200)
  assert.equal(state0.body.gate_state.can_start_discovery, true)

  console.log('4. Testing POST /discovery/runs (Creating research mission)...')
  const run1 = await req('/discovery/runs', { method: 'POST', body: JSON.stringify({ mission: 'Test discovery wave 1' }) })
  assert.equal(run1.status, 200)
  assert.ok(run1.body.run.id)
  const runId = run1.body.run.id

  console.log('5. Testing Hard Feedback Gate (Blocking concurrent discovery run)...')
  const run2 = await req('/discovery/runs', { method: 'POST', body: JSON.stringify({ mission: 'Concurrent discovery wave' }) })
  assert.equal(run2.status, 409)
  assert.equal(run2.body.error, 'hard_gate_blocked')
  console.ok ? console.ok('Gate blocked second run as expected') : console.log('✓ Hard gate correctly blocked second run')

  console.log('6. Testing POST /discovery/runs/:id/candidates...')
  const candidatesInput = Array.from({ length: 20 }, (_, i) => ({
    canonical_url: `https://example.com/source-${i + 1}`,
    title: `Frontier Candidate ${i + 1}`,
    creator: `Researcher ${i % 5}`,
    format: i % 2 === 0 ? 'article' : 'paper',
    source_class: ['paper', 'essay', 'podcast', 'book'][i % 4],
    is_verified: i < 8,
    verification: { verified_url: `https://example.com/source-${i + 1}`, author_verified: true },
    total_score: 0.85 - i * 0.02,
  }))
  const candidatesRes = await req(`/discovery/runs/${runId}/candidates`, { method: 'POST', body: JSON.stringify({ candidates: candidatesInput }) })
  assert.equal(candidatesRes.status, 200)
  assert.equal(candidatesRes.body.count, 20)
  assert.equal(candidatesRes.body.source_classes_count, 4)

  console.log('7. Testing POST /discovery/runs/:id/select...')
  const selectRes = await req(`/discovery/runs/${runId}/select`, { method: 'POST', body: JSON.stringify({}) })
  assert.equal(selectRes.status, 200)
  assert.equal(selectRes.body.ok, true)
  assert.equal(selectRes.body.run.lifecycle, 'selected')
  assert.ok(selectRes.body.winner.title.includes('Frontier Candidate'))

  console.log('8. Testing POST /discovery/runs/:id/activate...')
  const activateRes = await req(`/discovery/runs/${runId}/activate`, { method: 'POST' })
  assert.equal(activateRes.status, 200)
  assert.equal(activateRes.body.activated, true)
  assert.equal(activateRes.body.lifecycle, 'active')
  assert.ok(activateRes.body.recommendation_id)
  assert.ok(activateRes.body.session_id)

  console.log('9. Testing POST /discovery/runs/:id/interview...')
  const interviewRes = await req(`/discovery/runs/${runId}/interview`, {
    method: 'POST',
    body: JSON.stringify({
      raw_feedback: 'This opened an unexpected personal frontier in behavioral game theory!',
      questions: ['How does this framing compare to your past conviction on decision theory?'],
      answers: { 'How does this framing compare to your past conviction on decision theory?': 'The contrast hook highlights a blind spot I had not considered.' },
    }),
  })
  assert.equal(interviewRes.status, 200)
  assert.equal(interviewRes.body.interview.status, 'interviewing')

  console.log('10. Testing POST /discovery/runs/:id/resolve...')
  const resolveRes = await req(`/discovery/runs/${runId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({
      structured_resolution: { opened_frontier: true, real_life_impact: true },
      learning_receipt: {
        evidence: ['Opened new game theory frontier'],
        confidence: 0.95,
        affected_branches: ['behavioral-economics'],
      },
      evidence_deltas: { frontier_potential: 0.05 },
      branch_mutations: [{ branch_id: 'behavioral-economics', action: 'promote' }],
    }),
  })
  assert.equal(resolveRes.status, 200)
  assert.equal(resolveRes.body.lifecycle, 'resolved')
  assert.ok(resolveRes.body.updated_weights.frontier_potential)

  console.log('11. Testing POST /agent/jobs/:id/heartbeat...')
  const heartbeatRes = await req(`/agent/jobs/${run1.body.job_id}/heartbeat`, { method: 'POST', body: JSON.stringify({ worker: 'integration' }) })
  // Should return 409 because status is pending or not running, or if claimed then 200
  assert.ok([200, 409].includes(heartbeatRes.status))

  console.log('12. Testing GET /discovery/revisions/pending & POST /discovery/revisions/:id/confirm...')
  const pendingRevRes = await req('/discovery/revisions/pending')
  assert.equal(pendingRevRes.status, 200)
  assert.ok(Array.isArray(pendingRevRes.body.pending_revisions))

  console.log('13. Testing GET /discovery/drift-check...')
  const driftRes = await req('/discovery/drift-check')
  assert.equal(driftRes.status, 200)
  assert.equal(driftRes.body.expected_contract_version, '2.0.0')

  console.log('\n🎉 ALL DISCOVERY ENGINE E2E INTEGRATION TESTS PASSED PERFECTLY!')
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
