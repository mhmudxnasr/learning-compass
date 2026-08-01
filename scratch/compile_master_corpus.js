import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'

function queryD1(sql) {
  const sqlPath = '/tmp/tmp_query.sql'
  writeFileSync(sqlPath, sql)
  try {
    const cmd = `npx wrangler d1 execute recommendations-db --remote --json --file=${sqlPath}`
    const output = execSync(cmd, { cwd: '/home/mahmud/recommendations-worker', encoding: 'utf-8' })
    const jsonStart = output.indexOf('[')
    const jsonEnd = output.lastIndexOf(']')
    if (jsonStart === -1 || jsonEnd === -1) return []
    const cleanJson = output.substring(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(cleanJson)
    return parsed[0]?.results || []
  } catch (err) {
    console.error('Query failed:', err.message)
    return []
  } finally {
    try { unlinkSync(sqlPath) } catch {}
  }
}

let doc = `# MAHMOOD — COMPLETE GROUNDED KNOWLEDGE CORPUS & PROFILE SYSTEM
Target Notebook: https://notebook.google.com/notebook/2c8a58a9-32b8-45db-804f-b48bf756e82c
Last Updated: ${new Date().toISOString()}

================================================================================
SECTION 1: MAHMOOD'S IDENTITY, TONE, AND PERMANENT SYSTEM RULES
================================================================================
- Persona & Role: You are Mahmood's personal Taste Strategist and Chief Knowledge Officer.
- Tone: Direct, casual, brutally honest, zero emojis by default.
- Action Principle: Decisive execution over discussion.

ABSOLUTE EXCLUSIONS & SAFETY RULES:
- Mastered Books & Topics: ALWAYS verify mastered items and consumed history. NEVER recommend or summarize any book or concept already read (e.g. The 48 Laws of Power, Steal Like an Artist, Predictably Irrational, Thinking Fast and Slow).
- Islamic Content: ZERO book-derived content (no books, audiobooks, explained books, or book-based lecture series). ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars (e.g., Yaqeen Institute, Dr. Omar Suleiman, Sh. Abdul Nasir Jangda).
- Dopamine & Habit Neuroscience: Fully mastered (dopamine, serotonin, habit loops, craving, PCC/DMN, addiction cycle). HARD REJECT all "dopamine hits", "break habit loops", or "rewire your brain" content.
- Death Content: Theoretical/philosophical/existential angles only (TMT, Kierkegaard, Ernest Becker). HARD REJECT clinical/palliative content (e.g., BJ Miller).
- Storytelling: Real-life/business/brand framing only (Will Storr craft). HARD REJECT fiction/screenwriting framing.
- Dark Patterns: EXCLUDE Harry Brignull framing; follow Mathur/ProPublica deceptive patterns framing.
- AI/AGI Curation Rules:
  - LOVES: Practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, and workflow integrations (e.g., Obsidian with Claude Code, NotebookLM, Hermes agent workflows, t3dotgg-style pragmatic dev tools/frameworks, Simon Willison tool-calling articles).
  - LOVES: Major AI hardware announcements and model release news from top labs (e.g., OpenAI family of devices, Greg Brockman interviews).
  - HARD REJECT: Theoretical/academic AI papers on low-level model training math or internals (e.g., GRPO math, RL training details, pre-training math).

================================================================================
SECTION 2: BLACKLISTED AUTHORS & BOOKS
================================================================================
- Joseph Murphy (Power of Your Subconscious Mind) — vapid motivational guru
- Paulo Coelho (The Alchemist) — parable without operational content
- James Clear (Atomic Habits) — guru form, no primary research
- Robert Kiyosaki (Rich Dad Poor Dad) — guru financial advice, no substance
- Ehab Fikri (إيهاب فكري) — Arabic self-help guru
- Ahmed Atef (أحمد عاطف) — low effort
- Hassan Gendy (حسن الجندي) — low effort fiction
- Stuart Turton (The 7½ Deaths of Evelyn Hardcastle) — low quality
- Harry Brignull — vibe-filter; topic loved, creator hated

================================================================================
SECTION 3: LEARNING PRIORITIES (TASTE TREE TOPOLOGY)
================================================================================
1. Tazkiyah (taz)
2. Behavioral finance (fina)
3. Persuasion + influence (persu)
4. Power dynamics (pwr)
5. Cognitive biases (cog-bias)
6. Storytelling (story)
7. Islam pillars (pil)
8. Fiqh daily (fiqh)
9. Mental health (ment)
10. AI tools (ai)
11. Negotiation/sales (neg)
12. Decision science (dec)
13. Dark patterns (dark)
14. Loneliness + trust (rel)
15. Life design (life)
16. CPR (cpr)
17. Espresso (esp)
18. Startup (start)
19. Creativity (creat)

================================================================================
SECTION 4: FULL CONSUMED LEARNING HISTORY & QUEUE RECOMMENDATIONS
================================================================================
`

const recs = queryD1("SELECT id, video_title, creator, video_url, why_this, status, user_rating, user_review, content_type FROM recommendations ORDER BY created_at DESC;")
for (const item of recs) {
  doc += `Item: ${item.video_title || 'Untitled'}\n`
  if (item.creator) doc += `Creator: ${item.creator}\n`
  if (item.video_url) doc += `URL: ${item.video_url}\n`
  if (item.content_type) doc += `Type: ${item.content_type}\n`
  if (item.why_this) doc += `Rationale: ${item.why_this}\n`
  if (item.user_rating && item.user_rating !== 'unset') doc += `User Rating: ${item.user_rating}/10\n`
  if (item.user_review) doc += `User Reflection: ${item.user_review}\n`
  doc += `Status: ${item.status}\n`
  doc += `--------------------------------------------------------------------------------\n`
}

doc += `\n================================================================================\nSECTION 5: ORIGINAL USER REFLECTIONS & SOURCE NOTES\n================================================================================\n`
const notes = queryD1("SELECT id, title, content, kind FROM notes ORDER BY created_at DESC;")
for (const n of notes) {
  doc += `Note Title: ${n.title || 'Untitled'}\n`
  doc += `Kind: ${n.kind || 'reflection'}\n`
  doc += `Content:\n${n.content || ''}\n`
  doc += `--------------------------------------------------------------------------------\n`
}

writeFileSync('/tmp/mahmood_complete_corpus.txt', doc)
console.log(`Master corpus generated! Size: ${doc.length} bytes`)
