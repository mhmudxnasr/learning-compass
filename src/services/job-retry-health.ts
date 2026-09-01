export const BRIEFING_JOB_COUNTS_SQL = `SELECT
  SUM(CASE WHEN j.status IN ('pending','running','retry','awaiting_activation') THEN 1 ELSE 0 END) active_count,
  SUM(CASE WHEN j.status='failed' THEN 1 ELSE 0 END) failed_count,
  SUM(CASE WHEN j.status='dead_letter' THEN 1 ELSE 0 END) dead_letter_count,
  SUM(CASE WHEN j.status='running' AND j.lease_expires_at<datetime('now') THEN 1 ELSE 0 END) stale_count,
  SUM(CASE WHEN j.status='retry'
    AND datetime(j.updated_at)<datetime('now','-30 minutes')
    AND jr.dead_lettered_at IS NULL
    AND (jr.next_attempt_at IS NULL OR datetime(jr.next_attempt_at)<=datetime('now'))
    THEN 1 ELSE 0 END) overdue_retry_count
  FROM agent_jobs j
  LEFT JOIN agent_job_retries jr ON jr.job_id=j.id
  WHERE j.status IN ('pending','running','retry','awaiting_activation','failed','dead_letter')`

export const DELAYED_RETRY_COUNT_SQL = `SELECT COUNT(*) count
  FROM agent_job_retries r
  JOIN agent_jobs j ON j.id=r.job_id
  WHERE j.status='retry'
    AND r.dead_lettered_at IS NULL
    AND datetime(r.next_attempt_at)>datetime('now')`

export const OVERDUE_RETRY_COUNT_SQL = (staleAfterMinutes: number) => `SELECT COUNT(*) count
  FROM agent_jobs j
  LEFT JOIN agent_job_retries r ON r.job_id=j.id
  WHERE j.status='retry'
    AND datetime(j.updated_at)<datetime('now','-${staleAfterMinutes} minutes')
    AND r.dead_lettered_at IS NULL
    AND (r.next_attempt_at IS NULL OR datetime(r.next_attempt_at)<=datetime('now'))`
