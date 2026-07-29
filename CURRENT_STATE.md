# Learning Compass — Current State

Update this file whenever a milestone is completed, a contract changes, a deployment occurs, or a new blocker is discovered. Keep only current facts; remove resolved or superseded entries instead of accumulating a diary.

**Last verified:** 2026-07-29
**Production Worker version:** `b7ebd428-caf3-4260-b2b9-013fd8dfd220`

## Working Baseline

- The product and repository are named Learning Compass; legacy worker, storage, protocol, cron, and Hermes identifiers remain stable for compatibility.
- Vite/Preact/TypeScript client and Hono Worker build successfully.
- The destination registry has 28 purposeful routes; overlapping infrastructure-oriented tabs were removed and all route contracts agree.
- Mobile shell/navigation tests pass.
- Unit tests and TypeScript checks pass.
- Scholar's Instrument tokens, desktop rail, mobile navigation, themes, and route-specific surfaces are present.
- Atlas uses a lazy-loaded, cluster-first spatial canvas with a major-branch overview, progressive expansion, search, filtering, touch navigation, a responsive inspector, and animated branch dragging that carries visible descendants while preserving their positions.
- The D1 knowledge graph contains 201 nodes; all 190 semantic nodes and parent relationships from the user-selected `Map.canvas` are merged without importing canvas layout or removing Atlas-only nodes.
- Cloud-backed collections, resurfacing, contradictions, archive, branches, coverage, taste signals, creator performance, journal history, forecasts, files, notes, profile data, and global search have purpose-built user-facing views.
- Internal storage and automation terms are hidden from normal product copy.
- D1 remains canonical; R2 artifact storage is active.
- Universal capture always lands in Inbox; the five-item queue can only be exceeded with an explicit triage override. Sessions resume after reload, return calls create one linked five-section reflection and can complete the session atomically, completed rows are hidden from active Sessions, structured notes use batched section reads, SRS approvals are one-time, and durable Hermes jobs reclaim expired leases.
- Inbox manages RSS and Atom subscriptions. Adding or refreshing a feed imports up to 20 deduplicated articles, enabled feeds refresh every six hours, and feed items never bypass Inbox triage.
- Curate opens with Queue first; the former Inbox destination is now labeled RSS Feed while retaining its capture and triage behavior.
- Feed history is readable through `GET /capture/feeds/:id/entries`; the Hermes `rss-feed` skill covers subscription, refresh, pagination, and reporting.
- Archive keeps a pinned RSS/Atom feed shelf first and filters feed captures out of the normal source list; manual archive counts and filters remain unchanged.
- Vault groups Lite Visual HTML/PDF artifacts as one source and exposes both actions.
- Vault renders Markdown artifacts through a safe readable HTML view, including the RSS feature guide.
- Vault rows can be removed after confirmation; linked reading companions are deleted together to free R2 space, and legacy Vault rows use the existing Vault delete path.
- `POST /artifacts/:id/process` creates an idempotent extraction job and retries a failed extraction; Vault exposes its current extraction state and retry action.
- Settings are resolved from stored values and now control retention scheduling, capture enrichment, SRS-draft generation, and profile-proposal review behavior.
- The service worker fetches new navigation shells before falling back to cache, avoiding stale lazy-chunk references after deployment; the manifest includes a local app icon.
- Hermes skills and memories describe the current D1/R2 architecture and connected Lite Visual workflow.
- Hermes cron polls every two minutes and uses the Cloudflare-compatible User-Agent.
- Agent control protocol exposes the complete allow-listed site API through `/agent/capabilities`, `/agent/openapi.json`, `/agent/request`, and `/agent/tool-call`; mutations are audited in `agent_logs` and preserve product validation.

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

On 2026-07-29:

- `npm test` — 17 unit tests and TypeScript checks passed.
- `npm run build` — production client build passed.
- `npm run test:e2e` — all 28 destinations, mobile shell, and mobile navigation passed.
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
