# Learning Hub — design and workflow contract

Status: implemented in the first production slice, with the Learn/Edit UX milestone now complete locally; deployment follows the release checks.

## Product decision

Add **Learn → Hub** as the academic planning and progression surface for deep learning. Keep **Curate → Queue** as the small, active source shelf.

The Hub is a syllabus ledger, not another inbox, recommendation feed, or progress dashboard. It answers:

1. What capability or topic am I learning?
2. What stage am I in?
3. What is the next meaningful action?
4. What evidence is still missing before I advance?

Learning Threads remain the parent object. A Learning Path is the curriculum-shaped presentation and structure of a Thread. Sources remain reusable records owned by D1; opening or finishing a source never proves mastery by itself.

## Canonical Hub workflow

Deep topic learning always follows this order:

1. **Interview** — capture desired depth, prior knowledge, real use case, constraints/source preferences, guiding question, and proof of competence.
2. **Create the levels** — build or approve the path structure once: stages, objectives, outputs, exercises, applications, reflections, and evidence gates.
3. **Source-fill the existing path** — keep the existing levels and order fixed; research, attach, and verify sources by stage role only.
4. **Progress by evidence** — advance through recall, explanation, transfer, artifact, decision, or real application evidence.

When a path already has levels, a source-fill request is not a redesign request. Agents must not recreate, rename, reorder, add, or remove levels while attaching sources. If the structure is inadequate, the correct result is a path-revision blocker, not silent mutation.

## Product boundaries

| Surface | User question | Owns |
|---|---|---|
| Hub | What am I learning and what is the path? | Paths, stages, objectives, outputs, gates |
| Queue | Which sources am I actively consuming? | Five-item active commitment |
| Momentum | What should I do now? | Current source and current Thread action |
| Notes | What did I consolidate? | Structured source notes |
| Recall | Can I retrieve it later? | Approved SRS cards and review |
| Atlas | How does it connect? | Knowledge branches, links, and coverage |

Never move Queue into Hub. Never duplicate a source because it appears in more than one path or stage.

## Navigation

Learn becomes:

```text
Learn
├── Hub
├── Files
├── Notes
├── Recall
└── Activity
```

The desktop rail should make Hub the first Learn destination. The existing Queue remains in Curate and remains the explicit source-commitment action.

## Hub overview

### First viewport

The overview should contain, in reading order:

1. `Learning Hub` page title and one-sentence purpose.
2. A current-path continuation desk when an active path exists.
3. A ruled list of all paths, ordered by current status and priority.
4. A short explanation of the path anatomy for first-run users.

The overview should not use a grid of equal generic cards. Each path is a typographic row with a number, title, current stage, guiding question, evidence state, and one clear action.

### Path row

```text
01  Systems Thinking
    Foundations · In progress
    Explain how system structure produces behavior over time
    Evidence 4/7                                      Continue
```

Required row states:

- Planned — no stage started.
- Available — a stage is unlocked and ready.
- In progress — the user has begun work.
- Evidence pending — source work exists but proof is missing.
- Ready to verify — all required stage evidence exists.
- Paused — intentionally deferred.
- Verified — the path is complete.
- Archived — abandoned or intentionally retired.

## Path workspace

Selecting a path opens a three-part desktop workspace:

```text
Path index | Current stage workbench | Evidence and next action
```

### Path header

The header shows:

- Path title.
- Learning mode: Curriculum or Exploration.
- Guiding question.
- Why now.
- Definition of competence.
- Overall state.
- Pause/resume and edit actions.

### Path index

The index is an ordered syllabus, not a dense tree:

```text
0  Orientation       Complete
1  Foundations       Current
2  System Dynamics   Locked
3  Modeling          Locked
4  Intervention      Locked
5  Applied           Locked
6  Advanced          Locked
```

Selecting a locked stage explains the exact prerequisite rather than silently doing nothing.

### Current stage workbench

Every stage uses the same anatomy:

```text
Level 1 — Foundations

Objective
Concepts
Sources by role
Practice exercise
Real-world application
Reflection
Stage output
```

The page has one primary action at a time. Examples:

- Start stage
- Continue current source
- Complete exercise
- Record application
- Add reflection
- Review missing evidence
- Submit stage for verification

### Evidence panel

The right panel answers why the stage is or is not ready:

```text
Evidence gate
4 of 7 requirements satisfied

✓ Explain the core concepts from memory
✓ Analyze one simple system
○ Draw a causal-loop diagram
○ Record one real-world application

Next proof: complete the modeling exercise
```

Evidence types reuse the existing learning-core vocabulary:

- `free_recall`
- `explanation`
- `transfer`
- `application`
- `decision`
- `artifact`

Completion is derived from evidence. A manual waiver requires a reason and remains visibly a waiver.

## Mobile behavior

The three desktop columns collapse into this sequence:

```text
Path selector
Current stage summary
Next action
Evidence status
Stage content
```

The stage selector becomes a horizontal or expandable control. The evidence summary appears before the long reading content. No persistent action bar should cover the work; a sticky action is allowed only for the current stage's single primary action.

## Core interactions

### Create a path

The user provides:

- Topic or capability.
- Desired depth.
- Existing knowledge.
- Real use case.
- Constraints or source preferences.
- Why it matters now.
- Guiding question.
- Definition of competence.
- Learning mode.

The user may start blank or request a Hermes draft. Hermes suggestions remain drafts until explicitly approved.

### Review a curriculum draft

Hermes may propose:

- Stage sequence.
- Objectives.
- Concepts.
- Required outputs.
- Foundation and case source roles.
- Recall prompts.
- Exercises.
- Applications.
- Evidence gates.

The user can approve, edit, reorder, remove, or defer each proposal. A proposal must identify what is source-grounded, what is an inference, and what remains uncertain.

### Attach reusable sources

The source picker searches existing D1 records. It displays source status, previous consumption, mastery state, existing path attachments, and proposed contribution.

Attachment roles:

- Foundation.
- Practical case.
- Companion.
- Counterevidence.
- Reference.

The source remains one canonical record and one learning history, regardless of the number of path attachments.

### Study and return

Opening a source from a stage starts the existing learning session with both `thread_id` and `stage_id` context. Consumption happens at the original source. Returning from the source routes through the existing reflection handoff, augmented with stage-aware prompts.

### Record evidence

Evidence is attached to the stage and optionally to a Learning Unit. It can be recorded after a recall answer, explanation, model, application, decision, or artifact.

### Advance

The stage state is derived:

```text
Locked → Available → In progress → Evidence pending
       → Ready to verify → Verified
```

Opening a source, rating a source, or generating a companion cannot advance the stage without the required evidence.

## Visual direction

Mode: **Operate**, with Read-quality typography for syllabus and stage content.

Thesis: a calm academic instrument for navigating a body of study and locating the exact proof still missing.

Extend the existing Scholar's Instrument system:

- Neutral surfaces and hairline rules.
- One muted ink-blue accent for selection, active state, and primary action.
- IBM Plex Sans/Arabic for UI text.
- IBM Plex Mono for stage numbers, metadata, and evidence counts.
- Dense, scan-friendly rows instead of card soup.
- No progress rings, streak pressure, gradients, or decorative dashboard motion.
- State is communicated by labels and structure first; color is secondary.

## UX milestone implemented

The first navigation and progression pass now uses a Learn-first workspace. The Hub overview leads with the current path and next action; the path workspace groups items into Understand, Study, Practice, and Reflect; stage rows are selectable; and curriculum authoring is behind an explicit Edit path mode. Stage start, work-item proof, evidence capture, derived readiness, and stage verification are available through the learning-core contract. Empty source-role and companion slots remain visible but do not falsely block progression or count as mastery.

## Per-path and per-stage notes and files

Each learning path and each stage owns its own notes and files — brand-new, item-owned data, independent of the source-scoped notes and files of attached sources. Migration `0030_hub_notes_files.sql` adds nullable `thread_id`/`stage_id` columns to the canonical `notes` and `artifacts` tables (at most one hub scope per row; source rows keep both NULL). `GET /notes/hub` and `GET /artifacts/hub` list one path's or stage's material, and the path read model returns path-level and per-stage notes/files in the same bounded response. Hub files are excluded from the global Learn → Files list so each surface stays true to its ownership; hub notes are `kind=note` and never match the Notes library's `kind=guide` filter. Flashcards and feedback are explicitly out of scope.

## Data model proposal

Keep `learning_threads` as the parent. Add relational curriculum entities rather than a single opaque curriculum JSON blob.

### `learning_path_stages`

- `id`
- `thread_id`
- `position`
- `title`
- `objective`
- `description`
- `stage_type`
- `status`
- `output_description`
- `unlock_policy_json`
- timestamps

### `learning_path_items`

- `id`
- `stage_id`
- `position`
- `item_type`
- `title`
- `description`
- `required`
- `evidence_type`
- `status`
- timestamps

Item types are `concept`, `source_role`, `companion`, `recall_prompt`, `exercise`, `application`, and `reflection`.

### `learning_path_sources`

- `stage_id`
- `recommendation_id`
- `role`
- `required`
- `expected_contribution`
- `position`

This references existing recommendations. It does not copy source metadata.

### Existing table extensions

- Add nullable `stage_id` to `learning_evidence`.
- Add nullable `stage_id` to `thread_evidence_requirements`.
- Add nullable `stage_id` to learning-session context or an equivalent session context field.

All schema changes require a new numbered, idempotent migration and compatibility tests.

## API proposal

Read model:

```text
GET /learning/core/hub
GET /learning/core/threads/:id/path
GET /learning/core/threads/:id/stages/:stageId
GET /learning/core/threads/:id/progress
```

Authoring:

```text
POST  /learning/core/threads/:id/stages
PATCH /learning/core/threads/:id/stages/:stageId
POST  /learning/core/threads/:id/items
PATCH /learning/core/threads/:id/items/:itemId
POST  /learning/core/threads/:id/stages/:stageId/sources
POST  /learning/core/threads/:id/stages/:stageId/verify
```

The read model should return one bounded, UI-ready response:

```text
{
  thread,
  stages,
  current_stage,
  progress,
  open_requirements,
  recent_evidence,
  next_action,
  linked_sources
}
```

Existing Thread, session, source, evidence, Notes, Recall, and Queue endpoints remain compatible.

## Agent contract

Explicit requests route to a Learning Paths workflow for intents such as:

- Create path.
- Refine path.
- Audit stage gaps.
- Find a source for a defined role.
- Record or verify evidence.
- Design an application.

The agent must never:

- Create a path from a casual mention.
- Auto-add a recommendation after completion.
- Mark a stage complete because a source was consumed.
- Duplicate sources.
- Invent mastery.
- Auto-chain feedback into a recommendation.

Every mutation returns the canonical receipt:

```text
intent → target → before → mutation/job → after → evidence → blocker
```

The agent reads the relevant Thread, path, evidence, source history, profile constraints, and mastered/consumed state before proposing changes. It uses allow-listed Worker operations and verifies after every write.

## Hermes synchronization

### New focused skill

Add:

```text
~/.hermes/skills/workflow/learning-compass-learning-paths/SKILL.md
```

It owns curriculum drafts, stage refinement, stage-gap analysis, application prompts, and evidence verification. It does not own generic recommendation selection, taste mapping, Notes Extractor, Lite Visual, or direct database writes.

### Files to update in the implementation task

- `.hermes.md` — route explicit Learning Hub requests.
- `learning-compass-operating-system/SKILL.md` — classify curriculum/path requests.
- `learning-compass-site-operator/SKILL.md` — document read-before-write, new routes, idempotency, and verification.
- `docs/hermes-contract.json` — operations, schemas, ownership, and permissions.
- `docs/API.md` — endpoint contracts and derived progression rules.
- `PROJECT_CONTEXT.md` — product invariant and ownership once the feature ships.
- `CURRENT_STATE.md` — completed milestone only after implementation and verification.

Do not add a personal Hermes memory unless the user explicitly establishes a durable personal learning preference. Product behavior belongs in the project and workflow contracts.

## Implementation sequence

1. Approve this contract and settle names for Path, Stage, and Evidence Gate.
2. Add the idempotent schema migration and domain validation.
3. Add the Worker read model and API tests.
4. Add Learn → Hub overview with all required states.
5. Add path workspace with stage index, current stage, and evidence panel.
6. Add source attachment and stage-aware session context.
7. Add evidence recording and derived stage progression.
8. Add authoring and Hermes draft review.
9. Add focused Hermes skill and synchronized contracts.
10. Run the full verification and a real Systems Thinking end-to-end rehearsal.

## Acceptance gates

- Queue remains a five-item source commitment surface.
- Hub shows real Threads and does not duplicate source records.
- A source can support multiple stages without multiplying consumption history.
- Stage context survives source opening and return.
- Source consumption alone never unlocks a stage.
- Evidence attaches to the correct stage and Thread.
- Open evidence blocks verification unless explicitly waived with a reason.
- Existing Thread, Queue, Momentum, Notes, Recall, and Atlas behavior remains compatible.
- Hermes changes are explicit, allow-listed, idempotent, and verified after mutation.
- No feedback workflow creates an automatic recommendation.
- Desktop and mobile Hub states are complete and accessible.
- `npm test`, `npm run build`, `npm run test:e2e`, `npm run verify:hermes`, `npm run verify:migrations`, and `git diff --check` pass.
