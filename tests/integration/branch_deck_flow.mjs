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

  server = spawn(wrangler, ['dev', '--config', 'wrangler.toml', '--persist-to', persistDir, '--port', '8794', '--var', 'REQUIRE_API_AUTH:false', '--var', 'ALLOW_UNAUTHENTICATED_LOCAL_WRITES:true'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:8794/health/live')).ok) break } catch {}
    if (attempt === 59) throw new Error('Worker did not start')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:8794${path}`, { headers: { 'content-type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json() }
  }
  const query = async (command) => run(['d1', 'execute', 'recommendations-db', '--local', '--config', 'wrangler.toml', '--persist-to', persistDir, '--command', command])

  const BRANCH = 'deep-work-branch'
  const ASSERTION = `user.profile.branch_preference.${BRANCH}`

  // Seed one branch with one explicitly mapped source (recommendation_meta
  // branch_id) and one consumed source that only matches via dedup_key prefix —
  // the legacy fallback the deck must still resolve.
  await query(`
    INSERT INTO tree_nodes (id,type,label,super_category,parent_id,status,updated_at) VALUES ('${BRANCH}','branch','Deep Work','cat-mind','root','fresh',datetime('now'));
    INSERT INTO recommendations (id,video_title,creator,content_type,video_url,status,user_rating,dedup_key,consumed_date) VALUES
      ('rec_mapped','Deep work session planning','Cal Newport','lecture','https://example.org/deep-a','consumed','8','${BRANCH}-source-a','2026-07-01'),
      ('rec_unmapped','A focused work field study','Researcher B','paper','https://example.org/deep-b','consumed','7','${BRANCH}-source-b','2026-07-05');
    INSERT INTO recommendation_meta (recommendation_id,branch_id,learning_state) VALUES ('rec_mapped','${BRANCH}','queued');
  `)

  // 1. Evidence-driven deck: the branch appears with real mapped + unmapped counts.
  const deck = await request('/brain/branch-deck')
  assert.equal(deck.status, 200, JSON.stringify(deck.body))
  assert.ok(deck.body.categories.some((item) => item.id === 'cat-mind'), 'deck returns the canonical category index')
  assert.ok(!deck.body.existing.some((item) => item.id === 'practical-ai'), 'removed paused AI branch does not remain in the top-level registry')
  assert.ok(!deck.body.existing.some((item) => item.status === 'held'), 'the rebuilt personal registry starts with no paused branches')
  const branch = deck.body.existing.find((item) => item.id === BRANCH)
  assert.ok(branch, 'branch must appear in the evidence-driven deck')
  assert.equal(branch.mapped_count, 1, 'explicitly mapped source must be counted via recommendation_meta.branch_id')
  assert.equal(branch.unmapped_count, 1, 'dedup_key-prefix fallback must count the unmapped consumed source')
  assert.equal(branch.status, 'fresh')
  assert.equal('round' in branch, false, 'retired synthetic rounds must not return in the deck')
  assert.equal('round_label' in branch, false, 'legacy round columns must not return in the deck')
  assert.equal(branch.is_candidate, true, 'candidate/active/fresh branches are waiting on a decision')

  // 2. Prune is a reversible exclusion, not an applied fact.
  const pruned = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: BRANCH, action: 'prune', label: 'Deep Work', super_category: 'cat-mind' }) })
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
  const priorityOrderBeforePromotion = parseJson(await query('SELECT branch_id,rank FROM priorities ORDER BY rank')).results
  const promoted = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: BRANCH, action: 'priority', label: 'Deep Work', super_category: 'cat-mind' }) })
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body))
  node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='${BRANCH}'`)).results[0]
  assert.equal(node.status, 'love')
  const priority = parseJson(await query(`SELECT rank FROM priorities WHERE branch_id='${BRANCH}'`)).results[0]
  assert.equal(priority.rank, 1, 'promote must write the explicit rank-1 priority, not an unbounded tail')
  assertion = parseJson(await query(`SELECT category FROM profile_assertions WHERE assertion_key='${ASSERTION}'`)).results[0]
  assert.equal(assertion.category, 'priority')

  // 5. Undo reverses the side effects, not just the tree row.
  const undone = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: BRANCH, action: 'undo', label: 'Deep Work', restore_status: 'pruned', restore_priority_rank: null, restore_action: 'priority' }) })
  assert.equal(undone.status, 200, JSON.stringify(undone.body))
  node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='${BRANCH}'`)).results[0]
  assert.equal(node.status, 'pruned', 'undo restores the prior tree status')
  const prioritiesAfterUndo = parseJson(await query(`SELECT COUNT(*) c FROM priorities WHERE branch_id='${BRANCH}'`)).results[0]
  assert.equal(prioritiesAfterUndo.c, 0, 'undo removes the promoted priority row')
  const priorityOrderAfterUndo = parseJson(await query('SELECT branch_id,rank FROM priorities ORDER BY rank')).results
  assert.deepEqual(priorityOrderAfterUndo, priorityOrderBeforePromotion, 'undo restores the complete priority order without gaps')
  taste = parseJson(await query(`SELECT COUNT(*) c FROM taste_vectors WHERE topic='${BRANCH}'`)).results[0]
  assert.equal(taste.c, 0, 'undo deletes the taste signal the decision wrote')
  assertion = parseJson(await query(`SELECT status FROM profile_assertions WHERE assertion_key='${ASSERTION}'`)).results[0]
  assert.equal(assertion.status, 'inactive', 'undo deactivates the typed assertion')

  // Pruning and restoring an existing priority keeps the entire list contiguous.
  const seededPriorityOrder = parseJson(await query('SELECT branch_id,rank FROM priorities ORDER BY rank')).results
  const prunedPriority = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'taz', action: 'prune', label: 'Tazkiyah & Character', super_category: 'cat-faith' }) })
  assert.equal(prunedPriority.status, 200, JSON.stringify(prunedPriority.body))
  const compactPriorityOrder = parseJson(await query('SELECT branch_id,rank FROM priorities ORDER BY rank')).results
  assert.deepEqual(compactPriorityOrder.map((item) => item.rank), [1, 2, 3, 4], 'archiving a priority closes its rank gap')
  const restoredPriority = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'taz', action: 'undo', label: 'Tazkiyah & Character', restore_status: 'active', restore_priority_rank: 1, restore_action: 'prune' }) })
  assert.equal(restoredPriority.status, 200, JSON.stringify(restoredPriority.body))
  const restoredPriorityOrder = parseJson(await query('SELECT branch_id,rank FROM priorities ORDER BY rank')).results
  assert.deepEqual(restoredPriorityOrder, seededPriorityOrder, 'restoring an archived priority restores its exact rank order')

  // 6. Undo of an add removes the branch entirely (it never existed before).
  await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'r1-test-add', action: 'add', label: 'Test Add', super_category: 'cat-mind', parent_id: 'cat-mind', description: 'Temp branch for undo test', leaves_sample: ['a', 'b'] }) })
  node = parseJson(await query(`SELECT status FROM tree_nodes WHERE id='r1-test-add'`)).results[0]
  assert.equal(node.status, 'active')
  const signalBeforeUpdate = parseJson(await query('SELECT recent_signal FROM profile WHERE id=1')).results[0]?.recent_signal ?? null
  const updated = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'r1-test-add', action: 'update', label: 'Test Add Updated', super_category: 'cat-life', parent_id: 'cat-life', description: 'Updated personal scope', leaves_sample: ['one', 'two'], contrast_hook: 'Not a test category.' }) })
  assert.equal(updated.status, 200, JSON.stringify(updated.body))
  assert.equal(updated.body.affinity_score, null, 'editing metadata must not write a taste signal')
  const updatedNode = parseJson(await query(`SELECT label,parent_id,status,json_extract(meta_json,'$.description') description FROM tree_nodes WHERE id='r1-test-add'`)).results[0]
  assert.equal(updatedNode.label, 'Test Add Updated')
  assert.equal(updatedNode.parent_id, 'cat-life')
  assert.equal(updatedNode.status, 'active', 'editing details must preserve branch status')
  assert.equal(updatedNode.description, 'Updated personal scope')
  const partialUpdate = await request('/brain/branch-swipe', { method: 'POST', body: JSON.stringify({ id: 'r1-test-add', action: 'update', label: 'Test Add Renamed' }) })
  assert.equal(partialUpdate.status, 200, JSON.stringify(partialUpdate.body))
  const partialNode = parseJson(await query(`SELECT label,parent_id,json_extract(meta_json,'$.description') description FROM tree_nodes WHERE id='r1-test-add'`)).results[0]
  assert.deepEqual(partialNode, { label: 'Test Add Renamed', parent_id: 'cat-life', description: 'Updated personal scope' }, 'partial edits preserve omitted category and metadata')
  const signalAfterUpdate = parseJson(await query('SELECT recent_signal FROM profile WHERE id=1')).results[0]?.recent_signal ?? null
  assert.equal(signalAfterUpdate, signalBeforeUpdate, 'editing metadata must not change the recommendation profile signal')
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
