-- Sources belong to lessons in the course model. Existing source records stay
-- intact; this only adds lesson-level placement and migrates the first source
-- slots from each level to the matching lesson position.
CREATE TABLE IF NOT EXISTS thread_lesson_sources (
  lesson_id TEXT NOT NULL REFERENCES thread_lessons(id) ON DELETE CASCADE,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  role TEXT NOT NULL DEFAULT 'primary' CHECK(role IN ('primary','case','challenge','reference','optional')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(lesson_id, recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_lesson_sources_lesson ON thread_lesson_sources(lesson_id, position);

INSERT OR IGNORE INTO thread_lesson_sources (lesson_id,recommendation_id,role,position)
SELECT l.id, ps.recommendation_id,
  CASE ps.role WHEN 'case' THEN 'case' WHEN 'counterevidence' THEN 'challenge' WHEN 'reference' THEN 'reference' ELSE 'primary' END,
  0
FROM thread_lessons l
JOIN learning_path_sources ps ON ps.stage_id=l.stage_id AND ps.position=l.position
WHERE NOT EXISTS (SELECT 1 FROM thread_lesson_sources x WHERE x.lesson_id=l.id AND x.recommendation_id=ps.recommendation_id);
