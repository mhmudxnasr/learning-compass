-- Signed Lite Visual receipts, immutable corpus targets, and atomic activation.

CREATE TABLE IF NOT EXISTS lite_visual_corpora (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES learning_threads(id) ON DELETE RESTRICT,
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
  target_set_sha256 TEXT NOT NULL CHECK(length(target_set_sha256)=64),
  audit_corpus_sha256 TEXT NOT NULL CHECK(length(audit_corpus_sha256)=64),
  expected_pairs INTEGER NOT NULL CHECK(expected_pairs BETWEEN 1 AND 400),
  state TEXT NOT NULL DEFAULT 'staging' CHECK(state IN ('staging','active','superseded','aborted')),
  previous_corpus_id TEXT REFERENCES lite_visual_corpora(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,
  aborted_at TEXT,
  rolled_back_at TEXT,
  UNIQUE(thread_id,target_set_sha256,audit_corpus_sha256)
);

CREATE TABLE IF NOT EXISTS lite_visual_corpus_targets (
  corpus_id TEXT NOT NULL REFERENCES lite_visual_corpora(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK(position>=0),
  recording_number INTEGER NOT NULL CHECK(recording_number>0),
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE RESTRICT,
  chapter_key TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  workdir TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES agent_jobs(id) ON DELETE RESTRICT,
  workflow_run_id TEXT NOT NULL,
  supersedes_pair_id TEXT,
  target_sha256 TEXT NOT NULL CHECK(length(target_sha256)=64),
  receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64),
  work_item_sha256 TEXT NOT NULL CHECK(length(work_item_sha256)=64),
  source_extraction_sha256 TEXT NOT NULL CHECK(length(source_extraction_sha256)=64),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  source_scope_sha256 TEXT NOT NULL CHECK(length(source_scope_sha256)=64),
  coverage_ledger_sha256 TEXT NOT NULL CHECK(length(coverage_ledger_sha256)=64),
  html_sha256 TEXT NOT NULL CHECK(length(html_sha256)=64),
  pdf_sha256 TEXT NOT NULL CHECK(length(pdf_sha256)=64),
  PRIMARY KEY(corpus_id,position),
  UNIQUE(corpus_id,recording_number),
  UNIQUE(corpus_id,recommendation_id,chapter_key),
  UNIQUE(corpus_id,pair_id),
  UNIQUE(corpus_id,job_id),
  UNIQUE(corpus_id,pair_id,recommendation_id,chapter_key,job_id,workflow_run_id)
);

CREATE TABLE IF NOT EXISTS lite_visual_pairs (
  pair_id TEXT PRIMARY KEY,
  corpus_id TEXT,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE RESTRICT,
  chapter_key TEXT NOT NULL DEFAULT '',
  job_id TEXT REFERENCES agent_jobs(id) ON DELETE RESTRICT,
  workflow_run_id TEXT,
  worker_identity TEXT,
  supersedes_pair_id TEXT,
  target_sha256 TEXT NOT NULL CHECK(length(target_sha256)=64),
  work_item_sha256 TEXT NOT NULL CHECK(length(work_item_sha256)=64),
  source_extraction_sha256 TEXT NOT NULL CHECK(length(source_extraction_sha256)=64),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  source_scope_sha256 TEXT NOT NULL CHECK(length(source_scope_sha256)=64),
  coverage_ledger_sha256 TEXT NOT NULL CHECK(length(coverage_ledger_sha256)=64),
  html_sha256 TEXT NOT NULL CHECK(length(html_sha256)=64),
  pdf_sha256 TEXT NOT NULL CHECK(length(pdf_sha256)=64),
  receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64),
  html_artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(id) ON DELETE RESTRICT,
  pdf_artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(id) ON DELETE RESTRICT,
  html_r2_key TEXT NOT NULL,
  pdf_r2_key TEXT NOT NULL,
  html_size_bytes INTEGER NOT NULL CHECK(html_size_bytes>0),
  pdf_size_bytes INTEGER NOT NULL CHECK(pdf_size_bytes>0),
  r2_verified INTEGER NOT NULL DEFAULT 0 CHECK(r2_verified IN (0,1)),
  state TEXT NOT NULL CHECK(state IN ('staged','active','superseded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,
  UNIQUE(job_id),
  FOREIGN KEY(corpus_id,pair_id,recommendation_id,chapter_key,job_id,workflow_run_id)
    REFERENCES lite_visual_corpus_targets(corpus_id,pair_id,recommendation_id,chapter_key,job_id,workflow_run_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lite_visual_active_corpora (
  thread_id TEXT PRIMARY KEY REFERENCES learning_threads(id) ON DELETE RESTRICT,
  corpus_id TEXT NOT NULL UNIQUE REFERENCES lite_visual_corpora(id) ON DELETE RESTRICT,
  activated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lite_visual_pairs_corpus_state ON lite_visual_pairs(corpus_id,state,recommendation_id);
CREATE INDEX IF NOT EXISTS idx_lite_visual_pairs_recommendation_state ON lite_visual_pairs(recommendation_id,state,created_at DESC);

-- Preserve strict history for v6 pairs that predate corpus activation. Older
-- pairs remain protected by metadata-aware API guards even when they do not
-- carry every hash needed by this table.
-- Fail closed on conflicting strict-v6 history. A duplicate pair, artifact,
-- or job identity must abort migration instead of silently omitting evidence.
INSERT INTO lite_visual_pairs(
  pair_id,corpus_id,recommendation_id,chapter_key,job_id,workflow_run_id,worker_identity,supersedes_pair_id,
  target_sha256,work_item_sha256,source_extraction_sha256,source_sha256,source_scope_sha256,coverage_ledger_sha256,
  html_sha256,pdf_sha256,receipt_sha256,html_artifact_id,pdf_artifact_id,html_r2_key,pdf_r2_key,
  html_size_bytes,pdf_size_bytes,r2_verified,state,activated_at
)
SELECT
  json_extract(h.metadata_json,'$.pair_id'),NULL,json_extract(h.metadata_json,'$.recommendation_id'),
  COALESCE(json_extract(h.metadata_json,'$.chapter_key'),''),
  CASE WHEN EXISTS (SELECT 1 FROM agent_jobs j WHERE j.id=json_extract(h.metadata_json,'$.job_id')) THEN json_extract(h.metadata_json,'$.job_id') END,
  CASE WHEN EXISTS (SELECT 1 FROM agent_jobs j WHERE j.id=json_extract(h.metadata_json,'$.job_id')) THEN json_extract(h.metadata_json,'$.workflow_run_id') END,
  NULL,json_extract(h.metadata_json,'$.supersedes_pair_id'),
  json_extract(h.metadata_json,'$.validation_receipt.target_sha256'),
  json_extract(h.metadata_json,'$.validation_receipt.work_item_sha256'),
  json_extract(h.metadata_json,'$.validation_receipt.source_extraction_sha256'),
  json_extract(h.metadata_json,'$.validation_receipt.source_sha256'),
  json_extract(h.metadata_json,'$.validation_receipt.source_scope_sha256'),
  json_extract(h.metadata_json,'$.validation_receipt.coverage_ledger_sha256'),
  json_extract(h.metadata_json,'$.html_sha256'),json_extract(p.metadata_json,'$.pdf_sha256'),
  json_extract(h.metadata_json,'$.validation_receipt_sha256'),h.id,p.id,h.r2_key,p.r2_key,h.size_bytes,p.size_bytes,1,
  CASE WHEN json_extract(h.metadata_json,'$.publication_state')='ready' THEN 'active' ELSE 'superseded' END,
  CASE WHEN json_extract(h.metadata_json,'$.publication_state')='ready' THEN h.created_at END
FROM artifacts h JOIN artifacts p
  ON json_extract(p.metadata_json,'$.pair_id')=json_extract(h.metadata_json,'$.pair_id')
  AND json_extract(p.metadata_json,'$.recommendation_id')=json_extract(h.metadata_json,'$.recommendation_id')
  AND COALESCE(json_extract(p.metadata_json,'$.chapter_key'),'')=COALESCE(json_extract(h.metadata_json,'$.chapter_key'),'')
WHERE json_extract(h.metadata_json,'$.generator')='lite-visual'
  AND json_extract(h.metadata_json,'$.role')='html' AND json_extract(p.metadata_json,'$.role')='pdf'
  AND json_extract(h.metadata_json,'$.validation_status')='passed' AND json_extract(p.metadata_json,'$.validation_status')='passed'
  AND json_extract(h.metadata_json,'$.publication_state') IN ('ready','superseded')
  AND json_extract(p.metadata_json,'$.publication_state')=json_extract(h.metadata_json,'$.publication_state')
  AND h.r2_key IS NOT NULL AND p.r2_key IS NOT NULL AND h.size_bytes>0 AND p.size_bytes>0
  AND length(json_extract(h.metadata_json,'$.validation_receipt.target_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.validation_receipt.work_item_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.validation_receipt.source_extraction_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.validation_receipt.source_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.validation_receipt.source_scope_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.validation_receipt.coverage_ledger_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.html_sha256'))=64
  AND length(json_extract(p.metadata_json,'$.pdf_sha256'))=64
  AND length(json_extract(h.metadata_json,'$.validation_receipt_sha256'))=64;

CREATE TRIGGER IF NOT EXISTS trg_lite_visual_staged_pair_guard
BEFORE INSERT ON lite_visual_pairs
WHEN NEW.corpus_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lite_visual_corpora c
    WHERE c.id=NEW.corpus_id AND c.state='staging' AND c.aborted_at IS NULL
  ) THEN RAISE(ABORT,'lite_visual_corpus_not_staging') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t
    WHERE t.corpus_id=NEW.corpus_id AND t.pair_id=NEW.pair_id
      AND t.recommendation_id=NEW.recommendation_id AND t.job_id=NEW.job_id
      AND t.chapter_key=NEW.chapter_key
      AND t.workflow_run_id=NEW.workflow_run_id
      AND t.supersedes_pair_id IS NEW.supersedes_pair_id
      AND t.target_sha256=NEW.target_sha256 AND t.receipt_sha256=NEW.receipt_sha256
      AND t.work_item_sha256=NEW.work_item_sha256 AND t.source_extraction_sha256=NEW.source_extraction_sha256
      AND t.source_sha256=NEW.source_sha256 AND t.source_scope_sha256=NEW.source_scope_sha256
      AND t.coverage_ledger_sha256=NEW.coverage_ledger_sha256 AND t.html_sha256=NEW.html_sha256 AND t.pdf_sha256=NEW.pdf_sha256
  ) THEN RAISE(ABORT,'lite_visual_pair_target_mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM agent_jobs j
    WHERE j.id=NEW.job_id AND j.job_type='visualise_source' AND j.status='running'
      AND j.workflow_step='publish_pair' AND j.workflow_run_id=NEW.workflow_run_id
      AND j.recommendation_id=NEW.recommendation_id AND j.lease_owner=NEW.worker_identity
      AND j.lease_expires_at>datetime('now')
      AND json_extract(j.payload_json,'$.recommendation_id')=NEW.recommendation_id
      AND json_extract(j.payload_json,'$.workflow_contract')='lite-visual-linear/v4'
      AND json_extract(j.payload_json,'$.revision_of_pair_id') IS NEW.supersedes_pair_id
  ) THEN RAISE(ABORT,'lite_visual_pair_job_lineage_mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM artifacts h JOIN artifacts p
    WHERE h.id=NEW.html_artifact_id AND p.id=NEW.pdf_artifact_id
      AND h.r2_key=NEW.html_r2_key AND p.r2_key=NEW.pdf_r2_key
      AND h.size_bytes=NEW.html_size_bytes AND p.size_bytes=NEW.pdf_size_bytes
      AND json_extract(h.metadata_json,'$.pair_id')=NEW.pair_id AND json_extract(p.metadata_json,'$.pair_id')=NEW.pair_id
      AND json_extract(h.metadata_json,'$.recommendation_id')=NEW.recommendation_id AND json_extract(p.metadata_json,'$.recommendation_id')=NEW.recommendation_id
      AND json_extract(h.metadata_json,'$.role')='html' AND json_extract(p.metadata_json,'$.role')='pdf'
      AND json_extract(h.metadata_json,'$.publication_state')='staged' AND json_extract(p.metadata_json,'$.publication_state')='staged'
      AND json_extract(h.metadata_json,'$.html_sha256')=NEW.html_sha256 AND json_extract(p.metadata_json,'$.pdf_sha256')=NEW.pdf_sha256
      AND json_extract(h.metadata_json,'$.validation_receipt_sha256')=NEW.receipt_sha256
      AND json_extract(p.metadata_json,'$.validation_receipt_sha256')=NEW.receipt_sha256
  ) THEN RAISE(ABORT,'lite_visual_pair_artifact_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_lite_visual_corpus_activation_guard
BEFORE UPDATE OF state ON lite_visual_corpora
WHEN NEW.state='active' AND OLD.state='staging'
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM lite_visual_corpus_targets WHERE corpus_id=NEW.id) != NEW.expected_pairs
    THEN RAISE(ABORT,'lite_visual_corpus_target_count_mismatch') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM lite_visual_pairs WHERE corpus_id=NEW.id) != NEW.expected_pairs
    THEN RAISE(ABORT,'lite_visual_corpus_pair_count_mismatch') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t
    LEFT JOIN lite_visual_pairs p ON p.corpus_id=t.corpus_id AND p.pair_id=t.pair_id
    LEFT JOIN agent_jobs j ON j.id=t.job_id
    LEFT JOIN recommendations r ON r.id=t.recommendation_id
    WHERE t.corpus_id=NEW.id AND (
      p.pair_id IS NULL OR p.state!='staged' OR p.r2_verified!=1
      OR NOT (p.recommendation_id IS t.recommendation_id)
      OR NOT (p.chapter_key IS t.chapter_key)
      OR NOT (p.job_id IS t.job_id) OR NOT (p.workflow_run_id IS t.workflow_run_id)
      OR NOT (p.receipt_sha256 IS t.receipt_sha256) OR NOT (p.target_sha256 IS t.target_sha256)
      OR j.id IS NULL OR NOT (j.job_type IS 'visualise_source') OR NOT (j.status IS 'awaiting_activation')
      OR NOT (j.workflow_step IS 'publish_pair') OR NOT (j.workflow_run_id IS t.workflow_run_id)
      OR NOT (j.recommendation_id IS t.recommendation_id)
      OR NOT (json_extract(j.payload_json,'$.recommendation_id') IS t.recommendation_id)
      OR NOT (json_extract(j.payload_json,'$.workflow_contract') IS 'lite-visual-linear/v4')
      OR NOT (json_extract(j.payload_json,'$.revision_of_pair_id') IS t.supersedes_pair_id)
      OR NOT (json_extract(j.result_json,'$.pair_id') IS t.pair_id)
      OR NOT (json_extract(j.result_json,'$.receipt_sha256') IS t.receipt_sha256)
      OR r.id IS NULL OR r.status NOT IN ('active','consumed') OR r.deleted_at IS NOT NULL
      OR NOT (r.video_url IS t.source_url) OR NOT (trim(r.video_title) IS trim(t.source_title))
      OR NOT EXISTS (SELECT 1 FROM lite_visual_corpora c JOIN thread_sources ts ON ts.thread_id=c.thread_id AND ts.recommendation_id=t.recommendation_id AND ts.status!='removed' WHERE c.id=t.corpus_id)
    )
  ) THEN RAISE(ABORT,'lite_visual_corpus_lineage_mismatch') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t
    WHERE t.corpus_id=NEW.id AND (
      (t.supersedes_pair_id IS NULL AND EXISTS (
        SELECT 1 FROM artifacts a
        WHERE json_extract(a.metadata_json,'$.recommendation_id')=t.recommendation_id
          AND COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')=t.chapter_key
          AND json_extract(a.metadata_json,'$.publication_state')='ready'
          AND json_extract(a.metadata_json,'$.validation_status')='passed'
          AND json_extract(a.metadata_json,'$.pair_id') IS NOT NULL
      ))
      OR (t.supersedes_pair_id IS NOT NULL AND (
        2 != (SELECT COUNT(DISTINCT json_extract(a.metadata_json,'$.role')) FROM artifacts a
          WHERE json_extract(a.metadata_json,'$.recommendation_id')=t.recommendation_id
            AND COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')=t.chapter_key
            AND json_extract(a.metadata_json,'$.pair_id')=t.supersedes_pair_id
            AND json_extract(a.metadata_json,'$.publication_state')='ready'
            AND json_extract(a.metadata_json,'$.validation_status')='passed'
            AND json_extract(a.metadata_json,'$.role') IN ('html','pdf'))
        OR EXISTS (SELECT 1 FROM artifacts a
          WHERE json_extract(a.metadata_json,'$.recommendation_id')=t.recommendation_id
            AND COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')=t.chapter_key
            AND json_extract(a.metadata_json,'$.publication_state')='ready'
            AND json_extract(a.metadata_json,'$.validation_status')='passed'
            AND json_extract(a.metadata_json,'$.pair_id') IS NOT NULL
            AND json_extract(a.metadata_json,'$.pair_id')!=t.supersedes_pair_id)
      ))
    )
  ) THEN RAISE(ABORT,'lite_visual_corpus_supersession_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_lite_visual_corpus_rollback_guard
BEFORE UPDATE OF state ON lite_visual_corpora
WHEN NEW.state='superseded' AND OLD.state='active' AND NEW.rolled_back_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lite_visual_active_corpora a WHERE a.thread_id=OLD.thread_id AND a.corpus_id=OLD.id
  ) THEN RAISE(ABORT,'lite_visual_rollback_pointer_mismatch') END;

  SELECT CASE WHEN (SELECT COUNT(*) FROM lite_visual_corpus_targets WHERE corpus_id=OLD.id) != OLD.expected_pairs
    OR (SELECT COUNT(*) FROM lite_visual_pairs WHERE corpus_id=OLD.id AND state='active') != OLD.expected_pairs
    THEN RAISE(ABORT,'lite_visual_rollback_active_count_mismatch') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t
    LEFT JOIN lite_visual_pairs current_pair ON current_pair.corpus_id=t.corpus_id AND current_pair.pair_id=t.pair_id
    LEFT JOIN recommendations r ON r.id=t.recommendation_id
    WHERE t.corpus_id=OLD.id AND (
      current_pair.pair_id IS NULL OR current_pair.state!='active'
      OR NOT (current_pair.recommendation_id IS t.recommendation_id)
      OR NOT (current_pair.chapter_key IS t.chapter_key)
      OR r.id IS NULL OR r.status NOT IN ('active','consumed') OR r.deleted_at IS NOT NULL
      OR NOT (r.video_url IS t.source_url) OR NOT (trim(r.video_title) IS trim(t.source_title))
      OR NOT EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id=OLD.thread_id AND ts.recommendation_id=t.recommendation_id AND ts.status!='removed')
      OR 2 != (SELECT COUNT(DISTINCT json_extract(a.metadata_json,'$.role')) FROM artifacts a
        WHERE json_extract(a.metadata_json,'$.recommendation_id')=t.recommendation_id
          AND COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')=t.chapter_key
          AND json_extract(a.metadata_json,'$.pair_id')=t.pair_id
          AND json_extract(a.metadata_json,'$.publication_state')='ready'
          AND json_extract(a.metadata_json,'$.validation_status')='passed'
          AND json_extract(a.metadata_json,'$.role') IN ('html','pdf'))
      OR EXISTS (SELECT 1 FROM artifacts a
        WHERE json_extract(a.metadata_json,'$.recommendation_id')=t.recommendation_id
          AND COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')=t.chapter_key
          AND json_extract(a.metadata_json,'$.publication_state')='ready'
          AND json_extract(a.metadata_json,'$.pair_id')!=t.pair_id)
    )
  ) THEN RAISE(ABORT,'lite_visual_rollback_current_lineage_mismatch') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t
    WHERE t.corpus_id=OLD.id AND t.supersedes_pair_id IS NOT NULL AND (
      NOT EXISTS (SELECT 1 FROM lite_visual_pairs previous_pair
        WHERE previous_pair.pair_id=t.supersedes_pair_id
          AND previous_pair.recommendation_id=t.recommendation_id
          AND previous_pair.chapter_key=t.chapter_key
          AND previous_pair.state='superseded'
          AND previous_pair.corpus_id IS OLD.previous_corpus_id)
      OR 2 != (SELECT COUNT(DISTINCT json_extract(a.metadata_json,'$.role')) FROM artifacts a
        WHERE json_extract(a.metadata_json,'$.recommendation_id')=t.recommendation_id
          AND COALESCE(json_extract(a.metadata_json,'$.chapter_key'),'')=t.chapter_key
          AND json_extract(a.metadata_json,'$.pair_id')=t.supersedes_pair_id
          AND json_extract(a.metadata_json,'$.publication_state')='superseded'
          AND json_extract(a.metadata_json,'$.validation_status')='passed'
          AND json_extract(a.metadata_json,'$.role') IN ('html','pdf'))
    )
  ) THEN RAISE(ABORT,'lite_visual_rollback_predecessor_mismatch') END;

  SELECT CASE WHEN OLD.previous_corpus_id IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM lite_visual_corpora previous_corpus
      WHERE previous_corpus.id=OLD.previous_corpus_id AND previous_corpus.thread_id=OLD.thread_id
        AND previous_corpus.state='superseded' AND previous_corpus.expected_pairs=OLD.expected_pairs)
    OR EXISTS (SELECT 1 FROM lite_visual_corpus_targets t WHERE t.corpus_id=OLD.id AND t.supersedes_pair_id IS NULL)
  ) THEN RAISE(ABORT,'lite_visual_rollback_previous_corpus_mismatch') END;
END;
