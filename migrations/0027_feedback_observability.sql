-- Feedback-loop observability: capture exposure/position context so weight
-- learning can discount position bias, and record why an item was rejected.
-- The rejection signal was structurally unlearnable: all 137 rejected outcomes
-- had a NULL rejection_reason. Every exclusion path now records one.

ALTER TABLE compass_feedback ADD COLUMN exposure_json TEXT;
ALTER TABLE compass_picks ADD COLUMN exposure_json TEXT;

CREATE INDEX IF NOT EXISTS idx_compass_feedback_exposure ON compass_feedback(created_at DESC);
