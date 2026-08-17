# Learning Compass comprehensive product and competitive audit

**Date:** 2026-08-17

**Product:** Learning Compass (`recommendations-worker`)

**Scope:** repository architecture, deployed-product safety, UX, workflow correctness, direct competitors, adjacent learning/PKM systems, standards, open-source components, and Cloudflare-native implementation opportunities
**Evidence policy:** primary sources only—official product documentation, official repositories, specifications, and official APIs. No secondary reviews or listicles were used.

## Executive verdict

Learning Compass should not become another read-it-later app, generic block notebook, or AI chat-over-files product. Its differentiated core is already stronger than those products in the places that matter for a learning operating system: scarce commitment through a five-item Queue, explicit source consumption, reflection, editable recall drafts with approval, branch-and-round learning state, recommendation abstention and exclusions, and a closed feedback loop that does not immediately request another recommendation.

**Immediate verdict:** pause net-new feature deployment until Wave 0 is complete. On 2026-08-17, read-only production probes found that private data endpoints were reachable without authentication and that an unauthenticated `POST` reached normal routing instead of being rejected at the security boundary. The Worker only enforces its optional API token on non-read methods and only when `API_TOKEN` is configured. This is a privacy and data-integrity incident for a system with personal notes, profile evidence, destructive operations, synchronization, and agent mutations. Access control, secret rotation, complete backup, capture-state correction, and branch/round enforcement outrank every competitive feature below.

The external landscape points to five high-value gaps:

1. **First-class, source-anchored annotations.** Learning Compass tracks sources and learning units, but it does not yet have a dedicated highlight/annotation object that can reliably return the learner to an exact passage, page, timestamp, or EPUB location. Zotero, Readwise Reader, Readeck, RemNote, and the W3C Web Annotation model all show that this is the missing bridge between consumption, notes, evidence, and recall.
2. **Bilingual retrieval designed for Arabic and English.** The current semantic service uses `@cf/baai/bge-base-en-v1.5`. For a product whose canonical companions and many notes are Arabic, this is an architectural mismatch. Cloudflare offers multilingual embedding and reranking models; a versioned shadow migration should combine D1 lexical search, multilingual vectors, metadata filters, and reranking.
3. **Higher-fidelity browser capture.** The PWA already has a Web Share Target. The remaining gap is an extension that captures a page, link, or selection with structured metadata and robust selectors, then returns a canonical receipt. It must enter Inbox, preserve branch+round, and never bypass Queue triage.
4. **Evidence-bearing derived objects.** NotebookLM and Zotero demonstrate the value of navigable citations. Every generated note assertion, learning unit, SRS draft, recommendation rationale, and Arabic companion section should be traceable to a source locator or explicitly marked as the user's own reflection/inference.
5. **Operational and learning-quality evals.** Learning Compass has strong runtime contracts and outcome analytics, but it needs stable fixture suites for extraction, bilingual retrieval, citation validity, recommendation exclusions, agent mutation safety, and companion coverage. Observability must expose failures and latency without leaking private content.

The best near-term strategy is therefore to deepen the existing learning loop, not widen the product surface indiscriminately.

## How to read this report

Each comparison separates:

- **Verified facts:** claims directly supported by the linked primary source.
- **Learning Compass inference:** product or architecture conclusions drawn from those facts and the audited repository.
- **Adopt / avoid:** concrete recommendations bounded by Learning Compass's invariants.

Repository observations are based on the source and project documentation as they existed on 2026-08-17. External product behavior can change; links point to the authoritative source used.

## Learning Compass baseline and non-negotiable constraints

The comparison is against the actual system, not a blank-slate concept. The repository currently establishes these invariants:

- D1 is canonical application state; R2 holds large artifacts; Obsidian is an export/archive target only.
- Every capture must be connected to a valid branch and round.
- Inbox is unlimited; queued/in-progress sources normally cap at five unless the user explicitly overrides.
- Consumption occurs at the original source or a verified Arabic canonical HTML+PDF companion.
- Notes are structured, editable, searchable, and bilingual by block.
- Ratings 7–10 create editable SRS drafts; cards enter review only after explicit approval.
- Feedback closes the loop and never automatically requests another recommendation.
- Arabic reading companions are produced from one complete canonical body and rendered as a linked HTML/PDF pair; they require deterministic evidence and render validation and do not automatically trigger Notes Extractor.
- Hermes receives allow-listed, leased, idempotent work rather than direct database access. The current agent surface derives capabilities and OpenAPI from one registry and keeps guarded writes behind canonical APIs.
- The PWA already declares a Web Share Target at `/api/share-target`; RSS/Atom and Telegram/share capture already exist.
- D1 FTS and private Vectorize retrieval already exist. The semantic implementation currently indexes recommendations, Threads, notes, and learning units with the English-only `@cf/baai/bge-base-en-v1.5` model.

These constraints are advantages, not inconveniences. Recommendations below preserve them.

## Repository and deployed-product audit

### System map and scale

The audited workspace is a substantial single-user learning operating system, not a small recommendation widget:

- Preact/Vite PWA with five roots—Home, Library, Learn, Map, Settings—11 grouped modes, and 19 internally tested route states.
- Hono Worker on Cloudflare with D1 as canonical state, R2 artifacts, Vectorize/Workers AI retrieval, IndexedDB offline mutations, push reminders, and Cytoscape/FSRS clients.
- Capture adapters for URL, text, PDF, HTML, video, Telegram, Share Target, RSS, and Atom.
- Explicit Inbox, capped Queue, sessions, reflections, dispositions, notes, Learning Units and relations, SRS drafts/cards, Threads/stages/projects/evidence gates, branches/rounds/balance, recommendations, semantic search, Arabic companions, profile/memory/self-evolution, and an agent control protocol.
- The current generated capability surface contains 179 operations: 65 `GET`, 91 `POST`, 6 `PUT`, 4 `PATCH`, and 13 `DELETE`; 17 are classified high-risk. This breadth is useful for Hermes but too broad to treat as one undifferentiated tool catalog.
- The schema and migrations contain 90 `CREATE TABLE` statements, 90 indexes, only three explicit `FOREIGN KEY` clauses, and seven `CHECK` clauses. The table statement count includes migration history rather than 90 distinct final tables, but the constraint ratio still shows that many invariants rely on application code.
- The source/client/test tree contains roughly 26,000 lines and about 940 `any` occurrences. Large interface modules include Settings and Atlas at roughly 1,500 lines each, Branch Deck at about 1,000, and Library Views at about 1,000.

This scale explains the main architectural risk: Learning Compass has excellent domain ideas, but too many of them are enforced by convention, documentation, and Hermes skills instead of a small number of deep server-side modules and database constraints.

### P0 — production access control and secret handling

The deployed Worker at `recommendations-worker.mhmudnasr30.workers.dev` was checked using status, headers, timing, and response size only; private response bodies were not retained in this report.

| Probe on 2026-08-17 | Observed result | Meaning |
|---|---:|---|
| `GET /dashboard/briefing` | `200`, 12,139 bytes | Personal dashboard data is public |
| `GET /brain/profile` | `200`, 396,662 bytes | The profile/memory surface is public and unusually large |
| `GET /agent/context` | `200`, 69,264 bytes | Agent context is public |
| `GET /knowledge/graph` | `200`, 145,579 bytes | Knowledge structure is public |
| `GET /agent/capabilities` | `200`, 99,652 bytes | The complete mutation inventory is public |
| Unauthenticated `POST /__auth_probe__` | `404`, not `401` | The request passed the optional write-auth middleware and reached routing |
| Response headers | `Access-Control-Allow-Origin: *`; frame and MIME guards only | Cross-origin policy is broad; CSP, Referrer-Policy, and Permissions-Policy were not observed |

The code explains the result: [`src/index.ts`](../../src/index.ts) skips all authentication for `GET`/`HEAD`/`OPTIONS`, checks mutations only when `API_TOKEN` exists, and accepts a token in the query string as well as a header. Query credentials can leak through URLs, browser history, analytics, and logs. Its per-isolate in-memory rate-limit map is neither a global security boundary nor a bounded durable limiter.

The Telegram webhook checks that a bot token exists but does not validate Telegram's `X-Telegram-Bot-Api-Secret-Token` or an allowed chat/user ID before accepting capture and Queue commands. Telegram officially supports a webhook `secret_token` specifically for this verification. A configured webhook secret also appeared in audit command output; rotate it without reusing the old value. The value is intentionally omitted here.

**Required remediation order**

1. Take and verify a recoverable D1 export and R2 inventory before changing access.
2. Put the entire Worker hostname—not just mutations—behind a Cloudflare Access self-hosted application. Use an identity policy for the human UI and a separately revocable service token for Hermes/automation. Validate the Access JWT at the origin if bypass paths remain possible.
3. Reject every unauthenticated API request by default. Keep only intentionally public static assets and narrowly defined webhook endpoints outside the human policy.
4. Remove query-string credentials. Restrict CORS to the application origin or omit CORS for same-origin use. Add a reviewed CSP, `Referrer-Policy`, `Permissions-Policy`, HSTS where applicable, and cache controls for private responses.
5. Register a new Telegram webhook secret, validate the exact secret header with constant-time comparison, allow only the configured private chat/user, deduplicate `update_id`, and rotate any secret exposed during this audit.
6. Replace the Worker-global `Map` limiter with Cloudflare WAF/rate-limiting rules or a durable keyed mechanism. Rate-limit high-risk and expensive endpoints separately.
7. Add an external black-box security test: unauthenticated reads and writes must be denied, a human Access session may use the UI, a Hermes service token may call only intended routes, forged Telegram updates fail, and private responses are not cached publicly.

Cloudflare documents [Access-protected self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/), [authorization cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [service tokens for automated clients](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/), and [edge rate-limit rules](https://developers.cloudflare.com/waf/rate-limiting-rules/); these fit the current single-user architecture better than building an account system inside the app. Telegram documents the webhook [secret-token request header](https://core.telegram.org/bots/api#setwebhook) needed for origin verification.

### P0 — canonical workflow violations

#### Capture says Inbox but writes Queue

[`src/services/capture.ts`](../../src/services/capture.ts) defines `createInboxCapture`, but defaults `initialLearningState` to `queued`. The normal `/capture`, product capture, Share Target, Telegram, discovery, Compass, and feedback-created-source paths generally call it without an override. [`src/api/capture.ts`](../../src/api/capture.ts) then returns `state: inbox` even though the row was written as queued, while [`client/src/shell/CaptureDialog.tsx`](../../client/src/shell/CaptureDialog.tsx) explicitly says “Captured to Queue.” RSS is one of the few adapters that passes `inbox` explicitly.

This is not copy polish; it breaks the central commitment model and makes the API receipt false. Fix one canonical capture command so every adapter produces the same validated Inbox receipt. No adapter may set Queue state. Promotion is a separate command that enforces the cap and records intent.

The documentation also disagrees with itself: `PROJECT_CONTEXT.md` says all captures enter Inbox, while `CURRENT_STATE.md` says ordinary direct captures enter Queue. Choose the invariant already established by the project-level rules—Inbox—and make code, API, UI copy, tests, and all documentation derive from that one contract.

#### Branch and round are documented, not guaranteed

Captures can currently persist with no `branch_id`, and Queue triage does not require one; it only rejects an already assigned branch if that branch is pruned. This violates the project rule that every captured or queued item has a valid branch and derived round.

There is a real design tension: branch selection is mandatory, but capture must remain fast. Resolve it explicitly:

- preselect a verified existing branch only when the active Thread or exact user context makes the mapping deterministic;
- otherwise show a branch confirmation before final persistence;
- require every feed subscription to name a default verified branch;
- have Share Target and browser-extension capture open a lightweight confirmation sheet;
- derive round on the server from canonical branch state rather than accepting arbitrary display text;
- reject Queue promotion and recommendation persistence when branch/round validation fails.

Do not create a fake “Unmapped” branch or let a skill repair records afterward. The invariant belongs in the command service, transaction, and database constraints.

#### Duplicated branch truth can drift

The canonical relationship is `recommendation_meta.branch_id`, while a later migration also stores `recommendations.branch` and `recommendations.round` display values. Remove parallel writable truth. Keep one canonical branch ID, derive the current round, and materialize display snapshots only when an immutable historical receipt genuinely needs one.

### P1 — incomplete product journeys

1. **Learning Unit and Card routes are advertised but not resolved.** Search links units to `#/learn/unit/:id`, and the router accepts Unit/Card object types, but [`client/src/workspaces/LearnWorkspace.tsx`](../../client/src/workspaces/LearnWorkspace.tsx) only renders Thread and Note objects. Unit links fall back to Paths; Cards have no dedicated object dossier. Build typed Unit and Card surfaces with source evidence, branch/round, owning Thread, relations, review history, and clear back-navigation. Add E2E assertions for actual object content, not just route acceptance.
2. **The deepest learning model is mostly invisible.** Units, typed relations, counterevidence, contradictions, resurfacing, and learning-core evidence exist in APIs, but there is no primary synthesis workspace for claims, supporting/challenging evidence, contradiction resolution, or promotion into recall. Build a focused “Synthesis” view inside Learn rather than another top-level root.
3. **The Learning Hub still mixes learning and authoring.** The existing UX redesign evidence identifies a flat 111-item stage list, competing learn/edit actions, weak prior-knowledge handling, first-viewport density, and compressed mobile flow. Preserve the newly added evidence gate, then add explicit Learn/Edit modes, grouped stage anatomy, prior-knowledge proof or waiver, and a deliberate mobile sequence.
4. **Export is not backup.** Settings exports at most 5,000 recommendation/source records as JSON or Markdown. It omits complete notes, Units/relations/evidence, Threads/stages, cards/review history, settings, profile revisions, memories, jobs, feeds, graph state, and the R2 artifact inventory. Add a versioned full export, checksums, schema version, encrypted destination option, import validation, and a disposable restore rehearsal.
5. **Capture lacks passage-level evidence.** Add W3C-compatible selectors and a browser extension only after the canonical Inbox/branch transaction is fixed. Highlights must resolve to the original passage/page/timestamp and may create proposed notes, Units, or recall drafts—never approved knowledge automatically.
6. **Arabic/English semantic search is mismatched.** The current embedding model is English-only while Arabic companions and bilingual notes are first-class. Build a parallel multilingual index, chunk by meaningful boundaries, fuse lexical/vector ranks, rerank a bounded set, and switch only after Arabic/English/code-switch fixtures beat the current baseline.

### UX evaluation

**Evidence-bounded score: 72/100.** This score is based on repository behavior, current project screenshots, route/E2E runs, and the existing Learning Hub UX evidence. A fresh interactive browser walkthrough was unavailable in this audit, so visual judgments are deliberately conservative. **Anti-pattern verdict: clean**—the product avoids infinite recommendation feeds, streak pressure, hidden card approval, and post-feedback chaining.

| Heuristic | Score / 4 | Evidence |
|---|---:|---|
| System status | 2 | Loading, synchronization, job, evidence, and offline states exist; receipts are strong, but capture currently reports a false state |
| Match to learner language | 2 | Five destinations are understandable; Branch, Round, Thread, Unit, Hermes, and 179 operations impose internal vocabulary |
| User control and freedom | 2 | Undo, explicit approval, and guarded deletion are strong; object navigation and authoring modes are incomplete |
| Consistency and standards | 2 | The five-root shell is coherent; capture labels, profile automation docs, and duplicate branch fields drift |
| Error prevention | 2 | Queue cap, idempotency, preconditions, and readback are excellent; authentication and branch/capture enforcement are critical exceptions |
| Recognition over recall | 2 | Badges and contextual cards help; flat Hub anatomy and system inventory create scanning cost |
| Flexibility and efficiency | 2 | Search, offline outbox, Share Target, feeds, Telegram, and theming are strong; bulk triage, saved views, importers, and highlights are missing |
| Minimalist design | 3 | Five roots constrain sprawl; Settings, Atlas, and the Hub still expose too much implementation-shaped complexity |
| Error recovery | 2 | Offline retries and mutation receipts are strong; generic fetch failure can discard useful stale data, and full restore is absent |
| Help and onboarding | 2 | Repository documentation is rich; in-product first-run and task-oriented guidance are thin |

Critical walkthrough outcomes:

- Capture → Inbox → branch confirmation → Queue: **fails**, because ordinary capture writes Queue and can omit branch/round.
- Resume current source → consume → return → reflect: **mostly passes**.
- Thread lesson → project evidence → verify: **passes its first implementation slice**, but authoring separation and prior-knowledge handling cause hesitation.
- Search → open Learning Unit: **fails**, because the typed object does not render.
- Approve recall draft → review with FSRS: **passes conceptually and in unit coverage**; preserve explicit approval.
- Export → destructive loss → restore: **fails**, because only a partial source projection is exportable.

### Architecture, test, and delivery gaps

- **Validation and client typing:** request parsing is mostly manual and the code has roughly 940 `any` occurrences. Adopt [Hono typed RPC](https://hono.dev/docs/guides/rpc) plus one [validation](https://hono.dev/docs/guides/validation) approach compatible with the chosen schema library (Zod, Valibot, or TypeBox), generate the browser client and OpenAPI from the same contracts, and reject unknown/invalid fields at boundaries.
- **Deep modules:** consolidate capture adapters behind one command, retrieval behind one evidence-returning interface, branch/round ownership behind one service, and recommendation/discovery behind one policy pipeline. The unreferenced `DiscoveryPage` and overlapping discovery/Compass backends are signs of a retirement that was not completed.
- **Database integrity:** add foreign keys/checks where D1 behavior permits, transactionally enforce required relations, and centralize cascades. Procedural Hermes checks are defense in depth, not the primary invariant.
- **Client data flow:** the current per-component `useData` pattern has no shared cache/invalidation and can replace prior data with a generic failure state. Add a thin domain query cache with stale-while-revalidate behavior and explicit mutation invalidation; a large state framework is unnecessary.
- **Search maintenance:** scheduled full FTS rebuilds and row-by-row writes will age poorly. Track changed entities and batch incremental updates while retaining a repair/rebuild command.
- **CI coverage:** the standard workflow runs unit/typecheck, build, and E2E, but omits migration rehearsal, Hermes verification, and agent-contract verification. Four `tests/integration/*.mjs` files are not wired into `package.json` or CI. Add every contract verifier and journey-level integration suite to required CI.
- **Contract tests:** current E2E accepts the capture receipt and then triages Queue, so it misses that the persisted initial state is already queued. It also checks typed routes without validating Unit/Card content. Add state-from-database assertions and real object walkthroughs.
- **Release reproducibility:** the audited working tree contains significant uncommitted source, migration, contract, and test changes while production already reflects parts of that state. Build/deploy from a reviewed commit and record migration, agent contract, semantic model, and policy versions in each release receipt.
- **Infrastructure drift:** documentation and runtime inventory describe a six-hour maintenance schedule, but `wrangler.toml` has no checked-in cron trigger. Declare deployment configuration as code or explicitly document and verify the remote source of truth.
- **Profile automation contract drift:** live/default settings and `CURRENT_STATE.md` describe profile changes as manual/review-required, while `docs/hermes-contract.json` and `docs/architecture.md` describe confidence-triggered automatic application. The verifier passes because it verifies stale prose rather than one executable policy. Choose one policy, expose it in settings, and generate docs/tests from the same typed configuration.
- **Observability:** add redacted structured Worker logs, source maps, sampled traces, job/extraction/search SLOs, and alerting. Never log note bodies, reflections, private URLs, source text, prompts, or credentials.

The existing verification baseline is otherwise healthy: 103 unit tests plus TypeScript checks passed, the production build passed, five-root/19-mode E2E passed, migration replay passed cleanly and idempotently, Hermes/agent contract verification passed, and `npm audit --omit=dev` reported no known vulnerabilities. Passing tests therefore demonstrate implementation discipline, not absence of the contract and deployment gaps above.

### Hermes skills and operating workflow

The current skill graph is broad—21 active of 23 installed—and should not grow by default. Server contracts must become simpler so skills orchestrate judgment rather than compensate for weak invariants.

- Merge or sharply separate the long `taste-rec` procedure and `compass-recommendation-workflows`; both currently touch candidate policy and can drift.
- Physically retire the disabled `learning-thread-curation` package once no contract references remain.
- Keep recommendation research, source ingestion, profile learning, feedback, NotebookLM, Lite Visual, and self-evolution as focused workflows, but generate their API assumptions from the capability registry.
- Add security/backup checks to the existing site-operations/release workflow instead of creating a new leaf skill.
- Add an evidence-capture/enrichment skill only when the annotation API exists. It may parse and propose anchors, but cannot promote Queue state, create branches, or claim extraction completeness.
- Add replayable skill fixtures: duplicate capture, missing branch, Queue full, feedback closure, unapproved recall, stale mutation precondition, bilingual citation resolution, and companion evidence coverage.
- If MCP is added, make it a transport adapter over the current capability registry with read-only resources first. Do not create a second tool authority or expose all 179 operations natively.

### Recommended order of work

| Order | Time box | Outcome | Exit evidence |
|---|---|---|---|
| Wave 0A | Same day | Contain public access and rotate exposed/webhook credentials | Anonymous reads/writes denied; Access human login and Hermes service token succeed; forged Telegram update denied |
| Wave 0B | 1–3 days | Restore truthful capture and branch/round invariants | Every adapter persists Inbox; every receipt matches D1; no canonical record or Queue item lacks valid branch/round; tests cover retries and cap |
| Wave 0C | 1 week | Make data recoverable and delivery reproducible | Full D1/R2 export plus disposable restore passes; CI runs all verifiers; release originates from a reviewed commit |
| Wave 1 | 1–2 weeks | Close incomplete learning journeys | Unit/Card dossiers, Synthesis view, Learn/Edit separation, grouped stages, prior-knowledge proof/waiver, mobile walkthrough pass |
| Wave 2 | 3–6 weeks | Add evidence fidelity and bilingual intelligence | Durable locators, provenance contract, extension capture, multilingual retrieval shadow evals pass |
| Wave 3 | Later, evidence-triggered | Improve interoperability and operations without surface sprawl | Saved views/importers, incremental resurfacing, redacted observability, read-only MCP only where measured value exists |

Do not start with an internal reader, CRDT rewrite, graph database, external search cluster, generic notebook, autonomous taxonomy, streaks, or an endless recommendation feed. None addresses the current highest-risk failures.

### Tooling decision

| Need | Use | Why | Do not add yet |
|---|---|---|---|
| Private access | Cloudflare Access, service tokens, WAF/rate limiting | Fits the existing Worker and one-human/one-agent trust model | A custom user/account system |
| API contracts | Hono typed RPC plus Zod, Valibot, or TypeBox/Standard Schema | One validation source for Worker, browser client, OpenAPI, and agent registry | More hand-written request interfaces |
| Capture and evidence | Manifest V3/WebExtensions, Web Share Target, W3C Web Annotation selectors | Covers page, link, selection, PDF page/quote, and timestamp locators | A universal internal reader |
| Safe article extraction | Mozilla Readability plus DOMPurify; Cloudflare Browser Rendering only as a bounded JS fallback | Mature metadata/content extraction with explicit sanitization and a fallback receipt | A crawler platform or unbounded headless browsing |
| Heavy document enrichment | Existing Hermes host with PyMuPDF/OCRmyPDF/Tesseract, `yt-dlp`, and Calibre-style EPUB tooling when fixtures justify each adapter | Keeps CPU-heavy/OCR/media work out of the latency-sensitive Worker | Shipping every parser in the Worker |
| Accessibility and journeys | Existing Playwright plus `axe-core`; Lighthouse CI for budget regressions | Converts the five-root smoke suite into task and accessibility gates | Screenshot-only approval |
| Code health | TypeScript strictness, Knip for dead exports/files, Biome or oxlint after a measured trial, CodeQL/Dependabot | Finds dead legacy surfaces, unsafe flows, and dependency drift without a framework rewrite | A broad lint migration that obscures product fixes |
| Operations | Workers Logs, source maps, traces, Analytics Engine aggregates; Sentry only if Cloudflare-native error context proves insufficient | Privacy-safe request/job visibility and actionable SLOs | Logging prompts, notes, reflections, or full URLs |
| Portability | Versioned repository script/job for D1 export, R2 checksum manifest, encryption, and disposable restore | Tests actual ownership and recovery | Treating Markdown/Obsidian export as backup |
| Interoperability | Read-only-first MCP adapter generated from the existing capability registry | Reuses guards, schemas, idempotency, and receipts | A second control plane or 179 one-tool wrappers |

### Success metrics

Use **verified learning-loop completions per active branch** as the primary outcome, not time in app, captures, graph size, or streaks. A completion means a real source was consumed, a user reflection exists, evidence was accepted or challenged, and the branch state changed through a valid receipt.

| Layer | Metric | Target/guardrail |
|---|---|---|
| Security | Anonymous private read/write success | Exactly zero |
| Recovery | Scheduled backup verification and restore rehearsal | 100% successful; documented RPO/RTO |
| Capture | Receipt state equals canonical D1 state | 100% |
| Learning context | New captures/Queue items with valid branch and derived round | 100% |
| Commitment | Queue entries without explicit promotion or above cap without explicit override | Zero |
| Evidence | Generated factual assertions with resolvable source locators | 100% in gated workflows |
| Learning | Started sources reaching reflection/evidence completion | Improve by branch and source type, without lowering evidence standards |
| Recall | Unapproved cards entering review | Zero; report retention/workload and leech rate rather than streaks |
| Retrieval | Arabic/English/code-switch relevance and valid-locator rate | New model must beat fixed lexical/semantic baseline before activation |
| Recommendations | Consumed/mastered/blocked leakage and post-feedback auto-request | Zero |
| Reliability | Capture/job p95 latency, failure class, retry recovery, index lag | Establish baseline, then assign explicit SLOs |
| UX | Capture→Inbox→Queue, search→Unit, evidence→verify, export→restore task success | 100% in Playwright journey fixtures |

## Strategic opportunity map after Wave 0

| Priority | Gap | Why it matters now | Concrete move | Invariant guardrail |
|---|---|---|---|---|
| P1 | Source-anchored annotations | Highlights are the missing evidence layer between reading, notes, units, and recall | Add a D1 annotation/locator model based on W3C selectors; capture text quote + context + position/page/time; open the original source at the locator | No universal internal reader; original source remains the default consumption target; branch+round required |
| P1 | Arabic/English retrieval | The current English embedding model is poorly matched to Arabic companions and bilingual notes | Build a shadow multilingual index, retain lexical FTS, add metadata filters and reranking, and activate only after bilingual relevance evals | D1 remains canonical; Vectorize is a derived index; no silent model swap |
| P1 | Evidence-linked derivations | Generated text can be correct-looking without being inspectably grounded | Require evidence locator arrays or an explicit `user_reflection` provenance on notes, units, drafts, recommendation evidence, and companion sections | Generated content never impersonates personal reflection; companion coverage rules remain intact |
| P2 | Browser capture fidelity | Share Target captures URLs/text but not durable passage anchors or rich page metadata | Add a least-privilege Manifest V3 extension for page/link/selection capture, metadata preview, branch confirmation, and receipt readback | Everything lands in Inbox; no direct Queue write; no speculative branch creation |
| P1 | Evals and privacy-safe observability | Complex ingestion and agent workflows need regression evidence beyond endpoint success | Add fixture-based extraction, retrieval, provenance, recommendation-policy, mutation, and companion tests; enable structured logs/source maps/traces with redaction | Learning truth remains in D1; telemetry is noncanonical and excludes private bodies/prompts |
| P2 | Incremental source resurfacing | SRS cards resurface facts, but unfinished sources and valuable excerpts are not scheduled as learning material | Add explicit resurfacing checkpoints for in-progress source anchors, separate from Queue and card review | Never auto-promote a new source or auto-create an approved card |
| P2 | Saved searches and triage rules | A growing Inbox/feed archive needs reusable views and predictable triage | Add a small query grammar, saved D1 views, OPML import/export, and non-mutating rule suggestions | Rules may suggest branch/tags; only verified branch mappings and explicit Queue promotions mutate state |
| P0 | Portable evidence backup | D1 Time Travel is recovery, not user-owned portable export | Export a versioned manifest, JSON/Markdown records, OPML subscriptions, and R2 checksums; verify restore in a disposable database | Export is a projection; Obsidian does not become writable canonical state |
| P3 | MCP compatibility | Existing capability registry is already close to a safe MCP server | Add MCP as an alternate transport over the same registry, read-only first, with scoped authentication and existing receipts | No duplicate business logic, raw SQL, or broad tool catalog |
| P2 | EPUB ingestion and handoff | Books are present but EPUB source structure and durable locations are weak | Parse metadata/spine/navigation and support EPUB/Readium locators; hand off to an external reader initially | Do not build a full reader unless explicitly justified as a canonical companion |
| P2 | Push RSS | Six-hour polling is adequate for a single user, but WebSub can reduce lag for compatible feeds | Add only after feed scale/latency evidence warrants it | Push events still enter feed/Inbox, never Queue |
| Avoid | Generic graph/notebook replacement | Obsidian, Logseq, Anytype, and Capacities optimize broad PKM, not this learning loop | Borrow typed backlinks, queries, and portability patterns only | D1 domain model and branch/round remain authoritative |
| Avoid | Autonomous AI organization | AI auto-tags and auto-generated learning objects create plausible but unverified state | Keep AI outputs proposed, sourced, reviewable, and idempotent | Explicit approval and feedback closure remain mandatory |

## Direct read-it-later and reader systems

### Readwise Reader

**Thesis.** Reader treats capture, reading position, annotation, search, and downstream highlight review as one continuous reading workflow.

**Verified facts.** Reader accepts articles, newsletters, EPUBs, PDFs, videos, posts, and RSS; supports browser extension/mobile share/file capture; tracks reading progress; provides highlighting, notes, tags, search, offline use, text-to-speech, and export. Its API exposes document listing/saving/updating with cursor pagination and rate limits. Ghostreader prompts can receive document content, HTML, progress, highlights, and the current selection, and document chat can save a response into a note. Reader exports documents, feeds, and annotations rather than trapping all data in the interface. Sources: [Reader documentation](https://docs.readwise.io/reader/docs), [Reader product and export overview](https://readwise.io/read/), [Reader API](https://readwise.io/reader_api), [Ghostreader prompt reference](https://docs.readwise.io/reader/guides/ghostreader/reference), [highlights, tags, and notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes), [document chat](https://docs.readwise.io/reader/guides/ghostreader/chat).

**Architecture/form factor.** Official materials describe web, iOS, Android, browser extension, local/offline reading, public API, and export surfaces. The hosted backend architecture is not documented publicly.

**Learning Compass inference.** Reader's strongest lesson is contextual continuity: a highlight knows its document and the assistant knows the current reading position. Learning Compass already has a better commitment and learning-state model, but lacks this passage-level continuity. Ghostreader's flexible prompting is useful only if grounded outputs remain typed and cited.

**Adopt.** Passage-level anchors; reading-position-aware actions; exportable annotation records; “ask about this passage” with citations; explicit save-to-note; keyboard-first annotation; optional TTS handoff.

**Avoid.** A single undifferentiated read-later feed; opaque AI transformations; moving consumption away from the external source by default; using highlights as proof of understanding.

### Omnivore: lineage and current status

**Thesis.** Omnivore was an open-source, full-stack read-it-later system whose code remains valuable as a capture/parsing reference, but it is no longer a dependable hosted product baseline.

**Verified facts.** The official repository describes highlighting, notes, search, saved position, newsletter ingestion, PDF support, browser extensions, mobile/PWA clients, offline use, text-to-speech, and Obsidian/Logseq integrations. Its source includes TypeScript/JavaScript services, PostgreSQL, APIs, content fetching, Chromium/Puppeteer, Readability, and PDF.js. The repository now describes the project as self-hosted; its cloud service was deprecated in November 2024. ElevenLabs officially announced that the Omnivore team joined it and that the code would remain open source. Omnivore's own self-hosting page says the documentation is incomplete. Sources: [Omnivore repository](https://github.com/omnivore-app/omnivore), [official ElevenLabs announcement](https://elevenlabs.io/blog/omnivore-joins-elevenlabs), [Omnivore self-hosting documentation](https://docs.omnivore.app/self-hosting/self-hosting.html).

**Architecture/form factor.** Multi-service AGPL application with web/mobile/PWA/extensions, PostgreSQL, a content-fetching service, and headless-browser processing.

**Learning Compass inference.** Reliable web capture is not a single library call; Omnivore's service boundaries expose the real cost of fetching dynamic pages, extracting content, sanitizing it, and supporting many clients. That code is a pattern library, not a platform dependency.

**Adopt.** Extraction fixtures; browser fallback patterns; PDF.js integration ideas; client capture ergonomics; migration/export awareness.

**Avoid.** Copying the multi-service deployment; depending on an inactive hosted service; treating incomplete self-hosting instructions as an operational foundation; importing AGPL code without a deliberate license review.

### Wallabag

**Thesis.** Wallabag is strongest as a mature, self-hosted archive with filters, rule-based organization, annotations, imports/exports, and a stable API.

**Verified facts.** Wallabag saves and classifies articles for later reading. It supports annotations, tags, archive/favorite state, filters by attributes such as language, reading time and domain, automatic tagging rules based on article fields, import/export, and a REST API. Its documentation states that annotations are visible in Wallabag's internal reader. Sources: [Wallabag repository](https://github.com/wallabag/wallabag), [annotations](https://doc.wallabag.org/user/articles/annotations/), [automatic tagging rules](https://doc.wallabag.org/user/configuration/tagging_rules/), [interface and filters](https://doc.wallabag.org/user/interface/), [REST API](https://doc.wallabag.org/developer/api/), [imports](https://doc.wallabag.org/user/import/).

**Architecture/form factor.** Self-hosted web application with mobile/browser integrations and REST API; implementation details are available in the official repository.

**Learning Compass inference.** Its declarative rules and filters are more useful to Learning Compass than its internal reader. Rules should create a transparent triage suggestion, never an unreviewed branch or Queue commitment.

**Adopt.** Saved filters; inspectable rules; domain/language/age/reading-time predicates; portable import/export; bulk Inbox operations.

**Avoid.** Internal-reader-only annotations; automatic tags becoming canonical knowledge taxonomy; equating archive state with learning progress.

### Readeck

**Thesis.** Readeck demonstrates a compact archival architecture: immutable per-bookmark packages, a simple database, saved-search collections, full-text search, highlights, and e-reader interoperability.

**Verified facts.** Readeck saves readable web content and assets; supports labels, favorites, archives, highlights/annotations, saved searches as collections, a browser extension, full-text search, EPUB export, and OPDS catalogs. Its official repository states that each bookmark is stored as an immutable ZIP, SQLite is the recommended database for most installations, and the server is a Go single binary using server-rendered HTML with Stimulus/Turbo. Sources: [Readeck official site](https://readeck.org/en/), [official repository](https://codeberg.org/readeck/readeck), [Go source documentation mirror of the official repository](https://pkg.go.dev/codeberg.org/readeck/readeck).

**Architecture/form factor.** AGPL, self-hosted Go single binary; immutable ZIP per bookmark; simple database; server-rendered UI; browser extension and mobile clients.

**Learning Compass inference.** The immutable source package is a useful evidence model for optional snapshots: store a content hash and immutable artifact bundle in R2, while D1 keeps canonical metadata and mutable learning state. OPDS is a low-cost way to hand selected material to an e-reader without building a reader.

**Adopt.** Content-addressed source snapshots where legally and operationally appropriate; saved-search collections; OPDS/EPUB export as a future handoff; clear separation between immutable captured evidence and mutable annotations.

**Avoid.** Archiving every page and every asset by default; making the snapshot the default consumption surface; storing mutable learning state inside opaque ZIPs.

### Karakeep, formerly Hoarder

**Thesis.** Karakeep is the broadest open-source capture benchmark: strong media capture, full-page archiving, OCR, search, rules, RSS, automation, and agent-friendly interfaces.

**Verified facts.** The official project identifies Karakeep as formerly Hoarder. It supports links, text, images, PDFs, notes, highlights, lists, full-text search, OCR, browser extensions, mobile apps, RSS, REST API, CLI, full-page archival, and video ingestion. Optional AI tagging/summarization works with hosted models or local Ollama. Its minimal installation documentation shows that the full feature set depends on services such as a search engine and browser, and its migration tooling covers bookmarks, tags, rules, feeds, prompts, webhooks, and deduplication. The repository includes an official agent skill that documents smart query lists, source qualifiers, rule/webhook behavior, and RSS publishing/consumption. Sources: [Karakeep repository](https://github.com/karakeep-app/karakeep), [bookmarking and highlights](https://docs.karakeep.app/using-karakeep/bookmarking/), [minimal installation](https://docs.karakeep.app/installation/minimal-install/), [server migration](https://docs.karakeep.app/administration/server-migration/), [official agent skill](https://github.com/karakeep-app/karakeep/blob/main/skills/SKILL.md), [official apps](https://karakeep.app/apps/).

**Architecture/form factor.** Self-hosted web/mobile/extension ecosystem with optional browser, search, OCR, and AI services; REST/CLI/agent interfaces.

**Learning Compass inference.** Karakeep is the best capture feature checklist, but its infrastructure and automatic organization would over-expand Learning Compass. The useful boundary is “reliably ingest and describe a source”; learning state should remain explicit and domain-specific.

**Adopt.** Capture receipts; file and OCR fallback; full-page snapshot only when needed; smart query syntax; webhook/API discipline; deduplication during import; agent-facing documentation.

**Avoid.** Meilisearch/Chrome/Ollama infrastructure unless measured need justifies it; AI tags directly mutating branch taxonomy; automatic summarization as a substitute for source consumption; broad bookmarking features disconnected from a Thread or branch.

### Direct-system synthesis

| Capability | Strongest reference | Learning Compass decision |
|---|---|---|
| Passage continuity | Readwise Reader | Build source locators and evidence-linked actions |
| Extraction pipeline | Omnivore, Karakeep | Use staged extraction with browser fallback and fixtures |
| Rules and saved filters | Wallabag, Readeck, Karakeep | Add transparent saved views and non-mutating suggestions |
| Immutable archival evidence | Readeck | Optional hashed R2 snapshots; never canonical mutable state |
| E-reader handoff | Readeck | Consider OPDS/EPUB export before building an EPUB reader |
| API/agent operability | Readwise, Karakeep | Extend the existing capability registry; do not add a second authority |

## PKM and object-based knowledge systems

### Obsidian

**Thesis.** Obsidian's durable value is file ownership, links, properties, and an extensible browser capture pipeline—not its graph visualization by itself.

**Verified facts.** Obsidian stores Markdown plain-text notes in a local vault folder and maintains a metadata cache for links and views. Its open-source Web Clipper captures pages, selections, metadata, Schema.org fields, and highlights; supports templates, filters, selectors, logic, and URL-based template triggers; exports templates/settings; and saves locally. Official troubleshooting documentation acknowledges that automatic main-content extraction can omit material and recommends selection, highlighting, or site-specific templates as fallbacks. Sources: [data storage](https://obsidian.md/help/data-storage), [Web Clipper](https://obsidian.md/help/web-clipper), [clipper product page](https://obsidian.md/clipper), [templates](https://obsidian.md/help/web-clipper/templates), [variables](https://obsidian.md/help/web-clipper/variables), [capture troubleshooting](https://obsidian.md/help/web-clipper/troubleshoot), [clipper repository](https://github.com/obsidianmd/obsidian-clipper).

**Architecture/form factor.** Desktop/mobile proprietary application over user-owned Markdown files, with plugins and a separate open-source browser extension.

**Learning Compass inference.** Obsidian validates the existing one-way archive policy. The clipper's extraction fallbacks, template triggers, and inspectable variables are more relevant than adopting a filesystem vault. Learning Compass's D1 schema encodes stronger learning semantics than free-form Markdown.

**Adopt.** Durable, documented exports; clipper templates for known site classes; metadata preview; explicit fallback when extraction confidence is low; contextual backlinks.

**Avoid.** Making Obsidian writable canonical state; file watcher/sync complexity; relying on graph density as evidence of learning; letting arbitrary templates bypass API validation.

### Logseq

**Thesis.** Logseq combines local knowledge graphs, block references, PDF annotation, tasks, and queryable data, while its newer database work shows both the power and migration cost of changing storage models.

**Verified facts.** Logseq describes itself as a privacy-first, open-source knowledge platform with Markdown/Org support, PDF annotation, backlinks, tasks, queries, and plugins. Official database-version documentation describes its database format, sync, Markdown export, and optional MCP-related work. Official development documentation includes a Cloudflare Worker adapter and D1 in the database sync architecture. Sources: [Logseq repository](https://github.com/logseq/logseq), [database version documentation](https://github.com/logseq/docs/blob/master/db-version.md), [CLI documentation](https://github.com/logseq/logseq/blob/master/docs/cli/logseq-cli.md), [development documentation](https://github.com/logseq/logseq/blob/master/docs/develop-logseq.md).

**Architecture/form factor.** Open-source desktop/web/mobile knowledge graph; file-based legacy mode and a newer database/sync model; plugin and CLI surfaces.

**Learning Compass inference.** Block references and contextual queries are useful, but replacing explicit source/note/unit/evidence types with generic blocks would weaken Learning Compass. Logseq's storage evolution is also a warning: parallel file and database authorities are expensive.

**Adopt.** Block-level backlinks to source evidence; queryable properties; export/CLI validation; contextual PDF links.

**Avoid.** Generic block ontology; bidirectional Obsidian/Markdown writes; CRDT/sync work without a multi-writer requirement; plugin APIs that can mutate invariants unchecked.

### Anytype

**Thesis.** Anytype demonstrates a typed-object knowledge system with local-first encrypted synchronization and an API, but its distributed object model is far broader than Learning Compass needs.

**Verified facts.** Anytype's official repositories describe a local-first, peer-to-peer encrypted knowledge system organized around spaces, objects, types, relations, and blocks. The client exposes a gRPC API, and the organization publishes synchronization and MCP-related components. Its licensing is source-available rather than a simple permissive open-source dependency. Sources: [Anytype client repository](https://github.com/anyproto/anytype-ts), [official documentation repository](https://github.com/anyproto/docs), [Anyproto organization](https://github.com/anyproto).

**Architecture/form factor.** Desktop/mobile local-first object graph over AnySync/P2P synchronization, with typed objects, blocks, relations, and client API.

**Learning Compass inference.** Typed objects support the direction Learning Compass already took. Anytype's distributed synchronization is not a reason to replace D1; it is evidence that offline conflict handling deserves explicit object versions and readable conflict states.

**Adopt.** Clear type/relation vocabulary; schema-aware API; export guarantees; explicit object-version/conflict metadata for offline edits.

**Avoid.** P2P/CRDT replication as a second canonical layer; generic object editing; copying source-available code without license review.

### Capacities

**Thesis.** Capacities shows how object types, contextual backlinks, queries, and saved dynamic views can make a personal knowledge base navigable without forcing everything into folders.

**Verified facts.** Capacities uses content/object types, properties, backlinks with context, weblink objects with notes, and saved queries over types, tags, properties, and links. It documents local-first editing followed by synchronization, while noting that some full-text, query, and AI features are unavailable offline. It supports manual/scheduled exports in several formats. Sources: [content types](https://docs.capacities.io/reference/content-types), [queries](https://docs.capacities.io/reference/queries), [backlinks](https://docs.capacities.io/reference/backlinks), [weblinks](https://docs.capacities.io/reference/basic-types/weblinks), [offline support](https://docs.capacities.io/misc/offline-support), [export](https://docs.capacities.io/reference/export).

**Architecture/form factor.** Proprietary desktop/web/mobile object-based PKM with local cache/sync and exports.

**Learning Compass inference.** Learning Compass already has more meaningful types. The gap is exposing them through saved views and contextual backlinks, not introducing a generic object builder.

**Adopt.** Saved queries; context around backlinks; typed object cards; visible offline capability boundaries; scheduled portable export.

**Avoid.** User-defined type proliferation; duplicating branch, Thread, source, note, and evidence semantics in configurable objects; presenting unavailable offline operations as if they succeeded.

### PKM synthesis

The shared lesson is **typed, contextual navigation with portable projections**. Learning Compass should expose “where this note/card/claim came from,” “what branch it advances,” and “what other evidence links here.” It should not trade its domain model for a generic canvas, block graph, folder vault, or user-configurable ontology.

## Spaced repetition and incremental reading

### Anki and FSRS

**Thesis.** Anki's modern scheduling lesson is to optimize retention against workload, keep review answers honest, and treat scheduling as a calibrated subsystem rather than product gamification.

**Verified facts.** Anki documents FSRS desired retention, parameter optimization from review history, workload simulation, and the steep workload cost of setting retention close to 100%. It advises users to distinguish `Again` from `Hard` honestly. Add-ons can access internal APIs and may break as Anki changes. Sources: [Anki deck options and FSRS](https://docs.ankiweb.net/deck-options.html), [add-ons](https://docs.ankiweb.net/addons.html), [leeches](https://docs.ankiweb.net/leeches.html), [importing and exporting](https://docs.ankiweb.net/importing/intro.html).

**Architecture/form factor.** Desktop/mobile/web flashcard system with local collections, synchronization, import/export, add-ons, and modern FSRS scheduling.

**Learning Compass inference.** Learning Compass already uses `ts-fsrs` and has the crucial approval gate. The next gains are parameter transparency, workload simulation, leech handling, and preserving source context—not another scheduler.

**Adopt.** Desired-retention setting with workload preview; retrievability/stability inspection; leech detection that routes to edit/suspend; source-linked card context; export of review history.

**Avoid.** Maximizing retention without workload cost; streak pressure; allowing agent-created cards directly into review; unversioned scheduler changes.

### SuperMemo incremental reading

**Thesis.** Incremental reading treats sources and extracts as scheduled learning objects, using priority to decide what is resurfaced under overload.

**Verified facts.** SuperMemo's official help describes importing material, extracting smaller fragments while preserving references, prioritizing material, interleaving reading with review, and postponing lower-priority material under overload. Its knowledge-formulation guidance recommends minimum-information prompts, cloze deletion, personalization, examples, and source references. Sources: [incremental reading](https://www.super-memory.org/archive/help/read.htm), [priority](https://www.super-memory.org/archive/help/priority.htm), [Twenty rules of knowledge formulation](https://supermemo.guru/wiki/20_rules_of_knowledge_formulation), [SuperMemo features](https://help.supermemo.org/wiki/Features).

**Architecture/form factor.** Proprietary desktop learning system integrating documents, extracts, questions, scheduling, and priority queues.

**Learning Compass inference.** This is the most important learning-workflow gap after annotations. The system can resurface an unfinished source or a specific passage without turning it into a Queue replacement or an approved card. A “source checkpoint” is distinct from a recommendation and from SRS.

**Adopt.** User-set source/extract priority; scheduled checkpoints for current sources; progress-aware resumption; source reference propagation into drafts; overload-aware postponement.

**Avoid.** A second unlimited priority queue; hidden auto-postponement; generating many atomized extracts before the learner reflects; treating extraction as mastery.

### RemNote

**Thesis.** RemNote's strongest pattern is source-pinned learning: annotations, notes, and cards can return to the exact PDF, web, or video context.

**Verified facts.** RemNote supports document sources linked to PDFs, websites, YouTube, and other material; a split reader/notes workflow; annotations and citations; flashcards embedded in notes; and card types including basic, concept/descriptor, and cloze. Its reader documentation describes source-pinned AI-generated cards and page citations. Sources: [document sources](https://help.remnote.com/en/articles/6030712-document-sources), [reader](https://help.remnote.com/en/articles/6690975-learning-from-pdfs-and-files-with-the-remnote-reader), [creating flashcards](https://help.remnote.com/en/articles/6025481-creating-flashcards).

**Architecture/form factor.** Proprietary integrated note, reader, and spaced-repetition application.

**Learning Compass inference.** Source-pinned cards are worth adopting; one-click AI card publication is not. Learning Compass's editable draft and approval boundary is safer.

**Adopt.** Exact “open source context” on every draft/card; quote/page/timestamp in card provenance; user action to turn an annotation into a draft.

**Avoid.** AI cards entering review automatically; collapsing notes and cards into one ambiguous block; making an embedded reader mandatory.

### SiYuan

**Thesis.** SiYuan is a close open-source combination of block knowledge management, PDF annotation links, web capture, flashcards, OCR, backlinks, and APIs.

**Verified facts.** The official repository documents local-first storage, block references, backlinks, custom attributes, SQL queries, web clipping, PDF annotation links, flashcards with spaced repetition, OCR, APIs, and multiple export formats. Sources: [SiYuan repository](https://github.com/siyuan-note/siyuan), [official SiYuan site](https://b3log.org/siyuan/en/).

**Architecture/form factor.** Open-source desktop/mobile/server knowledge application centered on content blocks, with APIs and optional synchronization services.

**Learning Compass inference.** SiYuan proves the value of exact PDF annotation links and searchable block metadata. Learning Compass should implement these as typed annotations/evidence, not adopt a universal block core.

**Adopt.** PDF annotation deep links; OCR as an explicit extraction fallback; queryable source/block metadata; portable export.

**Avoid.** Replacing learning objects with generic blocks; adding a second SQL-like end-user authority; bundling every PKM feature into the learning loop.

## Research and grounded knowledge tools

### Zotero

**Thesis.** Zotero provides the best primary-source model for bibliographic identity, durable annotations, attachment separation, and version-based synchronization.

**Verified facts.** Zotero's Connector saves structured metadata and can save PDFs or webpage snapshots. Zotero searches metadata, tags, and indexed full text. Annotations are stored in the database, enabling incremental synchronization, while imported/embedded annotations are supported. Its Web API exposes full-text content and version-based synchronization. Attachments can use Zotero storage or WebDAV. Sources: [quick start](https://www.zotero.org/support/quick_start_guide), [annotations in the database](https://www.zotero.org/support/kb/annotations_in_database), [full-text API](https://www.zotero.org/support/dev/web_api/v3/fulltext_content), [syncing API](https://www.zotero.org/support/dev/web_api/v2/syncing), [file synchronization](https://www.zotero.org/support/sync#file_syncing).

**Architecture/form factor.** Desktop research library with browser connectors, database-backed metadata/annotations, separate attachments, synchronization, and web API.

**Learning Compass inference.** This maps cleanly to D1 metadata/annotations plus R2 artifacts. An annotation should be a mutable D1 record targeting an immutable source version or external canonical URI. Version numbers and incremental export are preferable to rewriting monolithic Markdown.

**Adopt.** Structured source identity; D1-resident annotations; separate R2 attachments; versioned change export; duplicate resolution; citation/locator navigation.

**Avoid.** Turning Learning Compass into a citation manager; copying Zotero's collection model over branches/Threads; embedding mutable annotations only inside PDFs.

### NotebookLM

**Thesis.** NotebookLM's central lesson is inspectable grounding: answers and generated artifacts stay bounded to selected sources and citations navigate back to evidence.

**Verified facts.** NotebookLM answers questions from notebook sources and displays inline citations that navigate to the relevant source location. Users can select which sources participate and save responses as notes while preserving citations. It accepts source types including PDFs, websites, YouTube, audio, EPUB, and common document formats, with source-specific ingestion limitations. It can produce study guides, audio overviews, mind maps, and other derived artifacts. Google describes some agent-like actions as experimental and requiring supervision. Sources: [NotebookLM overview](https://support.google.com/notebooklm/answer/16164461), [chat and citations](https://support.google.com/notebooklm/answer/16179559), [source types](https://support.google.com/notebooklm/answer/16215270), [mind maps](https://support.google.com/notebooklm/answer/16212283).

**Architecture/form factor.** Hosted notebook-per-source-set application with grounded chat and generated study artifacts; implementation architecture is not public.

**Learning Compass inference.** Learning Compass should not replicate NotebookLM. It should store a notebook link as it already can, and import only explicit, cited outputs. The transferable pattern is a citation contract: generated claims without resolvable source evidence are drafts or invalid.

**Adopt.** Source selection before grounded Q&A; inline evidence chips; save-with-citations; clear source-ingestion limitations; explicit handoff to an external NotebookLM notebook.

**Avoid.** Copying external notebook state into D1 wholesale; treating generated summaries as the learner's reflection; unsupervised external actions; allowing citations to point only to an opaque generated companion when the original evidence exists.

### Fabric

**Thesis.** Fabric treats prompts as named, reusable, inspectable patterns with separate contexts, strategies, and sessions.

**Verified facts.** Fabric's official repository organizes AI workflows into reusable “Patterns,” supports custom patterns separately from upstream updates, and exposes contexts, strategies, sessions, CLI, and a REST API with OpenAPI documentation. Sources: [Fabric repository](https://github.com/danielmiessler/Fabric), [REST API documentation](https://github.com/danielmiessler/Fabric/blob/main/docs/rest-api.md).

**Architecture/form factor.** Open-source CLI/server that dispatches versionable prompt patterns across model providers.

**Learning Compass inference.** Hermes job instructions should be treated like code artifacts: named, versioned, schema-bound, and eval-tested. Fabric itself should not own Learning Compass state or become another orchestration runtime.

**Adopt.** Versioned prompt patterns; explicit input/output contracts; small reusable transformations; eval fixtures per pattern; update-safe local customization.

**Avoid.** Free-form prompt execution with canonical write access; external prompt sessions becoming memory; duplicated workflow routing.

### Khoj

**Thesis.** Khoj is an open-source reference for a private assistant that searches personal documents, supports agents/automations, and meets users through multiple clients.

**Verified facts.** Khoj documents self-hosting, semantic search over personal documents, source-grounded answers, agents, automations, and clients including web, browser, Obsidian, Emacs, mobile, and messaging integrations. Sources: [Khoj repository](https://github.com/khoj-ai/khoj), [self-hosting and setup](https://docs.khoj.dev/get-started/setup/).

**Architecture/form factor.** Open-source self-hostable server with multiple clients, document indexing, retrieval, chat, and automations.

**Learning Compass inference.** A source-grounded “ask my learning record” experience is useful, but it should compile a read-only context from existing D1 entities and locators. Writes must continue through the capability registry and receipts.

**Adopt.** Cross-client read-only retrieval; source citations; explicit automation schedules; narrow assistants scoped to a Thread/branch/source.

**Avoid.** A general assistant persona as the primary UI; autonomous writes from chat; a second vector/document store; automations that generate recommendations without an explicit request.

## Especially close open-source learning systems

These projects are useful design evidence, but most are much smaller and less operationally proven than the read-later and PKM systems above. Facts below are limited to claims and code in their official repositories; maturity, data durability, and algorithm quality were not independently validated.

### Incremental Reading Toolkit for Obsidian

**Thesis.** This is the closest open-source workflow match: sources become extracts, extracts become cards, and reading material competes in a priority-aware, progress-aware schedule.

**Verified facts.** The repository describes source-to-extract-to-card flow, a mixed priority queue, progress-aware scheduling, PDF read points, a knowledge tree, analytics, and local-first storage inside Obsidian. It is desktop-focused. Source: [Incremental Reading Toolkit repository](https://github.com/kja140/incremental-reading).

**Architecture/form factor.** Obsidian desktop plugin over vault data and plugin-managed state.

**Learning Compass inference.** This project is the best interaction prototype for incremental resurfacing, not a storage or architecture dependency. Learning Compass can implement the same flow with explicit source checkpoints and typed D1 evidence.

**Adopt.** Source → anchored extract → editable card-draft lineage; progress-aware resurfacing; user-visible priority; learning analytics by source/branch.

**Avoid.** A plugin-local scheduler separate from Learning Compass; treating every extract as card material; desktop-only assumptions.

### Syro

**Thesis.** Syro explores context-aware cards that return to the exact paragraph and an FSRS-scheduled incremental reading queue.

**Verified facts.** Its official repository describes context-aware flashcards, exact-paragraph return, incremental reading, and FSRS scheduling in Obsidian. The project is comparatively small and early. Source: [Syro repository](https://github.com/piyooko/obsidian-syro).

**Architecture/form factor.** Obsidian plugin.

**Learning Compass inference.** Exact-context return is the valuable idea. A second FSRS queue for documents would confuse the current Queue and review model.

**Adopt.** “Open evidence” from card review; anchor repair when document text changes.

**Avoid.** Scheduling sources and cards as indistinguishable objects; relying on paragraph ordinal alone as a durable anchor.

### StudyYield and OpenTutor

**Thesis.** These projects represent the emerging “AI learning OS” bundle: uploads, chat, knowledge graphs, generated study materials, and spaced repetition in one local or self-hosted application.

**Verified facts.** StudyYield's repository describes an open-source learning platform with uploads, knowledge graph, spaced repetition, teach-back, and progress features. OpenTutor describes a local-first AI learning system with a knowledge graph, FSRS, and cognitive-load-aware learning workflows. Sources: [StudyYield repository](https://github.com/studyield/studyield), [OpenTutor repository](https://github.com/zijinz456/OpenTutor).

**Architecture/form factor.** Young open-source web applications; their repositories are the only authority used here.

**Learning Compass inference.** They validate demand for an integrated learning workspace but do not demonstrate the evidence discipline, recommendation controls, or branch/round semantics already present in Learning Compass. Their broad AI feature sets should be treated as discovery inputs, not implementation proof.

**Adopt.** Teach-back as a typed evidence event; source-scoped learning sessions; visible progress from evidence rather than content volume.

**Avoid.** “Upload → generate everything” workflows; AI-created graph nodes as truth; feature breadth without provenance, approval, or policy tests.

### Open Cognition and Spaced Agent

**Thesis.** These projects test agent-facing learning memory and guided card authoring as standalone services.

**Verified facts.** Open Cognition describes an MCP-accessible learning graph with spaced repetition and Feynman-style explanation. Spaced Agent describes guided flashcard authoring, FSRS scheduling, local SQLite storage, and review. Sources: [Open Cognition repository](https://github.com/lfnovo/open-cognition), [Spaced Agent repository](https://github.com/amphetamarina/spaced-agent).

**Architecture/form factor.** Small open-source local services/agents.

**Learning Compass inference.** MCP can make learning state available to agents, but the agent must not own the state model. Guided card critique is useful before approval.

**Adopt.** An agent action that critiques a draft for ambiguity, minimum information, answer leakage, and missing evidence; read-only MCP learning context.

**Avoid.** A second learning graph; simplified scheduling replacing the current FSRS implementation; agent approval on behalf of the learner.

## Discovery, recommendation, and feed systems

### Recommendation architecture: retrieval, ranking, and evaluation

**Verified facts.** TensorFlow Recommenders documents retrieval as the candidate-generation stage of a recommender. Vowpal Wabbit's contextual-bandit documentation formalizes logged context, action, reward, and action probability and documents off-policy estimators such as inverse propensity scoring and doubly robust evaluation. Microsoft's Recommenders repository includes evaluation concepts such as diversity, novelty, serendipity, and coverage. Sources: [TensorFlow Recommenders retrieval task](https://www.tensorflow.org/recommenders/api_docs/python/tfrs/tasks/Retrieval), [Vowpal Wabbit contextual bandits](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html), [off-policy evaluation](https://vowpalwabbit.org/tutorials/off_policy_evaluation.html), [Microsoft Recommenders repository](https://github.com/recommenders-team/recommenders).

**Learning Compass inference.** Learning Compass already separates Hermes candidate research from Worker validation/ranking, logs candidate context, serves bounded fit/bridge/challenge lanes, and uses shadow decisions. The largest measurement gap is a reproducible candidate-set/policy receipt suitable for offline replay. A valid recommendation event should record:

- candidate-set snapshot or immutable hash;
- eligibility and exclusion reasons for every candidate;
- policy, feature, embedding, and scoring versions;
- deterministic scores and final position;
- selection probability if any true exploration is introduced;
- branch, round, intent, and expected Thread contribution;
- later outcome events without treating dismissal as negative taste;
- proof that no feedback event triggered another recommendation request.

The product should prefer shadow comparisons and explicit lane requests over stochastic exploration. A single user's learning time is too scarce for uncontrolled bandit exploration.

**Adopt.** Two-stage candidate generation/ranking; immutable policy receipts; offline replay; calibration, novelty, coverage, creator/domain diversity, and branch-balance metrics; shadow activation gates.

**Avoid.** Optimizing click-through; random exploration without explicit consent; reward definitions based only on rating; auto-serving a next item after feedback; recommending consumed/mastered material.

### FreshRSS

**Thesis.** FreshRSS is a mature reference for self-hosted feed management, WebSub, tags, APIs, extensions, and OPML portability.

**Verified facts.** FreshRSS supports RSS/Atom aggregation, tagging, search, APIs/CLI, sharing, scraping options, WebSub push updates, and OPML import/export. Sources: [FreshRSS repository](https://github.com/FreshRSS/FreshRSS), [WebSub documentation](https://freshrss.github.io/FreshRSS/en/users/WebSub.html), [OPML documentation](https://freshrss.github.io/FreshRSS/en/developers/OPML.html).

**Architecture/form factor.** Self-hosted web feed reader with API, extension, and command-line surfaces.

**Learning Compass inference.** OPML portability and folder/category mapping are immediate wins. WebSub is optional because six-hour polling is likely adequate for one person. Feed-reading features should remain subordinate to deliberate Inbox triage.

**Adopt.** OPML import/export; per-feed health; conditional fetching; clear unread/import state; eventual WebSub support when latency matters.

**Avoid.** Infinite unread-count pressure; auto-Queue from feed updates; importing feed categories as unverified branches.

### Miniflux

**Thesis.** Miniflux demonstrates a small, API-first feed service with conditional filtering and authenticated webhooks.

**Verified facts.** Miniflux supports Atom, RSS, JSON Feed, OPML, enclosures, full-text search, REST API, webhooks, and keep/block rules over title, URL, content, author, tags, and dates. Webhooks can be HMAC-signed and report new or saved entries. Sources: [Miniflux repository](https://github.com/miniflux/v2), [API](https://miniflux.app/docs/api.html), [webhooks](https://miniflux.app/docs/webhooks.html), [filtering rules](https://miniflux.app/docs/rules.html).

**Architecture/form factor.** Minimal self-hosted Go/PostgreSQL service with REST API and webhook integration.

**Learning Compass inference.** JSON Feed and transparent keep/block predicates are practical additions. Rules should control feed ingestion noise, not infer learning value.

**Adopt.** JSON Feed support; HMAC verification for incoming automation; feed-level filters with dry-run match previews; clear sync receipts.

**Avoid.** Automatic “saved” feed entries becoming Queue commitments; filtering that silently deletes evidence; another feed database.

## Capture, portability, and local-first standards

### Web Share Target and browser extensions

**Verified facts.** The Web Share Target API lets an installed PWA register one share target in its web app manifest and receive shared title/text/URL/file data. The Web Share API covers outbound sharing. Chrome Manifest V3 extensions use a service worker, content scripts, actions, and permission-scoped APIs. The context menus API supports page, link, selection, image, video, and other contexts. Manifest V3 forbids remotely hosted extension code. Sources: [Chrome Web Share Target guide](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target), [Web Share Target specification](https://w3c.github.io/web-share-target/), [Web Share specification](https://www.w3.org/TR/web-share/), [Manifest V3 overview](https://developer.chrome.com/docs/extensions/get-started), [context menus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus), [Manifest V3 migration principles](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3).

**Repository fact.** Learning Compass already registers `/api/share-target` in its generated manifest. The extension—not the PWA share target—is the missing capture surface.

**Learning Compass inference.** The extension should be intentionally narrow:

1. Capture current page, link, or selected text.
2. Extract canonical URL, title, author/publisher, language, Schema.org metadata, selected quote, prefix/suffix context, and selector candidates.
3. Show the target Learning Compass instance and a verified existing branch picker; round is derived by the server.
4. Submit through the canonical capture API with an idempotency key.
5. Display the server's canonical receipt, deduplication result, branch/round, and Inbox state.

No browser permission should exist merely for convenience. Prefer `activeTab`, `contextMenus`, and explicit host access over blanket browsing-history permissions. Page HTML should not be shipped to the server unless extraction is requested and permitted.

### Web Annotation as the common locator model

**Verified facts.** The W3C Web Annotation Data Model separates an annotation's body from its target and defines motivations and selectors. Selectors include `TextQuoteSelector` with exact/prefix/suffix context, `TextPositionSelector`, CSS/XPath/fragment selectors, and canonical/via source relationships. The model is JSON-LD but can be projected into relational storage. Source: [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/).

**Learning Compass inference.** Introduce an annotation model in D1 rather than overloading notes or learning units. A practical relational projection is:

| Field group | Required content |
|---|---|
| Identity | annotation id, source/recommendation id, branch id, derived round snapshot, creator (`user` or named job), timestamps, version |
| Target | canonical external URL and/or R2 artifact id, media type, source revision checksum, canonical/via URLs |
| Selector | type plus normalized JSON: exact/prefix/suffix and character positions for text; page/rect for PDF; timestamp/range for audio/video; EPUB/Readium locator for books |
| Body | quote, optional user note, motivation (`highlighting`, `commenting`, `questioning`, `linking`), color/type, language |
| Integrity | content hash, selector confidence, re-anchor status, orphan reason, last verification time |
| Learning links | optional note section, learning unit, SRS draft/card, evidence event, Thread stage |

Use redundant selectors. Exact quote plus prefix/suffix survives modest page changes better than position alone; positions help resolve repeated text. If re-anchoring fails, preserve the annotation and show it as orphaned—never silently point to a different passage.

Annotations remain evidence markers, not proof of learning. A user action or a grounded job may project an annotation into a note/unit/SRS **draft**, but approval and provenance remain explicit.

### EPUB, PDF, and publication locators

**Verified facts.** EPUB 3.3 defines a package document, reading order/spine, navigation, and publication resources. Readium Web provides web reading toolkits, positions, and publication-manifest work. The Readium Web Publication Manifest identifies reading order and resources, and Readium publishes annotation/locator guidance. PDF.js is Mozilla's official HTML5 PDF parser/viewer. Sources: [EPUB 3.3](https://www.w3.org/TR/epub-33/), [Readium Web](https://github.com/readium/web), [Readium Web Publication Manifest](https://readium.org/webpub-manifest/), [Readium annotations](https://github.com/readium/annotations), [PDF.js](https://github.com/mozilla/pdf.js).

**Learning Compass inference.** Add EPUB as an ingestible source type in two phases:

- **Phase 1:** parse metadata, table of contents, reading order, language, and stable locators; extract text for private search; keep consumption in an external reader and store progress/annotation locators.
- **Phase 2 only if justified:** a bounded reader for user-owned files or verified companions, using Readium rather than inventing EPUB rendering.

For PDFs, store page number plus text quote/context and optional rectangle. PDF text layers can change across processors, so page-only or offset-only selectors are inadequate. Use PDF.js for inspection/annotation only where the source is an uploaded artifact or approved companion; do not turn every external PDF into an internal copy by default.

### Readability and safe extraction

**Verified facts.** Mozilla Readability extracts article title, author, content HTML, text content, excerpt, site name, language, and related metadata from a DOM. Its official repository warns that extracted output should be sanitized when used with untrusted input and recommends script-disabled parsing and a sanitizer such as DOMPurify. Source: [Mozilla Readability](https://github.com/mozilla/readability).

**Learning Compass inference.** A capture-enrichment pipeline should be staged and observable:

1. Canonicalize and SSRF-check the URL.
2. Fetch with bounded redirects, size, type, and timeout.
3. Extract authoritative metadata from HTTP, OpenGraph, Schema.org, and document fields.
4. Run Readability for ordinary articles.
5. Validate extraction by length, title match, text density, language, and duplicate boilerplate signals.
6. If explicitly permitted and needed, use browser rendering for JavaScript-dependent pages.
7. Sanitize; compute content and evidence hashes; store the mutable source record in D1 and optional immutable body/snapshot in R2.
8. Return a receipt with extraction method, confidence, limitations, and deduplication result.

This pipeline enriches capture and search. It does not make extracted HTML an approved reading substitute; only the existing canonical Arabic companion workflow can do that.

### Local-first synchronization: Automerge, Yjs, and HTTP preconditions

**Verified facts.** Automerge and Yjs are CRDT libraries designed for concurrent local-first applications with storage and network adapters. HTTP conditional requests support entity tags and `If-Match` preconditions to prevent lost updates. JSON Patch defines a standard list of document changes. Sources: [Automerge documentation](https://automerge.org/docs/), [Yjs documentation](https://docs.yjs.dev/), [HTTP Semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110), [JSON Patch, RFC 6902](https://www.rfc-editor.org/rfc/rfc6902).

**Learning Compass inference.** Whole-system CRDT adoption is unjustified for a private single-user D1-canonical application. Borrow the conflict semantics, not the storage model:

- version every offline-mutable object;
- send an expected version or ETag with mutations;
- reject stale writes with current server state and a human-readable diff;
- use the existing idempotency reservation/receipt approach for retries;
- allow deliberate merge for long notes, but never silently last-write-wins branch, feedback, review, or recommendation state.

## Cloudflare/Hono/Preact architecture opportunities

### D1 and R2

**Verified facts.** D1 documents database and row/blob limits, query limits, Time Travel point-in-time recovery, and a Sessions API/bookmarks for sequential consistency with read replication. R2 event notifications can publish object events to Cloudflare Queues. Sources: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [R2 event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/).

**Learning Compass inference.** Keep the current ownership model:

- D1: source identity/status, sessions, annotations, notes, evidence, cards, branch/round, jobs, receipts, hashes.
- R2: original uploads, immutable capture snapshots when retained, extracted bodies too large for D1, Arabic HTML/PDF companions, and export bundles.
- Vectorize: derived embeddings only.
- Observability systems: noncanonical operational signals only.

Add a portable backup command/job that exports D1, writes a schema/version manifest and R2 inventory with checksums, and verifies restore into a disposable database. Time Travel is an operational safety net, not a substitute for a user-owned export.

### Queues and Workflows

**Verified facts.** Cloudflare Queues provides at-least-once delivery, batching, retries, delays, and dead-letter queues; consumers must be idempotent. Cloudflare Workflows provides durable multi-step execution with retries, waits, and event-based continuation. Sources: [Queues](https://developers.cloudflare.com/queues/), [delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [batching and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/), [Workflows guide](https://developers.cloudflare.com/workflows/get-started/guide/), [workflow events](https://developers.cloudflare.com/workflows/build/events-and-parameters/).

**Learning Compass inference.** Do not replace Hermes job leases, capability guards, idempotency reservations, or exact-conversation execution with Queues/Workflows. That would create two job authorities and blur human-visible receipts. A narrow future use is transport for deterministic, non-Hermes artifact post-processing—such as checksum generation, thumbnailing, or extraction after an R2 upload—provided D1 remains the job/status authority and duplicate delivery is harmless.

### Search: D1 FTS, Vectorize, Workers AI, and reranking

**Verified facts.** Vectorize supports namespaces and metadata filtering before vector search. Cloudflare Workers AI publishes multilingual embedding models including BGE-M3 and reranking models including BGE reranker variants. Vector indexes are dimension-specific, so model changes require compatible indexes. Sources: [Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/), [Vectorize query guidance](https://developers.cloudflare.com/vectorize/best-practices/query-vectors/), [Vectorize API](https://developers.cloudflare.com/vectorize/reference/client-api/), [Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/).

**Repository fact.** `src/services/semantic-retrieval.ts` currently truncates text to 6,000 normalized characters, embeds with `@cf/baai/bge-base-en-v1.5`, expects 768 dimensions, and stores only `kind` and `source_id` metadata in namespace `learning-compass`.

**Learning Compass inference.** Implement retrieval v2 as a shadow system:

1. Define a versioned `semantic_document` contract with language, branch, round, status, source type, Thread/stage, provenance kind, content version, and chunk locator.
2. Chunk long source-derived text by meaningful boundaries instead of one 6,000-character prefix. Keep each chunk linked to an annotation or source locator.
3. Build a separate multilingual index; never mutate the production index in place.
4. Retrieve from D1 FTS and Vectorize in parallel, fuse ranks deterministically, then rerank a small candidate set.
5. Filter before vector retrieval by eligible entity/status/branch when the query provides scope.
6. Return evidence snippets and locators, not just entity IDs and cosine scores.
7. Test Arabic, English, code-switched queries, named entities, transliteration, and exact quotation lookup.
8. Shadow-log relevance and latency; activate only after a documented gate beats the current lexical/semantic baseline without increasing policy violations.

This is the highest-value technical enhancement because it improves search, recommendations, grounded assistance, duplicate detection, and branch navigation at once.

### Browser Rendering

**Verified facts.** Cloudflare Browser Rendering exposes APIs for rendered content, PDF, screenshots, scraping, snapshots, Markdown, accessibility trees, and crawling. Source: [Browser Rendering REST API](https://developers.cloudflare.com/browser-rendering/rest-api/).

**Learning Compass inference.** Use Browser Rendering as a bounded extraction fallback for JavaScript-heavy pages and possibly deterministic companion render verification—not as the default fetcher. Apply URL allow/deny policy, private-address blocking, response-size limits, script/download controls, and content checksums. Record the fallback in the source receipt. Existing Hermes browser work may remain preferable where signed-in sessions or source-specific judgment are required.

### MCP over the existing capability registry

**Verified facts.** MCP defines server capabilities, tools/resources/prompts, transports, and an authorization profile. Cloudflare documents remote MCP servers over Streamable HTTP and OAuth, recommends a small tool surface aligned with user goals, and documents evaluation practices. The official TypeScript SDK supplies server/client support; its repository notes version stability status. Cloudflare also documents a “Code Mode” approach that exposes a small search/execute surface rather than thousands of native tools. Sources: [MCP specification](https://modelcontextprotocol.io/specification/), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Cloudflare remote MCP guide](https://developers.cloudflare.com/agents/model-context-protocol/), [MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [servers for Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/).

**Learning Compass inference.** The current `list_capabilities` + guarded `site_request` pattern is already closer to a safe MCP design than an endpoint-per-tool server. Add an adapter, not a new control plane:

- generate MCP tool/resource metadata from the same capability registry and schemas that generate OpenAPI;
- expose read-only context/search/record resources first;
- keep mutations behind `site_request`, existing dry-run impact, high-risk preconditions, idempotency reservation, and canonical readback;
- authenticate with Cloudflare Access or a scoped OAuth flow; bind scopes to capability tiers;
- never expose raw D1/R2/Vectorize access;
- pin and test the stable SDK generation before production use.

### Observability and AI Gateway

**Verified facts.** Workers Logs supports structured JSON logs, search, sampling, and uncaught-error capture with bounded retention. Workers supports source-map upload and distributed traces/custom spans. Analytics Engine supports high-cardinality event analytics queried with SQL. AI Gateway offers model request analytics, logging, caching, rate limits, retries, and fallbacks. Its logging can retain prompts and responses. Sources: [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [source maps](https://developers.cloudflare.com/workers/observability/source-maps/), [traces](https://developers.cloudflare.com/workers/observability/traces/), [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/), [AI Gateway](https://developers.cloudflare.com/ai-gateway/), [AI Gateway logging](https://developers.cloudflare.com/ai-gateway/observability/logging/).

**Learning Compass inference.** Enable operational observability with strict redaction:

- JSON logs: request/job/receipt id, route/capability, status, duration, retry count, result class, model/policy version—never note bodies, reflections, quotes, source text, tokens, or full URLs with private query strings.
- Traces: capture → enrichment → D1/R2/index/job boundaries; sample successes and retain errors at higher rates.
- Source maps: enable for Worker and client production errors.
- Analytics Engine: aggregate queue latency, extraction failure class, index lag, retrieval latency, job retries, and companion validation outcomes. It must never become learning truth.
- AI Gateway: use only when its provider routing adds value, disable or redact prompt/response logging for private source and reflection content, and avoid shared caching of personal prompts.

## Product-quality and agent evals

**Verified facts.** Inspect is the UK AI Security Institute's open-source evaluation framework with datasets, tasks, agents, tools, scorers, logs, and MCP support. OpenAI Evals supports registry-based and custom evals, including private data. Sources: [Inspect documentation](https://inspect.aisi.org.uk/), [Inspect scoring](https://inspect.aisi.org.uk/scoring.html), [OpenAI Evals repository](https://github.com/openai/evals).

**Learning Compass inference.** Most regression protection belongs in the existing Node/unit/E2E stack; a heavyweight eval framework is optional for multi-step Hermes scenarios. Build versioned, private fixtures for:

| Eval suite | Minimum cases | Pass condition |
|---|---|---|
| Capture/extraction | static article, JS article, paywall/login, malformed metadata, redirect loop, oversized page, PDF, Arabic page, duplicate URL/content | Safe failure or correct canonical metadata; no SSRF; deterministic content hash; explicit extraction method |
| Annotation anchoring | repeated quote, edited page, Unicode/Arabic normalization, PDF line wrap, timestamp, missing source revision | Exact or confidence-bounded re-anchor; otherwise preserved orphan; never wrong silent anchor |
| Bilingual retrieval | Arabic query→Arabic source, Arabic→English source, English→Arabic, code-switch, transliteration, exact quote, branch-scoped query | Relevance threshold beats current baseline; locators valid; ineligible items zero |
| Recommendation policy | consumed/mastered duplicates, blocked creator/domain, branch mismatch, queue full, book disallowed, fit/bridge/challenge, neutral dismissal | Exclusions 100%; branch+round 100%; deterministic receipt; no post-feedback recommendation call |
| Notes/evidence | sourced assertion, user reflection, model inference, contradictory evidence, stale source revision | Provenance type correct; every generated claim has resolvable evidence; reflection never model-authored |
| SRS | rating boundary, draft edit, reject, approve, leech, scheduler version change | No unapproved card due; history preserved; source context opens correctly |
| Agent mutations | retry, duplicate request, stale precondition, partial batch, readback failure, lease expiry | At-most-one canonical effect; explicit committed/unverified state; no raw-state bypass |
| Arabic companion | sparse source, long source, no visuals, mixed language, transcript padding, bad pagination, mobile/tablet/A4 | Existing semantic coverage and render gates pass; one canonical body; linked HTML/PDF hashes verified |

Recommended activation rule: every model, prompt pattern, extraction rule, ranking policy, embedding model, or agent schema change runs the relevant fixture suite in shadow before becoming active. Record the eval version in the deployed capability/policy receipt.

## Recommended target workflow

The enhanced workflow should remain deliberately closed-loop:

```text
external source / share / RSS / Telegram / file
    → canonicalize + deduplicate + verified branch selection
    → Inbox receipt
    → metadata/text enrichment + optional immutable R2 snapshot
    → explicit Queue promotion (max 5)
    → original source or verified Arabic companion
    → progress + source-anchored highlights/questions
    → user reflection
    → structured bilingual notes and learning units with evidence links
    → editable SRS drafts (rating 7–10 or explicit user action)
    → explicit approval
    → FSRS review + recall/transfer/application evidence
    → branch/round progression and outcome analytics
    → stop; recommendation research only on a later explicit request
```

### Workflow refinements

1. **Capture is a receipt, not a black box.** Return normalized URL, deduplication result, source type, extraction state, branch+round, and Inbox status. If a browser selection is included, create an annotation only after verifying its source target.
2. **Triage uses suggestions, not silent automation.** Rules may propose source type, tags, a verified existing branch, estimated duration, or archive/exclude action. The user confirms branch changes and Queue promotion.
3. **Reading produces locators, not copied knowledge by default.** Progress and highlights target the original source. Optional snapshots protect evidence but do not become the primary reader.
4. **Derived learning objects declare provenance.** `source_evidence`, `user_reflection`, and `model_inference` must be visibly different. A generated note can summarize evidence; it cannot claim the user's stance.
5. **Incremental resurfacing is separate.** A source checkpoint can appear in Today/Practice without creating a new Queue item. It points into an already queued/in-progress source or a learner-selected archived excerpt.
6. **Review reconnects to context.** Every draft/card can open its evidence passage and owning source dossier. Leeches route to edit, split, add context, or suspend.
7. **Outcome closes the loop.** Feedback updates canonical outcomes/profile evidence through the current policy system and returns to a neutral state. It never requests or stages a new recommendation.

## Concrete architecture additions

This is a conceptual target, not an instruction to implement all tables immediately.

### 1. Annotation and locator service

Create a deep module whose public interface is about user intent, not storage details:

- `createAnnotation(source, selector, body, branchContext)`
- `resolveAnnotation(annotationId, currentSourceRevision)`
- `listSourceAnnotations(sourceId, filters)`
- `linkAnnotation(annotationId, targetLearningObject)`
- `exportAnnotations(versionCursor)`

Internally it can normalize W3C selectors, resolve media-specific locators, hash context, and project links to existing `unit_anchors`. Do not let browser clients write selector JSON directly without validation.

### 2. Provenance contract

Use one evidence-reference shape across notes, units, cards, companion spans, and recommendation rationales:

```json
{
  "source_id": "...",
  "artifact_id": null,
  "source_revision": "sha256:...",
  "annotation_id": "...",
  "selector": { "type": "TextQuoteSelector", "exact": "..." },
  "evidence_role": "supports",
  "language": "ar"
}
```

The actual selector can remain normalized in the annotation table and be referenced by id to avoid duplication. A provenance enum should distinguish direct source evidence, user observation/reflection, and model inference. Inferences require their supporting evidence and may never be silently upgraded to fact.

### 3. Retrieval v2 service

Treat chunking, embedding, fusion, reranking, and evidence rendering as one versioned module. It should return domain objects plus resolvable evidence, not raw vector matches. Its interface should support branch/Thread/type/status/language scopes so recommendation research and “search my learning” cannot accidentally include blocked or stale records.

### 4. Capture adapter framework

Normalize every channel—web UI, Share Target, extension, Telegram, RSS/Atom/JSON Feed, file upload—into the same validated capture command and receipt. Channel adapters may parse inputs but may not set Queue state, create branches, or bypass duplicate/entity checks.

### 5. Portable export and restore verifier

Produce:

- schema/application/policy versions;
- D1 table exports or database export;
- Markdown/JSON projections of sources, notes, annotations, cards, and branches;
- OPML subscriptions;
- R2 inventory with size, content type, role, owning source, and checksum;
- explicit omissions/secrets list;
- restore-verification report from a disposable environment.

Obsidian remains one Markdown projection, not the backup format or restore authority.

## Hermes skills and tool opportunities

These are proposed responsibilities for the existing Hermes ecosystem. They should be implemented as small versioned skills over canonical APIs, not broad autonomous agents.

### Source capture and enrichment

- Inputs: URL/file/share payload, explicit existing branch, channel metadata.
- Responsibilities: canonicalization, metadata extraction, dedupe evidence, extraction fallback decision, safe source receipt.
- Forbidden: Queue promotion, branch creation, recommendation generation, unsupported claims about extraction completeness.

### Evidence anchor and repair

- Inputs: source revision and annotation selectors.
- Responsibilities: deterministic exact/context/position resolution, confidence, orphan preservation, source-revision receipt.
- Forbidden: silently changing a quote or linking to a merely similar passage.

### Grounded synthesis

- Inputs: bounded source/evidence ids and requested output schema.
- Responsibilities: source-backed summary or bilingual note draft, citation coverage, explicit inference labeling.
- Forbidden: writing personal reflection, approving SRS, expanding beyond selected sources.

### Recall-draft critic

- Inputs: editable draft plus evidence and desired learning objective.
- Responsibilities: flag ambiguity, multi-part prompts, answer leakage, weak cues, unsupported answers, and missing application context; propose revisions.
- Forbidden: approving, scheduling, or deleting cards.

### Recommendation slate auditor

- Inputs: immutable candidate-set and policy receipt.
- Responsibilities: verify reachability, consumed/mastered exclusion, branch+round, lane coverage, evidence quality, source diversity, and no feedback-chain request.
- Forbidden: sourcing new candidates unless the user explicitly requested recommendations; activating a Queue item.

### Bilingual retrieval evaluator

- Inputs: private fixture set and candidate retrieval version.
- Responsibilities: run Arabic/English/code-switch relevance tests, policy filtering, citation resolution, latency and cost comparison; emit activation receipt.
- Forbidden: switching the live index or rewriting canonical text.

### Companion evidence auditor

- Inputs: canonical source evidence, Arabic body, HTML/PDF artifacts, checksums/renders.
- Responsibilities: enforce the existing complete-source, one-body, zero-visual-allowed, deterministic validation and page/responsive inspection policy.
- Forbidden: subjective scores, transcript padding, auto-chaining Notes Extractor.

## What not to build

The landscape makes several tempting directions look attractive but strategically wrong:

1. **A universal in-app reader.** It conflicts with original-source consumption, creates a large parsing/rendering/accessibility burden, and duplicates Reader/Readeck/Omnivore. Build locators and handoffs; keep the Arabic companion as the deliberate exception.
2. **A generic block editor or user-defined object system.** Learning Compass's explicit source, session, note, unit, evidence, card, branch, and recommendation semantics are an advantage.
3. **A second canonical local-first database.** CRDT libraries solve multi-writer replication, not this product's current problem. Use versions, idempotency, and visible conflicts around D1.
4. **Automatic AI taxonomy.** Suggested tags/branches may help triage, but canonical branch assignment must be valid and verified.
5. **Automatic card publication.** AI can draft and critique; the learner approves.
6. **An endless recommendation feed.** Recommendation research remains explicit, bounded, source-grounded, and separated from feedback.
7. **A heavyweight search cluster by default.** D1 FTS + Vectorize + Workers AI can support this scale. Add another engine only after measured recall/latency limits.
8. **Cloudflare Queues/Workflows as a second Hermes.** Use them only for bounded deterministic transport if a concrete need appears.
9. **Content-heavy observability.** Logs and AI gateways must not retain private source bodies, reflections, notes, or prompts merely for convenience.
10. **Vanity learning analytics.** Counts, streaks, and graph density are not mastery. Prioritize recall strength, transfer/application evidence, branch progress, workload, and source outcomes.

## Phased roadmap with acceptance gates

### Wave 0 — containment, canonical integrity, and recovery

**Deliverables**

- Cloudflare Access for the complete private app, separate human and Hermes policies, origin-side token validation where required, restricted CORS, and reviewed security headers.
- Rotated webhook/automation secrets; Telegram secret-header, allowed-chat, and update-deduplication enforcement.
- One canonical capture transaction used by every adapter; Inbox-only creation and server-enforced branch/derived-round requirements.
- Versioned complete D1/R2 backup plus a disposable restore rehearsal.
- CI gates for migrations, Hermes, agent contract, integration journeys, and black-box production authentication.

**Gate**

- Anonymous private reads and all mutations are denied before application routing.
- The human UI and a narrowly scoped Hermes service token complete their intended flows.
- Every new canonical capture is in Inbox, has a valid branch and derived round, and returns a receipt matching D1.
- Queue promotion is explicit and cannot exceed five without the existing explicit override policy.
- A forged Telegram webhook is rejected and duplicate `update_id` produces no second effect.
- Restore into a disposable environment reproduces IDs, counts, relationships, schema version, and R2 checksums.
- Production is built from a reviewed commit with the deployed migration and contract versions recorded.

### Wave 1 — evidence integrity and capture continuity

**Deliverables**

- W3C-inspired D1 annotation/locator model.
- Original-source “open at evidence” for web text, PDF page/quote, and video timestamp.
- Manifest V3 capture extension for page/link/selection with explicit branch selection and receipt readback.
- Unified channel adapter contract for existing Share Target, Telegram, RSS, and browser capture.
- Versioned portable export manifest and first restore rehearsal.

**Gate**

- 100% of extension captures enter Inbox with valid branch+round.
- Duplicate/retry causes one canonical effect.
- Annotation fixtures never silently resolve to the wrong passage.
- No new source enters Queue without explicit promotion.
- Export restore reproduces counts, identities, relationships, and R2 checksum inventory.

### Wave 2 — bilingual retrieval and provenance

**Deliverables**

- Chunked, multilingual shadow index and metadata filters.
- Lexical/vector rank fusion plus bounded reranking.
- Common provenance/evidence-reference contract.
- Search results and generated objects expose navigable evidence.
- Private Arabic/English/code-switch eval set.

**Gate**

- Retrieval v2 beats the current system on the fixed relevance set.
- Consumed/mastered/blocked policy leakage is zero in recommendation contexts.
- Every generated factual assertion in the eval set has resolvable evidence or is rejected.
- No D1 canonical state depends on Vectorize availability.

### Wave 3 — incremental learning and smart triage

**Deliverables**

- Source/extract checkpoints in Today/Practice, distinct from Queue and SRS.
- Annotation → note/unit/draft actions with provenance.
- Desired-retention/workload preview and leech workflow.
- Saved searches/query grammar, feed rules with dry-run, JSON Feed, OPML import/export.

**Gate**

- Queue cap behavior is unchanged.
- No checkpoint creates a recommendation or approved card.
- Every recall draft still requires explicit approval.
- Rules have match previews, audit receipts, and no branch creation authority.

### Wave 4 — controlled interoperability and operations

**Deliverables**

- Read-only-first MCP adapter generated from the capability registry.
- Privacy-safe structured logs, source maps, traces, and operational metrics.
- Multi-step Hermes eval harness where normal tests are insufficient.
- Optional EPUB locator ingestion and OPDS handoff.

**Gate**

- MCP and REST produce identical canonical receipts for the same allowed operation.
- Raw D1/R2 access is impossible through MCP.
- Telemetry payload tests prove private bodies/prompts are absent.
- EPUB/OPDS support does not create an internal-reader requirement.

## Decision matrix

| Candidate investment | User value | Fit with architecture | Risk | Decision |
|---|---:|---:|---:|---|
| Access control + secret rotation | Critical | Very high | Low-medium | Build immediately |
| Capture/branch invariant repair | Critical | Very high | Medium | Build immediately |
| Complete verified backup/restore | Critical | Very high | Low-medium | Build immediately |
| Source annotations + durable locators | Very high | Very high | Medium | Build first after Wave 0 |
| Multilingual hybrid retrieval | Very high | Very high | Medium | Build in shadow, then gate |
| Provenance/citation contract | Very high | Very high | Medium | Build with annotations |
| Browser extension | High | High | Medium | Build after annotation API |
| Extraction fallback pipeline | High | High | Medium | Build incrementally with fixtures |
| Incremental source checkpoints | High | High | Medium | Build after locators |
| Saved views/rules/OPML/JSON Feed | Medium-high | High | Low | Build in P1 |
| MCP adapter | Medium | Very high | Medium | Read-only first in P3/P4 |
| EPUB metadata/locators | Medium | High | Medium | Phase after web/PDF anchors |
| OPDS export | Medium | High | Low-medium | Small experiment |
| WebSub | Low-medium | Medium | Medium | Defer until polling pain exists |
| Full internal reader | Medium | Low | Very high | Do not build |
| CRDT canonical state | Low | Low | Very high | Do not build |
| New search cluster | Low at current scale | Medium | High | Defer until measured need |
| Autonomous recommendation agent | Negative under invariants | Low | Very high | Explicitly reject |

## Final product thesis

The category opportunity is not “save everything and chat with it.” It is:

> **A private learning control system that keeps commitment scarce, consumption connected to real sources, every derived idea inspectably grounded, recall explicitly approved, and recommendations accountable to a branch-level learning objective.**

Read-it-later products provide better capture and annotation mechanics. PKM products provide flexible linking and views. SRS products provide mature scheduling. Research assistants provide citations. Agent platforms provide interoperability. Learning Compass should absorb those mechanics behind its existing invariants while keeping its stronger opinion about how learning progresses.

After Wave 0 containment, integrity, and recovery are funded, the three highest-value product enhancements are **durable source annotations**, **multilingual evidence-returning retrieval**, and **a provenance contract across notes/units/cards/recommendations/companions**. Together they deepen almost every existing feature without changing what Learning Compass is.

## Primary source index

The links below are grouped for auditability. They repeat sources cited inline; no secondary sources were used.

### Readers and capture

- Readwise: [Reader docs](https://docs.readwise.io/reader/docs), [API](https://readwise.io/reader_api), [Ghostreader reference](https://docs.readwise.io/reader/guides/ghostreader/reference)
- Omnivore: [repository](https://github.com/omnivore-app/omnivore), [self-hosting](https://docs.omnivore.app/self-hosting/self-hosting.html), [ElevenLabs announcement](https://elevenlabs.io/blog/omnivore-joins-elevenlabs)
- Wallabag: [repository](https://github.com/wallabag/wallabag), [user docs](https://doc.wallabag.org/), [API](https://doc.wallabag.org/developer/api/)
- Readeck: [official site](https://readeck.org/en/), [repository](https://codeberg.org/readeck/readeck), [Go source mirror](https://pkg.go.dev/codeberg.org/readeck/readeck)
- Karakeep: [repository](https://github.com/karakeep-app/karakeep), [documentation](https://docs.karakeep.app/)

### PKM and learning

- Obsidian: [help](https://obsidian.md/help/), [Web Clipper](https://obsidian.md/help/web-clipper), [clipper repository](https://github.com/obsidianmd/obsidian-clipper)
- Logseq: [repository](https://github.com/logseq/logseq), [database docs](https://github.com/logseq/docs/blob/master/db-version.md)
- Anytype: [client repository](https://github.com/anyproto/anytype-ts), [documentation repository](https://github.com/anyproto/docs)
- Capacities: [official documentation](https://docs.capacities.io/)
- Anki: [manual](https://docs.ankiweb.net/), [FSRS/deck options](https://docs.ankiweb.net/deck-options.html)
- SuperMemo: [incremental reading](https://www.super-memory.org/archive/help/read.htm), [priority](https://www.super-memory.org/archive/help/priority.htm), [knowledge formulation](https://supermemo.guru/wiki/20_rules_of_knowledge_formulation)
- RemNote: [source documents](https://help.remnote.com/en/articles/6030712-document-sources), [reader](https://help.remnote.com/en/articles/6690975-learning-from-pdfs-and-files-with-the-remnote-reader)
- SiYuan: [repository](https://github.com/siyuan-note/siyuan)

### Research assistants and close open-source projects

- Zotero: [documentation](https://www.zotero.org/support/), [Web API](https://www.zotero.org/support/dev/web_api/v3/start)
- NotebookLM: [overview](https://support.google.com/notebooklm/answer/16164461), [citations](https://support.google.com/notebooklm/answer/16179559), [sources](https://support.google.com/notebooklm/answer/16215270)
- Fabric: [repository](https://github.com/danielmiessler/Fabric)
- Khoj: [repository](https://github.com/khoj-ai/khoj), [documentation](https://docs.khoj.dev/)
- Incremental Reading Toolkit: [repository](https://github.com/kja140/incremental-reading)
- Syro: [repository](https://github.com/piyooko/obsidian-syro)
- StudyYield: [repository](https://github.com/studyield/studyield)
- OpenTutor: [repository](https://github.com/zijinz456/OpenTutor)
- Open Cognition: [repository](https://github.com/lfnovo/open-cognition)
- Spaced Agent: [repository](https://github.com/amphetamarina/spaced-agent)

### Feeds, standards, and interoperability

- FreshRSS: [repository](https://github.com/FreshRSS/FreshRSS), [WebSub](https://freshrss.github.io/FreshRSS/en/users/WebSub.html), [OPML](https://freshrss.github.io/FreshRSS/en/developers/OPML.html)
- Miniflux: [repository](https://github.com/miniflux/v2), [API](https://miniflux.app/docs/api.html), [webhooks](https://miniflux.app/docs/webhooks.html)
- Web Share Target: [Chrome guide](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target), [specification](https://w3c.github.io/web-share-target/)
- Browser extensions: [Chrome extensions docs](https://developer.chrome.com/docs/extensions/), [context menus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)
- Web Annotation: [W3C Recommendation](https://www.w3.org/TR/annotation-model/)
- EPUB: [EPUB 3.3](https://www.w3.org/TR/epub-33/), [Readium Web](https://github.com/readium/web), [Web Publication Manifest](https://readium.org/webpub-manifest/)
- PDF.js: [repository](https://github.com/mozilla/pdf.js)
- Readability: [repository](https://github.com/mozilla/readability)
- Local-first/conflicts: [Automerge](https://automerge.org/docs/), [Yjs](https://docs.yjs.dev/), [HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110), [JSON Patch](https://www.rfc-editor.org/rfc/rfc6902)
- MCP: [specification](https://modelcontextprotocol.io/specification/), [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

### Cloudflare and evaluation

- Access and API security: [self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/), [authorization cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/), [rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- Hono contracts: [validation](https://hono.dev/docs/guides/validation), [typed RPC](https://hono.dev/docs/guides/rpc), [Zod OpenAPI example](https://hono.dev/examples/zod-openapi)
- Telegram: [Bot API and webhook secret token](https://core.telegram.org/bots/api#setwebhook)
- Extraction/enrichment: [DOMPurify](https://github.com/cure53/DOMPurify), [PyMuPDF](https://pymupdf.readthedocs.io/en/latest/), [OCRmyPDF](https://ocrmypdf.readthedocs.io/en/latest/), [Tesseract](https://github.com/tesseract-ocr/tesseract), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [Calibre](https://manual.calibre-ebook.com/)
- Engineering quality: [axe-core](https://github.com/dequelabs/axe-core), [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci), [Knip](https://knip.dev/), [Biome](https://biomejs.dev/), [oxlint](https://oxc.rs/docs/guide/usage/linter.html), [CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql), [Dependabot](https://docs.github.com/en/code-security/dependabot)
- D1: [limits](https://developers.cloudflare.com/d1/platform/limits/), [read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- R2: [event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/)
- Queues: [documentation](https://developers.cloudflare.com/queues/), [delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- Workflows: [documentation](https://developers.cloudflare.com/workflows/)
- Vectorize: [documentation](https://developers.cloudflare.com/vectorize/), [metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
- Workers AI: [model catalog](https://developers.cloudflare.com/workers-ai/models/)
- Browser Rendering: [REST API](https://developers.cloudflare.com/browser-rendering/rest-api/)
- MCP on Cloudflare: [documentation](https://developers.cloudflare.com/agents/model-context-protocol/)
- Observability: [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [traces](https://developers.cloudflare.com/workers/observability/traces/), [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/), [AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- Recommender evaluation: [Vowpal Wabbit contextual bandits](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html), [TensorFlow Recommenders](https://www.tensorflow.org/recommenders), [Microsoft Recommenders](https://github.com/recommenders-team/recommenders)
- Agent evals: [Inspect](https://inspect.aisi.org.uk/), [OpenAI Evals](https://github.com/openai/evals)
