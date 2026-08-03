# Learning Compass — Project Context

## Purpose

Learning Compass is Mahmood's private learning operating system. It turns scattered sources into a disciplined learning loop:

**capture → curate → consume externally → reflect → extract notes → review → update the knowledge map → resurface**

The product is single-user, English-first, supports bilingual English/Egyptian-Arabic note blocks, and uses the `Africa/Cairo` timezone.

## Product Model

- **Inbox:** the Curate destination for subscriptions, captures, and triage; it remains the unlimited landing place for URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom captures. RSS/Atom entries stay grouped in the pinned Archive feed shelf instead of mixing into the manual archive list. Manual **Check now** imports at most five latest entries per feed.
- **Queue:** five active queued/in-progress items by default. Compass can prepare multiple ready picks while capacity remains; explicit starts enforce the five-item cap. Compass completion, decline, and abandonment atomically move the linked source to completed or excluded state; written feedback/rating remains attached as a reviewable learning signal. Other Queue additions still require consume/drop or an explicit override.
- **Queue and hidden sessions:** Queue owns start, resume, return, and completion. Hidden session records preserve source/reflection linkage without a separate management destination.
- **Source notes:** one source-centric Notes record presents the user's exact typed or handwritten feedback alongside the separate complete bilingual English/Egyptian-Arabic source note; incomplete legacy notes can be re-run from the site.
- **Feedback proposals:** every reflection/rating produces auditable Taste Mapper proposals. During an active Hermes conversation, evidence-qualified profile, pattern, priority, contradiction, map, and scoring changes may apply automatically at confidence ≥0.8; skill, prompt, code, schema, runtime, and workflow changes remain proposal-only; deployment, destructive deletion, and external publication require separate explicit instruction.
- **SRS:** ratings 7–10 automatically queue Notes Extractor and produce 3–5 editable drafts. Only approved drafts become review cards; drafts and active cards can be deleted.
- **Knowledge map:** branches, edges, evidence, contradictions, coverage, health, and taste signals. Learning balance combines map depth (R1/R2/R3), recent attention share, explicit priority share, notes, SRS due cards, recall strength, explainable uncovered/at-risk/exposed states, and unmapped-source warnings; the site and Hermes read this same model.
- **Mapping maintenance:** Hermes can explicitly attach completed sources to existing map nodes through `POST /recommendations/map`; ambiguous sources remain unresolved rather than creating speculative branches.
- **Resurfacing:** brings useful knowledge back at the right time without auto-chaining recommendations.
- **NotebookLM grounding:** Hermes uses the dedicated Master Corpus notebook for complete-corpus grounding during explicit recommendation-feedback workflows. Only original source material and Mahmood-authored reflections/feedback enter the corpus; generated translations and Lite Visual companions do not count as his thoughts. Explicit source-specific Studio requests create a fresh per-source notebook, add the link as a Website source, start the artifact without downloading/uploading or waiting, and immediately save the notebook URL on the matching site item.
- **NotebookLM Q&A speed:** the active NotebookLM skill reuses compatible MCP sessions, starts fresh on topic changes or low confidence, and accepts exact 24-hour cache hits only when the latest corpus fingerprint is part of the cache key.

## Visual and UX Direction

The system is **Scholar's Instrument**: neutral, typographic, compact, precise, and calm.

- Desktop uses a collapsible left rail.
- Mobile prioritizes Momentum, Curate, Learn, and More.
- IBM Plex Sans/Arabic is the UI family; IBM Plex Mono is for data; editorial typography is reserved for reading and notes.
- Use neutral surfaces and one muted ink-blue accent. Semantic color is only for status/data.
- Prefer lists, rules, timelines, tables, charts, and meaningful panels.
- Avoid card soup, gradients, glass, metric rings, oversized radii, decorative SaaS dashboards, and page-load choreography.
- Atlas may be immersive; management surfaces stay compact.

`DESIGN.md` is the detailed design contract. `PRODUCT.md` is the concise product contract.

## System Architecture

```text
Preact client ──HTTP──> Hono Worker ──> D1 (canonical structured state)
                              │
                              ├──────> R2 (PDF/HTML/transcript artifacts)
                              │
Hermes explicit workflow <── /agent/jobs ──┘
    │
    ├── learning-notes-extractor
    ├── taste-mapper
    └── Obsidian archive copy (extracted notes only)
```

- Worker entry: `src/index.ts`
- Client entry: `client/src/main.tsx`
- Route registry: `client/src/destinations.ts`
- Shared domain logic: `src/domain.ts`
- D1 bindings/schema: `wrangler.toml`, `schema.sql`, `migrations/`
- API reference: `docs/API.md`
- Architecture reference: `docs/architecture.md`

## Canonical Ownership

| Data | Canonical owner |
|---|---|
| Recommendations, captures, sessions, notes, ratings, SRS, map, settings | D1 |
| PDFs, HTML, transcripts, generated companions | R2 |
| Client preferences/offline mutations | Local storage/IndexedDB until synchronized |
| Extracted-note archive copy | Obsidian |
| Product/API source code | This repository |
| Automated extraction and taste processing | Hermes durable jobs |

Agents operate the product through `GET /agent/capabilities`, `GET /agent/openapi.json`, and authenticated `POST /agent/request` or `/agent/tool-call`. The adapter is allow-listed, reuses normal API validation, supports CRUD/process/job/analytics operations, and audits mutations in `agent_logs`; it never exposes arbitrary SQL or proxying.

Obsidian is not bidirectional storage. Do not make an archive copy overwrite D1.

## Hermes Workflows

### Durable jobs

Hermes handles durable work only inside an explicit Learning Compass workflow. It claims the exact work created by that request, runs the specialist, then completes or fails it using the same stable identity. There is no automatic host poller, and internal job state is not exposed in the site UI. Job keys, leases, retries, and completion writes remain idempotent.

Hermes self-improvement is conversation-driven, never scheduled. After completing each user request, the operating system inspects evidence exposed by that turn and applies the smallest verified profile/map/scoring improvement automatically at confidence ≥0.8, or saves a narrowly scoped, reversible skill-procedure improvement to D1 `hermes_memory` when a skill failure or better path passes replay/test validation at confidence ≥0.9 (or repeats twice). Skill-source edits, prompts, code, tests, schema, runtime, and workflow changes produce reviewable proposals; deployment, destructive deletion, and external publication require separate explicit instruction. Explicit user corrections are authoritative for data-layer learning; weak one-off inferences remain expiring hypotheses. No evidence means no mutation.

Every specialist returns the canonical receipt `intent → target → before → mutation/job → after → evidence → blocker`; endpoint ownership and permissions live in `docs/hermes-contract.json`.

The retained manual runner is `~/.hermes/scripts/taste-map-job.py`. Its User-Agent must remain:

```text
Mozilla/5.0 (compatible; HermesCron/1.0)
```

Cloudflare rejects Python's default User-Agent.

### Lite Visual

“Visual lite” and “lite visual” mean the `lite-visual` skill:

1. Resolve the exact source and previous artifact pair by recommendation ID, canonical URL, then title.
2. Retrieve the complete primary source, figures, tables, appendices, and substantive supplementary material; record any inaccessible scope.
3. Create a checksum-backed evidence packet and coverage matrix mapping every material section, claim, method, result, caveat, and conclusion to the companion.
4. Produce a source-proportional, tablet/print-friendly HTML companion in separate coverage and design passes.
5. Calculate and validate displayed metadata from the finished artifact; run structural, link, responsive, console, and PDF checks before upload.
6. Score HTML source fidelity, learning value, composition, visual intelligence, and source fit; require at least 8/10 with no factual/rendering defect.
7. Upload a new revision pair with explicit revision and superseded-pair metadata; never silently overwrite the previous pair.
8. Re-read both uploaded artifacts, then call `/artifacts/:html_id/process` exactly once; poll the extraction job to completed or failed and verify the canonical source record.
9. Notes Extractor reads the HTML, preserves source anchors, writes the structured site note and 3–5 SRS drafts, then creates the Obsidian archive copy.

The Worker only enqueues `visualise_source` with `custom_prompt_required=true`, `qa_required=true`, `quality_threshold=8`, and expected roles `html`/`pdf`; Hermes owns mining, source-specific prompts, rendering, validation, upload, and completion. Lite Visual HTML uploads require a complete five-dimension 0–2 QA score totaling at least 8 with no defects; linked PDFs require a passed render check.

The HTML and PDF represent one source and must not count as two taste signals.

### Taste intelligence

- `taste-mapper` processes explicit feedback and proposes profile/map updates.
- `taste-rec` recommends only when a new recommendation is explicitly requested.
- Explicit recommendation requests use the Personal Bayesian Cascade: submit 3 candidates first, expand only after Worker abstention up to 8, expose server-scored picks, and wait for explicit Start and feedback. A weak but safe winner is shown as a clearly labeled review pick with its score, confidence, source status, and reason it missed the automatic threshold; it reaches the Queue only if the curator explicitly chooses **Add to Queue anyway**. Normal requests may expose one pick; queue-fill requests may create and explicitly start additional picks until five queued/in-progress items exist. The Worker owns source reachability checks, URL/semantic deduplication, hard exclusions, D1-context scoring, strategy-specific pairwise ranking, calibrated confidence, decision receipts, and predicted-versus-actual outcome learning. `/discovery` and `/ai/suggest` are compatibility/archive paths.
- `taste-enhancer` audits system quality and cross-layer integrity.
- Feedback jobs never call `taste-rec` automatically.
- NotebookLM updates happen only when Hermes is handling explicit feedback on a recommendation; there is no automatic D1 mutation sync.

### Site operations

- `learning-compass-operating-system` is Hermes's single entry point. It classifies every Learning Compass request into a verified procedure, then calls one focused specialist skill. `learning-compass-site-operator` is its live Worker API execution layer: it uses `/agent/capabilities` and `/agent/request`, reads before writes, verifies after writes, and uses the Cloudflare-compatible Hermes User-Agent.
- A reflection sent to Hermes is explicit feedback: preserve it verbatim, resolve the source/session, queue Taste Mapper analysis, create auditable proposals, apply only evidence-qualified profile/map/scoring changes during that conversation, and stop without recommending anything.

## Purposeful Destinations

The route registry is the executable source of truth:

- Momentum: 1
- Curate: 4
- Map: 2
- Learn: 4
- Insights: 3
- Settings: 3

Total: 17. Inbox, Queue, Collections, and Archive live in Curate. Atlas and Coverage live in Map. Files, source-centric Notes, Recall, and Activity live in Learn. Overview, Taste, and Hermes live in Insights. Every destination must support a real user decision or workflow. Related cloud datasets may be combined when that makes the page more useful; infrastructure implementation details stay out of user-facing copy.

## Data and Migrations

Apply in order:

1. `schema.sql`
2. `migrations/0000_brain.sql`
3. `migrations/0001_production_rebuild.sql`
4. `migrations/0002_rss_feeds.sql`
5. `migrations/0003_feedback_review.sql`
6. `migrations/0004_discovery_engine.sql`
7. `migrations/0005_recommendation_notebook_url.sql`
8. `migrations/0006_hermes_upgrade.sql`
9. `migrations/0007_sync_notifications.sql`
10. `migrations/0008_compass_cascade.sql`
11. `migrations/0009_proposal_dedup.sql`
12. `migrations/0010_compass_queue_fill.sql`
13. `migrations/0011_compass_adaptive_learning.sql`

New schema changes require a new numbered idempotent migration. Never hide schema mutation inside cron or request handlers.

## Local Commands

```bash
npm install
npm run dev:worker
npm test
npm run build
npm run test:e2e
```

Deployment:

```bash
npx wrangler deploy --config wrangler.toml
```

Do not use a different Wrangler config or deployment directory.

## Definition of Production Quality

- Every route has purposeful data, loading, empty, and error states.
- No fallback view, console error, `undefined`, or `NaN`.
- Large datasets remain usable.
- Interactions normally respond within 100 ms on local data.
- Base bundle stays ≤150 KB gzip excluding lazy chunks.
- Offline mutations recover cleanly after reconnect.
- Existing data and compatible REST clients remain intact.
- Tests, docs, active Hermes skills, and deployed behavior agree.

Formal security and accessibility audits are outside the current scope, but existing protections and basic semantic/keyboard behavior must not regress.
