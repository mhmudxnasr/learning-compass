import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chunkForD1, D1_IN_QUERY_CHUNK_SIZE } from '../../src/services/d1-query.ts'

test('large Thread source sets stay within the D1 bind limit', () => {
  const ids = Array.from({ length: 294 }, (_, index) => `source_${index}`)
  const chunks = chunkForD1(ids)
  assert.equal(D1_IN_QUERY_CHUNK_SIZE, 75)
  assert.equal(chunks.length, 4)
  assert.ok(chunks.every((chunk) => chunk.length <= D1_IN_QUERY_CHUNK_SIZE))
  assert.deepEqual(chunks.flat(), ids)
})

test('Thread artifact and NotebookLM lookups use bounded D1 batches', () => {
  const learningCore = readFileSync(new URL('../../src/api/learning-core.ts', import.meta.url), 'utf8')
  const notebook = readFileSync(new URL('../../src/services/notebooklm-learning.ts', import.meta.url), 'utf8')
  assert.match(learningCore, /Promise\.all\(\s*chunkForD1\(recIds\)/)
  assert.match(notebook, /Promise\.all\(\s*chunkForD1\(targets\)/)
})
