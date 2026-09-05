---
name: learning-compass
description: Operate the recommendations-worker Learning Compass product through its verified live API. Use whenever the user mentions the recommendation worker, Learning Compass, Queue, Inbox, Threads, Learn, lessons, notes, recall, branches, sources, artifacts, Compass picks, settings, jobs, or production deployment.
---

# Learning Compass

This is a project adapter, not a second source of workflow truth.

## Start

1. From the current checkout, read `AGENTS.md`, `PROJECT_CONTEXT.md`, the `Handoff` section of `CURRENT_STATE.md`, and directly relevant source files.
2. For repository code or documentation, use the contribution map and focused checks in `README.md`. An installed Hermes runtime is not required for this work.
3. For live site operations, read `/home/mahmud/.hermes/skills/workflow/learning-compass-operating-system/SKILL.md` and `/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/SKILL.md`.
4. Discover the exact live operation from `GET /agent/capabilities`; never infer a mutation route from this adapter.

## Contract

- Treat D1-backed live API responses as current state. Do not scrape the UI, query D1 directly, or rely on stale files for user data.
- Read the exact target before writing. Send mutations through guarded `POST /agent/request` with a unique idempotency key, required confirmation/precondition, and declared canonical readback.
- Preserve Queue limits, explicit recommendation intent, branch linkage, learner-owned evidence, and source-versus-mastery boundaries.
- Verify every write by rereading the canonical target. A successful status code alone is not completion.
- For repository changes, follow the test and documentation gates in `AGENTS.md`; never overwrite unrelated worktree changes.

## Learn Domain

When the request concerns Threads, levels, lessons, projects, sources, progression, or evidence, load the project skill `learning-thread-authoring` before acting.

Keep target identities, mutation/readback evidence, and blockers in the operation receipt. Explain the verified outcome naturally; include identifiers when they help inspection.
