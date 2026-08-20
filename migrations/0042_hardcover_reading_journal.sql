-- Server-side Hardcover mirror. External records stay separate from canonical
-- Compass sources until the user assigns a verified branch.

CREATE TABLE IF NOT EXISTS hardcover_books (
  hardcover_book_id INTEGER PRIMARY KEY,
  user_book_id INTEGER NOT NULL,
  edition_id INTEGER,
  title TEXT NOT NULL,
  author TEXT,
  slug TEXT,
  cover_url TEXT,
  status_id INTEGER NOT NULL,
  rating REAL,
  progress REAL,
  progress_pages INTEGER,
  date_added TEXT,
  last_read_date TEXT,
  recommendation_id TEXT REFERENCES recommendations(id) ON DELETE SET NULL,
  raw_json TEXT NOT NULL DEFAULT '{}',
  last_seen_sync TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hardcover_books_user_book ON hardcover_books(user_book_id);
CREATE INDEX IF NOT EXISTS idx_hardcover_books_seen ON hardcover_books(last_seen_sync);
CREATE INDEX IF NOT EXISTS idx_hardcover_books_recommendation ON hardcover_books(recommendation_id);

CREATE TABLE IF NOT EXISTS hardcover_journal_entries (
  hardcover_journal_id TEXT PRIMARY KEY,
  hardcover_book_id INTEGER NOT NULL REFERENCES hardcover_books(hardcover_book_id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK(event IN ('note','quote')),
  entry TEXT NOT NULL,
  action_at TEXT NOT NULL,
  edition_id INTEGER,
  page INTEGER,
  total_pages INTEGER,
  privacy_setting_id INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_seen_sync TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hardcover_journal_book ON hardcover_journal_entries(hardcover_book_id,action_at DESC);
CREATE INDEX IF NOT EXISTS idx_hardcover_journal_event ON hardcover_journal_entries(event,action_at DESC);
CREATE INDEX IF NOT EXISTS idx_hardcover_journal_seen ON hardcover_journal_entries(last_seen_sync);

CREATE TABLE IF NOT EXISTS hardcover_sync_state (
  id TEXT PRIMARY KEY CHECK(id='primary'),
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','syncing','ready','error')),
  hardcover_user_id INTEGER,
  username TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  book_count INTEGER NOT NULL DEFAULT 0,
  journal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO hardcover_sync_state (id) VALUES ('primary');
