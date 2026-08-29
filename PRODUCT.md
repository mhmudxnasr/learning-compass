# Learning Compass

Learning Compass closes the long-term knowledge loop: Home resurfaces branch-connected consumed sources; Notes can be distilled without rewriting their text; anchored Unit relations create meaningful backlinks, cross-branch bridges, and contradiction review; and Map exposes advisory knowledge-frontier states. Explicit delivery context, adaptive depth, and source-grounded perspective metadata refine selection without changing Queue order or lesson progression.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mahmood (single learner in Egypt / Africa/Cairo timezone), operating a focused, rigorous personal knowledge acquisition and mastery system.

## Product Purpose

Learning Compass is Mahmood’s private learning operating system. It enables deliberate, purpose-driven knowledge acquisition through Learning Threads, source-anchored notes, spaced repetition (FSRS), and taste-calibrated discovery. D1 is canonical; R2 stores large artifacts; Obsidian receives an archive/export copy for extracted notes.

## Positioning

A zero-noise, purpose-first personal knowledge ledger. Unlike generic read-it-later or flashcard apps, Learning Compass enforces direct lesson progression, passive source reading, bounded commitment queues (max 5 items), and rigorous pedagogical depth without "learning evidence" gating.

## Operating Context

- **Desktop**: Persistent root rail + working canvas + optional object inspector.
- **Mobile/Tablet**: Bottom five-item dock with separate Search/Capture utilities.
- **Reading Devices**: Huawei TGR-W09 tablet via Lite Visual Arabic HTML/PDF companions.
- **Data Stores**: Cloudflare D1 (SQLite) and Cloudflare R2 object storage.

## Capabilities and Constraints

- **Five Root Destinations**: `#/home` (Today), `#/library` (Books, Queue, RSS Feeds, Archive, Files), `#/learn` (Practice → Notes by default, plus Threads and Recall), `#/map` (Atlas, unified Branch Review), `#/settings` (Learning profile, Preferences, Data & recovery, System).
- **Add Anything**: One global capture surface logs sources or typed books, movies, series, podcasts, courses, games, albums, and other media. Personal items require only title, status, and branch (plus author for books); optional detail stays progressively disclosed.
- **Personal Data Studio**: Settings → Data & recovery visualizes real type, status, recent-edit, and branch distributions; searches and filters the complete ledger; and exposes every mutable personal field inline. It reports counts, never an opaque engagement or “AI quality” score.
- **Queue Limits**: Maximum 5 active queued/in-progress commitments.
- **Personal State Is Not Commitment**: Planned, in-progress, finished, paused, and stopped media stay outside Queue unless a separate explicit source-triage action commits learning work.
- **Direct Lesson Progression**: Completing lessons is the sole progression signal for Levels and Threads. A current lesson can be finished directly from Home without leaving the learning desk; Home confirms the write, animates the completed turn away, and replaces it with the next ordered lesson. Completion from a typed lesson route opens the next ordered lesson automatically when one remains.
- **Passive Access**: Opening sources, books, or companions is passive. Only Queue or Compass starts a tracked session.
- **Reading Companions**: Lite Visual generates bilingual/Arabic-first HTML+PDF pairs with verified depth gates.

## Brand commitments

- **Visual World**: Continuum, a soft graphite knowledge console with a persistent desktop rail, restrained violet working signals, smooth short motion, and selectable day/night systems. Its eight complete workspace presets are original, reference-grounded interpretations of Linear, Raycast, Superhuman, Readwise Reader, Notion, Craft, Arc, and Are.na. Each owns a visibly separate palette, font system, reading rhythm, density, text scale, and corner geometry instead of merely recoloring the same card system. Home leads with the lessons whose turn it is, keeps the active Queue source visible, and places Original/HTML/PDF/NotebookLM controls beside the work they open. Library, Learn, Map, Settings, typed objects, inspectors, and dialogs share the same page horizon, ledger rhythm, control treatment, and semantic depth; route-specific workflows never fall back to a stock dashboard or a separate visual theme.
- **Tone**: Brutally honest, direct, English-first operational interface. Zero emojis by default.
- **Arabic and RTL**: Clear Arabic type, correct direction, and comfortable reading rhythm are required. Religious ornament is not part of the product shell.
- **Anti-Pattern Ban**: No arbitrary side-tab stripes, layout-thrashing animations, chunky borders, stock dashboard grids, or decorative gradients.

## Evidence on Hand

- D1 database schemas and active migrations in `migrations/`.
- Complete test suite in `tests/` covering unit, contract, and theme contrast.
- Production Cloudflare Worker endpoints defined in `src/`.
- Frontend application code in `client/src/`.

## Product Principles

1. **Direct Progression**: Advancement occurs through lesson completion, not passive metric tracking or gated evidence.
2. **Durable Ledger Truth**: D1 is canonical single source of truth across all views and APIs.
3. **Passive Discovery**: Reading and exploring does not pollute active commitments or trigger unwanted sessions.
4. **Pedagogical Depth**: Real source grounding over generic summaries.
5. **Calm Density**: High informational density organized by clean typography and hairline seams.
6. **Correctable History**: Personal data remains searchable, portable, and editable without breaking canonical identity or erasing its mutation lineage.

## Accessibility & Inclusion

- Minimum 4.5:1 text contrast and 3:1 large text contrast across all themes and custom palettes.
- Minimum 44×44px interactive touch targets on mobile and tablet.
- Support for `prefers-reduced-motion` disabling transitions and animations globally.
- Full keyboard navigation and visible focus rings.
