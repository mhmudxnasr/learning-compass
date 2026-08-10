import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-feedback-test-'))
let server

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('error', reject)
  child.on('close', (status) => status === 0 ? resolve(output) : reject(new Error(`Wrangler failed (${status}): ${output}`)))
})

try {
  for (const args of [
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', 'schema.sql'],
    ['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir],
  ]) await run(args)

  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8791'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:8791/health')).ok) break } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8791${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json() }
  }

  await run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--command', `
    INSERT OR REPLACE INTO profile (id, quality_rules_json) VALUES (1, '["existing rule"]');
    INSERT INTO feedback_proposals (id, change_type, target_label, proposed_json, status) VALUES
      ('api-quality', 'quality_rule', 'Quality rule', '{"rule":"cite evidence"}', 'pending'),
      ('api-style', 'operational_style', 'Operational style', '{"tone":"direct","format":"compact"}', 'pending'),
      ('api-unknown', 'future_change', 'Unknown', '"value"', 'pending');
    INSERT INTO agent_jobs (id,job_type,payload_json,idempotency_key,status,trigger_kind) VALUES
      ('api-no-change','process_feedback','{"conversation_id":"feedback-integration"}','feedback-no-change','pending','explicit_user_action');
  `])

  assert.equal((await request('/feedback/proposals/api-quality/approve', { method: 'POST' })).status, 200)
  const qualityProfile = await request('/brain/profile?recent_limit=49')
  assert.deepEqual(JSON.parse(qualityProfile.body.profile.quality_rules_json), ['existing rule', { rule: 'cite evidence' }])
  const qualityReceipt = await request('/agent/memory?q=self_improvement%3Aproposal%3Aapi-quality')
  assert.equal(qualityReceipt.body.memories[0]?.source, 'feedback_proposal:api-quality')
  assert.equal(qualityReceipt.body.memories[0]?.status, 'approved')

  assert.equal((await request('/feedback/proposals/api-style/approve', { method: 'POST' })).status, 200)
  const styleProfile = await request('/brain/profile?recent_limit=48')
  assert.deepEqual(JSON.parse(styleProfile.body.profile.operational_style_json), { tone: 'direct', format: 'compact' })

  assert.equal((await request('/feedback/proposals/api-quality/approve', { method: 'POST' })).status, 404)
  const revertedQuality = await request('/feedback/proposals/api-quality/revert', { method: 'POST' })
  assert.equal(revertedQuality.status, 200)
  assert.equal(revertedQuality.body.compatibility_reverted, true)
  const revertedProfile = await request('/brain/profile?recent_limit=49')
  assert.deepEqual(JSON.parse(revertedProfile.body.profile.quality_rules_json), ['existing rule'])
  const unsupported = await request('/feedback/proposals/api-unknown/approve', { method: 'POST' })
  assert.equal(unsupported.status, 422)
  const pending = await request('/feedback/proposals?status=pending')
  assert.ok(pending.body.proposals.some((proposal) => proposal.id === 'api-unknown'))
  assert.equal((await request('/agent/jobs/api-no-change/claim', { method: 'POST', body: JSON.stringify({ worker: 'feedback-integration' }) })).status, 200)
  const noChange = await request('/agent/jobs/api-no-change/complete', { method: 'POST', body: JSON.stringify({ worker: 'feedback-integration', no_change: { confidence: 0.93, reason: 'The conversation supplied no durable profile update.', evidence: [{ source: 'feedback-integration', finding: 'no repeated signal' }] } }) })
  assert.equal(noChange.status, 200)
  const improvements = await request('/analytics/hermes/improvements')
  const noChangeRun = improvements.body.runs.find((run) => run.id === 'improvement_api-no-change')
  assert.equal(noChangeRun.status, 'validated')
  assert.equal(noChangeRun.validation.no_change, true)
  assert.equal(noChangeRun.after.changed, false)
  console.log('Feedback proposal integration passed: apply, guarded types, and evidence-backed no-change')
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
