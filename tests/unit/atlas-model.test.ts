import assert from 'node:assert/strict'
import test from 'node:test'
import {
  branchConstellations,
  branchSubtreeIds,
  createAtlasModel,
  expandVisibleIds,
  initialVisibleIds,
  isSubtreeVisible,
  isolatedVisibleIds,
  nodeAncestry,
  nodeTitle,
  nodeTypeBadge,
  rootBranchFor,
  toggleSubtree,
  visibleIdsForDepth,
  visibleIdsForFrontier,
} from '../../client/src/features/atlas/model.ts'

test('atlas model removes dangling and duplicate edges', () => {
  const nodes = [
    { id: 'a', label: 'A', type: 'branch', super_category: 'Mind' },
    { id: 'b', label: 'B', type: 'leaf', parent_id: 'a' },
  ]
  const edges = [
    { source_id: 'a', target_id: 'b', relation_type: 'hierarchy' },
    { source_id: 'a', target_id: 'b', relation_type: 'hierarchy' },
    { source_id: 'a', target_id: 'missing', relation_type: 'evidence' },
  ]
  const model = createAtlasModel(nodes, edges)
  assert.equal(model.edges.length, 1)
  assert.deepEqual([...model.adjacency.get('a')!], ['b'])
  assert.equal(model.children.get('a')?.[0].id, 'b')
})

test('atlas hides the private Mahmoud taste-map root and its links', () => {
  const model = createAtlasModel(
    [
      { id: 'taste-map', label: "Mahmoud's Taste Map", type: 'root' },
      { id: 'branch', label: 'Writing', type: 'branch', parent_id: 'taste-map' },
    ],
    [{ source_id: 'taste-map', target_id: 'branch', relation_type: 'hierarchy' }],
  )
  assert.equal(model.byId.has('taste-map'), false)
  assert.deepEqual(
    model.nodes.map((node) => node.id),
    ['branch'],
  )
  assert.equal(model.edges.length, 0)
})

test('atlas hides archived nodes, their descendants, and connected edges', () => {
  const model = createAtlasModel(
    [
      { id: 'cat-tools', label: 'Systems & Craft', type: 'category', status: 'active' },
      { id: 'linux', label: 'Linux & Automation', type: 'branch', parent_id: 'cat-tools', status: 'pruned' },
      { id: 'shell', label: 'Shell automation', type: 'leaf', parent_id: 'linux', status: 'love' },
      { id: 'scripts', label: 'Reliable scripts', type: 'leaf', parent_id: 'shell', status: 'love' },
      { id: 'paused', label: 'Paused branch', type: 'branch', parent_id: 'cat-tools', status: 'held' },
    ],
    [
      { source_id: 'cat-tools', target_id: 'linux', relation_type: 'hierarchy' },
      { source_id: 'linux', target_id: 'shell', relation_type: 'hierarchy' },
      { source_id: 'shell', target_id: 'paused', relation_type: 'evidence' },
    ],
  )

  assert.deepEqual(
    model.nodes.map((node) => node.id),
    ['cat-tools', 'paused'],
  )
  assert.equal(model.byId.has('linux'), false)
  assert.equal(model.byId.has('shell'), false)
  assert.equal(model.byId.has('scripts'), false)
  assert.equal(model.byId.has('paused'), true)
  assert.equal(model.edges.length, 0)
})

test('atlas starts with major branches and expands descendants', () => {
  const nodes = [
    { id: 'r1', label: 'Main branch', type: 'branch', super_category: 'Mind' },
    { id: 'r2', label: 'Deeper leaf', type: 'leaf', super_category: 'Mind', parent_id: 'r1' },
    { id: 'leaf', label: 'Detail', type: 'leaf', super_category: 'Mind', parent_id: 'r2' },
  ]
  const model = createAtlasModel(nodes, [
    { source_id: 'r1', target_id: 'r2', relation_type: 'hierarchy' },
    { source_id: 'r2', target_id: 'leaf', relation_type: 'hierarchy' },
  ])
  const initial = initialVisibleIds(model)
  assert.deepEqual([...initial], ['r1'])
  const secondRound = expandVisibleIds(model, initial, 'r1')
  assert.deepEqual([...secondRound].sort(), ['r1', 'r2'])
  assert.deepEqual([...expandVisibleIds(model, secondRound, 'r2')].sort(), ['leaf', 'r1', 'r2'])
})

test('atlas derives a cluster from category ancestry', () => {
  const model = createAtlasModel(
    [
      { id: 'category', label: 'Tools & Craft', type: 'category' },
      { id: 'branch', label: 'Writing', type: 'branch', parent_id: 'category' },
    ],
    [],
  )
  assert.deepEqual(
    model.clusters.get('Tools & Craft')?.map((node) => node.id),
    ['category', 'branch'],
  )
  assert.equal(model.clusters.has('Unassigned'), false)
  assert.equal(model.clusterById.get('branch'), 'Tools & Craft')
})

test('atlas normalizes legacy bracket metadata from display titles', () => {
  const node = { id: 'branch', label: 'Creativity  [legacy metadata]', type: 'branch' }
  assert.equal(nodeTitle(node), 'Creativity')
})

test('atlas preserves meaningful bracketed titles', () => {
  const node = { id: 'branch', label: 'Decision Making [Advanced]', type: 'branch' }
  assert.equal(nodeTitle(node), 'Decision Making [Advanced]')
})

test('branch focus reveals the complete subtree and nothing unrelated', () => {
  const model = createAtlasModel(
    [
      { id: 'r1', label: 'Main [R1]', type: 'branch' },
      { id: 'r2', label: 'Child [R2]', type: 'branch', parent_id: 'r1' },
      { id: 'leaf', label: 'Smallest node', type: 'leaf', parent_id: 'r2' },
      { id: 'other', label: 'Other [R1]', type: 'branch' },
    ],
    [],
  )
  assert.deepEqual([...branchSubtreeIds(model, 'r1')].sort(), ['leaf', 'r1', 'r2'])
})

test('rootBranchFor resolves branch root for nodes at any depth', () => {
  const model = createAtlasModel(
    [
      { id: 'cat-faith', label: 'Faith & Soul', type: 'category' },
      { id: 'pil', label: 'Pillars [R1]', type: 'branch', parent_id: 'cat-faith', super_category: 'cat-faith' },
      { id: 'pil-shahada', label: 'Shahada', type: 'leaf', parent_id: 'pil', super_category: 'cat-faith' },
      { id: 'pil-sub', label: 'Sub-topic', type: 'leaf', parent_id: 'pil-shahada', super_category: 'cat-faith' },
      {
        id: 'r1-sunni',
        label: 'Sunni Scholar Khutbah [R1]',
        type: 'branch',
        parent_id: 'cat-faith',
        super_category: 'cat-faith',
      },
    ],
    [],
  )

  assert.equal(rootBranchFor(model, 'pil')?.id, 'pil')
  assert.equal(rootBranchFor(model, 'pil-shahada')?.id, 'pil')
  assert.equal(rootBranchFor(model, 'pil-sub')?.id, 'pil')
  assert.equal(rootBranchFor(model, 'r1-sunni')?.id, 'r1-sunni')
})

test('branchConstellations isolates separate branch constellations within the same category', () => {
  const model = createAtlasModel(
    [
      { id: 'cat-faith', label: 'Faith & Soul', type: 'category' },
      { id: 'pil', label: 'Pillars [R1]', type: 'branch', parent_id: 'cat-faith', super_category: 'cat-faith' },
      { id: 'pil-shahada', label: 'Shahada', type: 'leaf', parent_id: 'pil', super_category: 'cat-faith' },
      { id: 'pil-salah', label: 'Salah', type: 'leaf', parent_id: 'pil', super_category: 'cat-faith' },
      {
        id: 'r1-sunni',
        label: 'Sunni Scholar Khutbah [R1]',
        type: 'branch',
        parent_id: 'cat-faith',
        super_category: 'cat-faith',
      },
      {
        id: 'r1-khutbah-leaf',
        label: 'Khutbah Leaf',
        type: 'leaf',
        parent_id: 'r1-sunni',
        super_category: 'cat-faith',
      },
    ],
    [],
  )

  const constellations = branchConstellations(model)
  assert.ok(constellations.has('pil'))
  assert.ok(constellations.has('r1-sunni'))

  const pilNodes = constellations
    .get('pil')!
    .map((n) => n.id)
    .sort()
  assert.deepEqual(pilNodes, ['pil', 'pil-salah', 'pil-shahada'])

  const sunniNodes = constellations
    .get('r1-sunni')!
    .map((n) => n.id)
    .sort()
  assert.deepEqual(sunniNodes, ['r1-khutbah-leaf', 'r1-sunni'])
})

test('depth view reveals branches progressively or every node', () => {
  const model = createAtlasModel(
    [
      { id: 'cat', label: 'Domain', type: 'category', super_category: 'cat-domain' },
      { id: 'b1', label: 'Main branch', type: 'branch', super_category: 'cat-domain', parent_id: 'cat' },
      { id: 'leaf', label: 'Smallest node', type: 'leaf', super_category: 'cat-domain', parent_id: 'b1' },
      { id: 'deep-leaf', label: 'Deep node', type: 'leaf', super_category: 'cat-domain', parent_id: 'leaf' },
    ],
    [],
  )
  assert.deepEqual([...visibleIdsForDepth(model, 'branches')].sort(), ['b1', 'cat'])
  assert.deepEqual([...visibleIdsForDepth(model, 'core')].sort(), ['b1', 'cat', 'leaf'])
  assert.equal(visibleIdsForDepth(model, 'all').size, 4)
})

test('nodeTypeBadge returns clean domain, branch, and topic labels', () => {
  assert.equal(nodeTypeBadge({ id: 'cat', label: 'Faith', type: 'category' }), 'Domain')
  assert.equal(nodeTypeBadge({ id: 'b1', label: 'Systems', type: 'branch' }), 'Branch')
  assert.equal(nodeTypeBadge({ id: 'l1', label: 'Feedback loops', type: 'leaf' }), 'Topic')
  assert.equal(nodeTypeBadge(undefined), 'Node')
})

test('nodeAncestry resolves full parent path from root to leaf', () => {
  const model = createAtlasModel(
    [
      { id: 'cat', label: 'Domain', type: 'category' },
      { id: 'b1', label: 'Main branch', type: 'branch', parent_id: 'cat' },
      { id: 'sub', label: 'Sub-topic', type: 'leaf', parent_id: 'b1' },
    ],
    [],
  )
  const path = nodeAncestry(model, 'sub')
  assert.deepEqual(
    path.map((n) => n.id),
    ['cat', 'b1', 'sub'],
  )
})

test('toggleSubtree toggles branch expansion and collapse cleanly', () => {
  const model = createAtlasModel(
    [
      { id: 'b1', label: 'Main branch', type: 'branch' },
      { id: 'l1', label: 'Leaf 1', type: 'leaf', parent_id: 'b1' },
      { id: 'l2', label: 'Leaf 2', type: 'leaf', parent_id: 'b1' },
    ],
    [],
  )
  const initial = new Set(['b1'])
  assert.equal(isSubtreeVisible(model, initial, 'b1'), false)
  const expanded = toggleSubtree(model, initial, 'b1')
  assert.deepEqual([...expanded].sort(), ['b1', 'l1', 'l2'])
  assert.equal(isSubtreeVisible(model, expanded, 'b1'), true)
  const collapsed = toggleSubtree(model, expanded, 'b1')
  assert.deepEqual([...collapsed], ['b1'])
})

test('isolatedVisibleIds returns subtree, connected edges, and parent path', () => {
  const model = createAtlasModel(
    [
      { id: 'cat', label: 'Domain', type: 'category' },
      { id: 'b1', label: 'Branch 1', type: 'branch', parent_id: 'cat' },
      { id: 'l1', label: 'Leaf 1', type: 'leaf', parent_id: 'b1' },
      { id: 'b2', label: 'Branch 2', type: 'branch', parent_id: 'cat' },
    ],
    [{ source_id: 'b1', target_id: 'b2', relation_type: 'evidence' }],
  )
  const isolated = isolatedVisibleIds(model, 'b1')
  assert.ok(isolated.has('cat'))
  assert.ok(isolated.has('b1'))
  assert.ok(isolated.has('l1'))
  assert.ok(isolated.has('b2'))
})

test('frontier filter retains matching nodes and their visible ancestry', () => {
  const model = createAtlasModel(
    [
      { id: 'cat', label: 'Domain', type: 'category', frontier_state: 'developing' },
      { id: 'ready', label: 'Ready branch', type: 'branch', parent_id: 'cat', frontier_state: 'deeper-study-ready' },
      { id: 'leaf', label: 'Ready topic', type: 'leaf', parent_id: 'ready', frontier_state: 'deeper-study-ready' },
      { id: 'weak', label: 'Weak branch', type: 'branch', parent_id: 'cat', frontier_state: 'weak' },
    ],
    [],
  )
  const current = new Set(model.nodes.map((node) => node.id))
  assert.deepEqual([...visibleIdsForFrontier(model, current, 'deeper-study-ready')].sort(), ['cat', 'leaf', 'ready'])
  assert.equal(visibleIdsForFrontier(model, current, 'all'), current)
})
