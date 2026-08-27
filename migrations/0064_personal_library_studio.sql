-- Typed personal-library records sit beside canonical source identity. They keep
-- media state and progress out of the Queue lifecycle while reusing the same
-- branch, deduplication, rating, export, and recovery boundaries.
CREATE TABLE IF NOT EXISTS personal_library_items (
  recommendation_id TEXT PRIMARY KEY REFERENCES recommendations(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('book','movie','series','podcast','course','game','album','other')),
  state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','in_progress','completed','paused','dropped')),
  release_year INTEGER CHECK(release_year IS NULL OR release_year BETWEEN 1800 AND 2200),
  duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes >= 0),
  progress_current REAL CHECK(progress_current IS NULL OR progress_current >= 0),
  progress_total REAL CHECK(progress_total IS NULL OR progress_total > 0),
  progress_unit TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json)='array'),
  personal_note TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total)
);

CREATE INDEX IF NOT EXISTS idx_personal_library_type_state
  ON personal_library_items(item_type, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_library_updated
  ON personal_library_items(updated_at DESC);

-- Books already form a personal library. Project them into the typed studio
-- without changing their Queue-independent reading state or canonical identity.
INSERT OR IGNORE INTO personal_library_items (
  recommendation_id,item_type,state,tags_json,personal_note,started_at,completed_at,created_at,updated_at
)
SELECT
  r.id,
  'book',
  CASE json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_reading_state')
    WHEN 'reading' THEN 'in_progress'
    WHEN 'finished' THEN 'completed'
    ELSE 'planned'
  END,
  CASE WHEN json_valid(COALESCE(m.tags_json,'[]')) AND json_type(COALESCE(m.tags_json,'[]'))='array'
    THEN COALESCE(m.tags_json,'[]') ELSE '[]' END,
  NULL,
  CASE WHEN json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_reading_state')='reading'
    THEN COALESCE(m.started_at,r.created_at) ELSE NULL END,
  CASE WHEN json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_reading_state')='finished'
    THEN COALESCE(r.updated_at,r.created_at) ELSE NULL END,
  COALESCE(r.created_at,datetime('now')),
  COALESCE(r.updated_at,r.created_at,datetime('now'))
FROM recommendations r
LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
WHERE r.content_type='book' AND r.deleted_at IS NULL AND COALESCE(r.status,'')!='deleted';

INSERT OR IGNORE INTO learning_events (
  id,idempotency_key,event_type,actor_type,evidence_weight,recommendation_id,occurred_at,payload_json
)
SELECT
  'personal-library-import:' || p.recommendation_id,
  'personal-library-import:' || p.recommendation_id,
  'personal_library_imported',
  'system',
  0,
  p.recommendation_id,
  p.created_at,
  json_object('item_type',p.item_type,'state',p.state,'source','migration_0064')
FROM personal_library_items p;
