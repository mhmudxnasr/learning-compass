export type OfflinePackScope = 'queue-source' | 'source' | 'book-chapter' | 'book' | 'thread' | 'level'

export type OfflinePackResource = {
  url: string
  role: 'html' | 'pdf' | 'data'
  artifactId?: string
  pairId?: string
  revision?: string
  groupId?: string
  sizeBytes?: number
  /** Minimal already-loaded JSON cached at `url`; never a full dossier. */
  snapshot?: unknown
}

export type OfflinePackArtifact = {
  id?: string | null
  size_bytes?: number | null
  metadata?: Record<string, unknown> | null
  metadata_json?: string | null
}

export type OfflinePackRequest = {
  id: string
  title: string
  scope: OfflinePackScope
  resources: OfflinePackResource[]
  version: string
}

export type OfflinePackState = {
  supported: boolean
  state:
    'unavailable' | 'not-downloaded' | 'downloading' | 'ready' | 'partial' | 'superseded' | 'storage-full' | 'error'
  packId?: string
  title?: string
  version?: string
  expectedVersion?: string
  sizeBytes?: number
  resourceCount?: number
  missing?: string[]
  quota?: number | null
  usage?: number | null
  stored?: boolean
  error?: string
}

type OfflinePackMessage =
  | { action: 'offline-pack:status'; packId: string; expectedVersion: string }
  | { action: 'offline-pack:save'; pack: OfflinePackRequest }
  | { action: 'offline-pack:remove'; packId: string }

const absoluteSameOriginUrl = (value: string) => {
  if (typeof window === 'undefined') return value
  const url = new URL(value, window.location.origin)
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : ''
}

export function coherentOfflineResources(resources: OfflinePackResource[]) {
  const normalized = resources
    .map((resource) => ({ ...resource, url: absoluteSameOriginUrl(resource.url) }))
    .filter((resource) => resource.url)
  const unique = [...new Map(normalized.map((resource) => [resource.url, resource])).values()]
  const groups = new Map<string, OfflinePackResource[]>()
  for (const resource of unique.filter((item) => item.role !== 'data')) {
    const key = String(resource.groupId || resource.pairId || '').trim()
    if (!key || !resource.pairId) continue
    groups.set(key, [...(groups.get(key) || []), resource])
  }
  const acceptedGroups = new Set(
    [...groups.entries()]
      .filter(
        ([, items]) =>
          items.length === 2 &&
          items.filter((item) => item.role === 'html').length === 1 &&
          items.filter((item) => item.role === 'pdf').length === 1 &&
          new Set(items.map((item) => item.pairId)).size === 1,
      )
      .map(([key]) => key),
  )
  if (!acceptedGroups.size) return []
  return unique.filter(
    (resource) =>
      resource.role === 'data' || acceptedGroups.has(String(resource.groupId || resource.pairId || '').trim()),
  )
}

function artifactMetadata(artifact?: OfflinePackArtifact | null) {
  if (artifact?.metadata && typeof artifact.metadata === 'object') return artifact.metadata
  try {
    const parsed = JSON.parse(String(artifact?.metadata_json || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Build resources only when both artifacts identify the same verified current pair. */
export function offlinePairResources(
  html?: OfflinePackArtifact | null,
  pdf?: OfflinePackArtifact | null,
  groupId?: string,
): OfflinePackResource[] {
  const htmlMetadata = artifactMetadata(html)
  const pdfMetadata = artifactMetadata(pdf)
  const htmlPair = String(htmlMetadata.pair_id || '').trim()
  const pdfPair = String(pdfMetadata.pair_id || '').trim()
  if (!html?.id || !pdf?.id || !htmlPair || htmlPair !== pdfPair) return []
  if (
    String(htmlMetadata.role || '')
      .trim()
      .toLowerCase() !== 'html' ||
    String(pdfMetadata.role || '')
      .trim()
      .toLowerCase() !== 'pdf'
  )
    return []
  const publicationStates = [htmlMetadata.publication_state, pdfMetadata.publication_state].map((state) =>
    String(state || '')
      .trim()
      .toLowerCase(),
  )
  const validationStates = [htmlMetadata.validation_status, pdfMetadata.validation_status].map((state) =>
    String(state || '')
      .trim()
      .toLowerCase(),
  )
  if (publicationStates.some((state) => state !== 'ready') || validationStates.some((state) => state !== 'passed'))
    return []
  const htmlSize = Number(html.size_bytes || 0)
  const pdfSize = Number(pdf.size_bytes || 0)
  if (!Number.isSafeInteger(htmlSize) || htmlSize < 1 || !Number.isSafeInteger(pdfSize) || pdfSize < 1) return []
  const htmlRevision = String(
    htmlMetadata.revision || htmlMetadata.receipt_sha256 || htmlMetadata.validation_receipt_sha256 || '',
  ).trim()
  const pdfRevision = String(
    pdfMetadata.revision || pdfMetadata.receipt_sha256 || pdfMetadata.validation_receipt_sha256 || '',
  ).trim()
  const group = String(groupId || htmlMetadata.chapter_key || htmlPair).trim()
  return [
    {
      url: `/artifacts/${encodeURIComponent(String(html.id))}/view`,
      role: 'html',
      artifactId: String(html.id),
      pairId: htmlPair,
      groupId: group,
      revision: htmlRevision,
      sizeBytes: htmlSize,
    },
    {
      url: `/artifacts/${encodeURIComponent(String(pdf.id))}`,
      role: 'pdf',
      artifactId: String(pdf.id),
      pairId: pdfPair,
      groupId: group,
      revision: pdfRevision,
      sizeBytes: pdfSize,
    },
  ]
}

export function offlinePackVersion(resources: OfflinePackResource[]) {
  return coherentOfflineResources(resources)
    .map((resource) =>
      [
        resource.url,
        resource.role,
        resource.artifactId || '',
        resource.pairId || '',
        resource.revision || '',
        Number(resource.sizeBytes || 0),
      ].join(':'),
    )
    .sort()
    .join('|')
}

export function offlinePackSize(resources: OfflinePackResource[]) {
  return coherentOfflineResources(resources).reduce(
    (total, resource) => total + Math.max(0, Number(resource.sizeBytes || 0)),
    0,
  )
}

const stableSnapshotJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSnapshotJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSnapshotJson(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

const snapshotDigest = (text: string) => {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

export function offlineDataResource(url: string, groupId: string, snapshot: unknown): OfflinePackResource {
  const serialized = stableSnapshotJson(snapshot)
  return {
    url,
    role: 'data',
    groupId,
    revision: `snapshot-fnv1a64:${snapshotDigest(serialized)}`,
    sizeBytes: new TextEncoder().encode(serialized).byteLength,
    // Preserve the canonical serialization whose digest and exact byte count
    // identify this metadata resource when the service worker stores it.
    snapshot: JSON.parse(serialized),
  }
}

async function serviceWorkerRequest(message: OfflinePackMessage): Promise<OfflinePackState> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')
  ) {
    return { supported: false, state: 'unavailable' }
  }
  try {
    const registration = await navigator.serviceWorker.ready
    const worker = navigator.serviceWorker.controller || registration.active
    if (!worker) return { supported: false, state: 'unavailable' }
    return await new Promise<OfflinePackState>((resolve) => {
      const channel = new MessageChannel()
      const timeoutMs = message.action === 'offline-pack:save' ? 300000 : 30000
      const timeout = window.setTimeout(
        () => resolve({ supported: true, state: 'error', error: 'Offline storage did not respond.' }),
        timeoutMs,
      )
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout)
        resolve(event.data as OfflinePackState)
      }
      worker.postMessage(message, [channel.port2])
    })
  } catch (error) {
    return {
      supported: true,
      state: 'error',
      error: error instanceof Error ? error.message : 'Offline storage is unavailable.',
    }
  }
}

export function getOfflinePackStatus(packId: string, expectedVersion: string) {
  return serviceWorkerRequest({ action: 'offline-pack:status', packId, expectedVersion })
}

export function saveOfflinePack(
  pack: Omit<OfflinePackRequest, 'resources' | 'version'> & { resources: OfflinePackResource[]; version?: string },
) {
  const resources = coherentOfflineResources(pack.resources)
  const request: OfflinePackRequest = { ...pack, resources, version: pack.version || offlinePackVersion(resources) }
  return serviceWorkerRequest({ action: 'offline-pack:save', pack: request })
}

export function removeOfflinePack(packId: string) {
  return serviceWorkerRequest({ action: 'offline-pack:remove', packId })
}
