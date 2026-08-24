import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'
import { loadHermesBrief } from '../services/agent-briefing'
import { selectHomeLessonTurns } from '../services/home-threads'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/briefing', async (c) => {
  const { DB } = c.env
  try {
    const weekStart = `date('now', printf('-%d days', (CAST(strftime('%w','now') AS INTEGER)+6)%7))`
    const [active, due, inbox, pending, drafts, momentum, bestWeek, recent, latestSignal, topFormat, activityDates, streakDays] = await Promise.all([
      DB.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.video_url,r.why_this,r.context_brief,r.notebook_url,r.created_at,
         m.learning_state,m.priority_rank,m.progress_percent,m.estimated_minutes,m.started_at,m.last_opened_at,
         m.branch_id,COALESCE(n.label,r.branch) branch_label,COALESCE(n.round_label,r.round) round_label,COALESCE(n.status,'love') branch_status,
         (SELECT ts.thread_id FROM thread_sources ts JOIN learning_threads lt ON lt.id=ts.thread_id WHERE ts.recommendation_id=r.id AND ts.status='active' AND lt.status='active' LIMIT 1) thread_id,
         (SELECT COUNT(*) FROM notes n WHERE n.recommendation_id=r.id) note_count
         FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
         LEFT JOIN tree_nodes n ON n.id=m.branch_id
         WHERE r.status='active' AND COALESCE(r.content_type, '') != 'book' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
        ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 50`).all<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(r.content_type, '') != 'book' AND m.learning_state='captured'`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending'`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM srs_drafts WHERE status='draft'`).first<any>(),
      DB.prepare(`SELECT
        SUM(CASE WHEN event_type='completion' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN event_type IN ('note_created','note_edited') THEN 1 ELSE 0 END) notes,
        SUM(CASE WHEN event_type='recall_reviewed' THEN 1 ELSE 0 END) reviews
        FROM learning_activity_ledger WHERE activity_date>=${weekStart}`).first<any>(),
      DB.prepare(`SELECT COALESCE(MAX(completed),0) count FROM (
        SELECT COUNT(*) completed FROM learning_activity_ledger WHERE event_type='completion'
        GROUP BY strftime('%Y-%W',activity_date)
      )`).first<any>(),
      DB.prepare(`SELECT id,video_title,content_type,creator,user_score,consumed_date AS created_at FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 6`).all<any>(),
      DB.prepare(`SELECT summary FROM update_log ORDER BY ts DESC LIMIT 1`).first<any>(),
      DB.prepare(`SELECT content_type,COUNT(*) count,ROUND(AVG(user_score),1) average FROM recommendations WHERE status='consumed' AND user_score IS NOT NULL GROUP BY content_type HAVING COUNT(*)>=2 ORDER BY average DESC,count DESC LIMIT 1`).first<any>(),
      DB.prepare(`SELECT date FROM (SELECT date(occurred_at,'+3 hours') date FROM learning_events WHERE evidence_weight>0 UNION SELECT activity_date date FROM learning_activity_ledger WHERE event_type IN ('feedback_recorded','recall_reviewed')) ORDER BY date DESC`).all<any>(),
      DB.prepare(`SELECT date,COUNT(*) count FROM (SELECT id,date(occurred_at,'+3 hours') date FROM learning_events WHERE evidence_weight>0 UNION ALL SELECT event_key id,activity_date date FROM learning_activity_ledger WHERE event_type IN ('feedback_recorded','recall_reviewed')) WHERE date>=date('now','+3 hours','-29 days') GROUP BY date ORDER BY date`).all<any>(),
    ])

    const activeItems = active.results || []
    const activeThreadsResult = await DB.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM learning_path_stages s WHERE s.thread_id=t.id) stage_count,
      (SELECT COUNT(*) FROM thread_lessons l WHERE l.thread_id=t.id) lesson_count,
      (SELECT COUNT(*) FROM thread_lessons l WHERE l.thread_id=t.id AND l.status='completed') completed_lesson_count
      FROM learning_threads t WHERE t.status IN ('active','paused','draft') AND t.superseded_at IS NULL
      ORDER BY CASE t.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,t.priority DESC,t.updated_at DESC`).all<any>()
    const activeThreads = activeThreadsResult.results || []
    const threadIds = activeThreads.map((thread: any) => thread.id)
    let homeThreads: any[] = []
    if (threadIds.length) {
      const threadMatches = threadIds.map(() => '?').join(',')
      const stages = await DB.prepare(`SELECT * FROM learning_path_stages WHERE thread_id IN (${threadMatches}) ORDER BY thread_id,position`).bind(...threadIds).all<any>()
      const currentStages = activeThreads.map((thread: any) => {
        const threadStages = (stages.results || []).filter((stage: any) => stage.thread_id === thread.id)
        return threadStages.find((stage: any) => ['available','in_progress'].includes(stage.status))
          || threadStages.find((stage: any) => stage.status === 'locked')
          || threadStages[threadStages.length - 1]
          || null
      })
      const stageIds = currentStages.filter(Boolean).map((stage: any) => stage.id)
      const lessons = stageIds.length
        ? await DB.prepare(`SELECT * FROM thread_lessons WHERE stage_id IN (${stageIds.map(() => '?').join(',')}) ORDER BY stage_id,position`).bind(...stageIds).all<any>()
        : { results: [] as any[] }
      const visibleLessonIds: string[] = []
      homeThreads = activeThreads.map((thread: any, index: number) => {
        const stage = currentStages[index]
        if (!stage) return { ...thread, current_stage: null }
        const stageLessons = (lessons.results || []).filter((lesson: any) => lesson.stage_id === stage.id)
        const visibleLessons = selectHomeLessonTurns(stageLessons)
        visibleLessonIds.push(...visibleLessons.map((lesson: any) => lesson.id))
        return { ...thread, current_stage: { ...stage, lessons: visibleLessons } }
      })
      if (visibleLessonIds.length) {
        const lessonSources = await DB.prepare(`SELECT ls.*,r.creator,r.content_type FROM thread_lesson_sources ls JOIN recommendations r ON r.id=ls.recommendation_id WHERE ls.lesson_id IN (${visibleLessonIds.map(() => '?').join(',')}) ORDER BY ls.lesson_id,ls.position`).bind(...visibleLessonIds).all<any>()
        homeThreads = homeThreads.map((thread: any) => ({
          ...thread,
          current_stage: thread.current_stage ? {
            ...thread.current_stage,
            lessons: thread.current_stage.lessons.map((lesson: any) => ({ ...lesson, sources: (lessonSources.results || []).filter((source: any) => source.lesson_id === lesson.id) })),
          } : null,
        }))
      }
    }
    const openConsolidations = await DB.prepare(`SELECT cr.id,cr.recommendation_id,cr.state,cr.failure_reason,r.video_title FROM consolidation_runs cr JOIN recommendations r ON r.id=cr.recommendation_id WHERE cr.state NOT IN ('closed','waived') ORDER BY cr.requested_at LIMIT 10`).all<any>()
    const verifiedOutcomes = await DB.prepare(`SELECT COUNT(*) count FROM learning_threads WHERE status='verified' AND verified_at>=datetime('now','-30 days')`).first<any>()
    const hermesBrief = await loadHermesBrief(DB)
    let artifacts: any[] = []
    if (activeItems.length) {
      const placeholders = activeItems.map(() => '?').join(',')
      const rows = await DB.prepare(`SELECT id,filename,media_type,created_at,
        json_extract(metadata_json,'$.recommendation_id') recommendation_id,
        json_extract(metadata_json,'$.role') role,
        json_extract(metadata_json,'$.recommended_start') recommended_start,
        json_extract(metadata_json,'$.notebook_url') notebook_url,
        metadata_json
        FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id') IN (${placeholders})
        ORDER BY created_at DESC`).bind(...activeItems.map((item: any) => item.id)).all<any>()
      artifacts = rows.results || []
    }

    const today = (await DB.prepare(`SELECT date('now','+3 hours') AS date, ROUND((julianday(date('now','+3 hours','+1 day')) - julianday(datetime('now','+3 hours'))) * 86400) AS seconds_remaining`).first<any>()) || {}
    const todayDate = String(today.date)
    const activeDates = new Set((activityDates.results || []).map((row: any) => String(row.date)))
    const yesterday = String((await DB.prepare(`SELECT date('now','+3 hours','-1 day') AS date`).first<any>())?.date || '')
    const streakEnd = activeDates.has(todayDate) ? todayDate : yesterday
    let currentStreak = 0
    if (activeDates.has(streakEnd)) {
      const cursor = new Date(`${streakEnd}T12:00:00Z`)
      while (activeDates.has(cursor.toISOString().slice(0, 10))) {
        currentStreak += 1
        cursor.setUTCDate(cursor.getUTCDate() - 1)
      }
    }
    let longestStreak = 0
    const orderedDates = [...activeDates].sort()
    let run = 0
    for (let index = 0; index < orderedDates.length; index += 1) {
      const previous = index ? new Date(`${orderedDates[index - 1]}T12:00:00Z`) : null
      const current = new Date(`${orderedDates[index]}T12:00:00Z`)
      if (previous && (current.getTime() - previous.getTime()) === 86400000) run += 1
      else run = 1
      longestStreak = Math.max(longestStreak, run)
    }
    const completed = Number(momentum?.completed || 0)
    const personalBest = Math.max(Number(bestWeek?.count || 0), completed)
    const insight = topFormat
      ? {
          title: `${String(topFormat.content_type || 'Source').replace(/_/g, ' ')} is your strongest format`,
          body: `${topFormat.average}/10 average across ${topFormat.count} completed sources.`,
          evidence: `${topFormat.count} rated completions`,
          target: 'insights.taste',
        }
      : latestSignal?.summary
        ? { title: 'Your map just moved', body: latestSignal.summary, evidence: 'Latest approved signal', target: 'map.atlas' }
        : { title: 'Your pattern is still forming', body: 'Complete and rate two sources to reveal your strongest learning format.', evidence: 'Needs two rated completions', target: 'curate.queue' }

    const nextAction = hermesBrief.next_action

    return c.json({
      active_items: activeItems,
      artifacts,
      due_reviews: due?.count || 0,
      inbox_count: inbox?.count || 0,
      pending_proposals: pending?.count || 0,
      momentum: {
        completed, notes: Number(momentum?.notes || 0), reviews: Number(momentum?.reviews || 0),
        streak: currentStreak, streak_days: streakDays.results || [], personal_best: personalBest,
        longest_streak: longestStreak, today_secured: activeDates.has(todayDate), last_activity_date: [...activeDates][0] || null,
        current_date: todayDate, seconds_remaining: Number(today.seconds_remaining || 0), timezone: 'Africa/Cairo',
      },
      insight,
      recent_wins: recent.results || [],
      // Compatibility fields for existing API consumers.
      next_action: nextAction.kind,
      next_action_detail: nextAction,
      hermes_brief: hermesBrief,
      next_item: activeItems[0] || null,
      queue_count: activeItems.length,
      recent: recent.results || [],
      recent_signal: latestSignal?.summary || null,
      active_threads: homeThreads,
      active_thread: homeThreads[0] || null,
      open_cognitive_loops: openConsolidations.results || [],
      verified_learning_outcomes_30d: Number(verifiedOutcomes?.count || 0),
    })
  } catch (error) { return c.json(safeError('Momentum failed')(error), 500) }
})

app.get('/layout', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT module_key,position,pinned,visible FROM dashboard_layout ORDER BY position`).all()
  return c.json({ modules: rows.results || [] })
})
app.put('/layout', async (c) => {
  const body = await c.req.json<{ modules: Array<{ key: string; position: number; pinned?: boolean; visible?: boolean }> }>()
  await c.env.DB.batch((body.modules || []).map((item) => c.env.DB.prepare(`INSERT INTO dashboard_layout (module_key,position,pinned,visible) VALUES (?,?,?,?) ON CONFLICT(module_key) DO UPDATE SET position=excluded.position,pinned=excluded.pinned,visible=excluded.visible,updated_at=datetime('now')`).bind(item.key, item.position, item.pinned ? 1 : 0, item.visible === false ? 0 : 1)))
  return c.json({ ok: true })
})

export default app
