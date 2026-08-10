CREATE TABLE IF NOT EXISTS source_learning_dispositions (
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  thread_id TEXT REFERENCES learning_threads(id),
  disposition TEXT NOT NULL CHECK(disposition IN ('retain','apply','reference','drop','undecided')),
  reason TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(recommendation_id,thread_id)
);

CREATE VIEW IF NOT EXISTS verified_learning_outcomes AS
SELECT t.id thread_id,t.title,t.thread_type,t.verified_at,
  COUNT(DISTINCT e.id) evidence_count,
  COUNT(DISTINCT CASE WHEN e.evidence_type IN ('transfer','application','decision','artifact') THEN e.id END) applied_evidence_count
FROM learning_threads t
LEFT JOIN learning_evidence e ON e.thread_id=t.id AND e.result IN ('pass','recorded')
WHERE t.status='verified'
GROUP BY t.id;

