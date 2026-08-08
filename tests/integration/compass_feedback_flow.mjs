import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-compass-feedback-'))
const preContextBriefSchema = join(persistDir, 'schema-before-context-brief.sql')
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
  writeFileSync(preContextBriefSchema, readFileSync('schema.sql', 'utf8').replace('  context_brief TEXT,\n', ''))
  for (const args of [
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', preContextBriefSchema],
    ['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir],
  ]) await run(args)

  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8792'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:8792/health')).ok) break } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8792${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json() }
  }
  const query = async (command) => run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--command', command])

  await query(`
    INSERT INTO recommendations (id,video_title,creator,content_type,video_url,status,dedup_key) VALUES ('rec_decline','Declined source','Creator A','article','https://example.org/declined','active','declined-source');
    INSERT INTO recommendation_meta (recommendation_id,learning_state) VALUES ('rec_decline','queued');
    INSERT INTO learning_sessions (id,recommendation_id,status,intent) VALUES ('session_decline','rec_decline','active','Compass Pick');
    INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,outcome_status) VALUES ('outcome_rec_decline','rec_decline','Creator A','article','active');
    INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count) VALUES ('pick_decline','request_decline','fit','started','rec_decline',3);
  `)
  const declined = await request('/compass/pick/pick_decline/feedback', { method: 'POST', body: JSON.stringify({ outcome: 'declined', score: 3, reason_tags: ['too_shallow'], reflection: 'Too shallow for where I am now.' }) })
  assert.equal(declined.status, 200)
  assert.equal(declined.body.recommendation_state, 'excluded')
  assert.ok(declined.body.feedback_job)
  assert.equal((await request('/compass/pick')).body.pick, null)
  const declinedRecord = await request('/capture/rec_decline/record')
  assert.equal(declinedRecord.body.item.status, 'rejected')
  assert.equal(declinedRecord.body.item.learning_state, 'excluded')
  assert.equal(declinedRecord.body.outcome.outcome_status, 'rejected')
  assert.equal(declinedRecord.body.sessions[0].status, 'returned')
  assert.equal(declinedRecord.body.notes[0].sections.find((section) => section.section_key === 'reaction').content, 'Too shallow for where I am now.')
  assert.ok(declinedRecord.body.jobs.some((job) => job.job_type === 'process_feedback'))

  await query(`
    INSERT INTO recommendations (id,video_title,creator,content_type,video_url,status,dedup_key) VALUES ('rec_complete','Completed source','Creator B','lecture','https://example.org/completed','active','completed-source');
    INSERT INTO recommendation_meta (recommendation_id,learning_state) VALUES ('rec_complete','compass_pick');
    INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,outcome_status) VALUES ('outcome_rec_complete','rec_complete','Creator B','lecture','active');
    INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count) VALUES ('pick_complete','request_complete','fit','ready','rec_complete',3);
  `)
  const completed = await request('/compass/pick/pick_complete/feedback', { method: 'POST', body: JSON.stringify({ outcome: 'completed', score: 9, reflection: 'Useful, practical, and worth revisiting.' }) })
  assert.equal(completed.status, 200)
  assert.equal(completed.body.recommendation_state, 'completed')
  const completedRecord = await request('/capture/rec_complete/record')
  assert.equal(completedRecord.body.item.status, 'consumed')
  assert.equal(completedRecord.body.item.learning_state, 'completed')
  assert.equal(completedRecord.body.outcome.outcome_status, 'consumed')
  assert.equal(completedRecord.body.sessions[0].status, 'completed')
  assert.equal(completedRecord.body.item.user_score, 9)

  const contextBrief = 'What it is: a primary-source research note.\n• Covers the method, evidence, and practical implication.\n• Expect a focused technical overview.'
  const submitted = await request('/compass/picks', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'request_context_brief',
      strategy: 'fit',
      candidates: [
        { canonical_url: 'https://example.com/?context-brief=winner', title: 'Context brief primary research', creator: 'Research Lab', format: 'article', source_class: 'research', evidence: 'The original research explains its method, evidence, limitations, and practical implication.', context_brief: contextBrief },
        { canonical_url: 'https://example.com/?context-brief=alternate-one', title: 'Context brief alternate one', creator: 'Writer One', format: 'article', source_class: 'blog' },
        { canonical_url: 'https://example.com/?context-brief=alternate-two', title: 'Context brief alternate two', creator: 'Writer Two', format: 'article', source_class: 'blog' },
      ],
    }),
  })
  assert.equal(submitted.status, 200)
  assert.ok(submitted.body.recommendation_id || submitted.body.reviewable_weak_pick)
  const submittedPick = await request('/compass/pick')
  assert.equal(submittedPick.status, 200)
  assert.equal(submittedPick.body.pick.context_brief, contextBrief)
  const startedSubmitted = await request(`/compass/pick/${submittedPick.body.pick.id}/start`, { method: 'POST' })
  assert.equal(startedSubmitted.status, 200)
  const submittedQueue = await request('/capture/queue')
  assert.equal(submittedQueue.body.items.find((item) => item.id === startedSubmitted.body.recommendation_id).context_brief, contextBrief)
  await request(`/compass/pick/${submittedPick.body.pick.id}/feedback`, { method: 'POST', body: JSON.stringify({ outcome: 'declined' }) })

  await query(`
    INSERT INTO compass_picks (id,request_id,strategy,status,candidate_count,confidence,stop_reason,rationale_json) VALUES ('pick_weak','request_weak','fit','abstained',3,0.61,'winner_below_score_threshold','{"why_this":"A promising but lightly evidenced source.","context_brief":"What it is: a compact source review.\\n• Covers the core argument and supporting evidence.\\n• Expect a cautious, practical overview.","score":0.63,"abstention_reason":"winner_below_score_threshold","source_check":{"status":"verified"}}');
    INSERT INTO compass_candidates (id,pick_id,canonical_url,title,creator,format,source_class,context_brief,features_json,evidence_json,score,uncertainty,is_verified,is_winner) VALUES ('candidate_weak','pick_weak','https://example.net/weak','Reviewable weak source','Creator C','article','essay','What it is: a compact source review.\n• Covers the core argument and supporting evidence.\n• Expect a cautious, practical overview.','{"_valid_url":true,"_has_identity":true,"_source_check":"verified"}','{}',0.63,0.3,1,1);
  `)
  const weak = await request('/compass/pick')
  assert.equal(weak.status, 200, JSON.stringify(weak.body))
  assert.equal(weak.body.pick.status, 'abstained')
  assert.equal(weak.body.pick.video_title, 'Reviewable weak source')
  assert.equal(weak.body.pick.video_url, 'https://example.net/weak')
  assert.equal(weak.body.pick.context_brief, 'What it is: a compact source review.\n• Covers the core argument and supporting evidence.\n• Expect a cautious, practical overview.')
  const acceptedWeak = await request('/compass/pick/pick_weak/start', { method: 'POST' })
  assert.equal(acceptedWeak.status, 200)
  assert.ok(acceptedWeak.body.recommendation_id)
  const acceptedWeakRecord = await request(`/capture/${acceptedWeak.body.recommendation_id}/record`)
  assert.equal(acceptedWeakRecord.body.item.learning_state, 'queued')
  assert.equal(acceptedWeakRecord.body.item.context_brief, 'What it is: a compact source review.\n• Covers the core argument and supporting evidence.\n• Expect a cautious, practical overview.')
  const queue = await request('/capture/queue')
  assert.equal(queue.body.items.find((item) => item.id === acceptedWeak.body.recommendation_id).context_brief, 'What it is: a compact source review.\n• Covers the core argument and supporting evidence.\n• Expect a cautious, practical overview.')
  assert.equal((await request('/compass/pick')).body.pick.status, 'started')
  console.log('Compass feedback state transitions integration passed')
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
