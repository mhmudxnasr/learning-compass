# DESIGN.md — Taste Map Engine

## Color
- OKLCH everywhere. Dark default, true off-white light mode (chroma ~0, NOT cream).
- Dark: `--bg` oklch(0.14 0.01 250), surfaces stepped +0.03L each level.
- Accent: teal `oklch(0.72 0.14 195)`. Used ≤10% of surface (Restrained strategy).
- Semantic: active=amber oklch(0.78 0.15 85), consumed=green oklch(0.72 0.14 160), rejected=red oklch(0.65 0.19 25). Used as dots/badges/tints, never page backgrounds.
- Body text ≥4.5:1. Muted text never below oklch(0.68).

## Typography
- Inter (UI) + JetBrains Mono (data/ids). Google Fonts.
- Scale: 12 / 13 / 14 / 16 / 20 / 28. Display max 28px — this is a tool, not a hero page.
- Display letter-spacing ≥ -0.02em. `text-wrap: balance` on h1/h2.
- Data (counts, dates, ids): JetBrains Mono.

## Spacing
4 / 8 / 12 / 16 / 24 / 32 / 48.

## Radius
6px controls, 10px cards, 12px sheets/modals. No pills except chips/tags. Nothing ≥16px.

## Elevation
- Level 0: page. Level 1: surface card (1px border, no shadow). Level 2: popover/sheet (border OR 8px shadow, never both).
- BANNED: 1px border + wide drop shadow on same element.

## Banned patterns (from audit of v1)
- Side-stripe borders (`border-left: 3px solid X`) → replace with status dot or tinted bg.
- Gradient text, gradient "glow" card borders → solid colors.
- Tiny uppercase tracked eyebrows above every section → section titles are sentence-case, 13px 600.
- Numbered section markers.
- Identical card grids for dissimilar content.

## Motion
- ease-out-quart `cubic-bezier(0.25,1,0.5,1)`. 150–250ms.
- Workspace switch: crossfade (View Transitions API, fallback instant).
- Sheets: slide from right (desktop) / bottom (mobile).
- Stagger card entrances ≤40ms apart, fade+translateY(6px).
- `prefers-reduced-motion`: all animation → instant.

## Interaction
- No hover-only affordances (tablet!). Row actions always visible at ≤1024px.
- Review flow: slide-over sheet, not modal. Context stays visible.
- Destructive actions: two-step (confirm inline, no window.confirm).
- Empty states: one line + one action button. Never a bare "no data".
- Loading: skeleton shimmer, no spinners.

## Components
Sidebar (64px collapsed, icon+label rail) · SegmentedControl (sub-nav) · QueueCard · ArchiveRow · StatusDot · RatingPicker (love/like/meh/dislike) · Sheet (right/bottom) · Modal (center, small) · Toast (bottom-right) · Chip · StatBlock · BarRow · HeatmapCell · CanvasStage (pan/zoom) · VaultRow (HTML+PDF pair).
