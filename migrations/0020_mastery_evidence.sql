CREATE TABLE IF NOT EXISTS learning_evidence (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES learning_threads(id),
  unit_id TEXT REFERENCES learning_units(id),
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('free_recall','explanation','transfer','application','decision','artifact')),
  prompt TEXT,
  response TEXT,
  result TEXT NOT NULL CHECK(result IN ('pass','partial','fail','recorded')),
  score REAL CHECK(score IS NULL OR (score>=0 AND score<=1)),
  self_rating INTEGER,
  evaluator TEXT NOT NULL DEFAULT 'user',
  proof_ref TEXT,
  delay_days REAL,
  context_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learning_evidence_thread ON learning_evidence(thread_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_evidence_unit ON learning_evidence(unit_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS unit_mastery_state (
  unit_id TEXT PRIMARY KEY REFERENCES learning_units(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'exposed' CHECK(stage IN ('exposed','encoded','retrieved','transferred','applied','mastered')),
  difficulty REAL NOT NULL DEFAULT 5,
  stability REAL NOT NULL DEFAULT 1,
  due_at TEXT,
  last_retrieved_at TEXT,
  delayed_retrievals INTEGER NOT NULL DEFAULT 0,
  transfer_count INTEGER NOT NULL DEFAULT 0,
  application_count INTEGER NOT NULL DEFAULT 0,
  scheduler_state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thread_evidence_requirements (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE CASCADE,
  requirement_key TEXT NOT NULL,
  label TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  minimum_count INTEGER NOT NULL DEFAULT 1,
  minimum_score REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','satisfied','waived')),
  satisfied_by_evidence_id TEXT REFERENCES learning_evidence(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(thread_id,requirement_key)
);

