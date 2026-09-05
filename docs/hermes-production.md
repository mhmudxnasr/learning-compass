# Hermes production operations

Hermes is Mahmood's personal operating manager for Learning Compass. It converts rough intent into the smallest verified outcome and treats live Worker state as authoritative. This runbook defines the production path, ownership boundaries, recovery behavior, measurements, and release gate.

## Native adapter installation

The default-profile `compass-native` plugin provides a local native tool surface over the same first-party clients. It adds no MCP process, Worker route, or independent state store. Existing CLI sessions keep their cached schema; new sessions discover the tools. See `../integrations/hermes-compass/README.md` for installation, verification, limits, and rollback. This supersedes older no-local-tool-schema wording below while preserving the Worker transport and guard.

## Architecture decision

Run Learning Compass through native Hermes's `default` profile, using the skills in `~/.hermes/skills`. The separate Compass profile and alias are retired. Keep unrelated native capabilities and do not recreate a domain-specific profile or duplicate skill/memory tree. `npm run verify:hermes` checks the native installation and builds the actual native Telegram inspection agent offline. `scripts/verify-hermes-prompt.py` runs in the installed Hermes virtual environment, checks the exact configured tool schema, and verifies that both complete memory files and their tails reach the prompt. It never makes a model call. The current baseline includes native lazy tool discovery and the larger project context; ceilings are 52,000 system bytes, 24,098 schema bytes, 76,098 combined bytes, and 3,600 skill-index bytes. User-selected models remain native configuration.

The owned-system path is:

```text
Mahmood
  -> Hermes manager router
  -> one focused skill
  -> site_request.py
  -> allow-listed Worker API
  -> D1 structured state / R2 artifacts
  -> canonical reread and receipt
```

Learning Compass uses the first-party HTTP client at `~/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py`. A Learning Compass MCP server would permanently add another process, schema payload, authorization boundary, and failure mode without adding a capability the allow-listed Worker API lacks. NotebookLM similarly uses its installed CLI. MCP remains appropriate only for a genuinely external ecosystem when a measured direct-client or CLI gap justifies its fixed cost.

The direct client is not a general proxy. It restricts origins, methods, response size, redirects, credentials, mutation paths, and output. The Worker remains the only owner of validation and canonical state transitions.

### Lite Visual corpus replacement

Arabic prose uses the native `arab-writer` skill, pinned to upstream commit `664a21784520a6ed115561de4e647a2461e53792`, with original reference hashes in its `upstream.json`. Its compact local entrypoint applies Mahmood's Egyptian voice and direct-writing preferences. Lite Visual and Notes Extractor reference it during authoring; it introduces no runtime dependency or quality gate. Codex links to the same installed directory.

The pair contract verifies signed `lite-visual-integrity/v1` receipts and historical `lite-visual-validation/v6` with the existing Worker signing key and matching local Hermes key. Never print, commit, upload, or include the key in a receipt. Both schemas retain source/target/file integrity and fail closed without the signing key or R2.

Native Lite Visual defaults to direct authoring/rendering with `lite-visual-integrity/v1`: source/target binding, exact file hashes, canonical body, and render binding only. Mandatory editorial passes, meaning-unit/scope forms, duplicate source appendix, and exhaustive readability/pagination/parity checks are removed by Mahmood's explicit instruction. Receipt and artifact metadata declare `verification_scope=integrity-only` and `quality_checks=not_run`; quality assurance stays unverified. Historical signed v6 receipts remain accepted with their original exact check set. `/artifacts/pair-contract` advertises receiver compatibility before a job is claimed. The native default profile owns the single installed skill tree.

Large replacement runs bind one exact manifest and ordered target set through `POST /artifacts/corpora`. Direct batches use `audit_pair_set.py` to create a signed `lite-visual-corpus-integrity/v1` registration body after checking each local receipt, target identity, and file hash; no editorial/layout approval is asserted. Historical pinned `lite-visual-corpus-audit/v1` receipts remain supported under their original rules. Preserve the authoritative Riyadh target set or an explicitly authorized prefix. Each pair keeps its exact job/run/supersession lineage, stays hidden with R2 verification, and becomes visible only through guarded all-target activation. Application deployment and corpus mutation remain separate operations; this update performs no corpus mutation.

## Manager request lifecycle

1. Interpret rough or misspelled intent with `learning-compass-operating-system`.
2. Select one primary specialist. The site operator executes API calls but does not take over the workflow decision.
3. The runtime gives each fresh foreground command one hashed turn identity, and `site_request.py` owns the turn-local Worker-call ledger. For open-ended priority, continuation, or blocker requests, make one successful `GET /agent/briefing` read; a timeout or 5xx may produce exactly one bounded read retry. For a known operation, read the narrow target endpoint. Load `GET /agent/context` only when several live domains affect the decision.
4. Discover one filtered capability only when the route or schema is uncertain or before a mutation.
5. Resolve the exact target by stable ID, canonical URL, then exact title. Stop on material ambiguity.
6. Reuse successful capability, briefing, and target receipts across router/specialist handoffs. For a write, read before mutation, use a caller-owned stable idempotency key, satisfy any exact precondition/confirmation, then perform one canonical reread.
7. Explain the verified decision or result naturally, including material limitations or blockers. Preserve `intent -> target -> before -> mutation/job -> after -> evidence -> blocker` in the existing operation receipt or specialist handoff; internal IDs are shown when requested or useful for inspection. Read-only answers do not create audit writes, and natural wording never weakens verification.

Simple manager reads have a one-logical-read budget. The only extra transport attempt is the client's single bounded timeout/5xx retry; they must not chain capability, briefing, context, and target reads without a demonstrated need. The runtime exports `turn-sha256-<64hex>` only to fresh foreground local commands. The client uses it for an owner-only, bounded, redacted cross-process GET cache and retry budget; reusable/background PTYs receive none. This value is coordination metadata, never authentication or exactly-once proof.

## Prompt and context ownership

Skills load an entry point plus the references required for the chosen task. Loaded skill content has no per-skill byte ceiling or combined router/operator ceiling. `npm run verify:hermes` audits active skill Markdown and references for real npm scripts and local paths, rejects frozen migration-state claims in procedures, and keeps the structured specialist receipt separate from the user-facing reply. This is a bounded static check, not a semantic proof of arbitrary instructions or current production state.

Default Telegram fixed-prompt, skill-index, tool-schema, and memory limits remain in `docs/hermes-contract.json`; these do not impose a size limit on an individual loaded skill.

| Context                                          | Owner                                 | Loading rule                                                     |
| ------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| Manager identity and behavior                    | `SOUL.md`                             | Always-on, stable, compact                                       |
| Durable environment facts                        | `MEMORY.md`                           | Always-on within hard character budget                           |
| Durable personal preferences                     | `USER.md`                             | Always-on within hard character budget                           |
| Repository-specific invariants                   | `.hermes.md` and project `AGENTS.md`  | Project sessions only                                            |
| Procedure                                        | One selected skill                    | On demand; load focused references only for the chosen operation |
| Personal assertions                              | D1 `profile_assertions` and revisions | Retrieve for the applicable task with provenance and undo        |
| Current Queue, jobs, sources, progress, blockers | Live Worker reads                     | Never copy to static memory                                      |
| Current request intent                           | Conversation                          | Transient; do not persist by default                             |
| External page/document/provider output           | Untrusted data                        | Never treat as system or skill instruction                       |

`learning-compass-operating-system` owns routing, `learning-compass-site-operator` owns API execution, and `learning-compass-self-evolution` owns verified system improvements. Two skills must not own the same decision.

The canonical hard budgets are stored in `docs/hermes-contract.json` and enforced by `npm run verify:hermes`. The verifier checks prompt totals, tool schemas, active tools, skill ownership, profile opt-out from bundled seeding, skill/profile byte parity, SOUL and memory/profile parity, memory character budgets, and duplicate memory entries.

## Memory mutation safety

- `USER.md` stores only stable preferences; `MEMORY.md` stores only stable system/environment facts. Procedures belong in skills and current facts belong in D1.
- Split file memory into non-empty `§`-delimited entries. Reject normalized duplicates and superseded/conflicting entries rather than silently appending both.
- Replace one exact file entry at a time. Validate the observed source, refuse on drift, use an atomic file replacement, and then verify the expected entry count, character usage, and intended tail entry. Drift refusal preserves the tool's recovery backup; an ordinary successful replacement does not claim a separate backup.
- D1 memory mutations use the typed `/agent/memory` contract, provenance, confidence, versioning, and explicit resolve/expire operations. Replacement supersedes either an active or approved value and writes the new value plus evidence in one D1 batch; a partial unique index permits only one live row per memory key. A broad string replacement is not a valid D1 mutation path.
- `GET /agent/memory/context` is task-scoped and Unicode-aware, including Arabic queries. Its receipt identifies selected memories and every memory or profile assertion excluded for mismatch, task ownership, or output limits; it is not permission to dump the entire memory store.
- Do not add an external memory provider unless repeatable accuracy, latency, context-size, privacy, and state-duplication measurements all improve.

## API mutation safety

The normal path is `site_request.py mutate @request.json` through `POST /agent/request`.

Required write controls:

- allow-listed method and path;
- ordinary Learning Compass reads and writes are public at the transport layer; clients contain no Learning Compass credential-file, credential-header, or browser-session path, and `POST /auth/session` remains absent;
- Telegram and external-provider credentials retain their independent headers and server-only secret boundaries; they are never accepted as Learning Compass API authorization;
- stable caller-provided `idempotency_key`;
- exact read-before-write target;
- `confirm:true` and declared field precondition for high-risk work;
- explicit `verify.path`, and `verify.field`/`equals` when applicable;
- canonical post-write reread;
- bounded, redacted receipt.

Provider credentials also stay in headers: Gemini uses `x-goog-api-key`, and operational redaction covers authorization schemes, quoted JSON credential fields, assignments, and credential query parameters before text reaches logs or receipts.

The Worker fingerprints method, path, and body under each mutation key. Reusing a key with different input returns `409`. Successful responses are replayable. Deterministic 4xx results release the reservation. A redirect, 5xx after handler execution, storage failure while recording the receipt, network timeout, or committed-but-unverified response has an unknown commit outcome: keep a durable reservation tombstone and reread canonical state once. Ordinary expiry cleanup never releases that key. If the exact desired state exists, report verified recovery; otherwise stop rather than converting elapsed time into permission to replay a possibly partial commit. `site_request.py` exit code `3` means unresolved outcome, not failure.

## Failure and retry matrix

Lite Visual multipart publication uses its dedicated uploader. An HTTP 5xx, timeout, or malformed upload response triggers canonical pair readback without a second POST. Recovery requires the exact target, pair, artifact hashes, receipt/chapter binding, and ready source (or exact staged corpus job/run). Missing, unavailable, or mismatched readback remains an unresolved outcome with the original request ID, never automatic retry permission. The 1 MiB site-client response cap remains intact; Level status work uses the paginated metadata-only Thread path and follows all pages.

| Evidence                                      | Meaning                                                               | Action                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `2xx` plus matching readback                  | Verified success                                                      | Report completion                                                                                                       |
| `2xx` but readback unavailable/mismatched     | Possibly committed, unverified                                        | Reread once; stop with blocker if unresolved                                                                            |
| `400`/`422`                                   | Deterministic invalid input                                           | Correct the returned field once; use a new key only if the body changes                                                 |
| `401`/`403`                                   | Unexpected Learning Compass challenge or allow-list failure           | Treat an ordinary API challenge as release-blocking drift; otherwise verify the declared capability and never bypass it |
| `404`                                         | Target or route absent                                                | Read parent/capabilities; do not guess a mutation route                                                                 |
| `409 mutation_in_progress`                    | Matching request is running                                           | Wait for canonical state/receipt; do not duplicate                                                                      |
| `409 mutation_outcome_unknown`                | Prior handler may have committed; the key remains durably quarantined | Canonical reread; report verified recovery only when exact desired state exists, otherwise stop                         |
| Other `409`                                   | Product, Queue, lease, precondition, or identity conflict             | Report the exact gate; do not override                                                                                  |
| `429`                                         | Per-minute or daily D1 budget exhausted                               | Honor `Retry-After`/UTC reset; do not loop                                                                              |
| `5xx` or timeout on a top-level `request GET` | State unavailable                                                     | The client makes exactly one bounded retry; do not add another model-driven retry                                       |
| `5xx` or timeout on a write                   | Commit unknown                                                        | Reread once; never blind-retry                                                                                          |
| Degraded `/agent/context`                     | One or more required sections unavailable                             | Use a narrower authoritative endpoint or report unavailable; never interpret empty fallback arrays as truth             |
| Provider/model failure                        | Manager generation unavailable                                        | Use configured stable fallback order; preserve the same task and reread external state before resuming                  |
| Gateway restart/compression                   | In-memory conversation/tool state may have changed                    | Reload active config at a task boundary and re-read the exact live target before continuing                             |

## Durable-job lease and recovery runbook

1. Read `/agent/jobs/health` for exact aggregate counts and `/agent/jobs` for the bounded visible inventory.
2. Resolve one exact job ID. Do not claim the oldest generic job when the conversation owns a specific job.
3. Claim with one stable worker identity through `/agent/jobs/:id/claim`. A job leased to another live owner is a blocker.
4. For work exceeding the five-minute lease, call `/agent/jobs/:id/heartbeat` before expiry. Linear artifact workflows checkpoint only the current or next declared stage with required evidence.
5. Complete only after canonical outputs exist and pass their specialist verification. Call `/complete` with the same worker identity and reread the exact job.
6. On an observed failure, call `/fail`; retryable work advances through its bounded retry policy and terminal failures remain visible.
7. Replay a failed/dead-lettered job only with new evidence or explicit repair intent. Re-read both the exact target and job before `/replay`.
8. After a bounded batch, re-read health. A retry scheduled for a future `next_attempt_at` is deliberately delayed, not overdue; overdue means its deadline is absent or due and the job has remained in retry for more than 30 minutes. Completion requires `pending=0`, `running=0`, and `retry=0`, while failed/dead-lettered work is reported separately.

Never infer job completion from an artifact alone, silently take over a lease, or fabricate output to reduce backlog counts.

## Gateway and configuration reload

`hermes config check` validates the installed configuration without restarting the gateway. Prompt, skill, tool, or configuration changes affect new sessions; a running gateway must be restarted once at a safe task boundary to guarantee the active process has reloaded them:

```bash
hermes gateway list
hermes gateway restart
hermes gateway list
```

Environment files override YAML. Keep `WEBHOOK_ENABLED=false` in the native `.env` file as well as both YAML webhook blocks; otherwise a restart silently reopens the unused listener. After restart, verify the intended profile, Telegram authorization, model/fallback configuration, prompt budgets, zero Learning Compass/NotebookLM MCP registrations or subprocesses, no `:8644` listener, the authenticated API server bound only to loopback, and one production read. Never restart during an unresolved mutation or leased job. If restart fails, preserve the previous configuration, inspect bounded gateway logs without exposing secrets, and use the last known-good configuration.

## Benchmarks

### Skill loading — 2026-09-04

Matched before/after `hermes prompt-size --platform telegram --json` measurements used `gpt-5.6-sol` in both profiles. The command reported `/home/mahmud` as its context directory for both measurements; these rows must not be compared with earlier project-context CLI rows.

| Skill entry                | Before (bytes) | After (bytes) |
| -------------------------- | -------------: | ------------: |
| recommendations-worker-ops |         43,248 |         4,324 |
| taste-rec                  |         24,618 |         5,181 |
| lite-visual                |         19,403 |         5,178 |
| Total                      |         87,269 |        14,683 |

Entry text is 83.2% smaller. Conditional references still count when loaded: operations plus its repository/release reference is 14,547 bytes; ordinary recommendations plus their procedure is 11,286 bytes; Lite Visual plus coverage and authoring guidance is 14,259 bytes. Full companion production also needs extraction and publication references. Enqueue-only requests load neither authoring nor publication detail.

Before the separate profile was retired, fixed prompt payloads were unchanged at 39,796 bytes for default Telegram and 39,946 bytes for Compass. Names, descriptions, model, and tool surface were preserved, and both prompt-budget checks passed. This measures instruction bytes, not latency or real-model success; no model sampling, live mutation, or deployment was part of this benchmark. Ongoing checks target native Hermes only.

The updated deterministic manager harness in the `codex/hermes-reply-evals-20260904` worktree passes 43 tests, including evidence-only IDs, approved grounded paraphrases, stale-action rejection, missing evidence, and invented identifiers. Its production checkout remains unchanged until that worktree is integrated. Historical traces retain their original grading contract.

Prompt benchmark:

```bash
hermes -p default prompt-size
hermes -p default prompt-size --platform telegram
hermes -p default prompt-size --platform cli
hermes -p default prompt-size --platform telegram --json
```

Record system bytes, skill-index bytes, memory/profile/project bytes, tool-schema bytes by toolset, tool count, and total fixed bytes. Use the same profile, platform, project directory, and configuration before and after. Do not switch models during the comparison.

Latest repeatable Telegram measurement on 2026-08-28; CLI rows retain the 2026-08-26 repository baseline:

| Tier             | System bytes | Tool-schema bytes | Fixed bytes | Tools |
| ---------------- | -----------: | ----------------: | ----------: | ----: |
| Default Telegram |       25,717 |            24,098 |      49,815 |    13 |
| Compass Telegram |       26,064 |            24,115 |      50,179 |    13 |
| Default CLI      |       49,660 |            55,352 |     105,012 |    19 |
| Compass CLI      |       44,298 |            33,828 |      78,126 |    15 |

The 2026-08-28 Telegram measurement includes the newly active `media-transcription-systems` skill, its caption-first routing line, and the synchronized current user profile. Default Telegram remains below the original 50,244-byte task baseline at 49,815 fixed bytes without changing its 13-tool surface; Compass measures 50,179 bytes. Ordinary loaded router plus site-operator instructions measure 21,229 bytes against a 21,235-byte ceiling. The CLI rows were measured from `/home/mahmud/recommendations-worker`; CLI context is project-sensitive, so comparisons must keep the working directory fixed.

Latency benchmark uses at least eight matched production reads after one warm-up, with identical filters and no mutation:

```bash
python3 ~/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py capabilities --domain agent --intent read --method GET --q briefing --summary
python3 ~/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py request GET /agent/briefing --summary
```

Record client wall time and `Server-Timing`/`X-Response-Time-Ms`. Report p50/p95 and response bytes. `X-D1-Estimated-Rows-Read/Written` is a conservative reservation, not an exact Cloudflare query-plan count; use Cloudflare D1 analytics for exact billed row reads when available.

The final matched eight-read production observation on 2026-08-26 measured filtered capabilities at 275.3 ms p50 / 315.6 ms p95 (419-byte compact responses) and briefing at 304.7 ms p50 / 308.0 ms p95 (286-byte compact responses), after one warm-up per route. The deployed Worker was unchanged during that comparison, so this is a client/network projection rather than proof of the local one-batch briefing's D1 cost; exact billed D1 rows were unavailable.

## Deterministic manager evaluation

Run the repository-owned manager fixtures against the installed native Hermes runtime, then the Worker contract tests:

```bash
cd /home/mahmud/recommendations-worker
npm run verify:manager
npm run verify:agent-contract
```

The isolated runner copies and loads the real production `/home/mahmud/AGENTS.md`, records its hash and byte count in every trace, normalizes only resolved local skill identities, and uses sequential pre/post fixtures so a verified write changes its canonical reread. Raw direct mutation probes remain failures. The fixture set covers typo/ambiguity routing, one-call context policy, feedback without recommendation, capture without Queue, branch/domain enforcement, exact feedback preservation, direct-lesson-only progression, high-risk deletion, timeout recovery, blocked work, and truthful receipts. Deterministic assertions are required when changing Hermes routing or mutation behavior; ordinary application-only releases do not rerun the manager suite. Real-model slates are diagnostic sampling: preserve exact results and require focused regression evidence for observed defects, but do not use nondeterministic aggregate sampling as a Worker deployment gate. Record task success, route, expected/actual API calls, model/tool turns when sampled, input/output bytes, wall time, failure category, recovery result, and receipt correctness.

The original 2026-08-26 full release slate passed only 4/21; its saved artifact remains historical failure evidence and must not be regraded. After correcting the procedures and fixtures, all 21 cases passed across saved focused reruns (4 mutation, 9 management/recovery, and 8 specialist cases). Later combined samples varied between 19/21 and 20/21 and remain preserved diagnostic evidence. The deterministic harness plus focused regression artifacts is the canonical manager release gate. Its preserved fixtures now live in `tests/hermes-manager` so Hermes updates cannot remove them; the wrapper requires at least 38 passing tests, no skips, and a real JUnit report, including actual production-context loading.

## Production SLOs and signals

| SLO                                                                                                 | Measurement                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtered capabilities and briefing p95 below 1 second under normal production conditions            | Matched client timings plus Worker response timing                                                                                           |
| Simple manager read uses one Worker call and no redundant context call                              | Evaluation trace/API-call count                                                                                                              |
| Every mutation produces a matching canonical verification receipt or an explicit unresolved outcome | Agent receipts and post-commit verification counters                                                                                         |
| Zero unverified branch/domain items in recommended, captured, or queued state                       | `/agent/system.data_quality` and exact source projections                                                                                    |
| Zero feedback-triggered recommendation chains                                                       | Deterministic feedback tests and event audit                                                                                                 |
| Zero generated recall cards                                                                         | Route/domain tests and card-origin audit                                                                                                     |
| Zero credential exposure                                                                            | Diff scan, redaction tests, bounded logs, absence of Learning Compass token/session plumbing, and dedicated Telegram/provider boundary tests |
| Owned skills enabled, within budget, and free of broken operational instructions                    | `npm run verify:hermes`                                                                                                                      |
| Daily D1 estimates remain below the configured circuit-breaker budgets                              | `/health/free-tier-budget` and response headers                                                                                              |

Worker-owned/local evidence includes request IDs, `Server-Timing`, response-time and estimated D1 headers, agent receipts, exact job status/retry/dead-letter counts, Queue/consolidation blockers, mutation verification state, and `/agent/system` component health. Do not add external telemetry without explicit opt-in.

## Release and rollback

Before a Worker release:

1. Identify the exact release delta and inspect every dirty file. The user-authorized full-tree release still must be internally consistent and preserve unrelated state.
2. Use `npm run verify:fast` and affected regressions for normal releases, or let `npm run deploy` run that gate once. Use `npm run verify:release` for migrations, security/storage changes, broad refactors, or explicit full verification. Do not rerun unchanged checks or wait for CI by default.
3. Before a corpus mutation, require exact ordered target/manifest identity, current signed pair receipts, a signed aggregate integrity binding (or historical v6 audit), job/run and current-pair lineage, and mandatory R2 verification. Do not require the removed per-source quality reviews for a direct integrity-only corpus. Never relabel a historical audit. Application-only deployment remains separate and performs no corpus mutation.
4. Inspect the remote D1 migration ledger and compare it with the current repository inventory. Derive the exact ordered pending set from that evidence. Dated deployment records belong in `CURRENT_STATE.md`; never infer pending migrations from a static procedure.
5. Capture the current production Worker version. Before migrations or risky data/storage changes (not ordinary code-only releases), create a complete checksummed D1-plus-R2 backup, verify object parity, restore it into a disposable environment, run integrity/readiness checks there, and record a D1 Time Travel bookmark immediately before migration.
6. For application deployment, retain signing-key and binding checks, healthy production readiness/budget, clean jobs/data quality, fast release checks and focused regressions; run manager checks only when its behavior changes. Corpus identity/integrity prerequisites apply when mutating a corpus; they do not restore the removed editorial or layout audits.
7. Verify the public API contract before release: representative unauthenticated reads return 200; malformed unauthenticated writes reach normal 400/422 domain validation; `POST /auth/session` and a fake route return 404; no response emits `WWW-Authenticate` or the retired Learning Compass auth cookie. Telegram/provider boundaries remain independently authenticated. Never configure `ALLOW_UNAUTHENTICATED_LOCAL_WRITES` remotely.
8. After every prior gate passes, apply only verified pending migrations, check the ledger and readiness, then deploy only from `/home/mahmud/recommendations-worker` with `npx wrangler deploy --config wrangler.toml`.
9. Confirm the new Worker version and require `/health/live` plus `/health/ready` again. Readiness must prove the recall-repair, source-health, Thread-material, share-intake, and annotation-revision schema plus D1/R2/Assets/AI/Vectorize bindings and the signing-key boundary. Run `verify-deploy.sh`, then smoke briefing, filtered capabilities, Queue, exact source dossier, branch/domain projections, system health, PWA shell/offline recovery, and the corpus staging surface without registering or mutating a corpus prematurely.
10. Register, stage, upload, and atomically activate only the accepted full corpus or explicitly user-directed exact prefix. Verify every included ordered target, exact artifact IDs, active-corpus pointer, R2 head, and bound job reads completed. Report `294/294` only for the full authoritative manifest; report an early prefix by its exact included count.
11. On corpus regression, use guarded corpus rollback first while the prior objects remain verified. On Worker regression, restore the captured Worker version after restoring compatible corpus visibility. Use D1 Time Travel or the verified D1-plus-R2 restore only when schema/data recovery is required; never blindly reverse an additive migration.

Data-only writes do not justify a Worker deployment. If isolation from unrelated work cannot be proven, leave the verified local implementation undeployed and report the exact blocker plus rollback version.

## Troubleshooting decision tree

```text
Request wrong or slow?
  -> Check selected skill and API-call trace.
     -> capability + briefing + context + target for a simple read? Remove redundant reads.
     -> oversized stdout? Use a projection/summary; never raw dump.
  -> Worker non-2xx?
     -> 4xx: follow the exact field/auth/product gate.
     -> 429: honor reset.
     -> 5xx/timeout read: bounded read retry.
     -> 5xx/timeout write: canonical reread, no blind retry.
  -> State looks empty?
     -> Inspect component health; degraded/unavailable is not empty.
  -> Job stuck?
     -> Read health + exact job; inspect lease owner, heartbeat, retry, dead-letter state.
  -> Profile behavior wrong?
     -> Compare live D1 assertion/revision before USER.md; current state never belongs in static memory.
  -> Prompt regressed?
     -> Compare JSON tier bytes, enabled skills, toolsets, and bundled-skill opt-out.
  -> Config change not active?
     -> Validate, finish/resolve active work, restart gateway once, then remeasure.
  -> Still unresolved?
     -> Return the exact observed blocker and a resumable next step; never invent success.
```

## Source-of-truth order

Intent and authority are separate from factual state. The current user instruction owns intent and authorization, constrained by explicit safety and product permissions; neither memory nor a live response may silently broaden that authority.

For facts about current state, use this order:

1. Live canonical Worker response and its component health.
2. Current capability/OpenAPI contract and product validation.
3. `docs/hermes-contract.json`, `.hermes.md`, `AGENTS.md`, and applicable project documentation.
4. Focused skill and on-demand reference.
5. Provenance-backed D1 profile assertion or memory-context receipt.
6. Bounded `USER.md`/`MEMORY.md` durable facts.
7. Current conversation observations.
8. Inference, which must be labeled and never presented as live fact.

R2 proves artifact bytes, not structured workflow state. Obsidian is an extracted-note archive, not a competing source of truth.
