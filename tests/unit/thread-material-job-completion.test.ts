import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jobs = readFileSync(new URL('../../src/api/jobs.ts', import.meta.url), 'utf8')

test('lesson material completion is a read-only ready-pick or abstention receipt', () => {
  const route = jobs.slice(jobs.indexOf("app.post('/:id/complete'"), jobs.indexOf("app.post('/:id/fail'"))
  assert.match(route, /job\.job_type === 'compass_lesson_material'/)
  assert.match(route, /allowed_outcomes: \['ready', 'abstained'\]/)
  assert.match(route, /lesson_material_output_forbidden/)
  assert.match(route, /It cannot attach, queue, start, or advance anything/)
  assert.match(route, /lesson_material_abstention_requires_reason/)
  assert.match(route, /new Set\(\['worker', 'outcome', 'pick_id', 'recommendation_id'/)
  assert.match(route, /recommendationId !== String\(pick\.recommendation_id/)
  assert.match(route, /JOIN compass_candidates c ON c\.pick_id=p\.id AND c\.is_winner=1/)
  assert.match(route, /JOIN recommendation_meta m ON m\.recommendation_id=p\.recommendation_id AND m\.branch_id=c\.branch_id/)
  assert.match(route, /p\.workflow_scope='lesson_material' AND p\.workflow_request_id=\?/)
  assert.match(route, /bind\(pickId, job\.id\)/)
  assert.match(route, /p\.status='ready'/)
  assert.match(route, /targetLessonId !== payload\.lesson_id/)
  assert.match(route, /pick\.thread_id !== payload\.thread_id/)
  assert.match(route, /lesson_material_pick_receipt_mismatch/)
  assert.match(route, /recommendation_id: pick\.recommendation_id/)
  assert.match(route, /JSON\.stringify\(completionResult\)/)
  assert.match(route, /UPDATE compass_picks SET status='resolved'/)
  assert.match(route, /p\.workflow_request_id=agent_jobs\.id AND p\.status='resolved'/)
  assert.match(route, /if \(!completion\[1\]\?\.meta\.changes\)/)
  assert.doesNotMatch(route, /compass_lesson_material[\s\S]{0,1800}INSERT INTO thread_lesson_sources/)
  assert.doesNotMatch(route, /compass_lesson_material[\s\S]{0,1800}UPDATE recommendation_meta/)
})
