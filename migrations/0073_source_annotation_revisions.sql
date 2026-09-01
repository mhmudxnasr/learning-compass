-- Evidence-bearing annotation rows are immutable. A checksum-changing edit
-- creates a new active row and archives the prior row, preserving an explicit
-- revision edge for exact historical provenance.
ALTER TABLE source_annotations ADD COLUMN revision_of_annotation_id TEXT REFERENCES source_annotations(id) ON DELETE SET NULL;
ALTER TABLE source_annotations ADD COLUMN selector_source_identities_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_source_annotations_revision
  ON source_annotations(revision_of_annotation_id,created_at DESC);
