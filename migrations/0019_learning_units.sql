CREATE TABLE IF NOT EXISTS learning_units (
  id TEXT PRIMARY KEY,
  unit_type TEXT NOT NULL CHECK(unit_type IN ('claim','concept','method','example','question','application','counterclaim')),
  statement TEXT NOT NULL,
  user_synthesis TEXT,
  stance TEXT NOT NULL DEFAULT 'uncertain' CHECK(stance IN ('accept','question','reject','uncertain')),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence>=0 AND confidence<=1),
  recommendation_id TEXT REFERENCES recommendations(id),
  source_artifact_id TEXT,
  source_revision_checksum TEXT,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK(created_by IN ('user','extractor')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','accepted','rejected','superseded')),
  semantic_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_units_semantic ON learning_units(recommendation_id,semantic_key) WHERE semantic_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_units_source ON learning_units(recommendation_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS unit_anchors (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  artifact_id TEXT,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('page','timestamp','section','quote','url_fragment','user_observation')),
  locator TEXT NOT NULL,
  excerpt TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_unit_anchors_unit ON unit_anchors(unit_id);

CREATE TABLE IF NOT EXISTS unit_relations (
  id TEXT PRIMARY KEY,
  source_unit_id TEXT NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  target_unit_id TEXT NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('supports','contradicts','qualifies','example_of','depends_on','applies_to')),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence>=0 AND confidence<=1),
  evidence_anchor_id TEXT REFERENCES unit_anchors(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','rejected','superseded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_unit_id,target_unit_id,relation_type)
);

CREATE TABLE IF NOT EXISTS thread_units (
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'supporting' CHECK(role IN ('core','supporting','counterevidence','application')),
  importance REAL NOT NULL DEFAULT 0.5,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(thread_id,unit_id)
);

CREATE TABLE IF NOT EXISTS learning_unit_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id TEXT NOT NULL REFERENCES learning_units(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','agent','system')),
  previous_json TEXT,
  next_json TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

