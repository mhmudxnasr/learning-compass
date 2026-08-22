# Learning Compass

Learning Compass is Mahmood’s private learning operating system. D1 is canonical; R2 stores large artifacts; Obsidian is an archive/export copy for extracted notes only.

## Core loop

Define a question, decision, build, or capability as a Learning Thread → attach deliberate sources → consume at the real source → preserve reflection → optionally consolidate notes/recall → complete lessons directly → resurface the next useful work.

Sources are inputs. Notes are readable projections. Ratings train taste, but enjoyment does not change Thread progress. Lessons, Levels, and Threads advance only through direct lesson completion.

Every capture—including URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom input—becomes a `captured` record in Library → All sources. Queue is a separate explicit commitment and normally holds at most five queued or in-progress items; exceeding that limit requires an explicit triage override.

## Navigation contract

The browser is the **Botanical Folio / Evidence Ledger**: one green-and-cream evidence studio with five stable root destinations, 12 grouped modes, and subordinate focus filters. The global route roots are:

- `#/home` — Home / Today
- `#/library` — Queue, RSS Feeds, All sources, Files, Reading journal, Collections, Archive
- `#/learn` — Threads, one Books room, Notes, Recall
- `#/map` — Atlas, Branches, Balance
- `#/settings` — Learning profile, Preferences, Data & recovery, System

The five roots plus their grouped modes and focus filters are the complete global navigation contract. Sources, Learning Threads, Books, Notes, Units, Recall Cards, branches, and artifacts use typed object routes inside their owning root so selection identity is preserved. Book dossiers are owned by Learn → Books; legacy Library, Shelf, and Canon-focus links recover to that one workspace without discarding an ID. Search opens the exact object result. An unknown hash renders a recovery state.

Branches is the personal top-layer manager, not a swipe game or a dump of every graph node. It lists broad durable subjects under live category nodes, while nested branches and leaves remain topics. The user can create and edit branch scope, prioritize, pause, archive, restore, and undo without losing linked sources, notes, recall, files, or topic structure.

On desktop the studio is a persistent root rail plus a working canvas and optional object inspector. Search, Capture to Library, and sync state live in that rail without becoming destinations. There is no permanent context pane. On mobile and tablet the rail becomes a five-item bottom dock with separate global Search and Capture utilities, primary modes in an equal-width visible grid, and subordinate filters as compact wrapping controls; the inspector becomes a full-height sheet or pushed detail view.

On Android this same mobile client is installable as the canonical app: standalone window, launcher icon, Capture/Queue/Recall shortcuts, share-to-Library, push, safe-area layout, and an offline application shell. Installation is an explicit, dismissible user choice. A future Play Store build wraps the same origin as a verified Trusted Web Activity rather than duplicating the product in a generic WebView.

## Product behavior

- Queue owns explicit start, resume, return, and completion. Opening a source or companion is passive; an explicit session may target either the original source or a verified canonical companion.
- Completion records a separate `retain`, `apply`, `reference`, or `drop` disposition. Retain/apply creates anchored extraction and editable recall work regardless of enjoyment score.
- Notes are source-centric, structured, editable, searchable, and direction-aware. One proportional source synthesis, Mahmood's separate reflection, anchored retained ideas, and recall state read as one dossier. Handwritten PDF annotations remain personal reflection while printed source text remains source material.
- Explicit retain/apply consolidation creates zero to four high-value, source-anchored Unit-linked drafts. Rating and free-text paste never generate cards. Approval is required before cards enter Review; approved cards use the versioned FSRS implementation and failed reviews never advance mastery.
- Feedback distinguishes neutral Not now, explicit Bad fit with a reason, rating, disposition, and later utility/recall/application signals. Feedback processing never requests another recommendation automatically.
- Recommendations are Thread-first and source-grounded. Compass can use fit, bridge, and challenge lanes; shadow serving remains gated by evidence quality. Mastered and consumed items, Mahmood’s explicit exclusions, and the five-item Queue contract are always enforced.
- Books is one continuous Learn mode with a reading desk, searchable My books ledger, and integrated Canon fields; there is no subordinate Shelf/Canon switch. Queue alone owns tracked Start/Resume sessions, while original, dossier, and companion links remain passive. Canon is the evergreen browse-first exception to finite Threads: it separates complete **Ready to explore** trios from non-actionable **Coming next** coverage. Every domain carries a verified branch, boundary, curation state, and field-test state; every selection carries a full dossier, sources, and strongest rejected alternative. Surprise discovery selects only complete trios. Explicit branch-preserving capture adds a Canon selection to My books as the same book identity with Canon domain/role metadata, and a domain can create a finite Thread only after its approved trio is complete and at least one selected book is captured. A typed book dossier is the authoritative home for metadata, branch/round, Canon placement, chapter progress and companions, notes, evidence anchors, recall, Threads, session history, files, and structured feedback.
- Thread levels report direct lesson progress. Projects, notes, sources, ratings, and recall remain useful context but never gate or advance a Level or Thread.
- Lesson readiness is explicit. A lesson is Ready, In progress, Completed, or Needs material; authored lesson content or a verified linked source is required before the interface enables completion. Lesson context (`why_learn`, `why_now`, and `takeaway`) is part of the reading surface, while notes, files, and recall remain owned by the parent Level.
- Library → Reading journal securely syncs KOReader-originated books, highlights, and notes already sent to Hardcover. It defaults to books with at least one journal entry; All books restores the full synced library. The journal screen is read-only apart from explicit synchronization.
- Invisible AI may enrich, rank, classify, and explain, but it never rewrites user-authored reflection. Hermes changes to typed profile knowledge are auditable, confidence-aware, reversible, and never scheduled as autonomous curation.
- Preferences begin with complete workspace styles and plain-language comfort controls, while theme, font, detailed typography, custom-system, and Map tuning use progressive disclosure. Theme, typography, density, corner, and reduced-motion preferences alter the whole studio, preserve usable contrast and focus, and persist across reloads. A server-saved custom palette is authoritative when custom appearance is active.

## Reading companions and ownership

Lite Visual creates one complete Arabic semantic HTML reading companion and prints that exact file to A4 PDF; books receive one pair per chapter with stable metadata. A single source router uses the fastest complete adapter, records observed timing/method/warnings, and makes repeated work a hash-verified cache hit; it blocks snippets, truncated paywalls, incomplete page/spine coverage, and shallow transcripts. Each artifact is designed fresh from the source after Intent and Frontend Design reasoning. It uses no reusable template, stored palette, preset theme/layout, mind map, raster/generated image, external image agent, script, quiz, widget, or mandatory pause. Prose, native HTML structures, equations, and rare justified inline SVG carry the explanation. A receipt-bound `source.txt`, gapless source-scope partition, evidence-bearing checkpoints, deterministic RTL/accessibility/responsive/200%-text/all-page A4/parity checks, and atomic publication prevent silent omissions and partial pairs. The source record exposes HTML as primary and PDF as the secondary offline format. No subjective QA score or automatic Notes Extractor chain exists.

Real source URLs remain recommendations; owned PDFs, HTML, transcripts, and generated companions remain artifacts. A Lesson shows one recommended/start-here material and purpose-labelled alternatives instead of equal file badges. HTML/PDF must resolve to the newest complete pair, never a mixed revision. NotebookLM shows linked, indexed, generating, ready, or failed only from recorded provider truth. Inside an explicit source-learning or companion request, Hermes chooses the smallest non-redundant media set and starting medium. This never runs as background generation.

`/updates/learning-materials` is the public, plain-language release folio for this material workflow. It explains the Original/HTML/PDF/NotebookLM roles and links into Learn without becoming a sixth root destination or exposing private Thread data.

The visual system is documented in [DESIGN.md](DESIGN.md). Product behavior, API compatibility, D1/R2 ownership, and learning rules remain unchanged by the frontend replacement.
