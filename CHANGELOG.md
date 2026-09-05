# Changelog

## Bounded Level lesson reads

- Add `view=lessons&stage_id=...` to the Thread path with validated pagination, exact ownership, live completion statuses, and primary source IDs. Omit large bodies and artifact receipts before hydration while retaining full-path compatibility and unchanged lesson progression.

This file records user-visible behavior, architecture, dependency, and operating-contract changes. Add new work under `Unreleased`; deployment receipts and live health belong in `CURRENT_STATE.md`.

## Unreleased

- Added explicit atomic retirement of standalone HTML/PDF companion pairs from current study materials, preserving source links, lesson progress, original files, and recovery history.
- Removed all companion selections from the five requested Systems Thinking Orientation lessons: 25 current pairs and seven older fallbacks, with all original sources and lesson progress preserved.
- Advanced the PWA shell to v58 for companion retirement while preserving the deployed scoped material notebooks and Preferences layout fixes.

- Cleared the 210 unrebuilt Riyadh companion slots on explicit request, retiring exactly 420 HTML/PDF artifacts while preserving the 84 redesigned pairs, original sources, lesson progress, and recovery history.

- Retire six exact duplicate legacy Riyadh companion pairs only when their complete successors remain available, preserving files and lesson progress for the audited replacement release.

### Changed

- Advanced the PWA shell to v57 for the scoped material notebooks and constrained the Preferences grid at enlarged mobile text sizes. Android install checks use an isolated rate-limit identity and wait for the Home screen; offline save tests use the browser's actual connection state so service-worker interception cannot bypass the simulation.
- Replaced the cramped Thread, Level, and Lesson material columns with accessible Notes, Files, and Recall tabs, full-width editors, clear ownership, and readable previews. Draft input survives tab changes; save failures retain it, successful saves report their result, and queued offline writes clear the submitted form to prevent accidental duplicates.
- Merged all ten outstanding branch histories, retaining the verified current implementations and clarifying the architecture's existing database budget margins.
- Made Library → Books display the existing Hardcover mirror as read-only reading history without importing it, deduplicating unambiguous matches while keeping mirror-only titles external and mutation-free.
- Made the Daily resurfacing card open the exact source dossier from its title or card surface while preserving its branch, companion, and review controls.

- Rebuilt Threads as a learning desk with direct next-lesson links, Planning, priority and pause controls, remembered search, readiness filters, and material-gap navigation. New Threads open a usable first-Level setup flow. Thread overviews now include editable outcomes, scoped notes, and an optional saved reflection; lessons have a searchable course navigator, persistent focus mode, and readable authored text.
- Thread summaries exclude completed lessons from material gaps and expose the exact next lesson, duration coverage, and study dates backed by explicit lesson-status events. Existing curriculum progression and passive source access remain intact.

- Allowed an explicitly user-directed Riyadh early release only as an exact ordered prefix of the hash-bound authoritative 294-recording manifest. Included pairs still require signed v6 validation, a clean aggregate anti-template audit, atomic activation, canonical readback, and rollback lineage; omitted lessons keep their current companions and the prefix never counts as full completion.
- Replaced the shared Lite Visual presentation shell for the first 84 rebuilt Riyadh companions with source-signature- and semantic-group-scoped layouts, eliminating the forbidden kicker/accent treatment and all aggregate template-similarity flags.
- Allowed guarded Lite Visual corpora to resolve canonical source ownership from direct Thread, Level, or Lesson placement. Migration `0074_lite_visual_corpus_scope_lineage.sql` applies the same fail-closed placement rule to activation and rollback, so lesson-scoped course material no longer needs a duplicate Thread-level attachment.

- Shortened the Hermes operations, recommendation, and Lite Visual entry points with task-specific references and loaded-size budgets. The contract gate now validates npm commands, local instruction paths, stale migration claims, and forced response templates. User-facing replies may use natural prose while retaining exact verification evidence in operation receipts.
- Updated the GitHub Verify workflow to the official Node 24-based checkout and setup-node v7 actions.

### Removed

- Retired the separate Compass Hermes profile and command alias. Native Hermes retains the Learning Compass skills; verification targets the default profile and rejects instructions that recreate or select the retired profile.
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
