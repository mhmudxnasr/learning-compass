# Learning Compass — Project Context

## Purpose

Learning Compass is Mahmood’s private, single-user learning operating system. It turns scattered sources into a disciplined loop:

**define a Learning Thread → capture/curate sources → consume at the original source or a verified canonical companion → reflect → consolidate anchored Learning Units → retrieve/apply → verify evidence → resurface**

The product is English-first, supports bilingual English/Egyptian-Arabic note blocks with per-block direction, and uses the `Africa/Cairo` timezone.

## Product model

- **Learning Threads** are purpose-first objects for one question, decision, build, or capability. They hold the reason it matters, definition of done, evidence requirements, source roles, synthesis, and verified state.
- **Sources** are reusable inputs, never proof by consumption alone. **Learning Units** are atomic claims, concepts, methods, examples, questions, applications, and counterclaims with exact anchors, user synthesis, stance, confidence, and typed relations. Notes are readable projections; Atlas is the navigation taxonomy.
- **Mastery** is separate from enjoyment. `retain`, `apply`, `reference`, and `drop` are explicit completion dispositions. Verified learning requires retrieval, explanation, transfer, decision, artifact, or application evidence.
- **Recall** uses approved, versioned FSRS cards. Ratings of 7–10 create editable SRS drafts, approval is required before Review, and failed reviews never advance mastery.
- **Consolidation** is explicit and durable, with visible terminal states such as closed, repair required, or waived. Hermes processes the exact work during the active workflow; no learning-core poller or autonomous recommendation chain exists.

## Capture and recommendation rules

- Every URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom capture enters the unlimited Inbox. RSS/Atom refreshes never bypass triage; enabled feeds refresh every six hours, scheduled imports are capped at 20 deduplicated entries per feed, and manual Check now is capped at five latest entries per feed.
- Queue normally holds five queued/in-progress sources. Explicit triage override is required to exceed the cap. Queue owns start, resume, return, and completion; opening a source, file, or companion elsewhere is passive and never creates a session. Every Queue item carries its branch context (`branch` id/label/round/status), note presence, recall count/due, and companion artifact links.
- Branches are the primary organizing axis. `tree_nodes` is the branch store; `recommendation_meta.branch_id` is the canonical source-to-branch linkage (dedup-key prefix resolution is the legacy fallback). Rounds are evidence-based: R1 untouched, R2 at first consumed source (or two notes / three approved recall cards), R3 at three consumed sources plus consolidation and recall strength; an explicit `round_label` wins over the derived value. The Branch Deck, the linked-items ledger (`/brain/branches/:id/items`), and the unified source dossier all present the same branch identity and round.
- Feedback is explicit and auditable. Not now is neutral and may resurface in Inbox; Bad fit requires a reason; rating, disposition, completion, and later learning evidence remain separate. Processing feedback never requests another recommendation automatically.
- Compass is Thread-first and source-grounded. Fit, bridge, and challenge lanes are bounded by evidence and rollout gates; shadow decisions do not serve until quality thresholds pass. Mastered/consumed sources and Mahmood’s standing exclusions are always applied.
- User-authored reflection is never rewritten. Invisible AI may enrich, rank, classify, and explain. Typed profile changes have provenance, confidence, version history, and reversible undo; Hermes self-evolution is evidence-gated, explicit, and unscheduled.

## Frontend contract

The shipped client is the **Botanical Folio / Evidence Ledger**: a green-and-cream studio with five root destinations and 11 grouped modes, with subordinate focus filters:

| Root destination | Grouped modes and subordinate focuses |
|---|---|
| Home | Today |
| Library | Triage (Queue, Inbox), Catalog (All sources, Books, Collections, Archive), Assets (Files) |
| Learn | Paths, Practice (Notes, Recall) |
| Map | Atlas, Review (Branches, Balance) |
| Settings | Personal (Profile, Preferences), Data & sync, System |

Desktop uses a persistent root rail, main canvas, and optional contextual inspector; there is no permanent context pane. Mobile uses a five-item bottom dock with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; selected-object inspection becomes a sheet or pushed detail view. Typed object routes preserve Source, Thread, Note, Unit, Recall Card, Branch, Node, Collection, Book, and Artifact identity. Legacy hashes canonicalize to purposeful routes and unknown hashes render recovery.

`client/src/main.tsx` is cut over to `client/src/app/entry.tsx`. The replacement is composed under `client/src/app`, `client/src/shell`, `client/src/workspaces`, and shared components; the retired monolithic shell/registry/styles files are removed as part of the cutover.

## System architecture and ownership

- `src/` contains the Hono Cloudflare Worker, API routes, domain logic, and scheduled infrastructure.
- `client/` contains the Vite + Preact + TypeScript application.
- `schema.sql` is the base schema; `migrations/` are ordered, idempotent production migrations.
- D1 is canonical for product records, learning state, graph data, receipts, and profile assertions. R2 stores large artifacts and linked reading companions. Obsidian is archive/export only.
- API mutations retain stable client IDs, offline outbox/retry/discard behavior, conflict visibility, and successful-response receipts. REST compatibility remains intact.
- Heavy graph code stays lazy-loaded. The base client target is at or below 150 KB gzip excluding lazy graph/vendor chunks.

## Hermes and reading companions

Lite Visual creates one linked HTML+PDF R2 pair for normal sources and one pair per book chapter, always in Arabic and always as two renderings of one canonical content body. The companion is designed to replace consuming the original while preserving every important argument and supporting detail. Complete-source checksum-backed mining, at least 90% semantic coverage, cached evidence, an optional zero-asset Visual Mind decision, deterministic content/render validation, real contact-sheet inspection, automatic post-pass publication, and canonical source-record verification are mandatory. Raw transcripts remain separate evidence and never count as companion prose. No subjective QA score is stored and Notes Extractor never starts automatically.

Hermes remains the procedural Learning Compass operating system. Its active workflow owns recommendation research, source-grounded candidate submission, feedback handling, typed profile learning, memory provenance, NotebookLM, Lite Visual, Visual Mind, RSS feeds, site operations, and self-evolution. It uses idempotent leases and recovery receipts but has no scheduled autonomous poller. Internal prompt payloads, job controls, and secrets do not render in normal product surfaces.

## Local verification and release truth

Run proportionate checks with the repository’s existing Node modules:

```bash
npm run typecheck
npm run build
git diff --check
```

The redesign implementation is built but not deployed. Focused live QA has been observed for the replacement; this contract cleanup does not claim E2E or full-suite verification. Deploy only after the release checklist, route/deep-link checks, responsive/accessibility checks, and required test suites are run.
