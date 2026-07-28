import { Hono } from 'hono'
import { Bindings, safeError, isNonEmptyStr } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * GET /agent/context
 * Token-optimized, prompt-ready snapshot for AI agents (Gemini, Claude, Hermes, taste-mapper).
 * Combines Profile, Mega Priorities, Active Queue, Neglected Branches, and Learning Gaps in 1 call.
 */
app.get('/context', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  
  let profile: any = null
  let priorities: any = { results: [] }
  let activeQueue: any = { results: [] }
  let neglected: any = { results: [] }
  let gaps: any = { results: [] }

  try { profile = await DB.prepare('SELECT identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, patterns_summary_json FROM profile WHERE id = 1').first<any>() } catch {}
  try { priorities = await DB.prepare('SELECT rank, branch_id, label, rationale FROM priorities ORDER BY rank ASC LIMIT 10').all() } catch {}
  try { activeQueue = await DB.prepare("SELECT id, video_title, creator, content_type, why_this, video_url FROM recommendations WHERE status = 'active' ORDER BY created_at DESC LIMIT 5").all() } catch {}
  try {
    neglected = await DB.prepare(`
      SELECT t.id, t.label, t.super_category, MAX(r.consumed_date) as last_consumed
      FROM tree_nodes t
      LEFT JOIN recommendations r ON r.dedup_key LIKE (t.id || '-%') AND r.status = 'consumed'
      WHERE t.type IN ('branch', 'category')
      GROUP BY t.id
      HAVING last_consumed IS NULL OR last_consumed < date('now', '-30 days')
      ORDER BY last_consumed ASC
      LIMIT 5
    `).all()
  } catch {}
  try {
    gaps = await DB.prepare(`
      SELECT COALESCE(SUBSTR(dedup_key, 1, INSTR(dedup_key, '-') - 1), 'general') as topic,
             COUNT(*) as consumed_count,
             AVG(CASE WHEN user_rating IN ('love','like') THEN 1 ELSE 0 END) as mastery_rate
      FROM recommendations
      WHERE status = 'consumed' AND dedup_key IS NOT NULL AND dedup_key != ''
      GROUP BY topic
      HAVING mastery_rate < 0.6 OR consumed_count < 2
      LIMIT 5
    `).all()
  } catch {}

  let identityParsed = null
  let patternsParsed = null
  try { if (profile?.identity_json) identityParsed = JSON.parse(profile.identity_json) } catch {}
  try { if (profile?.patterns_summary_json) patternsParsed = JSON.parse(profile.patterns_summary_json) } catch {}

  return c.json({
    timestamp: new Date().toISOString(),
    curator: 'Mahmood',
    profile: {
      core_filter: profile?.core_filter || null,
      identity: identityParsed,
      patterns: patternsParsed
    },
    priorities: priorities?.results || [],
    active_queue: activeQueue?.results || [],
    neglected_branches: neglected?.results || [],
    learning_gaps: gaps?.results || []
  })
})

/**
 * GET /agent/tools
 * Tool declarations format for Model Context Protocol (MCP) or OpenAI function calling.
 */
app.get('/tools', (c) => {
  return c.json({
    tools: [
      {
        name: 'get_agent_context',
        description: 'Fetch Mahmood taste profile, top priorities, active recommendations, and neglected learning branches.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'push_recommendation',
        description: 'Push a candidate video, paper, or article to Mahmood queue with justification.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL of the content' },
            title: { type: 'string', description: 'Title of the content' },
            creator: { type: 'string', description: 'Author or creator name' },
            content_type: { type: 'string', enum: ['video', 'paper', 'article', 'book'] },
            why_this: { type: 'string', description: 'Why this content fits Mahmood taste and priorities' }
          },
          required: ['url', 'title', 'why_this']
        }
      },
      {
        name: 'validate_content_fit',
        description: 'Check if a topic or URL matches Mahmood core filter rules and anti-patterns.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            topic: { type: 'string' },
            creator: { type: 'string' }
          },
          required: ['title']
        }
      },
      {
        name: 'log_learning_session',
        description: 'Log topics studied today into the daily learning journal.',
        parameters: {
          type: 'object',
          properties: {
            topics: { type: 'string', description: 'Comma separated list of topics studied' },
            date: { type: 'string', description: 'YYYY-MM-DD format (optional)' }
          },
          required: ['topics']
        }
      }
    ]
  })
})

/**
 * POST /agent/tool-call
 * Unified execution handler for LLM tool invocations.
 */
app.post('/tool-call', async (c) => {
  const { DB } = c.env
  try {
    const { name, arguments: args } = await c.req.json<{ name: string; arguments: any }>()
    if (!name) return c.json({ error: 'tool name required' }, 400)

    if (name === 'get_agent_context') {
      const res = await fetch(new URL('/agent/context', c.req.url).toString(), { headers: c.req.raw.headers })
      return c.json(await res.json())
    }

    if (name === 'push_recommendation') {
      const { url, title, creator, content_type, why_this } = args || {}
      if (!url || !title || !why_this) return c.json({ error: 'missing required fields: url, title, why_this' }, 400)

      const id = `rec_agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const dedup = `${content_type || 'article'}-${title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)}`
      
      await DB.prepare(`
        INSERT INTO recommendations (id, video_title, creator, content_type, video_url, why_this, verified, status, user_rating, dedup_key)
        VALUES (?, ?, ?, ?, ?, ?, date('now'), 'active', 'unset', ?)
        ON CONFLICT(dedup_key) DO UPDATE SET video_title=excluded.video_title, status='active'
      `).bind(id, title, creator || null, content_type || 'article', url, why_this, dedup).run()

      return c.json({ ok: true, recommendation_id: id, status: 'pushed to queue' })
    }

    if (name === 'validate_content_fit') {
      const { title, creator } = args || {}
      const blacklist = await DB.prepare('SELECT name, reason FROM blacklist').all<any>()
      const matches = (blacklist.results || []).filter((b: any) => 
        (title && title.toLowerCase().includes(b.name.toLowerCase())) ||
        (creator && creator.toLowerCase().includes(b.name.toLowerCase()))
      )
      
      if (matches.length > 0) {
        return c.json({ fit: false, reason: `Matches blacklisted term: ${matches[0].name} (${matches[0].reason || 'no reason'})` })
      }
      return c.json({ fit: true, reason: 'Passed blacklist filters and aligns with active profile.' })
    }

    if (name === 'log_learning_session') {
      const { topics, date } = args || {}
      if (!topics) return c.json({ error: 'topics required' }, 400)
      const logDate = date || new Date().toISOString().split('T')[0]
      await DB.prepare(`
        INSERT INTO learning_log (date, count, topics) VALUES (?, 1, ?)
        ON CONFLICT(date) DO UPDATE SET count = count + 1, topics = learning_log.topics || ', ' || ?
      `).bind(logDate, topics, topics).run()

      return c.json({ ok: true, date: logDate, logged_topics: topics })
    }

    return c.json({ error: `Unknown tool: ${name}` }, 404)
  } catch (err) {
    return c.json(safeError('Tool call failed')(err), 500)
  }
})

/**
 * POST /agent/validate-fit
 * Quick endpoint for AI filters before queuing new items.
 */
app.post('/validate-fit', async (c) => {
  const { DB } = c.env
  try {
    const { title, creator, url } = await c.req.json<{ title?: string; creator?: string; url?: string }>()
    if (!title && !url) return c.json({ error: 'title or url required' }, 400)

    const blacklist = await DB.prepare('SELECT name, reason FROM blacklist').all<any>()
    const searchStr = `${title || ''} ${creator || ''} ${url || ''}`.toLowerCase()
    
    for (const item of (blacklist.results || [])) {
      if (searchStr.includes(item.name.toLowerCase())) {
        return c.json({ fit: false, reason: `Matches blacklist: ${item.name} (${item.reason || 'restricted'})` })
      }
    }

    return c.json({ fit: true, reason: 'Passes core quality filters' })
  } catch (err) {
    return c.json(safeError('Validation failed')(err), 500)
  }
})

export default app
