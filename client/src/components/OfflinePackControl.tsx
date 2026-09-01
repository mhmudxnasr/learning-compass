import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { formatBytes } from '../workspaces/library/types'
import {
  coherentOfflineResources,
  getOfflinePackStatus,
  offlinePackSize,
  offlinePackVersion,
  removeOfflinePack,
  saveOfflinePack,
  type OfflinePackResource,
  type OfflinePackScope,
  type OfflinePackState,
} from '../offlinePacks'

export function OfflinePackControl({
  packId,
  title,
  scope,
  resources,
  compact = false,
}: {
  packId: string
  title: string
  scope: OfflinePackScope
  resources: OfflinePackResource[]
  compact?: boolean
}) {
  const availableResources = useMemo(() => coherentOfflineResources(resources), [resources])
  const version = useMemo(() => offlinePackVersion(availableResources), [availableResources])
  const expectedSize = useMemo(() => offlinePackSize(availableResources), [availableResources])
  const [status, setStatus] = useState<OfflinePackState>({ supported: true, state: 'not-downloaded' })
  const [working, setWorking] = useState<'download' | 'remove' | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    const sequence = ++requestSequence.current
    setStatus({ supported: true, state: 'not-downloaded' })
    if (version)
      void getOfflinePackStatus(packId, version).then((next) => {
        if (sequence === requestSequence.current) setStatus(next)
      })
    return () => {
      requestSequence.current += 1
    }
  }, [packId, version])

  if (!version) {
    return compact ? (
      <span class="offline-pack-unavailable">No verified HTML/PDF pair</span>
    ) : (
      <div class="offline-pack-control is-unavailable">
        <strong>Offline pack unavailable</strong>
        <small>A complete verified HTML/PDF pair is required.</small>
      </div>
    )
  }

  const ready = status.state === 'ready'
  const download = async () => {
    const sequence = ++requestSequence.current
    setWorking('download')
    setStatus((current) => ({ ...current, state: 'downloading' }))
    const next = await saveOfflinePack({ id: packId, title, scope, resources: availableResources, version })
    if (sequence === requestSequence.current) {
      setStatus(next)
      setWorking(null)
    }
  }
  const remove = async () => {
    const sequence = ++requestSequence.current
    setWorking('remove')
    const next = await removeOfflinePack(packId)
    if (sequence === requestSequence.current) {
      setStatus(next)
      setWorking(null)
    }
  }
  const expectedSizeCopy = expectedSize ? formatBytes(expectedSize) : ''
  const stateCopy =
    status.state === 'ready'
      ? `Ready offline${status.sizeBytes ? ` · ${formatBytes(status.sizeBytes)}` : ''}`
      : status.state === 'superseded'
        ? `Superseded · refresh${expectedSizeCopy ? ` ${expectedSizeCopy}` : ''}`
        : status.state === 'partial'
          ? `Partial · some files were evicted${expectedSizeCopy ? ` · full pack ${expectedSizeCopy}` : ''}`
          : status.state === 'storage-full'
            ? `Storage full${expectedSizeCopy ? ` · ${expectedSizeCopy} required` : ''}`
            : status.state === 'downloading'
              ? `Downloading${expectedSizeCopy ? ` ${expectedSizeCopy}` : ''}…`
              : status.state === 'error'
                ? status.error || 'Download failed'
                : `${availableResources.length} files${expectedSizeCopy ? ` · ${expectedSizeCopy}` : ''}`

  const stored = status.stored === true || ['ready', 'partial', 'superseded'].includes(status.state)

  return (
    <div class={`offline-pack-control${compact ? ' is-compact' : ''} state-${status.state}`}>
      <div>
        <strong>{ready ? 'Kept offline' : 'Offline pack'}</strong>
        <small role="status">{stateCopy}</small>
      </div>
      <div class="offline-pack-actions">
        <button
          type="button"
          class="folio-button"
          onClick={download}
          disabled={working !== null || status.supported === false}
        >
          {working === 'download' ? 'Downloading…' : stored ? 'Refresh offline' : 'Keep offline'}
        </button>
        {stored && (
          <button type="button" class="folio-button" onClick={remove} disabled={working !== null}>
            {working === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  )
}
