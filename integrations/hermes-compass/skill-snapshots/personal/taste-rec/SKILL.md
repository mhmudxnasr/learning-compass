---
name: taste-rec
description: Compass Intelligence V2 recommendation owner for Mahmood. Use for an explicit recommendation, Queue fill, or best-source request for an exact Thread lesson/level/path; enforce target-fit, source-role, sequence, evidence, novelty, and verification gates, let the Worker own scoring, and never trigger from feedback or ordinary capture.
---

# Taste Rec

Own explicit recommendations, Queue fill, and best-source requests for an exact Thread target. Use `learning-compass-site-operator` for mutations; the Worker owns scoring, source checks, deduplication, confidence, and abstention.

## Choose the request path

- An ordinary recommendation, several recommendations, or Queue fill: read [recommendation-procedure.md](references/recommendation-procedure.md).
- Best material for a specific Lesson, Level, or complete path: read [target-source-fit.md](references/target-source-fit.md), then the recommendation procedure for submission and verification.
- Explicit feedback, diagnostic scoring/rollout inspection, or historical recommendation analysis: [scoring-and-feedback.md](references/scoring-and-feedback.md). Feedback routes back through the operating system; it does not create another pick.
- Explicit combined Lite Visual/NotebookLM work: [media-workflows.md](references/media-workflows.md). A normal recommendation does not load this reference.

## Essential selection rules

Reuse the selected procedure's fixed live preflight. Check consumed, mastered, active, queued, attached, and excluded material by canonical identity and topic. Use the live profile and a verified non-pruned branch/domain for every candidate. Never invent scores, verification flags, IDs, or source coverage.

For explicit source discovery, `compass_exa_search` is an optional second engine alongside existing web search. It adds public source links/excerpts, never verified recommendations or private context automatically. A small same-query trial found useful original-source diversity; it does not establish universal superiority, so retain the default engine and use Exa when it adds evidence. Normal exclusion, novelty, verification, and Worker scoring gates still apply.

Start with three source-grounded comparison candidates in fit, bridge, and challenge lanes. Expand the same pick only after abstention, up to 24 total. The Worker exposes one winner or a reasoned abstention; never force-start a withheld pick.

A normal recommendation stays reviewable until explicit Start. Explicit Queue fill may start ready picks up to the requested count or the five-item cap. Books require an explicit book request and top-level `allow_books: true`; books and chapters never become Queue items. Recommendations do not change lesson progression.

## Content boundaries

- **Books**: Never recommend a book unless Mahmood explicitly asks for books in that request. Only then send `allow_books: true` as a top-level field on `POST /compass/picks` (and `POST /compass/pick/:id/candidates`); it is a request-wide flag, not a per-candidate field.
- **Mastered Books & Topics**: Reuse the fixed preflight's mastered/exclusion data. NEVER recommend any book, video, podcast, article, talk, or summary derived from or about any mastered item (e.g. *The 48 Laws of Power*, *Steal Like an Artist*, *Predictably Irrational*, *Thinking Fast and Slow*).
- **Dopamine & Reward Neuroscience**: Fully mastered (dopamine, serotonin, habit loops, craving, PCC/DMN, addiction cycle). HARD REJECT all "dopamine hits", "break habit loops", or "rewire your brain" content.
- **Dark Patterns**: Harry Brignull blacklisted; follow Mathur/ProPublica deceptive patterns framing.
- **Islamic Content**: ZERO book-derived content. ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars.
- **Depth floor**: Reject ultra-short clips under about 10 minutes for Islamic material or any topic that requires a deep dive. Prefer the complete original lecture, talk, or source rather than an excerpt.
- **Death Content**: Theoretical/philosophical/existential angles only (TMT, Kierkegaard, Ernest Becker). HARD REJECT clinical/palliative content.
- **Storytelling**: Real-life/business/brand framing only (Will Storr craft). HARD REJECT fiction/screenwriting framing.
- **AI/AGI Curation Rules**:
  - **LOVES**: Practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, and workflow integrations.
  - **LOVES**: Major AI hardware announcements and model release news from top labs.
  - **HARD REJECT**: Theoretical/academic AI papers on low-level model training math or internals.
  - **Basic Tool Intros**: Save guides for tools already used only as ordinary captured Library sources; never promote them as curated recommendations by default.

## Completion

Verify the exact pick receipt and returned source dossier, including literal source ID, branch ID, domain, and source-check state. Keep those values in the operation evidence. Present the title/link, creator, why it fits, and any material limitation naturally; include internal IDs when requested or useful for diagnosis. A label never substitutes for verifying the branch ID.

For multiple requested items verify every dossier before reporting completion. An unverified last item leaves the batch incomplete. Explain an abstention honestly without inventing a replacement.

## Evolution handoff

After verification, send concrete prediction errors, invalid winners, repeated exclusions, or stale procedures to `learning-compass-self-evolution` with evidence and a replay. Do not change scoring/profile state here or turn feedback into another recommendation.
