import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { freeAi } from '../services/ai'
import { formatNoteAnchors, selectCurationMode, computeDialecticDivergenceScore } from '../domain'

const app = new Hono<{ Bindings: Bindings }>()


/**
 * POST /ai/suggest
 * Advanced LLM-powered auto-curation engine for Learning Compass.
 * Reads live profile, priorities, mastered items, blacklist, blind spots,
 * consumed history, recent note anchors, and unread feeds.
 * Enforces 50%+ non-video format quota, strict exclusions, and contrast hooks.
 */
app.post('/suggest', async (c) => {
  const { DB } = c.env
  let reqBody: { energy_level?: string; format_preference?: string; mode?: string } = {}
  try { reqBody = await c.req.json().catch(() => ({})) } catch {}

  const energyLevel = reqBody.energy_level || 'medium_focus'
  const formatPref = reqBody.format_preference || 'any'

  try {
    const [
      profileRow,
      prioritiesRes,
      activeRes,
      neglectedRes,
      vectorsRes,
      topConsumedRes,
      consumedTitlesRes,
      masteredRes,
      blacklistRes,
      blindSpotsRes,
      reflectionsRes,
      feedEntriesRes,
    ] = await Promise.all([
      DB.prepare('SELECT identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, patterns_summary_json FROM profile WHERE id = 1').first<any>().catch(() => null),
      DB.prepare('SELECT rank, branch_id, label, rationale FROM priorities ORDER BY rank ASC LIMIT 10').all<any>().catch(() => ({ results: [] })),
      DB.prepare("SELECT r.video_title FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress') ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 10").all<any>().catch(() => ({ results: [] })),
      DB.prepare(`
        SELECT t.id, t.label, t.super_category, MAX(r.consumed_date) as last_consumed
        FROM tree_nodes t
        LEFT JOIN recommendations r ON r.dedup_key LIKE (t.id || '-%') AND r.status = 'consumed'
        WHERE t.type IN ('branch', 'category')
        GROUP BY t.id
        HAVING last_consumed IS NULL OR last_consumed < date('now', '-30 days')
        ORDER BY last_consumed ASC
        LIMIT 5
      `).all<any>().catch(() => ({ results: [] })),
      DB.prepare('SELECT topic, affinity_score, consumption_count, last_consumed_at FROM taste_vectors ORDER BY affinity_score DESC LIMIT 10').all<any>().catch(() => ({ results: [] })),
      DB.prepare("SELECT user_rating, video_title, creator, user_review FROM recommendations WHERE status = 'consumed' AND user_rating IN ('love','like') ORDER BY consumed_date DESC LIMIT 10").all<any>().catch(() => ({ results: [] })),
      DB.prepare("SELECT video_title, creator FROM recommendations WHERE status = 'consumed' LIMIT 150").all<any>().catch(() => ({ results: [] })),
      DB.prepare('SELECT id, kind, label, author, rating FROM mastered ORDER BY mastered_at DESC').all<any>().catch(() => ({ results: [] })),
      DB.prepare('SELECT name, work, reason, severity FROM blacklist ORDER BY severity ASC').all<any>().catch(() => ({ results: [] })),
      DB.prepare(`
        SELECT n.id, n.label, n.super_category
        FROM tree_nodes n
        LEFT JOIN recommendation_meta m ON m.branch_id = n.id
        LEFT JOIN recommendations r ON r.id = m.recommendation_id AND r.status = 'consumed'
        WHERE n.type IN ('branch', 'leaf')
        GROUP BY n.id
        HAVING COUNT(r.id) = 0
        LIMIT 15
      `).all<any>().catch(() => ({ results: [] })),
      DB.prepare("SELECT reflection FROM learning_sessions WHERE reflection IS NOT NULL AND reflection != '' ORDER BY completed_at DESC LIMIT 5").all<any>().catch(() => ({ results: [] })),
      DB.prepare("SELECT title, url FROM feed_entries LIMIT 10").all<any>().catch(() => ({ results: [] })),
    ])

    let identity = null
    try { if (profileRow?.identity_json) identity = JSON.parse(profileRow.identity_json) } catch {}

    const activeTitles = (activeRes?.results || []).map((r: any) => r.video_title)
    const consumedTitles = (consumedTitlesRes?.results || []).map((r: any) => `${r.video_title}${r.creator ? ` by ${r.creator}` : ''}`)
    const masteredList = (masteredRes?.results || []).map((m: any) => `${m.label}${m.author ? ` by ${m.author}` : ''} (${m.kind})`)
    const blacklistList = (blacklistRes?.results || []).map((b: any) => `${b.name}${b.work ? ` (${b.work})` : ''} - ${b.reason || 'blacklisted'}`)
    const blindSpots = (blindSpotsRes?.results || []).map((b: any) => `${b.label} [${b.super_category || 'general'}]`)
    const noteAnchors = formatNoteAnchors(reflectionsRes?.results || [])
    const feedEntries = (feedEntriesRes?.results || []).map((f: any) => `"${f.title}" (${f.url})`)
    const coreFilter = profileRow?.core_filter || 'Not set'
    const priorities = prioritiesRes?.results || []
    const neglected = neglectedRes?.results || []
    const vectors = vectorsRes?.results || []
    const topConsumed = topConsumedRes?.results || []

    const curationMode = selectCurationMode(reqBody.mode, noteAnchors.length > 0)

    const prompt = `You are a world-class content curator building a personal learning queue for an autodidact (Mahmood).
Suggest ONE specific item to add to Mahmood's queue.

ACTIVE CURATION MODE: ${curationMode.toUpperCase()}
ENERGY / TIME BUDGET: ${energyLevel} (quick_scan: 5-15m article/essay; medium_focus: 15-30m podcast/summary; deep_focus: 45-90m academic paper/monograph)
FORMAT PREFERENCE: ${formatPref}

CONTEXT:
- Core filter: ${coreFilter}
- Identity: ${JSON.stringify(identity || 'Not set')}
- Top priorities: ${priorities.map((p: any) => `[${p.rank}] ${p.branch_id}: ${p.label || ''} — ${p.rationale || ''}`).join('\n')}
- Neglected branches (30d+ stale): ${neglected.map((n: any) => `${n.label} (last: ${n.last_consumed || 'never'})`).join(', ') || 'None'}
- Knowledge Blind Spots (0 consumed items): ${blindSpots.join(', ') || 'None'}

USER'S RECENT NOTE ANCHORS & UNRESOLVED QUESTIONS:
${noteAnchors.map((n: string, i: number) => `[${i + 1}] "${n}"`).join('\n') || 'None'}

TASTE VECTORS (top affinities):
${vectors.map((v: any) => `${v.topic}: score=${v.affinity_score}, consumed=${v.consumption_count || 0}`).join('\n')}

TOP RATED CONSUMED (for style reference):
${topConsumed.map((r: any) => `- [${r.user_rating}] ${r.video_title} by ${r.creator || 'unknown'}`).join('\n')}

UNREAD RSS SUBSCRIPTIONS (prioritize if fitting):
${feedEntries.join('\n') || 'None'}

STRICT EXCLUSIONS — DO NOT RECOMMEND ANYTHING DERIVED FROM OR MATCHING THESE:
- MASTERED BOOKS & TOPICS:
  ${masteredList.join('\n  ') || 'None'}
- BLACKLISTED AUTHORS & WORKS:
  ${blacklistList.join('\n  ') || 'None'}
- ALL CONSUMED & QUEUED TITLES:
  ${[...activeTitles, ...consumedTitles.slice(0, 100)].join('\n  ') || 'None'}

CURATION INSTRUCTIONS:
1. STRICT FORMAT QUOTA: DO NOT DEFAULT TO YOUTUBE VIDEOS. At least 50% of recommendations must be Academic Papers & Preprints (arXiv, SSRN, PhilPapers, JSTOR), Long-form Essays (Aeon, Works in Progress, Astral Codex Ten), Podcasts, or Books.
2. STRICT EXCLUSION ENFORCEMENT: Never recommend any book, video, podcast, article, talk, or summary about or derived from any item in MASTERED BOOKS & TOPICS (e.g., The 48 Laws of Power, Steal Like an Artist, Thinking Fast and Slow, Predictably Irrational), BLACKLIST, or CONSUMED TITLES.
3. DIALECTIC DIVERGENCE OPTIMIZATION:
   Optimize for targeted conceptual contrast rather than similarity. Find sources in the orthogonal divergence window (target angle θ_target = 0.25) that challenge existing convictions, present counter-evidence, or falsify previous assumptions without being un-related noise.
4. MODE DIRECTION:
   - note_answer: Find content that directly addresses one of Mahmood's recent note anchors or unresolved questions.
   - blind_spot_bridge: Find content that bridges a Blind Spot or connects two distant branches.
   - counter_evidence: Find a high-authority counter-argument to one of Mahmood's past 8-10/10 ratings.
   - academic_paper: Find a seminal or cutting-edge academic paper / preprint (arXiv, SSRN, JSTOR, PhilPapers).
5. CONTRAST HOOK: Write why_this as a 2-3 sentence sharp Contrast Hook contrasting this item against Mahmood's past ratings/convictions (e.g. "You rated X 10/10... This paper demonstrates Y...").
6. Return ONLY valid JSON with no markdown wrapping: {"title": "...", "creator": "...", "content_type": "paper|article|podcast|book|video", "url": "...", "why_this": "...", "is_refutation": true|false, "estimated_cos_sim": 0.25}`

    let suggestion: any = null
    let model = 'd1-fallback'

    const result = await freeAi(c.env, 'You are a precise content curator. Return ONLY valid JSON object requested — no markdown or commentary.', prompt, 2048)
    if (result && result.text) {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          suggestion = JSON.parse(jsonMatch[0])
          model = result.model
        } catch {}
      }
    }

    if (!suggestion || !suggestion.title || !suggestion.why_this) {
      const topTopic = neglected[0]?.label || priorities[0]?.label || 'Core Learning'
      suggestion = {
        title: `Curated Exploration: ${topTopic}`,
        creator: 'Learning Compass',
        content_type: 'article',
        url: `SEARCH: ${topTopic}`,
        why_this: `Derived from your neglected branches and priorities (${topTopic}) to maintain active learning balance.`,
        is_refutation: curationMode === 'counter_evidence',
        estimated_cos_sim: 0.25,
      }
    }

    const isRefutation = Boolean(suggestion.is_refutation || curationMode === 'counter_evidence')
    const cosSim = typeof suggestion.estimated_cos_sim === 'number' ? suggestion.estimated_cos_sim : 0.25
    const dialecticDivergenceScore = computeDialecticDivergenceScore(cosSim, isRefutation)

    return c.json({
      suggestion: {
        ...suggestion,
        dialectic_score: dialecticDivergenceScore,
      },
      model,
      mode: curationMode,
      energy_level: energyLevel,
      context: {
        top_vectors: vectors.slice(0, 5),
        neglected: neglected.slice(0, 3),
        queue_count: activeTitles.length,
        mastered_count: masteredList.length,
        note_anchors_count: noteAnchors.length,
        dialectic_optimization: {
          target_angle: 0.25,
          lambda: 0.4,
          refutation_weight: 0.35,
          score: dialecticDivergenceScore,
        },
      }
    })


  } catch (err) {
    console.error('Suggest failed', err)
    return c.json(safeError('Suggest failed')(err), 500)
  }
})

export default app
