# Changelog

This file records user-visible behavior, architecture, dependency, and operating-contract changes. Add new work under `Unreleased`; deployment receipts and live health belong in `CURRENT_STATE.md`.

## Unreleased

### Added

- Added ESLint, Prettier, EditorConfig, and Knip configuration with one `npm run quality` gate. This makes style, hook safety, formatting, dead-file detection, and dependency reachability repeatable.
- Added a complete browser-extension options page, a production-safe default origin, and a contract test. The extension still opens the normal capture flow and retains only its configured app origin.
- Added this changelog, a dependency ownership policy, a clearer architecture map, CSS placement rules, and explicit human/AI repository maintenance conventions.

### Changed

- Updated Hono, Preact, Cytoscape, Vite, Wrangler, Playwright, Cloudflare types, and the supporting build/test tools. Vite now uses its Rolldown chunk configuration; TypeScript remains on 6.x until the lint toolchain supports 7.x.
- Split the global application stylesheet into ordered product-area modules without changing cascade order or generated CSS, so a workspace can be inspected without loading a 28,000-line file.
- Split the Learning Thread screen into route, level, project, lesson, material, and view-model modules while preserving its route and progression contracts.
- Removed redundant queries, unused imports and helpers, ineffective assignments, and stale hook patterns found by the new static checks.
- Made the release gate run repository style and static analysis before tests and build steps.

### Removed

- Removed the unused legacy client entry and obsolete Vite production config.
- Removed three prototype-only HTML pages from the public asset tree so design experiments are no longer shipped as production URLs.

No production deployment or data mutation is part of this change.
