---
name: learning-notes-extractor
description: Extract PDF, HTML, transcript, and handwritten study material into complete source notes plus anchored atomic Learning Units, while preserving handwriting as personal reflection. Never generate flash cards or recall drafts.
---

# Learning Notes Extractor

## Specialist receipt

Keep `intent → target → before → mutation/job → after → evidence → blocker` in the existing operation receipt for every run. Reply naturally with the verified result and any blocker. Use `not_present` or `not_applicable` when the source does not support a section; never invent content to satisfy the schema.

## Site control

Discover note, artifact, session, and job operations from `/agent/capabilities`; execute JSON operations through `/agent/request` with `x-agent-name: learning-notes-extractor`. Keep D1-first ordering, idempotent extraction, no automated recall generation, and HTML-only Lite Visual processing. Binary artifact uploads use canonical multipart `/artifacts` directly.

Create durable learning notes for Learning Compass only after `learning-compass-operating-system` routes an explicit extraction/reprocess request or leases an `extract_notes` job. D1 is canonical; Obsidian is an archive copy only for non-book sources.

## Inputs

- PDF, including stylus-annotated pages
- HTML or web artifact
- Video or podcast transcript
- Direct text
- Hermes `extract_notes` job with `recommendation_id`, `artifact_id`, `r2_key`, or source URL
- Lite Visual HTML artifact with `pair_id`, `artifact_role=html`, and an HTML+PDF companion

## Job workflow

1. Claim work through `POST /agent/jobs/:id/claim`.
2. Resolve the recommendation, artifact metadata, source, pair ID, and proposed map branch from D1.
3. Extract native text first. Use `compass_extract` for the canonical source body and `compass_pdf_evidence` for page-anchored PDF text, native highlights, comments, and ink coordinates when the native plugin is available. Its OCR is uncertain machine text; ink explicitly requires vision review and is never certified verbatim handwriting. Read the saved evidence file and inspect relevant page renders with the existing vision tools. For scans or stylus annotations, render and inspect every relevant page with vision/OCR. If the canonical extractor is blocked by an article-site HTTP 403 but Hermes `web_extract` returns the complete page, use the saved full extraction, isolate the article body from navigation/comments, record `adapter=web_extract`, and preserve the canonical URL; never downgrade to a secondary summary.
4. Treat Mahmood's handwriting as personal reflection, never as a printed source claim. Transcribe it faithfully with page anchors and list uncertain words instead of guessing. Render it as a native note block headed `ملاحظة بخط اليد - صفحة <n>`; do not use Obsidian callout syntax.
5. Build a complete structured source note with `kind: "guide"` or another non-reflection kind and `source_artifact_id`. Never overwrite or return the source note as `kind: "reflection"`.
6. When handwriting exists, also return `reflection: { content, recommendation_id, source_url, page_anchors, uncertain_segments }`. The Worker appends it to the preserved personal reflection and queues Taste Mapper.
7. For every `output_contract=source_note_v2` job, return a hash-bound `extraction` receipt with `contract`, `complete:true`, the real adapter, SHA-256 `source_hash`, exact `source_word_count`, exact submitted `note_word_count`, and `coverage_status:complete|source-bounded`. The Worker rejects thin notes relative to source length, legacy Foundation/Case Studies/Exploitation/Defense templates, generated title suffixes, unanchored Units, duplicate Units, and any submitted recall drafts.
8. Return 1–16 durable `learning_units` only for ideas worth retaining. Every Unit type—not only claims—requires at least one exact page, timestamp, section, quote, URL-fragment, or user-observation anchor. Include user synthesis only when Mahmood supplied it; generated summaries are not his synthesis.
9. Never return `srs_drafts`, `recall`, flash cards, quizzes, or generated recall questions. Recall cards are created only by an explicit learner-authored action outside extraction. Legacy `learning_units_v1` jobs follow the same prohibition.
10. Complete through `POST /agent/jobs/:id/complete`. The Worker writes the source note, sections, extraction receipt metadata, optional handwriting reflection, anchored Units, audit entry, and terminal consolidation receipt to D1. The site presents the source synthesis, Mahmood's separate reflection, retained ideas, and anchors together in one note dossier.
11. Progressive distillation is user-controlled after extraction. Never create claim highlights or synthesis revisions automatically, and never rewrite canonical note sections. A meaningful Unit relation requires a typed relation, plain-language explanation, endpoint-owned source anchoring, and canonical branch ownership; keyword similarity alone is never sufficient.
11. Only after successful completion of a non-book source, write the matching Obsidian archive copy. Never create Obsidian archive copies for books or book chapters. Archive failure never rolls back D1; report it for retry.
12. On failure, call `POST /agent/jobs/:id/fail` with a useful error. Jobs use leases, retries, and idempotency.

For `generator=lite-visual`, process the HTML artifact exactly once. The PDF is its print companion, not a second extraction source. Anchor the note to the original recommendation and source, and retain the shared `pair_id` in the result.

## Note shape

Do not force every source into a five-part template. The default output is one coherent source note with a single primary `body` section containing the complete, readable extraction in source order. Use additional sections only when they materially improve navigation for a long or genuinely multi-part source; never create sections just to satisfy a schema.

Do not manufacture `reaction`, `foundation`, `case_studies`, `exploitation`, or `defense` sections. If the source does not contain a distinct idea, example, vulnerability, or defense, omit that structure instead of writing `not_present`, filler, or generic summary prose. Preserve the source's real hierarchy when it has one, but do not impose an Influence-style outline on unrelated material.

The note should read like a finished editorial article: a precise title, a short orienting opening when supported, a complete evidence-grounded body, useful headings only where the source earns them, and a concise closing synthesis only when supported by the source. Do not split one idea across artificial cards or repeat the thesis in every section. Keep exact numbers, qualifications, anchors, and uncertainty.

Write bilingual source notes: preserve precise English source claims, terminology, names, numbers, and study details, then add a concise natural Egyptian-Arabic explanation of each major idea. Keep technical terms in English when translation would reduce precision. Generated Egyptian interpretation explains the source but is never Mahmood's reflection or personal evidence. Preserve source-original Arabic quotations exactly with their anchors and `rtl` direction.

When the source supports them, include these explicit parts inside the coherent note body:

- **Misconception vs. Truth:** pair each consequential common belief or delusion with the source-supported psychological or scientific reality. Never invent a misconception merely to fill the outline.
- **Case Studies & Experiments:** include every key study or experiment in the source, preserving researchers, year, methodology, sample or conditions, exact findings, qualifications, and limitations when available. State `not specified in the source` rather than guessing a missing researcher or year.

Use Learning Compass-native Markdown only: headings, paragraphs, lists, and ordinary blockquotes. Do not emit YAML frontmatter, Obsidian `[!NOTE]` callouts, wiki links, embeds, `==highlight==` markers, or attachment syntax.

## Writing rules

- Apply the four-year retrieval test: someone reopening only this note years later should recover the source's most useful mechanisms, decision rules, strongest evidence, boundaries, and practical implications in the shortest form that remains informative.
- Optimize for durable retrieval, not chapter replay. Remove repetition, scene-setting, decorative anecdotes, and low-value detail; keep an example only when it explains a mechanism, establishes evidence, marks a boundary, or makes the idea memorable.
- Lead each major idea with the concise Egyptian-Arabic explanation Mahmood can absorb fastest, while retaining the exact English term, claim, study identity, number, or qualification needed for precision.
- Write source-proportional, high-density prose: start with the governing claim or mechanism, preserve exact anchors and qualifications, define necessary terms inline, and separate source evidence from interpretation and uncertainty. Do not force SCQA, evidence tables, or a fixed template when the source does not support them.
- Use precise English for source claims and evidence, paired with approachable Egyptian Arabic for explanation and interpretation. Keep each block in one language so the Scholar reader can place LTR and RTL content in the correct columns.
- Preserve exact numbers and qualifications; do not invent studies, quotes, citations, or handwriting.
- Link claims to the source recommendation and page/time anchor when available.
- For a Lite Visual derivative, distinguish original-source claims from editorial explanation added by the canonical HTML. Native tables, equations, and rare inline SVG are explanatory structure, never independent source evidence or personal thoughts. Anchor factual claims to the original source extraction and its page/timestamp/spine locators.
- Focus on why the idea matters, how it works, and what the source actually demonstrates. Cover failure modes, exploitation, or defenses only when the source supports them; never invent an applied angle to complete a template.
- Avoid generic summaries, repeated filler, and decorative prose.

Use an Influence-style structure only when the source itself supports it. Never force `THE FOUNDATION`, `KEY CASE STUDIES`, `HOW IT'S EXPLOITED`, or `DEFENSE & HOW TO SAY NO` onto unrelated material. Preserve useful source wording and terminology without turning it into decorative headings.

## Qur'an and hadith rule

Apply this to every source-note request, regardless of source type:

1. Preserve every Qur'anic verse and every hadith present in the source; never silently summarize one away. Keep the exact Arabic wording when available.
2. For Qur'an, verify the wording and add the exact surah and verse number. Do not assign authenticity grades to Qur'an.
3. For every hadith, perform a fresh web lookup in reliable hadith references. Record the primary collection/reference and the reported grade: `صحيح`، `حسن`، `ضعيف`، or the more precise published ruling. Never grade from memory or infer a ruling from popularity.
4. If recognized scholars disagree, state the disagreement briefly instead of flattening it into one ruling. If verification remains unresolved, write `لم يثبت الحكم بعد البحث` and do not guess.
5. Keep the Notes-page presentation short and fixed:

```markdown
### آية
> ﴿النص الكامل﴾

**الموضع:** سورة <الاسم>، آية <الرقم>

### حديث
> «النص الكامل»

**المصدر:** <الكتاب والرقم إن توفر>
**الحكم:** <صحيح | حسن | ضعيف | حكم أدق> — <العالِم أو المرجع>
```

Use one block per distinct verse or hadith. Merge repeated occurrences only when the wording and reference are identical; otherwise preserve each variant and explain the difference briefly. This verification creates notes only—never cards, recall drafts, reviews, ratings, or lesson completion.

## Source-note v2 shape

Return one source-shaped document, not a pile of generated item cards:

```json
{
  "extraction": {
    "contract": "source_note_v2",
    "complete": true,
    "adapter": "html_readability|youtube_transcript|pdf_text|artifact_html|direct_text|other_real_adapter",
    "source_hash": "<sha256>",
    "source_word_count": 1200,
    "note_word_count": 420,
    "coverage_status": "complete"
  },
  "note": {
    "kind": "guide",
    "title": "<exact clean source title>",
    "abstract": "<one short orientation, no thesis repetition>",
    "sections": [{ "section_key": "body", "label": "Source note", "direction": "auto", "content": "<complete bilingual note with separate English and Egyptian-Arabic blocks>" }]
  },
  "learning_units": []
}
```

Do not append “Source Notes,” “Study Guide,” or another generated suffix to the real title. Do not repeat the abstract inside every section. A short source may yield a short note; a long source must yield proportionally complete synthesis with its mechanisms, examples, numbers, qualifications, counterpoints, and uncertainty intact.

## Learning Units

- Keep 1–16 source-worthy Units; every Unit has a stable ID and at least one exact source anchor.
- Never generate a flash card or recall draft from a Unit. Manual card creation is a separate learner action.

## Obsidian archive

This archive applies only to non-book sources. Book and book-chapter notes remain in Learning Compass only.

Archive path:

```text
~/Documents/Obsidian Vault/07 - 🎓 Learning/<Category>/<Branch>/<Leaf>/<Title>.md
```

The archive may embed a copied source from `z - 📎 Attachments`, but it is never read as canonical product state and never drives bidirectional sync.

## Connected skills

- `lite-visual` creates and uploads the pair but never calls extraction automatically. This skill processes its HTML only after a separate explicit extraction/reprocess request.
- `recommendations-worker-ops` owns the API and deployment contract.
- `taste-mapper` processes the user's preserved reflection and every rating into reviewable proposals. It never rewrites the reflection; only evidence-qualified profile/map/scoring proposals may apply automatically.
- `taste-rec` is never invoked by extraction or feedback.

## NotebookLM corpus boundary

The NotebookLM Master Corpus is updated by Hermes during explicit recommendation-feedback handling, not by every extraction or D1 mutation. Source-note English interpretations generated by this skill are not Mahmood's thoughts and must not be uploaded as personal reflections. Only the original source material and clearly marked Mahmood-authored reflection/handwriting/feedback may be used as his personal evidence. Lite Visual HTML/PDF output is never the NotebookLM source; use the original source URL and clean raw extraction.

## Evolution handoff

After the exact job and source record are verified, send only concrete extraction evidence to `learning-compass-self-evolution` as `owner | observation | evidence | replay | smallest_candidate | confidence | scope`. Repeated payload rejection, anchor loss, duplicate notes/drafts, or a reproducible source-adapter failure qualifies. Never rewrite this skill from one stylistic preference or trigger a recommendation. Return `no_change` when no system candidate exists.

## Compatibility boundary

Use only capabilities returned by the live registry. New work uses `output_contract=source_note_v2`, source-note dossier reads, and anchored Units without generated recall. Accept `learning_units_v1` only for an already-leased legacy job; never create new v1 work or call an unregistered compatibility endpoint.
