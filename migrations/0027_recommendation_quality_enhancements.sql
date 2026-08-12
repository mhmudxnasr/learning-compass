CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  period_days INTEGER NOT NULL DEFAULT 30,
  accept_rate REAL,
  avg_rating REAL,
  rating_distribution_json TEXT,
  lane_balance_json TEXT,
  format_diversity REAL,
  avg_novelty_score REAL,
  avg_time_to_consume_days REAL,
  resurfacing_recall_rate REAL,
  total_consumed INTEGER DEFAULT 0,
  total_rejected INTEGER DEFAULT 0,
  exploration_rate REAL,
  session_context_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date ON analytics_snapshots(snapshot_date);

CREATE TABLE IF NOT EXISTS recommendation_engagement (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  value REAL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_rec ON recommendation_engagement(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_engagement_type ON recommendation_engagement(event_type);

ALTER TABLE recommendations ADD COLUMN activated_at TEXT;

CREATE TABLE IF NOT EXISTS session_consumption_log (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL,
  format TEXT,
  topic TEXT,
  branch_id TEXT,
  consumed_at TEXT NOT NULL DEFAULT (datetime('now')),
  engagement_duration_minutes REAL,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id)
);
CREATE INDEX IF NOT EXISTS idx_session_log_time ON session_consumption_log(consumed_at);
