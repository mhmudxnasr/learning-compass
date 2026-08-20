-- Give learner-facing Levels first-class Recall Card and Recall Draft ownership.
-- Thread ancestry remains on each Level-owned row so review evidence can still
-- roll up to its parent Thread without inferring ownership from topic text.
ALTER TABLE srs_cards ADD COLUMN stage_id TEXT REFERENCES learning_path_stages(id) ON DELETE SET NULL;
ALTER TABLE srs_drafts ADD COLUMN stage_id TEXT REFERENCES learning_path_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_srs_cards_thread_stage_due ON srs_cards(thread_id, stage_id, due_at);
CREATE INDEX IF NOT EXISTS idx_srs_drafts_thread_stage_status ON srs_drafts(thread_id, stage_id, status);

UPDATE srs_cards
SET stage_id=(SELECT n.stage_id FROM notes n WHERE n.id=srs_cards.note_id),
    thread_id=COALESCE(thread_id,(
      SELECT s.thread_id FROM notes n JOIN learning_path_stages s ON s.id=n.stage_id
      WHERE n.id=srs_cards.note_id
    ))
WHERE stage_id IS NULL
  AND note_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM notes n WHERE n.id=srs_cards.note_id AND n.stage_id IS NOT NULL);

UPDATE srs_drafts
SET stage_id=(SELECT n.stage_id FROM notes n WHERE n.id=srs_drafts.note_id),
    thread_id=COALESCE(thread_id,(
      SELECT s.thread_id FROM notes n JOIN learning_path_stages s ON s.id=n.stage_id
      WHERE n.id=srs_drafts.note_id
    ))
WHERE stage_id IS NULL
  AND note_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM notes n WHERE n.id=srs_drafts.note_id AND n.stage_id IS NOT NULL);
