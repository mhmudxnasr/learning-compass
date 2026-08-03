# Learning Compass API

Hermes ownership, endpoint permissions, side-effect tiers, routing policy, and specialist receipts are canonical in [`docs/hermes-contract.json`](./hermes-contract.json); this API reference documents the route surface.

## Canonical read models

- `GET /dashboard/briefing` — Momentum workspace data: active Queue shelf, linked files, weekly completions/notes/recall, evidence-backed insight, and recent wins. Legacy next-action fields remain compatible.
- `GET /capture/queue` — five-item active queue read model.
- `GET /recommendations/list` — archive and filtered recommendation records. Use `source=feed` for RSS/Atom captures or `source=manual` to keep feed entries out of the main archive.
- `GET /knowledge/graph` — nodes and evidence-backed edges.
- `GET /knowledge/blind-spots` — unmapped or unconsumed branches.
- `GET /learning/health` — branch health.
- `GET /learning/balance?window=30|90|365` — canonical map-balance read model combining attention share, explicit priority share, coverage, notes, SRS due cards, recall strength, branch depth, and unmapped-source warnings.
- `GET /taste/dna` — vectors, decay, ratings, diversity, and momentum.
- `GET /analytics/heatmaps`, `/analytics/forecast`, `/analytics/taste-drift`, `/analytics/creator-trust`.
- `GET /analytics/hermes` — compact Hermes operations, recommendation quality, memory, alert, and engine evidence read model.
- `POST /analytics/hermes/recalibrate` — apply a slow, bounded engine-weight update from at least five rated discovery outcomes.
- `GET /analytics/hermes/weekly` — return the last-seven-day quality, creator, format, abandonment, and taste-drift report.
- `POST /analytics/hermes/evaluate` — create reviewable feedback proposals from weekly evidence; it never mutates profile or map state directly.
- `POST /analytics/hermes/backfill` — inspect missing SRS cards, outcomes, taste vectors, creator trust, and contradiction candidates. Defaults to dry-run; send `{ "dry_run": false }` only after reviewing the returned counts.
- `GET /capture/:id/record` — canonical source record linking the source, exact feedback and note sections, session history, proposals, artifacts, recall, memory influence, and measured outcome. Processing metadata remains available to agents but is not exposed as a user-facing destination.

## Capture and learning

- `POST /capture`, `GET /capture`, `GET /capture/:id` — universal capture, Inbox, and enrichment status.
- `GET/POST /capture/feeds`, `DELETE /capture/feeds/:id` — list, subscribe to, and remove RSS/Atom sources. Subscribing imports up to 20 current entries into Inbox; optional `{ "limit": 1..20 }` caps the initial import.
- `GET /capture/feeds/:id/entries` — read all imported articles for one feed with pagination.
- `POST /capture/feeds/sync`, `POST /capture/feeds/:id/sync` — check all feeds or one feed now; optional `{ "limit": 1..20 }` caps entries imported per feed. Inbox **Check now** uses 5. Scheduled checks run every six hours without this manual cap.
- `POST /capture/:id/triage` — promote an Inbox item to Queue or exclude it; queue overflow requires explicit override.
- `POST /artifacts`, `GET /artifacts`, `GET /artifacts/:id` — R2-backed files and metadata. Multipart uploads normalize string, boolean, numeric, and JSON metadata including `revision`, `supersedes_pair_id`, `quality_score`, `qa_status`, `qa_checked_at`, `qa_checks_json`, `coverage_status`, `repair_status`, `repair_reason`, `video_format`, `custom_prompt_applied`, `notebook_url_linked`, `source_indexed`, and `download_verified`. Lite Visual HTML/PDF and NotebookLM cinematic video uploads enforce their QA contracts; failed contracts return HTTP 422 with `quality_assurance.status=repair_required`, `failures`, and `repair_status=required`. `GET /artifacts` exposes normalized `quality_assurance` (`unverified`, `passed`, or `repair_required`) and joins each file's `notebook_url` from the owning recommendation.
- `POST /capture/:id/visualise` — enqueue-only `visualise_source` Hermes work. The payload requires a custom prompt and QA, sets the HTML quality threshold to 8, and expects the `html` and `pdf` roles; the route does not run a generic Worker visualiser.
- `GET /artifacts/:id/view` — render Markdown artifacts as a safe, readable HTML document.
- `POST /artifacts/:id/process` — queue an idempotent `extract_notes` Hermes job; a failed extraction is reset to `retry` by the same call.
- `POST /recommendations/action` — update recommendation status, rating, review, consumed date, and optionally register an item-specific `notebook_url`, which Learn → Files exposes as the NBLM button.
- `GET/POST /sessions`, `POST /sessions/start`, `POST /sessions/:id/return` — hidden external-handoff lifecycle owned by the Queue UI. Starting an unfinished item resumes it. Returning with `reflection` creates one idempotent personal `kind=reflection` note. A completed return with `auto_enqueue:true` queues the idempotent feedback analysis; ratings 7–10 additionally queue Notes Extractor for a separate source note and recall drafts.
- `GET/POST/PUT /notes` — personal feedback and separate structured source notes presented together by the source-centric Notes UI. `POST /notes/:id/process` queues auditable Taste Mapper analysis for feedback or a full bilingual Notes Extractor re-run for source notes.
- `GET /srs/drafts`, `PUT /srs/drafts/:id`, `POST /srs/drafts/:id/approve`, `POST /srs/drafts/:id/reject` — editable recall drafts.
- `GET /learning/srs/cards`, `DELETE /learning/srs/cards/:id` — list or permanently remove approved review cards.
- `POST /feedback/record` — the canonical feedback write. Resolve by ID, exact URL, or exact title; capture an untracked source; preserve feedback verbatim; update rating/completion; create idempotent analysis/extraction work; and return the exact source receipt.
- `GET /feedback/proposals`, `POST /feedback/proposals/:id/approve`, `POST /feedback/proposals/:id/reject` — list Hermes changes before mutation. Evidence-qualified profile/map/scoring proposals may be applied exactly once during the active conversation; skill, prompt, code, schema, runtime, and workflow proposals remain reviewable, while deployment, deletion, and external publication require separate explicit instruction. The route merges supported `quality_rule` and `operational_style` changes into their canonical profile JSON columns and rejects unsupported types without marking them applied.
- Existing `/learning/srs/due`, `/learning/srs/review`, and `/learning/srs/create` remain compatible.

## AI & Curation

- `GET /compass/pick` — return the newest active `ready` or `started` Personal Bayesian Cascade pick. Multiple concurrent picks may exist; this singular read remains backward-compatible.
- `POST /compass/picks` — submit 3–8 candidates with canonical URL, title, creator, format/source class, topics/branch, optional duration/access metadata, and evidence. The Worker checks source reachability, canonicalizes and semantically deduplicates, excludes known/mastered/blocked material, uses taste/priority/creator/format/outcome context, pairwise-ranks with fit/bridge/challenge weights, records a score receipt, and ignores client scores or verification flags. A submission is accepted while the active queued/in-progress count is below five, even when another Compass pick is `ready` or `started`; it does not start the new pick. The response includes `eligible_count`, `active_queue_count`, `queue_cap`, `score`, calibrated `confidence`, `margin`, `source_check`, and an exact `abstention_reason` when withheld.
- `POST /compass/pick/:id/candidates` — append research candidates to an abstained pick and rescore the combined set (maximum eight); the replacement pick retains the full decision receipt.
- `POST /compass/pick/:id/start` — explicitly move any `ready` pick into the normal Queue and start its session; the five-item queued/in-progress cap is enforced here.
- `POST /compass/pick/:id/feedback` — record explicit outcome, score, reason tags, and reflection. Completion moves the linked source to completed history; decline/abandonment moves it to excluded history. Written feedback or a rating is preserved on the source and queues one review-gated feedback analysis, so confirmed learning informs later picks without auto-recommending.

- `POST /ai/suggest` — legacy compatibility endpoint; new recommendation requests use `/compass/picks`.
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
- `GET/POST /agent/memory` — browse/search or write provenance-backed Hermes memory with evidence and recommendation influence links; durable entries require high confidence, temporary entries expire. Verified reversible skill improvements use `memory_kind: "durable"`, a `skill_procedure:*` key, validation evidence, scope, and supersession metadata.
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
- `GET /agent/openapi.json` — compact OpenAPI description for HTTP/tool clients.
- `POST /agent/request` — execute one allow-listed site operation with `{method,path,body}`.
- `GET /agent/tools` and `POST /agent/tool-call` — function-calling declarations and execution.

Agent mutations reuse product validation, require `x-api-token` when configured, and audit to `agent_logs`. Arbitrary SQL, arbitrary paths, and outbound proxying are not exposed.

`GET /brain/profile` is the complete personal-learning snapshot: core profile, priorities, mastered knowledge, exclusions, learned patterns, taste affinities, creator history, written reflections, rating history, profile activity, feeds, and learning/system counts. `POST /brain/profile` updates any supplied editable profile field: `core_filter`, `mega_priority`, `identity`, `reaction_style_json`, `quality_rules_json`, `operational_style_json`, `patterns_summary_json`, and `recent_signal`. The four `*_json` fields also accept their legacy un-suffixed aliases.

## Settings and organization

- `GET /settings` — stored preferences plus fully resolved defaults; `PUT /settings/:key` updates one preference group.
- `GET/PUT /dashboard/layout` — adaptive module pins/order.
- `GET/POST /collections`, `POST /collections/:id/items` — durable collections.
