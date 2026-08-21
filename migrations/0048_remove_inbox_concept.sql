-- Captures are ordinary source records; they no longer live in a separate Inbox.
UPDATE recommendation_meta
SET learning_state='captured', updated_at=datetime('now')
WHERE learning_state='inbox';
