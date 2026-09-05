import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api, ApiError } from '../api'

type HealthStatus = 'verified' | 'restricted' | 'unavailable' | 'unknown' | 'invalid'

type HealthRow = {
  status: HealthStatus
  checked_url: string
  last_checked_at?: string
  checked_at?: string
  http_status?: number | null
  final_url?: string | null
  error_code?: string | null
}

type HealthLedger = {
  source: { id: string; title: string; source_url: string; status: string }
  health: HealthRow | null
  attempts: Array<HealthRow & { id: string; purpose: 'current' | 'replacement' }>
  replacements: Array<{ id: string; previous_url: string; source_url: string; replaced_at: string }>
}

const statusCopy: Record<HealthStatus, { label: string; detail: string }> = {
  verified: { label: 'Verified', detail: 'The original source responded successfully.' },
  restricted: {
    label: 'Restricted',
    detail: 'The source may require sign-in or be blocking automated checks. This is not a dead-link verdict.',
  },
  unavailable: { label: 'Unavailable', detail: 'The source returned a confirmed not-found response.' },
  unknown: { label: 'Unknown', detail: 'The check was inconclusive. The URL has not been rewritten.' },
  invalid: {
    label: 'Invalid URL',
    detail: 'The address is malformed, private, or redirected outside the safe public boundary.',
  },
}

const isHealthStatus = (value: unknown): value is HealthStatus => typeof value === 'string' && value in statusCopy

const displayTime = (value?: string | null) => {
  if (!value) return 'not checked'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}

export function SourceHealthControl({
  sourceId,
  sourceUrl,
  compact = false,
  disclosure = false,
  companionHref,
  onReplaced,
}: {
  sourceId: string
  sourceUrl?: string | null
  compact?: boolean
  disclosure?: boolean
  companionHref?: string | null
  onReplaced?: (sourceUrl: string) => void
}) {
  const suppliedUrl = String(sourceUrl || '')
  const supportsHealth = /^https?:\/\//i.test(suppliedUrl)
  const [ledger, setLedger] = useState<HealthLedger | null>(null)
  const [currentUrl, setCurrentUrl] = useState(suppliedUrl)
  const [working, setWorking] = useState<'check' | 'verify' | 'replace' | null>(null)
  const [error, setError] = useState('')
  const [candidate, setCandidate] = useState('')
  const [verifiedCandidate, setVerifiedCandidate] = useState<{
    source_url: string
    expected_source_url: string
    accepted: boolean
    status: HealthStatus
  } | null>(null)
  const activeSourceId = useRef(sourceId)
  const sourceVersion = useRef(0)
  const reloadVersion = useRef(0)
  activeSourceId.current = sourceId
  const operationIsCurrent = useCallback(
    (requestedSourceId: string, version: number) =>
      activeSourceId.current === requestedSourceId && sourceVersion.current === version,
    [],
  )

  const reload = useCallback(async () => {
    const requestedSourceId = sourceId
    const sourceGeneration = sourceVersion.current
    const version = ++reloadVersion.current
    try {
      const next = await api<HealthLedger>(`/recommendations/${encodeURIComponent(sourceId)}/source-health`)
      if (version !== reloadVersion.current || !operationIsCurrent(requestedSourceId, sourceGeneration)) return
      setLedger(next)
      setCurrentUrl((current) => next.source.source_url || current)
    } catch (reason) {
      if (version !== reloadVersion.current || !operationIsCurrent(requestedSourceId, sourceGeneration)) return
      setError(reason instanceof Error ? reason.message : 'Source health could not be loaded.')
    }
  }, [operationIsCurrent, sourceId])

  useEffect(() => {
    reloadVersion.current += 1
    setCurrentUrl(suppliedUrl)
    setLedger(null)
    setError('')
    setWorking(null)
    setCandidate('')
    setVerifiedCandidate(null)
    if (supportsHealth) void reload()
    return () => {
      sourceVersion.current += 1
      reloadVersion.current += 1
    }
  }, [reload, suppliedUrl, supportsHealth])

  const check = async () => {
    const requestedSourceId = sourceId
    const version = sourceVersion.current
    setWorking('check')
    setError('')
    try {
      await api(`/recommendations/${encodeURIComponent(sourceId)}/source-health/check`, {
        method: 'POST',
        body: JSON.stringify({ expected_source_url: currentUrl }),
        queueOnNetworkError: false,
        timeoutMs: 15000,
      })
      if (!operationIsCurrent(requestedSourceId, version)) return
      await reload()
    } catch (reason) {
      if (!operationIsCurrent(requestedSourceId, version)) return
      setError(reason instanceof Error ? reason.message : 'Source check failed.')
    } finally {
      if (operationIsCurrent(requestedSourceId, version)) setWorking(null)
    }
  }

  const verifyCandidate = async (event: Event) => {
    event.preventDefault()
    const source_url = candidate.trim()
    if (!source_url) return
    const requestedSourceId = sourceId
    const version = sourceVersion.current
    setWorking('verify')
    setError('')
    setVerifiedCandidate(null)
    try {
      const result = await api<any>(`/recommendations/${encodeURIComponent(sourceId)}/source-url/verify`, {
        method: 'POST',
        body: JSON.stringify({ source_url, expected_source_url: currentUrl }),
        queueOnNetworkError: false,
        timeoutMs: 15000,
      })
      if (!operationIsCurrent(requestedSourceId, version)) return
      if (!isHealthStatus(result?.verification?.status))
        throw new Error('Candidate verification returned an invalid status.')
      setVerifiedCandidate({
        source_url: result.source_url,
        expected_source_url: result.current_source_url,
        accepted: Boolean(result.accepted_for_replacement),
        status: result.verification.status,
      })
    } catch (reason) {
      if (!operationIsCurrent(requestedSourceId, version)) return
      setError(reason instanceof Error ? reason.message : 'Candidate verification failed.')
    } finally {
      if (operationIsCurrent(requestedSourceId, version)) setWorking(null)
    }
  }

  const replace = async () => {
    if (!verifiedCandidate?.accepted) return
    const requestedSourceId = sourceId
    const version = sourceVersion.current
    setWorking('replace')
    setError('')
    try {
      const result = await api<any>(`/recommendations/${encodeURIComponent(sourceId)}/source-url`, {
        method: 'PATCH',
        body: JSON.stringify({
          source_url: verifiedCandidate.source_url,
          expected_source_url: verifiedCandidate.expected_source_url,
        }),
        queueOnNetworkError: false,
        timeoutMs: 15000,
      })
      if (!operationIsCurrent(requestedSourceId, version)) return
      setCandidate('')
      setVerifiedCandidate(null)
      setCurrentUrl(result.source_url)
      onReplaced?.(result.source_url)
      await reload()
    } catch (reason) {
      if (!operationIsCurrent(requestedSourceId, version)) return
      const detail =
        reason instanceof ApiError && reason.body?.verification?.status
          ? `Replacement blocked: ${statusCopy[reason.body.verification.status as HealthStatus]?.detail || reason.message}`
          : reason instanceof Error
            ? reason.message
            : 'Source replacement failed.'
      setError(detail)
    } finally {
      if (operationIsCurrent(requestedSourceId, version)) setWorking(null)
    }
  }

  const health = ledger?.health || null
  const state = health?.status || 'unknown'
  const copy = statusCopy[state]
  const problem = health && health.status !== 'verified'

  if (!supportsHealth) return null

  if (compact) {
    return (
      <div class={`source-health-control is-compact state-${health?.status || 'unchecked'}`}>
        <span class="source-health-state">
          <i aria-hidden="true" />
          <span>{health ? copy.label : 'Not checked'}</span>
          {health?.last_checked_at && <small>{displayTime(health.last_checked_at)}</small>}
        </span>
        {problem && companionHref && (
          <a class="folio-button" href={companionHref} target="_blank" rel="noreferrer">
            Open verified companion
          </a>
        )}
        <button type="button" class="folio-button" onClick={check} disabled={working !== null || !currentUrl}>
          {working === 'check' ? 'Checking…' : 'Check source'}
        </button>
        {error && (
          <small class="source-health-error" role="alert">
            {error}
          </small>
        )}
      </div>
    )
  }

  const content = (
    <section class={`source-health-control state-${health?.status || 'unchecked'}`} aria-label="Original source health">
      <div class="source-health-heading">
        <div>
          <span class="folio-object-kicker">Original source health</span>
          <h3>{health ? copy.label : 'Not checked'}</h3>
          <p>
            {health
              ? copy.detail
              : 'Run an explicit check to record whether the current original can still be reached.'}
          </p>
        </div>
        <button type="button" class="folio-button" onClick={check} disabled={working !== null || !currentUrl}>
          {working === 'check' ? 'Checking…' : 'Check current URL'}
        </button>
      </div>
      {health && (
        <dl class="source-health-facts">
          <div>
            <dt>Last checked</dt>
            <dd>{displayTime(health.last_checked_at)}</dd>
          </div>
          <div>
            <dt>HTTP</dt>
            <dd>{health.http_status || 'No conclusive response'}</dd>
          </div>
          <div>
            <dt>Final URL</dt>
            <dd>{health.final_url || health.checked_url}</dd>
          </div>
        </dl>
      )}
      {problem && companionHref && (
        <p class="source-health-fallback">
          <a class="folio-button folio-button-primary" href={companionHref} target="_blank" rel="noreferrer">
            Open verified companion
          </a>
          <span>The original remains unchanged.</span>
        </p>
      )}
      <details class="source-health-repair">
        <summary>Verify a replacement URL</summary>
        <form onSubmit={verifyCandidate}>
          <input
            type="url"
            value={candidate}
            onInput={(event) => {
              setCandidate((event.currentTarget as HTMLInputElement).value)
              setVerifiedCandidate(null)
            }}
            placeholder="https://…"
            aria-label="Candidate replacement URL"
            required
          />
          <button class="folio-button" disabled={working !== null}>
            {working === 'verify' ? 'Verifying…' : 'Verify candidate'}
          </button>
        </form>
        {verifiedCandidate && (
          <div class={`source-health-candidate state-${verifiedCandidate.status}`}>
            <p>
              <strong>{statusCopy[verifiedCandidate.status].label}</strong> ·{' '}
              {statusCopy[verifiedCandidate.status].detail}
            </p>
            {verifiedCandidate.accepted && (
              <button
                type="button"
                class="folio-button folio-button-primary"
                onClick={replace}
                disabled={working !== null}
              >
                {working === 'replace' ? 'Replacing…' : 'Use this verified URL'}
              </button>
            )}
          </div>
        )}
      </details>
      {ledger?.attempts.length || ledger?.replacements.length ? (
        <details class="source-health-history">
          <summary>Check and replacement history</summary>
          <ol>
            {(ledger?.attempts || []).map((attempt) => (
              <li key={attempt.id}>
                <strong>{statusCopy[attempt.status].label}</strong>
                <span>
                  {attempt.purpose} · {displayTime(attempt.checked_at)}
                  {attempt.http_status ? ` · HTTP ${attempt.http_status}` : ''}
                </span>
              </li>
            ))}
            {(ledger?.replacements || []).map((replacement) => (
              <li key={replacement.id}>
                <strong>URL replaced</strong>
                <span>{displayTime(replacement.replaced_at)} · previous URL preserved</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {error && (
        <p class="source-health-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
  return disclosure ? (
    <details class="source-health-disclosure" open={Boolean(problem || error)}>
      <summary>Source status: {error ? 'Could not check' : health ? copy.label : 'Not checked'}</summary>
      {content}
    </details>
  ) : (
    content
  )
}
