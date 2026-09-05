# Manager release fixtures

These are the existing deterministic Learning Compass manager fixtures, recovered from the preserved staged baseline in `hermes-reply-evals-20260904`. The newer uncommitted reply-evaluation work remains in its original worktree.

The application repository owns this copy so an upstream Hermes update cannot remove a mandatory release gate. Run `npm run verify:manager`; it uses the installed native Hermes runtime and its canonical isolated runner, makes no model request, and requires a JUnit report with at least 38 passing tests and no skips. The additional test copies, hashes, and loads the actual production `~/AGENTS.md` in a temporary workspace.

The release command executes deterministic tests only. The model-evaluation runner additionally tests real Hermes trajectories against a loopback Worker fixture. The slate includes Thread inventories, typos, Arabic, empty results, resume questions, displayed-order follow-ups, corrected targets, and ambiguity alongside the existing mutation/recovery cases. Grading checks live-read selection, grounded answers, and forbidden side effects; it does not require one exact answer wording.

Use the installed production runtime for model trials (the development `.venv` can have different dependencies):

```bash
PYTHONPATH="$HOME/.hermes/hermes-agent" "$HOME/.hermes/hermes-agent/venv/bin/python" tests/hermes-manager/evals/manager_routing/harness.py run --model gpt-6-astra --provider openai-codex --case threads-overview,thread-followup --output /tmp/compass-routing.json
```

Omit `--case` to run the complete slate. `--reasoning-effort low|medium|high` supports controlled comparisons without changing the installed configuration. The default retains Hermes's reasoning configuration. Run variants separately and compare correctness, calls, and elapsed time; one small trial does not establish a general speed ranking.

The fixture runner exposes skills and the guarded terminal fallback, not the production platform's complete tool surface. Complement it with read-only native `compass_read` dispatch and the offline Telegram prompt/tool contract. Only the model provider is contacted externally; Compass operations are served by a loopback fixture and arbitrary terminal commands are blocked. Profile copies dereference valid skill links into isolated files and skip dangling retired links. Historical real-model results remain in the original Hermes evaluation directory and are not regraded.
