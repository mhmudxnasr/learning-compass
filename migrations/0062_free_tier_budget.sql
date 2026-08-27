CREATE TABLE IF NOT EXISTS free_tier_usage_budget (
  day_utc TEXT PRIMARY KEY,
  estimated_rows_read INTEGER NOT NULL DEFAULT 0,
  estimated_rows_written INTEGER NOT NULL DEFAULT 0,
  read_requests INTEGER NOT NULL DEFAULT 0,
  write_requests INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
