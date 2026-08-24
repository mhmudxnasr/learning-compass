-- Materialize the legacy reading-desk choice once. Runtime reads never promote
-- another Reading book when the explicit pin is absent or later cleared.
WITH chosen AS (
  SELECT COALESCE(
    (
      SELECT r.id
      FROM recommendations r
      JOIN recommendation_meta m ON m.recommendation_id = r.id
      WHERE r.content_type = 'book'
        AND (r.status IS NULL OR r.status != 'deleted')
        AND r.deleted_at IS NULL
        AND json_extract(COALESCE(m.source_metadata_json, '{}'), '$.book_primary') = 1
        AND json_extract(COALESCE(m.source_metadata_json, '{}'), '$.book_reading_state') = 'reading'
      ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
      LIMIT 1
    ),
    (
      SELECT r.id
      FROM recommendations r
      JOIN recommendation_meta m ON m.recommendation_id = r.id
      WHERE r.content_type = 'book'
        AND (r.status IS NULL OR r.status != 'deleted')
        AND r.deleted_at IS NULL
        AND (
          json_extract(COALESCE(m.source_metadata_json, '{}'), '$.book_reading_state') = 'reading'
          OR (
            json_extract(COALESCE(m.source_metadata_json, '{}'), '$.book_reading_state') IS NULL
            AND m.learning_state = 'in_progress'
          )
        )
      ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
      LIMIT 1
    )
  ) AS id
)
UPDATE recommendation_meta
SET source_metadata_json = json_patch(
      COALESCE(source_metadata_json, '{}'),
      json_object('book_primary', CASE WHEN recommendation_id = (SELECT id FROM chosen) THEN 1 ELSE 0 END)
    ),
    updated_at = datetime('now')
WHERE recommendation_id IN (
  SELECT id FROM recommendations WHERE content_type = 'book'
);
