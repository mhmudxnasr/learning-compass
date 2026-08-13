-- Learning Hub: path- and stage-owned notes and files.
-- Hub notes and files are brand-new, item-owned data scoped to a learning path
-- (thread) or a stage. A row may belong to at most one hub scope; source-scoped
-- rows keep both columns NULL.

ALTER TABLE notes ADD COLUMN thread_id TEXT REFERENCES learning_threads(id) ON DELETE CASCADE;
ALTER TABLE notes ADD COLUMN stage_id TEXT REFERENCES learning_path_stages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notes_hub_scope ON notes(thread_id, stage_id);

ALTER TABLE artifacts ADD COLUMN thread_id TEXT REFERENCES learning_threads(id) ON DELETE CASCADE;
ALTER TABLE artifacts ADD COLUMN stage_id TEXT REFERENCES learning_path_stages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_artifacts_hub_scope ON artifacts(thread_id, stage_id);
