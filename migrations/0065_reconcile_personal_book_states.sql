-- Reconcile the personal ledger with canonical Books state. The first import
-- only had to inspect book_reading_state metadata, but older consumed books
-- legitimately carry their finished state in recommendations.status or
-- recommendation_meta.learning_state instead.
UPDATE personal_library_items
SET
  state = 'completed',
  completed_at = COALESCE(completed_at, (
    SELECT COALESCE(r.updated_at, r.created_at, datetime('now'))
    FROM recommendations r
    WHERE r.id = personal_library_items.recommendation_id
  )),
  updated_at = datetime('now')
WHERE item_type = 'book'
  AND state = 'planned'
  AND recommendation_id IN (
    SELECT r.id
    FROM recommendations r
    LEFT JOIN recommendation_meta m ON m.recommendation_id = r.id
    WHERE r.content_type = 'book'
      AND (r.status = 'consumed'
        OR m.learning_state = 'completed'
        OR json_extract(COALESCE(m.source_metadata_json, '{}'), '$.book_reading_state') = 'finished')
  );
