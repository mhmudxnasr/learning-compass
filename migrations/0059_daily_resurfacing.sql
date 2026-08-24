-- Daily source resurfacing is a passive review loop. Preferences and presentation
-- history are separate from lesson, mastery, and source completion state.
CREATE TABLE IF NOT EXISTS resurfacing_preferences (
  recommendation_id TEXT PRIMARY KEY REFERENCES recommendations(id) ON DELETE CASCADE,
  starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resurfacing_presentations (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  cairo_day TEXT NOT NULL,
  presented_at TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT CHECK(action IN ('reviewed','snooze','dismissed')),
  acted_at TEXT,
  UNIQUE(recommendation_id, cairo_day)
);

CREATE INDEX IF NOT EXISTS idx_resurfacing_presentations_source
  ON resurfacing_presentations(recommendation_id, cairo_day DESC);
