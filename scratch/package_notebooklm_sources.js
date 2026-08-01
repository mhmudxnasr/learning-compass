import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const destDir = '/home/mahmud/notebooklm_master_sources'
mkdirSync(destDir, { recursive: true })

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
    console.error('D1 Query failed:', err.message)
    return []
  }
}

// 1. System Role & Identity
const file01 = `# MAHMOOD — SYSTEM ROLE & CHIEF KNOWLEDGE OFFICER PERSONA

You are Mahmood's personal Taste Strategist and Chief Knowledge Officer for Learning Compass.

## IDENTITY & OPERATIONAL RULES:
- Language & Tone: English-first responses for all tasks. Direct, casual, brutally honest tone. ZERO emojis by default.
- Action Principle: Decisive execution over discussion.
- Citation & Grounding: Every answer, summary, or counter-evidence analysis MUST be strictly grounded in Mahmood's corpus notes and sources.
- Grounded Divergence: Actively identify refutations, counter-evidence, and knowledge gaps across Mahmood's Taste Tree branches without confirmation bias or hallucination.
`
writeFileSync(join(destDir, '01_SYSTEM_ROLE_AND_IDENTITY.txt'), file01)

// 2. Domain Filter Rules & Exclusions
const profileRes = queryD1("SELECT identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, operational_style_json, patterns_summary_json FROM profile LIMIT 5;")
let file02 = `# MAHMOOD — DOMAIN FILTER RULES, MASTERED TOPICS, & BLACKLIST

## ABSOLUTE EXCLUSIONS & SAFETY RULES:
1. Mastered Books & Topics: ALWAYS verify mastered items and consumed history. NEVER recommend or summarize any book or concept already read:
   - The 48 Laws of Power (Robert Greene)
   - Steal Like an Artist (Austin Kleon)
   - Predictably Irrational (Dan Ariely)
   - Thinking Fast and Slow (Daniel Kahneman)

2. Islamic Content: ZERO book-derived content (no books, audiobooks, explained books, or book-based lecture series). ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars (Yaqeen Institute, Dr. Omar Suleiman, Sh. Abdul Nasir Jangda).

3. Dopamine & Habit Neuroscience: Fully mastered (dopamine, serotonin, habit loops, craving, PCC/DMN, addiction cycle). HARD REJECT all "dopamine hits", "break habit loops", or "rewire your brain" content.

4. Death Content: Theoretical/philosophical/existential angles only (TMT, Kierkegaard, Ernest Becker). HARD REJECT clinical/palliative content (e.g. BJ Miller).

5. Storytelling: Real-life/business/brand framing only (Will Storr craft). HARD REJECT fiction/screenwriting framing.

6. Dark Patterns: EXCLUDE Harry Brignull framing; follow Mathur/ProPublica deceptive patterns framing.

7. AI/AGI Curation Rules:
   - LOVES: Practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, and workflow integrations (Obsidian with Claude Code, NotebookLM, Hermes agent workflows, t3dotgg-style pragmatic dev tools/frameworks, Simon Willison tool-calling articles).
   - LOVES: Major AI hardware announcements and model release news from top labs (OpenAI family of devices, Greg Brockman interviews).
   - HARD REJECT: Theoretical/academic AI papers on low-level model training math or internals (GRPO math, RL training details, pre-training math).

## BLACKLISTED AUTHORS & WORKS:
- Joseph Murphy (Power of Your Subconscious Mind) — vapid motivational
- Paulo Coelho (The Alchemist) — parable without operational content
- James Clear (Atomic Habits) — guru form, no primary research
- Robert Kiyosaki (Rich Dad Poor Dad) — guru financial advice, no substance
- Ehab Fikri (إيهاب فكري) — Arabic self-help guru
- Ahmed Atef (أحمد عاطف) — low effort
- Hassan Gendy (حسن الجندي) — low effort
- Stuart Turton (The 7½ Deaths of Evelyn Hardcastle) — low quality
- Harry Brignull — vibe-filter; topic loved, creator hated
`
if (profileRes.length) {
  const p = profileRes[0]
  if (p.core_filter) file02 += `\n## Core Filter JSON:\n${p.core_filter}\n`
  if (p.quality_rules_json) file02 += `\n## Quality Rules JSON:\n${p.quality_rules_json}\n`
}
writeFileSync(join(destDir, '02_DOMAIN_FILTER_RULES_AND_EXCLUSIONS.txt'), file02)

// 3. Taste Tree Topology & Priorities
const treeRes = queryD1("SELECT node_key, label, status, parent_key, exploration_round, positive_signals, negative_signals FROM branch_exploration ORDER BY exploration_round ASC;")
let file03 = `# MAHMOOD — TASTE TREE TOPOLOGY & 19 PRIORITY BRANCHES

## Priority Order (1-19):
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

## Tree Nodes & Signals:
`
for (const b of treeRes) {
  file03 += `Node: ${b.node_key} (${b.label || ''}) | Parent: ${b.parent_key || 'root'} | Status: ${b.status} | Round: R${b.exploration_round || 1} | Signals: +${b.positive_signals || 0}/-${b.negative_signals || 0}\n`
}
writeFileSync(join(destDir, '03_TASTE_TREE_TOPOLOGY_AND_PRIORITIES.txt'), file03)

// 4. Learning History & Consumed Recommendations
const recsRes = queryD1("SELECT id, video_title, creator, video_url, why_this, status, user_rating, user_review, content_type FROM recommendations ORDER BY created_at DESC;")
let file04 = `# MAHMOOD — CONSUMED LEARNING HISTORY & RECOMMENDATIONS\n\n`
for (const r of recsRes) {
  file04 += `Title: ${r.video_title || 'Untitled'}\n`
  if (r.creator) file04 += `Creator: ${r.creator}\n`
  if (r.video_url) file04 += `URL: ${r.video_url}\n`
  if (r.content_type) file04 += `Type: ${r.content_type}\n`
  if (r.why_this) file04 += `Rationale: ${r.why_this}\n`
  if (r.user_rating && r.user_rating !== 'unset') file04 += `User Rating: ${r.user_rating}/10\n`
  if (r.user_review) file04 += `User Review: ${r.user_review}\n`
  file04 += `Status: ${r.status}\n`
  file04 += `--------------------------------------------------\n`
}
writeFileSync(join(destDir, '04_MASTERED_LEARNING_HISTORY_AND_RECOMMENDATIONS.txt'), file04)

// 5. User Reflections & Notes
const notesRes = queryD1("SELECT id, title, content, kind FROM notes ORDER BY created_at DESC;")
let file05 = `# MAHMOOD — ORIGINAL REFLECTIONS & SOURCE NOTES\n\n`
for (const n of notesRes) {
  file05 += `Note: ${n.title || 'Untitled'} (${n.kind || 'reflection'})\n`
  file05 += `Content:\n${n.content || ''}\n`
  file05 += `--------------------------------------------------\n`
}
writeFileSync(join(destDir, '05_USER_ORIGINAL_REFLECTIONS_AND_NOTES.txt'), file05)

// 6. Hermes Skills Inventory Copy
const hermesSkills = [
  { name: 'taste-rec', path: '/home/mahmud/.hermes/skills/personal/taste-rec/SKILL.md' },
  { name: 'taste-mapper', path: '/home/mahmud/.hermes/skills/taste-mapper/SKILL.md' },
  { name: 'learning-notes-extractor', path: '/home/mahmud/.hermes/skills/learning-notes-extractor/SKILL.md' },
  { name: 'lite-visual', path: '/home/mahmud/.hermes/skills/lite-visual/SKILL.md' },
  { name: 'recommendations-worker-ops', path: '/home/mahmud/.hermes/skills/workflow/recommendations-worker-ops/SKILL.md' },
  { name: 'notebooklm', path: '/home/mahmud/.hermes/skills/notebooklm/SKILL.md' },
]

let file06 = `# HERMES CANONICAL SKILLS INVENTORY & WORKFLOW PROTOCOLS\n\n`
for (const s of hermesSkills) {
  try {
    const content = readFileSync(s.path, 'utf-8')
    file06 += `=== SKILL: ${s.name} ===\n${content}\n\n==================================================\n\n`
  } catch (err) {
    file06 += `=== SKILL: ${s.name} ===\n(Could not read path: ${s.path})\n\n`
  }
}
writeFileSync(join(destDir, '06_HERMES_CORE_SKILLS_INVENTORY.txt'), file06)

// 7. Product & Design Specs
try {
  const projContext = readFileSync('/home/mahmud/recommendations-worker/PROJECT_CONTEXT.md', 'utf-8')
  writeFileSync(join(destDir, '07_LEARNING_COMPASS_PRODUCT_SPECS.txt'), projContext)
} catch {}

console.log('Ingestion package created successfully!')
