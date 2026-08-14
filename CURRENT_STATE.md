# Learning Compass — Current State

## Current truth — 2026-08-14

The frontend replacement is implemented, wired as the active entry, verified, and **deployed to production** at `https://recommendations-worker.mhmudnasr30.workers.dev` (Worker version `8265d0d5-3cdc-4cb3-85cb-7c683fa847bd`).

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail with command bar (⌘K search, capture), grouped workspace modes, a working canvas, dynamic theme engine (20 presets + custom palettes and typography), and an optional inspector.
- Navigation has five root destinations and 11 grouped modes with subordinate focus filters: Home/Today; Library/Triage, Catalog, Assets; Learn/Paths, Practice; Map/Atlas, Review; Settings/Personal, Data & sync, System.
- Desktop uses rail + canvas + optional inspector; there is no permanent context pane. Mobile and tablet use a five-item bottom dock with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.
- The retired `app.tsx`, `destinations.ts`, `styles.css`, and `experience-polish.css` are removed. Old `mockups/` and `output/` materials were moved outside the repository; the recoverable pre-reset snapshot remains available through the rollback window.

## Behavior invariants

Capture always enters the unlimited Inbox. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed the cap. Consumption happens at the real source or a verified canonical reading companion through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual now mines complete source evidence, writes one full Arabic canonical body, renders linked HTML/PDF from it, accepts zero visuals, rejects hidden transcript padding and repeated/generic UI, inspects every responsive/page render, and publishes automatically only after the hard gate passes; it does not start an automatic Notes Extractor chain.

## Verification observed

Observed release-gate results: `npm test` 79/79 plus typecheck; Hermes contract and migration rehearsal clean; production build clean; E2E clean across five roots, 18 internal states, typed objects, legacy recovery, search/capture dialogs, and mobile shell/dock; and live endpoint smoke tests returned HTTP 200 across `/health`, `/dashboard/briefing`, `/capture`, `/capture/queue`, `/notes`, `/learning/srs/due`, and `/agent/jobs?status=pending`. Production deployment succeeded on 2026-08-14 (Worker version `8265d0d5-3cdc-4cb3-85cb-7c683fa847bd`).

The 2026-08-14 Lite Visual repair was replayed against the complete 82.5-minute Paths to Power source. The replacement contains 5,070 canonical Arabic words across 12 evidence spans with 100% timed coverage, zero generated visual assets, responsive checks at 320/390/768/1024/1440px plus 200% text resize, and all 23 A4 PDF pages rendered and visually inspected. Validator result: pass. The live replacement pair is `paths-power-r5-6c04afa46bd0b0fc` (`artifact_1786694644282_299a2f` HTML and `artifact_1786694654369_e67101` PDF); both live-download hashes match the validated local files. Current repository verification observed `npm test` 81/81 plus typecheck, production build pass, and `git diff --check` pass. `npm run verify:hermes` remains blocked by unrelated pre-existing migration inventory drift because migrations `0031`–`0033` are not yet listed in the expected contract.

## Post-deploy follow-up

Keep the recoverable pre-reset snapshot through the rollback window. VAPID secrets are configured; a real subscribed-device notification delivery test remains a separate explicit operational check because it sends an external notification.
