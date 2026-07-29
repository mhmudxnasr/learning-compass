import cytoscape, { Core, ElementDefinition, Position } from 'cytoscape'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { AtlasModel, AtlasNode, branchSubtreeIds, clusterFor, createAtlasModel, expandVisibleIds, initialVisibleIds, nodeRound, nodeTitle, visibleIdsForDepth } from './model'

const palette = ['#2f71b8', '#41938f', '#7967ad', '#af6a54', '#838e4f', '#a95f82', '#65829c', '#a07c43']
const svgIcon = (path: string) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
const svgNs = 'http://www.w3.org/2000/svg'

type LayoutMap = {
  positions: Map<string, Position>
  clusters: Map<string, Position[]>
}

function constellationLayout(model: AtlasModel, visible: Set<string>): LayoutMap {
  const positions = new Map<string, Position>()
  const clusters = new Map<string, Position[]>()
  const groups = [...model.clusters.entries()]
    .map(([name, nodes]) => [name, nodes.filter((node) => visible.has(node.id))] as const)
    .filter(([, nodes]) => nodes.length)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const total = groups.length

  groups.forEach(([name, nodes], clusterIndex) => {
    let center = { x: 0, y: 0 }
    if (total === 2) center = { x: clusterIndex ? 310 : -310, y: 0 }
    else if (total > 1 && clusterIndex > 0) {
      const angle = -Math.PI / 2 + ((clusterIndex - 1) / Math.max(1, total - 1)) * Math.PI * 2
      center = { x: Math.cos(angle) * 500, y: Math.sin(angle) * 330 }
    }
    const ordered = [...nodes].sort((a, b) =>
      (nodeRound(a) || 'R9').localeCompare(nodeRound(b) || 'R9') || nodeTitle(a).localeCompare(nodeTitle(b))
    )
    const points = ordered.map((node, index) => {
      if (index === 0) return center
      const ring = Math.floor((index - 1) / 7)
      const slot = (index - 1) % 7
      const slots = Math.min(7, ordered.length - ring * 7 - 1)
      const angle = (slot / Math.max(slots, 1)) * Math.PI * 2 - Math.PI / 2 + clusterIndex * .31
      const radius = 78 + ring * 58
      return { x: center.x + Math.cos(angle) * radius * 1.12, y: center.y + Math.sin(angle) * radius }
    })
    ordered.forEach((node, index) => positions.set(node.id, points[index]))
    clusters.set(name, points)
  })
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
        id,
        label: title,
        displayLabel: title,
        type: node.type || 'node',
        cluster,
        color: colors.get(cluster),
        hiddenCount,
        round,
      },
      position: savedPositions.get(id) || layout.positions.get(id),
    }
  })
  const edges: ElementDefinition[] = model.edges
    .filter((edge) => visible.has(edge.source_id) && visible.has(edge.target_id))
    .map((edge, index) => ({
      data: {
        id: edge.id || `edge-${index}-${edge.source_id}-${edge.target_id}`,
        source: edge.source_id,
        target: edge.target_id,
        relation: edge.relation_type || 'evidence',
      },
    }))
  return [...nodes, ...edges]
}

function convexHull(points: Position[]) {
  if (points.length <= 2) return points
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Position, a: Position, b: Position) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Position[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: Position[] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function hullPath(points: Position[], padding = 46) {
  if (!points.length) return ''
  if (points.length === 1) {
    const { x, y } = points[0]
    const r = padding + 28
    return `M ${x - r} ${y} A ${r} ${r * .78} 0 1 0 ${x + r} ${y} A ${r} ${r * .78} 0 1 0 ${x - r} ${y} Z`
  }
  if (points.length === 2) {
    const [a, b] = points
    const x = (a.x + b.x) / 2
    const y = (a.y + b.y) / 2
    const rx = Math.abs(b.x - a.x) / 2 + padding
    const ry = Math.abs(b.y - a.y) / 2 + padding
    return `M ${x - rx} ${y} A ${rx} ${ry} 0 1 0 ${x + rx} ${y} A ${rx} ${ry} 0 1 0 ${x - rx} ${y} Z`
  }
  const hull = convexHull(points)
  const center = hull.reduce((sum, point) => ({ x: sum.x + point.x / hull.length, y: sum.y + point.y / hull.length }), { x: 0, y: 0 })
  const expanded = hull.map((point) => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x + (dx / length) * padding, y: point.y + (dy / length) * padding }
  })
  const midpoint = (a: Position, b: Position) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const start = midpoint(expanded[expanded.length - 1], expanded[0])
  return `M ${start.x} ${start.y} ${expanded.map((point, index) => {
    const next = expanded[(index + 1) % expanded.length]
    const mid = midpoint(point, next)
    return `Q ${point.x} ${point.y} ${mid.x} ${mid.y}`
  }).join(' ')} Z`
}

function clearSvg(svg: SVGSVGElement) {
  while (svg.firstChild) svg.removeChild(svg.firstChild)
}

function drawOverlays(cy: Core, model: AtlasModel, visible: Set<string>, colors: Map<string, string>, hullSvg: SVGSVGElement | null, minimap: SVGSVGElement | null, selectedId: string) {
  if (hullSvg) {
    clearSvg(hullSvg)
    hullSvg.setAttribute('viewBox', `0 0 ${cy.width()} ${cy.height()}`)
    for (const [name, nodes] of model.clusters) {
      const points = nodes.filter((node) => visible.has(node.id)).map((node) => cy.getElementById(node.id).renderedPosition()).filter((point) => Number.isFinite(point.x))
      if (!points.length) continue
      const path = document.createElementNS(svgNs, 'path')
      path.setAttribute('d', hullPath(points))
      path.setAttribute('stroke', colors.get(name) || palette[0])
      path.setAttribute('class', nodes.some((node) => node.id === selectedId) ? 'selected' : '')
      hullSvg.appendChild(path)
    }
  }
  if (minimap) {
    clearSvg(minimap)
    const clusterPoints = new Map<string, Position[]>()
    for (const [name, nodes] of model.clusters) {
      const points = nodes.filter((node) => visible.has(node.id)).map((node) => cy.getElementById(node.id).position()).filter((point) => Number.isFinite(point.x))
      if (points.length) clusterPoints.set(name, points)
    }
    const all = [...clusterPoints.values()].flat()
    if (!all.length) return
    const minX = Math.min(...all.map((point) => point.x)) - 120
    const minY = Math.min(...all.map((point) => point.y)) - 120
    const maxX = Math.max(...all.map((point) => point.x)) + 120
    const maxY = Math.max(...all.map((point) => point.y)) + 120
    minimap.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`)
    for (const [name, points] of clusterPoints) {
      const path = document.createElementNS(svgNs, 'path')
      path.setAttribute('d', hullPath(points, 38))
      path.setAttribute('fill', colors.get(name) || palette[0])
      path.setAttribute('stroke', colors.get(name) || palette[0])
      minimap.appendChild(path)
      points.forEach((point) => {
        const dot = document.createElementNS(svgNs, 'circle')
        dot.setAttribute('cx', String(point.x))
        dot.setAttribute('cy', String(point.y))
        dot.setAttribute('r', '10')
        dot.setAttribute('fill', colors.get(name) || palette[0])
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
  const [raw, setRaw] = useState<any>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [inspectorPinned, setInspectorPinned] = useState(false)
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [clusterFilter, setClusterFilter] = useState('all')
  const [branchFocus, setBranchFocus] = useState('all')
  const [depth, setDepth] = useState<'R1' | 'R2' | 'R3' | 'all'>('R1')
  const [hint, setHint] = useState(true)
  useEffect(() => { inspectorPinnedRef.current = inspectorPinned }, [inspectorPinned])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  const model = useMemo(() => createAtlasModel(raw?.nodes, raw?.edges), [raw])
  const colors = useMemo(() => new Map([...model.clusters.keys()].sort().map((name, index) => [name, palette[index % palette.length]])), [model])
  const filteredVisible = useMemo(() => clusterFilter === 'all' ? visible : new Set([...visible].filter((id) => clusterFor(model, id) === clusterFilter)), [visible, clusterFilter, model])
  const layout = useMemo(() => constellationLayout(model, filteredVisible), [model, filteredVisible])
  const selected = selectedId ? model.byId.get(selectedId) : undefined
  const searchResults = query.trim() ? model.nodes.filter((node) => node.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : []
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

  useEffect(() => { api('/knowledge/graph').then(setRaw).catch((reason) => setError(reason.message)) }, [])
  useEffect(() => { if (model.nodes.length) setVisible(initialVisibleIds(model)) }, [model])

  useEffect(() => {
    if (!canvasRef.current || !model.nodes.length || !filteredVisible.size) return
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
    const ink = dark ? '#edf1f7' : '#202734'
    const surface = dark ? '#111720' : '#ffffff'
    const line = dark ? '#485466' : '#b5bdc8'
    const accent = dark ? '#77ade8' : '#2868aa'
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const cy = cytoscape({
      container: canvasRef.current,
      elements: elementsFor(model, filteredVisible, colors, layout, positionCacheRef.current),
      layout: { name: 'preset', fit: true, padding: 105 },
      minZoom: .18,
      maxZoom: 3.6,
      wheelSensitivity: .28,
      boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: {
          width: 9, height: 9, 'background-color': 'data(color)', 'border-color': surface, 'border-width': 2,
          label: 'data(displayLabel)', color: ink, 'font-family': 'IBM Plex Sans', 'font-size': 10, 'font-weight': 500,
          'text-valign': 'bottom', 'text-margin-y': 8, 'text-background-color': surface, 'text-background-opacity': .88, 'text-background-padding': 3,
        } },
        { selector: 'node[type = "branch"]', style: { width: 14, height: 14, 'border-width': 3 } },
        { selector: 'node[round = "R1"], node[type = "root"], node[type = "category"]', style: {
          width: 25, height: 25, 'border-width': 5, 'font-size': 12, 'font-weight': 600, 'text-margin-y': 10,
        } },
        { selector: 'node[hiddenCount > 0]', style: { 'border-color': 'data(color)', 'border-width': 5, 'border-opacity': .28 } },
        { selector: 'edge', style: { width: 1, 'line-color': line, 'curve-style': 'bezier', opacity: .3 } },
        { selector: 'edge[relation != "hierarchy"]', style: { width: 1.2, 'line-style': 'dashed', 'line-color': accent, opacity: .46 } },
        { selector: '.muted', style: { opacity: .075 } },
        { selector: '.following', style: { opacity: .72 } },
        { selector: '.drag-leader', style: {
          'overlay-color': accent, 'overlay-opacity': .12, 'overlay-padding': 15,
        } },
        { selector: 'node:selected', style: {
          'border-color': accent, 'border-width': 5, 'overlay-color': accent, 'overlay-opacity': .11, 'overlay-padding': 12,
        } },
        { selector: 'node:active', style: { 'overlay-color': accent, 'overlay-opacity': .08, 'overlay-padding': 8 } },
      ] as any,
    })
    cyRef.current = cy
    if (viewportRef.current && !resetViewportRef.current) {
      cy.zoom(viewportRef.current.zoom)
      cy.pan(viewportRef.current.pan)
    } else {
      cy.fit(cy.elements(), 105)
      resetViewportRef.current = false
    }
    if (selectedIdRef.current && cy.getElementById(selectedIdRef.current).length) cy.getElementById(selectedIdRef.current).select()

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
      expand(id)
      cy.elements().removeClass('muted')
      const node = cy.getElementById(id)
      cy.edges().not(node.connectedEdges()).addClass('muted')
    }
    cy.on('tap', 'node', (event) => select(event.target.id()))
    let followerFrame = 0
    let followers: {
      leaderId: string
      offsets: Map<string, Position>
      targets: Map<string, Position>
      settling: boolean
    } | null = null
    const savePositions = () => cy.nodes().forEach((node) => {
      positionCacheRef.current.set(node.id(), { ...node.position() })
    })
    const animateFollowers = () => {
      followerFrame = 0
      if (!followers) return
      let moving = false
      for (const [id, target] of followers.targets) {
        const node = cy.getElementById(id)
        if (!node.length) continue
        const current = node.position()
        const distance = Math.hypot(target.x - current.x, target.y - current.y)
        if (distance > .35) {
          moving = true
          const ease = reducedMotion ? 1 : followers.settling ? .34 : .24
          node.position({
            x: current.x + (target.x - current.x) * ease,
            y: current.y + (target.y - current.y) * ease,
          })
        } else node.position(target)
      }
      if (moving) followerFrame = requestAnimationFrame(animateFollowers)
      else if (followers.settling) {
        cy.elements().removeClass('following drag-leader')
        followers = null
        savePositions()
        redrawMinimap()
      }
    }
    const updateFollowerTargets = () => {
      if (!followers) return
      const leader = cy.getElementById(followers.leaderId)
      if (!leader.length) return
      const origin = leader.position()
      for (const [id, offset] of followers.offsets) followers.targets.set(id, { x: origin.x + offset.x, y: origin.y + offset.y })
      if (!followerFrame) followerFrame = requestAnimationFrame(animateFollowers)
    }
    cy.on('grab', 'node', (event) => {
      const leader = event.target
      const atlasNode = model.byId.get(leader.id())
      if (!atlasNode || (!nodeRound(atlasNode) && !['root', 'category', 'branch'].includes(atlasNode.type || ''))) return
      const leaderPosition = leader.position()
      const descendantIds = [...branchSubtreeIds(model, leader.id())].filter((id) => id !== leader.id() && filteredVisible.has(id))
      if (!descendantIds.length) return
      const offsets = new Map<string, Position>()
      descendantIds.forEach((id) => {
        const position = cy.getElementById(id).position()
        offsets.set(id, { x: position.x - leaderPosition.x, y: position.y - leaderPosition.y })
      })
      followers = { leaderId: leader.id(), offsets, targets: new Map(), settling: false }
      leader.addClass('drag-leader')
      cy.nodes().filter((node) => descendantIds.includes(node.id())).addClass('following')
      updateFollowerTargets()
    })
    cy.on('drag', 'node', (event) => {
      if (followers?.leaderId === event.target.id()) updateFollowerTargets()
    })
    cy.on('free', 'node', (event) => {
      positionCacheRef.current.set(event.target.id(), { ...event.target.position() })
      const activeFollowers = followers
      if (!activeFollowers || activeFollowers.leaderId !== event.target.id()) return
      activeFollowers.settling = true
      updateFollowerTargets()
    })
    cy.on('dbltap', 'node', (event) => {
      const node = event.target
      expand(node.id())
      cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.35) }, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150, easing: 'ease-out-cubic' })
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
      redrawHulls()
      redrawMinimap()
    })
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`
    drawOverlays(cy, model, filteredVisible, colors, hullRef.current, minimapRef.current, selectedIdRef.current)
    return () => {
      cancelAnimationFrame(hullFrame)
      cancelAnimationFrame(followerFrame)
      clearTimeout(minimapTimer)
      savePositions()
      if (!resetViewportRef.current) viewportRef.current = { zoom: cy.zoom(), pan: cy.pan() }
      cy.destroy()
      cyRef.current = null
    }
  }, [model, filteredVisible, colors, layout])

  useEffect(() => {
    selectedIdRef.current = selectedId
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().unselect()
    if (selectedId && cy.getElementById(selectedId).length) cy.getElementById(selectedId).select()
    drawOverlays(cy, model, filteredVisible, colors, hullRef.current, minimapRef.current, selectedId)
  }, [selectedId, model, filteredVisible, colors])

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
      if (node?.length) cyRef.current?.animate({ center: { eles: node }, zoom: Math.max(cyRef.current.zoom(), 1.2) }, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220 })
    })
  }
  const viewport = (action: 'in' | 'out' | 'fit') => {
    const cy = cyRef.current
    if (!cy) return
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 90
    cy.stop()
    if (action === 'fit') {
      cy.animate({ fit: { eles: cy.elements(), padding: 105 } }, { duration: Math.min(duration + 20, 110), easing: 'ease-out-cubic' })
      return
    }
    const currentZoom = cy.zoom()
    const targetZoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), currentZoom * (action === 'in' ? 1.8 : 1 / 1.8)))
    const pan = cy.pan()
    const center = { x: cy.width() / 2, y: cy.height() / 2 }
    const modelCenter = { x: (center.x - pan.x) / currentZoom, y: (center.y - pan.y) / currentZoom }
    const targetPan = { x: center.x - modelCenter.x * targetZoom, y: center.y - modelCenter.y * targetZoom }
    cy.animate({ zoom: targetZoom, pan: targetPan }, { duration, easing: 'ease-out-cubic' })
  }
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

  if (error) return <div class="error-state"><strong>Couldn’t load the Atlas.</strong><span>{error}</span><button onClick={() => location.reload()}>Retry</button></div>
  if (!raw) return <div class="atlas-loading"><div /><span>Mapping knowledge clusters…</span></div>
  if (!model.nodes.length) return <div class="empty-state"><span class="empty-rule" /><h2>The Atlas has no mapped nodes</h2><p>Processed notes and branch changes will form your first constellation.</p></div>

  return <div class={`atlas atlas-canvas-view ${selected ? 'has-selection' : ''}`}>
    <div class="atlas-stage">
      <div class="atlas-canvas-shell">
        <div class="atlas-controls">
          <div class="atlas-search"><span>{svgIcon('m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z')}</span><input aria-label="Search Atlas" value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search the map" />{query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
            {searchResults.length > 0 && <div class="atlas-search-results">{searchResults.map((node) => <button onClick={() => focusNode(node.id)}><span>{nodeRound(node) || node.type}</span><strong>{nodeTitle(node)}</strong><small>{clusterFor(model, node.id)}</small></button>)}</div>}
          </div>
          <select class="atlas-branch-focus" aria-label="Focus branch" value={branchFocus} onChange={(event) => focusBranch((event.target as HTMLSelectElement).value)}><option value="all">Focus a branch…</option>{[...branchGroups].map(([round, nodes]) => <optgroup label={round}>{nodes.map((node) => <option value={node.id}>{round !== 'No round' ? `${round} · ` : ''}{nodeTitle(node)}</option>)}</optgroup>)}</select>
          <select class="atlas-cluster-filter" aria-label="Filter by cluster" value={clusterFilter} onChange={(event) => { resetViewportRef.current = true; setBranchFocus('all'); setClusterFilter((event.target as HTMLSelectElement).value) }}><option value="all">All clusters</option>{[...model.clusters.keys()].sort().map((name) => <option value={name}>{name}</option>)}</select>
          <select class="atlas-depth-select" aria-label="Atlas depth" value={depth} onChange={(event) => changeDepth((event.target as HTMLSelectElement).value as 'R1' | 'R2' | 'R3' | 'all')}><option value="R1">Major branches</option><option value="R2">Branches and topics</option><option value="R3">Include detailed topics</option><option value="all">Every node</option></select>
        </div>
        <div class="atlas-canvas-meta"><span>{filteredVisible.size} visible</span><span>{model.nodes.length} total nodes</span><span>{model.edges.length} connections</span></div>
        <svg ref={hullRef} class="atlas-hulls" aria-hidden="true" />
        <div ref={canvasRef} class="atlas-canvas" role="application" aria-label="Interactive knowledge map. Drag to pan, scroll or pinch to zoom." />
        {hint && <div class="atlas-gesture-hint">Drag a branch to move its constellation · scroll or pinch to zoom</div>}
        <div class="atlas-zoom-controls" aria-label="Map controls"><button onClick={() => viewport('in')} aria-label="Zoom in">+</button><button onClick={() => viewport('out')} aria-label="Zoom out">−</button><button onClick={() => viewport('fit')} aria-label="Fit graph">{svgIcon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')}</button><span ref={zoomLabelRef}>100%</span></div>
        <div class="atlas-legend">{[...colors].slice(0, 6).map(([name, color]) => <span><i style={{ background: color }} />{name}</span>)}</div>
        <div class="atlas-minimap"><svg ref={minimapRef} aria-label="Atlas overview map" /></div>
      </div>
      {selected && <AtlasInspector node={selected} model={model} pinned={inspectorPinned} onClose={() => { setSelectedId(''); setInspectorPinned(false); cyRef.current?.elements().removeClass('muted') }} onSelect={focusNode} onExpand={() => expandNode(selected.id)} onTogglePin={() => setInspectorPinned((value) => !value)} />}
    </div>
  </div>
}
