import assert from 'node:assert/strict'
import test from 'node:test'

import { compileMemoryContext, memoryContextTokens } from '../../src/services/memory-context.ts'

test('memory retrieval tokenizes Arabic and receipts every filtered or truncated candidate', async () => {
  const now = '2026-08-26 08:00:00'
  const memories = [
    {
      id: 'mem-ar-1',
      memory_key: 'learning:arabic',
      memory_kind: 'durable',
      value_json: JSON.stringify('التعلم الفعال'),
      confidence: 0.95,
      source: 'test',
      status: 'approved',
      evidence_json: '[]',
      updated_at: now,
    },
    {
      id: 'mem-ar-2',
      memory_key: 'learning:arabic:secondary',
      memory_kind: 'durable',
      value_json: JSON.stringify('التعلم الفعال بالتطبيق'),
      confidence: 0.85,
      source: 'test',
      status: 'active',
      evidence_json: '[]',
      updated_at: now,
    },
    {
      id: 'mem-en-1',
      memory_key: 'unrelated',
      memory_kind: 'durable',
      value_json: JSON.stringify('unrelated weather preference'),
      confidence: 1,
      source: 'test',
      status: 'active',
      evidence_json: '[]',
      updated_at: now,
    },
  ]
  const assertions = [
    ...Array.from({ length: 14 }, (_, index) => ({
      assertion_key: `تعلم.${index}`,
      category: 'learning',
      scope: null,
      value_json: JSON.stringify('التعلم الفعال'),
      weight: 1,
      confidence: 1,
      status: 'active',
      source_kind: 'test',
      version: 1,
      updated_at: now,
    })),
    {
      assertion_key: 'unrelated.assertion',
      category: 'other',
      scope: null,
      value_json: JSON.stringify('weather'),
      weight: 1,
      confidence: 1,
      status: 'active',
      source_kind: 'test',
      version: 1,
      updated_at: now,
    },
  ]
  let receiptArgs: any[] = []
  const db: any = {
    prepare(sql: string) {
      const statement: any = {
        args: [] as any[],
        bind(...args: any[]) {
          statement.args = args
          return statement
        },
        async all() {
          if (sql.includes('FROM hermes_memory')) return { results: memories }
          if (sql.includes('FROM profile_assertions')) return { results: assertions }
          if (sql.includes('FROM memory_evidence')) return { results: [] }
          throw new Error(`Unexpected all query: ${sql}`)
        },
        async first() {
          return null
        },
        async run() {
          if (sql.includes('INSERT INTO memory_retrieval_receipts')) receiptArgs = statement.args
          return { meta: { changes: 1 } }
        },
      }
      return statement
    },
    async batch() {
      return []
    },
  }

  assert.deepEqual([...memoryContextTokens('التعلُّم الفعّال')], ['التعلم', 'الفعال'])
  const context = await compileMemoryContext(db, { taskKind: 'learning', query: 'التعلم الفعال', limit: 1 })

  assert.equal(context.memories.length, 1)
  assert.equal(context.memories[0].id, 'mem-ar-1')
  assert.equal(context.profile_assertions.length, 12)
  assert.equal(context.considered_count, 3)
  assert.equal(context.profile_assertions_considered_count, 15)
  assert.ok(context.excluded.some((item: any) => item.memory_id === 'mem-ar-2' && item.reason === 'limit_truncated'))
  assert.ok(context.excluded.some((item: any) => item.memory_id === 'mem-en-1' && item.reason === 'no_query_match'))
  assert.equal(
    context.excluded.filter((item: any) => item.item_type === 'profile_assertion' && item.reason === 'limit_truncated')
      .length,
    2,
  )
  assert.ok(
    context.excluded.some(
      (item: any) => item.assertion_key === 'unrelated.assertion' && item.reason === 'no_query_match',
    ),
  )
  assert.deepEqual(JSON.parse(receiptArgs[5]), ['mem-ar-1'])
  assert.deepEqual(JSON.parse(receiptArgs[6]), ['mem-ar-1', 'mem-ar-2', 'mem-en-1'])
  assert.deepEqual(JSON.parse(receiptArgs[7]), context.excluded)
})
