import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('migration 0067 replaces recursive FTS with a portable projection and repairs only dangling Thread lineage', () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`
      CREATE TABLE recommendations (
        id TEXT PRIMARY KEY, video_title TEXT, creator TEXT, why_this TEXT,
        user_review TEXT, deleted_at TEXT
      );
      CREATE TABLE tree_nodes (id TEXT PRIMARY KEY, label TEXT, meta_json TEXT);
      CREATE TABLE learning_units (id TEXT PRIMARY KEY, statement TEXT, user_synthesis TEXT);
      CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT);
      CREATE TABLE note_sections (id TEXT PRIMARY KEY, note_id TEXT, content TEXT);
      CREATE TABLE profile_assertions (assertion_key TEXT PRIMARY KEY, value_json TEXT, status TEXT);
      CREATE TABLE hermes_memory (id TEXT PRIMARY KEY, memory_key TEXT, value_json TEXT, status TEXT);
      CREATE TABLE source_annotations (
        id TEXT PRIMARY KEY, quote TEXT, context_before TEXT,
        context_after TEXT, language TEXT, status TEXT
      );
      CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE learning_threads (id TEXT PRIMARY KEY);
      CREATE TABLE learning_events (id TEXT PRIMARY KEY, thread_id TEXT);
      CREATE VIRTUAL TABLE search_idx USING fts5(
        source, ref_id, text, content='search_idx', content_rowid='rowid',
        tokenize='porter unicode61'
      );

      INSERT INTO recommendations VALUES ('rec-1','Systems handbook','Researcher','Feedback loops',NULL,NULL);
      INSERT INTO tree_nodes VALUES ('node-1','Systems Thinking','{}');
      INSERT INTO learning_units VALUES ('unit-1','A causal claim',NULL);
      INSERT INTO notes VALUES ('note-1','Field note');
      INSERT INTO note_sections VALUES ('section-1','note-1','Evidence body');
      INSERT INTO profile_assertions VALUES ('preference.systems','{"value":"systems"}','active');
      INSERT INTO hermes_memory VALUES ('memory-1','environment.system','{"value":"stable"}','approved');
      INSERT INTO source_annotations VALUES ('annotation-1','Exact quote','before','after','en','active');
      INSERT INTO learning_threads VALUES ('thread-live');
      INSERT INTO learning_events VALUES ('event-live','thread-live');
      INSERT INTO learning_events VALUES ('event-dangling','thread-missing');
      INSERT INTO learning_events VALUES ('event-unowned',NULL);
    `)

    sqlite.exec(readFileSync('migrations/0067_portable_search_and_lineage_repair.sql', 'utf8'))

    const schema = sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name='search_idx'").get() as { sql: string }
    assert.match(schema.sql, /^CREATE TABLE search_idx/)
    assert.doesNotMatch(schema.sql, /VIRTUAL|fts5/i)
    assert.equal(Number((sqlite.prepare('SELECT COUNT(*) count FROM search_idx').get() as { count: number }).count), 7)

    // A code rollback to the immediately previous Worker remains safe: its
    // maintenance path still issues this FTS-only command. Migration 0067
    // deliberately accepts and ignores it on the portable projection.
    sqlite.exec("INSERT INTO search_idx(search_idx) VALUES ('optimize')")
    assert.equal(Number((sqlite.prepare('SELECT COUNT(*) count FROM search_idx').get() as { count: number }).count), 7)

    assert.deepEqual(
      sqlite.prepare("SELECT source,ref_id FROM search_idx WHERE text LIKE ? ESCAPE '\\' ORDER BY source").all('%Systems%')
        .map((row: any) => ({ source: row.source, ref_id: row.ref_id })),
      [
        { source: 'assertion', ref_id: 'preference.systems' },
        { source: 'node', ref_id: 'node-1' },
        { source: 'rec', ref_id: 'rec-1' },
      ],
    )

    sqlite.exec("DELETE FROM search_idx WHERE source='rec'; INSERT OR REPLACE INTO search_idx(source,ref_id,text) VALUES ('rec','rec-1','Updated systems text');")
    assert.equal((sqlite.prepare("SELECT text FROM search_idx WHERE source='rec' AND ref_id='rec-1'").get() as { text: string }).text, 'Updated systems text')

    assert.equal((sqlite.prepare("SELECT thread_id FROM learning_events WHERE id='event-live'").get() as { thread_id: string }).thread_id, 'thread-live')
    assert.equal((sqlite.prepare("SELECT thread_id FROM learning_events WHERE id='event-dangling'").get() as { thread_id: null }).thread_id, null)
    assert.equal((sqlite.prepare("SELECT thread_id FROM learning_events WHERE id='event-unowned'").get() as { thread_id: null }).thread_id, null)
  } finally {
    sqlite.close()
  }
})

test('broad search uses a length-capped escaped substring projection and maintenance has no FTS command', () => {
  const search = readFileSync('src/api/search.ts', 'utf8')
  const maintenance = readFileSync('src/services/maintenance.ts', 'utf8')
  assert.match(search, /q\.length > 200/)
  assert.match(search, /text LIKE \? ESCAPE/)
  assert.doesNotMatch(search, /search_idx MATCH/)
  assert.match(maintenance, /portable_substring_projection/)
  assert.doesNotMatch(maintenance, /search_idx\(search_idx\)|optimize/)
})
