import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNotebookLearningPlan,
  reduceNotebookLearningReceipts,
  summarizeNotebookLearningState,
  validateNotebookLearningReceipt,
  type NotebookArtifactReceiptInput,
} from '../../src/services/notebooklm-learning.ts'

const notebookUrl = 'https://notebook.google.com/notebook/notebook-123'

test('NotebookLM learning defaults to one hard source-grounded quiz', () => {
  const plan = buildNotebookLearningPlan({ recommendation_id: 'rec-1' })
  assert.deepEqual(plan.selected_formats, ['quiz'])
  assert.equal(plan.default_artifact, 'quiz')
  assert.deepEqual(plan.requirements.quiz, {
    source_grounded: true,
    difficulty: 'hard',
    question_count_min: 5,
    question_count_max: 8,
    hints_before_explanations: true,
    transfer_question_count_min: 1,
  })
})

test('NotebookLM learning routes Arabic audio and rich media only when they fit', () => {
  const review = buildNotebookLearningPlan({
    recommendation_id: 'rec-1',
    purpose: 'review',
    requested_formats: ['audio', 'mindmap', 'infographic', 'video'],
    concept_features: ['hierarchy', 'comparison'],
  })
  assert.deepEqual(review.selected_formats, ['audio', 'mind-map', 'infographic'])
  assert.equal(review.requirements.audio.language, 'ar_eg')
  assert.ok(
    review.rejected_formats.some(
      (item) => item.format === 'video' && item.reason.includes('no matching concept feature'),
    ),
  )

  const learn = buildNotebookLearningPlan({ recommendation_id: 'rec-1', requested_formats: ['audio'] })
  assert.deepEqual(learn.selected_formats, ['quiz'])
  assert.match(learn.rejected_formats[0].reason, /orientation or review/)
})

test('NotebookLM learning never generates a modality catalogue', () => {
  const plan = buildNotebookLearningPlan({
    recommendation_id: 'rec-1',
    purpose: 'presentation',
    requested_formats: ['quiz', 'mind-map', 'infographic', 'slide-deck', 'video', 'data-table', 'report'],
    concept_features: ['hierarchy', 'mechanism', 'demonstration', 'data'],
  })
  assert.equal(plan.selected_formats.length, 3)
  assert.deepEqual(plan.selected_formats, ['quiz', 'mind-map', 'infographic'])
  assert.ok(plan.rejected_formats.some((item) => item.reason.includes('at most three')))
})

test('NotebookLM source receipts distinguish pending, indexed, and failed truth', () => {
  assert.equal(
    validateNotebookLearningReceipt({
      kind: 'source',
      recommendation_id: 'rec-1',
      notebook_id: 'notebook-123',
      notebook_url: notebookUrl,
      status: 'pending',
    }).ok,
    true,
  )
  const indexed = validateNotebookLearningReceipt({
    kind: 'source',
    recommendation_id: 'rec-1',
    notebook_id: 'notebook-123',
    notebook_url: notebookUrl,
    status: 'indexed',
  })
  assert.equal(indexed.ok, false)
  assert.ok(indexed.failures.includes('provider_source_id is required when source status is indexed'))
  const failed = validateNotebookLearningReceipt({
    kind: 'source',
    recommendation_id: 'rec-1',
    notebook_id: 'notebook-123',
    notebook_url: notebookUrl,
    status: 'failed',
  })
  assert.equal(failed.ok, false)
  assert.ok(failed.failures.includes('error is required when source status is failed'))
  assert.equal(
    validateNotebookLearningReceipt({
      kind: 'source',
      recommendation_id: 'rec-1',
      notebook_id: 'notebook-123',
      notebook_url: 'https://notebooklm.google.com/notebook/notebook-123',
      status: 'pending',
    }).ok,
    true,
  )
})

test('NotebookLM artifact receipts cannot claim ready before the learning contract is verified', () => {
  const plan = buildNotebookLearningPlan({ recommendation_id: 'rec-1' })
  const pending: NotebookArtifactReceiptInput = {
    kind: 'artifact',
    recommendation_id: 'rec-1',
    notebook_id: 'notebook-123',
    notebook_url: notebookUrl,
    plan_id: 'plan-1',
    format: 'quiz',
    status: 'pending',
    provider_task_id: 'task-1',
    source_grounded: true,
    custom_prompt_applied: true,
  }
  assert.equal(validateNotebookLearningReceipt(pending, plan).ok, true)

  const incompleteReady = validateNotebookLearningReceipt(
    {
      ...pending,
      status: 'ready',
      provider_task_id: undefined,
      provider_artifact_id: 'artifact-1',
      question_count: 4,
      hints_before_explanations: false,
      transfer_question_count: 0,
    },
    plan,
  )
  assert.equal(incompleteReady.ok, false)
  assert.ok(incompleteReady.failures.includes('ready quiz must contain 5 to 8 questions'))
  assert.ok(incompleteReady.failures.includes('ready quiz must provide hints before explanations'))
  assert.ok(incompleteReady.failures.includes('ready quiz must contain at least one transfer question'))

  const ready = validateNotebookLearningReceipt(
    {
      ...pending,
      status: 'ready',
      provider_task_id: undefined,
      provider_artifact_id: 'artifact-1',
      question_count: 7,
      hints_before_explanations: true,
      transfer_question_count: 1,
    },
    plan,
  )
  assert.equal(ready.ok, true)
})

test('NotebookLM receipts reject formats outside their plan and non-Arabic audio', () => {
  const plan = buildNotebookLearningPlan({ recommendation_id: 'rec-1' })
  const video = validateNotebookLearningReceipt(
    {
      kind: 'artifact',
      recommendation_id: 'rec-1',
      notebook_id: 'notebook-123',
      notebook_url: notebookUrl,
      plan_id: 'plan-1',
      format: 'video',
      status: 'pending',
      provider_task_id: 'task-1',
      source_grounded: true,
      custom_prompt_applied: true,
    },
    plan,
  )
  assert.equal(video.ok, false)
  assert.ok(video.failures.includes('format is not selected by the learning output plan'))

  const audioPlan = buildNotebookLearningPlan({
    recommendation_id: 'rec-1',
    purpose: 'review',
    requested_formats: ['audio'],
  })
  const audio = validateNotebookLearningReceipt(
    {
      kind: 'artifact',
      recommendation_id: 'rec-1',
      notebook_id: 'notebook-123',
      notebook_url: notebookUrl,
      plan_id: 'plan-2',
      format: 'audio',
      status: 'pending',
      provider_task_id: 'task-2',
      source_grounded: true,
      custom_prompt_applied: true,
      language: 'ar',
    },
    audioPlan,
  )
  assert.equal(audio.ok, false)
  assert.ok(audio.failures.includes('NotebookLM learning audio must use language ar_eg'))
})

test('NotebookLM receipt reducer exposes one reusable source-level status for Thread reads', () => {
  const row = (id: string, intent: string, payload: Record<string, unknown>, createdAt: string) => ({
    id,
    intent,
    status_code: 200,
    verified: 1,
    receipt_json: JSON.stringify(payload),
    created_at: createdAt,
  })
  const state = reduceNotebookLearningReceipts(
    [
      row(
        'artifact-new',
        'notebooklm_artifact_receipt',
        { plan_id: 'plan-new', format: 'quiz', status: 'pending' },
        '2026-08-20 12:04:00',
      ),
      row(
        'plan-new',
        'notebooklm_learning_plan',
        { source_receipt_id: 'source-indexed', plan: { selected_formats: ['quiz'] } },
        '2026-08-20 12:03:00',
      ),
      row(
        'source-indexed',
        'notebooklm_source_receipt',
        { notebook_url: notebookUrl, status: 'indexed' },
        '2026-08-20 12:02:00',
      ),
      row(
        'artifact-old',
        'notebooklm_artifact_receipt',
        { plan_id: 'plan-old', format: 'quiz', status: 'ready' },
        '2026-08-20 11:00:00',
      ),
    ],
    notebookUrl,
  )
  assert.equal(state.linked, true)
  assert.equal(state.indexed, true)
  assert.equal(state.index_status, 'indexed')
  assert.equal(state.primary_format, 'quiz')
  assert.equal(state.output_status, 'pending')
  assert.deepEqual(state.outputs, [{ format: 'quiz', status: 'pending', receipt_id: 'artifact-new' }])
  assert.deepEqual(summarizeNotebookLearningState(state), {
    linked: true,
    indexed: true,
    index_status: 'indexed',
    output_status: 'pending',
    primary_format: 'quiz',
    outputs: [{ format: 'quiz', status: 'pending' }],
  })
  assert.equal('receipts' in summarizeNotebookLearningState(state), false)
})

test('NotebookLM receipt reducer hides outputs built from a superseded source index', () => {
  const row = (id: string, intent: string, payload: Record<string, unknown>, createdAt: string) => ({
    id,
    intent,
    status_code: 200,
    verified: 1,
    receipt_json: JSON.stringify(payload),
    created_at: createdAt,
  })
  const state = reduceNotebookLearningReceipts(
    [
      row(
        'source-new',
        'notebooklm_source_receipt',
        { notebook_url: notebookUrl, status: 'indexed' },
        '2026-08-20 12:05:00',
      ),
      row(
        'artifact-old',
        'notebooklm_artifact_receipt',
        { plan_id: 'plan-old', format: 'quiz', status: 'ready' },
        '2026-08-20 12:04:00',
      ),
      row(
        'plan-old',
        'notebooklm_learning_plan',
        { source_receipt_id: 'source-old', plan: { selected_formats: ['quiz'] } },
        '2026-08-20 12:03:00',
      ),
      row(
        'source-old',
        'notebooklm_source_receipt',
        { notebook_url: notebookUrl, status: 'indexed' },
        '2026-08-20 12:02:00',
      ),
    ],
    notebookUrl,
  )

  assert.equal(state.indexed, true)
  assert.equal(state.plan, null)
  assert.equal(state.primary_format, null)
  assert.equal(state.output_status, 'none')
  assert.deepEqual(state.outputs, [])
})

test('NotebookLM receipt reducer never carries ready output across a notebook URL change', () => {
  const oldNotebookUrl = 'https://notebook.google.com/notebook/notebook-old'
  const row = (id: string, intent: string, payload: Record<string, unknown>, createdAt: string) => ({
    id,
    intent,
    status_code: 200,
    verified: 1,
    receipt_json: JSON.stringify(payload),
    created_at: createdAt,
  })
  const state = reduceNotebookLearningReceipts(
    [
      row(
        'artifact-old',
        'notebooklm_artifact_receipt',
        { plan_id: 'plan-old', format: 'quiz', status: 'ready' },
        '2026-08-20 12:04:00',
      ),
      row(
        'plan-old',
        'notebooklm_learning_plan',
        { source_receipt_id: 'source-old', plan: { selected_formats: ['quiz'] } },
        '2026-08-20 12:03:00',
      ),
      row(
        'source-old',
        'notebooklm_source_receipt',
        { notebook_url: oldNotebookUrl, status: 'indexed' },
        '2026-08-20 12:02:00',
      ),
    ],
    notebookUrl,
  )

  assert.equal(state.linked, true)
  assert.equal(state.indexed, false)
  assert.equal(state.index_status, 'linked')
  assert.equal(state.plan, null)
  assert.equal(state.output_status, 'none')
  assert.deepEqual(state.outputs, [])
})

test('NotebookLM receipt reducer keeps ledger identity canonical', () => {
  const state = reduceNotebookLearningReceipts(
    [
      {
        id: 'source-real',
        intent: 'notebooklm_source_receipt',
        status_code: 200,
        verified: 1,
        created_at: '2026-08-20 12:00:00',
        receipt_json: JSON.stringify({
          id: 'source-fake',
          intent: 'notebooklm_artifact_receipt',
          status_code: 418,
          verified: false,
          created_at: '2099-01-01 00:00:00',
          notebook_url: notebookUrl,
          status: 'indexed',
        }),
      },
    ],
    notebookUrl,
  )

  assert.equal(state.source?.id, 'source-real')
  assert.equal(state.source?.intent, 'notebooklm_source_receipt')
  assert.equal(state.source?.status_code, 200)
  assert.equal(state.source?.verified, true)
  assert.equal(state.source?.created_at, '2026-08-20 12:00:00')
})

test('NotebookLM receipt reducer never labels one format with another output status', () => {
  const row = (id: string, intent: string, payload: Record<string, unknown>, createdAt: string) => ({
    id,
    intent,
    status_code: 200,
    verified: 1,
    receipt_json: JSON.stringify(payload),
    created_at: createdAt,
  })
  const state = reduceNotebookLearningReceipts(
    [
      row(
        'artifact-audio',
        'notebooklm_artifact_receipt',
        { plan_id: 'plan-multi', format: 'audio', status: 'ready' },
        '2026-08-20 12:04:00',
      ),
      row(
        'plan-multi',
        'notebooklm_learning_plan',
        { source_receipt_id: 'source-indexed', plan: { selected_formats: ['quiz', 'audio'] } },
        '2026-08-20 12:03:00',
      ),
      row(
        'source-indexed',
        'notebooklm_source_receipt',
        { notebook_url: notebookUrl, status: 'indexed' },
        '2026-08-20 12:02:00',
      ),
    ],
    notebookUrl,
  )

  assert.equal(state.primary_format, 'audio')
  assert.equal(state.output_status, 'ready')
  assert.deepEqual(state.outputs, [{ format: 'audio', status: 'ready', receipt_id: 'artifact-audio' }])
})
