# Taste Map — Project Context

## Purpose

Taste Map is Mahmood's private learning operating system. It turns scattered sources into a disciplined learning loop:

**capture → curate → consume externally → reflect → extract notes → review → update the knowledge map → resurface**

The product is single-user, English-first, supports bilingual English/Egyptian-Arabic note blocks, and uses the `Africa/Cairo` timezone.

## Product Model

- **RSS Feed:** the Curate destination for subscriptions and triage; its underlying Inbox remains the unlimited landing place for URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom captures. RSS/Atom entries stay grouped in the pinned Archive feed shelf instead of mixing into the manual archive list.
- **Queue:** five active items by default. Consume/drop before adding, or use an explicit override.
- **Sessions:** track the handoff to the real external source, progress, return, and completion. Returning with a reflection creates one linked five-section reflection note; `complete:true` closes the session in the same request.
- **Reflections and notes:** drafts save freely; explicit Finish and Process commits feedback.
- **SRS:** ratings 8–10 produce 3–5 editable drafts. Only approved drafts become review cards.
- **Knowledge map:** branches, edges, evidence, contradictions, coverage, health, and taste signals.
- **Resurfacing:** brings useful knowledge back at the right time without auto-chaining recommendations.

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

Hermes polls `GET /agent/jobs?status=pending`, claims a lease, runs the appropriate skill, then completes or fails the job. Job keys, leases, retries, and completion writes must remain idempotent.

The local polling script is `~/.hermes/scripts/taste-map-job.py`. Its User-Agent must remain:

```text
Mozilla/5.0 (compatible; HermesCron/1.0)
```

Cloudflare rejects Python's default User-Agent.

### Lite Visual

“Visual lite” and “lite visual” mean the `lite-visual` skill:

1. Capture the source in Taste Map.
2. Produce a high-quality tablet/print-friendly HTML companion.
3. Produce the matching PDF companion.
4. Upload both to R2 through `/artifacts` with one `pair_id`, roles `html` and `pdf`, and source/recommendation metadata.
5. Call `/artifacts/:html_id/process` once; rerun it only to retry a failed extraction.
6. Notes Extractor reads the HTML, preserves source anchors, writes the structured site note and 3–5 SRS drafts, then creates the Obsidian archive copy.

The HTML and PDF represent one source and must not count as two taste signals.

### Taste intelligence

- `taste-mapper` processes explicit feedback and proposes profile/map updates.
- `taste-rec` recommends only when a new recommendation is explicitly requested.
- `taste-enhancer` audits system quality and cross-layer integrity.
- Feedback jobs never call `taste-rec` automatically.

## Purposeful Destinations

The route registry is the executable source of truth:

- Today: 1
- Curate: 6
- Map: 4
- Learn: 5
- Vault: 3
- Insights: 4
- Settings: 5

Total: 28. Every destination must support a real user decision or workflow. Related cloud datasets may be combined when that makes the page more useful; infrastructure implementation details stay out of user-facing copy.

## Data and Migrations

Apply in order:

1. `schema.sql`
2. `migrations/0000_brain.sql`
3. `migrations/0001_production_rebuild.sql`
4. `migrations/0002_rss_feeds.sql`

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
