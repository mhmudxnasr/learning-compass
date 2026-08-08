-- Canonical, auditable learning activity. The ledger is populated from the
-- source-of-truth learning records; learning_log remains a legacy manual log.
CREATE TABLE IF NOT EXISTS learning_activity_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('session_started','session_returned','session_completed','completion','feedback_recorded','note_created','note_edited','recall_approved','recall_reviewed')),
  occurred_at TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  recommendation_id TEXT,
  session_id TEXT,
  note_id TEXT,
  card_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_learning_activity_ledger_date ON learning_activity_ledger(activity_date DESC, event_type);
CREATE INDEX IF NOT EXISTS idx_learning_activity_ledger_recommendation ON learning_activity_ledger(recommendation_id, occurred_at DESC);

-- Backfill immutable evidence already present in D1. Cairo is the product's
-- canonical reporting timezone; source rows without a time use noon UTC to
-- avoid changing their recorded calendar date.
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,session_id,detail_json)
SELECT 'session:' || id || ':started','session_started',COALESCE(started_at,datetime('now')),date(COALESCE(started_at,datetime('now')),'+3 hours'),recommendation_id,id,json_object('intent',COALESCE(intent,'')) FROM learning_sessions;
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,session_id,detail_json)
SELECT 'session:' || id || ':returned','session_returned',returned_at,date(returned_at,'+3 hours'),recommendation_id,id,json_object('status',status) FROM learning_sessions WHERE returned_at IS NOT NULL;
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,session_id,detail_json)
SELECT 'session:' || id || ':completed','session_completed',completed_at,date(completed_at,'+3 hours'),recommendation_id,id,json_object('duration_seconds',COALESCE(duration_seconds,0)) FROM learning_sessions WHERE completed_at IS NOT NULL;
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,detail_json)
SELECT 'completion:' || id,'completion',consumed_date || ' 12:00:00',date(consumed_date),id,json_object('rating',COALESCE(user_score,NULL),'rating_label',COALESCE(user_rating,'')) FROM recommendations WHERE status='consumed' AND consumed_date IS NOT NULL AND consumed_date!='unset';
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,detail_json)
SELECT 'feedback:' || id || ':' || COALESCE(updated_at,consumed_date),'feedback_recorded',COALESCE(updated_at,consumed_date || ' 12:00:00'),date(COALESCE(updated_at,consumed_date || ' 12:00:00'),'+3 hours'),id,json_object('score',user_score,'rating',COALESCE(user_rating,''),'has_review',CASE WHEN COALESCE(user_review,'')!='' THEN 1 ELSE 0 END) FROM recommendations WHERE user_score IS NOT NULL OR COALESCE(user_review,'')!='' OR (user_rating IS NOT NULL AND user_rating!='unset');
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,note_id,detail_json)
SELECT 'note:' || id || ':created','note_created',COALESCE(created_at,updated_at,datetime('now')),date(COALESCE(created_at,updated_at,datetime('now')),'+3 hours'),recommendation_id,id,json_object('kind',COALESCE(kind,'note')) FROM notes;
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,note_id,detail_json)
SELECT 'note:' || id || ':revision:' || revision,'note_edited',updated_at,date(updated_at,'+3 hours'),recommendation_id,id,json_object('kind',COALESCE(kind,'note'),'revision',revision) FROM notes WHERE COALESCE(revision,1)>1;
INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,card_id,detail_json)
SELECT 'recall:review:' || e.id,'recall_reviewed',e.reviewed_at,date(e.reviewed_at,'+3 hours'),c.recommendation_id,e.card_id,json_object('grade',e.grade) FROM srs_review_events e LEFT JOIN srs_cards c ON c.id=e.card_id;

CREATE TRIGGER IF NOT EXISTS activity_session_started AFTER INSERT ON learning_sessions
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,session_id,detail_json)
  VALUES ('session:' || NEW.id || ':started','session_started',COALESCE(NEW.started_at,datetime('now')),date(COALESCE(NEW.started_at,datetime('now')),'+3 hours'),NEW.recommendation_id,NEW.id,json_object('intent',COALESCE(NEW.intent,'')));
END;
CREATE TRIGGER IF NOT EXISTS activity_session_returned AFTER UPDATE OF returned_at ON learning_sessions WHEN NEW.returned_at IS NOT NULL AND (OLD.returned_at IS NULL OR OLD.returned_at != NEW.returned_at)
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,session_id,detail_json)
  VALUES ('session:' || NEW.id || ':returned:' || NEW.returned_at,'session_returned',NEW.returned_at,date(NEW.returned_at,'+3 hours'),NEW.recommendation_id,NEW.id,json_object('status',NEW.status));
END;
CREATE TRIGGER IF NOT EXISTS activity_session_completed AFTER UPDATE OF completed_at ON learning_sessions WHEN NEW.completed_at IS NOT NULL AND (OLD.completed_at IS NULL OR OLD.completed_at != NEW.completed_at)
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,session_id,detail_json)
  VALUES ('session:' || NEW.id || ':completed','session_completed',NEW.completed_at,date(NEW.completed_at,'+3 hours'),NEW.recommendation_id,NEW.id,json_object('duration_seconds',COALESCE(NEW.duration_seconds,0)));
END;
CREATE TRIGGER IF NOT EXISTS activity_recommendation_completion AFTER UPDATE OF status, consumed_date ON recommendations WHEN NEW.status='consumed' AND NEW.consumed_date IS NOT NULL AND (OLD.status!='consumed' OR OLD.consumed_date IS NULL)
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,detail_json)
  VALUES ('completion:' || NEW.id,'completion',NEW.consumed_date || ' 12:00:00',date(NEW.consumed_date),NEW.id,json_object('rating',NEW.user_score,'rating_label',COALESCE(NEW.user_rating,'')));
END;
CREATE TRIGGER IF NOT EXISTS activity_recommendation_feedback AFTER UPDATE OF user_score, user_rating, user_review ON recommendations WHEN NEW.user_score IS NOT OLD.user_score OR NEW.user_rating IS NOT OLD.user_rating OR NEW.user_review IS NOT OLD.user_review
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,detail_json)
  VALUES ('feedback:' || NEW.id || ':' || strftime('%Y-%m-%dT%H:%M:%fZ','now'),'feedback_recorded',datetime('now'),date('now','+3 hours'),NEW.id,json_object('score',NEW.user_score,'rating',COALESCE(NEW.user_rating,''),'has_review',CASE WHEN COALESCE(NEW.user_review,'')!='' THEN 1 ELSE 0 END));
END;
CREATE TRIGGER IF NOT EXISTS activity_note_created AFTER INSERT ON notes
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,note_id,detail_json)
  VALUES ('note:' || NEW.id || ':created','note_created',COALESCE(NEW.created_at,datetime('now')),date(COALESCE(NEW.created_at,datetime('now')),'+3 hours'),NEW.recommendation_id,NEW.id,json_object('kind',COALESCE(NEW.kind,'note')));
END;
CREATE TRIGGER IF NOT EXISTS activity_note_edited AFTER UPDATE OF revision, updated_at ON notes WHEN NEW.revision > COALESCE(OLD.revision,0)
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,note_id,detail_json)
  VALUES ('note:' || NEW.id || ':revision:' || NEW.revision,'note_edited',COALESCE(NEW.updated_at,datetime('now')),date(COALESCE(NEW.updated_at,datetime('now')),'+3 hours'),NEW.recommendation_id,NEW.id,json_object('kind',COALESCE(NEW.kind,'note'),'revision',NEW.revision));
END;
CREATE TRIGGER IF NOT EXISTS activity_recall_approved AFTER UPDATE OF status ON srs_drafts WHEN OLD.status='draft' AND NEW.status='approved'
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,detail_json)
  VALUES ('recall:approved:' || NEW.id,'recall_approved',COALESCE(NEW.updated_at,datetime('now')),date(COALESCE(NEW.updated_at,datetime('now')),'+3 hours'),NEW.recommendation_id,json_object('draft_id',NEW.id,'topic',COALESCE(NEW.topic,'')));
END;
CREATE TRIGGER IF NOT EXISTS activity_recall_reviewed AFTER INSERT ON srs_review_events
BEGIN
  INSERT OR IGNORE INTO learning_activity_ledger (event_key,event_type,occurred_at,activity_date,recommendation_id,card_id,detail_json)
  SELECT 'recall:review:' || NEW.id,'recall_reviewed',COALESCE(NEW.reviewed_at,datetime('now')),date(COALESCE(NEW.reviewed_at,datetime('now')),'+3 hours'),recommendation_id,NEW.card_id,json_object('grade',NEW.grade) FROM srs_cards WHERE id=NEW.card_id;
END;
