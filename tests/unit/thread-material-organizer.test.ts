import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const api = readFileSync(new URL('../../src/api/learning-core.ts', import.meta.url), 'utf8')
const compass = readFileSync(new URL('../../src/api/compass.ts', import.meta.url), 'utf8')
const capture = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
const product = readFileSync(new URL('../../src/api/product.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0071_thread_material_organizer.sql', import.meta.url), 'utf8')

test('thread material migration adds explanatory lesson placement state without losing rows', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE recommendations(id TEXT PRIMARY KEY);
    CREATE TABLE thread_lessons(id TEXT PRIMARY KEY);
    CREATE TABLE thread_sources(thread_id TEXT NOT NULL,recommendation_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',position INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(thread_id,recommendation_id));
    CREATE TABLE learning_path_sources(stage_id TEXT NOT NULL,recommendation_id TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(stage_id,recommendation_id));
    CREATE TABLE thread_lesson_sources(
      lesson_id TEXT NOT NULL REFERENCES thread_lessons(id) ON DELETE CASCADE,
      recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
      role TEXT NOT NULL DEFAULT 'primary',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(lesson_id,recommendation_id)
    );
    CREATE TABLE agent_jobs(
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE compass_picks(
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'ready'
    );
    INSERT INTO recommendations(id) VALUES ('rec-1');
    INSERT INTO thread_lessons(id) VALUES ('lesson-1');
    INSERT INTO thread_lesson_sources(lesson_id,recommendation_id,role,position) VALUES ('lesson-1','rec-1','primary',2);
  `)
  db.exec(migration)

  const placement = db.prepare(`SELECT role,position,expected_contribution,updated_at FROM thread_lesson_sources`).get() as any
  assert.deepEqual({ role: placement.role, position: placement.position, expected_contribution: placement.expected_contribution }, { role: 'primary', position: 0, expected_contribution: null })
  assert.ok(placement.updated_at)
  const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map((row: any) => row.name)
  assert.ok(indexes.includes('idx_thread_lesson_sources_source'))
  assert.ok(indexes.includes('idx_agent_jobs_lesson_material'))
  assert.ok(indexes.includes('idx_thread_lesson_sources_material_order'))
  assert.ok(indexes.includes('idx_compass_lesson_material_request'))
  const compassColumns = db.prepare(`PRAGMA table_info(compass_picks)`).all().map((row: any) => row.name)
  assert.ok(compassColumns.includes('workflow_scope'))
  assert.ok(compassColumns.includes('workflow_request_id'))
})

test('Thread path includes direct sources and every placed source receives coherent artifacts', () => {
  const route = api.slice(api.indexOf("app.get('/threads/:id/path'"), api.indexOf("app.get('/threads/:id/material-sources'"))
  assert.match(route, /FROM thread_sources ts JOIN recommendations r/)
  assert.match(route, /ts\.status!='removed'/)
  assert.match(route, /allPlacedSources = \[\.\.\.\(threadSources\.results/)
  assert.match(route, /selectLearningSourceRenditions/)
  assert.match(route, /sources: \(threadSources\.results \|\| \[\]\)\.map\(attachLearningMaterials\)/)
  assert.match(route, /source_health_status/)
})

test('Library-first material search requires canonical branch and domain ownership', () => {
  const route = api.slice(api.indexOf("app.get('/threads/:id/material-sources'"), api.indexOf("app.post('/threads/:id/stages/:stageId/lessons'"))
  assert.match(route, /JOIN recommendation_meta m/)
  assert.match(route, /b\.type IN \('branch','leaf'\)/)
  assert.match(route, /lower\(COALESCE\(b\.status,''\)\)!='pruned'/)
  assert.match(route, /d\.type='category'/)
  assert.match(route, /LEFT JOIN source_health/)
  assert.match(route, /selectLearningSourceRenditions/)
  assert.match(route, /COALESCE\(json_extract\(metadata_json,'\$\.publication_state'\),'ready'\)!='staged'/)
  assert.match(route, /placements:/)
  assert.match(route, /expectedSourceUrl/)
  assert.match(route, /normalizeUrlForDedup\(String\(row\.video_url \|\| ''\)\) === normalizeUrlForDedup\(expectedSourceUrl\)/)
})

test('Level and lesson attachment use persisted ownership and expose safe update and remove routes', () => {
  assert.match(api, /async function loadPersistedLibrarySource/)
  assert.match(api, /JOIN tree_nodes b ON b\.id=m\.branch_id/)
  assert.match(api, /source_branch_precondition_failed/)
  assert.match(api, /app\.patch\('\/threads\/:id\/lessons\/:lessonId\/sources\/:sourceId'/)
  assert.match(api, /app\.delete\('\/threads\/:id\/lessons\/:lessonId\/sources\/:sourceId'/)
  assert.match(api, /app\.patch\('\/threads\/:id\/stages\/:stageId\/sources\/:sourceId'/)
  assert.match(api, /app\.delete\('\/threads\/:id\/stages\/:stageId\/sources\/:sourceId'/)
  assert.match(api, /expected_contribution=\?/)
  assert.match(api, /replaced_recommendation_ids/)
  assert.match(api, /role must be primary, case, challenge, reference, or optional/)

  const lessonAttach = api.slice(api.indexOf("app.post('/threads/:id/lessons/:lessonId/sources'"), api.indexOf("app.patch('/threads/:id/lessons/:lessonId/sources/:sourceId'"))
  assert.match(lessonAttach, /loadPersistedLibrarySource\(c\.env\.DB, recommendationId\)/)
  assert.doesNotMatch(lessonAttach, /SELECT id,label,status FROM tree_nodes WHERE id=\?/) // never treats the client's branch as ownership
  assert.match(lessonAttach, /INSERT INTO thread_lesson_sources[\s\S]*SELECT \?,m\.recommendation_id/)
  assert.match(lessonAttach, /source_ownership_changed/)
  assert.doesNotMatch(lessonAttach, /branch_id=excluded\.branch_id/)

  const levelAttach = api.slice(api.indexOf("app.post('/threads/:id/stages/:stageId/sources'"), api.indexOf("app.patch('/threads/:id/stages/:stageId/sources/:sourceId'"))
  assert.match(levelAttach, /INSERT INTO learning_path_sources[\s\S]*SELECT \?,m\.recommendation_id/)
  assert.doesNotMatch(levelAttach, /branch_id=excluded\.branch_id/)

  const threadAttach = api.slice(api.indexOf("app.post('/threads/:id/sources'"), api.indexOf("app.delete('/threads/:id/sources/:sourceId'"))
  assert.match(threadAttach, /loadPersistedLibrarySource\(c\.env\.DB, recommendationId\)/)
  assert.match(threadAttach, /source_branch_precondition_failed/)
  assert.match(threadAttach, /requestedPlacementPosition/)
  assert.match(threadAttach, /movePlacementStatements/)
  assert.match(threadAttach, /INSERT INTO thread_sources[\s\S]*SELECT \?,m\.recommendation_id/)
  assert.match(threadAttach, /app\.patch\('\/threads\/:id\/sources\/:sourceId'/)
})

test('placement PATCH and DELETE guard sibling changes with one exact target CAS', () => {
  assert.match(api, /function materialPlacementTargetGuard/)
  assert.match(api, /target\.role=\?/)
  assert.match(api, /target\.position=\?/)
  assert.match(api, /target\.expected_contribution IS \?/)
  assert.match(api, /target\.required=\?/)
  assert.match(api, /target\.status=\?/)
  assert.match(api, /canonicalSourceOwnershipFor\('target\.recommendation_id'\)/)

  const lessonPatch = api.slice(api.indexOf("app.patch('/threads/:id/lessons/:lessonId/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id/lessons/:lessonId/sources/:sourceId'"))
  const levelPatch = api.slice(api.indexOf("app.patch('/threads/:id/stages/:stageId/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id/stages/:stageId/sources/:sourceId'"))
  const threadPatch = api.slice(api.indexOf("app.patch('/threads/:id/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id/sources/:sourceId'"))
  for (const route of [lessonPatch, levelPatch, threadPatch]) {
    assert.match(route, /materialPlacementTargetGuard/)
    assert.match(route, /movePlacementStatements\([\s\S]*targetGuard\)/)
    assert.match(route, /UPDATE [\s\S]*AND \$\{targetGuard\.clause\}/)
    assert.match(route, /mutation\[mutation\.length - 1\]\?\.meta\.changes !== 1/)
    assert.match(route, /source_placement_conflict/)
  }
  assert.match(lessonPatch, /DELETE FROM thread_lesson_sources[\s\S]*\$\{targetGuard\.clause\}/)
  assert.match(levelPatch, /DELETE FROM learning_path_sources[\s\S]*\$\{targetGuard\.clause\}/)

  const lessonDelete = api.slice(api.indexOf("app.delete('/threads/:id/lessons/:lessonId/sources/:sourceId'"), api.indexOf("app.get('/threads/:id/lessons/:lessonId/material-request'"))
  const levelDelete = api.slice(api.indexOf("app.delete('/threads/:id/stages/:stageId/sources/:sourceId'"), api.indexOf("app.post('/threads'"))
  const threadDelete = api.slice(api.indexOf("app.delete('/threads/:id/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id'"))
  for (const route of [lessonDelete, levelDelete, threadDelete]) {
    assert.match(route, /materialPlacementTargetGuard\([\s\S]*false\)/)
    assert.match(route, /UPDATE [\s\S]*position=position-1[\s\S]*\$\{targetGuard\.clause\}/)
    assert.match(route, /mutation\[mutation\.length - 1\]\?\.meta\.changes !== 1/)
    assert.match(route, /source_placement_conflict/)
  }
  assert.ok(lessonDelete.indexOf('SET position=position-1') < lessonDelete.indexOf('DELETE FROM thread_lesson_sources'))
  assert.ok(levelDelete.indexOf('SET position=position-1') < levelDelete.indexOf('DELETE FROM learning_path_sources'))
  assert.ok(threadDelete.indexOf('SET position=position-1') < threadDelete.indexOf("SET status='removed'"))
})

test('placement POST upserts guard stale targets before changing siblings or the target', () => {
  const routes = [
    api.slice(api.indexOf("app.post('/threads/:id/lessons/:lessonId/sources'"), api.indexOf("app.patch('/threads/:id/lessons/:lessonId/sources/:sourceId'")),
    api.slice(api.indexOf("app.post('/threads/:id/stages/:stageId/sources'"), api.indexOf("app.patch('/threads/:id/stages/:stageId/sources/:sourceId'")),
    api.slice(api.indexOf("app.post('/threads/:id/sources'"), api.indexOf("app.patch('/threads/:id/sources/:sourceId'")),
  ]
  for (const route of routes) {
    assert.match(route, /SELECT role,[^\n]*position[^\n]*expected_contribution|SELECT role,expected_contribution,position,status/)
    assert.match(route, /existingPlacement \? materialPlacementTargetGuard/)
    assert.match(route, /: materialPlacementInsertGuard/)
    assert.match(route, /movePlacementStatements\([\s\S]*placementGuard\)/)
    assert.match(route, /targetMutation,[\s\S]*attachment\[attachment\.length - 1\]\?\.meta\.changes !== 1/)
    assert.match(route, /source_placement_conflict/)
    assert.doesNotMatch(route, /ON CONFLICT\([^\n]+\) DO UPDATE SET role/)
  }
  assert.match(routes[0], /DELETE FROM thread_lesson_sources[\s\S]*\$\{placementGuard\.clause\}/)
  assert.match(routes[1], /DELETE FROM learning_path_sources[\s\S]*\$\{placementGuard\.clause\}/)
})

test('every placement requires a nonblank expected contribution, including legacy PATCH rows', () => {
  const routePairs = [
    ["app.post('/threads/:id/lessons/:lessonId/sources'", "app.patch('/threads/:id/lessons/:lessonId/sources/:sourceId'"],
    ["app.post('/threads/:id/stages/:stageId/sources'", "app.patch('/threads/:id/stages/:stageId/sources/:sourceId'"],
    ["app.post('/threads/:id/sources'", "app.patch('/threads/:id/sources/:sourceId'"],
  ] as const
  for (const [start, end] of routePairs) {
    const route = api.slice(api.indexOf(start), api.indexOf(end))
    assert.match(route, /const expectedContribution = clean\(body\.expected_contribution, 1000\)/)
    assert.match(route, /expected_contribution_required/)
    assert.doesNotMatch(route, /expected_contribution[^\n]{0,120}\|\| null/)
  }
  for (const route of [
    api.slice(api.indexOf("app.patch('/threads/:id/lessons/:lessonId/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id/lessons/:lessonId/sources/:sourceId'")),
    api.slice(api.indexOf("app.patch('/threads/:id/stages/:stageId/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id/stages/:stageId/sources/:sourceId'")),
    api.slice(api.indexOf("app.patch('/threads/:id/sources/:sourceId'"), api.indexOf("app.delete('/threads/:id/sources/:sourceId'")),
  ]) {
    assert.match(route, /if \(!clean\(expectedContribution, 1000\)\).*expected_contribution_required/)
  }
})

test('reviewed Find material attachment is bound to the result URL through commit', () => {
  const attach = api.slice(api.indexOf("app.post('/threads/:id/lessons/:lessonId/sources'"), api.indexOf("app.patch('/threads/:id/lessons/:lessonId/sources/:sourceId'"))
  assert.match(attach, /normalizeUrlForDedup\(expectedSourceUrl\) !== normalizeUrlForDedup\(String\(source\.video_url \|\| ''\)\)/)
  assert.match(attach, /lesson_material_source_changed/)
  assert.match(attach, /expectedSourceUrlMutationGuard\(recommendationId, expectedCurrentSourceUrl\)/)
  assert.match(api, /guard_url\.video_url=\?/)
  assert.match(attach, /movePlacementStatements\([\s\S]*placementGuard\)/)
  assert.match(attach, /attachment\[attachment\.length - 1\]\?\.meta\.changes !== 1/)
})

test('implicit Thread placement writers persist contribution without overwriting authored explanations', () => {
  const captureQueue = capture.slice(capture.indexOf("app.post('/:id/triage'"), capture.indexOf("app.post('/:id/branch-map'"))
  const sessionStart = product.slice(product.indexOf("app.post('/sessions/start'"), product.indexOf("app.post('/feedback/record'"))
  const compassStart = compass.slice(compass.indexOf("app.post('/pick/:id/start'"), compass.indexOf("app.post('/pick/:id/feedback'"))
  for (const route of [captureQueue, sessionStart, compassStart]) {
    assert.match(route, /INSERT INTO thread_sources \(thread_id,recommendation_id,role,expected_contribution,position,status\)/)
    assert.match(route, /TRIM\(COALESCE\(thread_sources\.expected_contribution,''\)\)=''/)
    assert.match(route, /ELSE thread_sources\.expected_contribution/)
    assert.match(route, /JOIN tree_nodes placement_branch|JOIN tree_nodes start_branch/)
    assert.match(route, /JOIN tree_nodes placement_domain|JOIN tree_nodes start_domain/)
  }
  assert.match(captureQueue, /Queued as supporting material for this Thread/)
  assert.match(sessionStart, /body\.intent, recommendation\.why_this/)
  assert.match(compassStart, /candidateContext\.expected_contribution/)
})

test('Compass target-Lesson start is additive, canonically guarded, and commits one exact start', () => {
  const route = compass.slice(compass.indexOf("app.post('/pick/:id/start'"), compass.indexOf("app.post('/pick/:id/feedback'"))
  assert.doesNotMatch(route, /DELETE FROM thread_lesson_sources/)
  assert.match(route, /NOT EXISTS \(SELECT 1 FROM thread_lesson_sources placed WHERE placed\.lesson_id=start_lesson\.id\)/)
  assert.match(route, /INSERT INTO thread_lesson_sources \(lesson_id,recommendation_id,role,position,expected_contribution,updated_at\)/)
  assert.match(route, /start_pick\.workflow_scope='general' AND start_pick\.status=\?/)
  assert.match(route, /startStatements\.push\(c\.env\.DB\.prepare\(`UPDATE compass_picks/)
  assert.match(route, /started\[started\.length - 1\]\?\.meta\.changes !== 1/)
  assert.match(route, /candidate_target_lesson_not_actionable/)
})

test('Find material is an explicit idempotent abstention-capable research job only', () => {
  const route = api.slice(api.indexOf("app.post('/threads/:id/lessons/:lessonId/material-request'"), api.indexOf("app.patch('/threads/:id/projects/:projectId'"))
  assert.match(route, /materialRequestJobType/)
  assert.match(route, /idempotency-key/)
  assert.match(route, /idempotency_key=\?/)
  assert.match(route, /ON CONFLICT\(idempotency_key\) DO NOTHING/)
  assert.match(route, /status IN \('pending','running','retry'\)/)
  assert.match(route, /workflow_contract: 'compass-lesson-material\/v1'/)
  assert.match(route, /library_first:/)
  assert.match(route, /target_lesson_id: target\.lesson_id/)
  assert.match(route, /workflow_contract: 'compass-lesson-material\/v1', material_request_id: jobId/)
  assert.match(route, /canonical_owners/)
  assert.match(route, /branch_required: true/)
  assert.match(route, /allowed_outcomes: \['ready', 'abstained'\]/)
  assert.match(route, /attach_policy: 'explicit_user_action_only'/)
  assert.match(route, /queue_policy: 'never'/)
  assert.match(route, /start_policy: 'never'/)
  assert.match(route, /progression_policy: 'direct_lesson_completion_only'/)
  assert.match(route, /INSERT INTO agent_jobs/)
  assert.doesNotMatch(route, /INSERT INTO recommendations/)
  assert.doesNotMatch(route, /INSERT INTO thread_lesson_sources/)
  assert.doesNotMatch(route, /INSERT INTO recommendation_meta/)
  assert.doesNotMatch(route, /learning_sessions/)

  assert.match(compass, /authorizeLessonMaterialPick/)
  assert.match(compass, /job_type='compass_lesson_material' AND status='running'/)
  assert.match(compass, /!materialAuthorization\.reviewOnly && queuedCount >= QUEUE_CAP/)
  assert.match(compass, /workflowScope = materialAuthorization\.reviewOnly \? 'lesson_material' : 'general'/)
  assert.match(compass, /workflow_scope='lesson_material' AND workflow_request_id=\?/)
  assert.match(compass, /DB\.batch\(persistence\)/)
  assert.match(compass, /WHERE p\.workflow_scope='general' AND p\.status IN \('ready','started','abstained'\)/)
  assert.match(compass, /workflow_scope='general' AND status IN \('ready','abstained'\)/)
  assert.match(compass, /branch: \{ id: winner\.item\.branch_id, confidence: 'high'/)
  assert.match(compass, /candidate_branch_conflict/)
  assert.doesNotMatch(compass, /branch_id=COALESCE\(\?,branch_id\)/)
})

test('material request readback is scoped to the exact Thread and lesson and redacts errors', () => {
  const route = api.slice(api.indexOf("app.get('/threads/:id/lessons/:lessonId/material-request'"), api.indexOf("app.post('/threads/:id/lessons/:lessonId/material-request'"))
  assert.match(route, /json_extract\(payload_json,'\$\.thread_id'\)=\?/)
  assert.match(route, /json_extract\(payload_json,'\$\.lesson_id'\)=\?/)
  assert.match(api, /error: job\.error \? safeErrorMessage\(job\.error\) : null/)
})
