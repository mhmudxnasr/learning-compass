# Learning Compass — Current State

## Current truth — 2026-08-14

The frontend replacement is implemented, wired as the active entry, verified, and **deployed to production** at `https://recommendations-worker.mhmudnasr30.workers.dev` (Worker version `74992fdb-3ae0-49f0-995e-f2fd1da7b186`).

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail, grouped workspace modes, a working canvas, and an optional inspector.
- Navigation has five root destinations and 11 grouped modes with subordinate focus filters: Home/Today; Library/Triage, Catalog, Assets; Learn/Paths, Practice; Map/Atlas, Review; Settings/Personal, Data & sync, System.
- Desktop uses rail + canvas + optional inspector; there is no permanent context pane. Mobile and tablet use a five-item bottom dock with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.
- The retired `app.tsx`, `destinations.ts`, `styles.css`, and `experience-polish.css` are removed. Old `mockups/` and `output/` materials were moved outside the repository; the recoverable pre-reset snapshot remains available through the rollback window.

## Behavior invariants

Capture always enters the unlimited Inbox. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed the cap. Consumption happens at the real source through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual retains its linked HTML/PDF, per-book-chapter, complete-source mining, cache reuse, Visual Mind, checksum, and canonical-record rules; it does not start an automatic Notes Extractor chain.

## Verification observed

Observed release-gate results: `npm test` 78/78 plus typecheck; Hermes and migration verification clean; production build clean (base entry 43.31 KB gzip, CSS 10.74 KB gzip); E2E clean across five roots, 18 internal states, legacy recovery, and mobile shell/dock; forbidden-pattern detector `[]`; and `git diff --check` clean. Production deployment succeeded on 2026-08-14. Every release-checklist GET smoke endpoint returned HTTP 200, the application shell loaded, all five live root destinations rendered with the correct active mobile dock, Settings/System rendered at 390 px without horizontal overflow, and the live browser reported zero runtime errors. The fresh smoke profile had no stale service-worker registration; `/sw.js` is served with `no-cache, no-store, must-revalidate` and its activation path removes obsolete caches.

## Post-deploy follow-up

Keep the recoverable pre-reset snapshot through the rollback window. VAPID secrets are configured; a real subscribed-device notification delivery test remains a separate explicit operational check because it sends an external notification.
