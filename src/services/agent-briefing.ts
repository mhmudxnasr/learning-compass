import type { Bindings } from '../lib'

export type HermesNextAction = {
  id: string
  kind: 'review' | 'record_evidence' | 'continue' | 'approve_recall' | 'curate' | 'repair'
  label: string
  reason: string
  target: string
  href: string
  priority: 'high' | 'medium' | 'low'
  thread_id?: string
  requirement_id?: string
  stage_id?: string
  recommendation_id?: string
  source_id?: string
}

type Database = Bindings['DB']

const count = (row: any) => Number(row?.count || 0)

/**
 * One small, deterministic action projection shared by the Worker dashboard
 * and Hermes context. It never creates recommendations or changes learning
 * state; it only explains the next useful existing action.
 */
export async function loadHermesBrief(DB: Database) {
  const [queue, due, drafts, inbox, proposals, consolidation, jobs] = await Promise.all([
    DB.prepare(`SELECT r.id,r.video_title,m.learning_state,m.branch_id
      FROM recommendations r
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
      ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 1`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM srs_drafts WHERE status='draft'`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND m.learning_state='captured'`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending'`).first<any>(),
    DB.prepare(`SELECT cr.id,cr.recommendation_id,cr.failure_reason,r.video_title
      FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id
      WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at LIMIT 1`).first<any>(),
    DB.prepare(`SELECT COUNT(*) count FROM agent_jobs WHERE status IN ('pending','running','retry')`).first<any>(),
  ])

  let next_action: HermesNextAction
  if (count(due) > 0) {
    next_action = {
      id: 'due-recall', kind: 'review', label: 'Review due recall',
      reason: `${count(due)} recall ${count(due) === 1 ? 'card is' : 'cards are'} due today.`,
      target: 'learn.recall', href: '#/learn?mode=practice&focus=recall', priority: 'high',
    }
  } else if (consolidation) {
    next_action = {
      id: `consolidation:${consolidation.id}`, kind: 'repair', label: 'Resolve an open consolidation loop',
      reason: `${consolidation.video_title || 'A completed source'} still has unfinished consolidation work.`,
      target: `library.source.${consolidation.recommendation_id}`, href: `#/library?mode=catalog&focus=all&object=source:${encodeURIComponent(consolidation.recommendation_id)}`,
      priority: 'high', source_id: consolidation.recommendation_id, recommendation_id: consolidation.recommendation_id,
    }
  } else if (queue) {
    next_action = {
      id: `queue:${queue.id}`, kind: 'continue', label: queue.learning_state === 'in_progress' ? 'Continue the current source' : 'Start the next source',
      reason: `${queue.video_title || 'Your next source'} is ${queue.learning_state === 'in_progress' ? 'in progress' : 'ready to start'}.`,
      target: 'library.queue', href: '#/library?mode=triage&focus=queue', priority: 'medium', recommendation_id: queue.id,
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
      target: 'library.all', href: '#/library?mode=catalog&focus=all', priority: 'low',
    }
  } else {
    next_action = {
      id: 'capture', kind: 'curate', label: 'Capture the next useful source',
      reason: 'The active Queue and captured sources are clear.', target: 'library.all', href: '#/library?mode=catalog&focus=all', priority: 'low',
    }
  }

  return {
    as_of: new Date().toISOString(),
    next_action,
    blockers: {
      pending_proposals: count(proposals),
      active_jobs: count(jobs),
      open_consolidation: Boolean(consolidation),
    },
    counts: {
      due_recall: count(due),
      recall_drafts: count(drafts),
      inbox: count(inbox),
      queue: queue ? 1 : 0,
    },
  }
}
