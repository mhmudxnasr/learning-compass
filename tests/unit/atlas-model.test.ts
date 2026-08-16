import assert from 'node:assert/strict'
import test from 'node:test'
import { branchConstellations, branchSubtreeIds, createAtlasModel, expandVisibleIds, initialVisibleIds, nodeRound, nodeTitle, rootBranchFor, visibleIdsForDepth } from '../../client/src/features/atlas/model.ts'

test('atlas model removes dangling and duplicate edges', () => {
  const nodes = [
    { id: 'a', label: 'A', type: 'branch', super_category: 'Mind', round_label: 'R1' },
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
  const model = createAtlasModel([
    { id: 'taste-map', label: "Mahmoud's Taste Map", type: 'root' },
    { id: 'branch', label: 'Writing', type: 'branch', parent_id: 'taste-map' },
  ], [{ source_id: 'taste-map', target_id: 'branch', relation_type: 'hierarchy' }])
  assert.equal(model.byId.has('taste-map'), false)
  assert.deepEqual(model.nodes.map((node) => node.id), ['branch'])
  assert.equal(model.edges.length, 0)
})

test('atlas starts with major R1 branches and expands descendants', () => {
  const nodes = [
    { id: 'r1', label: 'Main branch', type: 'branch', super_category: 'Mind', round_label: 'R1' },
    { id: 'r2', label: 'Deeper branch', type: 'branch', super_category: 'Mind', round_label: 'R2', parent_id: 'r1' },
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
  const model = createAtlasModel([
    { id: 'category', label: 'Tools & Craft', type: 'category' },
    { id: 'branch', label: 'Writing', type: 'branch', parent_id: 'category' },
  ], [])
  assert.deepEqual(model.clusters.get('Tools & Craft')?.map((node) => node.id), ['branch'])
  assert.deepEqual(model.clusters.get('Unassigned')?.map((node) => node.id), ['category'])
})

test('atlas normalizes embedded round labels and display titles', () => {
  const node = { id: 'branch', label: 'Creativity  [LOVE · R1 — new]', type: 'branch' }
  assert.equal(nodeRound(node), 'R1')
  assert.equal(nodeTitle(node), 'Creativity')
})

test('branch focus reveals the complete subtree and nothing unrelated', () => {
  const model = createAtlasModel([
    { id: 'r1', label: 'Main [R1]', type: 'branch' },
    { id: 'r2', label: 'Child [R2]', type: 'branch', parent_id: 'r1' },
    { id: 'leaf', label: 'Smallest node', type: 'leaf', parent_id: 'r2' },
    { id: 'other', label: 'Other [R1]', type: 'branch' },
  ], [])
  assert.deepEqual([...branchSubtreeIds(model, 'r1')].sort(), ['leaf', 'r1', 'r2'])
})

test('rootBranchFor resolves branch root for nodes at any depth', () => {
  const model = createAtlasModel([
    { id: 'cat-faith', label: 'Faith & Soul', type: 'category' },
    { id: 'pil', label: 'Pillars [R1]', type: 'branch', parent_id: 'cat-faith', super_category: 'cat-faith' },
    { id: 'pil-shahada', label: 'Shahada', type: 'leaf', parent_id: 'pil', super_category: 'cat-faith' },
    { id: 'pil-sub', label: 'Sub-topic', type: 'leaf', parent_id: 'pil-shahada', super_category: 'cat-faith' },
    { id: 'r1-sunni', label: 'Sunni Scholar Khutbah [R1]', type: 'branch', parent_id: 'cat-faith', super_category: 'cat-faith' },
  ], [])

  assert.equal(rootBranchFor(model, 'pil')?.id, 'pil')
  assert.equal(rootBranchFor(model, 'pil-shahada')?.id, 'pil')
  assert.equal(rootBranchFor(model, 'pil-sub')?.id, 'pil')
  assert.equal(rootBranchFor(model, 'r1-sunni')?.id, 'r1-sunni')
})

test('branchConstellations isolates separate branch constellations within the same category', () => {
  const model = createAtlasModel([
    { id: 'cat-faith', label: 'Faith & Soul', type: 'category' },
    { id: 'pil', label: 'Pillars [R1]', type: 'branch', parent_id: 'cat-faith', super_category: 'cat-faith' },
    { id: 'pil-shahada', label: 'Shahada', type: 'leaf', parent_id: 'pil', super_category: 'cat-faith' },
    { id: 'pil-salah', label: 'Salah', type: 'leaf', parent_id: 'pil', super_category: 'cat-faith' },
    { id: 'r1-sunni', label: 'Sunni Scholar Khutbah [R1]', type: 'branch', parent_id: 'cat-faith', super_category: 'cat-faith' },
    { id: 'r1-khutbah-leaf', label: 'Khutbah Leaf', type: 'leaf', parent_id: 'r1-sunni', super_category: 'cat-faith' },
  ], [])

  const constellations = branchConstellations(model)
  assert.ok(constellations.has('pil'))
  assert.ok(constellations.has('r1-sunni'))

  const pilNodes = constellations.get('pil')!.map((n) => n.id).sort()
  assert.deepEqual(pilNodes, ['pil', 'pil-salah', 'pil-shahada'])

  const sunniNodes = constellations.get('r1-sunni')!.map((n) => n.id).sort()
  assert.deepEqual(sunniNodes, ['r1-khutbah-leaf', 'r1-sunni'])
})

test('depth view reveals rounds progressively or every node', () => {
  const model = createAtlasModel([
    { id: 'r1', label: 'Main [R1]', type: 'branch', super_category: 'Domain' },
    { id: 'r2', label: 'Child [R2]', type: 'branch', super_category: 'Domain' },
    { id: 'r3', label: 'Deep [R3]', type: 'branch', super_category: 'Domain' },
    { id: 'leaf', label: 'Smallest node', type: 'leaf', super_category: 'Domain' },
  ], [])
  assert.deepEqual([...visibleIdsForDepth(model, 'R1')], ['r1'])
  assert.deepEqual([...visibleIdsForDepth(model, 'R2')].sort(), ['r1', 'r2'])
  assert.deepEqual([...visibleIdsForDepth(model, 'R3')].sort(), ['r1', 'r2', 'r3'])
  assert.equal(visibleIdsForDepth(model, 'all').size, 4)
})

