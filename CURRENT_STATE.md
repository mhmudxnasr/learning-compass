# Learning Compass — Current State

## Current truth — 2026-08-14

The frontend replacement is implemented and wired as the active entry, but it is **not deployed**.

- `client/src/main.tsx` imports `client/src/app/entry.tsx`; the old monolithic frontend is no longer the runtime entry.
- The shipped visual contract is **Botanical Folio / Evidence Ledger**: green and cream planes, a persistent desktop root rail, workspace ledger, main canvas, and contextual inspector.
- Navigation has five roots and 18 named views: Home/Today; Library/Queue, Inbox, All sources, Files, Books, Collections, Archive; Learn/Paths, Notes, Recall; Map/Atlas, Branches, Balance; Settings/Profile, Preferences, Data & sync, System.
- Desktop uses the four-pane studio topology. Mobile and tablet use a bottom dock and navigation sheet; object inspection becomes a sheet or pushed detail view.
- Legacy hashes, typed object identity, global Capture/Search, route recovery, offline mutation flushing, D1/R2 ownership, and the learning behavior contract remain preserved.

## Behavior invariants

Capture always enters the unlimited Inbox. Queue normally caps queued/in-progress sources at five and requires an explicit override to exceed the cap. Consumption happens at the real source through an explicit learning session. Notes remain structured, editable, searchable, and bilingual by block. Ratings of 7–10 create editable SRS drafts and approval is required before Review. Feedback processing never requests another recommendation automatically. Lite Visual retains its linked HTML/PDF, per-book-chapter, complete-source mining, cache reuse, Visual Mind, checksum, and canonical-record rules; it does not start an automatic Notes Extractor chain.

## Verification observed

For this replacement, the observed verification record is limited to TypeScript typecheck, production build, and focused live QA. E2E and full-suite results are intentionally not claimed here. `git diff --check` is run for this cleanup before commit.

## Next release gate

Run the full release checklist, including the route/deep-link, responsive/accessibility, E2E, unit, Hermes, migration, and live deployment checks. Do not deploy from this task; the implementation remains pending release.
