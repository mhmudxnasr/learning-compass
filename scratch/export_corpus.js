import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const outDir = '/tmp/mahmood_corpus'
mkdirSync(outDir, { recursive: true })

function runQueryToFile(sql) {
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

console.log('Fetching Recommendations history...')
const recs = runQueryToFile("SELECT id, video_title, creator, video_url, why_this, status, user_rating, user_review, content_type, created_at FROM recommendations ORDER BY created_at DESC;")
let recsText = "# MAHMOOD — LEARNING HISTORY & CONSUMED RECOMMENDATIONS\n\n"
for (const item of recs) {
  recsText += `Title: ${item.video_title || 'Untitled'}\n`
  if (item.creator) recsText += `Creator: ${item.creator}\n`
  if (item.video_url) recsText += `URL: ${item.video_url}\n`
  if (item.content_type) recsText += `Format: ${item.content_type}\n`
  if (item.why_this) recsText += `Why Recommended: ${item.why_this}\n`
  if (item.user_rating && item.user_rating !== 'unset') recsText += `Rating: ${item.user_rating}/10\n`
  if (item.user_review) recsText += `Review: ${item.user_review}\n`
  recsText += `Status: ${item.status}\n`
  recsText += `----------------------------------------\n\n`
}
writeFileSync(join(outDir, '01_mahmood_learning_history.txt'), recsText)

console.log('Fetching Profile & Exclusions...')
const profile = runQueryToFile("SELECT identity_json, mega_priority_json, core_filter, reaction_style_json, quality_rules_json, operational_style_json, patterns_summary_json FROM profile LIMIT 5;")
let profileText = "# MAHMOOD — TASTE PROFILE, RULES, & DOMAIN EXCLUSIONS\n\n"
profileText += "## Mastered Topics & Domain Rules:\n"
profileText += "- Tone: Brutally honest, direct, casual, zero emojis.\n"
profileText += "- Mastered Books (NEVER recommend or summarize again): The 48 Laws of Power, Steal Like an Artist, Predictably Irrational, Thinking Fast and Slow.\n"
profileText += "- Islamic Content: ZERO book-derived content. ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars.\n"
profileText += "- Dopamine & Habit Neuroscience: Fully mastered. HARD REJECT all dopamine hits / habit loop rewiring fluff.\n"
profileText += "- Death Content: Existential/theoretical angles only (TMT, Becker, Kierkegaard). HARD REJECT clinical/palliative content.\n"
profileText += "- AI/AGI: LOVES practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, t3dotgg pragmatism, OpenAI/Anthropic major releases. HARD REJECT low-level math/internals papers (GRPO, RL math).\n"
profileText += "- Storytelling: Real-life/business/brand framing only (Will Storr). HARD REJECT fiction/screenwriting.\n"
profileText += "- Dark Patterns: Mathur/ProPublica framing. EXCLUDE Brignull.\n\n"

if (profile.length) {
  const p = profile[0]
  if (p.identity_json) profileText += `## Identity:\n${p.identity_json}\n\n`
  if (p.mega_priority_json) profileText += `## Priorities:\n${p.mega_priority_json}\n\n`
  if (p.core_filter) profileText += `## Core Filter:\n${p.core_filter}\n\n`
  if (p.quality_rules_json) profileText += `## Quality Rules:\n${p.quality_rules_json}\n\n`
}
writeFileSync(join(outDir, '02_mahmood_profile_and_exclusions.txt'), profileText)

console.log('Fetching Taste Tree Topology...')
const branches = runQueryToFile("SELECT node_key, label, status, parent_key, exploration_round, positive_signals, negative_signals FROM branch_exploration ORDER BY exploration_round ASC;")
let treeText = "# MAHMOOD — TASTE TREE TOPOLOGY & BRANCH EVIDENCE\n\n"
for (const b of branches) {
  treeText += `Node Key: ${b.node_key} (${b.label || ''})\n`
  if (b.parent_key) treeText += `Parent Node: ${b.parent_key}\n`
  treeText += `Status: ${b.status} | Round: R${b.exploration_round || 1}\n`
  treeText += `Signals: +${b.positive_signals || 0} / -${b.negative_signals || 0}\n`
  treeText += `----------------------------------------\n\n`
}
writeFileSync(join(outDir, '03_mahmood_taste_tree_topology.txt'), treeText)

console.log('Corpus export complete! Output written to /tmp/mahmood_corpus/')
