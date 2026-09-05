CREATE TABLE IF NOT EXISTS feed_entry_dismissals (
  feed_id TEXT NOT NULL REFERENCES feed_sources(id) ON DELETE CASCADE,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (feed_id, recommendation_id)
);
