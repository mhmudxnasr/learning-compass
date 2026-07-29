import { Hono } from 'hono'
import { Bindings, safeError } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/briefing', async (c) => {
  const { DB } = c.env
  try {
    const [next, due, queue, neglected, gaps, today, recent, latestSignal, sessions, streak] = await Promise.all([
      DB.prepare(`SELECT r.id,r.video_title,r.creator,r.content_type,r.video_url,r.why_this,r.created_at,m.learning_state,m.priority_rank FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress') ORDER BY CASE WHEN m.learning_state='in_progress' THEN 0 ELSE 1 END,COALESCE(m.priority_rank,999),r.created_at DESC LIMIT 1`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id WHERE r.status='active' AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM tree_nodes n WHERE n.type IN ('branch','leaf') AND NOT EXISTS (SELECT 1 FROM recommendations r WHERE r.status='consumed' AND r.dedup_key LIKE n.id||'%')`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM tree_nodes n WHERE n.type='branch' AND NOT EXISTS (SELECT 1 FROM recommendations r WHERE r.status='consumed' AND r.dedup_key LIKE n.id||'%')`).first<any>(),
      DB.prepare(`SELECT count FROM learning_log WHERE date=date('now')`).first<any>(),
      DB.prepare(`SELECT id,video_title,content_type,creator,consumed_date AS created_at FROM recommendations WHERE status='consumed' ORDER BY consumed_date DESC LIMIT 8`).all<any>(),
      DB.prepare(`SELECT summary FROM update_log ORDER BY ts DESC LIMIT 1`).first<any>(),
      DB.prepare(`SELECT COUNT(*) count FROM learning_sessions WHERE status IN ('active','returned')`).first<any>(),
      DB.prepare(`WITH RECURSIVE dates(d) AS (SELECT date('now') UNION ALL SELECT date(d,'-1 day') FROM dates WHERE d>date('now','-365 days'))
        SELECT COUNT(*) count FROM dates d WHERE EXISTS (SELECT 1 FROM learning_log WHERE learning_log.date=d.d)
          AND d.d>=COALESCE((SELECT date(MAX(date),'+1 day') FROM learning_log l1 WHERE NOT EXISTS (SELECT 1 FROM learning_log l2 WHERE date(l2.date,'+1 day')=l1.date)),'1970-01-01')`).first<any>(),
    ])
    const nextAction = Number(due?.count || 0) > 0 ? 'review' : sessions?.count ? 'resume' : next ? 'continue' : 'capture'
    return c.json({ next_action: nextAction, next_item: next || null, due_reviews: due?.count || 0, queue_count: queue?.count || 0, neglected_count: neglected?.count || 0, gap_count: gaps?.count || 0, today_count: today?.count || 0, streak: streak?.count || 0, recent_signal: latestSignal?.summary || null, recent: recent.results || [] })
  } catch (error) { return c.json(safeError('Briefing failed')(error), 500) }
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
