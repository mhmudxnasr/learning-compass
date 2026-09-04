import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const migration = readFileSync(
  new URL('../../migrations/0075_riyadh_legacy_pair_visibility.sql', import.meta.url),
  'utf8',
)

test('legacy visibility repair requires a complete successor and preserves every file', () => {
  for (const scenario of ['complete', 'incomplete', 'protected', 'other-owner']) {
    const db = new DatabaseSync(':memory:')
    db.exec(
      'CREATE TABLE artifacts(id TEXT PRIMARY KEY,metadata_json TEXT); CREATE TABLE lite_visual_pairs(pair_id TEXT);',
    )
    const owner = 'cap_1787259547262_650107'
    const old = 'lv-cap_1787259547262_650107-2fea6f94-1d846918'
    const current = 'lv-cap_1787259547262_650107-8220d4a2-63c2cfff'
    for (const [id, pair, role] of [
      ['old-html', old, 'html'],
      ['old-pdf', old, 'pdf'],
      ['new-html', current, 'html'],
      ['new-pdf', current, 'pdf'],
    ]) {
      db.prepare('INSERT INTO artifacts VALUES (?,?)').run(
        id,
        JSON.stringify({
          recommendation_id: scenario === 'other-owner' ? 'unrelated' : owner,
          pair_id: pair,
          role,
          publication_state: scenario === 'incomplete' && id === 'new-pdf' ? 'staged' : 'ready',
          validation_status: 'passed',
        }),
      )
    }
    if (scenario === 'protected') db.prepare('INSERT INTO lite_visual_pairs VALUES (?)').run(old)
    db.exec(migration)
    db.exec(migration)
    const rows = db.prepare('SELECT id,metadata_json FROM artifacts ORDER BY id').all() as {
      id: string
      metadata_json: string
    }[]
    assert.equal(rows.length, 4)
    for (const row of rows) {
      const expected =
        scenario === 'complete' && row.id.startsWith('old')
          ? 'superseded'
          : scenario === 'incomplete' && row.id === 'new-pdf'
            ? 'staged'
            : 'ready'
      assert.equal(JSON.parse(row.metadata_json).publication_state, expected, `${scenario}: ${row.id}`)
    }
    db.close()
  }
})
