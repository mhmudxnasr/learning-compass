-- Personal Bayesian Cascade: one user-facing pick with adaptive, auditable search.
CREATE TABLE IF NOT EXISTS compass_picks (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL CHECK (strategy IN ('fit','bridge','challenge')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','started','resolved','declined','abstained','replaced')),
  recommendation_id TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  search_rounds INTEGER NOT NULL DEFAULT 1,
  stop_reason TEXT,
  confidence REAL,
  margin REAL,
  rationale_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compass_current_pick ON compass_picks((1)) WHERE status IN ('ready','started');

CREATE TABLE IF NOT EXISTS compass_candidates (
  id TEXT PRIMARY KEY,
  pick_id TEXT NOT NULL REFERENCES compass_picks(id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  creator TEXT,
  format TEXT,
  source_class TEXT,
  features_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  score REAL NOT NULL,
  uncertainty REAL NOT NULL DEFAULT 0.5,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_winner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compass_candidates_pick ON compass_candidates(pick_id, score DESC);

CREATE TABLE IF NOT EXISTS compass_feedback (
  id TEXT PRIMARY KEY,
  pick_id TEXT NOT NULL REFERENCES compass_picks(id) ON DELETE CASCADE,
  recommendation_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('started','completed','declined','abandoned')),
  score REAL,
  reason_tags_json TEXT NOT NULL DEFAULT '[]',
  reflection TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compass_feedback_created ON compass_feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS compass_strategy_priors (
  strategy TEXT PRIMARY KEY CHECK (strategy IN ('fit','bridge','challenge')),
  alpha REAL NOT NULL DEFAULT 1.0,
  beta REAL NOT NULL DEFAULT 1.0,
  explicit_evidence_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO compass_strategy_priors(strategy) VALUES ('fit'), ('bridge'), ('challenge');
