import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * POST /ai/suggest
 * LLM-powered auto-curation: reads agent context + neglected branches + taste vector,
 * then generates a "next best leaf" recommendation with why_this using Gemini.
 * One-call replacement for the 4+ curl orchestration in taste-rec.
 */
app.post('/suggest', async (c) => {
  const { DB } = c.env
  const key = (c.env as any).GOOGLE_API_KEY

  if (!key) return c.json({ error: 'GOOGLE_API_KEY not configured' }, 503)

  try {
    // 1. Gather context — agent context endpoint (internal subrequest)
    const [contextRes, vectorRes, activeRes, treeRes, consumedRes] = await Promise.all([
      fetch(new URL('/agent/context', c.req.url).toString(), { headers: c.req.raw.headers }),
      fetch(new URL('/taste/vector', c.req.url).toString(), { headers: c.req.raw.headers }),
      fetch(new URL('/recommendations/active', c.req.url).toString(), { headers: c.req.raw.headers }),
      fetch(new URL('/brain/tree?limit=500', c.req.url).toString(), { headers: c.req.raw.headers }),
      fetch(new URL('/recommendations/list?status=consumed&limit=20', c.req.url).toString(), { headers: c.req.raw.headers }),
    ])

    const [context, vectorData, activeData, treeData, consumedData] = await Promise.all([
      contextRes.json<any>(),
      vectorRes.json<any>(),
      activeRes.json<any>(),
      treeRes.json<any>(),
      consumedRes.json<any>(),
    ])

    const activeTitles = (activeData.recommendations || []).map((r: any) => r.video_title)
    const branches = (treeData.nodes || []).filter((n: any) => n.type === 'branch' || n.type === 'leaf')
    const profile = context.profile || {}
    const priorities = context.priorities || []
    const neglected = context.neglected_branches || []
    const vectors = (vectorData.vectors || [])
      .sort((a: any, b: any) => b.affinity_score - a.affinity_score)
      .slice(0, 10)
    const topConsumed = (consumedData.recommendations || [])
      .filter((r: any) => r.user_rating === 'love' || r.user_rating === 'like')
      .slice(0, 10)

    const prompt = `You are a curator building a personal recommendation queue for an autodidact (Mahmood). Based on the context below, suggest ONE specific item to add to the queue.

CONTEXT:
- Core filter: ${profile.core_filter || 'Not set'}
- Identity: ${JSON.stringify(profile.identity || 'Not set')}
- Top priorities: ${priorities.map((p: any) => `[${p.rank}] ${p.branch_id}: ${p.label || ''} — ${p.rationale || ''}`).join('\n')}
- Neglected branches (30d+ stale): ${neglected.map((n: any) => `${n.label} (last: ${n.last_consumed || 'never'})`).join(', ') || 'None'}

TASTE VECTORS (top affinities):
${vectors.map((v: any) => `${v.topic}: score=${v.affinity_score}, consumed=${v.total_consumed}, last=${v.last_consumed || 'never'}`).join('\n')}

TOP RATED CONSUMED (for style reference):
${topConsumed.map((r: any) => `- [${r.user_rating}] ${r.video_title} by ${r.creator || 'unknown'} — ${(r.user_review || '').slice(0, 200)}`).join('\n')}

ALREADY IN QUEUE (skip these):
${activeTitles.join(', ') || 'None'}

TREE BRANCHES (for topic guidance):
${branches.map((n: any) => `${n.id} (${n.type}): ${n.label} — status: ${n.status || 'standard'}`).join('\n')}

INSTRUCTIONS:
1. Suggest ONE item to add to the queue. It can be a YouTube video, article, paper, book, or podcast.
2. Prefer content that addresses neglected branches or aligns with top priorities.
3. Recommend real, known content by real creators.
4. Include: title, creator, content_type (video/paper/article/book/podcast), url (a real URL if known, or 'SEARCH: <topic> <creator>' as placeholder), why_this (2-3 sentences — specific hook, not generic praise).
5. Return ONLY valid JSON with no markdown wrapping: {"title": "...", "creator": "...", "content_type": "...", "url": "...", "why_this": "..."}
6. If you don't have a specific real URL, use "SEARCH: <search terms>" as the url — but prefer an actual URL.`

    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'You are a precise content curator. Return ONLY the JSON object requested — no markdown, no commentary, no code fences. If you lack a real URL, use "SEARCH: <query>" as the url value.' }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        }),
      }
    )

    if (!upstream.ok) {
      const errText = await upstream.text()
      console.warn('suggest upstream error', upstream.status, errText.slice(0, 500))
      return c.json({ error: 'AI upstream failed', status: upstream.status }, 502)
    }

    const j = await upstream.json<any>()
    const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) return c.json({ error: 'Empty AI response' }, 502)

    // Parse JSON from response — handle markdown-wrapped JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return c.json({ error: 'Could not parse AI response', raw: raw.slice(0, 500) }, 502)

    let suggestion: any
    try {
      suggestion = JSON.parse(jsonMatch[0])
    } catch {
      return c.json({ error: 'JSON parse failed', raw: raw.slice(0, 500) }, 502)
    }

    if (!suggestion.title || !suggestion.why_this) {
      return c.json({ error: 'Incomplete suggestion', suggestion }, 400)
    }

    return c.json({
      suggestion,
      context: {
        top_vectors: vectors.slice(0, 5),
        neglected: neglected.slice(0, 3),
        queue_count: activeTitles.length,
      }
    })

  } catch (err) {
    return c.json(safeError('Suggest failed')(err), 500)
  }
})

export default app
