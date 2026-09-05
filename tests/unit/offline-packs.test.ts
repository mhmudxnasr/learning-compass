import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  coherentOfflineResources,
  offlineDataResource,
  offlinePackVersion,
  offlinePairResources,
} from '../../client/src/offlinePacks.ts'
import { normalizeBookChapters } from '../../src/services/book-projection.ts'
import { offlineArtifactSnapshot } from '../../client/src/workspaces/library/types.ts'

const metadata = (pairId: string, role: 'html' | 'pdf', extra: Record<string, unknown> = {}) => ({
  pair_id: pairId,
  role,
  publication_state: 'ready',
  validation_status: 'passed',
  validation_receipt_sha256: `${pairId}-${role}`,
  ...extra,
})

test('book and source artifact snapshots preserve identity while omitting full receipts', () => {
  const retainedMetadata = metadata('lv-chapter-1', 'html', {
    revision: 'revision-1',
    receipt_sha256: 'signed-receipt-hash',
    chapter_key: 'chapter-1',
    chapter_number: 1,
    source_title: 'Chapter one',
  })
  const artifact = {
    id: 'html-1',
    filename: 'chapter-1.html',
    media_type: 'text/html',
    size_bytes: 120,
    created_at: '2026-09-05',
    metadata: { ...retainedMetadata, validation_receipt: { large: 'body' }, job_id: 'internal-job' },
  }
  const expected = { ...artifact, metadata: retainedMetadata }
  assert.deepEqual(offlineArtifactSnapshot(artifact), expected)
  assert.deepEqual(
    offlineArtifactSnapshot({ ...artifact, metadata: undefined, metadata_json: JSON.stringify(artifact.metadata) }),
    expected,
  )
  assert.equal(offlineArtifactSnapshot(null), null)
  assert.equal(offlineArtifactSnapshot({}), null)
  assert.equal(offlineArtifactSnapshot({ id: 'html-1', metadata_json: '{invalid' })?.metadata.pair_id, undefined)
})

test('offline resources require one exact verified HTML/PDF pair', () => {
  const resources = offlinePairResources(
    { id: 'html-1', size_bytes: 120, metadata: metadata('lv-pair-1', 'html') },
    { id: 'pdf-1', size_bytes: 240, metadata: metadata('lv-pair-1', 'pdf') },
    'source-1',
  )
  assert.deepEqual(
    resources.map((item) => item.role),
    ['html', 'pdf'],
  )
  assert.equal(
    resources.every((item) => item.pairId === 'lv-pair-1'),
    true,
  )
  assert.equal(
    offlinePairResources(
      { id: 'html-1', metadata: metadata('lv-pair-1', 'html') },
      { id: 'pdf-2', metadata: metadata('lv-pair-2', 'pdf') },
    ).length,
    0,
  )
  assert.equal(
    offlinePairResources(
      { id: 'html-1', metadata: metadata('lv-pair-1', 'html', { validation_status: 'pending' }) },
      { id: 'pdf-1', metadata: metadata('lv-pair-1', 'pdf') },
    ).length,
    0,
  )
  assert.equal(
    offlinePairResources(
      { id: 'html-1', size_bytes: 120, metadata: metadata('lv-pair-1', 'pdf') },
      { id: 'pdf-1', size_bytes: 240, metadata: metadata('lv-pair-1', 'html') },
    ).length,
    0,
  )
  assert.equal(
    offlinePairResources(
      { id: 'html-1', size_bytes: 0, metadata: metadata('lv-pair-1', 'html') },
      { id: 'pdf-1', size_bytes: 240, metadata: metadata('lv-pair-1', 'pdf') },
    ).length,
    0,
  )
})

test('metadata-only and partial groups cannot masquerade as offline packs', () => {
  assert.deepEqual(coherentOfflineResources([{ url: '/capture/source-1/record', role: 'data' }]), [])
  assert.deepEqual(
    coherentOfflineResources([
      { url: '/artifacts/html-1/view', role: 'html', pairId: 'lv-pair-1', groupId: 'source-1' },
      { url: '/capture/source-1/record', role: 'data' },
    ]),
    [],
  )
  const complete = coherentOfflineResources([
    { url: '/artifacts/html-1/view', role: 'html', pairId: 'lv-pair-1', groupId: 'source-1' },
    { url: '/artifacts/pdf-1', role: 'pdf', pairId: 'lv-pair-1', groupId: 'source-1' },
    { url: '/capture/source-1/record', role: 'data' },
  ])
  assert.equal(complete.length, 3)
  assert.ok(offlinePackVersion(complete).includes('lv-pair-1'))
  assert.notEqual(
    offlinePackVersion(complete),
    offlinePackVersion(
      complete.map((resource) =>
        resource.role === 'pdf' ? { ...resource, sizeBytes: Number(resource.sizeBytes || 0) + 1 } : resource,
      ),
    ),
  )
  assert.deepEqual(
    coherentOfflineResources([
      ...complete,
      { url: '/artifacts/html-2/view', role: 'html', pairId: 'lv-pair-1', groupId: 'source-1' },
    ]),
    [],
  )
})

test('offline metadata snapshots are compact, exact-size, and revisioned by navigational state', () => {
  const first = offlineDataResource('/capture/source-1/record', 'source-1', {
    offline_snapshot: true,
    item: { id: 'source-1', learning_state: 'queued' },
  })
  const reordered = offlineDataResource('/capture/source-1/record', 'source-1', {
    item: { learning_state: 'queued', id: 'source-1' },
    offline_snapshot: true,
  })
  const updated = offlineDataResource('/capture/source-1/record', 'source-1', {
    offline_snapshot: true,
    item: { id: 'source-1', learning_state: 'in_progress' },
  })
  assert.equal(first.revision, reordered.revision)
  assert.notEqual(first.revision, updated.revision)
  assert.equal(first.sizeBytes, Buffer.byteLength(JSON.stringify(first.snapshot), 'utf8'))
})

test('book chapter projection never combines two paired revisions', () => {
  const chapters = normalizeBookChapters(
    [],
    [
      {
        id: 'old-html',
        created_at: '2026-08-01',
        metadata: metadata('lv-old', 'html', { chapter_key: 'chapter-1', chapter_number: 1 }),
      },
      {
        id: 'old-pdf',
        created_at: '2026-08-01',
        metadata: metadata('lv-old', 'pdf', { chapter_key: 'chapter-1', chapter_number: 1 }),
      },
      {
        id: 'new-html',
        created_at: '2026-08-02',
        metadata: metadata('lv-new', 'html', { chapter_key: 'chapter-1', chapter_number: 1 }),
      },
      {
        id: 'new-pdf',
        created_at: '2026-08-02',
        metadata: metadata('lv-new', 'pdf', { chapter_key: 'chapter-1', chapter_number: 1 }),
      },
    ],
  )
  assert.equal(chapters[0].html?.metadata.pair_id, 'lv-new')
  assert.equal(chapters[0].pdf?.metadata.pair_id, 'lv-new')
})

test('service worker swaps versioned packs only after every response is cached', () => {
  const worker = readFileSync(new URL('../../client/public/sw.js', import.meta.url), 'utf8')
  const control = readFileSync(new URL('../../client/src/components/OfflinePackControl.tsx', import.meta.url), 'utf8')
  const artifacts = readFileSync(new URL('../../src/api/artifacts.ts', import.meta.url), 'utf8')
  const save = worker.slice(
    worker.indexOf('async function saveOfflinePack'),
    worker.indexOf('async function removeOfflinePack'),
  )
  const remove = worker.slice(
    worker.indexOf('async function removeOfflinePack'),
    worker.indexOf('function serializeOfflinePackMutation'),
  )
  assert.match(save, /for \(const resource of validated\.resources\)/)
  assert.ok(save.indexOf('await cache.put(resource.url, response)') < save.indexOf('await writeOfflinePackIndex'))
  assert.ok(save.indexOf('await writeOfflinePackIndex') < save.indexOf('await caches.delete(previous.cacheName)'))
  assert.match(save, /try \{\s*await caches\.delete\(previous\.cacheName\)\s*\} catch/)
  assert.match(save, /await caches\.delete\(cacheName\)/)
  assert.match(
    worker,
    /if \(!pairs\.size\) throw new Error\('Offline packs require at least one complete verified HTML\/PDF pair\.'\)/,
  )
  assert.match(worker, /if \(resource\.snapshot === undefined\) return null/)
  assert.match(worker, /new Response\(JSON\.stringify\(resource\.snapshot\)/)
  assert.match(worker, /state = missing\.length\s*\? 'partial'\s*:\s*expectedVersion.*'superseded'/s)
  assert.match(worker, /if \(version\.length > 250000\)/)
  assert.doesNotMatch(worker, /pack\?\.version[\s\S]{0,100}slice\(0, 12000\)/)
  assert.match(worker, /state, stored: true/)
  assert.match(worker, /serializeOfflinePackMutation/)
  assert.match(worker, /cleanupOrphanOfflinePackCaches/)
  assert.match(worker, /Promise\.allSettled\(\s*names\s*\.filter/)
  assert.match(worker, /matchLatestOfflinePackResource/)
  assert.match(worker, /Number\(right\.sequence \|\| 0\) - Number\(left\.sequence \|\| 0\)/)
  assert.match(worker, /Date\.now\(\).*crypto\.randomUUID\(\)/)
  assert.match(worker, /validated\.resources\.map\(\(\{ snapshot, \.\.\.resource \}\) => resource\)/)
  assert.match(worker, /serverPairId !== resource\.pairId/)
  assert.match(worker, /serverRole !== resource\.role/)
  assert.match(worker, /publicationState !== 'ready'/)
  assert.match(worker, /validationStatus !== 'passed'/)
  assert.match(artifacts, /headers\['x-learning-compass-pair-id'\]/)
  assert.match(artifacts, /headers\['x-learning-compass-artifact-id'\]/)
  assert.match(artifacts, /headers\['x-learning-compass-size-bytes'\]/)
  assert.match(artifacts, /headers\['x-learning-compass-publication-state'\]/)
  assert.match(artifacts, /headers\['x-learning-compass-validation-status'\]/)
  assert.match(control, /\['ready', 'partial', 'superseded'\]\.includes\(status\.state\)/)
  assert.match(control, /Refresh offline/)
  assert.match(control, /Remove/)
  assert.match(worker, /caches\.match\(request\)/)
  assert.ok(
    remove.indexOf('await writeOfflinePackIndex(nextIndex)') <
      remove.indexOf('await caches.delete(manifest.cacheName)'),
  )
})
