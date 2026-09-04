-- Accept canonical source placement at any supported level of a Thread.
-- Corpus activation and rollback remain fail-closed on source identity,
-- placement, artifact parity, job lineage, and supersession history.
-- Parenthesized CASE expressions are required by the remote D1 statement
-- splitter when a migration contains CREATE TRIGGER bodies.

DROP TRIGGER IF EXISTS trg_lite_visual_corpus_activation_guard;
DROP TRIGGER IF EXISTS trg_lite_visual_corpus_rollback_guard;

DROP VIEW IF EXISTS lite_visual_thread_source_placements;

CREATE VIEW lite_visual_thread_source_placements AS
SELECT ts.thread_id,ts.recommendation_id
FROM thread_sources ts
WHERE ts.status!='removed'
UNION ALL
SELECT s.thread_id,ps.recommendation_id
FROM learning_path_sources ps
JOIN learning_path_stages s ON s.id=ps.stage_id
UNION ALL
SELECT l.thread_id,ls.recommendation_id
FROM thread_lesson_sources ls
JOIN thread_lessons l ON l.id=ls.lesson_id;

CREATE TRIGGER trg_lite_visual_corpus_activation_guard
BEFORE UPDATE OF state ON lite_visual_corpora
WHEN NEW.state='active' AND OLD.state='staging'
BEGIN
  SELECT (CASE WHEN (SELECT COUNT(*) FROM lite_visual_corpus_targets WHERE corpus_id=NEW.id) != NEW.expected_pairs
    THEN RAISE(ABORT,'lite_visual_corpus_target_count_mismatch') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM lite_visual_pairs WHERE corpus_id=NEW.id) != NEW.expected_pairs
    THEN RAISE(ABORT,'lite_visual_corpus_pair_count_mismatch') END);

  SELECT (CASE WHEN EXISTS (
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
      OR NOT EXISTS (SELECT 1 FROM lite_visual_corpora c
        JOIN lite_visual_thread_source_placements sp ON sp.thread_id=c.thread_id AND sp.recommendation_id=t.recommendation_id
        WHERE c.id=t.corpus_id)
    )
  ) THEN RAISE(ABORT,'lite_visual_corpus_lineage_mismatch') END);

  SELECT (CASE WHEN EXISTS (
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
  ) THEN RAISE(ABORT,'lite_visual_corpus_supersession_mismatch') END);
END;

CREATE TRIGGER trg_lite_visual_corpus_rollback_guard
BEFORE UPDATE OF state ON lite_visual_corpora
WHEN NEW.state='superseded' AND OLD.state='active' AND NEW.rolled_back_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM lite_visual_active_corpora a WHERE a.thread_id=OLD.thread_id AND a.corpus_id=OLD.id
  ) THEN RAISE(ABORT,'lite_visual_rollback_pointer_mismatch') END);

  SELECT (CASE WHEN (SELECT COUNT(*) FROM lite_visual_corpus_targets WHERE corpus_id=OLD.id) != OLD.expected_pairs
    OR (SELECT COUNT(*) FROM lite_visual_pairs WHERE corpus_id=OLD.id AND state='active') != OLD.expected_pairs
    THEN RAISE(ABORT,'lite_visual_rollback_active_count_mismatch') END);

  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM lite_visual_corpus_targets t
    LEFT JOIN lite_visual_pairs current_pair ON current_pair.corpus_id=t.corpus_id AND current_pair.pair_id=t.pair_id
    LEFT JOIN recommendations r ON r.id=t.recommendation_id
    WHERE t.corpus_id=OLD.id AND (
      current_pair.pair_id IS NULL OR current_pair.state!='active'
      OR NOT (current_pair.recommendation_id IS t.recommendation_id)
      OR NOT (current_pair.chapter_key IS t.chapter_key)
      OR r.id IS NULL OR r.status NOT IN ('active','consumed') OR r.deleted_at IS NOT NULL
      OR NOT (r.video_url IS t.source_url) OR NOT (trim(r.video_title) IS trim(t.source_title))
      OR NOT EXISTS (SELECT 1 FROM lite_visual_thread_source_placements sp
        WHERE sp.thread_id=OLD.thread_id AND sp.recommendation_id=t.recommendation_id)
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
  ) THEN RAISE(ABORT,'lite_visual_rollback_current_lineage_mismatch') END);

  SELECT (CASE WHEN EXISTS (
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
  ) THEN RAISE(ABORT,'lite_visual_rollback_predecessor_mismatch') END);

  SELECT (CASE WHEN OLD.previous_corpus_id IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM lite_visual_corpora previous_corpus
      WHERE previous_corpus.id=OLD.previous_corpus_id AND previous_corpus.thread_id=OLD.thread_id
        AND previous_corpus.state='superseded' AND previous_corpus.expected_pairs=OLD.expected_pairs)
    OR EXISTS (SELECT 1 FROM lite_visual_corpus_targets t WHERE t.corpus_id=OLD.id AND t.supersedes_pair_id IS NULL)
  ) THEN RAISE(ABORT,'lite_visual_rollback_previous_corpus_mismatch') END);
END;
