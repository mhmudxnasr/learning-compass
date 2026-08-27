-- The original FTS5 declaration used search_idx as its own external-content
-- table. SQLite therefore rejected maintenance deletes with
-- "recursively defined fts5 content table", and Cloudflare D1 cannot export a
-- database that contains any virtual table. This small installation does not
-- need a virtual index: keep the same derived rows in an ordinary portable
-- projection with deterministic replacement semantics.

DROP TABLE IF EXISTS search_idx;

CREATE TABLE search_idx (
  -- Keep this compatibility-only column so the immediately previous Worker
  -- can be restored safely. Its legacy FTS maintenance path inserts the
  -- literal 'optimize' into search_idx(search_idx); the trigger below turns
  -- that command into a no-op on this ordinary table.
  search_idx TEXT,
  source TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, ref_id)
);

CREATE TRIGGER IF NOT EXISTS search_idx_legacy_optimize_noop
BEFORE INSERT ON search_idx
WHEN NEW.search_idx='optimize'
BEGIN
  SELECT RAISE(IGNORE);
END;

CREATE INDEX IF NOT EXISTS idx_search_idx_ref
ON search_idx(ref_id, source);

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'rec',id,TRIM(COALESCE(video_title,'') || ' ' || COALESCE(creator,'') || ' ' || COALESCE(why_this,'') || ' ' || COALESCE(user_review,''))
FROM recommendations
WHERE deleted_at IS NULL;

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'node',id,TRIM(COALESCE(label,'') || ' ' || COALESCE(meta_json,''))
FROM tree_nodes;

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'unit',id,TRIM(COALESCE(statement,'') || ' ' || COALESCE(user_synthesis,''))
FROM learning_units;

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'note',n.id,TRIM(COALESCE(n.title,'') || ' ' || COALESCE(GROUP_CONCAT(s.content,' '),''))
FROM notes n
LEFT JOIN note_sections s ON s.note_id=n.id
GROUP BY n.id;

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'assertion',assertion_key,TRIM(assertion_key || ' ' || COALESCE(value_json,''))
FROM profile_assertions
WHERE status='active';

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'memory',id,TRIM(COALESCE(memory_key,'') || ' ' || COALESCE(value_json,''))
FROM hermes_memory
WHERE status IN ('active','approved');

INSERT OR REPLACE INTO search_idx(source,ref_id,text)
SELECT 'annotation',id,TRIM(COALESCE(quote,'') || ' ' || COALESCE(context_before,'') || ' ' || COALESCE(context_after,'') || ' ' || COALESCE(language,''))
FROM source_annotations
WHERE status='active';

INSERT OR REPLACE INTO kv_store(key,value)
VALUES ('fts_last_sync',datetime('now'));

-- Thread deletion already clears this pointer before deleting the Thread.
-- Repair only historical rows that predate that behavior; preserve every
-- event, its source ownership, timestamp, type, and payload.
UPDATE learning_events
SET thread_id=NULL
WHERE thread_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM learning_threads t
    WHERE t.id=learning_events.thread_id
  );
