# Learning Hub UX redesign plan

Status: proposed for confirmation; no implementation started.

## Design brief

### Job and audience

Learning Hub is Mahmood's academic workspace for returning to a topic, understanding where he is in its curriculum, and completing the next meaningful learning action. Desktop supports curriculum editing, source curation, modeling, and synthesis. Tablet and phone support checking the next action, opening material, recording evidence, and reflecting after study.

The surface is an **Operate** interface with Read-quality hierarchy. It should feel like a calm syllabus and workbench, not a project-management dashboard or a database editor.

### Outcome and proof

The returning learner should be able to answer these questions within five seconds:

1. What am I learning now?
2. Which level am I in?
3. What should I do next?
4. What proof is missing before I advance?

The redesign succeeds when a learner can resume the current action in one interaction, reach any stage in two interactions, record evidence in three or fewer steps, and understand why a stage is locked or incomplete without reading documentation.

### Product truths to preserve

- Hub owns paths, stages, outputs, and evidence gates.
- Queue owns the small active source commitment; it does not move into Hub.
- Sources are reusable inputs and never count as mastery.
- Stage advancement comes from recall, explanation, transfer, decisions, artifacts, or application evidence.
- Scholar's Instrument remains the visual language: typographic, calm, ruled, compact, and free of card soup, progress rings, gradients, streak pressure, and decorative motion.

## Current-state diagnosis

This is a code- and data-based evaluation of the existing desktop and responsive implementation. It is not a usability study.

### P1 — Core learning action is missing

The workspace displays stage items and evidence requirements but does not let the learner satisfy an item, record stage evidence, verify a stage, or advance from the page. The correct next action is therefore invisible or unavailable. This breaks visibility of system status, user control, and task completion.

### P1 — Learning and curriculum authoring compete

The default workspace gives persistent weight to “Add a stage” and “Add work” controls. A returning learner needs to continue learning, while authoring is an occasional expert task. Keeping both in one mode increases cognitive load and makes the screen feel administrative.

### P1 — The stage model is rendered as one flat list

Concepts, empty source roles, companion slots, recall prompts, exercises, applications, and reflections are all displayed as equivalent work items. The Systems Thinking path currently contains 111 items, so the interface will become progressively harder to scan as the curriculum gets richer.

### P1 — Prior knowledge cannot be represented cleanly

Level 0 is described as already completed, but the UI still presents it as the current open stage. There is no baseline check, evidence import, or explicit waiver flow that explains why prior learning counts.

### P2 — Path overview spends the first viewport explaining the product

The large introductory statement, principle block, toolbar, current-path section, path list, and permanent “path anatomy” explanation compete vertically. Returning users should see the active path and next action before educational framing.

### P2 — Stage navigation provides state but not navigation

The path index visually identifies the current stage, but stages are not selectable workspaces. Locked stages cannot explain their prerequisites, and completed or later stages cannot be inspected without changing the curriculum data.

### P2 — Mobile is a collapsed desktop layout

The three-column workspace becomes stacked content, while the stage index remains a dense two-column block. Mobile needs a deliberate sequence centered on current stage, next action, and evidence status.

### Positive findings to preserve

- Hub and Queue have a clear conceptual boundary.
- The path model supports seven ordered stages without duplicating sources.
- Evidence-first progression is honest and avoids consumption-as-mastery.
- Ruled lists, restrained color, real empty states, and responsive foundations already align with Scholar's Instrument.
- The active path and definition of competence are available in the current read model.

No manipulative or deceptive UX pattern is present. The problems are hierarchy, findability, and incomplete task flow.

## Selected direction

Use a **learn-first workspace with an explicit edit mode**.

- **Learn mode** is the default. It shows the current stage, one next action, grouped stage work, and the evidence gate.
- **Edit path mode** exposes stage creation, item creation, reordering, requirement editing, source-role setup, and archive controls.
- Browsing another stage does not silently change the current stage.
- Locked stages remain inspectable and explain exactly what must happen before they unlock.
- Completed stages collapse to a concise result and can be reopened for review.

This preserves the full academic architecture while revealing complexity only when it is relevant.

## Information architecture

### Hub overview

```text
Learning Hub                                      New path
Current path
  Systems Thinking
  Level 0 — Orientation · 0/7 proof requirements
  Next: confirm prior knowledge                  Continue

Paths
  Active (1)
  Planned and paused (collapsed)
  Verified (collapsed)
  Archived (hidden behind filter)
```

The permanent “path anatomy” tutorial moves into the first-run empty state and a small “How paths work” disclosure. It should not consume every returning visit.

### Path workspace

```text
Path header
  Back · Systems Thinking · Active        Edit path · More

Stage index        Stage workbench                     Evidence gate
0 Orientation      Level 0 — Orientation               0/2 proofs
1 Foundations      Objective                            Missing proof
2 Dynamics         Next action                          Why it matters
3 Modeling         Concepts                             Record evidence
4 Intervention     Learning material slots              Verify stage
5 Applied          Practice and application
6 Advanced         Reflection and output
```

### Stage anatomy

Each stage groups information by the learner's mental model instead of database item type:

1. **Objective and output** — what this level builds and what proves completion.
2. **Next action** — the single best current action.
3. **Understand** — concepts and active-recall prompts.
4. **Study** — foundation, practical case, and companion slots. Empty slots remain explicit but do not pretend to be sources.
5. **Practice** — modeling exercise and real-world application.
6. **Reflect** — short reflection and uncertainty notes.
7. **Evidence** — requirements, submitted proof, verification, and waiver history.

Sections with no content collapse to one honest empty row. Source slots remain empty for the current Systems Thinking path until the user explicitly curates them.

## Core journeys

### Return and continue

1. Open Hub.
2. See the active path, current level, and exact next action.
3. Select **Continue**.
4. Land with keyboard focus on the current stage heading.
5. Complete the action or record its evidence.
6. See the evidence gate update immediately.

### Complete an already-known orientation

1. Open Level 0.
2. Choose **Confirm prior knowledge**.
3. Complete a short recall check or attach existing evidence.
4. If proof is sufficient, mark the stage ready to verify.
5. If explicitly waived, require a reason and label the result as waived rather than learned.

### Study a stage

1. Start the available stage.
2. Review its objective, expected output, and evidence gate.
3. Open or attach a source from the relevant role slot.
4. Return through the existing reflection flow with `thread_id` and `stage_id` preserved.
5. Complete recall, modeling, application, or reflection work.
6. Submit the stage when all required evidence exists.
7. Verify it and unlock the next stage.

### Edit the curriculum

1. Choose **Edit path** from the path header.
2. Reorder stages and edit objectives in a bounded syllabus editor.
3. Open one stage to edit concepts, source roles, practice, output, and evidence requirements.
4. Save with visible confirmation; offer Undo for removals and reordering.
5. Exit edit mode and return to the same stage in Learn mode.

## Interaction specification

### One primary action

The workbench derives one primary action from stage state:

| Stage state | Primary action |
|---|---|
| Available | Start stage |
| In progress with source work | Continue current source |
| In progress with open practice | Complete next exercise |
| Evidence pending | Record missing evidence |
| Ready to verify | Verify stage |
| Verified | Continue to next stage |
| Locked | Review prerequisite |

Secondary actions remain text buttons or the overflow menu.

### Stage navigation

- Every stage row is a real button with title, state, and compact progress.
- Selecting a stage changes the inspected stage only.
- The current stage keeps a persistent “Current” label.
- Locked selection opens its objective and prerequisite explanation, not a dead end.
- Keyboard users can move through stages with normal Tab order; optional arrow-key navigation is an enhancement, not the only route.

### Evidence capture

Use a focused drawer on desktop and a full-screen sheet on mobile. It begins from the selected requirement, so the learner never has to choose an abstract evidence type first.

```text
Record evidence for: Draw and explain a causal-loop diagram
Evidence: artifact
What did this demonstrate?
Attach or link artifact
Confidence / result
Save evidence
```

Saving updates the gate in place and announces the result to assistive technology. Verification remains a separate deliberate action.

### Edit mode

- Entering edit mode changes the page title context and exposes authoring controls.
- Learn-mode progress controls disappear while editing to prevent mode errors.
- Drag reordering has Move up / Move down keyboard alternatives.
- Removing a stage or item uses a recoverable archive or Undo where possible.
- Unsaved changes receive a clear leave warning.

## Responsive behavior

### Desktop

- Persistent stage index, fluid workbench, sticky evidence inspector.
- The workbench owns most horizontal space.
- Long stage sections use ruled disclosure groups, not nested cards.

### Tablet

- Stage index becomes a left drawer or compact syllabus popover.
- Workbench and evidence remain a two-part layout when space permits.
- Source opening and evidence capture preserve stage context across return.

### Mobile

Reading order becomes:

1. Path and stage selector.
2. Current objective and progress.
3. One next action.
4. Evidence summary.
5. Grouped stage content.

Only the current primary action may become sticky. It must not cover content, and reduced-motion users receive instant state transitions.

## Required product and API support

The UI cannot complete the proposed journey with the current API alone. Implementation should add the smallest compatible operations needed for:

- Updating, satisfying, waiving, reordering, and removing stage items.
- Creating and editing stage-specific evidence requirements.
- Recording evidence directly against a selected stage requirement.
- Deriving and returning the next action from stage and evidence state.
- Reordering stages without position collisions.
- Pausing, resuming, archiving, and restoring paths from Hub controls.
- Distinguishing inspected stage from current active stage.

Every new route must be added to the API documentation, tests, agent capability allow-list, Hermes contract, and site-operator procedure in the same implementation task.

## State coverage

The redesign must specify and test:

- First run with no paths.
- One active path with no stages.
- A mature path with 7 stages and 100+ items.
- Empty source slots.
- Loading and slow evidence submission.
- Evidence save failure with preserved input and Retry.
- Locked, available, in-progress, evidence-pending, ready-to-verify, verified, waived, paused, and archived states.
- A path with no current stage because all stages are verified.
- Offline or interrupted mobile return.
- Long English and Arabic content without clipping or broken direction.

## Delivery plan

### Phase 1 — Make the learning loop operable

- Add item, requirement, evidence, and stage progression operations.
- Implement the derived next-action model.
- Add the Learn/Edit mode boundary.
- Make stage navigation selectable and explain locked prerequisites.
- Add evidence capture and verification flows.

Exit condition: the Systems Thinking path can move from Orientation to Foundations entirely through the Hub, with evidence and no direct database work.

### Phase 2 — Rebuild overview and workspace hierarchy

- Compact the Hub header and move permanent education into contextual help.
- Redesign the active-path continuation row.
- Group paths into Active, Planned/Paused, Verified, and Archived.
- Replace the flat 111-item rendering with grouped stage anatomy.
- Add desktop, tablet, and mobile layouts.

Exit condition: a returning user can identify the active stage and next action in five seconds on desktop and mobile.

### Phase 3 — Build curriculum editing

- Add the dedicated syllabus editor.
- Support stage and item reordering, source-role slots, outputs, and evidence requirements.
- Add archive, restore, Undo, and unsaved-change protection.
- Preserve an explicit empty-source state; do not auto-fill the current curriculum.

Exit condition: the complete seven-level curriculum can be edited without exposing authoring controls during normal study.

### Phase 4 — Harden and validate

- Cover empty, loading, failure, overflow, locked, waived, and completed states.
- Verify keyboard navigation, focus management, touch targets, contrast, reduced motion, and bilingual content.
- Run five task-based usability sessions if possible: resume learning, inspect a locked stage, record evidence, verify a stage, and edit the syllabus.
- Add E2E coverage at desktop and mobile widths.

Exit condition: all five core tasks complete without dead ends, and no critical or major usability issue remains in a follow-up evaluation.

## Success measures

- 90%+ task completion for “find and start the next action.”
- Median time to resume current work under 10 seconds.
- Any stage reachable in two interactions or fewer.
- Evidence attached to the intended requirement without choosing a technical evidence type manually.
- Zero accidental curriculum edits during Learn mode.
- Zero stage advances caused only by opening or finishing a source.
- No horizontal overflow at 390px, 768px, or desktop widths.

## Explicit non-goals

- Moving Queue into Hub.
- Automatically selecting or attaching sources.
- Turning stage completion into streaks, points, or engagement pressure.
- Building a generic project-management board.
- Replacing Atlas, Notes, Recall, or Momentum responsibilities.
- Styling work before the information architecture and interaction flow are confirmed.

## Confirmation decisions

Before implementation, confirm these three decisions:

1. Learn mode is the default and curriculum authoring moves behind **Edit path**.
2. Prior knowledge requires either a short evidence check or a visibly reasoned waiver; it is never silently marked complete.
3. The first implementation milestone is end-to-end progression for the existing Systems Thinking path, not broad visual polish across every Hub state.
