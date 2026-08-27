# Learning Compass: Complete Team Review Prompt

Copy everything below into the team discussion or the AI/tool your team uses for product review.

---

## Your Assignment

You are reviewing **Learning Compass**, Mahmood's private, single-user learning operating system.

Understand the product as it exists today, then propose a coherent next version. Identify what should be **kept, improved, simplified, merged, removed, fixed, or deferred** across product, UX, learning design, engineering, data, and operations.

Do not produce a generic feature wishlist. Every proposal must solve an observed problem, respect the system invariants, name its owning surface, describe implementation consequences, and explain what existing complexity it replaces or removes.

The goal is not more features. The goal is a smaller, clearer, more reliable system that closes the learning loop better for one serious learner.

### Evidence Policy

Treat this brief as the supplied product and architecture evidence. Do not invent usage patterns, live state, user complaints, or measurements that are not included. Separate every conclusion into one of these evidence levels:

- **Documented:** stated in this brief or its named canonical sources.
- **Implementation-observed:** confirmed in source code by a reviewer with repository access.
- **Live-verified:** confirmed against the production application or API.
- **Hypothesis:** plausible but requires usage data, usability testing, screenshots, API samples, or live verification.

If you do not have repository or production access, produce a product/architecture review from the documented evidence and label implementation or usage claims as hypotheses. Do not pretend to have performed local or live verification. State the smallest artifact or measurement needed to resolve each material uncertainty.

## Product In One Sentence

Learning Compass is a zero-noise, purpose-first personal learning ledger that turns scattered sources into deliberate, source-grounded learning through finite Threads, bounded commitments, reflection, durable notes, learner-authored recall, direct lesson completion, knowledge mapping, and resurfacing.

## Product Vision

The system should help Mahmood:

- Define what he is trying to understand, decide, build, or become capable of doing.
- Capture useful material without turning every saved item into a commitment.
- Commit to only a small number of sources at once.
- Consume original sources or verified Arabic reading companions.
- Preserve his exact reflections without AI rewriting them.
- Retain useful claims, mechanisms, examples, evidence, and applications.
- Create recall material only when he chooses to author it.
- Progress through finite lessons without artificial gates.
- See how knowledge connects through evidence-backed relationships.
- Resurface useful material later without creating another engagement feed.

The core promise is:

> Capture freely, commit sparingly, learn deliberately, preserve exact provenance, and resurface what remains useful.

Learning Compass deliberately separates:

- Saving from commitment.
- Passive reading from tracked sessions.
- Source usefulness from curriculum progression.
- Personal reflection from extracted source claims.
- Notes from canonical source evidence.
- Recall from automated generation.
- Knowledge relationships from keyword similarity.
- Books from Queue commitments.
- Advisory intelligence from progression gates.

## Target User

The product has one user: **Mahmood**, a serious learner in Egypt using the `Africa/Cairo` timezone.

This is not a multi-tenant SaaS product. Optimize for Mahmood's long-term learning quality, clarity, retrieval, and operational control rather than market breadth, social features, or engagement metrics.

Mahmood values:

- Practical and applicable depth.
- Verified sources and exact provenance.
- Finite paths instead of endless feeds.
- Honest, direct interface language.
- Explicit decisions and reversible changes.
- English-first product operations.
- Arabic reading companions.
- Extracted notes that pair precise English claims with concise natural Egyptian-Arabic explanation.
- Hidden mechanisms, incentives, power, social games, biases, historical patterns, and practical application.
- Practical AI tools, agents, local LLM workflows, deterministic tool use, and major model or hardware releases.
- Real-world, business, and brand storytelling rather than fiction or screenwriting.
- Theoretical or existential death content rather than clinical or palliative material.

Standing recommendation exclusions include:

- Anything already consumed or mastered.
- Beginner dopamine, habit-loop, or "rewire your brain" content.
- Low-level AI training mathematics unless explicitly requested.
- Harry Brignull framing for dark patterns; Mathur/ProPublica framing is preferred.
- Islamic books, audiobooks, explained books, or book-based lecture series. Islamic recommendations must be original lectures, khutbahs, or talks by trusted Sunni scholars.

## Devices And Context

- Desktop web application with a persistent root rail.
- Mobile and tablet installable PWA with a five-item bottom dock.
- Huawei TGR-W09 tablet for Arabic HTML/PDF companions.
- Android share target into Capture.
- Browser extension that opens the normal Capture flow without storing credentials.
- A future Play Store package may use a Trusted Web Activity with verified Digital Asset Links.
- A separate native application or generic WebView fork is not accepted.

## Core Learning Loop

```text
define a Learning Thread
-> capture and curate sources
-> explicitly commit selected sources to Queue
-> consume at the original source or verified companion
-> return and reflect
-> optionally retain/apply into structured notes and anchored Learning Units
-> optionally create learner-authored Arabic recall cards
-> complete lessons directly
-> map, synthesize, and resurface
```

Operationally:

```text
capture -> curate -> consume -> reflect -> notes
-> review -> map update -> resurface
```

Critical separations:

- Capture never implies Queue commitment.
- Opening a source outside Queue is passive.
- Queue Start/Resume creates or resumes a tracked session.
- Feedback never requests another recommendation automatically.
- Rating never creates notes.
- Only explicit `retain` or `apply` may request source-note consolidation.
- No automated workflow may generate flash cards or recall drafts.
- Only direct lesson completion advances Levels and Threads.
- Projects, sources, notes, ratings, dispositions, recall, artifacts, recommendation outcomes, and provider receipts never advance progression.
- Resurfacing, frontier state, semantic relationships, contradiction review, note distillation, adaptive depth, perspective diversity, and delivery context are advisory or reflective only.

## Current Information Architecture

The client uses hash routing and has five roots with 12 grouped modes.

| Root | Grouped modes | Subordinate focuses |
|---|---|---|
| Home | Today | None |
| Library | Books, Triage, Archive, Files | Triage contains Queue and RSS Feeds |
| Learn | Threads, Practice | Practice contains Notes, Recall, and Contradictions |
| Map | Atlas, Review | Review contains the unified Branch Dossier |
| Settings | Personal, Data & recovery, System | Personal contains Learning profile and Preferences |

Desktop uses a persistent labeled root rail, global Search and Capture utilities, a main working canvas, and an optional contextual inspector. Mobile replaces the rail with a five-item bottom dock and turns inspection into a sheet or pushed detail view. Interactive mobile targets must be at least 44x44px.

Typed routes preserve object identity for Sources, Artifacts, Books, Threads, Levels, Lessons, Notes, Units, Recall Cards, Branches, Nodes, and Canon Domains. Unknown routes show recovery. Retired URLs redirect to current purposeful surfaces rather than generic infrastructure pages.

## Current Feature Inventory

Unless an item explicitly says otherwise, **Implemented** means documented as part of the current product contract and recent release history. It does not independently prove that the current dirty worktree, latest deployment, and live runtime are identical. In the required matrix, use one of: documented current, implementation-observed, live-verified, local/in-progress, compatibility-only, retired, known inconsistency, or unverified.

### Global Shell And PWA

Implemented:

- Responsive five-root shell.
- Global indexed search.
- Global Capture dialog.
- Offline mutation queue with retry, discard, and conflict visibility.
- Typed object routes and legacy-route recovery.
- Functional appearance, typography, density, motion, and behavior preferences.
- Installable Android PWA.
- Android share target.
- Browser extension Capture handoff.
- Offline application shell.
- Exact-URL offline caching for an HTML companion after its first successful online open.
- Launcher shortcuts for Capture, Queue, and Recall.

Constraints:

- PDFs and unopened HTML companions remain network-dependent.
- Atlas and other heavy libraries must remain lazy-loaded.
- Base client target is at most 150 KB gzip, excluding lazy graph/vendor chunks.
- The PWA is the canonical Android product.

### Home

Implemented:

- A current source selected from active Queue commitments.
- Passive links to Original, HTML, PDF, files, and NotebookLM.
- Explicit Queue handoff for tracked Start/Resume.
- One current lesson turn from every active, paused, or planned Thread.
- Queue and RSS summaries.
- Daily Memory Shelf resurfacing.
- Resurfacing actions: Star, Reviewed, Snooze seven days, and Dismiss.
- Branch and domain context.
- Quick Capture.
- Shared deterministic next-action logic with the agent briefing API.

Constraints:

- Home must not become an algorithmic engagement feed.
- Opening a source on Home remains passive.
- Resurfacing may change its own order but never Queue order or lesson progress.

### Capture And Source Records

Implemented:

- URL, text, PDF, HTML, video, Telegram, extension, Android share-target, RSS, and Atom intake.
- Durable source records with `learning_state="captured"`.
- Deduplication by normalized source identity.
- Optional idempotent enrichment jobs.
- Source annotations with exact quote, surrounding context, durable locator, language, checksum, and optional Thread/branch ownership.
- Evidence-first retrieval through `/search/evidence`.
- Explicit branch mapping and remapping.
- A canonical source dossier combining identity, branch, feedback, notes, sessions, artifacts, recall, Thread connections, Compass provenance, and outcomes.
- Preferred Original URL replacement without recreating the source.

Current product choice:

- There is no standalone All Sources page. Captures remain durable and are reachable through search, source dossiers, Queue, Archive, Threads, and linked surfaces.

Known inconsistency:

- Product rules require every capture to persist a verified non-pruned branch and domain, but some current ingestion paths can create a capture without a branch. The review must propose a low-friction resolution rather than ignoring the invariant or making capture unusably heavy.

### Library: Queue

Implemented:

- Queue is the explicit commitment shelf.
- Normal cap of five queued or in-progress sources.
- Explicit override for overflow.
- Gallery and ledger modes.
- Queue position, rationale, context brief, branch pill, note state, recall count/due, companion availability, and recommended starting medium.
- Target-aware Start and Resume.
- Administrative Exclude.
- Source dossier access.
- Advisory delivery context such as effort, depth, language, and mode.

Rules:

- Queue order remains canonical.
- Delivery context may filter but not reorder commitments.
- Exclusion is administrative and is not automatically a negative taste signal.
- `not_now` is neutral.
- Books and book chapters never enter Queue.
- A source needs a verified non-pruned branch before Queue commitment.

### Library: RSS Feeds

Implemented:

- RSS/Atom subscription management.
- Initial import as captured records.
- Feed and entry ledgers.
- Manual and per-feed synchronization.
- Unsubscribe while preserving imported records.
- Entry removal and feed-history clearing.
- Six-hour scheduled refresh.
- Conditional HTTP and deduplication.
- Private/local URL and unsafe-redirect rejection.
- 2 MB response cap.
- Scheduled import cap of 20 entries per feed.
- Manual check capped at the latest five entries.

### Library: Archive

Implemented:

- Completed and administratively excluded sources only.
- Server-side filtering before pagination.
- Separation of manual sources and feed entries.
- Branch, notes, recall, companion context, and source dossier access.
- Explicit permanent deletion for eligible non-active records.

Retired surfaces:

- All Sources.
- Reading Journal and Hardcover workspace.
- Collections.
- Generic Catalog as a product concept; `catalog` may remain an internal compatibility URL for visible Archive.
- Inbox as a separate destination.

### Library: Files

Implemented:

- R2-backed artifacts and metadata.
- Source ownership and artifact viewing.
- Explicit note-processing action.
- File removal.
- HTML/PDF companion visibility.
- NotebookLM links.
- At most one Thread, Level, or Lesson owner.
- Book-chapter artifacts excluded from the general Files collection.

Constraint:

- Generic artifact upload cannot publish Lite Visual companions. HTML/PDF companions require the atomic validated pair route.

### Library: Books

Books is the first and default Library workspace.

Implemented:

- One continuous Books room with no Shelf/Canon tab split.
- One explicitly pinned Current Book; no automatic fallback when it is cleared or finished.
- Reading desk with author, verified branch, Canon context, connected Threads, progress, next chapter, passive HTML/PDF/NotebookLM links, and manual chapter completion.
- My Books ledger with search, reading-state filter, branch filter, Canon filter, branch-first grouping, Reading/Saved/Finished bands, bounded initial rendering, and incremental expansion.
- Personal states: `saved`, `reading`, and `finished`.
- Personal book state independent from Queue.
- Add Book requiring title, author, and verified branch; ISBN, URL, and rationale are optional.
- Focused Book dossier with state, branch/domain, Canon membership, Threads, chapters, notes, recall, files, anchors, sessions, and feedback.
- One canonical side-effect-free projection shared by list and dossier.
- Synthetic Chapter 0 retired.
- Explicit chapter registration and completion.
- One Lite Visual HTML/PDF pair per chapter.

Canon is an evergreen three-book relationship model with Foundation, Representative, and Boundary roles. It supports ready/incomplete fields, branch ownership, role rationales, replacement history, and explicit capture into the same personal book identity.

A Canon domain may create a normal draft Thread only when its verified branch exists, all three distinct roles are approved, the field is complete, and at least one selected book is captured.

Canon must not become a sixth root, second book collection, progression model, or duplicate of My Books.

Book links and chapter companions are passive. Books have no current Queue-based Start/Resume flow because they are excluded from Queue. Session history in a Book dossier may contain legacy or externally associated history; do not infer that opening a Book currently creates a tracked session.

### Learn: Threads

A Learning Thread represents one question, decision, build, or capability. It may contain a guiding question, definition of done, interview context, ordered Levels, ordered lessons, reusable source attachments, optional projects, exact ownership for related records, and final synthesis.

Implemented:

- Thread list and typed Thread routes.
- Thread status and lifecycle.
- Ordered Levels and explicit start of the available Level.
- Authored lessons.
- Searchable card/list curriculum.
- Lesson readiness, current/next navigation, and typed Level/Lesson routes.
- Lesson learning contracts: why learn, why now, and takeaway.
- Exact lesson materials with role and branch provenance.
- Material launcher preferring persisted recommended medium, then HTML, then Original.
- Purpose-labelled alternatives.
- Optional projects and final synthesis.
- Batched reads proven against a 183-Level, 294-lesson Thread.

Progression:

- Lesson states are `not_started`, `in_progress`, and `completed`.
- Completing the last unfinished lesson completes its Level and unlocks the next.
- Completing every Level completes the Thread.
- No other object or action can gate or advance progression.

Lesson source roles:

- Replacement-safe single slots: `primary`, `case`, `challenge`, `reference`.
- Additive slot: `optional`.
- Every attachment must persist the exact role and verified Level branch.

### Learning Units And Relationships

Learning Units are retained atomic claims, concepts, methods, examples, questions, applications, and counterclaims.

A Unit can carry an exact source anchor, user synthesis, stance, confidence, and canonical branch/domain.

Relations are typed as `supports`, `contradicts`, `qualifies`, `example_of`, `depends_on`, or `applies_to`. Every relation requires an explanation and endpoint-owned source anchor.

Meaningful backlinks, bridges, and contradiction review derive from these anchored relations. Keyword overlap alone never creates a meaningful relationship.

### Learn: Notes

Implemented:

- Structured D1 note storage.
- Searchable index and source/personal/reflection filters.
- Create, edit, and delete.
- Source-centric grouping and per-block text direction.
- Exact Thread, Level, or Lesson ownership.
- Typed note route.
- Scholar Workspace with bilingual columns where appropriate, responsive mobile reading, section navigation, source/branch context, related notes, retention tools, and owner navigation.
- Extracted source notes pairing precise English claims/evidence with concise natural Egyptian-Arabic explanation.
- Misconception vs. Truth and complete supported study/experiment coverage with researcher, year, method, finding, and limitation.
- Verbatim handwriting and preservation of user-authored language, register, and direction.
- Evidence-backed related notes.
- Explicit additive distillation: checksum-bound highlights, stale detection, append-only synthesis revisions, and explicit promotion into a Unit.

Rules:

- Canonical note text is never rewritten by distillation.
- Rating alone never creates a source note.
- `retain` or `apply` may initiate source-note consolidation and anchored Units.
- Lite Visual never starts Notes Extractor automatically.
- Book and chapter notes remain only in Learning Compass.
- Only extracted non-book notes may be exported to Obsidian.

### Learn: Recall

Implemented:

- FSRS-6 scheduling through `ts-fsrs`.
- Due review with Again, Hard, Good, and Easy.
- Arabic RTL questions and answers.
- Branch, source, and exact-anchor context.
- Existing historical draft editing, approval, and rejection.
- Approved-card library, search, filters, deletion, and typed card routes.
- Thread, Level, Lesson, note, Unit, and source lineage where available.
- Learner-authored card creation API.

Hard rule:

- No automated workflow may create cards, drafts, or suggested question-answer pairs.
- No cards from extraction, ratings, HTML synchronization, or maintenance backfills.
- A new card requires an explicit learner-authored Arabic question and answer.
- Historical drafts remain editable and approvable.
- Failed reviews never alter lesson or Thread progression.

### Learn: Contradictions

Implemented:

- Review based on anchored `contradicts` Unit relations.
- Both claims and sources remain preserved.
- Contradictions are reviewed rather than automatically resolved.
- Legacy rating-tension signals are compatibility-only.

### Map: Atlas

Implemented:

- Lazy-loaded Cytoscape graph.
- Domain, branch, and topic hierarchy.
- Evidence-backed semantic edges.
- Full-height workspace canvas.
- Typed node routes.
- Search with ancestry recovery.
- Domain/frontier filters and subtree isolation.
- Semantic-neighborhood focus.
- Selection separate from expansion.
- Single tap selects; repeated/double tap expands or collapses subtree.
- Keyboard traversal and Enter expansion.
- Depth, fullscreen, minimap, viewport, export, node/edge/force, and reduced-motion controls.
- Spatially bounded force interactions above 320 visible nodes.
- Stable hierarchy-aware opening.
- Pruned branches hidden; held branches remain visible.
- Advisory frontier states and empty-filter recovery.

Rules:

- `tree_nodes` is the canonical branch store.
- Semantic relationships come from anchored Unit relations.
- Bridges are derived, not duplicated into a synthetic graph.
- Frontier, coverage, and retention remain advisory.
- Legacy or invalid unmapped sources remain visible in balance/repair projections rather than being silently assigned. They are an integrity condition to repair, not an allowed target state for new captures. "Unmapped" here means missing canonical branch ownership, not merely absent from the currently rendered graph viewport.

### Map: Unified Branch Review

Implemented:

- One Branch Dossier instead of separate Branches and Balance tabs.
- Search and dynamic domain filters.
- Active, Priority, Paused, and Archived views.
- Create and edit label, domain, scope, topics, and boundary.
- Keep active, make first priority, pause, archive, and undo.
- Linked ledger for sources, notes, Units, recall, artifacts, and bridges.
- Attention, activity, coverage, retention, and priority signals.
- Typed branch routes and reversible state changes.

Canonical taxonomy:

```text
Super Category / Domain
-> Knowledge Branch (`tree_nodes`)
-> Topics / Leaves (`meta_json.leaves`)
```

Branches have a 1-5 priority rank and `love`, `active`, `held`, or `pruned` status.

Synthetic `R1`, `R2`, and `R3` rounds are retired. Legacy round fields may survive only in compatibility data and historical records. Do not restore rounds as a visible taxonomy or progression model.

### Settings

Learning Profile currently includes identity, priorities, curation filter, reaction style, quality rules, operating style, patterns, recent signals, taste affinities, typed profile assertions, confidence, provenance, version history, reversible revisions, explicit editing, and manual automation mode.

Preferences currently include full workspace presets, theme/custom palette, fonts, typography, density, corners, text size, reduced motion, learning behavior, advisory delivery defaults, Atlas tuning, import/export, and client/server persistence. Settings affect the real product rather than a fake preview.

Data & Recovery includes offline mutations, retry/discard, conflict state, export/recovery guidance, backup state, storage, browser and Telegram reminders, and test notifications.

System includes D1/R2/assets/integrity/job/maintenance/recovery health, Hermes activity and receipts, agent jobs and proposals, allowed API operations, schedules, and OpenAPI access. Ordinary product surfaces must not expose secrets, internal prompts, or raw job-control payloads.

## Recommendation Intelligence

Recommendations are explicit, Thread-first, source-grounded, and allowed to abstain.

Workflow:

1. Hermes reads bounded context from `/compass/context`.
2. Context includes the open Thread, exact missing-material lessons, profile assertions, exclusions, history, format fatigue, balance, semantic matches, and candidate contract.
3. Hermes researches external candidates.
4. It submits 3-24 verified candidates.
5. Initial candidates explicitly cover fit, bridge, and challenge lanes.
6. Each candidate includes canonical URL, title, creator, format, source class, verified branch, expected Thread contribution, source-anchored evidence, and substantive editorial review.
7. The Worker verifies reachability and every redirect.
8. The Worker applies mastered/consumed exclusions, user boundaries, quality rules, semantic duplication checks, normalization, evidence checks, and Thread contribution scoring.
9. It stores a winner or abstains.
10. Starting a targeted winner may attach it to the exact lesson without changing lesson status.
11. Start then uses normal Queue/session behavior and the five-item cap.
12. Feedback closes the loop but never requests the next recommendation.

Compass v2 considers relevance, source quality, information gain, novelty, format fit, Thread contribution, evidence quality, context alignment, and lane.

Rollout is evidence-gated. Current confidence is labelled `heuristic_uncalibrated` and must not be presented as probability. Learning value uses available explicit rating, disposition, and strongest downstream recall/transfer/application evidence; missing signals are not zero. Administrative exclusions and `not_now` are not negative utility.

Feedback stores the exact reflection plus completion state, reasons, expected versus actual, effort, time, score, and a separate `retain`, `apply`, `reference`, `drop`, or `undecided` disposition. Stopped feedback requires a reason. Revisions are append-only. Taste Mapper may propose typed profile changes but may not rewrite the reflection or chain another recommendation.

## Arabic Reading Companions: Lite Visual

Lite Visual creates a complete Arabic reading substitute, not a decorative summary.

- A normal source gets one atomic HTML/PDF pair.
- A book gets one pair per chapter.
- One semantic Arabic HTML article is canonical.
- The PDF is printed from that exact HTML.
- `extract_source.py` is the sole acquisition entry point.
- Acquisition supports verified cache, Readability, bounded Playwright, YouTube captions/yt-dlp/Whisper, PyMuPDF/Tesseract, EPUB spine, Pandoc, and direct UTF-8.
- Authoring stops without a complete extraction receipt.
- Publication requires gapless source coverage, checksum-backed claims, RTL/accessibility/responsive/200%-text/A4 checks, readable text on every PDF page, HTML/PDF parity, a hash-bound receipt, atomic R2 publication, and source-record readback.

Forbidden approaches include generic templates, stored palettes, preset layouts, mind maps, raster/generated images, image agents, scripts, widgets, transcript padding, decorative media, subjective QA scores, and generic single-file upload. Rare source-grounded accessible inline SVG is allowed. Notes extraction never starts automatically.

## NotebookLM

NotebookLM is a Hermes-controlled grounding and learning-output service, not canonical storage, a progression engine, or an autonomous content factory.

Implemented behavior includes saved notebook URLs, provider health, source indexing receipts, output receipts, invalidation after source re-indexing, and a default hard source-grounded quiz with 5-8 questions, hints before explanations, and at least one transfer item. Other media are selected only when concept-fit and plans are capped at three non-redundant outputs.

Provider truth stays separate from Worker receipt state. NotebookLM outputs never alter lesson completion, Thread completion, or FSRS scheduling. Generated summaries and companions are never treated as Mahmood's personal reflection.

## Architecture And Stack

Runtime:

- Cloudflare Worker.
- Hono.
- TypeScript.
- Worker Assets.
- Public-only outbound fetch boundary.

Client:

- Vite 7.
- Preact 10.
- TypeScript.
- Hash routing.
- IndexedDB offline mutation queue.
- Local storage for preferences and resumable client state.
- Service worker and web app manifest.
- Lazy-loaded Cytoscape Atlas.

Storage:

- D1 is canonical for sources, Queue, sessions, Threads, Levels, lessons, notes, Units, relations, recall, branches, profile assertions, graph state, recommendations, feedback, settings, jobs, and receipts.
- R2 stores HTML, PDF, transcripts, uploads, and reading companions.
- Vectorize stores private semantic retrieval vectors.
- Obsidian is export/archive for extracted non-book notes only.
- Book and chapter notes remain in Learning Compass.

Repository boundaries:

- `src/`: Worker APIs, domain logic, services, and schedules.
- `client/`: Vite/Preact application.
- `schema.sql`: base schema.
- `migrations/`: ordered idempotent production migrations.
- `tests/unit/`: domain and API contracts.
- `tests/e2e/`: routes, shell, responsive, PWA, and offline acceptance.
- `docs/hermes-contract.json`: machine-readable Hermes ownership contract.

Worker responsibilities include validation, canonical writes, Queue limits, branch verification, progression, idempotency, sessions, feedback, projections, artifact gates, health, and maintenance. The client cannot bypass Worker validation.

Hermes owns external recommendation research, source-grounded candidate submission, explicitly exposed leased jobs, notes extraction, taste processing, Lite Visual, NotebookLM, guarded API operation, and verified readback. Hermes must use the live Worker API, never raw D1 queries or UI scraping.

Main API domains are `/capture`, `/recommendations`, `/sessions`, `/feedback`, `/learning/core`, `/learning/srs`, `/srs`, `/notes`, `/brain`, `/knowledge`, `/learning`, `/compass`, `/artifacts`, `/notebooklm`, `/analytics`, `/agent`, `/agent/jobs`, `/notifications`, `/search`, and health endpoints.

Agent control protocol is `2026-08-24` / `learning-compass-agent-http/2`. It exposes a capability registry, generated OpenAPI, and only `list_capabilities` plus `site_request`. Mutations require idempotency, body fingerprints, exact preconditions and confirmation for high-risk writes, canonical readback, and receipts distinguishing failure from committed-but-unverified writes. Arbitrary SQL, proxying, and paths are not exposed.

## Security, Reliability, And Operations

Implemented controls include optional API-token privacy, authenticated writes, Telegram webhook secret/chat restrictions/deduplication, public-only URL validation, redirect validation, CORS, read/write rate limits, 10 MB request limit, request IDs, structured logs, safe errors, security headers, mutation idempotency, durable leases, heartbeats, bounded retries, replay, cancellation, dead letters, integrity quarantine, checksummed recovery exports, separate R2 backup requirements, observability, and six-hour scheduled maintenance.

Scheduled maintenance covers feed refresh, reminders, undo cleanup, Telegram receipt cleanup, search-index rebuild, resurfacing backfill, and neglected-branch resurfacing.

Readiness checks cover D1, R2, assets, integrity, quarantine, stale leases, failed jobs, dead letters, overdue retries, maintenance freshness, and verified recovery backups.

Known operational debt:

- Functional application reads and liveness are documented as passing.
- Aggregate readiness remains `needs_attention`.
- FTS maintenance has failed with `recursively defined fts5 content table`.
- No recent verified full recovery backup is documented.
- D1 SQL export has historically failed with FTS5 virtual tables.
- R2 objects require separate copied and verified backups.
- Do not call production operationally healthy until these are resolved.

## Current Delivery State

Latest documented deployed truth on 2026-08-24:

- Automated card and recall-draft generation disabled across current and legacy workflows.
- New cards require explicit learner-authored Arabic content.
- Historical drafts preserved.
- Direct lesson-only progression.
- Five-root/12-mode shell.
- Books as default Library mode and excluded from Queue.
- Unified Branch Review.
- Progressive Atlas.
- Daily resurfacing.
- Anchored semantic relations and contradiction review.
- Additive note distillation.
- Structured Compass feedback.
- Three-tier domain/branch/topic taxonomy.
- Synthetic rounds retired.
- Large-course Thread batching.
- Agent protocol v2.
- Atomic Lite Visual publication.
- PWA and opened-companion offline support.
- Latest documented Worker version: `98d67de9-a4ae-470b-a01f-abf6d7c6a534`.
- Latest documented rollback: `61aa6ddd-fdbe-4bec-8e15-1c87ecf31525`.

The repository currently has extensive concurrent staged, unstaged, deleted, and untracked work. Do not assume every local source file is deployed. Every recommendation involving release state must distinguish:

- Present in local source.
- Verified locally.
- Documented as deployed.
- Verified live.

The repository currently contains 64 migration files through `0062_free_tier_budget.sql`, including two separate `0027` migrations.

## Evidence Not Included In This Brief

The following evidence is not currently supplied and must not be invented:

- Feature-level usage frequency.
- Queue turnover, abandonment, and completion rates.
- Time or friction involved in branch assignment.
- Capture volume by channel and unresolved-branch counts.
- Thread, lesson, note, recall, resurfacing, Books, Canon, Atlas, or Settings usage rates.
- Recommendation acceptance, abstention, learning-value outcomes, and calibration measurements beyond documented rollout rules.
- Lite Visual authoring time, failure rate, and actual reading completion.
- NotebookLM output usage and provider failure frequency.
- Recent screenshots, task recordings, or structured usability studies.
- Current production API samples beyond the documented release statements.

Use this absence constructively. Architecture, invariant, duplication, consistency, accessibility-contract, and operational-safety findings can still be decisive. Usage-dependent removal or redesign proposals should be framed as hypotheses with the exact query, event, screenshot, task test, or observation required before implementation.

## Known Inconsistencies To Resolve

Treat these as findings, not product truth:

1. `PROJECT_CONTEXT.md` has an older deployed version than the latest `CURRENT_STATE.md` entry.
2. Parts of README still describe generated recall drafts even though generation is now forbidden.
3. Some Recall UI/settings compatibility code still models extraction-generated drafts or `srs_drafts`; historical drafts remain valid, new generated drafts do not.
4. Parts of README imply opening an item starts a session; current behavior requires Queue/Compass Start and keeps ordinary opening passive.
5. `PRODUCT.md` calls companions bilingual/Arabic-first; the authoritative companion contract says companions are Arabic, while extracted notes are bilingual.
6. Some documentation describes all extracted notes as Obsidian exports; book and chapter notes must remain only in Learning Compass.
7. Current architecture retires synthetic rounds, but stale rules and API compatibility fields still mention them.
8. Product invariants require every capture to have a branch, while some ingestion paths create captures without one.
9. Visible Archive and Files still have internal compatibility names such as `catalog` and `assets`.
10. `DESIGN.md` says the desktop rail is 120px while the current responsive implementation is documented at 152-180px.
11. Service-worker cache truth is `learning-compass-shell-v40`, while stale release query markers may differ.
12. Settings still has compatibility residue for old recall-generation preferences.
13. `CURRENT_STATE.md` is append-only and contains superseded historical models. Only the newest non-superseded entry should guide behavior.
14. Old entries place Books under Learn; current Books belongs under Library.
15. README references a Hardcover/KOReader mirror although Reading Journal and Hardcover surfaces are retired.

## Non-Negotiable Invariants

Reject or rewrite any proposal that violates these:

1. D1 remains canonical.
2. R2 stores large artifacts.
3. Obsidian is export/archive only and cannot overwrite D1.
4. Every capture becomes a durable captured record.
5. Queue is a separate explicit commitment.
6. Queue normally holds no more than five queued/in-progress sources.
7. Overflow requires explicit override.
8. Books and chapters never enter Queue.
9. Book reading state remains independent from Queue.
10. Reading outside Queue remains passive.
11. Tracked source sessions start only through explicit Queue or Compass Start/Resume.
12. Every current captured, recommended, or queued item requires a verified non-pruned branch and domain.
13. Branch pills render wherever linked objects appear.
14. Synthetic rounds remain retired.
15. Only direct lesson completion advances Levels and Threads.
16. Projects, sources, notes, ratings, dispositions, recall, artifacts, and provider outputs never gate or advance progression.
17. Rating alone never creates notes.
18. Only explicit retain/apply may request source-note consolidation.
19. No automated workflow creates cards or recall drafts.
20. New cards require learner-authored Arabic questions and answers.
21. Failed recall never changes lesson progression.
22. Feedback never requests another recommendation automatically.
23. User reflection is never rewritten.
24. Meaningful links come from anchored typed relations, not keyword overlap.
25. Distillation is explicit, additive, checksum-bound, and never rewrites canonical notes.
26. Advisory signals never become progression gates.
27. Lite Visual publishes one atomic canonical HTML/PDF pair.
28. Book companions publish one pair per chapter.
29. Generic artifact upload cannot bypass companion validation.
30. NotebookLM provider state cannot be fabricated.
31. NotebookLM outputs never alter progression or FSRS scheduling.
32. Canon remains relationship data, not a root, collection duplicate, or progression model.
33. Every registered route must lead to a purposeful surface.
34. Internal infrastructure cannot become a root just because it exists.
35. The PWA remains the canonical Android application.
36. Heavy graph/analytics code remains lazy-loaded.
37. Base client remains at or below 150 KB gzip excluding lazy chunks.
38. REST compatibility remains unless migrations and every active consumer change together.
39. Destructive deletion and external publication remain explicit.
40. Never introduce learning evidence, proof actions, evidence requirements, or equivalent progression gates.

## Explicitly Retired Or Forbidden Concepts

Do not restore these without extraordinary evidence and a complete migration plan:

- All Sources, Inbox, Reading Journal, Hardcover workspace, Collections, generic Catalog, or Discovery as normal destinations.
- Separate Books Shelf and Canon tabs.
- Books under Learn.
- Separate Branches and Balance tabs.
- Permanent desktop context pane.
- A sixth root for Canon, jobs, analytics, recommendations, agents, or storage.
- Learning-evidence or proof-action gates.
- Project-, source-, note-, rating-, recall-, or artifact-gated progression.
- Rating-derived mastery.
- Synthetic rounds.
- Automated cards or recall drafts.
- A second daily-review progression mode.
- Keyword-derived semantic links.
- Autonomous recommendation chaining.
- Scheduled self-improvement or autonomous learning-core polling.
- Template-driven Lite Visual, image agents, raster/generated imagery, generic mind maps, scripts/widgets, subjective QA, or single-file companion publication.
- Social feeds, streaks, XP, leaderboards, or engagement loops.

## Required Review Areas

Evaluate all of these:

1. Product vision and scope discipline.
2. End-to-end loop closure.
3. Capture versus mandatory branch-assignment friction.
4. Queue cap and commitment quality.
5. Home's purpose and information density.
6. Current Book, My Books, and Canon coherence.
7. Thread authoring, curriculum navigation, and lesson completion.
8. Source attachment and lesson-material readiness.
9. Notes, Units, relations, distillation, and contradictions.
10. Recall after generated drafts were removed.
11. Atlas usefulness versus complexity.
12. Unified Branch Review and taxonomy maintenance.
13. Recommendation quality, calibration, novelty, and abstention.
14. Feedback and profile-learning transparency.
15. RSS and passive-capture overload.
16. Lite Visual workflow cost and usability.
17. NotebookLM routing and state clarity.
18. Settings organization and advanced-control overload.
19. Offline/PWA behavior.
20. Agent/Hermes control surfaces.
21. Recovery, FTS, observability, and operational readiness.
22. Legacy compatibility burden.
23. Documentation consistency.
24. Accessibility, bilingual direction, and responsive behavior.
25. Features that exist technically but do not support a meaningful user decision.

## Questions Every Proposal Must Answer

1. What user problem exists now?
2. What current evidence supports that diagnosis?
3. Why is changing the product better than leaving it alone?
4. Which existing surface owns the change?
5. What existing feature, control, or concept can become simpler or disappear?
6. Which invariants constrain the solution?
7. What data, API, migration, and compatibility boundaries are involved?
8. What could fail or become harder to maintain?
9. How will behavior be verified locally and live?
10. Is this worth doing for a single-user product?

## Required Output

### 1. Executive Judgment

Provide:

- One-paragraph assessment of current product coherence.
- Three strongest parts.
- Three largest problems.
- The single most important next product decision.

### 2. Learning Loop Scorecard

Score each stage from 1-5 and explain the main friction.

| Stage | Score | What works | Main friction | Consequence |
|---|---:|---|---|---|
| Define Thread | | | | |
| Capture | | | | |
| Curate and branch | | | | |
| Commit to Queue | | | | |
| Consume | | | | |
| Return and reflect | | | | |
| Retain into notes/Units | | | | |
| Create/review recall | | | | |
| Complete lessons | | | | |
| Map and synthesize | | | | |
| Resurface | | | | |

### 3. Information Architecture Review

For every root and grouped mode, choose one: Keep as-is, Improve, Simplify, Merge, Remove, Rename, or Move. Explain why. Do not add a root unless no current root can own the decision.

### 4. Complete Feature Disposition Matrix

| Feature | Current status | User value | Complexity | Recommendation | Reason |
|---|---|---:|---:|---|---|

Use: Keep, Improve, Simplify, Merge, Remove, Defer, or Fix inconsistency.

Cover every feature listed in this brief, not just the interesting ones.

You may group tightly coupled implementation details under one user-facing capability, but do not hide a major surface, workflow, or known inconsistency inside a broad category. Use the status taxonomy defined under Current Feature Inventory. Mark recommendations based on missing usage evidence as hypotheses rather than facts.

### 5. Proposals

Use this exact format for every proposal:

```markdown
## Proposal: [name]

**Disposition:** Keep / Add / Improve / Simplify / Merge / Remove / Fix inconsistency / Defer
**Owner surface:** [existing root and mode]
**User problem:**
**Current evidence:**
**Proposed behavior:**
**What changes or disappears:**
**Data/API/migration impact:**
**Invariant check:**
**Accessibility/responsive impact:**
**Operational risk:**
**Verification plan:**
**Success measure:**
**Evidence level:** Documented / Implementation-observed / Live-verified / Hypothesis
**Benefit score:** [0-40, with the eight component scores]
**Risk deduction:** [0-25, with the five component scores]
**Net rubric score:** [benefit minus risk]
**Priority:** P0 / P1 / P2 / P3 / Reject
**Effort:** S / M / L / XL
```

### 6. Simplification And Removal Plan

Identify:

- Duplicate concepts.
- Compatibility names that can safely remain internal.
- Compatibility code worth migrating or retiring.
- Controls exposing implementation details rather than user decisions.
- Features with insufficient evidence or usage.
- APIs that must remain temporarily.
- APIs that can retire after consumer verification.
- Documentation and UI copy requiring immediate correction.

### 7. Sequenced Roadmap

Provide:

- **Now:** no more than three changes.
- **Next:** no more than five changes.
- **Later:** only evidence-gated investments.
- **Do not build:** explicit list.

For each phase, name dependencies, verification, and what can be removed afterward.

### 8. Risks And Open Questions

Separate product, design, engineering, data-migration, and operational questions. Make a recommendation whenever existing evidence is adequate instead of turning every uncertainty into more discovery.

## Prioritization Rubric

Score proposals from 0-5 on:

- Loop closure.
- Frequency of the problem.
- Cognitive simplification.
- Learning value.
- Truth and provenance.
- Reuse across surfaces.
- Implementation confidence.
- Operational safety improvement.

Subtract 0-5 for:

- Invariant risk.
- Migration risk.
- Ongoing maintenance burden.
- Speculative value.
- New navigation/surface cost.

Priority meanings:

- **P0:** correctness, data safety, invariant violation, or operational blocker.
- **P1:** frequent loop blocker or major simplification.
- **P2:** valuable after core friction is resolved.
- **P3:** optional polish or evidence-gated experiment.
- **Reject:** violates invariants, duplicates an owner, or lacks credible value.

A high score never overrides a non-negotiable invariant.

When reliable usage data is absent, score frequency and learning value conservatively and label them as hypotheses. The rubric supports judgment; it is not a substitute for evidence and has no automatic numeric P0-P3 thresholds.

## Review Standards

- Be direct and specific.
- Prefer one canonical owner over parallel features.
- Prefer deletion or simplification when equivalent value already exists.
- Optimize for one serious learner, not hypothetical growth.
- Do not gamify.
- Do not add AI merely because infrastructure exists.
- Do not turn advisory signals into gates.
- Do not propose automated flash-card generation.
- Do not restore synthetic rounds.
- Do not expose agent/job internals unless they support a real user decision.
- Preserve exact provenance and reversible state.
- Preserve accessibility and Arabic/English direction handling.
- Include API, migration, compatibility, security, recovery, and verification consequences.
- Flag proposals that require live usage evidence before implementation.
- Every new feature must name an existing feature or workflow that becomes simpler or disappears.
- End with one opinionated recommended direction, not several equally weighted options.

---

## Project Sources Behind This Brief

The brief was synthesized from the current repository and these canonical or implementation-level sources:

- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `CURRENT_STATE.md`
- `PRODUCT.md`
- `DESIGN.md`
- `README.md`
- `docs/architecture.md`
- `docs/API.md`
- `docs/hermes-contract.json`
- `package.json`
- `client/src/app/router.ts`
- Current Home, Library, Learn, Map, Settings, Books, Notes, Recall, Atlas, and Branch client implementations.
- Current Worker routes and services.
- `schema.sql` and all migrations through `0062_free_tier_budget.sql`.

When this brief conflicts with historical entries, use the newest non-superseded `CURRENT_STATE.md` behavior, the current implementation, and live API verification in that order. Do not treat an old release-history entry as an operating requirement.
