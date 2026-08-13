# Learning Compass — Evidence Ledger

Approved comp: `.impeccable/mocks/evidence-ledger-botanical-folio.png`

## Direction

The whole app is one private evidence studio. A cypress root rail anchors navigation; a vellum ledger owns saved views and object rows; the center is the only true working canvas; the inspector discloses properties and lifecycle actions for the selected object. Home uses the calmer Evidence Desk composition. Thread detail uses the vertical sequence from Thread First. Neither becomes a dashboard.

## Fidelity inventory

| Commitment | Implementation medium | Rule |
|---|---|---|
| Five root destinations | Semantic nav + inline SVG | Home, Library, Learn, Map, Settings; no sixth root |
| Four-pane desktop topology | CSS grid | 68px rail, 248px ledger, flexible canvas, 304px inspector |
| Botanical Folio material | CSS custom properties | Cream/ivory planes, cypress rail, graphite seams; no texture image |
| Joined ledger line | CSS borders and selected-row pseudo element | Selection visually crosses ledger/canvas boundary |
| Dense object rows | Semantic buttons/links | 52–64px rows, metadata inline, no equal-card grid |
| Typography | IBM Plex Sans/Arabic, Literata, Plex Mono | Serif only for reading/reflection; mono only for measurements |
| Object semantics | Color + icon + text | Sage source, ochre note/due, cobalt path/map; never color alone |
| Global capture/search | Dialogs with real API calls | Keyboard reachable; capture preserves offline transport |
| Inspector | Semantic aside | Conditional on selection; properties, links, lifecycle actions |
| Mobile topology | CSS breakpoint + bottom dock/sheet | One pane at a time; inspector becomes sheet |
| Map | Existing Cytoscape model | Rehoused in the studio canvas; no raster flattening |
| Motion | CSS transitions | One pane/selection continuity motion; reduced-motion fallback |

## Tokens

- Rail `#16281f`; shell `#f4f1eb`; ledger `#faf8f3`; canvas `#fffdf8`; inspector `#f7f5ee`.
- Ink `#1c211d`; secondary `#525b54`; muted `#707a72`; seam `#e2ddd2`.
- Cypress `#244f3b`; lichen `#e8f0ea`; focus `#2f634b`; due `#a85f18`; danger `#a8382b`; map `#315f7b`.
- Main columns have zero radius. Controls 6–8px. Structural panels 10px. Shadows only on floating surfaces.

## Translation notes

The approved mock is a hierarchy and density north star, not literal content. Do not rasterize its text, copy its generated logo, hard-code its sample dates, or reproduce its decorative compass mark. Responsive behavior, focus order, empty/error/loading states, and actual API truth are implementation-owned.
