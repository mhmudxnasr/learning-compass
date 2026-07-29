# Atlas Cluster Canvas Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the overlapping ring diagram with a production-ready spatial canvas optimized for discovering and exploring knowledge clusters on desktop and mobile.

**Architecture:** Keep `GET /knowledge/graph` as the canonical read contract. Move Atlas into a lazy-loaded Preact feature and render the graph with Cytoscape.js so 1,500 nodes can pan, zoom, select, focus, and relayout without inflating the base bundle. Derive clusters client-side from `super_category`, hierarchy edges, and node types; preserve the Scholar’s Instrument visual language.

**Tech Stack:** Preact, TypeScript, Cytoscape.js canvas renderer, Vite dynamic imports, Playwright E2E, Node test runner.

---

## Confirmed Design Brief

- **Primary action:** Explore clusters, then progressively focus into branches, leaves, and their evidence-backed connections.
- **Surface:** A restrained, immersive research canvas—not a dashboard card.
- **Scene:** Mahmood explores the Atlas on a desktop in focused study, then revisits the same topology by touch on mobile.
- **Visual anchors:** Figma’s spatial navigation, Obsidian Graph’s direct manipulation, and Linear’s compact control language.
- **Color:** Neutral Scholar’s Instrument canvas; muted ink-blue indicates selection and hierarchy. Other semantic colors identify clusters only when needed and must remain theme-safe.
- **Scope:** Production-ready redesign of the complete Atlas experience on desktop and mobile.

## Experience Model

1. Open on a stable, fitted overview with separated domain clusters and readable high-level labels.
2. Hover or tap a cluster to reveal its boundary, node count, and strongest cross-cluster links.
3. Click or tap a node to dim unrelated content, emphasize its one-hop neighborhood, and open the inspector.
4. Double-click/double-tap a cluster or node to fit its neighborhood in the viewport.
5. Search by node label, filter node/edge types, reset the view, or rerun the layout from a compact canvas toolbar.
6. Preserve the current viewport and filters during the session; provide an explicit “Overview” action.

## Required States

- Loading: canvas-shaped skeleton with toolbar placeholders.
- Ready overview: all nodes rendered, cluster labels prioritized, leaf labels suppressed until zoomed.
- Hover/focus: highlighted node or cluster with unrelated edges reduced.
- Selected: accessible inspector with metadata and connected-node list.
- Search: ranked matches; selecting a result animates/fits the node.
- Filtered: visible active-filter summary and one-action reset.
- Empty: explain that captured/processed knowledge will form the Atlas.
- Error: retain the existing recoverable error language and add Retry.
- Isolated node: selection works and inspector states “No recorded connections.”
- Reduced motion: viewport changes occur instantly.

---

### Task 1: Add the lazy graph dependency boundary

**Objective:** Keep Cytoscape and Atlas-only code out of the ≤150 KB gzip base client bundle.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `client/src/app.tsx`
- Create: `client/src/features/atlas/AtlasPage.tsx`

**Steps:**

1. Add `cytoscape` plus its TypeScript definitions.
2. Replace the inline `AtlasPage` in `client/src/app.tsx` with `lazy(() => import('./features/atlas/AtlasPage'))`.
3. Wrap only the Atlas destination with a canvas-shaped `Suspense` fallback.
4. Export the feature as the default module and initially preserve the existing fetch/loading/error/empty behavior.
5. Run `npm run typecheck`; expect PASS.
6. Run `npm run build`; confirm Cytoscape is emitted as a lazy graph chunk and the base gzip bundle remains ≤150 KB.

### Task 2: Normalize the graph into a tested view model

**Objective:** Convert API records into deterministic nodes, edges, clusters, and lookup indexes without changing the API.

**Files:**
- Create: `client/src/features/atlas/model.ts`
- Create: `tests/unit/atlas-model.test.ts`

**Steps:**

1. Define `AtlasNode`, `AtlasEdge`, `AtlasCluster`, and `AtlasGraphModel`.
2. Parse `meta_json` defensively; malformed JSON must resolve to an empty object.
3. Derive each cluster using `super_category`, then the nearest category/root ancestor, then `Unassigned`.
4. Deduplicate edges by source, target, and relation type; discard dangling edges.
5. Build node, cluster, and adjacency maps for O(1) selection and neighborhood lookup.
6. Add tests for malformed metadata, missing parents, isolated nodes, cross-cluster evidence, duplicate edges, and 1,500-node input.
7. Run `node --test tests/unit/atlas-model.test.ts`; expect PASS.

### Task 3: Implement the spatial canvas and cluster layout

**Objective:** Render the complete dataset as separated, navigable clusters with stable positions.

**Files:**
- Modify: `client/src/features/atlas/AtlasPage.tsx`
- Create: `client/src/features/atlas/AtlasCanvas.tsx`
- Create: `client/src/features/atlas/layout.ts`
- Create: `tests/unit/atlas-layout.test.ts`

**Steps:**

1. Create one Cytoscape instance per mounted canvas and destroy it on unmount.
2. Use a two-stage deterministic layout: position cluster anchors radially by cluster size, then run a constrained force layout inside each cluster.
3. Weight hierarchy edges more strongly than evidence edges so branches remain visually coherent.
4. Render roots/categories larger; render branches medium; render leaves as compact points until zoom reveals labels.
5. Style hierarchy as quiet solid rules and evidence as lower-opacity dashed rules.
6. Fit the complete graph after the first stable layout and cache positions in `sessionStorage` using a graph-content hash.
7. Add layout tests for deterministic output, finite coordinates, cluster separation, and cache invalidation.
8. Run `npm test`; expect PASS.

### Task 4: Add direct manipulation and viewport controls

**Objective:** Make exploration feel like a genuine spatial tool.

**Files:**
- Create: `client/src/features/atlas/AtlasToolbar.tsx`
- Modify: `client/src/features/atlas/AtlasCanvas.tsx`
- Modify: `client/src/features/atlas/AtlasPage.tsx`

**Steps:**

1. Enable wheel/pinch zoom, pointer/touch pan, node drag, and keyboard focus.
2. Add compact controls for zoom in, zoom out, overview, and relayout.
3. Add a visible zoom percentage and short first-use gesture hint that disappears after interaction.
4. Double activation fits a node’s one-hop neighborhood; cluster activation fits all members.
5. Keep minimum 44px touch targets without enlarging the graph marks.
6. Respect `prefers-reduced-motion` when fitting or centering.
7. Verify trackpad, mouse, keyboard, and touch behavior manually.

### Task 5: Add cluster-first search and filtering

**Objective:** Let the user move from overview to a relevant cluster without hunting through labels.

**Files:**
- Create: `client/src/features/atlas/AtlasSearch.tsx`
- Create: `client/src/features/atlas/AtlasFilters.tsx`
- Modify: `client/src/features/atlas/AtlasPage.tsx`
- Modify: `client/src/features/atlas/AtlasCanvas.tsx`

**Steps:**

1. Add local fuzzy-prefix search across node labels, types, and cluster names.
2. Group results by cluster and rank exact/prefix matches first.
3. Selecting a result reveals hidden ancestors, centers the node, selects it, and opens the inspector.
4. Add filters for cluster, node type, and connection type.
5. Keep filtered-out elements in the model but remove them from layout and hit testing.
6. Show an inline “No matching nodes” state with Reset filters.
7. Add Escape handling: close search first, then clear selection.

### Task 6: Build a useful selection inspector

**Objective:** Turn selection into understanding instead of only showing metadata.

**Files:**
- Create: `client/src/features/atlas/AtlasInspector.tsx`
- Modify: `client/src/features/atlas/AtlasPage.tsx`
- Modify: `client/src/features/atlas/AtlasCanvas.tsx`

**Steps:**

1. Show type, cluster/domain, status, round, direct connection count, and evidence count.
2. List connected nodes grouped into hierarchy and evidence connections.
3. Selecting a connected node updates the canvas focus without closing the inspector.
4. Add “Focus neighborhood” and “Back to cluster” actions.
5. Use a fixed side panel on wide screens and a draggable bottom sheet on mobile.
6. Move focus into the inspector only when opened from keyboard; return focus to the selected node on close.

### Task 7: Apply the Scholar’s Instrument visual system

**Objective:** Make Atlas immersive while remaining consistent with the rest of Learning Compass.

**Files:**
- Modify: `client/src/styles.css`
- Modify: `DESIGN.md`
- Modify: `PRODUCT.md`

**Steps:**

1. Replace the fixed 620px framed panel with an edge-to-edge canvas inside the content region; use a subtle neutral field and one structural border.
2. Give the canvas toolbar a compact instrument-panel treatment using existing tokens—no glass, gradients, wide shadows, or oversized radii.
3. Add a controlled cluster palette derived from existing OKLCH tokens; cluster color appears in marks and labels, not large decorative fills.
4. Define clear hover, focus, selected, disabled, loading, and dark-theme states.
5. Keep text contrast at WCAG AA and graph selection distinguishable without color alone.
6. Update design/product contracts to record cluster-first spatial exploration and the canvas interaction model.

### Task 8: Make the canvas responsive and resilient

**Objective:** Preserve exploration quality from desktop through phone layouts.

**Files:**
- Modify: `client/src/features/atlas/AtlasPage.tsx`
- Modify: `client/src/features/atlas/AtlasToolbar.tsx`
- Modify: `client/src/features/atlas/AtlasInspector.tsx`
- Modify: `client/src/styles.css`

**Steps:**

1. Desktop: use the available viewport below the page subnav and dock the inspector without shrinking below a usable canvas width.
2. Tablet: collapse filters into a popover and use an overlay inspector.
3. Mobile: use a full-width touch canvas, bottom control rail, and inspector sheet above the global navigation safe area.
4. Prevent browser page scrolling while performing a two-finger canvas gesture; preserve ordinary vertical scrolling outside the canvas.
5. Refit only when the container changes materially, not on every render.
6. Verify 360×800, 768×1024, 1280×800, and 1440×900.

### Task 9: Add interaction and regression coverage

**Objective:** Prove the redesign works and every Map destination remains distinct.

**Files:**
- Create: `tests/e2e/atlas.mjs`
- Modify: `tests/e2e/routes.mjs`
- Modify: `docs/architecture.md`
- Modify: `CURRENT_STATE.md`

**Steps:**

1. Test that all returned nodes are represented in the canvas model rather than truncating to 36.
2. Test search → result selection → centered node → inspector.
3. Test cluster focus, filter/reset, overview, and selected-neighborhood highlighting.
4. Test keyboard focus, Escape behavior, and inspector focus return.
5. Test the mobile bottom-sheet inspector and 44px controls.
6. Assert Atlas remains distinct from Branches, Domains, Connections, and Coverage.
7. Document the lazy graph boundary, client-derived clusters, layout cache, and renderer lifecycle.
8. Update `CURRENT_STATE.md` only after verification succeeds.

### Task 10: Final verification

**Objective:** Leave the repository in a verified, production-ready state without deployment.

**Steps:**

1. Run `npm test`; expect unit tests and typecheck to pass.
2. Run `npm run build`; expect success and base bundle ≤150 KB gzip excluding lazy graph/vendor chunks.
3. Run `npm run test:e2e`; expect all route and Atlas interaction tests to pass.
4. Run `git diff --check`; expect no whitespace errors.
5. Inspect light/dark screenshots at desktop, tablet, and mobile sizes.
6. Confirm no Vite, Wrangler, Workerd, or Playwright processes remain.
7. Do not deploy unless separately requested.

## Risks and Tradeoffs

- Cytoscape adds a large dependency; lazy loading and bundle assertions are mandatory.
- Force layouts can jump between sessions; deterministic seeds and position caching prevent disorientation.
- Rendering every label makes a 1,500-node graph illegible; semantic zoom must prioritize cluster/category labels, then reveal leaves.
- Canvas accessibility is limited; the searchable DOM controls and inspector must expose every node and relationship without requiring pointer interaction.
- Cluster derivation may expose inconsistent `super_category` data. Keep fallback grouping explicit and surface “Unassigned” rather than silently guessing.

## Open Design Decision

Choose the default cluster presentation before implementation:

- **Recommended — Constellations:** separated organic clusters with soft boundary contours, optimized for discovery.
- **Topographic:** structured domain regions with clearer hierarchy and less visual motion.
- **Minimal network:** no cluster boundaries; grouping comes only from spacing, labels, and color.
