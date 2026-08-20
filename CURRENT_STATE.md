# Learning Compass — Current State

## Current truth — 2026-08-19 (transparent offline HTML companions)

Cache v11 is deployed with no UI changes. After an HTML reading companion opens successfully online, the service worker refreshes a dedicated exact-URL artifact cache; the same URL then reloads offline. Application-shell navigation is isolated, so an artifact can no longer replace the cached PWA shell. Unopened HTML companions and PDFs remain network-dependent. The full E2E suite verifies online open → network blocked → offline companion reload → offline Home recovery. Production version `91fe5365-2e72-48c9-9ead-8e18eb0b8ace` passed all 19 live endpoint smokes and a fresh Android-profile test against an existing Arabic companion: the network probe failed as expected, the 8,901-character reading body matched online exactly, Home recovered offline with five dock items and zero overflow, and the dedicated artifact cache remained separate from shell v11. Rollback version: `6e2e4ad4-00cf-4fd6-9be8-0ba83b431fbb`.

## Current truth — 2026-08-19 (native Android PWA foundation)

Learning Compass now has one canonical Android experience built from the existing client rather than a second mobile fork. The application shell links a single Worker-served manifest with standalone launch, exact 192px/512px PNG launcher assets, a dedicated maskable icon, Capture/Queue/Recall launcher shortcuts, `navigate-existing` relaunch behavior, and the existing Android share target into Inbox. The active entry registers the service worker; cache v10 precaches the fingerprinted shell, launcher assets, and bounded Home briefing required for a first-install cold offline reload. Installed mode respects cutout/system safe areas, uses a sticky mobile utility bar, and suppresses browser overscroll. Android receives a dismissible install card only when the browser emits `beforeinstallprompt`; Not now suppresses it for 30 days. The Capture launcher shortcut opens the existing global capture dialog and returns to the canonical Inbox route.

Verified with 136 unit tests plus TypeScript, production build, clean/idempotent migration rehearsal, Compass bridge, Hermes contract verification (44 migrations, 25 synchronized checks, 87 owned routes), `git diff --check`, exact PNG dimensions/hashes, and the full E2E suite across five roots and 20 mode states. E2E verifies service-worker readiness, Android launcher capture, a cold offline mobile reload, the Android install/dismiss flow, five-root navigation, and no horizontal overflow. The initial live release exposed that a first-install offline reload had the shell but not Home's read model; cache v10 closes that gap by precaching `/dashboard/briefing`. Replacement deployment `6e2e4ad4-00cf-4fd6-9be8-0ba83b431fbb` passed a fresh-profile live Android test with the network blocked: Home rendered from cache, all five dock items remained available, horizontal overflow was zero, and browser errors were zero. The earlier release passed 19 live JSON smokes, matched all launcher-icon hashes, exposed 190 capabilities and one schedule, and completed a live Hardcover sync/readback with 45 books, 129 entries, zero duplicate groups, and zero stored line breaks. Rollback version: `551d81cd-cd29-4a12-82b8-4669106b372a`.

## Current truth — 2026-08-19 (KOReader/Hardcover reading journal)

Library → Catalog now includes Your reading journal, which securely syncs Mahmood-authored KOReader highlights and notes through Hardcover. The compact catalogue card combines identity, sync state, and ledger totals; search and both filter groups share one command bar, so books begin immediately below it. The default scope shows only books with at least one highlight or note; All books restores the complete synced library. Each sync collapses imported line wrapping and removes only resend duplicates with identical book, type, normalized text, timestamp, and page provenance while retaining a stable source ID. The journal UI is read-only apart from explicit synchronization and no longer exposes branch assignment, Add to Compass, or In Compass controls. `HARDCOVER_API_TOKEN` is a Worker-only secret and explicit sync writes the D1 mirror. The production mirror currently contains 45 books and 129 clean entries: 110 highlights and 19 notes, with zero duplicate groups or stored line breaks.

Migration `0042_hardcover_reading_journal.sql` is applied and production version `1e45acd5-2f90-4a6f-b709-46d8f84e1594` is live; rollback version is `0cee35f4-fd59-49f5-b765-86f16a7a4faa`. Verified with 133 unit tests plus typecheck, production build, Hermes and Compass bridge contracts, full route/responsive E2E, `git diff --check`, a successful live sync, and the production duplicate/line-break detector returning zero for both defects.

## Current truth — 2026-08-19 (bilingual note reader redesign)

The typed note route is now a dedicated long-form reading surface instead of a plain-text dump. It removes Obsidian front matter and duplicate embedded source lines from reading mode, promotes an embedded source URL when the note record lacks one, preserves Markdown headings, ordered/unordered lists, quotes, emphasis, links, and inline code, and computes word count plus reading time. Direction is resolved per content block, so Arabic prose reads RTL while English titles and passages remain LTR; the responsive Evidence Ledger margin index follows the reading direction. Editing remains lossless and continues to expose the original section content.

The visual surface uses the active semantic theme and typography tokens, a 45–75ch manuscript measure, quiet source/status metadata, one top-level edit action, and a completion-oriented recall action. Verified with 131 unit tests plus typecheck, production build, full E2E, Hermes contract verification, `git diff --check`, and real-browser inspection at 1280px and 390px with zero horizontal overflow. Deployed as Worker version `0d0116c8-0ecc-4c5b-9f83-86bde987d328`.

## Current truth — 2026-08-19 (authored lesson creation and Obsidian path migration)

Learning Threads can now create complete Level-owned lessons through `POST /learning/core/threads/:id/stages/:stageId/lessons`. The guarded capability accepts full pedagogy/content and can link an existing work item through `legacy_item_id`, avoiding duplicate progression records while switching the Level to course progression. The Behavioral Psychology Thread was migrated from Obsidian into 4 Levels and 12 fully authored lessons, with 26 preserved files, 22 readable notes, 12 Level-owned recall cards, and five canonical consumed book/video sources attached to exact lessons with verified branches. Duplicate publisher-URL book records created during migration were reversibly archived in favor of the existing canonical consumed records. Production version: `8427edef-4a7e-44af-81fd-426e76adb417`; rollback version: `ffafa36f-7235-4b0e-9073-9d21770eb314`. Verified with 126 unit tests plus typecheck, production build, full E2E, agent/Hermes contract, clean/idempotent migration rehearsal, deploy smoke, and canonical Thread/source readbacks.

## Current truth — 2026-08-18 (reading-companion workflow repair)

Lite Visual now treats every normal HTML/PDF pair as a source-faithful Arabic reading companion, rejecting both prose dumps and image-only atlases. The v2 canonical contract records one learning promise, narrative arc, source-specific art direction, accessible color strategy, and a prose/native/coded/generated/hybrid visual decision for every section. When it selects `generated-image`, AGY runs automatically under Mahmood's standing authorization; no approval prompt is allowed. The image-generation prompt must specify source-grounded teaching purpose, finished editorial composition, Arabic RTL order, right-to-left directional logic, color, target dimensions, safe margins, and forbidden generic forms. The result is integrated without subjective audit; only mechanical file safety is checked. Hermes owns canonical prose, integration, deterministic companion verification, upload, and deletion.

Lesson 01's four Hermes-owned companions were rebuilt from scratch with complete Arabic explanation, source-specific colored editorial systems, varied reading rhythm, and 12 grounded AGY SVG figures. All four passed the strict validator and responsive/PDF checks, were uploaded and verified on their source records, and the eight superseded image-atlas artifacts were removed. Repository verification passes with 125 unit tests plus typecheck, `verify:hermes`, and `git diff --check`.

## Current truth — 2026-08-18 (branch-safe lesson source portfolios)

Exact lesson source attachments now require a visible `primary|case|challenge|reference|optional` role and a verified non-pruned Level branch. The atomic attachment stores the lesson role, persists `recommendation_meta.branch_id`, and moves newly pushed study material from Inbox to `learning_state=attached`, so curriculum filling no longer creates unmapped recommendations or pollutes the capture Inbox. `global_fetch_strictly_public` is enabled because guarded `/agent/request` uses same-zone Worker subrequests; without it Cloudflare returned error 1042 and blocked every guarded mutation. URL deduplication now runs YouTube canonicalization only for actual `youtube.com`/`youtu.be` hosts, preventing ordinary paths such as `nist.gov/publication/...` from being corrupted into fake YouTube URLs.

The Level/path source-selection procedure now compares exact objective coverage, prerequisite fit, depth, source authority, accessibility, sequence placement, and semantic novelty; additional sources are accepted only for distinct roles. Level 0 of `Systems Thinking — From Orientation to Advanced Practice` is now complete: 7 lessons × 5 exact visible roles = 35 unique, live-verified sources; all 35 persist `systems-thinking-level-0`, 34 are `attached`, the previously completed source remains `completed`, none entered Queue, and the historical administratively excluded Meadows record is not attached. Lesson role attachment is now replacement-safe, so one role cannot accumulate duplicates. Verified with 124 unit tests plus typecheck, production build, full E2E, Hermes contract, clean/idempotent migration rehearsal, Compass bridge handshake, deployment smoke, canonical Thread/source readbacks, and `git diff --check`. Production version: `ffafa36f-7235-4b0e-9073-9d21770eb314`; rollback baseline: `89ac4dd0-26c5-46ce-b243-ed0c4e3436ca`.

## Current truth — 2026-08-18 (Thread study-to-proof enhancement)

The Learning Thread workbench now represents the actual learning state instead of treating every unfinished lesson as active. Lessons resolve to Ready, In progress, Completed, or Needs material from their status plus authored content/verified sources. Missing-material lessons explain the block and keep completion disabled; the next action skips blocked lessons and becomes a preparation state when nothing is ready.

Level progress is split into Study and Proof tracks. A compact finish line exposes required proof actions and reuses the canonical evidence recorder, while the curriculum is a single numbered spine rather than a two-column card wall. Typed Level and Lesson pages now have real `h1` headings and a Threads breadcrumb that returns to `#/learn`. Lesson pages render `why_learn`, `why_now`, and `takeaway` as a learning contract, and provide progressively disclosed Level-owned note, file, and recall tools in context. Level and Thread material ledgers are collapsed by default; primary back/source targets meet mobile touch sizing.

Verified with `npm test` (120 unit tests plus TypeScript), `npm run verify:hermes`, clean/idempotent migration rehearsal, Compass bridge verification, `npm run build`, `npm run test:e2e`, `git diff --check`, and real-browser renders at 1440px and 390px. Production deployment completed as Worker version `89ac4dd0-26c5-46ce-b243-ed0c4e3436ca`, serving `/assets/index-Di0OyU1O.js` and `/assets/index-DXa9WIU1.css`. Live smoke checks confirmed all required release endpoints, zero horizontal overflow, active work before Levels, one ready and six blocked lessons, collapsed Level/Thread materials, a 44px mobile back target, visible missing-material recovery before the lesson contract, disabled completion for the blocked lesson, and no browser errors.

## Current truth — 2026-08-18 (Thread workbench audit and responsive repair)

The live Learning Thread level surface was audited at desktop and phone widths using the Anthropic `frontend-design` guidance plus the local usability, journey, accessibility, and edge-state standards. The primary defect was responsive ordering: at 390px the Levels roadmap rendered before the active level, pushing the lesson work below the fold and behind the mobile dock. The level workbench now keeps the active level first at every width, then the roadmap, then the material ledger.

The active level now exposes an explicit `Next up` lesson action, a `0 of N lessons complete` progress bar, a `Threads / Learning path` wayfinding cue, a sequence completion count, and stronger visual treatment for the next lesson. Level cards now show lesson progress rather than only total lesson count. Existing typed Thread/Level/Lesson routes, source/material ownership, completion mutations, and the five-root shell remain unchanged.

Verified with `npm test`, `npm run build`, `npm run test:e2e`, `git diff --check`, and Playwright renders at 1440px and 390px. The local render confirmed the active level begins at y=151px on the phone and the Levels roadmap begins after the active work; production was deployed as Worker version `6b09bc69-292f-4154-a372-e89d1005a489` and the live 390px smoke check confirmed the same ordering, the new progress/Continue panel, and zero horizontal overflow.

## Current truth — 2026-08-18 (thread surface simplification)

Learning Thread tabs no longer show the top header or right-side command card: back navigation, status, title, guiding question, current-level, focus, progress, Continue, Edit Thread, and finish-line elements are removed. Stage-level learning content remains available.

The level map is now dismissed from the default Thread view, and the active level content expands across the page as the primary surface.

The active level view now omits the Next action card and Evidence gate entirely; the lesson sequence is the remaining primary content surface.

The remaining action-count labels were removed, and the active level canvas is constrained to a readable 980px desktop width instead of expanding edge to edge.

The excessive blank gap above the lesson sequence was removed by collapsing the stage-header and lesson-section spacing.

The decorative divider beneath “Learn in sequence” was removed so the lesson grid starts without an extra line.

The Level project card was replaced with a selectable Levels section below the lessons. Selecting a level updates the active content above.

The Levels section is collapsed by default and expands as a native accessible disclosure when needed.

Lessons now have canonical nested routes under their parent Thread: `#/learn/thread/:threadId/lesson/:lessonId`. Lesson cards, previous/next controls, and the lesson back link preserve that route identity.

Lesson routes now use the shorter canonical form `#/learn/t/:threadId/l/:lessonId`; the verbose `/learn/thread/.../lesson/...` form remains readable and canonicalizes to the compact route.

Lesson UX now hides the global Learn switcher, uses “Back to level,” removes the obsolete Edit instruction, removes duplicate empty-state separators, and gives the reading surface a more useful width.

Nested lesson pages no longer render the parent Levels disclosure; lesson navigation stays focused on the lesson itself, while Levels remains on the parent Thread view.

The parent Thread now opens Levels by default, remains collapsible, and shows each level’s lesson count so the existing curriculum is immediately discoverable.

Lesson footer controls now use consistent inline-flex button geometry, no inherited link underlines, stable icon alignment, and responsive full-width behavior on mobile.

## Current truth — 2026-08-18 (Preferences workspace redesign)

Settings → Preferences is now a deliberate workspace instead of one continuous same-priority control dump. It leads with the active visual system and four complete workspace styles, keeps native density/corner/text-size choices and learning behavior visible, progressively discloses theme, font, detailed typography, custom-system, and Map tuning, and pairs the desktop controls with a sticky non-interactive studio preview. Mobile uses readable choice targets, a compact two-column theme gallery where space allows, and corrected sticky section jumps that do not hide destination headings. The active-workspace summary reports a named preset only while its typography and display values still match; fine-tuning correctly changes it to Custom tuning.

The behavior contract remains real and global: E2E changes and reloads density, corner geometry, text size, reduced motion, and a dark theme through the Worker settings API, then verifies the corresponding computed application behavior. Advanced groups use native disclosures, primary comfort choices use native radios, the preview exposes no fake actions, and every existing theme/font/custom/typography/learning/Atlas capability remains available.

Verified with `npm test` (114 unit tests plus TypeScript), `npm run build`, `npm run test:e2e`, `npm run verify:hermes`, `npm run verify:migrations`, `npm run test:compass-bridge`, and `git diff --check`, plus real-browser inspection at 1440px, 900px, 390px, and narrow mobile behavior. Production deployment completed as Worker version `d1c97c60-0b9c-4826-a1d3-e3c87a0fb466`; the live route serves `/assets/index-GVxlMmkV.js` and `/assets/index-uhD0e6uM.css`, has no browser warnings/errors or horizontal overflow, and exposes the expected five roots, four workspace styles, three comfort groups, four closed advanced disclosures, 188 System operations, and one schedule. All required release endpoints and the Hermes repair dry-run returned HTTP 200; service-worker cache v8 is live.

## Current truth — 2026-08-18 (frontend systems and settings remediation)

The frontend settings contract now changes the complete product rather than only its preview: theme/custom palette, typography, density, corner geometry, and reduced motion flow through shared semantic tokens, persist across reloads, and preserve contrasting action ink. Server-saved custom palettes take precedence over stale local custom-theme state. The global desktop rail now exposes Search, Capture to Inbox, and sync state; tablet/mobile use separate Search and Capture utilities above an exact five-root dock. The default capture service and every visible capture entry point now honor the unlimited Inbox invariant, while Queue remains an explicit triage commitment.

Learning Threads again expose the evidence gate and exact proof target alongside the newer authoring surface, with a dominant current action, level progress, required-proof state, direct evidence recording, and a real final-project surface. Settings controls use native pressed/toggle semantics, full-row toggle targets, unique IDs, labeled color inputs, visible focus, and global motion behavior. Empty-state sizing and redundant mobile capture actions were tightened after desktop, phone, and tablet inspection.

Verified locally with `npm test` (112 unit tests plus TypeScript), `npm run build`, `npm run test:e2e`, `npm run verify:hermes`, clean/idempotent migration rehearsal, Compass bridge verification, `git diff --check`, and real-browser desktop/phone/tablet inspection. The base application bundle is 76.70 KB gzip; Atlas remains a lazy graph chunk. Production deployment completed on 2026-08-18 as Worker version `7305cead-f45d-4017-942b-29e311a33814`. All release-checklist read endpoints returned HTTP 200, the live frontend served the new fingerprinted assets and service-worker cache v8, and live desktop/mobile/Settings System checks confirmed five-root navigation, 44px touch actions, zero overflow or browser errors, all 188 allow-listed operations, and the configured six-hour schedule.

## Current truth — 2026-08-17 (Compass bridge mutation repair)

The Learning Compass MCP bridge now sends guarded mutations directly to `/agent/request` instead of routing them through the same-Worker `/agent/tool-call` proxy, which returned a generic HTTP 500 during feedback recording. Canonical reads remain direct GETs; mutation idempotency, dry-run, risk gates, and verification are unchanged. A regression test now asserts that `compass_feedback` targets `/agent/request`, and a live production feedback dry-run returned `ok:true` with no blocker.

## Current truth — 2026-08-17 (branch-verified Hermes recommendations)

Hermes Compass recommendations now enforce the branch contract at candidate submission. Every candidate must name an existing, supported, non-pruned `tree_nodes` branch; missing, unknown, invalid-type, or pruned branches are rejected before scoring. A confident winner stores that exact verified `branch_id` on `recommendation_meta` and `recommendation_outcomes`, and the Queue reads the same branch identity. This closes the gap where the API documentation required a branch but the route could previously accept an unlinked candidate. The fix is deployed at `https://recommendations-worker.mhmudnasr30.workers.dev` as Worker version `51d16175-0f2a-4e10-b5ba-81833063db83`.

Verified with 106 unit tests plus typecheck, production build, Compass feedback integration, full E2E, `npm run verify:hermes`, `git diff --check`, and live `/health` HTTP 200.

## Current truth — 2026-08-17 (profile taste affinity labels)

The Settings profile no longer exposes internal branch IDs in **Taste affinities**. `GET /brain/profile` keeps each vector's internal `topic` key for scoring but resolves a readable `label` from `tree_nodes` (or the priority label as a fallback); the profile list uses that label and shows an affinity score instead of repeating the storage key. The fix is deployed at `https://recommendations-worker.mhmudnasr30.workers.dev` as Worker version `32139a90-d5db-4070-b827-0b8d88a93718`.

Verified with 106 unit tests plus typecheck, production build, full E2E, `git diff --check`, live `/health` HTTP 200, and a live profile read confirming the four previously leaked IDs resolve to their Arabic branch labels.

## Current truth — 2026-08-17 (Settings control-center redesign)

The Settings workspace now leads with a readable learning-profile summary instead of the internal profile model: an explicit Edit profile action, health/status language oriented around user decisions, summary cards for context/priorities/boundaries/quality/workflow, and searchable learned signals behind progressive disclosure. Technical model identifiers remain available under Model details, malformed legacy JSON stays out of the normal view, and Data/System copy now distinguishes backup/recovery and advanced operations from everyday controls. Existing routes, API contracts, and operational inventory behavior remain compatible. This redesign is deployed at `https://recommendations-worker.mhmudnasr30.workers.dev` as Worker version `51469e14-fdd8-4ea8-896e-b98bac23d1c1`.

Verified locally with `npm test` (105 unit tests plus typecheck), `npm run build`, `npm run test:e2e`, `npm run verify:hermes`, and `git diff --check`; live `/health` returned HTTP 200 after deployment.

## Current truth — 2026-08-17 (Hermes cockpit, evidence ledger, recovery, and capture interoperability)

The Hermes enhancement wave is implemented locally. Home and `/agent/briefing` now share a deterministic next-action projection across due recall, open Thread proof, consolidation repair, Queue, drafts, and Inbox. `/agent/activity` and the System surface show persisted agent receipts, audit events, jobs, proposals, and runtime health. Migration `0038` adds source-native annotations with web/PDF/video/EPUB/artifact locators, language, context, checksums, and links from Learning Units, notes, and recall drafts; `/search/evidence` returns those locators and downstream derivations for grounded retrieval. Semantic indexing now carries language metadata and includes active annotations.

Private mode is available through `REQUIRE_API_AUTH=true` plus `API_TOKEN`; Telegram webhooks require a secret header, can restrict an allowed chat, and deduplicate `update_id` through migration `0039`. A least-privilege Manifest V3 extension opens the existing global capture dialog for page URLs and selected passages, preserving the Inbox invariant. `npm run export:recovery` creates a checksummed D1 export and manifest; `npm run verify:recovery` checks the payload before storage or restore, while R2 binary backup remains a separate verified operator step.

Verified locally with 104 unit tests plus typecheck, production build, E2E, migration rehearsal, Hermes contract verification, MCP handshake, recovery export/checksum verification, and `git diff --check`. Remote migrations `0038` and `0039` applied successfully. The Worker is deployed at `https://recommendations-worker.mhmudnasr30.workers.dev` as version `f7a10602-1a62-48f0-8727-716cb171fc84`; live smoke checks returned HTTP 200 for `/health`, `/agent/briefing`, `/agent/activity`, `/agent/capabilities?q=briefing`, and `/search/evidence?q=learning`.

## Current truth — 2026-08-17 (agent control protocol v2)

The Learning Compass operator now uses contract `2026-08-18` / `learning-compass-agent-http/2`. `/agent/context` reuses the complete canonical Queue projection (up to the route's 50-item bound), derives learning gaps only from open Thread evidence requirements, distinguishes verified Threads from compatibility-only legacy mastered exclusions, reports per-section freshness/errors, and returns HTTP 503 when required Queue/evidence/branch components are unavailable. `/agent/capabilities` is structured and filterable; `/agent/openapi.json` is generated from the same registry and includes the guarded `/agent/request` control route. Function calling exposes only `list_capabilities` and `site_request`. Agent mutations provide dry-run impact, exact-target asserted preconditions for high-risk actions, atomic method/path/body-fingerprinted idempotency reservations (migration `0037`), batch-aware canonical readbacks, and explicit committed-but-unverified receipts when post-write verification fails. Contract drift is enforced by `npm run verify:agent-contract` across source, routes, tools, schemas, migrations, documentation, and active Hermes skills.

Verified in an isolated release worktree: agent tests 8/8, complete unit suite 103/103, typecheck, E2E, clean and idempotent migration rehearsal, production build, contract verification, and `git diff --check` pass. Remote migrations `0036` and `0037` applied successfully. Production version `63769064-0bec-45e1-9c7b-3e5d95167a6e` passed live health, context, capability, OpenAPI, tool inventory, dry-run, dashboard, Queue, Notes, Recall, and job smoke checks; rollback version is `fad550a7-ba31-4bb1-867a-cc6ab08891f0`.

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
- **Hermes contract v5**: adopted `learning-compass-source-ingestion` and `learning-hub-companion-authoring` as active skills, retired the renamed `learning-thread-curation` (disabled in `~/.hermes/config.yaml`), fixed the `progressive-learning-curriculum` frontmatter, added route ownership for the new ledger/queue/record reads, and completed the migration inventory through `0037`. `npm run verify:hermes` passes (previously blocked on 0031–0033 inventory drift).

Verified: `npm test` 93/93, typecheck, production build, and live health smoke check pass. Full E2E remains blocked by the typed-source inspector assertion noted in the task result. Gallery Queue deployed to Worker version `e6c2e1f2-5221-4417-950d-5c71a3c8433a`.

## Previous truth — 2026-08-14

The frontend replacement is implemented, wired as the active entry, verified, and **deployed to production** at `https://recommendations-worker.mhmudnasr30.workers.dev` (Worker version `e9542138-53d2-4aa1-91e3-b1d75ed4af3f`).

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail with command bar (⌘K search, capture), grouped workspace modes, a working canvas, dynamic theme engine (20 presets + custom palettes and typography), and an optional inspector.
- Navigation has five root destinations and 11 grouped modes with subordinate focus filters: Home/Today; Library/Triage (Queue, Inbox), Catalog (All sources, Books, Collections, Archive), Assets (Files); Learn/Threads, Practice; Map/Atlas, Review; Settings/Personal, Data & recovery, System.
- Desktop uses rail + canvas + optional inspector; there is no permanent context pane. Mobile and tablet use a five-item bottom dock with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.
- The retired `app.tsx`, `destinations.ts`, `styles.css`, and `experience-polish.css` are removed. Old `mockups/` and `output/` materials were moved outside the repository; the recoverable pre-reset snapshot remains available through the rollback window.

## Behavior invariants

Every ordinary capture enters the unlimited Inbox for deliberate triage. RSS/Atom refreshes stay in the Feed stream and Inbox; they never create a Queue commitment automatically. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed it. Consumption happens at the real source or a verified canonical reading companion through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual mines complete source evidence, writes one full Arabic reading-companion body, renders linked HTML/PDF from it, and uses prose plus purposeful visuals according to concept-level decisions. It rejects hidden transcript padding, prose dumps, image-only atlases, and repeated/generic UI; deterministic responsive/PDF validation gates publication, and Notes Extractor never starts automatically.

## Verification observed

Observed release-gate results: `npm test` 83/83 plus typecheck; Hermes contract and migration rehearsal clean; production build clean; and live endpoint smoke tests returned HTTP 200 across `/health`, `/dashboard/briefing`, `/capture/queue`, `/capture/feeds`, `/notes`, `/learning/srs/due`, and `/agent/jobs?status=pending`. Production deployment succeeded on 2026-08-14 (Worker version `e9542138-53d2-4aa1-91e3-b1d75ed4af3f`).

The 2026-08-14 Lite Visual repair was replayed against the complete 82.5-minute Paths to Power source. The replacement contains 5,070 canonical Arabic words across 12 evidence spans with 100% timed coverage, zero generated visual assets, responsive checks at 320/390/768/1024/1440px plus 200% text resize, and all 23 A4 PDF pages rendered and visually inspected. Validator result: pass. The live replacement pair is `paths-power-r5-6c04afa46bd0b0fc` (`artifact_1786694644282_299a2f` HTML and `artifact_1786694654369_e67101` PDF); both live-download hashes match the validated local files. Current repository verification observed `npm test` 81/81 plus typecheck, production build pass, and `git diff --check` pass. `npm run verify:hermes` was blocked by unrelated pre-existing migration inventory drift (0031–0033 missing from the expected contract); that drift is resolved in the 2026-08-15 update, which also completed the inventory through `0036`.

## Post-deploy follow-up

Keep the recoverable pre-reset snapshot through the rollback window. VAPID secrets are configured; a real subscribed-device notification delivery test remains a separate explicit operational check because it sends an external notification.
## Learning workflow improvement — 2026-08-17

The Learning workspace now connects the existing evidence model to the primary path screen. A learner can see the selected level's evidence gate, start an available level, understand why a locked level cannot open, record proof inline against a required action, and verify a level once its required proof is complete. The existing lesson flow remains intact; this closes the gap where lessons could be marked complete without a visible route to evidence or progression.

The selected level is now presented as a learn-first workbench: one dominant next action, compact stage navigation, a prioritized first missing proof, and collapsible proof/lesson inventories reduce the flat course-detail page without changing the API or mastery semantics. Responsive styles preserve the same priority order on mobile.

Verified: `npm test` (103/103 unit tests plus typecheck), `npm run build`, `npm run test:e2e`, and `git diff --check` pass.

## Learning Threads remediation — 2026-08-17

Learning Thread proof submission now carries its exact work-item target in one atomic evidence request; direct stage status PATCH is lifecycle-protected; typed Learn Unit/Card routes resolve exact objects instead of falling back to the Threads list; and the additive 0040 migration establishes explicit progression/evidence target columns and requirement associations. The visible Learn surface now consistently presents Threads, with an explicit Edit Thread entry point for existing authoring controls.

Verification now passes as part of the 2026-08-18 frontend gate: all 112 unit tests, including the transcript adapter, pass with TypeScript, production build, full E2E, and `git diff --check`.

Hermes Thread control is now expanded through the capability registry: project updates and exact SRS card/review operations are discoverable, Thread mutations advertise typed schemas and canonical Thread-path readbacks, evidence/verification/recall actions are high-risk guarded operations, and routine Hermes capabilities exclude permanent Thread deletion. Active Hermes procedures now use Thread terminology and require user-supplied evidence. Deployed 2026-08-17 as Worker version `8b9ba6e4-950f-4224-856c-8ddfbea54fab`; live `/health` returned HTTP 200 and the live learning-core capability catalog contained 32 operations with project patch exposed and Thread deletion excluded.

## Hermes Thread authoring skill - 2026-08-18

`learning-thread-authoring` is now canonical at `~/.hermes/skills/learning/learning-thread-authoring/SKILL.md`. It owns Thread, level/stage, lesson, project, source, progression, and evidence authoring, delegates curriculum design to `progressive-learning-curriculum`, and delegates guarded mutations to `learning-compass-site-operator`. The project OpenCode skill is a thin discovery adapter to this Hermes source.

## Hermes skill graph repair - 2026-08-18

The active Learning Compass skills have synchronized ownership. Visual output uses source-specific accessible color without reusable theme locks; AGY has standing permission only for automatically selected Lite Visual image assets and cannot author prose, modify code, call APIs, delete, upload, or publish; Lite Visual never auto-chains extraction; source notes default to English with source-original Arabic quotations; recommendation serving mode and exploration are Worker-owned live values; source Queue placement requires canonical branch mapping; and JSON mutations use guarded `/agent/request`.
