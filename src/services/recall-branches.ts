type Branch = { id: string; label: string; status: string }

// Older cards store either an ID or a label. Preserve that field for mutation
// compatibility and expose a verified identity separately for presentation.
export async function withRecallBranches<T extends { branch?: unknown }>(DB: D1Database, rows: T[]) {
  if (!rows.length) return []
  const { results = [] } = await DB.prepare(
    "SELECT id,label,status FROM tree_nodes WHERE type IN ('branch','leaf')",
  ).all<Branch>()
  const byId = new Map(results.map((branch) => [branch.id, branch]))
  const byLabel = new Map<string, Branch | null>()
  for (const branch of results) byLabel.set(branch.label, byLabel.has(branch.label) ? null : branch)
  return rows.map((row) => ({
    ...row,
    branch_context: byId.get(String(row.branch)) || byLabel.get(String(row.branch)) || null,
  }))
}
