# AGENTS.md — Learning Compass

This is Mahmood's private, single-user learning operating system. Work autonomously, keep responses concise, and leave the repository in a verified state.

## Start Every Task

1. Read `PROJECT_CONTEXT.md`, `CURRENT_STATE.md`, and the files directly relevant to the task.
2. Run `git status --short`. Existing changes belong to the user; never discard or rewrite unrelated work.
3. Inspect before editing. Prefer `rg`/`rg --files`; use `apply_patch` for manual edits.
4. Implement the smallest complete change. Do not create speculative abstractions or placeholder routes.

## Product Invariants

- Product: **Learning Compass**. Visual language: **Scholar's Instrument**.
- Loop: capture → curate → consume externally → reflect → notes → review → map update → resurface.
- D1 is canonical. R2 stores large artifacts. Obsidian is an archive/export for extracted notes only.
- Every capture, including Telegram and share-target input, enters the unlimited Inbox.
- Queue normally contains at most five queued/in-progress items; overflow requires an explicit override.
- Consumption happens at the real source and is tracked through learning sessions.
- Notes are structured, editable, searchable, and support per-block English/Egyptian-Arabic direction.
- Ratings of 7–10 create editable SRS drafts; approval is required before Review.
- Feedback processing never requests another recommendation automatically.
- Lite Visual creates one linked HTML+PDF R2 pair for normal sources. For books, it creates one linked pair per chapter with stable chapter metadata, mines the complete source into a checksum-backed evidence packet and coverage matrix, passes measured metadata/responsive/print validation and an 8/10 HTML quality gate, queues Notes Extractor once per HTML chapter, verifies each extraction to terminal state, and verifies the canonical source record. The PDF is the reading companion.
- All destinations in `client/src/destinations.ts` must resolve to a purposeful real view. No generic fallback screens or tabs that expose only infrastructure.

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
| UI destination/navigation | `client/src/destinations.ts`, E2E tests, `PRODUCT.md` or `DESIGN.md` when applicable |
| Deployment/runtime | `README.md`, `docs/release-checklist.md`, Worker Ops skill |
| Hermes workflow | all affected skills, `.hermes.md`, and durable Hermes memory if globally true |
| Completed milestone or new blocker | `CURRENT_STATE.md` |

Active Hermes files:

- `~/.hermes/skills/workflow/learning-compass-operating-system/SKILL.md`
- `~/.hermes/skills/workflow/recommendations-worker-ops/SKILL.md`
- `~/.hermes/skills/workflow/learning-compass-site-operator/SKILL.md`
- `~/.hermes/skills/taste-mapper/SKILL.md`
- `~/.hermes/skills/personal/taste-rec/SKILL.md`
- `~/.hermes/skills/taste-enhancer/SKILL.md`
- `~/.hermes/skills/learning-notes-extractor/SKILL.md`
- `~/.hermes/skills/lite-visual/SKILL.md`
- `~/.hermes/skills/visual-mind/SKILL.md`
- `~/.hermes/skills/productivity/rss-feed/SKILL.md`
- `~/.hermes/skills/notebooklm/SKILL.md`
- `~/.hermes/memories/MEMORY.md` and `USER.md` only for durable facts

Do not update archived Taste Mapper bundles, Gemini/Antigravity skill copies, or unrelated agent systems.

## Hermes Memory & Domain Rules

Learning Compass Hermes permanently holds and enforces these project rules:

- **Tone & Format**: English-first responses for all tasks. Direct, casual, brutally honest tone. ZERO emojis by default. Default to text-only responses; no visual outputs/diagrams unless explicitly requested.
- **Action Principle**: Decisive execution over discussion ("Fix all that", "do it" = execute immediately).
- **Reading Companions**: Huawei TGR-W09 tablet (192.168.1.10). Every visual companion generates a linked HTML + PDF pair. PDF typography must be heavy weight (500+ for print), big font size (12.5pt+ body), and dark contrast (#222 min).
- **Mastered & Consumed Check**: ALWAYS verify `mastered` items and consumed recommendations before proposing/recommending content. NEVER recommend anything already read (e.g., *The 48 Laws of Power*, *Steal Like an Artist*, *Predictably Irrational*, *Thinking Fast and Slow*).
- **Islamic Content**: ZERO book-derived content (no books, audiobooks, explained books, or book-based lecture series). ONLY pure original lectures/khutbahs/talks by trusted Sunni scholars.
- **Dopamine & Habit Neuroscience**: Fully mastered. HARD REJECT all "dopamine hits", "break habit loops", or "rewire your brain" content.
- **Death Content**: Theoretical/philosophical/existential angles only (TMT, Kierkegaard, Becker). HARD REJECT clinical/palliative content (e.g. BJ Miller).
- **Storytelling**: Real-life/business/brand framing only (Will Storr craft). HARD REJECT fiction/screenwriting framing.
- **Dark Patterns**: EXCLUDE Harry Brignull framing; follow Mathur/ProPublica deceptive patterns framing.
- **AI/AGI Curation Rules**: LOVES practical applied AI tools, agent workflows, local LLM pipelines, deterministic tool calling, and workflow integrations (e.g. using Obsidian with Claude Code, NotebookLM, Hermes agent workflows, t3dotgg-style pragmatic dev tools/frameworks). LOVES major AI hardware announcements & model releases from top labs (OpenAI, Anthropic, Google). HARD REJECT theoretical/academic AI papers on low-level model training math/internals (GRPO math, RL training details). Route basic intro guides for tools already used (e.g. OpenCode) to RSS feed only.
- **Feedback Policy**: NEVER auto-chain feedback processing into a new recommendation. Recommendations happen ONLY on explicit user request.

## Hermes & AGY Inter-Operability

Antigravity (AGY) understands and handles all Hermes capabilities and skills:

1. **Hermes CLI Execution**: AGY can invoke `hermes chat -q "..."` or `hermes -z "..."` directly on behalf of the user.
2. **Worker API & Job Delegation**: Hermes can call the Worker API (`/agent/request`, `/capture/:id/triage`), check/claim/process `agent_jobs`, and trigger only Learning Compass workflows.
3. **Skill Awareness**: `learning-compass-operating-system` routes every request before `taste-rec`, `taste-mapper`, `taste-enhancer`, `learning-notes-extractor`, `lite-visual`, `notebooklm`, `rss-feed`, or `recommendations-worker-ops` runs.

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
