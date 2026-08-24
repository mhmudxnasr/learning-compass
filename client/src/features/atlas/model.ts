export type AtlasNode = {
  id: string
  type?: string
  label: string
  super_category?: string
  parent_id?: string | null
  status?: string
  meta_json?: string
  frontier_state?: FrontierState
  frontier_reasons?: string[]
}

export type FrontierState = 'unexplored' | 'weak' | 'deeper-study-ready' | 'saturated' | 'developing'

export const frontierLabels: Record<FrontierState, string> = {
  unexplored: 'Unexplored',
  weak: 'Weak',
  'deeper-study-ready': 'Ready to deepen',
  saturated: 'Saturated',
  developing: 'Developing',
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
  clusterById: Map<string, string>
}

/** Internal profile roots are useful for storage, not for the learner's map. */
export function isPrivateAtlasNode(node: AtlasNode) {
  if (node.id === 'root' || node.type === 'root') return true
  const value = `${node.id} ${node.label}`.toLowerCase().replace(/[’'—–-]/g, ' ')
  return /mahm[ou]+d.*taste\s*map|taste\s*map.*mahm[ou]+d|taste\s*map\s*root|^root$/i.test(value.trim())
}

export function createAtlasModel(rawNodes: AtlasNode[] = [], rawEdges: AtlasEdge[] = []): AtlasModel {
  const candidates = (Array.isArray(rawNodes) ? rawNodes : []).filter((node) => node && typeof node === 'object' && node.id && node.label && !isPrivateAtlasNode(node))
  const candidateById = new Map(candidates.map((node) => [node.id, node]))
  const nodes = candidates.filter((node) => {
    let current: AtlasNode | undefined = node
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      if (String(current.status || '').toLowerCase() === 'pruned') return false
      visited.add(current.id)
      current = current.parent_id ? candidateById.get(current.parent_id) : undefined
    }
    return true
  })
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]))
  const children = new Map<string, AtlasNode[]>()
  const clusters = new Map<string, AtlasNode[]>()
  const clusterById = new Map<string, string>()
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
    const cluster = (rawCluster && byId.get(rawCluster)?.label)
      || rawCluster
      || ((node.type === 'category' || node.type === 'root') ? node.label : '')
      || ancestorCluster(node, byId)
      || 'Unassigned'
    clusters.set(cluster, [...(clusters.get(cluster) || []), node])
    clusterById.set(node.id, cluster)
    if (node.parent_id) children.set(node.parent_id, [...(children.get(node.parent_id) || []), node])
  }

  return { nodes, edges, byId, adjacency, children, clusters, clusterById }
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
    if (clusterName === 'Unassigned' && model.clusters.size > 1) continue
    const primary = clusterNodes.filter((node) => node.type === 'category' || node.type === 'root' || node.type === 'branch')
    ;(primary.length ? primary : clusterNodes.slice(0, 3)).forEach((node) => visible.add(node.id))
  }
  if (!visible.size) model.nodes.slice(0, 24).forEach((node) => visible.add(node.id))
  return visible
}

export function visibleIdsForDepth(model: AtlasModel, depth: 'branches' | 'core' | 'all') {
  if (depth === 'all') return new Set(model.nodes.map((node) => node.id))
  const visible = new Set<string>()
  for (const [clusterName, clusterNodes] of model.clusters) {
    if (depth === 'branches') {
      const primary = clusterNodes.filter((node) => node.type === 'category' || node.type === 'root' || node.type === 'branch')
      primary.forEach((node) => visible.add(node.id))
    } else {
      // Core view: categories, branches, and their direct children
      const branches = clusterNodes.filter((node) => node.type === 'category' || node.type === 'root' || node.type === 'branch')
      branches.forEach((node) => {
        visible.add(node.id)
        for (const child of model.children.get(node.id) || []) {
          visible.add(child.id)
        }
      })
    }
  }
  return visible.size ? visible : initialVisibleIds(model)
}

export function visibleIdsForFrontier(model: AtlasModel, current: Set<string>, state: FrontierState | 'all') {
  if (state === 'all') return current
  const visible = new Set<string>()
  for (const id of current) {
    const node = model.byId.get(id)
    if (node?.frontier_state !== state) continue
    visible.add(id)
    for (const ancestor of nodeAncestry(model, id)) visible.add(ancestor.id)
  }
  return visible
}

export function nodeTypeBadge(node: AtlasNode | undefined): string {
  if (!node) return 'Node'
  if (node.type === 'category' || node.type === 'root') return 'Domain'
  if (node.type === 'branch') return 'Branch'
  if (node.type === 'leaf') return 'Topic'
  return node.type || 'Node'
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

export function nodeAncestry(model: AtlasModel, nodeId: string): AtlasNode[] {
  const path: AtlasNode[] = []
  let current = model.byId.get(nodeId)
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current)
    if (!current.parent_id) break
    current = model.byId.get(current.parent_id)
  }
  return path
}

export function isSubtreeVisible(model: AtlasModel, visible: Set<string>, nodeId: string): boolean {
  const children = model.children.get(nodeId) || []
  if (!children.length) return true
  return children.every((child) => visible.has(child.id))
}

export function toggleSubtree(model: AtlasModel, current: Set<string>, nodeId: string): Set<string> {
  const children = model.children.get(nodeId) || []
  if (!children.length) return current
  const allVisible = children.every((child) => current.has(child.id))
  const next = new Set(current)
  if (allVisible) {
    // Collapse: remove all descendants of this node
    const descendants = branchSubtreeIds(model, nodeId)
    descendants.forEach((id) => {
      if (id !== nodeId) next.delete(id)
    })
  } else {
    // Expand: add all descendants
    const descendants = branchSubtreeIds(model, nodeId)
    descendants.forEach((id) => next.add(id))
  }
  return next
}

export function isolatedVisibleIds(model: AtlasModel, nodeId: string): Set<string> {
  const visible = branchSubtreeIds(model, nodeId)
  for (const related of model.adjacency.get(nodeId) || []) visible.add(related)
  let current = model.byId.get(nodeId)
  while (current?.parent_id) {
    visible.add(current.parent_id)
    current = model.byId.get(current.parent_id)
  }
  return visible
}

export function clusterFor(model: AtlasModel, nodeId: string) {
  return model.clusterById.get(nodeId) || 'Unassigned'
}

export function rootBranchFor(model: AtlasModel, nodeId: string): AtlasNode | undefined {
  const node = model.byId.get(nodeId)
  if (!node) return undefined
  let current: AtlasNode = node
  const visited = new Set<string>()
  while (current) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    if (!current.parent_id) return current
    const parent = model.byId.get(current.parent_id)
    if (!parent || parent.type === 'root' || parent.type === 'category') {
      return current
    }
    current = parent
  }
  return current
}

export function branchConstellations(model: AtlasModel): Map<string, AtlasNode[]> {
  const constellations = new Map<string, AtlasNode[]>()
  const claimed = new Set<string>()

  for (const node of model.nodes) {
    if (node.type === 'root' || node.type === 'category') continue
    const rootBranch = rootBranchFor(model, node.id)
    if (rootBranch && !constellations.has(rootBranch.id)) {
      const subtree = [...branchSubtreeIds(model, rootBranch.id)]
        .map((id) => model.byId.get(id))
        .filter(Boolean) as AtlasNode[]
      subtree.forEach((n) => claimed.add(n.id))
      constellations.set(rootBranch.id, subtree)
    }
  }

  for (const node of model.nodes) {
    if (node.type === 'root' || node.type === 'category' || claimed.has(node.id)) continue
    const cluster = clusterFor(model, node.id)
    const key = `cluster-${cluster}`
    constellations.set(key, [...(constellations.get(key) || []), node])
  }

  return constellations
}

export function nodeTitle(node: AtlasNode) {
  if (!node) return 'Untitled'
  return (typeof node.label === 'string' ? node.label : '').replace(/\s*\[(?:R[123]|legacy metadata)\]\s*$/i, '').trim() || node.id || 'Untitled'
}
