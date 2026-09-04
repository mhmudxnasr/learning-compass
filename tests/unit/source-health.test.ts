import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { recordSourceHealthCheck, refreshScopedSourceHealth, sourceHealthMatchesCurrentUrl, verifyPublicSourceUrl } from '../../src/services/source-health.ts'

test('source verifier accepts a directly reachable public source', async () => {
  const calls: Array<{ url: string; method: string }> = []
  const result = await verifyPublicSourceUrl('https://example.com/lesson#section', {
    fetcher: async (input, init) => {
      calls.push({ url: String(input), method: String(init?.method) })
      return new Response(null, { status: 200 })
    },
  })

  assert.equal(result.status, 'verified')
  assert.equal(result.http_status, 200)
  assert.equal(result.checked_url, 'https://example.com/lesson')
  assert.deepEqual(calls, [{ url: 'https://example.com/lesson', method: 'HEAD' }])
})

test('current health identity compares normalized canonical URLs', async () => {
  const result = await verifyPublicSourceUrl('https://example.com/?utm_source=share#section', {
    fetcher: async () => new Response(null, { status: 200 }),
  })
  assert.equal(result.checked_url, 'https://example.com')
  assert.equal(sourceHealthMatchesCurrentUrl(result.checked_url, 'https://example.com/?utm_source=other'), true)
  assert.equal(sourceHealthMatchesCurrentUrl(result.checked_url, 'https://example.com/other'), false)
})

test('source verifier treats authentication, throttling, and bot challenges as restricted', async () => {
  for (const response of [
    new Response(null, { status: 401 }),
    new Response(null, { status: 403 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 200, headers: { 'cf-mitigated': 'challenge' } }),
    new Response(null, { status: 503, headers: { 'cf-mitigated': 'challenge' } }),
  ]) {
    const result = await verifyPublicSourceUrl('https://example.com/protected', { fetcher: async () => response })
    assert.equal(result.status, 'restricted')
    assert.equal(result.error_code, 'access_restricted')
  }
})

test('source verifier requires a GET confirmation before marking a source unavailable', async () => {
  const methods: string[] = []
  const result = await verifyPublicSourceUrl('https://example.com/missing', {
    fetcher: async (_input, init) => {
      methods.push(String(init?.method))
      return new Response(null, { status: 404 })
    },
  })

  assert.equal(result.status, 'unavailable')
  assert.deepEqual(methods, ['HEAD', 'GET'])
})

test('source verifier does not call a throttled GET result unavailable', async () => {
  let calls = 0
  const result = await verifyPublicSourceUrl('https://example.com/maybe', {
    fetcher: async () => new Response(null, { status: ++calls === 1 ? 404 : 429 }),
  })

  assert.equal(result.status, 'restricted')
  assert.equal(result.http_status, 429)
})

test('source verifier rejects a redirect to a private target', async () => {
  let calls = 0
  const result = await verifyPublicSourceUrl('https://example.com/redirect', {
    fetcher: async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
    },
  })

  assert.equal(result.status, 'invalid')
  assert.equal(result.error_code, 'private_or_local_url')
  assert.equal(calls, 1)
})

test('source verifier leaves network failures unknown', async () => {
  const result = await verifyPublicSourceUrl('https://example.com/timeout', {
    fetcher: async () => { throw new Error('network detail that must not be persisted') },
  })

  assert.equal(result.status, 'unknown')
  assert.equal(result.error_code, 'request_failed')
  assert.doesNotMatch(JSON.stringify(result), /network detail/)
})

class RecordingDatabase {
  batches: Array<Array<{ sql: string; args: unknown[] }>> = []

  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
    }
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.batches.push(statements)
    return []
  }
}

class SourceHealthSqliteD1 {
  private readonly sqlite: DatabaseSync

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite
  }

  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      all: async () => ({ results: this.sqlite.prepare(sql).all(...statement.args as any[]) }),
      first: async () => this.sqlite.prepare(sql).get(...statement.args as any[]) || null,
    }
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.sqlite.exec('BEGIN')
    try {
      const results = statements.map((statement) => {
        const result = this.sqlite.prepare(statement.sql).run(...statement.args as any[])
        return { meta: { changes: Number(result.changes || 0) } }
      })
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}

test('current checks persist both the bounded attempt and latest projection', async () => {
  const DB = new RecordingDatabase()
  const recorded = await recordSourceHealthCheck(DB as any, 'rec-1', 'current', {
    status: 'verified',
    checked_url: 'https://example.com/lesson',
    http_status: 200,
    final_url: 'https://example.com/lesson',
  })

  assert.match(recorded.attempt_id, /^source_check_/)
  assert.equal(DB.batches.length, 1)
  assert.equal(DB.batches[0].length, 2)
  assert.match(DB.batches[0][0].sql, /INSERT INTO source_health_attempts/)
  assert.match(DB.batches[0][1].sql, /WHERE id=\? AND video_url=\? AND deleted_at IS NULL/)
  assert.match(DB.batches[0][1].sql, /ON CONFLICT\(recommendation_id\) DO UPDATE/)
  assert.deepEqual(DB.batches[0][1].args.slice(-2), ['rec-1', 'https://example.com/lesson'])
})

test('the latest projection binds a normalized verification to the exact current source identity', async () => {
  const DB = new RecordingDatabase()
  await recordSourceHealthCheck(DB as any, 'rec-legacy', 'current', {
    status: 'verified',
    checked_url: 'https://example.com/lesson',
    http_status: 200,
    final_url: 'https://example.com/lesson',
  }, 'https://example.com/lesson?utm_source=legacy')

  assert.equal(DB.batches[0][0].args[3], 'https://example.com/lesson')
  assert.equal(DB.batches[0][1].args[1], 'https://example.com/lesson?utm_source=legacy')
})

test('a stale check attempt cannot replace the latest projection for a newly changed URL', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT NOT NULL,status TEXT,deleted_at TEXT);
    ${readFileSync(new URL('../../migrations/0070_source_health.sql', import.meta.url), 'utf8')}
    INSERT INTO recommendations(id,video_url,status) VALUES ('rec-1','https://example.com/old','active');
  `)
  const DB = new SourceHealthSqliteD1(sqlite) as unknown as D1Database
  await recordSourceHealthCheck(DB, 'rec-1', 'current', {
    status: 'verified', checked_url: 'https://example.com/old', http_status: 200, final_url: 'https://example.com/old',
  }, 'https://example.com/old')
  sqlite.prepare("UPDATE recommendations SET video_url='https://example.com/new' WHERE id='rec-1'").run()
  await recordSourceHealthCheck(DB, 'rec-1', 'current', {
    status: 'verified', checked_url: 'https://example.com/new', http_status: 200, final_url: 'https://example.com/new',
  }, 'https://example.com/new')
  await recordSourceHealthCheck(DB, 'rec-1', 'current', {
    status: 'unavailable', checked_url: 'https://example.com/old', http_status: 404, final_url: 'https://example.com/old', error_code: 'not_found',
  }, 'https://example.com/old')

  const current = sqlite.prepare("SELECT checked_url,status,http_status FROM source_health WHERE recommendation_id='rec-1'").get() as any
  assert.deepEqual({ ...current }, { checked_url: 'https://example.com/new', status: 'verified', http_status: 200 })
  assert.equal((sqlite.prepare("SELECT COUNT(*) count FROM source_health_attempts WHERE recommendation_id='rec-1'").get() as any).count, 3)
  sqlite.close()
})

test('scheduled refresh checks Queue, the current not-started lesson turn, and Current Book only', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT NOT NULL,status TEXT,deleted_at TEXT,content_type TEXT);
    CREATE TABLE recommendation_meta(recommendation_id TEXT PRIMARY KEY,learning_state TEXT,source_metadata_json TEXT);
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY,status TEXT,superseded_at TEXT);
    CREATE TABLE learning_path_stages(id TEXT PRIMARY KEY,thread_id TEXT,status TEXT,position INTEGER);
    CREATE TABLE thread_lessons(id TEXT PRIMARY KEY,stage_id TEXT,status TEXT,position INTEGER);
    CREATE TABLE thread_lesson_sources(lesson_id TEXT,recommendation_id TEXT);
    ${readFileSync(new URL('../../migrations/0070_source_health.sql', import.meta.url), 'utf8')}
    INSERT INTO recommendations VALUES ('queue','https://example.com/queue','active',NULL,'article');
    INSERT INTO recommendations VALUES ('lesson','https://example.com/lesson','consumed',NULL,'article');
    INSERT INTO recommendations VALUES ('book','https://example.com/book','active',NULL,'book');
    INSERT INTO recommendations VALUES ('library','https://example.com/library','active',NULL,'article');
    INSERT INTO recommendation_meta VALUES ('queue','queued','{}');
    INSERT INTO recommendation_meta VALUES ('lesson','captured','{}');
    INSERT INTO recommendation_meta VALUES ('book','captured','{"book_primary":1,"book_reading_state":"reading"}');
    INSERT INTO recommendation_meta VALUES ('library','captured','{}');
    INSERT INTO learning_threads VALUES ('thread','active',NULL);
    INSERT INTO learning_path_stages VALUES ('level','thread','available',1);
    INSERT INTO thread_lessons VALUES ('lesson-turn','level','not_started',1);
    INSERT INTO thread_lesson_sources VALUES ('lesson-turn','lesson');
  `)
  const DB = new SourceHealthSqliteD1(sqlite) as unknown as D1Database
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch
  try {
    const receipt = await refreshScopedSourceHealth(DB, 8)
    const checked = sqlite.prepare('SELECT recommendation_id FROM source_health_attempts ORDER BY recommendation_id').all()
      .map((row: any) => row.recommendation_id)
    assert.equal(receipt.checked, 3)
    assert.deepEqual(checked, ['book', 'lesson', 'queue'])
  } finally {
    globalThis.fetch = originalFetch
    sqlite.close()
  }
})

test('scheduled refresh does not let a fresh verdict for a former URL skip the current source', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_url TEXT NOT NULL,status TEXT,deleted_at TEXT,content_type TEXT);
    CREATE TABLE recommendation_meta(recommendation_id TEXT PRIMARY KEY,learning_state TEXT,source_metadata_json TEXT);
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY,status TEXT,superseded_at TEXT);
    CREATE TABLE learning_path_stages(id TEXT PRIMARY KEY,thread_id TEXT,status TEXT,position INTEGER);
    CREATE TABLE thread_lessons(id TEXT PRIMARY KEY,stage_id TEXT,status TEXT,position INTEGER);
    CREATE TABLE thread_lesson_sources(lesson_id TEXT,recommendation_id TEXT);
    ${readFileSync(new URL('../../migrations/0070_source_health.sql', import.meta.url), 'utf8')}
    INSERT INTO recommendations VALUES ('queue','https://example.com/current','active',NULL,'article');
    INSERT INTO recommendation_meta VALUES ('queue','queued','{}');
    INSERT INTO source_health(recommendation_id,checked_url,status,last_checked_at)
      VALUES ('queue','https://example.com/former','verified',datetime('now'));
  `)
  const DB = new SourceHealthSqliteD1(sqlite) as unknown as D1Database
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch
  try {
    const receipt = await refreshScopedSourceHealth(DB, 8)
    assert.equal(receipt.checked, 1)
    const current = sqlite.prepare("SELECT checked_url,status FROM source_health WHERE recommendation_id='queue'").get() as any
    assert.deepEqual({ ...current }, { checked_url: 'https://example.com/current', status: 'verified' })
  } finally {
    globalThis.fetch = originalFetch
    sqlite.close()
  }
})

test('source-health migration constrains statuses, bounds attempts, and preserves replacement lineage', () => {
  const migration = readFileSync(new URL('../../migrations/0070_source_health.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS source_health/)
  assert.match(migration, /'verified','restricted','unavailable','unknown','invalid'/)
  assert.match(migration, /source_health_attempts_bound_history/)
  assert.match(migration, /LIMIT 20/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS source_url_replacements/)
  assert.match(migration, /previous_url TEXT NOT NULL/)
})

test('scheduled source checks stay bounded to current commitment surfaces', () => {
  const service = readFileSync(new URL('../../src/services/source-health.ts', import.meta.url), 'utf8')
  const maintenance = readFileSync(new URL('../../src/services/maintenance.ts', import.meta.url), 'utf8')
  assert.match(service, /COALESCE\(m\.learning_state,'queued'\) IN \('queued','in_progress'\)/)
  assert.match(service, /ROW_NUMBER\(\) OVER \(PARTITION BY s\.thread_id ORDER BY s\.position,s\.id\) stage_rank/)
  assert.match(service, /s\.status IN \('available','in_progress'\)/)
  assert.match(service, /ORDER BY CASE WHEN l\.status='in_progress' THEN 0 ELSE 1 END,l\.position,l\.id/)
  assert.match(service, /COALESCE\(l\.status,'not_started'\)!='completed'/)
  assert.match(service, /JOIN ranked_lessons l ON l\.id=ls\.lesson_id AND l\.lesson_rank=1/)
  assert.match(service, /book_primary.*book_reading_state.*reading/s)
  assert.match(service, /Math\.min\(Math\.max\(Math\.trunc\(limit\).*12\)/s)
  assert.match(maintenance, /step\('source_health', \(\) => refreshScopedSourceHealth\(env\.DB\)\)/)
})

test('source-health control ignores non-web sources and discards stale ledger reads', () => {
  const component = readFileSync(new URL('../../client/src/components/SourceHealthControl.tsx', import.meta.url), 'utf8')
  assert.ok(component.includes('const supportsHealth = /^https?:\\/\\//i.test(suppliedUrl)'))
  assert.match(component, /if \(!supportsHealth\) return null/)
  assert.match(component, /const version = \+\+reloadVersion\.current/)
  assert.match(component, /activeSourceId\.current === requestedSourceId && sourceVersion\.current === version/)
  assert.match(component, /if \(!operationIsCurrent\(requestedSourceId, version\)\) return/)
  assert.match(component, /expected_source_url: currentUrl/)
  assert.match(component, /expected_source_url: verifiedCandidate\.expected_source_url/)
})

test('Library Queue exposes a usable current source-health filter without adding a root surface', () => {
  const queue = readFileSync(new URL('../../client/src/workspaces/library/LibraryViews.tsx', import.meta.url), 'utf8')
  const projection = readFileSync(new URL('../../src/services/capture-queue.ts', import.meta.url), 'utf8')
  assert.match(queue, /aria-label="Queue source health"/)
  assert.match(queue, /Needs attention/)
  assert.match(queue, /No sources match this health filter/)
  assert.match(projection, /sourceHealthMatchesCurrentUrl\(row\.source_health_checked_url, row\.video_url\)/)
  assert.match(projection, /source_health: sourceHealth/)
})

test('Current Book exposes the complete guarded source repair and replacement history control', () => {
  const books = readFileSync(new URL('../../client/src/workspaces/library/BooksView.tsx', import.meta.url), 'utf8')
  const currentBookHealth = books.slice(books.indexOf('<BookKnowledgeContext book={primaryBook}/>'), books.indexOf('{nextChapter ?'))
  assert.match(currentBookHealth, /<SourceHealthControl\s+sourceId=\{String\(primaryBook\.id\)\}/)
  assert.doesNotMatch(currentBookHealth, /<SourceHealthControl\s+compact/)
  assert.match(currentBookHealth, /onReplaced=\{\(\) => handlers\.onReload\?\.\(\)\}/)

  const control = readFileSync(new URL('../../client/src/components/SourceHealthControl.tsx', import.meta.url), 'utf8')
  assert.match(control, /<summary>Verify a replacement URL<\/summary>/)
  assert.match(control, /expected_source_url: verifiedCandidate\.expected_source_url/)
  assert.match(control, /<summary>Check and replacement history<\/summary>/)
})
