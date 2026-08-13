# Learning Compass — Current State

## Current truth — 2026-08-14

The frontend replacement is implemented, wired as the active entry, and verified, but it is **not deployed**.

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail, workspace ledger, main canvas, and contextual inspector.
- Navigation has five roots and 18 named views: Home/Today; Library/Queue, Inbox, All sources, Files, Books, Collections, Archive; Learn/Paths, Notes, Recall; Map/Atlas, Branches, Balance; Settings/Profile, Preferences, Data & sync, System.
- Desktop uses the four-pane studio topology. Mobile and tablet use a bottom dock and navigation sheet; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.
- The retired `app.tsx`, `destinations.ts`, `styles.css`, and `experience-polish.css` are removed. Old `mockups/` and `output/` materials were moved outside the repository; the recoverable pre-reset snapshot remains available through the rollback window.

## Behavior invariants

Capture always enters the unlimited Inbox. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed the cap. Consumption happens at the real source through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual retains its linked HTML/PDF, per-book-chapter, complete-source mining, cache reuse, Visual Mind, checksum, and canonical-record rules; it does not start an automatic Notes Extractor chain.

## Verification observed

Observed release-gate results: `npm test` 77/77 plus typecheck; `npm run verify:hermes` clean (32 migrations, 21 checks, 56 routes); `npm run verify:migrations` clean and idempotent; production build clean (base entry 40.78 KB gzip, Atlas lazy chunk 148.91 KB gzip); E2E clean (18 purposeful destinations, mobile shell, and navigation); and `git diff --check` clean.

## Next release gate

Deployment and the post-deploy rollback window remain outstanding. Do not deploy from this task.
