import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { loadSourceAnnotationEvidence, SourceAnnotationEvidenceError } from '../../src/services/source-annotation-evidence.ts'

class SqliteD1 {
  private readonly sqlite: DatabaseSync
  constructor(sqlite: DatabaseSync) { this.sqlite = sqlite }
  prepare(sql: string) {
    const statement = {
      args: [] as unknown[],
      bind: (...args: unknown[]) => { statement.args = args; return statement },
      first: async () => this.sqlite.prepare(sql).get(...statement.args as any[]) || null,
    }
    return statement
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT,deleted_at TEXT);
    CREATE TABLE recommendation_meta(recommendation_id TEXT PRIMARY KEY,branch_id TEXT);
    CREATE TABLE tree_nodes(id TEXT PRIMARY KEY,type TEXT,status TEXT,super_category TEXT);
    CREATE TABLE source_annotations(id TEXT PRIMARY KEY,recommendation_id TEXT,artifact_id TEXT,thread_id TEXT,branch_id TEXT,locator_type TEXT,selector_json TEXT,quote TEXT,context_before TEXT,context_after TEXT,language TEXT,source_checksum TEXT,status TEXT);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY,metadata_json TEXT);
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY,superseded_at TEXT);
    CREATE TABLE thread_sources(thread_id TEXT,recommendation_id TEXT,status TEXT);
    CREATE TABLE learning_path_stages(id TEXT PRIMARY KEY,thread_id TEXT);
    CREATE TABLE learning_path_sources(stage_id TEXT,recommendation_id TEXT);
    CREATE TABLE thread_lessons(id TEXT PRIMARY KEY,thread_id TEXT);
    CREATE TABLE thread_lesson_sources(lesson_id TEXT,recommendation_id TEXT);
    INSERT INTO tree_nodes VALUES ('domain','category','active',NULL),('branch','branch','active','domain'),('other','branch','active','domain');
    INSERT INTO recommendations VALUES ('rec','https://example.com/source',NULL);
    INSERT INTO recommendation_meta VALUES ('rec','branch');
    INSERT INTO learning_threads VALUES ('thread',NULL),('other-thread',NULL);
    INSERT INTO thread_sources VALUES ('thread','rec','active');
    INSERT INTO artifacts VALUES ('artifact','{"recommendation_id":"rec"}');
    INSERT INTO source_annotations VALUES ('anchor','rec','artifact','thread','branch','web','{"url":"https://example.com/source#claim","locator":"#claim"}','Canonical quote','Before','After','en','checksum-1','active');
  `)
  return { sqlite, DB: new SqliteD1(sqlite) as unknown as D1Database }
}

test('authoritative annotation evidence binds current source, branch, Thread, artifact, locator, quote, and checksum', async () => {
  const { sqlite, DB } = fixture()
  try {
    const evidence = await loadSourceAnnotationEvidence(DB, 'anchor', { recommendationId: 'rec', branchId: 'branch', threadId: 'thread' })
    assert.deepEqual({
      recommendation_id: evidence.recommendation_id,
      branch_id: evidence.branch_id,
      thread_id: evidence.thread_id,
      artifact_id: evidence.artifact_id,
      locator: evidence.locator,
      quote: evidence.quote,
      source_checksum: evidence.source_checksum,
      anchor_type: evidence.anchor_type,
    }, {
      recommendation_id: 'rec', branch_id: 'branch', thread_id: 'thread', artifact_id: 'artifact', locator: '#claim',
      quote: 'Canonical quote', source_checksum: 'checksum-1', anchor_type: 'url_fragment',
    })
  } finally { sqlite.close() }
})

test('annotation derivation rejects stale ownership and unrelated Thread attachment', async () => {
  const { sqlite, DB } = fixture()
  try {
    await assert.rejects(
      loadSourceAnnotationEvidence(DB, 'anchor', { recommendationId: 'rec', threadId: 'other-thread' }),
      (error: unknown) => error instanceof SourceAnnotationEvidenceError && error.code === 'annotation_scope_conflict',
    )
    sqlite.prepare("UPDATE recommendation_meta SET branch_id='other' WHERE recommendation_id='rec'").run()
    await assert.rejects(
      loadSourceAnnotationEvidence(DB, 'anchor', { recommendationId: 'rec' }),
      (error: unknown) => error instanceof SourceAnnotationEvidenceError && error.code === 'annotation_branch_stale',
    )
  } finally { sqlite.close() }
})
