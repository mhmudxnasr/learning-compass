CREATE TABLE IF NOT EXISTS learning_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  thread_type TEXT NOT NULL CHECK(thread_type IN ('understand','decide','build','practice')),
  guiding_question TEXT NOT NULL,
  why_now TEXT,
  definition_of_done TEXT NOT NULL,
  evidence_requirements_json TEXT NOT NULL DEFAULT '[]',
  final_synthesis TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','ready_to_verify','verified','abandoned')),
  priority INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  paused_at TEXT,
  completed_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learning_threads_status ON learning_threads(status, priority DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS thread_sources (
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE CASCADE,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  role TEXT NOT NULL DEFAULT 'supporting' CHECK(role IN ('primary','supporting','counterevidence','reference')),
  expected_contribution TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','removed')),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(thread_id,recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_sources_source ON thread_sources(recommendation_id, status);

