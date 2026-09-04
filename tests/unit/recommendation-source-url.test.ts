import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let app: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  app = (await vite.ssrLoadModule('/src/api/recommendations.ts')).default
})

test.after(async () => { await vite.close() })

class SourceUrlDatabase {
  statements: Array<{ sql: string; args: unknown[] }> = []
  batches: Array<Array<{ sql: string; args: unknown[] }>> = []
  collision: { id: string } | null = null

  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      first: async () => {
        if (sql.includes('SELECT id,video_title')) return {
          id: 'rec-1', video_title: 'Lesson', content_type: 'audio lecture',
          video_url: 'https://al-badr.net/detail/lesson', dedup_key: 'old-key', status: 'active', deleted_at: null, updated_at: '2026-08-01T00:00:00.000Z',
        }
        if (sql.includes('SELECT id FROM recommendations WHERE dedup_key')) return this.collision
        return null
      },
    }
    this.statements.push(statement)
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.batches.push(statements)
    return []
  }
}

test('preferred source URL replacement preserves the archive URL and updates dedup identity', async () => {
  const DB = new SourceUrlDatabase()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch
  try {
    const response = await app.request('/rec-1/source-url', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_url: 'https://www.youtube.com/watch?v=3NQJSniI8XM', expected_source_url: 'https://al-badr.net/detail/lesson' }),
    }, { DB } as any)
    const body = await response.json() as any

    assert.equal(response.status, 200)
    assert.equal(body.source_url, 'https://www.youtube.com/watch?v=3NQJSniI8XM')
    assert.equal(body.dedup_key, 'yt_3NQJSniI8XM')
    assert.equal(body.verification.status, 'verified')
    assert.equal(DB.batches.length, 2)
    assert.equal(DB.batches[0].length, 1)
    assert.equal(DB.batches[1].length, 4)
    assert.deepEqual(DB.batches[1][0].args.slice(0, 2), ['https://www.youtube.com/watch?v=3NQJSniI8XM', 'yt_3NQJSniI8XM'])
    assert.equal(DB.batches[1][2].args[3], 'https://al-badr.net/detail/lesson')
    assert.match(DB.batches[1][1].sql, /INSERT INTO source_url_replacements/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preferred source URL replacement rejects an existing source identity', async () => {
  const DB = new SourceUrlDatabase()
  DB.collision = { id: 'rec-existing' }
  const response = await app.request('/rec-1/source-url', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_url: 'https://www.youtube.com/watch?v=3NQJSniI8XM', expected_source_url: 'https://al-badr.net/detail/lesson' }),
  }, { DB } as any)

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'source_url_conflict', recommendation_id: 'rec-existing' })
  assert.equal(DB.batches.length, 0)
})

test('preferred source URL replacement records but rejects a restricted candidate', async () => {
  const DB = new SourceUrlDatabase()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 403 })) as typeof fetch
  try {
    const response = await app.request('/rec-1/source-url', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_url: 'https://restricted.example/lesson', expected_source_url: 'https://al-badr.net/detail/lesson' }),
    }, { DB } as any)
    const body = await response.json() as any

    assert.equal(response.status, 409)
    assert.equal(body.error, 'source_url_not_verified')
    assert.equal(body.verification.status, 'restricted')
    assert.equal(DB.batches.length, 1)
    assert.match(DB.batches[0][0].sql, /INSERT INTO source_health_attempts/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

class SourceHealthApiDatabase {
  batches: Array<Array<{ sql: string; args: unknown[] }>> = []
  healthCheckedUrl = 'https://example.com/lesson'

  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      first: async () => {
        if (sql.includes('FROM recommendations WHERE id=')) return {
          id: 'rec-1', video_title: 'Lesson', content_type: 'article',
          video_url: 'https://example.com/lesson', dedup_key: 'art_example_com_lesson',
          status: 'active', deleted_at: null, updated_at: '2026-08-01T00:00:00.000Z',
        }
        if (sql.includes('FROM source_health WHERE')) return {
          recommendation_id: 'rec-1', checked_url: this.healthCheckedUrl, status: 'verified',
          last_checked_at: '2026-08-30T00:00:00.000Z', http_status: 200, final_url: 'https://example.com/lesson', error_code: null,
        }
        return null
      },
      all: async () => {
        if (sql.includes('FROM source_health_attempts')) return { results: [{ id: 'source_check_1', purpose: 'current', status: 'verified' }] }
        if (sql.includes('FROM source_url_replacements')) return { results: [{ id: 'source_replacement_1', previous_url: 'https://old.example/lesson' }] }
        return { results: [] }
      },
    }
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.batches.push(statements)
    return []
  }
}

test('source health API returns the latest projection, bounded attempts, and replacement history', async () => {
  const DB = new SourceHealthApiDatabase()
  const response = await app.request('/rec-1/source-health?limit=100', {}, { DB } as any)
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.source.source_url, 'https://example.com/lesson')
  assert.equal(body.health.status, 'verified')
  assert.equal(body.attempts[0].id, 'source_check_1')
  assert.equal(body.replacements[0].id, 'source_replacement_1')
})

test('source health API does not present a verdict recorded for a former URL as current', async () => {
  const DB = new SourceHealthApiDatabase()
  DB.healthCheckedUrl = 'https://example.com/former'
  const response = await app.request('/rec-1/source-health', {}, { DB } as any)
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.health, null)
  assert.equal(body.attempts[0].id, 'source_check_1')
})

test('explicit source health check persists the current source result', async () => {
  const DB = new SourceHealthApiDatabase()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch
  try {
    const response = await app.request('/rec-1/source-health/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_source_url: 'https://example.com/lesson' }),
    }, { DB } as any)
    const body = await response.json() as any

    assert.equal(response.status, 200)
    assert.equal(body.health.status, 'verified')
    assert.equal(DB.batches[0].length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('source health precondition compares canonical URL identity rather than tracking noise', async () => {
  const DB = new SourceHealthApiDatabase()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch
  try {
    const response = await app.request('/rec-1/source-health/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_source_url: 'https://example.com/lesson?utm_source=library' }),
    }, { DB } as any)

    assert.equal(response.status, 200)
    assert.equal(DB.batches[0].length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('candidate verification and replacement reject a stale observed source URL before network work', async () => {
  const DB = new SourceHealthApiDatabase()
  let fetches = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => { fetches++; return new Response(null, { status: 200 }) }) as typeof fetch
  try {
    for (const [path, method] of [['/rec-1/source-url/verify', 'POST'], ['/rec-1/source-url', 'PATCH']] as const) {
      const response = await app.request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source_url: 'https://example.com/replacement', expected_source_url: 'https://example.com/stale' }),
      }, { DB } as any)
      assert.equal(response.status, 409)
      assert.deepEqual(await response.json(), { error: 'source_url_precondition_failed', source_url: 'https://example.com/lesson' })
    }
    assert.equal(fetches, 0)
    assert.equal(DB.batches.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

class BookUpsertDatabase {
  batches: Array<Array<{ sql: string; args: unknown[] }>> = []
  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => { statement.args = args; return statement },
      first: async () => {
        if (sql.includes('FROM tree_nodes WHERE')) return { id: 'books', label: 'Books', status: 'active' }
        if (sql.includes('SELECT id,video_url FROM recommendations')) return { id: 'book-1', video_url: 'https://books.example/original' }
        if (sql.includes('SELECT r.*')) return { id: 'book-1', video_url: 'https://books.example/original', video_title: 'Updated title' }
        return null
      },
    }
    return statement
  }
  async batch(statements: Array<{ sql: string; args: unknown[] }>) { this.batches.push(statements); return [] }
}

test('ISBN-bound book upsert cannot rewrite the canonical URL but still edits other metadata', async () => {
  const rejectedDB = new BookUpsertDatabase()
  const rejected = await app.request('/books', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Updated title', author: 'Author', branch_id: 'books', isbn: '123456789X', url: 'https://books.example/replacement' }),
  }, { DB: rejectedDB } as any)
  const conflict = await rejected.json() as any
  assert.equal(rejected.status, 409)
  assert.equal(conflict.error, 'source_url_replacement_required')
  assert.equal(conflict.recommendation_id, 'book-1')
  assert.equal(rejectedDB.batches.length, 0)

  const metadataDB = new BookUpsertDatabase()
  const updated = await app.request('/books', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Updated title', author: 'Author', branch_id: 'books', isbn: '123456789X', why_this: 'Revised context' }),
  }, { DB: metadataDB } as any)
  assert.equal(updated.status, 200)
  assert.equal(metadataDB.batches.length, 1)
  assert.equal(metadataDB.batches[0][0].args[4], 'https://books.example/original')
  assert.doesNotMatch(metadataDB.batches[0][0].sql, /video_url=excluded\.video_url/)
})

test('delta sync preserves an existing canonical URL on stable-id conflict', () => {
  const sync = readFileSync(new URL('../../src/api/sync.ts', import.meta.url), 'utf8')
  const recommendationUpsert = sync.slice(sync.indexOf('INSERT INTO recommendations'), sync.indexOf('// Tree nodes delta'))
  assert.match(recommendationUpsert, /INSERT INTO recommendations[\s\S]*video_url/)
  assert.match(recommendationUpsert, /ON CONFLICT\(id\) DO UPDATE SET/)
  assert.doesNotMatch(recommendationUpsert, /video_url\s*=\s*excluded\.video_url/)
})

class RecommendationPushUrlDatabase {
  batches: Array<Array<{ sql: string; args: unknown[] }>> = []
  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => { statement.args = args; return statement },
      first: async () => sql.includes('SELECT id,video_url FROM recommendations WHERE dedup_key=')
        ? { id: 'existing', video_url: 'https://example.com/one/lesson' }
        : null,
      run: async () => ({ meta: { changes: 1 } }),
    }
    return statement
  }
  async batch(statements: Array<{ sql: string; args: unknown[] }>) { this.batches.push(statements); return [] }
}

test('recommendation push rejects a dedup collision with a different canonical URL before any write', async () => {
  const DB = new RecommendationPushUrlDatabase()
  const response = await app.request('/push', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ video_title: 'Same slug, different source', video_url: 'https://example.com/two/lesson', content_type: 'article' }),
  }, { DB } as any)
  const body = await response.json() as any
  assert.equal(response.status, 409)
  assert.equal(body.error, 'source_url_replacement_required')
  assert.equal(body.recommendation_id, 'existing')
  assert.equal(body.replacement_endpoint, '/recommendations/existing/source-url')
  assert.equal(DB.batches.length, 0)

  const source = readFileSync(new URL('../../src/api/recommendations.ts', import.meta.url), 'utf8')
  const pushUpsert = source.slice(source.indexOf("app.post('/push'"), source.indexOf("app.post('/action'"))
  assert.doesNotMatch(pushUpsert, /video_url\s*=\s*excluded\.video_url/)
})

class ContentTypeDatabase {
  rows: Array<{ id: string; video_url: string; content_type: string; status: string; deleted_at: null }> = []
  updates: Array<{ sql: string; args: unknown[] }> = []

  prepare(sql: string) {
    const statement = {
      sql,
      args: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.args = args
        return statement
      },
      all: async () => ({ results: this.rows.filter((row) => statement.args.includes(row.id)) }),
    }
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.updates.push(...statements)
    return []
  }
}

test('bulk content-type repair updates only preconditioned YouTube sources', async () => {
  const DB = new ContentTypeDatabase()
  DB.rows = [
    { id: 'rec-1', video_url: 'https://www.youtube.com/watch?v=one', content_type: 'article', status: 'active', deleted_at: null },
    { id: 'rec-2', video_url: 'https://youtu.be/two', content_type: 'audio lecture', status: 'active', deleted_at: null },
  ]
  const response = await app.request('/content-types', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['rec-1', 'rec-2'], content_type: 'video', expected_content_types: ['article', 'audio lecture'] }),
  }, { DB } as any)
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.updated, 2)
  assert.deepEqual(DB.updates.map((statement) => statement.args), [['rec-1'], ['rec-2']])
  assert.ok(DB.updates.every((statement) => statement.sql.includes("content_type='video'")))
})

test('bulk content-type repair rejects non-YouTube records before writing', async () => {
  const DB = new ContentTypeDatabase()
  DB.rows = [
    { id: 'rec-1', video_url: 'https://example.com/lesson', content_type: 'article', status: 'active', deleted_at: null },
  ]
  const response = await app.request('/content-types', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['rec-1'], content_type: 'video', expected_content_types: ['article'] }),
  }, { DB } as any)

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'video_type_requires_youtube_url', ids: ['rec-1'] })
  assert.equal(DB.updates.length, 0)
})
