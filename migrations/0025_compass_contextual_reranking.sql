-- Compass selection quality diagnostics. These fields are additive because
-- existing picks keep their original immutable score receipt.
ALTER TABLE compass_candidates ADD COLUMN contextual_alignment REAL;
ALTER TABLE compass_candidates ADD COLUMN candidate_set_diversity REAL;

CREATE INDEX IF NOT EXISTS idx_compass_candidates_contextual_quality
  ON compass_candidates(pick_id, contextual_alignment DESC, candidate_set_diversity DESC);
