-- Course-native Thread structure. Legacy path items/evidence remain intact for
-- compatibility, but the Thread UX can progress from lessons and projects.
CREATE TABLE IF NOT EXISTS thread_lessons (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES learning_path_stages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  content TEXT,
  estimated_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(stage_id, position)
);
CREATE INDEX IF NOT EXISTS idx_thread_lessons_thread ON thread_lessons(thread_id, stage_id, position);

CREATE TABLE IF NOT EXISTS thread_projects (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE CASCADE,
  stage_id TEXT REFERENCES learning_path_stages(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('level','final')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  objective TEXT,
  instructions TEXT,
  suggested_context TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed','deferred')),
  notes TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_thread_projects_thread ON thread_projects(thread_id, stage_id, type);

-- Convert existing concept-like work into readable lessons without deleting
-- recall, evidence, reflection, or source-role records.
INSERT OR IGNORE INTO thread_lessons (id,thread_id,stage_id,position,title,description,status)
SELECT 'lesson_' || i.id, s.thread_id, i.stage_id, i.position, i.title, i.description,
  CASE WHEN i.status IN ('satisfied','waived') THEN 'completed' ELSE 'not_started' END
FROM learning_path_items i
JOIN learning_path_stages s ON s.id=i.stage_id
WHERE i.item_type IN ('concept','exercise','application')
  AND NOT EXISTS (SELECT 1 FROM thread_lessons l WHERE l.id='lesson_' || i.id);

INSERT INTO thread_projects (id,thread_id,stage_id,type,title,description,objective,suggested_context)
SELECT 'project_' || s.id, s.thread_id, s.id, 'level',
  'Level project — ' || s.title,
  COALESCE(s.output_description, 'Use the ideas from this level on one real system or problem.'),
  s.objective,
  'Use Learning Compass as the recurring example when it helps make the method concrete.'
FROM learning_path_stages s
WHERE NOT EXISTS (SELECT 1 FROM thread_projects p WHERE p.stage_id=s.id AND p.type='level');

INSERT INTO thread_projects (id,thread_id,type,title,description,objective,suggested_context)
SELECT 'final_project_' || t.id, t.id, 'final', 'Final mastery project',
  'Analyze and improve one real system using the methods learned throughout this course.',
  t.definition_of_done,
  'Analyze Learning Compass or another consequential system end to end.'
FROM learning_threads t
WHERE NOT EXISTS (SELECT 1 FROM thread_projects p WHERE p.thread_id=t.id AND p.type='final');
