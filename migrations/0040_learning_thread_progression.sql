-- Make Thread progression and evidence targets explicit while preserving legacy rows.
ALTER TABLE learning_path_stages ADD COLUMN progress_model TEXT NOT NULL DEFAULT 'legacy' CHECK(progress_model IN ('legacy','course'));
ALTER TABLE thread_lessons ADD COLUMN legacy_item_id TEXT REFERENCES learning_path_items(id) ON DELETE SET NULL;
ALTER TABLE learning_evidence ADD COLUMN item_id TEXT REFERENCES learning_path_items(id) ON DELETE SET NULL;
ALTER TABLE thread_projects ADD COLUMN required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_lessons_legacy_item
  ON thread_lessons(legacy_item_id) WHERE legacy_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_evidence_item ON learning_evidence(item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_evidence_thread_stage_result ON learning_evidence(thread_id, stage_id, result);

CREATE TABLE IF NOT EXISTS thread_requirement_evidence (
  requirement_id TEXT NOT NULL REFERENCES thread_evidence_requirements(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES learning_evidence(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(requirement_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS idx_requirement_evidence_evidence ON thread_requirement_evidence(evidence_id, requirement_id);

UPDATE learning_path_stages
SET progress_model='course'
WHERE EXISTS (SELECT 1 FROM thread_lessons l WHERE l.stage_id=learning_path_stages.id);

UPDATE thread_lessons
SET legacy_item_id=CASE
  WHEN id LIKE 'lesson_%' AND EXISTS (
    SELECT 1 FROM learning_path_items i
    WHERE i.id=substr(thread_lessons.id,8)
      AND i.stage_id=thread_lessons.stage_id
      AND i.item_type IN ('concept','exercise','application')
  ) THEN substr(id,8)
  ELSE legacy_item_id
END
WHERE legacy_item_id IS NULL;
