-- Migration 0035: Recommendation Branch and Round (R1, R2, R3) Tags
ALTER TABLE recommendations ADD COLUMN branch TEXT;
ALTER TABLE recommendations ADD COLUMN round TEXT;

CREATE INDEX IF NOT EXISTS idx_recommendations_branch ON recommendations(branch);
CREATE INDEX IF NOT EXISTS idx_recommendations_round ON recommendations(round);
