-- Telegram updates are external retries, not new captures. Keep a small durable
-- receipt so the webhook cannot duplicate a capture or Queue response.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_updates_received ON telegram_updates(received_at);
