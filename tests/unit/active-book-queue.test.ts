import assert from 'node:assert/strict'
import test from 'node:test'
import { loadCaptureQueue } from '../../src/services/capture-queue.ts'

test('loadCaptureQueue never projects reading books into Queue', async () => {
  const queueRows = [{
    id: 'rec-1',
    video_title: 'Paper on Systems',
    creator: 'Researcher',
    content_type: 'paper',
    branch_label: 'Distributed Systems',
    branch_domain: 'cat-technology',
    learning_state: 'queued',
  }]
  const mockDB = {
    prepare(sql: string) {
      assert.match(sql, /COALESCE\(r\.content_type, ''\) != 'book'/)
      return {
        bind() {
          return { async all() { return { results: queueRows } } }
        },
      }
    },
  } as unknown as D1Database

  const queue = await loadCaptureQueue(mockDB, 5)

  assert.deepEqual(queue.map((item) => item.id), ['rec-1'])
  assert.equal(queue[0].branch?.super_category, 'cat-technology')
  assert.equal(queue.some((item) => item.content_type === 'book' || item.is_book_chapter), false)
})
