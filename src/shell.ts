export const htmlShell = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Taste Map</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0d9182" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f8f9fb" media="(prefers-color-scheme: light)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Taste Map">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%233dd6c6'/></svg>">
<link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%233dd6c6'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" crossorigin>
<style>/* Prevent FOUT */ html{font-family:var(--font-ui)}</style>
<link rel="stylesheet" href="/static/app.css?v=17">
</head>
<body data-theme="dark">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand" title="Taste Map">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-btn" data-ws="curate" aria-label="Curate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
        <span class="nav-label">Curate</span>
        <span class="nav-badge" id="nav-badge-curate" hidden>0</span>
      </button>
      <button class="nav-btn" data-ws="map" aria-label="Map">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="m13.5 10.5 4-4M10.5 10.5l-4-4M13.5 13.5l4 4M10.5 13.5l-4 4"/></svg>
        <span class="nav-label">Map</span>
      </button>
      <button class="nav-btn" data-ws="map" data-sub="profile" aria-label="Profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span class="nav-label">Profile</span>
      </button>
      <button class="nav-btn" data-ws="log" aria-label="Log">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
        <span class="nav-label">Log</span>
      </button>
      <button class="nav-btn" data-ws="vault" aria-label="Vault">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="nav-label">Vault</span>
        <span class="nav-badge" id="nav-badge-vault" hidden>0</span>
      </button>
    </nav>
    <div class="sidebar-foot">
      <button class="nav-btn nav-icon-only" id="theme-btn" aria-label="Toggle theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </button>
    </div>
  </aside>

  <main class="workspace" id="workspace">
    <header class="ws-head">
      <div class="ws-title">
        <h1 id="ws-name">Curate</h1>
        <p id="ws-sub" class="ws-sub">Your queue of things to consume</p>
      </div>
      <div class="ws-actions" id="ws-actions"></div>
    </header>

    <div class="ws-subnav" id="ws-subnav"></div>
    <div class="filters-bar" id="filters-bar" hidden></div>
    <div class="ws-body" id="ws-body">
      <div class="loading-skeleton">
        <div class="skel skel-row"></div>
        <div class="skel skel-row"></div>
        <div class="skel skel-row"></div>
        <div class="skel skel-row skel-short"></div>
      </div>
    </div>
  </main>

  <div class="sheet-backdrop" id="sheet-backdrop"></div>
  <aside class="sheet" id="sheet" role="dialog" aria-modal="true"></aside>

  <div class="modal-backdrop" id="modal-backdrop">
    <div class="modal" id="modal" role="dialog" aria-modal="true"></div>
  </div>

  <div class="palette-backdrop" id="palette-backdrop">
    <div class="palette" id="palette" role="dialog" aria-modal="true">
      <div class="palette-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;flex-shrink:0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="palette-input" id="palette-input" type="text" placeholder="Search recs, nodes, vault, patterns…" autocomplete="off" spellcheck="false" aria-label="Search across recs, nodes, vault, and patterns">
        <span class="palette-hint" title="Close search (ESC)">ESC to close</span>
      </div>
      <div class="palette-body" id="palette-body">
        <div class="palette-empty">Type to search recs, brain nodes, vault files, and patterns</div>
      </div>
    </div>
  </div>

  <div class="batch-bar" id="batch-bar" role="region" aria-label="Bulk actions for selected items">
    <span class="batch-count" id="batch-count" aria-live="polite">0 selected</span>
    <div class="batch-actions">
      <button class="btn btn-sm" id="batch-consumed" title="Mark all selected as consumed and log a review">Mark done</button>
      <button class="btn btn-sm" id="batch-reject" title="Reject all selected — they will not be resurfaced">Reject</button>
      <button class="btn btn-sm btn-ghost" id="batch-clear" title="Clear selection">Clear</button>
    </div>
  </div>

  <div class="toast-stack" id="toast-stack"></div>

  <button class="fab" id="fab-new" aria-label="New entry" title="New entry (n)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>

    <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
    <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})}</script>
    <script src="/static/app.js?v=27"></script>
</body>
</html>`;
