import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/briefing', async (c) => {
  const { DB } = c.env
  try {
    const weekStart = `date('now', printf('-%d days', (CAST(strftime('%w','now') AS INTEGER)+6)%7))`
    const [active, due, inbox, pending, momentum, bestWeek, recent, latestSignal, topFormat, streak, streakDays] = await Promise.all([
      DB.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.video_url,r.why_this,r.notebook_url,r.created_at,
        m.learning_state,m.priority_rank,m.progress_percent,m.estimated_minutes,m.started_at,m.last_opened_at,
        (SELECT COUNT(*) FROM notes n WHERE n.recommendation_id=r.id) note_count
        FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
        WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
        ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 5`).all<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND m.learning_state='inbox'`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM feedback_proposals WHERE status='pending'`).first<any>(),
      DB.prepare(`SELECT
        (SELECT COUNT(*) FROM recommendations WHERE status='consumed' AND date(consumed_date)>=${weekStart}) completed,
        (SELECT COUNT(*) FROM notes WHERE date(created_at)>=${weekStart}) notes,
        (SELECT COUNT(*) FROM srs_review_events WHERE date(reviewed_at)>=${weekStart}) reviews`).first<any>(),
      DB.prepare(`SELECT COALESCE(MAX(completed),0) count FROM (SELECT COUNT(*) completed FROM recommendations WHERE status='consumed' AND consumed_date IS NOT NULL GROUP BY strftime('%Y-%W',consumed_date))`).first<any>(),
      DB.prepare(`SELECT id,video_title,content_type,creator,user_score,consumed_date AS created_at FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 6`).all<any>(),
      DB.prepare(`SELECT summary FROM update_log ORDER BY ts DESC LIMIT 1`).first<any>(),
      DB.prepare(`SELECT content_type,COUNT(*) count,ROUND(AVG(user_score),1) average FROM recommendations WHERE status='consumed' AND user_score IS NOT NULL GROUP BY content_type HAVING COUNT(*)>=2 ORDER BY average DESC,count DESC LIMIT 1`).first<any>(),
      DB.prepare(`WITH RECURSIVE dates(d) AS (SELECT date('now') UNION ALL SELECT date(d,'-1 day') FROM dates WHERE d>date('now','-365 days'))
        SELECT COUNT(*) count FROM dates d WHERE EXISTS (SELECT 1 FROM learning_log WHERE learning_log.date=d.d)
          AND d.d>=COALESCE((SELECT date(MAX(date),'+1 day') FROM learning_log l1 WHERE NOT EXISTS (SELECT 1 FROM learning_log l2 WHERE date(l2.date,'+1 day')=l1.date)),'1970-01-01')`).first<any>(),
      DB.prepare(`SELECT date,count FROM learning_log WHERE date>=date('now','-6 days') ORDER BY date`).all<any>(),
    ])

    const activeItems = active.results || []
    let artifacts: any[] = []
    if (activeItems.length) {
      const placeholders = activeItems.map(() => '?').join(',')
      const rows = await DB.prepare(`SELECT id,filename,media_type,created_at,
        json_extract(metadata_json,'$.recommendation_id') recommendation_id,
        json_extract(metadata_json,'$.role') role
        FROM artifacts WHERE json_extract(metadata_json,'$.recommendation_id') IN (${placeholders})
        ORDER BY created_at DESC`).bind(...activeItems.map((item: any) => item.id)).all<any>()
      artifacts = rows.results || []
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

    return c.json({
      active_items: activeItems,
      artifacts,
      due_reviews: due?.count || 0,
      inbox_count: inbox?.count || 0,
      pending_proposals: pending?.count || 0,
      momentum: { completed, notes: Number(momentum?.notes || 0), reviews: Number(momentum?.reviews || 0), streak: Number(streak?.count || 0), streak_days: streakDays.results || [], personal_best: personalBest },
      insight,
      recent_wins: recent.results || [],
      // Compatibility fields for existing API consumers.
      next_action: Number(due?.count || 0) > 0 ? 'review' : activeItems.length ? 'continue' : 'capture',
      next_item: activeItems[0] || null,
      queue_count: activeItems.length,
      recent: recent.results || [],
      recent_signal: latestSignal?.summary || null,
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
