export type AtlasNode = {
  id: string
  type?: string
  label: string
  super_category?: string
  parent_id?: string | null
  status?: string
  round_label?: string
  meta_json?: string
}

export type AtlasEdge = {
  id?: string
  source_id: string
  target_id: string
  relation_type?: string
  confidence?: number
}

export type AtlasModel = {
  nodes: AtlasNode[]
  edges: AtlasEdge[]
  byId: Map<string, AtlasNode>
  adjacency: Map<string, Set<string>>
  children: Map<string, AtlasNode[]>
  clusters: Map<string, AtlasNode[]>
}

/** Internal profile roots are useful for storage, not for the learner's map. */
export function isPrivateAtlasNode(node: AtlasNode) {
  const value = `${node.id} ${node.label}`.toLowerCase().replace(/[’']/g, '')
  return /mahmoud.*taste\s*map|taste\s*map.*mahmoud/.test(value)
}

export function createAtlasModel(rawNodes: AtlasNode[] = [], rawEdges: AtlasEdge[] = []): AtlasModel {
  const nodes = (Array.isArray(rawNodes) ? rawNodes : []).filter((node) => node && typeof node === 'object' && node.id && node.label && !isPrivateAtlasNode(node))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]))
  const children = new Map<string, AtlasNode[]>()
  const clusters = new Map<string, AtlasNode[]>()
  const seen = new Set<string>()
  const edges = (Array.isArray(rawEdges) ? rawEdges : []).filter((edge) => {
    if (!edge || !byId.has(edge.source_id) || !byId.has(edge.target_id)) return false
    const key = `${edge.source_id}:${edge.target_id}:${edge.relation_type || 'evidence'}`
    if (seen.has(key)) return false
    seen.add(key)
    adjacency.get(edge.source_id)?.add(edge.target_id)
    adjacency.get(edge.target_id)?.add(edge.source_id)
    return true
  })

  for (const node of nodes) {
    const rawCluster = node.super_category?.trim()
    const cluster = (rawCluster && byId.get(rawCluster)?.label) || rawCluster || ancestorCluster(node, byId) || 'Unassigned'
    clusters.set(cluster, [...(clusters.get(cluster) || []), node])
    if (node.parent_id) children.set(node.parent_id, [...(children.get(node.parent_id) || []), node])
  }

  return { nodes, edges, byId, adjacency, children, clusters }
}

function ancestorCluster(node: AtlasNode, byId: Map<string, AtlasNode>) {
  let current = node
  const visited = new Set<string>()
  while (current.parent_id && !visited.has(current.parent_id)) {
    visited.add(current.parent_id)
    const parent = byId.get(current.parent_id)
    if (!parent) break
    if (parent.type === 'category' || parent.type === 'root') return parent.label
    current = parent
  }
  return ''
}

export function initialVisibleIds(model: AtlasModel) {
  const visible = new Set<string>()
  for (const [clusterName, clusterNodes] of model.clusters) {
    const r1 = clusterNodes.filter((node) => nodeRound(node) === 'R1')
    if (!r1.length && clusterName === 'Unassigned' && model.clusters.size > 1) continue
    const primary = r1.length ? r1 : clusterNodes.filter((node) => node.type === 'category' || node.type === 'root')
    ;(primary.length ? primary : clusterNodes.filter((node) => node.type === 'branch').slice(0, 3)).forEach((node) => visible.add(node.id))
  }
  if (!visible.size) model.nodes.slice(0, 24).forEach((node) => visible.add(node.id))
  return visible
}

export function visibleIdsForDepth(model: AtlasModel, depth: 'R1' | 'R2' | 'R3' | 'all') {
  if (depth === 'all') return new Set(model.nodes.map((node) => node.id))
  const limit = Number(depth.slice(1))
  const visible = new Set<string>()
  for (const [clusterName, clusterNodes] of model.clusters) {
    const rounded = clusterNodes.filter((node) => {
      const round = nodeRound(node)
      return round && Number(round.slice(1)) <= limit
    })
    if (rounded.length) rounded.forEach((node) => visible.add(node.id))
    else if (clusterName !== 'Unassigned') {
      const anchor = clusterNodes.find((node) => node.type === 'category' || node.type === 'root')
      if (anchor) visible.add(anchor.id)
    }
  }
  return visible.size ? visible : initialVisibleIds(model)
}

export function expandVisibleIds(model: AtlasModel, current: Set<string>, nodeId: string) {
  const next = new Set(current)
  for (const child of model.children.get(nodeId) || []) next.add(child.id)
  for (const related of model.adjacency.get(nodeId) || []) next.add(related)
  return next
}

export function branchSubtreeIds(model: AtlasModel, nodeId: string) {
  const visible = new Set<string>()
  const pending = [nodeId]
  while (pending.length) {
    const id = pending.pop()!
    if (visible.has(id) || !model.byId.has(id)) continue
    visible.add(id)
    for (const child of model.children.get(id) || []) pending.push(child.id)
  }
  return visible
}

export function clusterFor(model: AtlasModel, nodeId: string) {
  for (const [name, nodes] of model.clusters) if (nodes.some((node) => node.id === nodeId)) return name
  return 'Unassigned'
}

export function nodeRound(node: AtlasNode) {
  if (!node) return ''
  return node.round_label?.toUpperCase() || (typeof node.label === 'string' ? node.label.match(/\bR[1-9]\b/i)?.[0].toUpperCase() : '') || ''
}

export function nodeTitle(node: AtlasNode) {
  if (!node) return 'Untitled'
  return (typeof node.label === 'string' ? node.label : '').replace(/\s*\[[^\]]+\]\s*$/, '').trim() || node.id || 'Untitled'
}
