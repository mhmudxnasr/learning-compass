-- Hermes cockpit, source-anchored annotations, and durable agent receipts.
-- All three tables are additive. D1 remains the canonical owner of mutable
-- learning state; annotations and receipts are evidence/operations records.

CREATE TABLE IF NOT EXISTS source_annotations (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  artifact_id TEXT,
  thread_id TEXT REFERENCES learning_threads(id) ON DELETE SET NULL,
  branch_id TEXT,
  locator_type TEXT NOT NULL CHECK(locator_type IN ('web','pdf','video','epub','artifact','text')),
  selector_json TEXT NOT NULL DEFAULT '{}',
  quote TEXT NOT NULL,
  context_before TEXT,
  context_after TEXT,
  language TEXT,
  source_checksum TEXT,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK(created_by IN ('user','agent','system')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_source_annotations_source ON source_annotations(recommendation_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_annotations_thread ON source_annotations(thread_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_annotations_branch ON source_annotations(branch_id,status,created_at DESC);

ALTER TABLE unit_anchors ADD COLUMN annotation_id TEXT REFERENCES source_annotations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_unit_anchors_annotation ON unit_anchors(annotation_id);

ALTER TABLE notes ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE srs_drafts ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS agent_receipts (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  agent_name TEXT NOT NULL,
  intent TEXT NOT NULL,
  target TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  receipt_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_receipts_recent ON agent_receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_receipts_target ON agent_receipts(target,created_at DESC);
