-- Tracks source-of-truth indexing state while Vectorize stores the vectors.
-- D1 lets the Worker reindex only changed documents and audit model use.
CREATE TABLE IF NOT EXISTS semantic_documents (
  id TEXT PRIMARY KEY,
  document_kind TEXT NOT NULL CHECK(document_kind IN ('recommendation','thread','note','unit')),
  source_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'indexed' CHECK(status IN ('indexed','failed')),
  error TEXT,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_kind, source_id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_documents_status ON semantic_documents(document_kind,status,updated_at DESC);
