# Taste Map Rebrand Spec (Dumb-Model Execution Guide)

**Status:** CONFIRMED by user. Execute exactly. Do not redesign scope. Do not invent new features.  
**Scope:** Visual system + shell only. Keep view logic, APIs, data model, routes, workspace IA.  
**Craft bar:** Linear (chrome/density) + Raycast (palette/keyboard).  
**Color:** Cool teal restrained (DESIGN.md). Kill warm amber drift in live CSS.  
**Register:** Product UI (tool, not marketing).  
**Platform:** web (Cloudflare Worker + D1). Desktop-first; tablet ~1024px; phone bottom bar.

When finished, every checkbox in §14 must be true. If something is unclear, follow this doc’s defaults — do not ask the user unless a file path does not exist.

---

## 0. What you are doing (one sentence)

Replace the warm amber token system with cool teal Linear-style tokens, fix banned shell patterns (side-stripes, border+wide shadow, uppercase section eyebrows), align shell chrome to DESIGN.md, and leave queue/map/log/vault **business logic** untouched.

---

## 1. Files you may edit

| File | Role | How much to touch |
|------|------|-------------------|
| `src/assets/css.ts` | All CSS as a template string `cssBundle` | **Primary.** Tokens, shell, shared components, ban fixes |
| `src/shell.ts` | HTML shell template `htmlShell` | Theme meta, favicon, cache-bust `?v=`, optional ⌘K hint in header |
| `src/assets/js.ts` | Frontend app | **Minimal.** Only hardcoded warm-amber / old accent fallbacks that break canvas after token change |
| `src/index.ts` | Worker routes + PWA manifest | theme_color / background_color only if present |
| `DESIGN.md` | Visual system of record | Rewrite to match what you ship |
| `PRODUCT.md` | Product context | Fix `## Platform` to bare `web` |

### Files you must NOT rewrite

- `src/api/**` (except no API changes at all)
- Queue card HTML generation logic structure (class names may stay; CSS restyles them)
- Cytoscape graph layout algorithms
- Rating / review / sheet open/close logic
- Hash routing workspace model (`curate` / `map` / `log` / `vault`)

### Do not

- Add new workspaces or rename Curate/Map/Log/Vault
- Add marketing landing pages
- Switch fonts away from Inter + JetBrains Mono
- Introduce Tailwind, CSS modules, or a new build step
- Change package.json dependencies for design
- Touch `node_modules/`, `dist/` by hand (wrangler rebuilds)

---

## 2. Confirmed product decisions (do not reopen)

| Decision | Value |
|----------|--------|
| Anchors | Linear + Raycast |
| Scope | Visual system + shell only |
| Color | Cool teal restrained (DESIGN.md) |
| Nav IA | Keep: Curate, Map, Profile, Log, Vault |
| Type | Inter (UI) + JetBrains Mono (data) |
| Theme | Dark default + light mode via `data-theme` |
| Accent budget | ≤10% of surface (Restrained) |
| Display max | 28px (tool, not hero) |

---

## 3. Absolute bans (refuse and rewrite if you write these)

1. **Side-stripe borders** — any `border-left` / `::before` left bar ≥2px as accent on cards, nav, list rows.  
   - Current offenders: `.nav-btn.active::before`, `.qc-card::before` hover bar.
2. **Gradient text** — `background-clip: text` + gradient.
3. **1px border + wide drop shadow (blur ≥16px) on same element** — pick one.
4. **Warm cream/sand body bg** — light mode must be true off-white chroma ~0, hue toward 250 not 60–100.
5. **Warm amber as brand accent** — current live `--accent: oklch(0.80 0.135 65)` is WRONG. Replace.
6. **Uppercase tracked eyebrows on every section** — `h3` must be sentence-case, 13px weight 600, no `text-transform: uppercase` as default section title style.
7. **Numbered section markers** (01 / 02 / 03) as chrome.
8. **Radius ≥16px** on cards/sheets (chips/FAB pill ok).
9. **Hover-only row actions** at ≤1024px (must stay visible).
10. **Spinners in content** — skeletons only for page load.

---

## 4. Exact token replacement (copy-paste)

### 4.1 Dark theme — replace entire `:root { ... }` color block

In `src/assets/css.ts`, replace the current `:root` color tokens (everything from `--bg` through `--aging`, keep fonts/radii/z-index structure) with:

```css
:root {
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Cool blue-gray base, hue 250 */
  --bg: oklch(0.14 0.01 250);
  --surface: oklch(0.17 0.012 250);
  --surface-hov: oklch(0.20 0.012 250);
  --surface-1: oklch(0.19 0.012 250);
  --elevated: oklch(0.20 0.013 250);
  --overlay: oklch(0.23 0.014 250);
  --border: oklch(0.28 0.012 250);
  --border-strong: oklch(0.36 0.014 250);

  --ink: oklch(0.96 0.008 250);
  --ink-2: oklch(0.72 0.014 250);
  --ink-3: oklch(0.58 0.012 250);
  /* ink-3 floor for contrast: never lighter than ~0.55 on dark */

  --ink-2-bg: color-mix(in oklch, var(--ink-2) 14%, transparent);
  --rejected-bg: color-mix(in oklch, var(--rejected) 15%, transparent);
  --accent-bg: color-mix(in oklch, var(--accent) 15%, transparent);

  /* Teal accent — Restrained ≤10% */
  --accent: oklch(0.72 0.14 195);
  --accent-ink: oklch(0.16 0.02 250);
  --accent-tint: color-mix(in oklch, var(--accent) 16%, transparent);
  --accent-glow: color-mix(in oklch, var(--accent) 22%, transparent);

  /* Semantic status — dots/badges only, never page bg */
  --active: oklch(0.78 0.15 85);
  --consumed: oklch(0.72 0.14 160);
  --rejected: oklch(0.65 0.19 25);
  --aging: oklch(0.78 0.12 75);

  --r-ctl: 6px;
  --r-card: 10px;
  --r-sheet: 12px;

  --ease: cubic-bezier(0.25, 1, 0.5, 1);
  --dur: 150ms;

  --sidebar-w: 68px;
  --sheet-w: 480px;
  --content-w: 1080px;

  --z-sticky: 10;
  --z-fab: 30;
  --z-batch: 35;
  --z-sheet: 40;
  --z-modal: 50;
  --z-toast: 60;
  --z-palette: 70;
}
```

### 4.2 Light theme — replace entire `[data-theme="light"] { ... }`

```css
[data-theme="light"] {
  --bg: oklch(0.99 0 0);
  --surface: oklch(0.97 0.004 250);
  --surface-hov: oklch(0.95 0.006 250);
  --surface-1: oklch(0.96 0.005 250);
  --elevated: oklch(0.95 0.006 250);
  --overlay: oklch(0.94 0.006 250);
  --border: oklch(0.88 0.006 250);
  --border-strong: oklch(0.78 0.008 250);

  --ink: oklch(0.20 0.012 250);
  --ink-2: oklch(0.42 0.014 250);
  --ink-3: oklch(0.52 0.012 250);
  /* ink-3 ≥ ~0.50 on light for 4.5:1 on white-ish */

  --ink-2-bg: color-mix(in oklch, var(--ink-2) 10%, transparent);
  --rejected-bg: color-mix(in oklch, var(--rejected) 10%, transparent);
  --accent-bg: color-mix(in oklch, var(--accent) 10%, transparent);

  --accent: oklch(0.52 0.12 195);
  --accent-ink: oklch(0.99 0 0);
  --accent-tint: color-mix(in oklch, var(--accent) 12%, transparent);
  --accent-glow: color-mix(in oklch, var(--accent) 18%, transparent);

  --active: oklch(0.62 0.14 75);
  --consumed: oklch(0.52 0.12 160);
  --rejected: oklch(0.55 0.18 25);
  --aging: oklch(0.60 0.12 75);
}
```

### 4.3 Hex equivalents for meta / PWA / favicon (approximate)

| Token use | Hex |
|-----------|-----|
| Dark accent / theme-color dark | `#0d9182` (keep — already teal) |
| Light theme-color | `#fafafa` or `#f8f9fb` |
| Dark bg / PWA background | `#1a1d24` approx of oklch(0.14 0.01 250) → use `#16191f` |
| Favicon fill | `#3dd6c6` or `#2ec4b6` (teal, not amber) |

In `src/index.ts` manifest if present:
- `theme_color: '#0d9182'`
- `background_color: '#16191f'` (replace any warm/purple-gray like `#242938` if it clashes)

---

## 5. Shell surgery — exact CSS edits

### 5.1 Kill nav side-stripe

**Find** (approx lines 135–136, 144, 809):

```css
.nav-btn.active { background: var(--accent-tint); color: var(--accent); }
.nav-btn.active::before { content: ''; position: absolute; left: -11px; top: 50%; translate: 0 -50%; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); }
```

and media variants that reposition `::before`.

**Replace with:**

```css
.nav-btn.active {
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: 600;
}
/* NO ::before side bar */
.nav-btn.active::before { content: none; display: none; }
```

Also remove/override the mobile rule:
```css
.nav-btn.active::before { left: 50%; top: -1px; ... }
```
Replace mobile active indicator with top border on the button itself if needed:

```css
@media (max-width: 720px) {
  .nav-btn.active {
    box-shadow: inset 0 2px 0 0 var(--accent);
  }
  .nav-btn.active::before { content: none; display: none; }
}
```
(Use inset shadow OR border — not a free-floating ::before bar.)

### 5.2 Kill queue card left hover stripe

**Find** `.qc-card::before { ... }` and `.qc-card:hover::before { background: var(--accent); }`

**Replace hover affordance with:**

```css
.qc-card {
  /* remove absolute ::before stripe entirely */
  position: relative;
  border-radius: 0;
  transition: background var(--dur) var(--ease);
}
.qc-card::before { content: none; display: none; }
.qc-card:hover {
  background: color-mix(in oklch, var(--surface) 55%, transparent);
}
```

### 5.3 Fix h3 section titles (ban uppercase eyebrows)

**Find:**
```css
h3 { font-size: 13px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
```

**Replace:**
```css
h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 8px;
  letter-spacing: -0.01em;
  text-wrap: balance;
  /* sentence case — no uppercase */
}
```

### 5.4 Filter / field labels — demote uppercase

Keep tiny labels readable but not “AI eyebrow”:
- `.fs-label`, `.filter-label`, `.field label`: **remove** `text-transform: uppercase` and wide tracking, OR set `letter-spacing: 0` and normal case.
- Chip kinds (activity-kind) may stay small caps if they are **status tags**, not section titles — one system of tags is OK; section chrome is not.

### 5.5 Toast — border OR shadow, not both wide

**Find** `.toast { ... border: 1px solid ... box-shadow: 0 6px 20px ... }`

**Replace shadow with max 8px blur OR drop shadow:**

```css
.toast {
  background: var(--overlay);
  border: 1px solid var(--border-strong);
  color: var(--ink);
  padding: 10px 14px;
  border-radius: var(--r-ctl);
  font-size: 12.5px;
  animation: toastIn 200ms var(--ease);
  /* border only — no wide shadow */
  box-shadow: none;
  max-width: 340px;
  pointer-events: auto;
}
```

### 5.6 Palette (Raycast) — keep elevation, fix ban

Palette is a floating Level-2 surface. Prefer **shadow without fighting a heavy border**, or border with soft ≤8px shadow:

```css
.palette {
  width: min(580px, calc(100vw - 32px));
  background: var(--overlay);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sheet);
  box-shadow: 0 8px 24px oklch(0 0 0 / 0.45); /* blur ≤24 is for modal only; prefer 8: */
  /* USE THIS instead: */
  /* box-shadow: 0 4px 8px oklch(0 0 0 / 0.35); */
  overflow: hidden;
  transform: scale(0.97) translateY(-8px);
  transition: transform 200ms var(--ease);
  max-height: 75vh;
  display: flex;
  flex-direction: column;
}
```

**Canonical choice for this rebrand:**  
`border: 1px solid var(--border-strong)` + `box-shadow: 0 4px 8px oklch(0 0 0 / 0.4)` (blur = 8, allowed).

Remove any `box-shadow: 0 16px 48px ...` (blur 48 = banned with border).

### 5.7 Batch bar same rule

```css
.batch-bar {
  /* ... existing layout ... */
  background: var(--overlay);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 4px 8px oklch(0 0 0 / 0.35);
}
```

### 5.8 FAB

Keep circular FAB (pill exception). Shadow OK as glow of accent but keep modest:

```css
.fab {
  /* existing size/position */
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 4px 8px color-mix(in oklch, var(--accent) 30%, transparent);
  /* no border */
}
.fab:hover { filter: brightness(1.06); transform: scale(1.04); }
@media (prefers-reduced-motion: reduce) {
  .fab:hover { transform: none; }
}
```

### 5.9 Segmented control (Linear)

Keep structure. Active segment:

```css
.seg {
  display: inline-flex;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
}
.seg-btn {
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 6px;
  color: var(--ink-2);
}
.seg-btn.active {
  background: var(--elevated);
  color: var(--ink);
  box-shadow: none; /* remove 0 1px 0 faux shadow if it looks muddy */
  font-weight: 600;
}
.seg-btn.active .seg-count {
  color: var(--accent);
  background: var(--accent-tint);
}
```

### 5.10 Sidebar (Linear rail)

Keep widths:
- Default collapsed feel: `--sidebar-w: 68px` on small
- `@media (min-width: 721px) { --sidebar-w: 132px; }` labels shown

Ensure:
```css
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
}
.sidebar-brand {
  color: var(--accent);
  background: var(--accent-tint);
  border-radius: var(--r-ctl);
}
```

### 5.11 Workspace head

```css
.ws-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 28px 10px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em; /* floor -0.04em; do not go tighter */
  line-height: 1.25;
  text-wrap: balance;
}
.ws-sub {
  color: var(--ink-2);
  font-size: 12.5px;
  margin-top: 2px;
}
```

Optional: add a subtle search trigger in shell header actions (see §6) — pure chrome, no new backend.

### 5.12 Focus rings

Keep:
```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

### 5.13 Reduced motion

Ensure near end of CSS (add if missing):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 5.14 Hardcoded hex in CSS that fight tokens

Replace activity colors that hardcode amber/green when tokens exist:

| Find | Replace |
|------|---------|
| `#f59e0b` | `var(--active)` |
| `#22c55e` | `var(--consumed)` |
| Any warm `oklch(... 60)` leftover as page bg | cool 250 tokens |

Search css.ts for `#` and remaining hue ` 60)` / ` 65)` / ` 75)` on **surfaces** (not semantic active amber).

---

## 6. Shell HTML (`src/shell.ts`) — exact checklist

1. **Cache bust** after CSS/JS changes:
   - `app.css?v=15` → `app.css?v=16` (or any integer +1 from current)
   - `app.js?v=24` → `app.js?v=25`
2. **theme-color** meta:
   - dark: `#0d9182`
   - light: `#fafafa`
3. **Favicon SVG** fill stays teal (`%233dd6c6` or similar), not amber.
4. **Title** stays `Taste Map`.
5. **Body** `data-theme="dark"` default stays.
6. **Nav buttons** — keep the five: curate, map, profile (`data-ws="map" data-sub="profile"`), log, vault. Do not remove Profile.
7. **Optional chrome (recommended):** In `.ws-actions` static area or head, add a button that opens the existing palette (same as ⌘K). Only if JS already has a global open-palette handler you can wire with one line. If wiring needs >10 lines of JS, skip.
8. Do not restructure sheet/modal/palette/batch/fab DOM ids — JS depends on them:
   - `sidebar`, `workspace`, `ws-name`, `ws-sub`, `ws-actions`, `ws-subnav`, `filters-bar`, `ws-body`
   - `sheet`, `sheet-backdrop`, `modal`, `modal-backdrop`
   - `palette`, `palette-backdrop`, `palette-input`, `palette-body`
   - `batch-bar`, `toast-stack`, `fab-new`, `theme-btn`

---

## 7. JS minimal fixes (`src/assets/js.ts`)

Only change **fallback color strings** that still hardcode warm amber so canvas/minimap don’t look wrong after CSS token swap.

### Search and replace table

| Find (exact or close) | Replace |
|------------------------|---------|
| `oklch(0.80 0.135 65)` | `oklch(0.72 0.14 195)` |
| `oklch(0.16 0.014 60)` as bg fallback | `oklch(0.14 0.01 250)` |
| `oklch(0.26 0.018 60)` elevated fallback | `oklch(0.20 0.013 250)` |
| `oklch(0.96 0.012 75)` ink fallback | `oklch(0.96 0.008 250)` |
| `oklch(0.44 0.020 60)` border fallback | `oklch(0.36 0.014 250)` |
| Default accent when tok fails already `#3dd6c6` | **keep** (teal — correct) |
| `tok('--accent', 'oklch(0.80 0.135 65)')` | `tok('--accent', 'oklch(0.72 0.14 195)')` |
| Category palette first color `#e8a838` | may keep as **category** color (not brand) — OK |
| SVG stop-color / hubRing stroke hardcoded warm oklch | teal `oklch(0.72 0.14 195)` |

**Do not** refactor canvas layout, cytoscape styles beyond color strings, or queue render functions.

---

## 8. PRODUCT.md + DESIGN.md updates

### 8.1 PRODUCT.md — set Platform bare value

```markdown
## Platform

web
```

Keep Users, Core loop, Three Workspaces, Non-goals as-is. Optionally add under Non-goals or Brand:

```markdown
## Craft bar
Linear shell density + Raycast command palette. Not marketing. Not Notion-pastel. Not cream SaaS.
```

### 8.2 DESIGN.md — replace with shipped truth

Overwrite DESIGN.md to match §4 tokens and bans. Required sections:

```markdown
# DESIGN.md — Taste Map Engine

## Anchors
Linear (rail, segmented views, density) · Raycast (⌘K palette) · cool teal restrained.

## Color
- OKLCH. Dark default. Light = true off-white chroma 0 (not cream).
- Dark bg: oklch(0.14 0.01 250). Surfaces +0.03L steps, hue 250.
- Accent: oklch(0.72 0.14 195) ≤10% of UI.
- Semantic: active amber / consumed green / rejected red — dots & badges only.
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
- Active nav: accent-tint fill + weight — no side stripe.
- Subnav: segmented control.
- Review: right sheet desktop / bottom sheet mobile.
- Loading: skeletons. Empty: one line + one action.

## Banned
Side-stripe · gradient text · cream body · warm amber brand · uppercase section eyebrows everywhere · border+wide shadow · radius≥16 cards · hover-only actions ≤1024px.
```

---

## 9. What “shell only” means for content views

You **may** change CSS that styles existing classes so they inherit new tokens (they will automatically look cooler).

You **must not**:
- Change HTML string templates for queue cards beyond class renames that CSS requires
- Rewrite map canvas interaction
- Add new empty-state copy systems
- Change API fetch shapes

Allowed content-view CSS polish (token inheritance + ban fixes only):
- `.qc-card`, `.queue-card` borders/hover bg (no left stripe)
- `.chip-*`, `.dot-*`, `.btn-*` colors via tokens
- `.vault-*` surfaces
- `.branch-card` hover border using accent
- Skeleton shimmer colors if they hardcode old bg

---

## 10. Typography scale (do not invent fluid clamp heroes)

| Role | Size | Weight |
|------|------|--------|
| Workspace h1 | 20px | 600 |
| h2 | 15px | 600 |
| Section h3 | 13px | 600 |
| Body | 14px | 400 |
| Meta / sub | 12–12.5px | 400–500 |
| Mono counts | 10–11px | 500–600 |
| Absolute max | 28px | — |

Body line-height ~1.55. Letter-spacing body ~0.01em ok.

---

## 11. Interaction contract (do not break)

| Interaction | Expected |
|-------------|----------|
| Click nav workspace | Switch hash / workspace, update active class |
| Theme button | Toggle `data-theme` dark/light, persist if already localStorage |
| FAB / `n` | Existing new-entry flow |
| ⌘K / palette | Existing search |
| Sheet open | Backdrop + sheet `.open`, workspace inert |
| Batch select | batch-bar rises |
| Drag queue reorder | Keep; drag-over uses top border accent 2px OK (not side stripe) |
| Swipe queue | Keep consumed/rejected tints |

---

## 12. Implementation order (do in this sequence)

1. **Write tokens** in `css.ts` `:root` + `[data-theme="light"]` (§4).
2. **Ban fixes** in `css.ts`: nav stripe, qc stripe, h3, toast/palette/batch shadows (§5).
3. **Scan** `css.ts` for leftover hue-60 warm surfaces and hardcoded hex; fix (§5.14).
4. **shell.ts** cache-bust + meta (§6).
5. **js.ts** fallback color strings only (§7).
6. **index.ts** PWA colors if needed (§4.3).
7. **DESIGN.md** + **PRODUCT.md** (§8).
8. **Verify** checklist §14.
9. **Deploy/dev** optional: `npm run dev` or `npx wrangler dev` — visual check dark + light + mobile width 375 + 1024.

Do not skip steps or reorder unless a file is missing.

---

## 13. Search commands to run after edits

Run from `/home/mahmud/recommendations-worker`:

```bash
# Warm amber brand must be gone from CSS tokens
rg -n "0\.80 0\.135 65|0\.16 0\.014 60|hue 60\)|oklch\(0\.[0-9]+ 0\.01[0-9]+ 60\)" src/assets/css.ts

# Side stripe patterns
rg -n "nav-btn\.active::before|qc-card::before|border-left:\s*[2-9]px|border-left:\s*3px" src/assets/css.ts

# Wide shadows with risk
rg -n "box-shadow:.*[1-9][0-9]+px" src/assets/css.ts

# Uppercase section default
rg -n "h3 \{[^}]*text-transform:\s*uppercase" src/assets/css.ts

# JS warm fallbacks
rg -n "0\.80 0\.135 65|0\.16 0\.014 60" src/assets/js.ts
```

Expected: **zero** hits on warm brand tokens and side-stripe rules (except `content: none` overrides).

---

## 14. Done checklist

### Tokens
- [ ] Dark `--bg` is `oklch(0.14 0.01 250)` (or documented equivalent cool)
- [ ] Dark `--accent` is `oklch(0.72 0.14 195)`
- [ ] Light `--bg` is near `oklch(0.99 0 0)` — not cream
- [ ] Semantic active/consumed/rejected still distinct

### Shell
- [ ] No `.nav-btn.active::before` visible bar
- [ ] No `.qc-card::before` hover stripe
- [ ] Sidebar still works desktop + mobile bottom bar
- [ ] Segmented subnav still works
- [ ] Sheet, modal, palette, toast, fab, batch still open/close
- [ ] Theme toggle works both ways
- [ ] Cache bust query params bumped

### Bans
- [ ] No side-stripe accents
- [ ] No border + blur≥16 on toast/palette/batch
- [ ] h3 not uppercase-by-default
- [ ] No gradient text added
- [ ] No new cream palette

### Docs
- [ ] DESIGN.md matches shipped tokens
- [ ] PRODUCT.md `## Platform` is `web`

### Scope discipline
- [ ] No API changes
- [ ] No new dependencies
- [ ] No workspace IA change
- [ ] js.ts only color fallbacks (or ≤ minimal palette open wiring)

### A11y smoke
- [ ] Focus-visible ring uses accent
- [ ] Body text contrast OK dark and light
- [ ] `prefers-reduced-motion` kills motion
- [ ] Touch targets on mobile nav ≥44px height kept

---

## 15. Out of scope (explicit — ignore if tempted)

- Full rewrite of queue card markup / archive rows
- Map canvas redesign (layout, physics, UX)
- New onboarding
- Auth
- Multi-user
- Marketing site
- Font change (Geist, SF, etc.)
- Animation library (framer, motion)
- Dark-only or light-only removal of either theme
- “Bolder” committed/drenched color strategies

---

## 16. Acceptance criteria (human eye)

After deploy/local:

1. First paint feels **cool teal tool**, not warm amber dashboard.
2. Looks like it could sit next to **Linear** without embarrassment (density, rail, segs).
3. ⌘K palette still feels **Raycast-adjacent** (centered, fast, sharp).
4. Tablet 1024px: actions visible, no hover-only traps.
5. Phone: bottom nav, sheets from bottom, no broken overflow.
6. Light mode: white/gray cool, **not** parchment/cream.
7. A second engineer reading DESIGN.md can restyle a new component without inventing colors.

---

## 17. Copy-paste commit message (when done)

```
rebrand: cool teal Linear/Raycast shell tokens

Align css.ts to DESIGN.md cool teal restrained palette.
Remove nav/queue side-stripes, fix border+wide shadow bans,
sentence-case section titles, bump asset cache, sync docs.
Shell-only — no API or view-logic rewrite.
```

---

## 18. If the implementing model is stuck

| Symptom | Fix |
|---------|-----|
| “Should I redesign queue cards?” | No. Tokens only. |
| “Warm amber looks nicer” | Forbidden. Use §4. |
| “Add glassmorphism to sidebar” | No. |
| “Use 32px radius” | No. Max 12 sheet / 10 card. |
| “Remove Profile nav” | No. Keep five items. |
| “Migrate to React” | No. |
| File too large to edit | Use search_replace on token blocks and ban selectors; do not rewrite entire js.ts. |
| Conflict between DESIGN.md and this spec | **This spec wins** for implementation; then update DESIGN.md to match. |

---

## 19. One-line mission for the model

**Retoken to cool teal, fix shell bans, bump cache, sync docs; touch nothing else.**
