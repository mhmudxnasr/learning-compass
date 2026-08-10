CREATE TABLE IF NOT EXISTS consolidation_runs (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  thread_id TEXT,
  session_id TEXT,
  disposition TEXT NOT NULL DEFAULT 'undecided' CHECK(disposition IN ('undecided','retain','apply','reference','drop')),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('reflection_due','queued','consolidating','recall_ready','mapped','closed','repair_required','waived')),
  input_checksum TEXT,
  output_checksum TEXT,
  failure_reason TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id)
);
CREATE INDEX IF NOT EXISTS idx_consolidation_state ON consolidation_runs(state, requested_at);
CREATE INDEX IF NOT EXISTS idx_consolidation_source ON consolidation_runs(recommendation_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS consolidation_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES consolidation_runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','waived')),
  depends_on_step TEXT,
  agent_job_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  input_checksum TEXT,
  output_checksum TEXT,
  result_json TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, step_key)
);
CREATE INDEX IF NOT EXISTS idx_consolidation_steps_ready ON consolidation_steps(status, position, run_id);

