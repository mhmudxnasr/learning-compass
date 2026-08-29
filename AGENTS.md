# AGENTS.md — Learning Compass

This is Mahmood's private, single-user learning operating system. Work autonomously, keep responses concise, and leave the repository in a verified state.

## Start Every Task

1. Read `PROJECT_CONTEXT.md`, `CURRENT_STATE.md`, and the files directly relevant to the task.
2. Run `git status --short`. Existing changes belong to the user; never discard or rewrite unrelated work.
3. Inspect before editing. Prefer `rg`/`rg --files`; use `apply_patch` for manual edits.
4. Implement the smallest complete change. Do not create speculative abstractions or placeholder routes.

## Product Invariants

- Product: **Learning Compass**. Visual language: **Continuum** — a soft graphite knowledge console with a labeled persistent desktop root rail, restrained violet working signals, grouped workspace modes, a working canvas, and an optional contextual inspector. Home leads with one lesson turn per active Thread, keeps the active Queue source visible, and exposes passive Original/HTML/PDF/NotebookLM links in place. Arabic and RTL treatment use clear type and comfortable line height without decorative religious motifs. On mobile, the rail becomes a five-item bottom dock with inline compact, equal-width mode controls and wrapping subordinate filters. Library begins with one continuous Books room before Triage/Queue; Learn contains finite Threads and Practice. Books integrates the reading desk, My books, and evergreen three-book Canon fields without a Shelf/Canon tab split; Canon remains relationship data and never becomes a sixth root or a second book collection.
- Loop: capture → curate → consume externally → reflect → notes → review → map update → resurface.
- D1 is canonical. R2 stores large artifacts. Obsidian is an archive/export for extracted non-book notes only; book and book-chapter notes remain in Learning Compass.
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
- Lite Visual creates one atomically published HTML+PDF R2 pair from one canonical Arabic semantic HTML article; books create one pair per chapter with stable metadata. `extract_source.py` is the sole acquisition entry point: hash-verified cache, the accepted hash-bound Riyadh transcript receipt, Mozilla Readability, Playwright fallback, YouTube captions/yt-dlp, no-caption-only audio transcription, PyMuPDF/Tesseract, EPUB spine, Pandoc, or direct UTF-8; authoring stops unless its structured receipt is complete. The `riyadh-salihin-local-transcript/v1` lane must verify the untouched transcript hash, audio hash, receipt/chunk quality, monotonic segments, canonical media identity, and every repeated-passage family before any explicit timestamp-label cleanup. YouTube audio transcription is permitted only after a complete inventory positively confirms zero manual and zero generated caption tracks; lookup failures and unusable published tracks block audio. Read Intent and Frontend Design before authoring, then derive the artifact's typography, color, rhythm, and restrained signature from the source. Only semantic HTML, source-specific CSS, native structures, equations, and rare justified inline SVG are allowed. Raster/generated images, image agents, Visual Mind delegation, preset themes/palettes/layouts, scripts, widgets, and mandatory pauses are forbidden. Gapless checksum-backed source scopes of at most 120 words, exactly one matching reviewed claim and non-appendix authored anchor per scope, a visible complete-source edition with every normalized source word once and in order, and deterministic RTL, accessibility, responsive, print-media text geometry, A4, pagination, and source/HTML/PDF parity checks produce a hash-bound v6 receipt. Batch publication reruns the signed aggregate audit, binds each artifact to its exact manifest source, immutable workflow run, durable job, and current pair, and resumes only from matching canonical state. Every workflow checkpoint requires exact evidence; generic single-file upload is invalid, the pair publishes together, and the source record is verified. There is no subjective QA score and Notes Extractor never starts automatically.
- Lite Visual v6 receipts are HMAC-attested. Batch replacement binds the exact ordered target set, manifest, signed aggregate audit, source, immutable workflow run, active durable job, mandatory R2 object verification, and current-pair supersession lineage. Replacements and their lease-free `awaiting_activation` jobs remain hidden in a staged corpus until one guarded D1 transaction activates every expected pair and completes those exact jobs; abort discards only staging, and failure before activation leaves the prior corpus fully visible.
- The route registry in `client/src/app/router.ts` exposes five root destinations and 12 grouped modes. Library → Archive contains completed and excluded sources only; All sources, Reading journal, and Collections are retired product surfaces. Every remaining root and mode/focus surface must resolve to a real product surface; no generic fallback screens or tabs may expose only infrastructure.

## Architecture Boundaries

- `src/`: Hono Cloudflare Worker, API routes, domain logic, and scheduled work.
- `client/`: Vite + Preact + TypeScript application.
- `schema.sql`: legacy/base schema.
- `migrations/`: ordered, idempotent production migrations.
- `tests/unit/`: domain and API contract tests.
- `tests/e2e/`: route, shell, and responsive acceptance tests.
- Do not restore the removed template-string frontend, `schema_v2.sql`, generated `dist/`, backup bundles, or obsolete one-off scripts.
- Preserve existing REST compatibility unless a migration and every active Hermes consumer are updated together.

## Change Protocol

When behavior changes, update its contract in the same task:

| Change | Required companion updates |
|---|---|
| Product workflow or invariant | `PROJECT_CONTEXT.md`, relevant product/design docs, `CURRENT_STATE.md` |
| API route or response | `docs/API.md`, tests, affected Hermes skills |
| D1 schema | numbered migration, schema documentation, tests, affected Hermes skills |
| UI destination/navigation | `client/src/app/router.ts`, E2E tests, `PRODUCT.md` or `DESIGN.md` when applicable |
| Deployment/runtime | `README.md`, `docs/release-checklist.md`, Worker Ops skill |
| Hermes workflow | all affected skills, `.hermes.md`, and durable Hermes memory if globally true |
| Completed milestone or new blocker | `CURRENT_STATE.md` |

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

## Hermes Memory & Domain Rules

Learning Compass Hermes permanently holds and enforces these project rules:

- **Tone & Format**: English-first responses for all tasks. Direct, casual, brutally honest tone. ZERO emojis by default. Default to text-only responses; no visual outputs/diagrams unless explicitly requested.
- **Action Principle**: Decisive execution over discussion ("Fix all that", "do it" = execute immediately).
- **Reading Companions**: Huawei TGR-W09 tablet (192.168.1.10). Every source companion is always Arabic and generates linked HTML + PDF from one canonical body. It must preserve every important point and the detail needed to replace consuming the source. Use premium source-specific editorial design, comfortable Arabic typography, an accessible non-monochrome color system when useful, and concept-level visual decisions. Reject heading/paragraph dumps, image-only atlases, repeated cards, mockups, dashboards, transcript padding, and decorative visuals. Zero visuals is valid only when no concept becomes clearer by being seen. Verify deterministically; never vision-inspect renders.
- **Mastered & Consumed Check**: ALWAYS verify `mastered` items and consumed recommendations before proposing/recommending content. NEVER recommend anything already read (e.g., *The 48 Laws of Power*, *Steal Like an Artist*, *Predictably Irrational*, *Thinking Fast and Slow*).
- **Islamic Content**: ZERO book-derived content (no books, audiobooks, explained books, or book-based lecture series). ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars.
- **Dopamine & Habit Neuroscience**: Fully mastered. HARD REJECT all "dopamine hits", "break habit loops", or "rewire your brain" content.
- **Death Content**: Theoretical/philosophical/existential angles only (TMT, Kierkegaard, Becker). HARD REJECT clinical/palliative content (e.g. BJ Miller).
- **Storytelling**: Real-life/business/brand framing only (Will Storr craft). HARD REJECT fiction/screenwriting framing.
- **Dark Patterns**: EXCLUDE Harry Brignull framing; follow Mathur/ProPublica deceptive patterns framing.
- **AI/AGI Curation Rules**: LOVES practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, and workflow integrations (e.g. using Obsidian with Claude Code, NotebookLM, Hermes agent workflows, t3dotgg-style pragmatic dev tools/frameworks). LOVES major AI hardware announcements & model releases from top labs (OpenAI, Anthropic, Google). HARD REJECT theoretical/academic AI papers on low-level model training math/internals (GRPO math, RL training details). Route basic intro guides for tools already used (e.g. OpenCode) to RSS feed only.
- **Feedback Policy**: NEVER auto-chain feedback processing into a new recommendation. Recommendations happen ONLY on explicit user request.
- **Mandatory Branch Connection**: Every recommended, captured, or queued item MUST have a valid, verified knowledge branch connected to it with persisted `branch` and `super_category`/domain. Synthetic rounds are retired. Branch pill badges must render across all views.

## External Agent Restriction

Never invoke Codex, Antigravity (AGY), or an equivalent external agent for code, prose, repository work, system changes, or Lite Visual assets unless Mahmood explicitly asks in the current request. Lite Visual has no image-agent exception: it is always code-only and Hermes owns the complete source, HTML, PDF, validation, publication, and verification path.

Hermes remains responsible for routing, canonical prose, Worker API execution, deterministic artifact verification, publication, and the end-of-turn improvement pass.

## Verification

Run proportionate checks after each change:

```bash
npm test
npm run build
npm run test:e2e
git diff --check
```

- API/schema/domain changes: unit tests + typecheck at minimum.
- Client behavior/navigation changes: build + E2E.
- Release work: full suite and live smoke checks from `docs/release-checklist.md`.
- Never claim a test, migration, synchronization, or deployment succeeded without observing it.

## Performance and Process Safety

- Avoid broad file reads, parallel dev servers, repeated full builds, and unbounded watchers.
- E2E owns its Wrangler/Workerd/Playwright lifecycle. Confirm no processes remain after interrupted tests.
- Keep the base client bundle at or below 150 KB gzip, excluding lazy graph/vendor chunks.
- Lazy-load heavy graph and analytics libraries. Avoid effects that refetch or rerender indefinitely.
- Never deploy for D1/R2 data-only writes.
- Deploy code only from this directory with:

```bash
npx wrangler deploy --config wrangler.toml
```

## Completion

A task is complete only when implementation, tests, documentation, Hermes synchronization, and `CURRENT_STATE.md` agree. Report the outcome, verification, deployment status, and any genuine remaining blocker—briefly.
