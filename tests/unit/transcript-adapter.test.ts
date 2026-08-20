import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adapter = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/fetch_transcript.py', 'utf8')
const liteVisual = readFileSync('/home/mahmud/.hermes/skills/lite-visual/SKILL.md', 'utf8')
const visualMind = readFileSync('/home/mahmud/.hermes/skills/visual-mind/SKILL.md', 'utf8')
const selfEvolution = readFileSync('/home/mahmud/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md', 'utf8')
const notebookLm = readFileSync('/home/mahmud/.hermes/skills/notebooklm/SKILL.md', 'utf8')
const validator = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py', 'utf8')
const liteVisualQuality = readFileSync('/home/mahmud/.hermes/skills/lite-visual/SKILL.md', 'utf8')

test('YouTube transcript adapter is Arabic-first with English fallback', () => {
  assert.match(adapter, /default="ar,ar-SA,ar-EG,en"/)
  assert.match(adapter, /languages=languages/)
  assert.match(adapter, /"language"/)
  assert.match(adapter, /manual\.get\(selected\) or automatic\.get\(selected\)/)
  assert.match(adapter, /--timestamps/)
  assert.match(adapter, /sys\.stdout\.write\(transcript\)/)
  assert.match(adapter, /fetch_with_transcript_api/)
  assert.match(adapter, /fetch_with_whisper/)
  assert.doesNotMatch(adapter, /\.fetch\(video_id\(args\.url\)\)\s*$/m)
})

test('Hermes visual skills forbid the English-only transcript default', () => {
  assert.match(liteVisual, /language priority `ar,ar-SA,ar-EG,en`/)
  assert.match(liteVisual, /Author the output in Arabic regardless of transcript language/)
  assert.match(visualMind, /Use Arabic labels/)
})

test('Hermes self-evolution repairs observed failures before closing no_change', () => {
  assert.match(selfEvolution, /## Failure-to-repair protocol/)
  assert.match(selfEvolution, /Reproduce it with the smallest safe replay/)
  assert.match(selfEvolution, /Add a regression test or deterministic validator/)
  assert.match(selfEvolution, /Do not close a reproducible repairable failure as `no_change`/)
})

test('Lite Visual validator blocks the observed artifact defects', () => {
  assert.match(validator, /canonical content has no readable body text/)
  assert.match(validator, /duplicated canonical content blocks detected/)
  assert.match(validator, /canonical section coverage_ids must reference every source scope span/)
  assert.match(validator, /HTML must not load remote resources/)
  assert.match(validator, /PDF first page is near-empty/)
  assert.match(validator, /publication evidence render_reviews/)
})

test('Hermes visual batching forbids quota-shaped output and shared mutable pipelines', () => {
  assert.match(liteVisual, /Zero visuals remains valid only when no relationship becomes clearer by being seen/)
  assert.match(liteVisual, /isolated workspace/)
  assert.match(visualMind, /Reject quota-shaped output/)
})

test('Generated images use standing AGY authorization and prompt-first RTL quality', () => {
  assert.match(liteVisual, /call AGY automatically/)
  assert.match(liteVisual, /no per-run approval is needed/)
  assert.match(liteVisual, /genuine RTL reading order/)
  assert.match(liteVisual, /finished editorial artwork/)
  assert.match(liteVisual, /Do not run a subjective image audit/)
  assert.match(visualMind, /never pause for approval/)
  assert.match(visualMind, /right-to-left directional logic/)
})

test('Hard-topic Lite Visual and NotebookLM outputs teach beginners and stay synchronized', () => {
  assert.match(liteVisual, /assume Mahmood is a beginner in that branch unless he explicitly says otherwise/)
  assert.match(liteVisual, /unpack equations symbol by symbol/)
  assert.match(liteVisual, /shared teaching\/coverage outline/)
  assert.match(notebookLm, /hard technical, mathematical, physical, or equation-heavy material must assume a beginner/)
  assert.match(notebookLm, /Audio Overview must follow the HTML\/PDF's concept order, terminology, examples, and section anchors/)
})

test('Lite Visual keeps the repaired companion quality baseline for future files', () => {
  assert.match(liteVisualQuality, /complete Arabic \*\*reading companion\*\*/)
  assert.match(liteVisualQuality, /one canonical body/)
  assert.match(liteVisualQuality, /replace watching, listening to, or reading the original source/)
  assert.match(liteVisualQuality, /mechanisms, examples, evidence, qualifications, disagreements, and conclusion/)
  assert.match(liteVisualQuality, /prose dump dressed with headings, and an image atlas/)
  assert.match(liteVisualQuality, /accessible source-specific color system/)
  assert.match(liteVisualQuality, /validate hashes, responsive geometry, text extraction, canonical parity, figures, and page composition/)
  assert.match(liteVisualQuality, /Publish automatically only after the deterministic gate passes/)
})
