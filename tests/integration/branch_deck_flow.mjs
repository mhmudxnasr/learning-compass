import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const wrangler = './node_modules/.bin/wrangler'
const persistDir = mkdtempSync(join(tmpdir(), 'learning-compass-branch-deck-'))
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

const parseJson = (output) => JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))

try {
  writeFileSync(preContextBriefSchema, readFileSync('schema.sql', 'utf8').replace('  context_brief TEXT,\n', ''))
  for (const args of [
    ['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--file', preContextBriefSchema],
    ['d1', 'migrations', 'apply', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir],
  ]) await run(args)

  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8794'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:8794/health')).ok) break } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8794${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json() }
  }
  const query = async (command) => run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--command', command])

  const BRANCH = 'r1-deep-work'
  const ASSERTION = `user.profile.branch_preference.${BRANCH}`

  // Seed one branch with one explicitly mapped source (recommendation_meta
  // branch_id) and one consumed source that only matches via dedup_key prefix —
  // the legacy fallback the deck must still resolve.
  await query(`
    INSERT INTO tree_nodes (id,type,label,super_category,parent_id,status,round_label,updated_at) VALUES ('${BRANCH}','branch','Deep Work','cat-mind','root','fresh','R1',datetime('now'));
    INSERT INTO recommendations (id,video_title,creator,content_type,video_url,status,user_rating,dedup_key,consumed_date) VALUES
      ('rec_mapped','Deep work session planning','Cal Newport','lecture','https://example.org/deep-a','consumed','8','${BRANCH}-source-a','2026-07-01'),
      ('rec_unmapped','A focused work field study','Researcher B','paper','https://example.org/deep-b','consumed','7','${BRANCH}-source-b','2026-07-05');
    INSERT INTO recommendation_meta (recommendation_id,branch_id,learning_state) VALUES ('rec_mapped','${BRANCH}','queued');
  `)

  // 1. Evidence-driven deck: the branch appears with real mapped + unmapped counts.
  const deck = await request('/brain/branch-deck')
  assert.equal(deck.status, 200, JSON.stringify(deck.body))
  const branch = deck.body.existing.find((item) => item.id === BRANCH)
  assert.ok(branch, 'branch must appear in the evidence-driven deck')
  assert.equal(branch.mapped_count, 1, 'explicitly mapped source must be counted via recommendation_meta.branch_id')
  assert.equal(branch.unmapped_count, 1, 'dedup_key-prefix fallback must count the unmapped consumed source')
  assert.equal(branch.status, 'fresh')
  assert.equal(branch.is_candidate, true, 'candidate/active/fresh branches are waiting on a decision')

  // 2. Prune is a reversible exclusion, not an applied fact.
  const pruned = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: BRANCH, action: 'prune', label: 'Deep Work', super_category: 'cat-mind', round_label: 'R1' }) })
  assert.equal(pruned.status, 200, JSON.stringify(pruned.body))
  assert.equal(pruned.body.affinity_score, 0.5, 'prune writes a negative taste signal')
  let node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='${BRANCH}'`)).results[0]
  assert.equal(node.status, 'pruned')
  let explored = parseJson(await query(`SELECT is_pruned, lifecycle_state FROM branch_exploration WHERE id='${BRANCH}'`)).results[0]
  assert.equal(explored.is_pruned, 1)
  assert.equal(explored.lifecycle_state, 'pruned')
  let taste = parseJson(await query(`SELECT affinity_score FROM taste_vectors WHERE topic='${BRANCH}'`)).results[0]
  assert.equal(taste.affinity_score, 0.5)
  let assertion = parseJson(await query(`SELECT category, status, confidence FROM profile_assertions WHERE assertion_key='${ASSERTION}'`)).results[0]
  assert.equal(assertion.category, 'exclusion', 'prune is a user exclusion')
  assert.equal(assertion.status, 'active')
  assert.equal(assertion.confidence, 1.0)
  const appliedProposals = parseJson(await query(`SELECT COUNT(*) c FROM feedback_proposals WHERE target_label LIKE '%${BRANCH}%' AND status='applied'`)).results[0]
  assert.equal(appliedProposals.c, 0, 'prune must never fabricate an applied feedback proposal')

  // 3. Compass context reads the exclusion: the pruned branch is blocked.
  const thread = await request('/learning/core/threads', { method: 'POST', body: JSON.stringify({ title: 'Branch deck compass effect', thread_type: 'understand', guiding_question: 'Which branch should drive the next exploration?', definition_of_done: 'A branch decision steers Compass.', activate: true }) })
  assert.equal(thread.status, 201, JSON.stringify(thread.body))
  const context = await request('/compass/context')
  assert.equal(context.status, 200, JSON.stringify(context.body))
  const exclusions = context.body.exclusions || context.body.blockedEntities || []
  assert.ok(exclusions.some((term) => String(term).includes(BRANCH) || String(term).includes('deep work')), 'pruned branch must block future recommendations')

  // 4. Priority is one explicit renumbered rank, and love status.
  const promoted = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: BRANCH, action: 'priority', label: 'Deep Work', super_category: 'cat-mind', round_label: 'R1' }) })
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body))
  node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='${BRANCH}'`)).results[0]
  assert.equal(node.status, 'love')
  const priority = parseJson(await query(`SELECT rank FROM priorities WHERE branch_id='${BRANCH}'`)).results[0]
  assert.equal(priority.rank, 1, 'promote must write the explicit rank-1 priority, not an unbounded tail')
  assertion = parseJson(await query(`SELECT category FROM profile_assertions WHERE assertion_key='${ASSERTION}'`)).results[0]
  assert.equal(assertion.category, 'priority')

  // 5. Undo reverses the side effects, not just the tree row.
  const undone = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: BRANCH, action: 'undo', label: 'Deep Work', restore_status: 'pruned', restore_priority_rank: null }) })
  assert.equal(undone.status, 200, JSON.stringify(undone.body))
  node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='${BRANCH}'`)).results[0]
  assert.equal(node.status, 'pruned', 'undo restores the prior tree status')
  const prioritiesAfterUndo = parseJson(await query(`SELECT COUNT(*) c FROM priorities WHERE branch_id='${BRANCH}'`)).results[0]
  assert.equal(prioritiesAfterUndo.c, 0, 'undo removes the promoted priority row')
  taste = parseJson(await query(`SELECT COUNT(*) c FROM taste_vectors WHERE topic='${BRANCH}'`)).results[0]
  assert.equal(taste.c, 0, 'undo deletes the taste signal the decision wrote')
  assertion = parseJson(await query(`SELECT status FROM profile_assertions WHERE assertion_key='${ASSERTION}'`)).results[0]
  assert.equal(assertion.status, 'inactive', 'undo deactivates the typed assertion')

  // 6. Undo of an add removes the branch entirely (it never existed before).
  await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'r1-test-add', action: 'add', label: 'Test Add', super_category: 'cat-tech', round_label: 'R1', description: 'Temp branch for undo test', leaves_sample: ['a', 'b'] }) })
  node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='r1-test-add'`)).results[0]
  assert.equal(node.status, 'active')
  const undidAdd = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'r1-test-add', action: 'undo', label: 'Test Add', restore_status: 'candidate', restore_priority_rank: null }) })
  assert.equal(undidAdd.status, 200, JSON.stringify(undidAdd.body))
  const afterUndoAdd = parseJson(await query(`SELECT COUNT(*) c FROM tree_nodes WHERE id='r1-test-add'`)).results[0]
  assert.equal(afterUndoAdd.c, 0, 'undo of an add must remove the branch, not resurrect a fake status')

  // 7. Suggest is grounded, review-before-commit, and writes nothing.
  const beforeCount = parseJson(await query(`SELECT COUNT(*) c FROM tree_nodes`)).results[0].c
  const suggest = await request('/brain/branch-suggest', { method: 'POST', body: JSON.stringify({ mode: 'surprise', count: 3 }) })
  assert.equal(suggest.status, 200, JSON.stringify(suggest.body))
  assert.ok(Array.isArray(suggest.body.suggestions), 'suggest always returns a suggestions array')
  for (const item of suggest.body.suggestions) {
    assert.equal(item.status, 'candidate')
    assert.equal(item.source, 'suggest')
    assert.ok(item.label && item.description, 'each suggestion carries label and description')
    assert.ok(Object.prototype.hasOwnProperty.call(item, 'plain_language'), 'each suggestion carries a plain-language brief')
    assert.ok(['low', 'medium', 'high'].includes(item.evidence_confidence), 'each suggestion carries bounded evidence confidence')
    assert.ok(Array.isArray(item.overlap_candidates), 'each suggestion carries overlap candidates')
    assert.ok(Object.prototype.hasOwnProperty.call(item, 'suggested_next_move'), 'each suggestion carries a cautious next move')
    assert.ok(Object.prototype.hasOwnProperty.call(item, 'uncertainty_note'), 'each suggestion names uncertainty')
  }
  const afterCount = parseJson(await query(`SELECT COUNT(*) c FROM tree_nodes`)).results[0].c
  assert.equal(afterCount, beforeCount, 'suggest must never write to the map or profile')

  console.log(`Branch deck flow passed (deck evidence, prune exclusion, priority renumber, undo reversal, undo-of-add, review-before-commit suggest).`)
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') } }
  }
  rmSync(persistDir, { recursive: true, force: true })
}
