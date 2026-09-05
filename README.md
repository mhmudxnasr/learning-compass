# Learning Compass

Threads is the main study workspace: plan a question, author its Levels and lessons, continue the exact next lesson, organize source material, and keep a notebook and optional synthesis. Its study desk preserves search and sorting, exposes priority and material gaps, and gives lessons a searchable curriculum navigator and focus mode. New Threads begin in Planning; creation does not generate a curriculum automatically.

Learning Compass is a private, single-user learning system. It collects material from many sources, keeps the active queue small, tracks learning at the original source, and keeps a correctable personal ledger of books, movies, series, podcasts, courses, games, albums, ratings, and progress. Reflection can become structured notes, and that history maintains a personal knowledge map.

Consumption normally happens at the real source. A verified Lite Visual companion is the deliberate exception: it is an Arabic complete-source substitute whose semantic HTML article is canonical and whose linked A4 PDF is printed from that exact file. Learning Compass manages deciding what matters, remembering where you stopped, processing what you learned, and resurfacing it later.

## The learning loop

```text
capture → curate → consume externally → reflect → extract notes
        → approve recall cards → review → update map → resurface
```

1. **Capture:** Global Add anything turns URLs, text, PDFs, HTML, videos, Telegram shares, and RSS/Atom entries into ordinary source records, or logs typed personal media with its own status and progress outside Queue.
2. **Commit:** an item can be archived, excluded, or promoted to the active Queue. The Queue normally holds no more than five items.
3. **Consume:** opening an item starts or resumes a learning session, then hands off to the original source.
4. **Return:** the user records a five-part reflection and may complete and rate the session in the same action.
5. **Process:** structured notes are stored in D1. Large source files and generated reading companions live in R2.
6. **Review:** explicit `retain`/`apply` may create a separate source-shaped note and anchored Learning Units. Automated flash-card generation is disabled; every new recall card requires an explicit learner-authored Arabic question and answer. Repeatedly lapsed or paused cards remain repairable through wording-preserving, semantic-reset, pause/retire/restore, and explicit schedule-reset actions without deleting review history.
7. **Learn from history:** ratings, notes, review events, and map coverage inform future resurfacing and taste analysis.

Feedback never requests another recommendation automatically. Finishing one item should close the loop, not create an endless feed.

Saved item titles open dedicated pages with Files, Notes & passages, Recall, Connections, History, and Reflection sections. Books also retain their chapter view. Each section is bookmarkable, and notes/cards/files link back to their owning item's material. File details use an exact metadata lookup so book, Thread, and older files remain addressable independently of the general Files list. Opening an item is passive. The service-worker version changes with every application release so installed clients receive the complete item-page workflow.

## System shape

```text
Vite + Preact client
        │ HTTP
        ▼
Hono Cloudflare Worker
        ├── D1: canonical application state
        ├── R2: PDFs, HTML, transcripts, and generated companions
        └── Assets: compiled client
                 ▲
                 │ leased jobs
              Hermes
        ├── notes extraction
        ├── taste processing
        └── Obsidian archive export
```

The browser uses hash routes, so the Worker serves one application shell. The Worker owns validation and domain rules; the client does not bypass them. Hermes receives allow-listed, idempotent jobs instead of direct database access.

### Data ownership

| Data                                                                                        | Source of truth                                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Captures, typed personal library, queue, sessions, notes, ratings, cards, settings, and map | D1                                                                                                                  |
| PDFs, HTML, transcripts, and generated companions                                           | R2                                                                                                                  |
| Pending offline mutations                                                                   | IndexedDB until synchronized                                                                                        |
| Explicit offline-pack manifests and cached verified companion pairs                         | Browser Cache Storage, versioned per source/book/Thread/Level pack                                                  |
| UI preferences and resumable client state                                                   | Local storage                                                                                                       |
| Extracted-note archive copies                                                               | Obsidian                                                                                                            |
| KOReader/Hardcover books and reading-journal mirror                                         | Hardcover externally; mirrored in D1, displayed read-only in Books, and imported only through the branch-gated path |
| Product and API code                                                                        | This repository                                                                                                     |

Obsidian is an export target, not a second writable database. It must never overwrite D1.

Settings → Data & recovery starts with the Personal Data Studio: real counts and distributions, complete search/type/status filtering, inline editing of every useful personal field, and portable JSON/Markdown exports. Its Personal Assistant accepts ordinary Egyptian-Arabic or English notes about what was watched, read, heard, studied, or played, turns them into a reviewable preview, and can ask short follow-up questions to learn taste and interests. It never writes without explicit confirmation. The page also exposes an explicit Hardcover sync/import flow: the server-only token refreshes a mirrored reading library, My Books displays that mirror without importing it, and each actual import still requires a verified branch before books enter the typed personal ledger. The same page exposes five named data-trust contracts over D1: source identity, verified branch coverage, canonical uniqueness, learning-event lineage, and RSS default-branch validity. Both areas show exact counts rather than inventing a generic engagement or AI-quality score. RSS subscriptions require one reviewed branch; newly created source records inherit it in the same capture path, while a deduplicated source keeps its existing reviewed mapping and the import receipt reports the conflict.

### Why these boundaries exist

| Choice                                                | Reason                                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Source records in Library, five-item Queue            | Saving should be frictionless; commitment should be scarce.                                                                               |
| Personal-media state beside canonical source identity | Watch/read history can inform direct preferences without pretending that every item is a queued lesson or a second disconnected database. |
| Consumption at the original source                    | The system tracks learning without becoming a worse reader for every media format.                                                        |
| Learner-authored Arabic recall cards                  | Flash cards are never generated automatically; the learner creates each question and answer explicitly.                                   |
| Exact source anchors before derived learning objects  | A saved quote and locator are durable evidence; notes, Units, and recall cards still require separate explicit learner actions.           |
| Advisory source health                                | A failed automated check warns and preserves history; it never silently rewrites the Original URL.                                        |
| Leased, idempotent background jobs                    | A crash or retry must not duplicate notes, cards, artifacts, or taste signals.                                                            |
| One canonical database                                | Notes, ratings, map state, and automation cannot safely disagree about which copy is current.                                             |

## Repository map

```text
client/
  index.html                  Vite HTML entry; loads src/app/entry.tsx
  src/app/App.tsx             application shell and workspace composition
  src/api.ts                  browser API and offline helpers
  src/app/router.ts           canonical five-destination registry (12 grouped modes + focus filters)
  src/features/atlas/         lazy-loaded knowledge graph
  src/styles/                 ordered, workspace-oriented CSS modules
  src/workspaces/learn/       Thread, lesson, material, and recall views

src/
  index.ts                    Worker entry, middleware, routes, PWA endpoints
  api/                        HTTP route modules
  services/                   reusable product and storage workflows
  domain.ts                   shared product rules
  lib.ts                      bindings, types, validation, normalization

migrations/                   ordered, idempotent D1 migrations
browser-extension/            optional Manifest V3 capture client
scripts/                      release, recovery, migration, and analysis tools
tests/unit/                   domain and route-contract tests
tests/integration/            isolated Worker and D1 workflow tests
tests/e2e/                    real Worker + browser acceptance tests
docs/API.md                   active HTTP contracts
docs/architecture.md          component boundaries and request/data flows
docs/dependencies.md          dependency ownership and upgrade policy
docs/hermes-production.md     Hermes manager operations, SLOs, recovery, and release gate
docs/release-checklist.md     production release procedure
AGENTS.md                     coding and AI-maintenance contract
CHANGELOG.md                  user-visible, architecture, and dependency history
```

Start with [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the durable product model, [docs/architecture.md](docs/architecture.md) for ownership boundaries, and [CURRENT_STATE.md](CURRENT_STATE.md) for verified operational reality. Read [AGENTS.md](AGENTS.md) before changing code and record material changes in [CHANGELOG.md](CHANGELOG.md).

## Run locally

### Requirements

- Node.js 22
- npm
- A Chromium browser installed through Playwright for E2E and Hermes Lite Visual PDF rendering
- A Cloudflare account only when applying remote migrations or deploying

### Install

```bash
git clone https://github.com/mhmudxnasr/learning-compass.git
cd learning-compass
npm ci
npx playwright install --with-deps chromium
```

### Create the local database

Apply the base schema first, then the numbered migrations:

```bash
npx wrangler d1 execute recommendations-db \
  --local \
  --config wrangler.toml \
  --file schema.sql

npx wrangler d1 migrations apply recommendations-db \
  --local \
  --config wrangler.toml
```

Start the Worker and compiled client:

```bash
npm run dev:worker
```

Open `http://127.0.0.1:8787`.

### Install on Android

Open the production site in Chrome on Android and choose **Install app**, either from the in-product install card or Chrome's menu. The installed app launches in its own window, accepts shared links through Android's share sheet, exposes Capture/Queue/Recall launcher shortcuts, keeps the application shell available offline, respects display cutouts and system safe areas, and continues queued writes after connectivity returns. When Android sends a URL with prose, Learning Compass asks whether the prose is merely a description for whole-source Capture or an exact selected passage; that choice and the unfinished share survive closing the app. Exact selected passages are capped at 10,000 characters end to end and are rejected with a visible explanation rather than silently shortened.

HTML reading companions are still cached opportunistically after a successful online open. For deliberate offline study, use **Keep offline** on a Queue/source, book chapter, whole book, current Thread, or current Level. Each versioned pack downloads only a complete ready, validation-passed HTML+PDF pair with matching pair identity plus a compact revisioned snapshot of the owning source, book, or Thread path. The service worker checks the pair ID, artifact role, publication state, and validation state returned by the Worker during the actual download, then reports the measured size and whether the pack is ready, incomplete/evicted, superseded, storage-full, or failed. Refresh replaces an old pack only after the new one is complete; a stale or failed download preserves the prior ready pack. Remove deletes that pack. Original source and NotebookLM links remain online-only.

The web app is the canonical Android experience. A Play Store package should use a Trusted Web Activity over this same PWA plus verified Digital Asset Links; do not fork the product into a separate WebView client.

### Integration secrets

Learning Compass itself does not require an API token or browser unlock step. Reads and writes are available directly at the Worker URL. Telegram and optional external-provider integrations still use their own dedicated secrets.

Optional enrichment and delivery integrations use `GOOGLE_API_KEY` and `TELEGRAM_BOT_TOKEN`. Hermes owns live web research; the Worker receives and validates its source-grounded candidates. Put local values in `.dev.vars`, which is ignored by Git:

```dotenv
GOOGLE_API_KEY=""
TELEGRAM_BOT_TOKEN=""
```

Never commit `.dev.vars`, `.env`, private keys, or API tokens.

The checked-in development commands retain their loopback-only write-rate-limit bypass for local test speed. Never configure that bypass in production.

## Commands

| Command                     | Purpose                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Run the Vite client only                                                                                                      |
| `npm run dev:worker`        | Apply the base schema and local migrations, build the client, and run the complete Worker locally                             |
| `npm run quality`           | Run ESLint, dead-code and dependency analysis, and formatting checks                                                          |
| `npm test`                  | Run all unit tests and TypeScript checks                                                                                      |
| `npm run test:integration`  | Run the standalone Worker and D1 integration scenarios sequentially                                                           |
| `npm run build`             | Create the production client bundle                                                                                           |
| `npm run test:e2e`          | Create a fresh temporary D1 database and test all root destinations, grouped modes, and responsive shell behavior in Chromium |
| `npm run verify:release`    | Run the local release gate, including repository and installed Hermes contracts; it does not deploy                           |
| `npm run verify:manager`    | Run preserved manager fixtures against native Hermes and require a complete passing test report                               |
| `npm run backup:production` | Export remote D1 and every canonical R2 object, verify checksums, and rehearse a local restore before release                 |
| `npm run deploy`            | Run the guarded release script and deploy with the repository Wrangler config                                                 |

The E2E runner owns its temporary database, Wrangler process, browser, and cleanup. A local test pass therefore does not depend on an old `.wrangler` database.

## Adding a feature

A feature is complete when its data, API, UI, tests, and documentation describe the same behavior.

### 1. Start with the user decision

Write one sentence answering: **What can the user decide or complete after this change?**

Do not add a destination merely to expose a table, job, storage bucket, or internal status. If an existing page can support the decision clearly, extend it instead.

### 2. Put the rule in the correct layer

- Reusable validation and workflow rules belong in `src/domain.ts` or `src/services/`.
- HTTP parsing and response shaping belong in `src/api/`.
- UI state and presentation belong in `client/`.
- Durable structured state belongs in D1.
- Dynamic requests must pass the UTC-day free-tier circuit breaker: 4,000,000 estimated rows read and 70,000 estimated rows written. Inspect `/health/free-tier-budget`; never bypass the guard during normal operation.
- Large binary or generated files belong in R2.
- Slow automated processing belongs in a leased Hermes job.

The client should call the same validated API used by agents and automation.

### 3. Change storage safely

For a D1 change:

1. Add the next numbered migration under `migrations/`.
2. Make it idempotent.
3. Preserve existing rows and REST compatibility.
4. Update schema documentation and affected tests.
5. Rehearse the full sequence on a clean local database.

Never mutate schema from a request handler or scheduled job.

### 4. Add or change the API

Mount route modules from `src/index.ts`. Keep errors safe for clients, validate writes, and make retried automation idempotent. When a contract changes, update:

- `docs/API.md`
- relevant unit tests
- affected client calls
- affected Hermes skills or job payloads

Agent access must remain allow-listed through `/agent/capabilities`, `/agent/openapi.json`, `/agent/request`, or `/agent/tool-call`. Do not expose arbitrary SQL or arbitrary proxy routes.

### 5. Add or change a destination

`client/src/app/router.ts` is the route source of truth for the Botanical Folio five-root shell. Every registered view needs:

- a real purpose;
- loading, empty, populated, and error states;
- a stable endpoint contract;
- mobile behavior;
- an E2E assertion.

Keep graph and analytics libraries lazy-loaded. The base client bundle must remain at or below 150 KB gzip, excluding lazy graph/vendor chunks.

### 6. Verify the full change

```bash
npm run quality
npm test
npm run build
npm run test:e2e
git diff --check
```

Use the narrower checks while iterating, but run the full set before release. Do not claim a migration, test, synchronization, or deployment succeeded without observing it.

### Example: adding source highlights

A clean implementation would look like this:

1. Add a `highlights` table in a numbered migration.
2. Add validation and normalization in `src/domain.ts`.
3. Add `GET/POST/PUT/DELETE /highlights` in `src/api/highlights.ts`.
4. Mount the route in `src/index.ts`.
5. Add client methods in `client/src/api.ts`.
6. Place highlights inside the canonical Learn → Notes source record unless they justify a distinct user decision.
7. Add unit tests for validation and API shape.
8. Extend E2E to cover creating, editing, reloading, and deleting a highlight.
9. Update `docs/API.md` and `CURRENT_STATE.md`.

That sequence is more important than the example itself: one canonical write path, one clear owner for each kind of data, and verification at every boundary.

## Building a similar system from scratch

Do not start with analytics, AI recommendations, or a knowledge graph. First prove that the basic learning loop is useful.

### Phase 1: close one loop

Build only:

- universal capture;
- durable captured-source storage without a dedicated Catalog surface;
- a deliberately small Queue;
- external-source handoff;
- resumable Queue handoffs backed by hidden sessions;
- reflection and completion.

The first success criterion is simple: a captured source can become a completed, reflected learning session without losing state.

### Phase 2: make learning durable

Add structured notes, search, ratings, learner-authored recall cards, and review scheduling. Keep every derived object linked to its source and session.

### Phase 3: add automation

Introduce a durable job table with idempotency keys, leases, retries, and explicit completion. Let workers process notes or artifacts through the same product validation as human actions.

### Phase 4: add the map and insights

Only after enough real history exists, derive knowledge coverage, contradictions, decay, creator trust, and forecasts. Empty analytics are decoration; evidence-backed analytics help decisions.

### Phase 5: harden the edges

Add offline mutation recovery, large-data tests, bilingual direction handling, responsive acceptance tests, service-worker upgrades, and production migration rehearsal.

## Product rules that must remain true

- Every capture becomes a `captured` Library record; Queue is a separate explicit commitment.
- Queue normally contains at most five queued or in-progress items.
- Consumption happens at the original source or a verified canonical Lite Visual companion.
- Returning with reflection creates one linked structured reflection.
- Every reflection produces confirmation-gated Taste Mapper proposals.
- Explicit retain/apply consolidation creates one source-proportional synthesis and anchored Learning Units but never flash cards. New recall cards require an explicit learner-authored Arabic question and answer.
- A source anchor stores the exact passage, surrounding context, typed locator, checksum, source, branch, and optional Thread. Saving or editing it never creates a note, Learning Unit, or recall card; each derivation is a separate explicit action with validated provenance. A checksum-changing evidence edit creates a new active revision and archives the prior row, so existing derivations retain their exact historical anchor.
- Recall repair is revisioned and non-destructive: wording changes preserve FSRS state, semantic changes reset scheduling, pause/retire/restore remain reversible, and review history is retained. Manual split creates one learner-authored card at a time without mutating the original.
- Offline packs include only same-pair, ready, validation-passed HTML+PDF companions and same-origin canonical metadata. Original sources and NotebookLM are never copied into the pack.
- Source health is advisory. Scheduled checks are bounded to Queue, the active lesson, and the Current Book; restricted/unknown responses are not dead-link verdicts, and replacing an Original URL requires a separately verified candidate plus an explicit replacement action with preserved lineage.
- Thread Resources searches existing branch-owned Library sources before web research and edits exact Level/Lesson role, contribution, and order. **Find material** is explicit-only and may return one reviewable exact-lesson Compass pick or abstain; it never attaches, queues, starts, or advances anything.
- Feedback processing does not request a new recommendation.
- Completed sources can be explicitly attached to existing knowledge-map nodes; ambiguous matches stay unresolved instead of creating speculative branches.
- An abstained Compass Pick with a verified or restricted reachable source can be explicitly added to the Queue anyway; the override bypasses only the automatic threshold, and the five-item Queue cap still applies.
- One Lite Visual source creates one atomic Arabic HTML/PDF pair and counts as one taste signal. Acquire the complete source with `extract_source.py` and preserve its hash-bound receipt, caption-first routing, and cache. Teach directly in source-specific semantic HTML and print that exact file. The default `lite-visual-integrity/v1` receipt records identity and file integrity only, with quality checks not run. No required 120-word paperwork, editorial review forms, forced source appendix, or exhaustive artifact audit. Templates, raster assets, image agents, scripts, and widgets remain outside the code-only reading format.

```bash
python3 /home/mahmud/.hermes/skills/lite-visual/scripts/extract_source.py '<URL-or-file>' \
  --output /abs/work/source.txt \
  --manifest /abs/work/source-extraction.json
```

- Lite Visual integrity receipts and historical v6 validation receipts are HMAC-attested. Replacement corpora retain ordered targets, immutable workflow runs, R2-verified staged pairs, lease-free awaiting jobs, and guarded all-target activation. Their identity/hash audit must truthfully describe its scope. Abort and rollback preserve exact lineage and prior visibility.
- D1 remains canonical; R2 stores large artifacts; Obsidian remains an archive export.
- Every registered destination resolves to a purposeful view.

## Deployment

Hermes Lite Visual runs locally from its native skill. Read its Arabic teaching/design guides, write the complete canonical article, and run `scripts/run_workflow.py finish` to render and seal local HTML/PDF. Mandatory editorial passes, fine-scope review forms, forced source duplication, and exhaustive artifact quality checks are removed. The new signed `lite-visual-integrity/v1` receipt explicitly says quality checks were not run. `publish` requires the updated Worker `/artifacts/pair-contract`, then retains atomic publication and exact readback. Historical v6 pairs remain compatible. No source is regenerated by installing this update.

Run `npm run verify:release` and the full [release checklist](docs/release-checklist.md), then deploy only from this repository. Application-only deployments require a fresh complete D1-plus-R2 backup with verified restore, healthy readiness, exact migration parity, and no corpus mutation. Corpus operations remain a separate explicit workflow with exact immutable targets, signed integrity bindings or historical audit evidence, R2 verification, and guarded atomic activation. Direct integrity receipts do not claim quality validation. Migrations through `0077` are applied in production and at exact repository parity; never replay them.

```bash
npx wrangler deploy --config wrangler.toml
```

Code deployment and data changes are separate operations. D1 or R2 data-only writes do not require a Worker deployment.

Deployment IDs, recovery snapshots, and the active PWA shell revision change independently of the architecture. Record and verify them in [CURRENT_STATE.md](CURRENT_STATE.md) during each release. [The release snapshot](docs/release-snapshot.json) records the observed source commit, deployed version, migration parity, health, recovery receipt, and budget policy at its timestamp.

The production Worker, R2 bucket, cache names, protocol name, cron name, and Hermes paths retain legacy identifiers for compatibility even though the product and repository are named Learning Compass.
