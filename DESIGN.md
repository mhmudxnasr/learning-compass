---
name: Botanical Folio
description: Evidence Ledger and calm botanical study studio for Learning Compass
colors:
  rail-bg: "#16281f"
  shell-bg: "#f1e9d9"
  ledger-bg: "#faf8f3"
  canvas-bg: "#fffdf8"
  inspector-bg: "#f7f5ee"
  ink: "#1c211d"
  secondary: "#525b54"
  muted: "#707a72"
  seams: "#e2ddd2"
  cypress: "#244f3b"
  lichen: "#e8f0ea"
  focus: "#2f634b"
  due: "#a85f18"
  danger: "#a8382b"
  map: "#315f7b"
typography:
  display:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(24px, 3.5vw, 36px)"
    fontWeight: 650
    lineHeight: 1.2
  headline:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(18px, 2.5vw, 24px)"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "IBM Plex Sans, IBM Plex Sans Arabic, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  mono:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "6px"
  card: "8px"
  panel: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cypress}"
    textColor: "{colors.canvas-bg}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.ledger-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
---

# Design System: Botanical Folio

Resurfacing uses one quiet Memory Shelf card on Home with a canonical branch pill and explicit Star, Reviewed, Snooze, and Dismiss controls. Its source title and card body open the unified source dossier, while its branch, companion, and review controls keep their own destinations and actions. Note distillation stays inside the reader as progressive disclosure. Meaningful links show relation type, explanation, counterpart Unit, source anchor, and branch identity. Contradictions live under Learn → Practice; frontier states remain restrained Map signals rather than a new root destination.

## Overview

**Creative North Star: "The Evidence Sanctuary"**

Learning Compass is a quiet, editorial evidence ledger and botanical study studio for one learner. The material palette uses green-and-cream planes with high tactile contrast. The center canvas is where deep study, reading, and curriculum progression occur; surrounding planes provide stable context and orientation.

**Key Characteristics:**
- High informational density without cognitive clutter or decorative noise.
- Clean 1px hairline seams, deliberate typography hierarchy, and purposeful whitespace.
- Semantic day/night/custom color tokens ensuring accessible WCAG AA contrast (≥4.5:1 text, ≥3:1 large text).
- Strict elimination of AI tells: zero arbitrary side-tab border stripes, zero chunky card-top borders, zero layout-thrashing animations.

### Composition contract

- Desktop uses a 108px navigation-only root rail and a separate 64px workspace command bar. Root location, grouped modes, global search, and capture share that command plane instead of competing inside the rail or appearing as a detached second header.
- Ordinary workspaces use a centered canvas capped at 1280px. Atlas alone remains edge-to-edge because the graph is the work surface rather than content inside a page.
- Grouped modes live in the desktop command bar with one restrained active rule. Subordinate filters stay in the working field only where the active mode needs them; compact layouts return the modes to equal-width inline controls.
- Home is a master-detail workbench, not a card dashboard: current source and Queue share the decision row; Current rotation and incoming publications share the supporting row; seams define hierarchy without four floating boxes.
- Map Review preserves the branch index beside a readable dossier on normal laptops. Signals and decisions move beneath the dossier instead of forcing a cramped third permanent rail.
- Below 940px, the root rail becomes a branded sticky utility bar and five-item bottom dock. Root modes use equal-width grids sized to their actual count, including a single four-column Library row at phone widths.

## Colors

The Botanical Folio palette balances calm botanical greens and warm paper neutrals with precise semantic signals.

### Primary
- **Cypress** (#244f3b): Primary brand accent, active controls, committed paths, and major actions.
- **Lichen** (#e8f0ea): Soft botanical tint for active state backgrounds and highlighted ledger rows.

### Secondary
- **Map Blue** (#315f7b): Knowledge atlas, branch relationships, and structural field links.
- **Ochre / Due** (#a85f18): Notes, recall schedules, and actionable due work.

### Tertiary
- **Danger** (#a8382b): Destructive actions, warnings, and unrecoverable deletions.
- **Focus Green** (#2f634b): Keyboard focus rings and active progression indicators.

### Neutral
- **Deep Rail** (#16281f): Desktop navigation spine background.
- **Shell** (#f4f1eb): Outer studio background and utility surfaces.
- **Ledger** (#faf8f3): Secondary cards, lists, and inactive panel surfaces.
- **Canvas** (#fffdf8): Primary working reading surface and editorial sheets.
- **Seams** (#e2ddd2): 1px hairline structural borders and dividers.
- **Ink** (#1c211d): Primary readable foreground typography.
- **Secondary Ink** (#525b54): Secondary descriptions, metadata labels, and supporting copy.
- **Muted Ink** (#707a72): Tertiary timestamps, keyboard shortcuts, and disabled hints.

### Named Rules
**The Hairline Seam Rule.** Structure is defined by 1px hairline borders (`var(--studio-seam)`) and tonal plane shifts, never by heavy multi-pixel border stripes or decorative drop-shadow halos.

## Typography

**Display Font:** IBM Plex Sans (with -apple-system, BlinkMacSystemFont, Segoe UI, Roboto fallback)
**Body Font:** IBM Plex Sans and IBM Plex Sans Arabic
**Reading Font:** Literata (with Georgia, serif fallback)
**Mono Font:** IBM Plex Mono (SFMono-Regular, Menlo, Monaco fallback)

**Character:** Technical precision paired with editorial elegance. Clean modern grotesk for studio operations, classical literary serif for long-form reading, and monospaced figures for metrics and ledger IDs.

### Hierarchy
- **Display** (650 weight, clamp(24px, 3.5vw, 36px), 1.2 line-height): Workspace headers and major topic anchors.
- **Headline** (600 weight, clamp(18px, 2.5vw, 24px), 1.3 line-height): Section titles and dossier sheet headings.
- **Title** (600 weight, 16px, 1.4 line-height): Object titles, card headers, and lesson names.
- **Body** (400 weight, 14px, 1.6 line-height): General interface copy and property values; 65–75ch measure on reading surfaces.
- **Reading** (400 weight, 16px, 1.75 line-height): Source notes, extracted companions, and personal reflections.
- **Label** (500 weight, 12px, 0.04em letter-spacing): Metadata badges, timestamps, and status pills.
- **Mono** (500 weight, 12px, 1.4 line-height): Ledger IDs, byte counts, and revision hashes.

## Layout

Desktop uses a compact 120px labeled left rail, a flexible working canvas, and an optional contextual inspector. On mobile/tablet, the rail becomes a thumb-accessible 5-item bottom dock (44px min touch target), and the inspector transforms into a full-height sheet.

## Elevation & Depth

Surfaces rest flat at rest using subtle tonal layering between Canvas, Ledger, and Shell. Elevation is reserved strictly for floating dialogs, menus, and dragged objects.

### Shadow Vocabulary
- **Subtle Ledger** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05)`): Light card definition at rest.
- **Floating Overlay** (`box-shadow: 0 12px 32px rgba(22, 40, 31, 0.12)`): Modal dialogs, dropdown menus, and popovers.

## Shapes

- **Controls:** 6px radius (`var(--studio-radius-control)`).
- **Cards & Rows:** 8px radius (`var(--studio-radius-card)`).
- **Panels & Sheets:** 10px radius (`var(--studio-radius-panel)`).
- **Pills & Badges:** 999px radius.

## Components

### Map Review Branch Dossier
- **Composition:** A compact branch index, an editable central dossier, and a persistent signals-and-decision rail on desktop. Narrow screens preserve that order as index, decision rail, then dossier so consequential actions remain discoverable.
- **Decision controls:** Keep active, Make first priority, Pause branch, and Archive branch remain visible together. Active uses Cypress, priority uses Map Blue, pause stays neutral, and archive uses Danger without making destructive treatment dominant.
- **Signals:** Attention window, recent share, filed sources/notes/Units/recall, and priority alignment use live Worker projections. Signals explain decisions; they never become a separate Balance tab.
- **Structure:** Branch scope, topics, category, and boundary edit inline. The branch ledger remains in the same dossier and typed branch routes preserve selection.

### Atlas Interaction

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

### Learning Thread — Vertical Journey

- **Threads index:** The index answers “what can I continue?” before reporting aggregate progress. One compact summary, truthful In progress/Paused/Completed/All filters, search, and explicit Continue/Review/Open affordances lead into calm ledger rows; dashboard metric cards and overlapping Current Work/Active filters are absent.
- **Persistent spine:** A typed Thread route removes the global Learn mode switcher and begins at the working canvas's left edge with one breadcrumb back to Threads. The flat, border-bottom spine keeps a compact title and question beside direct lesson progress, exact current Level/lesson, and the command center's only primary next-action link. Pause/activate is a quiet top-line action rather than another panel control.
- **Task-language sections:** Stable query keys retain compatibility while visible labels read Now, Lessons, Projects, and Resources. Desktop uses one quiet underlined text row with no descriptions or segmented container; narrow containers preserve a visible 2×2, 44px-minimum control.
- **Now:** The next action and current position remain only in the spine. The Now view contains one inline resource count and the complete linked Level journey; duplicate position cards, explanatory introductions, and repeated progress tracks are absent.
- **Lessons:** Every Level summary remains on one continuous hairline axis, but exactly one Level is expanded. Search returns one bounded lesson index with incremental disclosure. Every Level entry point returns through `tab=curriculum&level=<id>` so browser navigation, breadcrumbs, refresh, sharing, and the Projects handoff preserve the exact place inside the Thread. Standalone typed Level links remain recovery surfaces, not the normal navigation path.
- **Projects:** The same one-open-Level axis leads with current application and leaves future projects as previews. Projects and final synthesis are optional practice and never progression gates.
- **Resources:** Thread, Level, and Lesson owners share one faceted vertical index. Exactly one owner opens at a time, long note bodies become bounded excerpts, and large owner/item sets reveal incrementally. Navigable item titles carry navigation without duplicate owner-workspace actions; direct material creation remains explicit progressive disclosure.
- **Lesson sequence:** One breadcrumb and one compact metadata row establish place, duration, and truthful readiness; a locked Level reads Locked rather than Ready to study. The near-header action bar renders only when previous/next navigation or a valid start/complete action exists. Progression explanations, Lesson purpose, and the authored-guide disclosure are absent from the Lesson route; curriculum context remains in the Thread's Lessons view. Study materials are a flat ledger with source identity on the left and only compact, accessible icon actions for HTML, PDF, Original, and NotebookLM on the right. Every additional source remains preserved under one More materials disclosure, and notes/files/recall stay behind one final disclosure. Material icons retain complete purpose, availability, and metadata in their accessible labels and use tonal emphasis plus hairline seams, never nested cards or a multi-pixel side stripe.

### Add Anything

- **Type first:** The global action opens one dialog with Source, Book, Movie, Series, Podcast, Course, Game, Album, and Other choices. Each choice has a short task-oriented hint; the selected choice uses Cypress and remains visible without opening another surface.
- **Fast core:** Personal entry asks first for title, contextual creator/author, status, and knowledge branch. Link, release year, duration, progress, rating, tags, and note sit under one native More details disclosure. Source entry preserves link/text/file capture and the same required branch selector.
- **State honesty:** Saving a personal record confirms that it entered the Data Studio, not Queue. Errors preserve input; successful saves refresh the active workspace and reset the next dialog to Source.
- **Responsive overlay:** Desktop uses a wide but bounded editorial sheet with a sticky action footer. Type choices and fields collapse to one column on narrow screens without horizontal scrolling, and every choice/control remains keyboard reachable.

### Personal Data Studio

- **Summary before rows:** Four exact counts lead: tracked, in progress, finished, and rated. Type and state use clickable proportional bars, six-month activity uses a compact column plot, and branch context uses ranked counts. These visuals use canonical API counts and never invent a composite score.
- **Editable ledger:** Search covers title, creator, tags, and note; type/state bars and selectors share the same filters. Rows expose identity, explicit status, real progress, direct rating, branch, and update time. One expanded row reveals every mutable field while media type and canonical record identity remain fixed.
- **Lineage and portability:** A successful edit names the record and states that lineage was saved. JSON and Markdown exports retain personal type/state/progress/rating/tags/note plus source history; full-system recovery remains a separate D1+R2 contract.
- **Responsive table:** Desktop keeps aligned ledger columns. Narrow screens hide the visual header, stack labeled cells, preserve 44px actions, and never require sideways scrolling; accessible cell labels retain the removed visual context.

### Buttons
- **Shape:** Rounded rectangle (6px radius).
- **Primary:** Cypress background (#244f3b), Canvas ink (#fffdf8), 8px 16px padding.
- **Secondary:** Ledger background (#faf8f3), Seam border (1px), Ink text (#1c211d).
- **Hover / Focus:** 1.5px Focus ring (#2f634b) with 2px offset; subtle tonal background shift.

### Cards & Ledger Rows
- **Corner Style:** 8px radius.
- **Background:** Ledger or Canvas depending on depth hierarchy.
- **Border:** 1px solid Seams (#e2ddd2).
- **Internal Padding:** 14px 18px.

### Inputs & Search Fields
- **Style:** 1px Seam border, Canvas background, 6px radius.
- **Focus:** 1.5px Cypress border with subtle outer ring.

## Do's and Don'ts

### Do:
- **Do** maintain strict WCAG AA contrast (≥4.5:1 text, ≥3:1 large text) across all themes.
- **Do** ensure every interactive target on mobile and tablet is at least 44×44px.
- **Do** use semantic CSS tokens for all colors, radii, and typography scales.

### Don't:
- **Don't** use multi-pixel colored side-tab borders (≥2px colored border-left/right) on cards or list items.
- **Don't** animate layout properties like `width`, `height`, `margin`, or `padding` that trigger layout recalculations.
- **Don't** add decorative chunky colored top-borders to rounded cards.
