import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const vite = await createServer({ root: fileURLToPath(new URL('../..', import.meta.url)), configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
const { default: searchApp } = await vite.ssrLoadModule('/src/api/search.ts')
test.after(async () => { await vite.close() })

class SearchSqliteD1 {
  private readonly sqlite: DatabaseSync

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite
  }

  prepare(sql: string) {
    const statement = {
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      all: async () => ({ results: this.sqlite.prepare(sql).all(...statement.args as any[]) }),
      first: async () => this.sqlite.prepare(sql).get(...statement.args as any[]) || null,
    }
    return statement
  }
}

function searchFixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE recommendations (
      id TEXT PRIMARY KEY, video_title TEXT, video_url TEXT, creator TEXT,
      content_type TEXT, status TEXT, deleted_at TEXT, user_rating INTEGER,
      why_this TEXT, created_at TEXT
    );
    CREATE TABLE recommendation_meta (recommendation_id TEXT PRIMARY KEY, branch_id TEXT);
    CREATE TABLE tree_nodes (
      id TEXT PRIMARY KEY, label TEXT, type TEXT, status TEXT,
      super_category TEXT, meta_json TEXT
    );
    CREATE TABLE source_annotations (
      id TEXT PRIMARY KEY, recommendation_id TEXT, artifact_id TEXT, thread_id TEXT,
      branch_id TEXT, locator_type TEXT, selector_json TEXT, quote TEXT,
      context_before TEXT, context_after TEXT, language TEXT, source_checksum TEXT,
      status TEXT, created_at TEXT
    );
    CREATE TABLE unit_anchors (annotation_id TEXT, unit_id TEXT);
    CREATE TABLE learning_units (
      id TEXT PRIMARY KEY, unit_type TEXT, statement TEXT, user_synthesis TEXT,
      status TEXT, recommendation_id TEXT, updated_at TEXT
    );
    CREATE TABLE search_idx (source TEXT, ref_id TEXT, text TEXT, updated_at TEXT, PRIMARY KEY(source,ref_id));
    CREATE TABLE html_files (id TEXT PRIMARY KEY, filename TEXT, created_at TEXT);
    CREATE TABLE patterns (id TEXT PRIMARY KEY, description TEXT, strength TEXT);
    CREATE TABLE learning_threads (
      id TEXT PRIMARY KEY, title TEXT, thread_type TEXT, status TEXT,
      guiding_question TEXT, final_synthesis TEXT, updated_at TEXT, superseded_at TEXT
    );
    CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, kind TEXT, recommendation_id TEXT, updated_at TEXT);
    CREATE TABLE note_sections (id TEXT PRIMARY KEY, note_id TEXT, content TEXT);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, filename TEXT, media_type TEXT, created_at TEXT, metadata_json TEXT);
    CREATE TABLE profile_assertions (assertion_key TEXT PRIMARY KEY, category TEXT, value_json TEXT, confidence REAL);
    CREATE TABLE hermes_memory (
      id TEXT PRIMARY KEY, memory_key TEXT, memory_kind TEXT, value_json TEXT,
      confidence REAL, status TEXT, updated_at TEXT
    );

    INSERT INTO tree_nodes VALUES ('domain','Domain','category','active',NULL,'{}');
    INSERT INTO tree_nodes VALUES ('domain-pruned','Pruned domain','category','pruned',NULL,'{}');
    INSERT INTO tree_nodes VALUES ('branch','Branch','branch','active','domain','{}');
    INSERT INTO tree_nodes VALUES ('branch-other','Other branch','branch','active','domain','{}');
    INSERT INTO tree_nodes VALUES ('branch-pruned','Pruned branch','branch','pruned','domain','{}');
    INSERT INTO tree_nodes VALUES ('branch-domain-pruned','Orphan branch','branch','active','domain-pruned','{}');

    INSERT INTO recommendations VALUES ('rec-valid','Valid source','https://example.com/valid',NULL,'article','active',NULL,NULL,NULL,'2026-08-31');
    INSERT INTO recommendations VALUES ('rec-archived','Archived anchor source','https://example.com/archived',NULL,'article','active',NULL,NULL,NULL,'2026-08-31');
    INSERT INTO recommendations VALUES ('rec-deleted','Deleted source','https://example.com/deleted',NULL,'article','active','2026-08-31',NULL,NULL,'2026-08-31');
    INSERT INTO recommendations VALUES ('rec-remapped','Remapped source','https://example.com/remapped',NULL,'article','active',NULL,NULL,NULL,'2026-08-31');
    INSERT INTO recommendations VALUES ('rec-pruned','Pruned branch source','https://example.com/pruned',NULL,'article','active',NULL,NULL,NULL,'2026-08-31');
    INSERT INTO recommendations VALUES ('rec-domain-pruned','Pruned domain source','https://example.com/domain-pruned',NULL,'article','active',NULL,NULL,NULL,'2026-08-31');

    INSERT INTO recommendation_meta VALUES ('rec-valid','branch');
    INSERT INTO recommendation_meta VALUES ('rec-archived','branch');
    INSERT INTO recommendation_meta VALUES ('rec-deleted','branch');
    INSERT INTO recommendation_meta VALUES ('rec-remapped','branch-other');
    INSERT INTO recommendation_meta VALUES ('rec-pruned','branch-pruned');
    INSERT INTO recommendation_meta VALUES ('rec-domain-pruned','branch-domain-pruned');

    INSERT INTO source_annotations VALUES ('valid','rec-valid',NULL,NULL,'branch','web','{"url":"https://example.com/valid#claim"}','Needle valid',NULL,NULL,'en','valid-sum','active','2026-08-31T06:00:00Z');
    INSERT INTO source_annotations VALUES ('archived','rec-archived',NULL,NULL,'branch','web','{}','Needle archived',NULL,NULL,'en','archived-sum','archived','2026-08-31T05:00:00Z');
    INSERT INTO source_annotations VALUES ('deleted','rec-deleted',NULL,NULL,'branch','web','{}','Needle deleted',NULL,NULL,'en','deleted-sum','active','2026-08-31T04:00:00Z');
    INSERT INTO source_annotations VALUES ('remapped','rec-remapped',NULL,NULL,'branch','web','{}','Needle remapped',NULL,NULL,'en','remapped-sum','active','2026-08-31T03:00:00Z');
    INSERT INTO source_annotations VALUES ('pruned','rec-pruned',NULL,NULL,'branch-pruned','web','{}','Needle pruned',NULL,NULL,'en','pruned-sum','active','2026-08-31T02:00:00Z');
    INSERT INTO source_annotations VALUES ('domain-pruned','rec-domain-pruned',NULL,NULL,'branch-domain-pruned','web','{}','Needle domain pruned',NULL,NULL,'en','domain-sum','active','2026-08-31T01:00:00Z');

    INSERT INTO search_idx SELECT 'annotation',id,quote,created_at FROM source_annotations;
  `)
  return { sqlite, DB: new SearchSqliteD1(sqlite) }
}

test('evidence retrieval hides archived annotations and active anchors with stale canonical ownership', async () => {
  const { sqlite, DB } = searchFixture()
  try {
    const response = await searchApp.request('/evidence?q=Needle', {}, { DB } as any)
    const body = await response.json() as any
    assert.equal(response.status, 200)
    assert.equal(body.total, 1)
    assert.deepEqual(body.results.map((row: any) => row.id), ['valid'])
    assert.equal(body.results[0].source_url, 'https://example.com/valid')
  } finally {
    sqlite.close()
  }
})

test('broad Search revalidates both direct and indexed annotations before returning them', async () => {
  const { sqlite, DB } = searchFixture()
  try {
    const response = await searchApp.request('/?q=Needle', {}, { DB } as any)
    const body = await response.json() as any
    assert.equal(response.status, 200)
    assert.deepEqual(body.groups.annotations.map((row: any) => row.id), ['valid'])
    assert.deepEqual(body.groups.annotations[0].selector, { url: 'https://example.com/valid#claim' })
  } finally {
    sqlite.close()
  }
})

test('maintenance rebuild indexes only active annotations with current canonical branch and domain ownership', () => {
  const maintenance = readFileSync(new URL('../../src/services/maintenance.ts', import.meta.url), 'utf8')
  const annotationProjection = maintenance.slice(maintenance.indexOf("SELECT 'annotation'"), maintenance.indexOf("WHERE a.status='active'") + 24)
  assert.match(annotationProjection, /r\.deleted_at IS NULL/)
  assert.match(annotationProjection, /m\.branch_id=a\.branch_id/)
  assert.match(annotationProjection, /lower\(COALESCE\(b\.status,''\)\)!='pruned'/)
  assert.match(annotationProjection, /d\.type='category'/)
  assert.match(annotationProjection, /lower\(COALESCE\(d\.status,''\)\)!='pruned'/)
})
