# Changelog

This file records user-visible behavior, architecture, dependency, and operating-contract changes. Add new work under `Unreleased`; deployment receipts and live health belong in `CURRENT_STATE.md`.

## Unreleased

### Changed

- Allowed an explicitly user-directed Riyadh early release only as an exact ordered prefix of the hash-bound authoritative 294-recording manifest. Included pairs still require signed v6 validation, a clean aggregate anti-template audit, atomic activation, canonical readback, and rollback lineage; omitted lessons keep their current companions and the prefix never counts as full completion.
- Replaced the shared Lite Visual presentation shell for the first 84 rebuilt Riyadh companions with source-signature- and semantic-group-scoped layouts, eliminating the forbidden kicker/accent treatment and all aggregate template-similarity flags.
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
