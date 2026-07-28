# DESIGN.md — Taste Map Engine

## Anchors
Linear (rail, segmented views, density) · Raycast (⌘K palette) · cool teal restrained.

## Color
- OKLCH. Dark default. Light = true off-white chroma 0 (not cream).
- Dark bg: oklch(0.14 0.01 250). Surfaces +0.03L steps, hue 250.
- Accent: oklch(0.72 0.14 195) ≤10% of UI. Light accent: oklch(0.52 0.12 195).
- Semantic: active amber / consumed green / rejected red / aging amber — dots & badges only.
- Body text ≥4.5:1. Dark muted floor oklch(0.55+). Light muted floor oklch(0.50+).

## Typography
- Inter + JetBrains Mono.
- Scale: 12 / 13 / 14 / 16 / 20 / 28. Display max 28px.
- Letter-spacing display ≥ -0.02em (never tighter than -0.04em).
- Section titles: sentence-case 13px/600. No default uppercase eyebrows.
- Data/ids/counts: mono.

## Spacing
4 / 8 / 12 / 16 / 24 / 32 / 48

## Radius
6 controls · 10 cards · 12 sheets. Chips/FAB may pill. Nothing ≥16 on cards.

## Elevation
- L0 page · L1 surface 1px border no shadow · L2 popover border + shadow blur≤8 OR border alone.
- NEVER 1px border + blur≥16 on same element.

## Motion
ease-out-quart cubic-bezier(0.25,1,0.5,1) · 150–250ms · prefers-reduced-motion instant.

## Shell
- Sidebar rail icon+label ≥721px; bottom bar ≤720px.
- Active nav: accent-tint fill + weight — no side stripe (mobile: inset top shadow).
- Subnav: segmented control.
- Review: right sheet desktop / bottom sheet mobile.
- Loading: skeletons. Empty: one line + one action.

## Banned
Side-stripe · gradient text · cream body · warm amber brand · uppercase section eyebrows everywhere · border+wide shadow · radius≥16 cards · hover-only actions ≤1024px · spinners in content.
