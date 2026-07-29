CREATE TABLE IF NOT EXISTS feed_sources (
  id TEXT PRIMARY KEY,
  feed_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  site_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  etag TEXT,
  last_modified TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed_entries (
  feed_id TEXT NOT NULL,
  guid TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (feed_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_feed_sources_enabled ON feed_sources(enabled, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_feed_entries_recommendation ON feed_entries(recommendation_id);
