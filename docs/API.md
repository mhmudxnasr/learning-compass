# Learning Compass API

Hermes ownership, endpoint permissions, side-effect tiers, routing policy, and specialist receipts are canonical in [`docs/hermes-contract.json`](./hermes-contract.json); this API reference documents the route surface.

## Canonical read models

- `GET /dashboard/briefing` — Momentum source dossier data: active Queue shelf (including each source's Queue rationale and canonical `branch_id`, `branch_label`, `round_label`, and `branch_status`), linked files, weekly completions/notes/recall, evidence-backed insight, recent wins, and actionable attention counts. Legacy streak and next-action fields remain compatible.
- `GET /learning/heatmap`, `GET /learning/detail/:id`, and `/dashboard/briefing` use the canonical activity ledger. Briefing adds `next_action_detail` with the target, reason, and actionable kind while retaining `next_action` compatibility.
- `GET /capture/queue` — five-item active queue read model. Items include optional `context_brief`, a compact source-grounded before-you-start topic breakdown, and the full branch context: `branch` (`{id,label,round,status}`), `note` (`{id,title}` when a field note exists), `recall` (`{count,due}`), and `companions` (`{html,pdf}` artifact ids) so the Queue can render branch/round badges, note links, recall status, and companion buttons without extra round trips.
- `GET /recommendations/list` — archive and filtered recommendation records. Use `source=feed` for RSS/Atom captures or `source=manual` to keep feed entries out of the main archive. Every row carries the branch context (`branch_label`, `round_label`, `branch_status`) plus `note` (`{id,title}`), `recall` (`{count,due}`), and `companions` (`{html,pdf}` artifact ids) so Archive and All-sources views can render the same badges as the Queue.
- `GET /recommendations/books` — book shelf records, optionally filtered by `status=active|consumed|rejected`; each book includes `visual` state with linked HTML/PDF metadata, normalized QA, and extraction status.
- `GET /knowledge/graph` — nodes and evidence-backed edges.
- `GET /knowledge/blind-spots` — unmapped or unconsumed branches.
- `GET /learning/health` — branch health.
- `GET /learning/balance?window=30|90|365` — canonical map-balance read model combining attention share, explicit priority share, coverage, notes, SRS due cards, recall strength, branch depth, and unmapped-source warnings.
- `POST /compass/evaluate` — dry-run server scoring for 3–24 candidates. The response also includes `frontier_shadow`: low-friction, source-grounded candidates with high mechanism match and low known-topic affinity, plus `exploration_shadow`. V2 exposes the winner's deterministic `candidate_set_diversity` and contextual-alignment receipt. Frontier results are shadow-only and never enter Queue or serving.
- `GET /compass/context` — bounded canonical research packet for Hermes before web research: active Thread/evidence gaps, typed profile assertions, exclusions, known sources, format fatigue, learning balance, semantic retrieval matches, and the candidate metadata contract. It exposes no scoring authority and creates no recommendation. `POST /compass/semantic/index` explicitly indexes changed recommendations, Threads, Notes, and Units into the private Cloudflare Vectorize corpus; it does not create a recommendation.
- `GET /taste/dna` — vectors, decay, ratings, diversity, and momentum.
- `GET /analytics/heatmaps`, `/analytics/forecast`, `/analytics/taste-drift`, `/analytics/creator-trust`.
- `GET /analytics/hermes` — clean learning-value cohorts, signal population, profile health, self-improvement receipts, queue health, memory, alerts, and engine evidence. Calibration now includes MAE, continuous Brier score, and five reliability buckets comparing predicted versus actual learning value. Administrative exclusions never enter utility metrics.
- `POST /analytics/hermes/recalibrate` — apply a slow, bounded update only after at least 20 training-eligible `learning_value_v2` outcomes; requires `{ "conversation_id": "..." }` and records a receipt. Compass lane adaptation separately requires eight labeled outcomes per lane.
- `GET /analytics/hermes/engine` — return current `shadow|v2` mode and rollout gates. `POST /analytics/hermes/engine/activate` requires all gates plus a conversation ID; `/rollback` returns serving to shadow with a receipt.
- `GET /analytics/hermes/repair` — deterministic dry-run that classifies fabricated score-2 outcomes, administrative exclusions, explicit ratings, and ambiguous records and returns a source-clock snapshot. `POST` applies only with `{ "apply": true, "snapshot_id": "...", "conversation_id": "..." }` matching the current snapshot.
- `GET/POST /analytics/hermes/improvements`, `POST /analytics/hermes/improvements/:id/complete|revert` — open, apply, deploy, fail, close as evidence-backed `no_change`, or roll back conversation-bound improvement receipts. A failed close requires an error; `no_change` requires stored evidence, `after.changed=false`, and `validation.no_change=true`; system/code application requires passed validation and deployment additionally requires a rollback version.
- `GET /analytics/hermes/weekly` — return the last-seven-day clean quality, creator, format, abandonment, and taste-drift report. `POST /analytics/hermes/evaluate` requires `{ "conversation_id": "..." }`, creates only reviewable proposals, and records a no-change/proposal receipt; no cron invokes it.
- `POST /analytics/hermes/backfill` — legacy derived-record compatibility backfill. Defaults to dry-run; applying it requires `{ "dry_run": false, "conversation_id": "..." }` and records a receipt. Historical recommendation/profile correction uses `/analytics/hermes/repair`.
- `GET /capture/:id/record` — canonical source record linking the source, exact feedback and note sections, session history, proposals, artifacts, recall, memory influence, and measured outcome. The response now also carries the item's `branch` (`{id,label,round,status}`), derived `round` from the branch-round progression model, `companions` (`{html,pdf}` with id/filename/size), and `srs.recall_summary` (`{count,due}`). Processing metadata remains available to agents but is not exposed as a user-facing destination.
- `GET /feedback/context` — canonical evidence bundle containing every archived reaction, structured feedback, current profile, and knowledge-map nodes. Taste Mapper reads this before proposing enhancements.

## Capture and learning

- `GET/POST /learning/core/threads`, `GET/PATCH /learning/core/threads/:id`, `POST /learning/core/threads/:id/status` — create and operate purpose-first Learning Threads with guiding questions, why-now/interview context, definitions of done, evidence requirements, synthesis, and verified lifecycle. Deep Hub topic paths start from an interview brief covering desired depth, prior knowledge, real use case, constraints/preferences, guiding question, and proof of competence.
- `GET /learning/core/hub` and `GET /learning/core/threads/:id/path` — read the Learning Hub overview and one Thread's ordered curriculum stages, stage items, reusable sources, evidence, and derived current stage.
- `POST /learning/core/threads/:id/stages`, `PATCH /learning/core/threads/:id/stages/:stageId`, and `POST /learning/core/threads/:id/stages/:stageId/items` — explicitly author and update relational path stages and required learning work.
- `POST /learning/core/threads/:id/stages/:stageId/start`, `PATCH /learning/core/threads/:id/stages/:stageId/items/:itemId`, and `POST /learning/core/threads/:id/stages/:stageId/verify` — start an available stage, record work-item proof, and verify a stage only after its required items and evidence are ready.
- `POST /learning/core/threads/:id/stages/:stageId/sources` — attach an existing canonical source to a stage by foundation, case, companion, counterevidence, or reference role; it never duplicates the source record. For source-fill work on an existing Hub path, callers must preserve the existing stages/items/order and only research, attach, and verify source coverage.
- `POST/DELETE /learning/core/threads/:id/sources` — attach reusable sources with primary, supporting, counterevidence, or reference roles without duplicating the canonical source.
- `GET/POST /learning/core/units`, `POST /learning/core/units/:id/relations` — persist atomic anchored Learning Units and typed `supports`, `contradicts`, `qualifies`, `example_of`, `depends_on`, or `applies_to` relations. Claim-like Units require anchors.
- `POST /learning/core/evidence` — record free recall, explanation, transfer, application, decision, or artifact evidence. Optional `stage_id` attributes evidence to a Hub stage and is validated against its parent Thread. `POST /learning/core/threads/:id/verify` requires a final synthesis and all evidence gates.
- `GET /learning/core/weekly` and `GET /learning/core/counterevidence?thread_id=...` — on-demand closure and challenge reads used by Momentum; neither endpoint is scheduled.
- `GET /learning/core/consolidation/:sourceId`, `GET /learning/core/consolidation/open`, `POST /learning/core/consolidation/:id/retry|waive` — read and resolve durable cognitive-loop state.
- `GET /learning/core/integrity/health` — report active broken parent relationships and preserved quarantine records.
- `POST /learning/srs/review` — schedule Again/Hard/Good/Easy outcomes with reference FSRS-6 (`fsrs-6-ts-fsrs-5.4.1`) and record recall evidence independently.

- `POST /capture`, `GET /capture`, `GET /capture/:id` — universal capture, Inbox, and enrichment status.
- `POST /recommendations/books` — add or update a book with `{ "title", "author", "isbn"?, "url"?, "why_this"? }`; books enter Inbox and use the normal Queue, session, notes, rating, and review flows.
- `GET/POST /capture/feeds`, `DELETE /capture/feeds/:id` — list, subscribe to, and remove RSS/Atom sources. Subscribing imports up to 20 current entries into Inbox; optional `{ "limit": 1..20 }` caps the initial import.
- `GET /capture/feeds/:id/entries` — read all imported articles for one feed with pagination.
- `POST /capture/feeds/sync`, `POST /capture/feeds/:id/sync` — check all feeds or one feed now; optional `{ "limit": 1..20 }` caps entries imported per feed. Inbox **Check now** uses 5. Scheduled checks run every six hours without this manual cap.
- `POST /capture/:id/triage` — promote an Inbox item to Queue or administratively exclude it; queue overflow requires explicit override. Exclusion records no negative taste or utility signal.
- `POST /artifacts`, `GET /artifacts`, `GET /artifacts/:id` — R2-backed files and metadata. Lite Visual HTML/PDF uploads accept ordinary pair, source, role, revision, canonical/evidence/validation checksums, coverage, and optional `recommended_start=original|html|pdf|notebooklm` metadata without storing a subjective QA score. The Lite Visual skill owns the hard pre-upload content/render/inspection gate; the generic artifact route only validates file and metadata integrity. Momentum uses `recommended_start` to make the selected medium its primary start action. NotebookLM cinematic video validation remains unchanged. `GET /artifacts` exposes compact quality state for compatibility and joins each file's `notebook_url` from the owning recommendation; it lists only source-scoped files and excludes `scope=book` chapter artifacts, which are shown under Books. `POST /artifacts` accepts optional `thread_id` or `stage_id` inside the multipart `metadata` JSON (at most one) to attach a Learning Hub file to a path or stage. `GET /artifacts/hub?thread_id=…` and `GET /artifacts/hub?stage_id=…` list hub-owned file metadata for one path or stage.
- `POST /capture/:id/visualise` — enqueue-only `visualise_source` Hermes work. The payload contains a generic URL/artifact source reference, workflow stages, checksum cache keys, Visual Mind handoff, and expected `html`/`pdf` roles. Books additionally receive `book_mode=true`, `visual_mode=book_annotation_companion`, and `chapter_outputs=true`; Hermes uploads one linked HTML/PDF pair per chapter with `chapter_key`, `chapter_title`, and `chapter_number` metadata. Requests are idempotent per source.
- `POST /recommendations/books/:id/chapters/:chapterKey/complete` — mark one generated book chapter finished or unfinished. `GET /recommendations/books` exposes each chapter's HTML/PDF artifact links and completion state.
- `POST /recommendations/books/:id/chapters` — register book chapter metadata and completion state without creating or uploading artifacts; the chapters remain book-scoped and do not appear in Files.
- `GET /artifacts/:id/view` — render Markdown artifacts as a safe, readable HTML document.
- `POST /artifacts/:id/process` — explicitly queue an idempotent `extract_notes` Hermes job; Lite Visual does not call this automatically.
- `POST /recommendations/action` — update recommendation status, rating, review, consumed date, and optionally register an item-specific `notebook_url`, which Learn → Files exposes as the NBLM button.
- `DELETE /recommendations/:id/permanent` — permanently remove a non-active source, its feedback/learning history, and linked generated artifacts. This is irreversible; active sources must be archived first.
- `POST /recommendations/map` — attach one or more completed recommendation IDs to an existing map node with `{ "ids": ["..."], "branch_id": "..." }`; rejects missing nodes and incomplete sources, updates outcomes, and returns the verified mapping.
- `GET/POST /sessions`, `POST /sessions/start`, `POST /sessions/:id/return` — server-backed external-handoff lifecycle for original, HTML, PDF, artifact, and NotebookLM targets. Start accepts `thread_id`, `target_kind`, and `target_artifact_id`. Return separates rating from `disposition`; retain/apply creates a durable consolidation run and anchored extraction contract.
- `GET/POST/PUT /notes` — structured notes library. `GET /notes` returns all notes; `GET /notes?kind=guide` returns only Notes Extractor source notes (the Learn → Notes library scope), and `kind=reflection` returns personal feedback notes. Each note includes its bilingual `note_sections`. `POST /notes/:id/process` queues auditable Taste Mapper analysis for feedback or a full bilingual Notes Extractor re-run for source notes. `POST /notes` accepts optional `thread_id` or `stage_id` (at most one) to create a Learning Hub note owned by that path or stage. `GET /notes/hub?thread_id=…` and `GET /notes/hub?stage_id=…` list hub-owned notes (with sections) for one path or stage.
- `GET /srs/drafts`, `PUT /srs/drafts/:id`, `POST /srs/drafts/:id/approve`, `POST /srs/drafts/:id/reject` — editable recall drafts.
- `GET /learning/srs/cards`, `DELETE /learning/srs/cards/:id` — list or permanently remove approved review cards.
- `POST /feedback/record` — the canonical feedback write. Accepts `score` (0–10), `completion_state` (`completed`, `in_progress`, or `stopped`), `disposition` (`undecided`, `retain`, `apply`, `reference`, or `drop`), `reason_tags`, `expected`, `actual`, `effort`, and `length_minutes` alongside the exact feedback. It preserves the structured record in source metadata, queues Taste Mapper with instructions to read all archived feedback/profile/map context, updates completion when appropriate, and never auto-recommends. A later explicit feedback submission updates the existing consolidation run and canonical disposition rather than leaving the first disposition in place.
- `GET /feedback/proposals` — list pending, applied, blocked, rejected, and reverted changes with policy/deployment receipts.
- `POST /feedback/proposals/:id/apply` — Hermes automatic path. Profile changes require confidence ≥0.8 plus a direct user statement or two evidence items; replacing an explicit user assertion requires a direct contradiction or confidence ≥0.95 with three evidence items. `POST .../approve` is the explicit-user compatibility path, `.../reject` rejects pending work, and `.../revert` restores the typed assertion revision and compatibility projection.
- `GET/POST /agent/memory` — read or write provenance-backed Hermes memories. Durable and hypothesis entries require at least one evidence item; applied feedback proposals also create an approved episodic self-improvement receipt linked to the proposal and update journal.
- Existing `/learning/srs/due`, `/learning/srs/review`, and `/learning/srs/create` remain compatible.

## AI & Curation

- `GET /compass/pick` — return the newest active `ready` or `started` Personal Bayesian Cascade pick, including optional `context_brief`. Multiple concurrent picks may exist; this singular read remains backward-compatible.
- `POST /compass/evaluate` — dry-run the same candidate set through legacy and v2 scoring without creating a pick.
- `POST /compass/picks` — submit 3–24 candidates for an open `thread_id` with required `intent`: `solve_problem`, `build_skill`, `deepen_thread`, `discover`, or `queue_fill`. The first three explicitly labeled candidates must cover `fit`, `bridge`, and `challenge`; unlabeled candidates are assigned deterministically. Every candidate needs canonical URL, title, creator, canonicalizable format, branch, expected Thread contribution, source-URL-anchored evidence, and an editorial review with `verdict: "recommend"`, substantive `why_worth_time`/`unique_value`, and `depth: "substantive"|"deep"`. Optional `summary` (≤1,800 chars), 2–8 concise `concepts`, `mechanism`/`mechanisms`, and expected-evidence fields improve deterministic contextual alignment with the Thread; malformed optional context is rejected rather than silently trusted. Books are rejected unless the request includes `allow_books: true`. Normal requests use the fit strategy, while bridge/challenge are explicit-only exploration. The Worker checks reachability, entity aliases, semantic duplicates, mastered/blocked rules, Thread contribution, learning balance, typed profile assertions, and clean creator/format outcomes; V2 re-ranks only the final slate with a bounded candidate-set diversity term. Candidate context is preserved across bounded expansion waves. It records a shadow-only exploration-readiness receipt but never auto-explores. It stores both v1 and v2 decisions while `recommendation_engine.mode=shadow`, serves v2 only after evidence-gated activation, and returns expected learning value, decision confidence, lane, and the full shadow receipt.
- `POST /compass/pick/:id/candidates` — append research candidates to an abstained pick and rescore the combined set (maximum 24); the replacement pick retains the full decision receipt.
- `POST /compass/pick/:id/start` — explicitly move a `ready` pick, or a reachable `abstained` pick as a curator override, into the normal Queue and start its session; the five-item queued/in-progress cap is enforced here.
- `POST /compass/pick/:id/feedback` — record explicit outcome, rating, learning disposition, reason codes, and reflection. `dismissed`/`not_now` is neutral and returns the source to Inbox; `declined`/bad-fit and abandonment are explicit eligibility signals; rating, disposition, and later recall/transfer/application evidence are independent utility signals. Feedback never auto-recommends.

- `POST /ai/suggest` — legacy compatibility endpoint; new recommendation requests use `/compass/picks`.
- `POST /recommendations/push` — import one or more recommendation records; each item may include optional `context_brief` for the Queue’s before-you-start description.
- `POST /ai/enhance` — copy-edit or sharpen reflection notes.
- `POST /ai/enhance/why` — generate rationale for new recommendation candidates.

## Legacy Discovery Engine V2

- `GET /discovery/state` — read active run, gate state, candidate decision receipt, active interview, frontier topology, and current `discover_source` job.
- `GET /discovery/context` — token-efficient context bundle for Hermes containing baseline engine weights, branch evidence, mastered exclusions, and recent learning receipts.
- `POST /discovery/runs` — legacy research archive; new recommendations must use `/compass/picks`.
- `POST /discovery/runs/:id/candidates` — batch-store research candidates with research-quality rules enforcement (>= 20 candidates, >= 4 source classes, >= 8 verified sources with verification facts).
- `POST /discovery/runs/:id/select` — select winner candidate and decision receipt (Contrast Hook); withholds weak results (< 0.60 score or unverified).
- `POST /discovery/runs/:id/activate` — activate winner to Queue and start linked learning session (or retain as `waiting_for_capacity` if Queue full).
- `POST /discovery/runs/:id/interview` — record adaptive feedback questions, answers, and unresolved ambiguities.
- `POST /discovery/runs/:id/resolve` — atomically resolve discovery run (requires completed interview and answered questions, applies evidence-controlled branch evolution, adapts weights, saves learning receipt, and stages skill revisions).
- `POST /agent/jobs/:id/heartbeat` — renew 5-minute lease on long-running jobs.
- `GET /discovery/drift-check` — check live contract version, D1 skill revisions, and workflow alignment.

## Hermes jobs

- `GET /agent/jobs?status=pending` — pending work.
- `GET /agent/jobs/health` — queue health, status counts, stale leases, and recent failures.
- `POST /agent/jobs/:id/claim` — lease one job; expired leases are reclaimed automatically.
- `POST /agent/jobs/:id/complete` — persist structured note/SRS output while its lease is current; send the claiming `worker`.
- `POST /agent/jobs/:id/fail` — retry up to three attempts, then mark failed; send the claiming `worker`.
- `POST /agent/jobs/:id/replay` — reset a failed/dead-lettered job for a clean, auditable replay.
- `POST /agent/jobs/:id/cancel` — cancel only a pending or retrying job, clearing its lease; running, terminal, or unavailable jobs return `409`.
- `GET/POST /agent/memory` — browse/search or write provenance-backed Hermes memory with relational evidence and recommendation influence links. Memory keys cannot own profile preferences or live learning state; use their canonical APIs. Verified reversible skill improvements use `memory_kind: "durable"`, a `skill_procedure:*` key, validation evidence, scope, and supersession metadata.
- `GET /agent/memory/context` — compile a bounded deterministic context packet for `recommendation`, `feedback`, `learning`, or `self_evolution`, with ranked evidence, relevant typed assertions, exclusions, and an auditable retrieval receipt. `q`, `recommendation_id`, `thread_id`, `conversation_id`, and `limit` are optional.
- `POST /agent/memory/:id/approve`, `/expire` — review memory lifecycle without deleting evidence.
- `POST /agent/memory/:id/resolve` — supersede or reject an active memory entry.
- `GET /notebooklm/health` — broker heartbeat, session, grounding, fallback, and stale health state; `POST /notebooklm/health` records a host heartbeat and `POST /notebooklm/recover` records a recovery receipt.
- `POST /agent/alerts/:id/ack` — acknowledge an operational alert.
- `POST /agent/jobs/:id/heartbeat` — extend a lease only for the claiming `worker`.

## Offline sync and reminders

- Every browser mutation may carry `x-client-mutation-id`; successful responses are cached in `sync_mutations` for safe retries.
- `GET /notifications` — browser/Telegram controls and recent delivery history.
- `GET /notifications/vapid`, `POST /notifications/push/subscribe`, `DELETE /notifications/push/:id` — browser reminder registration and status.
- `POST /notifications/telegram` — enable or disable Telegram reminders for a chat ID.
- `POST /notifications/test` — send a test and persist delivered, queued, or failed delivery evidence.

## Agent control protocol

- `GET /agent/capabilities` — complete machine-readable allow-list of site operations.
- `GET /agent/system` — user-visible runtime inventory: storage ownership, the configured six-hour maintenance schedule and responsibilities, on-demand-only workflows, current counts, and safety boundaries.
- `GET /agent/openapi.json` — compact OpenAPI description for HTTP/tool clients.
- `POST /agent/request` — execute one allow-listed site operation with `{method,path,body}`.
- `GET /agent/tools` and `POST /agent/tool-call` — function-calling declarations and execution.

Agent mutations reuse product validation, require `x-api-token` when configured, and audit to `agent_logs`. Arbitrary SQL, arbitrary paths, and outbound proxying are not exposed.

`GET /brain/profile` includes the compatibility profile plus typed `profile_assertions`, reversible `profile_revisions`, and `profile_health`. `GET /brain/profile/intelligence` returns only that typed model. `PUT /brain/profile/assertions/:key` creates or replaces any assertion with optimistic `target_version`; `POST /brain/profile/revisions/:id/revert` undoes a revision. `POST /brain/profile` remains the editable compatibility API and mirrors supplied fields into explicit typed assertions.

`GET /brain/branch-deck` returns the evidence-driven branch review deck — every branch row on the map with real evidence, no hardcoded candidates. Each item carries `state`, `consumed_count`, `mapped_count`, `unmapped_count`, `attention_share`, `priority_rank`, `last_consumed_at`, `learning_units`, `srs_due`, `recall_strength`, and a `reasons` summary from the learning-balance model. `is_candidate` marks `candidate|active|fresh` branches that are still waiting on a decision. Pruned branches stay visible (reversible), and mastered/excluded topics are surfaced as blocked rather than silently dropped.

`POST /brain/branch-explanations` applies AGY-authored `{ explanations: [{ id, explanation }] }` as metadata-only descriptions to waiting `branch`/`leaf` nodes. It refuses decided branches and never changes status, priorities, taste signals, or learning evidence.

`GET /capture/queue` includes `branch_preflight` for each item. It identifies the mapped branch and flags `conflict: true` when that branch is pruned; queue triage rejects new Queue additions with a `pruned_branch_conflict` response. Every item also carries the enriched `branch` object (`id`, `label`, `round`, `status`), `note`, `recall`, and `companions` fields described in the queue contract above. `GET /recommendations/list` rows additionally include `branch_label`, `round_label`, and `branch_status` for branch-aware archive views.

`GET /brain/branches/:id/items` returns the authoritative linked-items ledger for one branch: a `branch` header (label, type, status, derived `round`, priority, and the learning-balance node), the ancestor `path`, `recommendations` (each with rating, consumed date, `recall`, `companions` presence, and `note` link), `notes`, `recall_cards`, pending `srs_drafts`, and R2 `artifacts`. This is the branch dossier the Branch Deck and Map Explorer read; every row is clickable into the unified source dossier. Rounds follow the evidence-based progression model: R1 while no source is consumed, R2 at first consumed source (or two notes / three cards), R3 with three consumed sources plus consolidation and recall strength.

`POST /capture/:id/branch-map` applies a high-confidence, metadata-only branch mapping to an active Queue item. It rejects medium/low-confidence mappings and pruned targets; it never implies consumption or mastery.

`POST /brain/branch-swipe` accepts `keep`, `prune`, `priority`, `hold`, `add`, or `undo`. Every decision writes the canonical `tree_nodes` state plus one reversible typed `user.profile.branch_preference.*` assertion, a taste signal, and a `recent_signal` refresh; the response includes `profile_sync.synced_at`, `profile_sync.assertion_updated_at`, and a `context_refresh` note so the next `GET /compass/context` read includes the decision. Semantics are explicit and reversible:

- `keep` → `status='love'`, strong positive taste (5.0), `topic_affinity` assertion.
- `prune` → `status='pruned'` + `branch_exploration.is_pruned=1` + priority removed; taste set to a negative signal (0.5/5), assertion category `exclusion` (Compass blocks it). Prune never fabricates a `feedback_proposals` row as "applied" — it is a reversible user exclusion, not a confirmed taste fact.
- `priority` → `status='love'` + one explicit renumbered priority list (this branch becomes rank 1 and the rest shift down, not an unbounded `MAX(rank)+1` tail), `priority` assertion.
- `hold` → `status='held'`, neutral taste (2.5), weak `hypothesis` assertion (confidence 0.6).
- `add` → inserts an `active` exploration branch with `meta_json`; no taste signal until evidence exists. Clients may send `description`, `leaves_sample`, `contrast_hook`, and `parent_id`, stored as branch metadata for future deck reads and agent context.
- `undo` → reverses the tree row *and* the assertion/taste/priority side effects. When the previous decision was `add`, the branch did not exist before, so `restore_status: "candidate"` removes it entirely.

`POST /brain/branch-suggest` returns review-before-commit new-branch candidates. Input `{ count?: 1..6, mode?: 'surprise'|'expand'|'bridge'|'challenge' }` (default `surprise`/3). The server builds a bounded grounding packet from `loadCompassContext` plus the live branch deck — loved/held/pruned branches, known categories, priority topics, blocked entities, strongest topic affinities, highest-trust creators, recent formats — and asks the LLM (the same `freeAi` wrapper as `/ai/suggest`) for concrete new branch candidates. Each returned item includes a decision brief: `{ id, label, round_label, super_category, description, plain_language, leaves_sample, contrast_hook, why_now, evidence_grounding, evidence_confidence, overlap_candidates, suggested_next_move, uncertainty_note, status:'candidate', source:'suggest', mode }`. **Nothing is written**: suggestions never mutate the map or profile; only the user's explicit `add` swipe commits them. If the LLM is unavailable the endpoint succeeds with an empty `suggestions` list and `fallback: true`, and the client offers the grounded copy-prompt instead.

Branch preference is a curation signal only; agents must not infer mastery from it. The agent capability catalog exposes all three branch endpoints so Hermes can inspect and update the map through the same validated path as the UI.

## Settings and organization

- `GET /settings` — stored preferences plus fully resolved defaults, including `profile_automation.mode=manual` (profile changes require explicit review) and `recommendation_engine.mode=shadow`; `PUT /settings/:key` updates one preference group. The appearance group accepts `font`, `custom_font` role stacks (`ui`, `display`, `reading`, `mono`), and bounded `typography` values (`baseSize`, `bodyWeight`, `headingWeight`, `lineHeight`, `letterSpacing`, `displayScale`, `readingMeasure`).
- `POST /ai/theme-variants` — asks Gemini 3.1 Flash Lite for a strict day/night palette pair; returns only validated 11-token HEX palettes and falls back client-side to instant local variants when Gemini is unavailable.
- `GET/PUT /dashboard/layout` — adaptive module pins/order.
- `GET/POST /collections`, `POST /collections/:id/items` — durable collections.
