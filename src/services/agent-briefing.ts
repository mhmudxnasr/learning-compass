import type { Bindings } from '../lib'
import { BRIEFING_JOB_COUNTS_SQL } from './job-retry-health.ts'

export type HermesNextAction = {
  id: string
  kind: 'review' | 'continue' | 'approve_recall' | 'curate' | 'repair'
  label: string
  reason: string
  target: string
  href: string
  priority: 'high' | 'medium' | 'low'
  thread_id?: string
  stage_id?: string
  recommendation_id?: string
  source_id?: string
}

type Database = Bindings['DB']

const count = (row: any) => Number(row?.count || 0)

const resultRow = (results: readonly D1Result<unknown>[], index: number) =>
  ((results[index]?.results || []) as any[])[0] || null

/**
 * One small, deterministic action projection shared by the Worker dashboard
 * and Hermes context. It never creates recommendations or changes learning
 * state; it only explains the next useful existing action.
 */
export async function loadHermesBrief(DB: Database) {
  // A single D1 batch keeps this manager fast path to one database round trip
  // while each bounded statement remains independently indexable.
  const results = await DB.batch([
    DB.prepare(`SELECT r.id,r.video_title,m.learning_state,m.branch_id,
      n.label branch_label,n.status branch_status,n.super_category branch_domain,
      COUNT(*) OVER () queue_count,
      SUM(CASE WHEN m.branch_id IS NULL OR trim(m.branch_id)='' OR n.id IS NULL OR n.type='root' OR lower(COALESCE(n.status,''))='pruned' THEN 1 ELSE 0 END) OVER () invalid_branch_count,
      SUM(CASE WHEN n.super_category IS NULL OR trim(n.super_category)='' THEN 1 ELSE 0 END) OVER () missing_domain_count
      FROM recommendations r
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      LEFT JOIN tree_nodes n ON n.id=m.branch_id
      WHERE r.status='active' AND COALESCE(r.content_type,'')!='book'
        AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
      ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 1`),
    DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE repair_status='active' AND due_at<=date('now')`),
    DB.prepare(`SELECT COUNT(*) count FROM srs_drafts WHERE status='draft'`),
    DB.prepare(`SELECT COUNT(*) count FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.status='active' AND COALESCE(r.content_type,'')!='book' AND m.learning_state='captured'`),
    DB.prepare(`SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending'`),
    DB.prepare(`SELECT cr.id,cr.recommendation_id,cr.failure_reason,r.video_title
      ,COUNT(*) OVER () open_count
      FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id
      WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at LIMIT 1`),
    DB.prepare(BRIEFING_JOB_COUNTS_SQL),
    DB.prepare(`SELECT l.id,l.title,l.thread_id,l.stage_id,t.title thread_title,COUNT(*) OVER () missing_count
      FROM thread_lessons l
      JOIN learning_path_stages s ON s.id=l.stage_id
      JOIN learning_threads t ON t.id=l.thread_id
      WHERE t.status='active' AND s.status IN ('available','in_progress') AND l.status!='completed'
        AND (l.content IS NULL OR trim(l.content)='')
        AND NOT EXISTS (
          SELECT 1 FROM thread_lesson_sources ls
          JOIN recommendations r ON r.id=ls.recommendation_id
          WHERE ls.lesson_id=l.id AND ls.role='primary' AND r.deleted_at IS NULL
        )
      ORDER BY s.position,l.position,l.created_at LIMIT 1`),
  ])
  const queue = resultRow(results, 0)
  const due = resultRow(results, 1)
  const drafts = resultRow(results, 2)
  const inbox = resultRow(results, 3)
  const proposals = resultRow(results, 4)
  const consolidation = resultRow(results, 5)
  const jobs = resultRow(results, 6)
  const missingMaterial = resultRow(results, 7)
  const queueCount = count({ count: queue?.queue_count })
  const failedJobs = count({ count: jobs?.failed_count })
  const deadLetterJobs = count({ count: jobs?.dead_letter_count })
  const staleJobs = count({ count: jobs?.stale_count })
  const overdueRetries = count({ count: jobs?.overdue_retry_count })

  let next_action: HermesNextAction
  if (count(due) > 0) {
    next_action = {
      id: 'due-recall', kind: 'review', label: 'Review due recall',
      reason: `${count(due)} recall ${count(due) === 1 ? 'card is' : 'cards are'} due today.`,
      target: 'learn.recall', href: '#/learn?mode=practice&focus=recall', priority: 'high',
    }
  } else if (staleJobs > 0 || failedJobs > 0 || deadLetterJobs > 0 || overdueRetries > 0) {
    const issue = staleJobs > 0 ? `${staleJobs} stale job ${staleJobs === 1 ? 'lease needs' : 'leases need'} recovery`
      : deadLetterJobs > 0 ? `${deadLetterJobs} dead-letter ${deadLetterJobs === 1 ? 'job needs' : 'jobs need'} review`
        : failedJobs > 0 ? `${failedJobs} failed ${failedJobs === 1 ? 'job needs' : 'jobs need'} review`
          : `${overdueRetries} overdue ${overdueRetries === 1 ? 'retry needs' : 'retries need'} recovery`
    next_action = {
      id: staleJobs > 0 ? 'jobs:stale' : deadLetterJobs > 0 ? 'jobs:dead-letter' : failedJobs > 0 ? 'jobs:failed' : 'jobs:overdue-retry',
      kind: 'repair', label: 'Repair blocked Hermes work', reason: `${issue}.`,
      target: 'settings.system.jobs', href: '#/settings?mode=system', priority: 'high',
    }
  } else if (consolidation) {
    next_action = {
      id: `consolidation:${consolidation.id}`, kind: 'repair', label: 'Resolve an open consolidation loop',
      reason: `${consolidation.video_title || 'A completed source'} still has unfinished consolidation work.`,
      target: `library.source.${consolidation.recommendation_id}`, href: `#/library/source/${encodeURIComponent(consolidation.recommendation_id)}`,
      priority: 'high', source_id: consolidation.recommendation_id, recommendation_id: consolidation.recommendation_id,
    }
  } else if (queue) {
    next_action = {
      id: `queue:${queue.id}`, kind: 'continue', label: queue.learning_state === 'in_progress' ? 'Continue the current source' : 'Start the next source',
      reason: `${queue.video_title || 'Your next source'} is ${queue.learning_state === 'in_progress' ? 'in progress' : 'ready to start'}.`,
      target: 'library.queue', href: '#/library?mode=triage&focus=queue', priority: 'medium', recommendation_id: queue.id,
    }
  } else if (missingMaterial) {
    next_action = {
      id: `lesson-material:${missingMaterial.id}`, kind: 'curate', label: 'Add the missing lesson material',
      reason: `${missingMaterial.title || 'The next lesson'} has neither authored content nor a primary source.`,
      target: `learn.lesson.${missingMaterial.id}`,
      href: `#/learn/t/${encodeURIComponent(missingMaterial.thread_id)}/l/${encodeURIComponent(missingMaterial.id)}`,
      priority: 'medium', thread_id: missingMaterial.thread_id, stage_id: missingMaterial.stage_id,
    }
  } else if (count(proposals) > 0) {
    next_action = {
      id: 'pending-proposals', kind: 'review', label: 'Review pending Hermes changes',
      reason: `${count(proposals)} proposed ${count(proposals) === 1 ? 'change is' : 'changes are'} waiting for a decision.`,
      target: 'settings.system.proposals', href: '#/settings?mode=system', priority: 'medium',
    }
  } else if (count(drafts) > 0) {
    next_action = {
      id: 'recall-drafts', kind: 'approve_recall', label: 'Review recall drafts',
      reason: `${count(drafts)} drafted ${count(drafts) === 1 ? 'card is' : 'cards are'} waiting for approval.`,
      target: 'learn.recall', href: '#/learn?mode=practice&focus=recall', priority: 'medium',
    }
  } else if (count(inbox) > 0) {
    next_action = {
      id: 'captured-sources', kind: 'curate', label: 'Review captured sources',
      reason: `${count(inbox)} captured ${count(inbox) === 1 ? 'source needs' : 'sources need'} a decision.`,
      target: 'home.capture', href: '#/home?action=capture', priority: 'low',
    }
  } else {
    next_action = {
      id: 'capture', kind: 'curate', label: 'Capture the next useful source',
      reason: 'The active Queue and captured sources are clear.', target: 'home.capture', href: '#/home?action=capture', priority: 'low',
    }
  }

  return {
    as_of: new Date().toISOString(),
    next_action,
    blockers: {
      pending_proposals: count(proposals),
      active_jobs: count({ count: jobs?.active_count }),
      failed_jobs: failedJobs,
      dead_letter_jobs: deadLetterJobs,
      stale_jobs: staleJobs,
      overdue_retries: overdueRetries,
      open_consolidation: Boolean(consolidation),
      open_consolidation_count: count({ count: consolidation?.open_count }),
      queue_at_capacity: queueCount >= 5,
      invalid_queue_branches: count({ count: queue?.invalid_branch_count }),
      missing_queue_domains: count({ count: queue?.missing_domain_count }),
      missing_direct_lesson_material: count({ count: missingMaterial?.missing_count }),
      context_unavailable: false,
    },
    counts: {
      due_recall: count(due),
      recall_drafts: count(drafts),
      inbox: count(inbox),
      queue: queueCount,
      queue_limit: 5,
    },
  }
}
