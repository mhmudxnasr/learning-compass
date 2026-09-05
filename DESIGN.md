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
- Home opens directly with exactly one current lesson turn from every active Thread, without a separate Today banner or aggregate readiness/Queue counters. Each directly completable turn carries one restrained Finish lesson action beside its passive materials; success confirms in place, animates through opacity and transform only, and replaces the row with the next ordered lesson without navigation. The active Queue source sits in a narrower contextual rail with its passive material links. Queue selection changes this context without starting a tracked session.
- Original, HTML, PDF, and NotebookLM appear as compact icon-and-label controls beside the lesson or source they belong to. Their labels remain complete for assistive technology.
- Original and NotebookLM controls say that they are online-only. A coherent verified companion pair can carry a nearby Keep offline control with exact bytes and honest ready, partial/evicted, superseded, storage-full, failed, refresh, and remove states; HTML and PDF are never presented as one offline pack when their pair identities differ. The saved pack also contains only the compact already-loaded owning record/path snapshot, and the actual artifact responses must still identify the expected current ready/passed pair before the service worker commits it.
- Source health is a quiet advisory row, not a blocking alarm. Restricted and unknown states explain false-positive risk, a verified companion is offered only when a coherent pair exists, and replacement lives behind progressive disclosure with verify first and an explicit second confirmation.
- Resurfacing and RSS stay visible below active work. They never compete with the next lesson in the first reading pass.
- Library, Learn, Map, and Settings use the same page horizon, semantic controls, continuous ledgers, and surface-depth rules as Home. Root-specific workflows keep their own information architecture without introducing a second visual product.
- Queue opens as a ranked Ledger by default. Gallery remains a saved alternate view. Both keep source order, branch identity, passive formats, and tracked Start/Resume visible before advisory diagnostics. Delivery filters and source/offline details are disclosures; absence of notes or cards does not become a warning or a task.
- Home places active lesson turns above resurfacing and feeds in the desktop main column, with current Queue context spanning the narrower supporting column. A taller Queue never adds a gap below lessons or overlaps secondary content when sticky. At 1180px and below, the spread stacks in DOM order: lessons, Queue, then resurfacing and feeds. Paused/draft Threads do not appear or inflate readiness; locked/missing-material turns explain their actual state.
- Home retains a completion receipt with an explicit Undo completion action until another lesson is finished or the workspace is left. Undo reopens that exact lesson through the normal lesson API; it never changes source consumption or creates cards.
- Typed object views, the inspector, Capture, Search, and other dialogs use the same Canvas, Surface, Inspector, Seam, and Coral roles as their owning workspace. An ambiguous Android URL-plus-prose share opens a focused two-choice dialog: whole-source Capture or exact selected passage, with the original title, URL, and text visible and a non-destructive Decide later exit.
- At 940px and below, the rail becomes a sticky utility bar and five-item bottom dock. Content moves to one column without changing task order.

- Ordinary workspaces use a centered canvas capped at 1280px. Atlas alone remains edge-to-edge because the graph is the work surface rather than content inside a page.
- Grouped modes live in the desktop command bar with one restrained active rule. Subordinate filters stay in the working field only where the active mode needs them; compact layouts return the modes to equal-width inline controls.
- Map Review preserves the branch index beside a readable dossier on normal laptops. Signals and decisions move beneath the dossier instead of forcing a cramped third permanent rail.
- Settings → Preferences is a settings studio rather than a component gallery: a compact section index anchors the desktop, the current visual system has one truthful summary, a single in-flow studio preview demonstrates the combined result, and controls progress from complete workspace styles to comfort, expert appearance, learning behavior, and Map tuning. The index becomes a horizontal section strip on compact layouts; the preview never competes as a permanent third rail.
- Preferences begins with the current style and up to two alternatives; Browse all styles exposes every existing choice. The preview uses one title and explanation. Read-only recommendation-engine internals stay out of learner settings. Reminder troubleshooting distinguishes browser permission/subscription recovery from delivery-key repair by Hermes.
- Below 940px, the root rail becomes a branded sticky utility bar and five-item bottom dock. Root modes use equal-width grids sized to their actual count, including a single four-column Library row at phone widths.

## Colors

Attio Coral is the default Continuum theme. Preferences offers eight complete art directions rather than palette-only recolors: Continuum, Raycast Command, Superhuman Focus, Reader Study, Notion Minimal, Craft Journal, Arc Space, and Are.na Index. Each is an original Learning Compass interpretation of one premium product reference and binds a distinct semantic palette, loaded font system, reading measure, density, text scale, and corner system; individual Day/Night palettes and expert controls remain available below them.

- Rail `#171513`, shell `#fcfaf6`, ledger `#fdfbf8`, canvas `#fefdfb`, surface `#fefdfb`, and inspector `#fdfbf8` form the default structural planes.
- Ink `#171513`, secondary `#514b45`, and muted `#6c655e` define accessible default text levels.
- Coral `#e55a42` marks focus, current work, selected navigation, and deliberate actions. Coral Soft `#f8d8d0` is its quiet selected surface.
- Due `#8a5b12`, danger `#a8373f`, and map `#24757a` keep their semantic roles across themes.
- Seam `#e1d5ca` separates regions. A 1px seam and a tonal plane change are the default structural treatment.

Shadows are reserved for context that floats or stays pinned while the canvas moves. The active Queue source may use a soft deep shadow; ordinary rows remain flat.

Functional foregrounds have contrast-corrected `-text` tokens independent of their accent fills. Quiet text is checked on shell, canvas, surface, ledger, inspector, hover, and active planes. Files actions wrap within their column, and interactive format/branch badges retain 44px targets. Each Settings range has an explicit label association; the seven-section index opens Type tuning before scrolling to it. Notification failures describe permission, connection, renewal, or setup recovery with inline troubleshooting. Notes use the same reading-time calculation in their index and reader; an unresolved branch opens the existing editor instead of an empty dossier link.

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

### Reading and retrieval

- Files identifies each companion pair by source or book and chapter, sorts a book's chapters in reading order, and links the correct owner and verified branch. Superseded/retired records live behind Include earlier versions and carry explicit state labels. Visible material names are Original, NotebookLM, HTML, and PDF. Immutable Lite Visual pairs show Published pair in place of a Delete action the server rejects; pair retirement remains a guarded Hermes operation.
- Recall displays canonical branch labels and links, preserving legacy stored branch values for edits. Unresolved identities say Unassigned branch. Grade help distinguishes failed recall, effortful recall, correct recall, and immediate recall without promising invented scheduling intervals.
- Recall keeps keyboard actions inside the focused review card: Space/Enter activates Reveal answer, then 1–4 submits Again/Hard/Good/Easy. Focus moves to the grade controls, next question, or completed-review state; a rejected save retains the question, answer, and chosen grade focus. A synchronous save guard prevents duplicate requests. Reveal state belongs to the exact card revision, successfully reviewed cards leave the current session, and empty filters offer Clear filters without claiming the due queue is empty.
- Recall leads with the question and Reveal action on mobile. Its four review views share one wrapping control row; branch/search filters use a closed native disclosure and indicate active filters. The page omits duplicated due counts and location text already supplied by navigation.
- Skip to workspace focuses the existing main landmark without changing the hash route. Global search starts in its labelled input and politely announces pending work, result counts, and recoverable failures.
- Search arrow navigation moves native focus to the chosen link, so assistive technology announces the actual Enter destination. File matches identify their source and chapter plus format; saved preference text and readable profile labels appear instead of opaque Hermes procedure keys. Files actions include the complete source/book/chapter identity in their accessible name. At intermediate widths, their action strip sits below the title. Atlas calls its optional control disclosure Map settings without an unexplained node-count badge.

- Notes uses one centered reading column with a 76ch outer measure, 28–40px desktop titles (26–32px compact), 17px English and 18px Arabic body text scaled by the existing preference. Arabic text retains 1.9 line height and independent direction. Original section/block order keeps claims beside their explanations. Contents is a closed disclosure; Study tools opens an optional rail, stacking below the document on compact layouts. Extraction/processing receipts stay verbatim in a separate provenance disclosure and out of the reading outline.
- The note reader's primary toolbar contains Study tools, its available source/lesson owner link, and Edit. Copy note and Refresh from source live in the existing Study tools panel, preserving their behavior without competing with reading.
- Opening Study tools focuses its panel so controls are reachable immediately below a long mobile note. Close study tools or Escape anywhere in the expanded tools, including claims and synthesis, returns focus to the original toggle; unsaved highlight/synthesis input stays in the owning reader state.
- Editing focuses the note title. Save/Cancel returns focus to Edit and stale save feedback is cleared when a new edit begins. Each section's content has a specific accessible name, with concise formatting help and plain-language direction choices. Per-note drafts survive navigation and reload on the same browser, expose Resume editing, and remain separate from the saved note. Save clears the draft only after success; explicit Cancel discards it. A recovered draft based on an older saved note requires confirmation before replacement. Unavailable browser storage retains the current-session copy and warns before closing an active editor.
- Arabic reading blocks carry Arabic language metadata separately from direction; English blocks keep English language metadata. The active mobile dock uses the same contrast-corrected ink/active-surface pair as the workspace.
- Uploaded filenames open file details. A separate, named book/source link supplies owner context, and every supported uploaded format has a direct Open action. Companion chapter identity and canonical owner navigation remain intact.
- Books shows identity, progress, and the next chapter before the full source-health control. Reading formats carry the primary emphasis; completion remains quieter. Chapter and whole-book offline packs share a closed Offline reading disclosure. Healthy diagnostics collapse; actionable problems expand. Current Book, My Books, and Canon are in-page jumps within one room.
- Home allows lesson titles to wrap to two lines and keeps source branch pills visible. Material formats have icon-and-label controls across Home and lessons; study actions are at least 44px. Threads uses filter counts instead of a separate statistics band, and Learn opens Threads by default.
- Empty global search shows up to eight items previously opened from search on this browser. Arrow keys and Enter reopen items; Clear recent items removes the local history. No server records or learning progress change.
- Atlas offers a domain selector before the canvas. Selection clears conflicting branch/frontier filters and fits that domain; Whole map restores the complete overview. Domain labels retain a readable screen size at overview zoom. Branch labels appear only at 11px or larger on screen; the domain control explains how to reveal them.

### Feeds: article triage

Feeds extends the selected Continuum workspace theme with a compact title navigator and one readable article excerpt. It inherits the existing semantic colors, interface/display/reading font families, text scale, and appearance overrides; the selected theme's accent marks Open article and its active surface marks the current navigator entry.

- **Desktop composition:** A scrollable publication-and-title index sits on the left beside one article, separated by a single Seam. The index takes 28% of the working field with a 230px minimum; the reading column is capped at 780px, with a 42px gap. At 1080px and below, the minimum becomes 190px and the gap becomes 26px. The article carries publication, date, position, title, verified branch, bounded excerpt, and a separate saved-record link.
- **Phone composition:** At 720px and below, the article comes before the navigator, which is bounded to 330px of scrollable height. Previous, Skip, Open article, and Queue sit in normal flow below the title and branch and before the excerpt. The action row can wrap and must not overlay text or the bottom dock. Open article and Skip share available width; icon-only controls retain their accessible names and at least 44px touch width.
- **Reading hierarchy:** The selected display font carries the article title at 650 weight, with a desktop size of `clamp(25px, 2.5vw, 36px)` and 1.19 line height; phones use 27px and 1.2. The selected reading font uses an 18px base multiplied by the user's text scale, 1.75 line height, and a 68ch maximum measure. Phones use a scaled 16px base and 1.7 line height. Excerpts are limited to six lines on desktop and four on phones; full reading belongs to the original article. Titles and excerpts preserve automatic text direction.
- **Compact local controls:** Feeds uses 13px interface/navigation text and 11px supporting publication, position, and hint text. Its local base corners use 8px for toolbar and form controls, 9px for the publication selector, and 10px for article actions and disclosed search/management surfaces. These scoped values support the denser index and do not add steps to the global type or corner scales. Existing theme and appearance overrides remain authoritative.
- **Action distinction:** Open article uses the theme's accent and opens the original directly. View saved record remains a separate quiet link. Skip removes the exact feed/source entry immediately, advances to another available entry, and persists removal from that feed. A failed request restores the entry and selection with an inline error. Successful Skip preserves the saved source, import identity, and Queue state; its confirmation must not imply deletion, taste feedback, or a user-facing Undo action. Queue remains its own explicit choice.
- **Progressive disclosure:** Publication selection stays in the toolbar; Search and Manage reveal their own controls in place. Manage owns subscription checks, unsubscribe, and branch-gated additions. Empty, loading, search-miss, and request-failure states use plain messages and relevant recovery controls in the working field.
- **Depth and motion:** Thin seams and theme surfaces organize the reader without an enclosing card or new shadow treatment. The desktop action row may remain sticky within the article; the phone row is static. Article changes use a short opacity/4px-rise arrival (160ms, ease-out), removed for reduced motion. Focus uses the shared focus color with a 2px outline and 4px offset.

**The Reading Before Index Rule.** Keep the reading column and all its controls before every navigator entry in the DOM, even when desktop CSS places the index on the left. A long feed must never require tabbing through its titles before reaching the current article's actions. J/Skip, K/Previous, and O/Open shortcuts remain inactive while a form field, link, button, editable region, or dialog owns keyboard input.

### Map Review branch dossier

- **Composition:** A compact branch index, an editable central dossier, and a persistent signals-and-decision rail on desktop. Narrow screens preserve that order as index, decision rail, then dossier so consequential actions remain discoverable.
- **Decision controls:** Keep active, Make first priority, Pause branch, and Archive branch remain visible together. Active uses Coral, priority uses Map, pause stays neutral, and archive uses Danger without making destructive treatment dominant.
- **Signals:** Attention window, recent share, filed sources/notes/Units/recall, and priority alignment use live Worker projections. Signals explain decisions; they never become a separate Balance tab.
- **Structure:** Branch scope, topics, category, and boundary edit inline. The branch ledger remains in the same dossier and typed branch routes preserve selection.

### Atlas interaction

- Selecting a node retains keyboard focus on the map and updates its meaningful selected path. A branch in that path has a canonical Open branch link to its full dossier. Selection never opens a duplicate inspector of IDs and routes.

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

- **Threads index:** The learning desk uses a large editorial title, a compact readiness line, counted status controls including Planning, remembered search and sort, and readiness filters. Each spacious row places the Thread question and direct progress beside the exact next lesson, known duration, and one primary action. Current material gaps open that lesson; future gaps open the filtered curriculum. A quiet disclosure owns priority and pause/resume. Rows reveal in batches of 24.
- **Persistent spine:** A typed Thread route removes the global Learn mode switcher and begins at the working canvas's left edge with one breadcrumb back to Threads. The flat, border-bottom spine keeps a compact title and question beside direct lesson progress, exact current Level/lesson, and the command center's only primary next-action link. Pause/activate is a quiet top-line action rather than another panel control.
- **Task-language sections:** Stable query keys retain compatibility while visible labels read Now, Lessons, Projects, and Resources. Desktop uses one quiet underlined text row with no descriptions or segmented container; narrow containers preserve a visible 2×2, 44px-minimum control.
- **Now:** A paper-like purpose sheet presents the editable intended outcome and current Level/lesson objective. Below it, the linked Level journey shares space with a notebook of recent scope-owned notes and an optional editable synthesis. Completed Threads open the closing reflection. On narrow canvases these sections stack. The single next action remains in the spine.
- **Lessons:** Every Level summary remains on one continuous hairline axis, with exactly one Level expanded. Search returns a bounded lesson index; `filter=needs_material` links directly to gaps. Every Level entry point returns through `tab=curriculum&level=<id>`. The selected Level is passed to authoring, which opens automatically for an empty curriculum or Level. Lesson creation accepts optional study text and a known time estimate. Standalone typed Level links remain recovery surfaces.
- **Projects:** The same one-open-Level axis leads with current application and leaves future projects as previews. Projects and final synthesis are optional practice and never progression gates.
- **Resources:** Thread, Level, and Lesson owners share one faceted vertical index. Exactly one owner opens at a time, long note bodies become bounded excerpts, and large owner/item sets reveal incrementally. Navigable item titles carry navigation without duplicate owner-workspace actions; direct material creation remains explicit progressive disclosure.
- **Material organizer:** Resources begins with search over existing branch-owned Library sources and shows every current Thread, Level, and Lesson placement. The learner chooses an exact Level or Lesson, role, expected contribution, and position before Attach; attached rows expose edit/reorder and remove without turning the source into a duplicate or a Queue item. Current Thread and current Level offline packs sit with their owning material indexes.
- **Find material:** An empty incomplete lesson in the current Level may show one explicit Find material action. Pending/running/retry, ready, abstained, and failed states remain in that lesson. A ready result is a reviewable external-source pick with title, creator, expected contribution, branch, and URL; it never looks attached, queued, started, or completed until the learner takes the separate canonical action. Abstention is first-class and shows its reason.
- **Lesson sequence:** One breadcrumb and one compact metadata row establish place, duration, and truthful readiness; a locked Level reads Locked rather than Ready to study. Authored lesson text and primary reading materials precede the action bar, which renders only when previous/next navigation or a valid complete/reopen action exists. There is no manual Level-start gate: direct completion activates an available Level, starts the next unfinished lesson, and activates the next Level plus its first lesson after a Level's final completion. The dashboard refreshes to the same canonical next turn. Successful completion opens the next ordered Thread lesson when one remains; reopening and final-Thread completion stay on the current page. A searchable course navigator keeps all Levels and the current lesson available beside the study canvas; persistent Focus on lesson hides it, and compact screens keep it behind a closed All lessons control above the current lesson. Saved authored text uses the shared note block renderer for headings, emphasis, lists, quotations, safe links, and per-block Arabic direction; HTML remains inert text. The final lesson links back to the Thread for optional closing reflection. Study materials are a flat ledger with source identity on the left and compact, accessible icon-and-label actions for HTML, PDF, Original, and NotebookLM on the right. Every additional source remains preserved under one More materials disclosure, and notes/files/recall stay behind one final disclosure. Material icons retain complete purpose, availability, and metadata in their accessible labels and use tonal emphasis plus hairline seams, never nested cards or a multi-pixel side stripe.

### Source anchors and Recall repair

- **Anchor review:** A selected passage opens as one evidence object with source title, surrounding context, quote, locator, branch, and short checksum. The first action is Save source anchor; the interface states plainly that this does not create a note, Unit, or card. After saving, Create note, Create a Learning Unit, and Write a recall card are separate controls and forms. An unknown URL keeps the selected passage visible while directing the learner to capture it under a reviewed branch.
- **Retrieval:** Global Search groups active source anchors separately and shows source identity, quote/context, and locator rather than reducing evidence to a generated summary. Archived anchors disappear from navigation search while their historical record remains available by exact ID.
- **Due review:** One focused study stage shows due position, source and branch provenance, compact scheduling context, and a centered Arabic prompt before the answer is available. Reveal is a restrained primary action with a retrieval pause cue. The revealed answer stays in the same stage above four equal grading choices; narrow screens use a two-by-two view switcher and grading grid without horizontal overflow.
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

- **Shape:** Rounded rectangle using the 14px default control token; primary actions may use pill geometry.
- **Primary:** Solid Coral surface, black action text, pill geometry, and 8px 18px padding.
- **Secondary:** Control Surface background, a 1px Seam border, and Secondary text.
- **Hover / Focus:** Coral focus ring with a Canvas separation ring; subtle tonal background shift.

### Cards and ledger rows

- **Corner Style:** 18px default card radius; list rows inside a panel remain square to one another.
- **Background:** Surface or Canvas according to depth.
- **Border:** 1px solid Seam.
- **Internal Padding:** 14px 18px.

### Inputs and search fields

- **Style:** 1px Seam border, Control Surface background, and the 14px default control token.
- **Focus:** Coral border with a visible outer ring.

## Working rules

### Reading companions

Lite Visual companions teach through fluent Egyptian-Arabic prose, faithful quotations, and source-specific semantic structure. Definitions, examples, equations, and comparisons belong where they resolve the reader's difficulty. Long companions use compact contents links and stable anchors; tagged A4 PDFs retain heading bookmarks.

The canonical article contains the authored explanation. A duplicate source appendix is no longer mandatory. Preserve quotation punctuation, notation, and register. Comfortable Arabic typography, meaningful contrast, natural reflow, and sensible print styling guide authoring directly; the default has no separate editorial passes or exhaustive geometry/quality audit.

### Do

- **Do** maintain strict WCAG AA contrast (≥4.5:1 text, ≥3:1 large text) across all themes.
- **Do** ensure every interactive target on mobile and tablet is at least 44×44px.
- **Do** use semantic CSS tokens for all colors, radii, and typography scales.

### Don't

- **Don't** use multi-pixel colored side-tab borders (≥2px colored border-left/right) on cards or list items.
- **Don't** animate layout properties like `width`, `height`, `margin`, or `padding` that trigger layout recalculations.
- **Don't** add decorative chunky colored top-borders to rounded cards.

### Dedicated item pages

Item titles are ordinary links to their canonical detail route. Source and book details use a compact wrapping section bar with Overview, Files, Notes & passages, Recall, Connections, History, and Reflection; books add Chapters. The active section has a coral underline and retains a real URL for browser history and bookmarks. Item pages omit the parent workspace mode switcher, retain a clear return action, and keep their identity and verified branch visible. Sections show existing owned material, truthful empty states, and direct links to related objects. File rows separate their detail-page title from an explicit content-opening action. On phones, navigation wraps into touch-sized rows; surrounding controls remain independent of title links.
