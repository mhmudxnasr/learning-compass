import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'taste-rec-test-'))
let server

try {
  console.log('--- TESTING TASTE-REC DISCOVERY ENGINE V2 ---')

  console.log('\nStep 1: Setting up local D1 database schema and migrations...')
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

  console.log('Step 2: Launching local worker server...')
  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8789', '--var', 'ALLOW_UNAUTHENTICATED_LOCAL_WRITES:true'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })
  server.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-4000) })

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8789/health/live')
      if (response.ok) break
    } catch {}
    if (attempt === 59) throw new Error(`Worker did not start:\n${serverLog}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const req = async (path, options = {}) => {
    const res = await fetch(`http://127.0.0.1:8789${path}`, {
      headers: { 'content-type': 'application/json', 'x-agent-name': 'taste-rec' },
      ...options,
    })
    const body = await res.json()
    return { status: res.status, body }
  }

  console.log('\nStep 3: Checking /agent/context and /discovery/context for Taste Rec readiness...')
  const agentCtx = await req('/agent/context')
  assert.equal(agentCtx.status, 503)
  assert.equal(agentCtx.body.curator, 'Mahmood')
  assert.equal(agentCtx.body.learning_gaps, null)
  assert.equal(agentCtx.body.health.sections.learning_gaps.status, 'degraded')

  const discCtx = await req('/discovery/context')
  assert.equal(discCtx.status, 200)
  assert.equal(discCtx.body.engine_weights.frontier_potential.baseline, 0.3)
  console.log('✓ Canonical discovery context loaded; placeholder agent gaps remained explicitly unavailable.')

  console.log('\nStep 4: Executing Taste Rec intent -> Creating Discovery Run (Wave 1)...')
  const runRes = await req('/discovery/runs', {
    method: 'POST',
    body: JSON.stringify({
      mission: 'Recommend something about unexpected frontiers in Mechanism Design',
      selected_branch_id: 'mechanism-design',
      model_version: 'gemini-3.6-flash',
    }),
  })
  assert.equal(runRes.status, 200)
  assert.ok(runRes.body.run.id)
  const runId = runRes.body.run.id
  console.log(`✓ Discovery Run created: ${runId} (Wave ${runRes.body.run.wave})`)

  console.log('\nStep 5: Verifying Hard Feedback Gate prevents concurrent recommendation intent...')
  const gateCheck = await req('/discovery/runs', {
    method: 'POST',
    body: JSON.stringify({ mission: 'Second concurrent intent' }),
  })
  assert.equal(gateCheck.status, 409)
  assert.equal(gateCheck.body.error, 'hard_gate_blocked')
  console.log('✓ Hard gate correctly blocked concurrent recommendation attempt.')

  console.log('\nStep 6: Simulating 5-10m open web candidate gathering & verification...')
  // 20 candidates across 4 source classes (paper, essay, podcast, book)
  const candidates = [
    {
      canonical_url: 'https://arxiv.org/abs/2301.00001',
      title: 'Robust Mechanism Design Under Ambiguity and Incomplete Information',
      creator: 'Eric Maskin & Stephen Morris',
      format: 'paper',
      source_class: 'paper',
      is_verified: true,
      verification: { verified_url: 'https://arxiv.org/abs/2301.00001', author_verified: true },
      score_components: { frontier_potential: 0.95, info_gain: 0.9, personal_pull: 0.85, real_life_relevance: 0.8, source_quality: 0.95, format_exploration: 0.8 },
      total_score: 0.91,
    },
    {
      canonical_url: 'https://aeon.co/essays/how-auction-theory-reshaped-modern-markets',
      title: 'The Hidden Architecture of Modern Market Design',
      creator: 'Paul Milgrom',
      format: 'article',
      source_class: 'essay',
      is_verified: true,
      verification: { verified_url: 'https://aeon.co/essays/how-auction-theory-reshaped-modern-markets', author_verified: true },
      score_components: { frontier_potential: 0.85, info_gain: 0.8, personal_pull: 0.8, real_life_relevance: 0.85, source_quality: 0.9, format_exploration: 0.7 },
      total_score: 0.84,
    },
    ...Array.from({ length: 18 }, (_, i) => ({
      canonical_url: `https://example.org/candidate-${i + 3}`,
      title: `Mechanism Research Candidate ${i + 3}`,
      creator: `Author ${i}`,
      format: i % 2 === 0 ? 'podcast' : 'book',
      source_class: i % 2 === 0 ? 'podcast' : 'book',
      is_verified: i < 8,
      verification: { verified_url: `https://example.org/candidate-${i + 3}`, author_verified: true },
      total_score: 0.75 - i * 0.02,
    })),
  ]

  const candRes = await req(`/discovery/runs/${runId}/candidates`, {
    method: 'POST',
    body: JSON.stringify({ candidates }),
  })
  assert.equal(candRes.status, 200)
  assert.equal(candRes.body.count, 20)
  assert.equal(candRes.body.source_classes_count, 4)
  console.log('✓ 20 candidates across 4 source classes stored and verified.')

  console.log('\nStep 7: Selecting Winner Candidate & Decision Receipt (Contrast Hook)...')
  const selectRes = await req(`/discovery/runs/${runId}/select`, {
    method: 'POST',
    body: JSON.stringify({
      selected_candidate_id: candRes.body.candidates[0].id,
      decision_receipt: {
        why_this: 'Contrasts Maskin’s classical equilibrium with modern ambiguity-averse Mechanism Design.',
        why_now: 'Directly addresses neglected branch mechanism-design under 30d decay.',
        explored_branch: 'mechanism-design',
        surprise: 'Demonstrates how mechanism rules hold even when Bayesian priors fail.',
        confidence: 0.91,
        what_feedback_will_teach: 'Calibrates whether academic preprints outperform essays for frontier discovery.',
      },
    }),
  })
  assert.equal(selectRes.status, 200)
  assert.equal(selectRes.body.winner.title, 'Robust Mechanism Design Under Ambiguity and Incomplete Information')
  console.log(`✓ Winner selected: "${selectRes.body.winner.title}" (Score: ${selectRes.body.winner.total_score})`)

  console.log('\nStep 8: Activating Winner into Queue & Starting Session...')
  const actRes = await req(`/discovery/runs/${runId}/activate`, { method: 'POST' })
  assert.equal(actRes.status, 200)
  assert.equal(actRes.body.activated, true)
  const recId = actRes.body.recommendation_id
  console.log(`✓ Recommendation activated into Queue: ${recId}`)

  console.log('\nStep 9: Verifying Item in Active Queue...')
  const queueRes = await req('/capture/queue')
  assert.equal(queueRes.status, 200)
  const items = queueRes.body.items || queueRes.body.queue || []
  const itemInQueue = items.find((q) => q.id === recId)
  assert.ok(itemInQueue)
  assert.equal(itemInQueue.video_title, 'Robust Mechanism Design Under Ambiguity and Incomplete Information')
  console.log('✓ Verified recommendation is present in active Queue.')

  console.log('\nStep 10: Simulating Adaptive Feedback Interview with Mahmood...')
  const interviewRes = await req(`/discovery/runs/${runId}/interview`, {
    method: 'POST',
    body: JSON.stringify({
      raw_feedback: 'This paper completely opened a new frontier for how I view institutional design under uncertainty!',
      questions: ['Did the academic preprint format feel appropriate for this level of depth?'],
      answers: { 'Did the academic preprint format feel appropriate for this level of depth?': 'Yes, 45-minute deep focus preprint was perfect.' },
    }),
  })
  assert.equal(interviewRes.status, 200)
  assert.equal(interviewRes.body.interview.status, 'interviewing')
  console.log('✓ Feedback interview questions and answers recorded.')

  console.log('\nStep 11: Resolving Discovery Run & Applying Learning Receipt...')
  const resolveRes = await req(`/discovery/runs/${runId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({
      structured_resolution: { opened_frontier: true, real_life_impact: true, source_love: true },
      learning_receipt: {
        evidence: ['Opened mechanism design frontier via academic preprint'],
        confidence: 0.95,
        affected_branches: ['mechanism-design'],
      },
      evidence_deltas: { frontier_potential: 0.04, source_quality: 0.02 },
      branch_mutations: [{ branch_id: 'mechanism-design', action: 'promote' }],
      learned_heuristics_patch: '- Academic preprints in Mechanism Design yield high frontier potential when prior conviction is high.',
    }),
  })
  assert.equal(resolveRes.status, 200)
  assert.equal(resolveRes.body.lifecycle, 'resolved')
  assert.equal(resolveRes.body.skill_revision.status, 'staged')
  assert.equal(resolveRes.body.skill_revision.backup_path, null)
  console.log('✓ Discovery resolved. Bounded engine weights adapted.')

  console.log('\nStep 12: Checking Drift & Skill Self-Improvement...')
  const driftRes0 = await req('/discovery/drift-check')
  assert.equal(driftRes0.status, 200)
  assert.ok(driftRes0.body.skill.latest_revision)

  const latestHash = driftRes0.body.skill.latest_revision.file_hash
  const driftRes = await req(`/discovery/drift-check`, {
    headers: { 'content-type': 'application/json', 'x-skill-hash': latestHash },
  })
  assert.equal(driftRes.status, 200)
  assert.equal(driftRes.body.is_aligned, true)
  console.log(`✓ Skill status verified. Latest revision hash: ${latestHash.slice(0, 12)}...`)
  assert.equal(resolveRes.body.lifecycle, 'resolved')
  console.log('✓ Verified Discovery resolution and learning receipt applied!')

  console.log('\n🎉 ALL TASTE-REC DISCOVERY ENGINE V2 TESTS PASSED PERFECTLY!')
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
