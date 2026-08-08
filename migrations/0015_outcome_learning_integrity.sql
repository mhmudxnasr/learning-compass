-- Keep the recommendation outcome ledger complete when ordinary feedback paths
-- update the canonical recommendation record outside Compass.
CREATE TRIGGER IF NOT EXISTS recommendations_outcome_from_terminal_feedback
AFTER UPDATE OF status, user_score, user_rating, consumed_date, creator, content_type ON recommendations
WHEN NEW.status IN ('consumed','rejected')
BEGIN
  INSERT INTO recommendation_outcomes (
    id,recommendation_id,creator,format,branch_id,actual_score,outcome_status,consumed_at,evaluated_at
  ) VALUES (
    'outcome_' || NEW.id, NEW.id, NEW.creator, NEW.content_type,
    (SELECT branch_id FROM recommendation_meta WHERE recommendation_id=NEW.id),
    COALESCE(NEW.user_score, CASE NEW.user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END, CASE WHEN NEW.status='rejected' THEN 2 END),
    NEW.status, CASE WHEN NEW.status='consumed' THEN COALESCE(NEW.consumed_date,date('now')) END, datetime('now')
  ) ON CONFLICT(recommendation_id) DO UPDATE SET
    creator=excluded.creator, format=excluded.format, branch_id=excluded.branch_id,
    actual_score=COALESCE(excluded.actual_score,recommendation_outcomes.actual_score),
    outcome_status=excluded.outcome_status,
    consumed_at=COALESCE(recommendation_outcomes.consumed_at,excluded.consumed_at), evaluated_at=datetime('now');
END;

-- Backfill historical terminal feedback without manufacturing a score for
-- scoreless completions. Those rows remain visible but cannot recalibrate.
INSERT INTO recommendation_outcomes (
  id,recommendation_id,creator,format,branch_id,actual_score,outcome_status,consumed_at,evaluated_at
)
SELECT 'outcome_' || r.id,r.id,r.creator,r.content_type,m.branch_id,
  COALESCE(r.user_score,CASE r.user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END,CASE WHEN r.status='rejected' THEN 2 END),
  r.status,CASE WHEN r.status='consumed' THEN r.consumed_date END,datetime('now')
FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
WHERE r.status IN ('consumed','rejected')
ON CONFLICT(recommendation_id) DO UPDATE SET
  creator=excluded.creator,format=excluded.format,branch_id=COALESCE(recommendation_outcomes.branch_id,excluded.branch_id),
  actual_score=COALESCE(recommendation_outcomes.actual_score,excluded.actual_score),
  outcome_status=excluded.outcome_status,consumed_at=COALESCE(recommendation_outcomes.consumed_at,excluded.consumed_at),evaluated_at=datetime('now');
