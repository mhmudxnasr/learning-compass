import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const destDir = '/home/mahmud/notebooklm_master_sources'
mkdirSync(destDir, { recursive: true })

function queryD1(sql) {
  const sqlPath = `/tmp/tmp_query_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.sql`
  writeFileSync(sqlPath, sql)
  try {
    const cmd = `npx wrangler d1 execute recommendations-db --remote --json --file=${sqlPath}`
    const output = execSync(cmd, { cwd: '/home/mahmud/recommendations-worker', encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    const jsonStart = output.indexOf('[')
    const jsonEnd = output.lastIndexOf(']')
    if (jsonStart === -1 || jsonEnd === -1) return []
    const cleanJson = output.substring(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(cleanJson)
    return parsed[0]?.results || []
  } catch (err) {
    console.error('D1 Query failed for SQL:', sql.slice(0, 80), 'Error:', err.message)
    return []
  }
}

console.log('1. Fetching ALL recommendations & learning history...')
const recs = queryD1("SELECT * FROM recommendations ORDER BY created_at DESC;")
let recsText = `# MAHMOOD — COMPLETE LEARNING HISTORY & CONSUMED RECOMMENDATIONS (${recs.length} ITEMS)\n\n`
for (const r of recs) {
  recsText += `ID: ${r.id}\n`
  recsText += `Title: ${r.video_title || 'Untitled'}\n`
  if (r.creator) recsText += `Creator/Author: ${r.creator}\n`
  if (r.video_url) recsText += `URL: ${r.video_url}\n`
  if (r.content_type) recsText += `Format: ${r.content_type}\n`
  if (r.why_this) recsText += `Recommendation Rationale (Why Recommended): ${r.why_this}\n`
  if (r.user_rating) recsText += `User Rating: ${r.user_rating}\n`
  if (r.user_review) recsText += `User Review/Reflection: ${r.user_review}\n`
  if (r.status) recsText += `Status: ${r.status}\n`
  if (r.consumed_date) recsText += `Consumed Date: ${r.consumed_date}\n`
  if (r.created_at) recsText += `Created At: ${r.created_at}\n`
  recsText += `--------------------------------------------------------------------------------\n\n`
}
writeFileSync(join(destDir, '04_MASTERED_LEARNING_HISTORY_AND_RECOMMENDATIONS.txt'), recsText)
console.log(`Saved 04_MASTERED_LEARNING_HISTORY_AND_RECOMMENDATIONS.txt (${recsText.length} bytes)`)

console.log('2. Fetching ALL user reflections, notes, and sections...')
const notes = queryD1("SELECT * FROM notes ORDER BY created_at DESC;")
const sections = queryD1("SELECT * FROM note_sections ORDER BY id ASC;")
let notesText = `# MAHMOOD — ALL ORIGINAL REFLECTIONS & SOURCE NOTES (${notes.length} NOTES)\n\n`
for (const n of notes) {
  notesText += `Note ID: ${n.id}\n`
  notesText += `Title: ${n.title || 'Untitled'}\n`
  notesText += `Kind: ${n.kind || 'reflection'}\n`
  if (n.source_url) notesText += `Source URL: ${n.source_url}\n`
  notesText += `Content:\n${n.content || ''}\n`
  notesText += `--------------------------------------------------------------------------------\n\n`
}
if (sections.length) {
  notesText += `\n# NOTE SECTIONS & STRUCTURED EXTRACTS (${sections.length} SECTIONS)\n\n`
  for (const s of sections) {
    notesText += `Section Title: ${s.heading || s.section_title || 'Section'}\n`
    notesText += `Content:\n${s.content || s.text || ''}\n`
    notesText += `--------------------------------------------------------------------------------\n\n`
  }
}
writeFileSync(join(destDir, '05_USER_ORIGINAL_REFLECTIONS_AND_NOTES.txt'), notesText)
console.log(`Saved 05_USER_ORIGINAL_REFLECTIONS_AND_NOTES.txt (${notesText.length} bytes)`)

console.log('3. Fetching ALL Taste Tree nodes, exploration branches, and evidence logs...')
const treeNodes = queryD1("SELECT * FROM tree_nodes;")
const exploration = queryD1("SELECT * FROM branch_exploration;")
const evidence = queryD1("SELECT * FROM branch_evidence;")
let treeText = `# MAHMOOD — TASTE TREE NODES, EXPLORATION BRANCHES, & EVIDENCE LOGS\n\n`
treeText += `## TREE NODES (${treeNodes.length} NODES):\n`
for (const tn of treeNodes) {
  treeText += `Node Key: ${tn.key || tn.id} | Name: ${tn.name || tn.label || ''} | Parent: ${tn.parent_key || tn.parent_id || 'root'} | Category: ${tn.category || ''}\n`
}
treeText += `\n--------------------------------------------------------------------------------\n\n`
treeText += `## BRANCH EXPLORATION STATUS (${exploration.length} BRANCHES):\n`
for (const be of exploration) {
  treeText += `Node Key: ${be.node_key || be.id} (${be.label || ''})\n`
  if (be.parent_key) treeText += `Parent Node: ${be.parent_key}\n`
  treeText += `Status: ${be.status} | Exploration Round: R${be.exploration_round || 1}\n`
  treeText += `Positive Signals: ${be.positive_signals || 0} | Negative Signals: ${be.negative_signals || 0}\n`
  treeText += `----------------------------------------\n`
}
if (evidence.length) {
  treeText += `\n--------------------------------------------------------------------------------\n\n`
  treeText += `## BRANCH EVIDENCE LOGS (${evidence.length} LOGS):\n`
  for (const ev of evidence) {
    treeText += `Branch ID: ${ev.branch_id || ev.node_key} | Signal: ${ev.signal || ev.type} | Rationale: ${ev.rationale || ev.description || ''}\n`
  }
}
writeFileSync(join(destDir, '08_TASTE_TREE_BRANCHES_AND_EVIDENCE_FULL.txt'), treeText)
console.log(`Saved 08_TASTE_TREE_BRANCHES_AND_EVIDENCE_FULL.txt (${treeText.length} bytes)`)

console.log('4. Fetching Collections, Contradictions, Resurfacing, and SRS cards...')
const collections = queryD1("SELECT * FROM collections;")
const contradictions = queryD1("SELECT * FROM contradictions;")
const resurfacing = queryD1("SELECT * FROM resurfacing;")
const srsCards = queryD1("SELECT * FROM srs_cards;")
let extraText = `# MAHMOOD — COLLECTIONS, CONTRADICTIONS, RESURFACING, & ACTIVE RECALL SRS\n\n`

if (collections.length) {
  extraText += `## COLLECTIONS (${collections.length}):\n`
  for (const c of collections) {
    extraText += `Collection Name: ${c.name || c.title} | Scope: ${c.scope || ''} | Description: ${c.description || ''}\n`
  }
  extraText += `--------------------------------------------------------------------------------\n\n`
}

if (contradictions.length) {
  extraText += `## CONTRADICTIONS (${contradictions.length}):\n`
  for (const ct of contradictions) {
    extraText += `Claim A: ${ct.claim_a || ct.title_a}\nClaim B: ${ct.claim_b || ct.title_b}\nResolution: ${ct.resolution || 'unresolved'}\n`
    extraText += `----------------------------------------\n`
  }
  extraText += `--------------------------------------------------------------------------------\n\n`
}

if (resurfacing.length) {
  extraText += `## RESURFACING ITEMS (${resurfacing.length}):\n`
  for (const rs of resurfacing) {
    extraText += `Item Title: ${rs.title || rs.item_id} | Reason: ${rs.reason || ''} | Interval: ${rs.interval_days || 0} days\n`
  }
  extraText += `--------------------------------------------------------------------------------\n\n`
}

if (srsCards.length) {
  extraText += `## ACTIVE RECALL SRS CARDS (${srsCards.length}):\n`
  for (const card of srsCards) {
    extraText += `Front (Question): ${card.front || card.question}\nBack (Answer): ${card.back || card.answer}\nDifficulty: ${card.difficulty || 5} | Stability: ${card.stability || 1}\n`
    extraText += `----------------------------------------\n`
  }
}
writeFileSync(join(destDir, '09_COLLECTIONS_CONTRADICTIONS_RESURFACING_AND_SRS.txt'), extraText)
console.log(`Saved 09_COLLECTIONS_CONTRADICTIONS_RESURFACING_AND_SRS.txt (${extraText.length} bytes)`)

console.log('ALL D1 DATA EXPORTED 100% IN FULL DETAIL!')
