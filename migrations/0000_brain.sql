-- ============================================================
-- TASTE MAP ENGINE — canonical brain tables
-- Adds: profile, tree nodes, tree edges, patterns, blacklist,
--        mastered, priorities, update log, leaf notes
-- ============================================================

-- Profile singleton — one row, the source of truth for stable prefs
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  identity_json TEXT,
  mega_priority_json TEXT,
  core_filter TEXT,
  reaction_style_json TEXT,
  quality_rules_json TEXT,
  operational_style_json TEXT,
  patterns_summary_json TEXT,
  recent_signal TEXT,
  last_synced_at TEXT
);

-- Tree nodes — every node (root, category, branch, leaf)
CREATE TABLE IF NOT EXISTS tree_nodes (
  id TEXT PRIMARY KEY,           -- kebab-case, stable
  type TEXT NOT NULL,            -- 'root' | 'category' | 'branch' | 'leaf'
  label TEXT NOT NULL,
  super_category TEXT,           -- for grouping in the UI
  parent_id TEXT,
  status TEXT,                   -- 'locked' | 'love' | 'fresh' | 'standard' | 'held' | 'pruned'
  round_label TEXT,              -- R1, R2, R3, R4, R5
  meta_json TEXT,                -- free-form: depth, notes, color
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tree_parent ON tree_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_tree_super ON tree_nodes(super_category);
CREATE INDEX IF NOT EXISTS idx_tree_status ON tree_nodes(status);

-- Confirmed patterns
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,           -- kebab-case pattern id
  description TEXT NOT NULL,
  evidence_json TEXT,            -- JSON array of evidence refs
  confirmed_date TEXT,
  strength TEXT,                 -- 'weak' | 'confirmed' | 'locked'
  branch_ids_json TEXT,          -- branches it applies to
  notes TEXT
);

-- Blacklist entries
CREATE TABLE IF NOT EXISTS blacklist (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  work TEXT,
  reason TEXT,
  severity INTEGER DEFAULT 3,    -- 1-5
  added_at TEXT DEFAULT (datetime('now'))
);

-- Mastered — topics + books
CREATE TABLE IF NOT EXISTS mastered (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,            -- 'topic' | 'book'
  label TEXT NOT NULL,           -- e.g. 'dopamine-reward' or 'Predictably Irrational'
  author TEXT,
  rating TEXT,                   -- '10/10' | '5/5' | 'mastered'
  notes TEXT,
  mastered_at TEXT DEFAULT (datetime('now')),
  decay_review_at TEXT           -- 12mo later
);

-- Mega-deep priority order
CREATE TABLE IF NOT EXISTS priorities (
  rank INTEGER PRIMARY KEY,
  branch_id TEXT NOT NULL,       -- e.g. 'taz', 'fina', 'persu'
  label TEXT,
  rationale TEXT
);

-- Update log — append-only history of significant events
CREATE TABLE IF NOT EXISTS update_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  kind TEXT,                     -- 'feedback' | 'tree_change' | 'pattern' | 'note' | 'system'
  summary TEXT NOT NULL,
  details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_ts ON update_log(ts DESC);

-- Resurfacing queue — generated from consumed 8+ items
CREATE TABLE IF NOT EXISTS resurfacing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id TEXT,
  stage TEXT,                    -- '30d' | '90d' | '180d'
  due_at TEXT,
  resolved_at TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_resurface_due ON resurfacing(due_at, resolved_at);

-- Contradictions — pairs of consumed leaves with conflicting claims
CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  source_a TEXT,
  source_b TEXT,
  topic TEXT,
  tension TEXT,
  detected_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- FTS5 unified search index (auto-sync from recommendations, tree_nodes, html_files)
CREATE VIRTUAL TABLE IF NOT EXISTS search_idx USING fts5(
  source,    -- 'rec' | 'node' | 'vault'
  ref_id,    -- id in source table
  text,      -- searchable text blob
  content='search_idx',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Undo queue: rows staged for soft-delete, auto-purged after expiry
CREATE TABLE IF NOT EXISTS undo_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  snapshot_json TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_undo_expires ON undo_queue(expires_at);

-- Spaced Repetition System (SRS) Active Recall Cards
CREATE TABLE IF NOT EXISTS srs_cards (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  topic TEXT,
  ease_factor REAL DEFAULT 5.0,
  interval_days INTEGER DEFAULT 1,
  repetitions INTEGER DEFAULT 0,
  due_at TEXT DEFAULT (date('now')),
  last_reviewed_at TEXT,
  difficulty REAL DEFAULT 5.0,
  stability REAL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_cards(due_at);

-- Agent Action & Model Audit Log
CREATE TABLE IF NOT EXISTS agent_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT,
  status TEXT
);

-- Dynamic Taste Vector & Weighting Matrix
CREATE TABLE IF NOT EXISTS taste_vectors (
  topic TEXT PRIMARY KEY,
  affinity_score REAL DEFAULT 1.0,  -- 0.0 to 5.0 scale based on rating history
  consumption_count INTEGER DEFAULT 0,
  last_consumed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Key-Value store for internal scheduler state
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT
);

