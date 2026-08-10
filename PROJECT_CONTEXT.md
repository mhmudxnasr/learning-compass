# Learning Compass — Project Context

## Purpose

Learning Compass is Mahmood's private learning operating system. It turns scattered sources into a disciplined learning loop:

**define a Learning Thread → capture/curate sources → consume externally → reflect → consolidate anchored Learning Units → retrieve/apply → verify evidence → resurface**

The product is single-user, English-first, supports bilingual English/Egyptian-Arabic note blocks, and uses the `Africa/Cairo` timezone.

## Product Model

- **Learning Threads:** the purpose-first object for one question, decision, build, or capability. A Thread stores why it matters now, its definition of done, evidence requirements, source roles, final synthesis, and verified state. Sources remain reusable inputs; they are never treated as proof of learning by themselves.
- **Learning Units:** atomic claims, concepts, methods, examples, questions, applications, and counterclaims with exact source anchors, user synthesis, stance, confidence, and typed relations. Notes are readable projections; Atlas remains the navigation taxonomy.
- **Verified mastery:** taste rating is separate from `retain`, `apply`, `reference`, or `drop`. Mastery is derived only from retrieval, explanation, transfer, decision, artifact, or application evidence.
- **Recall scheduling:** approved cards use reference FSRS-6 through the official `ts-fsrs` implementation with persisted, versioned card state. Failed reviews never advance mastery.
- **Consolidation:** explicit completion creates a durable run with visible terminal state: closed, repair required, or waived. Hermes processes the exact work during the active Learning Compass workflow; there is no learning-core poller, timer, or scheduled self-improvement.

- **Inbox:** the Curate destination for subscriptions, captures, books, and triage; it remains the unlimited landing place for URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom captures. RSS/Atom entries stay grouped in the pinned Archive feed shelf instead of mixing into the manual archive list. Manual **Check now** imports at most five latest entries per feed.
- **Queue:** five active queued/in-progress items by default. Each item can carry a compact source-grounded `context_brief`. Compass is Thread-first and researches fit, bridge, and challenge lanes. Shadow mode stores v1 and v2 decisions; v2 serves only after 20 global learning-value outcomes, eight per lane, ten shadow decisions, and zero invalid-evidence winners. Explicit starts enforce the cap. Completion moves a source to completed; bad fit/abandonment excludes it; `not_now` is neutral and returns it to Inbox.
- **Queue and hidden sessions:** Queue owns start, resume, return, and completion. Hidden session records preserve source/reflection linkage without a separate management destination.
- **Source notes:** the Notes library shows only structured Notes Extractor source notes (Foundation → Case Studies → Exploitation → Defense) read in a dedicated typographic reader with section navigation and in-place editing. Each note keeps one explicit Source context hop back to the full source record, which presents the user's exact typed or handwritten feedback before the extracted note; incomplete legacy notes can be re-run from the site.
- **Recommendation learning:** immutable events separate administrative exclusion, neutral dismissal, explicit fit rejection, rating, learning disposition, completion, and later evidence. `learning_value_v2` combines available rating (25%), explicit disposition (25%), and strongest retrieval/transfer/application evidence (50%); missing components are not treated as zero. Adaptation is frozen below the global/lane evidence gates.
- **Profile and self-update:** the adaptive profile is typed, editable, versioned, and reversible. Hermes auto-applies a normal assertion at confidence ≥0.8 with a direct user statement or two evidence items; replacing an explicit user assertion requires direct contradiction or confidence ≥0.95 with three evidence items. Every applied/no-change/system attempt records a conversation-bound receipt. Narrow reversible skill, prompt, code, additive-schema, and workflow improvements may apply at confidence ≥0.9 after replay/tests and full verification; Hermes delegates repository edits to Codex and may deploy only with rollback state, the full release gate, and observed live smoke. No scheduled/background improvement exists. Destructive deletion and external publication remain explicit-only.
- **SRS:** explicit retain/apply completion queues Notes Extractor and editable drafts. Only approved drafts become FSRS review cards; legacy clients retain the old 7+ bridge.
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

Hermes self-improvement is conversation-driven, never scheduled. After the primary request is verified, every specialist emits a compact evolution handoff or `no_change`; `learning-compass-self-evolution` is the single owner that deduplicates evidence, applies thresholds, maintains the skill graph, and records applied, failed/resumable, or evidence-backed no-change receipts. Explicit user assertions remain editable but receive stronger supersession protection. At confidence ≥0.9, or after the same issue repeats twice, the owner may update skills, prompts, code, tests, additive migrations, and workflows after replay and the complete relevant verification suite. Repository edits are delegated to Codex; release changes may deploy only after the full release gate, rollback capture, and live smoke are observed. Every evaluated attempt writes a `self_improvement_runs` receipt plus linked provenance; no candidate creates no database churn. Destructive deletion and external publication remain explicit-only.

Hermes's compact routing soul is `docs/learning-compass-hermes-soul.md`, mirrored into `~/.hermes/SOUL.md` and loaded as the primary identity on new sessions. It tells Hermes which layer owns each intent, when to read live Worker state, how to execute mutations, and where self-evolution ends; detailed product facts remain in this context and the active skills.

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
5. Calculate displayed metadata from the finished artifact and render a real tablet/print PDF before upload.
6. No Lite Visual QA score or release gate is required; source mining, Visual Mind asset provenance, and artifact linkage remain the operational checks.
7. Upload a new revision pair with explicit revision and superseded-pair metadata; never silently overwrite the previous pair.
8. Re-read both uploaded artifacts and verify the canonical source record.
9. Do not call Notes Extractor automatically; it remains an explicit/manual workflow.

The Worker only enqueues `visualise_source` with `custom_prompt_required=true` and expected roles `html`/`pdf`; Hermes owns cached mining, Visual Mind planning, source-specific prompting, rendering, upload, and completion. Lite Visual HTML/PDF uploads have no QA score or release gate. Book jobs require one stable HTML/PDF pair per chapter; Notes Extractor is never auto-queued by Lite Visual.

Books use Lite Visual Book Mode from the Books shelf: complete chapter/file mining, B2 explanations, first-page TOC, source-proportional pagination, and an approximately 6cm print annotation margin. The book API exposes each chapter's HTML/PDF pair, extraction state, and finished state, while visualise requests remain idempotent Hermes jobs. The Books page UI expands/collapses chapters on book title click, showing each chapter with number badge, title, status, file links (HTML/PDF/NBLM), upload buttons for missing files, and Finish/Undo toggle. Chapter file uploads use the existing `POST /artifacts` endpoint with chapter metadata.

The HTML and PDF represent one source and must not count as two taste signals.

### Taste intelligence

- `taste-mapper` processes explicit feedback and proposes profile/map updates.
- `taste-rec` recommends only when a new recommendation is explicitly requested.
- Legacy Discovery interview heuristics are staged as reviewable `skill_revisions`; the Worker never writes local skill files. `learning-compass-self-evolution` may incorporate a staged patch only after current-conversation evidence, replay, and skill validation.
- Explicit recommendation requests use the Personal Bayesian Cascade: submit 3 candidates first, expand only after Worker abstention up to 8, expose server-scored picks, and wait for explicit Start and feedback. A weak but safe winner is shown as a clearly labeled review pick with its score, confidence, source status, and reason it missed the automatic threshold; it reaches the Queue only if the curator explicitly chooses **Add to Queue anyway**. Normal requests expose one pick. Explicit Queue-fill requests may continue bounded waves and explicitly start only Worker-returned `ready` picks until five queued/in-progress items exist; withheld weak picks never bypass their separate exact override. The Worker owns source reachability checks, URL/semantic deduplication, hard exclusions, D1-context scoring, strategy-specific pairwise ranking, calibrated confidence, decision receipts, and predicted-versus-actual outcome learning. `/discovery` and `/ai/suggest` are compatibility/archive paths.
- `learning-compass-self-evolution` owns explicit deep audits, evaluator/repair/recalibration/rollout decisions, skill health, and the one end-of-turn evolution pass.
- Feedback jobs never call `taste-rec` automatically.
- NotebookLM updates happen only when Hermes is handling explicit feedback on a recommendation; there is no automatic D1 mutation sync.

### Site operations

- `learning-compass-operating-system` is Hermes's single entry point. It classifies every Learning Compass request into a verified procedure, then calls one focused specialist skill. `learning-compass-site-operator` is its live Worker API execution layer: it uses `/agent/capabilities` and `/agent/request`, reads before writes, verifies after writes, and uses the Cloudflare-compatible Hermes User-Agent.
- A reflection sent to Hermes is explicit feedback: preserve it verbatim, resolve the source/session, queue Taste Mapper analysis, create auditable proposals, apply only evidence-qualified profile/map/scoring changes during that conversation, and stop without recommending anything.
- Every feedback analysis reads the complete archived feedback context plus the current profile and knowledge-map nodes through `GET /feedback/context`, so repeated signals can improve proposals without rewriting the user's original feedback.

## Purposeful Destinations

The route registry is the executable source of truth:

- Momentum: 1
- Curate: 5
- Map: 2
- Learn: 4
- Insights: 3
- Settings: 4

Total: 19 purposeful views remain available, but the primary rail follows the loop: Momentum → Inbox → Queue → Notes → Recall → Atlas. Settings → System exposes the complete API capability catalog, schedules, runtime services, storage, health, and safety boundaries without promoting infrastructure into the daily learning loop.

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
14. `migrations/0012_context_brief.sql`
15. `migrations/0013_book_visual_chapters.sql`
16. `migrations/0014_canonical_activity_ledger.sql`
17. `migrations/0015_outcome_learning_integrity.sql`
18. `migrations/0016_learning_integrity.sql`
19. `migrations/0017_consolidation_workflows.sql`
20. `migrations/0018_learning_threads.sql`
21. `migrations/0019_learning_units.sql`
22. `migrations/0020_mastery_evidence.sql`
23. `migrations/0021_learning_outcomes_v2.sql`
24. `migrations/0022_fsrs_and_thread_backfill.sql`
25. `migrations/0023_intelligence_v2.sql`

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
