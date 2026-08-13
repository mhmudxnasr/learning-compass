# Learning Compass

Learning Compass is Mahmood’s private learning operating system. D1 is canonical; R2 stores large artifacts; Obsidian is an archive/export copy for extracted notes only.

## Core loop

Define a question, decision, build, or capability as a Learning Thread → attach deliberate sources → consume at the real source → preserve reflection → consolidate anchored Learning Units → retrieve or apply them → satisfy the Thread evidence contract → verify the outcome → resurface the next useful work.

Sources are inputs. Notes are readable projections. Ratings train taste, but enjoyment is not mastery. Delayed retrieval, explanation, transfer, decisions, artifacts, or application results are the evidence of learning.

Every capture—including URL, text, PDF, HTML, video, Telegram, share-target, RSS, and Atom input—lands in the unlimited Inbox. The Queue normally holds at most five queued or in-progress items; exceeding that limit requires an explicit triage override.

## Navigation contract

The browser is the **Botanical Folio / Evidence Ledger**: one green-and-cream evidence studio with five stable root destinations, 11 grouped modes, and subordinate focus filters. The global route roots are:

- `#/home` — Home / Today
- `#/library` — Queue, Inbox, All sources, Files, Books, Collections, Archive
- `#/learn` — Paths, Notes, Recall
- `#/map` — Atlas, Branches, Balance
- `#/settings` — Profile, Preferences, Data & sync, System

The five roots plus their grouped modes and focus filters are the complete global navigation contract. Sources, Learning Threads, Notes, Units, Recall Cards, branches, and artifacts use typed object routes inside their owning root so selection identity is preserved. Search opens the exact object result. Legacy hashes canonicalize to the nearest purposeful view without silently discarding an ID; an unknown hash renders a recovery state.

On desktop the studio is a persistent root rail plus a working canvas and optional object inspector. There is no permanent context pane. On mobile and tablet the rail becomes a five-item bottom dock, with primary modes in an equal-width visible grid and subordinate filters as compact wrapping controls; the inspector becomes a full-height sheet or pushed detail view.

## Product behavior

- Queue owns explicit start, resume, return, and completion. Opening a source or companion is passive; consumption is tracked through a learning session at the real source.
- Completion records a separate `retain`, `apply`, `reference`, or `drop` disposition. Retain/apply creates anchored extraction and editable recall work regardless of enjoyment score.
- Notes are structured, editable, searchable, and support per-block English/Egyptian-Arabic direction. Handwritten PDF annotations count as personal reflection while printed source text remains source material.
- Ratings of 7–10 create editable SRS drafts. Approval is required before cards enter Review; approved cards use the versioned FSRS implementation and failed reviews never advance mastery.
- Feedback distinguishes neutral Not now, explicit Bad fit with a reason, rating, disposition, and later learning evidence. Feedback processing never requests another recommendation automatically.
- Recommendations are Thread-first and source-grounded. Compass can use fit, bridge, and challenge lanes; shadow serving remains gated by evidence quality. Mastered and consumed items, Mahmood’s explicit exclusions, and the five-item Queue contract are always enforced.
- Invisible AI may enrich, rank, classify, and explain, but it never rewrites user-authored reflection. Hermes changes to typed profile knowledge are auditable, confidence-aware, reversible, and never scheduled as autonomous curation.

## Reading companions and ownership

Lite Visual creates one linked HTML+PDF R2 pair for a normal source. For books, it creates one linked pair per chapter with stable chapter metadata, mines the complete source into a checksum-backed evidence packet and coverage matrix, reuses cached mining, runs Visual Mind first, and verifies the canonical source record. There is no Lite Visual QA gate and no automatic Notes Extractor chain. The PDF is the reading companion.

Real source URLs remain recommendations; owned PDFs, HTML, transcripts, and generated companions remain artifacts. Inside an explicit source-learning or companion request, Hermes chooses the smallest non-redundant media set and starting medium. This never runs as background generation.

The visual system is documented in [DESIGN.md](DESIGN.md). Product behavior, API compatibility, D1/R2 ownership, and learning rules remain unchanged by the frontend replacement.
