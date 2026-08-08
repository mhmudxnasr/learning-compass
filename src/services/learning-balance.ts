import { Bindings } from '../lib'

type Db = Bindings['DB']

type BalanceNode = {
  id: string
  label: string
  type: string
  parent_id: string | null
  round: string
  super_category: string | null
  priority_rank: number | null
  priority_share: number | null
  consumed_count: number
  attention_share: number
  last_consumed_at: string | null
  notes_count: number
  srs_total: number
  srs_due: number
  recall_strength: number | null
  state: string
  reasons: string[]
}

const safeAll = async (statement: D1PreparedStatement) => {
  try { return (await statement.all<any>()).results || [] } catch { return [] }
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

function roundFor(node: any, depth: number) {
  const explicit = String(node.round_label || '').toUpperCase().match(/^R\d+$/)?.[0]
  return explicit || `R${Math.min(Math.max(depth, 1), 9)}`
}

export async function buildLearningBalance(DB: Db, windowDays = 90) {
  const days = [30, 90, 365].includes(windowDays) ? windowDays : 90
  const since = dateOnly(new Date(Date.now() - days * 86400000))

  const [rawNodes, priorities, recommendations, notes, cards, reviews] = await Promise.all([
    safeAll(DB.prepare("SELECT id,type,label,parent_id,round_label,super_category FROM tree_nodes WHERE type IN ('root','category','branch','leaf') ORDER BY label")),
    safeAll(DB.prepare('SELECT rank,branch_id FROM priorities ORDER BY rank ASC')),
    safeAll(DB.prepare(`SELECT r.id,r.status,r.user_rating,r.user_score,r.consumed_date,r.dedup_key,m.branch_id
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id`)),
    safeAll(DB.prepare('SELECT id,branch_id,updated_at,created_at FROM notes')),
    safeAll(DB.prepare('SELECT id,recommendation_id,topic,due_at FROM srs_cards')),
    safeAll(DB.prepare('SELECT card_id,grade,reviewed_at FROM srs_review_events')),
  ])

  const byId = new Map<string, any>(rawNodes.map((node: any) => [String(node.id), node]))
  const depthCache = new Map<string, number>()
  const pathCache = new Map<string, string[]>()
  const depthOf = (id: string): number => {
    if (depthCache.has(id)) return depthCache.get(id)!
    let depth = 1
    let current = byId.get(id)
    const seen = new Set<string>()
    while (current?.parent_id && !seen.has(String(current.parent_id))) {
      seen.add(String(current.parent_id))
      depth += 1
      current = byId.get(String(current.parent_id))
    }
    depthCache.set(id, depth)
    return depth
  }
  const pathOf = (id: string) => {
    if (pathCache.has(id)) return pathCache.get(id)!
    const path: string[] = []
    let current = byId.get(id)
    const seen = new Set<string>()
    while (current && !seen.has(String(current.id))) {
      seen.add(String(current.id))
      path.push(String(current.id))
      current = current.parent_id ? byId.get(String(current.parent_id)) : null
    }
    pathCache.set(id, path)
    return path
  }
  const resolveNode = (explicit: any, dedupKey: any) => {
    const direct = String(explicit || '')
    if (direct && byId.has(direct)) return direct
    const key = String(dedupKey || '')
    if (key) {
      const match = [...byId.keys()].filter((id) => key === id || key.startsWith(`${id}-`)).sort((a, b) => b.length - a.length)[0]
      if (match) return match
    }
    return null
  }

  const priorityRows = priorities.filter((row: any) => byId.has(String(row.branch_id)))
  const priorityWeights = new Map<string, number>()
  priorityRows.forEach((row: any, index: number) => priorityWeights.set(String(row.branch_id), priorityRows.length - index))
  const priorityWeightTotal = [...priorityWeights.values()].reduce((sum, value) => sum + value, 0)

  const stats = new Map<string, { consumed: number; last: string | null; notes: number; srs: number; due: number; grades: number[] }>()
  const getStats = (id: string) => {
    if (!stats.has(id)) stats.set(id, { consumed: 0, last: null, notes: 0, srs: 0, due: 0, grades: [] })
    return stats.get(id)!
  }
  const addToPath = (id: string, fn: (value: ReturnType<typeof getStats>) => void) => pathOf(id).forEach((ancestor) => fn(getStats(ancestor)))

  let totalConsumed = 0
  let mappedConsumed = 0
  for (const recommendation of recommendations) {
    if (recommendation.status !== 'consumed' || !recommendation.consumed_date || String(recommendation.consumed_date) < since) continue
    // The attention denominator is every completed source, including sources
    // awaiting mapping. Otherwise mapped branches falsely add up to 100%.
    totalConsumed += 1
    const node = resolveNode(recommendation.branch_id, recommendation.dedup_key)
    if (!node) continue
    mappedConsumed += 1
    addToPath(node, (value) => {
      value.consumed += 1
      if (!value.last || String(recommendation.consumed_date) > value.last) value.last = recommendation.consumed_date
    })
  }
  for (const note of notes) {
    const node = resolveNode(note.branch_id, '')
    if (node) addToPath(node, (value) => { value.notes += 1 })
  }
  const recNodeById = new Map<string, string>()
  for (const recommendation of recommendations) {
    const node = resolveNode(recommendation.branch_id, recommendation.dedup_key)
    if (node) recNodeById.set(String(recommendation.id), node)
  }
  const gradesByCard = new Map<string, number[]>()
  for (const review of reviews) {
    const list = gradesByCard.get(String(review.card_id)) || []
    list.push(Number(review.grade))
    gradesByCard.set(String(review.card_id), list)
  }
  for (const card of cards) {
    const node = recNodeById.get(String(card.recommendation_id)) || resolveNode(null, card.topic)
    if (!node) continue
    addToPath(node, (value) => {
      value.srs += 1
      if (card.due_at && String(card.due_at) <= dateOnly(new Date())) value.due += 1
      for (const grade of gradesByCard.get(String(card.id)) || []) value.grades.push(grade)
    })
  }

  const nodes: BalanceNode[] = rawNodes
    .filter((node: any) => node.type !== 'root')
    .map((node: any) => {
      const id = String(node.id)
      const branchStats = stats.get(id) || { consumed: 0, last: null, notes: 0, srs: 0, due: 0, grades: [] }
      const attentionShare = totalConsumed ? branchStats.consumed / totalConsumed : 0
      const priorityRank = priorityRows.find((row: any) => String(row.branch_id) === id)?.rank ?? null
      const priorityShare = priorityWeights.has(id) && priorityWeightTotal ? priorityWeights.get(id)! / priorityWeightTotal : null
      const recallStrength = branchStats.grades.length ? branchStats.grades.reduce((sum, grade) => sum + grade, 0) / branchStats.grades.length / 5 : null
      const ageDays = branchStats.last ? Math.max(0, Math.floor((Date.now() - new Date(branchStats.last).getTime()) / 86400000)) : null
      const reasons: string[] = []
      if (!branchStats.consumed) reasons.push('No completed source in this window')
      if (branchStats.due) reasons.push(`${branchStats.due} recall ${branchStats.due === 1 ? 'card is' : 'cards are'} due`)
      if (recallStrength != null && recallStrength < 0.55) reasons.push('Recent recall is weak')
      if (ageDays != null && ageDays >= 45) reasons.push(`Last touched ${ageDays} days ago`)
      if (branchStats.consumed && !branchStats.notes && !branchStats.grades.length) reasons.push('Consumed, but not consolidated yet')
      const overFocused = totalConsumed >= 8 && branchStats.consumed >= 2 && priorityShare != null && attentionShare >= Math.max(0.20, priorityShare * 1.75)
      const state = overFocused ? 'over-focused' : !branchStats.consumed ? 'uncovered' : branchStats.due || (ageDays != null && ageDays >= 45) || (recallStrength != null && recallStrength < 0.55) ? 'at-risk' : !branchStats.notes && !branchStats.grades.length ? 'exposed' : ageDays != null && ageDays >= 30 ? 'cooling' : 'balanced'
      return {
        id, label: node.label || id, type: node.type, parent_id: node.parent_id || null,
        round: roundFor(node, depthOf(id)), super_category: node.super_category || null,
        priority_rank: priorityRank, priority_share: priorityShare,
        consumed_count: branchStats.consumed, attention_share: Math.round(attentionShare * 1000) / 10,
        last_consumed_at: branchStats.last, notes_count: branchStats.notes, srs_total: branchStats.srs, srs_due: branchStats.due,
        recall_strength: recallStrength == null ? null : Math.round(recallStrength * 100) / 100,
        state, reasons,
      }
    })

  return {
    generated_at: new Date().toISOString(),
    window_days: days,
    portfolio: {
      total_consumed: totalConsumed,
      mapped_consumed: mappedConsumed,
      mapped_attention_share: totalConsumed ? Math.round((mappedConsumed / totalConsumed) * 1000) / 10 : 0,
      unmapped_attention_share: totalConsumed ? Math.round(((totalConsumed - mappedConsumed) / totalConsumed) * 1000) / 10 : 0,
      over_focused: nodes.filter((node) => node.state === 'over-focused').map((node) => node.id),
      at_risk: nodes.filter((node) => node.state === 'at-risk').map((node) => node.id),
      uncovered: nodes.filter((node) => node.state === 'uncovered').map((node) => node.id),
      unmapped_count: totalConsumed - mappedConsumed,
    },
    branches: nodes,
  }
}
