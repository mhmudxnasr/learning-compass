import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const visibilityPredicate = "COALESCE(json_extract(metadata_json,'$.publication_state'),'ready')!='staged'"

test('every exposed artifact projection and broad search excludes staged rows', () => {
  const recommendations = readFileSync(new URL('../../src/api/recommendations.ts', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../../src/api/dashboard.ts', import.meta.url), 'utf8')
  const search = readFileSync(new URL('../../src/api/search.ts', import.meta.url), 'utf8')
  const agent = readFileSync(new URL('../../src/api/agent.ts', import.meta.url), 'utf8')

  assert.equal(recommendations.split(visibilityPredicate).length - 1, 2)
  assert.equal(dashboard.split(visibilityPredicate).length - 1, 2)
  assert.equal(search.split(visibilityPredicate).length - 1, 2)
  assert.equal(agent.split(visibilityPredicate).length - 1, 1)
  assert.equal(search.split(`WHERE ${visibilityPredicate} AND (filename LIKE ? OR metadata_json LIKE ?)`).length - 1, 2)
})

test('the visibility boundary preserves legacy and historical rows while hiding only staged publication', () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec('CREATE TABLE artifacts (id TEXT PRIMARY KEY, metadata_json TEXT)')
    const insert = sqlite.prepare('INSERT INTO artifacts (id,metadata_json) VALUES (?,?)')
    insert.run('legacy', '{}')
    insert.run('ready', '{"publication_state":"ready"}')
    insert.run('superseded', '{"publication_state":"superseded"}')
    insert.run('staged', '{"publication_state":"staged"}')

    const visible = sqlite
      .prepare(`SELECT id FROM artifacts WHERE ${visibilityPredicate} ORDER BY id`)
      .all()
      .map((row: any) => row.id)
    assert.deepEqual(visible, ['legacy', 'ready', 'superseded'])
  } finally {
    sqlite.close()
  }
})
