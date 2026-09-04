# Native tool adapter

The default-profile `compass-native` plugin exposes `compass_read(path, field?)`, `compass_capabilities(q, domain?, method?)`, and `compass_mutate(request)` through the existing first-party client. The request object is exactly the guarded mutation JSON described in SKILL.md. No new Worker routes or state store exist. Keep the same read-before-write and one-call ledger across native and terminal calls.

Responses wrap the client's result in `data`, preserving exit status and the full receipt. `ok` at the process level is not verification: inspect `data.verified`, receipt, committed/unverified flags, and terminal job state. Output-limit and timeout errors never authorize replaying a write. Use a narrower read only, not a repeated mutation.

The plugin's extraction, PDF evidence, NotebookLM, and Exa tools belong to their existing specialists. Do not load all specialists for a simple site read. New tools become model-visible in a fresh Hermes session; an already-running session uses the CLI fallback.

Implementation and replay tests: `/home/mahmud/.hermes/worktrees/native-compass-tools/integrations/hermes-compass`. Installed runtime: `/home/mahmud/.hermes/plugins/compass-native`.

Known registry omission: the improvement open/complete capabilities declare no canonical verification path, and `/agent/request` rejects a supplied list readback with HTTP 409 `verification path must match the declared canonical readback`. For these exact analytics routes only, the existing explicit-registry-omission path uses the first-party direct request with stable mutation ID, followed by one uncached `/analytics/hermes/improvements` read and exact-ID match. Never generalize this exception to ordinary product writes. The native mutation tool deliberately does not bypass the guard.
