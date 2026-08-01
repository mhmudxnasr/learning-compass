# Learning Compass — Current State

Update this file whenever a milestone is completed, a contract changes, a deployment occurs, or a new blocker is discovered. Keep only current facts; remove resolved or superseded entries instead of accumulating a diary.

**Last verified:** 2026-08-02
**Production Worker version:** `fd54f05f-2890-4c02-b874-69e073ced88a`

- Personal Bayesian Cascade is live behind `/compass`: one unresolved Compass Pick, adaptive 3–8 candidate submissions, server-owned scoring, confidence/margin abstention, explicit Start/feedback, and separate Compass outcome storage. Legacy Discovery V2 and `/ai/suggest` remain compatibility/archive paths.



## Working Baseline

- The Queue view displays smart hooks/rationales for all items instead of static generic fallback text.
- The legacy recommendation engine (`/ai/suggest`) remains compatibility-only. New Compass Picks use adaptive strategy lanes, server-owned scores, hard exclusions, and no fixed format/candidate quota.
- The product and repository are named Learning Compass; legacy worker, storage, protocol, cron, and Hermes identifiers remain stable for compatibility.
- NotebookLM Pro Master Corpus is configured at `https://notebook.google.com/notebook/2c8a58a9-32b8-45db-804f-b48bf756e82c` (ID: `2c8a58a9-32b8-45db-804f-b48bf756e82c`). Hermes syncs original user reflections, notes, ratings, Taste Tree updates, and clean raw source text (with YouTube timestamps and PDF boilerplate stripped) during recommendation-feedback handling. Generated AI text (e.g., auto Egyptian-Arabic text, Lite Visual HTML/PDF) is excluded unless explicitly confirmed as Mahmood's thoughts. Direct Studio requests (Audio Overviews, Mind Maps, Slides, Video, Reports, Flashcards, Quiz, Infographics, Data Tables) execute immediately on explicit chat request, deduplicate by type, and verify downloads. Source-specific requests create a fresh notebook, add the source URL, start the artifact without download/upload or waiting, and immediately persist that notebook URL on the matching site item.
- NotebookLM grounded Q&A and Studio generation use native `notebooklm-mcp` tools (`mcp__notebooklm__*` from `PleasePrompto/notebooklm-mcp@latest`) as the primary engine and `notebooklm-py` (v0.7.3) as the direct Python API & CLI backup engine. Playwright DOM automation has been completely removed.
- PDF handwriting extraction resolves the NotebookLM notebook registered on each recommendation, with the Master Corpus as fallback.
- Vite/Preact/TypeScript client and Hono Worker build successfully.
- The destination registry has 17 purposeful routes. Curate contains Queue, Inbox, Collections, and Archive; Map contains Atlas and Coverage; Learn contains Files, source-centric Notes, Recall, and Activity; Insights contains Overview, Taste, and Hermes; Settings contains Profile, Preferences, and Data. Legacy routes redirect to their merged destinations.
- The standalone NotebookLM page and non-executing Studio workbench are removed. NotebookLM remains a Hermes backend and source-specific links remain contextual in Files and source records.
- Notes is source-centric: one page presents exact personal feedback, extracted bilingual sections, proposals, files, recall, outcome, memory influence, and session history while internal job state stays out of the UI.
- `POST /feedback/record` is the single tracked/untracked feedback mutation and exact receipt. Activity applies an approved proposal once without creating a redundant application job.
- Today shows a real Review now action when recall is due and includes resurfaced sources; Compass Start opens the source and preserves the active session handoff.
- Legacy Discovery Engine V2 remains readable for compatibility; new recommendation work uses the Compass Cascade and preserves its evidence/receipt data without enforcing the former 20-candidate gate.

- Mobile shell/navigation tests pass.
- Unit tests and TypeScript checks pass.
- GitHub Actions provisions a fresh migrated local D1 database and installs Playwright Chromium before running E2E.
- Scholar's Instrument tokens, desktop rail, mobile navigation, themes, and route-specific surfaces are present.
- Atlas uses a lazy-loaded, cluster-first spatial canvas with a major-branch overview, progressive expansion, search, filtering, touch navigation, a responsive inspector, and animated branch dragging that carries visible descendants while preserving their positions.
- The D1 knowledge graph contains 201 nodes; all 190 semantic nodes and parent relationships from the user-selected `Map.canvas` are merged without importing canvas layout or removing Atlas-only nodes.
- Cloud-backed collections, resurfacing, contradictions, archive, branches, coverage, taste signals, creator performance, journal history, forecasts, files, notes, profile data, and global search have purpose-built user-facing views.
- Internal storage and automation terms are hidden from normal product copy.
- D1 remains canonical; R2 artifact storage is active.
- Universal capture always lands in Inbox; the five-item queue can only be exceeded with an explicit triage override. Queue owns start/resume/finish while hidden sessions preserve linkage, return calls create one linked five-section reflection, structured notes use batched section reads, SRS approvals are one-time, cards are deletable, and durable Hermes jobs reclaim expired leases.
- Inbox manages RSS and Atom subscriptions. Subscribing or scheduled refresh imports up to 20 deduplicated articles per feed; manual **Check now** imports at most five latest entries per feed. Enabled feeds refresh every six hours, and feed items never bypass Inbox triage.
- Curate opens with Queue followed by the universal Inbox, which includes RSS/Atom subscription management and all capture triage.
- Feed history is readable through `GET /capture/feeds/:id/entries`; the Hermes `rss-feed` skill caps requested refreshes at five latest entries per feed and covers subscription, pagination, and reporting.
- Archive keeps a pinned RSS/Atom feed shelf first and filters feed captures out of the normal source list; manual archive counts and filters remain unchanged.
- Learn Files groups Lite Visual HTML/PDF artifacts as one source and exposes both actions.
- Learn Files presents reading companions without infrastructure controls, execution traces, or internal processing state.
- Learn Files renders Markdown artifacts through a safe readable HTML view, including the RSS feature guide.
- Learn Files rows can be removed after confirmation; linked reading companions are deleted together to free R2 space, and legacy Vault rows use the existing compatibility delete path.
- `POST /artifacts/:id/process` creates an idempotent extraction job and retries a failed extraction; Vault exposes its current extraction state and retry action.
- Settings are resolved from stored values and now control retention scheduling, capture enrichment, SRS-draft generation, and profile-proposal review behavior.
- The service worker fetches new navigation shells before falling back to cache, avoiding stale lazy-chunk references after deployment; the manifest includes a local app icon.
- Hermes skills and memories describe the current D1/R2 architecture and connected Lite Visual workflow.
- No scheduled Hermes poller is active; explicit workflows process only the work they create.
- Hermes job leases now require the claiming worker identity for heartbeat, completion, and failure, and `/agent/jobs/health` exposes queue counts, stale leases, and recent failures.
- Hermes upgrades now record predicted-versus-actual recommendation outcomes, enforce unique verified discovery URLs, recalibrate engine weights only from five or more rated outcomes with slow bounded deltas, and expose the evidence in Insights → Hermes.
- Hermes now exposes a weekly evaluator report, reviewable proposal generation, and an explicit dry-run/opt-in intelligence backfill for SRS cards, outcomes, taste vectors, creator trust, and contradiction candidates.
- Hermes memory is provenance-backed and typed (`durable`, `episodic`, `working`, `rejection`, `hypothesis`); durable entries require confidence, temporary entries expire, and replacement requires explicit supersession.
- Insights → Hermes includes Memory Review with search, evidence inspection, approval, rejection, and expiry; source records expose recommendation-level memory influence links.
- NotebookLM broker health now has heartbeat, stale-session, recovery receipt, and explicit grounded/fallback/offline reporting. The Worker does not claim to control the host browser session.
- Hermes weekly evaluator reports accuracy, abandoned sources, prediction error, best creators/formats, and taste drift; scheduled runs create pending proposals only. Intelligence backfill is idempotent and dry-run by default.
- Internal Hermes work retains idempotent leases and recovery APIs, but no scheduled poller is active and the site exposes no job controls.
- Hermes contract verification is available through `npm run verify:hermes` and checks migration order, route/API registration, docs, and the repository Hermes contract.
- Each Queue item now opens a linked source record containing its session history, personal reflection, extracted note, companion files, recall drafts/cards, and measured outcome.
- Browser mutations carry stable client IDs with server-side successful-response receipts; offline conflicts and failed writes remain visible in Settings → Data with retry/discard actions.
- Reminder controls now support browser subscriptions, VAPID-backed Web Push delivery, Telegram chat configuration, due-review scheduling, and persisted delivery evidence.
- Migration rehearsal is idempotent through `npm run verify:migrations`; large-library pagination, responsive overflow, screenshot smoke, bilingual extraction, and source-record integration checks are covered.
- Agent control protocol exposes the complete allow-listed site API through `/agent/capabilities`, `/agent/openapi.json`, `/agent/request`, and `/agent/tool-call`; mutations are audited in `agent_logs` and preserve product validation.
- `POST /brain/profile` updates all editable profile fields, including reaction style, quality rules, operational style, pattern summary, and recent signal, with legacy aliases preserved.
- `POST /ai/suggest` LLM curation prompt and Hermes `taste-rec` / `taste-enhancer` skills are fully synchronized with Mahmood's explicit exclusion rules (zero book-derived Islamic recs, existential death content only, real-life/business storytelling, mastered dopamine/habit neuroscience, Mathur/ProPublica dark patterns, and shippable AI dev tools without corporate PR).
- Hermes recommendation skills target Compass Cascade and retain Mahmoud's explicit exclusion rules; `/ai/suggest` is compatibility-only. The workflow uses adaptive 3–8 candidates, Worker-owned scoring, one exposed pick, explicit Start, and explicit feedback with no automatic follow-up recommendation.
- Hermes is now a Learning Compass-only procedural operating system. `learning-compass-operating-system` routes every chat event—especially a reflection—into one verified site procedure, then calls one focused specialist. Only 11 Learning Compass procedures and their required project tools remain active; all generic skills/plugins are disabled and removed from the Hermes profile.

## Last Live Verification

- `/health`
- `/dashboard/briefing`
- `/capture`
- `/capture/feeds`
- `/capture/feeds/:id/entries`
- `/artifacts/:id/view` (Markdown rendering)
- `/capture/queue`
- `/notes`
- `/learning/srs/due`
- `/agent/jobs?status=pending`
- `/knowledge/graph`
- `/artifacts`
- `/stats`, `/brain/profile`, `/brain/tree`
- `/learning/health`, `/learning/gaps`
- `/taste/dna`, `/analytics/creator-trust`, `/analytics/taste-drift`, `/analytics/forecast`
- `/recommendations/list`, `/collections`, `/search`
- Live Insights Overview, Coverage, Taste, Profile, Files, and Archive rendering against production data, including the pinned RSS shelf and clean manual count
- Live Curate navigation opens with Queue followed by Inbox

All returned successfully after the last deployment.

## Last Local Verification

On 2026-08-02:

- Cancelled all 26 pending, running, or retrying Hermes jobs without deleting source data or completed results. Production now has zero active jobs, no stale leases, and no scheduled Hermes poller.
- Removed job controls, processing state, queue reliability, failure/replay panels, and the Files skill-prompt control from the site.
- Deployed atomic feedback recording, direct proposal approval, proposal deduplication, pending-only Activity, searchable Notes, batch Recall actions, actionable Today signals, and the simplified editable Profile.
- `npm test`, `npm run build`, `npm run test:e2e`, `npm run verify:hermes`, `npm run verify:migrations`, and `git diff --check` passed. The base client is 25.31 KB gzip.
- Production D1 applied `0009_proposal_dedup.sql`; live health, job health, client assets, Notes, and Profile checks passed on Worker version `fd54f05f-2890-4c02-b874-69e073ced88a`.

On 2026-07-31:

- NotebookLM broker Python compilation, exact-cache smoke test, and start/status/stop lifecycle passed.
- `npm test` — 31 unit tests and TypeScript checks passed.
- `npm run build` — production client build passed.

On 2026-08-01:

- Learning Compass was reduced to 17 purposeful destinations; the source-centric Notes record, merged Recall/Activity/Overview/Hermes/Preferences views, legacy redirects, Today recall/resurfacing, and guarded Hermes mutations were verified locally and deployed.
- `npm run verify:hermes` — 10 migrations and 11 synchronized contract checks passed.
- `npm run verify:migrations` — clean migration apply and idempotent re-apply passed.
- `npm run test:unit` — 31 unit tests passed.
- `npm run typecheck` — passed after normalizing offline request headers and backfill body narrowing.
- `npm run build` — production client build passed.
- `npm run test:e2e` — all 17 destinations, legacy redirects, source-centric feedback workflow, mobile shell, and mobile navigation passed; the runner uses an isolated local port.
- Learning Compass router skill validation, Hermes configuration validation, gateway restart, and live fresh-chat reflection-routing smoke test passed.
- `node tests/integration/hermes_upgrade_flow.mjs` — Hermes analytics, guarded memory lifecycle, evidence gate, weekly evaluator, dry-run backfill, notifications, and capabilities passed.
- `node tests/integration/test_rec_flow.mjs` and `node tests/integration/discovery_flow.mjs` — discovery and feedback flows passed on fresh migrated D1 databases.
- `git diff --check` — passed.
- Production D1 applied `0008_compass_cascade.sql`; the deployed Worker version is `ff551f5d-79ce-4885-8fa4-3b58e51bd5eb`.
- Live smoke passed for `/health`, the canonical source record API, and the deployed client assets.
- Live smoke passed for `/health`, NotebookLM status/health, Hermes analytics/weekly evaluator, memory review, job health, and capabilities. Production backfill inserted 39 missing outcomes, 17 taste vectors, and 11 creator-trust rows; a second dry-run reported zero missing outcomes.
- Production VAPID public/private keys are configured. The in-app browser denied notification permission, so a regular-browser subscription is still required for the closed-app delivery check.

On 2026-07-29:

- `npm test` — 17 unit tests and TypeScript checks passed.
- `npm run build` — production client build passed.
- `npm run test:e2e` — all 27 destinations, mobile shell, and mobile navigation passed.
- `git diff --check` — passed.

## Known Product Gaps

Treat these as the next-value queue, not as claims that the current app is broken:

1. Enable browser notifications from Mahmood's regular browser and run one closed-app `/notifications/test` delivery.
2. Continue validating intelligence quality over real use, especially decay/staleness and forecast accuracy.

## Repository Condition

The production rebuild is source-controlled on `main`; generated `dist/` output remains ignored. Future agents must:

- preserve unrelated user modifications;
- avoid destructive Git commands;
- inspect overlapping changes before editing;
- keep generated `dist/` files ignored;
- run `git diff --check` before handoff.

## Update Template

When changing this file:

- change **Last verified** only after running relevant checks;
- change **Production Worker version** only after a successful deployment;
- move completed gaps into **Working Baseline** only when verified;
- record a blocker only when it is reproducible and unresolved;
- delete stale statements immediately.
