import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { actOnResurfacing, cairoDay, getDailyResurfacing, resurfacingScore } from '../../src/services/resurfacing.ts'

test('resurfacing score is deterministic with star boost and frequency decay', () => {
  assert.equal(resurfacingScore({ starred: true, overdueDays: 4, presentationCount: 0 }), 128)
  assert.equal(resurfacingScore({ starred: false, overdueDays: 4, presentationCount: 0 }), 28)
  assert.equal(resurfacingScore({ starred: false, overdueDays: 4, presentationCount: 3 }), 10)
  assert.equal(resurfacingScore({ starred: false, overdueDays: 4, presentationCount: 3 }), 10)
})

test('Cairo day follows Africa/Cairo rather than UTC', () => {
  assert.equal(cairoDay(new Date('2026-01-01T22:30:00.000Z')), '2026-01-02')
})

test('daily selection returns one ranked eligible source and enforces seven-day suppression in SQL', async () => {
  const statements: string[] = []
  const base = {
    creator: null, content_type: 'article', source_url: 'https://example.com', user_rating: 'like', consumed_date: '2025-01-01',
    resurfacing_id: 1, stage: '30d', due_at: '2026-01-01', branch_id: 'branch-1', branch_label: 'Systems', branch_status: 'love',
    domain_id: 'cat-tools', domain_label: 'Tools', html_artifact_id: null, pdf_artifact_id: null,
  }
  const DB = {
    prepare(sql: string) {
      statements.push(sql)
      const statement: any = {
        bind: () => statement,
        first: async () => null,
        all: async () => ({ results: [
          { ...base, recommendation_id: 'plain', title: 'Plain', starred: 0, presentation_count: 0 },
          { ...base, recommendation_id: 'starred', title: 'Starred', starred: 1, presentation_count: 8 },
        ] }),
      }
      return statement
    },
  }
  const result = await getDailyResurfacing(DB as any, { limit: 5, now: new Date('2026-01-10T10:00:00Z') })

  assert.equal(result.item?.recommendation_id, 'starred')
  assert.equal(result.item?.branch.id, 'branch-1')
  assert.equal(result.item?.domain.id, 'cat-tools')
  const selectionSql = statements.find((sql) => sql.includes('FROM recommendations r')) || ''
  assert.match(selectionSql, /r\.status='consumed'/)
  assert.match(selectionSql, /r\.deleted_at IS NULL/)
  assert.match(selectionSql, /b\.status.*pruned/)
  assert.match(selectionSql, /d\.type='category'/)
  assert.match(selectionSql, /date\(\?,'-7 days'\)/)
})

test('resurfacing actions only update presentation and resurfacing rows', async () => {
  const batches: Array<Array<{ sql: string; args: unknown[] }>> = []
  const DB = {
    prepare(sql: string) {
      const statement: any = {
        sql,
        args: [] as unknown[],
        bind(...args: unknown[]) { statement.args = args; return statement },
        first: async () => {
          if (sql.includes('SELECT id,recommendation_id,cairo_day,action')) return { id: 'event-1', recommendation_id: 'rec-1', cairo_day: '2026-01-10', action: null }
          if (sql.includes('SELECT id FROM resurfacing')) return { id: 42 }
          return null
        },
      }
      return statement
    },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) { batches.push(statements); return [] },
  }

  const result = await actOnResurfacing(DB as any, 'event-1', 'reviewed')
  assert.equal(result?.action, 'reviewed')
  const sql = batches[0].map((statement) => statement.sql).join('\n')
  assert.match(sql, /UPDATE resurfacing_presentations/)
  assert.match(sql, /UPDATE resurfacing SET resolved_at/)
  assert.doesNotMatch(sql, /lesson|mastery|learning_/i)
})

test('presentation idempotency is scoped to each source and Cairo day', () => {
  const migration = readFileSync(new URL('../../migrations/0059_daily_resurfacing.sql', import.meta.url), 'utf8')
  assert.match(migration, /UNIQUE\(recommendation_id, cairo_day\)/)
  assert.doesNotMatch(migration, /UNIQUE\(cairo_day\)/)
})

test('an acted presentation cannot be reused for another overdue stage that day', async () => {
  const DB = {
    prepare() {
      const statement: any = { bind: () => statement, first: async () => ({ id: 'event-1', recommendation_id: 'rec-1', cairo_day: '2026-01-10', action: 'reviewed' }) }
      return statement
    },
  }
  const result = await getDailyResurfacing(DB as any, { now: new Date('2026-01-10T10:00:00Z') })
  assert.equal(result.item, null)
})
