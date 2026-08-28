import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { BRIEFING_JOB_COUNTS_SQL, DELAYED_RETRY_COUNT_SQL, OVERDUE_RETRY_COUNT_SQL } from '../../src/services/job-retry-health.ts'

test('future-scheduled retries stay delayed while due stale retries become overdue', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`
      CREATE TABLE agent_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        lease_expires_at TEXT
      );
      CREATE TABLE agent_job_retries (
        job_id TEXT PRIMARY KEY,
        next_attempt_at TEXT,
        dead_lettered_at TEXT
      );
      INSERT INTO agent_jobs (id,status,created_at,updated_at) VALUES
        ('future-delay','retry',datetime('now','-2 hours'),datetime('now','-2 hours')),
        ('due-retry','retry',datetime('now','-2 hours'),datetime('now','-2 hours')),
        ('missing-ledger','retry',datetime('now','-2 hours'),datetime('now','-2 hours')),
        ('fresh-due','retry',datetime('now','-10 minutes'),datetime('now','-10 minutes'));
      INSERT INTO agent_jobs (id,status,created_at,updated_at,lease_expires_at) VALUES
        ('staged-corpus','awaiting_activation',datetime('now','-2 hours'),datetime('now','-2 hours'),datetime('now','-1 hour'));
      INSERT INTO agent_job_retries (job_id,next_attempt_at,dead_lettered_at) VALUES
        ('future-delay',datetime('now','+1 hour'),NULL),
        ('due-retry',datetime('now','-1 minute'),NULL),
        ('fresh-due',datetime('now','-1 minute'),NULL);
    `)

    const briefingCounts = sqlite.prepare(BRIEFING_JOB_COUNTS_SQL).get() as Record<string, number>
    assert.equal(Number(briefingCounts.active_count), 5)
    assert.equal(Number(briefingCounts.stale_count), 0)
    assert.equal(Number(briefingCounts.overdue_retry_count), 2)

    const delayed = sqlite.prepare(DELAYED_RETRY_COUNT_SQL).get() as { count: number }
    const overdue = sqlite.prepare(OVERDUE_RETRY_COUNT_SQL(30)).get() as { count: number }
    assert.equal(Number(delayed.count), 1)
    assert.equal(Number(overdue.count), 2)
  } finally {
    sqlite.close()
  }
})
