-- Atomic reservation and request-fingerprint protection for idempotent mutations.
ALTER TABLE sync_mutations ADD COLUMN request_hash TEXT;

CREATE TABLE IF NOT EXISTS sync_mutation_locks (
  mutation_id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_mutation_locks_expiry ON sync_mutation_locks(expires_at);
