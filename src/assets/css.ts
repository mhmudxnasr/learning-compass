// Taste Map — redesigned UI. Product register, restrained but expressive.
export const cssBundle = `/* ===== Tokens ===== */
:root {
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --bg: oklch(0.16 0.014 60);
  --surface: oklch(0.21 0.016 60);
  --elevated: oklch(0.26 0.018 60);
  --overlay: oklch(0.31 0.020 60);
  --border: oklch(0.34 0.016 60);
  --border-strong: oklch(0.44 0.020 60);

  --ink: oklch(0.96 0.012 75);
  --ink-2: oklch(0.78 0.020 70);
  --ink-3: oklch(0.62 0.022 65);

  --accent: oklch(0.80 0.135 65);
  --accent-ink: oklch(0.18 0.04 60);
  --accent-tint: color-mix(in oklch, var(--accent) 16%, transparent);
  --accent-glow: color-mix(in oklch, var(--accent) 22%, transparent);

  --active: oklch(0.82 0.14 75);
  --consumed: oklch(0.78 0.13 55);
  --rejected: oklch(0.70 0.17 30);
  --aging: oklch(0.80 0.13 60);

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

[data-theme="light"] {
  --bg: oklch(0.985 0.004 75);
  --surface: oklch(0.97 0.006 75);
  --elevated: oklch(0.96 0.008 75);
  --overlay: oklch(0.93 0.008 75);
  --border: oklch(0.88 0.006 75);
  --border-strong: oklch(0.80 0.008 75);
  --ink: oklch(0.18 0.012 70);
  --ink-2: oklch(0.40 0.018 70);
  --ink-3: oklch(0.54 0.020 70);
  --accent: oklch(0.58 0.135 60);
  --accent-ink: oklch(0.99 0.005 75);
  --accent-tint: color-mix(in oklch, var(--accent) 12%, transparent);
  --active: oklch(0.62 0.14 65);
  --consumed: oklch(0.56 0.12 55);
  --rejected: oklch(0.55 0.18 30);
}

/* ===== Reset ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.55;
  letter-spacing: 0.01em;
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow: hidden;
  display: flex;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
input, select, textarea { font: inherit; color: inherit; outline: none; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; }
h2 { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; }
h3 { font-size: 13px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
::selection { background: var(--accent-tint); color: var(--ink); }

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.input:focus-visible, .textarea:focus-visible, .select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-tint);
}

.kb-focus {
  outline: 2px solid var(--accent) !important;
  outline-offset: 2px;
  border-radius: var(--r-card);
}

/* ===== Layout ===== */
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  gap: 6px;
  z-index: var(--z-sticky);
}
.sidebar-brand { width: 40px; height: 40px; display: grid; place-items: center; color: var(--accent); margin-bottom: 10px; border-radius: var(--r-ctl); background: var(--accent-tint); }
.sidebar-brand svg { width: 18px; height: 18px; }
.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.nav-btn { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--r-ctl); color: var(--ink-2); position: relative; }
.nav-btn svg { width: 18px; height: 18px; }
.nav-btn:hover { background: var(--elevated); color: var(--ink); }
.nav-btn.active { background: var(--accent-tint); color: var(--accent); }
.nav-btn.active::before { content: ''; position: absolute; left: -11px; top: 50%; translate: 0 -50%; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); }
.nav-label { display: none; }
.sidebar-foot { margin-top: auto; }

.workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg); }
.ws-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 20px 28px 10px; border-bottom: 1px solid var(--border); }
.ws-sub { color: var(--ink-2); font-size: 12.5px; margin-top: 2px; }
.ws-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.ws-subnav { display: flex; gap: 4px; padding: 8px 28px; border-bottom: 1px solid var(--border); background: var(--bg); }
.seg { display: inline-flex; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.seg-btn { padding: 5px 12px; font-size: 12.5px; font-weight: 500; border-radius: 6px; color: var(--ink-2); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.seg-btn:hover { color: var(--ink); }
.seg-btn.active { background: var(--elevated); color: var(--ink); box-shadow: 0 1px 0 oklch(0 0 0 / 0.15); }
.seg-count { font-size: 10px; font-family: var(--font-mono); color: var(--ink-3); background: var(--bg); padding: 1px 5px; border-radius: 6px; min-width: 1.3em; text-align: center; }
.seg-btn.active .seg-count { color: var(--accent); background: var(--accent-tint); }
.ws-body { flex: 1; overflow-y: auto; padding: 20px 28px 80px; }

/* ===== Filter bar (dropdown-based — user's design) ===== */
.filters-bar { display: flex; flex-wrap: wrap; gap: 4px 8px; padding: 10px 28px; border-bottom: 1px solid var(--border); background: var(--bg); align-items: center; }
.fs-group { display: flex; align-items: center; gap: 2px; }
.fs-label { font-size: 10.5px; color: var(--ink-3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
.fs-select { height: 28px; padding: 0 6px; font-size: 12px; background: transparent; border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); outline: none; cursor: pointer; min-width: 80px; }
.fs-select:hover { border-color: var(--border-strong); }
.fs-toggle { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-3); padding: 4px 8px; border-radius: var(--r-ctl); cursor: pointer; transition: all var(--dur) var(--ease); background: transparent; border: 1px solid transparent; }
.fs-toggle:hover { color: var(--ink-2); border-color: var(--border); }
.fs-toggle.on { color: var(--accent); background: var(--accent-tint); border-color: transparent; }
.fs-toggle svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.fs-input { height: 28px; padding: 0 8px; font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); outline: none; min-width: 120px; }
.fs-input::placeholder { color: var(--ink-3); }
.fs-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-tint); }
.fs-icon { position: absolute; left: 8px; top: 50%; translate: 0 -50%; pointer-events: none; }
.fs-input-wrap { position: relative; display: inline-flex; align-items: center; }
.fs-input-wrap .fs-input { padding-left: 28px; }

/* ===== Buttons ===== */
.btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; font-size: 12.5px; font-weight: 500; border-radius: var(--r-ctl); color: var(--ink); border: 1px solid var(--border); background: var(--surface); }
.btn:hover { background: var(--elevated); border-color: var(--border-strong); }
.btn.loading { position: relative; color: transparent !important; pointer-events: none; }
.btn.loading::after { content: ''; position: absolute; width: 13px; height: 13px; top: 50%; left: 50%; margin: -6.5px 0 0 -6.5px; border: 2px solid var(--ink-3); border-top-color: var(--ink); border-radius: 50%; animation: spin 600ms linear infinite; }
.btn svg { width: 13px; height: 13px; }
.btn-primary { background: var(--accent); border-color: transparent; color: var(--accent-ink); font-weight: 600; }
.btn-primary:hover { filter: brightness(1.08); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
.btn-ghost:hover { background: var(--elevated); color: var(--ink); }
.btn-danger { color: var(--rejected); }
.btn-danger:hover { background: color-mix(in oklch, var(--rejected) 12%, transparent); border-color: color-mix(in oklch, var(--rejected) 40%, transparent); }
.btn-icon { width: 32px; padding: 0; justify-content: center; }
.btn-disabled { opacity: 0.3; cursor: default; pointer-events: none; }
.btn-sm { height: 26px; padding: 0 10px; font-size: 11.5px; }
.btn-group { display: inline-flex; gap: 1px; }
.btn-group .btn { border-radius: 0; }
.btn-group .btn:first-child { border-radius: var(--r-ctl) 0 0 var(--r-ctl); }
.btn-group .btn:last-child { border-radius: 0 var(--r-ctl) var(--r-ctl) 0; }
.btn-group .btn.active { background: var(--accent-tint); color: var(--accent); border-color: var(--accent); }

/* ===== Queue Cards (user's design) ===== */
.queue-cards { display: flex; flex-direction: column; max-width: var(--content-w); gap: 0; position: relative; }
.qc-card { padding: 14px 16px; border-bottom: 1px solid var(--border); transition: background var(--dur) var(--ease); }
.qc-card:last-child { border-bottom: 0; }

/* ===== Queue Drag Reorder ===== */
.qc-card.dragging { opacity: 0.4; }
.qc-card.drag-over { border-top: 2px solid var(--accent); }
.qc-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: transparent;
  transition: background var(--dur) var(--ease);
}
.qc-card:hover::before { background: var(--accent); }
.qc-card:hover { background: color-mix(in oklch, var(--surface) 50%, transparent); }
.qc-row1 { display: flex; align-items: flex-start; gap: 10px; }
.qc-row1 .chk { margin-top: 3px; flex-shrink: 0; }
.qc-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 7px; }
.qc-body { flex: 1; min-width: 0; }
.qc-title { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-sub { font-size: 12px; color: var(--ink-2); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-top: 3px; }
.qc-type { font-size: 10.5px; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: var(--accent-tint); color: var(--accent); white-space: nowrap; }
.qc-age { font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); white-space: nowrap; }
.qc-desc { margin-top: 8px; font-size: 13px; color: var(--ink-2); line-height: 1.5; max-width: 72ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.qc-actions { display: flex; gap: 6px; margin-top: 10px; }
.qc-actions .btn { height: 28px; padding: 0 10px; font-size: 11.5px; }
.qc-card.card-aging { background: color-mix(in oklch, var(--aging) 5%, transparent); }
.qc-card.card-stale { background: color-mix(in oklch, var(--rejected) 5%, transparent); }

/* ===== Status dots (dot-only, reused) ===== */
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.dot-active { background: var(--active); }
.dot-consumed { background: var(--consumed); }
.dot-rejected { background: var(--rejected); }

/* ===== Queue ===== */
.queue { display: flex; flex-direction: column; max-width: var(--content-w); }
.queue-card { display: flex; gap: 12px; align-items: flex-start; padding: 14px 4px; background: transparent; border-bottom: 1px solid var(--border); animation: rise 200ms var(--ease) backwards; }
.queue-card:last-child { border-bottom: 0; }
.queue-card:hover { background: color-mix(in oklch, var(--surface) 60%, transparent); }
.q-dot { margin-top: 8px; }
.q-main { flex: 1; min-width: 0; }
.q-title { font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); line-height: 1.35; }
.q-meta { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.q-meta span { display: inline-flex; align-items: center; gap: 4px; }
.q-meta .sep { color: var(--ink-3); margin: 0 4px; }
.q-why { margin-top: 8px; font-size: 13.5px; color: var(--ink-2); line-height: 1.5; max-width: 72ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.q-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

/* ===== Queue Dashboard ===== */
.queue-dashboard { max-width: var(--content-w); margin-bottom: 20px; }
.queue-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.queue-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 12px 14px; }
.queue-stat .qs-val { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.queue-stat .qs-label { font-size: 11px; color: var(--ink-2); font-weight: 500; margin-top: 2px; }
.qs-val.c-active { color: var(--active); }
.qs-val.c-consumed { color: var(--consumed); }
.qs-val.c-rejected { color: var(--rejected); }
.queue-types { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.queue-stale-banner {
  padding: 10px 14px;
  border-radius: var(--r-ctl);
  background: color-mix(in oklch, var(--rejected) 6%, transparent);
  border: 1px solid color-mix(in oklch, var(--rejected) 20%, transparent);
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 14px;
}
.queue-stale-banner strong { color: var(--rejected); font-weight: 600; }

/* Aging / stale rows */
.queue-card.card-aging { background: color-mix(in oklch, var(--aging) 5%, transparent); }
.queue-card.card-stale { background: color-mix(in oklch, var(--rejected) 5%, transparent); }

.chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: var(--elevated); color: var(--ink-2); border: 1px solid var(--border); }
.chip-accent { background: var(--accent-tint); color: var(--accent); border-color: transparent; }
.chip-active { color: var(--active); border-color: color-mix(in oklch, var(--active) 30%, transparent); }
.chip-consumed { color: var(--consumed); }
.chip-rejected { color: var(--rejected); }

/* ===== Filter bar (restructured) ===== */
.filters-bar { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 8px 28px; border-bottom: 1px solid var(--border); background: var(--bg); align-items: center; }
.filter-group { display: flex; align-items: center; gap: 4px; }
.filter-label { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-right: 2px; text-transform: uppercase; letter-spacing: 0.03em; }
.filter-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 6px; background: transparent; color: var(--ink-3); border: 1px solid transparent; cursor: pointer; transition: all var(--dur) var(--ease); }
.filter-chip:hover { color: var(--ink-2); border-color: var(--border); }
.filter-chip.on { background: var(--accent-tint); color: var(--accent); border-color: transparent; }
.filter-chip.reset { color: var(--rejected); }
.filter-input { height: 26px; padding: 0 8px; font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); max-width: 140px; }
.filter-input::placeholder { color: var(--ink-3); }

/* ===== Stats / Charts ===== */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 24px; max-width: var(--content-w); }
.stat-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 14px 16px; }
.stat-block .s-label { font-size: 11px; color: var(--ink-2); font-weight: 500; }
.stat-block .s-value { font-size: 26px; font-weight: 600; letter-spacing: -0.025em; margin-top: 4px; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat-block .s-sub { font-size: 11px; color: var(--ink-3); margin-top: 3px; }
.s-value.c-accent { color: var(--accent); }
.s-value.c-active { color: var(--active); }
.s-value.c-consumed { color: var(--consumed); }
.s-value.c-rejected { color: var(--rejected); }

.chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 16px; margin-bottom: 16px; max-width: var(--content-w); }
.chart-title { font-size: 12px; font-weight: 600; color: var(--ink-2); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.chart-title .count { font-weight: 400; font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); }

.bar-chart { display: flex; flex-direction: column; gap: 4px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-row .b-label { font-size: 12px; color: var(--ink-2); width: 100px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-row .b-label.mono { font-family: var(--font-mono); font-size: 11px; width: 80px; }
.bar-row .b-track { flex: 1; height: 8px; background: var(--elevated); border-radius: 4px; overflow: hidden; }
.bar-row .b-fill { height: 100%; border-radius: 4px; background: var(--accent); transition: width 800ms var(--ease); }
.bar-row .b-fill.c-consumed { background: var(--consumed); }
.bar-row .b-fill.c-active { background: var(--active); }
.bar-row .b-fill.c-rejected { background: var(--rejected); }
.bar-row .b-count { font-family: var(--font-mono); font-size: 11px; color: var(--ink); min-width: 28px; text-align: right; transition: all 800ms var(--ease); }

.rating-dist { display: flex; gap: 0; height: 24px; border-radius: 6px; overflow: hidden; }
.rating-seg { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: var(--bg); transition: width 800ms var(--ease); }
.rating-seg.r-love { background: var(--active); }
.rating-seg.r-like { background: var(--consumed); }
.rating-seg.r-meh { background: var(--ink-3); }
.rating-seg.r-dislike { background: var(--rejected); }

.month-chart { display: flex; align-items: flex-end; gap: 4px; height: 80px; padding-top: 4px; }
.month-bar { flex: 1; border-radius: 3px 3px 0 0; background: var(--consumed); transition: height 800ms var(--ease); min-height: 2px; position: relative; }
.month-bar .mb-val { position: absolute; bottom: 100%; left: 50%; translate: -50% -4px; font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); white-space: nowrap; }
.month-bar .mb-label { position: absolute; top: 100%; left: 50%; translate: -50% 4px; font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); }

/* ===== Archive ===== */
.archive { max-width: 880px; }
.archive-day { margin-bottom: 24px; }
.archive-date { font-size: 11px; font-weight: 600; color: var(--ink-3); margin-bottom: 6px; letter-spacing: 0.02em; }
.archive-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--border); }
.archive-item:last-child { border-bottom: 0; }
.archive-item .a-main { flex: 1; min-width: 0; }
.a-title { font-size: 13.5px; font-weight: 500; color: var(--ink); line-height: 1.35; }
.a-meta { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.a-review { margin-top: 6px; font-size: 13px; color: var(--ink-2); font-style: italic; padding-left: 10px; border-left: 2px solid var(--border-strong); max-width: 64ch; line-height: 1.5; }

.rating-tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; text-transform: capitalize; white-space: nowrap; }
.rating-love { background: color-mix(in oklch, var(--active) 18%, transparent); color: var(--active); }
.rating-like { background: color-mix(in oklch, var(--consumed) 15%, transparent); color: var(--consumed); }
.rating-meh { background: var(--elevated); color: var(--ink-2); }
.rating-dislike { background: color-mix(in oklch, var(--rejected) 15%, transparent); color: var(--rejected); }

/* ===== Sheet ===== */
.sheet-backdrop { position: fixed; inset: 0; background: oklch(0.03 0.01 240 / 0.55); opacity: 0; pointer-events: none; transition: opacity var(--dur) var(--ease); z-index: var(--z-sheet); }
.sheet-backdrop.open { opacity: 1; pointer-events: auto; }
.sheet { position: fixed; top: 0; right: 0; bottom: 0; width: min(var(--sheet-w), 100vw); background: var(--surface); border-left: 1px solid var(--border); transform: translateX(100%); transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1); z-index: calc(var(--z-sheet) + 1); display: flex; flex-direction: column; overflow-y: auto; }
.sheet.open { transform: none; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 1; }
.sheet-body { padding: 20px; flex: 1; }
.sheet-foot { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.field label { font-size: 11.5px; font-weight: 500; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.03em; }
.input, .textarea, .select { background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-ctl); padding: 8px 11px; font-size: 13px; color: var(--ink); outline: none; transition: border-color var(--dur) var(--ease); width: 100%; }
.input::placeholder, .textarea::placeholder { color: var(--ink-3); }
.textarea { min-height: 80px; resize: vertical; font-family: inherit; line-height: 1.5; }

.rating-picker { display: flex; gap: 6px; }
.rating-opt { flex: 1; padding: 10px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-ctl); font-size: 12px; font-weight: 500; color: var(--ink-2); transition: all var(--dur) var(--ease); text-align: center; }
.rating-opt:hover { border-color: var(--border-strong); color: var(--ink); }
.rating-opt.selected[data-r="love"] { background: color-mix(in oklch, var(--active) 18%, transparent); border-color: var(--active); color: var(--active); }
.rating-opt.selected[data-r="like"] { background: color-mix(in oklch, var(--consumed) 15%, transparent); border-color: var(--consumed); color: var(--consumed); }
.rating-opt.selected[data-r="meh"] { background: var(--elevated); border-color: var(--ink-3); color: var(--ink); }
.rating-opt.selected[data-r="dislike"] { background: color-mix(in oklch, var(--rejected) 15%, transparent); border-color: var(--rejected); color: var(--rejected); }

/* ===== Modal ===== */
.modal-backdrop { position: fixed; inset: 0; background: oklch(0.03 0.01 240 / 0.5); display: grid; place-items: center; opacity: 0; pointer-events: none; transition: opacity var(--dur) var(--ease); z-index: var(--z-modal); }
.modal-backdrop.open { opacity: 1; pointer-events: auto; }
.modal { width: min(460px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--r-sheet); padding: 20px; transform: scale(0.97); transition: transform 200ms var(--ease); max-height: 90vh; overflow-y: auto; }
.modal-backdrop.open .modal { transform: none; }

/* ===== Toast ===== */
.toast-stack { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 6px; z-index: var(--z-toast); pointer-events: none; }
.toast { background: var(--overlay); border: 1px solid var(--border-strong); color: var(--ink); padding: 10px 14px; border-radius: var(--r-ctl); font-size: 12.5px; animation: toastIn 200ms var(--ease); box-shadow: 0 6px 20px oklch(0 0 0 / 0.35); max-width: 340px; pointer-events: auto; }
.toast.t-err { border-color: var(--rejected); color: var(--rejected); }
.toast-undo { display: flex; align-items: center; gap: 8px; }
.toast-undo button { background: var(--accent); color: var(--accent-ink); border: 0; padding: 4px 10px; border-radius: var(--r-ctl); font-size: 11px; font-weight: 600; cursor: pointer; }

/* ===== Canvas ===== */
.canvas-stage { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); height: calc(100vh - 250px); min-height: 400px; overflow: hidden; cursor: grab; }
.canvas-stage:active { cursor: grabbing; }
.canvas-inner { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.canvas-edges { position: absolute; top: 0; left: 0; pointer-events: none; }
.canvas-edge { stroke: color-mix(in oklch, var(--accent) 25%, var(--border-strong)); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.canvas-node { position: absolute; translate: -50% -50%; padding: 5px 10px; min-height: 24px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; background: var(--elevated); border: 1.5px solid var(--border-strong); border-radius: 999px; font-size: 11.5px; font-weight: 500; color: var(--ink); cursor: pointer; white-space: nowrap; transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease); }
.canvas-node:hover, .canvas-node:focus-visible { border-color: var(--accent); background: var(--accent-tint); }
.canvas-node.s-active { border-color: var(--active); color: var(--active); }
.canvas-node.s-consumed { border-color: var(--consumed); color: var(--consumed); }
.canvas-node.s-rejected { border-color: var(--rejected); color: var(--rejected); }
.canvas-node.dim { opacity: 0.25; }
.canvas-node.focused { border-color: var(--accent); background: var(--accent-tint); z-index: 2; }
.canvas-ctrls { position: absolute; bottom: 12px; right: 12px; display: flex; gap: 4px; z-index: 5; }
.canvas-btn { width: 32px; height: 32px; background: var(--elevated); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink); display: grid; place-items: center; font-size: 14px; }
.canvas-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-tint); }
.canvas-search { position: absolute; top: 12px; left: 12px; width: 220px; z-index: 5; }

/* ===== Branches ===== */
.branch-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.branch-card { padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); cursor: pointer; }
.branch-card:hover { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 4%, var(--surface)); }
.branch-card .bc-id { font-family: var(--font-mono); font-size: 10px; color: var(--accent); }
.branch-card .bc-label { font-size: 13.5px; font-weight: 600; margin-top: 3px; }
.branch-card .bc-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 4px; }

/* ===== Log / Journal ===== */
.digest { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 20px 24px; margin-bottom: 24px; max-width: 880px; }
.digest-date { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
.digest-day { font-size: 12px; color: var(--ink-3); margin-bottom: 12px; margin-top: 3px; }
.digest-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.digest-section-title { font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.digest-item { font-size: 13px; padding: 4px 0; display: flex; gap: 8px; align-items: center; }
.digest-item a { color: var(--ink); }
.digest-item a:hover { color: var(--accent); }


/* ===== Streak Gamification ===== */
.stat-streak.streak-hot { border-color: var(--consumed); background: color-mix(in oklch, var(--consumed) 6%, var(--surface)); }
.stat-streak.streak-hot .s-value { color: var(--consumed); }
.streak-nudge {
  background: color-mix(in oklch, var(--consumed) 8%, var(--surface));
  border: 1px solid color-mix(in oklch, var(--consumed) 25%, var(--border));
  border-radius: var(--r-card);
  padding: 16px 20px;
  margin-bottom: 20px;
  max-width: 880px;
}
.streak-nudge-text { font-size: 14px; font-weight: 600; color: var(--ink); }
.streak-nudge-sub { font-size: 12px; color: var(--ink-2); margin-top: 4px; }
.heatmap-wrap { overflow-x: auto; padding: 8px 0 14px; }
.heatmap { display: flex; gap: 3px; }
.heatmap-col { display: flex; flex-direction: column; gap: 3px; }
.heatmap-cell { width: 11px; height: 11px; border-radius: 2px; background: var(--elevated); }
.heatmap-cell.l1 { background: color-mix(in oklch, var(--consumed) 25%, var(--elevated)); }
.heatmap-cell.l2 { background: color-mix(in oklch, var(--consumed) 48%, var(--elevated)); }
.heatmap-cell.l3 { background: color-mix(in oklch, var(--consumed) 70%, var(--elevated)); }
.heatmap-cell.l4 { background: var(--consumed); }
.heatmap-months { display: flex; gap: 3px; margin-bottom: 3px; font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); }
.heatmap-months > span { width: 11px; text-align: center; }

/* ===== Vault ===== */
.vault-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.vault-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.vault-toggle {
  display: inline-flex;
  gap: 2px;
  background: var(--elevated);
  border-radius: 8px;
  padding: 3px;
  border: 1px solid var(--border);
}
.vault-toggle-btn {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 150ms var(--ease);
}
.vault-toggle-btn:hover { color: var(--ink-2); }
.vault-toggle-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.06);
}
.vault-toggle-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

.vault-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}
.vault-card {
  background: var(--surface);
  border-radius: 12px;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  transition: box-shadow 200ms var(--ease), transform 200ms var(--ease), background 200ms var(--ease);
  animation: rise 350ms var(--ease) both;
  cursor: default;
}
.vault-card:hover {
  background: var(--surface-hov);
  box-shadow: 0 4px 20px oklch(0 0 0 / 0.05);
  transform: translateY(-2px);
}
.vault-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin-bottom: 4px;
  font-family: 'Inter', sans-serif;
}
.vault-card-icon.md { background: var(--ink-2-bg); color: var(--ink-2); }
.vault-card-icon.pdf { background: var(--rejected-bg); color: var(--rejected); }
.vault-card-icon.code { background: var(--accent-bg); color: var(--accent); }
.vault-card-icon.file { background: var(--elevated); color: var(--ink-3); }
.vault-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
  line-height: 1.3;
}
.vault-card-desc {
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.9em;
}

/* ===== Vault Card Preview ===== */
.vault-card-preview {
  height: 0;
  overflow: hidden;
  border-radius: 4px;
  margin-top: 4px;
  transition: height 300ms var(--ease), opacity 200ms var(--ease);
  opacity: 0;
  background: var(--bg);
  border: 1px solid var(--border);
}
.vault-card:hover .vault-card-preview {
  height: 120px;
  opacity: 1;
}
.vault-card-preview iframe {
  width: 100%;
  height: 100%;
  border: none;
  pointer-events: none;
  transform: scale(0.5);
  transform-origin: top left;
  width: 200%;
  height: 200%;
}
.vault-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 6px;
  min-height: 28px;
}
.vault-card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.vault-card-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--elevated);
  color: var(--ink-2);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.vault-card-del {
  font-size: 11px;
  color: var(--ink-3);
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 150ms, background 150ms;
  flex-shrink: 0;
}
.vault-card-del:hover {
  color: oklch(0.55 0.18 25);
  background: oklch(0.55 0.18 25 / 0.08);
}

/* Vault list view (fallback) */
.vault-list-wrap { display: flex; flex-direction: column; }
.vault-list-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface);
  margin-bottom: 2px;
}
.vault-list-row:hover { background: var(--surface-hov); }
.vault-list-row:first-child { border-radius: 10px 10px 0 0; }
.vault-list-row:last-child { border-radius: 0 0 10px 10px; border-bottom: 0; }
.vault-list-name { font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.vault-list-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 2px; }
.vault-list-actions { display: flex; gap: 6px; align-items: center; }

@media (max-width: 720px) {
  .vault-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .vault-card { padding: 14px; }
  .vault-head { flex-direction: column; align-items: flex-start; gap: 10px; }
}

/* ===== Palette ===== */
.palette-backdrop { position: fixed; inset: 0; background: oklch(0.03 0.01 240 / 0.45); opacity: 0; pointer-events: none; transition: opacity 150ms var(--ease); z-index: var(--z-palette); display: grid; place-items: start center; padding-top: 12vh; }
.palette-backdrop.open { opacity: 1; pointer-events: auto; }
.palette { width: min(580px, calc(100vw - 32px)); background: var(--overlay); border: 1px solid var(--border-strong); border-radius: var(--r-sheet); box-shadow: 0 16px 48px oklch(0 0 0 / 0.4); overflow: hidden; transform: scale(0.97) translateY(-8px); transition: transform 200ms var(--ease); max-height: 75vh; display: flex; flex-direction: column; }
.palette-backdrop.open .palette { transform: none; }
.palette-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); background: var(--elevated); }
.palette-input { flex: 1; border: 0; background: transparent; font-size: 14px; color: var(--ink); padding: 0; }
.palette-input::placeholder { color: var(--ink-3); }
.palette-body { max-height: 360px; overflow-y: auto; padding: 6px 0; }
.palette-item { display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; color: var(--ink); }
.palette-item:hover, .palette-item.highlighted { background: var(--accent-tint); }
.palette-item .pi-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-item .pi-meta { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); }

/* ===== Empty / Skeleton ===== */
.empty { padding: 60px 24px; text-align: center; color: var(--ink-3); font-size: 13px; max-width: 380px; margin: 40px auto; line-height: 1.5; }
.empty .e-title { font-size: 15px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
.empty .btn { margin-top: 14px; }
.loading-skeleton { max-width: var(--content-w); }
.skel { background: linear-gradient(90deg, var(--surface) 25%, var(--elevated) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: var(--r-card); }
.skel-row { height: 60px; margin-bottom: 8px; }

/* ===== FAB ===== */
.fab { position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); border: 0; cursor: pointer; z-index: var(--z-fab); display: grid; place-items: center; box-shadow: 0 4px 16px color-mix(in oklch, var(--accent) 35%, transparent); transition: transform var(--dur) var(--ease); }
.fab:hover { transform: scale(1.06); }
.fab svg { width: 20px; height: 20px; }

/* ===== Topbar search ===== */
.topbar-search { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-ctl); color: var(--ink-3); font-size: 12px; }
.topbar-search:hover { border-color: var(--border-strong); color: var(--ink-2); }
.topbar-search kbd { font-family: var(--font-mono); font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--elevated); color: var(--ink-2); border: 1px solid var(--border); }

/* ===== Misc ===== */
.sec-title { font-size: 12px; font-weight: 600; color: var(--ink-2); margin: 24px 0 10px; display: flex; align-items: center; gap: 6px; }
.sec-title .count { font-weight: 400; font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); }
.mono { font-family: var(--font-mono); }
.muted { color: var(--ink-2); }
.dim { color: var(--ink-3); }

/* ===== Nav badges ===== */
.nav-badge { position: absolute; top: 3px; right: 3px; min-width: 14px; height: 14px; padding: 0 3px; background: var(--rejected); color: var(--bg); border-radius: 7px; font-size: 9px; font-weight: 700; font-family: var(--font-mono); display: grid; place-items: center; line-height: 1; }

/* ===== Batch bar ===== */
.batch-bar { position: fixed; bottom: -60px; left: 50%; translate: -50% 0; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--overlay); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: 0 8px 28px oklch(0 0 0 / 0.4); z-index: var(--z-batch); transition: bottom 250ms var(--ease); }
.batch-bar.open { bottom: 24px; }
.batch-count { font-size: 12px; font-weight: 600; color: var(--ink); font-family: var(--font-mono); }
.batch-actions { display: flex; gap: 6px; }

/* ===== Key map ===== */
.kbd-table { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
.kbd-row { display: flex; align-items: center; gap: 8px; }
.kbd-row .kbd-keys { display: flex; gap: 3px; min-width: 100px; }
.kbd-row .kbd-desc { font-size: 12.5px; color: var(--ink-2); }
.kbd-keys kbd { font-family: var(--font-mono); font-size: 10px; padding: 2px 6px; border-radius: 3px; background: var(--bg); color: var(--ink); border: 1px solid var(--border); }

/* ===== Motion ===== */
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -200% 0; } }

/* ===== Responsive ===== */
@media (max-width: 720px) {
  body { flex-direction: column; }
  .sidebar { width: 100%; height: 54px; flex-direction: row; order: 2; border-right: 0; border-top: 1px solid var(--border); padding: 0 6px; position: fixed; bottom: 0; left: 0; right: 0; z-index: var(--z-sticky); }
  .sidebar-brand { display: none; }
  .sidebar-nav { flex-direction: row; flex: 1; justify-content: space-around; }
  .nav-btn { width: 52px; height: 44px; }
  .nav-btn.active::before { left: 50%; top: -1px; translate: -50% 0; width: 20px; height: 2px; }
  .sidebar-foot { margin-top: 0; }
  .workspace { height: calc(100vh - 54px); }
  .ws-head { padding: 14px 16px 8px; flex-direction: column; align-items: flex-start; }
  .ws-subnav { padding: 6px 16px; overflow-x: auto; }
  .ws-body { padding: 14px 16px 80px; }
  .filters-bar { padding: 6px 16px; }
  .sheet { width: 100vw; border-left: 0; border-top: 1px solid var(--border); top: auto; height: 85vh; border-radius: var(--r-sheet) var(--r-sheet) 0 0; transform: translateY(100%); }
  .sheet.open { transform: none; }
  .queue-card { flex-wrap: wrap; }
  .q-actions { width: 100%; justify-content: flex-end; margin-top: 4px; }
  .queue-stats { grid-template-columns: repeat(2, 1fr); }
  .fab { right: 16px; bottom: 68px; }
  .batch-bar.open { bottom: 68px; }
  .toast-stack { bottom: 68px; right: 12px; left: 12px; }
  .kbd-table { grid-template-columns: 1fr; }
  h1 { font-size: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

/* ===== Activity Feed ===== */
.activity-feed { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: var(--r-card); overflow: hidden; }
.activity-entry { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.activity-entry:last-child { border-bottom: 0; }
.activity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.activity-dot.activity-kind-feedback { background: #f59e0b; }
.activity-dot.activity-kind-tree_change { background: var(--accent); }
.activity-dot.activity-kind-pattern { background: #22c55e; }
.activity-dot.activity-kind-note { background: var(--ink-3); }
.activity-dot.activity-kind-system { background: var(--ink-3); opacity: 0.5; }
.activity-time { font-family: var(--font-mono); font-size: 10px; color: var(--ink-3); min-width: 32px; }
.activity-kind { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
.activity-kind.activity-kind-feedback { background: color-mix(in oklch, #f59e0b 15%, transparent); color: #f59e0b; }
.activity-kind.activity-kind-tree_change { background: var(--accent-tint); color: var(--accent); }
.activity-kind.activity-kind-pattern { background: color-mix(in oklch, #22c55e 15%, transparent); color: #22c55e; }
.activity-kind.activity-kind-note { background: var(--elevated); color: var(--ink-2); }
.activity-kind.activity-kind-system { background: var(--elevated); color: var(--ink-3); }
.activity-summary { flex: 1; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity-details { padding: 8px 12px; background: var(--bg); font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }
.activity-toggle { flex-shrink: 0; }

/* ===== Topic Filter ===== */
.topic-filter-bar { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 12px; color: var(--ink-2); }
.topic-filter-label { font-weight: 500; color: var(--ink-3); }
.topic-filter-active { background: var(--accent-tint) !important; color: var(--accent) !important; border-color: transparent !important; }

/* ===== Week Summary ===== */
.week-summary { display: flex; gap: 16px; padding: 10px 0; font-size: 12px; color: var(--ink-2); border-top: 1px solid var(--border); margin-top: 8px; }
.week-summary-label { font-weight: 600; color: var(--ink); margin-right: 4px; }

/* ===== Recent Vault ===== */
.vault-recent { margin-top: 8px; }
.vault-recent .sec-title { margin-top: 0; margin-bottom: 8px; }

/* ===== Heatmap Controls ===== */
.heatmap-controls { display: flex; gap: 4px; margin-bottom: 8px; }

/* ===== Heatmap Legend ===== */
.heatmap-legend { display: flex; align-items: center; gap: 3px; margin-top: 8px; font-size: 10px; color: var(--ink-3); }
.heatmap-legend span { display: inline-block; }
.hm-legend-cell { width: 11px; height: 11px; border-radius: 2px; background: var(--elevated); display: inline-block; }
.hm-legend-cell.l1 { background: color-mix(in oklch, var(--consumed) 25%, var(--elevated)); }
.hm-legend-cell.l2 { background: color-mix(in oklch, var(--consumed) 48%, var(--elevated)); }
.hm-legend-cell.l3 { background: color-mix(in oklch, var(--consumed) 70%, var(--elevated)); }
.hm-legend-cell.l4 { background: var(--consumed); }

/* ===== Trend Cards ===== */
.trend-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 14px 18px; margin-bottom: 12px; }
.trend-card .chart-title { margin-bottom: 10px; }
.trend-row { display: flex; gap: 24px; }
.trend-stat { display: flex; flex-direction: column; gap: 2px; }
.trend-label { font-size: 11px; color: var(--ink-3); }
.trend-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
.trend-value.c-consumed { color: var(--consumed); }
.trend-value.c-rejected { color: var(--rejected); }

/* ===== Responsive ===== */
@media (max-width: 720px) {
  .trend-row { gap: 12px; flex-wrap: wrap; }
  .trend-stat { min-width: 60px; }
  .activity-entry { flex-wrap: wrap; gap: 4px; }
  .heatmap-legend { gap: 2px; }
}
`;