-- Reference FSRS state plus deterministic migration of legacy active Queue items.
ALTER TABLE srs_cards ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE srs_cards ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE srs_cards ADD COLUMN scheduled_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE srs_cards ADD COLUMN fsrs_state INTEGER NOT NULL DEFAULT 0;

UPDATE srs_cards
SET fsrs_state=CASE WHEN repetitions>0 THEN 2 ELSE 0 END,
    scheduled_days=MAX(0,COALESCE(interval_days,0)),
    scheduler_version='fsrs-6-ts-fsrs-5.4.1';

INSERT OR IGNORE INTO learning_threads
  (id,title,thread_type,guiding_question,why_now,definition_of_done,evidence_requirements_json,status,started_at,priority)
SELECT 'thread_import_' || r.id,
       'Learn: ' || r.video_title,
       'understand',
       'What must I understand, retain, and be able to explain from ' || r.video_title || '?',
       'Migrated from the active Queue so existing learning remains connected to a purpose.',
       'Produce an anchored synthesis and pass delayed free recall.',
       '[{"key":"delayed_recall","label":"Pass delayed free recall","evidence_type":"free_recall","minimum_count":1,"minimum_score":0.6}]',
       CASE WHEN NOT EXISTS (SELECT 1 FROM learning_threads WHERE status='active')
              AND r.id=(SELECT r2.id FROM recommendations r2 LEFT JOIN recommendation_meta m2 ON m2.recommendation_id=r2.id WHERE r2.status='active' AND COALESCE(m2.learning_state,'queued') IN ('queued','in_progress') ORDER BY CASE WHEN m2.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m2.priority_rank,999),r2.created_at DESC LIMIT 1)
            THEN 'active' ELSE 'draft' END,
       CASE WHEN NOT EXISTS (SELECT 1 FROM learning_threads WHERE status='active')
              AND r.id=(SELECT r3.id FROM recommendations r3 LEFT JOIN recommendation_meta m3 ON m3.recommendation_id=r3.id WHERE r3.status='active' AND COALESCE(m3.learning_state,'queued') IN ('queued','in_progress') ORDER BY CASE WHEN m3.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m3.priority_rank,999),r3.created_at DESC LIMIT 1)
            THEN datetime('now') END,
       COALESCE(m.priority_rank,0)
FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
  AND NOT EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.recommendation_id=r.id AND ts.status!='removed');

INSERT OR IGNORE INTO thread_evidence_requirements
  (id,thread_id,requirement_key,label,evidence_type,minimum_count,minimum_score)
SELECT 'thread_import_' || r.id || '_delayed_recall','thread_import_' || r.id,'delayed_recall','Pass delayed free recall','free_recall',1,0.6
FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
  AND EXISTS (SELECT 1 FROM learning_threads t WHERE t.id='thread_import_' || r.id);

INSERT OR IGNORE INTO thread_sources(thread_id,recommendation_id,role,status)
SELECT 'thread_import_' || r.id,r.id,'primary','active'
FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
  AND EXISTS (SELECT 1 FROM learning_threads t WHERE t.id='thread_import_' || r.id);

UPDATE learning_sessions
SET thread_id='thread_import_' || recommendation_id
WHERE thread_id IS NULL
  AND EXISTS (SELECT 1 FROM thread_sources ts WHERE ts.thread_id='thread_import_' || learning_sessions.recommendation_id AND ts.recommendation_id=learning_sessions.recommendation_id);
