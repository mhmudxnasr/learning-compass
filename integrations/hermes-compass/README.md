# Native Compass tools

The `compass-native` plugin runs in Mahmood's default Hermes profile. It adds native tool inputs over existing clients without changing Hermes core, deploying the Worker, creating an MCP server, or duplicating canonical product state.

## Tools and ownership

- `compass_read`, `compass_capabilities`, and `compass_mutate` use the site-operator client. Narrow paths cover context, source records, evidence search, jobs, and receipts. Mutations use `/agent/request`; no direct-write escape hatch is exposed.
- `compass_extract` uses the current `extract_source.py`. It writes the complete accepted body and extraction receipt, checks their SHA-256 binding, and leaves teaching/publication to the existing skills. YouTube remains caption-first, with audio disabled by default.
- `compass_pdf_evidence` writes page-anchored text, native annotations, highlight text, and ink coordinates to JSON. Empty pages may use installed Tesseract `ara+eng`. OCR is uncertain machine text; handwritten ink requires the existing vision workflow. Batches are limited to 200 pages.
- `compass_notebooklm` uses the installed CLI for health, notebook/source/artifact reads, source addition, Q&A, and explicit no-wait generation. It requires full UUIDs. It never deletes conversations, polls, shares, or writes Compass lifecycle records. Operations outside this wrapper retain the CLI fallback.
- `compass_exa_search` calls Exa with the existing credential. It is an additional public discovery tool, not a replacement for Tavily or the Worker's recommendation checks. It sends no private Compass context automatically and refuses redirects that could forward the credential.

The existing router and focused skills still decide intent, authority, evidence, and completion. The plugin does not introduce a competing procedural skill. A pre-tool hook binds a context-local turn identity for the site client's ledger; an inherited caller identity takes precedence. No hook schedules work or mutates learning records.

## Installation and recovery

Run `python integrations/hermes-compass/install.py` from this worktree. It copies only runtime files to `~/.hermes/plugins/compass-native`, checks hashes, and saves any prior installation outside the active plugin directory. Activate with `hermes plugins enable compass-native --no-allow-tool-override` and `hermes tools enable compass_native --platform cli` (also enabled for Telegram).

New CLI sessions discover the tools. Existing conversations retain their cached tool surface and use the first-party CLI fallback. The gateway needs a supported graceful restart after runtime updates. Disable only this plugin with `hermes plugins disable compass-native` to roll back tool exposure; restore a captured runtime backup if needed. Other toolsets and provider defaults are unchanged.

Retired `learning-compass-bridge`, `learning-thread-curation`, and `learning-compass-visual-companion-operations` are disabled and preserved under `~/.hermes/skill-archives/native-compass-tools`. Their owners are site-operator, learning-thread-authoring, and lite-visual. Modified skill snapshots and before-copies are kept beside the implementation for review; only the installed skill tree is active.

## Verification

`python integrations/hermes-compass/test_native.py -v` exercises registration, guarded mutation dispatch, exact notebook IDs, no destructive chat reset, quiz's actual CLI flags, turn identity, output bounds, process timeout, local text extraction, and PDF annotations. `hermes plugins doctor compass-native --ci` uses real runtime discovery and registration. Live runtime dispatch has read Worker health and NotebookLM notebooks successfully. The Worker accepted a guarded analytics dry-run. A live ProPublica article passed canonical extraction and hash verification.

The Exa/Tavily trial used the same two public queries, with five results per engine per query. Exa returned original publisher/research links rather than the book chapter and social result seen in the comparator. Exa took 1.333 and 1.151 seconds; Tavily took 2.679 and 1.963 seconds. Exa reported $0.014 total for this trial. These are small-sample discovery observations, not a claim of better recommendations across all topics.

No real notebook was created, no Studio generation was started, and no learning source was captured for testing. Timed-media/provider generation availability is not certified by these smoke checks; their existing adapters and gates remain authoritative.

## Release integration

The repository release gate now follows native Hermes's single installed tree, retains the explicitly owned native GUI/design skills, checks installed adapter byte parity, and measures actual Telegram tool schemas and complete memory loading offline. It does not select a different model or recreate the retired profile.

Improvement receipt creation, completion, and rollback now declare an exact canonical readback at `/analytics/hermes/improvements?id=<receipt-id>`. Native mutations use the existing guard; the former registry-omission workaround is no longer needed after deployment. The historical skill snapshots remain attached to this integration's original implementation; the installed skill tree and current repository contract are authoritative.
