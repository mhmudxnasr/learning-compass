import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let syncPathStatuses: (db: any, threadId: string, autoAdvance?: boolean) => Promise<void>
let vite: ViteDevServer

test.before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  ;({ syncPathStatuses } = await vite.ssrLoadModule('/src/api/learning-core.ts'))
})

test.after(async () => {
  await vite.close()
})

class SqliteD1 {
  private readonly sqlite: DatabaseSync

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite
  }

  prepare(sql: string) {
    const statement: any = {
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

test('final lesson completion activates the next Level and first lesson, then continues within it', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE learning_threads (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      completed_at TEXT,
      verified_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE learning_path_stages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE thread_lessons (
      id TEXT PRIMARY KEY,
      stage_id TEXT NOT NULL,
      status TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT
    );
    INSERT INTO learning_threads (id,status) VALUES ('thread','active');
    INSERT INTO learning_path_stages (id,thread_id,status,position) VALUES
      ('level-0','thread','in_progress',0),
      ('level-1','thread','locked',1);
    INSERT INTO thread_lessons (id,stage_id,status,position) VALUES
      ('lesson-0-1','level-0','completed',0),
      ('lesson-0-2','level-0','completed',1),
      ('lesson-0-3','level-0','completed',2),
      ('lesson-1-1','level-1','not_started',0),
      ('lesson-1-2','level-1','not_started',1);
  `)
  const DB = new SqliteD1(sqlite)
  const statusOf = (table: string, id: string) =>
    String((sqlite.prepare(`SELECT status FROM ${table} WHERE id=?`).get(id) as { status: string }).status)

  await syncPathStatuses(DB, 'thread', true)

  assert.equal(statusOf('learning_path_stages', 'level-0'), 'verified')
  assert.equal(statusOf('learning_path_stages', 'level-1'), 'in_progress')
  assert.equal(statusOf('thread_lessons', 'lesson-1-1'), 'in_progress')
  assert.equal(statusOf('thread_lessons', 'lesson-1-2'), 'not_started')

  sqlite.prepare(`UPDATE thread_lessons SET status='completed' WHERE id='lesson-1-1'`).run()
  await syncPathStatuses(DB, 'thread', true)

  assert.equal(statusOf('thread_lessons', 'lesson-1-2'), 'in_progress')
  assert.equal(statusOf('learning_threads', 'thread'), 'active')
  sqlite.close()
})
