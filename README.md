# Learning Compass

Learning Compass is a private, single-user learning system. It collects material from many sources, keeps the active queue small, tracks learning at the original source, turns reflection into structured notes and recall cards, and uses that history to maintain a personal knowledge map.

It is not a replacement for books, articles, videos, or podcasts. Consumption happens at the real source. Learning Compass manages the work around consumption: deciding what matters, remembering where you stopped, processing what you learned, and resurfacing it later.

## The learning loop

```text
capture → curate → consume externally → reflect → extract notes
        → approve recall cards → review → update map → resurface
```

1. **Capture:** URLs, text, PDFs, HTML, videos, Telegram shares, and RSS/Atom entries enter one unlimited Inbox.
2. **Curate:** an item can be archived, excluded, grouped, or promoted to the active Queue. The Queue normally holds no more than five items.
3. **Consume:** opening an item starts or resumes a learning session, then hands off to the original source.
4. **Return:** the user records a five-part reflection and may complete and rate the session in the same action.
5. **Process:** structured notes are stored in D1. Large source files and generated reading companions live in R2.
6. **Review:** ratings from 7–10 automatically queue a separate extracted note and editable recall-card drafts. A draft must be approved before entering spaced repetition.
7. **Learn from history:** ratings, notes, review events, and map coverage inform future resurfacing and taste analysis.

Feedback never requests another recommendation automatically. Finishing one item should close the loop, not create an endless feed.

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

| Data | Source of truth |
|---|---|
| Captures, queue, sessions, notes, ratings, cards, settings, and map | D1 |
| PDFs, HTML, transcripts, and generated companions | R2 |
| Pending offline mutations | IndexedDB until synchronized |
| UI preferences and resumable client state | Local storage |
| Extracted-note archive copies | Obsidian |
| Product and API code | This repository |

Obsidian is an export target, not a second writable database. It must never overwrite D1.

### Why these boundaries exist

| Choice | Reason |
|---|---|
| Unlimited Inbox, five-item Queue | Capture should be frictionless; commitment should be scarce. |
| Consumption at the original source | The system tracks learning without becoming a worse reader for every media format. |
| Editable recall drafts before approval | Generated questions are suggestions until the learner confirms they are accurate and useful. |
| Leased, idempotent background jobs | A crash or retry must not duplicate notes, cards, artifacts, or taste signals. |
| One canonical database | Notes, ratings, map state, and automation cannot safely disagree about which copy is current. |

## Repository map

```text
client/
  src/app/App.tsx             application shell and workspace composition
  src/api.ts                  browser API and offline helpers
  src/app/router.ts           canonical five-root route registry (18 purposeful views)
  src/features/atlas/         lazy-loaded knowledge graph

src/
  index.ts                    Worker entry, middleware, routes, PWA endpoints
  api/                        HTTP route modules
  services/                   capture, RSS, and settings services
  domain.ts                   shared product rules
  lib.ts                      bindings, types, validation, normalization

migrations/                   ordered, idempotent D1 migrations
tests/unit/                   domain and route-contract tests
tests/e2e/                    real Worker + browser acceptance tests
docs/API.md                   active HTTP contracts
docs/architecture.md          concise implementation notes
docs/release-checklist.md     production release procedure
```

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the durable product model, [CURRENT_STATE.md](CURRENT_STATE.md) for verified reality, and [AGENTS.md](AGENTS.md) before making changes.

## Run locally

### Requirements

- Node.js 22
- npm
- A Chromium browser installed through Playwright for E2E
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

### Local secrets

Writes can be protected with `API_TOKEN`. Optional enrichment and delivery integrations use `GOOGLE_API_KEY` and `TELEGRAM_BOT_TOKEN`. Hermes owns live web research; the Worker receives and validates its source-grounded candidates. Put local values in `.dev.vars`, which is ignored by Git:

```dotenv
API_TOKEN="replace-with-a-local-secret"
GOOGLE_API_KEY=""
TELEGRAM_BOT_TOKEN=""
```

Never commit `.dev.vars`, `.env`, private keys, or API tokens.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run the Vite client only |
| `npm run dev:worker` | Apply the base schema and local migrations, build the client, and run the complete Worker locally |
| `npm test` | Run unit tests and TypeScript checks |
| `npm run build` | Create the production client bundle |
| `npm run test:e2e` | Create a fresh temporary D1 database and test all destinations in Chromium |
| `npm run deploy` | Build and deploy with the repository Wrangler config |

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
- an unlimited Inbox;
- a deliberately small Queue;
- external-source handoff;
- resumable Queue handoffs backed by hidden sessions;
- reflection and completion.

The first success criterion is simple: a captured source can become a completed, reflected learning session without losing state.

### Phase 2: make learning durable

Add structured notes, search, ratings, editable recall drafts, approval, and review scheduling. Keep every derived object linked to its source and session.

### Phase 3: add automation

Introduce a durable job table with idempotency keys, leases, retries, and explicit completion. Let workers process notes or artifacts through the same product validation as human actions.

### Phase 4: add the map and insights

Only after enough real history exists, derive knowledge coverage, contradictions, decay, creator trust, and forecasts. Empty analytics are decoration; evidence-backed analytics help decisions.

### Phase 5: harden the edges

Add offline mutation recovery, large-data tests, bilingual direction handling, responsive acceptance tests, service-worker upgrades, and production migration rehearsal.

## Product rules that must remain true

- Every capture enters the unlimited Inbox.
- Queue normally contains at most five queued or in-progress items.
- Consumption happens at the original source.
- Returning with reflection creates one linked structured reflection.
- Every reflection produces confirmation-gated Taste Mapper proposals.
- Ratings of 7–10 automatically create a separate extracted note and editable recall drafts; approval is required before Recall.
- Feedback processing does not request a new recommendation.
- Completed sources can be explicitly attached to existing knowledge-map nodes; ambiguous matches stay unresolved instead of creating speculative branches.
- An abstained Compass Pick with a verified or restricted reachable source can be explicitly added to the Queue anyway; the override bypasses only the automatic threshold, and the five-item Queue cap still applies.
- One Lite Visual source creates one linked HTML/PDF pair and counts as one taste signal.
- D1 remains canonical; R2 stores large artifacts; Obsidian remains an archive export.
- Every registered destination resolves to a purposeful view.

## Deployment

Run the full [release checklist](docs/release-checklist.md), then deploy only from this repository:

```bash
npx wrangler deploy --config wrangler.toml
```

Code deployment and data changes are separate operations. D1 or R2 data-only writes do not require a Worker deployment.

The production Worker, R2 bucket, cache names, protocol name, cron name, and Hermes paths retain legacy identifiers for compatibility even though the product and repository are named Learning Compass.
