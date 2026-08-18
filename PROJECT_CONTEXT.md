# Learning Compass — Project Context

## Purpose

Learning Compass is Mahmood’s private, single-user learning operating system. It turns scattered sources into a disciplined loop:

**define a Learning Thread → capture/curate sources → consume at the original source or a verified canonical companion → reflect → consolidate anchored Learning Units → retrieve/apply → verify evidence → resurface**

The product is English-first. Notes Extractor source notes default to English with source-original Arabic quotations preserved inline; user-authored blocks retain their original language and per-block direction. The product uses the `Africa/Cairo` timezone.

## Product model

- **Learning Threads** are purpose-first objects for one question, decision, build, or capability. They hold the reason it matters, definition of done, evidence requirements, source roles, synthesis, and verified state.
- **Sources** are reusable inputs, never proof by consumption alone. **Learning Units** are atomic claims, concepts, methods, examples, questions, applications, and counterclaims with exact anchors, user synthesis, stance, confidence, and typed relations. Notes are readable projections; Atlas is the navigation taxonomy.
- **Mastery** is separate from enjoyment. `retain`, `apply`, `reference`, and `drop` are explicit completion dispositions. Verified learning requires retrieval, explanation, transfer, decision, artifact, or application evidence.
- **Recall** uses approved, versioned FSRS cards. Ratings of 7–10 create editable SRS drafts, approval is required before Review, and failed reviews never advance mastery.
- **Thread material ownership** is hierarchical and exact. Every Learning Thread owns direct notes, files, recall drafts, and approved cards; every Level owns a separate set of the same materials. The Thread path aggregates both without flattening or relabeling Level-owned records.
- **Consolidation** is explicit and durable, with visible terminal states such as closed, repair required, or waived. Hermes processes the exact work during the active workflow; no learning-core poller or autonomous recommendation chain exists.

## Capture and recommendation rules

- Every URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom capture enters the unlimited Inbox. RSS/Atom refreshes never bypass triage; enabled feeds refresh every six hours, scheduled imports are capped at 20 deduplicated entries per feed, and manual Check now is capped at five latest entries per feed.
- Queue normally holds five queued/in-progress sources. Explicit triage override is required to exceed the cap. Queue owns start, resume, return, and completion; opening a source, file, or companion elsewhere is passive and never creates a session. Every Queue item carries its branch context (`branch` id/label/round/status), note presence, recall count/due, and companion artifact links.
- Branches are the primary organizing axis. `tree_nodes` is the branch store; `recommendation_meta.branch_id` is the canonical source-to-branch linkage (dedup-key prefix resolution is the legacy fallback). Rounds are evidence-based: R1 untouched, R2 at first consumed source (or two notes / three approved recall cards), R3 at three consumed sources plus consolidation and recall strength; an explicit `round_label` wins over the derived value. The Branch Deck, the linked-items ledger (`/brain/branches/:id/items`), and the unified source dossier all present the same branch identity and round.
- Feedback is explicit and auditable. Not now is neutral and may resurface in Inbox; Bad fit requires a reason; rating, disposition, completion, and later learning evidence remain separate. Processing feedback never requests another recommendation automatically.
- Compass is Thread-first and source-grounded. Fit, bridge, and challenge lanes are bounded by evidence and rollout gates; shadow decisions do not serve until quality thresholds pass. Mastered/consumed sources and Mahmood’s standing exclusions are always applied.
- Recommendation novelty is checked against the complete curriculum of every non-abandoned Thread. Candidate titles, topics, concepts, mechanisms, summaries, and evidence are compared with Thread metadata plus every Level, lesson, and work item; strong contextual overlap is excluded even when the exact topic label differs, and Start revalidates the stored winner.
- User-authored reflection is never rewritten. Invisible AI may enrich, rank, classify, and explain. Typed profile changes have provenance, confidence, version history, and reversible undo; Hermes self-evolution is evidence-gated, explicit, and unscheduled.

## Frontend contract

The shipped client is the **Botanical Folio / Evidence Ledger**: a green-and-cream studio with five root destinations and 11 grouped modes, with subordinate focus filters:

| Root destination | Grouped modes and subordinate focuses |
|---|---|
| Home | Today |
| Library | Triage (Queue, Inbox), Catalog (All sources, Books, Collections, Archive), Assets (Files) |
| Learn | Threads (legacy Paths aliases), Practice (Notes, Recall) |
| Map | Atlas, Review (Branches, Balance) |
| Settings | Personal (Learning profile, Preferences), Data & recovery, System |

Desktop uses a persistent root rail, main canvas, and optional contextual inspector; there is no permanent context pane. Search, Capture to Inbox, and sync state are global rail tools rather than extra destinations. Mobile and tablet replace the rail with a five-item bottom dock plus separate Search and Capture utilities; primary modes remain an equal-width visible grid and subordinate filters remain compact wrapping controls. Selected-object inspection becomes a sheet or pushed detail view. Typed object routes preserve Source, Thread, Note, Unit, Recall Card, Branch, Node, Collection, Book, and Artifact identity. Legacy hashes canonicalize to purposeful routes and unknown hashes render recovery.

Display preferences are functional system settings, not previews. Preferences prioritize complete workspace styles, plain-language comfort controls, and learning behavior; expert theme, font, typography, custom-system, and Map tuning remain available through native progressive disclosure. Theme and custom palette choices update every semantic color plane and appropriate foreground, typography updates the application font contract, density changes shared spacing and control dimensions, corner style changes shared panel/control geometry, and reduced motion disables transitions throughout the product. These choices persist across reloads, while a server-saved custom palette remains authoritative when the custom theme is hydrated.

`client/src/main.tsx` is cut over to `client/src/app/entry.tsx`. The replacement is composed under `client/src/app`, `client/src/shell`, `client/src/workspaces`, and shared components; the retired monolithic shell/registry/styles files are removed as part of the cutover.

## System architecture and ownership

- `src/` contains the Hono Cloudflare Worker, API routes, domain logic, and scheduled infrastructure.
- `client/` contains the Vite + Preact + TypeScript application.
- `schema.sql` is the base schema; `migrations/` are ordered, idempotent production migrations.
- D1 is canonical for product records, learning state, graph data, receipts, and profile assertions. R2 stores large artifacts and linked reading companions. Obsidian is archive/export only.
- API mutations retain stable client IDs, offline outbox/retry/discard behavior, conflict visibility, and successful-response receipts. REST compatibility remains intact. Source annotations preserve quote/context, durable locators, language, checksums, and downstream provenance; `/search/evidence` returns that evidence ledger for Hermes instead of asking an agent to cite free-form summaries.
- Heavy graph code stays lazy-loaded. The base client target is at or below 150 KB gzip excluding lazy graph/vendor chunks.

## Hermes and reading companions

Lite Visual creates one linked HTML+PDF R2 pair for normal sources and one pair per book chapter, always in Arabic and always as two renderings of one canonical content body. The companion is designed to replace consuming the original while preserving every important argument and supporting detail. Complete-source checksum-backed mining, at least 90% semantic coverage, cached evidence, an optional zero-asset Visual Mind decision, deterministic content/render validation, real contact-sheet inspection, automatic post-pass publication, and canonical source-record verification are mandatory. Raw transcripts remain separate evidence and never count as companion prose. No subjective QA score is stored and Notes Extractor never starts automatically. Hard technical material defaults to beginner teaching unless branch competence is explicit. A paired Lite Visual and Audio Overview share one original-source teaching outline and synchronize concept order, terminology, examples, and section anchors for simultaneous listening and reading/highlighting.

Hermes remains the procedural Learning Compass operating system. Agent control protocol v2 (`2026-08-18`) exposes one structured capability registry that drives filtered discovery and OpenAPI, canonical Queue/Thread-evidence context with component health, and only two generic tools (`list_capabilities`, `site_request`). The Home cockpit and `GET /agent/briefing` share one deterministic next-action projection; `GET /agent/activity` exposes verified receipts, jobs, and pending proposals. Agent mutations use atomic request-fingerprinted idempotency reservations; high-risk changes require confirmation plus an exact-target field/value precondition; declared single or batch readbacks produce canonical before/after receipts, and post-commit verification failure is reported without pretending the write failed. The existing dependency-free MCP bridge consumes these read models and the new evidence search surface; it reads canonical public routes and sends guarded mutations directly through `/agent/request`, avoiding the unreliable same-Worker `/agent/tool-call` proxy while preserving idempotency, dry-run, risk gates, and verification. Its active workflow owns recommendation research, source-grounded candidate submission, feedback handling, typed profile learning, memory provenance, NotebookLM, Lite Visual, Visual Mind, RSS feeds, site operations, and self-evolution. It uses idempotent leases and recovery receipts but has no scheduled autonomous poller. Internal prompt payloads, job controls, and secrets do not render in normal product surfaces.

Capture interoperability includes a least-privilege Manifest V3 browser extension that opens the normal global capture dialog with a page URL or selected passage; it never stores API credentials and every capture still lands in Inbox. Private deployments can enable `REQUIRE_API_AUTH=true` so reads and writes require `x-api-token`; Telegram intake is separately protected by its webhook secret, optional allowed chat ID, and durable `update_id` deduplication. Recovery is explicit and portable: checksummed D1 exports are generated by `scripts/export-recovery.mjs`, verified by `scripts/verify-recovery.mjs`, and R2 binaries must be copied and checked separately as documented in `docs/recovery.md`.

## Local verification and release truth

Run proportionate checks with the repository’s existing Node modules:

```bash
npm run typecheck
npm run build
git diff --check
```

The redesign implementation is built, locally verified, and deployed as Worker version `d1c97c60-0b9c-4826-a1d3-e3c87a0fb466` on 2026-08-18. The release gate includes 114 unit tests plus typecheck, production build, full route/deep-link and responsive E2E, Hermes/bridge/migration verification, `git diff --check`, real-browser desktop/phone/tablet inspection, and HTTP 200 live API smoke checks. Future deployments still require an explicit release task and the live checks in the release checklist.
