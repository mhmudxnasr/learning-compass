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

  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8792', '--var', 'ALLOW_UNAUTHENTICATED_LOCAL_WRITES:true'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:8792/health/live')).ok) break } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8792${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json() }
  }
  const query = async (command) => run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--command', command])

  await query(`
    INSERT INTO tree_nodes (id,type,label,status,parent_id) VALUES ('compass-branch','branch','Compass test branch','love','root');
    INSERT INTO recommendations (id,video_title,creator,content_type,video_url,status,dedup_key) VALUES ('rec_decline','Declined source','Creator A','article','https://example.org/declined','active','declined-source');
    INSERT INTO recommendation_meta (recommendation_id,learning_state,branch_id) VALUES ('rec_decline','queued','compass-branch');
    INSERT INTO learning_sessions (id,recommendation_id,status,intent) VALUES ('session_decline','rec_decline','active','Compass Pick');
    INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,outcome_status) VALUES ('outcome_rec_decline','rec_decline','Creator A','article','active');
    INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count) VALUES ('pick_decline','request_decline','fit','started','rec_decline',3);
  `)
  const declined = await request('/compass/pick/pick_decline/feedback', { method: 'POST', body: JSON.stringify({ outcome: 'declined', score: 3, disposition: 'drop', reason_tags: ['too_shallow'], reflection: 'Too shallow for where I am now.', expected: 'A substantive treatment.', actual: 'A surface overview.', effort: 'light', length_minutes: 12 }) })
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
  assert.equal(declinedRecord.body.feedback[0].structured.expected, 'A substantive treatment.')
  assert.equal(declinedRecord.body.feedback[0].structured.actual, 'A surface overview.')
  assert.equal(declinedRecord.body.feedback[0].disposition, 'drop')
  const feedbackContext = await request('/feedback/context')
  const declinedEvent = feedbackContext.body.feedback_events.find((event) => event.pick_id === 'pick_decline')
  assert.equal(declinedEvent.lane, 'fit')
  assert.equal(declinedEvent.branch_id, 'compass-branch')
  assert.equal('round' in declinedEvent, false)
  assert.equal(declinedEvent.outcome, 'declined')
  assert.equal(declinedEvent.structured.effort, 'light')
  assert.deepEqual(declinedEvent.reason_tags, ['too_shallow'])
  const analytics = await request('/analytics/hermes')
  assert.equal(analytics.body.compass_learning.feedback.total, 1)
  assert.equal(analytics.body.compass_learning.feedback.by_reason[0].reason, 'too_shallow')
  assert.equal(analytics.body.compass_learning.feedback.by_lane[0].lane, 'fit')
  // Observability (Phase 1): the rejection must now be learnable — a non-NULL
  // rejection_reason on the outcome and exposure context on the feedback row.
  const parseJson = (output) => JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
  const declinedOutcome = parseJson(await query(`SELECT rejection_reason FROM recommendation_outcomes WHERE recommendation_id='rec_decline'`)).results[0]
  assert.equal(declinedOutcome.rejection_reason, 'too_shallow')
  const declinedFeedback = parseJson(await query(`SELECT exposure_json FROM compass_feedback WHERE pick_id='pick_decline'`)).results[0]
  const declinedExposure = JSON.parse(declinedFeedback.exposure_json)
  assert.equal(declinedExposure.engine, 'v1')
  assert.equal(declinedExposure.lane, 'fit')
  assert.equal(declinedExposure.branch_id, 'compass-branch')
  assert.equal('round' in declinedExposure, false)

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

  await query(`
    INSERT INTO recommendations (id,video_title,creator,content_type,video_url,status,dedup_key) VALUES ('rec_dismiss','Deferred source','Creator D','article','https://example.org/deferred','active','deferred-source');
    INSERT INTO recommendation_meta (recommendation_id,learning_state) VALUES ('rec_dismiss','compass_pick');
    INSERT INTO recommendation_outcomes (id,recommendation_id,creator,format,outcome_status) VALUES ('outcome_rec_dismiss','rec_dismiss','Creator D','article','active');
    INSERT INTO compass_picks (id,request_id,strategy,status,recommendation_id,candidate_count) VALUES ('pick_dismiss','request_dismiss','bridge','ready','rec_dismiss',3);
  `)
  const badFitWithoutReason = await request('/compass/pick/pick_dismiss/feedback', { method: 'POST', body: JSON.stringify({ outcome: 'declined' }) })
  assert.equal(badFitWithoutReason.status, 400)
  assert.equal(badFitWithoutReason.body.error, 'bad_fit_reason_required')
  const dismissed = await request('/compass/pick/pick_dismiss/feedback', { method: 'POST', body: JSON.stringify({ outcome: 'dismissed', reason_tags: ['not_now'] }) })
  assert.equal(dismissed.status, 200)
  assert.equal(dismissed.body.recommendation_state, 'captured')
  assert.equal(dismissed.body.feedback_job, null)
  assert.equal(dismissed.body.learning_receipt.skipped, 'neutral_signal')
  const dismissedRecord = await request('/capture/rec_dismiss/record')
  assert.equal(dismissedRecord.body.item.status, 'active')
  assert.equal(dismissedRecord.body.item.learning_state, 'captured')
  assert.equal(dismissedRecord.body.outcome.training_eligible, 0)
  assert.equal(dismissedRecord.body.outcome.learning_value, null)

  const contextBrief = 'What it is: a primary-source research note.\n• Covers the method, evidence, and practical implication.\n• Expect a focused technical overview.'
  const compassThread = await request('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title: 'Evaluate the Compass mechanism', thread_type: 'understand', guiding_question: 'Which source best explains the mechanism?', definition_of_done: 'Explain the mechanism with anchored evidence.', activate: true }) })
  assert.equal(compassThread.status, 201)
  const missingBranch = await request('/compass/picks', {
    method: 'POST',
    body: JSON.stringify({ intent: 'deepen_thread', thread_id: compassThread.body.id, candidates: [{}, {}, {}] }),
  })
  assert.equal(missingBranch.status, 400)
  assert.equal(missingBranch.body.error, 'candidate_branch_required')
  const submitted = await request('/compass/picks', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'request_context_brief',
      intent: 'deepen_thread',
      strategy: 'fit',
      thread_id: compassThread.body.id,
      candidates: [
        { canonical_url: 'https://example.com/?context-brief=winner', title: 'Context brief primary research', creator: 'Research Lab', format: 'article', source_class: 'research', branch_id: 'compass-branch', evidence: [{ claim: 'The original research explains its method, evidence, limitations, and practical implication.', source_url: 'https://example.com/?context-brief=winner' }], editorial_review: { verdict: 'recommend', why_worth_time: 'It directly explains the mechanism with evidence and limitations.', unique_value: 'It connects the mechanism to a practical learning decision.', depth: 'substantive' }, context_brief: contextBrief },
        { canonical_url: 'https://example.com/?context-brief=alternate-one', title: 'Context brief alternate one', creator: 'Writer One', format: 'article', source_class: 'blog', branch_id: 'compass-branch', evidence: [{ claim: 'This source provides a second explanation of the mechanism and its limits.', source_url: 'https://example.com/?context-brief=alternate-one' }], editorial_review: { verdict: 'recommend', why_worth_time: 'It offers a useful second explanation of the mechanism.', unique_value: 'It provides a contrasting practical example for comparison.', depth: 'substantive' } },
        { canonical_url: 'https://example.com/?context-brief=alternate-two', title: 'Context brief alternate two', creator: 'Writer Two', format: 'article', source_class: 'blog', branch_id: 'compass-branch', evidence: [{ claim: 'This source presents a distinct account of the mechanism and supporting evidence.', source_url: 'https://example.com/?context-brief=alternate-two' }], editorial_review: { verdict: 'recommend', why_worth_time: 'It presents a distinct account worth comparing.', unique_value: 'It adds another evidence-backed angle to the thread.', depth: 'substantive' } },
      ],
    }),
  })
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body))
  assert.ok(submitted.body.recommendation_id || submitted.body.reviewable_weak_pick)
  const submittedPick = await request('/compass/pick')
  assert.equal(submittedPick.status, 200)
  assert.equal(submittedPick.body.pick.context_brief, contextBrief)
  const startedSubmitted = await request(`/compass/pick/${submittedPick.body.pick.id}/start`, { method: 'POST' })
  assert.equal(startedSubmitted.status, 200)
  const submittedQueue = await request('/capture/queue')
  const submittedQueueItem = submittedQueue.body.items.find((item) => item.id === startedSubmitted.body.recommendation_id)
  assert.equal(submittedQueueItem.context_brief, contextBrief)
  assert.equal(submittedQueueItem.branch.id, 'compass-branch')
  await request(`/compass/pick/${submittedPick.body.pick.id}/feedback`, { method: 'POST', body: JSON.stringify({ outcome: 'declined', reason_tags: ['wrong_topic'] }) })

  await query(`
    INSERT INTO compass_picks (id,request_id,strategy,status,candidate_count,confidence,stop_reason,rationale_json) VALUES ('pick_weak','request_weak','fit','abstained',3,0.61,'winner_below_score_threshold','{"why_this":"A promising but lightly evidenced source.","context_brief":"What it is: a compact source review.\\n• Covers the core argument and supporting evidence.\\n• Expect a cautious, practical overview.","score":0.63,"abstention_reason":"winner_below_score_threshold","source_check":{"status":"verified"}}');
    INSERT INTO compass_candidates (id,pick_id,canonical_url,title,creator,format,source_class,context_brief,features_json,evidence_json,score,uncertainty,is_verified,is_winner,branch_id) VALUES ('candidate_weak','pick_weak','https://example.net/weak','Reviewable weak source','Creator C','article','essay','What it is: a compact source review.\n• Covers the core argument and supporting evidence.\n• Expect a cautious, practical overview.','{"_valid_url":true,"_has_identity":true,"_source_check":"verified"}','{}',0.63,0.3,1,1,'compass-branch');
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

  const firstOrdinaryFeedback = await request('/feedback/record', { method: 'POST', body: JSON.stringify({
    source_url: 'https://example.org/ordinary-feedback-history',
    title: 'Ordinary feedback history',
    branch_id: 'compass-branch',
    feedback: 'I need to continue this when I have a longer block.',
    completion_state: 'in_progress',
    reason_tags: ['not_now'],
    expected: 'A focused practical treatment.',
    actual: 'Promising, but unfinished.',
    effort: 'light',
    length_minutes: 9,
    disposition: 'reference',
  }) })
  assert.equal(firstOrdinaryFeedback.status, 200)
  const firstOrdinaryRecord = await request(`/capture/${firstOrdinaryFeedback.body.source.id}/record`)
  assert.equal(firstOrdinaryRecord.body.item.branch_id, 'compass-branch')
  const secondOrdinaryFeedback = await request('/feedback/record', { method: 'POST', body: JSON.stringify({
    recommendation_id: firstOrdinaryFeedback.body.source.id,
    feedback: 'Finished it later; the final mechanism was worth retaining.',
    completion_state: 'completed',
    reason_tags: ['highly_relevant'],
    score: 9,
    expected: 'A focused practical treatment.',
    actual: 'A clear mechanism with a useful boundary.',
    effort: 'moderate',
    length_minutes: 31,
    disposition: 'retain',
  }) })
  assert.equal(secondOrdinaryFeedback.status, 200)
  const secondOrdinaryRecord = await request(`/capture/${firstOrdinaryFeedback.body.source.id}/record`)
  assert.equal(secondOrdinaryRecord.body.item.branch_id, 'compass-branch')
  const ordinaryFeedbackContext = await request('/feedback/context')
  const ordinaryEvents = ordinaryFeedbackContext.body.feedback_events.filter((event) => event.recommendation_id === firstOrdinaryFeedback.body.source.id && event.source !== 'compass_pick')
  assert.equal(ordinaryEvents.length, 2)
  assert.equal(ordinaryEvents.find((event) => event.structured.completion_state === 'in_progress').feedback, 'I need to continue this when I have a longer block.')
  assert.deepEqual(ordinaryEvents.find((event) => event.structured.completion_state === 'in_progress').reason_tags, ['not_now'])
  assert.equal(ordinaryEvents.find((event) => event.structured.completion_state === 'completed').structured.length_minutes, 31)
  assert.equal(ordinaryEvents.find((event) => event.structured.completion_state === 'completed').disposition, 'retain')

  // Legacy/manual rows must not make the singular Compass read fail because a
  // receipt column contains malformed JSON.
  await query(`
    INSERT INTO compass_picks (id,request_id,strategy,status,candidate_count,rationale_json,shadow_json) VALUES ('pick_malformed','request_malformed','fit','abstained',0,'not-json','[broken');
  `)
  const malformed = await request('/compass/pick')
  assert.equal(malformed.status, 200, JSON.stringify(malformed.body))
  assert.deepEqual(malformed.body.pick.rationale, {})
  assert.deepEqual(malformed.body.pick.shadow, {})
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
