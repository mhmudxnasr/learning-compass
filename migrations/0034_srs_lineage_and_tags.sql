-- Migration 0034: SRS Card & Draft Lineage and Hierarchical Tags
ALTER TABLE srs_cards ADD COLUMN note_id TEXT;
ALTER TABLE srs_cards ADD COLUMN branch TEXT;
ALTER TABLE srs_drafts ADD COLUMN branch TEXT;

CREATE INDEX IF NOT EXISTS idx_srs_cards_branch ON srs_cards(branch);
CREATE INDEX IF NOT EXISTS idx_srs_cards_note ON srs_cards(note_id);
CREATE INDEX IF NOT EXISTS idx_srs_drafts_branch ON srs_drafts(branch);
CREATE INDEX IF NOT EXISTS idx_srs_drafts_note ON srs_drafts(note_id);
