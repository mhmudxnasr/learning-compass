import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const migration = readFileSync(
  new URL('../../migrations/0068_lite_visual_corpus_activation.sql', import.meta.url),
  'utf8',
)
const scopeLineageMigration = readFileSync(
  new URL('../../migrations/0074_lite_visual_corpus_scope_lineage.sql', import.meta.url),
  'utf8',
)
const hash = (character: string) => character.repeat(64)

test('scope-lineage trigger guards use the remote D1-compatible CASE form', () => {
  assert.match(scopeLineageMigration, /SELECT \(CASE WHEN/)
  assert.doesNotMatch(scopeLineageMigration, /SELECT CASE WHEN/)
})

function database() {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY);
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT,video_title TEXT,status TEXT,deleted_at TEXT);
    CREATE TABLE agent_jobs(
      id TEXT PRIMARY KEY,job_type TEXT,status TEXT,recommendation_id TEXT,workflow_run_id TEXT,workflow_step TEXT,
      lease_owner TEXT,lease_expires_at TEXT,payload_json TEXT,result_json TEXT
    );
    CREATE TABLE artifacts(id TEXT PRIMARY KEY,r2_key TEXT,size_bytes INTEGER,metadata_json TEXT,created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE thread_sources(thread_id TEXT,recommendation_id TEXT,status TEXT,PRIMARY KEY(thread_id,recommendation_id));
    CREATE TABLE learning_path_stages(id TEXT PRIMARY KEY,thread_id TEXT);
    CREATE TABLE learning_path_sources(stage_id TEXT,recommendation_id TEXT,PRIMARY KEY(stage_id,recommendation_id));
    CREATE TABLE thread_lessons(id TEXT PRIMARY KEY,thread_id TEXT,stage_id TEXT);
    CREATE TABLE thread_lesson_sources(lesson_id TEXT,recommendation_id TEXT,PRIMARY KEY(lesson_id,recommendation_id));
  `)
  db.exec(migration)
  db.exec(scopeLineageMigration)
  db.prepare('INSERT INTO learning_threads(id) VALUES (?)').run('thread-1')
  db.prepare(
    "INSERT INTO recommendations(id,video_url,video_title,status) VALUES (?,'https://source.test/1','Source','active')",
  ).run('rec-1')
  db.prepare(
    "INSERT INTO thread_sources(thread_id,recommendation_id,status) VALUES ('thread-1','rec-1','active')",
  ).run()
  return db
}

function addCorpus(
  db: DatabaseSync,
  corpusId: string,
  pairId: string,
  jobId: string,
  runId: string,
  supersedes: string | null,
  offset: number,
) {
  const values = {
    target: hash(String((offset + 1) % 10)),
    receipt: hash(String((offset + 2) % 10)),
    work: hash(String((offset + 3) % 10)),
    extraction: hash(String((offset + 4) % 10)),
    source: hash(String((offset + 5) % 10)),
    scope: hash(String((offset + 6) % 10)),
    ledger: hash(String((offset + 7) % 10)),
    html: hash(String((offset + 8) % 10)),
    pdf: hash(String((offset + 9) % 10)),
  }
  db.prepare(
    `INSERT INTO lite_visual_corpora(id,thread_id,manifest_sha256,target_set_sha256,audit_corpus_sha256,expected_pairs) VALUES (?,?,?,?,?,1)`,
  ).run(corpusId, 'thread-1', hash('a'), hash('b'), hash(String(offset % 10)))
  db.prepare(
    `INSERT INTO agent_jobs(id,job_type,status,recommendation_id,workflow_run_id,workflow_step,lease_owner,lease_expires_at,payload_json,result_json)
    VALUES (?,'visualise_source','running','rec-1',?,'publish_pair','worker-1',datetime('now','+5 minutes'),?, '{}')`,
  ).run(
    jobId,
    runId,
    JSON.stringify({
      recommendation_id: 'rec-1',
      workflow_contract: 'lite-visual-linear/v4',
      revision_of_pair_id: supersedes,
    }),
  )
  db.prepare(
    `INSERT INTO lite_visual_corpus_targets(corpus_id,position,recording_number,recommendation_id,source_url,source_title,workdir,pair_id,job_id,workflow_run_id,supersedes_pair_id,target_sha256,receipt_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256)
    VALUES (?,0,1,'rec-1','https://source.test/1','Source','/work',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    corpusId,
    pairId,
    jobId,
    runId,
    supersedes,
    values.target,
    values.receipt,
    values.work,
    values.extraction,
    values.source,
    values.scope,
    values.ledger,
    values.html,
    values.pdf,
  )
  for (const role of ['html', 'pdf']) {
    const artifactId = `${pairId}-${role}`
    const roleHash = role === 'html' ? values.html : values.pdf
    db.prepare('INSERT INTO artifacts(id,r2_key,size_bytes,metadata_json) VALUES (?,?,100,?)').run(
      artifactId,
      `${pairId}/${role}`,
      JSON.stringify({
        pair_id: pairId,
        recommendation_id: 'rec-1',
        role,
        publication_state: 'staged',
        validation_status: 'passed',
        validation_receipt_sha256: values.receipt,
        html_sha256: values.html,
        pdf_sha256: values.pdf,
      }),
    )
    assert.equal(roleHash.length, 64)
  }
  db.prepare(
    `INSERT INTO lite_visual_pairs(pair_id,corpus_id,recommendation_id,job_id,workflow_run_id,worker_identity,supersedes_pair_id,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key,html_size_bytes,pdf_size_bytes,r2_verified,state)
    VALUES (?,?,?,?,?,'worker-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,100,100,1,'staged')`,
  ).run(
    pairId,
    corpusId,
    'rec-1',
    jobId,
    runId,
    supersedes,
    values.target,
    values.work,
    values.extraction,
    values.source,
    values.scope,
    values.ledger,
    values.html,
    values.pdf,
    values.receipt,
    `${pairId}-html`,
    `${pairId}-pdf`,
    `${pairId}/html`,
    `${pairId}/pdf`,
  )
  db.prepare(
    `UPDATE agent_jobs SET status='awaiting_activation',lease_owner=NULL,lease_expires_at=NULL,result_json=? WHERE id=?`,
  ).run(JSON.stringify({ pair_id: pairId, receipt_sha256: values.receipt }), jobId)
  return values
}

test('corpus trigger accepts exact immutable runs and supports a later revision with a new job', () => {
  const db = database()
  addCorpus(db, 'corpus-1', 'pair-1', 'job-1', 'run-1', null, 1)
  db.prepare("UPDATE lite_visual_corpora SET state='active' WHERE id='corpus-1'").run()
  db.prepare(
    "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready') WHERE json_extract(metadata_json,'$.pair_id')='pair-1'",
  ).run()
  db.prepare("UPDATE lite_visual_pairs SET state='active' WHERE pair_id='pair-1'").run()
  db.prepare("UPDATE agent_jobs SET status='completed' WHERE id='job-1'").run()

  addCorpus(db, 'corpus-2', 'pair-2', 'job-2', 'run-2', 'pair-1', 2)
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(DISTINCT json_extract(metadata_json,'$.role')) count FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id')='rec-1' AND json_extract(metadata_json,'$.pair_id')='pair-1' AND json_extract(metadata_json,'$.publication_state')='ready' AND json_extract(metadata_json,'$.validation_status')='passed'",
      )
      .get().count,
    2,
  )
  assert.doesNotThrow(() => db.prepare("UPDATE lite_visual_corpora SET state='active' WHERE id='corpus-2'").run())
  assert.equal(db.prepare('SELECT COUNT(*) count FROM lite_visual_pairs').get().count, 2)
  db.close()
})

test('corpus activation accepts a source placed only on a lesson in the same Thread', () => {
  const db = database()
  db.prepare("DELETE FROM thread_sources WHERE thread_id='thread-1' AND recommendation_id='rec-1'").run()
  db.prepare("INSERT INTO learning_path_stages(id,thread_id) VALUES ('stage-1','thread-1')").run()
  db.prepare("INSERT INTO thread_lessons(id,thread_id,stage_id) VALUES ('lesson-1','thread-1','stage-1')").run()
  db.prepare("INSERT INTO thread_lesson_sources(lesson_id,recommendation_id) VALUES ('lesson-1','rec-1')").run()
  addCorpus(db, 'lesson-corpus', 'lesson-pair', 'lesson-job', 'lesson-run', null, 1)

  assert.doesNotThrow(() => db.prepare("UPDATE lite_visual_corpora SET state='active' WHERE id='lesson-corpus'").run())
  db.close()
})

test('corpus activation rejects a source placed on a lesson in another Thread', () => {
  const db = database()
  db.prepare("DELETE FROM thread_sources WHERE thread_id='thread-1' AND recommendation_id='rec-1'").run()
  db.prepare("INSERT INTO learning_threads(id) VALUES ('thread-2')").run()
  db.prepare("INSERT INTO learning_path_stages(id,thread_id) VALUES ('stage-2','thread-2')").run()
  db.prepare("INSERT INTO thread_lessons(id,thread_id,stage_id) VALUES ('lesson-2','thread-2','stage-2')").run()
  db.prepare("INSERT INTO thread_lesson_sources(lesson_id,recommendation_id) VALUES ('lesson-2','rec-1')").run()
  addCorpus(db, 'other-thread-corpus', 'other-thread-pair', 'other-thread-job', 'other-thread-run', null, 1)

  assert.throws(
    () => db.prepare("UPDATE lite_visual_corpora SET state='active' WHERE id='other-thread-corpus'").run(),
    /lite_visual_corpus_lineage_mismatch/,
  )
  db.close()
})

test('pair history prevents artifact deletion before database state can be orphaned', () => {
  const db = database()
  addCorpus(db, 'corpus-1', 'pair-1', 'job-1', 'run-1', null, 3)
  assert.throws(() => db.prepare("DELETE FROM artifacts WHERE id='pair-1-html'").run(), /FOREIGN KEY/)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM artifacts WHERE id='pair-1-html'").get().count, 1)
  db.close()
})

test('NULL job lineage cannot satisfy the staged-pair trigger', () => {
  const db = database()
  db.prepare(
    `INSERT INTO lite_visual_corpora(id,thread_id,manifest_sha256,target_set_sha256,audit_corpus_sha256,expected_pairs) VALUES ('corpus-null','thread-1',?,?,?,1)`,
  ).run(hash('a'), hash('b'), hash('c'))
  db.prepare(
    `INSERT INTO agent_jobs(id,job_type,status,recommendation_id,workflow_run_id,workflow_step,lease_owner,lease_expires_at,payload_json,result_json) VALUES ('job-null','visualise_source','running',NULL,'run-null','publish_pair','worker-1',datetime('now','+5 minutes'),?, '{}')`,
  ).run(JSON.stringify({ recommendation_id: 'rec-1', workflow_contract: 'lite-visual-linear/v4' }))
  const fields = [hash('1'), hash('2'), hash('3'), hash('4'), hash('5'), hash('6'), hash('7'), hash('8'), hash('9')]
  db.prepare(
    `INSERT INTO lite_visual_corpus_targets(corpus_id,position,recording_number,recommendation_id,source_url,source_title,workdir,pair_id,job_id,workflow_run_id,supersedes_pair_id,target_sha256,receipt_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256) VALUES ('corpus-null',0,1,'rec-1','u','t','w','pair-null','job-null','run-null',NULL,?,?,?,?,?,?,?,?,?)`,
  ).run(...fields)
  for (const role of ['html', 'pdf'])
    db.prepare('INSERT INTO artifacts(id,r2_key,size_bytes,metadata_json) VALUES (?,?,1,?)').run(
      `pair-null-${role}`,
      `pair-null/${role}`,
      JSON.stringify({
        pair_id: 'pair-null',
        recommendation_id: 'rec-1',
        role,
        publication_state: 'staged',
        validation_receipt_sha256: fields[1],
        html_sha256: fields[7],
        pdf_sha256: fields[8],
      }),
    )
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO lite_visual_pairs(pair_id,corpus_id,recommendation_id,job_id,workflow_run_id,worker_identity,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key,html_size_bytes,pdf_size_bytes,r2_verified,state) VALUES ('pair-null','corpus-null','rec-1','job-null','run-null','worker-1',?,?,?,?,?,?,?,?,?,'pair-null-html','pair-null-pdf','pair-null/html','pair-null/pdf',1,1,1,'staged')`,
        )
        .run(fields[0], fields[2], fields[3], fields[4], fields[5], fields[6], fields[7], fields[8], fields[1]),
    /lite_visual_pair_job_lineage_mismatch/,
  )
  db.close()
})

test('activation rejects every stale canonical source identity mutation', () => {
  const mutations = [
    "UPDATE recommendations SET video_url='https://source.test/changed' WHERE id='rec-1'",
    "UPDATE recommendations SET video_title='Changed' WHERE id='rec-1'",
    "UPDATE recommendations SET status='deleted' WHERE id='rec-1'",
    "UPDATE recommendations SET deleted_at=datetime('now') WHERE id='rec-1'",
    "UPDATE thread_sources SET status='removed' WHERE thread_id='thread-1' AND recommendation_id='rec-1'",
  ]
  for (const [index, mutation] of mutations.entries()) {
    const db = database()
    addCorpus(db, `corpus-${index}`, `pair-${index}`, `job-${index}`, `run-${index}`, null, index + 1)
    db.exec(mutation)
    assert.throws(
      () => db.prepare("UPDATE lite_visual_corpora SET state='active' WHERE id=?").run(`corpus-${index}`),
      /lite_visual_corpus_lineage_mismatch/,
    )
    assert.equal(db.prepare('SELECT state FROM lite_visual_corpora WHERE id=?').get(`corpus-${index}`).state, 'staging')
    db.close()
  }
})

test('one corpus supports multiple chapter identities for the same book', () => {
  const db = database()
  db.prepare(
    "UPDATE recommendations SET video_url='https://source.test/book',video_title='Book' WHERE id='rec-1'",
  ).run()
  db.prepare(
    `INSERT INTO lite_visual_corpora(id,thread_id,manifest_sha256,target_set_sha256,audit_corpus_sha256,expected_pairs) VALUES ('book-corpus','thread-1',?,?,?,2)`,
  ).run(hash('a'), hash('b'), hash('c'))
  for (const [position, chapter] of ['chapter-1', 'chapter-2'].entries()) {
    const job = `book-job-${position}`
    db.prepare(
      `INSERT INTO agent_jobs(id,job_type,status,recommendation_id,workflow_run_id,workflow_step,payload_json,result_json) VALUES (?,'visualise_source','pending','rec-1',?,'resolve_source',?,'{}')`,
    ).run(
      job,
      `book-run-${position}`,
      JSON.stringify({ recommendation_id: 'rec-1', chapter_key: chapter, workflow_contract: 'lite-visual-linear/v4' }),
    )
    db.prepare(
      `INSERT INTO lite_visual_corpus_targets(corpus_id,position,recording_number,recommendation_id,chapter_key,source_url,source_title,workdir,pair_id,job_id,workflow_run_id,target_sha256,receipt_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256)
      VALUES ('book-corpus',?,?,?,?, 'https://source.test/book','Book',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      position,
      position + 1,
      'rec-1',
      chapter,
      `/work/${chapter}`,
      `pair-${chapter}`,
      job,
      `book-run-${position}`,
      hash('1'),
      hash('2'),
      hash('3'),
      hash('4'),
      hash('5'),
      hash('6'),
      hash('7'),
      hash('8'),
      hash('9'),
    )
  }
  assert.equal(
    db.prepare("SELECT COUNT(*) count FROM lite_visual_corpus_targets WHERE corpus_id='book-corpus'").get().count,
    2,
  )
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO lite_visual_corpus_targets(corpus_id,position,recording_number,recommendation_id,chapter_key,source_url,source_title,workdir,pair_id,job_id,workflow_run_id,target_sha256,receipt_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256)
    SELECT corpus_id,2,3,recommendation_id,chapter_key,source_url,source_title,'/duplicate','pair-duplicate','book-job-1','book-run-1',target_sha256,receipt_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256 FROM lite_visual_corpus_targets WHERE corpus_id='book-corpus' AND position=0`,
        )
        .run(),
    /UNIQUE constraint failed/,
  )
  db.close()
})

test('an aborted corpus cannot accept a late staged pair', () => {
  const db = database()
  const values = addCorpus(db, 'corpus-abort', 'pair-abort', 'job-abort', 'run-abort', null, 4)
  db.prepare("DELETE FROM lite_visual_pairs WHERE pair_id='pair-abort'").run()
  db.prepare("UPDATE lite_visual_corpora SET state='aborted',aborted_at=datetime('now') WHERE id='corpus-abort'").run()
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO lite_visual_pairs(pair_id,corpus_id,recommendation_id,job_id,workflow_run_id,worker_identity,target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key,html_size_bytes,pdf_size_bytes,r2_verified,state)
    VALUES ('pair-abort','corpus-abort','rec-1','job-abort','run-abort','worker-1',?,?,?,?,?,?,?,?,?,'pair-abort-html','pair-abort-pdf','pair-abort/html','pair-abort/pdf',100,100,1,'staged')`,
        )
        .run(
          values.target,
          values.work,
          values.extraction,
          values.source,
          values.scope,
          values.ledger,
          values.html,
          values.pdf,
          values.receipt,
        ),
    /lite_visual_corpus_not_staging/,
  )
  db.close()
})

test('migration backfills strict v6 pair history that already exists in production', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY);
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT,video_title TEXT,status TEXT,deleted_at TEXT);
    CREATE TABLE agent_jobs(id TEXT PRIMARY KEY,job_type TEXT,status TEXT,recommendation_id TEXT,workflow_run_id TEXT,workflow_step TEXT,lease_owner TEXT,lease_expires_at TEXT,payload_json TEXT,result_json TEXT);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY,r2_key TEXT,size_bytes INTEGER,metadata_json TEXT,created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE thread_sources(thread_id TEXT,recommendation_id TEXT,status TEXT,PRIMARY KEY(thread_id,recommendation_id));
    INSERT INTO learning_threads(id) VALUES ('thread-1');
    INSERT INTO recommendations(id,video_url,video_title,status) VALUES ('rec-1','https://source.test/1','Source','active');
  `)
  const receipt = {
    target_sha256: hash('1'),
    work_item_sha256: hash('2'),
    source_extraction_sha256: hash('3'),
    source_sha256: hash('4'),
    source_scope_sha256: hash('5'),
    coverage_ledger_sha256: hash('6'),
  }
  for (const role of ['html', 'pdf'])
    db.prepare('INSERT INTO artifacts(id,r2_key,size_bytes,metadata_json) VALUES (?,?,100,?)').run(
      `legacy-${role}`,
      `legacy/${role}`,
      JSON.stringify({
        generator: 'lite-visual',
        pair_id: 'legacy-pair',
        recommendation_id: 'rec-1',
        role,
        publication_state: 'ready',
        validation_status: 'passed',
        validation_receipt_sha256: hash('7'),
        validation_receipt: receipt,
        html_sha256: hash('8'),
        pdf_sha256: hash('9'),
      }),
    )
  db.exec(migration)
  const pair = db
    .prepare("SELECT pair_id,state,html_artifact_id,pdf_artifact_id FROM lite_visual_pairs WHERE pair_id='legacy-pair'")
    .get() as any
  assert.equal(pair.pair_id, 'legacy-pair')
  assert.equal(pair.state, 'active')
  assert.equal(pair.html_artifact_id, 'legacy-html')
  assert.equal(pair.pdf_artifact_id, 'legacy-pdf')
  assert.throws(() => db.prepare("DELETE FROM artifacts WHERE id='legacy-html'").run(), /FOREIGN KEY/)
  db.close()
})

test('migration fails closed instead of silently omitting conflicting strict v6 history', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY);
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT,video_title TEXT,status TEXT,deleted_at TEXT);
    CREATE TABLE agent_jobs(id TEXT PRIMARY KEY,job_type TEXT,status TEXT,recommendation_id TEXT,workflow_run_id TEXT,workflow_step TEXT,lease_owner TEXT,lease_expires_at TEXT,payload_json TEXT,result_json TEXT);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY,r2_key TEXT,size_bytes INTEGER,metadata_json TEXT,created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE thread_sources(thread_id TEXT,recommendation_id TEXT,status TEXT,PRIMARY KEY(thread_id,recommendation_id));
    INSERT INTO recommendations(id,video_url,video_title,status) VALUES ('rec-1','https://source.test/1','Source','active');
  `)
  const receipt = {
    target_sha256: hash('1'),
    work_item_sha256: hash('2'),
    source_extraction_sha256: hash('3'),
    source_sha256: hash('4'),
    source_scope_sha256: hash('5'),
    coverage_ledger_sha256: hash('6'),
  }
  const metadata = (role: string) =>
    JSON.stringify({
      generator: 'lite-visual',
      pair_id: 'duplicate-pair',
      recommendation_id: 'rec-1',
      role,
      publication_state: 'ready',
      validation_status: 'passed',
      validation_receipt_sha256: hash('7'),
      validation_receipt: receipt,
      html_sha256: hash('8'),
      pdf_sha256: hash('9'),
    })
  db.prepare('INSERT INTO artifacts(id,r2_key,size_bytes,metadata_json) VALUES (?,?,100,?)').run(
    'duplicate-html-a',
    'duplicate/html-a',
    metadata('html'),
  )
  db.prepare('INSERT INTO artifacts(id,r2_key,size_bytes,metadata_json) VALUES (?,?,100,?)').run(
    'duplicate-html-b',
    'duplicate/html-b',
    metadata('html'),
  )
  db.prepare('INSERT INTO artifacts(id,r2_key,size_bytes,metadata_json) VALUES (?,?,100,?)').run(
    'duplicate-pdf',
    'duplicate/pdf',
    metadata('pdf'),
  )
  assert.throws(() => db.exec(migration), /UNIQUE constraint failed: lite_visual_pairs\./)
  db.close()
})

test('local corpus lifecycle keeps staged pairs hidden and supports guarded activation and rollback', () => {
  const db = database()
  addCorpus(db, 'corpus-1', 'pair-1', 'job-1', 'run-1', null, 1)
  db.prepare("UPDATE lite_visual_corpora SET state='active',activated_at=datetime('now') WHERE id='corpus-1'").run()
  db.prepare("UPDATE lite_visual_pairs SET state='active',activated_at=datetime('now') WHERE pair_id='pair-1'").run()
  db.prepare(
    "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready') WHERE json_extract(metadata_json,'$.pair_id')='pair-1'",
  ).run()
  db.prepare("UPDATE agent_jobs SET status='completed' WHERE id='job-1'").run()
  db.prepare("INSERT INTO lite_visual_active_corpora(thread_id,corpus_id) VALUES ('thread-1','corpus-1')").run()

  addCorpus(db, 'corpus-2', 'pair-2', 'job-2', 'run-2', 'pair-1', 2)
  db.prepare("UPDATE lite_visual_corpora SET previous_corpus_id='corpus-1' WHERE id='corpus-2'").run()
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) count FROM artifacts WHERE json_extract(metadata_json,'$.pair_id')='pair-2' AND json_extract(metadata_json,'$.publication_state')='ready'",
      )
      .get().count,
    0,
  )
  db.prepare("UPDATE lite_visual_corpora SET state='active',activated_at=datetime('now') WHERE id='corpus-2'").run()

  db.prepare("UPDATE lite_visual_corpora SET state='superseded' WHERE id='corpus-1'").run()
  db.prepare("UPDATE lite_visual_pairs SET state='superseded' WHERE pair_id='pair-1'").run()
  db.prepare(
    "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','superseded') WHERE json_extract(metadata_json,'$.pair_id')='pair-1'",
  ).run()
  db.prepare("UPDATE lite_visual_pairs SET state='active',activated_at=datetime('now') WHERE pair_id='pair-2'").run()
  db.prepare(
    "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready') WHERE json_extract(metadata_json,'$.pair_id')='pair-2'",
  ).run()
  db.prepare("UPDATE agent_jobs SET status='completed' WHERE id='job-2'").run()
  db.prepare(
    "UPDATE lite_visual_active_corpora SET corpus_id='corpus-2',activated_at=datetime('now') WHERE thread_id='thread-1'",
  ).run()

  assert.doesNotThrow(() =>
    db
      .prepare("UPDATE lite_visual_corpora SET state='superseded',rolled_back_at=datetime('now') WHERE id='corpus-2'")
      .run(),
  )
  db.prepare("UPDATE lite_visual_pairs SET state='superseded' WHERE pair_id='pair-2'").run()
  db.prepare(
    "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','superseded') WHERE json_extract(metadata_json,'$.pair_id')='pair-2'",
  ).run()
  db.prepare("UPDATE lite_visual_corpora SET state='active' WHERE id='corpus-1'").run()
  db.prepare("UPDATE lite_visual_pairs SET state='active' WHERE pair_id='pair-1'").run()
  db.prepare(
    "UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.publication_state','ready') WHERE json_extract(metadata_json,'$.pair_id')='pair-1'",
  ).run()
  db.prepare(
    "UPDATE lite_visual_active_corpora SET corpus_id='corpus-1',activated_at=datetime('now') WHERE thread_id='thread-1'",
  ).run()

  assert.equal(
    db.prepare("SELECT corpus_id FROM lite_visual_active_corpora WHERE thread_id='thread-1'").get().corpus_id,
    'corpus-1',
  )
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) count FROM artifacts WHERE json_extract(metadata_json,'$.publication_state')='ready' AND json_extract(metadata_json,'$.pair_id')='pair-1'",
      )
      .get().count,
    2,
  )
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) count FROM artifacts WHERE json_extract(metadata_json,'$.publication_state')='ready' AND json_extract(metadata_json,'$.pair_id')='pair-2'",
      )
      .get().count,
    0,
  )
  db.close()
})
