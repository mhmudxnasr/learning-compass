# Learning Compass — Current State

## Current truth — 2026-08-14

The frontend replacement is implemented, wired as the active entry, and verified, but it is **not deployed**.

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail, grouped workspace modes, a working canvas, and an optional inspector.
- Navigation has five root destinations and 11 grouped modes with subordinate focus filters: Home/Today; Library/Triage, Catalog, Assets; Learn/Paths, Practice; Map/Atlas, Review; Settings/Personal, Data & sync, System.
- Desktop uses rail + canvas + optional inspector; there is no permanent context pane. Mobile and tablet use a five-item bottom dock with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.
- The retired `app.tsx`, `destinations.ts`, `styles.css`, and `experience-polish.css` are removed. Old `mockups/` and `output/` materials were moved outside the repository; the recoverable pre-reset snapshot remains available through the rollback window.

## Behavior invariants

Capture always enters the unlimited Inbox. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed the cap. Consumption happens at the real source through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual retains its linked HTML/PDF, per-book-chapter, complete-source mining, cache reuse, Visual Mind, checksum, and canonical-record rules; it does not start an automatic Notes Extractor chain.

## Verification observed

Observed release-gate results: `npm test` 78/78 plus typecheck; production build clean (base entry 43.24 KB gzip, CSS 10.66 KB gzip); E2E clean across five roots, 18 internal states, legacy recovery, and mobile shell/dock; and `git diff --check` clean. The redesign is not deployed.

## Next release gate

Deployment and the post-deploy rollback window remain outstanding. Do not deploy from this task.
