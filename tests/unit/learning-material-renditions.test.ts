import test from 'node:test'
import assert from 'node:assert/strict'
import { selectLearningSourceRenditions } from '../../src/services/learning-material-renditions.ts'

const row = (
  id: string,
  role: 'html' | 'pdf',
  pairId: string | null,
  createdAt: string,
  recommendationId = 'rec-1',
) => ({
  id,
  filename: `${id}.${role}`,
  media_type: role === 'html' ? 'text/html' : 'application/pdf',
  size_bytes: role === 'html' ? 1200 : 3400,
  created_at: createdAt,
  metadata_json: JSON.stringify({
    recommendation_id: recommendationId,
    role,
    ...(pairId ? { pair_id: pairId } : {}),
    recommended_start: 'html',
    revision: pairId,
  }),
})

test('Learning lessons select the newest complete HTML/PDF pair', () => {
  const selected = selectLearningSourceRenditions([
    row('old-html', 'html', 'pair-1', '2026-08-01T00:00:00Z'),
    row('old-pdf', 'pdf', 'pair-1', '2026-08-01T00:00:01Z'),
    row('new-html', 'html', 'pair-2', '2026-08-02T00:00:00Z'),
    row('latest-html', 'html', 'pair-incomplete', '2026-08-03T00:00:00Z'),
    row('new-pdf', 'pdf', 'pair-2', '2026-08-02T00:00:01Z'),
  ])

  assert.equal(selected.get('rec-1')?.html?.id, 'new-html')
  assert.equal(selected.get('rec-1')?.pdf?.id, 'new-pdf')
  assert.equal(selected.get('rec-1')?.html?.metadata?.pair_id, 'pair-2')
  assert.equal(selected.get('rec-1')?.html?.size_bytes, 1200)
  assert.equal(typeof selected.get('rec-1')?.html?.metadata_json, 'string')
})

test('Learning lessons never combine incomplete named pairs', () => {
  const selected = selectLearningSourceRenditions([
    row('html-a', 'html', 'pair-a', '2026-08-02T00:00:00Z'),
    row('pdf-b', 'pdf', 'pair-b', '2026-08-03T00:00:00Z'),
  ])

  assert.equal(selected.has('rec-1'), false)
})

test('Unpaired legacy artifacts keep independent role compatibility', () => {
  const selected = selectLearningSourceRenditions([
    row('legacy-html', 'html', null, '2026-08-02T00:00:00Z'),
    row('legacy-pdf', 'pdf', null, '2026-08-03T00:00:00Z'),
    row('other-html', 'html', null, '2026-08-04T00:00:00Z', 'rec-2'),
  ])

  assert.equal(selected.get('rec-1')?.html?.id, 'legacy-html')
  assert.equal(selected.get('rec-1')?.pdf?.id, 'legacy-pdf')
  assert.equal(selected.get('rec-2')?.html?.id, 'other-html')
})

test('Source-level material selection ignores book chapter pairs and uses artifact identity to break timestamp ties', () => {
  const selected = selectLearningSourceRenditions([
    row('artifact_100_old_html', 'html', 'source-old', '2026-08-02T00:00:00Z'),
    row('artifact_101_old_pdf', 'pdf', 'source-old', '2026-08-02T00:00:00Z'),
    row('artifact_200_new_html', 'html', 'source-new', '2026-08-02T00:00:00Z'),
    row('artifact_201_new_pdf', 'pdf', 'source-new', '2026-08-02T00:00:00Z'),
    {
      ...row('artifact_300_book_html', 'html', 'chapter-1', '2026-08-03T00:00:00Z'),
      metadata_json: JSON.stringify({ recommendation_id: 'rec-1', role: 'html', pair_id: 'chapter-1', scope: 'book' }),
    },
    {
      ...row('artifact_301_book_pdf', 'pdf', 'chapter-1', '2026-08-03T00:00:00Z'),
      metadata_json: JSON.stringify({ recommendation_id: 'rec-1', role: 'pdf', pair_id: 'chapter-1', scope: 'book' }),
    },
  ])

  assert.equal(selected.get('rec-1')?.html?.id, 'artifact_200_new_html')
  assert.equal(selected.get('rec-1')?.pdf?.id, 'artifact_201_new_pdf')
})

test('Legacy media type wins over a misleading word in the filename', () => {
  const metadata = (pairId: string) => JSON.stringify({ recommendation_id: 'rec-1', pair_id: pairId })
  const selected = selectLearningSourceRenditions([
    {
      id: 'artifact_400_html',
      filename: 'pdf-notes.html',
      media_type: 'text/html; charset=utf-8',
      metadata_json: metadata('source-media'),
    },
    {
      id: 'artifact_401_pdf',
      filename: 'html-guide.pdf',
      media_type: 'application/pdf',
      metadata_json: metadata('source-media'),
    },
  ])

  assert.equal(selected.get('rec-1')?.html?.id, 'artifact_400_html')
  assert.equal(selected.get('rec-1')?.pdf?.id, 'artifact_401_pdf')
})

test('v4 companions stay hidden until the complete validated pair is ready', () => {
  const v4 = (id: string, role: 'html' | 'pdf', publicationState: string) => ({
    ...row(id, role, 'lv-source-v4', '2026-08-21T00:00:00Z'),
    metadata_json: JSON.stringify({
      recommendation_id: 'rec-1',
      pair_id: 'lv-source-v4',
      role,
      generator: 'lite-visual',
      workflow_contract: 'lite-visual-linear/v4',
      asset_policy: 'code-only',
      publication_state: publicationState,
      validation_status: publicationState === 'ready' ? 'passed' : 'pending',
    }),
  })
  assert.equal(
    selectLearningSourceRenditions([v4('staged-html', 'html', 'staged'), v4('staged-pdf', 'pdf', 'staged')]).has(
      'rec-1',
    ),
    false,
  )
  const ready = selectLearningSourceRenditions([v4('ready-html', 'html', 'ready'), v4('ready-pdf', 'pdf', 'ready')])
  assert.equal(ready.get('rec-1')?.html?.id, 'ready-html')
  assert.equal(ready.get('rec-1')?.pdf?.id, 'ready-pdf')
})
