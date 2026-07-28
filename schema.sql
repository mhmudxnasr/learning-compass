CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  video_title TEXT NOT NULL,
  creator TEXT,
  content_type TEXT DEFAULT 'video',
  video_url TEXT NOT NULL,
  why_this TEXT,
  verified TEXT,
  status TEXT DEFAULT 'active',
  user_rating TEXT DEFAULT 'unset',
  user_score REAL,
  user_review TEXT,
  dedup_key TEXT UNIQUE,
  synergy_bundle_id TEXT DEFAULT 'unset',
  consumed_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS html_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_log (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  topics TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_recs_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recs_dedup ON recommendations(dedup_key);
CREATE INDEX IF NOT EXISTS idx_recs_consumed_date ON recommendations(consumed_date);
CREATE INDEX IF NOT EXISTS idx_recs_content_type ON recommendations(content_type);
