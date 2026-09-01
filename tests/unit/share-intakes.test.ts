import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  classifyShareIntake,
  consumeShareIntake,
  createShareIntake,
  extractSharedSourceUrl,
  loadPendingShareIntakes,
  resolveShareIntake,
  ShareIntakeError,
} from '../../src/services/share-intakes.ts'

class SqliteD1 {
  private readonly sqlite: DatabaseSync
  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite
  }
  prepare(sql: string) {
    const statement = {
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      first: async <T>() => (this.sqlite.prepare(sql).get(...(statement.args as any[])) as T) || null,
      all: async <T>() => ({ results: this.sqlite.prepare(sql).all(...(statement.args as any[])) as T[] }),
      run: async () => {
        const result = this.sqlite.prepare(sql).run(...(statement.args as any[]))
        return { meta: { changes: Number(result.changes) } }
      },
    }
    return statement
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT,dedup_key TEXT,status TEXT,deleted_at TEXT);
    CREATE TABLE recommendation_meta(recommendation_id TEXT PRIMARY KEY,branch_id TEXT,source_metadata_json TEXT);
    CREATE TABLE tree_nodes(id TEXT PRIMARY KEY,type TEXT,status TEXT,super_category TEXT);
    CREATE TABLE source_annotations(id TEXT PRIMARY KEY,recommendation_id TEXT,branch_id TEXT,selector_json TEXT,quote TEXT,status TEXT,created_at TEXT,selector_source_identities_json TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE source_url_replacements(recommendation_id TEXT,previous_url TEXT,source_url TEXT,previous_dedup_key TEXT,source_dedup_key TEXT);
  `)
  sqlite.exec(readFileSync(new URL('../../migrations/0072_share_intakes.sql', import.meta.url), 'utf8'))
  sqlite.exec(`
    INSERT INTO tree_nodes VALUES ('domain','category','active',NULL),('branch','branch','active','domain'),('pruned','branch','pruned','domain');
    INSERT INTO recommendations VALUES
      ('rec','https://example.com/source','arti_example_com_source','active',NULL),
      ('wrong','https://example.com/wrong','arti_example_com_wrong','active',NULL),
      ('unmapped','https://example.com/unmapped','arti_example_com_unmapped','active',NULL);
    INSERT INTO recommendation_meta VALUES
      ('rec','branch','{"raw_source":"https://example.com/source"}'),
      ('wrong','branch','{"raw_source":"https://example.com/wrong"}'),
      ('unmapped',NULL,'{"raw_source":"https://example.com/unmapped"}');
  `)
  return { sqlite, DB: new SqliteD1(sqlite) as unknown as D1Database }
}

test('a share is persisted before UI review and remains in the pending recovery ledger', async () => {
  const { sqlite, DB } = fixture()
  try {
    const intake = await createShareIntake(DB, {
      kind: 'capture',
      title: 'Source title',
      sourceUrl: 'https://example.com/source',
    })
    assert.equal(intake?.status, 'pending')
    assert.equal(intake?.source_url, 'https://example.com/source')
    assert.deepEqual(
      (await loadPendingShareIntakes(DB, 1)).map((row) => row.id),
      [intake?.id],
    )
  } finally {
    sqlite.close()
  }
})

test('share intake rejects an oversized exact passage instead of truncating it', async () => {
  const { sqlite, DB } = fixture()
  try {
    await assert.rejects(
      createShareIntake(DB, { kind: 'anchor', text: 'q'.repeat(10001), sourceUrl: 'https://example.com/source' }),
      (error: unknown) => error instanceof ShareIntakeError && error.code === 'share_text_too_large',
    )
    assert.equal((await loadPendingShareIntakes(DB)).length, 0)
  } finally {
    sqlite.close()
  }
})

test('text-only Android shares extract their canonical URL without turning surrounding prose into text capture identity', () => {
  assert.equal(
    extractSharedSourceUrl('Useful context\nhttps://example.com/article?ref=share\nRead this later.'),
    'https://example.com/article?ref=share',
  )
  assert.equal(extractSharedSourceUrl('See https://example.com/article.'), 'https://example.com/article')
  assert.equal(
    extractSharedSourceUrl('Read https://en.wikipedia.org/wiki/Function_(mathematics).'),
    'https://en.wikipedia.org/wiki/Function_(mathematics)',
  )
  assert.equal(extractSharedSourceUrl('Surprising source: https://example.com/really!'), 'https://example.com/really!')
  assert.equal(extractSharedSourceUrl('(https://example.com/wrapped)'), 'https://example.com/wrapped')
  assert.equal(extractSharedSourceUrl('A plain thought without a link.'), null)
  assert.equal(classifyShareIntake('A page description', 'https://example.com/article'), 'review')
  assert.equal(classifyShareIntake('An exact selected passage', 'https://example.com/article'), 'review')
  assert.equal(classifyShareIntake('https://example.com/article', 'https://example.com/article'), 'capture')
  assert.equal(classifyShareIntake('', 'https://example.com/article'), 'capture')
})

test('ordinary share consumption requires the matching branch-owned canonical source and is idempotent', async () => {
  const { sqlite, DB } = fixture()
  try {
    const intake = await createShareIntake(DB, { kind: 'capture', sourceUrl: 'https://example.com/source' })
    await assert.rejects(
      consumeShareIntake(DB, intake!.id, { recommendationId: 'wrong' }),
      (error: unknown) => error instanceof ShareIntakeError && error.code === 'share_capture_mismatch',
    )
    const consumed = await consumeShareIntake(DB, intake!.id, { recommendationId: 'rec' })
    assert.equal(consumed?.status, 'consumed')
    assert.equal(consumed?.recommendation_id, 'rec')
    assert.equal((await loadPendingShareIntakes(DB)).length, 0)
    assert.equal((await consumeShareIntake(DB, intake!.id, { recommendationId: 'rec' }))?.recommendation_id, 'rec')
  } finally {
    sqlite.close()
  }
})

test('ambiguous shares require one durable explicit intent and reject a stale conflicting choice', async () => {
  const { sqlite, DB } = fixture()
  try {
    const intake = await createShareIntake(DB, {
      kind: 'review',
      title: 'Shared page',
      text: 'A description or a selected passage?',
      sourceUrl: 'https://example.com/source',
    })
    assert.equal(intake?.kind, 'review')
    assert.equal(intake?.resolved_kind, null)
    assert.equal(intake?.effective_kind, null)
    await assert.rejects(
      consumeShareIntake(DB, intake!.id, { recommendationId: 'rec' }),
      (error: unknown) =>
        error instanceof ShareIntakeError && error.code === 'share_intake_intent_required' && error.status === 409,
    )

    const resolved = await resolveShareIntake(DB, intake!.id, 'capture')
    assert.equal(resolved?.resolved_kind, 'capture')
    assert.equal(resolved?.effective_kind, 'capture')
    assert.ok(resolved?.resolved_at)
    assert.equal((await resolveShareIntake(DB, intake!.id, 'capture'))?.resolved_kind, 'capture')
    await assert.rejects(
      resolveShareIntake(DB, intake!.id, 'anchor'),
      (error: unknown) =>
        error instanceof ShareIntakeError && error.code === 'share_intake_resolution_conflict' && error.status === 409,
    )
    assert.equal((await consumeShareIntake(DB, intake!.id, { recommendationId: 'rec' }))?.status, 'consumed')
  } finally {
    sqlite.close()
  }
})

test('anchor share recovery finds and consumes only its exact saved passage', async () => {
  const { sqlite, DB } = fixture()
  try {
    const intake = await createShareIntake(DB, {
      kind: 'anchor',
      title: 'Claim',
      text: 'Exact selected claim',
      sourceUrl: 'https://example.com/source#claim',
    })
    sqlite
      .prepare(
        `INSERT INTO source_annotations(id,recommendation_id,branch_id,selector_json,quote,status,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      )
      .run(
        'annotation',
        'rec',
        'branch',
        `{"url":"https://example.com/source#claim","share_intake_id":"${intake!.id}"}`,
        'Exact selected claim',
        'active',
      )
    assert.equal((await loadPendingShareIntakes(DB, 1))[0]?.recoverable_annotation_id, 'annotation')
    const consumed = await consumeShareIntake(DB, intake!.id, { annotationId: 'annotation' })
    assert.equal(consumed?.status, 'consumed')
    assert.equal(consumed?.annotation_id, 'annotation')
    assert.equal(consumed?.recommendation_id, 'rec')
  } finally {
    sqlite.close()
  }
})

test('resolved anchor recovery and consumption stay bound to the canonical active source branch', async () => {
  const { sqlite, DB } = fixture()
  try {
    const intake = await createShareIntake(DB, {
      kind: 'review',
      text: 'Exact quote',
      sourceUrl: 'https://example.com/source',
    })
    sqlite
      .prepare(
        `INSERT INTO source_annotations(id,recommendation_id,branch_id,selector_json,quote,status,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      )
      .run(
        'annotation',
        'rec',
        'pruned',
        `{"url":"https://example.com/source","share_intake_id":"${intake!.id}"}`,
        'Exact quote',
        'active',
      )
    assert.equal((await resolveShareIntake(DB, intake!.id, 'anchor'))?.effective_kind, 'anchor')
    await assert.rejects(
      consumeShareIntake(DB, intake!.id, { annotationId: 'annotation' }),
      (error: unknown) => error instanceof ShareIntakeError && error.code === 'share_anchor_mismatch',
    )
    sqlite.prepare(`UPDATE source_annotations SET branch_id='branch' WHERE id='annotation'`).run()
    assert.equal((await loadPendingShareIntakes(DB, 1))[0]?.recoverable_annotation_id, 'annotation')
    assert.equal((await consumeShareIntake(DB, intake!.id, { annotationId: 'annotation' }))?.recommendation_id, 'rec')
  } finally {
    sqlite.close()
  }
})

test('same quote and selector cannot attach a share to an unrelated canonical source', async () => {
  const { sqlite, DB } = fixture()
  try {
    const intake = await createShareIntake(DB, {
      kind: 'review',
      text: 'Same exact quote',
      sourceUrl: 'https://example.com/source?utm_source=android#claim',
    })
    sqlite
      .prepare(
        `INSERT INTO source_annotations(id,recommendation_id,branch_id,selector_json,quote,status,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      )
      .run(
        'wrong-source-annotation',
        'wrong',
        'branch',
        `{"url":"https://example.com/source?utm_source=android#claim","share_intake_id":"${intake!.id}"}`,
        'Same exact quote',
        'active',
      )
    await resolveShareIntake(DB, intake!.id, 'anchor')
    assert.equal((await loadPendingShareIntakes(DB, 1))[0]?.recoverable_annotation_id, null)
    await assert.rejects(
      consumeShareIntake(DB, intake!.id, { annotationId: 'wrong-source-annotation' }),
      (error: unknown) => error instanceof ShareIntakeError && error.code === 'share_anchor_mismatch',
    )
  } finally {
    sqlite.close()
  }
})

test('anchor recovery and consumption use normalized selector identity and verified replacement dedup lineage', async () => {
  const { sqlite, DB } = fixture()
  try {
    sqlite
      .prepare(`INSERT INTO source_url_replacements VALUES (?,?,?,?,?)`)
      .run(
        'rec',
        'https://example.com/old-source?utm_source=legacy',
        'https://example.com/source',
        'arti_example_com_old_source',
        'arti_example_com_source',
      )
    const intake = await createShareIntake(DB, {
      kind: 'review',
      text: 'Historical exact quote',
      sourceUrl: 'https://example.com/old-source?utm_source=android#shared',
    })
    assert.equal(intake?.source_identity_url, 'https://example.com/old-source')
    assert.equal(intake?.source_identity_key, 'arti_example_com_old_source')
    sqlite
      .prepare(
        `INSERT INTO source_annotations
      (id,recommendation_id,branch_id,selector_json,quote,status,created_at,selector_source_identities_json)
      VALUES (?,?,?,?,?,?,datetime('now'),?)`,
      )
      .run(
        'historical-anchor',
        'rec',
        'branch',
        `{"url":"https://example.com/old-source?utm_medium=browser#claim","share_intake_id":"${intake!.id}"}`,
        'Historical exact quote',
        'active',
        '["https://example.com/old-source"]',
      )
    await resolveShareIntake(DB, intake!.id, 'anchor')
    assert.equal((await loadPendingShareIntakes(DB, 1))[0]?.recoverable_annotation_id, 'historical-anchor')
    assert.equal(
      (await consumeShareIntake(DB, intake!.id, { annotationId: 'historical-anchor' }))?.recommendation_id,
      'rec',
    )
  } finally {
    sqlite.close()
  }
})

test('capture consumption accepts canonical replacement history but never a deleted source', async () => {
  const { sqlite, DB } = fixture()
  try {
    sqlite
      .prepare(`INSERT INTO source_url_replacements VALUES (?,?,?,?,?)`)
      .run(
        'rec',
        'https://example.com/old-source',
        'https://example.com/source',
        'arti_example_com_old_source',
        'arti_example_com_source',
      )
    const intake = await createShareIntake(DB, { kind: 'capture', sourceUrl: 'https://example.com/old-source' })
    assert.equal((await consumeShareIntake(DB, intake!.id, { recommendationId: 'rec' }))?.recommendation_id, 'rec')

    const deletedIntake = await createShareIntake(DB, { kind: 'capture', sourceUrl: 'https://example.com/source' })
    sqlite.prepare(`UPDATE recommendations SET deleted_at=datetime('now') WHERE id='rec'`).run()
    await assert.rejects(
      consumeShareIntake(DB, deletedIntake!.id, { recommendationId: 'rec' }),
      (error: unknown) => error instanceof ShareIntakeError && error.code === 'share_capture_mismatch',
    )
  } finally {
    sqlite.close()
  }
})

test('target validation is part of each guarded consumption update', () => {
  const service = readFileSync(new URL('../../src/services/share-intakes.ts', import.meta.url), 'utf8')
  const consume = service.slice(service.indexOf('export async function consumeShareIntake'))
  assert.match(consume, /UPDATE share_intakes[\s\S]*AND EXISTS \([\s\S]*FROM recommendations r/)
  assert.match(consume, /WITH valid_target AS \([\s\S]*a\.branch_id=m\.branch_id[\s\S]*UPDATE share_intakes/)
  assert.doesNotMatch(consume, /const (source|annotation) = await DB\.prepare/)
})

test('share target and clients exchange durable intake ids rather than redirect payloads', () => {
  const server = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../../client/src/app/App.tsx', import.meta.url), 'utf8')
  const review = readFileSync(new URL('../../client/src/app/ShareIntakeReviewDialog.tsx', import.meta.url), 'utf8')
  const capture = readFileSync(new URL('../../client/src/shell/CaptureDialog.tsx', import.meta.url), 'utf8')
  const learn = readFileSync(new URL('../../client/src/workspaces/LearnWorkspace.tsx', import.meta.url), 'utf8')
  const shareRoute = server.slice(
    server.indexOf("app.post('/api/share-target'"),
    server.indexOf('// YouTube metadata enrichment'),
  )
  const successfulRedirects = shareRoute.slice(0, shareRoute.indexOf('} catch (error)'))
  assert.match(shareRoute, /await createShareIntake/)
  assert.match(shareRoute, /extractSharedSourceUrl\(text\)/)
  assert.match(shareRoute, /classifyShareIntake\(text, sourceUrl\)/)
  assert.match(shareRoute, /share_intake: intake\.id/)
  assert.doesNotMatch(successfulRedirects, /anchor_quote: text|capture: candidate/)
  assert.match(app, /share-intakes\/pending\?limit=1/)
  assert.match(app, /action=review-share/)
  assert.match(review, /share-intakes\/\$\{encodeURIComponent\(intake\.id\)\}\/resolve/)
  assert.match(review, /Capture the whole source/)
  assert.match(review, /Save a selected passage/)
  assert.match(capture, /recommendation_id: result\.id/)
  assert.match(learn, /annotation_id: payload\.annotation\.id/)
})
