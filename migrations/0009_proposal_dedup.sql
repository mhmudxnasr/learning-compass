ALTER TABLE feedback_proposals ADD COLUMN fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_proposals_fingerprint
  ON feedback_proposals(fingerprint)
  WHERE fingerprint IS NOT NULL;
