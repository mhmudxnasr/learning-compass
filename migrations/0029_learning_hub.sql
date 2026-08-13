-- Learning Hub: relational curriculum stages and reusable source attachments.
CREATE TABLE IF NOT EXISTS learning_path_stages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  objective TEXT,
  description TEXT,
  stage_type TEXT NOT NULL DEFAULT 'curriculum' CHECK(stage_type IN ('orientation','curriculum','application','advanced')),
  status TEXT NOT NULL DEFAULT 'locked' CHECK(status IN ('locked','available','in_progress','evidence_pending','ready_to_verify','verified','waived')),
  output_description TEXT,
  unlock_policy_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(thread_id, position)
);
CREATE INDEX IF NOT EXISTS idx_learning_path_stages_thread ON learning_path_stages(thread_id, position);

CREATE TABLE IF NOT EXISTS learning_path_items (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES learning_path_stages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL CHECK(item_type IN ('concept','source_role','companion','recall_prompt','exercise','application','reflection')),
  title TEXT NOT NULL,
  description TEXT,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  evidence_type TEXT CHECK(evidence_type IS NULL OR evidence_type IN ('free_recall','explanation','transfer','application','decision','artifact')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','satisfied','waived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learning_path_items_stage ON learning_path_items(stage_id, position);

CREATE TABLE IF NOT EXISTS learning_path_sources (
  stage_id TEXT NOT NULL REFERENCES learning_path_stages(id) ON DELETE CASCADE,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  role TEXT NOT NULL DEFAULT 'reference' CHECK(role IN ('foundation','case','companion','counterevidence','reference')),
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  expected_contribution TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(stage_id,recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_learning_path_sources_source ON learning_path_sources(recommendation_id);

ALTER TABLE learning_evidence ADD COLUMN stage_id TEXT REFERENCES learning_path_stages(id);
CREATE INDEX IF NOT EXISTS idx_learning_evidence_stage ON learning_evidence(stage_id,occurred_at DESC);

ALTER TABLE thread_evidence_requirements ADD COLUMN stage_id TEXT REFERENCES learning_path_stages(id);
CREATE INDEX IF NOT EXISTS idx_thread_evidence_requirements_stage ON thread_evidence_requirements(stage_id,status);
