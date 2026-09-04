# Manager release fixtures

These are the existing deterministic Learning Compass manager fixtures, recovered from the preserved staged baseline in `hermes-reply-evals-20260904`. The newer uncommitted reply-evaluation work remains in its original worktree.

The application repository owns this copy so an upstream Hermes update cannot remove a mandatory release gate. Run `npm run verify:manager`; it uses the installed native Hermes runtime and its canonical isolated runner, makes no model request, and requires a JUnit report with at least 38 passing tests and no skips. The additional test copies, hashes, and loads the actual production `~/AGENTS.md` in a temporary workspace.

The harness retains its optional model-evaluation implementation for provenance. The release command executes deterministic tests only. Historical real-model results remain in the original Hermes evaluation directory and are not regraded.
