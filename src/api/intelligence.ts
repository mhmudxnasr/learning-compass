import { Hono } from 'hono'
import { computeDecayedAffinity } from '../domain'
import { Bindings } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()
const all = async (statement: D1PreparedStatement) => (await statement.all<any>()).results || []
const allOr = async (statement: D1PreparedStatement) => { try { return await all(statement) } catch { return [] } }

app.get('/knowledge/graph', async (c) => {
  const [nodes, explicit, hierarchy] = await Promise.all([
    all(c.env.DB.prepare(`SELECT id,type,label,super_category,parent_id,status,round_label,meta_json FROM tree_nodes ORDER BY type,label LIMIT 1500`)),
    allOr(c.env.DB.prepare(`SELECT id,source_id,target_id,relation_type,evidence_json,confidence FROM knowledge_edges ORDER BY confidence DESC LIMIT 1000`)),
    all(c.env.DB.prepare(`SELECT 'parent-'||id id,parent_id source_id,id target_id,'hierarchy' relation_type,'[]' evidence_json,1 confidence FROM tree_nodes WHERE parent_id IS NOT NULL`)),
  ])
  return c.json({ nodes, edges: [...hierarchy, ...explicit] })
})

app.get('/knowledge/blind-spots', async (c) => {
  const gaps = await all(c.env.DB.prepare(`SELECT n.id,n.label,n.super_category,n.status,COUNT(r.id) consumed_count
    FROM tree_nodes n
    LEFT JOIN recommendation_meta m ON m.branch_id=n.id
    LEFT JOIN recommendations r ON r.id=m.recommendation_id AND r.status='consumed'
    WHERE n.type IN ('branch','leaf') GROUP BY n.id HAVING consumed_count=0 ORDER BY n.super_category,n.label`))
  return c.json({ blind_spots: gaps, count: gaps.length })
})

app.get('/learning/health', async (c) => {
  const branches = await all(c.env.DB.prepare(`SELECT COALESCE(m.branch_id, substr(r.dedup_key,1,instr(r.dedup_key||'-','-')-1),'unmapped') branch,COUNT(*) total,SUM(CASE WHEN r.status='consumed' THEN 1 ELSE 0 END) consumed,MAX(r.consumed_date) last_activity FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id GROUP BY branch ORDER BY total DESC`))
  const health = branches.map((row: any) => ({ ...row, health: !row.last_activity ? 'neglected' : row.consumed >= 3 ? 'healthy' : 'growing' }))
  return c.json({ health, healthy: health.filter((row: any) => row.health === 'healthy').length, neglected: health.filter((row: any) => row.health === 'neglected').length })
})

app.get('/taste/dna', async (c) => {
  const [vectors, ratings, categories] = await Promise.all([
    all(c.env.DB.prepare(`SELECT topic,affinity_score,consumption_count,last_consumed_at FROM taste_vectors ORDER BY affinity_score DESC`)),
    all(c.env.DB.prepare(`SELECT user_rating,COUNT(*) count FROM recommendations WHERE status='consumed' GROUP BY user_rating`)),
    all(c.env.DB.prepare(`SELECT content_type,COUNT(*) count FROM recommendations GROUP BY content_type`)),
  ])
  const activeVectors = vectors.filter((item: any) => Number(item.affinity_score) !== 0)
  return c.json({ vectors: vectors.map((item: any) => ({ ...item, ...computeDecayedAffinity(Number(item.affinity_score || 0), item.last_consumed_at) })), ratings, categories, interest: activeVectors.length, diversity: categories.length, momentum: activeVectors.filter((item: any) => item.last_consumed_at).length })
})

app.get('/analytics/creator-trust', async (c) => {
  const creators = await all(c.env.DB.prepare(`SELECT creator,COUNT(*) total,ROUND(AVG(COALESCE(user_score,CASE user_rating WHEN 'love' THEN 10 WHEN 'like' THEN 8 WHEN 'meh' THEN 5 WHEN 'dislike' THEN 2 END)),2) average_score,SUM(CASE WHEN user_rating='love' THEN 1 ELSE 0 END) loves FROM recommendations WHERE creator IS NOT NULL AND creator!='' AND status='consumed' GROUP BY creator ORDER BY average_score DESC,total DESC`))
  return c.json({ creators: creators.map((row: any) => ({ ...row, trust_index: Math.round((Number(row.average_score || 0) * .7 + Math.min(Number(row.total), 10) * .3) * 10) / 10 })) })
})

app.get('/analytics/taste-drift', async (c) => {
  const events = await all(c.env.DB.prepare(`SELECT substr(created_at,1,7) month,COALESCE(branch_id,'unmapped') branch,ROUND(AVG(score),2) average_score,COUNT(*) count FROM rating_events GROUP BY month,branch ORDER BY month`))
  return c.json({ events })
})
app.get('/analytics/heatmaps', async (c) => {
  const days = await all(c.env.DB.prepare(`SELECT date,count,topics FROM learning_log ORDER BY date DESC LIMIT 366`))
  return c.json({ days, active_days: days.filter((day: any) => day.count > 0).length })
})
app.get('/analytics/forecast', async (c) => {
  const [due7, due30, cards, gaps] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now','+7 days')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards WHERE due_at<=date('now','+30 days')`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM srs_cards`).first<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM tree_nodes WHERE type IN ('branch','leaf')`).first<any>(),
  ])
  return c.json({ due_next_7_days: due7?.count || 0, due_next_30_days: due30?.count || 0, total_cards: cards?.count || 0, mapped_topics: gaps?.count || 0 })
})

export default app
