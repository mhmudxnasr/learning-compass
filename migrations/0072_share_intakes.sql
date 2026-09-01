-- Android/web-share POST bodies must survive the redirect into the client.
-- A pending intake is not a source: branch ownership is still reviewed before
-- ordinary capture, and anchor intakes close only after an annotation exists.
-- A prose-plus-URL share is intentionally ambiguous: its durable `review`
-- receipt must be resolved explicitly before either completion path can run.

CREATE TABLE IF NOT EXISTS share_intakes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('capture','anchor','review')),
  resolved_kind TEXT CHECK(resolved_kind IS NULL OR resolved_kind IN ('capture','anchor')),
  title TEXT,
  shared_text TEXT,
  source_url TEXT,
  source_identity_url TEXT,
  source_identity_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','consumed')),
  recommendation_id TEXT REFERENCES recommendations(id) ON DELETE SET NULL,
  annotation_id TEXT REFERENCES source_annotations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_share_intakes_pending
  ON share_intakes(status,created_at DESC);
