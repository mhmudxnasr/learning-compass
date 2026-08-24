-- Distillation is additive: canonical note sections are never rewritten.
CREATE TABLE IF NOT EXISTS note_claim_highlights (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  block_index INTEGER NOT NULL CHECK(block_index >= 0),
  block_checksum TEXT NOT NULL,
  source_text TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  promoted_unit_id TEXT REFERENCES learning_units(id) ON DELETE SET NULL,
  promoted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_synthesis_revisions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  synthesis_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(note_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_note_claim_highlights_note
  ON note_claim_highlights(note_id, created_at);
CREATE INDEX IF NOT EXISTS idx_note_synthesis_revisions_note
  ON note_synthesis_revisions(note_id, revision DESC);
