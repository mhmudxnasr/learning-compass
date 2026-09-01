---
name: Continuum
description: Warm editorial knowledge workspace for Learning Compass
colors:
  rail-bg: '#171513'
  shell-bg: '#fcfaf6'
  ledger-bg: '#fdfbf8'
  canvas-bg: '#fefdfb'
  surface-bg: '#fefdfb'
  inspector-bg: '#fdfbf8'
  ink: '#171513'
  secondary: '#514b45'
  muted: '#6c655e'
  seams: '#e1d5ca'
  coral: '#e55a42'
  coral-soft: '#f8d8d0'
  due: '#8a5b12'
  danger: '#a8373f'
  map: '#24757a'
typography:
  display:
    fontFamily: 'Manrope, Noto Sans Arabic, system-ui, sans-serif'
    fontSize: 'clamp(24px, 3.5vw, 36px)'
    fontWeight: 650
    lineHeight: 1.18
  headline:
    fontFamily: 'Manrope, Noto Sans Arabic, system-ui, sans-serif'
    fontSize: 'clamp(18px, 2.5vw, 24px)'
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: 'Manrope, Noto Sans Arabic, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: 'Manrope, Noto Sans Arabic, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: 'Manrope, Noto Sans Arabic, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.7
  mono:
    fontFamily: 'JetBrains Mono, IBM Plex Mono, ui-monospace, monospace'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: '14px'
  card: '18px'
  panel: '22px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.coral}'
    textColor: '#000000'
    rounded: '{rounded.pill}'
    padding: '8px 16px'
  button-secondary:
    backgroundColor: '{colors.surface-bg}'
    textColor: '{colors.secondary}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
---

# Design system: Continuum

Resurfacing uses one quiet Memory Shelf card on Home with a canonical branch pill and explicit Star, Reviewed, Snooze, and Dismiss controls. Its source title and card surface open the unified source dossier, while its branch, companion, and review controls keep their own destinations and actions. Note distillation stays inside the reader as progressive disclosure. Meaningful links show relation type, explanation, counterpart Unit, source anchor, and branch identity. Contradictions live under Learn → Practice; frontier states remain restrained Map signals rather than a new root destination.

## Overview

Continuum treats Learning Compass as a private editorial knowledge workspace. The default mode uses warm off-white planes, a near-black persistent rail, clear type, and one coral working signal. Thin seams, generous whitespace, and pill-shaped decisive actions make the interface feel current and tactile while preserving few visible choices, obvious current work, and no ornamental dashboard furniture.

The visual references are functional. Linear informs shell precision and list density. Capacities and Are.na inform the calm spatial canvas. Heptabase informs the lesson-and-material relationship. Obsidian informs the theme system. Arabic reading follows the same care found in well-made Quran interfaces through correct direction, generous line height, and clear Arabic type. It does not borrow religious decoration.

### Composition contract

- Desktop uses a 220px labeled root rail, a 58px command bar, a flexible working canvas, and an optional object inspector. Between 941px and 1180px, the rail contracts to 82px.
- Ordinary workspaces use a bounded canvas. Atlas can remain edge-to-edge because the graph is its working surface.
- Grouped modes live in the command bar. Filters stay inside the workspace that owns them.
- Home leads with exactly one current lesson turn from every active Thread. Each directly completable turn carries one restrained Finish lesson action beside its passive materials; success confirms in place, animates through opacity and transform only, and replaces the row with the next ordered lesson without navigation. The active Queue source sits in a narrower contextual rail with its passive material links. Queue selection changes this context without starting a tracked session.
- Original, HTML, PDF, and NotebookLM appear as compact icon-and-label controls beside the lesson or source they belong to. Their labels remain complete for assistive technology.
- Original and NotebookLM controls say that they are online-only. A coherent verified companion pair can carry a nearby Keep offline control with exact bytes and honest ready, partial/evicted, superseded, storage-full, failed, refresh, and remove states; HTML and PDF are never presented as one offline pack when their pair identities differ. The saved pack also contains only the compact already-loaded owning record/path snapshot, and the actual artifact responses must still identify the expected current ready/passed pair before the service worker commits it.
- Source health is a quiet advisory row, not a blocking alarm. Restricted and unknown states explain false-positive risk, a verified companion is offered only when a coherent pair exists, and replacement lives behind progressive disclosure with verify first and an explicit second confirmation.
- Resurfacing and RSS stay visible below active work. They never compete with the next lesson in the first reading pass.
- Library, Learn, Map, and Settings use the same page horizon, semantic controls, continuous ledgers, and surface-depth rules as Home. Root-specific workflows keep their own information architecture without introducing a second visual product.
- Queue opens as a ranked Ledger by default. Gallery remains a saved alternate view, while both presentations preserve the same source order, branch identity, materials, and tracked Start/Resume boundary.
- Typed object views, the inspector, Capture, Search, and other dialogs use the same Canvas, Surface, Inspector, Seam, and Coral roles as their owning workspace. An ambiguous Android URL-plus-prose share opens a focused two-choice dialog: whole-source Capture or exact selected passage, with the original title, URL, and text visible and a non-destructive Decide later exit.
- At 940px and below, the rail becomes a sticky utility bar and five-item bottom dock. Content moves to one column without changing task order.

## Colors

Attio Coral is the default Continuum theme. Preferences offers eight complete art directions rather than palette-only recolors: Continuum, Raycast Command, Superhuman Focus, Reader Study, Notion Minimal, Craft Journal, Arc Space, and Are.na Index. Each is an original Learning Compass interpretation of one premium product reference and binds a distinct semantic palette, loaded font system, reading measure, density, text scale, and corner system; individual Day/Night palettes and expert controls remain available below them.

- Rail `#171513`, shell `#fcfaf6`, ledger `#fdfbf8`, canvas `#fefdfb`, surface `#fefdfb`, and inspector `#fdfbf8` form the default structural planes.
- Ink `#171513`, secondary `#514b45`, and muted `#6c655e` define accessible default text levels.
- Coral `#e55a42` marks focus, current work, selected navigation, and deliberate actions. Coral Soft `#f8d8d0` is its quiet selected surface.
- Due `#8a5b12`, danger `#a8373f`, and map `#24757a` keep their semantic roles across themes.
- Seam `#e1d5ca` separates regions. A 1px seam and a tonal plane change are the default structural treatment.

Shadows are reserved for context that floats or stays pinned while the canvas moves. The active Queue source may use a soft deep shadow; ordinary rows remain flat.

## Typography

Studio Sans uses Manrope for interface, display, and default reading text. Noto Sans Arabic is the first Arabic fallback. JetBrains Mono carries compact metadata, indices, and keyboard commands. The complete preset systems also load IBM Plex Sans/Serif/Arabic, Newsreader, Plus Jakarta Sans, Literata, Noto Naskh Arabic, Inter, and Fira Code so a selected direction never silently collapses to a generic fallback. Other font systems remain selectable in Preferences and must preserve the same spacing and contrast rules.

- Display text uses 600-650 weight, tight negative tracking, and short line lengths.
- Section headings use 600 weight with a 1.15-1.3 line height.
- Body text starts at 14px with a 1.6 line height. Long-form reading starts at 16px with a 1.7 line height and a 45-75ch measure.
- Metadata uses 500 weight at 10-12px. Uppercase is allowed only for short locators and should keep restrained tracking.
- Arabic text uses automatic or explicit RTL direction, Noto Sans Arabic, and at least a 1.7 line height. Mixed-language metadata stays in its natural direction.

## Layout and shape

Controls use a 14px radius. Cards use 18px and panels use 22px in the default world. Pills are reserved for decisive primary actions, segmented controls, and compact status—not every container. The default canvas padding scales with the viewport, and every mobile or tablet target is at least 44px.

Motion uses paint, opacity, and transform only. Route entry is a short 260ms fade-and-rise. Hover movement is limited to 1-3px. Reduced motion removes route entry and transitions.

## Components

### Map Review branch dossier

- **Composition:** A compact branch index, an editable central dossier, and a persistent signals-and-decision rail on desktop. Narrow screens preserve that order as index, decision rail, then dossier so consequential actions remain discoverable.
- **Decision controls:** Keep active, Make first priority, Pause branch, and Archive branch remain visible together. Active uses Coral, priority uses Map, pause stays neutral, and archive uses Danger without making destructive treatment dominant.
- **Signals:** Attention window, recent share, filed sources/notes/Units/recall, and priority alignment use live Worker projections. Signals explain decisions; they never become a separate Balance tab.
- **Structure:** Branch scope, topics, category, and boundary edit inline. The branch ledger remains in the same dossier and typed branch routes preserve selection.

### Atlas interaction

- **Viewport use:** The Atlas canvas fills all workspace height remaining below the Map mode switcher; it never stops at a fixed minimum or leaves a blank lower half on tall desktop displays.
- **Selection:** One tap selects a node without moving the camera or changing branch depth.
- **Expansion:** Double-tapping a node toggles its complete subtree without changing zoom; double-tapping empty canvas fits the graph.
- **Layout:** Domains, branches, and topics open in stable hierarchy-aware orbits; rectangular label collision prevents unreadable piles while preserving branch structure.
- **Direct manipulation:** Dragging a branch carries every visible descendant with it, then releases the subtree as one stable constellation.
- **Force motion:** Drag release preserves momentum and lets charge, center attraction, and link springs visibly rebalance the graph. Force controls remain functional independently of the Display transition toggle, accept true zero values, and stay numerically bounded at their maximum settings. Hover wakes only the local neighborhood, highlighting and gently pulsing connected nodes and paths; reduced motion keeps the same relationship highlight without spatial movement.
- **Stable opening:** Initial load and depth changes preserve the hierarchy-aware constellation instead of automatically running forces toward the center. Physics wakes only from direct manipulation or force-control input and always cools to rest.
- **Scale:** Overview zoom prioritizes domains and branches; topic labels appear only when the camera is close enough to read them.
- **Default density:** Atlas opens with arrows off, focus dimming on, 0.85× nodes, 1.4× evidence links, 1.5× hierarchy links, and balanced 14 / 0.65 / 1.25 charge-center-spring forces so the complete graph remains legible before customization.
- **Recovery:** Search restores the selected node with its ancestry, conflicting filters are cleared explicitly, and an empty filtered canvas always offers a direct reset.
- **Overlays:** Controls, the node drawer, breadcrumbs, minimap, and viewport tools remain independently operable and never cover the control that opened them.

### Learning Thread: Vertical Journey

- **Threads index:** The index answers “what can I continue?” before reporting aggregate progress. One compact summary, truthful In progress/Paused/Completed/All filters, search, and explicit Continue/Review/Open affordances lead into calm ledger rows; dashboard metric cards and overlapping Current Work/Active filters are absent.
- **Persistent spine:** A typed Thread route removes the global Learn mode switcher and begins at the working canvas's left edge with one breadcrumb back to Threads. The flat, border-bottom spine keeps a compact title and question beside direct lesson progress, exact current Level/lesson, and the command center's only primary next-action link. Pause/activate is a quiet top-line action rather than another panel control.
- **Task-language sections:** Stable query keys retain compatibility while visible labels read Now, Lessons, Projects, and Resources. Desktop uses one quiet underlined text row with no descriptions or segmented container; narrow containers preserve a visible 2×2, 44px-minimum control.
- **Now:** The next action and current position remain only in the spine. The Now view contains one inline resource count and the complete linked Level journey; duplicate position cards, explanatory introductions, and repeated progress tracks are absent.
- **Lessons:** Every Level summary remains on one continuous hairline axis, but exactly one Level is expanded. Search returns one bounded lesson index with incremental disclosure. Every Level entry point returns through `tab=curriculum&level=<id>` so browser navigation, breadcrumbs, refresh, sharing, and the Projects handoff preserve the exact place inside the Thread. Standalone typed Level links remain recovery surfaces, not the normal navigation path.
- **Projects:** The same one-open-Level axis leads with current application and leaves future projects as previews. Projects and final synthesis are optional practice and never progression gates.
- **Resources:** Thread, Level, and Lesson owners share one faceted vertical index. Exactly one owner opens at a time, long note bodies become bounded excerpts, and large owner/item sets reveal incrementally. Navigable item titles carry navigation without duplicate owner-workspace actions; direct material creation remains explicit progressive disclosure.
- **Material organizer:** Resources begins with search over existing branch-owned Library sources and shows every current Thread, Level, and Lesson placement. The learner chooses an exact Level or Lesson, role, expected contribution, and position before Attach; attached rows expose edit/reorder and remove without turning the source into a duplicate or a Queue item. Current Thread and current Level offline packs sit with their owning material indexes.
- **Find material:** An empty incomplete lesson in the current Level may show one explicit Find material action. Pending/running/retry, ready, abstained, and failed states remain in that lesson. A ready result is a reviewable external-source pick with title, creator, expected contribution, branch, and URL; it never looks attached, queued, started, or completed until the learner takes the separate canonical action. Abstention is first-class and shows its reason.
- **Lesson sequence:** One breadcrumb and one compact metadata row establish place, duration, and truthful readiness; a locked Level reads Locked rather than Ready to study. The near-header action bar renders only when previous/next navigation or a valid start/complete action exists. Successful completion opens the next ordered Thread lesson when one remains; reopening and final-lesson completion stay on the current page. Progression explanations, Lesson purpose, and the authored-guide disclosure are absent from the Lesson route; curriculum context remains in the Thread's Lessons view. Study materials are a flat ledger with source identity on the left and only compact, accessible icon actions for HTML, PDF, Original, and NotebookLM on the right. Every additional source remains preserved under one More materials disclosure, and notes/files/recall stay behind one final disclosure. Material icons retain complete purpose, availability, and metadata in their accessible labels and use tonal emphasis plus hairline seams, never nested cards or a multi-pixel side stripe.

### Source anchors and Recall repair

- **Anchor review:** A selected passage opens as one evidence object with source title, surrounding context, quote, locator, branch, and short checksum. The first action is Save source anchor; the interface states plainly that this does not create a note, Unit, or card. After saving, Create note, Create a Learning Unit, and Write a recall card are separate controls and forms. An unknown URL keeps the selected passage visible while directing the learner to capture it under a reviewed branch.
- **Retrieval:** Global Search groups active source anchors separately and shows source identity, quote/context, and locator rather than reducing evidence to a generated summary. Archived anchors disappear from navigation search while their historical record remains available by exact ID.
- **Needs repair:** Recall retains Due and Needs repair as distinct working states. Each repair row explains why it appeared, preserves source/anchor context, and discloses recent reviews, earlier repairs, and at most a few comparison cards. Wording versus semantic change is an explicit choice beside its scheduling consequence. Manual split opens a learner-authored Arabic question/answer form for one new card and states that the original is unchanged. Pause, retire, restore, and confirmed schedule reset use calm reversible controls; none are styled as lesson completion or mastery.

### Add Anything

- **Type first:** The global action opens one dialog with Source, Book, Movie, Series, Podcast, Course, Game, Album, and Other choices. Each choice has a short task-oriented hint; the selected choice uses Coral and remains visible without opening another surface.
- **Fast core:** Personal entry asks first for title, contextual creator/author, status, and knowledge branch. Link, release year, duration, progress, rating, tags, and note sit under one native More details disclosure. Source entry preserves link/text/file capture and the same required branch selector.
- **State honesty:** Saving a personal record confirms that it entered the Data Studio, not Queue. Errors preserve input; successful saves refresh the active workspace and reset the next dialog to Source.
- **Responsive overlay:** Desktop uses a wide but bounded editorial sheet with a sticky action footer. Type choices and fields collapse to one column on narrow screens without horizontal scrolling, and every choice/control remains keyboard reachable.

### Personal Data Studio

- **Summary before rows:** Four exact counts lead: tracked, in progress, finished, and rated. Type and state use clickable proportional bars, six-month activity uses a compact column plot, and branch context uses ranked counts. These visuals use canonical API counts and never invent a composite score.
- **Editable ledger:** Search covers title, creator, tags, and note; type/state bars and selectors share the same filters. Rows expose identity, explicit status, real progress, direct rating, branch, and update time. One expanded row reveals every mutable field while media type and canonical record identity remain fixed.
- **Lineage and portability:** A successful edit names the record and states that lineage was saved. JSON and Markdown exports retain personal type/state/progress/rating/tags/note plus source history; full-system recovery remains a separate D1+R2 contract.
- **Responsive table:** Desktop keeps aligned ledger columns. Narrow screens hide the visual header, stack labeled cells, preserve 44px actions, and never require sideways scrolling; accessible cell labels retain the removed visual context.

### Buttons

- **Shape:** Rounded rectangle with a 9px radius.
- **Primary:** Solid Coral surface, black action text, pill geometry, and 8px 18px padding.
- **Secondary:** Control Surface background, a 1px Seam border, and Secondary text.
- **Hover / Focus:** Coral focus ring with a Canvas separation ring; subtle tonal background shift.

### Cards and ledger rows

- **Corner Style:** 14px radius for cards; list rows inside a panel remain square to one another.
- **Background:** Surface or Canvas according to depth.
- **Border:** 1px solid Seam.
- **Internal Padding:** 14px 18px.

### Inputs and search fields

- **Style:** 1px Seam border, Control Surface background, 9px radius.
- **Focus:** Coral border with a visible outer ring.

## Working rules

### Do

- **Do** maintain strict WCAG AA contrast (≥4.5:1 text, ≥3:1 large text) across all themes.
- **Do** ensure every interactive target on mobile and tablet is at least 44×44px.
- **Do** use semantic CSS tokens for all colors, radii, and typography scales.

### Don't

- **Don't** use multi-pixel colored side-tab borders (≥2px colored border-left/right) on cards or list items.
- **Don't** animate layout properties like `width`, `height`, `margin`, or `padding` that trigger layout recalculations.
- **Don't** add decorative chunky colored top-borders to rounded cards.
