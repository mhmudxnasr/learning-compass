-- Learner-controlled recall repair. Review history remains append-only while
-- cards can be revised, paused, retired, or explicitly reset.

ALTER TABLE srs_cards ADD COLUMN annotation_id TEXT REFERENCES source_annotations(id) ON DELETE SET NULL;
ALTER TABLE srs_cards ADD COLUMN repair_status TEXT NOT NULL DEFAULT 'active' CHECK(repair_status IN ('active','paused','retired'));
ALTER TABLE srs_cards ADD COLUMN repair_lapses_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(repair_lapses_acknowledged >= 0);
ALTER TABLE srs_cards ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 1 CHECK(content_revision >= 1);
ALTER TABLE srs_cards ADD COLUMN scheduler_revision INTEGER NOT NULL DEFAULT 1 CHECK(scheduler_revision >= 1);
ALTER TABLE srs_cards ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 1 CHECK(status_revision >= 1);
ALTER TABLE srs_cards ADD COLUMN last_recall_mutation_id TEXT;
ALTER TABLE srs_cards ADD COLUMN content_updated_at TEXT;
ALTER TABLE srs_cards ADD COLUMN paused_at TEXT;
ALTER TABLE srs_cards ADD COLUMN retired_at TEXT;

CREATE INDEX IF NOT EXISTS idx_srs_cards_repair
  ON srs_cards(repair_status,lapses,repair_lapses_acknowledged,last_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_srs_cards_annotation ON srs_cards(annotation_id);

CREATE TABLE IF NOT EXISTS srs_card_repair_events (
  id TEXT PRIMARY KEY,
  -- Deliberately not a foreign key: the audit survives legacy permanent card deletion.
  card_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('edit','pause','resume','retire','restore','reset')),
  change_kind TEXT CHECK(change_kind IS NULL OR change_kind IN ('wording','semantic')),
  previous_content_json TEXT,
  next_content_json TEXT,
  previous_scheduler_json TEXT,
  next_scheduler_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_srs_card_repair_events_card
  ON srs_card_repair_events(card_id,created_at DESC);
