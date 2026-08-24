import assert from 'node:assert/strict'
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
        if (sql.includes('SELECT id,video_title')) return {
          id: 'rec-1', video_title: 'Lesson', content_type: 'audio lecture',
          video_url: 'https://al-badr.net/detail/lesson', dedup_key: 'old-key', status: 'active', deleted_at: null,
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
  const response = await app.request('/rec-1/source-url', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_url: 'https://www.youtube.com/watch?v=3NQJSniI8XM' }),
  }, { DB } as any)
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.source_url, 'https://www.youtube.com/watch?v=3NQJSniI8XM')
  assert.equal(body.dedup_key, 'yt_3NQJSniI8XM')
  assert.equal(DB.batchStatements.length, 2)
  assert.deepEqual(DB.batchStatements[0].args, ['https://www.youtube.com/watch?v=3NQJSniI8XM', 'yt_3NQJSniI8XM', 'rec-1'])
  assert.equal(DB.batchStatements[1].args[3], 'https://al-badr.net/detail/lesson')
})

test('preferred source URL replacement rejects an existing source identity', async () => {
  const DB = new SourceUrlDatabase()
  DB.collision = { id: 'rec-existing' }
  const response = await app.request('/rec-1/source-url', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_url: 'https://www.youtube.com/watch?v=3NQJSniI8XM' }),
  }, { DB } as any)

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'source_url_conflict', recommendation_id: 'rec-existing' })
  assert.equal(DB.batchStatements.length, 0)
})
