# Changelog

## Bounded Level lesson reads

- Add `view=lessons&stage_id=...` to the Thread path with validated pagination, exact ownership, live completion statuses, and primary source IDs. Omit large bodies and artifact receipts before hydration while retaining full-path compatibility and unchanged lesson progression.

This file records user-visible behavior, architecture, dependency, and operating-contract changes. Add new work under `Unreleased`; deployment receipts and live health belong in `CURRENT_STATE.md`.

## Unreleased

- Keep Home's RSS and resurfacing directly below lessons on desktop, with the sticky Queue sidebar confined to its own column. Remove the large blank gap and scrolling overlap while retaining the mobile reading order; advance the PWA shell to v63.

- Add Home's Cairo-aware learning activity calendar with linked, paginated daily history. Add an explicit Obsidian Thread download with ordered curriculum, existing notes and handwriting reflections, book/chapter inclusion, optional companions, and Level filtering. Preserve canonical prose and normal Hermes archive rules; neither feature changes progression or starts extraction.

- Add scoped Recall keyboard grading with explicit hints, focus restoration, single-request save guards, exact-card reveal state, filter recovery, and a completed-review ending. Bring the mobile question/Reveal action ahead of secondary filters. Keep Copy note and Refresh from source in Study tools, with direct panel focus and Escape/Close returning to the toggle. Cover native keyboard grading, failed-save retry, duplicate keys, and saved scheduler revisions in isolated browser tests.
- Preserve interrupted note edits as recoverable browser drafts, with explicit discard, save recovery, editor focus, named sections, and formatting/direction help. Extend Study tools Escape to claims/synthesis; prevent held Enter from grading Recall accidentally. Correct mobile dock contrast and Arabic reading language metadata. Give uploaded files a readable owner title and direct format access, retaining their separate details route.
- Make Files chapter identity, order, owner routes, canonical branches, and earlier versions recognizable. Resolve Recall branch labels without rewriting legacy card identities; name its search and explain its grades. Atlas selection keeps keyboard focus and opens the real branch dossier. Home completion has an exact-lesson undo; skip navigation preserves routes and search announces asynchronous states. Simplify Preferences to one preview and three initial styles, with all styles available on demand.
- Complete the narrow-laptop layouts for Preferences and Files, include verified branch context on Home lesson materials, and give Files actions item-specific accessible names. Immutable published companions show their status instead of an unsupported Delete action. Search arrow navigation uses native link focus; companion matches carry source/chapter identity and meaningful preference text replaces internal memory keys. Queue removes duplicated metadata and names its Open item action plainly; Preferences and Atlas remove unexplained engine/control labels.
- Close the frontend audit defects while retaining Continuum and the five-root navigation: mobile Files actions wrap; custom-theme text has accessible semantic colors; every tuning slider and search control has a meaningful name; nested main landmarks are removed. Home excludes paused/draft Threads, checks real readiness, and puts current learning before secondary sections. Level labels follow authored numbers consistently.
- Put readable semantic lesson text and reading formats ahead of completion/offline controls. Queue progressively discloses filters and diagnostics, Books groups offline packs, Arabic titles keep comfortable leading, and Recall/material actions keep 44px targets. Notes agree on reading time and offer branch assignment; Preferences includes Type tuning; reminder failures provide concrete recovery; Atlas hides unreadably small branch labels.
- Split Learn, Library, and Settings from the initial client bundle, preserve visited-workspace offline caching, and advance the local PWA shell to v62. Add browser regression coverage for mobile clipping, long bilingual content, accessibility names, state honesty, and recovery; keep search failures distinct from successful empty results. Update older browser assertions for current controls and make the theme helper set its own desktop viewport.

- Remove the fixed 150 KB client-bundle cap at Mahmood's request; keep size reporting and lazy loading guidance, and synchronize the installed Hermes Worker Ops instructions.
- Add a shared repository contribution map and current handoff. Check architectural import directions through ESLint and audit active instructions during lint without requiring a local Hermes installation. Correct retired Lite Visual paperwork, a forced reply template, and stale deployment/migration claims so future contributors follow the current contracts.
- Move scheduled reminder delivery and its shared helpers from the notification routes into a service, removing maintenance's dependency on the HTTP layer while preserving delivery behavior.

- Apply Ponytail's simplification audit: share the identical book/source offline artifact projection, call router normalization directly, and remove unused helpers, aliases, and constants. Preserve active validation, route compatibility, recovery, and learning behavior; cover the shared projection's retained fields and receipt omission.

- Advance the PWA shell to v61 so installed clients receive the Compass logo theme toggle.
- Make the Compass logo toggle light/dark mode on desktop and mobile, remember the last palette in each mode, and save the active appearance through existing settings. Preserve the current workspace and typography; support keyboard activation and synchronized Preferences controls.
- Remove all loaded-skill byte budgets and the combined router/operator cap from Hermes verification. Preserve fixed-prompt, skill-index, tool-schema, memory, and skill-integrity checks.
- Raise Lite Visual's loaded-skill budget from 6,000 to 8,000 bytes to accommodate its installed instructions without changing other prompt limits.
- Refine reading and navigation: single-column bilingual Notes with optional tools and verbatim provenance, next chapters before source diagnostics, compact lesson navigation, clearer Home/Threads hierarchy, canonical branch names, and 44px study actions. Learn now opens Threads; search remembers eight local selections and Atlas offers domain navigation. Preserve content, progression rules, and theme choices.
- Make routine commits and releases fast: affected regression tests, lint/typecheck/build for deployment, and short live checks. Keep full verification opt-in or for high-risk changes, reserve full backup/restore for migrations or risky data changes, and remove default browser suites and Markdown-only runs from CI. Synchronize repository and Hermes instructions; avoid repeated checks and waiting for CI by default.
- Prevent delayed material-editor focus from stealing typing from a field the learner has already selected; verify offline note title/body stay separate before durable queuing.
- Make Hermes's routine Compass reads direct and scoped: Thread inventories/overviews, resume questions, Queue reads, and conversational target corrections. Keep write safeguards in an on-demand reference, reduce repeated instructions, and extend manager routing coverage with realistic short requests and follow-ups. Repair evaluation profile copying for dangling retired skill links and support explicit reasoning comparisons.

- Synchronize Hermes routing with native Compass tools and bounded Level reads; reject retired adapter and forced reply instructions. Reconcile ambiguous Lite Visual uploads by exact pair/receipt readback without repeating writes, and cover oversized bodies/receipts plus HTTP 500 recovery in regression tests.
- Integrate the selected Feeds reader and bounded Level reads with the deployed material notebooks and retirement controls; advance the combined PWA shell to v59 and retain both feature suites in full release verification.
- Added explicit atomic retirement of standalone HTML/PDF companion pairs from current study materials, preserving source links, lesson progress, original files, and recovery history.
- Removed all companion selections from the five requested Systems Thinking Orientation lessons: 25 current pairs and seven older fallbacks, with all original sources and lesson progress preserved.
- Advanced the PWA shell to v58 for companion retirement while preserving the deployed scoped material notebooks and Preferences layout fixes.
- Replace the long RSS card list with a compact split reader. Skip removes an article from its feed and advances without reloading, preserves its saved source and learning state, and restores it on request failure. Add durable feed-entry dismissals in migration `0077` and expose the guarded RSS capability.

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
