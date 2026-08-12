import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adapter = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/fetch_transcript.py', 'utf8')
const liteVisual = readFileSync('/home/mahmud/.hermes/skills/lite-visual/SKILL.md', 'utf8')
const visualMind = readFileSync('/home/mahmud/.hermes/skills/visual-mind/SKILL.md', 'utf8')
const selfEvolution = readFileSync('/home/mahmud/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md', 'utf8')
const validator = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py', 'utf8')
const liteVisualQuality = readFileSync('/home/mahmud/.hermes/skills/lite-visual/SKILL.md', 'utf8')

test('YouTube transcript adapter is Arabic-first with English fallback', () => {
  assert.match(adapter, /default="ar,ar-SA,ar-EG,en"/)
  assert.match(adapter, /languages=languages/)
  assert.match(adapter, /"language"/)
  assert.doesNotMatch(adapter, /\.fetch\(video_id\(args\.url\)\)\s*$/m)
})

test('Hermes visual skills forbid the English-only transcript default', () => {
  assert.match(liteVisual, /Arabic-first.*English is only a fallback/s)
  assert.match(liteVisual, /Never call `YouTubeTranscriptApi\.fetch\(\)` with its default language list/s)
  assert.match(visualMind, /Arabic-first; English fallback only when Arabic is unavailable/s)
})

test('Hermes self-evolution repairs observed failures before closing no_change', () => {
  assert.match(selfEvolution, /## Failure-to-repair protocol/)
  assert.match(selfEvolution, /Reproduce it with the smallest safe replay/)
  assert.match(selfEvolution, /Add a regression test or deterministic validator/)
  assert.match(selfEvolution, /Do not close a reproducible repairable failure as `no_change`/)
})

test('Lite Visual validator blocks the observed artifact defects', () => {
  assert.match(validator, /unresolved template placeholder/)
  assert.match(validator, /unfinished mixed-language copy/)
  assert.match(validator, /visual retrieval questions must be unique/)
  assert.match(validator, /timestamp runs into retrieval prompt/)
  assert.match(validator, /metadata \{name\} is required/)
  assert.match(validator, /visual_plan with density and selection_rationale/)
  assert.match(validator, /critic must be run and pass before publication/)
  assert.match(validator, /all visuals share one section/)
})

test('Hermes visual batching forbids quota-shaped output and shared mutable pipelines', () => {
  assert.match(liteVisual, /Never use a fixed four-visual quota/)
  assert.match(liteVisual, /each source gets its own workspace and lock/)
  assert.match(visualMind, /Never fill a quota/)
})

test('Lite Visual keeps the repaired companion quality baseline for future files', () => {
  assert.match(liteVisualQuality, /Proven companion quality baseline/)
  assert.match(liteVisualQuality, /clear Arabic orientation/)
  assert.match(liteVisualQuality, /edited, source-faithful Arabic prose/)
  assert.match(liteVisualQuality, /collapsed.*print reading flow/s)
  assert.match(liteVisualQuality, /distinct retrieval question/)
  assert.match(liteVisualQuality, /computed from the finished artifact/)
  assert.match(liteVisualQuality, /Render every PDF page to PNG and inspect the contact sheet/)
  assert.match(liteVisualQuality, /text-heavy Arabic SVG directly into a Chrome PDF/)
  assert.match(liteVisualQuality, /Never apply `break-inside: avoid-page` globally/)
  assert.match(liteVisualQuality, /footer-only or near-empty pages/)
})
