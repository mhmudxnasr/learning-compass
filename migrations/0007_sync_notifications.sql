-- Idempotent browser mutations and verifiable reminder delivery.
CREATE TABLE IF NOT EXISTS sync_mutations (
  mutation_id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_mutations_updated ON sync_mutations(updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  target TEXT,
  event_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  attempted_at TEXT DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recent ON notification_deliveries(attempted_at DESC);
