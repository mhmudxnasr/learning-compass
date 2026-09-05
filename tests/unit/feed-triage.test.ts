import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { dismissFeedEntry } from '../../src/services/feed-triage.ts'

test('feed dismissal is idempotent, feed-scoped, and preserves the source and import identity', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE feed_sources(id TEXT PRIMARY KEY);
      CREATE TABLE recommendations(id TEXT PRIMARY KEY,status TEXT,deleted_at TEXT);
      CREATE TABLE feed_entries(feed_id TEXT,guid TEXT,recommendation_id TEXT,PRIMARY KEY(feed_id,guid));
      INSERT INTO feed_sources VALUES ('a'),('b');
      INSERT INTO recommendations VALUES ('one','active',NULL),('two','consumed',NULL);
      INSERT INTO feed_entries VALUES ('a','guid-one','one'),('b','guid-one','one'),('a','guid-two','two');`)
    const migration = readFileSync(new URL('../../migrations/0077_feed_entry_dismissals.sql', import.meta.url), 'utf8')
    sqlite.exec(migration)
    sqlite.exec(migration)
    const DB = {
      prepare(sql: string) {
        return {
          bind(...values: string[]) {
            return {
              run: async () => sqlite.prepare(sql).run(...values),
              first: async () => sqlite.prepare(sql).get(...values) || null,
            }
          },
        }
      },
    } as unknown as D1Database
    const first = await dismissFeedEntry(DB, 'a', 'one')
    assert.equal(first?.recommendation_id, 'one')
    assert.deepEqual(await dismissFeedEntry(DB, 'a', 'one'), first)
    assert.equal(await dismissFeedEntry(DB, 'missing', 'one'), null)
    assert.equal(await dismissFeedEntry(DB, 'b', 'two'), null)
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM feed_entries').get()?.n, 3)
    assert.equal(sqlite.prepare('SELECT status FROM recommendations WHERE id=?').get('one')?.status, 'active')
    assert.equal(sqlite.prepare('SELECT deleted_at FROM recommendations WHERE id=?').get('one')?.deleted_at, null)
    const remaining = sqlite
      .prepare(
        `SELECT fe.feed_id,fe.recommendation_id FROM feed_entries fe
      WHERE NOT EXISTS (SELECT 1 FROM feed_entry_dismissals fd WHERE fd.feed_id=fe.feed_id AND fd.recommendation_id=fe.recommendation_id)
      ORDER BY fe.feed_id,fe.recommendation_id`,
      )
      .all()
    assert.deepEqual(
      remaining.map((row) => [row.feed_id, row.recommendation_id]),
      [
        ['a', 'two'],
        ['b', 'one'],
      ],
    )
    sqlite.exec("DELETE FROM feed_sources WHERE id='a'")
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM feed_entry_dismissals').get()?.n, 0)
  } finally {
    sqlite.close()
  }
})
