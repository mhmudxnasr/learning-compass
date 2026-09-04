-- Thread material organizer: lesson placements carry the same explanatory
-- provenance as Level and Thread placements, and material-request jobs can be
-- read back efficiently by their exact lesson target.
ALTER TABLE thread_lesson_sources ADD COLUMN expected_contribution TEXT;
ALTER TABLE thread_lesson_sources ADD COLUMN updated_at TEXT;
UPDATE thread_lesson_sources SET updated_at=COALESCE(updated_at,created_at,datetime('now'));

-- Lesson-material suggestions are review-only workflow outputs. Keep them out
-- of the ordinary current-pick/start/feedback lifecycle and bind each one to
-- the exact durable request that authorized it.
ALTER TABLE compass_picks ADD COLUMN workflow_scope TEXT NOT NULL DEFAULT 'general'
  CHECK (workflow_scope IN ('general','lesson_material'));
ALTER TABLE compass_picks ADD COLUMN workflow_request_id TEXT;

-- Normalize legacy collisions once. API moves subsequently shift siblings and
-- every read has recommendation_id as its final deterministic tie-breaker.
WITH ranked AS (
  SELECT thread_id,recommendation_id,ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY position,recommendation_id)-1 next_position
  FROM thread_sources WHERE status!='removed'
)
UPDATE thread_sources SET position=(SELECT next_position FROM ranked WHERE ranked.thread_id=thread_sources.thread_id AND ranked.recommendation_id=thread_sources.recommendation_id)
WHERE status!='removed';

WITH ranked AS (
  SELECT stage_id,recommendation_id,ROW_NUMBER() OVER (PARTITION BY stage_id ORDER BY position,recommendation_id)-1 next_position
  FROM learning_path_sources
)
UPDATE learning_path_sources SET position=(SELECT next_position FROM ranked WHERE ranked.stage_id=learning_path_sources.stage_id AND ranked.recommendation_id=learning_path_sources.recommendation_id);

WITH ranked AS (
  SELECT lesson_id,recommendation_id,ROW_NUMBER() OVER (PARTITION BY lesson_id ORDER BY position,recommendation_id)-1 next_position
  FROM thread_lesson_sources
)
UPDATE thread_lesson_sources SET position=(SELECT next_position FROM ranked WHERE ranked.lesson_id=thread_lesson_sources.lesson_id AND ranked.recommendation_id=thread_lesson_sources.recommendation_id);

CREATE INDEX IF NOT EXISTS idx_thread_lesson_sources_source
  ON thread_lesson_sources(recommendation_id, lesson_id);

CREATE INDEX IF NOT EXISTS idx_thread_sources_material_order
  ON thread_sources(thread_id,status,position,recommendation_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_sources_material_order
  ON learning_path_sources(stage_id,position,recommendation_id);
CREATE INDEX IF NOT EXISTS idx_thread_lesson_sources_material_order
  ON thread_lesson_sources(lesson_id,position,recommendation_id);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_lesson_material
  ON agent_jobs(job_type, json_extract(payload_json,'$.lesson_id'), status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compass_lesson_material_request
  ON compass_picks(workflow_request_id)
  WHERE workflow_scope='lesson_material' AND workflow_request_id IS NOT NULL;
