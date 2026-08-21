-- Let study captures stay with the Lesson that produced them.
ALTER TABLE notes ADD COLUMN lesson_id TEXT REFERENCES thread_lessons(id) ON DELETE SET NULL;
ALTER TABLE artifacts ADD COLUMN lesson_id TEXT REFERENCES thread_lessons(id) ON DELETE SET NULL;
ALTER TABLE srs_cards ADD COLUMN lesson_id TEXT REFERENCES thread_lessons(id) ON DELETE SET NULL;
ALTER TABLE srs_drafts ADD COLUMN lesson_id TEXT REFERENCES thread_lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_lesson ON notes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_lesson ON artifacts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_srs_cards_lesson ON srs_cards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_srs_drafts_lesson ON srs_drafts(lesson_id);
