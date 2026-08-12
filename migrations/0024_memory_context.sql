-- Deterministic, provenance-first memory retrieval.  Memory remains supporting
-- context; profile assertions and learning records retain their existing owners.

CREATE TABLE IF NOT EXISTS memory_evidence (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES hermes_memory(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL DEFAULT 'source',
  recommendation_id TEXT,
  thread_id TEXT,
  unit_id TEXT,
  learning_event_id TEXT,
  source_ref TEXT,
  quote TEXT,
  reason TEXT,
  confidence REAL CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_evidence_memory ON memory_evidence(memory_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_evidence_source ON memory_evidence(recommendation_id,thread_id,unit_id,learning_event_id);

CREATE TABLE IF NOT EXISTS memory_retrieval_receipts (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  conversation_id TEXT,
  task_kind TEXT NOT NULL,
  query_text TEXT,
  selected_memory_ids_json TEXT NOT NULL DEFAULT '[]',
  considered_memory_ids_json TEXT NOT NULL DEFAULT '[]',
  exclusions_json TEXT NOT NULL DEFAULT '[]',
  packet_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_receipts_task ON memory_retrieval_receipts(task_kind,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_receipts_conversation ON memory_retrieval_receipts(conversation_id,created_at DESC);
