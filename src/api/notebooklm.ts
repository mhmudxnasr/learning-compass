import { Hono } from 'hono'
import { Bindings } from '../lib'

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
  const row = await DB.prepare("SELECT value FROM kv_store WHERE key='notebooklm.broker.health'").first<{ value: string }>().catch(() => null)
  let saved: any = {}
  try { saved = JSON.parse(row?.value || '{}') } catch {}
  const heartbeat = saved.last_heartbeat_at || null
  const age = heartbeat ? Math.max(0, (Date.now() - Date.parse(heartbeat)) / 1000) : Infinity
  const staleAfter = Number(saved.stale_after_seconds || 900)
  const status = !heartbeat ? 'offline' : age > staleAfter ? 'stale' : 'online'
  return {
    status,
    grounding_status: status === 'offline' ? 'offline' : (saved.grounding_status || 'fallback'),
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
  await DB.prepare("INSERT OR REPLACE INTO kv_store (key,value) VALUES ('notebooklm.broker.health',?)").bind(JSON.stringify(value)).run()
  return value
}

app.get('/health', async (c) => c.json(await brokerHealth(c.env.DB)))

// Hermes host-side broker posts a heartbeat; the Worker never pretends to own the browser session.
app.post('/health', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const grounding = ['grounded', 'fallback', 'offline'].includes(body.grounding_status) ? body.grounding_status : 'fallback'
  const previous = await brokerHealth(c.env.DB)
  const now = new Date().toISOString()
  const health = await saveHealth(c.env.DB, {
    status: 'online', grounding_status: grounding, fallback_reason: body.fallback_reason || null,
    last_heartbeat_at: now, last_grounded_at: grounding === 'grounded' ? now : previous.last_grounded_at,
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
  return c.json({ ok: true, recovery_requested: true, worker_receipt: health, message: 'Worker recorded recovery; the Hermes host must restart or re-authenticate the broker session.' })
})

app.get('/status', async (c) => {
  const db = c.env.DB
  
  // Calculate live stats from D1
  let masteredCount = 0
  let reflectionsCount = 0
  let treeNodeCount = 0
  let rawSourcesCount = 0
  try { masteredCount = Number((await db.prepare('SELECT COUNT(*) count FROM mastered').first<any>())?.count || 0) } catch {}
  try { reflectionsCount = Number((await db.prepare("SELECT COUNT(*) count FROM notes WHERE kind='reflection'").first<any>())?.count || 0) } catch {}
  try { treeNodeCount = Number((await db.prepare('SELECT COUNT(*) count FROM tree_nodes').first<any>())?.count || 0) } catch {}
  try { rawSourcesCount = Number((await db.prepare("SELECT COUNT(*) count FROM recommendations WHERE video_url IS NOT NULL AND video_url!=''").first<any>())?.count || 0) } catch {}
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
    stats: {
      mastered_items_synced: masteredCount,
      user_reflections_synced: reflectionsCount,
      taste_tree_nodes: treeNodeCount,
      raw_sources_cleaned: rawSourcesCount,
    },
    broker,
    supported_studio_types: [
      { type: 'audio', label: 'Audio Overview (Podcast M4A)', description: 'AI host dialogue deep-dive podcast overview' },
      { type: 'mindmap', label: 'Mind Map (PDF/PNG)', description: 'Visual concept node & edge graph' },
      { type: 'slides', label: 'Slide Deck (PPTX/PDF)', description: 'Grounded presentation deck' },
      { type: 'infographic', label: 'Infographic (PDF)', description: 'High-density visual summary poster' },
      { type: 'data', label: 'Data Table', description: 'Structured comparative empirical matrix' },
      { type: 'report', label: 'Synthesis Report', description: 'Comprehensive continuous thesis document' },
      { type: 'flashcards', label: 'Flashcards', description: 'Source-grounded recall cards' },
      { type: 'quiz', label: 'Quiz', description: 'Source-grounded knowledge check' },
      { type: 'video', label: 'Video Overview', description: 'Source-grounded visual overview' }
    ]
  })
})

export default app
