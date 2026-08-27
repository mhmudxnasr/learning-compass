-- Keep one canonical live Hermes memory value per stable key.
-- Older duplicate active/approved rows are preserved as superseded evidence.

UPDATE hermes_memory
SET status='superseded',updated_at=datetime('now')
WHERE id IN (
  SELECT older.id
  FROM hermes_memory older
  JOIN hermes_memory newer
    ON newer.memory_key=older.memory_key
   AND newer.status IN ('active','approved')
   AND (
     COALESCE(newer.updated_at,newer.created_at,'') > COALESCE(older.updated_at,older.created_at,'')
     OR (
       COALESCE(newer.updated_at,newer.created_at,'') = COALESCE(older.updated_at,older.created_at,'')
       AND newer.id > older.id
     )
   )
  WHERE older.status IN ('active','approved')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_memory_one_live_key
ON hermes_memory(memory_key)
WHERE status IN ('active','approved');
