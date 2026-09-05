# AGENTS.md — Learning Compass

This is Mahmood's private, single-user learning operating system. Work autonomously, keep responses concise, and leave the repository in a verified state.

## Start Every Task

1. Read `PROJECT_CONTEXT.md`, the `Handoff` section of `CURRENT_STATE.md`, and the files directly relevant to the task. Older state entries are history; load them only for a related investigation.
2. Run `git status --short`. Existing changes belong to the user; never discard or rewrite unrelated work.
3. Inspect before editing. Prefer `rg`/`rg --files`; use `apply_patch` for manual edits.
4. Implement the smallest complete change. Do not create speculative abstractions or placeholder routes.

Use the contribution map in `README.md` to find the owning module and focused tests. These checked-in instructions apply to every coding model; optional personal skills and the installed Hermes runtime are not prerequisites for repository work. Product invariants live in `PROJECT_CONTEXT.md`, HTTP contracts in `docs/API.md`, ownership in `docs/architecture.md`, and observed operational state in `CURRENT_STATE.md` and `docs/release-snapshot.json`. Recheck live state when a task depends on it. Correct conflicting guidance at its owner instead of adding another override.

## Product Invariants

- Product: **Learning Compass**. Visual language: **Continuum** — a warm editorial knowledge workspace with a labeled persistent dark desktop root rail, confident coral working signals, paper-like planes, grouped workspace modes, a working canvas, and an optional contextual inspector. Home leads with one lesson turn per active Thread, keeps the active Queue source visible, and exposes passive Original/HTML/PDF/NotebookLM links in place. Arabic and RTL treatment use clear type and comfortable line height without decorative religious motifs. On mobile, the rail becomes a five-item bottom dock with inline compact, equal-width mode controls and wrapping subordinate filters. Library begins with one continuous Books room before Triage/Queue; Learn contains finite Threads and Practice. Books integrates the reading desk, My books, and evergreen three-book Canon fields without a Shelf/Canon tab split; Canon remains relationship data and never becomes a sixth root or a second book collection.
- Loop: capture → curate → consume externally → reflect → notes → review → map update → resurface.
- D1 is canonical. R2 stores large artifacts. Routine Hermes Obsidian archiving applies to extracted non-book notes only. Explicit Thread downloads for Obsidian may also include book and book-chapter notes; these are portable snapshots and never write back to Compass.
- Every capture, including Telegram and share-target input, becomes a durable `captured` source record. Queue is a separate explicit commitment.
- Queue normally contains at most five queued/in-progress items; overflow requires an explicit override.
- Consumption happens through the original source or a verified canonical HTML/PDF companion and is tracked through target-aware learning sessions.
- Notes are structured, editable, and searchable. Notes Extractor source notes pair precise English source claims with natural Egyptian-Arabic explanation in separate directional blocks. When supported, they include Misconception vs. Truth and every key study or experiment with researchers, year, method, and findings. Handwriting stays verbatim in native note blocks without Obsidian syntax; user-authored blocks preserve their original register and direction.
- Rating alone never creates notes. Explicit `retain`/`apply` may create source-shaped notes and anchored Learning Units, but no automated workflow generates flash cards or recall drafts. New cards require an explicit learner-authored action.
- Learning Threads and Levels advance only through direct lesson completion. Projects, sources, notes, ratings, and recall never gate or advance progression.
- Resurfacing, frontier states, semantic relationships, contradiction review, note distillation, adaptive depth, perspective diversity, and delivery context are advisory or reflective capabilities only; none can gate or advance progression.
- Meaningful links and cross-branch bridges derive only from anchored typed Unit relations with canonical branch ownership. Progressive distillation is explicit and additive and never rewrites canonical note text.
- Every captured, recommended, or queued item must persist a verified non-pruned knowledge branch and domain, and its clean branch pill must render everywhere that item appears.
- Feedback processing never requests another recommendation automatically.
- Lite Visual creates one atomic HTML/PDF pair per source or book chapter from a complete accepted extraction. `extract_source.py` remains the sole acquisition entry point with existing cache, caption, transcript, OCR, and canonical identity rules. Mahmood explicitly removed mandatory review passes, per-120-word scope/meaning-unit paperwork, the forced complete-source appendix, and exhaustive HTML/PDF quality audits. Author and revise natural Egyptian-Arabic teaching directly in source-specific semantic HTML, then render the same file as tagged A4 PDF. Use `lite-visual-integrity/v1` to attest source/target binding, file hashes, canonical body, and render binding; declare quality checks not run. Preserve inert code-only content, exact job/run/chapter ownership, R2 integrity, atomic publication, and guarded corpus activation. Never label unchecked files as quality-validated.
- Lite Visual integrity receipts and historical v6 receipts are HMAC-attested with distinct check sets. Batch replacement retains exact ordered targets, manifest, signed aggregate identity/hash audit, source, immutable workflow run, active durable job, R2 verification, and supersession lineage. Replacements stay staged and lease-free until guarded D1 activation; failure leaves the prior corpus visible.
- The route registry in `client/src/app/router.ts` exposes five root destinations and 12 grouped modes. Library → Archive contains completed and excluded sources only; All sources, Reading journal, and Collections are retired product surfaces. Every remaining root and mode/focus surface must resolve to a real product surface; no generic fallback screens or tabs may expose only infrastructure.

## Architecture boundaries

Lite Visual teaching uses natural Egyptian Arabic, precise terms, faithful quotations, and complete per-source explanation. Write and revise directly; no mandatory editorial review forms or exhaustive artifact quality gates. Load its teaching/design and applicable batch guidance. Native Hermes uses one installed tree; do not recreate the retired Compass profile.

- `src/index.ts`: Worker composition root. Mount middleware and route modules here; keep feature logic out of it.
- `src/api/`: HTTP parsing, authorization boundaries, status codes, and response shaping. Route modules call domain or service functions instead of duplicating rules.
- `src/services/` and `src/domain.ts`: reusable workflows, validation, storage orchestration, and product rules. These modules must not depend on client code.
- `client/src/app/`: browser entry, route registry, and top-level composition.
- `client/src/shell/`: navigation and cross-workspace shell behavior.
- `client/src/workspaces/`: destination-level screens. A workspace may compose focused modules from `client/src/features/`, but feature modules must not import a workspace.
- `client/src/styles/`: ordered CSS modules imported by `client/src/studio.css`; follow its local README before changing cascade order.
- `browser-extension/`: a separate Manifest V3 capture client. It communicates only by opening the normal application capture route.
- `scripts/`: checked-in release, recovery, migration, and analysis commands. A script must be repeatable and documented through `package.json` or its file header.
- `schema.sql`: legacy/base schema.
- `migrations/`: ordered, idempotent production migrations.
- `tests/unit/`: domain and API contract tests.
- `tests/integration/`: isolated Worker/D1 workflows run through `npm run test:integration`.
- `tests/e2e/`: route, shell, and responsive acceptance tests.
- `docs/`: active architecture, API, dependency, recovery, and release contracts. Historical release facts belong in `CURRENT_STATE.md` or `CHANGELOG.md`, not architecture docs.
- Do not restore the removed template-string frontend, `schema_v2.sql`, generated `dist/`, backup bundles, or obsolete one-off scripts.
- Preserve existing REST compatibility unless a migration and every active Hermes consumer are updated together.

## Coding conventions

- Name Preact components and their files in `PascalCase`; name hooks `useSomething`; use `camelCase` for functions and variables and descriptive kebab-case for non-component assets.
- Prefer one clear responsibility per file. New source files should normally stay below about 700 lines. Split by feature or ownership boundary when a file contains independently testable regions; do not split a coherent algorithm merely to meet a line count. Existing larger modules are refactor targets when their area is changed.
- Keep public functions small enough that validation, state changes, and return values are visible without scanning unrelated code. Extract repeated domain decisions, not single-use wrappers.
- Write comments for constraints, tradeoffs, and non-obvious reasons. Do not narrate the next line. Never leave commented-out implementations, TODO placeholders without an owner, or compatibility code without a documented caller.
- Validate external input at the HTTP or integration boundary. Return stable, client-safe errors there; preserve the original cause when wrapping internal errors. Do not silently catch failures unless the fallback is intentional and explained.
- Keep API payload types close to their owner and use the shared client in `client/src/api.ts`. Do not make ad hoc `fetch` calls from views when an API helper exists.
- Put selectors with their owning workspace or feature. Do not append catch-all overrides to the end of the cascade; update the source rule and verify all supported viewports and themes.
- Use the configured ESLint and Prettier rules. Do not disable a rule repository-wide to make one change pass; use a narrow suppression with a reason when the rule is genuinely inapplicable.

## Repository maintenance contract

When a human or AI assistant changes this repository:

1. Add or update focused regression coverage for meaningful behavior changes. Run only affected tests. Documentation, copy, and small styling changes do not need new tests; use a focused visual check for styling. Broad navigation/offline changes warrant E2E.
2. Update `README.md`, `docs/architecture.md`, `docs/API.md`, `PROJECT_CONTEXT.md`, or focused docs whenever their contract changes. Add a short `CHANGELOG.md` entry that explains what changed and why.
3. Default to fast verification: changed-file formatting, affected tests, and `npm run verify:fast` for an application release. Do not run full quality, all tests, or browser/Hermes suites for every commit. Reuse successful checks for unchanged files; documentation-only follow-ups need no rebuild or redeployment.
4. Never leave dead exports, unused files, commented-out blocks, generated build output, prototypes, or temporary diagnostics in the repository.
5. When dependencies change or maintenance is requested, review `npm outdated` and `npm audit`; document any deliberate version hold in `docs/dependencies.md`, and remove packages when their last consumer disappears.
6. Keep changes inside the owning layer. A client concern must not leak into Worker services, and automation must use allow-listed API contracts rather than D1 access.
7. Do not deploy, mutate production data, rotate secrets, or send external notifications unless the current request explicitly authorizes it.

## Change protocol

When behavior changes, update its contract in the same task:

| Change                                                | Required companion updates                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Product workflow or invariant                         | `PROJECT_CONTEXT.md`, relevant product/design docs, `CURRENT_STATE.md`             |
| API route or response                                 | `docs/API.md`, tests, affected Hermes skills                                       |
| D1 schema                                             | numbered migration, schema documentation, tests, affected Hermes skills            |
| UI destination/navigation                             | `client/src/app/router.ts`, E2E tests, `PRODUCT.md` or `DESIGN.md` when applicable |
| Deployment/runtime                                    | `README.md`, `docs/release-checklist.md`, Worker Ops skill                         |
| Hermes workflow                                       | all affected skills, `.hermes.md`, and durable Hermes memory if globally true      |
| Completed milestone or new blocker                    | `CURRENT_STATE.md`                                                                 |
| Any user-visible, architectural, or dependency change | `CHANGELOG.md`                                                                     |

Active Hermes files:

- `docs/hermes-production.md`, `docs/hermes-contract.json`, and both `docs/hermes*-prompt-budget.json` files for the production lifecycle, ownership, recovery, SLO, and fixed-prompt gates.
- `~/.hermes/SOUL.md` and its checked-in source `docs/learning-compass-hermes-soul.md` for global identity and voice only. Project routing and source-of-truth rules belong in `.hermes.md`, `AGENTS.md`, and focused skills.
- `~/.hermes/skills/workflow/learning-compass-operating-system/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-self-evolution/SKILL.md`
- `~/.hermes/skills/workflow/recommendations-worker-ops/SKILL.md`
- `~/.hermes/skills/devops/cloudflare-ai-pipeline-operations/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-site-operator/SKILL.md`
- `~/.hermes/skills/workflow/agent-cli-delegation/SKILL.md`
- `~/.hermes/skills/workflow/youtube-playlist-verification/SKILL.md`
- `~/.hermes/skills/media/media-transcription-systems/SKILL.md`
- `~/.hermes/skills/taste-mapper/SKILL.md`
- `~/.hermes/skills/personal/taste-rec/SKILL.md`
- `~/.hermes/skills/learning-notes-extractor/SKILL.md`
- `~/.hermes/skills/lite-visual/SKILL.md`
- `~/.hermes/skills/arab-writer/SKILL.md`
- `~/.hermes/skills/productivity/rss-feed/SKILL.md`
- `~/.hermes/skills/notebooklm/SKILL.md`
- `~/.hermes/skills/learning-thread-curation/SKILL.md` → retired (renamed); active name is `~/.hermes/skills/learning/progressive-learning-curriculum/SKILL.md`
- `~/.hermes/skills/learning/learning-thread-authoring/SKILL.md`
- `~/.hermes/skills/learning/riyadh-salihin-al-badr/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-source-ingestion/SKILL.md`
- `~/.hermes/skills/learning/learning-hub-companion-authoring/SKILL.md`
- `~/.hermes/skills/learning/compass-recommendation-workflows/SKILL.md`
- `~/.hermes/skills/workflow/hermes-configuration-operations/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-feedback-corrections/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-foundation-curation/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-job-backlog-operations/SKILL.md`
- `~/.hermes/memories/MEMORY.md` and `USER.md` only for durable facts

Do not update archived Taste Mapper bundles, Gemini/Antigravity skill copies, or unrelated agent systems.

## Hermes memory and domain rules

Learning Compass Hermes permanently holds and enforces these project rules:

- **Tone & Format**: English-first responses for all tasks. Direct, casual, brutally honest tone. ZERO emojis by default. Default to text-only responses; no visual outputs/diagrams unless explicitly requested.
- **Action Principle**: Decisive execution over discussion ("Fix all that", "do it" = execute immediately).
- **Reading Companions**: Huawei TGR-W09 tablet (192.168.1.10). Every source companion is always Arabic and generates linked HTML + PDF from one canonical body. It must preserve every important point and the detail needed to replace consuming the source. Use premium source-specific editorial design, comfortable Arabic typography, an accessible non-monochrome color system when useful, and concept-level visual decisions. Reject heading/paragraph dumps, image-only atlases, repeated cards, mockups, dashboards, transcript padding, and decorative visuals. Zero visuals is valid only when no concept becomes clearer by being seen. Verify deterministically; never vision-inspect renders.
- **Mastered & Consumed Check**: ALWAYS verify `mastered` items and consumed recommendations before proposing/recommending content. NEVER recommend anything already read (e.g., _The 48 Laws of Power_, _Steal Like an Artist_, _Predictably Irrational_, _Thinking Fast and Slow_).
- **Islamic Content**: ZERO book-derived content (no books, audiobooks, explained books, or book-based lecture series). ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars.
- **Dopamine & Habit Neuroscience**: Fully mastered. HARD REJECT all "dopamine hits", "break habit loops", or "rewire your brain" content.
- **Death Content**: Theoretical/philosophical/existential angles only (TMT, Kierkegaard, Becker). HARD REJECT clinical/palliative content (e.g. BJ Miller).
- **Storytelling**: Real-life/business/brand framing only (Will Storr craft). HARD REJECT fiction/screenwriting framing.
- **Dark Patterns**: EXCLUDE Harry Brignull framing; follow Mathur/ProPublica deceptive patterns framing.
- **AI/AGI Curation Rules**: LOVES practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, and workflow integrations (e.g. using Obsidian with Claude Code, NotebookLM, Hermes agent workflows, t3dotgg-style pragmatic dev tools/frameworks). LOVES major AI hardware announcements & model releases from top labs (OpenAI, Anthropic, Google). HARD REJECT theoretical/academic AI papers on low-level model training math/internals (GRPO math, RL training details). Route basic intro guides for tools already used (e.g. OpenCode) to RSS feed only.
- **Feedback Policy**: NEVER auto-chain feedback processing into a new recommendation. Recommendations happen ONLY on explicit user request.
- **Mandatory Branch Connection**: Every recommended, captured, or queued item MUST have a valid, verified knowledge branch connected to it with persisted `branch` and `super_category`/domain. Synthetic rounds are retired. Branch pill badges must render across all views.

## External agent restriction

Never invoke Codex, Antigravity (AGY), or an equivalent external agent for code, prose, repository work, system changes, or Lite Visual assets unless Mahmood explicitly asks in the current request. Lite Visual has no image-agent exception: it is always code-only and Hermes owns the complete source, HTML, PDF, validation, publication, and verification path.

Hermes remains responsible for routing, canonical prose, Worker API execution, deterministic artifact verification, publication, and the end-of-turn improvement pass.

## Verification

Use the smallest verification set that covers the change:

- Documentation/instructions: `npm run verify:instructions`, changed-file formatting, and `git diff --check`; Hermes contract checks only when its instructions or tools change. No application deployment.
- Small code fix: affected test files and typecheck; build when client output changes. Do not run unrelated suites.
- Normal application deployment: `npm run deploy` owns lint, typecheck, one build, pre/post readiness, budget, and short live smoke checks. If those exact inputs already passed locally, use the documented Wrangler command plus live checks without repeating the gate.
- Schema migrations, security/storage boundaries, broad refactors, or explicit full verification: `npm run verify:release` (or `npm run deploy -- --full`) and relevant recovery prerequisites.
- Full D1/R2 backup and restore rehearsal are required for migrations or risky data/storage changes, not ordinary code-only releases.
- Commit and finish after relevant checks pass. Do not wait for CI or rerun unchanged checks unless requested or investigating a failure. Report what ran, without claiming skipped suites passed.

## Performance and process safety

- Avoid broad file reads, parallel dev servers, repeated full builds, and unbounded watchers.
- E2E owns its Wrangler/Workerd/Playwright lifecycle. Confirm no processes remain after interrupted tests.
- Report client bundle sizes when relevant; there is no fixed bundle-size cap.
- Lazy-load heavy graph and analytics libraries. Avoid effects that refetch or rerender indefinitely.
- Never deploy for D1/R2 data-only writes.
- Deploy code only from this directory with:

```bash
npx wrangler deploy --config wrangler.toml
```

## Completion

A task is complete only when implementation, tests, documentation, Hermes synchronization, and `CURRENT_STATE.md` agree. Report the outcome, verification, deployment status, and any genuine remaining blocker—briefly.
