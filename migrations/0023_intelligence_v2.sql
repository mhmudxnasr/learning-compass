-- Learning-value recommendation intelligence, typed profile assertions, and
-- conversation-bound Hermes self-improvement receipts.

-- Recommendation signals extend the existing immutable learning event ledger.
ALTER TABLE learning_events ADD COLUMN pick_id TEXT;
ALTER TABLE learning_events ADD COLUMN reason_code TEXT;
ALTER TABLE learning_events ADD COLUMN signal_scope TEXT NOT NULL DEFAULT 'none';
ALTER TABLE learning_events ADD COLUMN signal_value REAL;
ALTER TABLE learning_events ADD COLUMN is_explicit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_events ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS idx_learning_events_signal ON learning_events(signal_scope,is_explicit,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_pick ON learning_events(pick_id,occurred_at DESC);

-- recommendation_outcomes remains the REST-compatible per-source projection.
ALTER TABLE recommendation_outcomes ADD COLUMN outcome_origin TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE recommendation_outcomes ADD COLUMN training_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recommendation_outcomes ADD COLUMN taste_value REAL;
ALTER TABLE recommendation_outcomes ADD COLUMN disposition_value REAL;
ALTER TABLE recommendation_outcomes ADD COLUMN evidence_value REAL;
ALTER TABLE recommendation_outcomes ADD COLUMN learning_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE recommendation_outcomes ADD COLUMN objective_version TEXT NOT NULL DEFAULT 'taste_v1';
ALTER TABLE recommendation_outcomes ADD COLUMN format_key TEXT;
ALTER TABLE recommendation_outcomes ADD COLUMN creator_key TEXT;
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_training ON recommendation_outcomes(training_eligible,objective_version,evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_entities ON recommendation_outcomes(format_key,creator_key);

-- Candidate lane and purpose are explicit; the legacy strategy remains readable.
ALTER TABLE compass_picks ADD COLUMN thread_id TEXT;
ALTER TABLE compass_picks ADD COLUMN engine_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE compass_picks ADD COLUMN objective_version TEXT NOT NULL DEFAULT 'taste_v1';
ALTER TABLE compass_picks ADD COLUMN expected_learning_value REAL;
ALTER TABLE compass_picks ADD COLUMN decision_confidence REAL;
ALTER TABLE compass_picks ADD COLUMN shadow_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE compass_candidates ADD COLUMN lane TEXT;
ALTER TABLE compass_candidates ADD COLUMN branch_id TEXT;
ALTER TABLE compass_candidates ADD COLUMN format_key TEXT;
ALTER TABLE compass_candidates ADD COLUMN creator_key TEXT;
ALTER TABLE compass_candidates ADD COLUMN expected_learning_value REAL;
ALTER TABLE compass_candidates ADD COLUMN decision_score REAL;
ALTER TABLE compass_candidates ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS idx_compass_candidates_lane ON compass_candidates(pick_id,lane,decision_score DESC);
UPDATE compass_candidates
SET lane=COALESCE(lane,(SELECT strategy FROM compass_picks WHERE compass_picks.id=compass_candidates.pick_id),'fit')
WHERE lane IS NULL;
UPDATE compass_picks SET decision_confidence=COALESCE(decision_confidence,confidence) WHERE decision_confidence IS NULL;

-- Reset the uncalibrated v1 heuristic weights to the thread-aware v2 baseline.
UPDATE compass_feature_weights SET baseline_weight=CASE strategy || ':' || dimension
  WHEN 'fit:topic_value' THEN .16 WHEN 'fit:personal_relevance' THEN .17 WHEN 'fit:source_quality' THEN .14 WHEN 'fit:information_gain' THEN .10 WHEN 'fit:novelty' THEN .06 WHEN 'fit:format_fit' THEN .06 WHEN 'fit:evidence_quality' THEN .11
  WHEN 'bridge:topic_value' THEN .12 WHEN 'bridge:personal_relevance' THEN .13 WHEN 'bridge:source_quality' THEN .13 WHEN 'bridge:information_gain' THEN .18 WHEN 'bridge:novelty' THEN .12 WHEN 'bridge:format_fit' THEN .05 WHEN 'bridge:evidence_quality' THEN .07
  WHEN 'challenge:topic_value' THEN .10 WHEN 'challenge:personal_relevance' THEN .10 WHEN 'challenge:source_quality' THEN .14 WHEN 'challenge:information_gain' THEN .17 WHEN 'challenge:novelty' THEN .18 WHEN 'challenge:format_fit' THEN .04 WHEN 'challenge:evidence_quality' THEN .07
  ELSE baseline_weight END,
  current_weight=CASE strategy || ':' || dimension
  WHEN 'fit:topic_value' THEN .16 WHEN 'fit:personal_relevance' THEN .17 WHEN 'fit:source_quality' THEN .14 WHEN 'fit:information_gain' THEN .10 WHEN 'fit:novelty' THEN .06 WHEN 'fit:format_fit' THEN .06 WHEN 'fit:evidence_quality' THEN .11
  WHEN 'bridge:topic_value' THEN .12 WHEN 'bridge:personal_relevance' THEN .13 WHEN 'bridge:source_quality' THEN .13 WHEN 'bridge:information_gain' THEN .18 WHEN 'bridge:novelty' THEN .12 WHEN 'bridge:format_fit' THEN .05 WHEN 'bridge:evidence_quality' THEN .07
  WHEN 'challenge:topic_value' THEN .10 WHEN 'challenge:personal_relevance' THEN .10 WHEN 'challenge:source_quality' THEN .14 WHEN 'challenge:information_gain' THEN .17 WHEN 'challenge:novelty' THEN .18 WHEN 'challenge:format_fit' THEN .04 WHEN 'challenge:evidence_quality' THEN .07
  ELSE current_weight END,
  evidence_count=0,audit_history_json='[]',updated_at=datetime('now');
INSERT OR REPLACE INTO compass_feature_weights(strategy,dimension,baseline_weight,current_weight,evidence_count,audit_history_json,updated_at) VALUES
 ('fit','thread_contribution',.20,.20,0,'[]',datetime('now')),
 ('bridge','thread_contribution',.20,.20,0,'[]',datetime('now')),
 ('challenge','thread_contribution',.20,.20,0,'[]',datetime('now'));

-- Typed current profile state plus append-only, reversible revisions.
CREATE TABLE IF NOT EXISTS profile_assertions (
  id TEXT PRIMARY KEY,
  assertion_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  value_json TEXT NOT NULL,
  weight REAL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence>=0 AND confidence<=1),
  status TEXT NOT NULL DEFAULT 'hypothesis' CHECK(status IN ('active','hypothesis','inactive','superseded')),
  source_kind TEXT NOT NULL DEFAULT 'inference',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profile_assertions_model ON profile_assertions(category,status,confidence DESC);

CREATE TABLE IF NOT EXISTS profile_assertion_revisions (
  id TEXT PRIMARY KEY,
  assertion_id TEXT NOT NULL REFERENCES profile_assertions(id),
  revision INTEGER NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','agent','system')),
  decision_source TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  proposal_id TEXT,
  improvement_run_id TEXT,
  revert_of TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assertion_id,revision)
);
CREATE INDEX IF NOT EXISTS idx_profile_revisions_assertion ON profile_assertion_revisions(assertion_id,revision DESC);

-- Creator aliases preserve raw display labels while aggregating evidence safely.
CREATE TABLE IF NOT EXISTS creator_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS creator_aliases (
  alias_key TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES creator_entities(id),
  raw_alias TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_creator_alias_entity ON creator_aliases(entity_id);

-- One durable receipt groups every verified improvement made in a conversation.
CREATE TABLE IF NOT EXISTS self_improvement_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  trigger_kind TEXT NOT NULL,
  layer TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'observed' CHECK(status IN ('observed','evaluating','validated','applied','deployed','reverted','failed','blocked')),
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence>=0 AND confidence<=1),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  validation_json TEXT NOT NULL DEFAULT '{}',
  deployment_json TEXT NOT NULL DEFAULT '{}',
  baseline_version TEXT,
  deployed_version TEXT,
  rollback_version TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_self_improvement_runs_status ON self_improvement_runs(status,created_at DESC);

ALTER TABLE feedback_proposals ADD COLUMN conversation_id TEXT;
ALTER TABLE feedback_proposals ADD COLUMN improvement_run_id TEXT;
ALTER TABLE feedback_proposals ADD COLUMN layer TEXT NOT NULL DEFAULT 'profile';
ALTER TABLE feedback_proposals ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'low';
ALTER TABLE feedback_proposals ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE feedback_proposals ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE feedback_proposals ADD COLUMN decision_source TEXT;
ALTER TABLE feedback_proposals ADD COLUMN validation_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE feedback_proposals ADD COLUMN deployment_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE feedback_proposals ADD COLUMN applied_by TEXT;
ALTER TABLE feedback_proposals ADD COLUMN target_version INTEGER;
ALTER TABLE feedback_proposals ADD COLUMN reverted_at TEXT;
ALTER TABLE feedback_proposals ADD COLUMN revert_of TEXT;
CREATE INDEX IF NOT EXISTS idx_feedback_proposals_run ON feedback_proposals(improvement_run_id,status,created_at DESC);

-- Status alone cannot say whether an exclusion is taste feedback. Application
-- services now write explicit learning events and update the outcome projection.
DROP TRIGGER IF EXISTS recommendations_outcome_from_terminal_feedback;

CREATE VIEW IF NOT EXISTS recommendation_training_outcomes_v2 AS
SELECT * FROM recommendation_outcomes
WHERE training_eligible=1 AND learning_value IS NOT NULL AND objective_version='learning_value_v2';

INSERT INTO user_settings(setting_key,value_json,updated_at)
VALUES ('profile_automation','{"mode":"automatic","policy_version":"profile_v2"}',datetime('now'))
ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now');
INSERT INTO user_settings(setting_key,value_json,updated_at)
VALUES ('recommendation_engine','{"mode":"shadow","engine_version":"v2","objective_version":"learning_value_v2"}',datetime('now'))
ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now');
