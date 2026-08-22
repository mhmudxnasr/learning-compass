import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chapterMetadataFromArtifact } from '../../src/services/book-projection.ts'

const recommendations = readFileSync(new URL('../../src/api/recommendations.ts', import.meta.url), 'utf8')
const capture = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
const booksView = readFileSync(new URL('../../client/src/workspaces/library/BooksView.tsx', import.meta.url), 'utf8')

test('all book mutations share the canonical nullable-status non-deleted predicate', () => {
  assert.match(recommendations, /export const bookVisibilityPredicate = \(alias = 'r'\) => `\(\$\{alias\}\.status IS NULL OR \$\{alias\}\.status!='deleted'\) AND \$\{alias\}\.deleted_at IS NULL`/)
  assert.equal(recommendations.split("bookVisibilityPredicate('r')").length - 1, 4)
  assert.match(recommendations, /JOIN tree_nodes n ON n\.id=m\.branch_id[\s\S]*lower\(COALESCE\(n\.status,''\)\)!='pruned'/)
})

test('artifact chapter metadata accepts owned positive chapters and rejects synthetic or mismatched keys', () => {
  assert.deepEqual(chapterMetadataFromArtifact({ chapter_key: 'chapter-4', chapter_title: ' Four ', chapter_number: 4 }, 'chapter-4', 9), { key: 'chapter-4', title: 'Four', position: 4 })
  assert.deepEqual(chapterMetadataFromArtifact({ chapter_key: 'appendix', title: 'Appendix' }, 'appendix', 9), { key: 'appendix', title: 'Appendix', position: 9 })
  assert.equal(chapterMetadataFromArtifact({ chapter_key: 'book', chapter_number: 0 }, 'book', 1), null)
  assert.equal(chapterMetadataFromArtifact({ chapter_key: 'chapter-4', chapter_number: 4 }, 'other', 1), null)
})

test('Books read fan-out is concurrent and balance work is conditional', () => {
  assert.match(recommendations, /const \[artifacts, jobs, canonMembershipRows, chapterResult, balance\] = await Promise\.all/)
  assert.match(recommendations, /needsBalance \? buildLearningBalance/)
  assert.doesNotMatch(recommendations, /artifactsByBook\.set\([^\n]+\.\.\./)
  assert.doesNotMatch(recommendations, /chaptersByBook\.set\([^\n]+\.\.\./)
})

test('neutral dequeue is conditional and cannot rewrite exclusion truth', () => {
  assert.match(capture, /item\.status !== 'active'[\s\S]*\['queued', 'in_progress'\]/)
  assert.match(capture, /learning_state IN \('queued','in_progress'\)[\s\S]*r\.status='active'[\s\S]*r\.deleted_at IS NULL/)
})

test('Books UI renders all Canon memberships and centralizes companion routes', () => {
  assert.match(booksView, /memberships\.map/)
  assert.doesNotMatch(booksView, /canon_memberships\) \? book\.canon_memberships\[0\]/)
  assert.match(booksView, /href=\{artifactLink\(htmlArtifact\)\}/)
  assert.match(booksView, /href=\{artifactLink\(pdfArtifact\)\}/)
  assert.match(booksView, /branchInfo\.linkable/)
})
