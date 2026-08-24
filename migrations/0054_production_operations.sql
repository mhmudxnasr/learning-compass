-- Production operations: durable Telegram retries, acknowledged historical
-- integrity records, and verified local recovery receipts.

ALTER TABLE telegram_updates ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE telegram_updates ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE telegram_updates ADD COLUMN result_id TEXT;
ALTER TABLE telegram_updates ADD COLUMN error TEXT;
ALTER TABLE telegram_updates ADD COLUMN completed_at TEXT;
ALTER TABLE telegram_updates ADD COLUMN updated_at TEXT;
UPDATE telegram_updates SET completed_at=COALESCE(completed_at,received_at),updated_at=COALESCE(updated_at,received_at) WHERE status='completed';
CREATE INDEX IF NOT EXISTS idx_telegram_updates_status ON telegram_updates(status,received_at);

CREATE TABLE IF NOT EXISTS recovery_backups (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('running','verified','failed')),
  storage_target TEXT NOT NULL,
  d1_sha256 TEXT,
  d1_bytes INTEGER,
  artifact_count INTEGER NOT NULL DEFAULT 0,
  artifact_bytes INTEGER NOT NULL DEFAULT 0,
  manifest_sha256 TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  restore_rehearsed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_recovery_backups_recent ON recovery_backups(status,created_at DESC);

INSERT OR IGNORE INTO integrity_quarantine(entity_type,entity_id,reason,payload_json)
SELECT 'srs_review_event',CAST(e.id AS TEXT),'missing_card',json_object(
  'id',e.id,
  'card_id',e.card_id,
  'grade',e.grade,
  'reviewed_at',e.reviewed_at,
  'previous_state_json',e.previous_state_json,
  'next_state_json',e.next_state_json
)
FROM srs_review_events e
LEFT JOIN srs_cards c ON c.id=e.card_id
WHERE c.id IS NULL;

UPDATE integrity_quarantine
SET resolved_at=COALESCE(resolved_at,datetime('now')),
    resolution=COALESCE(resolution,'Historical review preserved in quarantine; its deleted legacy card cannot be reconstructed safely.')
WHERE entity_type='srs_review_event'
  AND reason='missing_card';
