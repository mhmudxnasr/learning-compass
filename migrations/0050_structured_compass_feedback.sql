-- Keep Compass reactions as complete structured events instead of reducing
-- them to a score, free-text reflection, and reason list.
ALTER TABLE compass_feedback ADD COLUMN structured_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE compass_feedback ADD COLUMN disposition TEXT NOT NULL DEFAULT 'undecided';

CREATE INDEX IF NOT EXISTS idx_compass_feedback_recommendation_created
  ON compass_feedback(recommendation_id, created_at DESC);
