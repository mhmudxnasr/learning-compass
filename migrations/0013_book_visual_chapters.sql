CREATE TABLE IF NOT EXISTS book_visual_chapters (
  recommendation_id TEXT NOT NULL,
  chapter_key TEXT NOT NULL,
  chapter_title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (recommendation_id, chapter_key),
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_book_visual_chapters_recommendation
  ON book_visual_chapters(recommendation_id, position);
