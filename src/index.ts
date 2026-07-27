import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  API_TOKEN?: string
}

type Recommendation = {
  id: string
 video_title: string
 creator: string | null
  content_type: string | null
 video_url: string
  why_this: string | null
  verified: string | null
  status: 'active' | 'consumed' | 'rejected'
  user_rating: string | null
  user_review: string | null
  dedup_key: string
  synergy_bundle_id: string | null
  consumed_date: string | null
  created_at: string
}

// ---- Validation helpers ----
const VALID_STATUS = new Set(['active', 'consumed', 'rejected'])
const VALID_RATINGS = new Set(['unset', 'love', 'like', 'meh', 'dislike'])
const isValidUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length > 0 && u.length < 2048 &&
  /^https?:\/\/[^\s<>"']+$/i.test(u)
const isNonEmptyStr = (v: unknown, max = 5000): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const app = new Hono<{ Bindings: Bindings }>()

// Tighten CORS: only same-origin reads by default; API is same-origin so '*' is fine for read
// but writes require the API token.
app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

// Cache-Control for GET/HEAD responses (5 min CDN, 60s browser)
// Skip endpoints that explicitly set their own Cache-Control (e.g. /html/list, /stats)
app.use('/*', async (c, next) => {
  await next()
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    const path = new URL(c.req.url).pathname
    const skip = path === '/html/list' || path === '/stats' || path === '/recommendations/list'
    const already = c.res.headers.get('Cache-Control')
    if (!skip && !already) {
      c.res.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300')
    }
  }
})

app.get('/health', (c) => c.json({ ok: true, now: new Date().toISOString() }))

// Body size cap: reject requests larger than 10 MB to prevent DoS via large uploads
app.use('/*', async (c, next) => {
  const cl = c.req.header('content-length')
  if (cl && Number(cl) > 10 * 1024 * 1024) {
    return c.json({ error: 'Payload too large' }, 413)
  }
  await next()
})

// Auth: require X-API-Token for all write endpoints (POST/PUT/PATCH/DELETE)
app.use('/*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next()
  const token = c.req.header('x-api-token') || c.req.query('token')
  const expected = c.env.API_TOKEN
  // If no token configured, allow (dev mode); otherwise enforce.
  if (expected && token !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
})

// Sanitize error responses — never leak raw SQL/DB messages
const safeError = (fallback: string) => (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[err]', msg)
  return { error: fallback }
}

const htmlPage = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Taste Map — Engine</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%236365f1'/><text x='8' y='13' text-anchor='middle' font-size='12' font-weight='bold' fill='white'>T</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
   :root {
     /* Deep, rich dark mode */
    --bg-base: oklch(0.12 0.012 200);
    --bg-surface: oklch(0.16 0.018 200);
    --bg-surface-hover: oklch(0.20 0.022 200);
    
    --border-subtle: oklch(0.23 0.012 200);
    --border-strong: oklch(0.32 0.012 200);

    --ink-primary: oklch(0.98 0 0);
    --ink-secondary: oklch(0.72 0.012 200);
    --ink-tertiary: oklch(0.52 0.012 200);

    /* Accent & States */
    --accent: oklch(0.65 0.16 185);
    --accent-hover: oklch(0.70 0.16 185);
    
    --state-active: oklch(0.72 0.18 80);
    --state-consumed: oklch(0.62 0.16 170);
    --state-rejected: oklch(0.58 0.18 22);

     --radius-sm: 4px;
     --radius-md: 8px;
     --radius-lg: 12px;
   }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation-duration: 0.2s;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-base);
      color: var(--ink-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      -webkit-font-smoothing: antialiased;
      overflow-y: scroll;
    }

    /* Top Navigation Bar */
    .topbar {
      width: 100%;
      background: var(--bg-base);
      border-bottom: 1px solid var(--border-subtle);
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      justify-content: center;
      padding: 0 24px;
    }

    .topbar-content {
      width: 100%;
      max-width: 960px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      font-size: 15px;
      letter-spacing: -0.01em;
    }
    .brand-icon {
      width: 24px;
      height: 24px;
      background: var(--accent);
      color: var(--bg-base);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    /* Buttons */
    .btn {
      appearance: none;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ink-primary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
      text-decoration: none;
    }

    .btn-primary {
      background: var(--accent);
      color: var(--bg-base);
    }
    .btn-primary:hover { background: oklch(0.9 0 0); }

    .btn-outline {
      border-color: var(--border-subtle);
      color: var(--ink-secondary);
    }
    .btn-outline:hover {
      border-color: var(--border-strong);
      color: var(--ink-primary);
    }

    .btn-ghost { color: var(--ink-secondary); }
    .btn-ghost:hover { background: var(--bg-surface); color: var(--ink-primary); }

    /* Main Container */
    .container {
      width: 100%;
      max-width: 960px;
      padding: 40px 24px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* Header Section */
    .page-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .page-title {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .page-subtitle {
      font-size: 14px;
      color: var(--ink-secondary);
    }

    /* Filters & Search */
    .controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 16px;
    }

    .tabs {
      display: flex;
      gap: 20px;
    }
    .tab {
      background: none;
      border: none;
      color: var(--ink-secondary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      padding-bottom: 16px;
      margin-bottom: -17px;
      border-bottom: 2px solid transparent;
      transition: color 0.15s;
    }
    .tab:hover { color: var(--ink-primary); }
    .tab.active {
      color: var(--ink-primary);
      border-bottom-color: var(--accent);
    }
    .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-surface);
      color: var(--ink-secondary);
      border-radius: 12px;
      padding: 0 8px;
      font-size: 11px;
      margin-left: 6px;
      height: 20px;
    }
    .tab.active .tab-count { background: var(--border-subtle); color: var(--ink-primary); }

    .search-box {
      position: relative;
      width: 240px;
    }
    .search-input {
      width: 100%;
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      color: var(--ink-primary);
      font-family: inherit;
      font-size: 13px;
      padding: 8px 12px 8px 32px;
      border-radius: var(--radius-sm);
      outline: none;
      transition: border-color 0.15s;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      display: flex; align-items: center; justify-content: center;
      opacity: 0.5;
    }

    /* Filter toolbar */
    .filter-toggle {
      display: flex; align-items: center; gap: 6px;
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      color: var(--ink-secondary);
      font-family: inherit; font-size: 13px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s;
      position: relative;
    }
    .filter-toggle:hover { border-color: var(--accent); color: var(--ink-primary); }
    .filter-toggle.active { border-color: var(--accent); color: var(--accent); }
    .filter-badge {
      background: var(--accent);
      color: white;
      font-size: 10px; font-weight: 700;
      padding: 1px 6px;
      border-radius: 8px;
      min-width: 16px; text-align: center;
    }
    .sort-select {
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      color: var(--ink-primary);
      font-family: inherit; font-size: 13px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      outline: none;
    }
    .sort-select:focus { border-color: var(--accent); }
    .filter-panel {
      display: none;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 16px;
      margin-bottom: 16px;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      align-items: end;
    }
    .filter-panel.open { display: grid; }
    .filter-group { display: flex; flex-direction: column; gap: 4px; }
    .filter-group label {
      font-size: 11px; font-weight: 600;
      color: var(--ink-tertiary);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .filter-group select, .filter-group input {
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      color: var(--ink-primary);
      font-family: inherit; font-size: 13px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      outline: none;
    }
    .filter-group select:focus, .filter-group input:focus { border-color: var(--accent); }
    .filter-clear {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--ink-secondary);
      font-family: inherit; font-size: 12px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      align-self: end;
    }
    .filter-clear:hover { color: var(--ink-primary); border-color: var(--ink-secondary); }

    /* List Layout */
    .list {
      display: flex;
      flex-direction: column;
    }

   .row {
     display: grid;
     grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 16px 12px;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.15s ease;
      contain: content;
    }
    .row:hover { background: var(--bg-surface); }
    
    .row-header {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto;
      gap: 16px;
      padding: 0 12px 12px 12px;
      border-bottom: 1px solid var(--border-subtle);
      
      font-size: 12px;
      font-weight: 500;
      color: var(--ink-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .cell-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--ink-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cell-subtitle {
      display: flex; align-items: center; justify-content: center;
      color: var(--ink-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .cell-meta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--ink-tertiary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .status-active { background: var(--state-active); box-shadow: 0 0 8px rgba(255,190,50,0.3); }
    .status-consumed { background: var(--state-consumed); }
    .status-rejected { background: var(--state-rejected); }

    .title-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .row-actions {
      display: flex;
      gap: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .row:hover .row-actions { opacity: 1; pointer-events: auto; }
    
    /* When touch device or narrow screen, always show actions */
    @media (max-width: 768px) {
      .row-actions { opacity: 1; pointer-events: auto; }
      .row { grid-template-columns: 1fr; gap: 12px; }
      .row-header { display: none; }
      .cell-title { white-space: normal; }
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(10, 10, 12, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    .modal-backdrop.open { opacity: 1; pointer-events: auto; }

    .modal {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 480px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      transform: translateY(10px) scale(0.98);
      transition: transform 0.2s ease;
    }
    .modal-backdrop.open .modal { transform: translateY(0) scale(1); }

    .modal-title { font-size: 16px; font-weight: 600; }
    .modal.modal-wide { max-width: 900px; max-height: 90vh; }
    .modal.modal-wide .form-textarea { min-height: 420px; }
    
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-label { display: flex; align-items: center; justify-content: center; font-weight: 500; color: var(--ink-secondary); }
    .form-input, .form-textarea {
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-family: inherit;
      font-size: 13px;
      color: var(--ink-primary);
      outline: none;
      transition: border-color 0.15s;
    }
    .form-input:focus, .form-textarea:focus { border-color: var(--accent); }
    .form-textarea { resize: vertical; min-height: 80px; }

    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

    .empty {
      padding: 64px 20px;
      text-align: center;
      color: var(--ink-tertiary);
      font-size: 14px;
    }

    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      padding: 12px 16px;
      border-radius: var(--radius-md);
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      transform: translateY(20px);
      opacity: 0;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1100;
    }
    .toast.show { transform: translateY(0); opacity: 1; }

    /* ====== STATS DASHBOARD ====== */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; display: flex; flex-direction: column; gap: 4px; }
    .stat-card .label { display: flex; align-items: center; justify-content: center; font-weight: 500; color: var(--ink-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-card .value { font-size: 32px; font-weight: 600; letter-spacing: -0.02em; }
    .stat-card .sub { display: flex; align-items: center; justify-content: center; color: var(--ink-secondary); margin-top: 2px; }
    .stat-card.accent { border-color: var(--accent); }
    .stat-card.gold .value { color: var(--state-active); }
    .stat-card.green .value { color: var(--state-consumed); }
    .stat-card.red .value { color: var(--state-rejected); }

    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .section-title .badge { font-size: 11px; background: var(--bg-surface); color: var(--ink-secondary); padding: 2px 8px; border-radius: 12px; font-weight: 500; }

    .bar-chart { display: flex; flex-direction: column; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 1fr 3fr 40px; align-items: center; gap: 12px; }
    .bar-row .bar-label { display: flex; align-items: center; justify-content: center; color: var(--ink-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-row .bar-track { height: 20px; background: var(--bg-base); border-radius: 4px; overflow: hidden; position: relative; }
    .bar-row .bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.16,1,0.3,1); min-width: 2px; }
    .bar-row .bar-fill.gold { background: var(--state-active); }
    .bar-row .bar-fill.green { background: var(--state-consumed); }
    .bar-row .bar-fill.red { background: var(--state-rejected); }
    .bar-row .bar-fill.accent { background: var(--accent); }
    .bar-row .bar-count { display: flex; align-items: center; justify-content: center; font-weight: 500; color: var(--ink-primary); text-align: right; font-family: 'JetBrains Mono', monospace; }

    .mini-chart { display: flex; align-items: flex-end; gap: 4px; height: 48px; padding: 4px 0; }
    .mini-chart .col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
    .mini-chart .col .bar { width: 100%; border-radius: 2px; background: var(--state-consumed); transition: height 0.6s cubic-bezier(0.16,1,0.3,1); min-height: 2px; }
    .mini-chart .col .bar-label { font-size: 8px; color: var(--ink-tertiary); white-space: nowrap; }

    .bundle-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .bundle-chip { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px; padding: 6px 14px; display: flex; align-items: center; justify-content: center; display: flex; align-items: center; gap: 8px; }
    .bundle-chip .bc-count { background: var(--bg-base); border-radius: 12px; padding: 0 6px; font-size: 11px; color: var(--ink-tertiary); font-family: 'JetBrains Mono', monospace; }

    .prompt-box { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; position: relative; }
    .prompt-box pre { font-family: 'JetBrains Mono', monospace; display: flex; align-items: center; justify-content: center; line-height: 1.5; color: var(--ink-secondary); white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
    .prompt-box .copy-btn { position: absolute; top: 8px; right: 8px; }

    .insight-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .insight-tag { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 10px; font-size: 11px; color: var(--ink-secondary); }

    .rating-dist { display: flex; flex-wrap: wrap; gap: 8px; }
    .rating-item { background: var(--bg-base); border-radius: var(--radius-sm); padding: 8px 12px; text-align: center; min-width: 70px; }
    .rating-item .rv { font-size: 16px; font-weight: 600; }
    .rating-item .rl { font-size: 10px; color: var(--ink-tertiary); margin-top: 2px; }

    .consumed-list, .active-list { display: flex; flex-direction: column; gap: 4px; }
    .consumed-item, .active-item { padding: 8px 12px; border-radius: var(--radius-sm); background: var(--bg-base); border-left: 3px solid transparent; display: flex; align-items: center; justify-content: center; }
    .consumed-item { border-left-color: var(--state-consumed); }
    .active-item { border-left-color: var(--state-active); }
    .consumed-item .ci-title, .active-item .ai-title { font-weight: 500; color: var(--ink-primary); }
    .consumed-item .ci-meta, .active-item .ai-meta { font-size: 11px; color: var(--ink-tertiary); margin-top: 2px; }
    .consumed-item .ci-review { font-size: 11px; color: var(--accent); font-style: italic; margin-top: 2px; }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

    .export-btn-group { display: flex; gap: 8px; }
    .tab-stats-toggle { display: flex; gap: 4px; margin-bottom: 16px; }
    .tab-stats-toggle button { background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--ink-secondary); display: flex; align-items: center; justify-content: center; padding: 6px 14px; cursor: pointer; font-family: inherit; border-radius: 4px; transition: all 0.15s; }
    .tab-stats-toggle button.active { background: var(--accent); color: var(--bg-base); border-color: var(--ink-primary); }

    /* ====== CONTRIBUTION HEATMAP ====== */
    .heatmap-wrap { overflow-x: auto; padding: 8px 0; }
    .heatmap { display: flex; gap: 3px; }
    .heatmap-col { display: flex; flex-direction: column; gap: 3px; }
    .heatmap-cell { width: 12px; height: 12px; border-radius: 2px; background: var(--bg-surface); transition: background 0.15s; cursor: default; position: relative; }
    .heatmap-cell:hover { outline: 2px solid var(--ink-primary); z-index: 1; }
    .heatmap-cell.l0 { background: var(--bg-surface); }
    .heatmap-cell.l1 { background: oklch(0.30 0.08 150); }
    .heatmap-cell.l2 { background: oklch(0.40 0.12 150); }
    .heatmap-cell.l3 { background: oklch(0.50 0.16 150); }
    .heatmap-cell.l4 { background: oklch(0.60 0.18 150); }
    .heatmap-tooltip { position: fixed; background: var(--accent); color: var(--bg-base); font-size: 11px; font-weight: 500; padding: 6px 10px; border-radius: 4px; pointer-events: none; z-index: 2000; white-space: nowrap; opacity: 0; transition: opacity 0.15s; }
    .heatmap-tooltip.show { opacity: 1; }

    /* ====== DAY DETAIL MODAL ====== */
    .day-detail { display: flex; flex-direction: column; gap: 12px; }
    .day-detail .dd-header { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .day-detail .dd-count { display: flex; align-items: center; justify-content: center; color: var(--ink-secondary); }
    .topic-chip { display: inline-flex; align-items: center; background: var(--bg-base); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 6px 14px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .topic-chip.t0 { border-left: 3px solid var(--state-consumed); }
    .topic-chip.t1 { border-left: 3px solid var(--accent); }
    .topic-chip.t2 { border-left: 3px solid var(--state-active); }
    .topic-chip.t3 { border-left: 3px solid var(--state-rejected); }
    .topic-chip .tc-del { cursor: pointer; opacity: 0.4; font-size: 14px; line-height: 1; }
    .topic-chip .tc-del:hover { opacity: 1; }
    .day-detail-empty { color: var(--ink-tertiary); font-size: 13px; text-align: center; padding: 20px; }

    /* ====== RECENT ENTRIES ====== */
    .learning-entries { margin-top: 24px; }
    .entry-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
    .entry-card .ec-date { display: flex; align-items: center; justify-content: center; font-weight: 500; color: var(--ink-tertiary); min-width: 80px; font-family: 'JetBrains Mono', monospace; }
    .entry-card .ec-count { font-size: 14px; font-weight: 600; min-width: 24px; text-align: center; color: var(--state-consumed); font-family: 'JetBrains Mono', monospace; }
    .entry-card .ec-topics { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
    .entry-card .ec-topics .mini-topic { font-size: 11px; background: var(--bg-base); padding: 2px 8px; border-radius: 10px; color: var(--ink-secondary); }
    .entry-card .ec-del { cursor: pointer; opacity: 0.3; font-size: 16px; transition: opacity 0.15s; background: none; border: none; color: var(--ink-secondary); font-family: inherit; }
    .entry-card .ec-del:hover { opacity: 1; color: var(--state-rejected); }

    /* ====== WEEK SUMMARY ====== */
    .week-summary { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin: 16px 0; }
    .week-day { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 6px; text-align: center; }
    .week-day .wd-name { font-size: 10px; color: var(--ink-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
    .week-day .wd-count { font-size: 18px; font-weight: 600; margin: 4px 0; }
    .week-day .wd-count.wd0 { color: var(--ink-tertiary); }
    .week-day .wd-count.wd1 { color: var(--state-consumed); }
    .week-day .wd-count.wd2 { color: var(--state-active); }
    .week-day .wd-count.wd3 { color: var(--accent); }
    .week-day.today { border-color: var(--accent); }

    /* ====== GLOW / POLISH ====== */
    .stat-card.glow { border-color: transparent; background: linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in oklch, var(--bg-surface) 95%, var(--accent)) 100%); position: relative; }
    .stat-card.glow::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, var(--accent), var(--state-consumed)); z-index: -1; opacity: 0.3; }
    .stat-card.glow { position: relative; }
    .stat-card .hs-icon { font-size: 20px; margin-bottom: 4px; }

    .heatmap-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .heatmap-stat { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; text-align: center; transition: border-color 0.15s, transform 0.15s; }
    .heatmap-stat:hover { border-color: var(--border-strong); transform: translateY(-1px); }
    .heatmap-stat .hs-value { font-size: 22px; font-weight: 600; }
    .heatmap-stat .hs-label { font-size: 11px; color: var(--ink-tertiary); margin-top: 2px; }
  </style>
</head>
<body>

  <header class="topbar">
    <div class="topbar-content">
      <div class="brand">
        <div class="brand-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
        Taste Map Engine
      </div>
      <div class="actions">
        <button class="btn btn-ghost" onclick="fetchRecs()">Refresh</button>
        <button class="btn btn-outline" onclick="copySuperPrompt()" style="color: var(--accent); border-color: var(--accent);">Copy AI Prompt</button>
        <button class="btn btn-primary" onclick="openPushModal()">New Entry</button>
      </div>
    </div>
  </header>

  <main class="container">
    <div class="page-header">
      <h1 class="page-title">Recommendations</h1>
      <p class="page-subtitle">High-signal content awaiting review and consumption.</p>
    </div>

    <div class="controls-row">
      <div class="tabs">
        <button class="tab active" onclick="setTab('active', this)">Active <span class="tab-count" id="count-active">0</span></button>
        <button class="tab" onclick="setTab('consumed', this)">Consumed <span class="tab-count" id="count-consumed">0</span></button>
        <button class="tab" onclick="setTab('rejected', this)">Rejected <span class="tab-count" id="count-rejected">0</span></button>
        <button class="tab" onclick="setTab('all', this)">All <span class="tab-count" id="count-all">0</span></button>
        <button class="tab" onclick="setTab('html_files', this)">HTML Vault <span class="tab-count" id="count-html">0</span></button>
        <button class="tab" style="color: var(--state-consumed);" onclick="setTab('learning', this)">Learning</button>
        <button class="tab" style="color: var(--accent);" onclick="setTab('system', this)">System Hub</button>
      </div>
      <div class="search-box">
        <span class="search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>
        <input type="text" class="search-input" id="search" placeholder="Filter by keyword..." oninput="handleSearch()">
      </div>
      <button class="filter-toggle" onclick="toggleFilters()" title="More filters">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        Filters
        <span class="filter-badge" id="filter-badge" style="display:none">0</span>
      </button>
      <select class="sort-select" id="sort" onchange="handleSearch()" title="Sort by">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title-asc">Title A→Z</option>
        <option value="title-desc">Title Z→A</option>
        <option value="author-asc">Author A→Z</option>
        <option value="rating-desc">Highest rated</option>
      </select>
    </div>

    <div class="list">
      <div class="filter-panel" id="filter-panel">
        <div class="filter-group">
          <label for="filter-author">Author</label>
          <select id="filter-author" onchange="handleSearch()">
            <option value="">All authors</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="filter-type">Type</label>
          <select id="filter-type" onchange="handleSearch()">
            <option value="">All types</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="filter-rating">Min rating</label>
          <select id="filter-rating" onchange="handleSearch()">
            <option value="">Any</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="5">5 only</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="filter-date-from">From</label>
          <input type="date" id="filter-date-from" onchange="handleSearch()">
        </div>
        <div class="filter-group">
          <label for="filter-date-to">To</label>
          <input type="date" id="filter-date-to" onchange="handleSearch()">
        </div>
        <button class="filter-clear" onclick="clearFilters()">Clear</button>
      </div>
      <div class="row-header" id="row-header">
        <div>Resource</div>
        <div>Rationale</div>
        <div style="text-align: right;">Actions</div>
      </div>
      
      <div id="list-body">
        <div class="empty">Loading knowledge base...</div>
      </div>
      <div id="pagination" style="display:none;align-items:center;justify-content:center;gap:12px;padding:16px 0;border-top:1px solid var(--border-subtle);margin-top:8px;"><button class="btn btn-ghost" id="btn-prev" onclick="prevPage()" disabled>← Prev</button><span id="page-info" style="font-size:13px;color:var(--ink-secondary);"></span><button class="btn btn-ghost" id="btn-next" onclick="nextPage()">Next →</button></div>
      </div>
    </div>
  </main>

  <!-- Push Modal -->
  <div class="modal-backdrop" id="modal-push">
    <div class="modal">
      <div class="modal-title">Push to Queue</div>
      
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" id="push-title" class="form-input" placeholder="Enter resource title">
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Creator</label>
          <input type="text" id="push-creator" class="form-input" placeholder="Author / Channel">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select id="push-type" class="form-input"><option value="video">Video</option><option value="book">Book</option><option value="article">Article</option><option value="podcast">Podcast</option><option value="course">Course</option><option value="paper">Paper</option><option value="other">Other</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">URL</label>
          <input type="url" id="push-url" class="form-input" placeholder="https://...">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Why This?</label>
        <textarea id="push-why" class="form-textarea" placeholder="Specific rationale for this item"></textarea>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Dedup Key</label>
          <input type="text" id="push-dedup" class="form-input" placeholder="e.g. author-slug">
        </div>
        <div class="form-group">
          <label class="form-label">Synergy ID</label>
          <input type="text" id="push-synergy" class="form-input" placeholder="optional">
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('modal-push')">Cancel</button>
        <button class="btn btn-primary" onclick="submitPush()">Save Entry</button>
      </div>
    </div>
  </div>

  <!-- Review Modal -->
  <div class="modal-backdrop" id="modal-review">
    <div class="modal">
      <div class="modal-title" id="review-title">Log Review</div>
      <input type="hidden" id="review-id">
      <input type="hidden" id="review-status">
      
      <div class="form-group">
        <label class="form-label">Rating</label>
        <input type="text" id="review-rating" class="form-input" placeholder="e.g. 9/10, Must Watch">
      </div>
      
      <div class="form-group">
        <label class="form-label">Takeaways & Reflection</label>
        <textarea id="review-notes" class="form-textarea" placeholder="Key insights..."></textarea>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('modal-review')">Cancel</button>
        <button class="btn btn-primary" onclick="submitReview()">Commit Review</button>
      </div>
    </div>
  </div>

  <!-- Paste HTML Modal -->
  <div class="modal-backdrop" id="modal-paste-html">
    <div class="modal">
      <div class="modal-title">Paste HTML Code</div>
      <div class="form-group">
        <label class="form-label">File Name</label>
        <input type="text" id="paste-html-name" class="form-input" placeholder="e.g. my-page.html">
      </div>
      <div class="form-group">
        <label class="form-label">HTML Code</label>
        <textarea id="paste-html-code" class="form-textarea" placeholder="Paste your HTML here..." style="min-height:240px;font-family:monospace;font-size:13px;" oninput="autoDetectHtmlName(this)"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('modal-paste-html')">Cancel</button>
        <button class="btn btn-primary" onclick="submitPasteHtml()">Save as HTML File</button>
      </div>
    </div>
  </div>

  <!-- Edit HTML Modal -->
  <div class="modal-backdrop" id="modal-edit-html">
    <div class="modal modal-wide">
      <div class="modal-title">Edit HTML File</div>
      <div class="form-group">
        <label class="form-label">File Name</label>
        <input type="text" id="edit-html-name" class="form-input" placeholder="e.g. my-page.html">
      </div>
      <div class="form-group">
        <label class="form-label">HTML Code</label>
        <textarea id="edit-html-code" class="form-textarea" style="min-height:420px;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:12px;line-height:1.5;" spellcheck="false"></textarea>
        <div class="form-help" id="edit-html-stats" style="font-size:11px;color:var(--ink-tertiary);margin-top:4px;">0 chars</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('modal-edit-html')">Cancel</button>
        <button class="btn btn-outline" onclick="reloadEditHtml()">Reload from server</button>
        <button class="btn btn-primary" onclick="submitEditHtml()">Save</button>
      </div>
    </div>
  </div>

  <!-- Day Detail Modal -->
  <div class="modal-backdrop" id="modal-day-detail">
    <div class="modal" style="max-width:400px;">
      <div class="day-detail" id="day-detail-body">
        <div class="day-detail-empty">Select a day to see details</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('modal-day-detail')">Close</button>
      </div>
    </div>
  </div>

  <div class="heatmap-tooltip" id="heatmap-tooltip"></div>
  <div class="toast" id="toast"></div>

  <script>'use strict';
let data=[],htmlFilesData=[],learningData=[],currentTab="active",statsData=null,statsSubTab="dashboard",currentPage=1,pageSize=20,totalItems=0,listTotal=0;
async function fetchRecs(){try{const r=await fetch('/recommendations/list');if(r.ok){const j=await r.json();data=j.recommendations||[];listTotal=j.total||data.length;}}catch(e){}try{const r=await fetch('/html/list');if(r.ok){const j=await r.json();htmlFilesData=j.files||[];}}catch(e){}fetchLearningData();render();}
async function fetchLearningData(){try{const r=await fetch('/learning/heatmap');if(r.ok){const j=await r.json();learningData=j.days||[];}else learningData=[];}catch(e){learningData=[];}render();}
async function fetchStats(){try{const r=await fetch('/stats');if(r.ok)statsData=await r.json();}catch(e){}render();}
async function uploadHtmlFile(input){const file=input.files[0];if(!file)return;const reader=new FileReader();reader.onload=async(e)=>{try{const res=await fetch('/html/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,content:e.target.result})});if(res.ok){showToast('Uploaded: '+file.name);fetchRecs();}else{showToast('Upload failed');}}catch{showToast('Upload error');}input.value='';};reader.readAsText(file);}
function autoDetectHtmlName(textarea){const nameInput=document.getElementById('paste-html-name');if(nameInput.value.trim())return;const html=textarea.value;const start=html.toLowerCase().indexOf('<title');if(start===-1)return;const open=html.indexOf('>',start);if(open===-1)return;const closeTag='<'+'/title>';const end=html.toLowerCase().indexOf(closeTag,open);if(end===-1)return;const title=html.slice(open+1,end).trim();if(!title)return;nameInput.value=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/,'')+'.html';}
async function submitPasteHtml(){let name=document.getElementById('paste-html-name').value.trim();const code=document.getElementById('paste-html-code').value;if(!name)return showToast('Enter a file name');if(!code.trim())return showToast('Paste some HTML first');if(!name.endsWith('.html')&&!name.endsWith('.htm'))name+='.html';try{const res=await fetch('/html/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:name,content:code})});if(res.ok){showToast('Saved: '+name);closeModal('modal-paste-html');fetchRecs();}else{showToast('Failed to save');}}catch{showToast('Error saving HTML');}}
async function copyHtmlCode(id,filename,btn){const orig=btn.textContent;btn.textContent='Copying...';btn.disabled=true;try{const res=await fetch('/html/download/'+id);if(!res.ok)throw new Error();await navigator.clipboard.writeText(await res.text());showToast('Copied: '+filename);btn.textContent='\u2713 Copied';setTimeout(()=>{btn.textContent=orig;btn.disabled=false;},2000);}catch{showToast('Failed to copy');btn.textContent=orig;btn.disabled=false;}}
let editHtmlOriginal='';
let editHtmlId='';
async function openEditHtml(id){
  editHtmlId=id;
  const f=htmlFilesData.find(x=>x.id===id);
  if(!f)return showToast('File not found');
  document.getElementById('edit-html-name').value=f.filename;
  document.getElementById('edit-html-code').value='Loading...';
  document.getElementById('edit-html-stats').textContent='Loading...';
  document.getElementById('modal-edit-html').classList.add('open');
  try{
    const r=await fetch('/html/download/'+id);
    if(!r.ok)throw 0;
    const text=await r.text();
    editHtmlOriginal=text;
    const codeEl=document.getElementById('edit-html-code');
    codeEl.value=text;
    updateEditHtmlStats();
  }catch{
    document.getElementById('edit-html-code').value='Failed to load file content';
    showToast('Failed to load');
  }
}
function updateEditHtmlStats(){
  const v=document.getElementById('edit-html-code').value;
  const lines=v.split('\n').length;
  document.getElementById('edit-html-stats').textContent=v.length.toLocaleString()+' chars \u00B7 '+lines.toLocaleString()+' lines';
}
async function reloadEditHtml(){
  if(!editHtmlId)return;
  if(document.getElementById('edit-html-code').value!==editHtmlOriginal){
    if(!confirm('Discard unsaved changes and reload from server?'))return;
  }
  await openEditHtml(editHtmlId);
  showToast('Reloaded');
}
async function submitEditHtml(){
  const name=document.getElementById('edit-html-name').value.trim();
  const code=document.getElementById('edit-html-code').value;
  if(!name)return showToast('Filename required');
  if(!code.trim())return showToast('Content cannot be empty');
  if(!name.endsWith('.html')&&!name.endsWith('.htm')&&!name.endsWith('.pdf')){
    showToast('Filename should end in .html, .htm, or .pdf');return;
  }
  if(code===editHtmlOriginal && name===htmlFilesData.find(x=>x.id===editHtmlId)?.filename){
    return showToast('No changes to save');
  }
  try{
    const res=await fetch('/html/update/'+editHtmlId,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({filename:name,content:code})
    });
    if(res.ok){
      showToast('Saved');
      closeModal('modal-edit-html');
      fetchRecs();
    }else{
      const j=await res.json().catch(()=>({}));
      showToast('Save failed: '+(j.error||res.status));
    }
  }catch(e){
    showToast('Save error: '+e.message);
  }
}
document.addEventListener('input',function(e){if(e.target&&e.target.id==='edit-html-code')updateEditHtmlStats();});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    document.querySelectorAll('.modal-backdrop.open').forEach(m=>m.classList.remove('open'));
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){
    const m=document.getElementById('modal-edit-html');
    if(m&&m.classList.contains('open')){
      e.preventDefault();
      submitEditHtml();
    }
  }
});
async function deleteHtmlFile(id){if(!confirm('Delete this file?'))return;try{const res=await fetch('/html/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(res.ok){showToast('Deleted');fetchRecs();}else{showToast('Delete failed');}}catch{showToast('Delete error');}}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}

function fmtDate(d){if(!d||d==='unset')return '';try{const dt=new Date(d);if(isNaN(dt))return d;return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch{return d;}}

function renderStatsDashboard(s){
  const S=s||statsData;if(!S)return '<div class="empty">Loading stats...</div>';
  const total=S.total||0,active=S.byStatus?.active||0,consumed=S.byStatus?.consumed||0,rejected=S.byStatus?.rejected||0;
  const rate=total>0?Math.round(consumed/total*100):0;
  const maxCreator=Math.max(1,...(S.topCreators||[]).map(c=>c.c));
  const maxMonth=Math.max(1,...(S.consumptionByMonth||[]).map(m=>m.c));
  const ratings=S.ratingDistribution||[];
  const bundles=S.bundles||[];
  const consumedItems=S.recentConsumed||[];
  const activeItems=S.activeItems||[];
  const part=document.createElement('div');
  part.innerHTML=
    '<div class="stats-grid">'+
      '<div class="stat-card accent"><div class="label">Total Entries</div><div class="value">'+total+'</div><div class="sub">'+active+' active \u00b7 '+rejected+' rejected</div></div>'+
      '<div class="stat-card green"><div class="label">Consumed</div><div class="value">'+consumed+'</div><div class="sub">'+rate+'% completion rate</div></div>'+
      '<div class="stat-card gold"><div class="label">Active Queue</div><div class="value">'+active+'</div><div class="sub">waiting for review</div></div>'+
      '<div class="stat-card red"><div class="label">Rejected</div><div class="value">'+rejected+'</div><div class="sub">'+Math.round(rejected/Math.max(1,total)*100)+'% of total</div></div>'+
    '</div>';

  const two=document.createElement('div');two.className='two-col';

  // LEFT COL
  const left=document.createElement('div');

  // Status bar chart
  const statusSec=document.createElement('div');statusSec.style.marginBottom='20px';
  statusSec.innerHTML='<div class="section-title">Status Distribution</div><div class="bar-chart">'+
    '<div class="bar-row"><span class="bar-label">Active</span><div class="bar-track"><div class="bar-fill gold" style="width:'+(total>0?active/total*100:0)+'%"></div></div><span class="bar-count">'+active+'</span></div>'+
    '<div class="bar-row"><span class="bar-label">Consumed</span><div class="bar-track"><div class="bar-fill green" style="width:'+(total>0?consumed/total*100:0)+'%"></div></div><span class="bar-count">'+consumed+'</span></div>'+
    '<div class="bar-row"><span class="bar-label">Rejected</span><div class="bar-track"><div class="bar-fill red" style="width:'+(total>0?rejected/total*100:0)+'%"></div></div><span class="bar-count">'+rejected+'</span></div>'+
  '</div>';
  left.appendChild(statusSec);

  // Consumption timeline
  if(S.consumptionByMonth&&S.consumptionByMonth.length){
    const monthSec=document.createElement('div');monthSec.style.marginBottom='20px';
    let bars='';const months=S.consumptionByMonth;
    bars='<div class="mini-chart">';
    months.forEach(m=>{bars+='<div class="col"><div class="bar" style="height:'+Math.max(2,m.c/maxMonth*44)+'px"></div><div class="bar-label">'+m.m.slice(5)+'</div></div>';});
    bars+='</div>';
    monthSec.innerHTML='<div class="section-title">Consumption Timeline <span class="badge">'+months.reduce((a,b)=>a+b.c,0)+' total</span></div>'+bars;
    left.appendChild(monthSec);
  }

  // Top creators
  if(S.topCreators&&S.topCreators.length){
    const crSec=document.createElement('div');crSec.style.marginBottom='20px';
    let bars='<div class="bar-chart">';
    S.topCreators.forEach(cr=>{
      bars+='<div class="bar-row"><span class="bar-label">'+escHtml(cr.creator)+'</span><div class="bar-track"><div class="bar-fill accent" style="width:'+Math.round(cr.c/maxCreator*100)+'%"></div></div><span class="bar-count">'+cr.c+'</span></div>';
    });
    bars+='</div>';
    crSec.innerHTML='<div class="section-title">Top Creators <span class="badge">'+S.topCreators.length+'</span></div>'+bars;
    left.appendChild(crSec);
  }

  // Rating distribution
  if(ratings.length){
    const ratSec=document.createElement('div');ratSec.style.marginBottom='20px';
    let rhtml='<div class="rating-dist">';
    ratings.forEach(r=>{rhtml+='<div class="rating-item"><div class="rv">'+escHtml(r.user_rating)+'</div><div class="rl">'+r.c+'×</div></div>';});
    rhtml+='</div>';
    ratSec.innerHTML='<div class="section-title">Rating Distribution</div>'+rhtml;
    left.appendChild(ratSec);
  }

  // RIGHT COL
  const right=document.createElement('div');

  // Bundles
  if(bundles.length){
    const bSec=document.createElement('div');bSec.style.marginBottom='20px';
    let html='<div class="bundle-chips">';
    bundles.forEach(b=>{html+='<div class="bundle-chip">'+escHtml(b.synergy_bundle_id)+' <span class="bc-count">'+b.c+'</span></div>';});
    html+='</div>';
    bSec.innerHTML='<div class="section-title">Synergy Bundles <span class="badge">'+bundles.length+'</span></div>'+html;
    right.appendChild(bSec);
  }

  // Recently consumed
  if(consumedItems.length){
    const cSec=document.createElement('div');cSec.style.marginBottom='20px';
    let html='<div class="consumed-list">';
    consumedItems.slice(0,8).forEach(i=>{
      html+='<div class="consumed-item"><div class="ci-title">'+escHtml(i.video_title||'Untitled')+'</div><div class="ci-meta">'+(i.creator||'Unknown')+' \u00b7 '+fmtDate(i.consumed_date)+(i.user_rating&&i.user_rating!=='unset'?' \u00b7 '+escHtml(i.user_rating):'')+'</div>'+(i.user_review?'<div class="ci-review">"'+escHtml(i.user_review)+'"</div>':'')+'</div>';
    });
    html+='</div>';
    cSec.innerHTML='<div class="section-title">Recently Consumed <span class="badge">'+consumedItems.length+'</span></div>'+html;
    right.appendChild(cSec);
  }

  // Active queue
  if(activeItems.length){
    const aSec=document.createElement('div');
    let html='<div class="active-list">';
    activeItems.slice(0,8).forEach(i=>{
      html+='<div class="active-item"><div class="ai-title">'+escHtml(i.video_title||'Untitled')+'</div><div class="ai-meta">'+(i.creator||'Unknown')+(i.why_this?' \u00b7 '+escHtml(i.why_this.substring(0,80))+(i.why_this.length>80?'...':''):'')+'</div></div>';
    });
    html+='</div>';
    aSec.innerHTML='<div class="section-title">Active Queue <span class="badge">'+activeItems.length+'</span></div>'+html;
    right.appendChild(aSec);
  }

  two.appendChild(left);two.appendChild(right);part.appendChild(two);

  // Insights row
  const insights=document.createElement('div');insights.style.marginTop='8px';
  const topCreator=S.topCreators&&S.topCreators[0]?S.topCreators[0].creator:'';
  const mostRated=ratings[0]?ratings[0].user_rating:'';
  let tags='<div class="section-title">Insights</div><div class="insight-row">';
  if(rate>0)tags+='<span class="insight-tag">Consumption rate: '+rate+'%</span>';
  if(topCreator)tags+='<span class="insight-tag">Top creator: '+escHtml(topCreator)+'</span>';
  if(mostRated)tags+='<span class="insight-tag">Most common rating: '+escHtml(mostRated)+'</span>';
  if(bundles.length)tags+='<span class="insight-tag">'+bundles.length+' synergy bundles</span>';
  if(activeItems.length)tags+='<span class="insight-tag">'+activeItems.length+' items in queue</span>';
  tags+='</div>';
  insights.innerHTML=tags;
  part.appendChild(insights);

  // Export buttons
  const exp=document.createElement('div');exp.style.cssText='margin-top:20px;display:flex;gap:8px;';
  exp.innerHTML='<button class="btn btn-outline" onclick="exportStats(\'json\')">Export JSON</button><button class="btn btn-outline" onclick="exportStats(\'csv\')">Export CSV</button>';
  part.appendChild(exp);

  return part;
}

function renderLearningTab(){
  const body=document.getElementById('list-body');const rowHeader=document.getElementById('row-header');
  body.style.display='block';rowHeader.style.display='none';body.innerHTML='';

  const map = {}; learningData.forEach(d => { map[d.date] = d.count; });

  // Compute stats
  const today = new Date(); const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  let totalItems = 0, maxDay = 0, activeDays = 0, streak = 0, currentStreak = 0;
  const dates = [];
  for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    const c = map[key] || 0; totalItems += c; maxDay = Math.max(maxDay, c);
    if (c > 0) activeDays++;
    dates.push({ date: key, count: c });
  }
  // Streak calc (from today backwards)
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i].count > 0) currentStreak++;
    else break;
  }
  // Longest streak
  let run = 0;
  dates.forEach(d => { if (d.count > 0) { run++; streak = Math.max(streak, run); } else run = 0; });

  const container = document.createElement('div');
  container.innerHTML =
    '<div class="page-header" style="margin-bottom:8px">'+
      '<h1 class="page-title" style="font-size:20px">Learning Activity</h1>'+
      '<p class="page-subtitle">'+activeDays+' active days · '+totalItems+' items logged this year</p>'+
    '</div>'+
    '<div class="heatmap-stats">'+
      '<div class="heatmap-stat glow"><div class="hs-value" style="color:var(--state-consumed)">'+totalItems+'</div><div class="hs-label">Total Items</div></div>'+
      '<div class="heatmap-stat glow"><div class="hs-value" style="color:var(--state-active)">'+currentStreak+'</div><div class="hs-label">Current Streak</div></div>'+
      '<div class="heatmap-stat glow"><div class="hs-value" style="color:var(--accent)">'+streak+'</div><div class="hs-label">Best Streak</div></div>'+
      '<div class="heatmap-stat glow"><div class="hs-value" style="color:var(--state-consumed)">'+maxDay+'</div><div class="hs-label">Best Day</div></div>'+
    '</div>'+
    '<div id="heatmap-container"></div>'+
    '<div id="learning-week-summary"></div>'+
    '<div class="learning-today">'+
      '<input type="text" id="learning-topic-input" class="form-input" placeholder="What did you learn today? (optional)" style="flex:1">'+
      '<button class="btn btn-primary" onclick="logLearning()">Log Today</button>'+
    '</div>'+
    '<div class="learning-entries" id="learning-entries"><div class="empty">No recent entries</div></div>';
  body.appendChild(container);

  // Build the grid
  const wrap = document.createElement('div'); wrap.className = 'heatmap-wrap';
  const grid = document.createElement('div'); grid.className = 'heatmap';

  // Group by week
  const weeks = []; let currentWeek = [];
  const startDay = oneYearAgo.getDay(); // 0=Sun
  // Pad first week
  for (let i = 0; i < startDay; i++) currentWeek.push(null);
  
  dates.forEach(d => {
    currentWeek.push(d);
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const monthLabels = document.createElement('div'); monthLabels.className = 'heatmap-labels';
  let lastMonth = '';
  weeks.forEach((w, wi) => {
    const firstDate = w.find(d => d !== null);
    if (firstDate) {
      const m = firstDate.date.slice(0, 7);
      if (m !== lastMonth) {
        const lbl = document.createElement('span'); lbl.className = 'month-label'; lbl.textContent = new Date(firstDate.date).toLocaleString('en-US', { month: 'short' });
        monthLabels.appendChild(lbl); lastMonth = m;
      } else {
        const sp = document.createElement('span'); sp.style.flex = '1'; monthLabels.appendChild(sp);
      }
    }
  });

  // Day labels (left side)
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  wrap.appendChild(monthLabels);

  const gridWrap = document.createElement('div'); gridWrap.style.display = 'flex'; gridWrap.style.gap = '4px';
  
  // Day labels column
  const dayCol = document.createElement('div'); dayCol.style.display = 'flex'; dayCol.style.flexDirection = 'column'; dayCol.style.gap = '3px'; dayCol.style.paddingTop = '0';
  dayLabels.forEach((l, i) => {
    const lbl = document.createElement('span'); lbl.style.cssText = 'width:12px;height:12px;font-size:9px;color:var(--ink-tertiary);display:flex;align-items:center;justify-content:center;';
    if (i % 2 === 0) lbl.textContent = l;
    dayCol.appendChild(lbl);
  });

  const heatmapDiv = document.createElement('div'); heatmapDiv.className = 'heatmap';

  const tooltip = document.getElementById('heatmap-tooltip');

  weeks.forEach(week => {
    const col = document.createElement('div'); col.className = 'heatmap-col';
    week.forEach(day => {
      const cell = document.createElement('div'); cell.className = 'heatmap-cell';
      if (day === null) { cell.style.visibility = 'hidden'; }
      else {
        const c = day.count;
        const lvl = c === 0 ? 'l0' : c <= 2 ? 'l1' : c <= 5 ? 'l2' : c <= 9 ? 'l3' : 'l4';
        cell.classList.add(lvl);
        cell.dataset.date = day.date;
        cell.style.cursor = c > 0 ? 'pointer' : 'default';
        cell.onmouseenter = (e) => {
          const d = new Date(day.date);
          const formatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
          tooltip.textContent = (c > 0 ? c + ' items' : 'No activity') + ' · ' + formatted;
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY - 8) + 'px';
          tooltip.classList.add('show');
        };
        cell.onmouseleave = () => tooltip.classList.remove('show');
        if (c > 0) {
          cell.onclick = () => openDayDetail(day.date);
        }
      }
      col.appendChild(cell);
    });
    heatmapDiv.appendChild(col);
  });

  gridWrap.appendChild(dayCol);
  gridWrap.appendChild(heatmapDiv);
  wrap.appendChild(gridWrap);

  // Legend
  const legend = document.createElement('div'); legend.className = 'heatmap-legend';
  legend.innerHTML = '<span>Less</span><div class="h-cell" style="background:var(--bg-surface)"></div><div class="h-cell l1"></div><div class="h-cell l2"></div><div class="h-cell l3"></div><div class="h-cell l4"></div><span>More</span>';
  wrap.appendChild(legend);

  document.getElementById('heatmap-container').appendChild(wrap);

  // Render week summary
  renderWeekSummary(map);

  // Render recent entries
  renderRecentEntries(map);
}

function renderWeekSummary(map){
  const el = document.getElementById('learning-week-summary');
  if (!el) return;

  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let weekHtml = '<h3 style="font-size:13px;font-weight:600;margin:20px 0 8px;display:flex;align-items:center;gap:8px;"><span>This Week</span></h3><div class="week-summary">';

  // Get start of week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const key = d.toISOString().split('T')[0];
    const c = map[key] || 0;
    const isToday = i === today.getDay();
    const lvl = c === 0 ? 'wd0' : c <= 2 ? 'wd1' : c <= 5 ? 'wd2' : 'wd3';
    weekHtml += '<div class="week-day'+(isToday?' today':'')+'">'+
      '<div class="wd-name">'+dayNames[i]+'</div>'+
      '<div class="wd-count '+lvl+'">'+c+'</div>'+
    '</div>';
  }
  weekHtml += '</div>';
  el.innerHTML = weekHtml;
}

function renderRecentEntries(map){
  const el = document.getElementById('learning-entries');
  if (!el) return;

  const today = new Date();
  let html = '<h3 style="font-size:13px;font-weight:600;margin:16px 0 8px;display:flex;align-items:center;gap:8px;">Recent Activity <span style="font-size:11px;font-weight:400;color:var(--ink-tertiary);">Last 7 days</span></h3>';
  let count = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const c = map[key] || 0;
    if (c === 0) continue;
    count++;
    const formatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const topics = learningData.find(x => x.date === key);
    const topicStr = topics && topics.topics ? topics.topics : '';
    const topicChips = topicStr ? topicStr.split(',').map(t => '<span class="mini-topic">'+t.trim()+'</span>').join('') : '';
    html += '<div class="entry-card" style="margin-bottom:6px;">'+
      '<div class="ec-date">'+formatted+'</div>'+
      '<div class="ec-count">'+c+'</div>'+
      '<div class="ec-topics">'+(topicChips || '<span style="color:var(--ink-tertiary);font-size:11px;">Items logged</span>')+'</div>'+
      '<button class="ec-del" onclick="deleteDayEntry(\''+key+'\', this)" title="Delete day">×</button>'+
    '</div>';
  }

  if (count === 0) {
    html += '<div class="empty">No recent entries. Start logging your learning!</div>';
  }
  el.innerHTML = html;
}

async function openDayDetail(date){
  const body = document.getElementById('day-detail-body');
  body.innerHTML = '<div class="day-detail-empty">Loading...</div>';
  document.getElementById('modal-day-detail').classList.add('open');
  try {
    const res = await fetch('/learning/detail?date='+date);
    const data = await res.json();
    const days = data.days || [];
    const day = days.find(d => d.date === date);
    if (!day || day.count === 0) {
      body.innerHTML = '<div class="day-detail-empty">No activity on '+date+'</div>';
      return;
    }
    const formatted = new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const topics = day.topics ? day.topics.split(',').map((t, i) => {
      const clean = t.trim();
      if (!clean) return '';
      return '<div class="topic-chip t'+(i%4)+'">'+escHtml(clean)+'</div>';
    }).join('') : '<div class="day-detail-empty">No topics recorded</div>';

    body.innerHTML =
      '<div class="dd-header">📅 '+formatted+'</div>'+
      '<div class="dd-count">'+day.count+' item'+(day.count>1?'s':'')+' learned</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">'+topics+'</div>'+
      '<div style="margin-top:4px;"><button class="btn btn-outline" style="font-size:11px;" onclick="deleteDayEntry(\''+date+'\', null, true)">Delete this day</button></div>';
  } catch {
    body.innerHTML = '<div class="day-detail-empty">Error loading details</div>';
  }
}

async function deleteDayEntry(date, btn, closeModalAfter){
  if (!confirm('Delete learning entry for '+date+'?')) return;
  try {
    const res = await fetch('/learning/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date })
    });
    if (res.ok) {
      showToast('Deleted '+date);
      if (closeModalAfter) closeModal('modal-day-detail');
      if (btn) { btn.closest('.entry-card').style.opacity = '0.3'; }
      fetchLearningData();
    } else { showToast('Delete failed'); }
  } catch { showToast('Error deleting'); }
}

async function logLearning(){
  const input = document.getElementById('learning-topic-input');
  const topics = input ? input.value.trim() : '';
  try{
    const res = await fetch('/learning/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topics, date: new Date().toISOString().split('T')[0] })
    });
    if (res.ok) {
      showToast('Learning logged!');
      if (input) input.value = '';
      fetchLearningData();
    } else { showToast('Failed to log'); }
  } catch { showToast('Error logging'); }
}

function escHtml(s){if(!s)return '';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function exportStats(fmt){
  if(!statsData)return;
  if(fmt==='json'){navigator.clipboard.writeText(JSON.stringify(statsData,null,2));showToast('Stats JSON copied');return;}
  if(fmt==='csv'){
    const rows=statsData.allEntries||[];
    if(!rows.length){showToast('No data to export');return;}
    let csv='Title,Creator,Status,Rating,Review,Synergy,Created\n';
    rows.forEach(r=>{csv+='"'+escHtml(r.video_title||'')+'","'+(r.creator||'')+'","'+r.status+'","'+(r.user_rating||'')+'","'+(r.user_review||'')+'","'+(r.synergy_bundle_id||'')+'","'+(r.created_at||'')+'"\n';});
    navigator.clipboard.writeText(csv);showToast('CSV copied ('+rows.length+' rows)');
  }
}

function renderSystemTab(){
  const body=document.getElementById('list-body');const rowHeader=document.getElementById('row-header');
  body.style.display='block';rowHeader.style.display='none';body.innerHTML='';

  if(!statsData){const e=document.createElement('div');e.className='empty';e.style.cssText='padding:60px 20px;';e.textContent='Loading system hub...';body.appendChild(e);fetchStats();return;}

  // Tab toggle
  const toggle=document.createElement('div');toggle.className='tab-stats-toggle';
  ['Dashboard','Mega-Prompt','Lite Visual','Export'].forEach(t=>{
    const b=document.createElement('button');b.textContent=t;const key=t.toLowerCase().replace(/ /g,'-');if(key===statsSubTab)b.className='active';
    b.onclick=()=>{statsSubTab=key;renderSystemTab();};toggle.appendChild(b);
  });
  body.appendChild(toggle);

  if(statsSubTab==='dashboard'){
    const dash=renderStatsDashboard(statsData);
    body.appendChild(dash);
    return;
  }

  if(statsSubTab==='mega-prompt'){
    const pb=document.createElement('div');pb.className='prompt-box';
    const pre=document.createElement('pre');pre.textContent=buildSuperPrompt(statsData);
    const cb=document.createElement('button');cb.className='btn btn-primary copy-btn';cb.textContent='Copy Prompt';
    cb.onclick=()=>{navigator.clipboard.writeText(pre.textContent);showToast('Mega-Prompt copied!');};
    pb.appendChild(cb);pb.appendChild(pre);body.appendChild(pb);
    return;
  }

  if(statsSubTab==='export'){
    const eDiv=document.createElement('div');eDiv.style.cssText='display:flex;flex-direction:column;gap:16px;align-items:center;padding:60px 20px;';
    eDiv.innerHTML='<div style="font-size:16px;font-weight:500;">Export Data</div><div style="color:var(--ink-secondary);font-size:13px;">Copy full dataset as JSON or CSV</div>';
    const btns=document.createElement('div');btns.style.cssText='display:flex;gap:12px;';
    btns.innerHTML='<button class="btn btn-primary" onclick="exportStats(&#39;json&#39;)">Copy as JSON</button><button class="btn btn-primary" onclick="exportStats(&#39;csv&#39;)">Copy as CSV</button>';
    eDiv.appendChild(btns);
    const tip=document.createElement('div');tip.style.cssText='font-size:11px;color:var(--ink-tertiary);margin-top:8px;';tip.textContent='Data is copied to clipboard. Paste into any editor or import tool.';
    eDiv.appendChild(tip);
    body.appendChild(eDiv);
  }

  if(statsSubTab==='lite-visual'){
    const lvFile=statsData.htmlVault?.find(f=>f.filename&&f.filename.includes('lite-visual'));
    if(!lvFile){
      const e=document.createElement('div');e.className='empty';e.textContent='Lite Visual file not found in vault.';body.appendChild(e);
      return;
    }
    const desc=document.createElement('div');desc.style.cssText='display:flex;flex-direction:column;gap:8px;align-items:center;padding:20px;text-align:center;';
    desc.innerHTML='<div style="font-size:16px;font-weight:500;color:var(--accent);">Lite Visual Generator</div><div style="font-size:13px;color:var(--ink-secondary);max-width:500px;">This prompt feeds an AI the full Lite Visual skill spec so it can generate the interactive study guide HTML for you.</div>';
    body.appendChild(desc);
    const pb=document.createElement('div');pb.className='prompt-box';
    const pre=document.createElement('pre');pre.textContent=buildLiteVisualPrompt(lvFile);
    const cb=document.createElement('button');cb.className='btn btn-primary copy-btn';cb.textContent='Copy Lite Visual Prompt';
    cb.onclick=()=>{navigator.clipboard.writeText(pre.textContent);showToast('Lite Visual prompt copied!');};
    pb.appendChild(cb);pb.appendChild(pre);body.appendChild(pb);
    return;
  }
}

function buildSuperPrompt(S){
  if(!S)return 'Loading...';
  const total=S.total||0,active=S.byStatus?.active||0,consumed=S.byStatus?.consumed||0,rejected=S.byStatus?.rejected||0;
  const rate=total>0?Math.round(consumed/total*100):0;
  const lines=[];
  lines.push('You are the Taste Map AI Curator. Your role: deeply understand this user\'s intellectual and creative taste based on their curated database, and propose high-signal content that fits their existing tree of knowledge.');
  lines.push('');
  lines.push('=== SYSTEM OVERVIEW ===');
  lines.push('This is the user\'s personal recommendation engine — a curated database of video/audio content ranging across psychology, behavioral science, dark patterns, persuasion, storytelling, Islamic spirituality, power dynamics, and human behavior.');
  lines.push('');
  lines.push('=== STATISTICS ===');
  lines.push('Total entries: '+total);
  lines.push('Active (unread): '+active);
  lines.push('Consumed: '+consumed+' ('+rate+'%)');
  lines.push('Rejected: '+rejected);
  lines.push('');

  if(S.consumptionByMonth&&S.consumptionByMonth.length){
    lines.push('=== CONSUMPTION OVER TIME ===');
    S.consumptionByMonth.forEach(m=>{lines.push(m.m+': '+m.c+' items');});
    lines.push('');
  }

  if(S.topCreators&&S.topCreators.length){
    lines.push('=== TOP CREATORS ===');
    S.topCreators.forEach(c=>{lines.push('- '+c.creator+': '+c.c+' entries');});
    lines.push('');
  }

  if(S.bundles&&S.bundles.length){
    lines.push('=== SYNERGY BUNDLES ===');
    S.bundles.forEach(b=>{lines.push('- '+b.synergy_bundle_id+': '+b.c+' items');});
    lines.push('');
  }

  if(S.recentConsumed&&S.recentConsumed.length){
    lines.push('=== CONSUMED & REVIEWED ===');
    S.recentConsumed.forEach(i=>{
      let l='- '+i.video_title+(i.creator?' by '+i.creator:'');
      if(i.user_rating&&i.user_rating!=='unset')l+=' [Rating: '+i.user_rating+']';
      if(i.user_review)l+=' — "'+i.user_review+'"';
      lines.push(l);
    });
    lines.push('');
  }

  if(S.activeItems&&S.activeItems.length){
    lines.push('=== ACTIVE QUEUE (pending review) ===');
    S.activeItems.forEach(i=>{
      let l='- '+i.video_title+(i.creator?' by '+i.creator:'');
      if(i.why_this)l+=' — '+i.why_this.substring(0,200);
      lines.push(l);
    });
    lines.push('');
  }

  if(S.ratingDistribution&&S.ratingDistribution.length){
    lines.push('=== RATING PATTERNS ===');
    S.ratingDistribution.forEach(r=>{lines.push('- "'+r.user_rating+'": '+r.c+' entries');});
    lines.push('');
  }

  // === HTML VAULT ===
  if(S.htmlVault&&S.htmlVault.length){
    lines.push('=== HTML VAULT (saved knowledge base files) ===');
    S.htmlVault.forEach(f=>{
      if(f.filename && f.filename.includes('lite-visual')) return; // separate button
      lines.push('');
      lines.push('--- File: '+f.filename+' (saved '+(f.created_at||'')+') ---');
      lines.push('');
      if(f.content){
        const content = f.content.length > 4000 ? f.content.substring(0,4000)+'\\n\\n[...content truncated at 4000 chars, full length: '+f.content.length+' chars]' : f.content;
        lines.push(content);
      }
    });
    lines.push('');
  }

  lines.push('=== TASK ===');
  lines.push('Based on the above, generate 5 precise content recommendations. For each:');
  lines.push('1. Title & Creator');
  lines.push('2. URL / source (searchable)');
  lines.push('3. Why it fits this user\'s taste tree — reference specific consumed items, ratings, or topics they engaged with');
  lines.push('4. Which "synergy bundle" it belongs to (persuasion, power, storytelling, self-control, Islamic psychology, etc.)');
  lines.push('');
  lines.push('CRITICAL RULES:');
  lines.push('- Never recommend content the user has already consumed (check Consumed list)');
  lines.push('- Prefer primary-source material (original research, lectures by originators) over secondary commentary');
  lines.push('- When recommending Islamic content: ONLY real lectures/khutbahs by trusted scholars — NO book-based content, NO lecture series explaining books');
  lines.push('- Match the psychological depth the user values (this user appreciates Camus, Dostoevsky, Kahneman-level rigor, not superficial pop-psychology)');
  lines.push('- Prioritize content that bridges multiple synergy bundles (e.g., a talk on persuasion from a neuroscientist)');

  return lines.join('\\n');
}

function buildLiteVisualPrompt(file){
  if(!file||!file.content)return 'Lite Visual file not available.';
  return 'You are a skilled frontend developer. Your task is to build a single-file interactive study guide HTML artifact based on the spec below.\n\n=== SPECIFICATION ===\n\n'+file.content+'\n\n=== REQUIREMENTS ===\n- Single self-contained HTML file (no external deps)\n- Dark theme, modern, clean UI\n- Interactive elements (expand/collapse, tabs, quizzes, or question cards)\n- Responsive design\n- Copy the full HTML output, all code in one file\n\nBuild the best possible interactive study guide from this spec.';
}

function render(){
  if(!data)data=[];if(!htmlFilesData)htmlFilesData=[];
  document.getElementById('count-active').textContent=data.filter(r=>r.status==='active').length;
  document.getElementById('count-consumed').textContent=data.filter(r=>r.status==='consumed').length;
  document.getElementById('count-rejected').textContent=data.filter(r=>r.status==='rejected').length;
  document.getElementById('count-all').textContent=data.length;
  const ce=document.getElementById('count-html');if(ce)ce.textContent=htmlFilesData.length;
  const q=document.getElementById('search').value.toLowerCase().trim();
  const body=document.getElementById('list-body');const rowHeader=document.getElementById('row-header');

  if(currentTab==='system'){renderSystemTab();return;}
  if(currentTab==='learning'){renderLearningTab();return;}

  if(currentTab==='html_files'){
    body.style.display='block';rowHeader.style.display='none';body.innerHTML='';
    const vault=document.createElement('div');vault.style.cssText='padding:24px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:24px;';
    const vTop=document.createElement('div');vTop.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;';
    const vInfo=document.createElement('div');
    const h3=document.createElement('h3');h3.style.cssText='font-size:16px;font-weight:600;margin-bottom:4px;';h3.textContent='HTML Files Vault';
    const p=document.createElement('p');p.style.cssText='font-size:13px;color:var(--ink-secondary);';p.textContent='Upload, paste, or download HTML files.';
    vInfo.appendChild(h3);vInfo.appendChild(p);
    const fi=document.createElement('input');fi.type='file';fi.id='html-file-input';fi.accept='.html,.htm';fi.style.display='none';fi.onchange=()=>uploadHtmlFile(fi);
    const upBtn=document.createElement('button');upBtn.className='btn btn-primary';upBtn.textContent='Upload HTML File';upBtn.onclick=()=>fi.click();
    const pasteBtn=document.createElement('button');pasteBtn.className='btn btn-outline';pasteBtn.textContent='Paste HTML';
    pasteBtn.onclick=()=>{document.getElementById('paste-html-name').value='';document.getElementById('paste-html-code').value='';document.getElementById('modal-paste-html').classList.add('open');};
    const vAct=document.createElement('div');vAct.style.cssText='display:flex;gap:8px;flex-wrap:wrap;';
    vAct.appendChild(fi);vAct.appendChild(upBtn);vAct.appendChild(pasteBtn);
    vTop.appendChild(vInfo);vTop.appendChild(vAct);vault.appendChild(vTop);body.appendChild(vault);
    const filteredHtml=htmlFilesData.filter(f=>!q||f.filename.toLowerCase().includes(q));
    if(!filteredHtml.length){const e=document.createElement('div');e.className='empty';e.textContent='No files. Upload or paste one!';body.appendChild(e);return;}
    
    // Group files by base name — one row per document with HTML + PDF in one
    const groups={};
    filteredHtml.forEach(f=>{
      const base=f.filename.replace(/\.(html?|pdf)$/i,'');
      const ext=f.filename.match(/\.(\w+)$/i)?.[1]?.toLowerCase();
      if(!groups[base]) groups[base]={};
      if(ext==='html'||ext==='htm'){
        if(!groups[base].html||f.created_at>groups[base].html.created_at) groups[base].html=f;
      } else if(ext==='pdf'){
        if(!groups[base].pdf||f.created_at>groups[base].pdf.created_at) groups[base].pdf=f;
      } else {
        if(!groups[base].other) groups[base].other=[];
        groups[base].other.push(f);
      }
    });
    
    const list=document.createElement('div');list.style.cssText='display:flex;flex-direction:column;gap:8px;';
    
    Object.entries(groups).forEach(([base, group])=>{
      const htmlFile=group.html;
      const pdfFile=group.pdf;
      const others=group.other||[];
      
      // Non-HTML files get a simple single row
      if(!htmlFile && !pdfFile){
        others.forEach(f=>{
          const row=document.createElement('div');row.className='row';row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);';
          const left=document.createElement('div');left.style.cssText='display:flex;align-items:center;gap:12px;';
          const icon=document.createElement('span');icon.style.fontSize='18px';icon.textContent='\uD83D\uDCC4';
          const meta=document.createElement('div');
          const fname=document.createElement('div');fname.style.cssText='font-weight:500;font-size:14px;color:var(--ink-primary);';fname.textContent=f.filename;
          const fdate=document.createElement('div');fdate.style.cssText='font-size:12px;color:var(--ink-tertiary);';fdate.textContent='Uploaded '+(f.created_at||'');
          meta.appendChild(fname);meta.appendChild(fdate);left.appendChild(icon);left.appendChild(meta);
          const right=document.createElement('div');right.style.cssText='display:flex;gap:8px;align-items:center;';
          const dl=document.createElement('a');dl.href='/html/download/'+f.id;dl.target='_blank';dl.className='btn btn-outline';dl.style.textDecoration='none';dl.textContent='Open';
          right.appendChild(dl);
          row.appendChild(left);row.appendChild(right);list.appendChild(row);
        });
        return;
      }
      
      // With HTML — one row, HTML opens in-page, PDF force-downloads
      const row=document.createElement('div');row.className='row';row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;';
      row.title='Open HTML';
      row.onclick=function(e){if(e.target.closest('.row-actions'))return;window.location.href='/html/download/'+(htmlFile?htmlFile.id:pdfFile.id);};
      
      const left=document.createElement('div');left.style.cssText='display:flex;align-items:center;gap:12px;';
      const icon=document.createElement('span');icon.style.fontSize='18px';icon.textContent=htmlFile?'\uD83D\uDCD0':'\uD83D\uDCC4';
      const meta=document.createElement('div');
      const fname=document.createElement('div');fname.style.cssText='font-weight:500;font-size:14px;color:var(--ink-primary);';fname.textContent=base+(htmlFile?'.html':'');
      const fdate=document.createElement('div');fdate.style.cssText='font-size:12px;color:var(--ink-tertiary);';
      const dateParts=[];
      if(htmlFile) dateParts.push('HTML '+htmlFile.created_at);
      if(pdfFile) dateParts.push('PDF '+pdfFile.created_at);
      fdate.textContent=dateParts.join(' \u00B7 ');
      meta.appendChild(fname);meta.appendChild(fdate);left.appendChild(icon);left.appendChild(meta);
      
      const right=document.createElement('div');right.className='row-actions';right.style.cssText='display:flex;gap:8px;align-items:center;';
      if(htmlFile){
        const view=document.createElement('a');view.href='/html/download/'+htmlFile.id;view.className='btn btn-ghost';view.style.textDecoration='none';view.textContent='HTML';
        right.appendChild(view);
      }
      if(pdfFile){
        const pdfBtn=document.createElement('a');pdfBtn.href='/html/download/'+pdfFile.id;pdfBtn.download=pdfFile.filename;
        pdfBtn.className='btn btn-outline';pdfBtn.style.textDecoration='none';pdfBtn.style.color='var(--state-rejected)';pdfBtn.style.borderColor='var(--state-rejected)';pdfBtn.textContent='PDF';
        right.appendChild(pdfBtn);
      }
      if(htmlFile){
        const cp=document.createElement('button');cp.className='btn btn-ghost';cp.textContent='Copy Code';cp.onclick=function(e){e.stopPropagation();copyHtmlCode(htmlFile.id,htmlFile.filename,cp);};
        right.appendChild(cp);
        const edit=document.createElement('button');edit.className='btn btn-outline';edit.textContent='Edit';edit.onclick=function(e){e.stopPropagation();openEditHtml(htmlFile.id);};
        right.appendChild(edit);
        const del=document.createElement('button');del.className='btn btn-ghost';del.style.color='var(--state-rejected)';del.textContent='Delete';del.onclick=function(e){e.stopPropagation();deleteHtmlFile(htmlFile.id);};
        right.appendChild(del);
      }
      
      row.appendChild(left);row.appendChild(right);list.appendChild(row);
    });
    body.appendChild(list);
    return;
  }

  let filtered=currentTab==='all'?data.slice():data.filter(r=>r.status===currentTab);
  totalItems=filtered.length;const start=(currentPage-1)*pageSize;const pageItems=filtered.slice(start,start+pageSize);
  const f=getActiveFilters();
  updateFilterBadge();
  if(f.author)filtered=filtered.filter(r=>(r.creator||'')===f.author);
  if(f.type)filtered=filtered.filter(r=>(r.content_type||'')===f.type);
  if(f.rating)filtered=filtered.filter(r=>parseInt(r.user_rating||'0',10)>=f.rating);
  if(f.dateFrom)filtered=filtered.filter(r=>r.added_date>=f.dateFrom);
  if(f.dateTo)filtered=filtered.filter(r=>r.added_date<=f.dateTo);
  if(q)filtered=filtered.filter(r=>(r.video_title||'').toLowerCase().includes(q)||(r.creator||'').toLowerCase().includes(q)||(r.why_this||'').toLowerCase().includes(q));
  if(!q && f.sort==='newest'){filtered.sort((a,b)=>(b.added_date||'').localeCompare(a.added_date||''));}
  else if(f.sort==='oldest'){filtered.sort((a,b)=>(a.added_date||'').localeCompare(b.added_date||''));}
  else if(f.sort==='title-asc'){filtered.sort((a,b)=>(a.video_title||'').localeCompare(b.video_title||''));}
  else if(f.sort==='title-desc'){filtered.sort((a,b)=>(b.video_title||'').localeCompare(a.video_title||''));}
  else if(f.sort==='author-asc'){filtered.sort((a,b)=>(a.creator||'').localeCompare(b.creator||''));}
  else if(f.sort==='rating-desc'){filtered.sort((a,b)=>parseInt(b.user_rating||'0',10)-parseInt(a.user_rating||'0',10));}
  if(!q && f.sort==='newest'){/* keep order */} else { if(!q && !Object.values(f).some(v=>v)) shuffle(filtered); }
  body.style.display='block';rowHeader.style.display='grid';body.innerHTML='';
  if(!filtered.length){const e=document.createElement('div');e.className='empty';e.textContent='No entries found.';body.appendChild(e);return;}
  pageItems.forEach(item=>{
    const row=document.createElement('div');row.className='row';
    const c1=document.createElement('div');c1.className='cell';
    const tw=document.createElement('div');tw.className='title-wrapper';
    const dot=document.createElement('span');dot.className='status-dot status-'+item.status;
    const ts=document.createElement('span');ts.className='cell-title';ts.textContent=item.video_title||'';
    tw.appendChild(dot);tw.appendChild(ts);
    const sub=document.createElement('div');sub.className='cell-subtitle';sub.textContent=(item.creator||'Unknown')+' \u2022 '+(item.verified||'');
    c1.appendChild(tw);c1.appendChild(sub);
    const c2=document.createElement('div');c2.className='cell';
    const why=document.createElement('div');why.className='cell-subtitle';why.style.cssText='white-space:normal;line-height:1.4;';why.textContent=item.why_this||'No rationale';
    c2.appendChild(why);
    const parts=[];if(item.dedup_key)parts.push('id:'+item.dedup_key);
    if(item.user_rating&&item.user_rating!=='unset')parts.push('\u2605 '+item.user_rating);
    if(parts.length){const md=document.createElement('div');md.className='cell-meta';md.style.marginTop='4px';md.textContent=parts.join(' \u2022 ');c2.appendChild(md);}
    if(item.user_review){const rd=document.createElement('div');rd.className='cell-subtitle';rd.style.cssText='margin-top:4px;font-style:italic;color:var(--accent);';rd.textContent='"'+item.user_review+'"';c2.appendChild(rd);}
    const c3=document.createElement('div');c3.className='cell';c3.style.alignItems='flex-end';
    const acts=document.createElement('div');acts.className='row-actions';
    const lnk=document.createElement('a');lnk.href=item.video_url||'#';lnk.target='_blank';lnk.className='btn btn-ghost';lnk.title='Open';lnk.textContent='\u2197';acts.appendChild(lnk);
    if(item.status==='active'){const rj=document.createElement('button');rj.className='btn btn-outline';rj.textContent='Reject';rj.onclick=()=>openReview(item.id,'rejected');acts.appendChild(rj);const cn=document.createElement('button');cn.className='btn btn-primary';cn.textContent='Consume';cn.onclick=()=>openReview(item.id,'consumed');acts.appendChild(cn);}
    else{const ed=document.createElement('button');ed.className='btn btn-outline';ed.textContent='Edit';ed.onclick=()=>openReview(item.id,item.status);acts.appendChild(ed);}
    const cp2=document.createElement('button');cp2.className='btn btn-ghost';cp2.title='Copy MD';cp2.textContent='\uD83D\uDCCB';cp2.onclick=()=>copyMd(item.id);acts.appendChild(cp2);
    c3.appendChild(acts);row.appendChild(c1);row.appendChild(c2);row.appendChild(c3);body.appendChild(row);
  });updatePagination();
}

function setTab(tab,el){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');currentTab=tab;currentPage=1;const ft=document.querySelector('.filter-toggle');const ss=document.getElementById('sort');const show=tab==='active'||tab==='consumed'||tab==='rejected'||tab==='all';if(ft)ft.style.display=show?'':'none';if(ss)ss.style.display=show?'':'none';if(!show){const fp=document.getElementById('filter-panel');if(fp)fp.classList.remove('open');}render();}
currentPage=1;
function handleSearch(){render();}

function toggleFilters(){
  const p=document.getElementById('filter-panel');
  p.classList.toggle('open');
}

function clearFilters(){
  document.getElementById('filter-author').value='';
  document.getElementById('filter-type').value='';
  document.getElementById('filter-rating').value='';
  document.getElementById('filter-date-from').value='';
  document.getElementById('filter-date-to').value='';
  updateFilterBadge();
  handleSearch();
}

function getActiveFilters(){
  return {
    author: document.getElementById('filter-author')?.value || '',
    type: document.getElementById('filter-type')?.value || '',
    rating: parseInt(document.getElementById('filter-rating')?.value || '0', 10) || 0,
    dateFrom: document.getElementById('filter-date-from')?.value || '',
    dateTo: document.getElementById('filter-date-to')?.value || '',
    sort: document.getElementById('sort')?.value || 'newest',
  };
}

function updateFilterBadge(){
  const f=getActiveFilters();
  const count=(f.author?1:0)+(f.type?1:0)+(f.rating?1:0)+(f.dateFrom?1:0)+(f.dateTo?1:0);
  const badge=document.getElementById('filter-badge');
  const toggle=document.querySelector('.filter-toggle');
  if(count>0){badge.style.display='inline-block';badge.textContent=count;toggle.classList.add('active');}
  else{badge.style.display='none';toggle.classList.remove('active');}
}

function populateFilterOptions(){
  if(!data)return;
  const authors=new Set();const types=new Set();
  data.forEach(r=>{
    if(r.creator)authors.add(r.creator);
    if(r.content_type)types.add(r.content_type);
  });
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const aSel=document.getElementById('filter-author');
  const tSel=document.getElementById('filter-type');
  if(aSel){
    const cur=aSel.value;
    aSel.innerHTML='<option value="">All authors</option>'+
      Array.from(authors).sort().map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('');
    aSel.value=cur;
  }
  if(tSel){
    const cur=tSel.value;
    tSel.innerHTML='<option value="">All types</option>'+
      Array.from(types).sort().map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join('');
    tSel.value=cur;
  }
}
function openPushModal(){document.querySelectorAll('#modal-push .form-input,#modal-push .form-textarea').forEach(i=>i.value='');document.getElementById('modal-push').classList.add('open');}
function openReview(id,targetStatus){const item=data.find(i=>i.id===id);if(!item)return;document.getElementById('review-id').value=id;document.getElementById('review-status').value=targetStatus;const titleEl=document.getElementById('review-title');if(targetStatus==='consumed')titleEl.textContent='Consume & Review';else if(targetStatus==='rejected')titleEl.textContent='Reject Entry';else titleEl.textContent='Edit Review';document.getElementById('review-rating').value=item.user_rating!=='unset'?(item.user_rating||''):'';document.getElementById('review-notes').value=item.user_review||'';document.getElementById('modal-review').classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
async function submitPush(){const payload={video_title:document.getElementById('push-title').value.trim(),creator:document.getElementById('push-creator').value.trim(),content_type:document.getElementById('push-type').value.trim()||'video',video_url:document.getElementById('push-url').value.trim(),why_this:document.getElementById('push-why').value.trim(),dedup_key:document.getElementById('push-dedup').value.trim()||'key-'+Date.now(),synergy_bundle_id:document.getElementById('push-synergy').value.trim()||'unset',verified:new Date().toISOString().split('T')[0]};if(!payload.video_title||!payload.video_url)return showToast('Title and URL required');try{await fetch('/recommendations/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});showToast('Entry pushed');closeModal('modal-push');fetchRecs();}catch{showToast('Error pushing entry');}}
async function submitReview(){const payload={id:document.getElementById('review-id').value,status:document.getElementById('review-status').value,user_rating:document.getElementById('review-rating').value.trim()||'unset',user_review:document.getElementById('review-notes').value.trim(),consumed_date:new Date().toISOString().split('T')[0]};try{await fetch('/recommendations/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});showToast('Review committed');closeModal('modal-review');fetchRecs();}catch{showToast('Error committing review');}}
function copyMd(id){const item=data.find(i=>i.id===id);if(!item)return;const md='| '+item.video_title+' | '+(item.creator||'')+' | '+item.video_url+' | '+(item.why_this||'')+' | '+(item.verified||'')+' | '+item.status+' | '+(item.user_rating||'unset')+' | '+item.dedup_key+' | '+(item.consumed_date||'unset')+' |';navigator.clipboard.writeText(md);showToast('Markdown copied');}
function copySuperPrompt(){if(statsData){navigator.clipboard.writeText(buildSuperPrompt(statsData));showToast('Mega-Prompt copied!');}else{showToast('Loading stats...');fetchStats();}}
function updatePagination(){const pg=document.getElementById("pagination");const info=document.getElementById("page-info");const prev=document.getElementById("btn-prev");const next=document.getElementById("btn-next");const max=Math.ceil(totalItems/pageSize)||1;if(max<=1){pg.style.display="none";return;}pg.style.display="flex";info.textContent="Page "+currentPage+" of "+max+" ("+totalItems+" items)";prev.disabled=currentPage<=1;next.disabled=currentPage>=max;}

function prevPage(){if(currentPage>1){currentPage--;render();}}
function nextPage(){const max=Math.ceil(totalItems/pageSize)||1;if(currentPage<max){currentPage++;render();}}

function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}
fetchRecs();</script>
</body>
</html>`



app.get('/', (c) => c.html(htmlPage))
app.get('/ui', (c) => c.html(htmlPage))

app.get('/recommendations/list', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  const status = c.req.query('status')
  const q = c.req.query('q')
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 200)
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0)
  const contentType = c.req.query('content_type')

  const where: string[] = []
  const bindings: (string | number)[] = []

  if (status) {
    if (!VALID_STATUS.has(status)) return c.json({ error: 'invalid status' }, 400)
    where.push('status = ?')
    bindings.push(status)
  }
  if (contentType) {
    where.push('content_type = ?')
    bindings.push(contentType)
  }
  if (q) {
    where.push('(video_title LIKE ? OR creator LIKE ? OR why_this LIKE ?)')
    const like = `%${q}%`
    bindings.push(like, like, like)
  }

  const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''

  try {
    const [rows, countRow] = await Promise.all([
      DB.prepare(`SELECT * FROM recommendations${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset).all<Recommendation>(),
      DB.prepare(`SELECT COUNT(*) as c FROM recommendations${whereClause}`)
        .bind(...bindings).first<{c:number}>()
    ])
    return c.json({ recommendations: rows.results, total: countRow?.c || 0, limit, offset })
  } catch (err) {
    return c.json(safeError('List failed')(err), 500)
  }
})

app.post('/recommendations/push', async (c) => {
  const { DB } = c.env
  let body: Partial<Recommendation> | Partial<Recommendation>[]

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const items = Array.isArray(body) ? body : [body]
  const today = new Date().toISOString().split('T')[0]
  const stmts: D1PreparedStatement[] = []

  try {
    for (const item of items) {
      if (!item.video_title || !item.video_url) continue
      if (!isNonEmptyStr(item.video_title, 500)) continue
      if (!isValidUrl(item.video_url)) continue
      if (item.status && !VALID_STATUS.has(item.status)) continue
      if (item.user_rating && !VALID_RATINGS.has(item.user_rating)) continue

      const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const dedupKey = item.dedup_key || `key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      stmts.push(
        DB.prepare(
          `INSERT INTO recommendations (
            id, video_title, creator, content_type, video_url, why_this, verified, status,
            user_rating, user_review, dedup_key, synergy_bundle_id, consumed_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(dedup_key) DO UPDATE SET
            video_title = excluded.video_title,
            creator = excluded.creator,
            content_type = excluded.content_type,
            video_url = excluded.video_url,
            why_this = excluded.why_this,
            verified = excluded.verified,
            status = excluded.status,
            user_rating = excluded.user_rating,
            user_review = excluded.user_review,
            synergy_bundle_id = excluded.synergy_bundle_id,
            consumed_date = excluded.consumed_date`
        ).bind(
          id,
          item.video_title,
          item.creator || null,
          item.content_type || null,
          item.video_url,
          item.why_this || null,
          item.verified || today,
          item.status || 'active',
          item.user_rating || 'unset',
          item.user_review || null,
          dedupKey,
          item.synergy_bundle_id || 'unset',
          item.consumed_date || 'unset'
        )
      )
    }
    if (stmts.length === 0) return c.json({ ok: true, count: 0 })
    await DB.batch(stmts)
  } catch (err) {
    return c.json(safeError('Push failed')(err), 500)
  }

  return c.json({ ok: true, count: items.length })
})

app.post('/recommendations/action', async (c) => {
  const { DB } = c.env
  let body: {
    id: string
    status: 'active' | 'consumed' | 'rejected'
    user_rating?: string
    user_review?: string
    consumed_date?: string
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!body.id || !body.status) {
    return c.json({ error: 'id and status required' }, 400)
  }
  if (!isNonEmptyStr(body.id, 100)) {
    return c.json({ error: 'id required' }, 400)
  }
  if (!VALID_STATUS.has(body.status)) {
    return c.json({ error: 'invalid status' }, 400)
  }
  if (body.user_rating && !VALID_RATINGS.has(body.user_rating)) {
    return c.json({ error: 'invalid rating' }, 400)
  }
  if (body.user_review && !isNonEmptyStr(body.user_review, 5000)) {
    return c.json({ error: 'review too long' }, 400)
  }

  const consumedDate = body.status === 'consumed'
    ? (body.consumed_date || new Date().toISOString().split('T')[0])
    : null

  try {
    await DB.prepare(
      `UPDATE recommendations 
       SET status = ?, 
           user_rating = COALESCE(?, user_rating), 
           user_review = COALESCE(?, user_review),
           consumed_date = COALESCE(?, consumed_date)
       WHERE id = ?`
    ).bind(
      body.status,
      body.user_rating || null,
      body.user_review || null,
       consumedDate,
       body.id
     ).run()
  } catch (err) {
    return c.json(safeError('Action failed')(err), 500)
  }

  return c.json({ ok: true })
})

app.post('/recommendations/delete', async (c) => {
  const { DB } = c.env
  let body: { id: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (!body.id) {
    return c.json({ error: 'id required' }, 400)
  }
  if (!isNonEmptyStr(body.id, 100)) {
    return c.json({ error: 'id required' }, 400)
  }
  try {
    await DB.prepare('DELETE FROM recommendations WHERE id = ?').bind(body.id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Delete failed')(err), 500)
  }
})

app.get('/recommendations/export', async (c) => {
  const { DB } = c.env
  const format = c.req.query('format') || 'json'
  try {
    const result = await DB.prepare('SELECT * FROM recommendations ORDER BY created_at DESC').all<Recommendation>()
    const items = result.results || []

    if (format === 'md') {
      const header = '| Title | Creator | URL | Why | Status | Rating | Review | Tags |\n| --- | --- | --- | --- | --- | --- | --- | --- |'
      const rows = items.map(i =>
        `| ${i.video_title} | ${i.creator || ''} | ${i.video_url} | ${i.why_this || ''} | ${i.status} | ${i.user_rating || ''} | ${i.user_review || ''} | ${i.synergy_bundle_id || ''} |`
      ).join('\n')
      return new Response(header + '\n' + rows, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="taste-map-export.md"' }
      })
    }
    return c.json({ exported_at: new Date().toISOString(), total: items.length, recommendations: items })
  } catch (err) {
    return c.json(safeError('Export failed')(err), 500)
  }
})

app.get('/html/list', async (c) => {
  const { DB } = c.env
  try {
    const result = await DB.prepare('SELECT id, filename, created_at, length(content) as size FROM html_files ORDER BY created_at DESC').all()
    return new Response(JSON.stringify({ files: result.results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
  } catch (err) {
    return c.json(safeError('List failed')(err), 500)
  }
})

app.post('/html/upload', async (c) => {
  const { DB } = c.env
  try {
    const { filename, content } = await c.req.json<{ filename: string; content: string }>()
    if (!filename || !content) {
      return c.json({ error: 'Filename and content required' }, 400)
    }
    if (!isNonEmptyStr(filename, 255)) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    if (!isNonEmptyStr(content, 8 * 1024 * 1024)) {
      return c.json({ error: 'Content too large (max 8MB)' }, 413)
    }
    const id = `html_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    await DB.prepare('INSERT INTO html_files (id, filename, content) VALUES (?, ?, ?)').bind(id, filename, content).run()
    return c.json({ ok: true, id })
  } catch (err) {
    return c.json(safeError('Upload failed')(err), 500)
  }
})

app.get('/html/download/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  try {
    const file = await DB.prepare('SELECT filename, content FROM html_files WHERE id = ?').bind(id).first<{ filename: string; content: string }>()
    if (!file) {
      return c.text('File not found', 404)
    }
    const isPdf = file.filename.endsWith('.pdf')
    const body = isPdf
      ? Uint8Array.from(atob(file.content), c => c.charCodeAt(0))
      : file.content
    return new Response(body, {
      headers: {
        'Content-Type': isPdf ? 'application/pdf' : 'text/html; charset=utf-8',
        'Content-Disposition': `${isPdf ? 'inline' : 'inline'}; filename="${encodeURIComponent(file.filename)}"`
      }
    })
  } catch (err) {
    console.error('[html/download]', err)
    return c.text('Download failed', 500)
  }
})

app.get('/stats', async (c) => {
  const { DB } = c.env
  c.header('Cache-Control', 'no-store')
  try {
    const [
      total,
      byStatus,
      byRating,
      byMonth,
      topCreators,
      recentConsumed,
      activeItems,
      bundles,
      allEntries,
      htmlVault,
    ] = await Promise.all([
      DB.prepare('SELECT COUNT(*) as c FROM recommendations').first<{c:number}>(),
      DB.prepare('SELECT status, COUNT(*) as c FROM recommendations GROUP BY status').all<{status:string,c:number}>(),
      DB.prepare("SELECT user_rating, COUNT(*) as c FROM recommendations WHERE status='consumed' AND user_rating != 'unset' AND user_rating != '' GROUP BY user_rating ORDER BY c DESC").all<{user_rating:string,c:number}>(),
      DB.prepare("SELECT substr(consumed_date,1,7) as m, COUNT(*) as c FROM recommendations WHERE status='consumed' AND consumed_date != 'unset' GROUP BY m ORDER BY m ASC").all<{m:string,c:number}>(),
      DB.prepare("SELECT creator, COUNT(*) as c FROM recommendations WHERE creator IS NOT NULL AND creator != '' GROUP BY creator ORDER BY c DESC LIMIT 15").all<{creator:string,c:number}>(),
      DB.prepare("SELECT video_title, creator, user_rating, user_review, consumed_date FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 25").all(),
      DB.prepare("SELECT video_title, creator, why_this, created_at FROM recommendations WHERE status='active' ORDER BY created_at DESC LIMIT 25").all(),
      DB.prepare("SELECT synergy_bundle_id, COUNT(*) as c FROM recommendations WHERE synergy_bundle_id != 'unset' GROUP BY synergy_bundle_id ORDER BY c DESC").all<{synergy_bundle_id:string,c:number}>(),
      DB.prepare('SELECT video_title, creator, status, user_rating, user_review, why_this, synergy_bundle_id, created_at FROM recommendations ORDER BY created_at ASC').all(),
      DB.prepare('SELECT id, filename, created_at, length(content) as size FROM html_files ORDER BY created_at DESC').all(),
    ])

    const s: Record<string, number> = {}
    for (const r of (byStatus?.results || [])) s[r.status] = r.c

    return c.json({
      total: total?.c || 0,
      byStatus: s,
      ratingDistribution: byRating?.results || [],
      consumptionByMonth: byMonth?.results || [],
      topCreators: topCreators?.results || [],
      recentConsumed: recentConsumed?.results || [],
      activeItems: activeItems?.results || [],
      bundles: bundles?.results || [],
      allEntries: allEntries?.results || [],
      htmlVault: htmlVault?.results || []
    })
  } catch (err) {
    return c.json(safeError('Stats failed')(err), 500)
  }
})

app.post('/html/update/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  try {
    const { filename, content } = await c.req.json<{ filename?: string; content?: string }>()
    if (content === undefined && filename === undefined) {
      return c.json({ error: 'filename or content required' }, 400)
    }
    if (content !== undefined) {
      if (content.length === 0) {
        return c.json({ error: 'Content cannot be empty' }, 400)
      }
      if (content.length > 8 * 1024 * 1024) {
        return c.json({ error: 'Content too large (max 8MB)' }, 413)
      }
    }
    if (filename !== undefined && !isNonEmptyStr(filename, 255)) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    if (filename !== undefined && content !== undefined) {
      await DB.prepare('UPDATE html_files SET filename = ?, content = ? WHERE id = ?').bind(filename, content, id).run()
    } else if (filename !== undefined) {
      await DB.prepare('UPDATE html_files SET filename = ? WHERE id = ?').bind(filename, id).run()
    } else {
      await DB.prepare('UPDATE html_files SET content = ? WHERE id = ?').bind(content, id).run()
    }
    return c.json({ ok: true, id })
  } catch (err) {
    return c.json(safeError('Update failed')(err), 500)
  }
})

app.post('/html/delete', async (c) => {
  const { DB } = c.env
  try {
    const { id } = await c.req.json<{ id: string }>()
    if (!id) return c.json({ error: 'ID required' }, 400)
    if (!isNonEmptyStr(id, 100)) return c.json({ error: 'ID required' }, 400)
    await DB.prepare('DELETE FROM html_files WHERE id = ?').bind(id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Delete failed')(err), 500)
  }
})

// ====== LEARNING LOG API ======

app.get('/learning/heatmap', async (c) => {
  const { DB } = c.env
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const startDate = yearAgo.toISOString().split('T')[0]
  try {
    const result = await DB.prepare(
      'SELECT date, count, topics FROM learning_log WHERE date >= ? ORDER BY date ASC'
    ).bind(startDate).all()
    const days: { date: string; count: number; topics: string }[] = []
    const rows = result.results || []
    const map = new Map<string, { date: string; count: number; topics: string }>()
    for (const row of rows) {
      const r = row as any
      map.set(r.date, { date: r.date, count: r.count, topics: r.topics || '' })
    }
    // Fill gaps
    for (let d = new Date(yearAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0]
      if (map.has(key)) days.push(map.get(key)!)
      else days.push({ date: key, count: 0, topics: '' })
    }
    return c.json({ days })
  } catch (err) {
    return c.json(safeError('Heatmap failed')(err), 500)
  }
})

app.post('/learning/log', async (c) => {
  const { DB } = c.env
  try {
    const { date, topics } = await c.req.json<{ date?: string; topics?: string }>()
    const logDate = date || new Date().toISOString().split('T')[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return c.json({ error: 'invalid date format (YYYY-MM-DD)' }, 400)
    }
    const topicStr = (topics || '').slice(0, 2000)
    await DB.prepare(
      `INSERT INTO learning_log (date, count, topics) VALUES (?, 1, ?)
       ON CONFLICT(date) DO UPDATE SET
         count = count + 1,
         topics = CASE
           WHEN ? != '' AND learning_log.topics != '' THEN learning_log.topics || ', ' || ?
           WHEN ? != '' THEN ?
           ELSE learning_log.topics
         END`
    ).bind(logDate, topicStr, topicStr, topicStr, topicStr, topicStr).run()
    return c.json({ ok: true, date: logDate })
  } catch (err) {
    return c.json(safeError('Log failed')(err), 500)
  }
})

// GET /learning/detail — returns per-date topic details for a date range
app.get('/learning/detail', async (c) => {
  const { DB } = c.env
  const date = c.req.query('date')
  const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const startDate = date || yearAgo.toISOString().split('T')[0]
  const endDate = date || new Date().toISOString().split('T')[0]
  try {
    const result = await DB.prepare(
      'SELECT date, count, topics FROM learning_log WHERE date >= ? AND date <= ? ORDER BY date DESC'
    ).bind(startDate, endDate).all()
    return c.json({ days: result.results || [] })
  } catch (err) {
    return c.json(safeError('Detail failed')(err), 500)
  }
})

// DELETE /learning/delete — delete a day's entries
app.post('/learning/delete', async (c) => {
  const { DB } = c.env
  try {
    const { date } = await c.req.json<{ date: string }>()
    if (!date) return c.json({ error: 'date required' }, 400)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'invalid date' }, 400)
    await DB.prepare('DELETE FROM learning_log WHERE date = ?').bind(date).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Delete failed')(err), 500)
  }
})

// GET /html/print/:id — wraps HTML file in A4 print-friendly view with auto-print
app.get('/html/print/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  try {
    const file = await DB.prepare('SELECT filename, content FROM html_files WHERE id = ?').bind(id).first<{ filename: string; content: string }>()
    if (!file) {
      return c.text('File not found', 404)
    }

    const safeFilename = escapeHtml(file.filename)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Print — ${safeFilename}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 15mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Literata', Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
    padding: 20px;
    max-width: 720px;
    margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  .print-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #1a1a1a;
    color: #fff;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: system-ui, sans-serif;
    z-index: 9999;
  }
  .print-toolbar span { font-size: 14px; }
  .print-toolbar button {
    background: #fff;
    color: #1a1a1a;
    border: none;
    padding: 8px 20px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .print-toolbar button:hover { opacity: 0.9; }
  .print-content { margin-top: 60px; }

  @media print {
    .print-toolbar { display: none !important; }
    body { padding: 0; max-width: none; font-size: 11pt; }
    .print-content { margin-top: 0; }
    a { color: #000 !important; text-decoration: underline; word-wrap: break-word; }
    a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; }
    pre, code { background: #f5f5f5 !important; border: 1px solid #ddd; page-break-inside: avoid; font-size: 9pt; }
    h1, h2, h3, h4 { page-break-after: avoid; }
    img { max-width: 100% !important; page-break-inside: avoid; }
    section, .card, .block { break-inside: avoid; border: 1px solid #ccc !important; box-shadow: none !important; }
    p { orphans: 3; widows: 3; }
  }
</style>
</head>
<body>
<div class="print-toolbar no-print">
  <span>🖨️ ${safeFilename}</span>
  <button onclick="window.print()">Print / Save PDF</button>
</div>
<div class="print-content">
${file.content}
</div>
<script>
window.onload = function() {
  // Don't auto-print — let user click the button
};
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  } catch (err) {
    console.error('[html/print]', err)
    return c.text('Print view failed', 500)
  }
})

export default app
