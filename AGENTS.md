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
- Ratings of 8–10 create editable SRS drafts; approval is required before Review.
- Feedback processing never requests another recommendation automatically.
- Lite Visual creates one linked HTML+PDF R2 pair. Queue Notes Extractor once from the HTML artifact; the PDF is the reading companion.
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

- `~/.hermes/skills/workflow/recommendations-worker-ops/SKILL.md`
- `~/.hermes/skills/taste-mapper/SKILL.md`
- `~/.hermes/skills/personal/taste-rec/SKILL.md`
- `~/.hermes/skills/taste-enhancer/SKILL.md`
- `~/.hermes/skills/learning-notes-extractor/SKILL.md`
- `~/.hermes/skills/lite-visual/SKILL.md`
- `~/.hermes/skills/lite-study-guides/SKILL.md` (compatibility alias)
- `~/.hermes/memories/MEMORY.md` and `USER.md` only for durable facts

Do not update archived Taste Mapper bundles, Gemini/Antigravity skill copies, or unrelated agent systems.

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
