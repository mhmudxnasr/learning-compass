# Changelog

This file records user-visible behavior, architecture, dependency, and operating-contract changes. Add new work under `Unreleased`; deployment receipts and live health belong in `CURRENT_STATE.md`.

## Unreleased

### Changed

- Made Library → Books display the existing Hardcover mirror as read-only reading history without importing it, deduplicating unambiguous matches while keeping mirror-only titles external and mutation-free.
- Made the Daily resurfacing card open the exact source dossier from its title or card surface while preserving its branch, companion, and review controls.

- Rebuilt Threads as a learning desk with direct next-lesson links, Planning, priority and pause controls, remembered search, readiness filters, and material-gap navigation. New Threads open a usable first-Level setup flow. Thread overviews now include editable outcomes, scoped notes, and an optional saved reflection; lessons have a searchable course navigator, persistent focus mode, and readable authored text.
- Thread summaries exclude completed lessons from material gaps and expose the exact next lesson, duration coverage, and study dates backed by explicit lesson-status events. Existing curriculum progression and passive source access remain intact.

- Updated the GitHub Verify workflow to the official Node 24-based checkout and setup-node v7 actions.

### Removed

- Removed an empty, unconfigured `whatsapp-insights-site` gitlink that caused checkout cleanup warnings.

## 2026-09-01

### Added

- Added ESLint, Prettier, EditorConfig, and Knip configuration with one `npm run quality` gate. This makes style, hook safety, formatting, dead-file detection, and dependency reachability repeatable.
- Added a complete browser-extension options page, a production-safe default origin, and a contract test. The extension still opens the normal capture flow and retains only its configured app origin.
- Added this changelog, a dependency ownership policy, a clearer architecture map, CSS placement rules, and explicit human/AI repository maintenance conventions.
- Added durable Android and web share receipts. Ambiguous URL-plus-prose shares now wait for an explicit whole-source or exact-passage choice and remain recoverable after the app closes.
- Added revisioned source anchors, non-destructive recall repair, advisory source-health history and replacement, verified offline study packs, and Library-first Thread material organization.

### Changed

- Updated Hono, Preact, Cytoscape, Vite, Wrangler, Playwright, Cloudflare types, and the supporting build/test tools. Vite now uses its Rolldown chunk configuration; TypeScript remains on 6.x until the lint toolchain supports 7.x.
- Split the global application stylesheet into ordered product-area modules without changing cascade order or generated CSS, so a workspace can be inspected without loading a 37,000-line file.
- Split the Learning Thread screen into route, level, project, lesson, material, and view-model modules while preserving its route and progression contracts.
- Kept the newer Thread source organizer, exact-lesson material request, offline-pack, source-health, and next-lesson flows within those smaller modules.
- Hardened the mobile Preferences hero and density choices so doubled text remains inside a 390px viewport.
- Removed redundant queries, unused imports and helpers, ineffective assignments, and stale hook patterns found by the new static checks.
- Made the release gate run repository style, static analysis, and standalone integration scenarios before the build and browser stages.

### Removed

- Removed the unused legacy client entry and obsolete Vite production config.
- Removed three prototype-only HTML pages from the public asset tree so design experiments are no longer shipped as production URLs.

Deployment receipts and recovery evidence for this release are recorded in `CURRENT_STATE.md`.
