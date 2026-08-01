# Learning Compass — Current State

Update this file whenever a milestone is completed, a contract changes, a deployment occurs, or a new blocker is discovered. Keep only current facts; remove resolved or superseded entries instead of accumulating a diary.

**Last verified:** 2026-07-31
**Production Worker version:** `32ab7aee-284c-4820-8066-2254f1a4c73b`



## Working Baseline

- The Queue view displays smart hooks/rationales for all items instead of static generic fallback text.
- The recommendation engine (/ai/suggest & /agent/context) strictly excludes all read/mastered books and topics, enforces a minimum 50%+ non-video format quota (papers, essays, podcasts, books), anchors recommendations to user reflections, fast-tracks counter-evidence within 14-30 days, generates sharp contrast hooks, and cycles through multi-mode curation.
- The product and repository are named Learning Compass; legacy worker, storage, protocol, cron, and Hermes identifiers remain stable for compatibility.
- NotebookLM Pro Master Corpus is configured at `https://notebook.google.com/notebook/2c8a58a9-32b8-45db-804f-b48bf756e82c` (ID: `2c8a58a9-32b8-45db-804f-b48bf756e82c`). Hermes syncs original user reflections, notes, ratings, Taste Tree updates, and clean raw source text (with YouTube timestamps and PDF boilerplate stripped) during recommendation-feedback handling. Generated AI text (e.g., auto Egyptian-Arabic text, Lite Visual HTML/PDF) is excluded unless explicitly confirmed as Mahmood's thoughts. Direct Studio requests (Audio Overviews, Mind Maps, Slides, Video, Reports, Flashcards, Quiz, Infographics, Data Tables) execute immediately on explicit chat request, deduplicate by type, and verify downloads. Source-specific requests create a fresh notebook, add the source URL, start the artifact without download/upload or waiting, and immediately persist that notebook URL on the matching site item.
- NotebookLM grounded Q&A and Studio generation use native `notebooklm-mcp` tools (`mcp__notebooklm__*` from `PleasePrompto/notebooklm-mcp@latest`) as the primary engine and `notebooklm-py` (v0.7.3) as the direct Python API & CLI backup engine. Playwright DOM automation has been completely removed.
- PDF handwriting extraction resolves the NotebookLM notebook registered on each recommendation, with the Master Corpus as fallback.
- Vite/Preact/TypeScript client and Hono Worker build successfully.
- The destination registry has 29 purposeful routes; Curate contains Queue, Discovery, RSS Feed (Inbox), Collections, Resurfacing, Contradictions, and Archive. Learn starts with Files, with dedicated NotebookLM (Master Corpus status & Studio workbench), Reflections, Notes, Cards, Review, Changes, and Journal views. Vault and Sessions are removed from the UI.
- Recommendation Discovery Engine V2 operates self-improving wave exploration (R1, R2, R3+), 5-10m open-web research contracts, research quality gates (>= 20 candidates across >= 4 source classes with >= 8 verified sources), hard feedback gate, decision receipts (Contrast Hooks), Hermes adaptive feedback interview loops, evidence-controlled branch evolution, bounded weight adaptation, host-side skill revision synchronization, and mathematical **Dialectic Divergence Optimization** ($S_{\text{dialectic}}(d) = \lambda \cos - (1-\lambda)|\cos - \theta_{\text{target}}| + \mu \mathbb{I}_{\text{refutation}}$ with target orthogonal angle $\theta_{\text{target}} = 0.25$).

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
- Inbox manages RSS and Atom subscriptions. Adding or refreshing a feed imports up to 20 deduplicated articles, enabled feeds refresh every six hours, and feed items never bypass Inbox triage.
- Curate opens with Queue first; the former Inbox destination is now labeled RSS Feed while retaining its capture and triage behavior.
- Feed history is readable through `GET /capture/feeds/:id/entries`; the Hermes `rss-feed` skill covers subscription, refresh, pagination, and reporting.
- Archive keeps a pinned RSS/Atom feed shelf first and filters feed captures out of the normal source list; manual archive counts and filters remain unchanged.
- Learn Files groups Lite Visual HTML/PDF artifacts as one source and exposes both actions.
- Lite Visual enqueues and executes background jobs via Opencode API directly in the Cloudflare Worker, featuring real-time polling, expandable execution trace, desktop Web Notifications, in-app Web Audio API sound chime, job cancellation (`POST /agent/jobs/:id/cancel`), and automatic handoff/linking to Learn Files (`/#/learn/files`).
- Learn Files renders Markdown artifacts through a safe readable HTML view, including the RSS feature guide.
- Learn Files rows can be removed after confirmation; linked reading companions are deleted together to free R2 space, and legacy Vault rows use the existing compatibility delete path.
- `POST /artifacts/:id/process` creates an idempotent extraction job and retries a failed extraction; Vault exposes its current extraction state and retry action.
- Settings are resolved from stored values and now control retention scheduling, capture enrichment, SRS-draft generation, and profile-proposal review behavior.
- The service worker fetches new navigation shells before falling back to cache, avoiding stale lazy-chunk references after deployment; the manifest includes a local app icon.
- Hermes skills and memories describe the current D1/R2 architecture and connected Lite Visual workflow.
- Hermes cron polls every two minutes and uses the Cloudflare-compatible User-Agent.
- Hermes job leases now require the claiming worker identity for heartbeat, completion, and failure, and `/agent/jobs/health` exposes queue counts, stale leases, and recent failures.
- Agent control protocol exposes the complete allow-listed site API through `/agent/capabilities`, `/agent/openapi.json`, `/agent/request`, and `/agent/tool-call`; mutations are audited in `agent_logs` and preserve product validation.
- `POST /brain/profile` updates all editable profile fields, including reaction style, quality rules, operational style, pattern summary, and recent signal, with legacy aliases preserved.
- `POST /ai/suggest` LLM curation prompt and Hermes `taste-rec` / `taste-enhancer` skills are fully synchronized with Mahmood's explicit exclusion rules (zero book-derived Islamic recs, existential death content only, real-life/business storytelling, mastered dopamine/habit neuroscience, Mathur/ProPublica dark patterns, and shippable AI dev tools without corporate PR).
- Hermes explicit recommendations use a bounded fast path: one `/agent/context` preflight, selected-run reuse, three parallel research leaves, one complete candidate batch, and immediate activation; feedback-only skills are excluded from new recommendation runs.
- Hermes now has a canonical `learning-compass-site-operator` skill for linear, verified read/write/delete control across all Learning Compass tabs and live Worker APIs; its request wrapper was smoke-tested against 88 live capabilities and `/agent/context`.

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
- Live Curate navigation opens with Queue followed by RSS Feed

All returned successfully after the last deployment.

## Last Local Verification

On 2026-07-31:

- NotebookLM broker Python compilation, exact-cache smoke test, and start/status/stop lifecycle passed.
- `npm test` — 31 unit tests and TypeScript checks passed.
- `npm run build` — production client build passed.

On 2026-07-29:

- `npm test` — 17 unit tests and TypeScript checks passed.
- `npm run build` — production client build passed.
- `npm run test:e2e` — all 27 destinations, mobile shell, and mobile navigation passed.
- `git diff --check` — passed.

## Known Product Gaps

Treat these as the next-value queue, not as claims that the current app is broken:

1. Populate and validate real intelligence data: SRS backfill, contradictions, missing taste vectors, decay/staleness, Creator Trust, and forecast quality.
2. Complete full offline mutation conflict handling beyond cached reads and pending text captures.
3. Complete browser push and Telegram reminder controls and delivery verification.
4. Expand large-data, migration rehearsal, visual-regression, and bilingual direction coverage.
5. Verify complete external handoff → return → reflection → Finish and Process → recall approval → Review against production-like data.

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
