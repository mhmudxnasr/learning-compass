import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adapter = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/fetch_transcript.py', 'utf8')
const liteVisual = readFileSync('/home/mahmud/.hermes/skills/lite-visual/SKILL.md', 'utf8')
const selfEvolution = readFileSync('/home/mahmud/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md', 'utf8')
const notebookLm = readFileSync('/home/mahmud/.hermes/skills/notebooklm/SKILL.md', 'utf8')
const validator = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py', 'utf8')
const uploader = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/upload_pair.py', 'utf8')
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

test('Visual Lite forbids the English-only transcript default', () => {
  assert.match(liteVisual, /scripts\/extract_source\.py/)
  assert.match(liteVisual, /references\/source-extraction\.md/)
  assert.match(liteVisual, /semantic HTML document in Arabic/)
})

test('Hermes self-evolution repairs observed failures before closing no_change', () => {
  assert.match(selfEvolution, /## Failure-to-repair protocol/)
  assert.match(selfEvolution, /Reproduce it with the smallest safe replay/)
  assert.match(selfEvolution, /Add a regression test or deterministic validator/)
  assert.match(selfEvolution, /Do not close a reproducible repairable failure as `no_change`/)
})

test('Lite Visual validator blocks the observed artifact defects', () => {
  assert.match(validator, /partition the complete source contiguously without gaps or overlap/)
  assert.match(validator, /article\[data-canonical-content=true\]/)
  assert.match(validator, /code-only companion contains forbidden media or interaction tags/)
  assert.match(validator, /HTML must not load remote styles, fonts, or assets/)
  assert.match(validator, /HTML overflows horizontally at 200% text size/)
  assert.match(validator, /PDF page \{page\} is near-empty/)
  assert.doesNotMatch(validator, /render_reviews|contact.sheet|screenshot\s*\(/i)
})

test('Visual Lite is source-designed code only with no image or template branch', () => {
  assert.match(liteVisual, /read these two current skills completely/)
  assert.match(liteVisual, /intent\/SKILL\.md/)
  assert.match(liteVisual, /frontend-design\/SKILL\.md/)
  assert.match(liteVisual, /source-specific CSS/)
  assert.match(liteVisual, /minimal inline SVG/)
  assert.match(liteVisual, /Do not invoke Visual Mind, AGY, Antigravity, ImageGen/)
  assert.match(liteVisual, /Do not create or request raster images/)
  assert.doesNotMatch(liteVisual, /call AGY automatically|generated-image/)
})

test('Hard-topic Lite Visual and NotebookLM outputs teach beginners and stay synchronized', () => {
  assert.match(liteVisual, /semantic equation markup when notation is essential/)
  assert.match(liteVisual, /explain every symbol in Arabic/)
  assert.match(notebookLm, /hard technical, mathematical, physical, or equation-heavy material must assume a beginner/)
  assert.match(notebookLm, /Audio Overview must follow the HTML\/PDF's concept order, terminology, examples, and section anchors/)
})

test('NotebookLM learning defaults to focused retrieval and truthful provider receipts', () => {
  assert.match(notebookLm, /defaults to one hard source-grounded `quiz`/)
  assert.match(notebookLm, /5–8 questions, hints before explanations, and at least one transfer question/)
  assert.match(notebookLm, /`audio` is Arabic \(`ar_eg`\) and is only for orientation or review/)
  assert.match(notebookLm, /Never generate every format/)
  assert.match(notebookLm, /Never turn `pending` into `ready` by inference/)
  assert.match(notebookLm, /never change lesson, Level, or Thread completion or recall scheduling/)
})

test('Lite Visual keeps the repaired companion quality baseline for future files', () => {
  assert.match(liteVisualQuality, /complete Arabic reading companion/)
  assert.match(liteVisualQuality, /only canonical reading body/)
  assert.match(liteVisualQuality, /replace consuming the source/)
  assert.match(liteVisualQuality, /mechanism, examples, evidence, qualifications, disagreements, and conclusion/)
  assert.match(liteVisualQuality, /gapless source coverage/)
  assert.match(liteVisualQuality, /source-specific CSS/)
  assert.match(liteVisualQuality, /responsive geometry at 360\/768\/1280px/)
  assert.match(liteVisualQuality, /Publish the pair atomically/)
})

test('Lite Visual publishes one validated atomic pair and verifies its source record', () => {
  assert.match(uploader, /\/artifacts\/pairs/)
  assert.match(uploader, /--receipt/)
  assert.match(uploader, /lite-visual-validation\/v5/)
  assert.match(uploader, /"recommended_start": "html"/)
  assert.match(uploader, /verify_pair/)
  assert.match(uploader, /source record did not expose the new pair as ready/)
  assert.doesNotMatch(uploader, /upload\("html"[\s\S]*upload\("pdf"/)
})
