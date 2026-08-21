-- Source notes and recall drafts expose their grounding instead of appearing as disconnected generated items.
ALTER TABLE notes ADD COLUMN abstract TEXT;
ALTER TABLE notes ADD COLUMN extraction_contract TEXT;
ALTER TABLE notes ADD COLUMN source_word_count INTEGER;
ALTER TABLE notes ADD COLUMN note_word_count INTEGER;
ALTER TABLE notes ADD COLUMN source_hash TEXT;
ALTER TABLE notes ADD COLUMN extraction_adapter TEXT;
ALTER TABLE notes ADD COLUMN coverage_status TEXT;

ALTER TABLE srs_drafts ADD COLUMN card_type TEXT;
ALTER TABLE srs_drafts ADD COLUMN source_anchor TEXT;
ALTER TABLE srs_cards ADD COLUMN card_type TEXT;
ALTER TABLE srs_cards ADD COLUMN source_anchor TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_source_dossier ON notes(recommendation_id, kind, updated_at);
CREATE INDEX IF NOT EXISTS idx_srs_drafts_unit_status ON srs_drafts(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_srs_cards_unit_due ON srs_cards(unit_id, due_at);
