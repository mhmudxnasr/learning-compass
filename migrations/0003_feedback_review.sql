CREATE TABLE IF NOT EXISTS feedback_proposals (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  note_id TEXT,
  job_id TEXT,
  change_type TEXT NOT NULL,
  target_label TEXT NOT NULL,
  current_json TEXT,
  proposed_json TEXT NOT NULL,
  evidence TEXT,
  reasoning TEXT,
  confidence REAL DEFAULT 0.5,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_proposals_status
  ON feedback_proposals(status, created_at);
