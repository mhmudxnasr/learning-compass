import assert from 'node:assert/strict'
import test from 'node:test'
import { withRecallBranches } from '../../src/services/recall-branches.ts'

test('Recall presents canonical branch names while preserving legacy values for edits', async () => {
  const branches = [
    { id: 'pil', label: 'Practical Islamic Learning', status: 'active' },
    { id: 'taz', label: 'Self-purification', status: 'active' },
    { id: 'dup-a', label: 'Ambiguous', status: 'active' },
    { id: 'dup-b', label: 'Ambiguous', status: 'pruned' },
  ]
  let queries = 0
  const DB = {
    prepare: () => ({
      all: async () => {
        queries++
        return { results: branches }
      },
    }),
  } as unknown as D1Database
  const cards = [
    { id: 'by-id', branch: 'pil' },
    { id: 'by-label', branch: 'Self-purification' },
    { id: 'ambiguous', branch: 'Ambiguous' },
    { id: 'missing', branch: 'no-such-branch' },
    { id: 'empty', branch: null },
  ]
  const result = await withRecallBranches(DB, cards)
  assert.deepEqual(
    result.map((card) => card.branch_context?.id ?? null),
    ['pil', 'taz', null, null, null],
  )
  assert.deepEqual(
    result.map(({ branch }) => branch),
    cards.map(({ branch }) => branch),
  )
  assert.equal(result[0].branch_context?.label, 'Practical Islamic Learning')
  assert.equal(queries, 1, 'Identity lookup must be batched')
  assert.equal('branch_context' in cards[0], false, 'Projection must not mutate canonical records')
  assert.deepEqual(await withRecallBranches(DB, []), [])
  assert.equal(queries, 1)
})
