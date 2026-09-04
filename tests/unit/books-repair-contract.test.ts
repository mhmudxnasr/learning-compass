import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chapterMetadataFromArtifact } from '../../src/services/book-projection.ts'
import { readStudioCss } from './support/read-studio-css.ts'

const recommendations = readFileSync(new URL('../../src/api/recommendations.ts', import.meta.url), 'utf8')
const capture = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
const booksView = readFileSync(new URL('../../client/src/workspaces/library/BooksView.tsx', import.meta.url), 'utf8')
const bookModel = readFileSync(new URL('../../client/src/workspaces/library/bookModel.ts', import.meta.url), 'utf8')
const libraryViews = readFileSync(
  new URL('../../client/src/workspaces/library/LibraryViews.tsx', import.meta.url),
  'utf8',
)
const canonApi = readFileSync(new URL('../../src/api/canon.ts', import.meta.url), 'utf8')
const canonView = readFileSync(new URL('../../client/src/workspaces/learn/LearnCanonView.tsx', import.meta.url), 'utf8')
const studioCss = readStudioCss()
const primaryMigration = readFileSync(new URL('../../migrations/0052_pin_primary_book.sql', import.meta.url), 'utf8')

test('all book mutations share the canonical nullable-status non-deleted predicate', () => {
  assert.match(
    recommendations,
    /export const bookVisibilityPredicate = \(alias = 'r'\) =>\s*`\(\$\{alias\}\.status IS NULL OR \$\{alias\}\.status!='deleted'\) AND \$\{alias\}\.deleted_at IS NULL`/,
  )
  assert.equal(recommendations.split("bookVisibilityPredicate('r')").length - 1, 4)
  assert.match(
    recommendations,
    /JOIN tree_nodes n ON n\.id=m\.branch_id[\s\S]*lower\(COALESCE\(n\.status,''\)\)!='pruned'/,
  )
})

test('artifact chapter metadata accepts owned positive chapters and rejects synthetic or mismatched keys', () => {
  assert.deepEqual(
    chapterMetadataFromArtifact(
      { chapter_key: 'chapter-4', chapter_title: ' Four ', chapter_number: 4 },
      'chapter-4',
      9,
    ),
    { key: 'chapter-4', title: 'Four', position: 4 },
  )
  assert.deepEqual(chapterMetadataFromArtifact({ chapter_key: 'appendix', title: 'Appendix' }, 'appendix', 9), {
    key: 'appendix',
    title: 'Appendix',
    position: 9,
  })
  assert.equal(chapterMetadataFromArtifact({ chapter_key: 'book', chapter_number: 0 }, 'book', 1), null)
  assert.equal(chapterMetadataFromArtifact({ chapter_key: 'chapter-4', chapter_number: 4 }, 'other', 1), null)
})

test('primary book selection is explicit after one deterministic migration', () => {
  assert.match(booksView, /books\.find\(\(book: LibraryRecord\) => Boolean\(book\.is_primary\)\) \|\| null/)
  assert.doesNotMatch(recommendations, /fallbackPrimaryBookId/)
  assert.doesNotMatch(capture, /fallbackPrimary/)
  assert.match(primaryMigration, /ORDER BY r\.updated_at DESC, r\.created_at DESC, r\.id DESC/)
  assert.match(
    primaryMigration,
    /json_object\('book_primary', CASE WHEN recommendation_id = \(SELECT id FROM chosen\) THEN 1 ELSE 0 END\)/,
  )
})

test('pinning is atomic, leaves reading and Queue states intact, and clears tombstone pins', () => {
  assert.match(recommendations, /if \(body\.primary === true\) \{[\s\S]*await c\.env\.DB\.batch/)
  assert.match(
    recommendations,
    /WHERE recommendation_id IN \(SELECT id FROM recommendations WHERE content_type='book'\)/,
  )
  assert.match(recommendations, /source_metadata_json=json_patch[\s\S]*updated_at=datetime\('now'\)/)
  assert.match(recommendations, /queue_state: book\.learning_state \|\| 'captured'/)
})

test('Books read fan-out is concurrent without synthetic round balance work', () => {
  assert.match(
    recommendations,
    /const \[artifacts, jobs, canonMembershipRows, threadRows, chapterResult, hardcover\] = await Promise\.all/,
  )
  assert.match(recommendations, /loadHardcoverLibrary\(c\.env\.DB, Boolean\(c\.env\.HARDCOVER_API_TOKEN\)\)/)
  assert.match(recommendations, /hardcover,\s*\}\)/)
  assert.doesNotMatch(recommendations, /needsBalance \? buildLearningBalance/)
  assert.doesNotMatch(recommendations, /artifactsByBook\.set\([^\n]+\.\.\./)
  assert.doesNotMatch(recommendations, /chaptersByBook\.set\([^\n]+\.\.\./)
})

test('My Books composes the read-only Hardcover mirror without exposing internal mutations for mirror-only rows', () => {
  assert.match(booksView, /mergeBooksWithHardcover/)
  assert.match(bookModel, /hardcover_only: true/)
  assert.match(bookModel, /read_only: true/)
  assert.match(booksView, /Open Hardcover/)
  assert.match(booksView, /hardcoverOnly && hardcoverUrl/)
})

test('neutral dequeue is conditional and cannot rewrite exclusion truth', () => {
  assert.match(capture, /item\.status !== 'active'[\s\S]*\['queued', 'in_progress'\]/)
  assert.match(
    capture,
    /learning_state IN \('queued','in_progress'\)[\s\S]*r\.status='active'[\s\S]*r\.deleted_at IS NULL/,
  )
})

test('Books UI renders all Canon memberships and centralizes companion routes', () => {
  assert.match(booksView, /memberships\.map/)
  assert.doesNotMatch(booksView, /canon_memberships\) \? book\.canon_memberships\[0\]/)
  assert.match(booksView, /artifactLink\(chapter\.html\)/)
  assert.match(booksView, /artifactLink\(chapter\.pdf\)/)
  assert.match(booksView, /<ReadingFormatLinks\s+book=\{book\}\s+chapter=\{chapter\}\s*\/>/)
  assert.match(booksView, /branchInfo\.linkable/)
})

test('Books exposes and links every connected Learning Thread', () => {
  assert.match(recommendations, /threads: threadsByBook\.get\(String\(book\.id\)\) \|\| \[\]/)
  assert.match(recommendations, /FROM thread_sources ts JOIN learning_threads t ON t\.id=ts\.thread_id/)
  assert.match(booksView, /ThreadConnectionTags/)
  assert.match(booksView, /#\/learn\/thread\/\$\{encodeURIComponent\(String\(thread\.id\)\)\}/)
  assert.match(booksView, /<ThreadConnectionTags book=\{book\}/)
})

test('Books reports completed reading truthfully and keeps search controls semantic', () => {
  assert.match(booksView, /const readingComplete = Boolean/)
  assert.match(booksView, /Reading complete/)
  assert.match(booksView, /Reopen final chapter/)
  assert.match(booksView, /<div class="books-library-search-wrap">/)
  assert.doesNotMatch(booksView, /<label class="books-library-search-wrap">/)
})

test('My Books groups titles by branch before reading state', () => {
  assert.match(booksView, /books-library-branch-group/)
  assert.match(booksView, /BOOK_STATE_ORDER\.map/)
  assert.match(booksView, /Reading now/)
  assert.match(booksView, /Saved for later/)
  assert.match(booksView, /Filter My Books by branch/)
  assert.match(booksView, /Filter My Books by Canon field/)
})

test('Book notes stay collapsed and open in the canonical formatted reader', () => {
  assert.match(libraryViews, /<details class="book-dossier-notes">/)
  assert.match(libraryViews, /href=\{noteHref\(String\(note\.id\)\)\}/)
  assert.doesNotMatch(libraryViews, /book-dossier-notes[^\n]+note\.sections/)
})

test('Canon atlas previews bind titles to explicit semantic roles', () => {
  for (const role of ['foundation', 'representative', 'boundary']) {
    assert.match(canonApi, new RegExp(`e\\.role='${role}'[^\\n]+entry_${role}_title`))
  }
  assert.match(canonApi, /entry_roles:/)
  assert.match(canonView, /domain\.entry_roles\?\.\[role\] \|\| bookTitles\[index\]/)
})

test('Books semantic style aliases resolve under every theme', () => {
  assert.match(studioCss, /--studio-seam-strong:\s*color-mix/)
  assert.match(studioCss, /--studio-highlight:\s*var\(--studio-lichen\)/)
  assert.match(studioCss, /--control-radius:\s*var\(--studio-radius-control\)/)
  assert.match(studioCss, /--panel-radius:\s*var\(--studio-radius-panel\)/)
  assert.match(studioCss, /--font-body:\s*var\(--font-ui\)/)
})
