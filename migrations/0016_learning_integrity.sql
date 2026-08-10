-- Additive integrity foundation. Existing REST identifiers remain canonical.
ALTER TABLE recommendations ADD COLUMN deleted_at TEXT;
ALTER TABLE recommendations ADD COLUMN lifecycle_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_jobs ADD COLUMN recommendation_id TEXT;
ALTER TABLE agent_jobs ADD COLUMN trigger_kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE agent_jobs ADD COLUMN workflow_run_id TEXT;
ALTER TABLE agent_jobs ADD COLUMN workflow_step TEXT;
ALTER TABLE learning_sessions ADD COLUMN thread_id TEXT;
ALTER TABLE learning_sessions ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'original';
ALTER TABLE learning_sessions ADD COLUMN target_artifact_id TEXT;
ALTER TABLE srs_cards ADD COLUMN unit_id TEXT;
ALTER TABLE srs_cards ADD COLUMN thread_id TEXT;
ALTER TABLE srs_cards ADD COLUMN scheduler_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE srs_drafts ADD COLUMN unit_id TEXT;
ALTER TABLE srs_drafts ADD COLUMN thread_id TEXT;
ALTER TABLE recommendation_outcomes ADD COLUMN learning_value REAL;
ALTER TABLE recommendation_outcomes ADD COLUMN applied_value REAL;
ALTER TABLE recommendation_outcomes ADD COLUMN rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS integrity_quarantine (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolution TEXT,
  UNIQUE(entity_type, entity_id, reason)
);

CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','system','agent')),
  evidence_weight REAL NOT NULL DEFAULT 0,
  thread_id TEXT,
  recommendation_id TEXT,
  unit_id TEXT,
  session_id TEXT,
  evidence_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  schema_version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_learning_events_thread ON learning_events(thread_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_source ON learning_events(recommendation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_evidence ON learning_events(evidence_weight, occurred_at DESC);

UPDATE agent_jobs
SET recommendation_id=json_extract(payload_json,'$.recommendation_id')
WHERE recommendation_id IS NULL AND json_extract(payload_json,'$.recommendation_id') IS NOT NULL;

INSERT OR IGNORE INTO integrity_quarantine(entity_type,entity_id,reason,payload_json)
SELECT 'recommendation_meta',m.recommendation_id,'missing_recommendation',json_object('recommendation_id',m.recommendation_id,'learning_state',m.learning_state,'source_metadata_json',m.source_metadata_json)
FROM recommendation_meta m LEFT JOIN recommendations r ON r.id=m.recommendation_id WHERE r.id IS NULL;
INSERT OR IGNORE INTO integrity_quarantine(entity_type,entity_id,reason,payload_json)
SELECT 'learning_session',s.id,'missing_recommendation',json_object('id',s.id,'recommendation_id',s.recommendation_id,'status',s.status,'reflection',s.reflection)
FROM learning_sessions s LEFT JOIN recommendations r ON r.id=s.recommendation_id WHERE s.recommendation_id IS NOT NULL AND r.id IS NULL;
INSERT OR IGNORE INTO integrity_quarantine(entity_type,entity_id,reason,payload_json)
SELECT 'note',n.id,'missing_recommendation',json_object('id',n.id,'recommendation_id',n.recommendation_id,'title',n.title,'kind',n.kind)
FROM notes n LEFT JOIN recommendations r ON r.id=n.recommendation_id WHERE n.recommendation_id IS NOT NULL AND r.id IS NULL;
INSERT OR IGNORE INTO integrity_quarantine(entity_type,entity_id,reason,payload_json)
SELECT 'srs_review_event',CAST(e.id AS TEXT),'missing_card',json_object('id',e.id,'card_id',e.card_id,'grade',e.grade,'reviewed_at',e.reviewed_at)
FROM srs_review_events e LEFT JOIN srs_cards c ON c.id=e.card_id WHERE c.id IS NULL;

CREATE TRIGGER IF NOT EXISTS integrity_meta_source_insert
BEFORE INSERT ON recommendation_meta
WHEN NOT EXISTS (SELECT 1 FROM recommendations WHERE id=NEW.recommendation_id)
BEGIN SELECT RAISE(ABORT,'recommendation_meta source missing'); END;
CREATE TRIGGER IF NOT EXISTS integrity_session_source_insert
BEFORE INSERT ON learning_sessions
WHEN NEW.recommendation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recommendations WHERE id=NEW.recommendation_id)
BEGIN SELECT RAISE(ABORT,'learning session source missing'); END;
CREATE TRIGGER IF NOT EXISTS integrity_note_source_insert
BEFORE INSERT ON notes
WHEN NEW.recommendation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recommendations WHERE id=NEW.recommendation_id)
BEGIN SELECT RAISE(ABORT,'note source missing'); END;
CREATE TRIGGER IF NOT EXISTS integrity_review_card_insert
BEFORE INSERT ON srs_review_events
WHEN NOT EXISTS (SELECT 1 FROM srs_cards WHERE id=NEW.card_id)
BEGIN SELECT RAISE(ABORT,'review card missing'); END;
