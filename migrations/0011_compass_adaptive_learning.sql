-- Adaptive Compass strategy/feature learning. Updates are bounded and auditable.
CREATE TABLE IF NOT EXISTS compass_feature_weights (
  strategy TEXT NOT NULL CHECK (strategy IN ('fit','bridge','challenge')),
  dimension TEXT NOT NULL,
  baseline_weight REAL NOT NULL,
  current_weight REAL NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  audit_history_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (strategy, dimension)
);

INSERT OR IGNORE INTO compass_feature_weights(strategy,dimension,baseline_weight,current_weight) VALUES
 ('fit','topic_value',.23,.23),('fit','personal_relevance',.22,.22),('fit','source_quality',.19,.19),('fit','information_gain',.13,.13),('fit','novelty',.08,.08),('fit','format_fit',.07,.07),('fit','evidence_quality',.08,.08),
 ('bridge','topic_value',.17,.17),('bridge','personal_relevance',.16,.16),('bridge','source_quality',.17,.17),('bridge','information_gain',.22,.22),('bridge','novelty',.15,.15),('bridge','format_fit',.06,.06),('bridge','evidence_quality',.07,.07),
 ('challenge','topic_value',.14,.14),('challenge','personal_relevance',.13,.13),('challenge','source_quality',.18,.18),('challenge','information_gain',.20,.20),('challenge','novelty',.23,.23),('challenge','format_fit',.05,.05),('challenge','evidence_quality',.07,.07);

UPDATE compass_strategy_priors
SET explicit_evidence_count=(SELECT COUNT(*) FROM compass_picks p WHERE p.strategy=compass_strategy_priors.strategy AND p.status IN ('resolved','declined','replaced'));

CREATE TABLE IF NOT EXISTS compass_learning_receipts (
  id TEXT PRIMARY KEY,
  pick_id TEXT NOT NULL REFERENCES compass_picks(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL,
  reward REAL NOT NULL,
  reason_tags_json TEXT NOT NULL DEFAULT '[]',
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compass_learning_receipts_pick ON compass_learning_receipts(pick_id, created_at DESC);
