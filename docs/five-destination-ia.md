# Five-Destination Information Architecture

Status: implementation contract for the next frontend cutover.

## Decision

Learning Compass has five global destinations, because the user is moving between
five jobs rather than eighteen products:

| Root | Job | Canonical entry |
| --- | --- | --- |
| Home | Decide what matters next | `#/home` |
| Library | Capture, triage, and find source material | `#/library` |
| Learn | Build, read, and retrieve knowledge | `#/learn` |
| Map | See and tune the knowledge topology | `#/map` |
| Settings | Tune the personal system and inspect its health | `#/settings` |

These are the only destinations exposed by the desktop rail and mobile dock. A
queue, note, branch, or API inventory is a mode or an object inside one of those
spaces, not a new global destination. This removes navigation clutter without
removing capability.

The model is deliberately three-level:

1. **Root** — the stable job-oriented space.
2. **Mode/focus** — a local lens inside that space, represented in query state.
3. **Object** — a typed, URL-restorable record selected from a root.

## Route grammar

The router must treat the hash as a small, typed grammar rather than a registry of
peer pages:

```text
ROOT    := /home | /library | /learn | /map | /settings
MODE    := ?mode=<root-mode>&focus=<optional-focus>
OBJECT  := /<object-type>/<encoded-id>?from=<root>&mode=<mode>&focus=<focus>
QUERY   := q, filter, sort, page, from, mode, focus (only where meaningful)
```

Canonical root entries omit the default mode:

```text
#/home                         Home / today
#/library                      Library / triage / queue
#/library?mode=catalog         Library / source catalog
#/library?mode=assets          Library / files and companions
#/learn                        Learn / paths
#/learn?mode=practice          Learn / notes and recall
#/map                          Map / atlas
#/map?mode=review              Map / branch and balance review
#/settings                     Settings / personal
#/settings?mode=data           Settings / data and sync
#/settings?mode=system         Settings / system
```

The mode is URL state, not a new global route. `focus` is a local sub-selection,
not a route destination. For example,
`#/library?mode=triage&focus=inbox` is still Library, and its local switcher can
move between Queue and Inbox without changing the global rail.

Typed object routes are the one intentional path extension. They preserve
identity, browser history, search results, and copy/paste deep links:

```text
#/library/source/:id
#/library/artifact/:id
#/library/book/:id
#/library/collection/:id
#/learn/thread/:id
#/learn/note/:id
#/learn/unit/:id
#/learn/card/:id
#/map/node/:id
#/map/branch/:id
```

An object route inherits its owning root and opens the optional inspector or
focused detail surface. The `from`, `mode`, and `focus` query values are hints for
the Back action; object identity must never be lost if those hints are absent.
Settings profile records are not global object routes: they use
`#/settings?focus=profile` so infrastructure and profile internals do not become
another object taxonomy.

## Mode model

Modes are local, finite, and named after the work they enable. They should be
shown as a compact segmented control, tabs, or a single “More” menu in the active
workspace—not as a permanent second navigation rail.

| Root | Default | Modes and focus values | What stays together |
| --- | --- | --- | --- |
| Home | `today` | `today` only | Active Thread, next source action, due recall, capture signal |
| Library | `triage` | `triage`: `queue` or `inbox`; `catalog`: `all`, `books`, `collections`, or `archive`; `assets`: `files` | Queue and Inbox are one triage job; source types are filters in one catalog; files are owned artifacts |
| Learn | `paths` | `paths`; `practice`: `notes` or `recall` | Paths remain the organizing spine; Notes and Recall are two deliberate practice lenses |
| Map | `atlas` | `atlas`; `review`: `branches` or `balance` | Atlas is the spatial default; branch decisions and attention/coverage analysis share review context |
| Settings | `personal` | `personal`: `profile` or `preferences`; `data`; `system` | Personal behavior is one area; storage/recovery and runtime inspection remain guarded utilities |

Rules for adding a mode:

- It must represent a distinct user job, not an API resource or database table.
- It must have a clear default and an empty/loading/error state.
- It must be reachable from the active root without making the rail/dock grow.
- If two surfaces share the same object list and primary action, they are a focus
  or filter, not two modes.
- A new mode requires an IA contract and E2E route coverage; it cannot be added
  solely because a backend endpoint exists.

## Legacy recovery and canonicalization

Existing hashes remain recoverable. The router translates them to a root, mode,
and focus while retaining an object ID when one exists. It should announce
“Old link restored to this workspace” and replace the URL with the canonical hash
without adding a new history entry. Unknown hashes render a recovery state in
Home (or the nearest recognized root) instead of a blank page or infrastructure
fallback.

| Legacy family | Canonical recovery |
| --- | --- |
| `/today`, `/today/briefing`, `/today/momentum`, `/insights/overview` | `#/home` |
| `/curate/queue`, `/library/queue` | `#/library?mode=triage&focus=queue` |
| `/curate/inbox`, `/library/inbox` | `#/library?mode=triage&focus=inbox` |
| `/curate/discovery`, `/library/all` | `#/library?mode=catalog&focus=all` |
| `/curate/books`, `/library/books` | `#/library?mode=catalog&focus=books` |
| `/curate/collections`, `/library/collections` | `#/library?mode=catalog&focus=collections` |
| `/curate/archive`, `/library/archive` | `#/library?mode=catalog&focus=archive` |
| `/learn/files`, `/vault/files`, `/library/files` | `#/library?mode=assets&focus=files` |
| `/learn/hub`, `/learn/paths` | `#/learn` |
| `/learn/hub/:id` | `#/learn/thread/:id` |
| `/vault/notes`, `/learn/reflections`, `/learn/notes` | `#/learn?mode=practice&focus=notes` |
| `/learn/cards`, `/learn/review`, `/learn/recall` | `#/learn?mode=practice&focus=recall` |
| `/learn/activity` | `#/settings?mode=data` |
| `/map/deck`, `/map/branches` | `#/map?mode=review&focus=branches` |
| `/map/coverage`, `/map/balance`, `/insights/learning` | `#/map?mode=review&focus=balance` |
| `/settings/profile` | `#/settings?focus=profile` |
| `/settings/appearance`, `/settings/learning`, `/settings/curation`, `/settings/preferences` | `#/settings?focus=preferences` |
| `/settings/data` | `#/settings?mode=data` |
| `/settings/system` | `#/settings?mode=system` |
| `/insights/taste`, `/insights/hermes` | `#/settings?focus=profile` |

Typed legacy links must be translated before generic alias handling. Examples:

- `/library/source/:id` stays the source object route, with `from=library` if no
  origin is supplied.
- `/learn/hub/:id` becomes `/learn/thread/:id`, preserving the ID exactly.
- `/map/deck/branch/:id` becomes `/map/branch/:id?from=map&mode=review&focus=branches`.

No alias may silently discard an ID. Query parameters that are not recognized are
preserved where safe and ignored where they could expose infrastructure state.

## Shell topology

### Desktop

Use a three-plane composition:

```text
persistent five-root rail  |  active root canvas  |  optional object inspector
```

- The rail contains exactly Home, Library, Learn, Map, and Settings, plus global
  Capture, Search, and sync status.
- The active workspace owns its heading, local mode switcher, filters, and saved
  focus. There is no permanent context pane or second navigation column.
- The canvas is the primary work surface and must remain useful at every root
  default state.
- The inspector exists only when an object is selected or deep-linked. It is not a
  substitute for navigation and closes back to the originating root/mode.
- Search results, captures, and typed links enter the same object/inspector model.

### Mobile and tablet

- The five roots become a bottom dock; Capture remains a high-salience global
  action without obscuring the dock.
- The active root’s mode switcher is an inline segmented control when space allows,
  otherwise a top sheet/menu. It is not an always-open context pane.
- An object inspector becomes a full-height sheet or pushed detail view with a
  stable Back action. Escape/back closes it before leaving the root.
- On tablet, retain the canvas plus inspector when width allows; do not resurrect a
  desktop-style second navigation pane merely to expose modes.
- All mode controls and sheets require keyboard focus management, visible focus,
  a labelled close action, and no tabbable hidden controls.

## Workflow preservation

The restructure changes where capabilities are found, not what the product can
do:

- **Home:** resume the active Thread/source, expose one next evidence action, show
  due recall, and keep Capture immediate. Momentum/briefing are sections, not
  destinations.
- **Library:** Inbox remains unlimited; Queue remains capped at five unless an
  explicit override is confirmed. Queue alone owns Start/Resume/Return/Complete;
  opening an object elsewhere remains passive. Catalog filters preserve Books,
  Collections, Archive, and All sources. Assets preserves files and companions.
- **Learn:** Paths remains the Thread/evidence spine. Practice switches between
  readable Notes and Recall; notes remain structured/bilingual and recall keeps
  draft approval plus FSRS behavior.
- **Map:** Atlas remains the real lazy-loaded graph with accessible list fallback.
  Review switches between Branch decisions and Balance/coverage without losing
  branch selection or evidence.
- **Settings:** Personal keeps Profile and Preferences; Data keeps offline
  recovery/export/storage ownership; System keeps descriptive capabilities,
  schedules, and safety boundaries without secrets.
- **Search and object selection:** every result resolves to a typed object route;
  the originating root/mode is restored on close. Capture always lands in Inbox.
- **Backend contracts:** no API, D1, R2, Hermes, or learning-loop invariant is
  changed by this IA migration.

## Acceptance criteria

### Navigation and routing

- Root rail and mobile dock expose exactly five root hrefs: `#/home`,
  `#/library`, `#/learn`, `#/map`, and `#/settings`.
- The router has one canonical root/mode grammar; it does not maintain an 18-item
  peer-destination registry.
- Every mode/focus is reachable from its root and by a stable query hash.
- Typed Source, Artifact, Book, Collection, Thread, Note, Unit, Card, Node, and
  Branch links preserve identity and open the correct owning root.
- Every listed legacy family recovers to the mapped root/mode/focus, announces the
  recovery, and never loses a typed ID.
- Unknown roots, modes, and object types produce a purposeful recovery state.

### Shell and interaction

- Desktop renders root rail + canvas + optional inspector, with no permanent
  context pane in the DOM or tab order.
- Mobile renders the five-root dock; mode sheets and inspector sheets trap focus,
  close predictably, and remove hidden controls from tab order.
- Object inspector Back/Escape returns to the prior root/mode; opening a source or
  companion remains passive unless the Queue workflow explicitly starts a session.
- Search, Capture, queue cap/override, Notes, Recall, Atlas, Branches, Balance,
  Profile, Data, and System workflows remain executable from their new modes.

### Verification

- Unit coverage tests default modes, query parsing, canonical href generation,
  object routes, alias recovery, ID preservation, and unknown-route recovery.
- E2E coverage visits all five roots, every mode/focus, representative typed links,
  every legacy family, desktop/mobile shell behavior, and horizontal-overflow/
  heading/error checks.
- `rg` finds no new links to retired peer destinations in the client, and no
  context-pane selectors remain in the shipped shell after migration.
- `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`, and
  `git diff --check` pass before deleting retired navigation files.

## File ownership map

| Area | Owning files | Responsibility |
| --- | --- | --- |
| Route grammar | `client/src/app/router.ts` | Root/mode/query parser, typed object grammar, alias table, canonical recovery, route helpers |
| Composition | `client/src/app/App.tsx` | Route-to-workspace selection, object selection, inspector close/back, global actions |
| Shell | `client/src/shell/StudioShell.tsx` and shell CSS | Five-root rail/dock, canvas frame, local mode affordance, optional inspector slot; remove context-pane topology |
| Workspace mode contracts | `client/src/workspaces/HomeWorkspace.tsx`, `LibraryWorkspace.tsx`, `LearnWorkspace.tsx`, `MapWorkspace.tsx`, `SettingsWorkspace.tsx` | Normalize query modes/focuses and keep local controls inside each root |
| Library lenses | `client/src/workspaces/library/*` | Triage, catalog filters, assets, typed source/artifact/book/collection records |
| Learn lenses | `client/src/workspaces/learn/*` | Paths, Notes, Recall, typed Thread/Note/Unit/Card records |
| Map lenses | `client/src/features/atlas/*`, `client/src/features/branches/*`, `MapWorkspace.tsx` | Atlas graph, branch review, balance, typed Node/Branch records |
| Search/deep links | `client/src/shell/SearchDialog.tsx`, `client/src/workspaces/library/types.ts`, `client/src/workspaces/learn/helpers.ts` | Emit only canonical root, mode, and typed object hrefs |
| Tests | `tests/unit/*router*`, `tests/e2e/routes.mjs` | Route matrix, recovery, five-root shell, mode/focus, deep-link and responsive acceptance |
| Product contract | `PRODUCT.md`, `DESIGN.md`, `PROJECT_CONTEXT.md`, `CURRENT_STATE.md` | Replace the 18-view contract with this five-destination model after implementation gates pass |
| Runtime links | `client/public/sw.js` and any generated manifest/link surfaces | Remove stale hash targets such as `/today/briefing`; point notifications to canonical roots |

Migration order: land the router contract and route tests, simplify the shell,
normalize each workspace, update every generated/internal link, run the full
verification matrix, then delete the retired context-pane/view-registry code.
No API or data migration is required.
