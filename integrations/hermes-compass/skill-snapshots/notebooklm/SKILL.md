---
name: notebooklm
description: Use Google NotebookLM for explicit grounded Q&A, recommendation-feedback grounding, source management, and explicitly requested Studio artifacts through the local notebooklm CLI.
---

# NotebookLM

Keep `intent → target → before → mutation/job → after → evidence → blocker` in the existing operation receipt for every operation. Reply naturally with the verified result and any blocker.

Run only after `learning-compass-operating-system` routes an explicit NotebookLM task. Never start NotebookLM from a routine site mutation, feedback-free recommendation, or the conversation self-improvement pass.

## Engine

Prefer `compass_notebooklm` for its supported explicit operations when available; it wraps `/home/mahmud/.local/bin/notebooklm`, requires complete notebook UUIDs, checks CLI health, and never polls, deletes, shares, or starts another workflow. Use the CLI directly for operations outside that narrow tool, including downloads/exports and exact provider recovery. Generation preserves no-wait; quiz has no `--language` flag, so put Egyptian-Arabic direction in its prompt. Other formats receive `ar_eg` only when their live help supports `--language`. Keep Worker source/lifecycle verification in the workflow below, not in the provider tool.

Use `/home/mahmud/.local/bin/notebooklm` from `teng-lin/notebooklm-py` for every NotebookLM operation: grounded Q&A via `notebooklm ask`, notebook/source management, Studio generation, polling, download, and explicit Google Docs/Sheets export. Inspect live CLI help before relying on a format. Do not load an MCP server, Playwright, Patchright, CDP, or computer-use for NotebookLM.

Before acting, run `notebooklm doctor`. Recover authentication only with `notebooklm login`; never sweep Chrome accounts or import cookies from every domain.

If the CLI/provider action is unavailable or blocked, stop before any Worker mutation. Do not create a notebook link, route plan, pending receipt, or other planned state for an action the provider did not accept. Report the provider blocker from the exact source read; lifecycle writes begin only after an observed provider notebook/source/submission receipt.

For an explicit source-linked artifact such as “make NotebookLM quiz”, load `learning-compass-site-operator`, read `/capture/:id/record` exactly once through it, then use only the NotebookLM CLI. Never probe Worker capabilities, `/notebooklm/*`, or any guessed route before provider acceptance. In a restricted environment where the CLI is unavailable, report that blocker after the one source read and make no Learning Compass mutation.

## Grounded Q&A

Use Master Corpus notebook `2c8a58a9-32b8-45db-804f-b48bf756e82c` for explicit recommendation-feedback grounding. Send original source material plus Mahmood-authored feedback/reflections only. Exclude generated summaries, translations, Lite Visual companions, visual-mind diagrams/charts/keyframes, and other AI-written text. Generated visuals are explanatory artifacts, never NotebookLM evidence. Require citations, identify contradictions and duplication, and state when grounding is unavailable.

Reuse a session only for a compatible investigation. Current CLI `ask --new` deletes the notebook's existing server-side conversation, and `--json` implies confirmation; never use it merely to start a fresh investigation. Preserve the existing conversation unless Mahmood explicitly authorizes that deletion, or use an explicitly authorized separate notebook. An exact cached answer is valid only with the current corpus fingerprint.

## Autonomous Studio workflow for explicit NotebookLM requests

When Mahmood explicitly asks to do something in NotebookLM, do not ask him to choose every output or repeat confirmation per artifact. Autonomously:

1. Resolve the exact Learning Compass source/notebook and check health/authentication.
2. Resolve the learning purpose (`learn`, `orientation`, `review`, `teach-back`, or `presentation`) and only the source features actually present (`hierarchy`, `causality`, `taxonomy`, `mechanism`, `process`, `comparison`, `data`, `spatial`, `motion`, `sequence`, `procedure`, or `demonstration`). Do not invent a feature to justify media.
3. Create a fresh notebook and add the original public source when a source-specific notebook is required. Immediately save `https://notebook.google.com/notebook/<id>` through the canonical Worker route and verify it on `/capture/:id/record`.
4. Record source indexing truth through `POST /notebooklm/learning/receipts`: use `kind=source` with `status=pending` while NotebookLM is indexing, `status=indexed` only after the exact provider source ID is observed, or `status=failed` with the actual error. A saved notebook URL is not an indexed-source receipt.
5. Route outputs through `POST /notebooklm/learning/route` with the canonical `recommendation_id`, purpose, requested formats when explicit, and observed concept features. Follow the returned plan exactly:
   - A general learning-artifact request defaults to one hard source-grounded `quiz`: 5–8 questions, hints before explanations, and at least one transfer question that requires applying the idea in a new case.
   - `audio` is Arabic (`ar_eg`) and is only for orientation or review.
   - `mind-map` requires hierarchy, causality, or taxonomy; `infographic` requires a mechanism, process, comparison, data, or spatial relationship; `slide-deck` is for teach-back or presentation cues; `video`/`cinematic-video` requires motion, sequence, procedure, or demonstration.
   - `flashcards`, `data-table`, and `report` are explicit/special-purpose outputs, never automatic companions to the default quiz.
   - A plan contains at most three non-redundant outputs. Never generate every format, and never turn one lesson into a modality catalogue.
   If a rich format fails its concept-fit gate, use the quiz fallback or the original requested fitting format; do not bypass the router. Choose the primary starting medium as part of this decision. When a Lite Visual pair is also produced, persist `recommended_start=original|html|pdf|notebooklm` on both pair artifacts so Momentum opens the chosen entry point.
6. Build a source-specific prompt from the original evidence packet and the route requirements. Include audience, purpose, must-cover claims/evidence, exclusions, tone, structure, and medium-specific direction. For the default quiz, explicitly request 5–8 hard questions, one hint before each explanation, at least one transfer item, plausible distractors, and citations/anchors to the indexed source. Default learner-facing Studio outputs to clear, relatively formal Egyptian Arabic. Keep real technical terms in English and explain their meaning naturally rather than supplying awkward literal Arabic translations. Unless Mahmood has explicitly confirmed competence in the branch, hard technical, mathematical, physical, or equation-heavy material must assume a beginner: teach prerequisites and notation, unpack equations symbol by symbol, derive mechanisms step by step, and work concrete examples instead of listing or merely summarizing concepts. Keep easy material concise. Never reuse a generic prompt or generated artifact as evidence.
   When Lite Visual is also produced, derive both prompts from one shared teaching/coverage outline. The Audio Overview must follow the HTML/PDF's concept order, terminology, examples, and section anchors, and should verbally cue those section labels so Mahmood can listen while reading and highlighting. Both outputs remain independently grounded in the original source; neither generated artifact is evidence for the other.
7. Use `/home/mahmud/.local/bin/notebooklm generate <type> ... --prompt-file ... --json --no-wait` for each format selected by the plan. Where the format's help exposes `--language`, pass `ar_eg`, never `ar`; quiz uses Egyptian-Arabic prompt direction instead. Use `data-table` for spreadsheet-like output and `report` for document output. Export to Google Sheets or Docs only when Mahmood explicitly requests that external write.
   `mind-map --kind note-backed` is the synchronous exception: pass source-specific Arabic direction through `--instructions`, save the returned JSON tree and `note_id`, then record the required Worker lifecycle as `pending` followed by observed `ready` with that `note_id` as both provider task and artifact ID. Do not infer readiness if the command did not return the complete tree and ID.
   **Mahmood's hard generation rule:** after each successful `--no-wait` submission receipt, stop. Never call `artifact poll`, `artifact wait`, status loops, or block for provider completion. Report exactly and truthfully: `Finished — generation started`, with the submitted task/artifact status as queued or pending; never imply the provider artifact is completed. This remains the rule even for a batch: submit every requested generation, verify each submission receipt only, then stop.
8. After every accepted submission, record `kind=artifact`, the route `plan_id`, exact canonical format, provider task ID, `status=pending`, `source_grounded=true`, and `custom_prompt_applied=true` through `POST /notebooklm/learning/receipts`. Record `status=ready` or `status=failed` only during a later explicitly requested finished-file workflow after observing that provider state. A ready quiz receipt must verify the actual 5–8 question count, hint-before-explanation order, and at least one transfer item. Never turn `pending` into `ready` by inference.

For cinematic video, run the bundled `scripts/start_cinematic_video.sh <notebook_id> <prompt_file> [source_id]`. Cinematic ignores style flags; keep all narrative and visual direction in the prompt.

Default boundary: start the selected generation and verify the notebook URL. If Mahmood asked for a finished file, continue through provider completion, verified download/export, Worker QA/upload, and source-record visibility. Do not create unrelated automatic chains.

## Verification

Report notebook ID/URL, indexed source receipt, route plan ID, selected format, custom-prompt use, and provider task status separately. Re-read `GET /notebooklm/learning/receipts?recommendation_id=<id>` after receipt writes. A notebook link is not an indexed-source receipt; a pending task is not a finished artifact; a finished provider artifact is not published until Worker upload and canonical reread succeed. These receipts describe NotebookLM operations only and never change lesson, Level, or Thread completion or recall scheduling.

## Evolution handoff

After the notebook/source/task state is verified, send only concrete evidence to `learning-compass-self-evolution` as `owner | observation | evidence | replay | smallest_candidate | confidence | scope`. Reproducible CLI drift, stale session reuse, cache-key failure, or source-link persistence failure qualifies. Do not turn a provider outage into a permanent rule and never start Studio or publish as part of self-improvement. Return `no_change` when no system candidate exists.
