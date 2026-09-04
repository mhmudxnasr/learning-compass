import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const adapter = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/fetch_transcript.py', 'utf8')
const adapterPath = '/home/mahmud/.hermes/skills/lite-visual/scripts/fetch_transcript.py'
const sourceExtractor = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/extract_source.py', 'utf8')
const mediaTranscription = readFileSync(
  '/home/mahmud/.hermes/skills/media/media-transcription-systems/SKILL.md',
  'utf8',
)
const liteVisual = [
  'SKILL.md',
  'references/source-extraction.md',
  'references/coverage-contract.md',
  'references/reading-companion-design.md',
  'references/publication-and-recovery.md',
]
  .map((file) => readFileSync(`/home/mahmud/.hermes/skills/lite-visual/${file}`, 'utf8'))
  .join('\n')
const selfEvolution = readFileSync(
  '/home/mahmud/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md',
  'utf8',
)
const notebookLm = readFileSync('/home/mahmud/.hermes/skills/notebooklm/SKILL.md', 'utf8')
const validator = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/validate_artifact.py', 'utf8')
const uploader = readFileSync('/home/mahmud/.hermes/skills/lite-visual/scripts/upload_pair.py', 'utf8')
const liteVisualQuality = liteVisual

test('YouTube transcript adapter is Arabic-first with English fallback', () => {
  assert.match(adapter, /VERSION = "lite-visual-transcript\/3"/)
  assert.match(sourceExtractor, /VERSION = "lite-visual-source-extractor\/4"/)
  assert.match(sourceExtractor, /--verified-transcript-receipt/)
  assert.match(sourceExtractor, /"local_transcript_sha256"/)
  assert.match(sourceExtractor, /"duplicate_passage_safe"/)
  assert.match(adapter, /default="ar,ar-SA,ar-EG,en"/)
  assert.match(adapter, /languages=languages/)
  assert.match(adapter, /"language"/)
  assert.match(adapter, /manual\.get\(selected\) or automatic\.get\(selected\)/)
  assert.match(adapter, /--timestamps/)
  assert.match(adapter, /sys\.stdout\.write\(transcript\)/)
  assert.match(adapter, /fetch_with_transcript_api/)
  assert.match(adapter, /fetch_with_whisper/)
  assert.match(adapter, /receipt\["audio_fallback_reason"\]/)
  assert.doesNotMatch(adapter, /\.fetch\(video_id\(args\.url\)\)\s*$/m)
})

test('YouTube audio fallback runs only after captions are positively confirmed absent', () => {
  const code = `
import importlib.util, json
s=importlib.util.spec_from_file_location('t','${adapterPath}')
m=importlib.util.module_from_spec(s)
s.loader.exec_module(m)
calls={'audio': 0}
def absent(*args, **kwargs): raise m.CaptionsAbsent('zero tracks')
def audio(*args, **kwargs):
    calls['audio'] += 1
    return (' '.join(['كلمة'] * 25), 'ar', {'method': 'faster-whisper', 'caption_kind': 'speech-to-text'})
m.fetch_with_transcript_api=absent
m.fetch_with_ytdlp=absent
m.fetch_with_whisper=audio
text, language, receipt, checks, failures=m.acquire_transcript('https://www.youtube.com/watch?v=fixture', ['ar','en'], True, False)
print(json.dumps({'calls': calls, 'reason': receipt.get('audio_fallback_reason'), 'evidence': len(receipt.get('caption_absence_evidence', [])), 'passed': checks['minimum_words']}))
`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    calls: { audio: 1 },
    reason: 'youtube_captions_confirmed_absent',
    evidence: 2,
    passed: true,
  })
})

test('YouTube caption lookup failures block without downloading audio', () => {
  const code = `
import importlib.util, json
s=importlib.util.spec_from_file_location('t','${adapterPath}')
m=importlib.util.module_from_spec(s)
s.loader.exec_module(m)
calls={'audio': 0}
def failed(*args, **kwargs): raise RuntimeError('network blocked')
def audio(*args, **kwargs): calls['audio'] += 1; raise AssertionError('audio must not run')
m.fetch_with_transcript_api=failed
m.fetch_with_ytdlp=failed
m.fetch_with_whisper=audio
try:
    m.acquire_transcript('https://www.youtube.com/watch?v=fixture', ['ar','en'], True, False)
except RuntimeError as error:
    print(json.dumps({'calls': calls, 'blocked': 'availability could not be confirmed' in str(error)}))
else:
    raise SystemExit('expected caption uncertainty to block')
`
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { calls: { audio: 0 }, blocked: true })
})

test('media transcription skill owns the strict YouTube no-caption gate', () => {
  assert.match(
    mediaTranscription,
    /audio transcription is allowed only after at least one complete inventory positively reports zero manual and zero generated tracks/i,
  )
  assert.match(mediaTranscription, /audio_fallback_reason=youtube_captions_confirmed_absent/)
  assert.match(mediaTranscription, /caption lookup fails without proving absence, stop with a blocked receipt/i)
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
  assert.match(
    liteVisual,
    /former `.agents\/skills\/intent` and `.agents\/skills\/frontend-design` paths have been retired/,
  )
  assert.match(liteVisual, /apply the required Intent and Frontend Design reasoning directly/i)
  assert.match(liteVisual, /source-specific CSS/)
  assert.match(liteVisual, /minimal inline SVG/)
  assert.match(liteVisual, /No raster\/generated images, image agents, Visual Mind, preset themes\/palettes\/layouts/)
  assert.match(liteVisual, /Forbidden inside the companion:[\s\S]*raster assets/)
  assert.doesNotMatch(liteVisual, /call AGY automatically|generated-image/)
})

test('Hard-topic Lite Visual and NotebookLM outputs teach beginners and stay synchronized', () => {
  assert.match(liteVisual, /semantic equation markup when notation is essential/)
  assert.match(liteVisual, /explain every symbol in Arabic/)
  assert.match(notebookLm, /hard technical, mathematical, physical, or equation-heavy material must assume a beginner/)
  assert.match(
    notebookLm,
    /Audio Overview must follow the HTML\/PDF's concept order, terminology, examples, and section anchors/,
  )
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
  assert.match(liteVisualQuality, /complete source-faithful Arabic reading companion/)
  assert.match(liteVisualQuality, /one canonical semantic HTML article/)
  assert.match(liteVisualQuality, /replace the original/)
  assert.match(liteVisualQuality, /mechanism, examples, evidence, qualifications, disagreements, and conclusion/)
  assert.match(liteVisualQuality, /gapless source coverage/)
  assert.match(liteVisualQuality, /source-specific CSS/)
  assert.match(liteVisualQuality, /responsive geometry at 360\/768\/1280px/)
  assert.match(liteVisualQuality, /Publish the pair atomically/)
})

test('Lite Visual publishes one validated atomic pair and verifies its source record', () => {
  assert.match(uploader, /\/artifacts\/pairs/)
  assert.match(uploader, /--receipt/)
  assert.match(uploader, /from receipt_attestation import RECEIPT_SCHEMA/)
  assert.match(uploader, /passing \{RECEIPT_SCHEMA\} receipt/)
  assert.match(uploader, /"recommended_start": "html"/)
  assert.match(uploader, /verify_pair/)
  assert.match(uploader, /source record did not expose the new pair as ready/)
  assert.doesNotMatch(uploader, /upload\("html"[\s\S]*upload\("pdf"/)
})
