import cytoscape, { Core, ElementDefinition, Position } from 'cytoscape'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { AtlasEdge, AtlasModel, AtlasNode, branchConstellations, branchSubtreeIds, clusterFor, createAtlasModel, expandVisibleIds, initialVisibleIds, nodeRound, nodeTitle, rootBranchFor, visibleIdsForDepth } from './model'

const palette = ['#2f71b8', '#41938f', '#7967ad', '#af6a54', '#838e4f', '#a95f82', '#65829c', '#a07c43']
const svgIcon = (path: string) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
const svgNs = 'http://www.w3.org/2000/svg'

const ATLAS_DEFAULTS = {
  arrows: true,
  text_fade_threshold: -0.7,
  node_size: 0.58,
  link_thickness: 1.16,
  branch_link_thickness: 1,
  animate: true,
  center_force: 0.51,
  repel_force: 18.0,
  link_force: 1.15,
}
type AtlasPrefs = typeof ATLAS_DEFAULTS

type LayoutMap = {
  positions: Map<string, Position>
  clusters: Map<string, Position[]>
}

function constellationLayout(model: AtlasModel, visible: Set<string>, gravity = 0.62, atlas: AtlasPrefs = ATLAS_DEFAULTS): LayoutMap {
  const positions = new Map<string, Position>()
  const clusters = new Map<string, Position[]>()
  const groups = [...model.clusters.entries()]
    .map(([name, nodes]) => [name, nodes.filter((node) => visible.has(node.id))] as const)
    .filter(([, nodes]) => nodes.length)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const total = groups.length
  const centerScale = 0.6 + atlas.center_force * 1.2
  const linkScale = 0.6 + atlas.link_force * 0.9
  const repelPad = 16 + atlas.repel_force * 2.2

  const nodeRadiusX = (node: AtlasNode) => Math.max(34, (nodeTitle(node).length * 4.4 + 22) * Math.sqrt(atlas.node_size))
  const nodeRadiusY = () => 22

  // Phase 1: Compute local constellation coordinates and bounding radius per cluster
  type ClusterLocal = {
    name: string
    nodes: readonly AtlasNode[]
    localPositions: Map<string, Position>
    radius: number
    center: Position
  }

  const clusterLocals: ClusterLocal[] = groups.map(([name, nodes]) => {
    const localPositions = new Map<string, Position>()
    const ordered = [...nodes].sort((a, b) =>
      (nodeRound(a) || 'R9').localeCompare(nodeRound(b) || 'R9') || nodeTitle(a).localeCompare(nodeTitle(b))
    )
    const anchors = ordered.filter((node) => ['R1', 'R2'].includes(nodeRound(node)) || node.type === 'root' || node.type === 'category' || node.type === 'branch')
    const anchorPoints = new Map<string, Position>()

    if (anchors.length <= 1) {
      if (anchors[0]) anchorPoints.set(anchors[0].id, { x: 0, y: 0 })
    } else {
      // Keep anchor spread proportional but compact for small counts
      const spread = Math.min(160, 60 + anchors.length * 26)
      anchors.forEach((node, index) => {
        const angle = (index / anchors.length) * Math.PI * 2 - Math.PI / 2
        anchorPoints.set(node.id, {
          x: Math.cos(angle) * spread,
          y: Math.sin(angle) * spread * 0.82,
        })
      })
    }

    // Build parent -> children hierarchy map for visible nodes in this cluster
    const clusterNodeIds = new Set(nodes.map((n) => n.id))
    const childrenMap = new Map<string, AtlasNode[]>()
    nodes.forEach((n) => {
      if (n.parent_id && clusterNodeIds.has(n.parent_id)) {
        childrenMap.set(n.parent_id, [...(childrenMap.get(n.parent_id) || []), n])
      }
    })

    // Seed roots and anchors
    anchors.forEach((node) => {
      localPositions.set(node.id, anchorPoints.get(node.id) || { x: 0, y: 0 })
    })

    // BFS Queue: [nodeId, inAngle, depth]
    type QueueItem = { id: string; inAngle: number; depth: number }
    const queue: QueueItem[] = anchors.map((a) => {
      const pt = anchorPoints.get(a.id) || { x: 0, y: 0 }
      const inAngle = Math.hypot(pt.x, pt.y) > 10 ? Math.atan2(pt.y, pt.x) : -Math.PI / 2
      return { id: a.id, inAngle, depth: 0 }
    })

    const placed = new Set<string>(anchors.map((a) => a.id))

    while (queue.length > 0) {
      const { id: parentId, inAngle, depth } = queue.shift()!
      const parentPos = localPositions.get(parentId) || { x: 0, y: 0 }
      const children = (childrenMap.get(parentId) || []).filter((c) => !placed.has(c.id))
      if (!children.length) continue

      const count = children.length

      if (count === 1) {
        const bend = (depth % 2 === 0 ? 0.62 : -0.62)
        const angle = inAngle + bend
        const child = children[0]
        placed.add(child.id)
        const dist = (140 + depth * 18) * linkScale
        localPositions.set(child.id, {
          x: parentPos.x + Math.cos(angle) * dist,
          y: parentPos.y + Math.sin(angle) * dist * 0.85,
        })
        queue.push({ id: child.id, inAngle: angle, depth: depth + 1 })
      } else {
        // Multiple children: distribute in multi-tier concentric radial blossom
        const perRing = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(count * 1.8))))
        children.forEach((child, idx) => {
          placed.add(child.id)
          const ring = Math.floor(idx / perRing)
          const slot = idx % perRing
          const ringCount = Math.min(perRing, count - ring * perRing)
          const arcSpread = Math.min(Math.PI * 2.0, Math.max(Math.PI * 0.9, ringCount * 0.7))
          const startAngle = inAngle - arcSpread / 2
          const step = ringCount > 1 ? arcSpread / (ringCount - 1) : 0
          const angle = ringCount === 1 ? inAngle : startAngle + slot * step
          const dist = (160 + ring * 120 + Math.sqrt(count) * 22 + (slot % 2) * 24) * linkScale
          localPositions.set(child.id, {
            x: parentPos.x + Math.cos(angle) * dist,
            y: parentPos.y + Math.sin(angle) * dist * 0.88,
          })
          queue.push({ id: child.id, inAngle: angle, depth: depth + 1 })
        })
      }
    }

    // Assign any remaining unplaced nodes in this cluster
    nodes.forEach((n, idx) => {
      if (!localPositions.has(n.id)) {
        const angle = (idx / nodes.length) * Math.PI * 2
        localPositions.set(n.id, {
          x: Math.cos(angle) * 95,
          y: Math.sin(angle) * 80,
        })
      }
    })

    // Compute bounding radius
    let maxDist = 70
    for (const node of nodes) {
      const p = localPositions.get(node.id) || { x: 0, y: 0 }
      const rad = Math.hypot(p.x, p.y) + nodeRadiusX(node)
      if (rad > maxDist) maxDist = rad
    }
    const rawRadius = maxDist + 35
    const radius = nodes.length <= 3 ? Math.min(rawRadius, 180) : rawRadius

    return {
      name,
      nodes,
      localPositions,
      radius,
      center: { x: 0, y: 0 },
    }
  })

  // Phase 2: Global cluster island placement (Cozy unified cosmic constellation)
  if (total === 1) {
    clusterLocals[0].center = { x: 0, y: 0 }
  } else if (total === 2) {
    const sep = (clusterLocals[0].radius + clusterLocals[1].radius + 40) * 0.55
    clusterLocals[0].center = { x: -sep, y: 0 }
    clusterLocals[1].center = { x: sep, y: 0 }
  } else {
    // Distribute clusters compactly around center
    const totalRadii = clusterLocals.reduce((sum, c) => sum + c.radius, 0)
    const baseOrb = Math.min(600, 150 + (totalRadii / Math.PI) * 0.6 + total * 25)
    clusterLocals.forEach((c, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      c.center = {
        x: Math.cos(angle) * baseOrb * 1.15,
        y: Math.sin(angle) * baseOrb * 0.9,
      }
    })

    // Gentle Cluster Separation
    for (let step = 0; step < 30; step++) {
      for (let i = 0; i < total; i++) {
        for (let j = i + 1; j < total; j++) {
          const cA = clusterLocals[i]
          const cB = clusterLocals[j]
          const dx = cB.center.x - cA.center.x
          const dy = cB.center.y - cA.center.y
          const dist = Math.hypot(dx, dy) || 1
          const required = cA.radius + cB.radius + 28 + atlas.repel_force * 1.2

          if (dist < required) {
            const overlap = (required - dist) * 0.5
            const nx = dx / dist
            const ny = dy / dist
            cA.center.x -= nx * overlap
            cA.center.y -= ny * overlap
            cB.center.x += nx * overlap
            cB.center.y += ny * overlap
          }
        }
      }
    }
  }

  // Phase 3: Translate all nodes into global coordinates
  for (const c of clusterLocals) {
    for (const node of c.nodes) {
      const local = c.localPositions.get(node.id) || { x: 0, y: 0 }
      positions.set(node.id, {
        x: local.x + c.center.x,
        y: local.y + c.center.y,
      })
    }
  }

  // Phase 4: Iterative Node-Level Non-Overlap Collision Relaxation
  for (const c of clusterLocals) {
    const clusterNodes = c.nodes.filter((n) => visible.has(n.id))
    for (let step = 0; step < 150; step++) {
      const alpha = Math.max(0.25, 1 - step / 150)
      for (let i = 0; i < clusterNodes.length; i++) {
        const nodeA = clusterNodes[i]
        const posA = positions.get(nodeA.id)
        if (!posA) continue
        const radAX = nodeRadiusX(nodeA)
        const radAY = nodeRadiusY()
        for (let j = i + 1; j < clusterNodes.length; j++) {
          const nodeB = clusterNodes[j]
          const posB = positions.get(nodeB.id)
          if (!posB) continue
          const radBX = nodeRadiusX(nodeB)
          const radBY = nodeRadiusY()
          let dx = posB.x - posA.x
          let dy = posB.y - posA.y
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
            dx = (Math.random() - 0.5) * 4
            dy = (Math.random() - 0.5) * 4
          }
          const minX = radAX + radBX + repelPad
          const minY = radAY + radBY + repelPad * 0.6 + 14
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          if (absDx < minX && absDy < minY) {
            const overlapX = minX - absDx
            const overlapY = minY - absDy
            const factorX = (overlapX / minX) * alpha * 0.85
            const factorY = (overlapY / minY) * alpha * 0.85
            const signX = dx >= 0 ? 1 : -1
            const signY = dy >= 0 ? 1 : -1
            posA.x -= signX * overlapX * factorX * 0.5
            posA.y -= signY * overlapY * factorY * 0.5
            posB.x += signX * overlapX * factorX * 0.5
            posB.y += signY * overlapY * factorY * 0.5
          }
        }
      }
    }
  }

  // Phase 5: Collect points for cluster shapes
  for (const c of clusterLocals) {
    const points = c.nodes.map((node) => positions.get(node.id)).filter(Boolean) as Position[]
    clusters.set(c.name, points)
  }

  return { positions, clusters }
}

function elementsFor(model: AtlasModel, visible: Set<string>, colors: Map<string, string>, layout: LayoutMap, savedPositions: Map<string, Position>): ElementDefinition[] {
  const nodes: ElementDefinition[] = [...visible].map((id) => {
    const node = model.byId.get(id)!
    const cluster = clusterFor(model, id)
    const hiddenCount = (model.children.get(id) || []).filter((child) => !visible.has(child.id)).length
    const round = nodeRound(node)
    const title = nodeTitle(node)
    return {
      data: {
        id: node.id,
        label: title,
        displayLabel: title,
        round,
        cluster,
        hiddenCount,
        color: colors.get(cluster) || palette[0],
        type: node.type,
      },
      position: savedPositions.get(node.id) || layout.positions.get(node.id) || { x: 0, y: 0 },
      classes: `depth-${round.toLowerCase()} type-${node.type} ${hiddenCount > 0 ? 'has-hidden' : ''}`,
    }
  })

  const edges: ElementDefinition[] = model.edges
    .filter((edge) => visible.has(edge.source_id) && visible.has(edge.target_id))
    .map((edge) => ({
      data: {
        id: `${edge.source_id}->${edge.target_id}`,
        source: edge.source_id,
        target: edge.target_id,
        relation: edge.relation_type,
      },
      classes: `relation-${edge.relation_type}`,
    }))

  return [...nodes, ...edges]
}

function crossProduct(o: Position, a: Position, b: Position): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function convexHull(points: Position[]): Position[] {
  if (points.length <= 2) return points
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const lower: Position[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper: Position[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function smoothHullPath(points: Position[], cornerRadius = 26): string {
  const hull = convexHull(points)
  if (!hull.length) return ''
  if (hull.length === 1) {
    const { x, y } = hull[0]
    const r = Math.max(38, cornerRadius)
    return `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} Z`
  }
  if (hull.length === 2) {
    const [a, b] = hull
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * cornerRadius
    const ny = (dx / len) * cornerRadius
    return `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} A ${cornerRadius} ${cornerRadius} 0 0 1 ${b.x - nx} ${b.y - ny} L ${a.x - nx} ${a.y - ny} A ${cornerRadius} ${cornerRadius} 0 0 1 ${a.x + nx} ${a.y + ny} Z`
  }

  const n = hull.length
  const segments: string[] = []
  for (let i = 0; i < n; i++) {
    const prev = hull[(i - 1 + n) % n]
    const curr = hull[i]
    const next = hull[(i + 1) % n]

    const inDx = prev.x - curr.x
    const inDy = prev.y - curr.y
    const inLen = Math.hypot(inDx, inDy) || 1

    const outDx = next.x - curr.x
    const outDy = next.y - curr.y
    const outLen = Math.hypot(outDx, outDy) || 1

    const r = Math.min(cornerRadius, inLen * 0.4, outLen * 0.4)
    const pIn = { x: curr.x + (inDx / inLen) * r, y: curr.y + (inDy / inLen) * r }
    const pOut = { x: curr.x + (outDx / outLen) * r, y: curr.y + (outDy / outLen) * r }

    if (i === 0) {
      segments.push(`M ${pIn.x} ${pIn.y}`)
    } else {
      segments.push(`L ${pIn.x} ${pIn.y}`)
    }
    segments.push(`Q ${curr.x} ${curr.y} ${pOut.x} ${pOut.y}`)
  }

  return `${segments.join(' ')} Z`
}

function clearSvg(svg: SVGSVGElement) {
  while (svg.firstChild) svg.removeChild(svg.firstChild)
}

function drawOverlays(cy: Core, model: AtlasModel, visible: Set<string>, colors: Map<string, string>, hullSvg: SVGSVGElement | null, minimap: SVGSVGElement | null, selectedId: string) {
  const selectedRoot = selectedId ? rootBranchFor(model, selectedId) : undefined
  const selectedConstellationId = selectedRoot?.id

  // 1. Group visible nodes by primary cluster / category
  const clusterGroups = [...model.clusters.entries()].map(([name, nodes]) => ({
    name,
    nodes: nodes.filter((node) => visible.has(node.id)),
  })).filter((c) => c.nodes.length > 0)

  // 2. Focused constellation if a specific node is active
  const constellations = branchConstellations(model)
  const selectedNodes = selectedConstellationId ? (constellations.get(selectedConstellationId) || []).filter((n) => visible.has(n.id)) : []

  if (hullSvg) {
    clearSvg(hullSvg)
    hullSvg.setAttribute('viewBox', `0 0 ${cy.width()} ${cy.height()}`)

    // Draw cohesive cluster island boundaries
    for (const cluster of clusterGroups) {
      const PADDING = 24
      const allCorners: Position[] = []

      for (const node of cluster.nodes) {
        const ele = cy.getElementById(node.id)
        if (!ele.length) continue

        const bb = ele.renderedBoundingBox({ includeLabels: true, includeNodes: true, includeOverlays: false })
        if (Number.isFinite(bb.x1) && Number.isFinite(bb.y1) && Number.isFinite(bb.x2) && Number.isFinite(bb.y2)) {
          allCorners.push({ x: bb.x1 - PADDING, y: bb.y1 - PADDING })
          allCorners.push({ x: bb.x2 + PADDING, y: bb.y1 - PADDING })
          allCorners.push({ x: bb.x2 + PADDING, y: bb.y2 + PADDING })
          allCorners.push({ x: bb.x1 - PADDING, y: bb.y2 + PADDING })
        } else {
          const point = ele.renderedPosition()
          if (Number.isFinite(point.x)) {
            const r = PADDING + 30
            allCorners.push({ x: point.x - r, y: point.y - r })
            allCorners.push({ x: point.x + r, y: point.y - r })
            allCorners.push({ x: point.x + r, y: point.y + r })
            allCorners.push({ x: point.x - r, y: point.y + r })
          }
        }
      }

      if (!allCorners.length) continue

      const strokeColor = colors.get(cluster.name) || palette[0]
      const path = document.createElementNS(svgNs, 'path')
      path.setAttribute('d', smoothHullPath(allCorners, 28))
      path.setAttribute('stroke', strokeColor)
      path.setAttribute('class', 'atlas-cluster-boundary')
      hullSvg.appendChild(path)
    }

    // Highlight focused branch sub-constellation if active
    if (selectedNodes.length > 1) {
      const branchCorners: Position[] = []
      const PADDING = 16
      for (const node of selectedNodes) {
        const ele = cy.getElementById(node.id)
        if (!ele.length) continue
        const bb = ele.renderedBoundingBox({ includeLabels: true, includeNodes: true, includeOverlays: false })
        if (Number.isFinite(bb.x1)) {
          branchCorners.push({ x: bb.x1 - PADDING, y: bb.y1 - PADDING })
          branchCorners.push({ x: bb.x2 + PADDING, y: bb.y1 - PADDING })
          branchCorners.push({ x: bb.x2 + PADDING, y: bb.y2 + PADDING })
          branchCorners.push({ x: bb.x1 - PADDING, y: bb.y2 + PADDING })
        }
      }
      if (branchCorners.length) {
        const clusterName = clusterFor(model, selectedConstellationId!)
        const strokeColor = colors.get(clusterName) || palette[0]
        const branchPath = document.createElementNS(svgNs, 'path')
        branchPath.setAttribute('d', smoothHullPath(branchCorners, 22))
        branchPath.setAttribute('stroke', strokeColor)
        branchPath.setAttribute('class', 'selected')
        hullSvg.appendChild(branchPath)
      }
    }
  }

  if (minimap) {
    clearSvg(minimap)
    const clusterMap = new Map<string, { corners: Position[]; points: Position[]; isSelected: boolean; color: string }>()

    for (const cluster of clusterGroups) {
      const isSelected = Boolean(selectedConstellationId && clusterFor(model, selectedConstellationId) === cluster.name)
      const points: Position[] = []
      const corners: Position[] = []

      for (const node of cluster.nodes) {
        const ele = cy.getElementById(node.id)
        if (!ele.length) continue
        const point = ele.position()
        if (Number.isFinite(point.x)) {
          points.push(point)
          const rx = 52
          const ry = 36
          corners.push({ x: point.x - rx, y: point.y - ry })
          corners.push({ x: point.x + rx, y: point.y - ry })
          corners.push({ x: point.x + rx, y: point.y + ry })
          corners.push({ x: point.x - rx, y: point.y + ry })
        }
      }

      if (!corners.length) continue

      const color = colors.get(cluster.name) || palette[0]
      clusterMap.set(cluster.name, { corners, points, isSelected, color })
    }

    const allCorners = [...clusterMap.values()].flatMap((v) => v.corners)
    if (!allCorners.length) return

    const minX = Math.min(...allCorners.map((p) => p.x)) - 100
    const minY = Math.min(...allCorners.map((p) => p.y)) - 100
    const maxX = Math.max(...allCorners.map((p) => p.x)) + 100
    const maxY = Math.max(...allCorners.map((p) => p.y)) + 100
    minimap.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`)

    for (const [, { corners, points, color }] of clusterMap) {
      const path = document.createElementNS(svgNs, 'path')
      path.setAttribute('d', smoothHullPath(corners, 20))
      path.setAttribute('fill', color)
      path.setAttribute('stroke', color)
      minimap.appendChild(path)

      points.forEach((point) => {
        const dot = document.createElementNS(svgNs, 'circle')
        dot.setAttribute('cx', String(point.x))
        dot.setAttribute('cy', String(point.y))
        dot.setAttribute('r', '5')
        dot.setAttribute('fill', '#ffffff')
        dot.setAttribute('opacity', '0.85')
        minimap.appendChild(dot)
      })
    }

    const extent = cy.extent()
    const viewport = document.createElementNS(svgNs, 'rect')
    viewport.setAttribute('x', String(extent.x1))
    viewport.setAttribute('y', String(extent.y1))
    viewport.setAttribute('width', String(extent.w))
    viewport.setAttribute('height', String(extent.h))
    viewport.setAttribute('class', 'atlas-minimap-viewport')
    minimap.appendChild(viewport)
  }
}

function AtlasInspector({ node, model, pinned, onClose, onSelect, onExpand, onTogglePin }: { node: AtlasNode; model: AtlasModel; pinned: boolean; onClose: () => void; onSelect: (id: string) => void; onExpand: () => void; onTogglePin: () => void }) {
  const related = [...(model.adjacency.get(node.id) || [])].map((id) => model.byId.get(id)).filter(Boolean) as AtlasNode[]
  const children = model.children.get(node.id) || []
  const evidence = model.edges.filter((edge) => edge.relation_type !== 'hierarchy' && (edge.source_id === node.id || edge.target_id === node.id))
  return <aside class="atlas-panel" aria-label={`${nodeTitle(node)} details`}>
    <div class="atlas-panel-head"><span>{nodeRound(node) || node.type || 'node'}</span><div><button onClick={onTogglePin} aria-label={pinned ? 'Unpin inspector' : 'Pin inspector'} class={pinned ? 'is-pinned' : ''}>{svgIcon('M12 17v5M7 3h10l-2 5 3 3H6l3-3-2-5Z')}</button><button onClick={onClose} aria-label="Close inspector">×</button></div></div>
    <h2>{nodeTitle(node)}</h2>
    <p>{clusterFor(model, node.id)}</p>
    <div class="atlas-panel-stats"><span>{children.length}<small>children</small></span><span>{related.length}<small>links</small></span><span>{evidence.length}<small>evidence</small></span></div>
    {children.length > 0 && <button class="atlas-expand" onClick={onExpand}>Expand next level <span>{children.length}</span></button>}
    <section><div class="atlas-section-head"><h3>Connected branches</h3><span>{related.length}</span></div>{related.length ? <div class="atlas-related">{related.slice(0, 12).map((item) => <button onClick={() => onSelect(item.id)}><i /><span>{nodeRound(item) || item.type}</span><strong>{nodeTitle(item)}</strong></button>)}</div> : <p>No recorded connections.</p>}</section>
    <section><div class="atlas-section-head"><h3>Connection evidence</h3><span>{evidence.length}</span></div>{evidence.length ? <div class="atlas-evidence">{evidence.slice(0, 6).map((edge) => {
      const otherId = edge.source_id === node.id ? edge.target_id : edge.source_id
      const other = model.byId.get(otherId)
      return <button onClick={() => onSelect(otherId)}><strong>{other ? nodeTitle(other) : 'Linked node'}</strong><span>{Math.round(Number(edge.confidence || 0) * 100)}% confidence</span></button>
    })}</div> : <p>No explicit evidence links yet.</p>}</section>
  </aside>
}

export default function AtlasPage() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const hullRef = useRef<SVGSVGElement>(null)
  const minimapRef = useRef<SVGSVGElement>(null)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const cyRef = useRef<Core | null>(null)
  const viewportRef = useRef<{ zoom: number; pan: Position } | null>(null)
  const positionCacheRef = useRef<Map<string, Position>>(new Map())
  const resetViewportRef = useRef(false)
  const inspectorPinnedRef = useRef(false)
  const selectedIdRef = useRef('')
  const [raw, setRaw] = useState<{ nodes: AtlasNode[]; edges: AtlasEdge[] } | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [inspectorPinned, setInspectorPinned] = useState(false)
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [clusterFilter, setClusterFilter] = useState('all')
  const [branchFocus, setBranchFocus] = useState('all')
  const [depth, setDepth] = useState<'R1' | 'R2' | 'R3' | 'all'>('R1')
  const [gravity, setGravity] = useState(0.62)
  const [atlas, setAtlas] = useState<AtlasPrefs>(ATLAS_DEFAULTS)
  const [hint, setHint] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [showListDrawer, setShowListDrawer] = useState(false)
  const [showAtlasPanel, setShowAtlasPanel] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [themeTick, setThemeTick] = useState(0)

  useEffect(() => { inspectorPinnedRef.current = inspectorPinned }, [inspectorPinned])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => {
    const onThemeChange = () => setThemeTick((t) => t + 1)
    window.addEventListener('themechange', onThemeChange)
    return () => window.removeEventListener('themechange', onThemeChange)
  }, [])

  const model = useMemo(() => createAtlasModel(raw?.nodes, raw?.edges), [raw])
  const colors = useMemo(() => new Map([...model.clusters.keys()].sort().map((name, index) => [name, palette[index % palette.length]])), [model])
  const filteredVisible = useMemo(() => clusterFilter === 'all' ? visible : new Set([...visible].filter((id) => clusterFor(model, id) === clusterFilter)), [visible, clusterFilter, model])
  const layoutAtlas = useMemo(() => ({
    center_force: atlas.center_force,
    repel_force: atlas.repel_force,
    link_force: atlas.link_force,
    node_size: atlas.node_size,
    // keep full shape for constellationLayout
    ...atlas,
  }), [atlas.center_force, atlas.repel_force, atlas.link_force, atlas.node_size])
  const layout = useMemo(() => constellationLayout(model, filteredVisible, gravity, layoutAtlas), [model, filteredVisible, gravity, layoutAtlas])
  const selected = selectedId ? model.byId.get(selectedId) : undefined
  const searchResults = query.trim() ? model.nodes.filter((node) => node.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : []
  const animMs = (ms: number) => (atlas.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? ms : 0)
  const branchGroups = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
    const groups = new Map<string, AtlasNode[]>()
    model.nodes.filter((node) => node.type === 'branch').sort((a, b) => collator.compare(nodeTitle(a), nodeTitle(b))).forEach((node) => {
      const round = nodeRound(node) || 'No round'
      groups.set(round, [...(groups.get(round) || []), node])
    })
    return new Map([...groups].sort(([a], [b]) => {
      if (a === 'No round') return 1
      if (b === 'No round') return -1
      return collator.compare(a, b)
    }))
  }, [model])

  useEffect(() => {
    api<{ nodes: AtlasNode[]; edges: AtlasEdge[] }>('/knowledge/graph')
      .then(setRaw)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason || 'Failed to load graph'))
      })
    api<{ resolved?: { atlas?: Partial<AtlasPrefs> } }>('/settings')
      .then((data) => { if (data?.resolved?.atlas) setAtlas((prev) => ({ ...prev, ...data.resolved!.atlas })) })
      .catch(() => {})
  }, [])
  useEffect(() => { if (model.nodes.length) setVisible(initialVisibleIds(model)) }, [model])

  useEffect(() => {
    if (!canvasRef.current || !model.nodes.length || !filteredVisible.size) return
    const compStyle = getComputedStyle(document.documentElement)
    const ink = compStyle.getPropertyValue('--studio-ink').trim() || '#1c211d'
    const surface = compStyle.getPropertyValue('--studio-canvas').trim() || '#ffffff'
    const line = compStyle.getPropertyValue('--studio-seam').trim() || '#e2ddd2'
    const accent = compStyle.getPropertyValue('--studio-cypress').trim() || '#204936'
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const motionEnabled = atlas.animate && !reducedMotion
    const ns = atlas.node_size
    const lt = atlas.link_thickness
    const blt = atlas.branch_link_thickness
    const arrows = atlas.arrows
    const cy = cytoscape({
      container: canvasRef.current,
      elements: elementsFor(model, filteredVisible, colors, layout, positionCacheRef.current),
      layout: { name: 'preset', fit: true, padding: 105 },
      minZoom: 0.01,
      maxZoom: 50.0,
      wheelSensitivity: 1,
      boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: {
          width: 11 * ns, height: 11 * ns, 'background-color': 'data(color)', 'border-color': surface, 'border-width': 2,
          label: 'data(displayLabel)', color: ink, 'font-family': 'IBM Plex Sans, sans-serif',
          'font-size': Math.max(9, Math.round(11 * Math.sqrt(ns))),
          'font-weight': 500,
          'text-valign': 'bottom', 'text-margin-y': Math.max(6, Math.round(8 * Math.sqrt(ns))),
          'text-background-color': surface, 'text-background-opacity': .94, 'text-background-padding': 4,
          'text-background-shape': 'roundrectangle', 'text-border-width': 1, 'text-border-color': line, 'text-border-opacity': .6,
          'text-opacity': 1,
        } },
        { selector: 'node[type = "branch"]', style: {
          width: 15 * ns, height: 15 * ns, 'border-width': 2.5,
          'font-size': Math.max(10, Math.round(12 * Math.sqrt(ns))),
          'font-weight': 600,
        } },
        { selector: 'node[round = "R1"], node[type = "root"], node[type = "category"]', style: {
          width: 28 * ns, height: 28 * ns, 'border-width': 4,
          'font-size': Math.max(12, Math.round(14 * Math.sqrt(ns))),
          'font-weight': 600,
          'text-margin-y': Math.max(8, Math.round(10 * Math.sqrt(ns))),
          'text-background-opacity': .96, 'text-border-width': 1.5,
          'text-opacity': 1,
        } },
        { selector: 'node[hiddenCount > 0]', style: { 'border-color': 'data(color)', 'border-width': 4, 'border-opacity': .35 } },
        { selector: 'edge', style: { width: 1 * lt, 'line-color': line, 'curve-style': 'bezier', opacity: .32, 'target-arrow-shape': arrows ? 'triangle' : 'none', 'target-arrow-color': line, 'arrow-scale': 0.7 } },
        { selector: 'edge[relation = "hierarchy"]', style: { width: 1.1 * blt, opacity: .4 } },
        { selector: 'edge[relation != "hierarchy"]', style: { width: 1.25 * lt, 'line-style': 'dashed', 'line-color': accent, opacity: .52, 'target-arrow-color': accent, 'arrow-scale': 0.75 } },
        { selector: '.muted', style: { opacity: .075 } },
        { selector: '.following', style: { opacity: .72 } },
        { selector: '.drag-leader', style: {
          'overlay-color': accent, 'overlay-opacity': .14, 'overlay-padding': 14,
        } },
        { selector: 'node:selected', style: {
          'border-color': accent, 'border-width': 4, 'overlay-color': accent, 'overlay-opacity': .16, 'overlay-padding': 12,
        } },
        { selector: 'node:active', style: { 'overlay-color': accent, 'overlay-opacity': .1, 'overlay-padding': 8 } },
      ] as any,
    })
    cyRef.current = cy
    const applyTextFade = () => {
      const logZoom = Math.log10(Math.max(cy.zoom(), 0.01))
      const opacity = Math.max(0.18, Math.min(1, (logZoom - atlas.text_fade_threshold + 0.35) / 0.7))
      cy.nodes().style('text-opacity', opacity)
    }
    const focusGraph = (id: string) => {
      cy.elements().removeClass('muted')
      if (!id) return
      const node = cy.getElementById(id)
      if (!node.length) return
      const neighborhood = node.neighborhood().nodes().union(node)
      cy.nodes().not(neighborhood).addClass('muted')
      cy.edges().not(node.connectedEdges()).addClass('muted')
    }
    if (viewportRef.current && !resetViewportRef.current) {
      cy.zoom(viewportRef.current.zoom)
      cy.pan(viewportRef.current.pan)
    } else {
      cy.fit(cy.elements(), 105)
      resetViewportRef.current = false
    }
    applyTextFade()
    if (selectedIdRef.current && cy.getElementById(selectedIdRef.current).length) {
      cy.getElementById(selectedIdRef.current).select()
      focusGraph(selectedIdRef.current)
    }

    let hullFrame = 0
    let minimapTimer = 0
    const redrawHulls = () => {
      if (hullFrame) return
      hullFrame = requestAnimationFrame(() => {
        hullFrame = 0
        drawOverlays(cy, model, filteredVisible, colors, hullRef.current, null, selectedIdRef.current)
      })
    }
    const redrawMinimap = () => {
      clearTimeout(minimapTimer)
      minimapTimer = window.setTimeout(() => drawOverlays(cy, model, filteredVisible, colors, null, minimapRef.current, selectedIdRef.current), 80)
    }
    const expand = (id: string) => setVisible((current) => {
      const next = expandVisibleIds(model, current, id)
      return next.size === current.size ? current : next
    })
    const select = (id: string) => {
      setSelectedId(id)
      const selectedNode = model.byId.get(id)
      if (selectedNode && ['R1', 'R2'].includes(nodeRound(selectedNode))) {
        setVisible((current) => {
          const next = new Set(current)
          branchSubtreeIds(model, id).forEach((childId) => next.add(childId))
          return next
        })
      } else expand(id)
      focusGraph(id)
    }
    cy.on('tap', 'node', (event) => select(event.target.id()))
    // Obsidian-grade Spring Force Physics Engine with Label-Aware Separation
    type SimParticle = {
      id: string
      x: number
      y: number
      vx: number
      vy: number
      mass: number
      pinned: boolean
      radiusX: number
      radiusY: number
    }
    const particles = new Map<string, SimParticle>()
    const initParticles = () => {
      particles.clear()
      cy.nodes().forEach((node) => {
        const p = node.position()
        const isAnchor = ['R1', 'R2'].includes(node.data('round')) || ['root', 'category', 'branch'].includes(node.data('type'))
        const atlasNode = model.byId.get(node.id())
        const labelLen = atlasNode ? nodeTitle(atlasNode).length : 8
        particles.set(node.id(), {
          id: node.id(),
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          mass: isAnchor ? 3.0 : 1.0,
          pinned: false,
          radiusX: Math.max(34, labelLen * 3.8 + 18),
          radiusY: 22,
        })
      })
    }
    initParticles()

    let simAnimFrame = 0
    let simAlpha = motionEnabled ? 0.7 : 0
    let draggedNodeId: string | null = null

    const visibleEdges = model.edges
      .filter((e) => filteredVisible.has(e.source_id) && filteredVisible.has(e.target_id))
      .map((e) => ({
        source: e.source_id,
        target: e.target_id,
        length: e.relation_type === 'hierarchy' ? (85 * (0.6 + atlas.link_force * 0.7)) : (125 * (0.6 + atlas.link_force * 0.7)),
        stiffness: e.relation_type === 'hierarchy' ? 0.22 : 0.11,
      }))

    const savePositions = () => cy.nodes().forEach((node) => {
      positionCacheRef.current.set(node.id(), { ...node.position() })
    })

    const stepSimulation = () => {
      if (!particles.size || simAlpha < 0.015) {
        simAlpha = 0
        simAnimFrame = 0
        savePositions()
        redrawMinimap()
        return
      }

      // 1. Pinned dragged node updates from cursor
      if (draggedNodeId) {
        const ele = cy.getElementById(draggedNodeId)
        if (ele.length) {
          const p = ele.position()
          const part = particles.get(draggedNodeId)
          if (part) {
            part.x = p.x
            part.y = p.y
            part.vx = 0
            part.vy = 0
            part.pinned = true
          }
        }
      }

      // 2. Spring tension along graph edges
      for (const edge of visibleEdges) {
        const pA = particles.get(edge.source)
        const pB = particles.get(edge.target)
        if (!pA || !pB) continue
        const dx = pB.x - pA.x
        const dy = pB.y - pA.y
        const dist = Math.hypot(dx, dy) || 1
        const delta = dist - edge.length
        const force = delta * edge.stiffness * simAlpha
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        if (!pA.pinned) {
          pA.vx += fx / pA.mass
          pA.vy += fy / pA.mass
        }
        if (!pB.pinned) {
          pB.vx -= fx / pB.mass
          pB.vy -= fy / pB.mass
        }
      }

      // 3. Label-Aware Soft Non-Overlap Collision
      const partList = [...particles.values()]
      const count = partList.length
      for (let i = 0; i < count; i++) {
        const pA = partList[i]
        for (let j = i + 1; j < count; j++) {
          const pB = partList[j]
          let dx = pB.x - pA.x
          let dy = pB.y - pA.y
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            dx = (Math.random() - 0.5) * 2
            dy = (Math.random() - 0.5) * 2
          }
          const minGapX = pA.radiusX + pB.radiusX + 16
          const minGapY = pA.radiusY + pB.radiusY + 12
          const absX = Math.abs(dx)
          const absY = Math.abs(dy)
          if (absX < minGapX && absY < minGapY) {
            const overlapX = (minGapX - absX) / minGapX
            const overlapY = (minGapY - absY) / minGapY
            const force = Math.min(overlapX, overlapY) * (0.8 + atlas.repel_force * 0.12) * simAlpha
            const rx = (dx >= 0 ? 1 : -1) * force
            const ry = (dy >= 0 ? 1 : -1) * force
            if (!pA.pinned) { pA.vx -= rx / pA.mass; pA.vy -= ry / pA.mass }
            if (!pB.pinned) { pB.vx += rx / pB.mass; pB.vy += ry / pB.mass }
          }
        }
      }

      // 4. Damping & Velocity Limiting
      const DAMPING = 0.72
      for (const p of partList) {
        if (p.pinned) continue
        p.vx *= DAMPING
        p.vy *= DAMPING
        p.vx = Math.max(-10, Math.min(10, p.vx))
        p.vy = Math.max(-10, Math.min(10, p.vy))
        p.x += p.vx
        p.y += p.vy
      }

      // 5. Batch render to Cytoscape
      cy.batch(() => {
        for (const p of partList) {
          const ele = cy.getElementById(p.id)
          if (ele.length) ele.position({ x: p.x, y: p.y })
        }
      })
      redrawHulls()

      // Cool down alpha if not dragged
      if (draggedNodeId) {
        simAlpha = 1.0
      } else {
        simAlpha *= 0.88
      }

      simAnimFrame = requestAnimationFrame(stepSimulation)
    }

    if (motionEnabled && simAlpha > 0) {
      simAnimFrame = requestAnimationFrame(stepSimulation)
    }

    cy.on('grab', 'node', (event) => {
      const node = event.target
      draggedNodeId = node.id()
      const part = particles.get(draggedNodeId)
      if (part) part.pinned = true
      node.addClass('drag-leader')
      simAlpha = 1.0
      if (motionEnabled && !simAnimFrame) simAnimFrame = requestAnimationFrame(stepSimulation)
    })
    cy.on('drag', 'node', () => {
      simAlpha = 1.0
      if (motionEnabled && !simAnimFrame) simAnimFrame = requestAnimationFrame(stepSimulation)
    })
    cy.on('free', 'node', (event) => {
      const node = event.target
      const part = particles.get(node.id())
      if (part) {
        part.pinned = false
        part.x = node.position().x
        part.y = node.position().y
      }
      draggedNodeId = null
      node.removeClass('drag-leader')
      positionCacheRef.current.set(node.id(), { ...node.position() })
      if (motionEnabled && !simAnimFrame) simAnimFrame = requestAnimationFrame(stepSimulation)
    })
    cy.on('dbltap', (event) => {
      if (event.target === cy) {
        viewport('fit')
      } else if (typeof event.target.isNode === 'function' && event.target.isNode()) {
        const node = event.target
        expand(node.id())
        cy.animate(
          { center: { eles: node }, zoom: Math.min(cy.maxZoom(), Math.max(cy.zoom() * 1.35, 1.4)) },
          { duration: animMs(280), easing: 'ease-out-cubic' }
        )
      }
    })
    cy.on('tap', (event) => {
      setHint(false)
      if (event.target === cy && !inspectorPinnedRef.current) {
        setSelectedId('')
        cy.elements().removeClass('muted')
      }
    })
    cy.on('render resize', redrawHulls)
    cy.on('zoom pan', () => {
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`
      applyTextFade()
      redrawHulls()
      redrawMinimap()
    })
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`
    const resizeObserver = new ResizeObserver(() => {
      if (cyRef.current) {
        cyRef.current.resize()
        redrawHulls()
      }
    })
    if (canvasRef.current) resizeObserver.observe(canvasRef.current)

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(hullFrame)
      simAlpha = 0
      cancelAnimationFrame(simAnimFrame)
      clearTimeout(minimapTimer)
      savePositions()
      if (!resetViewportRef.current) viewportRef.current = { zoom: cy.zoom(), pan: cy.pan() }
      cy.destroy()
      cyRef.current = null
    }
  }, [model, filteredVisible, colors, atlas.animate, atlas.text_fade_threshold, themeTick])

  // Real-time Visual Styles Update Effect
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const compStyle = getComputedStyle(document.documentElement)
    const ink = compStyle.getPropertyValue('--studio-ink').trim() || '#1c211d'
    const surface = compStyle.getPropertyValue('--studio-canvas').trim() || '#ffffff'
    const line = compStyle.getPropertyValue('--studio-seam').trim() || '#e2ddd2'
    const accent = compStyle.getPropertyValue('--studio-cypress').trim() || '#204936'
    const ns = atlas.node_size
    const lt = atlas.link_thickness
    const blt = atlas.branch_link_thickness
    const arrows = atlas.arrows

    cy.style()
      .selector('node')
      .style({
        width: 11 * ns,
        height: 11 * ns,
        'background-color': 'data(color)',
        'border-color': surface,
        'border-width': 2,
        label: 'data(displayLabel)',
        color: ink,
        'font-family': 'IBM Plex Sans, sans-serif',
        'font-size': Math.max(9, Math.round(11 * Math.sqrt(ns))),
        'font-weight': 500,
        'text-valign': 'bottom',
        'text-margin-y': Math.max(6, Math.round(8 * Math.sqrt(ns))),
        'text-background-color': surface,
        'text-background-opacity': 0.94,
        'text-background-padding': 4,
        'text-background-shape': 'roundrectangle',
        'text-border-width': 1,
        'text-border-color': line,
        'text-border-opacity': 0.6,
        'text-opacity': 1,
      })
      .selector('node[type = "branch"]')
      .style({
        width: 15 * ns,
        height: 15 * ns,
        'border-width': 2.5,
        'font-size': Math.max(10, Math.round(12 * Math.sqrt(ns))),
        'font-weight': 600,
      })
      .selector('node[round = "R1"], node[type = "root"], node[type = "category"]')
      .style({
        width: 28 * ns,
        height: 28 * ns,
        'border-width': 4,
        'font-size': Math.max(12, Math.round(14 * Math.sqrt(ns))),
        'font-weight': 600,
        'text-margin-y': Math.max(8, Math.round(10 * Math.sqrt(ns))),
        'text-background-opacity': 0.96,
        'text-border-width': 1.5,
        'text-opacity': 1,
      })
      .selector('node[hiddenCount > 0]')
      .style({ 'border-color': 'data(color)', 'border-width': 4, 'border-opacity': 0.35 })
      .selector('edge')
      .style({
        width: 1 * lt,
        'line-color': line,
        'curve-style': 'bezier',
        opacity: 0.32,
        'target-arrow-shape': arrows ? 'triangle' : 'none',
        'target-arrow-color': line,
        'arrow-scale': 0.7,
      })
      .selector('edge[relation = "hierarchy"]')
      .style({ width: 1.1 * blt, opacity: 0.4 })
      .selector('edge[relation != "hierarchy"]')
      .style({
        width: 1.25 * lt,
        'line-style': 'dashed',
        'line-color': accent,
        opacity: 0.52,
        'target-arrow-color': accent,
        'arrow-scale': 0.75,
      })
      .update()

    cy.nodes().style('text-opacity', '1')
  }, [atlas.node_size, atlas.link_thickness, atlas.branch_link_thickness, atlas.arrows, atlas.text_fade_threshold, themeTick])

  useEffect(() => {
    selectedIdRef.current = selectedId
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('muted')
    if (selectedId && cy.getElementById(selectedId).length) {
      const node = cy.getElementById(selectedId)
      node.select()
      const neighborhood = node.neighborhood().nodes().union(node)
      cy.nodes().not(neighborhood).addClass('muted')
      cy.edges().not(node.connectedEdges()).addClass('muted')
    } else {
      cy.elements().unselect()
    }
    if (hullRef.current) drawOverlays(cy, model, filteredVisible, colors, hullRef.current, null, selectedId)
  }, [selectedId, model, filteredVisible, colors])

  const saveTimeoutRef = useRef<number | null>(null)

  const expandNode = (id: string) => setVisible((current) => {
    const next = expandVisibleIds(model, new Set(current).add(id), id)
    return next.size === current.size ? current : next
  })
  const focusNode = (id: string) => {
    expandNode(id)
    setSelectedId(id)
    setQuery('')
    requestAnimationFrame(() => {
      const node = cyRef.current?.getElementById(id)
      if (node?.length) cyRef.current?.animate({ center: { eles: node }, zoom: Math.max(cyRef.current.zoom(), 1.2) }, { duration: animMs(220) })
    })
  }
  const updateAtlas = (patch: Partial<AtlasPrefs>) => {
    setAtlas((prev) => ({ ...prev, ...patch }))
    const layoutKeys = ['center_force', 'repel_force', 'link_force']
    if (Object.keys(patch).some((k) => layoutKeys.includes(k))) {
      positionCacheRef.current.clear()
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      api('/settings/atlas', { method: 'PUT', body: JSON.stringify(patch) }).catch(() => {})
    }, 400)
  }
  const resetAtlas = () => {
    positionCacheRef.current.clear()
    resetViewportRef.current = true
    setAtlas(ATLAS_DEFAULTS)
    api('/settings/atlas', { method: 'PUT', body: JSON.stringify(ATLAS_DEFAULTS) }).catch(() => {})
  }
  const viewport = (action: 'in' | 'out' | 'fit') => {
    const cy = cyRef.current
    if (!cy) return
    cy.stop()
    if (action === 'fit') {
      cy.animate(
        { fit: { eles: cy.elements(), padding: 85 } },
        { duration: animMs(320), easing: 'ease-out-cubic' }
      )
      return
    }
    const currentZoom = cy.zoom()
    const zoomFactor = action === 'in' ? 2.2 : (1 / 2.2)
    const targetZoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), currentZoom * zoomFactor))
    const pan = cy.pan()
    const center = { x: cy.width() / 2, y: cy.height() / 2 }
    const modelCenter = { x: (center.x - pan.x) / currentZoom, y: (center.y - pan.y) / currentZoom }
    const targetPan = { x: center.x - modelCenter.x * targetZoom, y: center.y - modelCenter.y * targetZoom }
    cy.animate(
      { zoom: targetZoom, pan: targetPan },
      { duration: animMs(240), easing: 'ease-out-cubic' }
    )
  }

  // Keyboard Navigation Shortcuts (+, -, 0/F for fit, Esc to deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return

      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        viewport('in')
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        viewport('out')
      } else if (e.key === '0' || e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        viewport('fit')
      } else if (e.key === 'Escape') {
        setSelectedId('')
        setShowControls(false)
        setShowListDrawer(false)
        setShowAtlasPanel(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  const focusBranch = (id: string) => {
    resetViewportRef.current = true
    setBranchFocus(id)
    setClusterFilter('all')
    setSelectedId(id === 'all' ? '' : id)
    setVisible(id === 'all' ? visibleIdsForDepth(model, depth) : branchSubtreeIds(model, id))
  }
  const changeDepth = (value: 'R1' | 'R2' | 'R3' | 'all') => {
    resetViewportRef.current = true
    setDepth(value)
    setBranchFocus('all')
    setClusterFilter('all')
    setSelectedId('')
    setVisible(visibleIdsForDepth(model, value))
  }

  const toggleFullscreen = () => {
    const el = document.querySelector('.atlas') as HTMLElement | null
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    } else {
      el.requestFullscreen().catch(() => {
        setIsFullscreen((v) => !v)
      })
      setIsFullscreen(true)
    }
  }

  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement) setIsFullscreen(false) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  if (error) return <div class="error-state"><strong>Couldn’t load the Atlas.</strong><span>{error}</span><button onClick={() => location.reload()}>Retry</button></div>
  if (!raw) return <div class="atlas-loading"><div /><span>Mapping knowledge clusters…</span></div>
  if (!model.nodes.length) return <div class="empty-state atlas-empty-state"><h1 class="visually-hidden">Atlas</h1><span class="empty-rule" /><h2>The Atlas has no mapped nodes</h2><p>Processed notes and branch changes will form your first constellation.</p></div>

  return (
    <div class={`atlas atlas-canvas-view ${selected ? 'has-selection' : ''} ${isFullscreen ? 'atlas-fullscreen' : ''}`}>
      <h1 class="visually-hidden">Atlas</h1>
      <div class="atlas-stage">
        <div class="atlas-canvas-shell">
          {/* Floating Trigger Button (Clean & Minimal) */}
          <button
            type="button"
            class={`atlas-controls-trigger ${showControls ? 'active' : ''}`}
            onClick={() => setShowControls((v) => !v)}
            aria-expanded={showControls}
            title="Open map controls & search"
          >
            {svgIcon('m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z')}
            <span>Controls &amp; Search</span>
            <span class="atlas-trigger-badge">{filteredVisible.size}</span>
          </button>

          {/* Clean Slide-over Controls Panel */}
          {showControls && (
            <aside class="atlas-controls-panel" aria-label="Map filters and controls">
              <div class="atlas-controls-panel-head">
                <h3>Map Controls</h3>
                <button
                  type="button"
                  class="icon-button"
                  onClick={() => setShowControls(false)}
                  aria-label="Close controls"
                >
                  ×
                </button>
              </div>

              <div class="atlas-controls-panel-body">
                {/* Search */}
                <div class="atlas-panel-field">
                  <label class="atlas-field-label">Search</label>
                  <div class="atlas-search">
                    <span>{svgIcon('m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z')}</span>
                    <input
                      aria-label="Search Atlas"
                      value={query}
                      onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
                      placeholder="Search the map…"
                    />
                    {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
                    {searchResults.length > 0 && (
                      <div class="atlas-search-results">
                        {searchResults.map((node) => (
                          <button key={node.id} onClick={() => { focusNode(node.id); setShowControls(false) }}>
                            <span>{nodeRound(node) || node.type}</span>
                            <strong>{nodeTitle(node)}</strong>
                            <small>{clusterFor(model, node.id)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Focus Branch */}
                <div class="atlas-panel-field">
                  <label class="atlas-field-label">Focus Branch</label>
                  <select
                    class="atlas-panel-select"
                    aria-label="Focus branch"
                    value={branchFocus}
                    onChange={(event) => focusBranch((event.target as HTMLSelectElement).value)}
                  >
                    <option value="all">All branches</option>
                    {[...branchGroups].map(([round, nodes]) => (
                      <optgroup key={round} label={round}>
                        {nodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {round !== 'No round' ? `${round} · ` : ''}{nodeTitle(node)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Cluster Filter */}
                <div class="atlas-panel-field">
                  <label class="atlas-field-label">Cluster Category</label>
                  <select
                    class="atlas-panel-select"
                    aria-label="Filter by cluster"
                    value={clusterFilter}
                    onChange={(event) => {
                      resetViewportRef.current = true
                      setBranchFocus('all')
                      setClusterFilter((event.target as HTMLSelectElement).value)
                    }}
                  >
                    <option value="all">All clusters</option>
                    {[...model.clusters.keys()].sort().map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Topology Depth */}
                <div class="atlas-panel-field">
                  <label class="atlas-field-label">Map Depth</label>
                  <select
                    class="atlas-panel-select"
                    aria-label="Atlas depth"
                    value={depth}
                    onChange={(event) => changeDepth((event.target as HTMLSelectElement).value as 'R1' | 'R2' | 'R3' | 'all')}
                  >
                    <option value="R1">Major branches (R1)</option>
                    <option value="R2">Branches &amp; topics (R2)</option>
                    <option value="R3">Include detailed topics (R3)</option>
                    <option value="all">Every node</option>
                  </select>
                </div>

                {/* Gravity */}
                <div class="atlas-panel-field">
                  <div class="atlas-field-header">
                    <label class="atlas-field-label">Anchor Gravity</label>
                    <output class="atlas-range-val">{Math.round(gravity * 100)}%</output>
                  </div>
                  <input
                    aria-label="Anchor gravity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={gravity}
                    class="atlas-panel-range"
                    onInput={(event) => {
                      resetViewportRef.current = true
                      positionCacheRef.current.clear()
                      setGravity(Number((event.target as HTMLInputElement).value))
                    }}
                  />
                </div>

                {/* Quick Toggle Actions */}
                <div class="atlas-panel-actions">
                  <button
                    type="button"
                    class={`atlas-panel-btn ${showListDrawer ? 'active' : ''}`}
                    onClick={() => { setShowListDrawer((v) => !v); setShowAtlasPanel(false); setShowControls(false) }}
                  >
                    {svgIcon('M4 6h16M4 12h16M4 18h16')}
                    <span>Browse list</span>
                  </button>
                  <button
                    type="button"
                    class={`atlas-panel-btn ${showAtlasPanel ? 'active' : ''}`}
                    onClick={() => { setShowAtlasPanel((v) => !v); setShowListDrawer(false); setShowControls(false) }}
                  >
                    {svgIcon('M4 8h10M16 8h4M4 16h4M10 16h10M8 6v4M14 14v4')}
                    <span>Map style</span>
                  </button>
                </div>

                {/* Stats Summary */}
                <div class="atlas-panel-stats">
                  <span><strong>{filteredVisible.size}</strong> visible</span>
                  <span class="sep">·</span>
                  <span><strong>{model.nodes.length}</strong> total</span>
                  <span class="sep">·</span>
                  <span><strong>{model.edges.length}</strong> links</span>
                </div>
              </div>
            </aside>
          )}

          <svg ref={hullRef} class="atlas-hulls" aria-hidden="true" />
          <div ref={canvasRef} class="atlas-canvas" role="img" aria-label="Visual knowledge map. Use the accessible node list to browse and select nodes." />

          {/* Slide-over Node List Drawer */}
          {showListDrawer && (
            <aside id="atlas-node-drawer" class="atlas-node-drawer" aria-label="Visible Atlas nodes">
              <div class="atlas-drawer-header">
                <h3>Nodes in view <span>({filteredVisible.size})</span></h3>
                <button type="button" class="icon-button" onClick={() => setShowListDrawer(false)} aria-label="Close node list">×</button>
              </div>
              <div class="atlas-drawer-list" role="list">
                {[...filteredVisible].map((id) => {
                  const node = model.byId.get(id)
                  if (!node) return null
                  return (
                    <div key={id} role="listitem">
                      <button
                        type="button"
                        class={`atlas-drawer-item ${selectedId === id ? 'active' : ''}`}
                        onClick={() => focusNode(id)}
                        aria-current={selectedId === id ? 'true' : undefined}
                      >
                        <span class="atlas-node-badge">{nodeRound(node) || node.type || 'Node'}</span>
                        <strong class="atlas-node-title">{nodeTitle(node)}</strong>
                        <small class="atlas-node-cluster">{clusterFor(model, id)}</small>
                      </button>
                    </div>
                  )
                })}
              </div>
            </aside>
          )}

          {showAtlasPanel && (
            <aside class="atlas-style-panel" aria-label="Atlas appearance">
              <div class="atlas-style-panel-head">
                <h3>Atlas appearance</h3>
                <div class="atlas-style-panel-actions">
                  <button type="button" class="atlas-style-reset" onClick={resetAtlas}>Reset</button>
                  <button type="button" class="icon-button" onClick={() => setShowAtlasPanel(false)} aria-label="Close appearance panel">×</button>
                </div>
              </div>
              <div class="setting-row"><div><strong>Show arrows</strong><span>Direction markers on links.</span></div><input type="checkbox" checked={atlas.arrows} onChange={(event) => updateAtlas({ arrows: (event.target as HTMLInputElement).checked })} aria-label="Show arrows" /></div>
              <div class="setting-row"><div><strong>Animate</strong><span>Smooth camera and drag motion.</span></div><input type="checkbox" checked={atlas.animate} onChange={(event) => updateAtlas({ animate: (event.target as HTMLInputElement).checked })} aria-label="Animate" /></div>
              <label class="type-range"><span class="type-range-label"><strong>Text fade threshold</strong><output>{atlas.text_fade_threshold.toFixed(2)}</output></span><small>Labels fade as you zoom out (log scale).</small><input type="range" min={-1} max={1} step={0.05} value={atlas.text_fade_threshold} onInput={(event) => updateAtlas({ text_fade_threshold: Number((event.target as HTMLInputElement).value) })} /></label>
              <label class="type-range"><span class="type-range-label"><strong>Node size</strong><output>{atlas.node_size.toFixed(2)}×</output></span><small>Scale every node on the map.</small><input type="range" min={0.1} max={3} step={0.02} value={atlas.node_size} onInput={(event) => updateAtlas({ node_size: Number((event.target as HTMLInputElement).value) })} /></label>
              <label class="type-range"><span class="type-range-label"><strong>Link thickness</strong><output>{atlas.link_thickness.toFixed(2)}×</output></span><small>Weight of relationship lines.</small><input type="range" min={0.1} max={6} step={0.05} value={atlas.link_thickness} onInput={(event) => updateAtlas({ link_thickness: Number((event.target as HTMLInputElement).value) })} /></label>
              <label class="type-range"><span class="type-range-label"><strong>Branch links</strong><output>{atlas.branch_link_thickness.toFixed(2)}×</output></span><small>Thickness of lines from a branch to its child nodes.</small><input type="range" min={0.1} max={6} step={0.05} value={atlas.branch_link_thickness} onInput={(event) => updateAtlas({ branch_link_thickness: Number((event.target as HTMLInputElement).value) })} /></label>
              <div class="atlas-style-subhead"><strong>Forces</strong></div>
              <label class="type-range"><span class="type-range-label"><strong>Center force</strong><output>{atlas.center_force.toFixed(2)}</output></span><small>Pull of cluster islands to center.</small><input type="range" min={0} max={2} step={0.01} value={atlas.center_force} onInput={(event) => updateAtlas({ center_force: Number((event.target as HTMLInputElement).value) })} /></label>
              <label class="type-range"><span class="type-range-label"><strong>Repel force</strong><output>{atlas.repel_force.toFixed(2)}</output></span><small>How strongly nodes push apart.</small><input type="range" min={0} max={40} step={0.5} value={atlas.repel_force} onInput={(event) => updateAtlas({ repel_force: Number((event.target as HTMLInputElement).value) })} /></label>
              <label class="type-range"><span class="type-range-label"><strong>Link force</strong><output>{atlas.link_force.toFixed(2)}</output></span><small>Length of connected links.</small><input type="range" min={0} max={3} step={0.05} value={atlas.link_force} onInput={(event) => updateAtlas({ link_force: Number((event.target as HTMLInputElement).value) })} /></label>
            </aside>
          )}

          {/* Floating Gesture Hint (Clean non-overlapping pill) */}
          {hint && (
            <div class="atlas-gesture-hint" role="status">
              <span>Drag a branch to move its constellation · scroll or pinch to zoom</span>
              <button type="button" class="atlas-hint-close" onClick={() => setHint(false)} aria-label="Dismiss hint">×</button>
            </div>
          )}

          {/* Floating Category Legend Card */}
          <div class="atlas-legend-card" aria-label="Cluster categories">
            {[...colors].slice(0, 6).map(([name, color]) => (
              <span key={name} class="atlas-legend-item">
                <i style={{ background: color }} aria-hidden="true" />
                {name}
              </span>
            ))}
          </div>

          {/* Minimap */}
          <div class="atlas-minimap" aria-label="Atlas overview map">
            <span class="atlas-minimap-label">Minimap</span>
            <svg ref={minimapRef} aria-hidden="true" />
          </div>

          {/* Zoom and Fit Controls */}
          <div class="atlas-zoom-controls" aria-label="Map zoom controls">
            <button onClick={() => viewport('in')} aria-label="Zoom in" title="Zoom in">+</button>
            <button onClick={() => viewport('out')} aria-label="Zoom out" title="Zoom out">−</button>
            <button onClick={() => viewport('fit')} aria-label="Fit graph to screen" title="Fit to view">{svgIcon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')}</button>
            <button class="atlas-fullscreen-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen
                ? svgIcon('M4 14h6v6M14 10h6V4M20 14h-6v6M10 4H4v6')
                : svgIcon('M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7')
              }
            </button>
            <span ref={zoomLabelRef} class="atlas-zoom-percentage">100%</span>
          </div>

          <div class="visually-hidden" aria-live="polite">{selected ? `Selected ${nodeTitle(selected)}.` : 'No Atlas node selected.'}</div>
        </div>

        {selected && (
          <AtlasInspector
            node={selected}
            model={model}
            pinned={inspectorPinned}
            onClose={() => {
              setSelectedId('')
              setInspectorPinned(false)
              cyRef.current?.elements().removeClass('muted')
            }}
            onSelect={focusNode}
            onExpand={() => expandNode(selected.id)}
            onTogglePin={() => setInspectorPinned((value) => !value)}
          />
        )}
      </div>
    </div>
  )
}
