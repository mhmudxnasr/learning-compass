import assert from 'node:assert/strict'
import test from 'node:test'
import { enrichRecommendationRows } from '../../src/services/recommendation-enrichment.ts'

test('recommendation enrichment batches related rows without correlated scans', async () => {
  const queries: string[] = []
  const DB = {
    prepare(query: string) {
      queries.push(query)
      return {
        bind() {
          return {
            async all() {
              if (query.includes('FROM notes'))
                return { results: [{ recommendation_id: 'rec-1', id: 'note-1', title: 'Note' }] }
              if (query.includes('FROM srs_cards'))
                return { results: [{ recommendation_id: 'rec-1', recall_count: 2, due_count: 1 }] }
              return {
                results: [
                  { recommendation_id: 'rec-1', id: 'html-1', media_type: 'text/html', filename: 'source.html' },
                  { recommendation_id: 'rec-1', id: 'pdf-1', media_type: 'application/pdf', filename: 'source.pdf' },
                ],
              }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  const [row] = await enrichRecommendationRows(DB, [{ id: 'rec-1', video_title: 'Source' }], true)

  assert.equal(row.note_id, 'note-1')
  assert.equal(row.recall_count, 2)
  assert.equal(row.due_count, 1)
  assert.equal(row.html_artifact_id, 'html-1')
  assert.equal(row.pdf_artifact_id, 'pdf-1')
  assert.equal(queries.length, 3)
  assert.ok(queries.every((query) => query.includes(' IN (?)')))
  assert.ok(queries.every((query) => !query.includes('recommendations.id')))
  assert.match(queries[2], /scope/)
})
