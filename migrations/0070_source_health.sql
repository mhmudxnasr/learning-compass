-- Durable, source-scoped URL health. Checks are explicit and advisory: a
-- restricted or unknown response is never treated as proof that a source died.
CREATE TABLE IF NOT EXISTS source_health (
  recommendation_id TEXT PRIMARY KEY REFERENCES recommendations(id) ON DELETE CASCADE,
  checked_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','restricted','unavailable','unknown','invalid')),
  last_checked_at TEXT NOT NULL,
  http_status INTEGER,
  final_url TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_health_attempts (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('current','replacement')),
  checked_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','restricted','unavailable','unknown','invalid')),
  http_status INTEGER,
  final_url TEXT,
  error_code TEXT,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_health_attempts_source
  ON source_health_attempts(recommendation_id, checked_at DESC, id DESC);

-- Health history is diagnostic rather than an unbounded event ledger. Retain
-- the latest 20 attempts per source, regardless of which caller recorded one.
CREATE TRIGGER IF NOT EXISTS source_health_attempts_bound_history
AFTER INSERT ON source_health_attempts
BEGIN
  DELETE FROM source_health_attempts
  WHERE recommendation_id=NEW.recommendation_id
    AND id NOT IN (
      SELECT id
      FROM source_health_attempts
      WHERE recommendation_id=NEW.recommendation_id
      ORDER BY checked_at DESC,id DESC
      LIMIT 20
    );
END;

-- Every successful preferred-URL change keeps its own immutable edge. This is
-- separate from source_metadata_json, whose archive_source_url remains the
-- compatibility pointer to the first known URL.
CREATE TABLE IF NOT EXISTS source_url_replacements (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  previous_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  previous_dedup_key TEXT NOT NULL,
  source_dedup_key TEXT NOT NULL,
  verification_attempt_id TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK(verification_status='verified'),
  verification_http_status INTEGER,
  verification_final_url TEXT,
  replaced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_url_replacements_source
  ON source_url_replacements(recommendation_id, replaced_at DESC, id DESC);
