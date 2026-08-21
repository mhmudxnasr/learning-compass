-- Remove artificial thread evidence requirements and proof gating.
DROP TABLE IF EXISTS thread_requirement_evidence;
DROP TABLE IF EXISTS thread_evidence_requirements;

UPDATE learning_threads
SET evidence_requirements_json = '[]';
