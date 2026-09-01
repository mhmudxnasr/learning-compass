import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSourceMaterialLauncher } from '../../client/src/workspaces/learn/sourceMaterials.ts'

test('Lesson launcher honors a stored recommended start and keeps other formats as alternatives', () => {
  const launcher = buildSourceMaterialLauncher({
    recommendation_id: 'source_1',
    video_url: 'https://example.com/original',
    content_type: 'video',
    notebook_url: 'https://notebooklm.google.com/notebook/example',
    artifacts: {
      html: {
        id: 'html_1',
        filename: 'companion.html',
        size_bytes: 48_500,
        metadata: {
          recommended_start: 'html',
          revision: '4',
          language: 'ar',
          workflow_contract: 'lite-visual-linear/v4',
          validation_status: 'passed',
        },
      },
      pdf: {
        id: 'pdf_1',
        filename: 'companion.pdf',
        size_bytes: 1_500_000,
        metadata: {
          recommended_start: 'html',
          revision: '4',
          language: 'ar',
          page_count: 24,
          workflow_contract: 'lite-visual-linear/v4',
          validation_status: 'passed',
        },
      },
    },
  })

  assert.equal(launcher?.primary.kind, 'html')
  assert.equal(launcher?.explicitlyRecommended, true)
  assert.equal(launcher?.primary.href, '/artifacts/html_1')
  assert.deepEqual(launcher?.primary.details, ['47 KB', 'Arabic', 'Revision 4', 'Verified pair'])
  assert.equal(launcher?.primary.purpose, 'Read the complete Arabic companion in your browser.')
  assert.deepEqual(
    launcher?.alternatives.map((material) => material.kind),
    ['original', 'pdf', 'notebooklm'],
  )
  assert.deepEqual(launcher?.alternatives[1].details, ['24 pages', '1.4 MB', 'Arabic', 'Revision 4', 'Verified pair'])
  assert.equal(launcher?.alternatives[1].purpose, 'Read or annotate the exact A4 print edition on a tablet.')
})

test('Lesson launcher reads legacy metadata JSON without exposing an unavailable recommendation', () => {
  const launcher = buildSourceMaterialLauncher({
    recommendation_id: 'source_2',
    video_url: 'https://example.com/article',
    content_type: 'article',
    artifacts: {
      html: {
        id: 'html_2',
        filename: 'article.html',
        metadata_json: JSON.stringify({ recommended_start: 'pdf' }),
      },
    },
  })

  assert.equal(launcher?.primary.kind, 'html')
  assert.equal(launcher?.explicitlyRecommended, false)
  assert.equal(launcher?.primary.availability, 'Saved')
  assert.equal(launcher?.alternatives[0].purpose, 'Read at the original source.')
})

test('Lesson launcher falls back to the original and returns no fake option when no link exists', () => {
  const original = buildSourceMaterialLauncher({
    recommendation_id: 'source_3',
    video_url: 'https://example.com/source',
  })
  assert.equal(original?.primary.kind, 'original')
  assert.equal(original?.alternatives.length, 0)
  assert.equal(buildSourceMaterialLauncher({ recommendation_id: 'source_4' }), null)
})

test('Lesson launcher exposes verified NotebookLM learning state instead of treating every link as ready', () => {
  const launcher = buildSourceMaterialLauncher({
    recommendation_id: 'source_5',
    notebook_url: 'https://notebook.google.com/notebook/example',
    notebook_learning: {
      linked: true,
      indexed: true,
      index_status: 'indexed',
      output_status: 'ready',
      primary_format: 'quiz',
      outputs: [{ format: 'quiz', status: 'ready' }],
    },
  })

  assert.equal(launcher?.primary.kind, 'notebooklm')
  assert.equal(launcher?.primary.availability, 'Ready')
  assert.equal(launcher?.primary.purpose, 'Open the Quiz made from this source.')
  assert.deepEqual(launcher?.primary.details, ['Quiz'])
})

test('Lesson launcher does not lead with NotebookLM before its learning material is usable', () => {
  const launcher = buildSourceMaterialLauncher({
    recommendation_id: 'source_6',
    video_url: 'https://example.com/original',
    notebook_url: 'https://notebook.google.com/notebook/example',
    notebook_learning: {
      linked: true,
      indexed: false,
      index_status: 'pending',
      output_status: 'none',
      primary_format: null,
      outputs: [],
    },
    artifacts: {
      html: {
        id: 'html_6',
        filename: 'companion.html',
        metadata: { recommended_start: 'notebooklm' },
      },
    },
  })

  assert.equal(launcher?.primary.kind, 'html')
  assert.equal(launcher?.explicitlyRecommended, false)
  assert.equal(launcher?.alternatives.find((option) => option.kind === 'notebooklm')?.availability, 'Indexing')
})
