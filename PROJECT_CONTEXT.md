# Learning Compass — Project Context

## Purpose

Learning Compass is Mahmood's private learning operating system. It turns scattered sources into a disciplined learning loop:

**capture → curate → consume externally → reflect → extract notes → review → update the knowledge map → resurface**

The product is single-user, English-first, supports bilingual English/Egyptian-Arabic note blocks, and uses the `Africa/Cairo` timezone.

## Product Model

- **RSS Feed:** the Curate destination for subscriptions and triage; its underlying Inbox remains the unlimited landing place for URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom captures. RSS/Atom entries stay grouped in the pinned Archive feed shelf instead of mixing into the manual archive list.
- **Queue:** five active items by default. Consume/drop before adding, or use an explicit override.
- **Queue and hidden sessions:** Queue owns start, resume, return, and completion. Hidden session records preserve source/reflection linkage without a separate management destination.
- **Reflections and notes:** reflections preserve only the user's typed or handwritten input. Notes Extractor writes separate complete bilingual English/Egyptian-Arabic source notes covering the whole source; incomplete legacy notes can be re-run from the site.
- **Feedback proposals:** every reflection/rating produces reviewable Taste Mapper proposals. Profile, pattern, priority, contradiction, and map changes apply only after explicit approval.
- **SRS:** ratings 7–10 automatically queue Notes Extractor and produce 3–5 editable drafts. Only approved drafts become review cards; drafts and active cards can be deleted.
- **Knowledge map:** branches, edges, evidence, contradictions, coverage, health, and taste signals.
- **Resurfacing:** brings useful knowledge back at the right time without auto-chaining recommendations.
- **NotebookLM grounding:** Hermes uses the dedicated Master Corpus notebook for complete-corpus grounding during explicit recommendation-feedback workflows. Only original source material and Mahmood-authored reflections/feedback enter the corpus; generated translations and Lite Visual companions do not count as his thoughts. Explicit source-specific Studio requests create a fresh per-source notebook, add the link as a Website source, start the artifact without downloading/uploading or waiting, and immediately save the notebook URL on the matching site item.
- **NotebookLM Q&A speed:** the active NotebookLM skill keeps a local authenticated browser broker warm, automatically reuses compatible investigation sessions, starts fresh on topic changes or low confidence, and caches exact answers for 24 hours using the latest corpus fingerprint.

## Visual and UX Direction

The system is **Scholar's Instrument**: neutral, typographic, compact, precise, and calm.

- Desktop uses a collapsible left rail.
- Mobile prioritizes Today, Curate, Learn, and More.
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
Hermes cron <── /agent/jobs ──┘
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

Hermes polls `GET /agent/jobs?status=pending`, claims a lease with a stable worker identity, runs the appropriate skill, then heartbeats, completes, or fails the job using that same identity. `GET /agent/jobs/health` exposes queue health. Job keys, leases, retries, and completion writes must remain idempotent.

The local polling script is `~/.hermes/scripts/taste-map-job.py`. Its User-Agent must remain:

```text
Mozilla/5.0 (compatible; HermesCron/1.0)
```

Cloudflare rejects Python's default User-Agent.

### Lite Visual

“Visual lite” and “lite visual” mean the `lite-visual` skill:

1. Capture the source in Learning Compass.
2. Produce a high-quality tablet/print-friendly HTML companion.
3. Produce the matching PDF companion.
4. Upload both to R2 through `/artifacts` with one `pair_id`, roles `html` and `pdf`, and source/recommendation metadata.
5. Call `/artifacts/:html_id/process` once; rerun it only to retry a failed extraction.
6. Notes Extractor reads the HTML, preserves source anchors, writes the structured site note and 3–5 SRS drafts, then creates the Obsidian archive copy.

The HTML and PDF represent one source and must not count as two taste signals.

### Taste intelligence

- `taste-mapper` processes explicit feedback and proposes profile/map updates.
- `taste-rec` recommends only when a new recommendation is explicitly requested.
- Explicit one-item requests use a bounded fast path: one live context preflight, reuse selected runs, parallel research, one complete candidate batch, then immediate selection and activation.
- `taste-enhancer` audits system quality and cross-layer integrity.
- Feedback jobs never call `taste-rec` automatically.
- NotebookLM updates happen only when Hermes is handling explicit feedback on a recommendation; there is no automatic D1 mutation sync.

### Site operations

- `learning-compass-site-operator` is the canonical Hermes control skill for reading, creating, editing, processing, triaging, completing, and removing site data across every destination. It uses `/agent/capabilities` and `/agent/request`, reads before writes, verifies after writes, and uses the Cloudflare-compatible Hermes User-Agent.

## Purposeful Destinations

The route registry is the executable source of truth:

- Today: 1
- Curate: 7
- Map: 4
- Learn: 7
- Insights: 4
- Settings: 5

Total: 28. Queue, Discovery, Inbox, Collections, Resurfacing, Contradictions, and Archive live in Curate. Files, Reflections, extracted Notes, Cards, Review, Changes, and Journal live in Learn. Every destination must support a real user decision or workflow. Related cloud datasets may be combined when that makes the page more useful; infrastructure implementation details stay out of user-facing copy.

## Data and Migrations

Apply in order:

1. `schema.sql`
2. `migrations/0000_brain.sql`
3. `migrations/0001_production_rebuild.sql`
4. `migrations/0002_rss_feeds.sql`
5. `migrations/0003_feedback_review.sql`
6. `migrations/0004_discovery_engine.sql`
7. `migrations/0005_recommendation_notebook_url.sql`

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
