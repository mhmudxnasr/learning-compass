# Learning Compass Frontend Reset — Master Plan

Status: complete through verification and cutover; deployment and the post-deploy rollback window remain intentionally outstanding.

## Decision

Replace the current frontend rather than incrementally polishing it. Preserve the canonical Worker APIs, D1/R2 ownership, domain rules, and learning workflows. The replacement is now the active Botanical Folio / Evidence Ledger studio: a green-and-cream, Capacities-inspired single-user learning workspace with Learning Compass's own product model and identity.

The design borrows Capacities' strongest structural principles—an object-oriented sidebar, a calm multi-pane canvas, contextual inspectors, compact controls, and progressive disclosure—without copying its brand, marketing language, or exact screens.

## Why a reset is justified

- The executable registry currently exposes 21 destinations for one user and makes implementation categories feel like product areas.
- `client/src/app.tsx` is a roughly 3,500-line monolith containing the shell, routing, data loading, dialogs, and most feature surfaces.
- The visual layer is split across a very large global stylesheet and an additional polish stylesheet.
- Queue, Inbox, Books, Collections, Archive, Notes, Files, Recall, activity, analytics, profile, and system data are separate destinations even when they are views of the same underlying objects.
- The current mockups and generated explorations are not production authority and should not constrain the replacement.

## New information architecture

### Primary navigation: five roots

1. **Home** — resume the current Learning Thread/source, see the single next evidence action, capture quickly, and handle only genuinely due work.
2. **Library** — one unified source collection with saved views for Inbox, Queue, All sources, Files, Books, Collections, and Archive.
3. **Learn** — one learning workspace with modes for Paths, Notes, and Recall. The active Thread and its next evidence requirement are the default.
4. **Map** — one spatial knowledge workspace. Atlas is the main canvas; Branch decisions and Balance are contextual lenses/inspectors.

5. **Settings** — Profile, Preferences, Data & sync, and System utility surfaces.

### Global actions

- **Capture** is always available at the top of the sidebar.
- **Search** opens a global command/search surface across sources, notes, Threads, Units, branches, files, and settings.
- **Pinned smart views** show Inbox, Queue, and Due Review counts without creating new global destinations.

### Stable route model

The global route registry exposes five roots and 18 purposeful named views:

- `#/home`
- `#/library`
- `#/learn`
- `#/map`
- `#/settings`

The registry contains only the five roots. Stable named child views use readable path segments; filters, focus, and selection context use query state. None are peer destinations:

- Library: `inbox`, `queue`, `all`, `files`, `books`, `collections`, `archive`
- Learn: `paths`, `notes`, `recall`
- Map: `atlas`, `branches`, `balance`
- Settings: `profile`, `preferences`, `data`, `system`

Examples: `#/library/queue`, `#/learn/notes`, `#/map/branches`, and `#/settings/data`. Sources, notes, Threads, Units, cards, branches, collections, and artifacts have typed addressable object URLs such as `#/library/source/:id` and `#/learn/thread/:id`; these open inside the owning workspace canvas/inspector and never appear as top-level destinations.

The router must preserve object identity and meaningful selection state. Legacy hashes live in a separate alias registry and canonicalize with history replacement. Empty hash resolves to Home; an unknown hash renders a purposeful recovery state instead of silently showing Home.

Typed object routes:

```text
#/library/source/:sourceId
#/library/book/:sourceId
#/library/artifact/:artifactId
#/library/collection/:collectionId
#/learn/thread/:threadId?stage=:stageId&mode=learn|edit
#/learn/note/:noteId
#/learn/unit/:unitId
#/learn/card/:cardId
#/map/node/:nodeId
#/map/branch/:branchId
```

Stable child routes:

```text
#/library/{inbox|queue|all|files|books|collections|archive}
#/learn/{paths|notes|recall}
#/map/{atlas|branches|balance}
#/settings/{profile|preferences|data|system}
```

Legacy examples that must preserve identity:

```text
#/today/briefing                 → #/home
#/curate/queue                   → #/library/queue
#/learn/hub/:threadId            → #/learn/thread/:threadId
#/learn/notes?source=:sourceId   → #/library/source/:sourceId
#/learn/notes?note=:noteId       → #/learn/note/:noteId
#/curate/queue?record=:sourceId  → #/library/source/:sourceId?from=queue
#/map/deck                       → #/map/branches
#/map/coverage                   → #/map/balance
```

Global search is an overlay, not a workspace. Its resolver maps each result to the exact typed object URL. It must never collapse a result to a workspace root and lose the selected ID.

### Old-to-new capability map

| Current destination | New home |
|---|---|
| Momentum | Home main canvas |
| Queue | Library saved view + Home commitment preview |
| Inbox | Library saved view + sidebar smart view |
| Books | Library object-type view |
| Collections | Library saved/grouped view |
| Archive | Library lifecycle filter |
| Paths / Hub | Learn default mode |
| Files | Library Files saved view + Source/Artifact inspector |
| Notes | Learn mode; note opens as an object |
| Recall | Learn mode + Home due action |
| Changes / Activity | Settings → Learning model → Change log |
| Atlas | Map main canvas |
| Branches | Full Map mode with review queue/canvas + inspector |
| Balance / contradictions | Full Map lens; contradictions are a filter/evidence state |
| Insights overview | Home only when actionable; history in Profile |
| Taste | Settings → Learning model |
| Hermes quality and memory | Settings → Learning model |
| Profile | Settings → Profile |
| Preferences | Settings → Preferences |
| Data | Settings → Data |
| System | Settings → System |

## Interaction architecture

### Desktop

- **Primary rail:** 64–72px collapsed or 224–248px combined/expanded, persistent, quiet, and object-oriented. It contains Capture, Search, four workspaces, three smart views, and Settings/Profile.
- **Workspace context pane:** appears only when the active workspace has meaningful saved views, modes, or lenses. It never becomes a dump of backend object types.
- **Main canvas:** flexible working area for the selected workspace. It may be a source list, learning room, editor, or graph—not a dashboard card grid.
- **Right inspector:** contextual properties, relationships, evidence, files, and secondary actions. It appears only when an object or map node is selected.
- **Optional secondary pane:** used only when a workflow materially benefits from list + detail or editor + reference. Avoid permanent empty panes.

### Mobile and tablet

- Sidebar becomes a compact bottom dock plus navigation sheet.
- Main canvas remains the primary surface.
- Inspector becomes a full-height sheet or pushed detail screen with a stable Back action.
- Primary actions remain thumb-reachable and are never obscured by the dock.
- Tablet supports two panes where width allows, especially for Library and Learn.

### Object grammar

The frontend treats these as first-class objects with consistent headers, properties, relations, and actions:

- Source
- Learning Thread
- Note
- Learning Unit
- Recall Card
- Map Branch
- Artifact

An object header contains type, title, lifecycle state, primary action, and overflow. Its inspector contains properties, relationships, provenance, files, and history. This replaces feature-specific card grammars.

## Visual-system direction (implemented)

Working name: **Learning Compass Evidence Studio**.

- Use two illuminations of one authored world: **Dawn** and **Dusk**. They share geometry, hierarchy, semantic colors, and behavior; only material lighting changes. Dawn is the default neutral studio canvas and Dusk is its charcoal counterpart, not a separate brand.
- Use a restrained cypress/green accent family with cream vellum surfaces; plum/iris is retired.
- Give object types muted, semantic tints; avoid rainbow decoration.
- Use thin dividers and tonal surface changes for pane hierarchy. Shadows are reserved for floating menus, dialogs, and dragged objects.
- Prefer 6–10px control radii and 10–14px panel radii. Remove the oversized rounded-card language.
- Use a compact workhorse sans for UI and a highly readable companion face only for long-form notes/source content.
- Dense information is organized with alignment, typography, and whitespace rather than nested cards.
- Motion communicates continuity: pane opening, inspector selection, list reordering, and object focus. No ambient loops or page-load choreography.
- Ship keyboard navigation, visible focus, reduced motion, strong contrast, and English/Egyptian-Arabic block direction from the first component pass.

## Demolition boundary (executed)

Before deletion, create a recoverable snapshot of the complete current working tree, including untracked mockups and design outputs. Do not use reset, checkout-discard, or stash as the preservation mechanism.

The snapshot lives outside the repository and contains a full working-tree copy (excluding `.git`), `git status --short --ignored --untracked-files=all`, the current HEAD/branch identity, binary worktree/index diffs, index entries, and a SHA-256 manifest. Keep it until the replacement is deployed, live-smoked, and outside the rollback window.

The complete pre-reset working tree was snapshotted outside the repository before demolition. The old `mockups/` and `output/` directories were moved outside the project path after replacement verification; the snapshot remains the rollback source.

Implementation preflight used a task-specific snapshot directory, for example:

```bash
repo_path=/home/mahmud/recommendations-worker
mkdir -p /home/mahmud/.codex/snapshots
snapshot_root=$(mktemp -d /home/mahmud/.codex/snapshots/learning-compass-pre-reset-XXXXXX)
rsync -a --exclude='.git/' "$repo_path/" "$snapshot_root/worktree/"
git -C "$repo_path" status --short --ignored --untracked-files=all > "$snapshot_root/status.txt"
git -C "$repo_path" rev-parse HEAD > "$snapshot_root/head.txt"
git -C "$repo_path" branch --show-current > "$snapshot_root/branch.txt"
git -C "$repo_path" diff --binary HEAD > "$snapshot_root/worktree.diff"
git -C "$repo_path" diff --cached --binary > "$snapshot_root/index.diff"
git -C "$repo_path" ls-files --stage > "$snapshot_root/index.entries"
find "$snapshot_root/worktree" -type f -print0 | sort -z | xargs -0 sha256sum > "$snapshot_root/sha256.txt"
```

### Removed or replaced

- Current shell and route composition in `client/src/app.tsx`
- Current destination registry in `client/src/destinations.ts`
- Current global visual implementation in `client/src/styles.css`
- `client/src/experience-polish.css`
- Feature page components whose UI is inseparable from the discarded shell
- `mockups/whole-app-redesign/`, including generated output and any local dependency cache present at deletion time
- `output/agy-learning-hub-visuals/`
- Obsolete visual assets after the new mark/icon decision
- Current 21-destination route-shape assertions, while preserving their fixtures and behavioral checks for the rewritten suite
- Superseded content inside `DESIGN.md`; update the document in place from the built replacement rather than deleting the file early

### Preserve and reuse

- `client/src/api.ts` behavior: mutation IDs, IndexedDB outbox, retry/discard, and conflict visibility. Add a focused multipart artifact-upload helper so workspace code does not bypass the transport boundary with raw `fetch`.
- Worker routes, API contracts, D1/R2 ownership, migrations, and domain rules
- Data normalization and graph algorithms that are not coupled to discarded markup
- PWA/service-worker behavior, with old `#/today/briefing` targets and stale cache assumptions migrated to the new route contract
- Every product invariant that concerns learning behavior, source truth, reversibility, or recommendation safety
- Useful E2E setup, fixtures, and API-level assertions

## Target frontend architecture

```text
client/src/
  app/
    App.tsx
    router.ts
    providers.tsx
  shell/
    StudioShell.tsx
    Sidebar.tsx
    Topbar.tsx
    Inspector.tsx
    MobileDock.tsx
  workspaces/
    home/
    library/
    learn/
    map/
    settings/
  objects/
    source/
    thread/
    note/
    unit/
    recall/
    branch/
    artifact/
  components/
    actions/
    collections/
    editor/
    feedback/
    overlays/
  state/
    route-state.ts
    selection-state.ts
    workspace-state.ts
  data/
    queries/
    mutations/
    normalization/
  platform/
    offline/
    notifications/
    uploads/
  styles/
    tokens.css
    reset.css
    primitives.css
    shell.css
  api.ts
  main.tsx
```

Rules:

- Workspace modules own orchestration; object modules own reusable object presentation and actions.
- No new single file may become a substitute monolith.
- Endpoint calls stay behind the existing API helpers or focused additions to them.
- Selection and inspector state are explicit and URL-restorable where deep linking matters.
- Heavy graph code remains lazy-loaded.
- CSS tokens and primitives are small and durable; workspace styles remain colocated or narrowly scoped.
- No direct `fetch` in workspace/object presentation. New response handling is typed rather than added as more `any`-shaped orchestration.
- Route registration, shell entry, shared CSS entry, API transport, and E2E integration each have one serialized owner.
- As a guardrail, a frontend file approaching roughly 450 lines requires explicit decomposition review.

## Delivery sequence and status

### Phase 0 — preservation and contract inventory — complete

1. Capture the full working-tree status and create a recoverable pre-reset snapshot outside the active path or on a dedicated `codex/` snapshot branch.
2. Inventory every client endpoint, mutation, offline behavior, deep link, and E2E contract.
3. Freeze a capability matrix proving where every current user action will live in the new IA.
4. Record the new five-route contract in product/design documentation and tests before visual implementation starts.

Exit gate: no current capability lacks a named new owner.

### Phase 1 — side-by-side foundation — complete

1. Keep the existing `app.tsx` entry operational as the rollback path.
2. Create the new folder boundaries, typed five-root router, legacy alias registry, purposeful not-found state, error boundary, data providers, and empty Studio shell beside the old app.
3. Implement design tokens and primitive controls without building workspace-specific decoration or importing old CSS.
4. Add desktop rail/context pane, mobile dock/sheet, global Capture, and global Search foundations.
5. Test the replacement through a temporary entry or controlled entry switch; do not remove the old frontend yet.

Exit gate: all five paths and legacy aliases resolve purposefully on desktop/mobile; the bundle builds; the new entry loads no old design CSS; the old app still launches when the entry pointer is restored.

### Phase 2 — Home and Library vertical slice — complete

1. Build Home around the active Thread, current source, next evidence action, due recall, and quick capture.
2. Build the unified Library with saved views for Inbox, Queue, All, Files, Books, Collections, and Archive.
3. Build the Source object and contextual inspector, including files, reflection, status, Thread role, and lifecycle actions.
4. Verify Queue cap, neutral Not now, explicit bad-fit semantics, and passive file/source opening.

Exit gate: capture → triage → queue → start/resume → return/complete works end-to-end.

### Phase 3 — Learn workspace — complete

1. Build Paths as the Learn default and preserve evidence-derived progress.
2. Integrate Notes as an object browser/reader, not a separate application shell.
3. Integrate Recall as a focused mode with one current review action and disclosed card management.
4. Build Thread, Note, Unit, Recall Card, and Artifact inspectors.

Exit gate: Thread planning, source attachment, reflection, note reading/editing, draft approval, and review flows pass.

### Phase 4 — Map workspace — complete

1. Rehouse the lazy graph inside the new canvas.
2. Build Branches as a full Map review mode with its bounded list/canvas plus a contextual inspector and Keep, Prune, Promote, Hold, Add, and Undo.
3. Fold Balance and contradiction signals into map lenses and branch details.
4. Preserve grounded suggestions and review-before-commit behavior.

Exit gate: graph navigation, evidence inspection, branch decisions, suggestions, and reversibility pass.

### Phase 5 — Settings and learning model — complete

1. Combine Profile, Taste, Hermes quality/memory, and change history into a readable Learning Model section.
2. Preserve direct editing, confidence/provenance, deactivation, version history, and Undo.
3. Rebuild Preferences, Data, and System as compact utility sections.
4. Keep secrets and infrastructure-only controls out of the UI.

Exit gate: all former Insights/Settings capabilities are available without reintroducing destination sprawl.

### Phase 6 — cutover, demolition, hardening, and verification — complete; deployment pending

1. Switch `client/src/main.tsx` to the replacement entry and verify that the old app is no longer imported.
2. Remove old app-coupled markup/styles, obsolete feature presentation, `experience-polish.css`, `mockups/`, and `output/` last; preserve them in the external snapshot only.
3. Complete empty, loading, partial, stale, error, offline, conflict, overflow, recovery, and destructive-action states.
4. Verify keyboard navigation, screen-reader landmarks, focus restoration, contrast, reduced motion, touch targets, graph list alternatives, and RTL/mixed-script note blocks.
5. Run desktop, tablet, and phone visual comparisons in a bounded two-pass review.
6. Replace `DESIGN.md` in place from the implemented visual system and update `AGENTS.md`, `PRODUCT.md`, `PROJECT_CONTEXT.md`, `CURRENT_STATE.md`, `README.md`, architecture/release docs, route references, and active Hermes-facing navigation references.
7. Update the service worker route/cache version, verify no deleted chunk can be served, and run the full verification and release gates. Deployment is a separate, still-pending step.

Exit gate: the new UI is documented, audited, tested, and live-smoked; the old design files are absent from the project path.

## Verification contract

Minimum checks for every implementation phase:

```bash
npm test
npm run verify:hermes
npm run verify:migrations
npm run build
npm run test:e2e
git diff --check
```

Observed completion evidence:

- Five stable global paths (four primary workspaces plus Settings) and no 21-item destination registry.
- Every legacy destination and alias canonicalizes to the correct saved view or typed object without losing IDs.
- Search opens the exact Source, Thread, Note, Unit, Branch/Node, Artifact, assertion, or memory instead of dropping identity at a workspace root.
- Invalid hashes render recovery rather than unrelated Home data.
- Every former capability accounted for by the migration matrix.
- No imports of the discarded styles or obsolete visual components.
- Desktop, tablet, and phone screenshots for Home, Library, Learn, Map, and Settings.
- Base client bundle at or below 150 KB gzip, excluding lazy graph/vendor chunks.
- No leaked Wrangler/Workerd/Playwright processes after E2E.
- No internal Hermes/Lite Visual prompt payload ships in the browser bundle.
- The release checklist reflects the actual migration chain through `0030_hub_notes_files.sql` (or derives the latest migration dynamically).
- Full gates observed on 2026-08-14: unit/typecheck 77/77; Hermes 32 migrations, 21 checks, 56 routes; migrations clean/idempotent; build base 40.78 KB gzip and Atlas lazy 148.91 KB gzip; E2E 18 purposeful destinations/mobile shell/navigation; diff check clean.
- Live deployment and the rollback window are not complete and are intentionally excluded from this task.

## Workstream ownership

The completed dedicated Luna planning tasks covered:

1. **Information architecture and route reduction**
2. **Capacities-inspired design system and interaction grammar**
3. **Frontend architecture, demolition safety, and migration sequencing**
4. **Responsive, accessibility, state, test, and release strategy**

Their findings are reconciled into this document. Implementation should proceed in sequential vertical slices or isolated worktrees with explicit file ownership; multiple tasks must not edit the same shell/router/style/API/E2E integration files concurrently.
