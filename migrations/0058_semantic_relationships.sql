ALTER TABLE learning_units ADD COLUMN note_id TEXT REFERENCES notes(id);

ALTER TABLE unit_relations ADD COLUMN why TEXT;
ALTER TABLE unit_relations ADD COLUMN source_anchor_id TEXT REFERENCES unit_anchors(id);
ALTER TABLE unit_relations ADD COLUMN target_anchor_id TEXT REFERENCES unit_anchors(id);
ALTER TABLE unit_relations ADD COLUMN review_state TEXT NOT NULL DEFAULT 'accepted' CHECK(review_state IN ('pending','accepted','resolved','dismissed'));
ALTER TABLE unit_relations ADD COLUMN resolution TEXT;
ALTER TABLE unit_relations ADD COLUMN reviewed_at TEXT;

UPDATE learning_units
SET note_id = (
  SELECT n.id FROM notes n
  WHERE n.recommendation_id = learning_units.recommendation_id
  ORDER BY CASE n.kind WHEN 'guide' THEN 0 WHEN 'note' THEN 1 ELSE 2 END, n.updated_at DESC
  LIMIT 1
)
WHERE note_id IS NULL AND recommendation_id IS NOT NULL;

UPDATE unit_relations SET source_anchor_id=evidence_anchor_id WHERE source_anchor_id IS NULL AND evidence_anchor_id IS NOT NULL;
UPDATE unit_relations SET review_state='pending' WHERE relation_type='contradicts';

CREATE INDEX IF NOT EXISTS idx_learning_units_note ON learning_units(note_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_relations_review ON unit_relations(relation_type,review_state,status,created_at DESC);
