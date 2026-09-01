import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let app: any
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  app = (await vite.ssrLoadModule('/src/api/recommendations.ts')).default
})

test.after(async () => {
  await vite.close()
})

class SourceUrlDatabase {
  statements: Array<{ sql: string; args: unknown[] }> = []
  batchStatements: Array<{ sql: string; args: unknown[] }> = []
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
        if (sql.includes('SELECT id,video_title'))
          return {
            id: 'rec-1',
            video_title: 'Lesson',
            content_type: 'audio lecture',
            video_url: 'https://al-badr.net/detail/lesson',
            dedup_key: 'old-key',
            status: 'active',
            deleted_at: null,
          }
        if (sql.includes('SELECT id FROM recommendations WHERE dedup_key')) return this.collision
        return null
      },
    }
    this.statements.push(statement)
    return statement
  }

  async batch(statements: Array<{ sql: string; args: unknown[] }>) {
    this.batchStatements = statements
    return []
  }
}

test('preferred source URL replacement preserves the archive URL and updates dedup identity', async () => {
  const DB = new SourceUrlDatabase()
  const response = await app.request(
    '/rec-1/source-url',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_url: 'https://www.youtube.com/watch?v=3NQJSniI8XM' }),
    },
    { DB } as any,
  )
  const body = (await response.json()) as any

  assert.equal(response.status, 200)
  assert.equal(body.source_url, 'https://www.youtube.com/watch?v=3NQJSniI8XM')
  assert.equal(body.dedup_key, 'yt_3NQJSniI8XM')
  assert.equal(DB.batchStatements.length, 2)
  assert.deepEqual(DB.batchStatements[0].args, [
    'https://www.youtube.com/watch?v=3NQJSniI8XM',
    'yt_3NQJSniI8XM',
    'rec-1',
  ])
  assert.equal(DB.batchStatements[1].args[3], 'https://al-badr.net/detail/lesson')
})

test('preferred source URL replacement rejects an existing source identity', async () => {
  const DB = new SourceUrlDatabase()
  DB.collision = { id: 'rec-existing' }
  const response = await app.request(
    '/rec-1/source-url',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_url: 'https://www.youtube.com/watch?v=3NQJSniI8XM' }),
    },
    { DB } as any,
  )

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'source_url_conflict', recommendation_id: 'rec-existing' })
  assert.equal(DB.batchStatements.length, 0)
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
    {
      id: 'rec-1',
      video_url: 'https://www.youtube.com/watch?v=one',
      content_type: 'article',
      status: 'active',
      deleted_at: null,
    },
    {
      id: 'rec-2',
      video_url: 'https://youtu.be/two',
      content_type: 'audio lecture',
      status: 'active',
      deleted_at: null,
    },
  ]
  const response = await app.request(
    '/content-types',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ids: ['rec-1', 'rec-2'],
        content_type: 'video',
        expected_content_types: ['article', 'audio lecture'],
      }),
    },
    { DB } as any,
  )
  const body = (await response.json()) as any

  assert.equal(response.status, 200)
  assert.equal(body.updated, 2)
  assert.deepEqual(
    DB.updates.map((statement) => statement.args),
    [['rec-1'], ['rec-2']],
  )
  assert.ok(DB.updates.every((statement) => statement.sql.includes("content_type='video'")))
})

test('bulk content-type repair rejects non-YouTube records before writing', async () => {
  const DB = new ContentTypeDatabase()
  DB.rows = [
    {
      id: 'rec-1',
      video_url: 'https://example.com/lesson',
      content_type: 'article',
      status: 'active',
      deleted_at: null,
    },
  ]
  const response = await app.request(
    '/content-types',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['rec-1'], content_type: 'video', expected_content_types: ['article'] }),
    },
    { DB } as any,
  )

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'video_type_requires_youtube_url', ids: ['rec-1'] })
  assert.equal(DB.updates.length, 0)
})
