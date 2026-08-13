# Botanical Folio — Learning Compass Design System

## Register

Learning Compass is a **Botanical Folio / Evidence Ledger**: a green-and-cream evidence studio for one learner. The material is quiet and editorial, but the interface is operationally dense where evidence, sources, and decisions require it. The center canvas is the place where work happens; surrounding planes provide orientation and context.

## Tokens

- Rail: `#16281f`; shell: `#f4f1eb`; ledger: `#faf8f3`; canvas: `#fffdf8`; inspector: `#f7f5ee`.
- Ink: `#1c211d`; secondary: `#525b54`; muted: `#707a72`; seams: `#e2ddd2`.
- Cypress: `#244f3b`; lichen: `#e8f0ea`; focus: `#2f634b`; due: `#a85f18`; danger: `#a8382b`; map: `#315f7b`.
- UI/body: IBM Plex Sans and IBM Plex Sans Arabic. Long-form reading and reflection use Literata with an Arabic fallback. Measurements use IBM Plex Mono.
- Controls use 6–8px radii; structural panels use 10px radii; major layout seams remain square. Shadows are reserved for floating dialogs, menus, and dragged objects.
- Color is paired with icon and text. Sage identifies sources, ochre identifies notes and due work, and cobalt identifies paths/map objects; color is never the only state signal.

## Shell

Desktop uses a persistent root rail, a flexible working canvas, and an optional contextual inspector when an object is selected. The rail contains Capture, Search, the five roots, and sync state. There is no permanent context pane; grouped modes and focus filters are local canvas controls. The inspector exposes properties, relationships, provenance, files, history, and lifecycle actions for the selected object.

The five root destinations are Home, Library, Learn, Map, and Settings. Their 11 grouped modes are Today; Triage, Catalog, Assets; Paths, Practice; Atlas, Review; and Personal, Data & sync, System. Queue, Inbox, All sources, Files, Books, Collections, Archive, Notes, Recall, Branches, Balance, Profile, and Preferences are subordinate focus filters or mode surfaces, not peer destinations.

On mobile and tablet, the root rail becomes a compact five-item bottom dock. Grouped modes and focus filters remain inline compact, horizontally scrollable controls. The inspector becomes a full-height sheet or pushed detail view with a stable Back path. The dock never obscures a primary action, and tablet layouts retain the canvas plus optional inspector where width allows.

## Content grammar

Home is an Evidence Desk: resume the active Thread/source, show one next evidence action, expose only actionable due work, and keep capture close. Library is one source ledger with Triage, Catalog, and Assets modes plus focus filters for Inbox, Queue, All sources, Files, Books, Collections, and Archive. Learn is the learning workspace: Paths and Practice modes use Notes and Recall focus filters. Map is the spatial knowledge workspace: Atlas and Review modes use Branches and Balance focus filters. Settings is a dedicated utility surface with Personal, Data & sync, and System modes.

Rows are dense, aligned, and object-shaped rather than equal card grids. An object header contains type, title, lifecycle state, primary action, and overflow. Selection is URL-restorable where deep linking matters. Empty, loading, partial, stale, error, offline, conflict, overflow, recovery, and destructive-action states are purposeful and use the same ledger grammar.

Queue is a bounded commitment shelf. Each source gets a rank, rationale, one explicit Start/Resume action, and separate Record, Not now, and Bad fit paths. Notes are editorial documents backed by atomic anchored Learning Units. Branch review shows real evidence before Keep, Prune, Promote, Hold, Add, or Undo. Contradictory ratings are evidence about taste, not contradictory claims in the map.

Source and companion links are passive. Only Queue or Compass starts a learning session. Internal job plumbing, prompt payloads, and infrastructure-only controls stay out of normal product surfaces. Settings → System is descriptive and guarded, with storage ownership, schedules, service health, and safety boundaries visible without exposing secrets.

## Typography, motion, and access

Use alignment, type hierarchy, seams, and whitespace to organize dense information. Motion communicates continuity—pane opening, selection, reordering, and object focus—not ambience or page-load choreography. Reduced motion removes transitions. Keyboard navigation, visible focus, semantic landmarks, strong contrast, thumb-reachable actions, and mixed-direction English/Egyptian-Arabic note blocks are first-class requirements.

The graph remains a real, lazy-loaded Cytoscape canvas with search, filtering, touch navigation, list alternatives, and a responsive inspector. It must not be flattened into a decorative image.

## Boundaries

- Keep the five-destination route model, 11 grouped modes, and subordinate focus-filter contract; do not reintroduce feature sprawl as peer destinations.
- Keep the persistent desktop rail, canvas, optional inspector, and mobile five-item dock/sheet adaptation consistent across roots.
- Do not turn the product into a generic white/gray SaaS dashboard, a repeated card wall, or a metric-ring hero.
- Do not use decorative motion, emoji UI, rasterized mockup text, generated-logo artwork, or infrastructure-only fallback screens.
- Preserve the learning loop, source/session distinction, evidence-derived mastery, reversible feedback, D1/R2 ownership, and all API compatibility.
