# Taste Map Engine — Complete Redesign Plan

> **For execution:** Use `delegate_task` per phase, each phase is 3-6 tasks.

**Goal:** Redesign the Taste Map Engine — interaction model, architecture, visual design, and UX — from scratch. The current SPA is a monolithic mockup; replace it with a cohesive, intentional product.

**Interaction Concept:** The system is a **Personal Knowledge & Curation Hub** with three modes:
- **Curate** (recommendations queue, review, ratings)
- **Map** (knowledge tree, canvas, patterns, profile)
- **Log** (learning journal, vault, stats)

Each mode is a distinct **workspace**, not a tab. The user switches workspace when they change mental context, not when they want a different view of the same data.

**Tech Stack:** Same (Cloudflare Worker + Hono + D1), but structured as separate route modules + a pure static frontend (built HTML/CSS/JS, served from the worker but developed independently).

---

## Phase 0: Project Foundation

### Task 0.1 — Create PRODUCT.md & DESIGN.md (impeccable init)

- Write PRODUCT.md capturing: register (product UI), platform (web), user (Mahmood — deep consumer of knowledge), goals (curate, map, learn).
- Write DESIGN.md capturing design tokens, composition rules, and the three-workspace concept.

### Task 0.2 — Scaffold project structure

**Files:**
- `src/` — split from current `index.ts`:
  - `src/index.ts` — entry point, routes mounting
  - `src/api/` — route modules
  - `src/schema.ts` — type definitions
  - `src/html.ts` — HTML template renderers
- `frontend/` — static assets
  - `frontend/css/`
  - `frontend/js/`
  - `frontend/index.html`
- Remove embedded HTML template from `src/index.ts`

### Task 0.3 — Set up build pipeline

- Add frontend build script (simple — bundling isn't needed for a worker, but CSS/JS should be separate files)
- Move `w2.js` content into `frontend/js/tree.js` — served from `/static/` endpoints

---

## Phase 1: Core API Cleanup

The API is solid but routes are jammed in one file. Keep all endpoints, just modularize.

### Task 1.1 — Extract recommendation routes

**Create:** `src/api/recommendations.ts`
- Move: `/recommendations/list`, `/push`, `/action`, `/delete`, `/export`

### Task 1.2 — Extract brain routes

**Create:** `src/api/brain.ts`
- Move: `/brain/profile`, `/brain/tree`, `/brain/node/:id`, `/brain/branches`, `/brain/resurfacing`, `/brain/contradictions`, `/brain/health`, `/brain/log`, `/brain/seed`

### Task 1.3 — Extract HTML vault + learning routes

**Create:** `src/api/vault.ts`, `src/api/learning.ts`
- Move all `/html/*` and `/learning/*` routes

### Task 1.4 — Extract stats route

**Create:** `src/api/stats.ts`
- Move `/stats`

---

## Phase 2: New Interaction Design (The Core Redesign)

### 2.1 — Workspace Layout

Replace the tab bar with a **sidebar navigation** with three workspaces:

```
┌─────────┬────────────────────────────────────────┐
│ ◉ Map   │                                        │
│ ◉ Curate│          [Workspace Content]           │
│ ◉ Log   │                                        │
│         │                                        │
│ ⚙       │                                        │
└─────────┴────────────────────────────────────────┘
```

- Sidebar: 48px collapsed / 200px expanded on desktop, bottom tab bar on mobile
- Each workspace has its own sub-navigation (not global tabs)
- Workspace state is preserved when switching

### 2.2 — Curate Workspace (was "Recommendations tab")

**Mental model:** Inbox → Consume → Review → Archive

**Views:**
- **Queue** — Card-based layout. Each card shows: title, creator, type badge, rationale snippet, age indicator. Swipe/Long-press to mark consumed/rejected.
- **Review** — When marking consumed, a slide-in panel opens for rating + notes. No modal overlay — context stays visible.
- **Archived** — Consumed items as a timeline (not a table). Filterable by branch/rating/period.

**Behaviors:**
- Pull-to-refresh (mobile)
- Smart grouping: "Fresh this week", "Aging (30d+)", "Stale (60d+)"
- Quick actions without leaving the list: inline rating stars, one-tap reject

### 2.3 — Map Workspace (was "Tree" + "Profile")

**Mental model:** A living map of what you know and care about.

**Views:**
- **Canvas** — The interactive knowledge tree (already exists in w2.js, needs re-skin). Pan/zoom, node drill-down, edge relationships.
- **Profile** — Your taste identity card + mega-priority list + patterns. More visual: progress rings for branch saturation, heat indicators for engagement.
- **Branches** — Tabular/column view of all branches sorted by health. Shows: name, status, consumed count, avg rating, last activity, a "needs attention" flag.
- **Resurfacing** — Items due for spaced repetition. Shows overdue badge prominently.

**Key change:** Profile is no longer a tab in the recs list — it lives here where it makes semantic sense.

### 2.4 — Log Workspace (was "Learning" + "HTML Vault" + "Stats")

**Mental model:** What you produced, what you saved, how you're doing.

**Views:**
- **Journal** — Learning heatmap (keep the GitHub-style graph) + daily log + streak indicators. Rich entry: add topics, optionally link to a branch.
- **Vault** — HTML/PDF document manager. Same grouping behavior (HTML+PDF pairs). Better preview: swipeable gallery cards.
- **Stats** — Dashboard with consumption trends, rating distributions, creator rankings. Charts, not just numbers.

---

## Phase 3: Visual Design

### 3.1 — Design System

**Colors** (OKLCH throughout):
- Base: deep dark (oklch(0.12 0.012 200)) — keep current, it's solid
- Accent: teal (oklch(0.65 0.16 185)) — keep
- Surfaces: stepped levels (base → surface → elevated → modal)
- Semantic colors: active/gold (#e6b800), consumed/green, rejected/red — use as accent, not background
- **New:** Introduce a true off-white light mode (chroma 0, not cream)

**Typography:**
- Headings: Inter 600 (tight tracking -0.02em)
- Body: Inter 400 (16px base, 1.6 line-height)
- Mono: JetBrains Mono for data/code
- Max body width: 72ch for reading views

**Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 48, 64

### 3.2 — UI Components

Define reusable components (not a framework — just consistent HTML/CSS patterns):

- **Sidebar** — Workspace nav, collapsed/expanded, active indicator
- **Card** — Queue items, consumed timeline, vault items. Not nested. Options: default, compact, detailed.
- **Status dot** — Active/consumed/rejected, with optional glow animation for active
- **Modal** — Review, push, edit. Slide-up on mobile, centered on desktop. Backdrop blur.
- **Toast** — Keep current position (bottom-right), add slide-out animation
- **Chip** — Branch labels, filter tags, synergy bundles
- **Badge** — Count indicators, status badges
- **Button** — Primary, secondary (outline), ghost, icon-only. 32px/40px/48px sizes.
- **Progress bar** — Branch saturation, consumed rate
- **Heatmap cell** — 5-level intensity, tooltip on hover

### 3.3 — Transitions & Motion

- Sidebar expand: 200ms ease-out-quart, content shifts smoothly
- Workspace switch: `view-transition` (crossfade, 200ms)
- Card entrance: staggered with `animation-delay`, fade-up from 8px
- Modal: 250ms ease-out-quart, scale 0.96 → 1.0
- Status change: glow pulse on active dot, 1s then settle
- Scroll: smooth scrolling within workspace panels
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables all transforms/opacity animations, uses instant display

---

## Phase 4: Frontend Implementation

### 4.1 — Extract CSS from inline template

**Create:** `frontend/css/base.css` — CSS custom properties, reset, typography
**Create:** `frontend/css/workspace.css` — sidebar, workspace layout, responsive
**Create:** `frontend/css/components.css` — cards, modals, buttons, chips, forms
**Create:** `frontend/css/curate.css` — queue, review, archive views
**Create:** `frontend/css/map.css` — canvas, profile, branch health, resurfacing
**Create:** `frontend/css/log.css` — heatmap, vault, stats

### 4.2 — Extract JS from inline template

**Create:** `frontend/js/app.js` — entry point, routing, state management
**Create:** `frontend/js/curate.js` — queue rendering, push/review actions
**Create:** `frontend/js/map.js` — profile, branches, resurfacing
**Create:** `frontend/js/log.js` — heatmap, vault, stats
**Create:** `frontend/js/tree.js` — existing w2 functionality (re-skin)
**Create:** `frontend/js/utils.js` — escHtml, showToast, fetch helpers

### 4.3 — Build workspace navigation

- Sidebar with three icons + labels
- Each click loads the workspace's main view
- State kept in a simple `window.workspaceState` object
- URL hash routing (`#curate`, `#map`, `#log`)

### 4.4 — Serve static files from worker

**Add to `src/index.ts`:**
```
app.get('/static/*', serveStatic)
```
Or serve files from `frontend/` paths. For Cloudflare Workers, the simplest approach is embedding files as strings (like the current w2.js pattern) or reading them from the script. Since Workers are single-script, embed the CSS/JS as separate exports.

**Alternative:** Bundle frontend into the worker build using a simple copy step in `wrangler.toml` or a build script.

---

## Phase 5: Polish & Edge Cases

### 5.1 — Responsive

- Mobile (<640px): bottom tab bar, single-column content, full-width modals
- Tablet (640-1024px): sidebar collapses to icons, two-column layouts where appropriate
- Desktop (>1024px): full sidebar, three-column stats, canvas fills space

### 5.2 — Empty states

Every view needs an intentional empty state:
- Queue empty: "All caught up! Your taste profile is fully reviewed." + suggestion to push new items
- No learning: "Start logging your daily learning. One topic per day builds streaks."
- No vault files: "Your vault is empty. Upload HTML files or paste code."
- No tree: "Seed your taste tree via the API to visualize your knowledge."

### 5.3 — Error states

- API failure: inline banner, retry button, never blank screen
- Rate limiting: toast with cooldown indicator
- Offline: cached last-known state, banner "You're offline"

### 5.4 — Loading states

- Skeleton loaders for each workspace (not spinners)
- Shimmer animation matching the surface color
- Progressive enhancement: static HTML first, JS enhances

---

## Phase 6: Backend Improvements

### 6.1 — Schema migrations

- Add `updated_at` to recommendations table
- Add `tags` JSON field to learning_log
- Add `branch_id` foreign key to recommendations

### 6.2 — New endpoints

- `PATCH /recommendations/:id` — partial update (instead of always POST to /action)
- `GET /recommendations/:id` — single item detail
- `GET /brain/stats` — aggregated brain statistics (saturation, coverage)

### 6.3 — Caching strategy

- `/html/list`: cache with `no-store` (it's admin ops, needs freshness)
- `/stats`: cache 60s CDN, 300s browser (stale stats are fine for a bit)
- Static assets: cache 1y with content hash in URL

---

## Validation

- Run `wrangler dev` after each phase — verify all endpoints respond
- Visual check: compare screenshots of each workspace before/after
- Lighthouse audit: >90 performance, >95 accessibility, >90 best practices
- `curl` all API routes to confirm no regressions

## Risks & Tradeoffs

- **Risk:** Splitting the frontend adds complexity. **Mitigation:** Keep it simple — no framework, just organized vanilla JS. The build step is a copy, not a bundler.
- **Risk:** Three workspaces add navigation overhead. **Mitigation:** The user has a clearer mental model. Current 9-tab nav is higher cognitive load than 3 workspaces with sub-views.
- **Tradeoff:** Worker asset serving. Workers aren't optimized for serving many static files. Keep assets embedded as strings OR use a CDN (Cloudflare Pages for static, Worker for API).
