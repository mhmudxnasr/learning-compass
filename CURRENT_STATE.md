# Learning Compass — Current State

## Current truth — 2026-08-15 (book chapter metadata)

Books can now register chapter metadata without uploading files. `POST /recommendations/books/:id/chapters` creates or updates book-scoped chapter rows only; it reports `artifacts_created: 0`. When a chapter PDF is explicitly uploaded with `scope=book`, it is shown only in the owning Books chapter row and excluded from the general Files library.

## Current truth — 2026-08-15 (permanent source deletion)

Archive, All sources, and Books now expose a guarded **Delete permanently** action for non-active records. It requires confirmation, removes the recommendation and linked feedback, sessions, notes, recall, learning history, branch evidence, jobs, and generated R2 artifacts, and cannot be undone. The API contract is `DELETE /recommendations/:id/permanent`; active records remain protected until archived, and the existing archive/delete flow remains reversible/soft-delete behavior.

## Current truth — 2026-08-15

The visual-system JSON contract is now applied globally and documented in the UI: imported/saved partial custom font objects are normalized, server settings hydrate on every route at startup, the active day/night palette pair rehydrates after reload, headings use the display stack, Arabic-capable fallbacks are explicit, and local-only Berkeley Mono is never sent to Google Fonts without a web-safe fallback. The visible palette textarea now accepts either the original 11 color codes or a complete visual-system JSON, so pasted `appearance.customFont` and `appearance.typography` values are applied instead of being silently ignored. The Preferences UI explicitly explains the full scope; import/export actions and the AI prompt use the same contract. Preference jump links now scroll the nested workspace canvas without replacing the application route. Surprise me now selects a randomized extreme art direction per request, including monochrome, high-chroma, brutalist, Swiss, editorial, astronomical, and other palette families, while using famous web/design traditions only as inspiration rather than copying exact branding. Verified with 93 unit tests, typecheck, production build, browser JSON-paste test, cross-route Home font test, and live health check; deployed as Worker version `955f008a-fa29-4c2a-9932-aed4543a349b`.

Queue now defaults to a compact Gallery view that shows all active commitments as equal-weight tiles, with the existing ranked Ledger view retained as a selectable alternative. The preference persists locally per browser. Both views share the existing branch, round, note, recall, companion, Record, and tracked Start/Resume behavior.

The product is now **branch-centric**: branches (with evidence-based R1/R2/R3 progression rounds) are the organizing axis across the backend, the UI, and the Hermes layer.

- **Systems-thinking alignment (live, 2026-08-15)**: the `systems-thinking` branch now contains seven visible active child nodes matching its Learning Thread levels, while branch metadata mirrors the senior review: one recurring anchor problem, compact Level 0 packet, evidence-gated unlocking, and transfer into a real decision/project. The live branch remains `love`, priority 3, R2 after its first consumed/mapped source, with all seven curriculum children still active/uncompleted; verified through `/knowledge/graph` hierarchy edges and `/brain/node/systems-thinking`.

- **Round model** (`src/services/branch-rounds.ts`): explicit `round_label` wins; otherwise R1 until a source is consumed, R2 at first consumed source (or two notes / three approved recall cards), R3 at three consumed sources plus consolidation and recall strength. `r2-`/`r3-` id prefixes are fallbacks. `recommendations.round` (0035) remains a display column; `recommendation_meta.branch_id` is the canonical linkage.
- **New route** `GET /brain/branches/:id/items` — the authoritative linked-items ledger for one branch: header (label, status, derived round, priority, balance node), ancestor path, recommendations (rating, consumed date, recall, companions, note), notes, recall cards, pending SRS drafts, and R2 artifacts.
- **Enriched contracts**: `GET /capture/queue` items now carry `branch` (`id/label/round/status`), `note`, `recall` (`count/due`), and `companions` (`html/pdf` artifact ids); `GET /capture/:id/record` adds `branch`, derived `round`, `companions`, and `srs.recall_summary`; `GET /recommendations/list` rows add `branch_label`, `round_label`, `branch_status`.
- **UI**: Queue and All-sources views render branch/round badges, note links, recall status, and companion buttons; the Branch Deck gained a Linked Items Ledger panel (sources, notes, recall cards, drafts, artifacts with dossier jumps); the unified source dossier gained Branch, Reading Companions, Active Recall, and Feedback & Evidence sections; the global inspector shows Branch and Round facts.
- **Settings consistency fix**: migration 0023 seeded `profile_automation` as `automatic`, silently overriding the new `manual` default on fresh databases; the seed now stores `manual` and new migration `0036` aligns existing databases. E2E updated for the manual-review contract (proposals hold for approval, `decision_source: 'user'` on approve).
- **Hermes contract v5**: adopted `learning-compass-source-ingestion` and `learning-hub-companion-authoring` as active skills, retired the renamed `learning-thread-curation` (disabled in `~/.hermes/config.yaml`), fixed the `progressive-learning-curriculum` frontmatter, added route ownership for the new ledger/queue/record reads, and completed the migration inventory through `0036`. `npm run verify:hermes` passes (previously blocked on 0031–0033 inventory drift).

Verified: `npm test` 93/93, typecheck, production build, and live health smoke check pass. Full E2E remains blocked by the typed-source inspector assertion noted in the task result. Gallery Queue deployed to Worker version `e6c2e1f2-5221-4417-950d-5c71a3c8433a`.

## Previous truth — 2026-08-14

The frontend replacement is implemented, wired as the active entry, verified, and **deployed to production** at `https://recommendations-worker.mhmudnasr30.workers.dev` (Worker version `e9542138-53d2-4aa1-91e3-b1d75ed4af3f`).

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail with command bar (⌘K search, capture), grouped workspace modes, a working canvas, dynamic theme engine (20 presets + custom palettes and typography), and an optional inspector.
- Navigation has five root destinations and 11 grouped modes with subordinate focus filters: Home/Today; Library/Triage (Queue, Feeds), Catalog (All, Books, Collections, Archive), Assets (Files); Learn/Paths, Practice; Map/Atlas, Review; Settings/Personal, Data & sync, System.
- Desktop uses rail + canvas + optional inspector; there is no permanent context pane. Mobile and tablet use a five-item bottom dock with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.
- The retired `app.tsx`, `destinations.ts`, `styles.css`, and `experience-polish.css` are removed. Old `mockups/` and `output/` materials were moved outside the repository; the recoverable pre-reset snapshot remains available through the rollback window.

## Behavior invariants

Ordinary captures enter Queue directly. RSS/Atom refreshes stay in the Feed stream and Inbox for deliberate triage; they never create a Queue commitment automatically. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed the cap. Consumption happens at the real source or a verified canonical reading companion through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual now mines complete source evidence, writes one full Arabic canonical body, renders linked HTML/PDF from it, accepts zero visuals, rejects hidden transcript padding and repeated/generic UI, inspects every responsive/page render, and publishes automatically only after the hard gate passes; it does not start an automatic Notes Extractor chain.

## Verification observed

Observed release-gate results: `npm test` 83/83 plus typecheck; Hermes contract and migration rehearsal clean; production build clean; and live endpoint smoke tests returned HTTP 200 across `/health`, `/dashboard/briefing`, `/capture/queue`, `/capture/feeds`, `/notes`, `/learning/srs/due`, and `/agent/jobs?status=pending`. Production deployment succeeded on 2026-08-14 (Worker version `e9542138-53d2-4aa1-91e3-b1d75ed4af3f`).

The 2026-08-14 Lite Visual repair was replayed against the complete 82.5-minute Paths to Power source. The replacement contains 5,070 canonical Arabic words across 12 evidence spans with 100% timed coverage, zero generated visual assets, responsive checks at 320/390/768/1024/1440px plus 200% text resize, and all 23 A4 PDF pages rendered and visually inspected. Validator result: pass. The live replacement pair is `paths-power-r5-6c04afa46bd0b0fc` (`artifact_1786694644282_299a2f` HTML and `artifact_1786694654369_e67101` PDF); both live-download hashes match the validated local files. Current repository verification observed `npm test` 81/81 plus typecheck, production build pass, and `git diff --check` pass. `npm run verify:hermes` was blocked by unrelated pre-existing migration inventory drift (0031–0033 missing from the expected contract); that drift is resolved in the 2026-08-15 update, which also completed the inventory through `0036`.

## Post-deploy follow-up

Keep the recoverable pre-reset snapshot through the rollback window. VAPID secrets are configured; a real subscribed-device notification delivery test remains a separate explicit operational check because it sends an external notification.
