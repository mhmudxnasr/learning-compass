CREATE TABLE IF NOT EXISTS recommendation_meta (
  recommendation_id TEXT PRIMARY KEY,
  priority_rank INTEGER,
  branch_id TEXT,
  tags_json TEXT DEFAULT '[]',
  estimated_minutes INTEGER,
  source_metadata_json TEXT DEFAULT '{}',
  learning_state TEXT DEFAULT 'queued',
  started_at TEXT,
  last_opened_at TEXT,
  progress_percent REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT DEFAULT 'curate',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (collection_id, recommendation_id)
);

CREATE TABLE IF NOT EXISTS learning_sessions (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  status TEXT DEFAULT 'active',
  intent TEXT,
  reflection TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  returned_at TEXT,
  completed_at TEXT,
  duration_seconds INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON learning_sessions(status, started_at DESC);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  title TEXT NOT NULL,
  kind TEXT DEFAULT 'note',
  branch_id TEXT,
  source_url TEXT,
  source_artifact_id TEXT,
  status TEXT DEFAULT 'draft',
  revision INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);
CREATE TABLE IF NOT EXISTS note_sections (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT DEFAULT '',
  direction TEXT DEFAULT 'auto',
  position INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(note_id, section_key)
);
CREATE INDEX IF NOT EXISTS idx_notes_kind ON notes(kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  payload_json TEXT NOT NULL,
  result_json TEXT,
  idempotency_key TEXT UNIQUE,
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempts INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON agent_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS srs_drafts (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  note_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  topic TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS srs_review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  grade INTEGER NOT NULL,
  previous_state_json TEXT,
  next_state_json TEXT,
  reviewed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT DEFAULT 'related',
  evidence_json TEXT DEFAULT '[]',
  confidence REAL DEFAULT 0.5,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dashboard_layout (
  module_key TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  pinned INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  endpoint_json TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  r2_key TEXT,
  legacy_html_id TEXT,
  size_bytes INTEGER DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rating_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id TEXT NOT NULL,
  rating TEXT,
  score REAL,
  branch_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
