import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const migration = readFileSync(
  new URL('../../migrations/0076_retire_unrebuilt_riyadh_companions.sql', import.meta.url),
  'utf8',
)

test('explicit Riyadh retirement preserves corpus-owned pairs and unrelated artifacts', () => {
  for (const corpus of [null, 'protected-corpus']) {
    const db = new DatabaseSync(':memory:')
    db.exec(
      'CREATE TABLE artifacts(id TEXT PRIMARY KEY,metadata_json TEXT); CREATE TABLE lite_visual_pairs(pair_id TEXT,corpus_id TEXT,state TEXT,html_artifact_id TEXT,pdf_artifact_id TEXT);',
    )
    const pair = 'lv-cap_1787440668996_31934a-35a902eb-97542730'
    const html = 'artifact_1787565808158_4b39f3'
    const pdf = 'artifact_1787565808159_cf9ff7'
    const metadata = { recommendation_id: 'cap_1787440668996_31934a', pair_id: pair, publication_state: 'ready' }
    for (const id of [html, pdf, 'unrelated'])
      db.prepare('INSERT INTO artifacts VALUES (?,?)').run(id, JSON.stringify(metadata))
    db.prepare('INSERT INTO lite_visual_pairs VALUES (?,?,?,?,?)').run(pair, corpus, 'active', html, pdf)
    db.exec(migration)
    const once = db.prepare('SELECT * FROM artifacts ORDER BY id').all()
    db.exec(migration)
    assert.deepEqual(db.prepare('SELECT * FROM artifacts ORDER BY id').all(), once)
    const state = db.prepare(
      "SELECT json_extract(metadata_json,'$.publication_state') AS state FROM artifacts WHERE id=?",
    )
    assert.equal(state.get(html)?.state, corpus ? 'ready' : 'superseded')
    assert.equal(state.get(pdf)?.state, corpus ? 'ready' : 'superseded')
    assert.equal(state.get('unrelated')?.state, 'ready')
    assert.equal(db.prepare('SELECT state FROM lite_visual_pairs').get()?.state, corpus ? 'active' : 'superseded')
    assert.equal(once.length, 3)
    db.close()
  }
})
