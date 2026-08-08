# Learning Compass — Current State

Update this file whenever a milestone is completed, a contract changes, a deployment occurs, or a new blocker is discovered. Keep only current facts; remove resolved or superseded entries instead of accumulating a diary.

**Last verified:** 2026-08-08
**Production Worker version:** `bd47620d-0c5c-4403-82a6-4e0559501eb4`

Production D1 migrations `0014_canonical_activity_ledger.sql` and `0015_outcome_learning_integrity.sql` were applied on 2026-08-08 after the live Momentum route exposed the missing activity ledger.

## Recent Changes

- **Momentum action workspace deployed** (2026-08-08): Production Worker version `bd47620d-0c5c-4403-82a6-4e0559501eb4` combines the 14-day chain and honest weekly totals into one runway, keeps the current source and reading kit prominent, exposes every original/HTML/PDF/Notes/NotebookLM link across the full Queue, and replaces vague format/win cards with one concrete next move. Unit/type checks, Hermes verification, migration rehearsal, production build, 18-destination E2E, desktop/mobile browser rendering, and `git diff --check` passed.

- **Streak clarity deployed** (2026-08-08): Production Worker version `fba2f732-d2cb-4da2-80a2-911022b6a056` serves the clearer streak chain, Cairo-time expiry countdown, today-secured state, best streak, last activity, and 14-day activity trail.

- **Streak clarity** (2026-08-08): Momentum now shows a 14-day activity chain, current and best streaks, whether today is secured, the last activity date, and a live Cairo-time countdown until the current day closes. The API computes an active yesterday-only chain correctly instead of dropping it to zero before midnight.

- **Learning intelligence integrity** (2026-08-08): canonical activity ledger (`0014`) now powers Momentum streaks, heatmap, detail, and weekly counts; structured feedback captures completion state, reasons, expected-vs-actual, effort, and time; terminal outcomes backfill/update shared calibration records (`0015`); taste and creator identities are canonicalized with evidence/recency confidence; Learning Balance counts unmapped completed sources in its denominator.
- **Explainable learning loop** (2026-08-08): Dashboard briefing exposes `next_action_detail`; Source Record and finish dialogs collect structured feedback; malformed profile JSON is rendered as a repair signal instead of raw data.
- **Archive-wide feedback context** (2026-08-08): `GET /feedback/context` exposes all preserved reactions, structured feedback, profile state, and map nodes; each new feedback job instructs Taste Mapper to read this complete evidence before enhancing profile/map proposals.

- **Books chapter UI** (2026-08-04): Click book title to expand/collapse chapters. Each chapter shows number badge, title, status, file links (HTML/PDF/NBLM), upload buttons for missing files, and Finish/Undo toggle. Uses same design language as Files tab. Chapter file uploads use existing `POST /artifacts` endpoint with chapter metadata.

## Feature Notes

- Queue and Compass Picks support an optional source-grounded `context_brief` before-you-start topic breakdown. Migration `0012_context_brief.sql` applied to production D1; Worker deployed 2026-08-04; both existing Queue items backfilled with source-grounded briefs.
- Book companions now use migration `0013_book_visual_chapters.sql`: Hermes publishes one HTML/PDF pair per chapter, while Books exposes both choices and per-chapter finished state.
- Books have a dedicated Curate shelf backed by the canonical source model. Users can add title/author/ISBN records, then promote them through Inbox, Queue, learning sessions, notes, ratings, and recall like any other source.
- **Books chapter UI**: Click a book title to expand/collapse its chapters. Each chapter row shows chapter number badge, title, status, and action buttons (HTML/PDF/NBLM links when available, Upload HTML/PDF buttons when missing, Finish/Undo toggle). Chapter files use the same design language as the Files tab (artifact-actions pattern). Upload creates artifacts with correct chapter metadata via existing `POST /artifacts` endpoint.
- **Visual Mind Skill (`~/.hermes/skills/visual-mind`)**: Created visual asset generation pipeline (Mermaid/SVG code-as-visual, video keyframe extraction via `yt-dlp`+`ffmpeg`, web image search, and HTML-to-PNG rendering via Playwright). Integrates into `lite-visual` via `images.json` manifest. Tested end-to-end against queued item `"The Art of Boring Startups That Raise Millions"` (`cap_1785850753652_453640`), generating 6 rich visual assets (flywheel diagram, 5 metrics dashboard, revenue multiple comparison table, Atlassian timeline, and 2 video keyframes).
- **Masterclass Content Writing Engine (`~/.hermes/skills/master-editorial-synthesis`)**: Codified non-fiction structural architecture (Barbara Minto Pyramid + SCQA + John McPhee structural design + Braided Analytical Narrative), 6 Anti-AI-Slop Directives (zero fluff/meta-commentary, concrete mechanics over abstract labeling, exact source anchors, inline `<dfn>` terms, calibrated registers, source-proportional scaling), High-Engagement Narrative Dynamics & Rhetorical Velocity (cadence variation, active verbs, paradox hooks, curiosity seeds, system drama, visceral spatial metaphors, intellectual suspense), Visual Essay Spatial Design rules, a 5-Pass Editorial Pipeline with a 5-Dimension Quality Gate (score ≥ 8/10, zero defects), and a dedicated **Lightweight Model Guardrail Framework** (few-shot slop-to-masterclass style translation table, block-by-block structural blueprint templates, banned phrases blacklist, sentence-length and variance rules) to force dumber/flash models to output perfect prose. Synchronized across `lite-visual`, `visual-mind`, `learning-notes-extractor`, and `learning-compass-operating-system`.
- **Lite Visual Enhanced Companion**: Built and validated the HTML+PDF visual companion for `"The Art of Boring Startups That Raise Millions"`, embedding `visual-mind` assets, responsive layout, dark contrast, inline term definitions, and source anchors. Ran `validate_artifact.py` with `RESULT: PASS` (tablet/mobile viewports passed, 0 console errors, PDF 7 pages A4 print-ready).
- **Permanently Codified Skill Pitfalls**: Updated `~/.hermes/skills/lite-visual/SKILL.md` and `~/.hermes/skills/visual-mind/SKILL.md` to permanently enforce: (1) mandatory Base64 Data URI inline encoding for all HTML image assets to prevent R2 404 relative path failures; (2) strict rejection of useless talking-head video keyframes (retaining only slides, whiteboard drawings, demonstrations, and screen-shares); (3) mandatory `@media (max-width: 768px)` responsive CSS breakpoints; and (4) strict validator evidence packet keyword formatting.
- **Visual Pipeline Contract v2** (2026-08-04): Visual Mind now uses `visual-contract.schema.json`, SHA-256 asset/source identity, authored captions/alt text/claims/anchors/learning roles/placements, per-pair style locks, and Gemini API-only OCR/review/native image generation. Mermaid rendering is locally pinned and offline; chart rendering, slide extraction, SVG/HTML label occlusion, stepwise diagram exploration, and visual recall components are available. Lite Visual validates manifest coverage at four responsive breakpoints and a six-page PDF inspection set. Current Gemini free-tier image-generation quota is exhausted; native generation fails explicitly rather than falling back to local OCR, alternate providers, or local generation.

- Restored the five missing editable Aronson recall drafts directly in canonical D1 from the terminal Notes Extractor receipt; no Worker deployment was needed.
- Personal Bayesian Cascade is live behind `/compass`: multiple concurrent ready/started Compass Picks are supported while the active queued/in-progress Queue count is below five; `GET /compass/pick` returns the newest one, submissions do not auto-start, and explicit Start/feedback remain required. Adaptive 3–8 candidate submissions, server-owned scoring, confidence/margin abstention, and separate Compass outcome storage remain intact. Legacy Discovery V2 and `/ai/suggest` remain compatibility/archive paths.
- Abstained Compass Picks with a verified or restricted reachable source now expose and honor an explicit **Add to Queue anyway** override. The override bypasses only the automatic score/confidence threshold; malformed, blocked, unavailable, or private sources remain rejected and the five-item Queue cap still applies.
- Compass scoring now checks source reachability, canonicalizes URLs, removes exact/semantic duplicates, excludes consumed/active/rejected/mastered/blocked sources, uses priorities, taste vectors, sample-size-shrunk creator/format outcomes and format fatigue, applies distinct fit/bridge/challenge pairwise ranking, records calibrated decision receipts and predicted outcomes, learns explicit Compass outcomes, and ignores client scores/verification flags. Compass feedback atomically puts completed picks in completed history and declined/abandoned picks in excluded history; any written feedback or rating is preserved and queued for auditable Taste Mapper analysis.
- Hermes self-improvement is conversation-driven, not scheduled: every Hermes turn completes the user's task first, then may apply the smallest evidence-qualified profile/map/scoring improvement or save a validated, reversible skill-procedure improvement to D1 `hermes_memory`. Skill-source edits remain proposal-only; deployment, destructive deletion, and external publication are explicit-only. Explicit corrections are authoritative, repeated evidence requires confidence of at least 0.8 for data learning or 0.9 for skill-procedure memory, weak inferences remain hypotheses, and no evidence means no mutation.
- Hermes side-effect tiers are enforced by `docs/hermes-contract.json`: profile/map/scoring learning and verified skill-procedure memory may apply automatically at their thresholds; skill-source/prompt/code/schema/runtime/workflow changes are proposal-only; deployment, destructive deletion, and external publication are explicit-only. Every specialist returns the standard receipt fields.
- Hermes inference order is verified as OpenCode Go `deepseek-v4-flash`, OpenCode Zen `deepseek-v4-flash-free`, OpenAI Codex `gpt-5.6-luna`, then Nous `tencent/hy3:free`.
- Hermes evaluator proposals now use canonically supported `quality_rule` and `pattern_hypothesis` types instead of the unapprovable `evaluator_signal` type. Only evidence-qualified profile/map/scoring proposals may apply during the active conversation; system-layer proposals remain reviewable.
- Legacy pending proposal aliases `recent_signal` and `quality_rules_json` now normalize to the supported approval types, so existing Activity proposals remain approvable while unknown types stay blocked.
- Production health and `/learning/balance?window=90` verified after deployment. Live balance reports 4 mapped completed sources, 16 unmapped completed sources, zero over-focus alerts at the current sample size, and six exposed-but-not-consolidated branches.
- Added and deployed the explicit Hermes map-maintenance path: `POST /recommendations/map` attaches completed sources to existing map nodes, rejects incomplete or ambiguous targets, updates outcome branch evidence, and returns the verified mapping. All 23 completed sources were mapped to existing nodes; live `/learning/balance?window=90` now reports `unmapped_count: 0` and `mapped_consumed: 22/22` for the active window.



## Working Baseline

- The Queue view displays smart hooks/rationales for all items instead of static generic fallback text.
- The legacy recommendation engine (`/ai/suggest`) remains compatibility-only. New Compass Picks use adaptive strategy lanes, server-owned scores, hard exclusions, and no fixed format/candidate quota.
- The product and repository are named Learning Compass; legacy worker, storage, protocol, cron, and Hermes identifiers remain stable for compatibility.
- NotebookLM Pro Master Corpus is configured at `https://notebook.google.com/notebook/2c8a58a9-32b8-45db-804f-b48bf756e82c` (ID: `2c8a58a9-32b8-45db-804f-b48bf756e82c`). Hermes syncs original user reflections, notes, ratings, Taste Tree updates, and clean raw source text (with YouTube timestamps and PDF boilerplate stripped) during recommendation-feedback handling. Generated AI text (e.g., auto Egyptian-Arabic text, Lite Visual HTML/PDF) is excluded unless explicitly confirmed as Mahmood's thoughts. Explicit Studio requests (Audio Overviews, Mind Maps, Slides, Video, Reports, Flashcards, Quiz, Infographics, Data Tables) start immediately and deduplicate by type. Source-specific requests create a fresh notebook, add the source URL, start the artifact without download/upload or waiting, and immediately persist that notebook URL on the matching site item; download and publication happen only when explicitly requested.
- NotebookLM grounded Q&A and Studio generation use native `notebooklm-mcp` tools (`mcp__notebooklm__*` from pinned `PleasePrompto/notebooklm-mcp@2.0.0`) as the primary engine and `notebooklm-py` (v0.7.3) as the direct Python API & CLI backup engine. Playwright DOM automation has been completely removed.
- PDF handwriting extraction resolves the NotebookLM notebook registered on each recommendation, with the Master Corpus as fallback.
- Vite/Preact/TypeScript client and Hono Worker build successfully.
- The destination registry has 18 purposeful routes. Curate contains Queue, Inbox, Collections, Archive, and Books; Map contains Atlas and Coverage; Learn contains Files, extracted Notes library, Recall, and Activity; Insights contains Overview, Taste, and Hermes; Settings contains Profile, Preferences, and Data. Legacy routes redirect to their merged destinations.
- The standalone NotebookLM page and non-executing Studio workbench are removed. NotebookLM remains a Hermes backend and source-specific links remain contextual in Files and source records.
- Notes is the extracted-knowledge library: it lists only Notes Extractor source notes (`kind=guide`), each opens in a dedicated typographic reader with section navigation and in-place editing, and keeps one explicit Source context hop back to the full source record that presents exact personal feedback, extracted bilingual sections, proposals, files, recall, outcome, memory influence, and session history while internal job state stays out of the UI.
- `POST /feedback/record` is the single tracked/untracked feedback mutation and exact receipt. Activity applies an approved proposal once without creating a redundant application job.
- Momentum replaces the unused Briefing as the default home: it shows a 14-day streak runway with weekly totals, opens the current Queue source and reading kit, exposes the original and every companion file across the five-source queue manifest, and ends with one concrete next move. Vague pattern and recent-win cards are removed. Compass Pick appears only when the queue is empty.
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
- Lite Visual now requires exact source/pair resolution, complete-source evidence packets with coverage matrices, measured metadata, responsive/print validation, a six-page PDF inspection set, an 8/10 HTML quality gate, versioned pair metadata, one verified HTML extraction job, and canonical source-record verification.
- Artifact publication now has a machine-readable QA contract: visualise enqueueing is Hermes-only; strict Lite Visual HTML/PDF and NotebookLM cinematic-video gates return structured repair-required failures, while GET `/artifacts` normalizes legacy files as unverified and exposes compact QA state to Learn → Files.
- No scheduled Hermes poller is active; explicit workflows process only the work they create.
- Hermes job leases now require the claiming worker identity for heartbeat, completion, and failure, and `/agent/jobs/health` exposes queue counts, stale leases, and recent failures.
- Hermes upgrades now record predicted-versus-actual recommendation outcomes, enforce unique verified discovery URLs, recalibrate engine weights only from five or more rated outcomes with slow bounded deltas, and expose the evidence in Insights → Hermes.
- Hermes now exposes a weekly evaluator report, reviewable proposal generation, and an explicit dry-run/opt-in intelligence backfill for SRS cards, outcomes, taste vectors, creator trust, and contradiction candidates.
- Hermes memory is provenance-backed and typed (`durable`, `episodic`, `working`, `rejection`, `hypothesis`); durable entries require confidence, temporary entries expire, and replacement requires explicit supersession.
- Insights → Hermes includes Memory Review with search, evidence inspection, approval, rejection, and expiry; source records expose recommendation-level memory influence links.
- NotebookLM broker health now has heartbeat, stale-session, recovery receipt, and explicit grounded/fallback/offline reporting. The Worker does not claim to control the host browser session.
- Hermes evaluator reports accuracy, abandoned sources, prediction error, best creators/formats, and taste drift when conversation evidence makes evaluation relevant. Intelligence backfill is idempotent and dry-run by default; no evaluator cron is active.
- Internal Hermes work retains idempotent leases and recovery APIs, but no scheduled poller is active and the site exposes no job controls.
- Hermes contract verification is available through `npm run verify:hermes` and checks migration order, route/API registration, docs, and the repository Hermes contract.
- Each Queue item now opens a linked source record containing its session history, personal reflection, extracted note, companion files, recall drafts/cards, and measured outcome.
- Browser mutations carry stable client IDs with server-side successful-response receipts; offline conflicts and failed writes remain visible in Settings → Data with retry/discard actions.
- Reminder controls now support browser subscriptions, VAPID-backed Web Push delivery, Telegram chat configuration, due-review scheduling, and persisted delivery evidence.
- Migration rehearsal is idempotent through `npm run verify:migrations`; large-library pagination, responsive overflow, screenshot smoke, bilingual extraction, and source-record integration checks are covered.
- Agent control protocol exposes the complete allow-listed site API through `/agent/capabilities`, `/agent/openapi.json`, `/agent/request`, and `/agent/tool-call`; mutations are audited in `agent_logs` and preserve product validation.
- `POST /brain/profile` updates all editable profile fields, including reaction style, quality rules, operational style, pattern summary, and recent signal, with legacy aliases preserved.
- `GET /learning/balance` is the canonical attention/retention read model for Coverage and Hermes: R1/R2/R3 hierarchy, recent attention share, explicit priority share, notes, SRS due cards, recall strength, explainable uncovered/at-risk/exposed branch states, and unmapped-source warnings. Compass scoring consumes the same branch signals with bounded boosts/penalties.
- Feedback proposal approval now persists `quality_rule` and `operational_style` changes through the canonical profile JSON columns, remains idempotent, and leaves unsupported proposal types pending.
- `POST /ai/suggest` LLM curation prompt and Hermes `taste-rec` / `taste-enhancer` skills are fully synchronized with Mahmood's explicit exclusion rules (zero book-derived Islamic recs, existential death content only, real-life/business storytelling, mastered dopamine/habit neuroscience, Mathur/ProPublica dark patterns, and shippable AI dev tools without corporate PR).
- Hermes recommendation skills target Compass Cascade and retain Mahmoud's explicit exclusion rules; `/ai/suggest` is compatibility-only. Normal requests use one exposed pick; queue-fill requests continue generating and explicitly starting picks until five queued/in-progress items exist. Submissions never auto-start, and explicit feedback never creates a follow-up recommendation.
- Hermes is now a Learning Compass-only procedural operating system. `learning-compass-operating-system` routes every chat event—especially a reflection—into one verified site procedure, then calls one focused specialist. Exactly ten focused Learning Compass skills and their required project tools remain active; duplicate and generic skills/plugins are disabled or removed from the Hermes profile.

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

On 2026-08-03:

- Added the canonical `/learning/balance` read model and collapsed Scholar’s Instrument Coverage surface. It exposes R1/R2/R3 attention share, explicit priority share, notes, SRS due cards, recall strength, explainable branch states, unmapped-source warnings, and a Notion-style branch detail popup. `/agent/context` and Compass scoring consume the same balance signals with bounded adjustments. `npm test` — 55 unit tests + TypeScript; `npm run build`; `npm run test:e2e`; `npm run verify:hermes`; and `git diff --check` passed. Deployed as Worker version `8ff0ae3a-fe85-4507-a604-7f353dd4b4c6`; live health and balance smoke checks passed.
- Settings → Profile is a card-led personal-learning record: core profile, priorities, mastery, exclusions, learned patterns, taste affinities, creator history, written reflections, ratings, feeds, activity, and learning/system counts are grouped into expandable visual sections. Normal viewing uses tags and compact cards rather than JSON or raw database rows; advanced core-field editing remains available. Deployed as Worker version `4f2a4e16-e534-4994-82e1-01389b993808`; live health and Profile rendering passed.
- Reduced Hermes to ten validated Learning Compass skills, removed duplicate/obsolete skill trees and stale Playwright/Discord/debug artifacts, disabled autonomous curation, and confirmed no scheduled jobs.
- Replaced the unreliable model configuration with the tested chain: OpenCode Go DeepSeek V4 Flash, OpenCode Zen DeepSeek V4 Flash Free, OpenAI Codex GPT-5.6 Luna, then Nous Hunyuan 3 Free.
- Pinned `notebooklm-mcp@2.0.0`; MCP startup discovered 20 tools. Hermes Doctor, config validation, all skill validators, gateway restart, and a live default-model smoke test passed.

On 2026-08-02:

- Deployed the media QA contract on Worker version `701ecaf5-87ca-4504-bdb0-d365ee97290e`: Lite Visual is Hermes-only and source-prompted, HTML/PDF uploads are quality-gated, NotebookLM video publication requires cinematic/custom-prompt evidence, and Files exposes verified or repair-required QA state.
- Deployed the context-aware Compass scorer on Worker version `00f75fa3-bd42-4baf-9f60-85394417d4c4`; health, Momentum, Inbox, Queue, Notes, Recall, pending jobs, and Compass Pick reads all returned 200.
- Replaced the default Briefing with the file-first Momentum workspace: active mission files, full Queue shelf, weekly completion/note/recall progress, evidence-backed insight, and recent wins. The legacy route redirects cleanly.
- Deployed Momentum on Worker version `b19ef202-1671-481a-8c46-d65956cf3614`; live API and client-asset smoke checks passed.
- Added the compact Momentum streak keeper: a seven-day chain, current streak, today-secured state, and direct action to preserve momentum.
- Deployed the streak keeper on Worker version `8d42d061-bbe2-488b-a8fc-fe3f7df37fb0`; live API and client-asset smoke checks passed.
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
