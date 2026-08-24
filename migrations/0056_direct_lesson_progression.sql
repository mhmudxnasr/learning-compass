-- Retire Thread progression gates. Legacy status names remain storage-only until
-- the parent tables can be rebuilt without disrupting their foreign keys.
UPDATE learning_path_items
SET required = 0,
    evidence_type = NULL,
    updated_at = datetime('now')
WHERE required != 0 OR evidence_type IS NOT NULL;

UPDATE learning_path_stages AS stage
SET status = CASE
      WHEN EXISTS (
        SELECT 1 FROM thread_lessons lesson WHERE lesson.stage_id = stage.id
      ) AND NOT EXISTS (
        SELECT 1 FROM thread_lessons lesson
        WHERE lesson.stage_id = stage.id AND lesson.status != 'completed'
      ) THEN 'verified'
      WHEN EXISTS (
        SELECT 1 FROM learning_path_stages prior
        WHERE prior.thread_id = stage.thread_id
          AND prior.position < stage.position
          AND prior.status NOT IN ('verified', 'waived')
      ) THEN 'locked'
      WHEN EXISTS (
        SELECT 1 FROM thread_lessons lesson
        WHERE lesson.stage_id = stage.id AND lesson.status IN ('in_progress', 'completed')
      ) THEN 'in_progress'
      ELSE 'available'
    END,
    updated_at = datetime('now');

UPDATE learning_path_stages AS stage
SET status = CASE
      WHEN EXISTS (
        SELECT 1 FROM thread_lessons lesson
        WHERE lesson.stage_id = stage.id AND lesson.status IN ('in_progress', 'completed')
      ) THEN 'in_progress'
      ELSE 'available'
    END,
    updated_at = datetime('now')
WHERE stage.status = 'locked'
  AND NOT EXISTS (
    SELECT 1 FROM learning_path_stages prior
    WHERE prior.thread_id = stage.thread_id
      AND prior.position < stage.position
      AND prior.status NOT IN ('verified', 'waived')
  );

UPDATE learning_threads AS thread
SET status = CASE
      WHEN EXISTS (
        SELECT 1 FROM learning_path_stages stage WHERE stage.thread_id = thread.id
      ) AND NOT EXISTS (
        SELECT 1 FROM learning_path_stages stage
        WHERE stage.thread_id = thread.id AND stage.status NOT IN ('verified', 'waived')
      ) THEN 'verified'
      WHEN thread.status = 'ready_to_verify' THEN 'active'
      ELSE thread.status
    END,
    completed_at = CASE
      WHEN EXISTS (
        SELECT 1 FROM learning_path_stages stage WHERE stage.thread_id = thread.id
      ) AND NOT EXISTS (
        SELECT 1 FROM learning_path_stages stage
        WHERE stage.thread_id = thread.id AND stage.status NOT IN ('verified', 'waived')
      ) THEN COALESCE(thread.completed_at, datetime('now'))
      ELSE thread.completed_at
    END,
    evidence_requirements_json = '[]',
    updated_at = datetime('now')
WHERE thread.status NOT IN ('abandoned', 'draft');
