export type NormalizedUnitRelation = {
  id: string
  relation_type: string
  confidence: number
  why: string
  status: string
  review_state: string
  resolution?: string | null
  reviewed_at?: string | null
  created_at: string
  direction: 'incoming' | 'outgoing'
  counterpart: any
  source: any
  target: any
}

const relationSelect = `SELECT r.*,
  su.statement source_statement,su.unit_type source_unit_type,su.note_id source_note_id,su.recommendation_id source_recommendation_id,su.status source_unit_status,
  tu.statement target_statement,tu.unit_type target_unit_type,tu.note_id target_note_id,tu.recommendation_id target_recommendation_id,tu.status target_unit_status,
  sa.locator source_anchor_locator,sa.excerpt source_anchor_excerpt,
  ta.locator target_anchor_locator,ta.excerpt target_anchor_excerpt,
  COALESCE(snb.id,srb.id) source_branch_id,COALESCE(snb.label,srb.label) source_branch_label,sd.id source_domain_id,sd.label source_domain,
  COALESCE(tnb.id,trb.id) target_branch_id,COALESCE(tnb.label,trb.label) target_branch_label,td.id target_domain_id,td.label target_domain
FROM unit_relations r
JOIN learning_units su ON su.id=r.source_unit_id
JOIN learning_units tu ON tu.id=r.target_unit_id
LEFT JOIN unit_anchors sa ON sa.id=COALESCE(r.source_anchor_id,r.evidence_anchor_id)
LEFT JOIN unit_anchors ta ON ta.id=r.target_anchor_id
LEFT JOIN notes sn ON sn.id=su.note_id
LEFT JOIN notes tn ON tn.id=tu.note_id
LEFT JOIN recommendation_meta sm ON sm.recommendation_id=su.recommendation_id
LEFT JOIN recommendation_meta tm ON tm.recommendation_id=tu.recommendation_id
LEFT JOIN tree_nodes snb ON snb.id=sn.branch_id AND snb.status!='pruned'
LEFT JOIN tree_nodes tnb ON tnb.id=tn.branch_id AND tnb.status!='pruned'
LEFT JOIN tree_nodes srb ON srb.id=sm.branch_id AND srb.status!='pruned'
LEFT JOIN tree_nodes trb ON trb.id=tm.branch_id AND trb.status!='pruned'
LEFT JOIN tree_nodes sd ON sd.id=COALESCE(snb.super_category,srb.super_category) AND sd.type='category' AND sd.status!='pruned'
LEFT JOIN tree_nodes td ON td.id=COALESCE(tnb.super_category,trb.super_category) AND td.type='category' AND td.status!='pruned'`

const endpoint = (row: any, side: 'source' | 'target') => ({
  unit_id: row[`${side}_unit_id`],
  statement: row[`${side}_statement`],
  unit_type: row[`${side}_unit_type`],
  note_id: row[`${side}_note_id`] || null,
  recommendation_id: row[`${side}_recommendation_id`] || null,
  branch: {
    id: row[`${side}_branch_id`],
    label: row[`${side}_branch_label`],
    domain_id: row[`${side}_domain_id`],
    domain: row[`${side}_domain`],
  },
  anchor: row[`${side}_anchor_locator`]
    ? { locator: row[`${side}_anchor_locator`], excerpt: row[`${side}_anchor_excerpt`] || null }
    : null,
})

export function normalizeUnitRelation(row: any, perspectiveUnitId?: string): NormalizedUnitRelation {
  const source = endpoint(row, 'source')
  const target = endpoint(row, 'target')
  const direction = perspectiveUnitId && row.target_unit_id === perspectiveUnitId ? 'incoming' : 'outgoing'
  return {
    id: row.id,
    relation_type: row.relation_type,
    confidence: Number(row.confidence || 0),
    why: row.why || '',
    status: row.status,
    review_state: row.review_state,
    resolution: row.resolution || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    direction,
    counterpart: direction === 'incoming' ? source : target,
    source,
    target,
  }
}

export async function loadNormalizedUnitRelations(db: D1Database, unitId: string) {
  const rows = await db
    .prepare(
      `${relationSelect}
    WHERE (r.source_unit_id=? OR r.target_unit_id=?) AND r.status='active' AND r.review_state='accepted'
      AND su.status='accepted' AND tu.status='accepted'
      AND COALESCE(snb.id,srb.id) IS NOT NULL AND COALESCE(tnb.id,trb.id) IS NOT NULL
      AND sd.id IS NOT NULL AND td.id IS NOT NULL
    ORDER BY r.created_at DESC`,
    )
    .bind(unitId, unitId)
    .all<any>()
  return (rows.results || []).map((row: any) => normalizeUnitRelation(row, unitId))
}

export async function loadContradictionRelations(db: D1Database, reviewState?: string) {
  const filter = reviewState ? ' AND r.review_state=?' : ''
  const query = db.prepare(`${relationSelect}
    WHERE r.relation_type='contradicts' AND r.status='active'${filter}
      AND COALESCE(snb.id,srb.id) IS NOT NULL AND COALESCE(tnb.id,trb.id) IS NOT NULL
      AND sd.id IS NOT NULL AND td.id IS NOT NULL
    ORDER BY CASE r.review_state WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,r.created_at DESC`)
  const rows = await (reviewState ? query.bind(reviewState) : query).all<any>()
  return (rows.results || []).map((row: any) => normalizeUnitRelation(row))
}

export async function loadCrossBranchBridges(db: D1Database, branchId: string) {
  const rows = await db
    .prepare(
      `${relationSelect}
    WHERE r.status='active' AND r.review_state='accepted' AND su.status='accepted' AND tu.status='accepted'
      AND (COALESCE(snb.id,srb.id)=? OR COALESCE(tnb.id,trb.id)=?)
      AND COALESCE(snb.id,srb.id) IS NOT NULL AND COALESCE(tnb.id,trb.id) IS NOT NULL
      AND sd.id IS NOT NULL AND td.id IS NOT NULL
    ORDER BY r.created_at DESC`,
    )
    .bind(branchId, branchId)
    .all<any>()
  return (rows.results || [])
    .filter((row: any) => row.source_branch_id && row.target_branch_id && row.source_branch_id !== row.target_branch_id)
    .map((row: any) => normalizeUnitRelation(row))
}
