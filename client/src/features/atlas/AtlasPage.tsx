import cytoscape, { Core, ElementDefinition, Position } from 'cytoscape'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import {
  AtlasEdge,
  AtlasModel,
  AtlasNode,
  FrontierState,
  branchSubtreeIds,
  clusterFor,
  createAtlasModel,
  frontierLabels,
  initialVisibleIds,
  isolatedVisibleIds,
  nodeAncestry,
  nodeTitle,
  nodeTypeBadge,
  toggleSubtree,
  visibleIdsForDepth,
  visibleIdsForFrontier,
} from './model'

const palette = [
  '#244f3b', // Cypress
  '#315f7b', // Map blue
  '#8a642f', // Ochre
  '#52705d', // Fern
  '#596f7a', // Slate blue
  '#75684f', // Bark
]

const svgIcon = (path: string) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} />
  </svg>
)
const svgNs = 'http://www.w3.org/2000/svg'

function mixColors(foreground: string, background: string, foregroundWeight: number): string {
  const parse = (color: string) => {
    const hex = color.match(/^#([\da-f]{6})$/i)?.[1]
    if (hex) return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
    const rgb = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i)
    return rgb ? rgb.slice(1, 4).map(Number) : null
  }
  const front = parse(foreground)
  const back = parse(background)
  if (!front || !back) return background
  return `rgb(${front.map((channel, index) => Math.round(channel * foregroundWeight + back[index] * (1 - foregroundWeight))).join(', ')})`
}

function moveViewport(cy: Core | null, action: 'in' | 'out' | 'fit', reducedMotion: boolean) {
  if (!cy) return
  cy.stop()
  if (action === 'fit') {
    cy.animate(
      { fit: { eles: cy.elements(), padding: cy.width() < 600 ? 88 : 72 } },
      { duration: reducedMotion ? 0 : 440, easing: 'ease-out-cubic' },
    )
    return
  }
  const currentZoom = cy.zoom()
  const zoomFactor = action === 'in' ? 1.6 : 1 / 1.6
  const targetZoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), currentZoom * zoomFactor))
  const pan = cy.pan()
  const center = { x: cy.width() / 2, y: cy.height() / 2 }
  const modelCenter = { x: (center.x - pan.x) / currentZoom, y: (center.y - pan.y) / currentZoom }
  const targetPan = { x: center.x - modelCenter.x * targetZoom, y: center.y - modelCenter.y * targetZoom }
  cy.animate({ zoom: targetZoom, pan: targetPan }, { duration: reducedMotion ? 0 : 360, easing: 'ease-out-cubic' })
}

const ATLAS_DEFAULTS = {
  arrows: false,
  text_fade_threshold: 0.15,
  node_size: 0.85,
  link_thickness: 1.4,
  branch_link_thickness: 1.5,
  animate: true,
  center_force: 0.65,
  repel_force: 14,
  link_force: 1.25,
  focus_dimming: true,
}
type AtlasPrefs = typeof ATLAS_DEFAULTS

function initialGalaxyLayout(model: AtlasModel, visible: Set<string>): Map<string, Position> {
  const positions = new Map<string, Position>()
  const groups = [...model.clusters.entries()]
    .map(([name, nodes]) => [name, nodes.filter((node) => visible.has(node.id))] as const)
    .filter(([, nodes]) => nodes.length)
    .sort(([a], [b]) => a.localeCompare(b))

  const total = groups.length
  const orbRadius = total <= 1 ? 0 : Math.max(420, total * 105)

  groups.forEach(([, nodes], groupIdx) => {
    const clusterAngle = (groupIdx / (total || 1)) * Math.PI * 2 - Math.PI / 2
    const clusterCenter = {
      x: Math.cos(clusterAngle) * orbRadius,
      y: Math.sin(clusterAngle) * orbRadius * 0.85,
    }

    const hubs = nodes.filter((node) => node.type === 'root' || node.type === 'category')
    const branches = nodes.filter((node) => node.type === 'branch')
    const hub = hubs[0]
    if (hub) positions.set(hub.id, clusterCenter)

    branches.forEach((node, idx) => {
      const angle = (idx / Math.max(1, branches.length)) * Math.PI * 2 - Math.PI / 2
      const ring = Math.floor(idx / 10)
      const radius = 230 + ring * 170
      positions.set(node.id, {
        x: clusterCenter.x + Math.cos(angle) * radius,
        y: clusterCenter.y + Math.sin(angle) * radius * 0.88,
      })
    })

    const pending = nodes.filter((node) => !positions.has(node.id))
    for (let pass = 0; pass < nodes.length && pending.length; pass++) {
      for (let idx = pending.length - 1; idx >= 0; idx--) {
        const node = pending[idx]
        const parentPos = node.parent_id ? positions.get(node.parent_id) : undefined
        if (!parentPos && node.parent_id && model.byId.has(node.parent_id)) continue
        positions.set(node.id, childPosition(model, node.id, parentPos || clusterCenter))
        pending.splice(idx, 1)
      }
    }
    pending.forEach((node) => positions.set(node.id, childPosition(model, node.id, clusterCenter)))
  })

  return positions
}

function childPosition(model: AtlasModel, nodeId: string, parent: Position): Position {
  const node = model.byId.get(nodeId)
  const siblings = node?.parent_id ? model.children.get(node.parent_id) || [] : []
  const index = Math.max(
    0,
    siblings.findIndex((item) => item.id === nodeId),
  )
  const perRing = 8
  const ring = Math.floor(index / perRing)
  const count = Math.min(perRing, Math.max(1, siblings.length - ring * perRing))
  const slot = index % perRing
  const jitter = stableJitter(nodeId, 0.22)
  const angle = (slot / count) * Math.PI * 2 - Math.PI / 2 + Math.atan2(jitter.y, jitter.x) * 0.12
  const radius = 165 + ring * 125
  return {
    x: parent.x + Math.cos(angle) * radius,
    y: parent.y + Math.sin(angle) * radius * 0.86,
  }
}

function stableJitter(id: string, amount: number) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  const angle = ((hash >>> 0) / 4294967295) * Math.PI * 2
  return { x: Math.cos(angle) * amount, y: Math.sin(angle) * amount }
}

function edgeElementId(edge: AtlasEdge) {
  return `edge:${edge.source_id}->${edge.target_id}:${edge.relation_type || 'evidence'}`
}

type AtlasPageProps = {
  initialSelectedId?: string
  onSelect?: (nodeId: string | null) => void
}

export default function AtlasPage({ initialSelectedId, onSelect }: AtlasPageProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<SVGSVGElement>(null)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const cyRef = useRef<Core | null>(null)
  const positionCacheRef = useRef<Map<string, Position>>(new Map())
  const fitPendingRef = useRef(false)
  const selectedIdRef = useRef('')
  const atlasRef = useRef<AtlasPrefs>(ATLAS_DEFAULTS)
  const onSelectRef = useRef(onSelect)

  const [raw, setRaw] = useState<{ nodes: AtlasNode[]; edges: AtlasEdge[] } | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [isolateId, setIsolateId] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [clusterFilter, setClusterFilter] = useState('all')
  const [branchFocus, setBranchFocus] = useState('all')
  const [frontierFilter, setFrontierFilter] = useState<FrontierState | 'all'>('all')
  const [depth, setDepth] = useState<'branches' | 'core' | 'all'>('branches')
  const [atlas, setAtlas] = useState<AtlasPrefs>(ATLAS_DEFAULTS)
  const [showControls, setShowControls] = useState(false)
  const [activeTab, setActiveTab] = useState<'filters' | 'display' | 'physics'>('filters')
  const [showListDrawer, setShowListDrawer] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [themeTick, setThemeTick] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [settingsStatus, setSettingsStatus] = useState('')

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])
  useEffect(() => {
    atlasRef.current = atlas
  }, [atlas])
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  useEffect(() => {
    const onThemeChange = () => setThemeTick((t) => t + 1)
    window.addEventListener('themechange', onThemeChange)
    return () => window.removeEventListener('themechange', onThemeChange)
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(media.matches || document.documentElement.dataset.reducedMotion === 'true')
    sync()
    media.addEventListener('change', sync)
    window.addEventListener('themechange', sync)
    return () => {
      media.removeEventListener('change', sync)
      window.removeEventListener('themechange', sync)
    }
  }, [])

  const model = useMemo(() => createAtlasModel(raw?.nodes, raw?.edges), [raw])
  const colors = useMemo(
    () => new Map([...model.clusters.keys()].sort().map((name, index) => [name, palette[index % palette.length]])),
    [model],
  )

  const filteredVisible = useMemo(() => {
    let current = visible
    if (isolateId && model.byId.has(isolateId)) {
      current = isolatedVisibleIds(model, isolateId)
    }
    if (clusterFilter !== 'all') {
      current = new Set([...current].filter((id) => clusterFor(model, id) === clusterFilter))
    }
    return visibleIdsForFrontier(model, current, frontierFilter)
  }, [visible, isolateId, clusterFilter, frontierFilter, model])

  const selected = selectedId ? model.byId.get(selectedId) : undefined
  const ancestry = useMemo(() => (selectedId ? nodeAncestry(model, selectedId) : []), [model, selectedId])
  const selectedBranch = [...ancestry].reverse().find((node) => node.type === 'branch' || node.type === 'leaf')

  const searchResults = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return model.nodes
      .filter(
        (node) => nodeTitle(node).toLowerCase().includes(q) || clusterFor(model, node.id).toLowerCase().includes(q),
      )
      .slice(0, 10)
  }, [model, query])

  const branchGroups = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
    const groups = new Map<string, AtlasNode[]>()
    model.nodes
      .filter((node) => node.type === 'branch')
      .sort((a, b) => collator.compare(nodeTitle(a), nodeTitle(b)))
      .forEach((node) => {
        const domain = clusterFor(model, node.id) || 'General'
        groups.set(domain, [...(groups.get(domain) || []), node])
      })
    return new Map([...groups].sort(([a], [b]) => collator.compare(a, b)))
  }, [model])

  useEffect(() => {
    let cancelled = false
    api<{ nodes: AtlasNode[]; edges: AtlasEdge[] }>('/knowledge/graph')
      .then((graph) => {
        if (cancelled) return
        setRaw(graph)
        api<{ branches?: Array<Pick<AtlasNode, 'id' | 'frontier_state' | 'frontier_reasons'>> }>(
          '/learning/balance?window=90',
        )
          .then((balance) => {
            if (cancelled) return
            setRaw((current) => {
              if (!current) return current
              const frontierById = new Map((balance.branches || []).map((branch) => [String(branch.id), branch]))
              return { ...current, nodes: current.nodes.map((node) => ({ ...node, ...frontierById.get(node.id) })) }
            })
          })
          .catch(() => {})
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : String(reason || 'Failed to load graph'))
      })
    api<{ resolved?: { atlas?: Partial<AtlasPrefs> } }>('/settings')
      .then((data) => {
        if (cancelled || !data?.resolved?.atlas) return
        const next = { ...ATLAS_DEFAULTS, ...data.resolved.atlas }
        atlasRef.current = next
        setAtlas(next)
      })
      .catch(() => setSettingsStatus('Map preferences could not be loaded. Defaults are active.'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (model.nodes.length) setVisible((current) => (current.size ? current : initialVisibleIds(model)))
  }, [model])

  const physicsSimRef = useRef<{
    start: (alpha?: number) => void
    stop: () => void
  } | null>(null)
  const viewport = useCallback(
    (action: 'in' | 'out' | 'fit') => moveViewport(cyRef.current, action, reducedMotion),
    [reducedMotion],
  )

  useEffect(() => {
    if (!canvasRef.current || !model.nodes.length) return
    if (!filteredVisible.size) {
      cyRef.current?.elements().remove()
      if (minimapRef.current) minimapRef.current.replaceChildren()
      return
    }

    const compStyle = getComputedStyle(document.documentElement)
    const ink = compStyle.getPropertyValue('--studio-ink').trim() || '#1c211d'
    const surface = compStyle.getPropertyValue('--studio-canvas').trim() || '#ffffff'
    const line = compStyle.getPropertyValue('--studio-seam').trim() || '#e2ddd2'
    const accent = compStyle.getPropertyValue('--studio-cypress').trim() || '#204936'
    const currentAtlas = atlasRef.current
    const ns = currentAtlas.node_size
    const lt = currentAtlas.link_thickness
    const blt = currentAtlas.branch_link_thickness
    const arrows = currentAtlas.arrows

    let cy = cyRef.current

    const initPosMap = initialGalaxyLayout(model, filteredVisible)

    if (!cy) {
      const elements: ElementDefinition[] = [
        ...[...filteredVisible].flatMap((id) => {
          const node = model.byId.get(id)
          if (!node) return []
          const cluster = clusterFor(model, id)
          const hiddenCount = (model.children.get(id) || []).filter((c) => !filteredVisible.has(c.id)).length
          const title = nodeTitle(node)
          const pos = positionCacheRef.current.get(id) || initPosMap.get(id) || { x: 0, y: 0 }
          return [
            {
              data: {
                id: node.id,
                label: title,
                displayLabel: title,
                cluster,
                hiddenCount,
                color: colors.get(cluster) || palette[0],
                type: node.type,
                frontier: node.frontier_state || '',
              },
              position: pos,
              classes: `type-${node.type} frontier-${node.frontier_state || 'none'} ${hiddenCount > 0 ? 'has-hidden' : ''} entering`,
            },
          ]
        }),
        ...model.edges
          .filter((edge) => filteredVisible.has(edge.source_id) && filteredVisible.has(edge.target_id))
          .map((edge) => ({
            data: {
              id: edgeElementId(edge),
              source: edge.source_id,
              target: edge.target_id,
              relation: edge.relation_type,
            },
            classes: `relation-${edge.relation_type} entering`,
          })),
      ]

      cy = cytoscape({
        container: canvasRef.current,
        elements,
        layout: { name: 'preset' },
        minZoom: 0.01,
        maxZoom: 50.0,
        wheelSensitivity: 0.85,
        boxSelectionEnabled: false,
        style: [
          {
            selector: 'node',
            style: {
              width: Math.max(14, 18 * ns),
              height: Math.max(14, 18 * ns),
              'background-color': 'data(color)',
              'border-color': surface,
              'border-width': 2.5,
              label: 'data(displayLabel)',
              color: ink,
              'font-family': 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, sans-serif',
              'font-size': Math.max(10, Math.round(11.5 * Math.sqrt(ns))),
              'font-weight': 500,
              'text-valign': 'bottom',
              'text-margin-y': Math.max(6, Math.round(7 * Math.sqrt(ns))),
              'text-background-color': surface,
              'text-background-opacity': 0.92,
              'text-background-padding': '4px',
              'text-background-shape': 'roundrectangle',
              'text-wrap': 'wrap',
              'text-max-width': '170px',
              'text-border-width': 1,
              'text-border-color': line,
              'text-border-opacity': 0.7,
              'text-opacity': 1,
              'transition-property':
                'background-color, border-color, border-width, opacity, width, height, overlay-opacity, overlay-padding',
              'transition-duration': '220ms',
              'transition-timing-function': 'ease-out',
            },
          },
          {
            selector: 'node[type = "leaf"]',
            style: {
              width: Math.max(11, 13 * ns),
              height: Math.max(11, 13 * ns),
              'border-width': 1.5,
              'font-size': Math.max(9, Math.round(10 * Math.sqrt(ns))),
              'font-weight': 400,
              'text-max-width': '150px',
            },
          },
          {
            selector: 'node[type = "branch"]',
            style: {
              width: Math.max(22, 26 * ns),
              height: Math.max(22, 26 * ns),
              'border-width': 3,
              'font-size': Math.max(11, Math.round(13 * Math.sqrt(ns))),
              'font-weight': 600,
              'text-max-width': '190px',
            },
          },
          {
            selector: 'node[type = "category"], node[type = "root"]',
            style: {
              width: Math.max(34, 38 * ns),
              height: Math.max(34, 38 * ns),
              'border-width': 3.5,
              'border-color': '#ffffff',
              'font-size': Math.max(13, Math.round(14.5 * Math.sqrt(ns))),
              'font-weight': 700,
              'text-max-width': '190px',
              'text-margin-y': Math.max(8, Math.round(10 * Math.sqrt(ns))),
              'text-background-opacity': 0.96,
              'text-border-width': 1.5,
              'text-opacity': 1,
            },
          },
          {
            selector: 'node[hiddenCount > 0]',
            style: { 'border-color': 'data(color)', 'border-width': 3.5, 'border-opacity': 0.5 },
          },
          {
            selector: 'node.frontier-unexplored, node.frontier-weak',
            style: { 'border-style': 'dashed', 'border-opacity': 0.72 },
          },
          {
            selector: 'node.frontier-deeper-study-ready',
            style: { 'border-color': accent, 'border-width': 4 },
          },
          {
            selector: 'node.frontier-saturated',
            style: { 'background-blacken': -0.12, 'border-opacity': 0.45 },
          },
          {
            selector: 'edge',
            style: {
              width: Math.max(1, 0.7 * lt),
              'line-color': mixColors(ink, line, 0.22),
              'curve-style': 'bezier',
              opacity: 0.45,
              'target-arrow-shape': 'none',
              'transition-property': 'line-color, opacity, width',
              'transition-duration': '280ms',
              'transition-timing-function': 'ease-out',
            },
          },
          {
            selector: 'edge[relation = "hierarchy"]',
            style: {
              width: Math.max(1.2, 0.85 * blt),
              opacity: 0.62,
              'line-color': mixColors(ink, line, 0.34),
              'target-arrow-shape': arrows ? 'triangle' : 'none',
              'target-arrow-color': mixColors(ink, line, 0.34),
              'arrow-scale': 0.7,
            },
          },
          {
            selector: 'edge[relation != "hierarchy"]',
            style: {
              width: Math.max(1.1, 0.8 * lt),
              'line-style': 'dashed',
              'line-dash-pattern': [5, 4],
              'line-color': accent,
              opacity: 0.65,
              'target-arrow-color': accent,
              'arrow-scale': 0.75,
            },
          },
          { selector: '.muted', style: { opacity: 0.2 } },
          { selector: '.hover-muted', style: { opacity: 0.16 } },
          { selector: '.entering', style: { opacity: 0 } },
          { selector: '.following', style: { opacity: 0.82 } },
          {
            selector: 'node.hover-neighbor',
            style: {
              'border-color': accent,
              'border-opacity': 0.72,
              'overlay-color': accent,
              'overlay-opacity': 0.12,
              'overlay-padding': 10,
            },
          },
          {
            selector: 'edge.hover-edge',
            style: {
              'line-color': accent,
              'target-arrow-color': accent,
              opacity: 0.92,
              width: Math.max(2, 1.2 * lt),
            },
          },
          {
            selector: 'node.hovered',
            style: {
              'border-color': accent,
              'border-width': 4,
              'overlay-color': accent,
              'overlay-opacity': 0.22,
              'overlay-padding': 16,
            },
          },
          {
            selector: '.drag-leader',
            style: { 'overlay-color': accent, 'overlay-opacity': 0.2, 'overlay-padding': 14 },
          },
          {
            selector: 'node:selected',
            style: {
              'border-color': accent,
              'border-width': 3.5,
              'overlay-color': accent,
              'overlay-opacity': 0.2,
              'overlay-padding': 10,
            },
          },
        ] as any,
      })

      cyRef.current = cy
      cy.fit(cy.elements(), cy.width() < 600 ? 88 : 72)
    } else {
      const currentNodes = new Set(cy.nodes().map((n) => n.id()))
      const toAdd: ElementDefinition[] = []

      for (const id of filteredVisible) {
        if (!currentNodes.has(id)) {
          const node = model.byId.get(id)
          if (!node) continue
          const cluster = clusterFor(model, id)
          const title = nodeTitle(node)
          const spawnPos =
            node.parent_id && cy.getElementById(node.parent_id).length
              ? (() => {
                  const pPos = cy.getElementById(node.parent_id).position()
                  const jitter = stableJitter(id, 28)
                  return reducedMotion || !atlasRef.current.animate
                    ? childPosition(model, id, pPos)
                    : { x: pPos.x + jitter.x, y: pPos.y + jitter.y }
                })()
              : positionCacheRef.current.get(id) || initPosMap.get(id) || stableJitter(id, 40)

          toAdd.push({
            data: {
              id: node.id,
              label: title,
              displayLabel: title,
              cluster,
              color: colors.get(cluster) || palette[0],
              type: node.type,
              frontier: node.frontier_state || '',
            },
            position: spawnPos,
            classes: `type-${node.type} frontier-${node.frontier_state || 'none'} entering`,
          })
        }
      }

      const toRemoveIds = [...currentNodes].filter((id) => !filteredVisible.has(id))

      if (toRemoveIds.length) {
        cy.remove(cy.nodes().filter((n) => toRemoveIds.includes(n.id())))
      }
      if (toAdd.length) {
        cy.add(toAdd)
      }

      const currentEdges = new Set(cy.edges().map((e) => e.id()))
      const edgesToAdd = model.edges
        .filter((e) => filteredVisible.has(e.source_id) && filteredVisible.has(e.target_id))
        .filter((e) => !currentEdges.has(edgeElementId(e)))
        .map((e) => ({
          data: {
            id: edgeElementId(e),
            source: e.source_id,
            target: e.target_id,
            relation: e.relation_type,
          },
          classes: `relation-${e.relation_type} entering`,
        }))

      if (edgesToAdd.length) {
        cy.add(edgesToAdd)
      }
    }

    cy.nodes().forEach((n) => {
      const hiddenCount = (model.children.get(n.id()) || []).filter((c) => !filteredVisible.has(c.id)).length
      n.data('hiddenCount', hiddenCount)
      if (hiddenCount > 0) n.addClass('has-hidden')
      else n.removeClass('has-hidden')
    })

    const entranceTimers: number[] = []
    const entering = cy.elements('.entering')
    if (entering.length) {
      if (reducedMotion || !atlasRef.current.animate) {
        entering.removeClass('entering')
      } else {
        const reveal = (selector: string, delay: number) => {
          entranceTimers.push(
            window.setTimeout(() => cy.elements(`${selector}.entering`).removeClass('entering'), delay),
          )
        }
        reveal('node[type = "category"], node[type = "root"]', 30)
        reveal('node[type = "branch"]', 110)
        reveal('node[type = "leaf"]', 190)
        reveal('edge', 260)
      }
    }

    const applyTextFade = () => {
      const zoom = cy.zoom()
      const logZoom = Math.log10(Math.max(zoom, 0.01))
      const opacity = Math.max(0.38, Math.min(1, (logZoom - atlasRef.current.text_fade_threshold + 0.4) / 0.7))
      const leafOpacity = Math.max(0, Math.min(opacity, (zoom - 0.48) / 0.42))
      const branchOpacity = Math.max(0.68, opacity)
      cy.nodes('[type = "leaf"]').style({
        'text-opacity': leafOpacity,
        'text-background-opacity': leafOpacity * 0.92,
        'text-border-opacity': leafOpacity * 0.7,
      })
      cy.nodes('[type = "branch"]').style({
        'min-zoomed-font-size': 11,
        'text-opacity': branchOpacity,
        'text-background-opacity': branchOpacity * 0.92,
        'text-border-opacity': branchOpacity * 0.7,
      })
      cy.nodes('[type = "category"], [type = "root"]').style({
        'font-size': Math.max(14.5 * Math.sqrt(atlasRef.current.node_size), 14 / Math.max(zoom, 0.01)),
        'text-max-width': Math.max(190, 190 / Math.max(zoom, 0.01)),
        'text-opacity': 1,
        'text-background-opacity': 0.96,
        'text-border-opacity': 0.7,
      })
    }

    const focusGraph = (id: string) => {
      cy.elements().removeClass('muted')
      if (!id || !atlasRef.current.focus_dimming) return
      const node = cy.getElementById(id)
      if (!node.length) return
      const neighborhood = node.neighborhood().nodes().union(node)
      cy.nodes().not(neighborhood).addClass('muted')
      cy.edges().not(node.connectedEdges()).addClass('muted')
    }

    applyTextFade()

    if (selectedIdRef.current && cy.getElementById(selectedIdRef.current).length) {
      cy.getElementById(selectedIdRef.current).select()
      focusGraph(selectedIdRef.current)
    }

    const select = (id: string) => {
      selectedIdRef.current = id
      setSelectedId(id)
      onSelectRef.current?.(id)
      focusGraph(id)
    }

    let minimapTimer = 0
    const drawMinimap = () => {
      if (!minimapRef.current || !cy) return
      while (minimapRef.current.firstChild) minimapRef.current.removeChild(minimapRef.current.firstChild)
      const extent = cy.elements().boundingBox({ includeLabels: false })
      const pad = 120
      const vb = `${extent.x1 - pad} ${extent.y1 - pad} ${extent.w + pad * 2} ${extent.h + pad * 2}`
      minimapRef.current.setAttribute('viewBox', vb)
      const minimapScale = Math.max(1, Math.max(extent.w, extent.h) / 105)

      cy.nodes().forEach((n) => {
        const p = n.position()
        const color = n.data('color') || palette[0]
        const isSelected = n.id() === selectedIdRef.current
        const circle = document.createElementNS(svgNs, 'circle')
        circle.setAttribute('cx', String(p.x))
        circle.setAttribute('cy', String(p.y))
        circle.setAttribute(
          'r',
          String(minimapScale * (isSelected ? 1.8 : n.data('type') === 'category' ? 1.35 : 0.72)),
        )
        circle.setAttribute('fill', color)
        circle.setAttribute('opacity', isSelected ? '1' : '0.85')
        minimapRef.current?.appendChild(circle)
      })

      const viewport = document.createElementNS(svgNs, 'rect')
      const zoom = cy.zoom()
      const pan = cy.pan()
      const topLeft = { x: -pan.x / zoom, y: -pan.y / zoom }
      const bottomRight = { x: (cy.width() - pan.x) / zoom, y: (cy.height() - pan.y) / zoom }
      viewport.setAttribute('x', String(topLeft.x))
      viewport.setAttribute('y', String(topLeft.y))
      viewport.setAttribute('width', String(bottomRight.x - topLeft.x))
      viewport.setAttribute('height', String(bottomRight.y - topLeft.y))
      viewport.setAttribute('class', 'atlas-minimap-viewport')
      viewport.style.strokeWidth = String(minimapScale * 0.75)
      minimapRef.current.appendChild(viewport)
    }

    type Particle = {
      id: string
      x: number
      y: number
      vx: number
      vy: number
      mass: number
      pinned: boolean
      halfWidth: number
      halfHeight: number
      labelOffsetY: number
    }
    const particles = new Map<string, Particle>()
    const particleBounds = (type: string, label: string) => {
      const scale = Math.sqrt(atlasRef.current.node_size)
      const isDomain = type === 'category' || type === 'root'
      const nodeRadius = (isDomain ? 23 : type === 'branch' ? 17 : 10) * scale
      const maxLabelWidth = (isDomain || type === 'branch' ? 190 : 150) * scale
      const rawLabelWidth = Math.max(36, label.length * (isDomain ? 7.5 : type === 'branch' ? 6.8 : 5.8) * scale)
      const labelWidth = Math.min(maxLabelWidth, rawLabelWidth)
      const lines = Math.max(1, Math.ceil(rawLabelWidth / maxLabelWidth))
      const labelHeight = lines * (isDomain ? 18 : type === 'branch' ? 16 : 14) * scale + 8
      const top = nodeRadius
      const bottom = nodeRadius + 8 + labelHeight
      return {
        halfWidth: Math.max(nodeRadius, labelWidth / 2 + 7),
        halfHeight: (top + bottom) / 2,
        labelOffsetY: (bottom - top) / 2,
      }
    }

    const syncParticles = () => {
      cy.nodes().forEach((n) => {
        const p = n.position()
        const isAnchor = ['root', 'category', 'branch'].includes(n.data('type'))
        const bounds = particleBounds(n.data('type'), n.data('label') || '')
        const existing = particles.get(n.id())
        if (existing) {
          existing.x = p.x
          existing.y = p.y
          Object.assign(existing, bounds)
        } else {
          particles.set(n.id(), {
            id: n.id(),
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            mass: isAnchor ? 3.5 : 1.0,
            pinned: false,
            ...bounds,
          })
        }
      })
      const cyNodeIds = new Set(cy.nodes().map((n) => n.id()))
      for (const id of particles.keys()) {
        if (!cyNodeIds.has(id)) particles.delete(id)
      }
    }
    syncParticles()

    let simAnimFrame = 0
    let hoverAnimFrame = 0
    let simAlpha = reducedMotion ? 0 : 1.0
    let draggedNodeId: string | null = null
    let hoveredNodeId: string | null = null
    let hoverStartedAt = 0
    let lastNodeTapId = ''
    let lastNodeTapAt = 0
    let lastDragPosition: Position | null = null
    let dragVelocity: Position = { x: 0, y: 0 }
    const dragOffsets = new Map<string, Position>()

    const moveDragGroup = () => {
      if (!draggedNodeId) return
      const leader = cy.getElementById(draggedNodeId)
      if (!leader.length) return
      const origin = leader.position()
      for (const [id, offset] of dragOffsets) {
        const particle = particles.get(id)
        if (!particle) continue
        if (id === draggedNodeId) {
          particle.x = origin.x
          particle.y = origin.y
          particle.vx = 0
          particle.vy = 0
          particle.pinned = true
          continue
        }
        const target = { x: origin.x + offset.x, y: origin.y + offset.y }
        particle.pinned = false
        particle.vx += (target.x - particle.x) * 0.16
        particle.vy += (target.y - particle.y) * 0.16
      }
    }

    const runPhysicsStep = () => {
      if (!particles.size || simAlpha < 0.008) {
        simAlpha = 0
        simAnimFrame = 0
        cy.nodes().forEach((n) => {
          positionCacheRef.current.set(n.id(), { ...n.position() })
        })
        drawMinimap()
        return
      }

      moveDragGroup()

      const partList = [...particles.values()]
      const count = partList.length
      const activeEdges = model.edges.filter(
        (edge) => filteredVisible.has(edge.source_id) && filteredVisible.has(edge.target_id),
      )

      const prefs = atlasRef.current
      const repelBase = 2200 * (prefs.repel_force / 20.0) * simAlpha
      const applyPairForces = (pA: Particle, pB: Particle) => {
        let dx = pB.x - pA.x
        let dy = pB.y - pA.y
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          const jitter = stableJitter(`${pA.id}:${pB.id}`, 6)
          dx = jitter.x
          dy = jitter.y
        }
        const distSq = dx * dx + dy * dy + 100
        const dist = Math.sqrt(distSq)
        const force = repelBase / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        if (!pA.pinned) {
          pA.vx -= fx / pA.mass
          pA.vy -= fy / pA.mass
        }
        if (!pB.pinned) {
          pB.vx += fx / pB.mass
          pB.vy += fy / pB.mass
        }

        const boxDx = pB.x - pA.x
        const boxDy = pB.y + pB.labelOffsetY - (pA.y + pA.labelOffsetY)
        const minX = pA.halfWidth + pB.halfWidth + 18
        const minY = pA.halfHeight + pB.halfHeight + 12
        const overlapX = minX - Math.abs(boxDx)
        const overlapY = minY - Math.abs(boxDy)
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX / minX < overlapY / minY) {
            const forceX = (boxDx >= 0 ? 1 : -1) * overlapX * 0.2 * simAlpha
            if (!pA.pinned) pA.vx -= forceX / pA.mass
            if (!pB.pinned) pB.vx += forceX / pB.mass
          } else {
            const forceY = (boxDy >= 0 ? 1 : -1) * overlapY * 0.22 * simAlpha
            if (!pA.pinned) pA.vy -= forceY / pA.mass
            if (!pB.pinned) pB.vy += forceY / pB.mass
          }
        }
      }

      if (count <= 320) {
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) applyPairForces(partList[i], partList[j])
        }
      } else {
        const cellSize = 420
        const cells = new Map<string, Array<{ particle: Particle; index: number }>>()
        partList.forEach((particle, index) => {
          const key = `${Math.floor(particle.x / cellSize)}:${Math.floor(particle.y / cellSize)}`
          cells.set(key, [...(cells.get(key) || []), { particle, index }])
        })
        partList.forEach((particle, index) => {
          const cellX = Math.floor(particle.x / cellSize)
          const cellY = Math.floor(particle.y / cellSize)
          for (let x = cellX - 1; x <= cellX + 1; x++) {
            for (let y = cellY - 1; y <= cellY + 1; y++) {
              for (const candidate of cells.get(`${x}:${y}`) || []) {
                if (candidate.index > index) applyPairForces(particle, candidate.particle)
              }
            }
          }
        })
      }

      const linkBase = 0.018 * prefs.link_force * simAlpha

      for (const edge of activeEdges) {
        const pA = particles.get(edge.source_id)
        const pB = particles.get(edge.target_id)
        if (!pA || !pB) continue
        const dx = pB.x - pA.x
        const dy = pB.y - pA.y
        const dist = Math.hypot(dx, dy) || 1
        const targetLen =
          (edge.relation_type === 'hierarchy' ? 120 : 160) + Math.min(50, (pA.halfWidth + pB.halfWidth) * 0.12)
        const delta = dist - targetLen
        const force = Math.max(-6, Math.min(6, delta * linkBase))
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

      const centerPull = 0.0014 * prefs.center_force * simAlpha
      for (const p of partList) {
        if (p.pinned) continue
        p.vx -= p.x * centerPull
        p.vy -= p.y * centerPull
      }

      const DAMPING = 0.86
      for (const p of partList) {
        if (p.pinned) continue
        p.vx *= DAMPING
        p.vy *= DAMPING
        p.vx = Math.max(-18, Math.min(18, p.vx))
        p.vy = Math.max(-18, Math.min(18, p.vy))
        p.x += p.vx
        p.y += p.vy
      }

      cy.batch(() => {
        for (const p of partList) {
          const ele = cy.getElementById(p.id)
          if (ele.length) ele.position({ x: p.x, y: p.y })
        }
      })

      if (draggedNodeId) {
        simAlpha = 1.0
      } else {
        simAlpha *= 0.955
      }

      simAnimFrame = requestAnimationFrame(runPhysicsStep)
    }

    const startSim = (alpha = 1.0) => {
      if (reducedMotion) return
      syncParticles()
      simAlpha = Math.max(simAlpha, alpha)
      if (!simAnimFrame) simAnimFrame = requestAnimationFrame(runPhysicsStep)
    }

    physicsSimRef.current = {
      start: startSim,
      stop: () => {
        simAlpha = 0
        cancelAnimationFrame(simAnimFrame)
        simAnimFrame = 0
      },
    }

    const runHoverPulse = () => {
      if (!hoveredNodeId) {
        hoverAnimFrame = 0
        return
      }
      const pulse = Math.sin((performance.now() - hoverStartedAt) / 165)
      cy.getElementById(hoveredNodeId).style('overlay-padding', 17 + pulse * 5)
      hoverAnimFrame = requestAnimationFrame(runHoverPulse)
    }

    cy.off('grab drag free dbltap tap zoom pan mouseover mouseout')

    cy.on('mouseover', 'node', (event) => {
      const node = event.target
      hoveredNodeId = node.id()
      hoverStartedAt = performance.now()
      cy.elements().removeClass('hover-muted hover-neighbor hover-edge')
      node.addClass('hovered')
      const neighbors = node.neighborhood('node')
      const connectedEdges = node.connectedEdges()
      neighbors.addClass('hover-neighbor')
      connectedEdges.addClass('hover-edge')
      cy.nodes().not(neighbors.union(node)).addClass('hover-muted')
      cy.edges().not(connectedEdges).addClass('hover-muted')
      if (!reducedMotion && !hoverAnimFrame) hoverAnimFrame = requestAnimationFrame(runHoverPulse)
    })
    cy.on('mouseout', 'node', (event) => {
      hoveredNodeId = null
      event.target.removeStyle('overlay-padding')
      event.target.removeClass('hovered')
      cy.elements().removeClass('hover-muted hover-neighbor hover-edge')
    })

    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      const now = performance.now()
      if (id === lastNodeTapId && now - lastNodeTapAt < 360) {
        lastNodeTapId = ''
        lastNodeTapAt = 0
        setVisible((current) => toggleSubtree(model, current, id))
        return
      }
      lastNodeTapId = id
      lastNodeTapAt = now
      select(id)
    })

    cy.on('grab', 'node', (event) => {
      const node = event.target
      draggedNodeId = node.id()
      const origin = node.position()
      lastDragPosition = { ...origin }
      dragVelocity = { x: 0, y: 0 }
      dragOffsets.clear()
      for (const id of branchSubtreeIds(model, node.id())) {
        const element = cy.getElementById(id)
        if (!element.length) continue
        const position = element.position()
        dragOffsets.set(id, { x: position.x - origin.x, y: position.y - origin.y })
        const particle = particles.get(id)
        if (particle) particle.pinned = id === node.id()
        if (id !== node.id()) element.addClass('following')
      }
      node.addClass('drag-leader')
      startSim(1.0)
    })
    cy.on('drag', 'node', (event) => {
      const position = event.target.position()
      if (lastDragPosition) {
        dragVelocity = {
          x: position.x - lastDragPosition.x,
          y: position.y - lastDragPosition.y,
        }
        for (const id of dragOffsets.keys()) {
          if (id === draggedNodeId) continue
          const particle = particles.get(id)
          const element = cy.getElementById(id)
          if (!particle || !element.length) continue
          const follow = element.data('type') === 'leaf' ? 0.74 : 0.84
          particle.x += dragVelocity.x * follow
          particle.y += dragVelocity.y * follow
          particle.vx += dragVelocity.x * 0.1
          particle.vy += dragVelocity.y * 0.1
        }
      }
      lastDragPosition = { ...position }
      moveDragGroup()
      startSim(1.0)
    })
    cy.on('free', 'node', (event) => {
      const node = event.target
      moveDragGroup()
      const releasedLeaderId = draggedNodeId
      for (const id of dragOffsets.keys()) {
        const element = cy.getElementById(id)
        const particle = particles.get(id)
        if (!element.length || !particle) continue
        const position = element.position()
        particle.pinned = false
        particle.x = position.x
        particle.y = position.y
        if (id === releasedLeaderId) {
          particle.vx = dragVelocity.x * 0.55
          particle.vy = dragVelocity.y * 0.55
        } else {
          particle.vx += dragVelocity.x * 0.18
          particle.vy += dragVelocity.y * 0.18
        }
        positionCacheRef.current.set(id, { ...position })
        element.removeClass('following')
      }
      draggedNodeId = null
      lastDragPosition = null
      dragOffsets.clear()
      node.removeClass('drag-leader')
      drawMinimap()
      startSim(0.95)
    })

    cy.on('dbltap', (event) => {
      if (event.target === cy) {
        viewport('fit')
      }
    })

    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedId('')
        onSelectRef.current?.(null)
        setIsolateId(null)
        cy.elements().removeClass('muted')
      }
    })

    cy.on('zoom pan', () => {
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`
      applyTextFade()
      clearTimeout(minimapTimer)
      minimapTimer = window.setTimeout(drawMinimap, 60)
    })

    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`
    drawMinimap()
    if (fitPendingRef.current) {
      fitPendingRef.current = false
      requestAnimationFrame(() => {
        cy.stop().animate(
          { fit: { eles: cy.elements(), padding: cy.width() < 600 ? 88 : 72 } },
          { duration: reducedMotion || !atlasRef.current.animate ? 0 : 440, easing: 'ease-out-cubic' },
        )
      })
    }

    return () => {
      cancelAnimationFrame(simAnimFrame)
      cancelAnimationFrame(hoverAnimFrame)
      clearTimeout(minimapTimer)
      entranceTimers.forEach(clearTimeout)
    }
  }, [model, filteredVisible, colors, themeTick, reducedMotion, viewport])

  useEffect(() => {
    const cy = cyRef.current
    const container = canvasRef.current
    if (!cy || !container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      cy.resize()
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`
      cy.emit('pan')
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [raw])

  useEffect(
    () => () => {
      physicsSimRef.current?.stop()
      cyRef.current?.destroy()
      cyRef.current = null
    },
    [],
  )

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
        width: Math.max(14, 18 * ns),
        height: Math.max(14, 18 * ns),
        'font-size': Math.max(10, Math.round(11.5 * Math.sqrt(ns))),
        color: ink,
        'border-color': surface,
        'text-background-color': surface,
        'text-border-color': line,
      })
      .selector('node[type = "leaf"]')
      .style({
        width: Math.max(11, 13 * ns),
        height: Math.max(11, 13 * ns),
        'font-size': Math.max(9, Math.round(10 * Math.sqrt(ns))),
      })
      .selector('node[type = "branch"]')
      .style({
        width: Math.max(22, 26 * ns),
        height: Math.max(22, 26 * ns),
        'font-size': Math.max(11, Math.round(13 * Math.sqrt(ns))),
      })
      .selector('node[type = "category"], node[type = "root"]')
      .style({
        width: Math.max(34, 38 * ns),
        height: Math.max(34, 38 * ns),
        'font-size': Math.max(13, Math.round(14.5 * Math.sqrt(ns))),
      })
      .selector('edge')
      .style({
        width: Math.max(1, 0.7 * lt),
        'line-color': mixColors(ink, line, 0.22),
      })
      .selector('edge[relation = "hierarchy"]')
      .style({
        width: Math.max(1.2, 0.85 * blt),
        'line-color': mixColors(ink, line, 0.34),
        'target-arrow-shape': arrows ? 'triangle' : 'none',
        'target-arrow-color': mixColors(ink, line, 0.34),
      })
      .selector('edge[relation != "hierarchy"]')
      .style({
        width: Math.max(1.1, 0.8 * lt),
        'line-color': accent,
        'target-arrow-color': accent,
      })
      .selector('edge.hover-edge')
      .style({
        width: Math.max(2, 1.2 * lt),
        'line-color': accent,
        'target-arrow-color': accent,
      })
      .selector('node.hovered, node.hover-neighbor, node:selected')
      .style({ 'border-color': accent, 'overlay-color': accent })
      .update()

    const zoom = cy.zoom()
    const logZoom = Math.log10(Math.max(zoom, 0.01))
    const textOpacity = Math.max(0.38, Math.min(1, (logZoom - atlas.text_fade_threshold + 0.4) / 0.7))
    const leafOpacity = Math.max(0, Math.min(textOpacity, (zoom - 0.48) / 0.42))
    cy.nodes('[type = "leaf"]').style({
      'text-opacity': leafOpacity,
      'text-background-opacity': leafOpacity * 0.92,
      'text-border-opacity': leafOpacity * 0.7,
    })
    cy.nodes('[type = "branch"]').style({
      'text-opacity': Math.max(0.68, textOpacity),
      'text-background-opacity': 0.92,
      'text-border-opacity': 0.7,
    })
    cy.nodes('[type = "category"], [type = "root"]').style({
      'font-size': Math.max(14.5 * Math.sqrt(ns), 14 / Math.max(zoom, 0.01)),
      'text-max-width': Math.max(190, 190 / Math.max(zoom, 0.01)),
      'text-opacity': 1,
      'text-background-opacity': 0.96,
      'text-border-opacity': 0.7,
    })
  }, [atlas, reducedMotion, themeTick])

  useEffect(() => {
    selectedIdRef.current = selectedId
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('muted')
    if (selectedId && cy.getElementById(selectedId).length) {
      const node = cy.getElementById(selectedId)
      node.select()
      if (atlas.focus_dimming) {
        const neighborhood = node.neighborhood().nodes().union(node)
        cy.nodes().not(neighborhood).addClass('muted')
        cy.edges().not(node.connectedEdges()).addClass('muted')
      }
    } else {
      cy.elements().unselect()
    }
  }, [selectedId, atlas.focus_dimming])

  useEffect(() => {
    if (selectedId && !filteredVisible.has(selectedId)) {
      selectedIdRef.current = ''
      setSelectedId('')
    }
  }, [filteredVisible, selectedId])

  const saveTimeoutRef = useRef<number | null>(null)
  const pendingAtlasPatchRef = useRef<Partial<AtlasPrefs>>({})

  const focusNode = useCallback(
    (id: string, clearFilters = false) => {
      if (!model.byId.has(id)) return
      if (clearFilters) {
        setBranchFocus('all')
        setClusterFilter('all')
        setFrontierFilter('all')
        setIsolateId(null)
      }
      setVisible((current) => {
        const next = new Set(current)
        for (const node of nodeAncestry(model, id)) next.add(node.id)
        next.add(id)
        return next
      })
      selectedIdRef.current = id
      setSelectedId(id)
      onSelectRef.current?.(id)
      setQuery('')
      requestAnimationFrame(() => {
        const node = cyRef.current?.getElementById(id)
        if (node?.length)
          cyRef.current?.animate(
            { center: { eles: node }, zoom: Math.max(cyRef.current.zoom(), 1.2) },
            { duration: reducedMotion ? 0 : 420, easing: 'ease-out-cubic' },
          )
      })
    },
    [model, reducedMotion],
  )

  useEffect(() => {
    if (!initialSelectedId || !model.byId.has(initialSelectedId) || selectedIdRef.current === initialSelectedId) return
    focusNode(initialSelectedId, true)
  }, [focusNode, initialSelectedId, model])

  const updateAtlas = (patch: Partial<AtlasPrefs>) => {
    const next = { ...atlasRef.current, ...patch }
    atlasRef.current = next
    setAtlas(next)
    setSettingsStatus('Saving map preferences…')
    pendingAtlasPatchRef.current = { ...pendingAtlasPatchRef.current, ...patch }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      const pending = pendingAtlasPatchRef.current
      pendingAtlasPatchRef.current = {}
      saveTimeoutRef.current = null
      api('/settings/atlas', { method: 'PUT', body: JSON.stringify(pending) })
        .then(() => setSettingsStatus('Map preferences saved.'))
        .catch(() => setSettingsStatus('Map preferences were not saved. Try again.'))
    }, 400)
  }

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (Object.keys(pendingAtlasPatchRef.current).length) {
        api('/settings/atlas', { method: 'PUT', body: JSON.stringify(pendingAtlasPatchRef.current) }).catch(() => {})
      }
    },
    [],
  )

  const resetAtlas = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = null
    pendingAtlasPatchRef.current = {}
    positionCacheRef.current.clear()
    atlasRef.current = ATLAS_DEFAULTS
    setAtlas(ATLAS_DEFAULTS)
    setSettingsStatus('Restoring map defaults…')
    api('/settings/atlas', { method: 'PUT', body: JSON.stringify(ATLAS_DEFAULTS) })
      .then(() => setSettingsStatus('Map defaults restored.'))
      .catch(() => setSettingsStatus('Map defaults were not saved. Try again.'))
    if (cyRef.current) viewport('fit')
  }

  const exportPng = () => {
    const cy = cyRef.current
    if (!cy) return
    const compStyle = getComputedStyle(document.documentElement)
    const bg = compStyle.getPropertyValue('--studio-canvas').trim() || '#ffffff'
    const png = cy.png({ full: true, scale: 2, bg })
    const link = document.createElement('a')
    link.href = png
    link.download = `atlas-knowledge-map-${new Date().toISOString().slice(0, 10)}.png`
    link.click()
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const activeTag = (target?.tagName || '').toLowerCase()
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target?.isContentEditable ||
        ['input', 'textarea', 'select', 'button', 'a'].includes(activeTag)
      )
        return

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
        onSelectRef.current?.(null)
        setIsolateId(null)
        setShowControls(false)
        setShowListDrawer(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewport])

  const handleCanvasKeyDown = (event: KeyboardEvent) => {
    const ids = [...filteredVisible]
    if (!ids.length) return
    const current = Math.max(0, ids.indexOf(selectedIdRef.current))
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? ids.length - 1
            : event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? (current + 1) % ids.length
              : (current - 1 + ids.length) % ids.length
      focusNode(ids[next])
    } else if (event.key === 'Enter' && selectedIdRef.current) {
      event.preventDefault()
      setVisible((currentVisible) => toggleSubtree(model, currentVisible, selectedIdRef.current))
    }
  }

  const focusBranch = (id: string) => {
    fitPendingRef.current = true
    setBranchFocus(id)
    setClusterFilter('all')
    setIsolateId(null)
    setSelectedId(id === 'all' ? '' : id)
    onSelectRef.current?.(id === 'all' ? null : id)
    setVisible(id === 'all' ? visibleIdsForDepth(model, depth) : branchSubtreeIds(model, id))
  }

  const focusDomain = (name: string) => {
    fitPendingRef.current = true
    setBranchFocus('all')
    setIsolateId(null)
    setSelectedId('')
    onSelectRef.current?.(null)
    setFrontierFilter('all')
    setClusterFilter(name)
    setVisible(visibleIdsForDepth(model, depth))
  }

  const changeDepth = (value: 'branches' | 'core' | 'all') => {
    fitPendingRef.current = true
    setDepth(value)
    setBranchFocus('all')
    setClusterFilter('all')
    setIsolateId(null)
    setSelectedId('')
    onSelectRef.current?.(null)
    setVisible(visibleIdsForDepth(model, value))
  }

  const expandAll = () => {
    fitPendingRef.current = true
    setDepth('all')
    setIsolateId(null)
    setVisible(new Set(model.nodes.map((n) => n.id)))
  }

  const collapseAll = () => {
    fitPendingRef.current = true
    setDepth('branches')
    setIsolateId(null)
    setSelectedId('')
    onSelectRef.current?.(null)
    setVisible(initialVisibleIds(model))
  }

  const clearMapFilters = () => {
    setBranchFocus('all')
    setClusterFilter('all')
    setFrontierFilter('all')
    setIsolateId(null)
    setSelectedId('')
    setVisible(visibleIdsForDepth(model, depth))
  }

  const toggleFullscreen = () => {
    const el = canvasRef.current?.closest('.atlas') as HTMLElement | null
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    } else {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {})
    }
  }

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const centerFromMinimap = (event: MouseEvent) => {
    const cy = cyRef.current
    const svg = minimapRef.current
    const matrix = svg?.getScreenCTM()
    if (!cy || !svg || !matrix) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    cy.animate(
      {
        pan: {
          x: cy.width() / 2 - point.x * cy.zoom(),
          y: cy.height() / 2 - point.y * cy.zoom(),
        },
      },
      { duration: reducedMotion ? 0 : 220, easing: 'ease-out-cubic' },
    )
  }

  const tabs = ['filters', 'display', 'physics'] as const
  const moveTab = (event: KeyboardEvent, current: typeof activeTab) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const offset = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(tabs.indexOf(current) + offset + tabs.length) % tabs.length]
    setActiveTab(next)
    requestAnimationFrame(() => document.getElementById(`atlas-tab-${next}`)?.focus())
  }

  if (error)
    return (
      <div class="error-state">
        <strong>Couldn’t load the Atlas.</strong>
        <span>{error}</span>
        <button type="button" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    )
  if (!raw)
    return (
      <div class="atlas-loading">
        <div />
        <span>Mapping knowledge clusters…</span>
      </div>
    )
  if (!model.nodes.length)
    return (
      <div class="empty-state atlas-empty-state">
        <h1 class="visually-hidden">Atlas</h1>
        <span class="empty-rule" />
        <h2>The Atlas has no mapped nodes</h2>
        <p>Processed notes and branch changes will form your first constellation.</p>
      </div>
    )

  return (
    <div
      class={`atlas atlas-canvas-view ${isFullscreen ? 'atlas-fullscreen' : ''} ${atlas.animate && !reducedMotion ? 'atlas-motion' : ''}`}
    >
      <h1 class="visually-hidden">Atlas</h1>
      <nav class="atlas-domain-navigation" aria-label="Explore knowledge domains">
        <label>
          Explore a domain
          <select
            aria-label="Explore a domain"
            aria-describedby="atlas-label-guidance"
            value={clusterFilter}
            onChange={(event) => focusDomain(event.currentTarget.value)}
          >
            <option value="all">Whole map</option>
            {[...model.clusters.keys()].sort().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span id="atlas-label-guidance">Choose a domain or zoom in to read branches.</span>
        {clusterFilter !== 'all' && (
          <button type="button" class="button secondary" onClick={() => focusDomain('all')}>
            Whole map
          </button>
        )}
      </nav>
      <div class="atlas-stage">
        <div class="atlas-canvas-shell">
          <div class="atlas-floating-bar" aria-label="Atlas controls and depth">
            <button
              type="button"
              class={`atlas-controls-trigger ${showControls ? 'active' : ''}`}
              onClick={() => {
                setShowControls((value) => {
                  if (!value) setShowListDrawer(false)
                  return !value
                })
              }}
              aria-expanded={showControls}
              aria-controls="atlas-control-center"
              title="Open map controls, appearance &amp; physics settings"
            >
              {svgIcon('m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z')}
              <span>Map settings</span>
            </button>

            <div class="atlas-quick-depth" role="radiogroup" aria-label="Map depth level">
              <button
                type="button"
                class={`atlas-depth-pill ${depth === 'branches' ? 'active' : ''}`}
                onClick={() => changeDepth('branches')}
                role="radio"
                aria-checked={depth === 'branches'}
                title="Show domain hubs and main branches"
              >
                Branches
              </button>
              <button
                type="button"
                class={`atlas-depth-pill ${depth === 'core' ? 'active' : ''}`}
                onClick={() => changeDepth('core')}
                role="radio"
                aria-checked={depth === 'core'}
                title="Show branches and core topics"
              >
                Core
              </button>
              <button
                type="button"
                class={`atlas-depth-pill ${depth === 'all' ? 'active' : ''}`}
                onClick={() => changeDepth('all')}
                role="radio"
                aria-checked={depth === 'all'}
                title="Show all detailed topics and leaves"
              >
                All
              </button>
            </div>
          </div>

          {selected && ancestry.length > 0 && (
            <nav class="atlas-breadcrumbs" aria-label="Selected path">
              {ancestry.map((node, idx) => (
                <span key={node.id} class="atlas-breadcrumb-item">
                  {idx > 0 && <span class="atlas-breadcrumb-sep">/</span>}
                  <button
                    type="button"
                    class={`atlas-breadcrumb-btn ${node.id === selectedId ? 'active' : ''}`}
                    onClick={() => focusNode(node.id)}
                    title={`Jump to ${nodeTitle(node)}`}
                  >
                    <span class="atlas-breadcrumb-badge">{nodeTypeBadge(node)}</span>
                    <span class="atlas-breadcrumb-title">{nodeTitle(node)}</span>
                  </button>
                </span>
              ))}
              <span class="atlas-breadcrumb-item">
                <span class="atlas-breadcrumb-sep">/</span>
                <button
                  type="button"
                  class={`atlas-breadcrumb-btn atlas-focus-neighborhood ${isolateId ? 'active' : ''}`}
                  onClick={() => {
                    fitPendingRef.current = true
                    setIsolateId((current) => (current ? null : selectedId))
                  }}
                  aria-pressed={Boolean(isolateId)}
                >
                  {isolateId ? 'Show whole map' : 'Focus neighborhood'}
                </button>
              </span>
              {selectedBranch && (
                <a class="atlas-breadcrumb-btn" href={`#/map/branch/${encodeURIComponent(selectedBranch.id)}`}>
                  Open {nodeTitle(selectedBranch)}
                </a>
              )}
            </nav>
          )}

          {showControls && (
            <aside
              id="atlas-control-center"
              class="atlas-controls-panel"
              aria-label="Map filters, appearance, and forces"
            >
              <div class="atlas-controls-panel-head">
                <h3>Graph Control Center</h3>
                <button
                  type="button"
                  class="icon-button"
                  onClick={() => setShowControls(false)}
                  aria-label="Close controls"
                >
                  ×
                </button>
              </div>

              <div class="atlas-tabs" role="tablist">
                <button
                  type="button"
                  class={`atlas-tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
                  id="atlas-tab-filters"
                  onClick={() => setActiveTab('filters')}
                  onKeyDown={(event) => moveTab(event, 'filters')}
                  role="tab"
                  aria-selected={activeTab === 'filters'}
                  aria-controls="atlas-panel-filters"
                  tabIndex={activeTab === 'filters' ? 0 : -1}
                >
                  Filters
                </button>
                <button
                  type="button"
                  class={`atlas-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
                  id="atlas-tab-display"
                  onClick={() => setActiveTab('display')}
                  onKeyDown={(event) => moveTab(event, 'display')}
                  role="tab"
                  aria-selected={activeTab === 'display'}
                  aria-controls="atlas-panel-display"
                  tabIndex={activeTab === 'display' ? 0 : -1}
                >
                  Display
                </button>
                <button
                  type="button"
                  class={`atlas-tab-btn ${activeTab === 'physics' ? 'active' : ''}`}
                  id="atlas-tab-physics"
                  onClick={() => setActiveTab('physics')}
                  onKeyDown={(event) => moveTab(event, 'physics')}
                  role="tab"
                  aria-selected={activeTab === 'physics'}
                  aria-controls="atlas-panel-physics"
                  tabIndex={activeTab === 'physics' ? 0 : -1}
                >
                  Forces
                </button>
              </div>

              <div class="atlas-controls-panel-body">
                {activeTab === 'filters' && (
                  <div
                    id="atlas-panel-filters"
                    role="tabpanel"
                    aria-labelledby="atlas-tab-filters"
                    class="atlas-tab-panel"
                  >
                    <div class="atlas-panel-field">
                      <label class="atlas-field-label" for="atlas-node-search">
                        Search nodes
                      </label>
                      <div class="atlas-search">
                        <span>{svgIcon('m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z')}</span>
                        <input
                          aria-label="Search Atlas"
                          id="atlas-node-search"
                          value={query}
                          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
                          placeholder="Type to filter or highlight…"
                        />
                        {query && (
                          <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                            ×
                          </button>
                        )}
                        {searchResults.length > 0 && (
                          <div class="atlas-search-results">
                            {searchResults.map((node) => (
                              <button
                                type="button"
                                key={node.id}
                                onClick={() => {
                                  focusNode(node.id, true)
                                  setShowControls(false)
                                }}
                              >
                                <span>{nodeTypeBadge(node)}</span>
                                <strong>{nodeTitle(node)}</strong>
                                <small>{clusterFor(model, node.id)}</small>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div class="atlas-panel-field">
                      <label class="atlas-field-label">Focus Knowledge Branch</label>
                      <select
                        class="atlas-panel-select"
                        aria-label="Focus branch"
                        value={branchFocus}
                        onChange={(event) => focusBranch((event.target as HTMLSelectElement).value)}
                      >
                        <option value="all">All branches</option>
                        {[...branchGroups].map(([domain, nodes]) => (
                          <optgroup key={domain} label={domain}>
                            {nodes.map((node) => (
                              <option key={node.id} value={node.id}>
                                {nodeTitle(node)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div class="atlas-panel-field">
                      <label class="atlas-field-label">Knowledge Domain</label>
                      <select
                        class="atlas-panel-select"
                        aria-label="Filter by domain"
                        value={clusterFilter}
                        onChange={(event) => {
                          setBranchFocus('all')
                          setIsolateId(null)
                          setSelectedId('')
                          setClusterFilter((event.target as HTMLSelectElement).value)
                        }}
                      >
                        <option value="all">All domains</option>
                        {[...model.clusters.keys()].sort().map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div class="atlas-panel-field">
                      <label class="atlas-field-label">Knowledge Frontier</label>
                      <select
                        class="atlas-panel-select"
                        aria-label="Filter by knowledge frontier"
                        value={frontierFilter}
                        onChange={(event) => {
                          setIsolateId(null)
                          setSelectedId('')
                          setFrontierFilter((event.target as HTMLSelectElement).value as FrontierState | 'all')
                        }}
                      >
                        <option value="all">All frontier states</option>
                        {(Object.keys(frontierLabels) as FrontierState[]).map((state) => (
                          <option key={state} value={state}>
                            {frontierLabels[state]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div class="atlas-quick-row">
                      <button
                        type="button"
                        class="atlas-quick-btn"
                        onClick={collapseAll}
                        title="Collapse all leaves to branches"
                      >
                        Collapse all
                      </button>
                      <button
                        type="button"
                        class="atlas-quick-btn"
                        onClick={expandAll}
                        title="Expand all leaves across map"
                      >
                        Expand all
                      </button>
                    </div>

                    <button
                      type="button"
                      class={`atlas-panel-btn ${showListDrawer ? 'active' : ''}`}
                      onClick={() => {
                        setShowListDrawer((v) => !v)
                        setShowControls(false)
                      }}
                    >
                      {svgIcon('M4 6h16M4 12h16M4 18h16')}
                      <span>Browse visible list ({filteredVisible.size})</span>
                    </button>
                  </div>
                )}

                {activeTab === 'display' && (
                  <div
                    id="atlas-panel-display"
                    role="tabpanel"
                    aria-labelledby="atlas-tab-display"
                    class="atlas-tab-panel"
                  >
                    <div class="setting-row">
                      <div>
                        <strong>Dim unrelated nodes on focus</strong>
                        <span>Fade out other nodes when selecting or hovering (off keeps everything visible).</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={atlas.focus_dimming}
                        onChange={(event) => updateAtlas({ focus_dimming: (event.target as HTMLInputElement).checked })}
                        aria-label="Dim unrelated nodes on focus"
                      />
                    </div>

                    <div class="setting-row">
                      <div>
                        <strong>Show link arrows</strong>
                        <span>Direction arrows on relation lines.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={atlas.arrows}
                        onChange={(event) => updateAtlas({ arrows: (event.target as HTMLInputElement).checked })}
                        aria-label="Show link arrows"
                      />
                    </div>

                    <div class="setting-row">
                      <div>
                        <strong>Smooth animations</strong>
                        <span>Camera transitions and force simulation motion.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={atlas.animate}
                        onChange={(event) => updateAtlas({ animate: (event.target as HTMLInputElement).checked })}
                        aria-label="Smooth animations"
                      />
                    </div>

                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Node scale</strong>
                        <output>{atlas.node_size.toFixed(2)}×</output>
                      </span>
                      <small>Relative size of all graph nodes.</small>
                      <input
                        type="range"
                        min={0.3}
                        max={3.0}
                        step={0.05}
                        value={atlas.node_size}
                        onInput={(event) =>
                          updateAtlas({ node_size: Number((event.target as HTMLInputElement).value) })
                        }
                      />
                    </label>

                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Text fade zoom</strong>
                        <output>{atlas.text_fade_threshold.toFixed(2)}</output>
                      </span>
                      <small>Fade labels as you zoom out to reduce clutter.</small>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.05}
                        value={atlas.text_fade_threshold}
                        onInput={(event) =>
                          updateAtlas({ text_fade_threshold: Number((event.target as HTMLInputElement).value) })
                        }
                      />
                    </label>

                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Link thickness</strong>
                        <output>{atlas.link_thickness.toFixed(2)}×</output>
                      </span>
                      <small>Thickness of evidence and topic links.</small>
                      <input
                        type="range"
                        min={0.3}
                        max={5}
                        step={0.1}
                        value={atlas.link_thickness}
                        onInput={(event) =>
                          updateAtlas({ link_thickness: Number((event.target as HTMLInputElement).value) })
                        }
                      />
                    </label>

                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Branch hierarchy line</strong>
                        <output>{atlas.branch_link_thickness.toFixed(2)}×</output>
                      </span>
                      <small>Thickness of lines connecting parent branches.</small>
                      <input
                        type="range"
                        min={0.3}
                        max={5}
                        step={0.1}
                        value={atlas.branch_link_thickness}
                        onInput={(event) =>
                          updateAtlas({ branch_link_thickness: Number((event.target as HTMLInputElement).value) })
                        }
                      />
                    </label>
                  </div>
                )}

                {activeTab === 'physics' && (
                  <div
                    id="atlas-panel-physics"
                    role="tabpanel"
                    aria-labelledby="atlas-tab-physics"
                    class="atlas-tab-panel"
                  >
                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Repel force (Charge)</strong>
                        <output>{atlas.repel_force.toFixed(1)}</output>
                      </span>
                      <small>How strongly adjacent nodes push apart.</small>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={0.5}
                        value={atlas.repel_force}
                        onInput={(event) => {
                          updateAtlas({ repel_force: Number((event.target as HTMLInputElement).value) })
                          if (physicsSimRef.current) physicsSimRef.current.start(0.9)
                        }}
                      />
                    </label>

                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Center attraction force</strong>
                        <output>{atlas.center_force.toFixed(2)}</output>
                      </span>
                      <small>Pull of outer clusters toward graph center.</small>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={atlas.center_force}
                        onInput={(event) => {
                          updateAtlas({ center_force: Number((event.target as HTMLInputElement).value) })
                          if (physicsSimRef.current) physicsSimRef.current.start(0.9)
                        }}
                      />
                    </label>

                    <label class="type-range">
                      <span class="type-range-label">
                        <strong>Link spring force</strong>
                        <output>{atlas.link_force.toFixed(2)}</output>
                      </span>
                      <small>Spring tension connecting linked nodes.</small>
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={0.05}
                        value={atlas.link_force}
                        onInput={(event) => {
                          updateAtlas({ link_force: Number((event.target as HTMLInputElement).value) })
                          if (physicsSimRef.current) physicsSimRef.current.start(0.9)
                        }}
                      />
                    </label>

                    <button type="button" class="atlas-style-reset" onClick={resetAtlas}>
                      Reset physics &amp; display defaults
                    </button>
                  </div>
                )}

                <div class="atlas-control-stats">
                  <span>
                    <strong>{filteredVisible.size}</strong> in view
                  </span>
                  <span class="sep">·</span>
                  <span>
                    <strong>{model.nodes.length}</strong> total nodes
                  </span>
                  <span class="sep">·</span>
                  <span>
                    <strong>{model.edges.length}</strong> links
                  </span>
                </div>
                {settingsStatus && (
                  <div class="atlas-settings-status" role="status">
                    {settingsStatus}
                  </div>
                )}
              </div>
            </aside>
          )}

          <div
            ref={canvasRef}
            class="atlas-canvas"
            role="region"
            tabIndex={0}
            onKeyDown={handleCanvasKeyDown}
            aria-describedby="atlas-canvas-instructions"
            aria-label="Interactive visual knowledge map"
          />
          <p id="atlas-canvas-instructions" class="visually-hidden">
            Tap a node to select it and double-tap to expand or collapse it. With the map focused, use arrow keys to
            move through visible nodes and Enter to expand or collapse the selected node. Drag to pan or scroll to zoom.
          </p>

          {!filteredVisible.size && (
            <div class="atlas-filter-empty" role="status">
              <strong>No nodes match these filters</strong>
              <span>Clear the domain and frontier filters to restore the map.</span>
              <button type="button" onClick={clearMapFilters}>
                Clear filters
              </button>
            </div>
          )}

          {showListDrawer && (
            <aside id="atlas-node-drawer" class="atlas-node-drawer" aria-label="Visible Atlas nodes">
              <div class="atlas-drawer-header">
                <h3>
                  Nodes in view <span>({filteredVisible.size})</span>
                </h3>
                <button
                  type="button"
                  class="icon-button"
                  onClick={() => setShowListDrawer(false)}
                  aria-label="Close node list"
                >
                  ×
                </button>
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
                        <span class="atlas-node-badge">{nodeTypeBadge(node)}</span>
                        <strong class="atlas-node-title">{nodeTitle(node)}</strong>
                        <small class="atlas-node-cluster">
                          {clusterFor(model, id)}
                          {node.frontier_state ? ` · ${frontierLabels[node.frontier_state]}` : ''}
                        </small>
                      </button>
                    </div>
                  )
                })}
              </div>
            </aside>
          )}

          <div class="atlas-legend-card" aria-label="Knowledge domain clusters">
            {[...colors].slice(0, 7).map(([name, color]) => (
              <span key={name} class="atlas-legend-item">
                <i style={{ background: color, boxShadow: `0 0 6px ${color}66` }} aria-hidden="true" />
                {name}
              </span>
            ))}
          </div>

          <button
            type="button"
            class="atlas-minimap"
            aria-label="Recenter map from overview"
            onClick={centerFromMinimap}
          >
            <span class="atlas-minimap-label">Minimap</span>
            <svg ref={minimapRef} aria-hidden="true" />
          </button>

          <div class="atlas-zoom-controls" aria-label="Map zoom and export controls">
            <button type="button" onClick={() => viewport('in')} aria-label="Zoom in" title="Zoom in (+)">
              +
            </button>
            <button type="button" onClick={() => viewport('out')} aria-label="Zoom out" title="Zoom out (−)">
              −
            </button>
            <button
              type="button"
              onClick={() => viewport('fit')}
              aria-label="Fit graph to view"
              title="Fit to view (0 / F)"
            >
              {svgIcon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')}
            </button>
            <button type="button" onClick={exportPng} aria-label="Export map image as PNG" title="Export PNG image">
              {svgIcon('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12')}
            </button>
            <button
              type="button"
              class="atlas-fullscreen-btn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen
                ? svgIcon('M4 14h6v6M14 10h6V4M20 14h-6v6M10 4H4v6')
                : svgIcon('M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7')}
            </button>
            <span ref={zoomLabelRef} class="atlas-zoom-percentage">
              100%
            </span>
          </div>

          <div class="visually-hidden" aria-live="polite">
            {selected ? `Selected ${nodeTitle(selected)}.` : 'No Atlas node selected.'}
          </div>
        </div>
      </div>
    </div>
  )
}
