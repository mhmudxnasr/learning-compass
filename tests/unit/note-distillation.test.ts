import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createClaimHighlight, distillationChecksum, promoteHighlightToUnit, splitDistillationBlocks } from '../../src/services/note-distillation.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('distillation migration is additive and reuses Unit note ownership and anchors', () => {
  const migration = read('../../migrations/0060_note_distillation.sql')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS note_claim_highlights/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS note_synthesis_revisions/)
  assert.doesNotMatch(migration, /ALTER TABLE learning_units|ALTER TABLE unit_anchors/)
})

test('block checksums are deterministic and preserve exact source block text', async () => {
  const blocks = splitDistillationBlocks('First line\r\ncontinues.\r\n\r\n> Original quote')
  assert.deepEqual(blocks, ['First line\r\ncontinues.', '> Original quote'])
  assert.equal(await distillationChecksum(blocks[0]), await distillationChecksum('First line\ncontinues.'))
  assert.notEqual(await distillationChecksum(blocks[0]), await distillationChecksum(`${blocks[0]} changed`))
})

test('highlight creation rejects stale checksums instead of relocating the source', async () => {
  const inserted: unknown[][] = []
  const DB = {
    prepare(sql: string) {
      const statement: any = { bind: (...args: unknown[]) => { statement.args = args; return statement } }
      statement.all = async () => sql.includes('FROM note_sections') ? { results: [{ section_key: 'body', label: 'Body', content: 'Exact original text' }] } : { results: [] }
      statement.run = async () => { inserted.push(statement.args); return { meta: { changes: 1 } } }
      return statement
    },
  } as unknown as D1Database
  const checksum = await distillationChecksum('Exact original text')
  const stale = await createClaimHighlight(DB, 'note-1', { section_key: 'body', block_index: 0, block_checksum: 'old', claim_text: 'My claim' })
  assert.deepEqual(stale, { error: 'source block changed; reload before highlighting', status: 409 })
  const created = await createClaimHighlight(DB, 'note-1', { section_key: 'body', block_index: 0, block_checksum: checksum, claim_text: 'My claim' })
  assert.equal('error' in created, false)
  assert.equal(inserted[0][5], 'Exact original text')
})

test('promotion retains note_id and an exact checksum anchor', async () => {
  const batched: Array<{ sql: string; args: unknown[] }> = []
  const DB = {
    prepare(sql: string) {
      const statement: any = { sql, bind: (...args: unknown[]) => { statement.args = args; return statement } }
      statement.first = async () => ({ id: 'highlight-1', note_id: 'note-1', recommendation_id: 'rec-1', section_key: 'body', block_index: 2, block_checksum: 'abc123', source_text: 'Exact original', claim_text: 'User claim', promoted_unit_id: null })
      return statement
    },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) { batched.push(...statements); return [] },
  } as unknown as D1Database
  const result = await promoteHighlightToUnit(DB, 'note-1', 'highlight-1')
  assert.equal('error' in result, false)
  assert.match(batched[0].sql, /note_id/)
  assert.match(batched[0].sql, /INSERT OR IGNORE/)
  assert.match(String(result.id), /unit_highlight-1/)
  assert.equal(batched[0].args.at(-1), 'note-1')
  assert.deepEqual(batched[1].args.slice(2), ['rec-1', 'note:note-1/section:body/block:2', 'Exact original', 'abc123'])
})

test('note API exposes only explicit distillation mutations', () => {
  const product = read('../../src/api/product.ts')
  assert.match(product, /\/distillation\/highlights'/)
  assert.match(product, /\/distillation\/syntheses'/)
  assert.match(product, /\/promote'/)
  assert.doesNotMatch(product, /generateDistillation|autoDistill|agent_jobs.*distill/)
})
