import { Hono } from 'hono'
import { Bindings } from '../lib'
import {
  NOTEBOOKLM_LEARNING_CONTRACT,
  buildNotebookLearningPlan,
  loadNotebookLearningState,
  notebookLearningTarget,
  normalizeNotebookLearningFormat,
  validateNotebookLearningReceipt,
  type NotebookLearningPlan,
  type NotebookLearningReceiptInput,
} from '../services/notebooklm-learning'

const app = new Hono<{ Bindings: Bindings }>()

type BrokerHealth = {
  status: 'online' | 'stale' | 'offline'
  grounding_status: 'grounded' | 'fallback' | 'offline'
  fallback_reason: string | null
  last_heartbeat_at: string | null
  last_grounded_at: string | null
  last_fallback_at: string | null
  consecutive_failures: number
  recovery_count: number
  session_id: string | null
  session_mode: string | null
  stale_after_seconds: number
  broker_required: boolean
}

async function brokerHealth(DB: D1Database): Promise<BrokerHealth> {
  const row = await DB.prepare("SELECT value FROM kv_store WHERE key='notebooklm.broker.health'")
    .first<{ value: string }>()
    .catch(() => null)
  let saved: any = {}
  try {
    saved = JSON.parse(row?.value || '{}')
  } catch {}
  const heartbeat = saved.last_heartbeat_at || null
  const age = heartbeat ? Math.max(0, (Date.now() - Date.parse(heartbeat)) / 1000) : Infinity
  const staleAfter = Number(saved.stale_after_seconds || 900)
  const status = !heartbeat ? 'offline' : age > staleAfter ? 'stale' : 'online'
  return {
    status,
    grounding_status: status === 'offline' ? 'offline' : saved.grounding_status || 'fallback',
    fallback_reason: saved.fallback_reason || (status === 'offline' ? 'No broker heartbeat has been received.' : null),
    last_heartbeat_at: heartbeat,
    last_grounded_at: saved.last_grounded_at || null,
    last_fallback_at: saved.last_fallback_at || null,
    consecutive_failures: Number(saved.consecutive_failures || 0),
    recovery_count: Number(saved.recovery_count || 0),
    session_id: saved.session_id || null,
    session_mode: saved.session_mode || null,
    stale_after_seconds: staleAfter,
    broker_required: true,
  }
}

async function saveHealth(DB: D1Database, patch: Record<string, unknown>) {
  const current = await brokerHealth(DB)
  const value = { ...current, ...patch, updated_at: new Date().toISOString() }
  await DB.prepare("INSERT OR REPLACE INTO kv_store (key,value) VALUES ('notebooklm.broker.health',?)")
    .bind(JSON.stringify(value))
    .run()
  return value
}

async function notebookRecommendation(DB: D1Database, recommendationId: string) {
  return DB.prepare('SELECT id,video_title,notebook_url FROM recommendations WHERE id=?')
    .bind(recommendationId)
    .first<{ id: string; video_title: string; notebook_url: string | null }>()
}

async function storeLearningReceipt(
  DB: D1Database,
  intent: string,
  recommendationId: string,
  receipt: Record<string, unknown>,
  agentName: string,
) {
  const id = `receipt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const providerStatus = String(receipt.status || '')
  const statusCode = providerStatus === 'pending' ? 202 : providerStatus === 'failed' ? 502 : 200
  const verified = providerStatus === 'indexed' || providerStatus === 'ready' || intent === 'notebooklm_learning_plan'
  await DB.prepare(
    `INSERT INTO agent_receipts (id,request_id,agent_name,intent,target,status_code,verified,receipt_json)
    VALUES (?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      String(receipt.provider_task_id || receipt.provider_source_id || id).slice(0, 200),
      agentName.slice(0, 120),
      intent,
      notebookLearningTarget(recommendationId),
      statusCode,
      verified ? 1 : 0,
      JSON.stringify({ contract_version: NOTEBOOKLM_LEARNING_CONTRACT, ...receipt }),
    )
    .run()
  return id
}

app.get('/health', async (c) => c.json(await brokerHealth(c.env.DB)))

// Hermes host-side broker posts a heartbeat; the Worker never pretends to own the browser session.
app.post('/health', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const grounding = ['grounded', 'fallback', 'offline'].includes(body.grounding_status)
    ? body.grounding_status
    : 'fallback'
  const previous = await brokerHealth(c.env.DB)
  const now = new Date().toISOString()
  const health = await saveHealth(c.env.DB, {
    status: 'online',
    grounding_status: grounding,
    fallback_reason: body.fallback_reason || null,
    last_heartbeat_at: now,
    last_grounded_at: grounding === 'grounded' ? now : previous.last_grounded_at,
    last_fallback_at: grounding === 'fallback' ? now : previous.last_fallback_at,
    consecutive_failures: grounding === 'grounded' ? 0 : previous.consecutive_failures + 1,
    session_id: body.session_id ? String(body.session_id).slice(0, 200) : previous.session_id,
    session_mode: body.session_mode ? String(body.session_mode).slice(0, 80) : previous.session_mode,
    stale_after_seconds: Math.max(60, Math.min(3600, Number(body.stale_after_seconds || previous.stale_after_seconds))),
  })
  return c.json({ ok: true, health })
})

app.post('/recover', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const current = await brokerHealth(c.env.DB)
  const health = await saveHealth(c.env.DB, {
    recovery_count: current.recovery_count + 1,
    fallback_reason: body.reason ? String(body.reason).slice(0, 500) : 'Session recovery requested by Hermes.',
    session_id: body.new_session_id ? String(body.new_session_id).slice(0, 200) : current.session_id,
    session_mode: body.session_mode ? String(body.session_mode).slice(0, 80) : 'recovery_requested',
    last_heartbeat_at: new Date().toISOString(),
  })
  return c.json({
    ok: true,
    recovery_requested: true,
    worker_receipt: health,
    message: 'Worker recorded recovery; the Hermes host must restart or re-authenticate the broker session.',
  })
})

app.get('/learning/receipts', async (c) => {
  const recommendationId = String(c.req.query('recommendation_id') || '').trim()
  if (!recommendationId) return c.json({ error: 'recommendation_id required' }, 400)
  const recommendation = await notebookRecommendation(c.env.DB, recommendationId)
  if (!recommendation) return c.json({ error: 'recommendation not found' }, 404)
  const state = await loadNotebookLearningState(c.env.DB, recommendationId, recommendation.notebook_url)
  return c.json({
    contract_version: NOTEBOOKLM_LEARNING_CONTRACT,
    recommendation_id: recommendationId,
    notebook_url: recommendation.notebook_url || null,
    linked: state.linked,
    indexed: state.indexed,
    index_status: state.index_status,
    output_status: state.output_status,
    primary_format: state.primary_format,
    outputs: state.outputs,
    source: state.source,
    plan: state.plan,
    artifacts: state.artifacts,
  })
})

app.post('/learning/route', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const recommendationId = String(body.recommendation_id || '').trim()
  if (!recommendationId) return c.json({ error: 'recommendation_id required' }, 400)
  const recommendation = await notebookRecommendation(c.env.DB, recommendationId)
  if (!recommendation) return c.json({ error: 'recommendation not found' }, 404)
  if (!recommendation.notebook_url)
    return c.json(
      {
        error: 'notebook_url_not_linked',
        message: 'Persist and verify the source-specific NotebookLM URL before routing Studio work.',
      },
      409,
    )
  const state = await loadNotebookLearningState(c.env.DB, recommendationId, recommendation.notebook_url)
  if (state.source?.status !== 'indexed')
    return c.json(
      {
        error: 'source_not_indexed',
        source_status: state.source?.status || null,
        message: 'Record an indexed source receipt before routing Studio work.',
      },
      409,
    )
  if (state.source.notebook_url !== recommendation.notebook_url)
    return c.json(
      {
        error: 'notebook_url_mismatch',
        message: 'The indexed source receipt does not match the canonical recommendation notebook URL.',
      },
      409,
    )
  let plan: NotebookLearningPlan
  try {
    plan = buildNotebookLearningPlan({
      recommendation_id: recommendationId,
      purpose: body.purpose,
      requested_formats: body.requested_formats,
      concept_features: body.concept_features,
    })
  } catch (error: any) {
    return c.json(
      { error: 'invalid_learning_route', message: error?.message || 'Invalid NotebookLM learning route.' },
      422,
    )
  }
  const planId = await storeLearningReceipt(
    c.env.DB,
    'notebooklm_learning_plan',
    recommendationId,
    {
      recommendation_id: recommendationId,
      notebook_id: state.source.notebook_id,
      notebook_url: recommendation.notebook_url,
      source_receipt_id: state.source.id,
      plan,
    },
    c.req.header('x-agent-name') || 'notebooklm',
  )
  return c.json({ ok: true, plan_id: planId, ...plan }, 201)
})

app.post('/learning/receipts', async (c) => {
  const body = (await c.req.json<any>().catch(() => ({}))) as NotebookLearningReceiptInput
  if (body.kind !== 'source' && body.kind !== 'artifact')
    return c.json({ error: 'kind must be source or artifact' }, 400)
  const recommendationId = String(body.recommendation_id || '').trim()
  if (!recommendationId) return c.json({ error: 'recommendation_id required' }, 400)
  const recommendation = await notebookRecommendation(c.env.DB, recommendationId)
  if (!recommendation) return c.json({ error: 'recommendation not found' }, 404)
  if (!recommendation.notebook_url)
    return c.json(
      {
        error: 'notebook_url_not_linked',
        message: 'Persist the source-specific NotebookLM URL before recording provider receipts.',
      },
      409,
    )
  if (String(body.notebook_url || '').trim() !== recommendation.notebook_url)
    return c.json(
      {
        error: 'notebook_url_mismatch',
        message: 'Receipt notebook_url must match the canonical recommendation notebook URL.',
      },
      409,
    )

  const state = await loadNotebookLearningState(c.env.DB, recommendationId, recommendation.notebook_url)
  let plan: NotebookLearningPlan | undefined
  if (body.kind === 'artifact') {
    const planReceipt = state.plan?.id === body.plan_id ? state.plan : null
    plan = planReceipt?.plan as NotebookLearningPlan | undefined
    if (!plan)
      return c.json(
        { error: 'learning_plan_not_current', message: 'Route a new plan from the latest indexed source receipt.' },
        409,
      )
    if (state.source?.status !== 'indexed')
      return c.json({ error: 'source_not_indexed', source_status: state.source?.status || null }, 409)
  }
  const validation = validateNotebookLearningReceipt(body, plan)
  if (!validation.ok)
    return c.json({ error: 'invalid_notebooklm_learning_receipt', failures: validation.failures }, 422)

  const normalized = body.kind === 'artifact' ? normalizeNotebookLearningFormat(body.format) : null
  if (body.kind === 'artifact' && (body.status === 'ready' || body.status === 'failed')) {
    const previous = normalized ? state.artifacts[normalized] : null
    if (!previous || previous.plan_id !== body.plan_id || previous.status !== 'pending') {
      return c.json(
        {
          error: 'artifact_lifecycle_conflict',
          message: 'A ready or failed receipt must follow the pending submission receipt for the same plan and format.',
        },
        409,
      )
    }
  }
  const allowedFields =
    body.kind === 'source'
      ? [
          'kind',
          'recommendation_id',
          'notebook_id',
          'notebook_url',
          'status',
          'provider_source_id',
          'evidence',
          'error',
        ]
      : [
          'kind',
          'recommendation_id',
          'notebook_id',
          'notebook_url',
          'plan_id',
          'format',
          'status',
          'provider_task_id',
          'provider_artifact_id',
          'published_artifact_id',
          'source_grounded',
          'custom_prompt_applied',
          'language',
          'question_count',
          'hints_before_explanations',
          'transfer_question_count',
          'error',
        ]
  const receipt: Record<string, unknown> = {
    ...Object.fromEntries(
      allowedFields
        .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
        .map((field) => [field, (body as any)[field]]),
    ),
    recommendation_id: recommendationId,
    notebook_id: String(body.notebook_id || '').trim(),
    notebook_url: recommendation.notebook_url,
    ...(normalized ? { format: normalized } : {}),
    observed_at: new Date().toISOString(),
  }
  const intent = body.kind === 'source' ? 'notebooklm_source_receipt' : 'notebooklm_artifact_receipt'
  const receiptId = await storeLearningReceipt(
    c.env.DB,
    intent,
    recommendationId,
    receipt,
    c.req.header('x-agent-name') || 'notebooklm',
  )
  return c.json({ ok: true, receipt_id: receiptId, receipt: { id: receiptId, ...receipt } }, 201)
})

app.get('/status', async (c) => {
  const db = c.env.DB

  // Calculate live stats from D1
  let masteredCount = 0
  let reflectionsCount = 0
  let treeNodeCount = 0
  let rawSourcesCount = 0
  try {
    masteredCount = Number((await db.prepare('SELECT COUNT(*) count FROM mastered').first<any>())?.count || 0)
  } catch {}
  try {
    reflectionsCount = Number(
      (await db.prepare("SELECT COUNT(*) count FROM notes WHERE kind='reflection'").first<any>())?.count || 0,
    )
  } catch {}
  try {
    treeNodeCount = Number((await db.prepare('SELECT COUNT(*) count FROM tree_nodes').first<any>())?.count || 0)
  } catch {}
  try {
    rawSourcesCount = Number(
      (
        await db
          .prepare("SELECT COUNT(*) count FROM recommendations WHERE video_url IS NOT NULL AND video_url!=''")
          .first<any>()
      )?.count || 0,
    )
  } catch {}
  const broker = await brokerHealth(db)

  return c.json({
    notebook_id: '2c8a58a9-32b8-45db-804f-b48bf756e82c',
    notebook_url: 'https://notebook.google.com/notebook/2c8a58a9-32b8-45db-804f-b48bf756e82c',
    name: 'Mahmood — Complete Knowledge Corpus',
    status: 'active',
    subscription: 'pro',
    persona_role: 'Mahmood Taste Strategist Role',
    verification_engine: 'Dialectic Divergence Optimization (Zero-Hallucination)',
    sync_mode: 'hermes_feedback_resolution',
    generation_mode: 'on_demand_chat_only',
    learning_router_mode: 'explicit_source_grounded_learning_router',
    learning_output_policy: {
      contract_version: NOTEBOOKLM_LEARNING_CONTRACT,
      default: 'quiz',
      maximum_outputs_per_plan: 3,
      receipts: ['indexed', 'pending', 'ready', 'failed'],
    },
    stats: {
      mastered_items_synced: masteredCount,
      user_reflections_synced: reflectionsCount,
      taste_tree_nodes: treeNodeCount,
      raw_sources_cleaned: rawSourcesCount,
    },
    broker,
    supported_studio_types: [
      {
        type: 'audio',
        label: 'Audio Overview (Podcast M4A)',
        description: 'AI host dialogue deep-dive podcast overview',
      },
      { type: 'mindmap', label: 'Mind Map (PDF/PNG)', description: 'Visual concept node & edge graph' },
      { type: 'slides', label: 'Slide Deck (PPTX/PDF)', description: 'Grounded presentation deck' },
      { type: 'infographic', label: 'Infographic (PDF)', description: 'High-density visual summary poster' },
      { type: 'data', label: 'Data Table', description: 'Structured comparative empirical matrix' },
      { type: 'report', label: 'Synthesis Report', description: 'Comprehensive continuous thesis document' },
      { type: 'flashcards', label: 'Flashcards', description: 'Source-grounded recall cards' },
      { type: 'quiz', label: 'Quiz', description: 'Source-grounded knowledge check' },
      { type: 'video', label: 'Video Overview', description: 'Source-grounded visual overview' },
    ],
  })
})

export default app
