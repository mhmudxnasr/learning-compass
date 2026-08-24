-- A legacy Thread can be draft even though every authored lesson is complete.
UPDATE learning_threads AS thread
SET status = 'verified',
    completed_at = COALESCE(thread.completed_at, datetime('now')),
    updated_at = datetime('now')
WHERE thread.status = 'draft'
  AND EXISTS (
    SELECT 1 FROM learning_path_stages stage WHERE stage.thread_id = thread.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM learning_path_stages stage
    WHERE stage.thread_id = thread.id AND stage.status NOT IN ('verified', 'waived')
  );
