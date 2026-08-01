-- Migration: 0004_discovery_engine.sql
-- Recommendation Discovery Engine V2 Tables & Initial Data

CREATE TABLE IF NOT EXISTS discovery_runs (
  id TEXT PRIMARY KEY,
  mission TEXT NOT NULL,
  wave INTEGER NOT NULL DEFAULT 1,
  selected_branch_id TEXT,
  model_version TEXT DEFAULT 'gemini-3.6-flash',
  skill_version TEXT DEFAULT '2.0.0',
  lifecycle TEXT NOT NULL DEFAULT 'researching', -- 'researching' | 'selected' | 'waiting_for_capacity' | 'active' | 'awaiting_feedback' | 'interviewing' | 'resolved' | 'withheld' | 'cancelled'
  selected_candidate_id TEXT,
  decision_receipt_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_lifecycle ON discovery_runs(lifecycle, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  creator TEXT,
  format TEXT NOT NULL,
  source_class TEXT NOT NULL, -- 'paper' | 'essay' | 'podcast' | 'book' | 'talk' | 'tool' | 'article'
  metadata_json TEXT DEFAULT '{}',
  verification_json TEXT DEFAULT '{}',
  score_components_json TEXT DEFAULT '{}',
  total_score REAL NOT NULL DEFAULT 0.0,
  rejection_reason TEXT,
  is_winner INTEGER NOT NULL DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_run ON discovery_candidates(run_id, total_score DESC);

CREATE TABLE IF NOT EXISTS branch_exploration (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  path TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'untested', -- 'untested' | 'probing' | 'frontier' | 'stable' | 'dormant' | 'pruned'
  confidence_score REAL NOT NULL DEFAULT 0.5,
  probe_count INTEGER NOT NULL DEFAULT 0,
  current_wave INTEGER NOT NULL DEFAULT 1,
  last_probe_at TEXT,
  is_pruned INTEGER NOT NULL DEFAULT 0,
  pruning_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branch_exploration_state ON branch_exploration(lifecycle_state, confidence_score DESC);

CREATE TABLE IF NOT EXISTS branch_evidence (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch_exploration(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES discovery_runs(id) ON DELETE SET NULL,
  recommendation_id TEXT,
  signal_dimension TEXT NOT NULL, -- 'frontier_potential' | 'personal_pull' | 'source_love' | 'real_life_impact' | 'rejection' | 'info_gain'
  signal_value REAL NOT NULL, -- e.g. -1.0 to +1.0
  confidence REAL NOT NULL DEFAULT 1.0,
  source_type TEXT NOT NULL, -- 'interview' | 'rating' | 'session_reflection' | 'probe'
  interview_evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branch_evidence_branch ON branch_evidence(branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_interviews (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  raw_feedback TEXT,
  questions_json TEXT DEFAULT '[]',
  answers_json TEXT DEFAULT '{}',
  unresolved_ambiguities_json TEXT DEFAULT '[]',
  structured_resolution_json TEXT DEFAULT '{}',
  learning_receipt_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'interviewing' | 'resolved'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_interviews_run ON discovery_interviews(run_id, status);

CREATE TABLE IF NOT EXISTS engine_weights (
  id TEXT PRIMARY KEY,
  dimension TEXT NOT NULL UNIQUE,
  baseline_weight REAL NOT NULL,
  current_weight REAL NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  audit_history_json TEXT DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_revisions (
  id TEXT PRIMARY KEY,
  live_version TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  backup_path TEXT,
  learned_changes_json TEXT,
  validation_result TEXT NOT NULL DEFAULT 'valid', -- 'valid' | 'staged' | 'failed'
  triggering_interview_id TEXT REFERENCES discovery_interviews(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default engine weights
INSERT OR IGNORE INTO engine_weights (id, dimension, baseline_weight, current_weight, evidence_count) VALUES
  ('frontier_potential', 'frontier_potential', 0.30, 0.30, 0),
  ('info_gain', 'info_gain', 0.20, 0.20, 0),
  ('personal_pull', 'personal_pull', 0.15, 0.15, 0),
  ('real_life_relevance', 'real_life_relevance', 0.15, 0.15, 0),
  ('source_quality', 'source_quality', 0.15, 0.15, 0),
  ('format_exploration', 'format_exploration', 0.05, 0.05, 0);

-- Seed general root branch
INSERT OR IGNORE INTO branch_exploration (id, name, parent_id, path, lifecycle_state, confidence_score, probe_count, current_wave, is_pruned)
VALUES ('general', 'General Learning', NULL, 'general', 'stable', 1.0, 0, 1, 0);

-- Initial backfill for branch_exploration from existing tree_nodes
INSERT OR IGNORE INTO branch_exploration (id, name, parent_id, path, lifecycle_state, confidence_score, probe_count, current_wave, is_pruned)
SELECT 
  id, 
  label, 
  parent_id, 
  id, 
  CASE WHEN status = 'pruned' THEN 'pruned' WHEN status = 'love' THEN 'stable' ELSE 'untested' END, 
  0.5, 
  0, 
  1, 
  CASE WHEN status = 'pruned' THEN 1 ELSE 0 END
FROM tree_nodes;

-- Inferred branch backfill from dedup_key prefixes to ensure all historical branches exist in branch_exploration
INSERT OR IGNORE INTO branch_exploration (id, name, parent_id, path, lifecycle_state, confidence_score, probe_count, current_wave, is_pruned)
SELECT DISTINCT
  COALESCE(m.branch_id, CASE WHEN r.dedup_key LIKE '%-%' AND r.dedup_key NOT LIKE 'yt-%' AND r.dedup_key NOT LIKE 'book-%' THEN substr(r.dedup_key, 1, instr(r.dedup_key, '-') - 1) ELSE 'general' END),
  COALESCE(m.branch_id, CASE WHEN r.dedup_key LIKE '%-%' AND r.dedup_key NOT LIKE 'yt-%' AND r.dedup_key NOT LIKE 'book-%' THEN substr(r.dedup_key, 1, instr(r.dedup_key, '-') - 1) ELSE 'general' END),
  NULL,
  COALESCE(m.branch_id, CASE WHEN r.dedup_key LIKE '%-%' AND r.dedup_key NOT LIKE 'yt-%' AND r.dedup_key NOT LIKE 'book-%' THEN substr(r.dedup_key, 1, instr(r.dedup_key, '-') - 1) ELSE 'general' END),
  'stable',
  0.7,
  1,
  1,
  0
FROM recommendations r
LEFT JOIN recommendation_meta m ON m.recommendation_id = r.id;

-- Backfill historical rating evidence into branch_evidence with verified branch mapping
INSERT OR IGNORE INTO branch_evidence (id, branch_id, recommendation_id, signal_dimension, signal_value, confidence, source_type, created_at)
SELECT
  'ev_hist_' || r.id,
  COALESCE(m.branch_id, CASE WHEN r.dedup_key LIKE '%-%' AND r.dedup_key NOT LIKE 'yt-%' AND r.dedup_key NOT LIKE 'book-%' THEN substr(r.dedup_key, 1, instr(r.dedup_key, '-') - 1) ELSE 'general' END),
  r.id,
  CASE 
    WHEN r.user_rating = 'love' OR r.user_score >= 8 THEN 'personal_pull'
    WHEN r.user_rating = 'dislike' OR r.user_rating = 'meh' OR (r.user_score IS NOT NULL AND r.user_score <= 4) THEN 'rejection'
    ELSE 'info_gain'
  END,
  CASE
    WHEN r.user_rating = 'love' THEN 1.0
    WHEN r.user_rating = 'like' THEN 0.6
    WHEN r.user_rating = 'meh' THEN -0.3
    WHEN r.user_rating = 'dislike' THEN -1.0
    WHEN r.user_score IS NOT NULL THEN (r.user_score - 5.0) / 5.0
    ELSE 0.0
  END,
  0.8,
  'rating',
  COALESCE(r.consumed_date, r.created_at)
FROM recommendations r
LEFT JOIN recommendation_meta m ON m.recommendation_id = r.id
WHERE r.user_rating IS NOT NULL AND r.user_rating != 'unset';
