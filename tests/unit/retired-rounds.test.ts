import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('synthetic knowledge rounds have no active derivation service or balance field', () => {
  assert.equal(existsSync(new URL('../../src/services/branch-rounds.ts', import.meta.url)), false)
  const balance = source('../../src/services/learning-balance.ts')
  assert.doesNotMatch(balance, /roundFor|round_label|\n\s*round\s*:/)
})

test('knowledge read models no longer select or publish synthetic rounds', () => {
  for (const path of [
    '../../src/api/canon.ts',
    '../../src/api/dashboard.ts',
    '../../src/api/learning-core.ts',
    '../../src/api/product.ts',
    '../../src/api/intelligence.ts',
  ]) {
    assert.doesNotMatch(source(path), /round_label|branch_round|rec_round|\br\.round\b/, path)
  }

  const feedback = source('../../src/services/feedback-context.ts')
  assert.doesNotMatch(feedback, /COALESCE\(n\.round_label,r\.round\)|\n\s*round\s*:/)

  const sync = source('../../src/api/sync.ts')
  assert.doesNotMatch(sync, /n\.round_label|status, round_label/)
  assert.match(sync, /round: _legacyRound/)
  assert.match(sync, /round_label: _legacyRoundLabel/)

  const capture = source('../../src/api/capture.ts')
  assert.equal((capture.match(/\.map\(withoutLegacyRound\)/g) || []).length, 3)
  assert.match(capture, /round: _legacyRound, round_label: _legacyRoundLabel, \.\.\.exposure/)
  assert.match(source('../../src/api/taste.ts'), /round: _legacyRound, round_label: _legacyRoundLabel, \.\.\.source/)
  assert.doesNotMatch(source('../../src/api/agent.ts'), /status, round, and linked activity/)
})

test('Library, Learn, Map, and Settings do not render synthetic rounds', () => {
  for (const path of [
    '../../client/src/workspaces/LibraryWorkspace.tsx',
    '../../client/src/workspaces/library/BooksView.tsx',
    '../../client/src/workspaces/library/LibraryViews.tsx',
    '../../client/src/features/branches/BranchDeckPage.tsx',
    '../../client/src/workspaces/learn/types.ts',
    '../../client/src/workspaces/learn/LearnCanonView.tsx',
  ]) {
    assert.doesNotMatch(
      source(path),
      /branch_round|round_label|branch\.round|item\.round|Branch round|Current round/,
      path,
    )
  }
  assert.doesNotMatch(source('../../client/src/workspaces/SettingsWorkspace.tsx'), />R[123]</)
})
