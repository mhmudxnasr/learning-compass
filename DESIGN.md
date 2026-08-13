# Scholar’s Instrument — Learning Compass Design System

## Register

Living Learning Room: an expressive, calm, single-environment learning space. It is neither a standard light theme nor a standard dark theme. The interface uses a chromatic lilac atmosphere, warm vermilion actions, citrus activity signals, and deep plum anchors. Product information stays clear, but the surface should feel memorable before it feels administrative.

## Tokens

- One atmosphere only: lilac ambient field, pale lavender work surfaces, deep plum text, vermilion for committed actions, citrus for activity, and iris for navigation/wayfinding. Theme switching never changes this visual world.
- Semantic color remains meaningful: green for a healthy/secured state, amber for attention, red for destructive consequences.
- UI/body: IBM Plex Sans + IBM Plex Sans Arabic. Reading: Literata + Arabic fallback. Data: IBM Plex Mono.
- Controls are tactile rounded objects; major surfaces use generous 18–30px corners and one deliberate offset shadow as a spatial cue, never as generic card elevation.
- Motion is near-static and continuity-based: a selected nav item changes state, a control lifts a few pixels on intent, and a panel remains spatially anchored. There are no page-load sequences or ambient loops; reduced motion is instant.

## Shell

There is no permanent sidebar. The floating horizontal ribbon names only six stable workspaces: Now, Curate, Learn, Map, Reflect, and You. It never presents individual tools as competing global destinations. Each workspace owns a local tool row: for example, Learn contains Paths, Library, Notes, Recall, and Changes; Map contains Atlas, Branches, and Balance. Search and Capture stay at the ribbon’s trailing edge. On phone, the redundant header destinations disappear; the dock carries Now, Curate, Learn, Map, and More, with Reflect and You in More. Local tool rows can be intentionally touch-scrolled, never silently removed.

## Content

Momentum begins with a compact honest activity pulse and one dominant focus desk for the current source. The active Thread sits beside it as a concise question/finish-line brief; evidence and closure controls stay collapsed until requested. Show at most two recent companion shortcuts and route the complete library to Files. Never repeat the active source in a Queue manifest or render a chapter-file dump on Momentum. Opening an original, HTML, PDF, artifact, or NotebookLM link from Momentum or Files is passive browsing and never starts a session; Queue and Compass own explicit starts. Source records show Thread roles, exact reflection, consolidation state, anchored Units, recall/application evidence, and files. Infrastructure job details remain hidden; user-facing states are waiting, consolidating, repair required, closed, or waived.

Queue is a bounded shelf of commitments, not a data table. Each source gets a tactile rank marker, one strong Start/Resume action, and secondary Record / Not for me choices before its supporting rationale on phone. The mobile dock must never cover the primary action; source detail remains immediately below it rather than being discarded.

Curate child views share the same decision-first grammar. Inbox leads with the waiting capture list and keeps RSS/Atom subscription operations in a secondary feed desk; Books leads with deliberate intake and then separates Inbox, Reading, and Finished shelves; Collections and Archive keep creation/filtering adjacent to the records they control. Administration is available, but never gets to occupy the first working column by accident.

Notes remain readable editorial documents, but their knowledge layer is a set of atomic anchored Learning Units. Atlas visualizes topic navigation and typed Unit relations; contradictory ratings are never presented as contradictory claims.

Learn child views also have distinct jobs. Library is a readable source index, Notes puts the document reader before metadata, and Recall puts one review action before card administration. Review drafts remain editable and reversible, but they do not compete with the current recall prompt in the first reading position.

Future HTML/PDF companions are RTL Arabic reading experiences in clear, relatively formal Egyptian Arabic. Keep technical vocabulary in English and explain its function naturally in the surrounding Arabic instead of displaying awkward literal translations. Difficulty controls explanation density: hard, unfamiliar, abstract, or mechanism-heavy sources earn concrete examples, stepwise demonstrations, counterexamples, and diagrams; familiar sources do not receive artificial scaffolding.

Momentum's primary source action follows the future companion's selected starting medium rather than always opening the original. Adaptive demonstrations may combine real-life examples, step-by-step mechanisms, visual diagrams, and comparisons/counterexamples when each materially helps that source.

Profile is the deliberate exception to list-heavy management views: lead with a compact model-health strip and bounded assertion matrix showing category, source, confidence, status, and version. Every assertion is editable or deactivatable; revision history exposes Undo. Represent structured values as readable text/tags, not database rows. Keep compatibility-field editing behind an advanced action.

Compass feedback must visually separate “Not now” from “Bad fit.” Not now is one neutral action. Bad fit opens compact reason chips; never label the neutral action “Not for me.” Insights → Hermes separates utility-labeled outcomes, explicit fit labels, and administrative exclusions, and shows shadow rollout gates plus reversible self-improvement receipts.

Settings → System uses a restrained cloud-console layout: compact service status, the exact active schedule, explicitly on-demand workflows, storage ownership, safety boundaries, and searchable operation rows. It is a descriptive control plane, not a raw mutation console; secrets and infrastructure-only controls never render.

Map, Reflect, and You keep the same task-first grammar at a different scale. Atlas gets a spatial canvas with controls that recede into the map; Branches opens as an evidence-led decision desk with a selected inspector, not an empty card game; Balance puts attention and retention signals next to the map rows they explain. Reflect separates overview, taste, Hermes quality, and memory review into readable sections. You treats Preferences as grouped choices, Data as ownership/synchronization, and System as an observable control plane with guarded operations.

## Branch Deck

Branch Deck is a review desk, not a card game. A two-column list + inspector: the left side is a bounded decision queue (waiting-on-you rows with a one-line state, round, category, and evidence count, then a decided section), and the right is a sticky inspector showing the selected branch's description, topics, contrast boundary, and real evidence (mapped sources, units, attention share, SRS load, recall) before an explicit action pad. Every row carries live evidence from the map; nothing is a guess. Actions are labeled buttons (Keep / Prune / Promote / Hold), not gestures; Undo is always available and reverses the system side effects, not just the row. Surprise suggestions arrive as reviewable candidate rows from a grounded server endpoint and write nothing until Add. A compact profile-effect strip shows what changed on the map and Compass.

## Learning Hub

Learning Hub is a curriculum map, not a dashboard. Opening a Thread removes the generic Learn header and sibling tabs so the path becomes a true Focus Study Room: one next required evidence action, a compact proof ledger, and quiet disclosed materials for the objective, finish line, and linked sources. Each proof row has one action; empty libraries do not render. Evidence is the only progress signal; source consumption never advances a level. Paused paths and new-path creation remain on the Hub overview, while notes, files, full source rows, and authoring stay progressively disclosed. On smaller screens the current next action remains thumb-reachable.

## Atlas

Atlas is the immersive exception to compact management layouts. Its default state shows only major R1 branches as freely navigable organic constellations. Deeper rounds expand on demand, unrelated nodes fade during focus, and subtle low-chroma cluster colors aid orientation in the shared room. Search, zoom, overview, and selection inspection remain visible alternatives to gestures.

## Bans

No sidebar-based app shell, generic white/gray SaaS dashboard, standard light/dark theme split, repeated card grids, metric-ring hero blocks, infinite motion, emoji UI, or unrelated fallback views.
