-- Hermes upgrade: quality evidence, guarded memory, resilient jobs, and alerts.

CREATE TABLE IF NOT EXISTS recommendation_outcomes (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL UNIQUE,
  discovery_run_id TEXT,
  source_class TEXT,
  format TEXT,
  creator TEXT,
  branch_id TEXT,
  predicted_score REAL,
  predicted_confidence REAL,
  actual_score REAL,
  outcome_status TEXT NOT NULL DEFAULT 'active',
  consumed_at TEXT,
  days_to_consume REAL,
  evaluated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_status ON recommendation_outcomes(outcome_status, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS hermes_memory (
  id TEXT PRIMARY KEY,
  memory_key TEXT NOT NULL,
  memory_kind TEXT NOT NULL, -- durable | episodic | working | rejection | hypothesis
  value_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | superseded | expired | rejected
  supersedes_id TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hermes_memory_active ON hermes_memory(status, memory_kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hermes_memory_expiry ON hermes_memory(expires_at, status);

CREATE TABLE IF NOT EXISTS agent_job_retries (
  job_id TEXT PRIMARY KEY REFERENCES agent_jobs(id) ON DELETE CASCADE,
  next_attempt_at TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  retry_count INTEGER NOT NULL DEFAULT 0,
  dead_lettered_at TEXT,
  last_error TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_job_retries_due ON agent_job_retries(next_attempt_at, dead_lettered_at);

CREATE TABLE IF NOT EXISTS hermes_alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  fingerprint TEXT,
  acknowledged_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hermes_alerts_open ON hermes_alerts(acknowledged_at, created_at DESC);

